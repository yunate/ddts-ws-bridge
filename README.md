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
| `onConnect(cb)` / `onDisconnect(cb)` | 连接/断开事件监听 |
| `waitForConnect(timeout?)` / `waitForDisconnect()` | 等待连接/断开 |
| `isConnected(): boolean` | 当前是否已连接 |
| `close(): Promise<void>` | 关闭连接 |

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

不再使用任何远端代理时调用 `destroyRemoteObj()`，服务端会删除对应实例，代理后续调用会在本地被拒绝；已经在服务端开始执行的方法不会被取消。嵌套成员代理与其根代理共享同一个远端实例，销毁任意一个都会使同根代理全部失效。由方法返回的远端代理拥有独立引用，需要单独销毁。连接断开时服务端仍会清理该连接的全部对象。

## 本地开发

```bash
npm install
npm run build      # 编译到 dist/
npm run example    # 运行端到端示例
```

## License

[MIT](./LICENSE)
