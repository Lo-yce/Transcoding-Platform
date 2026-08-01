/* =========================================================
   app.js - 主入口
   - 初始化各模块
   - 事件绑定
   - 转码主流程
   - 安全横幅交互
   - 设置面板
   ========================================================= */
(function () {
  'use strict';

  // 当前转码结果（保存 dataURL 供导出）
  var currentResults = [];

  // AI 辅助填写提示词模板（{卡密示例} 会被用户输入替换）
  var AI_PROMPT_TEMPLATE = [
    '我正在做一个卡密转码工具，需要添加一个饮料厂商的卡密转码规则。',
    '请根据我提供的卡密示例，分析卡密的格式规律，并给出可直接填写的规则值。',
    '',
    '【我的卡密示例】：',
    '{卡密示例}',
    '',
    '请帮我分析并给出以下字段的填写值：',
    '1. 厂商名称：中文品牌名',
    '2. URL 模板：用 {卡密} 作占位符（例如 https://example.com/{卡密}）',
    '3. 卡密正则：用于格式校验（例如 ^[A-Za-z0-9]{15}$）',
    '4. 卡密长度：数字',
    '5. Bootstrap 图标名：如 cup-straw、droplet 等',
    '6. 主题色：十六进制色值（如 #00A859）',
    '',
    '要求：',
    '- 如果我提供的是完整活动链接，请从中识别出卡密部分，并据此反推 URL 模板；',
    '- 把卡密填入 URL 模板的 {卡密} 位置后，得到的完整 URL 必须能访问活动页面；',
    '- 正则要能匹配卡密的实际字符集和长度。'
  ].join('\n');

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
    toastTimer = setTimeout(function () {
      el.className = 'toast';
    }, 2600);
  }

  // ===== Modal 通用：ESC 关闭 + 背景滚动锁定 =====
  // 打开任意弹窗时锁定 body 滚动，关闭后恢复；ESC 关闭最上层可见弹窗
  function anyModalOpen() {
    return document.querySelectorAll('.modal:not(.hidden)').length > 0;
  }
  function syncScrollLock() {
    document.body.style.overflow = anyModalOpen() ? 'hidden' : '';
  }
  function watchModals() {
    // 监听所有 modal 的 class 变化，自动同步滚动锁（无需改动各 open/close）
    var mo = new MutationObserver(syncScrollLock);
    document.querySelectorAll('.modal').forEach(function (m) {
      mo.observe(m, { attributes: true, attributeFilter: ['class'] });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && anyModalOpen()) {
        var open = document.querySelectorAll('.modal:not(.hidden)');
        if (open.length) open[open.length - 1].classList.add('hidden');
        syncScrollLock();
      }
    });
  }

  // ===== 已扫状态持久化（sessionStorage）=====
  // 仅存卡密哈希，不存明文；刷新或重转同批卡密时恢复"已扫"标记，关闭标签页即清除
  function codeHash(code) {
    var h = 0;
    var s = String(code);
    for (var i = 0; i < s.length; i++) {
      h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    }
    return 'c' + (h >>> 0).toString(36);
  }
  function getScannedSet() {
    try {
      var raw = sessionStorage.getItem('scannedCodes');
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function setScanned(code, scanned) {
    var set = getScannedSet();
    var k = codeHash(code);
    if (scanned) set[k] = 1; else delete set[k];
    try { sessionStorage.setItem('scannedCodes', JSON.stringify(set)); } catch (e) {}
  }
  function isScanned(code) {
    var set = getScannedSet();
    return !!set[codeHash(code)];
  }
  function clearScannedSet() {
    try { sessionStorage.removeItem('scannedCodes'); } catch (e) {}
  }

  // ===== 主题模式控制（浅 / 深 / 跟随系统）=====
  var ThemeController = {
    mode: 'auto',
    mq: null,
    init: function () {
      try { this.mode = localStorage.getItem('theme') || 'auto'; } catch (e) { this.mode = 'auto'; }
      this.mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      var self = this;
      if (this.mq) {
        var handler = function () { self.apply(); };
        if (this.mq.addEventListener) this.mq.addEventListener('change', handler);
        else if (this.mq.addListener) this.mq.addListener(handler);
      }
      this.apply();
    },
    setMode: function (mode) {
      this.mode = mode;
      try { localStorage.setItem('theme', mode); } catch (e) {}
      this.apply();
    },
    apply: function () {
      var sysDark = this.mq && this.mq.matches;
      var dark = this.mode === 'dark' || (this.mode === 'auto' && sysDark);
      document.documentElement.classList.toggle('dark', dark);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#0f172a' : '#00A859');
      var mode = this.mode;
      document.querySelectorAll('#themeSegGroup .seg-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.theme === mode);
      });
    }
  };

  // ===== 二维码解码验证（每卡生成后用 jsQR 反向解码自检）=====
  function verifyQR(r, card) {
    var badge = card.el.querySelector('.qr-verify');
    if (!badge || !r.dataURL) return;
    if (typeof jsQR === 'undefined') return; // 库未加载则跳过
    var img = new Image();
    img.onload = function () {
      try {
        var cv = document.createElement('canvas');
        cv.width = img.naturalWidth || img.width;
        cv.height = img.naturalHeight || img.height;
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var imgData = ctx.getImageData(0, 0, cv.width, cv.height);
        var code = jsQR(imgData.data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data && (code.data === r.url || code.data === r.code)) {
          badge.className = 'qr-verify ok';
          badge.innerHTML = '<i class="bi bi-check2"></i> 已验证';
        } else {
          badge.className = 'qr-verify fail';
          badge.innerHTML = '<i class="bi bi-exclamation"></i> 待复核';
        }
      } catch (e) { /* canvas tainted 等异常，静默 */ }
    };
    img.onerror = function () {};
    img.src = r.dataURL;
  }

  // ===== 已扫快捷键（↑/↓ 切换卡片，空格/回车标记已扫）=====
  var focusIndex = -1;
  function initKeyboardNav() {
    document.addEventListener('keydown', function (e) {
      if (anyModalOpen()) return;
      var grid = $('resultGrid');
      if (!grid || grid.classList.contains('hidden')) return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      var cards = Array.prototype.slice.call(grid.querySelectorAll('.qr-card'));
      if (!cards.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        focusIndex = Math.min(focusIndex + 1, cards.length - 1);
        focusCard(cards, focusIndex);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        focusIndex = Math.max(focusIndex - 1, 0);
        focusCard(cards, focusIndex);
      } else if (e.key === ' ' || e.key === 'Enter' || e.code === 'Space' || e.code === 'Enter') {
        // 优先用键盘导航焦点；若 focusIndex 无效则回退到当前 DOM 聚焦的卡片
        // （支持鼠标点击卡片聚焦后按空格标记已扫）
        var target = (focusIndex >= 0 && focusIndex < cards.length) ? cards[focusIndex] : null;
        if (!target) {
          var active = document.activeElement;
          if (active && active.classList && active.classList.contains('qr-card')) {
            target = active;
            focusIndex = cards.indexOf(target);
            cards.forEach(function (c, i) { c.classList.toggle('is-focused', c === target); });
          }
        }
        if (target) {
          e.preventDefault();
          var btn = target.querySelector('.btn-scan');
          if (btn) btn.click();
        }
      }
    });
  }
  function focusCard(cards, idx) {
    cards.forEach(function (c, i) { c.classList.toggle('is-focused', i === idx); });
    if (cards[idx]) {
      cards[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      try { cards[idx].focus({ preventScroll: true }); } catch (e) {}
    }
  }

  // ===== 扫码自检（摄像头 + jsQR 实时解码）=====
  var ScanController = {
    stream: null,
    rafId: null,
    video: null,
    canvas: null,
    running: false,
    cooldown: false,
    init: function () {
      var modal = $('scanModal');
      if (!modal) return;
      this.video = $('scanVideo');
      this.canvas = document.createElement('canvas');
      var self = this;
      var openBtn = $('scanCheckBtn');
      var closeBtn = $('scanModalClose');
      var startBtn = $('scanStartBtn');
      var stopBtn = $('scanStopBtn');
      var copyBtn = $('scanResultCopy');
      if (openBtn) openBtn.addEventListener('click', function () { self.open(); });
      if (closeBtn) closeBtn.addEventListener('click', function () { self.close(); });
      modal.addEventListener('click', function (e) { if (e.target === modal) self.close(); });
      if (startBtn) startBtn.addEventListener('click', function () { self.start(); });
      if (stopBtn) stopBtn.addEventListener('click', function () { self.stop(); });
      if (copyBtn) copyBtn.addEventListener('click', function () {
        var txt = ($('scanResultText').textContent || '').trim();
        if (!txt) return;
        copyToClipboard(txt);
        toast('已复制解码结果', 'success');
      });
      // 弹窗被 ESC/遮罩隐藏时同步停止摄像头
      var mo = new MutationObserver(function () {
        if (modal.classList.contains('hidden')) self.stop();
      });
      mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
    },
    open: function () {
      $('scanModal').classList.remove('hidden');
      var box = $('scanResultBox');
      if (box) box.classList.add('hidden');
      var self = this;
      setTimeout(function () { self.start(); }, 200);
    },
    close: function () {
      this.stop();
      $('scanModal').classList.add('hidden');
    },
    start: function () {
      if (this.running) return;
      var self = this;
      var startBtn = $('scanStartBtn');
      var stopBtn = $('scanStopBtn');
      var unsupported = $('scanUnsupported');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof jsQR === 'undefined') {
        if (unsupported) unsupported.classList.remove('hidden');
        this.setStatus('不支持');
        return;
      }
      this.setStatus('正在请求摄像头...');
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(function (stream) {
          self.stream = stream;
          self.video.srcObject = stream;
          self.video.setAttribute('playsinline', true);
          return self.video.play();
        })
        .then(function () {
          self.running = true;
          if (startBtn) startBtn.disabled = true;
          if (stopBtn) stopBtn.disabled = false;
          var unsupported = $('scanUnsupported');
          if (unsupported) unsupported.classList.add('hidden');
          if (window.TelemetryModule) { try { TelemetryModule.trackFeature('scan_check'); } catch (e) {} }
          self.setStatus('扫描中…对准二维码');
          self.tick();
        })
        .catch(function () {
          var unsupported = $('scanUnsupported');
          if (unsupported) unsupported.classList.remove('hidden');
          self.setStatus('摄像头不可用');
        });
    },
    stop: function () {
      this.running = false;
      if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
      if (this.stream) {
        this.stream.getTracks().forEach(function (t) { t.stop(); });
        this.stream = null;
      }
      if (this.video) this.video.srcObject = null;
      var startBtn = $('scanStartBtn');
      var stopBtn = $('scanStopBtn');
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
      if ($('scanModal') && !$('scanModal').classList.contains('hidden')) this.setStatus('已停止');
    },
    setStatus: function (msg) {
      var s = $('scanStatus');
      if (s) s.innerHTML = '<i class="bi bi-camera-video"></i> <span>' + msg + '</span>';
    },
    tick: function () {
      var self = this;
      if (!this.running) return;
      if (this.video.readyState === this.video.HAVE_ENOUGH_DATA && !this.cooldown) {
        var w = this.video.videoWidth;
        var h = this.video.videoHeight;
        if (w && h) {
          this.canvas.width = w;
          this.canvas.height = h;
          var ctx = this.canvas.getContext('2d');
          ctx.drawImage(this.video, 0, 0, w, h);
          try {
            var imgData = ctx.getImageData(0, 0, w, h);
            var code = jsQR(imgData.data, w, h, { inversionAttempts: 'dontInvert' });
            if (code && code.data) this.onDecoded(code.data);
          } catch (e) {}
        }
      }
      if (this.running) this.rafId = requestAnimationFrame(function () { self.tick(); });
    },
    onDecoded: function (text) {
      var txt = $('scanResultText');
      var box = $('scanResultBox');
      if (txt) txt.textContent = text;
      if (box) box.classList.remove('hidden');
      // 命中当前批次则标记已扫
      var matched = null;
      currentResults.forEach(function (r) {
        if (r.url === text || r.code === text) matched = r;
      });
      if (matched) {
        if (!matched.scanned) {
          matched.scanned = true;
          setScanned(matched.code, true);
          var card = document.querySelector('#resultGrid .qr-card[data-index="' + matched.index + '"]');
          if (card) {
            card.classList.add('scanned');
            var btn = card.querySelector('.btn-scan');
            if (btn) {
              btn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i>';
              btn.title = '取消已扫';
              btn.classList.add('active');
            }
          }
        }
        this.setStatus('✓ 命中并已标记');
      } else {
        this.setStatus('已解码（未匹配当前批次）');
      }
      // 冷却 1.5s 避免重复触发
      this.cooldown = true;
      var self = this;
      setTimeout(function () { self.cooldown = false; }, 1500);
    }
  };

  // ===== 初始化 =====
  document.addEventListener('DOMContentLoaded', function () {
    InputModule.initSecurity();
    initVendor();
    initQRConfig();
    initInputTabs();
    initInputActions();
    initActions();
    initResultToolbar();
    initVendorModal();
    initSettingsModal();
    watchModals();
    ThemeController.init();
    if (window.TelemetryModule) { try { TelemetryModule.init(); } catch (e) {} }
    initKeyboardNav();
    ScanController.init();
    initSafetyBanner();
    var qqModal = initQQModal();
    renderVendorSelect();
    renderPending();
    updateStats();
    // 每次第一次打开或刷新网站都先弹出 QQ 联系弹窗
    setTimeout(function () {
      if (qqModal) qqModal.open();
    }, 400);
    // 延迟检测 CDN 依赖（等待 CSS 应用后检测图标库）
    setTimeout(detectDeps, 800);
  });

  // ===== 厂商选择 =====
  function initVendor() {
    var select = $('vendorSelect');
    if (select) {
      select.addEventListener('change', function () {
        VendorModule.setCurrent(select.value);
        renderVendorInfo();
      });
    }
    var addBtn = $('addVendorBtn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openVendorModal();
      });
    }
  }

  function renderVendorSelect() {
    VendorModule.renderSelect($('vendorSelect'));
    renderVendorInfo();
  }

  function renderVendorInfo() {
    var v = VendorModule.getCurrent();
    VendorModule.renderInfo($('vendorInfo'), v);
  }

  // ===== 二维码配置 =====
  function initQRConfig() {
    var sizeSel = $('qrSize');
    var sizeCustom = $('qrSizeCustom');
    if (sizeSel) {
      sizeSel.addEventListener('change', function () {
        if (sizeSel.value === 'custom') {
          sizeCustom.classList.remove('hidden');
          sizeCustom.focus();
        } else {
          sizeCustom.classList.add('hidden');
        }
      });
    }
    var margin = $('qrMargin');
    var marginVal = $('qrMarginValue');
    if (margin) {
      margin.addEventListener('input', function () {
        if (marginVal) marginVal.textContent = margin.value;
      });
    }
  }

  function getQROptions() {
    var sizeSel = $('qrSize');
    var size = 256;
    if (sizeSel) {
      if (sizeSel.value === 'custom') {
        var custom = parseInt($('qrSizeCustom').value, 10);
        size = (custom >= 64 && custom <= 1024) ? custom : 256;
      } else {
        size = parseInt(sizeSel.value, 10) || 256;
      }
    }
    var vendor = VendorModule.getCurrent();
    return {
      size: size,
      level: ($('qrLevel') && $('qrLevel').value) || 'M',
      colorDark: ($('qrColorDark') && $('qrColorDark').value) || '#000000',
      colorLight: ($('qrColorLight') && $('qrColorLight').value) || '#ffffff',
      margin: parseInt(($('qrMargin') && $('qrMargin').value) || 4, 10),
      content: ($('qrContent') && $('qrContent').value) || 'url',
      logoEnabled: !!($('qrLogo') && $('qrLogo').checked),
      logoText: vendor ? (vendor.name || '').charAt(0) : '',
      logoColor: vendor ? (vendor.color || '#00A859') : '#00A859'
    };
  }

  // ===== 输入 Tabs =====
  function initInputTabs() {
    var tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(function (c) {
          c.classList.add('hidden');
        });
        var target = $('tab-' + btn.dataset.tab);
        if (target) target.classList.remove('hidden');
      });
    });
  }

  // ===== 输入操作 =====
  function initInputActions() {
    // 批量粘贴解析
    var parsePaste = $('parsePasteBtn');
    if (parsePaste) {
      parsePaste.addEventListener('click', function () {
        var text = $('pasteInput').value || '';
        var parsed = InputModule.parseText(text);
        maybeAutoSwitchVendor(parsed[0]);
        var vendor = VendorModule.getCurrent();
        var codes = parsed.map(function (c) {
          return VendorModule.extractCode(c, vendor);
        });
        var added = InputModule.addBatch(codes);
        if (window.TelemetryModule) { try { TelemetryModule.trackFeature('input_paste'); } catch (e) {} }
        toast('已添加 ' + added + ' 条卡密' + (codes.length - added > 0 ? '（' + (codes.length - added) + ' 条重复）' : ''), 'success');
        InputModule.clearInputs();
        renderPending();
      });
    }

    // 文件上传（点击选择 + 拖拽放入）
    var parseFile = $('parseFileBtn');
    var fileInput = $('fileInput');
    var fileDrop = document.querySelector('.file-drop');

    // 解析单个文件对象（按钮点击与拖拽 drop 共用）
    function handleFileObj(file) {
      if (!file) { toast('请先选择文件', 'warning'); return; }
      InputModule.parseFile(file).then(function (rawCodes) {
        maybeAutoSwitchVendor(rawCodes[0]);
        var vendor = VendorModule.getCurrent();
        var codes = rawCodes.map(function (c) {
          return VendorModule.extractCode(c, vendor);
        });
        var added = InputModule.addBatch(codes);
        if (window.TelemetryModule) { try { TelemetryModule.trackFeature('input_file'); } catch (e) {} }
        toast('已添加 ' + added + ' 条卡密（共 ' + codes.length + ' 条）', 'success');
        InputModule.clearInputs();
        renderPending();
      }).catch(function (err) {
        toast('文件解析失败：' + err.message, 'error');
      });
    }

    if (parseFile) {
      parseFile.addEventListener('click', function () {
        if (!fileInput || !fileInput.files.length) {
          toast('请先选择文件', 'warning');
          return;
        }
        handleFileObj(fileInput.files[0]);
      });
    }

    // 拖拽上传：文案承诺"拖入文件"，此处真正实现 drop
    if (fileDrop) {
      ['dragenter', 'dragover'].forEach(function (evt) {
        fileDrop.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          fileDrop.classList.add('drag-over');
        });
      });
      ['dragleave', 'dragend', 'drop'].forEach(function (evt) {
        fileDrop.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          fileDrop.classList.remove('drag-over');
        });
      });
      fileDrop.addEventListener('drop', function (e) {
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        var name = (file.name || '').toLowerCase();
        if (!name.endsWith('.txt') && !name.endsWith('.csv') &&
            !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
          toast('仅支持 .txt / .csv / .xlsx 文件', 'warning');
          return;
        }
        // 回填到 fileInput，便于后续可重复点击解析
        try {
          if (fileInput && e.dataTransfer && e.dataTransfer.files) {
            fileInput.files = e.dataTransfer.files;
          }
        } catch (err) { /* 部分浏览器不允许赋值 files，忽略 */ }
        handleFileObj(file);
      });
    }

    // 手动添加
    var addManual = $('addManualBtn');
    if (addManual) {
      addManual.addEventListener('click', function () {
        var raw = $('manualInput').value || '';
        maybeAutoSwitchVendor(raw);
        var vendor = VendorModule.getCurrent();
        var code = VendorModule.extractCode(raw, vendor);
        var res = InputModule.addManual(code);
        if (res.added) {
          if (window.TelemetryModule) { try { TelemetryModule.trackFeature('input_manual'); } catch (e) {} }
          toast('已添加', 'success');
          InputModule.clearInputs();
          renderPending();
        } else {
          toast('添加失败：' + res.reason, 'warning');
        }
      });
    }

    // 清空待处理
    var clearPending = $('clearPendingBtn');
    if (clearPending) {
      clearPending.addEventListener('click', function () {
        InputModule.clear();
        renderPending();
        toast('已清空待处理列表', 'success');
      });
    }
  }

  // 根据输入首条自动识别并切换厂商
  function maybeAutoSwitchVendor(firstToken) {
    if (!firstToken) return;
    var detected = VendorModule.autoDetectVendor(firstToken);
    if (!detected) return;
    var current = VendorModule.getCurrent();
    if (current && current.id === detected.id) return;
    VendorModule.setCurrent(detected.id);
    renderVendorSelect();
    renderVendorInfo();
    toast('检测到 ' + detected.name + ' 卡密，已自动切换厂商', 'info');
  }

  // ===== 渲染待处理列表 =====
  function renderPending() {
    var wrap = $('pendingListWrap');
    var chips = $('pendingChips');
    var count = $('pendingCount');
    var codes = InputModule.getAll();
    if (!wrap) return;
    if (codes.length === 0) {
      wrap.classList.add('hidden');
      chips.innerHTML = '';
      if (count) count.textContent = '0';
      return;
    }
    wrap.classList.remove('hidden');
    if (count) count.textContent = codes.length;
    chips.innerHTML = '';
    codes.forEach(function (code, idx) {
      var chip = document.createElement('span');
      chip.className = 'pending-chip';
      chip.innerHTML =
        '<span>' + escapeHtml(TranscodeModule.mask(code)) + '</span>' +
        '<i class="bi bi-x-lg chip-remove" data-idx="' + idx + '" title="移除"></i>';
      chips.appendChild(chip);
    });
    // 绑定移除事件
    chips.querySelectorAll('.chip-remove').forEach(function (icon) {
      icon.addEventListener('click', function () {
        var i = parseInt(icon.dataset.idx, 10);
        InputModule.removeAt(i);
        renderPending();
      });
    });
  }

  // ===== 主操作按钮 =====
  function initActions() {
    var transcodeBtn = $('transcodeBtn');
    if (transcodeBtn) {
      transcodeBtn.addEventListener('click', doTranscode);
    }
    // 单条预览：仅转码首条卡密，快速试码（不消耗全部待处理列表）
    var previewBtn = $('previewBtn');
    if (previewBtn) {
      previewBtn.addEventListener('click', doPreviewFirst);
    }
    var clearBtn = $('clearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        currentResults = [];
        $('resultGrid').innerHTML = '';
        $('resultGrid').classList.add('hidden');
        $('emptyState').classList.remove('hidden');
        showResultToolbar(false);
        updateExportButtons();
        updateStats();
        toast('已清空结果', 'success');
      });
    }
    var exportCsv = $('exportCsvBtn');
    if (exportCsv) {
      exportCsv.addEventListener('click', function () {
        if (ExportModule.downloadCSV(currentResults)) {
          if (window.TelemetryModule) { try { TelemetryModule.trackFeature('export_csv'); } catch (e) {} }
          toast('CSV 已导出', 'success');
        }
      });
    }
    var exportZip = $('exportZipBtn');
    if (exportZip) {
      exportZip.addEventListener('click', function () {
        var btn = exportZip;
        var oldText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i> 打包中...';
        ExportModule.downloadZip(currentResults).then(function (n) {
          if (window.TelemetryModule) { try { TelemetryModule.trackFeature('export_zip'); } catch (e) {} }
          toast('已打包 ' + n + ' 张二维码', 'success');
        }).catch(function (err) {
          toast('打包失败：' + err.message, 'error');
        }).then(function () {
          btn.disabled = false;
          btn.innerHTML = oldText;
          updateExportButtons();
        });
      });
    }

    // 打印贴纸
    var printBtn = $('printBtn');
    if (printBtn) {
      printBtn.addEventListener('click', function () {
        if (window.TelemetryModule) { try { TelemetryModule.trackFeature('print'); } catch (e) {} }
        window.print();
      });
    }
  }

  // ===== 单条预览（首条卡密快速试码）=====
  function doPreviewFirst() {
    var codes = InputModule.getAll();
    if (!codes.length) {
      toast('请先输入卡密', 'warning');
      return;
    }
    var vendor = VendorModule.getCurrent();
    if (!vendor) {
      toast('请选择厂商', 'warning');
      return;
    }
    var firstCode = VendorModule.extractCode(codes[0], vendor);
    var single = TranscodeModule.transcodeBatch([firstCode], vendor);
    single.forEach(function (r) { if (isScanned(r.code)) r.scanned = true; });
    currentResults = single;
    renderResults(single).then(function () {
      updateStats();
      updateExportButtons();
      showResultToolbar(true);
      resetFilter();
      var r = single[0];
      if (window.TelemetryModule) { try { TelemetryModule.trackTranscode(vendor, TranscodeModule.summarize(single), { preview: true }); } catch (e) {} }
      if (r.status === 'valid') {
        toast('预览首条：' + r.url, 'success');
      } else {
        toast('首条卡密无效：' + r.reason, 'warning');
      }
    });
  }

  // ===== 转码主流程 =====
  function doTranscode() {
    var codes = InputModule.getAll();
    if (codes.length === 0) {
      toast('请先输入卡密', 'warning');
      return;
    }
    var vendor = VendorModule.getCurrent();
    if (!vendor) {
      toast('请选择厂商', 'warning');
      return;
    }

    var btn = $('transcodeBtn');
    var oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> 转码中...';

    // 执行转码
    var results = TranscodeModule.transcodeBatch(codes, vendor);
    currentResults = results;

    // 恢复已扫状态（sessionStorage 持久化，刷新/重转同批卡密不丢进度）
    results.forEach(function (r) { if (isScanned(r.code)) r.scanned = true; });

    // 渲染
    renderResults(results).then(function () {
      updateStats();
      updateExportButtons();
      showResultToolbar(true);
      resetFilter();
      btn.disabled = false;
      btn.innerHTML = oldText;
      var stat = TranscodeModule.summarize(results);
      if (window.TelemetryModule) { try { TelemetryModule.trackTranscode(vendor, stat); } catch (e) {} }
      toast('转码完成：有效 ' + stat.valid + ' / 无效 ' + stat.invalid + ' / 重复 ' + stat.duplicate, 'success');
    });
  }

  // 分页渲染（无限滚动，支持 1000+ 卡密流畅）
  var PAGE_SIZE = 40;
  var renderQueue = [];
  var renderedCount = 0;
  var ioObserver = null;

  function renderResults(results) {
    var grid = $('resultGrid');
    var empty = $('emptyState');
    grid.innerHTML = '';
    empty.classList.add('hidden');
    grid.classList.remove('hidden');

    renderQueue = results || [];
    renderedCount = 0;
    focusIndex = -1; // 重置键盘导航焦点（重新渲染后从头开始）

    if (ioObserver) { ioObserver.disconnect(); ioObserver = null; }
    if (!renderQueue.length) return Promise.resolve();

    // 哨兵：滚动接近时加载下一页
    var sentinel = document.createElement('div');
    sentinel.id = 'resultSentinel';
    sentinel.className = 'result-sentinel';
    grid.appendChild(sentinel);

    ioObserver = new IntersectionObserver(function (entries) {
      if (entries[0] && entries[0].isIntersecting) loadNextPage();
    }, { rootMargin: '400px' });
    ioObserver.observe(sentinel);

    loadNextPage();
    return Promise.resolve();
  }

  function loadNextPage() {
    if (renderedCount >= renderQueue.length) {
      var sentinel = $('resultSentinel');
      if (sentinel) sentinel.remove();
      if (ioObserver) { ioObserver.disconnect(); ioObserver = null; }
      return;
    }
    var options = getQROptions();
    var vendor = VendorModule.getCurrent();
    var end = Math.min(renderedCount + PAGE_SIZE, renderQueue.length);
    var grid = $('resultGrid');
    var sentinel = $('resultSentinel');

    for (var i = renderedCount; i < end; i++) {
      var card = createCardSkeleton(renderQueue[i], vendor);
      if (sentinel) grid.insertBefore(card.el, sentinel);
      else grid.appendChild(card.el);
      renderCardContent(renderQueue[i], card, options, vendor);
    }
    renderedCount = end;
  }

  // 创建卡片骨架
  function createCardSkeleton(r, vendor) {
    var el = document.createElement('div');
    el.className = 'qr-card ' + r.status;
    el.dataset.index = r.index;
    el.dataset.status = r.status;
    el.setAttribute('tabindex', '0'); // 键盘导航可聚焦
    var statusText = r.status === 'valid' ? '有效' :
      r.status === 'invalid' ? '无效' : '重复';
    var statusClass = 'status-' + r.status;
    el.innerHTML =
      '<span class="qr-index" title="排列序号">' + r.index + '</span>' +
      '<span class="qr-verify hidden"></span>' +
      '<span class="qr-status ' + statusClass + '">' + statusText + '</span>' +
      '<div class="qr-visual" title="点击标记已扫">' +
        '<div class="qr-canvas-wrap qr-loading"><i class="bi bi-arrow-repeat"></i></div>' +
        '<div class="scan-overlay">' +
          '<i class="bi bi-check-circle-fill"></i>' +
          '<span>已扫</span>' +
        '</div>' +
      '</div>' +
      '<div class="qr-code-display" title="点击切换显示/隐藏明文">' +
        '<span class="code-text">' + escapeHtml(r.masked) + '</span>' +
        '<i class="bi bi-eye"></i>' +
      '</div>' +
      '<div class="qr-url"></div>' +
      '<div class="qr-error"></div>' +
      '<div class="qr-actions"></div>';

    // 卡密明文切换（显示后 6 秒自动重新脱敏，降低肩窥风险）
    var codeDisplay = el.querySelector('.qr-code-display');
    var codeText = el.querySelector('.code-text');
    var eyeIcon = el.querySelector('.bi-eye, .bi-eye-slash');
    var revealed = false;
    var revealTimer = null;
    function maskReveal() {
      revealed = false;
      codeText.textContent = r.masked;
      eyeIcon.className = 'bi bi-eye';
      if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    }
    codeDisplay.addEventListener('click', function () {
      revealed = !revealed;
      codeText.textContent = revealed ? r.code : r.masked;
      eyeIcon.className = revealed ? 'bi bi-eye-slash' : 'bi bi-eye';
      if (revealTimer) clearTimeout(revealTimer);
      if (revealed) revealTimer = setTimeout(maskReveal, 6000);
    });

    // 已扫切换由卡片内的"标记已扫"按钮触发（见 renderCardContent）

    return { el: el, codeDisplay: codeDisplay, codeText: codeText };
  }

  // 填充卡片内容（生成二维码，缓存避免重复生成）
  function renderCardContent(r, card, options, vendor) {
    var urlEl = card.el.querySelector('.qr-url');
    var errEl = card.el.querySelector('.qr-error');
    var wrapEl = card.el.querySelector('.qr-canvas-wrap');

    if (r.status !== 'valid') {
      wrapEl.classList.remove('qr-loading');
      wrapEl.innerHTML = '<i class="bi bi-exclamation-triangle" style="font-size:32px;color:#dc3545;"></i>';
      if (r.reason) errEl.textContent = r.reason;
      urlEl.textContent = '—';
      return Promise.resolve();
    }

    urlEl.textContent = r.url;

    // 已缓存二维码：直接复用，避免重新生成
    if (r.dataURL) {
      wrapEl.classList.remove('qr-loading');
      wrapEl.innerHTML = '';
      var cachedImg = document.createElement('img');
      cachedImg.src = r.dataURL;
      cachedImg.style.width = options.size + 'px';
      cachedImg.style.height = options.size + 'px';
      wrapEl.appendChild(cachedImg);
      buildCardActions(r, card);
      verifyQR(r, card);
      return Promise.resolve();
    }

    var encodeText = options.content === 'code' ? r.code : r.url;
    return QRCodeGen.generate(encodeText, options, wrapEl).then(function (dataURL) {
      r.dataURL = dataURL;
      wrapEl.classList.remove('qr-loading');
      if (!dataURL) {
        wrapEl.innerHTML = '<i class="bi bi-x-circle" style="font-size:32px;color:#dc3545;"></i>';
        errEl.textContent = '二维码生成失败';
        return;
      }
      buildCardActions(r, card);
      verifyQR(r, card);
    });
  }

  // 构建卡片操作按钮（复制 URL / 下载 / 标记已扫）
  function buildCardActions(r, card) {
    var actionsEl = card.el.querySelector('.qr-actions');
    if (!actionsEl) return;
    var initScanned = !!r.scanned;
    if (initScanned) card.el.classList.add('scanned');
    actionsEl.innerHTML =
      '<button class="btn btn-secondary btn-sm" title="复制 URL"><i class="bi bi-clipboard"></i></button>' +
      '<button class="btn btn-secondary btn-sm" title="下载二维码"><i class="bi bi-download"></i></button>' +
      '<button class="btn btn-scan btn-sm' + (initScanned ? ' active' : '') + '" title="' +
      (initScanned ? '取消已扫' : '标记已扫') + '">' +
      (initScanned ? '<i class="bi bi-arrow-counterclockwise"></i>' : '<i class="bi bi-check2-all"></i>') + '</button>';
    var btns = actionsEl.querySelectorAll('button');
    btns[0].addEventListener('click', function () {
      copyToClipboard(r.url);
      toast('URL 已复制', 'success');
    });
    btns[1].addEventListener('click', function () {
      if (ExportModule.downloadSingle(r)) {
        toast('已下载 ' + r.code, 'success');
      } else {
        toast('下载失败', 'error');
      }
    });
    btns[2].addEventListener('click', function (e) {
      e.stopPropagation();
      var nowScanned = card.el.classList.toggle('scanned');
      r.scanned = nowScanned;
      setScanned(r.code, nowScanned); // 持久化到 sessionStorage
      if (window.TelemetryModule && nowScanned) { try { TelemetryModule.trackFeature('scan_mark'); } catch (e) {} }
      btns[2].innerHTML = nowScanned
        ? '<i class="bi bi-arrow-counterclockwise"></i>'
        : '<i class="bi bi-check2-all"></i>';
      btns[2].title = nowScanned ? '取消已扫' : '标记已扫';
      btns[2].classList.toggle('active', nowScanned);
    });
  }

  // ===== 统计更新 =====
  function updateStats() {
    var stat = TranscodeModule.summarize(currentResults);
    if ($('statTotal')) $('statTotal').textContent = stat.total;
    if ($('statValid')) $('statValid').textContent = stat.valid;
    if ($('statInvalid')) $('statInvalid').textContent = stat.invalid;
    if ($('statDup')) $('statDup').textContent = stat.duplicate;
  }

  function updateExportButtons() {
    var hasValid = currentResults.some(function (r) { return r.status === 'valid'; });
    var hasAny = currentResults.length > 0;
    if ($('exportZipBtn')) $('exportZipBtn').disabled = !hasValid;
    if ($('exportCsvBtn')) $('exportCsvBtn').disabled = !hasAny;
    if ($('printBtn')) $('printBtn').disabled = !hasAny;
  }

  // ===== 结果筛选 / 批量已扫 =====
  var filterState = { status: 'all', keyword: '' };

  function showResultToolbar(show) {
    var tb = $('resultToolbar');
    if (tb) tb.classList.toggle('hidden', !show);
  }

  function resetFilter() {
    filterState = { status: 'all', keyword: '' };
    var sb = $('resultSearch');
    if (sb) sb.value = '';
    document.querySelectorAll('.filter-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.filter === 'all');
    });
  }

  function getVisibleResults() {
    var kw = filterState.keyword.toLowerCase();
    return currentResults.filter(function (r) {
      var matchStatus = filterState.status === 'all' || r.status === filterState.status;
      var matchKw = !kw || r.code.toLowerCase().indexOf(kw) >= 0;
      return matchStatus && matchKw;
    });
  }

  function applyFilter() {
    // 重新渲染可见子集（已缓存的二维码直接复用，不重复生成）
    renderResults(getVisibleResults());
  }

  function markAllScanned(scanned) {
    currentResults.forEach(function (r) {
      r.scanned = !!scanned;
      setScanned(r.code, !!scanned);
    });
    // 清除已扫时彻底重置持久化记录（含本次结果之外的残留）
    if (!scanned) clearScannedSet();
    var cards = document.querySelectorAll('#resultGrid .qr-card');
    cards.forEach(function (el) {
      el.classList.toggle('scanned', !!scanned);
      var btn = el.querySelector('.btn-scan');
      if (btn) {
        btn.innerHTML = scanned ? '<i class="bi bi-arrow-counterclockwise"></i>' : '<i class="bi bi-check2-all"></i>';
        btn.title = scanned ? '取消已扫' : '标记已扫';
        btn.classList.toggle('active', !!scanned);
      }
    });
    toast(scanned ? '已全部标记为已扫' : '已清除所有已扫标记', 'success');
  }

  function initResultToolbar() {
    var tb = $('resultToolbar');
    if (!tb) return;
    tb.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        tb.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        filterState.status = btn.dataset.filter || 'all';
        applyFilter();
      });
    });
    var search = $('resultSearch');
    if (search) {
      var timer = null;
      search.addEventListener('input', function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          filterState.keyword = search.value.trim();
          applyFilter();
        }, 200);
      });
    }
    var markAll = $('markAllScannedBtn');
    if (markAll) markAll.addEventListener('click', function () { markAllScanned(true); });
    var clearAll = $('clearAllScannedBtn');
    if (clearAll) clearAll.addEventListener('click', function () { markAllScanned(false); });
  }

  // ===== 添加厂商 Modal =====
  function initVendorModal() {
    var modal = $('vendorModal');
    if (!modal) return;
    var closeBtn = $('vendorModalClose');
    var cancelBtn = $('vendorModalCancel');
    var saveBtn = $('vendorModalSave');

    function close() { modal.classList.add('hidden'); }
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var name = ($('vName').value || '').trim();
        var url = ($('vUrl').value || '').trim();
        var regex = ($('vRegex').value || '').trim();
        if (!name || !url || !regex) {
          toast('请填写必填项（名称/URL模板/正则）', 'warning');
          return;
        }
        if (url.indexOf('{卡密}') === -1) {
          toast('URL 模板需包含 {卡密} 占位符', 'warning');
          return;
        }
        // 测试正则有效性
        try { new RegExp(regex); } catch (e) {
          toast('正则表达式无效', 'error');
          return;
        }
        var vendor = {
          name: name,
          urlTemplate: url,
          regex: regex,
          length: parseInt($('vLen').value, 10) || 0,
          icon: ($('vIcon').value || '').trim() || 'cup-straw',
          color: $('vColor').value || '#00A859'
        };
        var saved = VendorModule.addCustom(vendor);
        if (saved) {
          if (window.TelemetryModule) { try { TelemetryModule.trackFeature('vendor_add'); } catch (e) {} }
          toast('厂商已保存', 'success');
          VendorModule.setCurrent(saved.id);
          renderVendorSelect();
          close();
          // 清空表单
          ['vName', 'vUrl', 'vRegex', 'vLen'].forEach(function (id) { $(id).value = ''; });
        } else {
          toast('保存失败', 'error');
        }
      });
    }

    // AI 辅助填写：复制提示词（含用户卡密示例）
    var copyAiBtn = $('copyAiPromptBtn');
    if (copyAiBtn) {
      copyAiBtn.addEventListener('click', function () {
        var sample = ($('aiSampleInput').value || '').trim();
        var prompt = AI_PROMPT_TEMPLATE.replace('{卡密示例}',
          sample || '（请在此粘贴你的卡密或完整活动链接）');
        copyToClipboard(prompt);
        toast('AI 提示词已复制，粘贴给 AI 后将返回的规则填入下方各字段', 'success');
      });
    }
  }

  function openVendorModal() {
    var modal = $('vendorModal');
    if (modal) modal.classList.remove('hidden');
  }

  // ===== 设置 Modal =====
  function initSettingsModal() {
    var settingsBtn = $('settingsBtn');
    var modal = $('settingsModal');
    if (!modal) return;
    var closeBtn = $('settingsModalClose');
    var doneBtn = $('settingsModalDone');
    var showBanner = $('settingShowBanner');

    function open() {
      // 同步当前横幅状态
      var dismissed = localStorage.getItem('safetyBannerDismissed') === '1';
      showBanner.checked = !dismissed;
      modal.classList.remove('hidden');
    }
    function close() { modal.classList.add('hidden'); }

    if (settingsBtn) settingsBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (doneBtn) doneBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });

    if (showBanner) {
      showBanner.addEventListener('change', function () {
        if (showBanner.checked) {
          localStorage.removeItem('safetyBannerDismissed');
          showSafetyBanner(true);
          toast('安全横幅已开启', 'success');
        } else {
          localStorage.setItem('safetyBannerDismissed', '1');
          showSafetyBanner(false);
          toast('安全横幅已关闭', 'success');
        }
      });
    }

    // 匿名使用统计开关
    var telemetrySwitch = $('settingTelemetry');
    if (telemetrySwitch) {
      // 同步当前状态
      if (window.TelemetryModule) {
        telemetrySwitch.checked = !TelemetryModule.isOptOut();
      }
      telemetrySwitch.addEventListener('change', function () {
        var optOut = !telemetrySwitch.checked;
        if (window.TelemetryModule) {
          TelemetryModule.setOptOut(optOut);
          if (!optOut) { try { TelemetryModule.init(); } catch (e) {} }
        }
        toast(optOut ? '已关闭匿名统计上报' : '已开启匿名统计上报', 'success');
      });
    }

    // 主题模式分段控件（浅 / 深 / 跟随系统）
    var segGroup = $('themeSegGroup');
    if (segGroup) {
      segGroup.querySelectorAll('.seg-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          ThemeController.setMode(btn.dataset.theme);
          toast('主题：' + btn.textContent.trim(), 'success');
        });
      });
    }

    // 打印每行列数
    var printSel = $('printColsSelect');
    if (printSel) {
      var savedCols;
      try { savedCols = localStorage.getItem('printCols') || '4'; } catch (e) { savedCols = '4'; }
      printSel.value = savedCols;
      document.documentElement.style.setProperty('--print-cols', savedCols);
      printSel.addEventListener('change', function () {
        var v = printSel.value;
        document.documentElement.style.setProperty('--print-cols', v);
        try { localStorage.setItem('printCols', v); } catch (e) {}
        toast('打印列数：' + v + ' 列', 'success');
      });
    }

    // 厂商规则备份：导出
    var exportVendors = $('exportVendorsBtn');
    if (exportVendors) {
      exportVendors.addEventListener('click', function () {
        var custom = VendorModule.getCustom();
        if (!custom.length) { toast('暂无自定义厂商可导出', 'warning'); return; }
        var json = VendorModule.exportCustom();
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '厂商规则备份_' + ExportModule.timestamp() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 200);
        if (window.TelemetryModule) { try { TelemetryModule.trackFeature('vendor_export'); } catch (e) {} }
        toast('已导出 ' + custom.length + ' 条自定义厂商', 'success');
      });
    }

    // 厂商规则备份：导入
    var importVendors = $('importVendorsBtn');
    var importFile = $('importVendorsFile');
    if (importVendors && importFile) {
      importVendors.addEventListener('click', function () { importFile.click(); });
      importFile.addEventListener('change', function () {
        if (!importFile.files.length) return;
        var f = importFile.files[0];
        var reader = new FileReader();
        reader.onload = function (e) {
          var res = VendorModule.importCustom(String(e.target.result || ''));
          if (res.error) { toast('导入失败：' + res.error, 'error'); return; }
          renderVendorSelect();
          if (window.TelemetryModule) { try { TelemetryModule.trackFeature('vendor_import'); } catch (e) {} }
          toast('已导入 ' + res.added + ' 条厂商规则' + (res.skipped ? '（跳过 ' + res.skipped + ' 条重复/无效）' : ''), 'success');
          importFile.value = '';
        };
        reader.onerror = function () { toast('文件读取失败', 'error'); };
        reader.readAsText(f, 'UTF-8');
      });
    }
  }

  // ===== QQ 联系弹窗 =====
  function initQQModal() {
    var modal = $('qqModal');
    var qqBtn = $('qqBtn');
    var closeBtn = $('qqModalClose');
    var copyQqBtn = $('copyQqBtn');
    if (!modal) return null;

    // 读取配置（来自 assets/qq/qq-config.js）
    var cfg = window.QQ_CONFIG || {};
    var number = cfg.qqNumber || '';
    var img = cfg.qqImage || '';
    var note = cfg.qqNote || '扫码加我 QQ 好友';
    var subNote = cfg.qqSubNote || '或手动复制 QQ 号添加';
    var title = cfg.qqTitle || '联系我';

    // 填充内容
    var titleEl = $('qqModalTitle');
    if (titleEl) titleEl.innerHTML = '<i class="bi bi-headset"></i> ' + escapeHtml(title);
    setText('qqNoteText', note);
    setText('qqSubNoteText', subNote);
    setText('qqNumberText', number || '—');

    // 图片加载（失败时显示占位提示）
    var imgEl = $('qqImg');
    var placeholder = $('qqImgPlaceholder');
    if (imgEl) {
      if (img) {
        imgEl.onerror = function () {
          imgEl.classList.add('hidden');
          if (placeholder) placeholder.classList.remove('hidden');
        };
        imgEl.onload = function () {
          imgEl.classList.remove('hidden');
          if (placeholder) placeholder.classList.add('hidden');
        };
        imgEl.src = img;
      } else {
        imgEl.classList.add('hidden');
        if (placeholder) placeholder.classList.remove('hidden');
      }
    }

    function open() { modal.classList.remove('hidden'); }
    function close() { modal.classList.add('hidden'); }

    if (qqBtn) qqBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });

    // 复制 QQ 号
    if (copyQqBtn) {
      copyQqBtn.addEventListener('click', function () {
        if (!number) { toast('未配置 QQ 号', 'warning'); return; }
        copyToClipboard(number);
        toast('QQ 号已复制', 'success');
      });
    }

    return { open: open, close: close };
  }

  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  // ===== 安全横幅 =====
  function initSafetyBanner() {
    var banner = $('safetyBanner');
    var closeBtn = $('safetyBannerClose');
    if (!banner) return;

    // 读取 localStorage 决定是否显示
    var dismissed = localStorage.getItem('safetyBannerDismissed') === '1';
    showSafetyBanner(!dismissed);

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        localStorage.setItem('safetyBannerDismissed', '1');
        showSafetyBanner(false);
        toast('横幅已关闭，可在设置中重新打开', 'success');
      });
    }
  }

  function showSafetyBanner(show) {
    var banner = $('safetyBanner');
    if (!banner) return;
    if (show) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  // ===== CDN 依赖检测 =====
  function detectDeps() {
    var missing = [];
    if (typeof QRCode === 'undefined') missing.push('二维码生成库 qrcodejs');
    if (typeof JSZip === 'undefined') missing.push('打包库 JSZip');
    // Bootstrap Icons 检测：读取图标伪元素的 content
    var biOk = false;
    try {
      var probe = document.createElement('i');
      probe.className = 'bi bi-check2';
      probe.style.cssText = 'position:absolute;visibility:hidden;';
      document.body.appendChild(probe);
      var content = window.getComputedStyle(probe, '::before').content;
      document.body.removeChild(probe);
      biOk = !!(content && content !== 'none' && content !== 'normal' && content !== '');
    } catch (e) { biOk = false; }
    if (!biOk) missing.push('图标库 Bootstrap Icons');

    if (!missing.length) return;

    showDepError(missing);
    if (typeof QRCode === 'undefined') {
      var tc = $('transcodeBtn');
      if (tc) { tc.disabled = true; tc.title = '二维码库未加载，无法转码'; }
    }
    if (typeof JSZip === 'undefined') {
      var zc = $('exportZipBtn');
      if (zc) { zc.disabled = true; zc.title = 'JSZip 未加载，无法打包'; }
    }
  }

  function showDepError(missing) {
    if ($('depErrorBanner')) return;
    var bar = document.createElement('div');
    bar.id = 'depErrorBanner';
    bar.className = 'dep-error-banner';
    bar.innerHTML =
      '<i class="bi bi-exclamation-triangle-fill"></i>' +
      '<span><strong>依赖加载失败：</strong>' + missing.join('、') +
      '。请检查网络连接后刷新重试。</span>';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  // ===== 工具函数 =====
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      // Clipboard API 在非安全上下文（file:// 协议）下会抛 NotAllowedError
      // 失败时静默回退到 execCommand，避免控制台报错
      navigator.clipboard.writeText(text).catch(function () {
        execCommandCopy(text);
      });
    } else {
      execCommandCopy(text);
    }
  }

  function execCommandCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }
})();
