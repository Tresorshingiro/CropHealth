/**
 * Production server: serves the built dist/ and mounts the access server in
 * front of it. A static host alone cannot run this app, because sign-in and
 * the GeoHub proxy are routes on this process.
 *
 * Run:  npm run build, then npm start
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAccessMiddleware, readConfig } from './access-server.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

/** Vite loads .env in development; this process has to do it itself. */
function loadEnvFile() {
  const file = path.join(ROOT, '.env')
  if (!fs.existsSync(file)) return
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    if (!(key in process.env)) process.env[key] = value
  }
}
loadEnvFile()
// `npm start` is the production entry on every platform, Windows included.
process.env.NODE_ENV ||= 'production'

if (!fs.existsSync(DIST)) {
  console.error(`No build found at ${DIST}. Run "npm run build" first.`)
  process.exit(1)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost')
  let rel
  try {
    rel = decodeURIComponent(url.pathname)
  } catch {
    res.statusCode = 400
    return res.end('Bad request')
  }
  const filePath = path.resolve(DIST, `.${rel}`)
  if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) {
    res.statusCode = 403
    return res.end('Forbidden')
  }
  // Client-side routes (/login, /?upi=...) fall back to index.html.
  const isFile = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  const target = isFile ? filePath : path.join(DIST, 'index.html')
  res.setHeader('Content-Type', TYPES[path.extname(target)] || 'application/octet-stream')
  // Only Vite's hashed output is safe to cache forever.
  const hashed = target.startsWith(path.join(DIST, 'assets') + path.sep)
  res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
  fs.createReadStream(target).pipe(res)
}

const middleware = createAccessMiddleware(readConfig())
const PORT = Number(process.env.PORT || 4173)

const server = http.createServer((req, res) => middleware(req, res, () => serveStatic(req, res)))

server.on('error', (err) => {
  console.error(
    err.code === 'EADDRINUSE'
      ? `Port ${PORT} is already in use. Set PORT to another value.`
      : `Server failed to start: ${err.message}`,
  )
  process.exit(1)
})

server.listen(PORT, () => {
  console.log(`Crop Health listening on http://localhost:${PORT}`)
})
