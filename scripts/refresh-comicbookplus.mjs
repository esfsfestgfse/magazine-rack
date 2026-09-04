import fs from 'node:fs';
import path from 'node:path';
import { parseSeriesBooks } from '../apps/api/src/sources/comicbookplus.js';

const BASE = 'https://comicbookplus.com';
const ROOT_CID = '1507';
const DEFAULT_OUTPUT = path.resolve('apps/web/data/comicbookplus.json');
const args = new Map(process.argv.slice(2).filter((value) => value.startsWith('--')).map((value) => {
  const [key, ...rest] = value.slice(2).split('=');
  return [key, rest.join('=') || 'true'];
}));
const output = path.resolve(String(args.get('output') || DEFAULT_OUTPUT));
const concurrency = Math.max(1, Math.min(10, Number(args.get('concurrency')) || 6));
const limit = args.has('limit') ? Math.max(1, Number(args.get('limit')) || 1) : Infinity;
const headers = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.8',
  'User-Agent': 'MagazineRackCatalog/1.0 (+https://github.com/esfsfestgfse/magazine-rack)',
};

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function cidsFrom(html) {
  return [...String(html || '').matchAll(/(?:href|itemid)=["'][^"']*\?cid=(\d+)/gi)]
    .map((match) => match[1])
    .filter((value, index, all) => all.indexOf(value) === index);
}

async function fetchHtml(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers, redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > 4_000_000) throw new Error('response_too_large');
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(450 * attempt);
    }
  }
  throw lastError || new Error('unreachable');
}

async function main() {
  const root = await fetchHtml(`${BASE}/?cid=${ROOT_CID}&mr_refresh=1`);
  const cids = cidsFrom(root).slice(0, limit);
  if (!cids.length) throw new Error('Comic Book Plus category index returned no series identifiers');
  console.error(`Comic Book Plus index: ${cids.length} candidate series pages; concurrency ${concurrency}`);

  const records = new Map();
  let completed = 0;
  let failures = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < cids.length) {
      const cid = cids[cursor];
      cursor += 1;
      try {
        const html = await fetchHtml(`${BASE}/?cid=${cid}&mr_refresh=1`);
        for (const item of parseSeriesBooks(html, cid)) {
          if (!records.has(item.sourceId)) records.set(item.sourceId, item);
        }
      } catch (error) {
        failures += 1;
        console.error(`CB+ series ${cid} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      completed += 1;
      if (completed % 50 === 0 || completed === cids.length) {
        console.error(`Comic Book Plus progress: ${completed}/${cids.length} pages · ${records.size} issues · ${failures} failures`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cids.length) }, worker));
  if (records.size < 100 && limit === Infinity) throw new Error(`Catalog refresh returned only ${records.size} issues`);

  const items = [...records.values()]
    .sort((a, b) => Number(b.sourceId) - Number(a.sourceId))
    .map((item) => {
      const viewerBase = item.metadata?.viewerBase || '';
      return {
        sourceId: item.sourceId,
        title: item.title,
        creator: item.creator,
        year: item.year,
        pages: item.pageCount,
        cover: viewerBase ? `${viewerBase}/mediumthumb.jpg` : item.coverUrl,
        sourceUrl: item.sourceUrl,
        readerUrl: item.readerUrl,
        viewerBase,
        genre: 'Comics',
      };
    });

  let generatedAt = new Date().toISOString();
  try {
    const old = JSON.parse(fs.readFileSync(output, 'utf8'));
    if (JSON.stringify(old.items || []) === JSON.stringify(items) && old.generatedAt) generatedAt = old.generatedAt;
  } catch { /* first refresh */ }
  const payload = {
    source: 'comicbookplus',
    sourceName: 'Comic Book Plus',
    catalog: 'Comic Books',
    generatedAt,
    total: items.length,
    failures,
    items,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(payload)}\n`);
  console.error(`Comic Book Plus catalog written: ${output} (${items.length} issues)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
