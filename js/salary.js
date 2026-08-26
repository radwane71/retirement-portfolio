// ─── Storage — Supabase (primary) + localStorage (cache/fallback) ─────────────
const STORE_KEY = 'salary_planner_v1';

// ══════════════════════════════════════════════════════════════════════
// جسر رموز التصميم — نسخة محلية من مولّدات js/dashboard.js
// هذه الصفحة لا تُحمّل dashboard.js، فنُسِخت الدوال كما هي حرفياً:
//   cssVar · seriesColor · stateColorOf · tint · chartTheme · chartTooltipStyle
//   cardHead · tagHtml · meterHtml · browHtml · noteHtml · kvsHtml
// المصدر الأصلي: js/dashboard.js (أعلى الملف). أي تعديل هناك يُنقل هنا يدوياً.
// قاعدة ملزمة: لا لون سداسي مكتوب يدوياً في هذا الملف — الرموز فقط.
// ══════════════════════════════════════════════════════════════════════
function cssVar(name) {
  // الثيم الفاتح يُعرَّف على body.light-mode لا على :root — نقرأ من body أولاً
  const host = document.body || document.documentElement;
  return getComputedStyle(host).getPropertyValue(name).trim();
}
// لون سلسلة بيانات بالترتيب الثابت (1..6) — لا تُدوَّر عشوائياً
function seriesColor(i) { return cssVar('--series-' + ((Math.abs(i | 0) % 6) + 1)); }
// لون حالة: good / warn / bad — محجوز للحالة فقط، ودائماً مع أيقونة ونص
function stateColorOf(state) {
  return cssVar(state === 'good' ? '--st-good' : state === 'warn' ? '--st-warn'
    : state === 'bad' ? '--st-bad' : '--text-2');
}
// شفافية على رمز تصميم: #rrggbb + قناة ألفا سِتّ‌عشرية (لا لون جديد يُخترع)
function tint(color, aa) {
  const c = String(color || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c + aa : c;
}
// ثيم Chart.js المشتق من رموز التصميم (يتحدّث مع الوضع الفاتح)
function chartTheme() {
  return {
    text:    cssVar('--text'),
    muted:   cssVar('--text-2'),
    surface: cssVar('--bg-2'),
    border:  cssVar('--border'),
    grid:    tint(cssVar('--border'), 'aa'),
    accent:  cssVar('--accent'),
    font:    'Tajawal',
  };
}
// إعدادات tooltip موحّدة
function chartTooltipStyle() {
  const t = chartTheme();
  return {
    backgroundColor: t.surface, titleColor: t.text, bodyColor: t.muted,
    borderColor: t.border, borderWidth: 1,
    titleFont: { family: t.font }, bodyFont: { family: t.font },
  };
}
// رأس بطاقة موحّد (.card-head)
function cardHead(title, sub, acts) {
  return `<div class="card-head"><span class="ttl">${title}` +
    (sub ? ` <span class="sub">${sub}</span>` : '') +
    `</span>` + (acts ? `<div class="acts">${acts}</div>` : '') + `</div>`;
}
// وسم حالة (.tag) — أيقونة + نص إلزاماً
function tagHtml(icon, text, state) {
  return `<span class="tag"${state ? ` data-state="${state}"` : ''}>${icon} ${text}</span>`;
}
// مقياس (.meter) — علامة الهدف اختيارية
function meterHtml({ label, valueTxt, pct, state = '', foot = '', markPct = null, fillColor = '' }) {
  const w = Math.max(0, Math.min(100, +pct || 0)).toFixed(1);
  return `<div class="meter"${state ? ` data-state="${state}"` : ''}>
      <div class="meter-head"><span class="k">${label}</span><span class="v">${valueTxt}</span></div>
      <div class="meter-wrap">
        <div class="meter-track"><div class="meter-fill" style="width:${w}%${fillColor ? `;background:${fillColor}` : ''}"></div></div>
        ${markPct != null ? `<div class="meter-mark" style="left:${Math.max(0, Math.min(100, markPct)).toFixed(1)}%"></div>` : ''}
      </div>
      ${foot ? `<div class="meter-foot">${foot}</div>` : ''}
    </div>`;
}
// صف وزن في قائمة (.brow)
function browHtml({ name, color, pct, valueTxt, diffTxt = '', diffState = '', barPct = null, title = '', sub = '' }) {
  const w = Math.max(0, Math.min(100, barPct == null ? pct : barPct)).toFixed(1);
  const dColor = diffState ? stateColorOf(diffState) : cssVar('--text-2');
  return `<div class="brow"${title ? ` title="${title}"` : ''}>
      <div class="br-k"><span class="dot" style="background:${color}"></span><span>${name}</span>${sub ? `<span class="small text-muted num">${sub}</span>` : ''}</div>
      <div class="br-track"><div class="br-fill" style="width:${w}%;background:${color}"></div></div>
      <div class="br-v">${valueTxt}${diffTxt ? `<span class="d" style="color:${dColor}">${diffTxt}</span>` : ''}</div>
    </div>`;
}
// ملاحظة داخل بطاقة (.note)
function noteHtml(icon, html, state = '') {
  return `<div class="note"${state ? ` data-state="${state}"` : ''}><span class="ic">${icon}</span><div>${html}</div></div>`;
}
// لوحة مفاتيح/قيم (.kvs) — items: [[label, value], …]
function kvsHtml(items) {
  return `<div class="kvs">${items.filter(Boolean)
    .map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
}

// ─── Category Types ────────────────────────────────────────────────────────────
// ثلاثة أنواع فقط — كل فئة تنتمي لأحدها.
// اللون هوية لا حالة ⇒ يُقرأ من سلاسل التصميم (--series-*) لا من قيم مكتوبة.
const CAT_TYPES = {
  expense: { label: 'مصاريف', icon: '💸', sIdx: 4, desc: 'ما يُصرف ويختفي' },
  savings: { label: 'ادخار',  icon: '💰', sIdx: 2, desc: 'يُحفظ كاحتياطي' },
  asset:   { label: 'أصول',   icon: '📈', sIdx: 1, desc: 'يتراكم ويكبر' },
};
const CAT_TYPE_ORDER = ['expense', 'savings', 'asset'];

function catTypeOf(c)    { return (c && c.type) || 'expense'; }
function catTypeMeta(id) { return CAT_TYPES[id] || CAT_TYPES.expense; }
function typeColor(id)   { return seriesColor(catTypeMeta(id).sIdx); }
// لون الفئة = لون سلسلة حسب ترتيبها الثابت في القائمة (لا لون مخزَّن يدوياً)
function catColor(catId) {
  const i = store.categories.findIndex(c => c.id === catId);
  return seriesColor(i < 0 ? 0 : i);
}

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'salary-summary': {
    title: '💵 توزيع الراتب',
    body: `
      <p>هذه الأداة تساعدك على توزيع دخلك الشهري بوعي بدل أن «يختفي» المال دون أثر. الأرقام الرئيسية:</p>
      <div class="info-math">
        • <strong>معدّل الادخار والاستثمار:</strong> (ادخار + أصول) ÷ إجمالي الدخل — الرقم الوحيد الذي يبني ثروتك.<br>
        • <strong>إجمالي الرواتب:</strong> مجموع كل ما أدخلته من دخل في الفترة المختارة.<br>
        • <strong>إجمالي المُوزَّع:</strong> مجموع ما خصّصته للفئات (مصاريف، ادخار، أصول).<br>
        • <strong>المتبقي غير الموزّع:</strong> = إجمالي الرواتب − إجمالي المُوزَّع. الأفضل أن يقترب من الصفر (كل ريال له وجهة).
      </div>
      <div class="info-formula">قاعدة إرشادية شائعة (50/30/20): ~50% احتياجات · ~30% رغبات · ~20% ادخار/استثمار. عدّلها حسب وضعك.</div>
      <p>كل فئة لها <strong>نوع</strong>: مصاريف (تُصرف وتختفي) · ادخار (احتياطي سائل) · أصول (تتراكم وتنمو كاستثمار). النوع هو ما يحدّد المؤشر — تأكّد أن كل فئة مصنّفة صحيحاً من «إدارة الفئات».</p>
      <p class="info-note">💡 ارفع نسبة «الأصول» تدريجياً — هي وحدها التي تبني ثروتك على المدى الطويل، عكس المصاريف.</p>`
  },
};

// ترقية تلقائية للفئات القديمة التي ليس لها نوع بعد
const KNOWN_TYPE_MAP = {
  'cat_expenses':   'expense',
  'cat_savings':    'savings',
  'cat_assets':     'asset',
  'cat_retirement': 'asset',   // محفظة التقاعد = أصل ✅
};

// تخمين ذكي لنوع الفئة من اسمها (يُستخدم في الترقية وفي استيراد CSV)
function _guessCatType(name) {
  const n = name || '';
  if (/ادخار|طارئ|احتياط|مدخر/i.test(n))                        return 'savings';
  if (/أصول|استثمار|تقاعد|محفظ|عقار|صكوك|سهم|ذهب/i.test(n)) return 'asset';
  return 'expense';
}

function _migrateCategoryTypes() {
  let changed = false;
  store.categories.forEach(c => {
    if (c.type) return;   // مضبوط مسبقاً
    c.type = KNOWN_TYPE_MAP[c.id] || _guessCatType(c.name);
    changed = true;
  });
  if (changed) saveStore(store);
}

function getStore() {
  // قراءة من cache المحلي — يُحدَّث عند init() من Supabase
  try {
    const scopedKey = userLsKey(STORE_KEY);
    let raw = localStorage.getItem(scopedKey);
    if (raw == null && scopedKey !== STORE_KEY) {
      // ترحيل لمرة واحدة من المفتاح القديم غير المعنون بالمستخدم
      raw = localStorage.getItem(STORE_KEY);
      if (raw != null) {
        try {
          JSON.parse(raw); // تأكد أنه صالح قبل الترحيل
          localStorage.setItem(scopedKey, raw);
          localStorage.removeItem(STORE_KEY);
        } catch {}
      }
    }
    return JSON.parse(raw) || defaultStore();
  } catch { return defaultStore(); }
}

function saveStore(data) {
  store = data;
  // حفظ فوري في localStorage
  try { localStorage.setItem(userLsKey(STORE_KEY), JSON.stringify(data)); } catch {}
  // حفظ غير متزامن في Supabase
  saveUserSetting(STORE_KEY, data).catch(() => {});
}

function defaultStore() {
  return {
    categories: [
      { id: 'cat_expenses',   name: 'مصاريف',        type: 'expense' },
      { id: 'cat_savings',    name: 'ادخار / طارئ',  type: 'savings' },
      { id: 'cat_assets',     name: 'أصول',          type: 'asset'   },
      { id: 'cat_retirement', name: 'محفظة التقاعد', type: 'asset'   },
    ],
    entries: []
  };
}

// ─── State ────────────────────────────────────────────────────────────────────
let store     = getStore();
let editingId = null;
let deletingId = null;

// date range filter
let filterFromYear = '', filterFromMonth = '';
let filterToYear   = '', filterToMonth   = '';

// chart instances
let chart1 = null, chart2 = null, chart3 = null, chart4 = null;

// chart modes
let c1Mode = 'stacked', c2Mode = 'donut', c3Mode = 'bars', c4Mode = 'bars';

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-salary');
  // تحميل من Supabase أولاً للتزامن بين الأجهزة، fallback للـ localStorage
  const remote = await loadUserSetting(STORE_KEY);
  if (remote) {
    store = remote;
    try { localStorage.setItem(userLsKey(STORE_KEY), JSON.stringify(remote)); } catch {}
  } else {
    store = getStore();
  }
  _migrateCategoryTypes();   // ترقية الفئات القديمة لتشمل حقل type
  buildYearSelects();
  renderAll();
}

function renderAll() {
  renderDashboard();
  renderCategoryBadges();
  renderCharts();
  renderTable();
}

// ─── Filtered entries (respects date range) ───────────────────────────────────
// AUDIT-FIX (2026-08): سنة بلا شهر كانت تُتجاهَل في الحساب بينما عنوان الفترة
// يقول «من 2025» — الرقم والعنوان يتناقضان. الآن: سنة وحدها = السنة كاملة
// (من = يناير، إلى = ديسمبر)، فيتطابق ما يُحسب مع ما يُكتب.
function rangeBounds() {
  const from = filterFromYear ? (+filterFromYear * 100 + (+filterFromMonth || 1))   : 0;
  const to   = filterToYear   ? (+filterToYear   * 100 + (+filterToMonth   || 12))  : 999999;
  return { from, to };
}

// ══════════════════════════════════════════════════════════════════════
// المخطَّط لا يدخل حساباً — والفصل عند بوابة واحدة
// ----------------------------------------------------------------------
// `status`: 'actual' (منفَّذ فعلي) | 'planned' (مخطَّط له).
// **الغياب = منفَّذ** — كل سجلّ سابق لهذه الإضافة يبقى كما كان بلا ترحيل.
//
// قرار المالك: «المخطَّط له ما يدخل في الحسابات، هذا شيء مستقبلي، ما يدخل
// نهائياً في الداشبورد ولا في الحسبة اللي فوق ولا في الثروة».
//
// لذلك: `getFiltered()` — البوابة التي تغذّي الإحصائيات والرسوم والملخّصات
// والتصدير — تُسقط المخطَّط. والجدول وحده يقرأ `getFilteredAll()` ليعرضه
// موسوماً. بوابةٌ واحدة أضمن من فلترة تُكرَّر في كل مستهلك ويُنسى أحدها.
// ══════════════════════════════════════════════════════════════════════
function isPlanned(e) { return (e && e.status) === 'planned'; }

// كل سجلات المدى — بما فيها المخطَّط. للجدول وسجلّ التغييرات فقط.
function getFilteredAll() {
  const { from, to } = rangeBounds();
  return store.entries.filter(e => {
    const ym = (+e.year || 0) * 100 + (+e.month || 0);
    return ym >= from && ym <= to;
  });
}

// المنفَّذ فعلياً وحده — كل رقم محسوب في هذه الصفحة يمرّ من هنا.
function getFiltered() {
  return getFilteredAll().filter(e => !isPlanned(e));
}

// ─── Year selects for date range ──────────────────────────────────────────────
function buildYearSelects() {
  const years = [...new Set(store.entries.map(e => e.year))].sort((a, b) => a - b);
  ['from-year', 'to-year'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">— سنة</option>' +
      years.map(y => `<option value="${y}" ${y == cur ? 'selected' : ''}>${y}</option>`).join('');
  });
  // AUDIT-FIX (2026-08): إن اختفت السنة المختارة (حذف/ريست) يُعاد ضبط الفلتر
  // من قيم القوائم الفعلية بدل بقاء فلتر شبح يخفي كل السجلات.
  syncFilterVars();
}

function syncFilterVars() {
  const val = id => document.getElementById(id)?.value || '';
  filterFromYear  = val('from-year');
  filterFromMonth = val('from-month');
  filterToYear    = val('to-year');
  filterToMonth   = val('to-month');
}

// ⚠️ تغيير الفترة يُفرِّغ التحديد: المالك حدّد **ما يراه**، فإبقاء أشهرٍ
// محدَّدة خارج الشاشة يجعل «حذف المحدَّد» يمسّ ما لا يظهر أمامه.
function applyDateRange() { selectedIds.clear(); syncFilterVars(); renderAll(); }

function clearDateRange() {
  ['from-year','from-month','to-year','to-month'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  selectedIds.clear();
  syncFilterVars();
  renderAll();
}

// ─── حساب مركزي واحد: مصدر الحقيقة لكل أرقام الصفحة ──────────────────────────
function computeSummary() {
  const entries     = getFiltered();
  const totalSalary = entries.reduce((s, e) => s + (+e.salary || 0), 0);

  const catTotals = {};
  store.categories.forEach(c => { catTotals[c.id] = 0; });
  entries.forEach(e => {
    (e.allocations || []).forEach(a => {
      catTotals[a.catId] = (catTotals[a.catId] || 0) + (+a.amount || 0);
    });
  });

  const totalAllocated = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const totalRemaining = totalSalary - totalAllocated;

  // مبالغ كل نوع — الفئات المصنّفة فقط
  const typeAmt = {};
  CAT_TYPE_ORDER.forEach(t => {
    typeAmt[t] = store.categories
      .filter(c => catTypeOf(c) === t)
      .reduce((s, c) => s + (catTotals[c.id] || 0), 0);
  });
  // مبالغ يتيمة: تخصيصات تشير لفئة محذوفة — تدخل «المُوزَّع» ولا نوع لها.
  const classified = CAT_TYPE_ORDER.reduce((s, t) => s + typeAmt[t], 0);
  const orphanAmt  = totalAllocated - classified;

  const investAmt   = typeAmt.savings + typeAmt.asset;
  const pct         = v => (totalSalary > 0 ? v / totalSalary * 100 : null);
  const zeroSalaryMonths = entries.filter(e => !(+e.salary > 0)).length;

  return {
    entries, totalSalary, catTotals, totalAllocated, totalRemaining,
    typeAmt, orphanAmt, investAmt,
    investRate:  pct(investAmt),
    expenseRate: pct(typeAmt.expense),
    avgSalary:   entries.length ? totalSalary / entries.length : 0,
    months: entries.length, zeroSalaryMonths, pct,
  };
}

// ─── ① الرقم القائد + الملخص ──────────────────────────────────────────────────
function renderDashboard() {
  const S = computeSummary();
  const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  // ── معدّل الادخار والاستثمار: الرقم الذي يبني الثروة ──
  // معيار 50/30/20: ≥20% صحّي · 10–20% مقبول · <10% ضعيف
  // ⚠️ معدّل الادخار محصور بين 0 و100% بحكم تعريفه: لا تدّخر من دخل الفترة
  // أكثر ممّا دخل فيها. تجاوزُه يعني تمويلاً من **خارج** دخل الفترة (مدخرات
  // سابقة أو دخل غير مسجَّل) — وهي حالة تستوجب تنبيهاً لا وسام صحّة.
  //
  // كان `r >= 20 ⇒ good` بلا سقف، فدخلٌ 1,000 وتخصيصٌ 3,000 يعطي **300%**
  // مع «✅ معدّل صحّي» — بينما الشاشة نفسها تعرض تحته «🔻 التوزيعات تتجاوز
  // الدخل بـ2,000». البطاقة كانت تناقض نفسها.
  const r     = S.investRate;
  const over  = r != null && r > 100;
  const state = r == null ? '' : over ? 'warn' : r >= 20 ? 'good' : r >= 10 ? 'warn' : 'bad';
  const tag   = r == null ? tagHtml('•', 'لا دخل مسجَّل في هذه الفترة', '')
              : over ? tagHtml('⚠️', 'يتجاوز 100% — مموَّل من خارج دخل الفترة', 'warn')
              : state === 'good' ? tagHtml('✅', 'معدّل صحّي', 'good')
              : state === 'warn' ? tagHtml('⚠️', 'مقبول — ارفعه إلى 20%', 'warn')
              : tagHtml('🔻', 'ضعيف — أقل من 10%', 'bad');

  const remState = S.totalSalary <= 0 ? ''
    : S.totalRemaining < 0 ? 'bad'
    : S.totalRemaining <= S.totalSalary * 0.02 ? 'good' : 'warn';
  const remNote = S.totalSalary <= 0
    ? noteHtml('ℹ️', 'أضف سجلاً شهرياً واحداً على الأقل ليبدأ الحساب.', '')
    : S.totalRemaining < 0
      ? noteHtml('🔻', `<b>التوزيعات تتجاوز الدخل بـ ${formatSAR(Math.abs(S.totalRemaining))}</b> — راجع مبالغ الفئات أو الدخل المسجَّل.`, 'bad')
      : S.totalRemaining <= S.totalSalary * 0.02
        ? noteHtml('✅', 'ممتاز — كل ريال تقريباً له وجهة محدّدة (محاسبة صفرية).', 'good')
        : noteHtml('⚠️', `<b>${formatSAR(S.totalRemaining)} غير موجّهة</b> (${formatNum(S.totalRemaining / S.totalSalary * 100, 1)}% من الدخل) — خصّصها لفئة حتى لا تتسرّب.`, 'warn');

  setHtml('salary-hero', `<div class="stack">
    <div class="sal-hero-row">
      <div>
        <div class="hero-num num" style="color:${r == null ? '' : stateColorOf(state)}">${r == null ? '—' : formatNum(r, 1) + '<span class="unit">%</span>'}</div>
        <div class="hero-cap">معدّل الادخار والاستثمار = (ادخار + أصول) ÷ إجمالي الدخل · ${esc(buildRangeLabel())}</div>
      </div>
      <div>${tag}</div>
    </div>
    ${meterHtml({
      label: 'من كل 100 ريال دخل',
      valueTxt: r == null ? '—' : `${formatNum(r, 0)} ريال للادخار والأصول`,
      pct: r || 0, state, markPct: 20,
      foot: r == null ? 'لا دخل مسجَّل — النسبة غير محسوبة (قسمة على صفر)'
        : over
          ? `الشريط مقصوص عند 100% والقيمة الفعلية ${formatNum(r, 0)}% — أي أن ما وزّعته `
            + `يتجاوز دخل الفترة، فمصدرُ الفارق خارجها (مدخرات سابقة أو دخل غير مسجَّل).`
          : `العلامة عند 20% (معيار 50/30/20) · مصاريف ${formatNum(S.expenseRate, 0)}% · ادخار+أصول ${formatNum(r, 0)}%`,
    })}
    ${kvsHtml([
      ['إجمالي الدخل', formatSAR(S.totalSalary)],
      ['إجمالي المُوزَّع', formatSAR(S.totalAllocated)],
      ['المتبقي غير الموجّه', formatSAR(S.totalRemaining, true)],
      ['عدد الأشهر', `${S.months} شهر`],
      ['متوسط الدخل الشهري', formatSAR(S.avgSalary)],
      ['ادخار + أصول', formatSAR(S.investAmt)],
    ])}
    ${remNote}
    ${S.zeroSalaryMonths ? noteHtml('⚠️', `<b>${S.zeroSalaryMonths} شهر بلا دخل مسجَّل</b> ضمن الفترة — النِّسب محسوبة على الدخل المسجَّل فقط، وقد تبدو مرتفعة.`, 'warn') : ''}
  </div>`);

  renderTypeSummary(S);
  renderCatBreakdown(S);
}

function renderTypeSummary(S) {
  const el = document.getElementById('type-summary');
  if (!el) return;
  el.innerHTML = CAT_TYPE_ORDER.map(typeId => {
    const t        = catTypeMeta(typeId);
    const typeCats = store.categories.filter(c => catTypeOf(c) === typeId);
    const amt      = S.typeAmt[typeId];
    const p        = S.pct(amt);
    const names    = typeCats.map(c => esc(c.name)).join(' · ') || 'لا فئات من هذا النوع';
    return `<div class="type-cell">${meterHtml({
      label: `${t.icon} ${t.label}`,
      valueTxt: (p == null ? '—' : formatNum(p, 1) + '%') + ` · ${formatSAR(amt)}`,
      pct: p || 0, fillColor: typeColor(typeId),
      foot: names,
    })}</div>`;
  }).join('');

  const orphanEl = document.getElementById('type-orphan-note');
  if (orphanEl) {
    // مبالغ لفئات محذوفة: تُحسب في «المُوزَّع» فلا تُهمَل، ويُعلَن عنها صراحة
    orphanEl.innerHTML = Math.abs(S.orphanAmt) > 0.005
      ? noteHtml('⚠️', `<b>${formatSAR(S.orphanAmt)}</b> موزّعة على فئات لم تعد موجودة — محسوبة ضمن «إجمالي المُوزَّع» لكنها بلا نوع، فلا تظهر في النِّسب الثلاث أعلاه.`, 'warn')
      : '';
  }
}

function renderCatBreakdown(S) {
  const bd = document.getElementById('cat-breakdown');
  if (!bd) return;
  if (!store.categories.length) {
    bd.innerHTML = noteHtml('📭', 'لا توجد فئات — أضف فئة من «إدارة الفئات» في أسفل الصفحة.', '');
    return;
  }
  bd.innerHTML = store.categories.map(c => {
    const amt = S.catTotals[c.id] || 0;
    const p   = S.pct(amt);
    const t   = catTypeMeta(catTypeOf(c));
    return browHtml({
      name: esc(c.name), sub: `${t.icon} ${t.label}`, color: catColor(c.id),
      pct: p || 0, valueTxt: formatSAR(amt),
      diffTxt: p == null ? '—' : formatNum(p, 1) + '%',
      title: `${c.name} — ${t.label} · النسبة من إجمالي الدخل`,
    });
  }).join('') + `<div class="meter-foot mt-2">النِّسب من <strong>إجمالي الدخل</strong> في الفترة (${formatSAR(S.totalSalary)})</div>`;
}

function buildRangeLabel() {
  const fy = filterFromYear, fm = filterFromMonth;
  const ty = filterToYear,   tm = filterToMonth;
  if (!fy && !ty) return 'الإجمالي الكلي';
  const fromStr = fy ? (fm ? `${MONTHS_AR[+fm-1]} ${fy}` : `يناير ${fy}`) : '';
  const toStr   = ty ? (tm ? `${MONTHS_AR[+tm-1]} ${ty}` : `ديسمبر ${ty}`) : '';
  if (fromStr && toStr) return `${fromStr} — ${toStr}`;
  if (fromStr) return `من ${fromStr}`;
  if (toStr)   return `حتى ${toStr}`;
  return 'الإجمالي الكلي';
}

// ─── Category Management ──────────────────────────────────────────────────────
function renderCategoryBadges() {
  const container = document.getElementById('cat-list');
  if (!container) return;
  container.innerHTML = store.categories.map(c => {
    const t = catTypeMeta(catTypeOf(c));
    return `<div class="cat-badge">
      <span class="dot" style="background:${catColor(c.id)}"></span>
      <span class="cat-badge-name" ondblclick="startRenameCategory('${c.id}', this)">${esc(c.name)}</span>
      <button class="cat-type-btn" onclick="cycleType('${c.id}')" title="النوع: ${t.label} — انقر للتغيير">
        <span class="dot" style="background:${typeColor(catTypeOf(c))}"></span>${t.icon} ${t.label}
      </button>
      <button class="cat-del-btn" onclick="confirmDeleteCategory('${c.id}')" title="حذف الفئة">×</button>
    </div>`;
  }).join('') || `<span class="small text-muted">لا فئات بعد — أضف واحدة بالأسفل</span>`;
}

// تبديل نوع الفئة دورياً: مصاريف ← ادخار ← أصول ← مصاريف
function cycleType(catId) {
  const cat = store.categories.find(c => c.id === catId);
  if (!cat) return;
  const cur  = CAT_TYPE_ORDER.indexOf(catTypeOf(cat));
  cat.type   = CAT_TYPE_ORDER[(cur + 1) % CAT_TYPE_ORDER.length];
  saveStore(store);
  renderCategoryBadges();
  renderDashboard();
}

function addCategory() {
  const inp    = document.getElementById('new-cat-name');
  const typSel = document.getElementById('new-cat-type');
  const name   = inp.value.trim();
  const type   = typSel?.value || 'expense';
  if (!name) { showToast('أدخل اسم الفئة', 'error'); return; }
  if (store.categories.some(c => c.name === name)) { showToast('الفئة موجودة مسبقاً', 'error'); return; }
  store.categories.push({ id: uid(), name, type });
  saveStore(store);
  inp.value = '';
  renderCategoryBadges();
  renderDashboard();
  renderCharts();
  renderTable();
}

function startRenameCategory(catId, el) {
  const cat = store.categories.find(c => c.id === catId);
  if (!cat) return;
  const inp = document.createElement('input');
  inp.value = cat.name;
  inp.className = 'cat-rename-input';
  el.replaceWith(inp);
  inp.focus(); inp.select();
  function commit() {
    const n = inp.value.trim();
    if (n && n !== cat.name) { cat.name = n; saveStore(store); renderDashboard(); renderCharts(); renderTable(); }
    renderCategoryBadges();
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') inp.blur();
    if (e.key === 'Escape') { inp.value = cat.name; inp.blur(); }
  });
}

async function confirmDeleteCategory(catId) {
  const cat = store.categories.find(c => c.id === catId);
  if (!cat) return;
  // AUDIT-FIX: confirmAsync تهرّب الرسالة داخلياً — تمرير الاسم الخام يمنع التهريب المزدوج
  if (!await confirmAsync(`⚠️ حذف فئة "${cat.name}"؟\nسيتم حذفها من جميع السجلات الشهرية.`)) return;
  store.categories = store.categories.filter(c => c.id !== catId);
  store.entries.forEach(e => {
    e.allocations = (e.allocations || []).filter(a => a.catId !== catId);
  });
  saveStore(store);
  renderCategoryBadges();
  renderDashboard();
  renderCharts();
  renderTable();
  showToast('تم حذف الفئة', 'success');
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function renderCharts() {
  renderChart1();
  renderChart2();
  renderChart3();
  renderChart4();
}

// ── helpers ──
// إظهار/إخفاء عبر السمة hidden بدل النمط السطري (القاعدة: لا أنماط سطرية غير محسوبة)
function showCanvas(wrapId, altId) {
  const w = document.getElementById(wrapId), a = document.getElementById(altId);
  if (w) w.hidden = false;
  if (a) a.hidden = true;
}
function showAlt(wrapId, altId, html) {
  const w = document.getElementById(wrapId), a = document.getElementById(altId);
  if (w) w.hidden = true;
  if (a) { a.hidden = false; a.innerHTML = html; }
}
function destroyChart(ref) { if (ref) { ref.destroy(); } return null; }
function emptyBox(msg) { return `<div class="empty-state"><div class="icon">📭</div><p>${msg}</p></div>`; }

// إعدادات Chart.js مشتقة من رموز التصميم (بديل chartDefaults المحلية القديمة)
function salaryChartOpts() {
  const th = chartTheme();
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: th.muted, font: { family: th.font, size: 11 }, usePointStyle: true, padding: 10 } },
      tooltip: chartTooltipStyle(),
    },
    scales: {
      x: { ticks: { color: th.muted, font: { family: th.font, size: 10 } }, grid: { color: th.grid } },
      y: { ticks: { color: th.muted, font: { family: th.font, size: 10 }, callback: v => formatNum(v, 0) }, grid: { color: th.grid } }
    }
  };
}

// sorted entries for charts
function sortedEntries() {
  return getFiltered().slice().sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
}

// ── Chart 1: Salary vs Allocations over time ──────────────────────────────────
function setChart1Mode(m) {
  c1Mode = m;
  ['stacked','line','table'].forEach(x =>
    document.getElementById('c1-' + x)?.classList.toggle('active', x === m));
  renderChart1();
}

function renderChart1() {
  chart1 = destroyChart(chart1);
  const entries = sortedEntries();

  if (c1Mode === 'table') {
    const rows = entries.map(e => {
      const salary    = +e.salary || 0;
      const allocated = (e.allocations||[]).reduce((s,a)=>s+(+a.amount||0),0);
      const rem       = salary - allocated;
      return `<tr>
        <td>${e.year}</td><td>${MONTHS_AR[(+e.month||1)-1]}</td>
        <td class="num">${formatSAR(salary)}</td>
        <td class="num">${formatSAR(allocated)}</td>
        <td class="num" style="color:${stateColorOf(rem<0?'bad':rem>0?'warn':'good')}">${formatSAR(rem, true)}</td>
      </tr>`;
    }).join('');
    showAlt('c1-canvas-wrap','c1-alt',
      `<div class="table-wrap"><table class="tbl-alt">
        <thead><tr><th>السنة</th><th>الشهر</th><th>الراتب</th><th>الموزّع</th><th>المتبقي</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">'+emptyBox('لا توجد بيانات')+'</td></tr>'}</tbody>
      </table></div>`);
    return;
  }

  if (!entries.length) { showAlt('c1-canvas-wrap','c1-alt', emptyBox('لا توجد بيانات في هذه الفترة')); return; }

  showCanvas('c1-canvas-wrap','c1-alt');
  const labels = entries.map(e => `${MONTHS_AR[(+e.month||1)-1].slice(0,3)} ${String(e.year).slice(2)}`);

  // one dataset per category + salary line
  const catDatasets = store.categories.map(c => {
    const color = catColor(c.id);
    return {
      label: c.name,
      data: entries.map(e => {
        const a = (e.allocations||[]).find(x => x.catId === c.id);
        return a ? +a.amount || 0 : 0;
      }),
      backgroundColor: tint(color, c1Mode === 'stacked' ? 'cc' : '99'),
      borderColor: color,
      borderWidth: c1Mode === 'line' ? 2 : 0,
      fill: c1Mode !== 'line',
      tension: 0.3,
      pointRadius: c1Mode === 'line' ? 3 : 0,
    };
  });

  const accent = cssVar('--accent');
  const salaryDs = {
    label: 'الراتب',
    data: entries.map(e => +e.salary || 0),
    backgroundColor: tint(accent, '33'),
    borderColor: accent,
    borderWidth: 2,
    borderDash: [4, 3],
    type: 'line',
    fill: false,
    tension: 0.3,
    pointRadius: 3,
    order: 0,
  };

  const ctx = document.getElementById('chart1')?.getContext('2d');
  if (!ctx) return;

  const opts = salaryChartOpts();
  if (c1Mode === 'stacked') {
    opts.scales.x.stacked = true;
    opts.scales.y.stacked = true;
  }
  opts.plugins.tooltip.callbacks = {
    label: c => ` ${c.dataset.label}: ${formatSAR(c.parsed.y ?? c.parsed)}`
  };

  chart1 = new Chart(ctx, {
    type: c1Mode === 'line' ? 'line' : 'bar',
    data: { labels, datasets: [...catDatasets, salaryDs] },
    options: opts
  });
}

// ── Chart 2: Category distribution ───────────────────────────────────────────
function setChart2Mode(m) {
  c2Mode = m;
  ['donut','bars','cards'].forEach(x =>
    document.getElementById('c2-' + x)?.classList.toggle('active', x === m));
  renderChart2();
}

function renderChart2() {
  chart2 = destroyChart(chart2);
  const S = computeSummary();

  const all = store.categories.map(c => ({
    name: c.name, color: catColor(c.id), amt: S.catTotals[c.id] || 0,
    type: catTypeOf(c),
  }));
  // الدائري لا يمثّل السالب — نُظهر الموجب ونُعلن عن السالب صراحةً بدل إخفائه
  const catData  = all.filter(d => d.amt > 0).sort((a, b) => b.amt - a.amt);
  const negData  = all.filter(d => d.amt < 0);
  const totalAmt = catData.reduce((s, d) => s + d.amt, 0);

  const noteEl = document.getElementById('c2-note');
  if (noteEl) {
    noteEl.innerHTML = negData.length
      ? noteHtml('⚠️', `مبالغ سالبة غير معروضة في هذا الرسم: ${negData.map(d => `${esc(d.name)} (${formatSAR(d.amt)})`).join(' · ')} — لكنها محسوبة في «إجمالي المُوزَّع».`, 'warn')
      : `<div class="meter-foot">النِّسب من إجمالي المُوزَّع الموجب (${formatSAR(totalAmt)})</div>`;
  }

  if (c2Mode === 'bars') {
    showAlt('c2-canvas-wrap','c2-alt', !catData.length ? emptyBox('لا توجد توزيعات') :
      `<div class="stack-2 mt-2">` + catData.map(d => browHtml({
        name: esc(d.name), sub: catTypeMeta(d.type).icon, color: d.color,
        pct: totalAmt > 0 ? d.amt / totalAmt * 100 : 0,
        valueTxt: formatSAR(d.amt),
        diffTxt: totalAmt > 0 ? formatNum(d.amt / totalAmt * 100, 1) + '%' : '—',
      })).join('') + `</div>`);
    return;
  }

  if (c2Mode === 'cards') {
    showAlt('c2-canvas-wrap','c2-alt', !catData.length ? emptyBox('لا توجد توزيعات') :
      `<div class="cards-alt-grid">` + catData.map(d => {
        const pct = totalAmt > 0 ? d.amt / totalAmt * 100 : 0;
        return `<div class="cards-alt-item" style="border-top-color:${d.color}">
          ${meterHtml({
            label: `${catTypeMeta(d.type).icon} ${esc(d.name)}`,
            valueTxt: formatNum(pct, 1) + '%',
            pct, fillColor: d.color, foot: formatSAR(d.amt),
          })}
        </div>`;
      }).join('') + `</div>`);
    return;
  }

  // donut
  if (!catData.length) { showAlt('c2-canvas-wrap','c2-alt', emptyBox('لا توجد توزيعات')); return; }
  showCanvas('c2-canvas-wrap','c2-alt');
  const ctx = document.getElementById('chart2')?.getContext('2d');
  if (!ctx) return;
  const th = chartTheme();
  chart2 = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: catData.map(d => d.name),
      datasets: [{ data: catData.map(d => d.amt), backgroundColor: catData.map(d => d.color), borderColor: th.surface, borderWidth: 2, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: {
        legend: { position: 'bottom', labels: { color: th.muted, font: { family: th.font, size: 11 }, padding: 10, usePointStyle: true } },
        tooltip: Object.assign(chartTooltipStyle(), {
          callbacks: { label: c => {
            const pct = totalAmt > 0 ? formatNum(c.parsed / totalAmt * 100, 1) : '0.0';
            return ` ${formatSAR(c.parsed)}  (${pct}%)`;
          } }
        })
      }
    }
  });
}

// ── Chart 3: Monthly remaining ────────────────────────────────────────────────
function setChart3Mode(m) {
  c3Mode = m;
  ['bars','line','table'].forEach(x =>
    document.getElementById('c3-' + x)?.classList.toggle('active', x === m));
  renderChart3();
}

function entryRemaining(e) {
  return (+e.salary || 0) - (e.allocations || []).reduce((s, a) => s + (+a.amount || 0), 0);
}

function renderChart3() {
  chart3 = destroyChart(chart3);
  const entries = sortedEntries();

  if (c3Mode === 'table') {
    const rows = entries.map(e => {
      const rem = entryRemaining(e);
      return `<tr><td>${e.year}</td><td>${MONTHS_AR[(+e.month||1)-1]}</td>
        <td class="num" style="color:${stateColorOf(rem<0?'bad':rem>0?'warn':'good')}">${formatSAR(rem, true)}</td></tr>`;
    }).join('');
    showAlt('c3-canvas-wrap','c3-alt',
      `<div class="table-wrap"><table class="tbl-alt">
        <thead><tr><th>السنة</th><th>الشهر</th><th>المتبقي</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3">'+emptyBox('لا توجد بيانات')+'</td></tr>'}</tbody>
      </table></div>`);
    return;
  }

  if (!entries.length) { showAlt('c3-canvas-wrap','c3-alt', emptyBox('لا توجد بيانات في هذه الفترة')); return; }

  showCanvas('c3-canvas-wrap','c3-alt');
  const labels  = entries.map(e => `${MONTHS_AR[(+e.month||1)-1].slice(0,3)} ${String(e.year).slice(2)}`);
  const remData = entries.map(entryRemaining);
  const cOver   = stateColorOf('warn');   // متبقٍ موجب = مال غير موجّه
  const cUnder  = stateColorOf('bad');    // متبقٍ سالب = تجاوز الدخل
  const ctx     = document.getElementById('chart3')?.getContext('2d');
  if (!ctx) return;

  const opts = salaryChartOpts();
  opts.plugins.legend.display = false;
  opts.plugins.tooltip.callbacks = {
    label: c => {
      const v = c.parsed.y ?? c.parsed;
      return ` ${v < 0 ? '🔻 تجاوز الدخل' : v > 0 ? '⚠️ غير موجّه' : '✅ صفر'}: ${formatSAR(v, true)}`;
    }
  };

  chart3 = new Chart(ctx, {
    type: c3Mode === 'line' ? 'line' : 'bar',
    data: {
      labels,
      datasets: [{
        label: 'المتبقي',
        data: remData,
        backgroundColor: c3Mode === 'line' ? tint(cOver, '33') : remData.map(v => tint(v >= 0 ? cOver : cUnder, 'cc')),
        borderColor:     c3Mode === 'line' ? cOver : remData.map(v => v >= 0 ? cOver : cUnder),
        borderWidth: c3Mode === 'line' ? 2 : 0,
        fill: c3Mode === 'line',
        tension: 0.3,
        pointRadius: c3Mode === 'line' ? 3 : 0,
        pointBackgroundColor: cOver,
      }]
    },
    options: opts
  });
}

// ── Chart 4: Annual comparison ────────────────────────────────────────────────
function setChart4Mode(m) {
  c4Mode = m;
  ['bars','cards','table'].forEach(x =>
    document.getElementById('c4-' + x)?.classList.toggle('active', x === m));
  renderChart4();
}

function renderChart4() {
  chart4 = destroyChart(chart4);
  const entries = getFiltered();

  // group by year
  const yearMap = {};
  entries.forEach(e => {
    if (!yearMap[e.year]) yearMap[e.year] = { salary: 0, allocated: 0 };
    yearMap[e.year].salary    += +e.salary || 0;
    yearMap[e.year].allocated += (e.allocations||[]).reduce((s,a)=>s+(+a.amount||0),0);
  });
  const years    = Object.keys(yearMap).sort();
  const salaries = years.map(y => yearMap[y].salary);
  const allocs   = years.map(y => yearMap[y].allocated);
  const rems     = years.map((y,i) => salaries[i] - allocs[i]);

  if (c4Mode === 'table') {
    const rows = years.map((y,i) => `<tr>
      <td>${y}</td>
      <td class="num">${formatSAR(salaries[i])}</td>
      <td class="num">${formatSAR(allocs[i])}</td>
      <td class="num" style="color:${stateColorOf(rems[i]<0?'bad':rems[i]>0?'warn':'good')}">${formatSAR(rems[i], true)}</td>
    </tr>`).join('');
    showAlt('c4-canvas-wrap','c4-alt',
      `<div class="table-wrap"><table class="tbl-alt">
        <thead><tr><th>السنة</th><th>الراتب</th><th>الموزّع</th><th>المتبقي</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">'+emptyBox('لا توجد بيانات')+'</td></tr>'}</tbody>
      </table></div>`);
    return;
  }

  if (c4Mode === 'cards') {
    const totalSalary = salaries.reduce((s,v)=>s+v,0);
    showAlt('c4-canvas-wrap','c4-alt', !years.length ? emptyBox('لا توجد بيانات') :
      `<div class="cards-alt-grid">` +
      years.map((y,i) => {
        const pct = totalSalary > 0 ? salaries[i] / totalSalary * 100 : 0;
        const rem = rems[i];
        return `<div class="cards-alt-item" style="border-top-color:${seriesColor(i)}">
          ${meterHtml({
            label: `📅 ${y}`,
            valueTxt: formatSAR(salaries[i]),
            pct, fillColor: seriesColor(i),
            foot: `${formatNum(pct,1)}% من دخل الفترة · متبقٍ ${formatSAR(rem, true)}`,
          })}
        </div>`;
      }).join('') + `</div>`);
    return;
  }

  // bars
  if (!years.length) { showAlt('c4-canvas-wrap','c4-alt', emptyBox('لا توجد بيانات')); return; }
  showCanvas('c4-canvas-wrap','c4-alt');
  const ctx  = document.getElementById('chart4')?.getContext('2d');
  if (!ctx) return;
  const opts = salaryChartOpts();
  opts.plugins.tooltip.callbacks = { label: c => ` ${c.dataset.label}: ${formatSAR(c.parsed.y)}` };

  const accent = cssVar('--accent');
  const cAlloc = seriesColor(1);
  chart4 = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [
        { label: 'الراتب',  data: salaries, backgroundColor: tint(accent, '99'), borderColor: accent, borderWidth: 1 },
        { label: 'الموزّع', data: allocs,   backgroundColor: tint(cAlloc, '99'), borderColor: cAlloc, borderWidth: 1 },
        { label: 'المتبقي', data: rems,
          backgroundColor: rems.map(v => tint(stateColorOf(v >= 0 ? 'warn' : 'bad'), '99')),
          borderColor:     rems.map(v => stateColorOf(v >= 0 ? 'warn' : 'bad')), borderWidth: 1 }
      ]
    },
    options: opts
  });
}

// ─── Table ────────────────────────────────────────────────────────────────────
function renderTable() {
  // ⚠️ الجدول وحده يقرأ **الكل** — كل حساب آخر يمرّ بـ`getFiltered()`.
  const entries = getFilteredAll()
    .slice().sort((a,b) => a.year!==b.year ? b.year-a.year : b.month-a.month);

  // اللون في رأس العمود يُحمَل على نقطة بجانب الاسم — لا على النص وحده
  const catCols = store.categories.map(c =>
    `<th><span class="dot" style="background:${catColor(c.id)}"></span> ${esc(c.name)}</th>`).join('');
  // خانة التحديد أول عمود ⇒ تظهر **يمين السنة** في التخطيط العربي
  const _allSel = entries.length > 0 && entries.every(e => selectedIds.has(e.id));
  document.getElementById('salary-thead').innerHTML = `<tr>
    <th class="sel-cell"><input type="checkbox" ${_allSel ? 'checked' : ''}
      onchange="toggleAllSel(this.checked)" title="تحديد كل الأشهر المعروضة"></th>
    <th>السنة</th><th>الشهر</th><th>الراتب</th>${catCols}<th>المتبقي</th><th>ملاحظات</th>
    <th>النوع</th><th>إجراءات</th>
  </tr>`;

  // شريط يُعلن ما هو **خارج** كل رقم في هذه الصفحة — لا يُبتلع بصمت
  const _plan = entries.filter(isPlanned);
  const _planBar = document.getElementById('planned-bar');
  if (_planBar) {
    const sum = _plan.reduce((s, e) => s + (+e.salary || 0), 0);
    _planBar.innerHTML = _plan.length
      ? noteHtml('📅',
          `<strong>${_plan.length} شهراً مخطَّطاً في هذه الفترة</strong> بمجموع دخلٍ `
        + `${formatSAR(sum)} — <strong>خارج كل الأرقام أعلاه</strong> وخارج لوحة التحكم `
        + `وصافي الثروة والتقرير. يظهر في الجدول وحده حتى تحوّله إلى «منفَّذ فعلي».`, 'info')
      : '';
  }

  if (!entries.length) {
    document.getElementById('salary-tbody').innerHTML =
      `<tr><td colspan="${store.categories.length + 8}">${emptyBox('لا توجد سجلات في هذه الفترة')}</td></tr>`;
    renderBulkBar();
    return;
  }

  document.getElementById('salary-tbody').innerHTML = entries.map(e => {
    const salary    = +e.salary || 0;
    const allocated = (e.allocations||[]).reduce((s,a)=>s+(+a.amount||0),0);
    const remaining = salary - allocated;
    const catCells  = store.categories.map(c => {
      const a = (e.allocations||[]).find(x => x.catId === c.id);
      const v = a ? +a.amount || 0 : 0;
      return `<td class="num">${v!==0?formatSAR(v):'<span class="text-dim">—</span>'}</td>`;
    }).join('');
    const planned = isPlanned(e);
    const nChg = (store.audit || []).filter(x => x.entryId === e.id).length;
    const sel = selectedIds.has(e.id);
    const rowCls = [planned ? 'row-planned' : '', sel ? 'row-selected' : ''].filter(Boolean).join(' ');
    return `<tr${rowCls ? ` class="${rowCls}"` : ''}>
      <td class="sel-cell"><input type="checkbox" ${sel ? 'checked' : ''}
        onchange="toggleRowSel('${e.id}', this.checked)"></td>
      <td>${e.year}</td>
      <td>${MONTHS_AR[(+e.month||1)-1]}</td>
      <td class="num">${formatSAR(salary)}</td>
      ${catCells}
      <td class="num" style="color:${stateColorOf(remaining<0?'bad':remaining>0?'warn':'good')}">${formatSAR(remaining, true)}</td>
      <td class="notes-cell">${e.notes && e.notes.trim() ? `<button class="notes-badge" data-note="${esc(e.notes)}" onclick="showNotePopup(this)" title="عرض الملاحظة">💬</button>` : ''}</td>
      <td><button class="badge-status ${planned ? 'planned' : 'actual'}"
            onclick="toggleStatus('${e.id}')"
            title="${planned ? 'مخطَّط له — خارج كل الحسابات. اضغط لتحويله إلى منفَّذ فعلي.'
                             : 'منفَّذ فعلي — داخل كل الحسابات. اضغط لتحويله إلى مخطَّط.'}"
            style="border:0;cursor:pointer;font-family:inherit">
            ${planned ? '📅 مخطَّط' : '✅ منفَّذ'}</button></td>
      <td class="actions-cell">
        <button class="btn-icon" onclick="openEditModal('${e.id}')" title="تعديل">✏️</button>
        <button class="btn-icon" onclick="openChangeLog('${e.id}')"
          title="سجلّ التغييرات على هذا الشهر${nChg ? ` (${nChg})` : ' — لا تغييرات بعد'}"
          style="${nChg ? '' : 'opacity:.45'}">📜${nChg ? `<sup style="font-size:.6rem">${nChg}</sup>` : ''}</button>
        <button class="btn-icon danger" onclick="confirmDelete('${e.id}')" title="حذف">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  renderBulkBar();
}

