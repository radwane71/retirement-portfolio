async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return null; }

  const user = session.user;
  window._currentUserId = user.id;   // used by userLsKey() in utils.js

  // ── حالة الحساب: الحظر والتعليق كانا بلا أثر ────────────────────
  // زرّ «حظر» في لوحة الإدارة يكتب user_profiles.status، ولم يكن أيّ
  // موضع في التطبيق يقرأ هذا الحقل — فالمحظور يحتفظ بالوصول الكامل
  // لكل صفحة. نقرأه هنا مع last_seen في نداء واحد.
  // ملاحظة: هذه بوابة واجهة. الحظر الحقيقي يحتاج تعطيل الحساب من
  // Admin API أو إسناد السياسات إلى status — انظر ملف التحصين
  // supabase/migrations/2026-08-26_security_hardening.sql
  const { data: prof } = await supabaseClient
    .from('user_profiles').select('status').eq('id', user.id).maybeSingle();
  // صفٌّ غائب ⇒ لا حكم (م.21: البيان الغائب لا يُحاكَم)
  if (prof && prof.status && prof.status !== 'active') {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
    return null;
  }

  // تحديث آخر ظهور
  supabaseClient.from('user_profiles')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', user.id)
    .then(() => {});

  // إظهار رابط لوحة الإدارة للمدير فقط
  // AUDIT-FIX: read admin flag from app_metadata (server-set) not user_metadata (user-writable)
  if (user.app_metadata?.is_admin) {
    const adminLink = document.getElementById('nav-admin');
    if (adminLink) adminLink.style.display = '';
  }

  // فحص وضع الصيانة — await لمنع تحميل الصفحة قبل التحقق
  const { data: maintData } = await supabaseClient
    .from('site_config').select('value').eq('key', 'maintenance_mode').maybeSingle();
  if (maintData?.value === 'true' && !user.app_metadata?.is_admin) {
    window.location.href = 'maintenance.html';
    return null;
  }

  return user;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}
