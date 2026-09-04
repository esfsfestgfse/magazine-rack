import { fetchShelfPage, monthDayKey } from './live-sources.js';
import { ADULT_EXCLUDE, SHELVES, isAdultDoc, isAdultShelfId, isMangaDoc } from './shelf-catalog.js';
import { SEED_ITEMS } from './data.js';
import { store } from './store.js';
import { hasConfiguredApi, removeLibraryItem, saveLibraryItem, searchCatalog, syncLibrary } from './api.js';

const app = document.querySelector('#app');
const ROWS_PER_PAGE = 30;
const MAX_ACTIVE_LOADS = 5;
const IMAGE_SOURCES = new Set(['loc', 'locsearch', 'xkcd', 'europeana', 'wikidata', 'met']);
const ERA_FILTERS = [
  ['All eras', ''], ['1890s', '1890-01-01 TO 1899-12-31'], ['1900s', '1900-01-01 TO 1909-12-31'],
  ['1910s', '1910-01-01 TO 1919-12-31'], ['1920s', '1920-01-01 TO 1929-12-31'], ['1930s', '1930-01-01 TO 1939-12-31'],
  ['1940s', '1940-01-01 TO 1949-12-31'], ['WWII', '1941-01-01 TO 1945-12-31'], ['1950s', '1950-01-01 TO 1959-12-31'],
  ['1960s', '1960-01-01 TO 1969-12-31'], ['1970s', '1970-01-01 TO 1979-12-31'], ['1980s', '1980-01-01 TO 1989-12-31'],
  ['1990s', '1990-01-01 TO 1999-12-31'], ['2000s', '2000-01-01 TO 2009-12-31'], ['2010s+', '2010-01-01 TO 2029-12-31']
];
const state = {
  view: 'racks', query: '', decade: '', wall: store.getPrefs().wall, showRackMenu: false,
  notice: '', modal: null, reader: null, search: { docs: [], total: 0, loading: false, error: '' },
  racks: new Map(), queue: [], activeLoads: 0, observer: null,
};

const icon = (name) => {
  const paths = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
    stack: '<path d="M4 7.5 12 4l8 3.5L12 11 4 7.5Z"/><path d="m4 12.5 8 3.5 8-3.5M4 17.5l8 3 8-3"/>',
    bookmark: '<path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V22l-6-4-6 4V4.5Z"/>',
    shuffle: '<path d="M16 3h5v5M4 20 21 3M4 4l5 5m3 6 3 3h6v-5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3L3 11"/><path d="M3 5v6h6M4 13a8 8 0 0 0 14.9 3L21 13M21 19v-6h-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    close: '<path d="m5 5 14 14M19 5 5 19"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    list: '<path d="M5 6h14M5 12h14M5 18h14"/><circle cx="3" cy="6" r=".7"/><circle cx="3" cy="12" r=".7"/><circle cx="3" cy="18" r=".7"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19 13 .1-1-.1-1 2-1.5-2-3.4-2.3.9a8.6 8.6 0 0 0-1.7-1L14.7 3h-4l-.4 2a8.6 8.6 0 0 0-1.7 1l-2.3-.9-2 3.4L6.3 10l-.1 1 .1 1-2 1.5 2 3.4 2.3-.9a8.6 8.6 0 0 0 1.7 1l.4 2h4l.4-2a8.6 8.6 0 0 0 1.7-1l2.3.9 2-3.4L19 13Z"/>',
    sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`;
};

function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function safeUrl(value) { try { const url = new URL(value || '', window.location.href); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
function idOf(doc) { return doc?.identifier || doc?.id || ''; }
function titleOf(doc) { return doc?.title || 'Untitled issue'; }
function yearOf(doc) { return String(doc?.date || doc?.year || '').slice(0, 10); }
function sourceLabel(source = '') { return ({ ia: 'Internet Archive', archive: 'Internet Archive', loc: 'Library of Congress', locsearch: 'Library of Congress', openlibrary: 'Open Library', olsubjects: 'Open Library', europeana: 'Europeana', comicbookplus: 'Comic Book Plus', gbooks: 'Google Books', gcd: 'Grand Comics Database', dpla: 'Digital Public Library of America', xkcd: 'xkcd' }[source] || source || 'Public collection'); }
function sourceClass(source = '') { return `source-${String(source).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'ia'}`; }
function hashNumber(value = '') { return [...String(value)].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7); }
function normalizedDoc(doc = {}) { return { ...doc, identifier: idOf(doc), title: titleOf(doc), creator: Array.isArray(doc.creator) ? doc.creator[0] || '' : doc.creator || '', date: doc.date || doc.year || '', subject: Array.isArray(doc.subject) ? doc.subject : [], source: doc.source || 'ia', cover: doc.cover || '', sourceUrl: doc.sourceUrl || doc.locUrl || '' }; }
function sourceUrl(doc) { const id = idOf(doc); return safeUrl(doc.sourceUrl || doc.locUrl || (doc.source === 'ia' && id ? `https://archive.org/details/${encodeURIComponent(id)}` : '') || (doc.source === 'openlibrary' && id ? `https://openlibrary.org/books/${encodeURIComponent(id)}` : '')) || '#'; }
function readerUrl(doc) { const id = idOf(doc); return safeUrl(doc.readerUrl) || (doc.source === 'ia' && id ? `https://archive.org/embed/${encodeURIComponent(id)}?ui=full` : '') || (doc.source === 'openlibrary' && doc.iaId ? `https://archive.org/embed/${encodeURIComponent(doc.iaId)}?ui=full` : '') || sourceUrl(doc); }
function isReadable(doc) { return Boolean(doc.readerUrl || (doc.source === 'ia' && idOf(doc) && !String(idOf(doc)).startsWith('seed-')) || doc.iaId || doc.fullImage || doc.locUrl); }
function mergeSavedDoc(item) {
  if (!item) return null;
  const id = idOf(item);
  const known = [...state.search.docs, ...[...state.racks.values()].flatMap((rack) => rack.docs), ...seedDocs()].find((doc) => idOf(doc) === id);
  if (!known) return item;
  const looksLikeId = !item.title || item.title === id || item.title === item.id;
  return { ...known, ...item, title: looksLikeId ? known.title : item.title, creator: item.creator || known.creator, date: item.year || item.date || known.date, cover: item.cover || known.cover, source: item.source || known.source, sourceUrl: item.sourceUrl || known.sourceUrl, readerUrl: item.readerUrl || known.readerUrl, description: item.description || known.description, subject: item.subject?.length ? item.subject : known.subject, pages: item.pages || known.pages };
}

function seedDocs() { return SEED_ITEMS.map((item) => normalizedDoc({ identifier: item.id, title: item.title, creator: item.creator, date: item.year, subject: [item.genre], source: item.source === 'Library of Congress' ? 'loc' : item.source === 'Open Library' ? 'openlibrary' : 'ia', cover: item.cover, sourceUrl: item.sourceUrl, readerUrl: item.readerUrl, description: item.description, pages: item.pages })); }

async function hydrateRemoteLibrary() {
  if (!hasConfiguredApi()) return;
  const key = store.getLibraryKey();
  if (!key) return;
  const result = await syncLibrary(key);
  if (Array.isArray(result?.items) && result.items.length) store.mergeSaved(result.items);
}

function syncRemoteLibrary(operation) {
  if (!hasConfiguredApi()) return;
  const key = store.getLibraryKey();
  if (!key) return;
  operation(key).catch(() => setNotice('Saved on this device; cloud sync is unavailable.'));
}

function rackState(shelf) { if (!state.racks.has(shelf.id)) state.racks.set(shelf.id, { docs: [], page: 0, total: 0, cursor: null, hasMore: true, loading: false, error: '', loaded: false, fallback: false }); return state.racks.get(shelf.id); }
function fallbackDocsForShelf(shelf) {
  const docs = seedDocs();
  const range = String(state.decade || '').split(/\s+TO\s+/i).map((value) => Number(value.slice(0, 4)) || 0);
  const eraDocs = range.length === 2 && range[0] && range[1]
    ? docs.filter((doc) => { const year = Number(yearOf(doc).slice(0, 4)); return year >= range[0] && year <= range[1]; })
    : docs;
  if (state.decade && !eraDocs.length) return [];
  const pool = eraDocs.length ? eraDocs : docs;
  const offset = hashNumber(shelf.id) % pool.length;
  return pool.map((_, index) => pool[(offset + index) % pool.length]).slice(0, 8).map((doc) => ({ ...doc, fallback: true }));
}
function isHidden(shelf) { return Boolean(store.getPrefs().hidden?.[shelf.id]); }
function isPinned(shelf) { return Boolean(store.getPrefs().pinned?.[shelf.id]); }
function visibleShelves() { return SHELVES.filter((shelf) => !isHidden(shelf)); }
function orderedShelves() { return [...visibleShelves()].sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)) || SHELVES.indexOf(a) - SHELVES.indexOf(b)); }

