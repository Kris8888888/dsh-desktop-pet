@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install-windows.ps1" %*
pause
