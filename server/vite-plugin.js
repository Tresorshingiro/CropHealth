import { createAccessMiddleware, readConfig } from './access-server.js'

/**
 * Mounts the access server inside Vite for `npm run dev` and `npm run preview`.
 * Production uses server/index.js, which mounts the same middleware.
 */
export function accessServerPlugin(env) {
  // Built only when a server starts, so `vite build` never needs the secrets.
  // A Vite-hosted server is a local tool: NODE_ENV is pinned so `vite preview`
  // runs without a production SESSION_SECRET. Real production is server/index.js.
  const mount = (server) => {
    server.middlewares.use(createAccessMiddleware(readConfig({ ...env, NODE_ENV: 'development' })))
  }
  return {
    name: 'crophealth-access-server',
    configureServer: mount,
    configurePreviewServer: mount,
  }
}
