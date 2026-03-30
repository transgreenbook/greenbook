-- Returns verified POIs within a map viewport bounding box.
-- Called via supabase.rpc('pois_in_viewport', { west, south, east, north }).
-- Returns lat/lng as numbers so the client can build GeoJSON without parsing WKB.

CREATE OR REPLACE FUNCTION pois_in_viewport(
  west  FLOAT,
  south FLOAT,
  east  FLOAT,
  north FLOAT
)
RETURNS TABLE (
  id          INT,
  title       TEXT,
  description TEXT,
  category_id INT,
  is_verified BOOLEAN,
  tags        TEXT[],
  lng         FLOAT,
  lat         FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    id,
    title,
    description,
    category_id,
    is_verified,
    tags,
    ST_X(geom::geometry) AS lng,
    ST_Y(geom::geometry) AS lat
  FROM points_of_interest
  WHERE
    is_verified = true
    AND ST_Within(
      geom,
      ST_MakeEnvelope(west, south, east, north, 4326)
    )
  LIMIT 500;
$$;
