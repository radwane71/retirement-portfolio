// ══════════════════════════════════════════════════════════════
// ثروة — Admin Dashboard Logic
// ══════════════════════════════════════════════════════════════

let allUsers      = [];
let allTickets    = [];
let allAuditLogs  = [];
let currentAdmin  = null;

// ── Bootstrap ─────────────────────────────────────────────────
(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  // AUDIT-FIX: gate on app_metadata (server-set) not user_metadata (user-writable). UI gate only — real enforcement is RLS via public.is_admin().
  if (!user?.app_metadata?.is_admin) {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px">
        <div style="font-size:2rem">🚫</div>
        <h2 style="color:var(--danger)">غير مصرح بالدخول</h2>
        <p style="color:var(--text-2)">هذه الصفحة مخصصة للمدير فقط</p>
        <a href="dashboard.html" class="btn btn-secondary">العودة للموقع</a>
      </div>`;
    return;
  }

  currentAdmin = user;
  document.getElementById('admin-email-badge').textContent = user.email;
  await loadModule('identity');
})();

// ── Module Switching ───────────────────────────────────────────
function showModule(name) {
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('module-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  loadModule(name);
}

async function loadModule(name) {
  switch (name) {
    case 'identity':    await loadUsers();         await loadIdentityMetrics(); break;
    case 'compliance':  await loadConsentLogs();   await loadErasureRequests(); break;
    case 'analytics':   await loadAnalytics(); break;
    case 'support':     await loadTickets(); break;
    case 'security':    await loadAuditLogs();     await loadFailedLogins(); break;
    case 'maintenance': await loadMaintenance();   await loadRecentVisitors(); break;
  }
}

// ══════════════════════════════════════════════════════════════
// 1. الهوية والتحقق
// ══════════════════════════════════════════════════════════════

async function loadIdentityMetrics() {
  const { data, error } = await supabaseClient
    .from('user_profiles')
    .select('status', { count: 'exact' });
  if (error) return;

  const total     = data?.length || 0;
  const confirmed = data?.filter(u => u.status === 'active').length || 0;
  const suspended = data?.filter(u => ['suspended','banned'].includes(u.status)).length || 0;
  const rate      = total > 0 ? Math.round(confirmed / total * 100) : 0;

  setText('m-total',      total);
  setText('m-confirmed',  confirmed);
  setText('m-suspended',  suspended);
  setText('m-conversion', rate + '%');
}

async function loadUsers() {
  const { data, error } = await supabaseClient
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    document.getElementById('users-tbody').innerHTML =
      `<tr><td colspan="5" class="tbl-empty">خطأ في التحميل: ${error.message}</td></tr>`;
    return;
  }
  allUsers = data || [];
  renderUsers(allUsers);
}

function renderUsers(list) {
  const tbody = document.getElementById('users-tbody');
  const callout = document.getElementById('sync-callout');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">لا يوجد مستخدمون</td></tr>';
    if (callout) callout.style.display = 'block';
    return;
  }
  if (callout) callout.style.display = 'none';
  tbody.innerHTML = list.map(u => `
    <tr>
      <td>${esc(u.email)}</td>
      <td class="small text-muted">${formatDate(u.created_at)}</td>
      <td class="small text-muted">${u.last_seen ? formatDate(u.last_seen) : '—'}</td>
      <td>${statusBadge(u.status)}</td>
      <td>
        <div class="flex gap-2">
          ${u.status !== 'suspended' ? `<button class="act-btn" onclick="setUserStatus('${u.id}','suspended')">تعليق</button>` : ''}
          ${u.status !== 'banned'    ? `<button class="act-btn danger" onclick="setUserStatus('${u.id}','banned')">حظر</button>` : ''}
          ${u.status !== 'active'    ? `<button class="act-btn" onclick="setUserStatus('${u.id}','active')">استعادة</button>` : ''}
        </div>
      </td>
    </tr>`).join('');
}

function filterUsers() {
  const q      = document.getElementById('user-search').value.trim().toLowerCase();
  const status = document.getElementById('user-status-filter').value;
  const list   = allUsers.filter(u => {
    const matchQ = !q || u.email?.toLowerCase().includes(q);
    const matchS = !status || u.status === status;
    return matchQ && matchS;
  });
  renderUsers(list);
}

async function setUserStatus(userId, status) {
  // AUDIT-FIX: replaced blocking confirm() with confirmAsync() — mobile-safe and CSP-safe
  const labels = { suspended: 'تعليق', banned: 'حظر', active: 'استعادة' };
  if (!await confirmAsync(`هل تريد تغيير حالة المستخدم إلى "${labels[status]}"؟`)) return;

  const { error } = await supabaseClient
    .from('user_profiles')
    .update({ status })
    .eq('id', userId);

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }

  await logAdminAction(
    status === 'active' ? 'RESTORE_USER' : status === 'suspended' ? 'SUSPEND_USER' : 'BAN_USER',
    userId,
    `تغيير الحالة إلى: ${status}`
  );
  showToast('تم تحديث حالة الحساب', 'success');
  await loadUsers();
  await loadIdentityMetrics();
}

// ══════════════════════════════════════════════════════════════
// 2. الامتثال والخصوصية
// ══════════════════════════════════════════════════════════════

async function loadConsentLogs() {
  const { data, error } = await supabaseClient
    .from('consent_logs')
    .select('*')
    .order('consented_at', { ascending: false })
    .limit(100);

  const tbody = document.getElementById('consent-tbody');
  if (error || !data?.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="tbl-empty">لا توجد سجلات موافقة بعد</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${esc(r.email || r.user_id)}</td>
      <td class="small">${formatDatetime(r.consented_at)}</td>
      <td class="small text-muted">${esc(r.ip_address || '—')}</td>
      <td class="small text-muted">${esc(r.terms_version || 'v1.0')}</td>
    </tr>`).join('');
}

