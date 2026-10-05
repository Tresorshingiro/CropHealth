import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkError, PortalError, SessionExpiredError } from './arcgis.js'
import { getIndexGuide, getObservations, getParcel, listParcels, resetIndexGuideCache } from './cropHealth.js'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

let fetchMock
const sentUrl = (i = 0) => new URL(fetchMock.mock.calls[i][0], 'http://localhost')

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  resetIndexGuideCache()
})

const PARCEL_FEATURE = {
  attributes: {
    upi: '5/05/10/02/1939',
    province: 'Eastern',
    district: 'Kirehe',
    sector: 'Nasho',
    cell: 'Kagese',
    village: 'Kagese Ii',
    area_m2: 18477.8,
    reliability: 'good',
    latest_date: 1790294400000,
    ndvi: 0.1394,
    ndmi: -0.2968,
    ndre: 0.0684,
    ndvi_level: 'bare ground',
    ndmi_level: 'very dry',
    ndre_level: 'very little chlorophyll',
    headline: 'On 25 Sep 2026: NDVI 0.14 (bare ground).',
    usable_dates: 87,
    last_refreshed: 1790778688448,
    status: null,
  },
  geometry: { rings: [[[30.7, -2.3], [30.71, -2.3], [30.71, -2.29], [30.7, -2.3]]] },
}

describe('getParcel', () => {
  it('queries the parcel layer by UPI and maps the record', async () => {
    fetchMock.mockResolvedValue(json({ features: [PARCEL_FEATURE] }))
    const parcel = await getParcel('5/05/10/02/1939')

    const url = sentUrl()
    expect(url.pathname).toBe('/api/gh/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/0/query')
    expect(url.searchParams.get('where')).toBe("upi = '5/05/10/02/1939'")
    expect(url.searchParams.get('returnGeometry')).toBe('true')
    expect(url.searchParams.get('outSR')).toBe('4326')
    expect(url.searchParams.get('f')).toBe('json')

    expect(parcel).toEqual({
      upi: '5/05/10/02/1939',
      province: 'Eastern',
      district: 'Kirehe',
      sector: 'Nasho',
      cell: 'Kagese',
      village: 'Kagese Ii',
      areaM2: 18477.8,
      reliability: 'good',
      latestDate: 1790294400000,
      ndvi: 0.1394,
      ndmi: -0.2968,
      ndre: 0.0684,
      ndviLevel: 'bare ground',
      ndmiLevel: 'very dry',
      ndreLevel: 'very little chlorophyll',
      headline: 'On 25 Sep 2026: NDVI 0.14 (bare ground).',
      usableDates: 87,
      lastRefreshed: 1790778688448,
      rings: [[[30.7, -2.3], [30.71, -2.3], [30.71, -2.29], [30.7, -2.3]]],
    })
  })

  it('returns null when the layer has no such parcel', async () => {
    fetchMock.mockResolvedValue(json({ features: [] }))
    expect(await getParcel('5/05/10/02/1')).toBeNull()
  })

  it('looks up a UPI the way the analysis tool stores it', async () => {
    fetchMock.mockResolvedValue(json({ features: [] }))
    await getParcel('5/5/10/2/1939')
    expect(sentUrl().searchParams.get('where')).toBe("upi = '5/05/10/02/1939'")
  })

  it('looks up a drawn area by its id', async () => {
    fetchMock.mockResolvedValue(json({ features: [{ ...PARCEL_FEATURE, attributes: { upi: 'AREA North field' } }] }))
    const parcel = await getParcel('area North field')
    expect(sentUrl().searchParams.get('where')).toBe("upi = 'AREA North field'")
    expect(parcel.upi).toBe('AREA North field')
  })

  it('sends nothing for text that is not a UPI', async () => {
    expect(await getParcel("5/05/10/02/1' OR '1'='1")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps missing or non-numeric values to null', async () => {
    fetchMock.mockResolvedValue(
      json({ features: [{ attributes: { upi: '5/05/10/02/1939', ndvi: null, ndmi: 'n/a', latest_date: null, district: '' } }] }),
    )
    const parcel = await getParcel('5/05/10/02/1939')
    expect(parcel.ndvi).toBeNull()
    expect(parcel.ndmi).toBeNull()
    expect(parcel.ndre).toBeNull()
    expect(parcel.latestDate).toBeNull()
    expect(parcel.district).toBeNull()
    expect(parcel.rings).toBeNull()
  })

  it('passes the abort signal to fetch', async () => {
    fetchMock.mockResolvedValue(json({ features: [] }))
    const controller = new AbortController()
    await getParcel('5/05/10/02/1939', { signal: controller.signal })
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })
})

describe('getObservations', () => {
  it('returns rows in date order and drops rows with no date', async () => {
    fetchMock.mockResolvedValue(
      json({
        features: [
          { attributes: { obs_date: 1755993600000, ndvi: 0.4959, ndmi: -0.0734, ndre: 0.284, clear_share: 1 } },
          { attributes: { obs_date: null, ndvi: 0.1, ndmi: 0.1, ndre: 0.1, clear_share: 1 } },
          { attributes: { obs_date: 1754265600000, ndvi: 0.3931, ndmi: -0.0896, ndre: null, clear_share: 0.8 } },
        ],
      }),
    )
    const rows = await getObservations('5/02/06/06/1702')
    expect(sentUrl().pathname).toMatch(/\/FeatureServer\/1\/query$/)
    expect(sentUrl().searchParams.get('where')).toBe("upi = '5/02/06/06/1702'")
    expect(rows).toEqual([
      { date: 1754265600000, ndvi: 0.3931, ndmi: -0.0896, ndre: null, clearShare: 0.8 },
      { date: 1755993600000, ndvi: 0.4959, ndmi: -0.0734, ndre: 0.284, clearShare: 1 },
    ])
  })

  it('reads the history of a drawn area', async () => {
    fetchMock.mockResolvedValue(json({ features: [] }))
    await getObservations('AREA-1A2B3C4D')
    expect(sentUrl().searchParams.get('where')).toBe("upi = 'AREA-1A2B3C4D'")
  })

  it('returns an empty list for text that is not a UPI', async () => {
    expect(await getObservations('nope')).toEqual([])
    expect(await getObservations("AREA x' OR '1'='1")).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('listParcels', () => {
  const row = (n) => ({
    attributes: { upi: `5/05/10/02/${n}`, district: 'Kirehe', latest_date: 1790294400000 },
    geometry: { rings: [[[30, -2], [30.1, -2], [30, -2.1], [30, -2]]] },
  })

  it('follows paging until the layer has no more rows', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ features: [row(1)], exceededTransferLimit: true }))
      .mockResolvedValueOnce(json({ features: [row(2)] }))
    const result = await listParcels()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentUrl(0).searchParams.get('resultOffset')).toBe('0')
    expect(sentUrl(1).searchParams.get('resultOffset')).toBe('1000')
    expect(result.truncated).toBe(false)
    expect(result.parcels.map((p) => p.upi)).toEqual(['5/05/10/02/1', '5/05/10/02/2'])
    expect(result.parcels[0]).toEqual({
      upi: '5/05/10/02/1',
      district: 'Kirehe',
      latestDate: 1790294400000,
      rings: [[[30, -2], [30.1, -2], [30, -2.1], [30, -2]]],
    })
  })

  it('stops after five pages and says the list is incomplete', async () => {
    fetchMock.mockImplementation(async () => json({ features: [row(1)], exceededTransferLimit: true }))
    const result = await listParcels()
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(result.truncated).toBe(true)
  })

  it('skips rows with no UPI', async () => {
    fetchMock.mockResolvedValue(json({ features: [row(1), { attributes: { upi: null } }] }))
    expect((await listParcels()).parcels).toHaveLength(1)
  })
})

