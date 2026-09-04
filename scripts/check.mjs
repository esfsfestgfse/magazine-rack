import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADULT_SHELF_IDS, SHELVES } from '../apps/web/src/shelf-catalog.js';

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
  'apps/api/src/index.js',
  'apps/api/src/http.js',
  'apps/api/src/library.js',
  'apps/api/src/routes/catalog.js',
  'apps/api/src/routes/items.js',
  'apps/api/src/sources/registry.js',
  'apps/api/src/sources/gcd.js',
  'apps/api/src/sources/dpla.js',
  'apps/api/src/sources/europeana.js',
  'apps/api/wrangler.jsonc',
  'apps/api/migrations/0001_initial.sql',
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
if (SHELVES.length !== 57) throw new Error(`Shelf parity check failed: expected 57 shelves, found ${SHELVES.length}`);
if (ADULT_SHELF_IDS.length !== 2 || SHELVES.at(-2)?.id !== 'adult-mags' || SHELVES.at(-1)?.id !== 'adult-comics') {
  throw new Error('Shelf parity check failed: restricted shelves are not last');
}
const liveSources = readFileSync(join(root, 'apps/web/src/live-sources.js'), 'utf8');
if (!liveSources.includes(".replace(/\\+/g, ' ')") || !liveSources.includes('shelf.newspaperDateMode === \'month-day\'')) {
  throw new Error('Live source checks failed: IA sort encoding or calendar-day filtering is missing');
}
const standalone = readFileSync(join(root, 'apps/web/index.html'), 'utf8');
if (!standalone.includes('fetchConnectedShelfPage') || !standalone.includes('PUBLIC_CATALOG_API')) {
  throw new Error('Standalone checks failed: connected source bridge is missing');
}
console.log('Shelf parity check passed (57 live shelves; restricted shelves last).');
