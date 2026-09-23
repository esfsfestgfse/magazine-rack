import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADULT_SHELF_IDS, SHELVES } from '../apps/web/src/shelf-catalog.js';
import { configuredSourceIds } from '../apps/api/src/sources/registry.js';
import { measureShelf, passesPrimaryShelfAudit } from '../apps/api/src/audit.js';

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
  'apps/api/src/sources/europeana.js',
  'apps/api/wrangler.jsonc',
  'apps/api/migrations/0001_initial.sql',
  'apps/api/migrations/0002_catalog_access.sql',
  'apps/api/migrations/0003_taxonomy_snapshots.sql',
  'apps/api/migrations/0004_issue_date_index.sql',
  'apps/api/migrations/0005_shelf_audits.sql',
  'apps/api/src/audit.js',
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
if (SHELVES.length !== 52 || !['manga', 'trains', 'batman', 'spiderman', 'superman', 'xmen', 'archie'].every((id) => SHELVES.some((shelf) => shelf.id === id))) throw new Error(`Shelf parity check failed: expected 52 shelves with Manga, Trains, and character racks, found ${SHELVES.length}`);
if (SHELVES.some((shelf) => ['gcd-series', 'ol-subjects', 'gbooks-comics', 'gbooks-mags', 'dpla-periodicals', 'loc-search-comics', 'loc-photos'].includes(shelf.id))) throw new Error('Shelf parity check failed: catalog-only or image-only racks are still exposed');
if (!configuredSourceIds().includes('comicbookplus') || configuredSourceIds().includes('dpla')) throw new Error('Source registry check failed: Comic Book Plus must be active and DPLA must be removed');
const qualityFixtures = [
  { id: 'ok-1', title: 'Railway Age Magazine', readable: true, access: 'full', coverUrl: 'https://example.test/cover.jpg' },
  { id: 'ok-2', title: 'Railway Age Magazine 2', readable: true, access: 'borrow', coverUrl: 'https://example.test/cover-2.jpg' },
];
const qualityAudit = measureShelf(qualityFixtures, 120, 'ok');
if (!passesPrimaryShelfAudit(qualityAudit) || qualityAudit.population !== 120 || qualityAudit.readableRate !== 1 || qualityAudit.coverRate !== 1) throw new Error('Shelf audit regression check failed: healthy fixture did not pass');
const weakAudit = measureShelf([{ id: 'weak', title: 'Catalog only', access: 'catalog' }], 1, 'unavailable');
if (passesPrimaryShelfAudit(weakAudit)) throw new Error('Shelf audit regression check failed: weak fixture passed');
if (ADULT_SHELF_IDS.length !== 2 || SHELVES.at(-2)?.id !== 'adult-mags' || SHELVES.at(-1)?.id !== 'adult-comics') {
  throw new Error('Shelf parity check failed: restricted shelves are not last');
}
const liveSources = readFileSync(join(root, 'apps/web/src/live-sources.js'), 'utf8');
if (!liveSources.includes(".replace(/\\+/g, ' ')") || !liveSources.includes('shelf.newspaperDateMode === \'month-day\'')) {
  throw new Error('Live source checks failed: IA sort encoding or calendar-day filtering is missing');
}
const entrypoint = readFileSync(join(root, 'apps/web/index.html'), 'utf8');
const frontend = ['apps/web/src/main.js', 'apps/web/src/live-sources.js', 'apps/web/src/shelf-catalog.js', 'apps/web/src/styles.css']
  .map((file) => readFileSync(join(root, file), 'utf8')).join('\n');
if (!entrypoint.includes('type="module"') || !entrypoint.includes('./src/main.js') || !entrypoint.includes('./src/styles.css')) {
  throw new Error('Frontend architecture check failed: modular entrypoint is incomplete');
}
if (!frontend.includes('fetchShelfPage') || !frontend.includes("id: 'manga'") || !frontend.includes('MANGA_EXCLUDE')) {
  throw new Error('Frontend checks failed: connected source bridge or Manga routing is missing');
}
if (frontend.includes("id: 'chronam-funnies'") || frontend.includes('ChronAm Funnies')) {
  throw new Error('Frontend checks failed: the removed ChronAm Funnies rack is still exposed');
}
if (!frontend.includes('reader-reload') || !frontend.includes('refresh-rack') || !frontend.includes('MAX_ACTIVE_LOADS')) {
  throw new Error('Frontend checks failed: reader controls or resilient shelf loading are missing');
}
if (!frontend.includes('@media (max-width') || !frontend.includes('reader-related') || !frontend.includes('overscroll-behavior-x: contain')) {
  throw new Error('Frontend checks failed: mobile reader or issue navigation safeguards are missing');
}
if (!frontend.includes('cover-fallback') || !frontend.includes('isReadable') || !frontend.includes('secondary-rack')) {
  throw new Error('Frontend checks failed: cover fallback, readability, or secondary-source labeling is missing');
}
for (const marker of ['"peace news"', '"identity theft"', 'jointly administered', 'subject:"graphic novels"', 'world trade center', 'porkovich']) {
  if (!frontend.includes(marker)) throw new Error(`Shelf quality check failed: missing noise guard ${marker}`);
}
if (!/<script[^>]+type=["']module["'][^>]+src=["']\.\/src\/main\.js["']/i.test(entrypoint) || !entrypoint.includes('<script src="./config.js"></script>') || !/register\('\.\/sw\.js(?:\?[^']+)?'\)/.test(entrypoint)) {
  throw new Error('Frontend checks failed: the Pages modular entrypoint or hosted shell worker is not canonical');
}
const comicBookPlusSnapshot = JSON.parse(readFileSync(join(root, 'apps/web/data/comicbookplus.json'), 'utf8'));
if (comicBookPlusSnapshot.source !== 'comicbookplus' || comicBookPlusSnapshot.items.length <= 50 || comicBookPlusSnapshot.items.some((item) => !item.sourceId || !item.cover || !item.viewerBase)) {
  throw new Error('Comic Book Plus snapshot check failed: expected more than 50 readable, covered issues');
}
console.log('Shelf parity check passed (52 readable shelves including Manga, Trains, and four character racks; restricted shelves last).');
