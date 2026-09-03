import { fetchJson } from './request.js';
import { inferGenre, sourceItem } from './common.js';

export async function fetchGcd({ query, page }, env) {
  const term = String(query || 'comic').trim().slice(0, 100) || 'comic';
  const url = `https://www.comics.org/api/series/name/${encodeURIComponent(term)}/?format=json&page=${Math.max(1, Number(page) || 1)}`;
  const data = await fetchJson(url, env, 'gcd');
  const records = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  return {
    total: Number(data?.count) || records.length,
    items: records.map((record) => {
      const id = String(record.id || record.api_url || record.name || '').slice(0, 180);
      if (!id) return null;
      const seriesId = String(record.id || '').trim();
      const sourceUrl = seriesId ? `https://www.comics.org/series/${encodeURIComponent(seriesId)}/` : 'https://www.comics.org/search/advanced/';
      return sourceItem('gcd', id, {
        title: `${record.name || term}${record.year_began ? ` (${record.year_began}${record.year_ended ? `–${record.year_ended}` : ''})` : ''}`,
        creator: record.publisher || 'Grand Comics Database',
        year: record.year_began,
        genre: inferGenre(`${record.name || ''} comics`),
        coverUrl: record.cover,
        sourceUrl,
        readerUrl: sourceUrl,
        pageCount: Array.isArray(record.active_issues) ? record.active_issues.length : 0,
        metadata: record
      });
    }).filter(Boolean)
  };
}
