import { fetchJson } from './request.js';
import { inferGenre, sourceItem } from './common.js';

export async function fetchArchive({ query, page, genre }, env) {
  const term = String(query || '').trim().replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, ' ').slice(0, 120);
  const genreTerm = String(genre || '').trim().replace(/[^a-z0-9 ]/gi, ' ').slice(0, 50);
  const lucene = term ? `(${term}) AND mediatype:texts` : 'mediatype:texts AND (collection:comics OR collection:magazine OR collection:periodicals)';
  const search = genreTerm ? `${lucene} AND (${genreTerm})` : lucene;
  const params = new URLSearchParams({ q: search, 'fl[]': 'identifier', output: 'json', rows: '30', page: String(page) });
  for (const field of ['title', 'creator', 'date', 'publicdate', 'subject', 'description', 'imagecount']) params.append('fl[]', field);
  const data = await fetchJson(`https://archive.org/advancedsearch.php?${params}`, env, 'archive');
  return { total: Number(data.response?.numFound) || 0, items: (data.response?.docs || []).map((record) => {
    const id = String(record.identifier || '').slice(0, 180);
    return id && record.title ? sourceItem('archive', id, { title: record.title, creator: record.creator, year: record.date || record.publicdate, genre: inferGenre(`${record.title} ${record.subject || ''}`), description: record.description, coverUrl: `https://archive.org/services/img/${encodeURIComponent(id)}`, sourceUrl: `https://archive.org/details/${encodeURIComponent(id)}`, readerUrl: `https://archive.org/embed/${encodeURIComponent(id)}?ui=full`, pageCount: record.imagecount, metadata: record }) : null;
  }).filter(Boolean) };
}
