-- Track the external source of POIs imported from third-party APIs.
-- source:    identifier for the data source  e.g. 'refuge_restrooms'
-- source_id: the record's ID in that source  e.g. '12345'
--
-- The partial unique index lets us upsert by (source, source_id) while
-- leaving both columns NULL for manually-entered POIs.

ALTER TABLE points_of_interest
  ADD COLUMN IF NOT EXISTS source    TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_poi_source
  ON points_of_interest (source, source_id)
  WHERE source IS NOT NULL AND source_id IS NOT NULL;
