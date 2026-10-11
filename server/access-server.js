/**
 * Access server for the Crop Health app.
 *
 * The GeoHub services are private, so the browser cannot call them directly.
 * This middleware signs the user in to the portal, keeps the portal token in a
 * encrypted HttpOnly cookie, and (see the proxy route) forwards read-only queries
 * on three tables with that token attached. The browser never sees the token.
 */
import crypto from 'node:crypto'

export const DATA_BASE = '/api/data'

// The three tables the app reads, by name, and the GeoHub layer each one is in.
// The browser only ever names a table; which layer answers is decided here.
// `referenced` (the default) is the GIS team's database, one service per
// table, which the analysis notebook writes to since 2026-10-09; `hosted` is
// the notebook's earlier view, for when it is set back to the hosted service.
const DATA_SOURCES = {
  hosted: {
    parcels: '/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/0',
    observations: '/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/1',
    guide: '/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/2',
  },
  referenced: {
    parcels: '/rest/services/WatchedParcels/FeatureServer/0',
    observations: '/rest/services/ParcelObservations/FeatureServer/0',
    guide: '/rest/services/IndexGuide/FeatureServer/0',
  },
}

// The GIS team's "Analyse UPI" notebook tool: one asynchronous task. It reads a
// parcel's 14 months of Sentinel-2 and writes them into the feature service.
const DEFAULT_ANALYSIS_URL =
  'https://gh.space.gov.rw/notebook/rest/services/7434ce325a1a44eea475aefc6947d39b/GPServer/ParcelIndices'
const UPI = /^\d\/\d{1,2}\/\d{1,2}\/\d{1,2}\/\d{1,6}$/
// A drawn field analysed before, as the tool stores it: `AREA <name>` or `AREA-` and eight hex digits.
// Sent in the UPI box, the tool reads that field again. Neither form lets a quote through.
const AREA_ID = /^AREA(?: [A-Za-z0-9_-][A-Za-z0-9 _-]{0,25}|-[0-9A-F]{8})$/
// Notebook Server job ids carry dashes and underscores; never a slash or a dot.
const JOB_ID = /^[A-Za-z0-9_-]{1,128}$/

// A drawn field must be one closed ring inside Rwanda's bounding box (the
// border in src/lib/rwanda.json, with about 6 km to spare), at most 500
// points and about 5 km across. The name follows the tool's own rule.
const RWANDA_BOX = { xmin: 28.8, ymin: -2.9, xmax: 30.96, ymax: -0.98 }
const MAX_SPAN = 0.05
const MAX_POSITIONS = 501 // 500 points plus the closing one
const AREA_NAME = /^[A-Za-z0-9_-][A-Za-z0-9 _-]{0,25}$/

/** The field's rings, rebuilt from plain numbers, or null when it is not one small ring in Rwanda. */
export function checkArea(area) {
  const rings = area?.rings
  if (!Array.isArray(rings) || rings.length !== 1) return null
  const ring = rings[0]
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > MAX_POSITIONS) return null
  for (const point of ring) {
    if (!Array.isArray(point) || point.length !== 2) return null
    if (!point.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
    const [x, y] = point
    if (x < RWANDA_BOX.xmin || x > RWANDA_BOX.xmax || y < RWANDA_BOX.ymin || y > RWANDA_BOX.ymax) return null
  }
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) return null
  const xs = ring.map(([x]) => x)
  const ys = ring.map(([, y]) => y)
  if (Math.max(...xs) - Math.min(...xs) > MAX_SPAN || Math.max(...ys) - Math.min(...ys) > MAX_SPAN) return null
  return [ring.map(([x, y]) => [x, y])]
}

/** The field's name, trimmed, or null when the tool's rule would change it. */
export function checkAreaName(name) {
  if (typeof name !== 'string') return null
  const text = name.trim()
  return AREA_NAME.test(text) && !/ {2}/.test(text) ? text : null
}
const JOB_DONE = {
  esriJobSucceeded: 'succeeded',
  esriJobFailed: 'failed',
  esriJobTimedOut: 'failed',
  esriJobCancelling: 'failed',
  esriJobCancelled: 'failed',
}
const NOT_ALLOWED = 'Your account is not allowed to run the analysis. Ask the GIS team for access.'

const COOKIE = 'crophealth_session'
const DEV_SECRET = 'crophealth-dev-secret'
const PLACEHOLDER_SECRET = 'change-this-in-production'

