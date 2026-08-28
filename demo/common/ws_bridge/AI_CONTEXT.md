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
`BridgeRouter`、`RemoteObject`、`RemoteObjectCreator`、`RpcHandler`。

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
- **`BridgeRouter` 进程级单例**（`getRouter()`）：单进程内只应一端注册 handler + `startDispatchMessage`，
  另一端仅 `send`，避免单例冲突（见 rpcExample）。
- **双向校验（谁接收不可信数据谁校验）**：server handler 在使用入站 params 前按需校验，client 调用方在使用 result 前按需校验。
  `BridgeRouter` 只在消费处直接检查 `Request`/`Response` 信封与内置远端对象参数，不提供校验器抽象。
- **错误策略**：入站可控错误回 `err.message`；非法 JSON / 缺字段的入站消息静默忽略、不崩溃；不把内部堆栈泄给对端。
- **类对象 RPC**：server 用 `registerRemoteObj(registerName, creator)` 注册工厂，client 用
  `createRemoteObj<T>(peer, registerName)` 获取代理；`registerName` 使用全局唯一的点分命名空间。对象实例按 `BridgePeer` 隔离并在断线时释放；代理仅暴露方法，
  `RemoteObject<T>` 递归保留嵌套对象的方法和参数类型。普通对象结果按 JSON 返回；需要把方法结果作为新远端对象继续调用时，协议保持原始对象返回类型，server 用 `BridgeRouter.returnRemoteObj(object)` 给原对象注入模块私有、不可枚举的 symbol 标记并原样返回，client 自动得到远端代理。类型层根据返回对象是否声明方法，把方法对象映射为 `RemoteObject<T>`，纯数据对象仍保留原类型。client 用
  `destroyRemoteObj(proxy)` 显式请求删除 server 实例；根代理与其成员路径代理共享引用状态，销毁任意一个后同根调用和重复销毁会在 client 侧拒绝。已经在 server
  开始执行的方法不会被取消，可能在 destroy 完成后才返回。server 的 `_remoteObjects` 以 peer 为弱键，但每条活跃连接对应的 `Map` 强引用所有远端实例；client 的 `_remoteObjectReferences` 以代理为弱键，只保存代理到共享引用状态的元数据，不负责通知 server 回收。方法返回的远端代理拥有独立 objectId，应单独 destroy；断线时 server 统一清理，异步调用在断线后完成也不能重新存入对象。

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
