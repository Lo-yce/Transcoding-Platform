/* =========================================================
   index.js - Cloudflare Worker 入口
   路由分发到各 handler
   Web 标准 Request/Response API（Node 18+ 原生支持，便于迁移）
   ========================================================= */

import { handleOptions, json } from './lib/cors.js';
import { handleTrack } from './handlers/track.js';
import { handleStats, handleStatsDaily } from './handlers/stats.js';
import { handleRebuild } from './handlers/admin.js';

export default {
  async fetch(request, env, ctx) {
    var url;
    try { url = new URL(request.url); }
    catch (e) { return new Response('Bad Request', { status: 400 }); }
    var path = url.pathname;

    // OPTIONS 预检
    if (request.method === 'OPTIONS') return handleOptions(request, env);

    // 全局 try/catch：任何 handler 内部异常都返回 500 而非裸异常
    // 避免 Cloudflare 控制台计入错误计数
    try {
      // 健康检查
      if (path === '/api/health' && request.method === 'GET') {
        return json({
          ok: true,
          service: 'cardtool-stats',
          time: new Date().toISOString()
        }, request, env, 200);
      }

      // POST /api/track —— 匿名事件上报
      if (path === '/api/track' && request.method === 'POST') {
        return await handleTrack(request, env);
      }

      // GET /api/stats —— 全局聚合快照
      if (path === '/api/stats' && request.method === 'GET') {
        return await handleStats(request, env);
      }

      // GET /api/stats/daily?days=7 —— 近 N 天趋势
      if (path === '/api/stats/daily' && request.method === 'GET') {
        return await handleStatsDaily(request, env);
      }

      // POST /api/admin/rebuild —— 手动重算（鉴权）
      if (path === '/api/admin/rebuild' && request.method === 'POST') {
        return await handleRebuild(request, env);
      }

      return json({ ok: false, error: 'not_found', path: path }, request, env, 404);
    } catch (err) {
      console.error('[worker-error]', err && err.message, err && err.stack);
      return json({ ok: false, error: 'internal', message: err && err.message || 'unknown' }, request, env, 500);
    }
  }
};
