import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStaticHandler } from './static.js'

let dist
let server
let base

beforeEach(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'crophealth-dist-'))
  fs.mkdirSync(path.join(dist, 'assets'))
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>')
  fs.writeFileSync(path.join(dist, 'assets', 'app-abc123.js'), 'console.log(1)')
  const handler = createStaticHandler(dist)
  server = http.createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  fs.rmSync(dist, { recursive: true, force: true })
})

describe('static handler', () => {
  it('serves a built file with its type and long caching for hashed assets', async () => {
    const res = await fetch(`${base}/assets/app-abc123.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/javascript/)
    expect(res.headers.get('cache-control')).toMatch(/immutable/)
    expect(await res.text()).toBe('console.log(1)')
  })

  it('falls back to index.html for client-side routes', async () => {
    const res = await fetch(`${base}/login?next=%2F`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-cache')
    expect(await res.text()).toContain('id="root"')
  })

  it('answers 503 and keeps running when the build is missing', async () => {
    fs.rmSync(path.join(dist, 'index.html'))
    const res = await fetch(`${base}/login`)
    expect(res.status).toBe(503)
    fs.writeFileSync(path.join(dist, 'index.html'), 'back')
    expect((await fetch(`${base}/`)).status).toBe(200)
  })

  it('answers 400 for a path that cannot be decoded', async () => {
    const res = await new Promise((resolve, reject) => {
      const { hostname, port } = new URL(base)
      const req = http.request({ hostname, port, path: '/%E0%A4%A', method: 'GET' }, (r) => {
        r.resume()
        r.on('end', () => resolve(r))
      })
      req.on('error', reject)
      req.end()
    })
    expect(res.statusCode).toBe(400)
  })
})
