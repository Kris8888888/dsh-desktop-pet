@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\uninstall-windows.ps1" %*
pause
