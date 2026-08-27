let holdings    = [];
let stockTargets = {};   // ticker → target_pct  (من stock_targets)
// AUDIT-FIX (2026-08-18): «هدف صفر» قرار تصفية صريح سجّله المالك في صفحة الأهداف،
// وتقرؤه صفحة الأهداف ومحرّك القرار. اللوحة كانت لا تقرؤه فتعرض «⚪ بدون هدف»
// لسهم يقول عنه المحرّك «تصفية — بِع كامل المركز»، وتُخرجه من حساب الانضباط
// فيبدو الالتزام أعلى مما هو. المفتاح نفسه في الصفحات الثلاث.
const ZERO_TARGETS_KEY = 'stock_zero_targets_v1';
let zeroTargets = new Set();
function isZeroTarget(t) { return zeroTargets.has(t); }
let stockZones   = {};   // ticker → { entry_price, exit_price }
let trimZonesMap = {};   // ticker → trim_from (من portfolio_tasks)
let stockTaskMap = {};   // ticker → نوع المهمة اليدوية الفعّالة (من portfolio_tasks)
let plannedTickers = {}; // ticker → name  (أسهم user_stocks المخطط لها وغير المملوكة)
// مهام الأسهم اليدوية — نفس تعريف targets.js
// state: يُترجَم إلى data-state على .tag (اللون من رموز التصميم، والأيقونة تحمل المعنى معه)
const STOCK_TASK_META = {
  liquidation:  { label: 'تصفية',  icon: '🔴', state: 'bad',  desc: 'بيع المركز بالكامل والخروج منه.' },
  reduction:    { label: 'تخفيف',  icon: '⚖️', state: 'warn', desc: 'تقليل حجم المركز تدريجياً.' },
  monitoring:   { label: 'مراقبة', icon: '👁️', state: '',     desc: 'متابعة دون إجراء حالياً.' },
  accumulation: { label: 'تجميع',  icon: '🟢', state: 'good', desc: 'زيادة المركز عند الفرص.' },
  hold:         { label: 'احتفاظ', icon: '🔵', state: '',     desc: 'الاحتفاظ بالمركز كما هو.' },
};

// ══════════════════════════════════════════════════════════════
// جسر رموز التصميم — Design-token bridge
// كل لون في هذا الملف يُقرأ من متغيّرات CSS في css/style.css.
// لا لون مكتوب يدوياً هنا: تغيير الثيم (داكن/فاتح) يسري تلقائياً.
// ══════════════════════════════════════════════════════════════
function cssVar(name) {
  // الثيم الفاتح يُعرَّف على body.light-mode لا على :root — نقرأ من body أولاً
  const host = document.body || document.documentElement;
  return getComputedStyle(host).getPropertyValue(name).trim();
}
// لون سلسلة بيانات بالترتيب الثابت (1..6) — لا تُدوَّر عشوائياً
function seriesColor(i) { return cssVar('--series-' + ((Math.abs(i | 0) % 6) + 1)); }
// لون حالة: good / warn / bad — محجوز للحالة فقط، ودائماً مع أيقونة ونص
function stateColorOf(state) {
  // 'best' حالة إيجابية أعلى من 'good' — تُستعمل في أيقونة النطاق (🌟).
  // بلا إدراجها هنا كانت تسقط إلى الرمادي، وهو أسوأ من اللون الذي تحلّ محلّه.
  return cssVar((state === 'good' || state === 'best') ? '--st-good'
    : state === 'warn' ? '--st-warn'
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
// إعدادات tooltip موحّدة لكل مخططات اللوحة
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
// عدّاد دائري (.gauge) — رقمٌ واحد داخل حلقة، تحته تسميته
// يُستعمل داخل `.gauge-row` لعرض أربعة مقاييس جنباً إلى جنب. الحلقة تقول
// الرقم في ربع مساحة الشريط الأفقي، فتُترك مساحة البطاقة للأرقام لا للزينة.
//
// `bands`: نطاقات هذا المقياس وحده — [{ upTo, state, label }] مرتّبة تصاعدياً.
// إظهارها ضروري لا تجميلي: لكل عدّاد **عتبة مختلفة** (التوازن جيّد عند ٧٠٪،
// والمخاطر المُزالة لا تُعدّ جيّدة إلا عند ٩٥٪)، فبلا إعلانها يبدو اللون
// اعتباطياً — ٧٣٪ خضراء و٩٠٪ برتقالية جنباً إلى جنب بلا سبب ظاهر.
// `here` يُبرِز النطاق الذي تقع فيه القيمة الآن.
function gaugeHtml({ valueTxt, sub = '', label = '', pct = 0, color = '',
                     size = 96, title = '', bands = null, nowNote = '', hint = '' }) {
  const R = 50, circ = 2 * Math.PI * R;
  const p = Math.max(0, Math.min(100, +pct || 0));
  const off = circ * (1 - p / 100);
  const clr = color || cssVar('--text-2');
  const icon = st => st === 'good' ? '✅' : st === 'warn' ? '⚠️' : st === 'best' ? '🌟' : '🔴';

  let tip = '';
  if (bands && bands.length) {
    const rows = bands.map(b => `
      <div class="gt-row"${b.here ? ' data-here="1"' : ''}>
        <span>${icon(b.state)} ${b.label}</span><b>${b.range}</b>
      </div>`).join('');
    tip = `<div class="gc-tip" role="tooltip">
        <div class="gt-title">${label || 'المقياس'}</div>
        ${rows}
        ${nowNote ? `<div class="gt-now">${nowNote}</div>` : ''}
      </div>`;
  }

  // بلا نطاقات نُبقي تلميح المتصفّح؛ ومعها التلميح المُنسَّق يغني عنه
  const nativeTitle = (!tip && title) ? ` title="${title}"` : '';
  return `<div class="gauge-cell" tabindex="0"${nativeTitle}>
      <div class="gauge sm" style="width:${size}px;height:${size}px">
        <svg viewBox="0 0 120 120" width="${size}" height="${size}">
          <circle class="ring-bg" cx="60" cy="60" r="${R}" fill="none" stroke-width="11"/>
          <circle cx="60" cy="60" r="${R}" fill="none" stroke="${clr}" stroke-width="11" stroke-linecap="round"
            stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 60 60)"/>
        </svg>
        <div class="gauge-mid">
          <div class="g-v">${valueTxt}</div>
          ${sub ? `<div class="g-l">${sub}</div>` : ''}
        </div>
      </div>
      ${label ? `<div class="gc-label">${label}</div>` : ''}
      ${hint ? `<div class="gc-hint">${hint}</div>` : ''}
      ${tip}
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
let sectorChart = null;
let _sectorMode = 'donut'; // 'donut' | 'bars' | 'cards'
let weightChart = null;
let weightDonutCur = null;   // مخطط دائري — الوزن الحالي على مستوى السهم
let weightDonutTgt = null;   // مخطط دائري — الوزن المستهدف على مستوى السهم
let _weightMode = 'bars';  // 'bars' | 'gap' | 'cards' | 'table'
let allocChart  = null;    // مخطط التخصيص الكلي للأصول
let beChart     = null;    // مخطط نقطة التعادل
let editingId   = null;
let investedTab      = 'net';     // 'net' = رأس المال المنشغل | 'wac' = تكلفة الوسيط
let yieldTab         = 'fwd';     // 'fwd' | 'ann' | 'yoc' | 'market'
let breakevenMode    = 'summary'; // 'summary' | 'detail' | 'bars'
let portfolioCash    = 0;      // نقد المحفظة عند الوسيط
let cashUpdatedAt    = null;   // تاريخ آخر تحديث للنقد
let _priceTimestamps = {};     // ticker → ISO timestamp آخر تحديث للسعر

// ── Sorting state for holdings table ─────────────────────────
let hSortField = '';
let hSortDir   = 'asc';

function sortHoldings(field) {
  if (hSortField === field) hSortDir = hSortDir === 'asc' ? 'desc' : 'asc';
  else { hSortField = field; hSortDir = 'asc'; }
  renderTable();
}

function hSortArrow(field) {
  if (hSortField !== field) return '<span class="sort-arrow">↕</span>';
  return `<span class="sort-arrow active">${hSortDir === 'asc' ? '↑' : '↓'}</span>`;
}

const g = id => document.getElementById(id);
const setText = (id, v) => { const el = g(id); if (el) el.textContent = v; };
// للمكوّنات المولَّدة داخلياً فقط (tagHtml/meterHtml) — لا نصوص مستخدم غير مهرَّبة
const setHtml = (id, v) => { const el = g(id); if (el) el.innerHTML = v; };

// Returns all td attributes for an editable cell
function ed(table, rowId, field, type, raw, extraCls = '', selectKey = '') {
  const numCls = type === 'number' ? ' num' : '';
  return `class="editable${numCls}${extraCls ? ' ' + extraCls : ''}" ` +
    `data-table="${table}" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"` +
    (selectKey ? ` data-select="${selectKey}"` : '');
}

// computeXIRR منقولة إلى utils.js — متاحة لجميع الصفحات

// إجمالي الصكوك المشترَك بها (من التخزين المحلي لصفحة الصكوك)
// AUDIT-FIX 2026-08: على جهاز جديد لا يوجد مفتاح LS — نحمّل من user_settings
// (نفس مفتاح صفحة الصكوك) مرة واحدة ثم نعيد رسم الكروت المتأثرة.
let _sukukFallbackTried = false;
function getSukukActiveTotal() {
  try {
    const raw = localStorage.getItem(userLsKey(SUKUK_PLANNER_KEY)) || localStorage.getItem(SUKUK_PLANNER_KEY);
    if (!raw) { _ensureSukukFromSupabase(); return 0; }
    const data = JSON.parse(raw);
    return (data.opportunities || [])
      .filter(o => o.status === 'مشترك')
      .reduce((s, o) => s + (+o.amount || 0), 0);
  } catch (_) { return 0; }
}

async function _ensureSukukFromSupabase() {
  if (_sukukFallbackTried) return;
  _sukukFallbackTried = true;
  try {
    const remote = await loadUserSetting(SUKUK_PLANNER_KEY);
    if (!remote) return;
    localStorage.setItem(userLsKey(SUKUK_PLANNER_KEY), JSON.stringify(remote));
    // أعِد رسم الكروت التي تعتمد على إجمالي الصكوك
    renderStats();
    renderRetirementCard();
    renderPortfolioHealthCard();
    renderAllocationChart();
  } catch (_) {}
}

// ── تتبع قِدم الأسعار ─────────────────────────────────────────
// User-scoped key — resolved after requireAuth() sets window._currentUserId
const PRICE_TS_KEY = () => userLsKey('tharwa-price-timestamps');
const STALE_DAYS   = 7;   // عدد الأيام التي بعدها يُعتبر السعر قديماً

function _loadPriceTimestamps() {
  try { _priceTimestamps = JSON.parse(localStorage.getItem(PRICE_TS_KEY()) || '{}'); }
  catch (_) { _priceTimestamps = {}; }
}

function _savePriceTimestamps() {
  try { localStorage.setItem(PRICE_TS_KEY(), JSON.stringify(_priceTimestamps)); }
  catch (_) {}
}

// أيام مضت على آخر تحديث للسعر (null = غير محدَّد بعد)
function getPriceAgeDays(ticker) {
  const ts = _priceTimestamps[ticker];
  if (!ts) return null;
  return (Date.now() - new Date(ts).getTime()) / 86400000;
}

// AUDIT-FIX: seed _priceTimestamps from DB's price_updated_at so staleness check
// survives localStorage clearing without showing all prices as stale
// قاعدة البيانات هي المرجع للأسعار التلقائية: خذ الأحدث بين DB و localStorage
// (كان الشرط القديم !_priceTimestamps يرفض تحديث ختم عالق قديم في localStorage
//  فيظهر السعر الحديث مقترناً بختم قديم = «قديم» زوراً)
// تُستدعى من loadAllData و reloadHoldings بعد تعبئة holdings.
function _seedPriceTimestampsFromDB() {
  holdings.forEach(h => {
    if (!h.price_updated_at) return;
    const dbTs    = new Date(h.price_updated_at).getTime();
    const localTs = _priceTimestamps[h.ticker] ? new Date(_priceTimestamps[h.ticker]).getTime() : 0;
    if (dbTs > localTs) _priceTimestamps[h.ticker] = h.price_updated_at;
  });
  _savePriceTimestamps();
}

// هل يوجد أي سهم في المحفظة سعره قديم أكثر من STALE_DAYS؟
// السعر اليدوي (price_manual) يصونه المالك عمداً = لا يُعتبر قديماً أبداً.
function hasStalePrice() {
  return holdings.some(h => {
    if (h.price_manual) return false;
    const age = getPriceAgeDays(h.ticker);
    return age === null || age > STALE_DAYS;
  });
}

// ── Auto Price Update (Supabase Edge Function) ────────────────
let _priceRefreshTimer = null;
let _lastPriceRefreshAt = 0;   // آخر استدعاء فعلي — يمنع التحديث المتكرر عند تبديل التبويبات

let _refreshInFlight = false;
async function refreshPrices(silent = false) {
  // ⚠️ بلا حارس: نقرتان متتاليتان (أو نقرة أثناء التحديث التلقائي الصامت)
  // تُشغّلان `loadAllData` مرّتين متزامنتين، وكلتاهما تكتب في نفس المتغيّرات
  // العامة (holdings · divRows · window._ds) — فتُرسم الصفحة من خليط
  // نتيجتين. ونقرة أثناء تحديث صامت كانت تخطف الزرّ نصّاً وحالةً.
  if (_refreshInFlight) return;
  _refreshInFlight = true;
  const btn = silent ? null : document.getElementById('refresh-prices-btn');
  _lastPriceRefreshAt = Date.now();
  try {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التحديث...'; }

    const { data: json, error } = await supabaseClient.functions.invoke('update-prices');
    if (error) throw error;

    if (json?.updated > 0) {
      // تحديث فوري للأسعار في الـ holdings المحلي
      const nowISO = new Date().toISOString();
      if (json.prices) {
        holdings.forEach(h => {
          // AUDIT-FIX (2026-07): لا تدُس السعر اليدوي (price_manual) بالتحديث التلقائي
          if (json.prices[h.ticker] != null && !h.price_manual) {
            h.current_price = json.prices[h.ticker];
            _priceTimestamps[h.ticker] = nowISO;   // ← سجّل وقت التحديث
          }
        });
        _savePriceTimestamps();
      }
      // رسم فوري بالأسعار الجديدة + تحقق مناطق السعر
      renderAllCards();
      // تحقق تنبيهات مناطق الشراء/البيع بعد كل تحديث أسعار
      holdings.forEach(h => checkPriceZones(h.ticker, +h.current_price));
      // H-6: warn about tickers Yahoo didn't return (delisted / corporate action)
      if (json.failed?.length) {
        showToast(`⚠️ لم يُحدَّث سعر: ${json.failed.join(', ')}`, 'warning');
      }
      if (btn) btn.textContent = `✅ تم (${json.updated} سهم)`;
      // R-4: background DB sync with error handling
      loadAllData()
        .then(() => {
          renderStats(); renderTable(); renderPriceZonesCard();
          renderBreakEvenCard(); renderAllocationChart(); renderRetirementCard();
        })
        .catch(e => {
          console.warn('Background sync after price refresh failed:', e);
          showToast('⚠️ تعذّرت مزامنة الأسعار مع قاعدة البيانات — ستظهر عند إعادة التحميل', 'warning');
        });
    } else {
      if (btn) btn.textContent = json?.message ? `⚠️ ${json.message}` : '⚠️ لم يتحدث';
    }
  } catch (e) {
    if (!silent) console.warn('refreshPrices error:', e);
    if (btn) btn.textContent = '❌ خطأ';
  } finally {
    _refreshInFlight = false;
    if (btn) setTimeout(() => { btn.disabled = false; btn.textContent = '🔄 تحديث الأسعار'; }, 3000);
  }
}

function startPriceAutoRefresh() {
  refreshPrices(true);
  _priceRefreshTimer = setInterval(() => refreshPrices(true), 5 * 60 * 1000);
}

// ── إعادة رسم موحّدة لكل الكروت (AUDIT-FIX 2026-08: كانت كل نقطة تعديل
// تعيد رسم قائمة جزئية مختلفة — القائمة الكاملة هنا واحدة للجميع) ──────
// الخطة تُقرأ مرة واحدة عند الإقلاع، ثم يرسمها renderAllCards مع البقية
async function initPlanGoalStrip() {
  _dashPlan = await loadDashPlan();
  renderPlanGoalStrip();
}

function renderAllCards() {
  renderStats();
  renderPlanGoalStrip();
  renderPortfolioHealthCard();
  renderDiversificationCard();
  renderCharts();
  renderTable();
  renderPriceZonesCard();
  renderBreakEvenCard();
  renderAllocationChart();
  renderRetirementCard();
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-dashboard');
  _loadPriceTimestamps();   // ← حمّل آخر تواريخ تحديث الأسعار
  await loadAllData();
  renderAllCards();
  initPlanGoalStrip();          // لا نُوقِف اللوحة على قراءة الخطة — ترسم نفسها متى وصلت
  applyReliabilityBadges();
  startPriceAutoRefresh();

  // أوقف العداد عند إخفاء الصفحة — استأنفه عند العودة
  // AUDIT-FIX 2026-08: حد أدنى 60 ثانية بين استدعاءات refreshPrices عند تبديل التبويبات
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(_priceRefreshTimer); _priceRefreshTimer = null;
    } else if (!_priceRefreshTimer) {
      if (Date.now() - _lastPriceRefreshAt >= 60 * 1000) {
        startPriceAutoRefresh();
      } else {
        // استأنف الدورة فقط دون استدعاء فوري
        _priceRefreshTimer = setInterval(() => refreshPrices(true), 5 * 60 * 1000);
      }
    }
  });

  // مزامنة هدف FIRE من Supabase (للتزامن بين الأجهزة)
  _loadRetirementGoalFromSupabase().catch(() => {});

  // تسجيل قيمة المحفظة تلقائياً (مرة في الشهر) لبناء تاريخ أداء حقيقي
  _autoSnapshotPortfolio().catch(() => {});
}

// ── Auto-snapshot: يحفظ قيمة المحفظة الحالية في net_worth_snapshots ─────
// يعمل مرة واحدة لكل شهر — يوفر بيانات تاريخية تدريجية لصفحة الأداء
let _snapshotInProgress = false;
async function _autoSnapshotPortfolio() {
  // guard ضد الاستدعاء المتزامن (race condition)
  if (_snapshotInProgress) return;
  _snapshotInProgress = true;
  try {
    // AUDIT-FIX: use local date to avoid UTC-shift placing snapshot in wrong month for UTC+3
    const _now = new Date();
    const todayISO_ = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
    const thisMonth = todayISO_.slice(0, 7); // YYYY-MM
    const monthKey  = `auto-${thisMonth}`;   // مفتاح فريد للشهر

    // هل يوجد snapshot تلقائي لهذا الشهر بالفعل؟
    // نفلتر بـ notes يبدأ بـ monthKey لتجنب عد اللقطات اليدوية
    const { data: existing, error: exErr } = await supabaseClient
      .from('net_worth_snapshots')
      .select('id')
      .ilike('notes', `${monthKey}%`)
      .limit(1);

    // AUDIT-FIX 2026-08: فشل الفحص = لا ندري إن كانت لقطة الشهر موجودة —
    // نخرج مبكراً (fail-closed) بدل المخاطرة بإدراج لقطة مكررة
    if (exErr) { console.warn('_autoSnapshotPortfolio check failed:', exErr); return; }
    if (existing?.length) return; // موجود — لا نكرر

    // احسب القيمة الكلية الحالية
    const stocksValue = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
    if (stocksValue <= 0) return; // لا يوجد أسهم — لا نسجل

    const { data: { user } } = await supabaseClient.auth.getUser();
    const s    = window._ds || {};
    const reVal = s.reTotal || 0;

    // صافي الثروة = أسهم + نقد + عقارات
    const totalNW = stocksValue + portfolioCash + reVal;

    // R-2: use upsert on (user_id, date) to prevent duplicate rows from concurrent tabs
    await supabaseClient.from('net_worth_snapshots').upsert(
      {
        user_id:     user.id,
        date:        todayISO_,
        total_value: totalNW,
        notes:       `${monthKey} — أسهم: ${stocksValue.toFixed(0)} | نقد: ${portfolioCash.toFixed(0)} | عقارات: ${reVal.toFixed(0)}`,
      },
      { onConflict: 'user_id,date', ignoreDuplicates: true }
    );
  } finally {
    _snapshotInProgress = false;
  }
}

