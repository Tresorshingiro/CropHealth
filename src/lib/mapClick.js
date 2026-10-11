import { parseUpi } from './upi.js'

/**
 * What a click on the map does. `plotUpi` is an analysed or selected
 * plot under the pointer; `landUpi` a land parcel (NLA layer).
 * Analysed plots open their report; any other land parcel gets a quick look;
 * the plot already open only gets its popup back. `onSelected` says the click
 * hit the selection's own outline, which a drawn field (no UPI) needs.
 */
export function clickAction({ plotUpi = null, landUpi = null, selectedUpi = null, onSelected = false, analysed }) {
  if (onSelected) return { type: 'reopen' }
  if (plotUpi) return plotUpi === selectedUpi ? { type: 'reopen' } : { type: 'select', upi: plotUpi }
  if (landUpi) {
    const upi = parseUpi(landUpi) ?? landUpi
    if (upi === selectedUpi) return { type: 'reopen' }
    return analysed.has(upi) ? { type: 'select', upi } : { type: 'look', upi }
  }
  return { type: 'close' }
}
