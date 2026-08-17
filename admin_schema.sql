-- Tharwa Admin Schema - Safe to re-run (idempotent)

-- ===========================================================
-- 0. public.is_admin() — مصدر الحقيقة الوحيد لفحص الأدمن
-- يقرأ العلم من app_metadata (لا يعدّله إلا service_role) —
-- ممنوع الرجوع لـ (auth.jwt() ->> 'is_admin') لأنه كان يُقرأ من
-- user_metadata القابل للكتابة من المتصفح (تصعيد صلاحيات).
-- نفس التعريف في admin_rls_app_metadata_fix.sql — إعادة تشغيل
-- هذا الملف لا تمسح الإصلاح.
-- ===========================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

-- ===========================================================
-- 1. user_profiles
-- ===========================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK (status IN ('active','suspended','banned','deleted')),
  last_seen  TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_insert"       ON user_profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON user_profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON user_profiles;

CREATE POLICY "profiles_insert"       ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_select_admin" ON user_profiles
  FOR SELECT USING (public.is_admin());
CREATE POLICY "profiles_update_admin" ON user_profiles
  FOR UPDATE USING (public.is_admin());

-- ===========================================================
-- 2. consent_logs (immutable - no delete/update policies)
-- ===========================================================
CREATE TABLE IF NOT EXISTS consent_logs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email         TEXT,
  consented_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ip_address    INET,
  terms_version TEXT NOT NULL DEFAULT 'v1.0',
  user_agent    TEXT
);

ALTER TABLE consent_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consent_insert"       ON consent_logs;
DROP POLICY IF EXISTS "consent_select_admin" ON consent_logs;

CREATE POLICY "consent_insert"       ON consent_logs
  FOR INSERT WITH CHECK (true);
CREATE POLICY "consent_select_admin" ON consent_logs
  FOR SELECT USING (public.is_admin());

-- ===========================================================
-- 3. data_erasure_requests
-- ===========================================================
CREATE TABLE IF NOT EXISTS data_erasure_requests (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','executed','rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  executed_at  TIMESTAMPTZ,
  notes        TEXT
);

ALTER TABLE data_erasure_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erasure_insert"       ON data_erasure_requests;
DROP POLICY IF EXISTS "erasure_select_admin" ON data_erasure_requests;
DROP POLICY IF EXISTS "erasure_update_admin" ON data_erasure_requests;

CREATE POLICY "erasure_insert"       ON data_erasure_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "erasure_select_admin" ON data_erasure_requests
  FOR SELECT USING (public.is_admin());
CREATE POLICY "erasure_update_admin" ON data_erasure_requests
  FOR UPDATE USING (public.is_admin());

-- ===========================================================
-- 4. support_tickets
-- ===========================================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email  TEXT,
  subject     TEXT NOT NULL,
  description TEXT NOT NULL,
  browser     TEXT,
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','in_progress','resolved')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_insert"       ON support_tickets;
DROP POLICY IF EXISTS "ticket_select_own"   ON support_tickets;
DROP POLICY IF EXISTS "ticket_select_admin" ON support_tickets;
DROP POLICY IF EXISTS "ticket_update_admin" ON support_tickets;

CREATE POLICY "ticket_insert"       ON support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ticket_select_own"   ON support_tickets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ticket_select_admin" ON support_tickets
  FOR SELECT USING (public.is_admin());
CREATE POLICY "ticket_update_admin" ON support_tickets
  FOR UPDATE USING (public.is_admin());

-- ===========================================================
-- 5. admin_audit_logs (insert only - immutable)
-- ===========================================================
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  log_id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type    VARCHAR(60) NOT NULL,
  target_user_id UUID,
  action_details TEXT,
  ip_address     INET,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_insert"       ON admin_audit_logs;
DROP POLICY IF EXISTS "audit_select_admin" ON admin_audit_logs;

CREATE POLICY "audit_insert"       ON admin_audit_logs
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "audit_select_admin" ON admin_audit_logs
  FOR SELECT USING (public.is_admin());

-- ===========================================================
-- 6. admin_broadcasts
-- ===========================================================
CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target     TEXT NOT NULL DEFAULT 'all',
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  sent_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcast_insert"       ON admin_broadcasts;
DROP POLICY IF EXISTS "broadcast_select_admin" ON admin_broadcasts;

CREATE POLICY "broadcast_insert"       ON admin_broadcasts
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "broadcast_select_admin" ON admin_broadcasts
  FOR SELECT USING (public.is_admin());

-- ===========================================================
-- 7. failed_login_attempts
-- ===========================================================
CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT,
  ip_address    INET,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_attempt  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email, ip_address)
);

ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "failed_select_admin" ON failed_login_attempts;
DROP POLICY IF EXISTS "failed_insert"       ON failed_login_attempts;
DROP POLICY IF EXISTS "failed_update"       ON failed_login_attempts;

CREATE POLICY "failed_select_admin" ON failed_login_attempts
  FOR SELECT USING (public.is_admin());
CREATE POLICY "failed_insert"       ON failed_login_attempts
  FOR INSERT WITH CHECK (true);
CREATE POLICY "failed_update"       ON failed_login_attempts
  FOR UPDATE USING (true);

-- ===========================================================
-- 8. blocked_ips
-- ===========================================================
CREATE TABLE IF NOT EXISTS blocked_ips (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address  INET NOT NULL UNIQUE,
  email       TEXT,
  blocked_at  TIMESTAMPTZ DEFAULT NOW(),
  blocked_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE blocked_ips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocked_admin" ON blocked_ips;

CREATE POLICY "blocked_admin" ON blocked_ips
  FOR ALL USING (public.is_admin());

-- ===========================================================
-- 9. Activate first admin - run once only
-- Replace YOUR_USER_UUID with your UUID from Supabase Auth
-- العلم يوضع في raw_app_meta_data (لا يستطيع المستخدم تعديله)
-- وليس raw_user_meta_data القابل للكتابة من المتصفح.
-- بعد التشغيل: سجّل خروجاً ثم دخولاً ليصدر JWT جديد.
-- ===========================================================
-- UPDATE auth.users
--   SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'
--   WHERE id = 'YOUR_USER_UUID';
