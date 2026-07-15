<script setup lang="ts">
import { computed, ref } from "vue";
import { featureRegistry } from "../../features/registry";
import FeatureTabList from "./FeatureTabList.vue";

const features = computed(() => featureRegistry.getFeatures());
const activeId = ref(features.value[0]?.id ?? "");

const activeFeature = computed(
  () => features.value.find((feature) => feature.id === activeId.value) ?? features.value[0],
);

function onSelect(id: string): void {
  activeId.value = id;
}
</script>

<template>
  <div class="feature-layout">
    <FeatureTabList :features="features" :active-id="activeId" @select="onSelect" />
    <section
      class="feature-panel"
      role="tabpanel"
      :aria-labelledby="activeFeature ? `feature-tab-${activeFeature.id}` : undefined"
    >
      <!-- 所有 feature 一次性挂载并常驻 DOM，仅用 v-show 切换可见性，从而各自保留滚动位置与状态。 -->
      <template v-if="features.length > 0">
        <div
          v-for="feature in features"
          v-show="feature.id === activeId"
          :key="feature.id"
          class="feature-panel__pane"
        >
          <component :is="feature.component" />
        </div>
      </template>
      <p v-else class="feature-panel__empty">No feature available.</p>
    </section>
  </div>
</template>

<style scoped>
.feature-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: minmax(0, 1fr);
}

.feature-panel {
  min-width: 0;
  min-height: 0;
  padding: var(--space-6);
  overflow: auto;
}

.feature-panel__pane {
  display: contents;
}

.feature-panel__empty {
  color: var(--color-text-muted);
}
</style>
