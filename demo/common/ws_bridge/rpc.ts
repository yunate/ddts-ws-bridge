import type { BridgePeer } from "./peer";

export type RemoteObject<T> = {
  [Key in keyof T as T[Key] extends (...params: never[]) => unknown ? Key : never]:
    T[Key] extends (...params: infer Params) => infer Result
      ? (...params: Params) => Promise<Awaited<Result>>
      : never;
};
export type RemoteObjectCreator = (peer: BridgePeer, ...params: unknown[]) => object | Promise<object>;
export type RpcHandler = (peer: BridgePeer, ...params: unknown[]) => unknown | Promise<unknown>;

export class BridgeRouter {
  public static GetRouter(): BridgeRouter {
    BridgeRouter._instance ??= new BridgeRouter();
    return BridgeRouter._instance;
  }

  /**
   * 发起类型化 RPC 调用。
   * @param caller 调用方 BridgePeer
   * @param method RPC 方法名
   * @param params 方法参数，无参时省略
   * @returns 对端返回的结果
   * @remark 参数由 handler 实现方自行校验，返回值由调用方自行校验；本函数只保证数据传递的完整性。
   * @throws 对端返回错误
   */
  public static async send(
    caller: BridgePeer,
    method: string,
    ...params: unknown[]
  ): Promise<unknown> {
    const request: _.Request = { method, params };
    const raw: string = await caller.send(JSON.stringify(request));
    const response: _.Response = _.parseResponse(raw);
    if (!response.ok) throw new Error(response.error);
    return response.data;
  }

  /**
   * 注册消息处理器。
   * @param method RPC 方法名
   * @param handle 处理函数
   * @remark params 的运行时校验由 handle 按需执行，返回值由调用方自行校验。
   */
  public registerMessageHandler(
    method: string,
    handle: RpcHandler,
  ): void {
    if (this._handlers.has(method)) {
      throw new Error(`重复注册的方法: ${method}`);
    }
    this._handlers.set(method, handle);
  }

  /**
   * 请求服务端创建远端对象实例，并返回仅暴露方法的异步代理。
   * @typeParam T 远端对象的接口类型
   * @param caller 发起创建请求的 BridgePeer
   * @param registerName 远端对象注册名称，用于查找已注册工厂
   * @param params 传给远端对象工厂的创建参数
   * @returns 将 T 的方法返回值映射为 Promise 的远端对象代理
   * @throws 对象工厂未注册、创建失败或连接请求失败
   */
  public static async createRemoteObj<T>(
    caller: BridgePeer,
    registerName: string,
    ...params: unknown[]
  ): Promise<RemoteObject<T>> {
    const objectId: string = _.parseString(
      await BridgeRouter.send(caller, BridgeRouter._createRemoteObjectHandlerMethod, registerName, ...params),
    );

    const reference: _.RemoteObjectReference = { caller, objectId };
    const proxyHandler: ProxyHandler<RemoteObject<T>> = {
      get(_target: RemoteObject<T>, property: string | symbol): unknown {
        if (property === "then") return undefined;
        if (typeof property !== "string") return undefined;

        return (...params: unknown[]): Promise<unknown> => {
          const info: _.CallInfo = { objectId, functionName: property, params };
          return BridgeRouter.send(
            caller, BridgeRouter._callRemoteObjectFunctionHandlerMethod, info,
          );
        };
      },
    };
    const proxy: RemoteObject<T> = new Proxy({} as RemoteObject<T>, proxyHandler);
    BridgeRouter.GetRouter()._remoteObjectReferences.set(proxy, reference);
    return proxy;
  }