// ── Data ──────────────────────────────────────────────────────
async function loadAllData() {
  const yr = new Date().getFullYear();

  // Promise.all مع try/catch — فشل أي استعلام يُوقف التحميل
  // نستخدم allSettled لتلقي نتائج جزئية بدل الفشل الكامل الصامت
  const results = await Promise.allSettled([
    supabaseClient.from('holdings').select('*').order('ticker'),
    supabaseClient.from('transactions').select('type, total, shares, price, commission, vat, ticker, date').eq('is_archived', false),
    supabaseClient.from('dividends').select('amount, year, month, date, ticker').eq('is_archived', false),
    supabaseClient.from('cashflow_entries').select('type, amount, date').eq('is_archived', false),
    // AUDIT-FIX 2026-08: نجلب notes + نافذة أوسع لتفضيل أحدث لقطة يدوية (اللقطة
    // التلقائية جزئية: أسهم+نقد+عقار فقط)، مع count حقيقي لعدد اللقطات
    supabaseClient.from('net_worth_snapshots').select('total_value, date, notes', { count: 'exact' }).order('date', { ascending: false }).limit(24),
    supabaseClient.from('real_estate').select('current_value, status').eq('is_active', true),
    supabaseClient.from('stock_targets').select('ticker, target_pct, entry_price, exit_price'),
    supabaseClient.from('sector_targets').select('sector, target_pct'),
    supabaseClient.from('portfolio_cash').select('amount, updated_at').limit(1).maybeSingle(),
    supabaseClient.from('portfolio_tasks').select('type, ticker, status, accumulate_at, trim_from, liquidate_above').eq('status', 'active'),
    supabaseClient.from('user_stocks').select('ticker, name')
  ]);

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) {
    showToast(`⚠️ تعذّر تحميل ${failed.length} مصدر بيانات — قد تكون بعض الأرقام غير مكتملة`, 'warning');
  }

  const [rH, rTx, rDiv, rCf, rNw, rRe, rSt, rSecT, rCash, rTasks, rUserStocks] = results.map(r =>
    r.status === 'fulfilled' ? r.value : { data: null, error: null }
  );

  holdings = rH.data || [];

  // المهام اليدوية الفعّالة لكل سهم (أحدث مهمة لكل رمز)
  stockTaskMap = {};
  trimZonesMap = {};
  (rTasks?.data || []).forEach(t => {
    if (!t.ticker) return;
    if (!stockTaskMap[t.ticker]) stockTaskMap[t.ticker] = t.type;
    if (!trimZonesMap[t.ticker] && t.trim_from != null) trimZonesMap[t.ticker] = +t.trim_from;
  });
  // تطبيق قيم portfolio_tasks فوق stockZones (المصدر الصحيح للمناطق)
  // يُنفَّذ بعد بناء stockZones من stock_targets أدناه — سيُعاد التطبيق هناك
  // الأسهم المخطط لها = user_stocks غير الموجودة في الحيازات الفعلية
  plannedTickers = {};
  const _heldSet = new Set((rH.data || []).map(h => h.ticker));
  (rUserStocks?.data || []).forEach(u => { if (u.ticker && !_heldSet.has(u.ticker)) plannedTickers[u.ticker] = u.name || u.ticker; });

  // AUDIT-FIX 2026-08: بذر الأختام صار دالة مشتركة تُستدعى أيضاً من reloadHoldings
  _seedPriceTimestampsFromDB();

  // نقد المحفظة — الأحدث بين Supabase و localStorage (نفس منطق أختام الأسعار)
  // AUDIT-FIX 2026-08: كانت قيمة DB تدوس قيمة LS الأحدث (حُفظت محلياً وفشل upsert)
  // ملاحظة: maybeSingle() يُرجع { data: { amount, updated_at } | null }
  if (rCash?.data?.amount != null) {
    const lsCash = _readCashLS();
    const dbTs = rCash.data.updated_at ? new Date(rCash.data.updated_at).getTime() : 0;
    const lsTs = lsCash?.updated_at    ? new Date(lsCash.updated_at).getTime()    : 0;
    if (lsCash && lsTs > dbTs) {
      portfolioCash = +lsCash.amount || 0;
      cashUpdatedAt = lsCash.updated_at;
    } else {
      portfolioCash = +rCash.data.amount;
      cashUpdatedAt = rCash.data.updated_at || null;
      _saveCashToLS(portfolioCash, cashUpdatedAt); // حدّث الـ cache
    }
  } else {
    _loadCashFromLS(); // fallback للـ localStorage (أو قيمة صفر إن لم يوجد)
  }

  // بناء خريطة الأهداف — stock_targets للنسب، portfolio_tasks للمناطق السعرية
  stockTargets = {};
  stockZones   = {};
  try {
    const _z = await loadUserSetting(ZERO_TARGETS_KEY);
    zeroTargets = new Set(Array.isArray(_z) ? _z : []);
  } catch (_) { zeroTargets = new Set(); }
  (rSt.data || []).forEach(r => {
    stockTargets[r.ticker] = +r.target_pct;
    stockZones[r.ticker]   = { entry_price: r.entry_price ?? null, exit_price: r.exit_price ?? null };
  });
  // portfolio_tasks هو المصدر الصحيح للمناطق السعرية — يُطغى على stock_targets
  (rTasks?.data || []).forEach(t => {
    if (!t.ticker) return;
    if (!stockZones[t.ticker]) stockZones[t.ticker] = { entry_price: null, exit_price: null };
    if (t.accumulate_at   != null) stockZones[t.ticker].entry_price = +t.accumulate_at;
    if (t.liquidate_above != null) stockZones[t.ticker].exit_price  = +t.liquidate_above;
  });
  holdings.forEach(h => {
    if (stockTargets[h.ticker] !== undefined) h.target_weight = stockTargets[h.ticker];
  });

  const txRows   = rTx.data  || [];
  const divRows  = rDiv.data || [];
  const cfRows   = rCf.data  || [];
  const nwRows   = rNw.data  || [];
  const reRows   = rRe.data  || [];

  // AUDIT-FIX 2026-08: صافي الثروة المعروض = أحدث لقطة «يدوية» (notes لا تبدأ
  // بـ auto) لأنها صافي ثروة كامل؛ اللقطة التلقائية جزئية (أسهم+نقد+عقار فقط)
  // وتُعرض بوسمها فقط عند غياب أي لقطة يدوية.
  const _nwManual = nwRows.find(r => !String(r.notes || '').startsWith('auto'));
  const _nwPick   = _nwManual || nwRows[0] || null;
  const _nwIsAuto = !!_nwPick && !_nwManual;
  // عدد اللقطات الحقيقي (count من الاستعلام — كان يُبنى من نافذة limit فقط)
  const _nwCount  = (results[4].status === 'fulfilled' && typeof results[4].value.count === 'number')
    ? results[4].value.count : nwRows.length;

  // ── حسابات المعاملات ──────────────────────────────────────
  const totalBuys  = txRows.filter(t => t.type === 'buy').reduce((s, t) => s + +t.total, 0);
  const totalSells = txRows.filter(t => t.type === 'sell').reduce((s, t) => s + +t.total, 0);
  const totalCommission = txRows.reduce((s, t) => s + (+t.commission || 0), 0);
  const totalVAT        = txRows.reduce((s, t) => s + (+t.vat        || 0), 0);

  // ── حسابات المنح ─────────────────────────────────────────
  const grantMap = {};
  txRows.filter(t => t.type === 'grant').forEach(t => {
    grantMap[t.ticker] = (grantMap[t.ticker] || 0) + +t.shares;
  });
  const totalGrantShares  = Object.values(grantMap).reduce((s, v) => s + v, 0);
  const totalGrantTickers = Object.keys(grantMap).length;

  // ── ر/خ المحقق من البيع (دقيق بعد الرسوم) ────────────────
  // F-6: WAC زمني — نمشي على المعاملات بترتيبها التاريخي ونستخدم متوسط التكلفة
  // وقت كل عملية بيع (لا متوسط نهائي يشمل مشتريات لاحقة). مطابق لمنهج
  // transactions.js (renderTxStats) لضمان توافق الرقم بين الصفحتين.
  //   • تكلفة الشراء (t.total) تشمل العمولة + الضريبة
  //   • أسهم المنح تُضاف بتكلفة صفر فتخفض المتوسط (WAC حقيقي)
  //   • t.total للبيع = القيمة − العمولة − الضريبة (صافي ما دخل جيبك)
  let realizedPnL = 0;
  {
    // AUDIT-FIX 2026-08: السجلات بلا تاريخ توضع في نهاية الترتيب صراحة
    // (كانت المقارنة NaN فتترك موضعها غير محدد)
    // ⚠️ التاريخ وحده لا يكفي: معاملتان في اليوم نفسه ترتيبهما غير محدَّد،
    // وإن سبق البيعُ شراءَه صار متوسط التكلفة صفراً و**كامل عائد البيع
    // ربحاً محقَّقاً**. القاعدة المحاسبية: الاقتناء قبل التصرّف — لا يُباع
    // ما لم يُملَك بعد. (نفس ترتيب `txSortForWAC` في js/transactions.js.)
    const _txRank = { buy: 0, grant: 0, sell: 1 };
    const sortedTx = txRows.slice().sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return (new Date(a.date) - new Date(b.date))
          || ((_txRank[a.type] ?? 0) - (_txRank[b.type] ?? 0))
          || String(a.created_at || '').localeCompare(String(b.created_at || ''))
          || String(a.id || '').localeCompare(String(b.id || ''));
    });
    const costMap  = {}; // ticker → { shares, totalCost (شاملة عمولة + ضريبة) }
    sortedTx.forEach(t => {
      if (!costMap[t.ticker]) costMap[t.ticker] = { shares: 0, totalCost: 0 };
      const m = costMap[t.ticker];
      if (t.type === 'buy') {
        m.totalCost += +t.total;
        m.shares    += +t.shares;
      } else if (t.type === 'grant') {
        m.shares    += +t.shares;            // منحة: تكلفة صفر
      } else if (t.type === 'sell') {
        // ⚠️ البيع يُقَصّ على المملوك — كماً **وعائداً معاً**. كان العدد بلا
        // قصّ، فبيعُ 150 من 100 مملوكة يسجّل ربح خمسين سهماً لا تملكها.
        // (`syncHoldingsFromTx` في هذا الملف نفسه تقصّ — كان الملف يناقض نفسه.)
        const sellShares      = Math.min(+t.shares, m.shares);
        const sellRatio       = (+t.shares > 0) ? sellShares / +t.shares : 0;
        const avgCostPerShare = m.shares > 0 ? m.totalCost / m.shares : 0;
        const costOfSold      = avgCostPerShare * sellShares;
        realizedPnL += (+t.total) * sellRatio - costOfSold;
        // خصم التكلفة بعدد الأسهم (لا بالنسبة) — مطابق recomputeHoldingFromTx
        m.totalCost = Math.max(0, m.totalCost - costOfSold);
        m.shares    = Math.max(0, m.shares - sellShares);
      }
    });
  }

  // ── القيمة السوقية والتكلفة ──────────────────────────────
  const totalValue = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  const costBasis  = holdings.reduce((s, h) => s + +h.shares * +h.avg_price, 0);

  // ── تحليل القطاعات ──────────────────────────────────────
  const sectorValMap = {};
  holdings.forEach(h => {
    const sec = (h.sector || '').trim() || 'غير مصنف';
    sectorValMap[sec] = (sectorValMap[sec] || 0) + +h.shares * +h.current_price;
  });
  const sectorTargetMap = {};
  (rSecT.data || []).forEach(r => { sectorTargetMap[r.sector] = +r.target_pct; });
  window._sectorTargetMap = sectorTargetMap;   // متاح لـ _renderSectorBars/_renderSectorCards
  const sectorList = Object.entries(sectorValMap)
    .map(([sec, val]) => ({
      sec,
      pct:    totalValue > 0 ? val / totalValue * 100 : 0,
      target: sectorTargetMap[sec] || 0
    }))
    .sort((a, b) => b.pct - a.pct);

  const topSector    = sectorList[0]    || null;
  const bottomSector = sectorList[sectorList.length - 1] || null;
  const sectorCount  = sectorList.length;

  // ══════════════════════════════════════════════════════════════════
  // العوائد التوزيعية — تاريخٌ واحد لكل توزيعة، ومُستلَمٌ لا مُعلَن
  // ------------------------------------------------------------------
  // كان هذا الملف يحمل **ثلاثة** تعريفات لتاريخ التوزيعة في آن:
  //   • `totalDivAll` و`yearDiv`: بلا فحص تاريخ إطلاقاً، و`yearDiv` تقرأ
  //     حقل `year` المستقل — فتوزيعة تاريخها هذا الشهر وحقل سنتها الماضية
  //     تُحسب في TTM وتغيب عن «أرباح السنة» فيظهر العائد المُسنوى 0.00%.
  //   • `ttmDiv` عبر `parseDateLocal` مع احتياطي سنة/شهر.
  //   • XIRR عبر `dividendFlowDate`.
  //
  // والأخطر: التوزيعة **المُعلَنة بتاريخ صرفٍ قادم** كانت تدخل «إجمالي
  // الأرباح» و«أرباح السنة» و«إجمالي الربح منذ البداية» وكرت التعادل —
  // بينما TTM وForward وXIRR تُسقطها كلها. نقدٌ لم يدخل جيبك بعدُ ليس دخلاً
  // محقَّقاً، وهو نصّ `dividendFlowDate` نفسها في utils.js.
  //
  // المصدر الآن واحد: `_divPaid` — كل توزيعة أمكن تأريخها ووقع صرفها.
  // ══════════════════════════════════════════════════════════════════
  const _nowRef = new Date();
  const _divPaid = divRows
    .map(d => ({ d, dt: dividendFlowDate(d, _nowRef) }))
    .filter(x => x.dt);
  const _divDeclaredPending = divRows.length - _divPaid.length;

  const totalDivAll = _divPaid.reduce((s, x) => s + +x.d.amount, 0);
  const yearDiv     = _divPaid.filter(x => x.dt.getFullYear() === yr)
                              .reduce((s, x) => s + +x.d.amount, 0);
  // أرباح آخر 12 شهراً (TTM) — للعائد الحقيقي على التكلفة والدخل المتوقع
  const _today = new Date();
  const _yearAgo = new Date(_today.getFullYear() - 1, _today.getMonth(), _today.getDate());
  // AUDIT-FIX (2026-07): سجل بلا تاريخ يُحتسب بتاريخ مُركَّب من شهر/سنة (أول الشهر)
  // بدل إسقاطه — موحَّد مع _ttmDividends في صفحة الأرباح.
  // ══════════════════════════════════════════════════════════════════
  // ⚠️ بسطُ العائد ومقامُه من مجالٍ واحد — الأسهم التي **تملكها اليوم**
  // ------------------------------------------------------------------
  // `ttmDiv` كان يجمع توزيعات آخر 12 شهراً من **كل** السجلات، بما فيها سهمٌ
  // بِعتَه بالكامل — بينما `costBasis` و`totalValue` من الحيازات القائمة
  // وحدها. توزيعةُ مركزٍ خرجتَ منه تخصّ رأس مال لم يعد في المقام، وهي
  // محسوبة أصلاً في الربح المحقَّق.
  //
  // قياس فعلي: سهم تكلفته 1,000 وتوزيعه 50، وآخر تكلفته 9,000 وتوزيعه 450
  // ثم بِعتَه ⇒ العائد على التكلفة يُعرض **50%** والصحيح **5%**. وتبويب
  // Forward وحده كان صحيحاً لأنه يمشي على الحيازات.
  // ══════════════════════════════════════════════════════════════════
  const _heldTickers = new Set(holdings.map(h => String(h.ticker || '').trim().toUpperCase()));
  const _divHeld = divRows.filter(d => _heldTickers.has(String(d.ticker || '').trim().toUpperCase()));
  // نفس القاعدة مطبَّقة على بسط **الاستقراء**: كان `yearDiv` يُستقرأ وهو من
  // كل السجلات بما فيها مراكز مُغلَقة، بينما مقامه `costBasis` من الحيازات
  // القائمة وحدها — الإصلاح طُبِّق على `ttmDiv` أعلاه ونُسي هنا.
  // `yearDiv` نفسه يبقى كما هو: هو «أرباح السنة» المعروضة، ونقدٌ استُلم فعلاً.
  const yearDivHeld = _divPaid
    .filter(x => x.dt.getFullYear() === yr
              && _heldTickers.has(String(x.d.ticker || '').trim().toUpperCase()))
    .reduce((s, x) => s + +x.d.amount, 0);
  const ttmDiv = _divHeld.reduce((s, d) => {
    // AUDIT-FIX 2026-08-21 (#51): كان `new Date('YYYY-MM-DD')` يُفسَّر UTC بينما
    // احتياطي year/month في السطر التالي — و tsOf في الدخل المتوقَّع أسفل الملف —
    // يُفسَّر بالتوقيت المحلي. فرق الإزاحة كان ينقل توزيعة أول/آخر يوم في النافذة
    // شهراً كاملاً بين المسارين داخل الملف الواحد. parseDateLocal محلي دائماً.
    const dt = d.date
      ? (parseDateLocal(d.date) || new Date(d.date))
      : (d.year ? new Date(+d.year, (+d.month || 1) - 1, 1) : null);
    // AUDIT-FIX (2026-08-18): كانت النافذة مغلقة الطرفين (>=) أي 366 يوماً، فتحتسب
    // دفعة الموزّع السنوي مرتين في يوم الذكرى السنوية بالضبط. صفحة الأرباح أصلحت
    // هذا في _ttmDividends واللوحة لم تتلقّ الإصلاح رغم تعليق «موحَّد معها» أعلاه.
    return (dt && !isNaN(dt) && dt > _yearAgo && dt <= _today) ? s + +d.amount : s;
  }, 0);

  // ── حساب رأس المال أول السنة الحالية (للعائد المُسنوى) ───
  const today_d      = new Date();
  const daysElapsed  = Math.floor((today_d - new Date(yr, 0, 1)) / 86400000) + 1;
  const daysInYear   = ((yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0) ? 366 : 365;
  // الأرباح المُسنواة للسنة الحالية
  // AUDIT-FIX (H1): linear YTD→annual extrapolation (×365/days) is unreliable early in the
  // year for lumpy / semi-annual Saudi payers — a single H1 dividend by June would scale ×2.2.
  // Only extrapolate once ≥180 days (a full semi-annual cycle) have elapsed; before that fall
  // back to the trailing-12-month figure, which is a true annual run-rate with no extrapolation.
  // ══════════════════════════════════════════════════════════════════
  // ⚠️ حارس 180 يوماً وحده يفترض أن **كل** موزّع نصف سنوي على الأقل
  // ------------------------------------------------------------------
  // السوق السعودي مليء بموزّع سنوي واحد في مارس/أبريل. قياس فعلي: موزّع
  // سنوي دفع 600 ر.س في مارس على تكلفة 10,000، في اليوم 236 من السنة ⇒
  // الاستقراء يعطي **9.28%** والحقيقة **6.00%** — تضخيم 55% على الرقم
  // الذي يقيس هدف م.7 نفسه. وتبويبا YOC وForward يعرضان 6.00% بجواره.
  //
  // القاعدة الصحيحة: لا يُستقرأ إلا ما اكتملت دورته. سهم ربعي مضى عليه
  // ثلاثة أرباع يجوز استقراؤه؛ وسنويٌّ لم يُكمل سنته لا يجوز — ومجموع
  // آخر 12 شهراً (TTM) معدّلٌ سنويٌّ **حقيقي** بلا استقراء أصلاً.
  // ══════════════════════════════════════════════════════════════════
  // نفس `inferDividendFrequency` التي تحكم الدخل المتوقَّع — لا استنتاج موازٍ
  const _annFreqs = (() => {
    const byTk = {};
    _divHeld.forEach(d => {
      const tk = String(d.ticker || '').trim().toUpperCase();
      if (!tk) return;
      const iso = d.date || (d.year ? `${d.year}-${String(d.month || 1).padStart(2, '0')}-01` : null);
      if (iso) (byTk[tk] = byTk[tk] || []).push(iso);
    });
    return Object.values(byTk)
      .map(list => (typeof inferDividendFrequency === 'function') ? inferDividendFrequency(list) : 0)
      .filter(f => f > 0);
  })();
  const _minFreq  = _annFreqs.length ? Math.min(..._annFreqs) : 0;
  // الدورة الواحدة لأبطأ موزّع لديك، بالأيام. بلا بيانات دورية: لا استقراء.
  const _cycleDays = _minFreq > 0 ? daysInYear / _minFreq : Infinity;
  const _canExtrapolate = daysElapsed >= 180 && daysElapsed >= _cycleDays * 1.5;
  const annualizedYearDiv = _canExtrapolate
    ? yearDivHeld * (daysInYear / daysElapsed)
    : ttmDiv;
  const _annBasis = _canExtrapolate ? 'extrapolated' : 'ttm';
  // المقام للعائد المُسنوى: costBasis (WAC × الأسهم الحالية) هو الأدق لأنه يعكس رأس المال الفعلي المُنشغل
  // صافي التدفقات النقدية (شراء − بيع) قد يكون منخفضاً إذا ضُخّ معظم المال في نفس السنة
  // AUDIT-FIX 2026-08: عند costBasis=0 كان المقام يُجبر على 1 فيظهر رقم بلا معنى —
  // الآن null وتعرض الواجهة «—»
  const denomAnn = costBasis;

  // الطرق الثلاث
  const divYieldAnn    = denomAnn    > 0 ? annualizedYearDiv / denomAnn    * 100 : null; // مُسنوى
  const divYieldYOC    = costBasis   > 0 ? ttmDiv            / costBasis   * 100 : 0; // على التكلفة (آخر 12 شهر)
  // AUDIT-FIX (M2): use TTM over market value — consistent with YOC (both trailing-12m);
  // previously used annualized-YTD here while YOC used TTM, making the two tabs incomparable.
  const divYieldMarket = totalValue  > 0 ? ttmDiv / totalValue  * 100 : 0; // سوقي

  // إبقاء القديم متوافقاً
  const divYieldYear = divYieldMarket;
  const divYieldAll  = divYieldYOC;

  // ── Forward Projected Income — الأدق للمحافظ النامية ─────────
  // لكل سهم في الحيازات: (آخر دفعة ÷ أسهم وقتها) × الدورية × الأسهم الحالية
  // AUDIT-FIX (2026-07): نبني أيضاً fwdByTicker (دخل متوقع لكل رمز) ليستخدمه
  // كرت «الدخل حسب القطاع» بتوزيعات فعلية بدل التوزيع بنسبة القيمة السوقية.
  const fwdByTicker = {};
  let _fwdStale = [];          // الأسهم المستبعَدة لانقطاع التوزيع (تُعرض في شرح الكرت)
  const fwdProjected = (() => {
    const divDate = d => {
      if (d.date) return d.date;
      const mo = String(d.month || 1).padStart(2, '0');
      return `${d.year || new Date().getFullYear()}-${mo}-01`;
    };

    // I-2: build sorted shares timeline per ticker once (O(N)) — avoid O(N×M) sharesAt calls
    const tickerTimeline = {};
    txRows.forEach(t => {
      if (!t.date) return;
      if (!tickerTimeline[t.ticker]) tickerTimeline[t.ticker] = [];
      tickerTimeline[t.ticker].push({ date: t.date, type: t.type, shares: +t.shares });
    });
    Object.values(tickerTimeline).forEach(arr =>
      arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    );

    const sharesAt = (ticker, dateStr) => {
      const rows = tickerTimeline[ticker] || [];
      let s = 0;
      for (const r of rows) {
        if (r.date > dateStr) break;
        if (r.type === 'buy' || r.type === 'grant') s += r.shares;
        // القصّ عند كل بيع لا في النهاية — «شراء 100 → بيع 150 → شراء 30»
        // تساوي 30 سهماً لا صفراً (نفس منهج walkWAC في utils.js)
        else if (r.type === 'sell') s = Math.max(0, s - (+r.shares || 0));
      }
      return Math.max(0, s);
    };

    // تاريخ سجل التوزيع بالمللي ثانية (منتصف الليل محلياً) — يطابق dividends.js
    const tsOf = ds => {
      const p = (typeof parseDateLocal === 'function') ? parseDateLocal(ds) : null;
      return p ? p.getTime() : new Date(ds).getTime();
    };

    let total = 0;
    const staleList = [];
    holdings.forEach(h => {
      if (+h.shares <= 0) return;
      const tickerDivs = divRows
        .filter(d => d.ticker === h.ticker)
        .sort((a, b) => divDate(a).localeCompare(divDate(b)));
      if (!tickerDivs.length) return;

      // بناء سلسلة الـ DPS لكل دفعة (المبلغ ÷ الأسهم وقت الدفعة) بالترتيب الزمني
      // نحتفظ بالتاريخ مع كل نقطة — لازم لنافذة الاثني عشر شهراً
      const dpsSeries = [];
      let lastValidDate = null;
      for (let i = 0; i < tickerDivs.length; i++) {
        const dt = divDate(tickerDivs[i]);
        const sh = sharesAt(h.ticker, dt);
        if (sh >= 0.001) {
          dpsSeries.push({ dps: +tickerDivs[i].amount / sh, date: dt });
          lastValidDate = dt;
        }
      }
      // م.22 — إعادة بيان المنحة قبل جمع نافذة الاثني عشر شهراً.
      // بلا هذا: البسط بأساس ما قبل المنحة والمقام بأسهم اليوم ⇒ سابقة
      // الرياض 1:3 تعطي 1,866 ر.س بدل 1,400 (+33%) على دخلٍ لم يتغيّر.
      applyGrantRestatement(dpsSeries, grantRestateFactors(
        (tickerTimeline[h.ticker] || []).filter(x => x.type === 'grant'),
        d => sharesAt(h.ticker, d)));

      // L-3: use median inter-dividend gap for frequency — robust to skipped dividends
      // (يُحسب قبل الاحتياطي لأن الاحتياطي يحتاجه لتفادي مضاعفة الدخل)
      let freq = 1;
      // AUDIT-FIX 2026-08-22: التعريف الموحَّد في utils.js — بحارس يمنع قلب
      // موزّع سنوي إلى «شهري» بسبب تسجيلين متقاربين.
      freq = inferDividendFrequency(tickerDivs.map(divDate));

      // DPS السنوي المتوقع = مجموع DPS آخر 12 شهراً (قرار المالك 2026-08).
      // كان: دفعة واحدة (وسيط أو آخر دفعة) × الدورية — وهو يفترض تساوي الدفعات،
      // فيضخّم النمط السعودي الشائع (مرحلي صغير + ختامي كبير) حتى +129%، ويتذبذب
      // ±20% لنفس السهم حسب شهر فتح الصفحة رغم ثبات سياسة الشركة. مجموع الاثني
      // عشر شهراً يعطي الرقم نفسه في كل الحالات بلا فروع اتجاه.
      // احتياطي للموزّع السنوي الذي دفعته الأخيرة تجاوزت 12 شهراً ولمّا يُعدّ منقطعاً:
      // مجموع آخر دورة كاملة (آخر freq دفعة).
      // ⚠️ هذا المنطق مطابق حرفياً لـ _projectedAnnualIncome في js/dividends.js —
      // أي تعديل هنا يجب أن يُطبَّق هناك (وإلا اختلف رقم اللوحة عن صفحة الأرباح).
      let dps, lastDivDate;
      if (dpsSeries.length) {
        // AUDIT-FIX (2026-08-18): النافذة كانت مفتوحة من الأعلى، فتوزيع مُعلَن
        // ومُسجَّل بتاريخ صرف قادم (يُسجَّل في أغسطس ويُصرف في سبتمبر) كان يدخل
        // «آخر 12 شهراً» قبل أن يُستلَم — أي 13 شهراً من التوزيعات في نافذة 12.
        // النافذة الآن مغلقة عند اليوم، والمُعلَن القادم يُعرض على حدة.
        const cutoff = Date.now() - 365 * 86400000, nowTs = Date.now();
        const ttmDps = dpsSeries
          .filter(p => { const t = tsOf(p.date); return t >= cutoff && t <= nowTs; })
          .reduce((s, p) => s + p.dps, 0);
        if (ttmDps > 0) {
          dps = ttmDps / freq;              // يُضرب بـ freq لاحقاً → المجموع كما هو
        } else {
          dps = dpsSeries.slice(-freq).reduce((s, p) => s + p.dps, 0) / freq;
        }
        lastDivDate = lastValidDate;
      } else {
        // اشترى السهم بعد كل توزيعاته المسجّلة — نقدّر من التوزيعات المسجّلة (لا
        // الإجمالي الكلي الذي يضخّم بتراكم السنوات).
        // AUDIT-FIX (يطابق dividends.js): قسمة «مجموع آخر سنة ÷ freq» تفترض السنة
        // مكتملة — سنة جزئية كانت تُقسم على freq كاملة فينخفض DPS. الحل: آخر سنة
        // مكتملة (< السنة الجارية) إن وُجدت؛ وإلا تُسنّى الدفعات الجزئية بعددها
        // الفعلي: DPS للفترة = المجموع ÷ الأسهم ÷ عدد الدفعات.
        const lastDiv = tickerDivs[tickerDivs.length - 1];
        lastDivDate   = divDate(lastDiv);
        const curYear = new Date().getFullYear();
        const yearOf  = d => +d.year || new Date(divDate(d)).getFullYear();
        const completeYears = tickerDivs.map(yearOf).filter(y => y < curYear);
        if (completeYears.length) {
          const lastFullYear  = Math.max(...completeYears);
          const fullYearTotal = tickerDivs
            .filter(d => yearOf(d) === lastFullYear)
            .reduce((s, d) => s + +d.amount, 0);
          dps = fullYearTotal > 0
            ? fullYearTotal / +h.shares / freq
            : +lastDiv.amount / +h.shares;
        } else {
          const lastYear     = Math.max(...tickerDivs.map(yearOf));
          const partialDivs  = tickerDivs.filter(d => yearOf(d) === lastYear);
          const partialTotal = partialDivs.reduce((s, d) => s + +d.amount, 0);
          dps = partialTotal > 0 && partialDivs.length
            ? partialTotal / +h.shares / partialDivs.length
            : +lastDiv.amount / +h.shares;
        }
      }
      if (!(dps > 0)) return;

      const projected = dps * freq * +h.shares;

      // AUDIT-FIX (2026-08): «الدخل المتوقع» كان يُسقط دخلاً كاملاً لسهم توقّف عن
      // التوزيع منذ سنوات. سهم قطع توزيعه = «فشل بوابة الاستدامة» في الدستور
      // (§4 الفلتر 1) فلا يجوز بناء دخل تقاعدي متوقَّع عليه. القاعدة: تجاوز 1.75
      // ضعف دورته المعتادة بلا توزيع = فوّت دورة كاملة مع مهلة → يُستبعد من
      // المجموع ويُعلَن صراحةً (§8: لا إسقاط صامت).
      const daysSinceDiv = lastDivDate
        ? Math.floor((Date.now() - tsOf(lastDivDate)) / 86400000)
        : null;
      const staleAfter = dividendStaleDays(freq);
      const isStale    = daysSinceDiv != null && daysSinceDiv > staleAfter;

      if (isStale) {
        staleList.push({ ticker: h.ticker, name: h.name || h.ticker, projected, daysSinceDiv, lastDivDate });
        return;                       // لا يدخل fwdByTicker ولا المجموع
      }

      fwdByTicker[h.ticker] = projected;
      total += projected;
    });
    _fwdStale = staleList;
    return total;
  })();
  const divYieldFwd = costBasis > 0 ? fwdProjected / costBasis * 100 : 0;

  // ── XIRR — العائد الداخلي السنوي الحقيقي ─────────────────
  // التدفقات: شراء = خروج (−)، بيع = دخول (+)، توزيعات = دخول (+)
  // القيمة النهائية = القيمة السوقية للأسهم اليوم (كأنها بيعت)
  const cashflows = [];
  txRows.forEach(t => {
    if (t.type === 'buy')  cashflows.push({ date: new Date(t.date), amount: -(+t.total) });
    if (t.type === 'sell') cashflows.push({ date: new Date(t.date), amount: +(+t.total) });
    // grant: total=0 — لا تدفّق نقدي
  });
  divRows.forEach(d => {
    // AUDIT-FIX 2026-08-21 (#44): تعريف واحد لتاريخ التوزيعة داخل XIRR عبر المشروع
    // كله — utils.js/dividendFlowDate. يشمل: قراءة محلية، احتياطي أول الشهر من
    // سنة/شهر، إسقاط الشهر المجهول بلا تقدير، وإسقاط التوزيع المُعلَن غير المصروف.
    const dt = dividendFlowDate(d, _today);
    if (dt) cashflows.push({ date: dt, amount: +d.amount });
  });
  if (totalValue > 0) cashflows.push({ date: new Date(), amount: totalValue });
  const xirr = computeXIRR(cashflows);

  // ── تركيز السهم الواحد — مخاطرة مباشرة على محفظة التقاعد ──────
  // أكبر مركز كنسبة % من قيمة الأسهم، ووزن أكبر 5 مراكز مجتمعة. بيانات holdings صحيحة قطعاً.
  let largestHolding = null;
  holdings.forEach(h => {
    const v = +h.shares * +h.current_price;
    if (v > 0 && (!largestHolding || v > largestHolding.v)) largestHolding = { v, ticker: h.ticker, name: h.name || '' };
  });
  const posVals = holdings.map(h => +h.shares * +h.current_price).filter(v => v > 0).sort((a, b) => b - a);
  const concTotal   = posVals.reduce((s, v) => s + v, 0);
  const largestPosPct = concTotal > 0 ? posVals[0] / concTotal * 100 : 0;
  const top5Pct       = concTotal > 0 ? posVals.slice(0, 5).reduce((s, v) => s + v, 0) / concTotal * 100 : 0;

  // ── معدل المساهمة الصافي الشهري — محرّك الوصول لـ FIRE ────────
  // إيداع − سحب خلال آخر 12 شهراً ÷ 12. تدفّق فعلي مسجّل في cashflow_entries.
  let dep12 = 0, wd12 = 0, hasCf12 = false;
  cfRows.forEach(e => {
    if (!e.date) return;
    const dt = new Date(e.date);
    if (dt > _yearAgo && dt <= _today) {   // نصف مفتوحة — نفس نافذة TTM أعلاه
      hasCf12 = true;
      if (e.type === 'deposit')          dep12 += +e.amount;
      else if (e.type === 'withdrawal')  wd12  += +e.amount;
    }
  });
  const netContrib12  = dep12 - wd12;
  const monthlyContrib = netContrib12 / 12;

  // ── نمو الدخل التوزيعي السنوي (CAGR) — على السنوات المكتملة فقط ──
  // إجمالي المستلم لكل سنة تقويمية كاملة (نستثني السنة الجارية الجزئية).
  // AUDIT-FIX 2026-08: نستثني أيضاً سنة أول شراء — سنة جزئية (بدأت المحفظة في
  // منتصفها) كانت تُحسب كسنة كاملة فيتضخّم معدل النمو زوراً.
  const _firstBuyDate = txRows.filter(t => t.type === 'buy' && t.date).map(t => t.date).sort()[0] || null;
  const _firstBuyYear = _firstBuyDate ? +String(_firstBuyDate).slice(0, 4) : null;
  const divByYear = {};
  divRows.forEach(d => { if (d.year) divByYear[d.year] = (divByYear[d.year] || 0) + +d.amount; });
  const fullDivYears = Object.keys(divByYear).map(Number)
    .filter(y => y < yr && y !== _firstBuyYear && divByYear[y] > 0)
    .sort((a, b) => a - b);
  let divCagr = null, divCagrFirstY = null, divCagrLastY = null;
  if (fullDivYears.length >= 2) {
    divCagrFirstY = fullDivYears[0];
    divCagrLastY  = fullDivYears[fullDivYears.length - 1];
    const span = divCagrLastY - divCagrFirstY;
    if (span > 0 && divByYear[divCagrFirstY] > 0) {
      divCagr = (Math.pow(divByYear[divCagrLastY] / divByYear[divCagrFirstY], 1 / span) - 1) * 100;
    }
  }

  // ── سياق نضج البيانات — لتحديد المؤشرات المبكّرة على عمر المحفظة ──
  // (_firstBuyDate محسوب أعلاه قبل CAGR)
  const _mAgeMonths   = (typeof portfolioAgeMonths === 'function') ? portfolioAgeMonths(_firstBuyDate) : 0;
  const _divCalYears  = Object.keys(divByYear).filter(y => +divByYear[y] > 0).length;
  const _mDivYears    = Math.min(_divCalYears, Math.max(1, Math.ceil(_mAgeMonths / 12))); // مقيّد بعمر المحفظة
  const _maturityCtx  = {
    ageMonths:  _mAgeMonths,
    snapshots:  _nwCount,   // AUDIT-FIX 2026-08: count حقيقي بدل طول نافذة limit
    // AUDIT-FIX (2026-08-21): كانت `_mDivYears` أرضيّتها 1 (بسبب max(1,…) في
    // السقف)، فشرط شارة «🌱 مبكّر» في assessMetricMaturity (`divYears < 1`) لم
    // يكن يتحقّق أبداً — الشارة معطّلة بنيوياً في اللوحة بينما تعمل في صفحتَي
    // الأرباح والأداء. الدورة السنوية لا تكتمل قبل أن يبلغ عمر المحفظة 12 شهراً.
    divYears:   divRows.length ? (_mAgeMonths >= 12 ? _mDivYears : 0) : 0,
    divCount:   divRows.length,
    stockCount: holdings.length,
  };

  window._ds = {
    yr,
    mCtx: _maturityCtx,
    totalInvested:   totalBuys - totalSells,
    totalBuys,
    totalSells,
    totalCommission, totalVAT,
    realizedPnL,
    totalDivAll,     yearDiv,     yearDivHeld,
    divYieldYear,    divYieldAll,
    divYieldAnn, divYieldYOC, divYieldMarket, divYieldFwd,
    fwdProjected, fwdByTicker, fwdStale: _fwdStale, ttmDiv, xirr,
    totalValue, costBasis,
    annualizedYearDiv, daysElapsed, daysInYear, denomAnn,
    annBasis: _annBasis, divDeclaredPending: _divDeclaredPending,
    grantMap, totalGrantShares, totalGrantTickers,
    latestNW:        _nwPick ? +_nwPick.total_value : null,
    latestNWDate:    _nwPick ? _nwPick.date : null,
    latestNWIsAuto:  _nwIsAuto,   // لقطة تلقائية جزئية (أسهم+نقد+عقار) لا صافي ثروة كامل
    reTotal:         reRows.filter(p => p.status !== 'sold').reduce((s, p) => s + +p.current_value, 0),
    cashDeposited:   cfRows.filter(e => e.type === 'deposit'    && new Date(e.date).getFullYear() === yr).reduce((s,e) => s + +e.amount, 0),
    cashWithdrawn:   cfRows.filter(e => e.type === 'withdrawal' && new Date(e.date).getFullYear() === yr).reduce((s,e) => s + +e.amount, 0),
    stockCount:      holdings.length,
    sectorCount,     topSector, bottomSector,
    largestPosPct, top5Pct, largestHolding,
    monthlyContrib, netContrib12, hasCf12,
    divCagr, divCagrFirstY, divCagrLastY,
  };
}

async function reloadHoldings() {
  const [{ data: hData }, { data: stData }, { data: taskData }] = await Promise.all([
    supabaseClient.from('holdings').select('*').order('ticker'),
    supabaseClient.from('stock_targets').select('ticker, target_pct, entry_price, exit_price'),
    supabaseClient.from('portfolio_tasks').select('ticker, accumulate_at, trim_from, liquidate_above').eq('status', 'active'),
  ]);
  stockTargets = {};
  stockZones   = {};
  trimZonesMap = {};
  try {
    const _z2 = await loadUserSetting(ZERO_TARGETS_KEY);
    zeroTargets = new Set(Array.isArray(_z2) ? _z2 : []);
  } catch (_) { /* الموجود يبقى */ }
  (stData || []).forEach(r => {
    stockTargets[r.ticker] = +r.target_pct;
    stockZones[r.ticker]   = { entry_price: r.entry_price ?? null, exit_price: r.exit_price ?? null };
  });
  (taskData || []).forEach(t => {
    if (!t.ticker) return;
    if (!stockZones[t.ticker]) stockZones[t.ticker] = { entry_price: null, exit_price: null };
    if (t.accumulate_at   != null) stockZones[t.ticker].entry_price = +t.accumulate_at;
    if (t.liquidate_above != null) stockZones[t.ticker].exit_price  = +t.liquidate_above;
    if (t.trim_from       != null && !trimZonesMap[t.ticker]) trimZonesMap[t.ticker] = +t.trim_from;
  });
  holdings = (hData || []).map(h => {
    if (stockTargets[h.ticker] !== undefined) h.target_weight = stockTargets[h.ticker];
    return h;
  });
  _seedPriceTimestampsFromDB();   // AUDIT-FIX 2026-08: نفس بذر loadAllData بعد إعادة التحميل
  renderPortfolioHealthCard(); renderDiversificationCard();
}

// ── Tab: طريقة حساب رأس المال ────────────────────────────────
function switchInvestedTab(tab) {
  investedTab = tab;
  document.getElementById('tab-invested-net')?.classList.toggle('mini-tab-active', tab === 'net');
  document.getElementById('tab-invested-wac')?.classList.toggle('mini-tab-active', tab === 'wac');
  const s         = window._ds || {};
  const costBasis = holdings.reduce((a, h) => a + +h.shares * +h.avg_price, 0);
  if (tab === 'net') {
    setText('stat-invested-label', 'صافي رأس المال المنشغل');
    setText('stat-invested',       formatSAR(s.totalInvested || 0));
    setText('stat-invested-sub',   'إجمالي شراء − إجمالي بيع');
  } else {
    setText('stat-invested-label', 'تكلفة المحفظة (WAC)');
    setText('stat-invested',       formatSAR(costBasis));
    setText('stat-invested-sub',   'أسهم × متوسط سعر الشراء');
  }
}

// ── Tab: طريقة حساب العائد التوزيعي ─────────────────────────
function switchYieldTab(tab) {
  yieldTab = tab;
  const s = window._ds || {};
  ['ann','yoc','market','fwd'].forEach(t => {
    document.getElementById('tab-yield-' + t)?.classList.toggle('mini-tab-active', t === tab);
  });

  const yr = s.yr || new Date().getFullYear();

  if (tab === 'ann') {
    setText('yield-tab-label', 'العائد المُسنوى — السنة الجارية');
    // AUDIT-FIX 2026-08: null = لا تكلفة محفظة (مقام صفر) → «—» بدل رقم مضلل
    setText('stat-div-yield',  s.divYieldAnn != null ? s.divYieldAnn.toFixed(2) + '%' : '—');
    // AUDIT-FIX (2026-07): قبل يوم 180 الحساب فعلياً TTM (لا استقراء خطي) —
    // السطر التوضيحي يطابق المعادلة المستخدمة في الحالتين.
    // الشرط هو الأساس المُستخدَم فعلاً لا اليوم وحده — كان السطر يقول
    // «استقراء» بينما الحساب TTM لأن دورية أبطأ موزّع لم تكتمل بعد.
    const note = s.annBasis === 'extrapolated'
      ? `أرباح الحيازات القائمة ${formatSAR(s.yearDivHeld||0)} × (${s.daysInYear}÷${s.daysElapsed}) ÷ تكلفة المحفظة (WAC)`
      : `لا استقراء (يوم ${s.daysElapsed||0}، ودورة أبطأ موزّع لم تكتمل) — TTM ${formatSAR(s.ttmDiv||0)} ÷ التكلفة`;
    setText('stat-div-yield-sub', note);
  } else if (tab === 'yoc') {
    setText('yield-tab-label', 'العائد على التكلفة (YOC)');
    setText('stat-div-yield',  (s.divYieldYOC || 0).toFixed(2) + '%');
    setText('stat-div-yield-sub', `TTM (${formatSAR(s.ttmDiv||0)}) ÷ تكلفة الشراء`);
  } else if (tab === 'fwd') {
    setText('yield-tab-label', '▶ العائد المتوقع (Forward) — على التكلفة');
    setText('stat-div-yield',  (s.divYieldFwd || 0).toFixed(2) + '%');
    setText('stat-div-yield-sub', `${formatSAR(s.fwdProjected||0)}/سنة ≈ ${formatSAR((s.fwdProjected||0)/12)}/شهر ÷ التكلفة (WAC)`);
  } else {
    setText('yield-tab-label', 'العائد السوقي — التوزيع الجاري');
    setText('stat-div-yield',  (s.divYieldMarket || 0).toFixed(2) + '%');
    // AUDIT-FIX: الحساب فعلياً TTM ÷ القيمة السوقية (لا «أرباح السنة مُسنواة») — صُحّح النص ليطابق الكود
    setText('stat-div-yield-sub', `TTM (${formatSAR(s.ttmDiv||0)}) ÷ القيمة السوقية الحالية`);
  }

  // لون حسب القيمة
  const val = tab === 'ann'    ? (s.divYieldAnn||0)
            : tab === 'yoc'    ? (s.divYieldYOC||0)
            : tab === 'fwd'    ? (s.divYieldFwd||0)
            : (s.divYieldMarket||0);
  const el = document.getElementById('stat-div-yield');
  if (el) {
    el.className = 'value num ' + (val >= 5 ? 'text-success' : val >= 3 ? 'text-accent' : 'text-muted');
    // شارة نضج: العائد التوزيعي مبكّر قبل اكتمال دورة سنة أو بلا توزيعات
    const _mY = assessMetricMaturity('divYield', s.mCtx);
    if (_mY.level && _mY.level !== 'reliable') el.innerHTML = el.textContent + maturityBadge(_mY.level, _mY.reason);
  }
}

