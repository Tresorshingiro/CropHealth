import fs from 'node:fs'
import path from 'node:path'

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

/** Serves the built app from `dist`, falling back to index.html for client-side routes. */
export function createStaticHandler(dist) {
  const isFile = (file) => {
    try {
      return fs.statSync(file).isFile()
    } catch {
      return false
    }
  }

  return function serveStatic(req, res) {
    const url = new URL(req.url, 'http://localhost')
    let rel
    try {
      rel = decodeURIComponent(url.pathname)
    } catch {
      res.statusCode = 400
      return res.end('Bad request')
    }
    const filePath = path.resolve(dist, `.${rel}`)
    if (filePath !== dist && !filePath.startsWith(dist + path.sep)) {
      res.statusCode = 403
      return res.end('Forbidden')
    }
    // Client-side routes (/login, /?upi=...) fall back to index.html.
    const target = isFile(filePath) ? filePath : path.join(dist, 'index.html')

    // A file can vanish between the check and the read (dist/ is emptied
    // during a rebuild). That must cost one request, not the whole server.
    const unavailable = () => {
      if (res.headersSent) return res.destroy()
      res.statusCode = 503
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end('The app is being updated. Try again in a moment.')
    }
    if (!isFile(target)) return unavailable()

    const stream = fs.createReadStream(target)
    stream.on('error', unavailable)
    stream.on('open', () => {
      res.setHeader('Content-Type', TYPES[path.extname(target)] || 'application/octet-stream')
      // Only Vite's hashed output is safe to cache forever.
      const hashed = target.startsWith(path.join(dist, 'assets') + path.sep)
      res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
      stream.pipe(res)
    })
  }
}
