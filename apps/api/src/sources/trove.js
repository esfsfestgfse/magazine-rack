import { fetchJson } from './request.js';
import { inferGenre, sourceItem } from './common.js';

const text = (value) => Array.isArray(value) ? text(value[0]) : value && typeof value === 'object' ? text(value.name || value.label || value.value || value.text || value.id || '') : String(value || '');
const queryText = (query) => String(query || 'newspaper OR magazine OR comic').replace(/\bdate\s*:\s*\[[^\]]+\]/gi, ' ').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);

function recordsFrom(data) {
  const root = data?.response || data || {};
  const zones = Array.isArray(root.zone || root.category) ? (root.zone || root.category) : [root.zone || root.category].filter(Boolean);
  const candidates = [root.records?.article, root.records?.newspaper, root.records?.magazine, root.article, root.newspaper, root.magazine, root.results, ...zones.flatMap((zone) => [zone.records?.article, zone.records?.newspaper, zone.records?.magazine])];
  return candidates.find(Array.isArray) || [];
}

export async function fetchTrove({ query, page }, env) {
  if (!env.TROVE_API_KEY) return { total: 0, items: [] };
  const params = new URLSearchParams({ category: 'newspaper', include: 'article', encoding: 'json', n: '30', s: String((Math.max(1, Number(page) || 1) - 1) * 30), q: queryText(query) });
  const data = await fetchJson(`https://api.trove.nla.gov.au/v3/result?${params}`, env, 'trove', { headers: { 'X-API-KEY': env.TROVE_API_KEY } });
  const records = recordsFrom(data);
  return {
    total: Number(data?.response?.total || data?.response?.records?.total || data?.total) || records.length,
    items: records.map((record) => {
      const id = text(record.id || record.identifier || record.url || record.troveUrl || record.heading);
      const publication = text(record.publicationTitle || record.newspaperTitle || record.journalTitle || record.title || 'Trove');
      const rawUrl = text(record.troveUrl || record.url || record.link).replace(/^http:\/\//i, 'https://');
      const sourceUrl = /^https:\/\//i.test(rawUrl) ? rawUrl : `https://trove.nla.gov.au/newspaper/article/${encodeURIComponent(id)}`;
      return sourceItem('trove', id || publication, {
        title: text(record.heading || record.articleTitle || record.title || 'Trove article'),
        creator: publication,
        year: text(record.date || record.dateOfIssue || record.issueDate),
        genre: inferGenre(`${publication} newspaper periodical`),
        sourceUrl,
        readerUrl: sourceUrl,
        metadata: record
      });
    }).filter(Boolean)
  };
}
