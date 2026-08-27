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
  // ── أُضيف 2026-08-25 مع نظام التنبيهات ──
  'notification_prefs', // بريد التنبيهات ومفاتيح التفعيل — تفضيل شخصي محمول بين الأجهزة
];

// ══════════════════════════════════════════════════════════════
// جداول مستثناة من النسخة **عمداً** — لا سهواً.
// كاشف الجداول غير المسجَّلة يقرأ هذه القائمة فلا يُنبّه عليها كل مرة.
// أي جدول جديد لا يُدرج هنا ولا في TABLES سيظل يُبلَّغ عنه — وهذا مقصود.
const INTENTIONALLY_UNBACKED = {
  push_subscriptions:
    'مرتبط بجهاز ومتصفح بعينه (endpoint فريد). استعادته على جهاز آخر تكتب اشتراكات ميتة ' +
    'لا يصلها شيء، وتُظهر عدّاد أجهزة كاذباً. يُعاد إنشاؤه بضغطة تفعيل واحدة.',
  alert_state:
    'حالة تسليح مشتقّة تُعيد بناء نفسها من أول فحص دوري (غياب الصفّ = مُسلَّح). ' +
    'استعادة حالة قديمة قد تكتم تنبيهاً مستحقاً أو تُطلق آخر مكرَّراً.',
  consent_logs:
    'سجل موافقة قانوني ثابت بلا سياسة حذف — استعادته تُفقده معناه القانوني.',
  data_erasure_requests: 'سجل إجرائي إداري لا بيانات محفظة.',
};

// ══════════════════════════════════════════════════════════════
// كشف جدول جديد لم يُسجَّل في TABLES — AUDIT-FIX 2026-08-21 (#17)
// القائمة أعلاه يدوية: أي جدول يُضاف للمخطّط ولا يُضاف هنا يفوت النسخة
// الاحتياطية بالكامل وبصمت (حدث فعلاً مع support_tickets و user_profiles).
// PostgREST ينشر مواصفة OpenAPI على جذر /rest/v1/ تسرد كل جدول يراه الدور
// الحالي — نقارنها بـTABLES ونُعلن الفرق. عند تعذّر الجلب نُعلن التعذّر ولا
// ندّعي الاكتمال (§8: لا فشل صامت).
async function detectUnlistedTables() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SUPABASE_KEY, Accept: 'application/openapi+json' },
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const spec = await res.json();
    const seen = spec && spec.definitions ? Object.keys(spec.definitions)
               : (spec && spec.paths ? Object.keys(spec.paths).filter(k => k.startsWith('/') && k.length > 1).map(k => k.slice(1)) : []);
    const known = new Set(TABLES);
    const unlisted = seen.filter(t => t && !t.startsWith('rpc/') && !known.has(t)
                                       && !INTENTIONALLY_UNBACKED[t]).sort();
    const missing  = TABLES.filter(t => !seen.includes(t)).sort();
    return { ok: true, seen: seen.length, unlisted, missing };
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e) };
  }
}

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
// دورة المراجعة النصف سنوية (الدستور §5) — نفس ثابت review-log.js:75 حرفياً.
// AUDIT-FIX 2026-08-21 (#36): كان التقرير يستعمل 183 والدفتر 180، فيتناقض حكماهما
// على نفس السهم في نفس اليوم. أي تعديل هنا يُطبَّق على review-log.js أيضاً.
const REVIEW_CYCLE_DAYS = 180;

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
// عمود الترتيب لكل جدول — الافتراضي المفتاح الأساسي id، والاستثناء الجداول
// ذات المفتاح المركّب. يُستخدم لجعل ترقيم الصفحات قطعياً في النسخة الاحتياطية.
const ORDER_COL = { user_settings: 'key' };

async function fetchAllRows(table, customize) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabaseClient.from(table).select('*');
    if (customize) q = customize(q);
    // AUDIT-FIX (2026-08-21): الترقيم بلا ORDER حاسم غير مضمون — Postgres لا
    // يضمن ترتيباً مستقراً بين استعلامين، فقد يتكرر صف أو يسقط بصمت في جدول
    // يتجاوز 1000 صف (transactions تبلغه بسهولة). ولا يكشفه أي تحقق لاحق:
    // البصمة تُحسب على المجلوب نفسه، واختبار الرحلة يقارن الجلبة بنسختها.
    // الترتيب بالمفتاح الأساسي يجعل الترقيم قطعياً.
    // user_settings مفتاحه مركّب (user_id, key) بلا عمود id — لكل جدول عموده
    const orderCol = ORDER_COL[table] || 'id';
    q = q.order(orderCol, { ascending: true });
    let { data, error } = await q.range(from, from + PAGE - 1);
    if (error && (error.code === '42703' || /column .* does not exist/i.test(error.message || ''))) {
      // عمود ترتيب غير موجود: نُعيد بلا ترتيب بدل إسقاط الجدول كاملاً،
      // ونُعلن ذلك لأن الترقيم يفقد قطعيّته حينها.
      console.warn(`[backup] ${table}: تعذّر الترتيب بـ${orderCol} — ترقيم بلا ترتيب`);
      let q2 = supabaseClient.from(table).select('*');
      if (customize) q2 = customize(q2);
      ({ data, error } = await q2.range(from, from + PAGE - 1));
    }
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
  const g = +(localStorage.getItem(userLsKey('tharwa-alert-green'))  ?? localStorage.getItem('tharwa-alert-green')  ?? DEV_IGNORE);
  const y = +(localStorage.getItem(userLsKey('tharwa-alert-yellow')) ?? localStorage.getItem('tharwa-alert-yellow') ?? DEV_PUMP);
  const gEl = document.getElementById('thresh-green');
  const yEl = document.getElementById('thresh-yellow');
  if (gEl) gEl.value = g;
  if (yEl) yEl.value = y;
}

