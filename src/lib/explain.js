import { lowest, VERDICT_LABELS } from './verdict.js'

// Every sentence the app uses to explain a verdict, in one place, so the
// wording is easy to correct.

export const SENTENCES = {
  ndvi: {
    good: 'Dense green cover: the crop is growing well.',
    moderate: 'Partial green cover: the crop is still growing, or the field is only partly planted.',
    poor: 'Little green cover: bare soil, a recent harvest, or crops under stress.',
  },
  ndmi: {
    good: 'Leaves hold plenty of water.',
    moderate: 'Some water stress is possible.',
    poor: 'Dry: the crop may be short of water.',
  },
  ndre: {
    good: 'High chlorophyll: the crop is well fed and active.',
    moderate: 'Medium chlorophyll.',
    poor: 'Low chlorophyll: possible nutrient stress, or the crop is young or ripening.',
  },
}

export const SEASON_NOTE =
  'Values are naturally low just after planting and after harvest. Compare with the same season last year.'

export const sentence = (key, verdict) => SENTENCES[key]?.[verdict] ?? null

const NAMES = { ndvi: 'green cover', ndmi: 'moisture', ndre: 'chlorophyll' }
const ORDER = ['good', 'moderate', 'poor']
const and = (words) => (words.length < 2 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`)

/**
 * The report's summary line from the latest verdicts `{ ndvi, ndmi, ndre }`:
 * the lowest verdict, and the indices grouped by verdict. Null with none.
 */
export function summary(verdicts) {
  const keys = Object.keys(NAMES).filter((key) => verdicts[key])
  if (keys.length === 0) return null
  const parts = []
  for (const v of ORDER) {
    const group = keys.filter((key) => verdicts[key] === v)
    if (group.length) {
      parts.push(`${and(group.map((key) => NAMES[key]))} ${group.length > 1 ? 'are' : 'is'} ${VERDICT_LABELS[v].toLowerCase()}`)
    }
  }
  const text = parts.join('; ')
  return { verdict: lowest(keys.map((key) => verdicts[key])), text: `${text[0].toUpperCase()}${text.slice(1)}.` }
}
