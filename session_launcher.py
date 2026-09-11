"""
session_launcher.py — Local HTTP redirect shim for OpenCode Companion PWA
Listens on http://127.0.0.1:7173/
  GET /open?session=<session_id>  → launches msedge.exe --app=http://127.0.0.1:5173/?session=<id>
  GET /open                       → launches PWA root (no session)
  GET /health                     → {"ok": true}

Usage (run as background service):
  pythonw session_launcher.py
  OR: python session_launcher.py
"""

import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional
from urllib.parse import urlparse, parse_qs

LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 7173
COMPANION_BASE = "http://127.0.0.1:5173/"

EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def find_edge():
    for p in EDGE_PATHS:
        if os.path.exists(p):
            return p
    return None


def launch_pwa(session_id: Optional[str] = None):
    url = COMPANION_BASE
    if session_id:
        url = f"{COMPANION_BASE}?session={session_id}"
    edge = find_edge()
    if edge:
        subprocess.Popen([edge, f"--app={url}"])
    else:
        # Fallback: open in default browser
        import webbrowser
        webbrowser.open(url)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # silence default access log
        pass

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == "/health":
            self._json(200, b'{"ok":true}')
            return

        if parsed.path == "/open":
            session_id = (qs.get("session") or [None])[0]
            launch_pwa(session_id)
            # Respond with a small HTML auto-close page
            body = b"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Opening OpenCode 5173...</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#8b949e;}p{font-size:1.2rem;}</style>
</head><body><p>&#127680; Opening OpenCode Companion&hellip;</p>
<script>setTimeout(()=>window.close(),1500);</script>
</body></html>"""
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self._json(404, b'{"error":"not found"}')

    def _json(self, code, body: bytes):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = HTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
    print(f"session_launcher listening on http://{LISTEN_HOST}:{LISTEN_PORT}/", flush=True)
    print("  Click: http://127.0.0.1:7173/open?session=<id>  to launch PWA", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopped.")


if __name__ == "__main__":
    main()
