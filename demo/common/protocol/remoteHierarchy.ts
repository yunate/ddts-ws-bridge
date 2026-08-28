export const REMOTE_HIERARCHY_REGISTER_NAME = "demo.hierarchy";

export interface RemoteSon {
  increment(): number;
  getMessage(): string;
}

export interface RemoteParent {
  getName(): string;
  getSon(): RemoteSon;
  son: RemoteSon;
}
