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
if (SHELVES.length !== 52) throw new Error(`Shelf parity check failed: expected 52 shelves, found ${SHELVES.length}`);
if (ADULT_SHELF_IDS.length !== 2 || SHELVES.at(-2)?.id !== 'adult-mags' || SHELVES.at(-1)?.id !== 'adult-comics') {
  throw new Error('Shelf parity check failed: restricted shelves are not last');
}
console.log('Shelf parity check passed (52 live shelves; restricted shelves last).');
const standalone = readFileSync(join(root, 'apps/web/index.html'), 'utf8');
if (!standalone.includes('<script src="config.js"></script>') || !standalone.includes("id: 'manga'")) {
  throw new Error('Standalone checks failed: canonical runtime configuration or Manga routing is missing');
}
if (!standalone.includes('startBackgroundShelfPump') || !standalone.includes('backgroundShelfToken') || !standalone.includes('preserveCachedRack')) {
  throw new Error('Standalone checks failed: serialized stale-safe shelf loading is missing');
}
if (!standalone.includes('isAdultMagazineFalsePositive')) {
  throw new Error('Standalone checks failed: adult shelf quality filtering is missing');
}
const serviceWorker = readFileSync(join(root, 'apps/web/sw.js'), 'utf8');
if (!serviceWorker.includes('magazine-rack-shell-v10')) throw new Error('Service worker cache version was not bumped');
console.log('Release gate checks passed (canonical root, serialized loading, and source quality guards).');
