CREATE TABLE IF NOT EXISTS shelf_audits (
  audit_key TEXT PRIMARY KEY,
  shelf_id TEXT NOT NULL,
  source TEXT NOT NULL,
  page INTEGER NOT NULL DEFAULT 1,
  population INTEGER NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  readable_count INTEGER NOT NULL DEFAULT 0,
  cover_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  readable_rate REAL NOT NULL DEFAULT 0,
  cover_rate REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unknown',
  measured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS shelf_audits_shelf_idx
  ON shelf_audits(shelf_id, measured_at DESC);
