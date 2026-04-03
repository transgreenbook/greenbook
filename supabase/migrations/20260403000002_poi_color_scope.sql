-- Add per-POI color override column (falls back to category color if null)
ALTER TABLE points_of_interest ADD COLUMN IF NOT EXISTS color TEXT;

-- Update pois_in_viewport to prefer per-POI color over category color
CREATE OR REPLACE FUNCTION public.pois_in_viewport(
  west  double precision,
  south double precision,
  east  double precision,
  north double precision
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
  scope        poi_scope
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
    p.scope
  FROM points_of_interest p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE
    p.is_verified = true
    AND p.scope = 'point'
    AND p.geom IS NOT NULL
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
    AND ST_Within(
      p.geom,
      ST_MakeEnvelope(west, south, east, north, 4326)
    )
  LIMIT 500;
$$;

-- Update poi_export view to include per-POI color
DROP VIEW IF EXISTS poi_export;
CREATE VIEW poi_export AS
SELECT
  p.id,
  p.title,
  p.description,
  p.long_description,
  ST_Y(p.geom) AS lat,
  ST_X(p.geom) AS lng,
  c.name        AS category,
  p.tags,
  p.is_verified,
  p.website_url,
  p.phone,
  p.icon,
  p.color,
  p.severity,
  p.scope,
  p.visible_start,
  p.visible_end,
  p.sheet_id
FROM points_of_interest p
LEFT JOIN categories c ON c.id = p.category_id;
