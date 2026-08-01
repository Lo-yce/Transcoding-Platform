/* =========================================================
   admin.js - POST /api/admin/rebuild
   手动重算 agg:cached 缓存（运维用，需 X-Admin-Token 鉴权）
   ========================================================= */

import { json } from '../lib/cors.js';
import { rebuildAgg } from './stats.js';

export async function handleRebuild(req, env) {
  var token = req.headers.get('X-Admin-Token') || '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return json({ ok: false, error: 'unauthorized' }, req, env, 401);
  }
  var agg = await rebuildAgg(env);
  return json({ ok: true, data: agg }, req, env, 200);
}
