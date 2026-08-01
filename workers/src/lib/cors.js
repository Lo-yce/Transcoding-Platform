/* =========================================================
   cors.js - CORS 工具
   仅回显白名单 Origin，不开放 *（防滥用）
   ========================================================= */

export function getAllowedOrigins(env) {
  var raw = (env && env.ALLOWED_ORIGINS) || '';
  return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

export function corsHeaders(req, env) {
  var origin = req.headers.get('Origin') || '';
  var allowed = getAllowedOrigins(env);
  var headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Max-Age': '86400'
  };
  if (origin && allowed.indexOf(origin) >= 0) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

export function handleOptions(req, env) {
  return new Response(null, { status: 204, headers: corsHeaders(req, env) });
}

export function json(data, req, env, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8' },
      corsHeaders(req, env)
    )
  });
}
