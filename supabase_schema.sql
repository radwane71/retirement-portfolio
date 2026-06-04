-- ============================================================
-- محفظتي — مخطط قاعدة البيانات
-- انسخ هذا الملف كاملاً والصقه في Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. إنشاء الجداول
-- ============================================================

-- الأسهم في المحفظة
CREATE TABLE IF NOT EXISTS holdings (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker        TEXT NOT NULL,
  name          TEXT NOT NULL,
  sector        TEXT NOT NULL DEFAULT '',
  shares        NUMERIC(18, 4) NOT NULL DEFAULT 0,
  avg_price     NUMERIC(18, 4) NOT NULL DEFAULT 0,
  current_price NUMERIC(18, 4) NOT NULL DEFAULT 0,
  target_weight NUMERIC(6, 2)  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);

-- سجل المعاملات (شراء / بيع)
CREATE TABLE IF NOT EXISTS transactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date       DATE NOT NULL,
  ticker     TEXT NOT NULL,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'grant')),
  shares     NUMERIC(18, 4) NOT NULL,
  price      NUMERIC(18, 4) NOT NULL,
  commission NUMERIC(18, 4) NOT NULL DEFAULT 0,
  vat        NUMERIC(18, 4) NOT NULL DEFAULT 0,
  total      NUMERIC(18, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- الأرباح الموزعة
CREATE TABLE IF NOT EXISTS dividends (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date       DATE NOT NULL,
  ticker     TEXT NOT NULL,
  name       TEXT NOT NULL,
  amount     NUMERIC(18, 4) NOT NULL,
  month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year       INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- التدفقات النقدية السنوية
CREATE TABLE IF NOT EXISTS cash_flows (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  year           INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  planned_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
  actual_amount  NUMERIC(18, 4) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year)
);

-- لقطات صافي الثروة
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date        DATE NOT NULL,
  total_value NUMERIC(18, 4) NOT NULL,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- العقارات
CREATE TABLE IF NOT EXISTS real_estate (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL,
  purchase_value NUMERIC(18, 4) NOT NULL DEFAULT 0,
  current_value  NUMERIC(18, 4) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'owned' CHECK (status IN ('owned', 'rented', 'sold')),
  monthly_rental NUMERIC(18, 4) NOT NULL DEFAULT 0,
  purchase_date  DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. تفعيل أمان مستوى الصف (Row Level Security)
-- ============================================================

ALTER TABLE holdings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dividends           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_flows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE real_estate         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. سياسات RLS — كل مستخدم يرى بياناته فقط
-- ============================================================

-- holdings
CREATE POLICY "holdings_select" ON holdings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "holdings_insert" ON holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "holdings_update" ON holdings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "holdings_delete" ON holdings FOR DELETE USING (auth.uid() = user_id);

-- transactions
CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "transactions_insert" ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "transactions_update" ON transactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "transactions_delete" ON transactions FOR DELETE USING (auth.uid() = user_id);

-- dividends
CREATE POLICY "dividends_select" ON dividends FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "dividends_insert" ON dividends FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dividends_update" ON dividends FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dividends_delete" ON dividends FOR DELETE USING (auth.uid() = user_id);

-- cash_flows
CREATE POLICY "cash_flows_select" ON cash_flows FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cash_flows_insert" ON cash_flows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cash_flows_update" ON cash_flows FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cash_flows_delete" ON cash_flows FOR DELETE USING (auth.uid() = user_id);

-- net_worth_snapshots
CREATE POLICY "nw_select" ON net_worth_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "nw_insert" ON net_worth_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nw_update" ON net_worth_snapshots FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nw_delete" ON net_worth_snapshots FOR DELETE USING (auth.uid() = user_id);

-- real_estate
CREATE POLICY "re_select" ON real_estate FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "re_insert" ON real_estate FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "re_update" ON real_estate FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "re_delete" ON real_estate FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 4. دالة تحديث updated_at تلقائياً (اختياري)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER holdings_updated_at
  BEFORE UPDATE ON holdings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 5. فهرس فريد للقطات التلقائية (R-2)
-- يمنع إنشاء أكثر من لقطة واحدة في اليوم لكل مستخدم
-- (الداشبورد يُنشئها تلقائياً كل شهر — upsert يعتمد على هذا الفهرس)
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_nw_snapshots_user_date
  ON net_worth_snapshots (user_id, date);
