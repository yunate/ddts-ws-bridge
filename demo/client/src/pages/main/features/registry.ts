import type { FeatureDefinition } from "./types";

// 功能 tab 在导入时统一登记于此；FeatureLayout 读 getFeatures() 渲染侧栏，故不直接 import 具体组件。
class FeatureRegistry {
  registerFeature(definition: FeatureDefinition): void {
    if (this._features.some((feature) => feature.id === definition.id)) {
      console.warn(`[features] 重复的 feature id 已忽略: ${definition.id}`);
      return;
    }
    this._features.push(definition);
  }

  getFeatures(): readonly FeatureDefinition[] {
    return [...this._features].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private _features: FeatureDefinition[] = [];
}

export const featureRegistry = new FeatureRegistry();
