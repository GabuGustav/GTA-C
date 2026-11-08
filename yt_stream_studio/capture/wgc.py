"""Windows Graphics Capture / DXGI frame producers."""
import ctypes
import os
import subprocess
import sys
import threading
import time
from ctypes import wintypes

import json
import threading

from ..config import NOWIN, CONFIG_PATH, MIX_MODE
from ..util import load_json
from .screen import WGC_MONITOR, probe_screen_size, NO_AUDIO

# --------------------------------------------------------------------------- WGC
# FFmpeg has no Windows Graphics Capture input. We capture with WGC (same family
# of API Game Bar uses), write BGRA frames to ffmpeg stdin as rawvideo, and let
# the existing encode/RTMP graph do the rest.
_WGC_BACKEND = None  # cached: "windows_capture" | "dxcam" | None
_WGC_SIZE = {}       # cached (w, h) from last successful open
_WGC_PROBE_ERRORS = []  # last import errors for the log


def probe_wgc_backend(force=False):
    """Which optional Python capture backend is installed (Windows only).

    Packages must be installed into the *same* Python that runs this app
    (sys.executable). A common failure is `pip install` on Python 3.14 while
    the app is started with another interpreter.
    """
    global _WGC_BACKEND, _WGC_PROBE_ERRORS
    if not force and _WGC_BACKEND is not None:
        return _WGC_BACKEND or None
    _WGC_PROBE_ERRORS = []
    if not sys.platform.startswith("win"):
        _WGC_BACKEND = ""
        return None
    try:
        import windows_capture  # noqa: F401
        _WGC_BACKEND = "windows_capture"
        return _WGC_BACKEND
    except Exception as e:
        _WGC_PROBE_ERRORS.append(f"windows_capture: {type(e).__name__}: {e}")
    try:
        import dxcam  # noqa: F401
        _WGC_BACKEND = "dxcam"
        return _WGC_BACKEND
    except Exception as e:
        _WGC_PROBE_ERRORS.append(f"dxcam: {type(e).__name__}: {e}")
    _WGC_BACKEND = ""
    return None


def wgc_install_hint():
    exe = getattr(sys, "executable", "python")
    errs = ""
    if _WGC_PROBE_ERRORS:
        errs = " Import errors: " + " | ".join(_WGC_PROBE_ERRORS)[:240]
    return (
        f"WGC packages not importable in this Python: {exe}. "
        f"Install into THAT interpreter, then restart: "
        f"\"{exe}\" -m pip install windows-capture "
        f"&& \"{exe}\" -c \"import windows_capture; print('ok')\"."
        + errs
    )


def probe_wgc_size():
    """Best-effort pixel size for the primary display (source capture)."""
    if "v" in _WGC_SIZE:
        return _WGC_SIZE["v"]
    dims = probe_screen_size()
    if dims:
        _WGC_SIZE["v"] = dims
        return dims
    # Logical size from Tk if available later; default 1080p
    _WGC_SIZE["v"] = (1920, 1080)
    return _WGC_SIZE["v"]


def _wgc_has_cv2():
    try:
        import cv2  # noqa: F401
        return True
    except Exception:
        return False


# Full-desktop target in the window picker
WGC_MONITOR = "(Entire screen)"
NO_APP_AUDIO = "(none — game/window only)"


def list_capturable_windows(limit=80):
    """Visible top-level windows suitable for WGC window capture (title, hwnd)."""
    if not sys.platform.startswith("win"):
        return []
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    results = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def _enum(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        if user32.GetWindow(hwnd, 4):  # GW_OWNER — skip owned popups
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length < 1:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = buf.value.strip()
        if not title:
            return True
        # Skip our own UI noise
        low = title.lower()
        if low.startswith("yt stream studio") or low in ("program manager",):
            return True
        results.append((title, int(hwnd)))
        return len(results) < limit

    user32.EnumWindows(_enum, 0)
    # Prefer longer / more specific titles first for the combobox
    results.sort(key=lambda x: (-len(x[0]), x[0].lower()))
    return results


def resolve_window_title(name):
    """Best currently-open window title for a saved name: exact, then case-insensitive,
    then prefix/substring either way. Returns None if nothing matches."""
    wins = [t for t, _ in list_capturable_windows(200)]
    if name in wins:
        return name
    low = name.lower()
    for t in wins:
        if t.lower() == low:
            return t
    for t in wins:
        if t.lower().startswith(low) or low.startswith(t.lower()):
            return t
    for t in wins:
        if low in t.lower() or t.lower() in low:
            return t
    return None


def window_title_to_pid(title):
    """PID of the process that owns a visible window matching title, or None."""
    if not title or not sys.platform.startswith("win"):
        return None
    resolved = resolve_window_title(title) or title
    for t, hwnd in list_capturable_windows(200):
        if t != resolved and t.lower() != resolved.lower():
            continue
        try:
            from ctypes import wintypes
            pid = wintypes.DWORD()
            ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value:
                return int(pid.value)
        except Exception:
            return None
    return None


_PROCTAP_OK = None  # cached: avoid re-importing native code on UI/hot paths

def process_loopback_available():
    """True if Game Bar–class process loopback (proc-tap) can be imported."""
    global _PROCTAP_OK
    if _PROCTAP_OK is not None:
        return _PROCTAP_OK
    try:
        from proctap import ProcessAudioCapture  # noqa: F401
        _PROCTAP_OK = True
    except Exception:
        _PROCTAP_OK = False
    return _PROCTAP_OK


def _start_proctap(target_pid):
    cmd = [sys.executable, "-m", "proctap", "--pid", str(int(target_pid)),
           "--format", "int16", "--stdout"]
    creation = NOWIN if sys.platform.startswith("win") else 0
    return subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        stdin=subprocess.DEVNULL, creationflags=creation, bufsize=0)


