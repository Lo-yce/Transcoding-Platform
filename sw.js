/* =========================================================
   sw.js - Service Worker（PWA 离线支持）
   - 预缓存核心本地资源
   - CDN 资源运行时缓存（首次在线后离线可用）
   ========================================================= */
var CACHE = 'cardtool-v5';

var PRECACHE = [
  './',
  'index.html',
  'stats.html',
  'css/style.css',
  'js/vendor.js',
  'js/input.js',
  'js/transcode.js',
  'js/qrcode-gen.js',
  'js/export.js',
  'js/app.js',
  'js/telemetry-config.js',
  'js/telemetry.js',
  'js/stats.js',
  'assets/qq/qq-config.js',
  'assets/qq/qq-qrcode.jpg',
  'assets/lib/qrcode.min.js',
  'assets/lib/jszip.min.js',
  'assets/lib/jsQR.js',
  'assets/lib/xlsx.full.min.js',
  'assets/icons/icon.svg',
  'assets/icons/icon-180.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'manifest.json'
];

var CDN_PREFIXES = ['https://cdn.jsdelivr.net/'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 逐个缓存，单个失败不影响整体安装
      return Promise.all(PRECACHE.map(function (url) {
        return c.add(url).catch(function () {});
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  var isCdn = CDN_PREFIXES.some(function (p) { return url.href.indexOf(p) === 0; });
  var isSameOrigin = url.origin === self.location.origin;

  if (!(isCdn || isSameOrigin)) return;

  // /api/ 请求（遥测上报、看板数据查询）直连后端，SW 不拦截、不缓存
  // 后端为 Cloudflare Workers，可同域 routes 部署，此处守卫确保始终走网络
  if (isSameOrigin && url.pathname.indexOf('/api/') === 0) return;

  if (isCdn) {
    // CDN 资源：cache-first，后台更新（离线可用）
    e.respondWith(
      caches.match(req).then(function (cached) {
        var fetcher = fetch(req).then(function (res) {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
          }
          return res;
        }).catch(function () { return cached; });
        return cached || fetcher;
      })
    );
  } else {
    // 本地资源：network-first，失败回退缓存（确保用户拿到最新代码，离线时仍可用）
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || Response.error();
        });
      })
    );
  }
});
