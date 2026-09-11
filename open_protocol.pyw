#!/usr/bin/env python3
"""open_protocol.pyw — Handles custom URI scheme opencode5173:// and opencode://
Launches Edge in standalone PWA app mode (--app=http://127.0.0.1:5173/?session=...)
without opening normal Edge browser tabs.
"""
import sys
import re
import os
import subprocess
import urllib.request
import json

def main():
    raw_url = sys.argv[1] if len(sys.argv) > 1 else ""
    match = re.search(r'(ses_[a-zA-Z0-9_-]+)', raw_url)
    session_id = match.group(1) if match else ""

    target_url = f"http://127.0.0.1:5173/?session={session_id}" if session_id else "http://127.0.0.1:5173/"

    # 1. Best effort notify daemon to select session
    if session_id:
        try:
            req = urllib.request.Request(
                "http://127.0.0.1:5001/tui/select-session",
                data=json.dumps({"sessionID": session_id}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            urllib.request.urlopen(req, timeout=1.5)
        except Exception:
            pass

    # 2. Launch msedge in standalone PWA app mode
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    edge_exe = next((p for p in edge_paths if os.path.exists(p)), "msedge.exe")
    subprocess.Popen([edge_exe, f"--app={target_url}"])

if __name__ == "__main__":
    main()
