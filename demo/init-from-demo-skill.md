---
name: init-from-demo
description: 依照本 demo 的分层架构, 从零初始化一个 "Vue 3 前端 + Node 后端 + 共享协议层" 的全栈项目骨架. 适用于: 用户想要 "新建一个和 demo 一样结构的项目 / 类似的前后端 demo / 基于本 demo 的全栈脚手架". 可选两种模式: 保留 demo 现有的一套 UI 样式 (pages/features 注册表 + 暗色主题), 或只保留架构 (bridge + 各 xxManager 单例) 的空项目. 核心是以 demo/ 为唯一模板逐文件对照复刻, 而非从头设计.
---

# 从 demo 初始化一个全栈项目

本 skill 指导 agent **完全按照本 `demo/` 目录的现有结构与约定**, 快速产出一个可运行的
"浏览器前端 <-> WebSocket 桥 <-> Node 后端" 全栈项目骨架.

**核心原则: 以 `demo/` 为唯一模板, 逐文件对照复刻.** 需要什么文件, 怎么分层, 怎么接线,
都直接看 `demo/` 里对应的现成文件照抄改名, 不要自行重新设计架构. 本文件只解释 "结构长什么样,
各部分职责与必须遵守的约定", 具体代码请打开 demo 对应文件参照.

> **标点约定 (全项目强制)**: 所有由本 skill 产出的文件 —— 代码, 注释, 文档, `package.json`
> 的 description, `.github/` 下的 agent / skill / rules 文件 —— **一律使用英文半角标点**
> (`,` `.` `:` `;` `()` `""` `!` `?`), 禁止出现中文全角标点 (`，` `。` `：` `；` `（）` `「」`
> `、` `！` `？`). 本 skill 文件自身即遵循此约定, 复刻时保持一致.

## 何时使用

- 用户说: "新建一个和 demo 一样结构的项目" "基于这个 demo 搭一个前后端项目"
  "给我一个全栈脚手架".
- 不适用: 只是要在**已有**项目里新增一个 RPC 方法 —— 那用 `add-remote-api` skill.

## 第一步: 与用户确认模式 (必问)

demo 由两部分组成 —— **架构层** (bridge 传输/RPC + 各 xxManager 单例 + 打包) 与叠在其上的
**UI 样式层** (前端 `pages/` + `pages/main/features/` 两级注册表, `App.vue` 导航壳与暗色主题).
初始化前先问用户要哪种:

- **模式 A (保留样式)**: 复刻**全部** demo 内容, 包含前端 pages/features 注册表与暗色主题.
  适合想要一个已经能看的多页面/多 tab 前端外壳的用户.
- **模式 B (空项目, 只保留架构)**: 复刻架构层, **跳过** UI 样式层. 前端只留一个最小
  `App.vue` 壳 + 建链单例, 不含 `pages/` / `router/` / features 注册表与主题. 适合想从零
  自己搭 UI, 只复用 bridge + 单例架构的用户.

两种模式的**架构层完全一致**; 差异只在前端 UI 样式层是否复刻 (见下 "架构层 vs 样式层").

## 目标结构 (对照 demo/ 复刻)

三层, 前后端共享同一份协议契约 (`common/`). 对照 `demo/` 逐一复刻. 标注 `[架构]` 的两种模式
都要复刻; 标注 `[样式]` 的仅**模式 A** 复刻, 模式 B 跳过 (见后 "架构层 vs 样式层"):

