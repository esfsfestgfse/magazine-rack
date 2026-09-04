import { fetchArchive } from './archive.js';
import { fetchLoc } from './loc.js';
import { fetchOpenLibrary } from './openlibrary.js';
import { fetchGcd } from './gcd.js';
import { fetchDpla } from './dpla.js';

export const SOURCE_ADAPTERS = Object.freeze({ archive: fetchArchive, loc: fetchLoc, openlibrary: fetchOpenLibrary, gcd: fetchGcd, dpla: fetchDpla });
export function configuredSourceIds() { return Object.keys(SOURCE_ADAPTERS); }
export function sourceAdapter(id) { return SOURCE_ADAPTERS[id] || null; }
