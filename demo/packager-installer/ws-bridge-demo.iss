; Inno Setup 脚本：把 build-release.mjs 组装好的 staging 目录（app/）打成单个 setup.exe。
; 由打包脚本经 ISCC 命令行传入定义：
;   /DAppSrc=<staging 目录>  /DAppVer=<版本>  /O<输出目录>  /F<输出文件名>
; 直接双击本脚本用 Inno Setup 编译时，下方默认值可让其独立跑通（默认取 dist-release\app）。

#ifndef AppSrc
  #define AppSrc "..\dist-release\app"
#endif
#ifndef AppVer
  #define AppVer "1.0.0"
#endif

#define AppName "WS Bridge Demo"
#define AppPublisher "ddts-ws-bridge"
#define LauncherBat "ws-bridge-demo.bat"

[Setup]
AppName={#AppName}
AppVersion={#AppVer}
AppPublisher={#AppPublisher}
; 默认装到用户目录，免管理员权限（无需写 Program Files）。
DefaultDirName={localappdata}\WsBridgeDemo
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputBaseFilename=ws-bridge-demo-setup
Compression=lzma2/max
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
UninstallDisplayName={#AppName}

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#AppSrc}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#LauncherBat}"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#LauncherBat}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#LauncherBat}"; Description: "{cm:LaunchProgram,{#AppName}}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent shellexec

; 卸载只删安装时写入的文件。运行时生成的用户数据（data\ 下的 runtime.json 等）
; 不在 [Files] 里，故卸载保留；这些非空目录也不会被清空。
