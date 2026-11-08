#!/usr/bin/env python3
"""YT Stream Studio — entry point.

Run from the project folder (the one that contains this file AND the
yt_stream_studio/ package directory):

  python yt_stream_studio.py
  or:  python -m yt_stream_studio

Package layout:
  yt_stream_studio/
    config.py, util.py, youtube_api.py, player.py, app.py
    capture/   (screen, wgc, audio, ffmpeg_cmd)
    diagnostics/
"""
import os
import sys

# Ensure the project folder is on sys.path so "import yt_stream_studio" works
# even when launched by a shortcut or from another working directory.
_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

if __name__ == "__main__":
    from yt_stream_studio.__main__ import main
    main()
