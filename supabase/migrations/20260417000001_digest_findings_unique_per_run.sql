-- Prevent duplicate findings for the same article within a single digest run.
-- Deduplicate any existing rows first (keep the earliest by id).
DELETE FROM digest_findings
WHERE id NOT IN (
    SELECT MIN(id)
    FROM digest_findings
    GROUP BY digest_run_id, article_url
);

ALTER TABLE digest_findings
ADD CONSTRAINT digest_findings_run_article_key
UNIQUE (digest_run_id, article_url);
