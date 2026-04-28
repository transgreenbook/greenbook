-- Include point-scoped POIs in region panel queries.
--
-- pois_in_state / pois_in_county / pois_in_city previously returned only
-- POIs whose effect_scope matched the region level (state/county/city).
-- This meant physical-location POIs (restrooms, venues, etc.) — which have
-- effect_scope = 'point' — never appeared in the region sidebar even when
-- they were clearly within the selected region.
--
-- Fix: UNION each function with the point-scoped POIs that belong to the
-- same region, identified via the FK columns on points_of_interest:
--   state:  p.state_id  = (SELECT id FROM states WHERE abbreviation = p_abbr)
--   county: p.county_id = (SELECT id FROM counties WHERE fips_code = p_fips)
--   city:   p.city_id   = (SELECT ci.id FROM cities ci
--                           JOIN states st ON st.id = ci.state_id
--                           WHERE ci.name = p_city_name AND st.statefp = p_statefp)
--
-- Note: PostgreSQL forbids expressions in ORDER BY across a bare UNION, so
-- the UNION is wrapped in a subquery before sorting.

-- ── pois_in_state ─────────────────────────────────────────────────────────
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
  SELECT * FROM (
    -- State-scoped policies / laws
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

    UNION ALL

    -- Point-scoped physical locations within the state
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(p.geom::geometry)        AS lng,
      ST_Y(p.geom::geometry)        AS lat,
      COALESCE(p.color, c.color)    AS color,
      p.severity,
      COALESCE(p.icon, c.icon)      AS icon
    FROM points_of_interest p
    LEFT JOIN categories c ON c.id = p.category_id
    JOIN states st ON st.abbreviation = p_abbr
    WHERE
      p.is_verified = true
      AND p.is_visible = true
      AND p.effect_scope = 'point'
      AND p.geom IS NOT NULL
      AND p.state_id = st.id
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ) combined
  ORDER BY ABS(combined.severity) DESC NULLS LAST, combined.title;
$$;

-- ── pois_in_county ────────────────────────────────────────────────────────
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
  SELECT * FROM (
    -- County-scoped policies / laws
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

    UNION ALL

    -- Point-scoped physical locations within the county
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(p.geom::geometry)        AS lng,
      ST_Y(p.geom::geometry)        AS lat,
      COALESCE(p.color, c.color)    AS color,
      p.severity,
      COALESCE(p.icon, c.icon)      AS icon
    FROM points_of_interest p
    LEFT JOIN categories c ON c.id = p.category_id
    JOIN counties co ON co.fips_code = p_fips
    WHERE
      p.is_verified = true
      AND p.is_visible = true
      AND p.effect_scope = 'point'
      AND p.geom IS NOT NULL
      AND p.county_id = co.id
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ) combined
  ORDER BY ABS(combined.severity) DESC NULLS LAST, combined.title;
$$;

-- ── pois_in_city ──────────────────────────────────────────────────────────
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
  SELECT * FROM (
    -- City-scoped policies / laws
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

    UNION ALL

    -- Point-scoped physical locations within the city
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
      AND p.effect_scope = 'point'
      AND p.geom IS NOT NULL
      AND p.city_id IN (
        SELECT ci.id
        FROM cities ci
        JOIN states st ON st.id = ci.state_id
        WHERE ci.name = p_city_name
          AND st.statefp = p_statefp
      )
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ) combined
  ORDER BY ABS(combined.severity) DESC NULLS LAST, combined.title;
$$;
