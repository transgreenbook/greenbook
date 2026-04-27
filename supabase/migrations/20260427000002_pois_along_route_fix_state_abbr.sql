-- Fix state_abbr in pois_along_route: derive from geometry joins rather than
-- relying on p.state_abbr (null for many imported POIs). Also add state_name
-- for display as a section header.

DROP FUNCTION IF EXISTS pois_along_route(text, float);

CREATE OR REPLACE FUNCTION pois_along_route(
  route_geojson TEXT,
  buffer_meters FLOAT DEFAULT 1609.34
)
RETURNS TABLE (
  id           INT,
  title        TEXT,
  description  TEXT,
  category_id  INT,
  is_verified  BOOLEAN,
  tags         TEXT[],
  lng          FLOAT,
  lat          FLOAT,
  color        TEXT,
  severity     SMALLINT,
  icon         TEXT,
  state_abbr   TEXT,
  state_name   TEXT,
  effect_scope TEXT,
  route_dist   FLOAT
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
      COALESCE(p.state_abbr, st.abbreviation) AS state_abbr,
      st.name                                 AS state_name,
      p.effect_scope,
      ST_LineLocatePoint(route.geom, p.geom::geometry) AS route_dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c  ON c.id = p.category_id
    LEFT JOIN states     st ON ST_Within(p.geom::geometry, st.geom)
    WHERE
      p.is_verified = true
      AND p.is_visible = true
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
      COALESCE(p.state_abbr, st.abbreviation) AS state_abbr,
      st.name                                 AS state_name,
      p.effect_scope,
      ST_LineLocatePoint(route.geom, p.geom::geometry) AS route_dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c  ON c.id  = p.category_id
    JOIN       cities    ci ON ST_Within(p.geom, ci.geom)
    LEFT JOIN  states    st ON ci.state_id = st.id
    WHERE
      p.is_verified = true
      AND p.is_visible = true
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
      COALESCE(p.state_abbr, st.abbreviation) AS state_abbr,
      st.name                                 AS state_name,
      p.effect_scope,
      ST_LineLocatePoint(route.geom, p.geom::geometry) AS route_dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c  ON c.id  = p.category_id
    JOIN       counties  co ON ST_Within(p.geom, co.geom)
    LEFT JOIN  states    st ON co.state_id = st.id
    WHERE
      p.is_verified = true
      AND p.is_visible = true
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
      COALESCE(p.state_abbr, st.abbreviation) AS state_abbr,
      st.name                                 AS state_name,
      p.effect_scope,
      ST_LineLocatePoint(route.geom, p.geom::geometry) AS route_dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c ON c.id  = p.category_id
    JOIN       states    st ON ST_Within(p.geom, st.geom)
    WHERE
      p.is_verified = true
      AND p.is_visible = true
      AND p.effect_scope = 'state'
      AND p.geom IS NOT NULL
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
      AND ST_Intersects(st.geom, route.geom)
  )
  (SELECT id, title, description, category_id, is_verified, tags,
          lng, lat, color, severity, icon, state_abbr, state_name, effect_scope, route_dist
   FROM point_items
   ORDER BY route_dist
   LIMIT 100)
  UNION ALL
  (SELECT id, title, description, category_id, is_verified, tags,
          lng, lat, color, severity, icon, state_abbr, state_name, effect_scope, route_dist
   FROM city_items
   ORDER BY route_dist)
  UNION ALL
  (SELECT id, title, description, category_id, is_verified, tags,
          lng, lat, color, severity, icon, state_abbr, state_name, effect_scope, route_dist
   FROM county_items
   ORDER BY route_dist)
  UNION ALL
  (SELECT id, title, description, category_id, is_verified, tags,
          lng, lat, color, severity, icon, state_abbr, state_name, effect_scope, route_dist
   FROM state_items
   ORDER BY route_dist);
$$;
