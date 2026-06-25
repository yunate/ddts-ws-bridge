// server/src/bridge/remote_router/chatRouter.ts —— client → server 的「入站处理器」（chat 域）。
// 每个方法先写成独立命名函数（便于单测/复用），再在 registerChatRouter 里统一 register。
// handler 首参是消息实际到达的那条连接的 peer；用 getSession(peer) 取本连接的 Session 身份。
import type { BridgePeer } from "../../../../common/ws_bridge/peer";
import type { BridgeRouter } from "../../../../common/ws_bridge/rpc";
import {
  CHAT_SEND,
  CHAT_HISTORY,
  ChatSendParams,
  ChatSendResult,
  ChatHistoryResult,
} from "../../../../common/protocol/chat";
import { getSession, SessionManager } from "../../session/sessionManager";
import { chatStore } from "../../lib/chatStore";
import { deliverMessage } from "../remote_api/chatApi";

// chat.send：广播一条消息给「其它」所有连接，落盘历史，返回送达连接数。
export function chatSend(peer: BridgePeer, params: ChatSendParams): ChatSendResult {
  const sender = getSession(peer);
  const message = chatStore.append(sender.name, params.text);
  console.log(`[server] ${sender.name}: ${params.text}`);

  let delivered = 0;
  for (const session of SessionManager.getInstance().all()) {
    if (session.sessionId === sender.sessionId) continue;
    // 反向调用对端的 chat.deliver 推送新消息。失败不影响其它连接。
    void deliverMessage(session.bridge, message).catch((err: unknown) => {
      console.error("[server] 推送失败:", err instanceof Error ? err.message : err);
    });
    delivered++;
  }
  return { delivered };
}

// chat.history：返回本连接昵称 + 全部历史消息（无参）。
export function chatHistory(peer: BridgePeer): ChatHistoryResult {
  const session = getSession(peer);
  return { self: session.name, messages: chatStore.all() };
}

export function registerChatRouter(router: BridgeRouter): void {
  router.register_message_handler(CHAT_SEND, chatSend, ChatSendParams, ChatSendResult);
  router.register_message_handler(CHAT_HISTORY, chatHistory, null, ChatHistoryResult);
}
