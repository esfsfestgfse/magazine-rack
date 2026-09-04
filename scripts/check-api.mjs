import assert from 'node:assert/strict';
import worker from '../apps/api/src/index.js';
import { rateLimit, rateLimitScope } from '../apps/api/src/rate-limit.js';
import { sourceItem } from '../apps/api/src/sources/common.js';

const env = { ENVIRONMENT: 'production', ALLOWED_ORIGIN: 'https://reader.example', DPLA_API_KEY: 'test-dpla-key' };
const context = { waitUntil() {} };

const health = await worker.fetch(new Request('https://api.example/health'), env, context);
assert.equal(health.status, 200);
assert.equal((await health.json()).ok, true);

const disallowed = await worker.fetch(new Request('https://api.example/health', { headers: { Origin: 'https://evil.example' } }), env, context);
assert.equal(disallowed.headers.get('Access-Control-Allow-Origin'), null);

const allowed = await worker.fetch(new Request('https://api.example/health', { headers: { Origin: 'https://reader.example' } }), env, context);
assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://reader.example');

const malformedId = await worker.fetch(new Request('https://api.example/api/catalog/%E0%A4%A'), env, context);
assert.equal(malformedId.status, 400);

const invalidSource = await worker.fetch(new Request('https://api.example/api/catalog?source=unknown'), env, context);
assert.equal(invalidSource.status, 400);

const scope = rateLimitScope('/api/catalog', 'GET');
assert.deepEqual(scope, ['catalog-search', 30]);
const request = new Request('https://api.example/api/catalog', { headers: { 'CF-Connecting-IP': '198.51.100.10' } });
let last;
for (let index = 0; index < 31; index += 1) last = rateLimit(request, scope[0], scope[1], 1_000);
assert.equal(last.limited, true);
assert.ok(last.retryAfter >= 1);

const safe = sourceItem('archive', 'demo-id', {
  title: 'Demo',
  sourceUrl: 'https://archive.org/details/demo-id',
  readerUrl: 'javascript:alert(1)',
  coverUrl: 'https://evil.example/cover.jpg',
  metadata: { description: 'bounded metadata' },
});
assert.equal(safe.sourceUrl, 'https://archive.org/details/demo-id');
assert.equal(safe.readerUrl, safe.sourceUrl);
assert.equal(safe.coverUrl, '');
assert.equal(safe.metadata.description, 'bounded metadata');
assert.ok(safe.observedAt);

