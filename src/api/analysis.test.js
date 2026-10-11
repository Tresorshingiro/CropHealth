import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAnalysis, startAnalysis } from './analysis.js'
import { PortalError, SessionExpiredError } from './arcgis.js'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('startAnalysis', () => {
  it("asks the app's server to run the GIS team's analysis for one UPI", async () => {
    fetchMock.mockImplementation(async () => json({ jobId: 'j1', status: 'running' }))
    expect(await startAnalysis({ upi: '5/05/06/02/4219' })).toEqual({ jobId: 'j1', status: 'running' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/analysis')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ upi: '5/05/06/02/4219' })
    expect(init.credentials).toBe('same-origin')
  })

  it("passes on the server's message when the analysis is refused", async () => {
    fetchMock.mockImplementation(async () =>
      json({ error: 'Your GeoHub account is not allowed to run the analysis. Ask the GIS team for access.' }, 403),
    )
    await expect(startAnalysis({ upi: '5/05/06/02/4219' })).rejects.toThrow(
      new PortalError('Your GeoHub account is not allowed to run the analysis. Ask the GIS team for access.'),
    )
  })

  it('signs out on 401', async () => {
    fetchMock.mockImplementation(async () => json({ error: 'Sign in to continue.' }, 401))
    await expect(startAnalysis({ upi: '5/05/06/02/4219' })).rejects.toBeInstanceOf(SessionExpiredError)
  })
})

it('sends a drawn field as its outline and name', async () => {
  fetchMock.mockImplementation(async () => json({ jobId: 'j2', status: 'running' }))
  const rings = [[[30.8, -2.2], [30.801, -2.2], [30.801, -2.199], [30.8, -2.2]]]
  await startAnalysis({ area: { rings }, name: 'North field' })
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ area: { rings }, name: 'North field' })
})

describe('getAnalysis', () => {
  it('reads a job by its id', async () => {
    fetchMock.mockImplementation(async () => json({ jobId: 'j1', status: 'failed', message: 'UPI not found.' }))
    expect(await getAnalysis('j1')).toEqual({ jobId: 'j1', status: 'failed', message: 'UPI not found.' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analysis/j1')
  })
})
