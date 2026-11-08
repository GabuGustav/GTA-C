"""Single-instance guard (Windows named mutex; lockfile elsewhere)."""
from __future__ import annotations

import atexit
import os
import sys
import tempfile

_mutex = None
_lock_path = None


def try_acquire(app_name: str = "YTStreamStudio") -> bool:
    """Return True if this process is the only instance, False if another is running."""
    global _mutex, _lock_path
    if sys.platform.startswith("win"):
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            # CreateMutexW — if GetLastError == ERROR_ALREADY_EXISTS, another instance owns it.
            handle = kernel32.CreateMutexW(None, False, f"Local\\{app_name}_SingleInstance")
            err = kernel32.GetLastError()
            if not handle:
                return True  # fail open
            _mutex = handle
            ERROR_ALREADY_EXISTS = 183
            if err == ERROR_ALREADY_EXISTS:
                return False
            atexit.register(release)
            return True
        except Exception:
            return True
    # Non-Windows: exclusive lock file
    _lock_path = os.path.join(tempfile.gettempdir(), f"{app_name}.lock")
    try:
        fd = os.open(_lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode("ascii", "replace"))
        os.close(fd)
        atexit.register(release)
        return True
    except FileExistsError:
        # Stale?
        try:
            with open(_lock_path, "r", encoding="utf-8") as f:
                pid = int(f.read().strip() or "0")
            os.kill(pid, 0)
            return False
        except Exception:
            try:
                os.remove(_lock_path)
            except OSError:
                pass
            return try_acquire(app_name)
    except Exception:
        return True


def release():
    global _mutex, _lock_path
    if _mutex is not None and sys.platform.startswith("win"):
        try:
            import ctypes
            ctypes.windll.kernel32.CloseHandle(_mutex)
        except Exception:
            pass
        _mutex = None
    if _lock_path and os.path.isfile(_lock_path):
        try:
            os.remove(_lock_path)
        except OSError:
            pass
        _lock_path = None
