"""Encode standby — warm the encoder with minimal risk to the UI.

Design goals:
  - Never block the Tk UI thread (spawn/kill always on worker threads).
  - Prefer a pure software test pattern for warm-up so desktop capture (ddagrab /
    gdigrab) cannot hang the GPU or freeze the window on launch.
  - Fail soft: if FFmpeg exits, go to state "off" and leave the app usable.
"""
from __future__ import annotations

import subprocess
import sys
import threading
import time

from .config import NOWIN, BELOW_NORMAL
from .util import kill_tree
from . import proc_registry

STANDBY_W = 320
STANDBY_H = 180
STANDBY_FPS = 5
STANDBY_KBPS = 300
PRESET_KBPS_CAP = 1500


def _prefer_qsv(method_label: str) -> bool:
    m = (method_label or "").lower()
    if "cpu" in m or "x264" in m:
        return False
    return True


def _creation_flags():
    flags = NOWIN
    if BELOW_NORMAL and sys.platform.startswith("win"):
        flags |= BELOW_NORMAL
    return flags


def build_testsrc_cmd(prefer_qsv: bool) -> list:
    """Safe warm-up: synthetic frames only — no desktop capture."""
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi",
        "-i", f"testsrc2=size={STANDBY_W}x{STANDBY_H}:rate={STANDBY_FPS}",
        "-an",
        "-fps_mode", "cfr", "-r", str(STANDBY_FPS),
    ]
    if prefer_qsv and sys.platform.startswith("win"):
        cmd += [
            "-c:v", "h264_qsv", "-preset", "veryfast", "-look_ahead", "0",
            "-b:v", f"{STANDBY_KBPS}k", "-maxrate", f"{STANDBY_KBPS}k",
            "-bufsize", f"{STANDBY_KBPS}k",
            "-g", str(STANDBY_FPS * 2), "-bf", "0",
        ]
    else:
        cmd += [
            "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
            "-threads", "1", "-b:v", f"{STANDBY_KBPS}k",
            "-g", str(STANDBY_FPS * 2), "-bf", "0", "-pix_fmt", "yuv420p",
        ]
    cmd += ["-f", "null", "-"]
    return cmd


# Back-compat name used by smoke tests
def build_trickle_cmd(prefer_qsv: bool, use_desktop: bool = False) -> list:
    return build_testsrc_cmd(prefer_qsv)


