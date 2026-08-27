-- ══════════════════════════════════════════════════════════════════════
-- تحصين أمني — 2026-08-26
-- ----------------------------------------------------------------------
-- نتيجة تدقيق أمني شامل. أربع سياسات كانت تسمح لغير المسجَّل (anon)
-- بالكتابة في جداول لا يكتب فيها التطبيق أصلاً، وواحدة سمحت للمستخدم
-- برفع الحظر عن نفسه. شغّل هذا الملف كاملاً في Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════


-- ── 1. failed_login_attempts: إغلاق مسار كتابة مفتوح للعالم ─────────
-- كان: FOR INSERT WITH CHECK (true) و FOR UPDATE USING (true) على دور
-- public — أي أن أيّ شخص على الإنترنت، بالمفتاح العلني المنشور في
-- js/supabase.js، يستطيع حقن صفّ ببريد يختاره و attempt_count = 999.
-- ولوحة الإدارة كانت تبني من ذلك البريد نصَّ JavaScript داخل onclick،
-- فيُنفَّذ الكود في جلسة المدير (أُصلح الطرف الآخر في js/admin.js).
-- التطبيق **لا يكتب في هذا الجدول إطلاقاً** — الكتابة من خطّاف المصادقة
-- أو service_role، وكلاهما يتجاوز RLS. فالسياستان بلا فائدة وبكلفة.
DROP POLICY IF EXISTS "failed_insert" ON failed_login_attempts;
DROP POLICY IF EXISTS "failed_update" ON failed_login_attempts;

REVOKE INSERT, UPDATE ON failed_login_attempts FROM anon, authenticated;

-- حارس إضافي: عدد المحاولات يجب أن يبقى في نطاق عاقل حتى لو فُتح
-- المسار مستقبلاً بالخطأ (زرّ الحظر يظهر عند 5 فأكثر).
ALTER TABLE failed_login_attempts
  DROP CONSTRAINT IF EXISTS failed_attempt_count_sane;
ALTER TABLE failed_login_attempts
  ADD CONSTRAINT failed_attempt_count_sane
  CHECK (attempt_count BETWEEN 1 AND 10000);


-- ── 2. consent_logs: ربط الكتابة بالجلسة ────────────────────────────
-- الجدول سجلّ قانوني غير قابل للحذف عمداً (لا سياسة DELETE لأحد).
-- ومع WITH CHECK (true) كان أيّ غريب يحقن فيه صفوفاً بأيّ user_id
-- وبريد وعنوان IP — ولا يمكن تنظيفها من التطبيق إطلاقاً. سجلّ إثبات
-- يكتب فيه الغرباء ولا يُنقّى أسوأ من عدم وجوده.
DROP POLICY IF EXISTS "consent_insert" ON consent_logs;
CREATE POLICY "consent_insert" ON consent_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ── 3. user_profiles: منع المستخدم من رفع الحظر عن نفسه ─────────────
-- السياسة كانت مقيَّدة بالصفّ لا بالعمود، فأُضيفت ليكتب auth.js حقل
-- last_seen، لكنها سمحت أيضاً بـ update({ status: 'active' }) — أي أن
-- زرّ الحظر في لوحة الإدارة يُنقَض بنداء REST واحد من المحظور نفسه.
DROP POLICY IF EXISTS "profiles_update_own" ON public.user_profiles;
CREATE POLICY "profiles_update_own" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND status IS NOT DISTINCT FROM
        (SELECT p.status FROM public.user_profiles p WHERE p.id = auth.uid())
  );


-- ── 4. sync_user_profiles: فحص إدارة + تثبيت search_path ────────────
-- كانت SECURITY DEFINER وممنوحة لكل مستخدم مسجَّل بلا أيّ فحص صلاحية —
-- خلافاً لشقيقتيها erase_user (تبدأ بفحص is_admin) و delete_own_account
-- (مقيَّدة بـ auth.uid). ودالة SECURITY DEFINER بلا search_path مثبَّت
-- هي الشكل الكلاسيكي لاختطاف المسار.
CREATE OR REPLACE FUNCTION sync_user_profiles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE inserted integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'غير مصرح — هذه الدالة للمدير فقط';
  END IF;

  INSERT INTO public.user_profiles (id, email, status, created_at)
  SELECT au.id, au.email, 'active', au.created_at
  FROM auth.users au
  LEFT JOIN public.user_profiles up ON up.id = au.id
  WHERE up.id IS NULL;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;


-- ── 5. portfolio_tasks: تأكيد تفعيل RLS ─────────────────────────────
-- هذا الجدول لا يوجد له CREATE TABLE في المستودع — أُنشئ خارج المسار،
-- والجدول المُنشأ من محرّر SQL يأتي بـ RLS **مطفأة** افتراضياً. وهو
-- يحمل عتبات القرار (accumulate_at / trim_from / liquidate_above) التي
-- تقود تنبيهات البريد. التفعيل هنا آمن ومتكرّر (idempotent).
ALTER TABLE IF EXISTS public.portfolio_tasks ENABLE ROW LEVEL SECURITY;

-- ⚠️ تحقّق 2026-08-26: الجدول **كان محمياً أصلاً** بسياسة `users_own_tasks`
-- شرطها `auth.uid() = user_id` — والتخوّف من انكشافه لم يتحقق.
-- ولا تُنشَأ سياسة ثانية هنا: سياستان PERMISSIVE من نوع ALL تُجمعان بـOR،
-- فتتطابقان اليوم، وإن عُدّلت إحداهما غداً ونُسيت الأخرى **فازت الأوسع
-- بصمت**. تُنشَأ فقط إن لم توجد أي سياسة — حتى لا يُقفَل جدولٌ جديد
-- بـRLS مفعَّلة وبلا سياسة (وذلك حجبٌ كامل لا حماية).
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portfolio_tasks'
  ) THEN
    CREATE POLICY "users_own_portfolio_tasks" ON public.portfolio_tasks
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END
$do$;


-- ── تحقّق بعد التشغيل ───────────────────────────────────────────────
-- SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('portfolio_tasks','failed_login_attempts','consent_logs');
-- SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
--   WHERE tablename IN ('failed_login_attempts','consent_logs','user_profiles','portfolio_tasks')
--   ORDER BY tablename, policyname;
