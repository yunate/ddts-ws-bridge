// 装配点：唯一 import 具体页面并登记它们的地方。新增一个 URL 页面：建 pages/<name>/ 后，
// 在此追加一行 import + registerPage 即可。
import { pageRegistry } from "./registry";
import { mainPage } from "./main";
import { otherPage } from "./other";

pageRegistry.registerPage(mainPage);
pageRegistry.registerPage(otherPage);
