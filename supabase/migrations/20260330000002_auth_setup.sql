-- Auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Allow admins to update any profile (e.g. promote a user)
CREATE POLICY "admins_update_profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Categories RLS (currently unprotected)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_categories"
  ON categories FOR SELECT USING (true);

CREATE POLICY "admins_manage_categories"
  ON categories FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- RPC to fetch a single POI with extracted lat/lng for the edit form
CREATE OR REPLACE FUNCTION get_poi_for_edit(poi_id INT)
RETURNS TABLE(
  id          INT,
  title       TEXT,
  description TEXT,
  tags        TEXT[],
  category_id INT,
  is_verified BOOLEAN,
  lat         FLOAT8,
  lng         FLOAT8
) LANGUAGE sql AS $$
  SELECT
    id, title, description, tags, category_id, is_verified,
    ST_Y(geom::geometry) AS lat,
    ST_X(geom::geometry) AS lng
  FROM points_of_interest
  WHERE id = poi_id;
$$;