function coverMarkup(doc, index = 0) {
  const item = normalizedDoc(doc);
  const id = idOf(item);
  const cover = safeUrl(item.cover || (item.source === 'ia' && id ? `https://archive.org/services/img/${encodeURIComponent(id)}` : ''));
  const year = yearOf(item);
  const pages = Number(item.imagecount || item.pages || 0) || 0;
  const hue = hashNumber(id || titleOf(item)) % 360;
  const saved = store.isSaved(id);
  const fallback = `<div class="cover-fallback" style="--cover-hue:${hue};--cover-tilt:${(hashNumber(titleOf(item)) % 5) - 2}deg"><span>${escapeHtml((item.genre || item.subject?.[0] || 'ISSUE').toString().toUpperCase())}</span><strong>${escapeHtml(titleOf(item))}</strong><small>${escapeHtml(year || 'PUBLIC EDITION')}</small><i></i></div>`;
  return `<article class="cover-card" data-action="open" data-id="${escapeHtml(id)}" tabindex="0" aria-label="Open ${escapeHtml(titleOf(item))}"><div class="cover-visual" style="--cover-hue:${hue}">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" onerror="this.remove();this.nextElementSibling.hidden=false">` : ''}${fallback.replace('<div class="cover-fallback"', `<div class="cover-fallback"${cover ? ' hidden' : ''}`)}<span class="cover-source ${sourceClass(item.source)}">${escapeHtml(sourceLabel(item.source))}</span>${year || pages ? `<span class="cover-badge">${escapeHtml([year, pages ? `${pages}p` : ''].filter(Boolean).join(' · '))}</span>` : ''}<button class="cover-save ${saved ? 'saved' : ''}" data-action="save" data-id="${escapeHtml(id)}" aria-label="${saved ? 'Remove from' : 'Save to'} library">${icon('bookmark')}</button></div><div class="cover-caption"><h3>${escapeHtml(titleOf(item))}</h3><p>${escapeHtml(sourceLabel(item.source))}<span>•</span>${escapeHtml(year || 'Undated')}</p></div></article>`;
}

function railMarkup() { return '<div class="rack-rail"><span></span><span></span><span></span></div>'; }
function shelfMarkup(shelf, index) {
  const current = rackState(shelf);
  const docs = current.docs.length ? current.docs : (!current.loaded && index === 0 ? seedDocs().slice(0, 8) : []);
  const adult = isAdultShelfId(shelf.id);
  const cards = docs.map((doc, cardIndex) => coverMarkup(doc, cardIndex)).join('');
  const status = current.loading ? 'Loading…' : current.fallback ? `${current.docs.length} preview covers` : current.error ? 'Unavailable' : current.total ? `${Math.min(current.total, 999999).toLocaleString()} found` : current.loaded ? 'No results' : 'Ready to load';
  const description = shelf.newspaperDateMode === 'month-day' ? `${shelf.description || rackDescription(shelf)} · ${newspaperDateLabel()}` : (shelf.description || rackDescription(shelf));
  return `<section class="rack ${adult ? 'adult-rack' : ''}" id="rack-${escapeHtml(shelf.id)}" data-rack-id="${escapeHtml(shelf.id)}" data-index="${index}"><div class="rack-header"><div class="rack-kicker"><span>${String(index + 1).padStart(2, '0')}</span><i></i>${adult ? 'RESTRICTED EDITION' : 'LIVE COLLECTION'}</div><div class="rack-title-row"><div><h2>${escapeHtml(shelf.title)}</h2><p>${escapeHtml(description)}</p></div><div class="rack-actions"><span class="rack-count">${escapeHtml(status)}</span><button class="rack-icon ${isPinned(shelf) ? 'active' : ''}" data-action="pin" data-id="${escapeHtml(shelf.id)}" aria-label="${isPinned(shelf) ? 'Unpin' : 'Pin'} ${escapeHtml(shelf.title)}">${isPinned(shelf) ? '★' : '☆'}</button><button class="rack-icon" data-action="refresh-rack" data-id="${escapeHtml(shelf.id)}" aria-label="Refresh ${escapeHtml(shelf.title)}">${icon('refresh')}</button></div></div></div><div class="rack-track" id="track-${escapeHtml(shelf.id)}">${current.loading && !cards ? loadingCards() : cards || (current.error ? `<div class="rack-state error-state"><strong>Rack asleep</strong><span>${escapeHtml(current.error)}</span><button data-action="refresh-rack" data-id="${escapeHtml(shelf.id)}">Try again</button></div>` : current.loaded ? '<div class="rack-state"><strong>Nothing on this shelf yet.</strong><span>Try refreshing this collection.</span></div>' : loadingCards(5))}</div>${railMarkup()}${current.hasMore && current.loaded ? `<button class="rack-more" data-action="load-more" data-id="${escapeHtml(shelf.id)}">Load more issues ${icon('arrow')}</button>` : ''}</section>`;
}
function newspaperDateLabel() { const [month, day] = monthDayKey().split('-'); return month && day ? `newspapers dated ${month}/${day} across years` : 'newspapers matched by calendar day'; }
function rackDescription(shelf) { return shelf.source ? `${sourceLabel(shelf.source)} · live feed` : 'Deep search across the Internet Archive'; }
function loadingCards(count = 5) { return Array.from({ length: count }, (_, index) => `<div class="skeleton-cover" style="--delay:${index * 70}ms"><span></span></div>`).join(''); }

function topbar() {
  const count = store.getLibrary().length;
  return `<header class="topbar"><div class="mobile-brand"><span class="brand-badge">MR</span><strong>MAGAZINE<br>RACK</strong></div><form class="search-form" role="search"><span class="search-icon">${icon('search')}</span><input id="global-search" name="q" value="${escapeHtml(state.query)}" placeholder="Search every shelf…" autocomplete="off"><kbd>⌘ K</kbd><button type="submit">Search</button></form><div class="top-actions"><span class="live-status"><i></i> LIVE / ${SHELVES.length} RACKS</span><button class="top-icon" data-action="random" aria-label="Surprise me">${icon('shuffle')}</button><button class="top-icon" data-action="toggle-racks" aria-label="Manage racks">${icon('settings')}</button><button class="top-library" data-action="navigate" data-view="library">${icon('bookmark')}<span>Library</span>${count ? `<b>${count}</b>` : ''}</button></div></header>`;
}

function sideRail() {
  const libraryCount = store.getLibrary().length;
  return `<aside class="side-rail"><a class="wordmark" href="#/racks"><span class="wordmark-mark">M</span><span><strong>MAGAZINE<br>RACK</strong><small>PUBLIC EDITIONS / 01</small></span></a><div class="rail-rule"></div><nav class="main-nav" aria-label="Primary"><a class="nav-item ${state.view === 'racks' ? 'active' : ''}" href="#/racks">${icon('stack')}<span>All racks</span><em>${SHELVES.length}</em></a><a class="nav-item ${state.view === 'wall' ? 'active' : ''}" href="#/wall">${icon('grid')}<span>Cover wall</span></a><a class="nav-item ${state.view === 'library' ? 'active' : ''}" href="#/library">${icon('bookmark')}<span>My library</span>${libraryCount ? `<em>${libraryCount}</em>` : ''}</a></nav><div class="rail-rule"></div><div class="rail-label">JUMP TO A RACK</div><div class="jump-list">${visibleShelves().slice(0, 13).map((shelf) => `<a href="#rack-${escapeHtml(shelf.id)}">${escapeHtml(shelf.title)}</a>`).join('')}</div><div class="rail-bottom"><button class="rail-button" data-action="about">${icon('sun')}<span>About the rack</span></button><button class="rail-button" data-action="export">${icon('external')}<span>Export library</span></button></div></aside>`;
}

function rackManager() {
  if (!state.showRackMenu) return '';
  return `<div class="rack-manager"><div><span class="eyebrow">CONTROL ROOM</span><h2>Choose your shelves</h2><p>Pin the racks you love. Hide the ones you’ll never browse.</p></div><div class="manager-actions"><button data-action="toggle-wall">${state.wall ? icon('list') : icon('grid')} ${state.wall ? 'Racks view' : 'Cover wall'}</button><button data-action="close-racks">${icon('close')} Close</button></div><div class="rack-toggles">${SHELVES.map((shelf, index) => `<button class="rack-toggle ${isHidden(shelf) ? 'off' : 'on'} ${isAdultShelfId(shelf.id) ? 'adult-toggle' : ''}" data-action="toggle-rack" data-id="${escapeHtml(shelf.id)}"><span>${String(index + 1).padStart(2, '0')}</span>${escapeHtml(shelf.title)}${isPinned(shelf) ? ' ★' : ''}</button>`).join('')}</div></div>`;
}

function masthead() {
  const featured = seedDocs()[hashNumber(new Date().toDateString()) % seedDocs().length];
  return `<section class="masthead"><div class="masthead-copy"><div class="issue-line"><span>THE OPEN STACKS</span><span>ISSUE 01 / 2026</span></div><h1>Find your<br><i>next obsession.</i></h1><p>A living rack of magazines, comics, newspapers, zines, and beautifully strange things from public collections.</p><div class="masthead-buttons"><a class="primary-button" href="#rack-magazine-rack">Start browsing ${icon('arrow')}</a><button class="ghost-button" data-action="random">Surprise me ${icon('shuffle')}</button></div><div class="masthead-stats"><span><b>${SHELVES.length}</b> live racks</span><span><b>8</b> source feeds</span><span><b>∞</b> rabbit holes</span></div></div><div class="masthead-art"><div class="burst burst-one"></div><div class="burst burst-two"></div><div class="hero-cover cover-fallback" style="--cover-hue:${hashNumber(featured.title) % 360}"><span>FEATURED ISSUE</span><strong>${escapeHtml(titleOf(featured))}</strong><small>${escapeHtml(yearOf(featured) || 'PUBLIC ARCHIVE')}</small><i></i></div><div class="hero-cover secondary-cover cover-fallback" style="--cover-hue:${(hashNumber(featured.title) + 80) % 360}"><span>OPEN EDITION</span><strong>THE<br>WANDERER</strong><small>NO. 04</small><i></i></div><div class="price-tag">FREE<br><b>TO READ</b></div></div></section>`;
}

function continueSection() {
  const history = store.getHistory();
  if (!history.length) return '';
  return `<section class="continue-strip"><div class="strip-heading"><div><span class="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Continue reading</h2></div><span>${history.length} recent</span></div><div class="mini-track">${history.slice(0, 8).map((doc, index) => coverMarkup(doc, index)).join('')}</div></section>`;
}

