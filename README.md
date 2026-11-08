# YT Stream Studio

Windows-focused tool for going live on YouTube: playlist of local clips **or** screen/window capture, with YouTube OAuth, live broadcast control, music beds, profiles, and diagnostics.

**Version:** 2.0.0  
**Platform:** Windows 10/11 (primary). Requires FFmpeg on PATH.

---

## Quick start

```bash
# 1. Clone / unpack into a folder, then:
cd "Yt Streamer"

# 2. (Recommended) use a venv
python -m venv .venv
.venv\Scripts\activate

# 3. Install Python packages
python -m pip install -r requirements.txt

# 4. Make sure FFmpeg is installed and on PATH
ffmpeg -version
ffprobe -version

# 5. Run
python yt_stream_studio.py
# or:
python -m yt_stream_studio
```

---

## External requirements

| Requirement | Why | Notes |
|-------------|-----|--------|
| **FFmpeg + ffprobe** | Encoding, capture, preview, RTMP publish | Must be on `PATH`. Get a full build (e.g. from https://www.gyan.dev/ffmpeg/builds/ or BtbN). |
| **Python 3.10–3.12** (recommended) | Runtime | 3.13/3.14 may work but some native wheels (windows-capture, PyAudioWPatch) lag. |
| **Google OAuth client** | Create/manage YouTube live broadcasts from the app | Free. See “YouTube sign-in” below. |

### Optional but strongly recommended packages

These are listed in `requirements.txt`. Without them some features degrade:

- `windows-capture` or `dxcam` → modern window / desktop capture (WGC path)
- `PyAudioWPatch` + `numpy` → system audio (WASAPI loopback) and mic mix
- `opencv-python-headless` → faster downscale in the WGC producer (avoids big FPS drops)

---

## YouTube sign-in (OAuth)

The app does **not** ship with Google credentials. You create a free OAuth client:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or pick an existing one)
3. **APIs & Services → Library** → enable **YouTube Data API v3**
4. **APIs & Services → OAuth consent screen** → External → fill app name + your email
5. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Desktop app**
6. Download the JSON and either:
   - Use **Sign in** in the app and point it at the file, or
   - Copy it to `%USERPROFILE%\.yt_stream_studio_client.json`

The app stores the refresh token under `%USERPROFILE%\.yt_stream_studio_token.json`.

---

## Project layout

```
Yt Streamer/
├── yt_stream_studio.py          # launcher
├── yt_stream_studio/            # main package
│   ├── app.py                   # Tk UI + stream orchestration
│   ├── config.py                # paths, constants
│   ├── youtube_api.py           # OAuth + liveBroadcasts / liveStreams
│   ├── player.py                # preview player (FFmpeg → Tk)
│   ├── music.py                 # start-screen music feeder
│   ├── profiles.py              # saved screen profiles
│   ├── safety.py                # auto-recover + health alerts
│   ├── util.py
│   ├── capture/                 # screen, WGC, audio, ffmpeg command builders
│   └── diagnostics/             # benchmark + performance reports
├── requirements.txt
├── live_tune.py                 # standalone A/V delay helper
├── sync_check.py                # standalone lip-sync checker (needs yt-dlp)
└── Start screen music/          # optional beds for the starting-soon screen
```

Config and secrets live in the user profile (`~/.yt_stream_studio*.json`), not inside the project folder.

---

## Common issues

**“FFmpeg not found”**  
Install FFmpeg and ensure `ffmpeg.exe` / `ffprobe.exe` are on your system `PATH`. Restart the terminal (and the app) after changing PATH.

**WGC / window capture unavailable**  
```text
python -m pip install windows-capture
python -c "import windows_capture; print('ok')"
```
Install into the **same** Python that launches the app.

**No system audio**  
```text
python -m pip install PyAudioWPatch numpy
```

**OAuth / “no client”**  
You still need to create the Desktop OAuth client in Google Cloud (see above). The app cannot ship shared credentials.

**Stream key only (no API)**  
You can still publish with a stream key + ingest URL without signing in; broadcast creation/management and health polling require OAuth.

---

## Feature matrix (what works without optional pieces)

| Capability | Needs |
|------------|--------|
| Playlist → RTMP | FFmpeg + stream key |
| YouTube broadcast create / health / title | OAuth client + sign-in |
| Screen via ddagrab / gdigrab | FFmpeg (Windows) |
| WGC window capture | `windows-capture` or `dxcam` |
| System audio (WASAPI) | `PyAudioWPatch` + `numpy` |
| Fast WGC downscale | `opencv-python-headless` |
| Standby (warm encoder) | FFmpeg only |
| Global hotkeys | Windows |

---

## Standby (warm encoder, low power)

**Standby (warm)** runs a trickle encode: desktop (or test pattern) → H.264 at 320×180 @ 5 fps → **null** sink.  
That keeps QSV/x264 and capture paths warm so the first GOPs after **Go Live** hitch less, while using little CPU/GPU.

- Click **Standby (warm)** before going live; it turns off automatically when you go live.
- Process priority is below-normal on Windows.
- Nothing is uploaded or written to disk.

---

## Logs & support

- Rotating log: `logs/app.log` (secrets redacted).
- Last session marker: `logs/last_session.json` (detects unclean exit).
- No telemetry.

Smoke tests:

```bat
python tests/test_smoke.py
```

---

## Packaging (Windows .exe)

The project ships a **one-folder** PyInstaller setup (recommended over one-file for native capture/audio modules).

### Build

On a Windows machine with **Python 3.10–3.12** (do **not** package with 3.14 — it often fails with `Failed to load Python DLL ... python314.dll`):

```bat
cd "Yt Streamer"
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
python -m pip install "pyinstaller>=6.0"

build.bat
```

Use a **clean venv**. Building from a global env that has torch/transformers/etc. produces a huge warn list and fragile packages.

Or PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\build_onedir.ps1
```

Output:

```text
dist\YT_Stream_Studio\
  YT_Stream_Studio.exe
  Start screen music\          (bundled beds)
  _internal\                   (Python + native libs)
  ...
```

### After building

1. Copy **`ffmpeg.exe`** and **`ffprobe.exe`** into `dist\YT_Stream_Studio\` (same folder as the `.exe`), **or** keep them on system `PATH`.
2. Run **only**:
   ```text
   dist\YT_Stream_Studio\YT_Stream_Studio.exe
   ```
   Do **not** run anything under `build\` — that is intermediate PyInstaller output. An error pointing at `build\...\python3xx.dll` means the wrong folder or an unsupported Python was used.
3. Optional packages that were installed in the build environment (e.g. `windows-capture`, `PyAudioWPatch`, OpenCV) are bundled automatically when present at build time.

### Notes

- **One-folder** is intentional: faster startup, easier debugging, and native DLLs (WASAPI / WGC / OpenCV) are less fragile than in a single-file EXE.
- Config and OAuth tokens still live under `%USERPROFILE%\.yt_stream_studio*.json` (not inside the install folder).
- Logs are written under `logs\` next to the `.exe`.
- Do **not** enable UPX; it frequently breaks audio/capture DLLs on Windows.

---

## Notes

- Primary target: 720p30 H.264 CBR over RTMP to YouTube.
- Screen capture prefers hardware encode (`h264_qsv`) when available, falls back to `libx264`.
- Long-stream safety: if the capture process dies, the app can restart it into the same broadcast a few times and surfaces YouTube health warnings.

---

## License / status

Personal / experimental project. Use at your own risk when going live.
