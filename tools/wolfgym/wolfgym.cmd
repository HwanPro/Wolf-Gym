@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0wolfgym.ps1" %*
exit /b %ERRORLEVEL%
