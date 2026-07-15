<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <div class="app-shell">
    <header class="app-nav">
      <span class="app-nav__brand">ws-bridge</span>
      <nav class="app-nav__links" aria-label="Primary">
        <RouterLink class="app-nav__link" to="/main">Main</RouterLink>
        <RouterLink class="app-nav__link" to="/other">Other</RouterLink>
      </nav>
    </header>
    <main class="app-body">
      <RouterView />
    </main>
  </div>
</template>

<style>
:root {
  --color-bg: #0f172a;
  --color-surface: #111c33;
  --color-surface-raised: #1e293b;
  --color-border: #263449;
  --color-text: #e2e8f0;
  --color-text-muted: #94a3b8;
  --color-primary: #38bdf8;
  --color-accent: #fbbf24;
  --color-danger: #f87171;
  --color-success: #4ade80;
  --color-warning: #fbbf24;
  --radius-md: 10px;
  --radius-sm: 6px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
}
</style>

<style scoped>
.app-shell {
  /* 确定的视口高度（非 min-height）是滚动收敛链的顶端：让下方的 body/feature/panel
     把 flex:1 + min-height:0 解析成可滚动区域，而不是把整页撑高。 */
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-nav {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: 0 var(--space-6);
  height: 56px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.app-nav__brand {
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--color-text);
}

.app-nav__links {
  display: flex;
  gap: var(--space-2);
}

.app-nav__link {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: color 0.15s ease, background 0.15s ease;
}

.app-nav__link:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.app-nav__link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.app-nav__link.router-link-active {
  color: var(--color-bg);
  background: var(--color-primary);
}

.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
</style>
