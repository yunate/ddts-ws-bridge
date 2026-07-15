# src/ — 核心库现状快照

`ddts-ws-bridge` 的库源码。对称式 TypeScript WebSocket client/server bridge：server 与 client
共享同一套 `BridgePeer` 能力，双方都能主动 `send()` 并 `await` 对端回复。兼容 Node（`ws`）与
浏览器原生 `WebSocket`。

## 分层

- **传输层 [`peer.ts`](peer.ts)**：`BridgePeer` 只做字符串收发 + 基于消息 id 的请求/响应配对，
  不感知 method / 业务语义。`BridgeSocket` 是统一的 socket 抽象接口，两端各有适配实现：
  - [`wsServerPeer.ts`](wsServerPeer.ts)：`WSServerBridgeListener` + `NodeWebSocketBridge`（Node `ws`）。
  - [`wsClientPeer.ts`](wsClientPeer.ts)：`CreateWSClientPeer` + `BrowserWebSocketBridge`（浏览器 `WebSocket`）。
- **结构化层 [`rpc.ts`](rpc.ts)**：`BridgeRouter` 在 `BridgePeer` 之上提供 method 路由 + 运行时校验的
  类型化调用。业务分发只在这里，不泄漏进传输层。

公开 API 由 [`index.ts`](index.ts) barrel 导出：`BridgePeer`、`BridgeSocket`、`PeerOptions`、
`MessageHandler`、`WSServerBridgeListener`、`WSServerBridgeListenerOptions`、`CreateWSClientPeer`、
`BridgeRouter`、`Validator`。

## 关键设计与语义

- **id 配对请求/响应模型**：`send(data)` 包装成 `RawMessage{ id, kind:'request', data }` 发出，
  对端 handler 处理后回 `kind:'response'`，按 id 匹配 pending Promise 完成。
- **`send` 语义（单一 timeout 约束整个过程）**：未连接时先 `await waitForConnect(timeout)`；连接就绪后
  剩余时间 `remaining = timeout - 已耗时` 作为请求超时。即一次 send 的「等连接 + 等回复」总耗时受同一个
  `timeout`（`PeerOptions.timeout`，默认 30000ms）约束，任一阶段超时即 reject。
- **`waitForConnect(timeout?)`**：无参一直等到连接；传参在超时后 reject（`Wait for connect timed out`）。
  `waitForDisconnect()` 无参，等到断开。
- **断线/超时清理**：断线时拒绝所有 pending（`Connection closed`）并清空；send 超时删除对应 pending。
- **connectId**：client 生成 UUID，经 `sec-websocket-protocol` 子协议头传给 server；server 侧用 `ws` 的
  `handleProtocols` 原样回选第一个子协议（隐含假设 client 仅发单个 connectId 子协议，故第一个即该 connectId），
  使握手响应带上 `Sec-WebSocket-Protocol` 头（符合 RFC6455 对称握手，
  避免严格 client 因 server 未回选而中断）；缺失 connectId 的连接直接关闭，不留悬挂。`getConnectId()` 读取。
- **`BridgeRouter` 进程级单例**（`GetRouter()`）：单进程内只应一端注册 handler + `startDispatchMessage`，
  另一端仅 `send`，避免单例冲突（见 rpcExample）。
- **双向校验（谁接收不可信数据谁校验）**：入站 params 由 dispatch 端用 `Validator` 校验；对端返回的 result
  由发起端 `BridgeRouter.send` 用传入的 `resultValidator` 校验。`Request`/`Response` 信封本身也在边界校验。
- **错误策略**：入站可控错误回 `err.message`；非法 JSON / 缺字段的入站消息静默忽略、不崩溃；不把内部堆栈泄给对端。

## 命名约定（现状）

- 公开方法/导出统一 **camelCase**：`onMessage`、`waitForConnect`、`waitForDisconnect`、`isConnected`、
  `registerMessageHandler`、`startDispatchMessage`、`onConnect`/`onDisconnect`/`setSocket`/`getConnectId`/
  `send`/`close`；`BridgeSocket` 接口为 `onMessage`/`onClose`/`onConnected`/`onError`/`isConnected`。
  （历史 snake_case 名已废弃，属破坏性变更。）
- RPC method 名字符串（如 `'math.add'`、`'sys.ping'`）是数据不是标识符，不受命名约定约束。
- 私有成员 `private` + `_` 前缀（禁 `#`）：如 `_pending`/`_handler`/`_connected`/`_timeout`/
  `_connectListeners`/`_disconnectListeners`，私有方法 `_onMessage`/`_post`/`_handleConnect` 等。
- `protected socket` / `protected connectId` 保持无 `_` 前缀（`_` 前缀约定针对 private；这两者是面向潜在子类的
  protected 契约，目前无子类）。

## 约定与边界

- 新增能力优先加在 `BridgePeer` 基类，让 server/client 两端对称受益，而非单端重复。
- 传输层负载是裸字符串，分包/解包（消息名 + JSON）由调用者或 `rpc.ts` 负责，`peer.ts` 不介入。
- 公开 API 是对外契约；改动须同步 [`index.ts`](index.ts) 与根 `README.md`，并遵循语义化版本。
- 示例见 [`example/example.ts`](example/example.ts)（裸字符串）与 [`example/rpcExample.ts`](example/rpcExample.ts)（RPC）。
