---
name: publish-npm-package
description: >
  库 ask-ai-bridge-ts 的构建与发布约定：把 src/ 用 tsc 编译到 dist/（含 .d.ts 声明），
  维护 index.ts barrel 导出与 package.json 的 files/scripts，发布到 npm。适用于：改动公开 API 后
  同步 barrel 导出、调整 tsconfig 编译配置、准备发版（版本号、prepublishOnly、npm publish）、
  避免把 example/ 或源外文件带进发行包。强调公开 API 是对外契约，破坏性变更需谨慎与语义化版本。
---

# 构建与发布 ask-ai-bridge-ts（npm 库）

本项目根是一个**发布到 npm 的 TypeScript 库**（`package.json` name `ask-ai-bridge-ts`）。
消费方 `npm install` 后从 `dist/` 拿到编译好的 JS + `.d.ts` 类型。

## 构建配置（tsconfig.json）

- `tsc -p tsconfig.json`：`src/` → `dist/`（`outDir: "dist"`、`rootDir: "src"`）。
- `declaration: true`：生成 `.d.ts`，消费方获得完整类型。
- `module: "CommonJS"` + `target: "ES2020"`、`lib: ["ES2020","DOM"]`（含 DOM 以支持浏览器 `WebSocket`）、`strict: true`。
- **`exclude` 含 `src/example/**`**：示例（`example.ts`/`rpcExample.ts`/`validator.ts`）**不编译进 `dist/`**，只作本地演示。
  新增示例放 `src/example/` 下即自动排除；勿把示例专用代码放进会被打包的路径。

## 对外入口：index.ts（barrel）

`src/index.ts` 是**唯一公开 API 入口**，re-export 全部对外类型与函数：
`BridgePeer`/`genId`/`BridgeSocket`/`PeerOptions`/`MessageHandler`（peer）、`ServerBridge`/`ServerBridgeListener`/`ServerBridgeListenerOptions`（serverBridge）、`ClientBridge`/`ClientBridgeOptions`（clientBridge）、`BridgeRouter`/`send`/`Request`/`Response`/`Validator`（rpc）。

- **新增/删除公开 API 必须同步改 `index.ts`**：只在 `index.ts` 导出的才是对外契约；未导出的属内部实现，可自由改。
- 类型用 `export { type X }` 形式导出（与现有写法一致）。

## package.json 约定

- **`files: ["dist","src","README.md","LICENSE"]`**：只有这些进发行包。`dist/` 是消费方实际用的产物；随包带 `src/` 便于查看源码。
- **`main`/`types`**：确认指向 `dist/index.js` 与 `dist/index.d.ts`（发布前核对，缺失会导致消费方无法解析入口/类型）。
- **scripts**：`build`（`tsc -p tsconfig.json`）、`prepublishOnly`（`npm run build`，发布前自动构建，保证 `dist/` 最新）、
  `example` / `rpc-example`（`ts-node` 跑本地演示，不参与发布产物）。
- **`dependencies` 仅 `ws`**（server 端用；浏览器端走原生 `WebSocket`）；`@types/*`、`ts-node`、`typescript` 属 `devDependencies`。

## 发版流程

1. 改动公开 API 时先同步 `src/index.ts` barrel 与 `README.md` 的 API 概览。
2. 语义化版本 bump `package.json` 的 `version`：
   - **破坏性变更**（改公有方法名/签名、删导出——注意 `on_message`/`send1`/`wait_for_connect` 等 snake_case 名是已发布契约）→ major。
   - 向后兼容的新功能 → minor；修 bug → patch。可用 `npm version <patch|minor|major>`。
3. `npm run build` 确认无类型错误、`dist/` 产出 `.js` + `.d.ts`。
4. `npm publish`（`prepublishOnly` 会自动先 build）。发布是不可逆动作，**执行前与用户确认**。

## 常见坑

- **忘记更新 barrel**：新增了类型/函数但没在 `index.ts` 导出 → 消费方拿不到。改公开 API 必查 `index.ts`。
- **示例代码混入产物**：示例只放 `src/example/`（已被 `exclude`）；勿把仅演示用的依赖/代码放进会编译的路径。
- **改破坏性但只 bump patch**：改公有方法名/签名属 major 变更，勿降级为 patch/minor。
- **`main`/`types` 缺失或指错**：发布前务必核对入口字段指向 `dist/index.*`。

## 验证边界

可做**构建级验证**（`npm run build` 确认编译通过、`dist/` 产物齐全、`.d.ts` 生成）。
**实际 `npm publish` 与发版由用户决定并执行**，不要自行发布；如需演示可跑 `npm run example` / `npm run rpc-example`。
