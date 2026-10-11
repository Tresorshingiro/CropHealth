import { locate, parseThresholds } from './thresholds.js'

// A verdict places a value in the GIS team's own guide bands, lowest first.
// The mapping is the app's: the bottom bands are Poor, as many top bands Good,
// the rest Moderate; higher is better for all three indices. The GIS team is
// asked to confirm it (spec, open item 1).

export const VERDICT_LABELS = { good: 'Good', moderate: 'Moderate', poor: 'Poor' }
const RANK = { poor: 0, moderate: 1, good: 2 }

export function verdictForBand(index, count) {
  const outer = Math.max(1, Math.floor((count - 1) / 2))
  if (index < outer) return 'poor'
  if (index >= count - outer) return 'good'
  return 'moderate'
}

/** The verdict for a value, or null when there are no bands or no value. */
export function verdictOf(bands, value) {
  const spot = locate(bands, value)
  return spot ? verdictForBand(spot.index, bands.length) : null
}

/** One index's bands from the guide state `{ entries }`, or null. */
export const guideBands = (guide, code) =>
  parseThresholds(guide?.entries?.find((entry) => entry.code === code)?.thresholds)

/** The worst of some verdicts, so a problem is never hidden; null if none. */
export const lowest = (verdicts) =>
  verdicts.filter(Boolean).reduce((low, v) => (low === null || RANK[v] < RANK[low] ? v : low), null)
