/* =========================================================
   qrcode-gen.js - 二维码生成模块
   - 封装 qrcode.js（CDN: qrcodejs@1.0.0）
   - 应用自定义参数（尺寸/容错率/前景色/背景色/外边距）
   - 返回 dataURL 供下载与 ZIP 打包
   ========================================================= */
window.QRCodeGen = (function () {
  'use strict';

  // qrcodejs 容错率常量映射
  // 库加载后可用：QRCode.CorrectLevel = { L:1, M:0, Q:3, H:2 }
  function levelMap(level) {
    if (typeof QRCode === 'undefined' || !QRCode.CorrectLevel) {
      return 0; // 默认 M
    }
    var map = {
      'L': QRCode.CorrectLevel.L,
      'M': QRCode.CorrectLevel.M,
      'Q': QRCode.CorrectLevel.Q,
      'H': QRCode.CorrectLevel.H
    };
    return map[level] != null ? map[level] : QRCode.CorrectLevel.M;
  }

  /**
   * 生成二维码并渲染到 container
   * @param {string} text 编码内容
   * @param {object} options { size, level, colorDark, colorLight, margin }
   * @param {HTMLElement} container 渲染容器
   * @returns {Promise<string>} dataURL
   */
  function generate(text, options, container) {
    options = options || {};
    var size = options.size || 256;
    var level = options.level || 'M';
    // 嵌入 Logo 时强制最高容错率，避免中央遮挡导致无法识别
    if (options.logoEnabled) level = 'H';
    var colorDark = options.colorDark || '#000000';
    var colorLight = options.colorLight || '#ffffff';
    var margin = options.margin != null ? options.margin : 4;

    return new Promise(function (resolve) {
      if (typeof QRCode === 'undefined') {
        resolve('');
        return;
      }

      // 清空容器
      if (container) container.innerHTML = '';

      // qrcodejs 需要一个 DOM 容器
      var holder = container || document.createElement('div');
      holder.innerHTML = '';

      try {
        /* eslint-disable no-new */
        new QRCode(holder, {
          text: text,
          width: size,
          height: size,
          colorDark: colorDark,
          colorLight: colorLight,
          correctLevel: levelMap(level)
        });
      } catch (e) {
        resolve('');
        return;
      }

      // qrcodejs 异步生成 canvas + img，等下一帧再读取
      setTimeout(function () {
        var canvas = holder.querySelector('canvas');
        var img = holder.querySelector('img');
        var dataURL = '';

        if (canvas) {
          // 加白边（margin 控制外边距像素）
          try {
            var pad = margin * 4;
            var out = document.createElement('canvas');
            out.width = canvas.width + pad * 2;
            out.height = canvas.height + pad * 2;
            var ctx = out.getContext('2d');
            ctx.fillStyle = colorLight;
            ctx.fillRect(0, 0, out.width, out.height);
            ctx.drawImage(canvas, pad, pad);
            // 嵌入厂商 Logo（圆形底 + 首字）
            if (options.logoEnabled && options.logoText) {
              var cx = out.width / 2;
              var cy = out.height / 2;
              var r = Math.max(10, size * 0.13);
              ctx.save();
              ctx.beginPath();
              ctx.arc(cx, cy, r, 0, Math.PI * 2);
              ctx.fillStyle = options.logoColor || '#00A859';
              ctx.fill();
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold ' + Math.round(r) + 'px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(options.logoText, cx, cy + 1);
              ctx.restore();
            }
            dataURL = out.toDataURL('image/png');
            // 替换显示为带白边的图
            if (container) {
              container.innerHTML = '';
              var outImg = document.createElement('img');
              outImg.src = dataURL;
              outImg.style.width = size + 'px';
              outImg.style.height = size + 'px';
              container.appendChild(outImg);
            }
          } catch (e2) {
            // toDataURL 可能因 tainted canvas 失败，退回 img.src
            dataURL = (img && img.src) ? img.src : '';
          }
        } else if (img && img.src) {
          dataURL = img.src;
        }

        resolve(dataURL);
      }, 80);
    });
  }

  return {
    generate: generate,
    levelMap: levelMap
  };
})();
