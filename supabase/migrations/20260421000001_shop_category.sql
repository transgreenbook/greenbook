-- Add shop category for LGBTQ+-owned and -affirming retail businesses.
-- severity_weight 20: less travel-critical than lodging/camping but map-visible.

INSERT INTO categories (name, icon_slug, color, map_visible, severity_weight)
VALUES
  ('Shop', 'shop', '#f59e0b', true, 20)
ON CONFLICT (icon_slug) DO NOTHING;
