# YT Stream Studio — Windows one-folder build (PowerShell)
# Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File .\build_onedir.ps1
#
# Prefer a clean venv with only:
#   pip install -r requirements.txt pyinstaller
# and Python 3.10–3.12 (not 3.14).

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "============================================"
Write-Host " YT Stream Studio — Windows package build"
Write-Host "============================================"
Write-Host ""

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "python not found on PATH."
}

Write-Host "Using:"
python -c "import sys; print(sys.executable); print(sys.version)"
$ver = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ($ver -notmatch '^3\.(10|11|12)$') {
    Write-Host ""
    Write-Host "WARNING: Recommended Python is 3.10–3.12. You have $ver."
    Write-Host "Python 3.14 often fails with: Failed to load Python DLL ... python314.dll"
    Write-Host ""
}

Write-Host "[1/4] Ensuring PyInstaller is installed..."
python -m pip install --upgrade "pyinstaller>=6.0"

Write-Host ""
Write-Host "[2/4] Cleaning previous build..."
if (Test-Path build) { Remove-Item -Recurse -Force build }
if (Test-Path dist)  { Remove-Item -Recurse -Force dist }

Write-Host ""
Write-Host "[3/4] Building one-folder package (yt_stream_studio.spec)..."
python -m PyInstaller --noconfirm --clean yt_stream_studio.spec

Write-Host ""
Write-Host "[4/4] Done."
Write-Host ""
Write-Host "============================================================"
Write-Host " RUN THIS FILE ONLY:"
Write-Host "   dist\YT_Stream_Studio\YT_Stream_Studio.exe"
Write-Host ""
Write-Host " Do NOT run anything under build\  (intermediate files only)."
Write-Host ""
Write-Host " Place ffmpeg.exe + ffprobe.exe next to the .exe (or on PATH)."
Write-Host "============================================================"
