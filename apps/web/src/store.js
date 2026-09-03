const STORAGE_KEY = 'magazine-rack-v3';
const LIBRARY_KEY = 'margin-library-key-v1';

const blankState = () => ({
  library: [],
  history: [],
  prefs: { wall: false, hidden: {}, pinned: {}, europeanaKey: '' },
});

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.library)) return { ...blankState(), ...saved, prefs: { ...blankState().prefs, ...(saved.prefs || {}) } };
    const legacy = JSON.parse(localStorage.getItem('margin-library-v1') || localStorage.getItem('magazine-rack-v2') || 'null');
    if (legacy?.library) return { ...blankState(), ...legacy };
    if (Array.isArray(legacy?.saved)) return { ...blankState(), library: legacy.saved.map((id) => ({ id, identifier: id, title: id, status: 'want', notes: '' })) };
  } catch { /* corrupted local state is recoverable */ }
  return blankState();
}

let state = readState();

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private browsing can deny storage */ }
  window.dispatchEvent(new CustomEvent('magazine-rack:state', { detail: state }));
}

function identity(docOrId) {
  if (typeof docOrId === 'string') return docOrId;
  return docOrId?.identifier || docOrId?.id || '';
}

function libraryRecord(doc = {}) {
  const identifier = identity(doc);
  return {
    id: identifier,
    identifier,
    title: String(doc.title || 'Untitled').slice(0, 300),
    creator: Array.isArray(doc.creator) ? String(doc.creator[0] || '') : String(doc.creator || ''),
    year: String(doc.date || doc.year || '').slice(0, 10),
    cover: doc.cover || null,
    status: doc.status || 'want',
    notes: String(doc.notes || '').slice(0, 1000),
    source: doc.source || 'ia',
    sourceUrl: doc.sourceUrl || doc.locUrl || null,
    locUrl: doc.locUrl || null,
    fullImage: doc.fullImage || null,
    subjects: Array.isArray(doc.subject) ? doc.subject.slice(0, 20) : (Array.isArray(doc.subjects) ? doc.subjects.slice(0, 20) : []),
    pages: Number(doc.imagecount || doc.pages || 0) || 0,
    addedAt: doc.addedAt || new Date().toISOString(),
  };
}

function createLibraryKey() {
  if (!globalThis.crypto?.getRandomValues) return '';
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const store = {
  get: () => state,
  getPrefs: () => state.prefs,
  getLibrary: () => state.library,
  getHistory: () => state.history,
  isSaved: (id) => state.library.some((item) => item.id === identity(id)),
  getSaved: (id) => state.library.find((item) => item.id === identity(id)) || null,
  getLibraryKey() {
    try {
      const existing = localStorage.getItem(LIBRARY_KEY);
      if (existing && /^[A-Fa-f0-9]{64}$/.test(existing)) return existing;
      const key = createLibraryKey();
      if (key) localStorage.setItem(LIBRARY_KEY, key);
      return key;
    } catch { return ''; }
  },
  saveItem(doc) {
    const item = libraryRecord(doc);
    if (!item.id) return false;
    const existing = state.library.find((entry) => entry.id === item.id);
    state = { ...state, library: [existing ? { ...existing, ...item, status: existing.status, notes: existing.notes } : item, ...state.library.filter((entry) => entry.id !== item.id)] };
    persist();
    return true;
  },
  toggleSaved(docOrId) {
    const id = identity(docOrId);
    if (!id) return false;
    if (state.library.some((item) => item.id === id)) { this.removeSaved(id); return false; }
    this.saveItem(typeof docOrId === 'string' ? { identifier: id, title: id } : docOrId);
    return true;
  },
  removeSaved(id) {
    state = { ...state, library: state.library.filter((item) => item.id !== identity(id)) };
    persist();
  },
  updateSaved(id, patch) {
    state = { ...state, library: state.library.map((item) => item.id === identity(id) ? { ...item, ...patch, id: item.id } : item) };
    persist();
  },
  mergeSaved(items = []) {
    const records = items.map((item) => libraryRecord(item)).filter((item) => item.id);
    const existing = new Map(state.library.map((item) => [item.id, item]));
    records.forEach((item) => { existing.set(item.id, { ...item, ...(existing.get(item.id) || {}) }); });
    state = { ...state, library: [...existing.values()] };
    persist();
  },
  clearSaved() { state = { ...state, library: [] }; persist(); },
  pushHistory(doc) {
    const item = libraryRecord(doc);
    if (!item.id) return;
    state = { ...state, history: [{ ...item, at: new Date().toISOString() }, ...state.history.filter((old) => old.id !== item.id)].slice(0, 40) };
    persist();
  },
  setWall(wall) { state = { ...state, prefs: { ...state.prefs, wall: Boolean(wall) } }; persist(); },
  toggleHidden(id) { state = { ...state, prefs: { ...state.prefs, hidden: { ...state.prefs.hidden, [id]: !state.prefs.hidden[id] } } }; persist(); },
  togglePinned(id) { state = { ...state, prefs: { ...state.prefs, pinned: { ...state.prefs.pinned, [id]: !state.prefs.pinned[id] } } }; persist(); },
  setEuropeanaKey(key) { state = { ...state, prefs: { ...state.prefs, europeanaKey: String(key || '').trim() } }; persist(); },
};
