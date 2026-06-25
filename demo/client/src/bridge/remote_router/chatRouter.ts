// client/src/bridge/remote_router/chatRouter.ts —— server → client 的「入站推送处理器」（chat 域）。
// handler 只把推送作为一个 event 提交给 chatMessageCenter（事件中心实例）；订阅方经其 registerEventHandler 注册，二者解耦。
import type { BridgePeer } from "../../../../common/ws_bridge/peer";
import type { BridgeRouter } from "../../../../common/ws_bridge/rpc";
import { CHAT_DELIVER, ChatDeliverParams } from "../../../../common/protocol/chat";
import { chatMessageCenter, CHAT_MESSAGE_EVENT } from "../../events/chatMessageCenter";

// chat.deliver：把服务端广播来的新消息交给事件中心派发。推送无返回（void）。
export function chatDeliver(_peer: BridgePeer, params: ChatDeliverParams): void {
  chatMessageCenter.emitEvent({ key: CHAT_MESSAGE_EVENT, payload: params.message });
}

export function registerChatRouter(router: BridgeRouter): void {
  router.register_message_handler(CHAT_DELIVER, chatDeliver, ChatDeliverParams, null);
}
