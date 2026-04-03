-- View used by scripts/seed-sheet-from-db.mjs to read POIs with lat/lng as numbers.
CREATE OR REPLACE VIEW poi_export AS
SELECT
  p.id,
  p.title,
  p.description,
  p.long_description,
  ST_Y(p.geom) AS lat,
  ST_X(p.geom) AS lng,
  c.name       AS category,
  p.tags,
  p.is_verified,
  p.website_url,
  p.phone,
  p.icon,
  p.severity,
  p.visible_start,
  p.visible_end,
  p.sheet_id
FROM points_of_interest p
LEFT JOIN categories c ON c.id = p.category_id;