def _pipe_nonblocking(pipe):
    if pipe is None or not sys.platform.startswith("win"):
        return
    try:
        import msvcrt
        from ctypes import wintypes
        PIPE_NOWAIT = 0x00000001
        kernel32 = ctypes.windll.kernel32
        handle = msvcrt.get_osfhandle(pipe.fileno())
        mode = wintypes.DWORD()
        if kernel32.GetNamedPipeHandleStateW(handle, ctypes.byref(mode),
                                             None, None, None, None, 0):
            kernel32.SetNamedPipeHandleState(
                handle, ctypes.byref(wintypes.DWORD(PIPE_NOWAIT)), None, None)
    except Exception:
        pass


def warmup_process_audio(pid, pid2=None, timeout=12.0, log=None):
    """Start ProcTap *before* FFmpeg so the 10s test is not all silence.

    Returns (helpers, buffered_pcm, heard). Caller must pass helpers into
    process_loopback_audio_loop or terminate them.

    NOTE: buffered_pcm is only used to prove the helper works. The audio loop
    DISCARDS it — replaying that old audio is what made sound arrive late.
    """
    def _log(msg):
        if log:
            try:
                log(msg)
            except Exception:
                pass

    helpers = []
    buf = bytearray()
    heard = False
    try:
        h1 = _start_proctap(pid)
        helpers.append(h1)
        h2 = None
        if pid2:
            try:
                h2 = _start_proctap(pid2)
                helpers.append(h2)
            except Exception as e:
                _log(f"audio: secondary proctap failed ({e})")
        # Non-blocking BEFORE the wait loop, otherwise read() sits there until the game
        # makes a sound and the timeout is never honoured (it took 18-29 s when silent).
        for h in helpers:
            _pipe_nonblocking(h.stdout)
        _log(f"audio: warming up process capture (PID {pid}"
             + (f"+{pid2}" if pid2 else "") + f") up to {timeout:.0f}s…")
        deadline = time.monotonic() + max(2.0, float(timeout))
        while time.monotonic() < deadline:
            if h1.poll() is not None:
                err = (h1.stderr.read() or b"").decode("utf-8", "replace")[-200:]
                _log(f"audio: proctap exited during warmup ({h1.returncode}) {err}".strip())
                break
            try:
                chunk = h1.stdout.read(8192) or b""
            except Exception:
                chunk = b""
            if chunk:
                buf.extend(chunk)
                # Keep at most ~1s of PCM @ 48k stereo s16le
                max_keep = 48000 * 2 * 2
                if len(buf) > max_keep:
                    del buf[:-max_keep]
                if any(buf[i] or buf[i + 1] for i in range(0, min(len(buf), 4000), 2)):
                    heard = True
                    _log("audio: process capture warm — real samples ready")
                    break
            else:
                time.sleep(0.03)
        if not heard:
            _log("audio: warmup finished without non-silent samples "
                 "(game muted, wrong PID, or ProcTap slow) — will keep trying live")
        for h in helpers:
            _pipe_nonblocking(h.stdout)
        return helpers, bytes(buf), heard
    except Exception as e:
        _log(f"audio: warmup failed: {e}")
        for h in helpers:
            try:
                if h.poll() is None:
                    h.terminate()
            except Exception:
                pass
        return [], b"", False


def _drain_pipe(h, into):
    """Pull EVERYTHING currently available from a non-blocking ProcTap pipe."""
    got_any = False
    for _ in range(64):  # bounded so one call can never spin forever
        try:
            chunk = h.stdout.read(65536)
        except Exception:
            break
        if not chunk:
            break
        into.extend(chunk)
        got_any = True
        if len(chunk) < 65536:
            break
    return got_any


LIVE_DEFAULTS = {"shift_ms": 0.0, "max_lat_ms": 250.0, "keep_lat_ms": 120.0,
                 "video_shift_ms": 0.0, "mic_gain": 100.0,
                 "game_gain": 100.0, "mic_mute": 0.0,
                 "gate_on": 0.0, "gate_db": -45.0, "gate_hold_ms": 200.0,
                 "duck_on": 0.0, "duck_db": 6.0}


