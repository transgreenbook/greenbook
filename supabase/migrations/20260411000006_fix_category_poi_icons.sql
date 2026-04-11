-- Store the exact POI icon value on each category so the client filter can
-- match POIs by icon when category_id is NULL.
-- Currently only restrooms has a custom icon; others use colored circles.
UPDATE categories
SET icon = 'poi-restroom'
WHERE icon_slug = 'restrooms';

-- Re-backfill category_id for any restroom POIs still missing it
-- (catches rows that were added after the first backfill or were missed).
UPDATE points_of_interest
SET category_id = (SELECT id FROM categories WHERE icon_slug = 'restrooms' LIMIT 1)
WHERE category_id IS NULL
  AND (
    source = 'refuge_restrooms'
    OR icon  = 'poi-restroom'
    OR title LIKE 'RefugeRestroom - %'
  );
