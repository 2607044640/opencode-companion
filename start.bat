@echo off
title OpenCode Companion Web App
cd /d "%~dp0"

echo ========================================================
echo   Starting OpenCode Web Companion...
echo   Backend: http://127.0.0.1:5001 (WSL2 OpenCode Daemon)
echo   Frontend: http://127.0.0.1:5173/
echo ========================================================

:: Open standalone Edge window after 1.5 seconds in background
start "" /b powershell -Command "Start-Sleep -Seconds 2; Start-Process msedge.exe -ArgumentList '--app=http://127.0.0.1:5173/'"

:: Run Vite dev server
pnpm dev --host 127.0.0.1 --port 5173
