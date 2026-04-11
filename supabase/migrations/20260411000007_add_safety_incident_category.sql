-- Add a category for physical safety incidents (violence, hate crimes, active threats).
-- These are distinct from law/policy POIs and use severity -9 to -10.
INSERT INTO categories (name, icon_slug, color)
SELECT 'Safety Incident', 'safety-incident', '#dc2626'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE icon_slug = 'safety-incident');
