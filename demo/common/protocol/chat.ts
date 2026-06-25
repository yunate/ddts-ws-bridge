// common/protocol/chat.ts —— 前后端共享的聊天室协议契约（方法名 + Params/Result 类型 + 运行时校验器）。
//   client → server（RPC）：chat.send（广播一条消息）/ chat.history（拉取历史）
//   server → client（推送）：chat.deliver（把新消息推给其它连接，无返回）
//
// 每条消息由服务端产出（附带发送者昵称、服务端时间戳与自增 id），故 client 只上送纯文本。
// 校验器是「协议伴生对象」：const X = { validate(value): asserts value is X {} }，满足 ws_bridge
// 的 Validator<T> 结构；dispatch 在调 handler 前后自动校验未受信的入参 / 返回值。
import type { Validator } from "../ws_bridge/rpc";
import { Validate } from "../validator";

// 一条聊天消息（服务端产出后广播 + 落盘）。
export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  at: number;
}
export const ChatMessage: Validator<ChatMessage> = {
  validate(value: unknown): asserts value is ChatMessage {
    Validate.ensureRecord(value);
    Validate.ensureNonEmptyString(value.id, "消息 id 无效");
    Validate.ensureNonEmptyString(value.from, "消息发送者无效");
    Validate.ensureString(value.text, "消息文本无效");
    Validate.ensureNumber(value.at, "消息时间戳无效");
  },
};

// client → server：广播一条消息，返回送达的其它连接数。
export const CHAT_SEND = "chat.send";
export interface ChatSendParams {
  text: string;
}
export const ChatSendParams: Validator<ChatSendParams> = {
  validate(value: unknown): asserts value is ChatSendParams {
    Validate.ensureRecord(value);
    Validate.ensureNonBlankString(value.text, "text 必须是非空字符串");
  },
};
export interface ChatSendResult {
  delivered: number;
}
export const ChatSendResult: Validator<ChatSendResult> = {
  validate(value: unknown): asserts value is ChatSendResult {
    Validate.ensureRecord(value);
    Validate.ensureNumber(value.delivered);
  },
};

// client → server：拉取历史消息（无参）。
export const CHAT_HISTORY = "chat.history";
export interface ChatHistoryResult {
  self: string;
  messages: ChatMessage[];
}
export const ChatHistoryResult: Validator<ChatHistoryResult> = {
  validate(value: unknown): asserts value is ChatHistoryResult {
    Validate.ensureRecord(value);
    Validate.ensureNonEmptyString(value.self, "self 无效");
    Validate.ensureArray(value.messages, "messages 必须是数组");
    for (const item of value.messages) {
      const messageValidator: Validator<ChatMessage> = ChatMessage;
      messageValidator.validate(item);
    }
  },
};

// server → client 推送：把新消息推给其它连接（无返回）。
export const CHAT_DELIVER = "chat.deliver";
export interface ChatDeliverParams {
  message: ChatMessage;
}
export const ChatDeliverParams: Validator<ChatDeliverParams> = {
  validate(value: unknown): asserts value is ChatDeliverParams {
    Validate.ensureRecord(value);
    const messageValidator: Validator<ChatMessage> = ChatMessage;
    messageValidator.validate(value.message);
  },
};
