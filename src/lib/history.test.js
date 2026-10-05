import { describe, expect, it, vi } from 'vitest'
import { addToHistory, readHistory } from './history.js'

const upi = (n) => `5/05/10/02/${n}`

describe('history', () => {
  it('starts empty', () => {
    expect(readHistory()).toEqual([])
  })

  it('puts the newest UPI first', () => {
    addToHistory(upi(1))
    expect(addToHistory(upi(2))).toEqual([upi(2), upi(1)])
    expect(readHistory()).toEqual([upi(2), upi(1)])
  })

  it('moves a repeated UPI to the front without duplicating it', () => {
    addToHistory(upi(1))
    addToHistory(upi(2))
    expect(addToHistory(upi(1))).toEqual([upi(1), upi(2)])
  })

  it('keeps at most 20 entries', () => {
    for (let n = 1; n <= 25; n += 1) addToHistory(upi(n))
    const list = readHistory()
    expect(list).toHaveLength(20)
    expect(list[0]).toBe(upi(25))
    expect(list[19]).toBe(upi(6))
  })

  it('returns an empty list when the stored value is not valid JSON', () => {
    window.localStorage.setItem('crophealth-history', '{not json')
    expect(readHistory()).toEqual([])
  })

  it('drops stored entries that are not valid UPIs or area ids', () => {
    window.localStorage.setItem(
      'crophealth-history',
      JSON.stringify([upi(1), 7, null, '<b>x</b>', 'AREA-1A2B3C4D', 'area-1a2b3c4d', upi(2)]),
    )
    expect(readHistory()).toEqual([upi(1), 'AREA-1A2B3C4D', upi(2)])
  })

  it('returns an empty list when the stored value is not an array', () => {
    window.localStorage.setItem('crophealth-history', JSON.stringify({ a: 1 }))
    expect(readHistory()).toEqual([])
  })

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readHistory()).toEqual([])
    expect(addToHistory(upi(1))).toEqual([upi(1)])
  })
})
