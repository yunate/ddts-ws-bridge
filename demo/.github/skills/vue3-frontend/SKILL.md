---
name: vue3-frontend
description: >
  Vue 3 + TypeScript frontend conventions. Use when writing, reviewing, or refactoring
  Vue single-file components (.vue), composables, Pinia stores, or Vue Router setup.
  Enforces <script setup lang="ts">, Composition API, typed props/emits, reactivity
  best practices, composable extraction, and Vite project structure. Pairs with the
  typescript-strict skill for all TS rules.
---

# Vue 3 Frontend Standard

Conventions for Vue 3 + TypeScript + Vite single-page apps. All `.vue` files use
`<script setup lang="ts">`. For all TypeScript-level rules (no `any`, type-only
imports, discriminated unions, Zod validation, etc.) follow the `typescript-strict` skill.

## CRITICAL: Component Rules

### VUE-01: Always `<script setup lang="ts">`

```vue
<!-- BAD: Options API / no setup / no lang -->
<script>
export default { data() { return { count: 0 }; } };
</script>

<!-- GOOD -->
<script setup lang="ts">
import { ref } from "vue";
const count = ref(0);
</script>
```

### VUE-02: Typed props with `defineProps<T>()`

```vue
<script setup lang="ts">
// BAD: runtime-only, untyped
const props = defineProps({ title: String, count: Number });

// GOOD: type-based declaration
type Props = {
  title: string;
  count?: number;
  items: ReadonlyArray<Item>;
};
const props = withDefaults(defineProps<Props>(), { count: 0 });
</script>
```

### VUE-03: Typed emits with `defineEmits<T>()`

```vue
<script setup lang="ts">
// GOOD
const emit = defineEmits<{
  save: [value: string];
  close: [];
  "update:modelValue": [value: number];
}>();

emit("save", "hello");
</script>
```

### VUE-04: Two-way binding via `defineModel<T>()`

```vue
<script setup lang="ts">
// GOOD (Vue 3.4+): replaces manual modelValue prop + update:modelValue emit
const model = defineModel<string>({ required: true });
const count = defineModel<number>("count", { default: 0 });
</script>
```

## HIGH: Reactivity Rules

### VUE-05: `ref` for primitives, `reactive` only for object groups

```typescript
// GOOD: ref everywhere is fine and consistent
const count = ref(0);
const user = ref<User | null>(null);

// reactive loses reactivity when destructured — prefer ref + toRefs if needed
const state = reactive({ a: 1, b: 2 });
const { a, b } = toRefs(state); // keep reactivity
```

Default to `ref`. Use `reactive` sparingly and never destructure it directly.

### VUE-06: `computed` for derived state, never compute in template

```vue
<script setup lang="ts">
// BAD: logic in template
// <span>{{ items.filter(i => i.active).length }}</span>

// GOOD
const activeCount = computed(() => items.value.filter((i) => i.active).length);
</script>
<template><span>{{ activeCount }}</span></template>
```

### VUE-07: Type `ref` to template elements

```vue
<script setup lang="ts">
import { useTemplateRef } from "vue";
// GOOD (Vue 3.5+)
const inputEl = useTemplateRef<HTMLInputElement>("inputEl");
onMounted(() => inputEl.value?.focus());
</script>
<template><input ref="inputEl" /></template>
```

### VUE-08: Clean up side effects in `onUnmounted`

```typescript
onMounted(() => {
  const id = setInterval(tick, 1000);
  onUnmounted(() => clearInterval(id));
});

// Event listeners: use VueUse useEventListener (auto-cleanup) when available
```

## HIGH: Composables

### VUE-09: Extract reusable logic into `use*` composables

```typescript
// composables/useCounter.ts
export function useCounter(initial = 0) {
  const count = ref(initial);
  const increment = () => count.value++;
  const reset = () => (count.value = initial);
  return { count: readonly(count), increment, reset };
}
```

Rules:
- Name starts with `use`, one composable per file under `composables/`.
- Return `readonly()` refs for state callers should not mutate directly.
- Accept refs or plain values; use `toValue()` to normalize.

### VUE-10: Normalize args with `toValue()`

```typescript
import { toValue, type MaybeRefOrGetter } from "vue";

export function useDouble(value: MaybeRefOrGetter<number>) {
  return computed(() => toValue(value) * 2);
}
```

## MEDIUM: State Management (Pinia)

### VUE-11: Setup-style Pinia stores

```typescript
// stores/counter.ts
export const useCounterStore = defineStore("counter", () => {
  const count = ref(0);
  const double = computed(() => count.value * 2);
  function increment() { count.value++; }
  return { count, double, increment };
});
```

Use setup syntax (not options) for full TS inference. Keep API calls in stores or
composables, never directly in components.

## MEDIUM: Routing & Async

### VUE-12: Lazy-load routes

```typescript
const routes = [
  { path: "/", component: () => import("@/views/Home.vue") },
  { path: "/settings", component: () => import("@/views/Settings.vue") },
];
```

### VUE-13: Suspense + async setup for data loading, with error boundaries

```vue
<template>
  <Suspense>
    <template #default><AsyncDashboard /></template>
    <template #fallback><Spinner /></template>
  </Suspense>
</template>
```

Wrap with `onErrorCaptured` or an error-boundary component to surface failures.

## MEDIUM: Security

### VUE-14: Never use `v-html` with untrusted input

```vue
<!-- BAD: XSS risk -->
<div v-html="userContent" />

<!-- GOOD: text interpolation escapes automatically -->
<div>{{ userContent }}</div>
<!-- If HTML is required, sanitize first (e.g. DOMPurify) -->
```

### VUE-15: Validate API responses at the boundary

Parse server responses with Zod (see typescript-strict TS-17) before putting them
into reactive state. Never trust the shape of fetched data.

## Project Structure

```
src/
├─ main.ts              # createApp, plugins, mount
├─ App.vue
├─ router/index.ts
├─ stores/              # Pinia stores
├─ composables/         # use* functions
├─ components/          # reusable UI components
├─ views/               # route-level components
├─ api/                 # typed API client + Zod schemas
└─ types/               # shared types
```

## Tooling Baseline

- **Vite** for dev/build, `vite-plugin-vue` + `vue-tsc` for type-checking.
- Type-check separately: `vue-tsc --noEmit` (the build does not type-check by default).
- ESLint with `eslint-plugin-vue` (flat config) + Prettier.
- Recommended: VueUse for battle-tested composables, Pinia for state.