// ══════════════════════════════════════════════════════════════════════
// التحديد الجماعي — حذفٌ وتعديلٌ لمجموعة أشهر دفعةً واحدة
// ----------------------------------------------------------------------
// طلب المالك: «أحدّد ٥ أو ١٠ أو ١٥ شهراً، وأضغط حذف على أيٍّ منها فيُحذف
// المحدَّد كله؛ وإن عدّلت، يُعدَّل الجروب كله».
//
// ثلاث قواعد تحكم التنفيذ:
//   ① التحديد يعيش خارج الجدول (`selectedIds`) فلا يضيع عند إعادة الرسم —
//     والصفحة تُعيد الرسم بعد كل تغيير.
//   ② زرّا الصفّ (✏️ و🗑️) يتحوّلان إلى «جماعي» **فقط** إذا كان الصفّ نفسه
//     ضمن تحديدٍ فيه أكثر من واحد. صفٌّ خارج التحديد يبقى فردياً — وإلا
//     حذف المالك عشرة أشهر وهو يقصد واحداً.
//   ③ السنة والشهر **لا يُعدَّلان جماعياً**: هما المفتاح الفريد لكل سجلّ،
//     وفرضهما على مجموعة يُنتج أشهراً مكرَّرة.
// وكل سجلّ يُسجَّل في سجلّ التغييرات منفرداً، فالحذف الجماعي يبقى قابلاً
// للمراجعة شهراً شهراً.
// ══════════════════════════════════════════════════════════════════════
let selectedIds = new Set();

