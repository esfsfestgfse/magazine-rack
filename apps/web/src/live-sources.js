/*
 * Browser-side live source adapters for Magazine Rack.
 *
 * The adapters deliberately return one small, predictable document shape. A
 * source can fail without taking down the shelf: callers receive `partial`,
 * `errors`, and (for Internet Archive scrape mode) `nextCursor` metadata.
 */

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 40;
const MAX_SCRAPE_COUNT = 100;
// The original shelf catalog contains long, carefully composed IA Lucene
// filters (including adult-content exclusions). Keep them intact while still
// putting a hard ceiling on caller-provided search input.
const MAX_QUERY_LENGTH = 4_000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 5_000;
const MAX_CONCURRENT_DETAIL_REQUESTS = 4;

const IA_BASE = 'https://archive.org';
const LOC_BASE = 'https://www.loc.gov';
// xkcd.now.sh mirrors the official JSON API and adds browser CORS support.
// The former GitHub mirror was removed and now returns 404.
const XKCD_BASE = 'https://xkcd.now.sh';

const IA_SORTS = new Set([
  'downloads+desc',
  'publicdate+desc',
  'addeddate+desc',
  'week+desc',
  'titleSorter+asc'
]);

const cleanText = (value, max = 240) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const first = (value) => Array.isArray(value) ? value[0] : value;

const list = (value, max = 12) => {
  const values = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  return values
    .flatMap((entry) => Array.isArray(entry) ? entry : [entry])
    .map((entry) => cleanText(typeof entry === 'object' ? (entry.name || entry.label || entry.value || '') : entry, 160))
    .filter(Boolean)
    .slice(0, max);
};

const httpsUrl = (value) => {
  const url = cleanText(value, 1_000).replace(/^http:\/\//i, 'https://');
  return /^https:\/\//i.test(url) ? url : null;
};

const numberValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
};

const pageNumber = (value) => Math.max(1, Math.min(10_000, numberValue(value) || 1));

const pageSize = (value) => Math.max(1, Math.min(MAX_PAGE_SIZE, numberValue(value) || DEFAULT_PAGE_SIZE));

const boundedQuery = (value) => cleanText(value, MAX_QUERY_LENGTH);

const formatKey = (value) => {
  const text = Array.isArray(value) ? value.join(' ') : String(value || '');
  const lower = text.toLowerCase();
  if (/comic|graphic novel|webcomic/.test(lower)) return 'comic';
  if (/newspaper|gazette|\bpaper\b/.test(lower)) return 'paper';
  if (/magazine|periodical|journal/.test(lower)) return 'magazine';
  if (/zine|fanzine|newsletter/.test(lower)) return 'zine';
  return '';
};

const valueText = (value) => Array.isArray(value)
  ? valueText(value[0])
  : value && typeof value === 'object'
    ? valueText(value.name || value.label || value.value || value.text || value.id || '')
    : String(value || '');

const errorInfo = (error) => ({
  message: cleanText(error?.message || error || 'Source request failed', 220),
  status: numberValue(error?.status) || null,
  code: cleanText(error?.code || '', 40) || null,
  retryAfter: numberValue(error?.retryAfter) || null
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryAfterMs(response) {
  const raw = response.headers.get('Retry-After');
  if (!raw) return 1_000;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(250, Math.min(MAX_RETRY_AFTER_MS, seconds * 1_000));
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(250, Math.min(MAX_RETRY_AFTER_MS, date - Date.now())) : 1_000;
}

class SourceRequestError extends Error {
  constructor(message, status = 0, retryAfter = 0, code = '') {
    super(message);
    this.name = 'SourceRequestError';
    this.status = status;
    this.retryAfter = retryAfter;
    this.code = code;
  }
}

/** Fetch JSON with a timeout and bounded 429 retry/backoff. */
export async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new SourceRequestError('Fetch is unavailable', 0, 0, 'no-fetch');

  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
    let removeAbortListener = null;
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else {
        removeAbortListener = () => controller.abort();
        options.signal.addEventListener('abort', removeAbortListener, { once: true });
      }
    }

    try {
      const response = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal });
      if (response.status === 429) {
        const retryAfter = retryAfterMs(response);
        if (attempt <= MAX_RETRIES) {
          await delay(retryAfter);
          continue;
        }
        throw new SourceRequestError('Rate limited by source', 429, retryAfter, 'rate-limited');
      }
      if (!response.ok) throw new SourceRequestError(`Source HTTP ${response.status}`, response.status, 0, 'http');
      try {
        return await response.json();
      } catch {
        throw new SourceRequestError('Source returned invalid JSON', response.status, 0, 'invalid-json');
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw new SourceRequestError('Source request timed out', 408, 0, 'timeout');
      throw error;
    } finally {
      clearTimeout(timer);
      if (removeAbortListener && options.signal) options.signal.removeEventListener('abort', removeAbortListener);
    }
  }

  throw new SourceRequestError('Source request failed', 0, 0, 'request-failed');
}

