import { fetchJson } from './request.js';
import { sourceItem } from './common.js';

export async function fetchOpenLibrary({ query, page }, env) {
  const params = new URLSearchParams({ limit: '30', page: String(page), has_fulltext: 'true', q: String(query || 'magazine').slice(0, 120) });
  const data = await fetchJson(`https://openlibrary.org/search.json?${params}`, env, 'openlibrary');
  return { total: Number(data.numFound) || 0, items: (data.docs || []).map((record) => {
    const key = String(record.key || '').replace(/^\//, '').slice(0, 180);
    const iaId = String(record.ia?.[0] || '').trim();
    if (!key || !record.title) return null;
    const sourceUrl = `https://openlibrary.org/${key}`;
    return sourceItem('openlibrary', key, {
      title: record.title,
      creator: record.author_name,
      year: record.first_publish_year,
      genre: 'Books & periodicals',
      description: record.first_sentence?.[0],
      coverUrl: record.cover_i
        ? `https://covers.openlibrary.org/b/id/${record.cover_i}-L.jpg`
        : (iaId ? `https://archive.org/services/img/${encodeURIComponent(iaId)}` : ''),
      sourceUrl,
      readerUrl: iaId ? `https://archive.org/embed/${encodeURIComponent(iaId)}?ui=full` : sourceUrl,
      pageCount: record.number_of_pages_median,
      metadata: { iaId, ...record },
    });
  }).filter(Boolean) };
}
