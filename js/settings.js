// ══════════════════════════════════════════════════════════════
// جميع الجداول — مرتبة حسب الأولوية (FK-safe للحذف والإدراج)
// الأب قبل الابن في الإدراج، والابن قبل الأب في الحذف.
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
  // إعدادات المستخدم المتزامنة عبر الأجهزة (الراتب، الصكوك، هدف التقاعد، مؤشر تاسي،
  // محرّك القرار، حاسبة القيمة العادلة…). يُصدَّر الجدول **كاملاً** بلا قائمة بيضاء
  // للمفاتيح — فأي مفتاح جديد يضيفه أي تطوير مستقبلي يدخل النسخة تلقائياً.
  'user_settings',
  // ── أُضيفت 2026-08 (كانت تفوت النسخة الاحتياطية بالكامل) ──
  'support_tickets',   // تذاكر الدعم التي فتحها المالك — يقرؤها صاحبها (ticket_select_own)
  'user_profiles',     // ملف الحساب (البريد، الحالة، تاريخ الإنشاء) — مفتاحه id لا user_id
];

// ══════════════════════════════════════════════════════════════
// مواصفات الجداول الخارجة عن الافتراضي
//   ownerCol   : عمود هوية المالك (الافتراضي user_id)
//   OPTIONAL   : قد تمنع RLS قراءتها/حذفها → لا تُوقف التصدير ولا الاستعادة،
//                لكن يُعلَن ذلك صراحةً في التقرير (ممنوع الفشل الصامت)
//   UPSERT     : تُستعاد بالدمج بدل حذف+إدراج
//   NEVER_DELETE: لا تُحذف في مسار الاستعادة (مفتاحها هوية الحساب نفسه)
//   RESET_KEEP : «تصفير البيانات» لا يمسّها (ليست بيانات محفظة)
// ══════════════════════════════════════════════════════════════
const OWNER_COL       = { user_profiles: 'id' };
const OPTIONAL_TABLES = new Set(['support_tickets', 'user_profiles']);
const UPSERT_TABLES   = new Set(['user_profiles']);
const NEVER_DELETE    = new Set(['user_profiles']);
const RESET_KEEP      = new Set(['user_profiles', 'support_tickets']);

const ownerColOf = t => OWNER_COL[t] || 'user_id';

// وصف عربي لكل جدول — يُستخدم في تقارير الفحص
const TABLE_LABEL = {
  holdings: 'الأسهم في المحفظة',
  transactions: 'سجل المعاملات',
  dividends: 'الأرباح الموزعة',
  cashflow_entries: 'التدفقات النقدية',
  net_worth_snapshots: 'لقطات صافي الثروة',
  nw_assets: 'الأصول',
  nw_liabilities: 'الالتزامات',
  real_estate: 'العقارات',
  user_stocks: 'قاعدة بيانات أسهمك',
  stock_targets: 'أهداف الأسهم',
  sector_targets: 'أهداف القطاعات',
  watchlist: 'قائمة المراقبة',
  portfolio_cash: 'نقد المحفظة',
  portfolio_tasks: 'المهام والتذكيرات',
  review_log: 'دفتر المراجعة',
  review_log_attachments: 'مرفقات دفتر المراجعة',
  user_settings: 'الإعدادات المتزامنة (محرّك القرار، القيمة العادلة، الراتب، الصكوك…)',
  support_tickets: 'تذاكر الدعم',
  user_profiles: 'ملف الحساب',
};

// ترتيب الحذف: الأبناء (FK children) أولاً ثم البقية، مع استثناء ما لا يُحذف
function deleteOrder(list = TABLES) {
  const children = ['review_log_attachments'];
  return [
    ...children.filter(t => list.includes(t)),
    ...list.filter(t => !children.includes(t)),
  ].filter(t => !NEVER_DELETE.has(t));
}

// حجم الـ batch لكل جدول (الجداول الكبيرة تحتاج batch أصغر)
// review_log_attachments: كل صف حتى 2MB → batch=5 يحافظ على حجم طلب معقول (~10MB)
const BATCH_SIZES = {
  transactions:            50,
  holdings:               200,
  review_log_attachments:   5,
};
const DEFAULT_BATCH = 500;

// ══════════════════════════════════════════════════════════════
// جلب كل صفوف جدول على دفعات 1000 صف — .limit العالي لا يتجاوز
// حد PostgREST الخادمي (1000 افتراضياً) فتُقتطع النسخة بصمت.
// customize: دالة اختيارية تضيف فلاتر/ترتيباً على الاستعلام.
// الجداول غير الموجودة (42P01) تُرجع [] بهدوء (جداول اختيارية).
// ══════════════════════════════════════════════════════════════
async function fetchAllRows(table, customize) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabaseClient.from(table).select('*');
    if (customize) q = customize(q);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) {
      if (error.code === '42P01') return rows;
      throw new Error(`خطأ في جدول ${table}: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

// جلب صفوف جدول يخص المستخدم — مع ترقيم صفحات كامل وعمود المالك الصحيح.
// يرجّع { rows, unavailable, reason } فالجداول الاختيارية التي تمنعها RLS
// لا تُوقف التصدير لكنها تُعلَن صراحةً بدل أن تُعدّ «صفر صف» كذباً.
async function fetchOwnedRows(table, userId) {
  try {
    const rows = await fetchAllRows(table, q => q.eq(ownerColOf(table), userId));
    return { rows, unavailable: false, reason: '' };
  } catch (e) {
    if (OPTIONAL_TABLES.has(table)) return { rows: [], unavailable: true, reason: e.message };
    throw e;
  }
}

// عدّ صفوف المستخدم في جدول (بلا جلب) — للتحقق بعد الحذف والإدراج
async function countOwnedRows(table, userId) {
  try {
    const { count, error } = await supabaseClient.from(table)
      .select('*', { count: 'exact', head: true }).eq(ownerColOf(table), userId);
    if (error) return null;
    return count ?? null;
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════
// بصمة التكامل — تسلسل ثابت (مفاتيح مرتّبة) + هاش FNV-1a 32-bit
// الهدف: كشف أي اقتطاع أو تلف أو تعديل يدوي في ملف النسخة قبل الاستعادة.
// التسلسل يمرّ عبر JSON فتُنتج القيمة نفسها قبل الكتابة وبعد القراءة.
// ══════════════════════════════════════════════════════════════
function stableStringify(v) {
  if (v === null || typeof v !== 'object') {
    const s = JSON.stringify(v);
    return s === undefined ? 'null' : s;
  }
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort()
    .map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

function fnv1a(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// بصمة مصفوفة صفوف — تُحسب تدريجياً صفاً صفاً (لا نبني نصاً عملاقاً للمرفقات)
function fingerprintRows(rows) {
  let h = 0x811c9dc5;
  for (const r of (rows || [])) h = fnv1a(stableStringify(r) + '', h);
  return { rows: (rows || []).length, checksum: h.toString(16).padStart(8, '0') };
}

// بصمة خريطة مفاتيح localStorage
function fingerprintMap(map) {
  let h = 0x811c9dc5;
  for (const k of Object.keys(map || {}).sort()) {
    h = fnv1a(JSON.stringify(k) + '=' + JSON.stringify(map[k]) + '', h);
  }
  return { keys: Object.keys(map || {}).length, checksum: h.toString(16).padStart(8, '0') };
}

// ══════════════════════════════════════════════════════════════
// مفاتيح localStorage «المنطقية» — قائمة توثيقية للعرض فقط.
// النسخة الفعلية تعتمد المسح الحرفي الشامل (_local_all) أدناه،
// فلا يمكن لأي مفتاح جديد أن يضيع لو نُسي تسجيله هنا.
// ══════════════════════════════════════════════════════════════
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
  'tharwa-price-timestamps',
  'tharwa-benchmark_v1',
  'tharwa-benchmark-seeded-v1',      // flag: هل تمت البذرة الأولى لبيانات تاسي؟
  'tharwa-benchmark-src-migrated-v1',// flag: هل هُوجرت مصادر نقاط تاسي؟ (كان ناقصاً)
  'valuation_history_v1',            // سجل عمليات حاسبة القيمة العادلة (stock-valuation.html)
  'hide-salary-convention',          // حالة إخفاء لافتة اتفاقية الراتب (salary.html)
  'forecast_plans_v1',               // سجل خطط الضخ المحفوظة (forecast.html)
];

// مفاتيح localStorage المستثناة عمداً من النسخة
//  • sb-*                    توكنات جلسة Supabase — استعادتها ثغرة أمنية
//  • tharwa_emergency_backup نسخة طارئة محلية مؤقتة (تتضخم بلا فائدة)
//  • tharwa-dirty-tickers*   علم تعافٍ transient يُعاد بناؤه تلقائياً
function isExcludedLsKey(k) {
  return k.startsWith('sb-')
      || k === 'tharwa_emergency_backup'
      || k.startsWith('tharwa-dirty-tickers');
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-settings');
  loadAlertThresholds();
  refreshEmergencySection();
}

// ── عتبات ألوان التنبيهات ─────────────────────────────────────
function loadAlertThresholds() {
  const g = +(localStorage.getItem(userLsKey('tharwa-alert-green'))  ?? localStorage.getItem('tharwa-alert-green')  ?? 1);
  const y = +(localStorage.getItem(userLsKey('tharwa-alert-yellow')) ?? localStorage.getItem('tharwa-alert-yellow') ?? 3);
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
  localStorage.setItem(userLsKey('tharwa-alert-green'),  g);
  localStorage.setItem(userLsKey('tharwa-alert-yellow'), y);
  const el = document.getElementById('thresh-status');
  el.textContent = `✅ تم الحفظ — أخضر ≤ ${g}%، أصفر ≤ ${y}%، أحمر > ${y}%`;
  el.style.color = 'var(--success)';
}

function resetAlertThresholds() {
  localStorage.setItem(userLsKey('tharwa-alert-green'),  1);
  localStorage.setItem(userLsKey('tharwa-alert-yellow'), 3);
  loadAlertThresholds();
  const el = document.getElementById('thresh-status');
  el.textContent = '↩ تمت إعادة الضبط إلى الافتراضي (1% / 3%)';
  el.style.color = 'var(--text-muted)';
}

// ══════════════════════════════════════════════════════════════
// بناء كائن النسخة الاحتياطية (مشترك بين التصدير واختبار الدورة الكاملة)
// onProgress(msg) اختيارية لعرض التقدّم.
// ══════════════════════════════════════════════════════════════
const BACKUP_VERSION = 4;

async function buildBackupObject(user, onProgress) {
  const backup = {
    version:     BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    _meta: {
      app: 'tharwa',
      tables: TABLES.slice(),
      source_user_id: user.id,
      fingerprint: {},
      unavailable: {},
    },
  };

  for (const table of TABLES) {
    if (onProgress) onProgress(`جارٍ قراءة: ${table}…`);
    const { rows, unavailable, reason } = await fetchOwnedRows(table, user.id);
    backup[table] = rows;
    backup._meta.fingerprint[table] = fingerprintRows(rows);
    if (unavailable) backup._meta.unavailable[table] = reason;
  }

  // ── مسح حرفي شامل لكل مفاتيح localStorage (ضمان 100%) ──
  // يلتقط أي مفتاح يخص هذا المستخدم/التطبيق حتى لو لم يُسجَّل في LS_KEYS مطلقاً،
  // فلا يمكن لأي إعداد/ثيم/عتبة/تفصيل جديد أن يضيع بصمت.
  backup._local_all = {};
  const userScopePrefix = `u:${user.id}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (isExcludedLsKey(k)) continue;
    if (k.startsWith('u:') && !k.startsWith(userScopePrefix)) continue; // بيانات مستخدم آخر على نفس الجهاز
    backup._local_all[k] = localStorage.getItem(k);
  }

  // نسخة «منطقية» للتوافق مع مستعيدي الإصدارات الأقدم (v2/v3) — القيمة الفعّالة لكل مفتاح
  backup._local_settings = {};
  LS_KEYS.forEach(k => {
    const v = localStorage.getItem(userLsKey(k)) ?? localStorage.getItem(k);
    if (v !== null) backup._local_settings[k] = v;
  });

  backup._meta.local_keys        = Object.keys(backup._local_all).length;
  backup._meta.local_fingerprint = fingerprintMap(backup._local_all);
  return backup;
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
    const { data: { user: exportUser } } = await supabaseClient.auth.getUser();
    if (!exportUser) throw new Error('انتهت جلستك — أعد تسجيل الدخول ثم أعد المحاولة');

    const backup = await buildBackupObject(exportUser,
      msg => setStatus('export-status', 'info', msg));

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
    // L-4: defer revoke so browser finishes consuming the blob URL
    setTimeout(() => URL.revokeObjectURL(url), 100);

    const totalRows = TABLES.reduce((s, t) => s + (backup[t]?.length || 0), 0);
    const sizeKB    = (blob.size / 1024).toFixed(1);
    const lsCount   = backup._meta.local_keys;
    const unavail   = Object.keys(backup._meta.unavailable || {});

    // تقرير مفصّل — لا نجاح صامت
    const rowsHtml = TABLES.map(t => {
      const fp   = backup._meta.fingerprint[t] || { rows: 0, checksum: '—' };
      const bad  = backup._meta.unavailable[t];
      const st   = bad ? 'bad' : (fp.rows ? 'good' : 'warn');
      const note = bad ? `تعذّرت القراءة: ${bad}` : (fp.rows ? 'مقروء بالكامل' : 'فارغ');
      return `<tr><td>${esc(t)}</td><td>${esc(TABLE_LABEL[t] || '')}</td>` +
             `<td style="text-align:center">${esc(fp.rows)}</td>` +
             `<td class="small text-muted" style="text-align:center">${esc(fp.checksum)}</td>` +
             `<td><span class="tag" data-state="${st}">${esc(note)}</span></td></tr>`;
    }).join('');

    setReport('backup-report',
      noteHtml(unavail.length ? 'warn' : 'good',
        `تم تصدير <b>${esc(totalRows)}</b> صف من <b>${esc(TABLES.length)}</b> جدول ` +
        `+ <b>${esc(lsCount)}</b> مفتاح تفضيلات محلية · حجم الملف ${esc(sizeKB)} KB · ` +
        `بصمة الإعدادات المحلية <code>${esc(backup._meta.local_fingerprint.checksum)}</code>` +
        (unavail.length
          ? `<br>⚠️ تعذّرت قراءة: ${esc(unavail.join('، '))} — راجع سياسات RLS (تفاصيل بالجدول).`
          : '')) +
      tableHtml(['الجدول', 'المحتوى', 'صفوف', 'بصمة', 'الحالة'], rowsHtml));

    setStatus('export-status', 'success',
      `✓ تم التصدير — ${totalRows} سجل في ${TABLES.length} جدول + ${lsCount} مفتاح إعدادات محلي | ${sizeKB} KB`);
    showToast(`✓ تم تصدير ${totalRows} سجل — ${sizeKB} KB`, 'success');

  } catch (err) {
    setStatus('export-status', 'error', '✗ ' + err.message);
    showToast('فشل التصدير: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 تصدير النسخة الاحتياطية';
  }
}

// ══════════════════════════════════════════════════════════════
// Dry Run السطحي — فحص بنيوي سريع يُستدعى قبل أي حذف
// يعيد مصفوفة رسائل الخطأ (فارغة = الملف سليم بنيوياً)
// ══════════════════════════════════════════════════════════════
function dryRunRestore(backup) {
  const errors = [];
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    errors.push('الملف فارغ أو تالف أو ليس كائن JSON');
    return errors;
  }
  if (!backup.version) errors.push('حقل version مفقود — الملف ليس نسخة ثروة');
  const tablesFound = TABLES.filter(t => t in backup && Array.isArray(backup[t]));
  if (tablesFound.length < 3) errors.push(`عدد الجداول الموجودة (${tablesFound.length}) أقل من الحد الأدنى (3)`);
  const h = backup.holdings;
  if (h?.length) {
    const sample = h[0];
    if (!('ticker' in sample) || !('shares' in sample)) errors.push('جدول holdings يفتقر لحقول أساسية (ticker, shares)');
  }
  const tx = backup.transactions;
  if (tx?.length) {
    const sample = tx[0];
    if (!('type' in sample) || !('total' in sample)) errors.push('جدول transactions يفتقر لحقول أساسية (type, total)');
  }
  return errors;
}

// ══════════════════════════════════════════════════════════════
// تدقيق عميق لملف النسخة — بلا أي كتابة دائمة
// يفحص: البصمات · الجداول المعروفة/المجهولة · المفاتيح الأجنبية ·
// مفاتيح localStorage · وتوافق الأعمدة مع المخطط الحالي.
// probe=true يُدرج صفاً واحداً فعلياً ثم يحذفه فوراً (فحص المخطط الحقيقي).
// ══════════════════════════════════════════════════════════════
async function auditBackup(backup, user, { probe = true, onProgress } = {}) {
  const rep = { fatal: [], warn: [], ok: [], tables: [], local: null };

  // ① بنية عامة
  const structural = dryRunRestore(backup);
  structural.forEach(e => rep.fatal.push(e));
  if (rep.fatal.length) return rep;

  if (backup.version > BACKUP_VERSION) {
    rep.warn.push(`إصدار الملف (${backup.version}) أحدث من إصدار الصفحة (${BACKUP_VERSION}) — قد تُوجد بيانات لا تعرفها هذه النسخة`);
  } else if (backup.version < BACKUP_VERSION) {
    rep.ok.push(`ملف بمخطط أقدم (v${backup.version}) — سيُستعاد ما يفهمه، وستُذكر الجداول الناقصة أدناه`);
  }

  // ② جداول مجهولة في الملف (مخطط أحدث من الصفحة) — تُعلَن ولا تُبتلع
  const known = new Set(TABLES);
  const unknown = Object.keys(backup).filter(k =>
    !k.startsWith('_') && k !== 'version' && k !== 'exported_at' && Array.isArray(backup[k]) && !known.has(k));
  if (unknown.length) rep.warn.push(`جداول في الملف لا تعرفها هذه الصفحة ولن تُستعاد: ${unknown.join('، ')}`);

  const fpMeta = backup._meta?.fingerprint || {};

  // ③ فحص كل جدول
  for (const table of TABLES) {
    if (onProgress) onProgress(`فحص ${table}…`);
    const raw = backup[table];
    const entry = {
      table, label: TABLE_LABEL[table] || '',
      present: Array.isArray(raw),
      rows: Array.isArray(raw) ? raw.length : 0,
      fpExpected: fpMeta[table]?.checksum || null,
      fpActual: null, fpMatch: null,
      schema: 'لم يُفحص', schemaState: 'warn',
      issues: [],
    };

    if (!entry.present) {
      entry.issues.push('غير موجود في الملف — سيبقى فارغاً بعد الاستعادة');
      entry.schemaState = 'warn';
      rep.tables.push(entry);
      continue;
    }

    // بصمة التكامل
    const actual = fingerprintRows(raw);
    entry.fpActual = actual.checksum;
    if (entry.fpExpected) {
      entry.fpMatch = (actual.checksum === entry.fpExpected && actual.rows === (fpMeta[table]?.rows ?? -1));
      if (!entry.fpMatch) {
        entry.issues.push(`البصمة لا تطابق (متوقّع ${fpMeta[table]?.rows} صف/${entry.fpExpected} — فعلي ${actual.rows}/${actual.checksum}) — الملف عُدِّل أو تلف`);
        rep.fatal.push(`تلف في بيانات ${table}: بصمة التكامل لا تطابق`);
      }
    } else {
      entry.issues.push('لا توجد بصمة في الملف (نسخة قديمة) — تعذّر إثبات سلامة المحتوى');
    }

    if (!raw.length) { entry.schema = 'فارغ — لا شيء يُدرج'; entry.schemaState = 'good'; rep.tables.push(entry); continue; }

    // ④ مقارنة الأعمدة بصف حيّ من نفس الجدول (قراءة فقط، بلا كتابة)
    try {
      const { data: liveSample, error: liveErr } = await supabaseClient
        .from(table).select('*').eq(ownerColOf(table), user.id).limit(1);
      if (!liveErr && liveSample?.length) {
        const liveCols = new Set(Object.keys(liveSample[0]));
        const fileCols = new Set(Object.keys(raw[0]));
        const extra   = [...fileCols].filter(c => !liveCols.has(c));
        const missing = [...liveCols].filter(c => !fileCols.has(c));
        if (extra.length)   entry.issues.push(`أعمدة في الملف غير موجودة بالمخطط الحالي: ${extra.join('، ')}`);
        if (missing.length) entry.issues.push(`أعمدة بالمخطط الحالي غائبة عن الملف (ستأخذ القيمة الافتراضية): ${missing.join('، ')}`);
      }
    } catch { /* المقارنة تكميلية — الفحص الحقيقي هو الإدراج التجريبي */ }

    // ⑤ إدراج تجريبي فعلي ثم حذف فوري — الإثبات القاطع لتوافق المخطط
    // يُتخطّى للجداول الاختيارية: قد تمنع RLS حذف الصف التجريبي فيبقى صفاً
    // زائداً في بيانات المالك — الفحص لا يجوز أن يترك أثراً.
    if (!probe || UPSERT_TABLES.has(table) || OPTIONAL_TABLES.has(table)) {
      entry.schema = UPSERT_TABLES.has(table)
        ? 'يُستعاد بالدمج (upsert) — لا فحص إدراج تجريبي'
        : (OPTIONAL_TABLES.has(table)
            ? 'جدول اختياري — فُحصت الأعمدة بالقراءة فقط (لا إدراج تجريبي)'
            : 'الفحص التجريبي معطّل');
      entry.schemaState = 'warn';
    } else {
      const probeRow = mapRow(table, raw[0], user.id);
      if (!probeRow) {
        entry.schema = 'الصف الأول غير صالح (سيُتخطى)'; entry.schemaState = 'warn';
      } else {
        delete probeRow.id;   // id يُولَّد تلقائياً حتى لا يصطدم بصف قائم
        const { data: ins, error: perr } = await supabaseClient.from(table).insert(probeRow).select();
        if (perr) {
          if (perr.code === '23505' || perr.code === '23503') {
            entry.schema = 'متوافق (تعارض قيود فقط — المخطط سليم)'; entry.schemaState = 'good';
          } else if (perr.code === '42P01') {
            entry.schema = 'الجدول غير موجود في القاعدة'; entry.schemaState = 'warn';
            entry.issues.push('لن يُستعاد — الجدول مفقود من قاعدة البيانات');
          } else if (OPTIONAL_TABLES.has(table)) {
            entry.schema = 'تعذّر الفحص (RLS)'; entry.schemaState = 'warn';
            entry.issues.push(`سياسة RLS تمنع الإدراج: ${perr.message}`);
          } else {
            entry.schema = 'غير متوافق'; entry.schemaState = 'bad';
            entry.issues.push(`الإدراج يفشل: ${perr.message}`);
            rep.fatal.push(`النسخة غير متوافقة مع جدول ${table}: ${perr.message}`);
          }
        } else {
          entry.schema = 'متوافق ✓'; entry.schemaState = 'good';
          const row = ins?.[0];
          let cleaned = false;
          if (row?.id != null) {
            const { error: delErr } = await supabaseClient.from(table).delete().eq('id', row.id);
            cleaned = !delErr;
          } else if (table === 'user_settings' && probeRow.key) {
            const { error: delErr } = await supabaseClient.from(table)
              .delete().eq('user_id', user.id).eq('key', probeRow.key);
            cleaned = !delErr;
          }
          if (!cleaned) {
            entry.issues.push('⚠️ تعذّر حذف الصف التجريبي — قد يبقى صف زائد واحد في هذا الجدول');
            rep.warn.push(`صف تجريبي لم يُحذف من ${table} — احذفه يدوياً`);
          }
        }
      }
    }
    rep.tables.push(entry);
  }

  // ⑥ سلامة المفاتيح الأجنبية: كل مرفق يجب أن يشير لقيد موجود في النسخة
  const atts = backup.review_log_attachments;
  const logs = backup.review_log;
  if (Array.isArray(atts) && atts.length) {
    const ids = new Set((Array.isArray(logs) ? logs : []).map(r => r.id));
    const orphans = atts.filter(a => a.entry_id != null && !ids.has(a.entry_id)).length;
    if (orphans) rep.fatal.push(`${orphans} مرفق في دفتر المراجعة يشير لقيد غير موجود في النسخة — الإدراج سيفشل بخطأ FK`);
    else rep.ok.push('المفاتيح الأجنبية لمرفقات دفتر المراجعة سليمة 100%');
  }

  // ⑦ مفاتيح localStorage
  const all = backup._local_all && typeof backup._local_all === 'object' ? backup._local_all : null;
  if (all) {
    const fpL   = backup._meta?.local_fingerprint;
    const act   = fingerprintMap(all);
    const keys  = Object.keys(all);
    const toks  = keys.filter(k => k.startsWith('sb-'));
    const scoped= keys.filter(k => /^u:[^:]+:/.test(k));
    rep.local = {
      keys: keys.length, raw: keys.length - scoped.length, scoped: scoped.length,
      fpExpected: fpL?.checksum || null, fpActual: act.checksum,
      fpMatch: fpL ? (fpL.checksum === act.checksum && fpL.keys === act.keys) : null,
      tokens: toks.length,
      names: keys.slice().sort(),
    };
    if (rep.local.fpMatch === false) rep.fatal.push('بصمة الإعدادات المحلية لا تطابق — الملف عُدِّل أو تلف');
    if (toks.length) rep.warn.push(`الملف يحوي ${toks.length} توكن جلسة (sb-*) — لن يُستعاد إطلاقاً (أمان)`);
    const missingLogical = LS_KEYS.filter(k => !(k in all) && !(`u:${backup._meta?.source_user_id}:${k}` in all));
    if (missingLogical.length) rep.ok.push(`مفاتيح منطقية غير موجودة على جهاز التصدير (طبيعي): ${missingLogical.join('، ')}`);
  } else if (backup._local_settings) {
    rep.warn.push('الملف بصيغة قديمة: يحوي القائمة المنطقية فقط (_local_settings) بلا المسح الحرفي الشامل');
    rep.local = { keys: Object.keys(backup._local_settings).length, raw: 0, scoped: 0, legacy: true, names: Object.keys(backup._local_settings).sort() };
  } else {
    rep.warn.push('الملف لا يحوي أي تفضيلات محلية — الثيم والعتبات وحجم الخط لن تُستعاد');
  }

  return rep;
}

// ══════════════════════════════════════════════════════════════
// زر «فحص الاستعادة (تجربة جافة)» — يقرأ الملف ويتحقق من كل شيء
// بلا حذف أي بيانات. الإدراج التجريبي الوحيد يُحذف فوراً.
// ══════════════════════════════════════════════════════════════
function triggerVerify() {
  const el = document.getElementById('verify-file');
  el.value = '';
  el.click();
}

async function verifyBackupFile(input) {
  if (!input.files?.length) return;
  const file = input.files[0];
  const btn  = document.getElementById('btn-verify');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الفحص…'; }
  setStatus('verify-status', 'info', 'يتم قراءة الملف…');
  setReport('verify-report', '');

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('انتهت جلستك — أعد تسجيل الدخول ثم أعد المحاولة');

    let backup;
    try { backup = JSON.parse(await file.text()); }
    catch (e) { throw new Error('الملف ليس JSON صالحاً — تالف أو غير مكتمل: ' + e.message); }

    const rep = await auditBackup(backup, user,
      { probe: true, onProgress: m => setStatus('verify-status', 'info', m) });

    renderAuditReport(rep, backup, file);

    if (rep.fatal.length) {
      setStatus('verify-status', 'error', `✗ الملف غير صالح للاستعادة — ${rep.fatal.length} مشكلة قاطعة (التفاصيل أدناه)`);
      showToast('الفحص انتهى — الملف لا يصلح للاستعادة', 'error');
    } else if (rep.warn.length) {
      setStatus('verify-status', 'info', `⚠️ الملف صالح للاستعادة مع ${rep.warn.length} ملاحظة — راجع التقرير أدناه`);
      showToast('الفحص انتهى — صالح مع ملاحظات', 'info');
    } else {
      setStatus('verify-status', 'success', '✓ الملف سليم 100% وصالح للاستعادة — لم تُكتب أي بيانات');
      showToast('✓ الملف سليم وقابل للاستعادة', 'success');
    }
  } catch (err) {
    setStatus('verify-status', 'error', '✗ ' + err.message);
    showToast('فشل الفحص: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 فحص الاستعادة (تجربة جافة)'; }
  }
}

