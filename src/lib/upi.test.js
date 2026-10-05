import { describe, expect, it } from 'vitest'
import { isAreaId, parseAreaId, parseParcelId, parseUpi } from './upi.js'

describe('parseUpi', () => {
  it('accepts a well-formed UPI', () => {
    expect(parseUpi('5/05/10/02/1939')).toBe('5/05/10/02/1939')
    expect(parseUpi('1/01/01/01/7')).toBe('1/01/01/01/7')
  })

  it('removes surrounding whitespace and whitespace around the slashes', () => {
    expect(parseUpi('  5/05/10/02/1939\n')).toBe('5/05/10/02/1939')
    expect(parseUpi('5 / 05 / 10 / 02 / 1939')).toBe('5/05/10/02/1939')
    expect(parseUpi('5/05/10/02/1939\t')).toBe('5/05/10/02/1939')
  })

  it('writes short parts the way the analysis tool stores them', () => {
    expect(parseUpi('5/5/10/2/1939')).toBe('5/05/10/02/1939')
    expect(parseUpi('5/2/6/6/1702')).toBe('5/02/06/06/1702')
    expect(parseUpi('5/05/10/02/001939')).toBe('5/05/10/02/1939')
  })

  it('rejects anything else', () => {
    const bad = [
      '',
      '   ',
      '5/05/10/02',
      '5/05/10/02/',
      '55/05/10/02/1939',
      '5/005/10/02/1939',
      '5/05/10/02/1234567',
      '5/05/10/02/19 39',
      '5-05-10-02-1939',
      '5/05/10/02/19a9',
      "5/05/10/02/1939' OR '1'='1",
      '5/05/10/02/1939;--',
      'AREA-1A2B3C4D',
      null,
      undefined,
      42,
    ]
    for (const value of bad) expect(parseUpi(value), String(value)).toBeNull()
  })
})

describe('parseAreaId', () => {
  it('accepts the ids the analysis tool gives drawn areas', () => {
    expect(parseAreaId('AREA-1A2B3C4D')).toBe('AREA-1A2B3C4D')
    expect(parseAreaId('AREA North field')).toBe('AREA North field')
    expect(parseAreaId('AREA plot_7-b')).toBe('AREA plot_7-b')
  })

  it('tidies case, spacing and surrounding whitespace', () => {
    expect(parseAreaId('  area-1a2b3c4d ')).toBe('AREA-1A2B3C4D')
    expect(parseAreaId('Area   North field')).toBe('AREA North field')
  })

  it('rejects anything that could not be such an id', () => {
    const bad = [
      '',
      'AREA',
      'AREA ',
      'AREA-1A2B3C',
      'AREA-1A2B3C4D5',
      'AREA-GGGGGGGG',
      'AREAX',
      "AREA x' OR '1'='1",
      'AREA a;b',
      'AREA a%',
      `AREA ${'x'.repeat(27)}`,
      '5/05/10/02/1939',
      null,
      7,
    ]
    for (const value of bad) expect(parseAreaId(value), String(value)).toBeNull()
  })

  it('allows a name of up to 26 characters', () => {
    expect(parseAreaId(`AREA ${'x'.repeat(26)}`)).toBe(`AREA ${'x'.repeat(26)}`)
  })
})

describe('parseParcelId', () => {
  it('takes a UPI or a drawn area id', () => {
    expect(parseParcelId('5/5/10/2/1939')).toBe('5/05/10/02/1939')
    expect(parseParcelId('area-1a2b3c4d')).toBe('AREA-1A2B3C4D')
    expect(parseParcelId('nope')).toBeNull()
  })

  it('tells drawn areas apart from parcels', () => {
    expect(isAreaId('AREA-1A2B3C4D')).toBe(true)
    expect(isAreaId('5/05/10/02/1939')).toBe(false)
    expect(isAreaId(null)).toBe(false)
  })
})
