import { WebSocketServer, WebSocket as NodeWebSocket, type ServerOptions } from 'ws';
import { BridgePeer, type BridgeSocket, type PeerOptions } from './peer';

export interface WSServerBridgeListenerOptions extends PeerOptions {
  // 透传给 WebSocketServer 的其它参数（host/port 由 url 解析得到）
  serverOptions?: Omit<ServerOptions, 'host' | 'port'>;
}

// Node 'ws' 的 BridgeSocket 适配：把 EventEmitter 事件（message/close/open/error）接到
// BridgePeer 需要的统一回调上。
class NodeWebSocketBridge implements BridgeSocket {
  constructor(ws: NodeWebSocket) {
    this._ws = ws;
  }

  send(data: string): void {
    this._ws.send(data);
  }

  close(): void {
    this._ws.close();
  }

  on_message(handler: (data: string) => void): void {
    this._ws.on('message', (data) => handler(data.toString()));
  }

  on_close(handler: () => void): void {
    this._ws.on('close', () => handler());
  }

  on_connected(handler: () => void): void {
    this._ws.on('open', () => handler());
  }

  on_error(handler: (err: Error) => void): void {
    this._ws.on('error', (err) => handler(err));
  }

  is_connected(): boolean {
    return this._ws.readyState === NodeWebSocket.OPEN;
  }

  private readonly _ws: NodeWebSocket;
}

export class WSServerBridgeListener {
  constructor(url: string, options: WSServerBridgeListenerOptions = {}) {
    const { serverOptions, ...peerOptions } = options;
    this._peerOptions = peerOptions;
    const so = serverOptions ?? {};
    if (so.server || so.noServer) {
      // 附着到已有的 http.Server，或交由调用者处理 upgrade（noServer）；
      // 这两种情况下不再自行绑定 host/port。
      this.wss = new WebSocketServer(so);
    } else {
      const { hostname, port } = new URL(url);
      this.wss = new WebSocketServer({
        ...so,
        host: hostname,
        port: Number(port),
      });
    }
    this.wss.on('connection', (socket, request) => {
      const connectId = request.headers['sec-websocket-protocol'];
      if (!connectId) {
        // 缺失或空 connectId：拒绝并关闭 socket，不留悬挂连接。
        console.error('[bridge] 连接缺少 connectId（sec-websocket-protocol），已关闭');
        socket.close();
        return;
      }
      const peer = WSServerBridgeListener._createWSServerPeer(socket, connectId, this._peerOptions);
      for (const listener of [...this._connectionListeners]) listener(peer);
    });
  }

  // 注册新连接回调：每条 client 连接建立时触发一次，参数是该连接专属的 BridgePeer。
  onConnection(listener: (peer: BridgePeer) => void): void {
    this._connectionListeners.push(listener);
  }

  async close(): Promise<void> {
    this.wss.close();
  }

  private static _createWSServerPeer(
    socket: NodeWebSocket,
    connectId: string,
    options: PeerOptions,
  ): BridgePeer {
    const peer = new BridgePeer(options);
    peer.setSocket(new NodeWebSocketBridge(socket), connectId);
    return peer;
  }

  readonly wss: WebSocketServer;

  private readonly _peerOptions: PeerOptions;
  private readonly _connectionListeners: ((peer: BridgePeer) => void)[] = [];
}
