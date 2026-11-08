#!/usr/bin/env python3
"""One-click fixes and features for yt_stream_studio/app.py.

Run from the project folder (the one that has yt_stream_studio.py):
    python apply_patches.py

It makes a backup (app.py.bak), applies each change only if it is not already there,
copies music.py into the package if it sits next to this file, and tells you what it did.
Safe to run more than once.
"""
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.join(ROOT, "yt_stream_studio")
TARGET = os.path.join(PKG, "app.py")

PLAY_LOOP_OLD = (
    '        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-re", "-stream_loop", "-1",\n'
    '               "-i", path, "-c", "copy", "-bsf:v", "h264_mp4toannexb",\n'
    '               "-output_ts_offset", f"{offset:.3f}", "-f", "mpegts", "pipe:1"]\n'
    '        t0 = time.time()\n'
    '        p = self.cur = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=self.sender.stdin,\n'
    '                                        creationflags=NOWIN)\n')

PLAY_LOOP_NEW = (
    '        cmd, music_port = None, None\n'
    '        if music:\n'
    '            try:\n'
    '                if not list_tracks(self.music_dir.get()):\n'
    '                    raise ValueError("no audio files found in the music folder")\n'
    '                music_port = free_port()\n'
    '                cmd = build_music_cmd(path, offset, music_port)\n'
    '            except Exception as e:\n'
    '                self.log(f"Music unavailable ({e}); playing the start screen silent.")\n'
    '                cmd, music_port = None, None\n'
    '        if cmd is None:\n'
    '            cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-re", "-stream_loop", "-1",\n'
    '                   "-i", path, "-c", "copy", "-bsf:v", "h264_mp4toannexb",\n'
    '                   "-output_ts_offset", f"{offset:.3f}", "-f", "mpegts", "pipe:1"]\n'
    '        t0 = time.time()\n'
    '        p = self.cur = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=self.sender.stdin,\n'
    '                                        creationflags=NOWIN)\n'
    '        if music_port:\n'
    '            threading.Thread(target=music_feed, args=(\n'
    '                music_port, self.music_dir.get(), self.music_vol.get(), p, self.log),\n'
    '                daemon=True).start()\n')

PATCHES = [
    ("typo in the config import (the app would not even start)",
     "CLIENT_PATsH,",
     "CLIENT_PATH,"),

    ("test captures must NOT replace the live YouTube sender",
     "            self.sender = p\n"
     "            self.screen_progress = {}\n",
     "            if test_seconds is None:\n"
     "                self.sender = p\n"
     "            self.screen_progress = {}\n"),

    ("recreate the temp folder before the fallback screen is built",
     '            intro = os.path.join(self.tmp, "intro.mp4")\n',
     '            os.makedirs(self.tmp, exist_ok=True)\n'
     '            intro = os.path.join(self.tmp, "intro.mp4")\n'),

    ("a mostly-black test capture is small but healthy",
     "            if size < 50_000:\n",
     "            if size < 10_000:\n"),

    # ---------------- start-screen music
    ("music: import",
     "from .player import FFPlayer\n",
     "from .player import FFPlayer\n"
     "from .music import list_tracks, build_music_cmd, music_feed\n"),

    ("music: settings variables",
     '        self.loop_var = tk.BooleanVar(value=c.get("loop", False))\n',
     '        self.loop_var = tk.BooleanVar(value=c.get("loop", False))\n'
     '        self.music_on = tk.BooleanVar(value=c.get("music_on", False))\n'
     '        self.music_dir = tk.StringVar(value=c.get("music_dir", ""))\n'
     '        self.music_vol = tk.StringVar(value=str(c.get("music_vol", 40)))\n'),

    ("music: save settings",
     '            "sc_last_tier": self.last_tier})',
     '            "sc_last_tier": self.last_tier,\n'
     '            "music_on": self.music_on.get(), "music_dir": self.music_dir.get(),\n'
     '            "music_vol": self.music_vol.get()})'),

    ("music: settings row on the YouTube bar",
     '        r2 = ttk.Frame(sf)\n'
     '        r2.pack(fill="x", padx=6, pady=(3, 6))\n',
     '        rm = ttk.Frame(sf)\n'
     '        rm.pack(fill="x", padx=6, pady=3)\n'
     '        ttk.Checkbutton(rm, text="Start-screen music", variable=self.music_on).pack(side="left")\n'
     '        ttk.Entry(rm, textvariable=self.music_dir, width=50).pack(side="left", padx=6)\n'
     '        ttk.Button(rm, text="Browse", command=self.browse_music).pack(side="left")\n'
     '        ttk.Label(rm, text="Vol %").pack(side="left", padx=(10, 3))\n'
     '        ttk.Entry(rm, textvariable=self.music_vol, width=5).pack(side="left")\n'
     '        r2 = ttk.Frame(sf)\n'
     '        r2.pack(fill="x", padx=6, pady=(3, 6))\n'),

    ("music: browse button",
     "    def refresh_library(self):\n",
     "    def browse_music(self):\n"
     "        d = filedialog.askdirectory(initialdir=self.music_dir.get() or None)\n"
     "        if d:\n"
     "            self.music_dir.set(d)\n"
     "\n"
     "    def refresh_library(self):\n"),

    ("music: play_loop accepts music",
     "    def play_loop(self, path, offset, until, stop):",
     "    def play_loop(self, path, offset, until, stop, music=False):"),

    ("music: play_loop plays songs under the start screen",
     PLAY_LOOP_OLD, PLAY_LOOP_NEW),

    ("test capture saves your current audio/mic choices first",
     '        out_dir = log_dir("screen_test")\n',
     '        self.save_settings(self.key_var.get())   # the audio feeder reads the saved settings\n'
     '        out_dir = log_dir("screen_test")\n'),

    ("music: only the start screen gets music",
     "played = self.play_loop(intro, offset, self.start_evt.is_set, stop)",
     "played = self.play_loop(intro, offset, self.start_evt.is_set, stop,\n"
     "                                            music=self.music_on.get())"),
]


def main():
    if not os.path.exists(TARGET):
        print(f"Can't find {TARGET}. Run this from the project folder.")
        sys.exit(1)

    # music.py: copy into the package if it is sitting next to this script
    src_music, dst_music = os.path.join(ROOT, "music.py"), os.path.join(PKG, "music.py")
    if os.path.exists(src_music) and not os.path.exists(dst_music):
        shutil.copyfile(src_music, dst_music)
        print("[applied]      copied music.py into yt_stream_studio/")
    elif not os.path.exists(dst_music):
        print("[MISSING]      yt_stream_studio/music.py not found. Put music.py next to this "
              "script (or into yt_stream_studio/) and run again.")

    with open(TARGET, "rb") as f:
        raw = f.read()
    text = raw.decode("utf-8")
    crlf = "\r\n" in text
    if crlf:
        text = text.replace("\r\n", "\n")

    changed = 0
    for why, old, new in PATCHES:
        if new in text:
            print(f"[already done] {why}")
            continue
        n = text.count(old)
        if n != 1:
            print(f"[SKIPPED]      {why}  (found {n} matches, expected 1)")
            continue
        text = text.replace(old, new)
        changed += 1
        print(f"[applied]      {why}")

    if changed:
        shutil.copyfile(TARGET, TARGET + ".bak")
        if crlf:
            text = text.replace("\n", "\r\n")
        with open(TARGET, "wb") as f:
            f.write(text.encode("utf-8"))
        print(f"\nDone. {changed} change(s) applied. Backup: {TARGET}.bak")
    else:
        print("\nNothing to change.")


if __name__ == "__main__":
    main()
