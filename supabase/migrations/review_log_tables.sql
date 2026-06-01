-- ══════════════════════════════════════════════════════════════
-- دفتر المراجعة — جلسات إعادة التقييم الدورية للأسهم
-- ══════════════════════════════════════════════════════════════

-- جدول المراجعات
CREATE TABLE IF NOT EXISTS review_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users NOT NULL,
  ticker      TEXT NOT NULL,
  name        TEXT,
  sector      TEXT,
  review_date DATE NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- جدول المرفقات (مرتبط بـ review_log — يُحذف تلقائياً مع المراجعة)
CREATE TABLE IF NOT EXISTS review_log_attachments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id    UUID REFERENCES review_log(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users NOT NULL,
  filename    TEXT NOT NULL,
  ext         TEXT NOT NULL,
  content     TEXT NOT NULL,   -- نص عادي أو base64 لـ xlsx
  size_bytes  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE review_log ENABLE ROW LEVEL SECURITY;
-- DROP قبل إعادة الإنشاء في حال التشغيل مرة ثانية
DROP POLICY IF EXISTS "users_own_review_log" ON review_log;
CREATE POLICY "users_own_review_log"
  ON review_log
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE review_log_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_review_log_attachments" ON review_log_attachments;
CREATE POLICY "users_own_review_log_attachments"
  ON review_log_attachments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_review_log_user     ON review_log(user_id);
CREATE INDEX IF NOT EXISTS idx_review_log_att_entry ON review_log_attachments(entry_id);
