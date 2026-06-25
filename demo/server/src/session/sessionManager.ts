import type { BridgePeer } from "../../../common/ws_bridge/peer";
import { Session } from "./session";

// 全局单例：登记所有活动连接（session），按 connectId 索引。
// 参考 youtube_downloader 的 SessionManager：create / require / remove / disposeAll，
// 另加 all() 供聊天广播遍历所有连接。
export class SessionManager {
  static getInstance(): SessionManager {
    SessionManager._instance ??= new SessionManager();
    return SessionManager._instance;
  }

  // 为一条新连接创建并登记 session；若 connectId 冲突（已有活动 session）则视为异常连接，
  // 返回 null 不登记，由调用方负责关闭这条新连接。
  create(bridge: BridgePeer): Session | null {
    const connectId = bridge.getConnectId();
    if (this._sessions.has(connectId)) {
      return null;
    }
    const session = new Session(bridge);
    this._sessions.set(connectId, session);
    return session;
  }

  // 按 connectId 取 session；取不到抛 Error（文案不含 connectId，避免泄露内部标识）。
  require(connectId: string): Session {
    const session = this._sessions.get(connectId);
    if (!session) {
      throw new Error("会话不存在或已断开");
    }
    return session;
  }

  // 当前所有活动 session 的快照（供广播遍历）。
  all(): Session[] {
    return [...this._sessions.values()];
  }

  // 连接断开时移除 session（带归属校验：仅当该 connectId 仍指向同一 session 实例时才删除，
  // 防止误删复用同一 connectId 的其它连接）。
  remove(session: Session): void {
    if (this._sessions.get(session.sessionId) === session) {
      session.dispose();
      this._sessions.delete(session.sessionId);
    }
  }

  // 优雅关闭：对所有活动 session 调 dispose() 并清空。
  disposeAll(): void {
    for (const session of [...this._sessions.values()]) {
      session.dispose();
    }
    this._sessions.clear();
  }

  private static _instance: SessionManager | null = null;
  private readonly _sessions = new Map<string, Session>();
}

// 取本连接对应的 Session（按 connectId 归属校验，未建立/不匹配时由 require 抛错）。
// 各 handler 复用此单一入口，避免逐处重复 SessionManager.getInstance().require(...)。
export function getSession(peer: BridgePeer): Session {
  return SessionManager.getInstance().require(peer.getConnectId());
}
