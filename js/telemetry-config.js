/* =========================================================
   telemetry-config.js - 遥测配置（端点外置，便于迁移）
   与 assets/qq/qq-config.js 同模式：修改后刷新页面即生效
   迁移到自建服务器时只需改 endpoint 一行
   ========================================================= */
window.TELEMETRY_CONFIG = {
  // 上报端点：本地开发用 wrangler dev 默认端口 8787
  // 部署后改为 Cloudflare Worker 域名，如：
  // 'https://cardtool-stats.<你的子域>.workers.dev/api/track'
  endpoint: 'http://localhost:8787/api/track',

  // 总开关：部署后置 true，调试时可临时关闭
  enabled: true,

  // 采样率 1.0 = 全量上报；流量大时可降到 0.1
  sampleRate: 1.0,

  // 批量 flush 间隔（毫秒）
  batchInterval: 5000,

  // 队列达此数量立即 flush
  batchSize: 10
};
