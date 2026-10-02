// Requests go to this app's own origin; the access server adds the portal
// token and forwards them to GeoHub.
export const SERVICE_URL = '/api/gh/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer'

const PAGE_SIZE = 1000

export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Sign in again.') {
    super(message)
    this.name = 'SessionExpiredError'
  }
}

export class PortalError extends Error {
  constructor(message = 'GeoHub could not answer the request.') {
    super(message)
    this.name = 'PortalError'
  }
}

export class NetworkError extends Error {
  constructor(message = 'Could not reach the server. Check your connection and try again.') {
    super(message)
    this.name = 'NetworkError'
  }
}

/** One query against a layer or table of the crop health service. */
export async function queryLayer(layerId, params, { signal } = {}) {
  const search = new URLSearchParams({ f: 'json', ...params })
  let res
  try {
    res = await fetch(`${SERVICE_URL}/${layerId}/query?${search}`, { credentials: 'same-origin', signal })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new NetworkError()
  }
  if (res.status === 401) throw new SessionExpiredError()

  let data
  try {
    data = await res.json()
  } catch {
    throw new PortalError('GeoHub returned an unreadable response.')
  }
  // ArcGIS sends { error: { message } }; the access server sends { error: '...' }.
  const error = data?.error
  if (error || !res.ok) {
    const message = typeof error === 'string' ? error : error?.message
    throw new PortalError(message || `GeoHub request failed (${res.status}).`)
  }
  return data
}

/** Every page of a query, up to maxPages. `truncated` says rows were left out. */
export async function queryAll(layerId, params, { signal, maxPages = 5 } = {}) {
  const features = []
  for (let page = 0; page < maxPages; page += 1) {
    const data = await queryLayer(
      layerId,
      { ...params, resultOffset: String(page * PAGE_SIZE), resultRecordCount: String(PAGE_SIZE) },
      { signal },
    )
    features.push(...(data.features || []))
    if (!data.exceededTransferLimit) return { features, truncated: false }
  }
  return { features, truncated: true }
}
