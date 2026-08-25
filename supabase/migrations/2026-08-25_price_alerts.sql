-- ══════════════════════════════════════════════════════════════
-- ثروة — تنبيهات الأسعار (بريد + إشعار متصفح)
-- المنطقتان المرسِلتان فقط: التخفيف (trim_from) والتصفية (liquidate_above)
-- منطقة التجميع (accumulate_at) لا تُرسل إشعاراً إطلاقاً — قرار المالك.
--
-- شغّل هذا الملف في Supabase SQL Editor. آمن لإعادة التشغيل (idempotent).
-- ══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- (1) notification_prefs — تفضيلات المستخدم لكل قناة
-- صفّ واحد لكل مستخدم (user_id هو المفتاح الأساسي نفسه)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id       UUID PRIMARY KEY
                REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- (2) push_subscriptions — اشتراكات Web Push
-- المالك قد يشترك من أكثر من جهاز/متصفح، فالصفّ لكل (مستخدم، endpoint)
-- لا لكل مستخدم. endpoint هو معرّف الاشتراك عند بوّابة الدفع.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,   -- مفتاح المتصفح العام (base64url، 65 بايت غير مضغوطة)
  auth       TEXT NOT NULL,   -- سرّ المصادقة (base64url، 16 بايت)
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- إعادة الاشتراك من نفس الجهاز تُحدِّث الصفّ ولا تُكرّره (upsert من العميل)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_subscriptions_user_endpoint_key'
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_user_endpoint_key
      UNIQUE (user_id, endpoint);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- (3) alert_state — جدول إعادة التسليح (جوهر «مرة واحدة»)
-- armed = TRUE  ⇒ السهم خارج المنطقة، والإشعار «مُسلَّح» جاهز للإطلاق
-- armed = FALSE ⇒ أُرسل الإشعار ولن يتكرّر حتى يخرج السعر من المنطقة
-- المفتاح مركّب (user_id, ticker, zone) — لكل منطقة حالتها المستقلة،
-- فدخول التخفيف لا يُطفئ تسليح التصفية.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alert_state (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker        TEXT NOT NULL,
  zone          TEXT NOT NULL CHECK (zone IN ('trim','liquidate')),
  armed         BOOLEAN NOT NULL DEFAULT TRUE,
  last_fired_at TIMESTAMPTZ,
  last_price    NUMERIC,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ticker, zone)
);

-- ──────────────────────────────────────────────────────────────
-- الفهارس
-- (alert_state و notification_prefs يبدآن بـ user_id في مفتاحهما
--  الأساسي، فالفهرس الضمني يخدم الاستعلام بالمستخدم أصلاً)
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_state_user_armed
  ON public.alert_state(user_id, armed);
-- الجدولة تجلب المستخدمين المفعَّلين فقط
CREATE INDEX IF NOT EXISTS idx_notif_prefs_enabled
  ON public.notification_prefs(user_id)
  WHERE email_enabled OR push_enabled;

-- ══════════════════════════════════════════════════════════════
-- Row Level Security — كل صفّ لمالكه فقط
-- ملاحظة: الدالة price-alerts تكتب بمفتاح الخدمة فتتجاوز RLS؛
-- هذه السياسات للعميل (صفحة الإعدادات) لا للدالة.
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.notification_prefs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_state         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_notification_prefs" ON public.notification_prefs;
CREATE POLICY "users_own_notification_prefs"
  ON public.notification_prefs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "users_own_push_subscriptions"
  ON public.push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_alert_state" ON public.alert_state;
CREATE POLICY "users_own_alert_state"
  ON public.alert_state
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- صلاحيات الدور المصادَق (Supabase يمنحها افتراضياً؛ صريحة هنا للاحتياط)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_prefs  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_state         TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- ربط الحذف الكلّي للمستخدم (erase_user / delete_my_data) بالجداول الجديدة
-- الحذف يتم بـ ON DELETE CASCADE على FK، لكن دوال المسح تحذف صراحةً —
-- تُضاف الجداول هنا فقط إن وُجدت الدوال (لا نكسر تشغيلاً بلا تلك الهجرة).
-- ══════════════════════════════════════════════════════════════
-- (يُترك للمالك: أضف الأسطر الثلاثة داخل erase_user/delete_my_data إن رغبت.
--  CASCADE يغطّي الحذف من auth.users على كل حال.)
