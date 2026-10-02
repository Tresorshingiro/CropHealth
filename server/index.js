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
import { createStaticHandler } from './static.js'

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

const middleware = createAccessMiddleware(readConfig())
const serveStatic = createStaticHandler(DIST)
const PORT = Number(process.env.PORT || 4173)

const server = http.createServer((req, res) =>
  middleware(req, res, () => {
    try {
      serveStatic(req, res)
    } catch (err) {
      console.error(`Static request failed: ${err.message}`)
      if (!res.headersSent) res.statusCode = 500
      res.end()
    }
  }),
)

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
