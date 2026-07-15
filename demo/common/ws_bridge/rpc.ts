import type { BridgePeer } from "./peer";

export interface Validator<T> {
  validate(value: unknown): asserts value is T;
}

export class BridgeRouter {
  public static GetRouter(): BridgeRouter {
    BridgeRouter._instance ??= new BridgeRouter();
    return BridgeRouter._instance;
  }

  /**
   * 发起类型化 RPC 调用。
   * @param caller 调用方 BridgePeer
   * @param method RPC 方法名
   * @param params 方法参数, 无参传 null
   * @param resultValidator 结果校验器（无返回值传 null）
   * @returns 校验通过的结果
   * @remark send 的 TParams 自行生成无需校验; 返回值 TResult 是对调用方而言的未受信网络数据，故由调用方传入 resultValidator 校验。
   * @throws 对端返回错误或结果校验失败
   */
  public static async send<TResult = void, TParams = void>(
    caller: BridgePeer,
    method: string,
    params: [TParams] extends [void] ? null : TParams,
    resultValidator: [TResult] extends [void] ? null : Validator<NoInfer<TResult>>,
  ): Promise<TResult> {
    // params 静态类型是条件类型（void 时为 null，否则 TParams）；此处收窄为 TParams：void 方法传 null 被 TParams(=void) 接受，非 void 时即 TParams。
    const request: Request<TParams> = { method, params: params as TParams };
    const raw = await caller.send(JSON.stringify(request));

    // 传输层只收发字符串，故在此自行序列化请求，并对未受信的对端回复先做运行时结构校验再解读。
    const parsed: unknown = JSON.parse(raw);
    const responseValidator: Validator<Response<unknown>> = Response;
    responseValidator.validate(parsed);

    if (!parsed.ok) throw new Error(parsed.error);

    // 「谁接收不可信数据谁校验」：对端回复的 data 对调用方是未受信网络数据，传入了 resultValidator 则用它校验并收窄。
    if (resultValidator) {
      const rv: Validator<TResult> = resultValidator;
      rv.validate(parsed.data);
      return parsed.data;
    }
    // void 契约：无 resultValidator，data 按 TResult(=void) 解读（通常为 undefined）。
    return parsed.data as TResult;
  }

  /**
   * 注册消息处理器。
   * @param method RPC 方法名
   * @param handle 处理函数
   * @param paramsValidator 参数校验器（无参传 null）
   * @remark handle 的 TParams 来自消息原始字符串需经 Validator 校验; 返回值 TResult 由 handle 自行生成无需校验。
   */
  public registerMessageHandler<TParams = void, TResult = void>(
    method: string,
    handle: (peer: BridgePeer, params: TParams) => TResult | Promise<TResult>,
    paramsValidator: [TParams] extends [void] ? null : Validator<NoInfer<TParams>>,
  ): void {
    if (this._handlers.has(method)) {
      throw new Error(`重复注册的方法: ${method}`);
    }
    this._handlers.set(method, {
      handle: async (peer, value) => handle(peer, value as TParams),
      paramsValidator,
    });
  }

  public startDispatchMessage(peer: BridgePeer): void {
    peer.onMessage(async (data) => JSON.stringify(await this._dispatch(peer, data)));
  }

  private constructor() {}

  private async _dispatch(peer: BridgePeer, data: string): Promise<Response<unknown>> {
    try {
      let request: Request<unknown> = JSON.parse(data);
      Request.validate(request);

      const entry: HandlerEntry | undefined = this._handlers.get(request.method);
      if (!entry) {
        throw new Error("方法未注册");
      }

      if (entry.paramsValidator) {
        const paramsValidator: Validator<unknown> = entry.paramsValidator;
        paramsValidator.validate(request.params);
      }

      const result: unknown = await entry.handle(peer, request.params);
      const response: Response<unknown> = { ok: true, data: result };
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "请求处理失败";
      const response: Response<unknown> = { ok: false, error: errorMessage };
      return response;
    }
  }

  private static _instance: BridgeRouter | null = null;
  private readonly _handlers = new Map<string, HandlerEntry>();
}

type Request<T = void> = {
  method: string;
  params: T;
};

const Request: Validator<Request<unknown>> = {
  validate(value: unknown): asserts value is Request<unknown> {
    if (value === null || typeof value !== "object") {
      throw new Error("非法报文");
    }

    if (!("method" in value) || typeof value.method !== "string") {
      throw new Error("非法报文");
    }
  },
};

type Response<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const Response: Validator<Response<unknown>> = {
  validate(value: unknown): asserts value is Response<unknown> {
    if (value === null || typeof value !== "object") {
      throw new Error("非法报文");
    }

    if (!("ok" in value) || typeof value.ok !== "boolean") {
      throw new Error("非法报文");
    }

    if (!value.ok) {
      if (!("error" in value) || typeof value.error !== "string") {
        throw new Error("非法报文");
      }
    }
  },
};

type HandlerEntry = {
  handle: (peer: BridgePeer, params: unknown) => Promise<unknown>;
  paramsValidator: Validator<unknown> | null;
};
