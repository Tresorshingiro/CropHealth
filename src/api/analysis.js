// The GIS team's analysis tool, through the app's own server, which adds the
// session's token and checks what is sent.
import { NetworkError, PortalError, SessionExpiredError } from './arcgis.js'

async function call(url, init = {}) {
  let res
  try {
    res = await fetch(url, { credentials: 'same-origin', ...init })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new NetworkError()
  }
  if (res.status === 401) throw new SessionExpiredError()
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) throw new PortalError(data?.error || 'The analysis tool could not answer.')
  return data
}

/**
 * Starts the analysis of a parcel `{ upi }` or a drawn field
 * `{ area: { rings }, name }`: about a minute, then its rows are in the feature service.
 */
export const startAnalysis = (input) =>
  call('/api/analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input.upi ? { upi: input.upi } : { area: { rings: input.area.rings }, name: input.name }),
  })

/** `{ jobId, status: 'running' | 'succeeded' | 'failed', message? }` */
export const getAnalysis = (jobId) => call(`/api/analysis/${encodeURIComponent(jobId)}`)
