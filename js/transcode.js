/* =========================================================
   transcode.js - 转码核心模块
   - 卡密格式校验
   - URL 拼接
   - 去重
   - 卡密脱敏显示
   ========================================================= */
window.TranscodeModule = (function () {
  'use strict';

  // 卡密脱敏：保留前 6 后 3，中间用 *** 替换
  function mask(code) {
    if (!code) return '';
    var s = String(code);
    if (s.length <= 9) return s;
    return s.slice(0, 6) + '***' + s.slice(-3);
  }

  // 格式校验
  // 返回 { valid: bool, reason: string }
  function validate(code, vendor) {
    if (!code) return { valid: false, reason: '空卡密' };
    var s = String(code).trim();
    if (!s) return { valid: false, reason: '空卡密' };

    if (!vendor) return { valid: true, reason: '' };

    // 正则校验
    if (vendor.regex) {
      var re = null;
      try {
        re = new RegExp(vendor.regex);
      } catch (e) {
        // 正则无效，跳过正则校验
      }
      if (re && !re.test(s)) {
        return { valid: false, reason: '格式不符（' + vendor.regex + '）' };
      }
    }

    // 长度校验（如配置了 length）
    if (vendor.length && vendor.length > 0) {
      if (s.length !== vendor.length) {
        return { valid: false, reason: '长度应为 ' + vendor.length + '，实际 ' + s.length };
      }
    }

    return { valid: true, reason: '' };
  }

  // 批量转码
  // codes: 字符串数组（已去空）
  // vendor: 厂商对象
  // 返回: [{ code, masked, url, status, reason }]
  // status: 'valid' | 'invalid' | 'duplicate'
  function transcodeBatch(codes, vendor) {
    var seen = {};
    var results = [];
    var list = codes || [];

    for (var i = 0; i < list.length; i++) {
      var code = String(list[i]).trim();
      if (!code) continue;

      var result = validate(code, vendor);
      var status, reason;
      if (!result.valid) {
        status = 'invalid';
        reason = result.reason;
      } else if (seen[code]) {
        status = 'duplicate';
        reason = '重复卡密';
      } else {
        status = 'valid';
        reason = '';
        seen[code] = true;
      }

      results.push({
        index: results.length + 1,
        code: code,
        masked: mask(code),
        url: vendor ? vendor.urlTemplate.replace('{卡密}', code) : code,
        status: status,
        reason: reason,
        vendor: vendor ? vendor.name : '',
        createdAt: new Date().toISOString()
      });
    }
    return results;
  }

  // 统计
  function summarize(results) {
    var stat = { total: 0, valid: 0, invalid: 0, duplicate: 0 };
    (results || []).forEach(function (r) {
      stat.total++;
      if (r.status === 'valid') stat.valid++;
      else if (r.status === 'invalid') stat.invalid++;
      else if (r.status === 'duplicate') stat.duplicate++;
    });
    return stat;
  }

  return {
    mask: mask,
    validate: validate,
    transcodeBatch: transcodeBatch,
    summarize: summarize
  };
})();
