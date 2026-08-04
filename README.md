# 卡密转码工具

> 纯前端批量卡密转码工具，将饮料瓶盖卡密批量转换为二维码或活动链接。
> 核心功能在浏览器本地处理，**卡密等敏感数据零外传**；可选的匿名遥测后端仅收集聚合统计数字（访问量/转码次数等），不含卡密/URL/二维码。

🔗 内置脉动规则：卡密 `NVD8Y1OHiIyzDMS` → `https://dbcb2b.cn/S/NVD8Y1OHiIyzDMS` → 二维码

---

## ✨ 功能特性

- **批量卡密转码**：将卡密拼接成完整活动 URL，并批量生成二维码
- **多厂商适配**：内置 10 个饮料厂商规则（脉动/可口可乐/东鹏特饮/东鹏激活码/补水啦/补水啦激活码/加多宝/乐虎/三得利/王老吉），支持自定义添加任意厂商（URL 模板 + 正则），并提供 AI 辅助填写
- **三种输入方式**：文本框批量粘贴 / 文件上传（txt/csv/xlsx）/ 手动逐个添加
- **二维码自定义**：尺寸、容错率、前景色/背景色、外边距、编码内容（URL 或仅卡密）
- **三种导出方式**：网格预览逐个下载 / ZIP 打包 / CSV 清单
- **安全优先**：
  - 输入框 `password` 类型，卡密以圆点显示
  - 失焦（切到其他窗口）或刷新时自动清空输入框
  - 禁用浏览器缓存与自动填充
  - 列表卡密脱敏显示（如 `NVD8Y1O***zDMS`），点击眼睛图标查看明文
  - 卡密**不**写入任何持久化存储
- **顶部安全横幅**：滚动展示安全承诺，可关闭（localStorage 记忆），设置面板可恢复
- **响应式**：适配手机安卓/iOS、平板、PC 端浏览器，支持全面屏安全区
- **PWA 离线**：Service Worker 预缓存核心资源，断网仍可基本使用，可添加到主屏幕
- **深色模式**：浅色 / 深色 / 跟随系统三档切换，自动适配系统主题并持久化
- **扫码自检**：调用摄像头实时解码二维码，验证生成结果可扫性，命中当前批次自动标记已扫
- **Excel 导入**：支持 `.xlsx`/`.xls` 批量导入卡密（SheetJS）
- **厂商规则备份**：自定义厂商规则 JSON 导入/导出，便于跨设备迁移与分享
- **已扫快捷键**：`↑`/`↓` 切换卡片、`空格` 标记已扫，提升扫码枪作业效率
- **匿名遥测与看板**：可选的匿名使用统计（访问量/转码次数/功能使用/厂商/设备/来源），配套独立运营数据看板页面 `stats.html`

---

## 🛠 技术栈

