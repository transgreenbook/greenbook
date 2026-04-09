-- Rewrite pois_in_state / pois_in_county / pois_in_city.
--
-- Root issues fixed:
--   1. Old functions JOINed on state_id/county_id/city_id FK columns which
--      are NULL for POIs created via the admin form. Now uses ST_Within
--      spatial containment instead.
--   2. Old functions filtered on p.scope; column is p.effect_scope.
--   3. SQL-language functions suffer a PostgreSQL query-planner issue with
--      spatial JOINs when CHAR parameters are involved. Rewritten in
--      PL/pgSQL with a two-step lookup (get region ID first, then join).
--   4. Results now ordered by severity magnitude so the most impactful
--      POIs surface first.
--
-- Parameter types changed to TEXT (from CHAR) for safe Supabase RPC calls.

DROP FUNCTION IF EXISTS pois_in_state(CHAR);
DROP FUNCTION IF EXISTS pois_in_county(CHAR);
DROP FUNCTION IF EXISTS pois_in_city(TEXT, CHAR);

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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_state_id INT;
BEGIN
  SELECT s.id INTO v_state_id FROM states s WHERE s.abbreviation = p_abbr::char(2);
  IF v_state_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
           ST_X(p.geom) AS lng, ST_Y(p.geom) AS lat,
           COALESCE(p.color, c.color), p.severity, COALESCE(p.icon, c.icon)
    FROM points_of_interest p
    JOIN states st ON st.id = v_state_id AND ST_Within(p.geom, st.geom)
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.is_verified = true
      AND p.effect_scope::text = 'state'
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
    ORDER BY ABS(p.severity) DESC NULLS LAST, p.title;
END $$;

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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_county_id INT;
BEGIN
  SELECT co.id INTO v_county_id FROM counties co WHERE co.fips_code = p_fips::char(5);
  IF v_county_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
           ST_X(p.geom) AS lng, ST_Y(p.geom) AS lat,
           COALESCE(p.color, c.color), p.severity, COALESCE(p.icon, c.icon)
    FROM points_of_interest p
    JOIN counties co ON co.id = v_county_id AND ST_Within(p.geom, co.geom)
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.is_verified = true
      AND p.effect_scope::text = 'county'
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
    ORDER BY ABS(p.severity) DESC NULLS LAST, p.title;
END $$;

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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_city_id INT;
BEGIN
  SELECT ci.id INTO v_city_id
  FROM cities ci
  JOIN states st ON st.id = ci.state_id
  WHERE ci.name = p_city_name AND st.statefp = p_statefp::char(2)
  LIMIT 1;
  IF v_city_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
           ST_X(p.geom) AS lng, ST_Y(p.geom) AS lat,
           COALESCE(p.color, c.color), p.severity, COALESCE(p.icon, c.icon)
    FROM points_of_interest p
    JOIN cities ci ON ci.id = v_city_id AND ST_Within(p.geom, ci.geom)
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.is_verified = true
      AND p.effect_scope::text = 'city'
      AND (p.visible_start IS NULL OR p.visible_start <= now())
      AND (p.visible_end   IS NULL OR p.visible_end   >  now())
    ORDER BY ABS(p.severity) DESC NULLS LAST, p.title;
END $$;
