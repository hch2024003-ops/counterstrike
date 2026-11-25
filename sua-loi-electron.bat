@echo off
chcp 65001 >nul
setlocal
title HACHIHI - Sua loi Electron
cd /d "%~dp0client"
where node >nul 2>nul
if errorlevel 1 goto nonode
if not exist package.json goto missing

echo [1/3] Cai dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed

echo.
echo [2/3] Cho phep script cai dat rieng cho Electron va esbuild...
call npm install-scripts approve electron esbuild
if errorlevel 1 goto approvefail

echo.
echo [3/3] Tai va tao lai Electron/esbuild...
call npm rebuild electron esbuild
if errorlevel 1 goto failed

if not exist "node_modules\electron\dist\electron.exe" goto missingelectron
echo.
echo DA SUA XONG: Electron da san sang.
if /i not "%1"=="nopause" pause
exit /b 0

:nonode
echo Chua cai Node.js. Hay cai Node.js LTS 22 x64: https://nodejs.org
goto endfail
:missing
echo Khong tim thay client\package.json. Hay giai nen day du bo game.
goto endfail
:approvefail
echo npm khong ho tro lenh install-scripts hoac khong the cap quyen.
echo Hay cai Node.js LTS 22 x64 moi nhat tu https://nodejs.org roi thu lai.
goto endfail
:failed
echo Cai dat that bai. Kiem tra Internet, proxy va phan mem antivirus.
goto endfail
:missingelectron
echo Electron van chua co electron.exe sau khi rebuild.
echo Hay cai Node.js LTS 22 x64 va thu lai; neu van loi gui log cho nha phat trien.
:endfail
if /i not "%1"=="nopause" pause
exit /b 1
