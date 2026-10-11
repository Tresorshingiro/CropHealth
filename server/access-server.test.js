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

async function start(upstream = portal, serverConfig = config) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    return upstream(String(url), init)
  }
  const middleware = createAccessMiddleware(serverConfig, fetchImpl)
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

  it('reads the data from the referenced services unless DATA_SOURCE says otherwise', () => {
    expect(config.dataSource).toBe('referenced')
    expect(readConfig({ DATA_SOURCE: ' Hosted ' }).dataSource).toBe('hosted')
    expect(() => readConfig({ DATA_SOURCE: 'elsewhere' })).toThrow(/DATA_SOURCE/)
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
  const SERVICE = '/api/data'

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
    const res = await fetch(`${base}${SERVICE}/parcels/query?where=1%3D1&f=json&token=EVIL`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ features: [{ attributes: { upi: 'x' } }] })

    const [call] = serviceCalls()
    const sent = new URL(call.url)
    expect(sent.pathname).toBe('/server/rest/services/WatchedParcels/FeatureServer/0/query')
    expect(sent.searchParams.get('where')).toBe('1=1')
    expect(sent.searchParams.getAll('token')).toEqual(['TOK'])
    expect(call.init.headers.referer).toBe(base)
  })

  it('sends each table to its layer of the chosen data source', async () => {
    const tables = {
      hosted: {
        parcels: '/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/0/query',
        observations: '/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/1/query',
        guide: '/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/2/query',
      },
      referenced: {
        parcels: '/server/rest/services/WatchedParcels/FeatureServer/0/query',
        observations: '/server/rest/services/ParcelObservations/FeatureServer/0/query',
        guide: '/server/rest/services/IndexGuide/FeatureServer/0/query',
      },
    }
    for (const [source, paths] of Object.entries(tables)) {
      const sourceConfig = readConfig({ PORTAL_URL: 'https://portal.test/portal', SESSION_SECRET: 'test-secret', DATA_SOURCE: source })
      const ctx = await start(
        (url, init) => (url.startsWith('https://portal.test/server/') ? jsonResponse({ features: [] }) : portal(url, init)),
        sourceConfig,
      )
      const cookie = cookieOf(await login(ctx.base, 'tresor', 'right'))
      for (const [table, path] of Object.entries(paths)) {
        const res = await fetch(`${ctx.base}${SERVICE}/${table}/query?where=1%3D1`, { headers: { cookie } })
        expect(res.status, `${source} ${table}`).toBe(200)
        const sent = new URL(ctx.calls.at(-1).url)
        expect(sent.pathname, `${source} ${table}`).toBe(path)
      }
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      server = null
    }
  })

  it('refuses a request with no session and does not call GeoHub', async () => {
    const { base, serviceCalls } = await signedIn(() => jsonResponse({}))
    const res = await fetch(`${base}${SERVICE}/parcels/query?f=json`)
    expect(res.status).toBe(401)
    expect(serviceCalls()).toHaveLength(0)
  })

  it('returns 404 for any other service', async () => {
    const { base, cookie, serviceCalls } = await signedIn(() => jsonResponse({}))
    const paths = [
      // The old pass-through route is gone: GeoHub paths are never taken from the browser.
      '/api/gh/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/0/query',
      '/api/data/other/query',
      '/api/data/parcelsX/query',
      '/api/data/Parcels/query',
      '/api/dataX/parcels/query',
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
    const res = await fetch(`${base}${SERVICE}/parcels/query`, { method: 'POST', headers: { cookie }, body: 'f=json' })
    expect(res.status).toBe(405)
    expect(serviceCalls()).toHaveLength(0)
  })

  it('turns an ArcGIS invalid-token answer into 401 and clears the cookie', async () => {
    for (const code of [498, 499]) {
      const { base, cookie } = await signedIn(() => jsonResponse({ error: { code, message: 'Invalid token.' } }))
      const res = await fetch(`${base}${SERVICE}/parcels/query?f=json`, { headers: { cookie } })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toMatch(/crophealth_session=;.*Max-Age=0/)
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      server = null
    }
  })

  it('passes other ArcGIS errors through unchanged', async () => {
    const { base, cookie } = await signedIn(() => jsonResponse({ error: { code: 400, message: 'Invalid query' } }))
    const res = await fetch(`${base}${SERVICE}/parcels/query?f=json`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ error: { code: 400, message: 'Invalid query' } })
  })

  it('reports an unreachable GeoHub as 502', async () => {
    const { base, cookie } = await signedIn(() => {
      throw new Error('ECONNRESET')
    })
    const res = await fetch(`${base}${SERVICE}/parcels/query?f=json`, { headers: { cookie } })
    expect(res.status).toBe(502)
  })
})