/** Normalize every source into the contract consumed by the new UI. */
export function normalizeDoc(raw = {}, fallbackSource = '') {
  const source = cleanText(raw.source || fallbackSource, 40) || 'unknown';
  const title = cleanText(raw.title || raw.name || raw.identifier || 'Untitled', 300) || 'Untitled';
  const identifier = cleanText(raw.identifier || raw.id || raw.locUrl || `${source}:${title}`, 300) || `${source}:${title}`;
  const creator = cleanText(first(raw.creator || raw.author || raw.publisher || ''), 180);
  const date = cleanText(first(raw.date || raw.year || raw.publishedDate || ''), 40);
  const subjects = list(raw.subject || raw.subjects, 16);
  const imagecount = numberValue(raw.imagecount || raw.imageCount);
  const pages = numberValue(raw.pages || raw.pageCount || imagecount);
  const format = formatKey(raw.format || raw.type || raw.genre || subjects) || (source === 'gcd' ? 'comic' : source === 'loc' || source === 'locsearch' || source === 'trove' ? 'paper' : 'magazine');

  return {
    identifier,
    title,
    creator,
    date,
    subject: subjects,
    description: cleanText(raw.description || raw.abstract || raw.alt || '', 500),
    source,
    format,
    publication: cleanText(raw.publication || raw.partof_title || raw.partof || '', 220),
    issueDate: cleanText(raw.issueDate || raw.date || '', 40),
    volume: cleanText(raw.volume || raw.vol || '', 40),
    issue: cleanText(raw.issue || raw.number || '', 40),
    setup: Boolean(raw.setup),
    cover: httpsUrl(raw.cover),
    fullImage: httpsUrl(raw.fullImage),
    locUrl: httpsUrl(raw.locUrl || raw.url || raw.link),
    iiifManifest: httpsUrl(raw.iiifManifest || raw.manifest || raw.iiif),
    imagecount,
    pages
  };
}

export function sourceLabel(source = '') {
  return ({
    ia: 'Internet Archive',
    loc: 'Library of Congress',
    locsearch: 'Library of Congress',
    xkcd: 'XKCD',
    openlibrary: 'Open Library',
    olsubjects: 'Open Library',
    europeana: 'Europeana',
    wikimedia: 'Wikimedia Commons',
    gbooks: 'Google Books',
    gcd: 'Grand Comics Database',
    trove: 'Trove · National Library of Australia',
    dpla: 'Digital Public Library of America'
  })[source] || cleanText(source, 60) || 'Public collection';
}

export function readerUrl(doc = {}) {
  if (doc.locUrl) return doc.locUrl;
  if (doc.source === 'ia' && doc.identifier) return `${IA_BASE}/details/${encodeURIComponent(doc.identifier)}`;
  return null;
}

function result(docs = [], metadata = {}) {
  const seen = new Set();
  const normalized = docs
    .map((doc) => normalizeDoc(doc, metadata.source || doc?.source || 'unknown'))
    .filter((doc) => {
      if (!doc.identifier || seen.has(doc.identifier)) return false;
      seen.add(doc.identifier);
      return true;
    });
  return {
    docs: normalized,
    numFound: numberValue(metadata.numFound) || normalized.length,
    page: pageNumber(metadata.page),
    pageSize: pageSize(metadata.pageSize),
    source: metadata.source || normalized[0]?.source || 'unknown',
    mode: metadata.mode || 'search',
    partial: Boolean(metadata.partial),
    errors: (metadata.errors || []).slice(0, 8),
    nextCursor: metadata.nextCursor || null,
    deepAvailable: Boolean(metadata.deepAvailable),
    nextMode: metadata.nextMode || null
  };
}

async function safePage(loader, source) {
  try {
    return await loader();
  } catch (error) {
    return result([], { source, partial: true, errors: [errorInfo(error)] });
  }
}

