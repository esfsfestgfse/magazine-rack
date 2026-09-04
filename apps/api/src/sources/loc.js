import { fetchJson } from './request.js';
import { sourceItem } from './common.js';

function locUrl(value) {
  const candidate = String(value || '').replace(/^http:\/\//i, 'https://');
  if (candidate.startsWith('/')) return `https://www.loc.gov${candidate}`;
  return candidate.startsWith('https://www.loc.gov/') ? candidate : '';
}

function recordMonthDay(value) {
  const text = String(value || '');
  const iso = text.match(/\b\d{4}[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${String(iso[1]).padStart(2, '0')}-${String(iso[2]).padStart(2, '0')}`;
  const american = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.]\d{4}\b/);
  return american ? `${String(american[1]).padStart(2, '0')}-${String(american[2]).padStart(2, '0')}` : '';
}

const CHRONAM_SAMPLE_YEARS = Object.freeze([
  1963, 1960, 1955, 1950, 1945, 1940, 1935, 1930, 1925, 1920,
  1915, 1910, 1905, 1900, 1890, 1880, 1870, 1860, 1850, 1840,
  1830, 1820, 1810, 1800,
]);

function yearsFor(monthDay) {
  return CHRONAM_SAMPLE_YEARS.filter((year) => monthDay !== '02-29' || year % 4 === 0);
}

async function fetchExactDay(year, monthDay, query, page, env) {
  const params = new URLSearchParams({ fo: 'json', at: 'results', c: '4', sp: String(page), qs: query, dates: `${year}-${monthDay}` });
  return fetchJson(`https://www.loc.gov/collections/chronicling-america/?${params}`, env, 'loc');
}

async function fetchLocMonthDay({ query, page, newspaperMonthDay }, env) {
  const monthDay = /^\d{2}-\d{2}$/.test(String(newspaperMonthDay || '')) ? newspaperMonthDay : '';
  if (!monthDay) return { total: 0, items: [] };
  const search = String(query || 'newspaper').slice(0, 120);
  const responses = [];
  const years = yearsFor(monthDay);
  // Keep concurrent upstream requests bounded inside the Worker.
  for (let index = 0; index < years.length; index += 6) {
    const batch = await Promise.allSettled(years.slice(index, index + 6).map((year) => fetchExactDay(year, monthDay, search, page, env)));
    responses.push(...batch);
  }
  const failures = responses.filter((entry) => entry.status === 'rejected').map((entry) => entry.reason?.code || 'unknown');
  if (failures.length) console.error(JSON.stringify({ source: 'loc', event: 'month_day_upstream_failures', monthDay, count: failures.length, codes: failures.slice(0, 8) }));
  const records = responses.flatMap((entry) => entry.status === 'fulfilled' ? (entry.value.results || []).filter((record) => recordMonthDay(record.date) === monthDay) : []);
  const total = responses.reduce((sum, entry) => sum + (entry.status === 'fulfilled' ? Number(entry.value.pagination?.of || entry.value.pagination?.total) || 0 : 0), 0);
  return {
    total: total || records.length,
    items: records.map((record) => {
      const url = locUrl(record.id);
      if (!url || !record.title) return null;
      const image = Array.isArray(record.image_url) ? record.image_url.at(-1) : '';
      return sourceItem('loc', url, { title: record.title, creator: record.contributor, year: record.date, genre: 'Newspapers', description: record.description, coverUrl: image, sourceUrl: url, readerUrl: url, metadata: record });
    }).filter(Boolean),
  };
}

export async function fetchLoc({ query, page, newspaperMonthDay }, env) {
  if (newspaperMonthDay) return fetchLocMonthDay({ query, page, newspaperMonthDay }, env);
  const params = new URLSearchParams({ fo: 'json', c: '30', sp: String(page), q: String(query || 'magazine').slice(0, 120) });
  const data = await fetchJson(`https://www.loc.gov/search/?${params}`, env, 'loc');
  return { total: Number(data.pagination?.total) || 0, items: (data.results || []).map((record) => {
    const url = locUrl(record.id);
    if (!url || !record.title) return null;
    const image = Array.isArray(record.image_url) ? record.image_url.at(-1) : '';
    return sourceItem('loc', url, { title: record.title, creator: record.contributor, year: record.date, genre: 'Newspapers', description: record.description, coverUrl: image, sourceUrl: url, readerUrl: url, metadata: record });
  }).filter(Boolean) };
}
