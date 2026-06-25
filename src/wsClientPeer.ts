import { BridgePeer, type BridgeSocket, type PeerOptions } from './peer';

// 浏览器 WebSocket 的 BridgeSocket 适配：把 DOM 事件（message/close/open/error）接到
// BridgePeer 需要的统一回调上。
class BrowserWebSocketBridge implements BridgeSocket {
  constructor(url: string, protocol: string) {
    this._ws = new WebSocket(url, protocol);
  }

  send(data: string): void {
    this._ws.send(data);
  }

  close(): void {
    this._ws.close();
  }

  on_message(handler: (data: string) => void): void {
    this._ws.addEventListener('message', (ev) => {
      handler(typeof ev.data === 'string' ? ev.data : String(ev.data));
    });
  }

  on_close(handler: () => void): void {
    this._ws.addEventListener('close', () => handler());
  }

  on_connected(handler: () => void): void {
    this._ws.addEventListener('open', () => handler());
  }

  on_error(handler: (err: Error) => void): void {
    this._ws.addEventListener('error', () => handler(new Error('WebSocket 连接错误')));
  }

  is_connected(): boolean {
    return this._ws.readyState === WebSocket.OPEN;
  }

  private readonly _ws: WebSocket;
}

export function CreateWSClientPeer(url: string, options: PeerOptions = {}): BridgePeer {
  const peer = new BridgePeer(options);
  const connectId = crypto.randomUUID();
  peer.setSocket(new BrowserWebSocketBridge(url, connectId), connectId);
  return peer;
}
