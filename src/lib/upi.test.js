import { describe, expect, it } from 'vitest'
import { parseUpi } from './upi.js'

describe('parseUpi', () => {
  it('accepts a well-formed UPI', () => {
    expect(parseUpi('5/05/10/02/1939')).toBe('5/05/10/02/1939')
    expect(parseUpi('1/01/01/01/7')).toBe('1/01/01/01/7')
  })

  it('removes surrounding and inner whitespace', () => {
    expect(parseUpi('  5/05/10/02/1939\n')).toBe('5/05/10/02/1939')
    expect(parseUpi('5 / 05 / 10 / 02 / 1939')).toBe('5/05/10/02/1939')
    expect(parseUpi('5/05/10/02/1939\t')).toBe('5/05/10/02/1939')
  })

  it('rejects anything else', () => {
    const bad = [
      '',
      '   ',
      '5/5/10/02/1939',
      '5/05/10/02',
      '5/05/10/02/',
      '55/05/10/02/1939',
      '5-05-10-02-1939',
      '5/05/10/02/19a9',
      "5/05/10/02/1939' OR '1'='1",
      '5/05/10/02/1939;--',
      null,
      undefined,
      42,
    ]
    for (const value of bad) expect(parseUpi(value), String(value)).toBeNull()
  })
})
