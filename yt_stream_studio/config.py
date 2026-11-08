"""Paths, constants, and stream mode labels."""
import os
import sys
import subprocess

HOME = os.path.expanduser("~")
# Prefer the user's Videos folder; fall back to home if it doesn't exist yet.
_videos = os.path.join(HOME, "Videos")
DEFAULT_FOLDER = _videos if os.path.isdir(_videos) else HOME

# Project / install root.
# - Dev: folder that contains yt_stream_studio/ (and yt_stream_studio.py)
# - Frozen (PyInstaller): folder that contains the .exe (one-folder layout)
if getattr(sys, "frozen", False):
    APP_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    _PKG_DIR = os.path.dirname(os.path.abspath(__file__))
    APP_DIR = (
        os.path.dirname(_PKG_DIR)
        if os.path.basename(_PKG_DIR) == "yt_stream_studio"
        else _PKG_DIR
    )

# Bundled start-screen music (shipped next to the app / in the project root)
DEFAULT_MUSIC_DIR = os.path.join(APP_DIR, "Start screen music")
if not os.path.isdir(DEFAULT_MUSIC_DIR):
    DEFAULT_MUSIC_DIR = ""

CONFIG_PATH = os.path.join(HOME, ".yt_stream_studio.json")
TOKEN_PATH = os.path.join(HOME, ".yt_stream_studio_token.json")
CLIENT_PATH = os.path.join(HOME, ".yt_stream_studio_client.json")
DEFAULT_INGEST = "rtmp://a.rtmp.youtube.com/live2/"
VIDEO_EXT = (".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v")
FILLER_SECONDS = 10
SEAM_SECONDS = 1.0
NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)
BELOW_NORMAL = 0x00004000 if sys.platform.startswith("win") else 0

DSHOW_MODE = "DirectShow — Recording Device"
SILENT_MODE = "No Audio / Silent Audio"
LOOPBACK_MODE = "System audio (WASAPI loopback, like Game Bar)"
MIX_MODE = "System + Mic (WASAPI loopback + mic device)"

YT_API = "https://www.googleapis.com/youtube/v3/"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/youtube"

DEFAULT_FX = {
    "speed": 1.0, "volume": 100.0, "fade_in": 0.0, "fade_out": 0.0,
    "rotate": 0, "flip_h": False, "flip_v": False,
    "brightness": 0, "contrast": 100, "saturation": 100,
    "text": "", "text_pos": "bottom",
}
DEFAULT_AUDIO = {"mode": "original", "track": "first", "file": "", "file_vol": 100.0}

# ---------------------------------------------------------------- logs (next to the app, categorized)
def logs_root():
    """ProjectFolder/logs/ — same tree as the app, not scattered under %USERPROFILE%."""
    root = os.path.join(APP_DIR, "logs")
    try:
        os.makedirs(root, exist_ok=True)
    except OSError:
        pass
    return root


def log_dir(category):
    """logs/<category>/ e.g. benchmark, screen_test, audio_test, reports."""
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in (category or "general"))
    d = os.path.join(logs_root(), safe)
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        pass
    return d
