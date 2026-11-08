"""Self-test benchmark against a local RTMP sink."""
import collections
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime

from ..config import NOWIN, HOME
from ..util import kill_tree
from ..capture.screen import SCREEN_METHODS, TIER_NAMES

# ---------------------------------------------------------------- benchmark helpers
BENCH_URL = "rtmp://127.0.0.1:19350/live/bench"   # the fake "YouTube" (ffmpeg listening)
BENCH_TIERS = ["wgc_qsv", "wgc_x264",
               "ddagrab_x264", "gdigrab_x264", "ddagrab_qsv", "gdigrab_qsv",
               "gpu", "gpu_native", "gpu_fixed", "gpu_x264"]
_PROGRESS_RE = re.compile(
    r"^(frame|fps|bitrate|total_size|out_time|dup_frames|drop_frames|speed|progress)=(.*)$")


def descendants(pairs, root):
    """pairs: (pid, parent_pid) tuples. Returns root plus every process below it."""
    kids = collections.defaultdict(list)
    for pid, ppid in pairs:
        kids[ppid].append(pid)
    out, todo = {root}, [root]
    while todo:
        for c in kids.get(todo.pop(), []):
            if c not in out:
                out.add(c)
                todo.append(c)
    return out


def process_tree_pids(root_pid):
    """The process and everything it started (a Chocolatey/Scoop ffmpeg is a wrapper that
    starts the real ffmpeg, and the GPU counters belong to the real one)."""
    pids = {root_pid}
    if not sys.platform.startswith("win"):
        return pids
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-CimInstance Win32_Process | ForEach-Object "
             "{ \"$($_.ProcessId),$($_.ParentProcessId)\" }"],
            capture_output=True, text=True, timeout=20, creationflags=NOWIN)
        pairs = []
        for line in (r.stdout or "").splitlines():
            a, _, b = line.strip().partition(",")
            if a.isdigit() and b.isdigit():
                pairs.append((int(a), int(b)))
        return descendants(pairs, root_pid)
    except Exception:
        return pids


def _avgmax(vals):
    return (sum(vals) / len(vals), max(vals)) if vals else (0.0, 0.0)


def parse_typeperf(text, pids):
    """Windows performance counters sampled once a second (typeperf CSV) -> how busy each
    GPU engine was (ffmpeg's own share and the whole system), plus ffmpeg and total CPU."""
    rows = [r for r in csv.reader(io.StringIO(text or "")) if r]
    hi = next((i for i, r in enumerate(rows) if len(r) > 1 and r[1].startswith("\\\\")), None)
    if hi is None:
        return None
    hdr = rows[hi]
    tags = tuple(f"pid_{p}_" for p in pids)
    gpu_cols, proc_cols, total_cols = [], [], []
    for i, name in enumerate(hdr):
        if i == 0:
            continue
        if "\\GPU Engine(" in name:
            m = re.search(r"engtype_([A-Za-z0-9]+)", name)
            if m:
                gpu_cols.append((i, m.group(1), any(t in name for t in tags)))
        elif "\\Process(ffmpeg" in name:
            proc_cols.append(i)
        elif "\\Processor(_Total)" in name:
            total_cols.append(i)
    data = [r for r in rows[hi + 1:] if len(r) == len(hdr)]
    if not data:
        return None

    def num(r, i):
        try:
            return float(r[i])
        except (ValueError, IndexError):
            return 0.0

    engines = sorted({et for _, et, _ in gpu_cols})
    eng_ff = {e: [] for e in engines}
    eng_all = {e: [] for e in engines}
    cpu_ff, cpu_tot = [], []
    for r in data:
        s_ff = dict.fromkeys(engines, 0.0)
        s_all = dict.fromkeys(engines, 0.0)
        for i, et, mine in gpu_cols:
            v = num(r, i)
            s_all[et] += v
            if mine:
                s_ff[et] += v
        for e in engines:
            eng_ff[e].append(s_ff[e])
            eng_all[e].append(s_all[e])
        cpu_ff.append(sum(num(r, i) for i in proc_cols))
        cpu_tot.append(sum(num(r, i) for i in total_cols))
    return {"samples": len(data),
            "engines_ffmpeg": {e: _avgmax(v) for e, v in eng_ff.items()},
            "engines_all": {e: _avgmax(v) for e, v in eng_all.items()},
            "ffmpeg_cpu": _avgmax(cpu_ff), "total_cpu": _avgmax(cpu_tot)}


