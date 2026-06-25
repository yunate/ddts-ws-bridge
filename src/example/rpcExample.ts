/**
 * 结构化消息（RPC）示例：在 Node 中同时跑 server 与 client（1:1）。
 * 运行： npm run rpc-example
 *
 * 对比 example.ts（裸字符串收发）：这里用 rpc.ts 提供的结构化层——
 *   - 服务端：BridgeRouter 按 method 注册 handler，并为每个方法登记「入参 / 返回值」的运行时
 *     校验器（协议伴生对象：const X = { validate(value): asserts value is X {} }），start_dispatch_message 接管入站消息；
 *   - 客户端：send<TResult, TParams>(peer, method, params) 发起类型化调用，自动解包 Response。
 * 调用者不再手写 JSON.parse / 分发 / 序列化；未受信入参先经 validate 校验，非法即回受控错误文案。
 *
 * 注意：BridgeRouter 是进程级单例。本 demo 在同一进程内跑 server 与 client，
 * 因此只让服务端注册 handler 并 dispatch；客户端仅用 send 主动调用，避免单例冲突。
 */
import { WSServerBridgeListener } from '../wsServerPeer';
import { CreateWSClientPeer } from '../wsClientPeer';
import { BridgeRouter, send, type Validator } from '../rpc';
import { Validate } from './validator';

// ---- 方法契约：method 名 + 参数/返回类型 + 运行时校验器（协议伴生对象）----
const ADD_METHOD = 'math.add';
interface AddParams {
  a: number;
  b: number;
}
const AddParams: Validator<AddParams> = {
  validate(value: unknown): asserts value is AddParams {
    Validate.ensureRecord(value);
    Validate.ensureNumber(value.a, 'a 必须是数字');
    Validate.ensureNumber(value.b, 'b 必须是数字');
  },
};
interface AddResult {
  sum: number;
}
const AddResult: Validator<AddResult> = {
  validate(value: unknown): asserts value is AddResult {
    Validate.ensureRecord(value);
    Validate.ensureNumber(value.sum);
  },
};

const GREET_METHOD = 'greet.hello';
interface GreetParams {
  name: string;
}
const GreetParams: Validator<GreetParams> = {
  validate(value: unknown): asserts value is GreetParams {
    Validate.ensureRecord(value);
    Validate.ensureNonBlankString(value.name, 'name 必须是非空字符串');
  },
};
interface GreetResult {
  message: string;
}
const GreetResult: Validator<GreetResult> = {
  validate(value: unknown): asserts value is GreetResult {
    Validate.ensureRecord(value);
    Validate.ensureString(value.message);
  },
};

const PING_METHOD = 'sys.ping';
// 无参、无返回的方法：send 时第三个实参可整体省略；注册时两个校验器均传 null。

async function main() {
  const url = 'ws://localhost:8081';

  // ---- 服务端：注册结构化 handler（附带入参 / 返回值校验器）----
  const router = BridgeRouter.GetRouter();
  router.register_message_handler<AddParams, AddResult>(
    ADD_METHOD,
    (_peer, { a, b }) => {
      console.log('[server] math.add', a, b);
      return { sum: a + b };
    },
    AddParams,
    AddResult,
  );
  router.register_message_handler<GreetParams, GreetResult>(
    GREET_METHOD,
    (_peer, { name }) => {
      console.log('[server] greet.hello', name);
      return { message: `你好，${name}！` };
    },
    GreetParams,
    GreetResult,
  );
  router.register_message_handler(
    PING_METHOD,
    () => {
      console.log('[server] sys.ping');
    },
    null,
    null,
  );

  const listener = new WSServerBridgeListener(url);
  listener.onConnection((conn) => {
    console.log('[server] 客户端已连接');
    conn.onDisconnect(() => console.log('[server] 客户端断开'));
    // 接管该连接的入站消息：解析 Request、校验 params、查 handler、校验 result、回 Response，全部由 router 完成。
    router.start_dispatch_message(conn);
  });

  // ---- 客户端：用 send 发起类型化调用 ----
  const client = CreateWSClientPeer(url);
  await client.wait_for_connect();
  console.log('[client] 已连接');

  // 带参数、带返回：返回 AddResult，失败会 throw。
  const addRes = await send<AddResult, AddParams>(client, ADD_METHOD, { a: 2, b: 40 });
  console.log('[client] math.add =>', addRes);

  const greetRes = await send<GreetResult, GreetParams>(client, GREET_METHOD, { name: 'RPC' });
  console.log('[client] greet.hello =>', greetRes);

  // 无参、无返回：省略第三个实参。
  await send(client, PING_METHOD);
  console.log('[client] sys.ping 已确认');

  // 非法入参：服务端 params 校验会拒绝，send 抛出携带 error 文案的 Error。
  try {
    await send<AddResult, AddParams>(client, ADD_METHOD, { a: 1, b: 'oops' } as unknown as AddParams);
  } catch (err) {
    console.log('[client] 非法参数被拒绝:', err instanceof Error ? err.message : err);
  }

  // 未注册的方法：send 会抛出携带 error 文案的 Error。
  try {
    await send(client, 'no.such.method');
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
