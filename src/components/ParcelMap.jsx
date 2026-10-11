import { useCallback, useEffect, useRef, useState } from 'react'
import Basemap from '@arcgis/core/Basemap.js'
import Graphic from '@arcgis/core/Graphic.js'
import ArcGISMap from '@arcgis/core/Map.js'
import { version as sdkVersion } from '@arcgis/core/kernel.js'
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js'
import Extent from '@arcgis/core/geometry/Extent.js'
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils.js'
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js'
import GroupLayer from '@arcgis/core/layers/GroupLayer.js'
import ImageryLayer from '@arcgis/core/layers/ImageryLayer.js'
import TileLayer from '@arcgis/core/layers/TileLayer.js'
import MosaicRule from '@arcgis/core/layers/support/MosaicRule.js'
import RasterFunction from '@arcgis/core/layers/support/RasterFunction.js'
import RasterStretchRenderer from '@arcgis/core/renderers/RasterStretchRenderer.js'
import AlgorithmicColorRamp from '@arcgis/core/rest/support/AlgorithmicColorRamp.js'
import MultipartColorRamp from '@arcgis/core/rest/support/MultipartColorRamp.js'
import MapView from '@arcgis/core/views/MapView.js'
import ScaleBar from '@arcgis/core/widgets/ScaleBar.js'
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel.js'
import { clipRasterFunction, dayMosaicRule } from '../api/sentinel.js'
import { checkField } from '../lib/drawnField.js'
import { parcelHealth } from '../lib/health.js'
import { isTyping } from '../lib/keys.js'
import { clickAction } from '../lib/mapClick.js'
import {
  BASEMAPS,
  DISTRICT_LABEL_SCALES,
  DISTRICTS_URL,
  HEALTH_COLORS,
  LAIS_LAYER_URLS,
  LAIS_MIN_SCALE,
  OUTLINES,
  PLOT_INDICES,
  RWANDA_EXTENT,
  RWANDA_RINGS,
  SENTINEL_LAYERS,
  SENTINEL_URL,
} from '../lib/mapLayers.js'
import { useTheme } from '../theme/ThemeContext.jsx'
import IndexSwitch from './IndexSwitch.jsx'
import LayersPanel from './map/LayersPanel.jsx'
import MapLegend from './map/MapLegend.jsx'
import PlotCard, { hasCard, SCENE_TEXT } from './map/PlotCard.jsx'

// Rwanda (about 2.2 degrees wide) fits at zoom 8 to 9 in the app's map cards;
// 7 leaves room around it on a phone too.
const MIN_ZOOM = 7

// The default view: Rwanda with room around it, clear of the controls in the map's corners.
// goTo needs a real Extent: a plain object is turned down without a word.
const homeExtent = () => new Extent(RWANDA_EXTENT).expand(1.15)

// Rwanda's border: a dark halo under a white line reads on imagery and on the plain maps alike.
const borderGraphics = () =>
  [
    { color: [0, 0, 0, 0.45], width: 4 },
    { color: [255, 255, 255, 0.95], width: 1.75 },
  ].map(
    (outline) =>
      new Graphic({
        geometry: { type: 'polygon', rings: RWANDA_RINGS, spatialReference: { wkid: 4326 } },
        symbol: { type: 'simple-fill', color: [0, 0, 0, 0], outline },
      }),
  )

// The Sentinel-2 layer is drawn solid by default: blended with the photo, both were hard to read.
const DEFAULT_SETTINGS = { basemap: 'satellite', sentinel: 'none', opacity: 1, analysed: true, land: true, districts: true }

