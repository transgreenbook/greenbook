-- Returns all verified POIs whose effect_scope is a region type (state/county/city).
-- Used by the map to color regions based on severity.
CREATE OR REPLACE FUNCTION get_region_scoped_pois()
RETURNS TABLE (
  id          integer,
  title       text,
  effect_scope text,
  severity    integer,
  color       text,
  lat         double precision,
  lng         double precision
) LANGUAGE sql STABLE AS $$
  SELECT
    id,
    title,
    effect_scope,
    severity,
    color,
    ST_Y(geom)::double precision AS lat,
    ST_X(geom)::double precision AS lng
  FROM points_of_interest
  WHERE is_verified = true
    AND effect_scope IN ('state', 'county', 'city')
    AND geom IS NOT NULL
$$;
