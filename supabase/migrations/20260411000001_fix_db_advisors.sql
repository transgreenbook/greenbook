-- Fix all Supabase DB advisor warnings:
--   1. auth_rls_initplan       — wrap auth.uid() in (select ...) so it is
--                                evaluated once per query, not once per row
--   2. multiple_permissive_policies — merge duplicate SELECT policies and
--                                split FOR ALL admin policies into explicit
--                                INSERT/UPDATE/DELETE policies
--   3. function_search_path_mutable — add SET search_path = public to every
--                                public function that was missing it
--
-- Extensions (postgis, pg_trgm) flagged for being in public schema are left
-- as-is: moving PostGIS when its geometry types are used by table columns
-- requires a full table rebuild and is not safe to do as a migration.

-- ============================================================
-- 1 & 2.  RLS fixes
-- ============================================================

-- profiles: merge users_read_own_profile + admins_read_all_profiles into a
-- single policy (eliminates multiple-permissive warning) and add (select ...)
-- wrapper around auth.uid() (eliminates init-plan warning).
DROP POLICY IF EXISTS "users_read_own_profile"   ON profiles;
DROP POLICY IF EXISTS "admins_read_all_profiles" ON profiles;
CREATE POLICY "read_profiles"
  ON profiles FOR SELECT
  USING (id = (SELECT auth.uid()) OR is_admin());

-- user_favorites: fix auth.uid() init-plan issue
DROP POLICY IF EXISTS "users_manage_own_favorites" ON user_favorites;
CREATE POLICY "users_manage_own_favorites"
  ON user_favorites FOR ALL
  USING (user_id = (SELECT auth.uid()));

-- categories: FOR ALL admin policy overlaps with public SELECT policy.
-- Replace FOR ALL with explicit INSERT / UPDATE / DELETE — public_read_categories
-- already gives everyone (including admins) SELECT access.
DROP POLICY IF EXISTS "admins_manage_categories" ON categories;
CREATE POLICY "admins_insert_categories"
  ON categories FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "admins_update_categories"
  ON categories FOR UPDATE USING (is_admin());
CREATE POLICY "admins_delete_categories"
  ON categories FOR DELETE USING (is_admin());

-- points_of_interest: FOR ALL admin policy overlaps with public SELECT policy.
-- Merge both SELECT policies into one (admins also need to see unverified POIs),
-- then replace admin FOR ALL with explicit INSERT / UPDATE / DELETE.
DROP POLICY IF EXISTS "public_read_verified_pois" ON points_of_interest;
DROP POLICY IF EXISTS "admins_full_access_pois"   ON points_of_interest;
CREATE POLICY "read_pois"
  ON points_of_interest FOR SELECT
  USING (is_verified = true OR is_admin());
CREATE POLICY "admins_insert_pois"
  ON points_of_interest FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "admins_update_pois"
  ON points_of_interest FOR UPDATE USING (is_admin());
CREATE POLICY "admins_delete_pois"
  ON points_of_interest FOR DELETE USING (is_admin());

-- ============================================================
-- 3.  Function search_path fixes
-- ============================================================

-- set_updated_at -------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- sync_geographic_ids --------------------------------------------------
CREATE OR REPLACE FUNCTION sync_geographic_ids()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.effect_scope = 'point' AND NEW.geom IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR NEW.geom IS DISTINCT FROM OLD.geom THEN
      SELECT id INTO NEW.state_id
        FROM states
        WHERE ST_Within(NEW.geom, geom)
        LIMIT 1;
      SELECT id INTO NEW.county_id
        FROM counties
        WHERE ST_Within(NEW.geom, geom)
        LIMIT 1;
      SELECT id INTO NEW.city_id
        FROM cities
        WHERE ST_Within(NEW.geom, geom)
        LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- pois_in_viewport -----------------------------------------------------
-- Drop the old 4-arg float overload (no longer used; client always passes zoom).
DROP FUNCTION IF EXISTS pois_in_viewport(float, float, float, float);

