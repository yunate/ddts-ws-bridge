import type { BridgePeer } from "./peer";

type RemoteMethodKeys<T extends object> = {
  [Key in keyof T]-?: T[Key] extends (...params: never[]) => unknown ? Key : never;
}[keyof T];
type MapRemoteResult<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? [RemoteMethodKeys<T>] extends [never] ? T : RemoteObject<T>
    : T;
type RemoteResult<T> = MapRemoteResult<Awaited<T>>;
export type RemoteObject<T> = {
  [Key in keyof T as T[Key] extends (...params: never[]) => unknown
    ? Key
    : T[Key] extends object ? Key : never]:
    T[Key] extends (...params: infer Params) => infer Result
      ? (...params: Params) => Promise<RemoteResult<Result>>
      : T[Key] extends object ? RemoteObject<T[Key]> : never;
};
export type RemoteObjectCreator = (peer: BridgePeer, ...params: unknown[]) => object | Promise<object>;
export type RpcHandler = (peer: BridgePeer, ...params: unknown[]) => unknown | Promise<unknown>;

export class BridgeRouter {
  public static getRouter(): BridgeRouter {
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
    const request: _.Request = { id: _.genObjectId(), method, params };
    return BridgeRouter._sendRequest(caller, request);
  }

  /**
    * 标记对象，供远端方法的顶层参数或返回值按引用传递。
    * @param object 本地实现对象，或由远端方法返回的已有根代理
    * @remark 根代理返回仅验证单段方法的普通 JSON 参数与普通值结果；多跳 callback、引用返回、嵌套函数路径和函数引用不保证支持。
   */
  public static returnRemoteObj<T extends object>(object: T): T {
    Object.defineProperty(object, BridgeRouter._remoteObjectMarker, { value: true });
    if (!BridgeRouter._isMarkedRemoteObject(object)) {
      throw new Error("远端对象标记失败");
    }
    return object;
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
    return BridgeRouter._createRemoteObjectProxy<T>(caller, objectId);
  }

