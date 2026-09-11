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

    # 1. Primary: Trigger WSL2 systemd service start
    try:
        subprocess.run(
            ['wsl', '-d', 'opencode-jail', '-u', 'root', 'systemctl', 'start', 'opencode-companion.service', 'opencode-web.service'],
            creationflags=0x08000000,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5
        )
    except Exception:
        pass

    # Quick check if systemd brought it up
    start_time = time.time()
    while time.time() - start_time < 2.0:
        if is_server_listening():
            return True
        time.sleep(0.1)

    # 2. Fallback: Local Windows Node process via WMI
    node_exe = r'C:\Program Files\nodejs\node.exe'
    if not os.path.exists(node_exe):
        node_exe = 'node'

    ps_cmd = f'''
$startup = [wmiclass]"Win32_ProcessStartup"
$startup.Properties['ShowWindow'].Value = 0
$p = [wmiclass]"Win32_Process"
$inParams = $p.GetMethodParameters("Create")
$inParams["CommandLine"] = '"{node_exe}" "{SERVE_SCRIPT}"'
$inParams["CurrentDirectory"] = "{COMPANION_DIR}"
$inParams["ProcessStartupInformation"] = $startup
$res = $p.InvokeMethod("Create", $inParams, $null)
'''
    try:
        subprocess.run(
            ['powershell', '-NoProfile', '-Command', ps_cmd],
            creationflags=0x08000000,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=8
        )
    except Exception:
        pass
        try:
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0
            subprocess.Popen(
                [node_exe, SERVE_SCRIPT],
                cwd=COMPANION_DIR,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                startupinfo=startupinfo,
                creationflags=0x08000000 | 0x00000200
            )
        except Exception:
            pass

    # Poll until ready (max 5 seconds)
    start_time = time.time()
    while time.time() - start_time < 5.0:
        if is_server_listening():
            return True
        time.sleep(0.1)

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
