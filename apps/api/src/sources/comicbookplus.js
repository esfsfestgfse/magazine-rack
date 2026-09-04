import { fetchText } from './request.js';
import { sourceItem } from './common.js';

const BASE = 'https://comicbookplus.com';

const FALLBACK_ITEMS = Object.freeze([
  { sourceId: '102387', title: 'Silberpfeil Piccolo 25 - Im Goldenen Eber', creator: 'Neymar', pages: 36, viewerBase: 'https://comicbookplus.com/viewer/79/7941c56cccf7a0d46a16d4e0a9535f5d' },
  { sourceId: '102386', title: 'Silberpfeil Piccolo 24 - Die blonde Tigerin', creator: 'Neymar', pages: 36, viewerBase: 'https://comicbookplus.com/viewer/31/31cee90b49e731984efc4f3d0e8cd69a' },
  { sourceId: '102385', title: 'Silberpfeil Piccolo 23 - Wer ist E.G', creator: 'Neymar', pages: 36, viewerBase: 'https://comicbookplus.com/viewer/1c/1caa488547d0614591c47a1bcf22d48f' },
  { sourceId: '102384', title: 'Animal Comics 13', creator: 'Pyramid', pages: 53, viewerBase: 'https://comicbookplus.com/viewer/39/396cdf21e2a66404e0584363efb3eeb5' },
  { sourceId: '102383', title: 'Foxy Fagan Comics 3', creator: 'movielover', pages: 53, viewerBase: 'https://comicbookplus.com/viewer/ed/edf911434a44b29b66733222dcd65fb9' },
  { sourceId: '102382', title: 'Silberpfeil Piccolo 22 - Die Desperados von Topeka', creator: 'Neymar', pages: 36, viewerBase: 'https://comicbookplus.com/viewer/80/80a2196cfef319f2e69ce1f48ce31833' },
].map((entry) => sourceItem('comicbookplus', entry.sourceId, {
  title: entry.title,
  creator: entry.creator,
  genre: 'Comics',
  coverUrl: `${entry.viewerBase}/mediumthumb.jpg`,
  sourceUrl: `${BASE}/?dlid=${entry.sourceId}`,
  readerUrl: `${BASE}/?dlid=${entry.sourceId}`,
  pageCount: entry.pages,
  metadata: { viewerBase: entry.viewerBase, pageCount: entry.pages, provider: 'Comic Book Plus', fallback: true },
})));

function fallbackPage(page) {
  return { total: FALLBACK_ITEMS.length, items: page === 1 ? FALLBACK_ITEMS : [], page, partial: true, stale: true };
}

function htmlText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/\s+/g, ' ').trim();
}

function attr(block, name) {
  const match = String(block || '').match(new RegExp(`itemprop=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'));
  return htmlText(match?.[1] || '');
}

function tagText(block, name) {
  const match = String(block || '').match(new RegExp(`itemprop=["']${name}["'][^>]*>([\\s\\S]*?)<\\/`, 'i'));
  return htmlText(match?.[1] || '');
}

function pageNumber(value) {
  const number = Number.parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(number) && number > 0 ? Math.min(number, 1_000) : 0;
}

function pageIndexUrl(url) {
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get('dlid');
    return id ? `${BASE}/?dlid=${encodeURIComponent(id)}` : '';
  } catch {
    return '';
  }
}

function parseBooks(html) {
  const source = String(html || '');
  const markers = [...source.matchAll(/<meta[^>]+itemprop=["']discussionUrl["'][^>]+>/gi)];
  return markers.map((marker, index) => {
    const block = source.slice(marker.index, markers[index + 1]?.index || source.length);
    const discussionUrl = attr(block, 'discussionUrl');
    const sourceUrl = pageIndexUrl(discussionUrl);
    const thumbnail = attr(block, 'thumbnailUrl');
    const title = tagText(block, 'name') || attr(block, 'name');
    const pages = pageNumber(attr(block, 'numberOfPages') || tagText(block, 'numberOfPages'));
    if (!sourceUrl || !title || !thumbnail || !/^https:\/\/comicbookplus\.com\/viewer\//i.test(thumbnail)) return null;
    const viewerBase = thumbnail.replace(/\/(?:mediumthumb|largethumb)\.jpg(?:[?#].*)?$/i, '');
    if (!viewerBase || viewerBase === thumbnail) return null;
    return sourceItem('comicbookplus', new URL(sourceUrl).searchParams.get('dlid') || title, {
      title,
      creator: attr(block, 'contributor') || 'Comic Book Plus',
      year: attr(block, 'dateModified'),
      genre: attr(block, 'genre') || 'Comics',
      description: tagText(block, 'description'),
      coverUrl: thumbnail,
      sourceUrl,
      readerUrl: sourceUrl,
      pageCount: pages,
      metadata: { viewerBase, pageCount: pages, provider: 'Comic Book Plus' },
    });
  }).filter(Boolean);
}

export async function fetchComicBookPlus({ page = 1 }, env) {
  const currentPage = Math.max(1, Math.min(30, Number(page) || 1));
  const url = `${BASE}/?cbplus=latestuploads_l_s_${currentPage - 1}`;
  let html;
  try {
    html = await fetchText(url, env, 'comicbookplus', {
      headers: {
        Referer: `${BASE}/`,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } catch {
    return fallbackPage(currentPage);
  }
  const items = parseBooks(html);
  return items.length ? { total: 49_000, items, page: currentPage } : fallbackPage(currentPage);
}

export { parseBooks };
