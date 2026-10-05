import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, execFile } from 'node:child_process'
import { handleHostApi } from './host-api.mjs'
import { edgeLaunchArgs, resolveEdgeExecutable, OPENCODE5173_APP_ID } from './pwa-launch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, 'dist')
const PORT = 5173

let lastFocusTs = 0
function focusInstalledApp(sessionId) {
  const now = Date.now()
  if (now - lastFocusTs < 2000) return
  lastFocusTs = now
  const launcherPy = path.join(__dirname, 'launch_pwa.pyw')
  if (fs.existsSync(launcherPy)) {
    const pythonExe = process.platform === 'win32' ? 'pythonw.exe' : 'python3'
    execFile(pythonExe, [launcherPy, sessionId || ''], { timeout: 4000 }, (err) => {
      if (err) console.error('[serve.mjs] launch_pwa.pyw error:', err.message)
    })
    return
  }
  const edgeExe = resolveEdgeExecutable((candidate) => fs.existsSync(candidate))
  const wslExe = '/mnt/c' + edgeExe.slice(2).replace(/\\/g, '/')
  const executable = fs.existsSync(wslExe) ? wslExe : edgeExe
  const args = edgeLaunchArgs(sessionId, OPENCODE5173_APP_ID, executable)
  execFile(executable, args, { timeout: 4000 }, (err) => {
    if (err) console.error('[serve.mjs] focusInstalledApp launch error:', err.message)
  })
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function rememberSession(sid) {
  if (!sid) return
  globalThis._activeSessionId = sid
  globalThis._activeSessionTs = Date.now()
  globalThis._lastNavIntent = {
    sessionId: sid,
    timestamp: Date.now(),
  }
}

function jumpPage(sessionId) {
  const safeSession = String(sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>OpenCode5173</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      background: #0c0d0e;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      background: #16181d;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 32px 36px;
      max-width: 420px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .icon {
      font-size: 36px;
      margin-bottom: 12px;
    }
    h2 {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
      color: #f4f4f5;
    }
    p {
      margin: 0 0 20px 0;
      font-size: 14px;
      color: #a1a1aa;
      line-height: 1.5;
    }
    .btn {
      display: inline-block;
      background: #f97316;
      color: #ffffff;
      padding: 8px 20px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      border: none;
      cursor: pointer;
    }
    .btn:hover {
      background: #ea580c;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🚀</div>
    <h2>已唤起 OpenCode5173</h2>
    <p>已在桌面应用中打开会话${safeSession ? ` (${safeSession})` : ''}。<br>此网页标签可直接关闭。</p>
    <button class="btn" onclick="window.close()">关闭此标签</button>
  </div>
  <script>
    try {
      window.opener = null;
      window.open('', '_self');
      window.close();
    } catch (e) {}
    setTimeout(function() {
      try {
        window.close();
      } catch (e) {}
    }, 150);
  </script>
</body>
</html>`
}

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0]

  const isJumpRoute = reqPath === '/jump'
  const isRootSession = (reqPath === '/' || reqPath === '/index.html') && req.url.includes('session=')

  if (isJumpRoute || isRootSession) {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1:5173')
    const sid = parsedUrl.searchParams.get('session') || ''
    if (sid) {
      rememberSession(sid)
      try {
        focusInstalledApp(sid)
      } catch (err) {
        console.error('[serve.mjs] focusInstalledApp error:', err)
      }
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    })
    res.end(jumpPage(sid))
    return
  }

  // Same-origin reverse proxy to OpenCode daemon (127.0.0.1:5001)
  if (reqPath === '/opencode-proxy' || reqPath.startsWith('/opencode-proxy/')) {
    const targetPath = req.url.replace(/^\/opencode-proxy/, '') || '/'
    const isSse = reqPath === '/opencode-proxy/global/event' || (req.headers['accept'] && req.headers['accept'].includes('text/event-stream'))
    const start = Date.now()

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      })
      res.end()
      return
    }

    const proxyHeaders = { ...req.headers, host: '127.0.0.1:5001' }
    delete proxyHeaders['connection']
    delete proxyHeaders['accept-encoding']

    const proxyReq = http.request(
      {
        host: '127.0.0.1',
        port: 5001,
        path: targetPath,
        method: req.method,
        headers: proxyHeaders,
        timeout: isSse ? 0 : 10000,
      },
      (upstreamRes) => {
        upstreamRes.on('error', () => {
          if (!res.writableEnded) res.destroy()
        })

        const responseHeaders = {
          ...upstreamRes.headers,
          'Access-Control-Allow-Origin': '*',
        }

        if (isSse) {
          delete responseHeaders['content-length']
          delete responseHeaders['transfer-encoding']
          delete responseHeaders['content-encoding']
          responseHeaders['Content-Type'] = 'text/event-stream'
          responseHeaders['Cache-Control'] = 'no-cache, no-transform'
          responseHeaders['Connection'] = 'keep-alive'
          responseHeaders['X-Accel-Buffering'] = 'no'
          res.writeHead(upstreamRes.statusCode || 200, responseHeaders)
          if (typeof res.flushHeaders === 'function') res.flushHeaders()

          upstreamRes.pipe(res)
          console.log(`[opencode-proxy] [SSE] Connected to ${targetPath} (${Date.now() - start}ms)`)

          res.on('close', () => {
            console.log(`[opencode-proxy] [SSE] Client disconnected from ${targetPath}`)
            if (!upstreamRes.destroyed) upstreamRes.destroy()
            kill()
          })
          return
        }

        res.writeHead(upstreamRes.statusCode || 200, responseHeaders)
        upstreamRes.pipe(res)
        upstreamRes.on('end', () => {
          console.log(`[opencode-proxy] ${req.method} ${targetPath} -> ${upstreamRes.statusCode} (${Date.now() - start}ms)`)
        })
        res.on('close', () => {
          if (!upstreamRes.destroyed) upstreamRes.destroy()
          kill()
        })
      }
    )

    const kill = () => {
      if (!proxyReq.destroyed) proxyReq.destroy()
    }
    req.on('aborted', kill)
    res.on('close', kill)

    proxyReq.on('error', (err) => {
      console.error(`[opencode-proxy] ${req.method} ${targetPath}:`, err.message)
      if (!res.headersSent) {
        res.writeHead(502, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(JSON.stringify({ ok: false, error: err.message }))
      } else if (!res.writableEnded) {
        res.destroy()
      }
    })

    proxyReq.on('timeout', () => {
      console.warn(`[opencode-proxy] Timeout forwarding ${req.method} ${targetPath}`)
      proxyReq.destroy(new Error('Upstream timeout'))
    })

    req.pipe(proxyReq)
    return
  }

  if (
    reqPath === '/api/git-checkpoint' ||
    reqPath === '/api/external-file-rollback' ||
    reqPath === '/api/routing-config' ||
    reqPath === '/api/skills' ||
    reqPath === '/api/model-profiles'
  ) {
    req.url = req.url || reqPath
    void handleHostApi(req, res).then((handled) => {
      if (handled) return
      if (!res.headersSent) {
        res.writeHead(404, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(JSON.stringify({ ok: false, error: `unknown api route: ${reqPath}` }))
      }
    })
    return
  }

  // Physical attachment materializer endpoint (writes base64 data to /home/workdir/attachments & workspace)
  if (reqPath === '/api/materialize-attachment' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const { filename, mime, dataUrl } = JSON.parse(body || '{}')
        if (!dataUrl || !filename) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(JSON.stringify({ ok: false, error: 'filename and dataUrl required' }))
          return
        }
        const base64Data = dataUrl.replace(/^data:[^;]+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')
        const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_') || 'image.png'

        // 1. Write to /home/workdir/attachments/<filename> (for xAI/Grok native reading habit)
        const workdir = '/home/workdir/attachments'
        try {
          if (!fs.existsSync(workdir)) {
            fs.mkdirSync(workdir, { recursive: true })
          }
          fs.writeFileSync(path.join(workdir, safeName), buffer)
          fs.writeFileSync(path.join(workdir, 'image.png'), buffer)
        } catch (e) {
          console.warn('[serve.mjs] Could not write to /home/workdir/attachments:', e.message)
        }

        // 2. Also write to projects/APISpace/attachments/<filename>
        const projectDir = '/home/developer/projects/APISpace/attachments'
        try {
          if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true })
          }
          fs.writeFileSync(path.join(projectDir, safeName), buffer)
          fs.writeFileSync(path.join(projectDir, 'image.png'), buffer)
        } catch (e) {
          console.warn('[serve.mjs] Could not write to APISpace/attachments:', e.message)
        }

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ ok: true, savedWorkdir: path.join(workdir, safeName) }))
      } catch (err) {
        console.error('[serve.mjs] Error in materialize-attachment:', err)
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ ok: false, error: err.message }))
      }
    })
    return
  }
  if (reqPath === '/api/materialize-attachment' && req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
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

  // Endpoint to focus OpenCode5173 desktop app
  if (reqPath === '/api/focus-app') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      })
      res.end()
      return
    }

    const parsedUrl = new URL(req.url, 'http://127.0.0.1:5173')
    const sid = parsedUrl.searchParams.get('session') || ''
    rememberSession(sid)

    try {
      // focusInstalledApp is omitted here to prevent recursion
    } catch {}

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ ok: true, session: sid }))
    return
  }

  if (reqPath === '/api/active-session') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ sessionId: globalThis._activeSessionId || null, ts: globalThis._activeSessionTs || 0 }))
    return
  }

  if (reqPath === '/api/navigation-intent' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ ok: true, intent: globalThis._lastNavIntent || null }))
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

function fetchViaProxy(targetUrl, headers = {}, proxyUrl, signal) {
  return new Promise((resolve, reject) => {
    let aborted = false
    let activeSocket = null
    let activeReq = null
    let activeConnectReq = null

    const cleanup = () => {
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      aborted = true
      if (activeSocket) {
        try { activeSocket.destroy() } catch {}
      }
      if (activeReq) {
        try { activeReq.destroy() } catch {}
      }
      if (activeConnectReq) {
        try { activeConnectReq.destroy() } catch {}
      }
      reject(new Error('Request aborted'))
    }

    if (signal) {
      if (signal.aborted) return reject(new Error('Request aborted'))
      signal.addEventListener('abort', onAbort, { once: true })
    }

    try {
      const target = new URL(targetUrl)
      const proxy = new URL(proxyUrl)

      const isHttps = target.protocol === 'https:'
      const port = target.port || (isHttps ? 443 : 80)
      const proxyPort = proxy.port ? parseInt(proxy.port, 10) : (proxy.protocol === 'https:' ? 443 : 80)

      const connectReq = http.request({
        host: proxy.hostname,
        port: proxyPort,
        method: 'CONNECT',
        path: `${target.hostname}:${port}`,
      })
      activeConnectReq = connectReq

      connectReq.on('connect', (res, socket) => {
        activeSocket = socket
        if (aborted) {
          socket.destroy()
          cleanup()
          return
        }
        if (res.statusCode !== 200) {
          socket.destroy()
          cleanup()
          return reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`))
        }

        const transport = isHttps ? https : http
        const agent = isHttps ? new https.Agent({ socket }) : new http.Agent({ socket })
        const req = transport.request({
          host: target.hostname,
          port,
          path: target.pathname + target.search,
          method: 'GET',
          headers: {
            ...headers,
            host: target.hostname,
          },
          agent,
        }, (response) => {
          const chunks = []
          response.on('data', chunk => chunks.push(chunk))
          response.on('end', () => {
            cleanup()
            const buffer = Buffer.concat(chunks)
            resolve({
              status: response.statusCode,
              text: async () => buffer.toString('utf-8'),
            })
          })
        })
        activeReq = req

        req.on('error', (err) => {
          cleanup()
          reject(err)
        })
        req.end()
      })

      connectReq.on('error', (err) => {
        cleanup()
        reject(err)
      })
      connectReq.end()
    } catch (err) {
      cleanup()
      reject(err)
    }
  })
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
      if (token) {
        headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const getCandidateProxies = () => {
        const envProxies = [
          process.env.HTTPS_PROXY,
          process.env.ALL_PROXY,
          process.env.HTTP_PROXY,
        ].filter(Boolean)

        const isLinux = process.platform === 'linux'
        const defaults = isLinux
          ? ['http://127.0.0.1:3128', 'http://127.0.0.1:56995', 'http://127.0.0.1:7890']
          : ['http://127.0.0.1:56995', 'http://127.0.0.1:3128', 'http://127.0.0.1:7890']

        return [...new Set([...envProxies, ...defaults])]
      }

      const tryFetch = async () => {
        try {
          return await fetch(target, { method: 'GET', headers, signal: controller.signal })
        } catch (directErr) {
          const proxies = getCandidateProxies()
          let lastErr = directErr
          for (const proxyUrl of proxies) {
            try {
              return await fetchViaProxy(target, headers, proxyUrl, controller.signal)
            } catch (proxyErr) {
              lastErr = proxyErr
            }
          }
          throw lastErr
        }
      }

      tryFetch()
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
        const seenUrls = new Set()

        // Dynamic Active Channels: automatically map every active channel from Gateway
        const activeChannels = channels.filter(c => c.status === 1 && c.base_url && c.key)

        for (const c of activeChannels) {
          const cleanBase = c.base_url.replace(/\/+$/, '')
          if (seenUrls.has(cleanBase)) continue
          seenUrls.add(cleanBase)

          let id = `relay_${c.id}`
          if (cleanBase.includes('tokenshop.homes')) continue
          if (cleanBase.includes('xn--fiq104an1x80s.com') || cleanBase.includes('ai6666.shop')) id = 'relay_wending'
          else if (cleanBase.includes('llmfree.work')) id = 'relay_llmfree'
          else if (cleanBase.includes('gguuai.com')) id = 'relay_gguu'
          else if (cleanBase.includes('aimoniker.top')) id = 'relay_moniker'
          else {
            try {
              const u = new URL(cleanBase)
              id = `relay_${u.hostname.replace(/[^a-zA-Z0-9]/g, '_')}`
            } catch {
              id = `relay_${c.id}`
            }
          }

          let name = c.name || '中转站'
          if (c.models && !name.includes('(')) {
            const firstModel = c.models.split(',')[0].trim()
            name = `${name} (${firstModel})`
          }

          presets.push({
            id,
            name,
            baseUrl: cleanBase,
            apiKey: c.key,
            redeemUrl: `${cleanBase}/redeem`,
            currency: 'USD',
            quotaRate: 500000,
            cnyRate: 7.2,
          })
        }

        // Guaranteed Fallback presets when Gateway channels are offline or isolated across WSL
        if (presets.length === 0) {
          presets.push(
            {
              id: 'relay_llmfree',
              name: 'LLMFree-Grok (grok-4.7)',
              baseUrl: 'https://llmfree.work',
              redeemUrl: 'https://llmfree.work/redeem',
              currency: 'USD',
              quotaRate: 500000,
              cnyRate: 7.2,
            },
            {
              id: 'relay_wending',
              name: '稳定中转-Gemini',
              baseUrl: 'https://xn--fiq104an1x80s.com',
              redeemUrl: 'https://xn--fiq104an1x80s.com/redeem',
              currency: 'USD',
              quotaRate: 500000,
              cnyRate: 7.2,
            }
          )
        }

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
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

  if (reqPath === '/api' || reqPath.startsWith('/api/')) {
    res.writeHead(404, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(JSON.stringify({ ok: false, error: `unknown api route: ${reqPath}` }))
    return
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
    const isHtml = ext === '.html' || filePath.endsWith('index.html')
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      ...(isHtml ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } : {}),
    })
    res.end(content)
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenCode Companion server running on port ${PORT}`)
})
