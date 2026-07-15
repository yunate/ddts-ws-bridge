---
name: bridge-rpc
description: >
  结构化 RPC 层（src/rpc.ts）的设计与约定：在 BridgePeer 之上提供 method 路由 + 运行时校验的
  类型化调用。适用于：新增/修改 RPC 方法、使用 BridgeRouter 注册 handler、用 BridgeRouter.send<TResult,TParams>
  发起调用、编写协议伴生对象校验器（Validator<T> 的 asserts 断言签名）、Response 信封与受控错误策略、
  handler 首参 peer、BridgeRouter 进程级单例约束。含参数/返回值双向校验与错误文案策略。
---

# 结构化 RPC 层：BridgeRouter / Validator

RPC 层（`src/rpc.ts`）在传输基类 `BridgePeer`（见 `bridge-core` 技能）之上，提供**按 method 路由 + 运行时校验**的
类型化调用。调用方不再手写 `JSON.parse` / 分发 / 序列化；未受信入参先经校验器 `validate` 收窄，非法即回受控错误文案。

## 核心概念

| 导出（`src/rpc.ts`） | 角色 |
| --- | --- |
| `BridgeRouter.send<TResult, TParams>(caller, method, params, resultValidator)` | **发起方**：类型化出站调用，自动解包 `Response`，用 `resultValidator` 校验对端返回，失败 `throw` |
| `BridgeRouter`（`GetRouter()` 单例） | **处理方**：注册 handler、接管入站消息、dispatch |
| `Request<T>` / `Response<T>` | 线上消息形状：`{ method, params }` / `{ ok:true,data } \| { ok:false,error }` |
| `Validator<T>` | 运行时校验器接口：`validate(value): asserts value is T`（协议伴生对象实现） |

## 发起调用：BridgeRouter.send

```ts
// 带参带返回：resultValidator 传结果校验器（恒在最后一个实参），校验通过后返回 TResult，失败 throw（Response.error 文案或 result 校验失败）
const res = await BridgeRouter.send<AddResult, AddParams>(peer, 'math.add', { a: 2, b: 40 }, AddResult);
// 无参无返回：params 显式传 null，resultValidator 传 null；TParams/TResult 用 void
await BridgeRouter.send(peer, 'sys.ping', null, null);
```

- 参数顺序：`params` 恒为**显式实参**（`TParams` 为 void 时显式传 `null`），`resultValidator` 恒为**最后一个实参**，与 `register_message_handler`「validator 作显式参数、void 时传 null」风格对称。
- 内部：`caller.send(JSON.stringify(request))` 收发字符串，再 `JSON.parse` 为 `Response`；先用 `Response` 校验器校验信封结构，`ok` 则（传了 `resultValidator` 时）用它校验并收窗 `data` 后返回，否则 `throw new Error(error)`。报文体不携带 connectId；接收端身份一律用消息实际到达的那条连接 `peer.getConnectId()`。
- **result 校验在发起端**：遵循「谁接收不可信数据谁校验」——对端返回的 `data` 对调用方而言是未受信网络数据，故由 `send` 用调用方传入的 `resultValidator` 校验（而非在 `dispatch` 中自校）。
- **`peer` 从哪来**：调用方持有的 `BridgePeer`（client 端由 `CreateWSClientPeer` 创建，server 端是某条连接对应的 `BridgePeer`，由 `WSServerBridgeListener` 的 `onConnection` 提供）。

## 注册 handler：BridgeRouter

```ts
const router = BridgeRouter.GetRouter();               // 进程级单例
router.register_message_handler<AddParams, AddResult>(
  'math.add',
  (peer, { a, b }) => ({ sum: a + b }),                // handler 首参恒为 peer
  AddParams,   // 入参校验器（无参传 null）
);
// 让某条连接的入站消息交给 router 分发：
listener.onConnection((conn) => router.start_dispatch_message(conn));
```

- **handler 首参恒为 `peer`**：`(peer, params) => result`。`peer` 是消息实际到达的那个连接（`BridgePeer`），
  需要来源标识时用 `peer.getConnectId()`。暂时用不到就命名 `_peer`（仓库开 `noUnusedParameters`）。