function toggleRowSel(id, on) {
  if (on) selectedIds.add(id); else selectedIds.delete(id);
  renderTable();
}

function toggleAllSel(on) {
  const ids = getFilteredAll().map(e => e.id);
  if (on) ids.forEach(i => selectedIds.add(i));
  else    ids.forEach(i => selectedIds.delete(i));
  renderTable();
}

function clearSel() { selectedIds.clear(); renderTable(); }

// المحدَّد الموجود فعلاً (بعد حذف أو تغيير فترة)
function _selEntries() {
  return store.entries.filter(e => selectedIds.has(e.id));
}

function renderBulkBar() {
  const bar = document.getElementById('bulk-bar');
  if (!bar) return;
  const sel = _selEntries();
  if (!sel.length) { bar.innerHTML = ''; return; }

  const sum = sel.reduce((s, e) => s + (+e.salary || 0), 0);
  const nPlanned = sel.filter(isPlanned).length;
  bar.innerHTML = `
    <div class="bulk-bar">
      <span class="bb-count">✓ ${sel.length} شهراً محدَّداً</span>
      <span class="bb-sum">مجموع الدخل ${formatSAR(sum)}${nPlanned ? ` · منها ${nPlanned} مخطَّط` : ''}</span>
      <span class="bb-spacer"></span>
      <button class="btn btn-secondary btn-sm" onclick="openBulkEdit()">✏️ تعديل المحدَّد</button>
      <button class="btn btn-danger btn-sm"    onclick="confirmBulkDelete()">🗑️ حذف المحدَّد</button>
      <button class="btn btn-secondary btn-sm" onclick="clearSel()">إلغاء التحديد</button>
    </div>`;
}

