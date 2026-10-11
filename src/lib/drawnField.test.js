import { describe, expect, it } from 'vitest'
import { checkField, crossesItself, defaultFieldName, fieldName, insideRings, ringAreaM2 } from './drawnField.js'

// A square country around the test fields, so the checks do not depend on Rwanda's border.
const COUNTRY = [[[30, -3], [31, -3], [31, -1], [30, -1], [30, -3]]]
const square = (x, y, side) => [[x, y], [x + side, y], [x + side, y + side], [x, y + side], [x, y]]

describe('ringAreaM2', () => {
  it('measures a 0.001° square near the equator as about 1.24 ha', () => {
    const area = ringAreaM2(square(30.8, -2.2, 0.001))
    expect(area).toBeGreaterThan(12000)
    expect(area).toBeLessThan(12600)
  })
})

describe('crossesItself', () => {
  it('finds a bow tie and passes a square', () => {
    expect(crossesItself([[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]])).toBe(true)
    expect(crossesItself(square(0, 0, 1))).toBe(false)
  })
})

describe('insideRings', () => {
  it('tells points inside and outside Rwanda apart', () => {
    expect(insideRings([30.06, -1.95])).toBe(true) // Kigali
    expect(insideRings([32.58, 0.35])).toBe(false) // Kampala
  })
})

describe('checkField', () => {
  it('accepts a small field and closes an outline the map left open', () => {
    const clockwise = [...square(30.8, -2.2, 0.001)].reverse()
    const result = checkField([clockwise.slice(0, -1)], COUNTRY)
    expect(result.ok).toBe(true)
    expect(result.rings[0]).toEqual(clockwise)
    expect(result.areaM2).toBeGreaterThan(12000)
  })

  it('turns a counter-clockwise outline clockwise, since a lone counter-clockwise ring is a hole to ArcGIS', () => {
    const counter = square(30.8, -2.2, 0.001) // east, north, west, south: counter-clockwise
    const result = checkField([counter], COUNTRY)
    expect(result.ok).toBe(true)
    expect(result.rings[0]).toEqual([...counter].reverse())
  })

  it('refuses a crossing outline, too few points, or too many', () => {
    expect(checkField([[[30.8, -2.2], [30.801, -2.199], [30.801, -2.2], [30.8, -2.199]]], COUNTRY)).toEqual({ ok: false, message: 'The outline crosses itself. Draw it again.' })
    expect(checkField([[[30.8, -2.2], [30.801, -2.2]]], COUNTRY)).toEqual({ ok: false, message: 'Click at least three points to outline the field.' })
    const many = Array.from({ length: 501 }, (_, i) => {
      const angle = (2 * Math.PI * i) / 501
      return [30.8 + 0.001 * Math.cos(angle), -2.2 + 0.001 * Math.sin(angle)]
    })
    expect(checkField([many], COUNTRY)).toEqual({ ok: false, message: 'Draw the field with at most 500 points.' })
  })

  it('refuses a field outside the country, too small, too large or too wide', () => {
    expect(checkField([square(32.5, 0.3, 0.001)], COUNTRY).message).toBe('Draw a field inside Rwanda.')
    expect(checkField([square(30.8, -2.2, 0.0001)], COUNTRY).message).toBe('Draw a field between 0.05 and 500 hectares.')
    expect(checkField([square(30.8, -2.2, 0.04)], COUNTRY).message).toBe('Draw a field between 0.05 and 500 hectares.')
    const strip = [[30.8, -2.2], [30.86, -2.2], [30.86, -2.1995], [30.8, -2.1995], [30.8, -2.2]]
    expect(checkField([strip], COUNTRY).message).toBe('Draw a field at most about 5 km across.')
  })
})

describe('fieldName', () => {
  it('accepts names the tool keeps as they are, trimmed', () => {
    expect(fieldName(' North field ')).toBe('North field')
    expect(fieldName('Plot_7-B')).toBe('Plot_7-B')
    expect(fieldName('a'.repeat(26))).toBe('a'.repeat(26))
  })
  it('refuses empty, long, doubled-space or other characters', () => {
    for (const text of ['', '   ', 'a'.repeat(27), 'two  spaces', "North' field", 'Café', null]) {
      expect(fieldName(text)).toBeNull()
    }
  })
})

describe('defaultFieldName', () => {
  it('names a field after the local day and time it was drawn', () => {
    expect(defaultFieldName(new Date(2026, 9, 7, 14, 32))).toBe('Field 07 Oct 1432')
    expect(fieldName(defaultFieldName(new Date(2026, 0, 3, 9, 5)))).toBe('Field 03 Jan 0905')
  })
})
