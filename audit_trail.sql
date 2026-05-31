-- ============================================================
-- audit_trail.sql — أرشفة بدلاً من حذف (Soft Delete)
-- نفّذه في Supabase SQL Editor مرة واحدة فقط
-- ============================================================

-- ── nw_assets ─────────────────────────────────────────────────
ALTER TABLE nw_assets
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ── nw_liabilities ────────────────────────────────────────────
ALTER TABLE nw_liabilities
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ── real_estate ───────────────────────────────────────────────
ALTER TABLE real_estate
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ── جدول سجل التغييرات (audit log) ───────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  table_name  TEXT        NOT NULL,
  record_id   UUID        NOT NULL,
  action      TEXT        NOT NULL,   -- 'create' | 'update' | 'archive'
  old_data    JSONB,
  new_data    JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_own" ON audit_log USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_record  ON audit_log (record_id);
