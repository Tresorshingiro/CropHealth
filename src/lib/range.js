// A date range is { from, to } in ms: whole UTC days, both ends included. null
// means all dates. In the link it is ?from=YYYY-MM-DD&to=YYYY-MM-DD.

export const DAY = 24 * 60 * 60 * 1000

export const PRESETS = [
  { id: '1m', label: '1 month', months: 1 },
  { id: '3m', label: '3 months', months: 3 },
  { id: '6m', label: '6 months', months: 6 },
  { id: '12m', label: '12 months', months: 12 },
  { id: 'all', label: 'All', months: null },
]

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

export const startOfDay = (ms) => Math.floor(ms / DAY) * DAY
export const endOfDay = (ms) => startOfDay(ms) + DAY - 1

/** The same day `months` earlier; the 31st falls back to a shorter month's last day. */
function monthsBack(ms, months) {
  const d = new Date(ms)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() - months
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Date.UTC(year, month, Math.min(d.getUTCDate(), last))
}

/** The range a preset stands for, counted back from `now`; null for All. */
export function presetRange(id, now = Date.now()) {
  const preset = PRESETS.find((item) => item.id === id)
  if (!preset?.months) return null
  return { from: monthsBack(startOfDay(now), preset.months), to: endOfDay(now) }
}

/** Which preset a range matches: 'all' for null, null for a range of the user's own. */
export function presetOf(range, now = Date.now()) {
  if (!range) return 'all'
  const match = PRESETS.find((item) => {
    const preset = presetRange(item.id, now)
    return preset && preset.from === range.from && preset.to === range.to
  })
  return match ? match.id : null
}

export const formatDay = (ms) => new Date(ms).toISOString().slice(0, 10)

export function parseDay(text) {
  const m = ISO_DAY.exec(typeof text === 'string' ? text : '')
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // Date.UTC rolls 2026-02-30 over into March: a day that does not exist is not read.
  return formatDay(ms) === text ? ms : null
}

/** The range in a link's params; null (all dates) unless both ends are real days. */
export function parseRange(params) {
  let from = parseDay(params.get('from'))
  let to = parseDay(params.get('to'))
  if (from === null || to === null) return null
  if (from > to) [from, to] = [to, from]
  return { from, to: endOfDay(to) }
}

/** The link params for a range; null values remove them. */
export const rangeParams = (range) =>
  range ? { from: formatDay(range.from), to: formatDay(range.to) } : { from: null, to: null }

export const inRange = (ms, range) => !range || (ms >= range.from && ms <= range.to)

export const filterRange = (rows, range) => rows.filter((row) => inRange(row.date, range))

/** A range from two dates picked on the chart, in either order; null when both fall on one day. */
export function dragRange(a, b) {
  const from = startOfDay(Math.min(a, b))
  const to = endOfDay(Math.max(a, b))
  return to - from < DAY ? null : { from, to }
}

/**
 * Where the map image is chosen from: the last 30 days of the range, so a long
 * range still shows a recent picture. For all dates, the 30 days ending today.
 */
export function imageWindow(range, now = Date.now()) {
  const to = range ? range.to : endOfDay(now)
  const from = startOfDay(to) - 29 * DAY
  return { from: range ? Math.max(range.from, from) : from, to }
}
