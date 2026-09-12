#!/usr/bin/env python3
"""
OpenCode Companion Host Self-Healing Watchdog (companion_watchdog.pyw)
Continuously ensures:
  1. Windows host Companion server (node serve.mjs) is running on 127.0.0.1:5173.
  2. WSL2 OpenCode backend daemon (opencode-web.service) is running on port 5001.
Runs silently with no console window. Completely immune to crashes or external process termination.
"""

import sys
import os
import time
import socket
import subprocess

HOST = '127.0.0.1'
PORT_FRONTEND = 5173
PORT_BACKEND = 5001
COMPANION_DIR = os.path.dirname(os.path.abspath(__file__))
SERVE_SCRIPT = os.path.join(COMPANION_DIR, 'serve.mjs')

# Single instance guard using socket
LOCK_PORT = 51739

def acquire_single_instance_lock():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind((HOST, LOCK_PORT))
        s.listen(1)
        return s
    except OSError:
        # Already running another watchdog instance
        sys.exit(0)

def is_port_listening(port, timeout=0.3):
    try:
        with socket.create_connection((HOST, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

def ensure_wsl_daemon():
    if is_port_listening(PORT_BACKEND, timeout=0.3):
        return
    try:
        subprocess.run(
            ['wsl', '-d', 'opencode-jail', '-u', 'root', 'systemctl', 'start', 'opencode-web.service'],
            creationflags=0x08000000,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5
        )
    except Exception:
        pass

def ensure_companion_server():
    if is_port_listening(PORT_FRONTEND, timeout=0.3):
        return

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
    except Exception:
        pass

def main():
    _lock = acquire_single_instance_lock()

    while True:
        try:
            ensure_wsl_daemon()
            ensure_companion_server()
        except Exception:
            pass
        time.sleep(4.0)

if __name__ == '__main__':
    main()
