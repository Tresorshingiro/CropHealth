import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DAY } from '../lib/range.js'
import {
  SceneError,
  clipRasterFunction,
  dayMosaicRule,
  dayWindow,
  findPlotScene,
  findScene,
  measureParcel,
  periodWhere,
} from './sentinel.js'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const scene = (date, cloudcover) => ({ features: [{ attributes: { acquisitiondate: date, cloudcover } }] })

const RINGS = [[[30.45, -2.13], [30.47, -2.13], [30.47, -2.11], [30.45, -2.13]]]
const APR_28 = Date.UTC(2026, 3, 28, 8, 12)
const NOW = Date.UTC(2026, 9, 6, 9)

let fetchMock
const sent = (i = 0) => new URL(fetchMock.mock.calls[i][0])

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('periodWhere and dayWindow', () => {
  it('limits tiles to whole UTC days', () => {
    expect(periodWhere(dayWindow(APR_28))).toBe(
      "acquisitiondate >= timestamp '2026-04-28 00:00:00' AND acquisitiondate <= timestamp '2026-04-28 23:59:59'",
    )
  })
})

describe('findScene', () => {
  it('asks the service for the clearest tile over the plots in the period', async () => {
    fetchMock.mockResolvedValue(json(scene(APR_28, 0)))
    const found = await findScene({ rings: RINGS, from: Date.UTC(2026, 2, 1), to: Date.UTC(2026, 4, 1) - 1 })
    expect(found).toEqual({ date: APR_28, cloud: 0 })

    const url = sent()
    expect(url.origin + url.pathname).toBe('https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/query')
    expect(url.searchParams.get('where')).toBe(
      "acquisitiondate >= timestamp '2026-03-01 00:00:00' AND acquisitiondate <= timestamp '2026-04-30 23:59:59'",
    )
    expect(JSON.parse(url.searchParams.get('geometry'))).toEqual({
      xmin: 30.45,
      ymin: -2.13,
      xmax: 30.47,
      ymax: -2.11,
      spatialReference: { wkid: 4326 },
    })
    // Without spatialRel the service ignores the geometry and searches the whole world.
    expect(url.searchParams.get('spatialRel')).toBe('esriSpatialRelIntersects')
    expect(url.searchParams.get('orderByFields')).toBe('cloudcover ASC,acquisitiondate DESC')
    expect(url.searchParams.get('resultRecordCount')).toBe('1')
    expect(url.searchParams.get('f')).toBe('json')
  })

  it('finds nothing when no tile falls in the period', async () => {
    fetchMock.mockResolvedValue(json({ features: [] }))
    expect(await findScene({ rings: RINGS, from: 0, to: DAY })).toBeNull()
  })

  it('raises SceneError for a service error, a bad answer or no connection', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 500, message: 'boom' } }))
    await expect(findScene({ rings: RINGS, from: 0, to: DAY })).rejects.toBeInstanceOf(SceneError)
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 502 }))
    await expect(findScene({ rings: RINGS, from: 0, to: DAY })).rejects.toBeInstanceOf(SceneError)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(findScene({ rings: RINGS, from: 0, to: DAY })).rejects.toBeInstanceOf(SceneError)
  })

  it('passes an abort through untouched', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    await expect(findScene({ rings: RINGS, from: 0, to: DAY })).rejects.toHaveProperty('name', 'AbortError')
  })
})

describe('findPlotScene', () => {
  it('uses the picked day when there is one', async () => {
    fetchMock.mockResolvedValue(json(scene(APR_28, 0.2)))
    expect(await findPlotScene({ rings: RINGS, range: null, imageDate: APR_28, now: NOW })).toEqual({
      date: APR_28,
      cloud: 0.2,
      window: dayWindow(APR_28),
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sent().searchParams.get('where')).toContain("'2026-04-28 00:00:00'")
  })

  it('looks in the last 30 days of the range first, then the whole range', async () => {
    fetchMock.mockResolvedValueOnce(json({ features: [] })).mockResolvedValueOnce(json(scene(APR_28, 0)))
    const range = { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 9, 1) - 1 }
    // The window it was found in comes back too.
    expect(await findPlotScene({ rings: RINGS, range, now: NOW })).toEqual({ date: APR_28, cloud: 0, window: range })
    expect(sent(0).searchParams.get('where')).toContain("'2026-09-01 00:00:00'")
    expect(sent(1).searchParams.get('where')).toContain("'2026-01-01 00:00:00'")
  })

  it('widens All to the last 12 months', async () => {
    // A fresh Response per call: a body can only be read once.
    fetchMock.mockImplementation(async () => json({ features: [] }))
    expect(await findPlotScene({ rings: RINGS, range: null, now: NOW })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sent(1).searchParams.get('where')).toContain("'2025-10-06 00:00:00'")
  })

  it('asks once for a range shorter than 30 days', async () => {
    fetchMock.mockResolvedValue(json({ features: [] }))
    const range = { from: Date.UTC(2026, 3, 20), to: Date.UTC(2026, 4, 1) - 1 }
    expect(await findPlotScene({ rings: RINGS, range, now: NOW })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('measureParcel', () => {
  const stats = (mean, count = 400) => ({ statistics: [{ min: -1, max: 1, mean, standardDeviation: 0.1, count }] })

  it('measures each index over the parcel on the scene day, offset-corrected', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      const expression = JSON.parse(init.body.get('renderingRule')).rasterFunctionArguments.BandIndexes
      return json(stats({ '(B8-B4)/(B8+B4-2000)': 0.214, '(B8-B12)/(B8+B12-2000)': -0.109, '(B8-B5)/(B8+B5-2000)': 0.157 }[expression]))
    })
    expect(await measureParcel({ rings: RINGS, date: APR_28 })).toEqual({ ndvi: 0.214, ndmi: -0.109, ndre: 0.157 })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/computeStatisticsHistograms')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body.get('geometry'))).toEqual({ rings: RINGS, spatialReference: { wkid: 4326 } })
    expect(init.body.get('geometryType')).toBe('esriGeometryPolygon')
    expect(JSON.parse(init.body.get('mosaicRule'))).toEqual({
      mosaicMethod: 'esriMosaicAttribute',
      sortField: 'cloudcover',
      sortValue: '0',
      ascending: true,
      where: periodWhere(dayWindow(APR_28)),
    })
  })

  it('gives no value for an index the service could not measure', async () => {
    fetchMock.mockImplementation(async () => json(stats(0.3, 0)))
    expect(await measureParcel({ rings: RINGS, date: APR_28 })).toEqual({ ndvi: null, ndmi: null, ndre: null })
  })

  it('raises SceneError when the service fails', async () => {
    fetchMock.mockImplementation(async () => json({ error: { code: 400, message: 'bad' } }))
    await expect(measureParcel({ rings: RINGS, date: APR_28 })).rejects.toBeInstanceOf(SceneError)
  })
})

describe('rules for the plot imagery layer', () => {
  it('clips one index to the outlines', () => {
    expect(clipRasterFunction(RINGS, 'NDVI Colormap')).toEqual({
      functionName: 'Clip',
      functionArguments: {
        ClippingGeometry: { rings: RINGS, spatialReference: { wkid: 4326 } },
        ClipType: 1,
        Raster: { functionName: 'NDVI Colormap' },
      },
    })
  })

  it('draws one day, clearest tile on top', () => {
    expect(dayMosaicRule(APR_28)).toEqual({
      method: 'attribute',
      sortField: 'cloudcover',
      sortValue: '0',
      ascending: true,
      where: periodWhere(dayWindow(APR_28)),
    })
  })
})
