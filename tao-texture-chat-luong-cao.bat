@echo off
chcp 65001 >nul
title HACHIHI - Tao texture chat luong cao (tiem net / may manh)
cd /d "%~dp0client"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Tai ban LTS tai https://nodejs.org roi chay lai.
  pause
  exit /b 1
)
set OUT=%ProgramData%\HACHIHI\assets
set SIZE=2048
if not "%1"=="" set SIZE=%1
echo Tao texture %SIZE%px vao %OUT% (chay mot lan, mat khoang 1 phut). Dung 1024 neu card man hinh duoi 4GB: tao-texture-chat-luong-cao.bat 1024
node tools\gen-textures.js "%OUT%" --size %SIZE%
if errorlevel 1 (
  echo.
  echo LOI: khong ghi duoc vao %OUT%. Hay chay file nay bang "Run as administrator".
  pause
  exit /b 1
)
echo.
echo Xong. Khoi dong lai game de dung texture moi.
pause