// ─── حذف جماعي ───────────────────────────────────────────────────────
function _selLabels() {
  return _selEntries().slice()
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
    .map(e => `${MONTHS_AR[(+e.month || 1) - 1]} ${e.year}`);
}

function confirmBulkDelete() {
  const sel = _selEntries();
  if (!sel.length) return;
  const list  = _selLabels();
  const shown = list.slice(0, 12).join(' · ') + (list.length > 12 ? ` … و${list.length - 12} غيرها` : '');
  document.getElementById('bulk-delete-msg').textContent =
    `سيُحذف ${sel.length} سجلاً نهائياً:\n${shown}\n\nلا يمكن التراجع عن هذا الإجراء.`;
  document.getElementById('bulk-delete-modal').classList.add('open');
}

function closeBulkDelete() {
  document.getElementById('bulk-delete-modal').classList.remove('open');
}

function executeBulkDelete() {
  const sel = _selEntries();
  if (!sel.length) { closeBulkDelete(); return; }
  sel.forEach(e => logChange('delete', e, _auditSnapshot(e)));   // كلٌّ على حدة — يبقى قابلاً للمراجعة
  const ids = new Set(sel.map(e => e.id));
  store.entries = store.entries.filter(e => !ids.has(e.id));
  selectedIds.clear();
  saveStore(store);
  closeBulkDelete();
  buildYearSelects();
  renderAll();
  showToast(`🗑️ حُذف ${sel.length} سجلاً`, 'success');
}