function eraChips() { return `<div class="era-chips" aria-label="Filter by era">${ERA_FILTERS.map(([label, value]) => `<button class="era-chip ${state.decade === value ? 'active' : ''}" data-action="set-decade" data-decade="${escapeHtml(value)}">${escapeHtml(label)}</button>`).join('')}</div>`; }
function racksView() {
  const shelves = orderedShelves();
  return `<div class="view racks-view">${masthead()}${continueSection()}<div class="rack-intro"><div><span class="eyebrow">THE NEWSSTAND</span><h2>Browse the whole rack</h2><p>Every row is live. Scroll sideways, then keep going down.</p></div><div class="rack-intro-tools"><span class="data-note"><i></i> Public source feeds</span><button data-action="toggle-wall">${icon('grid')} Cover wall</button></div></div>${eraChips()}<div class="jump-chips">${visibleShelves().slice(0, 18).map((shelf) => `<a href="#rack-${escapeHtml(shelf.id)}">${escapeHtml(shelf.title)}</a>`).join('')}</div><div class="racks-list">${shelves.map((shelf, index) => shelfMarkup(shelf, index)).join('')}</div></div>`;
}

function wallView() {
  const docs = [...state.racks.values()].flatMap((rack) => rack.docs).filter((doc, index, all) => idOf(doc) && all.findIndex((other) => idOf(other) === idOf(doc)) === index);
  return `<div class="view wall-view"><div class="page-heading"><div><span class="eyebrow">THE COVER WALL</span><h1>All the good stuff<br><i>in one place.</i></h1><p>Dense mode for when you want to judge a publication by its cover.</p></div><div class="page-heading-actions"><button class="primary-button" data-action="navigate" data-view="racks">${icon('list')} Racks view</button><span>${docs.length || '—'} covers loaded</span></div></div><div class="wall-grid">${docs.length ? docs.map((doc, index) => coverMarkup(doc, index)).join('') : `<div class="wall-empty"><strong>Load a few racks first.</strong><span>The cover wall fills as the live shelves come into view.</span><a href="#/racks">Back to the rack ${icon('arrow')}</a></div>`}</div></div>`;
}