CREATE OR REPLACE FUNCTION pois_in_viewport(
  west  double precision,
  south double precision,
  east  double precision,
  north double precision,
  zoom  double precision DEFAULT 14
)
RETURNS TABLE(
  id           integer,
  title        text,
  description  text,
  category_id  integer,
  is_verified  boolean,
  tags         text[],
  lng          double precision,
  lat          double precision,
  color        text,
  severity     smallint,
  icon         text,
  effect_scope poi_scope,
  prominence   poi_prominence
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.title, p.description, p.category_id, p.is_verified, p.tags,
    ST_X(p.geom::geometry)          AS lng,
    ST_Y(p.geom::geometry)          AS lat,
    COALESCE(p.color, c.color)      AS color,
    p.severity,
    COALESCE(p.icon, c.icon)        AS icon,
    p.effect_scope,
    p.prominence
  FROM points_of_interest p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE
    p.is_verified = true
    AND p.effect_scope = 'point'
    AND p.geom IS NOT NULL
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
    AND ST_Within(p.geom, ST_MakeEnvelope(west, south, east, north, 4326))
    AND CASE p.prominence
      WHEN 'national'     THEN true
      WHEN 'regional'     THEN zoom >= 7
      WHEN 'local'        THEN zoom >= 10
      WHEN 'neighborhood' THEN zoom >= 13
    END
  LIMIT 500;
$$;

-- search_pois ----------------------------------------------------------
-- Also fixes latent bug: body referenced p.scope which was renamed to
-- p.effect_scope in migration 20260403000003_prominence.sql.
DROP FUNCTION IF EXISTS search_pois(text);
CREATE FUNCTION search_pois(query TEXT)
RETURNS TABLE(
  id          integer,
  title       text,
  description text,
  lat         double precision,
  lng         double precision,
  category_id integer,
  is_verified boolean,
  tags        text[],
  severity    smallint,
  icon        text,
  effect_scope poi_scope
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.title, p.description,
    COALESCE(
      ST_Y(p.geom::geometry),
      ST_Y(ST_Centroid(ci.geom)::geometry),
      ST_Y(ST_Centroid(co.geom)::geometry),
      ST_Y(ST_Centroid(st.geom)::geometry)
    ) AS lat,
    COALESCE(
      ST_X(p.geom::geometry),
      ST_X(ST_Centroid(ci.geom)::geometry),
      ST_X(ST_Centroid(co.geom)::geometry),
      ST_X(ST_Centroid(st.geom)::geometry)
    ) AS lng,
    p.category_id, p.is_verified, p.tags,
    p.severity,
    COALESCE(p.icon, c.icon) AS icon,
    p.effect_scope
  FROM points_of_interest p
  LEFT JOIN categories c  ON c.id  = p.category_id
  LEFT JOIN cities     ci ON ci.id = p.city_id
  LEFT JOIN counties   co ON co.id = p.county_id
  LEFT JOIN states     st ON st.id = p.state_id
  WHERE
    p.is_verified = true
    AND (p.visible_start IS NULL OR p.visible_start <= now())
    AND (p.visible_end   IS NULL OR p.visible_end   >  now())
    AND (
      p.search_vector @@ plainto_tsquery('english', query)
      OR p.title ILIKE '%' || query || '%'
    )
  ORDER BY
    ts_rank(p.search_vector, plainto_tsquery('english', query)) DESC,
    p.title
  LIMIT 10;
$$;

-- get_poi_for_edit -----------------------------------------------------
DROP FUNCTION IF EXISTS get_poi_for_edit(INT);
CREATE FUNCTION get_poi_for_edit(poi_id INT)
RETURNS TABLE(
  id               integer,
  title            text,
  description      text,
  long_description text,
  tags             text[],
  category_id      integer,
  is_verified      boolean,
  lat              double precision,
  lng              double precision,
  website_url      text,
  phone            text,
  icon             text,
  color            text,
  effect_scope     poi_scope,
  prominence       poi_prominence,
  severity         smallint,
  visible_start    date,
  visible_end      date
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    id, title, description, long_description, tags, category_id, is_verified,
    ST_Y(geom::geometry) AS lat,
    ST_X(geom::geometry) AS lng,
    website_url, phone, icon, color,
    effect_scope, prominence, severity, visible_start, visible_end
  FROM points_of_interest
  WHERE id = poi_id;
$$;

-- sync_poi_sequence ----------------------------------------------------
CREATE OR REPLACE FUNCTION sync_poi_sequence()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT setval(
    'points_of_interest_id_seq',
    GREATEST((SELECT COALESCE(MAX(id), 0) FROM points_of_interest), 1)
  );
$$;

-- get_region_scoped_pois -----------------------------------------------
CREATE OR REPLACE FUNCTION get_region_scoped_pois()
RETURNS TABLE (
  id           integer,
  title        text,
  effect_scope text,
  severity     integer,
  color        text,
  lat          double precision,
  lng          double precision
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    id, title, effect_scope::text, severity, color,
    ST_Y(geom)::double precision AS lat,
    ST_X(geom)::double precision AS lng
  FROM points_of_interest
  WHERE is_verified = true
    AND effect_scope IN ('state', 'county', 'city')
    AND geom IS NOT NULL;
$$;
