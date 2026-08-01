/* =========================================================
   stats.js - GET /api/stats 与 /api/stats/daily
   聚合查询：agg 缓存 60s 懒刷新，过期则遍历 daily: 重算
   ========================================================= */

import { json } from '../lib/cors.js';
import {
  getAgg, putAgg, listDaily, emptyAgg
} from '../lib/storage.js';

var AGG_TTL_MS = 60 * 1000; // 60 秒懒刷新

// GET /api/stats —— 返回全局聚合快照
export async function handleStats(req, env) {
  var agg = await getAgg(env);
  var now = Date.now();
  var stale = !agg || !agg.updatedAt ||
    (now - new Date(agg.updatedAt).getTime() > AGG_TTL_MS);
  if (stale) {
    agg = await rebuildAgg(env);
  }
  return json({ ok: true, data: agg || emptyAgg() }, req, env, 200);
}

// GET /api/stats/daily?days=7 —— 返回近 N 天日聚合数组（看板趋势图用）
export async function handleStatsDaily(req, env) {
  var url = new URL(req.url);
  var days = parseInt(url.searchParams.get('days') || '7', 10);
  if (isNaN(days) || days < 1) days = 7;
  if (days > 90) days = 90;
  var docs = await listDaily(env, days);
  // 升序返回（旧→新，便于图表绘制）
  docs.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return json({ ok: true, data: docs }, req, env, 200);
}

// 重算聚合：遍历近 30 天 daily: 合并写入 agg:cached
export async function rebuildAgg(env) {
  var docs = await listDaily(env, 30);
  if (!docs.length) {
    var empty = emptyAgg();
    await putAgg(env, empty);
    return empty;
  }
  var agg = emptyAgg();
  docs.forEach(function (d) {
    agg.totals.pageview += d.pageview || 0;
    agg.totals.transcode += d.transcode || 0;
    agg.totals.transcodeCards += d.transcodeCards || 0;
    agg.totals.transcodeValid += d.transcodeValid || 0;
    agg.totals.transcodeInvalid += d.transcodeInvalid || 0;
    agg.totals.transcodeDuplicate += d.transcodeDuplicate || 0;
    mergeMap(agg.vendors, d.vendors);
    mergeMap(agg.features, d.features);
    mergeMap(agg.devices, d.devices);
    mergeMap(agg.referrers, d.referrers);
    agg.trend.push({
      date: d.date,
      pageview: d.pageview || 0,
      transcode: d.transcode || 0,
      transcodeCards: d.transcodeCards || 0
    });
  });
  agg.trend.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  agg.since = docs[0].date;
  await putAgg(env, agg);
  return agg;
}

function mergeMap(target, source) {
  if (!source) return;
  Object.keys(source).forEach(function (k) {
    target[k] = (target[k] || 0) + (source[k] || 0);
  });
}