function statusLabel(status) { return ({ want: 'Want to read', reading: 'Reading now', finished: 'Finished', abandoned: 'Dropped' }[status] || 'Want to read'); }
function libraryView() {
  const prefs = store.getPrefs();
  const items = store.getLibrary();
  const history = store.getHistory();
  return `<div class="view library-view"><div class="page-heading library-heading"><div><span class="eyebrow">YOUR PRIVATE STACK</span><h1>My library<br><i>${items.length ? 'your good pile.' : 'start a good pile.'}</i></h1><p>Saved locally on this device. Add a status, a note, and a little intention.</p></div><div class="library-actions"><button data-action="add-manual">+ Add issue</button><button data-action="import">Import</button><button data-action="clear-library" ${items.length ? '' : 'disabled'}>Clear all</button></div></div><div class="library-summary"><div><b>${items.length}</b><span>saved issues</span></div><div><b>${items.filter((item) => item.status === 'reading').length}</b><span>in progress</span></div><div><b>${history.length}</b><span>recent reads</span></div></div>${items.length ? `<div class="library-filters"><button class="active" data-action="library-filter" data-filter="all">Everything</button><button data-action="library-filter" data-filter="want">Want to read</button><button data-action="library-filter" data-filter="reading">Reading</button><button data-action="library-filter" data-filter="finished">Finished</button></div><div class="library-grid">${items.map((item, index) => libraryCard(item, index)).join('')}</div>` : `<div class="library-empty"><div class="empty-stack">${icon('bookmark')}</div><h2>Your next rabbit hole starts here.</h2><p>Save any cover on the rack and it will land here with its source, status, and notes.</p><a class="primary-button" href="#/racks">Browse the rack ${icon('arrow')}</a></div>`}</div>`;
}
function libraryCard(item, index) { const doc = normalizedDoc(mergeSavedDoc(item)); const card = coverMarkup(doc, index).replace('data-action="open"', 'data-action="open-library"'); return `<article class="library-card" data-action="open-library" data-id="${escapeHtml(idOf(doc))}">${card}<div class="library-status status-${escapeHtml(item.status || 'want')}">${escapeHtml(statusLabel(item.status))}</div>${item.notes ? `<p class="library-note">“${escapeHtml(item.notes)}”</p>` : ''}</article>`; }

