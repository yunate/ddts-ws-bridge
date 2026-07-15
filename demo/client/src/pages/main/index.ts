import type { PageDefinition } from "../types";
import MainPage from "./MainPage.vue";

export const mainPage: PageDefinition = {
  path: "/main",
  title: "Main",
  component: MainPage,
  order: 1,
};
