-- pois_in_bbox: return all POIs relevant to a bounding box, across all scopes.
-- Used by the box-selection panel (shift+drag on the map).
--
-- Unlike pois_in_viewport (point/city only, zoom-filtered), this function:
--   - Includes state and county POIs via spatial intersection with boundaries
--   - Has no zoom threshold — the user explicitly selected the area
--   - Returns effect_scope so the panel can label each result

CREATE OR REPLACE FUNCTION pois_in_bbox(
  west  FLOAT8,
  south FLOAT8,
  east  FLOAT8,
  north FLOAT8
)
RETURNS TABLE (
  id           INT,
  title        TEXT,
  description  TEXT,
  category_id  INT,
  is_verified  BOOLEAN,
  tags         TEXT[],
  lng          FLOAT8,
  lat          FLOAT8,
  color        TEXT,
  severity     SMALLINT,
  icon         TEXT,
  effect_scope TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bbox AS (
    SELECT ST_MakeEnvelope(west, south, east, north, 4326)::geometry AS geom
  ),

  -- Point-scoped POIs whose location falls inside the box
  point_items AS (
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(p.geom::geometry)       AS lng,
      ST_Y(p.geom::geometry)       AS lat,
      COALESCE(p.color, c.color)   AS color,
      p.severity,
      COALESCE(p.icon, c.icon)     AS icon,
      'point'::TEXT                AS effect_scope
    FROM points_of_interest p
    CROSS JOIN bbox
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE
      p.is_verified = true
      AND p.is_visible = true
      AND p.effect_scope = 'point'
      AND p.geom IS NOT NULL
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
      AND ST_Within(p.geom::geometry, bbox.geom)
    LIMIT 200
  ),

  -- City-scoped POIs where the city boundary intersects the box
  city_items AS (
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(ST_Centroid(ci.geom))   AS lng,
      ST_Y(ST_Centroid(ci.geom))   AS lat,
      COALESCE(p.color, c.color)   AS color,
      p.severity,
      COALESCE(p.icon, c.icon)     AS icon,
      'city'::TEXT                 AS effect_scope
    FROM points_of_interest p
    CROSS JOIN bbox
    LEFT JOIN categories c  ON c.id = p.category_id
    JOIN       cities    ci ON ST_Within(p.geom, ci.geom)
    WHERE
      p.is_verified = true
      AND p.is_visible = true
      AND p.effect_scope = 'city'
      AND p.geom IS NOT NULL
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
      AND ST_Intersects(ci.geom, bbox.geom)
  ),

  -- County-scoped POIs where the county boundary intersects the box
  county_items AS (
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(ST_Centroid(co.geom))   AS lng,
      ST_Y(ST_Centroid(co.geom))   AS lat,
      COALESCE(p.color, c.color)   AS color,
      p.severity,
      COALESCE(p.icon, c.icon)     AS icon,
      'county'::TEXT               AS effect_scope
    FROM points_of_interest p
    CROSS JOIN bbox
    LEFT JOIN categories c  ON c.id  = p.category_id
    JOIN       counties  co ON ST_Within(p.geom, co.geom)
    WHERE
      p.is_verified = true
      AND p.is_visible = true
      AND p.effect_scope = 'county'
      AND p.geom IS NOT NULL
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
      AND ST_Intersects(co.geom, bbox.geom)
  ),

  -- State-scoped POIs where the state boundary intersects the box
  state_items AS (
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(ST_Centroid(st.geom))   AS lng,
      ST_Y(ST_Centroid(st.geom))   AS lat,
      COALESCE(p.color, c.color)   AS color,
      p.severity,
      COALESCE(p.icon, c.icon)     AS icon,
      'state'::TEXT                AS effect_scope
    FROM points_of_interest p
    CROSS JOIN bbox
    LEFT JOIN categories c ON c.id  = p.category_id
    JOIN       states    st ON ST_Within(p.geom, st.geom)
    WHERE
      p.is_verified = true
      AND p.is_visible = true
      AND p.effect_scope = 'state'
      AND p.geom IS NOT NULL
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
      AND ST_Intersects(st.geom, bbox.geom)
  )

  SELECT * FROM point_items
  UNION ALL
  SELECT * FROM city_items
  UNION ALL
  SELECT * FROM county_items
  UNION ALL
  SELECT * FROM state_items;
$$;
