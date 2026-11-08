"""Shared helpers: process control, time, probe, playlist items, JSON."""
import copy
import json
import os
import subprocess
import sys
import time
import uuid

from .config import NOWIN, DEFAULT_FX, DEFAULT_AUDIO, FILLER_SECONDS

def capture_rate(prev, cur):
    """Real frames per second the screen grabber delivered between two progress snapshots:
    frames written minus the ones ffmpeg had to repeat (dup), plus the ones it skipped
    (drop). Returns None until two usable snapshots exist."""
    try:
        dt = cur["wall_time"] - prev["wall_time"]
        out = int(cur["frame"]) - int(prev["frame"])
        dup = int(cur.get("dup_frames", 0)) - int(prev.get("dup_frames", 0))
        drop = int(cur.get("drop_frames", 0)) - int(prev.get("drop_frames", 0))
        if dt <= 0:
            return None
        return max(0.0, (out - dup + drop) / dt)
    except (KeyError, ValueError, TypeError):
        return None


def kill_tree(proc):
    """Stop a process AND everything it started. On Windows, terminate()/kill() only end the
    process itself: if ffmpeg is launched through a wrapper (a shim exe from Scoop,
    Chocolatey, etc.) the real ffmpeg is left running, still streaming, with nothing
    tracking it. taskkill /T ends the whole tree. Returns True if it was running."""
    if proc is None:
        return False
    try:
        from . import proc_registry
        proc_registry.unregister(proc)
    except Exception:
        pass
    try:
        was_running = proc.poll() is None
    except Exception:
        was_running = False
    # Stop WGC frame pump first so stdin is not half-written (green/corrupt last frame).
    try:
        ev = getattr(proc, "_wgc_stop", None)
        if ev is not None:
            ev.set()
            time.sleep(0.15)
    except Exception:
        pass
    if was_running and getattr(proc, "_q_ok", False):
        # ffmpeg quits cleanly when it reads 'q' on stdin. Force-killing mid-GOP leaves
        # YouTube on a green/corrupt last frame; give it a few seconds to flush a keyframe.
        try:
            if proc.stdin and not proc.stdin.closed:
                proc.stdin.write(b"q")
                proc.stdin.flush()
            proc.wait(timeout=4.0)
            return True
        except Exception:
            pass
    if was_running and sys.platform.startswith("win"):
        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           capture_output=True, creationflags=NOWIN, timeout=6)
        except Exception:
            pass
    try:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=2.0)
    except Exception:
        pass
    return was_running

def fmt_time(sec):
    sec = round(max(0.0, float(sec)), 1)
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = sec % 60
    return f"{h}:{m:02d}:{s:04.1f}" if h else f"{m}:{s:04.1f}"


def parse_time(text):
    parts = text.strip().split(":")
    if not 1 <= len(parts) <= 3:
        raise ValueError("bad time")
    total = 0.0
    for p in parts:
        total = total * 60 + float(p)
    return total


def even(n):
    n = int(round(n))
    return n - n % 2


def probe(path):
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels"
        ":stream_tags=language,title:format=duration",
        "-of", "json", path,
    ], creationflags=NOWIN)
    data = json.loads(out)
    streams, v, a = [], None, None
    for s in data.get("streams", []):
        ctype = s.get("codec_type")
        tags = s.get("tags", {}) or {}
        label = " ".join(x for x in (tags.get("language", ""), tags.get("title", "")) if x)
        if ctype == "video":
            num, den = s["r_frame_rate"].split("/")
            fps = float(num) / float(den) if float(den) else 0.0
            detail = f"{s.get('width')}x{s.get('height')} @ {fps:.0f}fps"
            if v is None:
                v = s
        elif ctype == "audio":
            detail = f"{s.get('sample_rate', '?')} Hz, {s.get('channels', '?')} ch"
            if a is None:
                a = s
        else:
            detail = ""
        streams.append({"index": s.get("index"), "type": ctype, "codec": s.get("codec_name", ""),
                        "detail": (detail + (f"  [{label}]" if label else "")).strip()})
    if v is None:
        raise ValueError("no video stream")
    num, den = v["r_frame_rate"].split("/")
    fps = float(num) / float(den) if float(den) else 30.0
    return {
        "w": int(v["width"]), "h": int(v["height"]), "fps": round(fps) or 30,
        "vcodec": v.get("codec_name"),
        "acodec": a.get("codec_name") if a else None,
        "arate": int(a.get("sample_rate", 0)) if a else 0,
        "ach": int(a.get("channels", 0)) if a else 0,
        "n_audio": sum(1 for s in streams if s["type"] == "audio"),
        "streams": streams,
        "dur": float(data["format"]["duration"]),
    }


