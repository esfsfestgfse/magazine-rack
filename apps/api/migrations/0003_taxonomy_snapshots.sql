CREATE TABLE IF NOT EXISTS catalog_collections (
  item_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  collection_label TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (item_id, collection_id),
  FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS catalog_collections_collection_idx
  ON catalog_collections(collection_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS shelf_snapshots (
  snapshot_key TEXT PRIMARY KEY,
  shelf_id TEXT NOT NULL,
  source TEXT NOT NULL,
  page INTEGER NOT NULL DEFAULT 1,
  query TEXT NOT NULL,
  newspaper_month_day TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  items_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  fetched_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS shelf_snapshots_shelf_idx
  ON shelf_snapshots(shelf_id, page, fetched_at DESC);

CREATE TABLE IF NOT EXISTS source_health (
  source TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  checked_at TEXT NOT NULL
);
