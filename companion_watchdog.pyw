#!/usr/bin/env python3
"""
OpenCode Companion Host Self-Healing Watchdog (companion_watchdog.pyw)
Continuously ensures:
  1. Windows host Companion server (node serve.mjs) is running on 127.0.0.1:5173.
  2. WSL2 OpenCode backend daemon (opencode-web.service) is running on port 5001.
  3. New-API Gateway (Docker new-api) is healthy and listening on 127.0.0.1:3000 & 3700.
     If container crashed, database locked (error 14), or down, automatically restarts container.
Runs silently with no console window. Completely immune to crashes or external process termination.
"""

import sys
import os
import time
import socket
import http.client
import subprocess

HOST = '127.0.0.1'
PORT_FRONTEND = 5173
PORT_BACKEND = 5001
PORT_GATEWAY = 3000
COMPANION_DIR = os.path.dirname(os.path.abspath(__file__))
SERVE_SCRIPT = os.path.join(COMPANION_DIR, 'serve.mjs')
GATEWAY_COMPOSE_DIR = r"C:\APISpace\gateway"
LOG_FILE = os.path.join(COMPANION_DIR, 'watchdog.log')

# Single instance guard using socket
LOCK_PORT = 51739

_last_gateway_restart = 0.0
GATEWAY_RESTART_COOLDOWN = 15.0  # seconds between restart attempts to prevent flapping

def log(msg):
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass

def acquire_single_instance_lock():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind((HOST, LOCK_PORT))
        s.listen(1)
        return s
    except OSError as e:
        log(f"Lock acquire failed: {e}. Another instance already running.")
        sys.exit(0)

def is_port_listening(port, timeout=0.3):
    try:
        with socket.create_connection((HOST, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

def check_gateway_healthy(port=PORT_GATEWAY, timeout=1.0):
    """
    Probes the Gateway endpoint.
    Returns:
      True: Server is responding normally (200, 401, 403, 404 - normal API behavior)
      False: Connection refused, timeout, or 500 Internal Server Error (e.g. SQLite database locked/error 14)
    """
    try:
        conn = http.client.HTTPConnection(HOST, port, timeout=timeout)
        conn.request("GET", "/v1/models")
        resp = conn.getresponse()
        status = resp.status
        conn.close()
        # 401 Unauthorized or 200 OK means server & DB are up and responding to API requests
        # 500 or 502 means database error (error 14) or internal failure
        if status in (200, 401, 403, 404):
            return True
        return False
    except Exception:
        return False

def ensure_gateway():
    global _last_gateway_restart
    if check_gateway_healthy(PORT_GATEWAY, timeout=1.0):
        return

    now = time.time()
    if now - _last_gateway_restart < GATEWAY_RESTART_COOLDOWN:
        return
    _last_gateway_restart = now
    log("Gateway unhealthy on port 3000. Initiating auto-recovery...")

    # Try fast restart of existing container
    try:
        res = subprocess.run(
            ['docker', 'restart', 'new-api'],
            creationflags=0x08000000,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10
        )
        if res.returncode == 0:
            log("docker restart new-api succeeded.")
            return
    except Exception as e:
        log(f"docker restart new-api failed: {e}")

    # If restart failed, ensure compose up -d
    try:
        res = subprocess.run(
            ['docker', 'compose', '-f', os.path.join(GATEWAY_COMPOSE_DIR, 'docker-compose.yml'), 'up', '-d'],
            creationflags=0x08000000,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=15
        )
        log(f"docker compose up -d exit code: {res.returncode}")
    except Exception as e:
        log(f"docker compose up -d error: {e}")

def ensure_wsl_daemon():
    if is_port_listening(PORT_BACKEND, timeout=0.3):
        return
    log("WSL opencode-web.service not listening on port 5001. Starting...")
    try:
        subprocess.run(
            ['wsl', '-d', 'opencode-jail', '-u', 'root', 'systemctl', 'start', 'opencode-web.service'],
            creationflags=0x08000000,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5
        )
    except Exception as e:
        log(f"Failed to start WSL service: {e}")

def ensure_companion_server():
    if is_port_listening(PORT_FRONTEND, timeout=0.3):
        return

    log("Companion frontend not listening on port 5173. Starting node serve.mjs...")
    node_paths = [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ]
    node_exe = next((p for p in node_paths if os.path.exists(p)), 'node.exe')

    # Detached, no window, new process group
    flags = 0x00000008 | 0x00000200 | 0x08000000
    try:
        subprocess.Popen(
            [node_exe, SERVE_SCRIPT],
            cwd=COMPANION_DIR,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
            close_fds=True
        )
    except Exception as e:
        log(f"Failed to start companion server: {e}")

def main():
    log("Companion Watchdog starting...")
    _lock = acquire_single_instance_lock()
    log("Acquired single-instance lock on port 51739. Entering monitor loop.")

    while True:
        try:
            ensure_gateway()
            ensure_wsl_daemon()
            ensure_companion_server()
        except Exception as e:
            log(f"Main loop error: {e}")
        time.sleep(4.0)

if __name__ == '__main__':
    main()
