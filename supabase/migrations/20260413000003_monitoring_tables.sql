-- Monitoring system: news digest, watch items, and source tracking.
--
-- Tables:
--   news_sources    — registry of RSS feeds and other data sources
--   watch_items     — bills, lawsuits, policies, events being tracked
--   digest_runs     — log of each news-digest.mjs execution
--   digest_findings — individual flagged articles from each run

-- ---------------------------------------------------------------------------
-- news_sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_sources (
  id            SERIAL PRIMARY KEY,
  name          TEXT    NOT NULL,
  feed_url      TEXT    NOT NULL UNIQUE,
  source_type   TEXT    NOT NULL DEFAULT 'rss', -- rss | api | scrape
  is_active     BOOLEAN NOT NULL DEFAULT true,
  priority      INT     NOT NULL DEFAULT 5,      -- 1 (low) to 10 (high)
  fetch_count   INT     NOT NULL DEFAULT 0,
  article_count INT     NOT NULL DEFAULT 0,
  last_fetched_at TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- watch_items
-- ---------------------------------------------------------------------------
-- jurisdiction_type values: 'federal' | 'state' | 'county' | 'city' |
--                           'reservation' | 'territory'
-- item_type values (not enum — list will grow):
--   'bill' | 'lawsuit' | 'executive_order' | 'regulation' | 'policy' | 'event'
-- status values:
--   'monitoring' | 'enacted' | 'overturned' | 'failed' | 'resolved' | 'paused'

CREATE TABLE IF NOT EXISTS watch_items (
  id                SERIAL PRIMARY KEY,
  item_type         TEXT    NOT NULL,
  title             TEXT    NOT NULL,
  description       TEXT,
  jurisdiction_type TEXT    NOT NULL,            -- see above
  state_id          INT     REFERENCES states(id),
  county_id         INT     REFERENCES counties(id),
  city_id           INT     REFERENCES cities(id),
  reservation_id    INT     REFERENCES reservations(id),
  status            TEXT    NOT NULL DEFAULT 'monitoring',
  next_check_date   DATE,
  source_url        TEXT,
  source_name       TEXT,
  linked_poi_id     INT     REFERENCES points_of_interest(id),
  severity_impact   TEXT,   -- plain-language note on potential severity change
  attributes        JSONB   NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS watch_items_jurisdiction_type_idx ON watch_items (jurisdiction_type);
CREATE INDEX IF NOT EXISTS watch_items_status_idx            ON watch_items (status);
CREATE INDEX IF NOT EXISTS watch_items_next_check_date_idx   ON watch_items (next_check_date);
CREATE INDEX IF NOT EXISTS watch_items_state_id_idx          ON watch_items (state_id);

-- ---------------------------------------------------------------------------
-- digest_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS digest_runs (
  id               SERIAL PRIMARY KEY,
  run_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  articles_fetched INT         NOT NULL DEFAULT 0,
  findings_count   INT         NOT NULL DEFAULT 0,
  email_sent_at    TIMESTAMPTZ,
  error            TEXT,
  attributes       JSONB       NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- digest_findings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS digest_findings (
  id                SERIAL PRIMARY KEY,
  digest_run_id     INT     NOT NULL REFERENCES digest_runs(id) ON DELETE CASCADE,
  watch_item_id     INT     REFERENCES watch_items(id),
  source_id         INT     REFERENCES news_sources(id),
  article_url       TEXT    NOT NULL,
  article_title     TEXT,
  article_date      TIMESTAMPTZ,
  summary           TEXT,
  suggested_action  TEXT,
  confidence        NUMERIC(3,2),              -- 0.00 to 1.00
  jurisdiction_type TEXT,
  state_id          INT     REFERENCES states(id),
  county_id         INT     REFERENCES counties(id),
  city_id           INT     REFERENCES cities(id),
  reservation_id    INT     REFERENCES reservations(id),
  severity_delta    INT,                       -- suggested change to POI severity
  linked_poi_id     INT     REFERENCES points_of_interest(id),
  reviewed_at       TIMESTAMPTZ,
  dismissed_at      TIMESTAMPTZ,
  applied_at        TIMESTAMPTZ,
  reviewer_notes    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS digest_findings_run_idx          ON digest_findings (digest_run_id);
CREATE INDEX IF NOT EXISTS digest_findings_article_url_idx  ON digest_findings (article_url);
CREATE INDEX IF NOT EXISTS digest_findings_reviewed_idx     ON digest_findings (reviewed_at);

-- ---------------------------------------------------------------------------
-- RLS — digest tables are internal/admin only (no public read)
-- ---------------------------------------------------------------------------
ALTER TABLE news_sources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_findings ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read; service role can do everything (bypasses RLS).
CREATE POLICY "news_sources_auth_read"    ON news_sources    FOR SELECT TO authenticated USING (true);
CREATE POLICY "watch_items_auth_read"     ON watch_items     FOR SELECT TO authenticated USING (true);
CREATE POLICY "digest_runs_auth_read"     ON digest_runs     FOR SELECT TO authenticated USING (true);
CREATE POLICY "digest_findings_auth_read" ON digest_findings FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Seed: initial Google News RSS sources
-- ---------------------------------------------------------------------------
INSERT INTO news_sources (name, feed_url, source_type, priority, notes) VALUES
  (
    'Google News — anti-trans legislation',
    'https://news.google.com/rss/search?q=%22anti-trans%22+OR+%22anti-transgender%22+law+legislation&hl=en-US&gl=US&ceid=US:en',
    'rss', 9,
    'Google News RSS: anti-trans law and legislation coverage'
  ),
  (
    'Google News — gender-affirming care',
    'https://news.google.com/rss/search?q=%22gender-affirming+care%22+ban+law&hl=en-US&gl=US&ceid=US:en',
    'rss', 9,
    'Google News RSS: gender-affirming care bans'
  ),
  (
    'Google News — bathroom bill',
    'https://news.google.com/rss/search?q=%22bathroom+bill%22+OR+%22bathroom+ban%22+transgender&hl=en-US&gl=US&ceid=US:en',
    'rss', 8,
    'Google News RSS: bathroom bill and facility restriction coverage'
  ),
  (
    'Google News — transgender rights court',
    'https://news.google.com/rss/search?q=%22transgender+rights%22+court+ruling+OR+lawsuit+OR+supreme+court&hl=en-US&gl=US&ceid=US:en',
    'rss', 9,
    'Google News RSS: court rulings and lawsuits affecting trans rights'
  ),
  (
    'Google News — trans safety hate crime',
    'https://news.google.com/rss/search?q=transgender+%22hate+crime%22+OR+%22hate+violence%22+OR+attack&hl=en-US&gl=US&ceid=US:en',
    'rss', 10,
    'Google News RSS: physical safety events targeting trans people'
  ),
  (
    'Google News — federal trans policy',
    'https://news.google.com/rss/search?q=transgender+federal+policy+OR+%22executive+order%22+OR+%22Title+IX%22&hl=en-US&gl=US&ceid=US:en',
    'rss', 10,
    'Google News RSS: federal-level transgender policy changes'
  ),
  (
    'Google News — trans travel safety',
    'https://news.google.com/rss/search?q=%22transgender%22+travel+safety+OR+%22safe+states%22+OR+%22shield+law%22&hl=en-US&gl=US&ceid=US:en',
    'rss', 8,
    'Google News RSS: trans travel safety and sanctuary/shield law coverage'
  )
ON CONFLICT (feed_url) DO NOTHING;
