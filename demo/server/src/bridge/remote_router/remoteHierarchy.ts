import type { BridgePeer } from "../../../../common/ws_bridge/peer";
import { BridgeRouter } from "../../../../common/ws_bridge/rpc";
import {
  REMOTE_HIERARCHY_REGISTER_NAME,
  type RemoteParent,
  type RemoteSon,
} from "../../../../common/protocol/remoteHierarchy";
import { Validate } from "../../../../common/validator";

class SonService implements RemoteSon {
  public increment(): number {
    this._callCount += 1;
    return this._callCount;
  }

  public getMessage(): string {
    return `来自 ${this._parentName}.son 的第 ${this._callCount} 次调用`;
  }

  public constructor(parentName: string) {
    this._parentName = parentName;
  }

  private _callCount = 0;
  private readonly _parentName: string;
}

class ParentService implements RemoteParent {
  public getName(): string {
    return this._name;
  }

  public getSon(): RemoteSon {
    return BridgeRouter.returnRemoteObj(this.son);
  }

  public constructor(name: string) {
    this._name = name;
    this.son = new SonService(name);
  }

  public readonly son: RemoteSon;
  private readonly _name: string;
}

export function registerRemoteHierarchy(router: BridgeRouter): void {
  router.registerRemoteObj(
    REMOTE_HIERARCHY_REGISTER_NAME,
    (_peer: BridgePeer, name: unknown): RemoteParent => {
      Validate.ensureNonBlankString(name, "父对象名称不能为空");
      return new ParentService(name);
    },
  );
}
