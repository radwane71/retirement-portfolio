// ══════════════════════════════════════════════════════════════
// جميع الجداول — مرتبة حسب الأولوية (FK-safe للحذف والإدراج)
// ══════════════════════════════════════════════════════════════
const TABLES = [
  'holdings',
  'transactions',
  'dividends',
  'cashflow_entries',
  'net_worth_snapshots',
  'nw_assets',
  'nw_liabilities',
  'real_estate',
  'user_stocks',
  'stock_targets',
  'sector_targets',
  'watchlist',
  'portfolio_cash',
  'portfolio_tasks',
  'review_log',
  'review_log_attachments',
];

// حجم الـ batch لكل جدول (الجداول الكبيرة تحتاج batch أصغر)
const BATCH_SIZES = { transactions: 50, holdings: 200 };
const DEFAULT_BATCH = 500;

// مفاتيح localStorage المشمولة في النسخة الاحتياطية — 100% من تفضيلات المستخدم
const LS_KEYS = [
  'tharwa-theme',
  'tharwa-zoom',
  'portfolio_cash_v1',
  'tharwa-alert-green',
  'tharwa-alert-yellow',
  'salary_planner_v1',
  'sukuk_planner_v1',
  'life_goals_v1',
  'inventory_v1',
  'school_tracker_v2',
  'school_kanda_v1',
  'nav_groups_v1',
  'retirement_goal_v1',
];

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-settings');
  loadAlertThresholds();
}

// ── عتبات ألوان التنبيهات ─────────────────────────────────────
function loadAlertThresholds() {
  const g = +(localStorage.getItem('tharwa-alert-green')  ?? 1);
  const y = +(localStorage.getItem('tharwa-alert-yellow') ?? 3);
  const gEl = document.getElementById('thresh-green');
  const yEl = document.getElementById('thresh-yellow');
  if (gEl) gEl.value = g;
  if (yEl) yEl.value = y;
}

function saveAlertThresholds() {
  const g = +(document.getElementById('thresh-green').value  || 1);
  const y = +(document.getElementById('thresh-yellow').value || 3);
  if (g >= y) {
    document.getElementById('thresh-status').textContent = '⛔ حد الأخضر يجب أن يكون أصغر من حد الأصفر';
    document.getElementById('thresh-status').style.color = 'var(--danger)';
    return;
  }
  localStorage.setItem('tharwa-alert-green',  g);
  localStorage.setItem('tharwa-alert-yellow', y);
  const el = document.getElementById('thresh-status');
  el.textContent = `✅ تم الحفظ — أخضر ≤ ${g}%، أصفر ≤ ${y}%، أحمر > ${y}%`;
  el.style.color = 'var(--success)';
}

function resetAlertThresholds() {
  localStorage.setItem('tharwa-alert-green',  1);
  localStorage.setItem('tharwa-alert-yellow', 3);
  loadAlertThresholds();
  const el = document.getElementById('thresh-status');
  el.textContent = '↩ تمت إعادة الضبط إلى الافتراضي (1% / 3%)';
  el.style.color = 'var(--text-muted)';
}

