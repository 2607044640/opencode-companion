import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

function talkMapDevPersist(): Plugin {
  return {
    name: 'talk-map-dev-persist',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (url !== '/api/map') {
          next()
          return
        }
        const dataDir = path.join(server.config.root, 'data')
        const mapFile = path.join(dataDir, 'talk_map.json')
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true })
        }
        if (req.method === 'GET') {
          if (fs.existsSync(mapFile)) {
            res.setHeader('Content-Type', 'application/json')
            fs.createReadStream(mapFile).pipe(res)
          } else {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              version: 1,
              global: { camera: { x: 0, y: 0, zoom: 1 }, hotkeys: {} },
              boards: {},
              cards: {},
              groups: {},
              edges: {},
              digests: {},
            }))
          }
          return
        }
        if (req.method === 'PUT') {
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk })
          req.on('end', () => {
            try {
              fs.writeFileSync(mapFile, body, 'utf8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch (err) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
            }
          })
          return
        }
        next()
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    talkMapDevPersist()
  ],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/opencode-proxy': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/opencode-proxy/, '')
      }
    }
  }
})
