<script setup lang="ts">
import ChatRoom from "./components/ChatRoom.vue";
</script>

<template>
  <div class="app">
    <header>
      <h1>ws-bridge 聊天室 Demo</h1>
      <p>打开多个标签页，通过 <code>server(3201)</code> 广播互相聊天（SessionManager 管理每个连接）。</p>
    </header>
    <ChatRoom />
    <footer>消息经服务端广播并持久化到 <code>data/history.json</code>（DirectoryManager 管理路径）。</footer>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  padding: 24px;
}
</style>

<style scoped>
header {
  text-align: center;
  margin-bottom: 16px;
}
header h1 {
  margin: 0 0 6px;
  font-size: 22px;
}
header p {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
}
header code {
  color: #fbbf24;
}
footer {
  text-align: center;
  color: #64748b;
  font-size: 12px;
  margin-top: 16px;
}
footer code {
  color: #fbbf24;
}
</style>
