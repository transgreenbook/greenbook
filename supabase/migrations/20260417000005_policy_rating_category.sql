-- Create topic-specific policy rating categories for CATPALM-style policy summary POIs.
-- These are state/jurisdiction-level assessments of a policy area — not individual laws.
-- Each jurisdiction gets one POI per policy topic with its own severity score.
-- The map colors the region using the most dominant POI (|severity| × weight).
--
-- severity_weight varies by topic relevance to travelers:
--   bathroom: 75 (affects daily travel)
--   birth-cert: 25 (mainly relevant at official checkpoints)
--
-- A generic 'policy-rating' fallback is also created for topics not yet given
-- their own category.

INSERT INTO categories (name, icon_slug, color, map_visible, severity_weight)
VALUES
  ('Policy Rating',                        'policy-rating',             '#8b5cf6', false, 25),
  ('Policy Rating — Birth Certificate',    'policy-rating-birth-cert',  '#8b5cf6', false, 25),
  ('Policy Rating — Bathroom Access',      'policy-rating-bathroom',    '#f59e0b', false, 75),
  ('Policy Rating — Driver''s License',    'policy-rating-drivers-license', '#8b5cf6', false, 65),
  ('Policy Rating — Non-Binary Recognition','policy-rating-nonbinary',  '#8b5cf6', false, 50)
ON CONFLICT (icon_slug) DO NOTHING;

-- Migrate existing CATPALM birth certificate POIs to the birth-cert category.
UPDATE points_of_interest
SET category_id = (SELECT id FROM categories WHERE icon_slug = 'policy-rating-birth-cert')
WHERE source = 'catpalm'
  AND source_id LIKE 'catpalm-bc-%';

-- Migrate existing CATPALM bathroom POIs to the bathroom category.
UPDATE points_of_interest
SET category_id = (SELECT id FROM categories WHERE icon_slug = 'policy-rating-bathroom')
WHERE source = 'catpalm'
  AND source_id LIKE 'catpalm-bathroom-%';

-- Migrate existing CATPALM driver's license POIs to the drivers-license category.
UPDATE points_of_interest
SET category_id = (SELECT id FROM categories WHERE icon_slug = 'policy-rating-drivers-license')
WHERE source = 'catpalm'
  AND source_id LIKE 'catpalm-dl-%';

-- Migrate existing CATPALM non-binary recognition POIs to the nonbinary category.
UPDATE points_of_interest
SET category_id = (SELECT id FROM categories WHERE icon_slug = 'policy-rating-nonbinary')
WHERE source = 'catpalm'
  AND source_id LIKE 'catpalm-nb-%';
