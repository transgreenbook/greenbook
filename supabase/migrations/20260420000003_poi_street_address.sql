-- Add street_address as a first-class column on points_of_interest.
-- Previously stored only in attributes.address (JSONB); this makes it
-- queryable, indexable, and editable in the admin form.
-- Backfill from attributes for any rows that have it set there.

ALTER TABLE points_of_interest
  ADD COLUMN IF NOT EXISTS street_address TEXT;

UPDATE points_of_interest
  SET street_address = attributes->>'address'
  WHERE attributes ? 'address'
    AND street_address IS NULL;

-- Expose street_address in the edit RPC
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
  street_address   TEXT,
  website_url      TEXT,
  legislation_url  TEXT,
  phone            TEXT,
  icon             TEXT,
  color            TEXT,
  effect_scope     poi_scope,
  prominence       poi_prominence,
  severity         SMALLINT,
  visible_start    DATE,
  visible_end      DATE,
  source_date      DATE
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
    street_address,
    website_url,
    legislation_url,
    phone,
    icon,
    color,
    effect_scope,
    prominence,
    severity,
    visible_start,
    visible_end,
    source_date
  FROM points_of_interest
  WHERE id = poi_id;
$$;
