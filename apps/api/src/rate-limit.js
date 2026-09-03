const WINDOW_MS = 60_000;
const MAX_BUCKETS = 5_000;
const buckets = new Map();

function clientId(request) {
  return request.headers.get('CF-Connecting-IP') || 'anonymous';
}

function prune(now) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) buckets.delete(key);
    if (buckets.size < MAX_BUCKETS) break;
  }
  while (buckets.size >= MAX_BUCKETS) buckets.delete(buckets.keys().next().value);
}

export function rateLimit(request, scope, limit, now = Date.now()) {
  const key = `${scope}:${clientId(request)}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.expiresAt <= now) {
    prune(now);
    bucket = { count: 0, expiresAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  return {
    limited: bucket.count > limit,
    remaining,
    limit,
    retryAfter: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)),
    reset: Math.ceil(bucket.expiresAt / 1000),
  };
}

export function rateLimitScope(pathname, method) {
  if (pathname === '/health' || pathname === '/api/v1/health') return null;
  if (pathname.startsWith('/api/library') || pathname.startsWith('/api/v1/library')) {
    return method === 'GET' ? ['library-read', 60] : ['library-write', 30];
  }
  if (pathname === '/api/catalog' || pathname === '/api/v1/catalog' || pathname === '/api/v1/catalog/search') return ['catalog-search', 30];
  if (pathname.startsWith('/api/catalog/') || pathname.startsWith('/api/v1/catalog/')) return ['catalog-item', 60];
  return ['default', 60];
}
