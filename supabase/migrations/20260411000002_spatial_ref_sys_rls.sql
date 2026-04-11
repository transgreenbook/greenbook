-- Block API access to the PostGIS system table spatial_ref_sys.
-- The table is in the public schema so PostgREST can see it, but no API
-- caller needs to query it. We can't ALTER TABLE (PostGIS owns it), so
-- instead revoke SELECT from the PostgREST roles directly.
REVOKE ALL ON spatial_ref_sys FROM anon, authenticated;
