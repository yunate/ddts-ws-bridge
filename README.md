# ddts-ws-bridge

对称式的 TypeScript WebSocket client/server bridge。server 与 client 共享同一套 `BridgePeer` 能力，双方都可以主动 `send()` 并 `await` 对端的回复（基于消息 id 配对的请求/响应模型）。

`BridgePeer` 只负责字符串收发，分包/解包（消息名 + JSON 序列化）由调用者自行实现。

## 安装

```bash
npm install ddts-ws-bridge
```

> 依赖 [`ws`](https://www.npmjs.com/package/ws)。浏览器端使用原生 `WebSocket`。

## 快速开始

### 服务端

```ts
import { WSServerBridgeListener } from 'ddts-ws-bridge';

const listener = new WSServerBridgeListener('ws://localhost:8080');

listener.onConnection((peer) => {
  peer.onConnect(() => console.log('客户端已连接'));
  peer.onMessage((raw) => {
    const { name, body } = JSON.parse(raw);
    return JSON.stringify({ reply: `已收到: ${body.text}` });
  });
});
```

### 客户端（浏览器）

```ts
import { CreateWSClientPeer } from 'ddts-ws-bridge';

const client = CreateWSClientPeer('ws://localhost:8080');

await client.waitForConnect();
const resRaw = await client.send(
  JSON.stringify({ name: 'hello', body: { text: '你好 server' } }),
);
console.log(JSON.parse(resRaw));
```

## API 概览

`BridgePeer`（server 端由 `WSServerBridgeListener` 创建、client 端由 `CreateWSClientPeer` 创建）核心方法：

| 方法 | 说明 |
| --- | --- |
| `send(data: string): Promise<string>` | 发送请求并等待对端回复 |
| `onMessage(handler)` | 注册收到对端请求时的处理函数 |
| `onConnect(cb)` / `onDisconnect(cb)` | 连接/断开事件监听；返回 `() => void` 取消本次注册，可重复调用 |
| `waitForConnect(timeout?)` / `waitForDisconnect()` | 等待连接/断开 |
| `isConnected(): boolean` | 当前是否已连接 |
| `close(): Promise<void>` | 关闭连接 |

同一回调的多次注册各自独立取消，不影响其他监听或 `waitForConnect` / `waitForDisconnect` 的临时监听。注册时不立即通知当前状态，仅在后续连接/断开状态切换时调用。

构造参数支持 `timeout`（请求超时，默认 30000ms）。

## 类对象 RPC

服务端可注册对象工厂，客户端按全局唯一的 `registerName` 创建远端对象代理。注册名称推荐使用点分命名空间，例如 `service.counter`。每个连接创建的对象彼此隔离，并在连接断开后释放。

```ts
interface Counter {
  add(value: number): number;
  getValue(): number;
}

class CounterService implements Counter {
  private value = 0;

  add(value: number): number {
    this.value += value;
    return this.value;
  }

  getValue(): number {
    return this.value;
  }
}

// server
const router = BridgeRouter.getRouter();
router.registerRemoteObj('service.counter', () => new CounterService());
listener.onConnection((peer) => router.startDispatchMessage(peer));

// client
const counter = await BridgeRouter.createRemoteObj<Counter>(client, 'service.counter');
console.log(await counter.add(2));
await BridgeRouter.destroyRemoteObj(counter);
```

远端方法总是异步执行。`createRemoteObj<T>` 返回的 `RemoteObject<T>` 会保留方法参数类型，并把普通方法结果自动映射为 `Promise<Awaited<TResult>>`。对象字段可以继续访问其嵌套方法。普通对象返回值按 JSON 传输；若方法需要返回一个可继续调用的远端对象，协议仍声明原始对象类型，服务端通过 `BridgeRouter.returnRemoteObj(object)` 给原对象注入非序列化标记并原样返回：

```ts
interface Son {
  func1(): void;
}

interface Parent {
  getSon(): Son;
}

// server
getSon(): Son {
  return BridgeRouter.returnRemoteObj(this.son);
}

// client
const son = await parent.getSon();
await son.func1();
await BridgeRouter.destroyRemoteObj(son);
```

### 顶层参数按引用传递

普通远端对象的方法也支持 `returnRemoteObj(localObject)`：对象留在调用端，接收端得到经同一连接反向调用的代理。两端都必须对各自的 peer 调用 `router.startDispatchMessage(peer)`；同一进程可共用单例 router，只需保证注册名称唯一。

`RemoteObject<T>` 仍保留原方法参数类型。协议可显式使用 `ICallback | RemoteObject<ICallback>`，区分本地同步实现与远端异步代理；不要把接收端代理当成同步 `ICallback`。接收端在边界校验方法形状，在 `await` 后校验结果，而不是从 TypeScript interface 推断运行时类型。

协议和 B 端实现：

```ts
import { BridgeRouter, type RemoteObject } from 'ddts-ws-bridge';

interface ICallback {
  add(value: number): number;
}
interface CallbackParent {
  onCallback(callback: ICallback | RemoteObject<ICallback>): Promise<number>;
}

function validateCallback(value: unknown): asserts value is { add(value: number): unknown } {
  if (value === null || typeof value !== 'object') throw new Error('非法 callback');
  const method: unknown = Reflect.get(value, 'add');
  if (typeof method !== 'function') throw new Error('callback 缺少 add 方法');
}

class ParentService implements CallbackParent {
  async onCallback(callback: unknown): Promise<number> {
    validateCallback(callback);
    const result: unknown = await callback.add(2);
    if (typeof result !== 'number') throw new Error('callback 结果必须是数字');
    return result;
  }
}

const router = BridgeRouter.getRouter();
router.registerRemoteObj('service.callbackParent', () => new ParentService());
router.startDispatchMessage(serverPeer);
```

A 端调用（`client` 是已连接的 peer）：

```ts
BridgeRouter.getRouter().startDispatchMessage(client);
const parent = await BridgeRouter.createRemoteObj<CallbackParent>(client, 'service.callbackParent');
const localCallback = {
  value: 0,
  add(amount: number): number {
    this.value += amount;
    return this.value;
  },
};
console.log(await parent.onCallback(BridgeRouter.returnRemoteObj(localCallback))); // 2
console.log(localCallback.value); // 2，方法的 this 仍指向本地对象
```

- 只识别方法的顶层参数标记；嵌套对象/数组中的标记仍按 JSON 数据处理，不递归导出。普通 `BridgeRouter.send` 和 `createRemoteObj` 的入参不支持引用传递，不支持直接函数引用。只能导出本地实际实现对象，已知远端代理（包括成员代理）传参或再次标记会被受控拒绝，不支持代理转发/传回。
- 未标记参数保持 JSON 按值行为，包括顶层 `undefined`、function、symbol 转为 `null`。普通含 `kind` / `objectId` 的业务对象不会被误判为引用。
- 接收端可以保留 callback，在初次 RPC 返回后继续调用；不再使用时由接收端 `await BridgeRouter.destroyRemoteObj(callbackProxy)`。每次导出产生独立句柄，不随 parent 级联销毁，不自动调用业务 `dispose`。断线清理导出表，`FinalizationRegistry` 仅尽力回收，不能替代显式销毁。
- 参数编码/序列化失败且尚未调用 `peer.send` 时，只回滚本次新增的导出。进入发送后，超时、业务错误或其他发送失败不能证明未交付，不自动回滚；接收端可能已经保留引用，须按上述生命周期释放。
- **内部协议兼容性**：远端方法调用的每个顶层参数统一包装为 `{ kind: 'value', value }` 或 `{ kind: 'remoteObject', objectId }`；双方必须同时支持此格式，不能与旧版远端方法调用格式混用。普通 RPC 和对象工厂入参格式不变。

不再使用任何远端代理时调用 `destroyRemoteObj()`，服务端会删除对应实例，代理后续调用会在本地被拒绝；已经在服务端开始执行的方法不会被取消。嵌套成员代理与其根代理共享同一个远端实例，销毁任意一个都会使同根代理全部失效。由方法返回的远端代理拥有独立引用，需要单独销毁。连接断开时服务端仍会清理该连接的全部对象。

## 本地开发

```bash
npm install
npm run build      # 编译到 dist/
npm run example    # 运行端到端示例
```

## License

[MIT](./LICENSE)
