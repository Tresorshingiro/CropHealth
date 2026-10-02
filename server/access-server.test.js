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
