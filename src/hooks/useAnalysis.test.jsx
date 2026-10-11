import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAnalysis, startAnalysis } from '../api/analysis.js'
import { PortalError, SessionExpiredError } from '../api/arcgis.js'
import { useAnalysis } from './useAnalysis.js'

vi.mock('../api/analysis.js', () => ({ startAnalysis: vi.fn(), getAnalysis: vi.fn() }))

const UPI = '5/05/06/02/4219'

function setup(options = {}) {
  const onDone = vi.fn()
  const expire = vi.fn()
  const { result } = renderHook(() => useAnalysis({ expire, onDone, interval: 1000, limit: 5000, ...options }))
  return { result, onDone, expire }
}
const tick = (ms) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers()
  startAnalysis.mockClear()
  getAnalysis.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('useAnalysis', () => {
  it('runs the analysis, checks on it, and hands the UPI on when it succeeds', async () => {
    startAnalysis.mockImplementation(async () => ({ jobId: 'j1', status: 'running' }))
    getAnalysis
      .mockImplementationOnce(async () => ({ jobId: 'j1', status: 'running' }))
      .mockImplementationOnce(async () => ({ jobId: 'j1', status: 'succeeded' }))
    const { result, onDone } = setup()
    expect(result.current.job.status).toBe('idle')

    await act(async () => {
      result.current.start({ upi: UPI })
    })
    expect(result.current.job).toEqual({ id: UPI, status: 'running', message: null })
    expect(startAnalysis).toHaveBeenCalledWith({ upi: UPI })

    await tick(1000)
    expect(getAnalysis).toHaveBeenCalledWith('j1')
    expect(onDone).not.toHaveBeenCalled()
    await tick(1000)
    expect(result.current.job.status).toBe('succeeded')
    expect(onDone).toHaveBeenCalledWith(UPI)
  })

  it("says why with the tool's own message when the analysis fails", async () => {
    startAnalysis.mockImplementation(async () => ({ jobId: 'j1', status: 'running' }))
    getAnalysis.mockImplementation(async () => ({ jobId: 'j1', status: 'failed', message: 'UPI not found in NLA parcels.' }))
    const { result, onDone } = setup()
    await act(async () => {
      result.current.start({ upi: UPI })
    })
    await tick(1000)
    expect(result.current.job).toEqual({ id: UPI, status: 'failed', message: 'UPI not found in NLA parcels.' })
    expect(onDone).not.toHaveBeenCalled()
  })

  it('says so when the analysis is refused', async () => {
    startAnalysis.mockImplementation(async () => {
      throw new PortalError('Your GeoHub account is not allowed to run the analysis. Ask the GIS team for access.')
    })
    const { result } = setup()
    await act(async () => {
      result.current.start({ upi: UPI })
    })
    expect(result.current.job.status).toBe('failed')
    expect(result.current.job.message).toMatch(/not allowed/)
  })

  it('gives up after the time limit', async () => {
    startAnalysis.mockImplementation(async () => ({ jobId: 'j1', status: 'running' }))
    getAnalysis.mockImplementation(async () => ({ jobId: 'j1', status: 'running' }))
    const { result } = setup()
    await act(async () => {
      result.current.start({ upi: UPI })
    })
    await tick(7000)
    expect(result.current.job.status).toBe('failed')
    expect(result.current.job.message).toBe('The analysis is taking longer than usual. Check the parcel again in a few minutes.')
  })

  it('hands on the id the tool writes a drawn field under', async () => {
    startAnalysis.mockImplementation(async () => ({ jobId: 'j1', status: 'succeeded' }))
    const { result, onDone } = setup()
    const input = { area: { rings: [[[30.8, -2.2], [30.801, -2.2], [30.801, -2.199], [30.8, -2.2]]] }, name: 'North field' }
    await act(async () => {
      result.current.start(input)
    })
    expect(startAnalysis).toHaveBeenCalledWith(input)
    expect(result.current.job).toEqual({ id: 'AREA North field', status: 'succeeded', message: null })
    expect(onDone).toHaveBeenCalledWith('AREA North field')
  })

  it('signs out when the session has expired', async () => {
    startAnalysis.mockImplementation(async () => {
      throw new SessionExpiredError()
    })
    const { result, expire } = setup()
    await act(async () => {
      result.current.start({ upi: UPI })
    })
    expect(expire).toHaveBeenCalled()
  })
})
