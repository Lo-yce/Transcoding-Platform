/* =========================================================
   storage.js - KV 适配层（可迁移性关键）
   封装所有 KV 访问，迁移到自建后端时只需实现同接口
   Cloudflare KV binding: env.STATS
   ========================================================= */

export function dateKey(d) {
  if (typeof d === 'string') return 'daily:' + d;
  var y = d.getUTCFullYear();
  var m = String(d.getUTCMonth() + 1).padStart(2, '0');
  var day = String(d.getUTCDate()).padStart(2, '0');
  return 'daily:' + y + '-' + m + '-' + day;
}

export function todayKey() {
  return dateKey(new Date());
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function emptyDaily(dateStr) {
  return {
    date: dateStr,
    pageview: 0, transcode: 0, transcodeCards: 0,
    transcodeValid: 0, transcodeInvalid: 0, transcodeDuplicate: 0,
    vendors: {}, features: {}, devices: {}, referrers: {},
    updatedAt: new Date().toISOString()
  };
}

export function emptyAgg() {
  return {
    totals: {
      pageview: 0, transcode: 0, transcodeCards: 0,
      transcodeValid: 0, transcodeInvalid: 0, transcodeDuplicate: 0
    },
    vendors: {}, features: {}, devices: {}, referrers: {},
    trend: [], since: null, updatedAt: null
  };
}

export async function getDaily(env, dateStr) {
  var raw = await env.STATS.get(dateKey(dateStr));
  if (!raw) return emptyDaily(dateStr);
  try { return JSON.parse(raw); }
  catch (e) { return emptyDaily(dateStr); }
}

export async function putDaily(env, dateStr, doc) {
  doc.updatedAt = new Date().toISOString();
  await env.STATS.put(dateKey(dateStr), JSON.stringify(doc));
}

export async function listDaily(env, days) {
  var result = await env.STATS.list({ prefix: 'daily:' });
  var keys = (result && result.keys) || [];
  // 按键名倒序（YYYY-MM-DD 字典序 = 时间倒序）
  keys.sort(function (a, b) { return a.name < b.name ? 1 : (a.name > b.name ? -1 : 0); });
  if (days && days > 0) keys = keys.slice(0, days);
  var docs = [];
  for (var i = 0; i < keys.length; i++) {
    var raw = await env.STATS.get(keys[i].name);
    if (raw) {
      try { docs.push(JSON.parse(raw)); } catch (e) {}
    }
  }
  return docs;
}

export async function getAgg(env) {
  var raw = await env.STATS.get('agg:cached');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export async function putAgg(env, doc) {
  doc.updatedAt = new Date().toISOString();
  await env.STATS.put('agg:cached', JSON.stringify(doc));
}

export async function getMeta(env, key) {
  var raw = await env.STATS.get('meta:' + key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export async function putMeta(env, key, val) {
  await env.STATS.put('meta:' + key, JSON.stringify(val));
}
