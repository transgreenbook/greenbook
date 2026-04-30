-- pois_in_bbox_within_state
-- Like pois_in_bbox but clips point-scoped POIs to the actual state boundary
-- (ST_Within against states.geom) instead of a raw rectangular envelope.
-- Used for county/city region queries where the bbox may cross state borders.

CREATE OR REPLACE FUNCTION public.pois_in_bbox_within_state(
  west        double precision,
  south       double precision,
  east        double precision,
  north       double precision,
  p_state_abbr text
)
RETURNS TABLE(
  id          integer,
  title       text,
  description text,
  category_id integer,
  is_verified boolean,
  tags        text[],
  lng         double precision,
  lat         double precision,
  color       text,
  severity    smallint,
  icon        text,
  effect_scope text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
    ST_X(p.geom::geometry)      AS lng,
    ST_Y(p.geom::geometry)      AS lat,
    COALESCE(p.color, c.color)  AS color,
    p.severity,
    COALESCE(p.icon, c.icon)    AS icon,
    'point'::text               AS effect_scope
  FROM points_of_interest p
  JOIN states st ON st.abbreviation = p_state_abbr
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE
    p.is_verified = true
    AND p.is_visible = true
    AND p.effect_scope = 'point'
    AND p.geom IS NOT NULL
    AND ST_Within(
          p.geom::geometry,
          ST_Intersection(
            st.geom,
            ST_MakeEnvelope(west, south, east, north, 4326)::geometry
          )
        )
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.pois_in_bbox_within_state(double precision, double precision, double precision, double precision, text)
  TO anon, authenticated;
