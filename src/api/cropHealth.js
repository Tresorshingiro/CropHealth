import { parseParcelId } from '../lib/upi.js'
import { queryAll, queryLayer } from './arcgis.js'

const PARCELS = 0
const OBSERVATIONS = 1
const INDEX_GUIDE = 2

const PARCEL_FIELDS = [
  'upi', 'province', 'district', 'sector', 'cell', 'village', 'area_m2', 'reliability',
  'latest_date', 'ndvi', 'ndmi', 'ndre', 'ndvi_level', 'ndmi_level', 'ndre_level',
  'headline', 'usable_dates', 'last_refreshed',
].join(',')

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null)
const rings = (geometry) => (Array.isArray(geometry?.rings) && geometry.rings.length ? geometry.rings : null)

// `upi` holds a parcel's UPI or a drawn area's id. parseParcelId lets neither
// quotes nor any other SQL through, so the value is safe in a where clause.
const whereUpi = (upi) => `upi = '${upi}'`

function toParcel({ attributes: a = {}, geometry }) {
  return {
    upi: text(a.upi),
    province: text(a.province),
    district: text(a.district),
    sector: text(a.sector),
    cell: text(a.cell),
    village: text(a.village),
    areaM2: num(a.area_m2),
    reliability: text(a.reliability),
    latestDate: num(a.latest_date),
    ndvi: num(a.ndvi),
    ndmi: num(a.ndmi),
    ndre: num(a.ndre),
    ndviLevel: text(a.ndvi_level),
    ndmiLevel: text(a.ndmi_level),
    ndreLevel: text(a.ndre_level),
    headline: text(a.headline),
    usableDates: num(a.usable_dates),
    lastRefreshed: num(a.last_refreshed),
    rings: rings(geometry),
  }
}

export async function getParcel(input, options) {
  const upi = parseParcelId(input)
  if (!upi) return null
  const data = await queryLayer(
    PARCELS,
    { where: whereUpi(upi), outFields: PARCEL_FIELDS, returnGeometry: 'true', outSR: '4326', resultRecordCount: '1' },
    options,
  )
  const feature = data.features?.[0]
  return feature ? toParcel(feature) : null
}

export async function getObservations(input, options) {
  const upi = parseParcelId(input)
  if (!upi) return []
  const { features } = await queryAll(
    OBSERVATIONS,
    {
      where: whereUpi(upi),
      outFields: 'obs_date,ndvi,ndmi,ndre,clear_share',
      orderByFields: 'obs_date ASC',
      returnGeometry: 'false',
    },
    options,
  )
  return features
    .map(({ attributes: a = {} }) => ({
      date: num(a.obs_date),
      ndvi: num(a.ndvi),
      ndmi: num(a.ndmi),
      ndre: num(a.ndre),
      clearShare: num(a.clear_share),
    }))
    .filter((row) => row.date !== null)
    .sort((a, b) => a.date - b.date)
}

export async function listParcels(options) {
  const { features, truncated } = await queryAll(
    PARCELS,
    {
      where: '1=1',
      outFields: 'upi,district,latest_date',
      orderByFields: 'objectid ASC',
      returnGeometry: 'true',
      outSR: '4326',
    },
    options,
  )
  const parcels = features
    .map(({ attributes: a = {}, geometry }) => ({
      upi: text(a.upi),
      district: text(a.district),
      latestDate: num(a.latest_date),
      rings: rings(geometry),
    }))
    .filter((parcel) => parcel.upi !== null)
  return { parcels, truncated }
}

let guidePromise = null

/** The three index explanations. Fetched once; a failure is not cached. */
export function getIndexGuide() {
  if (!guidePromise) {
    guidePromise = queryLayer(INDEX_GUIDE, {
      where: '1=1',
      outFields: '*',
      orderByFields: 'sort_order ASC',
      returnGeometry: 'false',
    })
      .then((data) =>
        (data.features || []).map(({ attributes: a = {} }) => ({
          code: text(a.code),
          name: text(a.name),
          meaning: text(a.meaning),
          howToRead: text(a.how_to_read),
          thresholds: text(a.thresholds),
          caveats: text(a.caveats),
          formula: text(a.formula),
          bands: text(a.bands),
          reference: text(a.reference),
        })),
      )
      .catch((err) => {
        guidePromise = null
        throw err
      })
  }
  return guidePromise
}

export function resetIndexGuideCache() {
  guidePromise = null
}
