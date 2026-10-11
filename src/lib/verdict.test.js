import { describe, expect, it } from 'vitest'
import { parseThresholds } from './thresholds.js'
import { guideBands, lowest, verdictForBand, verdictOf } from './verdict.js'

const NDVI = 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense'

describe('verdictForBand', () => {
  it('splits five bands two Poor, one Moderate, two Good', () => {
    expect([0, 1, 2, 3, 4].map((i) => verdictForBand(i, 5))).toEqual(['poor', 'poor', 'moderate', 'good', 'good'])
  })
  it('splits four, three and two bands', () => {
    expect([0, 1, 2, 3].map((i) => verdictForBand(i, 4))).toEqual(['poor', 'moderate', 'moderate', 'good'])
    expect([0, 1, 2].map((i) => verdictForBand(i, 3))).toEqual(['poor', 'moderate', 'good'])
    expect([0, 1].map((i) => verdictForBand(i, 2))).toEqual(['poor', 'good'])
  })
})

describe('verdictOf', () => {
  const bands = parseThresholds(NDVI)
  it('places a value in the guide bands', () => {
    expect(verdictOf(bands, 0.14)).toBe('poor')
    expect(verdictOf(bands, 0.45)).toBe('moderate')
    expect(verdictOf(bands, 0.62)).toBe('good')
    expect(verdictOf(bands, 0.9)).toBe('good')
  })
  it('puts a value on a band edge in the band above it', () => {
    expect(verdictOf(bands, 0.2)).toBe('poor') // very sparse
    expect(verdictOf(bands, 0.35)).toBe('moderate') // growing
    expect(verdictOf(bands, 0.55)).toBe('good') // full canopy
  })
  it('gives no verdict without bands or without a value', () => {
    expect(verdictOf(null, 0.5)).toBeNull()
    expect(verdictOf(bands, null)).toBeNull()
    expect(verdictOf(bands, Number.NaN)).toBeNull()
  })
})

describe('guideBands', () => {
  it("reads one index's bands from the guide", () => {
    const guide = { entries: [{ code: 'NDVI', thresholds: NDVI }, { code: 'NDMI', thresholds: 'not bands' }] }
    expect(guideBands(guide, 'NDVI')).toHaveLength(5)
    expect(guideBands(guide, 'NDMI')).toBeNull()
    expect(guideBands(guide, 'NDRE')).toBeNull()
    expect(guideBands(null, 'NDVI')).toBeNull()
    expect(guideBands({ entries: null }, 'NDVI')).toBeNull()
  })
})

describe('lowest', () => {
  it('picks the worst verdict, skipping missing ones', () => {
    expect(lowest(['good', 'moderate', 'good'])).toBe('moderate')
    expect(lowest(['good', null, 'poor'])).toBe('poor')
    expect(lowest([null])).toBeNull()
  })
})