// Analysed parcels in their health colour: outlines up close, dots from further
// out, where a field is too small to see but should still be found.
const DOT_SCALE = 60000
const parcelSymbol = (verdict) => {
  const { rgb } = HEALTH_COLORS[verdict ?? 'unrated']
  return { type: 'simple-fill', color: [...rgb, 0.12], outline: { color: [...rgb, 1], width: 1.75 } }
}
const dotSymbol = (verdict) => ({
  type: 'simple-marker',
  style: 'circle',
  size: 9,
  color: [...HEALTH_COLORS[verdict ?? 'unrated'].rgb, 1],
  outline: { color: [255, 255, 255, 0.9], width: 1.25 },
})
const SELECTED_SYMBOL = {
  type: 'simple-fill',
  color: [...OUTLINES.selected.rgb, 0.18],
  outline: { color: [...OUTLINES.selected.rgb, 1], width: 2.5 },
}
const LAND_RENDERER = {
  type: 'simple',
  symbol: {
    type: 'simple-fill',
    color: [0, 0, 0, 0],
    outline: { color: [...OUTLINES.land.rgb, OUTLINES.land.alpha], width: 0.5 },
  },
}
// District borders: a dashed soft white, below the solid country border and unlike the parcels' thin line.
const DISTRICT_RENDERER = {
  type: 'simple',
  symbol: {
    type: 'simple-fill',
    color: [0, 0, 0, 0],
    outline: { color: [...OUTLINES.district.rgb, OUTLINES.district.alpha], width: 1.25, style: 'dash' },
  },
}
const DISTRICT_LABELS = [
  {
    labelExpressionInfo: { expression: '$feature.district' },
    labelPlacement: 'always-horizontal',
    minScale: DISTRICT_LABEL_SCALES.min,
    maxScale: DISTRICT_LABEL_SCALES.max,
    symbol: {
      type: 'text',
      color: [255, 255, 255, 0.9],
      haloColor: [0, 0, 0, 0.7],
      haloSize: 1.25,
      font: { size: 10, weight: 'bold' },
    },
  },
]

/** NDRE arrives as raw values; this colours them over the scale's range in the browser. */
function stretchRenderer(scale) {
  return new RasterStretchRenderer({
    stretchType: 'min-max',
    customStatistics: [
      { min: scale.min, max: scale.max, avg: (scale.min + scale.max) / 2, stddev: (scale.max - scale.min) / 4 },
    ],
    colorRamp: new MultipartColorRamp({
      colorRamps: scale.colors.slice(1).map(
        (to, i) => new AlgorithmicColorRamp({ fromColor: scale.colors[i], toColor: to, algorithm: 'lab-lch' }),
      ),
    }),
  })
}

const IDLE_SCENE = { status: 'idle', scene: null }
// What a land parcel's quick look shows about where it is and how big.
const LAND_FIELDS = ['upi', 'district', 'sector', 'cell', 'village', 'size']
// Room the docked card takes on the map, so a selected plot is framed beside it.
const WIDE_MAP = 640 // px; narrower maps put the card along the bottom
const CARD_PADDING = { top: 0, right: 304, bottom: 0, left: 0 } // the card's 18rem, plus a margin
const CARD_PADDING_NARROW = { top: 0, right: 0, bottom: 240, left: 0 }
const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 }

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
  draw: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
}

const controlButton =
  'grid h-9 w-9 place-items-center text-ink-2 transition hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'

/**
 * The parcel map: base map, an optional Sentinel-2 layer, land parcel
 * outlines, the analysed parcels and the selected one. `controlsBottom` is a
 * CSS length that keeps the legend clear of the attribution line.
 */
