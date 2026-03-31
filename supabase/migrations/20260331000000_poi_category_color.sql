-- Add category color to pois_in_viewport so the map can color dots by category
-- without a separate client-side lookup.
-- Must DROP first because CREATE OR REPLACE cannot change the return type.

DROP FUNCTION IF EXISTS pois_in_viewport(float, float, float, float);

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
    AND ST_Within(
      p.geom,
      ST_MakeEnvelope(west, south, east, north, 4326)
    )
  LIMIT 500;
$$;
