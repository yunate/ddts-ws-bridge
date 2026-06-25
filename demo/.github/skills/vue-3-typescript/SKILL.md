---
name: vue-3-typescript
description: >
  Vue 3 + TypeScript single-file component conventions and patterns. Use when building
  Vue UI: SFCs with <script setup lang="ts">, typed props/emits/defineModel, Composition
  API reactivity, composables, Pinia, Vue Router, and Vite. For pure TypeScript rules use
  typescript-strict; for visual styling use frontend-ui-design and html-css-beautify.
---

# Vue 3 + TypeScript Standard

Patterns for Vue 3 SFCs with TypeScript and Vite. All components use
`<script setup lang="ts">`. Combine with: `typescript-strict` (TS rules),
`frontend-ui-design` (visual design), `html-css-beautify` (markup/CSS).

## CRITICAL: SFC Authoring

### V3-01: `<script setup lang="ts">` always

```vue
<script setup lang="ts">
import { ref, computed } from "vue";
const count = ref(0);
const double = computed(() => count.value * 2);
</script>

<template>
  <button type="button" @click="count++">{{ count }} → {{ double }}</button>
</template>

<style scoped>
button { padding: var(--space-2) var(--space-4); border-radius: var(--radius); }
</style>
```

Order: `<script setup>` → `<template>` → `<style scoped>`. Prefer `scoped` styles.

### V3-02: Typed props with defaults

```vue
<script setup lang="ts">
type Props = { title: string; count?: number; items: ReadonlyArray<Item> };
const props = withDefaults(defineProps<Props>(), { count: 0 });
</script>
```

### V3-03: Typed emits + defineModel

```vue
<script setup lang="ts">
const emit = defineEmits<{ save: [value: string]; close: [] }>();
const model = defineModel<string>({ required: true }); // v-model two-way
</script>
```

## HIGH: Reactivity

### V3-04: Prefer `ref`; `computed` for derived state

- `ref` for primitives and objects; access via `.value` in script.
- Never put logic in templates — extract to `computed`.
- `reactive` only for grouped object state, and never destructure it (use `toRefs`).

### V3-05: Side-effect cleanup

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
onMounted(() => {
  const id = setInterval(tick, 1000);
  onUnmounted(() => clearInterval(id));
});
</script>
```

Prefer VueUse (`useEventListener`, `useIntervalFn`) for auto-cleanup.

### V3-06: Template refs

```vue
<script setup lang="ts">
import { useTemplateRef, onMounted } from "vue";
const input = useTemplateRef<HTMLInputElement>("input");
onMounted(() => input.value?.focus());
</script>
<template><input ref="input" /></template>
```

## HIGH: Composables & State

### V3-07: Extract logic into `use*` composables

```typescript
// composables/useDownloads.ts
export function useDownloads() {
  const items = ref<Download[]>([]);
  const loading = ref(false);
  async function refresh() {
    loading.value = true;
    try { items.value = await api.list(); }
    finally { loading.value = false; }
  }
  return { items: readonly(items), loading: readonly(loading), refresh };
}
```

One composable per file under `composables/`; return `readonly()` state.

### V3-08: Pinia setup stores for shared state

```typescript
export const useAppStore = defineStore("app", () => {
  const theme = ref<"light" | "dark">("light");
  function toggleTheme() { theme.value = theme.value === "light" ? "dark" : "light"; }
  return { theme, toggleTheme };
});
```

Keep API calls in stores/composables, never inline in components.

### V3-09: Lazy-loaded routes

```typescript
const routes = [
  { path: "/", component: () => import("@/views/Home.vue") },
  { path: "/history", component: () => import("@/views/History.vue") },
];
```

## HIGH: Data, Async & Safety

### V3-10: Validate API responses with Zod before state

Parse fetched data with a Zod schema (see typescript-strict TS-17) before assigning to
reactive state. Never trust server shape.

### V3-11: Design loading/empty/error in the template

Render distinct UI for `loading`, empty list, and error (see frontend-ui-design UI-09).
Use `<Suspense>` + async setup for top-level data, with an error boundary.

### V3-12: Never `v-html` untrusted content

Use text interpolation (`{{ }}`) which auto-escapes. If raw HTML is unavoidable,
sanitize with DOMPurify first.

## Project Structure (Vite)

```
src/
├─ main.ts            # createApp + plugins + mount
├─ App.vue
├─ router/index.ts
├─ stores/            # Pinia
├─ composables/       # use*
├─ components/        # reusable UI
├─ views/             # route components
├─ api/               # typed client + Zod schemas
├─ assets/styles/     # tokens.css (design system), base.css
└─ types/
```

Define design tokens (`:root` custom properties from frontend-ui-design / html-css-beautify)
once in `assets/styles/tokens.css` and import in `main.ts`.

## Tooling

- `vue-tsc --noEmit` for type-checking (Vite build does NOT type-check).
- ESLint flat config + `eslint-plugin-vue` + Prettier.
- VueUse for composables, Pinia for state, Vue Router for routing.