def fmt_engines(d, min_avg=0.5):
    """'VideoProcessing 34%, Copy 3%' - only engines that were actually used.

    min_avg is deliberately low so short spikes (e.g. VideoProcessing during a
    scale) still show up. Engines that stayed under 0.5% are omitted so the
    column stays readable.
    """
    items = sorted(((e, v[0]) for e, v in (d or {}).items() if v[0] >= min_avg),
                   key=lambda x: -x[1])
    return ", ".join(f"{e} {a:.0f}%" for e, a in items) or "-"


def analyze_flv(path):
    """What the fake YouTube actually received: frame pacing, gaps, keyframes, bitrate."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "packet=stream_index,pts_time,dts_time,flags,size:"
             "stream=index,codec_type,codec_name,width,height",
             "-of", "json", path],
            capture_output=True, text=True, timeout=120, creationflags=NOWIN)
        j = json.loads(r.stdout or "{}")
    except Exception as e:
        return {"error": str(e)}
    streams = {s["index"]: s for s in j.get("streams", [])}
    vid = next((i for i, s in streams.items() if s.get("codec_type") == "video"), None)
    aud = next((i for i, s in streams.items() if s.get("codec_type") == "audio"), None)

    def stamp(p):
        for k in ("dts_time", "pts_time"):
            try:
                return float(p[k])
            except (KeyError, ValueError):
                pass
        return None

    vpk, apk = [], []
    for p in j.get("packets", []):
        t = stamp(p)
        if t is None:
            continue
        item = (t, int(p.get("size") or 0), "K" in (p.get("flags") or ""))
        if p.get("stream_index") == vid:
            vpk.append(item)
        elif p.get("stream_index") == aud:
            apk.append(item)
    out = {"video_packets": len(vpk), "audio_packets": len(apk)}
    if vid is not None:
        st = streams[vid]
        out["codec"] = st.get("codec_name")
        out["resolution"] = f"{st.get('width')}x{st.get('height')}"
    if len(vpk) < 3:
        return out
    out["monotonic"] = all(b[0] >= a[0] for a, b in zip(vpk, vpk[1:]))
    vs = sorted(vpk)
    dur = vs[-1][0] - vs[0][0]
    out["duration"] = dur
    out["avg_fps"] = (len(vs) - 1) / dur if dur > 0 else 0.0
    gaps = [b[0] - a[0] for a, b in zip(vs, vs[1:])]
    out["max_gap"] = max(gaps)
    out["late_frames"] = sum(1 for g in gaps if g > 0.1)
    keys = [t for t, _, k in vs if k]
    if len(keys) >= 2:
        iv = [b - a for a, b in zip(keys, keys[1:])]
        out["key_max"], out["key_avg"] = max(iv), sum(iv) / len(iv)
    else:
        out["key_max"] = out["key_avg"] = dur
    if dur > 0:
        out["kbps"] = sum(sz for _, sz, _ in vs) * 8 / dur / 1000.0
    t0 = vs[0][0]
    buckets = collections.defaultdict(int)
    for t, sz, _ in vs:
        buckets[int(t - t0)] += sz
    secs = sorted(buckets)[1:-1]                      # ignore the partial first/last second
    if secs:
        per = [buckets[k] * 8 / 1000.0 for k in secs]
        out["kbps_min"], out["kbps_max"] = min(per), max(per)
    if len(apk) >= 2:
        asr = sorted(apk)
        ad = asr[-1][0] - asr[0][0]
        if ad > 0:
            out["audio_kbps"] = sum(sz for _, sz, _ in asr) * 8 / ad / 1000.0
    return out


def grade_run(run, an, target_kbps, fps):
    """Rule-of-thumb checks for 'would YouTube be happy?'. These are heuristics based on
    YouTube's published advice (keyframe at least every 4 s, steady bitrate, steady frame
    rate), not YouTube's own scoring. Returns (list of (check, PASS/WARN/FAIL, detail), overall)."""
    checks = []

    def add(name, status, detail):
        checks.append((name, status, detail))

    sp = run.get("speed")
    if sp is None:
        add("Encoder keeps up", "WARN", "speed unknown")
    else:
        add("Encoder keeps up", "PASS" if sp >= 0.98 else "WARN" if sp >= 0.93 else "FAIL",
            f"speed {sp:.2f}x (needs 1.00x)")
    rr = run.get("real")
    if rr is None:
        add("Capture delivers new frames", "WARN", "unknown")
    else:
        add("Capture delivers new frames",
            "PASS" if rr >= 0.9 * fps else "WARN" if rr >= 0.7 * fps else "FAIL",
            f"{rr:.1f} of {fps} fps (whole run); worst 3s window {run.get('worst', 0):.1f}")
    if an.get("error") or "avg_fps" not in an:
        add("Recording analysed", "FAIL", an.get("error", "too few frames recorded"))
        return checks, "FAIL"
    af = an["avg_fps"]
    add("Frames reaching the ingest", "PASS" if af >= 0.95 * fps else "WARN" if af >= 0.85 * fps else "FAIL",
        f"{af:.1f} fps received (repeated frames count here; 'Capture delivers new frames' "
        "is the check that catches those)")
    mg = an["max_gap"]
    add("Smoothness (largest gap)", "PASS" if mg <= 0.15 else "WARN" if mg <= 0.5 else "FAIL",
        f"largest gap {mg * 1000:.0f} ms, {an['late_frames']} frames later than 100 ms")
    km = an["key_max"]
    add("Keyframes", "PASS" if km <= 2.2 else "WARN" if km <= 4.0 else "FAIL",
        f"longest keyframe interval {km:.1f}s (YouTube wants 4s or less, 2s is best)")
    kb = an.get("kbps", 0.0)
    kmin = an.get("kbps_min", kb)
    if kb > 1.25 * target_kbps:
        add("Bitrate", "WARN", f"{kb:.0f} kbps, above the {target_kbps} target")
    elif kb < 0.75 * target_kbps:
        add("Bitrate", "WARN", f"{kb:.0f} kbps, below the {target_kbps} target (normal for "
                               "hardware encoders on a quiet screen; YouTube may say 'low')")
    elif kmin < 0.4 * target_kbps:
        add("Bitrate", "WARN", f"{kb:.0f} kbps average but dips to {kmin:.0f} in some seconds")
    else:
        add("Bitrate", "PASS", f"{kb:.0f} kbps, lowest second {kmin:.0f}")
    ak = an.get("audio_kbps")
    # When the benchmark forces silent audio (or the device hung), audio is ~0–2 kbps.
    # That is expected and must not turn an otherwise good video path into WARN.
    if ak is None:
        add("Audio", "WARN", "no audio seen")
    elif ak < 8:
        add("Audio", "PASS", f"{ak:.0f} kbps (silent / anullsrc — expected when testing video only)")
    elif ak >= 96:
        add("Audio", "PASS", f"{ak:.0f} kbps")
    else:
        add("Audio", "WARN", f"{ak:.0f} kbps (low for live; prefer ≥ 128k AAC)")
    add("Timestamps in order", "PASS" if an.get("monotonic") else "FAIL",
        "increasing" if an.get("monotonic") else "went backwards")
    overall = ("FAIL" if any(c[1] == "FAIL" for c in checks)
               else "WARN" if any(c[1] == "WARN" for c in checks) else "PASS")
    return checks, overall


