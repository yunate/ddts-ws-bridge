<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { getBridge } from "../bridge/connect";
import { chatMessageCenter, CHAT_MESSAGE_EVENT } from "../events/chatMessageCenter";
import { sendChat, fetchHistory } from "../bridge/remote_api/chatApi";
import type { ChatMessage } from "../../../common/protocol/chat";

const messages = ref<ChatMessage[]>([]);
const self = ref("");
const connected = ref(false);
const draft = ref("");
const outRef = ref<HTMLDivElement | null>(null);

let unsubscribe: (() => void) | null = null;

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString();
}

function scrollToBottom(): void {
  void Promise.resolve().then(() => {
    const el = outRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function appendMessage(message: ChatMessage): void {
  messages.value.push(message);
  scrollToBottom();
}

async function loadHistory(): Promise<void> {
  const history = await fetchHistory();
  self.value = history.self;
  messages.value = history.messages;
  scrollToBottom();
}

async function sendMessage(): Promise<void> {
  const text = draft.value.trim();
  if (!text) return;
  draft.value = "";
  try {
    await sendChat(text);
    appendMessage({ id: "local", from: self.value, text, at: Date.now() });
  } catch (err) {
    appendMessage({
      id: "local-error",
      from: "系统",
      text: `发送失败：${err instanceof Error ? err.message : String(err)}`,
      at: Date.now(),
    });
  }
}

onMounted(() => {
  const bridge = getBridge();
  connected.value = bridge.isconnect();
  bridge.onConnect(() => (connected.value = true));
  bridge.onDisconnect(() => (connected.value = false));
  // 经 chatMessageCenter（事件中心）按 event key 注册他人消息推送处理器；卸载时注销。
  unsubscribe = chatMessageCenter.registerEventHandler(CHAT_MESSAGE_EVENT, appendMessage);
  void loadHistory();
});

onUnmounted(() => {
  unsubscribe?.();
  unsubscribe = null;
});
</script>

<template>
  <div class="room">
    <div class="bar">
      <span>我：<span class="who">{{ self || "连接中…" }}</span></span>
      <span class="status" :class="connected ? 'ok' : 'err'">
        {{ connected ? "已连接" : "未连接" }}
      </span>
    </div>
    <div ref="outRef" class="output">
      <div
        v-for="(message, index) in messages"
        :key="`${message.id}-${index}`"
        class="line"
        :class="message.from === self ? 'mine' : 'other'"
      >
        [{{ formatTime(message.at) }}] {{ message.from }}：{{ message.text }}
      </div>
    </div>
    <div class="composer">
      <input
        v-model="draft"
        type="text"
        placeholder="输入消息，回车发送…"
        autocomplete="off"
        @keydown.enter="sendMessage"
      />
      <button @click="sendMessage">发送</button>
    </div>
  </div>
</template>

<style scoped>
.room {
  max-width: 720px;
  margin: 0 auto;
  background: #1e293b;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid #334155;
  border-top: 4px solid #38bdf8;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
}
.who {
  color: #7dd3fc;
  font-weight: 600;
}
.status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #475569;
  margin-left: auto;
}
.status.ok {
  background: #166534;
  color: #bbf7d0;
}
.status.err {
  background: #7f1d1d;
  color: #fecaca;
}
.output {
  height: 360px;
  overflow-y: auto;
  background: #0f172a;
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
  line-height: 1.7;
  border: 1px solid #334155;
}
.line {
  white-space: pre-wrap;
  word-break: break-word;
}
.line.mine {
  color: #7dd3fc;
}
.line.other {
  color: #fbbf24;
}
.composer {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.composer input {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #334155;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 14px;
}
.composer button {
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
.composer button:hover {
  background: #1d4ed8;
}
</style>
