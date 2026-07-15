<script setup lang="ts"></script>

<template>
  <section class="other">
    <h1 class="other__title">Other</h1>
    <p class="other__text">
      一个独立的 URL 页面，可直接经 <code>/other</code> 访问，用于演示与 <code>/main</code>
      并列的可插拔页面结构。
    </p>
  </section>
</template>

<style scoped>
.other {
  flex: 1;
  padding: var(--space-6);
}

.other__title {
  margin: 0 0 var(--space-2);
  font-size: 24px;
}

.other__text {
  margin: 0;
  max-width: 640px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.other code {
  color: var(--color-accent);
}
</style>
