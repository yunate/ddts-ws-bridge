import fs from "node:fs";
import type { ChatMessage } from "../../../common/protocol/chat";
import { directoryManager } from "./directoryManager";

// 聊天历史存储：把消息持久化到 DirectoryManager.historyFilePath（data/history.json）。
// 演示 DirectoryManager 对「输出目录 / 数据文件」的统一管理：目录不存在时按需创建。
export class ChatStore {
  static getInstance(): ChatStore {
    ChatStore._instance ??= new ChatStore();
    return ChatStore._instance;
  }

  private constructor() {
    this._messages = this._load();
    this._seq = this._messages.length;
  }

  all(): ChatMessage[] {
    return [...this._messages];
  }

  // 产出一条新消息（服务端分配 id / 时间戳）、追加到内存并落盘，返回该消息。
  append(from: string, text: string): ChatMessage {
    const message: ChatMessage = {
      id: `m${++this._seq}`,
      from,
      text,
      at: Date.now(),
    };
    this._messages.push(message);
    this._persist();
    return message;
  }

  private _load(): ChatMessage[] {
    try {
      const raw = fs.readFileSync(directoryManager.historyFilePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
    } catch {
      // 首次运行文件不存在，或内容损坏：以空历史起步。
      return [];
    }
  }

  private _persist(): void {
    fs.mkdirSync(directoryManager.dataDir, { recursive: true });
    fs.writeFileSync(
      directoryManager.historyFilePath,
      JSON.stringify(this._messages, null, 2),
      "utf8",
    );
  }

  private static _instance: ChatStore | null = null;
  private readonly _messages: ChatMessage[];
  private _seq: number;
}

export const chatStore = ChatStore.getInstance();
