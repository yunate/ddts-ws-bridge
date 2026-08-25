---
name: add-remote-api
description: >
  在本 demo（client + common + server）脚手架中新增一个「桥」RPC 方法（API）的完整步骤。适用于：
  通过 common/ws_bridge 的 WebSocket 桥新增一对调用——一端用 remote_api 发起调用，另一端用
  remote_router 注册处理器；既支持 client → server（前端调后端），也支持 server → client
  （后端主动推送给前端）。覆盖 protocol 契约定义、caller(remote_api)、callee(remote_router)
  注册、handler 首参为 peer 的签名、调用两端自行执行 Validate 运行时校验、聚合到 handlers.ts 等约定。
---

# 新增一个桥 RPC 方法（remote_api / remote_router）

本 demo 前后端不走 REST/HTTP，而是通过 `common/ws_bridge/` 的 WebSocket 桥做 RPC 风格调用。
新增一个 API = 新增「一个方法名 + 一对端」：**发起方**写在 `remote_api/`，**处理方**写在 `remote_router/`。

## 核心概念

- **`common/protocol/<method>.ts`** — 前后端共享的契约：方法名常量 + 参数/返回类型 + 普通断言函数。两端都从这里 import，保证类型与校验一致。
- **`remote_api/<method>.ts`（发起方 / caller）** — 封装一次类型安全的出站调用，内部用 `BridgeRouter.send(...)`。
- **`remote_router/<method>.ts`（处理方 / callee）** — 收到该方法时执行的 handler（写成独立命名函数），并在**同一文件**导出的 `registerXxxRouter(router)` 中用 `registerMessageHandler` 注册；由 `remote_router/handlers.ts` 的 `registerAllHandlers(router)` 聚合调用各 `registerXxxRouter(router)`。
- 方法名常量全局唯一；重复注册会抛错（`BridgeRouter` 内 `重复注册的方法`）。

> **方向决定文件落点**：谁发起调用，谁写 `remote_api`；谁响应，谁写 `remote_router`。
> - client → server（前端调后端）：client 写 `remote_api`，server 写 `remote_router`。
> - server → client（后端推前端）：server 写 `remote_api`，client 写 `remote_router`。

## 关键约定（务必遵守）

- **签名约定（核心）**：
- **`remote_api`（发起方 / caller）第一个参数固定为 bridge 对象**：`fn(bridge, params)`，内部 `BridgeRouter.send(bridge, METHOD, ...params)`。bridge 类型两端均为 `BridgePeer`（client 端由 `CreateWSClientPeer` 创建、server 端由 `WSServerBridgeListener` 创建）。
  - **`remote_router`（处理方 / callee）处理器第一个参数固定为收到该调用的 `peer`**，后续参数与 `send` 的 rest 参数一一对应：`(peer, ...params) => result`。需要 connectId 时用 `peer.getConnectId()`。
- **handler 写成独立命名函数，再在 `registerXxxRouter` 里注册**（不要把逻辑内联进 `registerMessageHandler` 的箭头函数），便于阅读/复用。
- **caller 用 `BridgeRouter.send(bridge, METHOD, ...params)`**：失败会 `throw`，成功返回 `unknown`。无参时省略后续参数；多参数直接展开传入。返回值对发起端是不可信数据，调用方必须在使用前用普通断言函数校验。
- **callee 自行校验参数**：`registerMessageHandler(METHOD, handler)` 不接收校验器；handler 的参数是未受信 `unknown`，必须在使用前校验。
- **handler 第一个参数 peer**：由桥层 `dispatch` 权威注入（消息实际到达的那个连接，不依赖报文体），从根上避免伪造/串话。暂时用不到就命名为 `_peer`。
- **import 无后缀**（本 demo client 与 server 均用 CommonJS + ts-node，相对 import 都**不带 `.js` 后缀**）：`from "../../../../common/ws_bridge/rpc"`。
- **要传入的 bridge 从哪里拿**：调用 caller 时由调用方传入。**client**：用单例 `getBridge()`（`client/src/bridge/connect.ts`，未初始化抛错）。**server**：用对应连接/会话的 `session.bridge`（每个页面一个 Session，经 `getSession(peer)` / `SessionManager` 获取）。

---

