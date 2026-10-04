@echo off
title Absurd Bureau - server + public link
cd /d "%~dp0"

echo [1/2] Starting server on http://localhost:3000 ...
start "absurd-buro-server" /min cmd /c "node src\app.js"
timeout /t 3 /nobreak >nul

echo [2/2] Opening public link. Keep this window OPEN.
echo      Closing it kills the public link.
echo.
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -R 80:localhost:3000 nokey@localhost.run

echo.
echo Tunnel closed. The public link is dead now.
pause