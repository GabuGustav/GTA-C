"""Screen size probe and QSV alignment helpers."""
import re
import subprocess

from ..config import NOWIN

NO_AUDIO = "(none - silent audio)"
NO_APP_AUDIO = "(none)"
WGC_MONITOR = "(Entire screen)"
BSEL_DEFAULT = "Broadcast: new one each time"

# Primary path — WGC only. Nothing else is used unless the user explicitly picks
# an Experimental method in Screen settings.
DEFAULT_SCREEN_METHOD = "WGC + QuickSync (Game Bar–class capture)"

SCREEN_METHODS = {
    # —— Primary (default) ——
    DEFAULT_SCREEN_METHOD: ["wgc_qsv"],
    "WGC + CPU x264": ["wgc_x264"],
    # —— Experimental (never auto-selected; user must pick deliberately) ——
    "Experimental: Auto (legacy fallbacks)": [
        "wgc_qsv", "wgc_x264", "gpu_native", "ddagrab_qsv",
        "gdigrab_qsv", "ddagrab_x264", "gdigrab_x264",
    ],
    "Experimental: GPU native size + QuickSync": ["gpu_native"],
    "Experimental: ddagrab + QuickSync (scale on CPU)": ["ddagrab_qsv"],
    "Experimental: gdigrab + QuickSync": ["gdigrab_qsv"],
    "Experimental: ddagrab + CPU (x264)": ["ddagrab_x264"],
    "Experimental: gdigrab + CPU (x264)": ["gdigrab_x264"],
    "Experimental: Scaled + QuickSync (CPU scale)": ["gpu"],
    "Experimental: Scaled + QuickSync (16-aligned)": ["gpu_fixed"],
    "Experimental: Scaled + CPU x264": ["gpu_x264"],
}

# Labels shown in the Method dropdown (primary first, then experimental).
SCREEN_METHOD_CHOICES = list(SCREEN_METHODS.keys())

# Map old saved labels → current keys (so existing configs don't break).
SCREEN_METHOD_ALIASES = {
    "Auto (best first, falls back)": "Experimental: Auto (legacy fallbacks)",
    "GPU native size (no scaling) + QuickSync": "Experimental: GPU native size + QuickSync",
    "ddagrab + QuickSync (scale on CPU)": "Experimental: ddagrab + QuickSync (scale on CPU)",
    "gdigrab + QuickSync": "Experimental: gdigrab + QuickSync",
    "ddagrab + CPU (x264)": "Experimental: ddagrab + CPU (x264)",
    "gdigrab + CPU (x264, most compatible)": "Experimental: gdigrab + CPU (x264)",
    "Scaled + QuickSync (CPU scale, QSV encode)": "Experimental: Scaled + QuickSync (CPU scale)",
    "Scaled + QuickSync (exact 16-aligned size)": "Experimental: Scaled + QuickSync (16-aligned)",
    "Scaled + CPU x264": "Experimental: Scaled + CPU x264",
}

TIER_NAMES = {
    "wgc_qsv": "WGC + QuickSync",
    "wgc_x264": "WGC + CPU x264",
    "gpu_native": "GPU native size (no scaling) + QuickSync",
    "gpu": "Scaled + QuickSync (CPU scale, QSV encode)",
    "gpu_fixed": "Scaled + QuickSync (exact 16-aligned size)",
    "gpu_x264": "Scaled + CPU x264",
    "ddagrab_qsv": "ddagrab + QuickSync",
    "gdigrab_qsv": "gdigrab + QuickSync",
    "ddagrab_x264": "ddagrab + CPU x264",
    "gdigrab_x264": "gdigrab + CPU x264",
}


def normalize_screen_method(label: str) -> str:
    """Resolve saved / legacy method labels to a key in SCREEN_METHODS."""
    if not label:
        return DEFAULT_SCREEN_METHOD
    if label in SCREEN_METHODS:
        return label
    if label in SCREEN_METHOD_ALIASES:
        return SCREEN_METHOD_ALIASES[label]
    # Unknown → force WGC primary
    return DEFAULT_SCREEN_METHOD

_SCREEN_SIZE = {}

def probe_screen_size():
    """Pixel size ddagrab captures (so GPU scaling gets exact numbers instead of an
    expression ffmpeg has to evaluate). Read from ffprobe on ddagrab itself, which avoids
    Windows display-scaling confusion. None if it can't be read."""
    if "v" in _SCREEN_SIZE:
        return _SCREEN_SIZE["v"]
    size = None
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-f", "lavfi", "-i", "ddagrab=framerate=2",
             "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0"],
            capture_output=True, text=True, timeout=12, creationflags=NOWIN)
        m = re.search(r"(\d{3,5}),(\d{3,5})", r.stdout or "")
        if m:
            size = (int(m.group(1)), int(m.group(2)))
    except Exception:
        pass
    _SCREEN_SIZE["v"] = size
    return size


def qsv_align(n, multiple=16):
    """Round dimension down to a multiple of `multiple` (default 16).

    Intel QSV on Gen9/Gen9.5 (UHD 620) rejects vpp_qsv surfaces whose width/height
    are not macroblock-aligned. Even widths like 854 (480p 16:9) pass the even-pixel
    check used for yuv420p but still trigger E_INVALIDARG (0x80070057) in the
    driver's texture allocator. 16 is the safe baseline; 32 is stricter if needed.
    """
    n = int(n)
    if n < multiple:
        return multiple
    return n - (n % multiple)


def qsv_scale_size(src_w, src_h, target_h):
    """Return (width, height) for vpp_qsv, both multiples of 16, preserving AR.

    Prefer rounding width to nearest multiple of 16 (not always floor) so 854→848
    rather than jumping further from the true aspect ratio when near the boundary.
    """
    target_h = qsv_align(target_h, 16)
    if not src_w or not src_h:
        return None, target_h
    raw_w = target_h * float(src_w) / float(src_h)
    # nearest multiple of 16, at least 16
    w = max(16, int(round(raw_w / 16.0)) * 16)
    return w, target_h

