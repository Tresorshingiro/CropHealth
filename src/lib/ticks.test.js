import { describe, expect, it } from 'vitest'
import { axisTicks } from './ticks.js'

describe('axisTicks', () => {
  it('covers the values with ticks every 0.2, zero included when crossed', () => {
    expect(axisTicks([-0.3, 0.12, 0.77])).toEqual([-0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8])
  })

  it('returns clean decimals, not floating-point noise', () => {
    expect(axisTicks([0.1, 0.55])).toEqual([0, 0.2, 0.4, 0.6])
    expect(axisTicks([-0.61, -0.45])).toEqual([-0.8, -0.6, -0.4])
  })

  it('keeps a value that sits exactly on a tick inside the range', () => {
    expect(axisTicks([0.2, 0.8])).toEqual([0.2, 0.4, 0.6, 0.8])
  })

  it('gives a flat series room on both sides', () => {
    expect(axisTicks([0.4, 0.4])).toEqual([0.4, 0.6])
    expect(axisTicks([0.33])).toEqual([0.2, 0.4])
  })

  it('ignores missing values and falls back to 0–1 when there are none', () => {
    expect(axisTicks([null, undefined, NaN, 0.5])).toEqual([0.4, 0.6])
    expect(axisTicks([null])).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
    expect(axisTicks([])).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })
})
