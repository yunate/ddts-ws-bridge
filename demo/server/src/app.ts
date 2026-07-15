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

// 创建 HTTP 静态服务：对外提供前端 Vite 构建产物（DirectoryManager.clientDistDir）。
// 仅返回 clientDistDir 内的文件（防目录穿越）。前端是 history 模式的 SPA：未命中静态文件
// 且请求的是导航路由（无文件扩展名，如 /main）时回退到 index.html，交给 vue-router 处理，
// 使这些路由可被直接访问 / 刷新；缺失的静态资源（有扩展名）仍返回 404。
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
        // 无扩展名 = 导航路由：回退到 index.html（SPA history 模式）。有扩展名的缺失资源才 404。
        if (path.extname(filePath) === "") {
          serveIndexHtml(res);
          return;
        }
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

// 回退发送前端入口 index.html（SPA 路由由 vue-router 在客户端接管）。
function serveIndexHtml(res: http.ServerResponse): void {
  fs.readFile(path.join(directoryManager.clientDistDir, "index.html"), (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(data);
  });
}
