@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo  YT Stream Studio — Windows package build
echo ============================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo ERROR: python not found on PATH.
  exit /b 1
)

echo Using:
python -c "import sys; print(sys.executable); print(sys.version)"
echo.
python -c "import sys; v=sys.version_info; raise SystemExit(0 if v.major==3 and 10<=v.minor<=12 else 1)"
if errorlevel 1 (
  echo.
  echo WARNING: Recommended Python is 3.10, 3.11, or 3.12.
  echo Python 3.14 often fails to package ^(python3xx.dll LoadLibrary errors^).
  echo Create a 3.12 venv if this build crashes on launch.
  echo.
)

echo [1/4] Ensuring PyInstaller is installed...
python -m pip install --upgrade "pyinstaller>=6.0"
if errorlevel 1 (
  echo ERROR: pip / PyInstaller install failed.
  exit /b 1
)

echo.
echo [2/4] Cleaning previous build...
if exist build rd /s /q build
if exist dist rd /s /q dist

echo.
echo [3/4] Building one-folder package (yt_stream_studio.spec)...
python -m PyInstaller --noconfirm --clean yt_stream_studio.spec
if errorlevel 1 (
  echo.
  echo BUILD FAILED.
  exit /b 1
)

echo.
echo [4/4] Done.
echo.
echo ============================================================
echo  RUN THIS FILE ONLY:
echo    dist\YT_Stream_Studio\YT_Stream_Studio.exe
echo.
echo  Do NOT run anything under build\  ^(that folder is intermediate^).
echo.
echo  Place next to the .exe ^(or on PATH^):
echo    ffmpeg.exe
echo    ffprobe.exe
echo ============================================================
echo.
endlocal