function aboutView() { return `<div class="view about-view"><div class="page-heading"><div><span class="eyebrow">A NOTE FROM THE RACK</span><h1>Good things<br><i>hide in rows.</i></h1><p>Magazine Rack is a live index for wandering through public collections. It helps you find the cover, the context, and the source—then gets out of the way.</p></div></div><div class="about-grid"><div><span>01</span><h2>Look sideways.</h2><p>Every shelf is horizontally browsable because discovery should feel like standing in front of a real newsstand.</p></div><div><span>02</span><h2>Keep the source.</h2><p>Each issue stays tied to its original collection. Magazine Rack is the doorway, not the destination.</p></div><div><span>03</span><h2>Follow the rabbit hole.</h2><p>Save the odd finds, pick up where you left off, and load deeper whenever the first row is not enough.</p></div></div></div>`; }

function detailModal(doc, libraryMode = false) {
  const item = normalizedDoc(doc);
  const saved = store.getSaved(idOf(item));
  const subjects = Array.isArray(item.subject) ? item.subject.slice(0, 8) : [];
  return `<div class="modal-backdrop" data-action="close-modal"><section class="detail-sheet" role="dialog" aria-modal="true" aria-labelledby="detail-title" data-modal-panel><button class="sheet-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="detail-poster">${coverMarkup(item, 2).replace('class="cover-card"', 'class="cover-card poster-card"').replace(' tabindex="0"', '')}</div><div class="detail-body"><div class="detail-kicker"><span class="source-dot ${sourceClass(item.source)}"></span>${escapeHtml(sourceLabel(item.source))}<span>•</span>${escapeHtml(yearOf(item) || 'UNDATED')}</div><h2 id="detail-title">${escapeHtml(titleOf(item))}</h2><p class="detail-creator">${escapeHtml(item.creator || 'Unknown creator')}</p><p class="detail-description">${escapeHtml(item.description || 'A record from a public collection, ready for another look.')}</p>${subjects.length ? `<div class="tag-row">${subjects.map((subject) => `<span>${escapeHtml(String(subject))}</span>`).join('')}</div>` : ''}<div class="detail-facts"><div><span>Source</span><b>${escapeHtml(sourceLabel(item.source))}</b></div><div><span>Format</span><b>${item.pages ? `${escapeHtml(item.pages)} pages` : 'Digital issue'}</b></div><div><span>Readability</span><b>${isReadable(item) ? 'Reader available' : 'Catalog record'}</b></div></div>${libraryMode ? `<label class="note-field">Notes<textarea id="library-note" maxlength="1000" placeholder="Why did you save this?">${escapeHtml(saved?.notes || '')}</textarea></label><label class="note-field">Status<select id="library-status"><option value="want" ${saved?.status === 'want' ? 'selected' : ''}>Want to read</option><option value="reading" ${saved?.status === 'reading' ? 'selected' : ''}>Reading now</option><option value="finished" ${saved?.status === 'finished' ? 'selected' : ''}>Finished</option><option value="abandoned" ${saved?.status === 'abandoned' ? 'selected' : ''}>Dropped</option></select></label>` : ''}<div class="detail-actions"><button class="primary-button" data-action="read" data-id="${escapeHtml(idOf(item))}" ${isReadable(item) ? '' : 'disabled'}>${icon('play')} Read in app</button><button class="secondary-button" data-action="save" data-id="${escapeHtml(idOf(item))}">${saved ? icon('bookmark') + ' Saved' : icon('bookmark') + ' Save issue'}</button><a class="secondary-button" href="${escapeHtml(sourceUrl(item))}" target="_blank" rel="noopener">${icon('external')} Open source</a>${libraryMode ? `<button class="danger-button" data-action="delete-library" data-id="${escapeHtml(idOf(item))}">Remove</button>` : ''}</div>${libraryMode ? '<button class="save-edit" data-action="save-library-edit" data-id="' + escapeHtml(idOf(item)) + '">Save changes</button>' : ''}<p class="source-reminder">Source-first reading · original collection stays in control.</p></div></section></div>`;
}

function readerOverlay(doc) {
  const item = normalizedDoc(doc);
  const id = idOf(item);
  const image = safeUrl(item.fullImage || item.cover);
  const isImage = IMAGE_SOURCES.has(item.source) && image;
  return `<div class="reader-overlay"><div class="reader-bar"><div class="reader-title"><span>NOW READING</span><strong>${escapeHtml(titleOf(item))}</strong></div><div class="reader-tools"><span class="reader-source">${escapeHtml(sourceLabel(item.source))}</span><button data-action="reader-reload">Reload</button><a href="${escapeHtml(sourceUrl(item))}" target="_blank" rel="noopener">Open source ${icon('external')}</a><button class="reader-close" data-action="close-reader" aria-label="Close reader">${icon('close')}</button></div></div><div class="reader-stage">${isImage ? `<div class="image-reader"><img src="${escapeHtml(image)}" alt="${escapeHtml(titleOf(item))}"><p>Image viewer · ${escapeHtml(sourceLabel(item.source))}</p></div>` : `<iframe id="reader-frame" title="${escapeHtml(titleOf(item))}" src="${escapeHtml(readerUrl(item))}" allow="fullscreen" allowfullscreen></iframe>`}</div><div class="reader-foot"><span>${escapeHtml(yearOf(item) || 'PUBLIC EDITION')} · ${escapeHtml(item.pages ? `${item.pages} pages` : 'source reader')}</span><button data-action="reader-related">Find more like this ${icon('arrow')}</button></div></div>`;
}

