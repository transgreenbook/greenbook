-- Drop the "Trans-Friendly" prefix from lodging/camping/shelter categories.
-- Everything on this site is trans-friendly by definition.
UPDATE categories SET name = 'Shelter' WHERE icon_slug = 'trans-shelter';
UPDATE categories SET name = 'Lodging'  WHERE icon_slug = 'trans-lodging';
UPDATE categories SET name = 'Camping'  WHERE icon_slug = 'trans-camping';
