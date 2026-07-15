import { createApp } from "vue";
// 页面加载即创建到后端的 WebSocket 桥并注册全部推送处理器；send() 在连接建立前
// 自动排队，故建链不会阻塞应用挂载。
import { connectBridge } from "./bridge/connect";
import { router } from "./router";
import App from "./App.vue";

connectBridge();
createApp(App).use(router).mount("#app");
