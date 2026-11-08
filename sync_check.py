#!/usr/bin/env python3
"""YT Stream Studio - A/V sync checker.

Measures how far the SOUND is from the PICTURE in a recording or in your live YouTube
stream, then (optionally) writes the correction into logs/live/live_tuning.json, which the
running stream picks up within a second.

How it measures: it pulls the video, makes one signal from "how much the picture is
changing" and one from "how loud the sound is", and finds the time shift where the two
line up best (cross-correlation). Needs real action with sound (a game, not an idle screen).

Run:  python sync_check.py
Sources:
  * a local .mp4 (default = newest "Test capture" in logs/screen_test)
  * a YouTube watch URL of your live stream (needs:  pip install yt-dlp)
"""
import glob
import json
import os
import subprocess
import sys
import threading
import time
import tkinter as tk
from tkinter import filedialog, ttk

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
TUNE = os.path.join(ROOT, "logs", "live", "live_tuning.json")
NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)
RATE = 50          # analysis grid: 50 Hz = 20 ms steps
SECONDS = 30
DEFAULTS = {"shift_ms": 0.0, "video_shift_ms": 0.0, "max_lat_ms": 250.0, "keep_lat_ms": 120.0}


def run(cmd, timeout=180):
    return subprocess.run(cmd, capture_output=True, creationflags=NOWIN, timeout=timeout)


def start_times(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,start_time",
             "-of", "json", path], timeout=60)
    v = a = 0.0
    for s in json.loads(r.stdout or b"{}").get("streams", []):
        try:
            t = float(s.get("start_time") or 0)
        except ValueError:
            t = 0.0
        if s.get("codec_type") == "video":
            v = t
        elif s.get("codec_type") == "audio":
            a = t
    return v, a


