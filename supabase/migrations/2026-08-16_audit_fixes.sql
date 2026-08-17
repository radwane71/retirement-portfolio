-- ══════════════════════════════════════════════════════════════
-- ثروة — إصلاحات تدقيق 2026-08-16 — شغّل في Supabase SQL Editor
-- آمن لإعادة التشغيل (idempotent)
-- يتطلب وجود public.is_admin() (admin_rls_app_metadata_fix.sql) —
-- ونعيد تعريفها هنا احتياطاً بنفس النص حتى يعمل الملف مستقلاً.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

-- ══════════════════════════════════════════════════════════════
-- (أ) FK دفتر المراجعة → auth.users بـ ON DELETE CASCADE
-- كانت بلا CASCADE فتمنع حذف المستخدم من auth.users.
-- (entry_id في المرفقات أصلاً ON DELETE CASCADE — لا يُمسّ)
-- الأسماء الافتراضية من supabase/migrations/review_log_tables.sql
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.review_log
  DROP CONSTRAINT IF EXISTS review_log_user_id_fkey;
ALTER TABLE public.review_log
  ADD CONSTRAINT review_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.review_log_attachments
  DROP CONSTRAINT IF EXISTS review_log_attachments_user_id_fkey;
ALTER TABLE public.review_log_attachments
  ADD CONSTRAINT review_log_attachments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ══════════════════════════════════════════════════════════════
-- (ب) سياسة UPDATE ذاتية على user_profiles
-- كانت سياسة UPDATE للمدير فقط → تحديث last_seen في auth.js
-- يفشل بصمت (0 صف) لغير المدير.
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "profiles_update_own" ON public.user_profiles;
CREATE POLICY "profiles_update_own" ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ══════════════════════════════════════════════════════════════
-- (ج) erase_user(target) — حذف كلي لبيانات مستخدم بأمر المدير
-- الحذف من عميل المدير كان يُرشَّح بـ RLS إلى 0 صف بصمت؛
-- SECURITY DEFINER يتجاوز RLS بعد التحقق من public.is_admin().
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.erase_user(target UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'غير مصرح — هذه الدالة للمدير فقط';
  END IF;
  IF target IS NULL THEN
    RAISE EXCEPTION 'يجب تحديد معرّف المستخدم المستهدف';
  END IF;

  -- الجداول الفرعية (FK children) أولاً
  DELETE FROM public.review_log_attachments WHERE user_id = target;
  DELETE FROM public.review_log             WHERE user_id = target;
  DELETE FROM public.holdings               WHERE user_id = target;
  DELETE FROM public.transactions           WHERE user_id = target;
  DELETE FROM public.dividends              WHERE user_id = target;
  DELETE FROM public.cashflow_entries       WHERE user_id = target;
  DELETE FROM public.net_worth_snapshots    WHERE user_id = target;
  DELETE FROM public.nw_assets              WHERE user_id = target;
  DELETE FROM public.nw_liabilities         WHERE user_id = target;
  DELETE FROM public.real_estate            WHERE user_id = target;
  DELETE FROM public.user_stocks            WHERE user_id = target;
  DELETE FROM public.stock_targets          WHERE user_id = target;
  DELETE FROM public.sector_targets         WHERE user_id = target;
  DELETE FROM public.watchlist              WHERE user_id = target;
  DELETE FROM public.portfolio_cash         WHERE user_id = target;
  DELETE FROM public.portfolio_tasks        WHERE user_id = target;
  DELETE FROM public.user_settings          WHERE user_id = target;
  DELETE FROM public.user_profiles          WHERE id      = target;

  -- حذف الحساب نفسه (consent_logs وطلبات المحو تبقى بـ SET NULL — أثر امتثال)
  DELETE FROM auth.users WHERE id = target;
END;
$$;

REVOKE ALL ON FUNCTION public.erase_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erase_user(UUID) TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- (د) delete_own_account — تحديث ليشمل الجداول الناقصة
-- (الأصل في schema_v5.sql كان ينسى: watchlist, portfolio_cash,
--  portfolio_tasks, review_log, review_log_attachments, user_settings)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'غير مصرح — يجب تسجيل الدخول';
  END IF;

  -- حذف البيانات (الـ CASCADE يتكفل بها لكن نحذفها صراحةً للتأكد)
  DELETE FROM public.review_log_attachments WHERE user_id = _uid;
  DELETE FROM public.review_log             WHERE user_id = _uid;
  DELETE FROM public.holdings               WHERE user_id = _uid;
  DELETE FROM public.transactions           WHERE user_id = _uid;
  DELETE FROM public.dividends              WHERE user_id = _uid;
  DELETE FROM public.cashflow_entries       WHERE user_id = _uid;
  DELETE FROM public.net_worth_snapshots    WHERE user_id = _uid;
  DELETE FROM public.nw_assets              WHERE user_id = _uid;
  DELETE FROM public.nw_liabilities         WHERE user_id = _uid;
  DELETE FROM public.real_estate            WHERE user_id = _uid;
  DELETE FROM public.user_stocks            WHERE user_id = _uid;
  DELETE FROM public.stock_targets          WHERE user_id = _uid;
  DELETE FROM public.sector_targets         WHERE user_id = _uid;
  DELETE FROM public.watchlist              WHERE user_id = _uid;
  DELETE FROM public.portfolio_cash         WHERE user_id = _uid;
  DELETE FROM public.portfolio_tasks        WHERE user_id = _uid;
  DELETE FROM public.user_settings          WHERE user_id = _uid;
  DELETE FROM public.user_profiles          WHERE id      = _uid;

  -- حذف الحساب من auth.users
  DELETE FROM auth.users WHERE id = _uid;
END;
$$;

REVOKE ALL ON FUNCTION delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;
