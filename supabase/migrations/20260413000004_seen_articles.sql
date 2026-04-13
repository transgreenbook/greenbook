-- Tracks all article URLs fetched by news-digest.mjs so previously seen
-- articles are not re-analyzed on subsequent runs, regardless of whether
-- they produced a finding.
--
-- Rows expire after 90 days. The digest script prunes expired rows at the
-- start of each run — no separate cron job needed.

CREATE TABLE IF NOT EXISTS seen_articles (
  id           SERIAL PRIMARY KEY,
  article_url  TEXT        NOT NULL UNIQUE,
  source_id    INT         REFERENCES news_sources(id),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '90 days'
);

CREATE INDEX IF NOT EXISTS seen_articles_url_idx        ON seen_articles (article_url);
CREATE INDEX IF NOT EXISTS seen_articles_expires_at_idx ON seen_articles (expires_at);

ALTER TABLE seen_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seen_articles_auth_read" ON seen_articles FOR SELECT TO authenticated USING (true);
