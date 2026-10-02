import { useEffect, useRef, useState } from 'react'
import Basemap from '@arcgis/core/Basemap.js'
import Graphic from '@arcgis/core/Graphic.js'
import ArcGISMap from '@arcgis/core/Map.js'
import { version as sdkVersion } from '@arcgis/core/kernel.js'
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js'
import ImageryLayer from '@arcgis/core/layers/ImageryLayer.js'
import TileLayer from '@arcgis/core/layers/TileLayer.js'
import MapView from '@arcgis/core/views/MapView.js'
import { useTheme } from '../theme/ThemeContext.jsx'

// Public services: no token, loaded by the browser directly.
const SENTINEL_URL = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer'
const WORLD_IMAGERY_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'

// "Satellite" is the high-resolution basemap alone: the sharpest view of where
// a parcel is, though the picture can be years old. The other three are recent
// Sentinel-2 renderings (raster function names as the image service publishes
// them), drawn solid over it; blending them with the basemap made both hard to read.
const MODES = [
  { id: 'satellite', label: 'Satellite', title: 'High-resolution satellite image', functionName: null },
  { id: 'recent', label: 'Recent', title: 'Latest Sentinel-2 image, natural colour', functionName: 'Natural Color with DRA' },
  { id: 'ndvi', label: 'NDVI', title: 'Sentinel-2 NDVI', functionName: 'NDVI Colormap' },
  { id: 'ndmi', label: 'NDMI', title: 'Sentinel-2 NDMI', functionName: 'NDMI Colorized' },
]
const FIRST_SENTINEL = MODES.find((m) => m.functionName).functionName

const RWANDA_EXTENT = { xmin: 28.84, ymin: -2.86, xmax: 30.91, ymax: -1.04, spatialReference: { wkid: 4326 } }

// White outlines and a cyan highlight stay visible over every imagery mode.
const PARCEL_SYMBOL = {
  type: 'simple-fill',
  color: [255, 255, 255, 0.04],
  outline: { color: [255, 255, 255, 0.9], width: 1 },
}
const SELECTED_SYMBOL = {
  type: 'simple-fill',
  color: [0, 229, 255, 0.18],
  outline: { color: [0, 229, 255, 1], width: 2.5 },
}

function toGraphic(parcel, symbol) {
  return new Graphic({
    geometry: { type: 'polygon', rings: parcel.rings, spatialReference: { wkid: 4326 } },
    attributes: { upi: parcel.upi },
    symbol,
  })
}

/**
 * The full-window map. `padding` ({ top, right, bottom, left } in pixels) is
 * the part of the window covered by floating panels, so a selected parcel is
 * centred in what is actually visible. `controlsBottom` is a CSS length that
 * lifts the zoom and imagery controls above a sheet rising from the bottom.
 */
export default function ParcelMap({ parcels, selected, onSelect, padding, controlsBottom = '2.25rem' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const [mode, setMode] = useState(MODES[0].id)
  const { theme } = useTheme()
  const { top = 0, right = 0, bottom = 0, left = 0 } = padding || {}

  const selectedRef = useRef(selected)
  const fittedRef = useRef(false)

  useEffect(() => {
    onSelectRef.current = onSelect
    selectedRef.current = selected
  }, [onSelect, selected])

  // The SDK's own pieces (attribution) take their look from this stylesheet,
  // served from the same CDN the SDK loads its assets from.
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
    const imagery = new ImageryLayer({
      url: SENTINEL_URL,
      rasterFunction: { functionName: FIRST_SENTINEL },
      // Hidden until a Sentinel-2 mode is chosen, so nothing is requested for it.
      visible: false,
      format: 'jpgpng',
    })
    const parcelLayer = new GraphicsLayer()
    const selectedLayer = new GraphicsLayer()
    const view = new MapView({
      container: containerRef.current,
      map: new ArcGISMap({
        basemap: new Basemap({ baseLayers: [new TileLayer({ url: WORLD_IMAGERY_URL })] }),
        layers: [imagery, parcelLayer, selectedLayer],
      }),
      extent: RWANDA_EXTENT,
    })
    // Zoom buttons are drawn below in the app's own style.
    view.ui.remove('zoom')

    const click = view.on('click', async (event) => {
      try {
        const hit = await view.hitTest(event, { include: [parcelLayer, selectedLayer] })
        const upi = hit.results.find((result) => result.graphic?.attributes?.upi)?.graphic.attributes.upi
        if (upi) onSelectRef.current(upi)
      } catch {
        // The view was torn down mid-click: nothing to select.
      }
    })

    mapRef.current = { view, imagery, parcelLayer, selectedLayer }
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
    map.view.padding = { top, right, bottom, left }
    map.selectedLayer.removeAll()
    if (!selected?.rings) return
    const graphic = toGraphic(selected, SELECTED_SYMBOL)
    map.selectedLayer.add(graphic)
    // goTo rejects when the user moves the map mid-animation or the view is
    // destroyed; neither is an error worth showing.
    map.view
      .when(() => map.view.goTo(graphic.geometry.extent.expand(3)))
      .catch(() => {})
  }, [selected, top, right, bottom, left])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const next = MODES.find((m) => m.id === mode)
    if (next.functionName) map.imagery.rasterFunction = { functionName: next.functionName }
    map.imagery.visible = Boolean(next.functionName)
  }, [mode])

  const zoomBy = (delta) => {
    const view = mapRef.current?.view
    if (view?.ready) view.goTo({ zoom: view.zoom + delta }).catch(() => {})
  }

  return (
    <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
      <div ref={containerRef} className="absolute inset-0" />
      {/* Kept clear of the attribution line and of a sheet rising from the bottom. */}
      <div
        className="pointer-events-none absolute left-3 z-10 flex items-end gap-2 transition-[bottom] duration-300 motion-reduce:transition-none"
        style={{ bottom: controlsBottom }}
      >
        <div className="glass pointer-events-auto flex flex-col overflow-hidden rounded-2xl shadow-float">
          <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in" className="grid h-9 w-9 place-items-center text-lg text-ink-2 hover:bg-raised hover:text-ink">
            +
          </button>
          <span aria-hidden="true" className="h-px bg-line" />
          <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out" className="grid h-9 w-9 place-items-center text-lg text-ink-2 hover:bg-raised hover:text-ink">
            −
          </button>
        </div>
        <div role="group" aria-label="Imagery" className="glass pointer-events-auto flex flex-wrap gap-1 rounded-2xl p-1 text-xs shadow-float">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              title={m.title}
              onClick={() => setMode(m.id)}
              className={`rounded-full px-3 py-1.5 font-medium transition ${
                mode === m.id ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-raised hover:text-ink'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
