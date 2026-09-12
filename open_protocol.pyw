#!/usr/bin/env python3
"""open_protocol.pyw — Handles custom URI scheme opencode5173:// and opencode://
Launches Edge in standalone PWA app mode (--app=http://127.0.0.1:5173/?session=...)
without opening normal Edge browser tabs.
"""
import sys
import re
import os
import time
import socket
import subprocess
import urllib.request
import json

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

def ensure_server_running():
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

    # Poll until ready (max 4s)
    start_time = time.time()
    while time.time() - start_time < 4.0:
        if is_server_listening():
            return True
        time.sleep(0.08)

    return False

def main():
    raw_url = sys.argv[1] if len(sys.argv) > 1 else ""
    match = re.search(r'(ses_[a-zA-Z0-9_-]+)', raw_url)
    session_id = match.group(1) if match else ""

    target_url = f"http://127.0.0.1:5173/?session={session_id}" if session_id else "http://127.0.0.1:5173/"

    # 1. ALWAYS ensure companion server is running before opening browser!
    ensure_server_running()

    # 2. Best effort notify daemon to select session
    if session_id:
        try:
            req = urllib.request.Request(
                "http://127.0.0.1:5001/tui/select-session",
                data=json.dumps({"sessionID": session_id}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            urllib.request.urlopen(req, timeout=1.0)
        except Exception:
            pass

    # 3. Launch msedge in standalone PWA app mode
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    edge_exe = next((p for p in edge_paths if os.path.exists(p)), "msedge.exe")
    subprocess.Popen([edge_exe, f"--app={target_url}"])

if __name__ == "__main__":
    main()
