import type { FeatureDefinition } from "../types";
import AboutPage from "./AboutPage.vue";

export const aboutFeature: FeatureDefinition = {
  id: "about",
  title: "About",
  component: AboutPage,
  order: 1,
};
