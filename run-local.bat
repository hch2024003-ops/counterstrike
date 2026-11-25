@echo off
chcp 65001 >nul
title HACHIHI Counter-Strike - Chay local
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist "server\node_modules" goto server_ok
echo [1/2] Cai thu vien cho server...
pushd server
call npm install
popd
:server_ok
if exist "client\node_modules" goto client_ok
echo [2/2] Cai thu vien cho client, lan dau se tai Electron nen mat vai phut...
pushd client
call npm install
popd
:client_ok
pushd client
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
popd

echo Dang mo server va game...
start "HACHIHI Server" cmd /k "cd /d %~dp0server && npm start"
timeout /t 2 >nul
start "HACHIHI Client" cmd /k "cd /d %~dp0client && npm start"

echo.
echo Muon choi thu 2 nguoi tren cung may: bam dup run-second-client.bat
echo Neu game chop den roi tat: bam dup run-client-an-toan.bat
echo.
pause
exit /b 0
:nonode
echo Chua cai Node.js. Hay tai ban LTS tai https://nodejs.org roi chay lai file nay.
pause
exit /b 1