class _MicTap:
    """Microphone for 'System + Mic' mode. ffmpeg can't open the mic without blocking the
    video start, so Python records it (PyAudioWPatch), converts to 48 kHz stereo and the
    audio feeder mixes it into the game sound 10 ms at a time."""

    CAP_MS = 150

    def __init__(self, name_hint, say):
        self.ok, self.say = False, say
        self.buf, self.lock = bytearray(), threading.Lock()
        self.pa = self.stream = None
        try:
            import numpy as np
            import pyaudiowpatch as pyaudio
        except Exception as e:
            say(f"mic: can't start ({e}). Needs: pip install PyAudioWPatch numpy")
            return
        try:
            self.pa = pa = pyaudio.PyAudio()
            want = (name_hint or "").lower().strip()
            try:
                wasapi = pa.get_host_api_info_by_type(pyaudio.paWASAPI)["index"]
            except Exception:
                wasapi = -1
            cands = []
            for i in range(pa.get_device_count()):
                d = pa.get_device_info_by_index(i)
                if int(d.get("maxInputChannels", 0)) < 1 or d.get("isLoopbackDevice"):
                    continue
                n = (d.get("name") or "").lower()
                if want[:12] and want[:12] in n:
                    cands.append((0 if d.get("hostApi") == wasapi else 1, i, d))
            if not cands:
                names = [pa.get_device_info_by_index(i)["name"] for i in range(pa.get_device_count())
                         if int(pa.get_device_info_by_index(i).get("maxInputChannels", 0)) > 0
                         and not pa.get_device_info_by_index(i).get("isLoopbackDevice")]
                say(f"mic: no input device matches '{name_hint}'. Available: "
                    + "; ".join(names)[:300])
                self.close()
                return
            cands.sort(key=lambda c: c[:2])
            _, idx, d = cands[0]
            rate = int(d["defaultSampleRate"])
            ch = max(1, min(2, int(d["maxInputChannels"])))

            def cb(data, frames, ti, status):
                a = np.frombuffer(data, dtype=np.int16).astype(np.float32)
                if ch == 2:
                    a = a.reshape(-1, 2).mean(axis=1)
                if rate != 48000 and len(a) > 1:
                    n = int(len(a) * 48000 / rate)
                    a = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a)
                m = np.clip(a, -32768, 32767).astype(np.int16)
                st = np.repeat(m[:, None], 2, axis=1).tobytes()
                with self.lock:
                    self.buf += st
                    cap = 48000 * 4 * self.CAP_MS // 1000
                    if len(self.buf) > cap * 3:
                        del self.buf[:len(self.buf) - cap]
                return (None, pyaudio.paContinue)

            self.stream = pa.open(format=pyaudio.paInt16, channels=ch, rate=rate, input=True,
                                  frames_per_buffer=max(256, rate // 50),
                                  input_device_index=idx, stream_callback=cb)
            self.ok = True
            say(f"mic: capturing '{d['name']}' ({rate} Hz, {ch} ch) and mixing it into the stream")
        except Exception as e:
            say(f"mic: couldn't open '{name_hint}': {e}")
            self.close()

    def take(self, n):
        """Exactly n bytes of 48 kHz stereo s16le (zero padded if short)."""
        with self.lock:
            cap = 48000 * 4 * self.CAP_MS // 1000
            if len(self.buf) > cap:
                del self.buf[:len(self.buf) - cap // 3]
            out = bytes(self.buf[:n])
            del self.buf[:n]
        return out + b"\x00" * (n - len(out)) if len(out) < n else out

    def close(self):
        for fn in (lambda: (self.stream.stop_stream(), self.stream.close()),
                   lambda: self.pa.terminate()):
            try:
                fn()
            except Exception:
                pass
        self.ok = False


def live_tuning_path():
    from ..config import log_dir
    return os.path.join(log_dir("live"), "live_tuning.json")


class _LiveTuning:
    """Watchdog for live audio tuning. Re-reads live_tuning.json (twice a second) while
    streaming, so shift/latency changes apply instantly with NO restart. It also notices
    if this script (wgc.py) was edited on disk while streaming."""

    def __init__(self, say):
        self.say, self.path = say, live_tuning_path()
        self.vals, self.mtime, self.last_check = dict(LIVE_DEFAULTS), None, 0.0
        self.code_path = os.path.abspath(__file__)
        try:
            self.code_mtime = os.path.getmtime(self.code_path)
        except OSError:
            self.code_mtime = None
        self.warned = False
        if not os.path.exists(self.path):
            try:
                with open(self.path, "w", encoding="utf-8") as f:
                    json.dump(LIVE_DEFAULTS, f, indent=1)
            except OSError:
                pass
        self.poll(force=True, quiet=True)

    def poll(self, force=False, quiet=False):
        now = time.monotonic()
        if not force and now - self.last_check < 0.5:
            return
        self.last_check = now
        try:
            m = os.path.getmtime(self.path)
            if m != self.mtime:
                with open(self.path, "r", encoding="utf-8") as f:
                    j = json.load(f)
                self.mtime = m   # only after a clean read, so a half-written file is retried
                new = {}
                for k, d in LIVE_DEFAULTS.items():
                    try:
                        new[k] = float(j.get(k, d))
                    except (TypeError, ValueError):
                        new[k] = d
                new["shift_ms"] = max(-1500.0, min(1500.0, new["shift_ms"]))
                new["video_shift_ms"] = max(0.0, min(1500.0, new["video_shift_ms"]))
                new["mic_gain"] = max(0.0, min(400.0, new["mic_gain"]))
                new["game_gain"] = max(0.0, min(400.0, new["game_gain"]))
                new["mic_mute"] = 1.0 if new["mic_mute"] >= 0.5 else 0.0
                new["gate_on"] = 1.0 if new["gate_on"] >= 0.5 else 0.0
                new["gate_db"] = max(-80.0, min(-10.0, new["gate_db"]))
                new["gate_hold_ms"] = max(0.0, min(2000.0, new["gate_hold_ms"]))
                new["duck_on"] = 1.0 if new["duck_on"] >= 0.5 else 0.0
                new["duck_db"] = max(0.0, min(30.0, new["duck_db"]))
                new["max_lat_ms"] = max(60.0, min(1000.0, new["max_lat_ms"]))
                new["keep_lat_ms"] = max(10.0, min(new["max_lat_ms"] - 20, new["keep_lat_ms"]))
                if new != self.vals:
                    diff = ", ".join(f"{k}={new[k]:g}" for k in new if new[k] != self.vals.get(k))
                    self.vals = new
                    if not quiet:
                        self.say(f"live tuning changed -> {diff} (applied, no restart)")
        except Exception:
            pass
        try:
            if (not self.warned and self.code_mtime
                    and os.path.getmtime(self.code_path) != self.code_mtime):
                self.warned = True
                self.say("NOTE: wgc.py was edited while streaming. Code changes need a restart "
                         "of the capture (ffmpeg's audio socket can't be swapped mid-stream); "
                         "they apply next time you start. Live tuning values do NOT need that.")
        except OSError:
            pass


def live_levels_path():
    from ..config import log_dir
    return os.path.join(log_dir("live"), "live_levels.json")


class _Dsp:
    """Sound polish, applied to every 10 ms chunk just before it goes to ffmpeg:
    game volume, mic noise gate, ducking (game dips while you talk), mic mute, and a
    level readout (live_levels.json) that live_tune.py shows as meters."""

    def __init__(self):
        import numpy as np
        self.np = np
        self.gate_gain, self.hold = 1.0, 0
        self.duck_gain, self.game_gain = 1.0, 1.0
        self.path, self.t_write = live_levels_path(), 0.0
        self.peak_mic = self.peak_game = -90.0

    @staticmethod
    def _db(rms):
        import math
        return 20.0 * math.log10(max(rms, 1e-9) / 32768.0)

    def process(self, game, mic, v):
        np = self.np
        g = np.frombuffer(game, dtype=np.int16).astype(np.float32)
        n = len(g)
        muted = v["mic_mute"] >= 0.5
        mic_out, mic_db, talking = None, -90.0, False
        if mic is not None:
            m = np.frombuffer(mic, dtype=np.int16).astype(np.float32)
            if len(m) != n:
                m = np.resize(m, n)
            mic_db = self._db(float(np.sqrt(np.mean(m * m))))
            if mic_db >= v["gate_db"]:
                self.hold, talking = int(v["gate_hold_ms"] / 10), True
            elif self.hold > 0:
                self.hold, talking = self.hold - 1, True
            if v["gate_on"] >= 0.5:
                target = 1.0 if talking else 0.0
                rate = 0.6 if target > self.gate_gain else 0.12   # open fast, close gently
            else:
                target, rate = 1.0, 1.0
            new = self.gate_gain + (target - self.gate_gain) * rate
            ramp = np.linspace(self.gate_gain, new, n, dtype=np.float32)
            self.gate_gain = new
            mic_out = m * ramp * (0.0 if muted else v["mic_gain"] / 100.0)
            if muted:
                talking = False
        # ducking: game dips quickly when you talk, comes back slowly afterwards
        dt = 10.0 ** (-v["duck_db"] / 20.0) if (v["duck_on"] >= 0.5 and talking) else 1.0
        rate = 0.25 if dt < self.duck_gain else 0.02
        dn = self.duck_gain + (dt - self.duck_gain) * rate
        dramp = np.linspace(self.duck_gain, dn, n, dtype=np.float32)
        self.duck_gain = dn
        gt = v["game_gain"] / 100.0
        gramp = np.linspace(self.game_gain, gt, n, dtype=np.float32)
        self.game_gain = gt
        game_out = g * gramp * dramp
        mix = game_out if mic_out is None else game_out + mic_out
        out = np.clip(mix, -32768, 32767).astype(np.int16).tobytes()
        # level readout for the tuner (4 times a second)
        self.peak_mic = max(self.peak_mic, mic_db)
        self.peak_game = max(self.peak_game, self._db(float(np.sqrt(np.mean(game_out * game_out)))))
        now = time.monotonic()
        if now - self.t_write >= 0.25:
            self.t_write = now
            try:
                d = {"t": time.time(), "mic_db": round(self.peak_mic, 1),
                     "game_db": round(self.peak_game, 1), "gate_open": int(self.gate_gain > 0.5),
                     "duck": round(self.duck_gain, 2), "muted": int(muted),
                     "has_mic": int(mic is not None)}
                tmp = self.path + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(d, f)
                os.replace(tmp, self.path)
            except Exception:
                pass
            self.peak_mic = self.peak_game = -90.0
        return out


def toggle_mic_mute(say):
    """Flip mic_mute in live_tuning.json (the feeder and the tuner both pick it up)."""
    path = live_tuning_path()
    try:
        with open(path, "r", encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        d = {}
    d = {**LIVE_DEFAULTS, **d}
    d["mic_mute"] = 0.0 if float(d.get("mic_mute", 0)) >= 0.5 else 1.0
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f)
    for _ in range(12):
        try:
            os.replace(tmp, path)
            break
        except PermissionError:
            time.sleep(0.05)
    else:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(d, f)
    muted = d["mic_mute"] >= 0.5
    say("mic: MUTED (Ctrl+Alt+M to unmute)" if muted else "mic: LIVE again")

    def beep():
        try:
            import winsound
            winsound.Beep(500 if muted else 1000, 140)    # low = muted, high = live
        except Exception:
            pass
    threading.Thread(target=beep, daemon=True).start()


class _MicHotkey:
    """Ctrl+Alt+M mutes / unmutes the mic, even while you are inside the game."""

    def __init__(self, say):
        self.say, self.tid = say, None
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        try:
            u, k = ctypes.windll.user32, ctypes.windll.kernel32
            self.tid = k.GetCurrentThreadId()
            if not u.RegisterHotKey(None, 1, 0x2 | 0x1 | 0x4000, 0x4D):   # Ctrl+Alt+M
                self.say("hotkey: Ctrl+Alt+M is used by another program, so the mic mute "
                         "hotkey is off (the tuner's Mute box still works).")
                return
            self.say("hotkey: Ctrl+Alt+M mutes / unmutes the mic")
            msg = wintypes.MSG()
            try:
                while u.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
                    if msg.message == 0x0312:        # WM_HOTKEY
                        try:
                            toggle_mic_mute(self.say)
                        except Exception as e:
                            self.say(f"hotkey: couldn't toggle mute ({e})")
            finally:
                u.UnregisterHotKey(None, 1)
        except Exception as e:
            self.say(f"hotkey: not available ({e})")

    def close(self):
        try:
            if self.tid:
                ctypes.windll.user32.PostThreadMessageW(self.tid, 0x0012, 0, 0)   # WM_QUIT
        except Exception:
            pass


def process_loopback_audio_loop(port, pid, proc, err_holder, pid2=None,
                                helpers=None, primed=b""):
    """Capture process audio via proc-tap and feed s16le@48k to ffmpeg TCP.

    LATENCY RULES (this is what fixes "sound comes after the action"):
      * `primed` (audio captured during warmup) is thrown away. It is already
        seconds old by the time ffmpeg is listening; sending it made the whole
        audio track permanently late by that much.
      * Every tick we drain the whole ProcTap pipe, then cap the backlog at
        ~MAX_LAT_MS. Anything older is dropped, so a hiccup can never become
        permanent lag (the old code sent 10 ms per 10 ms forever and never
        caught up).
      * Silence is only inserted when there is truly nothing to send.
    """
    import socket
    import numpy as np
    sock = None
    helpers = list(helpers or [])
    mic = None
    hotkey = None
    try:
        # 'System + Mic' mode: record the mic here and mix it into the game sound.
        try:
            cfg = load_json(CONFIG_PATH)
            dev = (cfg.get("sc_audio") or "").strip()
            if cfg.get("sc_audio_mode") == MIX_MODE and dev and dev != NO_AUDIO:
                mic = _MicTap(dev, lambda m: err_holder.append(m))
                if not mic.ok:
                    mic = None
                else:
                    hotkey = _MicHotkey(lambda m: err_holder.append(m))
            else:
                err_holder.append(
                    f"mic: OFF. Saved audio mode is '{cfg.get('sc_audio_mode')}' and mic device "
                    f"is '{dev or '(none)'}'. Choose System + Mic and a mic in Screen settings, "
                    "then press Close there (that saves it).")
        except Exception as e:
            err_holder.append(f"mic: setup failed: {e}")
            mic = None
        if not helpers:
            h1 = _start_proctap(pid)
            helpers.append(h1)
            if pid2:
                try:
                    helpers.append(_start_proctap(pid2))
                except Exception as e:
                    err_holder.append(f"audio: secondary app capture failed ({e})")
            for h in helpers:
                _pipe_nonblocking(h.stdout)

        h1 = helpers[0]
        h2 = helpers[1] if len(helpers) > 1 else None

        # Connect TCP so FFmpeg can unblock
        t_start = time.monotonic()
        t_end = t_start + 40
        attempts, last_err, told = 0, "", False
        while time.monotonic() < t_end and proc.poll() is None:
            try:
                attempts += 1
                sock = socket.create_connection(("127.0.0.1", port), timeout=1)
                break
            except OSError as e:
                last_err = str(e)
                time.sleep(0.05)
                if not told and time.monotonic() - t_start > 6:
                    told = True
                    err_holder.append(
                        f"audio: still can't reach ffmpeg's audio socket (port {port}, "
                        f"{attempts} tries, last error: {last_err}). ffmpeg is probably "
                        "stuck waiting for the first VIDEO frame from the WGC pipe.")
        if sock is None:
            err_holder.append(
                f"audio: ffmpeg never opened its process-loopback socket "
                f"({attempts} tries, last error: {last_err}, ffmpeg alive={proc.poll() is None})")
            return
        err_holder.append(
            f"audio: connected to ffmpeg after {time.monotonic() - t_start:.1f}s "
            f"({attempts} tries)")
        sock.settimeout(None)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 65536)
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except Exception:
            pass

        rate, ch, bps = 48000, 2, 2
        frame_bytes = ch * bps                      # 4 bytes per stereo frame
        chunk_frames = 480                          # 10 ms
        need = chunk_frames * frame_bytes           # 1920 bytes
        silence = b"\x00" * need
        tun = _LiveTuning(lambda m: err_holder.append(m))
        dsp = _Dsp()
        applied_shift = 0
        pending_silence = 0   # bytes of extra silence still to send (audio later)
        skip_debt = 0         # bytes of audio still to drop (audio earlier)

        err_holder.append(
            f"audio: TCP connected; process capture PID {pid}"
            + (f"+{pid2}" if pid2 else "")
            + f" (live tuning file: {tun.path})")

        # Throw away anything that piled up in the pipe while ffmpeg was starting.
        stale = bytearray()
        _drain_pipe(h1, stale)
        if h2 is not None:
            _drain_pipe(h2, stale)
        if primed or stale:
            err_holder.append(
                f"audio: discarded {(len(primed) + len(stale)) / (rate * frame_bytes) * 1000:.0f} ms "
                "of stale startup audio")
        buf = bytearray()
        sec_buf = bytearray()
        heard = False
        trimmed_ms = 0.0
        trim_events = 0
        silent_ticks = 0
        next_t = time.monotonic()

        while proc.poll() is None:
            if h1.poll() is not None and not buf:
                err = (h1.stderr.read() or b"").decode("utf-8", "replace")[-200:]
                err_holder.append(
                    f"audio: proctap exited early ({h1.returncode}) {err}".strip())
                break

            # 1) take everything that has arrived
            _drain_pipe(h1, buf)
            if h2 is not None and h2.poll() is None:
                _drain_pipe(h2, sec_buf)

            # 1b) live tuning (re-read from disk twice a second, no restart)
            tun.poll()
            target = int(tun.vals["shift_ms"])
            if target != applied_shift:
                n = int(rate * frame_bytes * abs(target - applied_shift) / 1000)
                n -= n % frame_bytes
                if target > applied_shift:
                    pending_silence += n      # audio LATER
                else:
                    skip_debt += n            # audio EARLIER
                applied_shift = target
            if skip_debt:
                d = min(skip_debt, len(buf))
                d -= d % frame_bytes
                if d:
                    del buf[:d]
                    skip_debt -= d
            max_lat = int(rate * frame_bytes * tun.vals["max_lat_ms"] / 1000) + pending_silence
            keep_lat = int(rate * frame_bytes * tun.vals["keep_lat_ms"] / 1000) + pending_silence

            # 2) cap latency: drop the OLDEST audio, keep a small cushion
            for b in (buf, sec_buf):
                if len(b) > max_lat:
                    drop = len(b) - keep_lat
                    drop -= drop % frame_bytes
                    if drop > 0:
                        del b[:drop]
                        if b is buf:
                            trimmed_ms += drop / (rate * frame_bytes) * 1000
                            trim_events += 1
                            if trim_events in (1, 10, 100):
                                err_holder.append(
                                    f"audio: dropped backlog to stay in sync "
                                    f"({trim_events} time(s), {trimmed_ms:.0f} ms total)")

            # 3) build the next 10 ms chunk
            if pending_silence >= need:
                out = silence
                pending_silence -= need
            elif len(buf) >= need:
                out = bytes(buf[:need])
                del buf[:need]
                silent_ticks = 0
                if sec_buf and len(sec_buf) >= need:
                    b2 = bytes(sec_buf[:need])
                    del sec_buf[:need]
                    a = np.frombuffer(out, dtype=np.int16).astype(np.int32)
                    b = np.frombuffer(b2, dtype=np.int16).astype(np.int32)
                    out = np.clip(a + b, -32768, 32767).astype(np.int16).tobytes()
                if not heard and any(out):
                    heard = True
                    err_holder.append("audio: process loopback is receiving app audio - good")
            elif len(sec_buf) >= need:
                # only the 2nd app is making sound right now
                out = bytes(sec_buf[:need])
                del sec_buf[:need]
            else:
                out = silence
                silent_ticks += 1

            m = mic.take(need) if mic is not None else None      # always drain the mic
            out = dsp.process(out, m, tun.vals)

            try:
                sock.sendall(out)
            except (BrokenPipeError, ConnectionResetError, OSError):
                break

            next_t += chunk_frames / float(rate)
            delay = next_t - time.monotonic()
            if delay > 0.002:
                time.sleep(min(delay, 0.02))
            elif delay < -0.05:
                next_t = time.monotonic()
    except Exception as e:
        if proc.poll() is None:
            err_holder.append(f"audio: process loopback stopped: {e}")
    finally:
        if hotkey is not None:
            hotkey.close()
        if mic is not None:
            mic.close()
        # Always stop helpers we were given when the encode ends
        for h in helpers:
            if h.poll() is None:
                try:
                    h.terminate()
                    h.wait(timeout=2)
                except Exception:
                    try:
                        h.kill()
                    except Exception:
                        pass
        try:
            sock and sock.close()
        except Exception:
            pass



def list_heavy_user_processes(limit=25):
    """Top processes by working set, excluding critical Windows / security names."""
    if not sys.platform.startswith("win"):
        return []
    protect = {
        "system", "registry", "smss.exe", "csrss.exe", "wininit.exe", "services.exe",
        "lsass.exe", "svchost.exe", "winlogon.exe", "fontdrvhost.exe", "dwm.exe",
        "explorer.exe", "sihost.exe", "taskhostw.exe", "runtimebroker.exe",
        "securityhealthservice.exe", "msmpeng.exe", "nissrv.exe", "searchindexer.exe",
        "python.exe", "pythonw.exe", "ffmpeg.exe", "conhost.exe",
    }
    rows = []
    try:
        cmd = [
            "powershell", "-NoProfile", "-Command",
            "Get-Process | Where-Object { $_.WorkingSet64 -gt 80MB } | "
            "Sort-Object WorkingSet64 -Descending | Select-Object -First 40 "
            "Name,Id,@{N='MB';E={[int]($_.WorkingSet64/1MB)}} | "
            "ConvertTo-Csv -NoTypeInformation"
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=15,
                           creationflags=NOWIN)
        for line in (r.stdout or "").splitlines()[1:]:
            parts = [p.strip().strip('"') for p in line.split(",")]
            if len(parts) < 3:
                continue
            name, pid, mb = parts[0], parts[1], parts[2]
            if name.lower() in protect:
                continue
            try:
                rows.append({"name": name, "pid": int(pid), "mb": int(float(mb))})
            except ValueError:
                continue
            if len(rows) >= limit:
                break
    except Exception:
        pass
    return rows


def wgc_target_size(s):
    """Resolution written into the ffmpeg pipe.

    Producer-side scale only when OpenCV is available (pure-numpy resize is too
    slow here and dropped ~20fps → ~5fps). Without cv2, pipe native size and let
    ffmpeg scale — that measured better on this laptop.
    """
    height = int(s.get("height") or 0)
    src = probe_wgc_size()
    src_w, src_h = int(src[0]), int(src[1])
    src_w, src_h = max(2, src_w // 2 * 2), max(2, src_h // 2 * 2)
    if height and height < src_h and _wgc_has_cv2():
        w = max(2, int(round(src_w * (height / float(src_h)) / 2.0)) * 2)
        h = max(2, int(height) // 2 * 2)
        return w, h
    return src_w, src_h


def _wgc_frame_to_bgra(frame, expect_w, expect_h):
    """Normalize a capture frame to contiguous BGRA bytes of expect_w x expect_h."""
    import numpy as np
    arr = frame
    if hasattr(frame, "frame_buffer"):
        arr = frame.frame_buffer
    elif hasattr(frame, "convert_to_bgr"):
        try:
            arr = frame.convert_to_bgr()
        except Exception:
            arr = frame
    arr = np.asarray(arr)
    if arr.ndim == 2:
        return None
    # Accept BGRA/BGR/RGB/RGBA; output BGRA
    if arr.shape[1] != expect_w or arr.shape[0] != expect_h:
        try:
            import cv2
            # INTER_AREA is better for downscale; still cheap enough with OpenCV
            arr = cv2.resize(arr, (expect_w, expect_h), interpolation=cv2.INTER_AREA)
        except Exception:
            # Do not use slow pure-numpy resize — return None so caller skips frame
            # rather than stalling the whole pipeline at a few fps.
            return None
    c = arr.shape[2] if arr.ndim == 3 else 1
    if c == 4:
        bgra = arr
        if arr.dtype != np.uint8:
            bgra = arr.astype(np.uint8)
        # Assume already BGRA or RGBA — windows_capture is typically BGRA
        return np.ascontiguousarray(bgra).tobytes()
    if c == 3:
        # BGR -> BGRA
        if arr.dtype != np.uint8:
            arr = arr.astype(np.uint8)
        a = np.empty((expect_h, expect_w, 4), dtype=np.uint8)
        a[:, :, :3] = arr[:, :, :3]
        a[:, :, 3] = 255
        return np.ascontiguousarray(a).tobytes()
    return None


WGC_STATS = {"written": 0}   # frames the WGC producer has handed to ffmpeg (for the report)


_VS = {"applied": 0, "debt": 0, "fps": 24, "ms": 0.0, "t": 0.0, "path": None, "last_ms": 0.0}


def _video_shift_ms():
    """Live video delay from live_tuning.json (re-read twice a second)."""
    now = time.monotonic()
    if now - _VS["t"] >= 0.5:
        _VS["t"] = now
        try:
            if _VS["path"] is None:
                _VS["path"] = live_tuning_path()
            with open(_VS["path"], "r", encoding="utf-8") as f:
                j = json.load(f)
            _VS["ms"] = max(0.0, min(1500.0, float(j.get("video_shift_ms", 0))))
        except Exception:
            pass
    return _VS["ms"]


def _wgc_write(stream, data):
    """Write one frame to ffmpeg stdin; return False if the pipe is closed.

    Also applies the LIVE video delay: ffmpeg stamps frames by count (n/fps), so
    delaying video = writing a few extra repeated frames (one extra per tick, so it
    slews smoothly), and un-delaying = skipping frames. No restart needed.

    Do not flush every frame — that forces a syscall per frame and tanks fps on
    this hardware. OS pipe buffering is enough; ffmpeg reads as it encodes.
    """
    try:
        fps = max(1, int(_VS["fps"]))
        target = int(_video_shift_ms() * fps / 1000.0)
        _VS["debt"] += target - _VS["applied"]
        _VS["applied"] = target
        n = 1
        if _VS["debt"] > 0:
            n, _VS["debt"] = 2, _VS["debt"] - 1
        elif _VS["debt"] < 0:
            n, _VS["debt"] = 0, _VS["debt"] + 1
        for _ in range(n):
            stream.write(data)
            WGC_STATS["written"] += 1
        return True
    except (OSError, BrokenPipeError, ValueError):
        return False


def wgc_producer_loop(write_stream, width, height, fps, stop_evt, err_holder,
                      window_name=None):
    """Write BGRA frames to write_stream until stop_evt is set. Runs in a thread.

    window_name: if set, capture that window via WGC (Game Bar–class). dxcam can
    only do full outputs, so window capture requires windows_capture.
    """
    backend = probe_wgc_backend()
    _VS.update({"applied": 0, "debt": 0, "fps": int(fps), "t": 0.0})
    try:
        if backend == "windows_capture":
            try:
                _wgc_loop_windows_capture(write_stream, width, height, fps, stop_evt,
                                          err_holder, window_name=window_name)
            except Exception as e:
                err_holder.append(f"windows_capture path failed ({e}); trying dxcam")
                if window_name:
                    err_holder.append("dxcam cannot capture a single window; staying on WGC error")
                else:
                    try:
                        import dxcam  # noqa: F401
                        _wgc_loop_dxcam(write_stream, width, height, fps, stop_evt, err_holder)
                    except Exception as e2:
                        err_holder.append(f"dxcam fallback failed: {e2}")
        elif backend == "dxcam":
            if window_name:
                err_holder.append(
                    "Window capture needs windows-capture (pip). dxcam is full-screen only.")
            else:
                _wgc_loop_dxcam(write_stream, width, height, fps, stop_evt, err_holder)
        else:
            err_holder.append(wgc_install_hint())
    except Exception as e:
        err_holder.append(f"WGC producer crashed: {e}")
    finally:
        try:
            write_stream.close()
        except Exception:
            pass


def _wgc_loop_dxcam(write_stream, width, height, fps, stop_evt, err_holder):
    import dxcam
    cam = dxcam.create(output_idx=0, output_color="BGRA")
    if cam is None:
        err_holder.append("dxcam.create returned None (no output?)")
        return
    # video_mode keeps the buffer updating; we pace reads ourselves
    cam.start(target_fps=min(60, max(fps, 30)), video_mode=True)
    try:
        next_t = time.monotonic()
        while not stop_evt.is_set():
            frame = cam.get_latest_frame()
            if frame is None:
                time.sleep(0.002)
                continue
            data = _wgc_frame_to_bgra(frame, width, height)
            if not data:
                time.sleep(0.002)
                continue
            if not _wgc_write(write_stream, data):
                break
            next_t += 1.0 / max(1, fps)
            delay = next_t - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            else:
                next_t = time.monotonic()
    finally:
        try:
            cam.stop()
        except Exception:
            pass


def _wgc_extract_array(frame):
    """Get a numpy HxWxC array from a windows-capture Frame / Dxgi frame."""
    if frame is None:
        return None
    # DxgiDuplicationFrame.to_numpy() — no kwargs in 2.0.1
    if hasattr(frame, "to_numpy") and callable(frame.to_numpy):
        try:
            return frame.to_numpy()
        except Exception:
            pass
    if hasattr(frame, "to_bgr") and callable(frame.to_bgr):
        try:
            return frame.to_bgr()
        except Exception:
            pass
    # Graphics Capture Frame: BGRA in frame_buffer
    if hasattr(frame, "frame_buffer"):
        return frame.frame_buffer
    if hasattr(frame, "buffer"):
        return frame.buffer
    return frame


def _wgc_loop_windows_capture(write_stream, width, height, fps, stop_evt, err_holder,
                              window_name=None):
    """Windows capture via windows-capture 2.x (DxgiDuplication or Graphics Capture)."""
    # Full-screen only: DXGI session is a simple poller. Window targets need WGC.
    if not window_name:
        try:
            from windows_capture import DxgiDuplicationSession
            session = DxgiDuplicationSession()
            timeout_ms = max(5, int(1000 / max(1, fps)))
            next_t = time.monotonic()
            empty_streak = 0
            got_any = False
            last_data = None
            while not stop_evt.is_set():
                try:
                    frame = session.acquire_frame(timeout_ms=timeout_ms)
                except RuntimeError:
                    try:
                        session.recreate()
                    except Exception:
                        pass
                    continue
                if frame is None:
                    # Screen did not change. Desktop duplication only reports CHANGES, so on a
                    # quiet screen it used to go ~2 fps and starve ffmpeg (slow speed, dup frames,
                    # audio out of step). Repeat the last frame to hold a steady frame rate.
                    if last_data is None:
                        empty_streak += 1
                        if empty_streak > fps * 8:
                            err_holder.append("DxgiDuplicationSession delivered no frames for ~8s")
                            break
                        continue
                    data = last_data
                else:
                    empty_streak = 0
                    arr = _wgc_extract_array(frame)
                    data = _wgc_frame_to_bgra(arr, width, height)
                    if not data:
                        continue
                    last_data = data
                got_any = True
                if not _wgc_write(write_stream, data):
                    break
                next_t += 1.0 / max(1, fps)
                delay = next_t - time.monotonic()
                if delay > 0:
                    time.sleep(delay)
                else:
                    next_t = time.monotonic()
            if got_any:
                return
            raise RuntimeError("DxgiDuplicationSession produced no usable frames")
        except ImportError:
            pass
        except Exception as e:
            err_holder.append(f"DxgiDuplicationSession failed ({e}); trying WindowsCapture events")

    from windows_capture import WindowsCapture, Frame, InternalCaptureControl

    frame_lock = threading.Lock()
    latest = {"bytes": None}
    closed = threading.Event()

    def on_frame_arrived(frame: Frame, capture_control: InternalCaptureControl):
        if stop_evt.is_set():
            try:
                capture_control.stop()
            except Exception:
                pass
            return
        try:
            arr = _wgc_extract_array(frame)
            data = _wgc_frame_to_bgra(arr, width, height)
            if data:
                with frame_lock:
                    latest["bytes"] = data
        except Exception:
            pass

    def on_closed():
        closed.set()

    # Assign handlers by attribute (decorator is name-sensitive and breaks when nested).
    kw = dict(cursor_capture=True, draw_border=False)
    if window_name:
        # Titles change (Spotify becomes "Artist - Song" while playing) and the library needs
        # the EXACT current title, so resolve the saved name against the windows open right now.
        resolved = resolve_window_title(window_name)
        if resolved and resolved != window_name:
            err_holder.append(f"window '{window_name}' is now titled '{resolved}'; using that")
        window_name = resolved or window_name
        kw["window_name"] = window_name
        kw["monitor_index"] = None
    else:
        kw["monitor_index"] = None
    cap = WindowsCapture(**kw)
    cap.frame_handler = on_frame_arrived
    cap.closed_handler = on_closed

    def _run_cap():
        try:
            cap.start()
        except Exception as e:
            err_holder.append(f"WGC could not start on {window_name or 'the screen'}: {e}")
            closed.set()
    th = threading.Thread(target=_run_cap, daemon=True)
    th.start()
    time.sleep(0.5)
    next_t = time.monotonic()
    empty_streak = 0
    black = None
    try:
        while not stop_evt.is_set() and not closed.is_set():
            with frame_lock:
                data = latest["bytes"]
            if data:
                empty_streak = 0
                if not _wgc_write(write_stream, data):
                    break
            else:
                # No frame from the window yet (minimized, or nothing on it is changing).
                # ffmpeg will not open its audio socket until it has seen video, so feed
                # black frames until the real picture appears instead of stalling the start.
                empty_streak += 1
                if empty_streak == fps * 3:
                    err_holder.append("WGC: no picture from the window yet (is it minimized?). "
                                      "Sending black until it appears.")
                if black is None:
                    black = bytes(int(width) * int(height) * 4)
                if not _wgc_write(write_stream, black):
                    break
            next_t += 1.0 / max(1, fps)
            delay = next_t - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            else:
                next_t = time.monotonic()
    finally:
        try:
            if hasattr(cap, "stop"):
                cap.stop()
        except Exception:
            pass
