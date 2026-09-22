ALTER TABLE catalog_items ADD COLUMN issue_month_day TEXT;
CREATE INDEX IF NOT EXISTS catalog_items_issue_month_day_idx
  ON catalog_items(issue_month_day, source, last_seen_at DESC);
