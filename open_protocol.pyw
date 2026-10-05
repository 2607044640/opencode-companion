#!/usr/bin/env python3
"""
open_protocol.pyw — High-performance silent protocol handler for opencode5173://
Brings the existing OpenCode5173 PWA window directly to the foreground
without opening any Edge browser tabs or console windows.
"""

import sys
import os
import re
import time
import socket
import subprocess
import urllib.request
import json

PORT = 5173
HOST = '127.0.0.1'
COMPANION_DIR = os.path.dirname(os.path.abspath(__file__))
SERVE_SCRIPT = os.path.join(COMPANION_DIR, 'serve.mjs')
PWA_APP_ID = 'gdgheecefcmlccfepljfcjakkdblfgmm'


def is_server_listening(timeout=0.15):
    try:
        with socket.create_connection((HOST, PORT), timeout=timeout):
            return True
    except Exception:
        return False


def ensure_server_running():
    if is_server_listening():
        return True

    node_paths = [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ]
    node_exe = next((p for p in node_paths if os.path.exists(p)), 'node.exe')
    flags = 0x00000008 | 0x00000200 | 0x08000000  # DETACHED | NEW_PROCESS_GROUP | NO_WINDOW
    try:
        subprocess.Popen(
            [node_exe, SERVE_SCRIPT],
            cwd=COMPANION_DIR,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
            close_fds=True,
        )
    except Exception:
        pass

    for _ in range(20):
        time.sleep(0.1)
        if is_server_listening():
            return True
    return False


def main():
    raw_url = sys.argv[1] if len(sys.argv) > 1 else ""
    match = re.search(r'(ses_[a-zA-Z0-9_-]+)', raw_url)
    session_id = match.group(1) if match else ""

    # 1. Ensure companion server is running
    ensure_server_running()

    # 2. Notify backend to switch session
    if session_id:
        try:
            req_url = f"http://{HOST}:{PORT}/api/focus-app?session={session_id}"
            req = urllib.request.Request(req_url, method='GET')
            urllib.request.urlopen(req, timeout=1.0)
        except Exception:
            pass

    # 3. Launch/Activate Edge PWA standalone window on WinSta0\default
    try:
        sys.path.insert(0, COMPANION_DIR)
        from launch_pwa import launch as launch_pwa_window
        launch_pwa_window(session_id)
    except Exception:
        pass


if __name__ == "__main__":
    main()
