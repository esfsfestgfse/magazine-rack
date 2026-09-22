import { clean, errorJson, isValidCatalogId, json } from '../http.js';
import { publicItem } from './items.js';
import { sourceAdapter, configuredSourceIds } from '../sources/registry.js';
import { sourceFailure } from '../sources/request.js';
import { measureShelf } from '../audit.js';

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
  return { ...row, source, sourceName: SOURCE_NAMES[source] || row.source, coverUrl: row.cover_url, sourceUrl: row.source_url, readerUrl: row.reader_url, pageCount: row.page_count, issueMonthDay: row.issue_month_day || '', lastSeenAt: row.last_seen_at, readable: Boolean(row.readable), readerKind: row.reader_kind || 'none', coverQuality: Number(row.cover_quality) || 0, rights: row.rights || '', availability, metadata };
}

function monthDay(value) {
  const text = String(value || '');
  const iso = text.match(/\b\d{4}[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${String(iso[1]).padStart(2, '0')}-${String(iso[2]).padStart(2, '0')}`;
  const named = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
  if (!named) return '';
  const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(named[1].toLowerCase()) + 1;
  return `${String(month).padStart(2, '0')}-${String(named[2]).padStart(2, '0')}`;
}

function collectionTokens(query) {
  const text = String(query || '');
  const values = [];
  const collect = (value) => {
    String(value || '').split(/\s+OR\s+/i).forEach((token) => {
      const cleaned = token.replace(/[()\"']/g, '').trim().toLowerCase();
      if (/^[a-z0-9][a-z0-9_*.-]*$/.test(cleaned) && !cleaned.includes('*')) values.push(cleaned);
    });
  };
  for (const match of text.matchAll(/collection:\(([^)]+)\)/gi)) collect(match[1]);
  for (const match of text.matchAll(/collection:([^\s()]+)/gi)) collect(match[1]);
  return [...new Set(values)].slice(0, 12);
}

async function persist(env, items) {
  if (!env.DB || !items.length) return;
  const timestamp = new Date().toISOString();
  const catalogStatements = items.slice(0, 90).map((item) => env.DB.prepare(`INSERT INTO catalog_items (id, source, source_id, title, creator, year, issue_month_day, genre, description, cover_url, source_url, reader_url, page_count, metadata_json, first_seen_at, last_seen_at, access, readable, reader_kind, cover_quality, availability_json, rights) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET source=excluded.source, title=excluded.title, creator=excluded.creator, year=excluded.year, issue_month_day=excluded.issue_month_day, genre=excluded.genre, description=excluded.description, cover_url=excluded.cover_url, source_url=excluded.source_url, reader_url=excluded.reader_url, page_count=excluded.page_count, metadata_json=excluded.metadata_json, last_seen_at=excluded.last_seen_at, access=excluded.access, readable=excluded.readable, reader_kind=excluded.reader_kind, cover_quality=excluded.cover_quality, availability_json=excluded.availability_json, rights=excluded.rights`).bind(item.id, item.source, item.sourceId, item.title, item.creator, item.year, monthDay(item.metadata?.date || item.year || item.title), item.genre, item.description, item.coverUrl, item.sourceUrl, item.readerUrl, item.pageCount, JSON.stringify(item.metadata || {}), timestamp, timestamp, item.access || 'catalog', item.readable === true ? 1 : 0, item.readerKind || 'none', Number(item.coverQuality) || 0, JSON.stringify(item.availability || {}), item.rights || ''));
  const collectionStatements = items.slice(0, 90).flatMap((item) => {
    const raw = item.metadata?.collection;
    const collections = Array.isArray(raw) ? raw : String(raw || '').split(',');
    return collections.map((collection) => String(collection).trim().toLowerCase()).filter(Boolean).slice(0, 40).map((collection) => env.DB.prepare(`INSERT INTO catalog_collections (item_id, collection_id, collection_label, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(item_id, collection_id) DO UPDATE SET collection_label=excluded.collection_label, last_seen_at=excluded.last_seen_at`).bind(item.id, collection, collection, timestamp, timestamp));
  });
  await env.DB.batch([...catalogStatements, ...collectionStatements]);
}

function snapshotKey(shelfId, source, query, page, newspaperMonthDay) {
  return [shelfId || 'query', source || 'archive', page, newspaperMonthDay || '', query].join('|').slice(0, 900);
}

async function persistSnapshot(env, { shelfId, source, query, page, newspaperMonthDay, items, total, status = 'ok', error = '' }) {
  if (!env.DB || !shelfId) return;
  await env.DB.prepare(`INSERT INTO shelf_snapshots (snapshot_key, shelf_id, source, page, query, newspaper_month_day, total, items_json, status, error, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(snapshot_key) DO UPDATE SET total=excluded.total, items_json=excluded.items_json, status=excluded.status, error=excluded.error, fetched_at=excluded.fetched_at`).bind(snapshotKey(shelfId, source, query, page, newspaperMonthDay), shelfId, source || 'archive', page, query, newspaperMonthDay || null, Number(total) || 0, JSON.stringify(items || []), status, error || null, new Date().toISOString()).run();
}

async function persistSourceHealth(env, source, detail) {
  if (!env.DB || !source) return;
  await env.DB.prepare(`INSERT INTO source_health (source, status, total, item_count, error, checked_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(source) DO UPDATE SET status=excluded.status, total=excluded.total, item_count=excluded.item_count, error=excluded.error, checked_at=excluded.checked_at`).bind(source, detail.status || 'unknown', Number(detail.total) || 0, Number(detail.count) || 0, detail.error || (detail.errors || []).join('; ') || null, new Date().toISOString()).run();
}

async function persistShelfAudit(env, { shelfId, source, page, items, total, status }) {
  if (!env.DB || !shelfId) return;
  const audit = measureShelf(items, total, status);
  const measuredAt = new Date().toISOString();
  const auditKey = `${shelfId}|${source || 'archive'}|${page}`.slice(0, 240);
  await env.DB.prepare(`INSERT INTO shelf_audits (audit_key, shelf_id, source, page, population, sample_count, readable_count, cover_count, duplicate_count, readable_rate, cover_rate, status, measured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(audit_key) DO UPDATE SET population=excluded.population, sample_count=excluded.sample_count, readable_count=excluded.readable_count, cover_count=excluded.cover_count, duplicate_count=excluded.duplicate_count, readable_rate=excluded.readable_rate, cover_rate=excluded.cover_rate, status=excluded.status, measured_at=excluded.measured_at`).bind(auditKey, shelfId, source || 'archive', page, audit.population, audit.sampleCount, audit.readableCount, audit.coverCount, audit.duplicateCount, audit.readableRate, audit.coverRate, audit.status, measuredAt).run();
}

async function stored(env, query, genre, page, source, newspaperMonthDay) {
  if (!env.DB) return { items: [], total: 0 };
  const fieldedQuery = /(?:\b(?:collection|title|subject|identifier|mediatype|date|language|year):|[()])/i.test(String(query || ''));
  const tokens = collectionTokens(query);
  // A Lucene shelf expression is not a title search. Do not feed the full
  // expression into SQLite LIKE (it can exceed SQLite's pattern complexity
  // limit), and do not return an unfiltered snapshot for unsupported fields.
  if (fieldedQuery && !tokens.length) return { items: [], total: 0 };
  const textQuery = fieldedQuery ? '' : query;
  const like = `%${textQuery}%`; const offset = (page - 1) * 30; const sourceName = SOURCE_NAMES[source] || source || '';
  const sourceClause = source ? ' AND (lower(source) = lower(?) OR lower(source) = lower(?))' : " AND lower(source) NOT IN ('gcd', 'grand comics database')";
  const dateClause = source === 'archive' && /^\d{2}-\d{2}$/.test(String(newspaperMonthDay || '')) ? ' AND issue_month_day = ?' : '';
  const collectionClauseParts = tokens.map(() => 'EXISTS (SELECT 1 FROM catalog_collections cc WHERE cc.item_id = catalog_items.id AND cc.collection_id = ?)');
  const collectionClause = collectionClauseParts.length ? ` AND (${collectionClauseParts.join(' OR ')})` : '';
  const collectionValues = tokens;
  const dateValues = dateClause ? [newspaperMonthDay] : [];
  const baseValues = source ? [textQuery, like, like, like, genre, genre, ...collectionValues, ...dateValues, source, sourceName] : [textQuery, like, like, like, genre, genre, ...collectionValues, ...dateValues];
  const values = [...baseValues, offset];
  const countValues = baseValues;
  const readableClause = ' AND readable = 1';
  const where = ` WHERE (? = '' OR title LIKE ? OR creator LIKE ? OR description LIKE ?) AND (? = '' OR lower(genre) = lower(?))${readableClause}${collectionClause}${dateClause}${sourceClause}`;
  const select = `SELECT id, source, title, creator, year, issue_month_day, genre, description, cover_url, source_url, reader_url, page_count, metadata_json, last_seen_at, access, readable, reader_kind, cover_quality, availability_json, rights FROM catalog_items`;
  const result = await env.DB.prepare(`${select}${where} ORDER BY cover_quality DESC, last_seen_at DESC LIMIT 30 OFFSET ?`).bind(...values).all();
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM catalog_items${where}`).bind(...countValues).first();
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
  const total = responses.reduce((sum, result) => sum + (result.status === 'fulfilled' ? Number(result.value?.total) || 0 : 0), 0);
  return { items, responses, total };
}

export async function handleCatalogSearch(request, env, ctx, requestId) {
  const url = new URL(request.url); const query = clean(url.searchParams.get('q'), 1800); const genre = clean(url.searchParams.get('genre'), 80); const source = clean(url.searchParams.get('source'), 30).toLowerCase(); const shelfId = clean(url.searchParams.get('shelf'), 80); const page = Math.max(1, Math.min(100, Number(url.searchParams.get('page')) || 1)); const newspaperMonthDay = clean(url.searchParams.get('newspaper_month_day'), 5);
  if (newspaperMonthDay && !/^\d{2}-\d{2}$/.test(newspaperMonthDay)) return errorJson(request, env, 'invalid_newspaper_month_day', 400, requestId);
  if (source && !sourceAdapter(source)) return errorJson(request, env, 'invalid_source', 400, requestId);
  // Ignore the client's minute cache-buster so the Worker cache can absorb
  // repeated shelf loads. CORS is applied after the cache lookup, allowing a
  // successful smoke-test or another allowed origin to warm the same public
  // catalog response for the Pages app during an upstream outage.
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.searchParams.delete('_');
  // Bump this when the cache response contract or shelf taxonomy changes so
  // an older degraded edge response cannot survive a deployment.
  cacheKeyUrl.searchParams.set('__cache_version', 'taxonomy-v1');
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cacheResponseForRequest(cached, request, env);

  // Return the last known-good shelf immediately. Provider refreshes happen
  // after the response so a 429, timeout, or provider error cannot blank it.
  let firstStored = { items: [], total: 0 };
  try { firstStored = await stored(env, query, genre, page, source, newspaperMonthDay); }
  catch (error) { console.error(JSON.stringify({ message: 'catalog_stored_read_failed', requestId, error: error instanceof Error ? error.message : String(error) })); }
  // Child-collection Archive shelves are precise live feeds. Prefer the
  // live total for them; otherwise a small first-generation D1 snapshot can
  // hide tens of thousands of matching issues. The live branch below still
  // merges this snapshot if Archive is unavailable.
  const preferLiveArchiveTaxonomy = source === 'archive' && collectionTokens(query).length > 0;
  if (firstStored.items.length && !preferLiveArchiveTaxonomy) {
    const staleResponse = json(request, env, {
      items: firstStored.items.map(publicItem), total: firstStored.total, totalIsEstimate: true, page, pageSize: 30,
      sources: { [source || 'archive']: 'stale' },
      sourceDetails: sourceDetailsFor(source, firstStored.items, firstStored.total, 'degraded', 'serving_cached_snapshot'),
      stale: true, partial: true, refresh: 'background'
    }, { requestId, cacheControl: 'public, max-age=20, stale-while-revalidate=300' });
    ctx.waitUntil(refreshLiveSnapshot(env, query, genre, page, source, newspaperMonthDay).then(async (refresh) => {
      const details = Object.fromEntries((refresh.responses || []).map((result, index) => [source || configuredSourceIds()[index], result.status === 'fulfilled' ? { status: result.value?.partial ? 'degraded' : 'ok', total: result.value?.total, count: result.value?.items?.length } : { status: 'unavailable', error: sourceFailure(result.reason).code }]));
      await Promise.all(Object.entries(details).map(([id, detail]) => persistSourceHealth(env, id, detail).catch(() => {})));
      if (shelfId && refresh.items?.length) await persistSnapshot(env, { shelfId, source, query, page, newspaperMonthDay, items: refresh.items, total: refresh.total, status: 'ok' });
    }).catch((error) => {
      console.error(JSON.stringify({ message: 'catalog_background_refresh_failed', requestId, error: error instanceof Error ? error.message : String(error) }));
    }));
    ctx.waitUntil(persistShelfAudit(env, { shelfId, source, page, items: firstStored.items, total: firstStored.total, status: 'degraded' }).catch(() => {}));
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
    storedFallback = await stored(env, query, genre, page, source, newspaperMonthDay);
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
  ctx.waitUntil(Promise.all(Object.entries(sourceDetails).map(([id, detail]) => persistSourceHealth(env, id, detail).catch(() => {}))));
  if (shelfId) ctx.waitUntil(persistShelfAudit(env, { shelfId, source, page, items, total, status: stale ? 'degraded' : (items.length ? 'ok' : 'unavailable') }).catch(() => {}));
  if (shelfId && items.length) ctx.waitUntil(persistSnapshot(env, { shelfId, source, query, page, newspaperMonthDay, items, total, status: stale ? 'degraded' : 'ok' }).catch(() => {}));
  if (cache && !failed && !stale) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => {
      console.error(JSON.stringify({ message: 'catalog_cache_put_failed', requestId, error: error instanceof Error ? error.message : String(error) }));
    }));
  }
  return response;
}
