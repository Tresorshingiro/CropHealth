import { SERIES } from '../theme/palette.js'
import { guideBands, verdictOf } from './verdict.js'

// A parcel's crop health across its three latest indices: the same rule as
// the report's summary line, so the overview and the report never disagree.
const RANK = { poor: 0, moderate: 1, good: 2 }

/**
 * `{ verdict, weakest }`: the worst verdict among the indices the guide can
 * place, and the index that gave it (the first in NDVI, NDMI, NDRE order on
 * a tie). Both null when nothing can be rated.
 */
export function parcelHealth(parcel, guide) {
  let worst = null
  for (const s of SERIES) {
    const verdict = verdictOf(guideBands(guide, s.code), parcel[s.key])
    if (verdict && (!worst || RANK[verdict] < RANK[worst.verdict])) {
      worst = { verdict, weakest: { key: s.key, code: s.code, value: parcel[s.key] } }
    }
  }
  return worst ?? { verdict: null, weakest: null }
}

/** How many parcels are Good, Moderate, Poor, or cannot be rated. */
export function healthSummary(parcels, guide) {
  const counts = { good: 0, moderate: 0, poor: 0, unrated: 0 }
  for (const parcel of parcels) counts[parcelHealth(parcel, guide).verdict ?? 'unrated'] += 1
  return counts
}

export const NO_DISTRICT = 'No district'

/**
 * Parcels per district, each with its health split: `[{ label, counts }]`,
 * largest first, then by name, parcels with no district last.
 */
export function districtHealth(parcels, guide) {
  const byDistrict = new Map()
  for (const parcel of parcels) {
    const label = parcel.district || NO_DISTRICT
    const counts = byDistrict.get(label) ?? { good: 0, moderate: 0, poor: 0, unrated: 0, total: 0 }
    counts[parcelHealth(parcel, guide).verdict ?? 'unrated'] += 1
    counts.total += 1
    byDistrict.set(label, counts)
  }
  return [...byDistrict]
    .map(([label, counts]) => ({ label, counts }))
    .sort(
      (a, b) =>
        (a.label === NO_DISTRICT) - (b.label === NO_DISTRICT) ||
        b.counts.total - a.counts.total ||
        a.label.localeCompare(b.label),
    )
}

/** The parcels in one district (all of them for null). */
export const inDistrict = (parcels, district) =>
  district ? parcels.filter((parcel) => (parcel.district || NO_DISTRICT) === district) : parcels

/** What the overview's health chips can pick: every area, or one verdict. None picked is "needs attention". */
export const HEALTH_FILTERS = ['all', 'good', 'moderate', 'poor']
export const parseHealthFilter = (value) => (HEALTH_FILTERS.includes(value) ? value : null)

const LIST_RANK = { poor: 0, moderate: 1, good: 2, unrated: 3 }

/**
 * The overview's list for a health filter, worst first, newest reading first:
 * null = Poor and Moderate (needs attention), 'all' = every area, or one verdict.
 */
export function areasFor(parcels, guide, filter = null) {
  if (filter === null) return needsAttention(parcels, guide, Infinity)
  return parcels
    .map((parcel) => ({ parcel, ...parcelHealth(parcel, guide) }))
    .filter((row) => filter === 'all' || row.verdict === filter)
    .sort(
      (a, b) =>
        LIST_RANK[a.verdict ?? 'unrated'] - LIST_RANK[b.verdict ?? 'unrated'] ||
        (b.parcel.latestDate ?? 0) - (a.parcel.latestDate ?? 0),
    )
}

/** The parcels the map outlines for a health filter: all of them unless one verdict is picked. */
export const withHealth = (parcels, guide, filter) =>
  filter && filter !== 'all' ? parcels.filter((parcel) => parcelHealth(parcel, guide).verdict === filter) : parcels

/** Poor parcels, then Moderate ones, newest reading first: the ones worth a look. */
export function needsAttention(parcels, guide, limit = 8) {
  return parcels
    .map((parcel) => ({ parcel, ...parcelHealth(parcel, guide) }))
    .filter((row) => row.verdict === 'poor' || row.verdict === 'moderate')
    .sort((a, b) => RANK[a.verdict] - RANK[b.verdict] || (b.parcel.latestDate ?? 0) - (a.parcel.latestDate ?? 0))
    .slice(0, limit)
}
