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

// Raster function names as published by the Sentinel-2 image service.
const MODES = [
  { id: 'ndvi', label: 'NDVI', functionName: 'NDVI Colormap' },
  { id: 'ndmi', label: 'NDMI', functionName: 'NDMI Colorized' },
  { id: 'natural', label: 'Natural colour', functionName: 'Natural Color with DRA' },
]

const RWANDA_EXTENT = { xmin: 28.84, ymin: -2.86, xmax: 30.91, ymax: -1.04, spatialReference: { wkid: 4326 } }

// White outlines and a cyan highlight stay visible over every imagery mode.
const PARCEL_SYMBOL = {
  type: 'simple-fill',
  color: [255, 255, 255, 0.04],
  outline: { color: [255, 255, 255, 0.9], width: 1 },
}
const SELECTED_SYMBOL = {
  type: 'simple-fill',
  color: [0, 229, 255, 0.25],
  outline: { color: [0, 229, 255, 1], width: 2.5 },
}

function toGraphic(parcel, symbol) {
  return new Graphic({
    geometry: { type: 'polygon', rings: parcel.rings, spatialReference: { wkid: 4326 } },
    attributes: { upi: parcel.upi },
    symbol,
  })
}

export default function ParcelMap({ parcels, selected, onSelect }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const [mode, setMode] = useState('ndvi')
  const { theme } = useTheme()

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // The SDK's own controls (zoom buttons, attribution) take their look from
  // this stylesheet, served from the same CDN the SDK loads its assets from.
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
      rasterFunction: { functionName: MODES[0].functionName },
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

    const click = view.on('click', async (event) => {
      const hit = await view.hitTest(event, { include: [parcelLayer, selectedLayer] })
      const upi = hit.results.find((result) => result.graphic?.attributes?.upi)?.graphic.attributes.upi
      if (upi) onSelectRef.current(upi)
    })

    mapRef.current = { view, imagery, parcelLayer, selectedLayer }
    return () => {
      click.remove()
      view.destroy()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.parcelLayer.removeAll()
    map.parcelLayer.addMany(parcels.filter((p) => p.rings).map((p) => toGraphic(p, PARCEL_SYMBOL)))
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

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.imagery.rasterFunction = { functionName: MODES.find((m) => m.id === mode).functionName }
  }, [mode])

  return (
    <div className="relative h-full min-h-[24rem]">
      <div ref={containerRef} className="absolute inset-0" />
      <div
        role="group"
        aria-label="Imagery"
        className="absolute right-3 top-3 flex overflow-hidden rounded-md border border-line bg-surface text-xs shadow"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`px-3 py-1.5 font-medium ${
              mode === m.id ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-raised hover:text-ink'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}
