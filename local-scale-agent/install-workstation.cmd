@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-workstation.ps1" -InstallNodeIfMissing -StartNow
set EXIT_CODE=%ERRORLEVEL%
echo.
if %EXIT_CODE% EQU 0 (
  echo KPF Local Scale Agent installation completed.
) else (
  echo KPF Local Scale Agent installation failed. Exit code: %EXIT_CODE%
)
echo.
pause
exit /b %EXIT_CODE%
