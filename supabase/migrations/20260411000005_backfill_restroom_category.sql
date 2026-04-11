-- Backfill category_id on Refuge Restrooms POIs.
-- The import script did not set category_id; this links them to the
-- "Restrooms" category (icon_slug = 'restrooms') so the category filter works.

UPDATE points_of_interest
SET category_id = (SELECT id FROM categories WHERE icon_slug = 'restrooms' LIMIT 1)
WHERE category_id IS NULL
  AND (
    source = 'refuge_restrooms'
    OR icon = 'poi-restroom'
    OR title LIKE 'RefugeRestroom - %'
  );
