-- Add map_visible flag to categories.
-- Law/policy categories exist for POI classification but should not appear
-- as filter chips on the public map.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS map_visible BOOLEAN NOT NULL DEFAULT true;

-- Mark the existing safety-incident row correctly (already map_visible by default,
-- but make it explicit).
UPDATE categories SET map_visible = true WHERE icon_slug = 'safety-incident';

-- Ensure icon_slug is unique so future upserts are safe.
ALTER TABLE categories ADD CONSTRAINT categories_icon_slug_key UNIQUE (icon_slug);

-- Seed all categories. Skip any that already exist by icon_slug.
INSERT INTO categories (name, icon_slug, color, map_visible) VALUES
  -- Map-visible POI categories
  ('Restrooms',          'restrooms',            '#1e40af', true),
  ('Healthcare',         'healthcare',           '#0d9488', true),
  ('Legal Resource',     'legalresource',        '#16a34a', true),
  ('Community',          'community',            '#0284c7', true),
  ('Venue',              'venue',                '#7c3aed', true),
  ('Nightlife',          'nightlife',            '#9333ea', true),
  ('Restaurant',         'restaurant',           '#ea580c', true),
  ('Historical',         'historical',           '#92400e', true),
  -- Law/policy categories — used for POI tagging, not shown on map filter
  ('Bathroom Law',       'law-bathroom',         '#6b7280', false),
  ('Healthcare Law',     'law-healthcare',       '#6b7280', false),
  ('Anti-Trans Law',     'law-antitrans',        '#6b7280', false),
  ('Discrimination Law', 'law-discrimination',   '#6b7280', false)
ON CONFLICT (icon_slug) DO NOTHING;

-- Set the restroom icon so icon-based filtering works (POIs without category_id
-- that have icon = 'poi-restroom' are still matched by the map filter).
UPDATE categories SET icon = 'poi-restroom' WHERE icon_slug = 'restrooms';