// ══════════════════════════════════════════════════════════════
// تصدير النسخة الاحتياطية
// ══════════════════════════════════════════════════════════════
async function exportBackup() {
  const btn = document.getElementById('btn-export');
  btn.disabled = true;
  btn.textContent = 'جارٍ التصدير…';
  setStatus('export-status', 'info', 'يتم جلب البيانات…');

  try {
    const backup = {
      version:     2,
      exported_at: new Date().toISOString(),
      _meta:       { tables: TABLES, app: 'tharwa' }
    };

    // ── جلب كل الجداول ───────────────────────────────────────
    for (const table of TABLES) {
      setStatus('export-status', 'info', `جارٍ تصدير: ${table}…`);
      const { data, error } = await supabaseClient.from(table).select('*');
      if (error) {
        // بعض الجداول قد لا تكون موجودة (اختيارية) — تجاهل بهدوء
        if (error.code === '42P01') {
          backup[table] = [];
          continue;
        }
        throw new Error(`خطأ في جدول ${table}: ${error.message}`);
      }
      backup[table] = data || [];
    }

    // ── إعدادات localStorage (theme, zoom, portfolio_cash) ────
    backup._local_settings = {};
    LS_KEYS.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) backup._local_settings[k] = v;
    });

    // ── إنشاء الملف ───────────────────────────────────────────
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `tharwa_backup_${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const totalRows = TABLES.reduce((s, t) => s + (backup[t]?.length || 0), 0);
    const tablesSummary = TABLES.map(t => `${t} (${backup[t]?.length || 0})`).join(' | ');
    setStatus('export-status', 'success',
      `✓ تم التصدير — ${totalRows} سجل في ${TABLES.length} جداول\n${tablesSummary}`);
    showToast(`✓ تم تصدير ${totalRows} سجل بنجاح`, 'success');

  } catch (err) {
    setStatus('export-status', 'error', '✗ ' + err.message);
    showToast('فشل التصدير: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'تصدير النسخة الاحتياطية';
  }
}

// ══════════════════════════════════════════════════════════════
// استعادة من نسخة احتياطية
// ══════════════════════════════════════════════════════════════
function triggerRestore() {
  document.getElementById('restore-file').value = '';
  document.getElementById('restore-file').click();
}

async function restoreBackup(input) {
  if (!input.files?.length) return;
  const file = input.files[0];

  // ── قراءة الملف ───────────────────────────────────────────
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    showToast('الملف غير صالح — يجب أن يكون JSON', 'error');
    setStatus('restore-status', 'error', '✗ الملف غير صالح');
    return;
  }

  // ── التحقق من البنية ──────────────────────────────────────
  const tablesFound = TABLES.filter(t => t in backup && Array.isArray(backup[t]));
  if (!backup.version || tablesFound.length < 3) {
    showToast('هذا الملف لا يبدو نسخة احتياطية صالحة', 'error');
    setStatus('restore-status', 'error', '✗ تنسيق غير صالح');
    return;
  }

  // ── ملخص ما سيتم استعادته ────────────────────────────────
  const rowCounts  = TABLES.map(t => `${t}: ${backup[t]?.length || 0}`);
  const totalRows  = TABLES.reduce((s, t) => s + (backup[t]?.length || 0), 0);
  const exportedAt = backup.exported_at
    ? new Date(backup.exported_at).toLocaleString('ar-SA') : 'غير محدد';

  const confirmed = confirm(
    `استعادة النسخة الاحتياطية\n\n` +
    `• الإصدار: ${backup.version}\n` +
    `• تاريخ التصدير: ${exportedAt}\n` +
    `• إجمالي السجلات: ${totalRows}\n\n` +
    `تفاصيل:\n${rowCounts.filter(r => !r.endsWith(': 0')).join('\n')}\n\n` +
    `⚠️ تحذير: سيتم حذف جميع بياناتك الحالية واستبدالها.\n\n` +
    `هل أنت متأكد من الاستعادة؟`
  );
  if (!confirmed) { setStatus('restore-status', 'info', 'تم الإلغاء'); return; }

  const btn = document.getElementById('btn-restore');
  btn.disabled = true;
  btn.textContent = 'جارٍ الاستعادة…';
  setStatus('restore-status', 'info', 'يتم حذف البيانات الحالية…');

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();

    // ── 0. حفظ نسخة طارئة من البيانات الحالية في localStorage ─
    setStatus('restore-status', 'info', 'يتم حفظ نسخة طارئة احترازية…');
    const emergencyBackup = { version: 'emergency', backed_up_at: new Date().toISOString() };
    for (const table of TABLES) {
      const { data } = await supabaseClient.from(table).select('*').eq('user_id', user.id);
      emergencyBackup[table] = data || [];
    }
    try {
      localStorage.setItem('tharwa_emergency_backup', JSON.stringify(emergencyBackup));
    } catch (_) { /* localStorage قد تكون ممتلئة — نكمل على أي حال */ }

    // ── 1. حذف كل البيانات الحالية ───────────────────────────
    for (const table of TABLES) {
      const { error } = await supabaseClient.from(table).delete().eq('user_id', user.id);
      if (error && error.code !== '42P01') {
        throw new Error(`خطأ في حذف ${table}: ${error.message}`);
      }
    }

    setStatus('restore-status', 'info', 'يتم إدراج البيانات المستعادة…');

    // ── 2. إدراج البيانات من النسخة الاحتياطية ───────────────
    let inserted = 0;
    for (const table of TABLES) {
      const rows = backup[table];
      if (!rows?.length) continue;

      const clean = rows.map(row => mapRow(table, row, user.id)).filter(Boolean);
      if (!clean.length) continue;

      const batchSize = BATCH_SIZES[table] || DEFAULT_BATCH;
      for (let i = 0; i < clean.length; i += batchSize) {
        const batch = clean.slice(i, i + batchSize);
        setStatus('restore-status', 'info',
          `يتم إدراج ${table}… (${Math.min(i + batchSize, clean.length)}/${clean.length})`);
        const { error } = await supabaseClient.from(table).insert(batch);
        if (error) throw new Error(`خطأ في إدراج ${table}: ${error.message}`);
        inserted += batch.length;
      }
    }

    // ── 3. استعادة إعدادات localStorage ─────────────────────
    if (backup._local_settings) {
      Object.entries(backup._local_settings).forEach(([k, v]) => {
        try { localStorage.setItem(k, v); } catch (_) {}
      });
    }

    setStatus('restore-status', 'success',
      `✓ تمت الاستعادة بنجاح — تم استعادة ${inserted} سجل`);
    showToast('تمت الاستعادة بنجاح ✓', 'success');

    setTimeout(() => {
      if (confirm('تمت الاستعادة. هل تريد الانتقال إلى لوحة التحكم؟')) {
        window.location.href = 'dashboard.html';
      }
    }, 800);

  } catch (err) {
    setStatus('restore-status', 'error',
      '✗ ' + err.message + '\n\n⚠️ تم حفظ نسخة طارئة من بياناتك في المتصفح قبل العملية — يمكنك استعادتها من قسم "استعادة النسخة الطارئة" أدناه إذا فقدت بياناتك.');
    showToast('فشلت الاستعادة — نسخة طارئة محفوظة في المتصفح', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'استعادة من نسخة احتياطية';
  }
}

// ══════════════════════════════════════════════════════════════
// تحويل الصف — ينظّف الحقول ويضع user_id الصحيح
// القاعدة: لا نحفظ id (يُولَّد تلقائياً)، نحفظ كل الحقول الأخرى
// ══════════════════════════════════════════════════════════════
function mapRow(table, row, userId) {
  if (!row) return null;
  let r;

  switch (table) {

    case 'holdings':
      r = {
        ticker:        row.ticker,
        name:          row.name          ?? '',
        sector:        row.sector        ?? '',
        shares:        row.shares        ?? 0,
        avg_price:     row.avg_price     ?? 0,
        current_price: row.current_price ?? 0,
        target_weight: row.target_weight ?? 0,
      };
      break;

    case 'transactions':
      r = {
        date:        row.date,
        ticker:      row.ticker,
        name:        row.name        ?? '',
        type:        row.type,
        shares:      row.shares      ?? 0,
        price:       row.price       ?? 0,
        commission:  row.commission  ?? 0,
        vat:         row.vat         ?? 0,
        total:       row.total       ?? 0,
        is_archived: row.is_archived ?? false,
      };
      break;

    case 'dividends':
      r = {
        date:        row.date,
        ticker:      row.ticker,
        name:        row.name        ?? '',
        amount:      row.amount      ?? 0,
        month:       row.month       ?? 1,
        year:        row.year        ?? new Date().getFullYear(),
        is_archived: row.is_archived ?? false,
      };
      break;

    case 'cashflow_entries':
      r = {
        date:        row.date,
        type:        row.type,
        amount:      row.amount      ?? 0,
        notes:       row.notes       ?? '',
        is_archived: row.is_archived ?? false,
      };
      break;

    case 'net_worth_snapshots':
      r = {
        date:          row.date,
        total_value:   row.total_value ?? 0,
        notes:         row.notes       ?? null,
        snapshot_json: row.snapshot_json ?? null,
      };
      break;

    case 'nw_assets':
      r = {
        category:    row.category    ?? '',
        name:        row.name        ?? '',
        value:       row.value       ?? 0,
        notes:       row.notes       ?? '',
        is_active:   row.is_active   ?? true,
        archived_at: row.is_active === false ? (row.archived_at ?? null) : null,
      };
      break;

    case 'nw_liabilities':
      r = {
        category:    row.category    ?? '',
        name:        row.name        ?? '',
        value:       row.value       ?? 0,
        notes:       row.notes       ?? '',
        is_active:   row.is_active   ?? true,
        archived_at: row.is_active === false ? (row.archived_at ?? null) : null,
      };
      break;

    case 'real_estate':
      r = {
        name:           row.name           ?? '',
        type:           row.type           ?? '',
        purchase_value: row.purchase_value ?? 0,
        current_value:  row.current_value  ?? 0,
        status:         row.status         ?? 'owned',
        monthly_rental: row.monthly_rental ?? 0,
        purchase_date:  row.purchase_date  ?? null,
        is_active:      row.is_active      ?? true,
        archived_at:    row.is_active === false ? (row.archived_at ?? null) : null,
      };
      break;

    case 'user_stocks':
      r = {
        ticker:       row.ticker,
        name:         row.name         ?? '',
        sector:       row.sector       ?? '',
        in_portfolio: row.in_portfolio ?? false,
      };
      break;

    case 'stock_targets':
      r = {
        ticker:      row.ticker,
        target_pct:  row.target_pct  ?? 0,
        entry_price: row.entry_price ?? null,
        exit_price:  row.exit_price  ?? null,
      };
      break;

    case 'sector_targets':
      r = {
        sector:     row.sector,
        target_pct: row.target_pct ?? 0,
      };
      break;

    case 'watchlist':
      r = {
        ticker:       row.ticker,
        name:         row.name         ?? '',
        sector:       row.sector       ?? '',
        target_price: row.target_price ?? 0,
        planned_pct:  row.planned_pct  ?? 0,
        notes:        row.notes        ?? '',
        created_at:   row.created_at   ?? new Date().toISOString(),
      };
      break;

    case 'portfolio_cash':
      r = {
        amount:     row.amount     ?? 0,
        updated_at: row.updated_at ?? new Date().toISOString(),
      };
      break;

    case 'portfolio_tasks':
      r = {
        type:           row.type,
        ticker:         row.ticker         ?? null,
        name:           row.name           ?? null,
        status:         row.status         ?? 'active',
        notes:          row.notes          ?? null,
        target_price:   row.target_price   ?? null,
        reduction_pct:  row.reduction_pct  ?? null,
        year:           row.year           ?? new Date().getFullYear(),
        auto_generated: row.auto_generated ?? false,
        created_at:     row.created_at     ?? new Date().toISOString(),
        updated_at:     row.updated_at     ?? new Date().toISOString(),
        closed_at:      row.closed_at      ?? null,
        archived_at:    row.archived_at    ?? null,
      };
      break;

    case 'review_log':
      r = {
        id:          row.id,
        ticker:      row.ticker,
        name:        row.name        ?? '',
        sector:      row.sector      ?? '',
        review_date: row.review_date,
        notes:       row.notes       ?? '',
        created_at:  row.created_at  ?? new Date().toISOString(),
        updated_at:  row.updated_at  ?? new Date().toISOString(),
      };
      break;

    case 'review_log_attachments':
      r = {
        id:         row.id,
        entry_id:   row.entry_id,
        filename:   row.filename,
        ext:        row.ext         ?? '',
        content:    row.content     ?? '',
        size_bytes: row.size_bytes  ?? 0,
        created_at: row.created_at  ?? new Date().toISOString(),
      };
      break;

    default:
      return null;
  }

  r.user_id = userId;
  return r;
}

// ══════════════════════════════════════════════════════════════
// تصفير جميع البيانات
// ══════════════════════════════════════════════════════════════
async function resetAllData() {
  const confirmed = confirm(
    '⚠️ تصفير جميع البيانات\n\n' +
    'سيتم حذف كل بياناتك نهائياً:\n' +
    '• الأسهم والمعاملات\n' +
    '• الأرباح الموزعة\n' +
    '• التدفقات النقدية\n' +
    '• صافي الثروة والأصول والالتزامات\n' +
    '• العقارات\n' +
    '• قاعدة البيانات والأهداف\n' +
    '• قائمة المراقبة\n' +
    '• نقد المحفظة\n\n' +
    'حسابك يبقى موجوداً — البيانات فقط تُمسح.\n\n' +
    'هل أنت متأكد؟'
  );
  if (!confirmed) return;

  const confirmed2 = confirm('تأكيد أخير: سيتم مسح كل البيانات بلا رجعة. متأكد؟');
  if (!confirmed2) return;

  const btn = document.getElementById('btn-reset');
  const resetStatus = document.getElementById('reset-status');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ المسح…'; }
  if (resetStatus) resetStatus.style.display = 'block';
  setStatus('reset-status', 'info', 'يتم مسح البيانات…');

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    for (const table of TABLES) {
      const { error } = await supabaseClient.from(table).delete().eq('user_id', user.id);
      if (error && error.code !== '42P01') {
        throw new Error(`خطأ في مسح ${table}: ${error.message}`);
      }
    }
    // مسح جميع مفاتيح localStorage بما فيها الثيم والزوم ونقد المحفظة
    LS_KEYS.forEach(k => localStorage.removeItem(k));
    setStatus('reset-status', 'success', '✓ تم مسح جميع البيانات بنجاح');
    showToast('تم التصفير — جميع بياناتك مُمسحة', 'success');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
  } catch (err) {
    setStatus('reset-status', 'error', '✗ ' + err.message);
    showToast('فشل المسح: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ تصفير جميع البيانات'; }
  }
}

// ══════════════════════════════════════════════════════════════
// حذف الحساب نهائياً
// ══════════════════════════════════════════════════════════════
async function deleteAccount() {
  const confirmed = confirm(
    '⛔ حذف الحساب نهائياً\n\n' +
    'سيتم حذف:\n• جميع بياناتك\n• حسابك بالكامل\n\n' +
    'لا يمكن التراجع عن هذا الإجراء.\n\n' +
    'هل أنت متأكد؟'
  );
  if (!confirmed) return;

  const emailInput = document.getElementById('del-email-confirm')?.value?.trim();
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (emailInput !== user.email) {
    showToast('البريد الإلكتروني غير مطابق', 'error');
    setStatus('del-account-status', 'error', '✗ البريد الإلكتروني الذي أدخلته لا يطابق حسابك');
    return;
  }

  const btn = document.getElementById('btn-delete-account');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحذف…'; }
  setStatus('del-account-status', 'info', 'يتم مسح البيانات وحذف الحساب…');

  try {
    // 1. مسح كل البيانات أولاً
    for (const table of TABLES) {
      await supabaseClient.from(table).delete().eq('user_id', user.id);
    }
    // مسح جميع مفاتيح localStorage
    LS_KEYS.forEach(k => localStorage.removeItem(k));

    // 2. حذف الحساب عبر دالة قاعدة البيانات
    const { error } = await supabaseClient.rpc('delete_own_account');
    if (error) throw new Error(error.message);

    showToast('تم حذف حسابك بنجاح', 'success');
    await supabaseClient.auth.signOut();
    setTimeout(() => { window.location.href = 'index.html'; }, 1200);
  } catch (err) {
    setStatus('del-account-status', 'error', '✗ ' + err.message);
    showToast('فشل الحذف: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '⛔ حذف حسابي نهائياً'; }
  }
}

// ══════════════════════════════════════════════════════════════
// تصدير تقرير المراجعة الشهرية — Markdown
// ══════════════════════════════════════════════════════════════
async function exportMonthlyReviewMD() {
  const btn = document.getElementById('btn-export-md');
  btn.disabled = true; btn.textContent = 'جارٍ البناء…';
  setStatus('md-export-status', 'info', 'يتم جلب البيانات من قاعدة البيانات…');

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();

    // ── جلب كل الجداول ─────────────────────────────────────
    const fetchTable = async (table, order) => {
      const q = supabaseClient.from(table).select('*');
      if (order) q.order(order, { ascending: true });
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw new Error(table + ': ' + error.message);
      return data || [];
    };

    setStatus('md-export-status', 'info', 'جارٍ تحميل البيانات…');
    const [holdings, transactions, dividends, cashflows, snapshots,
           assets, liabilities, realEstate, stockTargets, sectorTargets,
           watchlist, tasks, userStocks] = await Promise.all([
      fetchTable('holdings'),
      fetchTable('transactions', 'date'),
      fetchTable('dividends', 'date'),
      fetchTable('cashflow_entries', 'date'),
      fetchTable('net_worth_snapshots', 'date'),
      fetchTable('nw_assets'),
      fetchTable('nw_liabilities'),
      fetchTable('real_estate'),
      fetchTable('stock_targets'),
      fetchTable('sector_targets'),
      fetchTable('watchlist'),
      fetchTable('portfolio_tasks', 'created_at'),
      fetchTable('user_stocks'),
    ]);

    // ── بيانات localStorage ──────────────────────────────────
    const lsGet = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; } };
    const retGoal    = lsGet('retirement_goal_v1', { monthly: 0, swr: 4 });
    const salaryData = lsGet('salary_planner_v1',  { categories: [], entries: [] });
    const sukukData  = lsGet('sukuk_planner_v1',   { opportunities: [] });
    const lifeGoals  = lsGet('life_goals_v1',      []);

    setStatus('md-export-status', 'info', 'جارٍ بناء التقرير…');

    const today    = new Date();
    const dateStr  = today.toISOString().slice(0, 10);
    const SAR      = n => (+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const PCT      = n => (+n || 0).toFixed(2) + '%';
    const N        = n => (+n || 0).toLocaleString('en-US', { maximumFractionDigits: 4 });
    const MONTHS   = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

    // ── مساعدات ─────────────────────────────────────────────
    const mdTable = (headers, rows) => {
      const sep = headers.map(() => '---');
      return [
        '| ' + headers.join(' | ') + ' |',
        '| ' + sep.join(' | ') + ' |',
        ...rows.map(r => '| ' + r.join(' | ') + ' |')
      ].join('\n');
    };

    const lines = [];
    const h1 = t => lines.push(`# ${t}\n`);
    const h2 = t => lines.push(`\n## ${t}\n`);
    const h3 = t => lines.push(`\n### ${t}\n`);
    const p  = t => lines.push(t + '\n');
    const hr = () => lines.push('\n---\n');

    // ════════════════════════════════════════════════════════
    // غلاف التقرير
    // ════════════════════════════════════════════════════════
    h1('تقرير المراجعة الشهرية — محفظة ثروة');
    p(`**تاريخ التصدير:** ${dateStr}  `);
    p(`**المستخدم:** ${user.email}  `);
    p(`**الشهر المراجَع:** ${MONTHS[today.getMonth()]} ${today.getFullYear()}`);
    hr();

    // ════════════════════════════════════════════════════════
    // دليل القراءة
    // ════════════════════════════════════════════════════════
    h2('🔍 دليل القراءة');
    p('هذا الملف يحتوي على كامل بيانات المحفظة الاستثمارية الشخصية. مُصمَّم ليُقرأ مباشرةً بواسطة نماذج الذكاء الاصطناعي لتحليل الأداء واستخلاص الرؤى.');
    p('**المصطلحات المستخدمة:**');
    p('- **avg_price / متوسط التكلفة**: متوسط سعر الشراء المرجَّح لكل سهم (price × shares / total_shares)، لا يشمل العمولة');
    p('- **cost_basis / تكلفة الحيازة**: avg_price × عدد الأسهم المتبقية — التكلفة الفعلية لما يُحتفظ به حالياً');
    p('- **unrealized_pnl**: (current_price − avg_price) × shares — ربح/خسارة ورقية لم تُحقَّق بعد');
    p('- **realized_pnl**: عائد البيع − تكلفة الأسهم المباعة — ربح/خسارة فعلي من صفقات البيع المكتملة');
    p('- **YOC (Yield on Cost)**: أرباح موزعة ÷ تكلفة الحيازة × 100 — العائد على التكلفة الأصلية');
    p('- **total في المعاملات**: للشراء = price × shares + عمولة + VAT | للبيع = price × shares − عمولة − VAT');
    p('- **العمولة**: 0.15% من قيمة الصفقة بحد أقصى 100 ر.س + VAT 15%');
    p('- **الأرقام بالريال السعودي (ر.س) ما لم يُذكر خلاف ذلك**');
    hr();

    // ════════════════════════════════════════════════════════
    // 1. الأسهم الحالية (Holdings)
    // ════════════════════════════════════════════════════════
    h2('1. الأسهم الحالية في المحفظة (Holdings)');
    p('الأسهم التي يُحتفظ بها حالياً. السعر الحالي مُدخَّل يدوياً ويعكس آخر تحديث.');

    if (holdings.length) {
      let totalCost = 0, totalMkt = 0;
      const hRows = holdings
        .sort((a, b) => (+b.shares * +b.current_price) - (+a.shares * +a.current_price))
        .map(h => {
          const mkt   = +h.shares * +h.current_price;
          const cost  = +h.shares * +h.avg_price;
          const upnl  = mkt - cost;
          const upct  = cost > 0 ? upnl / cost * 100 : 0;
          totalCost  += cost;
          totalMkt   += mkt;
          return [
            h.ticker, h.name || '—', N(h.shares),
            SAR(h.avg_price), SAR(h.current_price),
            SAR(cost), SAR(mkt),
            (upnl >= 0 ? '+' : '') + SAR(upnl),
            (upct >= 0 ? '+' : '') + PCT(upct)
          ];
        });

      p(mdTable(
        ['الرمز','الاسم','الأسهم','متوسط التكلفة','السعر الحالي','تكلفة الحيازة','القيمة السوقية','ر/خ غير محقق','ر/خ %'],
        hRows
      ));

      const totalUpnl = totalMkt - totalCost;
      const totalUpct = totalCost > 0 ? totalUpnl / totalCost * 100 : 0;
      p(`\n**إجمالي تكلفة الحيازات:** ${SAR(totalCost)} ر.س  `);
      p(`**إجمالي القيمة السوقية:** ${SAR(totalMkt)} ر.س  `);
      p(`**إجمالي ر/خ غير محقق:** ${(totalUpnl >= 0 ? '+' : '')}${SAR(totalUpnl)} ر.س (${(totalUpct >= 0 ? '+' : '')}${PCT(totalUpct)})`);

      // توزيع القطاعات
      h3('توزيع القطاعات');
      const secMap = {};
      holdings.forEach(h => {
        const sec = h.sector || 'غير مصنف';
        secMap[sec] = (secMap[sec] || 0) + +h.shares * +h.current_price;
      });
      const secRows = Object.entries(secMap)
        .sort((a, b) => b[1] - a[1])
        .map(([sec, val]) => [sec, SAR(val), PCT(totalMkt > 0 ? val / totalMkt * 100 : 0)]);
      p(mdTable(['القطاع', 'القيمة السوقية', '% من المحفظة'], secRows));
    } else {
      p('_لا توجد أسهم محتفظ بها حالياً._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 2. سجل المعاملات الكامل (Transactions)
    // ════════════════════════════════════════════════════════
    h2('2. سجل المعاملات الكامل (Transactions)');
    p(`إجمالي عدد المعاملات: **${transactions.length}**  `);
    p('النوع: buy = شراء | sell = بيع | grant = منحة مجانية  ');
    p('total للشراء = قيمة الصفقة + عمولة + VAT | total للبيع = قيمة الصفقة − عمولة − VAT');

    if (transactions.length) {
      // ملخص عام
      const buys   = transactions.filter(t => t.type === 'buy');
      const sells  = transactions.filter(t => t.type === 'sell');
      const grants = transactions.filter(t => t.type === 'grant');
      const totalBuy  = buys.reduce((s, t) => s + +t.total, 0);
      const totalSell = sells.reduce((s, t) => s + +t.total, 0);
      p(`**إجمالي المشتريات:** ${SAR(totalBuy)} ر.س (${buys.length} معاملة)  `);
      p(`**إجمالي المبيعات:** ${SAR(totalSell)} ر.س (${sells.length} معاملة)  `);
      p(`**المنح المجانية:** ${grants.length} معاملة  `);
      p(`**صافي الإنفاق:** ${SAR(totalBuy - totalSell)} ر.س`);

      h3('جميع المعاملات (الأحدث أولاً)');
      const txRows = [...transactions].reverse().map(t => [
        t.date, t.ticker, t.name || '—',
        t.type === 'buy' ? 'شراء' : t.type === 'sell' ? 'بيع' : 'منحة',
        N(t.shares), SAR(t.price), SAR(t.commission), SAR(t.vat), SAR(t.total)
      ]);
      p(mdTable(
        ['التاريخ','الرمز','الاسم','النوع','الأسهم','السعر','العمولة','VAT','الإجمالي'],
        txRows
      ));

      // ملخص لكل رمز
      h3('ملخص المعاملات لكل رمز');
      const tkMap = {};
      transactions.forEach(t => {
        const tk = t.ticker;
        if (!tkMap[tk]) tkMap[tk] = { name: t.name, bought: 0, boughtShares: 0, sold: 0, soldShares: 0, grants: 0 };
        if (t.type === 'buy')   { tkMap[tk].bought += +t.total; tkMap[tk].boughtShares += +t.shares; }
        if (t.type === 'sell')  { tkMap[tk].sold   += +t.total; tkMap[tk].soldShares   += +t.shares; }
        if (t.type === 'grant') { tkMap[tk].grants += +t.shares; }
      });
      const tkRows = Object.entries(tkMap)
        .sort((a, b) => b[1].bought - a[1].bought)
        .map(([tk, v]) => {
          const net = v.bought - v.sold;
          return [tk, v.name || '—', N(v.boughtShares), SAR(v.bought), N(v.soldShares), SAR(v.sold), SAR(net)];
        });
      p(mdTable(
        ['الرمز','الاسم','أسهم مشتراة','تكلفة الشراء','أسهم مباعة','عائد البيع','صافي الإنفاق'],
        tkRows
      ));
    } else {
      p('_لا توجد معاملات مسجّلة._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 3. الأرباح الموزعة (Dividends)
    // ════════════════════════════════════════════════════════
    h2('3. الأرباح الموزعة (Dividends)');
    p(`إجمالي عدد سجلات الأرباح: **${dividends.length}**`);

    if (dividends.length) {
      const totalDiv = dividends.reduce((s, d) => s + +d.amount, 0);
      p(`**إجمالي الأرباح المستلمة (كل الأوقات):** ${SAR(totalDiv)} ر.س`);

      // ملخص سنوي
      h3('ملخص سنوي');
      const yearDiv = {};
      dividends.forEach(d => { yearDiv[d.year] = (yearDiv[d.year] || 0) + +d.amount; });
      const ydRows = Object.entries(yearDiv).sort((a, b) => b[0] - a[0])
        .map(([yr, amt]) => [yr, SAR(amt), PCT(totalDiv > 0 ? amt / totalDiv * 100 : 0)]);
      p(mdTable(['السنة','الأرباح','% من الإجمالي'], ydRows));

      // ملخص لكل رمز
      h3('إجمالي الأرباح لكل رمز');
      const tkDiv = {};
      dividends.forEach(d => {
        if (!tkDiv[d.ticker]) tkDiv[d.ticker] = { name: d.name, total: 0 };
        tkDiv[d.ticker].total += +d.amount;
      });
      const tkDivRows = Object.entries(tkDiv)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([tk, v]) => [tk, v.name || '—', SAR(v.total), PCT(totalDiv > 0 ? v.total / totalDiv * 100 : 0)]);
      p(mdTable(['الرمز','الاسم','إجمالي الأرباح','% من الإجمالي'], tkDivRows));

      // سجل كامل
      h3('سجل الأرباح كاملاً (الأحدث أولاً)');
      const divRows = [...dividends].reverse().map(d => [
        d.date, d.ticker, d.name || '—',
        MONTHS[(d.month || 1) - 1], d.year, SAR(d.amount)
      ]);
      p(mdTable(['التاريخ','الرمز','الاسم','الشهر','السنة','المبلغ'], divRows));
    } else {
      p('_لا توجد أرباح موزعة مسجّلة._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 4. التدفقات النقدية (Cash Flows)
    // ════════════════════════════════════════════════════════
    h2('4. التدفقات النقدية (Cash Flows)');
    p('الإيداعات والسحوبات من/إلى حساب المحفظة. تُستخدم لحساب صافي رأس المال الذي ضُخّ في المحفظة.');

    if (cashflows.length) {
      const deposits    = cashflows.filter(c => c.type === 'deposit');
      const withdrawals = cashflows.filter(c => c.type === 'withdrawal');
      const totalDep    = deposits.reduce((s, c) => s + +c.amount, 0);
      const totalWith   = withdrawals.reduce((s, c) => s + +c.amount, 0);
      p(`**إجمالي الإيداعات:** ${SAR(totalDep)} ر.س (${deposits.length} عملية)  `);
      p(`**إجمالي السحوبات:** ${SAR(totalWith)} ر.س (${withdrawals.length} عملية)  `);
      p(`**صافي الإيداع:** ${SAR(totalDep - totalWith)} ر.س`);

      h3('جميع التدفقات (الأحدث أولاً)');
      let running = 0;
      const cfRows = cashflows.map(c => { running += c.type === 'deposit' ? +c.amount : -+c.amount; return c; });
      const cfTable = [...cfRows].reverse().map(c => [
        c.date,
        c.type === 'deposit' ? 'إيداع' : 'سحب',
        SAR(c.amount),
        c.notes || '—'
      ]);
      p(mdTable(['التاريخ','النوع','المبلغ','الملاحظات'], cfTable));
    } else {
      p('_لا توجد تدفقات نقدية مسجّلة._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 5. صافي الثروة — الأصول والالتزامات
    // ════════════════════════════════════════════════════════
    h2('5. صافي الثروة (Net Worth)');

    // أحدث snapshot
    if (snapshots.length) {
      const latest = [...snapshots].sort((a, b) => b.date.localeCompare(a.date))[0];
      p(`**آخر لقطة:** ${latest.date} — الإجمالي: **${SAR(latest.total_value)} ر.س**`);
      if (latest.notes) p(`ملاحظات: ${latest.notes}`);

      h3('تاريخ اللقطات');
      const snRows = [...snapshots].reverse().map(s => [s.date, SAR(s.total_value), s.notes || '—']);
      p(mdTable(['التاريخ','صافي الثروة','ملاحظات'], snRows));
    }

    // الأصول
    const activeAssets = assets.filter(a => a.is_active !== false);
    if (activeAssets.length) {
      h3('الأصول النقدية وغير الاستثمارية (Assets)');
      p('هذه الأصول لا تشمل الأسهم والعقارات — يتم تتبعهم في أقسام مستقلة.');
      const totalAssets = activeAssets.reduce((s, a) => s + +a.value, 0);
      const aRows = activeAssets
        .sort((a, b) => +b.value - +a.value)
        .map(a => [a.category || '—', a.name, SAR(a.value), a.notes || '—']);
      p(mdTable(['الفئة','الاسم','القيمة','ملاحظات'], aRows));
      p(`**إجمالي الأصول:** ${SAR(totalAssets)} ر.س`);
    }

    // الالتزامات
    const activeLiabilities = liabilities.filter(l => l.is_active !== false);
    if (activeLiabilities.length) {
      h3('الالتزامات (Liabilities)');
      const totalLiab = activeLiabilities.reduce((s, l) => s + +l.value, 0);
      const lRows = activeLiabilities
        .sort((a, b) => +b.value - +a.value)
        .map(l => [l.category || '—', l.name, SAR(l.value), l.notes || '—']);
      p(mdTable(['الفئة','الاسم','القيمة','ملاحظات'], lRows));
      p(`**إجمالي الالتزامات:** ${SAR(totalLiab)} ر.س`);
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 6. العقارات (Real Estate)
    // ════════════════════════════════════════════════════════
    h2('6. العقارات (Real Estate)');

    const activeRE = realEstate.filter(r => r.is_active !== false);
    if (activeRE.length) {
      const totalPurchase = activeRE.reduce((s, r) => s + +r.purchase_value, 0);
      const totalCurrent  = activeRE.reduce((s, r) => s + +r.current_value, 0);
      const totalRental   = activeRE.reduce((s, r) => s + +r.monthly_rental, 0);
      p(`**عدد الأصول العقارية:** ${activeRE.length}  `);
      p(`**إجمالي تكلفة الشراء:** ${SAR(totalPurchase)} ر.س  `);
      p(`**إجمالي القيمة الحالية:** ${SAR(totalCurrent)} ر.س  `);
      p(`**إجمالي الإيجار الشهري:** ${SAR(totalRental)} ر.س  `);
      p(`**مكاسب القيمة:** ${SAR(totalCurrent - totalPurchase)} ر.س (${PCT(totalPurchase > 0 ? (totalCurrent - totalPurchase) / totalPurchase * 100 : 0)})`);

      const reRows = activeRE.map(r => {
        const gain    = +r.current_value - +r.purchase_value;
        const gainPct = +r.purchase_value > 0 ? gain / +r.purchase_value * 100 : 0;
        return [
          r.name, r.type || '—',
          r.purchase_date || '—', r.status || '—',
          SAR(r.purchase_value), SAR(r.current_value),
          (gain >= 0 ? '+' : '') + SAR(gain) + ` (${PCT(gainPct)})`,
          SAR(r.monthly_rental)
        ];
      });
      p(mdTable(
        ['الاسم','النوع','تاريخ الشراء','الحالة','تكلفة الشراء','القيمة الحالية','مكاسب القيمة','إيجار شهري'],
        reRows
      ));
    } else {
      p('_لا توجد أصول عقارية نشطة._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 7. أهداف المحفظة (Targets)
    // ════════════════════════════════════════════════════════
    h2('7. أهداف الأوزان (Targets)');
    p('الأوزان المستهدفة لكل سهم وقطاع. الوزن الحالي محسوب من القيمة السوقية الحالية.');

    const totalMktNow = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);

    if (stockTargets.length) {
      h3('أهداف الأسهم');
      const stRows = stockTargets
        .sort((a, b) => +b.target_pct - +a.target_pct)
        .map(st => {
          const h    = holdings.find(x => x.ticker === st.ticker);
          const curr = h && totalMktNow > 0 ? (+h.shares * +h.current_price) / totalMktNow * 100 : 0;
          const diff = curr - +st.target_pct;
          return [
            st.ticker, PCT(+st.target_pct), PCT(curr),
            (diff >= 0 ? '+' : '') + PCT(diff),
            Math.abs(diff) > 1.5 ? (diff > 0 ? '⚖️ تخفيف' : '🟢 تجميع') : '✅ ضمن الهدف'
          ];
        });
      p(mdTable(['الرمز','الهدف %','الحالي %','الفرق','التوصية'], stRows));
    }

    if (sectorTargets.length) {
      h3('أهداف القطاعات');
      const secValMap = {};
      holdings.forEach(h => {
        const sec = h.sector || 'غير مصنف';
        secValMap[sec] = (secValMap[sec] || 0) + +h.shares * +h.current_price;
      });
      const secRows = sectorTargets
        .sort((a, b) => +b.target_pct - +a.target_pct)
        .map(st => {
          const curr = totalMktNow > 0 ? (secValMap[st.sector] || 0) / totalMktNow * 100 : 0;
          const diff = curr - +st.target_pct;
          return [
            st.sector, PCT(+st.target_pct), PCT(curr),
            (diff >= 0 ? '+' : '') + PCT(diff),
            Math.abs(diff) > 1.5 ? (diff > 0 ? '⚖️ تخفيف' : '🟢 تجميع') : '✅ ضمن الهدف'
          ];
        });
      p(mdTable(['القطاع','الهدف %','الحالي %','الفرق','التوصية'], secRows));
    }

    if (!stockTargets.length && !sectorTargets.length) p('_لم تُحدَّد أهداف أوزان بعد._');
    hr();

    // ════════════════════════════════════════════════════════
    // 8. قائمة المراقبة (Watchlist)
    // ════════════════════════════════════════════════════════
    h2('8. قائمة المراقبة (Watchlist)');

    if (watchlist.length) {
      const wRows = watchlist.map(w => [
        w.ticker, w.name || '—', w.sector || '—',
        w.target_price > 0 ? SAR(w.target_price) : '—',
        w.planned_pct  > 0 ? PCT(w.planned_pct)  : '—',
        w.notes || '—'
      ]);
      p(mdTable(['الرمز','الاسم','القطاع','سعر الاستهداف','% مخطط','ملاحظات'], wRows));
    } else {
      p('_لا توجد أسهم في قائمة المراقبة._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 9. المهام (Tasks)
    // ════════════════════════════════════════════════════════
    h2('9. مهام المحفظة (Tasks)');
    p('المهام مقسّمة إلى: تصفية كاملة (liquidation) | تخفيف (reduction) | مراقبة (monitoring) | تجميع (accumulation) | احتفاظ (hold)');

    const TYPE_AR = { liquidation: 'تصفية كاملة', reduction: 'تخفيف', monitoring: 'مراقبة', accumulation: 'تجميع', hold: 'احتفاظ' };
    const STATUS_AR = { active: 'نشطة', done: 'منجزة', cancelled: 'ملغاة' };

    const activeTasks = tasks.filter(t => !t.auto_generated && t.status === 'active');
    const doneTasks   = tasks.filter(t => !t.auto_generated && t.status === 'done');
    const cancelTasks = tasks.filter(t => !t.auto_generated && t.status === 'cancelled');

    if (activeTasks.length) {
      h3(`المهام النشطة (${activeTasks.length})`);
      const atRows = activeTasks.map(t => [
        t.ticker || '—', t.name || '—', TYPE_AR[t.type] || t.type,
        t.target_price ? SAR(t.target_price) : '—',
        t.reduction_pct ? t.reduction_pct + '%' : '—',
        (t.notes || '—').replace(/\n/g, ' ')
      ]);
      p(mdTable(['الرمز','الاسم','النوع','السعر المستهدف','نسبة التخفيف','ملاحظات'], atRows));
    }

    if (doneTasks.length) {
      h3(`المهام المنجزة (${doneTasks.length})`);
      const dtRows = doneTasks.slice(-20).map(t => [
        t.ticker || '—', TYPE_AR[t.type] || t.type,
        t.closed_at ? t.closed_at.slice(0,10) : '—',
        (t.notes || '—').replace(/\n/g, ' ')
      ]);
      p(mdTable(['الرمز','النوع','تاريخ الإغلاق','ملاحظات'], dtRows));
    }

    if (!activeTasks.length && !doneTasks.length) p('_لا توجد مهام مسجّلة._');
    hr();

    // ════════════════════════════════════════════════════════
    // 10. الملخص الإحصائي للذكاء الاصطناعي
    // ════════════════════════════════════════════════════════
    h2('10. الملخص الإحصائي — جاهز للتحليل');
    p('هذا القسم يجمع أهم الأرقام في مكان واحد لتسهيل التحليل الآلي.');

    // حساب الأرقام
    const totalCostBasis  = holdings.reduce((s, h) => s + +h.shares * +h.avg_price, 0);
    const totalMktValue   = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
    const totalUnrealPnL  = totalMktValue - totalCostBasis;
    const totalRealPnL    = (() => {
      const closedMap = {};
      transactions.forEach(t => {
        const tk = t.ticker;
        if (!closedMap[tk]) closedMap[tk] = { buyShares: 0, buyCost: 0, sellRev: 0, sellShares: 0 };
        if (t.type === 'buy') { closedMap[tk].buyCost += +t.price * +t.shares; closedMap[tk].buyShares += +t.shares; }
        if (t.type === 'sell') { closedMap[tk].sellRev += +t.total; closedMap[tk].sellShares += +t.shares; }
      });
      return Object.values(closedMap).reduce((s, v) => {
        if (v.buyShares < 0.001) return s;
        const avgCost = v.buyCost / v.buyShares;
        return s + v.sellRev - avgCost * v.sellShares;
      }, 0);
    })();
    const totalDivAll      = dividends.reduce((s, d) => s + +d.amount, 0);
    const currentYearDivs  = dividends.filter(d => d.year === today.getFullYear()).reduce((s, d) => s + +d.amount, 0);
    const yoc              = totalCostBasis > 0 ? totalDivAll / totalCostBasis * 100 : 0;
    const totalDeposited   = cashflows.filter(c => c.type === 'deposit').reduce((s, c) => s + +c.amount, 0);
    const totalWithdrawn   = cashflows.filter(c => c.type === 'withdrawal').reduce((s, c) => s + +c.amount, 0);
    const reCurrentVal     = activeRE.reduce((s, r) => s + +r.current_value, 0);
    const activeAssetVal   = activeAssets.reduce((s, a) => s + +a.value, 0);
    const activeLiabVal    = activeLiabilities.reduce((s, l) => s + +l.value, 0);
    const totalNetWorth    = totalMktValue + reCurrentVal + activeAssetVal - activeLiabVal;

    p('```');
    p(`تاريخ التقرير              : ${dateStr}`);
    p(`--- محفظة الأسهم ---`);
    p(`عدد الأسهم المحتفظ بها     : ${holdings.length}`);
    p(`إجمالي تكلفة الحيازات      : ${SAR(totalCostBasis)} ر.س`);
    p(`إجمالي القيمة السوقية       : ${SAR(totalMktValue)} ر.س`);
    p(`ر/خ غير محقق               : ${(totalUnrealPnL >= 0 ? '+' : '') + SAR(totalUnrealPnL)} ر.س  (${PCT(totalCostBasis > 0 ? totalUnrealPnL / totalCostBasis * 100 : 0)})`);
    p(`ر/خ محقق من المبيعات        : ${(totalRealPnL >= 0 ? '+' : '') + SAR(totalRealPnL)} ر.س`);
    p(`--- الأرباح الموزعة ---`);
    p(`إجمالي الأرباح (كل الأوقات) : ${SAR(totalDivAll)} ر.س`);
    p(`أرباح السنة الحالية ${today.getFullYear()}      : ${SAR(currentYearDivs)} ر.س`);
    p(`YOC (عائد على التكلفة)     : ${PCT(yoc)}`);
    p(`--- التدفقات النقدية ---`);
    p(`إجمالي الإيداعات            : ${SAR(totalDeposited)} ر.س`);
    p(`إجمالي السحوبات             : ${SAR(totalWithdrawn)} ر.س`);
    p(`صافي رأس المال المُودَع      : ${SAR(totalDeposited - totalWithdrawn)} ر.س`);
    p(`--- العقارات ---`);
    p(`عدد الأصول العقارية         : ${activeRE.length}`);
    p(`إجمالي القيمة الحالية        : ${SAR(reCurrentVal)} ر.س`);
    p(`--- صافي الثروة الإجمالي ---`);
    p(`أسهم + عقارات + أصول − التزامات : ${SAR(totalNetWorth)} ر.س`);
    p(`--- المهام ---`);
    p(`مهام نشطة                  : ${activeTasks.length}`);
    p(`مهام منجزة                  : ${doneTasks.length}`);
    p('```');

    // توصيات الأهداف
    if (stockTargets.length) {
      h3('الانحرافات عن الأهداف (> 1.5%)');
      const deviations = stockTargets
        .map(st => {
          const h    = holdings.find(x => x.ticker === st.ticker);
          const curr = h && totalMktValue > 0 ? (+h.shares * +h.current_price) / totalMktValue * 100 : 0;
          return { ticker: st.ticker, target: +st.target_pct, current: curr, diff: curr - +st.target_pct };
        })
        .filter(x => Math.abs(x.diff) > 1.5)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

      if (deviations.length) {
        const devRows = deviations.map(d => [
          d.ticker,
          PCT(d.target),
          PCT(d.current),
          (d.diff >= 0 ? '+' : '') + PCT(d.diff),
          d.diff > 0 ? '⚖️ فوق الهدف — يحتاج تخفيف' : '🟢 تحت الهدف — فرصة تجميع'
        ]);
        p(mdTable(['الرمز','الهدف','الحالي','الانحراف','الإجراء المقترح'], devRows));
      } else {
        p('_جميع الأسهم ضمن نطاق الهدف (انحراف < 1.5%)._');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 11. هدف التقاعد / الاستقلال المالي (FIRE)
    // ════════════════════════════════════════════════════════
    h2('11. هدف الاستقلال المالي (FIRE)');
    if (retGoal.monthly > 0) {
      const monthlyTarget  = retGoal.monthly;
      const swrPct         = retGoal.swr || 4;
      const portfolioNeeded = (monthlyTarget * 12) / (swrPct / 100);
      const currentPortfolio = totalMktValue + activeRE.reduce((s, r) => s + +r.current_value, 0)
                              + activeAssets.reduce((s, a) => s + +a.value, 0)
                              - activeLiabilities.reduce((s, l) => s + +l.value, 0);
      const fireProgress   = portfolioNeeded > 0 ? currentPortfolio / portfolioNeeded * 100 : 0;
      const remaining      = portfolioNeeded - currentPortfolio;

      p('```');
      p(`المصاريف الشهرية المستهدفة  : ${SAR(monthlyTarget)} ر.س`);
      p(`المصاريف السنوية المستهدفة  : ${SAR(monthlyTarget * 12)} ر.س`);
      p(`نسبة السحب الآمن (SWR)      : ${swrPct}%`);
      p(`قاعدة الضرب                 : ${(100 / swrPct).toFixed(0)}× (قاعدة ${100 / swrPct >= 25 ? '25' : (100/swrPct).toFixed(0)} ضعف)`);
      p(`المحفظة المطلوبة للتقاعد    : ${SAR(portfolioNeeded)} ر.س`);
      p(`إجمالي الثروة الحالية        : ${SAR(currentPortfolio)} ر.س`);
      p(`نسبة الإنجاز                : ${PCT(fireProgress)}`);
      p(`المبلغ المتبقي               : ${SAR(Math.max(0, remaining))} ر.س`);
      p('```');

      if (fireProgress < 100) {
        p(`\n**تحليل:** بلغت نسبة الإنجاز نحو **${PCT(fireProgress)}** من الهدف. المتبقي ${SAR(remaining)} ر.س لتحقيق الاستقلال المالي بمصاريف شهرية ${SAR(monthlyTarget)} ر.س ونسبة سحب ${swrPct}%.`);
      } else {
        p(`\n**🎯 الهدف محقق!** الثروة الحالية تتجاوز الحد المطلوب للاستقلال المالي (${PCT(fireProgress)}).`);
      }
    } else {
      p('_لم يُحدَّد هدف التقاعد بعد. يمكن إدخاله من لوحة التحكم (بطاقة الاستقلال المالي)._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 12. الأداء التاريخي التفصيلي لكل سهم
    // ════════════════════════════════════════════════════════
    h2('12. الأداء التاريخي التفصيلي لكل سهم');
    p('يشمل: الربح/الخسارة الورقية، المحقق من البيع، الأرباح الموزعة، والعائد على التكلفة (YOC) لكل رمز.');

    {
      // بناء خريطة شاملة لكل رمز مرّ عبر المحفظة
      const allTickers = new Set([
        ...holdings.map(h => h.ticker),
        ...transactions.map(t => t.ticker),
        ...dividends.map(d => d.ticker),
      ]);

      const stockPerf = {};
      allTickers.forEach(tk => {
        stockPerf[tk] = {
          name: '', buyShares: 0, buyCostTotal: 0,
          sellShares: 0, sellRevTotal: 0,
          grantShares: 0, divTotal: 0,
        };
      });

      transactions.forEach(t => {
        const e = stockPerf[t.ticker];
        if (!e) return;
        e.name = e.name || t.name || '';
        if (t.type === 'buy')   { e.buyShares += +t.shares; e.buyCostTotal += +t.price * +t.shares; }
        if (t.type === 'sell')  { e.sellShares += +t.shares; e.sellRevTotal += +t.total; }
        if (t.type === 'grant') { e.grantShares += +t.shares; }
      });

      dividends.forEach(d => {
        if (stockPerf[d.ticker]) {
          stockPerf[d.ticker].divTotal += +d.amount;
          stockPerf[d.ticker].name = stockPerf[d.ticker].name || d.name || '';
        }
      });

      holdings.forEach(h => {
        if (stockPerf[h.ticker]) {
          stockPerf[h.ticker].name = stockPerf[h.ticker].name || h.name || '';
        }
      });

      const perfRows = [];
      Object.entries(stockPerf).forEach(([tk, e]) => {
        const holding    = holdings.find(h => h.ticker === tk);
        const avgCost    = e.buyShares > 0 ? e.buyCostTotal / e.buyShares : 0;
        const costBasis  = holding ? +holding.shares * +holding.avg_price : 0;
        const mktVal     = holding ? +holding.shares * +holding.current_price : 0;
        const unrealPnL  = mktVal - costBasis;
        // realized: revenue from sells minus cost of sold shares at avg price
        const soldCost   = avgCost > 0 ? e.sellShares * avgCost : 0;
        const realPnL    = e.sellRevTotal - soldCost;
        const yoc        = costBasis > 0 ? e.divTotal / costBasis * 100 : 0;
        const totalReturn = unrealPnL + realPnL + e.divTotal;

        perfRows.push({
          tk, name: e.name,
          shares: holding ? +holding.shares : 0,
          avgCost, mktVal, costBasis,
          unrealPnL, realPnL, divTotal: e.divTotal,
          yoc, totalReturn,
          inPortfolio: !!holding,
        });
      });

      // مرتبة: الحيازات الحالية أولاً ثم المُصفّاة
      perfRows.sort((a, b) => {
        if (a.inPortfolio !== b.inPortfolio) return b.inPortfolio - a.inPortfolio;
        return b.mktVal - a.mktVal;
      });

      if (perfRows.length) {
        h3('الحيازات الحالية — الأداء الكامل');
        const currentRows = perfRows.filter(r => r.inPortfolio).map(r => [
          r.tk, r.name || '—', N(r.shares),
          SAR(r.avgCost), SAR(r.costBasis), SAR(r.mktVal),
          (r.unrealPnL >= 0 ? '+' : '') + SAR(r.unrealPnL),
          (r.realPnL   >= 0 ? '+' : '') + SAR(r.realPnL),
          SAR(r.divTotal),
          PCT(r.yoc),
          (r.totalReturn >= 0 ? '+' : '') + SAR(r.totalReturn),
        ]);
        if (currentRows.length) {
          p(mdTable(
            ['الرمز','الاسم','الأسهم','متوسط التكلفة','تكلفة الحيازة','القيمة السوقية',
             'ر/خ ورقي','ر/خ محقق','أرباح موزعة','YOC%','إجمالي العائد'],
            currentRows
          ));
        }

        const closedRows = perfRows.filter(r => !r.inPortfolio && (r.realPnL !== 0 || r.divTotal > 0));
        if (closedRows.length) {
          h3('المراكز المُصفّاة (مُباعة بالكامل)');
          const clRows = closedRows.map(r => [
            r.tk, r.name || '—',
            (r.realPnL >= 0 ? '+' : '') + SAR(r.realPnL),
            SAR(r.divTotal),
            (r.totalReturn >= 0 ? '+' : '') + SAR(r.totalReturn),
          ]);
          p(mdTable(['الرمز','الاسم','ر/خ محقق','أرباح موزعة','إجمالي العائد'], clRows));
        }
      } else {
        p('_لا توجد بيانات أداء._');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 13. الأرباح الموزعة — ملخص شهري
    // ════════════════════════════════════════════════════════
    h2('13. الأرباح الموزعة — ملخص شهري');
    p('توزيع الأرباح المستلمة بحسب الشهر والسنة. مفيد لتقدير الدخل السلبي الشهري.');

    if (dividends.length) {
      // بناء مصفوفة سنة × شهر
      const divMatrix = {};
      const yearsSet  = new Set();
      dividends.forEach(d => {
        const yr = d.year || new Date(d.date).getFullYear();
        const mo = d.month || (new Date(d.date).getMonth() + 1);
        yearsSet.add(yr);
        if (!divMatrix[yr]) divMatrix[yr] = {};
        divMatrix[yr][mo] = (divMatrix[yr][mo] || 0) + +d.amount;
      });

      const years = [...yearsSet].sort((a, b) => b - a);
      const moNums = [1,2,3,4,5,6,7,8,9,10,11,12];

      const matHeaders = ['السنة', ...MONTHS, 'الإجمالي'];
      const matRows = years.map(yr => {
        const total = moNums.reduce((s, m) => s + (divMatrix[yr]?.[m] || 0), 0);
        return [
          String(yr),
          ...moNums.map(m => divMatrix[yr]?.[m] ? SAR(divMatrix[yr][m]) : '—'),
          SAR(total)
        ];
      });
      p(mdTable(matHeaders, matRows));

      // أعلى شهر
      let bestMonth = { yr: 0, mo: 0, amt: 0 };
      years.forEach(yr => {
        moNums.forEach(mo => {
          const amt = divMatrix[yr]?.[mo] || 0;
          if (amt > bestMonth.amt) bestMonth = { yr, mo, amt };
        });
      });
      if (bestMonth.amt > 0) {
        p(`\n**أعلى شهر أرباح:** ${MONTHS[bestMonth.mo - 1]} ${bestMonth.yr} — ${SAR(bestMonth.amt)} ر.س`);
      }

      // متوسط شهري
      const totalMonthsWithDiv = Object.values(divMatrix).flatMap(yr => Object.values(yr)).filter(v => v > 0).length;
      const totalDivs = dividends.reduce((s, d) => s + +d.amount, 0);
      if (totalMonthsWithDiv > 0) {
        p(`**متوسط الأرباح في الأشهر التي صدرت بها أرباح:** ${SAR(totalDivs / totalMonthsWithDiv)} ر.س/شهر`);
      }
    } else {
      p('_لا توجد أرباح موزعة مسجّلة._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 14. مخطط الراتب والتوزيعات
    // ════════════════════════════════════════════════════════
    h2('14. مخطط الراتب والتوزيعات الشهرية');
    p('بيانات مخطط الراتب — الدخل الشهري وتوزيعه على: مصاريف، ادخار، أصول، محفظة التقاعد.');

    {
      const entries = (salaryData.entries || []).sort((a, b) =>
        (a.year !== b.year ? a.year - b.year : a.month - b.month));
      const cats = salaryData.categories || [];

      if (entries.length) {
        const totalSalary = entries.reduce((s, e) => s + (+e.salary || 0), 0);
        const avgSalary   = totalSalary / entries.length;

        p(`**عدد الأشهر المسجّلة:** ${entries.length}  `);
        p(`**إجمالي الدخل المسجّل:** ${SAR(totalSalary)} ر.س  `);
        p(`**متوسط الراتب الشهري:** ${SAR(avgSalary)} ر.س`);

        // إجمالي التوزيعات لكل فئة
        const catTotals = {};
        cats.forEach(c => { catTotals[c.id] = { name: c.name, total: 0 }; });
        entries.forEach(e => {
          (e.allocations || []).forEach(al => {
            if (catTotals[al.catId]) catTotals[al.catId].total += +al.amount || 0;
            else catTotals[al.catId] = { name: al.catId, total: +al.amount || 0 };
          });
        });

        h3('إجمالي التوزيعات حسب الفئة');
        const catRows = Object.values(catTotals)
          .filter(c => c.total > 0)
          .sort((a, b) => b.total - a.total)
          .map(c => [c.name, SAR(c.total), PCT(totalSalary > 0 ? c.total / totalSalary * 100 : 0)]);
        if (catRows.length) p(mdTable(['الفئة', 'الإجمالي', '% من الدخل'], catRows));

        // آخر 12 شهراً
        h3('آخر 12 شهراً');
        const last12 = entries.slice(-12);
        const last12Headers = ['السنة', 'الشهر', 'الراتب', ...cats.map(c => c.name), 'المتبقي'];
        const last12Rows = last12.map(e => {
          const allocs = cats.map(c => {
            const al = (e.allocations || []).find(a => a.catId === c.id);
            return al ? SAR(al.amount) : '—';
          });
          const totalAlloc = (e.allocations || []).reduce((s, a) => s + (+a.amount || 0), 0);
          const remaining  = (+e.salary || 0) - totalAlloc;
          return [String(e.year), MONTHS[(e.month || 1) - 1], SAR(e.salary), ...allocs, SAR(remaining)];
        });
        p(mdTable(last12Headers, last12Rows));

        // مساهمة محفظة التقاعد تحديداً
        const retCat = cats.find(c => c.id === 'cat_retirement' || c.name.includes('تقاعد'));
        if (retCat) {
          const retTotal = catTotals[retCat.id]?.total || 0;
          p(`\n**إجمالي ما أُودع في محفظة التقاعد:** ${SAR(retTotal)} ر.س (${PCT(totalSalary > 0 ? retTotal / totalSalary * 100 : 0)} من إجمالي الدخل المسجّل)`);
        }
      } else {
        p('_لا توجد بيانات في مخطط الراتب._');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 15. الصكوك والسندات
    // ════════════════════════════════════════════════════════
    h2('15. الصكوك والسندات');
    p('فرص الصكوك المُدخَّلة في مخطط الصكوك.');

    {
      const opps = sukukData.opportunities || [];
      if (opps.length) {
        const totalInvested = opps.reduce((s, o) => s + (+o.amount || 0), 0);
        let totalNetProfit = 0, totalPaid = 0, totalUnpaid = 0;
        opps.forEach(o => {
          const dur = o.duration || 0;
          const ann = o.annualReturn || 0;
          const ret  = (+o.amount || 0) * (ann / 100) * (dur / 12);
          totalNetProfit += ret;
          (o.distributions || []).forEach(d => {
            if (d.status === 'تم السداد')  totalPaid   += +d.amount || 0;
            else                             totalUnpaid += +d.amount || 0;
          });
        });

        p(`**إجمالي المستثمر:** ${SAR(totalInvested)} ر.س  `);
        p(`**العائد الإجمالي المتوقع:** ${SAR(totalNetProfit)} ر.س  `);
        p(`**التوزيعات المستلمة:** ${SAR(totalPaid)} ر.س  `);
        p(`**التوزيعات المعلّقة:** ${SAR(totalUnpaid)} ر.س`);

        h3('قائمة الصكوك');
        const oppRows = opps.map(o => {
          const dur = o.duration || 0;
          const ann = o.annualReturn || 0;
          const net = (+o.amount || 0) * (ann / 100) * (dur / 12);
          return [
            o.name || '—', SAR(o.amount || 0),
            o.annualReturn ? PCT(o.annualReturn) : '—',
            dur ? dur + ' شهر' : '—',
            SAR(net), o.status || '—',
            o.issueDate || '—', o.maturityDate || '—',
          ];
        });
        p(mdTable(
          ['الاسم','المبلغ','العائد السنوي','المدة','صافي العائد','الحالة','تاريخ الإصدار','تاريخ الاستحقاق'],
          oppRows
        ));

        // التوزيعات التفصيلية
        const allDists = [];
        opps.forEach(o => {
          (o.distributions || []).forEach(d => {
            allDists.push({ opp: o.name || '—', date: d.date || '—', amount: +d.amount || 0, status: d.status || '—' });
          });
        });
        if (allDists.length) {
          h3('سجل التوزيعات');
          allDists.sort((a, b) => a.date.localeCompare(b.date));
          const distRows = allDists.map(d => [d.opp, d.date, SAR(d.amount), d.status]);
          p(mdTable(['الصك','التاريخ','المبلغ','الحالة'], distRows));
        }
      } else {
        p('_لا توجد صكوك مسجّلة._');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 16. الأهداف الحياتية
    // ════════════════════════════════════════════════════════
    h2('16. الأهداف الحياتية');
    p('قائمة الأهداف الشخصية والمالية وحالة الإنجاز.');

    if (Array.isArray(lifeGoals) && lifeGoals.length) {
      const activeGoals   = lifeGoals.filter(g => g.status === 'قيد التنفيذ');
      const doneGoals     = lifeGoals.filter(g => g.status === 'مكتمل');
      const delayedGoals  = lifeGoals.filter(g => g.status === 'مؤجل');
      const avgProg = lifeGoals.length
        ? (lifeGoals.reduce((s, g) => s + (+g.progress || 0), 0) / lifeGoals.length).toFixed(1)
        : 0;

      p(`**إجمالي الأهداف:** ${lifeGoals.length} | قيد التنفيذ: ${activeGoals.length} | مكتملة: ${doneGoals.length} | مؤجلة: ${delayedGoals.length}  `);
      p(`**متوسط نسبة الإنجاز:** ${avgProg}%`);

      const goalRows = [...lifeGoals]
        .sort((a, b) => {
          const order = { 'قيد التنفيذ': 0, 'مؤجل': 1, 'ملغي': 2, 'مكتمل': 3 };
          return (order[a.status] ?? 9) - (order[b.status] ?? 9);
        })
        .map(g => [
          g.title || '—', g.area || '—', g.priority || '—',
          g.status || '—', `${+g.progress || 0}%`,
          g.deadline || '—',
          g.cost ? SAR(g.cost) : '—',
          (g.notes || '').replace(/\n/g, ' ').slice(0, 60),
        ]);
      p(mdTable(
        ['الهدف','المجال','الأولوية','الحالة','الإنجاز','الموعد النهائي','التكلفة','ملاحظات'],
        goalRows
      ));
    } else {
      p('_لا توجد أهداف حياتية مسجّلة._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 17. قاعدة بيانات الأسهم (User Stocks)
    // ════════════════════════════════════════════════════════
    h2('17. قاعدة بيانات الأسهم المتابَعة');
    p('جميع الأسهم المُدخَّلة في قاعدة بيانات المستخدم — سواء كانت في المحفظة أم لا.');

    if (userStocks.length) {
      const inPort  = userStocks.filter(s => s.in_portfolio);
      const outPort = userStocks.filter(s => !s.in_portfolio);
      p(`**إجمالي الأسهم المتابَعة:** ${userStocks.length} | في المحفظة: ${inPort.length} | خارج المحفظة: ${outPort.length}`);

      const usRows = [...userStocks]
        .sort((a, b) => (b.in_portfolio ? 1 : 0) - (a.in_portfolio ? 1 : 0) || (a.ticker || '').localeCompare(b.ticker || ''))
        .map(s => [s.ticker || '—', s.name || '—', s.sector || '—', s.in_portfolio ? '✅ نعم' : '—']);
      p(mdTable(['الرمز','الاسم','القطاع','في المحفظة'], usRows));
    } else {
      p('_لا توجد أسهم في قاعدة البيانات._');
    }
    hr();

    p('---');
    p('_تم توليد هذا التقرير تلقائياً من تطبيق ثروة — مفكرة حسابية شخصية._');
    p('_الأرقام تعكس البيانات المُدخَّلة يدوياً ولا تمثّل توصيات استثمارية._');

    // ── تحميل الملف ─────────────────────────────────────────
    const md   = lines.join('\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `tharwa_review_${dateStr}.md`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);

    const totalLines = md.split('\n').length;
    setStatus('md-export-status', 'success',
      `✓ تم التصدير — ${totalLines} سطر | ${(md.length / 1024).toFixed(1)} KB`);
    showToast('✓ تم تصدير التقرير بنجاح', 'success');

  } catch (err) {
    setStatus('md-export-status', 'error', '✗ ' + err.message);
    showToast('فشل التصدير: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '📋 تصدير تقرير المراجعة (.md)';
  }
}

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════
function setStatus(elId, type, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className   = `backup-status status-${type}`;
  el.style.display = 'block';
}

init();
