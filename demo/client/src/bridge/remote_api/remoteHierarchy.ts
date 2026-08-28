import { BridgeRouter, type RemoteObject } from "../../../../common/ws_bridge/rpc";
import {
  REMOTE_HIERARCHY_REGISTER_NAME,
  type RemoteParent,
} from "../../../../common/protocol/remoteHierarchy";
import { getBridge } from "../connect";

export function createRemoteHierarchy(name: string): Promise<RemoteObject<RemoteParent>> {
  return BridgeRouter.createRemoteObj<RemoteParent>(getBridge(), REMOTE_HIERARCHY_REGISTER_NAME, name);
}

export function destroyRemoteHierarchy(parent: RemoteObject<RemoteParent>): Promise<boolean> {
  return BridgeRouter.destroyRemoteObj(parent);
}