// ── شارات موثوقية الكروت ──────────────────────────────────────
// 🟢 عالية = رقم محسوب مباشرة من بياناتك الفعلية (لا افتراضات)
// 🟡 متوسطة = يعتمد على افتراض (سعر محدّث / نسبة سحب / تقدير زمني)
// 🔵 إرشادي = مؤشر توجيهي يتغيّر مع الأسعار والأهداف
const _RELIABILITY = {
  high:   { dot: '🟢', label: 'موثوقية عالية — رقم محسوب مباشرة من بياناتك الفعلية' },
  medium: { dot: '🟡', label: 'موثوقية متوسطة — يعتمد على افتراض (سعر محدّث / نسبة سحب / تقدير زمني)' },
  low:    { dot: '🔵', label: 'إرشادي للتوجيه — مؤشر يتغيّر مع الأسعار والأهداف' },
};
const _CARD_RELIABILITY = {
  // 🟢 حقائق من بياناتك
  'total-value': 'high', 'portfolio-cash': 'high', 'realestate': 'high', 'invested': 'high',
  'capital': 'high', 'pnl': 'high', 'realized': 'high', 'total-return': 'high', 'total-div': 'high', 'year-div': 'high',
  'cashflow': 'high', 'composition': 'high', 'costs': 'high',
  'total-assets': 'high', 'concentration': 'high', 'contribution': 'high',
  // 🟡 تعتمد افتراضات
  // AUDIT-FIX 2026-08: fwd-income إسقاط مستقبلي (دورية مستنتجة + آخر دفعة) لا حقيقة مسجّلة
  'fwd-income': 'medium',
  'networth': 'medium', 'div-yield': 'medium', 'xirr': 'medium', 'passive-cover': 'medium',
  'div-growth': 'medium', 'retirement': 'medium', 'breakeven': 'medium',
  // 🔵 إرشادي للتوجيه
  'top-sector': 'low', 'bot-sector': 'low', 'allocation': 'low',
};
function applyReliabilityBadges() {
  document.querySelectorAll('.info-btn').forEach(btn => {
    const m = (btn.getAttribute('onclick') || '').match(/showCardInfo\('([^']+)'\)/);
    if (!m) return;
    const tier = _CARD_RELIABILITY[m[1]];
    if (!tier) return;
    const card = btn.closest('.stat-card, .card');
    if (!card) return;
    const labelEl = card.querySelector('.label, .section-title');
    if (!labelEl || labelEl.querySelector('.reliability-badge')) return;
    const r = _RELIABILITY[tier];
    const span = document.createElement('span');
    span.className = 'reliability-badge';
    span.textContent = r.dot;
    span.title = r.label;
    span.style.cssText = 'font-size:.62rem;margin-inline-start:5px;cursor:help;vertical-align:middle';
    labelEl.appendChild(span);
  });
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
  const s          = window._ds || {};
  const totalValue = holdings.reduce((a, h) => a + +h.shares * +h.current_price, 0);
  const costBasis  = holdings.reduce((a, h) => a + +h.shares * +h.avg_price,     0);
  const pnl        = totalValue - costBasis;
  const pnlPct     = costBasis > 0 ? pnl / costBasis * 100 : 0;

  const totalWithCash = totalValue + portfolioCash;
  setText('stat-total-value', formatSAR(totalWithCash));
  const tvSub = g('stat-total-value-sub');
  if (tvSub) tvSub.textContent = portfolioCash > 0
    ? `أسهم ${formatSAR(totalValue)} + نقد ${formatSAR(portfolioCash)}`
    : 'أسهم × السعر الحالي';

  // نقد المحفظة
  setText('stat-portfolio-cash', portfolioCash > 0 ? formatSAR(portfolioCash) : '—');
  const cashSubEl = g('stat-portfolio-cash-sub');
  if (cashSubEl) cashSubEl.textContent = cashUpdatedAt
    ? 'آخر تحديث: ' + formatDate(cashUpdatedAt.split('T')[0])
    : 'انقر للإدخال';

  // رأس المال — يعتمد على التاب المختار
  switchInvestedTab(investedTab);

  const pnlEl    = g('stat-pnl');
  const pnlPctEl = g('stat-pnl-pct');
  if (pnlEl)    { pnlEl.textContent = formatSAR(pnl, true); pnlEl.className = 'value num ' + (pnl >= 0 ? 'text-success' : 'text-danger'); }
  if (pnlPctEl) { pnlPctEl.textContent = (pnl >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%'; pnlPctEl.className = 'sub ' + (pnl >= 0 ? 'text-success' : 'text-danger'); }

  // ── إجمالي **الربح** منذ البداية ───────────────────────────────
  // الربح الكلي = (غير محقق) + (محقق من البيع) + (كل التوزيعات)
  //            = القيمة السوقية + إجمالي المبيعات + إجمالي التوزيعات − إجمالي المشتريات
  //
  // ⚠️ **ليست «عائداً»، وكانت تُسمّى كذلك.** النسبة هنا = الربح ÷ ما اشتريتَ
  // به، وهي تقيس **حجم** الربح لا **أداء** المحفظة: ريالٌ أُودع الشهر الماضي
  // لم تُتَح له فرصة الربح التي أُتيحت لريالٍ أُودع قبل ثلاث سنوات، وجمعهما في
  // مقامٍ واحد يخلط الربح بالإيداع. ومع ضخٍّ يعادل 42% من المحفظة سنوياً (م.8)
  // تنزل النسبة كلما ضخخت أكثر — ولو كان أداء المحفظة ممتازاً.
  //
  // قياس الأداء (TWR وXIRR وعائد كل سنة) في تبويب «📈 العائد بالنسبة» في
  // الأداء التاريخي. البطاقة تشير إليه صراحةً، ولا تنافسه برقمٍ ثانٍ.
  const trEl    = g('stat-total-return');
  const trSubEl = g('stat-total-return-sub');
  if (trEl) {
    const totalBuys = s.totalBuys || 0;
    if (totalBuys > 0) {
      const totalProfit = totalValue + (s.totalSells || 0) + (s.totalDivAll || 0) - totalBuys;
      const totalRetPct = totalProfit / totalBuys * 100;
      trEl.textContent = formatSAR(totalProfit, true) + ` (${totalProfit >= 0 ? '+' : ''}${totalRetPct.toFixed(1)}%)`;
      trEl.className = 'value num ' + (totalProfit >= 0 ? 'text-success' : 'text-danger');
      if (trSubEl) trSubEl.textContent = `الربح ÷ ما اشتريتَ به — حجمُ ربح لا قياسُ أداء`;
    } else {
      trEl.textContent = '—';
      trEl.className = 'value num text-muted';
      if (trSubEl) trSubEl.textContent = 'يحتاج معاملات شراء مسجّلة';
    }
  }

  // AUDIT-FIX 2026-08: تُفضَّل أحدث لقطة يدوية؛ إن لم توجد إلا التلقائية (الجزئية:
  // أسهم+نقد+عقار فقط) تُعرض موسومة حتى لا تُقرأ كصافي ثروة كامل
  setText('stat-net-worth', s.latestNW != null ? formatSAR(s.latestNW) : '—');
  setText('stat-nw-date',   s.latestNWDate
    ? formatDate(s.latestNWDate) + (s.latestNWIsAuto ? ' (لقطة تلقائية جزئية)' : '')
    : 'لا توجد لقطة');

  setText('stat-total-div',   formatSAR(s.totalDivAll || 0));
  setText('stat-year-div',    formatSAR(s.yearDiv     || 0));
  setText('stat-year-label',  'أرباح ' + (s.yr || new Date().getFullYear()));
  switchYieldTab(yieldTab);
  setText('stat-realestate',  formatSAR(s.reTotal || 0));
  const cashNet = (s.cashDeposited || 0) - (s.cashWithdrawn || 0);
  const cashEl = g('stat-cash-actual');
  if (cashEl) { cashEl.textContent = formatSAR(cashNet, true); cashEl.className = 'value num ' + (cashNet >= 0 ? 'text-success' : 'text-danger'); }
  setText('stat-cash-sub', `إيداع ${formatSAR(s.cashDeposited||0)} / سحب ${formatSAR(s.cashWithdrawn||0)}`);
  // نصيب الإيداعات من إجمالي الحركة (إيداع + سحب) — 100% = لا سحوبات هذا العام
  const cashMoved = (s.cashDeposited || 0) + (s.cashWithdrawn || 0);
  const cashRatio = cashMoved > 0 ? (s.cashDeposited || 0) / cashMoved * 100 : 0;
  const fill = g('stat-cash-fill');
  if (fill) fill.style.width = cashRatio.toFixed(1) + '%';
  const cashMeter = g('stat-cash-meter');
  if (cashMeter) cashMeter.dataset.state = cashNet >= 0 ? 'good' : 'bad';
  setText('stat-cash-ratio', cashMoved > 0 ? cashRatio.toFixed(0) + '%' : '—');
  const cashTag = g('stat-cash-tag');
  if (cashTag) cashTag.innerHTML = tagHtml(cashNet >= 0 ? '✅' : '⚠️',
    cashNet >= 0 ? 'تدفق داخل صافٍ' : 'تدفق خارج صافٍ', cashNet >= 0 ? 'good' : 'bad');

  // ── صف 5: الأداء السنوي والدخل ────────────────────────────
  const xirrEl = g('stat-xirr');
  if (xirrEl) {
    if (s.xirr == null) {
      xirrEl.textContent = '—';
      xirrEl.className = 'value num text-muted';
      setText('stat-xirr-sub', 'يحتاج معاملات شراء وبيع/توزيعات');
    } else {
      const _m = assessMetricMaturity('return', s.mCtx);
      xirrEl.innerHTML = (s.xirr >= 0 ? '+' : '') + s.xirr.toFixed(2) + '%' + maturityBadge(_m.level, _m.reason);
      xirrEl.className = 'value num ' + (s.xirr >= 0 ? 'text-success' : 'text-danger');
      // ── تحذير جودة البيانات: أسعار قديمة تُضعف دقة XIRR ───
      if (hasStalePrice()) {
        setText('stat-xirr-sub', '⚠️ بعض الأسعار قديمة — الدقة منخفضة');
        const subEl = g('stat-xirr-sub');
        if (subEl) subEl.style.color = 'var(--danger)';
      } else {
        setText('stat-xirr-sub', 'سنوياً — يشمل التوقيت والتوزيعات');
        const subEl = g('stat-xirr-sub');
        if (subEl) subEl.style.color = '';
      }
    }
  }

  // الدخل التوزيعي المتوقع — Forward Projected (الأدق للمحافظ النامية)
  const fwdIncome  = s.fwdProjected || 0;
  const ttmIncome  = s.ttmDiv || 0;
  setText('stat-fwd-income', formatSAR(fwdIncome || ttmIncome));
  const fwdYield = costBasis > 0 ? (fwdIncome || ttmIncome) / costBasis * 100 : 0;
  const fwdNote  = fwdIncome > 0
    ? `Forward · ≈ ${formatSAR(fwdIncome/12)}/شهر · ${fwdYield.toFixed(2)}%`
    : `TTM · ≈ ${formatSAR(ttmIncome/12)}/شهر · ${fwdYield.toFixed(2)}%`;
  setText('stat-fwd-income-sub', fwdNote);

  // إجمالي الأصول الاستثمارية
  const sukukTotal  = getSukukActiveTotal();
  const totalAssets = totalValue + portfolioCash + (s.reTotal || 0) + sukukTotal;
  setText('stat-total-assets', formatSAR(totalAssets));

  // تغطية الدخل السلبي للمصاريف
  const goal = getRetirementGoal();
  const coverEl = g('stat-passive-cover');
  if (coverEl) {
    if (goal.monthly > 0) {
      // AUDIT-FIX 2026-08: نفس fallback كرت الدخل (Forward ثم TTM) — كانت التغطية
      // تظهر 0% رغم وجود دخل TTM فعلي عند غياب Forward
      const monthlyIncome = (fwdIncome || ttmIncome) / 12;
      const coverPct = goal.monthly > 0 ? monthlyIncome / goal.monthly * 100 : 0;
      coverEl.textContent = coverPct.toFixed(1) + '%';
      coverEl.className = 'value num ' + (coverPct >= 100 ? 'text-success' : coverPct >= 25 ? 'text-accent' : 'text-muted');
      setText('stat-passive-cover-sub', `دخل ${formatSAR(monthlyIncome)}/شهر مقابل مصاريف ${formatSAR(goal.monthly)}`);
      setHtml('stat-passive-cover-tag', coverPct >= 100
        ? tagHtml('✅', 'الدخل يغطّي المصاريف', 'good')
        : coverPct >= 25 ? tagHtml('⏳', 'تغطية جزئية', 'warn')
        : tagHtml('🔴', 'تغطية ضعيفة', 'bad'));
    } else {
      coverEl.textContent = '—';
      coverEl.className = 'value num text-muted';
      setText('stat-passive-cover-sub', 'أدخل مصاريفك في بطاقة هدف التقاعد');
      setHtml('stat-passive-cover-tag', '');
    }
  }

  // ── صف 6: التركيز والنمو ──────────────────────────────────
  // تركيز السهم الواحد
  const concEl = g('stat-concentration');
  if (concEl) {
    if (s.largestHolding && s.largestPosPct > 0) {
      concEl.textContent = s.largestPosPct.toFixed(1) + '%';
      // AUDIT-FIX (2026-08-21): كانت العتبات عامة (خطر ≥25%، مرتفع ≥15%) فتصف
      // بـ«تركيز صحي» وزناً يسمّيه دستورك كسراً للسقف. النظام القائم على قواعد
      // يفقد قيمته إن خالفت واجهته قاعدته، فالعتبات دستورية.
      // v3.0 م.25: السقف من **فئة** السهم لا رقم واحد. البطاقة تعرض «أكبر
      // مركز» بلا معرفة فئته هنا، فتُقاس على سقف أعلى فئة (أ) — وهو الحدّ
      // الذي لا يجوز تجاوزه لأي سهم كائناً ما كان. الفئة الحقيقية وسقفها
      // يظهران في محرّك القرار حيث تُتّخذ القرارات.
      const _capHard = CAT.A.cap + CAP_BUFFER, _capNear = CAT.A.cap - 2;
      concEl.className = 'value num ' + (s.largestPosPct > _capHard ? 'text-danger'
        : s.largestPosPct > _capNear ? 'text-accent' : 'text-success');
      const nm = s.largestHolding.name ? `${s.largestHolding.ticker} — ${s.largestHolding.name}` : s.largestHolding.ticker;
      setText('stat-concentration-name', 'أكبر مركز: ' + nm);
      setText('stat-concentration-sub', `أكبر 5 مراكز: ${s.top5Pct.toFixed(1)}% من قيمة الأسهم`);
      setHtml('stat-concentration-tag', s.largestPosPct > _capHard
        ? tagHtml('🔴', `فوق أعلى سقف فئة (${CAT.A.cap}%)`, 'bad')
        : s.largestPosPct > _capNear
          ? tagHtml('⚠️', `يقترب من أعلى سقف فئة (${CAT.A.cap}%)`, 'warn')
          : tagHtml('✅', 'ضمن السقف الدستوري', 'good'));
    } else {
      concEl.textContent = '—';
      concEl.className = 'value num text-muted';
      setText('stat-concentration-name', 'لا توجد حيازات');
      setText('stat-concentration-sub', '');
      setHtml('stat-concentration-tag', '');
    }
  }

  // معدل المساهمة الصافي الشهري
  const contribEl = g('stat-contribution');
  if (contribEl) {
    if (s.hasCf12) {
      contribEl.textContent = formatSAR(s.monthlyContrib);
      contribEl.className = 'value num ' + (s.monthlyContrib > 0 ? 'text-success' : s.monthlyContrib < 0 ? 'text-danger' : 'text-muted');
      setText('stat-contribution-sub', `صافي ${formatSAR(s.netContrib12)} خلال آخر 12 شهراً ÷ 12`);
    } else {
      contribEl.textContent = '—';
      contribEl.className = 'value num text-muted';
      setText('stat-contribution-sub', 'سجّل إيداعاتك وسحوباتك في صفحة التدفقات النقدية');
    }
  }

  // نمو الدخل التوزيعي السنوي (CAGR)
  const dgrEl = g('stat-div-growth');
  if (dgrEl) {
    if (s.divCagr != null) {
      dgrEl.textContent = (s.divCagr >= 0 ? '+' : '') + s.divCagr.toFixed(1) + '%';
      dgrEl.className = 'value num ' + (s.divCagr >= 0 ? 'text-success' : 'text-danger');
      setText('stat-div-growth-sub', `متوسط النمو السنوي لدخلك التوزيعي (${s.divCagrFirstY}→${s.divCagrLastY})`);
    } else {
      dgrEl.textContent = '—';
      dgrEl.className = 'value num text-muted';
      setText('stat-div-growth-sub', 'يحتاج توزيعات في سنتين مكتملتين على الأقل');
    }
  }

  renderInsights(s, totalValue, costBasis, pnl, pnlPct);
}

// ── نافذة تفاصيل السهم عند الضغط على تنبيه إعادة التوازن ──────────────
function showStockAlertDetail(ticker) {
  const h          = holdings.find(x => x.ticker === ticker);
  const isPlanned  = !h && plannedTickers[ticker] != null;
  const name       = h?.name || plannedTickers[ticker] || ticker;
  const target     = stockTargets[ticker] || 0;                       // الهدف المخطط له
  const totalVal   = holdings.reduce((s, x) => s + +x.shares * +x.current_price, 0);
  const current    = (h && totalVal > 0) ? (+h.shares * +h.current_price) / totalVal * 100 : 0; // النسبة الحالية
  const diff       = current - target;
  const diffColor  = Math.abs(diff) < 0.01 ? cssVar('--text-2') : stateColorOf(diff > 0 ? 'bad' : 'warn');
  const taskType   = stockTaskMap[ticker];
  const task       = taskType ? STOCK_TASK_META[taskType] : null;

  const statusHtml = isPlanned
    ? tagHtml('📌', 'مخطط له (غير مملوك بعد)', '')
    : tagHtml('✅', 'ضمن المحفظة حالياً', 'good');

  const taskHtml = task
    ? `${tagHtml(task.icon, task.label, task.state)}
       <div class="small text-muted mt-1">${task.desc}</div>`
    : `<span class="text-muted">— لا توجد مهمة يدوية فعّالة لهذا السهم</span>`;

  const row = (label, valHtml) => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
      <span class="small" style="color:var(--text-muted)">${label}</span>
      <span style="font-weight:600;font-size:.9rem;text-align:left">${valHtml}</span>
    </div>`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card stack">
      <div class="card-head">
        <span class="ttl">${esc(name)} <span class="sub num">${esc(ticker)}</span></span>
        <div class="acts">${statusHtml}</div>
      </div>
      ${row('النسبة الحالية في المحفظة', isPlanned ? '<span class="text-muted">—</span>' : `${current.toFixed(2)}%`)}
      ${row('الهدف المخطط له', target ? `${target}%` : '<span class="text-muted">غير محدد</span>')}
      ${row('الفارق عن الهدف', target ? `<span style="color:${diffColor}">${diff > 0 ? '+' : ''}${diff.toFixed(2)}%</span>` : '<span class="text-muted">—</span>')}
      <div>
        <div class="small text-muted mb-2">المهمة اليدوية (من مهامي)</div>
        ${taskHtml}
      </div>
      <div class="flex-between gap-2">
        <a href="targets.html" class="btn btn-secondary btn-sm">⚖️ صفحة الأهداف والمهام</a>
        <button id="sad-close" class="btn btn-secondary btn-sm">إغلاق</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  // AUDIT-FIX 2026-08: إزالة مستمع Escape في كل مسارات الإغلاق (كان يتسرب عند الإغلاق بالزر/النقر)
  const escKey = e => { if (e.key === 'Escape') close(); };
  const close = () => { document.removeEventListener('keydown', escKey); overlay.remove(); };
  overlay.querySelector('#sad-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', escKey);
}

// ══════════════════════════════════════════════════════════════
// 🏥 محلل صحة المحفظة
//
// كل مقياس مبني على بيانات موثوقة 100% من المحفظة الفعلية:
//   - التنوع والتركيز  ← holdings
//   - التوزيعات        ← _ds.fwdProjected (Forward Income)
//   - هدف الاستقلال    ← retirement_goal_v1 + _ds.latestNW
//
// المرجعية العلمية:
//   - Benjamin Graham (The Intelligent Investor) — نطاقات عدد الأسهم
//   - Peter Lynch (mبدأ "diworsification")
//   - Modern Portfolio Theory — التركيز القطاعي وتأثيره على التشتت
// ══════════════════════════════════════════════════════════════

function renderPortfolioHealthCard() {
  const el = document.getElementById('portfolio-health-card');
  if (!el) return;

  const totalVal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  if (!holdings.length || !totalVal) { el.style.display = 'none'; return; }
  el.style.display = '';

  const s    = window._ds || {};
  const goal = getRetirementGoal();
  const gThr = +(localStorage.getItem(userLsKey('tharwa-alert-green'))  ?? localStorage.getItem('tharwa-alert-green')  ?? DEV_IGNORE);
  const yThr = +(localStorage.getItem(userLsKey('tharwa-alert-yellow')) ?? localStorage.getItem('tharwa-alert-yellow') ?? DEV_PUMP);

  // ── 1. تنوع الأسهم والقطاعات ───────────────────────────────
  const stockCount = holdings.length;

  const sectorMap = {};
  holdings.forEach(h => {
    const sec = (h.sector || '').trim() || 'غير مصنف';
    sectorMap[sec] = (sectorMap[sec] || 0) + +h.shares * +h.current_price;
  });
  const sectorCount = Object.keys(sectorMap).length;
  const sectorEntries = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);
  const largestSectorPct  = sectorEntries[0] ? sectorEntries[0][1] / totalVal * 100 : 0;
  const largestSectorName = sectorEntries[0]?.[0] || '';

  // ── 2. تركيز الحيازات ──────────────────────────────────────
  const sorted = [...holdings]
    .map(h => ({ ticker: h.ticker, name: h.name || h.ticker,
                 w: +h.shares * +h.current_price / totalVal * 100 }))
    .sort((a, b) => b.w - a.w);
  const top1Pct  = sorted[0]?.w   || 0;
  const top1Name = sorted[0]?.ticker || '';
  const top3Pct  = sorted.slice(0, 3).reduce((s, h) => s + h.w, 0);

  // ── 3. التوزيعات vs الهدف ──────────────────────────────────
  // AUDIT-FIX 2026-08: fallback إلى TTM عند غياب Forward — يطابق كرت الدخل ونافذة ⓘ
  const fwdMonthly    = (s.fwdProjected || s.ttmDiv || 0) / 12;
  const monthlyTarget = goal.monthly || 0;

  // ── 4. التوافق مع هدف الاستقلال المالي ──────────────────────
  // AUDIT-FIX (M3): قاعدة السحب الآمن تنطبق على الأصول السائلة القابلة للسحب
  // (لا العقار). نستخدم نفس fireBase في بطاقة التقاعد لتطابق النسبتين عبر اللوحة
  // بدل s.latestNW (الذي يشمل العقار ولقطة ثروة قد تكون قديمة).
  const fireNumber = goal.monthly > 0 && goal.swr > 0
    ? (goal.monthly * 12) / (goal.swr / 100) : 0;
  const fireBase     = totalVal + (portfolioCash || 0) + getSukukActiveTotal();
  const fireProgress = fireNumber > 0 ? Math.min(fireBase / fireNumber * 100, 100) : null;
  const targetYear  = goal.target_year || 0;
  const yearsLeft   = targetYear > 0 ? targetYear - new Date().getFullYear() : null;

  // ── إسقاط المسار: هل تبلغ الهدف في سنته بمساهماتك الحالية + نمو متحفّظ؟ ──
  // يميّز المحفظة الحديثة النامية «على المسار» عن المتأخرة فعلاً، بدل الحكم
  // على اللقطة الحالية وحدها. نمو سنوي افتراضي متحفّظ للتخطيط (لا وعد بعائد).
  // نشترط بيانات إيداع مسجّلة (hasCf12) ومساهمة موجبة حتى لا نُطلق حكم «متأخر»
  // على محفظة لم تُسجَّل تدفقاتها بعد.
  const HEALTH_GROWTH = 0.05;
  const annualContrib = (s.monthlyContrib || 0) * 12;
  const canAssess     = targetYear > 0 && yearsLeft > 0 && s.hasCf12 && annualContrib > 0;
  let projFireRatio = null, projCoverRatio = null;
  if (canAssess) {
    const g     = Math.pow(1 + HEALTH_GROWTH, yearsLeft);
    const fvPv  = fireBase * g;
    const fvPmt = annualContrib * ((g - 1) / HEALTH_GROWTH);
    const projAssets = Math.max(0, fvPv + fvPmt);
    if (fireNumber > 0) projFireRatio = projAssets / fireNumber * 100;
    // الدخل المتوقع مستقبلاً = الأصول المتوقعة × عائد التوزيع الحالي على الأسهم
    const divYield = totalVal > 0 ? (s.fwdProjected || 0) / totalVal : 0;
    if (monthlyTarget > 0) projCoverRatio = (projAssets * divYield / 12) / monthlyTarget * 100;
  }

  // ── 5. انضباط الأوزان ──────────────────────────────────────
  const hasTargets = Object.values(stockTargets).some(t => t > 0);
  let redDev = 0, yDev = 0;
  if (hasTargets) {
    Object.entries(stockTargets).forEach(([ticker, target]) => {
      if (!target) return;
      const h   = holdings.find(x => x.ticker === ticker);
      const cur = h ? +h.shares * +h.current_price / totalVal * 100 : 0;
      const d   = Math.abs(cur - target);
      if (d > yThr)       redDev++;
      else if (d > gThr)  yDev++;
    });
  }

  // ══════════════════════════════════════════════════════════
  // تقييم كل بُعد  → 'green' | 'yellow' | 'red' | 'gray'
  // ══════════════════════════════════════════════════════════

  // بُعد A: التنوع
  let aScore, aLabel, aDetail;
  if (stockCount < 5) {
    aScore = 'red';    aLabel = 'تركيز عالٍ';
    aDetail = `${stockCount} أسهم · ${sectorCount} قطاع — أقل من 5 أسهم يُعرّض المحفظة لخسائر حادة`;
  } else if (stockCount <= 9 || sectorCount <= 2) {
    aScore = 'yellow'; aLabel = 'تنوع محدود';
    aDetail = `${stockCount} أسهم · ${sectorCount} قطاع${sectorCount <= 2 ? ' — قطاعات غير كافية للحماية' : ''}`;
  } else if (stockCount <= 20 && sectorCount >= 4) {
    aScore = 'green';  aLabel = 'تنوع جيد';
    aDetail = `${stockCount} أسهم · ${sectorCount} قطاعات — النطاق الأمثل لمحفظة التوزيعات`;
  } else if (stockCount > 25) {
    aScore = 'yellow'; aLabel = 'مراقبة التشتت';
    aDetail = `${stockCount} سهماً — تأكد أن كل سهم يضيف قيمة فعلية (Peter Lynch: diworsification)`;
  } else {
    aScore = 'green';  aLabel = 'تنوع جيد';
    aDetail = `${stockCount} أسهم · ${sectorCount} قطاعات`;
  }

  // بُعد B: التركيز
  const _top1NameE = esc(top1Name);
  const _largSecE  = esc(largestSectorName);
  let bScore, bLabel, bDetail;
  // ⚠️ العتبات هنا (30/20 للسهم و50/38 للقطاع) اجتهادية وتناقض توصيات
  // **الصفحة نفسها** أسفلها المضبوطة على م.25 و28. وbScore يغذّي رقم
  // «صحة المحفظة» المعروض، فكان التناقض يظهر للمالك في بطاقتين متجاورتين.
  // المرجع: سقف أعلى فئة (أ) 15% للسهم الواحد، وم.28 للقطاع.
  const _capA = (typeof CAT === 'object' && CAT && CAT.A) ? CAT.A.cap : 15;
  if (top1Pct > _capA * 2 || top3Pct > 65 || largestSectorPct > 30) {
    bScore = 'red';    bLabel = 'تركيز مرتفع جداً';
    bDetail = `أكبر سهم (${_top1NameE}): ${top1Pct.toFixed(1)}% · أكبر 3: ${top3Pct.toFixed(1)}% · أكبر قطاع: ${largestSectorPct.toFixed(1)}%`;
  } else if (top1Pct > _capA || top3Pct > 50 || largestSectorPct > 25) {
    bScore = 'yellow'; bLabel = 'تركيز مرتفع';
    bDetail = `أكبر سهم (${_top1NameE}): ${top1Pct.toFixed(1)}% · أكبر قطاع (${_largSecE}): ${largestSectorPct.toFixed(1)}%`;
  } else {
    bScore = 'green';  bLabel = 'توزيع متوازن';
    bDetail = `أكبر سهم: ${top1Pct.toFixed(1)}% · أكبر قطاع (${_largSecE}): ${largestSectorPct.toFixed(1)}% · أكبر 3: ${top3Pct.toFixed(1)}%`;
  }

  // بُعد C: تغطية الدخل الشهري — واعٍ بالمسار (لا يُجرّم محفظة نامية على المسار)
  let cScore, cLabel, cDetail;
  if (!monthlyTarget) {
    cScore = 'gray';   cLabel = 'هدف غير محدد';
    cDetail = `دخل متوقع ${formatSAR(fwdMonthly)}/شهر — حدد هدف FIRE لمقارنة التقدم`;
  } else {
    const curCover = fwdMonthly / monthlyTarget * 100;
    if (curCover >= 100) {
      cScore = 'green';  cLabel = 'يغطي مصاريفك الآن';
      cDetail = `${formatSAR(fwdMonthly)}/شهر ≥ الهدف ${formatSAR(monthlyTarget)} ✅`;
    } else if (projCoverRatio != null) {
      const projTxt = `الآن ${formatSAR(fwdMonthly)}/شهر (${curCover.toFixed(0)}%) ← متوقع تغطية ${Math.min(projCoverRatio, 999).toFixed(0)}% من مصاريفك بحلول ${targetYear}`;
      if (projCoverRatio >= 100) {
        cScore = 'green';  cLabel = 'على المسار';
        cDetail = `${projTxt} — دخلك التوزيعي في طريقه لتغطية مصاريفك بالكامل.`;
      } else if (projCoverRatio >= 75) {
        cScore = 'yellow'; cLabel = 'قريب من المسار';
        cDetail = `${projTxt} — قريب؛ زيادة بسيطة في الادخار أو العائد تُغلق الفجوة.`;
      } else {
        cScore = 'red';    cLabel = 'متأخر عن المسار';
        cDetail = `${projTxt} — الدخل التوزيعي وحده لن يكفي؛ راجع معدّل الادخار أو اختيار الأسهم.`;
      }
    } else {
      cScore = 'yellow'; cLabel = 'مرحلة بناء';
      cDetail = `${formatSAR(fwdMonthly)}/شهر من أصل ${formatSAR(monthlyTarget)} (${curCover.toFixed(0)}%) — طبيعي في مرحلة التراكم. سجّل إيداعاتك وحدّد سنة التقاعد لتقييم مسارك.`;
    }
  }

  // بُعد D: التقدم نحو FIRE — واعٍ بالمسار (يقيس الوتيرة لا اللقطة وحدها)
  let dScore, dLabel, dDetail;
  if (fireProgress === null) {
    dScore = 'gray';   dLabel = 'هدف غير محدد';
    dDetail = yearsLeft != null ? `${yearsLeft} سنة حتى ${targetYear}` : 'حدد هدف FIRE + سنة التقاعد';
  } else if (fireProgress >= 100) {
    dScore = 'green';  dLabel = 'الهدف محقق';
    dDetail = `100% — أصولك السائلة تكفي للاستقلال المالي${yearsLeft != null ? ` · ${yearsLeft} سنة حتى ${targetYear}` : ''}`;
  } else if (projFireRatio != null) {
    const rem     = formatSAR(Math.max(0, fireNumber - fireBase));
    const projTxt = `الآن ${fireProgress.toFixed(0)}% ← متوقع ${Math.min(projFireRatio, 999).toFixed(0)}% من الهدف بحلول ${targetYear} (بمساهمة ${formatSAR(s.monthlyContrib || 0)}/شهر ونمو ~5%)`;
    if (projFireRatio >= 100) {
      dScore = 'green';  dLabel = 'على المسار';
      dDetail = `${projTxt} — وتيرتك الحالية تبلغ الهدف في موعده. تبقّى ${rem}.`;
    } else if (projFireRatio >= 80) {
      dScore = 'yellow'; dLabel = 'قريب من المسار';
      dDetail = `${projTxt} — قريب؛ زيادة الادخار قليلاً تضمن الوصول. تبقّى ${rem}.`;
    } else {
      dScore = 'red';    dLabel = 'متأخر عن المسار';
      dDetail = `${projTxt} — تبقّى ${rem}. تحتاج رفع الادخار الشهري أو مراجعة الهدف/السنة.`;
    }
  } else {
    const pStr = fireProgress.toFixed(0) + '%';
    const rem  = formatSAR(Math.max(0, fireNumber - fireBase));
    dScore = 'yellow'; dLabel = `${pStr} من الهدف`;
    dDetail = `${pStr} — متبقٍّ ${rem}${yearsLeft != null ? ` · ${yearsLeft} سنة حتى ${targetYear}` : ''}. سجّل إيداعاتك لتقييم مسارك بدقة.`;
  }

  // ══════════════════════════════════════════════════════════
  // التوصيات — كل توصية مبنية على بيانات حقيقية ومحددة
  // ══════════════════════════════════════════════════════════
  const tips = [];

  // T1: عدد الأسهم
  if (stockCount < 5)
    tips.push({ lvl:'red',    txt: `${stockCount} أسهم فقط — الخسارة في سهم واحد تؤثر بشكل كبير. حجم المحفظة المستهدف في دستورك: ${SIZE_MIN}–${SIZE_MAX} سهماً (م.29)` });
  else if (stockCount < SIZE_MIN)
    tips.push({ lvl:'yellow', txt: `${stockCount} أسهم — دون الحد الأدنى في دستورك (${SIZE_MIN}–${SIZE_MAX} سهماً). استمر بالإضافة بأوزان متوازنة` });
  else if (stockCount > SIZE_GRACE_MAX)
    tips.push({ lvl:'yellow', txt: `${stockCount} سهماً — راجع كل سهم: هل تعرفه وتتابعه؟ الأسهم التي لا تعرفها جيداً تزيد المخاطر لا تقللها` });

  // T2: عدد القطاعات
  if (sectorCount === 1)
    tips.push({ lvl:'red',    txt: `قطاع واحد فقط (${_largSecE}) — أزمة في هذا القطاع ستضرب 100% من محفظتك. أضف قطاعات مختلفة` });
  else if (sectorCount <= 3)
    tips.push({ lvl:'red',    txt: `${sectorCount} قطاعات — غير كافٍ للحماية من الصدمات القطاعية. هدف دستورك: 8 قطاعات فأكثر` });
  else if (sectorCount < 8)
    tips.push({ lvl:'yellow', txt: `${sectorCount} قطاعات — دون هدف دستورك (8 فأكثر). ${8 - sectorCount} قطاع${8 - sectorCount === 1 ? '' : 'ات'} إضافي يرفع الحماية ضد أزمة القطاع الواحد` });

  // T3: تركيز أكبر سهم
  // 2026-08-23: العتبات كانت 30%/20% وهي أعلى من السقف الدستوري نفسه —
  // فكان السهم عند 18% «سليماً» هنا و«كاسراً للسقف» في البطاقة المجاورة.
  if (top1Pct > CAT.A.cap + CAP_BUFFER)
    tips.push({ lvl:'red',    txt: `${_top1NameE} يشكل ${top1Pct.toFixed(1)}% — فوق أعلى سقف فئة (${CAT.A.cap}%، م.25). خفّضه لإرجاع الوزن إلى سقف فئته` });
  else if (top1Pct > CAT.A.cap - 2)
    tips.push({ lvl:'yellow', txt: `${_top1NameE} يشكل ${top1Pct.toFixed(1)}% — يقترب من أعلى سقف فئة. راجع فئته في محرّك القرار` });

  // T4: تركيز قطاعي
  // AUDIT-FIX (2026-08-21): كانت العتبات 50%/38% وتنصح بـ«دون 35%» بينما الدستور
  // §1 يضع سقف القطاع 25% + منطقة سماح 1.25% — فكانت اللوحة تسكت عن كسر مؤكّد.
  // ⚠️ «+1.25% سماح» رقمٌ لا وجود له في م.28. الدستور يضع أربع مناطق صريحة:
  //   ≤25 🟢 · 25–27.5 🟡 **تنبيه فقط، لا تصحيح** · 27.5–30 🟠 وقف الإضافة
  //   · >30 🔴 تصحيح إلزامي.
  // فكانت اللوحة تأمر بالتخفيف عند 26.3% حيث تقول م.28 «تنبيه فقط»، وتسكت
  // عن منطقة «وقف الإضافة» كلياً. والمحرّك وصفحة الأهداف على 27.5 —
  // فالثلاثة كانوا يتناقضون. المصدر الآن `sectorBandOf` في الدستور.
  const _secBandTip = (typeof sectorBandOf === 'function') ? sectorBandOf(largestSectorPct) : null;
  if (_secBandTip && largestSectorPct > 25) {
    const _lvl = (_secBandTip.action === 'correct' || _secBandTip.action === 'stopAdd')
               ? 'red' : 'yellow';
    tips.push({ lvl: _lvl,
      txt: `قطاع ${_largSecE} يشكل ${largestSectorPct.toFixed(1)}% — ${_secBandTip.label} (م.28)` });
  }

  // T5: الأوزان
  if (hasTargets && redDev > 0)
    tips.push({ lvl:'yellow', txt: `${redDev} سهم منحرف بشكل حاد عن هدفه — افتح "أهداف الأسهم" للتصحيح قبل أن يتسع الانحراف` });
  else if (!hasTargets && stockCount >= 5)
    tips.push({ lvl:'blue',   txt: `لم تحدد أهداف أوزان بعد — تحديد وزن لكل سهم يجعل قرارات الشراء والبيع أكثر انضباطاً وأقل عاطفية` });

  // T6: التوزيعات
  if (monthlyTarget > 0 && fwdMonthly < monthlyTarget * 0.4) {
    // ⚠️ «حجم المحفظة المطلوب» يُقاس بريالٍ **سوقي**، فمقامه العائد السوقي
    // (الدخل ÷ القيمة السوقية) لا العائد على التكلفة. و`divYieldFwd` مقامه
    // `costBasis`، وهو أصغر من القيمة السوقية بمقدار ما ارتفعت المحفظة —
    // فيخرج العائد أعلى والحجم المطلوب **أقلّ** بالنسبة نفسها. بمحفظة
    // ارتفعت 30% كان الهدف يُعرض أدنى من الحقيقي بنحو 23%.
    const _mv = +s.totalValue || 0;
    const fwdMktYield = _mv > 0 ? ((+s.fwdProjected || 0) / _mv * 100) : 0;
    if (fwdMktYield > 0.5) {
      const neededPort = (monthlyTarget * 12) / (fwdMktYield / 100);
      tips.push({ lvl:'blue',  txt: `لتحقيق ${formatSAR(monthlyTarget)}/شهر بعائد سوقي ${fwdMktYield.toFixed(1)}% تحتاج محفظة بحجم ${formatSAR(neededPort)} — اجعل هذا هدفك المرحلي` });
    }
  }

  // T7: هدف زمني
  if (targetYear > 0 && yearsLeft != null && yearsLeft <= 5 && fireProgress !== null && fireProgress < 80)
    tips.push({ lvl:'red',    txt: `${yearsLeft} سنوات فقط للوصول ${targetYear} ونسبة الإنجاز ${fireProgress?.toFixed(0)}% — قد تحتاج لزيادة الادخار الشهري أو مراجعة الهدف` });

  const shownTips = tips.slice(0, 4);  // حد أقصى 4 توصيات

  // ══════════════════════════════════════════════════════════
  // دوال مساعدة للرسم
  // ══════════════════════════════════════════════════════════
  // الألوان من رموز التصميم — الحُكم يُرافقه دائماً نص (verdict) لا لون وحده
  const CLR = { green: stateColorOf('good'), yellow: stateColorOf('warn'), red: stateColorOf('bad'), gray: cssVar('--text-2') };
  const TIP_CLR = { red: CLR.red, yellow: CLR.yellow, blue: seriesColor(1), green: CLR.green };

  // ── النسب المئوية للأبعاد القابلة للقياس (للأشرطة) ──
  const cProgress = monthlyTarget > 0 ? Math.min(fwdMonthly / monthlyTarget * 100, 100) : null;
  const dProgress = fireProgress; // 0–100 أو null

  // ── النتيجة الإجمالية: متوسط الأبعاد المُقيَّمة (نستثني ما بلا هدف = gray) ──
  const SCORE_VAL = { green:100, yellow:55, red:20 };
  const scored     = [aScore, bScore, cScore, dScore].filter(c => c !== 'gray');
  const greenCount = scored.filter(c => c === 'green').length;
  const overall      = scored.length ? Math.round(scored.reduce((s,c)=>s+SCORE_VAL[c],0)/scored.length) : null;
  const overallColor = overall == null ? CLR.gray : overall>=80?CLR.green : overall>=55?CLR.yellow : CLR.red;
  const overallLabel = overall == null ? 'غير مكتمل'
                     : overall>=80 ? 'ممتازة' : overall>=60 ? 'جيدة' : overall>=40 ? 'مقبولة' : 'تحتاج عناية';

  // ── شريط تقدّم اختياري ──
  const bar = (pct, color) => pct == null ? '' : `
    <div style="margin-top:7px;height:6px;background:var(--bg-2);border-radius:99px;overflow:hidden">
      <div style="height:100%;width:${Math.max(2, Math.min(100, pct))}%;background:${color};border-radius:99px"></div>
    </div>`;

  // ── بطاقة بُعد: أيقونة + اسم المحور + شارة الحُكم + تفصيل + شريط ──
  const dimCard = (icon, title, color, verdict, detail, pct) => `
    <div style="padding:11px 12px;background:var(--bg-3);border-radius:10px;border-inline-start:3px solid ${CLR[color]||CLR.gray}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px">
        <span style="font-weight:700;font-size:.84rem">${icon} ${title}</span>
        <span style="font-size:.71rem;font-weight:700;color:${CLR[color]||CLR.gray};background:${(CLR[color]||CLR.gray)}22;padding:2px 9px;border-radius:20px;white-space:nowrap">${verdict}</span>
      </div>
      <div style="font-size:.79rem;color:var(--text-2);line-height:1.5">${detail}</div>
      ${bar(pct, CLR[color]||CLR.gray)}
    </div>`;

  const tipHtml = shownTips.map(t => `
    <div style="display:flex;gap:8px;margin-bottom:7px;align-items:flex-start">
      <span class="dot" style="background:${TIP_CLR[t.lvl] || CLR.gray}"></span>
      <span style="font-size:.82rem;color:var(--text-2);line-height:1.6">${t.txt}</span>
    </div>`).join('');

  // ══════════════════════════════════════════════════════════
  // رسم الكارت
  // ══════════════════════════════════════════════════════════
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <span style="font-weight:700;font-size:.95rem">🏥 محلل صحة المحفظة</span>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${targetYear > 0
          ? `<span class="small text-muted" style="white-space:nowrap">🎯 ${targetYear} · ${formatSAR(monthlyTarget||0)}/شهر · SWR ${goal.swr||4}%</span>`
          : `<span class="small text-muted">لم يُحدَّد هدف التقاعد بعد</span>`}
        <button class="btn btn-secondary btn-sm" onclick="editRetirementGoal()" style="font-size:.72rem">✏️ تعديل الهدف</button>
        <button class="btn btn-secondary btn-sm" onclick="showHealthInfo()"     style="font-size:.72rem">ⓘ المنهجية</button>
      </div>
    </div>

    <!-- النتيجة الإجمالية -->
    <div style="display:flex;align-items:center;gap:14px;padding:12px 14px;background:var(--bg-3);border:1px solid ${overallColor}33;border-radius:12px;margin-bottom:14px">
      <div style="position:relative;width:54px;height:54px;flex-shrink:0;border-radius:50%;
        background:conic-gradient(${overallColor} ${overall||0}%, var(--bg-2) 0);display:flex;align-items:center;justify-content:center">
        <div style="width:42px;height:42px;border-radius:50%;background:var(--bg-3);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.92rem;color:${overallColor}">${overall == null ? '—' : overall}</div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.95rem;color:${overallColor}">صحة المحفظة: ${overallLabel}</div>
        <div class="small text-muted">${overall == null ? 'حدّد هدف التقاعد لإكمال التقييم' : `${greenCount} من ${scored.length} محاور خضراء · متوسط 4 أبعاد`}</div>
      </div>
    </div>

    <!-- الأبعاد الأربعة -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:14px">
      ${dimCard('🧩', 'التنوع',                  aScore, aLabel, aDetail, null)}
      ${dimCard('⚖️', 'التركيز',                 bScore, bLabel, bDetail, null)}
      ${dimCard('💵', 'تغطية الدخل الشهري',       cScore, cLabel, cDetail, cProgress)}
      ${dimCard('🎯', 'التقدم نحو الاستقلال FIRE', dScore, dLabel, dDetail, dProgress)}
    </div>

    ${shownTips.length ? `
    <div style="background:var(--bg-3);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px">
      <div style="font-size:.75rem;font-weight:700;color:var(--text-muted);margin-bottom:10px;letter-spacing:.04em;text-transform:uppercase">توصيات</div>
      ${tipHtml}
    </div>` : ''}

    <p style="margin:0;font-size:.71rem;color:var(--text-muted)">
      التقييم مبني على: عدد الأسهم والقطاعات، تركيز الحيازات، التوزيعات المتوقعة، وهدف FIRE —
      مرجعية: Benjamin Graham · Peter Lynch · Modern Portfolio Theory.
      لا يشمل Beta أو Volatility (تحتاج بيانات أسعار تاريخية غير متاحة).
    </p>`;
}

// تقدير نسبة المخاطر القابلة للتنويع المُزالة عند «عدد فعّال» معيّن.
// مرتكز على نقاط مرجعية من أبحاث منشورة (تقديري لا قطعي):
//   • Evans & Archer (1968): ~8–10 أسهم تُزيل معظم المخاطر القابلة للتنويع
//   • Alexeev & Tapon (2014): 10 أسهم تبقي ~25% من المخاطر الفردية
//   • Domian et al. (2007): 20 سهماً ≈ 95% مُزالة، و+80 سهماً تُزيل 4% فقط
//   • مراجعة Zaimovic et al. (2021, 150 دراسة): العدد أكبر اليوم، وأقل في
//     الأسواق الناشئة، والتنويع لا يُزيل مخاطر الذيل (الانهيارات)
// state: يُترجَم إلى لون حالة من رموز التصميم، ودائماً مصحوباً بالنص (txt)
function _divRiskRemoved(effN) {
  // ⚠️ 2026-08-26 — نطاق ١١–١٥ فعّالاً كان يُوسَم «تنبيه» لأن عتبة ٩٥٪
  // مأخوذة من Domian 2007 وهي دراسة **سوق متطوّر**. وبطاقة التنويع نفسها
  // تنصّ أسفلها أن «الأسواق الناشئة تحتاج عدداً **أقل** للتنويع الأمثل»،
  // وهدف المحفظة المسجَّل هو N الفعّال ≥ ١٥. فوسمُ ٩٠٪ تنبيهاً يطبّق معياراً
  // لسوقٍ آخر ويناقض نصّ البطاقة وهدفها معاً. صار «جيّداً» بقرار المالك.
  if (effN < 5)  return { pct: 60, txt: '< ٦٠٪',            state: 'bad'  };
  if (effN < 8)  return { pct: 75, txt: '~٧٥٪',             state: 'warn' };
  if (effN < 11) return { pct: 80, txt: '~٨٠٪',             state: 'warn' };
  // ⚠️ `best` لا `good` من ١١ فأعلى: `evBands` (تلميح العدّاد) تسِم هذه
  // النطاقات `best` ⇒ 🌟، وهذه الدالة كانت تسِمها `good` ⇒ ✅ — فيظهر
  // رمزان لمقياس واحد على الشاشة نفسها. اللون واحد في الحالتين، والفرق
  // في الرمز وحده. المصدر يجب أن يكون واحداً، وقرار المالك 🌟.
  if (effN < 16) return { pct: 90, txt: '~٩٠٪',             state: 'best' };
  if (effN < 21) return { pct: 95, txt: '~٩٥٪',             state: 'best' };
  if (effN < 31) return { pct: 97, txt: '~٩٦–٩٧٪',          state: 'best' };
  return            { pct: 98, txt: '~٩٨٪ (منفعة هامشية)', state: 'best' };
}

// ── مقياس التنويع (HHI gauge) ─────────────────────────────────
function renderDiversificationCard() {
  const el = document.getElementById('diversification-card');
  if (!el) return;

  const totalVal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  if (!holdings.length || !totalVal) { el.style.display = 'none'; return; }
  el.style.display = '';

  // ── الحساب عبر الدالة المشتركة (utils.js) — مصدر واحد للحقيقة ──
  const div = computeDiversification(holdings.map(h => ({
    value:  +h.shares * +h.current_price,
    sector: h.sector,
    label:  h.ticker,
  })));
  // `computeDiversification` تُرجع `null` حين لا مركز موجب القيمة — والحارس
  // أعلاه يفحص إجمالي المحفظة لا المراكز، فحيازةٌ بسعر صفر تعبره وتصل هنا
  // فينهار التفكيك بـTypeError ويسقط باقي رسم اللوحة معه.
  if (!div) { el.style.display = 'none'; return; }
  const {
    n, hhi, effectiveN, effectiveNExact, sectorCount, secHHI,
    top1Pct, top1Name, gaugePos, zoneLabel,
    corrWarn, corrMsg,
  } = div;

  // حالة المنطقة من رموز التصميم (لا نستعمل zoneColor الخام من utils.js)
  const zoneState = gaugePos < 40 ? 'bad' : gaugePos < 60 ? 'warn' : 'good';
  const zoneIcon  = gaugePos < 40 ? '🔴' : gaugePos < 60 ? '⚠️' : '✅';

  // تحديد نص النصيحة حسب المنطقة
  let advice;
  if (gaugePos < 22) {
    advice = `عدد فعّال = ${effectiveN} — مركز واحد يكفي لإلحاق ضرر بالغ بالمحفظة. المرجع (Graham): لا تقل عن 10 أسهم لحماية معقولة من المخاطر الفردية.`;
  } else if (gaugePos < 40) {
    // AUDIT-FIX: align threshold with detailed analysis (TARGET_HHI 0.067 → N_eff ≥ 15); was inconsistently "≥ 10"
    advice = `عدد فعّال = ${effectiveN} — تنوع جزئي. 90% من مخاطر الأسهم الفردية تُزال عند N_فعّال ≥ 15 (Evans & Archer 1968). أضف في قطاعات مختلفة.`;
  } else if (gaugePos < 60) {
    advice = `عدد فعّال = ${effectiveN} — نطاق مقبول. معظم المخاطر الفردية محمية. الخطوة التالية: تعزيز تنوع القطاعات (${sectorCount} قطاع حالياً).`;
  } else if (gaugePos < 80) {
    advice = `عدد فعّال = ${effectiveN} — تنوع جيد لمحفظة فردية يحمي من الصدمات الفردية والقطاعية. أنت قريب من نطاق Evans & Archer (≥ 15 سهماً فعّالاً) الذي يُزيل ~90% من المخاطر القابلة للتنويع.`;
  } else {
    advice = `عدد فعّال = ${effectiveN} — تنوع ممتاز لمحفظة فردية (≥ 15 سهماً فعّالاً، Evans & Archer 1968). المخاطر غير المنهجية عند أدنى مستوياتها — ركّز الآن على جودة المتابعة لا زيادة العدد.`;
  }

  // تنبيه منفصل لتعقيد الإدارة (Diworsification) — ليس منطقة خطر على المقياس
  const diworseNote = n > 30
    ? noteHtml('💡', `<strong>ملاحظة الإدارة:</strong> ${n} سهماً — عدد كبير يرفع تعقيد المتابعة (Lynch: diworsification). تأكد أن كل مركز مدروس وتعرفه جيداً.`, 'warn')
    : '';

  // تنبيه الارتباط بالوكالة — تنويع اسمي لا فعلي (قطاع مهيمن بأسهم مترابطة)
  const corrNote = corrWarn
    ? noteHtml('⚠️', `<strong>تنويع اسمي لا فعلي:</strong> ${esc(corrMsg)}
        <div class="small text-muted mt-1">المؤشر يقيس تركيز الأوزان لا ترابط الأسهم — القطاع الواحد يتحرك ككتلة واحدة عند الصدمات.</div>`, 'bad')
    : '';

  // ── حلقة التقدّم نحو نطاق Evans & Archer (15 سهماً متوازناً) ──
  const targetN     = 15;
  // AUDIT-FIX 2026-08-22: المقارنة والتقدّم بالقيمة **الدقيقة** لا المقرَّبة —
  // 14.5 كانت تُقرَّب إلى 15 فتُمنح «بلغت النطاق ✓» وهي دونه.
  const _effExact   = (typeof effectiveNExact === 'number' && isFinite(effectiveNExact)) ? effectiveNExact : effectiveN;
  const progressPct = Math.min(100, _effExact / targetN * 100);
  // (حساب الحلقة صار داخل `gaugeHtml` — لا نسخة ثانية هنا)
  const progressTxt = _effExact >= targetN
    ? 'بلغت نطاق التنويع الموصى به ✓'
    : `${progressPct.toFixed(0)}% من نطاق التنويع الموصى به (${targetN} سهماً — عددك الفعّال ${_effExact.toFixed(1)})`;

  // ── مقياسا توازن التوزيع — أعلى = أكثر توازناً = أفضل (عكس التركّز) ──
  // توازن = كم هي متقاربة أوزان المراكز؛ 100% = أوزان متساوية تماماً.
  const balState   = v => v >= 70 ? 'good' : v >= 50 ? 'warn' : 'bad';
  const balStocks  = Math.round(effectiveN / n * 100);
  const effSectors = secHHI > 0 ? 1 / secHHI : sectorCount;
  const balSectors = Math.round(Math.min(1, effSectors / sectorCount) * 100);
  const hhiPct     = hhi * 100, secPct = secHHI * 100;
  const ev         = _divRiskRemoved(_effExact);   // تقدير المخاطر المُزالة (أبحاث) — بالقيمة الدقيقة
  const _mDiv      = assessMetricMaturity('diversification', { stockCount: n });

  // ── نطاقات كل مقياس، لتلميحه عند المرور ───────────────────────
  // تُشتقّ من نفس الدوال التي تُلوّن العدّاد، فلا يفترق التلميح عن اللون.
  const _mark = (arr, v) => {
    const i = arr.findIndex(b => v < b.lt);
    (arr[i === -1 ? arr.length - 1 : i]).here = true;
    return arr;
  };
  // التوازن: نفس عتبات balState (٥٠ و٧٠)
  const balBands = v => _mark([
    { lt: 50,       state: 'bad',  label: 'ضعيف — تركّز عالٍ', range: 'أقل من ٥٠٪' },
    { lt: 70,       state: 'warn', label: 'متوسط',             range: '٥٠–٦٩٪' },
    { lt: 90,       state: 'good', label: 'جيّد',              range: '٧٠–٨٩٪' },
    { lt: Infinity, state: 'best', label: 'ممتاز — أوزان متقاربة', range: '٩٠٪ فأكثر' },
  ], v);
  // المخاطر المُزالة: العتبة على **العدد الفعّال** لا على النسبة نفسها
  const evBands = e => _mark([
    { lt: 5,        state: 'bad',  label: 'أقل من ٥ فعّالة',  range: '< ٦٠٪' },
    { lt: 11,       state: 'warn', label: '٥–١٠ فعّالة',      range: '~٧٥–٨٠٪' },
    { lt: 16,       state: 'best', label: '١١–١٥ فعّالة',     range: '~٩٠٪' },
    { lt: 21,       state: 'best', label: '١٦–٢٠ فعّالة',     range: '~٩٥٪ ← الهدف' },
    { lt: Infinity, state: 'best', label: '٢١ فعّالة فأكثر',  range: '~٩٦–٩٨٪' },
  ], e);
  // التقدّم نحو النطاق الموصى به (١٥ سهماً فعّالاً)
  const progBands = v => _mark([
    { lt: 50,       state: 'bad',  label: 'بعيد عن النطاق',      range: 'أقل من ٥٠٪' },
    { lt: 80,       state: 'warn', label: 'في الطريق',           range: '٥٠–٧٩٪' },
    { lt: 100,      state: 'good', label: 'قريب من النطاق',      range: '٨٠–٩٩٪' },
    { lt: Infinity, state: 'best', label: 'بلغت النطاق الموصى به', range: '١٠٠٪' },
  ], v);
  const progState = progressPct >= 100 ? 'good' : progressPct >= 80 ? 'good'
                  : progressPct >= 50 ? 'warn' : 'bad';

  el.innerHTML = cardHead(
      '🧩 مقياس التنويع', 'Diversification',
      `<button class="btn btn-secondary btn-sm" onclick="showDiversificationAnalysis()">📋 تحليل مفصّل</button>
       <button class="info-btn" onclick="showCardInfo('diversification')">ⓘ</button>`
    ) + `
    <div class="stack-4">

      <!-- ══════════════════════════════════════════════════════════
           أربعة عدّادات دائرية جنباً إلى جنب
           ------------------------------------------------------------
           كانت المقاييس الثلاثة (توازن الأسهم · توازن القطاعات · موضعك
           على مرجع الأبحاث) أشرطةً أفقية تمتدّ بعرض البطاقة كاملاً،
           فتأكل المساحة بلا أن تُضيف رقماً — والدائرة تقول الرقم نفسه في
           ربع المساحة. والشرح الطويل صار مطويّاً يُوسَّع بالنقر: البطاقة
           تعرض الأرقام، ومن أراد التفصيل فتحه.
           ══════════════════════════════════════════════════════════ -->
      <div class="gauge-row">
        ${gaugeHtml({
          // الحلقة تتبع **التقدّم نحو النطاق الموصى به** كما كانت قبل التغيير،
          // لا موضع المنطقة — حتى لا يتغيّر معنى الرقم الذي اعتاده المالك.
          // واللون من المقياس نفسه لا من موضع المنطقة، وإلا لوّنت الحلقةَ كميةٌ
          // غير التي تملؤها.
          valueTxt: effectiveN, sub: 'عدد فعّال', pct: progressPct,
          color: stateColorOf(progState),
          label: 'العدد الفعّال',
          hint: `الهدف ${targetN} فعّالاً`,
          bands: progBands(progressPct),
          nowNote: `تملك <b>${n}</b> سهماً وتنوّعها يعادل <b>${effectiveN}</b> سهماً متساوي الوزن — `
                 + `أي <b>${progressPct.toFixed(0)}%</b> من النطاق الموصى به (${targetN} فعّالاً).`,
        })}
        ${gaugeHtml({
          valueTxt: `${balStocks}%`, sub: 'أسهم', pct: balStocks,
          color: stateColorOf(balState(balStocks)),
          label: 'توازن توزيع الأسهم',
          hint: 'الهدف ٧٠٪ فأكثر',
          bands: balBands(balStocks),
          nowNote: `العدد الفعّال ÷ عدد الأسهم. كلما تقاربت أوزان مراكزك ارتفع.`
                 + `<br>HHI الخام: <b>${hhiPct.toFixed(1)}%</b>`,
        })}
        ${gaugeHtml({
          valueTxt: `${balSectors}%`, sub: 'قطاعات', pct: balSectors,
          color: stateColorOf(balState(balSectors)),
          label: 'توازن توزيع القطاعات',
          hint: 'الهدف ٧٠٪ فأكثر',
          bands: balBands(balSectors),
          nowNote: `يقيس تقارب أوزان القطاعات لا عددها.`
                 + `<br>HHI القطاعات الخام: <b>${secPct.toFixed(1)}%</b>`,
        })}
        ${gaugeHtml({
          valueTxt: `${ev.pct}%`, sub: 'مخاطر مُزالة', pct: ev.pct,
          color: stateColorOf(ev.state),
          label: 'موضعك على مرجع الأبحاث',
          hint: 'جيّد من ١١ فعّالاً فأكثر',
          bands: evBands(_effExact),
          nowNote: `نسبة المخاطر <b>القابلة للتنويع</b> التي أُزيلت عند عددك الفعّال `
                 + `(Zaimovic 2021 · Domian 2007).`
                 + `<br>🌍 عتبة ٩٥٪ مأخوذة من دراسة <b>سوق متطوّر</b>، وتاسي سوق ناشئ `
                 + `يحتاج عدداً <b>أقل</b> — فـ<b>${ev.pct}%</b> عند عددك الفعّال نتيجة جيّدة، `
                 + `والزيادة بعدها منفعة هامشية.`,
        })}
      </div>

      <!-- الحُكم والأرقام المساندة -->
      <div class="stack-2">
        <div class="flex gap-2" style="align-items:center;flex-wrap:wrap">
          ${tagHtml(zoneIcon, zoneLabel, zoneState)}${maturityBadge(_mDiv.level, _mDiv.reason)}
        </div>
        <div class="hero-cap">${progressTxt}</div>
        <div class="flex gap-2" style="flex-wrap:wrap">
          <span class="tag">📊 ${n} سهم</span>
          <span class="tag">🗂️ ${sectorCount} قطاع</span>
          <span class="tag">🎯 أكبر ${top1Pct.toFixed(1)}% (${esc(top1Name)})</span>
        </div>
      </div>

      <!-- الشرح — مطويّ حتى يطلبه المستخدم -->
      <details class="inline-more">
        <summary><span class="chev">▸</span> ماذا تعني هذه الأرقام؟ (المنهجية ومرجع الأبحاث)</summary>
        <div class="stack-2">
          <div class="small text-muted">
            تملك ${n} سهماً، لكن بسبب تفاوت أوزانها فإن تنوّعها يعادل
            <b class="num">${effectiveN}</b> سهماً متساوي الوزن.
            كلما اقترب الرقمان كان توزيعك أكثر توازناً.
            <br>عتبة الجودة في مقياسَي التوازن هي <b>٧٠٪</b>.
            مقياس HHI الخام: أسهم ${hhiPct.toFixed(1)}% · قطاعات ${secPct.toFixed(1)}%.
          </div>
          ${noteHtml('📚', `
            <b>وفق الأبحاث</b> <span class="text-muted">(مراجعة Zaimovic et al. 2021 — 150 دراسة)</span><br>
            عند <b class="num">${effectiveN}</b> سهماً فعّالاً، أُزيل تقديراً
            ${tagHtml(ev.state === 'best' ? '🌟' : ev.state === 'good' ? '✅'
                    : ev.state === 'warn' ? '⚠️' : '🔴', ev.txt, ev.state)}
            من المخاطر القابلة للتنويع.
            ${effectiveN < 20
              ? ` الوصول إلى ~٢٠ يرفعها إلى ~٩٥٪ <span class="text-muted">(Domian 2007)</span>؛ بعدها المنفعة هامشية (+٨٠ سهماً = +٤٪ فقط).`
              : ` أنت في منطقة المنفعة الهامشية — زيادة العدد بعد ~٢٠ لا تُضيف تنويعاً يُذكر <span class="text-muted">(Domian 2007)</span>.`}
            <br>المحطات على مرجع الأبحاث: ٥ · ٨–١٠ · ١٥ (Evans &amp; Archer) · ٢٠ · ٣٠+
            <br>🌍 <b>سوقك ناشئ (تاسي):</b> الأبحاث تُظهر أن الأسواق الناشئة تحتاج عدداً
            <b>أقل</b> للتنويع الأمثل من المتطورة، لكنها أعلى تذبذباً ومخاطر ذيل —
            والتنويع <b>لا يحمي من الانهيارات</b> (الارتباطات ترتفع وقت الأزمات).`)}
          <div><button class="btn btn-secondary btn-sm" type="button" onclick="showDiversificationBreakdown()">🔬 أي سهم يرفع العدد الفعّال وأيّه يخفضه</button></div>
        </div>
      </details>

      <!-- النصيحة -->
      ${noteHtml(zoneIcon, advice, zoneState)}
      ${corrNote}
      ${diworseNote}
    </div>`;
}

// ── تحليل التنويع المفصّل (popup شخصي) ──────────────────────────
// ══════════════════════════════════════════════════════════════════════
// 🔬 تفكيك «العدد الفعّال» على مستوى كل سهم
// ----------------------------------------------------------------------
// سوء فهم شائع يستحقّ التصحيح في الواجهة نفسها: العدد الفعّال ليس عدّاً
// لأسهم «فعّالة» مقابل أخرى «غير فعّالة». هو 1 ÷ مجموع مربّعات الأوزان —
// أي «كم سهماً **متساوي الوزن** يعطي نفس درجة تركّزك الحالية». فلا يوجد سهم
// فعّال وآخر غير فعّال؛ يوجد **وزن** يقترب من التساوي فيرفع الرقم، ووزن يبتعد
// عنه فيخفضه — والابتعاد في الاتجاهين يخفضه:
//   • الثقيل يخفضه لأنه يركّز المحفظة فيه.
//   • الضئيل يخفضه لأنه يزيد العدّ الاسمي بلا تنويع حقيقي يُذكر.
// لذلك يقيس هذا التفكيك كل سهم مقابل **الوزن المتساوي** (100 ÷ عدد الأسهم)،
// ويعرض مساهمته الفعلية في التركّز، والأثر المحسوب لتعديله.
// ══════════════════════════════════════════════════════════════════════
function _effNAfter(weights, idx, newW) {
  // العدد الفعّال لو صار وزن السهم idx مساوياً newW وأُعيد تطبيع الباقي تناسبياً
  const rest = weights.reduce((s, w, j) => (j === idx ? s : s + w), 0);
  if (rest <= 0) return null;
  const scale = (1 - newW) / rest;
  const nw = weights.map((w, j) => (j === idx ? newW : w * scale));
  const h = nw.reduce((s, w) => s + w * w, 0);
  return h > 0 ? 1 / h : null;
}

function showDiversificationBreakdown() {
  const items = (holdings || [])
    .map(h => ({ ticker: h.ticker, name: h.name, value: +h.shares * +h.current_price }))
    .filter(p => p.value > 0)
    .sort((a, b) => b.value - a.value);

  if (items.length < 2) {
    openInfoModal('🔬 تفكيك العدد الفعّال',
      '<p>يحتاج التفكيك سهمين على الأقل بقيمة موجبة.</p>');
    return;
  }

  const total   = items.reduce((s, p) => s + p.value, 0);
  const n       = items.length;
  const equalW  = 1 / n;                                  // الوزن المتساوي
  const weights = items.map(p => p.value / total);
  const hhi     = weights.reduce((s, w) => s + w * w, 0);
  const effN    = 1 / hhi;

  const rows = items.map((p, i) => {
    const w     = weights[i];
    const share = w / equalW;                             // 1.00 = متوازن تماماً
    const contrib = (w * w) / hhi * 100;                  // نصيبه من التركّز
    const gapSAR  = (equalW - w) * total;                 // + يحتاج إضافة / − زائد
    const effIfBal = _effNAfter(weights, i, equalW);
    let cls, icon, label;
    if (share >= 1.5)      { cls = 'bad';  icon = '🔴'; label = 'ثقيل — يخفض العدد الفعّال'; }
    else if (share >= 0.75){ cls = 'good'; icon = '🟢'; label = 'متوازن — يرفعه'; }
    else if (share >= 0.5) { cls = 'warn'; icon = '🟡'; label = 'قريب من التوازن'; }
    else                   { cls = '';     icon = '⚪'; label = 'هامشي — يزيد العدّ لا التنويع'; }
    return { ...p, w, share, contrib, gapSAR, effIfBal, cls, icon, label };
  });

  const heavy    = rows.filter(r => r.share >= 1.5);
  const marginal = rows.filter(r => r.share < 0.5);
  const near     = rows.filter(r => r.share >= 0.5 && r.share < 0.75);
  const balanced = rows.filter(r => r.share >= 0.75 && r.share < 1.5);

  // أكبر مكسب ممكن: أي سهم واحد تعديله يرفع العدد الفعّال أكثر من غيره
  const best = rows.reduce((m, r) =>
    (r.effIfBal != null && (m == null || r.effIfBal > m.effIfBal) ? r : m), null);

  const body = `
    <p><b>العدد الفعّال ليس عدّاً لأسهم «فعّالة».</b> هو جواب سؤال واحد:
    <em>كم سهماً متساوي الوزن يعطي نفس تركّز محفظتي الحالي؟</em>
    عندك <b class="num">${n}</b> سهماً، وتركّزك يعادل <b class="num">${effN.toFixed(1)}</b> سهماً متساوياً.</p>

    <div class="info-formula">الوزن المتساوي = 100% ÷ ${n} = <b>${(equalW * 100).toFixed(2)}%</b> لكل سهم</div>

    <p>كل سهم يُقاس بنسبته إلى هذا الوزن. <b>والابتعاد عنه يخفض الرقم في الاتجاهين:</b>
    الثقيل يخفضه لأنه يركّز المحفظة فيه، والضئيل يخفضه لأنه يزيد عدد أسهمك
    الاسمي بلا تنويع حقيقي.</p>

    <div class="table-wrapper"><table>
      <thead><tr>
        <th>السهم</th><th>وزنه</th>
        <th>مقابل المتساوي<br><span class="small text-muted">1.00 = متوازن</span></th>
        <th>نصيبه من التركّز</th>
        <th>الحالة</th>
        <th>لو وُزن بالتساوي<br><span class="small text-muted">العدد الفعّال يصير</span></th>
        <th>الفرق بالريال</th>
      </tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td><strong>${esc(r.ticker)}</strong><br><span class="small text-muted">${esc(r.name || '')}</span></td>
          <td class="num">${(r.w * 100).toFixed(2)}%</td>
          <td class="num"><b>${r.share.toFixed(2)}×</b></td>
          <td class="num">${r.contrib.toFixed(1)}%</td>
          <td>${r.icon} <span class="small">${r.label}</span></td>
          <td class="num">${r.effIfBal != null
              ? `${r.effIfBal.toFixed(1)}<span class="small text-muted"> (${r.effIfBal > effN ? '+' : ''}${(r.effIfBal - effN).toFixed(1)})</span>`
              : '—'}</td>
          <td class="num">${r.gapSAR >= 0
              ? `<span class="text-success">+${formatSAR(r.gapSAR)}</span>`
              : `<span class="text-danger">−${formatSAR(Math.abs(r.gapSAR))}</span>`}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>

    <div class="info-math">
      🔴 ثقيل (≥ 1.5×): <b>${heavy.length}</b>${heavy.length ? ' — ' + heavy.map(r => esc(r.ticker)).join('، ') : ''}<br>
      🟢 متوازن (0.75–1.5×): <b>${balanced.length}</b><br>
      🟡 قريب من التوازن (0.5–0.75×): <b>${near.length}</b>${near.length ? ' — ' + near.map(r => esc(r.ticker)).join('، ') : ''}<br>
      ⚪ هامشي (< 0.5×): <b>${marginal.length}</b>${marginal.length ? ' — ' + marginal.map(r => esc(r.ticker)).join('، ') : ''}
    </div>

    ${best && best.effIfBal > effN + 0.05 ? `<p class="info-note">🎯 <b>أكبر مكسب من تعديل واحد:</b>
      لو صار وزن <b>${esc(best.name || best.ticker)}</b> مساوياً للوزن المتساوي
      (${(equalW * 100).toFixed(2)}%)، يرتفع عددك الفعّال من
      <b class="num">${effN.toFixed(1)}</b> إلى <b class="num">${best.effIfBal.toFixed(1)}</b>.
      عمود «الفرق بالريال» يقول كم يلزم بيعاً أو شراءً للوصول لذلك.</p>` : ''}

    ${marginal.length ? `<p class="info-note">⚪ <b>عن المراكز الهامشية:</b> عندك
      <b>${marginal.length}</b> سهماً وزنه أقل من نصف الوزن المتساوي. هذه هي التي تجعل
      «${n} سهماً» تعادل ${effN.toFixed(1)} فقط: تُحسب في العدد ولا تكاد تؤثر في النتيجة.
      الخيار إما تعزيزها لتصير وازنة أو الخروج منها لتقليل عدد ما تتابعه — والتشتّت في
      المتابعة تكلفة حقيقية أيضاً.</p>` : ''}

    <p class="info-note">⚠️ هذا التفكيك يقيس <b>توازن الأوزان فقط</b>. سهمان متساويا الوزن
      في نفس القطاع لا يعطيان التنويع الذي يعطيه سهمان في قطاعين مختلفين — والعدد الفعّال
      لا يرى ذلك. راجع معه توزيع القطاعات، فالارتباط بين الأسهم لا يقيسه هذا الرقم.</p>`;

  openInfoModal('🔬 تفكيك العدد الفعّال — سهماً سهماً', body);
}

function showDiversificationAnalysis() {
  const totalVal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  if (!holdings.length || !totalVal) return;

  // AUDIT-FIX (2026-07): الحساب كله عبر computeDiversification في utils.js —
  // المصدر الوحيد للحقيقة. كانت هنا صيغة معامل قطاعات مختلفة (0.60+0.40×(1−NHHI))
  // تخالف صيغة الكرت (0.70+0.30×effSectors/6) فيتناقض البوب-أب مع حكم الكرت.
  const div = computeDiversification(holdings.map(h => ({
    value:  +h.shares * +h.current_price,
    sector: h.sector,
    label:  h.ticker,
  })));
  if (!div) return;
  const { n, hhi, effectiveN: effN, secMap, sectorCount, sectorFactor, top1Pct, top1Name } = div;

  const sorted  = [...holdings].sort((a,b) => +b.shares*+b.current_price - +a.shares*+a.current_price);
  const top3Pct = sorted.slice(0,3).reduce((s,h) => s + +h.shares*+h.current_price/totalVal*100, 0);

  // أكبر قطاع
  const topSector = Object.entries(secMap).sort((a,b)=>b[1]-a[1])[0];
  const topSecPct = topSector ? topSector[1]*100 : 0;
  const topSecName= topSector ? topSector[0] : '';

  // ── معايير "تنوع ممتاز" ──────────────────────────────────────
  // HHI < 5% → N_eff > 20، وعامل القطاعات يجب أن يكون عالياً
  const TARGET_HHI     = 0.067;  // N_eff ≥ 15 — Evans & Archer (1968): 15 سهم تُزيل 90% من المخاطر القابلة للتنويع
  const TARGET_TOP1    = CAT.A.cap;   // % - أكبر مركز = أعلى سقف فئة (م.25)
  const TARGET_TOP3    = 45;     // % - أكبر 3
  const TARGET_SECTORS = SECTORS_MIN;  // قطاعات كحد أدنى (م.29)
  const TARGET_TOPSEC  = 25;     // % - أكبر قطاع (السقف الدستوري §1)
  const TARGET_SECFACT = 0.85;   // معامل القطاعات المطلوب

  // ── بناء قائمة التحقق ────────────────────────────────────────
  const checks = [];

  // 1. N_eff / HHI
  const hhiOk = hhi <= TARGET_HHI;
  checks.push({
    ok: hhiOk,
    label: `العدد الفعّال (N_فعّال)`,
    current: `${effN} سهم · HHI = ${(hhi*100).toFixed(1)}%`,
    target:  `N_فعّال ≥ 15 · HHI ≤ 6.7%`,
    action:  hhiOk ? null
      : effN >= 12
        ? `وزّع مبالغ الإضافات بالتساوي أكثر — أكبر مركز يستأثر بحصة كبيرة ترفع الـ HHI`
        : `أضف ${Math.max(0, 15 - effN)} أسهم جديدة بأوزان متوازنة (أو قلّل تركيز أكبر مراكزك)`
  });

  // 2. أكبر مركز
  const top1Ok = top1Pct <= TARGET_TOP1;
  checks.push({
    ok: top1Ok,
    label: `أكبر مركز (${esc(top1Name)})`,
    current: `${top1Pct.toFixed(1)}%`,
    target:  `≤ ${TARGET_TOP1}%`,
    action:  top1Ok ? null
      : `توقف عن إضافة ${esc(top1Name)} وحوّل المبالغ الجديدة لأسهم أخرى حتى ينخفض وزنه لـ ${TARGET_TOP1}%`
  });

  // 3. أكبر 3 مراكز
  const top3Ok = top3Pct <= TARGET_TOP3;
  checks.push({
    ok: top3Ok,
    label: `أكبر 3 مراكز مجتمعة`,
    current: `${top3Pct.toFixed(1)}%`,
    target:  `≤ ${TARGET_TOP3}%`,
    action:  top3Ok ? null
      : `الأسهم الثلاثة الأكبر تستحوذ على ${top3Pct.toFixed(0)}% — وجّه الإضافات القادمة لبقية المراكز`
  });

  // 4. عدد القطاعات
  const secCountOk = sectorCount >= TARGET_SECTORS;
  checks.push({
    ok: secCountOk,
    label: `تنوع القطاعات`,
    current: `${sectorCount} قطاع`,
    target:  `≥ ${TARGET_SECTORS} قطاعات`,
    action:  secCountOk ? null
      : `أضف أسهماً من قطاعات غير ممثلة حالياً — ${TARGET_SECTORS - sectorCount} قطاع ناقص على الأقل`
  });

  // 5. هيمنة قطاع واحد
  const topSecOk = topSecPct <= TARGET_TOPSEC;
  checks.push({
    ok: topSecOk,
    label: `أكبر قطاع (${esc(topSecName)})`,
    current: `${topSecPct.toFixed(1)}% من المحفظة`,
    target:  `≤ ${TARGET_TOPSEC}%`,
    action:  topSecOk ? null
      : `قطاع "${esc(topSecName)}" يهيمن بـ ${topSecPct.toFixed(0)}% — أزمة قطاعية ستضرب حصة كبيرة. تنوّع في قطاعات أخرى`
  });

  // 6. معامل القطاعات
  const secFactOk = sectorFactor >= TARGET_SECFACT;
  checks.push({
    ok: secFactOk,
    label: `توزيع الأوزان بين القطاعات`,
    current: `معامل = ${(sectorFactor*100).toFixed(0)}%`,
    target:  `≥ ${TARGET_SECFACT*100}%`,
    action:  secFactOk ? null
      : `الأوزان القطاعية غير متوازنة — حاول أن تتقارب القطاعات في حجمها لا أن يطغى قطاع على البقية`
  });

  const passCount = checks.filter(c => c.ok).length;
  const allPass   = passCount === checks.length;

  // ── رسم الـ popup ─────────────────────────────────────────────
  const rowsHtml = checks.map(c => `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="flex-shrink:0;margin-top:1px;font-size:1.1rem">${c.ok ? '✅' : '❌'}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:0.85rem;color:var(--text)">${c.label}</div>
        <div style="font-size:0.80rem;margin-top:3px">
          <span style="color:${stateColorOf(c.ok ? 'good' : 'bad')}">الآن: ${c.current}</span>
          &nbsp;·&nbsp;
          <span class="text-muted">الهدف: ${c.target}</span>
        </div>
        ${c.action ? `<div class="mt-1">${noteHtml('👉', c.action, 'bad')}</div>` : ''}
      </div>
    </div>`).join('');

  const summaryState = allPass ? 'good' : passCount >= 4 ? 'good' : passCount >= 2 ? 'warn' : 'bad';
  const summaryIcon  = allPass ? '🏆' : passCount >= 4 ? '✅' : passCount >= 2 ? '⚠️' : '🔴';
  const summaryText  = allPass
    ? 'محفظتك تستوفي جميع معايير "تنوع ممتاز"!'
    : `اجتزت ${passCount} من ${checks.length} معايير — ${checks.length - passCount} ${checks.length - passCount === 1 ? 'معيار ناقص' : 'معايير ناقصة'}`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      ${cardHead('📋 تحليل التنويع', 'ماذا تحتاج للوصول لـ «تنوع ممتاز»؟',
        `<button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>`)}

      <div class="stack-4">
        <!-- ملخص -->
        ${noteHtml(summaryIcon, `<b>${summaryText}</b>`, summaryState)}

        <!-- قائمة التحقق -->
        <div>${rowsHtml}</div>

        <!-- ملاحظة -->
        <div class="small text-muted">
          <b>الأدلّة العلمية (مراجعة Zaimovic et al. 2021 — 150 دراسة 1952–2021):</b><br>
          • لا يوجد «عدد مثالي» واحد — يعتمد على السوق والمستثمر وقياس المخاطر ودرجة تحمّلك.<br>
          • ١٠ أسهم تبقي ~٢٥٪ من المخاطر الفردية (Alexeev & Tapon 2014)؛ ٢٠ سهماً ≈ ٩٥٪ مُزالة، و+٨٠ سهماً تُزيل ٤٪ فقط (Domian et al. 2007).<br>
          • المحفظة جيدة التنويع <b>أكبر اليوم</b> بسبب انخفاض تكاليف التداول وارتفاع المخاطر الفردية.<br>
          • الأسواق <b>الناشئة (تاسي)</b> تحتاج عدداً أقل للتنويع الأمثل، لكن مخاطر الذيل أعلى والتنويع لا يُزيلها — الارتباطات ترتفع وقت الأزمات.<br>
          • المتحفّظ يستهدف خفض ٩٩٪ من المخاطر (عدد أكبر)، والمغامِر ٩٠٪ (عدد أقل) (Raju & Agarwalla 2021).<br>
          المعايير العملية: N_فعّال ≥ ١٥ · أكبر مركز ≤ ١٥٪ · أكبر ٣ ≤ ٤٥٪ · ٤+ قطاعات متوازنة.
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  // ⚠️ كان المستمع يُزال **فقط** عند الإغلاق بـEscape. والإغلاق بزرّ ✕ أو
  // بالنقر على الخلفية يتركه معلّقاً على `document` ممسكاً بـoverlay محذوف
  // (تسريب)، ويتراكم مستمع لكل فتحة — وهي بطاقة تُفتح كثيراً. بقية نوافذ
  // الملف طبّقت الإصلاح الصحيح ولم يصل إلى هذه.
  // (وتسمية الدالة `esc` كانت تحجب مساعد التهريب العام `esc()` داخل نطاقها.)
  const _onEsc = e => { if (e.key === 'Escape') _closeOverlay(); };
  const _closeOverlay = () => {
    document.removeEventListener('keydown', _onEsc);
    overlay.remove();
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeOverlay(); });
  const _x = overlay.querySelector('.modal-close');
  if (_x) { _x.onclick = _closeOverlay; }
  document.addEventListener('keydown', _onEsc);
}

// ── معلومات منهجية محلل الصحة ───────────────────────────────
function showHealthInfo() {
  // S-3: replace alert() with DOM modal — alert() blocks the main thread and is
  // unavailable in some iframe/CSP environments.
  const lines = [
    ['🏥 محلل صحة المحفظة — المنهجية والمصادر', true],
    ['── عدد الأسهم (Graham) ──', false],
    ['&nbsp;&nbsp;< 5 : خطر تركيز عالٍ', false],
    ['&nbsp;&nbsp;5–9 : تنوع محدود', false],
    ['&nbsp;&nbsp;10–20 : النطاق الأمثل (Graham: 10–30)', false],
    ['&nbsp;&nbsp;21–25 : جيد مع المراقبة', false],
    ['&nbsp;&nbsp;> 25 : مراقبة diworsification (Lynch)', false],
    ['── القطاعات ──', false],
    ['&nbsp;&nbsp;1–2 : غير محمي &nbsp; 3 : أولي &nbsp; 4+ : حماية جيدة', false],
    ['── تركيز أكبر سهم ──', false],
    ['&nbsp;&nbsp;> 30% : مرتفع جداً &nbsp; 20–30% : مرتفع &nbsp; < 20% : مقبول', false],
    ['── تركيز أكبر قطاع ──', false],
    ['&nbsp;&nbsp;> 50% : مرتفع جداً &nbsp; 38–50% : مرتفع &nbsp; < 38% : متوازن', false],
    ['── تغطية الدخل والتقدم نحو FIRE (واعٍ بالمسار) ──', false],
    ['&nbsp;&nbsp;لا نحكم على اللقطة الحالية وحدها: نُسقِط أصولك حتى سنة الهدف', false],
    ['&nbsp;&nbsp;بناءً على مساهماتك الشهرية المسجّلة + نمو متحفّظ ~5%/سنة.', false],
    ['&nbsp;&nbsp;«على المسار» = الإسقاط ≥ 100% من الهدف &nbsp; «قريب» = 80–99%', false],
    ['&nbsp;&nbsp;«متأخر» = < 80% &nbsp;(محفظة نامية على المسار لا تُعدّ خللاً)', false],
    ['&nbsp;&nbsp;رقم FIRE = مصاريف سنوية ÷ SWR (مثال: 7,000×12÷4% = 2,100,000)', false],
    ['&nbsp;&nbsp;يتطلّب تسجيل إيداعاتك وسنة تقاعد؛ بدونها نعرض «مرحلة بناء».', false],
    ['⚠️ ما لا يقيسه هذا المحلل (لعدم توفر البيانات):', false],
    ['&nbsp;&nbsp;Beta، Sharpe Ratio، Volatility — تحتاج أسعار إغلاق تاريخية يومية', false],
  ];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const content = lines.map(([l, bold]) =>
    bold ? `<p class="bold mb-2">${l}</p>` : `<p class="small text-muted mb-2">${l}</p>`
  ).join('');
  overlay.innerHTML = `
    <div class="modal-card">
      <div>${content}</div>
      <div class="flex-end mt-4">
        <button id="hi-close" class="btn btn-secondary">إغلاق</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  // AUDIT-FIX 2026-08: إزالة مستمع Escape في كل مسارات الإغلاق
  const escKey = e => { if (e.key === 'Escape') close(); };
  const close = () => { document.removeEventListener('keydown', escKey); overlay.remove(); };
  overlay.querySelector('#hi-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', escKey);
}

// ── إعدادات هدف الاستقلال المالي — Supabase + localStorage cache ──
// TD-3: key defined in utils.js as RET_GOAL_LS_KEY — use that constant here
const RET_GOAL_KEY = RET_GOAL_LS_KEY;

function _retGoalFromObj(o) {
  return { monthly: +o?.monthly || 0, swr: +o?.swr || 4, target_year: +o?.target_year || 0 };
}

function getRetirementGoal() {
  // قراءة من الـ cache المحلي — يُحدَّث عند كل تحميل من Supabase
  try {
    const scoped = localStorage.getItem(userLsKey(RET_GOAL_KEY));
    const legacy = localStorage.getItem(RET_GOAL_KEY);
    return _retGoalFromObj(JSON.parse(scoped || legacy || '{}'));
  } catch (_) { return _retGoalFromObj({}); }
}

async function _loadRetirementGoalFromSupabase() {
  const remote = await loadUserSetting(RET_GOAL_KEY);
  if (!remote) return;
  // حدّث الـ cache المحلي
  try { localStorage.setItem(userLsKey(RET_GOAL_KEY), JSON.stringify(remote)); } catch (_) {}
  // أعِد رسم بطاقة FIRE إذا تغيّرت القيمة
  renderRetirementCard();
}

function saveRetirementGoal(goal) {
  // حفظ فوري في localStorage
  try { localStorage.setItem(userLsKey(RET_GOAL_KEY), JSON.stringify(goal)); } catch (_) {}
  // حفظ غير متزامن في Supabase (يمنع الفقدان على الجوال)
  saveUserSetting(RET_GOAL_KEY, goal).catch(() => {});
}
function editRetirementGoal() {
  const cur = getRetirementGoal();
  // S-3: replace prompt() with DOM modal — prompt() is blocked in some CSP/iframe contexts
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card stack">
      ${cardHead('🎯 هدف التقاعد', '', '')}
      <div class="form-group">
        <label for="rg-monthly">المصاريف الشهرية المتوقعة بعد التقاعد (ر.س)</label>
        <input id="rg-monthly" type="number" min="0" step="500" class="input full-width" value="${esc(cur.monthly || '')}">
      </div>
      <div class="form-group">
        <label for="rg-swr">نسبة السحب الآمنة السنوية % (الافتراضي 4% — قاعدة 25 ضعف)</label>
        <input id="rg-swr" type="number" min="1" max="10" step="0.5" class="input full-width" value="${esc(cur.swr || 4)}">
      </div>
      <div class="form-group">
        <label for="rg-year">سنة التقاعد المستهدفة (مثال: 2043 — اتركها فارغة إن لم تحددها)</label>
        <input id="rg-year" type="number" min="2024" max="2100" step="1" class="input full-width" value="${esc(cur.target_year || '')}">
      </div>
      <div class="flex-end gap-3 mt-4">
        <button id="rg-cancel" class="btn btn-secondary">إلغاء</button>
        <button id="rg-save"   class="btn btn-primary">حفظ</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#rg-monthly').focus();
  // AUDIT-FIX 2026-08: إزالة مستمع Escape في كل مسارات الإغلاق
  const escKey = e => { if (e.key === 'Escape') cleanup(); };
  const cleanup = () => { document.removeEventListener('keydown', escKey); overlay.remove(); };
  overlay.querySelector('#rg-cancel').onclick = cleanup;
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(); });
  overlay.querySelector('#rg-save').onclick = () => {
    const monthly    = +overlay.querySelector('#rg-monthly').value || 0;
    const swr        = +overlay.querySelector('#rg-swr').value    || 4;
    const target_year = +overlay.querySelector('#rg-year').value  || 0;
    cleanup();
    saveRetirementGoal({ monthly, swr, target_year });
    renderStats();
    renderRetirementCard();
    renderPortfolioHealthCard(); renderDiversificationCard();
  };
  overlay.querySelector('#rg-save').addEventListener('keydown', e => { if (e.key === 'Enter') overlay.querySelector('#rg-save').click(); });
  document.addEventListener('keydown', escKey);
}

// ── Insights (الصف التحليلي الإضافي) ─────────────────────────
function renderInsights(s, totalValue, costBasis, pnl, pnlPct) {
  // ── بطاقة 1: تفاصيل المحفظة ──────────────────────────────
  setText('ins-stock-count',  s.stockCount  || 0);
  setText('ins-sector-count', s.sectorCount || 0);

  // أسهم المنح
  const grantEl    = document.getElementById('ins-grant-shares');
  const grantValEl = document.getElementById('ins-grant-value');
  if (s.totalGrantShares > 0) {
    if (grantEl) grantEl.textContent = formatShares(s.totalGrantShares) + ' سهم';
    // قيمة المنح بالسعر الحالي من المحفظة
    const grantVal = holdings.reduce((sum, h) => {
      return sum + ((s.grantMap?.[h.ticker] || 0) * +h.current_price);
    }, 0);
    if (grantValEl) grantValEl.textContent = grantVal > 0 ? ' ≈ ' + formatSAR(grantVal) : '';
  } else {
    if (grantEl)    grantEl.textContent    = '—';
    if (grantValEl) grantValEl.textContent = '';
  }

  // ── بطاقة 2: أعلى قطاع وزناً ─────────────────────────────
  if (s.topSector) {
    setText('ins-top-sector-name', s.topSector.sec);
    const topEl = g('ins-top-sector-pct');
    if (topEl) {
      topEl.textContent = s.topSector.pct.toFixed(1) + '%';
      topEl.className = 'value num text-accent';
    }
    const topTarget = s.topSector.target;
    const topDiff   = s.topSector.pct - topTarget;
    setText('ins-top-sector-sub', topTarget
      ? `هدفه ${topTarget.toFixed(1)}% | فارق ${topDiff >= 0 ? '+' : ''}${topDiff.toFixed(1)}%`
      : 'لا يوجد هدف محدد');
    setHtml('ins-top-sector-tag', !topTarget ? tagHtml('⚪', 'بدون هدف', '')
      : Math.abs(topDiff) <= 1 ? tagHtml('✅', 'ضمن الهدف', 'good')
      : topDiff > 0 ? tagHtml('🔴', `فوق الهدف +${topDiff.toFixed(1)}%`, 'bad')
      : tagHtml('🔻', `تحت الهدف ${topDiff.toFixed(1)}%`, 'warn'));
  }

  // ── بطاقة 3: أقل قطاع وزناً ──────────────────────────────
  if (s.bottomSector && s.sectorCount > 1) {
    setText('ins-bot-sector-name', s.bottomSector.sec);
    const botEl = g('ins-bot-sector-pct');
    if (botEl) {
      botEl.textContent = s.bottomSector.pct.toFixed(1) + '%';
      botEl.className   = 'value num text-danger';
    }
    const botTarget = s.bottomSector.target;
    const botDiff   = s.bottomSector.pct - botTarget;
    setText('ins-bot-sector-sub', botTarget
      ? `هدفه ${botTarget.toFixed(1)}% | فارق ${botDiff >= 0 ? '+' : ''}${botDiff.toFixed(1)}%`
      : 'لا يوجد هدف محدد');
    setHtml('ins-bot-sector-tag', !botTarget ? tagHtml('⚪', 'بدون هدف', '')
      : Math.abs(botDiff) <= 1 ? tagHtml('✅', 'ضمن الهدف', 'good')
      : botDiff > 0 ? tagHtml('🔴', `فوق الهدف +${botDiff.toFixed(1)}%`, 'bad')
      : tagHtml('🔻', `تحت الهدف ${botDiff.toFixed(1)}%`, 'warn'));
  }

  // ── بطاقة 4: التكاليف التراكمية ──────────────────────────
  setText('ins-commission', formatSAR(s.totalCommission || 0));
  setText('ins-vat',        formatSAR(s.totalVAT        || 0));
  setText('ins-costs-total', formatSAR((s.totalCommission || 0) + (s.totalVAT || 0)));

  // ── بطاقة 5: رأس المال vs القيمة السوقية ──────────────────
  setText('ins-cost-basis',   formatSAR(costBasis));
  setText('ins-market-value', formatSAR(totalValue));
  // شريط التقدم: نسبة القيمة السوقية من التكلفة
  // المسار يمتد ٠–٢٠٠٪ من التكلفة، فتقع علامة التعادل (١٠٠٪) في منتصفه
  const mktPct = costBasis > 0 ? Math.min(totalValue / costBasis * 100, 200) : 0;
  const mktFill = g('ins-mkt-bar-fill');
  if (mktFill) mktFill.style.width = Math.min(mktPct / 2, 100) + '%';
  const mktMeter = g('ins-mkt-meter');
  if (mktMeter) mktMeter.dataset.state = pnl >= 0 ? 'good' : 'bad';
  // AUDIT-FIX (2026-08-18، نفس مبدأ كرت التعادل): يُعرض الفرق عن التكلفة لا
  // النسبة الخام — «102.3%» تُقرأ ربحاً بينما هي 100% تكلفة + 2.3% ربح.
  setText('ins-mkt-ratio', costBasis > 0
    ? `${pnl >= 0 ? '+' : '−'}${Math.abs(pnlPct).toFixed(2)}%` : '—');
  const mktFoot = g('ins-mkt-foot');
  if (mktFoot) mktFoot.textContent = costBasis > 0
    ? `قيمتك السوقية = ${mktPct.toFixed(1)}% من تكلفتك (100% = تكلفتك بالضبط)`
    : 'العلامة = تكلفتك بالضبط';
  const mktPnlEl = g('ins-mkt-pnl');
  if (mktPnlEl) {
    mktPnlEl.innerHTML = tagHtml(pnl >= 0 ? '✅' : '❌',
      `${formatSAR(pnl, true)} (${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`,
      pnl >= 0 ? 'good' : 'bad');
  }

  // ── بطاقة 6: ر/خ محقق من البيع ───────────────────────────
  const rpnl = s.realizedPnL || 0;
  const rpnlEl = g('ins-realized-pnl');
  if (rpnlEl) {
    rpnlEl.textContent = (rpnl >= 0 ? '+' : '') + formatSAR(rpnl, true);
    rpnlEl.className   = 'value num ' + (rpnl >= 0 ? 'text-success' : 'text-danger');
  }
  setText('ins-realized-sub', rpnl >= 0 ? 'عمليات البيع حققت ربحاً ✅' : 'عمليات البيع حققت خسارة ⚠️');

  // ── بطاقة 7: العائد التوزيعي — يُحدَّث عبر switchYieldTab ──
  // (يُستدعى من renderStats بعد هذه الدالة)
}

// ── Charts ────────────────────────────────────────────────────
function renderCharts() {
  renderSectorChart();
  renderWeightChart();
  renderIncomeBySector();
}

// ══════════════════════════════════════════════════════════════
// 💰 الدخل التوزيعي حسب القطاع — Income by Sector
// ══════════════════════════════════════════════════════════════
let _ibsMode = 'bars'; // 'bars' | 'table'

function setIbsMode(mode) {
  _ibsMode = mode;
  document.getElementById('ibs-bars')?.classList.toggle('btn-primary', mode === 'bars');
  document.getElementById('ibs-bars')?.classList.toggle('btn-secondary', mode !== 'bars');
  document.getElementById('ibs-table')?.classList.toggle('btn-primary', mode === 'table');
  document.getElementById('ibs-table')?.classList.toggle('btn-secondary', mode !== 'table');
  renderIncomeBySector();
}

function renderIncomeBySector() {
  const el = document.getElementById('income-by-sector-body');
  if (!el) return;

  const s = window._ds || {};

  // نحتاج TTM dividends مقسّمة على القطاع
  // نبني: ticker → sector من holdings
  const tickerSector = {};
  holdings.forEach(h => {
    tickerSector[h.ticker] = (h.sector || '').trim() || 'غير مصنف';
  });

  // AUDIT-FIX (2026-07): نستخدم الدخل المتوقع الفعلي لكل رمز (fwdByTicker من
  // loadAllData — وسيط DPS × الدورية × الأسهم الحالية). التوزيع السابق بنسبة
  // القيمة السوقية كان يجعل «نسبة الدخل» = «نسبة الوزن» بالبناء، فيفقد الكرت معناه.
  const fwdMap = s.fwdByTicker || {};
  const breakdown = holdings.map(h => ({
    ticker:    h.ticker,
    projected: fwdMap[h.ticker] || 0,
  }));

  // اجمع الدخل بالقطاع
  const sectorIncome = {};
  breakdown.forEach(b => {
    const sec = tickerSector[b.ticker] || 'غير مصنف';
    sectorIncome[sec] = (sectorIncome[sec] || 0) + (b.projected || 0);
  });

  const totalIncome = Object.values(sectorIncome).reduce((a, v) => a + v, 0);
  const entries = Object.entries(sectorIncome)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!entries.length || totalIncome <= 0) {
    el.innerHTML = `<div class="empty-state" style="padding:20px">
      <div class="icon">💰</div>
      <p>سجّل أرباحاً موزّعة أولاً لعرض توزيع الدخل حسب القطاع</p></div>`;
    return;
  }

  if (_ibsMode === 'table') {
    el.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr>
        <th>القطاع</th>
        <th>الدخل السنوي المتوقع</th>
        <th>نسبة الدخل</th>
        <th>نسبة الوزن</th>
        <th>الفرق</th>
      </tr></thead>
      <tbody>
        ${entries.map(([sec, inc]) => {
          const incomePct = totalIncome > 0 ? inc / totalIncome * 100 : 0;
          const totalVal  = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
          // AUDIT-FIX (2026-07): أقواس حول التعبير — الأسبقية السابقة كانت تجعل
          // الفلتر يقبل كل سهم مصنَّف في كل قطاع (=== يسبق ||)
          const secVal    = holdings.filter(h => (((h.sector||'').trim()) || 'غير مصنف') === sec)
                              .reduce((s, h) => s + +h.shares * +h.current_price, 0);
          const weightPct = totalVal > 0 ? secVal / totalVal * 100 : 0;
          const diff      = incomePct - weightPct;
          const diffCls   = Math.abs(diff) < 2 ? 'text-muted' : diff > 0 ? 'text-success' : 'text-accent';
          return `<tr>
            <td><strong>${esc(sec)}</strong></td>
            <td class="num">${formatSAR(inc)}</td>
            <td class="num bold" style="color:var(--accent)">${incomePct.toFixed(1)}%</td>
            <td class="num">${weightPct.toFixed(1)}%</td>
            <td class="num small ${diffCls}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid var(--border)">
          <td><strong>الإجمالي</strong></td>
          <td class="num bold text-success">${formatSAR(totalIncome)}</td>
          <td class="num bold">100%</td>
          <td></td><td></td>
        </tr>
      </tfoot>
    </table></div>
    <p class="small text-muted" style="margin-top:8px">
      الفرق = % الدخل − % الوزن — موجب يعني القطاع ينتج دخلاً أكبر من وزنه (كثافة توزيع أعلى)
    </p>`;
    return;
  }

  // أشرطة — صفوف .brow موحّدة مع بقية اللوحة
  const maxInc = entries[0][1];
  el.innerHTML = `
    <div>
      ${entries.map(([sec, inc], i) => browHtml({
        name: esc(sec), sub: formatSAR(inc), color: seriesColor(i),
        pct: maxInc > 0 ? inc / maxInc * 100 : 0,
        valueTxt: `${(totalIncome > 0 ? inc / totalIncome * 100 : 0).toFixed(1)}%`,
        title: `${esc(sec)} — ${formatSAR(inc)}`,
      })).join('')}
    </div>
    ${kvsHtml([['الدخل السنوي المتوقع الكلي', formatSAR(totalIncome)]])}
    <p class="small text-muted mt-2">
      مبني على Forward Projected Income — اضغط "جدول" لرؤية الفرق بين نسبة الدخل ونسبة الوزن لكل قطاع.
    </p>
  `;
}

// ── Sector chart: mode switcher ───────────────────────────────
function setSectorMode(mode) {
  _sectorMode = mode;
  ['donut','bars','cards'].forEach(m => {
    document.getElementById('sm-' + m)?.classList.toggle('active', m === mode);
  });
  renderSectorChart();
}

function renderSectorChart() {
  const sectorMap = {};
  holdings.forEach(h => { const k = (h.sector || '').trim() || 'أخرى'; sectorMap[k] = (sectorMap[k] || 0) + +h.shares * +h.current_price; });
  const total   = Object.values(sectorMap).reduce((a, v) => a + v, 0);
  const entries = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);

  const chartCont = document.getElementById('sectorChart-container');
  const altArea   = document.getElementById('sector-alt-area');

  if (_sectorMode === 'bars') {
    if (sectorChart) { sectorChart.destroy(); sectorChart = null; }
    if (chartCont) chartCont.style.display = 'none';
    if (altArea) { altArea.style.display = ''; altArea.innerHTML = _renderSectorBars(entries, total); }
    return;
  }
  if (_sectorMode === 'cards') {
    if (sectorChart) { sectorChart.destroy(); sectorChart = null; }
    if (chartCont) chartCont.style.display = 'none';
    if (altArea) { altArea.style.display = ''; altArea.innerHTML = _renderSectorCards(entries, total); }
    return;
  }

  // donut
  if (altArea) altArea.style.display = 'none';
  if (chartCont) chartCont.style.display = '';
  if (sectorChart) sectorChart.destroy();
  const sCtx = g('sectorChart')?.getContext('2d');
  if (!sCtx) return;
  const sLabels = entries.map(([k]) => k), sData = entries.map(([, v]) => v);
  const th = chartTheme();
  sectorChart = new Chart(sCtx, {
    type: 'doughnut',
    data: { labels: sLabels, datasets: [{ data: sData, backgroundColor: entries.map((_, i) => seriesColor(i)), borderColor: th.surface, borderWidth: 2, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: th.muted, font: { family: th.font, size: 11 }, padding: 10, usePointStyle: true } },
        tooltip: Object.assign(chartTooltipStyle(), {
          callbacks: { label: c => { const pct = total > 0 ? (c.parsed / total * 100).toFixed(1) : 0; return ' ' + formatSAR(c.parsed) + '  (' + pct + '%)'; } } })
      }
    }
  });
}

function _renderSectorBars(entries, total) {
  // جمع أهداف القطاعات — من sectorTargets المُحمَّل في loadAllData
  const hasSectorTargets = Object.keys(window._sectorTargetMap || {}).length > 0;

  // AUDIT-FIX 2026-08: عتبات الانحراف من LS (نفس مفاتيح البانر) بدل 1/3 المثبّتة
  const gThr = +(localStorage.getItem(userLsKey('tharwa-alert-green'))  ?? localStorage.getItem('tharwa-alert-green')  ?? DEV_IGNORE);
  const yThr = +(localStorage.getItem(userLsKey('tharwa-alert-yellow')) ?? localStorage.getItem('tharwa-alert-yellow') ?? DEV_PUMP);

  const bars = entries.map(([sec, val], i) => {
    const pct    = total > 0 ? (val / total * 100) : 0;
    const target = (window._sectorTargetMap || {})[sec] || 0;
    const color  = seriesColor(i);

    // حالة الانحراف — لون + أيقونة + نص (اللون وحده لا يحمل المعنى)
    let barColor = color, statusTip = '', diffTxt = '', diffState = '';
    if (target > 0) {
      const diff = pct - target;
      if (Math.abs(diff) <= gThr)            { diffState = 'good'; statusTip = `✅ ضمن الهدف (${target}%)`;                       diffTxt = '✅'; }
      else if (diff > gThr && diff <= yThr)  { diffState = 'warn'; statusTip = `⚠️ فوق الهدف (${target}%) بـ +${diff.toFixed(1)}%`; diffTxt = `⚠️+${diff.toFixed(1)}`; }
      else if (diff > yThr)                  { diffState = 'bad';  statusTip = `🔴 فوق الهدف (${target}%) بـ +${diff.toFixed(1)}%`; diffTxt = `🔴+${diff.toFixed(1)}`; }
      else if (diff < -yThr)                 { diffState = 'warn'; statusTip = `🟡 تحت الهدف (${target}%) بـ ${diff.toFixed(1)}%`;  diffTxt = `🔻${diff.toFixed(1)}`; }
      // AUDIT-FIX 2026-08: فرع أصفر للنقص البسيط (بين −gThr و −yThr) — كان يُعرض أخضر
      else                                   { diffState = 'warn'; statusTip = `🟡 تحت الهدف (${target}%) بـ ${diff.toFixed(1)}%`;  diffTxt = `🔻${diff.toFixed(1)}`; }
      barColor = stateColorOf(diffState);
    }

    return browHtml({
      name: esc(sec), sub: formatSAR(val), color: barColor, pct: Math.min(pct, 100),
      valueTxt: `${pct.toFixed(1)}%`, diffTxt, diffState,
      title: `${esc(sec)} — ${formatSAR(val)}${target > 0 ? ` · ${statusTip}` : ''}`,
    });
  }).join('');

  const legend = hasSectorTargets
    ? `<div class="flex gap-3 mb-2" style="flex-wrap:wrap">
        ${tagHtml('✅', 'ضمن الهدف', 'good')}
        ${tagHtml('⚠️', 'انحراف بسيط', 'warn')}
        ${tagHtml('🔴', 'انحراف حاد', 'bad')}
       </div>` : '';

  return `<div class="stack-2">${legend}<div>${bars}</div></div>`;
}

function _renderSectorCards(entries, total) {
  // AUDIT-FIX 2026-08: عتبات الانحراف من LS (نفس مفاتيح البانر) بدل 1/3 المثبّتة
  const gThr = +(localStorage.getItem(userLsKey('tharwa-alert-green'))  ?? localStorage.getItem('tharwa-alert-green')  ?? DEV_IGNORE);
  const yThr = +(localStorage.getItem(userLsKey('tharwa-alert-yellow')) ?? localStorage.getItem('tharwa-alert-yellow') ?? DEV_PUMP);
  const cards = entries.map(([sec, val], i) => {
    const pct    = total > 0 ? (val / total * 100) : 0;
    const target = (window._sectorTargetMap || {})[sec] || 0;
    const diff   = target > 0 ? pct - target : null;
    const color  = seriesColor(i);

    // الحالة: لون + أيقونة + نص معاً
    let barColor = color, state = '', stateIcon = '', stateLabel = '';
    if (diff !== null) {
      if (Math.abs(diff) <= gThr)  { state = 'good'; stateIcon = '✅'; stateLabel = 'ضمن الهدف'; }
      else if (diff > gThr)        { state = diff > yThr ? 'bad' : 'warn'; stateIcon = diff > yThr ? '🔴' : '⚠️'; stateLabel = `فوق +${diff.toFixed(1)}%`; }
      else                         { state = 'warn'; stateIcon = '🔻'; stateLabel = `تحت ${diff.toFixed(1)}%`; }
      barColor = stateColorOf(state);
    }

    return `<div class="w-card" style="--card-accent:${barColor}">
      <div class="w-card-header">
        <span class="w-card-ticker">${esc(sec)}</span>
        <span class="w-card-pct">${pct.toFixed(1)}%</span>
      </div>
      ${meterHtml({
        label: formatSAR(val),
        valueTxt: target > 0 ? `🎯 ${target}%` : '—',
        pct: Math.min(pct, 100), state, fillColor: state ? '' : color,
        markPct: target > 0 ? Math.min(target, 100) : null,
      })}
      ${diff !== null ? `<div class="mt-2">${tagHtml(stateIcon, stateLabel, state)}</div>` : ''}
    </div>`;
  }).join('');
  return `<div class="w-cards-grid">${cards}</div>`;
}

// ── حالة وزن السهم مقابل هدفه: مفتاح واحد للّون والأيقونة والنص ──
// 'none' بلا هدف · 'over' زيادة · 'under' نقص · 'ok' ضمن الهدف
// AUDIT-FIX 2026-08-21 (#46): كان الهامش ثابتاً ±1% هنا بينما جدول الأوزان في
// نفس الصفحة (dashboard.js:2532) وبطاقة الصحة (1400) وصفحة الأهداف
// (targets.js/getAlertThresholds) تقرأ كلها عتبة المستخدم. فمن رفع عتبته إلى 3%
// كان يرى ✅ في الجدول و🔴 في الكرت للسهم نفسه في اللحظة نفسها. مصدر واحد الآن.
function _wThrGreen() {
  const v = +(localStorage.getItem(userLsKey('tharwa-alert-green')) ?? localStorage.getItem('tharwa-alert-green') ?? DEV_IGNORE);
  return Number.isFinite(v) && v >= 0 ? v : 1;
}
function weightStateOf(cur, tgt, ticker) {
  if (!tgt && ticker && isZeroTarget(ticker)) return 'liquidate';
  if (!tgt)          return 'none';
  const thr = _wThrGreen();
  if (cur > tgt + thr) return 'over';
  if (cur < tgt - thr) return 'under';
  return 'ok';
}
const WEIGHT_STATE_META = {
  liquidate: { icon: '🔴', label: 'هدف صفر = تصفية' },
  none:  { icon: '⚪', label: 'بدون هدف' },
  over:  { icon: '🔴', label: 'زيادة عن الهدف' },
  under: { icon: '🔵', label: 'نقص عن الهدف' },
  ok:    { icon: '✅', label: 'ضمن الهدف' },
};
function weightStateColor(st) {
  // النقص أزرق معلوماتي لا «سيّئ»؛ وبلا هدف ذهبي محايد
  return st === 'liquidate' ? stateColorOf('bad')   // قرار تصفية صريح — أحمر كالزيادة
    : st === 'ok'    ? stateColorOf('good')
    : st === 'over'  ? stateColorOf('bad')
    : st === 'under' ? seriesColor(1)          // --series-2 (أزرق)
    : seriesColor(0);                          // --series-1 (ذهبي)
}

// ── Weight chart: mode switcher ───────────────────────────────
function setWeightMode(mode) {
  _weightMode = mode;
  ['bars','donut','gap','cards','table'].forEach(m => {
    document.getElementById('wm-' + m)?.classList.toggle('active', m === mode);
  });
  // show legend only for bar modes
  const leg = document.getElementById('weight-legend');
  if (leg) leg.style.display = (mode === 'bars') ? '' : 'none';
  renderWeightChart();
}

function renderWeightChart() {
  const wTotal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  const wSorted = [...holdings].sort((a, b) => {
    const av = wTotal > 0 ? +a.shares * +a.current_price / wTotal : 0;
    const bv = wTotal > 0 ? +b.shares * +b.current_price / wTotal : 0;
    return bv - av;
  });
  const wCurrent = wSorted.map(h => wTotal > 0 ? +(+h.shares * +h.current_price / wTotal * 100).toFixed(2) : 0);
  const wTarget  = wSorted.map(h => +(+h.target_weight || 0));
  const wColors  = wSorted.map((h, i) => {
    const cur = wCurrent[i], tgt = wTarget[i];
    return weightStateColor(weightStateOf(cur, tgt, h.ticker));
  });

  const chartCont = document.getElementById('weightChart-container');
  const altArea   = document.getElementById('weight-alt-area');

  // destroy donut charts whenever we leave donut mode
  if (_weightMode !== 'donut') {
    if (weightDonutCur) { weightDonutCur.destroy(); weightDonutCur = null; }
    if (weightDonutTgt) { weightDonutTgt.destroy(); weightDonutTgt = null; }
  }

  if (_weightMode === 'donut') {
    if (weightChart) { weightChart.destroy(); weightChart = null; }
    if (chartCont) chartCont.style.display = 'none';
    if (altArea)   { altArea.style.display = ''; }
    _renderWeightDonuts(wSorted, wCurrent, wTarget);
    return;
  }

  if (_weightMode === 'cards') {
    if (weightChart) { weightChart.destroy(); weightChart = null; }
    if (chartCont) chartCont.style.display = 'none';
    if (altArea)   { altArea.style.display = ''; altArea.innerHTML = _renderWeightCards(wSorted, wCurrent, wTarget, wColors); }
    return;
  }
  if (_weightMode === 'table') {
    if (weightChart) { weightChart.destroy(); weightChart = null; }
    if (chartCont) chartCont.style.display = 'none';
    if (altArea)   { altArea.style.display = ''; altArea.innerHTML = _renderWeightTable(wSorted, wCurrent, wTarget, wColors); }
    return;
  }

  // chart modes (bars / gap)
  if (altArea) altArea.style.display = 'none';
  if (chartCont) chartCont.style.display = '';

  if (weightChart) weightChart.destroy();
  const wCtx = g('weightChart')?.getContext('2d');
  if (!wCtx) return;

  const wCanvas = g('weightChart');
  const rowH    = Math.max(32, Math.min(48, Math.floor(400 / Math.max(wSorted.length, 1))));
  if (wCanvas) wCanvas.parentElement.style.height = Math.max(380, wSorted.length * rowH + 60) + 'px';

  if (_weightMode === 'gap') {
    _renderGapChart(wSorted, wCurrent, wTarget, wColors, wCtx);
  } else {
    _renderBarsChart(wSorted, wCurrent, wTarget, wColors, wCtx);
  }
}

// مخططان دائريان على مستوى السهم: الوزن الحالي مقابل الوزن المستهدف
function _renderWeightDonuts(wSorted, wCurrent, wTarget) {
  const altArea = document.getElementById('weight-alt-area');
  if (!altArea) return;

  // لون ثابت لكل سهم عبر المخططَين (حسب ترتيب الوزن الحالي)
  const colorOf = {};
  wSorted.forEach((h, i) => { colorOf[h.ticker] = seriesColor(i); });

  // بيانات الحالي — كل الأسهم التي لها وزن
  const curRows = wSorted
    .map((h, i) => ({ ticker: h.ticker, name: h.name || h.ticker, val: wCurrent[i] }))
    .filter(r => r.val > 0);

  // بيانات المستهدف — الأسهم التي لها هدف محدد فقط
  const tgtRows = wSorted
    .map((h, i) => ({ ticker: h.ticker, name: h.name || h.ticker, val: wTarget[i] }))
    .filter(r => r.val > 0)
    .sort((a, b) => b.val - a.val);

  const th = chartTheme();
  altArea.innerHTML = `
    <div class="charts-grid">
      <div>
        ${cardHead('الوزن الحالي', '', '')}
        <div class="chart-container"><canvas id="weightDonutCur"></canvas></div>
      </div>
      <div>
        ${cardHead('الوزن المستهدف', '', '')}
        <div class="chart-container">
          ${tgtRows.length
            ? '<canvas id="weightDonutTgt"></canvas>'
            : '<div class="empty-state"><div class="icon">⚖️</div><p>لم تُحدَّد أوزان مستهدفة بعد — أضفها من صفحة الأهداف</p></div>'}
        </div>
      </div>
    </div>`;

  const mk = (canvasId, rows) => {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return null;
    const tot = rows.reduce((s, r) => s + r.val, 0);
    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: rows.map(r => r.ticker),
        datasets: [{
          data: rows.map(r => r.val),
          backgroundColor: rows.map(r => colorOf[r.ticker] || th.muted),
          borderColor: th.surface, borderWidth: 2, hoverOffset: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '55%',
        plugins: {
          legend: { position: 'bottom', labels: { color: th.muted, font: { family: th.font, size: 10 }, padding: 8, usePointStyle: true, boxWidth: 8 } },
          tooltip: Object.assign(chartTooltipStyle(), {
            callbacks: {
              title: items => { const r = rows[items[0].dataIndex]; return r.ticker + (r.name && r.name !== r.ticker ? ' — ' + r.name : ''); },
              label: c => { const pct = tot > 0 ? (c.parsed / tot * 100).toFixed(1) : 0; return ' ' + c.parsed.toFixed(2) + '%  (' + pct + '% من المعروض)'; }
            }
          })
        }
      }
    });
  };

  weightDonutCur = mk('weightDonutCur', curRows);
  weightDonutTgt = tgtRows.length ? mk('weightDonutTgt', tgtRows) : null;
}

function _renderBarsChart(wSorted, wCurrent, wTarget, wColors, wCtx) {
  const wLabels = wSorted.map(h => h.ticker);
  const th = chartTheme();
  const tgtFill = tint(th.muted, '33'), tgtLine = tint(th.muted, '99');
  weightChart = new Chart(wCtx, {
    type: 'bar',
    data: {
      labels: wLabels,
      datasets: [
        { label: 'الوزن الحالي %', data: wCurrent, backgroundColor: wColors.map(c => tint(c, 'd9')), borderColor: wColors, borderWidth: 1, borderRadius: 3, barPercentage: 0.75, categoryPercentage: 0.65 },
        { label: 'الهدف %',        data: wTarget,  backgroundColor: tgtFill, borderColor: tgtLine, borderWidth: 1.5, borderRadius: 3, barPercentage: 0.75, categoryPercentage: 0.65 }
      ]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: th.muted, font: { family: th.font, size: 11 }, padding: 14, usePointStyle: true,
            generateLabels: () => (zeroTargets.size ? ['ok', 'over', 'under', 'none', 'liquidate'] : ['ok', 'over', 'under', 'none']).map(st => {
              const c = weightStateColor(st), m = WEIGHT_STATE_META[st];
              return { text: `${m.icon} ${m.label}`, fillStyle: tint(c, 'd9'), strokeStyle: c, lineWidth: 1, pointStyle: 'rect', fontColor: th.text };
            }).concat([{ text: '🎯 الهدف المحدد', fillStyle: tgtFill, strokeStyle: tgtLine, lineWidth: 1.5, pointStyle: 'rect', fontColor: th.text }])
          }
        },
        tooltip: Object.assign(chartTooltipStyle(), {
          padding: 12,
          callbacks: {
            title: items => { const h = wSorted[items[0].dataIndex]; return h.ticker + (h.name ? ' — ' + h.name : ''); },
            label: item => {
              const i = item.dataIndex, cur = wCurrent[i], tgt = wTarget[i];
              if (item.datasetIndex === 0) {
                const lines = [' الحالي: ' + cur + '%'];
                if (tgt) lines.push(' الهدف: ' + tgt + '%', ' الفارق: ' + (cur - tgt >= 0 ? '+' : '') + (cur - tgt).toFixed(2) + '%');
                else     lines.push(' الهدف: غير محدد');
                return lines;
              }
              return [' الهدف: ' + (tgt || '—') + '%'];
            },
            labelColor: item => { const c = wColors[item.dataIndex]; return { borderColor: c, backgroundColor: tint(c, 'd9') }; }
          }
        })
      },
      scales: {
        x: { ticks: { color: th.muted, font: { family: th.font, size: 11 }, callback: v => v + '%' }, grid: { color: th.grid } },
        y: { ticks: { color: th.text, font: { family: th.font, size: 10 }, autoSkip: false, callback: (_, i) => wSorted[i]?.ticker || '' }, grid: { color: th.grid } }
      }
    }
  });
}

function _renderGapChart(wSorted, wCurrent, wTarget, wColors, wCtx) {
  // Only include holdings with a target set
  const withTarget = wSorted.map((h, i) => ({ h, cur: wCurrent[i], tgt: wTarget[i] }))
    .filter(x => x.tgt > 0)
    .sort((a, b) => Math.abs(b.cur - b.tgt) - Math.abs(a.cur - a.tgt));
  const noTarget = wSorted.map((h, i) => ({ h, cur: wCurrent[i], tgt: wTarget[i] })).filter(x => !x.tgt);

  const allRows = [...withTarget, ...noTarget];
  const labels  = allRows.map(x => x.h.ticker);
  const gaps    = allRows.map(x => x.tgt > 0 ? +(x.cur - x.tgt).toFixed(2) : null);
  const colors  = allRows.map(x => weightStateColor(weightStateOf(x.cur, x.tgt, x.h && x.h.ticker)));
  const th = chartTheme();

  weightChart = new Chart(wCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'الفارق عن الهدف %',
        data: gaps,
        backgroundColor: colors.map(c => tint(c, 'd9')),
        borderColor: colors,
        borderWidth: 1, borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.7
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: Object.assign(chartTooltipStyle(), {
          padding: 12,
          callbacks: {
            title: items => { const r = allRows[items[0].dataIndex]; return r.h.ticker + (r.h.name ? ' — ' + r.h.name : ''); },
            label: item => {
              const r = allRows[item.dataIndex];
              if (!r.tgt) return [' الحالي: ' + r.cur + '%', ' الهدف: غير محدد'];
              const d = r.cur - r.tgt;
              return [
                ' الحالي: ' + r.cur + '%',
                ' الهدف:  ' + r.tgt + '%',
                ' الفارق: ' + (d >= 0 ? '+' : '') + d.toFixed(2) + '%  ' + (d > 1 ? '⬆ زيادة' : d < -1 ? '⬇ نقص' : '✓ ضمن الهدف')
              ];
            }
          }
        }),
        annotation: {}
      },
      scales: {
        x: {
          ticks: { color: th.muted, font: { family: th.font, size: 11 }, callback: v => (v >= 0 ? '+' : '') + v + '%' },
          grid:  { color: ctx => ctx.tick.value === 0 ? tint(th.text, '66') : th.grid }
        },
        y: { ticks: { color: th.text, font: { family: th.font, size: 10 }, autoSkip: false }, grid: { color: th.grid } }
      }
    }
  });
}

function _renderWeightCards(wSorted, wCurrent, wTarget, wColors) {
  const cards = wSorted.map((h, i) => {
    const cur = wCurrent[i], tgt = wTarget[i];
    const st  = weightStateOf(cur, tgt, h.ticker), meta = WEIGHT_STATE_META[st], clr = wColors[i];
    const diff = tgt ? (cur - tgt) : null;
    const diffTxt = diff !== null ? (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%' : '';
    return `<div class="w-card" style="--card-accent:${clr}">
      <div class="w-card-header">
        <span class="w-card-ticker">${esc(h.ticker)}</span>
        <span class="w-card-pct">${cur}%</span>
      </div>
      <div class="w-card-name">${esc(h.name || '')}</div>
      ${meterHtml({
        label: `هدف: ${tgt ? tgt + '%' : '—'}`,
        valueTxt: `${meta.icon} ${diffTxt || meta.label}`,
        pct: Math.min(cur * 3, 100), fillColor: clr,
        markPct: tgt ? Math.min(tgt * 3, 100) : null,
      })}
    </div>`;
  }).join('');
  return `<div class="w-cards-grid">${cards}</div>`;
}

function _renderWeightTable(wSorted, wCurrent, wTarget, wColors) {
  const rows = wSorted.map((h, i) => {
    const cur = wCurrent[i], tgt = wTarget[i];
    const st  = weightStateOf(cur, tgt, h.ticker), meta = WEIGHT_STATE_META[st], clr = wColors[i];
    const diff = tgt ? (cur - tgt) : null;
    const diffTxt  = diff !== null ? (diff >= 0 ? '+' : '') + diff.toFixed(2) + '%' : '—';
    return `<tr>
      <td><strong class="num" style="color:${clr}">${esc(h.ticker)}</strong></td>
      <td class="small">${esc(h.name || '—')}</td>
      <td>${browHtml({ name: '', color: clr, pct: Math.min(cur * 4, 100), valueTxt: `${cur}%` })}</td>
      <td class="small text-muted num">${tgt ? tgt + '%' : '—'}</td>
      <td class="small num bold" style="color:${clr}">${diffTxt}</td>
      <td class="small">${meta.icon} ${meta.label}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrapper">
    <table class="data-table full-width">
      <thead><tr><th>الرمز</th><th>الاسم</th><th>الوزن الحالي</th><th>الهدف</th><th>الفارق</th><th>الحالة</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Holdings Table (with inline editing) ──────────────────────
function renderTable() {
  const total = holdings.reduce((s, h) => s + h.shares * h.current_price, 0);
  const tbody = g('holdings-tbody');
  if (!tbody) return;

  // تحديث هيدرات الجدول بأسهم الترتيب
  const thead = document.querySelector('#holdings-table thead tr');
  if (thead) {
    const cols = [
      { key: 'ticker',        label: 'الرمز' },
      { key: 'name',          label: 'الاسم' },
      { key: 'sector',        label: 'القطاع' },
      { key: 'shares',        label: 'الأسهم' },
      { key: 'avg_price',     label: 'متوسط السعر' },
      { key: 'current_price', label: 'السعر الحالي' },
      { key: '_cost',         label: 'التكلفة' },
      { key: '_value',        label: 'القيمة' },
      { key: '_pnl',          label: 'ر/خ' },
      { key: '_weight',       label: 'الوزن' },
      { key: 'target_weight', label: 'مستهدف' },
      { key: '',              label: '' }
    ];
    thead.innerHTML = cols.map(c => c.key
      ? `<th class="sortable" onclick="sortHoldings('${c.key}')" style="cursor:pointer;user-select:none">${c.label} ${hSortArrow(c.key)}</th>`
      : `<th></th>`
    ).join('');
  }

  if (!holdings.length) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><div class="icon">📋</div><p>لا توجد أسهم — ابدأ بإضافة أول سهم</p></div></td></tr>`;
    enableInlineEditing(tbody, onHoldingSaved);
    return;
  }

  // ترتيب الصفوف
  const numKeys = new Set(['shares','avg_price','current_price','target_weight','_cost','_value','_pnl','_weight']);
  const sorted = [...holdings].sort((a, b) => {
    if (!hSortField) return 0;
    let av, bv;
    if (hSortField === '_cost')   { av = a.shares * a.avg_price;     bv = b.shares * b.avg_price; }
    else if (hSortField === '_value')  { av = a.shares * a.current_price; bv = b.shares * b.current_price; }
    else if (hSortField === '_pnl')    { av = (a.shares * a.current_price) - (a.shares * a.avg_price); bv = (b.shares * b.current_price) - (b.shares * b.avg_price); }
    else if (hSortField === '_weight') { av = total > 0 ? a.shares * a.current_price / total : 0; bv = total > 0 ? b.shares * b.current_price / total : 0; }
    else { av = a[hSortField]; bv = b[hSortField]; }
    if (numKeys.has(hSortField)) { av = +av || 0; bv = +bv || 0; }
    if (av < bv) return hSortDir === 'asc' ? -1 : 1;
    if (av > bv) return hSortDir === 'asc' ? 1  : -1;
    return 0;
  });

  tbody.innerHTML = sorted.map(h => {
    const cost  = h.shares * h.avg_price;
    const value = h.shares * h.current_price;
    const pnl   = value - cost;
    const pnlP  = cost > 0 ? pnl / cost * 100 : 0;
    const wt    = total > 0 ? value / total * 100 : 0;
    const cls   = pnl >= 0 ? 'text-success' : 'text-danger';

    // ── مؤشر قِدم السعر ───────────────────────────────────────
    const ageDays = getPriceAgeDays(h.ticker);
    let staleBadge = '';
    if (h.price_manual) {
      // سعر يدوي — انقر ✋ لإرجاع السهم للتحديث التلقائي
      staleBadge = `<span title="سعر يدوي (مستثنى من التحديث التلقائي) — انقر لإرجاعه تلقائياً"
        onclick="event.stopPropagation(); unmarkManualPrice('${esc(h.id)}')"
        style="color:var(--st-warn);font-size:0.7rem;margin-right:4px;cursor:pointer">✋</span>`;
    } else if (ageDays === null) {
      staleBadge = `<span title="السعر لم يُحدَّث بعد — انقر 🔄 لتحديث الأسعار"
        style="color:var(--text-muted);font-size:0.7rem;margin-right:4px;cursor:help">⏰?</span>`;
    } else if (ageDays > STALE_DAYS) {
      staleBadge = `<span title="السعر قديم — آخر تحديث منذ ${Math.floor(ageDays)} يوم"
        style="color:var(--danger);font-size:0.7rem;margin-right:4px;cursor:help">⏰${Math.floor(ageDays)}ي</span>`;
    }

    return `<tr>
      <td ${ed('holdings',h.id,'ticker','text',h.ticker)}><strong class="text-accent">${esc(h.ticker)}</strong></td>
      <td ${ed('holdings',h.id,'name','text',h.name)}>${esc(h.name)}</td>
      <td ${ed('holdings',h.id,'sector','text',h.sector||'','text-muted small')}>${esc(h.sector || '—')}</td>
      <td ${ed('holdings',h.id,'shares','number',h.shares)}>${formatShares(h.shares)}</td>
      <td ${ed('holdings',h.id,'avg_price','number',h.avg_price)}>${formatSAR(h.avg_price)}</td>
      <td ${ed('holdings',h.id,'current_price','number',h.current_price)}>${staleBadge}${formatSAR(h.current_price)}</td>
      <td class="num">${formatSAR(cost)}</td>
      <td class="num bold">${formatSAR(value)}</td>
      <td class="num ${cls}">${formatSAR(pnl,true)}<br><span class="small">${(pnl>=0?'+':'')}${pnlP.toFixed(2)}%</span></td>
      <td class="num">${wt.toFixed(2)}%</td>
      <td class="text-muted" title="هدف الوزن يُحفظ في «أهداف الأسهم والقطاعات» — وهو المصدر الذي يقرؤه محرّك القرار. التحرير هنا كان يُداس عند إعادة التحميل.">${(+h.target_weight||0).toFixed(2)}%</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="openModal('${esc(h.id)}')">تعديل</button>
          <button class="btn btn-danger btn-sm"    onclick="deleteHolding('${esc(h.id)}')">حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  enableInlineEditing(tbody, onHoldingSaved);
}

async function onHoldingSaved(id, field, val) {
  const h = holdings.find(x => x.id === id);
  if (h) h[field] = val;
  // لو عدّل السعر يدوياً — ضع علامة حتى لا يُلمس في الـ refresh التلقائي
  if (field === 'current_price' && h) {
    h.price_manual = true;
    // تعديل السعر يدوياً = سعر حالي حقيقي: اختم وقت التحديث حتى لا يُعتبر قديماً
    const nowISO = new Date().toISOString();
    h.price_updated_at = nowISO;
    _priceTimestamps[h.ticker] = nowISO;
    _savePriceTimestamps();
    // AUDIT-FIX 2026-08: فحص خطأ التحديث — فشله الصامت كان يترك السعر اليدوي
    // عرضة للدوس في refresh التالي دون علم المستخدم
    const { error } = await supabaseClient.from('holdings')
      .update({ price_manual: true, price_updated_at: nowISO }).eq('id', id);
    if (error) {
      console.warn('price_manual update failed:', error);
      showToast('⚠️ تعذّر حفظ علامة السعر اليدوي — قد يُستبدل بالتحديث التلقائي', 'warning');
    }
    checkPriceZones(h.ticker, +val);
  }
  renderAllCards();
}

// إلغاء علامة «سعر يدوي» وإرجاع السهم للتحديث التلقائي (نقرة على ✋)
async function unmarkManualPrice(id) {
  const h = holdings.find(x => x.id === id);
  if (!h) return;
  h.price_manual = false;
  const { error } = await supabaseClient.from('holdings')
    .update({ price_manual: false }).eq('id', id);
  if (error) { showToast('تعذّر الإرجاع للتلقائي: ' + error.message, 'error'); return; }
  showToast(`↩️ ${h.ticker} رجع للتحديث التلقائي — جارٍ جلب السعر…`, 'success');
  renderTable();
  await refreshPrices(true);   // اجلب السعر التلقائي فوراً ليُختم بوقت جديد
}

// ── Price Zone Alerts ─────────────────────────────────────────
function checkPriceZones(ticker, price) {
  const zone = stockZones[ticker];
  if (!zone) return;
  const h = holdings.find(x => x.ticker === ticker);
  const name = h?.name || '';
  const alerts = [];
  // اللون يُستمد من نوع الـtoast (success/error) لا من قيمة مكتوبة هنا
  if (zone.entry_price != null && price <= zone.entry_price)
    alerts.push({ ticker, name, type: 'entry', label: 'منطقة شراء', price, zone: zone.entry_price });
  if (zone.exit_price != null && price >= zone.exit_price)
    alerts.push({ ticker, name, type: 'exit', label: 'منطقة بيع', price, zone: zone.exit_price });
  alerts.forEach(a => showPriceZoneAlert(a));
}

function showPriceZoneAlert({ ticker, label, price, zone, name }) {
  // منع تكرار نفس الإشعار
  const dedupKey = 'pz-shown-' + ticker + '-' + label;
  if (sessionStorage.getItem(dedupKey)) return;
  sessionStorage.setItem(dedupKey, '1');

  const icon = label === 'منطقة شراء' ? '🟢' : '🔴';
  const action = label === 'منطقة شراء' ? 'وصل الحد' : 'تجاوز الحد';
  // AUDIT-FIX 2026-08: showToast يعرض النص خاماً (textContent) — لا وسوم HTML هنا
  const msg = `${icon} ${ticker}${name ? ` (${name})` : ''} — ${label}! السعر الحالي ${price} ${action} ${zone}`;
  const type = label === 'منطقة شراء' ? 'success' : 'error';
  showToast(msg, type);
}

// سكة المناطق لسهم واحد — نفس منطق priceRulerHtml في decision-engine.js:
// نطاق lo/hi يضم كل النقاط + السعر، بهامش 15% من المدى، وتسميات بصفّين متبادلين.
// السكّة الأفقية الأصلية — لم تعد مستعملة في «مناطق الدخول والخروج» بعد
// اعتماد سُلَّم السعر (2026-08-23)، وتُركت لأي مستدعٍ آخر.
function _zoneRailHtml(pts, price) {
  if (!pts.length || !(price > 0)) return '';
  const vals = pts.map(p => p.v).concat([price]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo;
  const pad  = span > 0 ? span * 0.15 : Math.max(hi * 0.08, 0.5);
  lo -= pad; hi += pad;
  const pos = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));

  const sorted = [...pts].sort((a, b) => a.v - b.v);
  const marks  = sorted.map((p, i) => `
      <span class="zrail-tick" data-k="${p.k}" style="left:${pos(p.v).toFixed(1)}%"></span>
      <span class="zrail-lbl" data-row="${i % 2}" style="left:${pos(p.v).toFixed(1)}%">${p.lbl}<b>${formatNum(p.v)}</b></span>`).join('');

  return `<div class="zrail"><div class="zrail-track">${marks}
      <span class="zrail-now" style="left:${pos(price).toFixed(1)}%"><b>${formatNum(price)}</b><i>السعر الآن</i></span>
    </div></div>`;
}

function renderPriceZonesCard() {
  const el = document.getElementById('price-zones-card-body');
  if (!el) return;
  const totalValue = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  const rows = [];
  holdings.forEach(h => {
    const zone     = stockZones[h.ticker] || {};
    const trimFrom = trimZonesMap[h.ticker] ?? null;
    // قرار المالك المسجّل في «التقييمات العادلة» — تصفية/تخفيف/مراقبة…
    const taskType = stockTaskMap[h.ticker] || null;
    const isLiq    = taskType === 'liquidation';
    // AUDIT 2026-08-23 — بلاغ المالك: «عندي سبعة أسهم قرّرت تصفيتها في
    // التقييمات العادلة، وما تبيّن لي هنا». كان الفلتر يشترط وجود منطقة سعرية،
    // فالسهم المُقرَّر تصفيته بلا مناطق **يختفي من البطاقة كلياً** — وهو أوْلى
    // الأسهم بالظهور. الآن: قرارك بالتصفية يُدخله ولو بلا أي منطقة.
    if (zone.entry_price == null && zone.exit_price == null && trimFrom == null && !isLiq) return;
    const price = +h.current_price;

    // نقاط السكة (نفس المصادر والشروط السابقة — لا تغيير في الحساب)
    const pts = [];
    if (zone.entry_price != null) pts.push({ v: +zone.entry_price, lbl: 'تجميع', k: 'buy'  });
    if (trimFrom       != null)   pts.push({ v: +trimFrom,         lbl: 'تخفيف', k: 'trim' });
    if (zone.exit_price != null)  pts.push({ v: +zone.exit_price,  lbl: 'تصفية', k: 'exit' });

    // الوسوم: أي منطقة فعّالة الآن (نفس شروط الجدول السابق)
    const tags = [];
    let urgency = 0;   // للفرز: تصفية > تخفيف > تجميع > محايد
    if (zone.entry_price != null && price <= zone.entry_price) {
      urgency = Math.max(urgency, 2);
      tags.push(tagHtml('🟢', `في منطقة تجميع — السعر ${formatNum(price)} ≤ ${formatNum(zone.entry_price)}`, 'good'));
      const currentW = totalValue > 0 ? (+h.shares * price) / totalValue * 100 : 0;
      const targetW  = stockTargets[h.ticker] || 0;
      if (targetW > 0 && currentW >= targetW * 0.95)
        tags.push(tagHtml('⚠️', 'الهدف مكتمل', 'warn'));
    }
    if (trimFrom != null && price >= trimFrom) {
      urgency = Math.max(urgency, 3);
      tags.push(tagHtml('⚖️', `في منطقة تخفيف — السعر ${formatNum(price)} ≥ ${formatNum(trimFrom)}`, 'warn'));
    }
    if (zone.exit_price != null && price >= zone.exit_price) {
      urgency = Math.max(urgency, 4);
      tags.push(tagHtml('🔴', `في منطقة تصفية — السعر ${formatNum(price)} ≥ ${formatNum(zone.exit_price)}`, 'bad'));
    }
    // قرارك المسجّل يتقدّم على الموقع السعري في الترتيب — هو قرار لا إشارة.
    // فصل صريح بين مفهومين كانا مدمجين في متغيّر واحد فتلوّثا:
    //   priceZone = أين يقع **السعر** (يقود اللون)
    //   urgency   = ترتيب العرض (يقود الفرز وحده)
    // دمجهما جعل رفع الأولوية للتصفية يمسح لون منطقة السعر ويجعله «محايداً».
    const priceZone = urgency === 4 ? 'exit' : urgency === 3 ? 'trim' : urgency === 2 ? 'buy' : 'none';
    if (isLiq) {
      // urgency 5 للفرز فقط (يتصدّر البطاقات) — لا أثر بصري له.
      urgency = 5;
      // بوكس صغير بنفس هيئة «الهدف مكتمل» — طلب المالك 2026-08-23 بعد رفض
      // تلوين البطاقة كلها: «حطّ لي بوكس صغير جوّه أو إيموجي واحدة أفهمها».
      tags.unshift(tagHtml('🚩', 'تصفية', 'bad'));
    }
    // بين التجميع والتخفيف: لا منطقة فعّالة ⇒ الرسالة صريحة بلا لبس
    if (!tags.length) tags.push(tagHtml('⚪', 'لا تتخذ أي إجراء', ''));

    rows.push({ ticker: h.ticker, name: h.name, pts, price, tags: tags.join(''), urgency, priceZone, isLiq });
  });

  if (!rows.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="icon">🎯</div>
      <p>لا توجد مناطق سعرية مُعرَّفة — أضفها من <a href="tasks.html" class="text-accent">التقييمات العادلة</a></p>
    </div>`;
    return;
  }

  // فرز عرضي فقط: الأسهم داخل منطقة فعّالة أولاً (الأشد أولاً)، ثم الباقي
  rows.sort((a, b) => b.urgency - a.urgency);

  // ══════════════════════════════════════════════════════════════════
  // عرض مدمج — طلب المالك 2026-08-23: «السكة بعرض الشاشة مخلّية الصفحة
  // ضايعة… اضغطها على اليسار وحطّ البيانات على اليمين، كرت بسيط».
  //
  // كانت كل سهم صفّاً كامل العرض: سكّة تمتدّ من الحافة للحافة لعرض ثلاث
  // نقاط سعرية فقط. المساحة تكبر والمعلومة لا تكبر معها — والعين تقطع
  // الشاشة كلها لتقرأ رقمين.
  //
  // الآن: شبكة بطاقات (بحدّ أدنى 320px لكل بطاقة) تملأ العرض جنباً إلى
  // جنب. داخل كل بطاقة: الرمز والحالة أعلى، ثم **السكّة على اليمين**
  // (اتجاه الصفحة RTL) و**الأرقام مصفوفة بجانبها**. فتُقرأ البطاقة في
  // نظرة واحدة، وتُعرض ثلاث أو أربع بطاقات في مساحة صفّ واحد سابقاً.
  // لا تغيير في أي حساب — العرض وحده.
  // ══════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════
  // «سُلَّم السعر» — أُعيد التصميم 2026-08-23 بعد ملاحظة المالك:
  // «ما أنا قادر أميّز هو الآن تجميع ولا تخفيف ولا تصفية… السكّة والدائرة
  //  ما أفهمها».
  //
  // المحاولة السابقة وضعت سكّة رأسية ملوّنة **بعيدة** عن الأرقام، وأرقاماً
  // في عمودين بترتيب عشوائي. فكان على العين أن تربط لوناً على سكّة برقم في
  // عمود مقابل — عملٌ ذهني لا يؤدّيه القارئ، ولا يقول أين هو الآن.
  //
  // البديل يحذف السكّة كلياً: **قائمة واحدة مرتّبة بالسعر تنازلياً**،
  // والسعر الحالي **مُدرَج داخلها في موضعه الصحيح**. فتصير قراءة الموقع
  // بديهية: ما فوقه أغلى وما تحته أرخص، وسطره مُبرَز بسهم «أنت هنا».
  // لا رموز تحتاج تفسيراً، ولا ربط بصري بين عنصرين متباعدين.
  // لا تغيير في أي حساب — العرض وحده.
  // ══════════════════════════════════════════════════════════════════
  const ZK = {
    exit: { lbl: 'تصفية', k: 'exit' },
    trim: { lbl: 'تخفيف', k: 'trim' },
    buy:  { lbl: 'تجميع', k: 'buy'  },
  };

  el.innerHTML = `<div class="zone-cards">${rows.map(r => {
    const steps = r.pts.map(p => ({ v: p.v, lbl: (ZK[p.k] || {}).lbl || p.lbl, k: p.k, now: false }));
    steps.push({ v: r.price, lbl: 'السعر الآن', k: 'now', now: true });
    steps.sort((a, b) => b.v - a.v);                    // الأغلى أعلى

    // لون سطر «السعر الآن» يتبع المنطقة التي بلغها فعلاً — طلب المالك 2026-08-23.
    // نُعيد استعمال `urgency` المحسوبة أصلاً للفرز، فلا معيار ثانٍ يتفرّع عنه:
    //   4 تصفية · 3 تخفيف · 2 تجميع · 0 خارج كل المنطقة
    // الألوان من رموز التصميم (‎--st-*-dim‎ خلفيةً و‎--st-*‎ حدّاً ونصّاً) لا
    // ألوان سطرية: هادئة بالتصميم، وتتبدّل مع الوضع الفاتح/الداكن تلقائياً.
    // اللون يتبع **موقع السعر** وحده: قرار التصفية يظهر ببوكسه الخاص أعلاه،
    // فلا يُلوَّن سطر السعر أحمر وسعرُه في منطقة تجميع — رقمان مختلفان.
    const nowZone = r.priceZone || 'none';
    const body = steps.map(st => `
      <div class="zs-row${st.now ? ' zs-now' : ''}" data-k="${st.k}"${st.now ? ` data-zone="${nowZone}"` : ''}>
        <span class="zs-lbl">${st.now ? '◀ ' : ''}${st.lbl}</span>
        <span class="zs-val num">${formatNum(st.v)}</span>
      </div>`).join('');

    return `<div class="zone-card">
      <div class="zc-head">
        <strong class="text-accent num">${esc(r.ticker)}</strong>
        <span class="zc-name">${esc(r.name || '')}</span>
      </div>
      <div class="zc-tags">${r.tags}</div>
      <div class="zs-ladder">${body}</div>
    </div>`;
  }).join('')}</div>`;
}

// ── Break-Even Card ───────────────────────────────────────────
function setBreakevenMode(mode) {
  breakevenMode = mode;
  if (beChart && mode !== 'chart') { beChart.destroy(); beChart = null; }
  ['summary','detail','bars','chart'].forEach(m => {
    const btn = document.getElementById('be-mode-' + m);
    if (btn) {
      btn.className = 'btn btn-sm ' + (m === mode ? 'btn-primary' : 'btn-secondary');
      btn.style.cssText = 'border-radius:0;border:none;padding:4px 10px;font-size:0.76rem';
    }
  });
  renderBreakEvenCard();
}

// ══════════════════════════════════════════════════════════════════════
// شريط الخطة المحفوظة — «الهدف ده، بالتاريخ ده»
// ----------------------------------------------------------------------
// الخطة تُحفَظ في الرؤية المستقبلية ثم لا تُرى إلا هناك. وأول ما تفتحه كل
// يوم هو هذه اللوحة، فيغيب عنها الرقم الذي تُبنى عليه بقية الأرقام.
//
// وقياس التقدّم هنا **مقابل مسار الخطة نفسها لا مقابل الهدف البعيد**:
// نسبةُ اليوم من هدف 2045 تقول «أنت عند 18%» وهي بلا معنى — التركيب يفعل
// معظم العمل في السنوات الأخيرة، فالرقم يبدو متأخراً دائماً وهو في موعده.
// الخطة تحفظ مسارها السنوي، فنقارنك بما توقّعته هي **لهذه السنة**.
const DASH_PLANS_KEY = 'forecast_plans_v1';
let _dashPlan = null;

async function loadDashPlan() {
  try {
    const rows = await loadUserSetting(DASH_PLANS_KEY);
    if (!Array.isArray(rows) || !rows.length) return null;
    // لا نثق بترتيبة التخزين — الأحدث بالتاريخ لا بالموضع
    const sorted = rows.slice().sort((a, b) => {
      const ta = Date.parse(b.createdISO || 0) || +b.id || 0;
      const tb = Date.parse(a.createdISO || 0) || +a.id || 0;
      return ta - tb;
    });
    return sorted[0] || null;
  } catch (_) { return null; }
}

function renderPlanGoalStrip() {
  const el = document.getElementById('plan-goal-strip');
  if (!el) return;
  const p = _dashPlan;
  if (!p || !p.inp) { el.style.display = 'none'; return; }
  el.style.display = '';

  const inp = p.inp || {};
  const isIncome = inp.goalType === 'monthly_income';
  const goalAmt  = +inp.goalAmount || 0;
  const years    = +inp.horizonYears || 0;
  const baseYear = +p.baseYear || (new Date(p.createdISO || Date.now())).getFullYear();
  const targetYear = baseYear + years;
  const now = new Date();
  const elapsed = Math.max(0, now.getFullYear() - baseYear);
  const left = Math.max(0, targetYear - now.getFullYear());

  // ما توقّعته الخطة لهذه السنة — من مسارها المحفوظ
  const path = Array.isArray(p.path) ? p.path : [];
  const due  = path.find(s => +s.year === elapsed) || null;
  // نفس مصدر بطاقة «إجمالي قيمة المحفظة» أعلاه: أسهم + نقد — وإلا قارنّا رقمين مختلفين
  const have = (Array.isArray(holdings) && holdings.length)
    ? holdings.reduce((a, h) => a + (+h.shares) * (+h.current_price), 0) + (+portfolioCash || 0)
    : null;

  let track = '';
  if (due && due.value > 0 && have != null) {
    const r = have / due.value;
    const off = Math.abs(r - 1) * 100;
    const [ic, col, txt] = r >= 0.98 ? ['🟢', 'var(--st-good,#22c55e)', 'في موعدها']
      : r >= 0.90 ? ['🟡', 'var(--st-warn,#f59e0b)', `متأخّرة ${off.toFixed(0)}%`]
      : ['🔴', 'var(--st-bad,#ef4444)', `متأخّرة ${off.toFixed(0)}%`];
    track = `<span style="color:${col}" title="الخطة توقّعت ${formatSAR(due.value)} لسنة ${baseYear + elapsed}؛ عندك ${formatSAR(have)}">`
          + `${ic} ${txt}</span>`;
  } else if (have != null && !due) {
    track = `<span class="text-muted" title="مسار الخطة لا يغطّي هذه السنة">— لا مقارنة لهذه السنة</span>`;
  }

  const goalTxt = isIncome
    ? `<strong>${formatSAR(goalAmt)}</strong> شهرياً`
    : `<strong>${formatSAR(goalAmt)}</strong>`;
  const pmtTxt = p.alreadyReached ? 'لا حاجة لضخ'
    : (p.requiredPMT == null || p.impossible) ? '—'
    : `${formatSAR(p.requiredPMT)} / شهر`;

  el.innerHTML =
      `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">`
    + `<span style="font-size:1.05rem">🎯</span>`
    + `<span><strong>خطتك المحفوظة</strong>${p.notes ? ` · ${esc(p.notes)}` : ''}</span>`
    + `<span class="text-muted" style="font-size:.78rem">${esc(p.date || '')}</span>`
    + `<span style="flex:1"></span>`
    + `<a href="forecast.html#plans" style="font-size:.8rem;color:var(--accent);text-decoration:none">الرؤية المستقبلية ←</a>`
    + `</div>`
    + `<div style="margin-top:6px;display:flex;gap:18px;flex-wrap:wrap;font-size:.88rem;line-height:1.9">`
    + `<span>الهدف: ${goalTxt} <span class="text-muted">بحلول</span> <strong>${targetYear}</strong>`
    + `<span class="text-muted"> (${left} سنة)</span></span>`
    + `<span><span class="text-muted">الضخ المطلوب:</span> <strong>${pmtTxt}</strong></span>`
    + (track ? `<span>${track}</span>` : '')
    + `</div>`;
}

function renderBreakEvenCard() {
  const el = document.getElementById('breakeven-body');
  if (!el) return;

  const s = window._ds || {};

  // ── المدخلات الأساسية ─────────────────────────────────────
  const netCapital   = s.totalInvested   || 0;   // buys - sells
  const totalDivAll  = s.totalDivAll     || 0;
  const realizedPnL  = s.realizedPnL     || 0;
  const grantMap     = s.grantMap        || {};

  // قيمة المحفظة والتكلفة الحالية
  const currentValue = holdings.reduce((acc, h) => acc + +h.shares * +h.current_price, 0);
  const costBasis    = holdings.reduce((acc, h) => acc + +h.shares * +h.avg_price, 0);

  // قيمة المنح بالسعر الحالي
  const grantValueNow = Object.entries(grantMap).reduce((acc, [ticker, grantShares]) => {
    const h = holdings.find(x => x.ticker === ticker);
    return acc + (h ? +h.current_price * grantShares : 0);
  }, 0);

  // ── المعادلة الكاملة ──────────────────────────────────────
  // currentValue يشمل أسهم المنح (موجودة في holdings) — لا نضيف grantValueNow مرة ثانية
  // AUDIT-FIX (2026-07): حصيلة البيع مخصومة أصلاً من رأس المال المنشغل (مشتريات − مبيعات)،
  // فإضافتها مرة أخرى كـ«نقد عائد» كانت تحتسبها مرتين وتضخّم الربح الحقيقي بمقدار
  // min(النقد، المبيعات). المعادلة الصحيحة — مطابقة لكرت «إجمالي الربح منذ البداية»:
  //   إجمالي العوائد = قيمة المحفظة + التوزيعات   مقابل   رأس المال = مشتريات − مبيعات
  const totalReturns = currentValue + totalDivAll;

  // صافي الربح/الخسارة الحقيقي = إجمالي العوائد − ما أنفق
  const trueNetPnL   = totalReturns - netCapital;

  // ر/خ غير محقق (ارتفاع/انخفاض السعر)
  const unrealizedPnL = currentValue - costBasis;

  // نسبة العائد الكلي على رأس المال
  const totalReturnPct = netCapital > 0 ? (trueNetPnL / netCapital * 100) : 0;

  // نقطة التعادل: نسبة الاسترداد الخام (بلا سقف) للعرض التفسيري،
  // ونسخة مسقوفة بـ200% لعرض الشريط فقط (المسار لا يتجاوز طرفه).
  // AUDIT-FIX (2026-08-18): السقف كان يُطبَّق على الرقم المعروض أيضاً، فمحفظة
  // استرجعت 300% تظهر 200% — أي بخس صامت. الآن السقف للشريط وحده.
  const recoveredRaw = netCapital > 0 ? totalReturns / netCapital * 100 : 0;
  const breProgress = Math.min(recoveredRaw, 200);
  const isBreakEven = trueNetPnL >= 0;
  const gapToBreakEven = netCapital - totalReturns; // سالب = تجاوزت نقطة التعادل

  // ── بناء الكرت ──────────────────────────────────────────
  const pnlState  = trueNetPnL >= 0 ? 'good' : 'bad';
  const pnlIcon   = trueNetPnL >= 0 ? '✅' : '❌';
  const barState  = isBreakEven ? 'good' : (breProgress > 75 ? 'warn' : 'bad');
  const barIcon   = isBreakEven ? '✅' : (breProgress > 75 ? '⚠️' : '🔴');

  const row = (label, val, sub = '') =>
    [`${label}${sub ? ` <span class="text-muted">${sub}</span>` : ''}`, val];

  // ── الرقم القائد: المسافة من رأس مالك، لا نسبة الاسترداد ──────────
  // AUDIT-FIX (2026-08-18، بطلب المالك): كان الرقم القائد «102.3%» فيُقرأ
  // للوهلة الأولى «ربحت 102%»، والصحيح أنه استرداد 100% (رأس المال) + 2.3%
  // ربحاً. الرقمان كانا معروضين معاً (الهيرو 102.3% والوسم 2.30%) فيتناقض
  // العرض مع نفسه. الآن الرقم القائد هو المسافة عن رأس المال وحدها:
  //   +2.3% أخضر = فوق رأس مالك · −1.4% أحمر = يأكل من رأس مالك
  // ونسبة الاسترداد تبقى تفصيلاً تحت الشريط لمن أراد التحقّق، لا عنواناً.
  const recoveredPct = breProgress;                        // للشريط (مسقوف 200%)
  const aboveBE      = totalReturnPct;                     // = (العوائد−رأس المال)/رأس المال — بلا سقف
  const _mBE = assessMetricMaturity('breakeven', (window._ds || {}).mCtx);
  const _beBadge = maturityBadge(_mBE.level, _mBE.reason);
  const signTxt  = `${aboveBE >= 0 ? '+' : '−'}${Math.abs(aboveBE).toFixed(2)}`;
  const recoveredCaption = `استرجعت <b>${recoveredRaw.toFixed(1)}%</b> من رأس مالك `
    + `(100% = رأس مالك بالضبط، فالفرق ${signTxt}%)` + _beBadge;

  const heroBlock = `
    <div>
      <div class="hero-num ${isBreakEven ? 'text-success' : 'text-danger'}">${signTxt}<span class="unit">%</span></div>
      <div class="hero-cap">${isBreakEven ? 'فوق رأس مالك' : 'تحت رأس مالك — يأكل من رأس المال'}
        · التعادل = 0%${_beBadge}</div>
    </div>
    <div class="flex gap-2" style="flex-wrap:wrap">
      ${tagHtml(pnlIcon, `${trueNetPnL >= 0 ? 'ربح' : 'خسارة'} ${formatSAR(Math.abs(trueNetPnL))}`, pnlState)}
      ${tagHtml(barIcon, isBreakEven ? 'استرجعت كامل رأس مالك' : `يلزم ${formatSAR(gapToBreakEven)} لاسترجاع رأس مالك`, barState)}
    </div>`;

  // المسار يمتد من ٠٪ إلى ٢٠٠٪ من رأس المال، فتقع علامة رأس المال (١٠٠٪) في منتصفه.
  // قيمة الشريط تُعرض بالتأطير نفسه (المسافة عن رأس المال) حتى لا يتناقض مع الهيرو.
  const progressBar = meterHtml({
    label: 'موقعك من رأس مالك — العلامة = رأس مالك',
    valueTxt: `${signTxt}%`,
    pct: recoveredPct / 2, state: barState, markPct: 50,
    foot: recoveredCaption,
  });

  // ════════════════════════════════════════
  // وضع 1: ملخص — الأرقام الرئيسية فقط
  // ════════════════════════════════════════
  if (breakevenMode === 'summary') {
    el.innerHTML = `<div class="stack-4">
      ${heroBlock}
      ${progressBar}
      ${kvsHtml([
        ['القيمة السوقية',     formatSAR(currentValue)],
        ['الأرباح الموزعة',    formatSAR(totalDivAll)],
        ['رأس المال المنشغل',  formatSAR(netCapital)],
      ])}
    </div>`;
    return;
  }

  // ════════════════════════════════════════
  // وضع 2: تفصيل — كل الحسابات
  // ════════════════════════════════════════
  if (breakevenMode === 'detail') {
    el.innerHTML = `<div class="stack-4">
      ${heroBlock}
      ${progressBar}
      <div class="stack-2">
        <div class="small bold text-muted">التكلفة</div>
        ${kvsHtml([row('رأس المال المنشغل الصافي (مشتريات − مبيعات)', formatSAR(netCapital))])}
      </div>
      <div class="stack-2">
        <div class="small bold text-muted">العوائد</div>
        ${kvsHtml([
          row('قيمة المحفظة الحالية', formatSAR(currentValue), grantValueNow > 0 ? `(يشمل منحة ${s.totalGrantShares || 0} سهم)` : ''),
          row('إجمالي الأرباح الموزعة (كل الأوقات)', formatSAR(totalDivAll)),
          row('إجمالي العوائد', formatSAR(totalReturns)),
        ])}
      </div>
      <div class="stack-2">
        <div class="small bold text-muted">تحليل الأداء</div>
        ${kvsHtml([
          row('ر/خ غير محقق (تغير السعر فقط)', `${unrealizedPnL >= 0 ? '✅' : '❌'} ${formatSAR(unrealizedPnL)}`),
          row('ر/خ محقق من المبيعات', `${realizedPnL >= 0 ? '✅' : '❌'} ${formatSAR(realizedPnL)}`),
          row('مساهمة الأرباح الموزعة', formatSAR(totalDivAll)),
        ])}
      </div>
    </div>`;
    return;
  }

  // ════════════════════════════════════════
  // وضع 3: مساهمة — مقاييس أفقية
  // ════════════════════════════════════════
  if (breakevenMode === 'bars') {
    // كل مكوّن كنسبة من رأس المال المنشغل
    const components = [
      { label: 'ر/خ ورقي (القيمة السوقية)', value: unrealizedPnL, color: seriesColor(1) },
      { label: 'ر/خ محقق من المبيعات',      value: realizedPnL,   color: seriesColor(2) },
      { label: 'أرباح موزعة مستلمة',        value: totalDivAll,   color: seriesColor(5) },
    ];

    const totalComponents = components.reduce((s, c) => s + Math.max(0, c.value), 0);
    const componentBars = components.map(c => {
      const widthPct = totalComponents > 0 ? Math.max(0, c.value) / totalComponents * 100 : 0;
      const absPct   = netCapital > 0 ? (Math.abs(c.value) / netCapital * 100).toFixed(1) : '0.0';
      const neg      = c.value < 0;
      return meterHtml({
        label: `${neg ? '❌' : '✅'} ${c.label}`,
        valueTxt: `${c.value >= 0 ? '+' : ''}${formatSAR(c.value)} (${absPct}%)`,
        pct: widthPct,
        state: neg ? 'bad' : '',
        fillColor: neg ? '' : c.color,
      });
    }).join('');

    el.innerHTML = `<div class="stack-4">
      ${heroBlock}
      ${progressBar}
      <div class="stack">
        <div class="small bold text-muted">مساهمة كل مكوّن في إجمالي العوائد (${formatSAR(totalReturns)})</div>
        ${componentBars}
      </div>
      ${kvsHtml([
        ['رأس المال المنشغل', formatSAR(netCapital)],
        ['إجمالي العوائد',    formatSAR(totalReturns)],
        ['صافي الربح / الخسارة', `${pnlIcon} ${formatSAR(Math.abs(trueNetPnL))} (${Math.abs(totalReturnPct).toFixed(2)}%)`],
      ])}
    </div>`;
    return;
  }

  // ════════════════════════════════════════
  // وضع 4: مخطط — Chart.js مقارنة بصرية
  // ════════════════════════════════════════
  if (breakevenMode === 'chart') {
    if (beChart) { beChart.destroy(); beChart = null; }

    const beSeries = { cap: stateColorOf('bad'), mkt: seriesColor(1), div: seriesColor(2) };

    el.innerHTML = `<div class="stack-4">
      ${heroBlock}
      ${progressBar}

      <!-- Canvas للمخطط -->
      <div class="chart-container"><canvas id="be-chart-canvas"></canvas></div>

      <!-- وسيلة إيضاح -->
      <div class="flex-center gap-3" style="flex-wrap:wrap">
        <span class="small"><span class="dot" style="background:${beSeries.cap}"></span> رأس المال</span>
        <span class="small"><span class="dot" style="background:${beSeries.mkt}"></span> قيمة المحفظة</span>
        <span class="small"><span class="dot" style="background:${beSeries.div}"></span> أرباح موزعة</span>
      </div>
    </div>`;

    // نبني المخطط بعد أن يُدرَج الـ canvas في DOM
    requestAnimationFrame(() => {
      const canvas = document.getElementById('be-chart-canvas');
      if (!canvas) return;

      // بيانات المخطط: شريطان أفقيان متراكمان
      // 1. رأس المال (شريط واحد أحمر)
      // 2. العوائد مكدّسة: قيمة المحفظة + أرباح + نقد
      const th = chartTheme();
      beChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: ['رأس المال المنشغل', 'إجمالي العوائد'],
          datasets: [
            {
              label: 'رأس المال',
              data: [netCapital, 0],
              backgroundColor: tint(beSeries.cap, 'b3'),
              borderColor: beSeries.cap,
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: 'قيمة المحفظة',
              data: [0, currentValue],
              backgroundColor: tint(beSeries.mkt, 'b3'),
              borderColor: beSeries.mkt,
              borderWidth: 1,
              borderRadius: 0,
            },
            {
              label: 'أرباح موزعة',
              data: [0, totalDivAll],
              backgroundColor: tint(beSeries.div, 'b3'),
              borderColor: beSeries.div,
              borderWidth: 1,
              borderRadius: 0,
            },
          ],
        },
        options: {
          indexAxis: 'y',   // horizontal bars
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: Object.assign(chartTooltipStyle(), {
              rtl: true,
              callbacks: {
                label: ctx => `  ${ctx.dataset.label}: ${formatSAR(ctx.raw)}`,
                afterBody: items => {
                  if (items[0].dataIndex === 1) {
                    return [`  ─────────────────`, `  الإجمالي: ${formatSAR(totalReturns)}`];
                  }
                  return [];
                },
              },
            }),
          },
          scales: {
            x: {
              stacked: true,
              ticks: { color: th.muted, font: { family: th.font, size: 11 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'K' : v },
              grid: { color: th.grid },
            },
            y: {
              stacked: true,
              ticks: { color: th.text, font: { family: th.font, size: 12 } },
              grid: { display: false },
            },
          },
        },
      });

      // خط نقطة التعادل (رأس المال) كـ annotation مرسوم يدوياً بعد الرسم
      const originalDraw = beChart.draw.bind(beChart);
      beChart.draw = function() {
        originalDraw();
        const ctx2   = canvas.getContext('2d');
        const xScale = beChart.scales.x;
        const yScale = beChart.scales.y;
        const xPx    = xScale.getPixelForValue(netCapital);
        const top    = yScale.top;
        const bot    = yScale.bottom;
        ctx2.save();
        ctx2.setLineDash([6, 4]);
        ctx2.strokeStyle = th.accent;
        ctx2.lineWidth   = 1.5;
        ctx2.beginPath();
        ctx2.moveTo(xPx, top - 4);
        ctx2.lineTo(xPx, bot + 4);
        ctx2.stroke();
        ctx2.fillStyle = th.accent;
        ctx2.font      = '11px Tajawal';
        ctx2.fillText('نقطة التعادل', xPx + 4, top + 12);
        ctx2.restore();
      };
      beChart.draw();
    });
    return;
  }
}

// ── Asset Allocation Chart ────────────────────────────────────
function _allocParts() {
  const s = window._ds || {};
  const stocks = holdings.reduce((a, h) => a + +h.shares * +h.current_price, 0);
  // سلسلة ألوان ثابتة لكل فئة أصل (لا تدوير: نفس الفئة = نفس اللون دائماً)
  const parts = [
    { label: 'أسهم',   value: stocks,                color: seriesColor(1) },
    { label: 'نقد',    value: portfolioCash || 0,    color: seriesColor(2) },
    { label: 'عقارات', value: s.reTotal || 0,        color: seriesColor(0) },
    { label: 'صكوك',   value: getSukukActiveTotal(), color: seriesColor(3) }
  ].filter(p => p.value > 0);
  const total = parts.reduce((a, p) => a + p.value, 0);
  return { parts, total };
}

function renderAllocationChart() {
  const cont = document.getElementById('allocChart-container');
  const leg  = document.getElementById('alloc-legend');
  const { parts, total } = _allocParts();

  if (!total) {
    if (allocChart) { allocChart.destroy(); allocChart = null; }
    if (cont) cont.style.display = 'none';
    if (leg)  leg.innerHTML = '<div class="empty-state"><div class="icon">🍰</div><p>لا توجد أصول مسجّلة بعد</p></div>';
    return;
  }
  if (cont) cont.style.display = '';

  const ctx = g('allocChart')?.getContext('2d');
  if (!ctx) return;
  if (allocChart) allocChart.destroy();
  const th = chartTheme();
  allocChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: parts.map(p => p.label), datasets: [{ data: parts.map(p => p.value), backgroundColor: parts.map(p => p.color), borderColor: th.surface, borderWidth: 2, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: th.muted, font: { family: th.font, size: 11 }, padding: 10, usePointStyle: true } },
        tooltip: Object.assign(chartTooltipStyle(), {
          callbacks: { label: c => { const pct = total > 0 ? (c.parsed / total * 100).toFixed(1) : 0; return ' ' + formatSAR(c.parsed) + '  (' + pct + '%)'; } } })
      }
    }
  });

  // وسيلة إيضاح مباشرة تحت المخطط — المخطط الدائري وحده لا يُقرأ بدقة
  if (leg) {
    leg.innerHTML = parts.map(p => browHtml({
      name: p.label, color: p.color,
      pct: p.value / total * 100,
      valueTxt: `${(p.value / total * 100).toFixed(1)}%`,
      sub: formatSAR(p.value),
      title: `${p.label} — ${formatSAR(p.value)}`,
    })).join('') + kvsHtml([['الإجمالي', formatSAR(total)]]);
  }
}

