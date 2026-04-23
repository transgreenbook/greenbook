-- Add review_after and review_note to support a "check back on this POI"
-- workflow in the admin panel.
--
-- review_after DATE  — don't bother reviewing until on/after this date
-- review_note  TEXT  — why it needs review (e.g. "operator changing in June 2026")
--
-- A POI is "due for review" when review_after IS NOT NULL AND review_after <= CURRENT_DATE.

ALTER TABLE points_of_interest ADD COLUMN IF NOT EXISTS review_after DATE;
ALTER TABLE points_of_interest ADD COLUMN IF NOT EXISTS review_note  TEXT;

-- Update get_poi_for_edit to return the new fields.
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
  source_date      DATE,
  source           TEXT,
  source_id        TEXT,
  review_after     DATE,
  review_note      TEXT
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
    source_date,
    source,
    source_id,
    review_after,
    review_note
  FROM points_of_interest
  WHERE id = poi_id;
$$;
