/* =========================================================
   constants.js - 事件白名单与字段配置
   纵深防御：Worker 端二次过滤，任何不在白名单的字段一律丢弃
   ========================================================= */

// 各事件允许的 props 字段白名单
export const EVENT_FIELDS = {
  pageview: ['referrer', 'device', 'tz'],
  transcode: ['vendorId', 'total', 'valid', 'invalid', 'duplicate', 'preview'],
  feature: ['name'],
  setting: ['name', 'value']
};

// feature 事件 name 枚举值
export const FEATURE_NAMES = new Set([
  'scan_check', 'excel_import', 'file_import', 'export_csv', 'export_zip',
  'print', 'add_custom_vendor', 'preview_first', 'input_paste', 'input_manual'
]);

// setting 事件 name 枚举值
export const SETTING_NAMES = new Set(['theme', 'banner', 'telemetry', 'print_cols']);

// 敏感字段黑名单：出现即丢弃并告警（即使前端误传也绝不存储）
export const SENSITIVE_KEYS = [
  'code', 'codes', 'url', 'dataURL', 'regex', 'urlTemplate',
  'qq', 'phone', 'email', 'token', 'password', 'cookie', 'ip'
];

// 请求体限制
export const MAX_PAYLOAD_BYTES = 16 * 1024; // 16KB
export const MAX_EVENTS_PER_REQUEST = 20;
