"""Per-game profiles: window, quality, mic/audio choices and your live sync tuning,
saved under a name and loaded with one click."""
import json
import os
import time
import tkinter as tk
from tkinter import messagebox, ttk

from .capture import SCREEN_METHODS, WGC_MONITOR, list_capturable_windows
from .capture.wgc import live_tuning_path
from .config import HOME
from .util import load_json

PROFILE_PATH = os.path.join(HOME, ".yt_stream_studio_profiles.json")

# profile key -> name of the App attribute (a tk variable) it controls
VARS = {
    "window": "sc_window", "window2": "sc_window2", "method": "sc_method",
    "height": "sc_height", "fps": "sc_fps", "kbps": "sc_kbps", "av_ms": "sc_av_ms",
    "audio_mode": "sc_audio_mode", "mic": "sc_audio", "low": "sc_low",
}


def _write_json(path, data):
    """Write JSON; Windows refuses to replace a file another program has open, so retry."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    for _ in range(12):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(0.05)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)


def _snapshot(app):
    d = {}
    for key, attr in VARS.items():
        var = getattr(app, attr, None)
        if var is not None:
            d[key] = var.get()
    try:
        with open(live_tuning_path(), "r", encoding="utf-8") as f:
            d["tuning"] = json.load(f)
    except Exception:
        pass
    return d


def _apply(app, p):
    for key, attr in VARS.items():
        var = getattr(app, attr, None)
        if var is None or key not in p:
            continue
        val = p[key]
        if key == "method" and val not in SCREEN_METHODS:
            continue
        try:
            var.set(val)
        except Exception:
            pass
    tuning = p.get("tuning")
    if isinstance(tuning, dict):
        try:
            _write_json(live_tuning_path(), tuning)   # a running stream picks this up live
        except OSError as e:
            app.log(f"Profile: couldn't write the live tuning ({e})")
    try:
        app._init_audio_device_ui()                  # refresh the mic box if its window is open
    except Exception:
        pass
    try:
        app.save_settings(app.key_var.get())         # the audio feeder reads the saved settings
    except Exception:
        pass


def build_profile_bar(app, parent):
    row = ttk.Frame(parent)
    row.pack(fill="x", padx=6, pady=3)
    name = tk.StringVar()
    ttk.Label(row, text="Game profile").pack(side="left")
    combo = ttk.Combobox(row, textvariable=name, width=26, values=sorted(load_json(PROFILE_PATH)))
    combo.pack(side="left", padx=6)

    def refresh(select=None):
        combo["values"] = sorted(load_json(PROFILE_PATH))
        if select is not None:
            name.set(select)

    def save():
        n = name.get().strip()
        if not n:
            app.log("Profile: type a name first (for example: GTA V), then press Save.")
            return
        profs = load_json(PROFILE_PATH)
        profs[n] = _snapshot(app)
        try:
            _write_json(PROFILE_PATH, profs)
        except OSError as e:
            app.log(f"Profile: couldn't save ({e})")
            return
        refresh(n)
        app.log(f"Profile '{n}' saved (window, quality, audio/mic and live sync tuning).")

    def load(n=None):
        n = (n or name.get()).strip()
        p = load_json(PROFILE_PATH).get(n)
        if not p:
            app.log(f"Profile: '{n}' not found.")
            return
        _apply(app, p)
        name.set(n)
        app.log(f"Profile '{n}' loaded: window '{p.get('window', '?')}', "
                f"{p.get('height', '?')}p {p.get('fps', '?')}fps {p.get('kbps', '?')}kbps."
                + ("  Applies to the next stream start; sync tuning applied now."
                   if app.live else ""))

    def delete():
        n = name.get().strip()
        profs = load_json(PROFILE_PATH)
        if n in profs and messagebox.askyesno("Delete profile", f"Delete profile '{n}'?"):
            del profs[n]
            try:
                _write_json(PROFILE_PATH, profs)
            except OSError as e:
                app.log(f"Profile: couldn't delete ({e})")
                return
            refresh("")
            app.log(f"Profile '{n}' deleted.")

    def match():
        profs = load_json(PROFILE_PATH)
        try:
            titles = [t.lower() for t, _h in list_capturable_windows(200)]
        except Exception:
            titles = []
        for n, p in profs.items():
            w = (p.get("window") or "").strip().lower()
            if w and w != WGC_MONITOR.lower() and any(w in t or t in w for t in titles):
                load(n)
                return
        app.log("Profile: none of your saved profiles match a window that is open right now.")

    for text, cmd in (("Save", save), ("Load", load), ("Delete", delete),
                      ("Match open game", match)):
        ttk.Button(row, text=text, command=cmd).pack(side="left", padx=(0, 6))
    combo.bind("<<ComboboxSelected>>", lambda e: load())
    return row
