/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const spring = 'http://localhost:8080'

export default defineConfig({
  plugins: [
    react(),
    {
      // Dev only: /login and /register (no /app/ prefix) land on the app's pages, query string kept.
      name: 'auth-redirects',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const m = /^\/(login|register)\/?(\?.*)?$/.exec((req as { url?: string }).url ?? '') // no @types/node in this project
          if (!m) return next()
          res.writeHead(302, { Location: `/app/${m[1]}${m[2] ?? ''}` }).end()
        })
      },
    },
  ],
  base: '/app/',
  build: { outDir: '../target/classes/static/app', emptyOutDir: true },
  server: {
    port: 5173,
    // /collab: the collaboration service (collab/, `npm run dev`), WebSockets included
    proxy: { '/api': spring, '/logout': spring, '/collab': { target: 'ws://localhost:1234', ws: true } },
  },
  test: { environment: 'jsdom', exclude: ['e2e/**', 'node_modules/**'] },
})
