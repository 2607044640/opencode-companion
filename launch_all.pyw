"""
launch_all.pyw — Start OpenCode Companion stack silently (no console window).
Starts:
  1. Vite dev server (npm run dev) on :5173
  2. session_launcher.py shim on :7173
Run this at login via Task Scheduler or Startup folder.
"""

import os
import subprocess
import sys
import time

BASE = os.path.dirname(os.path.abspath(__file__))
PYTHON = sys.executable

procs = []

# 1. Vite dev server (only if not already running)
import urllib.request
def port_alive(port):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2)
        return True
    except Exception:
        return False

if not port_alive(5173):
    npm = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=BASE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        shell=True,
    )
    procs.append(npm)
    time.sleep(3)  # Give vite a moment

# 2. session_launcher shim on :7173
if not port_alive(7173):
    shim = subprocess.Popen(
        [PYTHON, os.path.join(BASE, "session_launcher.py")],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    procs.append(shim)

# Stay alive (pyw — no console) so children don't orphan on some Windows configs
if procs:
    for p in procs:
        try:
            p.wait()
        except Exception:
            pass