```
<project>/
  start.bat / debug.bat / ensure-env.bat   # [架构] 照抄 demo 根同名脚本, 改端口即可
  package.bat                               # [架构] 照抄 demo, 一键调用 packager-installer 打包
  .vscode/launch.json                       # [架构] 照抄 demo (F5 attach 后端调试)
  .gitignore                                # [架构] 照抄 demo
  .github/                # [架构] 项目自己的 AI 协作文件, 照抄并改写自 demo/.github/ (见下 "AI 协作文件")
    instructions/*.instructions.md   # 分层编码规范 (含 "统一用英文标点" 规则)
    skills/<name>/SKILL.md           # 领域 skill (init-from-demo / add-remote-api / 通用 skill)
    agents/*.agent.md                # 自定义 agent (main / backend-coder / frontend-coder / reviewer...)
  common/                 # [架构] 共享层: 被 client 与 server 同时引用
    package.json          # 依赖必须完全闭包 (dependencies + devDependencies 齐全)
    ws_bridge/            # bridge 库源码: 复刻时改为直接拷贝的实体文件 (见 "bridge 库源码")
    validator.ts          # 通用运行时校验原语 (Validate 工具类)
    protocol/             # 协议契约目录: 初始为空, 新增 method 时在此加 <domain>.ts (见 add-remote-api)
  server/                 # [架构] 后端: http 静态服务 + WebSocket 桥 (共用同一端口)
    package.json / tsconfig.json
    src/
      index.ts            # 进程入口: createServer + startBridge + 优雅关闭
      app.ts              # http 静态服务 (托管 client/dist, 防目录穿越)
      bridge/
        connect.ts        # 把 WSServerBridgeListener 挂到 http.Server, 接线 session/router
        remote_router/handlers.ts        # 入站处理器聚合入口 registerAllHandlers (初始为空)
      session/session.ts / sessionManager.ts  # 每连接一 Session, SessionManager 按 connectId 管理
      lib/directoryManager.ts        # DirectoryManager: 路径唯一事实来源
  client/                 # 前端: Vue 3 + Vite, 构建产物交给 server 静态托管
    package.json / tsconfig.json / vite.config.ts / index.html / shims-vue.d.ts   # [架构]
    src/
      main.ts             # [架构] createApp + connectBridge(); 模式 A 还 .use(router)
      App.vue             # 根组件: [样式] 导航壳 + 暗色主题; 模式 B 换成最小壳 (见下)
      bridge/
        connect.ts        # [架构] CreateWSClientPeer 单例 + 注册推送处理器 + 启动分发
        remote_router/handlers.ts        # [架构] server->client 推送处理器聚合 (初始为空)
      router/index.ts     # [样式] 读 pages 注册表构建 vue-router 路由表
      pages/              # [样式] URL 页面的两级注册表 (页面级 + 页面内 feature tab 级)
        registry.ts / types.ts / index.ts   # 页面注册表 + 类型 + 装配点 (import 各页面并 registerPage)
        main/             # 一个 URL 页面, 内含 feature tab 注册表
          index.ts / MainPage.vue
          components/layout/FeatureLayout.vue / FeatureTabList.vue   # 侧栏 + 面板布局
          features/       # 页面内 feature tab 的注册表 (registry/types/index) + 示例 tab (about / userCenter)
        other/            # 另一个并列 URL 页面 (示例)
  packager-installer/     # [架构] 必选: 打包成 Windows 安装器 (Inno Setup)
    build-release.mjs     # 组装自包含发行目录 dist-release/app (tsc 预编译成 CommonJS)
    <project>.iss         # Inno Setup 脚本, 打成单个 setup.exe
    <project>.bat         # 发行版启动器 (动态选端口, 用系统已装 Node 运行)
    tsconfig.release.json # 发行编译配置
```

> demo 中 `remote_api/` (我方发起的出站调用) 与前端 `events/` (推送事件中心) 目录**初始并不存在**;
> 它们在你用 `add-remote-api` 新增第一个 RPC 方法/推送时才按需创建. 初始骨架里两侧只有
> `remote_router/handlers.ts` 空聚合入口.

## 架构层 vs 样式层 (决定模式 B 跳过什么)

**架构层 (两种模式都复刻)**: 根脚本/配置, `.github/`, `common/` 全部, `server/` 全部,
`client/` 的 `package.json` / `tsconfig.json` / `vite.config.ts` / `index.html` / `shims-vue.d.ts`
/ `src/main.ts` / `src/bridge/**`, `packager-installer/` 全部.

**样式层 (仅模式 A 复刻)**: `client/src/pages/**`, `client/src/router/**`, 以及 `App.vue` 里的
导航壳与暗色主题 CSS.

**模式 B 的前端差异** (只保留架构):
- 不复刻 `pages/` 与 `router/`; `client/package.json` 去掉 `vue-router` 依赖.
- `src/main.ts` 改为不 `.use(router)`, 只 `connectBridge()` + `createApp(App).mount("#app")`.
- `App.vue` 换成最小壳, 例如:
  ```vue
  <script setup lang="ts"></script>
  <template>
    <div id="app-root"></div>
  </template>
  <style>
  body { margin: 0; }
  </style>
  ```
- 其余 (bridge 单例, SessionManager / DirectoryManager / BridgeRouter, 打包) 与模式 A 完全相同.

## 必须保持的约定 (复刻时不可破坏)

1. **对称双向 RPC**: `client -> server` 与 `server -> client` 都是 RPC. 每一侧新增一个方法时,
   **发起方**写 `remote_api/` (封装 `BridgeRouter.send`), **处理方**写 `remote_router/`
   (`register_message_handler`, 由 `handlers.ts` 聚合). 初始骨架里 `remote_api/` 尚不存在,
   两侧只有空的 `remote_router/handlers.ts`; 新增方法照 `add-remote-api` skill 落地.
