import { useState } from 'react'
import { dragRange } from '../lib/range.js'

/**
 * Picking dates on a Recharts chart: a drag picks a period, a press picks one
 * date. Recharts 3 only updates the active point on touchmove (touchstart
 * carries the previous interaction's), so a touch drag starts on its first move.
 */
export function useChartDrag(rows, { onRangeSelect, onImageDate }) {
  const [drag, setDrag] = useState(null)

  const dateAt = (state) => {
    const index = Number(state?.activeTooltipIndex)
    return Number.isInteger(index) ? (rows[index]?.date ?? null) : null
  }
  const begin = (state) => {
    const date = dateAt(state)
    setDrag(date === null ? null : { start: date, end: date })
  }
  const extend = (state) => {
    const date = dateAt(state)
    if (date !== null) setDrag((current) => current && { ...current, end: date })
  }
  const finish = () => {
    if (drag) {
      const picked = dragRange(drag.start, drag.end)
      if (picked) onRangeSelect?.(picked)
      else onImageDate?.(drag.start)
    }
    setDrag(null)
  }

  return {
    drag,
    handlers: {
      onMouseDown: begin,
      onMouseMove: extend,
      onMouseUp: finish,
      onMouseLeave: () => setDrag(null),
      onTouchStart: () => setDrag(null),
      onTouchMove: (state) => (drag ? extend(state) : begin(state)),
      onTouchEnd: finish,
    },
  }
}
