-- Fast per-category POI count for the admin lazy-load UI.
-- Returns one row per category_id that has at least one POI.

CREATE OR REPLACE FUNCTION poi_counts_by_category()
RETURNS TABLE (category_id INT, count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT category_id, COUNT(*) AS count
  FROM points_of_interest
  WHERE category_id IS NOT NULL
  GROUP BY category_id;
$$;
