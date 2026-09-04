import { fetchJson } from './request.js';
import { sourceItem } from './common.js';

export async function fetchOpenLibrary({ query, page }, env) {
  const params = new URLSearchParams({ limit: '30', page: String(page), has_fulltext: 'true', fields: 'key,edition_key,title,author_name,first_publish_year,cover_i,ia,number_of_pages_median,availability,first_sentence', q: String(query || 'magazine').slice(0, 120) });
  const data = await fetchJson(`https://openlibrary.org/search.json?${params}`, env, 'openlibrary');
  return { total: Number(data.numFound) || 0, items: (data.docs || []).map((record) => {
    const key = String(record.key || '').replace(/^\//, '').slice(0, 180);
    const iaId = String(record.ia?.[0] || '').trim();
    const editionKey = String(record.edition_key?.[0] || '').trim();
    const editionId = editionKey && /^OL\d+M$/i.test(editionKey) ? editionKey : '';
    const availability = record.availability && typeof record.availability === 'object' ? record.availability : {};
    const status = String(availability.status || '').toLowerCase();
    const borrowable = availability.borrow_available === true || /borrow_available|full_access/.test(status);
    if (!key || !record.title) return null;
    const sourceUrl = editionId ? `https://openlibrary.org/books/${editionId}` : `https://openlibrary.org/${key}`;
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
      readerUrl: iaId ? `https://archive.org/stream/${encodeURIComponent(iaId)}?ui=embed&wrapper=false` : sourceUrl,
      pageCount: record.number_of_pages_median,
      access: iaId ? (borrowable ? 'borrow' : 'preview') : (borrowable ? 'borrow' : 'catalog'),
      readable: Boolean(iaId || borrowable),
      readerKind: iaId ? 'ia-bookreader' : 'none',
      coverQuality: record.cover_i ? 5 : (iaId ? 2 : 0),
      availability,
      metadata: { iaId, editionKey: editionId, openLibraryWorkKey: key, ...record },
    });
  }).filter(Boolean) };
}
