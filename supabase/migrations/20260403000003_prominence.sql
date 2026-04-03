-- Rename scope → effect_scope
ALTER TABLE points_of_interest RENAME COLUMN scope TO effect_scope;

-- Create prominence enum and column
CREATE TYPE poi_prominence AS ENUM ('neighborhood', 'local', 'regional', 'national');
ALTER TABLE points_of_interest ADD COLUMN prominence poi_prominence NOT NULL DEFAULT 'local';

-- Update pois_in_viewport to accept zoom, filter by prominence, use effect_scope
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
      WHEN 'regional'     THEN zoom >= 8
      WHEN 'local'        THEN zoom >= 11
      WHEN 'neighborhood' THEN zoom >= 14
    END
  LIMIT 500;
$$;

-- Update poi_export view
DROP VIEW IF EXISTS poi_export;
CREATE VIEW poi_export AS
SELECT
  p.id,
  p.title,
  p.description,
  p.long_description,
  ST_Y(p.geom) AS lat,
  ST_X(p.geom) AS lng,
  c.name          AS category,
  p.tags,
  p.is_verified,
  p.website_url,
  p.phone,
  p.icon,
  p.color,
  p.effect_scope,
  p.prominence,
  p.severity,
  p.visible_start,
  p.visible_end,
  p.sheet_id
FROM points_of_interest p
LEFT JOIN categories c ON c.id = p.category_id;
