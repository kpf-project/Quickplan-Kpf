@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install-piece-rate-task.ps1" -StartNow
if errorlevel 1 (
  echo Failed to install KPF Piece Rate Scale Agent.
  pause
  exit /b 1
)
echo KPF Piece Rate Scale Agent is installed on http://127.0.0.1:41953
pause
