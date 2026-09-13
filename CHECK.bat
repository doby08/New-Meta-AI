@echo off
title Check System
cd /d "%~dp0"
echo ===============================================
echo  SYSTEM CHECK - pakisend ang resulta
echo ===============================================
echo.
echo Folder: %CD%
echo.
echo --- package.json? ---
if exist "package.json" (echo YES - nakita) else (echo NO - WALA! Maling folder!)
echo --- server.js? ---
if exist "server.js" (echo YES - nakita) else (echo NO - WALA! Maling folder!)
echo --- node_modules? ---
if exist "node_modules" (echo YES - na-install na) else (echo NO - kailangan mag npm install)
echo.
echo --- Node.js ---
where node
call node -v 2>&1
echo.
echo --- NPM ---
where npm
call npm -v 2>&1
echo.
echo --- Port 3000 ---
call node -e "require('net').createServer().once('error',e=>console.log('GINAGAMIT NA ang port 3000')).once('listening',function(){console.log('BAKANTE ang port 3000');this.close()}).listen(3000)" 2>&1
echo.
echo ===============================================
echo Tapos. Paki-screenshot ito at isend.
echo ===============================================
pause
