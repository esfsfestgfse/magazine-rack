import { clean, errorJson, isValidCatalogId, json } from '../http.js';
import { publicItem } from './items.js';
import { sourceAdapter, configuredSourceIds } from '../sources/registry.js';
import { sourceFailure } from '../sources/request.js';

const SOURCE_NAMES = Object.freeze({
  archive: 'Internet Archive',
  loc: 'Library of Congress',
  openlibrary: 'Open Library',
  europeana: 'Europeana',
  comicbookplus: 'Comic Book Plus',
  gcd: 'Grand Comics Database',
  dpla: 'Digital Public Library of America'
});
const SOURCE_DEADLINE_MS = 5_000;

function sourceDetailsFor(source, items, total, status, error) {
  return { [source || 'archive']: { status, count: items.length, total: Number(total) || items.length, stale: status !== 'ok', ...(error ? { error } : {}) } };
}

function sourceKey(value) {
  const text = String(value || '').toLowerCase();
  return Object.entries(SOURCE_NAMES).find(([key, label]) => text === key || text === label.toLowerCase())?.[0] || String(value || '');
}

function cacheResponseForRequest(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'false');
  } else if (!origin) {
    headers.delete('Access-Control-Allow-Origin');
    headers.delete('Access-Control-Allow-Credentials');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function dbItem(row) {
  const source = sourceKey(row.source);
  let metadata = {};
  try { metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {}; } catch { metadata = {}; }
  let availability = {};
  try { availability = row.availability_json ? JSON.parse(row.availability_json) : {}; } catch { availability = {}; }
  return { ...row, source, sourceName: SOURCE_NAMES[source] || row.source, coverUrl: row.cover_url, sourceUrl: row.source_url, readerUrl: row.reader_url, pageCount: row.page_count, lastSeenAt: row.last_seen_at, readable: Boolean(row.readable), readerKind: row.reader_kind || 'none', coverQuality: Number(row.cover_quality) || 0, rights: row.rights || '', availability, metadata };
}

async function persist(env, items) {
  if (!env.DB || !items.length) return;
  const timestamp = new Date().toISOString();
  const statements = items.slice(0, 90).map((item) => env.DB.prepare(`INSERT INTO catalog_items (id, source, source_id, title, creator, year, genre, description, cover_url, source_url, reader_url, page_count, metadata_json, first_seen_at, last_seen_at, access, readable, reader_kind, cover_quality, availability_json, rights) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET source=excluded.source, title=excluded.title, creator=excluded.creator, year=excluded.year, genre=excluded.genre, description=excluded.description, cover_url=excluded.cover_url, source_url=excluded.source_url, reader_url=excluded.reader_url, page_count=excluded.page_count, metadata_json=excluded.metadata_json, last_seen_at=excluded.last_seen_at, access=excluded.access, readable=excluded.readable, reader_kind=excluded.reader_kind, cover_quality=excluded.cover_quality, availability_json=excluded.availability_json, rights=excluded.rights`).bind(item.id, item.source, item.sourceId, item.title, item.creator, item.year, item.genre, item.description, item.coverUrl, item.sourceUrl, item.readerUrl, item.pageCount, JSON.stringify(item.metadata || {}), timestamp, timestamp, item.access || 'catalog', item.readable === true ? 1 : 0, item.readerKind || 'none', Number(item.coverQuality) || 0, JSON.stringify(item.availability || {}), item.rights || ''));
  await env.DB.batch(statements);
}

async function stored(env, query, genre, page, source) {
  if (!env.DB) return { items: [], total: 0 };
  const like = `%${query}%`; const offset = (page - 1) * 30; const sourceName = SOURCE_NAMES[source] || source || '';
  const sourceClause = source ? ' AND (lower(source) = lower(?) OR lower(source) = lower(?))' : " AND lower(source) NOT IN ('gcd', 'grand comics database')";
  const values = source ? [query, like, like, like, genre, genre, source, sourceName, offset] : [query, like, like, like, genre, genre, offset];
  const countValues = source ? values.slice(0, 8) : values.slice(0, 6);
  const readableClause = ' AND readable = 1';
  let result = await env.DB.prepare(`SELECT id, source, title, creator, year, genre, description, cover_url, source_url, reader_url, page_count, metadata_json, last_seen_at, access, readable, reader_kind, cover_quality, availability_json, rights FROM catalog_items WHERE (? = '' OR title LIKE ? OR creator LIKE ? OR description LIKE ?) AND (? = '' OR lower(genre) = lower(?))${readableClause}${sourceClause} ORDER BY cover_quality DESC, last_seen_at DESC LIMIT 30 OFFSET ?`).bind(...values).all();
  let count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM catalog_items WHERE (? = '' OR title LIKE ? OR creator LIKE ? OR description LIKE ?) AND (? = '' OR lower(genre) = lower(?))${readableClause}${sourceClause}`).bind(...countValues).first();

  // The full Lucene shelf query is not a literal title search. If the live
  // provider is down, use the last readable archive snapshot rather than
  // returning an empty rack; the response is marked stale by the caller.
  if (!(result.results || []).length && source === 'archive') {
    result = await env.DB.prepare(`SELECT id, source, title, creator, year, genre, description, cover_url, source_url, reader_url, page_count, metadata_json, last_seen_at, access, readable, reader_kind, cover_quality, availability_json, rights FROM catalog_items WHERE readable = 1 AND lower(source) IN ('archive', 'internet archive') ORDER BY cover_quality DESC, last_seen_at DESC LIMIT 30 OFFSET ?`).bind(offset).all();
    count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM catalog_items WHERE readable = 1 AND lower(source) IN ('archive', 'internet archive')`).first();
  }
  return { items: (result.results || []).map(dbItem), total: Number(count?.total) || 0 };
}

