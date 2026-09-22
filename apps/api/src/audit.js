const text = (value) => Array.isArray(value) ? value.join(' ') : String(value || '');

function auditKey(item) {
  return String(item?.id || item?.sourceId || `${item?.title || ''}|${item?.year || ''}`).trim().toLowerCase();
}

/** Measure the quality of the page returned for one named shelf. */
export function measureShelf(items = [], total = 0, status = 'unknown') {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  const keys = rows.map(auditKey).filter(Boolean);
  const unique = new Set(keys);
  const readable = rows.filter((item) => item.readable === true || ['full', 'borrow', 'preview'].includes(item.access)).length;
  const covered = rows.filter((item) => Boolean(item.coverUrl || item.cover || item.cover_url)).length;
  const sampleCount = rows.length;
  return {
    population: Math.max(Number(total) || 0, sampleCount),
    sampleCount,
    readableCount: readable,
    coverCount: covered,
    duplicateCount: Math.max(0, keys.length - unique.size),
    readableRate: sampleCount ? Number((readable / sampleCount).toFixed(4)) : 0,
    coverRate: sampleCount ? Number((covered / sampleCount).toFixed(4)) : 0,
    status: String(status || 'unknown'),
  };
}

export function passesPrimaryShelfAudit(audit) {
  return Boolean(audit && audit.sampleCount > 0 && audit.readableRate >= 0.8 && audit.coverRate >= 0.8 && audit.status !== 'unavailable');
}
