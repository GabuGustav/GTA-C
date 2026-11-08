"""WASAPI loopback, process loopback, device listing, PCM analysis."""
import os
import re
import socket
import struct
import subprocess
import sys
import threading
import time
import wave

from ..config import NOWIN, LOOPBACK_MODE, MIX_MODE, DSHOW_MODE, SILENT_MODE
from .screen import NO_AUDIO, NO_APP_AUDIO

# Cached DirectShow device names (30s TTL). Must exist before list_audio_devices runs.
_AUDIO_DEVICE_CACHE = {"devs": None, "ts": 0}

# ---------------------------------------------------------------- WASAPI loopback audio
# Game Bar records "whatever Windows is playing" by tapping the default speakers (WASAPI
# loopback). ffmpeg has no such input, so a Python thread captures it (PyAudioWPatch) and
# feeds ffmpeg over a local TCP socket. Loopback delivers NOTHING while the PC is silent, so
# the thread fills those stretches with real-time silence: the stream never stalls and then
# bursts, which is what virtual devices (Voicemeeter, Stereo Mix) were doing.
def free_port():
    import socket
    with socket.socket() as so:
        so.bind(("127.0.0.1", 0))
        return so.getsockname()[1]


def probe_loopback():
    """(info dict, '') for the default speakers' loopback, or (None, reason)."""
    if not sys.platform.startswith("win"):
        return None, "WASAPI loopback needs Windows."
    try:
        import pyaudiowpatch as pyaudio
    except Exception as e:
        return None, (f"PyAudioWPatch is not installed in this Python ({sys.executable}): {e}. "
                      "Run:  pip install PyAudioWPatch")
    pa = pyaudio.PyAudio()
    try:
        try:
            spk = pa.get_default_wasapi_loopback()
        except Exception:
            wasapi = pa.get_host_api_info_by_type(pyaudio.paWASAPI)
            spk = pa.get_device_info_by_index(wasapi["defaultOutputDevice"])
            if not spk.get("isLoopbackDevice"):
                for lb in pa.get_loopback_device_info_generator():
                    if spk["name"] in lb["name"]:
                        spk = lb
                        break
                else:
                    return None, f"No loopback device found for the default speakers ({spk['name']})."
        name = spk["name"]
        # Virtual enhancers on the default endpoint often mush loopback audio.
        return ({"index": spk["index"], "name": name,
                 "rate": int(spk["defaultSampleRate"]),
                 "channels": max(1, min(8, int(spk["maxInputChannels"]))),
                 "enhancer": bool(re.search(
                     r"(?i)fxsound|nahimic|dolby|sonic|equalizer|enhancer|virtual\s*cable|voicemeeter",
                     name or ""))}, "")
    except Exception as e:
        return None, f"Couldn't query the default speakers: {e}"
    finally:
        pa.terminate()


def open_loopback(info):
    """Open the loopback stream NOW (this takes seconds on Bluetooth/USB headsets) so it is
    already running when ffmpeg starts. Returns a handle for loopback_audio_loop."""
    import queue as _q
    import pyaudiowpatch as pyaudio
    # ~2s of 20ms chunks — under game+WGC load, dropping is what sounds like radio static.
    chunks = _q.Queue(maxsize=256)

    def cb(in_data, frame_count, time_info, status):
        # Prefer blocking briefly over dropping frames (drops = radio crackle).
        try:
            chunks.put(in_data, timeout=0.05)
        except _q.Full:
            try:
                chunks.get_nowait()
            except _q.Empty:

                pass
            try:
                chunks.put_nowait(in_data)
            except _q.Full:
                pass
        return (None, pyaudio.paContinue)
    pa = pyaudio.PyAudio()
    try:
        # ~20 ms buffers: more stable under CPU spikes than 10 ms.
        fpb = max(512, int(info["rate"] * 0.02))
        stream = pa.open(format=pyaudio.paInt16, channels=info["channels"], rate=info["rate"],
                         input=True, frames_per_buffer=fpb,
                         input_device_index=info["index"], stream_callback=cb)
    except Exception:
        pa.terminate()
        raise
    return {"pa": pa, "stream": stream, "chunks": chunks}


def close_loopback(h):
    for fn in (lambda: (h["stream"].stop_stream(), h["stream"].close()), lambda: h["pa"].terminate()):
        try:
            fn()
        except Exception:
            pass


