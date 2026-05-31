-- ============================================================
-- alter_snapshots.sql
-- أضف عمود snapshot_json لحفظ التفاصيل الكاملة مع كل لقطة
-- شغّله في Supabase SQL Editor مرة واحدة فقط
-- ============================================================
ALTER TABLE net_worth_snapshots
  ADD COLUMN IF NOT EXISTS snapshot_json JSONB;