2. **协议契约集中在 `common/protocol/`**: 每个 method 导出 `方法名常量` + `Params/Result` 接口
   + **同名伴生校验器** (`Validator<T>`, `asserts` 断言签名). client 与 server 引用同一份, 杜绝漂移.
   初始 `protocol/` 为空目录.
3. **HTTP 与 WebSocket 共用同一端口**: `WSServerBridgeListener` 直接挂到已有 `http.Server`
   (`serverOptions: { server, path: "/bridge" }`).
4. **BridgeRouter 进程级单例**: 用 `BridgeRouter.GetRouter()` 取, 注册一次 handler,
   每条连接 `router.startDispatchMessage(peer)`.
5. **connectId 一连接一 session**: client 端 `CreateWSClientPeer` 自动生成 connectId;
   server 端 `SessionManager` 据此建立 / 查找 session; `getSession(peer)` 是各 handler 统一入口.
6. **前端推送经事件中心解耦 (模式 A/B 通用的推荐模式)**: `remote_router` 收到推送只 `emitEvent`,
   UI 组件 `registerEventHandler` 订阅, 二者不直接耦合. 事件中心 (`client/src/events/`) 在新增
   第一个推送时按需创建, 初始骨架不含.
7. **安全**: server 只绑 `127.0.0.1`; 静态服务防目录穿越; `data/`, `node_modules/`,
   `client/dist/` 进 `.gitignore`.
8. **依赖完全闭包**: `common` / `server` / `client` 每一层的 `package.json` 都要**自包含**,
   即所有编译 / 运行 / 类型所需的包都显式声明, `dependencies` 与 `devDependencies` 齐全
   (例如 `common` 除 `ws` 外还需 `typescript` / `@types/node` / `@types/ws` 等 devDependencies),
   不依赖其他层 "顺带装上" 的包. 模式 B 前端去掉 `vue-router` 依赖.
9. **打包安装器必选**: 必须一并复刻 `packager-installer/` 与根 `package.bat`, 保证项目能一键
    打成单个 Windows `setup.exe` (见 "打包成安装器").
10. **AI 协作文件一并复制**: 必须把 `demo/.github/` 下的 agent / skill / rules 等 md 文件一并
    复制并改写到新项目 `.github/` (见下节).
11. **标点统一用英文半角**: 所有产出文件禁用中文全角标点, 见文首 "标点约定".
12. **样式层仅模式 A 复刻**: `pages/` / `router/` 两级注册表与 `App.vue` 主题属 UI 样式层,
    模式 B 跳过并换成最小 `App.vue` 壳 (见 "架构层 vs 样式层"). 架构层两种模式必须一致.

## bridge 库源码 (直接复制, 不用 npm 包)

bridge 库提供 `BridgePeer` / `WSServerBridgeListener` / `CreateWSClientPeer`
/ `BridgeRouter` / `Validator`. **不引用任何 npm 包, 直接把这些源码文件复制进项目**:

- 把 bridge 库的 `.ts` 源码 (`peer.ts` / `wsServerPeer.ts` / `wsClientPeer.ts` / `rpc.ts` /
  `index.ts` 等) 作为**真实文件**复制到 `common/ws_bridge/` (demo 中该目录是软链接, 复刻时
  改为直接拷贝的实体文件).
- 代码走相对路径引用: `import { ... } from "../../../common/ws_bridge/index"` (按各层深度调整).
- `ws` 装在 `common/` (被 `wsServerPeer.ts` 使用); 浏览器端用原生 WebSocket, 无需 `ws`.
- 因是实体文件而非软链接, **无需 `preserveSymlinks`**: 各 tsconfig / vite / 启动脚本都不要
  `preserveSymlinks` 或 `--preserve-symlinks*`.

> 要点: 项目自包含, 不依赖外部包管理器拉取 bridge 库; 升级时重新复制源码即可.

## AI 协作文件 (.github/, 必选)

init 项目时**必须**把 `demo/.github/` 下的协作文件一并复制并改写到新项目, 让后续 AI 协作
沿用同一套规范与角色:

- `.github/instructions/*.instructions.md`: 分层编码规范 (参考 demo 的 `coding-conventions`),
  用 `applyTo` 限定作用范围 (如 `**/*.ts`, `**/*.vue`); 必须保留 **"统一使用英文半角标点"** 这条规则.
