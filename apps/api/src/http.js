const localhostOrigin = /^https?:\/\/localhost(?::\d+)?$/;

export function now() {
  return new Date().toISOString();
}

export function requestId() {
  return crypto.randomUUID();
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return '';
  const configured = String(env.ALLOWED_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (configured.includes(origin)) return origin;
  if (env.ENVIRONMENT !== 'production' && localhostOrigin.test(origin)) return origin;
  return '';
}

export function responseHeaders(request, env, id, cacheControl = 'no-store') {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    'Vary': 'Origin',
    'X-Request-Id': id,
  });
  const origin = allowedOrigin(request, env);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'false');
    headers.set('Access-Control-Expose-Headers', 'ETag, X-Request-Id');
  }
  return headers;
}

export function json(request, env, body, options = {}) {
  const id = options.requestId || requestId();
  const headers = responseHeaders(request, env, id, options.cacheControl || 'no-store');
  for (const [key, value] of Object.entries(options.headers || {})) headers.set(key, value);
  return new Response(JSON.stringify(body), { status: options.status || 200, headers });
}

export function errorJson(request, env, code, status = 500, id = requestId(), details) {
  const body = { error: code, requestId: id };
  if (details) body.details = details;
  return json(request, env, body, { status, requestId: id });
}

export function corsPreflight(request, env, id) {
  const headers = responseHeaders(request, env, id);
  headers.set('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Library-Key, X-Anonymous-Library-Key');
  headers.set('Access-Control-Max-Age', '600');
  return new Response(null, { status: 204, headers });
}

export function clean(value, max = 600) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export function isValidCatalogId(value) {
  return /^[a-z][a-z0-9_-]{1,32}:[A-Za-z0-9._~=%-]{1,240}$/i.test(value);
}

export function isValidAnonymousKey(value) {
  return /^[A-Za-z0-9._-]{16,128}$/.test(value);
}
