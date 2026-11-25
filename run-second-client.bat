@echo off
chcp 65001 >nul
title HACHIHI - Client thu 2
cd /d "%~dp0client"
where node >nul 2>nul
if errorlevel 1 goto nonode
if not exist "node_modules" call npm install
if exist "node_modules\electron\path.txt" goto electron_ok
echo.
echo Electron chua duoc cai dung. Dang tu sua, can ket noi Internet, mat vai phut...
call "%~dp0sua-loi-electron.bat" nopause
if errorlevel 1 goto electron_fail
goto electron_ok
:electron_fail
echo.
echo Khong sua duoc Electron. Chup man hinh nay gui lai, hoac cai Node.js ban LTS 22 roi chay lai.
pause
exit /b 1
:electron_ok
call npm run build
if errorlevel 1 goto builderr
call npx electron .
set "LOGF=%~dp0client\hachihi-client.log"
echo.
echo === Game da dong. ===
if not exist "%LOGF%" goto nolog
echo Nhat ky loi, gui file nay neu game bi loi: %LOGF%
echo ---------------- 15 dong cuoi ----------------
powershell -NoProfile -Command "Get-Content -Tail 15 -LiteralPath $env:LOGF"
:nolog
pause
exit /b 0
:nonode
echo Chua cai Node.js. Tai ban LTS tai https://nodejs.org roi chay lai.
pause
exit /b 1
:builderr
echo LOI khi build. Chup man hinh nay gui lai.
pause
exit /b 1
