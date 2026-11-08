"""Screen + audio capture and FFmpeg command builders."""
from .screen import (
    NO_AUDIO, NO_APP_AUDIO, WGC_MONITOR, BSEL_DEFAULT,
    SCREEN_METHODS, SCREEN_METHOD_CHOICES, DEFAULT_SCREEN_METHOD,
    SCREEN_METHOD_ALIASES, normalize_screen_method, TIER_NAMES,
    probe_screen_size, qsv_align, qsv_scale_size,
)
from .wgc import (
    probe_wgc_backend, wgc_install_hint, probe_wgc_size, list_capturable_windows,
    resolve_window_title, window_title_to_pid, process_loopback_available,
    process_loopback_audio_loop, warmup_process_audio, list_heavy_user_processes,
    wgc_target_size, wgc_producer_loop,
)
from .audio import (
    free_port, probe_loopback, open_loopback, close_loopback, loopback_audio_loop,
    loopback_peak, analyze_pcm16, write_wav_s16le, record_loopback_pcm,
    list_audio_devices,
)
from .ffmpeg_cmd import build_screen_cmd

__all__ = [x for x in dir() if not x.startswith("_")]
