/* =========================================================
   stats.js - 运营数据看板
   - 拉取 /api/stats（聚合）与 /api/stats/daily（趋势）
   - Chart.js 渲染：KPI + 趋势 + 厂商/设备/来源分布 + 功能排行
   - 自动刷新 + 降级处理 + 暗色模式适配
   端点复用 telemetry-config.js（迁移时只改一处）
   ========================================================= */
(function () {
  'use strict';

  // ===== 内置厂商 id→名称映射（与 vendor.js 保持同步）=====
  // 自定义厂商 id 是随机串，看板无法反查名称，回退显示 id
  var VENDOR_NAMES = {
    maidong: '脉动',
    icoke: '可口可乐',
    dongpeng: '东鹏特饮',
    'dongpeng-active': '东鹏激活码',
    bushuila: '补水啦',
    'bushuila-active': '补水啦激活码',
    jiaduobao: '加多宝',
    lehu: '乐虎',
    sandeli: '三得利',
    wanglaoji: '王老吉'
  };

  // 功能名中文映射
  var FEATURE_NAMES = {
    input_paste: '粘贴导入',
    input_file: '文件导入',
    input_manual: '手动添加',
    scan_check: '扫码自检',
    export_csv: 'CSV 导出',
    export_zip: 'ZIP 打包',
    print: '打印贴纸',
    vendor_add: '新增厂商',
    vendor_export: '导出规则',
    vendor_import: '导入规则',
    scan_mark: '标记已扫'
  };

  // 图表配色
  var COLORS = {
    primary: '#00A859',
    blue: '#0d6efd',
    orange: '#f59e0b',
    red: '#dc3545',
    purple: '#6f42c1',
    cyan: '#0dcaf0',
    pink: '#d63384',
    palette: ['#00A859', '#0d6efd', '#f59e0b', '#dc3545', '#6f42c1', '#0dcaf0', '#d63384', '#198754', '#fd7e14', '#6610f2']
  };

  // ===== DOM 引用 =====
  var $ = function (id) { return document.getElementById(id); };

  // ===== Toast =====
  var toastTimer = null;
  function toast(msg, type) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show ' + (type || '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 2600);
  }

  // ===== 推导 API base（与 telemetry-config.js 共用端点）=====
  function getApiBase() {
    var endpoint = (window.TELEMETRY_CONFIG && window.TELEMETRY_CONFIG.endpoint) || '';
    // endpoint 形如 http://host/api/track，去掉 /api/track
    return endpoint.replace(/\/api\/track\/?$/, '');
  }

  // ===== 状态切换 =====
  function showState(state, title, desc) {
    var box = $('statsState');
    var content = $('statsContent');
    if (!box || !content) return;
    if (state === 'done') {
      box.classList.add('hidden');
      content.classList.remove('hidden');
      return;
    }
    box.classList.remove('hidden');
    content.classList.add('hidden');
    box.className = 'stats-state' + (state === 'error' ? ' error' : (state === 'empty' ? ' empty' : ''));
    var icon = state === 'error' ? 'bi-exclamation-triangle' :
               state === 'empty' ? 'bi-inbox' : 'bi-arrow-repeat';
    box.innerHTML =
      '<i class="bi ' + icon + '"></i>' +
      '<h3>' + (title || '加载中…') + '</h3>' +
      '<p>' + (desc || '正在拉取匿名聚合数据') + '</p>' +
      (state === 'error' ? '<button class="btn btn-primary btn-sm" id="retryBtn"><i class="bi bi-arrow-clockwise"></i> 重试</button>' : '');
    var retry = $('retryBtn');
    if (retry) retry.addEventListener('click', loadAll);
  }

  // ===== Chart.js 是否可用 =====
  function chartReady() {
    return typeof Chart !== 'undefined';
  }

  // 保留图表实例，便于销毁重绘
  var charts = {};

  function destroyCharts() {
    Object.keys(charts).forEach(function (k) {
      try { charts[k].destroy(); } catch (e) {}
      delete charts[k];
    });
  }

  // ===== 读取 CSS 变量（适配暗色模式）=====
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // 图表文字/网格颜色（随主题）
  function chartTheme() {
    var isDark = document.documentElement.classList.contains('dark');
    return {
      text: isDark ? '#cbd5e1' : '#374151',
      muted: isDark ? '#64748b' : '#9ca3af',
      grid: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      surface: isDark ? '#1e293b' : '#ffffff'
    };
  }

  // ===== 主加载 =====
  function loadAll() {
    showState('loading');
    var base = getApiBase();
    if (!base) {
      showState('error', '未配置遥测端点', '请检查 js/telemetry-config.js 是否设置了 endpoint');
      return;
    }

    var statsUrl = base + '/api/stats';
    var dailyUrl = base + '/api/stats/daily?days=30';

    // 并行拉取
    var p1 = fetchJson(statsUrl);
    var p2 = fetchJson(dailyUrl).catch(function () { return { ok: true, data: [] }; }); // 趋势拉取失败不阻塞

    Promise.all([p1, p2]).then(function (res) {
      var agg = res[0] && res[0].ok ? (res[0].data || null) : null;
      var daily = (res[1] && res[1].ok && Array.isArray(res[1].data)) ? res[1].data : [];
      if (!agg) {
        showState('error', '数据拉取失败', res[0] && res[0].error ? res[0].error : '请确认 Workers 后端已部署且 KV 已绑定');
        return;
      }
      // 趋势优先用 daily（更准），兜底用 agg.trend
      var trend = daily.length ? daily : (agg.trend || []);
      render(agg, trend);
      showState('done');
    }).catch(function (err) {
      showState('error', '网络错误', (err && err.message) || '无法连接到统计服务');
    });
  }

  function fetchJson(url) {
    return fetch(url, { method: 'GET', mode: 'cors' })
      .then(function (res) {
        if (!res.ok) return res.json().catch(function () { return { ok: false, error: 'HTTP ' + res.status }; });
        return res.json();
      })
      .catch(function (e) {
        return { ok: false, error: (e && e.message) || 'network' };
      });
  }

  // ===== 渲染入口 =====
  function render(agg, trend) {
    renderUpdatedAt(agg);
    renderKPI(agg);
    if (!chartReady()) {
      toast('图表库未加载，仅显示数字指标', 'warning');
      return;
    }
    destroyCharts();
    renderTrend(trend);
    renderVendor(agg.vendors || {});
    renderDevice(agg.devices || {});
    renderReferrer(agg.referrers || {});
    renderFeatureRank(agg.features || {});
  }

  // 更新时间
  function renderUpdatedAt(agg) {
    var el = $('updatedAt');
    if (el) {
      if (agg.updatedAt) {
        var d = new Date(agg.updatedAt);
        el.textContent = isNaN(d.getTime()) ? agg.updatedAt : formatDateTime(d);
      } else {
        el.textContent = '—';
      }
    }
    var since = $('sinceDate');
    var note = $('sinceNote');
    if (since && note) {
      if (agg.since) {
        since.textContent = agg.since;
        note.classList.remove('hidden');
      } else {
        note.classList.add('hidden');
      }
    }
  }

  function formatDateTime(d) {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // KPI 卡片
  function renderKPI(agg) {
    var t = agg.totals || {};
    var items = [
      { icon: 'bi-eye', label: '累计访问量', value: t.pageview || 0, sub: 'PV', accent: COLORS.primary, bg: 'rgba(0,168,89,0.12)' },
      { icon: 'bi-arrow-repeat', label: '转码次数', value: t.transcode || 0, sub: '执行转码操作数', accent: COLORS.blue, bg: 'rgba(13,110,253,0.12)' },
      { icon: 'bi-qr-code', label: '转码卡密数', value: t.transcodeCards || 0, sub: '处理的卡密总量', accent: COLORS.orange, bg: 'rgba(245,158,11,0.12)' },
      { icon: 'bi-check-circle', label: '有效卡密', value: t.transcodeValid || 0, sub: '校验通过', accent: COLORS.primary, bg: 'rgba(0,168,89,0.12)' },
      { icon: 'bi-x-circle', label: '无效卡密', value: t.transcodeInvalid || 0, sub: '校验失败', accent: COLORS.red, bg: 'rgba(220,53,69,0.12)' },
      { icon: 'bi-files', label: '重复卡密', value: t.transcodeDuplicate || 0, sub: '去重命中', accent: COLORS.purple, bg: 'rgba(111,66,193,0.12)' }
    ];
    var html = items.map(function (it) {
      return '<div class="kpi-card" style="--kpi-accent:' + it.accent + ';--kpi-bg:' + it.bg + '">' +
        '<div class="kpi-icon"><i class="bi ' + it.icon + '"></i></div>' +
        '<div class="kpi-value">' + formatNum(it.value) + '</div>' +
        '<div class="kpi-label">' + it.label + '</div>' +
        '<div class="kpi-sub">' + it.sub + '</div>' +
        '</div>';
    }).join('');
    var grid = $('kpiGrid');
    if (grid) grid.innerHTML = html;
  }

  function formatNum(n) {
    n = Number(n) || 0;
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + 'w';
    return String(n);
  }

  // 趋势图
  function renderTrend(trend) {
    var el = $('trendChart');
    if (!el) return;
    var th = chartTheme();
    var labels = trend.map(function (d) { return d.date ? d.date.slice(5) : ''; });
    var pv = trend.map(function (d) { return d.pageview || 0; });
    var tc = trend.map(function (d) { return d.transcode || 0; });
    charts.trend = new Chart(el, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '访问量',
            data: pv,
            borderColor: COLORS.primary,
            backgroundColor: 'rgba(0,168,89,0.12)',
            fill: true,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 5,
            borderWidth: 2
          },
          {
            label: '转码次数',
            data: tc,
            borderColor: COLORS.blue,
            backgroundColor: 'rgba(13,110,253,0.10)',
            fill: true,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 5,
            borderWidth: 2
          }
        ]
      },
      options: lineOpts(th)
    });
  }

  function lineOpts(th) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: th.text, usePointStyle: true, boxWidth: 8 } },
        tooltip: { backgroundColor: th.surface, titleColor: th.text, bodyColor: th.text, borderColor: th.grid, borderWidth: 1 }
      },
      scales: {
        x: { ticks: { color: th.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { color: th.grid } },
        y: { beginAtZero: true, ticks: { color: th.muted, precision: 0 }, grid: { color: th.grid } }
      }
    };
  }

  // 厂商分布（柱状）
  function renderVendor(vendors) {
    var el = $('vendorChart');
    if (!el) return;
    var entries = Object.keys(vendors).map(function (k) {
      return { id: k, name: VENDOR_NAMES[k] || k, value: vendors[k] || 0 };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
    if (!entries.length) return renderEmpty(el, '暂无厂商数据');
    var th = chartTheme();
    charts.vendor = new Chart(el, {
      type: 'bar',
      data: {
        labels: entries.map(function (e) { return e.name; }),
        datasets: [{
          label: '转码次数',
          data: entries.map(function (e) { return e.value; }),
          backgroundColor: entries.map(function (_, i) { return COLORS.palette[i % COLORS.palette.length]; }),
          borderRadius: 6,
          maxBarThickness: 32
        }]
      },
      options: barOpts(th)
    });
  }

  function barOpts(th) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: th.surface, titleColor: th.text, bodyColor: th.text, borderColor: th.grid, borderWidth: 1 }
      },
      scales: {
        x: { ticks: { color: th.muted, autoSkip: false, maxRotation: 45, minRotation: 30 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: th.muted, precision: 0 }, grid: { color: th.grid } }
      }
    };
  }

  // 设备分布（饼图）
  function renderDevice(devices) {
    var el = $('deviceChart');
    if (!el) return;
    var entries = Object.keys(devices).map(function (k) {
      return { name: k === 'mobile' ? '移动端' : (k === 'pc' ? 'PC 端' : k), value: devices[k] || 0 };
    }).filter(function (e) { return e.value > 0; }).sort(function (a, b) { return b.value - a.value; });
    if (!entries.length) return renderEmpty(el, '暂无设备数据');
    var th = chartTheme();
    charts.device = new Chart(el, {
      type: 'doughnut',
      data: {
        labels: entries.map(function (e) { return e.name; }),
        datasets: [{
          data: entries.map(function (e) { return e.value; }),
          backgroundColor: [COLORS.primary, COLORS.blue, COLORS.orange, COLORS.purple, COLORS.cyan],
          borderWidth: 2,
          borderColor: th.surface
        }]
      },
      options: doughnutOpts(th)
    });
  }

  function doughnutOpts(th) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { color: th.text, usePointStyle: true, boxWidth: 8, padding: 12 } },
        tooltip: { backgroundColor: th.surface, titleColor: th.text, bodyColor: th.text, borderColor: th.grid, borderWidth: 1 }
      }
    };
  }

  // 来源分布（饼图）
  function renderReferrer(referrers) {
    var el = $('referrerChart');
    if (!el) return;
    var entries = Object.keys(referrers).map(function (k) {
      return { name: referrerLabel(k), value: referrers[k] || 0 };
    }).filter(function (e) { return e.value > 0; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 8);
    if (!entries.length) return renderEmpty(el, '暂无来源数据');
    var th = chartTheme();
    charts.referrer = new Chart(el, {
      type: 'doughnut',
      data: {
        labels: entries.map(function (e) { return e.name; }),
        datasets: [{
          data: entries.map(function (e) { return e.value; }),
          backgroundColor: COLORS.palette,
          borderWidth: 2,
          borderColor: th.surface
        }]
      },
      options: doughnutOpts(th)
    });
  }

  function referrerLabel(k) {
    if (k === 'direct') return '直接访问';
    if (k === 'internal') return '站内跳转';
    return k;
  }

  // 功能使用排行（列表 + 进度条）
  function renderFeatureRank(features) {
    var list = $('featureRank');
    if (!list) return;
    var entries = Object.keys(features).map(function (k) {
      return { key: k, name: FEATURE_NAMES[k] || k, value: features[k] || 0 };
    }).sort(function (a, b) { return b.value - a.value; });
    if (!entries.length) {
      list.innerHTML = '<li class="rank-item" style="justify-content:center;color:var(--color-text-muted);">暂无功能使用数据</li>';
      return;
    }
    var max = entries[0].value || 1;
    list.innerHTML = entries.map(function (e, i) {
      var numClass = i === 0 ? 'top1' : (i === 1 ? 'top2' : (i === 2 ? 'top3' : ''));
      var pct = Math.max(2, Math.round(e.value / max * 100));
      return '<li class="rank-item">' +
        '<span class="rank-num ' + numClass + '">' + (i + 1) + '</span>' +
        '<span class="rank-name">' + escapeHtml(e.name) + '</span>' +
        '<span class="rank-bar"><span class="rank-bar-fill" style="width:' + pct + '%;"></span></span>' +
        '<span class="rank-count">' + formatNum(e.value) + '</span>' +
        '</li>';
    }).join('');
  }

  // 空数据占位（canvas 区域）
  function renderEmpty(el, msg) {
    var wrap = el.parentElement;
    if (!wrap) return;
    // 用一个绝对定位的提示覆盖 canvas
    var existing = wrap.querySelector('.chart-empty');
    if (existing) existing.remove();
    var tip = document.createElement('div');
    tip.className = 'chart-empty';
    tip.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:13px;';
    tip.textContent = msg;
    wrap.appendChild(tip);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ===== 自动刷新 =====
  var autoTimer = null;
  var AUTO_INTERVAL = 60 * 1000;

  function setupAutoRefresh() {
    var cb = $('autoRefresh');
    if (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked) startAuto();
        else stopAuto();
      });
      if (cb.checked) startAuto();
    }
    var btn = $('refreshBtn');
    if (btn) btn.addEventListener('click', function () {
      loadAll();
      toast('已刷新', 'success');
    });
  }

  function startAuto() {
    stopAuto();
    autoTimer = setInterval(function () { loadAll(); }, AUTO_INTERVAL);
  }
  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }

  // ===== 暗色模式：监听变化，重绘图表 =====
  function watchTheme() {
    var mo = new MutationObserver(function () {
      // 主题切换后，销毁并重绘所有图表（颜色随主题）
      // 复用最近一次数据，不重新拉取
      try { redrawWithTheme(); } catch (e) {}
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  // 简化：主题变化时直接重新加载（数据有 60s 缓存，开销很小）
  function redrawWithTheme() {
    loadAll();
  }

  // ===== 启动 =====
  document.addEventListener('DOMContentLoaded', function () {
    setupAutoRefresh();
    watchTheme();
    loadAll();
  });
})();