function saveAlertThresholds() {
  // ⚠️ الافتراضيان هما ثابتا الدستور لا أرقام مكتوبة. كان `|| 1` يكتب
  // 1% مكان 1.5% (م.49)، والمفتاح نفسه يقرؤه محرّك القرار ولوحة التحكم —
  // فانحرافٌ في نطاق «لا إجراء» الدستوري كان يولّد اقتراح تصحيح.
  // ونستعمل فحص isFinite لا `||` حتى لا يبتلع صفراً أدخله المالك عمداً.
  const _gRaw = parseFloat(document.getElementById('thresh-green').value);
  const _yRaw = parseFloat(document.getElementById('thresh-yellow').value);
  const g = Number.isFinite(_gRaw) ? _gRaw : DEV_IGNORE;
  const y = Number.isFinite(_yRaw) ? _yRaw : DEV_PUMP;
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
  // ⚠️ إعادة الضبط تكتب **القيم الدستورية** لا أرقاماً مكتوبة.
  // م.49: ±1.5% ⇒ لا إجراء · 1.5–3% ⇒ تصحيح بالضخّ. وكانت تكتب 1 و٣،
  // والمحرّك يقرأ المفتاح نفسه — فيتخلّى عن 1.5 الدستورية بضغطة زرّ.
  localStorage.setItem(userLsKey('tharwa-alert-green'),  DEV_IGNORE);
  localStorage.setItem(userLsKey('tharwa-alert-yellow'), DEV_PUMP);
  loadAlertThresholds();
  const el = document.getElementById('thresh-status');
  el.textContent = `↩ تمت إعادة الضبط إلى القيم الدستورية (${DEV_IGNORE}% / ${DEV_PUMP}%) — م.49`;
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

    // AUDIT-FIX 2026-08-21 (#17): TABLES قائمة يدوية — جدول يُضاف للمخطّط ولا
    // يُضاف إليها يفوت النسخة بالكامل وبصمت. نستجوب مواصفة PostgREST بعد كل
    // تصدير ونُعلن أي جدول خارج القائمة فوق التقرير مباشرةً.
    const _det = await detectUnlistedTables();
    const _detHtml = !_det.ok
      ? noteHtml('warn', `⚠️ تعذّر التحقق من اكتمال قائمة الجداول (${esc(_det.reason)}) — لا يمكن تأكيد أن النسخة تغطي كل جدول.`)
      : _det.unlisted.length
        ? noteHtml('bad', `🔴 <b>${esc(_det.unlisted.length)}</b> جدولاً في قاعدة البيانات <b>خارج</b> هذه النسخة: <code>${esc(_det.unlisted.join('، '))}</code> — أضِفه إلى <code>TABLES</code> في <code>js/settings.js</code> ثم أعد التصدير.`)
        : '';

    setReport('backup-report',
      _detHtml +
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
        // AUDIT-FIX 2026-08-21: الفحص التجريبي يُدرج الصف الأول فعلياً ثم يحذفه.
        // في كل الجداول الصف الزائد بيانات مرئية، أما في `user_settings` فهو
        // **إعداد** تقرؤه الصفحات كحقيقة: مدخلات محرّك القرار، هدف التقاعد،
        // سجل التقييمات… فلو فشل الحذف (سياسة RLS، انقطاع شبكة) بقي إعداد من ملف
        // نسخة **لم يوافق المالك على استعادته بعد** يحكم قرارات الحساب صامتاً.
        // الحل: نفحص المخطّط بمفتاح اصطناعي لا تقرؤه أي صفحة، فالفشل يترك صفاً
        // خاملاً بدل إعداد فعّال. نحتفظ بشكل القيمة كما هو ليبقى الفحص حقيقياً.
        if (table === 'user_settings') {
          probeRow.key = '__restore_probe__';
        }
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
          // حزام أمان ثانٍ للمفتاح الاصطناعي: يُحذف دائماً أياً كان مسار التنظيف
          // أعلاه، فلا يبقى أثر للفحص حتى لو تغيّر شكل الصف المُعاد.
          if (table === 'user_settings') {
            try { await supabaseClient.from(table).delete().eq('user_id', user.id).eq('key', '__restore_probe__'); } catch (_) {}
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
    const skippedDeletes = [];
    for (const table of deleteOrder(TABLES)) {
      // AUDIT-FIX (2026-08-21): كان الحذف يمرّ على كل الجداول ثم يتخطّى الإدراج
      // صامتاً للجدول الغائب عن الملف — فملف نسخة أقدم من إضافة جدول (مثل
      // user_settings المُضاف 2026-06-16، ورقم الإصدار لم يتغيّر فلا يميّزه)
      // يمحو الجدول كاملاً بلا بديل: مدخلات محرّك القرار وسجل التقييمات وهدف
      // التقاعد والراتب والصكوك وسجل تاسي… جميعها في user_settings.
      // القاعدة الآن: **لا يُحذف ما لا يُستبدَل.**
      const rowsForTable = backup[table];
      if (!Array.isArray(rowsForTable)) {
        skippedDeletes.push(table);
        deleteNotes[table] = 'غير موجود في ملف النسخة — أُبقي كما هو ولم يُحذف';
        continue;
      }
      const { error } = await supabaseClient.from(table).delete().eq(ownerColOf(table), user.id);
      if (error && error.code !== '42P01') {
        if (OPTIONAL_TABLES.has(table)) { deleteNotes[table] = `تعذّر الحذف (RLS): ${error.message}`; continue; }
        throw new Error(`خطأ في حذف ${table}: ${error.message}`);
      }
      // تحقّق فعلي: هل حُذفت الصفوف حقاً؟ RLS قد تمنع الحذف بلا خطأ
      const left = await countOwnedRows(table, user.id);
      if (left != null && left > 0) deleteNotes[table] = `بقي ${left} صف لم يُحذف (سياسة RLS) — قد تتكرر البيانات`;
    }

    if (skippedDeletes.length) {
      showToast(`ℹ️ ${skippedDeletes.length} جدولاً غير موجود في ملف النسخة — أُبقيت بياناتها كما هي ولم تُحذف: ${skippedDeletes.join('، ')}`, 'info');
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
    // AUDIT-FIX (2026-08-21): مقاييس الأداء تُقرأ من لقطة صفحة الأداء ولا تُعاد
    // حسابها هنا. كان التقرير يحسبها بصيغ خاصة (أساس لقطات صافي الثروة وصيغ
    // تسبق إصلاحات أغسطس 2026) **ويصرّح بأنها مطابقة للصفحة** — وهي ليست كذلك.
    // اثنتا عشرة نتيجة تدقيق مؤكَّدة سببها هذا الازدواج وحده.
    const perfSnap = await syncedGet('performance_snapshot_v1', null);
    const _snapAge = (perfSnap && perfSnap.generated_at)
      ? Math.floor((Date.now() - new Date(perfSnap.generated_at).getTime()) / 86400000) : null;
    const _snapNote = (what) => {
      p(`_⚠️ ${what} تُحسب في **صفحة الأداء التاريخي** ولا يُعاد حسابها هنا (لئلا يتضارب رقمان تحت اسم واحد)._`);
      p('_افتح صفحة الأداء التاريخي مرة واحدة — تُحفظ مقاييسها تلقائياً ثم تظهر في التقرير التالي._');
    };
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
      // ⚠️ يُشتقّ من الثوابت لا يُكتب نصّاً — كان يُعلن سقف 100 ر.س بعد إلغائه
      g(`- **العمولة**: ${(COMMISSION_RATE * 100).toFixed(3)}% من قيمة الصفقة`
        + `${isFinite(COMMISSION_CAP) ? ` بحد أقصى ${COMMISSION_CAP} ر.س` : ' بلا حدّ أقصى'}`
        + `${COMMISSION_MIN > 0 ? ` وبحدّ أدنى ${COMMISSION_MIN} ر.س` : ''}`
        + ` + VAT ${(VAT_RATE * 100).toFixed(0)}%`);
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
        diag.push(`- **حجم المحفظة:** ${holdings.length} سهم — ${holdings.length < 15 ? '⚠️ أقل من الحد الأدنى الدستوري (15)' : holdings.length > 20 ? '⚠️ أعلى من السقف الدستوري (20)' : '✅ داخل النطاق المستهدف 18–25 (الدستور §1)'}.`);
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

      // AUDIT-FIX 2026-08-22 (تدقيق خارجي #7): حقلا الشهر/السنة يُدخلان يدوياً
      // وقد يخالفان تاريخ الصرف، فيقع التوزيع في شهر غير شهره في §13 وفي أي رسم
      // زمني. نُعلن التعارض ولا نصحّحه صامتاً.
      // **ملاحظة مقصودة:** لا نمنع تاريخ صرف مستقبلياً — تسجيل التوزيع فور
      // إعلانه بتاريخ صرفه القادم قرار المالك وممارسة قائمة، والتقارير تستبعده
      // من المستلَم ومن XIRR أصلاً (utils.js/dividendFlowDate).
      {
        const _mm = dividends.filter(d => {
          if (!d.date || !d.year || !d.month) return false;
          const dt = parseDateLocal(String(d.date));
          return dt && (dt.getFullYear() !== +d.year || (dt.getMonth() + 1) !== +d.month);
        });
        if (_mm.length) {
          p(`\n> ⚠️ **${_mm.length}** توزيعة وسم شهرها لا يطابق تاريخ صرفها — تقع في الشهر الخطأ في §13 وفي أي رسم زمني للدخل:`);
          p(mdTable(['الرمز', 'تاريخ الصرف', 'الوسم المسجَّل', 'المبلغ'],
            _mm.map(d => [d.ticker, d.date, `${MONTHS[(+d.month || 1) - 1]} ${d.year}`, SAR(d.amount)])));
          p('_الإصلاح: عدّل الشهر/السنة في صفحة الأرباح ليطابقا تاريخ الصرف. الرسوم في صفحة الأرباح تشتقّ الشهر من التاريخ أصلاً (`_divPeriodKey`)، فالتعارض يظهر هنا وفي §13 فقط._');
        }
      }
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

    // AUDIT-FIX 2026-08-22 (تدقيق خارجي #6): كان الفلتر على `is_active` وحده —
    // وهو علم **الأرشفة** لا حالة البيع (realestate.js:167 يضبطه عند الأرشفة فقط).
    // فعقار حالته `sold` ولم يُؤرشف كان يُحتسب بكامل قيمته في إجمالي العقارات
    // وصافي الثروة وأساس FIRE. صفحة العقارات نفسها تستبعده (realestate.js:52
    // تفلتر `status !== 'sold'`) — نفس المفهوم بتعريفين. اعتُمد تعريف الصفحة.
    const _soldRE  = realEstate.filter(r => r.is_active !== false && String(r.status || '').toLowerCase() === 'sold');
    const activeRE = realEstate.filter(r => r.is_active !== false && String(r.status || '').toLowerCase() !== 'sold');
    if (activeRE.length) {
      const totalPurchase = activeRE.reduce((s, r) => s + +r.purchase_value, 0);
      const totalCurrent  = activeRE.reduce((s, r) => s + +r.current_value, 0);
      const totalRental   = activeRE.reduce((s, r) => s + +r.monthly_rental, 0);
      p(`**عدد الأصول العقارية:** ${activeRE.length}  `);
      p(`**إجمالي تكلفة الشراء:** ${SAR(totalPurchase)} ر.س  `);
      p(`**إجمالي القيمة الحالية:** ${SAR(totalCurrent)} ر.س  `);
      p(`**إجمالي الإيجار الشهري:** ${SAR(totalRental)} ر.س  `);
      p(`**مكاسب القيمة:** ${SAR(totalCurrent - totalPurchase)} ر.س (${PCT(totalPurchase > 0 ? (totalCurrent - totalPurchase) / totalPurchase * 100 : 0)})`);
      // AUDIT-FIX 2026-08-22: المباع يُستبعد ويُعلَن — لا يُحذف بصمت (§8).
      if (_soldRE.length) {
        const _sv = _soldRE.reduce((a, r) => a + (+r.current_value || 0), 0);
        p(`\n> ⚠️ **مستبعَد من كل الإجماليات:** ${_soldRE.length} عقاراً حالته «مباع» بقيمة مسجّلة ${SAR(_sv)} ر.س (${_soldRE.map(r => r.name).join('، ')}). كان يُحتسب هنا خطأً بينما لوحة التحكم وصفحة صافي الثروة تستبعدانه — فكان صافي الثروة في هذا التقرير أعلى من التطبيق بمقدار هذه القيمة. **إن كان البيع قد تمّ فعلاً فسجّل متحصّله كأصل نقدي وإلا اختفى من ميزانيتك.**`);
      }

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

    // AUDIT-FIX 2026-08-22 (تدقيق خارجي #1): مجموع أهداف الأسهم قد لا يساوي 100%
    // فيصير كل انحراف معروض محسوباً على مقام غير مكتمل. لا نصحّح أرقامك — نقيس
    // ونُعلن (§8)، ونبيّن الفرق بالضبط ليكون التصحيح قرارك.
    {
      const _stSum  = stockTargets.reduce((a, x) => a + (+x.target_pct || 0), 0);
      const _secSum = sectorTargets.reduce((a, x) => a + (+x.target_pct || 0), 0);
      const _bad = [];
      if (stockTargets.length  && Math.abs(_stSum  - 100) > 0.01) _bad.push(`مجموع أهداف الأسهم = **${_stSum.toFixed(2)}%** (الفرق ${(_stSum - 100 >= 0 ? '+' : '') + (_stSum - 100).toFixed(2)} نقطة)`);
      if (sectorTargets.length && Math.abs(_secSum - 100) > 0.01) _bad.push(`مجموع أهداف القطاعات = **${_secSum.toFixed(2)}%** (الفرق ${(_secSum - 100 >= 0 ? '+' : '') + (_secSum - 100).toFixed(2)} نقطة)`);
      // اتساق رأسي: مجموع أهداف أسهم كل قطاع مقابل هدف ذلك القطاع
      const _bySec = {};
      stockTargets.forEach(st => {
        const h = holdings.find(x => x.ticker === st.ticker);
        const sec = (h && h.sector) ? String(h.sector).trim() : 'غير مصنّف';
        _bySec[sec] = (_bySec[sec] || 0) + (+st.target_pct || 0);
      });
      const _secMismatch = sectorTargets.filter(sc => {
        const got = _bySec[String(sc.sector || '').trim()];
        return got != null && Math.abs(got - (+sc.target_pct || 0)) > 0.01;
      });
      if (_bad.length || _secMismatch.length) {
        p(`\n> 🔴 **تحقّق الأهداف فشل — كل انحراف في هذا القسم وفي §10 محسوب على مقام غير مكتمل:**`);
        _bad.forEach(b => p(`> - ${b}`));
        _secMismatch.forEach(sc => p(`> - قطاع «${sc.sector}»: مجموع أهداف أسهمه ${(_bySec[String(sc.sector || '').trim()] || 0).toFixed(2)}% ≠ هدف القطاع ${(+sc.target_pct || 0).toFixed(2)}%`));
        p(`> \n> الإجراء: افتح صفحة «أهداف الأسهم والقطاعات» وأعد التوزيع حتى يساوي المجموع 100%.`);
      } else if (stockTargets.length) {
        p(`\n_✅ تحقّق الأهداف: مجموع أهداف الأسهم ${_stSum.toFixed(2)}% ومجموع القطاعات ${_secSum.toFixed(2)}% — متسقان._`);
      }
    }

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

    // ADDED 2026-08-22: تواريخ تحديد الأهداف وموعد إعادة دراستها (صفحة الأهداف).
    // الرقم بلا تاريخ لا يُعرف عمره — والتقرير كان يسرد الأهداف بلا ذكر متى وُضعت.
    {
      const _rv = await syncedGet('target_review_dates_v1', null);
      const _row = (lbl, r) => {
        if (!r || (!r.setAt && !r.dueAt)) return [lbl, '—', '—', '⚪ لم تُسجَّل'];
        const _d = x => { const p = parseDateLocal(x); return p ? Math.round((p - today) / 86400000) : null; };
        const left = r.dueAt ? _d(r.dueAt) : null;
        const st = left == null ? '🟡 بلا موعد مراجعة'
                 : left < 0 ? `🔴 تأخّرت ${Math.abs(left)} يوماً`
                 : left <= 30 ? `🟡 بعد ${left} يوماً` : `🟢 بعد ${left} يوماً`;
        return [lbl, r.setAt || '—', r.dueAt || '—', st];
      };
      if (_rv) {
        h3('تواريخ تحديد الأهداف وإعادة دراستها');
        p(mdTable(['المجموعة', 'حُدِّدت في', 'تُراجَع في', 'الحالة'], [
          _row('أهداف الأسهم', _rv.stocks), _row('أهداف القطاعات', _rv.sectors),
        ]));
        p('_مصدرها صفحة «أهداف الأسهم والقطاعات» — يكتبها المالك بنفسه. الهدف المتأخّر عن موعد مراجعته قرار قديم لم يُعَد النظر فيه._');
      }
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
    // AUDIT-FIX 2026-08-21 (#44): كان يفترض «1 يونيو» بلا سقف عند اليوم، فتدخل
    // توزيعة مُعلَنة لم تُصرف كتدفّق موجب. التعريف الموحَّد في utils.js.
    dividends.forEach(d => {
      const dDate = dividendFlowDate(d, today);
      if (dDate) xirrFlows.push({ date: dDate, amount: +d.amount });
    });
    if (totalMktValue > 0) xirrFlows.push({ date: new Date(), amount: totalMktValue });
    const xirrResult = (typeof computeXIRR === 'function') ? computeXIRR(xirrFlows) : null;

    // AUDIT-FIX (2026-08-21): التعليق كان يصف منهجية لا يطبّقها الكود، والوسم
    // «Forward» كان يُستعمل هنا وفي §33 لتعريفين مختلفين بلا تمييز — رقمان
    // سنويان بالريال تحت اسم واحد. هذا **متوسط تاريخي** لا تقدير أمامي، فسُمّي
    // باسمه. التقدير الأمامي الحقيقي (مجموع DPS آخر 12 شهراً × الأسهم الحالية)
    // في §33 وحده، وهو المطابق للوحة التحكم وصفحة الأرباح.
    const divByYr = {};
    dividends.forEach(d => { divByYr[d.year] = (divByYr[d.year] || 0) + +d.amount; });
    const sortedYrs = Object.keys(divByYr).map(Number).sort((a,b) => b-a);
    const recentDivs = sortedYrs.slice(0,2).map(y => divByYr[y]);
    const avgRecentDiv = recentDivs.length ? recentDivs.reduce((s,v) => s+v, 0) / recentDivs.length : 0;
    const fwdYoc = totalMktValue > 0 ? avgRecentDiv / totalMktValue * 100 : 0;

    // ── TTM (آخر 12 شهراً) ──────────────────────────────────────
    // AUDIT-FIX (2026-08-21): كان يُحسب بمطابقة حقلي year/month على 12 شهراً
    // تقويمياً، بينما لوحة التحكم وصفحة الأرباح تحسبانه بنافذة 365 يوماً متحركة
    // على حقل **التاريخ** (نصف مفتوحة: > قبل سنة و≤ اليوم) مع احتياطي year/month
    // للسجلات بلا تاريخ. فكان الرقم يختلف بين التقرير والصفحتين لسببين: تعارض
    // الحقول المُدخلة يدوياً، وشهر تقويمي كامل مقابل نافذة متحركة.
    const _ttmFrom = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    const ttmDiv = dividends.reduce((s, d) => {
      const dt = d.date ? parseDateLocal(d.date)
        : (d.year ? new Date(+d.year, (+d.month || 1) - 1, 1) : null);
      return (dt && !isNaN(dt) && dt > _ttmFrom && dt <= today) ? s + +d.amount : s;
    }, 0);
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
    p(`متوسط التوزيع السنوي (تاريخي): ${PCT(fwdYoc)}  (≈ ${SAR(avgRecentDiv)} / سنة — متوسط آخر سنتين تقويميتين ÷ القيمة السوقية)`);
    p(`  ← ليس «الدخل المتوقَّع». التقدير الأمامي في القسم 33، وهو المطابق للوحة وصفحة الأرباح.`);
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
                   ?? localStorage.getItem('tharwa-alert-yellow') ?? DEV_PUMP) || 3;
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
      // ⚠️ التقرير يقرأ نفس مخزن مقسّم الراتب، فيجب أن يطبّق **نفس الفصل**:
      // الشهر المخطَّط (`status === 'planned'`) مستقبليٌّ لم يقع، وإدخاله في
      // «إجمالي الدخل المسجّل» يجعل تقريرك يعلن دخلاً لم تستلمه.
      // الغياب = منفَّذ (توافقاً مع كل سجلّ سابق لهذه الإضافة).
      const _allSalary = (salaryData.entries || []);
      const _plannedN  = _allSalary.filter(e => (e && e.status) === 'planned').length;
      const entries = _allSalary
        .filter(e => (e && e.status) !== 'planned')
        .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
      const cats = salaryData.categories || [];

      if (entries.length) {
        const totalSalary = entries.reduce((s, e) => s + (+e.salary || 0), 0);
        const avgSalary   = totalSalary / entries.length;

        p(`**عدد الأشهر المسجّلة:** ${entries.length}  `);
        p(`**إجمالي الدخل المسجّل:** ${SAR(totalSalary)} ر.س  `);
        p(`**متوسط الراتب الشهري:** ${SAR(avgSalary)} ر.س`);
        if (_plannedN) {
          p(`> ⚠️ **مستبعَد من كل الأرقام أعلاه:** ${_plannedN} شهراً **مخطَّطاً** `
            + `(مستقبليٌّ لم يقع). التقرير يعلن ما استُلم فعلاً.`);
        }

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
    // بعد ترحيل 2026-08-23 صارت كندة طفلاً في school_tracker_v2، ويبقى المفتاح
    // القديم في المتصفّح كنسخة مجمّدة. عرضه هنا يُظهر البيانات نفسها مرّتين في
    // تقرير واحد — فيُكتفى بسطر يشير إلى موضعها الجديد.
    if (localStorage.getItem('school_kanda_migrated_v1') === '1') {
      p('_رُحِّلت بيانات كندة إلى «متابعة المدرسة» (القسم 21) بتاريخ 2026-08-23 — تُقرأ هناك، والمفتاح القديم محفوظ في المتصفّح كنسخة مجمّدة._');
    } else {
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
        // AUDIT-FIX 2026-08-22: لقطة محفوظة قبل إضافة هذه الحقول كانت تطبع
        // «undefined%» حرفياً مكان ثوابت الدستور — أسوأ من الصمت لأنها تبدو رقماً.
        // الدستور §8: ما لا يتوفّر يُعلَن «غير متوفرة» ولا يُقدَّر ولا يُطبع خاماً.
        const _cv = v => (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) ? null : v;
        const _cap = (v, unit) => _cv(v) == null ? 'غير متوفرة في اللقطة' : String(v) + (unit || '');
        const _psz = deSnap.portfolioSize || {};
        p('```');
        p(`سقف السهم الواحد            : ${_cap(deSnap.caps?.single, '%')}`);
        p(`سقف السهم القيادي (Blue)    : ${_cap(deSnap.caps?.blueChip, '%')}`);
        p(`سقف القطاع                  : ${_cap(deSnap.caps?.sector, '%')}`);
        p(`حجم المحفظة المستهدف        : ${(_cv(_psz.min) == null || _cv(_psz.max) == null) ? 'غير متوفر في اللقطة' : `${_psz.min}–${_psz.max} سهم`} (الحالي: ${_cap(_psz.current, '')})`);
        p(`عتبة انحراف الوزن — أخضر ≤  : ${_cap(deSnap.thresholds?.green, '%')}`);
        p(`عتبة انحراف الوزن — أصفر ≤  : ${_cap(deSnap.thresholds?.yellow, '%')}`);
        p('```');
        if (_cv(deSnap.caps?.single) == null) {
          p('_⚠️ اللقطة المحفوظة أقدم من إضافة هذه الحقول — افتح صفحة «محرّك القرار» مرة واحدة لتحديثها._');
        }

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
        p('- **السقف الدستوري** = حدّ صلب 15% لكل سهم (§1)؛ كسره يفرض التخفيف ولو بلا هدف مسجّل');
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
    // AUDIT-FIX 2026-08-21 (#32): التقرير لم يكن يعرف حقل `price_manual` إطلاقاً،
    // فيصنّف السعر الذي ثبّته المالك عمداً «🔴 قديم» بينما لوحة التحكم تصونه ولا
    // تعدّه قديماً أبداً (dashboard.js:227) — حكمان متعارضان على السهم نفسه.
    // التعريف المعتمد هو تعريف اللوحة: السعر اليدوي قرار مالك لا بيانات متقادمة.
    p('تاريخ آخر تحديث للسعر لكل رمز — يقيس طزاجة بيانات الأسعار. يُعتبر السعر «قديماً» بعد 7 أيام، **إلا** السعر المثبَّت يدوياً (`price_manual`) فهو قرار المالك ولا يتقادم.');
    {
      const ts   = lsGet('tharwa-price-timestamps', {});
      const keys = ts && typeof ts === 'object' ? Object.keys(ts) : [];
      if (keys.length) {
        const rows = keys.map(tk => {
          const t   = new Date(ts[tk]);
          const age = (Date.now() - t.getTime()) / 86400000;
          const h   = holdings.find(x => x.ticker === tk);
          const man = !!(h && h.price_manual);
          return { tk, name: h?.name || '—', iso: ts[tk], age, man, stale: !man && age > 7 };
        }).sort((a, b) => b.age - a.age);
        p(mdTable(['الرمز','الاسم','آخر تحديث','منذ (يوم)','الحالة'],
          rows.map(r => [
            r.tk, r.name, new Date(r.iso).toLocaleString('ar-SA'),
            r.age.toFixed(1),
            r.man ? '🔒 مثبَّت يدوياً (لا يتقادم)' : (r.stale ? '🔴 قديم (>7 أيام)' : '🟢 حديث'),
          ])));
        const staleN = rows.filter(r => r.stale).length;
        const manN   = rows.filter(r => r.man).length;
        p(`\n**${rows.length}** رمز لها طابع زمني | **${staleN}** قديم (>7 أيام)${manN ? ` | **${manN}** مثبَّت يدوياً (مستثنى من الحكم)` : ''}.`);
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
    p('العائد المعدَّل بالزمن (Time-Weighted Return، معيار GIPS بطريقة Modified Dietz) يعزل أداء قراراتك الاستثمارية بإزالة أثر إيداعاتك وسحوباتك.');
    {
      const b = perfSnap && perfSnap.benchmark;
      if (b) {
        // AUDIT 2026-08-22 — قرار المالك: أُزيلت كل صفوف مقارنة تاسي وألفا.
        // آلية بنائها تقوم على استيفاء سعر المؤشر وافتراض عائد توزيعات سوق
        // ثابت مكتوب في الكود، فالناتج مُستنبَط لا مقيس. القاعدة: ما لسنا
        // واثقين منه 100% لا يُعرض. ⚠️ لا تُعِد هذه الصفوف.
        // يبقى عائد محفظتك (TWR) — مقيس من لقطاتك ومعاملاتك وحدها.
        p(mdTable(['المقياس','القيمة'], [
          ['الفترة', (b.from && b.to) ? `${b.from} ← ${b.to}` : 'غير مسجَّلة في اللقطة'],
          ['عائد محفظتك (TWR، تراكمي)', (b.portDelta >= 0 ? '+' : '') + PCT(b.portDelta)],
          ['نقاط القياس', b.points == null ? 'غير مسجَّل' : String(b.points)],
          ['أساس المحفظة', perfSnap.basisLabel || '—'],
        ]));
        p(`_المصدر: لقطة صفحة الأداء التاريخي${_snapAge != null ? ` (عمرها ${_snapAge} يوماً)` : ''}. الأرقام هنا **نسخة** منها لا حساباً مستقلاً._`);
        p(`_الوحدة **تراكمية على الفترة** لا سنوية._`);
        if (_snapAge != null && _snapAge > 7) {
          p(`_⏰ اللقطة عمرها ${_snapAge} يوماً — افتح صفحة الأداء لتحديثها قبل الاعتماد على هذه الأرقام._`);
        }
      } else {
        _snapNote('مقاييس TWR');
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
    // ══════════════════════════════════════════════════════════════
    // الدخل التوزيعي المتوقَّع (Forward) — **منسوخ حرفياً** من قرار المالك
    // 2026-08 المطبَّق في dashboard.js و dividends.js:
    //     DPS السنوي = مجموع DPS آخر 12 شهراً (لا وسيط آخر freq دفعات)
    //     المتوقَّع   = DPS × الأسهم الحالية
    // AUDIT-FIX (2026-08-21): كانت هنا نسخة ثالثة متفرّعة تستخدم المنهجية
    // المهجورة (وسيط النافذة + استثناء «تصاعدي») — وهي تفترض تساوي الدفعات
    // فتضخّم النمط السعودي (مرحلي صغير + ختامي كبير) حتى +129%، وتفتقد فرع
    // الدورية الشهرية فتقسم دخل الريت الشهري على ثلاثة، ولا تستبعد المنقطعين.
    // فكان «الدخل المتوقع» و«نسبة تغطية هدف الدخل» في التقرير يخالفان اللوحة
    // وصفحة الأرباح. **أي تعديل على المنهجية يجب أن يُطبَّق في الملفات الثلاثة.**
    // ══════════════════════════════════════════════════════════════
    const _computeForwardIncome = () => {
      const rows = []; let total = 0; const stale = [];
      const nowTs = today.getTime();
      new Set(holdings.map(h => h.ticker)).forEach(ticker => {
        const h = holdings.find(x => x.ticker === ticker);
        if (!h || +h.shares <= 0) return;
        const divs = dividends.filter(d => d.ticker === ticker)
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        if (!divs.length) return;

        const dateOf = d => (d.date ? parseDateLocal(d.date)
          : (d.year ? new Date(+d.year, (+d.month || 1) - 1, 1) : null));

        // AUDIT-FIX 2026-08-22: نُقل إلى utils.js/inferDividendFrequency ليكون
        // تعريفاً واحداً لكل الصفحات بدل خمس نسخ متطابقة، وبحارس يمنع قلب
        // موزّع سنوي إلى «شهري» بسبب تسجيلين متقاربين.
        // ISO محلي — `toISOString` يزيح التاريخ بفارق المنطقة الزمنية فينقل
        // توزيعة طرف الشهر إلى شهر آخر ويشوّه الفجوات.
        const _isoLocal = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
        const freq = inferDividendFrequency(divs.map(d => {
          const x = dateOf(d); return x ? _isoLocal(x) : null;
        }));

        // DPS لكل دفعة = المبلغ ÷ الأسهم وقتها (المستلَم فقط — لا تواريخ مستقبلية)
        const series = [];
        divs.forEach(d => {
          const dt = dateOf(d);
          if (!dt || dt.getTime() > nowTs) return;      // مُعلَن لم يُصرف بعد
          const sh = _sharesAtDate(ticker, d.date || '9999-12-31');
          if (sh >= 0.001) series.push({ dps: +d.amount / sh, ts: dt.getTime() });
        });
        if (!series.length) return;

        const cutoff = nowTs - 365 * 86400000;
        const ttmDps = series.filter(x => x.ts >= cutoff).reduce((a, x) => a + x.dps, 0);
        // احتياطي الموزّع السنوي الذي تجاوزت دفعته 12 شهراً: مجموع آخر دورة كاملة
        const dpsAnnual = ttmDps > 0 ? ttmDps
          : series.slice(-freq).reduce((a, x) => a + x.dps, 0);

        // استبعاد المنقطع — نفس عتبة الملفين: (365 ÷ freq) × 1.75
        const lastTs = series[series.length - 1].ts;
        const daysSince = Math.floor((nowTs - lastTs) / 86400000);
        const staleAfter = dividendStaleDays(freq);
        const projected = dpsAnnual * +h.shares;
        if (daysSince > staleAfter) {
          stale.push({ ticker, name: h.name || ticker, daysSince, projected });
          return;                                        // لا يدخل المجموع
        }
        total += projected;
        rows.push({ ticker, name: h.name || ticker, dps: dpsAnnual, freq, shares: +h.shares, projected });
      });
      return { total, rows, stale };
    };
    // TWR (Modified Dietz) — نفس منطق performance.js
    // AUDIT-FIX (2026-08-21): حُذفت نسختا _dedupSnaps30 و_twr30 — كانتا نسخة
    // ثانية من منطق TWR داخل هذا الملف، بلا الفلتر الذي تطبّقه صفحة الأداء
    // (_selectConsistentSnapshots) فتخلط اللقطات التلقائية باليدوية صامتاً.
    // المقاييس الآن تُقرأ من لقطة الصفحة، فلا محلّ لحساب ثانٍ يتفرّع عنها.

    // ── أرقام أساسية مشتركة ──────────────────────────────────────────────
    // REGRESSION-FIX 2026-08-21: هذه الإعلانات الأحد عشر كانت هنا، وحُذفت سهواً
    // مع دالتَي _twr30/_dedupSnaps30 في الكوميت 684f831 لأنها كانت ملاصقة لها.
    // النتيجة: `_totalBuys is not defined` يُسقط تصدير التقارير كلّه عند §32،
    // فلا يُنتَج أي ملف. تستهلكها الأقسام 32 و33 و34 و36 و37 و39 و«الحالة في
    // سطور». **لا تنقلها ولا تُدمجها في قسم واحد** — كل ما بعدها يعتمد عليها.
    const _totalMkt    = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
    const _totalCost   = holdings.reduce((s, h) => s + +h.shares * +h.avg_price, 0);
    const _totalBuys   = transactions.filter(t => t.type === 'buy').reduce((s, t) => s + +t.total, 0);
    const _totalSells  = transactions.filter(t => t.type === 'sell').reduce((s, t) => s + +t.total, 0);
    const _totalDiv    = dividends.reduce((s, d) => s + +d.amount, 0);
    const _totalComm   = transactions.reduce((s, t) => s + (+t.commission || 0) + (+t.vat || 0), 0);
    const _sukukActive = (sukukData.opportunities || [])
      .filter(o => o.status === 'مشترك').reduce((s, o) => s + (+o.amount || 0), 0);
    const _reVal       = activeRE.reduce((s, r) => s + +r.current_value, 0);
    // ══════════════════════════════════════════════════════════════
    // ازدواج حساب: صفحة صافي الثروة تقبل تصنيفَي `sukuk` و`bank` وتدعو
    // المالك لإدخالهما يدوياً، ثم كان هذا التقرير يجمعها **فوق**
    // `_sukukActive` (من صفحة الصكوك) — فيُعدّ الصكّ مرّتين في إجمالي
    // الأصول وصافي الثروة وقاعدة FIRE. الصفحتان منفردتين سليمتان،
    // والازدواج يقع حصراً في المستند الذي يُقرَّر عليه.
    // المصدر الأوثق للصكوك هو صفحة الصكوك (تُزامَن عبر user_settings)،
    // فإن كان فيها رصيد نُسقط صفوف الصكوك من أصول صافي الثروة ونُعلن ذلك.
    // ملاحظة: `bank` **لا يُدمَج** مع `portfolioCash` — الأول حساب بنكي
    // والثاني نقد غير مستثمر عند الوسيط، وهما مبلغان مختلفان فعلاً.
    // ══════════════════════════════════════════════════════════════
    const _assetSukuk  = activeAssets.filter(a => a.category === 'sukuk')
                                     .reduce((s, a) => s + +a.value, 0);
    const _dedupSukuk  = (_sukukActive > 0 && _assetSukuk > 0);
    const _assetVal    = activeAssets.reduce((s, a) =>
                           s + ((_dedupSukuk && a.category === 'sukuk') ? 0 : +a.value), 0);
    const _dedupNote   = _dedupSukuk
      ? `
> ⚠️ أُسقطت صكوكٌ بقيمة ${SAR(_assetSukuk)} ر.س من «أصول أخرى» لأنها مسجَّلة `
        + `أيضاً في صفحة الصكوك (${SAR(_sukukActive)} ر.س) — وإلا عُدّت مرّتين. `
        + `المصدر المعتمد هنا صفحة الصكوك.
`
      : '';
    const _fwd         = _computeForwardIncome();

    h3('العائد المعدَّل بالمخاطر');
    {
      // AUDIT-FIX (2026-08-21): كانت تُحسب هنا بصيغة تسبق إصلاحَي أغسطس 2026 في
      // صفحة الأداء (تسنية قسرية تحت السنة، RF بلا تحجيم زمني، بلا ترقيق ≥20 يوماً)
      // وعلى أساس مختلف — مع تصريح نصّي بالمطابقة. الآن تُقرأ من لقطة الصفحة.
      const rk = perfSnap && perfSnap.risk;
      if (rk) {
        const pct = v => (v == null ? '—' : (v * 100).toFixed(1) + '%');
        // AUDIT-FIX 2026-08-22 (تدقيق خارجي #10): كانت المقاييس تُعرض بلا عدد
        // مشاهدات. تذبذب على 17 فترة ليس تقديراً بل ضجيج — الخطأ المعياري
        // للانحراف المعياري ≈ σ÷√(2n)، أي ±17% من القيمة عند n=17 مقابل ±9%
        // عند n=60. العدد يُعرض دائماً، والتحذير يظهر تحت 30.
        const _nObs = +perfSnap.points || 0;
        p('```');
        p(`أساس القياس                 : ${perfSnap.basisLabel || '—'}`);
        p(`عدد المشاهدات               : ${_nObs || 'غير مسجَّل'}${_nObs && _nObs < 30 ? `  ⚠️ غير كافٍ إحصائياً — الخطأ المعياري للتذبذب عند n=${_nObs} يقارب ±${(100 / Math.sqrt(2 * _nObs)).toFixed(0)}% من القيمة` : ''}`);
        p(`${rk.shortSpan ? 'العائد التراكمي (المدة < سنة)' : 'العائد السنوي'}      : ${pct(rk.annReturn)}`);
        p(`التذبذب ${rk.shortSpan ? 'على المدة' : 'السنوي'}          : ${pct(rk.annVol)}`);
        p(`تذبذب الهبوط                : ${pct(rk.annDownside)}`);
        p(`Sharpe  = (العائد−RF)÷التذبذب: ${rk.sharpe == null ? '—' : rk.sharpe.toFixed(2)}`);
        p(`Sortino = (العائد−RF)÷الهبوط : ${rk.sortino == null ? '—' : rk.sortino.toFixed(2)}`);
        p(`العائد الخالي من المخاطر RF : ${((perfSnap.riskFree ?? 0.03) * 100).toFixed(0)}% (افتراض مكتوب في الكود)`);
        p(`أقصى تراجع                  : ${perfSnap.maxDrawdown == null ? '—' : perfSnap.maxDrawdown.toFixed(2) + '%'}`);
        // AUDIT-FIX 2026-08-22: لقطة أقدم من إضافة العدّادين كانت تطبع «undefined».
        p(`عدد الفترات المستخدَمة       : ${rk.nReturns ?? 'غير مسجَّل'} (من ${rk.nSnaps ?? 'غير مسجَّل'} نقطة)`);
        p('```');
        p(`_المصدر: لقطة صفحة الأداء${_snapAge != null ? ` (عمرها ${_snapAge} يوماً)` : ''} — نسخة لا حساب مستقل._`);
      } else if (perfSnap && perfSnap.riskInsufficient) {
        // م.20 — البيان الغائب يُعلَن بسببه، لا يُترك «—» بلا تفسير. اللقطة
        // تحمل الآن عدد الفترات والحدّ، فيُقال للمالك متى يصير الرقم قابلاً
        // للحساب بدل أن يظنّ أن الصفحة عطلانة.
        const ri = perfSnap.riskInsufficient;
        p('```');
        p(`أساس القياس                 : ${perfSnap.basisLabel || '—'}`);
        p(`فترات العائد المتاحة        : ${ri.nReturns ?? '—'} (الحدّ الأدنى ${ri.min ?? 12})`);
        p('```');
        p(`⚠️ **لم تُحسب** — دون ${ri.min ?? 12} فترة عائد يقيس الرقم عنقود تقلّب واحداً ` +
          `لا تقلّب محفظتك، فالتقدير يُعلَن ولا يُصطنع (م.20). تُستكمل تلقائياً ` +
          `مع تراكم القراءات.`);
      } else {
        _snapNote('التذبذب وشارب وسورتينو وأقصى التراجع');
      }
    }
    hr();

    // ════════════════════════════════════════════════════════
    // 31. التدقيق السلوكي (Behavioral Audit)
    // ════════════════════════════════════════════════════════
    book('B');
    await tick('التدقيق السلوكي');
    h2('31. التدقيق السلوكي — انضباط قراراتك');
    p('يحلّل صفقاتك المُغلقة (المُصفّاة بالكامل) لكشف الأنماط النفسية: هل تُمسك بخاسريك؟ هل تُتاجر بإفراط؟');
    p('_⚠️ **ليس مطابقاً لتبويب «تحليل السلوك» في صفحة الأداء** — كان يُصرَّح بذلك خطأً. الصفحة تستبعد الصفقات ناقصة التاريخ وتُعلن عددها، وتحجب تشخيص «نفور من الخسارة» دون 8 صفقات وتعرض فاصل ثقة، وتحتسب المنح في وتيرة التداول. هذا القسم أبسط منه — اعتمد الصفحة عند التعارض._');
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
      if (_dedupNote) p(_dedupNote);
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
      // AUDIT-FIX 2026-08-21 (#45): نستثني سنة أول شراء تماماً كما تفعل لوحة التحكم
      // (dashboard.js:840-845). كانت اللوحة تستثنيها والتقرير لا يستثنيها، فيخرج
      // رقمان مختلفان لمؤشر واحد يعلن المنهجية نفسها. سنة أول شراء سنة جزئية —
      // المحفظة بدأت في منتصفها — واحتسابها كسنة كاملة يضخّم النمو زوراً.
      const _rFirstBuyDate = transactions.filter(t => t.type === 'buy' && t.date).map(t => t.date).sort()[0] || null;
      const _rFirstBuyYear = _rFirstBuyDate ? +String(_rFirstBuyDate).slice(0, 4) : null;
      const divByYear = {};
      dividends.forEach(d => { const y = +d.year || new Date(d.date).getFullYear(); divByYear[y] = (divByYear[y] || 0) + +d.amount; });
      const fullYears = Object.keys(divByYear).map(Number).filter(y => y < today.getFullYear() && y !== _rFirstBuyYear && divByYear[y] > 0).sort((a, b) => a - b);
      if (fullYears.length >= 2) {
        const span = fullYears[fullYears.length - 1] - fullYears[0];
        const cagr = (Math.pow(divByYear[fullYears[fullYears.length - 1]] / divByYear[fullYears[0]], 1 / span) - 1) * 100;
        p(`نمو التوزيعات المركّب من ${fullYears[0]} إلى ${fullYears[fullYears.length - 1]}: **${(cagr >= 0 ? '+' : '') + cagr.toFixed(1)}%/سنة** (سنوات كاملة فقط، تستبعد السنة الجارية${_rFirstBuyYear ? ' وسنة أول شراء ' + _rFirstBuyYear : ''}) — نفس منهجية لوحة التحكم.`);
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
      // AUDIT-FIX 2026-08-22 (تدقيق خارجي #9): متوسط آخر 12 شهراً يبتلع الضخّات
      // الاستثنائية غير المتكررة، فيصير مدخل إسقاط FIRE أضعاف خطتك المعلنة —
      // والنتيجة «على المسار 🟢» طمأنينة زائفة. نفصل الاعتيادي عن الاستثنائي:
      // أي إيداع يتجاوز 3× وسيط الإيداعات يُصنَّف ضخّة ويُستبعد من **المعدّل**
      // (ولا يُحذف من رصيدك — هو داخل الأصول الحالية أصلاً).
      const _deps12 = cf12.filter(c => c.type === 'deposit').map(c => +c.amount || 0).sort((a, b) => a - b);
      const _medDep = _deps12.length ? _deps12[Math.floor(_deps12.length / 2)] : 0;
      const _lumps  = _medDep > 0 ? _deps12.filter(v => v > _medDep * 3) : [];
      const _lumpSum = _lumps.reduce((a, v) => a + v, 0);
      const _ordinaryMonthly = hasCf12 ? ((dep12 - _lumpSum) - wd12) / 12 : 0;
      if (hasCf12) {
        p(`صافي المساهمة آخر 12 شهراً: ${SAR(dep12 - wd12)} ر.س → **${SAR(monthlyContrib)} ر.س/شهر** (إيداعات ${SAR(dep12)} − سحوبات ${SAR(wd12)}).`);
        if (_lumps.length) {
          p(`منها **${_lumps.length}** ضخّة استثنائية (أكبر من 3× الوسيط ${SAR(_medDep)}) بإجمالي ${SAR(_lumpSum)} ر.س.  `);
          p(`**المساهمة الاعتيادية بعد استبعادها: ${SAR(_ordinaryMonthly)} ر.س/شهر** — هذه هي المناسبة للإسقاط المستقبلي، لأن الضخّة لا تتكرر بحكم تعريفها.`);
        }
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
          const _proj = ann => fireBase * g + ann * ((g - 1) / 0.05);
          const _ratio = ann => (fireNumber > 0 ? _proj(ann) / fireNumber * 100 : 0);
          // AUDIT-FIX 2026-08-22 (تدقيق خارجي #9): سيناريو واحد مبني على متوسط
          // آخر 12 شهراً كان يعطي رقماً أعلى بأضعاف من الخطة المعلنة. نعرض
          // السيناريوهات جنباً إلى جنب — القارئ يرى الفرق بدل أن يرث افتراضاً.
          const _planMonthly = +(retGoal.planned_monthly || 0);
          const _scen = [
            { lbl: 'متوسط آخر 12 شهراً (يشمل الضخّات)', ann: monthlyContrib * 12 },
          ];
          if (_lumps && _lumps.length) _scen.push({ lbl: 'المساهمة الاعتيادية (بلا ضخّات)', ann: _ordinaryMonthly * 12 });
          if (_planMonthly > 0) _scen.push({ lbl: 'خطتك المعلنة', ann: _planMonthly * 12 });
          p('```');
          p(`الأصول الحالية المؤهلة (أسهم+نقد+صكوك): ${SAR(fireBase)} ر.س`);
          p(`نمو تخطيطي متحفّظ                   : 5% سنوياً`);
          p(`السنوات المتبقية حتى ${retGoal.target_year}          : ${yearsLeft}`);
          p(`رقم FIRE المطلوب                    : ${SAR(fireNumber)} ر.س`);
          p('```');
          p(mdTable(['سيناريو المساهمة', 'سنوياً', `الأصول المتوقعة ${retGoal.target_year}`, 'نسبة الوصول', 'الحكم'],
            _scen.map(x => {
              const r = _ratio(x.ann);
              return [x.lbl, SAR(x.ann), SAR(_proj(x.ann)), r.toFixed(0) + '%',
                r >= 100 ? '✅ على المسار' : r >= 80 ? '🟡 قريب' : '🔴 متأخر'];
            })));
          if (_scen.length === 1) {
            p(`_السيناريو الوحيد المتاح مبني على متوسط آخر 12 شهراً. لتقدير أصدق سجّل «المساهمة الشهرية المخطّطة» في صفحة التقاعد — عندها يظهر السيناريو المخطّط بجانبه._`);
          } else {
            p(`_الفارق بين السيناريوهات ليس خطأ حساب: المعادلة واحدة والمدخل مختلف. **اعتمد الأدنى** في التخطيط ما لم تكن الضخّات الاستثنائية متكررة فعلاً._`);
          }
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
      // AUDIT-FIX (2026-08-21): البسط كان يُسقط التوزيعات المستلمة بينما «كفاءة
      // رأس المال» في صفحة الأداء تستخدم totalReturn الذي يشملها (performance.js:1219)،
      // فيظهر رقمان مختلفان لنفس المفهوم — والوسم يقول «إجمالي الأرباح» رغم إسقاطها.
      const efficiency = _totalComm > 0 ? (totalPnL + _totalDiv) / _totalComm : null;

      p('```');
      // AUDIT-FIX 2026-08-22 (تدقيق خارجي #8): الوسم «تكلفة الشراء» كان يحتمل
      // مقامين — إجمالي المشتريات التاريخية (شاملة المراكز المصفّاة) أو تكلفة
      // الحيازات القائمة — والفرق بينهما كبير. المقام مكتوب صراحةً الآن، ويُعرض
      // النظيران معاً فلا يبقى تأويل.
      const _divROIHeld = _totalCost > 0 ? _totalDiv / _totalCost * 100 : 0;
      p(`Div ROI ÷ إجمالي المشتريات التاريخية : ${divROI.toFixed(1)}%  (المقام ${SAR(_totalBuys)} — يشمل المراكز المصفّاة)`);
      p(`Div ROI ÷ تكلفة الحيازات القائمة     : ${_divROIHeld.toFixed(1)}%  (المقام ${SAR(_totalCost)} — رأس المال المنشغل الآن)`);
      p(`سنوات التعادل بالتوزيعات          : ${breakEvenYrs == null ? '—' : breakEvenYrs.toFixed(1) + ' سنة'}  (تكلفة الحيازة ÷ الدخل المتوقع سنوياً)`);
      p(`الدخل التوزيعي المتوقع (Forward)  : ${SAR(_fwd.total)} ر.س/سنة  (مجموع DPS آخر 12 شهراً × أسهمك الحالية — نفس تعريف اللوحة وصفحة الأرباح)`);
      if (_fwd.stale && _fwd.stale.length) {
        p(`مستبعَد كمنقطع                    : ${_fwd.stale.length} سهماً (${_fwd.stale.map(x => x.ticker + ' — ' + x.daysSince + ' يوماً').join('، ')})`);
      }
      p(`نسبة كفاءة المحفظة               : ${efficiency == null ? '—' : efficiency.toFixed(1) + '×'}  (ر.خ محقق + غير محقق + التوزيعات ÷ العمولات والضرائب — نفس بسط «كفاءة رأس المال» في صفحة الأداء)`);
      p(`إجمالي العمولات والضرائب المدفوعة : ${SAR(_totalComm)} ر.س`);
      p('```');
      if (efficiency != null) {
        p(`- ${efficiency >= 20 ? '✅ ممتاز' : efficiency >= 10 ? '🟡 جيد' : '⚠️ منخفض'}: كل ريال عمولة قابله ${efficiency.toFixed(1)} ريال ربح إجمالي.`);
      }

      // AUDIT-FIX 2026-08-22 (تدقيق خارجي #5): DPS المشتقّ من مبلغ مسجَّل ناقص أو
      // من دفعة واحدة في سنة يعطي عائداً غير معقول — وسهم عائده 0.19% أو 40%
      // يمرّ صامتاً اليوم. لا نصحّح رقمك (§8) بل نقيس ونُعلن ليكون التصحيح قرارك.
      // النطاق المعقول للسوق السعودي: 0.5%–15% عائداً، و0%–200% نسبة توزيع.
      {
        const _susp = [];
        _fwd.rows.forEach(r => {
          const h = holdings.find(x => x.ticker === r.ticker);
          const price = h ? +h.current_price : 0;
          if (!(price > 0) || !(r.dps > 0)) return;
          const y = r.dps / price * 100;
          if (y < 0.5)  _susp.push([r.ticker, r.name, formatNum(r.dps, 4), formatNum(price, 2), y.toFixed(2) + '%', '🔴 عائد أقل من 0.5% — الأرجح أن المبلغ المسجَّل دفعة جزئية أو الدورية ناقصة']);
          else if (y > 15) _susp.push([r.ticker, r.name, formatNum(r.dps, 4), formatNum(price, 2), y.toFixed(2) + '%', '🔴 عائد فوق 15% — الأرجح توزيع استثنائي غير متكرر أو سعر قديم']);
        });
        if (_susp.length) {
          h3('⚠️ فحص معقولية التوزيع لكل سهم');
          p(`**${_susp.length}** سهماً عائده المحسوب خارج النطاق المعقول (0.5%–15%). الدخل المتوقَّع أعلاه مبني عليها كما هي — راجعها في صفحة الأرباح قبل الاعتماد على المجموع:`);
          p(mdTable(['الرمز', 'الاسم', 'DPS سنوي محسوب', 'السعر', 'العائد', 'الملاحظة'], _susp));
        }
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
        // AUDIT-FIX 2026-08-21 (#44): كان يُسقط كل توزيعة بلا حقل date كلياً بينما
        // §10 في نفس الملف يحتسبها — فيطبع الملف الواحد XIRR بمجموعتَي تدفّقات.
        dividends.forEach(dv => {
          const dt = dividendFlowDate(dv, today); if (!dt) return;
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
          const dt = dividendFlowDate(dv, today); if (!dt) return;   // AUDIT-FIX #44
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
      // v3.0: السقف من فئة السهم (م.25). لا أرقام هنا — المصدر js/constitution.js
      const CAP_SECTOR = SECTOR_CAP;
      const TOL_STOCK = CAP_BUFFER, TOL_SECTOR = 2.5;
      const checks = [];
      const addCheck = (rule, ref, status, detail) => checks.push([rule, ref, status, detail]);

      const gm = _totalMkt;
      const deCfgC = await syncedGet('decision_engine_v1', {}) || {};
      // AUDIT-FIX (2026-08-18): كان يفتقد fallback أرامكو الموجود حرفياً في
      // decision-engine.js:168 و targets.js:127 و watchlist.js:21 — فيقرأ سقفها 7%
      // بدل 12% ويُصدر أمر بيع لسهم ممتثل. العلم اليدوي يتقدّم على الافتراض.
      // v3.0: الفئة تُحسب من أرقام السهم المحفوظة في بطاقته (م.25)
      const catOfC = tk => classifyStock(deCfgC[tk] || {});

      // ① سقف الفئة لكل سهم
      if (holdings.length && gm > 0) {
        const breaches = holdings.map(h => {
          const w = (+h.shares * +h.current_price) / gm * 100;
          const c = catOfC(h.ticker);
          // غير المصنَّف بلا سقف مفروض — لا يُعدّ مخالفاً بنقص بيانات المحرّك (م.21)
          const cap = c.known ? c.cap : null;
          return { tk: h.ticker, name: h.name, w, cap, cat: c,
                   over: cap != null && w > cap + TOL_STOCK,
                   inTol: cap != null && w > cap && w <= cap + TOL_STOCK };
        });
        const hard = breaches.filter(b => b.over);
        const soft = breaches.filter(b => b.inTol);
        const unclassified = breaches.filter(b => !b.cat.known);
        if (unclassified.length) {
          addCheck('تصنيف الفئة لكل سهم (م.25)', 'م.25 و20',
            '⚠️ غير قابل للفحص',
            `${unclassified.length} سهماً غير مصنَّف: ${unclassified.map(b => `${b.tk} (ينقصه ${b.cat.missing.join('، ')})`).join('؛ ')}. `
            + 'تُدخَل في بطاقة السهم بمحرّك القرار. لا يُفرَض عليها سقف ولا تُنزَّل فئتها (م.21).');
        }
        addCheck(`سقف الفئة لكل سهم (أ ${CAT.A.cap}% · ب ${CAT.B.cap}% · ج ${CAT.C.cap}% · د ${CAT.D.cap}%) + سماح ${TOL_STOCK}%`, 'م.25',
          hard.length ? '🔴 مخالف' : '✅ ممتثل',
          hard.length
            ? `${hard.length} سهم كسر سقفه: ${hard.map(b => `${b.tk} ${PCT(b.w)} > ${b.cap}% (الفئة ${b.cat.short})`).join('؛ ')}`
            : `لا سهم يتجاوز سقفه.${soft.length ? ` (${soft.length} داخل منطقة السماح بلا تنبيه: ${soft.map(b => b.tk).join('، ')})` : ''}`);

        // ② سقف القطاع
        const secM = {};
        holdings.forEach(h => { const s = h.sector || 'غير مصنف'; secM[s] = (secM[s] || 0) + +h.shares * +h.current_price; });
        const secB = Object.entries(secM).map(([s, v]) => ({ s, w: v / gm * 100 })).filter(x => x.w > CAP_SECTOR + TOL_SECTOR);
        addCheck(`سقف القطاع الواحد ${CAP_SECTOR}% — 25–27.5 تنبيه · 27.5–30 وقف الإضافة · >30 تصحيح`, 'م.28',
          secB.length ? '🔴 مخالف' : '✅ ممتثل',
          secB.length ? `${secB.length} قطاع فوق السقف: ${secB.map(x => `${x.s} ${PCT(x.w)}`).join('؛ ')}` : `أعلى قطاع ${PCT(Math.max(...Object.values(secM).map(v => v / gm * 100)))} — تحت السقف.`);

        // ③ حجم المحفظة
        const nH = holdings.length;
        addCheck(`حجم المحفظة المستهدف ${SIZE_MIN}–${SIZE_MAX} سهماً (سماح ${SIZE_GRACE_MAX} أثناء الخروج)`, 'م.29',
          nH >= SIZE_MIN && nH <= SIZE_MAX ? '✅ ممتثل'
            : nH > SIZE_MAX && nH <= SIZE_GRACE_MAX ? '🟡 داخل السماح المؤقّت' : '🔴 مخالف',
          `العدد الحالي ${nH} سهم — ${nH < SIZE_MIN ? `ينقص ${SIZE_MIN - nH} سهماً عن الحد الأدنى (تركيز زائد)` : nH > 25 ? `يزيد ${nH - 25} سهماً عن السقف (تشتّت وإدارة مرهقة)` : 'داخل النطاق'}.`);

        // ④-أ الاستبعادات الدائمة (م.12) — إشارة قاطعة، بلا تأكيد
        {
          const held = holdings.filter(h => isBanned(h.ticker));
          addCheck('الاستبعادات الدائمة — 4339 دراية ريت · 1111 تداول القابضة', 'م.12 و44',
            held.length ? '🔴 مخالف' : '✅ ممتثل',
            held.length
              ? `مملوك رغم الاستبعاد الدائم: ${held.map(h => `${h.ticker} ${h.name || ''}`).join('؛ ')}. إشارة قاطعة تُنفَّذ من قراءة واحدة (م.44).`
              : 'لا سهم مستبعَد في المحفظة، ولا يُقترَح في أي مخرَج.');
        }

        // ④-ب الحد الأدنى للمركز (م.27)
        {
          const small = holdings.map(h => ({ tk: h.ticker, name: h.name,
              w: (+h.shares * +h.current_price) / gm * 100 }))
            .map(x => ({ ...x, v: positionSizeVerdict(x.w) }))
            .filter(x => x.v.key !== 'ok');
          const exits = small.filter(x => x.v.key === 'exit');
          addCheck(`الحد الأدنى للمركز — ≥${POS_MIN_OK}% (${POS_MIN_GRACE}–${POS_MIN_OK}% مهلة دورتين · <${POS_MIN_GRACE}% خروج)`, 'م.27',
            exits.length ? '🔴 مخالف' : small.length ? '🟡 قيد المهلة' : '✅ ممتثل',
            small.length
              ? small.map(x => `${x.tk} ${PCT(x.w)} — ${x.v.label}`).join('؛ ')
              : `أصغر مركز ${PCT(Math.min(...holdings.map(h => (+h.shares * +h.current_price) / gm * 100)))} — كلها فوق الحد.`);
        }

        // ④-ج عدد القطاعات (م.29)
        {
          const nSec = new Set(holdings.map(h => h.sector || 'غير مصنف')).size;
          addCheck(`عدد القطاعات المستهدف ${SECTORS_MIN} فأكثر`, 'م.29',
            nSec >= SECTORS_MIN ? '✅ ممتثل' : '🔴 مخالف',
            `القطاعات الحالية ${nSec}${nSec < SECTORS_MIN ? ` — ينقص ${SECTORS_MIN - nSec}` : ''}.`);
        }

        // ④-د صلاحية تجاوزات الهدف الفردي (م.31) — التجاوز يسقط بعد دورة
        {
          const tg  = await syncedGet('stock_targets', {}) || {};
          // م.31 تقيس عمر التجاوز بالدورة. التاريخ المسجَّل هو تاريخ تحديد
          // أهداف الأسهم في صفحة الأهداف (target_review_dates_v1.stocks.setAt) —
          // على مستوى المجموعة لا السهم، فالتجديد يتمّ بتحديث ذلك التاريخ.
          const _rvT = await syncedGet('target_review_dates_v1', null);
          const st   = overrideStatus(_rvT && _rvT.stocks && _rvT.stocks.setAt);
          const over = Object.entries(tg).map(([tk, v]) => {
            const c = catOfC(tk);
            if (!c.known || !(+v > c.cap + 1e-9)) return null;
            return { tk, target: +v, cap: c.cap, cat: c.short, st };
          }).filter(Boolean);
          const expired = over.filter(o => o.st.expired || o.st.unknownDate);
          addCheck('تجاوز الهدف الفردي للسقف — صالح دورة واحدة ثم يُجدَّد', 'م.31',
            !over.length ? '✅ ممتثل (لا تجاوزات)'
              : expired.length ? '🔴 مخالف — تجاوز لم يُجدَّد' : '🟡 ساري داخل الدورة',
            !over.length
              ? 'لا هدف فردي فوق سقف فئته.'
              : over.map(o => `${o.tk} هدف ${PCT(o.target)} > سقف الفئة ${o.cat} ${o.cap}% — ${o.st.why}`).join('؛ '));
        }

        // ④ السوق 100% سعودي
        addCheck('المحفظة 100% سعودية بقرار المالك — لا تُنتقد لغياب التنويع الجغرافي', 'م.9',
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
      // AUDIT-FIX 2026-08-21 (#36): كان الفحص يأخذ أحدث سطر في الدفتر عبر كل الرموز،
      // فمراجعة واحدة لسهم واحد تُبرّئ المحفظة كلها — بينما دفتر المراجعة يحاسب كل
      // رمز على حدة. وكانت العتبة 183 يوماً هنا مقابل 180 في review-log.js:75.
      // المعتمد الآن: العتبة 180 والمحاسبة لكل رمز مملوك — نفس منهجية الدفتر.
      {
        const lastByTicker = {};
        reviewLog.forEach(r => {
          const tk = String(r.ticker || '').trim().toUpperCase();
          if (!tk || !r.review_date) return;
          const d = String(r.review_date);
          if (!lastByTicker[tk] || d > lastByTicker[tk]) lastByTicker[tk] = d;
        });
        const _ageOf = d => (today - new Date(d)) / 86400000;
        const overdue = holdings.filter(h => {
          const d = lastByTicker[String(h.ticker || '').trim().toUpperCase()];
          return !d || _ageOf(d) > REVIEW_CYCLE_DAYS;
        });
        const neverRev = holdings.filter(h => !lastByTicker[String(h.ticker || '').trim().toUpperCase()]);
        if (!reviewLog.length) {
          addCheck('الدورة الروتينية كل 6 أشهر (لكل سهم)', '§5', '🔴 مخالف',
            'لا توجد أي مراجعة مسجّلة في دفتر المراجعة — الدورة لم تبدأ.');
        } else {
          addCheck('الدورة الروتينية كل 6 أشهر (لكل سهم)', '§5',
            overdue.length ? '🔴 مخالف' : '✅ ممتثل',
            overdue.length
              ? `**${overdue.length}** من ${holdings.length} سهماً تجاوزت ${REVIEW_CYCLE_DAYS} يوماً بلا مراجعة: ${overdue.map(h => h.ticker).join('، ')}${neverRev.length ? ` — منها ${neverRev.length} لم تُراجَع قطّ. ` : '. '}مراجعة سهم واحد لا تُبرّئ البقية (§5).`
              : `كل الـ ${holdings.length} سهماً روجعت خلال آخر ${REVIEW_CYCLE_DAYS} يوماً.`);
        }
      }

      // ⑦ طزاجة الأسعار (شرط صحة كل حساب دستوري)
      {
        const tsC = lsGet('tharwa-price-timestamps', {}) || {};
        // AUDIT-FIX 2026-08-21 (#32): نفس تعريف hasStalePrice في اللوحة —
        // السعر المثبَّت يدوياً قرار مالك لا بيانات متقادمة.
        const staleC = holdings.filter(h => {
          if (h.price_manual) return false;
          const v = tsC[h.ticker]; if (!v) return true;
          const ms = new Date(v).getTime();
          return !isFinite(ms) || (Date.now() - ms) / 86400000 > 7;
        });
        const manC = holdings.filter(h => h.price_manual).length;
        addCheck('سلامة مدخلات القرار — الأسعار حديثة (≤ 7 أيام)', '§2',
          holdings.length ? (staleC.length ? '⚠️ ضعف في المدخلات' : '✅ ممتثل') : '⚠️ غير قابل للفحص',
          holdings.length
            ? (staleC.length ? `${staleC.length} سهم سعره قديم أو بلا طابع: ${staleC.map(h => h.ticker).join('، ')} — كل وزن وانحراف وXIRR مبني عليها يرث الضعف.` : `كل الأسعار محدَّثة خلال 7 أيام${manC ? ` (${manC} منها مثبَّت يدوياً بقرارك)` : ''}.`)
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
        addCheck(`هدف الدخل ${SAR(GOAL_MONTHLY_INCOME)} ر.س شهرياً بحلول 2045`, 'م.4 و7',
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

      // أولوية 0 — قرارك الصريح بالخروج (هدف صفر أو مهمة تصفية)
      // ADDED 2026-08-21: التقرير لم يكن يعرف `stock_zero_targets_v1` إطلاقاً، بينما
      // محرّك القرار يضعه في المرتبة P0.1 **فوق** المشغّلات الثابتة (قرارك لا يعتمد
      // على السعر فلا يُعلَّق بسببه). فكان التقرير قد يوصي بالاحتفاظ — أو حتى
      // بالتجميع — في سهم أعلنتَ أنت نيّة تصفيته. الصفر الافتراضي في عمود الهدف
      // **ليس** أمر بيع؛ المميِّز هو تسجيل الرمز صراحةً في هذا المفتاح.
      {
        const zeroT = await syncedGet('stock_zero_targets_v1', []);
        const zeroSet = new Set(Array.isArray(zeroT) ? zeroT.map(t => String(t).trim().toUpperCase()) : []);
        const liqTasks = new Set((tasks || [])
          .filter(t => t.type === 'liquidation' && t.status !== 'done' && t.ticker)
          .map(t => String(t.ticker).trim().toUpperCase()));
        const wantsExit = [...new Set([...zeroSet, ...liqTasks])];
        wantsExit.forEach(tk => {
          const h = holdings.find(x => String(x.ticker).trim().toUpperCase() === tk);
          if (!h) return;
          const val = +h.shares * +h.current_price;
          const src = zeroSet.has(tk) && liqTasks.has(tk) ? 'هدف صفر + مهمة تصفية'
                    : zeroSet.has(tk) ? 'هدف صفر مقصود' : 'مهمة تصفية مفتوحة';
          addAct(0, `🔻 ${h.ticker} — ${h.name || ''}`,
            `تصفية المركز بالكامل (≈ ${SAR(val)} ر.س${gm2 > 0 ? ` · ${PCT(val / gm2 * 100)} من المحفظة` : ''})`,
            `قرارك الصريح بالخروج (${src}) — يسبق كل حساب آخر بما فيه المشغّلات الثابتة، لأنه لا يعتمد على السعر فلا يُعلَّق بحارس السعر. ما دام الرمز مسجّلاً هنا فلا يصحّ أن يظهر كفرصة تجميع.`);
        });
        if (wantsExit.some(tk => !holdings.find(x => String(x.ticker).trim().toUpperCase() === tk))) {
          const done = wantsExit.filter(tk => !holdings.find(x => String(x.ticker).trim().toUpperCase() === tk));
          p(`_ملاحظة: ${done.length} رمزاً مسجَّلاً كنيّة تصفية لم يعد في الحيازات (${done.join('، ')}) — نُفِّذ الخروج، ويمكن إزالة العلامة._`);
        }
      }

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
        if (dLast == null || dLast > REVIEW_CYCLE_DAYS) addAct(6, '📅 الدورة النصف سنوية',
          'نفّذ مراجعة الدورة وسجّلها في دفتر المراجعة',
          dLast == null ? 'لا مراجعة مسجّلة إطلاقاً (§5).' : `آخر مراجعة منذ ${dLast.toFixed(0)} يوماً — تجاوزت ${REVIEW_CYCLE_DAYS} يوماً (§5).`);
      }

      if (actions.length) {
        actions.sort((a, b) => a.prio - b.prio);
        const PL = { 0:'0 — قرارك بالخروج', 1:'1 — مشغّل ثابت', 2:'2 — كسر سقف', 3:'3 — فشل استدامة', 4:'4 — قلق استدامة', 5:'5 — فرصة إضافة', 6:'6 — صيانة بيانات' };
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

        const p0 = actions.filter(a => a.prio === 0).length;
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

      // AUDIT-FIX 2026-08-21 (#19): كان العنوان يَعِد بـ«كل جدول في قاعدة البيانات»
      // ويطبع 16 من 19 — الثلاثة الغائبة (user_settings, support_tickets,
      // user_profiles) هي بالذات التي تحمل إعدادات المالك وحسابه. تُطبع الآن،
      // ويُطبع بعدها جرد يقارن ما طُبع بـTABLES فلا يعود الادّعاء بلا إثبات.
      {
        const _extra = await Promise.all([
          fetchTable('user_settings').catch(() => null),
          fetchTable('support_tickets').catch(() => null),
          fetchTable('user_profiles').catch(() => null),
        ]);
        const _lbl = ['user_settings — الإعدادات المتزامنة', 'support_tickets — تذاكر الدعم', 'user_profiles — ملف الحساب'];
        _extra.forEach((rows, i) => {
          if (rows == null) { h3(`${_lbl[i]} — تعذّرت القراءة`); p('_منعت RLS قراءة هذا الجدول أو فشلت الشبكة — يُعلَن ولا يُكتم (§8)._'); return; }
          dumpTable(_lbl[i], rows, i === 0 ? 'قيم JSON الطويلة مقتطعة عند 300 حرف — النسخة الاحتياطية تحفظها كاملة.' : '');
        });

        h3('جرد الاكتمال — ما طُبع مقابل قائمة الجداول المعتمدة');
        const _dumped = new Set(['holdings','transactions','dividends','cashflow_entries','net_worth_snapshots',
          'nw_assets','nw_liabilities','real_estate','stock_targets','sector_targets','watchlist',
          'portfolio_tasks','user_stocks','review_log','portfolio_cash','review_log_attachments',
          'user_settings','support_tickets','user_profiles']);
        const _notDumped = TABLES.filter(t => !_dumped.has(t));
        p(_notDumped.length
          ? `⚠️ **${_notDumped.length}** جدولاً في TABLES لم يُطبع هنا: \`${_notDumped.join('`، `')}\` — العنوان يَعِد بالكل، فالفرق يُعلَن.`
          : `✅ كل الـ **${TABLES.length}** جدولاً في قائمة النسخ الاحتياطي مطبوعة أعلاه.`);

        const _det = await detectUnlistedTables();
        if (!_det.ok) {
          p(`⚠️ تعذّر التحقق من وجود جداول خارج القائمة (${esc(_det.reason)}) — لا يمكن تأكيد أن القائمة كاملة.`);
        } else if (_det.unlisted.length) {
          p(`🔴 **${_det.unlisted.length}** جدولاً موجود في قاعدة البيانات وغير مُسجَّل في TABLES: \`${_det.unlisted.join('`، `')}\` — **لا يدخل النسخة الاحتياطية إطلاقاً**. أضِفه إلى TABLES في settings.js.`);
        } else {
          p(`✅ لا جدول خارج القائمة: قاعدة البيانات تنشر ${_det.seen} جدولاً وكلها مُسجَّلة في TABLES.`);
          if (_det.missing.length) p(`ℹ️ ${_det.missing.length} جدولاً في TABLES غير منشور للدور الحالي: \`${_det.missing.join('`، `')}\`.`);
        }
      }

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
    // 39. طبقة الذكاء ومدخلات القرار المحفوظة
    // ADDED 2026-08-21: خمسة مفاتيح في user_settings كانت **صفر تغطية** في هذا
    // التقرير رغم أنها تحمل قرارات ومدخلات فعلية: نيّة التصفية، الأساسيات
    // المجلوبة آلياً، مرصد السعر وكشف التجزئة، سجل قياس الموثوقية، والأسعار
    // التاريخية. النسخة الاحتياطية كانت تحفظها (تُصدَّر ضمن user_settings كاملاً)
    // لكن التقرير لم يكن يشرحها — فالبيانات موجودة والمعنى غائب.
    // ════════════════════════════════════════════════════════
    book('A');
    await tick('طبقة الذكاء');
    h2('39. طبقة الذكاء ومدخلات القرار المحفوظة');
    p('هذه المفاتيح تُغذّي محرّك القرار وطبقة الذكاء فوقه. كلها في جدول `user_settings` وتدخل النسخة الاحتياطية كاملةً، لكنها لا تُقرأ من الجداول العادية فتُشرح هنا صراحةً.');
    {
      // ① نيّة التصفية
      h3('39.1 نيّة التصفية المُعلَنة (stock_zero_targets_v1)');
      const _zt = await syncedGet('stock_zero_targets_v1', []);
      const _ztArr = Array.isArray(_zt) ? _zt.map(t => String(t).trim().toUpperCase()) : [];
      p('الصفر في عمود الهدف **ليس** أمر بيع — فالعمود افتراضه صفر لكل رمز. المميِّز هو تسجيل الرمز صراحةً في هذا المفتاح، وعندها يضعه محرّك القرار في المرتبة P0.1 **فوق** المشغّلات الثابتة، لأن قرارك لا يعتمد على السعر فلا يُعلَّق بحارس السعر.');
      if (_ztArr.length) {
        p(mdTable(['الرمز', 'الاسم', 'القيمة الحالية', 'الوزن', 'الحالة'], _ztArr.map(tk => {
          const _h = holdings.find(x => String(x.ticker).trim().toUpperCase() === tk);
          if (!_h) return [tk, '—', '—', '—', '✅ خرج فعلاً — يمكن إزالة العلامة'];
          const v = +_h.shares * +_h.current_price;
          return [tk, _h.name || '—', SAR(v), _totalMkt > 0 ? PCT(v / _totalMkt * 100) : '—', '🔻 ما زال مملوكاً — التصفية لم تُنفَّذ'];
        })));
      } else {
        p('_لا رمز مُعلَن للتصفية._');
      }

      // ② الأساسيات المجلوبة آلياً
      h3('39.2 أساسيات الشركات المجلوبة آلياً (stock_fundamentals_v1)');
      const _fd = await syncedGet('stock_fundamentals_v1', null);
      p('مصدر **خارجي** (§2): يُستعمل فقط حين تغيب أرقامك، وكل سطر منه موسوم، و**لا يُصعِّد قراراً إلى الأحمر بمفرده**. بيتا لا تُجلب عمداً — المصدر يقيسها مقابل مؤشر أمريكي والدستور §2 يعتبرها غير صالحة سعودياً. وFFO لا يوفّره المصدر، فالريتس بلا بديل صامت.');
      if (_fd && _fd.bySymbol && Object.keys(_fd.bySymbol).length) {
        const _fAge = _fd.fetchedAt ? ((Date.now() - new Date(_fd.fetchedAt).getTime()) / 86400000) : null;
        p('آخر جلب: **' + (_fd.fetchedAt ? new Date(_fd.fetchedAt).toLocaleString('ar-SA') : 'غير مسجَّل') + '**'
          + (_fAge != null ? ' (منذ ' + _fAge.toFixed(1) + ' يوماً)' : '')
          + ' · يُجدَّد تلقائياً كل 7 أيام'
          + (_fAge != null && _fAge > 90 ? ' — ⚠️ **تجاوز 90 يوماً**، وهو حدّ طزاجة المصدر الخارجي في §2.' : '.'));
        const _fRows = Object.entries(_fd.bySymbol).map(([tk, f]) => {
          const _h = holdings.find(x => x.ticker === tk);
          return [tk, _h ? (_h.name || '—') : '—',
            (f && f.dps != null) ? formatNum(+f.dps, 2) : 'غير متوفرة',
            (f && f.eps != null) ? formatNum(+f.eps, 2) : 'غير متوفرة',
            (f && f.fcfPerShare != null) ? formatNum(+f.fcfPerShare, 2) : 'غير متوفرة',
            (f && f.currency && f.currency !== 'SAR') ? ('⚠️ ' + f.currency) : 'SAR',
            (f && Array.isArray(f.splits) && f.splits.length) ? ('⚠️ ' + f.splits.length) : '—'];
        });
        p(mdTable(['الرمز', 'الاسم', 'DPS', 'EPS', 'FCF/سهم', 'العملة', 'تجزئة'], _fRows));
        const _noCover = holdings.filter(h2x => !_fd.bySymbol[h2x.ticker]);
        if (_noCover.length) p('**' + _noCover.length + '** سهماً مملوكاً بلا أساسيات خارجية: ' + _noCover.map(h2x => h2x.ticker).join('، ') + ' — تُعلَن ولا تُقدَّر (§8).');
      } else {
        p('_لا أساسيات مجلوبة بعد._ افتح صفحة محرّك القرار مرة واحدة ليتم الجلب، وتأكّد أن الدالة السحابية `update-prices` منشورة بوضع `fundamentals`.');
        noteMissing('أساسيات الشركات (stock_fundamentals_v1)', 'فارغة — تصنيف التوزيعات يعتمد على سجل ملكيتك وحده بدل تاريخ سياسة الشركة.');
      }

      // ③ مرصد السعر
      h3('39.3 مرصد السعر وكشف التجزئة (price_watch_v1)');
      const _pw = (await syncedGet('price_watch_v1', {})) || {};
      p('آخر سعر رُصد لكل رمز وتاريخه. وظيفته حراسة المدخلات: تحرّك ≥25% بين رصدين يوقف **كل إشارة سعرية** لذلك السهم (قد يكون تجزئة لا انهياراً)، وسعر أقدم من 21 يوماً يمنع أي قرار سعري. السعر المثبَّت يدوياً (`price_manual`) لا يتقادم — قرارك.');
      const _pwKeys = Object.keys(_pw);
      if (_pwKeys.length) {
        const _pwRows = _pwKeys.map(tk => {
          const w = _pw[tk] || {};
          const _h = holdings.find(x => x.ticker === tk);
          const cur = _h ? +_h.current_price : null;
          const chg = (w.p > 0 && cur > 0) ? (cur - w.p) / w.p * 100 : null;
          const ageD = w.d ? (Date.now() - new Date(w.d).getTime()) / 86400000 : null;
          return [tk, _h ? (_h.name || '—') : '—', formatNum(+w.p || 0, 2), w.d || '—',
            ageD == null ? '—' : ageD.toFixed(0),
            cur ? formatNum(cur, 2) : '—',
            chg == null ? '—' : ((chg >= 0 ? '+' : '') + chg.toFixed(1) + '%'),
            (chg != null && Math.abs(chg) >= 25) ? '🚨 قفزة — إشارات السعر موقوفة'
              : (ageD != null && ageD > 21) ? '⏳ أقدم من 21 يوماً — لا قرار سعري'
              : (_h && _h.price_manual) ? '🔒 مثبَّت يدوياً' : '✅'];
        });
        p(mdTable(['الرمز', 'الاسم', 'السعر المرصود', 'تاريخ الرصد', 'منذ (يوم)', 'السعر الآن', 'التغيّر', 'الحالة'], _pwRows));
      } else {
        p('_لا رصد محفوظ بعد — يُبنى تلقائياً عند أول فتح لصفحة محرّك القرار._');
      }

      // ④ سجل قياس الموثوقية
      h3('39.4 سجل قياس الموثوقية والأداء (decision_intel_history_v1)');
      const _ih = await syncedGet('decision_intel_history_v1', []);
      const _ihArr = Array.isArray(_ih) ? _ih : [];
      p('قياس واحد يومياً (سقف 400) لكل ما تقيسه طبقة الذكاء. الغرض: أن يكون تحسّن الموثوقية **مقيساً** لا موعوداً — الأرقام أدناه هي الفرق الفعلي بين أول قياس وآخره.');
      // AUDIT 2026-08-22 — قرار المالك: أُزيل صفّ «فرقك عن تاسي» وشرحه.
      // كلا رقمَي ألفا (هنا وفي §29) مبنيّان على افتراض عائد توزيعات سوق ثابت
      // وعلى استيفاء سعر المؤشر — مُستنبَطان لا مقيسان.
      // القاعدة: ما لسنا واثقين منه 100% لا يُعرض. ⚠️ لا تُعِد الصفّ.
      if (_ihArr.length >= 2) {
        const _a = _ihArr[0], _z = _ihArr[_ihArr.length - 1];
        const _dlt = (x, y, isPct) => (x == null || y == null) ? '—'
          : (formatNum(x, isPct ? 2 : 0) + ' ← ' + formatNum(y, isPct ? 2 : 0) + (isPct ? '%' : '')
             + ' (' + (y - x >= 0 ? '+' : '') + formatNum(y - x, isPct ? 2 : 0) + ')');
        p(mdTable(['المقياس', 'من ' + _a.date + ' إلى ' + _z.date], [
          ['عدد القياسات المحفوظة', String(_ihArr.length)],
          ['قيمة المحفظة', _dlt(_a.value, _z.value)],
          ['عائدك السنوي (XIRR)', _dlt(_a.xirr, _z.xirr, true)],
          ['دخلك القادم (Forward)', _dlt(_a.fwdIncome, _z.fwdIncome)],
          ['الدخل المهدَّد', _dlt(_a.atRisk, _z.atRisk)],
          ['ثقة البيانات', _dlt(_a.confidence, _z.confidence, true)],
          ['اكتمال بيانات القرار', _dlt(_a.readiness, _z.readiness, true)],
        ]));
        if (_z.actions) p('آخر قياس أحصى: **' + (_z.actions.exit || 0) + '** خروج · **' + (_z.actions.trim || 0) + '** تخفيف · **' + (_z.actions.add || 0) + '** إضافة.');
      } else if (_ihArr.length === 1) {
        p('_قياس واحد فقط (' + _ihArr[0].date + ') — المقارنة تحتاج قياسين. افتح صفحة محرّك القرار في يوم لاحق._');
      } else {
        p('_لا قياس محفوظ بعد._');
      }

      // ⑤ الأسعار التاريخية
      h3('39.5 تغطية الأسعار التاريخية (price_history_v1)');
      const _ph = await syncedGet('price_history_v1', null);
      p('الإغلاقات اليومية لكل رمز مملوك. عليها يُبنى خطّ المحفظة اليومي في صفحة الأداء بدل اللقطات الشهرية. **الصفوف الخام لا تُطبع هنا** (عشرات الآلاف من النقاط) — تُحفظ كاملةً في النسخة الاحتياطية، ويُطبع هنا مدى التغطية فقط.');
      if (_ph && _ph.bySymbol && Object.keys(_ph.bySymbol).length) {
        const _phRows = Object.entries(_ph.bySymbol).map(([tk, v]) => {
          const arr = (v && Array.isArray(v.p)) ? v.p : [];
          const _h = holdings.find(x => x.ticker === tk);
          return [tk, _h ? (_h.name || '—') : '—', String(arr.length),
            arr.length ? String(arr[0][0]) : '—',
            arr.length ? String(arr[arr.length - 1][0]) : '—',
            arr.length ? '✅' : '⚠️ لا نقاط'];
        });
        p(mdTable(['الرمز', 'الاسم', 'عدد النقاط', 'من', 'إلى', 'الحالة'], _phRows));
        const _phMiss = holdings.filter(h3x => {
          const rec = _ph.bySymbol[h3x.ticker];
          return !(rec && Array.isArray(rec.p) && rec.p.length);
        });
        p(_phMiss.length
          ? ('⚠️ **' + _phMiss.length + '** سهماً مملوكاً بلا أسعار تاريخية: ' + _phMiss.map(h3x => h3x.ticker).join('، ') + ' — خطّ المحفظة اليومي يسقط على أساس اللقطات ويُعلن ذلك في صفحة الأداء.')
          : '✅ كل الحيازات مغطّاة — خطّ المحفظة اليومي يعمل على أساس الأسعار.');
      } else {
        p('_لا أسعار تاريخية محفوظة._ اضغط «🔄 جلب تاسي تلقائياً» في صفحة الأداء (تجلب الأسعار معها). خطّ المحفظة يعمل حالياً على أساس اللقطات — أقل دقّة ومُعلَن في الصفحة.');
        noteMissing('الأسعار التاريخية (price_history_v1)', 'فارغة — خطّ الأداء اليومي يسقط على اللقطات الشهرية.');
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
          holdings.length < 15 ? 'دون الحد الأدنى الدستوري 15' : holdings.length > 20 ? 'فوق السقف الدستوري 20' : 'داخل النطاق 18–25 ✅');
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

// ╔══════════════════════════════════════════════════════════════════════
// ║  NOTIF-SECTION-START — قسم التنبيهات (بريد + إشعار متصفح)
// ╠══════════════════════════════════════════════════════════════════════
// ║ نطاق هذا القسم: كل ما يخص «🔔 التنبيهات» في صفحة الإعدادات فقط.
// ║ لا يمسّ النسخ الاحتياطي ولا الاستعادة ولا تقرير المراجعة، ولا يضيف
// ║ جدولاً إلى TABLES (إدراج الجدولين الجديدين في النسخة الاحتياطية قرارٌ
// ║ منفصل يُنسَّق مع مالك ملف النسخ — انظر تقرير التسليم).
// ║
// ║ العقد مع الدالة السحابية `price-alerts` (ثابت):
// ║   supabaseClient.functions.invoke('price-alerts',
// ║     { body: { test: true, channel: 'email' | 'push' | 'both' } })
// ║   → data = { sent: {...}, errors: [...] }
// ╚══════════════════════════════════════════════════════════════════════

// المفتاح العام لـVAPID. عام بطبيعته — يُشتقّ من الخاص ويُرسل مع كل اشتراك،
// وأي متصفح يراه. السرّ هو المفتاح الخاص، وهو في الدالة السحابية وحدها.
const NOTIF_VAPID_PUBLIC =
  'BL25lcS0pe_hO3qX_nvCXWPOQ1Vlu66ipHdfNgMiImkDNqCppxHDijQbSU3uYSabAZvhc3rk-1C2FAhg5eiZBiw';

const NOTIF_FN         = 'price-alerts';
const NOTIF_SW_PATH    = 'sw.js';          // نسبي: يعمل ولو نُشر الموقع تحت مسار فرعي
const NOTIF_PREFS_TBL  = 'notification_prefs';
const NOTIF_SUBS_TBL   = 'push_subscriptions';
const NOTIF_DEPLOY_CMD = 'npx supabase functions deploy price-alerts';

// الحالة الحيّة للقسم — تُبنى عند التحميل وتُحدَّث بعد كل إجراء.
const notifState = {
  user: null,
  email: '',
  emailEnabled: false,
  pushEnabled: false,
  prefsRow: null,
  prefsMissing: false,     // جدول notification_prefs غير موجود
  subsMissing: false,      // جدول push_subscriptions غير موجود
  loadError: '',           // خطأ قراءة غير متعلّق بغياب الجدول
  deviceCount: 0,
  thisEndpoint: '',
  thisDeviceSubscribed: false,
  busy: false,
};

// ══════════════════════════════════════════════════════════════
// بيئة المتصفح — ما الذي يعمل هنا فعلاً؟
// ══════════════════════════════════════════════════════════════
function notifEnv() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const hasSW    = !!(nav && 'serviceWorker' in nav);
  const hasPush  = (typeof PushManager !== 'undefined');
  const hasNotif = (typeof Notification !== 'undefined');

  const loc  = typeof location !== 'undefined' ? location : null;
  const host = loc ? String(loc.hostname || '') : '';
  const prot = loc ? String(loc.protocol || '') : '';
  // Push يتطلب سياقاً آمناً. localhost يُعامَل آمناً في كل المتصفحات.
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '';
  const secure  = prot === 'https:' || isLocal;

  return {
    hasSW, hasPush, hasNotif, secure, isLocal, protocol: prot, host,
    supported: hasSW && hasPush && hasNotif,
    usable: hasSW && hasPush && hasNotif && secure,
  };
}

function notifPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  const p = Notification.permission;
  return (p === 'granted' || p === 'denied' || p === 'default') ? p : 'default';
}

const NOTIF_PERM_LABEL = {
  granted:     'ممنوح',
  denied:      'مرفوض',
  default:     'لم يُطلب بعد',
  unsupported: 'غير مدعوم في هذا المتصفح',
};
const NOTIF_PERM_STATE = { granted: 'good', denied: 'bad', default: 'warn', unsupported: 'bad' };

// ══════════════════════════════════════════════════════════════
// أدوات ترميز — VAPID ومفاتيح الاشتراك
// ══════════════════════════════════════════════════════════════
// base64url → Uint8Array (applicationServerKey لا يقبل نصاً في كل المتصفحات)
function notifUrlB64ToBytes(base64) {
  const s = String(base64 || '').trim();
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ArrayBuffer → base64url (احتياط حين لا تتوفّر subscription.toJSON)
function notifBytesToB64(buf) {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// استخراج الحمولة التي تُحفظ في push_subscriptions.
// المصدر الأول toJSON() لأنه القياسي؛ وgetKey() احتياطٌ يملأ ما نقص.
function notifSubPayload(sub) {
  if (!sub) return { endpoint: '', p256dh: '', auth: '' };

  let j = null;
  try { if (typeof sub.toJSON === 'function') j = sub.toJSON(); } catch (_) { j = null; }

  const keys = (j && j.keys) || {};
  let endpoint = String((j && j.endpoint) || sub.endpoint || '');
  let p256dh   = String(keys.p256dh || '');
  let auth     = String(keys.auth   || '');

  if ((!p256dh || !auth) && typeof sub.getKey === 'function') {
    try { if (!p256dh) p256dh = notifBytesToB64(sub.getKey('p256dh')); } catch (_) {}
    try { if (!auth)   auth   = notifBytesToB64(sub.getKey('auth'));   } catch (_) {}
  }
  return { endpoint, p256dh, auth };
}

// ══════════════════════════════════════════════════════════════
// تشخيص أخطاء القاعدة — الجدول الغائب ليس خطأً خاماً
// ══════════════════════════════════════════════════════════════
function notifTableMissing(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg  = String(err.message || err.details || '');
  if (code === '42P01' || code === 'PGRST205') return true;
  return /relation .* does not exist/i.test(msg)
      || /could not find the table/i.test(msg)
      || /schema cache/i.test(msg);
}

function notifAuthError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg  = String(err.message || '');
  return code === 'PGRST301' || code === '401'
      || /jwt|not authenticated|invalid token|session/i.test(msg);
}

function notifDbErrText(err) {
  if (!err) return '';
  const parts = [err.message, err.details, err.hint].filter(Boolean).map(String);
  return parts.join(' — ') || String(err);
}

// ══════════════════════════════════════════════════════════════
// قراءة/كتابة التفضيلات والاشتراكات
// ══════════════════════════════════════════════════════════════
async function notifLoadPrefs(userId) {
  try {
    const { data, error } = await supabaseClient
      .from(NOTIF_PREFS_TBL).select('*').eq('user_id', userId).maybeSingle();
    if (error) {
      if (notifTableMissing(error)) return { missing: true };
      return { error: notifDbErrText(error), auth: notifAuthError(error) };
    }
    return { row: data || null };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

async function notifSavePrefs(patch) {
  if (!notifState.user) return { ok: false, error: 'لا توجد جلسة نشطة.' };
  const row = Object.assign({
    user_id:       notifState.user.id,
    email:         notifState.email,
    email_enabled: notifState.emailEnabled,
    push_enabled:  notifState.pushEnabled,
  }, patch || {}, { updated_at: new Date().toISOString() });

  try {
    const { error } = await supabaseClient
      .from(NOTIF_PREFS_TBL).upsert(row, { onConflict: 'user_id' });
    if (error) {
      if (notifTableMissing(error)) { notifState.prefsMissing = true; return { ok: false, missing: true }; }
      return { ok: false, error: notifDbErrText(error), auth: notifAuthError(error) };
    }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }

  notifState.prefsMissing = false;
  notifState.email        = row.email;
  notifState.emailEnabled = !!row.email_enabled;
  notifState.pushEnabled  = !!row.push_enabled;
  return { ok: true };
}

async function notifLoadSubs(userId) {
  try {
    const { data, error } = await supabaseClient
      .from(NOTIF_SUBS_TBL).select('endpoint,user_agent').eq('user_id', userId);
    if (error) {
      if (notifTableMissing(error)) return { missing: true };
      return { error: notifDbErrText(error), auth: notifAuthError(error) };
    }
    return { rows: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

// ══════════════════════════════════════════════════════════════
// عامل الخدمة والاشتراك
// ══════════════════════════════════════════════════════════════
async function notifRegisterSW() {
  const env = notifEnv();
  if (!env.hasSW) return { ok: false, error: 'هذا المتصفح لا يدعم عامل الخدمة (Service Worker).' };
  try {
    const reg = await navigator.serviceWorker.register(NOTIF_SW_PATH);
    // ننتظر التفعيل: pushManager.subscribe على تسجيل غير مفعَّل يفشل أحياناً.
    if (navigator.serviceWorker.ready) { try { await navigator.serviceWorker.ready; } catch (_) {} }
    return { ok: true, reg };
  } catch (e) {
    return { ok: false, error: 'تعذّر تسجيل عامل الخدمة: ' + String((e && e.message) || e) };
  }
}

async function notifCurrentSub() {
  const env = notifEnv();
  if (!env.usable) return null;
  try {
    // بلا وسيط: يُرجع التسجيل الذي **يتحكّم بهذه الصفحة** — وهو المطلوب.
    // تمرير مسار السكربت هنا خطأ شائع (الوسيط عنوان صفحة لا عنوان سكربت).
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg || !reg.pushManager) return null;
    return (await reg.pushManager.getSubscription()) || null;
  } catch (_) {
    return null;
  }
}

// تفعيل إشعارات المتصفح على **هذا الجهاز**: إذن → عامل خدمة → اشتراك → حفظ.
// كل عائق يُعاد بنصّه، ولا خطوة تُتخطّى بصمت.
async function notifSubscribeThisDevice() {
  const env = notifEnv();
  if (!env.hasNotif || !env.hasSW || !env.hasPush)
    return { ok: false, error: 'هذا المتصفح لا يدعم إشعارات الويب (Notification / Service Worker / Push).' };
  if (!env.secure)
    return { ok: false, error: `إشعارات المتصفح تتطلّب اتصالاً آمناً (https)، والصفحة مفتوحة على «${env.protocol || '؟'}».` };
  if (!notifState.user)
    return { ok: false, error: 'انتهت الجلسة — سجّل الدخول من جديد ثم أعد المحاولة.' };

  // 1) الإذن
  let perm = notifPermission();
  if (perm === 'default') {
    try { perm = await Notification.requestPermission(); } catch (e) { perm = notifPermission(); }
  }
  if (perm === 'denied')
    return { ok: false, denied: true, error: 'إذن الإشعارات مرفوض لهذا الموقع، والمتصفح لن يسأل مجدداً حتى تعيده يدوياً.' };
  if (perm !== 'granted')
    return { ok: false, error: 'لم يُمنح إذن الإشعارات — أُغلق الطلب دون موافقة.' };

  // 2) عامل الخدمة
  const sw = await notifRegisterSW();
  if (!sw.ok) return { ok: false, error: sw.error };

  // 3) الاشتراك
  let sub = null;
  try {
    sub = await sw.reg.pushManager.getSubscription();
    if (!sub) {
      sub = await sw.reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: notifUrlB64ToBytes(NOTIF_VAPID_PUBLIC),
      });
    }
  } catch (e) {
    return { ok: false, error: 'فشل إنشاء اشتراك Push: ' + String((e && e.message) || e) };
  }

  const payload = notifSubPayload(sub);
  if (!payload.endpoint || !payload.p256dh || !payload.auth)
    return { ok: false, error: 'الاشتراك أُنشئ ناقصاً (endpoint أو مفاتيح مفقودة) — لا يُحفَظ سجل ناقص.' };

  // 4) الحفظ — unique(user_id, endpoint) يجعل إعادة التفعيل تحديثاً لا تكراراً
  const row = {
    user_id:    notifState.user.id,
    endpoint:   payload.endpoint,
    p256dh:     payload.p256dh,
    auth:       payload.auth,
    user_agent: (typeof navigator !== 'undefined' && navigator.userAgent) ? String(navigator.userAgent).slice(0, 400) : '',
  };
  try {
    const { error } = await supabaseClient
      .from(NOTIF_SUBS_TBL).upsert(row, { onConflict: 'user_id,endpoint' });
    if (error) {
      if (notifTableMissing(error)) { notifState.subsMissing = true; return { ok: false, missing: true }; }
      return { ok: false, error: notifDbErrText(error), auth: notifAuthError(error) };
    }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }

  notifState.subsMissing = false;
  notifState.thisEndpoint = payload.endpoint;
  notifState.thisDeviceSubscribed = true;
  return { ok: true, endpoint: payload.endpoint, row };
}

// إلغاء اشتراك هذا الجهاز: يُحذف السجل ويُلغى الاشتراك محلياً.
async function notifUnsubscribeThisDevice() {
  if (!notifState.user) return { ok: false, error: 'انتهت الجلسة — سجّل الدخول من جديد.' };

  const sub = await notifCurrentSub();
  const endpoint = notifState.thisEndpoint || (sub ? notifSubPayload(sub).endpoint : '');
  if (!endpoint) return { ok: false, error: 'لا يوجد اشتراك مسجَّل على هذا الجهاز.' };

  try {
    const { error } = await supabaseClient
      .from(NOTIF_SUBS_TBL).delete().eq('user_id', notifState.user.id).eq('endpoint', endpoint);
    if (error && !notifTableMissing(error))
      return { ok: false, error: notifDbErrText(error), auth: notifAuthError(error) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }

  if (sub && typeof sub.unsubscribe === 'function') { try { await sub.unsubscribe(); } catch (_) {} }

  notifState.thisDeviceSubscribed = false;
  notifState.thisEndpoint = '';
  return { ok: true };
}

// ══════════════════════════════════════════════════════════════
// استدعاء الدالة السحابية — والنتيجة تُعرض كما رجعت
// ══════════════════════════════════════════════════════════════
// كل مخرَج هنا يحمل سبباً: «تم الإرسال ✓» بلا تفصيل ممنوعة، لأن الفشل
// الصامت في قناة إشعار يعني ألّا يصل تنبيه بيع ولا يعرف المالك.
async function notifFnErrorDetail(error) {
  const msg = String((error && error.message) || error || 'خطأ غير معروف');
  let status = 0, body = '';

  const ctx = error && error.context;
  if (ctx && typeof ctx === 'object') {
    status = Number(ctx.status || 0) || 0;
    if (typeof ctx.text === 'function') {
      try { body = String(await ctx.text() || '').slice(0, 600); } catch (_) {}
    }
  }

  // الدالة تردّ أخطاءها المفهومة جسماً JSON فيه `message` عربي — نُظهره كما هو
  // بدل نصّ المكتبة العام «non-2xx status code» الذي لا يقول للمالك شيئاً.
  let fnMsg = '';
  if (body) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.message === 'string' && parsed.message.trim()) fnMsg = parsed.message.trim();
      else if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) fnMsg = parsed.error.trim();
    } catch (_) {}
  }

  if (status === 404 || /not found|does not exist|failed to fetch/i.test(msg + ' ' + body)) {
    return {
      kind: 'not-deployed', status,
      detail: `الدالة «${NOTIF_FN}» غير منشورة بعد على Supabase (أو تعذّر الوصول إليها).\n`
            + `انشرها بالأمر:  ${NOTIF_DEPLOY_CMD}`,
      raw: msg + (body ? ' | ' + body : ''),
    };
  }
  if (status === 401 || status === 403 || /jwt|unauthor|forbidden/i.test(msg + ' ' + body)) {
    return { kind: 'auth', status, detail: 'الجلسة غير صالحة أو منتهية — سجّل الخروج والدخول ثم أعد المحاولة.', raw: msg + (body ? ' | ' + body : '') };
  }
  return {
    kind: 'error', status,
    detail: fnMsg || (msg + (body ? '\n' + body : '')),
    raw: msg + (body ? ' | ' + body : ''),
  };
}

async function notifInvoke(channel) {
  if (typeof supabaseClient === 'undefined' || !supabaseClient
      || !supabaseClient.functions || typeof supabaseClient.functions.invoke !== 'function') {
    return { ok: false, kind: 'client', detail: 'نسخة مكتبة Supabase المحمّلة لا تدعم استدعاء الدوال السحابية (functions.invoke).' };
  }

  let res;
  try {
    res = await supabaseClient.functions.invoke(NOTIF_FN, { body: { test: true, channel } });
  } catch (e) {
    return { ok: false, kind: 'network', detail: 'تعذّر الوصول إلى الدالة: ' + String((e && e.message) || e) };
  }

  const data  = res && res.data;
  const error = res && res.error;
  if (error) {
    const info = await notifFnErrorDetail(error);
    return { ok: false, kind: info.kind, detail: info.detail, status: info.status, raw: info.raw };
  }
  return { ok: true, data: data || null };
}

// ══════════════════════════════════════════════════════════════
// بناء العرض — نظام مكوّنات اللوحة فقط (note / tag / kvs)
// ══════════════════════════════════════════════════════════════
function notifKvs(items) {
  const rows = (items || []).filter(Boolean)
    .map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${v}</b></div>`).join('');
  return rows ? `<div class="kvs">${rows}</div>` : '';
}

function notifTag(state, text) {
  const ic = state === 'good' ? '✅' : state === 'warn' ? '⚠️' : state === 'bad' ? '⛔' : 'ℹ️';
  return `<span class="tag" data-state="${esc(state)}">${ic} ${esc(text)}</span>`;
}

function notifNote(state, icon, html) {
  return `<div class="note" data-state="${esc(state)}" style="margin-top:10px"><span class="ic">${esc(icon)}</span><div>${html}</div></div>`;
}

// نصّ متعدّد الأسطر داخل note: نهرب ثم نحوّل السطر الجديد إلى <br>
function notifMultiline(text) {
  return esc(text).replace(/\n/g, '<br>');
}

function notifFmtVal(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch (_) { return String(v); } }
  return String(v);
}

// شرح إعادة الإذن المرفوض — الرفض في كروم لا يُسأل عنه مرة أخرى أبداً.
function notifDeniedHelp() {
  return notifNote('bad', '⛔',
    '<strong>إذن الإشعارات مرفوض لهذا الموقع.</strong> المتصفح لن يسألك مرة أخرى، '
  + 'والزر أعلاه لن يفعل شيئاً حتى تُعيد الإذن يدوياً:'
  + '<ul style="margin:6px 0 0;padding-inline-start:18px;line-height:1.9">'
  + '<li>اضغط أيقونة القفل 🔒 (أو ⚙️) يسار شريط العنوان.</li>'
  + '<li>اختر «إعدادات الموقع» / <span dir="ltr">Site settings</span>.</li>'
  + '<li>غيّر «الإشعارات» / <span dir="ltr">Notifications</span> من «حظر» إلى «سؤال» أو «سماح».</li>'
  + '<li>حدّث الصفحة ثم فعّل المفتاح من جديد.</li>'
  + '</ul>');
}

// لوحة البيئة: ما الذي يمنع التفعيل قبل أن يحاول المالك أصلاً.
function notifRenderEnv() {
  const el = document.getElementById('notif-env');
  if (!el) return;
  const env  = notifEnv();
  const out  = [];

  if (!notifState.user) {
    out.push(notifNote('bad', '🔒', 'انتهت الجلسة أو لم تسجّل الدخول — لا يمكن قراءة إعدادات التنبيهات ولا حفظها. سجّل الدخول ثم حدّث الصفحة.'));
  }
  if (!env.supported) {
    const miss = [
      !env.hasNotif ? 'Notification' : '',
      !env.hasSW    ? 'Service Worker' : '',
      !env.hasPush  ? 'Push API' : '',
    ].filter(Boolean).join('، ');
    out.push(notifNote('warn', '🚫',
      `هذا المتصفح لا يدعم إشعارات الويب (الناقص: <span dir="ltr">${esc(miss)}</span>). `
    + 'يحدث هذا في سفاري القديم وفي نافذة التصفّح الخاص. '
    + '<strong>خيار إشعارات المتصفح مخفيّ هنا</strong> — والبريد يبقى متاحاً ويصلك كالمعتاد.'));
  } else if (!env.secure) {
    out.push(notifNote('warn', '🔓',
      `الصفحة مفتوحة على <span dir="ltr">${esc(env.protocol)}</span> لا <span dir="ltr">https:</span>. `
    + 'إشعارات Push لا تعمل إلا في سياق آمن (https، أو localhost أثناء التطوير). '
    + '<strong>افتح الموقع على https ثم أعد المحاولة</strong> — والبريد يعمل في الحالتين.'));
  }

  if (notifState.prefsMissing || notifState.subsMissing) {
    const t = [
      notifState.prefsMissing ? NOTIF_PREFS_TBL : '',
      notifState.subsMissing  ? NOTIF_SUBS_TBL  : '',
    ].filter(Boolean).map(x => `<code dir="ltr">${esc(x)}</code>`).join(' و');
    out.push(notifNote('warn', '🗄️',
      `<strong>جداول التنبيهات غير موجودة في القاعدة بعد:</strong> ${t}. `
    + 'هذه ليست عطلاً — الترحيل (migration) لم يُشغَّل. '
    + 'شغّل ترحيل الإشعارات على Supabase ثم حدّث هذه الصفحة، وبعدها يعمل الحفظ والتسجيل.'));
  }
  if (notifState.loadError) {
    out.push(notifNote('bad', '⚠️', `تعذّرت قراءة إعدادات التنبيهات: ${notifMultiline(notifState.loadError)}`));
  }

  el.innerHTML = out.join('');
}

// لوحة الحالة: الإذن، هذا الجهاز، عدد الأجهزة، وزر إلغاء اشتراك الجهاز.
function notifRenderStatus() {
  const el = document.getElementById('notif-status');
  if (!el) return;

  const env  = notifEnv();
  const perm = notifPermission();

  if (!env.supported || !env.secure) { el.innerHTML = ''; return; }

  const permState = NOTIF_PERM_STATE[perm] || 'warn';
  const devState  = notifState.thisDeviceSubscribed ? 'good' : 'warn';

  const kvs = notifKvs([
    ['إذن الإشعارات في هذا المتصفح', notifTag(permState, NOTIF_PERM_LABEL[perm] || perm)],
    ['هذا الجهاز', notifTag(devState, notifState.thisDeviceSubscribed ? 'مشترك' : 'غير مشترك')],
    ['عدد الأجهزة المشتركة', notifState.subsMissing
      ? notifTag('warn', 'الجدول غير موجود')
      : `<span style="font-variant-numeric:tabular-nums">${esc(String(notifState.deviceCount))}</span>`],
  ]);

  let extra = '';
  if (perm === 'denied') extra += notifDeniedHelp();

  if (notifState.thisDeviceSubscribed) {
    extra += `<div class="mt-4"><button class="btn btn-secondary btn-sm" id="notif-btn-unsub" onclick="notifUnsubClick()">`
           + `🚫 إلغاء اشتراك هذا الجهاز</button></div>`;
    if (notifState.deviceCount > 1) {
      extra += notifNote('', 'ℹ️',
        `الإلغاء يخصّ <strong>هذا الجهاز فقط</strong> — تبقى ${esc(String(notifState.deviceCount - 1))} من الأجهزة الأخرى مشتركة وتصلها الإشعارات.`);
    }
  }

  el.innerHTML = kvs + extra;
}

// مزامنة المفاتيح والحقول مع الحالة (بلا إطلاق onchange).
function notifRenderControls() {
  const env = notifEnv();

  const emailInput = document.getElementById('notif-email');
  if (emailInput) emailInput.value = notifState.email || '';

  const emailTgl = document.getElementById('notif-email-toggle');
  if (emailTgl) {
    emailTgl.checked  = !!notifState.emailEnabled;
    emailTgl.disabled = !notifState.user;
  }

  // عدم الدعم أو http ⇒ يُخفى الخيار كلّه بدل زرّ لا يفعل شيئاً (الشرح في notif-env).
  const pushRow = document.getElementById('notif-push-row');
  if (pushRow) pushRow.style.display = (env.supported && env.secure) ? '' : 'none';

  const pushTgl = document.getElementById('notif-push-toggle');
  if (pushTgl) {
    pushTgl.checked  = !!(notifState.pushEnabled && notifState.thisDeviceSubscribed);
    pushTgl.disabled = !notifState.user || notifState.busy;
  }

  const testPush = document.getElementById('notif-test-push');
  if (testPush) testPush.style.display = (env.supported && env.secure) ? '' : 'none';
}

function notifRender() {
  notifRenderEnv();
  notifRenderControls();
  notifRenderStatus();
}

// ══════════════════════════════════════════════════════════════
// معالِجات الواجهة
// ══════════════════════════════════════════════════════════════
async function notifSaveEmail() {
  const input = document.getElementById('notif-email');
  const raw   = input ? String(input.value || '').trim() : '';
  if (!raw) { setStatus('notif-status-line', 'error', '⛔ أدخل بريداً إلكترونياً أولاً.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    setStatus('notif-status-line', 'error', '⛔ صيغة البريد غير صحيحة.');
    return;
  }
  const res = await notifSavePrefs({ email: raw });
  if (res.missing) { notifRender(); setStatus('notif-status-line', 'warning', `⚠️ جدول ${NOTIF_PREFS_TBL} غير موجود — شغّل الترحيل أولاً.`); return; }
  if (!res.ok)     { setStatus('notif-status-line', 'error', '⛔ تعذّر الحفظ: ' + (res.error || 'خطأ غير معروف')); return; }
  setStatus('notif-status-line', 'success', `✅ حُفظ بريد التنبيهات: ${raw}`);
  notifRender();
}

async function notifEmailToggle(el) {
  const on = !!(el && el.checked);
  // البريد المستخدم: ما في الحقل إن وُجد، وإلا بريد الحساب.
  const input = document.getElementById('notif-email');
  const email = (input && String(input.value || '').trim()) || notifState.email || '';
  if (on && !email) {
    if (el) el.checked = false;
    setStatus('notif-status-line', 'error', '⛔ أدخل بريداً إلكترونياً قبل تفعيل تنبيهات البريد.');
    return;
  }
  const res = await notifSavePrefs({ email, email_enabled: on });
  if (res.missing) { if (el) el.checked = false; notifRender(); setStatus('notif-status-line', 'warning', `⚠️ جدول ${NOTIF_PREFS_TBL} غير موجود — شغّل الترحيل أولاً.`); return; }
  if (!res.ok)     { if (el) el.checked = !on; setStatus('notif-status-line', 'error', '⛔ تعذّر الحفظ: ' + (res.error || 'خطأ غير معروف')); return; }
  setStatus('notif-status-line', 'success', on ? `✅ تنبيهات البريد مفعّلة على ${email}` : 'تنبيهات البريد موقوفة.');
  notifRender();
}

async function notifPushToggle(el) {
  const want = !!(el && el.checked);
  if (notifState.busy) { if (el) el.checked = !want; return; }
  notifState.busy = true;
  notifRenderControls();

  try {
    if (want) {
      setStatus('notif-status-line', 'info', '⏳ جارٍ طلب الإذن وتسجيل هذا الجهاز…');
      const res = await notifSubscribeThisDevice();
      if (!res.ok) {
        if (el) el.checked = false;
        if (res.missing) setStatus('notif-status-line', 'warning', `⚠️ جدول ${NOTIF_SUBS_TBL} غير موجود — شغّل الترحيل ثم أعد المحاولة.`);
        else             setStatus('notif-status-line', 'error', '⛔ ' + (res.error || 'تعذّر التفعيل.'));
        await notifRefresh();
        return;
      }
      await notifSavePrefs({ push_enabled: true });
      setStatus('notif-status-line', 'success', '✅ سُجّل هذا الجهاز — ستصلك إشعارات المتصفح عند دخول سهم منطقة التخفيف أو التصفية.');
    } else {
      setStatus('notif-status-line', 'info', '⏳ جارٍ إلغاء اشتراك هذا الجهاز…');
      const res = await notifUnsubscribeThisDevice();
      if (!res.ok) {
        if (el) el.checked = true;
        setStatus('notif-status-line', 'error', '⛔ ' + (res.error || 'تعذّر الإلغاء.'));
        await notifRefresh();
        return;
      }
      // آخر جهاز ⇒ يُطفأ العلم كلّه؛ وإلا يبقى مفعّلاً لبقية الأجهزة.
      const subs = await notifLoadSubs(notifState.user ? notifState.user.id : '');
      const left = (subs && subs.rows) ? subs.rows.length : 0;
      if (left === 0) await notifSavePrefs({ push_enabled: false });
      setStatus('notif-status-line', 'success', left === 0
        ? 'أُلغي اشتراك هذا الجهاز، ولا أجهزة أخرى مشتركة.'
        : `أُلغي اشتراك هذا الجهاز — تبقى ${left} من الأجهزة مشتركة.`);
    }
  } finally {
    notifState.busy = false;
    await notifRefresh();
  }
}

async function notifUnsubClick() {
  const tgl = document.getElementById('notif-push-toggle');
  if (tgl) tgl.checked = false;
  await notifPushToggle({ checked: false });
}

// ══════════════════════════════════════════════════════════════
// زرّا الاختبار
// ══════════════════════════════════════════════════════════════
function notifRenderTestResult(channel, res, preface) {
  const chName = channel === 'push' ? 'إشعار المتصفح' : 'إشعار البريد';
  let html = preface || '';

  if (!res.ok) {
    const stateIcon = { 'not-deployed': '📦', auth: '🔒', network: '🌐', client: '🧩' }[res.kind] || '⛔';
    html += notifNote('bad', stateIcon,
      `<strong>فشل اختبار ${esc(chName)}.</strong><br>${notifMultiline(res.detail || 'خطأ غير معروف')}`
      + (res.status ? `<br><span class="small">رمز HTTP: <span dir="ltr">${esc(String(res.status))}</span></span>` : '')
      + (res.raw && res.raw !== res.detail ? `<br><span class="small" dir="ltr" style="opacity:.8">${notifMultiline(res.raw)}</span>` : ''));
    setReport('notif-test-report', html);
    return;
  }

  // ⚠️ لا نفترض شكلاً واحداً للردّ. العقد المُعلن هو { sent, errors }، لكن
  // الدالة المنشورة تُرجع تفصيلاً أوسع (attempted / email / push / note).
  // نعرض **ما وصل فعلاً**: لو غاب `sent` نبني الجدول من بقية الحقول بدل
  // أن نُعلن «لم تُرسل شيئاً» ونحن لم نفهم الردّ — وذلك أسوأ من لا شيء.
  const d    = res.data || {};
  const errs = Array.isArray(d.errors) ? d.errors : [];
  const SKIP = new Set(['errors', 'note', 'mode', 'ok']);

  const rows = (d.sent && typeof d.sent === 'object')
    ? Object.keys(d.sent).map(k => [k, esc(notifFmtVal(d.sent[k]))])
    : Object.keys(d).filter(k => !SKIP.has(k)).map(k => [k, esc(notifFmtVal(d[k]))]);

  const declaredOk = (typeof d.ok === 'boolean') ? d.ok : null;
  const attempted  = (typeof d.attempted === 'boolean') ? d.attempted : null;
  const good = (declaredOk === null) ? (rows.length > 0 && errs.length === 0) : declaredOk;

  // الحقائق تُجمَع ولا يحجب بعضها بعضاً: «لم ينجح» و«لم يحاول أصلاً»
  // معلومتان مختلفتان، والثانية هي التي تقول للمالك ما الذي يصلحه.
  let verdict = '';
  if (declaredOk === false) verdict += ' وأعلنت أن الإرسال <strong>لم ينجح</strong>.';
  else if (good)            verdict += ' وأعلنت نجاح الإرسال.';
  if (attempted === false)  verdict += ' و<strong>لم تحاول الإرسال أصلاً</strong> — لا قناة مفعّلة على الخادم.';
  if (rows.length === 0)    verdict += ' لم تُرجع الدالة أي قناة أُرسلت — <strong>لم ترسل شيئاً فعلياً</strong>.';

  html += notifNote(good && !errs.length ? 'good' : (errs.length || !good) ? 'bad' : 'warn',
    good && !errs.length ? '✅' : '⚠️',
    `<strong>استجابت الدالة «${esc(NOTIF_FN)}» لاختبار ${esc(chName)}.</strong>${verdict}`);

  if (rows.length) html += `<div style="margin-top:10px">${notifKvs(rows)}</div>`;

  if (d.note) html += notifNote('warn', 'ℹ️', notifMultiline(notifFmtVal(d.note)));

  if (errs.length) {
    html += notifNote('bad', '⛔',
      '<strong>أخطاء أرجعتها الدالة:</strong>'
      + '<ul style="margin:6px 0 0;padding-inline-start:18px;line-height:1.9">'
      + errs.map(e => `<li>${notifMultiline(notifFmtVal(e))}</li>`).join('')
      + '</ul>');
  }

  if (channel === 'email') {
    html += notifNote('warn', '📥',
      'إن لم تجد الرسالة في الوارد فافحص <strong>البريد المهمَل (Spam/Junk)</strong> — '
    + 'أول رسالة من مُرسِل جديد تُصنَّف مهملة كثيراً. علّمها «ليست مهملة» مرة واحدة فيصل ما بعدها للوارد.');
  }

  setReport('notif-test-report', html);
}

async function notifTestPush() {
  setReport('notif-test-report', '');

  // فحص محلّي قبل إزعاج الخادم — العائق المحلّي يُشرح ولا يُترجم إلى «فشل الإرسال».
  const env  = notifEnv();
  const perm = notifPermission();
  const blockers = [];

  if (!env.supported) blockers.push('هذا المتصفح لا يدعم إشعارات الويب.');
  else if (!env.secure) blockers.push(`الصفحة على <span dir="ltr">${esc(env.protocol)}</span> لا https — Push لا يعمل في سياق غير آمن.`);
  if (perm === 'denied')  blockers.push('إذن الإشعارات <strong>مرفوض</strong> لهذا الموقع — أعِده من إعدادات الموقع.');
  if (perm === 'default') blockers.push('لم يُطلب إذن الإشعارات بعد — فعّل مفتاح «إشعارات المتصفح» أولاً.');
  if (!notifState.thisDeviceSubscribed) blockers.push('هذا الجهاز غير مسجَّل في <code dir="ltr">push_subscriptions</code> — فعّل المفتاح أولاً.');
  if (notifState.subsMissing) blockers.push(`جدول <code dir="ltr">${esc(NOTIF_SUBS_TBL)}</code> غير موجود — شغّل الترحيل أولاً.`);

  if (blockers.length) {
    setReport('notif-test-report', notifNote('bad', '⛔',
      '<strong>لن يصلك إشعار متصفح قبل معالجة هذا:</strong>'
      + `<ul style="margin:6px 0 0;padding-inline-start:18px;line-height:1.9">${blockers.map(b => `<li>${b}</li>`).join('')}</ul>`));
    setStatus('notif-status-line', 'error', '⛔ الاختبار لم يُرسَل — راجع التفاصيل تحت الأزرار.');
    return;
  }

  const btn = document.getElementById('notif-test-push');
  if (btn) btn.disabled = true;
  setStatus('notif-status-line', 'info', '⏳ جارٍ استدعاء الدالة السحابية لإرسال إشعار متصفح تجريبي…');
  try {
    const res = await notifInvoke('push');
    notifRenderTestResult('push', res, '');
    setStatus('notif-status-line', res.ok ? 'success' : 'error',
      res.ok ? 'استجابت الدالة — التفاصيل أدناه.' : '⛔ فشل الاستدعاء — التفاصيل أدناه.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function notifTestEmail() {
  setReport('notif-test-report', '');

  const input = document.getElementById('notif-email');
  const email = (input && String(input.value || '').trim()) || notifState.email || '';
  const pre   = [];

  if (notifState.prefsMissing)
    pre.push(`جدول <code dir="ltr">${esc(NOTIF_PREFS_TBL)}</code> غير موجود — الدالة لن تجد بريداً تُرسل إليه.`);
  if (!email)
    pre.push('لا يوجد بريد محفوظ — أدخل البريد واحفظه أولاً.');
  else if (email !== notifState.email)
    pre.push(`البريد في الحقل (<span dir="ltr">${esc(email)}</span>) لم يُحفظ بعد — الدالة تقرأ <strong>المحفوظ</strong> (<span dir="ltr">${esc(notifState.email || '—')}</span>). احفظ أولاً.`);

  if (pre.length) {
    setReport('notif-test-report', notifNote('bad', '⛔',
      '<strong>لن تصلك رسالة قبل معالجة هذا:</strong>'
      + `<ul style="margin:6px 0 0;padding-inline-start:18px;line-height:1.9">${pre.map(b => `<li>${b}</li>`).join('')}</ul>`));
    setStatus('notif-status-line', 'error', '⛔ الاختبار لم يُرسَل — راجع التفاصيل تحت الأزرار.');
    return;
  }

  const btn = document.getElementById('notif-test-email');
  if (btn) btn.disabled = true;
  setStatus('notif-status-line', 'info', '⏳ جارٍ استدعاء الدالة السحابية لإرسال رسالة تجريبية…');
  try {
    const res = await notifInvoke('email');
    const warn = notifState.emailEnabled ? '' :
      notifNote('warn', 'ℹ️', 'مفتاح «تنبيهات البريد» موقوف حالياً — الاختبار يُجرَّب القناة، لكن التنبيهات الحقيقية لن تُرسَل حتى تفعّله.');
    notifRenderTestResult('email', res, warn);
    setStatus('notif-status-line', res.ok ? 'success' : 'error',
      res.ok ? 'استجابت الدالة — التفاصيل أدناه.' : '⛔ فشل الاستدعاء — التفاصيل أدناه.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════
// التحميل والتحديث
// ══════════════════════════════════════════════════════════════
async function notifRefresh() {
  if (!notifState.user) { notifRender(); return; }
  const uid = notifState.user.id;

  const prefs = await notifLoadPrefs(uid);
  notifState.prefsMissing = !!prefs.missing;
  notifState.loadError    = prefs.error || '';
  if (prefs.row) {
    notifState.prefsRow     = prefs.row;
    notifState.email        = String(prefs.row.email || '') || notifState.email;
    notifState.emailEnabled = !!prefs.row.email_enabled;
    notifState.pushEnabled  = !!prefs.row.push_enabled;
  } else if (!prefs.missing && !prefs.error) {
    // لا صفّ بعد: نبدأ ببريد الحساب مقترَحاً — قابل للتغيير قبل الحفظ.
    notifState.prefsRow = null;
    if (!notifState.email) notifState.email = String((notifState.user && notifState.user.email) || '');
  }

  const subs = await notifLoadSubs(uid);
  notifState.subsMissing = !!subs.missing;
  if (subs.rows) {
    notifState.deviceCount = subs.rows.length;
    const sub = await notifCurrentSub();
    const ep  = sub ? notifSubPayload(sub).endpoint : '';
    notifState.thisEndpoint         = ep;
    notifState.thisDeviceSubscribed = !!ep && subs.rows.some(r => String(r.endpoint || '') === ep);
  } else {
    notifState.deviceCount = 0;
    notifState.thisDeviceSubscribed = false;
  }

  notifRender();
}

async function notifInit() {
  // القسم يعيش داخل بطاقة واحدة — غيابها يعني أننا لسنا في صفحة الإعدادات.
  if (typeof document === 'undefined' || !document.getElementById('notif-card')) return;

  try {
    const { data } = await supabaseClient.auth.getUser();
    notifState.user = (data && data.user) || null;
  } catch (_) {
    notifState.user = null;
  }
  if (notifState.user) notifState.email = String(notifState.user.email || '');

  await notifRefresh();
}

// ╚══ NOTIF-SECTION-END ══════════════════════════════════════════════════

notifInit();