- `.github/skills/<name>/SKILL.md`: 项目领域 skill. 至少带上 `init-from-demo` 与 `add-remote-api`,
  以及需要的通用 skill (如 `typescript-strict` / `vue3-frontend` / `write-ai-context` 等), 按新项目
  实际改写路径与域名.
- `.github/agents/*.agent.md`: 自定义 agent (如 `main` / `backend-coder` / `backend-reviewer` /
  `frontend-coder` / `frontend-reviewer`), 改写其中的目录与职责描述以匹配新项目.

改写时把项目名 / 目录 / 域名替换为新项目的, 并确保内容本身也遵守英文标点约定.

## 落地顺序

1. 与用户确认: 项目名 `<project>`, 后端端口 `<PORT>` (demo 默认 3201), **模式 A (保留样式) 还是
   模式 B (空项目, 只保留架构)** (见 "第一步: 与用户确认模式").
2. **对照 demo/ 逐文件复刻架构层**: `common` (含把 bridge 源码复制进 `common/ws_bridge/`)
   -> `server` -> `client` 架构部分 -> 根脚本 / 配置 -> `packager-installer/` -> `.github/`.
   每个文件都打开 demo 对应文件参照, 改项目名 / 端口, 用相对路径 import `common/ws_bridge/*`,
   并保证依赖完全闭包与英文标点.
3. **前端 UI**:
   - 模式 A: 一并复刻 `client/src/pages/**` / `client/src/router/**` 与 `App.vue` 主题.
   - 模式 B: 跳过 `pages/` / `router/`, `App.vue` 换最小壳, `main.ts` 去掉 `.use(router)`,
     `client/package.json` 去掉 `vue-router` (见 "架构层 vs 样式层").
4. `cd client && npm run build` 生成 `client/dist`.
5. `cd server && npm start`, 浏览器开 `http://localhost:<PORT>` 验证页面能加载
   (模式 A 还可切换 Main / Other 页面与 feature tab). 或直接跑 `start.bat` 一键跑通.
6. `npm run package` (或跑 `package.bat`) 验证能打出单个 `setup.exe`.

## 打包成安装器 (必选)

参考 demo `packager-installer/` (Windows Inno Setup):

- `build-release.mjs`: 把 `client` 构建产物 + `server` 编译后的 JS + `common` + 生产依赖组装成
  自包含发行目录 `dist-release/app`, 发行态用 `tsconfig.release.json` 经 `tsc` 预编译成 CommonJS,
  node 直跑, 无需 ts-node / 软链接 / `--preserve-symlinks`.
- `<project>.iss`: Inno Setup 脚本, 把 staging 目录打成单个 `setup.exe`, 默认装到用户目录免管理员.
- `<project>.bat`: 发行版启动器, 动态挑端口经 `PORT` 环境变量传给入口, 用系统已装 Node 运行.
- 根 `package.bat` / `npm run package`: 一键触发上面的打包流程.

## 验收清单

- [ ] 架构层目录结构与 demo 一致: 三层 + 每侧 `remote_router/handlers.ts` 空聚合入口就位.
- [ ] `common/protocol/` 目录已就位 (初始为空; 若已加 method, 每个都有 `方法名常量 + Params/Result 类型 + 伴生校验器`, 两端引用同一份).
- [ ] bridge 源码已作为实体文件复制进 `common/ws_bridge/`; 全项目无 `preserveSymlinks` 且不引用 npm 包.
- [ ] `BridgeRouter.GetRouter()` 单例; `SessionManager` / `DirectoryManager` 单例就位; HTTP 与 WebSocket 共用同一端口.
- [ ] server 只绑 `127.0.0.1`; 静态服务防目录穿越; `.gitignore` 已就位.
- [ ] `packager-installer/` 与 `package.bat` 已就位, 能打出单个 `setup.exe`.
- [ ] `.github/` 下 instructions / skills / agents 等 md 文件已复制并改写, 且保留 "统一用英文标点" 规则.
- [ ] 全部产出文件无中文全角标点.
- [ ] **模式 A**: `pages/` / `router/` 与 `App.vue` 主题已复刻, 页面/feature 切换正常.
- [ ] **模式 B**: 无 `pages/` / `router/`, `App.vue` 为最小壳, `package.json` 无 `vue-router`.
- [ ] `npm run typecheck` (server & client) 无错.

## 进一步扩展

- **新增一个 RPC 方法**: 用 `add-remote-api` skill.
- **持久化**: 新增 `server/src/lib/<domain>Store.ts` 单例, 经 `directoryManager` 拿数据文件路径落盘.
- **模式 B 后续加 UI**: 需要多页面/多 tab 时, 可回头照模式 A 的 `pages/` 两级注册表补齐.