def new_item(path, name, info):
    return {"path": path, "name": name, "info": info, "start": 0.0, "end": info["dur"],
            "fx": copy.deepcopy(DEFAULT_FX), "audio": copy.deepcopy(DEFAULT_AUDIO),
            "ready": False, "play": None, "cut": False, "play_dur": 0.0}


def fx_summary(it):
    fx, au, parts = it["fx"], it["audio"], []
    if fx["speed"] != 1:
        parts.append(f"{fx['speed']:g}x")
    if fx["volume"] != 100:
        parts.append(f"vol {fx['volume']:g}%")
    if fx["fade_in"] or fx["fade_out"]:
        parts.append("fade")
    if fx["rotate"] or fx["flip_h"] or fx["flip_v"]:
        parts.append("rot/flip")
    if (fx["brightness"], fx["contrast"], fx["saturation"]) != (0, 100, 100):
        parts.append("color")
    if fx["text"]:
        parts.append("text")
    if au["mode"] != "original":
        parts.append({"mute": "muted", "replace": "new audio", "mix": "mixed audio"}[au["mode"]])
    elif au["track"] != "first":
        parts.append("audio trk")
    return ", ".join(parts)


def needs_render(it, ref):
    """True when the clip can't be streamed as-is (edits, or format differs from the stream)."""
    info = it["info"]
    if it["fx"] != DEFAULT_FX or it["audio"] != DEFAULT_AUDIO:
        return True
    return not (
        info["vcodec"] == "h264" and info["w"] == ref["w"] and info["h"] == ref["h"]
        and info["fps"] == ref["fps"] and info["acodec"] == "aac"
        and info["arate"] == 48000 and info["ach"] == 2
    )


def font_opt():
    font = r"C:\Windows\Fonts\arialbd.ttf"
    return "fontfile='C\\:/Windows/Fonts/arialbd.ttf':" if os.path.exists(font) else ""


def atempo_chain(speed):
    chain = []
    while speed > 2.0:
        chain.append("atempo=2.0")
        speed /= 2.0
    while speed < 0.5:
        chain.append("atempo=0.5")
        speed /= 0.5
    chain.append(f"atempo={speed:.4f}")
    return chain


