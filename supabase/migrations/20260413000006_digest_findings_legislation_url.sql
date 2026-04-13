-- Add legislation_url to digest_findings for direct links to bills,
-- court dockets, executive orders, and other primary source documents.
ALTER TABLE digest_findings ADD COLUMN IF NOT EXISTS legislation_url TEXT;
