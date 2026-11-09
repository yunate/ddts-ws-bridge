
export interface PeerOptions {
  timeout?: number;
}

export interface MessageHandlerResult {
  data: string;
  callback?: () => void | Promise<void>;
}

export type MessageHandler = (data: string) =>
  MessageHandlerResult | Promise<MessageHandlerResult>;

export interface BridgeSocket {
  send(data: string): void;
  close(): void;
  onMessage(handler: (data: string) => void): void;
  onClose(handler: () => void): void;
  onConnected(handler: () => void): void;
  onError(handler: (err: Error) => void): void;
  isConnected(): boolean;
}

export class BridgePeer {
  constructor(options: PeerOptions = {}) {
    this._timeout = options.timeout ?? 30000;
  }

  public setSocket(socket: BridgeSocket, connectId: string): void {
    this.socket = socket;
    this.connectId = connectId;

    socket.onMessage((data) => {
      void this._onMessage(data).catch((error: unknown) => {
        console.error('[bridge] message processing failed:', error);
      });
    });
    socket.onClose(() => this._handleDisconnect());
    socket.onConnected(() => this._handleConnect());
    socket.onError((err) => {
      console.error('[bridge] socket 错误:', err.message);
    });

    if (socket.isConnected()) this._handleConnect();
  }

  public onConnect(listener: () => void): () => void {
    const registeredListener = () => listener();
    this._connectListeners.push(registeredListener);
    return () => {
      const index = this._connectListeners.indexOf(registeredListener);
      if (index >= 0) this._connectListeners.splice(index, 1);
    };
  }

  public onDisconnect(listener: () => void): () => void {
    const registeredListener = () => listener();
    this._disconnectListeners.push(registeredListener);
    return () => {
      const index = this._disconnectListeners.indexOf(registeredListener);
      if (index >= 0) this._disconnectListeners.splice(index, 1);
    };
  }

  public async waitForConnect(timeout?: number): Promise<void> {
    if (this._connected) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = timeout === undefined ? undefined : setTimeout(() => {
        const i = this._connectListeners.indexOf(once);
        if (i >= 0) this._connectListeners.splice(i, 1);
        reject(new Error('Wait for connect timed out'));
      }, timeout);
      const once = () => {
        const i = this._connectListeners.indexOf(once);
        if (i >= 0) this._connectListeners.splice(i, 1);
        if (timer !== undefined) clearTimeout(timer);
        resolve();
      };
      this._connectListeners.push(once);
    });
  }

  public waitForDisconnect(): Promise<void> {
    if (!this._connected) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const once = () => {
        const i = this._disconnectListeners.indexOf(once);
        if (i >= 0) this._disconnectListeners.splice(i, 1);
        resolve();
      };
      this._disconnectListeners.push(once);
    });
  }

  public isConnected(): boolean {
    return this._connected;
  }

  public getConnectId(): string {
    if (this.connectId === undefined) {
      throw new Error('connectId 尚未设置');
    }
    return this.connectId;
  }

  public onMessage(handler: MessageHandler): void {
    this._handler = handler;
  }

  public async send(data: string): Promise<string> {
    const start = Date.now();
    await this.waitForConnect(this._timeout);
    const remaining = Math.max(0, this._timeout - (Date.now() - start));
    const id = BridgePeer._genId();
    const envelope: RawMessage = { id, kind: 'request', data };

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Request timed out after ${remaining}ms`));
      }, remaining);

      this._pending.set(id, { resolve, reject, timer });

      try {
        this._post(JSON.stringify(envelope));
      } catch (err) {
        clearTimeout(timer);
        this._pending.delete(id);
        reject(err as Error);
      }
    });
  }

  public async close(): Promise<void> {
    if (!this.socket) return;
    if (this._connected) {
      const done = this.waitForDisconnect();
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
    if (this._connected) return;
    this._connected = true;
    for (const l of [...this._connectListeners]) l();
  }

  private _handleDisconnect(): void {
    if (!this._connected) return;
    this._connected = false;
    for (const l of [...this._disconnectListeners]) l();

    // 拒绝所有等待中的请求。
    for (const waiter of this._pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Connection closed'));
    }
    this._pending.clear();
  }

  private _post(raw: string): void {
    if (!this.socket) throw new Error('No socket bound to this peer');
    this.socket.send(raw);
  }

  private async _onMessage(raw: string): Promise<void> {
    let msg: RawMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.id !== 'string') return;

    // 对端的回复：完成对应的 pending Promise。
    if (msg.kind === 'response') {
      const waiter = this._pending.get(msg.id);
      if (!waiter) return;
      this._pending.delete(msg.id);
      clearTimeout(waiter.timer);
      if (msg.error) waiter.reject(new Error(msg.error));
      else waiter.resolve(msg.data ?? '');
      return;
    }

    // 对端的请求：调用 handler 并回 response。
    let response: RawMessage;
    let callback: MessageHandlerResult['callback'];
    if (!this._handler) {
      response = { id: msg.id, kind: 'response', error: 'No message handler registered' };
    } else {
      try {
        const result: MessageHandlerResult = await this._handler(msg.data ?? '');
        response = { id: msg.id, kind: 'response', data: result.data };
        callback = result.callback;
      } catch (error: unknown) {
        response = {
          id: msg.id, kind: 'response', error: error instanceof Error ? error.message : 'Message handler failed',
        };
      }
    }
    this._post(JSON.stringify(response));
    await callback?.();
  }

  protected socket?: BridgeSocket;
  protected connectId?: string;

  private readonly _timeout: number;
  private _pending = new Map<string, PendingResponse>();
  private _handler?: MessageHandler;
  private _connected = false;
  private _connectListeners: (() => void)[] = [];
  private _disconnectListeners: (() => void)[] = [];
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
