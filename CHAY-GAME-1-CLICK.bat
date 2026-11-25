@echo off
setlocal EnableExtensions
title HACHIHI Counter-Strike - ONE CLICK
cd /d "%~dp0"

echo.
echo  ================================================
echo       HACHIHI COUNTER-STRIKE - ONE CLICK
echo  ================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto NONODE
where npm >nul 2>nul
if errorlevel 1 goto NONPM

for /f "tokens=1 delims=." %%A in ('node -p "process.versions.node" 2^>nul') do set "NODE_MAJOR=%%A"
if not defined NODE_MAJOR goto BADNODE
if %NODE_MAJOR% LSS 18 goto BADNODE

echo Node.js version OK: %NODE_MAJOR%
if not exist "%~dp0client\package.json" goto MISSING
cd /d "%~dp0client"

echo [1/3] Installing/checking game dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 goto INSTALLERR

if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo Electron install script was blocked or Electron is incomplete.
  echo Approving only Electron and esbuild install scripts...
  call npm install-scripts approve electron esbuild
  if errorlevel 1 goto APPROVEERR
  echo Rebuilding Electron and esbuild...
  call npm rebuild electron esbuild
  if errorlevel 1 goto REBUILDERR
)

if not exist "node_modules\electron\dist\electron.exe" goto ELECTRONERR

echo.
echo [2/3] Building game...
call npm run build
if errorlevel 1 goto BUILDERR

echo.
echo [3/3] Launching HACHIHI Counter-Strike...
call node_modules\.bin\electron.cmd .
set "GAME_EXIT=%ERRORLEVEL%"
echo.
echo Game closed. Exit code: %GAME_EXIT%
pause
exit /b %GAME_EXIT%

:NONODE
echo [ERROR] Node.js is not installed or not in PATH.
echo Install Node.js LTS 22 x64 from https://nodejs.org/ and reopen this BAT.
goto FAIL
:NONPM
echo [ERROR] npm was not found. Repair or reinstall Node.js.
goto FAIL
:BADNODE
echo [ERROR] Node.js version could not be read or is below 18.
goto FAIL
:MISSING
echo [ERROR] client\package.json was not found. Keep this BAT beside client and server folders.
goto FAIL
:INSTALLERR
echo [ERROR] npm install failed. Check Internet connection.
goto FAIL
:APPROVEERR
echo [ERROR] Cannot approve install scripts. Update npm or install Node.js LTS 22.
goto FAIL
:REBUILDERR
echo [ERROR] Electron/esbuild rebuild failed. Check Internet, proxy or antivirus.
goto FAIL
:ELECTRONERR
echo [ERROR] Electron still missing. Run sua-loi-electron.bat for detailed repair.
goto FAIL
:BUILDERR
echo [ERROR] Game build failed. Send the error text above to the developer.
goto FAIL
:FAIL
echo.
pause
exit /b 1
