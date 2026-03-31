-- Returns verified POIs within a buffer distance of a route LineString.
-- route_geojson: GeoJSON string of a LineString geometry
-- buffer_meters: search radius around the route (default 1 mile = 1609.34m)

CREATE OR REPLACE FUNCTION pois_along_route(
  route_geojson TEXT,
  buffer_meters FLOAT DEFAULT 1609.34
)
RETURNS TABLE (
  id          INT,
  title       TEXT,
  description TEXT,
  category_id INT,
  is_verified BOOLEAN,
  tags        TEXT[],
  lng         FLOAT,
  lat         FLOAT,
  color       TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.title,
    p.description,
    p.category_id,
    p.is_verified,
    p.tags,
    ST_X(p.geom::geometry) AS lng,
    ST_Y(p.geom::geometry) AS lat,
    c.color
  FROM points_of_interest p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE
    p.is_verified = true
    AND ST_DWithin(
      p.geom::geography,
      ST_GeomFromGeoJSON(route_geojson)::geography,
      buffer_meters
    )
  ORDER BY
    ST_Distance(
      p.geom::geography,
      ST_GeomFromGeoJSON(route_geojson)::geography
    )
  LIMIT 100;
$$;
