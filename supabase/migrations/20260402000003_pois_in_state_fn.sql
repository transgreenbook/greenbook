-- pois_in_state
-- Returns all state-scoped POIs for a given state abbreviation (e.g. 'CA').
-- lng/lat is the centroid of the state geometry.
-- SECURITY DEFINER so it bypasses RLS and enforces visibility itself.

CREATE OR REPLACE FUNCTION pois_in_state(state_abbr CHAR(2))
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
    ST_X(ST_Centroid(st.geom)::geometry) AS lng,
    ST_Y(ST_Centroid(st.geom)::geometry) AS lat,
    c.color,
    p.severity,
    COALESCE(p.icon, c.icon)             AS icon,
    p.scope
  FROM points_of_interest p
  JOIN   states     st ON st.id = p.state_id
  LEFT JOIN categories c  ON c.id  = p.category_id
  WHERE
    p.is_verified = true
    AND p.scope = 'state'
    AND st.abbreviation = state_abbr
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
  ORDER BY p.title;
$$;
