-- ══════════════════════════════════════════════════════════════
-- إصلاح CHECK constraint على جدول transactions
-- يضيف 'grant' و 'split' للأنواع المسموح بها
-- شغّل في Supabase SQL Editor مرة واحدة فقط
-- ══════════════════════════════════════════════════════════════

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('buy', 'sell', 'grant', 'split'));
