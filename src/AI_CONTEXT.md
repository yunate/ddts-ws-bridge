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
`MessageHandler`、`MessageHandlerResult`、`WSServerBridgeListener`、`WSServerBridgeListenerOptions`、`CreateWSClientPeer`、
`BridgeRouter`、`RemoteObject`、`RemoteObjectCreator`、`RpcHandler`。

## 关键设计与语义

- **id 配对请求/响应模型**：`send(data)` 包装成 `RawMessage{ id, kind:'request', data }` 发出，
  对端 handler 处理后回 `kind:'response'`，按 id 匹配 pending Promise 完成。
- **发送后处理**: MessageHandler 接收 data, 同步/异步统一返回 MessageHandlerResult `{ data: string, callback? }`, 不再直接返回字符串. socket.send 正常返回后调用并等待可选 callback, 无回调注册或定时器; callback 不上网. 不代表对端已收到或底层异步发送成功. handler/提交响应失败时不执行 callback, 提交及 callback 异常记日志, 后者不修改已发响应.
- **`send` 语义（单一 timeout 约束整个过程）**：未连接时先 `await waitForConnect(timeout)`；连接就绪后
  剩余时间 `remaining = timeout - 已耗时` 作为请求超时。即一次 send 的「等连接 + 等回复」总耗时受同一个
  `timeout`（`PeerOptions.timeout`，默认 30000ms）约束，任一阶段超时即 reject。
- **`waitForConnect(timeout?)`**：无参一直等到连接；传参在超时后 reject（`Wait for connect timed out`）。
  `waitForDisconnect()` 无参，等到断开。
- **连接事件**：`onConnect(listener)` / `onDisconnect(listener)` 返回 `() => void`，只取消本次注册且可重复调用；
  同一回调重复注册各自独立。注册不立即通知当前状态，仅在状态切换时派发；取消不影响其他监听或 wait 的一次性监听。
- **断线/超时清理**：断线时拒绝所有 pending（`Connection closed`）并清空；send 超时删除对应 pending。
- **connectId**：client 生成 UUID，经 `sec-websocket-protocol` 子协议头传给 server；server 侧用 `ws` 的
  `handleProtocols` 原样回选第一个子协议（隐含假设 client 仅发单个 connectId 子协议，故第一个即该 connectId），
  使握手响应带上 `Sec-WebSocket-Protocol` 头（符合 RFC6455 对称握手，
  避免严格 client 因 server 未回选而中断）；缺失 connectId 的连接直接关闭，不留悬挂。`getConnectId()` 读取。
- **`BridgeRouter` 进程级单例**（`getRouter()`）：注册名称在进程内唯一；同进程双端可共用 router，
  双向调用须为两端各自的 peer 启用 `startDispatchMessage`（见 rpcExample）。
- **双向校验（谁接收不可信数据谁校验）**：server handler 在使用入站 params 前按需校验，client 调用方在使用 result 前按需校验。
  `BridgeRouter` 只在消费处直接检查 `Request`/`Response` 信封与内置远端对象参数，不提供校验器抽象。
- **RPC 信封**: `RawMessage` 为 `{ type: 'request', data: Request }` 或 `{ type: 'response', data: Response }`.
  `Request { id, method, params }`, `Response { id, type: 'ack' | 'data', data?, error? }`.
  parseRawMessage 只解析一次 JSON, 校验外层 type 后调用 parseRequest/parseResponse 校验 data; ACK 也包装为 response.
  均为统一 interface, 对应 parse 校验非空 id, 字段类型及响应类型. error 存在表示失败, 不使用 ok 联合类型.
  请求端生成 id, 发出 Request 前登记连接级 pending call, 收到 ACK 后继续等 data; 收到 data 先回复 ACK, 提交后通过返回的 callback 按 id 完成等待.
  请求端和执行端都通过 peer.send 发送, 都接收并校验同 id 的 ack; 共用 `_sendAndWaitAck`.
  执行端通过返回的 callback 在 ACK 提交后原地执行 handler, 无定时器调度; 异常及序列化错误通过 data.error 回传.
  双方在使用 RPC 前显式调用一次 startDispatchMessage, 该入口创建等待表; 无自动绑定或重复初始化保护.
  传输超时只限制 ACK, 业务结果不限时等待. 发送失败或请求 ACK 异常时清理对应等待, 断线拒绝全部 pending call.
  迟到或重复 data 仍回 ACK, 不重复完成调用. 结果 ACK 失败记日志, 不撤销已交付结果, 不自动重试或取消执行.
