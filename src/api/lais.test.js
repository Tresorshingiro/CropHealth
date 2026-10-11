import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LAIS_LAYER_URLS } from '../lib/mapLayers.js'
import { findLandParcel } from './lais.js'

const json = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
const RINGS = [[[30.8, -2.2], [30.801, -2.2], [30.801, -2.199], [30.8, -2.2]]]
const FEATURE = {
  attributes: { upi: '2/5/9/1/15', district: 'Nyamagabe', sector: 'Kitabi', cell: 'Mujuga', village: 'Kibilizi', size: 4200 },
  geometry: { rings: RINGS },
}

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('findLandParcel', () => {
  it('looks the UPI up in every NLA parcel layer under both spellings and maps the hit', async () => {
    fetchMock.mockImplementation(async (url) =>
      json({ features: String(url).includes('Nyamagabe_Parcels') ? [FEATURE] : [] }),
    )
    expect(await findLandParcel('2/05/09/01/15')).toEqual({
      upi: '2/05/09/01/15',
      district: 'Nyamagabe',
      sector: 'Kitabi',
      cell: 'Mujuga',
      village: 'Kibilizi',
      areaM2: 4200,
      rings: RINGS,
    })
    expect(fetchMock).toHaveBeenCalledTimes(LAIS_LAYER_URLS.length)
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('where')).toBe("upi IN ('2/05/09/01/15','2/5/9/1/15')")
    expect(url.searchParams.get('outSR')).toBe('4326')
  })

  it('is null when no layer has it, and ignores a layer that fails', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('Kigali_Parcels')) throw new TypeError('network')
      return json({ features: [] })
    })
    expect(await findLandParcel('2/05/09/01/15')).toBeNull()
  })

  it('throws when every layer fails, so the page can say the lookup failed', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('network')
    })
    await expect(findLandParcel('2/05/09/01/15')).rejects.toThrow('The land parcel records could not be reached.')
  })

  it('asks nothing for something that is not a UPI', async () => {
    expect(await findLandParcel("AREA North field")).toBeNull()
    expect(await findLandParcel("1' OR 1=1")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