function sourceOf(shelf = {}) {
  const source = String(shelf.source || '').toLowerCase();
  if (['locsearch', 'loc-search', 'loc_search', 'locphotos'].includes(source)) return 'locsearch';
  if (['open-library', 'open_library', 'ol'].includes(source)) return 'openlibrary';
  if (['olsubjects', 'ol-subjects', 'openlibrary-subjects'].includes(source)) return 'olsubjects';
  if (['eu', 'europena'].includes(source)) return 'europeana';
  if (['commons', 'wikimedia-commons', 'wikimedia_commons'].includes(source)) return 'wikimedia';
  if (['google-books', 'googlebooks', 'google_books'].includes(source)) return 'gbooks';
  if (['grand-comics-database', 'grand_comics_database', 'comics.org'].includes(source)) return 'gcd';
  if (['national-library-of-australia', 'nla-trove', 'trove-api'].includes(source)) return 'trove';
  if (['digital-public-library-of-america', 'digital-public-library', 'dpla-api'].includes(source)) return 'dpla';
  if (['archive', 'internet-archive', 'internet_archive'].includes(source)) return 'ia';
  return source || (shelf.query || shelf.iaQuery ? 'ia' : 'ia');
}

function queryFor(shelf, options, baseKeys = []) {
  const base = boundedQuery(baseKeys.map((key) => shelf?.[key]).find(Boolean) || '');
  const extra = boundedQuery(options.query || options.extraQuery || '');
  if (!base) return extra;
  if (!extra || extra === base) return base;
  return `(${base}) AND (${extra})`.slice(0, MAX_QUERY_LENGTH);
}

function dateRange(options = {}) {
  const range = options.dateRange || options.decade || '';
  if (typeof range === 'object') return { start: cleanText(range.start, 20), end: cleanText(range.end, 20) };
  const [start = '', end = ''] = String(range).split(/\s+TO\s+/i);
  return { start: cleanText(start, 20), end: cleanText(end, 20) };
}

function iaQuery(shelf, options) {
  let query = queryFor(shelf, options, ['query', 'iaQuery', 'search']);
  if (!query) query = 'mediatype:texts';
  const range = dateRange(options);
  if (range.start && range.end && !/\bdate\s*:/i.test(query)) query = `${query} AND date:[${range.start} TO ${range.end}]`;
  return boundedQuery(query);
}

function iaSort(value) {
  const candidate = String(value || '').replace(/\s+/g, '+');
  return IA_SORTS.has(candidate) ? candidate : 'downloads+desc';
}

function iaFields(params) {
  ['identifier', 'title', 'creator', 'date', 'subject', 'imagecount', 'collection', 'publicdate'].forEach((field) => params.append('fl[]', field));
}

function scrapeSort(value) {
  return iaSort(value).replace(/\+/g, ' ');
}

function archiveCover(identifier) {
  return identifier && !/[/:\s]/.test(identifier) ? `${IA_BASE}/services/img/${encodeURIComponent(identifier)}` : null;
}

async function fetchIaAdvanced(shelf, page, options) {
  const size = pageSize(options.pageSize);
  const params = new URLSearchParams({ q: iaQuery(shelf, options), rows: String(size), page: String(page), output: 'json' });
  iaFields(params);
  params.append('sort[]', iaSort(options.sort || options.sortMode));
  const data = await fetchJson(`${IA_BASE}/advancedsearch.php?${params}`, options);
  const docs = data?.response?.docs || [];
  const numFound = numberValue(data?.response?.numFound) || docs.length;
  const deepAvailable = numFound > 8_000 && page * size >= 90;
  return result(docs.map((doc) => ({
    ...doc,
    source: 'ia',
    cover: archiveCover(doc.identifier),
    locUrl: doc.identifier ? `${IA_BASE}/details/${encodeURIComponent(doc.identifier)}` : null,
    pages: numberValue(doc.imagecount)
  })), { source: 'ia', page, pageSize: size, numFound, deepAvailable, nextMode: deepAvailable ? 'scrape' : null });
}

async function fetchIaScrape(shelf, page, options) {
  const size = pageSize(options.pageSize);
  const count = Math.min(MAX_SCRAPE_COUNT, Math.max(size, numberValue(options.scrapeCount) || size));
  const params = new URLSearchParams({
    q: iaQuery(shelf, options),
    fields: 'identifier,title,creator,date,subject,imagecount,collection,publicdate',
    count: String(count),
    sorts: scrapeSort(options.sort || options.sortMode)
  });
  const cursor = cleanText(options.cursor || options.scrapeCursor || '', 300);
  if (cursor) params.set('cursor', cursor);
  const data = await fetchJson(`${IA_BASE}/services/search/v1/scrape?${params}`, options);
  const docs = (data?.items || []).map((doc) => ({
    ...doc,
    source: 'ia',
    cover: archiveCover(doc.identifier),
    locUrl: doc.identifier ? `${IA_BASE}/details/${encodeURIComponent(doc.identifier)}` : null,
    pages: numberValue(doc.imagecount)
  }));
  return result(docs, {
    source: 'ia',
    page,
    pageSize: size,
    numFound: numberValue(data?.total) || docs.length,
    mode: 'scrape',
    nextCursor: cleanText(data?.cursor || '', 300) || null
  });
}