describe('getIndexGuide', () => {
  const guide = {
    features: [
      {
        attributes: {
          code: 'NDVI',
          name: 'Normalized Difference Vegetation Index',
          meaning: 'How much green leaf is on the ground.',
          how_to_read: 'Rises as a crop covers the soil.',
          thresholds: 'below 0.20 bare',
          caveats: 'Small parcels include their surroundings.',
          formula: '(B8 - B4) / (B8 + B4)',
          bands: 'B8 near infrared, B4 red',
          reference: 'Rouse et al. 1974',
          sort_order: 1,
        },
      },
    ],
  }

  it('maps the guide table and asks only once', async () => {
    fetchMock.mockImplementation(async () => json(guide))
    const first = await getIndexGuide()
    const second = await getIndexGuide()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentUrl().pathname).toMatch(/\/FeatureServer\/2\/query$/)
    expect(second).toBe(first)
    expect(first[0]).toEqual({
      code: 'NDVI',
      name: 'Normalized Difference Vegetation Index',
      meaning: 'How much green leaf is on the ground.',
      howToRead: 'Rises as a crop covers the soil.',
      thresholds: 'below 0.20 bare',
      caveats: 'Small parcels include their surroundings.',
      formula: '(B8 - B4) / (B8 + B4)',
      bands: 'B8 near infrared, B4 red',
      reference: 'Rouse et al. 1974',
    })
  })

  it('asks again after a failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(async () => json(guide))
    await expect(getIndexGuide()).rejects.toBeInstanceOf(NetworkError)
    expect(await getIndexGuide()).toHaveLength(1)
  })
})

describe('errors', () => {
  it('raises SessionExpiredError on 401', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Your session has expired. Sign in again.' }, 401))
    await expect(getParcel('5/05/10/02/1939')).rejects.toBeInstanceOf(SessionExpiredError)
  })

  it('raises PortalError with the ArcGIS message', async () => {
    fetchMock.mockResolvedValue(json({ error: { code: 400, message: 'Invalid query' } }))
    await expect(getParcel('5/05/10/02/1939')).rejects.toThrow('Invalid query')
    fetchMock.mockResolvedValue(json({ error: { code: 400, message: 'Invalid query' } }))
    await expect(getParcel('5/05/10/02/1939')).rejects.toBeInstanceOf(PortalError)
  })

  it('raises PortalError with the proxy message', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Could not reach GeoHub. Try again in a moment.' }, 502))
    await expect(getParcel('5/05/10/02/1939')).rejects.toThrow('Could not reach GeoHub. Try again in a moment.')
  })

  it('raises PortalError when the answer is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(getParcel('5/05/10/02/1939')).rejects.toBeInstanceOf(PortalError)
  })

  it('raises NetworkError when the request cannot be sent', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(getParcel('5/05/10/02/1939')).rejects.toBeInstanceOf(NetworkError)
  })

  it('lets a cancelled request reject as AbortError', async () => {
    fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    await expect(getParcel('5/05/10/02/1939')).rejects.toMatchObject({ name: 'AbortError' })
  })
})
