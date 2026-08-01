/* =========================================================
   export.js - 导出模块
   - 单张二维码下载
   - 批量打包 ZIP（依赖 JSZip）
   - 导出 CSV 清单（UTF-8 BOM）
   ========================================================= */
window.ExportModule = (function () {
  'use strict';

  // 下载 Blob
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 200);
  }

  // dataURL 转 Blob
  function dataURLToBlob(dataURL) {
    if (!dataURL) return null;
    var arr = dataURL.split(',');
    if (arr.length < 2) return null;
    var mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/png';
    var bstr = atob(arr[1]);
    var n = bstr.length;
    var u8 = new Uint8Array(n);
    for (var i = 0; i < n; i++) u8[i] = bstr.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  // dataURL 提取 base64 部分
  function dataURLToBase64(dataURL) {
    if (!dataURL) return '';
    var idx = dataURL.indexOf(',');
    return idx >= 0 ? dataURL.slice(idx + 1) : '';
  }

  // 文件名安全化（去除非法字符）
  function safeName(s) {
    return String(s || '').replace(/[\\/:*?"<>|]/g, '_');
  }

  // 时间戳
  function timestamp() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  // 单张二维码下载
  function downloadSingle(card) {
    if (!card || !card.dataURL) {
      return false;
    }
    var blob = dataURLToBlob(card.dataURL);
    if (!blob) return false;
    var filename = safeName(card.code) + (card.vendor ? '_' + safeName(card.vendor) : '') + '.png';
    downloadBlob(blob, filename);
    return true;
  }

  // 打包 ZIP
  function downloadZip(cards) {
    if (typeof JSZip === 'undefined') {
      return Promise.reject(new Error('JSZip 未加载'));
    }
    var valid = (cards || []).filter(function (c) { return c.dataURL && c.status === 'valid'; });
    if (!valid.length) {
      return Promise.reject(new Error('没有可导出的有效二维码'));
    }
    var zip = new JSZip();
    var used = {};
    valid.forEach(function (c) {
      var base = safeName(c.code) + (c.vendor ? '_' + safeName(c.vendor) : '');
      var name = base + '.png';
      // 避免重名
      var n = 1;
      while (used[name]) {
        name = base + '_' + n + '.png';
        n++;
      }
      used[name] = true;
      zip.file(name, dataURLToBase64(c.dataURL), { base64: true });
    });
    return zip.generateAsync({ type: 'blob' }).then(function (blob) {
      downloadBlob(blob, '卡密二维码_' + timestamp() + '.zip');
      return valid.length;
    });
  }

  // 导出 CSV
  function downloadCSV(cards) {
    var rows = (cards || []);
    if (!rows.length) return false;
    var header = ['序号', '卡密', '厂商', '完整URL', '状态', '原因', '生成时间'];
    var lines = [header.join(',')];
    rows.forEach(function (r) {
      var statusText = r.status === 'valid' ? '有效' :
        r.status === 'invalid' ? '无效' :
          r.status === 'duplicate' ? '重复' : r.status;
      // CSV 转义：含逗号/引号的字段用双引号包裹，内部引号双写
      var fields = [
        r.index,
        r.code,
        r.vendor || '',
        r.url || '',
        statusText,
        r.reason || '',
        r.createdAt || ''
      ].map(csvEscape);
      lines.push(fields.join(','));
    });
    // UTF-8 BOM 保证 Excel 正确识别中文
    var content = '\uFEFF' + lines.join('\r\n');
    var blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, '卡密转码清单_' + timestamp() + '.csv');
    return true;
  }

  function csvEscape(s) {
    s = String(s == null ? '' : s);
    if (/[",\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  return {
    downloadSingle: downloadSingle,
    downloadZip: downloadZip,
    downloadCSV: downloadCSV,
    timestamp: timestamp,
    safeName: safeName
  };
})();
