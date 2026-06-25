---
description: "库统一编码规范：命名、私有标记、成员排序、设计与抽象、注释。适用于核心库源码（src/**），编写者与审查者均须遵循。demo/ 有其自己的规范，不受此文件约束。"
applyTo: "src/**/*.ts"
---
# 编码规范（强制）

本规范为 **核心库 `ask-ai-bridge-ts`（`src/`）** 的单一事实来源。编写者须遵循，审查者须把以下各条作为审查项。
`demo/` 子项目有独立的 `.github/instructions/`，不适用本文件。

## 命名规范
- **函数 / 方法**：使用「动词 + 名词」风格，名称体现其行为（如 `setSocket`、`waitForConnect`、`registerMessageHandler`、`dispatch`）；布尔返回值 / 状态查询用 `is/has/should/can` 前缀（如 `isconnect`）；事件监听器用 `on` 前缀（如 `onConnect`、`onDisconnect`、`onConnection`、`on_message`）。
- **既有公有 API 的既定命名不要擅自改动**：库对外已发布的方法中存在 snake_case 命名（`on_message`、`send1`、`wait_for_connect`、`wait_for_disconnect`、`register_message_handler`、`start_dispatch_message`），这些是**公开契约**，改名属破坏性变更。维护/新增紧邻代码时**与所在文件的既有风格保持一致**；如需引入新公有 API，优先沿用同一文件既有的命名风格，避免同一模块内风格割裂。
- **大小写约定**：
  - 变量 / 函数 / 局部方法 → `camelCase`（新内部代码首选）。
  - 类型 / 接口 / 类 → `PascalCase`（如 `BridgePeer`、`ServerBridge`、`ClientBridge`、`BridgeRouter`、`BridgeSocket`、`PeerOptions`、`Envelope`、`Validator`）。
  - 方法名常量（RPC method）→ 由调用者定义，保持全项目一致的风格（如 `'math.add'`、`'sys.ping'` 用点分域名）。
- 命名应**清晰、可读、表达意图**，避免无意义缩写与含糊命名（如 `data`、`tmp`、`foo`）；同一概念（如 `connectId`、`method`、`params`）在 `peer` / `rpc` / 示例中使用**同一命名**，保持术语一致。

## 文件命名规范
- **TS 源文件**（`.ts`）→ `camelCase`，文件名通常等于其主要导出（如 `peer.ts` → `BridgePeer`、`serverBridge.ts` → `ServerBridge`/`ServerBridgeListener`、`clientBridge.ts` → `ClientBridge`、`rpc.ts` → `BridgeRouter`/`send`）。
- **对外聚合入口** → `index.ts`（barrel），统一 re-export 公开 API；新增公开类型/函数须在此登记导出。
- **示例文件** → 放在 `src/example/` 下，`camelCase`（如 `example.ts`、`rpcExample.ts`）。
- 文件名应表达其内容/职责，避免 `util.ts`、`misc.ts`、`temp.ts` 等含糊名；新文件须与**同目录既有文件风格保持一致**。

## 私有成员与成员排序
- **私有标记**：类的私有函数 / 私有变量统一用 `_` 前缀命名（如 `_pending`、`_parseEnvelope()`），并配合 TS `private` 修饰符；**禁止使用 `#` 私有字段语法**。
  - 注：`peer.ts` 现有 `private pending`、`private handler` 等尚未加 `_` 前缀；改动到这些成员时顺手对齐为 `_` 前缀，不做与本次无关的大范围重命名。
- **成员排序**：类 / 模块内成员按以下规则从上到下排列，保持全项目一致：
  1. 函数整体在前，变量 / 字段整体在后。
  2. 同为函数或同为变量时：公有（public）在前，私有（`_` 前缀 / `private`）在后。
  3. 同组内 static 优先于 实例（普通）成员。
  - 综合顺序示例（由先到后）：`static 公有函数 → 公有实例函数 → static 私有函数 → 私有实例函数 → static 公有变量 → 公有实例变量 → static 私有变量 → 私有实例变量`。

## 设计与抽象
- 本库是**对称式 bridge**：`ServerBridge` 与 `ClientBridge` 共享 `BridgePeer` 能力（`send`/`send1`/`post`/`on_message` 等）。新增能力时**优先加在 `BridgePeer` 基类**，让两端对称受益，而非在某一端重复实现。
- 传输层（`peer.ts`）**只负责字符串收发与 id 配对的请求/响应模型**，不感知业务语义；结构化分发（method/params/校验）属于 RPC 层（`rpc.ts`）。**不要把业务或 RPC 语义泄漏进 `BridgePeer`**，保持分层清晰。
- 当出现以下信号时应抽象，而非复制粘贴或线性堆叠：同一段逻辑重复 2-3 次即提炼；函数过长/职责过多/嵌套过深应拆分为单一职责的小函数；多分支共享相同骨架应提炼公共辅助函数。
- 抽象要**适度**：避免过度设计（不为一次性逻辑造无谓抽象层、不为臆测的未来需求预留扩展点）。
- **优先面向对象**：有状态的组件（peer、router、listener）用类建模，把相关行为与私有状态聚合、隐藏内部细节；`BridgeRouter` 等进程级单例用 `GetRouter()`/`getInstance()` 暴露。纯无状态工具（如 `genId`）保持函数即可，不必强行包类。

## 类型安全
- 遵循 `typescript-strict` 技能：严格模式、禁 `any`、避免 `as`（用类型守卫 / 断言签名校验器）、`unknown` 优先、catch 收窄错误类型。
- 库对**未受信入站数据**（网络收到的字符串、`JSON.parse` 结果）必须在边界校验：RPC 层用 `Validator<T>` 的断言签名（`validate(value): asserts value is T`）收窄后再使用，非法输入回受控错误文案，不抛内部堆栈。
- 泛型 API 用 `NoInfer<T>` 锚定推断（如 `register_message_handler` 的校验器参数），避免调用点意外放宽类型。

## 注释规范
- **不写无用注释**：注释只解释「为什么 / 不显然的意图 / 重要约束与坑」（如「浏览器 WebSocket 与 Node ws 事件风格差异」「connectId 经 sec-websocket-protocol 传递」「BridgeRouter 是进程级单例」），不复述代码已清晰表达的内容。
- 删除无信息量的噪声注释、被注释掉的废弃代码、以及与代码已不符的过时注释。
- 不为本次未改动的代码补注释；新增/修改注释应与代码保持一致、随代码更新。
