"""Long-stream safety net: bring the screen capture back if it dies, and shout when
YouTube says the stream is struggling."""
import time

from .capture import SCREEN_METHODS
from .util import kill_tree

try:
    import winsound
except Exception:
    winsound = None

BAD = ("bad", "noData", "revoked")
TITLE_OK = "YT Stream Studio  //  net.ops"


def restart_screen(app, url, s, dead_proc, max_tries=3):
    """The screen ffmpeg died mid-stream. Start a fresh one into the SAME YouTube address
    (same broadcast), up to max_tries times. Returns the new process, or None if it
    couldn't be brought back (or you pressed Stop)."""
    try:
        ev = getattr(dead_proc, "_wgc_stop", None)
        if ev is not None:
            ev.set()                      # stop the old frame pump
    except Exception:
        pass
    try:
        kill_tree(dead_proc)              # clear anything it left behind
    except Exception:
        pass
    for attempt in range(1, max_tries + 1):
        if app.stop_evt.is_set():
            return None
        app.log(f"Auto-recover: restarting screen capture (attempt {attempt}/{max_tries})...")
        app.set_status("LIVE: recovering capture...")
        time.sleep(2.0 if attempt == 1 else 5.0)
        if app.stop_evt.is_set():
            return None
        proc = None
        try:
            proc, _tier = app.start_screen(
                s, SCREEN_METHODS[s["method"]], url, app.stop_evt,
                audio_mode=s.get("audio_mode"))
        except Exception as e:
            app.log(f"Auto-recover: attempt {attempt} failed ({e})")
        if proc is not None:
            app.log("Auto-recover: screen capture is back. Viewers may have seen a short "
                    "freeze or buffering.")
            app.set_status("Streaming screen (recovered)")
            return proc
    app.log(f"Auto-recover: gave up after {max_tries} attempts.")
    return None


def health_alert(app, h):
    """Called whenever YouTube's view of the stream changes. A bad status gets a beep, a
    warning in the status bar and window title; the all-clear is announced too.

    Returns the health status string (or None) so the caller can drive auto-actions.
    """
    status = (h or {}).get("status")
    prev = getattr(app, "_health_prev", None)
    app._health_prev = status
    if status in BAD:
        app.set_status("LIVE: WARNING - YouTube says viewers may be buffering")
        app.log("ALERT: YouTube reports the stream as '%s'. Check your connection and the "
                "Stats lines above." % status)
        app.call_ui(lambda: app.root.title("YT Stream Studio  //  !! STREAM WARNING !!"))
        if winsound:
            try:
                winsound.MessageBeep(0x30)        # exclamation sound
            except Exception:
                pass
    elif status in ("good", "ok") and prev in BAD:
        app.set_status("LIVE: YouTube health is good again")
        app.log("YouTube health is good again.")
        app.call_ui(lambda: app.root.title(TITLE_OK))
    return status
