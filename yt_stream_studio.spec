# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for YT Stream Studio (Windows, one-folder).
#
# IMPORTANT
# ---------
# 1. Use Python 3.10–3.12 (3.13 may work; 3.14 is too new for reliable packaging).
# 2. Build inside a CLEAN venv that only has requirements.txt + pyinstaller.
# 3. Run the app from dist\YT_Stream_Studio\ — never from build\.
#
# Build:
#   build.bat
#   — or —
#   python -m PyInstaller --noconfirm yt_stream_studio.spec
#
# Output: dist/YT_Stream_Studio/YT_Stream_Studio.exe
# Drop ffmpeg.exe + ffprobe.exe next to the .exe (or keep them on PATH).

import sys
from PyInstaller.utils.hooks import collect_submodules, collect_data_files, collect_dynamic_libs

block_cipher = None

# ---------------------------------------------------------------------------
# Only pull in packages this app actually uses. Do NOT collect_submodules on
# the whole environment — that drags torch / transformers / sklearn into the
# warn file and can break the bootloader when those packages are half-present.
# ---------------------------------------------------------------------------
hidden = [
    "tkinter",
    "tkinter.ttk",
    "tkinter.filedialog",
    "tkinter.messagebox",
    "queue",
    "csv",
    "wave",
    "json",
    "ctypes",
    "ctypes.wintypes",
    # package modules (entry is yt_stream_studio.py → package)
    "yt_stream_studio",
    "yt_stream_studio.app",
    "yt_stream_studio.config",
    "yt_stream_studio.util",
    "yt_stream_studio.features",
    "yt_stream_studio.profiles",
    "yt_stream_studio.music",
    "yt_stream_studio.player",
    "yt_stream_studio.safety",
    "yt_stream_studio.youtube_api",
    "yt_stream_studio.standby",
    "yt_stream_studio.power_btn",
    "yt_stream_studio.logutil",
    "yt_stream_studio.session_meta",
    "yt_stream_studio.instance",
    "yt_stream_studio.proc_registry",
    "yt_stream_studio.capture",
    "yt_stream_studio.diagnostics",
]

# Optional Windows capture / audio — include only if importable in this venv.
for pkg in (
    "windows_capture",
    "dxcam",
    "pyaudiowpatch",
    "numpy",
    "cv2",
    "sounddevice",
    "proctap",
):
    try:
        __import__(pkg if pkg != "cv2" else "cv2")
        hidden += collect_submodules(pkg if pkg != "cv2" else "cv2")
    except Exception:
        pass

datas = [("Start screen music", "Start screen music")]
binaries = []
for pkg in ("cv2", "numpy", "pyaudiowpatch", "windows_capture", "dxcam"):
    try:
        binaries += collect_dynamic_libs(pkg)
    except Exception:
        pass
    try:
        datas += collect_data_files(pkg)
    except Exception:
        pass

# Heavy / unrelated stacks that must never enter this build (even if installed
# globally on the machine). Keeps the warn file short and the folder small.
EXCLUDES = [
    # ML / data science (common site-packages pollution)
    "torch", "torchvision", "torchaudio", "torchgen",
    "transformers", "tokenizers", "huggingface_hub", "safetensors", "accelerate",
    "sklearn", "scikit-learn", "scipy", "pandas", "matplotlib", "numba", "llvmlite",
    "onnx", "onnxruntime", "onnxscript", "sympy", "networkx", "fsspec",
    "tensorflow", "keras", "jax", "jaxlib",
    # Dev / notebook
    "IPython", "jupyter", "notebook", "pytest", "unittest", "_pytest",
    "setuptools", "pip", "wheel", "pkg_resources",
    # Misc optional
    "yt_dlp", "av", "cv2.typing",
    "discord", "gradio", "fastapi", "starlette",
]

a = Analysis(
    ["yt_stream_studio.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=EXCLUDES,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="YT_Stream_Studio",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,          # UPX breaks native audio/capture DLLs on Windows
    console=False,      # GUI app
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="YT_Stream_Studio",
)