// ── Retirement / FIRE Card ────────────────────────────────────
function renderRetirementCard() {
  const el = document.getElementById('retirement-body');
  if (!el) return;
  const s = window._ds || {};
  const goal = getRetirementGoal();

  const stocks  = holdings.reduce((a, h) => a + +h.shares * +h.current_price, 0);
  const reTotal = s.reTotal || 0;
  const sukuk   = getSukukActiveTotal();
  // AUDIT-FIX (M3): the 4% / Trinity SWR applies to LIQUID, drawdownable assets. Counting illiquid
  // real estate (esp. a primary residence — produces no 4% withdrawable cash without a sale)
  // overstates FIRE progress. Base progress + safe-withdrawal on investable assets and show total
  // net worth separately for context.
  const investAssets = stocks + (portfolioCash || 0) + reTotal + sukuk;  // total incl. RE
  const fireBase     = stocks + (portfolioCash || 0) + sukuk;            // liquid / drawdownable
  // AUDIT-FIX 2026-08: لا نعرض لقطة تلقائية (جزئية: أسهم+نقد+عقار) كصافي ثروة كامل
  const nwIsAuto     = !!s.latestNWIsAuto && s.latestNW != null;
  const netWorth     = s.latestNW != null ? s.latestNW : investAssets;   // total NW (context only)

  if (!goal.monthly) {
    el.innerHTML = `<div class="empty-state">
      <div class="icon">🎯</div>
      <p>أدخل مصاريفك الشهرية المتوقعة بعد التقاعد لحساب رقم الاستقلال المالي (قاعدة الـ4%).</p>
      <button class="btn btn-primary btn-sm mt-2" onclick="editRetirementGoal()">＋ إدخال المصاريف الشهرية</button>
    </div>`;
    return;
  }

  const annualExpenses = goal.monthly * 12;
  const fireNumber = goal.swr > 0 ? annualExpenses / (goal.swr / 100) : annualExpenses * 25;
  const progress = fireNumber > 0 ? Math.min(fireBase / fireNumber * 100, 100) : 0;
  const remaining = Math.max(0, fireNumber - fireBase);
  const safeAnnualWithdrawal = fireBase * (goal.swr / 100);
  const safeMonthly = safeAnnualWithdrawal / 12;
  const progState = progress >= 100 ? 'good' : progress >= 50 ? 'warn' : '';
  const progIcon  = progress >= 100 ? '✅' : progress >= 50 ? '⚠️' : '🔵';
  const coverPct  = goal.monthly > 0 ? (safeMonthly / goal.monthly * 100) : 0;
  const covered   = safeMonthly >= goal.monthly;

  // صف صافي الثروة — يظهر بنفس الشروط السابقة تماماً
  const nwRow = (() => {
    // AUDIT-FIX 2026-08: لقطة تلقائية جزئية أقل من الأصول السائلة = مضللة → نخفي الصف؛
    // وإن كانت أعلى نعرضها موسومة بأنها جزئية
    if (reTotal <= 0) return null;
    if (nwIsAuto && netWorth < fireBase) return null;
    const lbl = nwIsAuto ? 'صافي الثروة الكلي (لقطة تلقائية جزئية)' : 'صافي الثروة الكلي (مع العقار)';
    return [lbl, `${formatSAR(netWorth)} — غير مُحتسب`];
  })();

  // مقارنة قاعدة 4% (Trinity) — تظهر فقط عند اختلاف نسبة السحب
  const trinity = goal.swr !== 4 ? (() => {
    const fire4 = annualExpenses / 0.04;
    const prog4 = Math.min(fireBase / fire4 * 100, 100);
    const rem4  = Math.max(0, fire4 - fireBase);
    return noteHtml('📐', `<b>مقارنة بقاعدة 4% (Trinity Study)</b>` + kvsHtml([
      ['رقم FIRE عند 4%', formatSAR(fire4)],
      ['نسبة الإنجاز',    `${prog4.toFixed(1)}%`],
      ['المتبقي',         formatSAR(rem4)],
    ]), 'warn');
  })() : '';

  el.innerHTML = `<div class="stack-4">
    <div>
      <div class="hero-num">${progress.toFixed(1)}<span class="unit">%</span></div>
      <div class="hero-cap">التقدم نحو الاستقلال المالي · الهدف ${formatSAR(fireNumber)}</div>
    </div>

    <div class="flex gap-2" style="flex-wrap:wrap">
      ${tagHtml(progIcon, progress >= 100 ? 'بلغت رقم الاستقلال المالي' : `متبقٍ ${formatSAR(remaining)}`, progState)}
      ${tagHtml(covered ? '✅' : '⏳', `تغطية المصاريف ${coverPct.toFixed(1)}%`, covered ? 'good' : '')}
    </div>

    ${meterHtml({
      label: 'الأصول السائلة مقابل رقم الاستقلال المالي',
      valueTxt: `${progress.toFixed(1)}%`,
      pct: progress, state: progState, markPct: 100,
      foot: `رقم الاستقلال = مصاريف ${formatSAR(annualExpenses)}/سنة ÷ ${goal.swr}% = ${formatSAR(fireNumber)}`,
    })}

    ${kvsHtml([
      ['الأصول السائلة (للسحب)', formatSAR(fireBase)],
      nwRow,
      ['المتبقي للوصول للهدف',   formatSAR(remaining)],
      ['السحب الآمن الحالي',     `${formatSAR(safeMonthly)}/شهر`],
      ['تغطية مصاريفك الآن',     `${covered ? '✅' : '⏳'} ${coverPct.toFixed(1)}%`],
    ])}

    ${trinity}

    <div class="flex-center">
      <button class="btn btn-secondary btn-sm" onclick="editRetirementGoal()">تعديل المصاريف / نسبة السحب</button>
    </div>
  </div>`;
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(id = null) {
  editingId = id;
  g('modal-title').textContent = id ? 'تعديل السهم' : 'إضافة سهم جديد';
  if (id) {
    const h = holdings.find(x => x.id === id);
    if (!h) return;
    g('h-ticker').value    = h.ticker;
    g('h-name').value      = h.name;
    g('h-sector').value    = h.sector || '';
    g('h-shares').value    = h.shares;
    g('h-avg-price').value = h.avg_price;
    g('h-cur-price').value = h.current_price;
    g('h-target-wt').value = h.target_weight || '';
  } else {
    g('holding-form').reset();
  }
  g('holding-modal').style.display = 'flex';
}

function closeModal() {
  g('holding-modal').style.display = 'none';
  editingId = null;
}

async function saveHolding(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id: user.id,
    ticker:        g('h-ticker').value.trim().toUpperCase(),
    name:          g('h-name').value.trim(),
    sector:        g('h-sector').value.trim(),
    shares:        +g('h-shares').value    || 0,
    avg_price:     +g('h-avg-price').value || 0,
    current_price: +g('h-cur-price').value || 0,
    target_weight: +g('h-target-wt').value || 0,
  };

  // AUDIT-FIX 2026-08: الختم فقط عند تغيّر السعر فعلاً (كان يُختم مع أي تعديل اسم/قطاع
  // فيبدو السعر القديم حديثاً)، وعند تغيّره يُطبَّق نفس مسار التعديل السطري:
  // price_manual: true + ختم localStorage حتى لا يُداس خلال refresh الـ5 دقائق.
  const prev = editingId ? holdings.find(x => x.id === editingId) : null;
  const priceChanged = editingId
    ? (prev ? Math.abs(+prev.current_price - payload.current_price) > 1e-9 : true)
    : payload.current_price > 0;
  let stampISO = null;
  if (priceChanged) {
    stampISO = new Date().toISOString();
    payload.price_updated_at = stampISO;
    payload.price_manual     = true;
  }

  let error;
  if (editingId) ({ error } = await supabaseClient.from('holdings').update(payload).eq('id', editingId));
  else           ({ error } = await supabaseClient.from('holdings').insert([payload]));
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }

  // AUDIT-FIX (2026-08-21): كان الهدف يُكتب في holdings.target_weight وحده — وهو
  // حقل **لا تقرؤه أي صفحة قرار** (صفحة الأهداف ومحرّك القرار يقرآن
  // stock_targets.target_pct حصراً)، ويُداس من stockTargets عند كل تحميل. فيرى
  // المالك «تم التحديث ✓» ثم يعود الرقم كما كان، أو يبقى هدفاً وهمياً لا يشارك
  // في أي قرار. الآن يُكتب في المصدر الحقيقي أيضاً.
  const _tw = +g('h-target-wt').value || 0;
  const _prevTw = prev ? +prev.target_weight || 0 : null;
  if (payload.ticker && (_prevTw === null || Math.abs(_tw - _prevTw) > 1e-9)) {
    try {
      const { data: { user } = {} } = await supabaseClient.auth.getUser();
      if (user) {
        const { error: tErr } = await supabaseClient.from('stock_targets')
          .upsert([{ user_id: user.id, ticker: payload.ticker, target_pct: _tw }],
                  { onConflict: 'user_id,ticker' });
        if (tErr) showToast('⚠️ حُفظ السهم لكن تعذّر حفظ هدف الوزن: ' + tErr.message, 'error');
        else if (_tw > 0) showToast(`✓ هدف الوزن ${_tw}% حُفظ في «أهداف الأسهم» — يقرؤه محرّك القرار الآن`, 'success');
      }
    } catch (e) { showToast('⚠️ تعذّر حفظ هدف الوزن', 'error'); }
  }
  if (stampISO) {
    _priceTimestamps[payload.ticker] = stampISO;
    _savePriceTimestamps();
    checkPriceZones(payload.ticker, payload.current_price);
  }
  showToast(editingId ? 'تم التحديث' : 'تمت الإضافة', 'success');
  closeModal();
  await reloadHoldings();
  renderAllCards();
}

