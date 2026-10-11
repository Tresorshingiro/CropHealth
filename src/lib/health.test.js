import { describe, expect, it } from 'vitest'
import { healthSummary, needsAttention, parcelHealth } from './health.js'

const BANDS = 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense'
// The same bands for all three indices keeps the cases easy to read.
const GUIDE = { entries: ['NDVI', 'NDMI', 'NDRE'].map((code) => ({ code, thresholds: BANDS })), error: null }
const p = (upi, ndvi, ndmi, ndre, extra = {}) => ({ upi, district: 'Kirehe', latestDate: 1, ndvi, ndmi, ndre, ...extra })

describe('parcelHealth', () => {
  it('rates a parcel by its worst index and names that index', () => {
    expect(parcelHealth(p('a', 0.6, 0.1, 0.6), GUIDE)).toEqual({ verdict: 'poor', weakest: { key: 'ndmi', code: 'NDMI', value: 0.1 } })
    expect(parcelHealth(p('b', 0.6, 0.62, 0.8), GUIDE)).toEqual({ verdict: 'good', weakest: { key: 'ndvi', code: 'NDVI', value: 0.6 } })
  })

  it('uses only the indices the guide can place', () => {
    const ndviOnly = { entries: [{ code: 'NDVI', thresholds: BANDS }], error: null }
    expect(parcelHealth(p('c', 0.45, -0.3, 0.05), ndviOnly)).toEqual({ verdict: 'moderate', weakest: { key: 'ndvi', code: 'NDVI', value: 0.45 } })
  })

  it('is not rated without a guide or without values', () => {
    expect(parcelHealth(p('d', 0.6, 0.6, 0.6), { entries: null, error: null })).toEqual({ verdict: null, weakest: null })
    expect(parcelHealth(p('e', null, null, null), GUIDE)).toEqual({ verdict: null, weakest: null })
  })
})

describe('healthSummary', () => {
  it('counts parcels by verdict, with the ones that cannot be rated apart', () => {
    const parcels = [p('a', 0.1, 0.6, 0.6), p('b', 0.6, 0.6, 0.6), p('c', 0.45, 0.6, 0.6), p('d', 0.6, 0.6, 0.6), p('e', null, null, null)]
    expect(healthSummary(parcels, GUIDE)).toEqual({ good: 2, moderate: 1, poor: 1, unrated: 1 })
  })
})

describe('needsAttention', () => {
  it('lists Poor parcels before Moderate ones, newest first, leaving out Good and unrated', () => {
    const parcels = [
      p('old poor', 0.1, 0.6, 0.6, { latestDate: 10 }),
      p('moderate', 0.45, 0.6, 0.6, { latestDate: 30 }),
      p('new poor', 0.1, 0.6, 0.6, { latestDate: 20 }),
      p('good', 0.6, 0.6, 0.6, { latestDate: 40 }),
      p('unrated', null, null, null, { latestDate: 50 }),
    ]
    expect(needsAttention(parcels, GUIDE).map((row) => row.parcel.upi)).toEqual(['new poor', 'old poor', 'moderate'])
    expect(needsAttention(parcels, GUIDE, 1)).toHaveLength(1)
  })
})
