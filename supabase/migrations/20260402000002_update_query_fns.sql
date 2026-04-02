-- Update pois_in_viewport, pois_along_route, and search_pois to:
--   1. Add visibility window filter (visible_start / visible_end)
--   2. Return severity, icon, and scope
--   3. For city/county/state scoped items, derive lng/lat from the
--      centroid of the containing area rather than returning NULL
-- All three functions are SECURITY DEFINER so they bypass RLS and must
-- enforce visibility themselves.

-- ============================================================
-- Shared helper: resolve lng/lat for any scope
-- Point items use their own geom.
-- City/county/state items use the centroid of their container.
-- ============================================================

-- ============================================================
-- pois_in_viewport
-- Returns point-scoped items within the viewport bounding box.
-- City/county/state items are excluded here — they are fetched
-- separately by their containing area's overlap with the viewport.
-- ============================================================

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
  color       TEXT,
  severity    SMALLINT,
  icon        TEXT,
  scope       poi_scope
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
    ST_X(p.geom::geometry)   AS lng,
    ST_Y(p.geom::geometry)   AS lat,
    c.color,
    p.severity,
    COALESCE(p.icon, c.icon) AS icon,
    p.scope
  FROM points_of_interest p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE
    p.is_verified = true
    AND p.scope = 'point'
    AND p.geom IS NOT NULL
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
    AND ST_Within(
      p.geom,
      ST_MakeEnvelope(west, south, east, north, 4326)
    )
  LIMIT 500;
$$;

-- ============================================================
-- pois_along_route
-- Point items within buffer distance + city/county/state items
-- whose area the route passes through.
-- lng/lat for area items is the centroid of their container.
-- ============================================================

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
  icon        TEXT,
  scope       poi_scope
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH route AS (
    SELECT
      ST_GeomFromGeoJSON(route_geojson)::geography AS geog,
      ST_GeomFromGeoJSON(route_geojson)::geometry  AS geom
  ),
  point_items AS (
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(p.geom::geometry)   AS lng,
      ST_Y(p.geom::geometry)   AS lat,
      c.color,
      p.severity,
      COALESCE(p.icon, c.icon) AS icon,
      p.scope,
      ST_Distance(p.geom::geography, route.geog) AS dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE
      p.is_verified = true
      AND p.scope = 'point'
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
      c.color,
      p.severity,
      COALESCE(p.icon, c.icon) AS icon,
      p.scope,
      NULL::FLOAT AS dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c  ON c.id  = p.category_id
    JOIN       cities    ci ON ci.id = p.city_id
    WHERE
      p.is_verified = true
      AND p.scope = 'city'
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
      AND ST_Intersects(ci.geom, route.geom)
  ),
  county_items AS (
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(ST_Centroid(co.geom)::geometry) AS lng,
      ST_Y(ST_Centroid(co.geom)::geometry) AS lat,
      c.color,
      p.severity,
      COALESCE(p.icon, c.icon) AS icon,
      p.scope,
      NULL::FLOAT AS dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c  ON c.id  = p.category_id
    JOIN       counties  co ON co.id = p.county_id
    WHERE
      p.is_verified = true
      AND p.scope = 'county'
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
      AND ST_Intersects(co.geom, route.geom)
  ),
  state_items AS (
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(ST_Centroid(st.geom)::geometry) AS lng,
      ST_Y(ST_Centroid(st.geom)::geometry) AS lat,
      c.color,
      p.severity,
      COALESCE(p.icon, c.icon) AS icon,
      p.scope,
      NULL::FLOAT AS dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c ON c.id  = p.category_id
    JOIN       states    st ON st.id = p.state_id
    WHERE
      p.is_verified = true
      AND p.scope = 'state'
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
      AND ST_Intersects(st.geom, route.geom)
  )
  -- Point items first, closest first; area items follow alphabetically.
  -- Parentheses are required by PostgreSQL for ORDER BY on individual UNION parts.
  (SELECT id, title, description, category_id, is_verified, tags,
          lng, lat, color, severity, icon, scope
   FROM point_items
   ORDER BY dist
   LIMIT 100)

  UNION ALL

  (SELECT id, title, description, category_id, is_verified, tags,
          lng, lat, color, severity, icon, scope
   FROM city_items
   ORDER BY title)

  UNION ALL

  (SELECT id, title, description, category_id, is_verified, tags,
          lng, lat, color, severity, icon, scope
   FROM county_items
   ORDER BY title)

  UNION ALL

  (SELECT id, title, description, category_id, is_verified, tags,
          lng, lat, color, severity, icon, scope
   FROM state_items
   ORDER BY title);
$$;

-- ============================================================
-- search_pois
-- All scopes are searchable.
-- lng/lat for area-scoped items is the centroid of their container.
-- ============================================================

DROP FUNCTION IF EXISTS search_pois(text);

CREATE OR REPLACE FUNCTION search_pois(query TEXT)
RETURNS TABLE (
  id          INT,
  title       TEXT,
  description TEXT,
  lat         FLOAT8,
  lng         FLOAT8,
  category_id INT,
  is_verified BOOLEAN,
  tags        TEXT[],
  severity    SMALLINT,
  icon        TEXT,
  scope       poi_scope
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.title,
    p.description,
    COALESCE(
      ST_Y(p.geom::geometry),
      ST_Y(ST_Centroid(ci.geom)::geometry),
      ST_Y(ST_Centroid(co.geom)::geometry),
      ST_Y(ST_Centroid(st.geom)::geometry)
    ) AS lat,
    COALESCE(
      ST_X(p.geom::geometry),
      ST_X(ST_Centroid(ci.geom)::geometry),
      ST_X(ST_Centroid(co.geom)::geometry),
      ST_X(ST_Centroid(st.geom)::geometry)
    ) AS lng,
    p.category_id,
    p.is_verified,
    p.tags,
    p.severity,
    COALESCE(p.icon, c.icon) AS icon,
    p.scope
  FROM points_of_interest p
  LEFT JOIN categories c  ON c.id  = p.category_id
  LEFT JOIN cities     ci ON ci.id = p.city_id
  LEFT JOIN counties   co ON co.id = p.county_id
  LEFT JOIN states     st ON st.id = p.state_id
  WHERE
    p.is_verified = true
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
    AND (
      p.search_vector @@ plainto_tsquery('english', query)
      OR p.title ILIKE '%' || query || '%'
    )
  ORDER BY
    ts_rank(p.search_vector, plainto_tsquery('english', query)) DESC,
    p.title
  LIMIT 10;
$$;