  /**
   * 删除服务端的远端对象实例并阻止代理发起后续调用。
   * @typeParam T 远端对象的接口类型
   * @param remoteObject 根代理、其成员代理或方法返回的远端对象代理
   * @returns 成功删除返回 true；参数不是远端对象代理或对象已销毁时返回 false
   * @remark 成员代理与根代理共享 objectId，销毁任意一个都会使同根代理全部失效。
   * @remark 已经在服务端开始执行的方法不会被取消，可能在本方法完成后才返回。
   * @throws 删除请求失败
   */
  public static async destroyRemoteObj<T>(remoteObject: RemoteObject<T>): Promise<boolean> {
    const router: BridgeRouter = BridgeRouter.getRouter();
    const reference: _.RemoteObjectReference | undefined = router._remoteObjectReferences.get(remoteObject);
    if (!reference || reference.isDestroyed) return false;
    await BridgeRouter.send(
      reference.caller,
      BridgeRouter._destroyRemoteObjectHandlerMethod,
      reference.objectId,
    );
    reference.isDestroyed = true;
    router._remoteObjectReferences.delete(remoteObject);
    return true;
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

  /**
   * 取消注册远端对象工厂。
   * @param registerName 已注册的远端对象名称
   * @returns 成功取消注册返回 true；名称未注册时返回 false
   * @remark 已创建的远端对象实例不受影响，仍可继续调用和销毁。
   * @throws registerName 为空
   */
  public unregisterRemoteObj(registerName: string): boolean {
    _.parseString(registerName);
    return this._remoteObjectCreators.delete(registerName);
  }

  public startDispatchMessage(peer: BridgePeer): void {
    const pendingCalls = new Map<string, _.PendingCall>();
    this._pendingCalls.set(peer, pendingCalls);
    peer.onMessage((data) => {
      const { response, callback } = this._dispatch(peer, data);
      return { data: JSON.stringify({ type: "response", data: response } satisfies _.RawMessage), callback };
    });
    peer.onDisconnect((): void => {
      for (const pending of pendingCalls.values()) pending.reject(new Error("Connection closed"));
      pendingCalls.clear();
    });
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

  private static _createRemoteObjectProxy<T>(caller: BridgePeer, objectId: string): RemoteObject<T> {
    const reference: _.RemoteObjectReference = { caller, objectId, isDestroyed: false };
    const proxyHandler: ProxyHandler<RemoteObject<T>> = {
      get(_target: RemoteObject<T>, property: string | symbol): unknown {
        if (property === "then") return undefined;
        if (property === BridgeRouter._remoteObjectMarker) {
          return Reflect.get(_target, property);
        }
        if (typeof property !== "string") return undefined;
        return BridgeRouter._createRemoteMemberProxy(
          reference,
          [property],
        );
      },
    };
    const proxy: RemoteObject<T> = new Proxy({} as RemoteObject<T>, proxyHandler);
    const router: BridgeRouter = BridgeRouter.getRouter();
    router._remoteObjectReferences.set(proxy, reference);
    router._remoteObjectReferences.set(reference, reference);
    BridgeRouter._remoteObjectFinalizer.register(proxy, reference);
    return proxy;
  }

  private static _createRemoteMemberProxy(
    reference: _.RemoteObjectReference,
    functionPath: string[],
  ): unknown {
    const target = (..._params: unknown[]): void => undefined;
    const handler: ProxyHandler<typeof target> = {
      get(_target: typeof target, property: string | symbol): unknown {
        if (property === "then") return undefined;
        if (typeof property !== "string") return undefined;
        return BridgeRouter._createRemoteMemberProxy(
          reference,
          [...functionPath, property],
        );
      },
      async apply(_target: typeof target, _thisArg: unknown, params: unknown[]): Promise<unknown> {
        if (reference.isDestroyed) throw new Error("远端对象已被销毁");
        const router: BridgeRouter = BridgeRouter.getRouter();
        const exportedIds: string[] = [];
        let resultPromise: Promise<unknown>;
        try {
          const info: _.CallInfo = {
            objectId: reference.objectId,
            functionPath,
            params: router._encodeRemoteArguments(reference.caller, params, exportedIds),
          };
          const request: _.Request = {
            id: _.genObjectId(),
            method: BridgeRouter._callRemoteObjectFunctionHandlerMethod,
            params: [info],
          };
          resultPromise = BridgeRouter._sendRequest(reference.caller, request);
        } catch (error: unknown) {
          const objects: Map<string, object> | undefined = router._remoteObjects.get(reference.caller);
          for (const objectId of exportedIds) objects?.delete(objectId);
          throw error;
        }
        const result: unknown = await resultPromise;
        const callResult: _.RemoteCallResult = BridgeRouter._parseRemoteCallResult(result);
        return callResult.kind === "value"
          ? callResult.value
          : BridgeRouter._createRemoteObjectProxy<object>(reference.caller, callResult.objectId);
      },
    };
    const proxy: typeof target = new Proxy(target, handler);
    BridgeRouter.getRouter()._remoteObjectReferences.set(proxy, reference);
    return proxy;
  }

  private static _sendRequest(caller: BridgePeer, request: _.Request): Promise<unknown> {
    const data: string = JSON.stringify({ type: "request", data: request } satisfies _.RawMessage);
    const calls = BridgeRouter.getRouter()._pendingCalls.get(caller);
    if (!calls) throw new Error("请先调用 startDispatchMessage");
    const { id } = request;
    return new Promise<unknown>((resolve, reject) => {
      calls.set(id, { resolve, reject });
      void BridgeRouter._sendAndWaitAck(caller, data, id).catch((error: unknown): void => {
        const pending = calls.get(id);
        if (!pending) return;
        calls.delete(id);
        pending.reject(error instanceof Error ? error : new Error("RPC request failed"));
      });
    });
  }

  private static async _sendAndWaitAck(peer: BridgePeer, data: string, id: string): Promise<void> {
    const message: _.RawMessage = _.parseRawMessage(await peer.send(data));
    if (message.type !== "response") throw new Error("非法 RPC 确认报文");
    const response: _.Response = message.data;
    if (response.id !== id || response.type !== "ack") throw new Error("非法 RPC 确认报文");
    if (response.error !== undefined) throw new Error(response.error);
  }

  private static _finalizeRemoteObject(reference: _.RemoteObjectReference): void {
    if (!reference.caller.isConnected()) return;
    void BridgeRouter.destroyRemoteObj(reference).catch((): void => undefined);
  }

  private static _isMarkedRemoteObject(value: unknown): value is object {
    return value !== null && typeof value === "object" &&
      BridgeRouter._remoteObjectMarker in value && value[BridgeRouter._remoteObjectMarker] === true;
  }

  private static _parseRemoteCallResult(value: unknown): _.RemoteCallResult {
    if (value === null || typeof value !== "object" || !("kind" in value)) {
      throw new Error("非法远端对象调用结果");
    }
    if (value.kind === "value") {
      return { kind: "value", value: "value" in value ? value.value : undefined };
    }
    if (value.kind === "remoteObject") {
      return {
        kind: "remoteObject",
        objectId: _.parseString("objectId" in value ? value.objectId : undefined),
      };
    }
    throw new Error("非法远端对象调用结果");
  }

  private static _getRemoteMethod(
    object: object,
    functionPath: string[],
  ): (...params: unknown[]) => unknown {
    let owner: object = object;
    for (const propertyName of functionPath.slice(0, -1)) {
      const value: unknown = BridgeRouter._getRemoteProperty(owner, propertyName, functionPath);
      if (value === null || typeof value !== "object") {
        throw new Error(`远端对象方法不存在: ${functionPath.join(".")}`);
      }
      owner = value;
    }

    const propertyName: string | undefined = functionPath.at(-1);
    if (!propertyName) throw new Error("远端对象方法路径不能为空");
    const method: unknown = BridgeRouter._getRemoteProperty(owner, propertyName, functionPath);
    if (typeof method !== "function") {
      throw new Error(`远端对象方法不存在: ${functionPath.join(".")}`);
    }
    return (...params: unknown[]): unknown => Reflect.apply(method, owner, params);
  }

  private static _getRemoteProperty(object: object, propertyName: string, functionPath: string[]): unknown {
    if (propertyName === "constructor" || propertyName === "__proto__" || propertyName === "prototype") {
      throw new Error(`远端对象方法不存在: ${functionPath.join(".")}`);
    }
    return Reflect.get(object, propertyName);
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
    return this._storeRemoteObject(peer, object);
  }

  private _storeRemoteObject(peer: BridgePeer, object: object): string {
    if (!peer.isConnected()) throw new Error("连接已断开");
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

  private _encodeRemoteArguments(
    peer: BridgePeer,
    params: unknown[],
    exportedIds: string[],
  ): _.RemoteArgument[] {
    const encodedParams: _.RemoteArgument[] = params.map((value: unknown): _.RemoteArgument => {
      if (BridgeRouter._isMarkedRemoteObject(value)) {
        const objectId: string = this._storeRemoteObject(peer, value);
        exportedIds.push(objectId);
        return { kind: "remoteObject", objectId };
      }
      return { kind: "value", value };
    });
    const values: unknown = JSON.parse(JSON.stringify(encodedParams.map(
      (param: _.RemoteArgument): unknown => param.kind === "value" ? param.value : null,
    )));
    if (!Array.isArray(values)) throw new Error("非法远端对象调用参数");
    return encodedParams.map((param: _.RemoteArgument, index: number): _.RemoteArgument =>
      param.kind === "value" ? { kind: "value", value: values[index] } : param,
    );
  }

  private async _callRemoteObjectFunctionHandler(peer: BridgePeer, value: unknown): Promise<unknown> {
    const info: _.CallInfo = _.parseCallInfo(value);
    const object: object | undefined = this._remoteObjects.get(peer)?.get(info.objectId);
    if (!object) {
      throw new Error("远端对象不存在");
    }

    const remoteMethod: (...params: unknown[]) => unknown =
      BridgeRouter._getRemoteMethod(object, info.functionPath);
    const decodedParams: unknown[] = info.params.map((param: _.RemoteArgument): unknown =>
      param.kind === "value" ? param.value : BridgeRouter._createRemoteObjectProxy<object>(peer, param.objectId),
    );
    const result: unknown = await remoteMethod(...decodedParams);
    if (!BridgeRouter._isMarkedRemoteObject(result)) {
      return { kind: "value", value: result } satisfies _.RemoteCallResult;
    }
    return {
      kind: "remoteObject",
      objectId: this._storeRemoteObject(peer, result),
    } satisfies _.RemoteCallResult;
  }

  private _destroyRemoteObjectHandler(peer: BridgePeer, objectId: unknown): void {
    const parsedObjectId: string = _.parseString(objectId);
    const isDeleted: boolean = this._remoteObjects.get(peer)?.delete(parsedObjectId) ?? false;
    if (!isDeleted) throw new Error("远端对象不存在或已被销毁");
  }

  private _dispatch(peer: BridgePeer, data: string): { response: _.Response; callback?: () => void | Promise<void> } {
    const message: _.RawMessage = _.parseRawMessage(data);
    if (message.type === "request") {
      const request: _.Request = message.data;
      const handle: RpcHandler | undefined = this._handlers.get(request.method);
      if (!handle) return { response: { id: request.id, type: "ack", error: "方法未注册" } };
      return {
        response: { id: request.id, type: "ack" },
        callback: async (): Promise<void> => {
          if (!peer.isConnected()) return;
          let responseMessage: string;
          try {
            const result: unknown = await handle(peer, ...request.params);
            responseMessage = JSON.stringify({
              type: "response", data: { id: request.id, type: "data", data: result },
            } satisfies _.RawMessage);
          } catch (err: unknown) {
            const errorMessage: string = err instanceof Error ? err.message : "请求处理失败";
            responseMessage = JSON.stringify({
              type: "response", data: { id: request.id, type: "data", error: errorMessage },
            } satisfies _.RawMessage);
          }
          if (!peer.isConnected()) return;
          try {
            await BridgeRouter._sendAndWaitAck(peer, responseMessage, request.id);
          } catch (error: unknown) {
            if (peer.isConnected()) console.error("[bridge] RPC result delivery failed:", error);
          }
        },
      };
    } else if (message.type === "response") {
      const response: _.Response = message.data;
      if (response.type !== "data") throw new Error("预期 data 响应");
      return {
        response: { id: response.id, type: "ack" },
        callback: (): void => {
          const calls = this._pendingCalls.get(peer);
          const pending = calls?.get(response.id);
          if (pending) {
            calls?.delete(response.id);
            if (response.error !== undefined) pending.reject(new Error(response.error));
            else pending.resolve(response.data);
          }
        },
      };
    }
    throw new Error("非法报文");
  }

  private static readonly _createRemoteObjectHandlerMethod: string = "bridge.remoteObject.create";
  private static readonly _callRemoteObjectFunctionHandlerMethod: string = "bridge.remoteObject.call";
  private static readonly _destroyRemoteObjectHandlerMethod: string = "bridge.remoteObject.destroy";
  private static readonly _remoteObjectMarker: unique symbol = Symbol("__remoteObject__");
  private static readonly _remoteObjectFinalizer: FinalizationRegistry<_.RemoteObjectReference> =
    new FinalizationRegistry((reference: _.RemoteObjectReference): void => {
      BridgeRouter._finalizeRemoteObject(reference);
    });
  private static _instance: BridgeRouter | null = null;

  // server 端存储 RPC 方法名与其处理函数的映射，便于调用
  private readonly _handlers: Map<string, RpcHandler> = new Map();

  // server 端存储远端对象注册名称与其工厂的映射，便于创建远端对象实例
  private readonly _remoteObjectCreators: Map<string, RemoteObjectCreator> = new Map();

  // server 端存储远端对象实例与其引用信息的映射，便于调用和销毁
  private readonly _remoteObjects: WeakMap<BridgePeer, Map<string, object>> = new WeakMap();

  // client 端存储远端对象代理与其引用信息的映射，便于 destroyRemoteObj 方法查找引用并阻止后续调用
  private readonly _remoteObjectReferences: WeakMap<object, _.RemoteObjectReference> = new WeakMap();
  private readonly _pendingCalls: WeakMap<BridgePeer, Map<string, _.PendingCall>> = new WeakMap();
}

namespace _ {
  export type RawMessage =
    | { type: "request"; data: Request }
    | { type: "response"; data: Response };

  export interface Request {
    id: string;
    method: string;
    params: unknown[];
  }

  export interface Response {
    id: string;
    type: "ack" | "data";
    data?: unknown;
    error?: string;
  }

  export interface PendingCall {
    resolve(value: unknown): void;
    reject(error: Error): void;
  }

  export type CallInfo = {
    objectId: string;
    functionPath: string[];
    params: RemoteArgument[];
  };

  export type RemoteArgument =
    | { kind: "value"; value: unknown }
    | { kind: "remoteObject"; objectId: string };

  export type RemoteObjectReference = {
    caller: BridgePeer;
    objectId: string;
    isDestroyed: boolean;
  };

  export type RemoteCallResult =
    | { kind: "value"; value: unknown }
    | { kind: "remoteObject"; objectId: string };

  export function genObjectId(): string {
    const crypto = globalThis.crypto;
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  export function parseString(value: unknown): string {
    if (typeof value !== "string" || value.length === 0) throw new Error("值必须是非空字符串");
    return value;
  }

  export function parseRawMessage(raw: string): RawMessage {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || !("type" in parsed) || !("data" in parsed)) {
      throw new Error("非法报文");
    }
    if (parsed.type === "request") return { type: "request", data: parseRequest(parsed.data) };
    if (parsed.type === "response") return { type: "response", data: parseResponse(parsed.data) };
    throw new Error("非法报文");
  }

  export function parseResponse(parsed: unknown): Response {
    if (parsed === null || typeof parsed !== "object" ||
      !("type" in parsed) || (parsed.type !== "ack" && parsed.type !== "data")) {
      throw new Error("非法报文");
    }
    const id: string = parseString("id" in parsed ? parsed.id : undefined);
    const error: unknown = "error" in parsed ? parsed.error : undefined;
    if (error !== undefined && typeof error !== "string") {
      throw new Error("非法报文");
    }
    return {
      id,
      type: parsed.type,
      data: "data" in parsed ? parsed.data : undefined,
      error,
    };
  }

  export function parseRequest(parsed: unknown): Request {
    if (parsed === null || typeof parsed !== "object" ||
      !("method" in parsed) || typeof parsed.method !== "string" ||
      !("params" in parsed) || !Array.isArray(parsed.params)) {
      throw new Error("非法报文");
    }
    const id: string = parseString("id" in parsed ? parsed.id : undefined);
    return { id, method: parsed.method, params: parsed.params };
  }

  export function parseCallInfo(value: unknown): CallInfo {
    if (value === null || typeof value !== "object") throw new Error("非法远端对象调用参数");
    const objectId: string = parseString("objectId" in value ? value.objectId : undefined);
    const rawFunctionPath: unknown = "functionPath" in value ? value.functionPath : undefined;
    if (!Array.isArray(rawFunctionPath) || rawFunctionPath.length === 0) {
      throw new Error("远端对象 functionPath 必须是非空数组");
    }
    const functionPath: string[] = rawFunctionPath.map(parseString);
    if (!("params" in value) || !Array.isArray(value.params)) {
      throw new Error("远端对象 params 必须是数组");
    }
    const params: RemoteArgument[] = value.params.map(parseRemoteArgument);
    return { objectId, functionPath, params };
  }

  function parseRemoteArgument(value: unknown): RemoteArgument {
    if (value !== null && typeof value === "object" && !Array.isArray(value) && "kind" in value) {
      if (value.kind === "value" && "value" in value) {
        return { kind: "value", value: value.value };
      }
      if (value.kind === "remoteObject") {
        return {
          kind: "remoteObject",
          objectId: parseString("objectId" in value ? value.objectId : undefined),
        };
      }
    }
    throw new Error("非法远端对象调用参数描述符");
  }
}

