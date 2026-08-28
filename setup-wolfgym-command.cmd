@echo off
setlocal
title Instalar comando Wolf Gym
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\wolfgym\install-command.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo instalar el comando wolfgym.
  pause
  exit /b 1
)
exit /b 0
