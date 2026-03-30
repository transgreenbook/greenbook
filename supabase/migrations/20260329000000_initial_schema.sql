-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'user', 'moderator');

-- ============================================================
-- Geographic hierarchy
-- ============================================================

CREATE TABLE states (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  abbreviation CHAR(2) NOT NULL UNIQUE,
  fill_color  TEXT,
  label       TEXT,
  notes       TEXT,
  geom        GEOMETRY(MultiPolygon, 4326)
);

CREATE TABLE counties (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  state_id    INT NOT NULL REFERENCES states(id),
  fips_code   CHAR(5) NOT NULL UNIQUE,
  fill_color  TEXT,
  geom        GEOMETRY(MultiPolygon, 4326)
);

CREATE TABLE cities (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  county_id   INT REFERENCES counties(id),
  state_id    INT NOT NULL REFERENCES states(id),
  population  INT,
  geom        GEOMETRY(Point, 4326)
);

-- ============================================================
-- POI content
-- ============================================================

CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  icon_slug   TEXT NOT NULL,
  color       TEXT
);

CREATE TABLE points_of_interest (
  id                  SERIAL PRIMARY KEY,
  title               TEXT NOT NULL,
  description         TEXT,
  long_description    TEXT,
  website_url         TEXT,
  phone               TEXT,
  hours               JSONB,
  attributes          JSONB,
  tags                TEXT[],
  category_id         INT REFERENCES categories(id),
  state_id            INT REFERENCES states(id),
  county_id           INT REFERENCES counties(id),
  geom                GEOMETRY(Point, 4326) NOT NULL,
  is_verified         BOOLEAN NOT NULL DEFAULT false,
  is_user_submitted   BOOLEAN NOT NULL DEFAULT false,
  created_by          UUID REFERENCES auth.users(id),
  search_vector       TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(description, '')
    )
  ) STORED,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE poi_images (
  id          SERIAL PRIMARY KEY,
  poi_id      INT NOT NULL REFERENCES points_of_interest(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  caption     TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  sort_order  INT NOT NULL DEFAULT 0
);

CREATE TABLE poi_links (
  id          SERIAL PRIMARY KEY,
  poi_id      INT NOT NULL REFERENCES points_of_interest(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  url         TEXT NOT NULL,
  link_type   TEXT NOT NULL  -- website | booking | social | etc.
);

-- ============================================================
-- User accounts (tables ready, used in future)
-- ============================================================

CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         user_role NOT NULL DEFAULT 'user',
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_favorites (
  id         SERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  poi_id     INT NOT NULL REFERENCES points_of_interest(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, poi_id)
);

-- ============================================================
-- Spatial and search indexes
-- ============================================================

CREATE INDEX idx_poi_geom     ON points_of_interest USING GIST(geom);
CREATE INDEX idx_poi_search   ON points_of_interest USING GIN(search_vector);
CREATE INDEX idx_poi_trgm     ON points_of_interest USING GIN(title gin_trgm_ops);
CREATE INDEX idx_county_geom  ON counties           USING GIST(geom);
CREATE INDEX idx_state_geom   ON states             USING GIST(geom);
CREATE INDEX idx_city_geom    ON cities             USING GIST(geom);

-- ============================================================
-- updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_poi_updated_at
  BEFORE UPDATE ON points_of_interest
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE points_of_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorites      ENABLE ROW LEVEL SECURITY;

-- Public can read verified POIs
CREATE POLICY "public_read_verified_pois"
  ON points_of_interest FOR SELECT
  USING (is_verified = true);

-- Admins have full access to POIs
CREATE POLICY "admins_full_access_pois"
  ON points_of_interest FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can read their own profile
CREATE POLICY "users_read_own_profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Admins can read all profiles
CREATE POLICY "admins_read_all_profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users manage their own favorites
CREATE POLICY "users_manage_own_favorites"
  ON user_favorites FOR ALL
  USING (user_id = auth.uid());
