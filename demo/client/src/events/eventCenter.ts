export interface Event<TPayload> {
  key: number;
  payload: TPayload;
}

export class EventCenter<TPayload> {
  registerEventHandler(key: number, handler: (payload: TPayload) => void): () => void {
    let handlers = this._handlers.get(key);
    if (!handlers) {
      handlers = [];
      this._handlers.set(key, handlers);
    }
    handlers.push(handler);
    return () => {
      const list = this._handlers.get(key);
      if (!list) return;
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
      if (list.length === 0) this._handlers.delete(key);
    };
  }

  emitEvent(event: Event<TPayload>): void {
    const handlers = this._handlers.get(event.key);
    if (!handlers) return;
    for (const handler of [...handlers]) handler(event.payload);
  }

  private readonly _handlers = new Map<number, ((payload: TPayload) => void)[]>();
}
