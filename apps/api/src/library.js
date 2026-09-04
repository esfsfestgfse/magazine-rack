import { errorJson, isValidAnonymousKey, isValidCatalogId, json } from './http.js';
import { publicItem } from './routes/items.js';

function keyFor(request) { return request.headers.get('X-Library-Key') || request.headers.get('X-Anonymous-Library-Key') || ''; }
function requireKey(request, env, requestId) { const key = keyFor(request); return isValidAnonymousKey(key) ? key : errorJson(request, env, 'library_key_required', 401, requestId); }
function publicLibraryItem(row) {
  let metadata = {};
  try { metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {}; } catch { metadata = {}; }
  return { ...publicItem({ id: row.item_id, ...row, sourceName: row.source, coverUrl: row.cover_url, sourceUrl: row.source_url, readerUrl: row.reader_url, pageCount: row.page_count, lastSeenAt: row.last_seen_at, readable: Boolean(row.readable), readerKind: row.reader_kind || 'none', coverQuality: Number(row.cover_quality) || 0, rights: row.rights || '', metadata }), note: row.note || '', savedAt: row.saved_at };
}

export async function handleLibrary(request, env, url, requestId) {
  const maybeKey = requireKey(request, env, requestId); if (maybeKey instanceof Response) return maybeKey;
  if (request.method === 'GET') {
    if (!env.DB) return json(request, env, { items: [], configured: false }, { requestId });
    const rows = await env.DB.prepare('SELECT l.item_id, l.note, l.saved_at, c.source, c.title, c.creator, c.year, c.genre, c.description, c.cover_url, c.source_url, c.reader_url, c.page_count, c.metadata_json, c.last_seen_at, c.access, c.readable, c.reader_kind, c.cover_quality, c.availability_json, c.rights FROM library_entries l LEFT JOIN catalog_items c ON c.id = l.item_id WHERE l.library_key = ? ORDER BY l.saved_at DESC LIMIT 500').bind(maybeKey).all();
    return json(request, env, { items: (rows.results || []).map(publicLibraryItem), configured: true }, { requestId, cacheControl: 'private, max-age=30' });
  }
  if (!['PUT', 'DELETE'].includes(request.method)) return json(request, env, { error: 'method_not_allowed', requestId }, { status: 405, requestId, headers: { Allow: 'GET, PUT, DELETE, OPTIONS' } });
  if (!env.DB) return errorJson(request, env, 'library_unavailable', 503, requestId);
  let id;
  try { id = decodeURIComponent(url.pathname.split('/').at(-1) || ''); } catch { return errorJson(request, env, 'invalid_id', 400, requestId); }
  if (!isValidCatalogId(id)) return errorJson(request, env, 'invalid_id', 400, requestId);
  if (request.method === 'DELETE') { await env.DB.prepare('DELETE FROM library_entries WHERE library_key = ? AND item_id = ?').bind(maybeKey, id).run(); return json(request, env, { saved: false, id }, { requestId }); }
  if (request.method === 'PUT') {
    const item = await env.DB.prepare('SELECT id FROM catalog_items WHERE id = ?').bind(id).first();
    if (!item) return errorJson(request, env, 'not_found', 404, requestId);
    const body = await request.json().catch(() => ({}));
    if (body.saved === false) { await env.DB.prepare('DELETE FROM library_entries WHERE library_key = ? AND item_id = ?').bind(maybeKey, id).run(); return json(request, env, { saved: false, id }, { requestId }); }
    const note = String(body.note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300);
    await env.DB.prepare('INSERT INTO library_entries (library_key, item_id, note, saved_at) VALUES (?, ?, ?, ?) ON CONFLICT(library_key, item_id) DO UPDATE SET note=excluded.note, saved_at=excluded.saved_at').bind(maybeKey, id, note, new Date().toISOString()).run();
    return json(request, env, { saved: true, id }, { requestId });
  }
}
