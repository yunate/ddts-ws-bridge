import type { PageDefinition } from "../types";
import OtherPage from "./OtherPage.vue";

export const otherPage: PageDefinition = {
  path: "/other",
  title: "Other",
  component: OtherPage,
  order: 2,
};
