-- Add unique constraint on sheet_id so upserts can use it as the conflict target.
ALTER TABLE points_of_interest ADD CONSTRAINT points_of_interest_sheet_id_key UNIQUE (sheet_id);
