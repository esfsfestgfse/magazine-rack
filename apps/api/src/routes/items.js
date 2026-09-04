import { errorJson, json } from '../http.js';
import { isValidCatalogId } from '../http.js';

export function publicItem(item) {
  return { id: item.id, title: item.title, creator: item.creator || '', year: item.year || '', genre: item.genre || 'Periodicals', source: item.source || '', sourceName: item.sourceName || item.source || '', description: item.description || '', cover: item.coverUrl || item.cover || '', sourceUrl: item.sourceUrl, readerUrl: item.readerUrl || item.sourceUrl, pages: Number(item.pageCount ?? item.pages) || 0, access: item.access || 'catalog', readable: item.readable === true, readerKind: item.readerKind || 'none', coverQuality: Number(item.coverQuality) || 0, availability: item.availability && typeof item.availability === 'object' ? item.availability : {}, rights: item.rights || '', freshness: item.lastSeenAt || item.observedAt || null, metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {} };
}

function rowItem(row) {
  let metadata = {};
  try { metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {}; } catch { metadata = {}; }
  let availability = {};
  try { availability = row.availability_json ? JSON.parse(row.availability_json) : {}; } catch { availability = {}; }
  return { ...row, sourceName: row.source, coverUrl: row.cover_url, sourceUrl: row.source_url, readerUrl: row.reader_url, pageCount: row.page_count, lastSeenAt: row.last_seen_at, availability, readable: Boolean(row.readable), readerKind: row.reader_kind || 'none', coverQuality: Number(row.cover_quality) || 0, rights: row.rights || '', metadata };
}

export async function handleCatalogItem(request, env, _ctx, id, requestId) {
  if (!isValidCatalogId(id)) return errorJson(request, env, 'invalid_id', 400, requestId);
  if (!env.DB) return errorJson(request, env, 'database_not_configured', 503, requestId);
  const result = await env.DB.prepare('SELECT id, source, title, creator, year, genre, description, cover_url, source_url, reader_url, page_count, metadata_json, last_seen_at, access, readable, reader_kind, cover_quality, availability_json, rights FROM catalog_items WHERE id = ?').bind(id).first();
  if (!result) return errorJson(request, env, 'not_found', 404, requestId);
  return json(request, env, { item: publicItem(rowItem(result)) }, { requestId, cacheControl: 'public, max-age=300, stale-while-revalidate=1800' });
}
