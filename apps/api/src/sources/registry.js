import { fetchArchive } from './archive.js';
import { fetchLoc } from './loc.js';
import { fetchOpenLibrary } from './openlibrary.js';
import { fetchEuropeana } from './europeana.js';
import { fetchComicBookPlus } from './comicbookplus.js';

export const SOURCE_ADAPTERS = Object.freeze({ archive: fetchArchive, loc: fetchLoc, openlibrary: fetchOpenLibrary, europeana: fetchEuropeana, comicbookplus: fetchComicBookPlus });
export function configuredSourceIds() { return Object.keys(SOURCE_ADAPTERS); }
export function sourceAdapter(id) { return SOURCE_ADAPTERS[id] || null; }