async function refreshLiveSnapshot(env, query, genre, page, source, newspaperMonthDay) {
  const sourceIds = source ? [source] : configuredSourceIds();
  const responses = await Promise.allSettled(sourceIds.map((id) => Promise.race([
    sourceAdapter(id)({ query, genre, page, newspaperMonthDay }, env),
    new Promise((_, reject) => setTimeout(() => reject(new Error('source_timeout')), SOURCE_DEADLINE_MS)),
  ])));
  const items = responses.flatMap((result) => result.status === 'fulfilled' ? result.value.items || [] : []);
  if (items.length) await persist(env, items);
  return { items, responses };
}

export async function handleCatalogSearch(request, env, ctx, requestId) {
  const url = new URL(request.url); const query = clean(url.searchParams.get('q'), 1800); const genre = clean(url.searchParams.get('genre'), 80); const source = clean(url.searchParams.get('source'), 30).toLowerCase(); const page = Math.max(1, Math.min(100, Number(url.searchParams.get('page')) || 1)); const newspaperMonthDay = clean(url.searchParams.get('newspaper_month_day'), 5);
  if (newspaperMonthDay && !/^\d{2}-\d{2}$/.test(newspaperMonthDay)) return errorJson(request, env, 'invalid_newspaper_month_day', 400, requestId);
  if (source && !sourceAdapter(source)) return errorJson(request, env, 'invalid_source', 400, requestId);
  // Ignore the client's minute cache-buster so the Worker cache can absorb
  // repeated shelf loads. CORS is applied after the cache lookup, allowing a
  // successful smoke-test or another allowed origin to warm the same public
  // catalog response for the Pages app during an upstream outage.
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.searchParams.delete('_');
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cacheResponseForRequest(cached, request, env);

  // Return the last known-good shelf immediately. Provider refreshes happen
  // after the response so a 429, timeout, or provider error cannot blank it.
  let firstStored = { items: [], total: 0 };
  try { firstStored = await stored(env, query, genre, page, source); }
  catch (error) { console.error(JSON.stringify({ message: 'catalog_stored_read_failed', requestId, error: error instanceof Error ? error.message : String(error) })); }
  if (firstStored.items.length) {
    const staleResponse = json(request, env, {
      items: firstStored.items.map(publicItem), total: firstStored.total, totalIsEstimate: true, page, pageSize: 30,
      sources: { [source || 'archive']: 'stale' },
      sourceDetails: sourceDetailsFor(source, firstStored.items, firstStored.total, 'degraded', 'serving_cached_snapshot'),
      stale: true, partial: true, refresh: 'background'
    }, { requestId, cacheControl: 'public, max-age=20, stale-while-revalidate=300' });
    if (cache) ctx.waitUntil(cache.put(cacheKey, staleResponse.clone()).catch(() => {}));
    ctx.waitUntil(refreshLiveSnapshot(env, query, genre, page, source, newspaperMonthDay).catch((error) => {
      console.error(JSON.stringify({ message: 'catalog_background_refresh_failed', requestId, error: error instanceof Error ? error.message : String(error) }));
    }));
    return staleResponse;
  }

  const sourceIds = source ? [source] : configuredSourceIds();
  const responses = await Promise.allSettled(sourceIds.map((id) => Promise.race([
    sourceAdapter(id)({ query, genre, page, newspaperMonthDay }, env),
    new Promise((_, reject) => setTimeout(() => reject(new Error('source_timeout')), SOURCE_DEADLINE_MS)),
  ])));
  const liveItems = responses.flatMap((result) => result.status === 'fulfilled' ? result.value.items || [] : []);
  const failed = responses.filter((result) => result.status === 'rejected' || result.value?.partial).length;
  let items = liveItems;
  let total = responses.reduce((sum, result) => sum + (result.status === 'fulfilled' ? Number(result.value.total) || 0 : 0), 0);
  let storedFallback = { items: [], total: 0 };
  // A provider outage must not erase the last good records from D1. Merge
  // stored records whenever a live response is partial, while keeping live
  // records first so a recovered source wins naturally.
  if (env.DB && (failed > 0 || !items.length)) {
    storedFallback = await stored(env, query, genre, page, source);
    const seen = new Set(items.map((item) => item.id));
    items = [...items, ...storedFallback.items.filter((item) => !seen.has(item.id))].slice(0, 30);
    if (!liveItems.length) total = storedFallback.total;
    else total = Math.max(total, items.length);
  }
  ctx.waitUntil(persist(env, items).catch((error) => {
    console.error(JSON.stringify({ message: 'catalog_persist_failed', requestId, error: error instanceof Error ? error.message : String(error) }));
  }));
  const sourceDetails = Object.fromEntries(sourceIds.map((id, index) => {
    const result = responses[index];
    if (result.status === 'rejected') {
      const failure = sourceFailure(result.reason);
      return [id, { status: 'unavailable', count: 0, total: 0, error: failure.code }];
    }
    const value = result.value || {};
    return [id, {
      status: value.partial ? 'degraded' : 'ok',
      count: Array.isArray(value.items) ? value.items.length : 0,
      total: Number(value.total) || 0,
      stale: value.stale === true,
      errors: Array.isArray(value.errors) ? value.errors.slice(0, 8) : [],
    }];
  }));
  const sourceStatuses = Object.fromEntries(Object.entries(sourceDetails).map(([id, detail]) => [id, detail.status === 'ok' ? 'ok' : 'unavailable']));
  const stale = Object.values(sourceDetails).some((detail) => detail.status !== 'ok' || detail.stale) || Boolean(storedFallback.items.length);
  const response = json(request, env, {
    items: items.map(publicItem),
    total,
    totalIsEstimate: sourceIds.length > 1 || failed > 0,
    page,
    pageSize: 30,
    sources: sourceStatuses,
    sourceDetails,
    stale,
    partial: failed > 0,
  }, { requestId, cacheControl: 'public, max-age=120, stale-while-revalidate=600' });
  if (cache && !failed && !stale) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => {
      console.error(JSON.stringify({ message: 'catalog_cache_put_failed', requestId, error: error instanceof Error ? error.message : String(error) }));
    }));
  }
  return response;
}
