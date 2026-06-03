async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return null; }

  const user = session.user;
  window._currentUserId = user.id;   // used by userLsKey() in utils.js

  // تحديث آخر ظهور
  supabaseClient.from('user_profiles')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', user.id)
    .then(() => {});

  // إظهار رابط لوحة الإدارة للمدير فقط
  if (user.user_metadata?.is_admin) {
    const adminLink = document.getElementById('nav-admin');
    if (adminLink) adminLink.style.display = '';
  }

  // فحص وضع الصيانة — await لمنع تحميل الصفحة قبل التحقق
  const { data: maintData } = await supabaseClient
    .from('site_config').select('value').eq('key', 'maintenance_mode').maybeSingle();
  if (maintData?.value === 'true' && !user.user_metadata?.is_admin) {
    window.location.href = 'maintenance.html';
    return null;
  }

  return user;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}
