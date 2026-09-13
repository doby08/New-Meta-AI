@echo off
title AI Assistance Interview System
cd /d "%~dp0"
echo ===============================================
echo  AI ASSISTANCE INTERVIEW SYSTEM - STARTER
echo ===============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Hindi nakita ang Node.js!
  echo.
  echo Gawin ito:
  echo 1. Pumunta sa https://nodejs.org
  echo 2. I-download ang LTS version ^(kulay green na button^)
  echo 3. I-install, pagkatapos isara at buksan ulit ang terminal
  echo 4. I-double click ulit itong file na ito
  echo.
  pause
  exit /b 1
)

echo Node version:
call node -v
echo NPM version:
call npm -v
echo.

if not exist "node_modules" (
  echo Wala pang node_modules. Nag-i-install... ^(isang beses lang ito^)
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] Nag-fail ang npm install. Subukan ang AYUSIN.bat
    pause
    exit /b 1
  )
  echo.
  echo Tapos na ang install!
  echo.
)

echo Bubuksan ang system sa Chrome...
start "" "http://localhost:3000"
echo.
echo Pinapaandar ang server. HUWAG isara ang window na ito.
echo Kapag nakita mo ang "running: http://localhost:3000", pumunta sa Chrome.
echo Para huminto: pindutin CTRL + C
echo.
call npm start
pause
