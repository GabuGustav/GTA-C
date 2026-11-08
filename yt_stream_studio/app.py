"""Main Tk application."""
import collections
import copy
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import tkinter as tk
from datetime import datetime
from tkinter import filedialog, messagebox, ttk

from .config import (
    DEFAULT_FOLDER, DEFAULT_MUSIC_DIR, HOME, APP_DIR, CONFIG_PATH, TOKEN_PATH, CLIENT_PATH,
    DEFAULT_INGEST, VIDEO_EXT, FILLER_SECONDS, SEAM_SECONDS, NOWIN, BELOW_NORMAL,
    DSHOW_MODE, SILENT_MODE, LOOPBACK_MODE, MIX_MODE, DEFAULT_FX, DEFAULT_AUDIO,
    log_dir, logs_root,
)
from .util import (
    capture_rate, kill_tree, fmt_time, parse_time, even, probe, new_item, fx_summary,
    needs_render, font_opt, atempo_chain, build_render_cmd, make_filler, load_json, save_json,
)
from .youtube_api import YouTube, YTError
from .capture import (
    NO_AUDIO, NO_APP_AUDIO, WGC_MONITOR, BSEL_DEFAULT, SCREEN_METHODS, TIER_NAMES,
    SCREEN_METHOD_CHOICES, DEFAULT_SCREEN_METHOD, normalize_screen_method,
    probe_screen_size, probe_wgc_backend, wgc_install_hint, list_capturable_windows,
    resolve_window_title, window_title_to_pid, process_loopback_available,
    process_loopback_audio_loop, warmup_process_audio, list_heavy_user_processes, wgc_target_size,
    wgc_producer_loop, free_port, probe_loopback, open_loopback, close_loopback,
    loopback_audio_loop, analyze_pcm16, write_wav_s16le, record_loopback_pcm,
    list_audio_devices, build_screen_cmd, probe_wgc_size,
)
from .player import FFPlayer
from .music import list_tracks, build_music_cmd, music_feed
from .safety import restart_screen, health_alert
from .profiles import build_profile_bar
from .diagnostics import report as diag_report
from .diagnostics import benchmark as diag_bench
from .features import (
    check_disk_space, BITRATE_PRESETS, apply_bitrate_preset,
    save_session, load_session, list_sessions, delete_session,
    export_sessions, import_sessions, export_game_profiles, import_game_profiles,
    HealthActionState, GlobalHotkeys,
)
from .standby import StandbyEngine
from .power_btn import PowerStandbyButton
from .logutil import file_log, redact
from .session_meta import load_config, write_last_session, mark_clean_exit, last_session_unclean
from . import proc_registry
from . import __version__ as APP_VERSION
import webbrowser

# Re-export diagnostic helpers used as unbound names in App methods
get_diagnostic_system_info = getattr(diag_report, "get_diagnostic_system_info", None)
write_diagnostic_report = getattr(diag_report, "write_diagnostic_report", None)
collect_snapshot = getattr(diag_report, "collect_snapshot", None)
DiagSampler = getattr(diag_report, "DiagSampler", None)
analyse = getattr(diag_report, "analyse", None)
verdict = getattr(diag_report, "verdict", None)
render_report = getattr(diag_report, "render_report", None)
save_report = getattr(diag_report, "save_report", None)
sample_process_metrics = getattr(diag_report, "sample_process_metrics", None)
sample_system_metrics = getattr(diag_report, "sample_system_metrics", None)
sample_gpu_metrics = getattr(diag_report, "sample_gpu_metrics", None)
get_diagnostic_ffmpeg_caps = getattr(diag_report, "get_diagnostic_ffmpeg_caps", None)
# Import all public diag symbols into module namespace for App methods
for _name in dir(diag_report):
    if not _name.startswith("_"):
        globals()[_name] = getattr(diag_report, _name)
for _name in dir(diag_bench):
    if not _name.startswith("_"):
        globals()[_name] = getattr(diag_bench, _name)

