<script setup lang="ts"></script>

<template>
  <section class="user-center">
    <h1 class="user-center__title">User Center</h1>
    <p class="user-center__text">
      经 <code>pinToBottom</code> 钉在侧栏底部的功能 tab 示例，用于演示 feature 注册表如何把某个
      tab 固定到列表末尾。真实项目可在此放置账户、设置等入口。
    </p>
  </section>
</template>

<style scoped>
.user-center {
  max-width: 640px;
}

.user-center__title {
  margin: 0 0 var(--space-2);
  font-size: 24px;
}

.user-center__text {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.user-center code {
  color: var(--color-accent);
}
</style>