function render() {
  const viewMarkup = state.view === 'library' ? libraryView() : state.view === 'wall' ? wallView() : state.view === 'about' ? aboutView() : state.view === 'search' ? searchView() : racksView();
  document.body.classList.toggle('wall-mode', state.view === 'wall');
  app.innerHTML = `${sideRail()}<div class="app-main">${topbar()}${state.notice ? `<div class="notice" role="status">${escapeHtml(state.notice)}</div>` : ''}${rackManager()}${viewMarkup}<footer class="site-footer"><span>MAGAZINE RACK / A LIVING INDEX</span><span>Built for wandering readers</span></footer></div>${state.modal ? detailModal(state.modal.doc, state.modal.libraryMode) : ''}${state.reader ? readerOverlay(state.reader) : ''}`;
  bindObserver();
}

function searchView() { const docs = state.search.docs; return `<div class="view search-view"><div class="page-heading"><div><span class="eyebrow">SEARCH THE WHOLE RACK</span><h1>${state.search.loading ? 'Looking through every shelf…' : `Results for <i>“${escapeHtml(state.query)}”</i>`}</h1><p>${state.search.loading ? 'Pulling live covers from the public feeds.' : `${state.search.total || docs.length} issues found across the connected collections.`}</p></div><button class="secondary-button" data-action="clear-search">Clear search</button></div><div class="search-toolbar"><span>${icon('search')} LIVE SEARCH</span><button data-action="toggle-wall">${icon('grid')} Cover wall</button></div><div class="search-grid">${state.search.loading ? loadingCards(12) : docs.length ? docs.map((doc, index) => coverMarkup(doc, index)).join('') : `<div class="wall-empty"><strong>No issues found.</strong><span>Try a broader title, subject, or decade.</span></div>`}</div></div>`; }

function setNotice(message) { state.notice = message; render(); window.clearTimeout(setNotice.timer); setNotice.timer = window.setTimeout(() => { state.notice = ''; render(); }, 4000); }
function queueShelf(id, reset = false) { const current = rackState({ id }); if (current.loading || state.queue.some((item) => item.id === id) || (!reset && current.loaded && !current.hasMore)) return; state.queue.push({ id, reset }); pumpLoads(); }
function pumpLoads() { while (state.activeLoads < MAX_ACTIVE_LOADS && state.queue.length) { const job = state.queue.shift(); loadShelf(job.id, job.reset); } }
function backendShelfSource(shelf) { return hasConfiguredApi() && ['dpla', 'gcd', 'europeana', 'comicbookplus'].includes(shelf?.source) ? shelf.source : ''; }
function backendShelfQuery(shelf) { return shelf.source === 'dpla' ? shelf.dplaQuery : shelf.source === 'gcd' ? shelf.gcdName : shelf.source === 'comicbookplus' ? shelf.cbQuery : shelf.euQuery; }
async function fetchShelfData(shelf, page, options) {
  const source = backendShelfSource(shelf);
  if (!source) return fetchShelfPage(shelf, page, options);
  const remote = await searchCatalog({ query: backendShelfQuery(shelf) || '', source, page, newspaperMonthDay: shelf.newspaperDateMode === 'month-day' ? monthDayKey() : '' });
  return remote?.source === 'demo' ? fetchShelfPage(shelf, page, options) : remote;
}
async function loadShelf(id, reset = false) {
  const shelf = SHELVES.find((entry) => entry.id === id); if (!shelf) return;
  const current = rackState(shelf); if (current.loading) return;
  if (reset) { current.docs = []; current.page = 0; current.total = 0; current.cursor = null; current.hasMore = true; current.mode = null; current.fallback = false; }
  current.loading = true; current.error = ''; state.activeLoads += 1; render();
  const nextPage = reset ? 1 : current.page + 1;
  try {
    const result = await fetchShelfData(shelf, nextPage, { extraQuery: state.query, decade: state.decade, cursor: reset ? null : current.cursor, deep: current.mode === 'scrape', mode: current.mode, europeanaKey: store.getPrefs().europeanaKey, newspaperMonthDay: shelf.newspaperDateMode === 'month-day' ? monthDayKey() : '', pageSize: ROWS_PER_PAGE });
    const incoming = (result?.docs || result?.items || []).map(normalizedDoc).filter((doc) => idOf(doc) && (isAdultShelfId(shelf.id) || (!isAdultDoc(doc) && (shelf.id === 'manga' || !isMangaDoc(doc)))));
    const seen = new Set(reset ? [] : current.docs.map(idOf));
    const unique = incoming.filter((doc) => !seen.has(idOf(doc)));
    current.docs = reset ? unique : [...current.docs, ...unique]; current.page = nextPage; current.total = Number(result?.numFound ?? result?.total ?? current.docs.length) || current.docs.length; current.cursor = result?.nextCursor || null; current.mode = result?.mode || current.mode || 'search'; current.deepAvailable = Boolean(result?.deepAvailable); current.nextMode = result?.nextMode || null; if (current.nextMode && current.docs.length >= 90) current.mode = current.nextMode; current.hasMore = Boolean(current.cursor || (unique.length && current.docs.length < current.total)); current.loaded = true; current.fallback = false; current.error = result?.partial && !unique.length ? ((result?.errors || [])[0]?.message || 'This source did not respond') : '';
    if (result?.partial && !unique.length) {
      if (shelf.newspaperDateMode === 'month-day') {
        current.docs = [];
        current.total = 0;
        current.hasMore = false;
        current.fallback = false;
        current.error = `No readable ${newspaperDateLabel()} were returned.`;
      } else {
        current.docs = fallbackDocsForShelf(shelf);
        current.total = current.docs.length;
        current.hasMore = false;
        current.fallback = current.docs.length > 0;
        current.error = '';
      }
    }
  } catch (error) {
    current.loaded = true; current.hasMore = false;
    if (!current.docs.length && shelf.newspaperDateMode !== 'month-day') { current.docs = fallbackDocsForShelf(shelf); current.total = current.docs.length; current.fallback = current.docs.length > 0; current.error = ''; }
    else if (!current.docs.length) current.error = `No readable ${newspaperDateLabel()} were returned.`;
    else current.error = error?.message || 'This source did not respond';
  } finally { current.loading = false; state.activeLoads -= 1; render(); pumpLoads(); }
}