const catalogRows = new Map();
const libraryRows = new Map();
const mockDb = {
  prepare(sql) {
    return {
      bind(...args) {
        return {
          sql,
          args,
          async all() {
            if (sql.includes('FROM library_entries')) {
              const key = args[0];
              return { results: [...libraryRows.values()].filter((row) => row.library_key === key).map((row) => ({ item_id: row.item_id, note: row.note, saved_at: row.saved_at, ...catalogRows.get(row.item_id) })) };
            }
            if (sql.includes('FROM catalog_items')) return { results: [...catalogRows.values()] };
            return { results: [] };
          },
          async first() {
            if (sql.includes('SELECT id FROM catalog_items')) return catalogRows.has(args[0]) ? { id: args[0] } : null;
            if (sql.includes('COUNT(*)')) return { total: catalogRows.size };
            return null;
          },
          async run() {
            if (sql.startsWith('DELETE FROM library_entries')) libraryRows.delete(`${args[0]}:${args[1]}`);
            if (sql.startsWith('INSERT INTO library_entries')) libraryRows.set(`${args[0]}:${args[1]}`, { library_key: args[0], item_id: args[1], note: args[2], saved_at: args[3] });
            return { success: true };
          },
        };
      },
    };
  },
  async batch(statements) {
    for (const statement of statements) {
      const [id, source, source_id, title, creator, year, genre, description, cover_url, source_url, reader_url, page_count, metadata_json, first_seen_at, last_seen_at] = statement.args;
      catalogRows.set(id, { id, source, source_id, title, creator, year, genre, description, cover_url, source_url, reader_url, page_count, metadata_json, first_seen_at, last_seen_at });
    }
    return statements.map(() => ({ success: true }));
  },
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.includes('archive.org/advancedsearch.php')) return new Response(JSON.stringify({ response: { numFound: 1, docs: [{ identifier: 'demo-archive', title: 'Demo Journal', creator: 'A. Reader', date: '1920', subject: ['science'], description: 'A public record.', imagecount: 12 }] } }), { headers: { 'Content-Type': 'application/json' } });
  if (target.includes('www.loc.gov/search')) return new Response(JSON.stringify({ pagination: { total: 1 }, results: [{ id: '/item/demo', title: 'Library Record', contributor: 'Library', date: '1921', description: ['A record.'], image_url: ['https://tile.loc.gov/image-services/demo.jpg'] }] }), { headers: { 'Content-Type': 'application/json' } });
  if (target.includes('openlibrary.org/search.json')) return new Response(JSON.stringify({ numFound: 1, docs: [{ key: '/works/OL1W', title: 'Open Demo', author_name: ['Writer'], first_publish_year: 1922, cover_i: 123, ia: ['open-demo'], number_of_pages_median: 100 }] }), { headers: { 'Content-Type': 'application/json' } });
  if (target.includes('www.comics.org/api/series/name/')) return new Response(JSON.stringify({ count: 1, results: [{ id: 77, name: 'Demo Comics', publisher: 'Demo Press', year_began: 1940 }] }), { headers: { 'Content-Type': 'application/json' } });
  if (target.includes('api.dp.la/v2/items')) return new Response(JSON.stringify({ count: 1, docs: [{ id: 'demo-dpla', object: 'https://images.dp.la/demo.jpg', isShownAt: 'https://dp.la/item/demo-dpla', sourceResource: { title: ['Demo Periodical'], creator: ['Demo Publisher'], date: '1942', type: ['Magazine'] } }] }), { headers: { 'Content-Type': 'application/json' } });
  if (target.includes('api.europeana.eu/record/v2/search.json')) return new Response(JSON.stringify({ totalResults: 1, items: [{ id: '/demo/europeana', title: ['Demo Europeana'], dcCreator: ['Demo Publisher'], year: ['1943'], edmPreview: ['https://www.europeana.eu/demo.jpg'], guid: 'https://www.europeana.eu/en/item/demo/europeana' }] }), { headers: { 'Content-Type': 'application/json' } });
  throw new Error(`unexpected test fetch: ${target}`);
};

try {
  const waits = [];
  const dbEnv = { ...env, DB: mockDb };
  const dbContext = { waitUntil(promise) { waits.push(promise); } };
  const catalog = await worker.fetch(new Request('https://api.example/api/catalog?q=demo'), dbEnv, dbContext);
  assert.equal(catalog.status, 200);
  const catalogBody = await catalog.json();
  assert.equal(catalogBody.items.length, 5);
  assert.equal(catalogBody.stale, false);
  await Promise.all(waits);

  const savedId = catalogBody.items[0].id;
  const libraryKey = 'abcdefghijklmnop';
  const save = await worker.fetch(new Request(`https://api.example/api/library/${encodeURIComponent(savedId)}`, { method: 'PUT', headers: { 'X-Library-Key': libraryKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'keep this' }) }), dbEnv, dbContext);
  assert.equal(save.status, 200);
  const library = await worker.fetch(new Request('https://api.example/api/library', { headers: { 'X-Library-Key': libraryKey } }), dbEnv, dbContext);
  assert.equal(library.status, 200);
  const libraryBody = await library.json();
  assert.equal(libraryBody.items[0].id, savedId);
  assert.equal(libraryBody.items[0].title, catalogBody.items[0].title);

  const unknownSave = await worker.fetch(new Request('https://api.example/api/library/archive:missing', { method: 'PUT', headers: { 'X-Library-Key': libraryKey, 'Content-Type': 'application/json' }, body: '{}' }), dbEnv, dbContext);
  assert.equal(unknownSave.status, 404);
  const unavailableSave = await worker.fetch(new Request(`https://api.example/api/library/${encodeURIComponent(savedId)}`, { method: 'PUT', headers: { 'X-Library-Key': libraryKey, 'Content-Type': 'application/json' }, body: '{}' }), env, dbContext);
  assert.equal(unavailableSave.status, 503);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('API checks passed (health, CORS, and rate limiting).');
