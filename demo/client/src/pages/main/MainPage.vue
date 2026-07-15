<script setup lang="ts">
// 装配点：先 import features 触发功能 tab 的登记副作用，再渲染消费该注册表的 FeatureLayout。
import "./features";
import FeatureLayout from "./components/layout/FeatureLayout.vue";
</script>

<template>
  <FeatureLayout />
</template>
