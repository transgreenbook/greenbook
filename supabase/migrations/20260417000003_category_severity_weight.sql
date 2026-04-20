-- Add severity_weight to categories.
-- Controls how much this category's POIs contribute to scope-level severity aggregation.
-- Range: 0 (informational only, no severity impact) to 100 (full weight, default).
-- The weighted calculation is not yet implemented — this column is reserved for future use.

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS severity_weight SMALLINT NOT NULL DEFAULT 100
  CONSTRAINT categories_severity_weight_range CHECK (severity_weight BETWEEN 0 AND 100);

-- Set weights for existing categories.
-- Law categories that directly affect physical safety/travel: full weight.
UPDATE categories SET severity_weight = 100 WHERE icon_slug IN (
  'law-bathroom',
  'law-antitrans',
  'law-healthcare',
  'law-discrimination',
  'law-education',
  'law-drag',
  'law-id-docs',
  'legalresource',
  'safety-incident'
);

-- Birth certificate policies: informational for travelers, lower weight.
UPDATE categories SET severity_weight = 25 WHERE icon_slug = 'law-birth-certificate';

-- Non-law categories don't affect severity at all.
UPDATE categories SET severity_weight = 0 WHERE icon_slug IN (
  'restrooms',
  'nightlife',
  'venue',
  'restaurant',
  'historical',
  'healthcare',
  'community'
);