// ── Sync holdings from transactions ──────────────────────────
let _syncPending = null;  // يحمل بيانات المزامنة ريثما يؤكد المستخدم

async function syncHoldingsFromTx() {
  const btn = document.getElementById('btn-sync-tx');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الفحص…'; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    showToast('انتهت الجلسة — أعد تسجيل الدخول', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'مزامنة من المعاملات'; }
    return;
  }

  // ══════════════════════════════════════════════════════════════════
  // ثلاثة عيوب كانت في استعلامٍ واحد يكتب مصدر الحقيقة `holdings.avg_price`
  // ------------------------------------------------------------------
  //  1. **لا كسر تعادل**: الحقول `date` و`created_at` و`id` لم تكن مُختارة
  //     أصلاً، فلا سبيل لترتيب معاملتين في اليوم نفسه — وترتيب Postgres
  //     للصفوف المتساوية غير محدَّد. فإن سبق البيعُ شراءَه في اليوم نفسه
  //     صار متوسط التكلفة صفراً وكامل عائد البيع ربحاً محقَّقاً (قياس:
  //     +599 بدل +98). الملف يعرف القاعدة في دالة وينقضها في أخرى.
  //  2. **لا سقف صفوف**: PostgREST يقطع عند 1,000 صفّ صامتاً، فتُحسب
  //     الحيازات من سجلّ مبتور وتُكتب بلا إنذار.
  //  3. **لا `user_id`**: خلافاً لنمط الدفاع متعدد الطبقات في بقية الملف.
  // ══════════════════════════════════════════════════════════════════
  const TX_SYNC_LIMIT = 5000;
  const { data: txAll, error: txErr, count } = await supabaseClient
    .from('transactions')
    .select('ticker, name, type, shares, price, total, date, created_at, id', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .order('date', { ascending: true })
    .limit(TX_SYNC_LIMIT);

  if (txErr || !txAll) {
    showToast('خطأ في جلب المعاملات', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'مزامنة من المعاملات'; }
    return;
  }

  // ⚠️ الحارس يقيس **ما وصل** لا ما طلبناه. `TX_SYNC_LIMIT` سقفنا نحن، لكن
  // القاطع الحقيقي هو حدّ PostgREST نفسه (1,000 افتراضاً) وهو يقطع بصمت
  // دون سقفنا. فمقارنة `count > 5000` تمرّ على 1,500 معاملة وُصِّل منها ألف،
  // وتُكتب الحيازات من سجلّ مبتور. المقارنة الصحيحة: أنقصُ ممّا يقول العدّاد.
  const truncated = (typeof count === 'number' && count > txAll.length)
                 || txAll.length >= TX_SYNC_LIMIT;
  if (truncated) {
    const nAll = typeof count === 'number' ? count : `أكثر من ${txAll.length}`;
    showToast(`⚠️ أُلغيت المزامنة: وصل ${txAll.length} صفّاً من ${nAll} معاملة — `
            + 'الحساب سيكون مبتوراً ولن يُكتب شيء', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'مزامنة من المعاملات'; }
    return;   // لا تُكتب حيازات من سجلّ مبتور أبداً
  }

  // احسب الأسهم ومتوسط السعر لكل رمز
  // AUDIT-FIX 2026-08: مطابق حرفياً لـ recomputeHoldingFromTx في transactions.js:
  //  • تكلفة الشراء = t.total (شاملة العمولة + VAT) لا shares×price — كان الفرق
  //    يُظهر انحرافات وهمية لكل الأسهم وقبولها يخفض التكلفة زوراً
  //  • البيع يخصم الأسهم بمتوسط التكلفة وقتها (WAC زمني) مع قصّ البيع الزائد
  const map = {};
  const byTicker = {};
  txAll.forEach(tx => {
    if (!map[tx.ticker]) { map[tx.ticker] = { name: tx.name, shares: 0, cost: 0 }; byTicker[tx.ticker] = []; }
    if (tx.name && !map[tx.ticker].name) map[tx.ticker].name = tx.name;
    byTicker[tx.ticker].push(tx);
  });
  // المشي الزمني الموحَّد في utils.js — نفس ما تكتبه صفحة المعاملات (م.2)
  Object.keys(map).forEach(tk => {
    const w = walkWAC(byTicker[tk]);
    map[tk].shares   = w.shares;
    map[tk].cost     = w.cost;
    map[tk].avgPrice = w.avg;
  });

  // اجلب الـ holdings الحالية + user_stocks
  const [{ data: existingH }, { data: userStocksDB }] = await Promise.all([
    supabaseClient.from('holdings').select('*'),
    supabaseClient.from('user_stocks').select('ticker, sector')
  ]);
  const existMap = {};
  (existingH || []).forEach(h => { existMap[h.ticker] = h; });
  const sectorMap = {};
  (userStocksDB || []).forEach(s => { sectorMap[s.ticker] = s.sector || ''; });

  // ── قارن: ما الذي سيتغير؟ ─────────────────────────────────
  const diffs = [];
  for (const [ticker, calc] of Object.entries(map)) {
    const existing = existMap[ticker];
    const newShares   = +calc.shares.toFixed(4);
    const newAvg      = +(calc.avgPrice || 0).toFixed(4);

    if (calc.shares <= 0) {
      if (existing) diffs.push({ ticker, type: 'delete',
        oldShares: +existing.shares, newShares: 0,
        oldAvg: +existing.avg_price, newAvg: 0 });
      continue;
    }
    if (!existing) {
      diffs.push({ ticker, type: 'add',
        oldShares: 0, newShares,
        oldAvg: 0, newAvg });
    } else {
      const sharesChanged = Math.abs(+existing.shares - newShares) > 0.0001;
      const avgChanged    = Math.abs(+existing.avg_price - newAvg) > 0.001;
      if (sharesChanged || avgChanged) {
        diffs.push({ ticker, type: 'update',
          oldShares: +existing.shares, newShares,
          oldAvg: +existing.avg_price, newAvg });
      }
    }
  }

  if (btn) { btn.disabled = false; btn.textContent = 'مزامنة من المعاملات'; }

  if (!diffs.length) {
    showToast('✓ المحفظة متزامنة — لا يوجد فرق', 'success');
    return;
  }

  // احفظ البيانات وانتظر تأكيد المستخدم
  _syncPending = { map, existMap, sectorMap, userId: user.id };
  _showSyncModal(diffs);
}

