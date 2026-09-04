import { SEED_ITEMS } from './data.js';

const configuredBase = () => (window.MR_CONFIG?.apiBaseUrl || localStorage.getItem('margin-api-base') || '').replace(/\/$/, '');
export const hasConfiguredApi = () => Boolean(configuredBase());
const request = async (path, options = {}) => {
  const base = configuredBase();
  if (!base) throw new Error('offline-demo');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);
  try {
    const response = await fetch(`${base}${path}`, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`API ${response.status}`);
    return response.json();
  } finally { clearTimeout(timeout); }
};

export async function searchCatalog({ query = '', genre = '', source = '', page = 1, newspaperMonthDay = '' } = {}) {
  try { return await request(`/api/catalog?q=${encodeURIComponent(query)}&genre=${encodeURIComponent(genre)}&source=${encodeURIComponent(source)}&page=${page}&newspaper_month_day=${encodeURIComponent(newspaperMonthDay)}`); }
  catch { const needle = query.trim().toLowerCase(); const results = SEED_ITEMS.filter((entry) => (!needle || `${entry.title} ${entry.creator} ${entry.genre}`.toLowerCase().includes(needle)) && (!genre || entry.genre === genre) && (!source || entry.source === source)); return { items: results, total: results.length, page: 1, source: 'demo' }; }
}

export async function getCatalogItem(id) {
  try { return await request(`/api/catalog/${encodeURIComponent(id)}`); }
  catch { return { item: SEED_ITEMS.find((entry) => entry.id === id) || null }; }
}

export async function syncLibrary(libraryKey) {
  return request('/api/library', { headers: { 'X-Anonymous-Library-Key': libraryKey } });
}

export async function saveLibraryItem(id, libraryKey, note = '') {
  return request(`/api/library/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'X-Anonymous-Library-Key': libraryKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
}

export async function removeLibraryItem(id, libraryKey) {
  return request(`/api/library/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-Anonymous-Library-Key': libraryKey } });
}
