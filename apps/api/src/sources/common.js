import { clean } from '../http.js';

export const SOURCE_LABELS = Object.freeze({ archive: 'Internet Archive', loc: 'Library of Congress', openlibrary: 'Open Library', europeana: 'Europeana', gcd: 'Grand Comics Database', dpla: 'Digital Public Library of America' });

const URL_POLICIES = Object.freeze({
  archive: {
    source: [['archive.org', '/details/'], ['www.archive.org', '/details/']],
    reader: [['archive.org', '/embed/'], ['www.archive.org', '/embed/']],
    cover: [['archive.org', '/services/img/'], ['www.archive.org', '/services/img/']],
  },
  loc: {
    source: [['www.loc.gov', '/'], ['loc.gov', '/']],
    reader: [['www.loc.gov', '/'], ['loc.gov', '/']],
    cover: [['www.loc.gov', '/'], ['loc.gov', '/'], ['tile.loc.gov', '/']],
  },
  openlibrary: {
    source: [['openlibrary.org', '/'], ['www.openlibrary.org', '/']],
    reader: [['openlibrary.org', '/'], ['www.openlibrary.org', '/'], ['archive.org', '/embed/'], ['www.archive.org', '/embed/']],
    cover: [['covers.openlibrary.org', '/b/id/']],
  },
  gcd: {
    source: [['www.comics.org', '/series/'], ['www.comics.org', '/search/']],
    reader: [['www.comics.org', '/series/'], ['www.comics.org', '/search/']],
    cover: [['www.comics.org', '/']],
  },
  dpla: {
    source: [['dp.la', '/item/'], ['www.dp.la', '/item/'], ['pro.dp.la', '/']],
    reader: [['dp.la', '/item/'], ['www.dp.la', '/item/'], ['pro.dp.la', '/']],
    cover: [['images.dp.la', '/'], ['dp.la', '/'], ['www.dp.la', '/']],
  },
});

export function asText(value, max = 500) {
  if (Array.isArray(value)) return value.map((entry) => asText(entry, max)).filter(Boolean).join(', ').slice(0, max);
  if (value && typeof value === 'object') return clean('value' in value ? value.value : Object.values(value).map((entry) => asText(entry, max)).filter(Boolean).join(', '), max);
  return clean(value, max);
}

export function yearText(value) {
  const text = asText(value, 32);
  return text.match(/\b\d{4}\b/)?.[0] || text;
}

export function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

export function inferGenre(value) {
  const text = asText(value, 700).toLowerCase();
  if (/comic|cartoon|graphic|funny/.test(text)) return 'Comics';
  if (/science|scientific|popular science/.test(text)) return 'Science';
  if (/motor|auto|car|aviation|technology/.test(text)) return 'Technology';
  if (/music|jazz|band|song/.test(text)) return 'Music';
  if (/film|movie|photoplay/.test(text)) return 'Film';
  if (/newspaper/.test(text)) return 'Newspapers';
  return 'Periodicals';
}

function encodeId(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export function decodeId(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function safeExternalUrl(value, source, kind) {
  const candidate = String(value || '');
  if (!candidate) return '';
  let parsed;
  try { parsed = new URL(candidate); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.hash) return '';
  const policies = URL_POLICIES[source]?.[kind] || [];
  return policies.some(([host, prefix]) => parsed.hostname === host && parsed.pathname.startsWith(prefix)) ? parsed.toString() : '';
}

function metadataProjection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 24).map(([key, entry]) => [clean(key, 80), asText(entry, 240)]).filter(([key, entry]) => key && entry));
}

export function sourceItem(source, sourceId, fields) {
  const stableSourceId = clean(sourceId, 180);
  const sourceUrl = safeExternalUrl(fields.sourceUrl, source, 'source');
  return {
    id: `${source}:${encodeId(stableSourceId)}`,
    source,
    sourceName: SOURCE_LABELS[source],
    sourceId: stableSourceId,
    title: clean(fields.title, 240),
    creator: clean(fields.creator, 180),
    year: yearText(fields.year),
    genre: clean(fields.genre || 'Periodicals', 80),
    description: clean(fields.description, 900),
    coverUrl: safeExternalUrl(fields.coverUrl, source, 'cover'),
    sourceUrl,
    readerUrl: safeExternalUrl(fields.readerUrl || fields.sourceUrl, source, 'reader') || sourceUrl,
    pageCount: numberOrZero(fields.pageCount),
    observedAt: new Date().toISOString(),
    metadata: metadataProjection(fields.metadata),
  };
}