export default function ParcelMap({
  parcels,
  // Every analysed parcel, outlined or not (a health filter may hide some): a click on one opens its report.
  allParcels = parcels,
  selected,
  onSelect,
  controlsBottom = '2.25rem',
  scene = IDLE_SCENE,
  onOpenReport,
  onLookAt,
  onDrawn,
  guide = null,
  district = null,
}) {
  const rootRef = useRef(null)
  const containerRef = useRef(null)
  const layersRef = useRef(null)
  const mapRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const onLookAtRef = useRef(onLookAt)
  const onDrawnRef = useRef(onDrawn)
  const drawingRef = useRef(false)
  const analysedRef = useRef(new Set())
  const selectedRef = useRef(selected)
  const { theme } = useTheme()

  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [layersOpen, setLayersOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [plotIndex, setPlotIndex] = useState('ndvi')
  const [popupOpen, setPopupOpen] = useState(false)
  const [folded, setFolded] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [drawError, setDrawError] = useState(null)

  useEffect(() => {
    drawingRef.current = drawing
  }, [drawing])

  // The plot whose pixels are drawn: the selected one.
  const plotRings = selected?.rings ?? null
  const ringsKey = plotRings ? JSON.stringify(plotRings) : ''
  const selectedKey = selected?.rings ? `${selected.upi}|${JSON.stringify(selected.rings)}` : ''
  // Only a quick look or a drawn field gets the card; an analysed plot's values are beside the map.
  const cardShown = popupOpen && hasCard(selected)

  const update = useCallback((patch) => {
    setSettings((current) => ({ ...current, ...patch }))
    // A colour scale means nothing without its key: show it with the layer.
    if (SENTINEL_LAYERS.find((layer) => layer.id === patch.sentinel)?.scale) setLegendOpen(true)
  }, [])
  const cardPadding = () => ((rootRef.current?.clientWidth ?? 0) >= WIDE_MAP ? CARD_PADDING : CARD_PADDING_NARROW)

  useEffect(() => {
    onSelectRef.current = onSelect
    onLookAtRef.current = onLookAt
    onDrawnRef.current = onDrawn
    selectedRef.current = selected
    analysedRef.current = new Set(allParcels.map((parcel) => parcel.upi))
  }, [onSelect, onLookAt, onDrawn, selected, allParcels])

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
    const plotImagery = new ImageryLayer({ url: SENTINEL_URL, visible: false, format: 'jpgpng' })
    // Hidden below LAIS_MIN_SCALE, so the services are only asked for parcels
    // once the view is close enough to tell fields apart.
    const landLayer = new GroupLayer({
      layers: LAIS_LAYER_URLS.map(
        (url) =>
          new FeatureLayer({
            url,
            minScale: LAIS_MIN_SCALE,
            outFields: LAND_FIELDS,
            renderer: LAND_RENDERER,
            popupEnabled: false,
            legendEnabled: false,
          }),
      ),
    })
    const districtLayer = new FeatureLayer({
      url: DISTRICTS_URL,
      outFields: ['district'],
      renderer: DISTRICT_RENDERER,
      labelingInfo: DISTRICT_LABELS,
      popupEnabled: false,
      legendEnabled: false,
    })
    const parcelLayer = new GraphicsLayer({ minScale: DOT_SCALE })
    const dotLayer = new GraphicsLayer({ maxScale: DOT_SCALE })
    const selectedLayer = new GraphicsLayer()
    const borderLayer = new GraphicsLayer({ graphics: borderGraphics() })
    const drawLayer = new GraphicsLayer()
    const view = new MapView({
      container: containerRef.current,
      map: new ArcGISMap({
        layers: [imagery, plotImagery, landLayer, districtLayer, borderLayer, parcelLayer, dotLayer, selectedLayer, drawLayer],
      }),
      extent: RWANDA_EXTENT,
      popupEnabled: false,
      // The map's centre stays over Rwanda, so panning never loses the country.
      // A fixed floor, a little wider than the whole country in any map card.
      // (Derived from the zoom at load, a page opened on a plot set it at
      // field level, and Home could never zoom back out.)
      constraints: { geometry: new Extent(RWANDA_EXTENT), minZoom: MIN_ZOOM, rotationEnabled: false, snapToZoom: false },
    })
    // The view is built before its card has its final size, so the first fit
    // leaves Rwanda small: fit it again once the view is ready.
    view
      .when(async () => {
        // A plot opened from the link has already been zoomed to: leave it there.
        if (!selectedLayer.graphics.length) {
          await view.goTo(homeExtent(), { animate: false })
        }
      })
      .catch(() => {})
    // Zoom and home are drawn below in the app's own style.
    view.ui.remove('zoom')
    view.ui.add(new ScaleBar({ view, unit: 'metric' }), 'bottom-right')

    // Drawing a field: the SDK's sketch tools on their own layer, driven by our own buttons.
    const sketch = new SketchViewModel({
      view,
      layer: drawLayer,
      defaultCreateOptions: { mode: 'click' },
      polygonSymbol: {
        type: 'simple-fill',
        color: [...OUTLINES.selected.rgb, 0.12],
        outline: { color: [...OUTLINES.selected.rgb, 1], width: 2 },
      },
    })
    const created = sketch.on('create', (event) => {
      if (event.state === 'cancel') {
        drawLayer.removeAll()
        setDrawing(false)
        return
      }
      if (event.state !== 'complete') return
      drawLayer.removeAll()
      const drawn = event.graphic.geometry
      const geometry = drawn.spatialReference?.isWebMercator ? webMercatorUtils.webMercatorToGeographic(drawn) : drawn
      const result = checkField(geometry?.rings)
      if (!result.ok) {
        setDrawError(result.message)
        sketch.create('polygon')
        return
      }
      setDrawError(null)
      setDrawing(false)
      onDrawnRef.current?.({
        drawn: true,
        upi: null,
        district: null,
        sector: null,
        cell: null,
        village: null,
        areaM2: result.areaM2,
        rings: result.rings,
      })
    })

    const landLayers = landLayer.layers.toArray()
    const click = view.on('click', async (event) => {
      // While a field is being drawn, clicks place its points.
      if (drawingRef.current) return
      try {
        const hit = await view.hitTest(event, {
          include: [parcelLayer, dotLayer, selectedLayer, ...landLayers],
        })
        // The selection's own outline, which a drawn field (no UPI) needs to be found again.
        const onSelected = hit.results.some((result) => result.graphic?.layer === selectedLayer)
        const graphics = hit.results.map((result) => result.graphic).filter((graphic) => graphic?.attributes?.upi)
        const plot = graphics.find((graphic) => !landLayers.includes(graphic.layer))
        const land = graphics.find((graphic) => landLayers.includes(graphic.layer))
        const action = clickAction({
          plotUpi: plot?.attributes.upi ?? null,
          landUpi: land?.attributes.upi ?? null,
          selectedUpi: selectedRef.current?.upi ?? null,
          onSelected,
          analysed: analysedRef.current,
        })
        if (action.type === 'reopen') setPopupOpen(true)
        else if (action.type === 'select') onSelectRef.current(action.upi)
        else if (action.type === 'close') setPopupOpen(false)
        else {
          // The drawn outline is generalised for the screen: measure the parcel's full one.
          const { features } = await land.layer.queryFeatures({
            objectIds: [land.attributes[land.layer.objectIdField]],
            outFields: LAND_FIELDS,
            returnGeometry: true,
            outSpatialReference: { wkid: 4326 },
          })
          const feature = features[0]
          if (!feature?.geometry?.rings?.length) return
          const a = feature.attributes
          onLookAtRef.current?.({
            upi: action.upi,
            district: a.district ?? null,
            sector: a.sector ?? null,
            cell: a.cell ?? null,
            village: a.village ?? null,
            areaM2: typeof a.size === 'number' ? a.size : null,
            rings: feature.geometry.rings,
          })
        }
      } catch {
        // The view was torn down mid-click, or the parcel could not be read: nothing to select.
      }
    })

    mapRef.current = { view, imagery, plotImagery, landLayer, districtLayer, parcelLayer, dotLayer, selectedLayer, drawLayer, sketch }
    return () => {
      click.remove()
      created.remove()
      sketch.destroy()
      view.destroy()
      mapRef.current = null
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
    map.dotLayer.visible = settings.analysed
    map.landLayer.visible = settings.land
    map.districtLayer.visible = settings.districts
  }, [settings.analysed, settings.land, settings.districts])

  // Coloured by health, by the same rule as the overview and each report.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const outlines = []
    const dots = []
    for (const parcel of parcels) {
      if (!parcel.rings) continue
      const { verdict } = parcelHealth(parcel, guide)
      const outline = toGraphic(parcel, parcelSymbol(verdict))
      outlines.push(outline)
      dots.push(new Graphic({ geometry: outline.geometry.centroid, attributes: { upi: parcel.upi }, symbol: dotSymbol(verdict) }))
    }
    map.parcelLayer.removeAll()
    map.parcelLayer.addMany(outlines)
    map.dotLayer.removeAll()
    map.dotLayer.addMany(dots)
  }, [parcels, guide])

  // Keyed on the plot, not the object: a quick look's selection is rebuilt as
  // its measurement arrives, which must not re-zoom or reopen the popup.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.selectedLayer.removeAll()
    const current = selectedRef.current
    if (!current?.rings) return
    const graphic = toGraphic(current, SELECTED_SYMBOL)
    map.selectedLayer.add(graphic)
    // A quick look's card opens with it: frame the plot in the space the card leaves.
    map.view.padding = hasCard(current) ? cardPadding() : NO_PADDING
    // goTo rejects when the user moves the map mid-animation or the view is
    // destroyed; neither is an error worth showing.
    map.view
      .when(() => map.view.goTo(graphic.geometry.extent.expand(3)))
      .catch(() => {})
  }, [selectedKey])

  // A district picked in the sidebar: frame its outline, from the district layer. Leaving it goes back to Rwanda.
  // Starts empty, so a link that names a district is framed on load too.
  const districtRef = useRef(null)
  useEffect(() => {
    const map = mapRef.current
    const before = districtRef.current
    districtRef.current = district
    if (!map || district === before) return undefined
    if (!district) {
      map.view.when(() => map.view.goTo(homeExtent())).catch(() => {})
      return undefined
    }
    let active = true
    // Names are compared in capitals; a quote in a name is doubled, so it cannot end the string.
    const where = `UPPER(district) = '${district.toUpperCase().replace(/'/g, "''")}'`
    map.districtLayer
      .queryExtent({ where, outSpatialReference: map.view.spatialReference })
      .then(({ extent }) => {
        // An open plot keeps the view: a link with both a parcel and a district shows the parcel.
        if (active && extent && !selectedRef.current?.rings) return map.view.goTo(extent.expand(1.15))
        return undefined
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [district])

  // The index pixels inside the plots, from the scene the Dashboard found.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const ready = Boolean(ringsKey) && scene.status === 'ready'
    if (!ready) {
      map.plotImagery.visible = false
      return
    }
    const layer = PLOT_INDICES.find((item) => item.id === plotIndex)
    const rule = clipRasterFunction(JSON.parse(ringsKey), layer.functionName)
    map.plotImagery.format = layer.format
    map.plotImagery.renderer = layer.format === 'lerc' ? stretchRenderer(layer.scale) : null
    map.plotImagery.rasterFunction = new RasterFunction({
      ...rule,
      functionArguments: { ...rule.functionArguments, Raster: new RasterFunction(rule.functionArguments.Raster) },
    })
    map.plotImagery.mosaicRule = new MosaicRule(dayMosaicRule(scene.scene.date))
    // Shown only once clipped and dated, so no unclipped image is ever asked for.
    map.plotImagery.visible = true
  }, [ringsKey, plotIndex, scene.status, scene.scene?.date])

  // A newly selected plot opens its card, unfolded.
  useEffect(() => {
    setPopupOpen(Boolean(selectedKey))
    setFolded(false)
  }, [selectedKey])

  // The plot is kept clear of the card only while the card is shown and unfolded.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.view.padding = cardShown && !folded ? cardPadding() : NO_PADDING
  }, [cardShown, folded])

  // Escape closes the card, except while typing in it (a drawn field's name).
  useEffect(() => {
    if (!popupOpen) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape' && !isTyping(event.target)) setPopupOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [popupOpen])

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

  // Home is always the default view: the whole of Rwanda.
  const goHome = () => {
    const map = mapRef.current
    if (!map?.view.ready) return
    map.view.goTo(homeExtent()).catch(() => {})
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else rootRef.current?.requestFullscreen?.().catch(() => {})
  }

  const startDrawing = () => {
    const map = mapRef.current
    if (!map?.view.ready) return
    setDrawError(null)
    setPopupOpen(false)
    setDrawing(true)
    map.sketch.create('polygon')
  }
  const cancelDrawing = () => {
    setDrawError(null)
    mapRef.current?.sketch.cancel()
  }

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden rounded-[inherit] bg-page">
      <div ref={containerRef} className="absolute inset-0" />

      {(ringsKey || drawing || drawError) && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex max-w-[calc(100%-7rem)] -translate-x-1/2 flex-col items-center gap-2">
          {drawing ? (
            <p role="status" className="glass pointer-events-auto flex items-center gap-2 rounded-full px-3 py-1 text-xs shadow-float">
              Click to outline the field · double-click to finish
              <button type="button" className="font-semibold text-accent hover:underline" onClick={cancelDrawing}>
                Cancel
              </button>
            </p>
          ) : (
            ringsKey && (
              <IndexSwitch
                value={plotIndex}
                onChange={(id) => {
                  setPlotIndex(id)
                  setLegendOpen(true)
                }}
                label="Index in the plot"
                className="glass pointer-events-auto shadow-float"
              />
            )
          )}
          {drawError && (
            <p role="alert" className="glass rounded-full px-3 py-1 text-xs text-danger shadow-float">
              {drawError}
            </p>
          )}
          {!drawing && ringsKey && SCENE_TEXT[scene.status] && scene.status !== 'loading' && (
            <p role="status" className="glass rounded-full px-3 py-1 text-xs text-ink-2 shadow-float">
              {SCENE_TEXT[scene.status]}
            </p>
          )}
        </div>
      )}

      {cardShown && (
        <div
          className="absolute right-3 z-20 flex max-w-[calc(100%-1.5rem)] justify-end"
          style={{ bottom: `calc(${controlsBottom} + 2rem)` }}
        >
          <PlotCard
            parcel={selected}
            scene={scene}
            guide={guide}
            folded={folded}
            onFold={setFolded}
            onOpenReport={() => {
              setPopupOpen(false)
              onOpenReport?.()
            }}
            onClose={() => setPopupOpen(false)}
          />
        </div>
      )}

      <div className="glass absolute left-3 top-3 z-10 flex flex-col overflow-hidden rounded-2xl shadow-float">
        <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in" className={`${controlButton} text-lg`}>
          +
        </button>
        <span aria-hidden="true" className="h-px bg-line" />
        <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out" className={`${controlButton} text-lg`}>
          −
        </button>
        <span aria-hidden="true" className="h-px bg-line" />
        <button type="button" onClick={goHome} aria-label="Home" title="Back to Rwanda" className={controlButton}>
          <Icon d={ICONS.home} />
        </button>
        <span aria-hidden="true" className="h-px bg-line" />
        <button
          type="button"
          onClick={drawing ? cancelDrawing : startDrawing}
          aria-label="Draw field"
          aria-pressed={drawing}
          title={drawing ? 'Stop drawing' : 'Draw a field to analyse'}
          className={`${controlButton} ${drawing ? 'bg-raised text-ink' : ''}`}
        >
          <Icon d={ICONS.draw} />
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
          plot={ringsKey ? { index: plotIndex, scene } : null}
        />
      </div>
    </div>
  )
}
