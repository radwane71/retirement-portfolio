-- ثروة — Admin Schema v2 — شغّل هذا في Supabase SQL Editor
-- آمن لإعادة التشغيل (idempotent)

-- ===========================================================
-- 1. site_config — إعدادات الموقع (صيانة، إعلانات، إلخ)
-- ===========================================================
CREATE TABLE IF NOT EXISTS site_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_admin"  ON site_config;
DROP POLICY IF EXISTS "config_read"   ON site_config;

-- المدير يقرأ ويكتب
CREATE POLICY "config_admin" ON site_config
  FOR ALL USING (((auth.jwt() ->> 'is_admin')::boolean = true));

-- جميع المستخدمين يقرؤون (لفحص وضع الصيانة)
CREATE POLICY "config_read" ON site_config
  FOR SELECT USING (true);

-- القيم الافتراضية
INSERT INTO site_config (key, value) VALUES
  ('maintenance_mode', 'false'),
  ('maintenance_msg',  '')
ON CONFLICT (key) DO NOTHING;

-- ===========================================================
-- 2. sync_user_profiles — مزامنة auth.users → user_profiles
-- ===========================================================
CREATE OR REPLACE FUNCTION sync_user_profiles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inserted integer;
BEGIN
  INSERT INTO public.user_profiles (id, email, status, created_at)
  SELECT
    au.id,
    au.email,
    'active',
    au.created_at
  FROM auth.users au
  LEFT JOIN public.user_profiles up ON up.id = au.id
  WHERE up.id IS NULL;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

-- السماح للمدير باستدعاء الدالة
GRANT EXECUTE ON FUNCTION sync_user_profiles() TO authenticated;

-- ===========================================================
-- 3. إضافة الأدمن الحالي إذا لم يكن موجوداً في user_profiles
-- ===========================================================
INSERT INTO user_profiles (id, email, status)
SELECT id, email, 'active'
FROM auth.users
WHERE id = '0b171bdb-d747-4751-9d75-afd2c2bf07b2'
ON CONFLICT (id) DO NOTHING;
