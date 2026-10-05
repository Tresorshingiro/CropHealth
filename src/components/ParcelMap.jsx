import { useCallback, useEffect, useRef, useState } from 'react'
import Basemap from '@arcgis/core/Basemap.js'
import Graphic from '@arcgis/core/Graphic.js'
import ArcGISMap from '@arcgis/core/Map.js'
import { version as sdkVersion } from '@arcgis/core/kernel.js'
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js'
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js'
import GroupLayer from '@arcgis/core/layers/GroupLayer.js'
import ImageryLayer from '@arcgis/core/layers/ImageryLayer.js'
import TileLayer from '@arcgis/core/layers/TileLayer.js'
import MapView from '@arcgis/core/views/MapView.js'
import ScaleBar from '@arcgis/core/widgets/ScaleBar.js'
import {
  BASEMAPS,
  LAIS_LAYER_URLS,
  LAIS_MIN_SCALE,
  OUTLINES,
  SENTINEL_LAYERS,
  SENTINEL_URL,
} from '../lib/mapLayers.js'
import { useTheme } from '../theme/ThemeContext.jsx'
import LayersPanel from './map/LayersPanel.jsx'
import MapLegend from './map/MapLegend.jsx'

const RWANDA_EXTENT = { xmin: 28.84, ymin: -2.86, xmax: 30.91, ymax: -1.04, spatialReference: { wkid: 4326 } }

// The Sentinel-2 layer is drawn solid by default: blended with the photo, both were hard to read.
const DEFAULT_SETTINGS = { basemap: 'satellite', sentinel: 'none', opacity: 1, analysed: true, land: true }

const PARCEL_SYMBOL = {
  type: 'simple-fill',
  color: [...OUTLINES.analysed.rgb, 0.08],
  outline: { color: [...OUTLINES.analysed.rgb, 1], width: 1.5 },
}
const SELECTED_SYMBOL = {
  type: 'simple-fill',
  color: [...OUTLINES.selected.rgb, 0.18],
  outline: { color: [...OUTLINES.selected.rgb, 1], width: 2.5 },
}
const LAND_RENDERER = {
  type: 'simple',
  symbol: { type: 'simple-fill', color: [0, 0, 0, 0], outline: { color: [...OUTLINES.land.rgb, 0.7], width: 0.6 } },
}

function toGraphic(parcel, symbol) {
  return new Graphic({
    geometry: { type: 'polygon', rings: parcel.rings, spatialReference: { wkid: 4326 } },
    attributes: { upi: parcel.upi },
    symbol,
  })
}

function makeBasemap(id, theme) {
  const choice = BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0]
  return new Basemap({
    baseLayers: choice.base(theme).map((url) => new TileLayer({ url })),
    referenceLayers: choice.reference(theme).map((url) => new TileLayer({ url })),
  })
}

