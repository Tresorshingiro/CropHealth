import { describe, expect, it } from 'vitest'
import { seasonBands, seasonOf, seasonsBetween, seasonsWithReadings } from './seasons.js'

const day = (y, m, d, h = 0) => Date.UTC(y, m - 1, d, h)
const end = (y, m, d) => Date.UTC(y, m - 1, d + 1) - 1

describe('seasonOf', () => {
  it('names seasons by the year they start in, so A runs from September into the next year', () => {
    expect(seasonOf(day(2026, 9, 1))).toMatchObject({ id: 'A', year: 2026, key: '2026A', label: 'Season A 2026-2027', months: 'Sep – Feb', from: day(2026, 9, 1), to: end(2027, 2, 28) })
    expect(seasonOf(day(2026, 1, 15))).toMatchObject({ id: 'A', year: 2025, label: 'Season A 2025-2026', from: day(2025, 9, 1), to: end(2026, 2, 28) })
    expect(seasonOf(day(2026, 4, 28))).toMatchObject({ id: 'B', year: 2026, months: 'Mar – Jun', from: day(2026, 3, 1), to: end(2026, 6, 30) })
    expect(seasonOf(day(2026, 7, 1))).toMatchObject({ id: 'C', year: 2026, months: 'Jul – Aug', from: day(2026, 7, 1), to: end(2026, 8, 31) })
  })

  it('splits on UTC days at the season edges', () => {
    expect(seasonOf(day(2026, 8, 31, 23)).key).toBe('2026C')
    expect(seasonOf(day(2026, 9, 1, 0)).key).toBe('2026A')
    expect(seasonOf(day(2026, 6, 30, 23)).key).toBe('2026B')
    expect(seasonOf(day(2026, 3, 1)).key).toBe('2026B')
  })

  it('ends Season A on 29 February in a leap year', () => {
    expect(seasonOf(day(2028, 2, 29)).to).toBe(end(2028, 2, 29))
  })
})

describe('seasonsBetween', () => {
  it('lists every season touching a 14-month span', () => {
    expect(seasonsBetween(day(2025, 8, 4), day(2026, 9, 25)).map((s) => s.key)).toEqual(['2025C', '2025A', '2026B', '2026C', '2026A'])
  })
})

describe('seasonBands', () => {
  it('clips the first and last seasons to the span and shades them in turn', () => {
    const bands = seasonBands(day(2025, 8, 4), day(2026, 9, 25))
    expect(bands.map((b) => b.id)).toEqual(['C', 'A', 'B', 'C', 'A'])
    expect(bands.map((b) => b.shade)).toEqual([0, 1, 0, 1, 0])
    expect(bands[0].x1).toBe(day(2025, 8, 4))
    expect(bands[4].x2).toBe(day(2026, 9, 25))
    expect(bands[1]).toMatchObject({ key: '2025A', x1: day(2025, 9, 1), x2: end(2026, 2, 28) })
  })
})

describe('seasonsWithReadings', () => {
  const row = (date, ndvi = 0.4) => ({ date, ndvi, ndmi: 0, ndre: 0.2 })
  const ROWS = [
    { date: day(2025, 4, 10), ndvi: null, ndmi: null, ndre: null },
    row(day(2025, 10, 5)),
    row(day(2026, 4, 10)),
    row(day(2026, 5, 2)),
    row(day(2026, 7, 20)),
    row(day(2026, 9, 25)),
  ]

  it('keeps every season with a reading, oldest first, with their rows', () => {
    const seasons = seasonsWithReadings(ROWS, day(2026, 10, 7))
    expect(seasons.map((s) => s.key)).toEqual(['2025A', '2026B', '2026C', '2026A'])
    expect(seasons.map((s) => s.inProgress)).toEqual([false, false, false, true])
    expect(seasons[1].rows).toHaveLength(2)
  })

  it('skips seasons whose rows have no values', () => {
    expect(seasonsWithReadings(ROWS, day(2026, 10, 7)).map((s) => s.key)).not.toContain('2025B')
  })

  it('gives nothing for no rows', () => {
    expect(seasonsWithReadings([], day(2026, 10, 7))).toEqual([])
  })
})
