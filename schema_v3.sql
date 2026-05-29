-- ثروة — Schema v3 — شغّل في Supabase SQL Editor
-- آمن لإعادة التشغيل (idempotent)

-- ===========================================================
-- 1. user_stocks — قاعدة بيانات أسهم المستخدم
-- ===========================================================
CREATE TABLE IF NOT EXISTS user_stocks (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker     TEXT NOT NULL,
  name       TEXT NOT NULL,
  sector     TEXT NOT NULL DEFAULT 'أخرى',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);

ALTER TABLE user_stocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "us_select" ON user_stocks;
DROP POLICY IF EXISTS "us_insert" ON user_stocks;
DROP POLICY IF EXISTS "us_update" ON user_stocks;
DROP POLICY IF EXISTS "us_delete" ON user_stocks;

CREATE POLICY "us_select" ON user_stocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "us_insert" ON user_stocks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "us_update" ON user_stocks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "us_delete" ON user_stocks FOR DELETE USING (auth.uid() = user_id);

-- ===========================================================
-- 2. stock_targets — أهداف الأسهم
-- ===========================================================
CREATE TABLE IF NOT EXISTS stock_targets (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker     TEXT NOT NULL,
  target_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  UNIQUE(user_id, ticker)
);

ALTER TABLE stock_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "st_select" ON stock_targets;
DROP POLICY IF EXISTS "st_insert" ON stock_targets;
DROP POLICY IF EXISTS "st_update" ON stock_targets;
DROP POLICY IF EXISTS "st_delete" ON stock_targets;

CREATE POLICY "st_select" ON stock_targets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "st_insert" ON stock_targets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "st_update" ON stock_targets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "st_delete" ON stock_targets FOR DELETE USING (auth.uid() = user_id);

-- ===========================================================
-- 3. sector_targets — أهداف القطاعات
-- ===========================================================
CREATE TABLE IF NOT EXISTS sector_targets (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sector     TEXT NOT NULL,
  target_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  UNIQUE(user_id, sector)
);

ALTER TABLE sector_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sec_select" ON sector_targets;
DROP POLICY IF EXISTS "sec_insert" ON sector_targets;
DROP POLICY IF EXISTS "sec_update" ON sector_targets;
DROP POLICY IF EXISTS "sec_delete" ON sector_targets;

CREATE POLICY "sec_select" ON sector_targets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sec_insert" ON sector_targets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sec_update" ON sector_targets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sec_delete" ON sector_targets FOR DELETE USING (auth.uid() = user_id);