export function readConfig(env = process.env) {
  const portalUrl = (env.PORTAL_URL || 'https://gh.space.gov.rw/portal').replace(/\/$/, '')
  const serverUrl = (env.SERVER_URL || portalUrl.replace(/\/portal$/, '/server')).replace(/\/$/, '')
  const production = env.NODE_ENV === 'production'
  const secret = env.SESSION_SECRET || ''
  if (production && (!secret || secret === PLACEHOLDER_SECRET)) {
    throw new Error('SESSION_SECRET must be set to a real value in production')
  }
  const dataSource = (env.DATA_SOURCE || 'referenced').trim().toLowerCase()
  if (!Object.hasOwn(DATA_SOURCES, dataSource)) {
    throw new Error(`DATA_SOURCE must be one of: ${Object.keys(DATA_SOURCES).join(', ')}`)
  }
  return {
    portalUrl,
    serverUrl,
    production,
    dataSource,
    sessionSecret: secret && secret !== PLACEHOLDER_SECRET ? secret : DEV_SECRET,
    clientId: env.PORTAL_CLIENT_ID || '',
    clientSecret: env.PORTAL_CLIENT_SECRET || '',
    analysisUrl: (env.ANALYSIS_URL || DEFAULT_ANALYSIS_URL).replace(/\/$/, ''),
  }
}