function _showSyncModal(diffs) {
  const tbody = document.getElementById('sync-diff-tbody');
  if (!tbody) return;

  // حفظ الـ diffs في _syncPending لاستخدامها عند التأكيد
  _syncPending.diffs = diffs;

  const sharesChg = d => Math.abs(d.oldShares - d.newShares) > 0.0001;
  const avgChg    = d => Math.abs(d.oldAvg    - d.newAvg)    > 0.001;

  tbody.innerHTML = diffs.map((d, i) => {
    const avgDiffers  = avgChg(d) && d.type === 'update';
    const sharesDiff  = sharesChg(d);

    // خيار المتوسط — يظهر فقط عند تغيير المتوسط في سهم موجود
    const avgChoice = avgDiffers ? `
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
        <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;color:var(--text-muted)">
          <input type="radio" name="avg-choice-${i}" value="tx" checked
                 style="accent-color:var(--accent)">
          <span>اعتمد المعاملات <span class="num text-accent">${formatSAR(d.newAvg)}</span></span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;color:var(--text-muted)">
          <input type="radio" name="avg-choice-${i}" value="keep"
                 style="accent-color:var(--success)">
          <span>احتفظ بالمتوسط اليدوي <span class="num text-success">${formatSAR(d.oldAvg)}</span></span>
        </label>
      </div>` : '';

    return `<tr data-diff-index="${i}">
      <td><strong class="text-accent">${esc(d.ticker)}</strong></td>
      <td class="num">${d.oldShares > 0 ? d.oldShares : '—'}</td>
      <td class="num ${sharesDiff ? 'text-accent bold' : ''}">${d.newShares > 0 ? d.newShares : '—'}</td>
      <td class="num">${d.oldAvg > 0 ? formatSAR(d.oldAvg) : '—'}</td>
      <td class="num ${avgDiffers ? 'text-accent bold' : ''}">${d.newAvg > 0 ? formatSAR(d.newAvg) : '—'}</td>
      <td>
        ${d.type === 'delete' ? '<span class="text-danger">🗑️ حذف</span>'
        : d.type === 'add'    ? '<span class="text-success">➕ إضافة</span>'
        : avgDiffers          ? avgChoice
        : '<span class="text-accent small">أسهم فقط</span>'}
      </td>
    </tr>`;
  }).join('');

  document.getElementById('sync-confirm-modal').style.display = 'flex';
}

