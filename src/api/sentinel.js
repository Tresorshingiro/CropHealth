// The public Sentinel-2 service, asked directly by the browser: which tile to
// show over the selected plots, and the rules that draw it cut to their outlines.
import { SENTINEL_URL } from '../lib/mapLayers.js'
import { DAY, imageWindow, presetRange, startOfDay } from '../lib/range.js'

export class SceneError extends Error {
  constructor(message = 'Satellite image unavailable') {
    super(message)
    this.name = 'SceneError'
  }
}

const stamp = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

/** Tiles taken in a period. Built from numbers only, so it is safe in a where clause. */
export const periodWhere = ({ from, to }) =>
  `acquisitiondate >= timestamp '${stamp(from)}' AND acquisitiondate <= timestamp '${stamp(to)}'`

export const dayWindow = (ms) => ({ from: startOfDay(ms), to: startOfDay(ms) + DAY - 1 })

export function ringsExtent(rings) {
  const points = rings.flat()
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return {
    xmin: Math.min(...xs),
    ymin: Math.min(...ys),
    xmax: Math.max(...xs),
    ymax: Math.max(...ys),
    spatialReference: { wkid: 4326 },
  }
}

/** The clearest tile over the plots in a period (most recent on a tie), or null. */
export async function findScene({ rings, from, to, signal }) {
  const params = new URLSearchParams({
    f: 'json',
    where: periodWhere({ from, to }),
    geometry: JSON.stringify(ringsExtent(rings)),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    // Without it the service ignores the geometry and searches the whole world.
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'acquisitiondate,cloudcover',
    orderByFields: 'cloudcover ASC,acquisitiondate DESC',
    returnGeometry: 'false',
    resultRecordCount: '1',
  })
  let data
  try {
    const res = await fetch(`${SENTINEL_URL}/query?${params}`, { signal })
    if (!res.ok) throw new SceneError()
    data = await res.json()
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw err instanceof SceneError ? err : new SceneError()
  }
  if (data?.error) throw new SceneError()
  const a = data?.features?.[0]?.attributes
  if (!a || typeof a.acquisitiondate !== 'number') return null
  return { date: a.acquisitiondate, cloud: typeof a.cloudcover === 'number' ? a.cloudcover : null }
}

/**
 * The scene the map shows for the plots: the picked day; else the clearest
 * tile of the range's last 30 days; else of the whole range (the last 12
 * months when the range is all dates). The window it was found in comes
 * with it.
 */
export async function findPlotScene({ rings, range, imageDate = null, now = Date.now(), signal }) {
  const within = async (window) => {
    const scene = await findScene({ rings, ...window, signal })
    return scene && { ...scene, window }
  }
  if (imageDate !== null) return within(dayWindow(imageDate))
  const recent = imageWindow(range, now)
  const scene = await within(recent)
  if (scene) return scene
  const wider = range ?? presetRange('12m', now)
  if (wider.from >= recent.from) return null
  return within(wider)
}

// The service is Sentinel-2 Level-1C. Since processing baseline 04.00 (January
// 2022) every band carries +1000, which drags plain ratios towards zero, so
// it is taken off both bands. Band numbers in an expression are positions:
// position 12 is B11 (SWIR 1.6 µm), the band NDMI needs.
const INDEX_EXPRESSIONS = {
  ndvi: '(B8-B4)/(B8+B4-2000)',
  ndmi: '(B8-B12)/(B8+B12-2000)',
  ndre: '(B8-B5)/(B8+B5-2000)',
}

/**
 * The average of each index over one parcel, on the scene's day: a quick look
 * measured from Sentinel-2, not the GIS team's analysis.
 */
export async function measureParcel({ rings, date, signal }) {
  const mean = async (expression) => {
    const body = new URLSearchParams({
      f: 'json',
      geometry: JSON.stringify({ rings, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPolygon',
      mosaicRule: JSON.stringify({
        mosaicMethod: 'esriMosaicAttribute',
        sortField: 'cloudcover',
        sortValue: '0',
        ascending: true,
        where: periodWhere(dayWindow(date)),
      }),
      renderingRule: JSON.stringify({
        rasterFunction: 'BandArithmetic',
        rasterFunctionArguments: { Method: 0, BandIndexes: expression },
        outputPixelType: 'F32',
      }),
      pixelSize: JSON.stringify({ x: 10, y: 10, spatialReference: { wkid: 3857 } }),
    })
    let data
    try {
      const res = await fetch(`${SENTINEL_URL}/computeStatisticsHistograms`, { method: 'POST', body, signal })
      if (!res.ok) throw new SceneError()
      data = await res.json()
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      throw err instanceof SceneError ? err : new SceneError()
    }
    if (data?.error) throw new SceneError()
    const stats = data?.statistics?.[0]
    return stats?.count > 0 && Number.isFinite(stats.mean) ? stats.mean : null
  }
  const [ndvi, ndmi, ndre] = await Promise.all(
    [INDEX_EXPRESSIONS.ndvi, INDEX_EXPRESSIONS.ndmi, INDEX_EXPRESSIONS.ndre].map(mean),
  )
  return { ndvi, ndmi, ndre }
}

/** Raster function properties: one index, cut to the plots' outlines and transparent outside them. */
export function clipRasterFunction(rings, functionName) {
  return {
    functionName: 'Clip',
    functionArguments: {
      ClippingGeometry: { rings, spatialReference: { wkid: 4326 } },
      ClipType: 1,
      Raster: { functionName },
    },
  }
}

/** Mosaic rule properties: the tiles of one day, the clearest on top. */
export function dayMosaicRule(date) {
  return {
    method: 'attribute',
    sortField: 'cloudcover',
    sortValue: '0',
    ascending: true,
    where: periodWhere(dayWindow(date)),
  }
}
