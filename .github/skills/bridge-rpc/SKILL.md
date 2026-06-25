---
name: bridge-rpc
description: >
  结构化 RPC 层（src/rpc.ts）的设计与约定：在 BridgePeer 之上提供 method 路由 + 运行时校验的
  类型化调用。适用于：新增/修改 RPC 方法、使用 BridgeRouter 注册 handler、用 send<TResult,TParams>
  发起调用、编写协议伴生对象校验器（Validator<T> 的 asserts 断言签名）、Response 信封与受控错误策略、
  handler 首参 peer、BridgeRouter 进程级单例约束。含参数/返回值双向校验与错误文案策略。
---

# 结构化 RPC 层：BridgeRouter / send / Validator

RPC 层（`src/rpc.ts`）在传输基类 `BridgePeer`（见 `bridge-core` 技能）之上，提供**按 method 路由 + 运行时校验**的
类型化调用。调用方不再手写 `JSON.parse` / 分发 / 序列化；未受信入参先经校验器 `validate` 收窄，非法即回受控错误文案。

## 核心概念

| 导出（`src/rpc.ts`） | 角色 |
| --- | --- |
| `send<TResult, TParams>(caller, method, params?)` | **发起方**：类型化出站调用，自动解包 `Response`，失败 `throw` |
| `BridgeRouter`（`GetRouter()` 单例） | **处理方**：注册 handler、接管入站消息、dispatch |
| `Request<T>` / `Response<T>` | 线上消息形状：`{ method, params, connectId }` / `{ ok:true,data } \| { ok:false,error }` |
| `Validator<T>` | 运行时校验器接口：`validate(value): asserts value is T`（协议伴生对象实现） |

## 发起调用：send

```ts
// 带参带返回：返回 TResult，失败 throw（Response.error 文案）
const res = await send<AddResult, AddParams>(peer, 'math.add', { a: 2, b: 40 });
// 无参无返回：省略第三个实参；TParams/TResult 用 void
await send(peer, 'sys.ping');
```

- 内部：取 `caller.getConnectId()`，`caller.send1<Response<TResult>>({ method, params, connectId })`，`ok` 则返回 `data`，否则 `throw new Error(error)`。
- **`peer` 从哪来**：调用方持有的 `BridgePeer`（client 端是 `ClientBridge`，server 端是某条连接的 `ServerBridge`）。

## 注册 handler：BridgeRouter

```ts
const router = BridgeRouter.GetRouter();               // 进程级单例
router.register_message_handler<AddParams, AddResult>(
  'math.add',
  (peer, { a, b }) => ({ sum: a + b }),                // handler 首参恒为 peer
  AddParams,   // 入参校验器（无参传 null）
  AddResult,   // 返回值校验器（无返回传 null）
);
// 让某条连接的入站消息交给 router 分发：
listener.onConnection((conn) => router.start_dispatch_message(conn));
```

- **handler 首参恒为 `peer`**：`(peer, params) => result`。`peer` 是消息实际到达的那个连接（`BridgePeer`），
  需要来源标识时用 `peer.getConnectId()`。暂时用不到就命名 `_peer`（仓库开 `noUnusedParameters`）。
- **`register_message_handler` 签名**：`(method, handle, paramsValidator, resultValidator)`。
  用 `NoInfer<T>` 锚定校验器的泛型，避免调用点放宽类型。无参/无返回的对应校验器传 `null`。
- **`start_dispatch_message(peer)`**：把 `peer.on_message` 接到 `router.dispatch`，返回 `JSON.stringify(Response)`。
- **重复注册同名 method 会抛错**（`重复注册的方法: <method>`）；method 名进程内唯一。

## dispatch 的校验与错误策略（重要）

`dispatch` 顺序：解析 → 查 handler → 校验 params → 执行 handler → 校验 result → 回 `Response`。错误文案分两类：

- **入站可控错误（回具体文案）**：JSON 非法 / 非对象 / 缺 `method` / 未知 method → `未知的方法`；
  **params 校验失败或 handler 抛错** → 回 `err.message`（受控中文文案），同时 `console.error` 记真实错误供排查。
- **内部 bug（回通用文案，不泄露）**：**result 校验失败**（server 自产返回值畸形）→ 只回固定 `请求处理失败`，
  真实原因仅记日志，**不把「返回格式无效」等内部细节泄露给调用方**。

> 断言函数（`asserts`）调用要求引用链上有显式类型注解：`dispatch` 里先把 validator 绑定到显式类型局部常量（`const paramsValidator: Validator<unknown> = entry.paramsValidator`）再调 `.validate(...)`。仿写时保留这一写法。

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
3. 处理方：`router.register_message_handler<Params, Result>(METHOD, (peer, params) => ..., ParamsValidator, ResultValidator)`。
4. 发起方：`await send<Result, Params>(peer, METHOD, params)`。
5. 若这些类型/校验器需对外复用，在 `src/index.ts` barrel 登记导出。

## 单例约束（常见坑）

`BridgeRouter` 是**进程级单例**（`GetRouter()`）。单进程内同时跑 server 与 client（如 `rpcExample.ts`）时，
**只让 server 端注册 handler 并 `start_dispatch_message`，client 端仅用 `send` 主动调用**，避免两端共享同一 router 造成注册冲突。
真实分布式部署（server、client 各自进程）无此问题。