- **错误策略**：入站可控错误回 `err.message`；非法 JSON / 缺字段的入站消息静默忽略、不崩溃；不把内部堆栈泄给对端。
- **类对象 RPC**：server 用 `registerRemoteObj(registerName, creator)` 注册工厂，client 用
  `createRemoteObj<T>(peer, registerName)` 获取代理；`registerName` 使用全局唯一的点分命名空间。对象实例按 `BridgePeer` 隔离并在断线时释放；代理仅暴露方法，
  `RemoteObject<T>` 递归保留嵌套对象的方法和参数类型。普通对象结果按 JSON 返回；需要把方法结果作为新远端对象继续调用时，协议保持原始对象返回类型，server 用 `BridgeRouter.returnRemoteObj(object)` 给原对象注入模块私有、不可枚举的 symbol 标记并原样返回，client 自动得到远端代理。类型层根据返回对象是否声明方法，把方法对象映射为 `RemoteObject<T>`，纯数据对象仍保留原类型。client 用
  `destroyRemoteObj(proxy)` 显式请求删除 server 实例；根代理与其成员路径代理共享引用状态，销毁任意一个后同根调用和重复销毁会在 client 侧拒绝。已经在 server
  开始执行的方法不会被取消，可能在 destroy 完成后才返回。server 的 `_remoteObjects` 以 peer 为弱键，但每条活跃连接对应的 `Map` 强引用所有远端实例；client 的 `_remoteObjectReferences` 以代理为弱键，只保存代理到共享引用状态的元数据，不负责通知 server 回收。方法返回的远端代理拥有独立 objectId，应单独 destroy；断线时 server 统一清理，异步调用在断线后完成也不能重新存入对象。
- **方法参数引用**：普通远端对象方法的顶层参数复用 `returnRemoteObj(localObject)` 标记；发送端按 peer
  存储本地实现对象，接收端直接以同一 peer 和 objectId 创建反向代理，不查询自己的导出表，也不发反向注册请求。
  所有顶层参数统一包装为 `value` / `remoteObject` 描述符并先整体校验；这要求两端支持新的内部 call 格式。
  普通值先按原 params 数组归一化 JSON，保留 undefined/function/symbol → null 及 toJSON 的数组键语义，避免业务数据的 kind/objectId 与描述符冲突。
  `RemoteObject<T>` 参数类型不变，协议示例用本地同步接口与 `RemoteObject<接口>` 的联合表达两端差异；
  接收端只守卫可调用形状并在 await 后校验结果（代理不支持用 `in` 检查方法）。无新增类型导出。
- **引用生命周期与边界**：参数导出是独立句柄，接收端可保留并显式 destroy；不随 parent 级联释放、不调用业务 dispose，
  断线清理导出表，FinalizationRegistry 仅尽力回收。仅在进入 peer.send 之前的编码/序列化失败中回滚本次导出；
  发送后超时/业务报错不能证明未交付，不自动回滚。已有根代理可由远端对象方法 `returnRemoteObj(proxy)` 再导出；根 get 仅透传本模块 marker，其余 symbol 与 then 仍返回 undefined，满足标记后的 Proxy 不变量。
  `returnRemoteObj` 定义 marker 后立即复用 object-only 标记守卫验证；失败同步抛错，Proxy trap / 不变量异常原样传播，标记属性描述符不变。
  已验证 A-B-C 单段方法的普通 JSON 参数与普通值结果；出口句柄独立，销毁不级联源代理。多跳 callback、引用返回及嵌套函数路径不保证支持，不代表全面透明转发。
  不递归处理嵌套参数、不支持直接函数引用，也不扩展普通 send / createRemoteObj 入参；方法返回对象引用语义不变。
- **远端成员读取**：拦截 `constructor` / `__proto__` / `prototype` 后使用 `Reflect.get`，允许 getter 与原型成员；
  中间路径仍仅接受非 null 对象，不接受函数。

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
