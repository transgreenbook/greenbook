-- Add sheet_id for Google Sheets sync.
-- Holds the DB id (as text) written back to the sheet's poi_id column,
-- providing a stable link between a sheet row and its DB record.

ALTER TABLE points_of_interest ADD COLUMN sheet_id TEXT;

CREATE UNIQUE INDEX idx_poi_sheet_id
  ON points_of_interest (sheet_id)
  WHERE sheet_id IS NOT NULL;