- HTML5 + 原生 JavaScript (ES5/ES6) + CSS3
- 依赖库（已本地化到 `assets/lib/`，支持 PWA 离线，**只加载脚本不传输用户数据**）：
  - [qrcodejs](https://github.com/davidshimjs/qrcodejs) - 二维码生成
  - [JSZip](https://stuk.github.io/jszip/) - ZIP 打包
  - [jsQR](https://github.com/cozmo/jsQR) - 二维码解码（扫码自检/生成验证）
  - [SheetJS](https://sheetjs.com/) - Excel 解析（.xlsx/.xls 导入）
  - [Bootstrap Icons](https://icons.getbootstrap.com/) - 图标库（CDN，SW 运行时缓存）
- 可选后端（匿名遥测）：
  - Cloudflare Workers + KV（无服务器，免运维）
  - 看板图表 [Chart.js](https://www.chartjs.org/)（CDN，仅在 `stats.html` 加载）

无构建步骤，无后端框架，可直接部署到 GitHub Pages；遥测后端为可选独立部署。

---

## 📁 目录结构

```
Transcoding-Platform/
├── index.html              # 主页面
├── stats.html              # 运营数据看板页面（可选）
├── manifest.json           # PWA 应用清单
├── sw.js                   # Service Worker（离线缓存）
├── css/
│   └── style.css           # 样式表（含横幅动画、卡片、响应式、暗色模式）
├── js/
│   ├── vendor.js           # 厂商管理（内置规则 + 自定义扩展）
│   ├── input.js            # 卡密输入（粘贴/上传/手动 + 安全）
│   ├── transcode.js        # 转码核心（校验/去重/脱敏）
│   ├── qrcode-gen.js       # 二维码生成（含 Logo 嵌入）
│   ├── export.js           # 导出（单图/ZIP/CSV）
│   ├── app.js              # 主入口（事件/渲染/横幅/设置/埋点）
│   ├── telemetry-config.js # 遥测配置（端点/采样，外置便于迁移）
│   ├── telemetry.js        # 匿名遥测模块（事件收集/双通道上报）
│   └── stats.js            # 看板逻辑（拉取聚合数据 + Chart.js 渲染）
├── assets/
│   ├── lib/                # 本地化的第三方库
│   ├── icons/              # PWA 图标
│   └── qq/                 # QQ 联系方式配置与二维码
├── workers/                # 可选后端：Cloudflare Workers（匿名遥测）
│   ├── src/                # 后端源码（handlers/lib/constants）
│   └── wrangler.toml       # Wrangler 部署配置
├── PRD.md                  # 产品需求文档
└── README.md               # 本文档
```

---

## 🚀 本地运行

由于使用了 CDN 脚本和文件分模块，建议通过本地服务器打开（直接双击 `index.html` 也可运行，但部分浏览器对 `file://` 协议有限制）。

**方式一：Python 内置服务器**
```bash
python -m http.server 8000
# 访问 http://localhost:8000
```

**方式二：Node http-server**
```bash
npx http-server -p 8000
```

**方式三：直接打开**
直接双击 `index.html`，在浏览器中打开即可（二维码生成、ZIP 打包均可用）。

---

## 📦 部署到 GitHub Pages

1. 将本仓库推送到 GitHub
2. 进入仓库 **Settings** → **Pages**
3. **Source** 选择 `Deploy from a branch`
4. **Branch** 选择 `main`（或 `master`），文件夹选 `/root`
5. 保存后约 1 分钟，访问 `https://<用户名>.github.io/<仓库名>/` 即可

> 纯静态文件，无需构建配置。

---

## 📊 运营数据看板（可选）

配套独立的运营数据看板页面 `stats.html`，用于查看匿名聚合统计，适合运营复盘与简历项目数据展示。

- **访问入口**：主页右上角「运营数据看板」图标按钮（`bi-bar-chart-line`）直链，或直接访问 `https://<域名>/stats.html`
- **展示内容**：
  - KPI 指标卡：累计访问量、转码次数、转码卡密数、有效/无效/重复卡密
  - 趋势图：近 30 天访问量与转码次数折线
  - 厂商转码分布（柱状）、设备分布（饼图）、访问来源分布（饼图）
  - 功能使用排行（进度条列表）
- **特性**：60 秒自动刷新、手动刷新、暗色模式自适应、加载/错误/空状态降级
- **数据口径**：仅匿名聚合数字，不含卡密/URL/二维码等敏感信息（详见页面底部隐私说明）

> 看板依赖后端聚合 API，需先完成下方「后端部署」并配置端点，否则看板会显示错误状态（不影响主页功能）。

---

## 🛰 后端部署（Cloudflare Workers，可选）

匿名遥测后端基于 Cloudflare Workers + KV，免服务器、免运维，免费额度足够个人项目。

### 1. 创建 KV 命名空间

```bash
npx wrangler kv:namespace create STATS
# 记录返回的 id，填入 wrangler.toml
```

### 2. 配置 `workers/wrangler.toml`

```toml
[[kv_namespaces]]
binding = "STATS"
id = "上一步返回的 id"

[vars]
ALLOWED_ORIGINS = "https://<你的前端域名>,http://localhost:8000"
```

### 3. 配置前端端点

编辑 `js/telemetry-config.js`，将 `endpoint` 改为 Workers 域名：

```javascript
endpoint: 'https://cardtool-stats.<你的子域>.workers.dev/api/track'
```

### 4. 部署

```bash
cd workers
npx wrangler deploy
```

### 5. 验证

- 访问 `https://cardtool-stats.<子域>.workers.dev/api/health` 应返回 `{"ok":true,...}`
- 打开主页执行一次转码，约 5 秒后访问 `stats.html` 即可看到数据

> **可迁移性**：所有 KV 访问封装在 `workers/src/lib/storage.js`，迁移到自建后端时只需实现同接口；前端端点集中在 `telemetry-config.js` 一处。

---

## 📖 使用说明

### 基本流程

1. **选择厂商**：内置 10;个饮料厂商（脉动/可口可乐/东鹏特饮等），默认脉动；也可在「添加自定义厂商」中配置其他厂商
2. **配置二维码**（可选）：调整尺寸、容错率、颜色、边距、编码内容
3. **输入卡密**：任选一种方式（粘贴 / 上传 / 手动）添加到待转码列表
4. **开始转码**：点击「开始转码」按钮，批量生成二维码
5. **导出结果**：逐个下载、打包 ZIP 或导出 CSV 清单

### 添加自定义厂商

点击「添加自定义厂商」，填写：

| 字段 | 说明 | 示例 |
|------|------|------|
| 厂商名称 | 显示名 | 可口可乐 |
| URL 模板 | 含 `{卡密}` 占位符 | `https://example.com/{卡密}` |
| 卡密正则 | 用于格式校验 | `^[A-Z0-9]{12}$` |
| 卡密长度 | 提示用 | 12 |
| 图标 | Bootstrap Icons 名称 | cup-fill |
| 主题色 | 卡片配色 | #E61A27 |

自定义厂商规则保存在浏览器 `localStorage`（仅本地），可随时切换。

---

## 🔒 安全说明

| 要求 | 实现 |
|------|------|
| 输入框 password 类型 | `<input type="password">` |
| 失焦自动清空 | `window.blur` 事件清空输入框（保留已生成结果） |
| 刷新自动清空 | `beforeunload` 事件清空输入 |
| 禁止缓存 | meta `Cache-Control: no-cache, no-store` + `autocomplete="off"` |
| 卡密零外传 | 卡密、完整 URL、二维码图像**绝不**上报；CDN 仅加载脚本不传数据 |
| 卡密不持久化 | 卡密本身**不**写入 localStorage；仅厂商规则存 localStorage |
| 匿名统计（可选） | 仅上报访问量/转码次数/功能使用/厂商 ID/设备类型等**聚合数字**；前端 + 后端双重字段白名单过滤，剥离卡密/URL/二维码等敏感字段；尊重 DoNotTrack；可在设置中一键关闭 |
| 已扫状态隔离 | 已扫标记仅存卡密哈希（非明文）到 sessionStorage，关闭标签页即清除 |
| 卡密脱敏 | 列表默认显示 `NVD8Y1O***zDMS`，点击眼睛图标查看明文 |

---

## ⚠️ 已知限制

- **无法真正验证卡密有效性**：纯前端受 CORS 限制，且为隐私优先不发送卡密到第三方，仅做本地格式校验（长度/字符集/正则）
- **CDN 依赖**：qrcodejs/JSZip/jsQR/SheetJS 已本地化到 `assets/lib/`；仅 Bootstrap Icons 与 Chart.js 走 CDN，经 Service Worker 运行时缓存，离线基本可用
- **大批量性能**：建议单次处理 ≤ 1000 条；已实现 IntersectionObserver 虚拟滚动（分页渲染），1000+ 卡密流畅显示

---

## 📋 开发计划

详见 [PRD.md](./PRD.md) 第六章。已完成 P1-P8 全部阶段（P8 为可选的匿名遥测与运营看板）。

---

## 📚 相关文档

- [PRD.md](./PRD.md) - 产品需求文档
- [开发问题与解决方案.md](./开发问题与解决方案.md) - 开发过程中遇到的典型问题、根因分析及解决方案
- [test-layout.html](./test-layout.html) - 按钮布局响应式测试页面（本地运行 `python -m http.server 8080` 后访问）

---

##  已知问题与修复记录

| 问题 | 状态 | 修复版本 |
|------|------|----------|
| 东鹏特饮/激活码 URL 模板互换 + 卡密长度错误 | ✅ 已修复 | 894e5e6 |
| 补水啦/激活码卡密长度错误（12→11） | ✅ 已修复 | 894e5e6 |
| 文件上传后无反馈，选文件后点击解析提示"请先选择文件" | ✅ 已修复 | 5e75764 + 152a937 |
| 手机端操作栏 6 个按钮一行平分，文字溢出屏幕 | ✅ 已修复 | 637335c |
| 转码事件只入队等 5 秒定时器，"转完即走"时数据丢失 | ✅ 已修复 | e6bdf9d |
| Cloudflare Workers 大量错误（后端无全局 try/catch） | ✅ 已修复 | e6bdf9d |
| 遥测 fetch 带 keepalive 导致 CORS 预检失败 | ✅ 已修复 | 1f3c204 + 36983a3 |

详细问题分析见 [开发问题与解决方案.md](./开发问题与解决方案.md)。
