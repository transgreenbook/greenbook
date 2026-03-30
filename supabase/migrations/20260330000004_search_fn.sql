-- Full-text + fuzzy POI search for the search bar.
-- Returns up to 10 results ranked by relevance.
CREATE OR REPLACE FUNCTION search_pois(query TEXT)
RETURNS TABLE(
  id          INT,
  title       TEXT,
  description TEXT,
  lat         FLOAT8,
  lng         FLOAT8,
  category_id INT,
  is_verified BOOLEAN,
  tags        TEXT[]
) LANGUAGE sql AS $$
  SELECT
    id, title, description,
    ST_Y(geom::geometry) AS lat,
    ST_X(geom::geometry) AS lng,
    category_id, is_verified, tags
  FROM points_of_interest
  WHERE
    is_verified = true
    AND (
      search_vector @@ plainto_tsquery('english', query)
      OR title ILIKE '%' || query || '%'
    )
  ORDER BY
    ts_rank(search_vector, plainto_tsquery('english', query)) DESC,
    title
  LIMIT 10;
$$;
