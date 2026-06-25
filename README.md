# ask-ai-bridge-ts

对称式的 TypeScript WebSocket client/server bridge。server 与 client 共享同一套 `BridgePeer` 能力，双方都可以主动 `send()` 并 `await` 对端的回复（基于消息 id 配对的请求/响应模型），同时支持单向 `post()`。

`BridgePeer` 只负责字符串收发，分包/解包（消息名 + JSON 序列化）由调用者自行实现。

## 安装

```bash
npm install ask-ai-bridge-ts
```

> 依赖 [`ws`](https://www.npmjs.com/package/ws)。浏览器端使用原生 `WebSocket`。

## 快速开始

### 服务端

```ts
import { ServerBridge } from 'ask-ai-bridge-ts';

const server = new ServerBridge('ws://localhost:8080');

server.onConnect(() => console.log('客户端已连接'));
server.on_message((raw) => {
  const { name, body } = JSON.parse(raw);
  return JSON.stringify({ reply: `已收到: ${body.text}` });
});
```

### 客户端（Node）

```ts
import { ClientBridge } from 'ask-ai-bridge-ts';

const client = new ClientBridge('ws://localhost:8080');

await client.wait_for_connect();
const resRaw = await client.send(
  JSON.stringify({ name: 'hello', body: { text: '你好 server' } }),
);
console.log(JSON.parse(resRaw));
```

## API 概览

`BridgePeer`（`ServerBridge` / `ClientBridge` 的基类）核心方法：

| 方法 | 说明 |
| --- | --- |
| `send(data: string): Promise<string>` | 发送请求并等待对端回复 |
| `send1<T>(body): Promise<T>` | 自动 JSON 序列化/反序列化的 `send` |
| `post(raw: string): void` | 单向发送，不等待回复 |
| `on_message(handler)` | 注册收到对端请求时的处理函数 |
| `onConnect(cb)` / `onDisconnect(cb)` | 连接/断开事件监听 |
| `wait_for_connect()` / `wait_for_disconnect()` | 等待连接/断开 |
| `isconnect(): boolean` | 当前是否已连接 |
| `close(): Promise<void>` | 关闭连接 |

构造参数支持 `timeout`（请求超时，默认 30000ms）。

## 本地开发

```bash
npm install
npm run build      # 编译到 dist/
npm run example    # 运行端到端示例
```

## License

[MIT](./LICENSE)