def _pcm_hold_pad(last_frame, nbytes):
    """Pad with repeated last sample frame instead of zeros (zeros = clicks/scratches)."""
    if nbytes <= 0:
        return b""
    if not last_frame:
        return b"\x00" * nbytes
    reps = (nbytes + len(last_frame) - 1) // len(last_frame)
    return (last_frame * reps)[:nbytes]


def loopback_audio_loop(port, info, proc, err_holder, handle=None):
    """Capture default speakers' loopback and feed s16le to ffmpeg on `port`.

    Prefers sounddevice (PortAudio WASAPI loopback) when installed — continuous read,
    fewer gaps. Falls back to PyAudioWPatch callback + hold-last-sample pacing (not
    hard zeros, which cause scratch/click artifacts).
    """
    import socket
    import queue as _q
    sock = None
    rate, ch = info["rate"], info["channels"]
    bps = 2 * ch
    frame = b"\x00" * bps
    try:
        t_end = time.monotonic() + 40
        while time.monotonic() < t_end and proc.poll() is None:
            try:
                sock = socket.create_connection(("127.0.0.1", port), timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        if sock is None:
            err_holder.append("audio: ffmpeg never opened its audio socket")
            return
        sock.settimeout(None)
        try:
            # Match ffmpeg recv buffer so the sender is not the narrow pipe.
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 65536)
        except Exception:
            pass

        # ---- Preferred path: sounddevice (only if PortAudio exposes a Loopback INPUT) ----
        # Stock sounddevice WasapiSettings has exclusive/auto_convert only — NO loopback=
        # flag (confirmed on 0.5.x). True WASAPI loopback in Python is PyAudioWPatch.
        # If a host PortAudio build lists "*Loopback*" inputs, we can use those.
        try:
            import sounddevice as sd
            import numpy as np
            dev_index = None
            target = (info.get("name") or "").lower()
            target_base = target.replace("[loopback]", "").strip()
            try:
                devices = sd.query_devices()
                for i, d in enumerate(devices):
                    if int(d.get("max_input_channels") or 0) < 1:
                        continue
                    low = (d.get("name") or "").lower()
                    if "loopback" not in low:
                        continue
                    if target_base and not any(
                            tok in low for tok in target_base.split()[:4] if len(tok) > 2):
                        continue
                    dev_index = i
                    break
                if dev_index is None:
                    for i, d in enumerate(devices):
                        low = (d.get("name") or "").lower()
                        if int(d.get("max_input_channels") or 0) > 0 and "loopback" in low:
                            dev_index = i
                            break
            except Exception as e:
                err_holder.append(f"audio: sounddevice device query failed ({e})")
                dev_index = None

            if dev_index is not None:
                dinfo = sd.query_devices(dev_index)
                sr = int(dinfo.get("default_samplerate") or rate or 48000)
                ch_sd = min(2, max(1, int(dinfo.get("max_input_channels") or 2)))
                block = max(1024, int(sr * 0.04))
                err_holder.append(
                    f"audio: sounddevice loopback INPUT idx={dev_index} "
                    f"'{dinfo.get('name')}' ({sr} Hz, {ch_sd} ch, block={block})")
                try:
                    import ctypes
                    ctypes.windll.kernel32.SetThreadPriority(
                        ctypes.windll.kernel32.GetCurrentThread(), 2)
                except Exception:
                    pass
                heard = False
                overflows = 0
                with sd.InputStream(device=dev_index, channels=ch_sd, samplerate=sr,
                                    dtype="int16", blocksize=block, latency="high") as stream:
                    while proc.poll() is None:
                        data, overflowed = stream.read(block)
                        if overflowed:
                            overflows += 1
                            if overflows <= 3 or overflows % 50 == 0:
                                err_holder.append(
                                    f"audio: sounddevice overflow #{overflows}")
                        raw = np.ascontiguousarray(data).tobytes()
                        if not heard and any(raw[i] or raw[i + 1]
                                             for i in range(0, min(len(raw), 4000), 2)):
                            heard = True
                            err_holder.append("audio: sound is arriving from Windows - good")
                        try:
                            sock.sendall(raw)
                        except (BrokenPipeError, ConnectionResetError, OSError):
                            break
                return
            err_holder.append(
                "audio: stock sounddevice has no WASAPI loopback API; "
                "using PyAudioWPatch (correct for Windows loopback)")
        except ImportError:
            err_holder.append("audio: sounddevice not installed — using PyAudioWPatch")
        except Exception as e:
            err_holder.append(f"audio: sounddevice path failed ({e}); using PyAudioWPatch")

        # ---- Fallback: PyAudioWPatch callback queue ----
        if handle is None:
            err_holder.append("audio: no PyAudioWPatch handle")
            return
        try:
            import ctypes
            ctypes.windll.kernel32.SetThreadPriority(
                ctypes.windll.kernel32.GetCurrentThread(), 2)  # HIGHEST
        except Exception:
            pass
        chunks = handle["chunks"]
        while True:
            try:
                chunks.get_nowait()
            except _q.Empty:
                break
        start, sent, heard, told = time.monotonic(), 0, False, False
        last_frame = frame
        err_holder.append(f"audio: capturing '{info['name']}' via PyAudioWPatch")
        while proc.poll() is None:
            time.sleep(0.005)
            got = []
            while True:
                try:
                    got.append(chunks.get_nowait())
                except _q.Empty:
                    break
            data = b"".join(got)
            if data:
                last_frame = data[-bps:] if len(data) >= bps else last_frame
                if not heard and any(data[i] or data[i + 1] for i in range(0, min(len(data), 4000), 2)):
                    heard = True
                    err_holder.append("audio: sound is arriving from Windows - good")
            if not heard and not told and time.monotonic() - start > 8:
                told = True
                err_holder.append(f"audio: NO sound heard from '{info['name']}' in 8s. Windows must be "
                                  "playing something to THAT output device (check the default speakers).")
            # Sample-count clock: only pad when >40ms behind; hold-last-sample (never zeros).
            # Research-style math padding, but zeros cause the classic scratch — we hold.
            expected = int((time.monotonic() - start) * rate) * bps
            behind = expected - (sent + len(data))
            max_pad = (rate * bps) // 33  # ~30 ms
            if behind > rate * bps // 25:  # >40 ms short
                pad = behind - (behind % bps)
                pad = min(pad, max_pad)
                if pad > 0:
                    data = _pcm_hold_pad(last_frame, pad) + data
            ahead = (sent + len(data)) - expected
            if ahead > rate * bps // 10:  # >100 ms ahead
                time.sleep(0.02)
            elif ahead > rate * bps // 20:
                time.sleep(0.005)
            if data:
                try:
                    sock.sendall(data)
                    sent += len(data)
                except (BrokenPipeError, ConnectionResetError, OSError):
                    break
    except Exception as e:
        if proc.poll() is None:
            err_holder.append(f"audio loopback stopped: {e}")
    finally:
        if handle:
            close_loopback(handle)
        try:
            sock and sock.close()
        except Exception:
            pass


