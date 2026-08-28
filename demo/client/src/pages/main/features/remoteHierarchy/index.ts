import type { FeatureDefinition } from "../types";
import RemoteHierarchyPage from "./RemoteHierarchyPage.vue";

export const remoteHierarchyFeature: FeatureDefinition = {
  id: "remoteHierarchy",
  title: "Nested Remote Object",
  component: RemoteHierarchyPage,
  order: 3,
};