// ─── تعديل جماعي ─────────────────────────────────────────────────────
function _bulkSync() {
  [['bulk-do-salary', 'bulk-salary'], ['bulk-do-status', 'bulk-status'],
   ['bulk-do-notes', 'bulk-notes']].forEach(([chk, fld]) => {
    const c = document.getElementById(chk), f = document.getElementById(fld);
    if (c && f) f.disabled = !c.checked;
  });
  document.querySelectorAll('#bulk-allocations .bulk-alloc-row').forEach(row => {
    const c = row.querySelector('input[type="checkbox"]');
    const f = row.querySelector('input[type="number"]');
    if (c && f) f.disabled = !c.checked;
  });
}

function openBulkEdit() {
  const sel = _selEntries();
  if (!sel.length) return;
  if (sel.length === 1) { openEditModal(sel[0].id); return; }   // واحدٌ فقط ⇒ النموذج العادي أدقّ

  const list = sel.slice()
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  const first = list[0], last = list[list.length - 1];
  const from = `${MONTHS_AR[(+first.month || 1) - 1]} ${first.year}`;
  const to   = `${MONTHS_AR[(+last.month  || 1) - 1]} ${last.year}`;

  document.getElementById('bulk-edit-title').textContent = `تعديل ${sel.length} سجلاً دفعةً واحدة`;
  document.getElementById('bulk-edit-scope').innerHTML =
      `<span class="ic">📝</span><div>سيُطبَّق على <b>${sel.length}</b> شهراً `
    + `(${esc(from)} ← ${esc(to)}). <b>الحقول غير المفعَّلة لا تُمسّ</b> — تبقى كما هي `
    + `في كل شهر. والسنة والشهر لا يُعدَّلان جماعياً لأنهما مفتاح كل سجلّ.</div>`;

  ['bulk-do-salary', 'bulk-do-status', 'bulk-do-notes'].forEach(id => {
    const c = document.getElementById(id); if (c) c.checked = false;
  });
  document.getElementById('bulk-salary').value = '';
  document.getElementById('bulk-notes').value  = '';
  document.getElementById('bulk-status').value = 'actual';

  // صفّ لكل فئة — مُعطَّل حتى يُفعَّل، فلا يُمسح تخصيصٌ بالخطأ
  document.getElementById('bulk-allocations').innerHTML = store.categories.map(c => `
    <div class="bulk-alloc-row">
      <input type="checkbox" onchange="_bulkSync()" title="فعّل لتغيير هذه الفئة">
      <span class="ba-name"><span class="dot" style="background:${catColor(c.id)}"></span> ${esc(c.name)}</span>
      <input type="number" step="0.01" data-cat="${esc(c.id)}" placeholder="0.00" disabled>
    </div>`).join('') || '<div class="text-muted small">لا فئات بعد</div>';

  _bulkSync();
  document.getElementById('bulk-edit-modal').classList.add('open');
}

function closeBulkEdit() {
  document.getElementById('bulk-edit-modal').classList.remove('open');
}

