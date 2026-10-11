import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { measureParcel } from '../api/sentinel.js'
import { useQuickLook } from './useQuickLook.js'

vi.mock('../api/sentinel.js', () => ({ measureParcel: vi.fn() }))

const LOOK_A = { upi: '5/05/06/02/4219', rings: [[[30.1, -2.1], [30.2, -2.1], [30.1, -2.2], [30.1, -2.1]]] }
const LOOK_B = { upi: '5/05/02/06/4743', rings: [[[30.5, -2.5], [30.6, -2.5], [30.5, -2.6], [30.5, -2.5]]] }
const READY = { status: 'ready', scene: { date: Date.UTC(2026, 8, 25), cloud: 0.1 } }
const VALUES = { ndvi: 0.21, ndmi: -0.11, ndre: 0.16 }

const run = (initialProps) => renderHook(({ look, scene }) => useQuickLook(look, scene), { initialProps })

beforeEach(() => {
  measureParcel.mockClear()
  measureParcel.mockResolvedValue(VALUES)
})

// Under Vitest 5 a mock that returns a rejected Promise had that rejection
// reported as the test's error even though the hook handled it; a plain
// thenable fails the same way for the hook without that.
const failing = () => ({ then: (onFulfilled, onRejected) => Promise.reject(new Error('down')).then(onFulfilled, onRejected) })

describe('useQuickLook', () => {
  it('is idle with no parcel, and waits for the image', () => {
    expect(run({ look: null, scene: READY }).result.current).toEqual({ status: 'idle', values: null })
    expect(run({ look: LOOK_A, scene: { status: 'loading', scene: null } }).result.current.status).toBe('loading')
    expect(measureParcel).not.toHaveBeenCalled()
  })

  it("measures the parcel on the image's day", async () => {
    measureParcel.mockResolvedValue(VALUES)
    const { result } = run({ look: LOOK_A, scene: READY })
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', values: VALUES }))
    expect(measureParcel).toHaveBeenCalledWith(expect.objectContaining({ rings: LOOK_A.rings, date: READY.scene.date }))
  })

  it('passes on a missing or failed image, and says when measuring failed', async () => {
    expect(run({ look: LOOK_A, scene: { status: 'none', scene: null } }).result.current.status).toBe('none')
    expect(run({ look: LOOK_A, scene: { status: 'error', scene: null } }).result.current.status).toBe('error')
    measureParcel.mockImplementation(failing)
    const { result } = run({ look: LOOK_A, scene: READY })
    await waitFor(() => expect(result.current.status).toBe('failed'))
  })

  it('ignores the answer for a parcel the user has already left', async () => {
    let finishA
    measureParcel.mockReturnValueOnce(new Promise((resolve) => (finishA = resolve))).mockResolvedValueOnce(VALUES)
    const { result, rerender } = run({ look: LOOK_A, scene: READY })
    rerender({ look: LOOK_B, scene: READY })
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', values: VALUES }))
    await act(async () => finishA({ ndvi: 9, ndmi: 9, ndre: 9 }))
    expect(result.current.values).toEqual(VALUES)
  })
})
