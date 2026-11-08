"""Start-screen background music: a smart-shuffled endless loop from a folder.

How it works: ffmpeg plays the "starting soon" picture and listens on a local port for
sound. A Python thread decodes the songs one at a time (any mix of mp3/m4a/wav/flac...)
and feeds them in real time, so different file formats never clash.
"""
import os
import random
import socket
import subprocess
import time

from .config import NOWIN

AUDIO_EXT = (".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus", ".wma")


def list_tracks(folder):
    """All audio files in the folder (and subfolders)."""
    out = []
    if folder and os.path.isdir(folder):
        for dirpath, _, files in os.walk(folder):
            for fn in files:
                if fn.lower().endswith(AUDIO_EXT):
                    out.append(os.path.join(dirpath, fn))
    return sorted(out)


def track_stream(tracks):
    """Endless smart shuffle: every song plays once per round in random order, and the
    same song never plays twice in a row, even across rounds."""
    last = None
    while True:
        batch = tracks[:]
        random.shuffle(batch)
        if last is not None and len(batch) > 1 and batch[0] == last:
            j = random.randrange(1, len(batch))
            batch[0], batch[j] = batch[j], batch[0]
        for t in batch:
            yield t
        last = batch[-1]


def build_music_cmd(intro, offset, port):
    """ffmpeg: loop the start-screen picture (no re-encode) and take sound from our feeder."""
    return ["ffmpeg", "-hide_banner", "-loglevel", "error",
            "-re", "-stream_loop", "-1", "-i", intro,
            "-f", "s16le", "-ar", "48000", "-ac", "2",
            "-i", f"tcp://127.0.0.1:{port}?listen=1",
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy", "-bsf:v", "h264_mp4toannexb",
            "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "128k", "-ar", "48000", "-ac", "2",
            "-output_ts_offset", f"{offset:.3f}", "-f", "mpegts", "pipe:1"]


def music_feed(port, folder, vol_text, proc, log):
    """Decode songs one by one and send 48 kHz stereo sound to ffmpeg in real time."""
    tracks = list_tracks(folder)
    if not tracks:
        log("music: no audio files found in the music folder")
        return
    try:
        vol = max(0.0, min(3.0, float(vol_text) / 100.0))
    except (TypeError, ValueError):
        vol = 0.4
    sock = None
    t_end = time.monotonic() + 30
    while time.monotonic() < t_end and proc.poll() is None:
        try:
            sock = socket.create_connection(("127.0.0.1", port), timeout=1)
            break
        except OSError:
            time.sleep(0.05)
    if sock is None:
        log("music: ffmpeg never opened its sound socket")
        return
    sock.settimeout(None)
    try:
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    except Exception:
        pass
    need = 480 * 4                      # 10 ms of 48 kHz stereo 16-bit
    next_t = time.monotonic()
    failures = 0
    log(f"music: {len(tracks)} song(s), volume {vol * 100:.0f}%, smart shuffle")
    try:
        for track in track_stream(tracks):
            if proc.poll() is not None:
                break
            dec = subprocess.Popen(
                ["ffmpeg", "-v", "error", "-i", track, "-vn", "-af", f"volume={vol:.2f}",
                 "-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1"],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
                creationflags=NOWIN)
            got_any = False
            try:
                while proc.poll() is None:
                    chunk = dec.stdout.read(need)
                    if not chunk:
                        break
                    if not got_any:
                        got_any = True
                        log("music: now playing " + os.path.basename(track))
                    if len(chunk) < need:
                        chunk += b"\x00" * (need - len(chunk))
                    sock.sendall(chunk)
                    next_t += 0.01
                    delay = next_t - time.monotonic()
                    if delay > 0.002:
                        time.sleep(min(delay, 0.02))
                    elif delay < -0.2:
                        next_t = time.monotonic()
            finally:
                try:
                    dec.kill()
                except Exception:
                    pass
            if got_any:
                failures = 0
            else:
                failures += 1
                log("music: couldn't read " + os.path.basename(track) + ", skipping")
                if failures > max(3, len(tracks)):
                    log("music: none of the songs could be read, giving up")
                    break
                time.sleep(0.2)
    except OSError:
        pass            # ffmpeg stopped (the start screen ended)
    finally:
        try:
            sock.close()
        except Exception:
            pass