  /**
   * 删除服务端的远端对象实例并阻止代理发起后续调用。
    * @typeParam T 远端对象的接口类型
    * @param remoteObject 由 createRemoteObj 创建的远端对象代理
    * @returns 服务端确认删除后完成的 Promise
    * @remark 已经在服务端开始执行的方法不会被取消，可能在本方法完成后才返回。
    * @throws 参数不是由 createRemoteObj 创建的代理、对象不存在或删除请求失败
   */
  public static async destroyRemoteObj<T>(remoteObject: RemoteObject<T>): Promise<void> {
    const router: BridgeRouter = BridgeRouter.GetRouter();
    const reference: _.RemoteObjectReference | undefined = router._remoteObjectReferences.get(remoteObject);
    if (!reference) throw new Error("该对象已经被销毁或不是由 createRemoteObj 创建的代理");
    await BridgeRouter.send(
      reference.caller,
      BridgeRouter._destroyRemoteObjectHandlerMethod,
      reference.objectId,
    );
    router._remoteObjectReferences.delete(remoteObject);
  }

  /**
   * 注册远端对象工厂，供对端按注册名称创建连接专属实例。
   * @param registerName 远端对象注册名称，推荐使用点分命名空间
   * @param creator 创建对象实例的工厂；peer 是发起创建请求的连接
   * @remark 每次创建请求都会生成新实例；实例按 peer 隔离，并在显式删除或连接断开时解除引用。
   * @throws registerName 为空，或同名对象已重复注册
   */
  public registerRemoteObj(registerName: string, creator: RemoteObjectCreator): void {
    _.parseString(registerName);
    if (this._remoteObjectCreators.has(registerName)) {
      throw new Error(`重复注册的远端对象: ${registerName}`);
    }
    this._remoteObjectCreators.set(registerName, creator);
  }

  public startDispatchMessage(peer: BridgePeer): void {
    peer.onMessage(async (data) => JSON.stringify(await this._dispatch(peer, data)));
  }

  private constructor() {
    this.registerMessageHandler(
      BridgeRouter._createRemoteObjectHandlerMethod,
      (peer, registerName, ...params) => this._createRemoteObjectHandler(peer, registerName, ...params),
    );
    this.registerMessageHandler(
      BridgeRouter._callRemoteObjectFunctionHandlerMethod,
      (peer, info) => this._callRemoteObjectFunctionHandler(peer, info),
    );
    this.registerMessageHandler(
      BridgeRouter._destroyRemoteObjectHandlerMethod,
      (peer, objectId) => this._destroyRemoteObjectHandler(peer, objectId),
    );
  }

  private async _createRemoteObjectHandler(
    peer: BridgePeer,
    registerName: unknown,
    ...params: unknown[]
  ): Promise<string> {
    const parsedRegisterName: string = _.parseString(registerName);
    const creator: RemoteObjectCreator | undefined = this._remoteObjectCreators.get(parsedRegisterName);
    if (!creator) {
      throw new Error(`远端对象未注册: ${parsedRegisterName}`);
    }

    const object: object = await creator(peer, ...params);
    let objects: Map<string, object> | undefined = this._remoteObjects.get(peer);
    if (!objects) {
      objects = new Map<string, object>();
      this._remoteObjects.set(peer, objects);
      peer.onDisconnect((): void => {
        this._remoteObjects.delete(peer);
      });
    }
    const objectId: string = _.genObjectId();
    objects.set(objectId, object);
    return objectId;
  }

  private async _callRemoteObjectFunctionHandler(peer: BridgePeer, value: unknown): Promise<unknown> {
    const info: _.CallInfo = _.parseCallInfo(value);
    const object: object | undefined = this._remoteObjects.get(peer)?.get(info.objectId);
    if (!object) {
      throw new Error("远端对象不存在");
    }

    const method: (...params: unknown[]) => unknown = _.getRemoteMethod(object, info.functionName);
    return Reflect.apply(method, object, info.params);
  }

  private _destroyRemoteObjectHandler(peer: BridgePeer, objectId: unknown): void {
    const parsedObjectId: string = _.parseString(objectId);
    const isDeleted: boolean = this._remoteObjects.get(peer)?.delete(parsedObjectId) ?? false;
    if (!isDeleted) throw new Error("远端对象不存在或已被销毁");
  }

