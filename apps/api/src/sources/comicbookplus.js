import { fetchText } from './request.js';
import { sourceItem } from './common.js';

const BASE = 'https://comicbookplus.com';

const FALLBACK_ITEMS = Object.freeze([
  { sourceId: "102387", title: "Silberpfeil Piccolo 25 - Im Goldenen Eber", creator: "Neymar", pages: 36, viewerBase: "https://comicbookplus.com/viewer/79/7941c56cccf7a0d46a16d4e0a9535f5d" },
  { sourceId: "102386", title: "Silberpfeil Piccolo 24 - Die blonde Tigerin", creator: "Neymar", pages: 36, viewerBase: "https://comicbookplus.com/viewer/31/31cee90b49e731984efc4f3d0e8cd69a" },
  { sourceId: "102385", title: "Silberpfeil Piccolo 23 - Wer ist E.G", creator: "Neymar", pages: 36, viewerBase: "https://comicbookplus.com/viewer/1c/1caa488547d0614591c47a1bcf22d48f" },
  { sourceId: "102384", title: "Animal Comics 13", creator: "Pyramid", pages: 53, viewerBase: "https://comicbookplus.com/viewer/39/396cdf21e2a66404e0584363efb3eeb5" },
  { sourceId: "102383", title: "Foxy Fagan Comics 3", creator: "movielover", pages: 53, viewerBase: "https://comicbookplus.com/viewer/ed/edf911434a44b29b66733222dcd65fb9" },
  { sourceId: "102382", title: "Silberpfeil Piccolo 22 - Die Desperados von Topeka", creator: "Neymar", pages: 36, viewerBase: "https://comicbookplus.com/viewer/80/80a2196cfef319f2e69ce1f48ce31833" },
  { sourceId: "102381", title: "Silberpfeil Piccolo 21 - Vater und Sohn", creator: "Neymar", pages: 36, viewerBase: "https://comicbookplus.com/viewer/d3/d39f5cc408b361b0da530cd314f06650" },
  { sourceId: "102380", title: "Silberpfeil Piccolo 20 - Im Brunnen gefangen", creator: "Neymar", pages: 36, viewerBase: "https://comicbookplus.com/viewer/f6/f6df8a3fed0c77eff3af3ae663b0d657" },
  { sourceId: "102379", title: "Silberpfeil Piccolo 19 - Gold im Grand Canon", creator: "Neymar", pages: 36, viewerBase: "https://comicbookplus.com/viewer/e1/e1d38322cb09fb8d0f4c27ba7f344942" },
  { sourceId: "102378", title: "Silberpfeil Piccolo 18 - Der Sohn des Goldsuchers", creator: "Neymar", pages: 36, viewerBase: "https://comicbookplus.com/viewer/82/828e17224a8ce88024bf7f2f9c1a8fde" },
  { sourceId: "102377", title: "Silberpfeil Piccolo 17 - Der Totentanz", creator: "Neymar", pages: 36, viewerBase: "https://comicbookplus.com/viewer/66/66d1359519c60cb1c5b83d8531a9cf83" },
  { sourceId: "102376", title: "Sweets - Cookbook", creator: "Digital Comic Museum", pages: 36, viewerBase: "https://comicbookplus.com/viewer/52/52e771e086e7a53691157e769395fba1" },
  { sourceId: "102375", title: "Pep Comics 19", creator: "Secret Scanp", pages: 68, viewerBase: "https://comicbookplus.com/viewer/9f/9f96f75e8b3ecb92e78e852eaf4d1f63" },
  { sourceId: "102374", title: "Hello Buddies 34", creator: "comicscastle", pages: 68, viewerBase: "https://comicbookplus.com/viewer/55/5517543c757437aad9010384efbe1e6d" },
  { sourceId: "102373", title: "True Love Problems and Advice Illustrated 37", creator: "lyzardegod", pages: 36, viewerBase: "https://comicbookplus.com/viewer/97/97a6a8ae7dd165a77bf942da321ef0b5" },
  { sourceId: "102372", title: "True Love Problems and Advice Illustrated 40", creator: "lyzardegod", pages: 36, viewerBase: "https://comicbookplus.com/viewer/4d/4dc045eed6c817e29c3ca21406085084" },
  { sourceId: "102371", title: "Pep Comics 18", creator: "Secret Scanp", pages: 68, viewerBase: "https://comicbookplus.com/viewer/66/669f0820b1c48c22fe0d0f70e14f7c0a" },
  { sourceId: "102370", title: "Judge 1730", creator: "darwination", pages: 25, viewerBase: "https://comicbookplus.com/viewer/13/1342f013cf1d8683f770a126dad18bb0" },
  { sourceId: "102369", title: "Judge 2288", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/36/361d151be1a55b4b988c9da84a6264d3" },
  { sourceId: "102368", title: "Judge 2299", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/b9/b9c1b94b25dcf1a30a90c3950d955014" },
  { sourceId: "102367", title: "Judge 1502", creator: "darwination", pages: 15, viewerBase: "https://comicbookplus.com/viewer/f3/f3e3203a30834dffb1e7a7faa4e183d4" },
  { sourceId: "102366", title: "Judge 2211", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/56/561f35a4187cf53b6613060f09509af5" },
  { sourceId: "102365", title: "Judge 2285", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/28/282da698e621b92e0db15b7e4c7ef82a" },
  { sourceId: "102364", title: "Judge 1728", creator: "darwination", pages: 25, viewerBase: "https://comicbookplus.com/viewer/d1/d194dc0080bd68082fc2bf048941eb06" },
  { sourceId: "102363", title: "Judge 1726", creator: "darwination", pages: 24, viewerBase: "https://comicbookplus.com/viewer/4a/4a6d8ab36c725c8234488bb1fc1b9715" },
  { sourceId: "102362", title: "Judge 1501", creator: "darwination", pages: 15, viewerBase: "https://comicbookplus.com/viewer/1d/1de70cf1f99d9df9383b4e9db69f1659" },
  { sourceId: "102361", title: "Judge 2008", creator: "darwination", pages: 37, viewerBase: "https://comicbookplus.com/viewer/9b/9b56a7bb1041cce4a977e996d90d82bf" },
  { sourceId: "102360", title: "Judge 2307", creator: "darwination", pages: 37, viewerBase: "https://comicbookplus.com/viewer/ed/ed077481c28bff9b587584ce90b8ee99" },
  { sourceId: "102359", title: "Judge 2295", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/dc/dcfa70e96fc043372c023b540e1c0ec9" },
  { sourceId: "102356", title: "Judge 2292", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/d7/d76fc4b09ecec9647534107470b8cd4c" },
  { sourceId: "102355", title: "Judge 2508", creator: "darwination", pages: 37, viewerBase: "https://comicbookplus.com/viewer/dd/dd2cece4cff8fc80ff32d41759702ee7" },
  { sourceId: "102354", title: "Judge 2244", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/03/03442d54fb2f92a41d460cb0f70f0394" },
  { sourceId: "102353", title: "Judge 2287", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/d1/d194b82d2ce90e164cc2db7484137c4c" },
  { sourceId: "102352", title: "Judge 2298", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/b1/b1edc177cf78fcf5bcd900d4e4133887" },
  { sourceId: "102350", title: "Judge 2293", creator: "darwination", pages: 37, viewerBase: "https://comicbookplus.com/viewer/80/805ab86e235d58819c5fdf6c384e24ca" },
  { sourceId: "102349", title: "Judge 2289", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/25/259855aa79de591cdb02886798a615e1" },
  { sourceId: "102348", title: "Judge 2590", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/b2/b24142d56e69f9b1e980d59cb2f1210f" },
  { sourceId: "102347", title: "Judge 2294", creator: "darwination", pages: 35, viewerBase: "https://comicbookplus.com/viewer/3c/3cf22f019e29f85410512a781a405905" },
  { sourceId: "102346", title: "Judge 2306", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/69/691ec82ef8e3c66e4bbb38478749e663" },
  { sourceId: "102344", title: "Judge 1726", creator: "darwination", pages: 25, viewerBase: "https://comicbookplus.com/viewer/6f/6fb18ee69f51e584e522cbebc0ae8609" },
  { sourceId: "102342", title: "Judge 2286", creator: "darwination", pages: 36, viewerBase: "https://comicbookplus.com/viewer/8c/8c573e93512bc054aa0bac6c10805138" },
  { sourceId: "102341", title: "The Popular Book of Girls' Stories 1935", creator: "Aldridge Prior", pages: 202, viewerBase: "https://comicbookplus.com/viewer/87/87d0acacb63a1e22ea139e09a4b559ec" },
  { sourceId: "102340", title: "The Funny Wonder 1062", creator: "Aldridge Prior", pages: 7, viewerBase: "https://comicbookplus.com/viewer/95/9512f026a32af16b141a5c4df3da1c03" },
  { sourceId: "102339", title: "The Spirit 1951-04-08 - Star Ledger", creator: "movielover", pages: 8, viewerBase: "https://comicbookplus.com/viewer/f5/f5072fc13058e6b26cfb75307aad7325" },
  { sourceId: "102338", title: "The City of Coral", creator: "Arten", pages: 12, viewerBase: "https://comicbookplus.com/viewer/3f/3fbb7dc7c143ee827912bca568320748" },
  { sourceId: "102337", title: "The Adventures of Peter Wheat 51", creator: "movielover", pages: 17, viewerBase: "https://comicbookplus.com/viewer/10/10d22f959eccda5deacc3eb0bd92e7b5" },
  { sourceId: "102336", title: "Journey Planet 95", creator: "journey Planet/paw broon", pages: 155, viewerBase: "https://comicbookplus.com/viewer/a0/a088a0cb39d1d049753a45e841c90250" },
  { sourceId: "102335", title: "Journey Planet 96", creator: "Journey Planet/paw broon", pages: 123, viewerBase: "https://comicbookplus.com/viewer/83/8363f7c8d96a51e6d1cca909725a2a4d" },
  { sourceId: "102334", title: "Silberpfeil Piccolo 16 - Die Furt", creator: "Neymar", pages: 36, viewerBase: "https://comicbookplus.com/viewer/d1/d12ea352cfd29e1ed804e254c0411fa8" },
  { sourceId: "102333", title: "Silberpfeil Piccolo 15 - Der rote Tim", creator: "Neymar", pages: 36, viewerBase: "https://comicbookplus.com/viewer/37/37e319eb127154f897963937cafb7984" },
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
