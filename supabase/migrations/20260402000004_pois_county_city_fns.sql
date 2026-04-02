-- Add statefp to states for matching against PMTiles feature properties
ALTER TABLE states ADD COLUMN IF NOT EXISTS statefp CHAR(2);
CREATE INDEX IF NOT EXISTS idx_state_statefp ON states(statefp);

-- ============================================================
-- pois_in_county
-- Returns county-scoped POIs for the given 5-digit FIPS code
-- (STATEFP || COUNTYFP as stored in counties.fips_code).
-- ============================================================

CREATE OR REPLACE FUNCTION pois_in_county(fips_code CHAR(5))
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
    ST_X(ST_Centroid(co.geom)::geometry) AS lng,
    ST_Y(ST_Centroid(co.geom)::geometry) AS lat,
    c.color,
    p.severity,
    COALESCE(p.icon, c.icon)             AS icon,
    p.scope
  FROM points_of_interest p
  JOIN   counties   co ON co.id = p.county_id
  LEFT JOIN categories c  ON c.id  = p.category_id
  WHERE
    p.is_verified = true
    AND p.scope = 'county'
    AND co.fips_code = fips_code
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ORDER BY p.title;
$$;

-- ============================================================
-- pois_in_city
-- Returns city-scoped POIs matched by city name + state FIPS.
-- ============================================================

CREATE OR REPLACE FUNCTION pois_in_city(city_name TEXT, statefp CHAR(2))
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
    ST_X(ST_Centroid(ci.geom)::geometry) AS lng,
    ST_Y(ST_Centroid(ci.geom)::geometry) AS lat,
    c.color,
    p.severity,
    COALESCE(p.icon, c.icon)             AS icon,
    p.scope
  FROM points_of_interest p
  JOIN   cities     ci ON ci.id = p.city_id
  JOIN   states     st ON st.id = ci.state_id
  LEFT JOIN categories c  ON c.id  = p.category_id
  WHERE
    p.is_verified = true
    AND p.scope = 'city'
    AND ci.name  = city_name
    AND st.statefp = statefp
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ORDER BY p.title;
$$;
