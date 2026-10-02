import { describe, expect, it } from 'vitest'
import { locate, parseThresholds } from './thresholds.js'

const NDVI = 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense'
const NDMI = 'below -0.20 very dry; -0.20-0 dry; 0-0.20 moderately moist; 0.20-0.40 moist; above 0.40 very wet'

describe('parseThresholds', () => {
  it('reads the bands of the index guide', () => {
    expect(parseThresholds(NDVI)).toEqual([
      { from: -Infinity, to: 0.2, label: 'bare' },
      { from: 0.2, to: 0.35, label: 'very sparse' },
      { from: 0.35, to: 0.55, label: 'growing' },
      { from: 0.55, to: 0.75, label: 'full canopy' },
      { from: 0.75, to: Infinity, label: 'dense' },
    ])
  })

  it('reads negative bounds', () => {
    const bands = parseThresholds(NDMI)
    expect(bands.map((b) => b.to)).toEqual([-0.2, 0, 0.2, 0.4, Infinity])
    expect(bands[1]).toEqual({ from: -0.2, to: 0, label: 'dry' })
  })

  it.each([
    ['nothing', null],
    ['a number', 7],
    ['free text', 'low is bad, high is good'],
    ['a single band', 'below 0.2 bare'],
    ['a gap between bands', 'below 0.20 bare; 0.30-0.50 growing; above 0.50 dense'],
    ['bands out of order', 'below 0.50 bare; 0.50-0.20 growing; above 0.20 dense'],
    ['no open first band', '0.10-0.20 bare; above 0.20 dense'],
    ['no open last band', 'below 0.20 bare; 0.20-0.40 dense'],
  ])('returns null for %s', (_, text) => {
    expect(parseThresholds(text)).toBeNull()
  })
})

describe('locate', () => {
  const ndvi = parseThresholds(NDVI)
  const ndmi = parseThresholds(NDMI)

  it('finds the band and a position along equal-width bands', () => {
    const spot = locate(ndvi, 0.45)
    expect(spot.index).toBe(2)
    expect(spot.position).toBeCloseTo(0.5)
  })

  it('places a value in an open-ended band using its neighbour width', () => {
    expect(locate(ndvi, 0.1394).index).toBe(0)
    expect(locate(ndvi, 0.1394).position).toBeCloseTo(0.119, 2)
    expect(locate(ndmi, -0.2968).index).toBe(0)
    expect(locate(ndvi, 0.9).index).toBe(4)
    expect(locate(ndvi, 0.9).position).toBeCloseTo(0.95)
  })

  it('puts a value on a boundary in the upper band', () => {
    expect(locate(ndvi, 0.2).index).toBe(1)
  })

  it('keeps extreme values on the scale', () => {
    expect(locate(ndvi, -3).position).toBe(0)
    expect(locate(ndvi, 5).position).toBe(1)
  })

  it('returns null without bands or without a number', () => {
    expect(locate(null, 0.5)).toBeNull()
    expect(locate(ndvi, null)).toBeNull()
    expect(locate(ndvi, NaN)).toBeNull()
  })
})