def build_render_cmd(item, ref, out, workdir, preview=False):
    """ffmpeg command that applies trim + all edits + track choices and outputs stream format."""
    info, fx, au = item["info"], item["fx"], item["audio"]
    start, end = item["start"], item["end"]
    speed = float(fx["speed"])
    src_dur = end - start
    out_dur = src_dur / speed
    w, h, fps = even(ref["w"]), even(ref["h"]), ref["fps"]
    if preview:
        w, h, fps = 640, even(640 * ref["h"] / ref["w"]), min(ref["fps"], 30)

    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{src_dur:.3f}",
           "-i", item["path"]]
    file_idx = None
    if au["mode"] in ("replace", "mix") and au["file"]:
        cmd += ["-stream_loop", "-1", "-i", au["file"]]
        file_idx = 1

    # ---- video chain
    vf = []
    rot = int(fx["rotate"])
    if rot == 90:
        vf.append("transpose=1")
    elif rot == 180:
        vf += ["hflip", "vflip"]
    elif rot == 270:
        vf.append("transpose=2")
    if fx["flip_h"]:
        vf.append("hflip")
    if fx["flip_v"]:
        vf.append("vflip")
    if (fx["brightness"], fx["contrast"], fx["saturation"]) != (0, 100, 100):
        vf.append(f"eq=brightness={fx['brightness'] / 200:.3f}:contrast={fx['contrast'] / 100:.3f}"
                  f":saturation={fx['saturation'] / 100:.3f}")
    if speed != 1:
        vf.append(f"setpts=PTS/{speed:.4f}")
    vf += [f"scale={w}:{h}:force_original_aspect_ratio=decrease",
           f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2", f"fps={fps}"]
    if fx["text"]:
        tfile = f"t_{uuid.uuid4().hex[:8]}.txt"
        with open(os.path.join(workdir, tfile), "w", encoding="utf-8") as f:
            f.write(fx["text"])
        y = {"top": "h/20", "center": "(h-text_h)/2"}.get(fx["text_pos"], "h-text_h-h/20")
        vf.append(f"drawtext={font_opt()}textfile='{tfile}':expansion=none:fontcolor=white:"
                  f"fontsize=h/18:x=(w-text_w)/2:y={y}:box=1:boxcolor=black@0.5:boxborderw=12")
    if fx["fade_in"] > 0:
        vf.append(f"fade=t=in:st=0:d={fx['fade_in']:.2f}")
    if fx["fade_out"] > 0:
        vf.append(f"fade=t=out:st={max(0, out_dur - fx['fade_out']):.2f}:d={fx['fade_out']:.2f}")
    vf.append("format=yuv420p")
    chains = ["[0:v:0]" + ",".join(vf) + "[v]"]

    # ---- audio chain
    n_audio = info["n_audio"]

    def original():
        if n_audio == 0:
            chains.append("anullsrc=r=48000:cl=stereo[ao]")
        elif au["track"] == "all" and n_audio > 1:
            ins = "".join(f"[0:a:{i}]" for i in range(n_audio))
            chains.append(f"{ins}amix=inputs={n_audio}:normalize=0[ao]")
        else:
            t = au["track"] if isinstance(au["track"], int) and au["track"] < n_audio else 0
            chains.append(f"[0:a:{t}]anull[ao]")

    mode = au["mode"]
    if mode == "mute":
        chains.append("anullsrc=r=48000:cl=stereo[ao]")
        base = "ao"
    elif mode == "replace" and file_idx:
        chains.append(f"[{file_idx}:a:0]anull[ao]")
        base = "ao"
    elif mode == "mix" and file_idx:
        original()
        chains.append(f"[{file_idx}:a:0]volume={au['file_vol'] / 100:.3f}[af]")
        chains.append("[ao][af]amix=inputs=2:duration=first:normalize=0[am]")
        base = "am"
    else:
        original()
        base = "ao"
    af = ["aresample=48000", "aformat=channel_layouts=stereo"]
    if speed != 1:
        af += atempo_chain(speed)
    if fx["volume"] != 100:
        af.append(f"volume={fx['volume'] / 100:.3f}")
    if fx["fade_in"] > 0:
        af.append(f"afade=t=in:st=0:d={fx['fade_in']:.2f}")
    if fx["fade_out"] > 0:
        af.append(f"afade=t=out:st={max(0, out_dur - fx['fade_out']):.2f}:d={fx['fade_out']:.2f}")
    chains.append(f"[{base}]" + ",".join(af) + "[a]")

    cmd += ["-filter_complex", ";".join(chains), "-map", "[v]", "-map", "[a]",
            "-t", f"{out_dur:.3f}", "-c:v", "libx264", "-preset", "ultrafast",
            "-crf", "28" if preview else "23", "-g", str(fps * 2),
            "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "128k", out]
    return cmd


def make_filler(main_text, sub_text, ref, out_path, workdir):
    """Static text screen (10s, h264 + silent aac) matching the stream format."""
    w, h, fps = even(ref["w"]), even(ref["h"]), ref["fps"]
    with open(os.path.join(workdir, "main.txt"), "w", encoding="utf-8") as f:
        f.write(main_text)
    with open(os.path.join(workdir, "sub.txt"), "w", encoding="utf-8") as f:
        f.write(sub_text)
    fo = font_opt()
    vf = (
        f"drawtext={fo}textfile='main.txt':expansion=none:fontcolor=white:"
        f"fontsize=h/9:x=(w-text_w)/2:y=(h-text_h)/2-h/12,"
        f"drawtext={fo}textfile='sub.txt':expansion=none:fontcolor=0xAAB4C2:"
        f"fontsize=h/26:x=(w-text_w)/2:y=h/2+h/10"
    )
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", f"color=c=0x0e1621:s={w}x{h}:r={fps}",
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
        "-t", str(FILLER_SECONDS), "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-g", str(fps * 2),
        "-c:a", "aac", "-b:a", "128k", "-shortest", out_path,
    ], check=True, cwd=workdir, creationflags=NOWIN)


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_json(path, data):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception:
        pass


