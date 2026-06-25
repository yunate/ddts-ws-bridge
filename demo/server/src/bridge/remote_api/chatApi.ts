// server/src/bridge/remote_api/chatApi.ts —— server → client 的「出站调用」封装。
// 把 send(...) 调用收拢在此，业务代码（router handler）只调用语义化函数，不直接拼 method/params。
import { send } from "../../../../common/ws_bridge/rpc";
import type { BridgePeer } from "../../../../common/ws_bridge/peer";
import {
  CHAT_DELIVER,
  type ChatDeliverParams,
  type ChatMessage,
} from "../../../../common/protocol/chat";

// server → client 推送：把一条新消息推给指定连接（无返回）。
export function deliverMessage(bridge: BridgePeer, message: ChatMessage): Promise<void> {
  return send<void, ChatDeliverParams>(bridge, CHAT_DELIVER, { message });
}
