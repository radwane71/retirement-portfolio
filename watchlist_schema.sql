-- ============================================================
-- watchlist_schema.sql — جدول أسهم تحت المراقبة
-- شغّله في Supabase SQL Editor مرة واحدة فقط
-- ============================================================
CREATE TABLE IF NOT EXISTS watchlist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker       TEXT NOT NULL,
  name         TEXT NOT NULL DEFAULT '',
  sector       TEXT NOT NULL DEFAULT '',
  target_price NUMERIC(12,4) DEFAULT 0,   -- سعر الدخول المستهدف
  planned_pct  NUMERIC(6,2)  DEFAULT 0,   -- النسبة المخططة من المحفظة
  notes        TEXT          DEFAULT '',
  created_at   TIMESTAMPTZ   DEFAULT now(),
  UNIQUE (user_id, ticker)
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlist_own" ON watchlist USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
