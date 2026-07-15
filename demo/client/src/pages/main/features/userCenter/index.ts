import type { FeatureDefinition } from "../types";
import UserCenterPage from "./UserCenterPage.vue";

// 经 pinToBottom 钉在侧栏底部；order 仅用于底部组内部排序。
export const userCenterFeature: FeatureDefinition = {
  id: "userCenter",
  title: "User Center",
  component: UserCenterPage,
  order: 1,
  pinToBottom: true,
};
