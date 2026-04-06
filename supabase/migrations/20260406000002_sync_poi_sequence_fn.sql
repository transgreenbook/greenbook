-- Utility function to keep the points_of_interest ID sequence in sync with
-- actual data. Call this after bulk-loading rows with explicit IDs (e.g. via
-- the spreadsheet seed) so that subsequent auto-generated inserts don't collide.

CREATE OR REPLACE FUNCTION sync_poi_sequence()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT setval(
    'points_of_interest_id_seq',
    GREATEST((SELECT COALESCE(MAX(id), 0) FROM points_of_interest), 1)
  );
$$;

GRANT EXECUTE ON FUNCTION sync_poi_sequence() TO service_role;
