-- Add finding_type to digest_findings to distinguish regular news findings
-- from findings that include a digest-suggested draft POI.
--
-- Values:
--   'news'          — standard news finding (default)
--   'suggested_poi' — finding includes a draft POI (linked via linked_poi_id)
--                     Draft POI has source='digest-draft', is_verified=false, is_visible=false

ALTER TABLE digest_findings
  ADD COLUMN IF NOT EXISTS finding_type TEXT NOT NULL DEFAULT 'news';

COMMENT ON COLUMN digest_findings.finding_type IS
  'news | suggested_poi — suggested_poi findings have a draft POI linked via linked_poi_id';
