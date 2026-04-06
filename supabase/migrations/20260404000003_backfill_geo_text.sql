-- Backfill state_abbr, county_name, and city_name for existing POIs.
-- The bidirectional trigger only fires when geom changes, so existing rows
-- need a one-time direct update.
--
-- Only handles Direction A (geom → region) for point-scoped POIs,
-- which is the common case for missing geo text data.

UPDATE points_of_interest AS p
SET
  state_id    = sub.state_id,
  state_abbr  = sub.state_abbr,
  county_id   = sub.county_id,
  county_name = sub.county_name,
  city_id     = sub.city_id,
  city_name   = sub.city_name
FROM (
  SELECT
    p2.id,
    s.id             AS state_id,
    s.abbreviation   AS state_abbr,
    co.id            AS county_id,
    co.name          AS county_name,
    ci.id            AS city_id,
    COALESCE(ci.name, '-') AS city_name
  FROM points_of_interest p2
  JOIN   states   s  ON ST_Within(p2.geom, s.geom)
  LEFT JOIN counties co ON ST_Within(p2.geom, co.geom)
  LEFT JOIN cities   ci ON ST_Within(p2.geom, ci.geom)
  WHERE p2.geom IS NOT NULL
    AND p2.effect_scope = 'point'
    AND p2.state_abbr IS NULL
) sub
WHERE p.id = sub.id;
