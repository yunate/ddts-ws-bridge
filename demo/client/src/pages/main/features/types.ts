import type { Component } from "vue";

// 一个「功能 tab」的定义：id 唯一、title 显示在侧栏、component 为对应内容页。
export interface FeatureDefinition {
  id: string;
  title: string;
  component: Component;
  order?: number;
  // 为 true 时该 tab 被钉到侧栏底部，与其余 tab 之间以弹性空白分隔；底部组内部仍按 order 排序。
  pinToBottom?: boolean;
}
