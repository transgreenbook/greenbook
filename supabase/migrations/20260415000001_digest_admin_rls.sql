-- Admin write policies for digest review workflow.
--
-- Admins can update and delete digest_findings (approve/dismiss),
-- update watch_items (status changes from review), and update
-- points_of_interest severity (when approving a severity delta).
--
-- "Admin" is defined as: authenticated user with role = 'admin' in profiles.

-- ---------------------------------------------------------------------------
-- digest_findings
-- ---------------------------------------------------------------------------
CREATE POLICY "digest_findings_admin_update"
  ON digest_findings FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "digest_findings_admin_delete"
  ON digest_findings FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- watch_items
-- ---------------------------------------------------------------------------
CREATE POLICY "watch_items_admin_update"
  ON watch_items FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "watch_items_admin_delete"
  ON watch_items FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- points_of_interest — admin can update severity from digest review
-- ---------------------------------------------------------------------------
CREATE POLICY "pois_admin_update"
  ON points_of_interest FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
