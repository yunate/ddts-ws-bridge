
export interface PeerOptions {
  timeout?: number;
}

export type MessageHandler = (data: string) => string | Promise<string>;

export interface BridgeSocket {
  send(data: string): void;
  close(): void;
  on_message(handler: (data: string) => void): void;
  on_close(handler: () => void): void;
  on_connected(handler: () => void): void;
  on_error(handler: (err: Error) => void): void;
  is_connected(): boolean;
}

export class BridgePeer {
  constructor(options: PeerOptions = {}) {
    this.timeout = options.timeout ?? 30000;
  }

  public setSocket(socket: BridgeSocket, connectId: string): void {
    this.socket = socket;
    this.connectId = connectId;

    socket.on_message((data) => void this._onmessage(data));
    socket.on_close(() => this._handleDisconnect());
    socket.on_connected(() => this._handleConnect());
    socket.on_error((err) => {
      console.error('[bridge] socket 错误:', err.message);
    });

    if (socket.is_connected()) this._handleConnect();
  }

  public onConnect(listener: () => void): void {
    this.connectListeners.push(listener);
  }

  public onDisconnect(listener: () => void): void {
    this.disconnectListeners.push(listener);
  }

  public async wait_for_connect(): Promise<void> {
    if (this.connected) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const once = () => {
        const i = this.connectListeners.indexOf(once);
        if (i >= 0) this.connectListeners.splice(i, 1);
        resolve();
      };
      this.connectListeners.push(once);
    });
  }

  public wait_for_disconnect(): Promise<void> {
    if (!this.connected) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const once = () => {
        const i = this.disconnectListeners.indexOf(once);
        if (i >= 0) this.disconnectListeners.splice(i, 1);
        resolve();
      };
      this.disconnectListeners.push(once);
    });
  }

  public isconnect(): boolean {
    return this.connected;
  }

  public getConnectId(): string {
    if (this.connectId === undefined) {
      throw new Error('connectId 尚未设置');
    }
    return this.connectId;
  }

  public on_message(handler: MessageHandler): void {
    this.handler = handler;
  }

  public async send(data: string): Promise<string> {
    await this.wait_for_connect();
    const id = BridgePeer._genId();
    const envelope: RawMessage = { id, kind: 'request', data };

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out after ${this.timeout}ms`));
      }, this.timeout);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this._post(JSON.stringify(envelope));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err as Error);
      }
    });
  }

  public async send1<TResult = unknown>(body: unknown): Promise<TResult> {
    const data = JSON.stringify(body);
    const resRaw = await this.send(data);
    return JSON.parse(resRaw) as TResult;
  }

  public async close(): Promise<void> {
    if (!this.socket) return;
    if (this.connected) {
      const done = this.wait_for_disconnect();
      this.socket.close();
      await done;
    } else {
      this.socket.close();
    }
  }

  private static _genId(): string {
    const c = globalThis.crypto;
    if (typeof c?.randomUUID === 'function') return c.randomUUID();
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  private _handleConnect(): void {
    if (this.connected) return;
    this.connected = true;
    for (const l of [...this.connectListeners]) l();
  }

  private _handleDisconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    for (const l of [...this.disconnectListeners]) l();

    // 拒绝所有等待中的请求。
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Connection closed'));
    }
    this.pending.clear();
  }

  private _post(raw: string): void {
    if (!this.socket) throw new Error('No socket bound to this peer');
    this.socket.send(raw);
  }

  private async _onmessage(raw: string): Promise<void> {
    let msg: RawMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.id !== 'string') return;

    // 对端的回复：完成对应的 pending Promise。
    if (msg.kind === 'response') {
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      clearTimeout(waiter.timer);
      if (msg.error) waiter.reject(new Error(msg.error));
      else waiter.resolve(msg.data ?? '');
      return;
    }

    // 对端的请求：调用 handler 并回 response。
    let response: RawMessage;
    if (!this.handler) {
      response = { id: msg.id, kind: 'response', error: 'No message handler registered' };
    } else {
      try {
        const result = await this.handler(msg.data ?? '');
        response = { id: msg.id, kind: 'response', data: result };
      } catch (err) {
        response = { id: msg.id, kind: 'response', error: (err as Error).message };
      }
    }
    this._post(JSON.stringify(response));
  }

  protected socket?: BridgeSocket;
  protected connectId?: string;

  private readonly timeout: number;
  private pending = new Map<string, PendingResponse>();
  private handler?: MessageHandler;
  private connected = false;
  private connectListeners: (() => void)[] = [];
  private disconnectListeners: (() => void)[] = [];
}

type PendingResponse = {
  resolve: (value: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type RawMessage = {
  id: string;
  kind: 'request' | 'response';
  data?: string;
  error?: string;
};