def loopback_peak(seconds=5):
    """Record `seconds` of loopback and return (peak 0..1, info, error)."""
    info, why = probe_loopback()
    if not info:
        return None, None, why
    try:
        import pyaudiowpatch as pyaudio
        import struct
        pa = pyaudio.PyAudio()
        peak = 0
        try:
            st = pa.open(format=pyaudio.paInt16, channels=info["channels"], rate=info["rate"],
                         input=True, frames_per_buffer=1024, input_device_index=info["index"])
            end = time.monotonic() + seconds
            while time.monotonic() < end:
                # loopback gives no data during silence; read only what is available
                n = st.get_read_available()
                if n:
                    raw = st.read(n, exception_on_overflow=False)
                    vals = struct.unpack(f"<{len(raw) // 2}h", raw[:len(raw) // 2 * 2])
                    if vals:
                        peak = max(peak, max(abs(v) for v in vals))
                time.sleep(0.02)
            st.stop_stream()
            st.close()
        finally:
            pa.terminate()
        return peak / 32768.0, info, ""
    except Exception as e:
        return None, info, str(e)


def analyze_pcm16(raw, channels, sample_rate):
    """Stats for interleaved s16le PCM. Used by the audio diagnostic log."""
    import struct
    n = len(raw) // 2
    if n < 8:
        return {"error": "too few samples", "bytes": len(raw)}
    # Cap analysis length (~30 s stereo @ 48 kHz) so the UI stays responsive
    max_n = min(n, sample_rate * max(1, channels) * 30)
    vals = struct.unpack(f"<{max_n}h", raw[: max_n * 2])
    peak = max(abs(v) for v in vals)
    # RMS on a stride for speed
    step = max(1, len(vals) // 200000)
    acc = 0.0
    cnt = 0
    clip = 0
    silent = 0
    zc = 0
    prev = 0
    for i in range(0, len(vals), step):
        v = vals[i]
        acc += v * v
        cnt += 1
        if abs(v) >= 32760:
            clip += 1
        if abs(v) < 200:
            silent += 1
        if i and ((prev >= 0 and v < 0) or (prev < 0 and v >= 0)):
            zc += 1
        prev = v
    rms = (acc / max(1, cnt)) ** 0.5
    dur = (n / max(1, channels)) / float(sample_rate)
    return {
        "samples": n,
        "duration_s": round(dur, 3),
        "channels": channels,
        "sample_rate": sample_rate,
        "peak": round(peak / 32768.0, 4),
        "peak_db": round(20 * __import__("math").log10(max(peak, 1) / 32768.0), 1),
        "rms": round(rms / 32768.0, 4),
        "rms_db": round(20 * __import__("math").log10(max(rms, 1) / 32768.0), 1),
        "clip_ratio": round(clip / max(1, cnt), 5),
        "silence_ratio": round(silent / max(1, cnt), 4),
        "zero_cross_rate": round(zc / max(1, cnt), 4),
    }


def write_wav_s16le(path, raw, rate, channels):
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(raw)


def record_loopback_pcm(seconds=8):
    """Capture raw s16le from WASAPI loopback (same path as the live feeder).

    Returns (pcm_bytes, info_dict, error_str). Pads silence in real time so the
    duration matches wall clock (exposes mush/burst behaviour).
    """
    info, why = probe_loopback()
    if not info:
        return b"", None, why
    try:
        handle = open_loopback(info)
    except Exception as e:
        return b"", info, f"open_loopback failed: {e}"
    import queue as _q
    rate, ch = info["rate"], info["channels"]
    bps = 2 * ch
    chunks = handle["chunks"]
    # Drop pre-roll backlog
    while True:
        try:
            chunks.get_nowait()
        except _q.Empty:
            break
    out = bytearray()
    start = time.monotonic()
    sent = 0
    last_frame = b"\x00" * bps
    try:
        while time.monotonic() - start < seconds:
            time.sleep(0.005)
            got = []
            while True:
                try:
                    got.append(chunks.get_nowait())
                except _q.Empty:
                    break
            data = b"".join(got)
            if data and len(data) >= bps:
                last_frame = data[-bps:]
            expected = int((time.monotonic() - start) * rate) * bps
            behind = expected - (sent + len(data))
            max_pad = (rate * bps) // 20
            if behind > rate * bps // 50:
                pad = min(behind - (behind % bps), max_pad)
                if pad > 0:
                    data = _pcm_hold_pad(last_frame, pad) + data
            if data:
                out.extend(data)
                sent += len(data)
        target = int(seconds * rate) * bps
        if len(out) < target:
            out.extend(_pcm_hold_pad(last_frame, target - len(out)))
        elif len(out) > target:
            del out[target:]
    finally:
        close_loopback(handle)
    return bytes(out), info, ""

def list_audio_devices(force=False):
    """Names of DirectShow audio devices (microphones, Stereo Mix, virtual cables...).

    Results are cached for 30 seconds so we don't hammer the Windows audio stack
    every time the settings dialog opens or a refresh is clicked.
    """
    global _AUDIO_DEVICE_CACHE
    now = time.time()
    if (not force and _AUDIO_DEVICE_CACHE["devs"] is not None
            and (now - _AUDIO_DEVICE_CACHE["ts"]) < 30):
        return list(_AUDIO_DEVICE_CACHE["devs"])

    try:
        r = subprocess.run(
            ["ffmpeg", "-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=NOWIN, timeout=12,
        )
    except Exception:
        return list(_AUDIO_DEVICE_CACHE["devs"] or [])

    devs, section = [], None
    for line in r.stderr.splitlines():
        if "DirectShow video devices" in line:
            section = "video"
            continue
        if "DirectShow audio devices" in line:
            section = "audio"
            continue
        if "Alternative name" in line:
            continue
        m = re.search(r'"([^"]+)"\s*\((audio|video|none)\)', line)
        if m:
            if m.group(2) == "audio":
                devs.append(m.group(1))
            continue
        m = re.search(r'"([^"]+)"', line)
        if m and section == "audio":
            devs.append(m.group(1))

    result = list(dict.fromkeys(devs))
    _AUDIO_DEVICE_CACHE = {"devs": result, "ts": now}
    return result

