ALTER TABLE catalog_items ADD COLUMN series_title TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog_items ADD COLUMN issue_number TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog_items ADD COLUMN volume_number TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog_items ADD COLUMN cover_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN access_checked_at TEXT;

CREATE INDEX IF NOT EXISTS catalog_items_series_idx
  ON catalog_items(series_title, year, volume_number, issue_number);

CREATE INDEX IF NOT EXISTS catalog_items_cover_score_idx
  ON catalog_items(cover_score DESC, cover_quality DESC, last_seen_at DESC);
