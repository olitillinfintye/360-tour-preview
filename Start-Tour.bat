@echo off
cd /d "%~dp0"
set PORT=8765
where python >nul 2>nul && (set PY=python) || (where py >nul 2>nul && (set PY=py) || (echo Python is not installed. Get it from https://www.python.org/downloads/ & pause & exit /b 1))
echo Starting 360 tours on http://localhost:%PORT%/home.html
echo Close this window to stop the server.
start "" http://localhost:%PORT%/home.html
%PY% serve.py %PORT%
if errorlevel 1 (echo. & echo Server stopped. If the port is busy, the app may already be running: open http://localhost:%PORT%/home.html & pause)