describe('hardening', () => {
  const SERVICE = '/api/data'
  const isService = (url) => url.startsWith('https://portal.test/server/')

  async function signedIn(service = () => jsonResponse({ features: [] })) {
    const ctx = await start((url, init) => (isService(url) ? service(url, init) : portal(url, init)))
    const cookie = cookieOf(await login(ctx.base, 'tresor', 'right'))
    return { ...ctx, cookie, serviceCalls: () => ctx.calls.filter((c) => isService(c.url)) }
  }

  function rawGet(base, path, cookie) {
    return new Promise((resolve, reject) => {
      const { hostname, port } = new URL(base)
      const req = http.request({ hostname, port, path, method: 'GET', headers: { cookie } }, (res) => {
        res.resume()
        res.on('end', () => resolve({ status: res.statusCode }))
      })
      req.on('error', reject)
      req.end()
    })
  }

  it('forwards only queries on the three named tables', async () => {
    const { base, cookie, serviceCalls } = await signedIn()
    const paths = [
      `${SERVICE}`,
      `${SERVICE}/parcels`,
      `${SERVICE}/0/query`,
      `${SERVICE}/runlog/query`,
      `${SERVICE}/parcels/queryRelatedRecords`,
      `${SERVICE}/..;/..;/Other/FeatureServer/0/query`,
      `${SERVICE}/..%2f..%2fOther/FeatureServer/0/query`,
      `${SERVICE}/..%5c..%5cOther/FeatureServer/0/query`,
      `${SERVICE}/%252e%252e/%252e%252e/Other/FeatureServer/0/query`,
      `${SERVICE}/parcels/query/..%2f..%2fadmin`,
    ]
    for (const path of paths) {
      const res = await rawGet(base, path, cookie)
      expect(res.status, path).toBe(404)
    }
    expect(serviceCalls()).toHaveLength(0)
    for (const table of ['parcels', 'observations', 'guide']) {
      const res = await rawGet(base, `${SERVICE}/${table}/query?where=1%3D1`, cookie)
      expect(res.status).toBe(200)
    }
    expect(serviceCalls()).toHaveLength(3)
  })

  it('drops token and callback parameters in any letter case and always asks for JSON', async () => {
    const { base, cookie, serviceCalls } = await signedIn()
    const res = await fetch(`${base}${SERVICE}/parcels/query?where=1%3D1&Token=EVIL&TOKEN=E2&callback=x&f=html`, {
      headers: { cookie },
    })
    expect(res.headers.get('content-type')).toMatch(/^application\/json/)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    const sent = new URL(serviceCalls()[0].url)
    expect([...sent.searchParams.keys()].sort()).toEqual(['f', 'token', 'where'])
    expect(sent.searchParams.get('token')).toBe('TOK')
    expect(sent.searchParams.get('f')).toBe('json')
  })

  it('answers as JSON even when GeoHub sends HTML', async () => {
    const { base, cookie } = await signedIn(
      () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }),
    )
    const res = await fetch(`${base}${SERVICE}/parcels/query`, { headers: { cookie } })
    expect(res.status).toBe(502)
    expect(res.headers.get('content-type')).toMatch(/^application\/json/)
    expect(await res.json()).toEqual({ error: 'The GIS service could not answer the request.' })
  })

  it('does not expose the portal token in the cookie value', async () => {
    const { base } = await start()
    const value = cookieOf(await login(base, 'tresor', 'right')).split('=')[1]
    for (const part of value.split('.')) {
      expect(Buffer.from(part, 'base64url').toString()).not.toContain('TOK')
      expect(Buffer.from(part, 'base64url').toString()).not.toContain('tresor')
    }
  })

  it('rejects a cookie sealed with a different secret', async () => {
    const other = readConfig({ PORTAL_URL: 'https://portal.test/portal', SESSION_SECRET: 'another-secret' })
    const first = await start(portal, other)
    const cookie = cookieOf(await login(first.base, 'tresor', 'right'))
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    const { base } = await start()
    const res = await fetch(`${base}/api/auth/session`, { headers: { cookie } })
    expect(await res.json()).toEqual({ authenticated: false })
  })

  it('marks the cookie Secure behind an HTTPS reverse proxy, even when Host is local', async () => {
    const production = readConfig({
      PORTAL_URL: 'https://portal.test/portal',
      SESSION_SECRET: 'test-secret',
      NODE_ENV: 'production',
    })
    const { base } = await start(portal, production)
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'crophealth.example.rw',
      },
      body: JSON.stringify({ username: 'tresor', password: 'right' }),
    })
    expect(res.headers.get('set-cookie')).toMatch(/; Secure/)
  })

  it('leaves Secure off for a plain local run so sign-in works on localhost', async () => {
    const production = readConfig({
      PORTAL_URL: 'https://portal.test/portal',
      SESSION_SECRET: 'test-secret',
      NODE_ENV: 'production',
    })
    const { base } = await start(portal, production)
    const res = await login(base, 'tresor', 'right')
    expect(res.headers.get('set-cookie')).not.toMatch(/Secure/)
  })

  it('reports a portal outage as 502, not as wrong credentials', async () => {
    const { base } = await start(
      () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }),
    )
    const res = await login(base, 'tresor', 'right')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Could not reach the GIS service. Try again in a moment.' })
  })
})

