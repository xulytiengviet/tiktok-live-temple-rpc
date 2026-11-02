@echo off
setlocal EnableExtensions
title DI CHUA ONLINE - TikTok LIVE Stable
cd /d "%~dp0"

echo ===========================================
echo      DI CHUA ONLINE - LIVE STABLE
echo ===========================================
where node >nul 2>&1
if errorlevel 1 goto NO_NODE
where npm >nul 2>&1
if errorlevel 1 goto NO_NODE
node -e "const m=Number(process.versions.node.split('.')[0]);if(m<22||!process.release.lts)process.exit(1)" >nul 2>&1
if errorlevel 1 goto BAD_VERSION
echo [OK] Node.js:
node --version

if not exist "node_modules\express\package.json" (
  echo [SETUP] Dang cai thu vien tu package-lock.json...
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto INSTALL_ERROR
)

rem App chi bind vao loopback; cho phep thao tac bang dieu khien local.
rem KHONG su dung LOCAL_DEV_UNSAFE=1 tren Render, VPS hay mang cong khai.
set "LOCAL_DEV_UNSAFE=1"
set "LIVE_MODE=1"
set "ENABLE_ZEROTTS=0"
set "PORT=3000"
set "HOST=127.0.0.1"

echo [STAGE] http://127.0.0.1:3000/?view=stage
echo [PANEL] http://127.0.0.1:3000/
echo [LIVE STUDIO] Link source http://127.0.0.1:3000/?view=stage
echo.
echo Giu cua so nay mo trong suot buoi LIVE.
echo Mo trang dieu khien trong trinh duyet...
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:3000/'"

:RUN
node server.js
if not errorlevel 1 goto DONE
echo [WARNING] Server gap su co. Thu khoi dong lai sau 5 giay.
timeout /t 5 /nobreak >nul
goto RUN

:BAD_VERSION
echo [ERROR] Can Node.js LTS 22+ (ban so chan) - https://nodejs.org/
goto DONE_ERROR
:NO_NODE
echo [ERROR] Chua cai Node.js LTS va npm. Cai tai https://nodejs.org/
goto DONE_ERROR
:INSTALL_ERROR
echo [ERROR] npm ci that bai. Kiem tra mang va package-lock.json.
goto DONE_ERROR
:DONE_ERROR
echo.
pause
exit /b 1
:DONE
echo Da dung chuong trinh LIVE.
pause
exit /b 0
