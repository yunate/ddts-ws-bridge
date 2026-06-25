// common/validator.ts —— 前后端共享的通用运行时校验原语，收拢为单一工具类 Validate。
// 校验「未受信 unknown 输入」，供各协议伴生对象的 validate 复用，避免逻辑漂移。
// 约定：
//   - ensure* 断言：失败抛 Error（受控中文文案，经 dispatch 的 params 分支可达前端），通过后收窄类型（asserts）。
//   - is(ensureFn, value)：通用桥，用 try/catch 把任意 ensure* 断言派生为「非抛错布尔」。
// 命名：本类名 Validate 刻意区别于 ws_bridge/rpc 的 `Validator<T>` 接口（协议伴生对象的
//   校验器接口），二者是不同概念，避免同名导入冲突。调用方统一 `Validate.xxx(...)`。

export class Validate {
  // 由「抛错校验」派生「非抛错布尔」的通用桥：assertFn 通过返回 true，抛出（校验失败）返回 false。
  static is(assertFn: (value: unknown) => void, value: unknown): boolean {
    try {
      assertFn(value);
      return true;
    } catch {
      return false;
    }
  }

  static ensureRecord(value: unknown): asserts value is Record<string, unknown> {
    if (typeof value !== "object" || value === null) throw new Error("请求参数无效");
  }

  static ensureBoolean(value: unknown, message = "请求参数无效"): asserts value is boolean {
    if (typeof value !== "boolean") throw new Error(message);
  }

  static ensureString(value: unknown, message = "请求参数无效"): asserts value is string {
    if (typeof value !== "string") throw new Error(message);
  }

  static ensureNonEmptyString(value: unknown, message: string): asserts value is string {
    if (typeof value !== "string" || value.length === 0) throw new Error(message);
  }

  // 必须是字符串且 trim 后非空（区别于 ensureNonEmptyString 只判空串；此处连纯空白也拒绝）。
  static ensureNonBlankString(value: unknown, message = "请求参数无效"): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) throw new Error(message);
  }

  static ensureNumber(value: unknown, message = "请求参数无效"): asserts value is number {
    if (typeof value !== "number" || Number.isNaN(value)) throw new Error(message);
  }

  static ensureArray(value: unknown, message = "参数必须是数组"): asserts value is unknown[] {
    if (!Array.isArray(value)) throw new Error(message);
  }
}
