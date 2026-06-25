import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { directoryManager } from "./lib/directoryManager";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

// 创建 HTTP 静态服务：对外提供前端 esbuild 构建产物（DirectoryManager.clientDistDir）。
// 仅返回 clientDistDir 内的文件（防目录穿越），根路径回退到 index.html。
export function createServer(): http.Server {
  return http.createServer((req, res) => {
    const urlPath = !req.url || req.url === "/" ? "/index.html" : req.url.split("?")[0];
    const filePath = path.join(directoryManager.clientDistDir, path.normalize(urlPath));

    // 防目录穿越：解析后的路径必须仍在 clientDistDir 内。
    if (!filePath.startsWith(directoryManager.clientDistDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream",
      });
      res.end(data);
    });
  });
}
