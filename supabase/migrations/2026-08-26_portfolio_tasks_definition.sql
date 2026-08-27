-- ══════════════════════════════════════════════════════════════════════
-- portfolio_tasks — تثبيت التعريف في المستودع
-- ----------------------------------------------------------------------
-- الجدول أُنشئ خارج المسار (من محرّر SQL) فلم يكن له `CREATE TABLE` في
-- المستودع إطلاقاً: يظهر في `ALTER TABLE` وحدها. ومعنى ذلك أن القاعدة لو
-- ضاعت يوماً لا يمكن إعادة بنائه من الريبو — وهو يحمل **عتبات القرار**
-- (accumulate_at · trim_from · trim_to · liquidate_above) التي يقرؤها
-- محرّك القرار (م.48) وتقودها الدالة المجدولة لتنبيهات البريد.
--
-- التعريف أدناه مأخوذ من `information_schema.columns` للقاعدة الحيّة
-- بتاريخ 2026-08-26 — تسعة عشر عموداً بأنواعها وقيمها الافتراضية كما هي،
-- لا كما نظنّها.
--
-- ⚠️ `IF NOT EXISTS` مقصود: هذا الملف **توثيقٌ واسترجاع**، لا يعدّل جدولاً
-- قائماً ولا يمسّ صفّاً واحداً من بياناتك. تشغيله على قاعدة فيها الجدول
-- لا يفعل شيئاً.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.portfolio_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- نوع المهمة — مفردات الواجهة في tasks.html
  --   accumulation · hold · reduction · monitoring · liquidation
  type             TEXT NOT NULL,
  ticker           TEXT,
  name             TEXT,

  -- active · done · cancelled
  status           TEXT NOT NULL DEFAULT 'active',
  notes            TEXT,

  target_price     NUMERIC,
  reduction_pct    NUMERIC,
  year             INTEGER DEFAULT EXTRACT(YEAR FROM now())::int,
  auto_generated   BOOLEAN DEFAULT false,

  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  closed_at        TIMESTAMPTZ,
  archived_at      TIMESTAMPTZ,

  -- عتبات م.48 — السعر مقابل القيمة العادلة
  accumulate_at    NUMERIC,   -- 🟢 حدّ التجميع
  trim_from        NUMERIC,   -- 🟡 بداية نطاق التخفيف
  trim_to          NUMERIC,   -- 🟡 نهايته
  liquidate_above  NUMERIC    -- 🔴 حدّ التصفية
);

-- ⚠️ لا تُضاف قيود CHECK على `type` و`status` هنا. المفردات أعلاه مقروءة
-- من الواجهة والكود، لا من مسحٍ لكل صفوفك — وقيدٌ لا يطابق صفّاً قديماً
-- واحداً يُفشل استرجاع القاعدة كلها. توثَّق المفردات ولا تُفرَض حتى
-- تُفحَص: SELECT DISTINCT type, status FROM portfolio_tasks;

ALTER TABLE public.portfolio_tasks ENABLE ROW LEVEL SECURITY;

-- سياسة واحدة فقط. سياستان PERMISSIVE من نوع ALL تُجمعان بـOR، فإن عُدّلت
-- إحداهما ونُسيت الأخرى فازت الأوسع بصمت (وقع ذلك فعلاً في 2026-08-26).
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portfolio_tasks'
  ) THEN
    CREATE POLICY "users_own_tasks" ON public.portfolio_tasks
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END
$do$;

-- الاستعلام السائد: مهام المالك النشطة لرمزٍ ما، الأحدث أولاً
CREATE INDEX IF NOT EXISTS portfolio_tasks_user_status_idx
  ON public.portfolio_tasks (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS portfolio_tasks_ticker_idx
  ON public.portfolio_tasks (user_id, ticker);
