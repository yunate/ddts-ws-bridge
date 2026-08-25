import type { FeatureDefinition } from "../types";
import RemoteCounterPage from "./RemoteCounterPage.vue";

export const remoteCounterFeature: FeatureDefinition = {
  id: "remoteCounter",
  title: "Remote Counter",
  component: RemoteCounterPage,
  order: 2,
};