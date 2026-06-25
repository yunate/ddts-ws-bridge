import path from "node:path";

// 目录管理器：demo 仓库根 + 各业务目录/文件路径的唯一事实来源。仓库根只在此处推导一次，
// 其余模块一律通过单例读取，避免各处自行数 ../ 层数。
// 参考 youtube_downloader 的 DirectoryManager：集中管理 clientDist / data 等路径。
export class DirectoryManager {
  static getInstance(): DirectoryManager {
    DirectoryManager._instance ??= new DirectoryManager();
    return DirectoryManager._instance;
  }

  private constructor() {
    // 本文件位于 demo/server/src/lib，上溯三层即 demo 根。
    this.repoRoot = path.resolve(__dirname, "..", "..", "..");

    this.clientDir = path.join(this.repoRoot, "client");
    this.clientDistDir = path.join(this.clientDir, "dist");
    this.dataDir = path.join(this.repoRoot, "data");
    this.historyFilePath = path.join(this.dataDir, "history.json");
  }

  readonly repoRoot: string;
  readonly clientDir: string;
  // 前端 esbuild 构建产物目录，由 http 静态服务对外提供。
  readonly clientDistDir: string;
  // 运行时数据目录（本 demo 用于持久化聊天历史）。
  readonly dataDir: string;
  readonly historyFilePath: string;

  private static _instance: DirectoryManager | null = null;
}

// 模块级单例：全项目统一入口。
export const directoryManager = DirectoryManager.getInstance();
