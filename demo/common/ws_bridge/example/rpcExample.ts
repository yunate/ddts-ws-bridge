/**
 * 结构化消息（RPC）示例：在 Node 中运行双向调用与 A-B-C 根代理中继。
 * 运行： npm run rpc-example
 *
 * 对比 example.ts（裸字符串收发）：这里用 rpc.ts 提供的结构化层——
 *   - 服务端：BridgeRouter 按 method 注册 handler，handler 在使用 params 前按需校验，startDispatchMessage 接管入站消息；
 *   - 客户端：BridgeRouter.send(peer, method, ...params) 发起调用并自动解包 Response，
 *     调用方在使用未受信的 result 前按需校验。
 * 双向校验遵循「谁接收不可信数据谁校验」：params 由 server handler 校验，result 由 client 调用方校验。
 *
 * BridgeRouter 是进程级单例，方法和工厂名称须唯一；需要反向调用时，两端均接入 dispatch。
 */
import { strict as assert } from 'node:assert';
import { once } from 'node:events';
import { WSServerBridgeListener } from '../wsServerPeer';
import { CreateWSClientPeer } from '../wsClientPeer';
import type { BridgePeer } from '../peer';
import { BridgeRouter } from '../rpc';
import type { RemoteObject } from '../rpc';
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

interface CounterCallback {
  add(value: number): number;
}

function validateCounterCallback(value: unknown): asserts value is { add(amount: number): unknown } {
  if (value === null || typeof value !== 'object') {
    throw new Error('callback 必须提供 add 方法');
  }
  const method: unknown = Reflect.get(value, 'add');
  if (typeof method !== 'function') {
    throw new Error('callback 必须提供 add 方法');
  }
}

interface Counter {
  add(value: number): number;
  getValue(): number;
  onCallback(callback: CounterCallback | RemoteObject<CounterCallback>): Promise<number>;
}

class CounterService implements Counter {
  public add(value: number): number {
    this._value += value;
    return this._value;
  }

  public getValue(): number {
    return this._value;
  }

  public async onCallback(callback: unknown): Promise<number> {
    validateCounterCallback(callback);
    const result: unknown = await callback.add(2);
    Validate.ensureNumber(result);
    return result;
  }

  private _value = 0;
}

async function createExampleListener(): Promise<{ listener: WSServerBridgeListener; url: string }> {
  const listener = new WSServerBridgeListener('ws://127.0.0.1:0');
  await once(listener.wss, 'listening');
  const address = listener.wss.address();
  if (address === null || typeof address === 'string') throw new Error('示例监听地址无效');
  return { listener, url: `ws://127.0.0.1:${address.port}` };
}

