#!/usr/bin/env python3
"""Live tuner for YT Stream Studio.

Run in a SECOND window while you stream:   python live_tune.py
Everything here applies within half a second. No restart.

  Sync tab  - audio shift, video delay, backlog
  Sound tab - level meters, game volume, mic volume, mute, noise gate, ducking
"""
import json
import os
import time
import tkinter as tk
from tkinter import ttk

ROOT = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(ROOT, "logs", "live")
PATH = os.path.join(DIR, "live_tuning.json")
LEVELS = os.path.join(DIR, "live_levels.json")
os.makedirs(DIR, exist_ok=True)

DEFAULTS = {"shift_ms": 0.0, "max_lat_ms": 250.0, "keep_lat_ms": 120.0,
            "video_shift_ms": 0.0, "mic_gain": 100.0,
            "game_gain": 100.0, "mic_mute": 0.0,
            "gate_on": 0.0, "gate_db": -45.0, "gate_hold_ms": 200.0,
            "duck_on": 0.0, "duck_db": 6.0}


def load():
    try:
        with open(PATH, "r", encoding="utf-8") as f:
            return {**DEFAULTS, **json.load(f)}
    except Exception:
        return dict(DEFAULTS)


def write(data):
    tmp = PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    # Windows refuses to replace a file the stream is reading at that instant: retry,
    # then fall back to writing in place.
    for _ in range(12):
        try:
            os.replace(tmp, PATH)
            return
        except PermissionError:
            time.sleep(0.05)
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(data, f)


root = tk.Tk()
root.title("Live tuner")
cur = load()
v = {k: tk.DoubleVar(value=cur[k]) for k in DEFAULTS}
top = tk.BooleanVar(value=False)
status = tk.StringVar(value="Ready")
state = {"mtime": None}


def save(*_):
    try:
        write({k: float(var.get()) for k, var in v.items()})
        status.set(f"Sent: audio shift {v['shift_ms'].get():+.0f} ms, video delay "
                   f"{v['video_shift_ms'].get():.0f} ms, game {v['game_gain'].get():.0f}%, "
                   f"mic {v['mic_gain'].get():.0f}%"
                   + (" (MUTED)" if v["mic_mute"].get() >= 0.5 else ""))
    except OSError as e:
        status.set(f"Couldn't write: {e}")


def slider(parent, text, key, lo, hi, step, hint=None):
    ttk.Label(parent, text=text).pack(anchor="w", pady=(8, 0))
    tk.Scale(parent, from_=lo, to=hi, orient="horizontal", resolution=step,
             variable=v[key], length=460).pack(fill="x")
    if hint:
        ttk.Label(parent, text=hint, foreground="#666").pack(anchor="w")


def check(parent, text, key):
    ttk.Checkbutton(parent, text=text, variable=v[key], onvalue=1.0, offvalue=0.0,
                    command=save).pack(anchor="w", pady=(8, 0))


nb = ttk.Notebook(root)
nb.pack(fill="both", expand=True, padx=10, pady=10)

# ------------------------------------------------------------------ Sync tab
sync = ttk.Frame(nb, padding=10)
nb.add(sync, text="Sync")
slider(sync, "VIDEO delay (ms) - use when sound comes AFTER the action", "video_shift_ms",
       0, 1500, 20)
slider(sync, "Audio shift (ms) - negative = earlier, positive = later", "shift_ms",
       -800, 800, 10)
row = ttk.Frame(sync)
row.pack(fill="x", pady=4)
for text, d in (("-100", -100), ("-20", -20), ("0", None), ("+20", 20), ("+100", 100)):
    ttk.Button(row, text=text, width=6, command=lambda d=d: (
        v["shift_ms"].set(0 if d is None else v["shift_ms"].get() + d), save())).pack(
        side="left", padx=2)
slider(sync, "Backlog cap (ms) - higher = fewer jumps, more delay", "max_lat_ms", 80, 600, 10)
slider(sync, "Cushion kept after a trim (ms)", "keep_lat_ms", 20, 400, 10)

# ------------------------------------------------------------------ Sound tab
snd = ttk.Frame(nb, padding=10)
nb.add(snd, text="Sound")