function locImageUrls(item) {
  return list(item?.image_url || item?.imageUrl, 30).map(httpsUrl).filter(Boolean);
}

function locThumb(urls) {
  return httpsUrl(urls.find((url) => /pct:(12\.5|25)(?:\/|$)/.test(url)) || urls[0]);
}

function locFullImage(urls) {
  const base = urls[0] || '';
  if (!base) return null;
  return httpsUrl(base
    .replace(/\/pct:[0-9.]+\/0\//, '/pct:50/0/')
    .replace(/\/full\/[^/]+\/0\//, '/full/pct:50/0/')) || httpsUrl(base);
}

function mapLocDoc(item, source = 'loc') {
  const urls = locImageUrls(item);
  const paper = first(item.partof_title) || first(item.partof) || item.contributor || 'Chronicling America';
  return {
    source,
    identifier: item.id || item.url || item.title || 'loc-item',
    title: item.title || 'Newspaper page',
    creator: paper,
    date: String(item.date || '').slice(0, 10),
    subject: item.subject || [],
    cover: locThumb(urls),
    fullImage: locFullImage(urls),
    locUrl: item.url || item.id,
    imagecount: urls.length,
    pages: urls.length
  };
}

function locExtraParams(extra) {
  const params = new URLSearchParams();
  if (!extra) return params;
  for (const [key, value] of new URLSearchParams(String(extra))) params.append(key, value);
  return params;
}

async function fetchLocPage(shelf, page, options, search = false) {
  const size = pageSize(options.pageSize);
  const query = queryFor(shelf, options, ['locQs', 'query']) || (search ? 'comic' : 'newspaper');
  const params = new URLSearchParams({ fo: 'json', c: String(size), sp: String(page) });
  params.set(search ? 'q' : 'qs', query);
  for (const [key, value] of locExtraParams(shelf.locExtra).entries()) params.append(key, value);
  const range = dateRange(options);
  if (range.start) params.set('start_date', range.start);
  if (range.end) params.set('end_date', range.end);

  const path = search ? cleanLocPath(shelf.locPath || 'search') : 'collections/chronicling-america';
  let data;
  try {
    data = await fetchJson(`${LOC_BASE}/${path}/?${params}`, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
  } catch (error) {
    // State facets can intermittently fail at the LOC edge. Retry the base
    // collection without the optional facet so a regional shelf still has
    // newspaper results instead of becoming empty.
    if (search || !shelf.locExtra) throw error;
    const safeParams = new URLSearchParams({ fo: 'json', c: String(size), sp: String(page), qs: query });
    const range = dateRange(options);
    if (range.start) safeParams.set('start_date', range.start);
    if (range.end) safeParams.set('end_date', range.end);
    data = await fetchJson(`${LOC_BASE}/collections/chronicling-america/?${safeParams}`, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
  }
  const docs = (data?.results || []).map((item) => mapLocDoc(item, search ? 'locsearch' : 'loc'));
  const pagination = data?.pagination || {};
  return result(docs, {
    source: search ? 'locsearch' : 'loc',
    page,
    pageSize: size,
    numFound: numberValue(pagination.of || pagination.total) || docs.length
  });
}

function cleanLocPath(path) {
  const cleaned = String(path || 'search').replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9_/-]/gi, '');
  return cleaned || 'search';
}

async function mapLimit(values, limit, mapper) {
  const output = new Array(values.length);
  let next = 0;
  const worker = async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      try { output[index] = await mapper(values[index], index); }
      catch (error) { output[index] = { error }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

async function fetchXkcdPage(shelf, page, options) {
  const base = String(options.xkcdBaseUrl || shelf.xkcdBaseUrl || XKCD_BASE).replace(/\/$/, '');
  const latest = await fetchJson(base === 'https://xkcd.now.sh' ? `${base}/?comic=latest` : `${base}/info.0.json`, options);
  const max = Math.max(1, Math.min(100_000, numberValue(latest?.num) || 3_000));
  const size = pageSize(options.pageSize);
  const start = max - ((page - 1) * size);
  const ids = Array.from({ length: size }, (_, index) => start - index).filter((id) => id > 0);
  const responses = await mapLimit(ids, MAX_CONCURRENT_DETAIL_REQUESTS, (id) => fetchJson(base === 'https://xkcd.now.sh' ? `${base}/?comic=${id}` : `${base}/${id}/info.0.json`, options));
  const errors = responses.filter((entry) => entry?.error).map((entry) => errorInfo(entry.error));
  const docs = responses.filter((entry) => entry && !entry.error).map((comic) => ({
    source: 'xkcd',
    identifier: `xkcd-${numberValue(comic.num)}`,
    title: comic.safe_title || comic.title || `XKCD ${comic.num}`,
    creator: 'Randall Munroe',
    date: [comic.year, comic.month, comic.day].filter(Boolean).join('-'),
    subject: ['xkcd', 'webcomic'],
    cover: comic.mirror_img || comic.img,
    fullImage: comic.mirror_img || comic.img,
    locUrl: `https://xkcd.com/${numberValue(comic.num)}`,
    imagecount: 1,
    pages: 1
  }));
  return result(docs, { source: 'xkcd', page, pageSize: size, numFound: max, partial: errors.length > 0, errors });
}

async function fetchOpenLibraryPage(shelf, page, options) {
  const size = pageSize(options.pageSize);
  const query = queryFor(shelf, options, ['olQuery', 'query']) || 'magazine';
  const params = new URLSearchParams({
    q: query,
    has_fulltext: 'true',
    fields: 'key,title,author_name,first_publish_year,cover_i,ia,public_scan_b,subject,number_of_pages',
    limit: String(size),
    page: String(page)
  });
  const data = await fetchJson(`https://openlibrary.org/search.json?${params}`, options);
  const docs = (data?.docs || []).map((item) => {
    const iaId = list(item.ia, 1)[0] || null;
    const cover = item.cover_i
      ? `https://covers.openlibrary.org/b/id/${numberValue(item.cover_i)}-M.jpg`
      : archiveCover(iaId);
    return {
      source: iaId ? 'ia' : 'openlibrary',
      identifier: iaId || item.key,
      title: item.title || 'Untitled',
      creator: first(item.author_name) || 'Open Library',
      date: item.first_publish_year ? String(item.first_publish_year) : '',
      subject: item.subject || [],
      cover,
      fullImage: iaId ? archiveCover(iaId) : cover,
      locUrl: item.key ? `https://openlibrary.org${item.key}` : null,
      pages: item.number_of_pages
    };
  });
  return result(docs, { source: 'openlibrary', page, pageSize: size, numFound: numberValue(data?.num_found) || docs.length });
}

async function fetchOpenLibrarySubjectsPage(shelf, page, options) {
  const size = pageSize(options.pageSize);
  let subject = boundedQuery(shelf.olSubject || 'comics');
  const extra = boundedQuery(options.query || options.extraQuery || '');
  if (extra && !/\bdate\s*:/i.test(extra)) subject = extra.replace(/\s+/g, '_').toLowerCase().slice(0, 120);
  const params = new URLSearchParams({ limit: String(size), offset: String((page - 1) * size) });
  const data = await fetchJson(`https://openlibrary.org/subjects/${encodeURIComponent(subject)}.json?${params}`, options);
  const docs = (data?.works || []).map((item) => {
    const iaId = list(item.ia, 1)[0] || null;
    return {
      source: iaId ? 'ia' : 'openlibrary',
      identifier: iaId || item.key,
      title: item.title || 'Untitled',
      creator: item.authors?.[0]?.name || 'Open Library',
      date: item.first_publish_year ? String(item.first_publish_year) : '',
      subject: item.subject || [subject],
      cover: item.cover_id ? `https://covers.openlibrary.org/b/id/${numberValue(item.cover_id)}-M.jpg` : archiveCover(iaId),
      fullImage: iaId ? archiveCover(iaId) : null,
      locUrl: item.key ? `https://openlibrary.org${item.key}` : null
    };
  });
  return result(docs, { source: 'olsubjects', page, pageSize: size, numFound: numberValue(data?.work_count) || docs.length });
}

async function fetchEuropeanaPage(shelf, page, options) {
  const key = cleanText(options.europeanaKey || shelf.europeanaKey || shelf.euKey || options.apiKeys?.europeana || '', 200);
  if (!key) {
    return result([{
      source: 'europeana',
      identifier: 'europeana:setup',
      title: 'Add a Europeana API key to this shelf',
      creator: 'Europeana',
      subject: ['setup'],
      locUrl: 'https://www.europeana.eu/en/apis'
    }], { source: 'europeana', page, pageSize: pageSize(options.pageSize), numFound: 1, partial: true, errors: [{ message: 'Europeana API key is not configured', status: null, code: 'missing-key', retryAfter: null }] });
  }
  const size = pageSize(options.pageSize);
  let query = queryFor(shelf, options, ['euQuery', 'query']) || 'newspaper';
  if (options.query && !options.dateRange && !options.decade) query = boundedQuery(options.query);
  const params = new URLSearchParams({ wskey: key, query, rows: String(size), start: String(1 + ((page - 1) * size)), media: 'true', profile: 'rich' });
  if (shelf.euTheme) params.set('theme', boundedQuery(shelf.euTheme));
  const data = await fetchJson(`https://api.europeana.eu/record/v2/search.json?${params}`, options);
  const docs = (data?.items || []).map((item) => {
    const preview = first(item.edmPreview);
    const full = first(item.edmIsShownBy) || first(item.edmIsShownAt) || preview;
    return {
      source: 'europeana',
      identifier: item.id || first(item.title) || 'europeana-item',
      title: first(item.title) || item.dcTitle || 'Europeana item',
      creator: first(item.dcCreator) || 'Europeana',
      date: first(item.year) || '',
      subject: item.dcSubject || [],
      cover: preview || full,
      fullImage: full,
      locUrl: item.guid || item.link,
      imagecount: 1,
      pages: 1
    };
  });
  return result(docs, { source: 'europeana', page, pageSize: size, numFound: numberValue(data?.totalResults) || docs.length });
}

function sourceQueryText(base, options) {
  return boundedQuery(`${base || ''} ${options.query || options.extraQuery || ''}`)
    .replace(/\bdate\s*:\s*\[[^\]]+\]/gi, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function troveRecords(data) {
  const root = data?.response || data || {};
  const zones = Array.isArray(root.zone || root.category) ? (root.zone || root.category) : [root.zone || root.category].filter(Boolean);
  const candidates = [root.records?.article, root.records?.newspaper, root.records?.magazine, root.article, root.newspaper, root.magazine, root.results, ...zones.flatMap((zone) => [zone.records?.article, zone.records?.newspaper, zone.records?.magazine])];
  return candidates.find(Array.isArray) || [];
}

async function fetchGcdPage(shelf, page, options) {
  const query = boundedQuery(options.query || options.extraQuery || shelf.gcdName || 'comic') || 'comic';
  const url = `https://www.comics.org/api/series/name/${encodeURIComponent(query)}/?format=json&page=${page}`;
  const data = await fetchJson(url, options);
  const records = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  const docs = records.map((record) => {
    const id = valueText(record.id || record.api_url || record.name);
    const seriesId = valueText(record.id);
    const locUrl = seriesId ? `https://www.comics.org/series/${encodeURIComponent(seriesId)}/` : 'https://www.comics.org/search/advanced/';
    return {
      source: 'gcd', identifier: `gcd-${id}`, title: `${record.name || query}${record.year_began ? ` (${record.year_began}${record.year_ended ? `–${record.year_ended}` : ''})` : ''}`,
      creator: record.publisher || 'Grand Comics Database', date: record.year_began ? String(record.year_began) : '', subject: ['comics', 'catalog'], format: 'comic',
      cover: httpsUrl(record.cover), locUrl, pages: Array.isArray(record.active_issues) ? record.active_issues.length : 0
    };
  });
  return result(docs, { source: 'gcd', page, pageSize: pageSize(options.pageSize), numFound: numberValue(data?.count) || docs.length });
}

async function fetchTrovePage(shelf, page, options) {
  const key = cleanText(options.troveKey || options.apiKeys?.trove || '', 200);
  if (!key) {
    return result([{ source: 'trove', identifier: 'trove:setup', title: 'Add a Trove API key', creator: 'National Library of Australia · Trove', subject: ['setup', 'newspapers', 'magazines'], format: 'paper', setup: true, locUrl: 'https://trove.nla.gov.au/about/create-something/using-api' }], { source: 'trove', page, pageSize: pageSize(options.pageSize), numFound: 1, partial: true, errors: [{ message: 'Trove API key is not configured', status: null, code: 'missing-key', retryAfter: null }] });
  }
  const size = pageSize(options.pageSize);
  const params = new URLSearchParams({ category: shelf.troveCategory || 'newspaper', include: 'article', encoding: 'json', n: String(size), s: String((page - 1) * size), q: sourceQueryText(shelf.troveQuery || 'newspaper OR magazine OR comic', options) });
  const data = await fetchJson(`https://api.trove.nla.gov.au/v3/result?${params}`, { ...options, headers: { 'X-API-KEY': key, ...(options.headers || {}) } });
  const records = troveRecords(data);
  const docs = records.map((record) => {
    const id = valueText(record.id || record.identifier || record.url || record.troveUrl || record.heading);
    const publication = valueText(record.publicationTitle || record.newspaperTitle || record.journalTitle || record.title || 'Trove');
    const link = valueText(record.troveUrl || record.url || record.link);
    return { source: 'trove', identifier: `trove-${id || publication}`, title: valueText(record.heading || record.articleTitle || record.title || 'Trove article'), creator: publication, publication, date: valueText(record.date || record.dateOfIssue || record.issueDate), issueDate: valueText(record.date || record.dateOfIssue || record.issueDate), subject: ['newspaper', 'periodical'], format: 'paper', locUrl: /^https?:\/\//i.test(link) ? link : `https://trove.nla.gov.au/newspaper/article/${encodeURIComponent(id)}` };
  });
  return result(docs, { source: 'trove', page, pageSize: size, numFound: numberValue(data?.response?.total || data?.response?.records?.total || data?.total) || docs.length });
}

async function fetchDplaPage(shelf, page, options) {
  const key = cleanText(options.dplaKey || options.apiKeys?.dpla || '', 200);
  if (!key) {
    return result([{ source: 'dpla', identifier: 'dpla:setup', title: 'Add a DPLA API key', creator: 'Digital Public Library of America', subject: ['setup', 'periodicals', 'ephemera'], format: 'magazine', setup: true, locUrl: 'https://pro.dp.la/developers/api-codex' }], { source: 'dpla', page, pageSize: pageSize(options.pageSize), numFound: 1, partial: true, errors: [{ message: 'DPLA API key is not configured', status: null, code: 'missing-key', retryAfter: null }] });
  }
  const size = pageSize(options.pageSize);
  const params = new URLSearchParams({ q: sourceQueryText(shelf.dplaQuery || 'magazine OR periodical OR newspaper OR comic', options), page_size: String(size), page: String(page), api_key: key });
  const data = await fetchJson(`https://api.dp.la/v2/items?${params}`, options);
  const docs = (data?.docs || data?.items || []).map((record) => {
    const resource = record.sourceResource || {};
    const id = valueText(record.id || record.identifier || resource.title || 'dpla-item');
    const link = valueText(record.isShownAt || record.source || record.provider);
    return { source: 'dpla', identifier: `dpla-${id}`, title: valueText(resource.title || record.title || 'DPLA item'), creator: valueText(resource.creator || resource.contributor || resource.publisher || 'DPLA'), publication: valueText(resource.publisher || resource.source), date: valueText(resource.date || record.date), issueDate: valueText(resource.date || record.date), subject: list(resource.subject || resource.type || resource.format), format: formatKey(shelf.format || resource.type || resource.format || resource.subject) || 'magazine', cover: httpsUrl(record.object || record.thumbnail || record.objectUrl || record.isShownBy), fullImage: httpsUrl(record.isShownBy || record.object || record.objectUrl), iiifManifest: httpsUrl(record.iiifManifest || record.manifest || record.hasView), locUrl: /^https?:\/\//i.test(link) ? link : `https://dp.la/item/${encodeURIComponent(id)}` };
  });
  return result(docs, { source: 'dpla', page, pageSize: size, numFound: numberValue(data?.count || data?.total || data?.pagination?.total) || docs.length });
}

async function fetchWikimediaPage(shelf, page, options) {
  const size = pageSize(options.pageSize);
  const baseQuery = boundedQuery(shelf.wmQuery || shelf.query || 'comic strip');
  const extra = boundedQuery(options.query || options.extraQuery || '');
  const query = boundedQuery(`${baseQuery} filetype:bitmap${extra ? ` ${extra}` : ''}`);
  const params = new URLSearchParams({ action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: String(size), gsroffset: String(Math.max(0, (page - 1) * size)), prop: 'imageinfo', iiprop: 'url|mime|size', iiurlwidth: '240' });
  const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`, options);
  const pages = data?.query?.pages || {};
  const docs = Object.values(pages).map((item) => {
    const info = item.imageinfo?.[0];
    if (!info) return null;
    const title = String(item.title || '').replace(/^File:/, '');
    return {
      source: 'wikimedia',
      identifier: `wm-${item.pageid || title}`,
      title,
      creator: 'Wikimedia Commons',
      subject: ['public domain', 'image'],
      cover: info.thumburl || info.url,
      fullImage: info.url,
      locUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(item.title || '')}`,
      imagecount: 1,
      pages: 1
    };
  }).filter(Boolean);
  return result(docs, { source: 'wikimedia', page, pageSize: size, numFound: numberValue(data?.query?.searchinfo?.totalhits) || docs.length });
}

async function fetchGoogleBooksPage(shelf, page, options) {
  const size = Math.min(40, pageSize(options.pageSize));
  const query = queryFor(shelf, options, ['gbQuery', 'query']) || 'comics';
  const params = new URLSearchParams({ q: query, filter: 'free-ebooks', printType: 'all', maxResults: String(size), startIndex: String(Math.max(0, (page - 1) * size)) });
  let data;
  try {
    data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params}`, options);
  } catch (error) {
    if (error?.status !== 429) throw error;
    // Google Books' anonymous quota is tiny. Keep the shelf useful by using
    // the matching public-domain/full-text Open Library lane when throttled.
    return fetchOpenLibraryPage({ ...shelf, source: 'openlibrary', olQuery: shelf.gbQuery || 'magazine' }, page, options);
  }
  const docs = (data?.items || []).map((item) => {
    const info = item.volumeInfo || {};
    const access = item.accessInfo || {};
    let cover = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
    if (cover) cover = cover.replace(/^http:/i, 'https:');
    const locUrl = access.webReaderLink || info.previewLink || info.infoLink;
    if (!locUrl) return null;
    return {
      source: 'gbooks',
      identifier: `gb-${item.id}`,
      title: info.title || 'Untitled',
      creator: first(info.authors) || 'Google Books',
      date: String(info.publishedDate || '').slice(0, 4),
      subject: info.categories || ['ebook'],
      cover,
      fullImage: cover,
      locUrl,
      pages: info.pageCount,
      imagecount: info.pageCount
    };
  }).filter(Boolean);
  return result(docs, { source: 'gbooks', page, pageSize: size, numFound: numberValue(data?.totalItems) || docs.length });
}

/**
 * Fetch one bounded page for any shelf from the original Magazine Rack source
 * set. Set `options.deep`/`options.mode: 'scrape'` for IA cursor paging and
 * pass the returned `nextCursor` back as `options.cursor` on the next call.
 */
export async function fetchShelfPage(shelf = {}, page = 1, options = {}) {
  const normalizedPage = pageNumber(page);
  const source = sourceOf(shelf);
  const safeOptions = { ...options, pageSize: pageSize(options.pageSize) };

  return safePage(async () => {
    if (source === 'ia') {
      const scrape = safeOptions.deep === true || safeOptions.mode === 'scrape' || Boolean(safeOptions.cursor || safeOptions.scrapeCursor);
      return scrape ? fetchIaScrape(shelf, normalizedPage, safeOptions) : fetchIaAdvanced(shelf, normalizedPage, safeOptions);
    }
    if (source === 'loc') return fetchLocPage(shelf, normalizedPage, safeOptions, false);
    if (source === 'locsearch') return fetchLocPage(shelf, normalizedPage, safeOptions, true);
    if (source === 'xkcd') return fetchXkcdPage(shelf, normalizedPage, safeOptions);
    if (source === 'openlibrary') return fetchOpenLibraryPage(shelf, normalizedPage, safeOptions);
    if (source === 'olsubjects') return fetchOpenLibrarySubjectsPage(shelf, normalizedPage, safeOptions);
    if (source === 'gcd') return fetchGcdPage(shelf, normalizedPage, safeOptions);
    if (source === 'trove') return fetchTrovePage(shelf, normalizedPage, safeOptions);
    if (source === 'dpla') return fetchDplaPage(shelf, normalizedPage, safeOptions);
    if (source === 'europeana') return fetchEuropeanaPage(shelf, normalizedPage, safeOptions);
    if (source === 'wikimedia') return fetchWikimediaPage(shelf, normalizedPage, safeOptions);
    if (source === 'gbooks') return fetchGoogleBooksPage(shelf, normalizedPage, safeOptions);
    return result([], { source, page: normalizedPage, pageSize: safeOptions.pageSize, partial: true, errors: [{ message: `Unsupported shelf source: ${source}`, status: null, code: 'unsupported-source', retryAfter: null }] });
  }, source);
}
