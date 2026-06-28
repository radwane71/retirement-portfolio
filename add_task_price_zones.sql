-- ============================================================
-- مهام المحفظة — خانات الأسعار الثابتة لكل سهم (محرّك القرار)
-- الصق هذا في Supabase SQL Editor وشغّله مرّة واحدة.
-- آمن للتكرار (IF NOT EXISTS).
-- ============================================================
-- accumulate_at   : تجميع/شراء إضافي عند سعر ≤ هذا
-- trim_from       : بداية نطاق التخفيف (بيع الزائد) عند سعر ≥ هذا
-- trim_to         : نهاية نطاق التخفيف
-- liquidate_above : تصفية كاملة (تضخّم) إذا تجاوز السعر هذا الحدّ
-- ============================================================

ALTER TABLE portfolio_tasks ADD COLUMN IF NOT EXISTS accumulate_at   NUMERIC;
ALTER TABLE portfolio_tasks ADD COLUMN IF NOT EXISTS trim_from       NUMERIC;
ALTER TABLE portfolio_tasks ADD COLUMN IF NOT EXISTS trim_to         NUMERIC;
ALTER TABLE portfolio_tasks ADD COLUMN IF NOT EXISTS liquidate_above NUMERIC;
