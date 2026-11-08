"""Lightweight functional helpers: preflight, presets, session profiles, hotkeys, health actions.

Designed to stay idle when not needed — no always-on sampling threads, no busy loops.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time

from .config import HOME, NOWIN, APP_DIR
from .util import load_json, save_json

# --------------------------------------------------------------------------- disk preflight
def free_bytes(path):
    """Free space on the volume that holds path. Returns None if unknown."""
    try:
        path = os.path.abspath(path or ".")
        if not os.path.exists(path):
            path = os.path.dirname(path) or "."
        if hasattr(shutil, "disk_usage"):
            return shutil.disk_usage(path).free
    except Exception:
        pass
    if sys.platform.startswith("win"):
        try:
            import ctypes
            free = ctypes.c_ulonglong(0)
            total = ctypes.c_ulonglong(0)
            avail = ctypes.c_ulonglong(0)
            ctypes.windll.kernel32.GetDiskFreeSpaceExW(
                ctypes.c_wchar_p(path), ctypes.byref(avail),
                ctypes.byref(total), ctypes.byref(free))
            return int(avail.value)
        except Exception:
            return None
    try:
        st = os.statvfs(path)
        return int(st.f_bavail * st.f_frsize)
    except Exception:
        return None


def check_disk_space(paths, min_gb=2.0):
    """Return (ok, message). paths: iterable of folders/files to check (unique volumes)."""
    min_bytes = int(float(min_gb) * (1024 ** 3))
    seen = set()
    worst = None
    for p in paths:
        if not p:
            continue
        try:
            root = os.path.abspath(p)
            # normalize to drive/root for dedup
            vol = os.path.splitdrive(root)[0] or root
            key = vol.lower() if sys.platform.startswith("win") else vol
            if key in seen:
                continue
            seen.add(key)
            free = free_bytes(root)
            if free is None:
                continue
            if worst is None or free < worst[0]:
                worst = (free, root)
            if free < min_bytes:
                gb = free / (1024 ** 3)
                return False, (f"Low disk space on {root}: {gb:.1f} GB free "
                               f"(need ~{min_gb:.0f} GB). Free space before going live.")
        except Exception:
            continue
    if worst:
        gb = worst[0] / (1024 ** 3)
        return True, f"Disk OK ({gb:.1f} GB free near {worst[1]})"
    return True, "Disk space could not be measured (continuing)"


# --------------------------------------------------------------------------- bitrate ladder
BITRATE_PRESETS = (
    ("720p30 · 3500k", {"height": "720", "fps": "30", "kbps": "3500"}),
    ("720p30 · 2500k", {"height": "720", "fps": "30", "kbps": "2500"}),
    ("480p30 · 1500k", {"height": "480", "fps": "30", "kbps": "1500"}),
    ("360p30 · 1000k", {"height": "360", "fps": "30", "kbps": "1000"}),
)


def apply_bitrate_preset(app, preset):
    """Apply height/fps/kbps to screen settings (takes effect on next screen start / resume)."""
    for key, attr in (("height", "sc_height"), ("fps", "sc_fps"), ("kbps", "sc_kbps")):
        if key in preset:
            getattr(app, attr).set(str(preset[key]))
    try:
        app.save_settings(app.key_var.get().strip())
    except Exception:
        pass


# --------------------------------------------------------------------------- session profiles (full session)
SESSION_PATH = os.path.join(HOME, ".yt_stream_studio_sessions.json")

SESSION_KEYS = (
    "folder", "title", "privacy", "intro", "brb", "loop", "autonext",
    "music_on", "music_dir", "music_vol", "bcast",
    "sc_method", "sc_height", "sc_fps", "sc_kbps", "sc_audio", "sc_low",
    "sc_av_ms", "sc_audio_mode", "sc_window", "sc_window2",
)


def snapshot_session(app):
    d = {}
    mapping = {
        "folder": "folder_var", "title": "title_var", "privacy": "privacy_var",
        "intro": "intro_var", "brb": "brb_var", "loop": "loop_var",
        "autonext": "autonext_var", "music_on": "music_on", "music_dir": "music_dir",
        "music_vol": "music_vol", "bcast": "bcast_var",
        "sc_method": "sc_method", "sc_height": "sc_height", "sc_fps": "sc_fps",
        "sc_kbps": "sc_kbps", "sc_audio": "sc_audio", "sc_low": "sc_low",
        "sc_av_ms": "sc_av_ms", "sc_audio_mode": "sc_audio_mode",
        "sc_window": "sc_window", "sc_window2": "sc_window2",
    }
    for key, attr in mapping.items():
        var = getattr(app, attr, None)
        if var is None:
            continue
        try:
            d[key] = var.get()
        except Exception:
            pass
    return d


def apply_session(app, data):
    mapping = {
        "folder": "folder_var", "title": "title_var", "privacy": "privacy_var",
        "intro": "intro_var", "brb": "brb_var", "loop": "loop_var",
        "autonext": "autonext_var", "music_on": "music_on", "music_dir": "music_dir",
        "music_vol": "music_vol", "bcast": "bcast_var",
        "sc_method": "sc_method", "sc_height": "sc_height", "sc_fps": "sc_fps",
        "sc_kbps": "sc_kbps", "sc_audio": "sc_audio", "sc_low": "sc_low",
        "sc_av_ms": "sc_av_ms", "sc_audio_mode": "sc_audio_mode",
        "sc_window": "sc_window", "sc_window2": "sc_window2",
    }
    for key, attr in mapping.items():
        if key not in data:
            continue
        var = getattr(app, attr, None)
        if var is None:
            continue
        try:
            var.set(data[key])
        except Exception:
            pass
    try:
        app.save_settings(app.key_var.get().strip())
    except Exception:
        pass


def save_session(name, app):
    name = (name or "").strip()
    if not name:
        return False, "Type a session name first."
    allp = load_json(SESSION_PATH)
    allp[name] = snapshot_session(app)
    save_json(SESSION_PATH, allp)
    return True, f"Session '{name}' saved."


def load_session(name, app):
    name = (name or "").strip()
    p = load_json(SESSION_PATH).get(name)
    if not p:
        return False, f"Session '{name}' not found."
    apply_session(app, p)
    return True, f"Session '{name}' loaded."


def list_sessions():
    return sorted(load_json(SESSION_PATH))


def delete_session(name):
    allp = load_json(SESSION_PATH)
    if name in allp:
        del allp[name]
        save_json(SESSION_PATH, allp)
        return True
    return False


def export_sessions(path):
    """Write all sessions to path. Returns (ok, msg)."""
    try:
        data = load_json(SESSION_PATH)
        save_json(path, data)
        return True, f"Exported {len(data)} session(s) to {path}"
    except Exception as e:
        return False, str(e)


def import_sessions(path, merge=True):
    try:
        incoming = load_json(path)
        if not isinstance(incoming, dict):
            return False, "File does not look like a sessions export."
        cur = load_json(SESSION_PATH) if merge else {}
        cur.update(incoming)
        save_json(SESSION_PATH, cur)
        return True, f"Imported {len(incoming)} session(s)."
    except Exception as e:
        return False, str(e)


def export_game_profiles(path):
    from .profiles import PROFILE_PATH
    try:
        data = load_json(PROFILE_PATH)
        save_json(path, data)
        return True, f"Exported {len(data)} game profile(s)."
    except Exception as e:
        return False, str(e)


def import_game_profiles(path, merge=True):
    from .profiles import PROFILE_PATH
    try:
        incoming = load_json(path)
        if not isinstance(incoming, dict):
            return False, "File does not look like a profiles export."
        cur = load_json(PROFILE_PATH) if merge else {}
        cur.update(incoming)
        save_json(PROFILE_PATH, cur)
        return True, f"Imported {len(incoming)} game profile(s)."
    except Exception as e:
        return False, str(e)


# --------------------------------------------------------------------------- health auto-action (state only — no thread)
class HealthActionState:
    """Track consecutive bad YouTube health reports. Caller drives it from health_watch."""

    def __init__(self, bad_needed=3):
        self.bad_needed = bad_needed
        self.streak = 0
        self.last_action = 0.0
        self.cooldown_s = 120.0  # don't spam BRB / bitrate drops

    def note(self, status):
        """Return 'brb', 'soft', or None."""
        status = (status or "").lower()
        if status in ("bad", "nodata", "revoked", "error"):
            self.streak += 1
        elif status in ("good", "ok", "outstanding", "noIssues".lower()):
            self.streak = 0
            return None
        else:
            # unknown / starting — don't count
            return None
        if self.streak < self.bad_needed:
            return None
        now = time.monotonic()
        if now - self.last_action < self.cooldown_s:
            return None
        self.last_action = now
        self.streak = 0
        return "brb"


# --------------------------------------------------------------------------- pre-live local test (10s file, not RTMP)
def run_local_capture_test(app, seconds=10, out_path=None):
    """
    Encode ~seconds of the current screen settings to a local file (no RTMP).
    Returns (ok, path_or_error). Runs in caller thread — use a worker.
    """
    s = app.screen_settings()
    from .capture import (
        SCREEN_METHODS, DEFAULT_SCREEN_METHOD, normalize_screen_method,
        build_screen_cmd, probe_wgc_backend,
    )

    if out_path is None:
        d = tempfile.mkdtemp(prefix="yt_studio_test_")
        out_path = os.path.join(d, "prelive_test.mp4")

    method = normalize_screen_method(s.get("method"))
    tiers = SCREEN_METHODS.get(method) or SCREEN_METHODS[DEFAULT_SCREEN_METHOD]
    # Prefer first tier label for a short local test
    tier = tiers[0] if isinstance(tiers, (list, tuple)) else tiers
    if isinstance(tier, (list, tuple)):
        tier = tier[0]

    # File target instead of RTMP
    target = out_path
    try:
        cmd = build_screen_cmd(s, tier, target, test_seconds=int(seconds),
                               audio_mode=s.get("audio_mode"))
        # build_screen_cmd may return list; ensure -t is present for short test
        if "-t" not in cmd:
            # insert duration near the end before output
            cmd = list(cmd)
            if cmd[-1] == target:
                cmd = cmd[:-1] + ["-t", str(int(seconds)), target]
        r = subprocess.run(cmd, capture_output=True, text=True, creationflags=NOWIN, timeout=seconds + 25)
        if r.returncode != 0 or not os.path.isfile(out_path) or os.path.getsize(out_path) < 2000:
            err = (r.stderr or r.stdout or "no output")[-400:]
            return False, err
        return True, out_path
    except Exception as e:
        return False, str(e)


# --------------------------------------------------------------------------- global hotkeys (Windows): flag-only, polled from Tk
# Avoid a dedicated GetMessage thread when possible: RegisterHotKey + PeekMessage
# every 400ms from the existing Tk after() loop keeps CPU near zero.

class GlobalHotkeys:
    """Ctrl+Shift+L Go Live, Ctrl+Shift+S Stop, Ctrl+Shift+B BRB, Ctrl+Shift+M Mute flag."""

    MOD_ALT = 0x0001
    MOD_CONTROL = 0x0002
    MOD_SHIFT = 0x0004
    MOD_NOREPEAT = 0x4000
    WM_HOTKEY = 0x0312

    def __init__(self, app):
        self.app = app
        self._ids = {}
        self._ok = False
        self._user32 = None

    def start(self):
        if not sys.platform.startswith("win"):
            return
        try:
            import ctypes
            self._user32 = ctypes.windll.user32
            mod = self.MOD_CONTROL | self.MOD_SHIFT | self.MOD_NOREPEAT
            # id -> (mods, vk, handler name)
            mapping = {
                10: (mod, 0x4C, "hotkey_go_live"),   # L
                11: (mod, 0x53, "hotkey_stop"),      # S
                12: (mod, 0x42, "hotkey_brb"),       # B
                13: (mod, 0x4D, "hotkey_mute"),      # M
            }
            for hid, (m, vk, _) in mapping.items():
                if self._user32.RegisterHotKey(None, hid, m, vk):
                    self._ids[hid] = mapping[hid]
            self._ok = bool(self._ids)
            if self._ok:
                self.app.log("Hotkeys: Ctrl+Shift+L Go Live · S Stop · B BRB · M Mute flag")
            self.app.root.after(400, self._poll)
        except Exception as e:
            try:
                self.app.log(f"Hotkeys unavailable ({e})")
            except Exception:
                pass

    def _poll(self):
        if not self._ok or not self._user32:
            return
        try:
            import ctypes
            from ctypes import wintypes

            class MSG(ctypes.Structure):
                _fields_ = [
                    ("hwnd", wintypes.HWND), ("message", wintypes.UINT),
                    ("wParam", wintypes.WPARAM), ("lParam", wintypes.LPARAM),
                    ("time", wintypes.DWORD), ("pt", wintypes.POINT),
                ]

            msg = MSG()
            # ONLY pull WM_HOTKEY. PeekMessage(NULL, 0, 0) steals Tk's own messages
            # from the thread queue and freezes the UI (especially F10 / menu keys).
            while self._user32.PeekMessageW(
                    ctypes.byref(msg), None,
                    self.WM_HOTKEY, self.WM_HOTKEY, 1):  # PM_REMOVE
                hid = int(msg.wParam)
                info = self._ids.get(hid)
                if not info:
                    continue
                name = info[2]
                fn = getattr(self.app, name, None)
                if callable(fn):
                    try:
                        # Defer into Tk so we never run UI work inside the poll
                        self.app.root.after(0, fn)
                    except Exception as e:
                        try:
                            self.app.log(f"Hotkey {name}: {e}")
                        except Exception:
                            pass
        except Exception:
            pass
        try:
            self.app.root.after(400, self._poll)
        except Exception:
            pass

    def stop(self):
        if not self._user32:
            return
        for hid in list(self._ids):
            try:
                self._user32.UnregisterHotKey(None, hid)
            except Exception:
                pass
        self._ids.clear()
        self._ok = False
