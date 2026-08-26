-- ══════════════════════════════════════════════════════════════════════
-- م.72 — سجلّ التدقيق: الحقول الأربعة الناقصة
-- ----------------------------------------------------------------------
-- «كل إشارة تُسجَّل بـ: التاريخ | الرمز | المادة المنطبقة | البيانات
--  المستخدمة ومصادرها | القرار | ما إذا نُفِّذ.»
-- والجدول كان يحمل حقلين فقط من الستة (التاريخ والرمز) — فالسجلّ لا يصلح
-- تدقيقاً: لا يُعرَف أي مادة طُبِّقت، ولا من أين جاءت الأرقام، ولا ما
-- قُرِّر، ولا هل نُفِّذ. وم.71 توجب مراجعة القرار بالنسخة السارية وقته،
-- وهي غير ممكنة بلا تسجيل المادة.
--
-- كل الحقول اختيارية (NULL) — لا يُكسَر أي سجلّ قائم، وم.21 تمنع معاقبة
-- المالك على بيان ناقص.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.review_log
  ADD COLUMN IF NOT EXISTS article   TEXT,   -- المادة المنطبقة (مثال: «م.42-أ»)
  ADD COLUMN IF NOT EXISTS sources   TEXT,   -- البيانات المستخدمة ومصادرها (ملف تداول…)
  ADD COLUMN IF NOT EXISTS decision  TEXT,   -- القرار: احتفظ · تجميع · تخفيف · خروج · خروج مؤجل
  ADD COLUMN IF NOT EXISTS executed  BOOLEAN;-- هل نُفِّذ فعلاً (NULL = لم يُحسَم بعد)

-- القرار محصور في مصطلحات م.3 وحدها — «القرار مربوط بمادة، أو احتفظ»
ALTER TABLE public.review_log
  DROP CONSTRAINT IF EXISTS review_log_decision_valid;
ALTER TABLE public.review_log
  ADD CONSTRAINT review_log_decision_valid
  CHECK (decision IS NULL OR decision IN
    ('hold', 'accumulate', 'trim', 'exit', 'deferred_exit', 'watch'));

-- ملاحظة م.43: «القراءة» فترةٌ لا تسجيل، وتُشتقّ من `review_date`
-- (السنة والربع) — فلا حاجة لعمود مستقل، ومراجعتان في الربع نفسه تُعدّان
-- قراءةً واحدة كما تنصّ المادة.
CREATE INDEX IF NOT EXISTS review_log_ticker_date_idx
  ON public.review_log (user_id, ticker, review_date DESC);
