-- Add a dedicated legislation_url column to points_of_interest.
ALTER TABLE points_of_interest
ADD COLUMN IF NOT EXISTS legislation_url TEXT;

-- Update get_poi_for_edit to return the new field.
DROP FUNCTION IF EXISTS get_poi_for_edit(INT);
CREATE FUNCTION get_poi_for_edit(poi_id INT)
RETURNS TABLE(
  id               INT,
  title            TEXT,
  description      TEXT,
  long_description TEXT,
  tags             TEXT[],
  category_id      INT,
  is_verified      BOOLEAN,
  lat              FLOAT8,
  lng              FLOAT8,
  website_url      TEXT,
  phone            TEXT,
  icon             TEXT,
  color            TEXT,
  effect_scope     poi_scope,
  prominence       poi_prominence,
  severity         SMALLINT,
  visible_start    DATE,
  visible_end      DATE,
  legislation_url  TEXT
) LANGUAGE sql AS $$
  SELECT
    id,
    title,
    description,
    long_description,
    tags,
    category_id,
    is_verified,
    ST_Y(geom::geometry) AS lat,
    ST_X(geom::geometry) AS lng,
    website_url,
    phone,
    icon,
    color,
    effect_scope,
    prominence,
    severity,
    visible_start,
    visible_end,
    legislation_url
  FROM points_of_interest
  WHERE id = poi_id;
$$;
