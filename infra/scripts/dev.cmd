@echo off
setlocal
set "service=%~1"
if "%service%"=="" set "service=web"
if /I not "%service%"=="web" if /I not "%service%"=="api" (
  echo Usage: infra\scripts\dev.cmd [web^|api]
  exit /b 2
)
powershell.exe -NoLogo -NoProfile -File "%~dp0dev.ps1" -Service "%service%"
exit /b %ERRORLEVEL%
