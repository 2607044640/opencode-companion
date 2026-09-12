#!/usr/bin/env python3
"""
OpenCode Web Companion Self-Healing Launcher
Ensures node serve.mjs daemon is running on 127.0.0.1:5173 before launching Edge App window.
Prevents ERR_CONNECTION_REFUSED permanently.
"""

import sys
import os
import time
import socket
import subprocess

PORT = 5173
HOST = '127.0.0.1'
COMPANION_DIR = os.path.dirname(os.path.abspath(__file__))
SERVE_SCRIPT = os.path.join(COMPANION_DIR, 'serve.mjs')

def is_server_listening(timeout=0.2):
    try:
        with socket.create_connection((HOST, PORT), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

def start_server():
    if is_server_listening():
        return True

    # 1. Ensure WSL2 daemon is alive
    try:
        subprocess.run(
            ['wsl', '-d', 'opencode-jail', '-u', 'root', 'systemctl', 'start', 'opencode-web.service'],
            creationflags=0x08000000,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3
        )
    except Exception:
        pass

    # 2. Launch Windows companion host daemon detached
    node_paths = [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ]
    node_exe = next((p for p in node_paths if os.path.exists(p)), 'node.exe')

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
    except Exception:
        pass

    # Poll until ready (max 5 seconds)
    start_time = time.time()
    while time.time() - start_time < 5.0:
        if is_server_listening():
            return True
        time.sleep(0.08)

    return False

def open_edge():
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    edge_exe = next((p for p in edge_paths if os.path.exists(p)), 'msedge.exe')

    url = f"http://{HOST}:{PORT}/"
    try:
        subprocess.Popen([edge_exe, f"--app={url}"])
    except Exception as e:
        print(f"Failed to launch Edge: {e}", file=sys.stderr)

if __name__ == '__main__':
    start_server()
    if '--daemon-only' not in sys.argv:
        open_edge()
