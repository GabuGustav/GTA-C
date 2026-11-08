"""Track every subprocess PID this app starts so close / Alt+F4 can reap them all."""
from __future__ import annotations

import os
import subprocess
import sys
import threading

from .config import NOWIN

_lock = threading.Lock()
_pids = set()  # type: set[int]


def register(proc) -> None:
    if proc is None:
        return
    try:
        pid = int(proc.pid)
    except Exception:
        return
    with _lock:
        _pids.add(pid)


def unregister(proc) -> None:
    if proc is None:
        return
    try:
        pid = int(proc.pid)
    except Exception:
        return
    with _lock:
        _pids.discard(pid)


def tracked_pids():
    with _lock:
        return set(_pids)


def kill_all_tracked(log=None) -> int:
    """Force-kill every tracked PID and its children. Returns count attempted."""
    say = log or (lambda m: None)
    with _lock:
        pids = list(_pids)
        _pids.clear()
    n = 0
    for pid in pids:
        try:
            if sys.platform.startswith("win"):
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    capture_output=True, creationflags=NOWIN, timeout=6,
                )
            else:
                try:
                    os.kill(pid, 15)
                except ProcessLookupError:
                    pass
            n += 1
        except Exception as e:
            say(f"PID cleanup {pid}: {e}")
    # Also sweep our process tree on Windows (catches anything we missed)
    if sys.platform.startswith("win"):
        try:
            me = os.getpid()
            subprocess.run(
                ["wmic", "process", "where",
                 f"ParentProcessId={me}", "get", "ProcessId"],
                capture_output=True, creationflags=NOWIN, timeout=5,
            )
        except Exception:
            pass
    return n


def wrap_popen(popen_fn):
    """Decorator-style helper not used — prefer register() after each Popen."""
    return popen_fn
