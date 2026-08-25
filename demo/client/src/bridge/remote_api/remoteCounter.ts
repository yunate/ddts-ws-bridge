import { BridgeRouter, type RemoteObject } from "../../../../common/ws_bridge/rpc";
import { REMOTE_COUNTER_REGISTER_NAME, type RemoteCounter } from "../../../../common/protocol/remoteCounter";
import { getBridge } from "../connect";

export function createRemoteCounter(): Promise<RemoteObject<RemoteCounter>> {
  return BridgeRouter.createRemoteObj<RemoteCounter>(getBridge(), REMOTE_COUNTER_REGISTER_NAME);
}

export function destroyRemoteCounter(counter: RemoteObject<RemoteCounter>): Promise<void> {
  return BridgeRouter.destroyRemoteObj(counter);
}