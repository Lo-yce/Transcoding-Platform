/* =========================================================
   telemetry.js - 匿名遥测模块
   - 事件白名单过滤（前端第一道，Worker 端二次过滤）
   - fetch 为主通道 + sendBeacon 为卸载通道
   - 批量队列 + 定时/卸载 flush
   - 低频高价值事件（转码）立即 flush
   - opt-out / DoNotTrack / 采样
   挂 window.TelemetryModule，与现有 vendor.js 等同模式
   隐私边界：绝不收集卡密明文/URL/二维码等敏感数据
   ========================================================= */
window.TelemetryModule = (function () {
  'use strict';

  // 事件允许的字段白名单（必须与 workers/src/constants.js 保持一致）
  var EVENT_FIELDS = {
    pageview: ['referrer', 'device', 'tz'],
    transcode: ['vendorId', 'total', 'valid', 'invalid', 'duplicate', 'preview'],
    feature: ['name'],
    setting: ['name', 'value']
  };

  // 敏感字段黑名单：前端即剥离（Worker 端会再剥一次）
  var SENSITIVE_KEYS = [
    'code', 'codes', 'url', 'dataURL', 'regex', 'urlTemplate',
    'qq', 'phone', 'email', 'token', 'password', 'cookie', 'ip'
  ];

  // 低频高价值事件：入队后立即 flush，不等定时器
  var IMMEDIATE_FLUSH_EVENTS = { transcode: true };

  var cfg = null;
  var queue = [];
  var flushTimer = null;
  var inited = false;

  function getConfig() {
    if (cfg) return cfg;
    cfg = Object.assign({
      endpoint: '',
      enabled: true,
      sampleRate: 1.0,
      batchInterval: 5000,
      batchSize: 10
    }, window.TELEMETRY_CONFIG || {});
    return cfg;
  }

  // 用户是否 opted out
  function isOptedOut() {
    try {
      if (localStorage.getItem('telemetry_opt_out') === '1') return true;
    } catch (e) {}
    // 尊重浏览器 DoNotTrack
    var dnt = navigator.doNotTrack || window.doNotTrack;
    if (dnt === '1' || dnt === 'yes') return true;
    return false;
  }

  function isEnabled() {
    var c = getConfig();
    return !!(c.enabled && c.endpoint);
  }

  // 隐私过滤：按事件白名单浅拷贝允许字段，剥离敏感字段
  function sanitizeProps(event, props) {
    var allowed = EVENT_FIELDS[event];
    if (!allowed) return null;
    var clean = {};
    if (props && typeof props === 'object') {
      Object.keys(props).forEach(function (k) {
        if (SENSITIVE_KEYS.indexOf(k) >= 0) return; // 敏感字段丢弃
        if (allowed.indexOf(k) >= 0) clean[k] = props[k];
      });
    }
    return clean;
  }

  // 主埋点函数
  function track(event, props) {
    try {
      if (!isEnabled() || isOptedOut()) return;
      var c = getConfig();
      // 采样
      if (typeof c.sampleRate === 'number' && c.sampleRate < 1.0) {
        if (Math.random() > c.sampleRate) return;
      }
      var clean = sanitizeProps(event, props);
      if (clean === null) return; // 未知事件类型
      queue.push({ event: event, ts: Date.now(), props: clean });
      // 队列满立即 flush
      if (queue.length >= c.batchSize) {
        flush();
      } else if (IMMEDIATE_FLUSH_EVENTS[event]) {
        // 低频高价值事件（如转码）：立即 flush，不等 5 秒定时器
        // 避免"转完即走"时事件丢失
        flush();
      }
    } catch (e) { /* 静默，绝不影响主流程 */ }
  }

  // 便捷封装：转码事件
  function trackTranscode(vendor, stat, opts) {
    try {
      track('transcode', {
        vendorId: vendor ? vendor.id : 'unknown',
        total: stat ? stat.total : 0,
        valid: stat ? stat.valid : 0,
        invalid: stat ? stat.invalid : 0,
        duplicate: stat ? stat.duplicate : 0,
        preview: !!(opts && opts.preview)
      });
    } catch (e) {}
  }

  // 便捷封装：功能使用事件
  function trackFeature(name, extra) {
    try {
      var props = { name: name };
      if (extra && typeof extra === 'object') {
        Object.keys(extra).forEach(function (k) {
          props[k] = extra[k];
        });
      }
      track('feature', props);
    } catch (e) {}
  }

  // 用 fetch 发送（主通道，支持 CORS 预检）
  function sendFetch(payload) {
    try {
      var c = getConfig();
      fetch(c.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        mode: 'cors'
      }).catch(function () {});
    } catch (e) {}
  }

  // 用 sendBeacon 发送（卸载通道，页面卸载时浏览器保证发出）
  // 用 text/plain 类型避免 CORS 预检（application/json 会触发预检，
  // 而页面卸载时预检来不及完成）
  function sendBeacon(payload) {
    try {
      var c = getConfig();
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'text/plain' });
        return navigator.sendBeacon(c.endpoint, blob);
      }
    } catch (e) {}
    return false;
  }

  // 批量上报
  function flush(useBeacon) {
    try {
      if (!isEnabled() || !queue.length) return;
      var payload = JSON.stringify({ events: queue });

      if (useBeacon) {
        // 卸载时优先用 sendBeacon（浏览器保证发出）
        // sendBeacon 失败则回退 fetch
        if (!sendBeacon(payload)) {
          sendFetch(payload);
        }
      } else {
        // 正常情况用 fetch（支持 CORS 预检）
        sendFetch(payload);
      }

      // 无论是否成功都清空队列，避免内存堆积（遥测失败不重试）
      queue = [];
    } catch (e) {
      queue = [];
    }
  }

  // 初始化
  function init() {
    if (inited) return;
    inited = true;
    try {
      if (!isEnabled() || isOptedOut()) return;
      var c = getConfig();

      // 定时 flush（正常通道）
      flushTimer = setInterval(function () { flush(false); }, c.batchInterval);

      // 页面卸载前最后一搏（用 sendBeacon 保证发出）
      window.addEventListener('pagehide', function () { flush(true); });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flush(true);
      });

      // 触发 pageview 事件
      var referrer = 'direct';
      try {
        if (document.referrer) {
          var r = new URL(document.referrer);
          referrer = (r.origin === window.location.origin) ? 'internal' : r.origin;
        }
      } catch (e) {}
      var device = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'pc';
      var tz = '';
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch (e) {}
      track('pageview', { referrer: referrer, device: device, tz: tz });
    } catch (e) {}
  }

  // 手动 opt-out 切换（供设置面板调用）
  function setOptOut(optOut) {
    try {
      if (optOut) localStorage.setItem('telemetry_opt_out', '1');
      else localStorage.removeItem('telemetry_opt_out');
    } catch (e) {}
  }

  function isOptOut() {
    return isOptedOut();
  }

  return {
    init: init,
    track: track,
    trackTranscode: trackTranscode,
    trackFeature: trackFeature,
    flush: flush,
    setOptOut: setOptOut,
    isOptOut: isOptOut
  };
})();