async function runRemoteProxyRelayExample(): Promise<void> {
  const router = BridgeRouter.getRouter();
  const listeners: WSServerBridgeListener[] = [];
  const peers: BridgePeer[] = [];
  const destroyProxies: (() => Promise<boolean>)[] = [];
  const counterAtC = {
    value: 0,
    add(amount: number): number {
      Validate.ensureNumber(amount);
      this.value += amount;
      return this.value;
    },
    getLabel(): string {
      return `C:${this.value}`;
    },
    getSnapshot(options: { label: string }): { label: string; value: number } {
      Validate.ensureRecord(options);
      Validate.ensureString(options.label);
      return { label: options.label, value: this.value };
    },
  };

  try {
    router.registerRemoteObj('relay.c.counter', () => counterAtC);
    const endpointAtC = await createExampleListener();
    listeners.push(endpointAtC.listener);
    endpointAtC.listener.onConnection((peer) => router.startDispatchMessage(peer));
    const peerBC = CreateWSClientPeer(endpointAtC.url);
    peers.push(peerBC);
    router.startDispatchMessage(peerBC);
    await peerBC.waitForConnect(3000);
    const cProxy = await BridgeRouter.createRemoteObj<typeof counterAtC>(peerBC, 'relay.c.counter');
    destroyProxies.push(() => BridgeRouter.destroyRemoteObj(cProxy));

    const localObject = {};
    assert.equal(BridgeRouter.returnRemoteObj(localObject), localObject);
    assert.equal(BridgeRouter.returnRemoteObj(localObject), localObject);
    const [marker] = Object.getOwnPropertySymbols(localObject);
    assert.ok(marker);
    assert.equal(Reflect.get(localObject, marker), true);
    const compatibleProxy = new Proxy({}, {
      get: (target, property): unknown => Reflect.get(target, property),
    });
    assert.equal(BridgeRouter.returnRemoteObj(compatibleProxy), compatibleProxy);
    assert.throws(
      () => BridgeRouter.returnRemoteObj(new Proxy({}, { defineProperty: () => false })),
      TypeError,
    );
    assert.throws(
      () => BridgeRouter.returnRemoteObj(new Proxy({}, { get: () => undefined })),
      TypeError,
    );
    assert.throws(
      () => BridgeRouter.returnRemoteObj(new Proxy({}, { has: () => false })),
      TypeError,
    );
    assert.equal(Reflect.get(cProxy, marker), undefined);
    assert.equal(Reflect.get(cProxy, 'then'), undefined);
    assert.equal(Reflect.get(cProxy, Symbol.toStringTag), undefined);

    const serviceAtB = {
      getCounter() {
        return BridgeRouter.returnRemoteObj(cProxy);
      },
      echo(value: unknown): unknown {
        return value;
      },
    };
    router.registerRemoteObj('relay.b.service', () => serviceAtB);
    const endpointAtB = await createExampleListener();
    listeners.push(endpointAtB.listener);
    endpointAtB.listener.onConnection((peer) => router.startDispatchMessage(peer));
    const peerAB = CreateWSClientPeer(endpointAtB.url);
    peers.push(peerAB);
    router.startDispatchMessage(peerAB);
    await peerAB.waitForConnect(3000);
    assert.notEqual(peerAB.getConnectId(), peerBC.getConnectId());
    const bService = await BridgeRouter.createRemoteObj<typeof serviceAtB>(peerAB, 'relay.b.service');
    destroyProxies.push(() => BridgeRouter.destroyRemoteObj(bService));
    const proxyAtA = await bService.getCounter();
    destroyProxies.push(() => BridgeRouter.destroyRemoteObj(proxyAtA));

    const plainValues: unknown[] = [{ label: 'plain' }, { kind: 'remoteObject', objectId: 'data' }, [], 7, 'plain', false, null];
    for (const value of plainValues) {
      assert.deepEqual(await bService.echo(value), value);
    }
    const markedFunction = Object.defineProperty(() => undefined, marker, { value: true });
    for (const value of [undefined, markedFunction, Symbol('plain')]) {
      assert.equal(await bService.echo(value), null);
    }

    assert.equal(Reflect.get(cProxy, marker), true);
    assert.deepEqual(Object.getOwnPropertyDescriptor(cProxy, marker), {
      value: true, writable: false, enumerable: false, configurable: false,
    });
    assert.equal(BridgeRouter.returnRemoteObj(cProxy), cProxy);
    assert.equal(BridgeRouter.returnRemoteObj(cProxy), cProxy);
    assert.equal(Reflect.get(cProxy, 'then'), undefined);
    assert.equal(Reflect.get(cProxy, Symbol.toStringTag), undefined);
    assert.equal(await proxyAtA.add(2), 2);
    assert.equal(await proxyAtA.add(3), 5);
    assert.equal(counterAtC.value, 5);
    assert.equal(await proxyAtA.getLabel(), 'C:5');
    assert.deepEqual(await proxyAtA.getSnapshot({ label: 'via B' }), { label: 'via B', value: 5 });

    assert.equal(await BridgeRouter.destroyRemoteObj(proxyAtA), true);
    await assert.rejects(() => proxyAtA.add(1), /远端对象已被销毁/);
    assert.equal(await cProxy.add(4), 9);
    const reexportedAtA = await bService.getCounter();
    destroyProxies.push(() => BridgeRouter.destroyRemoteObj(reexportedAtA));
    assert.equal(await reexportedAtA.add(1), 10);
    assert.equal(counterAtC.value, 10);
    console.log('[relay] A -> B -> C、根代理标记及独立句柄生命周期断言通过');
  } finally {
    try {
      for (const destroyProxy of destroyProxies.reverse()) await destroyProxy();
    } finally {
      await Promise.all(peers.map((peer) => peer.close()));
      await Promise.all(listeners.map((listener) => listener.close()));
      router.unregisterRemoteObj('relay.b.service');
      router.unregisterRemoteObj('relay.c.counter');
    }
  }
}

async function main() {
  const { listener, url } = await createExampleListener();

  // ---- 服务端：注册结构化 handler，在使用入参前校验 ----
  const router = BridgeRouter.getRouter();
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

  listener.onConnection((conn) => {
    console.log('[server] 客户端已连接');
    conn.onDisconnect(() => console.log('[server] 客户端断开'));
    // 接管该连接的入站消息：router 解析和分发 Request，handler 负责校验并使用 params。
    router.startDispatchMessage(conn);
  });

  // ---- 客户端：用 send 发起类型化调用 ----
  const client = CreateWSClientPeer(url);
  router.startDispatchMessage(client);
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
  const callback = {
    value: 0,
    add(amount: number): number {
      this.value += amount;
      return this.value;
    },
  };
  assert.equal(await counter.onCallback(BridgeRouter.returnRemoteObj(callback)), 2);
  assert.equal(callback.value, 2);
  console.log('[client] callback =>', callback.value);
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

  await client.close();
  await listener.close();
  await runRemoteProxyRelayExample();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
