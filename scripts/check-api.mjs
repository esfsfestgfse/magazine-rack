import assert from 'node:assert/strict';
import worker from '../apps/api/src/index.js';
import { rateLimit, rateLimitScope } from '../apps/api/src/rate-limit.js';
import { sourceItem } from '../apps/api/src/sources/common.js';
import { parseSeriesBooks } from '../apps/api/src/sources/comicbookplus.js';
import { fetchOpenLibrary } from '../apps/api/src/sources/openlibrary.js';

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
assert.deepEqual(rateLimitScope('/api/media', 'GET'), ['media-proxy', 180]);
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

const seriesRows = parseSeriesBooks('<tr itemprop="hasPart"><meta itemprop="discussionUrl" content="https://comicbookplus.com/?dlid=77"><meta itemprop="thumbnailUrl" content="https://box01.comicbookplus.com/viewer/aabb/mediumthumb.jpg"><a itemprop="name">Demo Series 1</a><time itemprop="datePublished" datetime="1950-01"></time><td itemprop="numberOfPages">12</td><meta itemprop="contributor" content="Demo Artist"></tr>', 'series-1');
assert.equal(seriesRows.length, 1);
assert.equal(seriesRows[0].sourceId, '77');
assert.equal(seriesRows[0].metadata.viewerBase, 'https://box01.comicbookplus.com/viewer/aa/aabb');

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
  if (target.includes('openlibrary.org/search.json')) return new Response(JSON.stringify({ numFound: 2, docs: [{ key: '/works/OL1W', title: 'Open Demo', author_name: ['Writer'], first_publish_year: 1922, cover_i: 123, ia: ['open-demo'], number_of_pages_median: 100 }, { key: '/works/OL2W', title: 'Borrowable Demo', author_name: ['Reader'], first_publish_year: 1923, cover_i: 124, number_of_pages_median: 80 }] }), { headers: { 'Content-Type': 'application/json' } });
  if (target.includes('www.comics.org/api/series/name/')) return new Response(JSON.stringify({ count: 1, results: [{ id: 77, name: 'Demo Comics', publisher: 'Demo Press', year_began: 1940 }] }), { headers: { 'Content-Type': 'application/json' } });
  if (target.includes('api.dp.la/v2/items')) return new Response(JSON.stringify({ count: 1, docs: [{ id: 'demo-dpla', object: 'https://images.dp.la/demo.jpg', isShownAt: 'https://dp.la/item/demo-dpla', sourceResource: { title: ['Demo Periodical'], creator: ['Demo Publisher'], date: '1942', type: ['Magazine'] } }] }), { headers: { 'Content-Type': 'application/json' } });
  if (target.includes('comicbookplus.com/?cbplus=latestuploads_l_s_0')) return new Response('<div itemscope itemtype="https://schema.org/Book"><meta itemprop="discussionUrl" content="https://comicbookplus.com/?dlid=77"><meta itemprop="thumbnailUrl" content="https://comicbookplus.com/viewer/aa/aabb/mediumthumb.jpg"><meta itemprop="url" content="https://comicbookplus.com/?dlid=77"><meta itemprop="genre" content="Comic Book"><meta itemprop="contributor" content="Demo Artist"><a itemprop="name">Demo Comic</a><meta itemprop="numberOfPages" content="12"><time itemprop="dateModified" datetime="1950-01-01">Jan 1, 1950</time></div>', { headers: { 'Content-Type': 'text/html' } });
  if (target.includes('comicbookplus.com/viewer/aa/aabb/0.jpg')) return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'Content-Type': 'image/jpeg' } });
  if (target.includes('api.europeana.eu/record/v2/search.json')) return new Response(JSON.stringify({ totalResults: 1, items: [{ id: '/demo/europeana', title: ['Demo Europeana'], dcCreator: ['Demo Publisher'], year: ['1943'], edmPreview: ['https://www.europeana.eu/demo.jpg'], guid: 'https://www.europeana.eu/en/item/demo/europeana' }] }), { headers: { 'Content-Type': 'application/json' } });
  throw new Error(`unexpected test fetch: ${target}`);
};

try {
  const openLibrary = await fetchOpenLibrary({ query: 'demo', page: 1 }, env);
  assert.equal(openLibrary.items.length, 2);
  assert.equal(openLibrary.items[0].metadata.iaId, 'open-demo');
  assert.equal(openLibrary.items[1].readerUrl, 'https://openlibrary.org/works/OL2W');

  const waits = [];
  const dbEnv = { ...env, DB: mockDb };
  const dbContext = { waitUntil(promise) { waits.push(promise); } };
  const catalog = await worker.fetch(new Request('https://api.example/api/catalog?q=demo'), dbEnv, dbContext);
  assert.equal(catalog.status, 200);
  const catalogBody = await catalog.json();
  assert.equal(catalogBody.items.length, 6);
  assert.ok(catalogBody.items.some((item) => item.source === 'comicbookplus' && item.readerUrl === 'https://comicbookplus.com/?dlid=77'));
  assert.ok(catalogBody.items.some((item) => item.source === 'openlibrary' && item.readerUrl === 'https://openlibrary.org/works/OL2W'));
  assert.equal(catalogBody.stale, false);
  await Promise.all(waits);

  const mediaUrl = 'https://api.example/api/media?source=comicbookplus&url=' + encodeURIComponent('https://comicbookplus.com/viewer/aa/aabb/0.jpg');
  const media = await worker.fetch(new Request(mediaUrl, { headers: { Origin: 'https://reader.example' } }), dbEnv, dbContext);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('Content-Type'), 'image/jpeg');
  assert.equal((await media.arrayBuffer()).byteLength, 4);

  const badMedia = await worker.fetch(new Request('https://api.example/api/media?source=comicbookplus&url=' + encodeURIComponent('https://evil.example/a.jpg')), dbEnv, dbContext);
  assert.equal(badMedia.status, 400);

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
