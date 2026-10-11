import { describe, expect, it } from 'vitest'
import {
  formatChange,
  formatDate,
  formatHectares,
  formatIndex,
  formatMonth,
  formatRange,
  formatScene,
} from './format.js'

describe('formatChange', () => {
  it('shows the sign of a change', () => {
    expect(formatChange(0.3)).toBe('+0.30')
    expect(formatChange(-0.12)).toBe('-0.12')
    expect(formatChange(0.001)).toBe('0.00')
    expect(formatChange(-0.004)).toBe('0.00')
    expect(formatChange(null)).toBe('–')
  })
})

describe('formatRange', () => {
  it('writes a period, or All dates', () => {
    expect(formatRange({ from: Date.UTC(2026, 2, 1), to: Date.UTC(2026, 4, 1) - 1 })).toBe('1 Mar 2026 – 30 Apr 2026')
    expect(formatRange(null)).toBe('All dates')
  })
})

describe('formatScene', () => {
  it('names the image date and the tile cloud share', () => {
    expect(formatScene({ date: Date.UTC(2026, 3, 28, 8), cloud: 0 })).toBe('Image 28 Apr 2026 · cloud 0%')
    expect(formatScene({ date: Date.UTC(2026, 3, 28, 8), cloud: 0.126 })).toBe('Image 28 Apr 2026 · cloud 13%')
    expect(formatScene({ date: Date.UTC(2026, 3, 28, 8), cloud: null })).toBe('Image 28 Apr 2026')
    expect(formatScene(null)).toBe('–')
  })
})

describe('formatIndex', () => {
  it('rounds to two decimals', () => {
    expect(formatIndex(0.1394)).toBe('0.14')
    expect(formatIndex(-0.2968)).toBe('-0.30')
    expect(formatIndex(0.0684)).toBe('0.07')
  })

  it('never shows a negative zero', () => {
    expect(formatIndex(-0.004)).toBe('0.00')
  })

  it('shows a dash for anything that is not a finite number', () => {
    for (const value of [null, undefined, NaN, Infinity, '0.5', {}]) {
      expect(formatIndex(value)).toBe('–')
    }
  })
})

describe('formatDate', () => {
  it('formats an epoch value as day, short month, year in UTC', () => {
    expect(formatDate(1790294400000)).toBe('25 Sep 2026')
    expect(formatDate(1754265600000)).toBe('4 Aug 2025')
  })

  it('shows a dash for a missing date', () => {
    expect(formatDate(null)).toBe('–')
    expect(formatDate(undefined)).toBe('–')
    expect(formatDate(NaN)).toBe('–')
  })
})

describe('formatMonth', () => {
  it('formats month and year', () => {
    expect(formatMonth(1790294400000)).toBe('Sep 2026')
  })
})

describe('formatHectares', () => {
  it('converts square metres to hectares', () => {
    expect(formatHectares(18477.8)).toBe('1.85 ha')
  })

  it('shows a dash for a missing area', () => {
    expect(formatHectares(null)).toBe('–')
  })
})