const Icon = ({ d }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const ICONS = {
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  enter: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  exit: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
}

const controlButton =
  'grid h-9 w-9 place-items-center text-ink-2 transition hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'

/**
 * The parcel map: base map, an optional Sentinel-2 layer, land parcel
 * outlines, the analysed parcels and the selected one. `controlsBottom` is a
 * CSS length that keeps the legend clear of the attribution line.
 */
export default function ParcelMap({ parcels, selected, onSelect, controlsBottom = '2.25rem' }) {
  const rootRef = useRef(null)
  const containerRef = useRef(null)
  const layersRef = useRef(null)
  const mapRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const selectedRef = useRef(selected)
  const fittedRef = useRef(false)
  const { theme } = useTheme()

  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [layersOpen, setLayersOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const update = useCallback((patch) => {
    setSettings((current) => ({ ...current, ...patch }))
    // A colour scale means nothing without its key: show it with the layer.
    if (SENTINEL_LAYERS.find((layer) => layer.id === patch.sentinel)?.scale) setLegendOpen(true)
  }, [])

  useEffect(() => {
    onSelectRef.current = onSelect
    selectedRef.current = selected
  }, [onSelect, selected])

  // The SDK's own pieces (attribution, scale bar) take their look from this
  // stylesheet, served from the same CDN the SDK loads its assets from.
  useEffect(() => {
    let link = document.getElementById('esri-theme')
    if (!link) {
      link = document.createElement('link')
      link.id = 'esri-theme'
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    link.href = `https://js.arcgis.com/${sdkVersion}/esri/themes/${theme}/main.css`
  }, [theme])

  useEffect(() => {
    const imagery = new ImageryLayer({ url: SENTINEL_URL, visible: false, format: 'jpgpng' })
    // Hidden below LAIS_MIN_SCALE, so the services are only asked for parcels
    // once the view is close enough to tell fields apart.
    const landLayer = new GroupLayer({
      layers: LAIS_LAYER_URLS.map(
        (url) =>
          new FeatureLayer({
            url,
            minScale: LAIS_MIN_SCALE,
            outFields: ['upi'],
            renderer: LAND_RENDERER,
            popupEnabled: false,
            legendEnabled: false,
          }),
      ),
    })
    const parcelLayer = new GraphicsLayer()
    const selectedLayer = new GraphicsLayer()
    const view = new MapView({
      container: containerRef.current,
      map: new ArcGISMap({ layers: [imagery, landLayer, parcelLayer, selectedLayer] }),
      extent: RWANDA_EXTENT,
      popupEnabled: false,
    })
    // Zoom and home are drawn below in the app's own style.
    view.ui.remove('zoom')
    view.ui.add(new ScaleBar({ view, unit: 'metric' }), 'bottom-right')

    const click = view.on('click', async (event) => {
      try {
        const hit = await view.hitTest(event, { include: [parcelLayer, selectedLayer] })
        const upi = hit.results.find((result) => result.graphic?.attributes?.upi)?.graphic.attributes.upi
        if (upi) onSelectRef.current(upi)
      } catch {
        // The view was torn down mid-click: nothing to select.
      }
    })

    mapRef.current = { view, imagery, landLayer, parcelLayer, selectedLayer }
    return () => {
      click.remove()
      view.destroy()
      mapRef.current = null
      // A rebuilt view starts at the country extent again, so it may fit again.
      fittedRef.current = false
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map) map.view.map.basemap = makeBasemap(settings.basemap, theme)
  }, [settings.basemap, theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const layer = SENTINEL_LAYERS.find((item) => item.id === settings.sentinel)
    if (layer?.functionName) map.imagery.rasterFunction = { functionName: layer.functionName }
    map.imagery.visible = Boolean(layer?.functionName)
    map.imagery.opacity = settings.opacity
  }, [settings.sentinel, settings.opacity])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.parcelLayer.visible = settings.analysed
    map.landLayer.visible = settings.land
  }, [settings.analysed, settings.land])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const graphics = parcels.filter((p) => p.rings).map((p) => toGraphic(p, PARCEL_SYMBOL))
    map.parcelLayer.removeAll()
    map.parcelLayer.addMany(graphics)
    // The first time the parcels arrive with nothing selected, frame them:
    // at the whole-country view their outlines are too small to see.
    if (graphics.length && !fittedRef.current && !selectedRef.current) {
      fittedRef.current = true
      map.view.when(() => map.view.goTo(graphics)).catch(() => {})
    }
  }, [parcels])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.selectedLayer.removeAll()
    if (!selected?.rings) return
    const graphic = toGraphic(selected, SELECTED_SYMBOL)
    map.selectedLayer.add(graphic)
    // goTo rejects when the user moves the map mid-animation or the view is
    // destroyed; neither is an error worth showing.
    map.view
      .when(() => map.view.goTo(graphic.geometry.extent.expand(3)))
      .catch(() => {})
  }, [selected])

  // The layers panel closes on Escape and on a press anywhere outside it.
  useEffect(() => {
    if (!layersOpen) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setLayersOpen(false)
    }
    const onPointer = (event) => {
      if (!layersRef.current?.contains(event.target)) setLayersOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [layersOpen])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const zoomBy = (delta) => {
    const view = mapRef.current?.view
    if (view?.ready) view.goTo({ zoom: view.zoom + delta }).catch(() => {})
  }

  // Home is the selected parcel, else every analysed parcel, else Rwanda.
  const goHome = () => {
    const map = mapRef.current
    if (!map?.view.ready) return
    const chosen = map.selectedLayer.graphics.getItemAt(0)
    const all = map.parcelLayer.graphics.toArray()
    const target = chosen ? chosen.geometry.extent.expand(3) : all.length ? all : RWANDA_EXTENT
    map.view.goTo(target).catch(() => {})
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else rootRef.current?.requestFullscreen?.().catch(() => {})
  }

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden rounded-[inherit] bg-page">
      <div ref={containerRef} className="absolute inset-0" />

      <div className="glass absolute left-3 top-3 z-10 flex flex-col overflow-hidden rounded-2xl shadow-float">
        <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in" className={`${controlButton} text-lg`}>
          +
        </button>
        <span aria-hidden="true" className="h-px bg-line" />
        <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out" className={`${controlButton} text-lg`}>
          −
        </button>
        <span aria-hidden="true" className="h-px bg-line" />
        <button type="button" onClick={goHome} aria-label="Home" title={selected ? 'Back to the selected parcel' : 'Back to all parcels'} className={controlButton}>
          <Icon d={ICONS.home} />
        </button>
      </div>

      {/* Spans the map's height so the panel can scroll within it on a short map. */}
      <div ref={layersRef} className="pointer-events-none absolute inset-y-3 right-3 z-20 flex items-start gap-2">
        {layersOpen && (
          <div
            id="map-layers"
            role="dialog"
            aria-label="Map layers"
            className="glass pointer-events-auto max-h-full w-64 max-w-[calc(100vw-6rem)] overflow-y-auto rounded-2xl p-2 shadow-float"
          >
            <LayersPanel settings={settings} onChange={update} />
          </div>
        )}
        <div className="glass pointer-events-auto flex flex-col overflow-hidden rounded-2xl shadow-float">
          <button
            type="button"
            onClick={() => setLayersOpen((open) => !open)}
            aria-label="Map layers"
            aria-expanded={layersOpen}
            aria-controls="map-layers"
            title="Map layers"
            className={`${controlButton} ${layersOpen ? 'bg-raised text-ink' : ''}`}
          >
            <Icon d={ICONS.layers} />
          </button>
          {document.fullscreenEnabled && (
            <>
              <span aria-hidden="true" className="h-px bg-line" />
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
                title={fullscreen ? 'Exit full screen' : 'Full screen'}
                className={controlButton}
              >
                <Icon d={fullscreen ? ICONS.exit : ICONS.enter} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Kept clear of the attribution line along the bottom. */}
      <div
        className="pointer-events-none absolute left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-end transition-[bottom] duration-300 motion-reduce:transition-none"
        style={{ bottom: controlsBottom }}
      >
        <MapLegend
          open={legendOpen}
          onToggle={() => setLegendOpen((open) => !open)}
          settings={settings}
          hasSelected={Boolean(selected?.rings)}
        />
      </div>
    </div>
  )
}
