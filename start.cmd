@echo off
setlocal
title Moti - Local Server
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js and try again.
  pause
  popd
  exit /b 1
)
node scripts/launch-local.mjs %*
set "result=%errorlevel%"
if not "%result%"=="0" pause
popd
exit /b %result%
