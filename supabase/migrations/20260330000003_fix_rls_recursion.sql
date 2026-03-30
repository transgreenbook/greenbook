-- The admins_read_all_profiles and admins_update_profiles policies query the
-- profiles table from within profiles policies, causing infinite recursion.
-- Fix: use a SECURITY DEFINER function that bypasses RLS for the admin check.

DROP POLICY IF EXISTS "admins_read_all_profiles" ON profiles;
DROP POLICY IF EXISTS "admins_update_profiles"   ON profiles;

-- is_admin() runs as the function owner (postgres), bypassing RLS, so it can
-- read profiles without triggering any policy on the profiles table.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Recreate the policies using is_admin() instead of inline subqueries
CREATE POLICY "admins_read_all_profiles"
  ON profiles FOR SELECT
  USING (is_admin());

CREATE POLICY "admins_update_profiles"
  ON profiles FOR UPDATE
  USING (is_admin());

-- Also fix the existing policies on other tables that inline-query profiles
-- (they inherited the recursion via admins_read_all_profiles being triggered
-- when PostgREST evaluated the subquery's SELECT on profiles).

DROP POLICY IF EXISTS "admins_full_access_pois"    ON points_of_interest;
DROP POLICY IF EXISTS "admins_manage_categories"   ON categories;

CREATE POLICY "admins_full_access_pois"
  ON points_of_interest FOR ALL
  USING (is_admin());

CREATE POLICY "admins_manage_categories"
  ON categories FOR ALL
  USING (is_admin());
