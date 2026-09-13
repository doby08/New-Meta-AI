@echo off
title Ayusin ang AI Interview System
cd /d "%~dp0"
echo ===============================================
echo  AYUSIN - Automatic Fix
echo ===============================================
echo.

echo [1/5] Tine-check kung nasa tamang folder...
if not exist "package.json" (
  echo [ERROR] Wala ang package.json dito!
  echo Dapat i-double click ang file na ito SA LOOB ng "METa AI" folder.
  echo Ikaw ay nasa: %CD%
  pause
  exit /b 1
)
echo OK - nasa tamang folder: %CD%
echo.

echo [2/5] Tine-check ang Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Walang Node.js. I-install muna mula https://nodejs.org ^(LTS^)
  pause
  exit /b 1
)
call node -v
call npm -v
echo.

echo [3/5] Tine-check ang Node version ^(kailangan 18 pataas^)...
call node -e "const v=process.version; console.log('Version: '+v); const m=parseInt(v.slice(1)); if(m<18){console.log('[ERROR] Luma ang Node.js! I-update sa https://nodejs.org'); process.exit(1)} else {console.log('OK - pwede na')}"
if errorlevel 1 (
  pause
  exit /b 1
)
echo.

echo [4/5] Burahin ang sirang install at i-install ulit...
if exist "node_modules" (
  echo Binubura ang lumang node_modules...
  rmdir /s /q "node_modules"
)
if exist "package-lock.json" (
  echo Binubura ang lumang package-lock...
  del /q "package-lock.json"
)
echo Nag-i-install... ^(maghintay 1-3 minuto^)
call npm cache clean --force
call npm install
if errorlevel 1 (
  echo.
  echo [ERROR] Nag-fail pa rin. Subukan:
  echo   npm install --no-audit --no-fund
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERROR] Hindi talaga ma-install. Paki-screenshot ang error at isend.
    pause
    exit /b 1
  )
)
echo.
echo OK - na-install na!
echo.

echo [5/5] Tine-check ang port 3000...
call node -e "require('net').createServer().once('error',e=>{console.log('BABALA: May gumagamit na ng port 3000. Isara muna ang lumang server o i-restart ang PC.')}).once('listening',function(){console.log('OK - bakante ang port 3000');this.close()}).listen(3000)"
echo.
echo ===============================================
echo  TAPOS! I-double click na ang SIMULAN-DITO.bat
echo ===============================================
pause
