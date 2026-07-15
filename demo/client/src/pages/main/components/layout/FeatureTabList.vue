<script setup lang="ts">
import { computed } from "vue";
import type { FeatureDefinition } from "../../features/types";

const props = defineProps<{
  features: readonly FeatureDefinition[];
  activeId: string;
}>();

defineEmits<{
  select: [id: string];
}>();

const topFeatures = computed(() => props.features.filter((feature) => !feature.pinToBottom));
const bottomFeatures = computed(() => props.features.filter((feature) => feature.pinToBottom));
const orderedFeatures = computed(() => [...topFeatures.value, ...bottomFeatures.value]);
const pinnedFirstId = computed(() => bottomFeatures.value[0]?.id);
</script>

<template>
  <nav class="feature-tabs" role="tablist" aria-orientation="vertical" aria-label="Features">
    <button
      v-for="feature in orderedFeatures"
      :id="`feature-tab-${feature.id}`"
      :key="feature.id"
      type="button"
      role="tab"
      class="feature-tabs__item"
      :class="{ 'is-active': feature.id === activeId, 'is-pinned-first': feature.id === pinnedFirstId }"
      :aria-selected="feature.id === activeId"
      :tabindex="feature.id === activeId ? 0 : -1"
      @click="$emit('select', feature.id)"
    >
      {{ feature.title }}
    </button>
  </nav>
</template>

<style scoped>
.feature-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  height: 100%;
  padding: var(--space-3);
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
}

.feature-tabs__item.is-pinned-first {
  margin-top: auto;
}

.feature-tabs__item {
  appearance: none;
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.feature-tabs__item:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.feature-tabs__item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.feature-tabs__item.is-active {
  color: var(--color-text);
  background: var(--color-surface-raised);
  box-shadow: inset 3px 0 0 var(--color-primary);
}
</style>
