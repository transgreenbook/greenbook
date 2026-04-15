-- legislation_bills: source-agnostic registry of tracked anti-trans bills.
--
-- Dedup key is (state_abbr, bill_number) so the same bill from multiple
-- sources (ACLU, LegiScan, etc.) maps to a single row. The `sources` JSONB
-- column tracks which sources have seen the bill.
--
-- Bills start here automatically via sync scripts. They graduate to
-- watch_items only when an admin reviews and promotes them via the digest UI.

CREATE TABLE IF NOT EXISTS legislation_bills (
  id                    SERIAL PRIMARY KEY,

  -- Jurisdiction
  state_abbr            CHAR(2)  REFERENCES states(abbreviation),  -- null = federal
  bill_number           TEXT     NOT NULL,  -- normalized e.g. "SB 1264", "HB 42"

  -- Official info
  title                 TEXT,               -- official bill title if available
  status                TEXT     NOT NULL DEFAULT 'unknown',
  -- known values: 'introduced' | 'advancing' | 'passed' | 'signed' |
  --               'defeated' | 'vetoed' | 'enjoined' | 'unknown'
  status_detail         TEXT,               -- e.g. "Governor signed", "Senate committee referral"
  status_date           DATE,
  issues                TEXT[]   NOT NULL DEFAULT '{}',
  -- normalized issue tags e.g. {"healthcare_restrictions","school_facilities_ban"}

  -- Links
  bill_text_url         TEXT,               -- direct link to official bill text (from LegiScan)

  -- Our summary
  summary               TEXT,               -- markdown: what it does and why it's problematic
  summary_source        TEXT,               -- 'manual' | 'aclu' | 'claude' | null

  -- Source tracking
  sources               JSONB    NOT NULL DEFAULT '{}',
  -- e.g. {"aclu": true, "legiscan": {"bill_id": 1234, "url": "..."}}
  last_synced_at        TIMESTAMPTZ,

  -- Admin review
  linked_watch_item_id  INT      REFERENCES watch_items(id) ON DELETE SET NULL,
  admin_notes           TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedup key — one row per bill regardless of source
CREATE UNIQUE INDEX legislation_bills_state_bill_idx
  ON legislation_bills (COALESCE(state_abbr, ''), bill_number);

CREATE INDEX legislation_bills_state_abbr_idx  ON legislation_bills (state_abbr);
CREATE INDEX legislation_bills_status_idx       ON legislation_bills (status);
CREATE INDEX legislation_bills_status_date_idx  ON legislation_bills (status_date);
CREATE INDEX legislation_bills_issues_idx       ON legislation_bills USING GIN (issues);

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_legislation_bills()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER legislation_bills_updated_at
  BEFORE UPDATE ON legislation_bills
  FOR EACH ROW EXECUTE FUNCTION touch_legislation_bills();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE legislation_bills ENABLE ROW LEVEL SECURITY;

-- Public read (bill data is public information)
CREATE POLICY "legislation_bills_public_read"
  ON legislation_bills FOR SELECT USING (true);

-- Admin write
CREATE POLICY "legislation_bills_admin_write"
  ON legislation_bills FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