def signals(path):
    W, H = 96, 54
    raw = run(["ffmpeg", "-v", "error", "-i", path, "-t", str(SECONDS), "-an", "-vf",
               f"fps={RATE},scale={W}:{H},format=gray", "-f", "rawvideo", "-"]).stdout
    n = len(raw) // (W * H)
    if n < RATE * 4:
        raise ValueError("Video is too short (need at least ~4 seconds).")
    fr = np.frombuffer(raw[:n * W * H], dtype=np.uint8).reshape(n, W * H).astype(np.float32)
    motion = np.concatenate([[0.0], np.abs(np.diff(fr, axis=0)).mean(axis=1)])
    pcm = run(["ffmpeg", "-v", "error", "-i", path, "-t", str(SECONDS), "-vn", "-ac", "1",
               "-ar", "8000", "-f", "s16le", "-"]).stdout
    x = np.frombuffer(pcm[:len(pcm) // 2 * 2], dtype=np.int16).astype(np.float32) / 32768.0
    blk = 8000 // RATE
    m = len(x) // blk
    if m < RATE * 4:
        raise ValueError("No usable audio in this file.")
    env = np.abs(x[:m * blk]).reshape(m, blk).mean(axis=1)
    return motion, env


def onset(sig, win=5):
    s = np.convolve(sig, np.ones(win) / win, mode="same")
    d = np.maximum(0.0, np.diff(s, prepend=s[0]))
    d = d - d.mean()
    sd = d.std()
    return d / sd if sd > 1e-9 else d * 0.0


def estimate(path, max_lag_s=1.5):
    motion, env = signals(path)
    vstart, astart = start_times(path)
    n = min(len(motion), len(env))
    v, a = onset(motion[:n]), onset(env[:n])
    L = int(max_lag_s * RATE)
    lags = np.arange(-L, L + 1)
    c = np.array([(v[max(0, -l):n - max(0, l)] * a[max(0, l):n - max(0, -l)]).mean()
                  for l in lags])
    best = int(lags[int(np.argmax(c))])
    z = float((c.max() - c.mean()) / (c.std() + 1e-9))
    lag_ms = best * 1000.0 / RATE + (astart - vstart) * 1000.0
    return lag_ms, z


def newest_test():
    files = glob.glob(os.path.join(ROOT, "logs", "screen_test", "*.mp4"))
    return max(files, key=os.path.getmtime) if files else ""


def fetch_stream(url, say):
    """Grab ~35 s of your live YouTube stream into a temp file."""
    say("Asking yt-dlp for the stream address...")
    r = None
    for cmd in ([sys.executable, "-m", "yt_dlp", "-g", url], ["yt-dlp", "-g", url]):
        try:
            r = run(cmd, timeout=90)
            if r.returncode == 0 and r.stdout.strip():
                break
        except Exception:
            r = None
    if not r or not r.stdout.strip():
        raise RuntimeError("yt-dlp isn't installed or couldn't read that URL. "
                           "Install it with:  pip install yt-dlp")
    urls = r.stdout.decode().split()[:2]
    out = os.path.join(os.path.dirname(TUNE), "yt_sample.mkv")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cmd = ["ffmpeg", "-v", "error", "-y"]
    for u in urls:
        cmd += ["-i", u]
    cmd += ["-t", str(SECONDS + 5), "-c", "copy", out]
    say(f"Recording {SECONDS + 5}s of your live stream (play the game now)...")
    run(cmd, timeout=SECONDS + 120)
    if not os.path.exists(out) or os.path.getsize(out) < 100_000:
        raise RuntimeError("Couldn't record the stream (is it live and public/unlisted?).")
    return out


def load_tune():
    try:
        with open(TUNE, "r", encoding="utf-8") as f:
            return {**DEFAULTS, **json.load(f)}
    except Exception:
        return dict(DEFAULTS)


def save_tune(data):
    os.makedirs(os.path.dirname(TUNE), exist_ok=True)
    tmp = TUNE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    for _ in range(12):
        try:
            os.replace(tmp, TUNE)
            return
        except PermissionError:
            time.sleep(0.05)
    with open(TUNE, "w", encoding="utf-8") as f:
        json.dump(data, f)


def corrected(cur, lag_ms):
    """lag_ms > 0: sound is AFTER the picture -> delay the video.
    lag_ms < 0: sound is BEFORE the picture -> delay the audio."""
    net = float(cur["video_shift_ms"]) - max(0.0, float(cur["shift_ms"])) + lag_ms
    new = dict(cur)
    new["video_shift_ms"] = round(min(1500.0, max(0.0, net)), 0)
    new["shift_ms"] = round(min(1500.0, max(0.0, -net)), 0)
    return new


root = tk.Tk()
root.title("A/V sync checker")
src = tk.StringVar(value=newest_test())
res = tk.StringVar(value="Pick a source and press Analyze.")
status = tk.StringVar(value="")
last = {"lag": None}

f = ttk.Frame(root, padding=12)
f.pack(fill="both", expand=True)
ttk.Label(f, text="Source: a .mp4 file, or your YouTube live URL").pack(anchor="w")
ttk.Entry(f, textvariable=src, width=70).pack(fill="x")
row = ttk.Frame(f)
row.pack(fill="x", pady=4)
ttk.Button(row, text="Browse...", command=lambda: src.set(
    filedialog.askopenfilename(filetypes=[("Video", "*.mp4 *.mkv *.flv")]) or src.get())).pack(
    side="left")
ttk.Button(row, text="Newest test recording", command=lambda: src.set(newest_test())).pack(
    side="left", padx=6)
btn = ttk.Button(row, text="Analyze")
btn.pack(side="left", padx=6)
apply_btn = ttk.Button(row, text="Apply correction to live stream", state="disabled")
apply_btn.pack(side="left")
ttk.Label(f, textvariable=res, wraplength=560, font=("Segoe UI", 11, "bold")).pack(
    anchor="w", pady=8)
ttk.Label(f, textvariable=status, wraplength=560).pack(anchor="w")


def say(m):
    root.after(0, lambda: status.set(m))


def analyze():
    s = src.get().strip().strip('"')
    if not s:
        res.set("Give me a file or a YouTube URL first.")
        return
    btn.configure(state="disabled")
    apply_btn.configure(state="disabled")

    def work():
        try:
            path = fetch_stream(s, say) if s.lower().startswith("http") else s
            say("Analyzing...")
            lag, z = estimate(path)
            last["lag"] = lag
            if z < 3:
                msg = (f"Not reliable (confidence {z:.1f}). Not enough action+sound in the "
                       "clip. Record while something loud and moving is happening.")
            else:
                who = ("sound comes AFTER the picture" if lag > 20 else
                       "sound comes BEFORE the picture" if lag < -20 else "in sync")
                msg = f"{who}: {abs(lag):.0f} ms  (confidence {z:.1f}, good above 5)"
            root.after(0, lambda: (res.set(msg), status.set(""),
                                   apply_btn.configure(state="normal" if z >= 3 else "disabled")))
        except Exception as e:
            fail = f"Failed: {type(e).__name__}: {e}"   # copy now; 'e' is deleted after this block
            root.after(0, lambda: (res.set(fail), status.set("")))
        finally:
            root.after(0, lambda: btn.configure(state="normal"))

    threading.Thread(target=work, daemon=True).start()


def apply():
    if last["lag"] is None:
        return
    cur = load_tune()
    new = corrected(cur, last["lag"])
    try:
        save_tune(new)
        status.set(f"Sent to the stream: video delay {new['video_shift_ms']:.0f} ms, "
                   f"audio delay {new['shift_ms']:.0f} ms. Run Analyze again on the live "
                   "URL to check the result.")
    except OSError as e:
        status.set(f"Couldn't write the tuning file: {e}")


btn.configure(command=analyze)
apply_btn.configure(command=apply)
root.mainloop()