function saveBulkEdit() {
  const sel = _selEntries();
  if (!sel.length) { closeBulkEdit(); return; }

  const doSalary = document.getElementById('bulk-do-salary').checked;
  const doStatus = document.getElementById('bulk-do-status').checked;
  const doNotes  = document.getElementById('bulk-do-notes').checked;
  const salary   = parseFloat(document.getElementById('bulk-salary').value);
  const status   = document.getElementById('bulk-status').value === 'planned' ? 'planned' : 'actual';
  const notes    = document.getElementById('bulk-notes').value.trim();

  const allocChanges = [...document.querySelectorAll('#bulk-allocations .bulk-alloc-row')]
    .filter(r => r.querySelector('input[type="checkbox"]').checked)
    .map(r => {
      const f = r.querySelector('input[type="number"]');
      return { catId: f.dataset.cat, amount: parseFloat(f.value) || 0 };
    });

  if (!doSalary && !doStatus && !doNotes && !allocChanges.length) {
    showToast('لم تفعّل أي حقل — لا شيء ليُطبَّق', 'error'); return;
  }
  if (doSalary && !(salary >= 0)) {
    showToast('الراتب المُدخَل غير صالح', 'error'); return;
  }

  sel.forEach(e => {
    const before = _auditSnapshot(e);
    if (doSalary) e.salary = salary;
    if (doStatus) e.status = status;
    if (doNotes)  e.notes  = notes;
    if (allocChanges.length) {
      const arr = (e.allocations || []).slice();
      allocChanges.forEach(ch => {
        const i = arr.findIndex(a => a.catId === ch.catId);
        if (ch.amount === 0) { if (i !== -1) arr.splice(i, 1); }       // صفر = إزالة التخصيص
        else if (i === -1)   arr.push({ catId: ch.catId, amount: ch.amount });
        else                 arr[i] = { catId: ch.catId, amount: ch.amount };
      });
      e.allocations = arr;
    }
    logChange('edit', e, before);     // سجلٌّ منفصل لكل شهر
  });

  saveStore(store);
  closeBulkEdit();
  buildYearSelects();
  renderAll();
  showToast(`✅ طُبِّق التعديل على ${sel.length} شهراً`, 'success');
}

// تحويل الشهر بين مخطَّط ومنفَّذ بضغطة — وهو **تعديل** فيُسجَّل كغيره
function toggleStatus(id) {
  const e = store.entries.find(x => x.id === id);
  if (!e) return;
  const before = _auditSnapshot(e);
  e.status = isPlanned(e) ? 'actual' : 'planned';
  logChange('edit', e, before);
  saveStore(store);
  renderAll();
  showToast(isPlanned(e)
    ? `📅 ${MONTHS_AR[(+e.month||1)-1]} ${e.year} صار مخطَّطاً — خرج من كل الحسابات`
    : `✅ ${MONTHS_AR[(+e.month||1)-1]} ${e.year} صار منفَّذاً — دخل الحسابات`, 'success');
}

// ══════════════════════════════════════════════════════════════════════
// سجلّ التغييرات — لشهر واحد أو للصفحة كلها
// ══════════════════════════════════════════════════════════════════════
function _fmtWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function _renderLogRows(list) {
  if (!list.length) {
    return noteHtml('📭', 'لا تغييرات مسجَّلة. يبدأ السجلّ من أول إضافة أو تعديل بعد '
                        + 'تفعيل هذه الميزة — وما سبقها لا سجلّ له.', '');
  }
  const ACT = { add: ['a', '➕ إضافة'], edit: ['e', '✏️ تعديل'], delete: ['d', '🗑️ حذف'] };
  return list.slice().reverse().map(x => {
    const [cls, lbl] = ACT[x.action] || ['e', x.action];
    const when = `${MONTHS_AR[(+x.month || 1) - 1]} ${x.year || ''}`;
    let body = '';
    if (x.action === 'edit') {
      body = `<div class="chg-diff">${x.changes.map(c =>
        `• ${esc(c.field)}: <b>${esc(c.from)}</b> ← <b>${esc(c.to)}</b>`).join('<br>')}</div>`;
    } else if (x.action === 'delete' && x.snapshot) {
      const s = x.snapshot;
      body = `<div class="chg-diff">الراتب <b>${formatSAR(s.salary)}</b> · `
           + `${_STATUS_AR[s.status] || s.status}`
           + (s.notes ? ` · ملاحظة: ${esc(s.notes)}` : '') + `</div>`;
    }
    return `<div class="chg-row ${cls}">
      <div class="chg-when">${_fmtWhen(x.at)}</div>
      <div class="chg-what">${lbl} — <b>${esc(when)}</b></div>
      ${body}
    </div>`;
  }).join('');
}

function openChangeLog(entryId) {
  const all = store.audit || [];
  const list = entryId ? all.filter(x => x.entryId === entryId) : all;
  const e = entryId ? store.entries.find(x => x.id === entryId) : null;
  const title = e ? `📜 سجلّ ${MONTHS_AR[(+e.month || 1) - 1]} ${e.year}` : '📜 سجلّ كل التغييرات';
  const head = entryId
    ? ''
    : noteHtml('🕘', `آخر ${Math.min(all.length, SAL_AUDIT_MAX)} تغيير على هذه الصفحة، الأحدث أولاً. `
      + `السقف ${SAL_AUDIT_MAX} قيد ويسقط الأقدم أولاً.`, '');
  openInfoModal(title, head + _renderLogRows(list));
}

// ══════════════════════════════════════════════════════════════════════
// تخطيط دفعة — أشهرٌ مخطَّطة من تاريخ إلى تاريخ بضغطة
// ----------------------------------------------------------------------
// إدخال رواتب حتى 2055 شهراً بشهر = 348 فتحة مودال. الدفعة تولّدها مرة
// واحدة بقيمة ثابتة، ثم يُعدَّل ما يحتاج تعديلاً.
//
// **كلها `planned`** بحكم التعريف — لا خيار: شهرٌ في 2040 ليس منفَّذاً.
// **ولا تدهس شهراً موجوداً**: الموجود يُتخطّى ويُعلَن عدده، فلا يُمحى
// تاريخٌ فعليّ بتخطيطٍ مستقبلي.
// ══════════════════════════════════════════════════════════════════════
function openPlanBulk() {
  const now = new Date();
  const y0 = now.getFullYear(), m0 = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
  const yStart = now.getMonth() + 2 > 12 ? y0 + 1 : y0;
  const el = (id) => document.getElementById(id);
  el('plan-from-year').value  = yStart;
  el('plan-from-month').value = m0;
  el('plan-to-year').value    = Math.min(2100, yStart + 5);
  el('plan-to-month').value   = 12;
  el('plan-salary').value     = '';
  // الفئات: نفس نموذج التخصيص المستعمل في المودال العادي
  const box = el('plan-allocations');
  box.innerHTML = store.categories.length
    ? store.categories.map(c => `
      <div class="alloc-row">
        <label><span class="dot" style="background:${catColor(c.id)}"></span> ${esc(c.name)}</label>
        <input type="number" class="plan-alloc" data-cat="${c.id}" step="0.01" placeholder="0.00">
      </div>`).join('')
    : `<p class="text-muted small">لا فئات معرَّفة بعد — أضِف فئة أولاً لتوزّع عليها.</p>`;
  el('plan-preview').innerHTML = '';
  el('plan-modal').classList.add('open');
  updatePlanPreview();
}
function closePlanBulk() { document.getElementById('plan-modal').classList.remove('open'); }

function _planRange() {
  const v = (id) => parseInt(document.getElementById(id).value);
  const fy = v('plan-from-year'), fm = v('plan-from-month');
  const ty = v('plan-to-year'),   tm = v('plan-to-month');
  if (!fy || !fm || !ty || !tm) return null;
  const from = fy * 12 + (fm - 1), to = ty * 12 + (tm - 1);
  if (to < from) return { invalid: true };
  const months = [];
  for (let k = from; k <= to; k++) months.push({ year: Math.floor(k / 12), month: (k % 12) + 1 });
  return { months };
}

function updatePlanPreview() {
  const out = document.getElementById('plan-preview');
  if (!out) return;
  const r = _planRange();
  if (!r) { out.innerHTML = ''; return; }
  if (r.invalid) {
    out.innerHTML = noteHtml('↔️', 'تاريخ البداية بعد تاريخ النهاية — اقلبهما.', 'warn');
    return;
  }
  const exists = r.months.filter(m => store.entries.some(e => +e.year === m.year && +e.month === m.month));
  const nNew   = r.months.length - exists.length;
  const salary = parseFloat(document.getElementById('plan-salary').value) || 0;
  const alloc  = [...document.querySelectorAll('.plan-alloc')]
    .reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
  const rem    = salary - alloc;
  out.innerHTML = kvsHtml([
    ['أشهر ستُضاف', `${nNew} شهراً`],
    exists.length ? ['موجودة أصلاً (تُتخطّى)', `${exists.length} شهراً`] : null,
    salary > 0 ? ['إجمالي الدخل المخطَّط', formatSAR(salary * nNew)] : null,
    salary > 0 ? ['المتبقي غير الموجّه شهرياً',
      `<span style="color:${stateColorOf(rem < 0 ? 'bad' : rem > 0 ? 'warn' : 'good')}">${formatSAR(rem, true)}</span>`] : null,
  ]) + noteHtml('📅', 'كلها <strong>مخطَّطة</strong> — لا تدخل أي حساب حتى تحوّلها إلى «منفَّذ».', 'info');
}

function executePlanBulk() {
  const r = _planRange();
  if (!r || r.invalid) { showToast('راجِع نطاق التواريخ', 'error'); return; }
  const salary = parseFloat(document.getElementById('plan-salary').value);
  if (isNaN(salary)) { showToast('أدخِل الراتب المخطَّط', 'error'); return; }
  const allocations = [...document.querySelectorAll('.plan-alloc')]
    .map(i => ({ catId: i.dataset.cat, amount: parseFloat(i.value) || 0 }))
    .filter(a => a.amount !== 0);

  let added = 0, skipped = 0;
  r.months.forEach(m => {
    if (store.entries.some(e => +e.year === m.year && +e.month === m.month)) { skipped++; return; }
    const entry = { id: uid(), year: m.year, month: m.month, salary, notes: '',
                    allocations: allocations.map(a => ({ ...a })), status: 'planned' };
    store.entries.push(entry);
    logChange('add', entry, null);
    added++;
  });
  saveStore(store);
  closePlanBulk();
  buildYearSelects();
  renderAll();
  showToast(`📅 أُضيف ${added} شهراً مخطَّطاً`
    + (skipped ? ` · تُخطّي ${skipped} شهراً موجوداً` : '')
    + ' — لا تدخل الحسابات', 'success');
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  const today = new Date();
  document.getElementById('modal-title').textContent = 'إضافة سجل جديد';
  document.getElementById('entry-year').value   = today.getFullYear();
  document.getElementById('entry-month').value  = today.getMonth() + 1;
  document.getElementById('entry-salary').value = '';
  document.getElementById('entry-notes').value  = '';
  _setStatusSelect('actual');
  buildAllocationsForm([]);
  document.getElementById('entry-modal').classList.add('open');
  document.getElementById('entry-salary').focus();
}

function openEditModal(id) {
  // والمثل في التعديل: صفٌّ ضمن تحديدٍ متعدّد ⇒ تعديل جماعي للمجموعة كلها
  if (selectedIds.size > 1 && selectedIds.has(id)) { openBulkEdit(); return; }
  const entry = store.entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'تعديل سجل';
  document.getElementById('entry-year').value   = entry.year;
  document.getElementById('entry-month').value  = entry.month;
  document.getElementById('entry-salary').value = entry.salary;
  document.getElementById('entry-notes').value  = entry.notes || '';
  _setStatusSelect(entry.status === 'planned' ? 'planned' : 'actual');
  buildAllocationsForm(entry.allocations || []);
  document.getElementById('entry-modal').classList.add('open');
}

