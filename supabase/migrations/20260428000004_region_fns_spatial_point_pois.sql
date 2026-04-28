-- Fix county and city region functions: use spatial joins to find point-scoped
-- POIs within the region instead of FK columns (county_id / city_id), which
-- are not reliably populated on imported rows.
--
-- pois_in_state already works via the attribute-based state_abbr match for
-- state-scoped laws; but its point-scoped UNION also uses state_id FK.
-- Switch that to ST_Within as well for consistency.
--
-- For pois_in_city: cities.geom is a Point, not a polygon, so we can't use
-- ST_Within directly. Instead we find the county that spatially contains the
-- city centroid and use that county's geometry as the containment boundary.

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

    -- Point-scoped physical locations spatially within the state
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
      AND ST_Within(p.geom::geometry, st.geom)
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

    -- Point-scoped physical locations spatially within the county boundary
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
      AND ST_Within(p.geom::geometry, co.geom)
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ) combined
  ORDER BY ABS(combined.severity) DESC NULLS LAST, combined.title;
$$;

-- ── pois_in_city ──────────────────────────────────────────────────────────
-- cities.geom is a Point (centroid), not a polygon. To find point-scoped POIs
-- "within" a city we use the county that spatially contains the city centroid
-- as the containment boundary — a reasonable proxy for the city footprint.
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

    -- Point-scoped physical locations within the county that contains the city
    SELECT
      p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
      ST_X(p.geom::geometry)        AS lng,
      ST_Y(p.geom::geometry)        AS lat,
      COALESCE(p.color, c.color)    AS color,
      p.severity,
      COALESCE(p.icon, c.icon)      AS icon
    FROM points_of_interest p
    LEFT JOIN categories c ON c.id = p.category_id
    JOIN (
      -- Find the county whose boundary contains the city centroid
      SELECT co.geom
      FROM cities ci
      JOIN states st ON st.id = ci.state_id AND st.statefp = p_statefp
      JOIN counties co ON ST_Within(ci.geom, co.geom)
      WHERE ci.name = p_city_name
      LIMIT 1
    ) city_county ON true
    WHERE
      p.is_verified = true
      AND p.is_visible = true
      AND p.effect_scope = 'point'
      AND p.geom IS NOT NULL
      AND ST_Within(p.geom::geometry, city_county.geom)
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ) combined
  ORDER BY ABS(combined.severity) DESC NULLS LAST, combined.title;
$$;
