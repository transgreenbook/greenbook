-- Backfill state_abbr for state-scoped POIs whose title begins with a
-- two-letter state/territory abbreviation (e.g. "KS SB0244 — Anti-Trans Legislation").
-- Safe to re-run on production — the WHERE clause skips already-set rows.

-- States and DC (abbreviations present in the states table)
UPDATE points_of_interest
SET    state_abbr = SUBSTRING(title, 1, 2)
WHERE  effect_scope = 'state'
  AND  (state_abbr IS NULL OR state_abbr = '')
  AND  SUBSTRING(title, 1, 2) IN (SELECT abbreviation FROM states);

-- US territories (not in the states table but use the same title prefix convention)
UPDATE points_of_interest
SET    state_abbr = SUBSTRING(title, 1, 2)
WHERE  effect_scope = 'state'
  AND  (state_abbr IS NULL OR state_abbr = '')
  AND  SUBSTRING(title, 1, 2) IN ('AS', 'GU', 'MP', 'PR', 'VI');