function closeSyncModal(e) {
  if (e && e.target !== document.getElementById('sync-confirm-modal')) return;
  document.getElementById('sync-confirm-modal').style.display = 'none';
  _syncPending = null;
}

async function confirmSync() {
  if (!_syncPending) return;
  const { map, existMap, sectorMap, userId, diffs } = _syncPending;

  // اقرأ خيار المتوسط لكل صف من الـ radio buttons قبل إخفاء الـ modal
  // مفتاح: ticker → 'tx' | 'keep'
  const avgChoices = {};
  (diffs || []).forEach((d, i) => {
    if (d.type === 'update') {
      const checked = document.querySelector(`input[name="avg-choice-${i}"]:checked`);
      avgChoices[d.ticker] = checked ? checked.value : 'tx';
    }
  });

  _syncPending = null;
  document.getElementById('sync-confirm-modal').style.display = 'none';

  const btn = document.getElementById('sync-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ التطبيق…'; }

  let upserted = 0;
  for (const [ticker, calc] of Object.entries(map)) {
    if (calc.shares <= 0) {
      if (existMap[ticker]) await supabaseClient.from('holdings').delete().eq('id', existMap[ticker].id);
      continue;
    }
    const txAvg  = +(calc.avgPrice || 0).toFixed(4);
    const existing = existMap[ticker];

    if (existing) {
      // هل المستخدم اختار الاحتفاظ بالمتوسط اليدوي؟
      const keepManualAvg = avgChoices[ticker] === 'keep';
      const avgPrice = keepManualAvg ? +existing.avg_price : txAvg;

      const updatePayload = { shares: +calc.shares.toFixed(4), avg_price: avgPrice };
      if (!existing.sector && sectorMap[ticker]) updatePayload.sector = sectorMap[ticker];
      await supabaseClient.from('holdings').update(updatePayload).eq('id', existing.id);
    } else {
      // AUDIT-FIX 2026-08: سعر مبدئي = متوسط المعاملات بدل 0 (كان الصفر يُصفّر
      // القيمة السوقية والأوزان حتى أول تحديث أسعار)
      await supabaseClient.from('holdings').insert([{
        user_id: userId, ticker, name: calc.name,
        sector: sectorMap[ticker] || '',
        shares: +calc.shares.toFixed(4), avg_price: txAvg,
        current_price: txAvg, target_weight: 0
      }]);
    }
    upserted++;
  }

  if (btn) { btn.disabled = false; btn.textContent = 'تأكيد المزامنة'; }

  // ملخص يوضح كم سهماً احتُفظ بمتوسطه اليدوي
  const keptCount = Object.values(avgChoices).filter(v => v === 'keep').length;
  const keptNote  = keptCount > 0 ? ` (محتفظ بـ ${keptCount} متوسط يدوي)` : '';
  showToast(`✓ تمت المزامنة — ${upserted} سهم${keptNote}`, 'success');
  await reloadHoldings();
  renderAllCards();
}

// ── Info Modal ────────────────────────────────────────────────
function closeInfoModal(e) {
  if (e && e.target !== document.getElementById('info-modal')) return;
  document.getElementById('info-modal').style.display = 'none';
}

