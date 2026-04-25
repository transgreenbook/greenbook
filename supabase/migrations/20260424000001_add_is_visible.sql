-- Add is_visible to points_of_interest.
--
-- is_visible controls whether a POI appears on the public map, independently
-- of is_verified (data quality signal). This lets admins hide a POI without
-- "un-verifying" it — e.g. a verified venue that has temporarily closed, a
-- seasonal POI, or a bulk-import batch pending curation.
--
-- All existing rows default to true so current map behaviour is unchanged.
-- Map queries gain AND p.is_visible = true alongside the existing
-- AND p.is_verified = true filter.

-- ── 1. Column ─────────────────────────────────────────────────────────────
ALTER TABLE points_of_interest
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;

-- ── 2. RLS ────────────────────────────────────────────────────────────────
-- Public users see only verified AND visible POIs; admins see everything.
DROP POLICY IF EXISTS "read_pois" ON points_of_interest;
CREATE POLICY "read_pois"
  ON points_of_interest FOR SELECT
  USING ((is_verified = true AND is_visible = true) OR is_admin());

-- ── 3. pois view ──────────────────────────────────────────────────────────
-- Expose is_visible so client queries (POIDetailPanel, etc.) can read it.
CREATE OR REPLACE VIEW pois AS
SELECT
  id,
  title,
  description,
  long_description,
  tags,
  ST_Y(geom::geometry) AS lat,
  ST_X(geom::geometry) AS lng,
  is_verified,
  is_visible,
  legislation_url,
  attributes
FROM points_of_interest;

-- ── 4. pois_in_viewport ───────────────────────────────────────────────────
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
    AND p.is_visible = true
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

-- ── 5. pois_in_state ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pois_in_state(p_abbr TEXT)
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
    ST_X(p.geom::geometry)        AS lng,
    ST_Y(p.geom::geometry)        AS lat,
    COALESCE(p.color, c.color)    AS color,
    p.severity,
    COALESCE(p.icon, c.icon)      AS icon
  FROM points_of_interest p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE
    p.is_verified = true
    AND p.is_visible = true
    AND p.effect_scope = 'state'
    AND p.attributes->>'state_abbr' = p_abbr
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ORDER BY ABS(p.severity) DESC NULLS LAST, p.title;
$$;

-- ── 6. pois_in_county ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pois_in_county(p_fips TEXT)
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
    ST_X(p.geom::geometry)        AS lng,
    ST_Y(p.geom::geometry)        AS lat,
    COALESCE(p.color, c.color)    AS color,
    p.severity,
    COALESCE(p.icon, c.icon)      AS icon
  FROM points_of_interest p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE
    p.is_verified = true
    AND p.is_visible = true
    AND p.effect_scope = 'county'
    AND p.attributes->>'county_fips' = p_fips
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ORDER BY ABS(p.severity) DESC NULLS LAST, p.title;
$$;

-- ── 7. pois_in_city ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pois_in_city(p_city_name TEXT, p_statefp TEXT)
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
    ST_X(p.geom::geometry)        AS lng,
    ST_Y(p.geom::geometry)        AS lat,
    COALESCE(p.color, c.color)    AS color,
    p.severity,
    COALESCE(p.icon, c.icon)      AS icon
  FROM points_of_interest p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE
    p.is_verified = true
    AND p.is_visible = true
    AND p.effect_scope = 'city'
    AND p.attributes->>'city_name' = p_city_name
    AND p.attributes->>'statefp'   = p_statefp
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ORDER BY ABS(p.severity) DESC NULLS LAST, p.title;
$$;

-- ── 8. pois_in_reservation ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pois_in_reservation(p_geoid TEXT)
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (p.id)
    p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
    ST_X(p.geom::geometry)        AS lng,
    ST_Y(p.geom::geometry)        AS lat,
    COALESCE(p.color, c.color)    AS color,
    p.severity,
    COALESCE(p.icon, c.icon)      AS icon
  FROM points_of_interest p
  LEFT JOIN categories c ON c.id = p.category_id
  JOIN reservations r ON r.geoid = p_geoid
  WHERE
    p.is_verified = true
    AND p.is_visible = true
    AND (
      ST_Within(p.geom::geometry, r.geom)
      OR
      (p.effect_scope = 'reservation' AND p.attributes->>'geoid' = p_geoid)
    )
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ORDER BY p.id, ABS(p.severity) DESC NULLS LAST, p.title;
$$;

-- ── 9. get_region_scoped_pois ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_region_scoped_pois()
RETURNS TABLE (
  id               integer,
  title            text,
  effect_scope     text,
  severity         integer,
  severity_weight  integer,
  color            text,
  lat              double precision,
  lng              double precision
) LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.title,
    p.effect_scope,
    p.severity,
    COALESCE(c.severity_weight, 100) AS severity_weight,
    p.color,
    ST_Y(p.geom)::double precision AS lat,
    ST_X(p.geom)::double precision AS lng
  FROM points_of_interest p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.is_verified = true
    AND p.is_visible = true
    AND p.effect_scope IN ('state', 'county', 'city')
    AND p.geom IS NOT NULL
$$;

-- ── 10. get_poi_for_edit ─────────────────────────────────────────────────
-- Add is_visible and the missing fields (street_address, legislation_url,
-- source, source_id, source_date, review_after, review_note).
DROP FUNCTION IF EXISTS get_poi_for_edit(INT);
CREATE FUNCTION get_poi_for_edit(poi_id INT)
RETURNS TABLE(
  id               integer,
  title            text,
  description      text,
  long_description text,
  tags             text[],
  category_id      integer,
  is_verified      boolean,
  is_visible       boolean,
  lat              double precision,
  lng              double precision,
  street_address   text,
  website_url      text,
  legislation_url  text,
  phone            text,
  icon             text,
  color            text,
  effect_scope     poi_scope,
  prominence       poi_prominence,
  severity         smallint,
  visible_start    date,
  visible_end      date,
  source           text,
  source_id        text,
  source_date      date,
  review_after     date,
  review_note      text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    id, title, description, long_description, tags, category_id,
    is_verified, is_visible,
    ST_Y(geom::geometry) AS lat,
    ST_X(geom::geometry) AS lng,
    street_address, website_url, legislation_url, phone, icon, color,
    effect_scope, prominence, severity, visible_start, visible_end,
    source, source_id, source_date, review_after, review_note
  FROM points_of_interest
  WHERE id = poi_id;
$$;

-- ── 11. pois_along_route ──────────────────────────────────────────────────
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
      NULL::FLOAT AS dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c ON c.id  = p.category_id
    JOIN       cities    ci ON ST_Within(p.geom, ci.geom)
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
      NULL::FLOAT AS dist
    FROM points_of_interest p
    CROSS JOIN route
    LEFT JOIN categories c  ON c.id  = p.category_id
    JOIN       counties  co ON ST_Within(p.geom, co.geom)
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
      NULL::FLOAT AS dist
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
