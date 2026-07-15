import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
// 导入装配点以触发副作用：确保下方按注册表构建路由表前，每个页面都已完成登记。
import "../pages";
import { pageRegistry } from "../pages/registry";

const routes: RouteRecordRaw[] = pageRegistry.getPages().map((page) => ({
  path: page.path,
  name: page.path,
  component: page.component,
  meta: { title: page.title },
}));

routes.push({ path: "/", redirect: "/main" });
routes.push({ path: "/:pathMatch(.*)*", redirect: "/main" });

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
