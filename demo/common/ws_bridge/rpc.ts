import type { BridgePeer } from "./peer";

export interface Request<T = void> {
  method: string;
  params: T;
  connectId: string;
}

export type Response<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// 参数/返回值的运行时校验器。校验的是「未受信的 unknown 输入」，故用断言签名：
// 通过后 TS 才把 value 收窄为 T。协议伴生对象（const X = { validate(value): asserts value is X {} }）满足此结构。
export interface Validator<T> {
  validate(value: unknown): asserts value is T;
}

interface HandlerEntry {
  handle: (peer: BridgePeer, params: unknown) => Promise<unknown>;
  paramsValidator: Validator<unknown> | null;
  resultValidator: Validator<unknown> | null;
}

export async function send<TResult = void, TParams = void>(
  caller: BridgePeer,
  method: string,
  ...rest: [TParams] extends [void] ? [] : [params: TParams]
): Promise<TResult> {
  const [params] = rest;
  const connectId = caller.getConnectId();
  const response = await caller.send1<Response<TResult>>({ method, params, connectId });
  if (response.ok) return response.data;
  throw new Error(response.error);
}

export class BridgeRouter {
  private static instance: BridgeRouter | null = null;
  private readonly handlers = new Map<string, HandlerEntry>();

  private constructor() {}

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  static GetRouter(): BridgeRouter {
    BridgeRouter.instance ??= new BridgeRouter();
    return BridgeRouter.instance;
  }

  register_message_handler<TParams = void, TResult = void>(
    method: string,
    handle: (peer: BridgePeer, params: TParams) => TResult | Promise<TResult>,
    paramsValidator: [TParams] extends [void] ? null : Validator<NoInfer<TParams>>,
    resultValidator: [TResult] extends [void] ? null : Validator<NoInfer<TResult>>,
  ): void {
    if (this.handlers.has(method)) {
      throw new Error(`重复注册的方法: ${method}`);
    }
    this.handlers.set(method, {
      handle: async (peer, value) => handle(peer, value as TParams),
      paramsValidator,
      resultValidator,
    });
  }

  start_dispatch_message(peer: BridgePeer): void {
    peer.on_message(async (data) => JSON.stringify(await this.dispatch(peer, data)));
  }

  private async dispatch(peer: BridgePeer, data: string): Promise<Response<unknown>> {
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return { ok: false, error: "未知的方法" };
    }
    if (!BridgeRouter.isRecord(raw) || typeof raw.method !== "string") {
      return { ok: false, error: "未知的方法" };
    }

    const method = raw.method;
    // 显式标注类型：validate 为断言函数，TS 要求断言调用链上的每个引用都有显式类型注解。
    const entry: HandlerEntry | undefined = this.handlers.get(method);
    if (!entry) {
      return { ok: false, error: "未知的方法" };
    }

    let result: unknown;
    try {
      // 断言函数调用要求引用链上有显式类型注解，故先绑定到显式类型的局部常量再调用。
      if (entry.paramsValidator) {
        const paramsValidator: Validator<unknown> = entry.paramsValidator;
        paramsValidator.validate(raw.params);
      }
      result = await entry.handle(peer, raw.params);
    } catch (err) {
      // params 校验 / handler 执行失败：受控中文文案，回 err.message（策略 B）。记真实错误供排查。
      console.error(`[bridge] error for ${method}:`, err);
      return { ok: false, error: err instanceof Error ? err.message : "请求处理失败" };
    }

    if (entry.resultValidator) {
      try {
        const resultValidator: Validator<unknown> = entry.resultValidator;
        resultValidator.validate(result);
      } catch (err) {
        // result 由 server 自产，畸形属内部 bug：记日志但只回固定通用文案，不把「返回格式无效」泄露给前端。
        console.error(`[bridge] invalid result for ${method}:`, err);
        return { ok: false, error: "请求处理失败" };
      }
    }
    return { ok: true, data: result };
  }
}
