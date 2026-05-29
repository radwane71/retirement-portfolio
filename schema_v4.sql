-- ثروة — Schema v4 — شغّل في Supabase SQL Editor
-- آمن لإعادة التشغيل (idempotent)

-- ===========================================================
-- 1. cashflow_entries — الإيداعات والسحوبات
-- ===========================================================
CREATE TABLE IF NOT EXISTS cashflow_entries (
  id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date     DATE NOT NULL,
  type     TEXT NOT NULL CHECK (type IN ('deposit','withdrawal')),
  amount   NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  notes    TEXT DEFAULT ''
);

ALTER TABLE cashflow_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cfe_select" ON cashflow_entries;
DROP POLICY IF EXISTS "cfe_insert" ON cashflow_entries;
DROP POLICY IF EXISTS "cfe_update" ON cashflow_entries;
DROP POLICY IF EXISTS "cfe_delete" ON cashflow_entries;

CREATE POLICY "cfe_select" ON cashflow_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cfe_insert" ON cashflow_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cfe_update" ON cashflow_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cfe_delete" ON cashflow_entries FOR DELETE USING (auth.uid() = user_id);

-- ===========================================================
-- 2. nw_assets — أصول صافي الثروة
-- ===========================================================
CREATE TABLE IF NOT EXISTS nw_assets (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category  TEXT NOT NULL DEFAULT 'other',
  name      TEXT NOT NULL,
  value     NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes     TEXT DEFAULT ''
);

ALTER TABLE nw_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nwa_select" ON nw_assets;
DROP POLICY IF EXISTS "nwa_insert" ON nw_assets;
DROP POLICY IF EXISTS "nwa_update" ON nw_assets;
DROP POLICY IF EXISTS "nwa_delete" ON nw_assets;

CREATE POLICY "nwa_select" ON nw_assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "nwa_insert" ON nw_assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nwa_update" ON nw_assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "nwa_delete" ON nw_assets FOR DELETE USING (auth.uid() = user_id);

-- ===========================================================
-- 3. nw_liabilities — التزامات صافي الثروة
-- ===========================================================
CREATE TABLE IF NOT EXISTS nw_liabilities (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category  TEXT NOT NULL DEFAULT 'other',
  name      TEXT NOT NULL,
  value     NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes     TEXT DEFAULT ''
);

ALTER TABLE nw_liabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nwl_select" ON nw_liabilities;
DROP POLICY IF EXISTS "nwl_insert" ON nw_liabilities;
DROP POLICY IF EXISTS "nwl_update" ON nw_liabilities;
DROP POLICY IF EXISTS "nwl_delete" ON nw_liabilities;

CREATE POLICY "nwl_select" ON nw_liabilities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "nwl_insert" ON nw_liabilities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nwl_update" ON nw_liabilities FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "nwl_delete" ON nw_liabilities FOR DELETE USING (auth.uid() = user_id);

-- ===========================================================
-- 4. deletion_requests — طلبات حذف الحسابات
-- ===========================================================
CREATE TABLE IF NOT EXISTS deletion_requests (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email      TEXT,
  reason     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dr_insert" ON deletion_requests;
DROP POLICY IF EXISTS "dr_select" ON deletion_requests;

-- Users can only insert their own requests
CREATE POLICY "dr_insert" ON deletion_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Users can see their own requests
CREATE POLICY "dr_select" ON deletion_requests FOR SELECT USING (auth.uid() = user_id);
