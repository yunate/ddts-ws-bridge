import type { BridgePeer } from "../../../../common/ws_bridge/peer";
import type { BridgeRouter } from "../../../../common/ws_bridge/rpc";
import { REMOTE_COUNTER_REGISTER_NAME, type RemoteCounter } from "../../../../common/protocol/remoteCounter";
import { Validate } from "../../../../common/validator";

class CounterService implements RemoteCounter {
  public add(value: unknown): number {
    Validate.ensureNumber(value, "计数增量必须是数字");
    this._value += value;
    return this._value;
  }

  public getValue(): number {
    return this._value;
  }

  private _value = 0;
}

export function registerRemoteCounter(router: BridgeRouter): void {
  router.registerRemoteObj(
    REMOTE_COUNTER_REGISTER_NAME,
    (_peer: BridgePeer): RemoteCounter => new CounterService(),
  );
}