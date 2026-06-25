// client/src/bridge/remote_api/chatApi.ts —— client → server 的「出站调用」封装。
// 把 send(...) 收拢在此，UI 代码只调用语义化函数（sendChat / fetchHistory），不直接拼 method/params。
import { send } from "../../../../common/ws_bridge/rpc";
import { getBridge } from "../connect";
import {
  CHAT_SEND,
  CHAT_HISTORY,
  type ChatSendParams,
  type ChatSendResult,
  type ChatHistoryResult,
} from "../../../../common/protocol/chat";

// client → server：发送一条消息，返回送达的其它连接数。
export function sendChat(text: string): Promise<ChatSendResult> {
  return send<ChatSendResult, ChatSendParams>(getBridge(), CHAT_SEND, { text });
}

// client → server：拉取本连接昵称 + 全部历史消息。
export function fetchHistory(): Promise<ChatHistoryResult> {
  return send<ChatHistoryResult>(getBridge(), CHAT_HISTORY);
}
