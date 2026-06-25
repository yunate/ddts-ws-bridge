// server/src/bridge/remote_router/handlers.ts —— 聚合入口：把各处理器文件的 registerXxxRouter
// 汇总注册到同一个 BridgeRouter 实例。新增协议：在对应文件写 registerXxxRouter，再在此调用。
import type { BridgeRouter } from "../../../../common/ws_bridge/rpc";
import { registerChatRouter } from "./chatRouter";

export function registerAllHandlers(router: BridgeRouter): void {
  registerChatRouter(router);
}
