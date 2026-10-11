// Rwanda's farming seasons, named by the year they start in:
//   A: 1 September to the end of February of the next year
//   B: 1 March to 30 June
//   C: 1 July to 31 August
// So Season A 2025-2026 (Sep 2025 – Feb 2026) is followed by Season B 2026.
// Months are 0-based (8 is September). Days are UTC, as in lib/range.js.
// The GIS team is asked to confirm the months (spec, open item 2).
export const SEASON_A_START = 8
export const SEASON_B_START = 2
export const SEASON_C_START = 6
const MONTHS = { A: 'Sep – Feb', B: 'Mar – Jun', C: 'Jul – Aug' }
const KEYS = ['ndvi', 'ndmi', 'ndre']

/** `until` is the first moment after the season. */
const season = (id, year, from, until) => ({
  id,
  year,
  key: `${year}${id}`,
  // A spans the new year: "Season A 2026-2027"; B and C: "Season B 2026".
  label: id === 'A' ? `Season A ${year}-${year + 1}` : `Season ${id} ${year}`,
  months: MONTHS[id],
  from,
  to: until - 1,
})

export function seasonOf(ms) {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  if (m >= SEASON_A_START) return season('A', y, Date.UTC(y, SEASON_A_START, 1), Date.UTC(y + 1, SEASON_B_START, 1))
  if (m < SEASON_B_START) return season('A', y - 1, Date.UTC(y - 1, SEASON_A_START, 1), Date.UTC(y, SEASON_B_START, 1))
  if (m < SEASON_C_START) return season('B', y, Date.UTC(y, SEASON_B_START, 1), Date.UTC(y, SEASON_C_START, 1))
  return season('C', y, Date.UTC(y, SEASON_C_START, 1), Date.UTC(y, SEASON_A_START, 1))
}

/** Every season that touches `from`–`to`, in order. */
export function seasonsBetween(from, to) {
  const list = []
  for (let s = seasonOf(from); s.from <= to; s = seasonOf(s.to + 1)) list.push(s)
  return list
}

const hasReading = (row) => KEYS.some((key) => typeof row[key] === 'number' && Number.isFinite(row[key]))

/**
 * Every season with at least one clear reading, oldest first, each with its
 * rows and whether `now` falls in it.
 */
export function seasonsWithReadings(rows, now = Date.now()) {
  const byKey = new Map()
  for (const row of rows) {
    if (!hasReading(row)) continue
    const s = seasonOf(row.date)
    const entry = byKey.get(s.key) ?? { ...s, inProgress: now >= s.from && now <= s.to, rows: [] }
    entry.rows.push(row)
    byKey.set(s.key, entry)
  }
  return [...byKey.values()].sort((a, b) => a.from - b.from)
}

/** The seasons behind a chart that shows `from`–`to`: clipped to it, shaded in turn. */
export function seasonBands(from, to) {
  return seasonsBetween(from, to).map((s, i) => ({
    key: s.key,
    id: s.id,
    x1: Math.max(s.from, from),
    x2: Math.min(s.to, to),
    shade: i % 2,
  }))
}
