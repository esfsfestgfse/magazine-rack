import { fetchJson } from './request.js';
import { sourceItem } from './common.js';

function locUrl(value) {
  const candidate = String(value || '');
  if (candidate.startsWith('/')) return `https://www.loc.gov${candidate}`;
  return candidate.startsWith('https://www.loc.gov/') ? candidate : '';
}

export async function fetchLoc({ query, page }, env) {
  const params = new URLSearchParams({ fo: 'json', c: '30', sp: String(page), q: String(query || 'magazine').slice(0, 120) });
  const data = await fetchJson(`https://www.loc.gov/search/?${params}`, env, 'loc');
  return { total: Number(data.pagination?.total) || 0, items: (data.results || []).map((record) => {
    const url = locUrl(record.id);
    if (!url || !record.title) return null;
    const image = Array.isArray(record.image_url) ? record.image_url.at(-1) : '';
    return sourceItem('loc', url, { title: record.title, creator: record.contributor, year: record.date, genre: 'Newspapers', description: record.description, coverUrl: image, sourceUrl: url, readerUrl: url, metadata: record });
  }).filter(Boolean) };
}
