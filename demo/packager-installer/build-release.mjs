// demo 打包脚本：把 client(前端构建产物) + server(编译后的 JS) + common(共享层) + 生产依赖
// 组装成自包含发行目录（dist-release/app），再用 Inno Setup 打成单个 setup.exe。
//
// 关键约定：
//   - demo 开发态用 ts-node 直跑 TS；发行态改为 tsc 预编译成 JS（tsconfig.release.json），
//     产物为 CommonJS，node 直跑，无需 ts-node / 软链接 / --preserve-symlinks。
//   - demo 不内置 node.exe：发行版启动器 ws-bridge-demo.bat 使用「系统已安装的 Node」运行。
//   - 端口由启动器动态挑选后经 PORT 环境变量传给 index.js（index.ts 已支持）。
//
// staging（app/）布局须与运行时路径推导一致：
//   app/server/src/index.js               ← 入口（node 直跑）
//   app/server/src/lib/directoryManager.js← 上溯 3 层 = app/（repoRoot）
//   app/common/ws_bridge/wsServerPeer.js  ← require('ws') 时向上找 app/node_modules/ws
//   app/client/dist/index.html            ← 静态托管根
//   app/node_modules/ws                   ← 仅生产依赖
//   app/data/                             ← 运行时数据（runtime.json 等）
//   app/ws-bridge-demo.bat                ← 启动器（快捷方式指向它）
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(scriptDir, "..");

const commonDir = path.join(demoRoot, "common");
const serverDir = path.join(demoRoot, "server");
const clientDir = path.join(demoRoot, "client");
const clientDistDir = path.join(clientDir, "dist");

const serverPackageJson = path.join(serverDir, "package.json");
const serverLockFile = path.join(serverDir, "package-lock.json");

// 发行编译产物（临时中间目录）：tsc 按 rootDir=demo 输出 server/ 与 common/ 两个子树。
const releaseTsconfig = path.join(scriptDir, "tsconfig.release.json");
const releaseDir = path.join(demoRoot, "dist-release");
const buildDir = path.join(releaseDir, ".build");
const buildServerEntry = path.join(buildDir, "server", "src", "index.js");

const stagingDir = path.join(releaseDir, "app");
const depsTmpDir = path.join(releaseDir, ".deps-tmp");

// 启动器模板与 Inno Setup 脚本随本脚本入库在 packager-installer/（可手改）。
const launcherName = "ws-bridge-demo.bat";
const launcherTemplate = path.join(scriptDir, launcherName);
const issScript = path.join(scriptDir, "ws-bridge-demo.iss");
const setupName = "ws-bridge-demo-setup";

function log(message) {
  console.log(`[package] ${message}`);
}

function fail(message) {
  console.error(`[package][ERROR] ${message}`);
  process.exit(1);
}

function run(command, args, cwd, options = {}) {
  const { shell = true, env } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell,
      env: env ? { ...process.env, ...env } : process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

// 大目录复制时每 3s 打印一次耗时，给出进度感（node_modules 可能较大）。
async function copyWithHeartbeat(src, dst, label) {
  const started = Date.now();
  const timer = setInterval(() => {
    const seconds = Math.round((Date.now() - started) / 1000);
    log(`  ... still copying ${label} (${seconds}s)`);
  }, 3000);
  timer.unref();
  try {
    await cp(src, dst, { recursive: true });
  } finally {
    clearInterval(timer);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  log(`  copied ${label} in ${seconds}s`);
}

// [1/6] 安装/构建工作区：common、server 装依赖，client 装依赖并构建到 client/dist。
// 与 demo/start.bat 的步骤一致，保证一条命令即可打包（无需先手动 build）。
async function buildWorkspace() {
  log("[1/6] Installing deps and building workspace (common / server / client)...");
  await run("npm", ["install"], commonDir);
  await run("npm", ["install"], serverDir);
  await run("npm", ["install"], clientDir);
  await run("npm", ["run", "build"], clientDir);
  if (!existsSync(path.join(clientDistDir, "index.html"))) {
    fail(`client build output missing: ${path.join(clientDistDir, "index.html")}`);
  }
}

async function cleanArtifacts() {
  log("[2/6] Cleaning previous artifacts...");
  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });
}

// [3/6] 编译服务端到 JS：tsc --project tsconfig.release.json（rootDir=demo，产物含 server/ 与 common/）。
// cwd 设为 serverDir，与开发态一致，确保 'ws' 等类型从 server/node_modules 解析。
async function compileServer() {
  log("[3/6] Compiling server for release (tsc --project tsconfig.release.json)...");
  await run("npx", ["tsc", "--project", releaseTsconfig], serverDir);
  if (!existsSync(buildServerEntry)) {
    fail(`tsc output missing: ${buildServerEntry}`);
  }
}

