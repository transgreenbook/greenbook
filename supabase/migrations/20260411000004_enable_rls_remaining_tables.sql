-- Enable RLS on all remaining public tables that were missing it.
--
-- states / counties / cities: geographic reference data; public read-only.
--   No write policies — these tables are populated via migrations and seed
--   scripts, never via the PostgREST API.
--
-- poi_links / poi_images: supplemental data attached to POIs; public can
--   read, admins can manage.

-- ============================================================
-- states
-- ============================================================
ALTER TABLE states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_states"
  ON states FOR SELECT USING (true);

-- ============================================================
-- counties
-- ============================================================
ALTER TABLE counties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_counties"
  ON counties FOR SELECT USING (true);

-- ============================================================
-- cities
-- ============================================================
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_cities"
  ON cities FOR SELECT USING (true);

-- ============================================================
-- poi_links
-- ============================================================
ALTER TABLE poi_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_poi_links"
  ON poi_links FOR SELECT USING (true);

CREATE POLICY "admins_insert_poi_links"
  ON poi_links FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "admins_update_poi_links"
  ON poi_links FOR UPDATE USING (is_admin());

CREATE POLICY "admins_delete_poi_links"
  ON poi_links FOR DELETE USING (is_admin());

-- ============================================================
-- poi_images
-- ============================================================
ALTER TABLE poi_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_poi_images"
  ON poi_images FOR SELECT USING (true);

CREATE POLICY "admins_insert_poi_images"
  ON poi_images FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "admins_update_poi_images"
  ON poi_images FOR UPDATE USING (is_admin());

CREATE POLICY "admins_delete_poi_images"
  ON poi_images FOR DELETE USING (is_admin());