function bindObserver() {
  state.observer?.disconnect();
  if (state.view === 'wall') {
    if (![...state.racks.values()].some((rack) => rack.docs.length || rack.loading)) orderedShelves().slice(0, 4).forEach((shelf) => queueShelf(shelf.id));
    return;
  }
  if (state.view !== 'racks') return;
  if ('IntersectionObserver' in window) {
    state.observer = new IntersectionObserver((entries) => entries.filter((entry) => entry.isIntersecting).forEach((entry) => queueShelf(entry.target.dataset.rackId)), { rootMargin: '600px 0px' });
    document.querySelectorAll('[data-rack-id]').forEach((rack) => state.observer.observe(rack));
  }
  orderedShelves().slice(0, 4).forEach((shelf) => queueShelf(shelf.id));
}

async function loadSearch() {
  state.search = { docs: [], total: 0, loading: true, error: '' }; render();
  try {
    const result = hasConfiguredApi()
      ? await searchCatalog({ query: state.query, page: 1 })
      : await fetchShelfPage({ id: 'search', title: 'Search', source: 'ia', query: `mediatype:texts AND (${state.query.trim()})${ADULT_EXCLUDE}` }, 1, { extraQuery: '', decade: state.decade, pageSize: 60, search: true });
    let docs = (result?.docs || result?.items || []).map(normalizedDoc).filter((doc) => idOf(doc) && !isAdultDoc(doc));
    if (result?.partial && !docs.length) {
      const needle = state.query.toLowerCase();
      docs = seedDocs().filter((doc) => `${titleOf(doc)} ${doc.creator} ${doc.subject.join(' ')} ${doc.description}`.toLowerCase().includes(needle));
    }
    state.search = { docs, total: Number(result?.numFound ?? result?.total ?? docs.length) || docs.length, loading: false, error: '' };
  } catch (error) { state.search = { docs: [], total: 0, loading: false, error: error?.message || 'Search unavailable' }; }
  render();
}

async function randomIssue() {
  const shelf = SHELVES[Math.floor(Math.random() * Math.max(SHELVES.length - 2, 1))];
  const current = rackState(shelf);
  let shouldLoad = false;
  if (!current.docs.length) {
    current.docs = fallbackDocsForShelf(shelf);
    if (!current.docs.length) current.docs = seedDocs();
    current.total = current.docs.length;
    current.loaded = true;
    current.hasMore = false;
    current.fallback = true;
    shouldLoad = true;
  }
  const doc = current.docs[Math.floor(Math.random() * current.docs.length)];
  state.modal = { doc, libraryMode: false };
  if (shouldLoad) queueShelf(shelf.id, true);
  render();
}

