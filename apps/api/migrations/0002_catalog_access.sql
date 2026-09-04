ALTER TABLE catalog_items ADD COLUMN access TEXT NOT NULL DEFAULT 'catalog';
ALTER TABLE catalog_items ADD COLUMN readable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN reader_kind TEXT NOT NULL DEFAULT 'none';
ALTER TABLE catalog_items ADD COLUMN cover_quality INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN availability_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE catalog_items ADD COLUMN rights TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS catalog_items_access_idx ON catalog_items(access, readable);
