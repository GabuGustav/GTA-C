"""Built-in FFmpeg-based clip player for the UI."""
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import tkinter as tk

from .config import NOWIN
from .util import even, probe

try:
    import winsound
except Exception:
    winsound = None

class FFPlayer:
    """Built-in player that needs nothing but ffmpeg. ffmpeg decodes frames into a Tk label;
    audio plays through winsound on Windows. Meant for previewing and editing, not for
    perfect sync. Exposes a small VLC-like API (play/pause/get_time/set_time...)."""
    MAX_W, MAX_H, FPS, MAX_AUDIO_SECONDS = 800, 450, 20, 1200

    def __init__(self, widget, log):
        self.widget, self.log = widget, log
        widget.pack_propagate(False)
        self.label = tk.Label(widget, bg="black", bd=0)
        self.label.pack(fill="both", expand=True)
        self.path, self.length = None, 0.0
        self.pos, self.run_start, self.t0 = 0.0, 0.0, None
        self.playing, self.gen, self.proc = False, 0, None
        self.frame, self.fid, self.shown, self.img = None, 0, 0, None
        self.vol, self.n = 80, 0
        self.lo, self.hi, self.ended = 0.0, 0.0, False  # playback range; ended = reached hi
        self.tmp = tempfile.mkdtemp(prefix="yt_studio_play_")
        self._loop()

    def _size(self):
        w = min(max(160, self.widget.winfo_width() - 4), self.MAX_W)
        h = min(max(90, self.widget.winfo_height() - 4), self.MAX_H)
        return even(w), even(h)

    def load(self, path, start=0.0, autoplay=False, end=None):
        self.stop()
        self.path, self.pos, self.t0, self.ended = path, max(0.0, start), None, False
        try:
            self.length = probe(path)["dur"]
        except Exception as e:
            self.length = 0.0
            self.log(f"Can't read this video: {e}")
            return
        self.lo = self.pos
        self.hi = min(end, self.length) if end and end > self.pos + 0.1 else self.length
        self._still(self.pos)
        if autoplay:
            self.play()

    def _still(self, t):
        gen, path, (w, h) = self.gen, self.path, self._size()

        def work():
            try:
                r = subprocess.run(
                    ["ffmpeg", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", path,
                     "-frames:v", "1", "-vf",
                     f"scale={w}:{h}:force_original_aspect_ratio=decrease",
                     "-f", "image2pipe", "-vcodec", "ppm", "pipe:1"],
                    capture_output=True, creationflags=NOWIN)
                if r.stdout and gen == self.gen and not self.playing:
                    self.frame = r.stdout
                    self.fid += 1
            except Exception:
                pass

        threading.Thread(target=work, daemon=True).start()

    def play(self):
        if self.playing or not self.path:
            return
        if self.hi and self.pos >= self.hi - 0.2:
            self.pos = self.lo  # finished: play again from the start of the range
        self.gen += 1
        self.playing, self.t0, self.run_start, self.ended = True, None, self.pos, False
        end = self.hi if self.hi > self.pos + 0.1 else self.length
        threading.Thread(target=self._run, args=(self.gen, self.pos, self._size(), end),
                         daemon=True).start()

    def _run(self, gen, start, size, end):
        w, h = size
        path = self.path
        span = max(0.1, end - start)
        try:
            wav = None
            if winsound:
                self.n += 1
                wav = os.path.join(self.tmp, f"a{self.n}.wav")
                r = subprocess.run(
                    ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.3f}", "-i", path,
                     "-vn", "-t", f"{min(self.MAX_AUDIO_SECONDS, span):.3f}",
                     "-af", f"volume={self.vol / 100:.2f}",
                     "-ac", "1", "-ar", "32000", "-c:a", "pcm_s16le", wav],
                    capture_output=True, creationflags=NOWIN)
                if r.returncode != 0 or not os.path.exists(wav):
                    wav = None  # clip has no audio
            if gen != self.gen:
                return
            proc = subprocess.Popen(
                ["ffmpeg", "-loglevel", "error", "-re", "-ss", f"{start:.3f}", "-i", path, "-an",
                 "-t", f"{span:.3f}", "-vf", f"scale={w}:{h}:force_original_aspect_ratio=decrease,fps={self.FPS}",
                 "-f", "image2pipe", "-vcodec", "ppm", "pipe:1"],
                stdout=subprocess.PIPE, creationflags=NOWIN)
            self.proc = proc
            out, first = proc.stdout, True
            while gen == self.gen:
                l1 = out.readline()
                if not l1:
                    break
                l2, l3 = out.readline(), out.readline()
                fw, fh = (int(x) for x in l2.split())
                data = out.read(fw * fh * 3)
                if len(data) < fw * fh * 3:
                    break
                if first:
                    first = False
                    if wav and winsound:
                        winsound.PlaySound(wav, winsound.SND_FILENAME | winsound.SND_ASYNC)
                    self.t0 = time.time()
                self.frame = l1 + l2 + l3 + data
                self.fid += 1
        except Exception as e:
            if gen == self.gen:
                self.log(f"Playback problem: {e}")
        finally:
            if gen == self.gen:  # reached the natural end (not stopped or seeked)
                self.playing = False
                self.pos = self.hi or self.length
                self.ended = True

    def stop(self):
        self.gen += 1
        self.playing = False
        p, self.proc = self.proc, None
        if p:
            try:
                kill_tree(p)
            except Exception:
                pass
        if winsound:
            try:
                winsound.PlaySound(None, winsound.SND_PURGE)
            except Exception:
                pass

    def pause(self):
        if self.playing:
            self.pos = self.get_time() / 1000
            self.stop()
            self._still(self.pos)

    def is_playing(self):
        return self.playing

    def get_length(self):
        return int(self.length * 1000)

    def get_time(self):
        if self.playing and self.t0:
            t = self.run_start + time.time() - self.t0
            limit = self.hi or self.length or t
            return int(min(t, max(limit, self.run_start)) * 1000)
        return int(self.pos * 1000)

    def set_time(self, ms):
        was = self.playing
        self.stop()
        t = ms / 1000
        self.pos = max(0.0, min(t, self.length) if self.length else t)
        if was:
            self.play()
        else:
            self._still(self.pos)

    def audio_set_volume(self, v):
        self.vol = int(v)  # applies from the next play/seek

    def _loop(self):
        if self.frame is not None and self.fid != self.shown:
            self.shown = self.fid
            try:
                self.img = tk.PhotoImage(data=self.frame, format="PPM")
                self.label.configure(image=self.img)
            except Exception:
                pass
        self.widget.after(30, self._loop)

    def close(self):
        self.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)


