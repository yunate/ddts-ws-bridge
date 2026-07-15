---
name: bridge-core
description: >
  核心传输层 BridgePeer（src/peer.ts）的设计与约定：对称式 client/server WebSocket bridge，
  双方共享同一套收发能力。适用于：修改或扩展 BridgePeer / WSServerBridgeListener /
  CreateWSClientPeer，理解 id 配对的请求/响应模型（RawMessage）、send/on_message、连接生命周期与
  等待、BridgeSocket 统一抽象接口（Node 'ws' 与浏览器 WebSocket 各自适配）、connectId 经 sec-websocket-protocol 传递、
  超时与断线时 pending 的清理。传输层只收发字符串，不感知业务语义。
---

# 核心传输层：BridgePeer（对称式 bridge）

`ddts-ws-bridge` 是**对称式** WebSocket bridge：server 端（`WSServerBridgeListener` 创建）与 client 端（`CreateWSClientPeer` 创建）都是 `BridgePeer` 实例，
双方能力完全对称——任一端都可主动 `send()` 并 `await` 对端回复，也可注册 `on_message` 处理对端请求。

**分层边界（务必守住）**：`BridgePeer`（`src/peer.ts`）**只负责字符串收发 + 基于消息 id 配对的请求/响应模型**，
不感知 method/params/业务语义。结构化分发（method 路由、参数校验）属于 RPC 层（`src/rpc.ts`，见 `bridge-rpc` 技能）。
**不要把业务或 RPC 语义泄漏进 `BridgePeer`**。

## 关键类型与文件

| 文件 | 导出 | 职责 |
| --- | --- | --- |
| `src/peer.ts` | `BridgePeer`、`BridgeSocket`、`PeerOptions`、`MessageHandler` | 传输基类 + socket 抽象接口 |
| `src/wsServerPeer.ts` | `WSServerBridgeListener`、`WSServerBridgeListenerOptions` | server 端：监听/接受连接，每条连接一个 `BridgePeer`（内部用 `NodeWebSocketBridge` 适配 `ws` 事件） |
| `src/wsClientPeer.ts` | `CreateWSClientPeer` | client 端：浏览器原生 `WebSocket`（内部用 `BrowserWebSocketBridge` 适配 DOM 事件） |
| `src/index.ts` | 上述全部（barrel） | 对外公开 API 入口 |

- **`BridgeSocket`**：`BridgePeer` 依赖的统一 socket 抽象接口——`send`/`close`/`on_message`/`on_close`/`on_connected`/`on_error`/`is_connected`。
  Node 'ws' 与浏览器 `WebSocket` 各自的事件风格差异由实现类（`NodeWebSocketBridge` / `BrowserWebSocketBridge`）适配，`BridgePeer` 只调用这套统一方法，不感知具体 socket 类型。

## 请求/响应模型（id 配对）

内部消息统一包成 `RawMessage`：`{ id, kind: 'request' | 'response', data?, error? }`。

- **`send(data): Promise<string>`**：先 `wait_for_connect()`，生成 `id`，发出 `request` envelope，
  把 `{resolve, reject, timer}` 存入 `pending` Map，等对端回同 `id` 的 `response` 时兑现 Promise。
- **`on_message(handler)`**：注册收到对端 `request` 时的处理函数（`MessageHandler = (data) => string | Promise<string>`）；
  handler 返回值/抛错会被自动包成 `response`（`error` 取 `err.message`）回给对端。
- **`_onmessage`（私有）**：解析 `RawMessage`；`response` → 兑现对应 pending；`request` → 调 handler 回 response；
  非法 JSON / 缺 `id` 直接忽略（不崩溃、不回复）。

> 未注册 handler 时收到 request，会回 `error: 'No message handler registered'`，而非静默丢弃。

## 连接生命周期

- **状态**：`connected` 布尔；`isconnect()` 查询。
- **监听**：`onConnect(cb)` / `onDisconnect(cb)` 注册多个监听器。
- **等待**：`wait_for_connect()` / `wait_for_disconnect()` 返回 Promise；已处于目标状态时立即 resolve，
  否则挂一个**一次性**监听器（触发后自摘除）。
- **`_handleConnect` / `_handleDisconnect`（私有）**：幂等切换状态并广播监听器。
- **断线清理（重要）**：`_handleDisconnect` 会 `clearTimeout` 并 `reject('Connection closed')` 所有 pending 请求、清空 Map，
  避免调用方永久挂起。**新增会挂起调用方的逻辑时，务必保证断线/超时都能兜底 reject。**
- **超时**：`PeerOptions.timeout`（默认 30000ms）；到时从 pending 删除并 `reject('Request timed out ...')`。

## BridgeSocket 抽象接入（setSocket 的核心）

`setSocket(socket, connectId)` 绑定 `BridgeSocket` 并接入事件。**不再用 `typeof` 守卫区分 Node/DOM**：
`BridgePeer` 只调用统一的 `BridgeSocket` 方法，运行时事件接入差异由各实现类负责适配。

- `socket.on_message(...)` / `on_close(...)` / `on_connected(...)`（对应 open）/ `on_error(...)` 接入四类事件；`message` 由实现类统一转成字符串喂给 `_onmessage`。
- `on_error` 回调在 `setSocket` 里落地为 `console.error('[bridge] socket 错误:', ...)`。
- 若绑定时 `socket.is_connected()` 为真，立即触发一次 `_handleConnect`（补发 open）。
- 两个实现类：`NodeWebSocketBridge`（`wsServerPeer.ts`，接 `ws` 的 `on(...)`）与 `BrowserWebSocketBridge`（`wsClientPeer.ts`，接浏览器 `addEventListener(...)`）。

> 新增底层 socket 类型时，实现 `BridgeSocket` 接口即可接入，无需改动 `BridgePeer`。

## connectId 的约定

- **client**：`CreateWSClientPeer` 用 `crypto.randomUUID()` 生成 `connectId`，作为 `new WebSocket(url, connectId)` 的**子协议**（第二参）传出。
- **server**：`WSServerBridgeListener` 从 `request.headers['sec-websocket-protocol']` 读回 `connectId`；
  **缺失/空则拒绝并 `socket.close()`**，不留悬挂连接。每条连接据此创建一个专属 `BridgePeer`。
- `getConnectId()` 在未设置时抛错；RPC 层用它作为接收端权威身份（报文体不携带 connectId，身份一律用 `peer.getConnectId()`）。

## WSServerBridgeListener 约定

- 构造时按 `url` 解析 host/port 建 `WebSocketServer`；若 `serverOptions.server`/`noServer` 存在，则**附着已有 http.Server 或交由调用者处理 upgrade**，此时不再自绑 host/port。
- `onConnection(listener)`：每条新连接建立时回调，参数是该连接专属的 `BridgePeer`（可对其 `on_message` / `send`）。
- `peerOptions`（除 `serverOptions` 外的 `PeerOptions`）透传给每个 `BridgePeer`。

## 常见坑

- **`BridgeRouter` 是进程级单例**：单进程内同时跑 server+client 时，只让一端注册 handler + dispatch，另一端仅 `send`，避免单例冲突（详见 `bridge-rpc`）。
- **不要在传输层 `JSON.parse` 业务体**：`peer.ts` 只解析 `RawMessage` 外壳；业务体的解析/校验在 RPC 层或调用方做。
- **对称优先**：新增能力加在 `BridgePeer` 基类，让 server/client 两端都受益，而非单端重复实现。
- **公有方法名是已发布契约**：`on_message`、`wait_for_connect` 等 snake_case 名不可擅自改名（破坏性变更）。
