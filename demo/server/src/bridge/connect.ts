import type http from "node:http";
import { WSServerBridgeListener } from "../../../common/ws_bridge/wsServerPeer";
import { BridgeRouter } from "../../../common/ws_bridge/rpc";
import { SessionManager } from "../session/sessionManager";
import { registerAllHandlers } from "./remote_router/handlers";

export interface BridgeHandle {
  close(): Promise<void>;
}

// 把 WebSocket 桥（路径 /bridge）附着到已有的 http.Server，与 HTTP 静态服务共用同一端口。
// 每条连接建立 → SessionManager.create(bridge) 登记 session → router 接管入站 RPC；
// connectId 冲突（create 返回 null）时关闭该连接。断开时 remove(session)。
export function startBridge(server: http.Server): BridgeHandle {
  const router = BridgeRouter.GetRouter();
  registerAllHandlers(router);

  const listener = new WSServerBridgeListener("ws://localhost/bridge", {
    serverOptions: { server, path: "/bridge" },
  });

  listener.onConnection((bridge) => {
    const session = SessionManager.getInstance().create(bridge);
    if (!session) {
      // connectId 冲突：拒绝这条异常连接。
      void bridge.close();
      return;
    }
    console.log(`[server] ${session.name} 已连接`);
    router.start_dispatch_message(bridge);
    bridge.onDisconnect(() => {
      console.log(`[server] ${session.name} 断开`);
      SessionManager.getInstance().remove(session);
    });
  });

  return { close: () => listener.close() };
}
