@echo off
chcp 65001 >nul
title HACHIHI - Trien khai thu vien do hoa cho ca may
rem Cach dung: trien-khai-thu-vien-do-hoa.bat "D:\NguonThuVien"
rem Thu muc nguon phai co manifest.json (tao bang: node client\tools\pack-assets.js).
rem Chep vao %ProgramData%\HACHIHI\assets de MOI tai khoan tren may dung chung, khong mat khi may khoi phuc o nao khong bi dong bang.
if "%~1"=="" (
  echo Thieu thu muc nguon. Vi du: %~nx0 "D:\NguonThuVien"
  pause
  exit /b 1
)
if not exist "%~1\manifest.json" (
  echo Khong thay manifest.json trong "%~1"
  pause
  exit /b 1
)
set DEST=%ProgramData%\HACHIHI\assets
robocopy "%~1" "%DEST%" /E /R:1 /W:1 /NFL /NDL
if %errorlevel% GEQ 8 (
  echo LOI khi chep. Hay chay bang "Run as administrator".
  pause
  exit /b 1
)
echo Da chep vao %DEST%. Mo game, vao "Thu vien do hoa" va bam "Xac minh" de kiem tra SHA-256.
pause
