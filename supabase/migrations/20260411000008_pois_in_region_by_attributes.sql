-- Rewrite pois_in_state / pois_in_county / pois_in_city to match region-scoped
-- POIs by attributes->>'state_abbr' / 'county_fips' / 'city_name' + 'statefp'
-- instead of via the states/counties/cities boundary tables (which may be empty).
--
-- The import script (scripts/import-laws.mjs) now stores the scope identifier
-- in the attributes JSONB alongside the existing enacted_date, source_url, etc.
-- This makes the functions self-contained and independent of boundary table state.

-- ============================================================
-- pois_in_state
-- ============================================================
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
    AND p.effect_scope = 'state'
    AND p.attributes->>'state_abbr' = p_abbr
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ORDER BY ABS(p.severity) DESC NULLS LAST, p.title;
$$;

-- ============================================================
-- pois_in_county
-- ============================================================
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
    AND p.effect_scope = 'county'
    AND p.attributes->>'county_fips' = p_fips
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ORDER BY ABS(p.severity) DESC NULLS LAST, p.title;
$$;

-- ============================================================
-- pois_in_city
-- ============================================================
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
    AND p.effect_scope = 'city'
    AND p.attributes->>'city_name' = p_city_name
    AND p.attributes->>'statefp'   = p_statefp
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ORDER BY ABS(p.severity) DESC NULLS LAST, p.title;
$$;
