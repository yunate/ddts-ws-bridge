import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// dev: Vite(5173) 托管前端并把 /bridge 代理到后端 3201；prod: vite build → dist/ 由 server 托管。
export default defineConfig({
  plugins: [vue()],
  // 经软链接 ../common/ws_bridge（= 仓库 ../../src）引用 bridge 库，保持软链接路径不解真。
  resolve: { preserveSymlinks: true },
  server: {
    port: 5173,
    // common/ 在 client 目录之外：放行共享桥/协议层，最小权限。
    fs: { allow: ["../common"] },
    proxy: {
      "/bridge": { target: "ws://localhost:3201", ws: true },
    },
  },
});
