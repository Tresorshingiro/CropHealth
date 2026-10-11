import { describe, expect, it } from 'vitest'
import { summarise } from './stats.js'

const D1 = Date.UTC(2026, 2, 1)
const D2 = Date.UTC(2026, 2, 11)
const D3 = Date.UTC(2026, 2, 21)

describe('summarise', () => {
  it('gives average, lowest, highest, change and count, in date order whatever the row order', () => {
    const rows = [
      { date: D3, ndvi: 0.6 },
      { date: D1, ndvi: 0.2 },
      { date: D2, ndvi: 0.4 },
    ]
    const s = summarise(rows, 'ndvi')
    expect(s.mean).toBeCloseTo(0.4)
    expect(s.min).toBe(0.2)
    expect(s.max).toBe(0.6)
    expect(s.change).toBeCloseTo(0.4)
    expect(s.count).toBe(3)
  })

  it('skips missing values', () => {
    const rows = [
      { date: D1, ndmi: null },
      { date: D2, ndmi: -0.1 },
      { date: D3, ndmi: Number.NaN },
    ]
    expect(summarise(rows, 'ndmi')).toEqual({ mean: -0.1, min: -0.1, max: -0.1, change: null, count: 1 })
  })

  it('is empty when there is nothing to count', () => {
    expect(summarise([], 'ndre')).toEqual({ mean: null, min: null, max: null, change: null, count: 0 })
  })

  it('keeps the sign of a fall', () => {
    expect(summarise([{ date: D1, ndre: 0.5 }, { date: D2, ndre: 0.2 }], 'ndre').change).toBeCloseTo(-0.3)
  })
})
