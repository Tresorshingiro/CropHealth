import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useChartDrag } from './useChartDrag.js'

const D0 = Date.UTC(2026, 2, 1)
const D1 = Date.UTC(2026, 2, 11)
const D2 = Date.UTC(2026, 2, 21)
const ROWS = [{ date: D0 }, { date: D1 }, { date: D2 }]
const at = (index) => ({ activeTooltipIndex: index })

function setup() {
  const onRangeSelect = vi.fn()
  const onImageDate = vi.fn()
  const { result } = renderHook(() => useChartDrag(ROWS, { onRangeSelect, onImageDate }))
  const fire = (name, state) => act(() => result.current.handlers[name](state))
  return { result, fire, onRangeSelect, onImageDate }
}

describe('useChartDrag', () => {
  it('picks a period with a mouse drag, and one date with a press', () => {
    const { fire, onRangeSelect, onImageDate } = setup()
    fire('onMouseDown', at(0))
    fire('onMouseMove', at(2))
    fire('onMouseUp')
    expect(onRangeSelect).toHaveBeenCalledWith({ from: D0, to: D2 + 86400000 - 1 })

    fire('onMouseDown', at(1))
    fire('onMouseUp')
    expect(onImageDate).toHaveBeenCalledWith(D1)
  })

  it('starts a touch drag where the finger first moves, not where the last tooltip was', () => {
    const { fire, onRangeSelect } = setup()
    // Recharts sends touchstart with the previous interaction's index.
    fire('onTouchStart', at(0))
    fire('onTouchMove', at(1))
    fire('onTouchMove', at(2))
    fire('onTouchEnd', at(2))
    expect(onRangeSelect).toHaveBeenCalledWith({ from: D1, to: D2 + 86400000 - 1 })
  })

  it('shows the area being dragged and forgets it when the pointer leaves', () => {
    const { result, fire, onRangeSelect } = setup()
    fire('onMouseDown', at(0))
    fire('onMouseMove', at(1))
    expect(result.current.drag).toEqual({ start: D0, end: D1 })
    fire('onMouseLeave')
    expect(result.current.drag).toBeNull()
    fire('onMouseUp')
    expect(onRangeSelect).not.toHaveBeenCalled()
  })
})
