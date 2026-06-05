-- ════════════════════════════════════════════════════════════════════
-- AUDIT-FIX (CRITICAL): admin RLS must trust app_metadata, NOT user_metadata
-- ════════════════════════════════════════════════════════════════════
-- المشكلة: كل سياسات الأدمن كانت تستخدم (auth.jwt() ->> 'is_admin')، والعلم
-- كان يُضبط في raw_user_meta_data (= user_metadata) — وهو حقل يستطيع أي مستخدم
-- الكتابة فيه من المتصفح عبر:
--     supabaseClient.auth.updateUser({ data: { is_admin: true } })
-- → تصعيد صلاحيات: أي مستخدم يصير أدمن ويقرأ/يعدّل بيانات كل المستخدمين.
--
-- الحل: نقرأ العلم من app_metadata (raw_app_meta_data) — وهذا لا يمكن تعديله
-- إلا عبر service_role / Admin API، أي لا يستطيع المستخدم لمسه إطلاقاً.
--
-- Idempotent — آمن لإعادة التشغيل. شغّله مرة واحدة في Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════════

-- دالة مساعدة موحّدة: مصدر الحقيقة الوحيد لفحص الأدمن
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

-- ── 1. user_profiles ────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_admin" ON user_profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON user_profiles;
CREATE POLICY "profiles_select_admin" ON user_profiles FOR SELECT USING (public.is_admin());
CREATE POLICY "profiles_update_admin" ON user_profiles FOR UPDATE USING (public.is_admin());

-- ── 2. consent_logs ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "consent_select_admin" ON consent_logs;
CREATE POLICY "consent_select_admin" ON consent_logs FOR SELECT USING (public.is_admin());

-- ── 3. data_erasure_requests ────────────────────────────────────────
DROP POLICY IF EXISTS "erasure_select_admin" ON data_erasure_requests;
DROP POLICY IF EXISTS "erasure_update_admin" ON data_erasure_requests;
CREATE POLICY "erasure_select_admin" ON data_erasure_requests FOR SELECT USING (public.is_admin());
CREATE POLICY "erasure_update_admin" ON data_erasure_requests FOR UPDATE USING (public.is_admin());

-- ── 4. support_tickets ──────────────────────────────────────────────
DROP POLICY IF EXISTS "ticket_select_admin" ON support_tickets;
DROP POLICY IF EXISTS "ticket_update_admin" ON support_tickets;
CREATE POLICY "ticket_select_admin" ON support_tickets FOR SELECT USING (public.is_admin());
CREATE POLICY "ticket_update_admin" ON support_tickets FOR UPDATE USING (public.is_admin());

-- ── 5. admin_audit_logs ─────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_insert"       ON admin_audit_logs;
DROP POLICY IF EXISTS "audit_select_admin" ON admin_audit_logs;
CREATE POLICY "audit_insert"       ON admin_audit_logs FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "audit_select_admin" ON admin_audit_logs FOR SELECT USING (public.is_admin());

-- ── 6. admin_broadcasts ─────────────────────────────────────────────
DROP POLICY IF EXISTS "broadcast_insert"       ON admin_broadcasts;
DROP POLICY IF EXISTS "broadcast_select_admin" ON admin_broadcasts;
CREATE POLICY "broadcast_insert"       ON admin_broadcasts FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "broadcast_select_admin" ON admin_broadcasts FOR SELECT USING (public.is_admin());

-- ── 7. failed_login_attempts ────────────────────────────────────────
DROP POLICY IF EXISTS "failed_select_admin" ON failed_login_attempts;
CREATE POLICY "failed_select_admin" ON failed_login_attempts FOR SELECT USING (public.is_admin());

-- ── 8. blocked_ips ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "blocked_admin" ON blocked_ips;
CREATE POLICY "blocked_admin" ON blocked_ips FOR ALL USING (public.is_admin());

-- ── 9. site_config (from admin_schema_v2.sql) ───────────────────────
DROP POLICY IF EXISTS "config_admin" ON site_config;
CREATE POLICY "config_admin" ON site_config FOR ALL USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════════
-- 10. ترقية الأدمن: انقل العلم إلى app_metadata، واحذفه من user_metadata
--     (استبدل البريد ببريد حسابك). يجب تشغيله بصلاحية service_role.
-- ════════════════════════════════════════════════════════════════════
-- UPDATE auth.users
--   SET raw_app_meta_data  = COALESCE(raw_app_meta_data,  '{}'::jsonb) || '{"is_admin": true}',
--       raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) - 'is_admin'
--   WHERE email = 'YOUR_ADMIN_EMAIL';
--
-- بعد التشغيل: سجّل خروج ثم دخول من جديد حتى يُصدر JWT جديد يحمل app_metadata المحدّث.
-- ════════════════════════════════════════════════════════════════════
