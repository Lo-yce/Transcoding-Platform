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
  if (!env || !env.STATS) return emptyDaily(dateStr);
  try {
    var raw = await env.STATS.get(dateKey(dateStr));
    if (!raw) return emptyDaily(dateStr);
    var doc = JSON.parse(raw);
    // 结构补全：旧版文档可能缺失嵌套 map
    doc.vendors = doc.vendors || {};
    doc.features = doc.features || {};
    doc.devices = doc.devices || {};
    doc.referrers = doc.referrers || {};
    doc.pageview = doc.pageview || 0;
    doc.transcode = doc.transcode || 0;
    doc.transcodeCards = doc.transcodeCards || 0;
    doc.transcodeValid = doc.transcodeValid || 0;
    doc.transcodeInvalid = doc.transcodeInvalid || 0;
    doc.transcodeDuplicate = doc.transcodeDuplicate || 0;
    return doc;
  } catch (e) {
    return emptyDaily(dateStr);
  }
}

export async function putDaily(env, dateStr, doc) {
  if (!env || !env.STATS) return false;
  try {
    doc.updatedAt = new Date().toISOString();
    await env.STATS.put(dateKey(dateStr), JSON.stringify(doc));
    return true;
  } catch (e) {
    console.error('[storage] putDaily failed', e && e.message);
    return false;
  }
}

export async function listDaily(env, days) {
  if (!env || !env.STATS) return [];
  try {
    var result = await env.STATS.list({ prefix: 'daily:' });
    var keys = (result && result.keys) || [];
    // 按键名倒序（YYYY-MM-DD 字典序 = 时间倒序）
    keys.sort(function (a, b) { return a.name < b.name ? 1 : (a.name > b.name ? -1 : 0); });
    if (days && days > 0) keys = keys.slice(0, days);
    var docs = [];
    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = await env.STATS.get(keys[i].name);
        if (raw) {
          var doc = JSON.parse(raw);
          doc.vendors = doc.vendors || {};
          doc.features = doc.features || {};
          doc.devices = doc.devices || {};
          doc.referrers = doc.referrers || {};
          docs.push(doc);
        }
      } catch (e) {}
    }
    return docs;
  } catch (e) {
    return [];
  }
}

export async function getAgg(env) {
  if (!env || !env.STATS) return null;
  try {
    var raw = await env.STATS.get('agg:cached');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export async function putAgg(env, doc) {
  if (!env || !env.STATS) return false;
  try {
    doc.updatedAt = new Date().toISOString();
    await env.STATS.put('agg:cached', JSON.stringify(doc));
    return true;
  } catch (e) { return false; }
}

export async function getMeta(env, key) {
  if (!env || !env.STATS) return null;
  try {
    var raw = await env.STATS.get('meta:' + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export async function putMeta(env, key, val) {
  if (!env || !env.STATS) return false;
  try {
    await env.STATS.put('meta:' + key, JSON.stringify(val));
    return true;
  } catch (e) { return false; }
}
