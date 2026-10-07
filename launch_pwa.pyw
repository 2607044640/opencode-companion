import sys
import os
import ctypes
from ctypes import wintypes
import time

# Lock file to debounce invocations within 2 seconds
LOCK_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".launch_throttle.lock")

def should_throttle():
    try:
        now = time.time()
        if os.path.exists(LOCK_FILE):
            mtime = os.path.getmtime(LOCK_FILE)
            if now - mtime < 1.0:
                return True
        with open(LOCK_FILE, "w") as f:
            f.write(str(now))
    except Exception:
        pass
    return False

class STARTUPINFO(ctypes.Structure):
    _fields_ = [
        ('cb', wintypes.DWORD),
        ('lpReserved', wintypes.LPWSTR),
        ('lpDesktop', wintypes.LPWSTR),
        ('lpTitle', wintypes.LPWSTR),
        ('dwX', wintypes.DWORD),
        ('dwY', wintypes.DWORD),
        ('dwXSize', wintypes.DWORD),
        ('dwYSize', wintypes.DWORD),
        ('dwXCountChars', wintypes.DWORD),
        ('dwYCountChars', wintypes.DWORD),
        ('dwFillAttribute', wintypes.DWORD),
        ('dwFlags', wintypes.DWORD),
        ('wShowWindow', wintypes.WORD),
        ('cbReserved2', wintypes.WORD),
        ('lpReserved2', ctypes.c_char_p),
        ('hStdInput', wintypes.HANDLE),
        ('hStdOutput', wintypes.HANDLE),
        ('hStdError', wintypes.HANDLE),
    ]

class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ('hProcess', wintypes.HANDLE),
        ('hThread', wintypes.HANDLE),
        ('dwProcessId', wintypes.DWORD),
        ('dwThreadId', wintypes.DWORD),
    ]

PWA_APP_ID = "gdgheecefcmlccfepljfcjakkdblfgmm"
HELPER_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\pwahelper.exe",
    r"C:\Program Files\Microsoft\Edge\Application\pwahelper.exe",
]

def focus_window_by_title():
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    hDesk = user32.OpenDesktopW('default', 0, False, 0x01FF)
    if hDesk:
        user32.SetThreadDesktop(hDesk)

    target_hwnd = None
    def cb(hwnd, lparam):
        nonlocal target_hwnd
        length = user32.GetWindowTextLengthW(hwnd)
        if length:
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buff, length + 1)
            title = buff.value
            if "OpenCode Companion" in title or "OpenCode5173" in title:
                if "Microsoft Edge" in title:
                    return True
                target_hwnd = hwnd
                return False
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(WNDENUMPROC(cb), 0)

    if target_hwnd:
        fore_hwnd = user32.GetForegroundWindow()
        fore_tid = user32.GetWindowThreadProcessId(fore_hwnd, None)
        cur_tid = kernel32.GetCurrentThreadId()
        target_tid = user32.GetWindowThreadProcessId(target_hwnd, None)

        user32.AttachThreadInput(cur_tid, target_tid, True)
        if fore_tid and fore_tid != target_tid:
            user32.AttachThreadInput(fore_tid, target_tid, True)

        VK_MENU = 0x12
        user32.keybd_event(VK_MENU, 0, 0, 0)
        user32.keybd_event(VK_MENU, 0, 2, 0)

        user32.ShowWindow(target_hwnd, 3)  # SW_MAXIMIZE
        user32.SetForegroundWindow(target_hwnd)
        user32.SwitchToThisWindow(target_hwnd, True)

        user32.AttachThreadInput(cur_tid, target_tid, False)
        if fore_tid and fore_tid != target_tid:
            user32.AttachThreadInput(fore_tid, target_tid, False)
        return True
    return False

def launch(session_id=""):
    # 1. Try focusing existing window directly on default desktop (never throttle existing window focus)
    focused = focus_window_by_title()
    if focused:
        return True

    # 2. Only throttle cold-spawning new pwahelper processes
    if should_throttle():
        return True

    # 2. If window does not exist yet, spawn pwahelper targeting WinSta0\default desktop
    pwa_helper = next((p for p in HELPER_PATHS if os.path.exists(p)), None)
    if pwa_helper:
        target_url = f"http://127.0.0.1:5173/?session={session_id}" if session_id else "http://127.0.0.1:5173/"
        cmd = (
            f'"{pwa_helper}" '
            f'--app-id={PWA_APP_ID} '
            f'--ip-edge-aumid=Microsoft.MicrosoftEdge.Stable_8wekyb3d8bbwe!MSEDGE '
            f'--ip-override-url="{target_url}" '
            f'--profile-directory="Default" '
            f'--app-launch-source=4 '
            f'--start-maximized'
        )

        si = STARTUPINFO()
        si.cb = ctypes.sizeof(si)
        si.lpDesktop = "WinSta0\\default"
        si.dwFlags = 0x00000001  # STARTF_USESHOWWINDOW
        si.wShowWindow = 3  # SW_MAXIMIZE
        pi = PROCESS_INFORMATION()

        ret = ctypes.windll.kernel32.CreateProcessW(
            None,
            cmd,
            None,
            None,
            False,
            0,
            None,
            None,
            ctypes.byref(si),
            ctypes.byref(pi),
        )
        if ret:
            ctypes.windll.kernel32.CloseHandle(pi.hProcess)
            ctypes.windll.kernel32.CloseHandle(pi.hThread)

    time.sleep(0.4)
    focus_window_by_title()
    return True

if __name__ == "__main__":
    sid = sys.argv[1] if len(sys.argv) > 1 else ""
    launch(sid)
    sys.exit(0)
