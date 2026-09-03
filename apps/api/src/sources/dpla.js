import { fetchJson } from './request.js';
import { inferGenre, sourceItem } from './common.js';

const text = (value) => Array.isArray(value) ? text(value[0]) : value && typeof value === 'object' ? text(value.name || value.label || value.value || value.text || value.id || '') : String(value || '');
const queryText = (query) => String(query || 'magazine OR periodical OR newspaper OR comic').replace(/\bdate\s*:\s*\[[^\]]+\]/gi, ' ').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);

export async function fetchDpla({ query, page }, env) {
  if (!env.DPLA_API_KEY) return { total: 0, items: [] };
  const params = new URLSearchParams({ q: queryText(query), page_size: '30', page: String(Math.max(1, Number(page) || 1)), api_key: env.DPLA_API_KEY });
  const data = await fetchJson(`https://api.dp.la/v2/items?${params}`, env, 'dpla');
  const records = data?.docs || data?.items || [];
  return {
    total: Number(data?.count || data?.total || data?.pagination?.total) || records.length,
    items: records.map((record) => {
      const resource = record.sourceResource || {};
      const id = text(record.id || record.identifier || resource.title || 'dpla-item');
      const rawUrl = text(record.isShownAt || record.source || record.provider).replace(/^http:\/\//i, 'https://');
      const sourceUrl = /^(https:\/\/)?(www\.)?dp\.la\//i.test(rawUrl) || /^https:\/\/pro\.dp\.la\//i.test(rawUrl)
        ? rawUrl
        : `https://dp.la/item/${encodeURIComponent(id)}`;
      const objectUrl = text(record.object || record.thumbnail || record.objectUrl || record.isShownBy).replace(/^http:\/\//i, 'https://');
      const genre = inferGenre(`${text(resource.title)} ${text(resource.type)} ${text(resource.subject)}`);
      return sourceItem('dpla', id, {
        title: text(resource.title || record.title || 'DPLA item'),
        creator: text(resource.creator || resource.contributor || resource.publisher || 'DPLA'),
        year: text(resource.date || record.date),
        genre,
        sourceUrl,
        readerUrl: sourceUrl,
        coverUrl: objectUrl,
        metadata: record
      });
    }).filter(Boolean)
  };
}
