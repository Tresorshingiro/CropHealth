/**
 * Access server for the Crop Health app.
 *
 * The GeoHub services are private, so the browser cannot call them directly.
 * This middleware signs the user in to the portal, keeps the portal token in a
 * signed HttpOnly cookie, and (see the proxy route) forwards read-only queries
 * to one feature service with that token attached. The browser never sees the
 * token.
 */
import crypto from 'node:crypto'

export const PROXY_BASE = '/api/gh/server'
export const ALLOWED_PREFIX = '/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer'

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
  return {
    portalUrl,
    serverUrl,
    production,
    sessionSecret: secret && secret !== PLACEHOLDER_SECRET ? secret : DEV_SECRET,
    clientId: env.PORTAL_CLIENT_ID || '',
    clientSecret: env.PORTAL_CLIENT_SECRET || '',
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
  const proto = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http')
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  return `${proto}://${host}`
}

class PortalUnreachable extends Error {}

export function createAccessMiddleware(config, fetchImpl = globalThis.fetch) {
  const hmac = (body) => crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url')

  function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${body}.${hmac(body)}`
  }

  function unsign(value) {
    if (!value || !value.includes('.')) return null
    const [body, sig] = value.split('.')
    const given = Buffer.from(sig || '')
    const expected = Buffer.from(hmac(body))
    // Length check first: timingSafeEqual throws on mismatched lengths.
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null
    try {
      const data = JSON.parse(Buffer.from(body, 'base64url').toString())
      if (!data.expiresAt || Date.now() > data.expiresAt) return null
      return data
    } catch {
      return null
    }
  }

  const readSession = (req) => unsign(parseCookies(req.headers.cookie)[COOKIE])

  function cookieHeader(req, value, maxAgeSec) {
    const flags = ['HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${maxAgeSec}`]
    const host = String(req.headers.host || '').split(':')[0]
    const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
    // Browsers drop Secure cookies on an untrusted local certificate, and
    // localhost is already a secure context, so the flag is skipped there.
    if (config.production && !local) flags.push('Secure')
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
    return res.json().catch(() => ({}))
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
      return sendJson(res, 400, { error: 'Enter your GeoHub username and password.' })
    }
    const username = String(body?.username || '').trim()
    const password = String(body?.password || '')
    if (!username || !password) {
      return sendJson(res, 400, { error: 'Enter your GeoHub username and password.' })
    }
    const origin = requestOrigin(req)
    try {
      const { token, expiresAt } = await generatePortalToken(username, password, origin)
      const user = await hydrateUser(token, origin, username)
      const maxAge = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000))
      res.setHeader('Set-Cookie', cookieHeader(req, sign({ token, ...user, expiresAt }), maxAge))
      return sendJson(res, 200, { authenticated: true, user })
    } catch (err) {
      if (err instanceof PortalUnreachable) {
        return sendJson(res, 502, { error: 'Could not reach GeoHub. Try again in a moment.' })
      }
      if (err.rejected) return sendJson(res, 401, { error: err.message })
      throw err
    }
  }

  async function proxy(req, res, url) {
    // url.pathname is already normalised by the URL parser, so `..` and
    // `%2e%2e` segments have been resolved before this check.
    const rest = url.pathname.slice(PROXY_BASE.length)
    if (rest !== ALLOWED_PREFIX && !rest.startsWith(`${ALLOWED_PREFIX}/`)) {
      return sendJson(res, 404, { error: 'Not found.' })
    }
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' })

    const session = readSession(req)
    if (!session?.token) return sendJson(res, 401, { error: 'Sign in to continue.' })

    const target = new URL(`${config.serverUrl}${rest}`)
    // The session's token is the only one that counts.
    url.searchParams.forEach((value, key) => {
      if (key !== 'token') target.searchParams.append(key, value)
    })
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
      return sendJson(res, 502, { error: 'Could not reach GeoHub. Try again in a moment.' })
    }

    // ArcGIS reports a dead token as HTTP 200 with the failure in the body.
    let code = null
    try {
      code = JSON.parse(text)?.error?.code ?? null
    } catch {
      // Not JSON: pass it through as it is.
    }
    if (code === 498 || code === 499) {
      clearSession(req, res)
      return sendJson(res, 401, { error: 'Your session has expired. Sign in again.' })
    }

    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(text)
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

      if (pathname === PROXY_BASE || pathname.startsWith(`${PROXY_BASE}/`)) {
        return await proxy(req, res, url)
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