function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const i = part.indexOf('=')
        return i === -1 ? [part, ''] : [part.slice(0, i), part.slice(i + 1)]
      }),
  )
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64 * 1024) throw new Error('Request body too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

/**
 * The origin this request arrived on. The portal token is bound to it as a
 * referer at sign-in, so the proxy must present the same value later.
 */
function requestOrigin(req) {
  // A chain of proxies sends comma-separated values; the first is the client's.
  const first = (value) => String(value || '').split(',')[0].trim()
  const proto = first(req.headers['x-forwarded-proto']) || (req.socket?.encrypted ? 'https' : 'http')
  const host = first(req.headers['x-forwarded-host']) || req.headers.host || 'localhost'
  return `${proto === 'https' ? 'https' : 'http'}://${host}`
}

class PortalUnreachable extends Error {}

export function createAccessMiddleware(config, fetchImpl = globalThis.fetch) {
  // The cookie holds the portal token, so it is encrypted, not just signed:
  // AES-256-GCM both hides the content and rejects anything altered or sealed
  // with another secret.
  const key = crypto.createHash('sha256').update(config.sessionSecret).digest()

  function seal(payload) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')
  }

  function unseal(value) {
    if (!value) return null
    try {
      const raw = Buffer.from(value, 'base64url')
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
      decipher.setAuthTag(raw.subarray(12, 28))
      const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
      const data = JSON.parse(text)
      if (!data.expiresAt || Date.now() > data.expiresAt) return null
      return data
    } catch {
      return null
    }
  }

  const readSession = (req) => unseal(parseCookies(req.headers.cookie)[COOKIE])

  function cookieHeader(req, value, maxAgeSec) {
    const flags = ['HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${maxAgeSec}`]
    // Judged from the address the browser used, not the Host a reverse proxy
    // may have rewritten to localhost.
    const origin = new URL(requestOrigin(req))
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    // A plain-HTTP local run stays without Secure so sign-in works on
    // localhost; everything else in production, and any HTTPS origin, gets it.
    if (origin.protocol === 'https:' || (config.production && !local)) flags.push('Secure')
    return `${COOKIE}=${value}; ${flags.join('; ')}`
  }

  const clearSession = (req, res) => res.setHeader('Set-Cookie', cookieHeader(req, '', 0))

  async function portalPost(path, params, origin) {
    let res
    try {
      res = await fetchImpl(`${config.portalUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', referer: origin },
        body: new URLSearchParams({ ...params, f: 'json' }),
      })
    } catch {
      throw new PortalUnreachable()
    }
    try {
      return await res.json()
    } catch {
      // A gateway's HTML error page is an outage, not a wrong password.
      throw new PortalUnreachable()
    }
  }

  /** Exchange GeoHub credentials for a portal token. Server-side only. */
  async function generatePortalToken(username, password, origin) {
    // Preferred when the GIS team has registered this app on the portal.
    if (config.clientId && config.clientSecret) {
      const data = await portalPost(
        '/sharing/rest/oauth2/token',
        {
          grant_type: 'password',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          username,
          password,
        },
        origin,
      )
      const token = data.access_token || data.token
      if (token) return { token, expiresAt: Date.now() + Number(data.expires_in || 1800) * 1000 }
    }

    const data = await portalPost(
      '/sharing/rest/generateToken',
      { username, password, client: 'referer', referer: origin, expiration: '480' },
      origin,
    )
    if (!data?.token) {
      // The useful part is in `details`, e.g. "Too many invalid logins."
      const err = data?.error || {}
      const detail = Array.isArray(err.details) ? err.details.filter(Boolean).join(' ') : ''
      const failure = new Error(detail || err.message || 'Invalid username or password.')
      failure.rejected = true
      throw failure
    }
    return { token: data.token, expiresAt: Number(data.expires) || Date.now() + 480 * 60 * 1000 }
  }

  async function hydrateUser(token, origin, fallbackUsername) {
    try {
      const d = await portalPost('/sharing/rest/community/self', { token }, origin)
      const username = d.username || fallbackUsername
      return { username, fullName: d.fullName || username, email: d.email || '' }
    } catch {
      return { username: fallbackUsername, fullName: fallbackUsername, email: '' }
    }
  }

  async function login(req, res) {
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return sendJson(res, 400, { error: 'Enter your username and password.' })
    }
    const username = String(body?.username || '').trim()
    const password = String(body?.password || '')
    if (!username || !password) {
      return sendJson(res, 400, { error: 'Enter your username and password.' })
    }
    const origin = requestOrigin(req)
    try {
      const { token, expiresAt } = await generatePortalToken(username, password, origin)
      const user = await hydrateUser(token, origin, username)
      const maxAge = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000))
      res.setHeader('Set-Cookie', cookieHeader(req, seal({ token, ...user, expiresAt }), maxAge))
      return sendJson(res, 200, { authenticated: true, user })
    } catch (err) {
      if (err instanceof PortalUnreachable) {
        return sendJson(res, 502, { error: 'Could not reach the GIS service. Try again in a moment.' })
      }
      if (err.rejected) return sendJson(res, 401, { error: err.message })
      throw err
    }
  }

  const tables = DATA_SOURCES[config.dataSource]

  async function proxy(req, res, url) {
    // Only the one operation the app uses is forwarded: a query on one of the
    // three tables, named in full. No part of the GeoHub path comes from the
    // browser, so `..;/`, encoded slashes and the like have nothing to act on.
    const match = /^\/api\/data\/([a-z]+)\/query$/.exec(url.pathname)
    const layer = match && Object.hasOwn(tables, match[1]) ? tables[match[1]] : null
    if (!layer) return sendJson(res, 404, { error: 'Not found.' })
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' })

    const session = readSession(req)
    if (!session?.token) return sendJson(res, 401, { error: 'Sign in to continue.' })

    const target = new URL(`${config.serverUrl}${layer}/query`)
    // The session's token is the only one that counts, and the answer is
    // always JSON: no HTML or JSONP from GeoHub is served on this origin.
    const dropped = new Set(['token', 'callback', 'f'])
    url.searchParams.forEach((value, key) => {
      if (!dropped.has(key.toLowerCase())) target.searchParams.append(key, value)
    })
    target.searchParams.set('f', 'json')
    target.searchParams.set('token', session.token)

    let upstream
    let text
    try {
      upstream = await fetchImpl(target, {
        headers: { accept: 'application/json', referer: requestOrigin(req) },
        redirect: 'manual',
      })
      text = await upstream.text()
    } catch {
      return sendJson(res, 502, { error: 'Could not reach the GIS service. Try again in a moment.' })
    }

    // ArcGIS reports a dead token as HTTP 200 with the failure in the body.
    let failure = null
    try {
      failure = JSON.parse(text)?.error ?? null
    } catch {
      return sendJson(res, 502, { error: 'The GIS service could not answer the request.' })
    }
    const code = failure?.code ?? null
    // A refused query says why only in `details`: log it with the query (never the token) to read the cause.
    if (failure && code !== 498 && code !== 499) {
      const query = Object.fromEntries([...target.searchParams].filter(([key]) => key !== 'token'))
      console.warn(
        `[data] ${match[1]} query refused: ${JSON.stringify({ code, message: failure.message, details: failure.details, query })}`,
      )
    }
    if (code === 498 || code === 499) {
      clearSession(req, res)
      return sendJson(res, 401, { error: 'Your session has expired. Sign in again.' })
    }

    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'no-store')
    res.end(text)
  }

  /**
   * One call to the analysis tool with the session's token. Sends the error
   * answer itself and returns null when there is nothing to pass on.
   */
  async function askTool(req, res, session, url, init = {}) {
    let text
    try {
      const upstream = await fetchImpl(url, {
        ...init,
        headers: { accept: 'application/json', referer: requestOrigin(req), ...init.headers },
        redirect: 'manual',
      })
      text = await upstream.text()
    } catch {
      sendJson(res, 502, { error: 'Could not reach the GIS service. Try again in a moment.' })
      return null
    }
    let data
    try {
      data = JSON.parse(text)
    } catch {
      console.warn(`[analysis] ${String(url).split('?')[0]} answered with no JSON: ${text.slice(0, 200)}`)
      sendJson(res, 502, { error: 'The analysis tool could not answer.' })
      return null
    }
    // The tool's answers are not documented: log them (no token) to read what it says.
    console.info(
      `[analysis] ${String(url).split('?')[0]} -> ${JSON.stringify({ jobId: data?.jobId, jobStatus: data?.jobStatus, error: data?.error, messages: data?.messages?.slice(-3) })}`,
    )
    const code = data?.error?.code
    if (code === 498 || code === 499) {
      clearSession(req, res)
      sendJson(res, 401, { error: 'Your session has expired. Sign in again.' })
      return null
    }
    if (code === 401 || code === 403) {
      sendJson(res, 403, { error: NOT_ALLOWED })
      return null
    }
    if (data?.error) {
      sendJson(res, 502, { error: data.error.message || 'The analysis tool could not answer.' })
      return null
    }
    return data
  }

  /** A job as the app needs it: running, succeeded, or failed with the tool's own error message. */
  function jobAnswer(data, jobId) {
    const answer = { jobId: data.jobId || jobId, status: JOB_DONE[data.jobStatus] || 'running' }
    if (answer.status === 'failed') {
      const error = (data.messages || []).find((m) => m?.type === 'esriJobMessageTypeError')
      if (error?.description) answer.message = error.description
    }
    return answer
  }

  // A parcel's UPI (or a drawn field's id, to read it again), or a new drawn
  // field's outline and name. Each is checked here again, so nothing but a UPI,
  // a field id or one small named field in Rwanda can be written through this route.
  async function startAnalysis(req, res) {
    const session = readSession(req)
    if (!session?.token) return sendJson(res, 401, { error: 'Sign in to continue.' })
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      body = null
    }
    const hasUpi = body?.upi !== undefined
    const hasArea = body?.area !== undefined
    if (hasUpi === hasArea) return sendJson(res, 400, { error: 'Send a UPI or a drawn field.' })

    let form
    if (hasUpi) {
      const upi = typeof body.upi === 'string' ? body.upi.trim() : ''
      if (!UPI.test(upi) && !AREA_ID.test(upi)) {
        return sendJson(res, 400, { error: 'Enter a UPI in the form 5/05/10/02/1939' })
      }
      form = { UPI: upi, AREA: '' }
    } else {
      const rings = checkArea(body.area)
      if (!rings) return sendJson(res, 400, { error: 'Draw one field inside Rwanda, at most about 5 km across.' })
      const name = checkAreaName(body.name)
      if (!name) {
        return sendJson(res, 400, { error: 'Name the field with letters, digits, spaces, _ and -, up to 26 characters.' })
      }
      const geometry = { rings, spatialReference: { wkid: 4326 } }
      form = {
        UPI: '',
        AREA: JSON.stringify({
          geometryType: 'esriGeometryPolygon',
          spatialReference: { wkid: 4326 },
          features: [{ geometry, attributes: {} }],
        }),
        AREA_NAME: name,
      }
    }

    const data = await askTool(req, res, session, `${config.analysisUrl}/submitJob`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...form, f: 'json', token: session.token }),
    })
    if (!data) return
    if (!data.jobId) return sendJson(res, 502, { error: 'The analysis tool did not start a job.' })
    sendJson(res, 200, jobAnswer(data))
  }

  async function analysisStatus(req, res, jobId) {
    const session = readSession(req)
    if (!session?.token) return sendJson(res, 401, { error: 'Sign in to continue.' })
    const url = new URL(`${config.analysisUrl}/jobs/${jobId}`)
    url.searchParams.set('f', 'json')
    url.searchParams.set('token', session.token)
    const data = await askTool(req, res, session, url)
    if (data) sendJson(res, 200, jobAnswer(data, jobId))
  }

  return async function accessMiddleware(req, res, next) {
    const url = new URL(req.url, 'http://localhost')
    const { pathname } = url

    try {
      if (pathname === '/api/auth/login') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' })
        return await login(req, res)
      }

      if (pathname === '/api/auth/session' && req.method === 'GET') {
        const s = readSession(req)
        if (!s?.token) return sendJson(res, 200, { authenticated: false })
        return sendJson(res, 200, {
          authenticated: true,
          user: { username: s.username, fullName: s.fullName, email: s.email },
        })
      }

      if (pathname === '/api/auth/logout' && req.method === 'POST') {
        clearSession(req, res)
        return sendJson(res, 200, { authenticated: false })
      }

      if (pathname === DATA_BASE || pathname.startsWith(`${DATA_BASE}/`)) {
        return await proxy(req, res, url)
      }

      if (pathname === '/api/analysis') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' })
        return await startAnalysis(req, res)
      }

      if (pathname.startsWith('/api/analysis/')) {
        const jobId = pathname.slice('/api/analysis/'.length)
        if (!JOB_ID.test(jobId)) return sendJson(res, 404, { error: 'Not found.' })
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' })
        return await analysisStatus(req, res, jobId)
      }

      if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found.' })
    } catch {
      return sendJson(res, 500, { error: 'Something went wrong on the server.' })
    }

    if (typeof next === 'function') return next()
    res.statusCode = 404
    res.end('Not found')
  }
}
