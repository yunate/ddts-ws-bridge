@echo off
chcp 65001 >nul
setlocal

rem 一键打包：确保 Node 与 Inno Setup 可用 -> 运行 build-release.mjs 生成 setup.exe。
rem 始终基于脚本所在目录（demo 根），与当前工作目录无关。

set "ROOT=%~dp0"

echo [0/2] Checking environment...

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未检测到 Node.js，请先安装 ^(https://nodejs.org/^) 后重试。
    pause
    exit /b 1
)

rem 确保 Inno Setup（ISCC）：PATH 未找到则尝试 winget 安装（build-release 仍会自行定位常见安装路径）。
where iscc >nul 2>&1
if errorlevel 1 (
    if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" goto :have_iscc
    if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" goto :have_iscc
    echo     未检测到 Inno Setup，尝试用 winget 安装...
    where winget >nul 2>&1
    if errorlevel 1 (
        echo [NOTICE] 未找到 winget，请手动安装 Inno Setup: https://jrsoftware.org/isdl.php
    ) else (
        winget install --id JRSoftware.InnoSetup -e --accept-source-agreements --accept-package-agreements
    )
)
:have_iscc

echo [1/2] Running packaging script...
node "%ROOT%packager-installer\build-release.mjs" %*
set "EC=%ERRORLEVEL%"

echo [2/2] Done (exit code %EC%).
if not "%EC%"=="0" pause
endlocal & exit /b %EC%
