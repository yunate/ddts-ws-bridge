<script setup lang="ts"></script>

<template>
  <article class="about">
    <header class="about__header">
      <h1 class="about__title">ws-bridge Demo</h1>
      <p class="about__subtitle">
        全栈示例：Vue 3 前端、Node 后端，经共享协议层通过一条 WebSocket 桥相连。
      </p>
    </header>

    <section class="about__section">
      <h2 class="about__heading">桥架构</h2>
      <p>
        浏览器经同源 WebSocket <code>/bridge</code> 与后端通信。连接建立前的请求会自动排队，
        故 UI 无需等待建链即可挂载。
      </p>
    </section>

    <section class="about__section">
      <h2 class="about__heading">分层</h2>
      <ul class="about__list">
        <li><strong>client</strong> —— Vue 3 + Vite 单页应用，由后端静态托管。</li>
        <li><strong>common</strong> —— 共享协议契约与 WebSocket 桥核心。</li>
        <li><strong>server</strong> —— 承载桥与静态构建产物的 Node 后端。</li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.about {
  max-width: 720px;
}

.about__header {
  margin-bottom: var(--space-6);
}

.about__title {
  margin: 0 0 var(--space-2);
  font-size: 24px;
}

.about__subtitle {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.about__section {
  margin-bottom: var(--space-6);
}

.about__heading {
  margin: 0 0 var(--space-2);
  font-size: 16px;
  color: var(--color-text);
}

.about__section p {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.about__list {
  margin: 0;
  padding-left: var(--space-4);
  color: var(--color-text-muted);
  line-height: 1.8;
}

.about code {
  color: var(--color-accent);
}
</style>