function openReader(doc) { if (!isReadable(doc)) { setNotice('This record does not have a readable destination yet.'); return; } const id = idOf(doc); const saved = store.getSaved(id); if (saved?.status === 'want') store.updateSaved(id, { status: 'reading' }); state.modal = null; state.reader = normalizedDoc(doc); store.pushHistory(doc); render(); }
function getDoc(id) { const searchDoc = state.search.docs.find((doc) => idOf(doc) === id); if (searchDoc) return searchDoc; for (const rack of state.racks.values()) { const found = rack.docs.find((doc) => idOf(doc) === id); if (found) return found; } return store.getSaved(id) || seedDocs().find((doc) => idOf(doc) === id) || null; }
function toggleSave(id) {
  const doc = getDoc(id);
  if (!doc) return false;
  const saved = store.toggleSaved(doc);
  const key = hasConfiguredApi() ? store.getLibraryKey() : '';
  if (key) syncRemoteLibrary((libraryKey) => saved ? saveLibraryItem(id, libraryKey, doc.notes || '') : removeLibraryItem(id, libraryKey));
  setNotice(saved ? 'Saved to your library.' : 'Removed from your library.');
  return saved;
}
function downloadJson() { const blob = new Blob([JSON.stringify(store.getLibrary(), null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'magazine-rack-library.json'; link.click(); URL.revokeObjectURL(link.href); setNotice('Library export downloaded.'); }
function importJson() { const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json'; input.addEventListener('change', () => { const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(reader.result); if (!Array.isArray(parsed)) throw new Error('Expected a list'); store.mergeSaved(parsed); setNotice(`Imported ${parsed.length} issue${parsed.length === 1 ? '' : 's'}.`); render(); } catch { setNotice('That file could not be imported.'); } }; reader.readAsText(file); }); input.click(); }

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]'); if (!target) return;
  const action = target.dataset.action;
  if (action === 'open') { event.preventDefault(); const doc = getDoc(target.dataset.id); if (doc) { state.modal = { doc, libraryMode: false }; render(); } return; }
  if (action === 'open-library') { const doc = mergeSavedDoc(store.getSaved(target.dataset.id)); if (doc) { state.modal = { doc, libraryMode: true }; render(); } return; }
  if (action === 'close-modal') { if (target.dataset.modalPanel === undefined || !event.target.closest('[data-modal-panel]') || target.classList.contains('sheet-close')) { state.modal = null; render(); } return; }
  if (action === 'save') { event.stopPropagation(); toggleSave(target.dataset.id); if (state.modal) state.modal = { doc: getDoc(target.dataset.id), libraryMode: state.modal.libraryMode }; render(); return; }
  if (action === 'read') { const doc = getDoc(target.dataset.id) || state.modal?.doc; if (doc) openReader(doc); return; }
  if (action === 'close-reader') { state.reader = null; render(); return; }
  if (action === 'reader-reload') { if (state.reader) { const current = state.reader; state.reader = null; render(); state.reader = current; render(); } return; }
  if (action === 'reader-related') { if (state.reader) { state.query = titleOf(state.reader).split(/[^a-z0-9]+/i).filter((word) => word.length > 2).slice(0, 3).join(' '); state.reader = null; window.location.hash = `#/search?q=${encodeURIComponent(state.query)}`; await loadSearch(); } return; }
  if (action === 'pin') { store.togglePinned(target.dataset.id); render(); setNotice(`${isPinned({ id: target.dataset.id }) ? 'Pinned' : 'Unpinned'} rack.`); return; }
  if (action === 'refresh-rack') { const shelf = SHELVES.find((entry) => entry.id === target.dataset.id); if (shelf) { queueShelf(shelf.id, true); setNotice(`Refreshing ${shelf.title}…`); } return; }
  if (action === 'load-more') { queueShelf(target.dataset.id); return; }
  if (action === 'set-decade') { state.decade = target.dataset.decade || ''; state.racks.clear(); render(); orderedShelves().slice(0, 4).forEach((shelf) => queueShelf(shelf.id, true)); setNotice(state.decade ? `Showing ${state.decade.split('-')[0].slice(0, 4)} editions.` : 'Showing all eras.'); return; }
  if (action === 'toggle-racks') { state.showRackMenu = !state.showRackMenu; render(); return; }
  if (action === 'close-racks') { state.showRackMenu = false; render(); return; }
  if (action === 'toggle-rack') { store.toggleHidden(target.dataset.id); render(); return; }
  if (action === 'toggle-wall') { state.wall = !state.wall; store.setWall(state.wall); if (state.view === 'racks') { state.view = state.wall ? 'wall' : 'racks'; window.location.hash = `#/${state.view}`; } render(); return; }
  if (action === 'navigate') { state.view = target.dataset.view || 'racks'; state.search = { docs: [], total: 0, loading: false, error: '' }; window.location.hash = `#/${state.view}`; render(); return; }
  if (action === 'random') { await randomIssue(); return; }
  if (action === 'about') { state.view = 'about'; window.location.hash = '#/about'; render(); return; }
  if (action === 'export') { downloadJson(); return; }
  if (action === 'import') { importJson(); return; }
  if (action === 'add-manual') { state.modal = { doc: { identifier: `manual-${Date.now()}`, title: 'Add an issue', source: 'manual', subject: [], date: '' }, libraryMode: true }; render(); return; }
  if (action === 'delete-library') { store.removeSaved(target.dataset.id); state.modal = null; setNotice('Removed from your library.'); render(); return; }
  if (action === 'save-library-edit') { const id = target.dataset.id; const note = document.querySelector('#library-note')?.value || ''; const status = document.querySelector('#library-status')?.value || 'want'; store.updateSaved(id, { notes: note.trim(), status }); state.modal = null; setNotice('Library entry updated.'); render(); return; }
  if (action === 'clear-library') { if (window.confirm('Remove every saved issue from this device?')) { store.clearSaved(); setNotice('Library cleared.'); } return; }
  if (action === 'library-filter') { const filter = target.dataset.filter; document.querySelectorAll('.library-card').forEach((card) => { const item = store.getSaved(card.dataset.id); card.hidden = filter !== 'all' && item?.status !== filter; }); document.querySelectorAll('.library-filters button').forEach((button) => button.classList.toggle('active', button === target)); return; }
  if (action === 'clear-search') { state.query = ''; state.search = { docs: [], total: 0, loading: false, error: '' }; window.location.hash = '#/racks'; render(); return; }
});

document.addEventListener('submit', async (event) => { if (!event.target.matches('.search-form')) return; event.preventDefault(); state.query = String(new FormData(event.target).get('q') || '').trim(); if (!state.query) { state.search = { docs: [], total: 0, loading: false, error: '' }; window.location.hash = '#/racks'; render(); return; } window.location.hash = `#/search?q=${encodeURIComponent(state.query)}`; await loadSearch(); });
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#global-search')?.focus(); } if (event.key === 'Escape') { if (state.reader) state.reader = null; else if (state.modal) state.modal = null; else if (state.showRackMenu) state.showRackMenu = false; render(); } if (event.key === 'Enter' && document.activeElement?.matches('.cover-card')) { const doc = getDoc(document.activeElement.dataset.id); if (doc) { state.modal = { doc, libraryMode: false }; render(); } } });

function routeFromHash() { const raw = window.location.hash.replace(/^#\/?/, '') || 'racks'; const [view, query] = raw.split('?'); const params = new URLSearchParams(query || ''); return { view: ['racks', 'wall', 'library', 'about', 'search'].includes(view) ? view : 'racks', query: params.get('q') || '' }; }
window.addEventListener('hashchange', async () => { const route = routeFromHash(); state.view = route.view; state.query = route.query; state.search = route.view === 'search' && route.query ? { ...state.search, loading: true } : { docs: [], total: 0, loading: false, error: '' }; render(); if (route.view === 'search' && route.query) await loadSearch(); });
window.addEventListener('magazine-rack:state', () => render());

state.view = routeFromHash().view; state.query = routeFromHash().query; render();
if (state.view === 'search' && state.query) loadSearch();
hydrateRemoteLibrary().catch(() => {});
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js?v=10').catch(() => {});