## 步骤 A：client → server（前端调用后端）

下面以一个示例方法 `foo.bar`（有入参与返回值）为例。

### 1) 契约 `common/protocol/<method>.ts`
```typescript
import { Validate } from "../validator";

export const FOO_METHOD = "foo.bar";

export interface FooParams {
  // ...入参
}
export function validateFooParams(value: unknown): asserts value is FooParams {
  Validate.ensureRecord(value);
  // ...按字段用 Validate.ensureXxx 校验
}
export interface FooResult {
  // ...出参
}
export function validateFooResult(value: unknown): asserts value is FooResult {
  Validate.ensureRecord(value);
  // ...
}
```
为每一个来自网络且会被使用的参数/返回类型提供普通断言函数。无参、无返回的方法不需要断言函数。校验原语来自 `common/validator.ts` 的 `Validate`。

### 2) server 处理器 `server/src/bridge/remote_router/<method>.ts`（callee）
```typescript
import type { BridgePeer } from "../../../../common/ws_bridge/peer";
import type { BridgeRouter } from "../../../../common/ws_bridge/rpc";
import { FOO_METHOD, validateFooParams, type FooResult } from "../../../../common/protocol/foo";
import { getSession } from "../../session/sessionManager";

// handler 写成独立命名函数；第一个参数是收到该调用的 peer（运行时即 BridgePeer）。
// 需要本连接身份时用 getSession(peer)。
export function foo(peer: BridgePeer, params: unknown): FooResult {
  validateFooParams(params);
  const session = getSession(peer);
  return { /* FooResult */ };
}

export function registerFooRouter(router: BridgeRouter): void {
  router.registerMessageHandler(FOO_METHOD, foo);
}
```
业务逻辑放 `server/src/lib/`（或 `session/`），handler 只做编排与身份获取。

### 3) server 聚合 `server/src/bridge/remote_router/handlers.ts`
```typescript
import { registerFooRouter } from "./foo";
// registerAllHandlers(router) 内追加：
registerFooRouter(router);
```

### 4) client 发起方 `client/src/bridge/remote_api/<method>.ts`（caller）
```typescript
import { BridgeRouter } from "../../../../common/ws_bridge/rpc";
import { FOO_METHOD, type FooParams, validateFooResult, type FooResult } from "../../../../common/protocol/foo";
import { getBridge } from "../connect";

// 语义化封装：UI 只调用 foo(params)，不直接拼 send。
// 有返回值：末参传 Result 伴生校验器（FooResult），由发起端校验未受信的对端返回值。
export async function foo(params: FooParams): Promise<FooResult> {
  const result: unknown = await BridgeRouter.send(getBridge(), FOO_METHOD, params);
  validateFooResult(result);
  return result;
}
```

---

## 步骤 B：server → client（后端推送前端）

下面以一个无返回值的推送示例 `client.ping` 为例。

### 1) 契约 `common/protocol/<method>.ts`
```typescript
import { Validate } from "../validator";

export const PING_METHOD = "client.ping";
export interface PingParams { message: string; }
export function validatePingParams(value: unknown): asserts value is PingParams {
  Validate.ensureRecord(value);
  Validate.ensureString(value.message);
}
```

