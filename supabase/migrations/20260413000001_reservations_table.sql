-- Add 'reservation' to the poi_scope enum so reservation-scoped POI entries
-- can be stored (e.g., future tribal law entries).
ALTER TYPE poi_scope ADD VALUE IF NOT EXISTS 'reservation';

-- Native American / Alaska Native / Hawaiian Home Land reservation boundaries.
-- Boundary geometry is loaded from the US Census TIGER/Line AIANNH shapefile
-- via scripts/seed-boundaries.sh after running scripts/build-tiles.sh.
--
-- geoid: 4-digit AIANNHCE code (unique identifier from TIGER).
-- aian_type: raw AIANTYPE field from TIGER ('R' reservation, 'T' trust land, etc.)

CREATE TABLE IF NOT EXISTS reservations (
  id        SERIAL PRIMARY KEY,
  name      TEXT    NOT NULL,
  geoid     CHAR(5) NOT NULL UNIQUE,  -- TIGER AIANNH GEOID (5 chars)
  aian_type TEXT,                     -- AIANNHR field: reservation type code
  geom      GEOMETRY(MultiPolygon, 4326)
);

CREATE INDEX IF NOT EXISTS reservations_geom_idx ON reservations USING GIST (geom);

-- RLS: reservations are public read-only.
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservations_public_read" ON reservations FOR SELECT USING (true);
