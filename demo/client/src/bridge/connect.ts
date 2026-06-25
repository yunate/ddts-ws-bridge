// client/src/bridge/connect.ts —— 浏览器侧建链：创建到后端的 WebSocket 桥单例，
// 注册「server→client 推送」处理器（chat.deliver），并启动分发。
//
// CreateWSClientPeer 内部用 crypto.randomUUID() 生成 connectId 并 new WebSocket(url, connectId)
//（子协议携带 connectId），server 据此建立单连接 session。send() 内部会先 await
// wait_for_connect()，因此调用方无需等待连接建立即可发起 RPC（自动排队）。
import type { BridgePeer } from "../../../common/ws_bridge/peer";
import { CreateWSClientPeer } from "../../../common/ws_bridge/wsClientPeer";
import { BridgeRouter } from "../../../common/ws_bridge/rpc";
import { registerAllHandlers } from "./remote_router/handlers";

function resolveBridgeUrl(): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/bridge`;
}

let bridge: BridgePeer | null = null;

// 创建（一次性）桥单例：注册全部 server→client 推送处理器 + 启动分发，返回该 BridgePeer 实例。
export function connectBridge(): BridgePeer {
  if (bridge) return bridge;

  const router = BridgeRouter.GetRouter();
  registerAllHandlers(router);

  const instance = CreateWSClientPeer(resolveBridgeUrl());
  router.start_dispatch_message(instance);
  bridge = instance;
  return bridge;
}

// 取已建立的桥单例；未初始化时抛错（应先调用 connectBridge()）。
export function getBridge(): BridgePeer {
  if (!bridge) {
    throw new Error("bridge 尚未初始化：请先调用 connectBridge()");
  }
  return bridge;
}