// [4/6] 仅安装生产依赖（server 的 dependencies：ws）：把 package.json + lock 拷到临时目录后
// npm ci --omit=dev，得到不含 devDeps 的精简 node_modules（ws 的可选原生加速依赖缺失时由
// ws 自身 try/catch 兜底，运行不报错）。
async function installProductionDeps() {
  log("[4/6] Installing production-only dependencies (npm ci --omit=dev)...");
  await mkdir(depsTmpDir, { recursive: true });
  await cp(serverPackageJson, path.join(depsTmpDir, "package.json"));
  await cp(serverLockFile, path.join(depsTmpDir, "package-lock.json"));
  await run("npm", ["ci", "--omit=dev"], depsTmpDir);
  const depsNodeModules = path.join(depsTmpDir, "node_modules");
  if (!existsSync(depsNodeModules)) {
    fail(`production node_modules missing: ${depsNodeModules}`);
  }
}

// [5/6] 组装 staging：编译产物 server/ 与 common/ 直接落到 app 根，与 ../../../common 相对引用对齐。
async function assembleStaging() {
  log("[5/6] Assembling staging release directory...");
  await copyWithHeartbeat(path.join(buildDir, "server"), path.join(stagingDir, "server"), "server (js)");
  await copyWithHeartbeat(path.join(buildDir, "common"), path.join(stagingDir, "common"), "common (js)");
  await copyWithHeartbeat(clientDistDir, path.join(stagingDir, "client", "dist"), "client/dist");
  await copyWithHeartbeat(
    path.join(depsTmpDir, "node_modules"),
    path.join(stagingDir, "node_modules"),
    "node_modules (prod)",
  );
  // 运行时按需写入的数据目录（runtime.json 等）；发行时留空。
  await mkdir(path.join(stagingDir, "data"), { recursive: true });
  await copyLauncher();
  await rm(depsTmpDir, { recursive: true, force: true });
  await rm(buildDir, { recursive: true, force: true });
}

// 启动器：静态自包含，从模板直接复制到 staging 根（%~dp0 运行时锚定安装目录）。
async function copyLauncher() {
  if (!existsSync(launcherTemplate)) {
    fail(`launcher template missing: ${launcherTemplate}`);
  }
  await cp(launcherTemplate, path.join(stagingDir, launcherName));
}

// 稳健定位 ISCC：先查 PATH，再查常见安装路径；找不到返回 null。
async function locateIscc() {
  const fromPath = await which("iscc");
  if (fromPath) return fromPath;
  const localAppData = process.env.LOCALAPPDATA ?? "";
  const candidates = [
    "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
    "C:\\Program Files\\Inno Setup 6\\ISCC.exe",
    "C:\\Program Files (x86)\\Inno Setup 5\\ISCC.exe",
    "C:\\Program Files\\Inno Setup 5\\ISCC.exe",
    ...(localAppData ? [path.join(localAppData, "Programs", "Inno Setup 6", "ISCC.exe")] : []),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function which(cmd) {
  return new Promise((resolve) => {
    const child = spawn("where", [cmd], { shell: false });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => {
      if (code !== 0) return resolve(null);
      const first = out.split(/\r?\n/).find((line) => line.trim().length > 0);
      resolve(first ? first.trim() : null);
    });
  });
}

async function buildInstaller() {
  log("[6/6] Building Inno Setup installer (setup.exe)...");
  const iscc = await locateIscc();
  if (!iscc) {
    log("");
    log("未定位到 Inno Setup（ISCC.exe）。已组装好的发行目录保留在：");
    log(`  ${stagingDir}`);
    log("请通过 demo\\package.bat 运行打包（会尝试自动安装 Inno Setup），");
    log("或先手动安装 Inno Setup 后重跑，或用 Inno Setup 打开脚本编译：");
    log(`  ${issScript}`);
    log("安装方式：winget install --id JRSoftware.InnoSetup -e  或  https://jrsoftware.org/isdl.php");
    fail("Inno Setup 不可用，无法生成 setup.exe（staging 已保留供手动打包）");
  }
  const version = await readServerVersion();
  await run(
    iscc,
    [
      `/DAppSrc=${stagingDir}`,
      `/DAppVer=${version}`,
      `/O${releaseDir}`,
      `/F${setupName}`,
      issScript,
    ],
    scriptDir,
    { shell: false },
  );
  const setupExe = path.join(releaseDir, `${setupName}.exe`);
  if (!existsSync(setupExe)) {
    fail(`installer output missing: ${setupExe}`);
  }
  return setupExe;
}

async function readServerVersion() {
  const raw = await readFile(serverPackageJson, "utf8");
  const parsed = JSON.parse(raw);
  return typeof parsed.version === "string" ? parsed.version : "0.0.0";
}

// setup.exe 已产出：staging（app/）仅为 Inno Setup 编译的中间输入，删除释放磁盘。
// 清理失败（如文件被占用）不影响已成功的产物，故吞掉异常仅告警。
async function cleanupStaging() {
  log("  cleaning up staging (setup.exe already built)...");
  try {
    await rm(stagingDir, { recursive: true, force: true });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[package][WARN] 清理 staging 失败（可手动删除 ${stagingDir}）：${reason}`);
  }
}

async function main() {
  const started = Date.now();
  await buildWorkspace();
  await cleanArtifacts();
  await compileServer();
  await installProductionDeps();
  await assembleStaging();
  const setupExe = await buildInstaller();
  await cleanupStaging();
  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  log(`Done in ${minutes} min. Installer: ${setupExe}`);
}

main().catch((err) => {
  const reason = err instanceof Error ? err.stack || err.message : String(err);
  fail(reason);
});
