/* =========================================================
   vendor.js - 厂商管理模块
   - 内置脉动规则
   - 自定义厂商扩展（localStorage 存储，仅存规则不存卡密）
   ========================================================= */
window.VendorModule = (function () {
  'use strict';

  var CUSTOM_KEY = 'cardtool_custom_vendors';
  var CURRENT_KEY = 'cardtool_current_vendor';

  // 内置厂商规则
  var BUILTIN_VENDORS = [
    {
      id: 'maidong',
      name: '脉动',
      urlTemplate: 'https://dbcb2b.cn/S/{卡密}',
      regex: '^[A-Za-z0-9]{15}$',
      length: 15,
      icon: 'cup-straw',
      color: '#00A859',
      builtin: true
    },
    {
      id: 'icoke',
      name: '可口可乐',
      urlTemplate: 'http://i.icoke.cn/KO/{卡密}',
      regex: '^[A-Z0-9]{16}$',
      length: 16,
      icon: 'cup-fill',
      color: '#E61A27',
      builtin: true
    },
    {
      id: 'dongpeng',
      name: '东鹏特饮',
      urlTemplate: 'http://x.5dp.top/{卡密}',
      regex: '^[A-Za-z0-9]{12}$',
      length: 12,
      icon: 'battery-charging',
      color: '#0066CC',
      builtin: true
    },
    {
      id: 'dongpeng-active',
      name: '东鹏激活码',
      urlTemplate: 'http://z.5dp.top/{卡密}',
      regex: '^[A-Za-z0-9]{12}$',
      length: 12,
      icon: 'lightning-charge',
      color: '#1E90FF',
      builtin: true
    },
    {
      id: 'bushuila',
      name: '补水啦',
      urlTemplate: 'http://y.5dp.top/{卡密}',
      regex: '^[A-Za-z0-9]{12}$',
      length: 12,
      icon: 'droplet',
      color: '#00BFFF',
      builtin: true
    },
    {
      id: 'bushuila-active',
      name: '补水啦激活码',
      urlTemplate: 'http://x.5dp.top/{卡密}',
      regex: '^[A-Za-z0-9]{12}$',
      length: 12,
      icon: 'droplet-half',
      color: '#87CEEB',
      builtin: true
    },
    {
      id: 'jiaduobao',
      name: '加多宝',
      urlTemplate: 'HTTPS://S.G4A.CN/{卡密}',
      regex: '^[A-Z0-9]{14}$',
      length: 14,
      icon: 'cup-hot',
      color: '#C8102E',
      builtin: true
    },
    {
      id: 'lehu',
      name: '乐虎',
      urlTemplate: 'http://5l2.cn/d/{卡密}',
      regex: '^[A-Za-z0-9]{8}$',
      length: 8,
      icon: 'fuel-pump',
      color: '#F59E0B',
      builtin: true
    },
    {
      id: 'sandeli',
      name: '三得利',
      urlTemplate: 'https://n.shcb.cc/{卡密}',
      regex: '^[A-Za-z0-9]{12}$',
      length: 12,
      icon: 'cup',
      color: '#006400',
      builtin: true
    },
    {
      id: 'wanglaoji',
      name: '王老吉',
      urlTemplate: 'http://s3.lsa0.cn/N/00F2/200F{卡密}',
      regex: '^[A-Z0-9]{14}$',
      length: 14,
      icon: 'cup-hot',
      color: '#C40022',
      builtin: true
    }
  ];

  function getBuiltin() {
    // 深拷贝，避免外部修改
    return BUILTIN_VENDORS.map(function (v) {
      return Object.assign({}, v);
    });
  }

  function getCustom() {
    try {
      var raw = localStorage.getItem(CUSTOM_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustom(list) {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function getAll() {
    return getBuiltin().concat(getCustom());
  }

  function getById(id) {
    var all = getAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
    return null;
  }

  function getCurrent() {
    var id = localStorage.getItem(CURRENT_KEY);
    var v = getById(id);
    if (!v) {
      v = getBuiltin()[0];
      if (v) setCurrent(v.id);
    }
    return v;
  }

  function setCurrent(id) {
    try {
      localStorage.setItem(CURRENT_KEY, id);
    } catch (e) {}
  }

  function addCustom(vendor) {
    var list = getCustom();
    vendor.id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    vendor.builtin = false;
    list.push(vendor);
    return saveCustom(list) ? vendor : null;
  }

  function removeCustom(id) {
    var list = getCustom().filter(function (v) { return v.id !== id; });
    return saveCustom(list);
  }

  // 填充 select 下拉框
  function renderSelect(selectEl) {
    if (!selectEl) return;
    var current = getCurrent();
    var all = getAll();
    selectEl.innerHTML = '';

    var builtinGroup = document.createElement('optgroup');
    builtinGroup.label = '内置厂商';
    var customGroup = document.createElement('optgroup');
    customGroup.label = '自定义厂商';

    all.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.name;
      if (current && v.id === current.id) opt.selected = true;
      (v.builtin ? builtinGroup : customGroup).appendChild(opt);
    });

    selectEl.appendChild(builtinGroup);
    if (customGroup.children.length) {
      selectEl.appendChild(customGroup);
    }
  }

  // 拼接 URL
  function buildUrl(vendor, code) {
    if (!vendor) return code;
    return vendor.urlTemplate.replace('{卡密}', code);
  }

  // 从输入行中提取卡密
  // 支持纯卡密，也支持完整 URL（基于厂商 urlTemplate 反向提取）
  // 例如输入 "https://dbcb2b.cn/S/Bpjlgfs518XMDMS" 可提取出 "Bpjlgfs518XMDMS"
  function extractCode(line, vendor) {
    var s = String(line == null ? '' : line).trim();
    if (!s) return '';
    // 如果是 URL，尝试用厂商 urlTemplate 反向提取卡密
    if (vendor && /^https?:\/\//i.test(s)) {
      try {
        var parts = vendor.urlTemplate.split('{卡密}');
        if (parts.length === 2) {
          var regexStr = '^' + escapeRegex(parts[0]) + '(.+)' + escapeRegex(parts[1]) + '$';
          var re = new RegExp(regexStr);
          var m = s.match(re);
          if (m && m[1]) return m[1];
        }
      } catch (e) {}
      // 反向提取失败，退化为取 URL path 最后一段
      var pathMatch = s.match(/\/([^\/?#]+)(?:[?#]|$)/);
      if (pathMatch && pathMatch[1]) return pathMatch[1];
    }
    return s;
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 根据完整 URL 自动识别厂商（遍历厂商 urlTemplate 前缀匹配）
  function autoDetectVendor(line) {
    var s = String(line == null ? '' : line).trim();
    if (!s || !/^https?:\/\//i.test(s)) return null;
    var all = getAll();
    var lower = s.toLowerCase();
    for (var i = 0; i < all.length; i++) {
      var v = all[i];
      if (!v.urlTemplate) continue;
      var parts = v.urlTemplate.split('{卡密}');
      if (parts.length !== 2) continue;
      var prefix = parts[0];
      if (prefix && lower.indexOf(prefix.toLowerCase()) === 0) {
        return v;
      }
    }
    return null;
  }

  // 渲染厂商信息提示
  function renderInfo(infoEl, vendor) {
    if (!infoEl || !vendor) return;
    infoEl.innerHTML =
      '<div class="info-line"><span>URL 模板</span><strong>' + escapeHtml(vendor.urlTemplate) + '</strong></div>' +
      '<div class="info-line"><span>卡密规则</span><strong>' + escapeHtml(vendor.regex) + '</strong></div>' +
      '<div class="info-line"><span>预期长度</span><strong>' + (vendor.length || '不限') + '</strong></div>';
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 导出自定义厂商为 JSON 字符串（用于备份下载）
  function exportCustom() {
    var list = getCustom();
    var payload = {
      app: 'cardtool',
      type: 'vendor-rules',
      version: 1,
      exportedAt: new Date().toISOString(),
      vendors: list
    };
    return JSON.stringify(payload, null, 2);
  }

  // 从 JSON 字符串导入厂商规则（按 name 合并去重）
  // 返回 { added, skipped, error }
  function importCustom(jsonText) {
    var parsed;
    try { parsed = JSON.parse(jsonText); } catch (e) {
      return { added: 0, skipped: 0, error: 'JSON 格式无效' };
    }
    var incoming = Array.isArray(parsed) ? parsed : (parsed && parsed.vendors);
    if (!Array.isArray(incoming)) {
      return { added: 0, skipped: 0, error: '未找到厂商规则数组' };
    }
    var list = getCustom();
    var existingNames = {};
    list.forEach(function (v) { if (v.name) existingNames[v.name] = true; });
    var added = 0, skipped = 0;
    incoming.forEach(function (v) {
      if (!v || !v.name || !v.urlTemplate || !v.regex) { skipped++; return; }
      if (existingNames[v.name]) { skipped++; return; }
      list.push({
        id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: String(v.name),
        urlTemplate: String(v.urlTemplate),
        regex: String(v.regex),
        length: parseInt(v.length, 10) || 0,
        icon: v.icon || 'cup-straw',
        color: v.color || '#00A859',
        builtin: false
      });
      existingNames[v.name] = true;
      added++;
    });
    if (added > 0) saveCustom(list);
    return { added: added, skipped: skipped, error: null };
  }

  return {
    getBuiltin: getBuiltin,
    getCustom: getCustom,
    getAll: getAll,
    getById: getById,
    getCurrent: getCurrent,
    setCurrent: setCurrent,
    addCustom: addCustom,
    removeCustom: removeCustom,
    renderSelect: renderSelect,
    renderInfo: renderInfo,
    buildUrl: buildUrl,
    extractCode: extractCode,
    autoDetectVendor: autoDetectVendor,
    exportCustom: exportCustom,
    importCustom: importCustom,
    BUILTIN: BUILTIN_VENDORS
  };
})();
