-- Add human-readable geo columns to points_of_interest.
-- These are populated automatically by the sync_geographic_ids trigger.
-- state_abbr accepts full state names too — the trigger normalises to abbreviation.
-- city_name is set to '-' when the point falls outside any incorporated place.

ALTER TABLE points_of_interest
  ADD COLUMN IF NOT EXISTS state_abbr  TEXT,
  ADD COLUMN IF NOT EXISTS county_name TEXT,
  ADD COLUMN IF NOT EXISTS city_name   TEXT;
