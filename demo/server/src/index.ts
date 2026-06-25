/**
 * Demo 服务端入口：HTTP 静态服务 + WebSocket 桥共用同一端口（3201）。
 *
 * 架构（参考 F:\My\youtube_downloader，精简版）：
 *   - common/       共享层：ws_bridge（软链接到仓库 ../../src 的 bridge 库）+ protocol 契约 + validator
 *   - server/       本目录：DirectoryManager（路径单一事实来源）+ SessionManager（按 connectId 管理连接）
 *   - client/       浏览器前端：esbuild 打包到 client/dist，由本服务静态托管
 *
 * 演示要点：
 *   - SessionManager：每条连接一个 Session（含昵称），chat.send 遍历 all() 广播给其它连接；
 *   - DirectoryManager：统一 clientDist / data 路径，聊天历史落盘到 data/history.json。
 */
import { createServer } from "./app";
import { startBridge } from "./bridge/connect";
import { SessionManager } from "./session/sessionManager";
import { directoryManager } from "./lib/directoryManager";

// 端口优先取环境变量 PORT（发行版启动器会挑一个可用端口传入以避免冲突），默认回落 3201。
const PORT = Number(process.env.PORT) || 3201;

const server = createServer();
// 仅绑定回环地址：本服务允许读写本机目录，不应暴露到局域网其它主机。
const bridge = startBridge(server);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[server] 已启动: http://localhost:${PORT}  (HTTP 与 WebSocket /bridge 共用此端口)`);
  console.log(`[server] repoRoot = ${directoryManager.repoRoot}`);
  console.log(`[server] 历史文件 = ${directoryManager.historyFilePath}`);
});

// 优雅关闭：dispose 所有 session → 关闭桥 → 停止接受连接。
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    SessionManager.getInstance().disposeAll();
    void bridge.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  });
}
