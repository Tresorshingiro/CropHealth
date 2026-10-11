// The National Land Authority's public parcel layers (LAIS), asked directly by
// the browser: where a UPI that has not been analysed lies, so the map can show it.
import { LAIS_LAYER_URLS } from '../lib/mapLayers.js'
import { parseUpi } from '../lib/upi.js'

const FIELDS = 'upi,district,sector,cell,village,size'
const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null)

/** 5/05/10/02/1939 as some records write it, 5/5/10/2/1939. */
const unpadded = (upi) => upi.split('/').map(Number).join('/')

/**
 * The land parcel with this UPI, in the same shape as a parcel clicked on the
 * map, or null when no layer has it. The UPI's district is not used to pick a
 * layer, so every layer is asked once; one that fails is skipped.
 */
export async function findLandParcel(input, { signal } = {}) {
  const upi = parseUpi(input)
  if (!upi) return null
  // parseUpi lets only digits and slashes through, so both spellings are safe in the clause.
  const params = new URLSearchParams({
    f: 'json',
    where: `upi IN ('${upi}','${unpadded(upi)}')`,
    outFields: FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '1',
  })
  const answers = await Promise.allSettled(
    LAIS_LAYER_URLS.map(async (url) => {
      const res = await fetch(`${url}/query?${params}`, { signal })
      const data = await res.json()
      if (data?.error) throw new Error(data.error.message)
      return data.features ?? []
    }),
  )
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (answers.every((answer) => answer.status === 'rejected')) {
    throw new Error('The land parcel records could not be reached.')
  }
  const feature = answers.flatMap((answer) => (answer.status === 'fulfilled' ? answer.value : []))
    .find((f) => f?.geometry?.rings?.length)
  if (!feature) return null
  const a = feature.attributes ?? {}
  return {
    upi,
    district: text(a.district),
    sector: text(a.sector),
    cell: text(a.cell),
    village: text(a.village),
    areaM2: typeof a.size === 'number' ? a.size : null,
    rings: feature.geometry.rings,
  }
}
