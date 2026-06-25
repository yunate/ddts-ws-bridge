// client/src/events/chatMessageCenter.ts —— 应用级共享实例：承载「新聊天消息」这一类 UI 通知。
// 生产方（bridge 的 chatRouter 收到 chat.deliver 推送）emitEvent，消费方（UI 组件）registerEventHandler，二者解耦。
import type { ChatMessage } from "../../../common/protocol/chat";
import { EventCenter } from "./eventCenter";

// event key：本中心承载的「新聊天消息」事件。
export const CHAT_MESSAGE_EVENT = 1;

export const chatMessageCenter = new EventCenter<ChatMessage>();
