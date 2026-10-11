import { describe, expect, it } from 'vitest'
import { clickAction } from './mapClick.js'

const ANALYSED = new Set(['5/05/10/02/1939', '5/04/08/04/1948'])

describe('clickAction', () => {
  it('opens an analysed plot clicked on its outline', () => {
    expect(clickAction({ plotUpi: '5/05/10/02/1939', analysed: ANALYSED })).toEqual({ type: 'select', upi: '5/05/10/02/1939' })
  })

  it('only reopens the popup for the plot that is already open', () => {
    expect(clickAction({ plotUpi: '5/05/10/02/1939', selectedUpi: '5/05/10/02/1939', analysed: ANALYSED })).toEqual({ type: 'reopen' })
    expect(clickAction({ landUpi: '5/5/6/2/4219', selectedUpi: '5/05/06/02/4219', analysed: ANALYSED })).toEqual({ type: 'reopen' })
  })

  it('reopens the card of the selection itself, even a drawn field with no UPI over a land parcel', () => {
    expect(clickAction({ onSelected: true, landUpi: '5/05/06/02/4219', analysed: ANALYSED })).toEqual({ type: 'reopen' })
    expect(clickAction({ onSelected: true, analysed: ANALYSED })).toEqual({ type: 'reopen' })
  })

  it('opens the report of a land parcel that has been analysed', () => {
    expect(clickAction({ landUpi: '5/4/8/4/1948', analysed: ANALYSED })).toEqual({ type: 'select', upi: '5/04/08/04/1948' })
  })

  it('takes a quick look at any other land parcel', () => {
    expect(clickAction({ landUpi: '5/05/06/02/4219', analysed: ANALYSED })).toEqual({ type: 'look', upi: '5/05/06/02/4219' })
    // A UPI the app cannot read is still a field worth measuring.
    expect(clickAction({ landUpi: 'odd value', analysed: ANALYSED })).toEqual({ type: 'look', upi: 'odd value' })
  })

  it('prefers an analysed outline over the land parcel under it, and closes on empty map', () => {
    expect(clickAction({ plotUpi: '5/05/10/02/1939', landUpi: '5/05/10/02/1939', analysed: ANALYSED })).toEqual({
      type: 'select',
      upi: '5/05/10/02/1939',
    })
    expect(clickAction({ analysed: ANALYSED })).toEqual({ type: 'close' })
  })
})