def build_preset_testsrc_cmd(settings: dict, method_label: str) -> list:
    """Warm at user geometry using testsrc (still no desktop) → null."""
    prefer = _prefer_qsv(method_label)
    try:
        height = int(settings.get("height") or 720) or 720
    except Exception:
        height = 720
    try:
        fps = max(15, min(60, int(settings.get("fps") or 30)))
    except Exception:
        fps = 30
    try:
        kbps = int(settings.get("kbps") or 3500)
    except Exception:
        kbps = 3500
    kbps = max(400, min(PRESET_KBPS_CAP, kbps // 2 if kbps > 800 else kbps))
    width = int(round(height * 16 / 9))
    width -= width % 2
    height -= height % 2

    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi",
        "-i", f"testsrc2=size={width}x{height}:rate={fps}",
        "-an", "-fps_mode", "cfr", "-r", str(fps),
    ]
    if prefer and sys.platform.startswith("win"):
        cmd += [
            "-c:v", "h264_qsv", "-preset", "veryfast", "-look_ahead", "0",
            "-b:v", f"{kbps}k", "-maxrate", f"{kbps}k", "-bufsize", f"{kbps}k",
            "-g", str(fps * 2), "-bf", "0",
        ]
    else:
        cmd += [
            "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
            "-threads", "2", "-b:v", f"{kbps}k",
            "-g", str(fps * 2), "-bf", "0", "-pix_fmt", "yuv420p",
        ]
    cmd += ["-f", "null", "-"]
    return cmd


class StandbyEngine:
    def __init__(self, log=None, on_state=None):
        self._log = log or (lambda m: None)
        self._on_state = on_state
        self._proc = None
        self._lock = threading.Lock()
        self._state = "off"  # off | activating | warming | ready
        self._method = ""
        self._settings = None
        self._stop_req = threading.Event()
        self._worker = None

    @property
    def state(self) -> str:
        return self._state

    @property
    def active(self) -> bool:
        return self._state in ("activating", "warming", "ready")

    @property
    def ready(self) -> bool:
        return (
            self._state == "ready"
            and self._proc is not None
            and self._proc.poll() is None
        )

    def _set_state(self, st: str):
        self._state = st
        try:
            if self._on_state:
                self._on_state(st)
        except Exception:
            pass

    def _spawn(self, cmd, wait_s: float = 0.8):
        try:
            p = subprocess.Popen(
                cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=_creation_flags(),
            )
        except Exception:
            return None
        proc_registry.register(p)
        deadline = time.monotonic() + wait_s
        while time.monotonic() < deadline:
            if self._stop_req.is_set():
                self._kill_proc(p)
                return None
            if p.poll() is not None:
                proc_registry.unregister(p)
                return None
            time.sleep(0.1)
        if p.poll() is not None:
            proc_registry.unregister(p)
            return None
        return p

    def _kill_proc(self, p):
        if p is None:
            return
        try:
            kill_tree(p)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass
        try:
            proc_registry.unregister(p)
        except Exception:
            pass

    def _stop_unlocked(self):
        p = self._proc
        self._proc = None
        self._kill_proc(p)

    def start(self, method_label: str = "", settings=None, background: bool = True):
        """Activate → warm (testsrc) → ready (preset-sized testsrc). No desktop capture."""
        self._method = method_label or ""
        self._settings = dict(settings or {})
        self._stop_req.clear()

        def work():
            with self._lock:
                if self._state in ("activating", "warming"):
                    return
                self._stop_unlocked()
                self._set_state("activating")
            self._log("Standby: activating (safe test-pattern warm-up)…")

            prefer = _prefer_qsv(self._method)
            # x264 first (most reliable), then QSV if preferred
            attempts = [build_testsrc_cmd(False)]
            if prefer:
                attempts.insert(0, build_testsrc_cmd(True))

            proc = None
            for cmd in attempts:
                if self._stop_req.is_set():
                    self._set_state("off")
                    return
                proc = self._spawn(cmd, wait_s=0.9)
                if proc is not None:
                    break

            if proc is None:
                with self._lock:
                    self._set_state("off")
                self._log(
                    "Standby could not start (ffmpeg test-pattern encode failed). "
                    "App stays usable — Go Live works without standby."
                )
                return

            with self._lock:
                self._proc = proc
                self._set_state("warming")
            self._log(
                f"Standby: warming (testsrc {STANDBY_W}x{STANDBY_H}@{STANDBY_FPS} → null)…"
            )

            for _ in range(6):
                if self._stop_req.is_set():
                    with self._lock:
                        self._stop_unlocked()
                        self._set_state("off")
                    return
                if proc.poll() is not None:
                    with self._lock:
                        self._proc = None
                        self._set_state("off")
                    self._log(
                        "Standby process exited during warm-up. "
                        "Encoder warm-up skipped — you can still Go Live."
                    )
                    return
                time.sleep(0.25)

            if self._stop_req.is_set():
                with self._lock:
                    self._stop_unlocked()
                    self._set_state("off")
                return

            self._log("Standby: matching preset size (test pattern, not live)…")
            with self._lock:
                self._stop_unlocked()

            preset_attempts = [
                build_preset_testsrc_cmd(self._settings or {}, self._method),
                build_testsrc_cmd(False),
            ]
            proc2 = None
            for cmd in preset_attempts:
                if self._stop_req.is_set():
                    self._set_state("off")
                    return
                proc2 = self._spawn(cmd, wait_s=0.9)
                if proc2 is not None:
                    break

            if proc2 is None:
                self._set_state("off")
                self._log("Standby could not reach ready state.")
                return

            with self._lock:
                self._proc = proc2
                self._set_state("ready")
            self._log("Standby READY (encoder warm via test pattern). Safe to Go Live.")

            try:
                self._warm_audio_modules()
            except Exception:
                pass

            while not self._stop_req.is_set():
                p = self._proc
                if p is None or p.poll() is not None:
                    with self._lock:
                        if self._proc is p:
                            self._proc = None
                            self._set_state("off")
                    self._log("Standby ended (process exited).")
                    return
                time.sleep(1.0)

        if background:
            t = threading.Thread(target=work, daemon=True, name="standby-worker")
            self._worker = t
            t.start()
        else:
            work()

    def _warm_audio_modules(self):
        if not sys.platform.startswith("win"):
            return
        try:
            from .capture.audio import probe_loopback, open_loopback, close_loopback
            info, _err = probe_loopback()
            if not info:
                return
            h = open_loopback(info)
            time.sleep(0.3)
            close_loopback(h)
            self._log("Standby: audio path touched (loopback).")
        except Exception:
            pass

    def prepare_handoff(self, settings: dict, method_label: str = "", timeout: float = 8.0) -> bool:
        self._settings = dict(settings or {})
        self._method = method_label or self._method
        if self.ready:
            return True
        if self._state == "off":
            self.start(method_label=self._method, settings=self._settings, background=True)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.ready:
                return True
            if self._state == "off":
                return False
            time.sleep(0.2)
        return self.ready

    def stop(self, background: bool = True, reason: str = ""):
        self._stop_req.set()

        def work():
            with self._lock:
                self._stop_unlocked()
                self._set_state("off")
            self._log(reason or "Standby OFF.")

        if background:
            threading.Thread(target=work, daemon=True, name="standby-stop").start()
        else:
            work()

    def status_text(self) -> str:
        return {
            "off": "",
            "activating": "STANDBY: activating…",
            "warming": "STANDBY: warming…",
            "ready": "STANDBY ready (encoder warm)",
        }.get(self._state, "")
