@echo off
chcp 65001 >nul
setlocal

rem 发行版启动器（安装后快捷方式指向本文件）：静态自包含，%~dp0 运行时锚定安装目录。
rem 发行包不内置 node.exe，运行时使用「系统已安装的 Node.js」。
rem 端口动态挑选后经 PORT 环境变量传给 server\src\index.js（index.ts 已支持）。

set "APP_DIR=%~dp0"
set "ENDPOINT=%APP_DIR%data\runtime.json"

rem 检查系统 Node。
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] 未检测到 Node.js。请先安装 Node.js ^(https://nodejs.org/^) 后再运行本程序。
  pause
  endlocal
  exit /b 1
)

rem 已有实例在运行（端点文件存在且其端口在监听）→ 直接开浏览器、不启动第二个实例。
rem 文件可能陈旧（进程已崩溃/被强杀），故必须探测端口确认存活，不能只看文件是否存在。
set "RUNNING_PORT="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "if(Test-Path $env:ENDPOINT){try{$p=(ConvertFrom-Json (Get-Content $env:ENDPOINT -Raw)).port;if($p -and (Test-NetConnection -ComputerName localhost -Port $p -InformationLevel Quiet -WarningAction SilentlyContinue)){Write-Output $p}}catch{}}"`) do set "RUNNING_PORT=%%P"

if defined RUNNING_PORT (
  echo 检测到已在运行的实例（端口 %RUNNING_PORT%），直接打开浏览器。
  start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Process ('http://localhost:' + $env:RUNNING_PORT + '/')"
  endlocal
  exit /b 0
)

rem 未运行 → 从 3201 起向上挑第一个可用端口（尝试绑定 loopback:port，成功即释放并返回，上限 3300），
rem 供 node、浏览器、runtime.json 共用同一个值。
set "PORT="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "for($p=3201;$p -le 3300;$p++){try{$l=New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback,$p);$l.Start();$l.Stop();Write-Output $p;break}catch{}}"`) do set "PORT=%%P"

if not defined PORT (
  echo [ERROR] 未能在端口 3201-3300 范围内找到可用端口，请关闭占用这些端口的程序后重试。
  endlocal
  pause
  exit /b 1
)

echo 选定端口 %PORT%，正在启动服务...

rem 后台就绪辅助（瞬时 hidden PowerShell）：轮询端口就绪（上限 ~30s）→ 就绪后才写 data\runtime.json
rem （避免写下连不上的陈旧文件）→ 打开浏览器；超时不强开，避免服务起不来时误开空白页。
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "$port=[int]$env:PORT; $endpoint=$env:ENDPOINT; $deadline=(Get-Date).AddSeconds(30); $ready=$false; while((Get-Date) -lt $deadline){ if(Test-NetConnection -ComputerName localhost -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue){ $ready=$true; break }; Start-Sleep -Milliseconds 300 }; if($ready){ New-Item -ItemType Directory -Force -Path (Split-Path $endpoint) | Out-Null; (@{ port=$port; startedAt=(Get-Date).ToString('o') } | ConvertTo-Json -Compress) | Set-Content -Path $endpoint -Encoding UTF8; Start-Process ('http://localhost:' + $port + '/') }"

rem 前台可见控制台跑 node（用户能看日志、能关闭进程）；端口经 PORT 环境变量传给 index.js。
node "%APP_DIR%server\src\index.js"

rem node 退出（服务停止）后清理端点文件，避免留下陈旧的 runtime.json 误导下次启动。
if exist "%ENDPOINT%" del "%ENDPOINT%"

endlocal
