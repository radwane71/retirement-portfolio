-- ثروة — Schema v5 — دالة حذف الحساب الذاتي
-- شغّل في Supabase SQL Editor

-- ===========================================================
-- دالة delete_own_account
-- تسمح للمستخدم بحذف حسابه بنفسه فوراً
-- ===========================================================
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
  DELETE FROM public.holdings              WHERE user_id = _uid;
  DELETE FROM public.transactions          WHERE user_id = _uid;
  DELETE FROM public.dividends             WHERE user_id = _uid;
  DELETE FROM public.cashflow_entries      WHERE user_id = _uid;
  DELETE FROM public.net_worth_snapshots   WHERE user_id = _uid;
  DELETE FROM public.nw_assets             WHERE user_id = _uid;
  DELETE FROM public.nw_liabilities        WHERE user_id = _uid;
  DELETE FROM public.real_estate           WHERE user_id = _uid;
  DELETE FROM public.user_stocks           WHERE user_id = _uid;
  DELETE FROM public.stock_targets         WHERE user_id = _uid;
  DELETE FROM public.sector_targets        WHERE user_id = _uid;
  DELETE FROM public.user_profiles         WHERE id      = _uid;

  -- حذف الحساب من auth.users
  DELETE FROM auth.users WHERE id = _uid;
END;
$$;

-- منح صلاحية التنفيذ للمستخدمين المسجلين فقط
REVOKE ALL ON FUNCTION delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;
