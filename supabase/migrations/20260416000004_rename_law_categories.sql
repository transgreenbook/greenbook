-- Rename law categories so they sort together alphabetically.
UPDATE categories SET name = 'Law — Bathroom'       WHERE icon_slug = 'law-bathroom';
UPDATE categories SET name = 'Law — Healthcare'     WHERE icon_slug = 'law-healthcare';
UPDATE categories SET name = 'Law — Anti-Trans'     WHERE icon_slug = 'law-antitrans';
UPDATE categories SET name = 'Law — Discrimination' WHERE icon_slug = 'law-discrimination';
