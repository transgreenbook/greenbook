-- Safe space categories for trans-friendly and LGBTQ+-affirming locations.
-- These are positive-side POIs (safe resources for travelers).
--
-- severity_weight reflects traveler relevance:
--   shelter: 80 (life-safety resource — highest weight)
--   lodging:  40 (travel-relevant overnight accommodation)
--   camping:  30 (travel-relevant but more discretionary)
--
-- Acceptance policy for lodging and camping:
--   Self-reported trans-friendly status is acceptable for established corporate
--   chains and licensed campgrounds. Individual/self-promoted properties (e.g.
--   Airbnb hosts) require additional verification before import.

INSERT INTO categories (name, icon_slug, color, map_visible, severity_weight)
VALUES
  ('Trans-Friendly Shelter',  'trans-shelter', '#10b981', true,  80),
  ('Trans-Friendly Lodging',  'trans-lodging', '#3b82f6', true,  40),
  ('Trans-Friendly Camping',  'trans-camping', '#84cc16', true,  30)
ON CONFLICT (icon_slug) DO NOTHING;
