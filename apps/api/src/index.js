import { corsPreflight, errorJson, json, now, requestId } from './http.js';
import { handleCatalogSearch } from './routes/catalog.js';
import { handleCatalogItem } from './routes/items.js';
import { handleMedia } from './routes/media.js';
import { handleLibrary } from './library.js';
import { rateLimit, rateLimitScope } from './rate-limit.js';
import { configuredSourceIds } from './sources/registry.js';

const catalogSearchPaths = new Set(['/api/catalog', '/api/v1/catalog', '/api/v1/catalog/search']);
const itemPrefixes = ['/api/catalog/', '/api/v1/catalog/', '/api/v1/catalog/items/'];
const libraryPrefixes = ['/api/library', '/api/v1/library'];
const mediaPaths = new Set(['/api/media', '/api/v1/media']);

function itemIdForPath(pathname) {
  const prefix = itemPrefixes.find((value) => pathname.startsWith(value));
  if (!prefix) return '';
  try { return decodeURIComponent(pathname.slice(prefix.length)); } catch { return null; }
}

export default {
  async fetch(request, env, ctx) {
    const id = requestId();
    if (request.method === 'OPTIONS') return corsPreflight(request, env, id);
    const url = new URL(request.url);
    const scope = rateLimitScope(url.pathname, request.method);
    if (scope) {
      const budget = rateLimit(request, scope[0], scope[1]);
      if (budget.limited) {
        return json(request, env, { error: 'rate_limited', requestId: id }, {
          status: 429,
          requestId: id,
          headers: {
            'Retry-After': String(budget.retryAfter),
            'RateLimit-Limit': String(budget.limit),
            'RateLimit-Remaining': '0',
            'RateLimit-Reset': String(budget.reset),
          },
        });
      }
    }

    try {
      if (url.pathname === '/health' || url.pathname === '/api/v1/health') {
        return json(request, env, {
          ok: true,
          service: 'magazine-rack-api',
          environment: env.ENVIRONMENT || 'development',
          dependencies: { database: env.DB ? 'configured' : 'not_configured', sources: configuredSourceIds(env) },
          time: now(),
          requestId: id,
        }, { requestId: id, cacheControl: 'no-store' });
      }
      if (request.method === 'GET' && catalogSearchPaths.has(url.pathname)) return await handleCatalogSearch(request, env, ctx, id);
      if (request.method === 'GET' && mediaPaths.has(url.pathname)) return await handleMedia(request, env, ctx, id);
      if (request.method === 'GET' && itemPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
        const itemId = itemIdForPath(url.pathname);
        return itemId === null ? errorJson(request, env, 'invalid_id', 400, id) : await handleCatalogItem(request, env, ctx, itemId, id);
      }
      if (libraryPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) return await handleLibrary(request, env, url, id);
      return errorJson(request, env, 'not_found', 404, id);
    } catch (error) {
      console.error(JSON.stringify({ message: 'request_failed', requestId: id, path: url.pathname, error: error instanceof Error ? error.message : String(error) }));
      return errorJson(request, env, 'internal_error', 500, id);
    }
  },
};
