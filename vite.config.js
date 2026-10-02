import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { accessServerPlugin } from './server/vite-plugin.js'

export default defineConfig(({ mode }) => {
  // '' loads every key in .env, not only VITE_ ones. They stay on the server:
  // nothing here is passed to `define`.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), accessServerPlugin(env)],
  }
})
