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
      return handleTrack(request, env);
    }

    // GET /api/stats —— 全局聚合快照
    if (path === '/api/stats' && request.method === 'GET') {
      return handleStats(request, env);
    }

    // GET /api/stats/daily?days=7 —— 近 N 天趋势
    if (path === '/api/stats/daily' && request.method === 'GET') {
      return handleStatsDaily(request, env);
    }

    // POST /api/admin/rebuild —— 手动重算（鉴权）
    if (path === '/api/admin/rebuild' && request.method === 'POST') {
      return handleRebuild(request, env);
    }

    return json({ ok: false, error: 'not_found', path: path }, request, env, 404);
  }
};