// الافتراضي عند الإضافة: شهرٌ **مستقبلي** يُقترَح مخطَّطاً، والماضي منفَّذاً.
// لا يُفرَض — يُقترَح، والمالك يغيّره. والتلميح يقول ما يعنيه الاختيار الآن.
function _setStatusSelect(v) {
  const sel = document.getElementById('entry-status');
  if (sel) sel.value = v;
  _updateStatusHint();
}
function _updateStatusHint() {
  const sel = document.getElementById('entry-status');
  const el  = document.getElementById('entry-status-hint');
  if (!el) return;
  el.innerHTML = (sel && sel.value === 'planned')
    ? '⚠️ <b>لا يدخل أي حساب</b> — لا الإحصائيات ولا الرسوم ولا التصدير ولا '
      + 'لوحة التحكم ولا صافي الثروة. يظهر في الجدول موسوماً حتى تحوّله إلى «منفَّذ».'
    : '✅ يدخل كل الحسابات في هذه الصفحة وما يقرؤها.';
}

function buildAllocationsForm(existing) {
  const container = document.getElementById('allocations-form');

  // جمّع الفئات حسب النوع مع عناوين فاصلة
  let html = '';
  CAT_TYPE_ORDER.forEach(typeId => {
    const typeCats = store.categories.filter(c => catTypeOf(c) === typeId);
    if (!typeCats.length) return;
    const t = catTypeMeta(typeId);
    html += `<div class="alloc-group-header">
      <span class="dot" style="background:${typeColor(typeId)}"></span>
      ${t.icon} ${t.label}
      <span class="alloc-group-desc">${t.desc}</span>
    </div>`;
    html += typeCats.map(c => {
      const a   = existing.find(x => x.catId === c.id);
      const val = a ? a.amount : '';
      return `<div class="alloc-row">
        <label class="alloc-label">
          <span class="dot" style="background:${catColor(c.id)}"></span>${esc(c.name)}
        </label>
        <input type="number" class="alloc-input num" data-cat="${c.id}"
          value="${val}" placeholder="0" min="0" step="0.01">
      </div>`;
    }).join('');
  });
  container.innerHTML = html || `<p class="small text-muted">لا توجد فئات — أضف فئة من «إدارة الفئات».</p>`;

  const salaryInp = document.getElementById('entry-salary');
  function updateRemaining() {
    const salary    = parseFloat(salaryInp.value) || 0;
    const allocated = [...container.querySelectorAll('.alloc-input')]
      .reduce((s, inp) => s + (parseFloat(inp.value) || 0), 0);
    const rem = salary - allocated;
    const el  = document.getElementById('modal-remaining');
    el.innerHTML = `<span class="k">المتبقي غير الموجّه</span>
      <b class="num" style="color:${stateColorOf(rem < 0 ? 'bad' : rem > 0 ? 'warn' : 'good')}">${formatSAR(rem, true)}</b>
      <span class="small text-muted">${rem < 0 ? '🔻 التوزيع تجاوز الدخل' : rem > 0 ? '⚠️ لم يُوجَّه بالكامل' : '✅ كل ريال موجَّه'}</span>`;
  }
  // AUDIT-FIX: oninput مباشر بدل addEventListener — يمنع تراكم المستمعين مع كل فتح للمودال
  salaryInp.oninput  = updateRemaining;
  container.oninput  = updateRemaining;
  updateRemaining();
}

function closeModal() {
  document.getElementById('entry-modal').classList.remove('open');
  editingId = null;
}

function saveEntry() {
  const year   = parseInt(document.getElementById('entry-year').value);
  const month  = parseInt(document.getElementById('entry-month').value);
  const salary = parseFloat(document.getElementById('entry-salary').value);
  const notes  = document.getElementById('entry-notes').value.trim();
  const status = document.getElementById('entry-status')?.value === 'planned' ? 'planned' : 'actual';

  if (!year || !month || isNaN(salary)) {
    showToast('يرجى إدخال السنة والشهر والراتب', 'error'); return;
  }
  const duplicate = store.entries.find(e => e.year===year && e.month===month && e.id!==editingId);
  if (duplicate) { showToast(`يوجد سجل لـ ${MONTHS_AR[month-1]} ${year} مسبقاً`, 'error'); return; }

  const allocations = [...document.querySelectorAll('.alloc-input')]
    .map(inp => ({ catId: inp.dataset.cat, amount: parseFloat(inp.value) || 0 }))
    .filter(a => a.amount !== 0);

  if (editingId) {
    const target = store.entries.find(e => e.id === editingId);
    const before = _auditSnapshot(target);                    // قبل التعديل
    Object.assign(target, { year, month, salary, notes, allocations, status });
    logChange('edit', target, before);
    showToast('تم تحديث السجل', 'success');
  } else {
    const entry = { id: uid(), year, month, salary, notes, allocations, status };
    store.entries.push(entry);
    logChange('add', entry, null);
    showToast(status === 'planned' ? 'أُضيف شهرٌ مخطَّط — لا يدخل الحسابات' : 'تم إضافة السجل',
      'success');
  }
  saveStore(store);
  closeModal();
  buildYearSelects();
  renderAll();
}

// ══════════════════════════════════════════════════════════════════════
// سجلّ التغييرات — كل تعديل على أي شهر، بتاريخه وبما تغيَّر فيه
// ----------------------------------------------------------------------
// طلب المالك: «زرّ جنب إجراءات، أي تعديل على أي شهر يبان — لستة كاملة
// بالتاريخ، إيش تغيّر وإيش ما تغيّر».
//
// يُسجَّل **الفرق** لا اللقطة كاملة: «الراتب 18,000 ← 19,500» أوضح من
// صفحتَي JSON متجاورتين. واللقطة تُحفظ كذلك للحذف — لأن المحذوف لا يبقى
// له مرجعٌ يُقارَن به.
//
// السجلّ داخل نفس المخزن (`store.audit`) فيُزامَن ويُنسَخ احتياطياً معه.
// وسقفه 2,000 قيد: نموٌّ بلا حدّ يُثقل التزامن، والأقدم يسقط أولاً.
// ══════════════════════════════════════════════════════════════════════
// ⚠️ لا تُسمِّه `AUDIT_MAX`: الاسم مأخوذ في `js/constitution-data.js` (سقف سجلّ
// تدقيق م.72)، والصفحة تحمّل الملفين معاً فيسقط السكربت كلّه بـ«already
// declared» — لا قسمٌ منه. الفحص أمسكها قبل الشاشة.
const SAL_AUDIT_MAX = 2000;

function _auditSnapshot(e) {
  if (!e) return null;
  return {
    year: +e.year || 0, month: +e.month || 0, salary: +e.salary || 0,
    notes: e.notes || '', status: e.status === 'planned' ? 'planned' : 'actual',
    allocations: (e.allocations || []).map(a => ({ catId: a.catId, amount: +a.amount || 0 })),
  };
}

const _AUDIT_LBL = { year: 'السنة', month: 'الشهر', salary: 'الراتب',
                     notes: 'الملاحظات', status: 'نوع الشهر' };
const _STATUS_AR = { planned: 'مخطَّط له', actual: 'منفَّذ فعلي' };

function _auditDiff(before, after) {
  const out = [];
  if (!before || !after) return out;
  ['year', 'month', 'salary', 'notes', 'status'].forEach(k => {
    if (String(before[k]) === String(after[k])) return;
    const fmtV = (v) => k === 'month' ? (MONTHS_AR[(+v || 1) - 1] || v)
                      : k === 'salary' ? formatSAR(+v || 0)
                      : k === 'status' ? (_STATUS_AR[v] || v)
                      : (String(v).trim() || '—');
    out.push({ field: _AUDIT_LBL[k], from: fmtV(before[k]), to: fmtV(after[k]) });
  });
  // الفئات: لكل فئة تغيّر مبلغها سطرٌ باسمها لا بمعرّفها
  const sum = (list) => { const m = {}; (list || []).forEach(a => {
    m[a.catId] = (m[a.catId] || 0) + (+a.amount || 0); }); return m; };
  const b = sum(before.allocations), a = sum(after.allocations);
  [...new Set([...Object.keys(b), ...Object.keys(a)])].forEach(id => {
    const bv = b[id] || 0, av = a[id] || 0;
    if (Math.abs(bv - av) < 0.005) return;
    const cat = store.categories.find(c => c.id === id);
    out.push({ field: cat ? cat.name : 'فئة محذوفة', from: formatSAR(bv), to: formatSAR(av) });
  });
  return out;
}

function logChange(action, entry, before) {
  if (!store.audit) store.audit = [];
  const after = _auditSnapshot(entry);
  const changes = action === 'edit' ? _auditDiff(before, after) : [];
  // تعديلٌ لم يغيّر شيئاً لا يُسجَّل — سجلٌّ مليء بلا شيء يُخفي ما فيه شيء
  if (action === 'edit' && !changes.length) return;
  store.audit.push({
    id: uid(), at: new Date().toISOString(), action,
    entryId: entry?.id || null,
    year: after?.year ?? before?.year ?? null,
    month: after?.month ?? before?.month ?? null,
    changes, snapshot: action === 'delete' ? before : null,
  });
  if (store.audit.length > SAL_AUDIT_MAX) store.audit = store.audit.slice(-SAL_AUDIT_MAX);
}

// ─── Delete Single ────────────────────────────────────────────────────────────
function confirmDelete(id) {
  // طلب المالك: «إذا كبست حذف في أي مكان من المحدَّدين، أقدر أحذف الجروب
  // كامل». الشرط: الصفّ نفسه **ضمن** التحديد وفيه أكثر من واحد — وإلا بقي
  // الحذف فردياً، فلا يمحو المالك عشرة أشهر وهو يقصد شهراً.
  if (selectedIds.size > 1 && selectedIds.has(id)) { confirmBulkDelete(); return; }
  const entry = store.entries.find(e => e.id === id);
  if (!entry) return;
  const monthName = MONTHS_AR[(+entry.month||1)-1];
  document.getElementById('delete-msg').textContent =
    `هل أنت متأكد من حذف سجل ${monthName} ${entry.year}؟\nلا يمكن التراجع عن هذا الإجراء.`;
  deletingId = id;
  document.getElementById('delete-modal').classList.add('open');
}
function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('open');
  deletingId = null;
}
function executeDelete() {
  if (!deletingId) return;
  const gone = store.entries.find(e => e.id === deletingId);
  if (gone) logChange('delete', gone, _auditSnapshot(gone));
  store.entries = store.entries.filter(e => e.id !== deletingId);
  saveStore(store);
  closeDeleteModal();
  buildYearSelects();
  renderAll();
  showToast('تم حذف السجل', 'success');
}

// ─── Reset All ────────────────────────────────────────────────────────────────
function openResetModal()  { document.getElementById('reset-modal').classList.add('open'); }
function closeResetModal() { document.getElementById('reset-modal').classList.remove('open'); }
function executeReset() {
  store.entries = [];
  saveStore(store);
  closeResetModal();
  buildYearSelects();
  renderAll();
  showToast('تم حذف جميع السجلات', 'success');
}

