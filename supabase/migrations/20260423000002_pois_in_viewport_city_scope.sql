-- Allow city-scoped POIs (e.g. destination/community POIs like Provincetown)
-- to appear as map markers in addition to coloring the city region.
-- State and county scoped POIs (laws, policies) remain excluded from the
-- marker layer — only 'point' and 'city' scope shows as pins.

CREATE OR REPLACE FUNCTION pois_in_viewport(
  west  FLOAT8, south FLOAT8, east FLOAT8, north FLOAT8, zoom INT
)
RETURNS TABLE(
  id          INT,
  title       TEXT,
  description TEXT,
  category_id INT,
  is_verified BOOLEAN,
  tags        TEXT[],
  lng         FLOAT8,
  lat         FLOAT8,
  color       TEXT,
  severity    SMALLINT,
  icon        TEXT,
  effect_scope poi_scope,
  prominence  poi_prominence
) LANGUAGE sql STABLE AS $$
  SELECT
    p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
    ST_X(p.geom::geometry)          AS lng,
    ST_Y(p.geom::geometry)          AS lat,
    COALESCE(p.color, c.color)      AS color,
    p.severity,
    COALESCE(p.icon, c.icon)        AS icon,
    p.effect_scope,
    p.prominence
  FROM points_of_interest p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE
    p.is_verified = true
    AND p.effect_scope IN ('point', 'city')
    AND p.geom IS NOT NULL
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
    AND ST_Within(p.geom, ST_MakeEnvelope(west, south, east, north, 4326))
    AND CASE p.prominence
      WHEN 'national'     THEN true
      WHEN 'regional'     THEN zoom >= 7
      WHEN 'local'        THEN zoom >= 10
      WHEN 'neighborhood' THEN zoom >= 13
    END
  LIMIT 500;
$$;
