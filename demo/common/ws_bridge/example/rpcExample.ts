/**
 * 结构化消息（RPC）示例：在 Node 中同时跑 server 与 client（1:1）。
 * 运行： npm run rpc-example
 *
 * 对比 example.ts（裸字符串收发）：这里用 rpc.ts 提供的结构化层——
 *   - 服务端：BridgeRouter 按 method 注册 handler，handler 在使用 params 前按需校验，startDispatchMessage 接管入站消息；
 *   - 客户端：BridgeRouter.send(peer, method, ...params) 发起调用并自动解包 Response，
 *     调用方在使用未受信的 result 前按需校验。
 * 双向校验遵循「谁接收不可信数据谁校验」：params 由 server handler 校验，result 由 client 调用方校验。
 *
 * 注意：BridgeRouter 是进程级单例。本 demo 在同一进程内跑 server 与 client，
 * 因此只让服务端注册 handler 并 dispatch；客户端仅用 send 主动调用，避免单例冲突。
 */
import { WSServerBridgeListener } from '../wsServerPeer';
import { CreateWSClientPeer } from '../wsClientPeer';
import { BridgeRouter } from '../rpc';
import { Validate } from './validator';

// ---- 方法契约：method 名 + 参数/返回类型 + 运行时断言函数 ----
const ADD_METHOD = 'math.add';
function validateAddParams(params: unknown[]): asserts params is [number, number] {
  if (params.length !== 2) throw new Error('math.add 必须传入两个参数');
  Validate.ensureNumber(params[0], 'a 必须是数字');
  Validate.ensureNumber(params[1], 'b 必须是数字');
}
interface AddResult {
  sum: number;
}
function validateAddResult(value: unknown): asserts value is AddResult {
  Validate.ensureRecord(value);
  Validate.ensureNumber(value.sum);
}

const GREET_METHOD = 'greet.hello';
interface GreetParams {
  name: string;
}
function validateGreetParams(value: unknown): asserts value is GreetParams {
  Validate.ensureRecord(value);
  Validate.ensureNonBlankString(value.name, 'name 必须是非空字符串');
}
interface GreetResult {
  message: string;
}
function validateGreetResult(value: unknown): asserts value is GreetResult {
  Validate.ensureRecord(value);
  Validate.ensureString(value.message);
}

const PING_METHOD = 'sys.ping';
// 无参、无返回的方法：send 时省略 params。

interface Counter {
  add(value: number): number;
  getValue(): number;
}

class CounterService implements Counter {
  public add(value: number): number {
    this._value += value;
    return this._value;
  }

  public getValue(): number {
    return this._value;
  }

  private _value = 0;
}

async function main() {
  const url = 'ws://localhost:8081';

  // ---- 服务端：注册结构化 handler，在使用入参前校验 ----
  const router = BridgeRouter.GetRouter();
  router.registerMessageHandler(
    ADD_METHOD,
    (_peer, ...params) => {
      validateAddParams(params);
      const [a, b] = params;
      console.log('[server] math.add', a, b);
      return { sum: a + b };
    },
  );
  router.registerMessageHandler(
    GREET_METHOD,
    (_peer, params) => {
      validateGreetParams(params);
      const { name } = params;
      console.log('[server] greet.hello', name);
      return { message: `你好，${name}！` };
    },
  );
  router.registerMessageHandler(
    PING_METHOD,
    () => {
      console.log('[server] sys.ping');
    },
  );
  router.registerRemoteObj('service.counter', () => new CounterService());

  const listener = new WSServerBridgeListener(url);
  listener.onConnection((conn) => {
    console.log('[server] 客户端已连接');
    conn.onDisconnect(() => console.log('[server] 客户端断开'));
    // 接管该连接的入站消息：router 解析和分发 Request，handler 负责校验并使用 params。
    router.startDispatchMessage(conn);
  });

  // ---- 客户端：用 send 发起类型化调用 ----
  const client = CreateWSClientPeer(url);
  await client.waitForConnect();
  console.log('[client] 已连接');

  const addRes: unknown = await BridgeRouter.send(client, ADD_METHOD, 2, 40);
  validateAddResult(addRes);
  console.log('[client] math.add =>', addRes);

  const greetRes: unknown = await BridgeRouter.send(client, GREET_METHOD, { name: 'RPC' });
  validateGreetResult(greetRes);
  console.log('[client] greet.hello =>', greetRes);

  // 无参、无返回：省略 params。
  await BridgeRouter.send(client, PING_METHOD);
  console.log('[client] sys.ping 已确认');

  // 类对象 RPC：接口保留本地同步签名，RemoteObject<Counter> 会把代理方法映射为 Promise 返回值。
  const counter = await BridgeRouter.createRemoteObj<Counter>(client, 'service.counter');
  console.log('[client] counter.add =>', await counter.add(2));
  console.log('[client] counter.add =>', await counter.add(40));
  console.log('[client] counter.getValue =>', await counter.getValue());
  await BridgeRouter.destroyRemoteObj(counter);
  try {
    await counter.getValue();
  } catch (err) {
    console.log('[client] 已销毁对象被拒绝:', err instanceof Error ? err.message : err);
  }

  // 非法入参：服务端 params 校验会拒绝，send 抛出携带 error 文案的 Error。
  try {
    await BridgeRouter.send(client, ADD_METHOD, 1, 'oops');
  } catch (err) {
    console.log('[client] 非法参数被拒绝:', err instanceof Error ? err.message : err);
  }

  // 未注册的方法：send 会抛出携带 error 文案的 Error。
  try {
    await BridgeRouter.send(client, 'no.such.method');
  } catch (err) {
    console.log('[client] 调用未知方法被拒绝:', err instanceof Error ? err.message : err);
  }

  client.close();
  await listener.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
