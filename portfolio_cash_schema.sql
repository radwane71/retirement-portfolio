-- ══════════════════════════════════════════════════════════════
-- جدول نقد المحفظة — سجل واحد لكل مستخدم
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS portfolio_cash (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      NUMERIC     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS
ALTER TABLE portfolio_cash ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own portfolio cash"
  ON portfolio_cash FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
