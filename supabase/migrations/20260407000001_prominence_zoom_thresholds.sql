-- Adjust prominence zoom thresholds:
--   regional:     8  → 7
--   local:        11 → 10
--   neighborhood: 14 → 13

CREATE OR REPLACE FUNCTION public.pois_in_viewport(
  west  double precision,
  south double precision,
  east  double precision,
  north double precision,
  zoom  double precision DEFAULT 14
)
RETURNS TABLE(
  id           integer,
  title        text,
  description  text,
  category_id  integer,
  is_verified  boolean,
  tags         text[],
  lng          double precision,
  lat          double precision,
  color        text,
  severity     smallint,
  icon         text,
  effect_scope poi_scope,
  prominence   poi_prominence
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    p.id,
    p.title,
    p.description,
    p.category_id,
    p.is_verified,
    p.tags,
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
    AND p.effect_scope = 'point'
    AND p.geom IS NOT NULL
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
    AND ST_Within(
      p.geom,
      ST_MakeEnvelope(west, south, east, north, 4326)
    )
    AND CASE p.prominence
      WHEN 'national'     THEN true
      WHEN 'regional'     THEN zoom >= 7
      WHEN 'local'        THEN zoom >= 10
      WHEN 'neighborhood' THEN zoom >= 13
    END
  LIMIT 500;
$$;
