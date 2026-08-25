export const REMOTE_COUNTER_REGISTER_NAME = "demo.counter";

export type RemoteCounter = {
  add(value: number): number;
  getValue(): number;
};