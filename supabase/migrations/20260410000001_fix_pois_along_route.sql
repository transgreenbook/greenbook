-- Fix pois_along_route:
--   1. p.scope → p.effect_scope (column was renamed in 20260403000003_prominence.sql)
--   2. FK joins on p.city_id / p.county_id / p.state_id replaced with ST_Within
--      spatial containment, because those FK columns are NULL for POIs created
--      via the admin form (same fix applied to pois_in_state/county/city in
--      20260409000002_fix_region_poi_fns.sql).

DROP FUNCTION IF EXISTS pois_along_route(text, float);

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
  color       TEXT,
  severity    SMALLINT,
  icon        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH route AS (
    SELECT
      ST_GeomFromGeoJSON(route_geojson)::geography AS geog,
      ST_GeomFromGeoJSON(route_geojson)::geometry  AS geom
  ),
  point_items AS (
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(p.geom::geometry)        AS lng,
      ST_Y(p.geom::geometry)        AS lat,
      COALESCE(p.color, c.color)    AS color,
      p.severity,
      COALESCE(p.icon, c.icon)      AS icon,
      ST_Distance(p.geom::geography, route.geog) AS dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE
      p.is_verified = true
      AND p.effect_scope = 'point'
      AND p.geom IS NOT NULL
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
      AND ST_DWithin(p.geom::geography, route.geog, buffer_meters)
  ),
  city_items AS (
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(ST_Centroid(ci.geom)::geometry) AS lng,
      ST_Y(ST_Centroid(ci.geom)::geometry) AS lat,
      COALESCE(p.color, c.color)           AS color,
      p.severity,
      COALESCE(p.icon, c.icon)             AS icon,
      NULL::FLOAT AS dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c ON c.id  = p.category_id
    JOIN       cities    ci ON ST_Within(p.geom, ci.geom)
    WHERE
      p.is_verified = true
      AND p.effect_scope = 'city'
      AND p.geom IS NOT NULL
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
      AND ST_Intersects(ci.geom, route.geom)
  ),
  county_items AS (
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(ST_Centroid(co.geom)::geometry) AS lng,
      ST_Y(ST_Centroid(co.geom)::geometry) AS lat,
      COALESCE(p.color, c.color)           AS color,
      p.severity,
      COALESCE(p.icon, c.icon)             AS icon,
      NULL::FLOAT AS dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c  ON c.id  = p.category_id
    JOIN       counties  co ON ST_Within(p.geom, co.geom)
    WHERE
      p.is_verified = true
      AND p.effect_scope = 'county'
      AND p.geom IS NOT NULL
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
      AND ST_Intersects(co.geom, route.geom)
  ),
  state_items AS (
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(ST_Centroid(st.geom)::geometry) AS lng,
      ST_Y(ST_Centroid(st.geom)::geometry) AS lat,
      COALESCE(p.color, c.color)           AS color,
      p.severity,
      COALESCE(p.icon, c.icon)             AS icon,
      NULL::FLOAT AS dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c ON c.id  = p.category_id
    JOIN       states    st ON ST_Within(p.geom, st.geom)
    WHERE
      p.is_verified = true
      AND p.effect_scope = 'state'
      AND p.geom IS NOT NULL
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
      AND ST_Intersects(st.geom, route.geom)
  )
  -- Point items first (closest first), then area items alphabetically
  (SELECT id, title, description, category_id, is_verified, tags,
          lng, lat, color, severity, icon
   FROM point_items
   ORDER BY dist
   LIMIT 100)

  UNION ALL

  (SELECT id, title, description, category_id, is_verified, tags,
          lng, lat, color, severity, icon
   FROM city_items
   ORDER BY title)

  UNION ALL

  (SELECT id, title, description, category_id, is_verified, tags,
          lng, lat, color, severity, icon
   FROM county_items
   ORDER BY title)

  UNION ALL

  (SELECT id, title, description, category_id, is_verified, tags,
          lng, lat, color, severity, icon
   FROM state_items
   ORDER BY title);
$$;