// يبني تقرير التدقيق ويعرضه في العنصر المطلوب، ويعيد نصّه HTML
// حتى يستطيع مسار الاستعادة إبقاءه أعلى تقرير ما بعد الاستعادة.
function renderAuditReport(rep, backup, file, targetId = 'verify-report') {
  const when = backup.exported_at ? new Date(backup.exported_at).toLocaleString('ar-SA') : 'غير محدد';
  const totalRows = rep.tables.reduce((s, t) => s + t.rows, 0);

  let html = '';
  html += noteHtml(rep.fatal.length ? 'bad' : (rep.warn.length ? 'warn' : 'good'),
    `<b>ملف:</b> ${esc(file?.name || '—')} · <b>الإصدار:</b> ${esc(backup.version)} · ` +
    `<b>تاريخ التصدير:</b> ${esc(when)} · <b>الحجم:</b> ${esc(((file?.size || 0) / 1024).toFixed(1))} KB<br>` +
    `<b>سيُستعاد:</b> ${esc(totalRows)} صف في ${esc(rep.tables.filter(t => t.rows).length)} جدول` +
    (rep.local ? ` + ${esc(rep.local.keys)} مفتاح تفضيلات محلية` : ' + لا تفضيلات محلية') +
    `<br><b>لم تُحذف ولم تُكتب أي بيانات في هذا الفحص.</b>`);

  if (rep.fatal.length) {
    html += noteHtml('bad', '<b>مشاكل قاطعة تمنع الاستعادة:</b><ul style="margin:6px 0 0;padding-inline-start:18px">' +
      rep.fatal.map(e => `<li>${esc(e)}</li>`).join('') + '</ul>');
  }
  if (rep.warn.length) {
    html += noteHtml('warn', '<b>ملاحظات (لا تمنع الاستعادة):</b><ul style="margin:6px 0 0;padding-inline-start:18px">' +
      rep.warn.map(e => `<li>${esc(e)}</li>`).join('') + '</ul>');
  }
  if (rep.ok.length) {
    html += noteHtml('good', '<ul style="margin:0;padding-inline-start:18px">' +
      rep.ok.map(e => `<li>${esc(e)}</li>`).join('') + '</ul>');
  }

  const rows = rep.tables.map(t => {
    const fpTag = t.fpMatch === true ? '<span class="tag" data-state="good">مطابقة</span>'
               : t.fpMatch === false ? '<span class="tag" data-state="bad">تالفة</span>'
               : '<span class="tag" data-state="warn">بلا بصمة</span>';
    return `<tr><td>${esc(t.table)}</td><td class="small text-muted">${esc(t.label)}</td>` +
      `<td style="text-align:center">${esc(t.rows)}</td>` +
      `<td style="text-align:center">${fpTag}</td>` +
      `<td><span class="tag" data-state="${esc(t.schemaState)}">${esc(t.schema)}</span></td>` +
      `<td class="small">${t.issues.length ? t.issues.map(i => esc(i)).join('<br>') : '—'}</td></tr>`;
  }).join('');
  html += tableHtml(['الجدول', 'المحتوى', 'صفوف', 'التكامل', 'توافق المخطط', 'ملاحظات'], rows);

  if (rep.local) {
    const fpTag = rep.local.fpMatch === true ? '<span class="tag" data-state="good">مطابقة</span>'
                : rep.local.fpMatch === false ? '<span class="tag" data-state="bad">تالفة</span>'
                : '<span class="tag" data-state="warn">بلا بصمة</span>';
    html += `<div class="kvs" style="margin-top:12px">` +
      `<div class="kv"><span>مفاتيح محلية</span><b>${esc(rep.local.keys)}</b></div>` +
      `<div class="kv"><span>خام</span><b>${esc(rep.local.raw)}</b></div>` +
      `<div class="kv"><span>مؤطَّرة بالمستخدم</span><b>${esc(rep.local.scoped)}</b></div>` +
      `<div class="kv"><span>بصمة التفضيلات</span><b>${fpTag}</b></div>` +
      `</div>`;
    html += `<details style="margin-top:8px"><summary class="small text-muted" style="cursor:pointer">عرض أسماء المفاتيح المحلية (${esc(rep.local.names.length)})</summary>` +
      `<div class="small text-muted" style="margin-top:6px;line-height:1.9;word-break:break-all">` +
      rep.local.names.map(n => `<code>${esc(n)}</code>`).join(' · ') + `</div></details>`;
  }
  setReport(targetId, html);
  return html;
}

// ══════════════════════════════════════════════════════════════
// زر «اختبار دورة كاملة» — تصدير في الذاكرة ثم مقارنة حقلاً بحقل
// مع ما في قاعدة البيانات. قراءة ومقارنة فقط — بلا أي كتابة.
// يثبت: (١) لا عمود يسقط عبر JSON  (٢) لا عمود يسقط عبر mapRow
// (٣) تفضيلات localStorage ترجع حرفياً  (٤) البصمات تُعاد إنتاجها.
// ══════════════════════════════════════════════════════════════
async function runRoundTripTest() {
  const btn = document.getElementById('btn-roundtrip');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الاختبار…'; }
  setStatus('roundtrip-status', 'info', 'يتم بناء نسخة في الذاكرة…');
  setReport('roundtrip-report', '');

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('انتهت جلستك — أعد تسجيل الدخول ثم أعد المحاولة');

    // ① بناء النسخة (نفس مسار التصدير بالضبط)
    const live = await buildBackupObject(user, m => setStatus('roundtrip-status', 'info', m));

    // ② محاكاة الكتابة للملف ثم القراءة منه
    setStatus('roundtrip-status', 'info', 'محاكاة الكتابة للملف والقراءة منه…');
    const json  = JSON.stringify(live, null, 2);
    const after = JSON.parse(json);

    // ③ مقارنة حقلاً بحقل
    const results = [];
    let totalFields = 0, totalDiffs = 0;
    const diffs = [];

    for (const table of TABLES) {
      setStatus('roundtrip-status', 'info', `مقارنة ${table}…`);
      const a = live[table]  || [];
      const b = after[table] || [];
      let fields = 0, bad = 0, dropped = 0;

      if (a.length !== b.length) {
        diffs.push(`${table}: عدد الصفوف تغيّر (${a.length} → ${b.length})`);
        bad++;
      }
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const cols = new Set([...Object.keys(a[i]), ...Object.keys(b[i])]);
        for (const c of cols) {
          fields++;
          if (stableStringify(a[i][c]) !== stableStringify(b[i][c])) {
            bad++;
            if (diffs.length < 40) diffs.push(`${table}[${i}].${c}: «${stableStringify(a[i][c])}» ← «${stableStringify(b[i][c])}»`);
          }
        }
        // مسار الاستعادة الفعلي: mapRow — يجب ألا يُسقط أي عمود عدا id المولَّد
        const mapped = mapRow(table, b[i], user.id);
        if (mapped) {
          for (const c of Object.keys(a[i])) {
            if (c === 'id' && !(mapped && 'id' in mapped)) continue;   // id تُولَّد تلقائياً — إسقاطها مقصود
            if (!(c in mapped)) {
              dropped++;
              if (diffs.length < 40) diffs.push(`${table}[${i}].${c}: mapRow أسقط العمود`);
            } else if (c !== ownerColOf(table) && stableStringify(a[i][c]) !== stableStringify(mapped[c])) {
              dropped++;
              if (diffs.length < 40) diffs.push(`${table}[${i}].${c}: mapRow غيّر القيمة`);
            }
          }
        } else if (!(table === 'user_settings' && !b[i].key)) {
          dropped++;
          if (diffs.length < 40) diffs.push(`${table}[${i}]: mapRow رفض الصف بالكامل`);
        }
      }
      // البصمة تُعاد إنتاجها بعد رحلة JSON؟
      const fpOk = fingerprintRows(b).checksum === (live._meta.fingerprint[table]?.checksum);
      if (!fpOk) diffs.push(`${table}: البصمة لا تُعاد إنتاجها بعد رحلة JSON`);

      totalFields += fields; totalDiffs += bad + dropped;
      results.push({ table, rows: a.length, fields, bad, dropped, fpOk });
    }

    // ④ تفضيلات localStorage
    const lsA = live._local_all, lsB = after._local_all;
    const lsKeys = new Set([...Object.keys(lsA), ...Object.keys(lsB)]);
    let lsBad = 0;
    for (const k of lsKeys) {
      totalFields++;
      if (lsA[k] !== lsB[k]) { lsBad++; totalDiffs++; if (diffs.length < 40) diffs.push(`localStorage["${k}"] لم يطابق`); }
    }
    // القيم الحيّة في المتصفح الآن مقابل ما في النسخة (يثبت أن التصدير التقط الحالة الفعلية)
    let lsLiveBad = 0;
    for (const k of Object.keys(lsA)) {
      if (localStorage.getItem(k) !== lsA[k]) { lsLiveBad++; if (diffs.length < 40) diffs.push(`localStorage["${k}"]: قيمة المتصفح تغيّرت أثناء الاختبار`); }
    }

    // ⑤ التقرير
    const totalRows = results.reduce((s, r) => s + r.rows, 0);
    const state = totalDiffs === 0 ? 'good' : 'bad';
    let html = noteHtml(state,
      totalDiffs === 0
        ? `<b>تطابق 100%.</b> قُورن ${esc(totalFields)} حقلاً في ${esc(totalRows)} صف عبر ${esc(TABLES.length)} جدول ` +
          `+ ${esc(lsKeys.size)} مفتاح تفضيلات محلية — <b>صفر اختلاف</b>.<br>` +
          `كل حقل نجا من رحلة (قاعدة البيانات ← JSON ← ملف ← JSON ← mapRow) بلا فقد ولا تغيير. لم تُكتب أي بيانات.`
        : `<b>وُجد ${esc(totalDiffs)} اختلاف</b> من أصل ${esc(totalFields)} حقل — التفاصيل أدناه. لم تُكتب أي بيانات.`);

    if (lsLiveBad) html += noteHtml('warn', `${esc(lsLiveBad)} مفتاح محلي تغيّرت قيمته في المتصفح أثناء الاختبار (تبويب آخر مفتوح؟)`);

    const rows = results.map(r => {
      const st = (r.bad + r.dropped) === 0 && r.fpOk ? 'good' : 'bad';
      const msg = (r.bad + r.dropped) === 0 && r.fpOk ? 'مطابق 100%' : `${r.bad + r.dropped} اختلاف`;
      return `<tr><td>${esc(r.table)}</td><td style="text-align:center">${esc(r.rows)}</td>` +
             `<td style="text-align:center">${esc(r.fields)}</td>` +
             `<td><span class="tag" data-state="${st}">${esc(msg)}</span></td></tr>`;
    }).join('') +
    `<tr><td>localStorage</td><td style="text-align:center">${esc(lsKeys.size)}</td>` +
    `<td style="text-align:center">${esc(lsKeys.size)}</td>` +
    `<td><span class="tag" data-state="${lsBad ? 'bad' : 'good'}">${esc(lsBad ? lsBad + ' اختلاف' : 'مطابق 100%')}</span></td></tr>`;
    html += tableHtml(['المصدر', 'صفوف', 'حقول مقارَنة', 'النتيجة'], rows);

    if (diffs.length) {
      html += noteHtml('bad', '<b>الاختلافات:</b><ul style="margin:6px 0 0;padding-inline-start:18px">' +
        diffs.map(d => `<li>${esc(d)}</li>`).join('') + '</ul>');
    }
    setReport('roundtrip-report', html);

    setStatus('roundtrip-status', totalDiffs === 0 ? 'success' : 'error',
      totalDiffs === 0
        ? `✓ تطابق 100% — ${totalFields} حقل، صفر اختلاف (بلا أي كتابة)`
        : `✗ ${totalDiffs} اختلاف من أصل ${totalFields} حقل — راجع التقرير`);
    showToast(totalDiffs === 0 ? '✓ الدورة الكاملة مطابقة 100%' : `✗ ${totalDiffs} اختلاف`,
      totalDiffs === 0 ? 'success' : 'error');

  } catch (err) {
    setStatus('roundtrip-status', 'error', '✗ ' + err.message);
    showToast('فشل الاختبار: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔁 اختبار دورة كاملة'; }
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

  setReport('restore-report', '');

  // ── قراءة الملف ───────────────────────────────────────────
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (e) {
    showToast('الملف غير صالح — يجب أن يكون JSON', 'error');
    setStatus('restore-status', 'error', '✗ الملف غير صالح كـ JSON: ' + e.message);
    return;
  }

  const btn = document.getElementById('btn-restore');
  btn.disabled = true;
  btn.textContent = 'جارٍ الفحص…';

  // مُعرَّف قبل try حتى يبقى مقروءاً في catch عند أي فشل
  let emergencySaved = false;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('انتهت جلستك — أعد تسجيل الدخول ثم أعد المحاولة');

    // ── 0. التدقيق الكامل قبل أي حذف ────────────────────────
    // يشمل: البنية، البصمات، توافق الأعمدة، المفاتيح الأجنبية،
    // والإدراج التجريبي الفعلي لكل جدول (يُحذف فوراً).
    setStatus('restore-status', 'info', 'يتم فحص الملف بالكامل قبل حذف أي شيء…');
    const audit = await auditBackup(backup, user,
      { probe: true, onProgress: m => setStatus('restore-status', 'info', m) });
    const auditHtml = renderAuditReport(audit, backup, file, 'restore-report');

    if (audit.fatal.length) {
      setStatus('restore-status', 'error',
        '✗ أُوقفت الاستعادة قبل حذف أي بيانات — ' + audit.fatal.join(' | '));
      showToast('الملف لا يصلح للاستعادة — بياناتك لم تُمسّ', 'error');
      return;
    }

    // ── ملخص ما سيتم استعادته + تأكيد المالك ─────────────────
    const rowCounts  = audit.tables.filter(t => t.rows).map(t => `${t.table}: ${t.rows}`);
    const totalRows  = audit.tables.reduce((s, t) => s + t.rows, 0);
    const exportedAt = backup.exported_at
      ? new Date(backup.exported_at).toLocaleString('ar-SA') : 'غير محدد';
    const lsCount    = audit.local?.keys || 0;

    const confirmed = await confirmAsync(
      `استعادة النسخة الاحتياطية\n\n` +
      `• الإصدار: ${backup.version}\n` +
      `• تاريخ التصدير: ${exportedAt}\n` +
      `• إجمالي السجلات: ${totalRows}\n` +
      `• تفضيلات محلية: ${lsCount} مفتاح\n` +
      `• الفحص الكامل: نجح${audit.warn.length ? ` (${audit.warn.length} ملاحظة — راجع التقرير)` : ''}\n\n` +
      `تفاصيل:\n${rowCounts.join('\n')}\n\n` +
      `⚠️ تحذير: سيتم حذف جميع بياناتك الحالية واستبدالها.\n\n` +
      `هل أنت متأكد من الاستعادة؟`
    );
    if (!confirmed) { setStatus('restore-status', 'info', 'تم الإلغاء — لم تُمسّ أي بيانات'); return; }

    btn.textContent = 'جارٍ الاستعادة…';

    // ── 1. نسخة طارئة من البيانات الحالية + التحقق من قابليتها للاستعادة ─
    // ملاحظة: review_log_attachments مستبعدة (محتوى ثنائي كبير يملأ localStorage)
    setStatus('restore-status', 'info', 'يتم حفظ نسخة طارئة احترازية…');
    const EMERGENCY_TABLES = TABLES.filter(t => t !== 'review_log_attachments');
    const emergencyBackup = {
      version: 'emergency', backed_up_at: new Date().toISOString(),
      _fingerprint: {},
    };
    for (const table of EMERGENCY_TABLES) {
      // النسخة الطارئة احترازية فلا نوقف الاستعادة عند فشل جدول واحد
      try {
        const { rows } = await fetchOwnedRows(table, user.id);
        emergencyBackup[table] = rows;
      } catch { emergencyBackup[table] = []; }
      emergencyBackup._fingerprint[table] = fingerprintRows(emergencyBackup[table]);
    }
    let emergencyVerify = 'لم تُحفظ';
    try {
      localStorage.setItem('tharwa_emergency_backup', JSON.stringify(emergencyBackup));
      // ── اختبار قابلية الاستعادة فعلياً: نقرأها ونتحقق من بصمة كل جدول ──
      const readBack = JSON.parse(localStorage.getItem('tharwa_emergency_backup'));
      const bad = EMERGENCY_TABLES.filter(t =>
        fingerprintRows(readBack[t]).checksum !== emergencyBackup._fingerprint[t].checksum);
      if (readBack.version !== 'emergency') throw new Error('النسخة المقروءة تالفة');
      if (bad.length) throw new Error('بصمات لا تطابق: ' + bad.join('، '));
      emergencySaved   = true;
      emergencyVerify  = 'محفوظة ومُختبَرة ✓';
    } catch (e) {
      localStorage.removeItem('tharwa_emergency_backup');
      const cont = await confirmAsync(
        `⚠️ تعذّر حفظ نسخة طارئة قابلة للاستعادة (${e.message}).\n\n` +
        `إن فشلت الاستعادة فلن تكون هناك شبكة أمان في هذا المتصفح.\n\n` +
        `هل تريد المتابعة رغم ذلك؟ (يُنصح بالإلغاء وتصدير نسخة أولاً)`
      );
      if (!cont) { setStatus('restore-status', 'info', 'تم الإلغاء — لم تُمسّ أي بيانات'); return; }
      emergencyVerify = `فشلت: ${e.message}`;
    }

    // ── 2. حذف كل البيانات الحالية (الأبناء أولاً) ───────────
    setStatus('restore-status', 'info', 'يتم حذف البيانات الحالية…');
    const deleteNotes = {};
    for (const table of deleteOrder(TABLES)) {
      const { error } = await supabaseClient.from(table).delete().eq(ownerColOf(table), user.id);
      if (error && error.code !== '42P01') {
        if (OPTIONAL_TABLES.has(table)) { deleteNotes[table] = `تعذّر الحذف (RLS): ${error.message}`; continue; }
        throw new Error(`خطأ في حذف ${table}: ${error.message}`);
      }
      // تحقّق فعلي: هل حُذفت الصفوف حقاً؟ RLS قد تمنع الحذف بلا خطأ
      const left = await countOwnedRows(table, user.id);
      if (left != null && left > 0) deleteNotes[table] = `بقي ${left} صف لم يُحذف (سياسة RLS) — قد تتكرر البيانات`;
    }

    // ── 3. إدراج البيانات من النسخة ──────────────────────────
    setStatus('restore-status', 'info', 'يتم إدراج البيانات المستعادة…');
    const results = [];
    let inserted = 0, failed = 0;

    for (const table of TABLES) {
      const rows = backup[table];
      const entry = { table, expected: Array.isArray(rows) ? rows.length : 0, inserted: 0, failed: 0, errors: [], note: deleteNotes[table] || '' };
      if (!Array.isArray(rows) || !rows.length) { results.push(entry); continue; }

      const clean = rows.map(row => mapRow(table, row, user.id)).filter(Boolean);
      entry.failed += rows.length - clean.length;
      if (rows.length !== clean.length) entry.errors.push(`${rows.length - clean.length} صف مرفوض من mapRow (صف غير صالح أو بلا مفتاح)`);
      if (!clean.length) { results.push(entry); failed += entry.failed; continue; }

      const batchSize = BATCH_SIZES[table] || DEFAULT_BATCH;
      for (let i = 0; i < clean.length; i += batchSize) {
        const batch = clean.slice(i, i + batchSize);
        setStatus('restore-status', 'info',
          `يتم إدراج ${table}… (${Math.min(i + batchSize, clean.length)}/${clean.length})`);
        const q = UPSERT_TABLES.has(table)
          ? supabaseClient.from(table).upsert(batch, { onConflict: ownerColOf(table) })
          : supabaseClient.from(table).insert(batch);
        const { error } = await q;
        if (error) {
          // جدول اختياري أو دفعة واحدة تفشل: نُسجّل ونكمل بدل إسقاط كل شيء —
          // الجداول الأساسية تُوقف العملية كما كان (لا مساس بسلامة المحفظة).
          if (OPTIONAL_TABLES.has(table) || error.code === '42P01') {
            entry.failed += batch.length;
            entry.errors.push(error.message);
            continue;
          }
          throw new Error(`خطأ في إدراج ${table}: ${error.message}`);
        }
        entry.inserted += batch.length;
      }
      inserted += entry.inserted;
      failed   += entry.failed;
      // تحقّق نهائي بالعدّ الفعلي في القاعدة
      entry.actual = await countOwnedRows(table, user.id);
      results.push(entry);
    }

    // ── 4. استعادة تفضيلات localStorage ─────────────────────
    const lsReport = restoreLocalStorage(backup, user.id);

    // ── 5. تقرير ما بعد الاستعادة — لا «تمت الاستعادة ✓» صامتة ─
    const mismatched = results.filter(r =>
      r.failed > 0 || (r.actual != null && r.expected > 0 && r.actual !== r.expected) || r.note);
    const allGood = mismatched.length === 0 && lsReport.failed === 0;

    let html = noteHtml('good', '<b>— نتيجة الاستعادة —</b>') + noteHtml(allGood ? 'good' : 'warn',
      `<b>${allGood ? 'اكتملت الاستعادة بمطابقة كاملة.' : 'اكتملت الاستعادة مع فروقات — اقرأ الجدول.'}</b><br>` +
      `أُدرج <b>${esc(inserted)}</b> صف من أصل <b>${esc(audit.tables.reduce((s, t) => s + t.rows, 0))}</b> · ` +
      `فشل <b>${esc(failed)}</b> صف · تفضيلات محلية: <b>${esc(lsReport.written)}</b> مفتاح ` +
      `(فشل ${esc(lsReport.failed)}) · النسخة الطارئة: ${esc(emergencyVerify)}`);

    if (!allGood) {
      html += noteHtml('warn', 'الفروقات أدناه ليست بالضرورة فقداً — قد تكون صفوفاً رفضتها قيود القاعدة. راجع كل سطر وقرّر.');
    }

    html += tableHtml(['الجدول', 'في النسخة', 'أُدرج', 'فشل', 'العدد الفعلي الآن', 'السبب'],
      results.map(r => {
        const ok = r.failed === 0 && !r.note && (r.actual == null || r.actual === r.expected);
        return `<tr><td>${esc(r.table)}</td>` +
          `<td style="text-align:center">${esc(r.expected)}</td>` +
          `<td style="text-align:center">${esc(r.inserted)}</td>` +
          `<td style="text-align:center">${esc(r.failed)}</td>` +
          `<td style="text-align:center">${esc(r.actual == null ? '—' : r.actual)}</td>` +
          `<td class="small"><span class="tag" data-state="${ok ? 'good' : 'warn'}">${ok ? 'مطابق' : 'راجع'}</span> ` +
          `${esc([r.note, ...r.errors].filter(Boolean).join(' · ')) || ''}</td></tr>`;
      }).join(''));

    html += `<div class="kvs" style="margin-top:12px">` +
      `<div class="kv"><span>مفاتيح محلية خام أُعيدت</span><b>${esc(lsReport.raw)}</b></div>` +
      `<div class="kv"><span>مفاتيح أُعيد تأطيرها لهويتك</span><b>${esc(lsReport.rescoped)}</b></div>` +
      `<div class="kv"><span>توكنات جلسة مُستبعدة (أمان)</span><b>${esc(lsReport.skippedTokens)}</b></div>` +
      `<div class="kv"><span>فشل الكتابة</span><b>${esc(lsReport.failed)}</b></div>` +
      `</div>`;
    if (lsReport.errors.length) {
      html += noteHtml('warn', '<b>مفاتيح لم تُكتب:</b> ' + esc(lsReport.errors.join('، ')));
    }
    // تقرير التدقيق (ما قبل الحذف) يبقى فوق تقرير ما بعد الاستعادة — سجل كامل للعملية
    setReport('restore-report', auditHtml + html);

    setStatus('restore-status', allGood ? 'success' : 'info',
      (allGood ? '✓ تمت الاستعادة بمطابقة كاملة — ' : '⚠️ تمت الاستعادة مع فروقات — ') +
      `${inserted} سجل + ${lsReport.written} مفتاح تفضيلات. التقرير التفصيلي أدناه.`);
    showToast(allGood ? 'تمت الاستعادة بمطابقة كاملة ✓' : 'تمت الاستعادة — راجع تقرير الفروقات', allGood ? 'success' : 'info');

    setTimeout(async () => {
      if (await confirmAsync('تمت الاستعادة. هل تريد الانتقال إلى لوحة التحكم؟')) {
        window.location.href = 'dashboard.html';
      }
    }, 800);

  } catch (err) {
    const emergencyMsg = emergencySaved
      ? '⚠️ تم حفظ نسخة طارئة مُختبَرة في المتصفح — استعدها فوراً من قسم "استعادة النسخة الطارئة" أدناه، ولا تغلق هذا المتصفح ولا تمسح بياناته قبل ذلك.'
      : '⚠️ لا توجد نسخة طارئة في هذا المتصفح — إن كنت تملك ملف نسخة أحدث فاستعده الآن، وإلا فتحقق من بياناتك يدوياً قبل أي إجراء آخر.';
    setStatus('restore-status', 'error', '✗ ' + err.message + '\n\n' + emergencyMsg);
    setReport('restore-report', noteHtml('bad',
      `<b>فشلت الاستعادة:</b> ${esc(err.message)}<br>${esc(emergencyMsg)}`));
    showToast(emergencySaved ? 'فشلت الاستعادة — نسخة طارئة محفوظة' : 'فشلت الاستعادة — لا توجد نسخة طارئة', 'error');
    refreshEmergencySection();   // إظهار قسم الاستعادة الطارئة فوراً
  } finally {
    btn.disabled = false;
    btn.textContent = '📥 استعادة من نسخة احتياطية';
  }
}

// ══════════════════════════════════════════════════════════════
// استعادة تفضيلات localStorage — حرفية 100% مع إعادة تأطير الهوية
//
// قاعدة النسخ الحرفي: المفتاح الخام يعود خاماً، والمفتاح المؤطَّر
// «u:<uid قديم>:X» يعود «u:<uid حالي>:X». هذا يُعيد إنتاج حالة
// localStorage نفسها بالضبط حتى لو اختلف المعرّف بين التصدير والاستعادة.
//
// نمرّ على مرحلتين: الخام أولاً ثم المؤطَّر — فلو حمل الملف نسختين
// من المفتاح نفسه (خامة قديمة + مؤطَّرة حديثة) يفوز المؤطَّر، وهو
// بالضبط ما تقرؤه الصفحات (userLsKey أولاً ثم الخام).
// ══════════════════════════════════════════════════════════════
function restoreLocalStorage(backup, userId) {
  const rep = { written: 0, raw: 0, rescoped: 0, skippedTokens: 0, failed: 0, errors: [] };
  const put = (key, val) => {
    try { localStorage.setItem(key, val); rep.written++; return true; }
    catch (e) { rep.failed++; if (rep.errors.length < 12) rep.errors.push(key); return false; }
  };

  const all = (backup._local_all && typeof backup._local_all === 'object') ? backup._local_all : null;

  if (all) {
    const entries = Object.entries(all);
    // ① المفاتيح الخام — تُكتب كما هي حرفياً
    for (const [k, v] of entries) {
      if (k.startsWith('sb-')) { rep.skippedTokens++; continue; }   // حارس أمني مضاعف
      if (/^u:[^:]+:/.test(k)) continue;
      if (put(k, v)) rep.raw++;
    }
    // ② المفاتيح المؤطَّرة — يُعاد تأطيرها لهوية المستخدم الحالي صراحةً
    //    (لا نعتمد على userLsKey لأنه يقرأ متغيّراً عاماً قد لا يكون مضبوطاً)
    for (const [k, v] of entries) {
      const m = k.match(/^u:[^:]+:(.+)$/);
      if (!m) continue;
      if (put(`u:${userId}:${m[1]}`, v)) rep.rescoped++;
    }
    return rep;
  }

  // ── ملف قديم (v2/v3) بلا مسح حرفي: نستخدم القائمة المنطقية ──
  // القيمة هناك هي «القيمة الفعّالة» فنكتبها للمفتاح المؤطَّر والخام معاً
  // حتى تقرأها كل الوحدات مهما كان نمط قراءتها.
  if (backup._local_settings && typeof backup._local_settings === 'object') {
    for (const [k, v] of Object.entries(backup._local_settings)) {
      if (k.startsWith('sb-')) { rep.skippedTokens++; continue; }
      if (put(`u:${userId}:${k}`, v)) rep.rescoped++;
      if (put(k, v)) rep.raw++;
    }
  }
  return rep;
}

// ══════════════════════════════════════════════════════════════
// النسخة الطارئة — استعادة ما حُفظ في localStorage قبل استعادة فاشلة
// ══════════════════════════════════════════════════════════════
function getEmergencyBackup() {
  try {
    const raw = localStorage.getItem('tharwa_emergency_backup');
    if (!raw) return null;
    const b = JSON.parse(raw);
    return (b && b.version === 'emergency') ? b : null;
  } catch { return null; }
}

// يُظهر/يُخفي قسم النسخة الطارئة في settings.html حسب وجودها
function refreshEmergencySection() {
  const sec = document.getElementById('emergency-section');
  if (!sec) return;
  const b = getEmergencyBackup();
  if (!b) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  const el = document.getElementById('emergency-date');
  if (el) el.textContent = b.backed_up_at ? new Date(b.backed_up_at).toLocaleString('ar-SA') : 'غير معروف';
}

