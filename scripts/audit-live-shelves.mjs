import { SHELVES } from '../apps/web/src/shelf-catalog.js';
import { dateMonthDay, fetchShelfPage, monthDayKey } from '../apps/web/src/live-sources.js';

const PAGE_SIZE = 30;
const CONCURRENCY = 5;
const targetMonthDay = process.env.NEWSPAPER_MONTH_DAY || monthDayKey();

function text(value) {
  return Array.isArray(value) ? value.join(' ') : String(value ?? '');
}

function normalizedTitle(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function accessKind(item) {
  const access = String(item.access || '').toLowerCase();
  if (item.readable === false || access === 'catalog' || access === 'unavailable' || item.readerKind === 'none') return 'catalog';
  if (access === 'image-only' || item.readerKind === 'image' || item.readerKind === 'loc-resource') return 'image';
  return 'reader';
}

function newspaperDate(item) {
  return [item.issueDate, item.date, item.title, item.identifier].map(dateMonthDay).find(Boolean) || '';
}

async function mapLimit(values, limit, mapper) {
  const output = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      try {
        output[index] = await mapper(values[index], index);
      } catch (error) {
        output[index] = { error: error instanceof Error ? error.message : String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

const rows = await mapLimit(SHELVES, CONCURRENCY, async (shelf) => {
  const started = Date.now();
  const result = await fetchShelfPage(shelf, 1, { pageSize: PAGE_SIZE, newspaperMonthDay: targetMonthDay });
  const items = Array.isArray(result.docs || result.items) ? (result.docs || result.items) : [];
  const ids = new Set();
  const titles = new Map();
  let duplicateIds = 0;
  let duplicateTitles = 0;
  for (const item of items) {
    if (ids.has(item.identifier)) duplicateIds += 1;
    ids.add(item.identifier);
    const title = normalizedTitle(item.title);
    if (title) {
      titles.set(title, (titles.get(title) || 0) + 1);
      if (titles.get(title) > 1) duplicateTitles += 1;
    }
  }
  const newspaper = shelf.newspaperDateMode === 'month-day';
  const newspaperDates = newspaper ? items.map(newspaperDate) : [];
  return {
    id: shelf.id,
    title: shelf.title,
    source: shelf.source || 'ia',
    durationMs: Date.now() - started,
    ok: !result.errors?.length,
    partial: Boolean(result.partial),
    errors: result.errors || [],
    page: result.page || 1,
    sampleCount: items.length,
    total: Number(result.numFound) || 0,
    readableCount: items.filter((item) => accessKind(item) !== 'catalog').length,
    readerCount: items.filter((item) => accessKind(item) === 'reader').length,
    imageOnlyCount: items.filter((item) => accessKind(item) === 'image').length,
    catalogOnlyCount: items.filter((item) => accessKind(item) === 'catalog').length,
    coverCount: items.filter((item) => Boolean(item.cover)).length,
    readerUrlCount: items.filter((item) => Boolean(item.readerUrl || item.locUrl)).length,
    duplicateIds,
    duplicateTitles,
    newspaperMonthDay: newspaper ? targetMonthDay : null,
    newspaperDateMatches: newspaper ? newspaperDates.filter((value) => value === targetMonthDay).length : null,
    newspaperDateMissing: newspaper ? newspaperDates.filter((value) => !value).length : null,
    newspaperDateMismatches: newspaper ? newspaperDates.filter((value) => value && value !== targetMonthDay).length : null
  };
});

const failures = rows.filter((row) => row?.error || row?.errors?.length || row?.partial);
const totals = rows.reduce((acc, row) => {
  if (!row || row.error) return acc;
  acc.sample += row.sampleCount;
  acc.readable += row.readableCount;
  acc.reader += row.readerCount;
  acc.imageOnly += row.imageOnlyCount;
  acc.catalogOnly += row.catalogOnlyCount;
  acc.covers += row.coverCount;
  acc.duplicateIds += row.duplicateIds;
  acc.duplicateTitles += row.duplicateTitles;
  acc.newspaperMatches += row.newspaperDateMatches || 0;
  acc.newspaperMissing += row.newspaperDateMissing || 0;
  acc.newspaperMismatches += row.newspaperDateMismatches || 0;
  return acc;
}, { sample: 0, readable: 0, reader: 0, imageOnly: 0, catalogOnly: 0, covers: 0, duplicateIds: 0, duplicateTitles: 0, newspaperMatches: 0, newspaperMissing: 0, newspaperMismatches: 0 });

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  targetMonthDay,
  shelfCount: SHELVES.length,
  failedShelfCount: failures.length,
  totals,
  shelves: rows
}, null, 2));