class App:
    def __init__(self, root):
        self.root = root
        root.title("YT Stream Studio")
        sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
        root.geometry(f"{min(1600, sw - 20)}x{min(980, sh - 60)}+0+0")
        root.minsize(1000, 640)
        try:
            root.state("zoomed")  # fill the screen so no controls get cut off (Windows)
        except tk.TclError:
            pass
        ttk.Style().theme_use("clam")
        self.apply_hacker_theme()

        self.cfg = load_config()
        self.yt = YouTube()
        self.items = []
        self.lock = threading.Lock()
        self.ui = queue.Queue()
        self.prep_q = queue.Queue()
        self.stop_evt = threading.Event()
        self.start_evt = threading.Event()
        self.live = False
        self.cur = None
        self.sender = None
        self.log_history = collections.deque(maxlen=600)    # for the performance report
        self.ffmpeg_msgs = collections.deque(maxlen=300)    # ffmpeg warnings/errors, no progress spam
        self.standby = StandbyEngine(log=self.log, on_state=self._on_standby_state)
        self._diag_busy = False
        self.active_screen_tier = None
        self.active_screen_command = None
        self.screen_progress = {}
        self.screen_progress_history = collections.deque(maxlen=2400)
        self.screen_progress_started = None
        self.tmp = None
        self.edit_tmp = tempfile.mkdtemp(prefix="yt_studio_edit_")
        self.preview_n = 0
        self.stream_id = None
        self.broadcast_id = None
        self.ref = {"w": 1280, "h": 720, "fps": 30}
        self.loaded_id = None
        self.track_map = {"First audio track": "first"}
        self.vp = None
        self.player_mode = "none"
        self.seeking = False
        self.mode = "playlist"  # what the current live session is: "playlist" or "screen"
        self.audio_devices = [NO_AUDIO]

        c = self.cfg
        self.last_tier = c.get("sc_last_tier", "")
        # Broadcast picked in "Manage broadcasts" (used instead of creating a new one)
        self.chosen_bid, self.chosen_bound = None, ""
        self.bsel_var = tk.StringVar(value=BSEL_DEFAULT)
        self.pending_switch = None   # set while switching from start screen/playlist to screen
        self.tech_difficulties = False  # fallback card + playlist when screen fails
        self.holding = False         # BRB holding card while keeping the same broadcast
        self.force_brb_playlist = False
        self._keep_broadcast = False  # set during BRB / soft switches so workers don't complete YT
        self._health_actions = HealthActionState(bad_needed=3)
        self._hotkeys = None
        self._default_audio_track = c.get("default_audio_track", "first")  # playlist / index / "all"
        self.session = None          # url + broadcast request of the current live session
        self.folder_var = tk.StringVar(value=c.get("folder", DEFAULT_FOLDER))
        self.key_var = tk.StringVar(value=c.get("key", os.environ.get("YT_STREAM_KEY", "")))
        self.ingest_var = tk.StringVar(value=DEFAULT_INGEST)
        self.remember_var = tk.BooleanVar(value=c.get("remember", False))
        self.intro_var = tk.StringVar(value=c.get("intro", "Stream starting soon"))
        self.brb_var = tk.StringVar(value=c.get("brb", "Be right back"))
        self.loop_var = tk.BooleanVar(value=c.get("loop", False))
        self.music_on = tk.BooleanVar(value=c.get("music_on", False))
        self.music_dir = tk.StringVar(value=c.get("music_dir") or DEFAULT_MUSIC_DIR or "")
        self.music_vol = tk.StringVar(value=str(c.get("music_vol", 40)))
        self.title_var = tk.StringVar(value=c.get("title", "Live Stream"))
        self.privacy_var = tk.StringVar(value=c.get("privacy", "public"))
        self.bcast_var = tk.BooleanVar(value=c.get("bcast", True))
        self.status_var = tk.StringVar(value="OFFLINE")
        self.yt_status_var = tk.StringVar(value="Not signed in")
        self.autonext_var = tk.BooleanVar(value=c.get("autonext", True))
        self.sc_method = tk.StringVar(
            value=normalize_screen_method(c.get("sc_method", DEFAULT_SCREEN_METHOD)))
        if self.sc_method.get() not in SCREEN_METHODS:
            self.sc_method.set(DEFAULT_SCREEN_METHOD)
        self.sc_height = tk.StringVar(value=c.get("sc_height", "720"))
        self.sc_fps = tk.StringVar(value=c.get("sc_fps", "30"))
        self.sc_window = tk.StringVar(value=c.get("sc_window", WGC_MONITOR))
        self.sc_window2 = tk.StringVar(value=c.get("sc_window2", NO_APP_AUDIO))
        self._window_choices = [WGC_MONITOR]  # titles; refreshed in screen dialog
        self.sc_kbps = tk.StringVar(value=c.get("sc_kbps", "3500"))
        self.sc_audio = tk.StringVar(value=c.get("sc_audio", NO_AUDIO))
        self.sc_low = tk.BooleanVar(value=c.get("sc_low", False))
        # A/V lip-sync: delay video by this many ms (process audio is slower)
        self.sc_av_ms = tk.StringVar(value=str(c.get("sc_av_ms", 280)))
        self.sc_audio_mode = tk.StringVar(value=c.get("sc_audio_mode", LOOPBACK_MODE))
        if self.sc_audio_mode.get() not in (DSHOW_MODE, SILENT_MODE, LOOPBACK_MODE, MIX_MODE):
            self.sc_audio_mode.set(LOOPBACK_MODE)

        self.build_ui()
        try:
            self._paint_tk_widget(self.root)
            if hasattr(self, "log_box"):
                self.log_box.configure(
                    bg=self._theme["field"], fg=self._theme["accent"],
                    insertbackground=self._theme["accent"],
                    selectbackground="#1a3d24", selectforeground=self._theme["accent"])
            self.root.title("YT Stream Studio  //  net.ops")
        except Exception:
            pass
        # Always show which interpreter is running — WGC packages must match this path.
        backend = probe_wgc_backend(force=True)
        self.log(f"Python: {sys.executable} ({sys.version.split()[0]})")
        self.log(f"WGC backend: {backend or 'none — install windows-capture or dxcam into this Python'}")
        self._check_ffmpeg_startup()
        self.refresh_library()
        self.poll_ui()
        root.after(400, self.attach_player)
        root.after(800, self.try_restore_signin)
        root.after(1200, self._start_hotkeys)
        root.after(1500, self._check_last_session)
        if self.cfg.get("standby_auto"):
            root.after(2000, lambda: self.standby_start(quiet=True))
        root.protocol("WM_DELETE_WINDOW", self.on_close)
        write_last_session(mode="idle", version=APP_VERSION)

    def _check_ffmpeg_startup(self):
        """Warn early if ffmpeg/ffprobe are missing — almost every feature depends on them."""
        ff = shutil.which("ffmpeg")
        fp = shutil.which("ffprobe")
        if ff and fp:
            self.log(f"FFmpeg: {ff}")
            return
        missing = []
        if not ff:
            missing.append("ffmpeg")
        if not fp:
            missing.append("ffprobe")
        msg = (
            "Required tools not found on PATH: " + ", ".join(missing) + ".\n\n"
            "Install a full FFmpeg build and make sure both ffmpeg.exe and ffprobe.exe "
            "are on your system PATH, then restart this app.\n\n"
            "Windows builds: https://www.gyan.dev/ffmpeg/builds/  or  https://github.com/BtbN/FFmpeg-Builds"
        )
        self.log("ERROR: " + msg.replace("\n", " "))
        try:
            messagebox.showwarning("FFmpeg required", msg)
        except Exception:
            pass

    # ------------------------------------------------------------ UI theme
    def apply_hacker_theme(self):
        """Professional dark studio theme — soft neutrals, calm accent (easy on the eyes)."""
        # Palette inspired by modern creator tools (OBS / editing apps), not terminal green
        bg = "#12141a"          # app chrome
        panel = "#1a1d26"       # cards / frames
        field = "#22262f"       # inputs, lists
        fg = "#e8eaef"          # primary text
        dim = "#9aa3b2"         # secondary text
        accent = "#5b9fd4"      # calm blue (buttons / focus)
        accent_hi = "#7eb8e8"   # hover
        border = "#2c313c"
        danger = "#e07070"
        ok = "#6bcb8f"
        select = "#2a3a4d"

        root = self.root
        root.configure(bg=bg)
        try:
            root.option_add("*Font", "{Segoe UI} 10")
        except tk.TclError:
            pass
        try:
            root.title("YT Stream Studio")
        except tk.TclError:
            pass

        st = ttk.Style()
        st.theme_use("clam")
        st.configure(".", background=bg, foreground=fg, fieldbackground=field,
                     bordercolor=border, darkcolor=panel, lightcolor=panel,
                     troughcolor=panel, focuscolor=accent)
        st.configure("TFrame", background=bg)
        st.configure("TLabelframe", background=panel, foreground=fg, bordercolor=border)
        st.configure("TLabelframe.Label", background=panel, foreground=dim,
                     font=("Segoe UI", 9, "bold"))
        st.configure("TLabel", background=bg, foreground=fg)
        st.configure("Dim.TLabel", background=bg, foreground=dim)
        st.configure("TButton", background=field, foreground=fg,
                     bordercolor=border, focusthickness=1, focuscolor=accent,
                     padding=(12, 5))
        st.map("TButton",
               background=[("active", "#2a303c"), ("pressed", "#1e232d")],
               foreground=[("disabled", dim)])
        st.configure("Accent.TButton", background=accent, foreground="#0e1116",
                     padding=(12, 5))
        st.map("Accent.TButton",
               background=[("active", accent_hi), ("pressed", "#4a8ec0")])
        st.configure("TCheckbutton", background=bg, foreground=fg)
        st.map("TCheckbutton", background=[("active", bg)],
               foreground=[("selected", accent)])
        st.configure("TRadiobutton", background=bg, foreground=fg)
        st.map("TRadiobutton", background=[("active", bg)],
               foreground=[("selected", accent)])
        st.configure("TEntry", fieldbackground=field, foreground=fg,
                     insertcolor=fg, bordercolor=border, padding=4)
        st.configure("TCombobox", fieldbackground=field, foreground=fg,
                     background=field, arrowcolor=dim, bordercolor=border,
                     padding=3)
        st.map("TCombobox",
               fieldbackground=[("readonly", field)],
               foreground=[("readonly", fg)],
               background=[("readonly", field)])
        st.configure("Horizontal.TScale", background=bg, troughcolor=field)
        st.configure("TNotebook", background=bg, bordercolor=border)
        st.configure("TNotebook.Tab", background=panel, foreground=dim,
                     padding=[14, 6])
        st.map("TNotebook.Tab",
               background=[("selected", field)],
               foreground=[("selected", fg)])
        st.configure("Treeview", background=field, foreground=fg,
                     fieldbackground=field, bordercolor=border, rowheight=26)
        st.configure("Treeview.Heading", background=panel, foreground=dim,
                     font=("Segoe UI", 9, "bold"))
        st.map("Treeview", background=[("selected", select)],
               foreground=[("selected", fg)])
        st.configure("TScrollbar", background=panel, troughcolor=bg,
                     arrowcolor=dim, bordercolor=border)
        st.configure("TSeparator", background=border)
        st.configure("Status.TLabel", background=panel, foreground=ok)
        st.configure("TPanedwindow", background=bg)

        self._theme = {
            "bg": bg, "panel": panel, "field": field, "fg": fg,
            "dim": dim, "accent": accent, "border": border, "danger": danger,
            "ok": ok, "select": select,
        }

    def _paint_tk_widget(self, w):
        """Apply hacker colors to classic tk widgets (Text, Listbox, Canvas)."""
        th = getattr(self, "_theme", None)
        if not th:
            return
        try:
            cls = w.winfo_class()
        except tk.TclError:
            return
        if cls in ("Text", "Listbox"):
            try:
                w.configure(bg=th["field"], fg=th["fg"],
                            insertbackground=th["fg"],
                            selectbackground=th.get("select", "#2a3a4d"),
                            selectforeground=th["fg"],
                            highlightbackground=th["border"],
                            highlightcolor=th["accent"],
                            relief="flat", borderwidth=1,
                            font=("Segoe UI", 10))
            except tk.TclError:
                pass
        elif cls == "Canvas":
            try:
                w.configure(bg=th["panel"], highlightbackground=th["border"])
            except tk.TclError:
                pass
        elif cls == "Frame":
            try:
                w.configure(bg=th["bg"])
            except tk.TclError:
                pass
        for ch in w.winfo_children():
            self._paint_tk_widget(ch)

    # ------------------------------------------------------------ UI build
    def build_ui(self):
        self.log_box = tk.Text(self.root, height=3, state="disabled", wrap="word")
        self.log_box.pack(side="bottom", fill="x", padx=8, pady=(0, 8))
        self.build_stream_bar()

        top = ttk.PanedWindow(self.root, orient="horizontal")
        top.pack(fill="both", expand=True, padx=8, pady=8)
        left = ttk.PanedWindow(top, orient="vertical")
        right = ttk.PanedWindow(top, orient="vertical")
        # Player column is the star — left (library/playlist) stays usable but secondary
        top.add(left, weight=1)
        top.add(right, weight=4)
        self._pane_top, self._pane_left, self._pane_right = top, left, right
        self._ui_focus_player = False
        self._ui_fullscreen = False

        # library
        lib = ttk.LabelFrame(left, text="Library")
        left.add(lib, weight=2)
        self._frame_lib = lib
        row = ttk.Frame(lib)
        row.pack(fill="x", padx=6, pady=6)
        ttk.Entry(row, textvariable=self.folder_var).pack(side="left", fill="x", expand=True)
        ttk.Button(row, text="Browse", command=self.browse).pack(side="left", padx=(6, 0))
        ttk.Button(row, text="Refresh", command=self.refresh_library).pack(side="left", padx=(6, 0))
        lf = ttk.Frame(lib)
        lf.pack(fill="both", expand=True, padx=6)
        self.lib = tk.Listbox(lf, selectmode="extended", activestyle="none", height=8)
        sb = ttk.Scrollbar(lf, command=self.lib.yview)
        self.lib.configure(yscrollcommand=sb.set)
        self.lib.pack(side="left", fill="both", expand=True)
        sb.pack(side="left", fill="y")
        self.lib.bind("<Double-Button-1>", lambda e: self.add_selected())
        self.lib.bind("<<ListboxSelect>>", lambda e: self.preview_library(autoplay=False))
        self.lib.bind("<space>", lambda e: (self.toggle_play(), "break")[1])
        lb = ttk.Frame(lib)
        lb.pack(fill="x", padx=6, pady=6)
        ttk.Button(lb, text="Preview", command=lambda: self.preview_library(autoplay=True)).pack(
            side="left")
        ttk.Button(lb, text="Add to playlist  >>", command=self.add_selected).pack(
            side="left", fill="x", expand=True, padx=(6, 0))

        # playlist
        pl = ttk.LabelFrame(left, text="Playlist (plays top to bottom)")
        left.add(pl, weight=2)
        cols = ("n", "name", "start", "end", "len", "res", "fx", "state")
        self.tree = ttk.Treeview(pl, columns=cols, show="headings", selectmode="browse", height=9)
        for c, t, w in (("n", "#", 28), ("name", "Clip", 170), ("start", "Start", 58),
                        ("end", "End", 58), ("len", "Length", 58), ("res", "Format", 78),
                        ("fx", "Edits", 120), ("state", "State", 70)):
            self.tree.heading(c, text=t)
            self.tree.column(c, width=w, anchor="w" if c in ("name", "fx") else "center")
        self.tree.pack(fill="both", expand=True, padx=6, pady=6)
        self.tree.bind("<<TreeviewSelect>>", lambda e: self.on_select())
        self.tree.bind("<space>", lambda e: (self.toggle_play(), "break")[1])
        br = ttk.Frame(pl)
        br.pack(fill="x", padx=6, pady=(0, 6))
        for text, cmd in (("Up", lambda: self.move(-1)), ("Down", lambda: self.move(1)),
                          ("Duplicate", self.duplicate), ("Remove", self.remove_selected),
                          ("Clear", self.clear_all)):
            ttk.Button(br, text=text, command=cmd).pack(side="left", padx=(0, 6))

        # player
        pf = ttk.LabelFrame(right, text="Player")
        right.add(pf, weight=6)
        self._frame_player = pf
        # controls are packed FIRST (at the bottom) so a short window can never hide them;
        # the video takes whatever space is left
        c3 = ttk.Frame(pf)
        c3.pack(side="bottom", fill="x", padx=6, pady=(0, 4))
        c2 = ttk.Frame(pf)
        c2.pack(side="bottom", fill="x", padx=6, pady=2)
        c1 = ttk.Frame(pf)
        c1.pack(side="bottom", fill="x", padx=6)
        self.video = tk.Frame(pf, bg="black", height=420)
        self.video.pack(side="top", fill="both", expand=True, padx=6, pady=6)

        ttk.Button(c1, text="|<", width=3, command=lambda: self.step_clip(-1)).pack(side="left")
        ttk.Button(c1, text="Play / Pause", command=self.toggle_play).pack(side="left", padx=3)
        ttk.Button(c1, text=">|", width=3, command=lambda: self.step_clip(1)).pack(side="left")
        ttk.Button(c1, text="-5s", width=4, command=lambda: self.skip(-5)).pack(side="left", padx=(8, 3))
        ttk.Button(c1, text="+5s", width=4, command=lambda: self.skip(5)).pack(side="left")
        self.seek_var = tk.DoubleVar(value=0)
        self.seek = ttk.Scale(c1, from_=0, to=1000, variable=self.seek_var)
        self.seek.pack(side="left", fill="x", expand=True, padx=8)
        self.seek.bind("<ButtonPress-1>", self.seek_press)
        self.seek.bind("<B1-Motion>", self.seek_move)
        self.seek.bind("<ButtonRelease-1>", self.seek_release)
        self.time_var = tk.StringVar(value="0:00.0 / 0:00.0")
        ttk.Label(c1, textvariable=self.time_var, width=16).pack(side="left")

        for text, cmd in (("Mark start [", self.mark_start), ("Mark end ]", self.mark_end),
                          ("Split here", self.split_here),
                          ("Render edited preview", self.render_preview),
                          ("Play original", self.play_original)):
            ttk.Button(c2, text=text, command=cmd).pack(side="left", padx=(0, 6))

        ttk.Checkbutton(c3, text="Auto-play next clip", variable=self.autonext_var).pack(
            side="left")
        ttk.Label(c3, text="Vol").pack(side="left", padx=(12, 2))
        vol = ttk.Scale(c3, from_=0, to=100, length=90, command=self.set_player_volume)
        vol.set(80)
        vol.pack(side="left")
        ttk.Label(c3, text="Keys: Space · F10 focus · F11 fullscreen", foreground="#9aa3b2").pack(
            side="left", padx=12)
        self.mode_var = tk.StringVar(value="")
        ttk.Label(c3, textvariable=self.mode_var, foreground="#9aa3b2").pack(side="right")
        ttk.Button(c3, text="Focus player", command=self.toggle_focus_player).pack(
            side="right", padx=4)
        ttk.Button(c3, text="Fullscreen", command=self.toggle_fullscreen).pack(
            side="right", padx=4)

        # editor (Apply/Reset packed first so they stay visible too)
        ef = ttk.LabelFrame(right, text="Edit selected clip")
        right.add(ef, weight=1)
        self._frame_edit = ef
        self._edit_nb = None
        bf = ttk.Frame(ef)
        bf.pack(side="bottom", fill="x", padx=6, pady=(0, 6))
        ttk.Button(bf, text="Apply changes", command=self.apply_editor).pack(side="left")
        ttk.Button(bf, text="Reset all edits", command=self.reset_editor).pack(side="left", padx=6)
        ttk.Button(bf, text="Expand edit", command=self.expand_edit_panel).pack(side="left", padx=6)
        nb = ttk.Notebook(ef)
        nb.pack(side="top", fill="both", expand=True, padx=6, pady=6)
        self._edit_nb = nb
        self.build_edit_tab(nb)
        self.build_tracks_tab(nb)

        self.root.bind_all("<space>", lambda e: self.key_do(self.toggle_play))
        self.root.bind_all("<Left>", lambda e: self.key_do(lambda: self.skip(-5)))
        self.root.bind_all("<Right>", lambda e: self.key_do(lambda: self.skip(5)))
        # F10/F11: return "break" so Windows does not open the system menu (F10)
        # which races with PanedWindow layout and freezes the frozen .exe.
        self.root.bind("<F11>", self._on_f11)
        self.root.bind("<Escape>", lambda e: (self.exit_fullscreen(), "break")[1])
        self.root.bind("<F10>", self._on_f10)
        self.root.bind_all("<F10>", self._on_f10)
        # After first layout, force a large player (weights alone are not enough on Windows)
        self.root.after(150, self._layout_prefer_player)

    def build_edit_tab(self, nb):
        tab = ttk.Frame(nb)
        nb.add(tab, text="Edit")
        self.start_var, self.end_var = tk.StringVar(), tk.StringVar()
        self.speed_var, self.vol_var = tk.StringVar(value="1"), tk.StringVar(value="100")
        self.fin_var, self.fout_var = tk.StringVar(value="0"), tk.StringVar(value="0")
        self.rot_var = tk.StringVar(value="0")
        self.fliph_var, self.flipv_var = tk.BooleanVar(), tk.BooleanVar()
        self.bri_var, self.con_var, self.sat_var = tk.IntVar(), tk.IntVar(value=100), tk.IntVar(value=100)
        self.text_var, self.textpos_var = tk.StringVar(), tk.StringVar(value="bottom")

        def lab(r, c, t):
            ttk.Label(tab, text=t).grid(row=r, column=c, sticky="e", padx=(10, 3), pady=3)

        lab(0, 0, "Start")
        ttk.Entry(tab, textvariable=self.start_var, width=10).grid(row=0, column=1, sticky="w")
        lab(0, 2, "End")
        ttk.Entry(tab, textvariable=self.end_var, width=10).grid(row=0, column=3, sticky="w")
        lab(0, 4, "Speed x")
        ttk.Spinbox(tab, from_=0.25, to=4, increment=0.25, width=6,
                    textvariable=self.speed_var).grid(row=0, column=5, sticky="w")
        lab(1, 0, "Volume %")
        ttk.Spinbox(tab, from_=0, to=300, increment=10, width=8,
                    textvariable=self.vol_var).grid(row=1, column=1, sticky="w")
        lab(1, 2, "Fade in s")
        ttk.Spinbox(tab, from_=0, to=30, increment=0.5, width=6,
                    textvariable=self.fin_var).grid(row=1, column=3, sticky="w")
        lab(1, 4, "Fade out s")
        ttk.Spinbox(tab, from_=0, to=30, increment=0.5, width=6,
                    textvariable=self.fout_var).grid(row=1, column=5, sticky="w")
        lab(2, 0, "Rotate")
        ttk.Combobox(tab, values=("0", "90", "180", "270"), width=6, state="readonly",
                     textvariable=self.rot_var).grid(row=2, column=1, sticky="w")
        ttk.Checkbutton(tab, text="Flip horizontal", variable=self.fliph_var).grid(
            row=2, column=2, columnspan=2, sticky="w", padx=10)
        ttk.Checkbutton(tab, text="Flip vertical", variable=self.flipv_var).grid(
            row=2, column=4, columnspan=2, sticky="w")
        for r, (t, var, lo, hi) in enumerate((("Brightness", self.bri_var, -100, 100),
                                              ("Contrast %", self.con_var, 0, 200),
                                              ("Saturation %", self.sat_var, 0, 300))):
            lab(3, r * 2, t)
            tk.Scale(tab, from_=lo, to=hi, orient="horizontal", variable=var, length=110,
                     showvalue=True).grid(row=3, column=r * 2 + 1, sticky="w")
        lab(4, 0, "Text overlay")
        ttk.Entry(tab, textvariable=self.text_var, width=34).grid(
            row=4, column=1, columnspan=3, sticky="w")
        lab(4, 4, "Position")
        ttk.Combobox(tab, values=("top", "center", "bottom"), width=8, state="readonly",
                     textvariable=self.textpos_var).grid(row=4, column=5, sticky="w")

    def build_tracks_tab(self, nb):
        tab = ttk.Frame(nb)
        nb.add(tab, text="Tracks")
        self.tracks = ttk.Treeview(tab, columns=("idx", "type", "codec", "detail"),
                                   show="headings", height=4, selectmode="browse")
        for c, t, w in (("idx", "#", 40), ("type", "Type", 70), ("codec", "Codec", 80),
                        ("detail", "Details", 300)):
            self.tracks.heading(c, text=t)
            self.tracks.column(c, width=w, anchor="w")
        self.tracks.pack(fill="both", expand=True, padx=6, pady=6)

        af = ttk.LabelFrame(tab, text="Audio for this clip")
        af.pack(fill="x", padx=6)
        self.amode_var = tk.StringVar(value="original")
        self.track_var = tk.StringVar(value="First audio track")
        self.afile_var = tk.StringVar()
        self.afilevol_var = tk.StringVar(value="100")
        r = ttk.Frame(af)
        r.pack(fill="x", pady=2)
        ttk.Radiobutton(r, text="Original", value="original", variable=self.amode_var).pack(
            side="left", padx=6)
        self.track_combo = ttk.Combobox(r, textvariable=self.track_var, state="readonly", width=34,
                                        values=list(self.track_map))
        self.track_combo.pack(side="left")
        ttk.Radiobutton(r, text="Muted", value="mute", variable=self.amode_var).pack(
            side="left", padx=10)
        r2 = ttk.Frame(af)
        r2.pack(fill="x", pady=2)
        ttk.Radiobutton(r2, text="Replace with file", value="replace",
                        variable=self.amode_var).pack(side="left", padx=6)
        ttk.Radiobutton(r2, text="Mix file with original", value="mix",
                        variable=self.amode_var).pack(side="left", padx=6)
        ttk.Entry(r2, textvariable=self.afile_var, width=30).pack(side="left", padx=4)
        ttk.Button(r2, text="Browse", command=self.browse_audio).pack(side="left")
        ttk.Label(r2, text="File vol %").pack(side="left", padx=(8, 2))
        ttk.Spinbox(r2, from_=0, to=300, increment=10, width=5,
                    textvariable=self.afilevol_var).pack(side="left")
        r3 = ttk.Frame(af)
        r3.pack(fill="x", pady=4)
        ttk.Button(r3, text="Use this track as default for new clips",
                   command=self._set_default_audio_track).pack(side="left", padx=6)
        ttk.Label(r3, text="(saved in settings; applies when you Add to playlist)").pack(
            side="left")

        xb = ttk.Frame(tab)
        xb.pack(fill="x", padx=6, pady=6)
        ttk.Button(xb, text="Save video track only...",
                   command=lambda: self.extract_track("video")).pack(side="left")
        ttk.Button(xb, text="Save audio track only...",
                   command=lambda: self.extract_track("audio")).pack(side="left", padx=6)
        ttk.Label(xb, text="(select a track above to pick which audio track)",
                  foreground="#9aa3b2").pack(side="left")

    def build_stream_bar(self):
        sf = ttk.LabelFrame(self.root, text="YouTube")
        sf.pack(side="bottom", fill="x", padx=8)
        r0 = ttk.Frame(sf)
        r0.pack(fill="x", padx=6, pady=3)
        ttk.Button(r0, text="Sign in with YouTube", command=self.yt_sign_in).pack(side="left")
        ttk.Button(r0, text="Sign out", command=self.yt_sign_out).pack(side="left", padx=6)
        ttk.Button(r0, text="Setup help", command=self.show_help).pack(side="left")
        ttk.Button(r0, text="About", command=self.show_about).pack(side="left", padx=4)
        ttk.Button(r0, text="Manage broadcasts...", command=self.manage_broadcasts).pack(
            side="left", padx=6)
        ttk.Label(r0, textvariable=self.yt_status_var, font=("Segoe UI", 9, "bold")).pack(
            side="left", padx=10)
        ttk.Label(r0, text="Stream key").pack(side="left", padx=(16, 3))
        ttk.Entry(r0, textvariable=self.key_var, show="*", width=26).pack(side="left")
        ttk.Checkbutton(r0, text="Remember", variable=self.remember_var).pack(side="left", padx=6)

        r1 = ttk.Frame(sf)
        r1.pack(fill="x", padx=6, pady=3)
        ttk.Checkbutton(r1, text="Use a YouTube broadcast when going live (needs sign-in)",
                        variable=self.bcast_var).pack(side="left")
        ttk.Label(r1, text="Title").pack(side="left", padx=(10, 3))
        ttk.Entry(r1, textvariable=self.title_var, width=24).pack(side="left")
        ttk.Combobox(r1, values=("public", "unlisted", "private"), width=9, state="readonly",
                     textvariable=self.privacy_var).pack(side="left", padx=6)
        ttk.Label(r1, text="Start screen").pack(side="left", padx=(10, 3))
        ttk.Entry(r1, textvariable=self.intro_var, width=22).pack(side="left")
        ttk.Label(r1, text="Empty screen").pack(side="left", padx=(10, 3))
        ttk.Entry(r1, textvariable=self.brb_var, width=16).pack(side="left")
        ttk.Checkbutton(r1, text="Loop playlist", variable=self.loop_var).pack(side="left", padx=10)

        build_profile_bar(self, sf)
        rm = ttk.Frame(sf)
        rm.pack(fill="x", padx=6, pady=3)
        ttk.Checkbutton(rm, text="Start-screen music", variable=self.music_on).pack(side="left")
        ttk.Entry(rm, textvariable=self.music_dir, width=50).pack(side="left", padx=6)
        ttk.Button(rm, text="Browse", command=self.browse_music).pack(side="left")
        ttk.Label(rm, text="Vol %").pack(side="left", padx=(10, 3))
        ttk.Entry(rm, textvariable=self.music_vol, width=5).pack(side="left")
        r2 = ttk.Frame(sf)
        r2.pack(fill="x", padx=6, pady=(3, 6))
        self.btn_standby = PowerStandbyButton(
            r2, command=self.toggle_standby, size=34, bg="#1a1d26")
        self.btn_live = ttk.Button(r2, text="Go Live (show start screen)", command=self.go_live,
                                   style="Accent.TButton")
        self.btn_play = ttk.Button(r2, text="Start Playlist", command=self.start_playlist,
                                   state="disabled")
        self.btn_stop = ttk.Button(r2, text="Stop Stream", command=self.stop_stream,
                                   state="disabled")
        self.btn_screen = ttk.Button(r2, text="Go Live: My Screen", command=self.go_live_screen)
        self.btn_standby.pack(side="left", padx=(0, 4))
        self.btn_live.pack(side="left", padx=6)
        self.btn_play.pack(side="left", padx=8)
        self.btn_screen.pack(side="left", padx=(16, 0))
        self.btn_brb = ttk.Button(r2, text="BRB", command=self.toggle_brb, state="disabled")
        self.btn_brb.pack(side="left", padx=6)
        self._tooltip(self.btn_standby,
                      "Power standby: red = activating, yellow = warming, green = ready.\n"
                      "Warms capture + encoder to your screen preset (null sink, low power).\n"
                      "Go Live hands off from a ready pipeline.")
        self._tooltip(self.btn_brb, "Hold the broadcast with a BRB card without ending the stream.")
        self._tooltip(self.btn_live, "Start a playlist session (intro card first). Ctrl+Shift+L")
        self._tooltip(self.btn_screen, "Go live with screen capture, or switch from playlist.")
        self._tooltip(self.btn_stop, "Stop encoding and complete the YouTube broadcast. Ctrl+Shift+S")
        ttk.Button(r2, text="Screen settings / test...", command=self.screen_dialog).pack(
            side="left", padx=8)
        ttk.Button(r2, text="Benchmark...", command=self.benchmark_dialog).pack(side="left")
        self.btn_stop.pack(side="left", padx=(16, 0))
        ttk.Button(r2, text="Update title", command=self.update_live_title).pack(
            side="left", padx=(8, 0))
        ttk.Button(r2, text="Open chat", command=self.open_live_chat).pack(
            side="left", padx=(6, 0))
        ttk.Button(r2, text="Cleanup Processes", command=self.cleanup_processes).pack(
            side="left", padx=(8, 0))
        ttk.Label(r2, textvariable=self.bsel_var, foreground="#9aa3b2").pack(
            side="left", padx=(16, 0))
        ttk.Label(r2, textvariable=self.status_var, font=("Segoe UI", 11, "bold")).pack(side="right")
        # Session profiles (full layout: playlist folder + screen + music + title)
        rs = ttk.Frame(sf)
        rs.pack(fill="x", padx=6, pady=(0, 6))
        ttk.Label(rs, text="Session").pack(side="left")
        self._session_name = tk.StringVar()
        self._session_combo = ttk.Combobox(
            rs, textvariable=self._session_name, width=22, values=list_sessions())
        self._session_combo.pack(side="left", padx=6)
        ttk.Button(rs, text="Save", command=self._session_save).pack(side="left")
        ttk.Button(rs, text="Load", command=self._session_load).pack(side="left", padx=4)
        ttk.Button(rs, text="Delete", command=self._session_delete).pack(side="left")
        ttk.Button(rs, text="Export…", command=self._session_export).pack(side="left", padx=4)
        ttk.Button(rs, text="Import…", command=self._session_import).pack(side="left")
        ttk.Label(rs, text="Quality").pack(side="left", padx=(16, 4))
        for label, preset in BITRATE_PRESETS:
            ttk.Button(
                rs, text=label,
                command=lambda p=preset, lab=label: self._apply_quality_preset(lab, p),
            ).pack(side="left", padx=2)

    # ------------------------------------------------------------ plumbing
    def log(self, msg):
        msg = redact(str(msg))
        try:
            self.log_history.append(f"[{datetime.now():%H:%M:%S}] {msg}")
        except Exception:
            pass
        file_log("info", msg)
        self.ui.put(("log", msg))

    def set_status(self, msg):
        self.ui.put(("status", msg))

    def call_ui(self, fn):
        self.ui.put(("call", fn))

    def poll_ui(self):
        try:
            while True:
                kind, val = self.ui.get_nowait()
                if kind == "log":
                    self.log_box.configure(state="normal")
                    self.log_box.insert("end", time.strftime("[%H:%M:%S] ") + val + "\n")
                    self.log_box.see("end")
                    self.log_box.configure(state="disabled")
                elif kind == "status":
                    self.status_var.set(val)
                elif kind == "refresh":
                    self.refresh_playlist()
                elif kind == "call":
                    val()
                elif kind == "ended":
                    self.live = False
                    self.status_var.set("OFFLINE")
                    self.update_buttons()
                    self.refresh_playlist()
        except queue.Empty:
            pass
        self.root.after(200, self.poll_ui)

    def update_buttons(self):
        self.btn_live.configure(state="disabled" if self.live else "normal")
        # While the start screen / playlist is live, this button switches to your screen.
        can_switch = (self.live and self.mode == "playlist" and not self.pending_switch
                      and not self.holding)
        self.btn_screen.configure(
            text="Switch to My Screen" if self.live and self.mode == "playlist"
            else "Go Live: My Screen",
            state="normal" if (not self.live or can_switch) else "disabled")
        self.btn_play.configure(
            state="normal" if self.live and self.mode == "playlist" and not self.holding
            else "disabled")
        self.btn_stop.configure(state="normal" if self.live else "disabled")
        if hasattr(self, "btn_brb"):
            self.btn_brb.configure(
                state="normal" if self.live else "disabled",
                text="Resume" if self.holding else "BRB")
        if hasattr(self, "btn_standby"):
            self._refresh_standby_btn()

    # ------------------------------------------------------------ YouTube sign-in
    def show_help(self):
        win = tk.Toplevel(self.root)
        win.title("YouTube sign-in setup")
        win.geometry("640x470")
        txt = tk.Text(win, wrap="word", padx=10, pady=10)
        txt.pack(fill="both", expand=True)
        txt.insert("end", (
            "One-time setup (5 minutes). Google needs every app that signs in to have its own\n"
            "OAuth client, so you create a free one for yourself:\n\n"
            "1. Open console.cloud.google.com and create a project (any name).\n"
            "2. APIs & Services > Library > search \"YouTube Data API v3\" > Enable.\n"
            "3. APIs & Services > OAuth consent screen > External > fill in the app name and\n"
            "   your email > on \"Test users\" add your own Google account.\n"
            "4. APIs & Services > Credentials > Create credentials > OAuth client ID >\n"
            "   Application type: Desktop app > Create > Download JSON.\n"
            "5. Click \"Load client_secret.json\" below and pick that file.\n"
            "6. Click \"Sign in with YouTube\" in the app. Your browser opens, you approve, done.\n"
            "   The app then fills in your stream key automatically.\n\n"
            "Also needed: live streaming must be enabled on your channel\n"
            "(youtube.com/features, verify your phone; can take up to 24 hours the first time).\n\n"
            "Note: while the Google app is in \"Testing\" mode, sign-ins expire after 7 days and\n"
            "you just sign in again. Publishing it to \"In production\" (fine for personal use)\n"
            "removes that limit.\n"))
        txt.configure(state="disabled")
        bf = ttk.Frame(win)
        bf.pack(fill="x", pady=8)

        def load():
            p = filedialog.askopenfilename(parent=win, title="client_secret.json",
                                           filetypes=[("JSON", "*.json")])
            if not p:
                return
            try:
                self.yt.install_client(p)
                messagebox.showinfo("Loaded", "Saved. Now click \"Sign in with YouTube\".",
                                    parent=win)
            except Exception as e:
                messagebox.showerror("Error", str(e), parent=win)

        ttk.Button(bf, text="Load client_secret.json...", command=load).pack(side="left", padx=10)
        ttk.Button(bf, text="Open Google Cloud Console",
                   command=lambda: webbrowser.open("https://console.cloud.google.com/")).pack(
            side="left")
        ttk.Button(bf, text="Close", command=win.destroy).pack(side="right", padx=10)

    def yt_sign_in(self):
        if not self.yt.client():
            self.show_help()
            return
        self.yt_status_var.set("Signing in... check your browser")

        def work():
            try:
                self.yt.sign_in()
                self.finish_signin()
            except Exception as e:
                self.fail_signin(e)

        threading.Thread(target=work, daemon=True).start()

    def try_restore_signin(self):
        if self.yt.client() and self.yt.has_token():
            self.yt_status_var.set("Signing in...")

            def work():
                try:
                    self.finish_signin()
                except Exception as e:
                    self.call_ui(lambda: self.yt_status_var.set("Not signed in"))
                    self.log(f"Couldn't restore YouTube sign-in ({e}). Click Sign in again.")

            threading.Thread(target=work, daemon=True).start()

    def finish_signin(self):
        name = self.yt.channel_name()
        stream = self.yt.ensure_stream()

        def done():
            self.stream_id = stream["id"]
            self.key_var.set(stream["key"])
            self.ingest_var.set(stream["address"])
            self.yt_status_var.set(f"Signed in: {name}")
            self.log("Signed in. Stream key filled in automatically.")

        self.call_ui(done)

    def fail_signin(self, e):
        msg = str(e)
        if getattr(e, "reason", "") == "liveStreamingNotEnabled":
            msg = ("Live streaming isn't enabled on this channel yet. Enable it at "
                   "youtube.com/features (it can take up to 24 hours), then sign in again.")

        def show():
            self.yt_status_var.set("Not signed in")
            self.log(f"Sign-in failed: {msg}")
            messagebox.showerror("YouTube sign-in", msg)

        self.call_ui(show)

    def yt_sign_out(self):
        self.yt.sign_out()
        self.stream_id = None
        self.key_var.set("")
        self.ingest_var.set(DEFAULT_INGEST)
        self.yt_status_var.set("Not signed in")

    # ------------------------------------------------------------ library
    def browse(self):
        d = filedialog.askdirectory(initialdir=self.folder_var.get() or None)
        if d:
            self.folder_var.set(d)
            self.refresh_library()

    def browse_music(self):
        d = filedialog.askdirectory(initialdir=self.music_dir.get() or None)
        if d:
            self.music_dir.set(d)

    def refresh_library(self):
        self.lib.delete(0, "end")
        folder = self.folder_var.get()
        if not os.path.isdir(folder):
            self.log(f"Folder not found: {folder}")
            return
        found = []
        for dirpath, _, files in os.walk(folder):
            for fn in files:
                if fn.lower().endswith(VIDEO_EXT):
                    found.append(os.path.relpath(os.path.join(dirpath, fn), folder))
        for rel in sorted(found, key=str.lower):
            self.lib.insert("end", rel)

    def add_selected(self):
        folder = self.folder_var.get()
        for i in self.lib.curselection():
            rel = self.lib.get(i)
            path = os.path.join(folder, rel)
            try:
                info = probe(path)
            except Exception as e:
                self.log(f"Can't read {rel}: {e}")
                continue
            item = new_item(path, rel, info)
            # Default audio track preference for newly added clips
            try:
                tr = self._default_audio_track
                if tr is not None and item.get("audio") is not None:
                    item["audio"]["track"] = tr
            except Exception:
                pass
            with self.lock:
                self.items.append(item)
            if self.live:
                self.prep_q.put(item)
        self.refresh_playlist()

    # ------------------------------------------------------------ playlist
    def refresh_playlist(self):
        sel = self.tree.selection()
        self.tree.delete(*self.tree.get_children())
        with self.lock:
            snap = list(self.items)
        for i, it in enumerate(snap):
            state = ("ready" if it["ready"] else "preparing") if self.live else ""
            self.tree.insert("", "end", iid=str(i), values=(
                i + 1, it["name"], fmt_time(it["start"]), fmt_time(it["end"]),
                fmt_time((it["end"] - it["start"]) / it["fx"]["speed"]),
                f"{it['info']['w']}x{it['info']['h']}", fx_summary(it), state))
        if sel and sel[0] in self.tree.get_children():
            self.tree.selection_set(sel[0])

    def sel_index(self):
        sel = self.tree.selection()
        return int(sel[0]) if sel else None

    def sel_item(self):
        i = self.sel_index()
        with self.lock:
            return self.items[i] if i is not None and i < len(self.items) else None

    def move(self, d):
        i = self.sel_index()
        if i is None:
            return
        j = i + d
        with self.lock:
            if not 0 <= j < len(self.items):
                return
            self.items[i], self.items[j] = self.items[j], self.items[i]
        self.refresh_playlist()
        self.tree.selection_set(str(j))

    def remove_selected(self):
        i = self.sel_index()
        if i is None:
            return
        with self.lock:
            if i < len(self.items):
                del self.items[i]
        self.refresh_playlist()

    def clear_all(self):
        with self.lock:
            self.items.clear()
        self.refresh_playlist()

    def duplicate(self):
        i = self.sel_index()
        it = self.sel_item()
        if it is None:
            return
        dup = copy.deepcopy(it)
        dup["ready"] = False
        with self.lock:
            self.items.insert(i + 1, dup)
        if self.live:
            self.prep_q.put(dup)
        self.refresh_playlist()

    def split_here(self):
        it = self.sel_item()
        t = self.player_time()
        if it is None or t is None:
            self.log("Select a clip, play the original, and park the playhead where you want to split.")
            return
        if not (it["start"] + 0.2 < t < it["end"] - 0.2):
            self.log("Playhead has to be inside the clip's start/end range.")
            return
        i = self.sel_index()
        b = copy.deepcopy(it)
        it["end"], b["start"] = t, t
        it["ready"] = b["ready"] = False
        with self.lock:
            self.items.insert(i + 1, b)
        if self.live:
            self.prep_q.put(it)
            self.prep_q.put(b)
        self.loaded_id = None
        self.refresh_playlist()
        self.log(f"Split at {fmt_time(t)}.")

    def on_select(self):
        it = self.sel_item()
        if it is None or id(it) == self.loaded_id:
            return
        self.loaded_id = id(it)
        self.load_editor(it)
        self.load_player(it["path"], it["start"], "source", end=it["end"])

    # ------------------------------------------------------------ editor
    def load_editor(self, it):
        fx, au = it["fx"], it["audio"]
        self.start_var.set(fmt_time(it["start"]))
        self.end_var.set(fmt_time(it["end"]))
        self.speed_var.set(f"{fx['speed']:g}")
        self.vol_var.set(f"{fx['volume']:g}")
        self.fin_var.set(f"{fx['fade_in']:g}")
        self.fout_var.set(f"{fx['fade_out']:g}")
        self.rot_var.set(str(fx["rotate"]))
        self.fliph_var.set(fx["flip_h"])
        self.flipv_var.set(fx["flip_v"])
        self.bri_var.set(fx["brightness"])
        self.con_var.set(fx["contrast"])
        self.sat_var.set(fx["saturation"])
        self.text_var.set(fx["text"])
        self.textpos_var.set(fx["text_pos"])

        self.tracks.delete(*self.tracks.get_children())
        self.track_map = {"First audio track": "first"}
        n = 0
        for s in it["info"]["streams"]:
            self.tracks.insert("", "end", values=(s["index"], s["type"], s["codec"], s["detail"]))
            if s["type"] == "audio":
                n += 1
                self.track_map[f"Track {n}: {s['codec']} {s['detail']}"] = n - 1
        if n > 1:
            self.track_map["All audio tracks mixed"] = "all"
        self.track_combo.configure(values=list(self.track_map))
        disp = next((d for d, c in self.track_map.items() if c == au["track"]), "First audio track")
        self.track_var.set(disp)
        self.amode_var.set(au["mode"])
        self.afile_var.set(au["file"])
        self.afilevol_var.set(f"{au['file_vol']:g}")

    def reset_editor(self):
        it = self.sel_item()
        if it is None:
            return
        it["fx"], it["audio"] = copy.deepcopy(DEFAULT_FX), copy.deepcopy(DEFAULT_AUDIO)
        it["start"], it["end"] = 0.0, it["info"]["dur"]
        it["ready"] = False
        if self.live:
            self.prep_q.put(it)
        self.load_editor(it)
        self.refresh_playlist()

    def browse_audio(self):
        p = filedialog.askopenfilename(title="Audio file", filetypes=[
            ("Audio", "*.mp3 *.wav *.m4a *.aac *.flac *.ogg *.opus"), ("All files", "*.*")])
        if p:
            self.afile_var.set(p)

    def collect_edits(self):
        it = self.sel_item()
        if it is None:
            return None
        dur = it["info"]["dur"]
        try:
            s, e = parse_time(self.start_var.get()), parse_time(self.end_var.get())
            speed, vol = float(self.speed_var.get()), float(self.vol_var.get())
            fi, fo = float(self.fin_var.get()), float(self.fout_var.get())
            fvol = float(self.afilevol_var.get())
        except ValueError:
            messagebox.showerror("Edit", "Couldn't read one of the times or numbers.")
            return None
        if not (0 <= s < e <= dur + 0.05):
            messagebox.showerror("Edit", "Start must be before End and inside the clip.")
            return None
        e = min(e, dur)
        if not 0.25 <= speed <= 4:
            messagebox.showerror("Edit", "Speed must be between 0.25 and 4.")
            return None
        if min(vol, fi, fo, fvol) < 0:
            messagebox.showerror("Edit", "Volume and fade values can't be negative.")
            return None
        if fi + fo > (e - s) / speed:
            messagebox.showerror("Edit", "Fades are longer than the clip.")
            return None
        fx = {"speed": speed, "volume": vol, "fade_in": fi, "fade_out": fo,
              "rotate": int(self.rot_var.get()), "flip_h": self.fliph_var.get(),
              "flip_v": self.flipv_var.get(), "brightness": self.bri_var.get(),
              "contrast": self.con_var.get(), "saturation": self.sat_var.get(),
              "text": self.text_var.get().strip(), "text_pos": self.textpos_var.get()}
        au = {"mode": self.amode_var.get(), "track": self.track_map.get(self.track_var.get(), "first"),
              "file": self.afile_var.get().strip(), "file_vol": fvol}
        if au["mode"] in ("replace", "mix") and not os.path.isfile(au["file"]):
            messagebox.showerror("Edit", "Pick an audio file for replace/mix.")
            return None
        return s, e, fx, au

    def apply_editor(self):
        it = self.sel_item()
        res = self.collect_edits()
        if it is None or res is None:
            return
        it["start"], it["end"], it["fx"], it["audio"] = res
        it["ready"] = False
        if self.live:
            self.prep_q.put(it)
        self.refresh_playlist()
        self.log(f"Applied edits to {it['name']}.")

    def render_preview(self):
        it = self.sel_item()
        res = self.collect_edits()
        if it is None or res is None:
            return
        tmp = dict(it)
        tmp["start"], tmp["end"], tmp["fx"], tmp["audio"] = res
        ref = self.current_ref(it)
        self.preview_n += 1
        out = os.path.join(self.edit_tmp, f"preview{self.preview_n}.mp4")
        self.log("Rendering preview...")

        def work():
            try:
                cmd = build_render_cmd(tmp, ref, out, self.edit_tmp, preview=True)
                r = subprocess.run(cmd, cwd=self.edit_tmp, capture_output=True, text=True,
                                   creationflags=NOWIN)
                if r.returncode != 0:
                    raise RuntimeError(r.stderr.strip()[-400:] or "ffmpeg failed")
                self.call_ui(lambda: self.load_player(out, 0.0, "preview", autoplay=True))
            except Exception as e:
                self.log(f"Preview failed: {e}")

        threading.Thread(target=work, daemon=True).start()

    def current_ref(self, it=None):
        if self.live:
            return self.ref
        with self.lock:
            first = self.items[0] if self.items else None
        src = first or it
        if src:
            i = src["info"]
            return {"w": i["w"], "h": i["h"], "fps": i["fps"]}
        return {"w": 1280, "h": 720, "fps": 30}

    def extract_track(self, kind):
        it = self.sel_item()
        if it is None:
            self.log("Select a clip first.")
            return
        base = os.path.splitext(os.path.basename(it["path"]))[0]
        if kind == "video":
            out = filedialog.asksaveasfilename(defaultextension=".mp4", initialfile=base + "_video.mp4",
                                               filetypes=[("MP4 video", "*.mp4")])
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", it["path"], "-map", "0:v:0",
                   "-an", "-c", "copy", out]
        else:
            sel = self.tracks.selection()
            idx, codec = None, ""
            if sel and self.tracks.item(sel[0])["values"][1] == "audio":
                v = self.tracks.item(sel[0])["values"]
                idx, codec = int(v[0]), str(v[2])
            else:
                for s in it["info"]["streams"]:
                    if s["type"] == "audio":
                        idx, codec = s["index"], s["codec"]
                        break
            if idx is None:
                self.log("This clip has no audio track.")
                return
            out = filedialog.asksaveasfilename(
                defaultextension=".m4a", initialfile=base + "_audio.m4a",
                filetypes=[("AAC (m4a)", "*.m4a"), ("MP3", "*.mp3"), ("WAV", "*.wav"),
                           ("FLAC", "*.flac")])
            if not out:
                return
            ext = os.path.splitext(out)[1].lower()
            if ext == ".mp3":
                codec_args = ["-c:a", "libmp3lame", "-q:a", "2"]
            elif ext == ".wav":
                codec_args = ["-c:a", "pcm_s16le"]
            elif ext == ".flac":
                codec_args = ["-c:a", "flac"]
            elif codec == "aac":
                codec_args = ["-c:a", "copy"]
            else:
                codec_args = ["-c:a", "aac", "-b:a", "192k"]
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", it["path"], "-map", f"0:{idx}",
                   "-vn"] + codec_args + [out]
        if not out:
            return

        def work():
            try:
                subprocess.run(cmd, check=True, capture_output=True, text=True,
                               creationflags=NOWIN)
                self.log(f"Saved: {out}")
            except subprocess.CalledProcessError as e:
                self.log(f"Couldn't save track: {(e.stderr or '')[-300:]}")

        threading.Thread(target=work, daemon=True).start()

    # ------------------------------------------------------------ player
    def attach_player(self):
        if not shutil.which("ffmpeg"):
            self.log("ffmpeg not found on PATH, so the in-app player can't start. "
                     "Preview buttons will open the clip in your default player.")
            return
        try:
            self.root.update_idletasks()
            self.vp = FFPlayer(self.video, self.log)
            self.tick()
            it = self.sel_item()
            if it:
                self.load_player(it["path"], it["start"], "source", end=it["end"])
        except Exception as e:
            self.vp = None
            self.log(f"In-app player unavailable ({e}). Previews will open externally.")

    def load_player(self, path, start, mode, autoplay=False, end=None):
        self.player_mode = mode
        self.mode_var.set({"preview": "Edited preview", "library": "Library clip"}.get(
            mode, "Original clip"))
        if not self.vp:
            if autoplay:  # no in-app player: open the clip outside the app
                self.external_play(path, start)
            return
        self.vp.load(path, start, autoplay, end)

    def play_original(self):
        it = self.sel_item()
        if it:
            self.load_player(it["path"], it["start"], "source", autoplay=True, end=it["end"])
        else:
            self.log("Select a clip in the playlist first (or use Preview in the library).")

    def step_clip(self, d, force_play=False):
        """Jump to the previous (-1) / next (+1) clip in the playlist."""
        with self.lock:
            n = len(self.items)
        if not n:
            return
        i = self.sel_index()
        j = 0 if i is None else i + d
        if not 0 <= j < n:
            return
        was = bool(self.vp and self.vp.is_playing())
        with self.lock:
            it = self.items[j]
        self.tree.selection_set(str(j))
        self.tree.see(str(j))
        self.loaded_id = id(it)
        self.load_editor(it)
        self.load_player(it["path"], it["start"], "source", autoplay=was or force_play,
                         end=it["end"])

    def key_do(self, fn):
        w = self.root.focus_get()
        if w is not None and w.winfo_class() in ("TEntry", "Entry", "TCombobox", "TSpinbox",
                                                  "Spinbox", "Text"):
            return None  # typing in a box: leave the key alone
        fn()
        return "break"

    def seek_press(self, e):
        self.seeking = True
        self.seek_move(e)

    def seek_move(self, e):
        v = min(1000.0, max(0.0, e.x / max(1, self.seek.winfo_width()) * 1000))
        self.seek_var.set(v)
        if self.vp and self.vp.get_length() > 0:
            length = self.vp.get_length()
            self.time_var.set(f"{fmt_time(v / 1000 * length / 1000)} / {fmt_time(length / 1000)}")

    def preview_library(self, autoplay=False):
        sel = self.lib.curselection()
        if not sel:
            self.log("Pick a clip in the library first.")
            return
        path = os.path.join(self.folder_var.get(), self.lib.get(sel[0]))
        self.loaded_id = None
        self.load_player(path, 0.0, "library", autoplay=autoplay)

    def external_play(self, path, start=0.0):
        try:
            if shutil.which("ffplay"):
                subprocess.Popen(["ffplay", "-autoexit", "-loglevel", "error",
                                  "-ss", f"{start:.3f}", path], creationflags=NOWIN)
            else:
                os.startfile(path)
        except Exception as e:
            self.log(f"Couldn't open the preview: {e}")

    def toggle_play(self):
        if self.vp:
            self.vp.pause() if self.vp.is_playing() else self.vp.play()

    def skip(self, d):
        if self.vp:
            self.vp.set_time(max(0, self.vp.get_time() + int(d * 1000)))

    def set_player_volume(self, v):
        if self.vp:
            self.vp.audio_set_volume(int(float(v)))

    def seek_release(self, _):
        if self.vp:
            length = self.vp.get_length()
            if length > 0:
                self.vp.set_time(int(self.seek_var.get() / 1000 * length))
        self.seeking = False

    def tick(self):
        if self.vp and self.vp.ended:
            self.vp.ended = False
            if self.autonext_var.get() and self.player_mode == "source":
                self.step_clip(1, force_play=True)
        if self.vp and not self.seeking:
            try:
                length, t = self.vp.get_length(), self.vp.get_time()
                if length > 0 and t >= 0:
                    self.seek_var.set(t / length * 1000)
                    self.time_var.set(f"{fmt_time(t / 1000)} / {fmt_time(length / 1000)}")
            except Exception:
                pass
        self.root.after(200, self.tick)

    def player_time(self):
        if self.vp and self.player_mode == "source":
            t = self.vp.get_time()
            return t / 1000 if t >= 0 else None
        return None

    def mark_start(self):
        t = self.player_time()
        if t is None:
            self.log("Mark works on the original clip. Click 'Play original' first.")
            return
        self.start_var.set(fmt_time(t))

    def mark_end(self):
        t = self.player_time()
        if t is None:
            self.log("Mark works on the original clip. Click 'Play original' first.")
            return
        self.end_var.set(fmt_time(t))

    # ------------------------------------------------------------ streaming control
    def stray_streams(self):
        """PIDs of ffmpeg.exe processes pushing to RTMP, excluding this session's own.

        Command lines are inspected only for 'rtmp' / YouTube ingest markers and are
        never shown or logged (they can contain the stream key).
        """
        if not sys.platform.startswith("win"):
            return []
        mine = set()
        for pr in (self.sender, self.cur):
            try:
                if pr and pr.poll() is None:
                    mine.add(int(pr.pid))
            except Exception:
                pass
        try:
            mine |= set(proc_registry.tracked_pids())
        except Exception:
            pass
        try:
            r = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "Get-CimInstance Win32_Process -Filter \"Name='ffmpeg.exe'\" | "
                 "ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"],
                capture_output=True, text=True, timeout=12, creationflags=NOWIN)
        except Exception:
            return []
        pids = []
        for line in (r.stdout or "").splitlines():
            pid_s, _, cmd = line.partition("\t")
            pid_s = pid_s.strip()
            if not pid_s.isdigit():
                continue
            pid = int(pid_s)
            if pid in mine:
                continue
            cl = (cmd or "").lower()
            # Live RTMP only — ignore null-sink standby / local file encodes
            if "rtmp" not in cl:
                continue
            if "-f null" in cl or "null -" in cl:
                continue
            pids.append(pid)
        return pids

    def check_stray_streams(self):
        """Clear leftover RTMP ffmpeg from earlier runs, then continue. No blocking dialog.

        Two publishers on one key cause slideshow / missing frames on YouTube, so leftovers
        are ended automatically. A single log line is enough — no Yes/No popup.
        """
        if getattr(self, "bench_running", False):
            messagebox.showinfo(
                "Benchmark",
                "A benchmark is running. Wait for it to finish or press Stop.")
            return False
        pids = self.stray_streams()
        if not pids:
            return True
        ended = 0
        for pid in pids:
            try:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    capture_output=True, creationflags=NOWIN, timeout=8)
                ended += 1
            except Exception:
                pass
        if ended:
            self.log(
                f"Cleared {ended} leftover RTMP ffmpeg process(es) from an earlier run, "
                "then continuing.")
        return True

    def go_live(self):
        if self.live:
            self.log("A stream is already active; stop it before starting another.")
            return
        if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
            messagebox.showerror("ffmpeg", "ffmpeg / ffprobe not found on PATH.")
            return
        key = self.key_var.get().strip()
        if not key:
            messagebox.showerror("Stream key", "Sign in with YouTube, or paste a stream key.")
            return
        if not self.check_stray_streams():
            return
        ok_disk, disk_msg = check_disk_space(
            [self.folder_var.get(), tempfile.gettempdir(), APP_DIR], min_gb=2.0)
        self.log(disk_msg)
        if not ok_disk:
            if not messagebox.askyesno("Low disk space", disk_msg + "\n\nGo live anyway?"):
                return
        self._stop_standby_for_live()
        self.log("Using ffmpeg: " + (shutil.which("ffmpeg") or "?"))
        write_last_session(mode="playlist", version=APP_VERSION)
        with self.lock:
            first = self.items[0] if self.items else None
        if first:
            fi = first["info"]
            self.ref = {"w": fi["w"], "h": fi["h"], "fps": fi["fps"]}
        else:
            self.ref = {"w": 1280, "h": 720, "fps": 30}

        self.save_settings(key)
        bcast = self.broadcast_request()
        url = self.ingest_var.get().rstrip("/") + "/" + key

        self.mode = "playlist"
        self.session = {"url": url, "bcast": bcast}
        self.pending_switch = None
        # Fresh session — never inherit BRB / tech-difficulties from a previous run
        self.holding = False
        self.force_brb_playlist = False
        self.tech_difficulties = False
        self._keep_broadcast = False
        try:
            self._health_actions = HealthActionState(bad_needed=3)
            self._health_actions.cooldown_s = 120.0
            self._health_live_since = time.monotonic()  # no auto-BRB until ingest has had time
        except Exception:
            self._health_live_since = time.monotonic()
        self.stop_evt.clear()
        self.start_evt.clear()
        self.prep_q = queue.Queue()
        self.tmp = tempfile.mkdtemp(prefix="yt_studio_")
        with self.lock:
            for it in self.items:
                it["ready"] = False
                self.prep_q.put(it)
        self.live = True
        self.update_buttons()
        self.refresh_playlist()
        self.set_status("LIVE: connecting")
        threading.Thread(target=self.prep_worker, daemon=True).start()
        threading.Thread(target=self.stream_worker, args=(url, bcast), daemon=True).start()

    def start_playlist(self):
        self.start_evt.set()
        self.log("Playlist started.")

    def save_settings(self, key=""):
        save_json(CONFIG_PATH, {
            "folder": self.folder_var.get(), "intro": self.intro_var.get(),
            "brb": self.brb_var.get(), "loop": self.loop_var.get(),
            "title": self.title_var.get(), "privacy": self.privacy_var.get(),
            "bcast": self.bcast_var.get(), "remember": self.remember_var.get(),
            "key": key if self.remember_var.get() else "",
            "autonext": self.autonext_var.get(), "sc_method": self.sc_method.get(),
            "sc_height": self.sc_height.get(), "sc_fps": self.sc_fps.get(),
            "sc_kbps": self.sc_kbps.get(), "sc_audio": self.sc_audio.get(),
            "sc_low": self.sc_low.get(),
            "sc_av_ms": int(float(self.sc_av_ms.get() or 0)),
            "sc_audio_mode": self.sc_audio_mode.get(),
            "sc_window": self.sc_window.get(),
            "sc_window2": self.sc_window2.get(),
            "sc_last_tier": self.last_tier,
            "music_on": self.music_on.get(), "music_dir": self.music_dir.get(),
            "music_vol": self.music_vol.get(),
            "default_audio_track": self._default_audio_track,
            "cfg_version": 2,
            "standby_auto": bool(self.cfg.get("standby_auto", False)),
            "show_resource_use": bool(self.cfg.get("show_resource_use", False))})

    def broadcast_request(self):
        if self.bcast_var.get() and self.stream_id:
            return {"title": self.title_var.get().strip() or "Live Stream",
                    "privacy": self.privacy_var.get(), "stream_id": self.stream_id,
                    "use_id": self.chosen_bid, "use_bound": self.chosen_bound}
        return None

    def acquire_broadcast(self, bcast):
        """The broadcast picked in Manage broadcasts, or a freshly created one."""
        if bcast.get("use_id"):
            bid = self.yt.use_broadcast(bcast["use_id"], bcast["stream_id"],
                                        bcast.get("use_bound", ""), self.log)
            self.log("Using your chosen broadcast: https://www.youtube.com/watch?v=" + bid)
            return bid
        bid = self.yt.create_broadcast(bcast["title"], bcast["privacy"], bcast["stream_id"],
                                       self.log)
        self.log("Broadcast created: https://www.youtube.com/watch?v=" + bid)
        return bid

    def finish_broadcast(self, bid):
        """End the broadcast on YouTube. A broadcast you picked is finished after use, so
        the pick is cleared."""
        try:
            self.yt.complete(bid)
        except Exception:
            pass
        if bid == self.chosen_bid:
            self.chosen_bid, self.chosen_bound = None, ""
            self.call_ui(lambda: self.bsel_var.set(BSEL_DEFAULT))

    def manage_broadcasts(self):
        """List the channel's unfinished broadcasts and pick one to stream to. Using an
        existing broadcast avoids the create call that YouTube rate-limits."""
        if not (self.stream_id and self.yt.has_token()):
            messagebox.showinfo("Manage broadcasts", "Sign in with YouTube first.")
            return
        win = tk.Toplevel(self.root)
        win.title("Manage broadcasts")
        win.geometry("860x440")
        win.transient(self.root)
        ttk.Label(win, wraplength=820, justify="left", text=(
            "Pick a broadcast to stream to instead of creating a new one. That skips the "
            "create request YouTube rate-limits. Only unfinished broadcasts are listed. "
            "The one you pick is used on the next Go Live and is ended when the stream "
            "stops. Broadcasts not bound to this app's stream get bound to it first.")).pack(
            fill="x", padx=10, pady=(10, 4))
        cols = ("title", "status", "privacy", "start", "stream")
        tree = ttk.Treeview(win, columns=cols, show="headings", selectmode="browse", height=12)
        for c, t, w in (("title", "Title", 300), ("status", "Status", 80),
                        ("privacy", "Privacy", 80), ("start", "Scheduled", 130),
                        ("stream", "Bound to", 160)):
            tree.heading(c, text=t)
            tree.column(c, width=w, anchor="w")
        tree.pack(fill="both", expand=True, padx=10, pady=4)
        status = tk.StringVar(value="Loading...")
        ttk.Label(win, textvariable=status, foreground="#9aa3b2").pack(fill="x", padx=10)
        data = {}

        def when(s):
            try:
                return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone().strftime(
                    "%b %d %H:%M")
            except Exception:
                return s or ""

        def fill(items):
            tree.delete(*tree.get_children())
            data.clear()
            for b in items:
                sn, st, cd = b.get("snippet", {}), b.get("status", {}), b.get("contentDetails", {})
                bound = cd.get("boundStreamId", "")
                where = ("this app's stream" if bound == self.stream_id
                         else "another stream" if bound else "not bound")
                data[b["id"]] = b
                tree.insert("", "end", iid=b["id"], values=(
                    sn.get("title", "(untitled)"), st.get("lifeCycleStatus", ""),
                    st.get("privacyStatus", ""), when(sn.get("scheduledStartTime", "")), where))
            if self.chosen_bid in data:
                tree.selection_set(self.chosen_bid)
            status.set(f"{len(items)} unfinished broadcast(s)." if items else
                       "No unfinished broadcasts. A new one will be created when you go live.")

        def load():
            status.set("Loading...")

            def work():
                try:
                    items = self.yt._with_retry(self.yt.list_broadcasts, self.log)
                    self.call_ui(lambda: fill(items) if win.winfo_exists() else None)
                except Exception as e:
                    msg = f"Couldn't load broadcasts: {e}"
                    self.call_ui(lambda: status.set(msg) if win.winfo_exists() else None)

            threading.Thread(target=work, daemon=True).start()

        def use():
            sel = tree.selection()
            if not sel:
                return
            b = data[sel[0]]
            self.chosen_bid = b["id"]
            self.chosen_bound = b.get("contentDetails", {}).get("boundStreamId", "")
            title = b.get("snippet", {}).get("title", "(untitled)")
            self.bsel_var.set(f"Broadcast: {title}")
            self.log(f"Next stream will use broadcast: {title}")
            win.destroy()

        def clear():
            self.chosen_bid, self.chosen_bound = None, ""
            self.bsel_var.set(BSEL_DEFAULT)
            win.destroy()

        tree.bind("<Double-Button-1>", lambda e: use())
        bf = ttk.Frame(win)
        bf.pack(fill="x", padx=10, pady=10)
        ttk.Button(bf, text="Use selected", command=use).pack(side="left")
        ttk.Button(bf, text="Create a new one each time", command=clear).pack(
            side="left", padx=8)
        ttk.Button(bf, text="Refresh", command=load).pack(side="left")
        ttk.Button(bf, text="Close", command=win.destroy).pack(side="right")
        load()

    # ------------------------------------------------------------ screen streaming
    def screen_settings(self):
        h = self.sc_height.get()
        win = (self.sc_window.get() or WGC_MONITOR).strip()
        win2 = (self.sc_window2.get() or NO_APP_AUDIO).strip()
        aud = self.sc_audio.get()
        method = normalize_screen_method(self.sc_method.get())
        if method != self.sc_method.get():
            self.sc_method.set(method)
        return {"method": method, "height": 0 if h == "Native" else int(h),
                "fps": int(self.sc_fps.get()), "kbps": int(self.sc_kbps.get()),
                "audio": aud, "mic": aud, "low": self.sc_low.get(),
                "av_offset_ms": max(0, min(1000, int(float(self.sc_av_ms.get() or 0)))),
                "audio_mode": self.sc_audio_mode.get(),
                "window": win if win != WGC_MONITOR else "",
                "window2": win2 if win2 not in (NO_APP_AUDIO, WGC_MONITOR, "") else ""}

    def _drain(self, p, lines):
        """Read ffmpeg's messages so they show in the log (each distinct message once)."""
        seen = set()
        last_stat = time.monotonic()
        prev_snap = None
        try:
            for raw in p.stderr:
                line = raw.decode("utf-8", "replace").strip()
                if not line:
                    continue
                lines.append(line)
                # FFmpeg -progress emits key=value records; keep them for health checks,
                # but do not spam the user-facing log with every progress field.
                progress_match = re.match(
                    r"^(frame|fps|stream_\d+_\d+_q|bitrate|total_size|out_time|out_time_us|out_time_ms|dup_frames|drop_frames|speed|progress)=(.*)$",
                    line)
                if progress_match:
                    key, value = progress_match.group(1), progress_match.group(2).strip()
                    self.screen_progress[key] = value
                    if key == "progress":
                        snap = dict(self.screen_progress)
                        snap["wall_time"] = time.monotonic()
                        self.screen_progress_history.append(snap)
                        if prev_snap is None:
                            prev_snap = snap
                        # One short health line every 10s so drops/dups/bitrate are
                        # visible while streaming without opening a diagnostic report.
                        if snap["wall_time"] - last_stat >= 10:
                            last_stat = snap["wall_time"]
                            real = capture_rate(prev_snap, snap) if prev_snap else None
                            prev_snap = snap
                            msg = "Stats: {} fps, speed {}, bitrate {}, dup {}, drop {}".format(
                                snap.get("fps", "?"), snap.get("speed", "?"),
                                snap.get("bitrate", "?"), snap.get("dup_frames", "?"),
                                snap.get("drop_frames", "?"))
                            if real is not None:
                                msg += f" | REAL capture {real:.1f} fps"
                                tgt = getattr(self, "target_fps", 0)
                                if tgt and real < tgt * 0.8:
                                    msg += (f"  <-- screen grabber only delivers {real:.0f} of "
                                            f"{tgt} fps; YouTube sees a slideshow. Try another "
                                            "capture method (ddagrab) or lower the resolution.")
                            try:
                                if float(str(snap.get("speed", "1")).rstrip("x ")) < 0.97:
                                    msg += ("  <-- TOO SLOW: this PC can't encode in real time, "
                                            "YouTube will buffer. Use a QuickSync method, or "
                                            "lower resolution/fps/bitrate.")
                            except ValueError:
                                pass
                            self.log(msg)
                    continue
                if not re.match(r"^(frame|size)=", line):
                    shown_all = re.sub(r"(rtmps?://[^\s'\"]*/)[^/\s'\"]+", r"\1[STREAM_KEY]", line)[:240]
                    if not self.ffmpeg_msgs or not self.ffmpeg_msgs[-1].endswith(shown_all):
                        self.ffmpeg_msgs.append(f"[{datetime.now():%H:%M:%S}] {shown_all}")
                if line[:50] not in seen and len(seen) < 40:
                    seen.add(line[:50])
                    # ffmpeg network errors can echo the full RTMP url, key included
                    shown = re.sub(r"(rtmps?://[^\s'\"]*/)[^/\s'\"]+", r"\1[STREAM_KEY]", line)
                    self.log("ffmpeg: " + shown[:220])
        except Exception:
            pass

    def start_screen(self, s, tiers, target, stop, test_seconds=None,
                     audio_mode=None):
        """Try capture tiers and require evidence of encoded frames before accepting one."""
        skip_dd = skip_qsv = skip_wgc = False
        loop_info = None
        process_audio_pid = None  # Game Bar–class process loopback (proc-tap)
        process_audio_pid2 = None
        mode_now = audio_mode or s.get("audio_mode")
        win_for_audio = (s.get("window") or "").strip()
        if mode_now in (LOOPBACK_MODE, MIX_MODE) and win_for_audio and process_loopback_available():
            process_audio_pid = window_title_to_pid(win_for_audio)
            if process_audio_pid:
                self.log(f"Audio: process loopback (Game Bar–class) for window "
                         f"{win_for_audio!r} → PID {process_audio_pid}")
                self.log("This captures the game's digital audio before FxSound/BT — "
                         "should avoid radio-static from wireless devices.")
                win2 = (s.get("window2") or "").strip()
                if win2 and win2 not in (NO_APP_AUDIO, WGC_MONITOR, ""):
                    process_audio_pid2 = window_title_to_pid(win2)
                    if process_audio_pid2 and process_audio_pid2 != process_audio_pid:
                        self.log(f"Audio: 2nd app process loopback {win2!r} → PID {process_audio_pid2}")
                    elif process_audio_pid2 == process_audio_pid:
                        self.log("Audio: 2nd app is same process as primary — ignored.")
                        process_audio_pid2 = None
                    else:
                        self.log(f"Could not resolve PID for 2nd app {win2!r} — skipped.")
                        process_audio_pid2 = None
                if mode_now == MIX_MODE:
                    mic = (s.get("mic") or s.get("audio") or "").strip()
                    if mic and mic != NO_AUDIO:
                        self.log(
                            f"Audio: mic '{mic}' noted — not mixed into FFmpeg on the "
                            "process-loopback path (DShow open blocked video). "
                            "Use WASAPI-only for stable live, or add mic in a later build.")
            else:
                self.log(f"Could not resolve PID for window {win_for_audio!r}; "
                         "falling back to endpoint WASAPI loopback.")
        if process_audio_pid is None and mode_now in (LOOPBACK_MODE, MIX_MODE):
            loop_info, why = probe_loopback()
            if loop_info:
                tag = " + mic mix" if mode_now == MIX_MODE else ""
                self.log(f"Audio: system sound via WASAPI loopback of '{loop_info['name']}' "
                         f"({loop_info['rate']} Hz, {loop_info['channels']} ch){tag}")
                if loop_info.get("enhancer"):
                    self.log("WARNING: default playback device looks like an audio enhancer "
                             "(FxSound/Nahimic/Dolby/…). Loopback captures the processed "
                             "signal and often sounds mushed.")
                if re.search(r"(?i)bluetooth|hands-?free|sp-\d+|airpods|headset",
                             loop_info.get("name") or ""):
                    self.log("WARNING: loopback is on a Bluetooth/wireless headset. "
                             "Pick a game window to use process loopback instead.")
                if mode_now == MIX_MODE:
                    mic = (s.get("mic") or s.get("audio") or "").strip()
                    if mic and mic != NO_AUDIO:
                        self.log(
                            f"Audio: mic '{mic}' noted — not mixed into FFmpeg on the "
                            "process-loopback path (DShow open blocked video). "
                            "Use WASAPI-only for stable live, or add mic in a later build.")
                    else:
                        self.log("Audio: MIX mode but no mic device selected — system only.")
            else:
                self.log(f"System-audio capture unavailable: {why}")
                self.log("Streaming with SILENT audio until that is fixed.")
                audio_mode = SILENT_MODE
        # Try the method that worked last time first, so a path that fails on this PC
        # (the GPU path did) doesn't cost 8 seconds on every start.
        if len(tiers) > 1 and self.last_tier in tiers and not self.last_tier.endswith("x264"):
            tiers = [self.last_tier] + [t for t in tiers if t != self.last_tier]
        for tier in tiers:
            if stop.is_set():
                return None, None
            uses_dd = tier.startswith(("gpu", "ddagrab"))
            uses_qsv = (tier.startswith("gpu") or tier.endswith("qsv")
                        or tier == "wgc_qsv")
            uses_wgc = tier.startswith("wgc")
            qsv_encoder = not tier.endswith("x264")
            if (uses_dd and skip_dd) or (uses_qsv and skip_qsv) or (uses_wgc and skip_wgc):
                continue
            self.log(f"Trying {TIER_NAMES.get(tier, tier)}...")
            if uses_wgc and not probe_wgc_backend(force=True):
                self.log(wgc_install_hint())
                self.log(f"App Python: {sys.executable}")
                skip_wgc = True
                continue
            lines = collections.deque(maxlen=300)
            lb_handle = None
            wgc_stop = None
            wgc_err = []
            try:
                wgc_size = wgc_target_size(s) if uses_wgc else None
                use_proc_audio = process_audio_pid is not None
                aport = free_port() if (loop_info or use_proc_audio) else None
                lb_handle = None
                if loop_info and not use_proc_audio:
                    t_open = time.monotonic()
                    lb_handle = open_loopback(loop_info)
                    self.log(f"Audio device opened in {time.monotonic() - t_open:.1f}s")
                # Process loopback always feeds 48 kHz stereo s16le
                if use_proc_audio:
                    audio_tcp = (aport, 48000, 2)
                    # Process loopback + (optional) mic mix runs ~250ms behind picture.
                    # Delay video so A/V match; user still hears ~YT glass latency separately.
                    s = dict(s)
                    ms = int(s.get("av_offset_ms", 280) or 0)
                    s["_av_video_delay"] = max(0.0, min(1.0, ms / 1000.0))
                    if s["_av_video_delay"] > 0:
                        self.log(f"A/V: delaying video by {ms} ms so picture meets process audio")
                elif loop_info:
                    audio_tcp = (aport, loop_info["rate"], loop_info["channels"])
                else:
                    audio_tcp = None
                # Warm ProcTap BEFORE FFmpeg so a 10s test is not 10s of silence
                # while the helper is still starting (was ~11s late in diagnostics).
                proc_helpers, proc_primed, _proc_heard = [], b"", False
                if use_proc_audio:
                    proc_helpers, proc_primed, _proc_heard = warmup_process_audio(
                        process_audio_pid, process_audio_pid2,
                        timeout=12.0, log=self.log)
                cmd = build_screen_cmd(s, tier, target, test_seconds,
                                       audio_mode=audio_mode, wgc_size=wgc_size,
                                       audio_tcp=audio_tcp)
                # Log the exact command shape without leaking the YouTube stream key.
                safe_cmd = list(cmd)
                if safe_cmd and safe_cmd[-1].startswith(("rtmp://", "rtmps://")):
                    safe_cmd[-1] = safe_cmd[-1].rsplit("/", 1)[0] + "/[STREAM_KEY_REDACTED]"
                self.target_fps = int(s["fps"])
                backend = probe_wgc_backend() if uses_wgc else None
                win_name = (s.get("window") or "").strip() or None
                if uses_wgc:
                    src = probe_wgc_size()
                    target_txt = f"window={win_name!r}" if win_name else "entire screen"
                    self.log(f"WGC backend: {backend}; {target_txt}; "
                             f"capture {src[0]}x{src[1]} → pipe {wgc_size[0]}x{wgc_size[1]}")
                self.log("FFmpeg command: " + subprocess.list2cmdline(safe_cmd))
                p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE,
                                     creationflags=NOWIN | (BELOW_NORMAL if s["low"] else 0))
                p._q_ok = True
                proc_registry.register(p)
                if use_proc_audio or loop_info:
                    class _Say:
                        append = staticmethod(lambda m: self.log(m))
                    if use_proc_audio:
                        threading.Thread(
                            target=process_loopback_audio_loop,
                            args=(aport, process_audio_pid, p, _Say(),
                                  process_audio_pid2),
                            kwargs={"helpers": proc_helpers, "primed": proc_primed},
                            daemon=True).start()
                    else:
                        threading.Thread(target=loopback_audio_loop,
                                         args=(aport, loop_info, p, _Say(), lb_handle),
                                         daemon=True).start()
                if uses_wgc:
                    # Let FFmpeg open the audio TCP listen socket before we flood
                    # stdin with video; otherwise early frames can stall under load
                    # while process-loopback is still spawning.
                    if use_proc_audio or loop_info:
                        time.sleep(0.05)
                    # Producer writes BGRA frames into ffmpeg stdin
                    wgc_stop = threading.Event()
                    th = threading.Thread(
                        target=wgc_producer_loop,
                        args=(p.stdin, wgc_size[0], wgc_size[1], int(s["fps"]),
                              wgc_stop, wgc_err, win_name),
                        daemon=True)
                    th.start()
                    p._wgc_stop = wgc_stop
            except Exception as e:
                self.log(f"Couldn't start ffmpeg: {e}")
                try:
                    close_loopback(lb_handle)
                except Exception:
                    pass
                continue
            if test_seconds is None:
                self.sender = p
            self.screen_progress = {}
            self.screen_progress_history = collections.deque(maxlen=2400)
            self.screen_progress_started = time.monotonic()
            threading.Thread(target=self._drain, args=(p, lines), daemon=True).start()

            # A live process alone is not proof of capture. Wait for -progress frame count.
            wait_s = 20.0 if qsv_encoder else 8.0   # QuickSync can take a while to initialise
            if uses_wgc:
                wait_s = max(wait_s, 12.0)
            deadline = time.monotonic() + wait_s
            frames_seen = False
            while time.monotonic() < deadline and not stop.is_set():
                if p.poll() is not None:
                    break
                for line in reversed(list(lines)):
                    m = re.match(r"^frame=\s*(\d+)", line)
                    if m and int(m.group(1)) > 0:
                        frames_seen = True
                        break
                if frames_seen:
                    break
                time.sleep(0.2)

            if stop.is_set():
                if wgc_stop:
                    wgc_stop.set()
                kill_tree(p)
                return None, None

            # For a short local test, a clean process exit can be valid only if frames
            # were actually encoded; normal live streaming must remain alive.
            if frames_seen and (test_seconds is not None or p.poll() is None):
                self.active_screen_tier = tier
                self.active_screen_command = list(cmd)
                if (test_seconds is None and tier != self.last_tier
                        and not tier.endswith("x264")):
                    self.last_tier = tier
                    saved = load_json(CONFIG_PATH)
                    saved["sc_last_tier"] = tier
                    save_json(CONFIG_PATH, saved)
                self.log(f"Capture verified: {TIER_NAMES.get(tier, tier)} (FFmpeg has encoded video frames).")
                self.log(f"Active encoder: {'h264_qsv (Quick Sync)' if qsv_encoder else 'libx264 (CPU)'}; capture tier: {tier}.")
                return p, tier

            if wgc_stop:
                wgc_stop.set()
            kill_tree(p)
            time.sleep(0.2)  # allow the stderr reader to collect the final error
            txt = " ".join(lines).lower()
            if uses_dd and "ddagrab" in txt and ("no such filter" in txt or "not found" in txt):
                skip_dd = True
            if uses_qsv and "qsv" in txt and ("unknown encoder" in txt or "encoder not found" in txt):
                skip_qsv = True
            if uses_wgc and wgc_err:
                self.log("WGC error: " + " | ".join(wgc_err)[:300])
                if "pip install" in " ".join(wgc_err).lower():
                    skip_wgc = True
            reason = (" | ".join(list(lines)[-3:])[:300] if lines else f"exit code {p.returncode}")
            if not frames_seen:
                reason = f"no encoded video frames detected within {int(wait_s)} seconds; " + reason
            self.log(f"{TIER_NAMES[tier]} failed verification ({reason}). Trying next method if available.")
        return None, None

    def preflight_screen_capture(self, s, seconds=5):
        """Encode a short local test. Returns (ok: bool, detail: str).

        Never push RTMP until this (or start_screen's live verify) succeeds.
        """
        stop = threading.Event()
        out = os.path.join(log_dir("preflight"), f"yt_studio_preflight_{os.getpid()}.mp4")
        try:
            try:
                os.remove(out)
            except OSError:
                pass
            self.log(f"Preflight: testing screen capture for {seconds}s (no YouTube yet)...")
            proc, tier = self.start_screen(
                s, SCREEN_METHODS[s["method"]], out, stop,
                test_seconds=seconds, audio_mode=s.get("audio_mode"))
            if proc is None:
                return False, "no capture method produced video"
            try:
                proc.wait(timeout=seconds + 15)
            except Exception:
                kill_tree(proc)
            size = os.path.getsize(out) if os.path.exists(out) else 0
            if size < 10_000:
                return False, f"output too small ({size} bytes) — capture not healthy"
            return True, f"ok via {tier or '?'} ({size // 1024} KB)"
        except Exception as e:
            return False, str(e)
        finally:
            try:
                os.remove(out)
            except OSError:
                pass

    def go_live_screen(self):
        if not sys.platform.startswith("win"):
            messagebox.showerror("Screen", "Screen capture here needs Windows.")
            return
        if not shutil.which("ffmpeg"):
            messagebox.showerror("ffmpeg", "ffmpeg not found on PATH.")
            return
        if self.live:
            if self.mode == "playlist":
                self.switch_to_screen()
            else:
                self.log("Your screen is already streaming.")
            return
        key = self.key_var.get().strip()
        if not key:
            messagebox.showerror("Stream key", "Sign in with YouTube, or paste a stream key.")
            return
        if not self.check_stray_streams():
            return
        ok_disk, disk_msg = check_disk_space(
            [tempfile.gettempdir(), APP_DIR, self.folder_var.get()], min_gb=1.5)
        self.log(disk_msg)
        if not ok_disk:
            if not messagebox.askyesno("Low disk space", disk_msg + "\n\nGo live anyway?"):
                return
        self._stop_standby_for_live()
        self.log("Using ffmpeg: " + (shutil.which("ffmpeg") or "?"))
        self.save_settings(key)
        s = self.screen_settings()
        bcast = self.broadcast_request()
        url = self.ingest_var.get().rstrip("/") + "/" + key
        self.set_status("Preflight: checking capture…")
        self.update_buttons()
        write_last_session(mode="screen", version=APP_VERSION)

        def work():
            ok, detail = self.preflight_screen_capture(s, seconds=5)
            if not ok:
                self.log(f"Preflight FAILED ({detail}). Stream was not started.")
                self.call_ui(lambda: (
                    self.set_status("OFFLINE"),
                    messagebox.showerror(
                        "Screen not ready",
                        "Capture did not produce valid video yet.\n\n"
                        f"Detail: {detail}\n\n"
                        "Fix Screen settings / Test capture, then try again.")))
                return
            self.log(f"Preflight passed ({detail}). Starting live screen…")
            self.call_ui(lambda: self._begin_screen_live(url, bcast, s))

        threading.Thread(target=work, daemon=True).start()

    def _begin_screen_live(self, url, bcast, s):
        self.mode = "screen"
        self.session = {"url": url, "bcast": bcast}
        self.pending_switch = None
        self.holding = False
        self.force_brb_playlist = False
        self.tech_difficulties = False
        self._keep_broadcast = False
        try:
            self._health_actions = HealthActionState(bad_needed=3)
            self._health_live_since = time.monotonic()
        except Exception:
            self._health_live_since = time.monotonic()
        self.stop_evt = threading.Event()
        self.live = True
        self.update_buttons()
        self.set_status("LIVE: starting screen")
        threading.Thread(target=self.screen_worker, args=(url, bcast, s), daemon=True).start()

    def switch_to_screen(self):
        """From the start screen / playlist to your screen, keeping the same YouTube
        broadcast. Capture is preflighted first so a broken pipe never goes to viewers."""
        if self.pending_switch or not self.live or self.mode != "playlist":
            return
        self.save_settings(self.key_var.get().strip())
        s = self.screen_settings()
        self.pending_switch = {"settings": s, "phase": "preflight"}
        self.update_buttons()
        self.log("Switch requested — preflighting capture before leaving start screen…")
        self.set_status("LIVE: preflight capture…")

        def work():
            ok, detail = self.preflight_screen_capture(s, seconds=5)
            sw = self.pending_switch
            if not sw or sw.get("settings") is not s:
                return  # cancelled
            if not ok:
                self.log(f"Preflight FAILED ({detail}). Staying on playlist with "
                         "technical-difficulties message — stream stays up.")
                self.pending_switch = None
                self.tech_difficulties = True
                self.call_ui(lambda: (
                    self.set_status("LIVE: technical difficulties"),
                    self.update_buttons()))
                # Force playlist to leave start-screen and play clips / tech card
                try:
                    self.start_evt.set()
                except Exception:
                    pass
                return
            self.log(f"Preflight passed ({detail}). Switching ingest to your screen…")
            self.pending_switch = {"settings": s, "phase": "switch"}
            self.call_ui(lambda: self.set_status("LIVE: switching to screen"))
            self.stop_evt.set()
            self.cleanup_processes(log_result=False, background=True)

        threading.Thread(target=work, daemon=True).start()

    def _finish_switch(self, sw, bid):
        """Runs on the UI thread once the start-screen/playlist worker has fully stopped."""
        if self.pending_switch is not sw:  # Stop was pressed / preflight-only cancel
            if bid and not getattr(self, "tech_difficulties", False):
                threading.Thread(target=self.finish_broadcast, args=(bid,), daemon=True).start()
            if not getattr(self, "tech_difficulties", False):
                self.log("Stream stopped.")
                self.ui.put(("ended", None))
            return
        if sw.get("phase") == "preflight":
            # Should not reach here; preflight does not stop the playlist worker.
            return
        self.pending_switch = None
        self.mode = "screen"
        self.stop_evt = threading.Event()  # fresh event: the old workers keep the old one
        self.update_buttons()
        self.set_status("LIVE: starting screen")
        sess = self.session or {}
        threading.Thread(target=self.screen_worker,
                         args=(sess.get("url"), sess.get("bcast"), sw["settings"], bid),
                         daemon=True).start()

    def health_watch(self, stream_id, stop):
        """While live, ask YouTube every 30s what it thinks of the incoming stream and log
        it whenever that changes (e.g. bitrate too low, frames missing, keyframes too far
        apart). This is YouTube's own view of what arrives, which ffmpeg's local stats
        can't show. After several consecutive bad reports, auto-BRB (cooldown-limited)."""
        last = None
        while not stop.wait(30):
            try:
                _, h = self.yt.stream_status(stream_id)
            except Exception:
                continue
            issues = h.get("configurationIssues") or []
            sig = (h.get("status"), tuple(i.get("type") for i in issues))
            status = health_alert(self, h)
            action = None
            try:
                action = self._health_actions.note(status)
            except Exception:
                action = None
            # Never auto-BRB on the start screen, or during the first 2 minutes while
            # YouTube often reports noData/bad before the ingest is fully up.
            on_start_screen = (
                self.mode == "playlist" and not self.start_evt.is_set())
            too_early = (time.monotonic() - getattr(self, "_health_live_since", 0)) < 120.0
            if (action == "brb" and self.live and not self.holding
                    and not on_start_screen and not too_early):
                self.log("Auto-action: YouTube health stayed bad — switching to BRB card "
                         "(broadcast stays up). Press Resume when ready.")
                self.call_ui(self.enter_brb)
            elif action == "brb" and (on_start_screen or too_early):
                self.log("YouTube health still settling — not switching to BRB yet.")
            if sig == last:
                continue
            last = sig
            if not issues:
                self.log(f"YouTube stream health: {h.get('status', '?')}")
                continue
            self.log(f"YouTube stream health: {h.get('status', '?')}")
            shown = set()
            for i in issues:
                if i.get("type") in shown:
                    continue
                shown.add(i.get("type"))
                self.log("  - {} ({}): {} {}".format(
                    i.get("type", "?"), i.get("severity", "?"),
                    i.get("reason", ""), i.get("description", "")).strip())

    def confirm_live(self, bcast, stop):
        """Wait until YouTube reports the incoming stream as active, then make sure the
        broadcast is LIVE. Auto-start alone can leave API-created or hand-picked
        broadcasts queued, so the transition is requested explicitly. `stop` is the
        stop event of the session this runs for."""
        stream_id = bcast.get("stream_id")
        if not (stream_id and self.broadcast_id):
            return
        bid = self.broadcast_id
        self.log("Waiting for YouTube to detect the incoming stream...")
        ingest_active = False
        deadline = time.monotonic() + 40.0
        last_stream_status = "not checked"
        while time.monotonic() < deadline and not stop.is_set():
            try:
                last_stream_status, health = self.yt.stream_status(stream_id)
                self.log(f"YouTube ingest status: {last_stream_status}")
                if last_stream_status == "active":
                    ingest_active = True
                    break
                if last_stream_status == "error":
                    self.log(f"YouTube reports an ingest error: {health}")
                    break
            except Exception as e:
                self.log(f"Couldn't check YouTube ingest status yet: {e}")
            time.sleep(3.0)
        if stop.is_set():
            return
        if not ingest_active:
            self.log(f"YouTube did not report an active ingest within 40 seconds "
                     f"(last status: {last_stream_status}). The stream is running, "
                     "but the broadcast may remain queued; check stream health and key binding.")
            return
        try:
            if self.yt.broadcast_status(bid) == "live":
                self.log("CONFIRMED: YouTube broadcast is already LIVE.")
                return
        except Exception:
            pass
        try:
            self.yt.start_broadcast(bid)
            self.log("YouTube accepted the LIVE transition request; waiting for confirmation...")
        except Exception as e:
            self.log(f"LIVE transition response: {e}")
            auto_started = False
            if "invalid transition" in str(e).lower() or getattr(e, "reason", "") == "invalidTransition":
                # The broadcast has auto-start on, so YouTube is usually already moving it to
                # live. Give it time and look at the real status before doing anything else.
                cur, t_end = "?", time.monotonic() + 25.0
                while time.monotonic() < t_end and not stop.is_set():
                    try:
                        cur = self.yt.broadcast_status(bid)
                    except Exception:
                        pass
                    self.log(f"YouTube broadcast status: {cur}")
                    if cur in ("live", "liveStarting"):
                        auto_started = True
                        break
                    time.sleep(3.0)
            # A broadcast made in YouTube Studio usually has the monitor stream on, and
            # YouTube then only allows ready -> testing -> live.
            if (not auto_started and ("invalid transition" in str(e).lower()
                                      or getattr(e, "reason", "") == "invalidTransition")):
                self.log("Trying YouTube's 'testing' step first, then LIVE...")
                try:
                    self.yt.transition(bid, "testing")
                    t_end = time.monotonic() + 30.0
                    while time.monotonic() < t_end and not stop.is_set():
                        st = self.yt.broadcast_status(bid)
                        self.log(f"YouTube broadcast status: {st}")
                        if st in ("testing", "live"):
                            break
                        time.sleep(3.0)
                    if stop.is_set():
                        return
                    if self.yt.broadcast_status(bid) != "live":
                        self.yt.start_broadcast(bid)
                        self.log("YouTube accepted the LIVE transition request; waiting for confirmation...")
                except Exception as e2:
                    self.log(f"YouTube won't let this app start that broadcast ({e2}). "
                             "Open YouTube Studio > Go live and press 'Go live' there. "
                             "The stream is already connected.")
                    return
        broadcast_live = False
        status_deadline = time.monotonic() + 45.0
        last_broadcast_status = "not checked"
        while time.monotonic() < status_deadline and not stop.is_set():
            try:
                last_broadcast_status = self.yt.broadcast_status(bid)
                self.log(f"YouTube broadcast status: {last_broadcast_status}")
                if last_broadcast_status == "live":
                    broadcast_live = True
                    break
                if last_broadcast_status in ("complete", "revoked"):
                    break
            except Exception as e:
                self.log(f"Couldn't confirm broadcast status yet: {e}")
            time.sleep(3.0)
        if broadcast_live:
            self.log("CONFIRMED: YouTube broadcast is LIVE.")
        elif not stop.is_set():
            self.log(f"WARNING: YouTube has not confirmed LIVE status after 45 seconds "
                     f"(last status: {last_broadcast_status}). Keep this stream running "
                     "and check YouTube Studio; the API status/error above should identify why.")

    def screen_worker(self, url, bcast, s, existing_id=None):
        self.broadcast_id = existing_id
        resume_playlist = False
        try:
            if existing_id:
                self.log("Keeping the same YouTube broadcast while switching to your screen.")
            elif bcast:
                try:
                    self.broadcast_id = self.acquire_broadcast(bcast)
                except Exception as e:
                    self.log(f"Couldn't set up the broadcast ({e}). Streaming to your key anyway; "
                             "start it in YouTube Studio if it doesn't go live.")
            proc, tier = self.start_screen(s, SCREEN_METHODS[s["method"]], url, self.stop_evt,
                                           audio_mode=s.get("audio_mode"))
            dev = (s.get("audio") or "").strip()
            if (not proc and not self.stop_evt.is_set() and s.get("audio_mode") == DSHOW_MODE
                    and dev and dev != NO_AUDIO):
                self.log(f"No method started. Your audio device ({dev}) may be stuck, so I'm "
                         "trying once more WITHOUT audio.")
                proc, tier = self.start_screen(s, SCREEN_METHODS[s["method"]], url, self.stop_evt,
                                               audio_mode=SILENT_MODE)
                if proc:
                    self.log("WARNING: streaming with SILENT audio because the audio device did not "
                             "respond. Restart the audio device (e.g. Voicemeeter), then restart the "
                             "stream to get sound back.")
            if not proc:
                if not self.stop_evt.is_set():
                    self.log("No capture method worked after preflight/live verify.")
                    if existing_id:
                        # Keep the YouTube broadcast up; fall back to playlist + message
                        resume_playlist = True
                        self.log("Falling back to playlist with technical-difficulties screen.")
                return
            # Encoded frames prove local capture, not that YouTube has accepted the
            # ingest, so confirm_live waits for YouTube and makes sure the broadcast is LIVE.
            if bcast and bcast.get("stream_id"):
                threading.Thread(target=self.health_watch,
                                 args=(bcast["stream_id"], self.stop_evt), daemon=True).start()
            if bcast and self.broadcast_id:
                self.confirm_live(bcast, self.stop_evt)
                if self.stop_evt.is_set():
                    return
            self.set_status("Streaming screen (YouTube confirmation pending/received)")
            recoveries = 0
            while not self.stop_evt.is_set():
                # BRB holding card — keep same RTMP URL / broadcast, no screen capture
                if self.holding:
                    self.set_status("LIVE: BRB")
                    try:
                        kill_tree(proc)
                    except Exception:
                        pass
                    self._run_holding_rtmp(url, self.stop_evt)
                    if self.stop_evt.is_set():
                        break
                    if not self.holding:
                        self.log("Resuming screen capture after BRB...")
                        s = self.screen_settings()  # pick up bitrate preset changes
                        proc, tier = self.start_screen(
                            s, SCREEN_METHODS[s["method"]], url, self.stop_evt,
                            audio_mode=s.get("audio_mode"))
                        if not proc:
                            self.log("Could not resume screen after BRB.")
                            break
                        self.set_status("Streaming screen")
                        recoveries = 0
                        continue
                if proc is None or proc.poll() is not None:
                    code = None if proc is None else proc.returncode
                    self.log(f"Screen FFmpeg exited unexpectedly (code {code}).")
                    if self.holding:
                        continue
                    new_proc = restart_screen(self, url, s, proc) if recoveries < 5 else None
                    if new_proc is not None:
                        proc = new_proc
                        recoveries += 1
                        continue
                    self.log("Couldn't bring the screen capture back. Check the FFmpeg errors, "
                             "then start a new stream manually if needed.")
                    if existing_id:
                        resume_playlist = True
                    break
                time.sleep(0.5)
        except Exception as e:
            self.log(f"Stream error: {e}")
            if existing_id:
                resume_playlist = True
        finally:
            do_resume = bool(resume_playlist and existing_id and not self.stop_evt.is_set()
                             and not self._keep_broadcast)
            if do_resume:
                self.kill_procs()
                self.tech_difficulties = True
                self.mode = "playlist"
                self.broadcast_id = existing_id
                self.session = {"url": url, "bcast": bcast}
                self.stop_evt = threading.Event()
                self.live = True
                try:
                    self.start_evt.set()
                except Exception:
                    pass
                self.call_ui(lambda: (
                    self.set_status("LIVE: technical difficulties"),
                    self.update_buttons()))
                threading.Thread(
                    target=self.stream_worker, args=(url, bcast), daemon=True).start()
            else:
                self.stop_evt.set()
                self.kill_procs()
                if self.broadcast_id and not self._keep_broadcast:
                    self.finish_broadcast(self.broadcast_id)
                self._keep_broadcast = False
                self.holding = False
                self.log("Stream stopped.")
                self.ui.put(("ended", None))

    def test_capture(self, s):
        """Record 10s screen+audio, write a detailed diagnostic .log, then play back."""
        if self.live:
            self.log("Stop the stream before running a test.")
            return
        if not sys.platform.startswith("win"):
            self.log("Screen capture here needs Windows.")
            return

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.save_settings(self.key_var.get())   # the audio feeder reads the saved settings
        out_dir = log_dir("screen_test")
        try:
            os.makedirs(out_dir, exist_ok=True)
        except Exception:
            out_dir = self.edit_tmp
        out = os.path.join(out_dir, f"screen_test_{stamp}.mp4")
        log_path = os.path.join(out_dir, f"screen_test_{stamp}.log")
        wav_extract = os.path.join(out_dir, f"screen_test_{stamp}_audio.wav")
        stop = threading.Event()
        self.log(f"Screen+audio test: 10s → {out}")
        self.log(f"Diagnostic log → {log_path}")
        self.log("Play game/music now so audio is present during the test.")

        def work():
            lines = []
            def L(msg):
                lines.append(msg)
                self.call_ui(lambda m=msg: self.log(m))

            L("=" * 70)
            L("YT Stream Studio — Screen + Audio Test Diagnostic")
            L("=" * 70)
            L(f"Generated: {datetime.now().isoformat(timespec='seconds')}")
            L(f"Python: {sys.executable}")
            L(f"Settings: method={s.get('method')!r} height={s.get('height')} "
              f"fps={s.get('fps')} kbps={s.get('kbps')} audio_mode={s.get('audio_mode')!r}")
            L(f"Window target: {s.get('window') or '(entire screen)'}")
            L(f"Audio device / mic: {s.get('audio')!r}")
            L(f"Output MP4: {out}")
            L("-" * 70)
            L("1. CAPTURE RUN")
            L("-" * 70)

            t0 = time.monotonic()
            p, tier = self.start_screen(s, SCREEN_METHODS[s["method"]], out, stop,
                                        test_seconds=10, audio_mode=s.get("audio_mode"))
            if not p:
                L("RESULT: no capture method started (see earlier FFmpeg / WGC messages).")
                try:
                    with open(log_path, "w", encoding="utf-8") as f:
                        f.write("\n".join(lines) + "\n")
                except Exception:
                    pass
                self.call_ui(lambda: self.log(f"Screen test failed. Log: {log_path}"))
                return

            L(f"Active tier: {tier} ({TIER_NAMES.get(tier, tier)})")
            timed_out = False
            try:
                rc = p.wait(timeout=35)
            except subprocess.TimeoutExpired:
                timed_out = True
                kill_tree(p)
                rc = p.poll()
            elapsed = time.monotonic() - t0
            size = os.path.getsize(out) if os.path.exists(out) else 0
            L(f"FFmpeg exit={rc} timed_out={timed_out} wall_time={elapsed:.1f}s "
              f"file_size={size} bytes")

            # Progress history collected during the run (dup/drop/speed)
            hist = list(getattr(self, "screen_progress_history", []) or [])
            if hist:
                L("-" * 70)
                L("2. ENCODE PROGRESS SNAPSHOTS (from -progress)")
                L("-" * 70)
                for snap in hist[-12:]:
                    try:
                        L(f"  frame={snap.get('frame')} fps={snap.get('fps')} "
                          f"speed={snap.get('speed')} "
                          f"dup={snap.get('dup_frames')} drop={snap.get('drop_frames')} "
                          f"bitrate={snap.get('bitrate')} "
                          f"out_time={snap.get('out_time_ms')}")
                    except Exception:
                        L(f"  {snap}")
                # REAL capture estimate from first→last
                if len(hist) >= 2:
                    real = capture_rate(hist[0], hist[-1])
                    if real is not None:
                        L(f"Estimated REAL capture over test: {real:.1f} fps "
                          f"(target {s.get('fps')})")
            else:
                L("2. No progress snapshots recorded.")

            L("-" * 70)
            L("3. CONTAINER / STREAM PROBE (ffprobe)")
            L("-" * 70)
            probe = shutil.which("ffprobe")
            valid_video = False
            vinfo = ainfo = {}
            if probe and size > 4096:
                pr = subprocess.run([
                    probe, "-v", "error", "-show_format", "-show_streams",
                    "-of", "json", out
                ], capture_output=True, text=True, encoding="utf-8", errors="replace",
                    timeout=20, creationflags=NOWIN)
                L(f"ffprobe exit={pr.returncode}")
                try:
                    data = json.loads(pr.stdout or "{}")
                except Exception:
                    data = {}
                fmt = data.get("format") or {}
                L(f"format: duration={fmt.get('duration')} size={fmt.get('size')} "
                  f"bit_rate={fmt.get('bit_rate')} format_name={fmt.get('format_name')}")
                for st in data.get("streams") or []:
                    ctype = st.get("codec_type")
                    if ctype == "video":
                        valid_video = True
                        vinfo = st
                        L(f"video: codec={st.get('codec_name')} {st.get('width')}x{st.get('height')} "
                          f"pix_fmt={st.get('pix_fmt')} fps={st.get('r_frame_rate')} "
                          f"nb_frames={st.get('nb_frames')} start={st.get('start_time')}")
                    elif ctype == "audio":
                        ainfo = st
                        L(f"audio: codec={st.get('codec_name')} rate={st.get('sample_rate')} "
                          f"ch={st.get('channels')} bitrate={st.get('bit_rate')} "
                          f"start={st.get('start_time')} duration={st.get('duration')}")
                if not ainfo:
                    L("WARNING: no audio stream in the file (silent or audio failed).")
            else:
                L("ffprobe skipped or file too small.")

            L("-" * 70)
            L("4. EXTRACTED AUDIO ANALYSIS")
            L("-" * 70)
            stats = {}
            if ainfo and probe and size > 4096:
                try:
                    er = subprocess.run([
                        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                        "-i", out, "-vn", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2",
                        wav_extract
                    ], capture_output=True, text=True, encoding="utf-8", errors="replace",
                        timeout=30, creationflags=NOWIN)
                    L(f"extract wav exit={er.returncode} → {wav_extract}")
                    if er.returncode == 0 and os.path.exists(wav_extract):
                        import wave
                        with wave.open(wav_extract, "rb") as w:
                            rate, ch = w.getframerate(), w.getnchannels()
                            pcm = w.readframes(w.getnframes())
                        stats = analyze_pcm16(pcm, ch, rate)
                        for k, v in stats.items():
                            L(f"  {k}: {v}")
                        peak = stats.get("peak") or 0
                        silence = stats.get("silence_ratio") or 1
                        clip = stats.get("clip_ratio") or 0
                        if peak < 0.01 or silence > 0.95:
                            L("INTERPRET: near silence in muxed file — audio may not have "
                              "reached the encoder while video was capturing.")
                        elif clip > 0.01:
                            L("INTERPRET: clipping in muxed audio — lower system/game volume.")
                        else:
                            L("INTERPRET: audio signal present in the file. If it sounds "
                              "mushed, compare this WAV to the pure audio diagnostic WAV.")
                    else:
                        L(f"extract failed: {(er.stderr or '')[-300:]}")
                except Exception as e:
                    L(f"Audio extract/analysis error: {e}")
            else:
                L("Skipped (no audio stream).")

            # A/V start-time skew if both present
            L("-" * 70)
            L("5. A/V TIMING")
            L("-" * 70)
            try:
                vs = float(vinfo.get("start_time") or 0)
                as_ = float(ainfo.get("start_time") or 0)
                L(f"video start_time={vs:.4f}s  audio start_time={as_:.4f}s  "
                  f"skew(audio-video)={(as_ - vs)*1000:.1f} ms")
                if abs(as_ - vs) > 0.08:
                    L("NOTE: >80ms A/V start skew can feel like lag or mushy lipsync.")
            except Exception:
                L("Could not compute start_time skew.")

            L("-" * 70)
            L("6. FILES")
            L("-" * 70)
            L(f"Log: {log_path}")
            L(f"MP4: {out}")
            L(f"Extracted WAV: {wav_extract if os.path.exists(wav_extract) else '(none)'}")
            L("=" * 70)
            L("END OF SCREEN+AUDIO DIAGNOSTIC")

            try:
                with open(log_path, "w", encoding="utf-8") as f:
                    f.write("\n".join(lines) + "\n")
            except Exception as e:
                self.call_ui(lambda: self.log(f"Could not write screen test log: {e}"))

            def done():
                self.log(f"Screen+audio diagnostic written: {log_path}")
                try:
                    os.startfile(log_path)
                except Exception:
                    pass
                if not timed_out and rc == 0 and valid_video:
                    self.log(f"Test OK with {TIER_NAMES.get(tier, tier)}. Playing back.")
                    self.load_player(out, 0.0, "preview", autoplay=True)
                    messagebox.showinfo(
                        "Screen+audio test",
                        f"Recording finished.\n\n"
                        f"Log:\n{log_path}\n\n"
                        f"MP4:\n{out}\n\n"
                        "Listen to the playback. If audio is mushed only here "
                        "(not in pure audio test), paste this .log for analysis.")
                else:
                    messagebox.showerror(
                        "Screen+audio test",
                        f"Test had problems (exit={rc}, timed_out={timed_out}, "
                        f"video_ok={valid_video}).\n\nLog:\n{log_path}")
            self.call_ui(done)

        threading.Thread(target=work, daemon=True).start()

    def refresh_audio_devices(self, combo):
        self.log("Looking for audio devices...")

        def work():
            devs = [NO_AUDIO] + list_audio_devices()

            def done():
                self.audio_devices = devs
                combo.configure(values=devs)
                # Re-apply the previously chosen device if it is still available
                current = self.sc_audio.get()
                if current in devs:
                    combo.set(current)
                else:
                    # Keep whatever the user currently has selected in the box if valid
                    selected = combo.get()
                    if selected in devs:
                        self.sc_audio.set(selected)
                    else:
                        self.sc_audio.set(NO_AUDIO)
                        combo.set(NO_AUDIO)
                hint = next((d for d in devs if any(k in d.lower() for k in (
                    "stereo mix", "cable output", "loopback", "what u hear"))), None)
                self.log(f"Found {len(devs) - 1} audio device(s)."
                         + (f" '{hint}' captures what you hear." if hint else
                            " No 'Stereo Mix' found: you'd stream mic or silence only."))

            self.call_ui(done)

        threading.Thread(target=work, daemon=True).start()

    def _on_device_selected(self, event=None):
        """Persist the selected DirectShow recording / mic device."""
        if not hasattr(self, "_device_combo"):
            return
        value = self._device_combo.get().strip()
        if self.sc_audio_mode.get() in (DSHOW_MODE, MIX_MODE):
            self.sc_audio.set(value)
        self.save_settings(self.key_var.get())

    def _init_audio_device_ui(self):
        """Populate the device selector for DSHOW / MIX / loopback / silent."""
        mode = self.sc_audio_mode.get()
        if not hasattr(self, "_device_combo"):
            return
        if not getattr(self, "_device_combo_bound", False):
            self._device_combo.bind("<<ComboboxSelected>>", self._on_device_selected)
            self._device_combo_bound = True

        if mode in (DSHOW_MODE, MIX_MODE):
            label = "Mic (DirectShow)" if mode == MIX_MODE else "DirectShow recording device"
            self._device_label.configure(text=label)
            devs = [NO_AUDIO] + list_audio_devices()
            self._device_combo.configure(values=devs)
            current = self.sc_audio.get().strip()
            if current and current in devs:
                self._device_combo.set(current)
            else:
                selected = self._device_combo.get().strip()
                if selected and selected in devs:
                    self.sc_audio.set(selected)
                else:
                    self.sc_audio.set(NO_AUDIO)
                    self._device_combo.set(NO_AUDIO)
            self._find_btn.configure(text="Find devices",
                                     command=lambda: self.refresh_audio_devices(self._device_combo),
                                     state="normal")
        elif mode == LOOPBACK_MODE:
            self._device_label.configure(text="Audio source")
            self._device_combo.configure(values=["Default speakers (whatever Windows is playing)"])
            self._device_combo.set("Default speakers (whatever Windows is playing)")
            self._find_btn.configure(state="disabled")
        else:
            self._device_label.configure(text="Audio device (none)")
            self._device_combo.configure(values=[SILENT_MODE])
            self._device_combo.set(SILENT_MODE)
            self._find_btn.configure(state="disabled")

    def _on_find_audio_devices(self):
        if self.sc_audio_mode.get() in (DSHOW_MODE, MIX_MODE):
            self.refresh_audio_devices(self._device_combo)

    def test_audio_capture(self):
        """Audio-only diagnostic: record ~8s, write WAV + detailed .log (like the benchmark).

        Uses the same WASAPI feeder path as live streaming so mush/burst artifacts show up
        in numbers you can paste, not only by ear.
        """
        if self.live:
            messagebox.showwarning("Test capture", "Stop the stream before running an audio test.")
            return
        mode = self.sc_audio_mode.get()
        if mode == SILENT_MODE:
            messagebox.showinfo("Silent test", "Silent mode produces no audio to test.")
            return

        device = self.sc_audio.get().strip()
        if (not device or device == NO_AUDIO) and hasattr(self, "_device_combo"):
            device = self._device_combo.get().strip()
            if device and device != NO_AUDIO:
                self.sc_audio.set(device)

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_dir = log_dir("audio_test")
        try:
            os.makedirs(out_dir, exist_ok=True)
        except Exception:
            out_dir = self.edit_tmp
        log_path = os.path.join(out_dir, f"audio_diag_{stamp}.log")
        wav_path = os.path.join(out_dir, f"audio_diag_{stamp}.wav")
        aac_path = os.path.join(out_dir, f"audio_diag_{stamp}_streamlike.m4a")
        seconds = 8

        self.log(f"Audio diagnostic: {seconds}s, mode={mode}. Play game/music NOW. "
                 f"Log → {log_path}")

        def work():
            lines = []
            def L(msg):
                lines.append(msg)
                self.call_ui(lambda m=msg: self.log(m))

            L("=" * 70)
            L("YT Stream Studio — Audio Diagnostic Report")
            L("=" * 70)
            L(f"Generated: {datetime.now().isoformat(timespec='seconds')}")
            L(f"Python: {sys.executable}")
            L(f"Mode: {mode}")
            L(f"Duration requested: {seconds}s")
            L(f"Output folder: {out_dir}")
            L("-" * 70)
            L("1. DEVICE / ENVIRONMENT")
            L("-" * 70)

            pcm = b""
            rate = 48000
            ch = 2
            info = None
            err = ""
            ffmpeg_stderr = ""

            try:
                if mode in (LOOPBACK_MODE, MIX_MODE):
                    L("Backend: WASAPI loopback (same feeder as live stream)")
                    pcm, info, err = record_loopback_pcm(seconds)
                    if info:
                        rate, ch = info["rate"], info["channels"]
                        L(f"Loopback device: {info['name']}")
                        L(f"Index={info['index']}  rate={rate}  channels={ch}")
                    if err:
                        L(f"ERROR: {err}")
                    if mode == MIX_MODE:
                        L(f"Mic (DirectShow) selected: {device or '(none)'}")
                        L("Note: mix is applied only on the live/stream path; this test records "
                          "system loopback alone so we can isolate mush/artifacts.")
                elif mode == DSHOW_MODE:
                    if not device or device == NO_AUDIO:
                        L("ERROR: no DirectShow device selected")
                        err = "Select a DirectShow audio device first."
                    else:
                        L(f"Backend: DirectShow  device={device!r}")
                        cmd = [
                            "ffmpeg", "-hide_banner", "-loglevel", "info", "-y",
                            "-f", "dshow", "-rtbufsize", "16M", "-audio_buffer_size", "30",
                            "-thread_queue_size", "128", "-i", f"audio={device}",
                            "-t", str(seconds), "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2",
                            wav_path,
                        ]
                        L("FFmpeg command: " + subprocess.list2cmdline(cmd))
                        try:
                            r = subprocess.run(cmd, capture_output=True, text=True,
                                               encoding="utf-8", errors="replace",
                                               creationflags=NOWIN, timeout=seconds + 25)
                            ffmpeg_stderr = (r.stderr or "")[-4000:]
                            L(f"FFmpeg exit code: {r.returncode}")
                            if r.returncode != 0:
                                err = ffmpeg_stderr[-500:] or "ffmpeg failed"
                            elif os.path.exists(wav_path):
                                import wave
                                with wave.open(wav_path, "rb") as w:
                                    rate = w.getframerate()
                                    ch = w.getnchannels()
                                    pcm = w.readframes(w.getnframes())
                                L(f"WAV written: {wav_path} ({os.path.getsize(wav_path)} bytes)")
                        except Exception as e:
                            err = str(e)
                            L(f"ERROR running ffmpeg: {e}")
                else:
                    err = f"Unsupported mode for audio test: {mode}"
                    L(err)
            except Exception as e:
                err = str(e)
                L(f"Unhandled error: {e}")

            L("-" * 70)
            L("2. SIGNAL ANALYSIS (raw PCM)")
            L("-" * 70)
            stats = {}
            if pcm and not err:
                if mode in (LOOPBACK_MODE, MIX_MODE):
                    try:
                        write_wav_s16le(wav_path, pcm, rate, ch)
                        L(f"WAV written: {wav_path} ({len(pcm)} PCM bytes)")
                    except Exception as e:
                        L(f"Could not write WAV: {e}")
                stats = analyze_pcm16(pcm, ch, rate)
                for k, v in stats.items():
                    L(f"  {k}: {v}")
                # Interpret
                L("-" * 70)
                L("3. INTERPRETATION")
                L("-" * 70)
                peak = stats.get("peak", 0) or 0
                silence = stats.get("silence_ratio", 1) or 1
                clip = stats.get("clip_ratio", 0) or 0
                if peak < 0.01 or silence > 0.95:
                    L("RESULT: SILENCE / near-silence. Play audio through the default "
                      "speakers/headphones and retest.")
                elif clip > 0.01:
                    L("RESULT: CLIPPING detected. Lower Windows/game volume; distorted/mushy "
                      "sound is expected when samples hit full scale.")
                elif peak > 0.95:
                    L("RESULT: Very hot signal (near full scale). May sound harsh; lower volume.")
                else:
                    L("RESULT: Signal present. If you still hear mush/artifacts on the WAV, "
                      "compare the raw WAV vs the stream-like AAC encode below.")
                # Stream-like encode (same AAC settings as live) for A/B listening
                L("-" * 70)
                L("4. STREAM-LIKE AAC ENCODE (same profile as live)")
                L("-" * 70)
                try:
                    cmd_aac = [
                        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
                        "-f", "s16le", "-ar", str(rate), "-ac", str(ch), "-i", "pipe:0",
                        "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "128k",
                        "-ar", "48000", "-ac", "2", aac_path,
                    ]
                    L("FFmpeg command: " + subprocess.list2cmdline(cmd_aac))
                    r2 = subprocess.run(cmd_aac, input=pcm, capture_output=True,
                                        creationflags=NOWIN, timeout=60)
                    L(f"AAC exit code: {r2.returncode}")
                    if r2.returncode == 0 and os.path.exists(aac_path):
                        L(f"AAC written: {aac_path} ({os.path.getsize(aac_path)} bytes)")
                        L("Listen to WAV (raw capture) vs M4A (what YouTube roughly gets).")
                    else:
                        err2 = (r2.stderr or b"").decode("utf-8", "replace")[-400:]
                        L(f"AAC encode failed: {err2}")
                except Exception as e:
                    L(f"AAC encode error: {e}")
            else:
                L(f"No PCM to analyze. err={err!r}")

            if ffmpeg_stderr:
                L("-" * 70)
                L("5. FFMPEG STDERR (tail)")
                L("-" * 70)
                for ln in ffmpeg_stderr.splitlines()[-40:]:
                    L(ln)

            L("-" * 70)
            L("6. FILES")
            L("-" * 70)
            L(f"Log: {log_path}")
            L(f"WAV: {wav_path if os.path.exists(wav_path) else '(not written)'}")
            L(f"AAC: {aac_path if os.path.exists(aac_path) else '(not written)'}")
            L("=" * 70)
            L("END OF AUDIO DIAGNOSTIC")

            try:
                with open(log_path, "w", encoding="utf-8") as f:
                    f.write("\n".join(lines) + "\n")
            except Exception as e:
                self.call_ui(lambda: self.log(f"Could not write audio log: {e}"))

            def done():
                self.log(f"Audio diagnostic finished. Log: {log_path}")
                try:
                    if os.path.exists(log_path):
                        os.startfile(log_path)
                except Exception:
                    pass
                summary = []
                if err and not pcm:
                    messagebox.showerror("Audio diagnostic", f"Failed.\n{err}\n\nLog:\n{log_path}")
                    return
                if stats:
                    summary.append(f"Peak {stats.get('peak', 0):.0%}  RMS {stats.get('rms', 0):.0%}")
                    summary.append(f"Silence {stats.get('silence_ratio', 0):.0%}  Clip {stats.get('clip_ratio', 0):.2%}")
                    summary.append(f"Duration {stats.get('duration_s', 0)}s @ {stats.get('sample_rate')} Hz")
                messagebox.showinfo(
                    "Audio diagnostic",
                    "Recording finished.\n\n"
                    + ("\n".join(summary) + "\n\n" if summary else "")
                    + f"Log:\n{log_path}\n\n"
                    f"WAV (raw):\n{wav_path}\n\n"
                    "Play the WAV. If it already sounds mushed, the problem is capture. "
                    "If only the live stream sounds bad, it's encode/sync. "
                    "Paste the .log here for analysis.")
            self.call_ui(done)

        threading.Thread(target=work, daemon=True).start()

    # ------------------------------------------------------------ performance report (v2)
    def generate_performance_report(self):
        """One dialog -> one report file with everything needed to debug game streaming."""
        if getattr(self, "_diag_busy", False):
            messagebox.showinfo("Performance Report", "A report is already running.")
            return
        win = tk.Toplevel(self.root)
        win.title("Generate Performance Report")
        win.transient(self.root)
        f = ttk.Frame(win, padding=14)
        f.pack(fill="both", expand=True)
        mode = tk.StringVar(value="live" if self.live else "offline")
        delay = tk.StringVar(value="15")
        dur = tk.StringVar(value="45")
        ttk.Label(f, justify="left", wraplength=470, text=(
            "For a report that means something, START YOUR GAME FIRST. After you press Start "
            "the app waits for the delay below so you can switch into the game (the app is "
            "not the active window otherwise). A short beep marks when measuring starts and ends.")
        ).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 10))
        rb1 = ttk.Radiobutton(f, variable=mode, value="live",
                              text="Measure the LIVE stream (stream keeps running)")
        rb2 = ttk.Radiobutton(f, variable=mode, value="offline",
                              text="Offline test: capture + encode locally, nothing is sent to YouTube")
        rb3 = ttk.Radiobutton(f, variable=mode, value="system", text="System info only (no measuring)")
        rb1.grid(row=1, column=0, columnspan=2, sticky="w")
        rb2.grid(row=2, column=0, columnspan=2, sticky="w")
        rb3.grid(row=3, column=0, columnspan=2, sticky="w")
        if self.live:
            rb2.state(["disabled"])
        else:
            rb1.state(["disabled"])
        ttk.Label(f, text="Wait before measuring (seconds)").grid(row=4, column=0, sticky="e", pady=(10, 2))
        ttk.Combobox(f, textvariable=delay, values=["0", "10", "15", "30", "45"], width=6,
                     state="readonly").grid(row=4, column=1, sticky="w", pady=(10, 2), padx=6)
        ttk.Label(f, text="Measure for (seconds)").grid(row=5, column=0, sticky="e", pady=2)
        ttk.Combobox(f, textvariable=dur, values=["30", "45", "60", "90", "120"], width=6,
                     state="readonly").grid(row=5, column=1, sticky="w", pady=2, padx=6)
        bf = ttk.Frame(f)
        bf.grid(row=6, column=0, columnspan=2, sticky="e", pady=(12, 0))

        def go():
            m, dl, du = mode.get(), int(delay.get()), int(dur.get())
            win.destroy()
            self._start_report(m, dl, du)
        ttk.Button(bf, text="Start", command=go).pack(side="left")
        ttk.Button(bf, text="Cancel", command=win.destroy).pack(side="left", padx=8)

    def _beep(self):
        try:
            if winsound:
                winsound.MessageBeep()
        except Exception:
            pass

    def _start_report(self, mode, delay, duration):
        if mode == "live" and (not self.sender or self.sender.poll() is not None):
            messagebox.showwarning("Performance Report", "No active ffmpeg stream found. Start streaming first.")
            return
        if mode == "offline" and self.live:
            messagebox.showwarning("Performance Report", "Stop the stream before an offline test.")
            return
        self._diag_busy = True
        self.log(f"Performance report: {mode} mode. "
                 + (f"Switch to your game NOW - measuring starts in {delay}s." if delay else "Starting."))

        def work():
            try:
                self._report_worker(mode, delay, duration)
            except Exception as e:
                self.log(f"Performance report failed: {type(e).__name__}: {e}")
            finally:
                self._diag_busy = False
        threading.Thread(target=work, daemon=True).start()

    def _report_worker(self, mode, delay, duration):
        t_begin = time.monotonic()
        s = self.screen_settings()
        snap = collect_snapshot(runtime_probes=(mode != "live"))
        snap["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        snap["wgc_target"] = (self.sc_window.get() or WGC_MONITOR)
        left = delay - (time.monotonic() - t_begin)
        if left > 0 and mode != "system":
            time.sleep(left)
        stop = self.stop_evt if mode == "live" else threading.Event()
        kind = {"live": f"Live stream, {duration}s", "offline": f"Offline capture test, {duration}s",
                "system": "System info only"}[mode]
        notes = []
        tier, cmd, proc, out_file = None, None, None, None
        sampler = DiagSampler(lambda: None, 0, threading.Event(), lambda: [])
        sampler.fps_points = []
        yt0 = yt1 = None
        wgc0 = WGC_STATS["written"]

        def yt_health():
            try:
                if getattr(self, "yt", None) and self.stream_id:
                    return self.yt.stream_status(self.stream_id)
            except Exception:
                pass
            return None

        if mode == "live":
            proc, tier, cmd = self.sender, self.active_screen_tier, self.active_screen_command
            if tier is None:
                notes.append("No verified screen tier is recorded (the live stream may be a playlist, "
                             "not My Screen), so capture-path details are unknown.")
            yt0 = yt_health()
            self._beep()
            self.log("Performance report: measuring...")
            sampler = DiagSampler(lambda: proc, duration, stop, lambda: list(self.screen_progress_history))
            sampler.run()
            yt1 = yt_health()
            self._beep()
        elif mode == "offline":
            self.ffmpeg_msgs.clear()
            out_file = os.path.join(self.edit_tmp, f"diag_{int(time.time())}.mp4")
            self.log("Performance report: starting local capture...")
            proc, tier = self.start_screen(s, list(SCREEN_METHODS[s["method"]]), out_file, stop,
                                           test_seconds=duration + 30, audio_mode=s.get("audio_mode"))
            if not proc:
                notes.append("No capture method could start - see the ffmpeg messages and log below.")
                F, st = analyse(snap, s, None, sampler, [], list(self.ffmpeg_msgs), None, None, None,
                                sampled=False)
                F.insert(0, ("FAIL", "No capture method worked at all, so nothing could be measured."))
                text = render_report(kind, snap, s, None, sampler, F, st, None,
                                     self.log_history, self.ffmpeg_msgs, notes)
                self._finish_report(text)
                return
            cmd = self.active_screen_command
            self._beep()
            self.log("Performance report: measuring...")
            sampler = DiagSampler(lambda: proc, duration, stop, lambda: list(self.screen_progress_history))
            sampler.run()
            self._beep()
            ev = getattr(proc, "_wgc_stop", None)
            if ev:
                ev.set()
            kill_tree(proc)
            if self.sender is proc:
                self.sender = None
        else:
            notes.append("System-only report: no capture or sampling was performed.")

        probe, sync_note = None, None
        if out_file and os.path.exists(out_file):
            probe = {"file size": f"{os.path.getsize(out_file) / 1024:.0f} KB"}
            rc, o, e = _run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                             "stream=codec_name,width,height,avg_frame_rate,nb_read_frames",
                             "-count_frames", "-of", "json", out_file], timeout=60)
            try:
                v = (json.loads(o).get("streams") or [{}])[0]
                probe.update({"codec": v.get("codec_name"), "size": f"{v.get('width')}x{v.get('height')}",
                              "frames counted": v.get("nb_read_frames")})
            except Exception:
                probe["ffprobe"] = (e or "failed").strip()[:120]
            sync_note = None
            rc, o2, e2 = _run(["ffprobe", "-v", "error", "-show_entries",
                               "stream=codec_type,start_time,duration", "-of", "json", out_file], timeout=30)
            try:
                sv = {x.get("codec_type"): x for x in json.loads(o2).get("streams", [])}
                vs, au = sv.get("video", {}), sv.get("audio", {})
                f2 = lambda x: float(x) if x not in (None, "N/A") else None
                v0, a0, vd, ad = (f2(vs.get("start_time")), f2(au.get("start_time")),
                                  f2(vs.get("duration")), f2(au.get("duration")))
                probe.update({"video start/dur": f"{v0}/{vd}", "audio start/dur": f"{a0}/{ad}"})
                if None not in (v0, a0) and abs(v0 - a0) > 0.25:
                    sync_note = (f"Audio starts {a0 - v0:+.2f}s relative to video in the recorded file "
                                 "- audio and video are NOT aligned at the start.")
                elif None not in (vd, ad) and abs(vd - ad) > 0.75:
                    sync_note = (f"Audio length ({ad:.1f}s) differs from video length ({vd:.1f}s) by "
                                 f"{abs(vd - ad):.1f}s - audio is dropping out or running late.")
                else:
                    sync_note = "OK"
            except Exception:
                pass
            try:
                os.remove(out_file)
            except OSError:
                pass
        hist = [h for h in list(self.screen_progress_history)
                if sampler.t0_mono <= h.get("wall_time", 0) <= sampler.t1_mono + 1]
        F, st = analyse(snap, s, tier, sampler, hist, list(self.ffmpeg_msgs), yt0, yt1,
                        WGC_STATS["written"] - wgc0, offline_probe=probe, sampled=(mode != "system"))
        if probe is not None and sync_note:
            F.append(("OK", "Audio/video alignment in the recorded file looks fine.") if sync_note == "OK"
                     else ("FAIL", sync_note))
        text = render_report(kind, snap, s, tier, sampler, F, st, cmd, self.log_history,
                             self.ffmpeg_msgs, notes)
        self._finish_report(text)

    def _finish_report(self, text):
        path = save_report(text)
        v = re.search(r"VERDICT\s*:\s*(\w+)", text)

        def done():
            self.log(f"Performance report saved ({v.group(1) if v else '?'}): {path}")
            try:
                self.root.clipboard_clear()
                self.root.clipboard_append(text)
            except Exception:
                pass
            if messagebox.askyesno("Report ready",
                                   f"Verdict: {v.group(1) if v else '?'}\n\n"
                                   f"Saved to:\n{path}\n\n"
                                   "The whole report is also copied to your clipboard "
                                   "(the stream key is removed), so you can paste it straight to Claude.\n\n"
                                   "Open the file now?"):
                try:
                    os.startfile(path)
                except Exception:
                    pass
        self.call_ui(done)

    def _on_audio_mode_changed(self):
        """Update device combobox when audio mode changes."""
        self._init_audio_device_ui()

    # ------------------------------------------------------------ benchmark
    def _motion_window(self):
        """A small always-moving window, so the screen keeps changing while a method is being
        measured (an idle desktop makes every method look good)."""
        w = tk.Toplevel(self.root)
        w.title("Benchmark test pattern - leave this visible")
        w.geometry("520x300+30+30")
        try:
            w.attributes("-topmost", True)
        except Exception:
            pass
        c = tk.Canvas(w, width=520, height=270, bg="black", highlightthickness=0)
        c.pack()
        bar = c.create_rectangle(0, 100, 60, 170, fill="#00c8ff", width=0)
        txt = c.create_text(260, 40, text="0", fill="white", font=("Consolas", 40, "bold"))
        st = {"x": 0, "d": 9, "n": 0, "on": True}

        def tick():
            if not st["on"]:
                return
            st["x"] += st["d"]
            if st["x"] <= 0 or st["x"] >= 460:
                st["d"] = -st["d"]
            st["n"] += 1
            c.coords(bar, st["x"], 100, st["x"] + 60, 170)
            c.itemconfigure(txt, text=str(st["n"]))
            w.after(16, tick)

        tick()
        return w, st

    def bench_pump(self, proc, tag, blog, sink=None):
        """Copy a process's stderr into the benchmark log, line by line."""
        def run():
            try:
                for raw in proc.stderr:
                    line = raw.decode("utf-8", "replace").rstrip()
                    if not line:
                        continue
                    blog(f"[{tag}] {line}")
                    if sink is not None:
                        sink(line)
            except Exception:
                pass
        t = threading.Thread(target=run, daemon=True)
        t.start()
        return t

    def run_bench_tier(self, tier, s, seconds, silent, blog, folder, builder=None):
        """Run ONE method for `seconds`, sending to a local fake YouTube (ffmpeg listening on
        127.0.0.1), while sampling CPU and GPU-engine counters. Returns a result dict."""
        builder = builder or build_screen_cmd
        name = TIER_NAMES.get(tier, tier)
        res = {"tier": tier, "name": name, "status": "FAIL", "note": ""}
        rec = os.path.join(folder, f"{tier}.flv")
        blog("=" * 78)
        blog(f"METHOD: {name}  ({tier})")
        listen_cmd = ["ffmpeg", "-hide_banner", "-loglevel", "info", "-listen", "1",
                      "-i", BENCH_URL, "-c", "copy", "-f", "flv", "-y", rec]
        blog("FAKE YOUTUBE (listener): " + subprocess.list2cmdline(listen_cmd))
        L = subprocess.Popen(listen_cmd, stdin=subprocess.DEVNULL, stderr=subprocess.PIPE,
                             creationflags=NOWIN)
        self._bench_procs = [L]
        self.bench_pump(L, "ingest", blog)
        time.sleep(1.5)

        wgc_size = wgc_target_size(s) if tier.startswith("wgc") else None
        wgc_stop = None
        wgc_err = []
        if tier.startswith("wgc") and not probe_wgc_backend():
            res["note"] = wgc_install_hint()
            blog("RESULT: " + res["note"])
            kill_tree(L)
            return res
        if tier.startswith("wgc"):
            src = probe_wgc_size()
            blog(f"WGC backend: {probe_wgc_backend()}; capture {src[0]}x{src[1]} → pipe {wgc_size[0]}x{wgc_size[1]}")
        try:
            cap_cmd = builder(s, tier, BENCH_URL, audio_mode=SILENT_MODE if silent else None,
                              wgc_size=wgc_size)
        except TypeError:
            # Older builder without wgc_size kw (shouldn't happen in this tree)
            cap_cmd = builder(s, tier, BENCH_URL, audio_mode=SILENT_MODE if silent else None)
        blog("CAPTURE + ENCODE: " + subprocess.list2cmdline(cap_cmd))
        P = subprocess.Popen(cap_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE,
                             creationflags=NOWIN | (BELOW_NORMAL if s.get("low") else 0))
        P._q_ok = True
        if tier.startswith("wgc"):
            wgc_stop = threading.Event()
            win_name = (s.get("window") or "").strip() or None
            threading.Thread(
                target=wgc_producer_loop,
                args=(P.stdin, wgc_size[0], wgc_size[1], int(s["fps"]),
                      wgc_stop, wgc_err, win_name),
                daemon=True).start()
            P._wgc_stop = wgc_stop
        self._bench_procs = [L, P]
        snaps, cur, lines = [], {}, collections.deque(maxlen=40)

        def on_line(line):
            lines.append(line)
            m = _PROGRESS_RE.match(line)
            if m:
                cur[m.group(1)] = m.group(2).strip()
                if m.group(1) == "progress":
                    sn = dict(cur)
                    sn["wall_time"] = time.monotonic()
                    snaps.append(sn)

        self.bench_pump(P, "capture", blog, on_line)

        def frames():
            try:
                return int(snaps[-1].get("frame", "0") or 0) if snaps else 0
            except ValueError:
                return 0

        deadline = time.monotonic() + 25.0
        while time.monotonic() < deadline and P.poll() is None and frames() == 0:
            if self.bench_stop.is_set():
                break
            time.sleep(0.2)
        if frames() == 0:
            if self.bench_stop.is_set():
                res["note"] = "stopped by you"
            else:
                why = (f"ffmpeg stopped at start (code {P.returncode})" if P.poll() is not None
                       else "no frames within 25 s")
                last = " | ".join(list(lines)[-3:])[:200]
                if wgc_err:
                    last = ("WGC: " + " | ".join(wgc_err)[:180]) + (" | " + last if last else "")
                if not last or "not enough frames" in last:
                    last = ("ffmpeg printed no error, so it is waiting on an input "
                            "(usually the audio device or WGC producer)")
                res["note"] = why + "; " + last
            blog("RESULT: did not start. " + res["note"])
            if wgc_stop:
                wgc_stop.set()
            kill_tree(P)
            kill_tree(L)
            return res

        t0 = time.monotonic()
        pids = process_tree_pids(P.pid)
        blog(f"Measuring process ids (ffmpeg and anything it started): {sorted(pids)}")
        tp = {"text": "", "err": ""}
        th = None
        if sys.platform.startswith("win"):
            cmd = ["typeperf", "\\GPU Engine(*)\\Utilization Percentage",
                   "\\Process(ffmpeg*)\\% Processor Time",
                   "\\Processor(_Total)\\% Processor Time",
                   "-si", "1", "-sc", str(max(3, seconds - 3))]
            blog("COUNTERS: " + subprocess.list2cmdline(cmd))

            def sample():
                try:
                    r = subprocess.run(cmd, capture_output=True, text=True,
                                       timeout=seconds + 40, creationflags=NOWIN)
                    tp["text"], tp["err"] = r.stdout or "", r.stderr or ""
                except Exception as e:
                    tp["err"] = str(e)

            th = threading.Thread(target=sample, daemon=True)
            th.start()

        while time.monotonic() - t0 < seconds and P.poll() is None:
            if self.bench_stop.is_set():
                break
            time.sleep(0.25)
        exited_early = P.poll() is not None and not self.bench_stop.is_set()
        if exited_early:
            res["note"] = f"ffmpeg exited early (code {P.returncode})"
            blog("NOTE: " + res["note"])
        if wgc_stop:
            wgc_stop.set()
        kill_tree(P)
        if th:
            th.join(timeout=25)
        try:
            L.wait(timeout=10)
        except Exception:
            kill_tree(L)
        time.sleep(0.5)

        # ---- numbers from ffmpeg's own counters
        usable = [x for x in snaps if str(x.get("frame", "")).isdigit()]
        run = {}
        if len(usable) >= 3:
            first, last = usable[1], usable[-1]
            run["real"] = capture_rate(first, last)
            try:
                run["speed"] = float(str(last.get("speed", "")).rstrip("x "))
            except ValueError:
                run["speed"] = None
            run["dup"] = int(last.get("dup_frames", 0) or 0)
            run["drop"] = int(last.get("drop_frames", 0) or 0)
            worst = None
            for i in range(0, len(usable) - 3):
                r3 = capture_rate(usable[i], usable[i + 3])
                if r3 is not None:
                    worst = r3 if worst is None else min(worst, r3)
            run["worst"] = worst if worst is not None else 0.0
        blog(f"FFMPEG COUNTERS: {json.dumps(run, default=str)}")

        # ---- what the fake YouTube received
        an = {}
        if os.path.exists(rec) and os.path.getsize(rec) > 0:
            blog("ANALYSE RECORDING: ffprobe -show_entries packet=... " + rec)
            an = analyze_flv(rec)
        else:
            an = {"error": "nothing was recorded"}
        blog(f"RECEIVED BY FAKE YOUTUBE: {json.dumps(an, default=str)}")

        # ---- CPU / GPU engines
        ctr = None
        if tp["text"]:
            blog("COUNTER OUTPUT (raw):\n" + tp["text"][:30000])
            ctr = parse_typeperf(tp["text"], pids)
        elif tp["err"]:
            blog("COUNTER ERROR: " + tp["err"][:500])
        if ctr:
            blog("GPU engines used by ffmpeg (avg, max %): " +
                 json.dumps({k: [round(x, 1) for x in v] for k, v in ctr["engines_ffmpeg"].items()}))
            blog("GPU engines, whole system (avg, max %): " +
                 json.dumps({k: [round(x, 1) for x in v] for k, v in ctr["engines_all"].items()}))
            blog(f"ffmpeg CPU {ctr['ffmpeg_cpu'][0]:.0f}% of one core on average; "
                 f"whole PC {ctr['total_cpu'][0]:.0f}% avg, {ctr['total_cpu'][1]:.0f}% max")

        checks, overall = grade_run(run, an, int(s["kbps"]), int(s["fps"]))
        for nm, st, dt in checks:
            blog(f"  [{st}] {nm}: {dt}")
        blog(f"VERDICT: {overall}")
        res.update({"status": overall, "run": run, "an": an, "ctr": ctr, "checks": checks})
        return res

    def bench_selftest(self, folder, blog):
        """Does the fake YouTube work on this PC at all? (A firewall prompt or a busy port would
        make every method fail, so it is checked first with a tiny synthetic stream.)"""
        rec = os.path.join(folder, "selftest.flv")
        listen_cmd = ["ffmpeg", "-hide_banner", "-loglevel", "info", "-listen", "1",
                      "-i", BENCH_URL, "-c", "copy", "-f", "flv", "-y", rec]
        blog("SELF-TEST of the fake YouTube: " + subprocess.list2cmdline(listen_cmd))
        L = subprocess.Popen(listen_cmd, stdin=subprocess.DEVNULL, stderr=subprocess.PIPE,
                             creationflags=NOWIN)
        self._bench_procs = [L]
        self.bench_pump(L, "ingest", blog)
        time.sleep(1.5)
        pub = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-re", "-f", "lavfi", "-i",
               "testsrc2=s=640x360:r=30", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
               "-t", "3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-f", "flv", BENCH_URL]
        blog("SELF-TEST publisher: " + subprocess.list2cmdline(pub))
        P = subprocess.Popen(pub, stdin=subprocess.DEVNULL, stderr=subprocess.PIPE,
                             creationflags=NOWIN)
        self._bench_procs = [L, P]
        self.bench_pump(P, "selftest", blog)
        try:
            P.wait(timeout=20)
        except subprocess.TimeoutExpired:
            kill_tree(P)
        try:
            L.wait(timeout=10)
        except subprocess.TimeoutExpired:
            kill_tree(L)
        ok = os.path.exists(rec) and os.path.getsize(rec) > 1000
        blog("SELF-TEST " + ("OK: the fake YouTube received a stream." if ok else
             "FAILED: the fake YouTube received nothing. Windows Firewall may be blocking "
             "ffmpeg, or port 19350 is in use."))
        return ok

    def bench_audio_check(self, s, blog):
        """True if the chosen audio device opens and delivers sound, False if it is missing or
        hangs, None if no device is configured. A stuck device stops EVERY method from starting,
        so it is tested on its own."""
        dev = (s.get("audio") or "").strip()
        if s.get("audio_mode") != DSHOW_MODE or not dev or dev == NO_AUDIO:
            return None
        try:
            r = subprocess.run(["ffmpeg", "-hide_banner", "-list_devices", "true", "-f", "dshow",
                                "-i", "dummy"], capture_output=True, text=True, encoding="utf-8",
                               errors="replace", timeout=20, creationflags=NOWIN)
            blog("$ ffmpeg -list_devices true -f dshow -i dummy\n" + (r.stderr or "")[-3000:])
        except subprocess.TimeoutExpired:
            blog("DirectShow device list: TIMED OUT after 20 s (the audio system is not responding)")
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "info", "-f", "dshow", "-i", f"audio={dev}",
               "-t", "3", "-f", "null", "-"]
        blog("AUDIO CHECK: " + subprocess.list2cmdline(cmd))
        t0 = time.monotonic()
        P = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=NOWIN)
        P._q_ok = True
        self._bench_procs = [P]
        self.bench_pump(P, "audio", blog)
        try:
            P.wait(timeout=15)
        except subprocess.TimeoutExpired:
            kill_tree(P)
            blog("AUDIO CHECK: HUNG. The device did not deliver sound within 15 s.")
            blog("  Common causes with Voicemeeter / virtual cables:")
            blog("    - Voicemeeter is not running, or the chosen strip/bus is not patched")
            blog("    - Sample-rate mismatch (set Voicemeeter and Windows both to 48000 Hz)")
            blog("    - Device stuck after a previous crash — restart Voicemeeter, or try")
            blog("      'Stereo Mix (Realtek)' / another VAIO output, then re-test")
            return False
        dt = time.monotonic() - t0
        ok = P.returncode == 0
        blog(f"AUDIO CHECK: {'opened and delivered sound' if ok else 'FAILED'} "
             f"({dt:.1f}s, exit code {P.returncode})")
        return ok

    def bench_worker(self, tiers, seconds, silent, folder, ui_status, ui_row, on_done, builder=None):
        log_path = os.path.join(folder, "benchmark.log")
        try:
            lf = open(log_path, "w", encoding="utf-8", buffering=1)
        except OSError as e:
            self.log(f"Cannot write benchmark log ({e}). Free disk space under:\n{folder}")
            on_done([], log_path)
            return
        disk_full = {"v": False}

        def blog(msg):
            line = time.strftime("[%H:%M:%S] ") + msg + "\n"
            if disk_full["v"]:
                try:
                    self.log(msg)
                except Exception:
                    pass
                return
            try:
                lf.write(line)
            except OSError as e:
                disk_full["v"] = True
                try:
                    self.log(f"Log write failed (disk full?): {e}")
                    self.log(msg)
                except Exception:
                    pass

        results = []
        try:
            blog("YT Stream Studio benchmark")
            blog(f"Each method runs {seconds}s into a local fake YouTube ({BENCH_URL}); "
                 f"silent audio: {silent}")
            s = self.screen_settings()
            blog("Settings: " + json.dumps({k: v for k, v in s.items()}, default=str))
            try:
                blog("System: " + json.dumps(get_diagnostic_system_info(), indent=1, default=str)[:8000])
            except Exception as e:
                blog(f"System info unavailable: {e}")
            for cmd in (["ffmpeg", "-version"], ["ffmpeg", "-hide_banner", "-hwaccels"]):
                try:
                    r = subprocess.run(cmd, capture_output=True, text=True, timeout=20,
                                       creationflags=NOWIN)
                    blog(f"$ {' '.join(cmd)}\n" + "\n".join((r.stdout or "").splitlines()[:12]))
                except Exception as e:
                    blog(f"$ {' '.join(cmd)} failed: {e}")
            dims = probe_screen_size() if builder is None else None
            blog(f"Screen size seen by ddagrab: {dims}")
            ui_status("Checking the fake YouTube works on this PC...")
            if not self.bench_selftest(folder, blog):
                self._bench_note = ("The fake YouTube didn't work, so no method could be tested. "
                                    "Allow ffmpeg through Windows Firewall and try again. ")
                blog("ABORTED: " + self._bench_note)
                return
            if builder is None:
                ui_status("Checking your audio device...")
                ac = self.bench_audio_check(s, blog)
                if ac is False and not silent:
                    silent = True
                    self._bench_note = (
                        "Your audio device (Voicemeeter Out B1 or similar) hung and delivered "
                        "no samples. Video methods were tested with silent audio. "
                        "Fix: start Voicemeeter, set both it and Windows to 48000 Hz, "
                        "or switch to 'Stereo Mix' / another VAIO output, then re-run."
                    )
                    blog("AUDIO DEVICE NOT WORKING: continuing with silent audio so the video "
                         "methods can still be measured.")
            for i, tier in enumerate(tiers, 1):
                if self.bench_stop.is_set():
                    break
                ui_status(f"[{i}/{len(tiers)}] testing {TIER_NAMES.get(tier, tier)} for {seconds}s...")
                try:
                    res = self.run_bench_tier(tier, s, seconds, silent, blog, folder, builder)
                except Exception as e:
                    import traceback
                    blog("ERROR: " + traceback.format_exc())
                    res = {"tier": tier, "name": TIER_NAMES.get(tier, tier), "status": "FAIL",
                           "note": str(e)}
                results.append(res)
                ui_row(res)
                time.sleep(3.0)   # let the PC cool down between methods

            rank = {"PASS": 0, "WARN": 1, "FAIL": 2}
            ncpu = os.cpu_count() or 1

            def key(r):
                cpu = r["ctr"]["ffmpeg_cpu"][0] / ncpu if r.get("ctr") else 50.0
                return (rank.get(r["status"], 3), cpu)

            ok = [r for r in results if r.get("run")]
            best = min(ok, key=key) if ok else None
            blog("=" * 78)
            blog("SUMMARY")
            for r in sorted(results, key=key):
                blog(f"  {r['status']:5s} {r['name']}  {r.get('note', '')}")
            blog(f"BEST ON THIS PC: {best['name'] if best else 'none worked'}")
            if getattr(self, "_bench_note", ""):
                blog("NOTE: " + self._bench_note)
            self._bench_best = best["tier"] if best else None
        except Exception:
            import traceback
            blog("BENCHMARK ERROR: " + traceback.format_exc())
        finally:
            try:
                lf.close()
            except OSError:
                pass
            self.bench_running = False
            try:
                on_done(results, log_path)
            except Exception:
                pass

    def benchmark_dialog(self):
        if getattr(self, "bench_running", False):
            return
        if self.live:
            messagebox.showinfo("Benchmark", "Stop the stream first.")
            return
        if not sys.platform.startswith("win"):
            messagebox.showerror("Benchmark", "The benchmark records your screen, so it needs Windows.")
            return
        if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
            messagebox.showerror("Benchmark", "ffmpeg / ffprobe not found on PATH.")
            return
        win = tk.Toplevel(self.root)
        win.title("Benchmark: which pipeline does this PC like?")
        win.geometry("1180x600")
        win.transient(self.root)
        ttk.Label(win, wraplength=1130, justify="left", padding=10, text=(
            "Runs each capture + encode method for a few seconds into a fake YouTube on this PC "
            "(nothing is sent online), watches ffmpeg's CPU and your GPU's engines "
            "(3D, Copy, VideoProcessing...), checks what the fake YouTube received, and grades each "
            "method. Everything is written to a .log with the exact commands and their output. "
            "Don't use the PC during the test. Uses your Screen settings (size, fps, bitrate).")
        ).pack(fill="x")
        opts = ttk.Frame(win, padding=(10, 0))
        opts.pack(fill="x")
        secs = tk.IntVar(value=20)
        motion = tk.BooleanVar(value=True)
        silent = tk.BooleanVar(value=True)
        ttk.Label(opts, text="Seconds per method").pack(side="left")
        ttk.Spinbox(opts, from_=10, to=60, textvariable=secs, width=4).pack(side="left", padx=6)
        ttk.Checkbutton(opts, text="Show moving test pattern", variable=motion).pack(side="left", padx=10)
        ttk.Checkbutton(opts, text="Silent audio while testing video (the audio device is checked "
                                   "separately)", variable=silent).pack(side="left")
        tf = ttk.LabelFrame(win, text="Methods to test", padding=6)
        tf.pack(fill="x", padx=10, pady=6)
        checks = {}
        for i, t in enumerate(BENCH_TIERS):
            v = tk.BooleanVar(value=True)
            checks[t] = v
            ttk.Checkbutton(tf, text=TIER_NAMES[t], variable=v).grid(
                row=i // 4, column=i % 4, sticky="w", padx=8)
        cols = ("method", "result", "speed", "real", "worst", "dup", "drop", "cpu", "gpu", "gap",
                "key", "kbps")
        heads = ("Method", "Result", "Speed", "Real fps", "Worst 3s", "Dup", "Drop", "ffmpeg CPU",
                 "GPU engines (ffmpeg)", "Max gap", "Key int.", "kbps")
        widths = (230, 60, 55, 65, 70, 50, 50, 80, 220, 65, 65, 55)
        tree = ttk.Treeview(win, columns=cols, show="headings", height=9)
        for c, h, w in zip(cols, heads, widths):
            tree.heading(c, text=h)
            tree.column(c, width=w, anchor="w")
        tree.pack(fill="both", expand=True, padx=10, pady=4)
        status = tk.StringVar(value="Ready.")
        ttk.Label(win, textvariable=status, wraplength=1130).pack(fill="x", padx=10)
        state = {"log": None, "folder": None, "motion": None}
        ncpu = os.cpu_count() or 1

        def ui_status(msg):
            self.call_ui(lambda: status.set(msg) if win.winfo_exists() else None)

        def ui_row(r):
            def put():
                if not win.winfo_exists():
                    return
                run, an, ctr = r.get("run") or {}, r.get("an") or {}, r.get("ctr")
                f = lambda x, p=1: "-" if x is None else f"{x:.{p}f}"
                tree.insert("", "end", iid=r["tier"], values=(
                    r["name"], r["status"] if run else "FAIL", f(run.get("speed"), 2) + "x",
                    f(run.get("real")), f(run.get("worst")), run.get("dup", "-"), run.get("drop", "-"),
                    (f"{ctr['ffmpeg_cpu'][0] / ncpu:.0f}%" if ctr else "-"),
                    (fmt_engines(ctr["engines_ffmpeg"]) if ctr else "-"),
                    (f"{an['max_gap'] * 1000:.0f} ms" if "max_gap" in an else "-"),
                    (f"{an['key_max']:.1f}s" if "key_max" in an else "-"),
                    (f"{an['kbps']:.0f}" if "kbps" in an else r.get("note", "")[:40])))
            self.call_ui(put)

        def on_done(results, log_path):
            def fin():
                if state["motion"]:
                    try:
                        state["motion"][1]["on"] = False
                        state["motion"][0].destroy()
                    except Exception:
                        pass
                self.bench_procs_done = True
                if win.winfo_exists():
                    best = getattr(self, "_bench_best", None)
                    status.set(getattr(self, "_bench_note", "") +
                               ("Done. Best on this PC: " + TIER_NAMES[best] +
                                ". Press 'Use best method' to select it. " if best else
                                "Done. No method worked. ") + "Full log: " + log_path)
                    btn_start.configure(state="normal")
                    btn_stop.configure(state="disabled")
                    btn_best.configure(state="normal" if best else "disabled")
            self.call_ui(fin)

        def start():
            chosen = [t for t in BENCH_TIERS if checks[t].get()]
            if not chosen:
                return
            if not self.check_stray_streams():
                return
            folder = os.path.join(log_dir("benchmark"), time.strftime("%Y%m%d_%H%M%S"))
            os.makedirs(folder, exist_ok=True)
            state["folder"], state["log"] = folder, os.path.join(folder, "benchmark.log")
            tree.delete(*tree.get_children())
            self.bench_running = True
            self.bench_stop = threading.Event()
            self._bench_best = None
            self._bench_note = ""
            btn_start.configure(state="disabled")
            btn_stop.configure(state="normal")
            btn_best.configure(state="disabled")
            state["motion"] = self._motion_window() if motion.get() else None
            win.after(800, lambda: threading.Thread(
                target=self.bench_worker,
                args=(chosen, int(secs.get()), bool(silent.get()), folder, ui_status, ui_row, on_done),
                daemon=True).start())

        def stop():
            self.bench_stop.set()
            for pr in list(getattr(self, "_bench_procs", [])):
                kill_tree(pr)
            status.set("Stopping...")

        def use_best():
            best = getattr(self, "_bench_best", None)
            label = next((k for k, v in SCREEN_METHODS.items() if v == [best]), None)
            if label:
                self.sc_method.set(label)
                self.save_settings(self.key_var.get().strip())
                self.log(f"Screen method set to: {label}")
                status.set("Method selected: " + label)

        def open_log():
            if state["log"] and os.path.exists(state["log"]):
                os.startfile(state["log"])

        def open_folder():
            if state["folder"] and os.path.isdir(state["folder"]):
                os.startfile(state["folder"])

        bf = ttk.Frame(win, padding=10)
        bf.pack(fill="x")
        btn_start = ttk.Button(bf, text="Start benchmark", command=start)
        btn_stop = ttk.Button(bf, text="Stop", command=stop, state="disabled")
        btn_best = ttk.Button(bf, text="Use best method", command=use_best, state="disabled")
        btn_start.pack(side="left")
        btn_stop.pack(side="left", padx=6)
        btn_best.pack(side="left", padx=6)
        ttk.Button(bf, text="Open log", command=open_log).pack(side="left", padx=6)
        ttk.Button(bf, text="Open folder (recordings)", command=open_folder).pack(side="left")
        ttk.Button(bf, text="Close", command=win.destroy).pack(side="right")

    def screen_dialog(self):
        win = tk.Toplevel(self.root)
        win.title("Screen stream settings")
        win.transient(self.root)
        f = ttk.Frame(win, padding=12)
        f.pack(fill="both", expand=True)

        def row(r, label, var, values, width=18):
            ttk.Label(f, text=label).grid(row=r, column=0, sticky="e", padx=(0, 8), pady=4)
            cb = ttk.Combobox(f, textvariable=var, values=values, state="readonly", width=width)
            cb.grid(row=r, column=1, sticky="w")
            return cb

        ttk.Label(f, text="Method").grid(row=0, column=0, sticky="e", padx=(0, 8), pady=4)
        method_cb = ttk.Combobox(
            f, textvariable=self.sc_method, values=SCREEN_METHOD_CHOICES,
            state="readonly", width=44)
        method_cb.grid(row=0, column=1, sticky="w", columnspan=2)
        ttk.Label(
            f,
            text="WGC is the default. Items marked Experimental are never used unless you select them.",
            font=("Segoe UI", 8),
        ).grid(row=1, column=1, columnspan=2, sticky="w", pady=(0, 4))
        row(2, "Resolution (height)", self.sc_height, ["Native", "1080", "720", "540", "480"])
        row(3, "Frames per second", self.sc_fps, ["60", "30", "24", "15"])
        row(4, "Bitrate (kbps)", self.sc_kbps, ["1500", "2500", "3500", "4500", "6000"])
        # ---- Window target (WGC can capture one window instead of the whole desk)
        ttk.Label(f, text="Capture target").grid(row=5, column=0, sticky="e", padx=(0, 8), pady=4)
        self._window_combo = ttk.Combobox(f, textvariable=self.sc_window, width=44, state="readonly")
        self._window_combo.grid(row=5, column=1, sticky="w")
        ttk.Button(f, text="Refresh windows", command=self._refresh_window_list).grid(
            row=5, column=2, sticky="w", padx=(6, 0))
        ttk.Label(f, text="2nd app audio").grid(row=6, column=0, sticky="e", padx=(0, 8), pady=4)
        self._window2_combo = ttk.Combobox(
            f, textvariable=self.sc_window2, width=44, state="readonly")
        self._window2_combo.grid(row=6, column=1, sticky="w")
        ttk.Label(f, text="Discord / none").grid(row=6, column=2, sticky="w", padx=(6, 0))
        self._refresh_window_list()
        # ---- Audio capture mode selector ----
        mode_frame = ttk.LabelFrame(f, text="Audio capture mode", padding=6)
        mode_frame.grid(row=7, column=0, columnspan=3, sticky="ew", pady=(4, 8))

        ttk.Radiobutton(mode_frame, text=LOOPBACK_MODE + "  (recommended)",
                        variable=self.sc_audio_mode, value=LOOPBACK_MODE,
                        command=self._on_audio_mode_changed).grid(
            row=0, column=0, columnspan=2, sticky="w", pady=2)
        ttk.Radiobutton(mode_frame, text=MIX_MODE, variable=self.sc_audio_mode,
                        value=MIX_MODE, command=self._on_audio_mode_changed).grid(
            row=1, column=0, columnspan=2, sticky="w", pady=2)
        ttk.Radiobutton(mode_frame, text=DSHOW_MODE, variable=self.sc_audio_mode,
                        value=DSHOW_MODE, command=self._on_audio_mode_changed).grid(
            row=2, column=0, sticky="w", padx=(0, 12), pady=2)
        ttk.Radiobutton(mode_frame, text=SILENT_MODE, variable=self.sc_audio_mode,
                        value=SILENT_MODE, command=self._on_audio_mode_changed).grid(
            row=2, column=1, sticky="w", pady=2)

        self._device_label = ttk.Label(f, text="Mic / device")
        self._device_label.grid(row=8, column=0, sticky="e", padx=(0, 8), pady=4)
        self._device_combo = ttk.Combobox(f, state="readonly", width=44)
        self._device_combo.grid(row=8, column=1, columnspan=2, sticky="w")
        self._find_btn = ttk.Button(f, text="Find devices", command=self._on_find_audio_devices)
        self._find_btn.grid(row=9, column=1, sticky="w", pady=(0, 4))

        self._audio_test_btn = ttk.Button(f, text="Test audio capture",
                                          command=self.test_audio_capture)
        self._audio_test_btn.grid(row=9, column=2, sticky="w", pady=(0, 4))

        self._init_audio_device_ui()

        ttk.Label(f, text="A/V offset (ms)").grid(row=10, column=0, sticky="e", padx=(0, 8), pady=4)
        ttk.Entry(f, textvariable=self.sc_av_ms, width=8).grid(row=10, column=1, sticky="w")
        ttk.Button(f, text="Apply last measured delay",
                   command=self._apply_measured_av_delay).grid(
            row=10, column=2, sticky="w", padx=(6, 0))
        ttk.Checkbutton(f, text="Low priority (helps game fps, but can make the stream drop frames)",
                        variable=self.sc_low).grid(row=11, column=1, sticky="w", pady=4)
        ttk.Label(f, justify="left", foreground="#9aa3b2", wraplength=520, text=(
            "Capture target: pick your game window (WGC) or Entire screen.\n"
            "WGC is the permanent default; Experimental methods are opt-in only.\n"
            "WASAPI = game/system sound. Use 'Free up resources…' before a game stream.")).grid(
            row=13, column=0, columnspan=3, sticky="w", pady=8)
        bf = ttk.Frame(f)
        bf.grid(row=12, column=0, columnspan=3, sticky="e")
        ttk.Button(bf, text="Free up resources…",
                   command=self.free_resources_dialog).pack(side="left")
        ttk.Button(bf, text="Test capture (10s)",
                   command=lambda: self.test_capture(self.screen_settings())).pack(side="left", padx=(8, 0))
        ttk.Button(bf, text="Generate Performance Report",
                   command=self.generate_performance_report).pack(side="left", padx=(8, 0))
        ttk.Button(bf, text="Close", command=lambda: (self.save_settings(self.key_var.get()),
                                                       win.destroy())).pack(side="left", padx=8)

    def _set_default_audio_track(self):
        """Remember the current Tracks-tab selection for newly added playlist items."""
        label = self.track_var.get()
        val = self.track_map.get(label, "first")
        self._default_audio_track = val
        self.save_settings(self.key_var.get().strip())
        self.log(f"Default audio track for new clips: {label} ({val})")

    def _apply_measured_av_delay(self):
        """Read delay from live_tune / live_tuning.json if present and apply to sc_av_ms."""
        try:
            from .capture.wgc import live_tuning_path
            path = live_tuning_path()
            data = load_json(path)
            ms = data.get("av_ms") or data.get("video_delay_ms") or data.get("delay_ms")
            if ms is None and os.path.isfile(os.path.join(APP_DIR, "live_tune_result.json")):
                data = load_json(os.path.join(APP_DIR, "live_tune_result.json"))
                ms = data.get("av_ms") or data.get("delay_ms")
            if ms is None:
                messagebox.showinfo(
                    "A/V delay",
                    "No measured delay found yet.\n\n"
                    "Run live_tune.py (or the sync checker) once, then click this again.\n"
                    "You can also type a value in the A/V offset box (try 250–350 ms).")
                return
            ms = max(0, min(1000, int(float(ms))))
            self.sc_av_ms.set(str(ms))
            self.save_settings(self.key_var.get().strip())
            self.log(f"A/V offset set to {ms} ms from last measurement.")
        except Exception as e:
            messagebox.showerror("A/V delay", str(e))

    def _refresh_window_list(self):
        """Populate the capture-target combobox with visible window titles."""
        def apply(wins):
            titles = [WGC_MONITOR] + [t for t, _hwnd in wins]
            self._window_choices = titles
            if hasattr(self, "_window_combo"):
                try:
                    self._window_combo["values"] = titles
                except tk.TclError:
                    return
            cur = self.sc_window.get()
            if cur not in titles:
                self.sc_window.set(WGC_MONITOR)
            titles2 = [NO_APP_AUDIO] + [t for t, _hwnd in wins]
            if hasattr(self, "_window2_combo"):
                try:
                    self._window2_combo["values"] = titles2
                except tk.TclError:
                    return
            cur2 = self.sc_window2.get()
            if cur2 not in titles2:
                self.sc_window2.set(NO_APP_AUDIO)

        def work():
            try:
                wins = list_capturable_windows()
            except Exception:
                wins = []
            try:
                self.root.after(0, lambda: apply(wins))
            except Exception:
                pass

        threading.Thread(target=work, daemon=True).start()


    def _layout_prefer_player(self):
        """Make the Player the largest region: ~70% window width, ~72% of the right column."""
        top = getattr(self, "_pane_top", None)
        right = getattr(self, "_pane_right", None)
        try:
            self.root.update_idletasks()
            if top is not None:
                w = max(800, top.winfo_width())
                # Left (library) ~28%, player column ~72%
                top.sashpos(0, int(w * 0.28))
            if right is not None:
                h = max(400, right.winfo_height())
                # Player ~72% height, edit ~28%
                right.sashpos(0, int(h * 0.72))
            if getattr(self, "video", None) is not None:
                try:
                    self.video.configure(height=420)
                except tk.TclError:
                    pass
        except Exception:
            pass


    def _on_f10(self, event=None):
        """F10 binding — never run layout work inside the key event (Windows menu race)."""
        try:
            self.root.after_idle(self.toggle_focus_player)
        except Exception:
            try:
                self.root.after(0, self.toggle_focus_player)
            except Exception:
                pass
        return "break"

    def _on_f11(self, event=None):
        try:
            self.root.after_idle(self.toggle_fullscreen)
        except Exception:
            try:
                self.root.after(0, self.toggle_fullscreen)
            except Exception:
                pass
        return "break"

    def toggle_fullscreen(self):
        """F11 — true OS fullscreen for the whole app window."""
        self._ui_fullscreen = not getattr(self, "_ui_fullscreen", False)
        try:
            self.root.attributes("-fullscreen", self._ui_fullscreen)
        except tk.TclError:
            # Fallback: maximized
            try:
                self.root.state("zoomed" if self._ui_fullscreen else "normal")
            except tk.TclError:
                pass
        self.log("Fullscreen ON (Esc or F11 to exit)" if self._ui_fullscreen else "Fullscreen OFF")

    def exit_fullscreen(self):
        if getattr(self, "_ui_fullscreen", False):
            self._ui_fullscreen = False
            try:
                self.root.attributes("-fullscreen", False)
            except tk.TclError:
                try:
                    self.root.state("normal")
                except tk.TclError:
                    pass
            self.log("Fullscreen OFF")

    def toggle_focus_player(self):
        """Expand Player: collapse Library/Playlist/Edit via sash positions (no forget/add).

        Avoid PanedWindow.forget()/add() — on Windows (especially frozen builds) that
        can deadlock when combined with F10's system-menu handling.
        """
        self._ui_focus_player = not getattr(self, "_ui_focus_player", False)
        top = getattr(self, "_pane_top", None)
        right = getattr(self, "_pane_right", None)
        if not top or not right:
            return
        try:
            self.root.update_idletasks()
            if self._ui_focus_player:
                # Collapse left column and edit panel by parking sashes at the edge
                try:
                    top.sashpos(0, 0)
                except Exception:
                    pass
                try:
                    h = max(200, right.winfo_height())
                    right.sashpos(0, max(100, h - 4))
                except Exception:
                    pass
                self.log("Focus player ON — F10 to show all panels again")
            else:
                # Restore preferred layout
                try:
                    w = max(800, top.winfo_width())
                    top.sashpos(0, int(w * 0.28))
                except Exception:
                    pass
                try:
                    h = max(400, right.winfo_height())
                    right.sashpos(0, int(h * 0.72))
                except Exception:
                    pass
                self.log("Focus player OFF — all panels visible")
                self.root.after(50, self._layout_prefer_player)
        except Exception as e:
            self.log(f"Focus player toggle failed: {e}")

    def expand_edit_panel(self):
        """Give the Edit/Tracks notebook more height (drag sash still works too)."""
        right = getattr(self, "_pane_right", None)
        if not right:
            return
        try:
            # Push sash so player is smaller, edit is larger
            h = max(200, right.winfo_height())
            right.sashpos(0, int(h * 0.35))
            self.log("Edit panel expanded — drag the divider to fine-tune")
        except Exception as e:
            self.log(f"Could not expand edit panel: {e}")


    def free_resources_dialog(self):
        """List heavy user processes; close only ones the user checks. Never auto-kills."""
        win = tk.Toplevel(self.root)
        win.title("Free up resources")
        win.geometry("520x420")
        ttk.Label(win, wraplength=480, justify="left", text=(
            "These apps are using a lot of memory. Check ones you do not need for streaming.\n"
            "System processes and this app are not listed. Nothing is closed until you confirm."
        )).pack(anchor="w", padx=12, pady=(12, 6))
        outer = ttk.Frame(win)
        outer.pack(fill="both", expand=True, padx=12, pady=6)
        canvas = tk.Canvas(outer, highlightthickness=0)
        scroll = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        body = ttk.Frame(canvas)
        body.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=body, anchor="nw")
        canvas.configure(yscrollcommand=scroll.set)
        canvas.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        vars_by_pid = {}
        rows = list_heavy_user_processes()
        if not rows:
            ttk.Label(body, text="No large user processes found (or query failed).").pack(anchor="w")
        for r in rows:
            v = tk.BooleanVar(value=False)
            vars_by_pid[r["pid"]] = (v, r)
            ttk.Checkbutton(
                body,
                text=f"{r['name']}  (PID {r['pid']}, ~{r['mb']} MB)",
                variable=v,
            ).pack(anchor="w", pady=1)

        def do_close():
            chosen = [r for v, r in vars_by_pid.values() if v.get()]
            if not chosen:
                messagebox.showinfo("Free resources", "No processes selected.")
                return
            names = ", ".join(f"{r['name']}({r['pid']})" for r in chosen[:12])
            if not messagebox.askyesno(
                "Confirm",
                f"Close {len(chosen)} process(es)?\n\n{names}\n\n"
                "Save your work in those apps first.",
            ):
                return
            killed = 0
            for r in chosen:
                try:
                    subprocess.run(
                        ["taskkill", "/PID", str(r["pid"]), "/F"],
                        capture_output=True, timeout=8, creationflags=NOWIN,
                    )
                    killed += 1
                except Exception as e:
                    self.log(f"Could not close {r['name']}: {e}")
            self.log(f"Free resources: closed {killed}/{len(chosen)} selected process(es).")
            win.destroy()

        bf = ttk.Frame(win)
        bf.pack(fill="x", padx=12, pady=10)
        ttk.Button(bf, text="Refresh list",
                   command=lambda: (win.destroy(), self.free_resources_dialog())).pack(side="left")
        ttk.Button(bf, text="Close selected", command=do_close).pack(side="right")
        ttk.Button(bf, text="Cancel", command=win.destroy).pack(side="right", padx=8)

    def stop_stream(self):
        self.pending_switch = None  # Stop also cancels a switch that is in progress
        self.holding = False
        self.force_brb_playlist = False
        self._keep_broadcast = False
        # Ask: return to standby (warm) or full stop
        to_standby = False
        if not self.live:
            return
        try:
            r = messagebox.askyesnocancel(
                "Stop stream",
                "Yes = return to Standby (keep encoder warm)\n"
                "No = stop completely\n"
                "Cancel = keep streaming",
            )
        except Exception:
            r = False
        if r is None:
            return  # cancel
        to_standby = bool(r)

        self.stop_evt.set()
        # Never block the Tk UI thread on taskkill/ffmpeg quit (that freezes the window).
        self.cleanup_processes(log_result=False, background=True)
        # Workers normally call finish_broadcast in finally; this is a safety net if
        # they were already dead and left a live broadcast open on the channel.
        bid = self.broadcast_id
        if bid:
            def _complete():
                time.sleep(1.5)
                try:
                    if self.broadcast_id == bid and not self.live:
                        self.finish_broadcast(bid)
                        self.log("YouTube broadcast marked complete.")
                except Exception as e:
                    self.log(f"Could not complete broadcast: {e}")
            threading.Thread(target=_complete, daemon=True).start()

        if to_standby:
            def _back():
                time.sleep(1.2)
                try:
                    self.call_ui(lambda: self.standby_start(quiet=True))
                    self.log("Returned to Standby after stop.")
                except Exception:
                    pass
            threading.Thread(target=_back, daemon=True).start()

    def cleanup_processes(self, log_result=True, background=False):
        """Stop subprocesses owned by this app without touching unrelated system processes.

        Candidates are snapshotted *before* any background thread runs. Otherwise a
        switch-to-screen can start a new FFmpeg, then a late cleanup kills that new
        process (corrupt pipe / 'Packet too small' / verification timeout).
        """
        self.stop_evt.set()
        candidates = []
        for p in (self.cur, self.sender):
            if p is not None:
                candidates.append(p)
        try:
            if self.vp and getattr(self.vp, "proc", None):
                candidates.append(self.vp.proc)
        except Exception:
            pass
        # Stable list for the worker (not live attributes)
        to_kill = list(candidates)
        killed_ids = {id(p) for p in to_kill}

        def work():
            seen = set()
            stopped = 0
            for proc in to_kill:
                if not proc or id(proc) in seen:
                    continue
                seen.add(id(proc))
                try:
                    if kill_tree(proc):
                        stopped += 1
                except Exception as e:
                    self.ui.put(("log", f"Cleanup warning: {e}"))

            # Only clear handles we actually targeted — never wipe a newer sender.
            for attr in ("cur", "sender"):
                proc = getattr(self, attr, None)
                try:
                    if proc is not None and id(proc) in killed_ids:
                        if proc.poll() is not None:
                            setattr(self, attr, None)
                    elif proc is None or proc.poll() is not None:
                        if proc is not None and id(proc) not in killed_ids:
                            pass
                        elif proc is None:
                            setattr(self, attr, None)
                except Exception:
                    if getattr(self, attr, None) is not None and id(getattr(self, attr)) in killed_ids:
                        setattr(self, attr, None)
            try:
                if self.vp:
                    vp = getattr(self.vp, "proc", None)
                    if vp is None or id(vp) in killed_ids:
                        self.vp.stop()
            except Exception:
                pass
            if log_result:
                self.ui.put((
                    "log",
                    f"Cleanup complete: stopped {stopped} app-owned process(es). "
                    "Unrelated system processes were not touched."))

        if background:
            threading.Thread(target=work, daemon=True).start()
        else:
            work()

    def kill_procs(self):
        # Backwards-compatible alias used by existing shutdown paths.
        self.cleanup_processes(log_result=False)

    def on_close(self):
        """Also runs for Alt+F4 / window X — reap every tracked child PID."""
        self.stop_evt.set()
        try:
            if self._hotkeys:
                self._hotkeys.stop()
        except Exception:
            pass
        # Never block close on standby kill — do it in parallel then reap PIDs
        try:
            self.standby.stop(background=True, reason="Standby stopped (app closing).")
        except Exception:
            pass
        try:
            self.cleanup_processes(log_result=False, background=False)
        except Exception:
            pass
        try:
            proc_registry.kill_all_tracked(log=None)
        except Exception:
            pass
        try:
            if self.vp:
                self.vp.close()
        except Exception:
            pass
        try:
            mark_clean_exit()
        except Exception:
            pass
        try:
            shutil.rmtree(self.edit_tmp, ignore_errors=True)
        except Exception:
            pass
        try:
            self.root.destroy()
        except Exception:
            pass

    def _tooltip(self, widget, text):
        """Minimal hover tip — no extra windows until needed."""
        tip = {"win": None}

        def show(_e=None):
            if tip["win"] is not None:
                return
            try:
                x = widget.winfo_rootx() + 12
                y = widget.winfo_rooty() + widget.winfo_height() + 4
                w = tk.Toplevel(widget)
                w.wm_overrideredirect(True)
                w.wm_geometry(f"+{x}+{y}")
                lbl = tk.Label(
                    w, text=text, justify="left", background="#2a2e38",
                    foreground="#e8eaef", relief="solid", borderwidth=1,
                    font=("Segoe UI", 9), padx=6, pady=4, wraplength=360)
                lbl.pack()
                tip["win"] = w
            except Exception:
                tip["win"] = None

        def hide(_e=None):
            w = tip.get("win")
            tip["win"] = None
            if w is not None:
                try:
                    w.destroy()
                except Exception:
                    pass

        widget.bind("<Enter>", show)
        widget.bind("<Leave>", hide)

    def show_about(self):
        ff = shutil.which("ffmpeg") or "not found"
        fp = shutil.which("ffprobe") or "not found"
        backend = probe_wgc_backend() or "none"
        msg = (
            f"YT Stream Studio {APP_VERSION}\n\n"
            f"Python: {sys.executable}\n"
            f"Version: {sys.version.split()[0]}\n"
            f"FFmpeg: {ff}\n"
            f"FFprobe: {fp}\n"
            f"WGC backend: {backend}\n"
            f"Install dir: {APP_DIR}\n"
            f"Logs: {logs_root()}\n\n"
            "No telemetry. OAuth tokens stay in your user profile.\n"
            "Standby warms the encoder at low power so Go Live skips cold-start hitch."
        )
        messagebox.showinfo("About YT Stream Studio", msg)

    def _check_last_session(self):
        unc = last_session_unclean()
        if not unc:
            return
        self.log(
            f"Previous session may not have exited cleanly "
            f"(mode={unc.get('mode')}, at={unc.get('ts')}). "
            f"Logs are under {logs_root()}."
        )

    def _on_standby_state(self, state):
        """Called from standby worker threads — hop to UI thread."""
        try:
            self.root.after(0, lambda s=state: self._apply_standby_state(s))
        except Exception:
            pass

    def _apply_standby_state(self, state):
        if hasattr(self, "btn_standby"):
            try:
                self.btn_standby.set_state(state if not self.live else "disabled")
            except Exception:
                pass
        st = self.standby.status_text()
        if st and not self.live:
            self.status_var.set(st)

    def toggle_standby(self):
        if self.live:
            self.log("Standby is unavailable while live. Stop the stream first.")
            return
        if self.standby.active:
            self.standby.stop(reason="Standby OFF.")
            return
        self.standby_start()

    def standby_start(self, quiet=False):
        if self.live:
            return
        if not shutil.which("ffmpeg"):
            if not quiet:
                messagebox.showerror("Standby", "ffmpeg not found on PATH.")
            return
        self.standby.start(
            method_label=self.sc_method.get(),
            settings=self.screen_settings(),
        )

    def _stop_standby_for_live(self):
        """Stop standby before live encode. Never block the UI thread for long."""
        if self.standby.state == "off" and not self.standby.active:
            return
        # Brief non-blocking wait for ready (worker already running if user used standby)
        s = self.screen_settings()

        def handoff():
            try:
                ok = self.standby.prepare_handoff(
                    s, method_label=self.sc_method.get(), timeout=3.0)
                if ok:
                    self.log("Handoff: standby was ready — starting live encode.")
                else:
                    self.log("Handoff: standby not ready; starting live anyway.")
            except Exception as e:
                self.log(f"Handoff: {e}")
            try:
                self.standby.stop(
                    background=True,
                    reason="Standby OFF — live encode taking over.",
                )
            except Exception:
                pass

        threading.Thread(target=handoff, daemon=True, name="standby-handoff").start()
        # Tiny pause so stop is in flight before we spawn live ffmpeg
        time.sleep(0.15)

    def _refresh_standby_btn(self):
        if not hasattr(self, "btn_standby"):
            return
        if self.live:
            self.btn_standby.set_enabled(False)
        else:
            self.btn_standby.set_enabled(True)
            self.btn_standby.set_state(self.standby.state)
        st = self.standby.status_text()
        if st and not self.live:
            self.status_var.set(st)

    def _session_export(self):
        path = filedialog.asksaveasfilename(
            defaultextension=".json",
            filetypes=[("JSON", "*.json")],
            initialfile="yt_studio_sessions.json")
        if not path:
            return
        ok, msg = export_sessions(path)
        self.log(msg)
        if ok:
            messagebox.showinfo("Export", msg)

    def _session_import(self):
        path = filedialog.askopenfilename(filetypes=[("JSON", "*.json")])
        if not path:
            return
        ok, msg = import_sessions(path, merge=True)
        self.log(msg)
        if ok:
            self._session_combo["values"] = list_sessions()
            messagebox.showinfo("Import", msg)

    # ------------------------------------------------------------ BRB / sessions / hotkeys / live helpers
    def _start_hotkeys(self):
        try:
            self._hotkeys = GlobalHotkeys(self)
            self._hotkeys.start()
        except Exception as e:
            self.log(f"Hotkeys: {e}")

    def hotkey_go_live(self):
        if self.live:
            return
        self.call_ui(self.go_live)

    def hotkey_stop(self):
        if self.live:
            self.call_ui(self.stop_stream)

    def hotkey_brb(self):
        if self.live:
            self.call_ui(self.toggle_brb)

    def hotkey_mute(self):
        # Flag only — actual mic mute is handled inside the WGC audio path when MIX is on.
        self.log("Mute hotkey: use Ctrl+Alt+M while MIX/mic capture is active (WGC path).")

    def toggle_brb(self):
        if not self.live:
            return
        if self.holding:
            self.exit_brb()
        else:
            self.enter_brb()

    def enter_brb(self):
        """Show a BRB / holding card without ending the YouTube broadcast."""
        if not self.live or self.holding:
            return
        self.holding = True
        self.log("BRB: holding card (broadcast stays live). Press Resume when ready.")
        self.set_status("LIVE: BRB")
        self.update_buttons()
        if self.mode == "playlist":
            self.force_brb_playlist = True
            try:
                self.start_evt.set()
            except Exception:
                pass
            # Nudge current clip so the worker can pick up BRB on next loop
            try:
                if self.cur:
                    kill_tree(self.cur)
            except Exception:
                pass
        elif self.mode == "screen":
            # Kill capture so screen_worker loop enters holding branch
            try:
                if self.cur:
                    kill_tree(self.cur)
            except Exception:
                pass

    def exit_brb(self):
        if not self.holding:
            return
        self.holding = False
        self.force_brb_playlist = False
        self.log("BRB ended — resuming.")
        self.set_status("LIVE: resuming")
        self.update_buttons()

    def update_live_title(self):
        bid = self.broadcast_id
        title = self.title_var.get().strip()
        if not bid:
            messagebox.showinfo("Title", "No active broadcast to update. Go live with "
                                "'Use a YouTube broadcast' first.")
            return
        if not title:
            messagebox.showinfo("Title", "Type a title in the Title field first.")
            return

        def work():
            try:
                self.yt.update_title(bid, title)
                self.log(f"Broadcast title updated to: {title}")
            except Exception as e:
                self.log(f"Could not update title: {e}")
                self.call_ui(lambda: messagebox.showerror("Title", str(e)))

        threading.Thread(target=work, daemon=True).start()

    def open_live_chat(self):
        """Open the watch page (chat is on the right in the browser) — zero extra CPU in-app."""
        bid = self.broadcast_id
        if not bid:
            messagebox.showinfo("Chat", "No active broadcast. Go live with a YouTube broadcast first.")
            return
        url = self.yt.watch_url(bid)
        try:
            webbrowser.open(url)
            self.log(f"Opened chat / watch page: {url}")
        except Exception as e:
            self.log(f"Could not open browser: {e}")

    def _session_save(self):
        ok, msg = save_session(self._session_name.get(), self)
        self.log(msg)
        if ok:
            self._session_combo["values"] = list_sessions()

    def _session_load(self):
        ok, msg = load_session(self._session_name.get(), self)
        self.log(msg)

    def _session_delete(self):
        n = self._session_name.get().strip()
        if n and messagebox.askyesno("Delete session", f"Delete session '{n}'?"):
            if delete_session(n):
                self._session_name.set("")
                self._session_combo["values"] = list_sessions()
                self.log(f"Session '{n}' deleted.")

    def _apply_quality_preset(self, label, preset):
        apply_bitrate_preset(self, preset)
        self.log(f"Quality preset: {label} (applies on next screen start / resume from BRB).")
        if self.live and self.mode == "screen" and not self.holding:
            self.log("Tip: press BRB then Resume to restart capture at the new bitrate, "
                     "or Stop and Go Live again.")

    # ------------------------------------------------------------ workers
    def prep_worker(self):
        """Makes each clip stream-ready: stream as-is if it matches, else render once."""
        ref = self.ref
        stop = self.stop_evt  # this session's own event (it is replaced when switching)
        n = 0
        while not stop.is_set():
            try:
                it = self.prep_q.get(timeout=0.5)
            except queue.Empty:
                continue
            n += 1
            try:
                speed = it["fx"]["speed"]
                it["play_dur"] = (it["end"] - it["start"]) / speed
                if not needs_render(it, ref):
                    it["play"], it["cut"] = it["path"], True
                else:
                    self.log(f"Rendering: {it['name']}")
                    out = os.path.join(self.tmp, f"clip{n}.mp4")
                    cmd = build_render_cmd(it, ref, out, self.tmp)
                    r = subprocess.run(cmd, cwd=self.tmp, capture_output=True, text=True,
                                       creationflags=NOWIN)
                    if r.returncode != 0:
                        raise RuntimeError(r.stderr.strip()[-300:] or "ffmpeg failed")
                    it["play"], it["cut"] = out, False
                it["ready"] = True
                self.log(f"Ready: {it['name']}")
            except Exception as e:
                self.log(f"Couldn't prepare {it['name']}: {e}")
                with self.lock:
                    if it in self.items:
                        self.items.remove(it)
            self.ui.put(("refresh", None))

    def start_sender(self, url):
        # Copy TS packets into live FLV. Keep latency low and never write a final
        # duration/filesize (YouTube live rejects those).
        p = subprocess.Popen([
            "ffmpeg", "-hide_banner", "-loglevel", "warning",
            "-f", "mpegts", "-i", "pipe:0", "-c", "copy",
            "-muxdelay", "0", "-muxpreload", "0",
            "-flvflags", "no_duration_filesize",
            "-f", "flv", url,
        ], stdin=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=NOWIN)
        proc_registry.register(p)
        # Show the sender's warnings/errors in the log (it was silent before, so a dead or
        # stalled connection left no trace).
        threading.Thread(target=self._drain, args=(p, collections.deque(maxlen=50)),
                         daemon=True).start()
        return p

    def _run_holding_rtmp(self, url, stop):
        """Direct BRB card → RTMP while screen mode is on hold. Blocks until Resume or Stop."""
        work = tempfile.mkdtemp(prefix="yt_studio_brb_")
        try:
            ref = self.ref or {"w": 1280, "h": 720, "fps": 30}
            card = os.path.join(work, "brb.mp4")
            make_filler(self.brb_var.get() or "Be right back",
                        "Back shortly", ref, card, work)
            # Re-encode loop to RTMP (copy from short clip can drift; ultrafast is cheap)
            w, h, fps = even(ref["w"]), even(ref["h"]), int(ref["fps"])
            cmd = [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-re",
                "-stream_loop", "-1", "-i", card,
                "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
                "-pix_fmt", "yuv420p", "-g", str(max(fps, 1) * 2),
                "-c:a", "aac", "-b:a", "128k",
                "-f", "flv", url,
            ]
            p = self.cur = subprocess.Popen(cmd, creationflags=NOWIN)
            proc_registry.register(p)
            while p.poll() is None and not stop.is_set() and self.holding:
                time.sleep(0.4)
            if p.poll() is None:
                kill_tree(p)
        except Exception as e:
            self.log(f"BRB card error: {e}")
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def play_loop(self, path, offset, until, stop, music=False):
        """Loop a short filler clip (start screen / empty screen) as ONE continuous ffmpeg
        process until until() says stop. Restarting ffmpeg for every pass made a timestamp
        seam each time; a single looping process has none. Returns seconds played."""
        cmd, music_port = None, None
        if music:
            try:
                if not list_tracks(self.music_dir.get()):
                    raise ValueError("no audio files found in the music folder")
                music_port = free_port()
                cmd = build_music_cmd(path, offset, music_port)
            except Exception as e:
                self.log(f"Music unavailable ({e}); playing the start screen silent.")
                cmd, music_port = None, None
        if cmd is None:
            cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-re", "-stream_loop", "-1",
                   "-i", path, "-c", "copy", "-bsf:v", "h264_mp4toannexb",
                   "-output_ts_offset", f"{offset:.3f}", "-f", "mpegts", "pipe:1"]
        t0 = time.time()
        p = self.cur = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=self.sender.stdin,
                                        creationflags=NOWIN)
        proc_registry.register(p)
        if music_port:
            threading.Thread(target=music_feed, args=(
                music_port, self.music_dir.get(), self.music_vol.get(), p, self.log),
                daemon=True).start()
        while p.poll() is None and not stop.is_set() and not until():
            time.sleep(0.1)
        if p.poll() is None:
            try:  # 'q' lets ffmpeg finish the packet it is writing, so the pipe stays clean
                p.stdin.write(b"q")
                p.stdin.flush()
                p.wait(timeout=3)
            except Exception:
                kill_tree(p)
        return time.time() - t0

    def play_file(self, path, offset, ss=None, dur=None):
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-re"]
        if ss:
            cmd += ["-ss", f"{ss:.3f}"]
        cmd += ["-i", path]
        if dur:
            cmd += ["-t", f"{dur:.3f}"]
        cmd += ["-c", "copy", "-bsf:v", "h264_mp4toannexb",
                "-output_ts_offset", f"{offset:.3f}", "-f", "mpegts", "pipe:1"]
        self.cur = subprocess.Popen(cmd, stdout=self.sender.stdin, creationflags=NOWIN)
        proc_registry.register(self.cur)
        self.cur.wait()

    def stream_worker(self, url, bcast):
        self.broadcast_id = None
        stop = self.stop_evt  # this session's own event (it is replaced when switching)
        try:
            os.makedirs(self.tmp, exist_ok=True)
            intro = os.path.join(self.tmp, "intro.mp4")
            brb = os.path.join(self.tmp, "brb.mp4")
            if getattr(self, "tech_difficulties", False):
                self.tech_difficulties = False
                make_filler(
                    "Experiencing Technical Difficulties",
                    "Enjoy this video while we work on them.",
                    self.ref, intro, self.tmp)
                # Skip the long "starting soon" loop — jump into playlist clips.
                try:
                    self.start_evt.set()
                except Exception:
                    pass
            else:
                make_filler(self.intro_var.get() or "Stream starting soon",
                            "We'll be live in a moment", self.ref, intro, self.tmp)
            make_filler(self.brb_var.get() or "Be right back",
                        "More coming up shortly", self.ref, brb, self.tmp)

            if bcast:
                try:
                    self.broadcast_id = self.acquire_broadcast(bcast)
                except Exception as e:
                    self.log(f"Couldn't set up the broadcast ({e}). Streaming to your key anyway; "
                             "start it in YouTube Studio if it doesn't go live.")

            self.sender = self.start_sender(url)
            self.log("Connected. Start screen is playing.")
            if bcast and self.broadcast_id:
                # Make sure YouTube actually takes the broadcast live (in the background, so
                # the start screen keeps playing meanwhile).
                threading.Thread(target=self.confirm_live, args=(bcast, stop),
                                 daemon=True).start()
            if bcast and bcast.get("stream_id"):
                threading.Thread(target=self.health_watch,
                                 args=(bcast["stream_id"], stop), daemon=True).start()
            offset = 0.0

            def head_ready():
                with self.lock:
                    return bool(self.items and self.items[0]["ready"])

            while not stop.is_set():
                if self.sender.poll() is not None:
                    self.log(f"YouTube sender exited unexpectedly (code {self.sender.returncode}). "
                             "Automatic reconnect is disabled to avoid silently starting a replacement ingest. "
                             "Check the FFmpeg/network errors, then restart manually if needed.")
                    break

                if not self.start_evt.is_set():
                    # Start screen: loops until you press Start Playlist (or stop/switch)
                    self.set_status("LIVE: start screen")
                    played = self.play_loop(intro, offset, self.start_evt.is_set, stop,
                                            music=self.music_on.get())
                    offset += played + SEAM_SECONDS
                    if played < 1.0 and not stop.is_set() and not self.start_evt.is_set():
                        time.sleep(1)  # something failed fast, don't spin
                    continue

                # Explicit BRB only (button / auto-health). Never treat the normal
                # start screen or empty-playlist card as BRB mode.
                if self.holding or self.force_brb_playlist:
                    self.set_status("LIVE: BRB")
                    played = self.play_loop(
                        brb, offset,
                        lambda: (not self.holding and not self.force_brb_playlist)
                        or stop.is_set(),
                        stop, music=self.music_on.get())
                    offset += played + SEAM_SECONDS
                    if not self.holding:
                        self.force_brb_playlist = False
                    continue

                with self.lock:
                    item = self.items[0] if self.items and self.items[0]["ready"] else None
                    if item:
                        self.items.pop(0)
                        if self.loop_var.get():
                            self.items.append(item)
                self.ui.put(("refresh", None))
                if item:
                    self.set_status(f"LIVE: {item['name']}")
                    self.log(f"Playing: {item['name']}")
                    started = time.time()
                    self.play_file(item["play"], offset,
                                   ss=item["start"] if item["cut"] else None,
                                   dur=item["play_dur"])
                    if time.time() - started < min(1.0, item["play_dur"]) and not stop.is_set():
                        time.sleep(1)  # something failed fast, don't spin
                    else:
                        offset += item["play_dur"]
                else:
                    # Nothing ready: loop the empty screen until a clip is ready
                    self.set_status("LIVE: waiting for clips")
                    played = self.play_loop(brb, offset, head_ready, stop)
                    offset += played + SEAM_SECONDS
                    if played < 1.0 and not stop.is_set():
                        time.sleep(1)
        except Exception as e:
            self.log(f"Stream error: {e}")
        finally:
            switch = self.pending_switch  # set when switching to your screen
            stop.set()
            try:
                if self.sender and self.sender.stdin:
                    self.sender.stdin.close()
            except Exception:
                pass
            self.kill_procs()
            bid = self.broadcast_id
            if bid and not switch:
                self.finish_broadcast(bid)  # when switching, the broadcast is kept
            if self.tmp:
                shutil.rmtree(self.tmp, ignore_errors=True)
            if switch:
                self.call_ui(lambda: self._finish_switch(switch, bid))
            else:
                self.log("Stream stopped.")
                self.ui.put(("ended", None))

if __name__ == "__main__":
    tk_root = tk.Tk()
    App(tk_root)
    tk_root.mainloop()