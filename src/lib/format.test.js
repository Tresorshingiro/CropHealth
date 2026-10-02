import { describe, expect, it } from 'vitest'
import { formatDate, formatHectares, formatIndex, formatMonth } from './format.js'

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
