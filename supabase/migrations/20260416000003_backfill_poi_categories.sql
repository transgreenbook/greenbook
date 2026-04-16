-- Backfill category_id for existing POIs now that categories are seeded.

-- Restrooms: match by icon or source
UPDATE points_of_interest
SET category_id = (SELECT id FROM categories WHERE icon_slug = 'restrooms' LIMIT 1)
WHERE category_id IS NULL
  AND (
    source = 'refuge_restrooms'
    OR icon = 'poi-restroom'
    OR title LIKE 'RefugeRestroom - %'
  );

-- Nightlife: the 340 imported bar/club POIs have no source, no icon, severity 0.
-- These came from an LGBTQ nightlife import and are all bars/clubs/lounges.
UPDATE points_of_interest
SET category_id = (SELECT id FROM categories WHERE icon_slug = 'nightlife' LIMIT 1)
WHERE category_id IS NULL
  AND source IS NULL
  AND icon IS NULL;