async function loadErasureRequests() {
  const { data, error } = await supabaseClient
    .from('data_erasure_requests')
    .select('*')
    .order('requested_at', { ascending: false });

  const tbody = document.getElementById('erasure-tbody');
  if (error || !data?.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="tbl-empty">لا توجد طلبات معلقة</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${esc(r.email || r.user_id)}</td>
      <td class="small text-muted">${formatDate(r.requested_at)}</td>
      <td>${statusBadge(r.status === 'pending' ? 'pending' : r.status === 'executed' ? 'deleted' : 'active')}</td>
      <td>
        ${r.status === 'pending'
          ? `<button class="act-btn danger" onclick="executeErasure('${r.id}','${r.user_id}')">تنفيذ الحذف</button>`
          : '<span class="small text-muted">منفّذ</span>'}
      </td>
    </tr>`).join('');
}

async function executeErasure(requestId, userId) {
  // AUDIT-FIX: replaced blocking confirm() with confirmAsync() — mobile-safe and CSP-safe
  if (!await confirmAsync('⚠️ هذا الإجراء نهائي وغير قابل للتراجع. هل تريد حذف جميع بيانات هذا المستخدم؟')) return;

  // AUDIT-FIX: was only deleting 8/16 tables — GDPR violation; now deletes all 16 user tables
  // FK children first to avoid constraint violations
  const tables = [
    'review_log_attachments',   // FK → review_log
    'review_log',
    'holdings', 'transactions', 'dividends', 'cashflow_entries',
    'net_worth_snapshots', 'nw_assets', 'nw_liabilities', 'real_estate',
    'user_stocks', 'stock_targets', 'sector_targets', 'watchlist',
    'portfolio_cash', 'portfolio_tasks',
    'user_settings',   // AUDIT-FIX: synced user prefs (utils.js saveUserSetting) were left behind on erasure — GDPR completeness
  ];
  for (const tbl of tables) {
    const { error } = await supabaseClient.from(tbl).delete().eq('user_id', userId);
    if (error && error.code !== '42P01') console.warn(`erasure: ${tbl}`, error.message);
  }

  // تحديث حالة الطلب
  await supabaseClient.from('data_erasure_requests')
    .update({ status: 'executed', executed_at: new Date().toISOString() })
    .eq('id', requestId);

  await logAdminAction('EXECUTE_ERASURE', userId, 'حذف كلي لجميع البيانات بناءً على طلب المستخدم');
  showToast('تم تنفيذ الحذف الكلي', 'success');
  await loadErasureRequests();
}

// ══════════════════════════════════════════════════════════════
// 3. المؤشرات التشغيلية
// ══════════════════════════════════════════════════════════════

async function loadAnalytics() {
  const now   = new Date();
  const today = now.toISOString().split('T')[0];
  const week  = new Date(now - 7  * 86400000).toISOString();
  const month = new Date(now - 30 * 86400000).toISOString();

  // User counts from user_profiles
  const [
    { count: total },
    { count: dau },
    { count: wau },
    { count: mau }
  ] = await Promise.all([
    supabaseClient.from('user_profiles').select('*', { count: 'exact', head: true }),
    supabaseClient.from('user_profiles').select('*', { count: 'exact', head: true }).gte('last_seen', today),
    supabaseClient.from('user_profiles').select('*', { count: 'exact', head: true }).gte('last_seen', week),
    supabaseClient.from('user_profiles').select('*', { count: 'exact', head: true }).gte('last_seen', month),
  ]);

  setText('m-dau',     dau   ?? '—');
  setText('m-wau',     wau   ?? '—');
  setText('m-mau',     mau   ?? '—');
  setText('m-total-2', total ?? '—');
  setText('m-auth-users', total ?? '—');

  // Table row counts
  const tables = [
    ['holdings',            'الأسهم في المحافظ'],
    ['transactions',        'سجل المعاملات'],
    ['dividends',           'الأرباح الموزعة'],
    ['cashflow_entries',    'التدفقات النقدية'],
    ['nw_assets',           'أصول صافي الثروة'],
    ['nw_liabilities',      'التزامات صافي الثروة'],
    ['net_worth_snapshots', 'لقطات صافي الثروة'],
    ['real_estate',         'العقارات'],
  ];

  const counts = await Promise.all(
    tables.map(([tbl]) => supabaseClient.from(tbl).select('*', { count: 'exact', head: true }))
  );

  const tbody = document.getElementById('table-sizes-tbody');
  tbody.innerHTML = tables.map(([tbl, desc], i) => `
    <tr>
      <td><code style="color:var(--accent)">${tbl}</code></td>
      <td class="num">${counts[i].count ?? '—'}</td>
      <td class="small text-muted">${desc}</td>
    </tr>`).join('');

  // Averages (only if total > 0)
  if (total > 0) {
    const hCount  = counts[0].count || 0;
    const txCount = counts[1].count || 0;
    const reCount = counts[7].count || 0;
    setText('m-avg-holdings', (hCount  / total).toFixed(1));
    setText('m-avg-tx',       (txCount / total).toFixed(1));
    setText('m-re-ratio',     Math.round(reCount / total * 100) + '%');
  }
}

// ══════════════════════════════════════════════════════════════
// 4. الدعم والاتصالات
// ══════════════════════════════════════════════════════════════

async function loadTickets() {
  const { data, error } = await supabaseClient
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });

  allTickets = data || [];
  renderTickets(allTickets);
}

function renderTickets(list) {
  const tbody = document.getElementById('tickets-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">لا توجد تذاكر</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(t => `
    <tr>
      <td class="small">${esc(t.user_email || '—')}</td>
      <td>${esc(t.subject)}</td>
      <td class="small text-muted">${esc(t.browser || '—')}</td>
      <td class="small text-muted">${formatDate(t.created_at)}</td>
      <td>${ticketBadge(t.status)}</td>
      <td>
        <div class="flex gap-2">
          ${t.status !== 'resolved'
            ? `<button class="act-btn" onclick="resolveTicket('${t.id}')">تعليم محلول</button>`
            : '<span class="small text-muted">محلول</span>'}
        </div>
      </td>
    </tr>`).join('');
}

function filterTickets() {
  const s    = document.getElementById('ticket-filter').value;
  const list = s ? allTickets.filter(t => t.status === s) : allTickets;
  renderTickets(list);
}

async function resolveTicket(id) {
  const { error } = await supabaseClient
    .from('support_tickets')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  await logAdminAction('RESOLVE_TICKET', null, `حل التذكرة: ${id}`);
  showToast('تم تعليم التذكرة كمحلولة', 'success');
  await loadTickets();
}

async function sendBroadcast() {
  const subject = document.getElementById('broadcast-subject').value.trim();
  const body    = document.getElementById('broadcast-body').value.trim();
  const target  = document.getElementById('broadcast-target').value;

  if (!subject || !body) { showToast('أدخل الموضوع والنص', 'error'); return; }

  // حفظ التنبيه في جدول admin_broadcasts
  const { error } = await supabaseClient.from('admin_broadcasts').insert([{
    admin_id: currentAdmin.id,
    target,
    subject,
    body,
    sent_at: new Date().toISOString()
  }]);

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }

  await logAdminAction('SEND_BROADCAST', null, `إرسال تنبيه: ${subject} — المستهدف: ${target}`);
  document.getElementById('broadcast-status').innerHTML =
    '<span style="color:var(--success)">✅ تم حفظ التنبيه بنجاح</span>';
  document.getElementById('broadcast-subject').value = '';
  document.getElementById('broadcast-body').value    = '';
  showToast('تم إرسال التنبيه', 'success');
}

// ══════════════════════════════════════════════════════════════
// 5. الأمن وسجلات التدقيق
// ══════════════════════════════════════════════════════════════

async function loadFailedLogins() {
  const { data, error } = await supabaseClient
    .from('failed_login_attempts')
    .select('*')
    .order('attempt_count', { ascending: false })
    .limit(50);

  const tbody = document.getElementById('failed-logins-tbody');
  if (error || !data?.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">لا توجد محاولات مشبوهة</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr style="${r.attempt_count >= 5 ? 'background:rgba(248,81,73,0.05)' : ''}">
      <td>${esc(r.email || '—')}</td>
      <td class="small text-muted">${esc(r.ip_address || '—')}</td>
      <td class="num" style="color:${r.attempt_count >= 5 ? 'var(--danger)' : 'inherit'}">${r.attempt_count}</td>
      <td class="small text-muted">${formatDatetime(r.last_attempt)}</td>
      <td>
        ${r.attempt_count >= 5
          ? `<button class="act-btn danger" onclick="blockIP('${esc(r.ip_address)}','${esc(r.email)}')">حظر</button>`
          : '<span class="small text-muted">—</span>'}
      </td>
    </tr>`).join('');
}