  private async _dispatch(peer: BridgePeer, data: string): Promise<_.Response> {
    try {
      const request: _.Request = _.parseRequest(data);
      const handle: RpcHandler | undefined = this._handlers.get(request.method);
      if (!handle) {
        throw new Error("方法未注册");
      }

      const result: unknown = await handle(peer, ...request.params);
      const response: _.Response = { ok: true, data: result };
      return response;
    } catch (err: unknown) {
      const errorMessage: string = err instanceof Error ? err.message : "请求处理失败";
      const response: _.Response = { ok: false, error: errorMessage };
      return response;
    }
  }

  private static readonly _createRemoteObjectHandlerMethod: string = "bridge.remoteObject.create";
  private static readonly _callRemoteObjectFunctionHandlerMethod: string = "bridge.remoteObject.call";
  private static readonly _destroyRemoteObjectHandlerMethod: string = "bridge.remoteObject.destroy";
  private static _instance: BridgeRouter | null = null;

  private readonly _handlers: Map<string, RpcHandler> = new Map();
  private readonly _remoteObjectCreators: Map<string, RemoteObjectCreator> = new Map();
  private readonly _remoteObjects: WeakMap<BridgePeer, Map<string, object>> = new WeakMap();
  private readonly _remoteObjectReferences: WeakMap<object, _.RemoteObjectReference> = new WeakMap();
}

namespace _ {
  export type Request = {
    method: string;
    params: unknown[];
  };

  export type Response =
    | { ok: true; data: unknown }
    | { ok: false; error: string };

  export type CallInfo = {
    objectId: string;
    functionName: string;
    params: unknown[];
  };

  export type RemoteObjectReference = {
    caller: BridgePeer;
    objectId: string;
  };

  export function genObjectId(): string {
    const crypto = globalThis.crypto;
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  export function getRemoteMethod(object: object, functionName: string): (...params: unknown[]) => unknown {
    if (functionName === "constructor" || functionName === "__proto__" || functionName === "prototype") {
      throw new Error(`远端对象方法不存在: ${functionName}`);
    }

    let current: object | null = object;
    while (current && current !== Object.prototype) {
      const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(current, functionName);
      if (descriptor) {
        if (typeof descriptor.value !== "function") {
          throw new Error(`远端对象方法不存在: ${functionName}`);
        }
        return descriptor.value;
      }
      current = Object.getPrototypeOf(current);
    }
    throw new Error(`远端对象方法不存在: ${functionName}`);
  }

  export function parseString(value: unknown): string {
    if (typeof value !== "string" || value.length === 0) throw new Error("值必须是非空字符串");
    return value;
  }

  export function parseResponse(raw: string): Response {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" ||
      !("ok" in parsed) || typeof parsed.ok !== "boolean") {
      throw new Error("非法报文");
    }
    if (!parsed.ok) {
      if (!("error" in parsed) || typeof parsed.error !== "string") throw new Error("非法报文");
      return { ok: false, error: parsed.error };
    }
    return { ok: true, data: "data" in parsed ? parsed.data : undefined };
  }

  export function parseRequest(raw: string): Request {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" ||
      !("method" in parsed) || typeof parsed.method !== "string" ||
      !("params" in parsed) || !Array.isArray(parsed.params)) {
      throw new Error("非法报文");
    }
    return { method: parsed.method, params: parsed.params };
  }

  export function parseCallInfo(value: unknown): CallInfo {
    if (value === null || typeof value !== "object") throw new Error("非法远端对象调用参数");
    const objectId: string = parseString("objectId" in value ? value.objectId : undefined);
    const functionName: string = parseString("functionName" in value ? value.functionName : undefined);
    if (!("params" in value) || !Array.isArray(value.params)) {
      throw new Error("远端对象 params 必须是数组");
    }
    return { objectId, functionName, params: value.params };
  }
}

