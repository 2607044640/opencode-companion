import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { handleHostApi } from './host-api.mjs'

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

  if (reqPath === '/api/git-checkpoint' || reqPath === '/api/external-file-rollback') {
    void handleHostApi(req, res)
    return
  }

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

  if (reqPath === '/api/proxy/relay-quota') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      })
      res.end()
      return
    }

    if (req.method === 'GET') {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1:5173'}`)
      const target = parsedUrl.searchParams.get('target')
      const token = parsedUrl.searchParams.get('token') || req.headers['authorization']

      if (!target) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ error: 'target parameter is required' }))
        return
      }

      const headers = {
        'User-Agent': 'OpenCode-Companion/1.0',
        'Accept': 'application/json',
      }
      if (token) {
        headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      fetch(target, { method: 'GET', headers, signal: controller.signal })
        .then(async (upstreamRes) => {
          clearTimeout(timeoutId)
          const text = await upstreamRes.text()
          res.writeHead(upstreamRes.status, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(text)
        })
        .catch((err) => {
          clearTimeout(timeoutId)
          res.writeHead(502, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(JSON.stringify({ error: err.message || 'Upstream fetch failed' }))
        })
      return
    }
  }

  // Relay presets dynamic endpoint: resolves relay channel presets via GatewayAPIManager without hardcoding secrets
  if (reqPath === '/api/relays/presets') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      res.end()
      return
    }
    if (req.method === 'GET') {
      try {
        let scriptPath = 'C:\\AICore\\skills\\GatewayAPIManager\\scripts\\manage_gateway_channels.py'
        if (!fs.existsSync(scriptPath)) {
          scriptPath = 'C:\\GlobalAIRules\\skills\\GatewayAPIManager\\scripts\\manage_gateway_channels.py'
        }
        let channels = []
        if (fs.existsSync(scriptPath)) {
          const raw = execSync(`python "${scriptPath}" --json list`, {
            timeout: 10000,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          })
          channels = JSON.parse(raw)
        }

        const presets = []
        // 1. TokenShop (Channel 13 / tokenshop.homes)
        const tokenShop = channels.find(c => c.base_url && c.base_url.includes('tokenshop.homes'))
        if (tokenShop) {
          presets.push({
            id: 'relay_tokenshop',
            name: 'TokenShop (Grok)',
            baseUrl: tokenShop.base_url,
            apiKey: tokenShop.key,
            redeemUrl: 'https://tokenshop.homes/redeem',
            currency: 'USD',
            quotaRate: 500000,
            cnyRate: 7.2,
          })
        }
        // 2. 稳定中转 (Channel 15 / xn--fiq104an1x80s.com - Flash 3.7)
        const wending = channels.find(c => c.base_url && (c.base_url.includes('xn--fiq104an1x80s.com') || c.base_url.includes('ai6666.shop') || (c.name && c.name.includes('稳定中转'))))
        if (wending) {
          presets.push({
            id: 'relay_wending',
            name: '稳定中转 (Flash 3.7)',
            baseUrl: wending.base_url,
            apiKey: wending.key,
            redeemUrl: 'https://xn--fiq104an1x80s.com',
            currency: 'USD',
            quotaRate: 500000,
            cnyRate: 7.2,
          })
        } else {
          // Fallback to GGUU if present
          const gguu = channels.find(c => c.base_url && (c.base_url.includes('gguuai.com') || (c.name && c.name.toLowerCase().includes('gguu'))))
          if (gguu) {
            presets.push({
              id: 'relay_gguu',
              name: 'GGUU (Flash 3.8)',
              baseUrl: gguu.base_url,
              apiKey: gguu.key,
              redeemUrl: 'https://gguuai.com/redeem',
              currency: 'USD',
              quotaRate: 500000,
              cnyRate: 7.2,
            })
          }
        }
        // 3. Moniker fallback
        const moniker = channels.find(c => c.base_url && c.base_url.includes('aimoniker.top'))
        if (moniker && presets.length < 2) {
          presets.push({
            id: 'relay_moniker',
            name: 'Moniker AI',
            baseUrl: moniker.base_url,
            apiKey: moniker.key,
            redeemUrl: 'https://aimoniker.top',
            currency: 'USD',
            quotaRate: 500000,
            cnyRate: 7.2,
          })
        }

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(JSON.stringify({ ok: true, presets }))
      } catch (err) {
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(JSON.stringify({ ok: false, error: err.message, presets: [] }))
      }
      return
    }
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenCode Companion server running on port ${PORT}`)
  startWslPortForwarder()
})

function startWslPortForwarder() {
  try {
    const rawIp = execSync('wsl.exe -d opencode-jail hostname -I', { encoding: 'utf8', timeout: 5000 })
    const wslIp = rawIp.trim().split(/\s+/)[0]
    if (!wslIp) return

    const forwarder = net.createServer((clientSocket) => {
      const serverSocket = net.connect(5001, wslIp)
      clientSocket.pipe(serverSocket).pipe(clientSocket)
      clientSocket.on('error', () => serverSocket.destroy())
      serverSocket.on('error', () => clientSocket.destroy())
    })

    forwarder.on('error', (err) => {
      if (err.code !== 'EADDRINUSE') {
        console.warn('[WSL Forwarder] Port 5001 forwarder notice:', err.message)
      }
    })

    forwarder.listen(5001, '127.0.0.1', () => {
      console.log(`[WSL Forwarder] Forwarding Windows 127.0.0.1:5001 -> WSL ${wslIp}:5001`)
    })
  } catch (err) {
    console.warn('[WSL Forwarder] Could not resolve WSL IP:', err.message)
  }
}
