import { fetchText } from './request.js';
import { sourceItem } from './common.js';

const BASE = 'https://comicbookplus.com';

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
  const html = await fetchText(url, env, 'comicbookplus');
  const items = parseBooks(html);
  return { total: 49_000, items, page: currentPage };
}

export { parseBooks };
