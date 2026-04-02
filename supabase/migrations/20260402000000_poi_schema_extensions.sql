-- POI schema extensions:
--   - Add poi_scope enum (point | city | county | state)
--   - Add icon to categories
--   - Change cities.geom from Point to MultiPolygon (for ST_Within city lookup)
--   - Add severity, visible_start, visible_end, icon, scope, city_id to points_of_interest
--   - Make points_of_interest.geom nullable (city/county/state scoped items have no fixed point)
--   - Update RLS policy to enforce visibility window

-- ============================================================
-- New enum
-- ============================================================

-- point  = fixed geographic coordinate
-- city   = applies to a city; lng/lat derived from city centroid
-- county = applies to a county; lng/lat derived from county centroid
-- state  = applies to a state; lng/lat derived from state centroid
CREATE TYPE poi_scope AS ENUM ('point', 'city', 'county', 'state');

-- ============================================================
-- categories: add default icon
-- ============================================================

ALTER TABLE categories ADD COLUMN icon TEXT;

-- ============================================================
-- cities: upgrade geom from centroid Point to full MultiPolygon
-- Existing centroid data is cleared; run scripts/seed-cities.sh
-- to populate from TIGER/Line place shapefiles.
-- ============================================================

ALTER TABLE cities DROP COLUMN geom;
ALTER TABLE cities ADD COLUMN geom GEOMETRY(MultiPolygon, 4326);

DROP INDEX IF EXISTS idx_city_geom;
CREATE INDEX idx_city_geom ON cities USING GIST(geom);

-- ============================================================
-- points_of_interest: new fields
-- ============================================================

-- Make geom nullable — city/county/state scoped items have no fixed geographic point
ALTER TABLE points_of_interest ALTER COLUMN geom DROP NOT NULL;

ALTER TABLE points_of_interest
  ADD COLUMN severity      SMALLINT    NOT NULL DEFAULT 0
                           CHECK (severity BETWEEN -10 AND 10),
  ADD COLUMN visible_start TIMESTAMPTZ,
  ADD COLUMN visible_end   TIMESTAMPTZ,
  ADD COLUMN icon          TEXT,
  ADD COLUMN scope         poi_scope   NOT NULL DEFAULT 'point',
  ADD COLUMN city_id       INT         REFERENCES cities(id);

-- ============================================================
-- Additional indexes
-- ============================================================

CREATE INDEX idx_poi_city_id  ON points_of_interest (city_id);
CREATE INDEX idx_poi_severity ON points_of_interest (severity);
CREATE INDEX idx_poi_visible  ON points_of_interest (visible_start, visible_end);

-- ============================================================
-- Update RLS visibility policy
-- A verified POI is publicly readable only within its visibility window:
--   visible_start has passed (or is unset) AND visible_end has not passed (or is unset)
-- ============================================================

DROP POLICY IF EXISTS "public_read_verified_pois" ON points_of_interest;

CREATE POLICY "public_read_verified_pois"
  ON points_of_interest FOR SELECT
  USING (
    is_verified = true
    AND (visible_start IS NULL OR visible_start <= now())
    AND (visible_end   IS NULL OR visible_end   >  now())
  );
