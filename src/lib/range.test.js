import { describe, expect, it } from 'vitest'
import {
  DAY,
  dragRange,
  filterRange,
  formatDay,
  imageWindow,
  inRange,
  parseDay,
  parseRange,
  presetOf,
  presetRange,
  rangeParams,
} from './range.js'

const NOW = Date.UTC(2026, 9, 6, 9, 30) // 6 Oct 2026, 09:30 UTC
const END_OF_TODAY = Date.UTC(2026, 9, 7) - 1
const params = (text) => new URLSearchParams(text)

describe('presets', () => {
  it('counts back whole months from today and ends at the end of today', () => {
    expect(presetRange('1m', NOW)).toEqual({ from: Date.UTC(2026, 8, 6), to: END_OF_TODAY })
    expect(presetRange('3m', NOW)).toEqual({ from: Date.UTC(2026, 6, 6), to: END_OF_TODAY })
    expect(presetRange('12m', NOW)).toEqual({ from: Date.UTC(2025, 9, 6), to: END_OF_TODAY })
  })

  it('falls back to the last day of a shorter month', () => {
    expect(presetRange('1m', Date.UTC(2026, 2, 31, 12)).from).toBe(Date.UTC(2026, 1, 28))
  })

  it('has no bounds for All or an unknown preset', () => {
    expect(presetRange('all', NOW)).toBeNull()
    expect(presetRange('nope', NOW)).toBeNull()
  })

  it('names the preset a range matches', () => {
    expect(presetOf(null, NOW)).toBe('all')
    expect(presetOf(presetRange('6m', NOW), NOW)).toBe('6m')
    expect(presetOf({ from: Date.UTC(2026, 2, 1), to: Date.UTC(2026, 3, 1) - 1 }, NOW)).toBeNull()
  })
})

describe('the range in the link', () => {
  it('reads both ends as whole UTC days', () => {
    expect(parseRange(params('from=2026-03-01&to=2026-04-30'))).toEqual({
      from: Date.UTC(2026, 2, 1),
      to: Date.UTC(2026, 4, 1) - 1,
    })
  })

  it('swaps a reversed pair', () => {
    expect(parseRange(params('from=2026-04-30&to=2026-03-01'))).toEqual({
      from: Date.UTC(2026, 2, 1),
      to: Date.UTC(2026, 4, 1) - 1,
    })
  })

  it('ignores a missing end, a non-date and a day that does not exist', () => {
    expect(parseRange(params('from=2026-03-01'))).toBeNull()
    expect(parseRange(params('from=yesterday&to=2026-03-01'))).toBeNull()
    expect(parseRange(params('from=2026-02-30&to=2026-03-01'))).toBeNull()
    expect(parseDay('2026-3-1')).toBeNull()
  })

  it('writes a range back to the link and clears it for All', () => {
    const range = parseRange(params('from=2026-03-01&to=2026-04-30'))
    expect(rangeParams(range)).toEqual({ from: '2026-03-01', to: '2026-04-30' })
    expect(rangeParams(null)).toEqual({ from: null, to: null })
    expect(formatDay(Date.UTC(2026, 0, 5, 23))).toBe('2026-01-05')
  })
})

describe('filtering', () => {
  const range = { from: Date.UTC(2026, 2, 1), to: Date.UTC(2026, 3, 1) - 1 }

  it('includes both ends of the range', () => {
    expect(inRange(range.from, range)).toBe(true)
    expect(inRange(range.to, range)).toBe(true)
    expect(inRange(range.to + 1, range)).toBe(false)
    expect(inRange(range.from - 1, range)).toBe(false)
    expect(inRange(0, null)).toBe(true)
  })

  it('keeps only the rows inside the range', () => {
    const rows = [{ date: Date.UTC(2026, 1, 28) }, { date: Date.UTC(2026, 2, 15) }, { date: Date.UTC(2026, 3, 2) }]
    expect(filterRange(rows, range)).toEqual([{ date: Date.UTC(2026, 2, 15) }])
    expect(filterRange(rows, null)).toEqual(rows)
  })
})

describe('dragRange', () => {
  it('makes whole days from two dates in either order', () => {
    expect(dragRange(Date.UTC(2026, 3, 28, 8), Date.UTC(2026, 2, 3, 8))).toEqual({
      from: Date.UTC(2026, 2, 3),
      to: Date.UTC(2026, 3, 29) - 1,
    })
  })

  it('is no range when both dates fall on one day', () => {
    expect(dragRange(Date.UTC(2026, 3, 28, 1), Date.UTC(2026, 3, 28, 22))).toBeNull()
  })
})

describe('imageWindow', () => {
  it('is the 30 days ending today for All', () => {
    expect(imageWindow(null, NOW)).toEqual({ from: Date.UTC(2026, 9, 6) - 29 * DAY, to: END_OF_TODAY })
  })

  it('is the last 30 days of a long range', () => {
    const range = { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 4, 1) - 1 }
    expect(imageWindow(range, NOW)).toEqual({ from: Date.UTC(2026, 3, 30) - 29 * DAY, to: range.to })
  })

  it('is the whole of a range shorter than 30 days', () => {
    const range = { from: Date.UTC(2026, 3, 20), to: Date.UTC(2026, 4, 1) - 1 }
    expect(imageWindow(range, NOW)).toEqual(range)
  })
})
