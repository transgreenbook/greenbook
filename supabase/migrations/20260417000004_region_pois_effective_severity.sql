-- Update get_region_scoped_pois to include category severity_weight.
-- severity_weight controls the opacity contribution of this POI's color on the map.
-- The hook multiplies the base opacity by (severity_weight / 100) so that
-- weight=0 → invisible, weight=50 → half brightness, weight=100 → full brightness.
-- Sort key for "most dominant POI wins" is |severity| * severity_weight.

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
    AND p.effect_scope IN ('state', 'county', 'city')
    AND p.geom IS NOT NULL
$$;
