@echo off

chcp 65001 >nul
setlocal

rem One-click script: check env -> stop old process -> install/build client + common + server -> start.
rem Always based on the script directory (demo root), independent of current working dir.

set "ROOT=%~dp0"
set "PORT=3201"

echo [0/5] Checking environment...
call "%ROOT%ensure-env.bat" || call :abort "Environment check failed"

echo [1/5] Stopping process occupying port %PORT%...
set "FOUND="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    if not "%%P"=="" if not "%%P"=="0" (
        echo     Found listening process PID=%%P, terminating...
        taskkill /F /PID %%P >nul 2>&1
        set "FOUND=1"
    )
)
if not defined FOUND (
    echo     Port %PORT% is free, nothing to do.
)

echo [2/5] Installing shared layer (common)...
cd /d "%ROOT%common"
call npm install || call :abort "Shared layer dependency install failed"

echo [3/5] Building frontend (client)...
cd /d "%ROOT%client"
call npm install || call :abort "Frontend dependency install failed"
call npm run build || call :abort "Frontend build failed"

echo [4/5] Installing backend (server)...
cd /d "%ROOT%server"
call npm install || call :abort "Backend dependency install failed"

echo [5/5] Starting backend, open http://localhost:%PORT% in your browser
cd /d "%ROOT%server"
call npm start

cd /d "%ROOT%"
endlocal
exit /b 0

rem ============================ tool functions ============================
:abort
echo [ERROR] %~1, aborted.
cd /d "%ROOT%"
pause
(goto) 2>nul