describe('analysis tool', () => {
  const TOOL = 'https://portal.test/notebook/rest/services/abc/GPServer/ParcelIndices'
  const toolConfig = readConfig({ PORTAL_URL: 'https://portal.test/portal', SESSION_SECRET: 'test-secret', ANALYSIS_URL: TOOL })

  const tool = (answers) => (url, init = {}) => {
    if (url.startsWith(TOOL)) return answers(url, init)
    return portal(url, init)
  }
  const signedIn = async (answers) => {
    const { base, calls } = await start(tool(answers), toolConfig)
    const cookie = cookieOf(await login(base, 'tresor', 'right'))
    return { base, calls, cookie }
  }
  const submit = (base, cookie, body) =>
    fetch(`${base}/api/analysis`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })

  it('needs a session', async () => {
    const { base } = await start(tool(() => jsonResponse({})), toolConfig)
    expect((await submit(base, '', { upi: '5/05/06/02/4219' })).status).toBe(401)
  })

  it('starts a job for one UPI, with the session token and no drawn area', async () => {
    const { base, calls, cookie } = await signedIn(() => jsonResponse({ jobId: 'j0a1b2', jobStatus: 'esriJobSubmitted' }))
    const res = await submit(base, cookie, { upi: ' 5/05/06/02/4219 ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ jobId: 'j0a1b2', status: 'running' })

    const call = calls.find((c) => c.url.startsWith(TOOL))
    expect(call.url).toBe(`${TOOL}/submitJob`)
    expect(call.init.method).toBe('POST')
    const body = new URLSearchParams(call.init.body)
    expect(body.get('UPI')).toBe('5/05/06/02/4219')
    expect(body.get('AREA')).toBe('')
    expect(body.get('AREA_NAME')).toBeNull()
    expect(body.get('f')).toBe('json')
    expect(body.get('token')).toBe('TOK')
    expect(call.init.headers.referer).toMatch(/^http:\/\/127\.0\.0\.1:/)
  })

  const FIELD = [[[30.8, -2.2], [30.801, -2.2], [30.801, -2.199], [30.8, -2.2]]]

  it('starts a job for a drawn field, sent as a WGS84 feature set with its name', async () => {
    const { base, calls, cookie } = await signedIn(() => jsonResponse({ jobId: 'j9', jobStatus: 'esriJobSubmitted' }))
    const res = await submit(base, cookie, { area: { rings: FIELD }, name: ' North field ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ jobId: 'j9', status: 'running' })
    const body = new URLSearchParams(calls.find((c) => c.url.startsWith(TOOL)).init.body)
    expect(body.get('UPI')).toBe('')
    expect(body.get('AREA_NAME')).toBe('North field')
    expect(JSON.parse(body.get('AREA'))).toEqual({
      geometryType: 'esriGeometryPolygon',
      spatialReference: { wkid: 4326 },
      features: [{ geometry: { rings: FIELD, spatialReference: { wkid: 4326 } }, attributes: {} }],
    })
    expect(body.get('token')).toBe('TOK')
  })

  it('refuses a drawn field that is not one small closed ring inside Rwanda, or a bad name', async () => {
    const { base, calls, cookie } = await signedIn(() => jsonResponse({}))
    const open = [[[30.8, -2.2], [30.801, -2.2], [30.801, -2.199], [30.8, -2.199]]]
    const few = [[[30.8, -2.2], [30.801, -2.2], [30.8, -2.2]]]
    const outside = [[[32.5, 0.3], [32.501, 0.3], [32.501, 0.301], [32.5, 0.3]]]
    const wide = [[[30.8, -2.2], [30.9, -2.2], [30.9, -2.199], [30.8, -2.2]]]
    const text = [[[30.8, -2.2], ['30.801', -2.2], [30.801, -2.199], [30.8, -2.2]]]
    const two = [FIELD[0], FIELD[0]]
    const many = [[...Array.from({ length: 501 }, (_, i) => [30.8 + i * 0.00001, -2.2]), [30.8, -2.2]]]
    for (const rings of [open, few, outside, wide, text, two, many]) {
      expect((await submit(base, cookie, { area: { rings }, name: 'North field' })).status).toBe(400)
    }
    for (const name of ['', '   ', 'a'.repeat(27), "North' OR 1=1", ' two  spaces', 42]) {
      expect((await submit(base, cookie, { area: { rings: FIELD }, name })).status).toBe(400)
    }
    expect((await submit(base, cookie, { upi: '5/05/06/02/4219', area: { rings: FIELD }, name: 'North field' })).status).toBe(400)
    expect(calls.some((c) => c.url.startsWith(TOOL))).toBe(false)
  })

  it('runs a drawn field again by its id, which the tool reads from the UPI box', async () => {
    const { base, calls, cookie } = await signedIn(() => jsonResponse({ jobId: 'j7', jobStatus: 'esriJobSubmitted' }))
    for (const id of ['AREA North field', 'AREA-1A2B3C4D']) {
      const res = await submit(base, cookie, { upi: ` ${id} ` })
      expect(res.status).toBe(200)
      const body = new URLSearchParams(calls.filter((c) => c.url.startsWith(TOOL)).at(-1).init.body)
      expect(body.get('UPI')).toBe(id)
      expect(body.get('AREA')).toBe('')
    }
  })

  it('refuses anything but a UPI or a drawn field id, and asks the tool nothing', async () => {
    const { base, calls, cookie } = await signedIn(() => jsonResponse({}))
    const bad = ['', 'AREA', 'AREA ', `AREA ${'a'.repeat(27)}`, "AREA North' OR 1=1", 'AREA-XYZ', 'area north', "5/05/06/02/1' OR 1=1", '5/05/06/02/4219/9', 42]
    for (const upi of bad) {
      expect((await submit(base, cookie, { upi })).status).toBe(400)
    }
    expect(calls.some((c) => c.url.startsWith(TOOL))).toBe(false)
  })

  it('reports a job as running, succeeded or failed with the tool\'s own message', async () => {
    const answers = {
      jrun: { jobId: 'jrun', jobStatus: 'esriJobExecuting', messages: [] },
      jok: { jobId: 'jok', jobStatus: 'esriJobSucceeded', messages: [{ type: 'esriJobMessageTypeInformative', description: 'Done' }] },
      jbad: {
        jobId: 'jbad',
        jobStatus: 'esriJobFailed',
        messages: [
          { type: 'esriJobMessageTypeInformative', description: 'Reading imagery' },
          { type: 'esriJobMessageTypeError', description: 'UPI not found in NLA parcels.' },
        ],
      },
    }
    const { base, calls, cookie } = await signedIn((url) => jsonResponse(answers[new URL(url).pathname.split('/').pop()]))
    const status = async (id) => (await fetch(`${base}/api/analysis/${id}`, { headers: { cookie } })).json()
    expect(await status('jrun')).toEqual({ jobId: 'jrun', status: 'running' })
    expect(await status('jok')).toEqual({ jobId: 'jok', status: 'succeeded' })
    expect(await status('jbad')).toEqual({ jobId: 'jbad', status: 'failed', message: 'UPI not found in NLA parcels.' })

    const call = calls.find((c) => c.url.includes('/jobs/jrun'))
    const url = new URL(call.url)
    expect(url.origin + url.pathname).toBe(`${TOOL}/jobs/jrun`)
    expect(url.searchParams.get('f')).toBe('json')
    expect(url.searchParams.get('token')).toBe('TOK')
  })

  it('says plainly when the account may not run the tool', async () => {
    const { base, cookie } = await signedIn(() =>
      jsonResponse({ error: { code: 403, message: 'You do not have permissions to access this resource or perform this operation.' } }),
    )
    const res = await submit(base, cookie, { upi: '5/05/06/02/4219' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('Your account is not allowed to run the analysis. Ask the GIS team for access.')
  })

  it('signs the user out when the token has expired', async () => {
    const { base, cookie } = await signedIn(() => jsonResponse({ error: { code: 498, message: 'Invalid token.' } }))
    expect((await submit(base, cookie, { upi: '5/05/06/02/4219' })).status).toBe(401)
  })

  it('follows a job whose id has dashes or underscores, as Notebook Server ids do', async () => {
    const id = 'j2c4e-9f1a_b7d3-4e21'
    const { base, calls, cookie } = await signedIn(() => jsonResponse({ jobId: id, jobStatus: 'esriJobExecuting' }))
    const res = await fetch(`${base}/api/analysis/${id}`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ jobId: id, status: 'running' })
    expect(calls.some((c) => c.url.startsWith(`${TOOL}/jobs/${id}?`))).toBe(true)
  })

  it('says so when the tool starts no job', async () => {
    const { base, cookie } = await signedIn(() => jsonResponse({ jobStatus: 'esriJobFailed' }))
    const res = await submit(base, cookie, { upi: '5/05/06/02/4219' })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('The analysis tool did not start a job.')
  })

  it('answers 404 for a malformed job id and 405 for other methods', async () => {
    const { base, calls, cookie } = await signedIn(() => jsonResponse({}))
    expect((await fetch(`${base}/api/analysis/..%2Fsubmit`, { headers: { cookie } })).status).toBe(404)
    expect((await fetch(`${base}/api/analysis`, { headers: { cookie } })).status).toBe(405)
    expect((await fetch(`${base}/api/analysis/j1`, { method: 'DELETE', headers: { cookie } })).status).toBe(405)
    expect(calls.some((c) => c.url.startsWith(TOOL))).toBe(false)
  })
})
