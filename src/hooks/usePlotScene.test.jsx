import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findPlotScene } from '../api/sentinel.js'
import { usePlotScene } from './usePlotScene.js'

vi.mock('../api/sentinel.js', () => ({ findPlotScene: vi.fn() }))

const RINGS_A = [[[30.1, -2.1], [30.2, -2.1], [30.2, -2.0], [30.1, -2.1]]]
const RINGS_B = [[[30.5, -2.5], [30.6, -2.5], [30.6, -2.4], [30.5, -2.5]]]
const SCENE = { date: Date.UTC(2026, 3, 28), cloud: 0 }

const run = (initialProps) =>
  renderHook(({ rings, range, imageDate }) => usePlotScene(rings, range, imageDate), { initialProps })

beforeEach(() => findPlotScene.mockReset())

describe('usePlotScene', () => {
  it('is idle with no plot and asks for nothing', () => {
    const { result } = run({ rings: null, range: null, imageDate: null })
    expect(result.current).toEqual({ status: 'idle', scene: null })
    expect(findPlotScene).not.toHaveBeenCalled()
  })

  it('loads, then gives the scene', async () => {
    findPlotScene.mockResolvedValue(SCENE)
    const range = { from: 1, to: 2 }
    const { result } = run({ rings: RINGS_A, range, imageDate: null })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', scene: SCENE }))
    expect(findPlotScene).toHaveBeenCalledWith(expect.objectContaining({ rings: RINGS_A, range, imageDate: null }))
  })

  it('says when there is no image, and when the service fails', async () => {
    findPlotScene.mockResolvedValueOnce(null)
    const { result, rerender } = run({ rings: RINGS_A, range: null, imageDate: null })
    await waitFor(() => expect(result.current.status).toBe('none'))
    findPlotScene.mockRejectedValueOnce(new Error('down'))
    rerender({ rings: RINGS_B, range: null, imageDate: null })
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('ignores the answer for a plot the user has already left', async () => {
    let finishA
    // First request (plot A) hangs until finishA; the second (plot B) answers at once.
    findPlotScene
      .mockReturnValueOnce(new Promise((resolve) => (finishA = resolve)))
      .mockResolvedValueOnce(SCENE)
    const { result, rerender } = run({ rings: RINGS_A, range: null, imageDate: null })
    rerender({ rings: RINGS_B, range: null, imageDate: null })
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', scene: SCENE }))
    await act(async () => finishA({ date: 1, cloud: 1 }))
    expect(result.current.scene).toEqual(SCENE)
  })

  it('asks again for a picked date', async () => {
    findPlotScene.mockResolvedValue(SCENE)
    const { rerender } = run({ rings: RINGS_A, range: null, imageDate: null })
    await waitFor(() => expect(findPlotScene).toHaveBeenCalledTimes(1))
    rerender({ rings: RINGS_A, range: null, imageDate: SCENE.date })
    await waitFor(() => expect(findPlotScene).toHaveBeenCalledTimes(2))
    expect(findPlotScene).toHaveBeenLastCalledWith(expect.objectContaining({ imageDate: SCENE.date }))
  })
})