meters = ttk.LabelFrame(snd, text="Live levels (what goes to YouTube)", padding=8)
meters.pack(fill="x")
mic_txt, game_txt, gate_txt = tk.StringVar(), tk.StringVar(), tk.StringVar()
ttk.Label(meters, text="Mic").grid(row=0, column=0, sticky="w")
mic_bar = ttk.Progressbar(meters, length=300, maximum=100)
mic_bar.grid(row=0, column=1, padx=8, pady=2)
ttk.Label(meters, textvariable=mic_txt, width=12).grid(row=0, column=2, sticky="w")
ttk.Label(meters, text="Game").grid(row=1, column=0, sticky="w")
game_bar = ttk.Progressbar(meters, length=300, maximum=100)
game_bar.grid(row=1, column=1, padx=8, pady=2)
ttk.Label(meters, textvariable=game_txt, width=12).grid(row=1, column=2, sticky="w")
ttk.Label(meters, textvariable=gate_txt, foreground="#444").grid(
    row=2, column=0, columnspan=3, sticky="w", pady=(4, 0))
ttk.Label(meters, text="Aim for the game peaking around -12 to -6 dB. Voice should sit a "
                       "little above it.", foreground="#666").grid(
    row=3, column=0, columnspan=3, sticky="w")

slider(snd, "Game volume (%)", "game_gain", 0, 300, 5)
slider(snd, "Mic volume (%)", "mic_gain", 0, 300, 5)
check(snd, "Mute mic   (hotkey: Ctrl+Alt+M anywhere, including in the game)", "mic_mute")
check(snd, "Noise gate - silence the mic when you are not talking", "gate_on")
slider(snd, "Gate threshold (dB) - open when the mic is louder than this", "gate_db",
       -70, -20, 1, "Watch the Mic meter: set this between your quiet level and your talking level.")
slider(snd, "Gate hold (ms) - stay open this long after you stop talking", "gate_hold_ms",
       50, 800, 10)
check(snd, "Ducking - turn the game down while you talk", "duck_on")
slider(snd, "Ducking amount (dB lower)", "duck_db", 0, 20, 1)

# ------------------------------------------------------------------ bottom
ttk.Button(root, text="Apply", command=save).pack(pady=(0, 4))
ttk.Checkbutton(root, text="Keep on top of other windows", variable=top,
                command=lambda: root.attributes("-topmost", top.get())).pack(anchor="w", padx=10)
ttk.Label(root, textvariable=status, wraplength=480).pack(anchor="w", padx=10, pady=(2, 8))
root.bind("<ButtonRelease-1>", save)


def db_to_pct(db):
    return max(0.0, min(100.0, (db + 80.0) * 100.0 / 80.0))


def tick():
    try:
        with open(LEVELS, "r", encoding="utf-8") as f:
            d = json.load(f)
        fresh = (time.time() - float(d.get("t", 0))) < 2.0
    except Exception:
        d, fresh = None, False
    if d and fresh:
        mic_bar["value"] = db_to_pct(d["mic_db"]) if d.get("has_mic") else 0
        game_bar["value"] = db_to_pct(d["game_db"])
        mic_txt.set(f"{d['mic_db']:.0f} dB" if d.get("has_mic") else "no mic")
        game_txt.set(f"{d['game_db']:.0f} dB")
        duck_db = -20.0 * __import__("math").log10(max(float(d.get("duck", 1.0)), 1e-6))
        gate_txt.set(("MUTED   " if d.get("muted") else "")
                     + ("Gate: open" if d.get("gate_open") else "Gate: closed")
                     + (f"   Game ducked {duck_db:.0f} dB" if duck_db >= 1 else ""))
    else:
        mic_bar["value"] = game_bar["value"] = 0
        mic_txt.set("-")
        game_txt.set("-")
        gate_txt.set("Stream not running (meters wake up when you are live on My Screen)")
    # pick up a mute toggled by the hotkey
    try:
        m = os.path.getmtime(PATH)
        if m != state["mtime"]:
            state["mtime"] = m
            v["mic_mute"].set(load()["mic_mute"])
    except OSError:
        pass
    root.after(250, tick)


tick()
root.mainloop()
