/* =========================================================
   validate.js - 事件清洗与校验
   过滤单个事件，剥离敏感字段，校验枚举值
   返回 { valid, event, ts, props, warnings }
   ========================================================= */

import { EVENT_FIELDS, FEATURE_NAMES, SETTING_NAMES, SENSITIVE_KEYS } from '../constants.js';

export function sanitizeEvent(evt) {
  if (!evt || typeof evt !== 'object') return { valid: false, reason: 'not_object' };

  var event = String(evt.event || '').toLowerCase();
  var allowed = EVENT_FIELDS[event];
  if (!allowed) return { valid: false, reason: 'unknown_event:' + event };

  var warnings = [];
  var props = {};

  if (evt.props && typeof evt.props === 'object') {
    Object.keys(evt.props).forEach(function (k) {
      // 敏感字段一律丢弃并告警
      if (SENSITIVE_KEYS.indexOf(k) >= 0) {
        warnings.push('dropped_sensitive:' + k);
        return;
      }
      // 只保留白名单字段
      if (allowed.indexOf(k) >= 0) {
        props[k] = evt.props[k];
      }
    });
  }

  // 枚举值校验
  if (event === 'feature') {
    if (!props.name || !FEATURE_NAMES.has(String(props.name))) {
      return { valid: false, reason: 'invalid_feature_name' };
    }
  }
  if (event === 'setting') {
    if (!props.name || !SETTING_NAMES.has(String(props.name))) {
      return { valid: false, reason: 'invalid_setting_name' };
    }
    props.value = String(props.value).slice(0, 50); // 限制长度
  }

  // transcode 数值字段强转 + 边界保护
  if (event === 'transcode') {
    ['total', 'valid', 'invalid', 'duplicate'].forEach(function (k) {
      var n = parseInt(props[k], 10);
      if (isNaN(n) || n < 0) n = 0;
      if (n > 100000) n = 100000; // 单次上报上限，防异常
      props[k] = n;
    });
    props.preview = !!props.preview;
    props.vendorId = String(props.vendorId || 'unknown').slice(0, 60);
  }

  // pageview 字段清洗
  if (event === 'pageview') {
    props.referrer = String(props.referrer || 'direct').slice(0, 200);
    props.device = (props.device === 'mobile' || props.device === 'pc') ? props.device : 'unknown';
    props.tz = String(props.tz || '').slice(0, 60);
  }

  return {
    valid: true,
    event: event,
    ts: parseInt(evt.ts, 10) || Date.now(),
    props: props,
    warnings: warnings
  };
}
