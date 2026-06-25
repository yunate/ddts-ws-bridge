// validator.ts —— 通用运行时校验原语，收拢为单一工具类 Validate。
// 校验「未受信 unknown 输入」，供各协议伴生对象的 validate 复用，避免逻辑漂移。
// 约定：
//   - ensure* 断言：失败抛 Error（受控文案，经 dispatch 的 params 分支可达调用方），通过后收窄类型（asserts）。
//   - is(ensureFn, value)：通用桥，用 try/catch 把任意 ensure* 断言派生为「非抛错布尔」，供
//     「非法即幂等」的判定与过滤场景；不再为每条规则单写 isXxx 谓词，避免规则漂移。
// 命名：本类名 Validate 刻意区别于 rpc 的 `Validator<T>` 接口（协议伴生对象的校验器接口），
//   二者是不同概念，避免同名导入冲突。调用方统一 `Validate.xxx(...)`。

export class Validate {
  // 由「抛错校验」派生「非抛错布尔」的通用桥：assertFn 通过返回 true，抛出（校验失败）返回 false。
  // 让布尔判定与 ensure* 校验共享同一份规则，避免逻辑漂移。
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

  static ensureIntInRange(
    value: unknown,
    min: number,
    max: number,
    message = "数值超出允许范围",
  ): asserts value is number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(message);
    }
  }

  // 可空 id：null/undefined 视为「未选择」；非空须为非空字符串，否则抛错。
  static ensureNullableId(value: unknown): asserts value is string | null {
    if (value === null || value === undefined) return;
    if (typeof value !== "string" || value.length === 0) throw new Error("请求参数无效");
  }

  static ensureArray(value: unknown, message = "参数必须是数组"): asserts value is unknown[] {
    if (!Array.isArray(value)) throw new Error(message);
  }
}
