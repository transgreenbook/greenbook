-- Restrict poi_export view to service_role only.
-- This view is used exclusively by admin/sync scripts that run with the
-- service role key. There is no reason for anon or authenticated users
-- to access it via the PostgREST API, and the view has no is_verified
-- filter so leaving it open would expose unverified POIs.
REVOKE SELECT ON poi_export FROM anon, authenticated;
