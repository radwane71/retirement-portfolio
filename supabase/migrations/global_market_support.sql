-- ══════════════════════════════════════════════════════════════════
-- Migration: Global Market Support
-- الهدف: إضافة حقول السوق / العملة / سعر الصرف لدعم الأسهم العالمية
--
-- القاعدة الأساسية: كل الأعمدة لها DEFAULT آمن → البيانات الحالية
-- تبقى صحيحة 100% بدون أي تعديل على السجلات الموجودة.
--
-- market:               'saudi' | 'us' | 'uk' | 'eu' | 'global'
-- currency:             'SAR'   | 'USD' | 'GBP' | 'EUR' | ...
-- exchange_rate_to_sar: معامل التحويل لريال سعودي (SAR=1.0، USD≈3.75)
-- ══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- 1. جدول holdings
-- ────────────────────────────────────────────────────────────────
ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS market               TEXT    DEFAULT 'saudi',
  ADD COLUMN IF NOT EXISTS currency             TEXT    DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS exchange_rate_to_sar NUMERIC DEFAULT 1.0;

-- تحقق من صحة القيم المسموح بها
ALTER TABLE holdings
  DROP CONSTRAINT IF EXISTS holdings_market_check;
ALTER TABLE holdings
  ADD CONSTRAINT holdings_market_check
  CHECK (market IN ('saudi','us','uk','eu','global','other'));

ALTER TABLE holdings
  DROP CONSTRAINT IF EXISTS holdings_exchange_rate_check;
ALTER TABLE holdings
  ADD CONSTRAINT holdings_exchange_rate_check
  CHECK (exchange_rate_to_sar > 0);

-- ────────────────────────────────────────────────────────────────
-- 2. جدول transactions
-- ────────────────────────────────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS market               TEXT    DEFAULT 'saudi',
  ADD COLUMN IF NOT EXISTS currency             TEXT    DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS exchange_rate_to_sar NUMERIC DEFAULT 1.0;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_market_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_market_check
  CHECK (market IN ('saudi','us','uk','eu','global','other'));

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_exchange_rate_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_exchange_rate_check
  CHECK (exchange_rate_to_sar > 0);

-- ────────────────────────────────────────────────────────────────
-- 3. جدول dividends
-- ────────────────────────────────────────────────────────────────
ALTER TABLE dividends
  ADD COLUMN IF NOT EXISTS currency             TEXT    DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS exchange_rate_to_sar NUMERIC DEFAULT 1.0;

ALTER TABLE dividends
  DROP CONSTRAINT IF EXISTS dividends_exchange_rate_check;
ALTER TABLE dividends
  ADD CONSTRAINT dividends_exchange_rate_check
  CHECK (exchange_rate_to_sar > 0);

-- ────────────────────────────────────────────────────────────────
-- 4. RLS — الأعمدة الجديدة مشمولة تلقائياً بسياسات RLS الموجودة
-- (السياسات مبنية على user_id وليس على أعمدة محددة)
-- لا يحتاج تعديل.
-- ────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────
-- 5. تحقق ختامي — يطبع عدد الأعمدة الجديدة للتأكد
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  col_count INT;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name IN ('holdings','transactions','dividends')
    AND column_name IN ('market','currency','exchange_rate_to_sar');

  RAISE NOTICE '✅ Migration complete — % new columns added across 3 tables', col_count;
  RAISE NOTICE '   holdings:     market, currency, exchange_rate_to_sar';
  RAISE NOTICE '   transactions: market, currency, exchange_rate_to_sar';
  RAISE NOTICE '   dividends:    currency, exchange_rate_to_sar';
  RAISE NOTICE '   All existing rows default to market=saudi / currency=SAR / rate=1.0';
END $$;
