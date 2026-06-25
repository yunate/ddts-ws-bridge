@echo off

call :ensure_node || exit /b 1

exit /b 0


rem ============================ ensure functions ============================
:ensure_node
where npm >nul 2>&1
if errorlevel 1 (
    echo     npm not detected, attempting to install Node.js LTS via winget...
    where winget >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] winget not found, cannot install Node.js automatically.
        echo         Please install Node.js manually ^(https://nodejs.org/^) and re-run this script.
        pause
        exit /b 1
    )
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo [ERROR] Node.js install failed, please install manually and retry.
        pause
        exit /b 1
    )
    for /f "tokens=2,*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| findstr /I "Path"') do set "MPATH=%%B"
    for /f "tokens=2,*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul ^| findstr /I "Path"') do set "UPATH=%%B"
    set "PATH=%MPATH%;%UPATH%"
    where npm >nul 2>&1
    if errorlevel 1 (
        echo [NOTICE] Node.js is installed, but PATH was not loaded in this window.
        echo          Please close and re-run this script ^(or open a new command prompt^) and try again.
        pause
        exit /b 1
    )
    echo     Node.js install complete.
) else (
    echo     npm detected.
)
exit /b 0
