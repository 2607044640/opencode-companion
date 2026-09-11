import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, 'dist')
const PORT = 5173

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0]

  // Persistent dialogue map storage endpoint
  // Session export endpoint — writes JSON to the Windows Desktop
  if (reqPath === '/api/export-session' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const { filename, content } = JSON.parse(body)
        // Resolve export path dynamically from environment variables
        let desktopPath = ''
        if (process.env.USERPROFILE && fs.existsSync(path.join(process.env.USERPROFILE, 'Desktop'))) {
          desktopPath = path.join(process.env.USERPROFILE, 'Desktop')
        } else if (process.env.HOME && fs.existsSync(path.join(process.env.HOME, 'Desktop'))) {
          desktopPath = path.join(process.env.HOME, 'Desktop')
        } else if (fs.existsSync('/mnt/c/Users')) {
          const userDir = process.env.USERNAME ? `/mnt/c/Users/${process.env.USERNAME}/Desktop` : ''
          if (userDir && fs.existsSync(userDir)) desktopPath = userDir
        }
        if (!desktopPath) {
          desktopPath = path.join(__dirname, 'exports')
        }
        if (!fs.existsSync(desktopPath)) fs.mkdirSync(desktopPath, { recursive: true })
        const safeName = String(filename || 'session-export.json').replace(/[/\\:*?"<>|]/g, '_')
        const outFile = path.join(desktopPath, safeName)
        fs.writeFileSync(outFile, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8')
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ ok: true, path: outFile }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }
  if (reqPath === '/api/export-session' && req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  // Git revert endpoint — reverts the last commit in a given worktree directory
  if (reqPath === '/api/git-revert' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const { directory, mode = 'revert' } = JSON.parse(body || '{}')
        if (!directory || typeof directory !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(JSON.stringify({ error: 'directory is required' }))
          return
        }
        // Sanitize: strip dangerous shell chars
        const safeDir = directory.replace(/[;&|`$()]/g, '')
        let cmd
        if (mode === 'reset') {
          // Soft reset: remove last commit but keep changes staged
          cmd = `git -C "${safeDir}" reset HEAD~1 --soft`
        } else {
          // Standard revert: create a new commit undoing the last one
          cmd = `git -C "${safeDir}" revert HEAD --no-edit`
        }
        const out = execSync(cmd, { timeout: 15000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ ok: true, output: out }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ error: err.message || String(err) }))
      }
    })
    return
  }
  if (reqPath === '/api/git-revert' && req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (reqPath === '/api/map') {
    const dataDir = path.join(__dirname, 'data')
    const mapFile = path.join(dataDir, 'talk_map.json')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    if (req.method === 'GET') {
      if (fs.existsSync(mapFile)) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        })
        fs.createReadStream(mapFile).pipe(res)
      } else {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        })
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
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        try {
          fs.writeFileSync(mapFile, body, 'utf8')
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(JSON.stringify({ ok: true }))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      res.end()
      return
    }
  }

  if (reqPath === '/') reqPath = '/index.html'
  let filePath = path.join(DIST_DIR, reqPath)

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html')
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500)
      res.end('Internal Server Error')
      return
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    })
    res.end(content)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`OpenCode Companion server running at http://127.0.0.1:${PORT}`)
})
