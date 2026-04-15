-- Add relevance column to digest_findings to store Claude's editorial
-- priority judgment separately from confidence score.
-- Values: 'high' | 'medium' | 'low' (skip findings are not stored)
ALTER TABLE digest_findings ADD COLUMN IF NOT EXISTS relevance TEXT;
