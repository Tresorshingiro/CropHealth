import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createAccessMiddleware, readConfig } from './access-server.js'

const config = readConfig({ PORTAL_URL: 'https://portal.test/portal', SESSION_SECRET: 'test-secret' })

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

/** A fake GeoHub portal: one good password, everything else rejected. */
function portal(url, init = {}) {
  if (url.endsWith('/sharing/rest/generateToken')) {
    const body = new URLSearchParams(init.body)
    if (body.get('password') === 'right') {
      return jsonResponse({ token: 'TOK', expires: Date.now() + 3600_000 })
    }
    if (body.get('password') === 'expired') {
      return jsonResponse({ token: 'OLD', expires: Date.now() - 1000 })
    }
    return jsonResponse({
      error: { code: 400, message: 'Unable to generate token.', details: ['Invalid username or password.'] },
    })
  }
  if (url.endsWith('/sharing/rest/community/self')) {
    return jsonResponse({ username: 'tresor', fullName: 'Tresor S', email: 'tresor@example.rw' })
  }
  return jsonResponse({ error: { code: 404, message: 'Not found' } }, 404)
}

let server

async function start(upstream = portal) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    return upstream(String(url), init)
  }
  const middleware = createAccessMiddleware(config, fetchImpl)
  server = http.createServer((req, res) => middleware(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { base: `http://127.0.0.1:${server.address().port}`, calls }
}

afterEach(async () => {
  if (!server) return
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  server = null
})

const login = (base, username, password) =>
  fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0]

describe('readConfig', () => {
  it('derives the server URL from the portal URL', () => {
    expect(config.serverUrl).toBe('https://portal.test/server')
  })

  it('refuses to run in production without a real session secret', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/)
    expect(() =>
      readConfig({ NODE_ENV: 'production', SESSION_SECRET: 'change-this-in-production' }),
    ).toThrow(/SESSION_SECRET/)
  })
})

