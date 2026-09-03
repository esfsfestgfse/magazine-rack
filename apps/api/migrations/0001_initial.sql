PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  creator TEXT,
  year TEXT,
  genre TEXT,
  description TEXT,
  cover_url TEXT,
  source_url TEXT NOT NULL,
  reader_url TEXT,
  page_count INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS catalog_items_title_idx ON catalog_items(title);
CREATE INDEX IF NOT EXISTS catalog_items_genre_idx ON catalog_items(genre);
CREATE INDEX IF NOT EXISTS catalog_items_source_idx ON catalog_items(source);

CREATE TABLE IF NOT EXISTS library_entries (
  library_key TEXT NOT NULL,
  item_id TEXT NOT NULL,
  note TEXT,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (library_key, item_id),
  FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS library_entries_key_idx ON library_entries(library_key, saved_at DESC);

CREATE TABLE IF NOT EXISTS source_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