// ══════════════════════════════════════════════════════════════════════
// صيغة ملف الاستيراد — مكتوبة للمالك، لا مستنبَطة من الكود
// ----------------------------------------------------------------------
// المستورِد **مرن عمداً**: يبحث عن صفّ الترويسة أينما كان في الملف (لا
// يفترضه الأول)، ويطابق أسماء الأعمدة بالاحتواء لا بالتطابق التام، ويقبل
// أسماء الشهور بالعربي أو بالأرقام. لكن هذه المرونة لم تكن **مكتوبة** في
// أي مكان، فالمالك يجرّب ويخمّن. هنا تُكتب.
// ══════════════════════════════════════════════════════════════════════
function showImportFormat() {
  const cats = store.categories.length
    ? store.categories.map(c => c.name)
    : ['مصاريف', 'ادخار', 'أصول', 'محفظة تقاعد'];
  const sample = ['السنة', 'الشهر', 'الراتب', ...cats, 'المتبقي', 'ملاحظات', 'النوع'];
  const row1 = ['2026', 'يناير', '20000', ...cats.map((_, i) => [12000, 3000, 2000, 3000][i] ?? 0),
                '0', 'راتب + بدل', 'منفذ'];
  const row2 = ['2027', 'يناير', '22000', ...cats.map((_, i) => [13000, 3500, 2500, 3000][i] ?? 0),
                '0', 'زيادة متوقعة', 'مخطط'];
  const tbl = (rows) => `<div class="table-wrap"><table class="salary-table"><thead><tr>`
    + sample.map(h => `<th style="white-space:nowrap">${esc(h)}</th>`).join('')
    + `</tr></thead><tbody>` + rows.map(r => `<tr>`
    + r.map(v => `<td style="white-space:nowrap">${esc(String(v))}</td>`).join('') + `</tr>`).join('')
    + `</tbody></table></div>`;

  const p = (h) => `<p style="margin:0 0 9px;line-height:1.85">${h}</p>`;
  openInfoModal('📋 صيغة ملف الاستيراد (CSV)',
      p(`<strong>أسهل طريق:</strong> اضغط «📤 تصدير CSV» أولاً، افتح الملف، عدّل فيه أو أضف `
      + `صفوفاً، ثم استورده. الملف المُصدَّر من هنا يُستورَد كما هو دائماً.`)
    + p(`<strong>الأعمدة الإلزامية ثلاثة:</strong> <b>السنة</b> · <b>الشهر</b> · <b>الراتب</b>. `
      + `وبقيّتها اختيارية.`)
    + tbl([row1, row2])
    + p(`<strong>ما يقبله المستورِد بمرونة:</strong>`)
    + `<ul style="margin:0 0 10px;padding-inline-start:20px;line-height:1.9">
        <li>صفّ الترويسة <b>أينما كان</b> في الملف — لا يلزم أن يكون الأول.</li>
        <li>أسماء الأعمدة بالاحتواء: «إجمالي الراتب» و«الراتب الأساسي» كلاهما يُقرأ عمودَ الراتب.</li>
        <li>الشهر بالاسم العربي (يناير…) أو برقمه (1–12).</li>
        <li>كل عمود <b>بين «الراتب» و«المتبقي»</b> يُقرأ <b>فئة توزيع</b> باسمه — وفئةٌ غير
            موجودة عندك <b>تُنشَأ تلقائياً</b> بنوعها المُخمَّن من اسمها.</li>
        <li>عمودان بنفس اسم الفئة تُجمَع مبالغهما في تخصيص واحد.</li>
      </ul>`
    + p(`<strong>عمود «النوع»</strong> (اختياري، جديد): اكتب <b>مخطط</b> أو <b>planned</b> `
      + `للشهر المستقبلي، و<b>منفذ</b> أو اتركه فارغاً للمنفَّذ فعلياً. `
      + `<span style="color:var(--st-warn)">والمخطَّط لا يدخل أي حساب.</span>`)
    + p(`<strong>ما لا يفعله المستورِد:</strong> لا يستبدل شهراً موجوداً — يتخطّاه ويُعلن العدد. `
      + `احذف الشهر أولاً إن أردت استبداله.`)
    + p(`<strong>الترميز:</strong> UTF-8. الملف المُصدَّر من هنا يحمل BOM ليقرأ إكسل العربية صحيحاً. `
      + `والأرقام تُكتب بلا فواصل آلاف (20000 لا 20,000).`));
}

// ─── CSV Import ───────────────────────────────────────────────────────────────
function triggerImport() { document.getElementById('csv-file-input').click(); }

function onCSVFileSelected(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => parseAndImportCSV(e.target.result);
  reader.readAsText(file, 'UTF-8');
  evt.target.value = '';
}

// ── Parse a numeric string — strips thousands commas, keeps minus & decimal ───
function parseNum(str) {
  if (!str) return 0;
  // remove Arabic-locale thousands separator (comma) but keep decimal point
  const cleaned = String(str).replace(/\r/g, '').replace(/[^0-9.\-]/g, '');
  return parseFloat(cleaned) || 0;
}

// ── Resolve month: accepts number (1-12) OR Arabic name ──────────────────────
function resolveMonth(str) {
  if (!str) return 0;
  const s = str.trim().replace(/\r/g, '');
  const n = parseInt(s);
  if (!isNaN(n) && n >= 1 && n <= 12) return n;
  const idx = MONTHS_AR.indexOf(s);
  return idx >= 0 ? idx + 1 : 0;
}

// ── Full CSV text → array of rows (handles multi-line quoted fields) ──────────
function parseCSVRows(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  // Normalize line endings
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') {
        if (t[i + 1] === '"') { cur += '"'; i++; }   // escaped quote
        else inQ = false;                              // closing quote
      } else {
        cur += ch;  // newlines inside quotes are kept as part of the field
      }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
      else { cur += ch; }
    }
  }
  // Last field / row
  if (cur || row.length) { row.push(cur); rows.push(row); }
  // Drop empty trailing row
  if (rows.length && rows[rows.length - 1].every(c => c.trim() === '')) rows.pop();
  return rows;
}

function parseAndImportCSV(text) {
  // Use multi-line-aware row parser instead of naive split('\n')
  const lines = parseCSVRows(text);

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].some(c => c.includes('السنة')) && lines[i].some(c => c.includes('الشهر'))) {
      headerIdx = i; break;
    }
  }
  if (headerIdx < 0) { showToast('لم يتم التعرف على تنسيق الملف', 'error'); return; }

  const header    = lines[headerIdx];
  const colYear   = header.findIndex(c => c.includes('السنة'));
  const colMonth  = header.findIndex((c, i) => c.includes('الشهر') && i > colYear);
  const colSalary = header.findIndex(c => c.includes('الراتب'));
  const colRemaining = header.findIndex(c => c.includes('المتبقي'));
  const colNotes     = header.findIndex(c => c.includes('ملاحظات'));
  const colStatus    = header.findIndex(c => c.includes('النوع') || /status/i.test(c));

  if (colYear < 0 || colMonth < 0 || colSalary < 0) {
    showToast('تعذّر العثور على أعمدة السنة / الشهر / الراتب', 'error'); return;
  }

  // AUDIT-FIX: لا تفترض وجود عمودي «المتبقي/ملاحظات» — عند غيابهما كل الأعمدة
  // المتبقية فئات (كان header.length - 2 يسقط آخر فئتين بصمت)
  const allColEnd = colRemaining > colSalary ? colRemaining
                  : colNotes     > colSalary ? colNotes
                  : colStatus    > colSalary ? colStatus
                  : header.length;
  const allocCols = [];
  for (let c = colSalary + 1; c < allColEnd; c++) {
    let name = '';
    for (let row = headerIdx; row >= Math.max(0, headerIdx - 3); row--) {
      const val = (lines[row][c] || '').trim().replace(/\r/g, '');
      if (val) { name = val; break; }
    }
    if (name) allocCols.push({ col: c, name });
  }

  allocCols.forEach(ac => {
    if (!store.categories.find(c => c.name === ac.name)) {
      // AUDIT-FIX: تحديد النوع لحظة الاستيراد — وإلا يظهر مؤشر الادخار 0% حتى إعادة التحميل
      store.categories.push({ id: uid(), name: ac.name, type: _guessCatType(ac.name) });
    }
  });

  let imported = 0, skipped = 0, plannedCount = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row   = lines[i];
    const year  = parseInt((row[colYear] || '').replace(/[^0-9]/g, ''));
    const month = resolveMonth(row[colMonth]);
    if (!year || !month) continue;
    const salary = parseNum(row[colSalary]);
    const notes  = colNotes >= 0 ? (row[colNotes] || '').trim().replace(/\r/g, '') : '';
    if (store.entries.find(e => e.year === year && e.month === month)) { skipped++; continue; }

    // AUDIT-FIX (2026-08): عمودان بنفس اسم الفئة كانا يُنتجان تخصيصين لنفس catId؛
    // الجدول والتصدير يقرآن الأول فقط ⇒ فرق صامت بين «الموزّع» وما يُعرض.
    // الآن تُجمَع المبالغ لكل فئة في تخصيص واحد.
    const sumByCat = {};
    allocCols.forEach(ac => {
      const cat = store.categories.find(c => c.name === ac.name);
      if (!cat) return;
      sumByCat[cat.id] = (sumByCat[cat.id] || 0) + parseNum(row[ac.col]);
    });
    const allocations = Object.keys(sumByCat)
      .map(catId => ({ catId, amount: sumByCat[catId] }))
      .filter(a => a.amount !== 0);

    // النوع: مخطط / planned ⇒ مخطّط، وما عداه منفّذ (والفراغ منفّذ).
    const _rawSt = colStatus >= 0 ? String(row[colStatus] || '').trim() : '';
    const status = /مخطط|مخطّط|planned/i.test(_rawSt) ? 'planned' : 'actual';
    const entry = { id: uid(), year, month, salary, notes, allocations, status };
    store.entries.push(entry);
    logChange('add', entry, null);
    imported++;
    if (status === 'planned') plannedCount++;
  }

  saveStore(store);
  buildYearSelects();
  renderAll();
  showToast(`تم استيراد ${imported} سجل`
    + (plannedCount ? ` · منها ${plannedCount} مخطَّط لا يدخل الحسابات` : '')
    + (skipped ? ` (تُخطّي ${skipped} مكرر)` : ''), 'success');
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV() {
  // التصدير يشمل المخطّط **موسوماً بعمود النوع** — فالملف نسخة من
  // الجدول لا من الحسابات، وإسقاطه يجعل دورة تصدير←استيراد تمحو تخطيطك.
  const entries = getFilteredAll()
    .slice().sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  if (!entries.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }

  const catNames = store.categories.map(c => c.name);
  const headers  = ['السنة', 'الشهر', 'الراتب', ...catNames, 'المتبقي', 'ملاحظات', 'النوع'];

  const rows = entries.map(e => {
    const salary   = +e.salary || 0;
    const catAmts  = store.categories.map(c => {
      // مجموع كل التخصيصات لهذه الفئة (لا الأول فقط) — يطابق «إجمالي المُوزَّع»
      return (e.allocations || []).filter(x => x.catId === c.id)
        .reduce((s, x) => s + (+x.amount || 0), 0);
    });
    const allocated = catAmts.reduce((s, v) => s + v, 0);
    const remaining = salary - allocated;
    const monthName = MONTHS_AR[(+e.month || 1) - 1];
    // Numbers written as plain decimals (no thousands commas) so re-import works cleanly
    return [e.year, monthName, salary, ...catAmts, remaining, e.notes || '',
            isPlanned(e) ? 'مخطط' : 'منفذ'];
  });

  // Escape helper: text fields get quoted, numbers stay bare to avoid comma confusion
  function csvCell(v) {
    if (typeof v === 'number') return String(v);          // plain number, no quotes
    return `"${String(v).replace(/"/g, '""')}"`;          // text quoted, inner " escaped
  }

  const csvContent = [headers, ...rows]
    .map(r => r.map(csvCell).join(','))
    .join('\n');

  // BOM for Excel Arabic UTF-8 support
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `salary_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
  showToast(`تم تصدير ${entries.length} سجل`, 'success');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// esc() و uid() المشتركتان من utils.js (محمَّلة قبل هذا الملف) — أُزيلت النسخ المحلية

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeDeleteModal(); closeResetModal(); }
});
