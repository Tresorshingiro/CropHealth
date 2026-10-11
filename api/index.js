/**
 * Vercel entry for the access server. vercel.json rewrites every /api/* request
 * here; the page itself is served as static files from dist/. Other hosts use
 * server/index.js, which mounts the same middleware.
 */
import { createAccessMiddleware, readConfig } from '../server/access-server.js'

let middleware = null

export default function handler(req, res) {
  if (!middleware) {
    try {
      middleware = createAccessMiddleware(readConfig())
    } catch (err) {
      // Most often SESSION_SECRET is not set in the project's environment variables.
      console.error(`Access server not configured: ${err.message}`)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      return res.end(JSON.stringify({ error: 'The server is not set up yet. Ask the administrator.' }))
    }
  }
  return middleware(req, res)
}