### 2) client 处理器 `client/src/bridge/remote_router/<method>.ts`（callee）
推送落地行为（更新 UI）与桥入站 handler 解耦：用通用的 **事件中心** `EventCenter<T>`（`client/src/events/eventCenter.ts`，业务无关的按 event key 发布/订阅原语，可在 client 任何地方注册/提交）建一个**共享实例** + 定义 event key，handler 只 `emitEvent({ key, payload })`，UI 侧（Vue 组件 `onMounted`）经 `registerEventHandler(key, handler)` 注册、`onUnmounted` 注销（handler 只 emitEvent、UI 侧 registerEventHandler 订阅的解耦写法）。
```typescript
// client/src/events/pingCenter.ts —— 该类推送的共享实例 + event key（业务实例，放 bridge 之外）。
import { EventCenter } from "./eventCenter";
export const PING_EVENT = 2;
export const pingCenter = new EventCenter<string>();
```
```typescript
// ping.ts —— handler 只把推送作为一个 event 交给事件中心派发。
import type { BridgePeer } from "../../../../common/ws_bridge/peer";
import type { BridgeRouter } from "../../../../common/ws_bridge/rpc";
import { PING_METHOD, validatePingParams } from "../../../../common/protocol/ping";
import { pingCenter, PING_EVENT } from "../../events/pingCenter";

// 推送无返回（void）：作为一个 event 交给事件中心派发，无 handler 则忽略。
export function handlePing(_peer: BridgePeer, params: unknown): void {
  validatePingParams(params);
  pingCenter.emitEvent({ key: PING_EVENT, payload: params.message });
}

export function registerPingRouter(router: BridgeRouter): void {
  router.registerMessageHandler(PING_METHOD, handlePing);
}
```
UI 侧订阅：`const off = pingCenter.registerEventHandler(PING_EVENT, (message) => { ... })`，`onUnmounted(() => off())`。
> 通用原语 `EventCenter<T>` 与推送落地，**放在 `client/src/events/` 而非 `bridge/`**：`eventCenter.ts` 是业务无关的泛型「按 event key 发布/订阅」类（含通用 `Event<T>` 结构体：`{ key, payload }`），`xxxCenter.ts` 是承载某类通知的共享实例 + event key 常量。

### 3) client 聚合 `client/src/bridge/remote_router/handlers.ts`
```typescript
import { registerPingRouter } from "./ping";
// registerAllHandlers(router) 内追加：
registerPingRouter(router);
```

### 4) server 发起方 `server/src/bridge/remote_api/<method>.ts`（caller）
```typescript
import { BridgeRouter } from "../../../../common/ws_bridge/rpc";
import { PING_METHOD, type PingParams } from "../../../../common/protocol/ping";
import type { BridgePeer } from "../../../../common/ws_bridge/peer";

// 第一个参数固定为 bridge（BridgePeer），决定推给哪个页面。
export async function emitPing(bridge: BridgePeer, message: string): Promise<void> {
  await BridgeRouter.send(bridge, PING_METHOD, { message });
}
```
server 端通常在 handler 里用 `getSession(peer)`（或遍历 `SessionManager.getInstance().all()`）拿到目标 session，再 `emitPing(session.bridge, ...)`，以确保只推给目标页面。推送失败应 `.catch` 记录、不影响其它连接。

---

## 落地清单（Checklist）

- [ ] `common/protocol/<method>.ts`：方法名常量（唯一）+ Params/Result 类型 + 普通断言函数。
- [ ] 处理方新增 `remote_router/<method>.ts`，handler 写成独立命名函数 `(peer: BridgePeer, ...params) => result`，并在使用参数前校验。
- [ ] 处理方在**同文件**导出 `registerXxxRouter(router)`，内部调用 `registerMessageHandler(METHOD, handler)`。
- [ ] 在 `remote_router/handlers.ts` 的 `registerAllHandlers(router)` 里追加 `registerXxxRouter(router)` 聚合调用。
- [ ] 发起方新增 `remote_api/<method>.ts`，用 `BridgeRouter.send(bridge, METHOD, ...params)`；返回值先以 `unknown` 接收并校验。client 内部取 `getBridge()`，server 由调用方传 `session.bridge`。
- [ ] client 与 server 的 import 均**不带 `.js` 后缀**。
- [ ] 跑 `npm --prefix server run typecheck` 与 `npm --prefix client run build` 验证编译。
- [ ] 更新相关 `AI_CONTEXT.md`（顶层与模块目录）。

## 易错点

- handler **漏掉第一个 `peer` 参数**：会与签名不符；不用就写 `_peer`，需要 connectId 用 `peer.getConnectId()`。
- **忘了在 method 文件的 `registerXxxRouter` 里注册，或忘了在 `handlers.ts` 的 `registerAllHandlers` 聚合调用**：方法虽实现但不会被分发，调用方得到「未知的方法」。
- **方法名拼写两端不一致**：务必只从 `common/protocol` 里 import 同一个常量，不要各写字符串。
- **直接使用未受信参数或返回值**：callee handler 与 caller 都必须在消费网络数据前调用共享断言函数。
- **caller 漏传 / 传错 bridge**：server 端要传**目标 session 的 `session.bridge`**（决定推给哪个页面），传错会把消息发到别的页面。
