"""Build FFmpeg command lines for live screen encode."""
import subprocess
import sys

from ..config import (
    NOWIN, LOOPBACK_MODE, MIX_MODE, DSHOW_MODE, SILENT_MODE, BELOW_NORMAL,
)
from .screen import NO_AUDIO, probe_screen_size, qsv_scale_size
from .wgc import probe_wgc_size

def build_screen_cmd(s, tier, target, test_seconds=None, audio_mode=None,
                     wgc_size=None, audio_tcp=None):
    """ffmpeg command that captures the screen (+ optional audio device) and encodes once.
    s: settings dict (height, fps, kbps, audio). target: rtmp url, or a file when testing.
    audio_mode: DSHOW_MODE or SILENT_MODE. Defaults to s.get("audio_mode", DSHOW_MODE).
    wgc_size: (w, h) for rawvideo input when tier is wgc_*; required for those tiers."""
    fps, kbps, height = int(s["fps"]), int(s["kbps"]), int(s["height"])
    # Seconds to delay video (from UI av_offset_ms / process-audio path)
    vdelay = float(s.get("_av_video_delay") or 0)
    is_wgc = tier.startswith("wgc")
    cap = ("wgc" if is_wgc else
           "gdigrab" if tier.startswith("gdigrab") else "ddagrab")
    enc = "x264" if tier.endswith("x264") else "qsv"
    pure_gpu = tier in ("gpu", "gpu_native", "gpu_fixed", "gpu_x264")
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-stats_period", "1",
           "-progress", "pipe:2", "-y"]
    # Give QSV/D3D11 a larger surface pool on pure-GPU graphs. Under load the default
    # pool can run dry and surface as intermittent 0x80070057 (E_INVALIDARG) on UHD 620.
    if pure_gpu:
        cmd += ["-extra_hw_frames", "64"]

    # ---- Video input (always index 0)
    if is_wgc:
        # Raw BGRA frames from the WGC producer thread on stdin (pipe:0).
        w, h = wgc_size or probe_wgc_size()
        # NO wall-clock stamping here: pipe reads arrive in bursts, and stamping each frame
        # with its read time made ffmpeg see irregular gaps and duplicate most frames
        # (24 fps dropped to ~6). Frames get exact n/fps timestamps instead.
        # Slight video delay when process-loopback audio is in use (set below via
        # s["_av_video_delay"]). Audio path is ~0.2–0.5s behind game; delaying video
        # matches lips without stretching audio again.
        cmd += ["-thread_queue_size", "512",
                "-f", "rawvideo", "-pix_fmt", "bgra",
                "-s", f"{int(w)}x{int(h)}", "-framerate", str(fps),
                "-i", "pipe:0"]
        video_src = "[0:v]"
    elif cap == "gdigrab":
        # Let gdigrab timestamp frames from its configured capture rate. Wall-clock
        # timestamps can jitter on Windows and make CFR output duplicate many frames.
        # A deep thread queue lets the capture thread keep running while the encoder
        # is briefly busy, instead of blocking and losing frames.
        cmd += ["-thread_queue_size", "512", "-f", "gdigrab", "-framerate", str(fps),
                "-draw_mouse", "1", "-i", "desktop"]
        video_src = "[0:v]"
    else:
        # ddagrab must be opened as a lavfi source
        cmd += ["-thread_queue_size", "512", "-f", "lavfi", "-i",
                f"ddagrab=output_idx=0:framerate={fps}:draw_mouse=1"]
        video_src = "[0:v]"

    # ---- Audio input (index 1 = system/primary; index 2 = mic when MIX_MODE)
    use_wall = False
    audio_mode = audio_mode or s.get("audio_mode", DSHOW_MODE)
    mic_dev = (s.get("mic") or s.get("audio") or "").strip()
    if audio_mode == DSHOW_MODE:
        dev = (s.get("audio") or "").strip()
        if dev and dev != NO_AUDIO:
            # Virtual devices (Voicemeeter / Stereo Mix) can stop delivering, then dump.
            use_wall = not is_wgc
            cmd += (["-use_wallclock_as_timestamps", "1"] if use_wall else []) + [
                    "-f", "dshow", "-rtbufsize", "64M",
                    "-audio_buffer_size", "100",
                    "-thread_queue_size", "512", "-i", f"audio={dev}"]
        else:
            cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
    elif audio_mode in (LOOPBACK_MODE, MIX_MODE) and audio_tcp:
        port, rate, ch = audio_tcp
        # Large TCP recv buffer + thread queue so a heavy video frame encode cannot
        # starve audio for a few ms (that starvation sounds like FM radio breakup).
        # recv_buffer_size/send_buffer_size are the real TCP options in ffmpeg;
        # fifo_size is a UDP concept and is ignored here on purpose.
        # Keep buffers modest: multi‑MB TCP queues delay audio by seconds on live
        # (sound "arrives later"); too small → underrun ksssh. ~256 KB ≈ 1.3s @48k stereo.
        # Low-latency live path: small queues (large ones = "sound arrives later").
        cmd += ["-thread_queue_size", "64",
                "-f", "s16le", "-ar", str(rate), "-ac", str(ch),
                "-fflags", "nobuffer", "-flags", "low_delay",
                "-probesize", "32", "-analyzeduration", "0",
                "-i", (f"tcp://127.0.0.1:{port}?listen=1"
                       f"&recv_buffer_size=65536&send_buffer_size=65536")]
        # Mic via DirectShow in the *same* FFmpeg as WGC+process-TCP blocks for
        # tens of seconds on open (log: mic arrives ~20s late → video pipe stalls →
        # Packet too small). Process-loopback path is system/game only here; use
        # WASAPI-only for stable live, or a future Python-side mic mix.
        if False and audio_mode == MIX_MODE and mic_dev and mic_dev != NO_AUDIO:
            cmd += ["-f", "dshow", "-rtbufsize", "32M", "-audio_buffer_size", "40",
                    "-thread_queue_size", "128", "-i", f"audio={mic_dev}"]
    else:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]

    # ---- Video filter chain
    # On Intel UHD 620 (Gen9.5), pure in-VRAM scale via
    #   hwmap=derive_device=qsv → vpp_qsv=w=...:h=...
    # fails with texture error 0x80070057 even at 16-aligned sizes (848x480).
    # gpu_native (no scale) and download→CPU-scale→QSV both work. Scaled "GPU"
    # tiers therefore use the proven download+CPU-scale graph, not broken VPP scale.
    if tier == "gpu_native":
        # True zero-copy: no scale. Desktop size stays on GPU for h264_qsv.
        vf = f"{video_src}hwmap=derive_device=qsv,format=qsv[v]"
    elif tier in ("gpu", "gpu_fixed"):
        # Was pure-GPU VPP scale; on this iGPU that path is unusable.
        # Same encode engine (h264_qsv), CPU does the scale after hwdownload.
        dims = probe_screen_size() if height else None
        if height and dims:
            w, h = qsv_scale_size(dims[0], dims[1], height)
            scale = f"scale={w}:{h}:flags=fast_bilinear"
        elif height:
            h = qsv_align(height)
            scale = f"scale=trunc(iw/16)*16:{h}:flags=fast_bilinear"
        else:
            scale = "scale=trunc(iw/16)*16:trunc(ih/16)*16"
        if cap == "ddagrab":
            vf = f"{video_src}hwdownload,format=bgra,{scale},format=nv12[v]"
        else:
            vf = f"{video_src}{scale},format=nv12[v]"
    elif tier == "gpu_x264":
        # Scale on CPU, encode with software x264. No vpp_qsv at all.
        dims = probe_screen_size() if height else None
        if height and dims:
            w, h = qsv_scale_size(dims[0], dims[1], height)
            scale = f"scale={w}:{h}:flags=fast_bilinear"
        elif height:
            scale = f"scale=-2:{height}:flags=fast_bilinear"
        else:
            scale = "scale=trunc(iw/2)*2:trunc(ih/2)*2"
        if cap == "ddagrab":
            vf = f"{video_src}hwdownload,format=bgra,{scale},format=yuv420p[v]"
        else:
            vf = f"{video_src}{scale},format=yuv420p[v]"
    elif is_wgc:
        # If the pipe is already at stream height, only convert format.
        # Otherwise scale in ffmpeg (faster than pure-numpy resize on this PC).
        pix = "nv12" if enc == "qsv" else "yuv420p"
        pipe = wgc_size or probe_wgc_size()
        if height and pipe and int(pipe[1]) > int(height) + 2:
            vf = f"{video_src}scale=-2:{height}:flags=fast_bilinear,format={pix}[v]"
        else:
            vf = f"{video_src}format={pix}[v]"
    else:
        scale = (f"scale=-2:{height}:flags=fast_bilinear" if height
                 else "scale=trunc(iw/2)*2:trunc(ih/2)*2")
        # No fps filter in these graphs on purpose: duplicates made inside a filter graph are
        # NOT counted by ffmpeg, which hid a capture that delivered far fewer than fps frames.
        pix = "nv12" if enc == "qsv" else "yuv420p"
        if cap == "ddagrab":
            # ddagrab outputs D3D11 frames → download to system memory
            vf = f"{video_src}hwdownload,format=bgra,{scale},format={pix}[v]"
        else:
            vf = f"{video_src}{scale},format={pix}[v]"

    # Hold pictures back so they meet process-loopback audio (FLV-safe).
    if vdelay > 0.001 and vf.endswith("[v]"):
        vf = vf[:-3] + f",setpts=PTS+{vdelay:.3f}/TB[v]"

    # Audio resample + map
    # async=1: only tiny timestamp jitter (large async stretched audio / lag).
    # volume + alimiter: your diagnostics hit peak=1.0 (0 dBFS). Full-scale PCM into
    # AAC is a classic “mushy / crunchy” sound even when clip_ratio looks low.
    # Keep headroom (~-3 dB) then limit peaks before AAC.
    # Stronger headroom: diagnostics still hit peak=1.0 with volume=0.7 alone.
    # aresample first, then volume, then soft limit so AAC never sees full-scale edges
    # that turn underrun gaps into harsh "ksssh" radio noise.
    # Process loopback is continuous digital audio — do NOT use large async
    # (that stretches and makes sound arrive late on long lives). async=1 only
    # fixes tiny timestamp jitter without building multi-second delay.
    headroom = "volume=0.9,alimiter=limit=0.95:attack=5:release=50"
    # Hard-cap audio length on file tests so a late process-loopback buffer cannot
    # leave sound playing after the picture has already ended.
    atrail = ""
    if test_seconds:
        atrail = f",atrim=0:{float(test_seconds):.3f},asetpts=PTS-STARTPTS"
    # Second audio input (dshow mic) is not attached on the process-TCP path (see above).
    if False and (audio_mode == MIX_MODE and audio_tcp and mic_dev and mic_dev != NO_AUDIO):
        af = (f"[1:a]aresample=48000:async=1:first_pts=0,volume=0.95[sys];"
              f"[2:a]aresample=48000:async=1:first_pts=0,volume=0.85[mic];"
              f"[sys][mic]amix=inputs=2:duration=first:dropout_transition=1:normalize=0,"
              f"{headroom}{atrail}[a]")
    else:
        af = f"[1:a]aresample=48000:async=1:first_pts=0,{headroom}{atrail}[a]"
    cmd += ["-filter_complex", f"{vf};{af}", "-map", "[v]", "-map", "[a]",
            # Constant frame rate for live ingest. Any frame ffmpeg has to repeat or skip to do
            # this is counted in dup_frames / drop_frames, so the stats show the truth.
            "-fps_mode", "cfr", "-r", str(fps)]

    gop = str(fps * 2)
    # YouTube live recommendations (docs as of 2025/26):
    #   H.264 High, 2s keyframe, CBR-like, no B-frames for low latency,
    #   AAC-LC 128k stereo 48 kHz, yuv420p/nv12, FLV without duration/filesize.
    # bufsize ≈ 1s of target bitrate keeps the rate stable without long buffering.
    #
    # Important: do NOT force -pix_fmt on pure GPU (qsv) paths. Frames leave the
    # filter graph as format=qsv; h264_qsv accepts those directly. Setting
    # -pix_fmt nv12 makes ffmpeg insert a software auto_scale (qsv→nv12) which
    # fails with "Impossible to convert... Function not implemented".
    if enc == "qsv":
        cmd += ["-c:v", "h264_qsv", "-preset", "veryfast", "-profile:v", "high",
                "-look_ahead", "0",
                "-b:v", f"{kbps}k", "-maxrate", f"{kbps}k", "-bufsize", f"{kbps}k",
                "-g", gop, "-bf", "0", "-forced_idr", "1", "-async_depth", "2"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
                "-profile:v", "high", "-threads", str(min(4, max(2, (os.cpu_count() or 4) // 2))),
                "-b:v", f"{kbps}k", "-minrate", f"{kbps}k", "-maxrate", f"{kbps}k",
                "-bufsize", f"{kbps}k", "-g", gop, "-bf", "0",
                "-x264-params", "nal-hrd=cbr:scenecut=0:keyint=" + gop + ":min-keyint=" + gop,
                "-pix_fmt", "yuv420p"]
    # AAC-LC is the only AAC profile YouTube officially supports for live.
    cmd += ["-c:a", "aac", "-profile:a", "aac_low", "-b:a", "128k", "-ar", "48000", "-ac", "2"]
    if test_seconds:
        # -shortest: end the file when video stops (process audio can outlive frames)
        cmd += ["-t", str(test_seconds), "-shortest",
                "-movflags", "+faststart", target]
    else:
        # max_muxing_queue_size absorbs short network stalls so capture doesn't block.
        # muxdelay/muxpreload 0 reduce startup latency; no_duration_filesize is required
        # for live FLV (YouTube rejects streams that try to write a final duration).
        # max_interleave_delta 250ms: if audio stalls, don't hold video for a full second
        # (that felt like silence then a dump). Prefer small video lead over A/V freezes.
        cmd += ["-max_muxing_queue_size", "256",
                "-max_interleave_delta", "0",
                "-muxdelay", "0", "-muxpreload", "0",
                "-flush_packets", "1",
                "-avoid_negative_ts", "make_zero",
                "-flvflags", "no_duration_filesize",
                "-f", "flv", target]
    return cmd


_AUDIO_DEVICE_CACHE = {"devs": None, "ts": 0}
