@echo off
setlocal
title Sasha Travel Stories
cd /d "%~dp0.."

set "PORT=8000"
set "PY="

py -3 --version >nul 2>&1 && set "PY=py -3"
if not defined PY python --version >nul 2>&1 && set "PY=python"
if not defined PY python3 --version >nul 2>&1 && set "PY=python3"

if not defined PY (
  echo.
  echo   Python is not installed, so the site can't start.
  echo   Install it from https://www.python.org/downloads/
  echo   and tick "Add python.exe to PATH" during setup.
  echo   Then double-click start.bat again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Sasha Travel Stories is running.
echo.
echo   Website:    http://localhost:%PORT%/
echo   Dashboard:  http://localhost:%PORT%/html/admin.html
echo.
echo   Keep this window open while you use the site. Close it to stop.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:%PORT%/'"

%PY% -m http.server %PORT% --bind 127.0.0.1

echo.
echo   The site has stopped. If the message above says the address is already
echo   in use, the site is probably running in another window already.
echo.
pause
