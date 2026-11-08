"""Performance diagnostic sampling and reports."""
import collections
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime

from ..config import NOWIN, HOME
from ..util import kill_tree
from ..capture.screen import TIER_NAMES

# ---------------------------------------------------------------- performance diagnostic report
import ctypes
import ctypes.wintypes

DIAG_VERSION = "2.0"


def _run(cmd, timeout=20):
    """Run a command, return (returncode, stdout, stderr)."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", creationflags=NOWIN, timeout=timeout)
        return r.returncode, r.stdout, r.stderr
    except Exception as e:
        return -1, "", str(e)


def _run_ps(script, timeout=20):
    """Run a PowerShell one-liner, return stdout."""
    rc, out, err = _run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                         "-Command", script], timeout=timeout)
    return out.strip() if rc == 0 else ""


def _run_wmic(query, timeout=20):
    """Run a wmic query, return stdout lines."""
    rc, out, err = _run(["wmic", query], timeout=timeout)
    if rc != 0:
        return []
    return [l.strip() for l in out.splitlines() if l.strip()]


def get_diagnostic_system_info():
    """Collect static system information for the diagnostic report."""
    info = {}
    info["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    info["app_version"] = DIAG_VERSION
    info["python_version"] = sys.version.split()[0]
    info["platform"] = platform.platform()

    # Windows version
    rc, out, _ = _run(["wmic", "os", "get", "Caption,Version,BuildNumber", "/format:value"])
    if rc == 0:
        for line in out.splitlines():
            if line.startswith("Caption="):
                info["windows_version"] = line.split("=", 1)[1]
            elif line.startswith("Version="):
                info["windows_version_detail"] = line.split("=", 1)[1]
            elif line.startswith("BuildNumber="):
                info["build_number"] = line.split("=", 1)[1]

    # CPU
    rc, out, _ = _run(["wmic", "cpu", "get", "Name,NumberOfLogicalProcessors,MaxClockSpeed", "/format:value"])
    if rc == 0:
        for line in out.splitlines():
            if line.startswith("Name="):
                info["cpu_model"] = line.split("=", 1)[1]
            elif line.startswith("NumberOfLogicalProcessors="):
                info["cpu_logical_cpus"] = line.split("=", 1)[1]
            elif line.startswith("MaxClockSpeed="):
                info["cpu_max_mhz"] = line.split("=", 1)[1]

    # Memory
    rc, out, _ = _run(["wmic", "computersystem", "get", "TotalPhysicalMemory", "/format:value"])
    if rc == 0:
        for line in out.splitlines():
            if line.startswith("TotalPhysicalMemory="):
                try:
                    info["ram_total_bytes"] = int(line.split("=", 1)[1])
                    info["ram_total_gb"] = round(info["ram_total_bytes"] / (1024 ** 3), 2)
                except Exception:
                    pass

    # GPU
    gpus = []
    rc, out, _ = _run(["wmic", "path", "win32_videocontroller", "get",
                       "Name,AdapterRAM,DriverVersion,VideoProcessor", "/format:value"])
    if rc == 0:
        gpu = {}
        for line in out.splitlines():
            if line == "":
                if gpu:
                    gpus.append(gpu)
                    gpu = {}
            elif "=" in line:
                k, v = line.split("=", 1)
                if k == "Name":
                    gpu["name"] = v
                elif k == "AdapterRAM":
                    try:
                        gpu["ram_bytes"] = int(v)
                        gpu["ram_gb"] = round(int(v) / (1024 ** 3), 2) if int(v) > 0 else 0
                    except Exception:
                        gpu["ram_gb"] = 0
                elif k == "DriverVersion":
                    gpu["driver"] = v
                elif k == "VideoProcessor":
                    gpu["processor"] = v
        if gpu:
            gpus.append(gpu)
    info["gpus"] = gpus

    # FFmpeg info
    info["ffmpeg_path"] = shutil.which("ffmpeg") or "Not found on PATH"
    info["ffprobe_path"] = shutil.which("ffprobe") or "Not found on PATH"
    info["ffmpeg_version"] = "Unavailable"
    info["ffmpeg_build_config"] = "Unavailable"
    info["ddagrab_available"] = "Unknown"
    info["gdigrab_available"] = "Unknown"
    info["h264_qsv_available"] = "Unknown"
    info["libx264_available"] = "Unknown"

    if info["ffmpeg_path"] != "Not found on PATH":
        rc, out, err = _run(["ffmpeg", "-version"], timeout=15)
        if rc == 0:
            first_line = out.splitlines()[0] if out.splitlines() else ""
            info["ffmpeg_version"] = first_line
        rc, out, err = _run(["ffmpeg", "-buildconf"], timeout=15)
        if rc == 0:
            info["ffmpeg_build_config"] = out.strip()[:500]

        rc, out, err = _run(["ffmpeg", "-hide_banner", "-encoders"], timeout=15)
        if rc == 0:
            text = out + err
            info["h264_qsv_available"] = "Yes" if "h264_qsv" in text else "No"
            info["libx264_available"] = "Yes" if "libx264" in text else "No"
        # ddagrab is a lavfi filter; gdigrab is an input device/format.
        rc, out, err = _run(["ffmpeg", "-hide_banner", "-filters"], timeout=15)
        if rc == 0:
            text = out + err
            info["ddagrab_available"] = "Yes" if "ddagrab" in text else "No"
        rc, out, err = _run(["ffmpeg", "-hide_banner", "-devices"], timeout=15)
        if rc == 0:
            text = out + err
            info["gdigrab_available"] = "Yes" if "gdigrab" in text else "No"
        if info.get("gdigrab_available") == "Unknown":
            # Older builds list gdigrab under formats instead of devices.
            rc, out, err = _run(["ffmpeg", "-hide_banner", "-formats"], timeout=15)
            if rc == 0 and "gdigrab" in (out + err):
                info["gdigrab_available"] = "Yes"

    # WGC is not an FFmpeg input — it is our Python producer (windows-capture / dxcam).
    backend = probe_wgc_backend()
    if backend:
        info["wgc_backend"] = backend
        info["wgc_available"] = "Yes"
    else:
        info["wgc_backend"] = "none"
        info["wgc_available"] = "No (pip install windows-capture)"

    # Display info
    if sys.platform.startswith("win"):
        info["screen_width"] = str(ctypes.windll.user32.GetSystemMetrics(0))
        info["screen_height"] = str(ctypes.windll.user32.GetSystemMetrics(1))
    else:
        info["screen_width"] = "Unavailable"
        info["screen_height"] = "Unavailable"

    # Power plan
    if sys.platform.startswith("win"):
        rc, out, err = _run(["powercfg", "/getactivescheme"], timeout=15)
        if rc == 0:
            info["power_plan"] = out.strip()[:200]
        rc, out, err = _run(["wmic", "path", "win32_battery", "get",
                             "EstimatedChargeRemaining,BatteryStatus", "/format:value"], timeout=15)
        if rc == 0:
            charging = False
            for line in out.splitlines():
                if "BatteryStatus=" in line:
                    try:
                        status = int(line.split("=", 1)[1])
                        charging = status != 2
                    except Exception:
                        pass
            info["power_source"] = "AC (charging)" if charging else "Battery or unknown"

    return info


_PROCESS_CPU_PREVIOUS = {}
_SYSTEM_CPU_PREVIOUS = None

def _filetime_value(ft):
    return (int(ft.dwHighDateTime) << 32) | int(ft.dwLowDateTime)

def sample_process_metrics(pid):
    """Read FFmpeg CPU/RSS metrics using Win32 APIs (no per-sample PowerShell process)."""
    result = {"pid": pid, "cpu_percent": "Unavailable", "rss_mb": "Unavailable",
              "threads": "Unavailable", "handles": "Unavailable", "priority": "Unavailable"}
    if not sys.platform.startswith("win") or not pid:
        return result
    try:
        import ctypes
        from ctypes import wintypes
        class FILETIME(ctypes.Structure):
            _fields_ = [("dwLowDateTime", wintypes.DWORD), ("dwHighDateTime", wintypes.DWORD)]
        class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                        ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                        ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        h = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | 0x0400, False, int(pid))
        if not h:
            return result
        try:
            creation, exit_t, kernel, user = FILETIME(), FILETIME(), FILETIME(), FILETIME()
            if ctypes.windll.kernel32.GetProcessTimes(h, ctypes.byref(creation), ctypes.byref(exit_t),
                                                       ctypes.byref(kernel), ctypes.byref(user)):
                cpu_seconds = (_filetime_value(kernel) + _filetime_value(user)) / 10_000_000.0
                now = time.monotonic()
                prev = _PROCESS_CPU_PREVIOUS.get(int(pid))
                _PROCESS_CPU_PREVIOUS[int(pid)] = (now, cpu_seconds)
                if prev and now > prev[0]:
                    # Normalize to total machine capacity, matching Task Manager's convention.
                    result["cpu_percent"] = round(min(100.0, max(0.0, cpu_seconds-prev[1]) /
                                                       (now-prev[0]) * 100.0 / max(1, os.cpu_count() or 1)), 1)
            counters = PROCESS_MEMORY_COUNTERS()
            counters.cb = ctypes.sizeof(counters)
            if ctypes.windll.psapi.GetProcessMemoryInfo(h, ctypes.byref(counters), counters.cb):
                result["rss_mb"] = round(counters.WorkingSetSize / (1024*1024), 1)
            result["priority"] = "Unavailable"
        finally:
            ctypes.windll.kernel32.CloseHandle(h)
    except Exception:
        pass
    return result

def sample_system_metrics():
    """Sample CPU and RAM via Win32 APIs without spawning PowerShell during a live stream."""
    global _SYSTEM_CPU_PREVIOUS
    result = {"cpu_percent": "Unavailable", "ram_available_mb": "Unavailable",
              "ram_used_mb": "Unavailable"}
    if not sys.platform.startswith("win"):
        return result
    try:
        import ctypes
        from ctypes import wintypes
        class FILETIME(ctypes.Structure):
            _fields_ = [("dwLowDateTime", wintypes.DWORD), ("dwHighDateTime", wintypes.DWORD)]
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [("dwLength", wintypes.DWORD), ("dwMemoryLoad", wintypes.DWORD),
                        ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
        idle, kernel, user = FILETIME(), FILETIME(), FILETIME()
        if ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)):
            now = time.monotonic()
            values = (_filetime_value(idle), _filetime_value(kernel), _filetime_value(user))
            prev = _SYSTEM_CPU_PREVIOUS
            _SYSTEM_CPU_PREVIOUS = (now, values)
            if prev and now > prev[0]:
                dt = [max(0, values[i]-prev[1][i]) for i in range(3)]
                total = dt[1] + dt[2]
                busy = total - dt[0]
                result["cpu_percent"] = round(max(0.0, min(100.0, busy/total*100.0)), 1) if total else 0.0
        mem = MEMORYSTATUSEX()
        mem.dwLength = ctypes.sizeof(mem)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(mem)):
            result["ram_available_mb"] = round(mem.ullAvailPhys/(1024*1024), 1)
            result["ram_used_mb"] = round((mem.ullTotalPhys-mem.ullAvailPhys)/(1024*1024), 1)
    except Exception:
        pass
    return result

def sample_gpu_metrics():
    """Sample GPU engine utilization via PowerShell Get-Counter."""
    gpus = []
    if not sys.platform.startswith("win"):
        return gpus

    ps = ("Get-Counter '\\GPU Engine(*)\\*' -SampleInterval 1 -MaxSamples 1 "
          "-ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | "
          "ForEach-Object { $_.CounterSamples | ForEach-Object { $_.Path; $_.CookedValue } } | "
          "ConvertTo-Json -Depth 1")
    out = _run_ps(ps, timeout=15)
    if out:
        try:
            import json as _json
            data = _json.loads(out)
            for i in range(0, len(data), 2):
                if i + 1 < len(data):
                    path = str(data[i])
                    value = data[i + 1]
                    gpu_name = "Unknown GPU"
                    engine = "Unknown"
                    if "\\" in path:
                        parts = path.split("\\")
                        for p in reversed(parts):
                            if "GPU" in p or "Engine" in p:
                                continue
                            gpu_name = p.strip()
                            break
                        engine = parts[-1].strip() if parts else "Unknown"
                    gpus.append({"gpu": gpu_name, "engine": engine, "utilization": value})
        except Exception:
            pass

    rc, out, err = _run(["wmic", "path", "win32_videocontroller", "get",
                         "Name,AdapterRAM", "/format:value"], timeout=15)
    if rc == 0:
        mem_info = {}
        for line in out.splitlines():
            if line.startswith("Name="):
                mem_info["name"] = line.split("=", 1)[1]
            elif line.startswith("AdapterRAM="):
                try:
                    mem_info["ram_gb"] = round(int(line.split("=", 1)[1]) / (1024 ** 3), 2)
                except Exception:
                    mem_info["ram_gb"] = 0
        if mem_info:
            gpus.append({"gpu": mem_info.get("name", "Unknown"),
                         "engine": "Memory", "utilization": mem_info.get("ram_gb", 0),
                         "is_memory": True})

    return gpus


def get_diagnostic_ffmpeg_caps():
    """Return a dict of FFmpeg capability checks."""
    caps = {}
    path = shutil.which("ffmpeg")
    if not path:
        return {"ffmpeg": "Not found on PATH"}
    caps["ffmpeg_path"] = path
    rc, out, err = _run(["ffmpeg", "-version"], timeout=15)
    caps["version"] = out.splitlines()[0] if rc == 0 and out.splitlines() else "Unavailable"

    for name, args in (("ddagrab", ["-hide_banner", "-filters"]),
                       ("gdigrab", ["-hide_banner", "-filters"]),
                       ("h264_qsv", ["-hide_banner", "-encoders"]),
                       ("libx264", ["-hide_banner", "-encoders"])):
        rc, out, err = _run(["ffmpeg"] + args, timeout=15)
        text = (out + err).lower()
        if name in ("ddagrab", "gdigrab"):
            caps[name] = "Yes" if name in text else "No"
        else:
            caps[name] = "Yes" if name in text else "No"
    return caps


def write_diagnostic_report(filename, sections_text):
    """Write the diagnostic report to a file and return the absolute path."""
    abs_path = os.path.abspath(filename)
    with open(abs_path, "w", encoding="utf-8") as f:
        f.write(sections_text)
    return abs_path



# ---------------------------------------------------------------- diagnostic report v2
try:
    from ..config import log_dir as _log_dir
    REPORT_DIR = _log_dir("reports")
except Exception:
    REPORT_DIR = os.path.join(HOME, "yt_stream_studio_reports")

# tier -> (capture method, encoder). One place, so the report can never mislabel a tier.
TIER_PATHS = {
    "wgc_qsv": ("WGC (Python producer -> pipe)", "h264_qsv"),
    "wgc_x264": ("WGC (Python producer -> pipe)", "libx264"),
    "gpu_native": ("ddagrab (DXGI, zero-copy)", "h264_qsv"),
    "gpu": ("ddagrab (DXGI) + CPU scale", "h264_qsv"),
    "gpu_fixed": ("ddagrab (DXGI) + CPU scale", "h264_qsv"),
    "gpu_x264": ("ddagrab (DXGI) + CPU scale", "libx264"),
    "ddagrab_qsv": ("ddagrab (DXGI)", "h264_qsv"),
    "ddagrab_x264": ("ddagrab (DXGI)", "libx264"),
    "gdigrab_qsv": ("gdigrab (GDI)", "h264_qsv"),
    "gdigrab_x264": ("gdigrab (GDI)", "libx264"),
}
# Process names that mean "this was NOT a game in the foreground".
NON_GAME_PROCS = {"python.exe", "pythonw.exe", "py.exe", "explorer.exe", "cmd.exe",
                  "powershell.exe", "windowsterminal.exe", "notepad.exe", "code.exe",
                  "applicationframehost.exe", "searchhost.exe", "shellexperiencehost.exe",
                  "taskmgr.exe", "chrome.exe", "msedge.exe", "firefox.exe", "(none)", "?"}


def tier_paths(tier):
    return TIER_PATHS.get(tier, ("Unknown (no verified active tier)", "Unknown"))


def redact_secrets(text):
    """Remove stream keys from any text that goes into a report."""
    text = re.sub(r"(rtmps?://[^\s'\"]*/)[^/\s'\"]+", r"\1[STREAM_KEY]", str(text))
    return re.sub(r"(?i)(key|token|secret)=\S+", r"\1=[REDACTED]", text)


def get_power_status():
    """AC/battery via GetSystemPowerStatus (no subprocess)."""
    out = {"ac": "Unknown", "battery_pct": "Unknown", "saver": "Unknown"}
    if not sys.platform.startswith("win"):
        return out
    try:
        from ctypes import wintypes

        class SPS(ctypes.Structure):
            _fields_ = [("ACLineStatus", wintypes.BYTE), ("BatteryFlag", wintypes.BYTE),
                        ("BatteryLifePercent", wintypes.BYTE), ("SystemStatusFlag", wintypes.BYTE),
                        ("BatteryLifeTime", wintypes.DWORD), ("BatteryFullLifeTime", wintypes.DWORD)]
        st = SPS()
        if ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(st)):
            out["ac"] = {0: "On battery", 1: "Plugged in (AC)"}.get(st.ACLineStatus, "Unknown")
            out["battery_pct"] = (f"{st.BatteryLifePercent}%" if st.BatteryLifePercent != 255
                                  else "Unknown")
            out["saver"] = "ON" if st.SystemStatusFlag == 1 else "off"
    except Exception:
        pass
    return out


def _reg_dword(root, path, name):
    try:
        import winreg
        with winreg.OpenKey(root, path) as k:
            return winreg.QueryValueEx(k, name)[0]
    except Exception:
        return None


def get_windows_extras():
    """Settings that change game/stream behaviour: GPU scheduling, Game Mode, Game DVR,
    display scaling/refresh, Windows build. All best-effort."""
    x = {}
    if not sys.platform.startswith("win"):
        return x
    try:
        import winreg
        hk, hl = winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE
        h = _reg_dword(hl, r"SYSTEM\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode")
        x["hw_gpu_scheduling"] = {2: "ON", 1: "off"}.get(h, "not set / unsupported")
        g = _reg_dword(hk, r"Software\Microsoft\GameBar", "AutoGameModeEnabled")
        x["game_mode"] = {1: "ON", 0: "off"}.get(g, "default (usually ON)")
        d = _reg_dword(hk, r"System\GameConfigStore", "GameDVR_Enabled")
        x["game_dvr_capture"] = {1: "ON", 0: "off"}.get(d, "default")
        # Fullscreen optimisations / "Xbox Game Bar capture" can fight screen capture.
    except Exception:
        pass
    try:
        x["dpi_scale_pct"] = int(ctypes.windll.shcore.GetScaleFactorForDevice(0))
    except Exception:
        pass
    try:
        from ctypes import wintypes

        class DEVMODE(ctypes.Structure):
            _fields_ = [("dmDeviceName", ctypes.c_wchar * 32), ("dmSpecVersion", wintypes.WORD),
                        ("dmDriverVersion", wintypes.WORD), ("dmSize", wintypes.WORD),
                        ("dmDriverExtra", wintypes.WORD), ("dmFields", wintypes.DWORD),
                        ("dmPositionX", ctypes.c_long), ("dmPositionY", ctypes.c_long),
                        ("dmDisplayOrientation", wintypes.DWORD), ("dmDisplayFixedOutput", wintypes.DWORD),
                        ("dmColor", ctypes.c_short), ("dmDuplex", ctypes.c_short),
                        ("dmYResolution", ctypes.c_short), ("dmTTOption", ctypes.c_short),
                        ("dmCollate", ctypes.c_short), ("dmFormName", ctypes.c_wchar * 32),
                        ("dmLogPixels", wintypes.WORD), ("dmBitsPerPel", wintypes.DWORD),
                        ("dmPelsWidth", wintypes.DWORD), ("dmPelsHeight", wintypes.DWORD),
                        ("dmDisplayFlags", wintypes.DWORD), ("dmDisplayFrequency", wintypes.DWORD)]
        dm = DEVMODE()
        dm.dmSize = ctypes.sizeof(DEVMODE)
        if ctypes.windll.user32.EnumDisplaySettingsW(None, -1, ctypes.byref(dm)):
            x["display_mode"] = f"{dm.dmPelsWidth}x{dm.dmPelsHeight} @ {dm.dmDisplayFrequency} Hz"
    except Exception:
        pass
    return x


def probe_ffmpeg_runtime():
    """Does QuickSync / ddagrab actually WORK here (not just exist in the build)?
    Each probe is a ~1-2 s throwaway encode to nowhere."""
    res = {}
    if not shutil.which("ffmpeg"):
        return res
    rc, out, err = _run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                         "-i", "testsrc2=size=640x360:rate=30", "-t", "1", "-vf", "format=nv12",
                         "-c:v", "h264_qsv", "-f", "null", "-"], timeout=30)
    res["qsv_encode_works"] = (rc == 0, (err or out).strip()[-200:])
    rc, out, err = _run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                         "ddagrab=output_idx=0:framerate=30", "-frames:v", "10",
                         "-vf", "hwdownload,format=bgra", "-f", "null", "-"], timeout=30)
    res["ddagrab_works"] = (rc == 0, (err or out).strip()[-200:])
    return res


def collect_snapshot(runtime_probes=True):
    """Everything static: hardware, drivers, OS, ffmpeg, power, display, capture backends."""
    info = get_diagnostic_system_info()
    # wmic is removed from new Windows 11 builds -> fill gaps with PowerShell/CIM.
    if sys.platform.startswith("win") and (not info.get("cpu_model") or not info.get("gpus")):
        ps = ("$o=Get-CimInstance Win32_OperatingSystem|Select Caption,Version,BuildNumber;"
              "$c=Get-CimInstance Win32_Processor|Select Name,NumberOfLogicalProcessors,MaxClockSpeed;"
              "$m=(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory;"
              "$g=Get-CimInstance Win32_VideoController|Select Name,DriverVersion,AdapterRAM;"
              "@{os=$o;cpu=$c;ram=$m;gpu=@($g)}|ConvertTo-Json -Depth 3 -Compress")
        try:
            j = json.loads(_run_ps(ps, timeout=40) or "{}")
            c = j.get("cpu")
            c = c[0] if isinstance(c, list) else (c or {})
            o = j.get("os") or {}
            info.setdefault("windows_version", o.get("Caption"))
            info.setdefault("build_number", o.get("BuildNumber"))
            if not info.get("cpu_model"):
                info["cpu_model"] = c.get("Name")
                info["cpu_logical_cpus"] = c.get("NumberOfLogicalProcessors")
                info["cpu_max_mhz"] = c.get("MaxClockSpeed")
            if j.get("ram") and not info.get("ram_total_gb"):
                info["ram_total_gb"] = round(int(j["ram"]) / 1024 ** 3, 2)
            if not info.get("gpus"):
                info["gpus"] = [{"name": g.get("Name"), "driver": g.get("DriverVersion"),
                                 "ram_gb": round((g.get("AdapterRAM") or 0) / 1024 ** 3, 2)}
                                for g in (j.get("gpu") or [])]
        except Exception:
            pass
    pw = get_power_status()
    info["power_source"] = pw["ac"]
    info["battery_pct"] = pw["battery_pct"]
    info["battery_saver"] = pw["saver"]
    info["extras"] = get_windows_extras()
    info["ffmpeg_runtime"] = probe_ffmpeg_runtime() if runtime_probes else {}
    try:
        import cv2  # noqa: F401
        info["cv2"] = "installed"
    except Exception:
        info["cv2"] = "not installed"
    info["python_exe"] = sys.executable
    info["cpu_count"] = os.cpu_count()
    return info


def sample_foreground():
    """(process name, window title, covers_whole_screen) of whatever has focus."""
    if not sys.platform.startswith("win"):
        return "?", "", False
    try:
        from ctypes import wintypes
        u32, k32 = ctypes.windll.user32, ctypes.windll.kernel32
        u32.GetForegroundWindow.restype = wintypes.HWND
        hwnd = u32.GetForegroundWindow()
        if not hwnd:
            return "(none)", "", False
        buf = ctypes.create_unicode_buffer(256)
        u32.GetWindowTextW(hwnd, buf, 256)
        title = buf.value
        pid = wintypes.DWORD()
        u32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        name = "?"
        h = k32.OpenProcess(0x1000, False, pid.value)
        if h:
            try:
                n = wintypes.DWORD(520)
                pb = ctypes.create_unicode_buffer(520)
                if k32.QueryFullProcessImageNameW(h, 0, pb, ctypes.byref(n)):
                    name = os.path.basename(pb.value)
            finally:
                k32.CloseHandle(h)
        rc = wintypes.RECT()
        u32.GetWindowRect(hwnd, ctypes.byref(rc))
        sw, sh = u32.GetSystemMetrics(0), u32.GetSystemMetrics(1)
        full = (rc.right - rc.left) >= sw - 2 and (rc.bottom - rc.top) >= sh - 2
        return name, title, full
    except Exception:
        return "?", "", False


def parse_typeperf_series(text, pids):
    """typeperf CSV -> per-second lists: GPU engine load (whole system and ffmpeg's own)."""
    rows = [r for r in csv.reader(io.StringIO(text or "")) if r]
    hi = next((i for i, r in enumerate(rows) if len(r) > 1 and r[1].startswith("\\\\")), None)
    if hi is None:
        return None
    hdr = rows[hi]
    tags = tuple(f"pid_{p}_" for p in pids)
    cols = []
    for i, name in enumerate(hdr):
        if i == 0 or "\\GPU Engine(" not in name:
            continue
        m = re.search(r"engtype_([A-Za-z0-9]+)", name)
        if m:
            cols.append((i, m.group(1), any(t in name for t in tags)))
    data = [r for r in rows[hi + 1:] if len(r) == len(hdr)]
    engines = sorted({e for _, e, _ in cols})
    out = {"all": {e: [] for e in engines}, "ff": {e: [] for e in engines}}
    for r in data:
        a, f = dict.fromkeys(engines, 0.0), dict.fromkeys(engines, 0.0)
        for i, e, mine in cols:
            try:
                v = float(r[i])
            except ValueError:
                continue
            a[e] += v
            if mine:
                f[e] += v
        for e in engines:
            out["all"][e].append(min(100.0, a[e]))
            out["ff"][e].append(min(100.0, f[e]))
    return out


def parse_typeperf_single(text):
    """typeperf CSV with one counter -> list of floats."""
    vals = []
    for r in csv.reader(io.StringIO(text or "")):
        if len(r) >= 2 and not r[1].startswith("\\\\"):
            try:
                vals.append(float(r[1]))
            except ValueError:
                pass
    return vals


def fps_series(history, t0, t1, window=3.0):
    """[(seconds_since_t0, real_capture_fps)] from -progress snapshots (3 s rolling window)."""
    snaps = [h for h in history if t0 <= h.get("wall_time", 0) <= t1 + 1]
    out = []
    for i, cur in enumerate(snaps):
        prev = None
        for j in range(i - 1, -1, -1):
            if cur["wall_time"] - snaps[j]["wall_time"] >= window:
                prev = snaps[j]
                break
        if prev is None:
            continue
        r = capture_rate(prev, cur)
        if r is not None:
            out.append((cur["wall_time"] - t0, r))
    return out


class DiagSampler:
    """Samples the machine once a second while the stream (or a local test) runs."""

    def __init__(self, get_proc, seconds, stop_evt, get_history, log=None):
        self.get_proc, self.seconds, self.stop_evt = get_proc, seconds, stop_evt
        self.get_history, self.log = get_history, log or (lambda m: None)
        self.rows, self.t0_mono, self.t1_mono = [], 0.0, 0.0
        self.exit_code, self.pids, self.gpu, self.freq = None, set(), None, []
        self.ffmpeg_died_at = None

    def run(self):
        p = self.get_proc()
        pid = p.pid if p else 0
        self.pids = process_tree_pids(pid) if pid else set()
        tp = {"gpu": "", "freq": ""}
        procs = []
        if sys.platform.startswith("win"):
            def start(key, counters):
                def go():
                    try:
                        r = subprocess.run(["typeperf"] + counters + ["-si", "1", "-sc", str(self.seconds)],
                                           capture_output=True, text=True, timeout=self.seconds + 40,
                                           creationflags=NOWIN)
                        tp[key] = r.stdout or ""
                    except Exception:
                        pass
                th = threading.Thread(target=go, daemon=True)
                th.start()
                procs.append(th)
            start("gpu", ["\\GPU Engine(*)\\Utilization Percentage"])
            start("freq", ["\\Processor Information(_Total)\\% Processor Performance"])
        sample_system_metrics()          # prime the CPU deltas
        sample_process_metrics(pid)
        self.t0_mono = time.monotonic()
        for n in range(self.seconds):
            if self.stop_evt.is_set():
                break
            if p and p.poll() is not None:
                self.exit_code = p.returncode
                self.ffmpeg_died_at = n
                break
            time.sleep(1.0)
            sysm, ffm = sample_system_metrics(), sample_process_metrics(pid)
            fg, title, full = sample_foreground()
            self.rows.append({"t": n + 1, "sys_cpu": sysm.get("cpu_percent"),
                              "ram_used": sysm.get("ram_used_mb"), "ram_free": sysm.get("ram_available_mb"),
                              "ff_cpu": ffm.get("cpu_percent"), "ff_rss": ffm.get("rss_mb"),
                              "fg": fg, "fg_title": title, "fg_full": full})
        self.t1_mono = time.monotonic()
        for th in procs:
            th.join(timeout=self.seconds + 45)
        self.gpu = parse_typeperf_series(tp["gpu"], self.pids)
        self.freq = parse_typeperf_single(tp["freq"])
        hist = self.get_history()
        fs = fps_series(hist, self.t0_mono, self.t1_mono)
        for r in self.rows:
            near = [v for (t, v) in fs if abs(t - r["t"]) <= 1.0]
            r["fps"] = (sum(near) / len(near)) if near else None
            i = r["t"] - 1
            r["freq"] = self.freq[i] if i < len(self.freq) else None
            if self.gpu:
                for key, eng in (("gpu3d", "3D"), ("venc", "VideoEncode"), ("vproc", "VideoProcessing")):
                    for scope in ("all", "ff"):
                        series = self.gpu[scope].get(eng, [])
                        r[f"{key}_{scope}"] = series[i] if i < len(series) else None
        self.fps_points = fs
        return self


def _nums(rows, key):
    return [r[key] for r in rows if isinstance(r.get(key), (int, float))]


def _avg(v):
    return sum(v) / len(v) if v else None


def _f(v, d=1, suffix=""):
    return "n/a" if v is None else f"{v:.{d}f}{suffix}"


def analyse(snap, s, tier, sampler, history_window, msgs, yt_before, yt_after, wgc_delta,
            offline_probe=None, sampled=True):
    """Turn the raw measurements into findings (level, text) + stats dict."""
    F = []   # (level, text)  level: FAIL / WARN / INFO / OK
    rows = sampler.rows
    st = {}
    target = float(s.get("fps") or 0)
    cap, enc = tier_paths(tier)
    n = len(rows)
    st["samples"] = n

    # --- did it even run?
    if sampled and n < 5:
        F.append(("FAIL", f"Only {n} sample(s) collected - the stream/test stopped almost immediately."
                          " See the ffmpeg messages at the bottom."))
    if sampled and sampler.exit_code is not None:
        F.append(("FAIL", f"ffmpeg EXITED during the report (code {sampler.exit_code}, after "
                          f"{sampler.ffmpeg_died_at}s). The stream would have dropped. "
                          "See ffmpeg messages below for why."))

    # --- was a game actually in front?
    fg_count = collections.Counter(r["fg"].lower() for r in rows)
    if sampled and n:
        top, topn = fg_count.most_common(1)[0]
        st["fg_top"] = (top, topn / n * 100)
        game_like = [k for k in fg_count if k not in NON_GAME_PROCS]
        gshare = sum(fg_count[k] for k in game_like) / n * 100
        st["game_share"] = gshare
        if gshare < 30:
            F.append(("WARN", "A game was NOT in the foreground for most of this report "
                              f"(top foreground app: {top}, {topn / n * 100:.0f}% of the time). "
                              "These numbers describe an idle desktop, NOT game streaming. Run it "
                              "again with the delay set to 15 s and Alt+Tab into the game."))
        else:
            F.append(("OK", f"A game-like app was in the foreground {gshare:.0f}% of the time "
                            f"({', '.join(sorted(game_like)[:3])}) - good, this report reflects real load."))
        full_share = sum(1 for r in rows if r["fg_full"] and r["fg"].lower() not in NON_GAME_PROCS) / n * 100
        st["fullscreen_share"] = full_share

    # --- real capture rate
    fps_vals = [v for _, v in sampler.fps_points]
    avg_fps, worst = _avg(fps_vals), (min(fps_vals) if fps_vals else None)
    st["avg_fps"], st["worst_fps"] = avg_fps, worst
    if fps_vals and target:
        low_share = sum(1 for v in fps_vals if v < target * 0.8) / len(fps_vals) * 100
        st["low_share"] = low_share
        if avg_fps < target * 0.8:
            F.append(("FAIL", f"Screen grabber only delivered {avg_fps:.1f} fps on average (target {target:.0f}). "
                              "YouTube will show a slideshow."))
        elif worst < target * 0.7:
            F.append(("WARN", f"Average capture fps OK ({avg_fps:.1f}) but the worst 3-second window was "
                              f"{worst:.1f} fps; {low_share:.0f}% of windows were below 80% of target (visible stutter)."))
        else:
            F.append(("OK", f"Capture fps steady: avg {avg_fps:.1f}, worst 3 s window {worst:.1f} (target {target:.0f})."))
        if cap.startswith("WGC") and avg_fps < target * 0.8:
            F.append(("INFO", "WGC only produces a frame when the screen CHANGES, so a quiet/static "
                              "scene makes it look like ~2 fps even when nothing is wrong. Known weakness "
                              "of this tier; prefer ddagrab."))
    elif sampled and n >= 5:
        F.append(("WARN", "No -progress snapshots in the window, so real capture fps could not be measured."))

    # --- ffmpeg progress counters over the window
    w = history_window
    if not sampled:
        pass
    elif len(w) >= 2:
        a, b = w[0], w[-1]
        dt = max(0.001, b["wall_time"] - a["wall_time"])

        def num(snap, k):
            try:
                return float(str(snap.get(k, "")).replace("x", "").strip())
            except ValueError:
                return None
        d = lambda k: (None if num(a, k) is None or num(b, k) is None else max(0.0, num(b, k) - num(a, k)))
        frames, dups, drops = d("frame"), d("dup_frames"), d("drop_frames")
        st.update(frames=frames, dups=dups, drops=drops, window_s=dt)
        if frames:
            st["dup_pct"] = (dups or 0) / frames * 100
            st["drop_pct"] = (drops or 0) / frames * 100
        sp = [num(x, "speed") for x in w if num(x, "speed") is not None]
        st["speed_avg"] = _avg(sp)
        st["speed_min"] = min(sp) if sp else None
        if num(a, "total_size") is not None and num(b, "total_size") is not None:
            st["out_kbps"] = (num(b, "total_size") - num(a, "total_size")) * 8 / dt / 1000
        if sp and st["speed_avg"] < 0.97:
            F.append(("FAIL", f"Encoder speed {st['speed_avg']:.2f}x (<1.0 = slower than real time). "
                              "Stream will buffer/lag. Use QuickSync, lower resolution/fps, or free CPU."))
        elif sp and st["speed_min"] < 0.9:
            F.append(("WARN", f"Encoder speed dipped to {st['speed_min']:.2f}x at times (average {st['speed_avg']:.2f}x)."))
        elif sp:
            F.append(("OK", f"Encoder keeps up with real time (avg {st['speed_avg']:.2f}x)."))
        if st.get("drop_pct", 0) > 2:
            F.append(("WARN", f"ffmpeg dropped {drops:.0f} frames ({st['drop_pct']:.1f}%) - the pipeline can't keep up."))
        if st.get("dup_pct", 0) > 15:
            F.append(("WARN", f"ffmpeg had to duplicate {dups:.0f} frames ({st['dup_pct']:.0f}%) to fill gaps "
                              "- the capture source delivered fewer frames than the target."))
        ok = st.get("out_kbps")
        if ok is not None and s.get("kbps") and ok < float(s["kbps"]) * 0.4:
            F.append(("INFO", f"Output bitrate {ok:.0f} kbps vs target {s['kbps']} kbps. This is NORMAL for "
                              "hardware encoders on quiet scenes; YouTube may warn 'bitrate low' - harmless."))
    else:
        F.append(("WARN", "Fewer than 2 ffmpeg progress snapshots in the window; pacing stats unavailable."))

    # --- CPU / RAM / throttling
    sysc, ffc = _nums(rows, "sys_cpu"), _nums(rows, "ff_cpu")
    st["sys_cpu_avg"], st["sys_cpu_max"] = _avg(sysc), (max(sysc) if sysc else None)
    st["ff_cpu_avg"], st["ff_cpu_max"] = _avg(ffc), (max(ffc) if ffc else None)
    if sysc:
        if st["sys_cpu_avg"] > 90:
            F.append(("FAIL", f"Whole-PC CPU averaged {st['sys_cpu_avg']:.0f}% - the game and the stream are "
                              "fighting for the CPU. Use QuickSync, lower the stream resolution, or cap the game fps."))
        elif st["sys_cpu_avg"] > 75:
            F.append(("WARN", f"Whole-PC CPU averaged {st['sys_cpu_avg']:.0f}% (peak {st['sys_cpu_max']:.0f}%) - little headroom."))
    if ffc and enc == "libx264" and st["ff_cpu_avg"] > 35:
        F.append(("WARN", f"x264 encoding uses {st['ff_cpu_avg']:.0f}% of the whole CPU. QuickSync would free "
                          "almost all of that for the game."))
    free = _nums(rows, "ram_free")
    if free and min(free) < 1500:
        F.append(("WARN", f"Free RAM fell to {min(free):.0f} MB - risk of paging/stutter."))
    fr = [v for v in _nums(rows, "freq")]
    if fr:
        st["freq_avg"], st["freq_min"] = _avg(fr), min(fr)
        if st["freq_avg"] < 60 and (st["sys_cpu_avg"] or 0) > 50:
            F.append(("WARN", f"CPU ran at only {st['freq_avg']:.0f}% of its rated speed while busy "
                              "(thermal or power throttling - common on thin laptops). Plug in power, set the "
                              "'Best performance' power mode, and clean/raise the laptop for airflow."))
    if snap.get("power_source") == "On battery":
        F.append(("WARN", "Laptop is running on BATTERY. Windows limits CPU/GPU speed on battery; plug in."))
    if "saver" in str(snap.get("power_plan", "")).lower():
        F.append(("WARN", f"Power plan looks like Power saver ({snap.get('power_plan')})."))
    if snap.get("battery_saver") == "ON":
        F.append(("WARN", "Windows Battery Saver is ON - it throttles background work including the stream."))

    # --- GPU
    if not sampled:
        pass
    elif sampler.gpu:
        g3 = _nums(rows, "gpu3d_all")
        ve = _nums(rows, "venc_ff")
        vp = _nums(rows, "vproc_ff")
        st["gpu3d_avg"], st["gpu3d_max"] = _avg(g3), (max(g3) if g3 else None)
        st["venc_ff_avg"], st["vproc_ff_avg"] = _avg(ve), _avg(vp)
        if g3 and st["gpu3d_avg"] > 90:
            F.append(("WARN", f"GPU 3D engine averaged {st['gpu3d_avg']:.0f}% (the game is maxing the iGPU). "
                              "Capture and QuickSync share this GPU, so expect fps loss in both. Lower in-game "
                              "graphics or cap the game to 30 fps."))
        if enc == "h264_qsv" and ve is not None and st["venc_ff_avg"] is not None and st["venc_ff_avg"] < 0.5 and n >= 8:
            F.append(("INFO", "No GPU VideoEncode load attributed to ffmpeg. Either QuickSync isn't really being "
                              "used or the counters couldn't match the ffmpeg process."))
    else:
        F.append(("INFO", "GPU engine counters unavailable (typeperf failed) - GPU load not measured."))

    # --- method-specific advice
    if cap.startswith("gdigrab"):
        F.append(("WARN", "gdigrab (GDI) usually captures a BLACK screen for fullscreen DirectX/Vulkan games. "
                          "Use ddagrab, and run the game in Borderless/Windowed-fullscreen."))
    if cap.startswith("ddagrab") and st.get("fullscreen_share", 0) > 50:
        F.append(("INFO", "The game window covers the whole screen. If the stream goes black, switch the game "
                          "to Borderless Windowed (exclusive fullscreen can defeat desktop duplication)."))
    ex = snap.get("extras", {})
    if ex.get("game_dvr_capture") == "ON":
        F.append(("INFO", "Xbox Game Bar background capture is enabled; it adds GPU load. Turn it off in "
                          "Settings > Gaming > Captures."))
    aud = str(s.get("audio") or "")
    if s.get("audio_mode") == DSHOW_MODE and re.search(r"(?i)voicemeeter|vb-audio|stereo mix|virtual|cable", aud):
        F.append(("INFO", f"Audio comes from a virtual device ({aud}). These can stop sending samples while "
                          "nothing is playing, which causes silence then a burst of audio. Make sure something "
                          "is routed to it, and check the ffmpeg messages for 'Past duration' / 'buffer' warnings."))
    if s.get("low"):
        F.append(("INFO", "'Low priority' is ON for ffmpeg: helps game fps but can make the stream drop frames."))
    rt = snap.get("ffmpeg_runtime", {})
    if "qsv_encode_works" in rt and not rt["qsv_encode_works"][0]:
        F.append(("WARN", "A 1-second QuickSync test encode FAILED on this PC: " + rt["qsv_encode_works"][1][-120:]))
    if "ddagrab_works" in rt and not rt["ddagrab_works"][0]:
        F.append(("WARN", "A ddagrab test capture FAILED on this PC: " + rt["ddagrab_works"][1][-120:]))

    # --- ffmpeg messages
    bad = [m for m in msgs if re.search(r"(?i)error|fail|invalid|cannot|can't|unable|broken pipe|"
                                        r"dropp|underflow|past duration|too large|timed out|reset by peer|"
                                        r"connection", m)]
    st["bad_msgs"] = bad
    if bad:
        F.append(("WARN", f"{len(bad)} suspicious ffmpeg message(s) - listed at the bottom."))

    # --- YouTube
    for label, y in (("start", yt_before), ("end", yt_after)):
        if not y:
            continue
        status, h = y
        issues = h.get("configurationIssues") or []
        hs = h.get("status", "?")
        if hs in ("bad", "noData", "revoked"):
            F.append(("FAIL", f"YouTube stream health at {label}: {hs}."))
        elif hs in ("ok", "good") and not issues:
            F.append(("OK", f"YouTube stream health at {label}: good."))
        else:
            F.append(("WARN", f"YouTube stream health at {label}: {hs}."))
        seen = set()
        for i in issues:
            if i.get("type") in seen:
                continue
            seen.add(i.get("type"))
            F.append(("WARN", f"  YouTube says: {i.get('type')} ({i.get('severity')}): "
                              f"{i.get('reason', '')} {i.get('description', '')}".strip()))
    if wgc_delta is not None:
        st["wgc_written"] = wgc_delta
    # Offline probe of the output file
    if offline_probe:
        st["probe"] = offline_probe
    return F, st


def verdict(F):
    lv = [l for l, _ in F]
    return "FAIL" if "FAIL" in lv else ("WARN" if "WARN" in lv else "PASS")


def render_report(kind, snap, s, tier, sampler, F, st, cmd, log_tail, msgs, notes=()):
    L = []
    A = L.append
    bar = "=" * 74
    sub = "-" * 74
    cap, enc = tier_paths(tier)
    v = verdict(F)
    A(bar)
    A(f"YT Stream Studio - Performance Report v{DIAG_VERSION}")
    A(bar)
    A(f"Generated : {snap.get('timestamp')}")
    A(f"Report    : {kind}")
    A(f"VERDICT   : {v}")
    A("(Paste this whole file to Claude - the stream key has been removed.)")
    A("")
    A(sub)
    A("1. SUMMARY / FINDINGS")
    A(sub)
    order = {"FAIL": 0, "WARN": 1, "INFO": 2, "OK": 3}
    for lvl, txt in sorted(F, key=lambda x: order[x[0]]):
        A(f"[{lvl:<4}] {txt}")
    for n in notes:
        A(f"[NOTE] {n}")
    A("")
    A(sub)
    A("2. WHAT WAS TESTED")
    A(sub)
    A(f"Capture method : {cap}")
    A(f"Encoder        : {enc}")
    A(f"Tier id        : {tier or 'n/a'}  ({TIER_NAMES.get(tier, 'n/a')})")
    A(f"Menu selection : {s.get('method')}")
    A(f"Capture target  : {snap.get('wgc_target', 'n/a')}")
    A(f"Settings       : {s.get('height') or 'Native'}p @ {s.get('fps')} fps, {s.get('kbps')} kbps, "
      f"audio={s.get('audio_mode')}, low-priority={s.get('low')}")
    A(f"Window         : {st.get('samples', 0)} s of sampling")
    A("")
    A("Exact ffmpeg command (key removed):")
    A("  " + (redact_secrets(subprocess.list2cmdline([str(c) for c in cmd])) if cmd else "n/a"))
    A("")
    A(sub)
    A("3. MEASURED RESULTS")
    A(sub)
    A(f"Real capture fps   : avg {_f(st.get('avg_fps'))}, worst 3s window {_f(st.get('worst_fps'))}, "
      f"target {s.get('fps')}")
    if st.get("window_s"):
        A(f"ffmpeg counters    : {st.get('frames') or 0:.0f} frames in {st['window_s']:.0f}s, "
          f"dup {st.get('dups') or 0:.0f} ({_f(st.get('dup_pct'))}%), drop {st.get('drops') or 0:.0f} ({_f(st.get('drop_pct'))}%)")
    A(f"Encoder speed      : avg {_f(st.get('speed_avg'), 2, 'x')}, min {_f(st.get('speed_min'), 2, 'x')}")
    A(f"Output bitrate     : {_f(st.get('out_kbps'), 0, ' kbps')} (target {s.get('kbps')})")
    A(f"Whole-PC CPU       : avg {_f(st.get('sys_cpu_avg'), 0, '%')}, max {_f(st.get('sys_cpu_max'), 0, '%')}")
    A(f"ffmpeg CPU (of PC) : avg {_f(st.get('ff_cpu_avg'), 0, '%')}, max {_f(st.get('ff_cpu_max'), 0, '%')}")
    A(f"CPU speed vs rated : avg {_f(st.get('freq_avg'), 0, '%')}, min {_f(st.get('freq_min'), 0, '%')}")
    A(f"GPU 3D engine      : avg {_f(st.get('gpu3d_avg'), 0, '%')}, max {_f(st.get('gpu3d_max'), 0, '%')} (whole system = the game)")
    A(f"ffmpeg GPU encode  : {_f(st.get('venc_ff_avg'), 0, '%')}   ffmpeg GPU video-proc: {_f(st.get('vproc_ff_avg'), 0, '%')}")
    if st.get("fg_top"):
        A(f"Foreground app     : mostly {st['fg_top'][0]} ({st['fg_top'][1]:.0f}%); "
          f"game-like share {_f(st.get('game_share'), 0, '%')}")
    if st.get("wgc_written") is not None:
        A(f"WGC producer       : wrote {st['wgc_written']} frames to ffmpeg in the window")
    pr = st.get("probe")
    if pr:
        A("")
        A("Recorded test file (ffprobe):")
        for k, val in pr.items():
            A(f"  {k}: {val}")
    A("")
    A(sub)
    A("4. PER-SECOND TIMELINE")
    A(sub)
    A("  t  | capFPS | sysCPU | ffCPU | cpuSpd | GPU3D | encFF | RAMfree | foreground")
    rows = sampler.rows
    step = 1 if len(rows) <= 120 else 2
    for r in rows[::step]:
        A(f"{r['t']:>4} | {_f(r.get('fps'), 1):>6} | {_f(r.get('sys_cpu'), 0):>6} | {_f(r.get('ff_cpu'), 0):>5} | "
          f"{_f(r.get('freq'), 0):>6} | {_f(r.get('gpu3d_all'), 0):>5} | {_f(r.get('venc_ff'), 0):>5} | "
          f"{_f(r.get('ram_free'), 0):>7} | {r.get('fg', '?')}{' [FULL]' if r.get('fg_full') else ''}")
    A("")
    A(sub)
    A("5. SYSTEM")
    A(sub)
    A(f"Windows    : {snap.get('windows_version')} (build {snap.get('build_number')})")
    A(f"CPU        : {snap.get('cpu_model')}  ({snap.get('cpu_logical_cpus')} threads, max {snap.get('cpu_max_mhz')} MHz)")
    A(f"RAM        : {snap.get('ram_total_gb')} GB")
    for i, g in enumerate(snap.get("gpus") or []):
        A(f"GPU {i}      : {g.get('name')}  driver {g.get('driver')}")
    ex = snap.get("extras", {})
    A(f"Display    : {ex.get('display_mode', str(snap.get('screen_width')) + 'x' + str(snap.get('screen_height')))}"
      f"  (DPI scale {ex.get('dpi_scale_pct', '?')}%)")
    A(f"Power      : {snap.get('power_source')} | battery {snap.get('battery_pct')} | saver {snap.get('battery_saver')}")
    A(f"Power plan : {snap.get('power_plan')}")
    A(f"HW GPU scheduling: {ex.get('hw_gpu_scheduling', '?')} | Game Mode: {ex.get('game_mode', '?')} | "
      f"Game DVR capture: {ex.get('game_dvr_capture', '?')}")
    A(f"ffmpeg     : {snap.get('ffmpeg_version')}")
    A(f"ffmpeg path: {snap.get('ffmpeg_path')}")
    A(f"  in build : ddagrab={snap.get('ddagrab_available')} gdigrab={snap.get('gdigrab_available')} "
      f"h264_qsv={snap.get('h264_qsv_available')} libx264={snap.get('libx264_available')}")
    rt = snap.get("ffmpeg_runtime", {})
    for k, label in (("qsv_encode_works", "QuickSync test encode"), ("ddagrab_works", "ddagrab test capture")):
        if k in rt:
            A(f"  runtime  : {label}: {'WORKS' if rt[k][0] else 'FAILED - ' + rt[k][1]}")
    A(f"WGC backend: {snap.get('wgc_backend')} | cv2: {snap.get('cv2')}")
    A(f"Python     : {snap.get('python_version')} at {snap.get('python_exe')}")
    A("")
    A(sub)
    A("6. ffmpeg MESSAGES (warnings/errors, key removed)")
    A(sub)
    if msgs:
        for m in list(msgs)[-60:]:
            A(redact_secrets(m)[:240])
    else:
        A("(none - ffmpeg printed no warnings or errors)")
    A("")
    A(sub)
    A("7. APP LOG (last lines, key removed)")
    A(sub)
    for m in list(log_tail)[-60:]:
        A(redact_secrets(m)[:240])
    A("")
    A("End of report.")
    return "\n".join(L) + "\n"


def save_report(text, prefix="YT_Stream_Report"):
    os.makedirs(REPORT_DIR, exist_ok=True)
    path = os.path.join(REPORT_DIR, f"{prefix}_{datetime.now().strftime('%Y-%m-%d_%H%M%S')}.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path

