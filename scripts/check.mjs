import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADULT_SHELF_IDS, SHELVES } from '../apps/web/src/shelf-catalog.js';
import { configuredSourceIds } from '../apps/api/src/sources/registry.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const required = [
  'README.md',
  'apps/web/index.html',
  'apps/web/config.js',
  'apps/web/manifest.json',
  'apps/web/sw.js',
  'apps/web/src/main.js',
  'apps/web/src/api.js',
  'apps/web/src/data.js',
  'apps/web/src/store.js',
  'apps/web/src/shelf-catalog.js',
  'apps/web/src/live-sources.js',
  'apps/web/src/styles.css',
  'apps/web/data/comicbookplus.json',
  'apps/api/src/index.js',
  'apps/api/src/http.js',
  'apps/api/src/library.js',
  'apps/api/src/routes/catalog.js',
  'apps/api/src/routes/items.js',
  'apps/api/src/routes/media.js',
  'apps/api/src/sources/registry.js',
  'apps/api/src/sources/comicbookplus.js',
  'apps/api/src/sources/gcd.js',
  'apps/api/src/sources/dpla.js',
  'apps/api/src/sources/europeana.js',
  'apps/api/wrangler.jsonc',
  'apps/api/migrations/0001_initial.sql',
  'apps/api/migrations/0002_catalog_access.sql',
  '.github/workflows/ci.yml',
  '.github/workflows/pages.yml',
  '.github/workflows/worker-deploy.yml',
];
const missing = required.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  console.error('Missing required files:\n' + missing.map((file) => `- ${file}`).join('\n'));
  process.exit(1);
}

for (const file of ['apps/web/index.html', 'apps/web/src/main.js', 'apps/api/src/index.js']) {
  const content = readFileSync(join(root, file), 'utf8');
  if (!content.trim()) throw new Error(`${file} is empty`);
}

console.log(`Magazine Rack checks passed (${required.length} required files present).`);
if (SHELVES.length !== 46 || !SHELVES.some((shelf) => shelf.id === 'manga')) throw new Error(`Shelf parity check failed: expected 46 shelves with a Manga rack, found ${SHELVES.length}`);
if (SHELVES.some((shelf) => ['gcd-series', 'ol-subjects', 'gbooks-comics', 'gbooks-mags', 'dpla-periodicals', 'loc-search-comics', 'loc-photos'].includes(shelf.id))) throw new Error('Shelf parity check failed: catalog-only or image-only racks are still exposed');
if (!configuredSourceIds().includes('comicbookplus') || configuredSourceIds().includes('dpla')) throw new Error('Source registry check failed: Comic Book Plus must be active and DPLA must be removed');
if (ADULT_SHELF_IDS.length !== 2 || SHELVES.at(-2)?.id !== 'adult-mags' || SHELVES.at(-1)?.id !== 'adult-comics') {
  throw new Error('Shelf parity check failed: restricted shelves are not last');
}
const liveSources = readFileSync(join(root, 'apps/web/src/live-sources.js'), 'utf8');
if (!liveSources.includes(".replace(/\\+/g, ' ')") || !liveSources.includes('shelf.newspaperDateMode === \'month-day\'')) {
  throw new Error('Live source checks failed: IA sort encoding or calendar-day filtering is missing');
}
const standalone = readFileSync(join(root, 'apps/web/index.html'), 'utf8');
if (!standalone.includes('fetchConnectedShelfPage') || !standalone.includes('PUBLIC_CATALOG_API') || !standalone.includes("id: 'manga'") || !standalone.includes('MANGA_EXCLUDE') || !standalone.includes('ACCESS_LEVELS')) {
  throw new Error('Standalone checks failed: connected source bridge or Manga routing is missing');
}
if (standalone.includes("id: 'chronam-funnies'") || standalone.includes('ChronAm Funnies')) {
  throw new Error('Standalone checks failed: the removed ChronAm Funnies rack is still exposed');
}
if (!standalone.includes('waitForMessage') || !standalone.includes('shelf-retry') || !standalone.includes('FEED_TIMEOUT_MS') || !standalone.includes('probeArchiveReader')) {
  throw new Error('Standalone checks failed: bounded feed loading or reader readiness handshakes are missing');
}
if (!standalone.includes('page-slider') || !standalone.includes('touchstart') || !standalone.includes('issueQueueFor') || !standalone.includes('queueIsSeries') || !standalone.includes('reader-nav-kind') || !standalone.includes('font-size:1.15rem')) {
  throw new Error('Standalone checks failed: page scrubbing, touch navigation, issue navigation, reader navigation labeling, or mobile reader arrows are missing');
}
if (/<script[^>]+type=["']module["'][^>]+src=["']\.\/src\/main\.js["']/i.test(standalone) || !standalone.includes('<script src="config.js"></script>') || !/register\('\.\/sw\.js(?:\?[^']+)?'\)/.test(standalone)) {
  throw new Error('Standalone checks failed: the Pages release entrypoint or hosted shell worker is not canonical');
}
const comicBookPlusSnapshot = JSON.parse(readFileSync(join(root, 'apps/web/data/comicbookplus.json'), 'utf8'));
if (comicBookPlusSnapshot.source !== 'comicbookplus' || comicBookPlusSnapshot.items.length <= 50 || comicBookPlusSnapshot.items.some((item) => !item.sourceId || !item.cover || !item.viewerBase)) {
  throw new Error('Comic Book Plus snapshot check failed: expected more than 50 readable, covered issues');
}
console.log('Shelf parity check passed (46 readable shelves including Manga; restricted shelves last).');