describe('sign-in', () => {
  it('signs in, sets an HttpOnly cookie and returns the user without the token', async () => {
    const { base, calls } = await start()
    const res = await login(base, ' tresor ', 'right')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({
      authenticated: true,
      user: { username: 'tresor', fullName: 'Tresor S', email: 'tresor@example.rw' },
    })
    expect(text).not.toContain('TOK')
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toMatch(/^crophealth_session=/)
    expect(setCookie).toMatch(/HttpOnly/)
    expect(setCookie).toMatch(/SameSite=Lax/)

    const tokenCall = calls.find((c) => c.url.endsWith('/generateToken'))
    const body = new URLSearchParams(tokenCall.init.body)
    expect(body.get('username')).toBe('tresor')
    expect(body.get('client')).toBe('referer')
    expect(body.get('referer')).toBe(base)
  })

  it('returns the portal message when the credentials are rejected', async () => {
    const { base } = await start()
    const res = await login(base, 'tresor', 'wrong')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Invalid username or password.' })
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('asks for both fields without calling the portal', async () => {
    const { base, calls } = await start()
    const res = await login(base, '', '')
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('rejects a body that is not JSON', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', body: 'not json' })
    expect(res.status).toBe(400)
  })

  it('reports an unreachable portal as 502', async () => {
    const { base } = await start(() => {
      throw new Error('ECONNREFUSED')
    })
    const res = await login(base, 'tresor', 'right')
    expect(res.status).toBe(502)
  })
})

describe('session', () => {
  it('reports the signed-in user', async () => {
    const { base } = await start()
    const cookie = cookieOf(await login(base, 'tresor', 'right'))
    const res = await fetch(`${base}/api/auth/session`, { headers: { cookie } })
    expect(await res.json()).toEqual({
      authenticated: true,
      user: { username: 'tresor', fullName: 'Tresor S', email: 'tresor@example.rw' },
    })
  })

  it('is unauthenticated with no cookie', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/api/auth/session`)
    expect(await res.json()).toEqual({ authenticated: false })
  })

  it('rejects a cookie whose content was changed', async () => {
    const { base } = await start()
    const cookie = cookieOf(await login(base, 'tresor', 'right'))
    const [name, value] = cookie.split('=')
    const forgedBody = Buffer.from(JSON.stringify({ token: 'x', username: 'admin' })).toString('base64url')
    const forged = `${name}=${forgedBody}.${value.split('.')[1]}`
    const res = await fetch(`${base}/api/auth/session`, { headers: { cookie: forged } })
    expect(await res.json()).toEqual({ authenticated: false })
  })

  it('treats an expired token as signed out', async () => {
    const { base } = await start()
    const cookie = cookieOf(await login(base, 'tresor', 'expired'))
    const res = await fetch(`${base}/api/auth/session`, { headers: { cookie } })
    expect(await res.json()).toEqual({ authenticated: false })
  })

  it('clears the cookie on sign-out', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/api/auth/logout`, { method: 'POST' })
    expect(await res.json()).toEqual({ authenticated: false })
    expect(res.headers.get('set-cookie')).toMatch(/crophealth_session=;.*Max-Age=0/)
  })

  it('answers unknown API paths with 404 JSON', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/api/nope`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found.' })
  })
})

describe('service proxy', () => {
  const SERVICE = '/api/gh/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer'

  /** Sign in against the fake portal, with `service` answering feature-service calls. */
  async function signedIn(service) {
    const ctx = await start((url, init) =>
      url.startsWith('https://portal.test/server/') ? service(url, init) : portal(url, init),
    )
    const cookie = cookieOf(await login(ctx.base, 'tresor', 'right'))
    const serviceCalls = () => ctx.calls.filter((c) => c.url.startsWith('https://portal.test/server/'))
    return { ...ctx, cookie, serviceCalls }
  }

  /** fetch() normalises `..` before sending, so raw paths need http.request. */
  function rawGet(base, path, cookie) {
    return new Promise((resolve, reject) => {
      const { hostname, port } = new URL(base)
      const req = http.request({ hostname, port, path, method: 'GET', headers: { cookie } }, (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => resolve({ status: res.statusCode, body }))
      })
      req.on('error', reject)
      req.end()
    })
  }

  it('forwards a query with the session token and the bound referer', async () => {
    const { base, cookie, serviceCalls } = await signedIn(() => jsonResponse({ features: [{ attributes: { upi: 'x' } }] }))
    const res = await fetch(`${base}${SERVICE}/0/query?where=1%3D1&f=json&token=EVIL`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ features: [{ attributes: { upi: 'x' } }] })

    const [call] = serviceCalls()
    const sent = new URL(call.url)
    expect(sent.pathname).toBe('/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/0/query')
    expect(sent.searchParams.get('where')).toBe('1=1')
    expect(sent.searchParams.getAll('token')).toEqual(['TOK'])
    expect(call.init.headers.referer).toBe(base)
  })

  it('refuses a request with no session and does not call GeoHub', async () => {
    const { base, serviceCalls } = await signedIn(() => jsonResponse({}))
    const res = await fetch(`${base}${SERVICE}/0/query?f=json`)
    expect(res.status).toBe(401)
    expect(serviceCalls()).toHaveLength(0)
  })

  it('returns 404 for any other service', async () => {
    const { base, cookie, serviceCalls } = await signedIn(() => jsonResponse({}))
    const paths = [
      '/api/gh/server/rest/services/Hosted/Other/FeatureServer/0/query',
      '/api/gh/server/rest/services/Hosted/RW_CropHealth_V2_ViewX/FeatureServer/0/query',
      '/api/gh/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServerX/0',
      '/api/gh/server/admin',
      '/api/gh/server',
    ]
    for (const path of paths) {
      const res = await fetch(`${base}${path}`, { headers: { cookie } })
      expect(res.status, path).toBe(404)
    }
    expect(serviceCalls()).toHaveLength(0)
  })

  it('returns 404 when dot segments try to leave the service', async () => {
    const { base, cookie, serviceCalls } = await signedIn(() => jsonResponse({}))
    const paths = [
      `${SERVICE}/../../Other/FeatureServer/0/query`,
      `${SERVICE}/%2e%2e/%2e%2e/Other/FeatureServer/0/query`,
      `${SERVICE}/0/../../../../../../portal/sharing/rest/portals/self`,
    ]
    for (const path of paths) {
      const res = await rawGet(base, path, cookie)
      expect(res.status, path).toBe(404)
    }
    expect(serviceCalls()).toHaveLength(0)
  })

  it('refuses methods other than GET', async () => {
    const { base, cookie, serviceCalls } = await signedIn(() => jsonResponse({}))
    const res = await fetch(`${base}${SERVICE}/0/applyEdits`, { method: 'POST', headers: { cookie }, body: 'f=json' })
    expect(res.status).toBe(405)
    expect(serviceCalls()).toHaveLength(0)
  })

  it('turns an ArcGIS invalid-token answer into 401 and clears the cookie', async () => {
    for (const code of [498, 499]) {
      const { base, cookie } = await signedIn(() => jsonResponse({ error: { code, message: 'Invalid token.' } }))
      const res = await fetch(`${base}${SERVICE}/0/query?f=json`, { headers: { cookie } })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toMatch(/crophealth_session=;.*Max-Age=0/)
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      server = null
    }
  })

  it('passes other ArcGIS errors through unchanged', async () => {
    const { base, cookie } = await signedIn(() => jsonResponse({ error: { code: 400, message: 'Invalid query' } }))
    const res = await fetch(`${base}${SERVICE}/0/query?f=json`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ error: { code: 400, message: 'Invalid query' } })
  })

  it('reports an unreachable GeoHub as 502', async () => {
    const { base, cookie } = await signedIn(() => {
      throw new Error('ECONNRESET')
    })
    const res = await fetch(`${base}${SERVICE}/0/query?f=json`, { headers: { cookie } })
    expect(res.status).toBe(502)
  })
})
