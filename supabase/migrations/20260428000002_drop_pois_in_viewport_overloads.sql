-- PGRST203: two overloads of pois_in_viewport coexist:
--   1. (float8, float8, float8, float8, float8 DEFAULT 14)  ← old, zoom was a float with default
--   2. (float8, float8, float8, float8, integer)            ← current canonical version
-- CREATE OR REPLACE only replaces an exact signature match, so both survived.
-- PostgREST can't distinguish them (JSON numbers match both float8 and int).
-- Drop all old overloads; keep only the integer-zoom version.

DROP FUNCTION IF EXISTS pois_in_viewport(float8, float8, float8, float8);
DROP FUNCTION IF EXISTS pois_in_viewport(float8, float8, float8, float8, float8);
