import type { Component } from "vue";

// 一个「URL 页面」的定义：path 为路由路径、title 用于导航显示、component 为页面内容。
export interface PageDefinition {
  path: string;
  title: string;
  component: Component;
  order?: number;
}
