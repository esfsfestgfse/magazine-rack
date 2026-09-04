import { fetchJson } from './request.js';
import { inferGenre, sourceItem } from './common.js';

function recordMonthDay(value) {
  const text = String(value || '');
  const compactYearFirst = text.match(/(?:^|[^0-9])((?:19|20)\d{2})(\d{2})(\d{2})(?:$|[^0-9])/);
  if (compactYearFirst) return `${compactYearFirst[2]}-${compactYearFirst[3]}`;
  const compactMonthFirst = text.match(/(?:^|[^0-9])(\d{2})(\d{2})((?:19|20)\d{2})(?:$|[^0-9])/);
  if (compactMonthFirst) return `${compactMonthFirst[1]}-${compactMonthFirst[2]}`;
  const iso = text.match(/\b\d{4}[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${String(iso[1]).padStart(2, '0')}-${String(iso[2]).padStart(2, '0')}`;
  const american = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.]\d{4}\b/);
  if (american) return `${String(american[1]).padStart(2, '0')}-${String(american[2]).padStart(2, '0')}`;
  const named = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+\d{4}\b/i);
  if (!named) return '';
  const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(named[1].toLowerCase()) + 1;
  return `${String(month).padStart(2, '0')}-${String(named[2]).padStart(2, '0')}`;
}

function newspaperDate(record) {
  return [record.title, record.identifier, record.date, record.publicdate].map(recordMonthDay).find(Boolean) || '';
}

export async function fetchArchive({ query, page, genre, newspaperMonthDay }, env) {
  const term = String(query || '').trim().replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, ' ').slice(0, 120);
  const genreTerm = String(genre || '').trim().replace(/[^a-z0-9 ]/gi, ' ').slice(0, 50);
  const lucene = term ? `(${term}) AND mediatype:texts` : 'mediatype:texts AND (collection:comics OR collection:magazine OR collection:periodicals)';
  const search = genreTerm ? `${lucene} AND (${genreTerm})` : lucene;
  const params = new URLSearchParams({ q: search, 'fl[]': 'identifier', output: 'json', rows: '30', page: String(page) });
  for (const field of ['title', 'creator', 'date', 'publicdate', 'subject', 'description', 'imagecount']) params.append('fl[]', field);
  const data = await fetchJson(`https://archive.org/advancedsearch.php?${params}`, env, 'archive');
  const records = (data.response?.docs || []).filter((record) => !newspaperMonthDay || newspaperDate(record) === newspaperMonthDay);
  return { total: newspaperMonthDay ? records.length : Number(data.response?.numFound) || 0, items: records.map((record) => {
    const id = String(record.identifier || '').slice(0, 180);
    return id && record.title ? sourceItem('archive', id, { title: record.title, creator: record.creator, year: record.date || record.publicdate, genre: inferGenre(`${record.title} ${record.subject || ''}`), description: record.description, coverUrl: `https://archive.org/services/img/${encodeURIComponent(id)}`, sourceUrl: `https://archive.org/details/${encodeURIComponent(id)}`, readerUrl: `https://archive.org/embed/${encodeURIComponent(id)}?ui=full`, pageCount: record.imagecount, metadata: record }) : null;
  }).filter(Boolean) };
}
