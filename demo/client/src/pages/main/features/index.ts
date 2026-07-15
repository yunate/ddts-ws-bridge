// 装配点：唯一 import 具体功能并登记它们的地方。新增一个 tab：建 features/<name>/ 后，
// 在此追加一行 import + registerFeature 即可。
import { featureRegistry } from "./registry";
import { aboutFeature } from "./about";
import { userCenterFeature } from "./userCenter";

featureRegistry.registerFeature(aboutFeature);
featureRegistry.registerFeature(userCenterFeature);
