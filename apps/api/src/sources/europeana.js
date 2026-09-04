import { fetchJson } from './request.js';
import { inferGenre, sourceItem } from './common.js';

const text = (value) => Array.isArray(value) ? text(value[0]) : value && typeof value === 'object' ? text(value.name || value.label || value.value || value.text || value.id || '') : String(value || '');
const first = (value) => Array.isArray(value) ? text(value[0]) : text(value);

function recordMonthDay(value) {
  const candidate = text(value);
  const iso = candidate.match(/\b\d{4}[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${String(iso[1]).padStart(2, '0')}-${String(iso[2]).padStart(2, '0')}`;
  const american = candidate.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.]\d{4}\b/);
  if (american) return `${String(american[1]).padStart(2, '0')}-${String(american[2]).padStart(2, '0')}`;
  const named = candidate.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+\d{4}\b/i);
  if (!named) return '';
  const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(named[1].toLowerCase()) + 1;
  return `${String(month).padStart(2, '0')}-${String(named[2]).padStart(2, '0')}`;
}

function monthDayQuery(query, target) {
  const [month, day] = String(target).split('-');
  const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(month) - 1];
  return `(${query}) AND ("${monthName} ${Number(day)}" OR "${target}" OR "${Number(month)}/${Number(day)}")`;
}

export async function fetchEuropeana({ query, page, newspaperMonthDay }, env) {
  const target = /^\d{2}-\d{2}$/.test(String(newspaperMonthDay || '')) ? newspaperMonthDay : '';
  const baseQuery = String(query || 'newspaper').trim().slice(0, 180) || 'newspaper';
  const search = target ? monthDayQuery(baseQuery, target) : baseQuery;
  // api2demo is Europeana's public demo credential; deployments can replace it
  // with EUROPEANA_API_KEY without changing the application bundle.
  const key = env.EUROPEANA_API_KEY || 'api2demo';
  const params = new URLSearchParams({ wskey: key, query: search, rows: '30', start: String(1 + ((Math.max(1, Number(page) || 1) - 1) * 30)), media: 'true', profile: 'rich' });
  const data = await fetchJson(`https://api.europeana.eu/record/v2/search.json?${params}`, env, 'europeana');
  const records = (data?.items || []).filter((record) => !target || [record.title, record.year, record.dcDate, record.date].some((value) => recordMonthDay(value) === target));
  return {
    total: target ? records.length : Number(data?.totalResults) || records.length,
    items: records.map((record) => {
      const id = text(record.id || record.identifier || first(record.title) || 'europeana-item');
      const title = first(record.title || record.dcTitle) || 'Europeana item';
      const sourceUrl = text(record.guid || record.link) || `https://www.europeana.eu/en/item${id.startsWith('/') ? id : `/${id}`}`;
      const image = first(record.edmPreview || record.edmIsShownBy || record.edmIsShownAt);
      return sourceItem('europeana', id, {
        title,
        creator: first(record.dcCreator) || 'Europeana',
        year: first(record.year || record.dcDate || record.date),
        genre: inferGenre(`${title} ${first(record.dcSubject)} newspaper`),
        description: first(record.dcDescription),
        coverUrl: image,
        sourceUrl,
        readerUrl: sourceUrl,
        metadata: record
      });
    }).filter(Boolean)
  };
}
