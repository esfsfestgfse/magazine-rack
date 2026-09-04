import { clean, errorJson, isValidCatalogId, json } from '../http.js';
import { publicItem } from './items.js';
import { sourceAdapter, configuredSourceIds } from '../sources/registry.js';

function dbItem(row) { return { ...row, sourceName: row.source, coverUrl: row.cover_url, sourceUrl: row.source_url, readerUrl: row.reader_url, pageCount: row.page_count, lastSeenAt: row.last_seen_at }; }

async function persist(env, items) {
  if (!env.DB || !items.length) return;
  const timestamp = new Date().toISOString();
  const statements = items.slice(0, 90).map((item) => env.DB.prepare(`INSERT INTO catalog_items (id, source, source_id, title, creator, year, genre, description, cover_url, source_url, reader_url, page_count, metadata_json, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, creator=excluded.creator, year=excluded.year, genre=excluded.genre, description=excluded.description, cover_url=excluded.cover_url, source_url=excluded.source_url, reader_url=excluded.reader_url, page_count=excluded.page_count, metadata_json=excluded.metadata_json, last_seen_at=excluded.last_seen_at`).bind(item.id, item.sourceName, item.sourceId, item.title, item.creator, item.year, item.genre, item.description, item.coverUrl, item.sourceUrl, item.readerUrl, item.pageCount, JSON.stringify(item.metadata || {}), timestamp, timestamp));
  await env.DB.batch(statements);
}

async function stored(env, query, genre, page) {
  if (!env.DB) return { items: [], total: 0 };
  const like = `%${query}%`; const offset = (page - 1) * 30;
  const result = await env.DB.prepare(`SELECT id, source, title, creator, year, genre, description, cover_url, source_url, reader_url, page_count, last_seen_at FROM catalog_items WHERE (? = '' OR title LIKE ? OR creator LIKE ? OR description LIKE ?) AND (? = '' OR lower(genre) = lower(?)) ORDER BY last_seen_at DESC LIMIT 30 OFFSET ?`).bind(query, like, like, like, genre, genre, offset).all();
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM catalog_items WHERE (? = '' OR title LIKE ? OR creator LIKE ? OR description LIKE ?) AND (? = '' OR lower(genre) = lower(?))`).bind(query, like, like, like, genre, genre).first();
  return { items: (result.results || []).map(dbItem), total: Number(count?.total) || 0 };
}

export async function handleCatalogSearch(request, env, ctx, requestId) {
  const url = new URL(request.url); const query = clean(url.searchParams.get('q'), 120); const genre = clean(url.searchParams.get('genre'), 80); const source = clean(url.searchParams.get('source'), 30).toLowerCase(); const page = Math.max(1, Math.min(100, Number(url.searchParams.get('page')) || 1)); const newspaperMonthDay = clean(url.searchParams.get('newspaper_month_day'), 5);
  if (newspaperMonthDay && !/^\d{2}-\d{2}$/.test(newspaperMonthDay)) return errorJson(request, env, 'invalid_newspaper_month_day', 400, requestId);
  if (source && !sourceAdapter(source)) return errorJson(request, env, 'invalid_source', 400, requestId);
  const sourceIds = source ? [source] : configuredSourceIds();
  const responses = await Promise.allSettled(sourceIds.map((id) => sourceAdapter(id)({ query, genre, page, newspaperMonthDay }, env)));
  let items = responses.flatMap((result) => result.status === 'fulfilled' ? result.value.items : []);
  let total = responses.reduce((sum, result) => sum + (result.status === 'fulfilled' ? result.value.total : 0), 0);
  if (!items.length && env.DB) { const fallback = await stored(env, query, genre, page); items = fallback.items; total = fallback.total; }
  ctx.waitUntil(persist(env, items));
  const sourceStatuses = Object.fromEntries(sourceIds.map((id, index) => [id, responses[index].status === 'fulfilled' ? 'ok' : 'unavailable']));
  return json(request, env, { items: items.map(publicItem), total, page, pageSize: 30, sources: sourceStatuses, stale: Object.values(sourceStatuses).some((value) => value !== 'ok') }, { requestId, cacheControl: 'public, max-age=120, stale-while-revalidate=600' });
}
