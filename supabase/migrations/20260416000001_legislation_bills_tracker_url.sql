-- Add tracker URL tracking fields to legislation_bills.
--
-- tracker_url            — only populated when tracker_url_status = 200
-- tracker_url_status     — last HTTP status: 200 (found), 404 (not tracked),
--                          429/503 (rate limited — retry next run), null (unchecked)
-- tracker_url_checked_at — when the last check was performed

ALTER TABLE legislation_bills ADD COLUMN IF NOT EXISTS tracker_url          TEXT;
ALTER TABLE legislation_bills ADD COLUMN IF NOT EXISTS tracker_url_status   SMALLINT;
ALTER TABLE legislation_bills ADD COLUMN IF NOT EXISTS tracker_url_checked_at TIMESTAMPTZ;