- **`register_message_handler` 签名**：`(method, handle, paramsValidator)`。只负责**入参**校验；
  返回值校验已移至调用端 `BridgeRouter.send` 的 `resultValidator`。用 `NoInfer<T>` 锤定校验器的泛型，避免调用点放宽类型。无参的 `paramsValidator` 传 `null`。
- **`start_dispatch_message(peer)`**：把 `peer.on_message` 接到 `router.dispatch`，返回 `JSON.stringify(Response)`。
- **重复注册同名 method 会抛错**（`重复注册的方法: <method>`）；method 名进程内唯一。

## dispatch 的校验与错误策略（重要）

`dispatch` 顺序：解析 → 查 handler → 校验 params → 执行 handler → 回 `Response`（不再自校 result）。错误文案：

- **入站可控错误（回具体文案）**：JSON 非法 / 非对象 / 缺 `method` / 未知 method → `未知的方法`；
  **params 校验失败或 handler 抛错** → 回 `err.message`（受控中文文案），同时 `console.error` 记真实错误供排查。
- **result 校验在发起端**：server 不再自校返回值；对端返回的 `data` 畑形/不符合 `resultValidator` 时，由调用方 `send` 的
  `resultValidator.validate` 抛错，reject 给调用方。send 属调用方本地异常，不涉及向对端回文案。

> 断言函数（`asserts`）调用要求引用链上有显式类型注解：`dispatch` 里先把 validator 绑定到显式类型局部常量（`const paramsValidator: Validator<unknown> = entry.paramsValidator`）再调 `.validate(...)`；`send` 里同理先 `const rv: Validator<TResult> = resultValidator` 再调 `rv.validate(...)`。仿写时保留这一写法。

## 校验器：协议伴生对象（Validator<T>）

每个方法的参数/返回类型配一个**同名伴生对象**实现 `Validator<T>`，用**断言签名**在运行时校验未受信 `unknown` 并收窄类型：

```ts
interface AddParams { a: number; b: number; }
const AddParams: Validator<AddParams> = {
  validate(value: unknown): asserts value is AddParams {
    Validate.ensureRecord(value);
    Validate.ensureNumber(value.a, 'a 必须是数字');
    Validate.ensureNumber(value.b, 'b 必须是数字');
  },
};
```

- 校验原语收拢在 `Validate` 工具类（示例见 `src/example/validator.ts`）：`ensureRecord` / `ensureString` /
  `ensureNumber` / `ensureNonBlankString` / `ensureIntInRange` / `ensureArray` 等，**失败抛 Error（受控文案）、通过后 `asserts` 收窄**。
- `Validate.is(assertFn, value)`：把任意 `ensure*` 断言派生为「非抛错布尔」，供「非法即过滤/幂等」场景复用同一份规则，避免逻辑漂移。
- **命名区分**：`Validate`（校验原语工具类）刻意区别于 `Validator<T>`（rpc 的校验器接口），二者不同概念，勿混。

## 新增一个 RPC 方法（步骤）

1. 定 `METHOD` 常量（点分域名，如 `'chat.send'`）与 `Params`/`Result` 接口。
2. 为 `Params`/`Result` 各写一个 `Validator<T>` 伴生对象（复用 `Validate.*` 原语）；无参/无返回则对应传 `null`。
3. 处理方：`router.register_message_handler<Params, Result>(METHOD, (peer, params) => ..., ParamsValidator)`（只传入参校验器）。
4. 发起方：`await BridgeRouter.send<Result, Params>(peer, METHOD, params, ResultValidator)`（resultValidator 恒在最后；无返回传 null）。
5. 若这些类型/校验器需对外复用，在 `src/index.ts` barrel 登记导出。

## 单例约束（常见坑）

`BridgeRouter` 是**进程级单例**（`GetRouter()`）。单进程内同时跑 server 与 client（如 `rpcExample.ts`）时，
**只让 server 端注册 handler 并 `start_dispatch_message`，client 端仅用 `BridgeRouter.send` 主动调用**，避免两端共享同一 router 造成注册冲突。
真实分布式部署（server、client 各自进程）无此问题。