function showCardInfo(key) {
  const s          = window._ds || {};
  const totalValue = holdings.reduce((a, h) => a + +h.shares * +h.current_price, 0);
  const costBasis  = holdings.reduce((a, h) => a + +h.shares * +h.avg_price, 0);
  const pnl        = totalValue - costBasis;
  const pnlPct     = costBasis > 0 ? pnl / costBasis * 100 : 0;
  const cashNet    = (s.cashDeposited || 0) - (s.cashWithdrawn || 0);

  const cards = {
    'total-value': {
      title: '📦 إجمالي قيمة المحفظة',
      body: `
        <p>هذا الرقم يجمع قيمة الأسهم والنقد الموجود عند الوسيط:</p>
        <div class="info-formula">
          <strong>قيمة الأسهم + نقد المحفظة</strong>
        </div>
        <div class="info-math">
          قيمة الأسهم = مجموع (أسهم × سعر حالي) لـ ${holdings.length} سهم<br>
          = ${formatSAR(totalValue)}<br>
          + نقد المحفظة = ${formatSAR(portfolioCash)}<br>
          = <strong class="text-accent">${formatSAR(totalValue + portfolioCash)}</strong>
        </div>
        <p class="info-note">⚠️ كلا الرقمين يُحدَّثان يدوياً — تأكد من مزامنتهما مع الوسيط بانتظام.</p>`
    },
    'portfolio-cash': {
      title: '💵 نقد المحفظة',
      body: `
        <p>القوة الشرائية النقدية الجاهزة داخل حساب الوسيط — تُدخلها يدوياً من كشف حسابك.</p>
        <div class="info-formula">
          <strong>انقر على الرقم لتحديثه</strong>
        </div>
        <div class="info-math">
          النقد الحالي المسجّل = <strong class="text-accent">${formatSAR(portfolioCash)}</strong><br>
          ${cashUpdatedAt ? 'آخر تحديث: ' + formatDate(cashUpdatedAt.split('T')[0]) : 'لم يُسجَّل بعد'}
        </div>
        <p class="info-note">💡 يُضاف هذا المبلغ لقيمة الأسهم ليعطيك "الرصيد الفعلي" كما يظهر عند الوسيط.</p>`
    },
    'invested': {
      title: '💼 رأس المال — طريقتان للحساب',
      body: `
        <p><strong>التاب الأول — رأس المال المنشغل (طريقة الموقع):</strong></p>
        <div class="info-formula">إجمالي الشراء − إجمالي البيع</div>
        <div class="info-math">
          = <strong class="text-accent">${formatSAR(s.totalInvested || 0)}</strong>
        </div>
        <p class="small text-muted" style="margin:4px 0 12px">يعكس التدفق النقدي الصافي الفعلي من جيبك — يشمل الخسائر المحققة من صفقات البيع السابقة.</p>

        <p><strong>التاب الثاني — تكلفة المحفظة WAC (طريقة الوسيط):</strong></p>
        <div class="info-formula">مجموع (أسهم × متوسط سعر الشراء) للأسهم الحالية فقط</div>
        <div class="info-math">
          = <strong class="text-accent">${formatSAR(costBasis)}</strong>
        </div>
        <p class="small text-muted" style="margin:4px 0 12px">يعكس تكلفة الأسهم التي تملكها الآن فقط — بدون حساب الخسائر من مراكز أُغلقت سابقاً.</p>

        <p class="info-note">💡 الفرق بين الرقمين = الخسائر/الأرباح المحققة من جميع صفقات البيع السابقة.</p>`
    },
    'pnl': {
      title: '📊 الربح / الخسارة غير المحقق',
      body: `
        <p>"غير محقق" يعني أنك لم تبع بعد — هو ربح أو خسارة على الورق فقط.</p>
        <div class="info-formula">
          <strong>القيمة السوقية الحالية − تكلفة الشراء الأصلية</strong>
        </div>
        <div class="info-math">
          القيمة السوقية = ${formatSAR(totalValue)}<br>
          − تكلفة الأسهم (أسهم × متوسط سعر الشراء) = ${formatSAR(costBasis)}<br>
          = <strong class="${pnl >= 0 ? 'text-success' : 'text-danger'}">${formatSAR(pnl, true)}</strong>
          &nbsp;(${(pnl>=0?'+':'')}${pnlPct.toFixed(2)}%)
        </div>
        <p class="info-note">💡 يتحول لـ "محقق" فقط عند البيع الفعلي.</p>`
    },
    'networth': {
      title: '🏦 صافي الثروة',
      body: `
        <p>الرقم مأخوذ من أحدث لقطة <strong>يدوية</strong> سجّلتها في صفحة <strong>صافي الثروة</strong> (صافي ثروة كامل: أصول − التزامات). إن لم توجد لقطة يدوية، تُعرض أحدث لقطة تلقائية موسومة بـ«(لقطة تلقائية جزئية)» — وهي تشمل الأسهم والنقد والعقار فقط، بلا بقية الأصول أو الالتزامات.</p>
        <div class="info-math">
          اللقطة المعروضة: <strong>${s.latestNWDate ? formatDate(s.latestNWDate) : 'لا توجد'}</strong>
          ${s.latestNWIsAuto ? ' <span class="text-muted">(تلقائية جزئية — أسهم + نقد + عقار)</span>' : ''}<br>
          القيمة: <strong class="text-accent">${s.latestNW != null ? formatSAR(s.latestNW) : '—'}</strong>
        </div>
        <div class="info-formula">صافي الثروة = إجمالي الأصول − إجمالي الالتزامات</div>
        <p class="info-note">⚠️ لتحديث الرقم الكامل سجّل لقطة يدوية جديدة من صفحة صافي الثروة — اللقطة التلقائية الشهرية لا تحل محلها.</p>`
    },
    'total-div': {
      title: '💰 إجمالي الأرباح الموزعة',
      body: `
        <p>مجموع كل الأرباح النقدية التي استلمتها منذ بدأت التسجيل، من جميع السنوات.</p>
        <div class="info-formula">
          <strong>مجموع جميع السجلات في جدول الأرباح</strong>
        </div>
        <div class="info-math">
          إجمالي جميع السنوات = <strong class="text-success">${formatSAR(s.totalDivAll || 0)}</strong>
        </div>
        <p class="info-note">💡 يمكنك رؤية تفاصيل كل سنة في صفحة <a href="dividends.html" style="color:var(--accent)">الأرباح الموزعة</a>.</p>`
    },
    'year-div': {
      title: `🗓️ أرباح عام ${s.yr || new Date().getFullYear()}`,
      body: `
        <p>مجموع الأرباح التي استلمتها في عام ${s.yr || new Date().getFullYear()} فقط.</p>
        <div class="info-formula">
          <strong>مجموع الأرباح التي سنتها = ${s.yr || new Date().getFullYear()}</strong>
        </div>
        <div class="info-math">
          أرباح ${s.yr || new Date().getFullYear()} = <strong class="text-accent">${formatSAR(s.yearDiv || 0)}</strong>
        </div>
        <p class="info-note">💡 السنة في سجل الأرباح تُحدَّد يدوياً عند الإدخال — تأكد أن السنة صحيحة في السجلات.</p>`
    },
    'realestate': {
      title: '🏠 قيمة العقارات',
      body: `
        <p>مجموع القيمة الحالية لعقاراتك التي لم تُبَع بعد.</p>
        <div class="info-formula">
          <strong>مجموع (القيمة الحالية) للعقارات ذات حالة "مملوك" أو "مؤجر"</strong>
        </div>
        <div class="info-math">
          إجمالي قيمة العقارات = <strong class="text-accent">${formatSAR(s.reTotal || 0)}</strong>
        </div>
        <p class="info-note">⚠️ العقارات المباعة مستبعدة من هذا الرقم. يمكن تعديل القيم في صفحة <a href="realestate.html" style="color:var(--accent)">العقارات</a>.</p>`
    },
    'cashflow': {
      title: '💸 صافي التدفق النقدي هذا العام',
      body: `
        <p>الفرق بين ما أودعته وما سحبته من المحفظة خلال عام ${s.yr || new Date().getFullYear()}.</p>
        <div class="info-formula">
          <strong>إجمالي الإيداعات − إجمالي السحوبات</strong><br>
          (للسجلات التي تاريخها في ${s.yr || new Date().getFullYear()})
        </div>
        <div class="info-math">
          الإيداعات = ${formatSAR(s.cashDeposited || 0)}<br>
          − السحوبات = ${formatSAR(s.cashWithdrawn || 0)}<br>
          = <strong class="${cashNet >= 0 ? 'text-success' : 'text-danger'}">${formatSAR(cashNet, true)}</strong>
        </div>
        <p class="info-note">💡 السجلات موجودة في صفحة <a href="cashflows.html" style="color:var(--accent)">التدفقات النقدية</a>.</p>`
    },
    'composition': {
      title: '📋 تفاصيل المحفظة',
      body: `
        <p>إحصائيات بسيطة عن تنوع محفظتك الحالية.</p>
        <div class="info-math">
          عدد الأسهم في المحفظة = <strong class="text-accent">${holdings.length} سهم</strong><br>
          عدد القطاعات المختلفة = <strong class="text-accent">${s.sectorCount || 0} قطاع</strong>
        </div>
        <p class="info-note">💡 كلما زاد عدد القطاعات، زاد التنويع وقلّ تركّز المخاطر في قطاع واحد.</p>`
    },
    'top-sector': {
      title: '🏆 أعلى قطاع وزناً',
      body: (() => {
        const t = s.topSector;
        if (!t) return '<p>لا توجد بيانات بعد.</p>';
        const secVal = totalValue * t.pct / 100;
        return `
          <p>القطاع الذي يأخذ أكبر نسبة من إجمالي قيمة محفظتك.</p>
          <div class="info-formula">
            وزن القطاع = <strong>قيمة أسهم القطاع ÷ إجمالي المحفظة × 100</strong>
          </div>
          <div class="info-math">
            القطاع: <strong>${esc(t.sec)}</strong><br>
            قيمة أسهمه ≈ ${formatSAR(secVal)}<br>
            ÷ إجمالي المحفظة ${formatSAR(totalValue)}<br>
            = <strong class="text-accent">${t.pct.toFixed(1)}%</strong>
            ${t.target ? `<br>الهدف المحدد: ${t.target.toFixed(1)}% | الفارق: ${(t.pct - t.target >= 0 ? '+' : '')}${(t.pct - t.target).toFixed(1)}%` : ''}
          </div>`;
      })()
    },
    'bot-sector': {
      title: '📉 أقل قطاع وزناً',
      body: (() => {
        const b = s.bottomSector;
        if (!b || s.sectorCount <= 1) return '<p>يحتاج قطاعين أو أكثر للمقارنة.</p>';
        const secVal = totalValue * b.pct / 100;
        return `
          <p>القطاع الذي يحتل أصغر نسبة من إجمالي قيمة محفظتك.</p>
          <div class="info-formula">
            وزن القطاع = <strong>قيمة أسهم القطاع ÷ إجمالي المحفظة × 100</strong>
          </div>
          <div class="info-math">
            القطاع: <strong>${esc(b.sec)}</strong><br>
            قيمة أسهمه ≈ ${formatSAR(secVal)}<br>
            ÷ إجمالي المحفظة ${formatSAR(totalValue)}<br>
            = <strong class="text-danger">${b.pct.toFixed(1)}%</strong>
            ${b.target ? `<br>الهدف المحدد: ${b.target.toFixed(1)}% | الفارق: ${(b.pct - b.target >= 0 ? '+' : '')}${(b.pct - b.target).toFixed(1)}%` : ''}
          </div>`;
      })()
    },
    'costs': {
      title: '💸 التكاليف التراكمية',
      body: `
        <p>إجمالي ما دفعته من رسوم للوسيط وضريبة القيمة المضافة على جميع معاملاتك.</p>
        <div class="info-formula">
          <strong>مجموع العمولات + مجموع ضريبة VAT</strong><br>
          من جميع سجلات المعاملات (شراء وبيع)
        </div>
        <div class="info-math">
          إجمالي العمولات = ${formatSAR(s.totalCommission || 0)}<br>
          + إجمالي ضريبة VAT = ${formatSAR(s.totalVAT || 0)}<br>
          = <strong>${formatSAR((s.totalCommission||0) + (s.totalVAT||0))}</strong>
        </div>
        <p class="info-note">💡 هذه التكاليف تُخصم فعلياً من عائدك الإجمالي — كلما قلّت المعاملات، قلّت التكاليف.</p>`
    },
    'capital': {
      title: '📊 رأس المال مقابل القيمة السوقية',
      body: `
        <p>مقارنة بين ما دفعته فعلياً (التكلفة) وما تساوي أسهمك الآن (القيمة السوقية).</p>
        <div class="info-formula">
          <strong>التكلفة</strong> = مجموع (عدد أسهم × متوسط سعر الشراء) لكل سهم<br>
          <strong>القيمة السوقية</strong> = مجموع (عدد أسهم × السعر الحالي) لكل سهم
        </div>
        <div class="info-math">
          التكلفة الأصلية = <strong>${formatSAR(costBasis)}</strong><br>
          القيمة السوقية الآن = <strong class="text-accent">${formatSAR(totalValue)}</strong><br>
          الفرق = <strong class="${pnl >= 0 ? 'text-success' : 'text-danger'}">${(pnl>=0?'+':'')}${formatSAR(pnl, true)} (${(pnl>=0?'+':'')}${pnlPct.toFixed(2)}%)</strong>
        </div>`
    },
    'breakeven': {
      title: '⚖️ تحليل نقطة التعادل — كيف تُحسب؟',
      body: `
        <p>تُجيب هذه الحسبة على سؤال واحد: <strong>"هل أنا رابح أم خاسر بشكل حقيقي شامل كل شيء؟"</strong></p>
        <div class="info-formula">
          <strong>رأس المال المنشغل = إجمالي المشتريات − إجمالي المبيعات</strong><br>
          <em>(ما خرج من جيبك صافياً)</em>
        </div>
        <div class="info-formula">
          <strong>إجمالي العوائد = قيمة المحفظة الحالية + كل الأرباح الموزعة</strong><br>
          <em>(قيمة المنح مشمولة ضمن قيمة المحفظة. حصيلة البيع لا تُضاف هنا لأنها مخصومة أصلاً من رأس المال المنشغل — إضافتها كانت ستحتسبها مرتين)</em>
        </div>
        <div class="info-formula">
          <strong>صافي الربح/الخسارة الحقيقي = إجمالي العوائد − رأس المال المنشغل</strong>
        </div>
        <p class="info-note">💡 <strong>الرقم الكبير في الكرت هو مسافتك عن رأس مالك، لا نسبة استردادك.</strong> فـ<strong class="text-success">+2.3%</strong> تعني أنك استرجعت رأس مالك كاملاً وزدت عليه 2.3%، و<strong class="text-danger">−2.3%</strong> تعني أنك ما زلت دون رأس مالك بـ2.3% (أي أن الخسارة تأكل منه). نقطة التعادل هنا = <strong>صفر</strong>.</p>
        <p class="info-note">📐 لماذا لا نعرض «102.3%»؟ لأنها تُقرأ للوهلة الأولى ربحاً بنسبة 102%، بينما هي في الحقيقة 100% رأس مالك + 2.3% ربح. نسبة الاسترداد الخام تبقى معروضة تحت الشريط كتفصيل للتحقّق — لا كعنوان.</p>
        <p class="info-note">📌 قيمة المنح تُحسب بسعر السوق الحالي — لأنها أسهم مجانية تحتسب كعائد.</p>`
    },
    'realized': {
      title: '✅ الربح / الخسارة المحقق من البيع',
      body: `
        <p>هذا الرقم يُحسب من صفقات البيع الفعلية — ما تحقق فعلاً في جيبك.</p>
        <div class="info-formula">
          لكل صفقة بيع:<br>
          <strong>ر/خ = صافي حصيلة البيع − (عدد الأسهم المباعة × متوسط التكلفة وقت البيع)</strong>
        </div>
        <div class="info-math">
          نمشي على معاملاتك بترتيبها التاريخي، ونستخدم متوسط التكلفة المرجّح<br>
          (شامل العمولة والضريبة) <strong>كما كان لحظة كل بيع</strong> — لا متوسطاً نهائياً<br>
          إجمالي ر/خ المحقق = <strong class="${(s.realizedPnL||0) >= 0 ? 'text-success' : 'text-danger'}">${(s.realizedPnL||0) >= 0 ? '+' : ''}${formatSAR(s.realizedPnL||0, true)}</strong>
        </div>
        <p class="info-note">✅ هذه الطريقة الزمنية الدقيقة، ومطابقة لرقم «الربح المحقق» في صفحة سجل المعاملات.</p>`
    },
    'total-return': {
      title: '🧮 إجمالي الربح منذ البداية',
      body: (() => {
        const totalBuys = s.totalBuys || 0;
        const totalProfit = totalBuys > 0
          ? (holdings.reduce((a,h)=>a+ +h.shares*+h.current_price,0) + (s.totalSells||0) + (s.totalDivAll||0) - totalBuys)
          : 0;
        const pct = totalBuys > 0 ? totalProfit / totalBuys * 100 : 0;
        return `
        <p>كل ما ربحته من المحفظة منذ أول صفقة — يجمع الأبعاد الثلاثة في رقم واحد بديهي.</p>
        <div class="info-formula">
          <strong>إجمالي الربح = (ربح ورقي) + (ربح محقق من البيع) + (كل التوزيعات)</strong><br>
          = القيمة السوقية + إجمالي المبيعات + إجمالي التوزيعات − إجمالي المشتريات
        </div>
        <div class="info-math">
          النسبة = إجمالي الربح ÷ إجمالي المشتريات = <strong class="${totalProfit>=0?'text-success':'text-danger'}">${totalProfit>=0?'+':''}${pct.toFixed(1)}%</strong><br>
          (الأسهم المجانية/المنح تظهر كربح صافٍ لأن تكلفتها صفر)
        </div>
        <p class="info-note">📌 <strong>هذه نسبة ربح لا نسبة أداء.</strong> ريالٌ أُودع الشهر الماضي لم تُتَح له فرصة الربح التي أُتيحت لريالٍ أُودع قبل ثلاث سنوات، وجمعهما في مقامٍ واحد يخلط الربح بالإيداع. ومع ضخٍّ يعادل 42% من المحفظة سنوياً (م.8) <strong>تنزل هذه النسبة كلما ضخخت أكثر</strong> — ولو كان أداء المحفظة ممتازاً.</p>
        <p class="info-note">📈 قياس الأداء الحقيقي — <strong>TWR</strong> (معزول عن توقيت إيداعاتك) و<strong>XIRR</strong> (موزون بها) و<strong>عائد كل سنة على حدة</strong> ومدى تختاره — في <a href="performance.html#returns" style="color:var(--accent)">الأداء التاريخي ← تبويب «العائد بالنسبة»</a>.</p>
        <p class="info-note">والنسبة على إجمالي المشتريات، فإن أعدت تدوير رأس المال (بيع ثم شراء) يكون الرقم متحفظاً.</p>`;
      })()
    },
    'div-yield': {
      title: '📈 العائد التوزيعي — ثلاث طرق',
      body: `
        <p>ثلاث طرق لحساب العائد، كل منها تعبّر عن زاوية مختلفة:</p>

        <p style="margin:12px 0 4px"><strong>① مُسنوى (السنة الجارية)</strong> — الأدق للسنة غير المكتملة</p>
        ${s.annBasis === 'extrapolated' ? `
        <div class="info-formula">أرباح ${s.yr||new Date().getFullYear()} × (${s.daysInYear||365}÷${s.daysElapsed||1}) ÷ التكلفة</div>
        <div class="info-math">
          ${formatSAR(s.yearDivHeld||0)} × ${((s.daysInYear||365)/(s.daysElapsed||1)).toFixed(2)} = أرباح مُسنواة ${formatSAR(s.annualizedYearDiv||0)}<br>
          ÷ التكلفة ${formatSAR(s.denomAnn||0)}<br>
          = <strong class="text-success">${(s.divYieldAnn||0).toFixed(2)}%</strong>
        </div>` : `
        <div class="info-formula">أرباح آخر 12 شهراً ÷ التكلفة</div>
        <div class="info-math">
          لا استقراء هنا: إمّا السنة مبكّرة (${s.daysElapsed||0} يوماً) أو دورة أبطأ موزّع لديك لم تكتمل بعد.<br>
          الاستقراء الخطي يضخّم الموزّع السنوي (دفعة مارس × 365÷236 = ‎+55%‎)، فنستخدم آخر 12 شهراً:<br>
          ${formatSAR(s.ttmDiv||0)} ÷ ${formatSAR(s.denomAnn||0)}<br>
          = <strong class="text-success">${(s.divYieldAnn||0).toFixed(2)}%</strong>
        </div>`}

        <p style="margin:12px 0 4px"><strong>② على التكلفة YOC</strong> — العائد السنوي على ما دفعته فعلاً</p>
        <div class="info-formula">أرباح آخر 12 شهراً ÷ تكلفة الشراء الأصلية</div>
        <div class="info-math">
          ${formatSAR(s.ttmDiv||0)} ÷ ${formatSAR(costBasis)}<br>
          = <strong class="text-success">${(s.divYieldYOC||0).toFixed(2)}%</strong>
        </div>
        <p class="small text-muted" style="margin:-4px 0 8px">يستخدم أرباح آخر 12 شهراً (وليس التراكمي) ليكون عائداً سنوياً حقيقياً.</p>

        <p style="margin:12px 0 4px"><strong>③ سوقي</strong> — العائد على القيمة السوقية الحالية</p>
        <div class="info-formula">أرباح آخر 12 شهراً ÷ القيمة السوقية الحالية</div>
        <div class="info-math">
          ${formatSAR(s.ttmDiv||0)} ÷ ${formatSAR(totalValue)}<br>
          = <strong class="text-success">${(s.divYieldMarket||0).toFixed(2)}%</strong>
        </div>
        <p class="info-note">💡 اليوم ${s.daysElapsed||'؟'} من ${s.daysInYear||365} — السنة الجارية تُسنوى تلقائياً</p>`
    },
    'xirr': {
      title: '📈 العائد السنوي الحقيقي (XIRR)',
      body: `
        <p>أدق مقياس لأداء محفظتك — يحسب معدل النمو السنوي المركّب مع <strong>مراعاة توقيت كل عملية</strong> (متى أودعت ومتى سحبت).</p>
        <div class="info-formula">
          المعدل r الذي يجعل:<br>
          <strong>Σ (تدفق ÷ (1+r)^سنوات) = 0</strong>
        </div>
        <div class="info-math">
          المشتريات = تدفق خارج (−)<br>
          المبيعات + التوزيعات = تدفق داخل (+)<br>
          القيمة السوقية الحالية = تدفق ختامي (+)<br>
          ⟵ النتيجة = <strong class="${(s.xirr||0) >= 0 ? 'text-success' : 'text-danger'}">${s.xirr != null ? (s.xirr>=0?'+':'')+s.xirr.toFixed(2)+'%' : '—'}</strong> سنوياً
        </div>
        <p class="info-note">💡 يختلف عن "الربح %" لأنه يأخذ الزمن بالحسبان — ربح 20% خلال سنة أفضل من 20% خلال 5 سنوات.</p>`
    },
    'fwd-income': {
      title: '💵 الدخل التوزيعي المتوقع',
      body: (() => {
        // AUDIT-FIX (2026-08): الشرح يطابق الحساب الفعلي — DPS السنوي = مجموع
        // توزيعات آخر 12 شهراً لكل سهم واحد (لا وسيط دفعة × الدورية)، موحَّد مع
        // _projectedAnnualIncome في صفحة الأرباح.
        const usingFwd = (s.fwdProjected || 0) > 0;
        const val = usingFwd ? s.fwdProjected : (s.ttmDiv || 0);
        const stale = s.fwdStale || [];
        const staleNote = stale.length
          ? noteHtml('⚠️', `<strong>مستبعَد من الدخل المتوقع (${stale.length}):</strong> ${
              stale.map(x => `${esc(x.ticker)} — بلا توزيع منذ ${Math.round(x.daysSinceDiv/30)} شهراً`).join(' · ')
            }<br><span class="small">انقطاع التوزيع = فشل بوابة الاستدامة (الدستور §4 الفلتر 1)؛ لا يُبنى عليه دخل تقاعدي متوقَّع.</span>`, 'warn')
          : '';
        return `
        <p>${usingFwd
          ? 'تقدير دخلك السنوي القادم بطريقة <strong>Forward</strong>: لكل سهم تملكه، <strong>مجموع التوزيعات لكل سهم واحد خلال آخر 12 شهراً</strong> × أسهمك الحالية. جمع الاثني عشر شهراً لا يفترض تساوي الدفعات، فلا يضخّم النمط السعودي (مرحلي صغير + ختامي كبير) ولا يتذبذب حسب شهر فتح الصفحة.'
          : 'لا تتوفر بيانات كافية لطريقة Forward — نعرض ما استلمته فعلاً في آخر 12 شهراً (TTM).'}</p>
        <div class="info-formula"><strong>${usingFwd ? 'Σ (مجموع DPS آخر 365 يوماً × الأسهم الحالية) لكل رمز' : 'مجموع التوزيعات خلال آخر 365 يوماً'}</strong></div>
        <div class="info-math">
          الدخل السنوي المتوقع = <strong class="text-success">${formatSAR(val)}</strong><br>
          ≈ ${formatSAR(val/12)} شهرياً<br>
          <span class="text-muted small">للمقارنة: TTM المستلم فعلاً = ${formatSAR(s.ttmDiv||0)}</span>
        </div>
        ${staleNote}
        <p class="info-note">💡 مؤشر تقديري — يفترض استمرار الشركات على آخر سياسة توزيع معروفة. موزّع سنوي تأخّرت دفعته يُقدَّر بمجموع آخر دورة كاملة.</p>`;
      })()
    },
    'passive-cover': {
      title: '🛡️ تغطية الدخل السلبي للمصاريف',
      body: (() => {
        const goal = getRetirementGoal();
        // AUDIT-FIX (2026-07): الكرت يحسب بالدخل المتوقع Forward — الشرح يطابقه الآن
        const mInc = ((s.fwdProjected || s.ttmDiv || 0))/12;
        return `
        <p>كم نسبة مصاريفك الشهرية التي يغطيها دخل التوزيعات وحده — مؤشر اقترابك من الاستقلال المالي. الدخل المستخدم هو <strong>المتوقع (Forward)</strong> من كرت الدخل التوزيعي.</p>
        <div class="info-formula"><strong>(الدخل التوزيعي المتوقع الشهري ÷ المصاريف الشهرية) × 100</strong></div>
        <div class="info-math">
          ${goal.monthly > 0
            ? `${formatSAR(mInc)} ÷ ${formatSAR(goal.monthly)} = <strong class="text-accent">${(mInc/goal.monthly*100).toFixed(1)}%</strong>`
            : 'أدخل مصاريفك الشهرية أولاً من بطاقة هدف التقاعد.'}
        </div>
        <p class="info-note">🎯 عند 100% تصبح توزيعاتك تغطي معيشتك بالكامل.</p>`;
      })()
    },
    'total-assets': {
      title: '🏦 إجمالي الأصول الاستثمارية',
      body: (() => {
        const stocks = holdings.reduce((a,h)=>a+ +h.shares*+h.current_price,0);
        const suk = getSukukActiveTotal();
        const tot = stocks + (portfolioCash||0) + (s.reTotal||0) + suk;
        return `
        <p>مجموع كل أصولك الاستثمارية عبر الفئات (لا يطرح الالتزامات — للصافي راجع كرت صافي الثروة).</p>
        <div class="info-math">
          أسهم = ${formatSAR(stocks)}<br>
          + نقد المحفظة = ${formatSAR(portfolioCash||0)}<br>
          + عقارات = ${formatSAR(s.reTotal||0)}<br>
          + صكوك مشترَك بها = ${formatSAR(suk)}<br>
          = <strong class="text-accent">${formatSAR(tot)}</strong>
        </div>
        <p class="info-note">💡 الصكوك تُقرأ من صفحة الصكوك (الفرص بحالة "مشترك").</p>`;
      })()
    },
    'concentration': {
      title: '🎯 تركيز أكبر سهم',
      body: (() => {
        const lh = s.largestHolding;
        return `
        <p>أكبر مركز فردي كنسبة من قيمة أسهمك. التركيز العالي في سهم واحد أخطر مخاطرة على محفظة التقاعد — أي هبوط حاد في سهم واحد يضرب ثروتك بالكامل.</p>
        <div class="info-formula"><strong>(قيمة أكبر سهم ÷ إجمالي قيمة الأسهم) × 100</strong></div>
        <div class="info-math">
          ${lh ? `أكبر مركز: <strong>${esc(lh.ticker)}</strong> = <strong class="text-accent">${(s.largestPosPct||0).toFixed(1)}%</strong><br>أكبر 5 مراكز مجتمعة = <strong>${(s.top5Pct||0).toFixed(1)}%</strong>` : 'لا توجد حيازات.'}
        </div>
        <p class="info-note">⚠️ قاعدة شائعة لطول الأجل: تجنّب تجاوز سهم واحد لـ 20–25% من المحفظة. أخضر &lt;15% · أصفر 15–25% · أحمر &gt;25%.</p>`;
      })()
    },
    'contribution': {
      title: '💰 معدل المساهمة الشهري',
      body: (() => {
        return `
        <p>صافي ما أضفته من جيبك (إيداع − سحب) شهرياً خلال آخر 12 شهراً. هذا هو المحرّك الحقيقي لوصولك لهدف الاستقلال المالي — أقوى من تقلّبات السوق على المدى الطويل.</p>
        <div class="info-formula"><strong>(إجمالي الإيداع − إجمالي السحب) خلال 12 شهراً ÷ 12</strong></div>
        <div class="info-math">
          ${s.hasCf12 ? `صافي 12 شهراً = <strong>${formatSAR(s.netContrib12||0)}</strong><br>÷ 12 = <strong class="text-accent">${formatSAR(s.monthlyContrib||0)}/شهر</strong>` : 'لا توجد تدفقات نقدية مسجّلة — أدخلها من صفحة التدفقات النقدية.'}
        </div>
        <p class="info-note">💡 يُحسب من التدفقات النقدية الفعلية المسجّلة — رقم موثوق لا تقدير.</p>`;
      })()
    },
    'div-growth': {
      title: '📊 نمو الدخل التوزيعي السنوي',
      body: (() => {
        return `
        <p>متوسط معدل النمو السنوي المركّب (CAGR) لإجمالي التوزيعات التي استلمتها فعلياً، محسوباً على السنوات التقويمية المكتملة فقط (نستثني السنة الجارية الجزئية).</p>
        <div class="info-formula"><strong>(دخل آخر سنة ÷ دخل أول سنة) ^ (1 ÷ عدد السنوات) − 1</strong></div>
        <div class="info-math">
          ${s.divCagr != null ? `من ${s.divCagrFirstY} إلى ${s.divCagrLastY} = <strong class="text-accent">${(s.divCagr>=0?'+':'')}${s.divCagr.toFixed(1)}%/سنة</strong>` : 'يحتاج توزيعات في سنتين تقويميتين مكتملتين على الأقل.'}
        </div>
        <p class="info-note">⚠️ يعكس نمو دخلك الكلي (يجمع بين تراكم الأسهم ونمو توزيع الشركة) — مؤشر لمسار دخلك التقاعدي الفعلي، لا لجودة توزيع شركة بعينها.</p>`;
      })()
    },
    'allocation': {
      title: '🍰 التخصيص الكلي للأصول',
      body: `
        <p>توزيع ثروتك الاستثمارية على الفئات الأربع. التنويع بين الفئات يقلل المخاطر أكثر من التنويع داخل فئة واحدة.</p>
        <div class="info-formula"><strong>نسبة كل فئة = قيمتها ÷ إجمالي الأصول × 100</strong></div>
        <p class="info-note">💡 لا توجد نسبة "مثالية" واحدة — تعتمد على عمرك وأهدافك وتحمّلك للمخاطر. القاعدة الشائعة: كلما اقتربت من التقاعد، زدت الأصول الأقل تذبذباً.</p>`
    },
    'diversification': {
      title: '🧩 مقياس التنويع — المنهجية',
      body: (() => {
        const n = holdings.length;
        const totalVal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
        const hhi = totalVal > 0
          ? holdings.reduce((s, h) => { const w = +h.shares * +h.current_price / totalVal; return s + w * w; }, 0)
          : 0;
        const effN = hhi > 0 ? Math.round(1 / hhi) : 0;
        return `
          <p>المقياس مبني على <strong>مؤشر هيرفيندال-هيرشمان (HHI)</strong> — المعيار الأكاديمي والتنظيمي المعتمد (وزارة العدل الأمريكية DOJ، نظرية الحوافظ الحديثة MPT).</p>
          <div class="info-formula"><strong>HHI = Σ (وزن كل سهم)²</strong></div>
          <div class="info-math">
            HHI أسهمك حالياً = <strong>${(hhi * 100).toFixed(2)}%</strong><br>
            العدد الفعّال = 1 ÷ HHI = <strong>${effN} سهم</strong><br>
            <span class="text-muted small">العدد الفعّال يعكس توزيع الأوزان، لا مجرد العدد — 15 سهماً أكبرها 80% يُعطي عدداً فعّالاً ≈ 1.6</span>
          </div>
          <p><strong>مناطق المقياس — مُعايَرة للمستثمر الفردي (مرجع: Evans & Archer 1968 + DOJ):</strong></p>
          <ul style="font-size:0.82rem;line-height:2;padding-right:16px">
            <li>🔴 <strong>مركّز جداً</strong>: HHI > 25% (N_eff < 4) — خطر مرتفع جداً</li>
            <li>🔴 <strong>تركيز ملحوظ</strong>: HHI 14–25% (N_eff 4–7) — حماية جزئية</li>
            <li>⚠️ <strong>تنوع معقول</strong>: HHI 10–14% (N_eff 7–10) — مقبول</li>
            <li>✅ <strong>تنوع جيد</strong>: HHI 6.7–10% (N_eff 10–15) — جيد للمحفظة الفردية</li>
            <li>✅ <strong>تنوع ممتاز</strong>: HHI < 6.7% (N_eff ≥ 15) — يُزيل ~90% من المخاطر القابلة للتنويع</li>
          </ul>
          <p><strong>دور القطاعات:</strong> تنوع القطاعات يُخفّض الدرجة بنسبة تصل لـ 30% إذا تركّزت الأسهم في قطاع واحد (الدرجة الكاملة عند ~6 قطاعات فعّالة — نطاق واقعي للفرد) — لأن الارتباط داخل القطاع الواحد يُلغي فائدة التعدد.</p>
          <p><strong>📚 ماذا تقول الأبحاث (مراجعة Zaimovic et al. 2021 — 150 دراسة):</strong></p>
          <ul style="font-size:0.82rem;line-height:1.9;padding-right:16px">
            <li><strong>لا يوجد رقم سحري واحد</strong> — يعتمد على السوق والمستثمر وقياس المخاطر.</li>
            <li>١٠ أسهم تبقي ~٢٥٪ من المخاطر الفردية (Alexeev & Tapon 2014).</li>
            <li>٢٠ سهماً ≈ إزالة ٩٥٪ من المخاطر القابلة للتنويع؛ <strong>+٨٠ سهماً تُزيل ٤٪ فقط</strong> (Domian et al. 2007) — تناقص حاد.</li>
            <li>المحفظة جيدة التنويع <strong>أكبر اليوم</strong> (تكاليف تداول أقل، مخاطر فردية أعلى).</li>
            <li><strong>سوقك ناشئ (تاسي):</strong> يحتاج عدداً أقل للتنويع الأمثل من الأسواق المتطورة، لكن مخاطر الذيل أعلى.</li>
            <li>⚠️ <strong>التنويع لا يحمي من الانهيارات</strong> — الارتباطات ترتفع وقت الأزمات فتتقلّص فائدته وقت الحاجة.</li>
          </ul>
          <p class="info-note">💡 <strong>تنبيه الإدارة (Diworsification):</strong> يظهر بشكل منفصل عند n > 30 — ليس جزءاً من المقياس لأن المزيد من الأسهم رياضياً لا يزيد المخاطرة، بل يزيد تعقيد المتابعة فقط.</p>`;
      })()
    },
    'retirement': {
      title: '🎯 هدف الاستقلال المالي (FIRE)',
      body: `
        <p>يحسب المبلغ الذي تحتاجه لتعيش من عوائد استثماراتك دون العمل، بناءً على <strong>قاعدة السحب الآمن</strong>.</p>
        <div class="info-formula">
          <strong>رقم الاستقلال المالي = المصاريف السنوية ÷ نسبة السحب الآمنة</strong><br>
          <em>(عند 4% = المصاريف السنوية × 25)</em>
        </div>
        <div class="info-formula">
          <strong>التقدم = صافي الثروة الحالي ÷ رقم الهدف × 100</strong>
        </div>
        <p class="info-note">💡 قاعدة الـ4% (ترينيتي): يمكنك سحب 4% سنوياً من محفظة متنوعة مع احتمال عالٍ ألا تنفد خلال 30 سنة.</p>
        <p class="info-note">⚠️ تقدير تخطيطي مبسّط — التضخم والضرائب وتقلب السوق تؤثر على الواقع.</p>`
    }
  };

  const card = cards[key];
  if (!card) return;
  document.getElementById('info-modal-title').innerHTML = card.title;
  document.getElementById('info-modal-body').innerHTML  = card.body;
  document.getElementById('info-modal').style.display   = 'flex';
}

// ── نقد المحفظة ───────────────────────────────────────────────
const CASH_LS_KEY = () => userLsKey('portfolio_cash_v1');

// قراءة خام لقيمة النقد من LS ({amount, updated_at} أو null) — للمقارنة الزمنية مع DB
function _readCashLS() {
  try {
    const raw = localStorage.getItem(CASH_LS_KEY());
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function _loadCashFromLS() {
  const obj = _readCashLS();
  if (!obj) return;
  portfolioCash = +obj.amount || 0;
  cashUpdatedAt = obj.updated_at || null;
}

function _saveCashToLS(amount, updatedAt) {
  try { localStorage.setItem(CASH_LS_KEY(), JSON.stringify({ amount, updated_at: updatedAt })); } catch (_) {}
}

function startEditCash() {
  const input = g('cash-edit-input');
  const valEl = g('stat-portfolio-cash');
  if (!input || !valEl) return;
  input.value = portfolioCash || '';
  valEl.style.display  = 'none';
  input.style.display  = 'block';
  input.focus();
  input.select();
}

function cancelEditCash() {
  const input = g('cash-edit-input');
  const valEl = g('stat-portfolio-cash');
  if (input) {
    // ⚠️ إخفاء حقلٍ **مركَّز** بـdisplay:none يُطلق `blur`، و`onblur` في
    // dashboard.html ينادي `saveCash()` — فكان Escape **يحفظ** ما كُتب بدل
    // أن يُلغيه: تكتب 50000 بالخطأ، تضغط Escape، فتُخزَّن في localStorage
    // وفي `portfolio_cash` بـSupabase وتدخل إجمالي المحفظة وقاعدة FIRE.
    // إعادة القيمة الأصلية أولاً تجعل استدعاء blur التالي يرتدّ من حارس
    // `if (newVal === portfolioCash) return` داخل saveCash.
    input.value = portfolioCash || '';
    input.style.display = 'none';
  }
  if (valEl) valEl.style.display = '';
}

async function saveCash() {
  const input = g('cash-edit-input');
  if (!input) return;
  const newVal = +input.value || 0;
  cancelEditCash();
  if (newVal === portfolioCash) return;

  const now = new Date().toISOString();

  // احفظ في localStorage فوراً كضمان
  _saveCashToLS(newVal, now);
  portfolioCash = newVal;
  cashUpdatedAt = now;
  renderStats();
  showToast('تم حفظ النقد ✓', 'success');

  // حاول الحفظ في Supabase — AUDIT-FIX 2026-08: تحذير عند الفشل بدل catch صامت
  // (الـ LS يحمل القيمة الأحدث وستفوز عند التحميل التالي بالمقارنة الزمنية)
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from('portfolio_cash').upsert(
      { user_id: user.id, amount: newVal, updated_at: now },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
  } catch (e) {
    console.warn('portfolio_cash upsert failed:', e);
    showToast('⚠️ حُفظ النقد محلياً فقط — تعذّرت مزامنته مع قاعدة البيانات', 'warning');
  }
}

async function deleteHolding(id) {
  if (!await confirmAsync('هل أنت متأكد من حذف هذا السهم؟')) return;
  const { error } = await supabaseClient.from('holdings').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await reloadHoldings();
  renderAllCards();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportHoldingsCSV() {
  if (!holdings.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  const total = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  exportCSV(`محفظة_أسهم_${todayISO()}.csv`,
    ['الرمز', 'الاسم', 'القطاع', 'الأسهم', 'متوسط السعر', 'السعر الحالي', 'التكلفة', 'القيمة السوقية', 'ر/خ', 'ر/خ %', 'الوزن %', 'مستهدف %'],
    holdings.map(h => {
      const cost  = +h.shares * +h.avg_price;
      const value = +h.shares * +h.current_price;
      const pnl   = value - cost;
      const pnlP  = cost > 0 ? (pnl / cost * 100).toFixed(2) : '—';
      const wt    = total > 0 ? (value / total * 100).toFixed(2) : '—';
      return [h.ticker, h.name, h.sector || '', h.shares, h.avg_price, h.current_price,
              cost.toFixed(2), value.toFixed(2), pnl.toFixed(2), pnlP, wt, h.target_weight || 0];
    })
  );
  showToast(`✓ تم تصدير ${holdings.length} سهم`, 'success');
}

init();
