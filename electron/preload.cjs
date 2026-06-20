// 最小 preload：contextIsolation 下安全暴露少量資訊給前端（目前用不到，預留擴充點）
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("edugrade", {
  isDesktop: true,
  platform: process.platform,
});