async function restoreEmergencyBackup() {
  const b = getEmergencyBackup();
  if (!b) {
    showToast('لا توجد نسخة طارئة محفوظة في هذا المتصفح', 'error');
    refreshEmergencySection();
    return;
  }

  // تحقّق من سلامة النسخة الطارئة قبل الاعتماد عليها
  const fpBad = Object.keys(b._fingerprint || {}).filter(t =>
    fingerprintRows(b[t]).checksum !== b._fingerprint[t].checksum);

  const when = b.backed_up_at ? new Date(b.backed_up_at).toLocaleString('ar-SA') : 'غير معروف';
  const totalRows = TABLES.reduce((s, t) => s + (Array.isArray(b[t]) ? b[t].length : 0), 0);
  const confirmed = await confirmAsync(
    `استعادة النسخة الطارئة\n\n` +
    `• تاريخ الحفظ: ${when}\n` +
    `• إجمالي السجلات: ${totalRows}\n` +
    `• سلامة البصمات: ${b._fingerprint ? (fpBad.length ? `⚠️ ${fpBad.length} جدول تالف (${fpBad.join('، ')})` : 'سليمة ✓') : 'غير متوفرة (نسخة قديمة)'}\n\n` +
    `⚠️ تحذير: سيتم حذف البيانات الحالية واستبدالها بمحتوى النسخة الطارئة.\n` +
    `(مرفقات دفتر المراجعة غير مشمولة بالنسخة الطارئة)\n\n` +
    `هل أنت متأكد؟`
  );
  if (!confirmed) { setStatus('emergency-status', 'info', 'تم الإلغاء'); return; }

  const btn = document.getElementById('btn-emergency-restore');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الاستعادة…'; }
  setStatus('emergency-status', 'info', 'يتم حذف البيانات الحالية…');

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('انتهت جلستك — أعد تسجيل الدخول ثم أعد المحاولة');

    // نفس مسار الاستعادة العادية: FK children أولاً ثم إدراج بترتيب TABLES و mapRow
    for (const table of deleteOrder(TABLES)) {
      const { error } = await supabaseClient.from(table).delete().eq(ownerColOf(table), user.id);
      if (error && error.code !== '42P01') {
        if (OPTIONAL_TABLES.has(table)) continue;
        throw new Error(`خطأ في حذف ${table}: ${error.message}`);
      }
    }

    setStatus('emergency-status', 'info', 'يتم إدراج بيانات النسخة الطارئة…');
    let inserted = 0;
    const results = [];
    for (const table of TABLES) {
      const rows = b[table];
      const entry = { table, expected: Array.isArray(rows) ? rows.length : 0, inserted: 0, failed: 0, errors: [] };
      if (!Array.isArray(rows) || !rows.length) { results.push(entry); continue; }

      const clean = rows.map(row => mapRow(table, row, user.id)).filter(Boolean);
      entry.failed += rows.length - clean.length;
      if (!clean.length) { results.push(entry); continue; }

      const batchSize = BATCH_SIZES[table] || DEFAULT_BATCH;
      for (let i = 0; i < clean.length; i += batchSize) {
        const batch = clean.slice(i, i + batchSize);
        setStatus('emergency-status', 'info',
          `يتم إدراج ${table}… (${Math.min(i + batchSize, clean.length)}/${clean.length})`);
        const q = UPSERT_TABLES.has(table)
          ? supabaseClient.from(table).upsert(batch, { onConflict: ownerColOf(table) })
          : supabaseClient.from(table).insert(batch);
        const { error } = await q;
        if (error) {
          if (OPTIONAL_TABLES.has(table) || error.code === '42P01') {
            entry.failed += batch.length; entry.errors.push(error.message); continue;
          }
          throw new Error(`خطأ في إدراج ${table}: ${error.message}`);
        }
        entry.inserted += batch.length;
      }
      entry.actual = await countOwnedRows(table, user.id);
      inserted += entry.inserted;
      results.push(entry);
    }

    // تقرير تفصيلي بدل نجاح صامت
    setReport('emergency-report',
      noteHtml(results.every(r => r.failed === 0) ? 'good' : 'warn',
        `أُدرج <b>${esc(inserted)}</b> صف من النسخة الطارئة المحفوظة بتاريخ ${esc(when)}.`) +
      tableHtml(['الجدول', 'في النسخة', 'أُدرج', 'فشل', 'العدد الفعلي'],
        results.map(r => `<tr><td>${esc(r.table)}</td><td style="text-align:center">${esc(r.expected)}</td>` +
          `<td style="text-align:center">${esc(r.inserted)}</td><td style="text-align:center">${esc(r.failed)}</td>` +
          `<td style="text-align:center">${esc(r.actual == null ? '—' : r.actual)}</td></tr>`).join('')));

    // نجحت الاستعادة — النسخة الطارئة استُهلكت (البيانات صارت في القاعدة)
    localStorage.removeItem('tharwa_emergency_backup');
    refreshEmergencySection();
    setStatus('emergency-status', 'success', `✓ تمت استعادة النسخة الطارئة — ${inserted} سجل (التفاصيل أدناه)`);
    showToast('تمت استعادة النسخة الطارئة ✓', 'success');
  } catch (err) {
    setStatus('emergency-status', 'error', '✗ ' + err.message);
    showToast('فشلت استعادة النسخة الطارئة: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🛟 استعادة النسخة الطارئة'; }
  }
}

// ══════════════════════════════════════════════════════════════
// مسح شامل لكل مفاتيح localStorage الخاصة بالتطبيق/المستخدم
// يُستخدم في التصفير وحذف الحساب — يضمن عدم بقاء أي مفتاح يتيم
// (خام أو مؤطَّر u:uid:…). يُستبعد توكن مصادقة Supabase دائماً.
// ══════════════════════════════════════════════════════════════
function clearAllAppLocalStorage() {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith('sb-')) continue;   // توكن مصادقة Supabase — لا يُمسّ
    toRemove.push(k);
  }
  toRemove.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
}

// ══════════════════════════════════════════════════════════════
// تحويل الصف للاستعادة — نسخ حرفي 100% لكل الأعمدة كما خُزّنت
// القاعدة: لا نُسقط أي عمود إطلاقاً (وفاءً بمتطلّب النسخ 100%).
//   • نفرض هوية المستخدم الحالي في عمود المالك (يسمح بالاستعادة على حساب مختلف).
//   • id يُحذف للجداول ذات المفتاح التسلسلي (يُولَّد تلقائياً) ويُبقى
//     للجداول المرتبطة بمفتاح أجنبي حتى لا تنكسر الروابط.
//   • user_settings مفتاحه (user_id,key) — نحذف id ونتجاهل الصفوف بلا key.
//   • user_profiles مفتاحه id وهو هوية المستخدم نفسها (لا عمود user_id فيه).
// ══════════════════════════════════════════════════════════════
const KEEP_ID_TABLES = new Set(['review_log', 'review_log_attachments']);

function mapRow(table, row, userId) {
  if (!row || typeof row !== 'object') return null;
  if (table === 'user_settings' && !row.key) return null;
  const r = { ...row };          // نسخة كاملة — كل عمود يُحفظ كما هو
  const ownerCol = ownerColOf(table);
  if (ownerCol === 'id') {
    r.id = userId;               // المفتاح هو الهوية — لا يُحذف ولا يوجد user_id
  } else {
    if (!KEEP_ID_TABLES.has(table)) delete r.id;
    r[ownerCol] = userId;        // فرض هوية المستخدم الحالي
  }
  return r;
}