async function blockIP(ip, email) {
  // AUDIT-FIX: replaced blocking confirm() with confirmAsync()
  if (!await confirmAsync(`هل تريد حظر IP: ${ip} ؟`)) return;
  await supabaseClient.from('blocked_ips').insert([{
    ip_address: ip,
    email,
    blocked_at: new Date().toISOString(),
    blocked_by: currentAdmin.id
  }]);
  await logAdminAction('BLOCK_IP', null, `حظر IP: ${ip} — البريد: ${email}`);
  showToast(`تم حظر ${ip}`, 'success');
  await loadFailedLogins();
}

async function loadAuditLogs() {
  const { data, error } = await supabaseClient
    .from('admin_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  allAuditLogs = data || [];
  renderAuditLogs(allAuditLogs);
}

function renderAuditLogs(list) {
  const tbody = document.getElementById('audit-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">لا توجد سجلات بعد</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(r => `
    <tr>
      <td><code style="font-size:0.78rem;color:var(--accent)">${esc(r.action_type)}</code></td>
      <td class="small text-muted">${esc(r.target_user_id || '—')}</td>
      <td class="small">${esc(r.action_details || '—')}</td>
      <td class="small text-muted">${esc(r.ip_address || '—')}</td>
      <td class="small text-muted">${formatDatetime(r.created_at)}</td>
    </tr>`).join('');
}

function filterAuditLogs() {
  const f    = document.getElementById('audit-action-filter').value;
  const list = f ? allAuditLogs.filter(r => r.action_type === f) : allAuditLogs;
  renderAuditLogs(list);
}

async function logAdminAction(actionType, targetUserId, details) {
  await supabaseClient.from('admin_audit_logs').insert([{
    admin_id:       currentAdmin.id,
    action_type:    actionType,
    target_user_id: targetUserId || null,
    action_details: details,
    ip_address:     null,   // لا يمكن جلبه من client-side
    created_at:     new Date().toISOString()
  }]);
}

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function statusBadge(status) {
  const map = {
    active:    ['badge-active',    'نشط'],
    suspended: ['badge-suspended', 'معلق'],
    banned:    ['badge-banned',    'محظور'],
    deleted:   ['badge-deleted',   'محذوف'],
    pending:   ['badge-pending',   'معلق']
  };
  const [cls, label] = map[status] || ['badge-deleted', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function ticketBadge(status) {
  const map = {
    open:        ['badge-open',     'مفتوحة'],
    in_progress: ['badge-suspended','قيد المعالجة'],
    resolved:    ['badge-resolved', 'محلولة']
  };
  const [cls, label] = map[status] || ['badge-pending', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function formatDatetime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('ar-SA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh'
  });
}

async function adminLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

// ══════════════════════════════════════════════════════════════
// مزامنة المستخدمين من Supabase Auth → user_profiles
// ══════════════════════════════════════════════════════════════
async function syncUsers() {
  const btn = document.querySelector('[onclick="syncUsers()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ المزامنة…'; }

  const { data, error } = await supabaseClient.rpc('sync_user_profiles');

  if (btn) { btn.disabled = false; btn.textContent = 'مزامنة المستخدمين'; }

  if (error) {
    showToast('خطأ في المزامنة: ' + error.message, 'error');
    // إذا لم تكن الدالة موجودة، اعرض تعليمات إنشائها
    if (error.message.includes('does not exist') || error.code === '42883') {
      alert('يجب تشغيل SQL في Supabase أولاً:\n\nCREATE OR REPLACE FUNCTION sync_user_profiles()\nRETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$\nDECLARE inserted integer;\nBEGIN\n  INSERT INTO public.user_profiles (id, email, status, created_at)\n  SELECT au.id, au.email, \'active\', au.created_at\n  FROM auth.users au\n  LEFT JOIN public.user_profiles up ON up.id = au.id\n  WHERE up.id IS NULL;\n  GET DIAGNOSTICS inserted = ROW_COUNT;\n  RETURN inserted;\nEND;\n$$;');
    }
    return;
  }

  showToast(`تمت المزامنة — تم إضافة ${data ?? 0} مستخدم جديد`, 'success');
  await loadUsers();
  await loadIdentityMetrics();
}

// ══════════════════════════════════════════════════════════════
// وضع الصيانة
// ══════════════════════════════════════════════════════════════
async function loadMaintenance() {
  const { data } = await supabaseClient
    .from('site_config').select('value').eq('key', 'maintenance_mode').maybeSingle();

  const isOn = data?.value === 'true';
  updateMaintenanceBadge(isOn);

  const { data: msgData } = await supabaseClient
    .from('site_config').select('value').eq('key', 'maintenance_msg').maybeSingle();
  const msgEl = document.getElementById('maintenance-msg');
  if (msgEl && msgData?.value) msgEl.value = msgData.value;
}

function updateMaintenanceBadge(isOn) {
  const badge = document.getElementById('maintenance-status-badge');
  if (!badge) return;
  if (isOn) {
    badge.className = 'badge badge-banned';
    badge.textContent = '🔧 الصيانة مفعّلة — الموقع مغلق للمستخدمين';
  } else {
    badge.className = 'badge badge-active';
    badge.textContent = '✅ مفعّل — الموقع يعمل';
  }
}

async function setMaintenance(enable) {
  const msg = document.getElementById('maintenance-msg')?.value.trim() || '';
  const fb  = document.getElementById('maintenance-feedback');

  const upsertMode = { onConflict: 'key' };

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabaseClient.from('site_config').upsert(
      { key: 'maintenance_mode', value: String(enable) }, upsertMode),
    supabaseClient.from('site_config').upsert(
      { key: 'maintenance_msg', value: msg }, upsertMode)
  ]);

  if (e1 || e2) {
    if (fb) fb.innerHTML = '<span style="color:var(--danger)">خطأ: ' + (e1||e2).message + '</span>';
    // إذا الجدول غير موجود
    if ((e1||e2).message.includes('does not exist') || (e1||e2).code === '42P01') {
      alert('يجب تشغيل SQL في Supabase أولاً:\n\nCREATE TABLE IF NOT EXISTS site_config (\n  key TEXT PRIMARY KEY,\n  value TEXT NOT NULL DEFAULT \'\'\n);\nALTER TABLE site_config ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "config_admin" ON site_config\n  FOR ALL USING (((auth.jwt() ->> \'is_admin\')::boolean = true));');
    }
    return;
  }

  updateMaintenanceBadge(enable);
  if (fb) fb.innerHTML = enable
    ? '<span style="color:var(--danger)">🔧 وضع الصيانة مفعّل — المستخدمون سيُوجَّهون لصفحة الصيانة</span>'
    : '<span style="color:var(--success)">✅ الموقع الآن متاح للجميع</span>';

  await logAdminAction(
    enable ? 'ENABLE_MAINTENANCE' : 'DISABLE_MAINTENANCE',
    null,
    enable ? `تفعيل الصيانة: ${msg}` : 'إلغاء الصيانة'
  );
  showToast(enable ? 'تم تفعيل الصيانة' : 'تم إلغاء الصيانة', enable ? 'error' : 'success');
}

// ══════════════════════════════════════════════════════════════
// الزوار الأخيرون
// ══════════════════════════════════════════════════════════════
async function loadRecentVisitors() {
  const now   = new Date();
  const today = now.toISOString().split('T')[0];
  const week  = new Date(now - 7  * 86400000).toISOString();
  const month = new Date(now - 30 * 86400000).toISOString();

  const [{ count: vToday }, { count: vWeek }, { count: vMonth }] = await Promise.all([
    supabaseClient.from('user_profiles').select('*', { count: 'exact', head: true }).gte('last_seen', today),
    supabaseClient.from('user_profiles').select('*', { count: 'exact', head: true }).gte('last_seen', week),
    supabaseClient.from('user_profiles').select('*', { count: 'exact', head: true }).gte('last_seen', month),
  ]);

  setText('v-today', vToday ?? '—');
  setText('v-week',  vWeek  ?? '—');
  setText('v-month', vMonth ?? '—');

  const { data } = await supabaseClient
    .from('user_profiles')
    .select('email, last_seen, status')
    .not('last_seen', 'is', null)
    .order('last_seen', { ascending: false })
    .limit(20);

  const tbody = document.getElementById('recent-visitors-tbody');
  if (!tbody) return;
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="tbl-empty">لا توجد بيانات ظهور بعد</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${esc(r.email || '—')}</td>
      <td class="small text-muted">${formatDatetime(r.last_seen)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('');
}
