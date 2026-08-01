/* =========================================================
   input.js - 卡密输入模块
   - 文本框批量粘贴解析
   - 文件上传（txt/csv）解析
   - 手动逐个添加
   - 安全要求：password / 失焦清空 / 禁缓存
   ========================================================= */
window.InputModule = (function () {
  'use strict';

  // 待转码卡密列表（保持顺序，去重）
  var pendingCodes = [];

  // 解析多分隔符文本（换行/逗号/分号/空格/制表符）
  function parseText(text) {
    if (!text) return [];
    return String(text)
      .split(/[\r\n,;\s\t]+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  // 解析 CSV（取第一列，跳过表头）
  function parseCSV(text) {
    if (!text) return [];
    // 去除 BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var lines = text.split(/\r?\n/);
    var codes = [];
    lines.forEach(function (line, idx) {
      if (!line.trim()) return;
      var firstCol = line.split(',')[0] || '';
      firstCol = firstCol.trim().replace(/^"|"$/g, '');
      // 跳过表头（首行含"卡密"/"code"/"key"等字样）
      if (idx === 0 && /卡密|code|key|序号/i.test(firstCol)) return;
      if (firstCol) codes.push(firstCol);
    });
    return codes;
  }

  // 读取文件（txt/csv/xlsx），返回 Promise<string[]>
  function parseFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('未选择文件')); return; }
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error('文件超过 5MB 限制'));
        return;
      }
      var name = (file.name || '').toLowerCase();
      var isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');

      // Excel：用 SheetJS 读取首列
      if (isExcel) {
        if (typeof XLSX === 'undefined') {
          reject(new Error('Excel 解析库未加载'));
          return;
        }
        var xr = new FileReader();
        xr.onload = function (e) {
          try {
            var data = new Uint8Array(e.target.result);
            var wb = XLSX.read(data, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            var codes = [];
            rows.forEach(function (row, idx) {
              var cell = row[0];
              if (cell == null) return;
              cell = String(cell).trim();
              if (!cell) return;
              // 跳过表头（首行含"卡密"/"code"/"key"等字样）
              if (idx === 0 && /卡密|code|key|序号/i.test(cell)) return;
              codes.push(cell);
            });
            resolve(codes);
          } catch (err) {
            reject(new Error('Excel 解析失败：' + (err && err.message ? err.message : '')));
          }
        };
        xr.onerror = function () { reject(new Error('文件读取失败')); };
        xr.readAsArrayBuffer(file);
        return;
      }

      // txt / csv
      var reader = new FileReader();
      reader.onload = function (e) {
        var text = e.target.result || '';
        var codes;
        if (name.endsWith('.csv')) {
          codes = parseCSV(text);
        } else {
          codes = parseText(text);
        }
        resolve(codes);
      };
      reader.onerror = function () {
        reject(new Error('文件读取失败'));
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  // 批量添加（去重，返回新增数量）
  function addBatch(codes) {
    var added = 0;
    (codes || []).forEach(function (c) {
      c = String(c).trim();
      if (!c) return;
      if (pendingCodes.indexOf(c) === -1) {
        pendingCodes.push(c);
        added++;
      }
    });
    return added;
  }

  // 手动添加单个
  function addManual(code) {
    code = String(code || '').trim();
    if (!code) return { added: false, reason: '空卡密' };
    if (pendingCodes.indexOf(code) !== -1) {
      return { added: false, reason: '已存在' };
    }
    pendingCodes.push(code);
    return { added: true };
  }

  function removeAt(index) {
    if (index >= 0 && index < pendingCodes.length) {
      pendingCodes.splice(index, 1);
    }
  }

  function removeByCode(code) {
    var idx = pendingCodes.indexOf(code);
    if (idx !== -1) pendingCodes.splice(idx, 1);
  }

  function getAll() {
    return pendingCodes.slice();
  }

  function getCount() {
    return pendingCodes.length;
  }

  function clear() {
    pendingCodes = [];
  }

  // ===== 安全相关 =====
  // 清空所有输入框内容（失焦/刷新时调用，保留 pending 列表）
  function clearInputs() {
    var els = ['pasteInput', 'manualInput'];
    els.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
  }

  // 注册安全事件监听
  function initSecurity() {
    // 失焦（切到其他窗口/标签）时清空输入框内容
    window.addEventListener('blur', function () {
      clearInputs();
    });

    // 页面刷新/关闭前清空输入（防止浏览器某些缓存场景）
    window.addEventListener('beforeunload', function () {
      clearInputs();
    });

    // 手动输入框回车提交
    var manualInput = document.getElementById('manualInput');
    if (manualInput) {
      manualInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var addBtn = document.getElementById('addManualBtn');
          if (addBtn) addBtn.click();
        }
      });
    }
  }

  return {
    parseText: parseText,
    parseCSV: parseCSV,
    parseFile: parseFile,
    addBatch: addBatch,
    addManual: addManual,
    removeAt: removeAt,
    removeByCode: removeByCode,
    getAll: getAll,
    getCount: getCount,
    clear: clear,
    clearInputs: clearInputs,
    initSecurity: initSecurity
  };
})();
