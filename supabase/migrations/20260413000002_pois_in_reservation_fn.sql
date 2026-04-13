-- pois_in_reservation: returns all verified POIs whose point geometry falls
-- within a reservation's boundary polygon.
--
-- Uses a spatial join (ST_Within) against the reservations table.
-- Also returns any POIs explicitly scoped to this reservation via
-- effect_scope = 'reservation' AND attributes->>'geoid' = p_geoid,
-- in case future tribal-law entries are added without a map point.

CREATE OR REPLACE FUNCTION pois_in_reservation(p_geoid TEXT)
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
  SELECT DISTINCT ON (p.id)
    p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
    ST_X(p.geom::geometry)        AS lng,
    ST_Y(p.geom::geometry)        AS lat,
    COALESCE(p.color, c.color)    AS color,
    p.severity,
    COALESCE(p.icon, c.icon)      AS icon
  FROM points_of_interest p
  LEFT JOIN categories c ON c.id = p.category_id
  JOIN reservations r ON r.geoid = p_geoid
  WHERE
    p.is_verified = true
    AND (
      -- Point POIs spatially within the reservation boundary
      ST_Within(p.geom::geometry, r.geom)
      OR
      -- Explicitly scoped reservation entries (future tribal laws)
      (p.effect_scope = 'reservation' AND p.attributes->>'geoid' = p_geoid)
    )
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ORDER BY p.id, ABS(p.severity) DESC NULLS LAST, p.title;
$$;