// ══════════════════════════════════════════════════════════════
// تصفير جميع البيانات
// ══════════════════════════════════════════════════════════════
async function resetAllData() {
  // AUDIT-FIX: replaced blocking confirm() with confirmAsync() — mobile-safe, CSP-safe
  const confirmed = await confirmAsync(
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

  // AUDIT-FIX: replaced blocking confirm() with confirmAsync()
  const confirmed2 = await confirmAsync('تأكيد أخير: سيتم مسح كل البيانات بلا رجعة. متأكد؟');
  if (!confirmed2) return;

  const btn = document.getElementById('btn-reset');
  const resetStatus = document.getElementById('reset-status');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ المسح…'; }
  if (resetStatus) resetStatus.style.display = 'block';
  setStatus('reset-status', 'info', 'يتم مسح البيانات…');

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('انتهت جلستك — أعد تسجيل الدخول ثم أعد المحاولة');
    // RESET_KEEP: ملف الحساب وتذاكر الدعم ليست بيانات محفظة — «التصفير» لا يمسّها
    for (const table of deleteOrder(TABLES).filter(t => !RESET_KEEP.has(t))) {
      const { error } = await supabaseClient.from(table).delete().eq(ownerColOf(table), user.id);
      if (error && error.code !== '42P01') {
        if (OPTIONAL_TABLES.has(table)) continue;
        throw new Error(`خطأ في مسح ${table}: ${error.message}`);
      }
    }
    // مسح جميع مفاتيح localStorage بما فيها الثيم والزوم ونقد المحفظة
    // (شامل: خام + مؤطَّر u:uid:… + أي مفتاح غير مُسجَّل — لا يبقى يتيم)
    clearAllAppLocalStorage();
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
  // AUDIT-FIX: replaced blocking confirm() with confirmAsync() — mobile-safe, CSP-safe
  const confirmed = await confirmAsync(
    '⛔ حذف الحساب نهائياً\n\n' +
    'سيتم حذف:\n• جميع بياناتك\n• حسابك بالكامل\n\n' +
    'لا يمكن التراجع عن هذا الإجراء.\n\n' +
    'هل أنت متأكد؟'
  );
  if (!confirmed) return;

  const emailInput = document.getElementById('del-email-confirm')?.value?.trim();
  const { data: { user } } = await supabaseClient.auth.getUser();
  // حارس الجلسة المنتهية — getUser قد يرجع null فينهار user.email
  if (!user) {
    showToast('انتهت جلستك — أعد تسجيل الدخول', 'error');
    setStatus('del-account-status', 'error', '✗ انتهت جلستك — أعد تسجيل الدخول ثم أعد المحاولة');
    return;
  }
  if (emailInput !== user.email) {
    showToast('البريد الإلكتروني غير مطابق', 'error');
    setStatus('del-account-status', 'error', '✗ البريد الإلكتروني الذي أدخلته لا يطابق حسابك');
    return;
  }

  const btn = document.getElementById('btn-delete-account');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحذف…'; }
  setStatus('del-account-status', 'info', 'يتم مسح البيانات وحذف الحساب…');

  try {
    // 1. مسح كل البيانات أولاً — FK children أولاً لتجنب انتهاك القيود
    // user_profiles مستثنى من الحذف اليدوي: حذفه يتم بالتتالي (CASCADE) مع auth.users
    for (const table of deleteOrder(TABLES)) {
      // أي فشل حذف يوقف العملية قبل استدعاء RPC — لا حذف حساب فوق بيانات متبقية
      const { error: delErr } = await supabaseClient.from(table).delete().eq(ownerColOf(table), user.id);
      if (delErr && delErr.code !== '42P01') {
        if (OPTIONAL_TABLES.has(table)) continue;   // RLS قد تمنع الحذف — الحساب يُحذف بالتتالي
        throw new Error(`خطأ في مسح ${table}: ${delErr.message}`);
      }
    }
    // مسح جميع مفاتيح localStorage (شامل: خام + مؤطَّر + غير مُسجَّل)
    clearAllAppLocalStorage();

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
    if (!user) throw new Error('انتهت جلستك — أعد تسجيل الدخول ثم أعد المحاولة');

    // ── جلب كل الجداول ─────────────────────────────────────
    // ترقيم صفحات 1000/دفعة (fetchAllRows) — بلا حد يقتطع الجداول الكبيرة بصمت
    // + فلترة user_id صراحةً (دفاع في العمق): لا يعتمد التقرير على RLS وحدها،
    //   فأي خلل في سياسة لا يُسرِّب صفوف مستخدم آخر إلى تقرير المالك.
    const fetchTable = (table, order) =>
      fetchAllRows(table, q => {
        let x = q.eq(ownerColOf(table), user.id);
        return order ? x.order(order, { ascending: true }) : x;
      });

    setStatus('md-export-status', 'info', 'جارٍ تحميل البيانات…');
    const [holdings, transactions, dividends, cashflows, snapshots,
           assets, liabilities, realEstate, stockTargets, sectorTargets,
           watchlist, tasks, userStocks, reviewLog, portfolioCashRows,
           reviewAttachments] = await Promise.all([
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
      fetchTable('review_log', 'review_date'),
      fetchTable('portfolio_cash'),
      fetchTable('review_log_attachments', 'created_at'),
    ]);

    // النقد غير المستثمر (صف واحد عادةً)
    const portfolioCash = portfolioCashRows.reduce((s, c) => s + (+c.amount || 0), 0);

    // ── الإعدادات المتزامنة — نُفضّل مصدر الحقيقة (user_settings) ثم الكاش المحلي ──
    // M-2: use userLsKey so we read this user's data on shared devices
    const lsGet = (key, def) => {
      try {
        const v = localStorage.getItem(userLsKey(key)) ?? localStorage.getItem(key);
        return JSON.parse(v) || def;
      } catch { return def; }
    };
    const syncedGet = async (key, def) => {
      try {
        const remote = (typeof loadUserSetting === 'function') ? await loadUserSetting(key) : null;
        if (remote != null) return remote;
      } catch { /* تجاهل — نرجع للكاش */ }
      return lsGet(key, def);
    };
    const retGoal    = await syncedGet('retirement_goal_v1', { monthly: 0, swr: 4 });
    const salaryData = await syncedGet('salary_planner_v1',  { categories: [], entries: [] });
    const sukukData  = await syncedGet('sukuk_planner_v1',   { opportunities: [] });
    const benchmark  = await syncedGet('tharwa-benchmark_v1', []);
    // life_goals_v1 يُزامَن عبر user_settings (life-goals.js: saveUserSetting/loadUserSetting)
    // — كان يُقرأ من localStorage فقط فيظهر التقرير بلا أهداف على جهاز جديد.
    const lifeGoals  = await syncedGet('life_goals_v1', []);

    setStatus('md-export-status', 'info', 'جارٍ بناء التقرير…');

    const today    = new Date();
    const dateStr  = today.toISOString().slice(0, 10);
    const SAR      = n => (+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const PCT      = n => (+n || 0).toFixed(2) + '%';
    const N        = n => (+n || 0).toLocaleString('en-US', { maximumFractionDigits: 4 });
    const MONTHS   = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

    // ── مساعدات ─────────────────────────────────────────────
    // تهريب خلية جدول Markdown: أي «|» في نص المستخدم يكسر الجدول، وأي سطر
    // جديد يقطعه. العملية idempotent (نفكّ التهريب أولاً) حتى لا يتضاعف الشرط
    // «\\|» عند مرور نص سبق تهريبه عبر cell() المحلية في الأقسام 26/27.
    const esc = v => {
      if (v == null) return '—';
      const s = String(v);
      if (!s.trim()) return '—';
      return s.replace(/\\\|/g, '|').replace(/\|/g, '\\|').replace(/\r?\n+/g, ' ').trim();
    };
    const mdTable = (headers, rows) => {
      const sep = headers.map(() => '---');
      return [
        '| ' + headers.map(esc).join(' | ') + ' |',
        '| ' + sep.join(' | ') + ' |',
        ...rows.map(r => '| ' + r.map(esc).join(' | ') + ' |')
      ].join('\n');
    };

    // ════════════════════════════════════════════════════════
    // مُوجِّه التقارير (Books) — التقرير الواحد الضخم مُقسَّم إلى أربعة
    // ملفات مترابطة. h1/h2/h3/p/hr تكتب في الكتاب الحالي فقط، فتقسيم
    // قسمٍ = سطر book('X') واحد قبله.
    // ════════════════════════════════════════════════════════
    const BOOKS = {
      A: { key: 'A', file: 'A_portfolio_decision', title: 'تقرير المحفظة والقرار',
           desc: 'ما تملكه الآن، وما يقوله الدستور عنه، وما يحتاج قراراً.' },
      B: { key: 'B', file: 'B_performance_income', title: 'تقرير الأداء والدخل',
           desc: 'كيف أدّت المحفظة، مقابل تاسي، وكم تُنتج من دخل.' },
      C: { key: 'C', file: 'C_planning_wealth', title: 'تقرير التخطيط والثروة',
           desc: 'صافي الثروة، الراتب، الصكوك، العقار، التوقعات، وأهداف الحياة.' },
      D: { key: 'D', file: 'D_raw_data', title: 'تقرير البيانات الخام الكاملة',
           desc: 'كل صف وكل عمود في قاعدة البيانات — بلا اختصار ولا عيّنة.' },
    };
    Object.values(BOOKS).forEach(b => { b.lines = []; b.toc = []; });

    let _cur = BOOKS.A;
    const book = k => { _cur = BOOKS[k]; };

    // مرساة العناوين: توليد slug صالح للربط الداخلي (يدعم العربية)
    const _slugSeen = {};
    const slug = t => {
      let s = String(t).trim().toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (!s) s = 'section';
      const n = (_slugSeen[s] = (_slugSeen[s] || 0) + 1);
      return n > 1 ? `${s}-${n - 1}` : s;
    };

    const h1 = t => _cur.lines.push(`# ${t}\n`);
    const h2 = t => { const a = slug(t); _cur.toc.push({ lvl: 2, t, a }); _cur.lines.push(`\n<a id="${a}"></a>\n\n## ${t}\n`); };
    const h3 = t => { const a = slug(t); _cur.toc.push({ lvl: 3, t, a }); _cur.lines.push(`\n<a id="${a}"></a>\n\n### ${t}\n`); };
    const p  = t => _cur.lines.push(t + '\n');
    const hr = () => _cur.lines.push('\n---\n');

    // إفساح المجال للمتصفح بين الأقسام الثقيلة — يمنع تجمّد الواجهة
    // على المحافظ الكبيرة (آلاف المعاملات) ويسمح بتحديث شريط التقدّم.
    let _step = 0;
    const TOTAL_STEPS = 40;
    const tick = async (label) => {
      _step++;
      const pctDone = Math.min(99, Math.round(_step / TOTAL_STEPS * 100));
      setStatus('md-export-status', 'info', `جارٍ بناء التقرير… ${pctDone}% — ${label}`);
      await new Promise(r => setTimeout(r, 0));
    };

    // سجل المصادر المتعذّرة — الدستور §8: لا حذف صامت ولا تقدير صامت
    const missingSources = [];
    const noteMissing = (name, why) => missingSources.push({ name, why });

    // ════════════════════════════════════════════════════════
    // دليل القراءة (يُكرَّر في كل تقرير عند التجميع)
    // ════════════════════════════════════════════════════════
    const READING_GUIDE = [];
    {
      const g = t => READING_GUIDE.push(t + '\n');
      g('**المصطلحات المستخدمة:**');
      g('- **avg_price / متوسط التكلفة**: متوسط سعر الشراء المرجَّح لكل سهم (price × shares / total_shares)، لا يشمل العمولة');
      g('- **cost_basis / تكلفة الحيازة**: avg_price × عدد الأسهم المتبقية — التكلفة الفعلية لما يُحتفظ به حالياً');
      g('- **unrealized_pnl**: (current_price − avg_price) × shares — ربح/خسارة ورقية لم تُحقَّق بعد');
      g('- **realized_pnl**: عائد البيع − تكلفة الأسهم المباعة — ربح/خسارة فعلي من صفقات البيع المكتملة');
      g('- **YOC (Yield on Cost)**: أرباح موزعة ÷ تكلفة الحيازة × 100 — العائد على التكلفة الأصلية');
      g('- **XIRR**: العائد السنوي المركّب الحقيقي المراعي لتوقيت كل تدفق نقدي (Newton-Raphson على NPV=0)');
      g('- **TWR**: العائد المعدَّل بالزمن (Modified Dietz) — يعزل قراراتك بإزالة أثر الإيداع والسحب');
      g('- **total في المعاملات**: للشراء = price × shares + عمولة + VAT | للبيع = price × shares − عمولة − VAT');
      g('- **العمولة**: 0.15% من قيمة الصفقة بحد أقصى 100 ر.س + VAT 15%');
      g('- **الأرقام بالريال السعودي (ر.س) ما لم يُذكر خلاف ذلك**');
      g('');
      g('**تنبيه منهجي (الدستور §8):** أي بيانات غير متوفرة تُعلَن صراحةً ولا تُقدَّر بصمت. راجع قسم «المصادر المتعذّرة» في نهاية كل تقرير.');
    }

    // ════════════════════════════════════════════════════════
    // 1. الأسهم الحالية (Holdings)
    // ════════════════════════════════════════════════════════
    book('A');
    await tick('الحيازات');
    h2('1. الأسهم الحالية في المحفظة (Holdings)');
    p('الأسهم التي يُحتفظ بها حالياً. السعر الحالي مُدخَّل يدوياً ويعكس آخر تحديث.');

    if (holdings.length) {
      // خرائط مساعدة: الهدف المسجّل لكل رمز + طابع طزاجة السعر
      const _tgtMap = {};
      stockTargets.forEach(t => { if (t && t.ticker) _tgtMap[t.ticker] = +t.target_pct || 0; });
      const _priceTs = lsGet('tharwa-price-timestamps', {}) || {};
      const _freshOf = tk => {
        const raw = _priceTs[tk];
        if (!raw) return { txt: 'غير متوفرة', days: null, stale: null };
        const ms = new Date(raw).getTime();
        if (!isFinite(ms)) return { txt: 'غير متوفرة', days: null, stale: null };
        const days = (Date.now() - ms) / 86400000;
        return { txt: `${days.toFixed(1)} يوم ${days > 7 ? '🔴' : '🟢'}`, days, stale: days > 7 };
      };
      const _grandMkt = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);

      let totalCost = 0, totalMkt = 0;
      const hRows = holdings
        .sort((a, b) => (+b.shares * +b.current_price) - (+a.shares * +a.current_price))
        .map(h => {
          const mkt   = +h.shares * +h.current_price;
          const cost  = +h.shares * +h.avg_price;
          const upnl  = mkt - cost;
          const upct  = cost > 0 ? upnl / cost * 100 : 0;
          const wt    = _grandMkt > 0 ? mkt / _grandMkt * 100 : 0;
          const tgt   = _tgtMap[h.ticker];
          const dev   = tgt != null ? wt - tgt : null;
          totalCost  += cost;
          totalMkt   += mkt;
          return [
            h.ticker, h.name || '—', h.sector || 'غير مصنف', N(h.shares),
            SAR(h.avg_price), SAR(h.current_price), _freshOf(h.ticker).txt,
            SAR(cost), SAR(mkt), PCT(wt),
            tgt != null ? PCT(tgt) : 'بلا هدف',
            dev != null ? ((dev >= 0 ? '+' : '') + PCT(dev)) : '—',
            (upnl >= 0 ? '+' : '') + SAR(upnl),
            (upct >= 0 ? '+' : '') + PCT(upct)
          ];
        });

      p(mdTable(
        ['الرمز','الاسم','القطاع','الأسهم','متوسط التكلفة','السعر الحالي','عمر السعر',
         'تكلفة الحيازة','القيمة السوقية','الوزن%','الهدف%','الانحراف','ر/خ غير محقق','ر/خ %'],
        hRows
      ));

      const totalUpnl = totalMkt - totalCost;
      const totalUpct = totalCost > 0 ? totalUpnl / totalCost * 100 : 0;
      p(`\n**عدد الأسهم المملوكة:** ${holdings.length}  `);
      p(`**إجمالي تكلفة الحيازات:** ${SAR(totalCost)} ر.س  `);
      p(`**إجمالي القيمة السوقية:** ${SAR(totalMkt)} ر.س  `);
      p(`**النقد غير المستثمر:** ${SAR(portfolioCash)} ر.س  `);
      p(`**إجمالي ر/خ غير محقق:** ${(totalUpnl >= 0 ? '+' : '')}${SAR(totalUpnl)} ر.س (${(totalUpct >= 0 ? '+' : '')}${PCT(totalUpct)})`);

      // ── تشخيص: ماذا تعني هذه الأرقام ─────────────────────
      h3('ما تعنيه هذه الأرقام (تشخيص الحيازات)');
      {
        const staleN  = holdings.filter(h => _freshOf(h.ticker).stale === true).length;
        const noTsN   = holdings.filter(h => _freshOf(h.ticker).days == null).length;
        const winners = holdings.filter(h => +h.current_price > +h.avg_price).length;
        const losers  = holdings.length - winners;
        const topH    = holdings[0];
        const topW    = _grandMkt > 0 && topH ? (+topH.shares * +topH.current_price) / _grandMkt * 100 : 0;
        const noTgt   = holdings.filter(h => _tgtMap[h.ticker] == null).length;
        const diag = [];
        diag.push(`- **حجم المحفظة:** ${holdings.length} سهم — ${holdings.length < 18 ? '⚠️ أقل من الحد الأدنى الدستوري (18)' : holdings.length > 25 ? '⚠️ أعلى من السقف الدستوري (25)' : '✅ داخل النطاق المستهدف 18–25 (الدستور §1)'}.`);
        if (topH) diag.push(`- **أكبر مركز:** ${topH.ticker} عند ${PCT(topW)} من المحفظة — ${topW > 12.75 ? '🔴 يتجاوز حتى سقف القيادي 12% + منطقة السماح' : topW > 7.75 ? '🟡 فوق سقف السهم العادي 7% (مقبول فقط إن كان قيادياً)' : '✅ تحت السقف'}.`);
        diag.push(`- **الرابحون مقابل الخاسرون:** ${winners} سهم فوق متوسط تكلفته، ${losers} تحته.`);
        diag.push(`- **موثوقية الأسعار:** ${staleN} سهم سعره أقدم من 7 أيام، و${noTsN} سهم بلا طابع زمني. ${staleN + noTsN > 0 ? '⚠️ كل رقم مبني على السعر (الوزن، الانحراف، XIRR) يرث هذا الضعف.' : '✅ كل الأسعار حديثة.'}`);
        diag.push(`- **الأهداف:** ${noTgt} سهم بلا هدف وزن مسجّل${noTgt ? ' — لا يُلفَّق لها هدف من السقف؛ يُقاس التزامها بالسقف الدستوري فقط.' : '.'}`);
        p(diag.join('\n'));
      }

      // توزيع القطاعات
      h3('توزيع القطاعات');
      const secMap = {};
      holdings.forEach(h => {
        const sec = h.sector || 'غير مصنف';
        secMap[sec] = (secMap[sec] || 0) + +h.shares * +h.current_price;
      });
      const secTgtMap = {};
      sectorTargets.forEach(t => { if (t && t.sector) secTgtMap[t.sector] = +t.target_pct || 0; });
      const secRows = Object.entries(secMap)
        .sort((a, b) => b[1] - a[1])
        .map(([sec, val]) => {
          const w = totalMkt > 0 ? val / totalMkt * 100 : 0;
          const t = secTgtMap[sec];
          return [sec, String(holdings.filter(h => (h.sector || 'غير مصنف') === sec).length),
                  SAR(val), PCT(w), t != null ? PCT(t) : 'بلا هدف',
                  w > 26.25 ? '🔴 كسر سقف 25%' : w > 25 ? '🟡 داخل منطقة السماح' : '✅'];
        });
      p(mdTable(['القطاع', 'عدد الأسهم', 'القيمة السوقية', '% من المحفظة', 'الهدف%', 'مقابل سقف 25%'], secRows));
      {
        const over = secRows.filter(r => r[5].startsWith('🔴'));
        p(`\n**تشخيص قطاعي:** ${Object.keys(secMap).length} قطاع. ${over.length ? `🔴 ${over.length} قطاع كسر سقف 25% الدستوري: ${over.map(r => r[0]).join('، ')} — الفلتر 4 يفرض تنبيه تركيز قطاعي.` : '✅ لا قطاع يتجاوز سقف 25% + منطقة السماح 1.25%.'}`);
      }
    } else {
      p('_لا توجد أسهم محتفظ بها حالياً._');
      noteMissing('الحيازات (holdings)', 'الجدول فارغ — لا يمكن حساب الأوزان ولا الأداء ولا محرّك القرار.');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 2. سجل المعاملات الكامل (Transactions)
    // ════════════════════════════════════════════════════════
    book('D');
    await tick('المعاملات');
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

      // ── فحص اتساق ضريبة القيمة المضافة (غير مدمّر — عرض فقط) ──
      // القاعدة الثابتة (السوق السعودي و calcCommission): VAT = 15% × العمولة.
      // أي معاملة تخالف ذلك (غالباً مستوردة بضريبة صفر) تُخفّض إجمالي الضريبة.
      h3('🔍 فحص اتساق الضريبة (VAT)');
      const _vatExpected = c => Math.round((+c || 0) * 0.15 * 10000) / 10000;
      const vatMismatch  = transactions.filter(t =>
        t.type !== 'grant' && Math.abs((+t.vat || 0) - _vatExpected(t.commission)) > 0.01
      );
      if (!vatMismatch.length) {
        p('✅ كل المعاملات ضريبتها = 15٪ من عمولتها — لا تعارض.');
      } else {
        const sumComm = transactions.reduce((s, t) => s + (+t.commission || 0), 0);
        const sumVat  = transactions.reduce((s, t) => s + (+t.vat || 0), 0);
        const expVat  = sumComm * 0.15;
        p(`⚠️ **${vatMismatch.length}** معاملة ضريبتها لا تساوي 15٪ من عمولتها.  `);
        p(`الضريبة المخزّنة: **${SAR(sumVat)}** ر.س | المتوقعة (15٪ من العمولات): **${SAR(expVat)}** ر.س | الفرق: **${SAR(expVat - sumVat)}** ر.س  `);
        p('_عرض فقط — لم تُعدَّل أي بيانات. صحّح المعاملات يدوياً من صفحة المعاملات إن أردت._');
        p(mdTable(
          ['التاريخ','الرمز','النوع','العمولة','VAT المخزّن','VAT المتوقع','الفرق'],
          vatMismatch.map(t => {
            const exp = (+t.commission || 0) * 0.15;
            return [t.date, t.ticker, t.type === 'buy' ? 'شراء' : 'بيع',
                    SAR(+t.commission || 0), SAR(+t.vat || 0), SAR(exp), SAR(exp - (+t.vat || 0))];
          })
        ));
      }
    } else {
      p('_لا توجد معاملات مسجّلة._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 3. الأرباح الموزعة (Dividends)
    // ════════════════════════════════════════════════════════
    book('B');
    await tick('التوزيعات');
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
    book('C');
    await tick('التدفقات النقدية');
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
    book('C');
    await tick('صافي الثروة');
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
    book('C');
    await tick('العقارات');
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
    book('A');
    await tick('أهداف الأوزان');
    h2('7. أهداف الأوزان (Targets)');
    p('الأوزان المستهدفة لكل سهم وقطاع. الوزن الحالي محسوب من القيمة السوقية الحالية.');

    const totalMktNow = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);

    if (stockTargets.length) {
      h3('أهداف الأسهم (مع مناطق الشراء والبيع)');
      p('**entry_price** = سعر منطقة الشراء المستهدف | **exit_price** = سعر منطقة البيع المستهدف');
      const stRows = stockTargets
        .sort((a, b) => +b.target_pct - +a.target_pct)
        .map(st => {
          const h    = holdings.find(x => x.ticker === st.ticker);
          const curr = h && totalMktNow > 0 ? (+h.shares * +h.current_price) / totalMktNow * 100 : 0;
          const curP = h ? +h.current_price : 0;
          const diff = curr - +st.target_pct;
          // إشارة منطقة الشراء/البيع بناءً على السعر الحالي
          let zoneSignal = '—';
          if (st.entry_price && curP > 0) {
            if (curP <= +st.entry_price) zoneSignal = '🟢 في منطقة الشراء';
            else if (st.exit_price && curP >= +st.exit_price) zoneSignal = '🔴 في منطقة البيع';
            else zoneSignal = `فوق منطقة الشراء (${SAR(curP)} > ${SAR(+st.entry_price)})`;
          }
          return [
            st.ticker, PCT(+st.target_pct), PCT(curr),
            (diff >= 0 ? '+' : '') + PCT(diff),
            Math.abs(diff) > 1.5 ? (diff > 0 ? '⚖️ تخفيف' : '🟢 تجميع') : '✅ ضمن الهدف',
            st.entry_price ? SAR(+st.entry_price) : '—',
            st.exit_price  ? SAR(+st.exit_price)  : '—',
            curP > 0 ? SAR(curP) : '—',
            zoneSignal,
          ];
        });
      p(mdTable(['الرمز','الهدف %','الحالي %','الفرق','حالة الوزن','سعر الشراء','سعر البيع','السعر الحالي','منطقة السعر'], stRows));
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
    book('A');
    await tick('قائمة المراقبة');
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
    book('A');
    await tick('المهام');
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
    book('B');
    await tick('الملخص الإحصائي');
    h2('10. الملخص الإحصائي — جاهز للتحليل');
    p('هذا القسم يجمع أهم الأرقام في مكان واحد لتسهيل التحليل الآلي.');

    // حساب الأرقام
    const totalCostBasis  = holdings.reduce((s, h) => s + +h.shares * +h.avg_price, 0);
    const totalMktValue   = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
    const totalUnrealPnL  = totalMktValue - totalCostBasis;
    // Use t.total for buy cost (includes commission+VAT) — consistent with performance.js buildPositionData
    const totalRealPnL    = (() => {
      const closedMap = {};
      transactions.forEach(t => {
        const tk = t.ticker;
        if (!closedMap[tk]) closedMap[tk] = { buyShares: 0, buyCost: 0, sellRev: 0, sellShares: 0 };
        if (t.type === 'buy' || t.type === 'grant') {
          closedMap[tk].buyCost  += +t.total;   // total = price×shares + commission + VAT (grant = 0)
          closedMap[tk].buyShares += +t.shares;
        }
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

    // ── XIRR: معدل العائد الداخلي الحقيقي ──────────────────────
    // M-6: use parseDateLocal to avoid UTC-midnight off-by-one on date strings
    const xirrFlows = [];
    transactions.forEach(t => {
      if (t.type === 'buy')  xirrFlows.push({ date: parseDateLocal(t.date), amount: -(+t.total) });
      if (t.type === 'sell') xirrFlows.push({ date: parseDateLocal(t.date), amount: +(+t.total) });
    });
    dividends.forEach(d => {
      const dDate = d.date ? parseDateLocal(d.date) : new Date((d.year || today.getFullYear()), 5, 1);
      xirrFlows.push({ date: dDate, amount: +d.amount });
    });
    if (totalMktValue > 0) xirrFlows.push({ date: new Date(), amount: totalMktValue });
    const xirrResult = (typeof computeXIRR === 'function') ? computeXIRR(xirrFlows) : null;

    // ── Forward YOC (آخر DPS × دورية × الأسهم الحالية) ─────────
    // تقدير مبسّط: متوسط آخر سنتين ÷ القيمة السوقية
    const divByYr = {};
    dividends.forEach(d => { divByYr[d.year] = (divByYr[d.year] || 0) + +d.amount; });
    const sortedYrs = Object.keys(divByYr).map(Number).sort((a,b) => b-a);
    const recentDivs = sortedYrs.slice(0,2).map(y => divByYr[y]);
    const avgRecentDiv = recentDivs.length ? recentDivs.reduce((s,v) => s+v, 0) / recentDivs.length : 0;
    const fwdYoc = totalMktValue > 0 ? avgRecentDiv / totalMktValue * 100 : 0;

    // ── TTM (آخر 12 شهراً) ──────────────────────────────────────
    const ttmKeys = new Set();
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      ttmKeys.add(d.getFullYear() + '-' + (d.getMonth() + 1));
    }
    const ttmDiv = dividends.reduce((s, d) => ttmKeys.has(+d.year + '-' + +d.month) ? s + +d.amount : s, 0);
    const ttmYoc = totalCostBasis > 0 ? ttmDiv / totalCostBasis * 100 : 0;

    p('```');
    p(`تاريخ التقرير              : ${dateStr}`);
    p(`--- محفظة الأسهم ---`);
    p(`عدد الأسهم المحتفظ بها     : ${holdings.length}`);
    p(`إجمالي تكلفة الحيازات      : ${SAR(totalCostBasis)} ر.س`);
    p(`إجمالي القيمة السوقية       : ${SAR(totalMktValue)} ر.س`);
    p(`ر/خ غير محقق               : ${(totalUnrealPnL >= 0 ? '+' : '') + SAR(totalUnrealPnL)} ر.س  (${PCT(totalCostBasis > 0 ? totalUnrealPnL / totalCostBasis * 100 : 0)})`);
    p(`ر/خ محقق من المبيعات        : ${(totalRealPnL >= 0 ? '+' : '') + SAR(totalRealPnL)} ر.س`);
    p(`XIRR (العائد الداخلي السنوي): ${xirrResult != null ? (xirrResult >= 0 ? '+' : '') + xirrResult.toFixed(2) + '%' : 'غير محتسب (بيانات غير كافية)'}`);
    p(`--- الأرباح الموزعة ---`);
    p(`إجمالي الأرباح (كل الأوقات) : ${SAR(totalDivAll)} ر.س`);
    p(`أرباح السنة الحالية ${today.getFullYear()}      : ${SAR(currentYearDivs)} ر.س`);
    p(`أرباح آخر 12 شهراً (TTM)    : ${SAR(ttmDiv)} ر.س`);
    p(`YOC على التكلفة (TTM)       : ${PCT(ttmYoc)}`);
    p(`Forward YOC (متوقع)         : ${PCT(fwdYoc)}  (≈ ${SAR(avgRecentDiv)} / سنة)`);
    p(`--- التدفقات النقدية ---`);
    p(`إجمالي الإيداعات            : ${SAR(totalDeposited)} ر.س`);
    p(`إجمالي السحوبات             : ${SAR(totalWithdrawn)} ر.س`);
    p(`صافي رأس المال المُودَع      : ${SAR(totalDeposited - totalWithdrawn)} ر.س`);
    p(`النقد غير المستثمر          : ${SAR(portfolioCash)} ر.س`);
    p(`--- العقارات ---`);
    p(`عدد الأصول العقارية         : ${activeRE.length}`);
    p(`إجمالي القيمة الحالية        : ${SAR(reCurrentVal)} ر.س`);
    p(`--- صافي الثروة الإجمالي ---`);
    p(`أسهم + عقارات + أصول − التزامات : ${SAR(totalNetWorth)} ر.س`);
    p(`+ النقد غير المستثمر            : ${SAR(portfolioCash)} ر.س`);
    p(`= إجمالي الثروة شاملاً النقد     : ${SAR(totalNetWorth + portfolioCash)} ر.س`);
    p(`--- المهام ---`);
    p(`مهام نشطة                  : ${activeTasks.length}`);
    p(`مهام منجزة                  : ${doneTasks.length}`);
    p('```');

    // توصيات الأهداف
    if (stockTargets.length) {
      // AUDIT-FIX (2026-08-21): كانت العتبة 1.5% ثابتة بينما هذا الملف نفسه يقرأ
      // ويحفظ عتبتَي المالك (tharwa-alert-green/yellow، السطر 222) وكل الصفحات
      // الأخرى تستخدمهما. فكان التقرير يعلن «ضمن النطاق» لسهم تصفه اللوحة والمحرّك
      // بأنه خارجه. الآن العتبة الصفراء للمالك هي الحدّ.
      const _devY = +(localStorage.getItem(userLsKey('tharwa-alert-yellow'))
                   ?? localStorage.getItem('tharwa-alert-yellow') ?? 3) || 3;
      h3(`الانحرافات عن الأهداف (> ${_devY}% — عتبتك من الإعدادات)`);
      const deviations = stockTargets
        .map(st => {
          const h    = holdings.find(x => x.ticker === st.ticker);
          const curr = h && totalMktValue > 0 ? (+h.shares * +h.current_price) / totalMktValue * 100 : 0;
          return { ticker: st.ticker, target: +st.target_pct, current: curr, diff: curr - +st.target_pct };
        })
        .filter(x => Math.abs(x.diff) > _devY)
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
        p(`_جميع الأسهم ضمن نطاق الهدف (انحراف < ${_devY}% — عتبتك المحفوظة)._`);
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 11. هدف التقاعد / الاستقلال المالي (FIRE)
    // ════════════════════════════════════════════════════════
    book('C');
    await tick('هدف الاستقلال المالي');
    h2('11. هدف الاستقلال المالي (FIRE)');
    if (retGoal.monthly > 0) {
      const monthlyTarget  = retGoal.monthly;
      const swrPct         = retGoal.swr || 4;
      const portfolioNeeded = (monthlyTarget * 12) / (swrPct / 100);
      // AUDIT-FIX (2026-08-18): كانت القاعدة هنا «أسهم + عقار + أصول − التزامات»،
      // أي أنها تحتسب العقار (لا يُسحب منه 4% شهرياً) وتُسقط النقد والصكوك (يُسحب
      // منهما فعلاً) — عكس ما تفعله لوحة التحكم (dashboard.js:1334) والقسم 32 من
      // هذا التقرير نفسه (settings.js:3581). ثلاث جهات على قاعدة الأصول السائلة
      // وهذه وحدها شاذّة، فكان المالك يقرأ نسبتَي إنجاز مختلفتين لنفس الهدف —
      // ومرّتين متعارضتين داخل الملف الواحد. وُحِّدت على الأصول السائلة.
      const _fireSukuk = (sukukData.opportunities || [])
        .filter(o => o.status === 'مشترك').reduce((s, o) => s + (+o.amount || 0), 0);
      const currentPortfolio = totalMktValue + portfolioCash + _fireSukuk;
      const fireProgress   = portfolioNeeded > 0 ? currentPortfolio / portfolioNeeded * 100 : 0;
      const remaining      = portfolioNeeded - currentPortfolio;

      p('```');
      p(`المصاريف الشهرية المستهدفة  : ${SAR(monthlyTarget)} ر.س`);
      p(`المصاريف السنوية المستهدفة  : ${SAR(monthlyTarget * 12)} ر.س`);
      p(`نسبة السحب الآمن (SWR)      : ${swrPct}%`);
      p(`قاعدة الضرب                 : ${(100 / swrPct).toFixed(0)}× (قاعدة ${100 / swrPct >= 25 ? '25' : (100/swrPct).toFixed(0)} ضعف)`);
      p(`المحفظة المطلوبة للتقاعد    : ${SAR(portfolioNeeded)} ر.س`);
      p(`قاعدة الأصول المحتسبة       : أسهم + نقد + صكوك = ${SAR(currentPortfolio)} ر.س`);
      p(`                              (العقار مستبعَد عمداً — لا يُسحب منه دخل شهري؛ نفس قاعدة لوحة التحكم والقسم 32)`);
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
    book('B');
    await tick('أداء كل سهم');
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
        // Use t.total for buy cost (includes commission+VAT) — consistent with performance.js
        if (t.type === 'buy')   { e.buyShares += +t.shares; e.buyCostTotal += +t.total; }
        if (t.type === 'sell')  { e.sellShares += +t.shares; e.sellRevTotal += +t.total; }
        if (t.type === 'grant') { e.grantShares += +t.shares; /* total=0, no cost */ }
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
    book('B');
    await tick('التوزيعات الشهرية');
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
    book('C');
    await tick('الراتب');
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

        // كامل السجل
        h3(`كامل السجل (${entries.length} شهر)`);
        const allEntriesHeaders = ['السنة', 'الشهر', 'الراتب', ...cats.map(c => c.name), 'المتبقي'];
        const allEntriesRows = entries.map(e => {
          const allocs = cats.map(c => {
            const al = (e.allocations || []).find(a => a.catId === c.id);
            return al ? SAR(al.amount) : '—';
          });
          const totalAlloc = (e.allocations || []).reduce((s, a) => s + (+a.amount || 0), 0);
          const remaining  = (+e.salary || 0) - totalAlloc;
          return [String(e.year), MONTHS[(e.month || 1) - 1], SAR(e.salary), ...allocs, SAR(remaining)];
        });
        p(mdTable(allEntriesHeaders, allEntriesRows));

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
    book('C');
    await tick('الصكوك');
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
    book('C');
    await tick('أهداف الحياة');
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
    book('A');
    await tick('قاعدة الأسهم');
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

    // ════════════════════════════════════════════════════════
    // 18. دفتر المراجعة — ملاحظات المستخدم على كل سهم
    // ════════════════════════════════════════════════════════
    book('C');
    await tick('دفتر المراجعة');
    h2('18. دفتر المراجعة (ملاحظات المستخدم)');
    p('مراجعات ونقاط الدراسة التي سجّلها المستخدم بنفسه عن كل سهم — مهمة لفهم القرارات الاستثمارية.');

    if (reviewLog && reviewLog.length) {
      // مجموعة حسب الرمز
      const byTicker = {};
      reviewLog.forEach(r => {
        const tk = r.ticker || 'عام';
        if (!byTicker[tk]) byTicker[tk] = { name: r.name || '', entries: [] };
        byTicker[tk].entries.push(r);
      });

      Object.entries(byTicker)
        .sort(([a],[b]) => a.localeCompare(b))
        .forEach(([tk, v]) => {
          h3(`${tk} — ${v.name}`);
          v.entries
            .sort((a, b) => (b.review_date || '').localeCompare(a.review_date || ''))
            .forEach(r => {
              p(`**📅 ${r.review_date || '—'} | المراجع:** ${r.ticker || '—'} ${r.name || ''}`);
              if (r.notes) {
                // نص المراجعة كاملاً محافظاً على التنسيق
                p(r.notes.split('\n').map(line => `> ${line}`).join('\n'));
              } else {
                p('> _لا توجد ملاحظات مسجّلة._');
              }
              p('');
            });
        });

      p(`**إجمالي المراجعات:** ${reviewLog.length} مراجعة على ${Object.keys(byTicker).length} رمز`);
    } else {
      p('_لا توجد مراجعات مسجّلة في دفتر المراجعة._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 19. المؤشر المرجعي (تاسي) — خط أساس مقارنة الأداء
    // ════════════════════════════════════════════════════════
    book('B');
    await tick('مؤشر تاسي');
    h2('19. المؤشر المرجعي (تاسي TASI) — مقارنة الأداء');
    p('نقاط مؤشر السوق المُدخَلة يدوياً في صفحة الأداء التاريخي، تُستخدم كخط أساس لقياس أداء المحفظة مقابل السوق.');

    if (Array.isArray(benchmark) && benchmark.length) {
      const bm = [...benchmark].filter(e => e && e.date).sort((a, b) => a.date.localeCompare(b.date));
      if (bm.length) {
        const first = bm[0], last = bm[bm.length - 1];
        const chg = +first.value > 0 ? (+last.value - +first.value) / +first.value * 100 : 0;
        p(`**عدد النقاط:** ${bm.length} | **من** ${first.date} (${N(first.value)}) **إلى** ${last.date} (${N(last.value)})  `);
        p(`**تغيّر المؤشر خلال الفترة:** ${(chg >= 0 ? '+' : '') + PCT(chg)}`);
        const bRows = bm.map((e, i) => {
          const prev = i > 0 ? +bm[i - 1].value : null;
          const d = prev && prev > 0 ? (+e.value - prev) / prev * 100 : null;
          return [e.date, N(e.value), d == null ? '—' : ((d >= 0 ? '+' : '') + PCT(d))];
        });
        p(mdTable(['التاريخ', 'قيمة المؤشر', 'التغير عن النقطة السابقة'], bRows));
      } else {
        p('_لا توجد نقاط صالحة للمؤشر المرجعي._');
      }
    } else {
      p('_لم تُدخَل بيانات للمؤشر المرجعي (تاسي) بعد._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 20. مخزون المنزل
    // ════════════════════════════════════════════════════════
    book('C');
    await tick('الجرد');
    h2('20. مخزون المنزل (Inventory)');
    p('قائمة محتويات المنزل والمقتنيات بقيمتها التقديرية — مفيد للتأمين والجرد الكامل.');
    {
      const inventory = lsGet('inventory_v1', []);
      if (Array.isArray(inventory) && inventory.length) {
        const totalVal = inventory.reduce((s, i) => s + ((+i.value || 0) * (+i.qty || 1)), 0);
        const good    = inventory.filter(i => i.cond === 'جيد').length;
        const replace = inventory.filter(i => i.cond === 'للاستبدال').length;
        const missing = inventory.filter(i => i.cond === 'مفقود').length;
        p(`**إجمالي العناصر:** ${inventory.length} | **جيد:** ${good} | **للاستبدال:** ${replace} | **مفقود:** ${missing}  `);
        p(`**القيمة التقديرية الإجمالية:** ${SAR(totalVal)} ر.س`);
        const catMap = {};
        inventory.forEach(i => {
          const cat = i.cat || 'غير مصنف';
          if (!catMap[cat]) catMap[cat] = [];
          catMap[cat].push(i);
        });
        Object.entries(catMap).sort(([a],[b]) => a.localeCompare(b)).forEach(([cat, items]) => {
          h3(cat);
          const rows = items.map(i => [
            i.name || '—', i.loc || '—', i.cond || '—',
            String(+i.qty || 1),
            i.value ? SAR((+i.value) * (+i.qty || 1)) : '—',
            (i.notes || '').replace(/\n/g, ' ').slice(0, 80),
          ]);
          p(mdTable(['الاسم', 'الموقع', 'الحالة', 'الكمية', 'القيمة', 'ملاحظات'], rows));
        });
      } else {
        p('_لا توجد عناصر مسجّلة في مخزون المنزل._');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 21. المتابعة المدرسية
    // ════════════════════════════════════════════════════════
    book('C');
    await tick('المدرسة');
    h2('21. المتابعة المدرسية (School Tracker)');
    p('بيانات كل طفل: الملف الشخصي، الأهداف الحياتية والدراسية، الدرجات، الغياب.');
    {
      const schoolData = await syncedGet('school_tracker_v2', { children: [] });
      const children = schoolData.children || [];
      if (children.length) {
        p(`**عدد الأطفال:** ${children.length}`);
        children.forEach(c => {
          h3(`${c.emoji || '👧'} ${c.name}`);
          const prof = [];
          if (c.birth)  prof.push(`تاريخ الميلاد: ${c.birth}`);
          if (c.school) prof.push(`المدرسة: ${c.school}`);
          if (c.grade)  prof.push(`الصف: ${c.grade}`);
          if (c.notes)  prof.push(`ملاحظات: ${c.notes}`);
          if (prof.length) p(prof.join(' | '));
          if (c.extraFields?.length)
            p('**بيانات إضافية:** ' + c.extraFields.map(f => `${f.label}: ${f.value}`).join(' | '));

          // الأهداف الحياتية
          if ((c.lifeGoals || []).length) {
            p('\n**الأهداف الحياتية:**');
            p(mdTable(
              ['الهدف','الفئة','الأولوية','الحالة','الإنجاز','السنة','التكلفة','ملاحظات'],
              c.lifeGoals.map(g => [
                g.desc||'—', g.cat||'—', g.priority||'—', g.status||'—',
                `${+g.progress||0}%`, g.year||'—',
                g.amount ? SAR(g.amount) : '—',
                (g.notes||'').replace(/\n/g,' ').slice(0,50),
              ])
            ));
          }

          // الأهداف الدراسية
          if ((c.schoolGoals || []).length) {
            p('\n**الأهداف الدراسية:**');
            p(mdTable(
              ['الهدف','الفئة','الأولوية','الحالة','الإنجاز','السنة','ملاحظات'],
              c.schoolGoals.map(g => [
                g.desc||'—', g.cat||'—', g.priority||'—', g.status||'—',
                `${+g.progress||0}%`, g.year||'—',
                (g.notes||'').replace(/\n/g,' ').slice(0,50),
              ])
            ));
          }

          // الدرجات
          const years    = c.years    || [];
          const subjects = c.subjects || [];
          const grds     = c.grades   || {};
          if (years.length && subjects.length) {
            p('\n**الدرجات الدراسية:**');
            years.forEach(y => {
              p(`\n*${y.label || y.id}${y.class ? ' — الصف: ' + y.class : ''}${y.school ? ' — ' + y.school : ''}*`);
              const terms = y.terms || [{ id: 't1', label: 'الفصل الأول' }, { id: 't2', label: 'الفصل الثاني' }];
              const yg = grds[y.id] || {};
              const gradeRows = subjects.map(s => {
                const sg = yg[s.id] || {};
                const scores = terms.map(t => { const sc = sg[t.id]; return sc != null ? String(sc) : '—'; });
                const nums = scores.filter(v => v !== '—').map(Number);
                const avg = nums.length ? (nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(1) : '—';
                return [s.name || s.id, ...scores, avg];
              });
              p(mdTable(['المادة', ...terms.map(t => t.label), 'المعدل'], gradeRows));
            });
          }

          // الغياب (أحدث 20 سجل)
          const att = c.attendance || [];
          if (att.length) {
            p(`\n**سجل الغياب والحضور** (${att.length} سجل — آخر 20):`);
            p(mdTable(
              ['التاريخ','النوع','المادة','ملاحظات'],
              att.slice(-20).map(a => [a.date||'—', a.type||'—', a.subject||'—', (a.notes||'—').slice(0,60)])
            ));
          }

          // الاختبارات
          const exams = c.exams || [];
          if (exams.length) {
            p(`\n**الاختبارات** (${exams.length}):`);
            p(mdTable(
              ['التاريخ','المادة','الدرجة','من','ملاحظات'],
              exams.map(e => [e.date||'—', e.subject||'—', e.score!=null?String(e.score):'—', e.maxScore!=null?String(e.maxScore):'—', (e.notes||'—').slice(0,60)])
            ));
          }
        });
      } else {
        p('_لا توجد بيانات أطفال مسجّلة._');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 22. متابعة كندة (School Kanda)
    // ════════════════════════════════════════════════════════
    book('C');
    await tick('متابعة كندة');
    h2('22. متابعة كندة الخاصة (School Kanda)');
    {
      const kanda = lsGet('school_kanda_v1', { profile:{name:'كندة',birth:''}, lifeGoals:[], schoolGoals:[], years:[], subjects:[], grades:{} });
      const kp = kanda.profile || {};
      p(`**الاسم:** ${kp.name || 'كندة'}${kp.birth ? ' | تاريخ الميلاد: ' + kp.birth : ''}`);

      if ((kanda.lifeGoals||[]).length) {
        p('\n**الأهداف الحياتية:**');
        p(mdTable(['الهدف','السنة','الحالة'], kanda.lifeGoals.map(g => [g.desc||'—', g.year||'—', g.status||'—'])));
      }
      if ((kanda.schoolGoals||[]).length) {
        p('\n**الأهداف الدراسية:**');
        p(mdTable(['الهدف','السنة','الحالة'], kanda.schoolGoals.map(g => [g.desc||'—', g.year||'—', g.status||'—'])));
      }

      const ky = kanda.years || [], ks = kanda.subjects || [], kg = kanda.grades || {};
      if (ky.length && ks.length) {
        p('\n**الدرجات الدراسية:**');
        ky.forEach(y => {
          p(`\n*${y.label || y.id}${y.class ? ' — الصف: ' + y.class : ''}${y.school ? ' — ' + y.school : ''}*`);
          const yg = kg[y.id] || {};
          p(mdTable(
            ['المادة','الفصل 1','الفصل 2','الفصل 3','المعدل'],
            ks.map(s => {
              const sg = yg[s.id] || {};
              const v = [sg.t1, sg.t2, sg.t3];
              const nums = v.filter(x => x != null);
              const avg = nums.length ? (nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(1) : '—';
              return [s.name||s.id, v[0]!=null?String(v[0]):'—', v[1]!=null?String(v[1]):'—', v[2]!=null?String(v[2]):'—', avg];
            })
          ));
        });
      }

      if (!(kanda.lifeGoals||[]).length && !(kanda.schoolGoals||[]).length && !ky.length)
        p('_لا توجد بيانات مسجّلة لمتابعة كندة._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 23. سجل حاسبة القيمة العادلة
    // ════════════════════════════════════════════════════════
    book('A');
    await tick('سجل التقييمات');
    h2('23. سجل حاسبة القيمة العادلة للأسهم');
    p('جميع عمليات التقييم المحفوظة — المدخلات الكاملة (شركة عادية / ريت / بنك)، الملاحظات، تقييم Perplexity، Beta، ونتائج كل نموذج لكل عملية. المصدر: قاعدة البيانات السحابية (user_settings) مع رجوع للنسخة المحلية.');
    {
      // مصدر الحقيقة الآن user_settings (الصفحة لم تعد تكتب في localStorage) مع رجوع للكاش المحلي
      const valHist = await syncedGet('valuation_history_v1', []);
      // خلية جدول آمنة في markdown: نهرب الأنابيب ونزيل الأسطر الجديدة
      const cell = v => String(v == null ? '—' : v).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
      if (Array.isArray(valHist) && valHist.length) {
        p(`**إجمالي العمليات المحفوظة:** ${valHist.length}`);
        const scenMap = { realistic:'واقعي', optimistic:'متفائل', conservative:'محتاط' };
        const typeMap = { reit:'ريت عقاري', bank:'بنك / مصرف', normal:'شركة عادية' };
        valHist.forEach((entry, idx) => {
          const inp = entry.inputs || {};
          const res = entry.results || {};
          const typeLabel = typeMap[inp.companyType] || 'شركة عادية';
          const idLine = [inp.ticker, inp.stockName].filter(Boolean).join(' — ');
          p(`\n---\n**[${idx + 1}] ${idLine || 'بدون رمز'}**  `);
          p(`🕐 ${entry.date || '—'} — ${typeLabel} — سيناريو: ${scenMap[inp.scenario] || inp.scenario || '—'}  `);
          p(`**القيمة العادلة: ${cell(res.fairValueRange) || '—'}**  `);
          if (res.fairValueAvg != null) p(`متوسط القيمة العادلة (رقمي): ${SAR(res.fairValueAvg)} ر.س  `);
          if (res.fairValueDetail) p(`${cell(res.fairValueDetail)}  `);
          if (res.marginText)      p(`هامش الأمان: ${cell(res.marginText)}  `);

          // المدخلات كاملة — كل خانة في الحاسبة
          const inputPairs = [];
          if (inp.companyType === 'reit') {
            if (inp.nav          != null) inputPairs.push(['NAV الإجمالي', Number(inp.nav).toLocaleString()]);
            if (inp.totalUnits   != null) inputPairs.push(['عدد الوحدات', Number(inp.totalUnits).toLocaleString()]);
            if (inp.ffo          != null) inputPairs.push(['FFO/وحدة', inp.ffo]);
            if (inp.pffoMultiple != null) inputPairs.push(['مضاعف P/FFO', inp.pffoMultiple + 'x']);
            if (inp.capRate      != null) inputPairs.push(['Cap Rate', inp.capRate + '%']);
            if (inp.totalDebt    != null) inputPairs.push(['إجمالي الديون', Number(inp.totalDebt).toLocaleString()]);
          } else if (inp.companyType === 'bank') {
            if (inp.bvps          != null) inputPairs.push(['BVPS (دفترية ملموسة/سهم)', inp.bvps]);
            if (inp.bankRoe       != null) inputPairs.push(['ROE', inp.bankRoe + '%']);
            if (inp.bankCurrentPb != null) inputPairs.push(['P/B الحالي', inp.bankCurrentPb + 'x']);
            if (inp.bankFairPb    != null) inputPairs.push(['P/B العادل', inp.bankFairPb + 'x']);
            if (inp.bankEps       != null) inputPairs.push(['EPS', inp.bankEps]);
            if (inp.bankCurrentPe != null) inputPairs.push(['P/E الحالي', inp.bankCurrentPe + 'x']);
            if (inp.bankFairPe    != null) inputPairs.push(['P/E العادل', inp.bankFairPe + 'x']);
            if (inp.bankDps       != null) inputPairs.push(['DPS (توزيع/سهم)', inp.bankDps]);
            if (inp.bankPayout    != null) inputPairs.push(['نسبة التوزيع Payout', inp.bankPayout + '%']);
            if (inp.cet1          != null) inputPairs.push(['CET1 / CAR', inp.cet1 + '%']);
            if (inp.npl           != null) inputPairs.push(['NPL (قروض متعثرة)', inp.npl + '%']);
            if (inp.provCoverage  != null) inputPairs.push(['تغطية المخصصات', inp.provCoverage + '%']);
            if (inp.ldr           != null) inputPairs.push(['LDR (قروض/ودائع)', inp.ldr + '%']);
          } else {
            if (inp.eps     != null) inputPairs.push(['EPS (ربح/سهم)', inp.eps]);
            if (inp.fcf     != null) inputPairs.push(['FCF (تدفق نقدي حر/سهم)', inp.fcf]);
            if (inp.netDebt != null) inputPairs.push(['الدين الصافي/سهم', inp.netDebt]);
          }
          // مدخلات مشتركة
          if (inp.growth5yr    != null) inputPairs.push(['نمو 5 سنوات', inp.growth5yr + '%']);
          if (inp.growthPerp   != null) inputPairs.push(['نمو دائم', inp.growthPerp + '%']);
          if (inp.discountRate != null) inputPairs.push(['WACC / معدل الخصم', inp.discountRate + '%']);
          if (inp.currentPe    != null) inputPairs.push(['P/E الحالي', inp.currentPe]);
          if (inp.sectorPe     != null) inputPairs.push(['P/E القطاع', inp.sectorPe]);
          if (inp.dividends    != null) inputPairs.push(['توزيعات/سهم', inp.dividends]);
          if (inp.bookValue    != null) inputPairs.push(['القيمة الدفترية/سهم', inp.bookValue]);
          if (inp.bondYield    != null) inputPairs.push(['عائد السندات', inp.bondYield + '%']);
          if (inp.currentPrice != null) inputPairs.push(['السعر الحالي', inp.currentPrice]);
          if (inp.fairPb       != null) inputPairs.push(['P/B العادل', inp.fairPb]);
          if (inp.betaMain     != null && inp.betaMain !== '') inputPairs.push(['Beta (للتسجيل)', inp.betaMain]);
          if (inp.debtRatio    != null) inputPairs.push(['نسبة الدين', inp.debtRatio + '%']);
          if (inp.liquidityRatio != null) inputPairs.push(['نسبة السيولة', inp.liquidityRatio]);
          if (inp.earningsQuality != null) inputPairs.push(['ROE (عرض)', inp.earningsQuality + '%']);
          if (inp.useWacc) {
            if (inp.riskFree     != null) inputPairs.push(['معدل خالي مخاطر', inp.riskFree + '%']);
            if (inp.beta         != null) inputPairs.push(['Beta (WACC)', inp.beta]);
            if (inp.marketReturn != null) inputPairs.push(['عائد السوق', inp.marketReturn + '%']);
            if (inp.debtCost     != null) inputPairs.push(['تكلفة الدين', inp.debtCost + '%']);
            if (inp.taxRate      != null) inputPairs.push(['معدل الضريبة', inp.taxRate + '%']);
            if (inp.debtEquity   != null) inputPairs.push(['D/E', inp.debtEquity]);
          }

          if (inputPairs.length)
            p(mdTable(['المدخل','القيمة'], inputPairs.map(([k, v]) => [k, cell(v)])));

          // نتائج كل نموذج
          if (res.models?.length)
            p(mdTable(['النموذج','القيمة العادلة'], res.models.map(m => [cell(m.name), cell(m.value)])));

          // الملاحظات وتقييم Perplexity — نص حر يُعرض كاملاً (blockquote يحافظ على المحتوى)
          if (inp.notes) {
            p('**📝 ملاحظات التقييم:**');
            p(String(inp.notes).split('\n').map(l => `> ${l}`).join('\n'));
          }
          if (inp.perplexityEval) {
            p('**🔍 تقييم Perplexity:**');
            p(String(inp.perplexityEval).split('\n').map(l => `> ${l}`).join('\n'));
          }
        });
      } else {
        p('_لا توجد عمليات محفوظة في سجل القيمة العادلة._');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 24. مرفقات دفتر المراجعة
    // ════════════════════════════════════════════════════════
    book('C');
    await tick('المرفقات');
    h2('24. مرفقات دفتر المراجعة (Review Log Attachments)');
    p('قائمة الملفات المرفقة بمراجعات الأسهم — metadata فقط؛ المحتوى الثنائي محفوظ في قاعدة البيانات ويُستعاد بالنسخة الاحتياطية JSON.');
    if (reviewAttachments.length) {
      p(`**إجمالي المرفقات:** ${reviewAttachments.length} ملف`);
      const attRows = reviewAttachments.map(a => {
        const entry    = reviewLog.find(r => r.id === a.entry_id);
        const label    = entry ? `${entry.ticker} — ${entry.review_date}` : String(a.entry_id || '—');
        const sizeStr  = a.size_bytes ? (a.size_bytes / 1024).toFixed(1) + ' KB' : '—';
        return [a.filename || '—', a.ext || '—', sizeStr, label, (a.created_at || '—').slice(0,10)];
      });
      p(mdTable(['اسم الملف','الامتداد','الحجم','المراجعة المرتبطة','تاريخ الرفع'], attRows));
    } else {
      p('_لا توجد مرفقات في دفتر المراجعة._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 25. إعدادات التطبيق
    // ════════════════════════════════════════════════════════
    book('C');
    await tick('الإعدادات');
    h2('25. إعدادات التطبيق');
    p('الإعدادات الشخصية المحفوظة محلياً في المتصفح.');
    {
      const get = k => localStorage.getItem(userLsKey(k)) ?? localStorage.getItem(k);
      const alertGreen  = get('tharwa-alert-green')  ?? '1';
      const alertYellow = get('tharwa-alert-yellow') ?? '3';
      const theme       = get('tharwa-theme')        ?? 'dark';
      const zoom        = get('tharwa-zoom')         ?? '16';
      p('```');
      p(`الثيم (dark/light)        : ${theme}`);
      p(`حجم الخط (zoom)           : ${zoom}px`);
      p(`حد تنبيه أخضر  ≤          : ${alertGreen}%`);
      p(`حد تنبيه أصفر  ≤          : ${alertYellow}%`);
      p(`حد تنبيه أحمر  >          : ${alertYellow}%`);
      p('```');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 26. محرّك القرار
    // ════════════════════════════════════════════════════════
    book('A');
    await tick('محرّك القرار');
    h2('26. محرّك القرار (Decision Engine) — تطبيق دستور المحفظة آلياً');
    p('يطبّق القواعد الثابتة في الدستور (CLAUDE.md) على بيانات المحفظة الحيّة. اللقطة أدناه تُحفظ آلياً عند كل فتح لصفحة «محرّك القرار». لتحديثها بأحدث الأسعار: افتح الصفحة مرة واحدة ثم أعد تصدير هذا التقرير.');
    {
      const cell   = v => String(v == null ? '—' : v).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
      const deSnap = await syncedGet('decision_engine_snapshot_v1', null);
      const deCfg  = await syncedGet('decision_engine_v1', {});

      if (deSnap && Array.isArray(deSnap.results) && deSnap.results.length) {
        p(`**تاريخ آخر تشغيل للمحرّك:** ${deSnap.generated_at ? new Date(deSnap.generated_at).toLocaleString('ar-SA') : '—'}  `);
        p(`**إجمالي قيمة المحفظة وقت التشغيل:** ${SAR(deSnap.totalValue)} ر.س`);

        h3('الثوابت والقواعد المطبّقة (الدستور §1)');
        p('```');
        p(`سقف السهم الواحد            : ${deSnap.caps?.single}%`);
        p(`سقف السهم القيادي (Blue)    : ${deSnap.caps?.blueChip}%`);
        p(`سقف القطاع                  : ${deSnap.caps?.sector}%`);
        p(`حجم المحفظة المستهدف        : ${deSnap.portfolioSize?.min}–${deSnap.portfolioSize?.max} سهم (الحالي: ${deSnap.portfolioSize?.current})`);
        p(`عتبة انحراف الوزن — أخضر ≤  : ${deSnap.thresholds?.green}%`);
        p(`عتبة انحراف الوزن — أصفر ≤  : ${deSnap.thresholds?.yellow}%`);
        p('```');

        if (deSnap.fixedTriggers?.length) {
          h3('المشغّلات الثابتة (Fixed Triggers) — أولوية عليا فوق كل حساب');
          p(mdTable(['الرمز','الاسم','النوع','الشرط','الوصف'],
            deSnap.fixedTriggers.map(t => [
              t.ticker, t.name,
              t.kind === 'sell' ? 'بيع كامل' : 'تخفيف وزن',
              `${t.cmp === 'gte' ? '≥' : '≤'} ${t.price} ر.س${t.toWeight ? ` → ${t.toWeight}%` : ''}`,
              cell(t.label),
            ])));
        }

        h3('دليل أعمدة جدول القرار — كيف تُحسب كل قيمة');
        p('- **الوزن الحالي** = (عدد الأسهم × السعر الحالي) ÷ إجمالي قيمة المحفظة × 100');
        p('- **الهدف** = نسبة السهم المسجّلة في صفحة «أهداف الأسهم» فقط. إن لم تُسجَّل يُعرَض «بلا هدف · سقف X%» (لا يُلفَّق هدف من السقف)');
        p('- **السقف الدستوري** = حدّ صلب 7% عادي / 12% قيادي (§1)؛ كسره يفرض التخفيف ولو بلا هدف مسجّل');
        p('- **الانحراف** = الوزن الحالي − الهدف (+ فوق الهدف / − تحته)، مصنّف بعتبات الألوان');
        p('- **نوع الأصل** = يُستنتج من القطاع (ريت/بنك/إسمنت-بتروكيماويات/عام) أو يُحدَّد يدوياً');
        p('- **الاستدامة** = بوابة الفلتر 1 (نجاح/قلق مؤقت/فشل/غير متوفرة) حسب مقياس نوع الأصل');
        p('- **القيمة العادلة** = آخر تقييم من حاسبة القيمة العادلة لنفس الرمز (+ عمره بالأيام)');
        p('- **الإجراء** = مخرَج الفلاتر المتسلسلة؛ و**السبب** يوضّح القاعدة التي أطلقته');

        h3('قرارات كل سهم (مرتّبة بالأولوية)');
        const ACT = { exit:'🔴 تصفية', trim:'⚖️ تخفيف', add:'🟢 تجميع', monitor:'👁️ مراقبة', hold:'✅ احتفاظ' };
        const SUS = { pass:'نجاح', watch:'قلق مؤقت', fail:'فشل', unknown:'غير متوفرة' };
        const sorted = [...deSnap.results].sort((a, b) => (a.priority - b.priority) || (b.weight - a.weight));
        const deRows = sorted.map(r => {
          // الهدف: إن لم يُسجَّل في صفحة الأهداف يُعرَض «بلا هدف · سقف X%» بدل رقم ملفّق
          const tgtCell = r.hasTarget === false
            ? `بلا هدف · سقف ${PCT(r.cap)}`
            : (r.targetWeight != null ? PCT(r.targetWeight) : (r.cap != null ? `سقف ${PCT(r.cap)}` : '—'));
          const devCell = r.dev != null ? ((r.dev >= 0 ? '+' : '') + PCT(r.dev)) : (r.overCap ? '⚠️ كسر السقف' : '—');
          return [
            r.ticker, r.name || '—',
            deSnap.assetLabels?.[r.assetType] || r.assetType || '—',
            PCT(r.weight), tgtCell, devCell,
            SUS[r.sustain?.status] || '—',
            r.fairValue != null ? SAR(r.fairValue) : '—',
            ACT[r.action] || r.action, cell(r.label),
          ];
        });
        p(mdTable(['الرمز','الاسم','نوع الأصل','الوزن%','الهدف%','الانحراف','الاستدامة','القيمة العادلة','الإجراء','التفصيل'], deRows));

        h3('الأسباب التفصيلية لكل قرار');
        sorted.forEach(r => {
          p(`**${r.ticker} — ${r.name || ''}** → ${ACT[r.action] || r.action} (${cell(r.label)})  `);
          p(`> ${cell(r.reason || '—')}`);
          const extra = [];
          if (r.zones) {
            const z = [
              r.zones.accumulate ? `تجميع ≤${r.zones.accumulate}` : null,
              r.zones.trimFrom   ? `تخفيف ${r.zones.trimFrom}${r.zones.trimTo ? '–' + r.zones.trimTo : ''}` : null,
              r.zones.liquidate  ? `تصفية >${r.zones.liquidate}` : null,
            ].filter(Boolean).join(' · ');
            if (z) extra.push('خطة الأسعار (المهام): ' + z);
          }
          if (r.sustain?.reason) extra.push('الاستدامة: ' + r.sustain.reason);
          if (r.valDate) extra.push(`آخر قيمة عادلة: ${r.valDate}${r.valAgeDays != null ? ` (${r.valAgeDays} يوم${r.valStale ? ' — قديم ⚠️' : ''})` : ''}`);
          if (r.gaps?.length) extra.push('بيانات ناقصة: ' + r.gaps.join('، '));
          if (r.specialNote) extra.push('ملاحظة دستورية: ' + r.specialNote);
          if (r.trigger?.fired) extra.push('⚡ انطبق trigger ثابت');
          if (extra.length) p(extra.map(e => `> - ${cell(e)}`).join('\n'));
          p('');
        });
      } else {
        p('_لا توجد لقطة محفوظة لمحرّك القرار بعد. افتح صفحة «محرّك القرار» مرة واحدة ثم أعد تصدير التقرير._');
      }

      // المدخلات اليدوية المحفوظة للمحرّك
      if (deCfg && typeof deCfg === 'object' && Object.keys(deCfg).length) {
        h3('المدخلات اليدوية المحفوظة للمحرّك (لكل رمز)');
        p('قرارات المالك اليدوية المحفوظة لكل سهم (نوع الأصل، علم القيادي، حالة الاستدامة، القيمة العادلة اليدوية، الملاحظات).');
        Object.entries(deCfg).forEach(([tk, cfg]) => {
          if (!cfg || typeof cfg !== 'object') return;
          const pairs = Object.entries(cfg)
            .filter(([, v]) => v != null && v !== '')
            .map(([k, v]) => [k, cell(typeof v === 'object' ? JSON.stringify(v) : v)]);
          if (pairs.length) { p(`**${tk}:**`); p(mdTable(['الحقل','القيمة'], pairs)); }
        });
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 27. تقييم أمان المحفظة (Portfolio Safety Rating)
    // ════════════════════════════════════════════════════════
    book('A');
    await tick('تقييم الأمان');
    h2('27. تقييم أمان المحفظة (Portfolio Safety Rating)');
    p('لقطة آخر حساب من صفحة «تقييم أمان المحفظة». الدرجة من 10، مبنية على مدخلات يدوية يحفظها المالك. تُحدَّث آلياً عند كل حساب في تلك الصفحة.');
    {
      const cell = v => String(v == null ? '—' : v).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
      const rat  = await syncedGet('portfolio_rating_snapshot_v1', null);
      if (rat && rat.score != null) {
        p(`**الدرجة:** ${(+rat.score).toFixed(1)} / 10  `);
        p(`**التقييم:** ${cell(rat.evaluation)}  `);
        p(`**تاريخ آخر حساب:** ${rat.generated_at ? new Date(rat.generated_at).toLocaleString('ar-SA') : '—'}`);

        const RAT_LABELS = {
          individualStocks:'عدد الأسهم المنفردة', reitCount:'عدد صناديق الريت',
          etfCount:'عدد صناديق المؤشرات ETF', bondCount:'عدد الصكوك/السندات',
          largestStockPercentage:'% أكبر سهم', largestSectorPercentage:'% أكبر قطاع',
          geographicDistribution:'التوزيع الجغرافي', goldPercentage:'نسبة الذهب/التحوط',
          hasCash:'احتياطي كاش', sectorDiversification:'التنوع القطاعي',
          investmentHorizon:'أفق الاستثمار', usesLeverage:'رافعة مالية', leverageRatio:'نسبة الرافعة %',
        };
        const RAT_VALMAP = {
          geographicDistribution:{ diversified:'متنوع عالمياً', international:'دولي', regional:'إقليمي', 'local-only':'محلي فقط' },
          goldPercentage:{ high:'مرتفعة', medium:'متوسطة', low:'منخفضة', none:'لا يوجد' },
          hasCash:{ yes:'نعم', no:'لا' },
          sectorDiversification:{ 'single-sector':'قطاع واحد', '2-4-sectors':'2–4 قطاعات', '5-7-sectors':'5–7 قطاعات', '8-plus-sectors':'8+ قطاعات' },
          investmentHorizon:{ long:'طويل', medium:'متوسط', short:'قصير' },
          usesLeverage:{ yes:'نعم', no:'لا' },
        };
        const inp = rat.inputs || {};
        const inRows = Object.keys(RAT_LABELS)
          .filter(k => inp[k] != null && inp[k] !== '')
          .map(k => [RAT_LABELS[k], cell(RAT_VALMAP[k]?.[inp[k]] ?? inp[k])]);
        if (inRows.length) { h3('المدخلات'); p(mdTable(['المدخل','القيمة'], inRows)); }

        if (Array.isArray(rat.breakdown) && rat.breakdown.length) {
          h3('تفصيل النقاط');
          p(mdTable(['البند','الدرجة','الحد الأقصى'],
            rat.breakdown.map(b => [
              cell(b.label),
              (b.value >= 0 ? '+' : '') + (+b.value).toFixed(2),
              b.max != null ? (+b.max).toFixed(2) : (b.isPenalty ? 'خصم' : '—'),
            ])));
        }
      } else {
        p('_لا توجد لقطة محفوظة لتقييم الأمان. افتح صفحة «تقييم أمان المحفظة» واحسب مرة واحدة ثم أعد تصدير التقرير._');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 28. مواعيد آخر تحديث لأسعار الأسهم
    // ════════════════════════════════════════════════════════
    book('A');
    await tick('طزاجة الأسعار');
    h2('28. مواعيد آخر تحديث لأسعار الأسهم (Price Freshness)');
    p('تاريخ آخر تحديث يدوي للسعر لكل رمز — يقيس طزاجة بيانات الأسعار. يُعتبر السعر «قديماً» بعد 7 أيام.');
    {
      const ts   = lsGet('tharwa-price-timestamps', {});
      const keys = ts && typeof ts === 'object' ? Object.keys(ts) : [];
      if (keys.length) {
        const rows = keys.map(tk => {
          const t   = new Date(ts[tk]);
          const age = (Date.now() - t.getTime()) / 86400000;
          const h   = holdings.find(x => x.ticker === tk);
          return { tk, name: h?.name || '—', iso: ts[tk], age, stale: age > 7 };
        }).sort((a, b) => b.age - a.age);
        p(mdTable(['الرمز','الاسم','آخر تحديث','منذ (يوم)','الحالة'],
          rows.map(r => [
            r.tk, r.name, new Date(r.iso).toLocaleString('ar-SA'),
            r.age.toFixed(1), r.stale ? '🔴 قديم (>7 أيام)' : '🟢 حديث',
          ])));
        const staleN = rows.filter(r => r.stale).length;
        p(`\n**${rows.length}** رمز لها طابع زمني | **${staleN}** قديم (>7 أيام).`);
      } else {
        p('_لا توجد طوابع زمنية لأسعار الأسهم بعد._');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 29. الأداء التفصيلي — العائد المعدَّل بالزمن (TWR)
    // ════════════════════════════════════════════════════════
    book('B');
    await tick('العائد المعدَّل بالزمن');
    h2('29. الأداء التفصيلي — العائد المعدَّل بالزمن (TWR)');
    p('العائد المعدَّل بالزمن (Time-Weighted Return، معيار GIPS بطريقة Modified Dietz) يعزل أداء قراراتك الاستثمارية بإزالة أثر الإيداعات والسحوبات. الأساس = 100 عند أول لقطة صافي ثروة. (مطابق لمنطق صفحة الأداء.)');
    {
      // مطابقة _deduplicateSnapsByDay + _computeTWR في performance.js
      const _dedupSnaps = (snaps) => {
        const byDate = {};
        for (const s of snaps) {
          const existing = byDate[s.date];
          if (!existing) { byDate[s.date] = s; continue; }
          const isManual  = s.notes && !s.notes.startsWith('auto');
          const wasManual = existing.notes && !existing.notes.startsWith('auto');
          if (isManual && !wasManual) { byDate[s.date] = s; continue; }
          if (!wasManual && !isManual) byDate[s.date] = s;
        }
        return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
      };
      const _twr = (snaps, cfsIn) => {
        const sorted = _dedupSnaps(snaps);
        if (!sorted.length) return { twrMap: {}, sorted: [] };
        const cfs = cfsIn.slice().sort((a, b) => a.date.localeCompare(b.date));
        const twrMap = {}; let factor = 1.0; twrMap[sorted[0].date] = 100;
        for (let i = 1; i < sorted.length; i++) {
          const sD = sorted[i - 1].date, eD = sorted[i].date;
          const sV = +sorted[i - 1].total_value, eV = +sorted[i].total_value;
          const netCF = cfs.filter(c => c.date > sD && c.date <= eD)
            .reduce((s, c) => s + (c.type === 'deposit' ? +c.amount : -+c.amount), 0);
          const denom = sV + netCF / 2;
          if (denom > 0) { const r = (eV - sV - netCF) / denom; factor *= (1 + r); }
          twrMap[sorted[i].date] = +(factor * 100).toFixed(3);
        }
        return { twrMap, sorted };
      };

      if (snapshots.length >= 2) {
        const { twrMap, sorted } = _twr(snapshots, cashflows);
        const lastIdx  = twrMap[sorted[sorted.length - 1].date];
        const totalTWR = lastIdx - 100;
        const days     = (parseDateLocal(sorted[sorted.length - 1].date) - parseDateLocal(sorted[0].date)) / 86400000;
        const years    = days / 365;
        const annTWR   = years > 0.08 && lastIdx > 0 ? (Math.pow(lastIdx / 100, 1 / years) - 1) * 100 : null;

        p(`**الفترة:** ${sorted[0].date} ← ${sorted[sorted.length - 1].date} (${years.toFixed(1)} سنة، ${sorted.length} لقطة)  `);
        p(`**إجمالي عائد TWR:** ${(totalTWR >= 0 ? '+' : '') + PCT(totalTWR)}  `);
        if (annTWR != null) p(`**عائد TWR السنوي المركّب:** ${(annTWR >= 0 ? '+' : '') + PCT(annTWR)}`);

        // العوائد الشهرية — آخر مؤشر في كل شهر
        h3('العوائد الشهرية (TWR)');
        const monthEnd = {};
        sorted.forEach(s => { monthEnd[s.date.slice(0, 7)] = twrMap[s.date]; });
        const months = Object.keys(monthEnd).sort();
        let prevIdx = null;
        const mRows = months.map(m => {
          const idx = monthEnd[m];
          const ret = prevIdx != null && prevIdx > 0 ? (idx - prevIdx) / prevIdx * 100 : null;
          prevIdx = idx;
          return [m, N(idx), ret == null ? '—' : ((ret >= 0 ? '+' : '') + PCT(ret))];
        });
        p(mdTable(['الشهر','مؤشر TWR (=100 بداية)','عائد الشهر'], mRows));

        // مقارنة بمؤشر تاسي
        h3('مقارنة بمؤشر تاسي');
        const bmSorted = [...(Array.isArray(benchmark) ? benchmark : [])]
          .filter(e => e && e.date).sort((a, b) => a.date.localeCompare(b.date));
        if (bmSorted.length >= 2) {
          const tasiAt = (date) => { const pr = bmSorted.filter(e => e.date <= date); return pr.length ? +pr[pr.length - 1].value : null; };
          const twrAt  = (date) => { const pr = sorted.filter(s => s.date <= date); return pr.length ? twrMap[pr[pr.length - 1].date] : null; };
          const startDate = sorted[0].date < bmSorted[0].date ? bmSorted[0].date : sorted[0].date;
          const endDate   = sorted[sorted.length - 1].date;
          const twrStart  = twrAt(startDate) ?? 100;
          const tasiStart = tasiAt(startDate), tasiEnd = tasiAt(endDate);
          const portDelta = twrStart > 0 ? (lastIdx / twrStart * 100 - 100) : null;
          const tasiDelta = (tasiStart && tasiEnd && tasiStart > 0) ? (tasiEnd - tasiStart) / tasiStart * 100 : null;
          if (portDelta != null && tasiDelta != null) {
            const alpha = portDelta - tasiDelta;
            p(mdTable(['المقياس','القيمة'], [
              ['الفترة المشتركة', `${startDate} ← ${endDate}`],
              ['عائد محفظتك (TWR)', (portDelta >= 0 ? '+' : '') + PCT(portDelta)],
              ['عائد تاسي (سعري)',  (tasiDelta >= 0 ? '+' : '') + PCT(tasiDelta)],
              ['الفارق (ألفا، سعري)', (alpha >= 0 ? '+' : '') + PCT(alpha)],
            ]));
            p('_ملاحظة منهجية: عائد محفظتك TWR يشمل توزيعاتك، بينما تاسي هنا سعري فقط (لا يشمل التوزيعات). للمقارنة العادلة أضف عائد توزيعات تاسي التقديري ~3.5%/سنة._');
          } else {
            p('_تعذّرت المقارنة — بيانات تاسي لا تغطي فترة المحفظة._');
          }
        } else {
          p('_لا توجد بيانات كافية لمؤشر تاسي للمقارنة (انظر القسم 19)._');
        }
      } else {
        p('_تحتاج لقطتَي صافي ثروة على الأقل لحساب TWR. أضِف لقطات من صفحة صافي الثروة._');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // مساعدات مشتركة للأقسام التحليلية 30–33
    // ════════════════════════════════════════════════════════
    // عدد الأسهم المملوكة لرمز عند تاريخ معيّن (لاشتقاق DPS التاريخي)
    const _sharesAtDate = (ticker, dateStr) => {
      let sh = 0;
      transactions
        .filter(t => t.ticker === ticker && t.date && t.date <= dateStr)
        .forEach(t => {
          if (t.type === 'buy' || t.type === 'grant') sh += +t.shares;
          else if (t.type === 'sell') sh -= +t.shares;
        });
      return sh;
    };
    // الدخل التوزيعي المتوقّع (Forward) — نفس منطق dividends.js/_dpsTrendAware:
    // وسيط آخر (freq) دفعات، مع استثناء الأسهم النامية التصاعدية (آخر دفعة معلنة).
    const _computeForwardIncome = () => {
      const rows = []; let total = 0;
      new Set(holdings.map(h => h.ticker)).forEach(ticker => {
        const h = holdings.find(x => x.ticker === ticker);
        if (!h || +h.shares <= 0) return;
        const divs = dividends.filter(d => d.ticker === ticker)
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        if (!divs.length) return;
        let freq = 1;
        if (divs.length >= 2) {
          const gaps = [];
          for (let i = 1; i < divs.length; i++) {
            const d0 = divs[i - 1].date, d1 = divs[i].date;
            if (d0 && d1) gaps.push((new Date(d1) - new Date(d0)) / 86400000);
          }
          gaps.sort((a, b) => a - b);
          const med = gaps[Math.floor(gaps.length / 2)] || 999;
          if (med <= 105) freq = 4; else if (med <= 210) freq = 2;
        }
        const series = [];
        divs.forEach(d => {
          const sh = _sharesAtDate(ticker, d.date || '9999-12-31');
          if (sh >= 0.001) series.push(+d.amount / sh);
        });
        let dps = 0;
        if (series.length) {
          const win = series.slice(-freq);
          let rising = freq >= 2 && win.length >= freq;
          if (rising) {
            for (let i = 1; i < win.length; i++) if (win[i] < win[i - 1] * 0.99) { rising = false; break; }
            rising = rising && win[win.length - 1] > win[0] * 1.03;
          }
          dps = rising ? win[win.length - 1] : win.slice().sort((a, b) => a - b)[Math.floor(win.length / 2)];
        } else {
          // احتياطي: آخر سنة مسجّلة ÷ الدورية ÷ الأسهم الحالية
          const lastYr = Math.max(...divs.map(d => +d.year || new Date(d.date).getFullYear()));
          const yrTotal = divs.filter(d => (+d.year || new Date(d.date).getFullYear()) === lastYr)
            .reduce((s, d) => s + +d.amount, 0);
          dps = yrTotal > 0 ? yrTotal / +h.shares / freq : 0;
        }
        const projected = dps * freq * +h.shares;
        total += projected;
        rows.push({ ticker, name: h.name || ticker, dps, freq, shares: +h.shares, projected });
      });
      return { total, rows };
    };
    // TWR (Modified Dietz) — نفس منطق performance.js
    const _dedupSnaps30 = (snaps) => {
      const byDate = {};
      for (const s of snaps) {
        const ex = byDate[s.date];
        if (!ex) { byDate[s.date] = s; continue; }
        const isM = s.notes && !s.notes.startsWith('auto');
        const wasM = ex.notes && !ex.notes.startsWith('auto');
        if (isM && !wasM) { byDate[s.date] = s; continue; }
        if (!wasM && !isM) byDate[s.date] = s;
      }
      return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    };
    const _twr30 = (snaps, cfsIn) => {
      const sorted = _dedupSnaps30(snaps);
      if (!sorted.length) return { twrMap: {}, sorted: [] };
      const cfs = cfsIn.slice().sort((a, b) => a.date.localeCompare(b.date));
      const twrMap = {}; let factor = 1.0; twrMap[sorted[0].date] = 100;
      for (let i = 1; i < sorted.length; i++) {
        const sD = sorted[i - 1].date, eD = sorted[i].date;
        const sV = +sorted[i - 1].total_value, eV = +sorted[i].total_value;
        const netCF = cfs.filter(c => c.date > sD && c.date <= eD)
          .reduce((s, c) => s + (c.type === 'deposit' ? +c.amount : -+c.amount), 0);
        const denom = sV + netCF / 2;
        if (denom > 0) { const r = (eV - sV - netCF) / denom; factor *= (1 + r); }
        twrMap[sorted[i].date] = factor * 100;
      }
      return { twrMap, sorted };
    };

    // أرقام أساسية مشتركة
    const _totalMkt   = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
    const _totalCost  = holdings.reduce((s, h) => s + +h.shares * +h.avg_price, 0);
    const _totalBuys  = transactions.filter(t => t.type === 'buy').reduce((s, t) => s + +t.total, 0);
    const _totalSells = transactions.filter(t => t.type === 'sell').reduce((s, t) => s + +t.total, 0);
    const _totalDiv   = dividends.reduce((s, d) => s + +d.amount, 0);
    const _totalComm  = transactions.reduce((s, t) => s + (+t.commission || 0) + (+t.vat || 0), 0);
    const _sukukActive = (sukukData.opportunities || [])
      .filter(o => o.status === 'مشترك').reduce((s, o) => s + (+o.amount || 0), 0);
    const _reVal      = activeRE.reduce((s, r) => s + +r.current_value, 0);
    const _assetVal   = activeAssets.reduce((s, a) => s + +a.value, 0);
    const _fwd        = _computeForwardIncome();

    // ════════════════════════════════════════════════════════
    // 30. مقاييس المخاطر (Risk Metrics)
    // ════════════════════════════════════════════════════════
    book('B');
    await tick('مقاييس المخاطر');
    h2('30. مقاييس المخاطر — التنويع والتركيز والتذبذب');
    p('طبقة المخاطر التي تكمّل أرقام العائد: تقيس *ثمن* العائد لا حجمه فقط. (مطابقة للوحة التحكم وصفحة الأداء.)');

    // ── التنويع (HHI + العدد الفعّال) ──
    if (holdings.length && _totalMkt > 0 && typeof computeDiversification === 'function') {
      const dv = computeDiversification(holdings.map(h => ({
        value: +h.shares * +h.current_price, sector: h.sector, label: h.ticker,
      })));
      if (dv) {
        h3('التنويع (Diversification)');
        p('```');
        p(`عدد الأسهم                 : ${holdings.length}`);
        p(`العدد الفعّال (1÷HHI)       : ${dv.effectiveN}  ← تنوّع أوزانك يعادل هذا العدد من أسهم متساوية`);
        p(`HHI (تركّز الأوزان)         : ${dv.hhi.toFixed(4)}`);
        p(`مؤشر التنويع (0–100)       : ${dv.gaugePos} — ${dv.zoneLabel}`);
        p(`عدد القطاعات               : ${dv.sectorCount}`);
        p(`أكبر مركز                  : ${dv.top1Pct.toFixed(1)}% (${dv.top1Name})`);
        p(`أكبر قطاع                  : ${dv.topSectorPct.toFixed(1)}% (${dv.topSectorName}) عبر ${dv.topSectorCount} سهم`);
        p('```');
        p('- **المرجع (Evans & Archer 1968):** ~90% من المخاطر القابلة للتنويع تُزال عند 15 سهماً فعّالاً.');
        if (dv.corrWarn) {
          p(`\n> ⚠️ **تنويع اسمي لا فعلي:** ${dv.corrMsg} المؤشر يقيس تركيز الأوزان لا ترابط الأسهم — القطاع الواحد يتحرك ككتلة عند الصدمات.`);
        }
      }
    } else {
      p('_لا توجد حيازات كافية لحساب التنويع._');
    }

    // ── التذبذب + Sharpe + Sortino + Max Drawdown (من TWR) ──
    h3('العائد المعدَّل بالمخاطر (من سلسلة TWR)');
    if (snapshots.length >= 4) {
      const { twrMap, sorted } = _twr30(snapshots, cashflows);
      const pts = sorted.map(s => ({ date: s.date, idx: twrMap[s.date] })).filter(x => x.idx > 0);
      if (pts.length >= 4) {
        // Max Drawdown
        let peak = pts[0].idx, maxDD = 0;
        pts.forEach(pt => { if (pt.idx > peak) peak = pt.idx; const dd = (pt.idx - peak) / peak * 100; if (dd < maxDD) maxDD = dd; });
        // عوائد الفترات
        const rets = [];
        for (let i = 1; i < pts.length; i++) rets.push(pts[i].idx / pts[i - 1].idx - 1);
        const spanDays = (new Date(pts[pts.length - 1].date) - new Date(pts[0].date)) / 86400000;
        const years = spanDays / 365.25;
        const ppy = rets.length / years;
        const annRet = Math.pow(pts[pts.length - 1].idx / pts[0].idx, 1 / years) - 1;
        const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
        const varSmp = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
        const volP = Math.sqrt(Math.max(0, varSmp));
        const downSq = rets.reduce((s, r) => s + (r < 0 ? r * r : 0), 0) / rets.length;
        const ddP = Math.sqrt(Math.max(0, downSq));
        const annVol = volP * Math.sqrt(ppy);
        const annDown = ddP * Math.sqrt(ppy);
        const RF = 0.03;
        const sharpe = annVol > 1e-9 ? (annRet - RF) / annVol : null;
        const sortino = annDown > 1e-9 ? (annRet - RF) / annDown : null;
        p('```');
        p(`أقصى تراجع (Max Drawdown)  : ${maxDD.toFixed(2)}%  ← أعمق هبوط من قمة إلى قاع (معزول عن الإيداعات)`);
        p(`التذبذب السنوي (Volatility) : ${(annVol * 100).toFixed(1)}%`);
        p(`تذبذب الهبوط (Downside Dev) : ${(annDown * 100).toFixed(1)}%`);
        p(`العائد السنوي (TWR هندسي)   : ${(annRet >= 0 ? '+' : '') + (annRet * 100).toFixed(2)}%`);
        p(`Sharpe  = (العائد−RF)÷التذبذب: ${sharpe == null ? '—' : sharpe.toFixed(2)}`);
        p(`Sortino = (العائد−RF)÷الهبوط : ${sortino == null ? '—' : sortino.toFixed(2)}`);
        p(`العائد الخالي من المخاطر RF : ${(RF * 100).toFixed(0)}% (افتراض)`);
        p(`عدد الفترات المحسوبة        : ${rets.length}`);
        p('```');
        p('🟡 _تقريبي: مبني على لقطات صافي الثروة الشهرية غير المنتظمة، لا أسعار يومية. Sortino أنسب لأنه يعاقب على الهبوط فقط._');
      } else {
        p('_تحتاج ≥4 لقطات صافي ثروة صالحة لحساب مقاييس المخاطر._');
      }
    } else {
      p('_تحتاج ≥4 لقطات صافي ثروة (أضِفها من صفحة صافي الثروة) لحساب Sharpe/Sortino/التذبذب/التراجع._');
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 31. التدقيق السلوكي (Behavioral Audit)
    // ════════════════════════════════════════════════════════
    book('B');
    await tick('التدقيق السلوكي');
    h2('31. التدقيق السلوكي — انضباط قراراتك');
    p('يحلّل صفقاتك المُغلقة (المُصفّاة بالكامل) لكشف الأنماط النفسية: هل تُمسك بخاسريك؟ هل تُتاجر بإفراط؟ (مطابق لصفحة الأداء.)');
    {
      // بناء الصفقات المغلقة: رمز بِيع بالكامل (الأسهم المتبقية ≈ 0)
      const byTk = {};
      transactions.forEach(t => {
        const e = byTk[t.ticker] || (byTk[t.ticker] = { buyShares: 0, buyCost: 0, sellShares: 0, sellRev: 0, grantShares: 0, name: '', firstBuy: null, lastSell: null });
        e.name = e.name || t.name || '';
        if (t.type === 'buy')   { e.buyShares += +t.shares; e.buyCost += +t.total; if (t.date && (!e.firstBuy || t.date < e.firstBuy)) e.firstBuy = t.date; }
        if (t.type === 'grant') { e.grantShares += +t.shares; }
        if (t.type === 'sell')  { e.sellShares += +t.shares; e.sellRev += +t.total; if (t.date && (!e.lastSell || t.date > e.lastSell)) e.lastSell = t.date; }
      });
      const divByTk = {};
      dividends.forEach(d => { divByTk[d.ticker] = (divByTk[d.ticker] || 0) + +d.amount; });

      const closed = [];
      Object.entries(byTk).forEach(([tk, e]) => {
        const remain = e.buyShares + e.grantShares - e.sellShares;
        if (e.sellShares > 0 && Math.abs(remain) < 0.001 && e.buyShares > 0) {
          const avgCost = e.buyCost / e.buyShares;
          const realizedPnL = e.sellRev - avgCost * e.sellShares;
          const divTotal = divByTk[tk] || 0;
          const totalReturn = realizedPnL + divTotal;
          const holdDays = (e.firstBuy && e.lastSell) ? (parseDateLocal(e.lastSell) - parseDateLocal(e.firstBuy)) / 86400000 : 0;
          closed.push({ tk, name: e.name, realizedPnL, divTotal, totalReturn, holdDays });
        }
      });

      if (!closed.length) {
        p('_لا توجد صفقات مُغلقة بالكامل بعد — التدقيق السلوكي يحتاج مراكز بِيعت كلياً._');
      } else {
        const winners = closed.filter(p => p.totalReturn > 0);
        const losers  = closed.filter(p => p.totalReturn <= 0);
        const winRate = closed.length ? winners.length / closed.length * 100 : 0;
        const totalGains = winners.reduce((s, p) => s + p.totalReturn, 0);
        const totalLosses = Math.abs(losers.reduce((s, p) => s + p.totalReturn, 0));
        const profitFactor = totalLosses > 0 ? totalGains / totalLosses : (totalGains > 0 ? Infinity : 0);
        const avgHoldW = winners.length ? winners.reduce((s, p) => s + p.holdDays, 0) / winners.length : 0;
        const avgHoldL = losers.length ? losers.reduce((s, p) => s + p.holdDays, 0) / losers.length : 0;
        const avgWin = winners.length ? totalGains / winners.length : 0;
        const avgLoss = losers.length ? totalLosses / losers.length : 0;
        const riskReward = avgLoss > 0 ? avgWin / avgLoss : null;
        const firstBuy = transactions.filter(t => t.type === 'buy' && t.date).map(t => t.date).sort()[0];
        const monthsActive = firstBuy ? Math.max(1, (new Date() - parseDateLocal(firstBuy)) / (30.44 * 86400000)) : 1;
        const tradesPerMonth = (transactions.filter(t => t.type === 'buy').length + transactions.filter(t => t.type === 'sell').length) / monthsActive;
        const fmtDays = d => d >= 365 ? `${(d / 365).toFixed(1)} سنة` : d >= 30 ? `${Math.round(d / 30)} شهر` : `${Math.round(d)} يوم`;

        p('```');
        p(`عدد الصفقات المغلقة        : ${closed.length}  (${winners.length} رابحة · ${losers.length} خاسرة)`);
        p(`معدل الربح (Win Rate)      : ${winRate.toFixed(1)}%  ${winRate >= 60 ? '✅ ممتاز' : winRate >= 40 ? '🟡 معقول' : '⚠️ منخفض'}`);
        p(`Profit Factor             : ${profitFactor === Infinity ? '∞ (لا خسائر)' : profitFactor.toFixed(2)}  ${profitFactor >= 2 ? '✅' : profitFactor >= 1 ? '🟡' : '⚠️'}  ← ربح كل ريال خسارة`);
        p(`متوسط احتفاظ الرابحة       : ${fmtDays(avgHoldW)}`);
        p(`متوسط احتفاظ الخاسرة       : ${fmtDays(avgHoldL)}`);
        p(`Risk/Reward (ربح÷خسارة)    : ${riskReward == null ? '—' : riskReward.toFixed(2) + '×'}  ${riskReward >= 1.5 ? '✅' : riskReward >= 1 ? '🟡' : '⚠️'}`);
        p(`وتيرة التداول             : ${tradesPerMonth.toFixed(1)} صفقة/شهر  ${tradesPerMonth > 8 ? '⚠️ مرتفع' : tradesPerMonth > 4 ? '🟡 متوسط' : '✅ منضبط'}`);
        p('```');
        // تشخيص النفور من الخسارة
        if (avgHoldW > 0 && avgHoldL > avgHoldW * 1.3) {
          p(`> ⚠️ **نفور من الخسارة (Loss Aversion):** تُمسك بخاسريك ${(avgHoldL / avgHoldW).toFixed(1)}× أطول من رابحيك — نمط سلوكي شائع ومكلف.`);
        } else if (avgHoldL > 0 && avgHoldW > avgHoldL * 1.3) {
          p(`> ✅ **نمط صحي:** تُمسك برابحيك أطول من خاسريك — "دع أرباحك تجري واقطع خسائرك".`);
        }

        // أفضل / أسوأ 3
        const byRet = [...closed].sort((a, b) => b.totalReturn - a.totalReturn);
        h3('أفضل 3 صفقات مغلقة');
        p(mdTable(['الرمز', 'الاسم', 'إجمالي العائد', 'مدة الاحتفاظ'],
          byRet.slice(0, 3).map(r => [r.tk, r.name || '—', (r.totalReturn >= 0 ? '+' : '') + SAR(r.totalReturn), fmtDays(r.holdDays)])));
        if (byRet.length > 3) {
          h3('أسوأ 3 صفقات مغلقة');
          p(mdTable(['الرمز', 'الاسم', 'إجمالي العائد', 'مدة الاحتفاظ'],
            byRet.slice(-3).reverse().map(r => [r.tk, r.name || '—', (r.totalReturn >= 0 ? '+' : '') + SAR(r.totalReturn), fmtDays(r.holdDays)])));
        }
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 32. مؤشرات لوحة التحكم الإضافية
    // ════════════════════════════════════════════════════════
    book('B');
    await tick('مؤشرات اللوحة');
    h2('32. مؤشرات لوحة التحكم الإضافية');
    {
      const netCapital = _totalBuys - _totalSells;
      const totalReturns = _totalMkt + _totalDiv;
      const recovery = netCapital > 0 ? totalReturns / netCapital * 100 : 0;

      // يُصدَّر بنفس تأطير لوحة التحكم: المسافة عن رأس المال هي الرقم القائد،
      // ونسبة الاسترداد الخام تفصيل تحته (100% = رأس المال بالضبط لا ربح).
      const above = netCapital > 0 ? (totalReturns - netCapital) / netCapital * 100 : 0;
      h3('موقعك من رأس مالك (نقطة التعادل)');
      p('```');
      p(`رأس المال المنشغل (شراء−بيع) : ${SAR(netCapital)} ر.س`);
      p(`إجمالي العوائد (قيمة+توزيعات): ${SAR(totalReturns)} ر.س`);
      p(`الفرق عن رأس المال          : ${above >= 0 ? '+' : '−'}${Math.abs(above).toFixed(2)}%  ${above >= 0 ? '✅ فوق رأس مالك' : '🔴 تحت رأس مالك — يأكل منه'}`);
      p(`صافي الربح/الخسارة الحقيقي   : ${(totalReturns - netCapital >= 0 ? '+' : '') + SAR(totalReturns - netCapital)} ر.س`);
      p(`(للتحقّق) نسبة الاسترداد     : ${recovery.toFixed(1)}%  — 100% = رأس مالك بالضبط`);
      p('```');

      // تخصيص الأصول %
      h3('تخصيص الأصول (Asset Allocation)');
      const allocTotal = _totalMkt + _reVal + portfolioCash + _sukukActive + _assetVal;
      if (allocTotal > 0) {
        const arow = (lbl, v) => [lbl, SAR(v), PCT(v / allocTotal * 100)];
        p(mdTable(['الفئة', 'القيمة (ر.س)', 'النسبة'], [
          arow('أسهم', _totalMkt),
          arow('عقارات', _reVal),
          arow('نقد غير مستثمر', portfolioCash),
          arow('صكوك نشطة', _sukukActive),
          arow('أصول أخرى', _assetVal),
          ['الإجمالي', SAR(allocTotal), '100.00%'],
        ]));
      } else { p('_لا توجد أصول لحساب التخصيص._'); }

      // نمو التوزيعات السنوي (Dividend CAGR)
      h3('نمو التوزيعات السنوي (Dividend CAGR)');
      const divByYear = {};
      dividends.forEach(d => { const y = +d.year || new Date(d.date).getFullYear(); divByYear[y] = (divByYear[y] || 0) + +d.amount; });
      const fullYears = Object.keys(divByYear).map(Number).filter(y => y < today.getFullYear() && divByYear[y] > 0).sort((a, b) => a - b);
      if (fullYears.length >= 2) {
        const span = fullYears[fullYears.length - 1] - fullYears[0];
        const cagr = (Math.pow(divByYear[fullYears[fullYears.length - 1]] / divByYear[fullYears[0]], 1 / span) - 1) * 100;
        p(`نمو التوزيعات المركّب من ${fullYears[0]} إلى ${fullYears[fullYears.length - 1]}: **${(cagr >= 0 ? '+' : '') + cagr.toFixed(1)}%/سنة** (سنوات كاملة فقط، تستبعد السنة الجارية).`);
      } else {
        p('_يحتاج سنتين تقويميتين مكتملتين على الأقل من التوزيعات._');
      }

      // معدّل المساهمة الشهري (آخر 12 شهراً)
      h3('معدّل المساهمة الشهري');
      const cutoff = new Date(today.getFullYear(), today.getMonth() - 12, today.getDate()).toISOString().slice(0, 10);
      const cf12 = cashflows.filter(c => c.date && c.date >= cutoff);
      const dep12 = cf12.filter(c => c.type === 'deposit').reduce((s, c) => s + +c.amount, 0);
      const wd12 = cf12.filter(c => c.type === 'withdrawal').reduce((s, c) => s + +c.amount, 0);
      const hasCf12 = cf12.length > 0;
      const monthlyContrib = hasCf12 ? (dep12 - wd12) / 12 : 0;
      if (hasCf12) {
        p(`صافي المساهمة آخر 12 شهراً: ${SAR(dep12 - wd12)} ر.س → **${SAR(monthlyContrib)} ر.س/شهر** (إيداعات ${SAR(dep12)} − سحوبات ${SAR(wd12)}).`);
      } else {
        p('_لا توجد تدفقات نقدية مسجّلة في آخر 12 شهراً._');
      }

      // محلل صحة المحفظة (4 محاور) — نفس عتبات لوحة التحكم
      h3('محلل صحة المحفظة (4 محاور)');
      if (holdings.length && _totalMkt > 0) {
        const secMap = {};
        holdings.forEach(h => { const sec = (h.sector || '').trim() || 'غير مصنف'; secMap[sec] = (secMap[sec] || 0) + +h.shares * +h.current_price; });
        const secEntries = Object.entries(secMap).sort((a, b) => b[1] - a[1]);
        const largestSecPct = secEntries[0] ? secEntries[0][1] / _totalMkt * 100 : 0;
        const largestSecName = secEntries[0]?.[0] || '';
        const sectorCount = secEntries.length;
        const sortedH = holdings.map(h => ({ tk: h.ticker, w: +h.shares * +h.current_price / _totalMkt * 100 })).sort((a, b) => b.w - a.w);
        const top1 = sortedH[0]?.w || 0, top1n = sortedH[0]?.tk || '';
        const top3 = sortedH.slice(0, 3).reduce((s, h) => s + h.w, 0);
        const stockCount = holdings.length;
        const fwdMonthly = _fwd.total / 12;
        const monthlyTarget = retGoal.monthly || 0;
        const swr = retGoal.swr || 4;
        const fireNumber = monthlyTarget > 0 ? (monthlyTarget * 12) / (swr / 100) : 0;
        const fireBase = _totalMkt + portfolioCash + _sukukActive;
        const fireProgress = fireNumber > 0 ? Math.min(fireBase / fireNumber * 100, 100) : null;
        const targetYear = retGoal.target_year || 0;
        const yearsLeft = targetYear > 0 ? targetYear - today.getFullYear() : null;
        // إسقاط المسار
        let projFireRatio = null, projCoverRatio = null;
        const annualContrib = monthlyContrib * 12;
        if (targetYear > 0 && yearsLeft > 0 && hasCf12 && annualContrib > 0) {
          const g = Math.pow(1.05, yearsLeft);
          const projAssets = Math.max(0, fireBase * g + annualContrib * ((g - 1) / 0.05));
          if (fireNumber > 0) projFireRatio = projAssets / fireNumber * 100;
          const divYield = _totalMkt > 0 ? _fwd.total / _totalMkt : 0;
          if (monthlyTarget > 0) projCoverRatio = (projAssets * divYield / 12) / monthlyTarget * 100;
        }
        // محور A: التنوع
        let aL;
        if (stockCount < 5) aL = '🔴 تركيز عالٍ';
        else if (stockCount <= 9 || sectorCount <= 2) aL = '🟡 تنوع محدود';
        else if (stockCount <= 20 && sectorCount >= 4) aL = '🟢 تنوع جيد';
        else if (stockCount > 25) aL = '🟡 مراقبة التشتت';
        else aL = '🟢 تنوع جيد';
        // محور B: التركيز
        let bL;
        if (top1 > 30 || top3 > 65 || largestSecPct > 50) bL = '🔴 تركيز مرتفع جداً';
        else if (top1 > 20 || top3 > 50 || largestSecPct > 38) bL = '🟡 تركيز مرتفع';
        else bL = '🟢 توزيع متوازن';
        // محور C: تغطية الدخل
        let cL, cD;
        if (!monthlyTarget) { cL = '⚪ هدف غير محدد'; cD = `دخل متوقع ${SAR(fwdMonthly)}/شهر`; }
        else {
          const curCover = fwdMonthly / monthlyTarget * 100;
          if (curCover >= 100) { cL = '🟢 يغطي مصاريفك الآن'; cD = `${SAR(fwdMonthly)}/شهر ≥ الهدف ${SAR(monthlyTarget)}`; }
          else if (projCoverRatio != null) {
            cD = `الآن ${curCover.toFixed(0)}% ← متوقع ${Math.min(projCoverRatio, 999).toFixed(0)}% بحلول ${targetYear}`;
            cL = projCoverRatio >= 100 ? '🟢 على المسار' : projCoverRatio >= 75 ? '🟡 قريب من المسار' : '🔴 متأخر عن المسار';
          } else { cL = '🟡 مرحلة بناء'; cD = `${SAR(fwdMonthly)}/شهر من ${SAR(monthlyTarget)} (${curCover.toFixed(0)}%)`; }
        }
        // محور D: FIRE
        let dL, dD;
        if (fireProgress === null) { dL = '⚪ هدف غير محدد'; dD = yearsLeft != null ? `${yearsLeft} سنة حتى ${targetYear}` : 'حدد هدف FIRE'; }
        else if (fireProgress >= 100) { dL = '🟢 الهدف محقق'; dD = '100% — أصولك السائلة تكفي'; }
        else if (projFireRatio != null) {
          dD = `الآن ${fireProgress.toFixed(0)}% ← متوقع ${Math.min(projFireRatio, 999).toFixed(0)}% بحلول ${targetYear}`;
          dL = projFireRatio >= 100 ? '🟢 على المسار' : projFireRatio >= 75 ? '🟡 قريب من المسار' : '🔴 متأخر عن المسار';
        } else { dL = '🟡 مرحلة بناء'; dD = `${fireProgress.toFixed(0)}% من الهدف`; }

        p(mdTable(['المحور', 'التقييم', 'التفاصيل'], [
          ['التنوع', aL, `${stockCount} سهم · ${sectorCount} قطاع`],
          ['التركيز', bL, `أكبر سهم ${top1.toFixed(1)}% (${top1n}) · أكبر 3 ${top3.toFixed(1)}% · أكبر قطاع ${largestSecPct.toFixed(1)}% (${largestSecName})`],
          ['تغطية الدخل', cL, cD],
          ['التقدم نحو FIRE', dL, dD],
        ]));
      } else { p('_لا توجد حيازات لتقييم الصحة._'); }

      // إسقاط FIRE على المسار
      h3('إسقاط FIRE على المسار');
      if (retGoal.monthly > 0 && retGoal.target_year > 0 && hasCf12 && monthlyContrib > 0) {
        const yearsLeft = retGoal.target_year - today.getFullYear();
        const fireNumber = (retGoal.monthly * 12) / ((retGoal.swr || 4) / 100);
        const fireBase = _totalMkt + portfolioCash + _sukukActive;
        if (yearsLeft > 0) {
          const g = Math.pow(1.05, yearsLeft);
          const projAssets = fireBase * g + (monthlyContrib * 12) * ((g - 1) / 0.05);
          const ratio = fireNumber > 0 ? projAssets / fireNumber * 100 : 0;
          p('```');
          p(`الأصول الحالية المؤهلة (أسهم+نقد+صكوك): ${SAR(fireBase)} ر.س`);
          p(`المساهمة السنوية المفترضة           : ${SAR(monthlyContrib * 12)} ر.س`);
          p(`نمو تخطيطي متحفّظ                   : 5% سنوياً`);
          p(`السنوات المتبقية حتى ${retGoal.target_year}          : ${yearsLeft}`);
          p(`الأصول المتوقعة عند التقاعد          : ${SAR(projAssets)} ر.س`);
          p(`رقم FIRE المطلوب                    : ${SAR(fireNumber)} ر.س`);
          p(`نسبة الوصول المتوقعة                : ${ratio.toFixed(0)}%  ${ratio >= 100 ? '✅ على المسار' : ratio >= 80 ? '🟡 قريب' : '🔴 متأخر'}`);
          p('```');
        } else { p('_سنة التقاعد المستهدفة في الماضي أو الحاضر._'); }
      } else {
        p('_يحتاج: هدف FIRE + سنة تقاعد + تدفقات نقدية مسجّلة في آخر 12 شهراً._');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 33. أداء التوزيعات المتقدم
    // ════════════════════════════════════════════════════════
    book('B');
    await tick('أداء التوزيعات المتقدم');
    h2('33. أداء التوزيعات المتقدم');
    {
      const divROI = _totalBuys > 0 ? _totalDiv / _totalBuys * 100 : 0;
      const breakEvenYrs = _fwd.total > 0 ? _totalCost / _fwd.total : null;
      const totalPnL = (_totalMkt - _totalCost) + (() => {
        // ر/خ محقق (نفس منطق القسم 10)
        const m = {};
        transactions.forEach(t => {
          const e = m[t.ticker] || (m[t.ticker] = { bs: 0, bc: 0, sr: 0, ss: 0 });
          if (t.type === 'buy' || t.type === 'grant') { e.bc += +t.total; e.bs += +t.shares; }
          if (t.type === 'sell') { e.sr += +t.total; e.ss += +t.shares; }
        });
        return Object.values(m).reduce((s, v) => v.bs < 0.001 ? s : s + v.sr - (v.bc / v.bs) * v.ss, 0);
      })();
      const efficiency = _totalComm > 0 ? totalPnL / _totalComm : null;

      p('```');
      p(`Div ROI (توزيعات ÷ تكلفة الشراء) : ${divROI.toFixed(1)}%  ← نسبة استرداد رأس المال عبر التوزيعات وحدها`);
      p(`سنوات التعادل بالتوزيعات          : ${breakEvenYrs == null ? '—' : breakEvenYrs.toFixed(1) + ' سنة'}  (تكلفة الحيازة ÷ الدخل المتوقع سنوياً)`);
      p(`الدخل التوزيعي المتوقع (Forward)  : ${SAR(_fwd.total)} ر.س/سنة`);
      p(`نسبة كفاءة المحفظة               : ${efficiency == null ? '—' : efficiency.toFixed(1) + '×'}  (إجمالي الأرباح ÷ العمولات والضرائب)`);
      p(`إجمالي العمولات والضرائب المدفوعة : ${SAR(_totalComm)} ر.س`);
      p('```');
      if (efficiency != null) {
        p(`- ${efficiency >= 20 ? '✅ ممتاز' : efficiency >= 10 ? '🟡 جيد' : '⚠️ منخفض'}: كل ريال عمولة قابله ${efficiency.toFixed(1)} ريال ربح إجمالي.`);
      }

      if (_fwd.rows.length) {
        h3('الدخل التوزيعي المتوقع لكل سهم');
        const frows = _fwd.rows.sort((a, b) => b.projected - a.projected).map(r => [
          r.ticker, r.name, N(r.shares), SAR(r.dps),
          r.freq === 4 ? 'ربع سنوي' : r.freq === 2 ? 'نصف سنوي' : 'سنوي',
          SAR(r.projected),
          _totalMkt > 0 ? PCT(r.projected / (+holdings.find(h => h.ticker === r.ticker).shares * +holdings.find(h => h.ticker === r.ticker).current_price) * 100) : '—',
        ]);
        p(mdTable(['الرمز', 'الاسم', 'الأسهم', 'DPS متوقع', 'الدورية', 'الدخل السنوي', 'العائد الحالي'], frows));
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 34. XIRR — العائد السنوي الحقيقي للمحفظة ولكل مركز
    // ════════════════════════════════════════════════════════
    book('B');
    await tick('XIRR');
    h2('34. XIRR — العائد السنوي الحقيقي (المحفظة وكل مركز)');
    p('XIRR هو معدل الخصم الذي يجعل صافي القيمة الحالية لكل تدفقاتك = صفر. بخلاف «الربح %» البسيط، يعاقب رأس المال الذي دخل متأخراً ويكافئ الذي دخل مبكراً — فهو المقياس الوحيد الذي يجيب: «كم ربحتُ سنوياً فعلاً؟».');
    p('**اتفاقية الإشارة:** الشراء تدفق سالب (خروج نقد)، البيع والتوزيعات موجب، والقيمة السوقية الحالية تُضاف كتدفق موجب افتراضي بتاريخ اليوم.');
    {
      const _xirrAvailable = typeof computeXIRR === 'function';
      if (!_xirrAvailable) {
        p('⚠️ **غير متوفر:** دالة `computeXIRR` غير محمّلة (utils.js). لا يُقدَّر العائد بصمت (الدستور §8).');
        noteMissing('XIRR', 'دالة computeXIRR غير متاحة في هذه الجلسة.');
      } else {
        const _d = s => { const x = new Date(s); return isNaN(x.getTime()) ? null : x; };

        // ── XIRR للمحفظة ككل ──────────────────────────────
        const pflows = [];
        transactions.forEach(t => {
          const dt = _d(t.date); if (!dt) return;
          if (t.type === 'buy')  pflows.push({ date: dt, amount: -(+t.total || 0) });
          if (t.type === 'sell') pflows.push({ date: dt, amount:  (+t.total || 0) });
          // grant: منحة بلا تكلفة — لا تدفق نقدي
        });
        dividends.forEach(dv => {
          const dt = _d(dv.date); if (!dt) return;
          pflows.push({ date: dt, amount: +dv.amount || 0 });
        });
        // AUDIT-FIX (2026-08-18): كانت القيمة النهائية = سوقية + نقد غير مستثمر،
        // بينما التدفقات لا تحوي إيداع ذلك النقد كتدفق سالب. إضافة مبلغ للطرف
        // النهائي بلا تكلفة مقابلة تضخّم XIRR بلا وجه حق. والأهم: §10 في نفس
        // حزمة التقارير يستخدم الأسهم وحدها — فكان الملف الواحد يطبع رقمين
        // مختلفين اسمهما «XIRR للمحفظة». الآن كلاهما على الأسهم وحدها.
        if (_totalMkt > 0) pflows.push({ date: today, amount: _totalMkt });

        const pXirr = computeXIRR(pflows);
        p('```');
        p(`عدد التدفقات المستخدمة   : ${pflows.length}`);
        p(`أول تدفق                 : ${pflows.length ? new Date(Math.min(...pflows.map(f => f.date.getTime()))).toISOString().slice(0, 10) : '—'}`);
        p(`القيمة النهائية المفترضة : ${SAR(_totalMkt)} ر.س (القيمة السوقية للأسهم — مطابقة للقسم 10)`);
        p(`ملاحظة                   : النقد غير المستثمر (${SAR(portfolioCash)} ر.س) مستبعَد عمداً — لم يدخل كتدفق سالب فلا يصحّ ظهوره في الطرف النهائي.`);
        p(`XIRR للمحفظة             : ${pXirr == null ? 'غير متوفر' : ((pXirr >= 0 ? '+' : '') + (pXirr).toFixed(2) + '%')}`);
        p('```');
        if (pXirr == null) {
          p('⚠️ **غير متوفر:** يحتاج تدفقات موجبة وسالبة بتواريخ صالحة. لا يُقدَّر بديل.');
          noteMissing('XIRR للمحفظة', 'التدفقات غير كافية أو تواريخها غير صالحة.');
        } else {
          const verdict = pXirr >= 10 ? '✅ فوق المتوسط التاريخي للأسواق الناشئة'
                        : pXirr >= 5  ? '🟡 معقول لكنه دون طموح محفظة دخل طويلة الأفق'
                        : pXirr >= 0  ? '⚠️ موجب لكنه ضعيف — يقارب التضخم أو دونه'
                                      : '🔴 سالب — رأس المال يتآكل بعد احتساب التوقيت';
          p(`**التشخيص:** ${verdict}. هذا الرقم يشمل التوزيعات وتوقيت كل ضخّة، فهو أصدق من «الربح %» البسيط.`);
          p('**قيد على الدقة:** أي سعر قديم في §28 يجعل «القيمة النهائية» غير دقيقة، وبالتالي XIRR كله.');
        }

        // ── XIRR لكل مركز ─────────────────────────────────
        h3('XIRR لكل مركز على حدة');
        p('يُحسب لكل رمز من معاملاته وتوزيعاته وقيمته السوقية الحالية. «غير متوفر» تعني أن التدفقات لا تسمح بحل رياضي — لا تُقدَّر.');
        const byTk = {};
        const _reg = (tk, name) => (byTk[tk] || (byTk[tk] = { name: name || '', flows: [], buys: 0, sells: 0, div: 0 }));
        transactions.forEach(t => {
          const dt = _d(t.date); if (!dt) return;
          const e = _reg(t.ticker, t.name);
          if (t.type === 'buy')  { e.flows.push({ date: dt, amount: -(+t.total || 0) }); e.buys  += +t.total || 0; }
          if (t.type === 'sell') { e.flows.push({ date: dt, amount:  (+t.total || 0) }); e.sells += +t.total || 0; }
        });
        dividends.forEach(dv => {
          const dt = _d(dv.date); if (!dt) return;
          const e = _reg(dv.ticker, dv.name);
          e.flows.push({ date: dt, amount: +dv.amount || 0 });
          e.div += +dv.amount || 0;
        });
        holdings.forEach(h => {
          const e = _reg(h.ticker, h.name);
          const mv = +h.shares * +h.current_price;
          if (mv > 0) e.flows.push({ date: today, amount: mv });
        });

        const xRows = Object.entries(byTk).map(([tk, e]) => {
          const r = computeXIRR(e.flows);
          const held = holdings.some(h => h.ticker === tk);
          return { tk, name: e.name, r, held, n: e.flows.length, buys: e.buys, sells: e.sells, div: e.div };
        }).sort((a, b) => {
          if ((a.r == null) !== (b.r == null)) return a.r == null ? 1 : -1;
          return (b.r || 0) - (a.r || 0);
        });

        p(mdTable(
          ['الرمز','الاسم','الحالة','عدد التدفقات','إجمالي الشراء','إجمالي البيع','التوزيعات','XIRR سنوي'],
          xRows.map(r => [
            r.tk, r.name || '—', r.held ? 'مملوك' : 'مُصفّى', String(r.n),
            SAR(r.buys), SAR(r.sells), SAR(r.div),
            r.r == null ? 'غير متوفر' : ((r.r >= 0 ? '+' : '') + r.r.toFixed(2) + '%'),
          ])
        ));
        {
          const ok  = xRows.filter(r => r.r != null);
          const na  = xRows.length - ok.length;
          const pos = ok.filter(r => r.r > 0);
          const best = ok[0], worst = ok[ok.length - 1];
          const diag = [];
          diag.push(`- **قابلية الحساب:** ${ok.length} من ${xRows.length} مركزاً أمكن حساب XIRR له، و**${na}** غير متوفر (يُعلَن ولا يُقدَّر — §8).`);
          if (ok.length) {
            diag.push(`- **الموجب مقابل السالب:** ${pos.length} مركزاً بعائد سنوي موجب، ${ok.length - pos.length} سالب.`);
            if (best)  diag.push(`- **الأفضل:** ${best.tk} ${best.name ? '(' + best.name + ')' : ''} عند ${(best.r >= 0 ? '+' : '') + best.r.toFixed(2)}% سنوياً.`);
            if (worst) diag.push(`- **الأسوأ:** ${worst.tk} ${worst.name ? '(' + worst.name + ')' : ''} عند ${(worst.r >= 0 ? '+' : '') + worst.r.toFixed(2)}% سنوياً — راجع بوابة الاستدامة (الفلتر 1) قبل أي قرار، فالعائد الضعيف وحده ليس سبب خروج دستورياً.`);
            if (pXirr != null) {
              const above = ok.filter(r => r.r > pXirr).length;
              diag.push(`- **مقابل المحفظة:** ${above} مركزاً يتفوق على XIRR المحفظة (${pXirr.toFixed(2)}%)، والبقية تسحبه للأسفل.`);
            }
          }
          p(diag.join('\n'));
        }
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 35. خطط التوقعات المحفوظة (Forecast Plans)
    // ════════════════════════════════════════════════════════
    book('C');
    await tick('خطط التوقعات');
    h2('35. خطط التوقعات المحفوظة (Forecast Plans)');
    p('خطط الضخ المحفوظة من صفحة «التوقعات». الخطة المجمّدة (schemaVersion ≥ 2) تحمل مسار الإسقاط السنوي كاملاً وسياق البيانات وقت الحفظ، فتُعرض كما حُفظت بلا إعادة حساب.');
    {
      const plans = await syncedGet('forecast_plans_v1', []);
      if (Array.isArray(plans) && plans.length) {
        p(`**عدد الخطط المحفوظة:** ${plans.length}`);

        h3('فهرس الخطط');
        p(mdTable(
          ['#','تاريخ الحفظ','الملاحظة','الإصدار','القيمة الابتدائية','الهدف النهائي','الضخ الشهري المطلوب','القيمة المتوقعة','الدخل الشهري المتوقع'],
          plans.map((pl, i) => [
            String(i + 1), pl.date || (pl.createdISO || '').slice(0, 10), pl.notes || '—',
            pl.schemaVersion ? `v${pl.schemaVersion}` : 'قديمة (بلا مسار)',
            pl.inp?.startValue != null ? SAR(pl.inp.startValue) : '—',
            pl.targetFinalValue != null ? SAR(pl.targetFinalValue) : '—',
            pl.alreadyReached ? 'الهدف مُحقَّق' : pl.impossible ? 'غير قابل للتحقق' : (pl.requiredPMT != null ? SAR(pl.requiredPMT) : '—'),
            pl.finalValue != null ? SAR(pl.finalValue) : '—',
            pl.finalIncome != null ? SAR(pl.finalIncome) : '—',
          ])
        ));

        plans.forEach((pl, i) => {
          h3(`خطة ${i + 1} — ${pl.notes || pl.date || 'بلا عنوان'}`);
          p(`**المعرّف:** ${pl.id ?? '—'} | **تاريخ الإنشاء:** ${pl.createdISO || pl.date || '—'} | **سنة الأساس:** ${pl.baseYear ?? '—'} | **إصدار المخطّط:** ${pl.schemaVersion ?? 'قديم'}`);

          if (pl.inp && typeof pl.inp === 'object') {
            const inpRows = Object.entries(pl.inp)
              .filter(([, v]) => v != null && v !== '' && typeof v !== 'object')
              .map(([k, v]) => [k, typeof v === 'number' ? N(v) : String(v)]);
            if (inpRows.length) { p('**المدخلات:**'); p(mdTable(['الحقل','القيمة'], inpRows)); }
          }

          if (pl.scenario && typeof pl.scenario === 'object') {
            const scRows = Object.entries(pl.scenario)
              .filter(([, v]) => v != null && typeof v !== 'object')
              .map(([k, v]) => [k, typeof v === 'number' ? N(v) : String(v)]);
            if (scRows.length) { p('**السيناريو المختار:**'); p(mdTable(['الحقل','القيمة'], scRows)); }
          }

          if (Array.isArray(pl.scenariosUsed) && pl.scenariosUsed.length) {
            p('**كل السيناريوهات المعروضة وقت الحفظ:**');
            const keys = [...new Set(pl.scenariosUsed.flatMap(s => Object.keys(s || {})))]
              .filter(k => pl.scenariosUsed.every(s => typeof (s || {})[k] !== 'object'));
            if (keys.length) {
              p(mdTable(keys, pl.scenariosUsed.map(s => keys.map(k => {
                const v = (s || {})[k];
                return v == null ? '—' : (typeof v === 'number' ? N(v) : String(v));
              }))));
            }
          }

          if (Array.isArray(pl.path) && pl.path.length) {
            p(`**مسار الإسقاط السنوي (${pl.path.length} نقطة):**`);
            p(mdTable(
              ['السنة','القيمة الاسمية','تراكمي التوزيعات','تراكمي المُضاف','القيمة الحقيقية (بعد التضخم)','الدخل الشهري'],
              pl.path.map(s => [
                String(s.y ?? s.year ?? '—'),
                SAR(s.v ?? s.value ?? 0), SAR(s.d ?? s.cumDiv ?? 0), SAR(s.a ?? s.cumAdded ?? 0),
                SAR(s.r ?? s.realValue ?? 0), SAR(s.i ?? s.monthlyIncome ?? 0),
              ])
            ));
          } else {
            p('_لا مسار إسقاط محفوظ لهذه الخطة (خطة قديمة قبل الإصدار 2) — تحتاج إعادة حساب حيّ من صفحة التوقعات._');
          }

          if (pl.context && typeof pl.context === 'object') {
            const CTX = {
              confidenceScore:'درجة الثقة في البيانات', capitalWeightedMonths:'أشهر مرجّحة برأس المال',
              yearsActive:'سنوات النشاط', portfolioValue:'قيمة المحفظة وقت الحفظ',
              annCapGrowth:'نمو رأسمالي سنوي (أداؤك الخام)', blendedCapGrowth:'النمو الممزوج المستخدم',
              marketBenchmark:'أساس السوق المرجعي', perfWeight:'وزن أدائك في المزج',
              safeDivYield:'عائد التوزيعات الآمن', divYieldSource:'مصدر عائد التوزيعات',
              fwdAnnualIncome:'الدخل السنوي المتوقع', xirr:'XIRR وقت الحفظ',
              holdingsCount:'عدد الحيازات', divYears:'سنوات بيانات التوزيعات',
            };
            const cRows = Object.keys(CTX).map(k => [
              CTX[k],
              pl.context[k] == null ? 'غير متوفر (§8)' : (typeof pl.context[k] === 'number' ? N(pl.context[k]) : String(pl.context[k])),
            ]);
            p('**سياق البيانات وقت الحفظ — على أي أساس بُنيت الخطة:**');
            p(mdTable(['البند','القيمة'], cRows));
          }
        });

        h3('ما تعنيه خطط التوقعات');
        {
          const withPath = plans.filter(pl => Array.isArray(pl.path) && pl.path.length > 1).length;
          const reached  = plans.filter(pl => pl.alreadyReached).length;
          const imposs   = plans.filter(pl => pl.impossible).length;
          const pmts     = plans.map(pl => +pl.requiredPMT).filter(v => isFinite(v) && v > 0);
          const diag = [];
          diag.push(`- **${withPath}** من ${plans.length} خطة مجمّدة بمسار كامل — تُقرأ كما حُفظت؛ الباقي يحتاج إعادة حساب حيّ.`);
          if (reached) diag.push(`- **${reached}** خطة هدفها مُحقَّق بالفعل عند لحظة الحفظ.`);
          if (imposs)  diag.push(`- 🔴 **${imposs}** خطة صُنّفت «غير قابلة للتحقق» بالمعطيات وقتها — الهدف يحتاج مراجعة أو أفقاً أطول.`);
          if (pmts.length) {
            const mn = Math.min(...pmts), mx = Math.max(...pmts);
            diag.push(`- **مدى الضخ الشهري المطلوب عبر خططك:** من ${SAR(mn)} إلى ${SAR(mx)} ر.س — الفجوة بينهما تقيس حساسية هدفك لافتراض العائد.`);
          }
          diag.push('- **تحذير منهجي:** كل خطة مبنية على معدل نمو مفترض. الخطة ليست تنبؤاً، بل اختبار «ماذا لو». تُقارَن بالواقع في §29 (TWR) و§34 (XIRR).');
          p(diag.join('\n'));
        }
      } else {
        p('_لا توجد خطط توقعات محفوظة. احفظ خطة من صفحة «التوقعات» ثم أعد تصدير التقرير._');
        noteMissing('خطط التوقعات (forecast_plans_v1)', 'لا توجد خطط محفوظة بعد.');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 36. الامتثال لدستور المحفظة (CLAUDE.md) — فحص قاعدة بقاعدة
    // ════════════════════════════════════════════════════════
    book('A');
    await tick('الامتثال للدستور');
    h2('36. الامتثال لدستور المحفظة — فحص كل قاعدة');
    p('فحص آلي صريح لكل قاعدة صلبة في الدستور. كل بند له نتيجة قاطعة: ✅ ممتثل / 🔴 مخالف / ⚠️ غير قابل للفحص (بيانات ناقصة — تُعلَن ولا تُقدَّر، §8).');
    {
      const CAP_SINGLE = 7, CAP_BLUE = 12, CAP_SECTOR = 25;
      const TOL_STOCK = 0.75, TOL_SECTOR = 1.25;
      const checks = [];
      const addCheck = (rule, ref, status, detail) => checks.push([rule, ref, status, detail]);

      const gm = _totalMkt;
      const deCfgC = await syncedGet('decision_engine_v1', {}) || {};
      // AUDIT-FIX (2026-08-18): كان يفتقد fallback أرامكو الموجود حرفياً في
      // decision-engine.js:168 و targets.js:127 و watchlist.js:21 — فيقرأ سقفها 7%
      // بدل 12% ويُصدر أمر بيع لسهم ممتثل. العلم اليدوي يتقدّم على الافتراض.
      const isBlue = tk => (deCfgC[tk] && (deCfgC[tk].blueChip === true || deCfgC[tk].isBlueChip === true))
        ? true
        : (deCfgC[tk] && deCfgC[tk].blueChip === false ? false : tk === '2222');

      // ① سقف السهم الواحد / القيادي
      if (holdings.length && gm > 0) {
        const breaches = holdings.map(h => {
          const w   = (+h.shares * +h.current_price) / gm * 100;
          const cap = isBlue(h.ticker) ? CAP_BLUE : CAP_SINGLE;
          return { tk: h.ticker, name: h.name, w, cap, blue: isBlue(h.ticker), over: w > cap + TOL_STOCK, inTol: w > cap && w <= cap + TOL_STOCK };
        });
        const hard = breaches.filter(b => b.over);
        const soft = breaches.filter(b => b.inTol);
        addCheck('سقف السهم الواحد 7% (والقيادي 12%) + منطقة سماح 0.75%', '§1',
          hard.length ? '🔴 مخالف' : '✅ ممتثل',
          hard.length
            ? `${hard.length} سهم كسر سقفه: ${hard.map(b => `${b.tk} ${PCT(b.w)} > ${b.cap}%${b.blue ? ' (قيادي)' : ''}`).join('؛ ')}`
            : `لا سهم يتجاوز سقفه.${soft.length ? ` (${soft.length} داخل منطقة السماح بلا تنبيه: ${soft.map(b => b.tk).join('، ')})` : ''}`);

        // ② سقف القطاع
        const secM = {};
        holdings.forEach(h => { const s = h.sector || 'غير مصنف'; secM[s] = (secM[s] || 0) + +h.shares * +h.current_price; });
        const secB = Object.entries(secM).map(([s, v]) => ({ s, w: v / gm * 100 })).filter(x => x.w > CAP_SECTOR + TOL_SECTOR);
        addCheck('سقف القطاع الواحد 25% + منطقة سماح 1.25%', '§1',
          secB.length ? '🔴 مخالف' : '✅ ممتثل',
          secB.length ? `${secB.length} قطاع فوق السقف: ${secB.map(x => `${x.s} ${PCT(x.w)}`).join('؛ ')}` : `أعلى قطاع ${PCT(Math.max(...Object.values(secM).map(v => v / gm * 100)))} — تحت السقف.`);

        // ③ حجم المحفظة
        const nH = holdings.length;
        addCheck('حجم المحفظة المستهدف 18–25 سهماً', '§1',
          nH >= 18 && nH <= 25 ? '✅ ممتثل' : '🔴 مخالف',
          `العدد الحالي ${nH} سهم — ${nH < 18 ? `ينقص ${18 - nH} سهماً عن الحد الأدنى (تركيز زائد)` : nH > 25 ? `يزيد ${nH - 25} سهماً عن السقف (تشتّت وإدارة مرهقة)` : 'داخل النطاق'}.`);

        // ④ السوق 100% سعودي
        addCheck('المحفظة 100% سعودية بقرار المالك — لا تُنتقد لغياب التنويع الجغرافي', '§1',
          '✅ ممتثل (قرار مالك)',
          `${nH} سهماً كلها في تاسي. هذا قيد مقصود ومُعلَن، لا يُطرح كخلل.`);
      } else {
        addCheck('الأسقف الوزنية والقطاعية وحجم المحفظة', '§1', '⚠️ غير قابل للفحص',
          'لا توجد حيازات أو أن إجمالي القيمة السوقية = 0.');
        noteMissing('فحص الأسقف الدستورية', 'لا حيازات أو قيمة سوقية صفرية.');
      }

      // ⑤ المشغّلات الثابتة
      {
        const snapC = await syncedGet('decision_engine_snapshot_v1', null);
        const trg   = snapC?.fixedTriggers || [];
        if (!snapC) {
          addCheck('المشغّلات الثابتة (Fixed Triggers) — أولوية عليا', '§1 و§4 الفلتر 5', '⚠️ غير قابل للفحص',
            'لا لقطة محفوظة لمحرّك القرار. افتح صفحة «محرّك القرار» مرة ثم أعد التصدير.');
          noteMissing('لقطة محرّك القرار', 'لم تُحفظ بعد — الفلاتر والمشغّلات غير مفحوصة آلياً.');
        } else if (!trg.length) {
          addCheck('المشغّلات الثابتة (Fixed Triggers)', '§1', '✅ ممتثل (لا مشغّلات مُعرَّفة)',
            'لم يُعرّف المالك أي trigger ثابت — لا شيء يُطبَّق أو يُخالَف.');
        } else {
          const fired = (snapC.results || []).filter(r => r.trigger?.fired);
          addCheck('المشغّلات الثابتة (Fixed Triggers) — تُطبَّق كما هي بلا تعديل', '§1 و§8',
            fired.length ? '🔴 مشغّل انطبق ويحتاج تنفيذاً' : '✅ ممتثل',
            fired.length
              ? `${fired.length} مشغّل انطبق: ${fired.map(r => `${r.ticker} → ${r.action}`).join('؛ ')} — يتجاوز أي حساب آخر.`
              : `${trg.length} مشغّل مُعرَّف، لم ينطبق أيٌّ منها بالأسعار الحالية.`);
        }
      }

      // ⑥ الدورة النصف سنوية
      {
        const last = reviewLog.length
          ? [...reviewLog].sort((a, b) => String(b.review_date).localeCompare(String(a.review_date)))[0]
          : null;
        if (!last) {
          addCheck('الدورة الروتينية كل 6 أشهر', '§5', '🔴 مخالف',
            'لا توجد أي مراجعة مسجّلة في دفتر المراجعة — الدورة لم تبدأ.');
        } else {
          const days = (today - new Date(last.review_date)) / 86400000;
          addCheck('الدورة الروتينية كل 6 أشهر', '§5',
            days <= 183 ? '✅ ممتثل' : '🔴 مخالف',
            `آخر مراجعة ${last.review_date} — منذ ${days.toFixed(0)} يوماً. ${days > 183 ? `تأخّر ${(days - 183).toFixed(0)} يوماً عن موعد الدورة.` : `متبقٍ ${(183 - days).toFixed(0)} يوماً.`}`);
        }
      }

      // ⑦ طزاجة الأسعار (شرط صحة كل حساب دستوري)
      {
        const tsC = lsGet('tharwa-price-timestamps', {}) || {};
        const staleC = holdings.filter(h => {
          const v = tsC[h.ticker]; if (!v) return true;
          const ms = new Date(v).getTime();
          return !isFinite(ms) || (Date.now() - ms) / 86400000 > 7;
        });
        addCheck('سلامة مدخلات القرار — الأسعار حديثة (≤ 7 أيام)', '§2',
          holdings.length ? (staleC.length ? '⚠️ ضعف في المدخلات' : '✅ ممتثل') : '⚠️ غير قابل للفحص',
          holdings.length
            ? (staleC.length ? `${staleC.length} سهم سعره قديم أو بلا طابع: ${staleC.map(h => h.ticker).join('، ')} — كل وزن وانحراف وXIRR مبني عليها يرث الضعف.` : 'كل الأسعار محدَّثة خلال 7 أيام.')
            : 'لا حيازات.');
      }

      // ⑧ القيمة العادلة — قاعدة التثبيت
      {
        // AUDIT-FIX (2026-08-18): كان lsGet — أي localStorage وحده. حاسبة القيمة
        // العادلة رحّلت السجل إلى user_settings ومسحت النسخة المحلية، و§23 في هذا
        // الملف نفسه يقرؤه بـ syncedGet. فكان التقرير يعلن «لا سجل تقييمات» بينما
        // يسرده كاملاً قبل صفحات — نفس المصدر لكلّ الأقسام.
        const vh = await syncedGet('valuation_history_v1', []);
        const nv = Array.isArray(vh) ? vh.length : 0;
        // AUDIT-FIX (2026-08-18): الرمز يقع داخل inputs (كما يقرؤه decision-engine.js:739
        // و targets.js:224 و tasks.js:131 و§23 في هذا الملف) — قراءته من الجذر كانت
        // تُرجع مجموعة فارغة دائماً فيُعلن التقرير «صفر تقييمات» ويأمر بإعادة تسعير الكل.
        const _vTk = v => String((v && (v.inputs?.ticker ?? v.ticker ?? v.symbol)) || '').trim().toUpperCase();
        const covered = Array.isArray(vh) ? new Set(vh.map(_vTk).filter(Boolean)) : new Set();
        const missingVal = holdings.filter(h => !covered.has(h.ticker));
        addCheck('إعادة تسعير القيمة العادلة بالنموذج الصحيح لكل أصل', '§3 و§4 الفلتر 2',
          !nv ? '⚠️ غير قابل للفحص' : (missingVal.length ? '⚠️ تغطية ناقصة' : '✅ ممتثل'),
          !nv ? 'لا سجل تقييمات محفوظ (valuation_history_v1).'
              : `${nv} تقييماً محفوظاً يغطي ${covered.size} رمزاً. ${missingVal.length ? `**${missingVal.length}** سهماً مملوكاً بلا أي تقييم: ${missingVal.map(h => h.ticker).join('، ')} — الفلتر 2 لا يمكن تشغيله عليها؛ تُعلَن ولا تُقدَّر.` : 'كل الحيازات مُقيَّمة.'}`);
        if (!nv) noteMissing('سجل القيمة العادلة (valuation_history_v1)', 'فارغ — الفلتر 2 غير قابل للتشغيل.');
      }

      // ⑨ الزكاة مستثناة + إعادة استثمار التوزيعات
      addCheck('الزكاة مستثناة من كل الحسابات', '§1', '✅ ممتثل (بالتصميم)',
        'لا يحتوي النظام على أي حقل أو خصم زكوي — الاستثناء مطبَّق بنيوياً.');
      addCheck('كل التوزيعات يُعاد استثمارها', '§1 و§6', '⚠️ يُتحقَّق يدوياً',
        `إجمالي التوزيعات المستلمة ${SAR(_totalDiv)} ر.س مقابل ${SAR(_totalBuys)} ر.س مشتريات. النظام لا يربط توزيعة بصفقة شراء، فلا يمكن إثبات إعادة الاستثمار آلياً — يُعلَن ولا يُفترض.`);

      // ⑩ هدف الدخل
      {
        const goalMonthly = +retGoal.monthly || 0;
        const fwdMonthly  = (_fwd?.total || 0) / 12;
        addCheck('هدف الدخل 5,000 ر.س شهرياً بحلول 2045', '§1',
          !goalMonthly ? '⚠️ غير قابل للفحص' : (fwdMonthly >= goalMonthly ? '✅ الهدف مُحقَّق' : '🟡 قيد البناء'),
          !goalMonthly ? 'لم يُسجَّل هدف شهري في صفحة التقاعد.'
            : `الدخل التوزيعي المتوقع حالياً ${SAR(fwdMonthly)} ر.س/شهر مقابل هدف ${SAR(goalMonthly)} ر.س — نسبة التغطية ${PCT(goalMonthly > 0 ? fwdMonthly / goalMonthly * 100 : 0)}.`);
      }

      p(mdTable(['القاعدة','المرجع','النتيجة','التفصيل'], checks));

      h3('خلاصة الامتثال');
      {
        const bad  = checks.filter(c => c[2].startsWith('🔴')).length;
        const warn = checks.filter(c => c[2].startsWith('⚠️') || c[2].startsWith('🟡')).length;
        const good = checks.length - bad - warn;
        p(`**${checks.length}** قاعدة فُحصت: **${good}** ممتثلة ✅ | **${bad}** مخالفة 🔴 | **${warn}** تحتاج بيانات أو تحقّقاً يدوياً ⚠️`);
        p(bad
          ? `\n🔴 **يوجد ${bad} خرق دستوري صريح.** الدستور §4 الفلتر 5: أي سقف يُكسر يفرض التخفيف بغض النظر عن القيمة العادلة. راجع «ما يحتاج قراراً الآن».`
          : '\n✅ **لا خرق دستوري صريح في الأسقف الصلبة.** البنود ⚠️ ليست مخالفات بل فجوات بيانات — تُسدّ بإدخال البيانات الناقصة، لا بتقديرها.');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 37. ما يحتاج قراراً الآن — مرتَّب بالأولوية
    // ════════════════════════════════════════════════════════
    book('A');
    await tick('ما يحتاج قراراً');
    h2('37. ما يحتاج قراراً الآن — مرتَّب بالأولوية');
    p('ترتيب الأولوية دستورياً (§7): المشغّلات الثابتة ← كسر سقف ← فشل استدامة ← فرص إضافة ← صيانة بيانات. كل بند مربوط بالقاعدة التي أطلقته. البنود التي لا قاعدة لها لا تظهر هنا.');
    {
      const actions = [];
      const addAct = (prio, label, what, why) => actions.push({ prio, label, what, why });

      const snapD = await syncedGet('decision_engine_snapshot_v1', null);
      const gm2   = _totalMkt;

      // أولوية 1 — المشغّلات الثابتة
      (snapD?.results || []).filter(r => r.trigger?.fired).forEach(r => {
        addAct(1, `⚡ ${r.ticker} — ${r.name || ''}`,
          r.action === 'exit' ? 'خروج كامل' : r.action === 'trim' ? 'تخفيف' : String(r.action || '—'),
          `انطبق trigger ثابت مُعرَّف من المالك — يتجاوز أي حساب آخر (§1 و§4 الفلتر 5). ${esc(r.reason || '')}`);
      });

      // أولوية 2 — كسر سقف الوزن
      if (gm2 > 0) {
        const deCfgD = await syncedGet('decision_engine_v1', {}) || {};
        holdings.forEach(h => {
          const w    = (+h.shares * +h.current_price) / gm2 * 100;
          // AUDIT-FIX (2026-08-18، الدفعة الثانية): كوميت cd45f18 أصلح §36 وفوّت هذا
          // الموضع — وهو الأخطر لأنه يُصدر **أمر البيع** لا مجرد حكم امتثال. بلا
          // fallback أرامكو كان يقرأ سقفها 7% ويأمر بقصّ سهم ممتثل عند 12%.
          // نفس منطق decision-engine.js:164-170 و targets.js:123-129.
          const _cfgD = deCfgD[h.ticker];
          const blue = (_cfgD && (_cfgD.blueChip === true || _cfgD.isBlueChip === true))
            ? true
            : (_cfgD && _cfgD.blueChip === false ? false : h.ticker === '2222');
          const cap  = blue ? 12 : 7;
          if (w > cap + 0.75) {
            const excessVal = (w - cap) / 100 * gm2;
            addAct(2, `⚖️ ${h.ticker} — ${h.name || ''}`,
              `قصّ لإرجاع الوزن إلى ${cap}% (≈ ${SAR(excessVal)} ر.س)`,
              `الوزن ${PCT(w)} فوق السقف ${cap}%${blue ? ' (قيادي)' : ''} — خطر تركيز، الفلتر 4. التخفيف جزئي بقدر ما يعيد الوزن للسقف فقط.`);
          }
        });
        // كسر سقف القطاع
        const secD = {};
        holdings.forEach(h => { const s = h.sector || 'غير مصنف'; secD[s] = (secD[s] || 0) + +h.shares * +h.current_price; });
        Object.entries(secD).forEach(([s, v]) => {
          const w = v / gm2 * 100;
          if (w > 26.25) addAct(2, `🏷️ قطاع ${s}`, 'خفض الانكشاف القطاعي إلى 25%',
            `القطاع عند ${PCT(w)} فوق سقف 25% + السماح — تنبيه تركيز قطاعي (الفلتر 4).`);
        });
      }

      // أولوية 3 — فشل بوابة الاستدامة
      (snapD?.results || []).filter(r => r.sustain?.status === 'fail').forEach(r => {
        addAct(3, `🔴 ${r.ticker} — ${r.name || ''}`, 'خروج',
          `فشل بوابة الاستدامة (الفلتر 1) — الخروج واجب بغض النظر عن السعر؛ النزول هنا إشارة خروج لا إشارة شراء. ${esc(r.sustain?.reason || '')}`);
      });
      (snapD?.results || []).filter(r => r.sustain?.status === 'watch').forEach(r => {
        addAct(4, `👁️ ${r.ticker} — ${r.name || ''}`, 'مراقبة لصيقة',
          `قلق مؤقت في بوابة الاستدامة — لا يفرض إجراءً بعد، لكنه يمنع أي إضافة جديدة. ${esc(r.sustain?.reason || '')}`);
      });

      // أولوية 5 — فرص إضافة
      (snapD?.results || []).filter(r => r.action === 'add').forEach(r => {
        addAct(5, `🟢 ${r.ticker} — ${r.name || ''}`, 'تجميع مشروط',
          `نجح الفلتر 1، والسعر تحت القيمة العادلة، والوزن دون الهدف (الفلتر 3). الشراء عند النزول مشروط لا آلي. ${esc(r.reason || '')}`);
      });

      // أولوية 6 — صيانة البيانات (تمنع تشغيل الفلاتر)
      {
        const tsD = lsGet('tharwa-price-timestamps', {}) || {};
        const staleD = holdings.filter(h => {
          const v = tsD[h.ticker]; if (!v) return true;
          const ms = new Date(v).getTime();
          return !isFinite(ms) || (Date.now() - ms) / 86400000 > 7;
        });
        if (staleD.length) addAct(6, '🗓️ تحديث الأسعار',
          `حدِّث سعر ${staleD.length} سهم: ${staleD.map(h => h.ticker).join('، ')}`,
          'الأسعار القديمة تُفسد الوزن والانحراف وXIRR ومحرّك القرار — صيانة مدخلات لا قرار استثماري.');

        if (!snapD) addAct(6, '⚙️ تشغيل محرّك القرار',
          'افتح صفحة «محرّك القرار» مرة واحدة',
          'لا لقطة محفوظة — الفلاتر 1–5 لم تُشغَّل على البيانات الحالية، فلا يمكن إصدار قرارات مربوطة بقاعدة.');

        const vhD = await syncedGet('valuation_history_v1', []);
        const _vTkD = v => String((v && (v.inputs?.ticker ?? v.ticker ?? v.symbol)) || '').trim().toUpperCase();
        const covD = Array.isArray(vhD) ? new Set(vhD.map(_vTkD).filter(Boolean)) : new Set();
        const noVal = holdings.filter(h => !covD.has(h.ticker));
        if (noVal.length) addAct(6, '🧮 تقييم القيمة العادلة',
          `قيّم ${noVal.length} سهماً بلا تقييم: ${noVal.map(h => h.ticker).join('، ')}`,
          'الفلتر 2 (إعادة تسعير القيمة العادلة) لا يمكن تشغيله بلا قيمة عادلة — والدستور §8 يمنع تقديرها بصمت.');

        const lastR = reviewLog.length ? [...reviewLog].sort((a, b) => String(b.review_date).localeCompare(String(a.review_date)))[0] : null;
        const dLast = lastR ? (today - new Date(lastR.review_date)) / 86400000 : null;
        if (dLast == null || dLast > 183) addAct(6, '📅 الدورة النصف سنوية',
          'نفّذ مراجعة الدورة وسجّلها في دفتر المراجعة',
          dLast == null ? 'لا مراجعة مسجّلة إطلاقاً (§5).' : `آخر مراجعة منذ ${dLast.toFixed(0)} يوماً — تجاوزت 183 يوماً (§5).`);
      }

      if (actions.length) {
        actions.sort((a, b) => a.prio - b.prio);
        const PL = { 1:'1 — مشغّل ثابت', 2:'2 — كسر سقف', 3:'3 — فشل استدامة', 4:'4 — قلق استدامة', 5:'5 — فرصة إضافة', 6:'6 — صيانة بيانات' };
        p(mdTable(['الأولوية','البند','الإجراء','السبب (القاعدة التي اشتغلت)'],
          actions.map(a => [PL[a.prio] || String(a.prio), a.label, a.what, a.why])));

        h3('الشكل الدستوري للتنبيهات (§7)');
        actions.filter(a => a.prio <= 3).forEach(a => {
          p('```');
          p(`${a.label}`);
          p(`→ الإجراء: ${a.what}`);
          p(`→ السبب: ${a.why}`);
          p('```');
        });

        const p1 = actions.filter(a => a.prio === 1).length;
        const p2 = actions.filter(a => a.prio === 2).length;
        const p3 = actions.filter(a => a.prio === 3).length;
        p(`\n**الخلاصة:** ${actions.length} بنداً يحتاج انتباهاً — منها **${p1}** مشغّل ثابت، **${p2}** كسر سقف، **${p3}** فشل استدامة. ${p1 + p2 + p3 > 0 ? '🔴 هذه الثلاثة إلزامية دستورياً ولا تحتمل تأجيلاً.' : '✅ لا شيء إلزامي — الباقي فرص وصيانة.'}`);
      } else {
        p('✅ **لا بند يحتاج قراراً الآن.** لا مشغّل انطبق، ولا سقف انكسر، ولا بوابة استدامة فشلت، ولا فجوة بيانات حرجة. الإجراء الدستوري: **احتفظ**.');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 38. البيانات الخام الكاملة — كل صف وكل عمود
    // ════════════════════════════════════════════════════════
    book('D');
    await tick('البيانات الخام');
    h2('38. البيانات الخام الكاملة — كل صف وكل عمود');
    p('نسخة حرفية من كل جدول في قاعدة البيانات كما هو، بكل أعمدته بلا انتقاء وبلا عيّنة. الهدف: أي رقم في التطبيق يمكن تتبّعه إلى مصدره هنا. العمود `user_id` محذوف (قيمة واحدة مكرَّرة، بلا فائدة تحليلية).');
    {
      const dumpTable = (label, rows, note) => {
        h3(`${label} — ${Array.isArray(rows) ? rows.length : 0} صف`);
        if (note) p(note);
        if (!Array.isArray(rows) || !rows.length) { p('_لا صفوف._'); return; }
        const keys = [...new Set(rows.flatMap(r => Object.keys(r || {})))].filter(k => k !== 'user_id');
        if (!keys.length) { p('_لا أعمدة._'); return; }
        p(mdTable(keys, rows.map(r => keys.map(k => {
          const v = (r || {})[k];
          if (v == null) return '—';
          if (typeof v === 'object') {
            const j = JSON.stringify(v);
            return j.length > 300 ? j.slice(0, 300) + '…(مقتطع)' : j;
          }
          const s = String(v);
          // الحقول الثنائية الضخمة (مرفقات base64) تُختصر — يُعلَن الاختصار
          return s.length > 300 ? `${s.slice(0, 120)}…(${s.length} حرفاً — مقتطع)` : s;
        }))));
      };

      dumpTable('holdings — الحيازات', holdings);
      dumpTable('transactions — المعاملات', transactions);
      dumpTable('dividends — التوزيعات', dividends);
      dumpTable('cashflow_entries — التدفقات النقدية', cashflows);
      dumpTable('net_worth_snapshots — لقطات صافي الثروة', snapshots);
      dumpTable('nw_assets — الأصول', assets);
      dumpTable('nw_liabilities — الالتزامات', liabilities);
      dumpTable('real_estate — العقارات', realEstate);
      dumpTable('stock_targets — أهداف الأسهم', stockTargets);
      dumpTable('sector_targets — أهداف القطاعات', sectorTargets);
      dumpTable('watchlist — قائمة المراقبة', watchlist);
      dumpTable('portfolio_tasks — المهام', tasks);
      dumpTable('user_stocks — قاعدة الأسهم المتابَعة', userStocks);
      dumpTable('review_log — دفتر المراجعة', reviewLog);
      dumpTable('portfolio_cash — النقد غير المستثمر', portfolioCashRows);
      dumpTable('review_log_attachments — مرفقات المراجعة', reviewAttachments,
        'محتوى الملفات الثنائية (base64) مقتطع عمداً — يبقى في النسخة الاحتياطية لا في التقرير.');

      h3('سجل القيمة العادلة الخام (valuation_history_v1)');
      {
        const vhRaw = await syncedGet('valuation_history_v1', []);
        if (Array.isArray(vhRaw) && vhRaw.length) {
          p(`عدد التقييمات المسجّلة: **${vhRaw.length}**. كل مدخلات كل نموذج كما حُفظت.`);
          const vk = [...new Set(vhRaw.flatMap(v => Object.keys(v || {})))];
          p(mdTable(vk, vhRaw.map(v => vk.map(k => {
            const x = (v || {})[k];
            if (x == null) return '—';
            if (typeof x === 'object') { const j = JSON.stringify(x); return j.length > 400 ? j.slice(0, 400) + '…' : j; }
            const s = String(x);
            return s.length > 400 ? s.slice(0, 400) + '…' : s;
          }))));
        } else {
          p('_لا سجل تقييمات محفوظ._');
        }
      }

      h3('تاريخ مؤشر تاسي الخام (كل نقطة مسجّلة)');
      {
        const bmRaw = Array.isArray(benchmark) ? benchmark : [];
        if (bmRaw.length) {
          const bk = [...new Set(bmRaw.flatMap(v => Object.keys(v || {})))];
          p(`عدد النقاط: **${bmRaw.length}** — كل نقطة أدخلها المالك يدوياً، بلا اقتطاع.`);
          p(mdTable(bk, bmRaw.map(v => bk.map(k => {
            const x = (v || {})[k];
            return x == null ? '—' : (typeof x === 'object' ? JSON.stringify(x) : String(x));
          }))));
        } else {
          p('_لا نقاط مؤشر مسجّلة._');
        }
      }

      h3('الإعدادات المتزامنة الخام (user_settings)');
      {
        const rawKeys = [
          ['retirement_goal_v1', retGoal], ['salary_planner_v1', salaryData],
          ['sukuk_planner_v1', sukukData], ['life_goals_v1', lifeGoals],
        ];
        rawKeys.forEach(([k, v]) => {
          p(`**${k}:**`);
          p('```json');
          try {
            const j = JSON.stringify(v, null, 2);
            p(j.length > 20000 ? j.slice(0, 20000) + '\n…(مقتطع — راجع النسخة الاحتياطية للكامل)' : j);
          } catch { p('(تعذّرت السلسلة إلى JSON)'); }
          p('```');
        });
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // تجميع التقارير الأربعة وتنزيلها
    // ════════════════════════════════════════════════════════
    await tick('تجميع الملفات');

    // ── قسم افتتاحي: الحالة في سطور (يُبنى الآن لأنه يحتاج كل الحسابات) ──
    const AT_A_GLANCE = [];
    {
      const g = t => AT_A_GLANCE.push(t + '\n');
      const _liabNow    = activeLiabilities.reduce((s, l) => s + (+l.value || 0), 0);
      const netWorthNow = _totalMkt + portfolioCash + _sukukActive + _reVal + _assetVal - _liabNow;
      const realizedNow = (() => {
        const m = {};
        transactions.forEach(t => {
          const e = m[t.ticker] || (m[t.ticker] = { bs: 0, bc: 0, sr: 0, ss: 0 });
          if (t.type === 'buy' || t.type === 'grant') { e.bc += +t.total; e.bs += +t.shares; }
          if (t.type === 'sell') { e.sr += +t.total; e.ss += +t.shares; }
        });
        return Object.values(m).reduce((s, v) => v.bs < 0.001 ? s : s + v.sr - (v.bc / v.bs) * v.ss, 0);
      })();
      const unrealNow  = _totalMkt - _totalCost;
      const fwdMonthly = (_fwd?.total || 0) / 12;
      const goalM      = +retGoal.monthly || 0;
      const cover      = goalM > 0 ? fwdMonthly / goalM * 100 : null;

      // الجدول يُبنى ككتلة واحدة ثم يُدفع مرة واحدة — دفع كل صف على حدة
      // يُدخل سطراً فارغاً بينها عند التجميع بـ join('\n') فينكسر الجدول.
      const rows = [];
      const row = (k, v, m) => rows.push([k, v, m]);
      row('عدد الأسهم المملوكة', String(holdings.length),
          holdings.length < 18 ? 'دون الحد الأدنى الدستوري 18' : holdings.length > 25 ? 'فوق السقف الدستوري 25' : 'داخل النطاق 18–25 ✅');
      row('القيمة السوقية للأسهم', SAR(_totalMkt) + ' ر.س', 'ما تساويه حيازاتك اليوم بأسعارك المُدخَلة');
      row('تكلفة الحيازات', SAR(_totalCost) + ' ر.س', 'ما دفعته فعلاً مقابل ما تملكه الآن');
      row('ربح/خسارة ورقية', (unrealNow >= 0 ? '+' : '') + SAR(unrealNow) + ' ر.س',
          unrealNow >= 0 ? 'مكسب غير محقَّق — لا يصير نقداً إلا بالبيع' : 'خسارة غير محقَّقة — ليست سبب بيع بذاتها (§8)');
      row('ربح/خسارة محقَّقة', (realizedNow >= 0 ? '+' : '') + SAR(realizedNow) + ' ر.س', 'نتيجة صفقات البيع المُغلقة فعلياً');
      row('إجمالي التوزيعات المستلمة', SAR(_totalDiv) + ' ر.س', 'دخل نقدي فعلي دخل جيبك منذ البداية');
      row('الدخل التوزيعي المتوقع', SAR(_fwd?.total || 0) + ' ر.س/سنة', `أي ${SAR(fwdMonthly)} ر.س شهرياً بمعدل التوزيع الحالي`);
      row('هدف الدخل الشهري', goalM ? SAR(goalM) + ' ر.س' : 'غير مسجّل',
          cover == null ? 'سجّل الهدف في صفحة التقاعد ليُقاس التقدّم' : `التغطية الحالية ${PCT(cover)} من الهدف`);
      row('النقد غير المستثمر', SAR(portfolioCash) + ' ر.س', 'سيولة جاهزة — لا تُحتسب في عائد الأسهم');
      row('العمولات والضرائب المدفوعة', SAR(_totalComm) + ' ر.س', 'كلفة الاحتكاك التراكمية لقراراتك');
      row('صافي الثروة التقديري', SAR(netWorthNow) + ' ر.س', 'أسهم + نقد + صكوك + عقار + أصول − التزامات');
      g(mdTable(['المؤشر', 'القيمة', 'ماذا يعني'], rows));
      g('**الأحكام الثلاثة السريعة:**');
      g('1. **هل المحفظة ممتثلة للدستور؟** راجع §36 — الفحص آلي قاعدة بقاعدة.');
      g('2. **هل يوجد ما يحتاج قراراً اليوم؟** راجع §37 — مرتَّب بالأولوية الدستورية.');
      g('3. **هل الأرقام موثوقة؟** راجع §28 (طزاجة الأسعار) و«المصادر المتعذّرة» — أي رقم مبني على سعر قديم يرث ضعفه.');
    }

    // ── قسم المصادر المتعذّرة (يُلحق بكل تقرير) ──
    const MISSING_BLOCK = [];
    {
      const g = t => MISSING_BLOCK.push(t + '\n');
      g('\n<a id="missing-sources"></a>\n');
      g('## ⚠️ المصادر المتعذّرة وفجوات البيانات\n');
      g('الدستور §8 يمنع التقدير الصامت وحذف المصادر بصمت. كل مصدر لم يُدرَج يُعلَن هنا مع السبب.\n');
      if (missingSources.length) {
        // كتلة واحدة — لا دفع صف صف (يكسر الجدول بأسطر فارغة)
        g(mdTable(['المصدر', 'لماذا تعذّر', 'الأثر'],
          missingSources.map(m => [m.name, m.why, 'أي تحليل يعتمد عليه يظهر «غير متوفر» ولا يُقدَّر'])));
      } else {
        g('✅ **لا مصدر متعذّر.** كل مصادر البيانات المتاحة أُدرجت في هذه التقارير.\n');
      }
      g('\n**ملاحظة على الحدود:** الجداول تُجلب بترقيم صفحات 1000 صف/دفعة (`fetchAllRows`)، فلا اقتطاع صامت مهما كبر الجدول. القيم الثنائية الضخمة (مرفقات base64) تُقتطع في §38 عمداً — الكامل في النسخة الاحتياطية.\n');
    }

    // ── بناء ملف كل تقرير ──
    const stamp    = `${MONTHS[today.getMonth()]} ${today.getFullYear()}`;
    const bookList = Object.values(BOOKS);
    const files    = [];

    for (const b of bookList) {
      const head = [];
      head.push(`# ${b.title} — محفظة ثروة\n`);
      head.push(`> **الجزء ${b.key} من ${bookList.length}** — ${b.desc}\n`);
      head.push(`**تاريخ التصدير:** ${dateStr}  `);
      head.push(`**المستخدم:** ${user.email}  `);
      head.push(`**الفترة المراجَعة:** ${stamp}\n`);
      head.push('**سلسلة التقارير الكاملة — كلها تُقرأ معاً:**\n');
      bookList.forEach(x => {
        head.push(`- ${x.key === b.key ? '**➤ ' : ''}الجزء ${x.key}: ${x.title}${x.key === b.key ? ' (هذا الملف)**' : ''} — \`tharwa_${x.file}_${dateStr}.md\` — ${x.desc}`);
      });
      head.push('\n---\n');

      // الحالة في سطور — في مقدمة الجزء A فقط
      if (b.key === 'A') {
        head.push('\n<a id="at-a-glance"></a>\n');
        head.push('## 📊 الحالة في سطور\n');
        head.push('خلاصة تنفيذية لكل ما يهم في جدول واحد. التفاصيل والبراهين في الأقسام المرقّمة.\n');
        head.push(...AT_A_GLANCE);
        head.push('\n---\n');
      }

      // دليل القراءة
      head.push('\n<a id="reading-guide"></a>\n');
      head.push('## 🔍 دليل القراءة\n');
      head.push('هذه التقارير تحتوي كامل بيانات المحفظة الشخصية. مصمَّمة لتُقرأ مباشرةً — بشرياً أو بنموذج ذكاء اصطناعي — بلا حاجة لفتح التطبيق.\n');
      head.push(...READING_GUIDE);
      head.push('\n---\n');

      // الفهرس
      head.push('\n<a id="toc"></a>\n');
      head.push('## 📑 فهرس هذا الجزء\n');
      if (b.key === 'A') head.push('- [📊 الحالة في سطور](#at-a-glance)');
      head.push('- [🔍 دليل القراءة](#reading-guide)');
      b.toc.forEach(e => head.push(`${e.lvl === 3 ? '  - ' : '- '}[${e.t}](#${e.a})`));
      head.push('- [⚠️ المصادر المتعذّرة وفجوات البيانات](#missing-sources)');
      head.push('\n---\n');

      const tail = [];
      tail.push(...MISSING_BLOCK);
      tail.push('\n---\n');
      tail.push(`_الجزء ${b.key} من ${bookList.length} — تم توليده تلقائياً من تطبيق ثروة، مفكرة حسابية شخصية._`);
      tail.push('_الأرقام تعكس البيانات المُدخَّلة يدوياً ولا تمثّل توصيات استثمارية._');
      tail.push(`_للصورة الكاملة اقرأ الأجزاء الأربعة معاً: ${bookList.map(x => x.key).join(' + ')}._`);

      const text = head.concat(b.lines, tail).join('\n');
      files.push({ name: `tharwa_${b.file}_${dateStr}.md`, text, book: b });
      b.lines.length = 0;   // تحرير الذاكرة فور التجميع
    }

    // ── تنزيل الملفات الأربعة تباعاً ──
    let grandLines = 0, grandBytes = 0;
    const parts = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const nLines = f.text.split('\n').length;
      const nBytes = new Blob([f.text]).size;
      grandLines += nLines; grandBytes += nBytes;
      parts.push(`${f.book.key}: ${nLines.toLocaleString('en-US')} سطر`);

      setStatus('md-export-status', 'info', `جارٍ تنزيل الجزء ${f.book.key} (${i + 1}/${files.length})…`);
      const blob = new Blob([f.text], { type: 'text/markdown;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = f.name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      f.text = '';   // تحرير الذاكرة
      // مهلة بين التنزيلات — المتصفحات تُسقط التنزيلات المتلاحقة
      if (i < files.length - 1) await new Promise(r => setTimeout(r, 400));
    }

    setStatus('md-export-status', 'success',
      `✓ تم تصدير ${files.length} تقارير — ${grandLines.toLocaleString('en-US')} سطر إجمالاً | ${(grandBytes / 1024).toFixed(1)} KB  (${parts.join(' · ')})`);
    showToast(`✓ تم تصدير ${files.length} تقارير (${grandLines.toLocaleString('en-US')} سطر)`, 'success');

  } catch (err) {
    setStatus('md-export-status', 'error', '✗ ' + err.message);
    showToast('فشل التصدير: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '📋 تصدير التقارير الأربعة (.md)';
  }
}

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

// نظام التصميم لا يعرّف .status-warning — نُسقط «warning» على .status-info
// (النص نفسه يحمل ⚠️) بدل صنف بلا تنسيق يجعل التحذير غير مرئي.
const STATUS_CLASS = {
  info:    'status-info',
  success: 'status-success',
  error:   'status-error',
  warning: 'status-info',
};

function setStatus(elId, type, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;                                      // textContent — لا حقن HTML
  el.className   = `backup-status ${STATUS_CLASS[type] || 'status-info'}`;
  el.style.display = 'block';
}

// ── عرض التقارير المفصّلة — نظام التصميم فقط (note / tag / kvs / info-table) ──
// كل محتوى نصي يمرّ عبر esc() في موضع البناء؛ هذه الدوال تستقبل HTML مبنياً مسبقاً.
function setReport(elId, html) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = html || '';
  el.style.display = html ? 'block' : 'none';
}

function noteHtml(state, innerHtml) {
  return `<div class="note" data-state="${esc(state)}" style="margin-top:12px">${innerHtml}</div>`;
}

function tableHtml(headers, rowsHtml) {
  if (!rowsHtml) return '';
  return `<div style="overflow-x:auto;margin-top:12px"><table class="info-table">` +
    `<thead><tr>${headers.map(h => `<th style="text-align:start;padding:8px 12px;color:var(--text-2);font-size:0.78rem;border-bottom:1px solid var(--border)">${esc(h)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rowsHtml}</tbody></table></div>`;
}

init();
