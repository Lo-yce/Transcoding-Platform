/* =========================================================
   track.js - POST /api/track
   接收匿名事件批量，校验后写入当日聚合文档
   始终返回 2xx，避免前端重试（遥测失败不影响用户体验）
   ========================================================= */

import { json } from '../lib/cors.js';
import { sanitizeEvent } from '../lib/validate.js';
import {
  getDaily, putDaily, getMeta, putMeta, todayStr
} from '../lib/storage.js';
import { MAX_EVENTS_PER_REQUEST } from '../constants.js';

export async function handleTrack(req, env) {
  // 请求体大小限制（纵深防御）
  var cl = parseInt(req.headers.get('Content-Length') || '0', 10);
  if (cl > 16 * 1024) return json({ ok: false, error: 'payload_too_large' }, req, env, 413);

  var body;
  try { body = await req.json(); }
  catch (e) { return json({ ok: false, error: 'invalid_json' }, req, env, 400); }

  var events = body && body.events;
  if (!Array.isArray(events) || events.length === 0) {
    return json({ ok: false, error: 'no_events' }, req, env, 400);
  }
  if (events.length > MAX_EVENTS_PER_REQUEST) {
    events = events.slice(0, MAX_EVENTS_PER_REQUEST);
  }

  var dateStr = todayStr();
  var doc = await getDaily(env, dateStr);

  // 首次写入记录起始日期
  var since = await getMeta(env, 'since');
  if (!since) {
    await putMeta(env, 'since', { since: dateStr, version: 1 });
  }

  for (var i = 0; i < events.length; i++) {
    var res = sanitizeEvent(events[i]);
    if (!res.valid) {
      console.log('[telemetry-drop]', res.reason);
      continue;
    }
    if (res.warnings && res.warnings.length) {
      res.warnings.forEach(function (w) {
        console.log('[telemetry-warn]', w, res.event);
      });
    }
    applyEvent(doc, res);
  }

  await putDaily(env, dateStr, doc);

  // 始终返回 2xx，避免前端重试
  return json({ ok: true, accepted: events.length }, req, env, 200);
}

// 将单个事件增量应用到当日文档
function applyEvent(doc, evt) {
  switch (evt.event) {
    case 'pageview':
      doc.pageview++;
      var dev = evt.props.device || 'unknown';
      doc.devices[dev] = (doc.devices[dev] || 0) + 1;
      var ref = evt.props.referrer || 'direct';
      doc.referrers[ref] = (doc.referrers[ref] || 0) + 1;
      break;
    case 'transcode':
      doc.transcode++;
      doc.transcodeCards += evt.props.total || 0;
      doc.transcodeValid += evt.props.valid || 0;
      doc.transcodeInvalid += evt.props.invalid || 0;
      doc.transcodeDuplicate += evt.props.duplicate || 0;
      var vid = evt.props.vendorId || 'unknown';
      doc.vendors[vid] = (doc.vendors[vid] || 0) + 1;
      break;
    case 'feature':
      var fn = evt.props.name;
      doc.features[fn] = (doc.features[fn] || 0) + 1;
      break;
    case 'setting':
      // 设置变更不计入聚合计数（可选未来单独存储）
      break;
  }
}
