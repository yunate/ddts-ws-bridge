import type { PageDefinition } from "./types";

// 顶层 URL 页面在导入时统一登记于此；router 读 getPages() 构建路由表，故不直接 import 具体页面组件。
class PageRegistry {
  registerPage(definition: PageDefinition): void {
    if (this._pages.some((page) => page.path === definition.path)) {
      console.warn(`[pages] 重复的 page path 已忽略: ${definition.path}`);
      return;
    }
    this._pages.push(definition);
  }

  getPages(): readonly PageDefinition[] {
    return [...this._pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private _pages: PageDefinition[] = [];
}

export const pageRegistry = new PageRegistry();
