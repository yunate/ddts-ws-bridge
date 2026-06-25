import type { BridgePeer } from "../../../common/ws_bridge/peer";

// 自增计数器：为每条新连接分配一个易读的访客昵称（访客1、访客2……）。
let visitorCounter = 0;

// 每条 UI 连接对应一个 Session：持有该连接专属的 bridge peer 与身份信息（sessionId / name）。
// 多个浏览器标签页 = 多个连接 = 多个 Session，各自独立，互不串扰。
// 参考 youtube_downloader 的 Session：本 demo 精简为「昵称 + bridge」，未承载 taskList。
export class Session {
  constructor(bridge: BridgePeer) {
    this.bridge = bridge;
    this.sessionId = bridge.getConnectId();
    this.name = `访客${++visitorCounter}`;
  }

  // 连接断开时的清理钩子（本 demo 无每连接资源需释放，保留占位以对齐架构）。
  dispose(): void {}

  readonly sessionId: string;
  readonly name: string;
  readonly bridge: BridgePeer;
}
