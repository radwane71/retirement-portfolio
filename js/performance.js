/* =====================================================================
   performance.js — الأداء التاريخي
   سجل تدقيق كامل: مراكز مفتوحة / مغلقة / تايم لاين شهري
   ===================================================================== */

'use strict';

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'open-pos': {
    title: '📈 المراكز المفتوحة',
    body: `
      <p>الأسهم التي ما زلت تملكها الآن، مع تكلفتها وقيمتها الحالية وربحها/خسارتها غير المحققة (على الورق).</p>
      <div class="info-formula">ر/خ غير محقق = القيمة السوقية − تكلفة الشراء (شاملة العمولة والضريبة)</div>
      <p class="info-note">💡 «غير محقق» لأنك لم تبع بعد — يتغيّر مع السعر يومياً ولا يصبح حقيقياً إلا عند البيع.</p>`
  },
  'closed-pos': {
    title: '📉 المراكز المغلقة',
    body: `
      <p>الأسهم التي بعتها بالكامل (لم يتبقَّ منها شيء). تُظهر ربحك/خسارتك <strong>المحققة</strong> الفعلية على كل صفقة مكتملة.</p>
      <div class="info-formula">ر/خ محقق = صافي عائد البيع − تكلفة الشراء</div>
      <p class="info-note">💡 راجع مراكزك المغلقة لتتعلّم من قراراتك: هل بعت رابحاً مبكراً؟ هل تمسّكت بخاسر طويلاً؟</p>`
  },
  'div-metrics': {
    title: '💰 مؤشرات التوزيعات المتقدمة',
    body: `
      <p>مقاييس عمق لقياس كفاءة محفظتك كمصدر دخل توزيعي:</p>
      <div class="info-math">
        • <strong>YoC (العائد على التكلفة):</strong> توزيعات سنوية ÷ ما دفعته أصلاً.<br>
        • <strong>Dividend ROI:</strong> إجمالي التوزيعات المستلمة ÷ التكلفة — كم استرددت من رأس مالك كتوزيعات.<br>
        • <strong>سنوات الاسترداد:</strong> كم سنة تقريباً لاسترداد كامل تكلفتك من التوزيعات وحدها.
      </div>
      <p class="info-note">💡 سهم بـYoC مرتفع ومتزايد هو جوهرة دخل تقاعدي — مع الوقت قد تتجاوز توزيعاته السنوية ما دفعته فيه.</p>`
  },
  'behavioral': {
    title: '🧠 تحليل السلوك الاستثماري',
    body: `
      <p>مرآة صادقة تكشف أنماطك الفعلية: هل تطارد الأسعار المرتفعة؟ تبيع بسرعة عند الربح؟ تركّز في قلة من الأسهم؟</p>
      <p class="info-note">💡 أكبر عدوّ للمستثمر هو سلوكه لا السوق. رؤية أنماطك بالأرقام أول خطوة لتصحيحها — البيانات لا تجامل.</p>`
  },
  'kpi-realized': {
    title: '💵 الربح/الخسارة المحقق',
    body: `
      <p>تخيّل أنك اشتريت لعبة بـ10 ريال وبعتها بـ15. الـ5 ريال هي «ربح محقق» — صار في جيبك فعلاً لأنك بعت.</p>
      <div class="info-formula">المحقق = ما قبضته من البيع − ما دفعته لشراء ما بعته</div>
      <p class="info-note">💡 «محقق» = حقيقي وثابت، لأنك بعت وانتهى. عكسه «غير محقق» الذي ما زال مجرد رقم على الشاشة يتغيّر كل يوم.</p>`
  },
  'kpi-unrealized': {
    title: '📄 الربح/الخسارة غير المحقق',
    body: `
      <p>لو عندك لعبة اشتريتها بـ10 ريال وصار سعرها اليوم 13، عندك «ربح على الورق» بـ3 ريال — لكنه ليس في جيبك لأنك ما بعت. لو نزل السعر بكرة، يختفي.</p>
      <div class="info-formula">غير المحقق = قيمة أسهمك اليوم − ما دفعته فيها</div>
      <p class="info-note">💡 يتحرّك مع السعر لحظياً. لا يصير حقيقياً إلا يوم تبيع.</p>`
  },
  'kpi-drawdown': {
    title: '📉 أقصى تراجع (Max Drawdown)',
    body: `
      <p>أكبر «هبوطة» مرّت على محفظتك من أعلى قمة وصلت لها إلى أدنى قاع بعدها. مثل أعلى نقطة في الأفعوانية ثم أوطى نقطة — كم كان طول السقوط.</p>
      <div class="info-formula">التراجع = (القاع − القمة) ÷ القمة × 100 — محسوب على الأداء المعزول عن مشترياتك ومبيعاتك</div>
      <p class="info-note">💡 يقيس أسوأ ألم مررت به. رقم صغير (قريب من الصفر) = مسار هادئ. رقم كبير سالب = تقلّبات حادة تحتاج أعصاباً قوية.</p>
      <p class="info-note">🔬 <b>على أسهمك وحدها.</b> حتى 2026-08-21 كان يُحسب على لقطات صافي الثروة — أي أسهم + نقد + عقار — فكانت إعادة تقييم عقار أو إعادة كتابة رصيد النقد تحرّك «أقصى تراجع محفظتك». الآن نفس أساس تبويب مقارنة المؤشر بالضبط: قيمة أسهمك، مصحَّحةً بمشترياتك ومبيعاتك.</p>
      <p class="info-note">⚠️ يحتاج لقطات تحمل <b>مكوّن الأسهم</b>. اللقطات الأقدم من إضافة هذا الحقل لا تدخل الحساب — فإن ظهر «بيانات غير كافية» فالسبب هذا لا قلّة لقطاتك.</p>`
  },
  'kpi-hhi': {
    title: '🧩 تركّز المحفظة (HHI)',
    body: `
      <p>يقيس هل بيضك كله في سلة واحدة. لو معظم فلوسك في سهم أو سهمين، الرقم يرتفع (خطر). لو موزّعة على أسهم كثيرة بأوزان متقاربة، ينخفض (أأمن).</p>
      <div class="info-formula">HHI = مجموع مربّعات أوزان الأسهم · العدد الفعّال = 1 ÷ HHI</div>
      <p class="info-note">💡 «العدد الفعّال» يقول: تنوّعك الحقيقي يعادل كم سهماً متساوياً. تملك 20 سهماً لكن العدد الفعّال 4؟ إذن أنت فعلياً مركّز في 4.</p>`
  },
  'kpi-risk': {
    title: '⚖️ العائد مقابل المخاطرة (شارب/سورتينو/التذبذب)',
    body: `
      <p>مو المهم كم ربحت، المهم كم «رعب» تحمّلت عشان تربح. طفلان جابا نفس الدرجة، بس واحد ذاكر بهدوء والثاني سهر ليلة الامتحان بتوتر — أيّهما أفضل؟</p>
      <div class="info-math">
        • <strong>التذبذب:</strong> كم يتأرجح عائدك صعوداً وهبوطاً (أقل = أهدأ).<br>
        • <strong>Sharpe:</strong> كم ربح مقابل كل وحدة تأرجح (أعلى = أفضل).<br>
        • <strong>Sortino:</strong> مثل شارب لكن يعاقب فقط على التأرجح <em>الهابط</em> (المؤلم) — أنسب لمن يهمّه حماية رأس ماله.
      </div>
      <p class="info-note">🔬 <b>محسوبة على أسهمك وحدها</b>، بنفس أساس تبويب مقارنة المؤشر وأقصى التراجع — لا على صافي ثروتك. قبل 2026-08-21 كانت على لقطات صافي الثروة (أسهم + نقد + عقار)، فكان تحرّك عقارك يظهر «تذبذباً» في محفظتك.</p>
      <p class="info-note">🟡 تحتاج أربع لقطات على الأقل تحمل <b>مكوّن الأسهم</b> — والسطر تحت كل رقم يقول لك كم لديك من كم. لذلك تظهر شارة «مبكّر/تقريبي» حتى تتراكم.</p>`
  },
};

// ══════════════════════════════════════════════════════════════════════
// جسر رموز التصميم + مولّدات المكوّنات
// ──────────────────────────────────────────────────────────────────────
// ربط: نسخة طبق الأصل من مولّدات js/dashboard.js (أعلى الملف) — صفحة الأداء
// لا تُحمّل dashboard.js، فتُنسخ هنا بنفس التوقيعات بالضبط. أي تعديل هناك
// يجب أن يُنسخ هنا (والعكس). المكوّنات معرَّفة في css/style.css تحت
// «نظام مكوّنات اللوحة»: .card-head .hero-num .tag .meter .brow .kvs .note .stack .dot
// قاعدة ثابتة: لا لون سداسي مكتوب يدوياً في هذا الملف — رموز التصميم فقط،
// واللون وحده لا يحمل معنى (كل حالة معها أيقونة ونص).
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
// رقم بطل: رقم واحد يقود البطاقة (.hero-num + .hero-cap)
function heroHtml(valueTxt, caption = '', color = '') {
  return `<div><div class="hero-num"${color ? ` style="color:${color}"` : ''}>${valueTxt}</div>` +
    (caption ? `<div class="hero-cap">${caption}</div>` : '') + `</div>`;
}
// كتلة تفاصيل قابلة للطيّ — «البساطة»: التفصيل يُخبَّأ لا يُحذَف
function detailsHtml(summary, innerHtml, open = false) {
  return `<details class="perf-details"${open ? ' open' : ''}><summary>${summary}</summary><div class="dt-body">${innerHtml}</div></details>`;
}

let _tx       = [];
let _holdings = [];
let _divs     = [];
let _cf       = [];   // cashflow_entries — للرأسمال التراكمي الفعلي
let _snapshots = []; // net_worth_snapshots — لقيمة المحفظة التاريخية
let _positionCache = null; // H-4: cache to avoid triple recomputation per render
let _monthlyChart     = null;
let _activeTab        = 'open';
let _monthlyChartMode = 'combined'; // 'combined' | 'lines' | 'stacked' | 'divonly'
let _monthlyDataCache = null;       // I-3: built once per data load, reused across tabs

// ── Init ──────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-performance');

  // M-15: explicit high limit on all large tables — Supabase default 1000 truncates silently
  const [rTx, rH, rDiv, rCf, rSnap] = await Promise.all([
    supabaseClient.from('transactions').select('*').eq('is_archived', false).order('date').limit(100000),
    supabaseClient.from('holdings').select('*').limit(10000),
    supabaseClient.from('dividends').select('*').eq('is_archived', false).order('date').limit(100000),
    supabaseClient.from('cashflow_entries').select('date,type,amount').eq('is_archived', false).order('date').limit(100000),
    // snapshot_json يحمل auto_stocks — قيمة الأسهم وحدها داخل اللقطة اليدوية
    supabaseClient.from('net_worth_snapshots').select('date,total_value,notes,snapshot_json').order('date').limit(10000),
  ]);

  // AUDIT-FIX (2026-08): افحص .error لكل استعلام — الفشل الصامت كان يعرض محفظة فارغة
  const _failures = [];
  const _takeData = (res, label) => {
    if (res.error) { _failures.push(label); console.error('[performance] فشل تحميل ' + label, res.error); return []; }
    return res.data || [];
  };
  _tx        = _takeData(rTx,   'المعاملات');
  _holdings  = _takeData(rH,    'الحيازات');
  _divs      = _takeData(rDiv,  'التوزيعات');
  _cf        = _takeData(rCf,   'التدفقات النقدية');
  _snapshots = _takeData(rSnap, 'لقطات صافي الثروة');
  if (_failures.length) showToast('⚠️ تعذّر تحميل: ' + _failures.join('، ') + ' — البيانات المعروضة قد تكون ناقصة', 'error');
  _positionCache    = null; // invalidate cache on fresh load
  _monthlyDataCache = null; // I-3: invalidate monthly data cache

  // تاريخ الأسعار اليومي — أساس إعادة بناء خطّ المحفظة ومقاييس المخاطر
  await _loadPriceHistory();

  renderKPIs();
  renderOpenPositions();
  renderClosedPositions();
  renderMonthlyTimeline();
  renderMonthlyChart();
}

// ── Tab switcher ──────────────────────────────────────────────────────
function showPerfTab(tab) {
  _activeTab = tab;
  ['open','closed','timeline','monthly-chart','benchmark','div-metrics','behavioral'].forEach(t => {
    const view = document.getElementById(`pview-${t}`);
    const btn  = document.getElementById(`ptab-${t}`);
    if (view) view.style.display = t === tab ? '' : 'none';
    if (btn)  btn.classList.toggle('active', t === tab);
  });
  if (tab === 'benchmark')   initBenchmarkTab();
  if (tab === 'div-metrics') renderDividendMetrics();
  if (tab === 'behavioral')  renderBehavioralAudit();
}

// H-4: single entry point — computes once per data load, cached for all callers
function getPositionData() {
  if (!_positionCache) _positionCache = buildPositionData();
  return _positionCache;
}

// ── XIRR لكل مركز منفرداً ─────────────────────────────────────────────
// terminalValue = القيمة السوقية الحالية للمراكز المفتوحة، null للمغلقة
function _calcPositionXIRR(p, tickerDivs, terminalValue) {
  if (!p.allBuys?.length) return null;
  const flows = [];
  // مشتريات (سالبة)
  p.allBuys.forEach(t => {
    const d = parseDateLocal(t.date);
    if (d) flows.push({ date: d, amount: -(+t.total) });
  });
  // مبيعات (موجبة)
  (p.allSells || []).forEach(t => {
    const d = parseDateLocal(t.date);
    if (d) flows.push({ date: d, amount: +(+t.total) });
  });
  // أرباح موزعة (موجبة)
  tickerDivs.forEach(d => {
    const dt = parseDateLocal(d.date);
    if (dt) flows.push({ date: dt, amount: +(+d.amount) });
  });
  // القيمة النهائية (للمراكز المفتوحة)
  if (terminalValue != null && terminalValue > 0) {
    flows.push({ date: new Date(), amount: terminalValue });
  }
  // XIRR يحتاج على الأقل تدفقين بإشارات مختلفة
  const hasNeg = flows.some(f => f.amount < 0);
  const hasPos = flows.some(f => f.amount > 0);
  if (!hasNeg || !hasPos || flows.length < 2) return null;
  try { return computeXIRR(flows); } catch { return null; }
}

// ── Build position maps ───────────────────────────────────────────────
function buildPositionData() {
  // تجميع مشتريات وبيوعات لكل رمز
  const posMap = {};
  // فهرسة أرباح كل رمز (للـ XIRR الفردي)
  const divsByTicker = {};
  _divs.forEach(d => {
    if (!divsByTicker[d.ticker]) divsByTicker[d.ticker] = [];
    divsByTicker[d.ticker].push(d);
  });

  _tx.forEach(t => {
    const ticker = t.ticker;
    if (!posMap[ticker]) posMap[ticker] = {
      ticker, name: t.name || ticker,
      buyShares: 0, sellShares: 0,
      buyCost: 0,   sellRevenue: 0,
      firstBuyDate: null, lastSellDate: null,
      allBuys: [], allSells: []
    };
    const p = posMap[ticker];
    if (t.type === 'buy' || t.type === 'grant') {
      p.buyShares  += +t.shares;
      p.buyCost    += +t.total;
      p.allBuys.push(t);
      if (!p.firstBuyDate || t.date < p.firstBuyDate) p.firstBuyDate = t.date;
    }
    if (t.type === 'sell') {
      p.sellShares   += +t.shares;
      p.sellRevenue  += +t.total;
      p.allSells.push(t);
      if (!p.lastSellDate || t.date > p.lastSellDate) p.lastSellDate = t.date;
    }
  });

  // أرباح لكل رمز
  const divMap = {};
  _divs.forEach(d => { divMap[d.ticker] = (divMap[d.ticker] || 0) + +d.amount; });

  // تصنيف كل رمز
  const open    = [];
  const closed  = [];
  const partial = [];

  Object.values(posMap).forEach(p => {
    const remaining = p.buyShares - p.sellShares;
    p.divReceived   = divMap[p.ticker] || 0;

    // المقابل في holdings للسعر الحالي
    // AUDIT-FIX (2026-08): current_price = null كان يتحول لـ 0 فيُظهر خسارة −100% وهمية
    const h  = _holdings.find(x => x.ticker === p.ticker);
    const cp = h?.current_price;
    p.currentPrice = (cp == null || +cp <= 0) ? null : +cp;

    // AUDIT-FIX (2026-07): الربح المحقق بالمنهج الزمني — متوسط التكلفة وقت كل
    // بيع، لا متوسطاً نهائياً يشمل مشتريات لاحقة للبيع. مطابق تماماً لمنهج
    // لوحة التحكم وسجل المعاملات (إصلاح F-6) — يوحّد الرقم عبر الصفحات الثلاث.
    const events = [...p.allBuys, ...p.allSells]
      .slice().sort((a, b) => ((a.date || '') < (b.date || '') ? -1 : (a.date || '') > (b.date || '') ? 1 : 0));
    let _sh = 0, _cost = 0, _realized = 0;
    events.forEach(t => {
      if (t.type === 'sell') {
        const avg  = _sh > 0 ? _cost / _sh : 0;
        const sold = Math.min(+t.shares, _sh);
        _realized += +t.total - avg * sold;
        _cost = Math.max(0, _cost - avg * sold);
        _sh   = Math.max(0, _sh - +t.shares);
      } else { // buy أو grant (المنحة total = 0 فتخفض المتوسط)
        _cost += +t.total;
        _sh   += +t.shares;
      }
    });
    // متوسط التكلفة الزمني للحيازة المتبقية — يطابق holdings.avg_price
    p.avgCost = _sh > 0.001 ? _cost / _sh : (p.buyShares > 0 ? p.buyCost / p.buyShares : 0);

    if (remaining <= 0.001) {
      // مغلق بالكامل — المنهج الزمني يكافئ (حصيلة البيع − كامل تكلفة الشراء)
      const realizedPnL = _realized;
      p.realizedPnL  = realizedPnL;
      // AUDIT-FIX (2026-08): تكلفة صفرية (مركز أسهم منحة بالكامل) كانت تُعرَض 0.00%
      // وهي قيمة غير معرَّفة رياضياً (قسمة على صفر) — الآن null ⇒ «—» صراحةً.
      p.realizedPct  = p.buyCost > 0 ? realizedPnL / p.buyCost * 100 : null;
      p.totalReturn  = realizedPnL + p.divReceived;
      p.totalReturnPct = p.buyCost > 0 ? p.totalReturn / p.buyCost * 100 : null;
      // مدة الاحتفاظ — M-6: use parseDateLocal to avoid UTC-midnight off-by-one
      if (p.firstBuyDate && p.lastSellDate) {
        const days = Math.floor((parseDateLocal(p.lastSellDate) - parseDateLocal(p.firstBuyDate)) / 86400000);
        p.holdDays = days;
      }
      // XIRR للمراكز المغلقة
      p.xirr = _calcPositionXIRR(p, divsByTicker[p.ticker] || [], null);
      closed.push(p);
    } else {
      // مفتوح (كلياً أو جزئياً)
      p.remainingShares   = remaining;
      const costOfRemaining = _cost;            // تكلفة الحيازة المتبقية (زمنية)
      p.marketValue       = p.currentPrice != null ? p.currentPrice * remaining : null;
      p.unrealizedPnL     = p.marketValue != null ? p.marketValue - costOfRemaining : null;
      p.unrealizedPct     = costOfRemaining > 0 && p.unrealizedPnL != null ? p.unrealizedPnL / costOfRemaining * 100 : null;
      // الربح المحقق من البيع الجزئي — زمني (WAC وقت كل بيع)
      const costOfSold    = Math.max(0, p.buyCost - _cost);
      p.partialRealizedPnL = _realized;
      p.totalReturn        = (p.unrealizedPnL || 0) + p.partialRealizedPnL + p.divReceived;
      // AUDIT-FIX (2026-08): المقام = كل ما أُنفق على الرمز (متبقٍّ + مُباع). كان
      // الشرط على costOfRemaining وحده، والصفر يُعرَض 0.00% رغم وجود عائد فعلي.
      p.totalReturnBasis   = costOfRemaining + costOfSold;
      p.totalReturnPct     = p.totalReturnBasis > 0 ? p.totalReturn / p.totalReturnBasis * 100 : null;
      // XIRR للمراكز المفتوحة (القيمة الحالية كتدفق نهائي)
      p.xirr = _calcPositionXIRR(p, divsByTicker[p.ticker] || [], p.marketValue);
      if (p.sellShares > 0.001) partial.push(p);
      else open.push(p);
    }
  });

  // ترتيب: المفتوحة بالر/خ، المغلقة بالتاريخ
  open.sort((a, b)    => (b.unrealizedPnL || 0) - (a.unrealizedPnL || 0));
  partial.sort((a, b) => (b.unrealizedPnL || 0) - (a.unrealizedPnL || 0));
  closed.sort((a, b)  => (b.lastSellDate  || '').localeCompare(a.lastSellDate || ''));

  return { open: [...open, ...partial], closed };
}

// ── KPIs ──────────────────────────────────────────────────────────────
function renderKPIs() {
  const { open, closed } = getPositionData();
  const totalUnreal  = open.reduce((s, p) => s + (p.unrealizedPnL || 0), 0);
  const totalReal    = closed.reduce((s, p) => s + (p.realizedPnL  || 0), 0) +
                       open.reduce((s, p) => s + (p.partialRealizedPnL || 0), 0);

  setText('pk-open',       open.length + ' سهم');
  setText('pk-closed',     closed.length + ' صفقة');
  const rpEl = document.getElementById('pk-realized');
  if (rpEl) { rpEl.textContent = formatSAR(totalReal, true); rpEl.className = 'value num ' + (totalReal >= 0 ? 'text-success' : 'text-danger'); }
  const urEl = document.getElementById('pk-unrealized');
  if (urEl) { urEl.textContent = formatSAR(totalUnreal, true); urEl.className = 'value num ' + (totalUnreal >= 0 ? 'text-success' : 'text-danger'); }

  // HHI — مؤشر تركز المحفظة (Herfindahl-Hirschman Index)
  const hhiEl  = document.getElementById('pk-hhi');
  const hhiSub = document.getElementById('pk-hhi-sub');
  if (hhiEl && _holdings.length) {
    // AUDIT-FIX (2026-08): الأسهم بلا سعر حالي كانت تدخل بوزن صفر بصمت فتُزيّن
    // التنويع (تُخفض HHI دون أن تُذكر). الآن تُستبعَد صراحةً ويُعلَن عددها.
    const priced   = _holdings.filter(h => h.current_price != null && +h.current_price > 0 && +h.shares > 0);
    const skipped  = _holdings.length - priced.length;
    const totalMkt = priced.reduce((s, h) => s + +h.shares * +h.current_price, 0);
    const hhi = totalMkt > 0
      ? priced.reduce((s, h) => { const w = (+h.shares * +h.current_price) / totalMkt; return s + w * w; }, 0)
      : 0;
    const effectiveN = hhi > 0 ? (1 / hhi).toFixed(1) : '—';
    const _mDiv = assessMetricMaturity('diversification', { stockCount: priced.length });
    hhiEl.innerHTML = `${hhi.toFixed(4)} <span class="hhi-n" title="العدد الفعلي للمراكز المستقلة = 1 ÷ HHI">(N=${effectiveN})</span>`
      + maturityBadge(_mDiv.level, _mDiv.reason);
    // AUDIT-FIX (2026-08): العتبات مواءَمة مع الهدف الموثّق N_فعّال ≥ 15 (HHI ≤ 1/15 ≈ 0.067)
    hhiEl.className   = 'value num ' + (hhi <= 0.067 ? 'text-success' : hhi <= 0.10 ? 'text-warning' : 'text-danger');
    if (hhiSub) hhiSub.textContent =
      (hhi <= 0.067 ? '✅ تنويع ممتاز — N الفعّال ≥ 15 (الهدف)'
       : hhi <= 0.10 ? '⚠️ تنويع مقبول — N الفعّال 10–15، دون الهدف'
       : '❌ تركز عالٍ — N الفعّال أقل من 10')
      + (skipped > 0 ? ` · ${skipped} سهم بلا سعر مُستبعَد` : '');
  }

  // Max Drawdown — AUDIT-FIX (H3): compute on the flow-adjusted TWR index, NOT raw net worth.
  // On raw total_value a deposit masks a drawdown and a withdrawal masquerades as one. Reusing
  // the Modified-Dietz TWR series (same one the benchmark tab uses) isolates true market drops.
  // AUDIT-FIX (2026-08-21): كان الأساس `net_worth_snapshots.total_value` — أي
  // أسهم + نقد + عقار (أو صافي الثروة كاملاً في اللقطة اليدوية) مصحَّحاً بإيداعات
  // الوساطة وحدها. فكان «أقصى تراجع محفظتك» يتحرّك بإعادة تقييم عقار أو إعادة
  // كتابة رصيد النقد. وبعد إعادة تأطير تبويب المقارنة إلى الأسهم وحدها صار في
  // الصفحة أساسان متعارضان في شاشة واحدة. الآن أساس واحد: أسهمك وتدفقاتها.
  const ddEl = document.getElementById('pk-max-drawdown');
  const _riskSeries = _dailyPortfolioSeries() || _screenStocksSeries(_stocksOnlySeries()).clean;
  if (ddEl && _riskSeries.length >= 2) {
    const { twrMap, sortedSnaps } = _computeTWR(_riskSeries,
      _riskSeries.covered ? _externalFlows() : _stockFlows());
    // sortedSnaps is ISO-date ordered & de-duplicated by day; twrMap[date] = index (base 100)
    let peak = twrMap[sortedSnaps[0].date] ?? 100;
    let maxDD = 0;
    let peakDate = sortedSnaps[0].date;
    let ddPeakDate = '', ddTroughDate = '';
    for (const s of sortedSnaps) {
      const v = twrMap[s.date];
      if (v == null) continue;
      if (v > peak) { peak = v; peakDate = s.date; }
      const dd = peak > 0 ? (v - peak) / peak * 100 : 0;
      if (dd < maxDD) { maxDD = dd; ddPeakDate = peakDate; ddTroughDate = s.date; }
    }
    // AUDIT-FIX (2026-08): شارة النضج على عدد اللقطات بعد إزالة التكرارات لا العدد الخام
    const _mDD = assessMetricMaturity('risk', { snapshots: sortedSnaps.length });
    ddEl.innerHTML    = maxDD.toFixed(2) + '%' + maturityBadge(_mDD.level, _mDD.reason);
    ddEl.className    = 'value num ' + (maxDD < -15 ? 'text-danger' : maxDD < -8 ? 'text-warning' : 'text-success');
    ddEl.title        = ddPeakDate ? `من ${formatDate(ddPeakDate)} إلى ${formatDate(ddTroughDate)}` : '';
  } else if (ddEl) {
    ddEl.textContent = '— (بيانات غير كافية)';
    ddEl.className   = 'value num text-muted';
    ddEl.title = `${_riskSeries.length} من ${(_snapshots || []).length} لقطة تحمل قيمة أسهم — يحتاج نقطتين على الأقل`;
  }

  // ── مقاييس مُعدَّلة بالمخاطر: التذبذب / شارب / سورتينو ──────────────
  renderRiskMetrics();
}

// ثابت العائد الخالي من المخاطر (افتراض): ~ عائد أدوات قصيرة سعودية.
// افتراض تخطيطي — لذلك المقاييس تُعلَّم بشارة 🟡 تقريبية.
const RISK_FREE_RATE = 0.03;

// ══════════════════════════════════════════════════════════════════════
// Sharpe / Sortino / التذبذب — من سلسلة عوائد TWR (Modified Dietz)
// ──────────────────────────────────────────────────────────────────────
// نشتقّ عوائد الفترات من مؤشر TWR المعزول عن التدفقات: r_i = idx_i/idx_{i-1} − 1.
// هذه العوائد مُصفّاة من أثر الإيداع/السحب أصلاً (بخلاف XIRR)، فتصلح لقياس المخاطرة.
// القيد الصادق: لقطاتنا شهرية تقريباً وغير منتظمة → المقاييس تقديرية (شارة 🟡).
//   التذبذب السنوي  = الانحراف المعياري للعوائد × √(فترات/سنة)
//   تذبذب الهبوط    = √(متوسط مربّع العوائد السالبة مقابل MAR=0) × √(فترات/سنة)
//   شارب            = (العائد السنوي − RF) ÷ التذبذب السنوي
//   سورتينو         = (العائد السنوي − RF) ÷ تذبذب الهبوط
function _computeRiskMetrics() {
  // نفس أساس تبويب المقارنة وأقصى التراجع: أسهمك وحدها وتدفقاتها (لا نقد ولا عقار)
  const series = _dailyPortfolioSeries() || _screenStocksSeries(_stocksOnlySeries()).clean;
  if (series.length < 4) return null;
  const { twrMap, sortedSnaps } = _computeTWR(series,
    series.covered ? _externalFlows() : _stockFlows());
  const pts = sortedSnaps
    .map(s => ({ date: s.date, idx: twrMap[s.date] }))
    .filter(p => p.idx != null && p.idx > 0);
  if (pts.length < 4) return null;                  // نحتاج ≥3 عوائد لتقدير معقول

  // AUDIT-FIX (2026-08): أسقط الفترات الأقصر من 20 يوماً من حساب التذبذب —
  // فترات قصيرة جداً تضخّم معامل التسنية وتشوّه الانحراف المعياري.
  // نرقّق السلسلة: نُبقي نقطة فقط إذا بَعُدت ≥ 20 يوماً عن آخر نقطة مُبقاة (يحفظ التركيب الهندسي).
  const MIN_PERIOD_DAYS = 20;
  const thinned = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const gap = (new Date(pts[i].date) - new Date(thinned[thinned.length - 1].date)) / 86400000;
    if (gap >= MIN_PERIOD_DAYS) thinned.push(pts[i]);
  }

  const rets = [];
  for (let i = 1; i < thinned.length; i++) rets.push(thinned[i].idx / thinned[i - 1].idx - 1);
  if (rets.length < 3) return null;

  const spanDays = (new Date(pts[pts.length - 1].date) - new Date(pts[0].date)) / 86400000;
  const years    = spanDays / 365.25;
  if (years <= 0) return null;
  const volSpanDays    = (new Date(thinned[thinned.length - 1].date) - new Date(thinned[0].date)) / 86400000;
  const volYears       = volSpanDays / 365.25;
  const periodsPerYear = volYears > 0 ? rets.length / volYears : 12; // متوسط عدد الفترات في السنة

  // AUDIT-FIX (2026-08): لا تسنية على فترة أقل من 12 شهراً — العائد يُعرض تراكمياً
  // بوسم «تراكمي (المدة أقل من سنة)»، والمقاييس تُحسب على مدى الفترة نفسها بلا تضخيم.
  const shortSpan   = years < 1;
  const totalGrowth = pts[pts.length - 1].idx / pts[0].idx;
  const annReturn   = shortSpan ? (totalGrowth - 1) : Math.pow(totalGrowth, 1 / years) - 1;

  // تذبذب الفترة (عيّنة) وتذبذب الهبوط (مقابل MAR=0)
  const mean   = rets.reduce((s, r) => s + r, 0) / rets.length;
  const varSmp = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  const volP   = Math.sqrt(Math.max(0, varSmp));
  const downSq = rets.reduce((s, r) => s + (r < 0 ? r * r : 0), 0) / rets.length;
  const ddP    = Math.sqrt(Math.max(0, downSq));

  // فترة قصيرة: تذبذب على مدى الفترة كلها (√عدد الفترات) بدل التسنية بـ √(فترات/سنة)
  const annVol      = shortSpan ? volP * Math.sqrt(rets.length) : volP * Math.sqrt(periodsPerYear);
  const annDownside = shortSpan ? ddP  * Math.sqrt(rets.length) : ddP  * Math.sqrt(periodsPerYear);
  const excess      = annReturn - (shortSpan ? RISK_FREE_RATE * years : RISK_FREE_RATE);

  return {
    nReturns: rets.length,
    nSnaps: sortedSnaps.length,   // بعد إزالة التكرارات — لشارة النضج
    shortSpan,
    annReturn, annVol, annDownside,
    sharpe:  annVol      > 1e-9 ? excess / annVol      : null,
    sortino: annDownside > 1e-9 ? excess / annDownside : null,
  };
}

function renderRiskMetrics() {
  const volEl = document.getElementById('pk-volatility');
  const shEl  = document.getElementById('pk-sharpe');
  const soEl  = document.getElementById('pk-sortino');
  const m = _computeRiskMetrics();

  // AUDIT-FIX (2026-08-21): بعد توحيد الأساس على الأسهم وحدها صار سبب النقص
  // مختلفاً: ليس «لقطات قليلة» بل «لقطات لا تحمل مكوّن الأسهم». نقولها بدقة
  // مع العدد الفعلي، فالمالك يعرف ما ينقصه بالضبط بدل إرشاد عام.
  const _daily0 = _dailyPortfolioSeries();
  const _usable = _daily0 ? _daily0.length : _screenStocksSeries(_stocksOnlySeries()).clean.length;
  const _total  = _daily0 ? _daily0.length : (_snapshots || []).length;
  const setInsufficient = (el, subId) => {
    if (!el) return;
    el.textContent = '— (بيانات غير كافية)';
    el.className   = 'value num text-muted';
    const sub = document.getElementById(subId);
    if (sub) sub.textContent = `🟡 ${_usable} من ${_total} لقطة تحمل قيمة أسهم — تحتاج 4 على الأقل`;
  };
  if (!m) { setInsufficient(volEl, 'pk-volatility-sub'); setInsufficient(shEl, 'pk-sharpe-sub'); setInsufficient(soEl, 'pk-sortino-sub'); return; }

  // شارة نضج موحّدة: مقاييس المخاطر تحتاج لقطات شهرية كافية
  // AUDIT-FIX (2026-08): العدد بعد إزالة التكرارات (m.nSnaps) لا _snapshots.length الخام
  const _mRisk = assessMetricMaturity('risk', { snapshots: m.nSnaps });
  const _rb = maturityBadge(_mRisk.level, _mRisk.reason);
  // وسم الفترة القصيرة: المقاييس محسوبة على مدى الفترة بلا تسنية
  const _spanTag = m.shortSpan ? ' <span class="small text-muted">تراكمي (المدة أقل من سنة)</span>' : '';

  if (volEl) {
    volEl.innerHTML  = (m.annVol * 100).toFixed(1) + '%' + _rb + _spanTag;
    volEl.className   = 'value num ' + (m.annVol < 0.15 ? 'text-success' : m.annVol < 0.30 ? 'text-warning' : 'text-danger');
  }
  const ratioClass = v => v == null ? 'text-muted' : v >= 1 ? 'text-success' : v >= 0 ? 'text-warning' : 'text-danger';
  if (shEl) {
    shEl.innerHTML   = (m.sharpe == null ? '—' : m.sharpe.toFixed(2)) + _rb + _spanTag;
    shEl.className   = 'value num ' + ratioClass(m.sharpe);
  }
  if (soEl) {
    soEl.innerHTML   = (m.sortino == null ? '—' : m.sortino.toFixed(2)) + _rb + _spanTag;
    soEl.className   = 'value num ' + ratioClass(m.sortino);
    const sub = document.getElementById('pk-sortino-sub');
    if (sub) sub.textContent = (m.shortSpan ? 'تراكمي (المدة أقل من سنة)' : '🟡 تقريبي') + ` · ${m.nReturns} فترة`;
  }
}

// ── Open positions table ──────────────────────────────────────────────
function renderOpenPositions() {
  const { open } = getPositionData();
  const tbody = document.getElementById('open-tbody');
  const tfoot = document.getElementById('open-tfoot');
  if (!tbody) return;

  if (!open.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div class="icon">📗</div><p>لا توجد مراكز مفتوحة</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = open.map(p => {
    const isPartial = p.sellShares > 0.001;
    const costOfRem = p.avgCost * p.remainingShares;
    const pnlCls    = p.unrealizedPnL == null ? '' : p.unrealizedPnL >= 0 ? 'text-success' : 'text-danger';
    const retCls    = p.totalReturn   >= 0 ? 'text-success' : 'text-danger';
    // AUDIT-FIX (2026-08): حارس عمر لـ XIRR — مركز عمره أقل من 12 شهراً يحمل شارة
    const ageDays   = p.firstBuyDate ? (Date.now() - parseDateLocal(p.firstBuyDate)) / 86400000 : null;
    const xirrBadge = (p.xirr != null && ageDays != null && ageDays < 365)
      ? maturityBadge('early', 'مركز عمره أقل من 12 شهراً — XIRR مُسنّى من فترة قصيرة، فيتضخّم أو ينهار مع أي حركة سعر.')
      : '';
    return `<tr class="${isPartial ? 'position-partial' : 'position-open'}">
      <td><strong class="text-accent">${esc(p.ticker)}</strong></td>
      <td>${esc(p.name)}</td>
      <td class="num">${fmtN(p.remainingShares)}${isPartial ? ' <span class="small text-accent">(جزئي)</span>' : ''}</td>
      <td class="num text-muted">${formatSAR(p.avgCost)}</td>
      <td class="num text-accent">${p.currentPrice != null ? formatSAR(p.currentPrice) : '—'}</td>
      <td class="num">${formatSAR(costOfRem)}</td>
      <td class="num text-accent bold">${p.marketValue != null ? formatSAR(p.marketValue) : '—'}</td>
      <td class="num ${pnlCls} bold">${p.unrealizedPnL != null ? formatSAR(p.unrealizedPnL, true) : '—'}</td>
      <td class="num ${pnlCls}">${p.unrealizedPct != null ? p.unrealizedPct.toFixed(2) + '%' : '—'}</td>
      <td class="num text-success">${p.divReceived > 0 ? formatSAR(p.divReceived) : '—'}</td>
      <td class="num ${retCls} bold">${formatSAR(p.totalReturn, true)}<br><span class="small t-sub">${p.totalReturnPct != null ? p.totalReturnPct.toFixed(2)+'%' : '—'}</span></td>
      <td class="num ${p.xirr == null ? 'text-muted' : p.xirr >= 0 ? 'text-success' : 'text-danger'}" title="XIRR الفردي لهذا المركز — يشمل مشتريات وأرباح والقيمة الحالية">${p.xirr != null ? (p.xirr >= 0 ? '+' : '') + p.xirr.toFixed(2) + '%' + xirrBadge : '—'}</td>
    </tr>`;
  }).join('');

  // Totals footer
  const totalCost   = open.reduce((s, p) => s + p.avgCost * p.remainingShares, 0);
  const totalMkt    = open.reduce((s, p) => s + (p.marketValue || 0), 0);
  const totalUPnL   = open.reduce((s, p) => s + (p.unrealizedPnL || 0), 0);
  const totalDiv    = open.reduce((s, p) => s + p.divReceived, 0);
  const totalRet    = open.reduce((s, p) => s + p.totalReturn, 0);
  const totalUPct   = totalCost > 0 ? totalUPnL / totalCost * 100 : 0;
  // AUDIT-FIX (2026-08): مقام نسبة الإجمالي = نفس مقام الصف الفردي (تكلفة المتبقي + تكلفة المُباع)
  const totalRetBasis = open.reduce((s, p) => {
    const costOfRem = p.avgCost * p.remainingShares;
    return s + costOfRem + Math.max(0, p.buyCost - costOfRem);
  }, 0);
  const totalRetPct = totalRetBasis > 0 ? totalRet / totalRetBasis * 100 : null;
  tfoot.innerHTML = `<tr class="t-total">
    <td colspan="5"><strong class="small">الإجمالي</strong></td>
    <td class="num bold">${formatSAR(totalCost)}</td>
    <td class="num bold text-accent">${formatSAR(totalMkt)}</td>
    <td class="num bold ${totalUPnL>=0?'text-success':'text-danger'}">${formatSAR(totalUPnL,true)}</td>
    <td class="num ${totalUPnL>=0?'text-success':'text-danger'}">${totalUPct.toFixed(2)}%</td>
    <td class="num text-success">${formatSAR(totalDiv)}</td>
    <td class="num bold ${totalRet>=0?'text-success':'text-danger'}">${formatSAR(totalRet,true)}<br><span class="small t-sub">${totalRetPct != null ? totalRetPct.toFixed(2) + '%' : '—'}</span></td>
    <td></td>
  </tr>`;

  makeTableSortable('open-tbody');
}

// ── Closed positions table ────────────────────────────────────────────
function renderClosedPositions() {
  const { closed } = getPositionData();
  const tbody = document.getElementById('closed-tbody');
  const tfoot = document.getElementById('closed-tfoot');
  if (!tbody) return;

  if (!closed.length) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><div class="icon">📕</div><p>لا توجد مراكز مغلقة</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = closed.map(p => {
    const pnlCls  = p.realizedPnL >= 0 ? 'text-success' : 'text-danger';
    const retCls  = p.totalReturn  >= 0 ? 'text-success' : 'text-danger';
    const holdStr = p.holdDays != null
      ? (p.holdDays >= 365
          ? Math.floor(p.holdDays / 365) + ' سنة ' + (Math.floor((p.holdDays % 365) / 30)) + ' شهر'
          : p.holdDays + ' يوم')
      : '—';
    return `<tr class="position-closed">
      <td><strong class="text-muted">${esc(p.ticker)}</strong></td>
      <td>${esc(p.name)}</td>
      <td class="small text-muted">${p.firstBuyDate  ? formatDate(p.firstBuyDate)  : '—'}</td>
      <td class="small text-muted">${p.lastSellDate  ? formatDate(p.lastSellDate)  : '—'}</td>
      <td class="small text-muted">${holdStr}</td>
      <td class="num">${fmtN(p.buyShares)}</td>
      <td class="num text-muted">${formatSAR(p.buyCost)}</td>
      <td class="num text-accent">${formatSAR(p.sellRevenue)}</td>
      <td class="num ${pnlCls} bold">${formatSAR(p.realizedPnL, true)}</td>
      <td class="num ${p.realizedPct == null ? 'text-muted' : pnlCls}" ${p.realizedPct == null ? 'title="تكلفة الشراء صفر (أسهم منحة) — النسبة غير معرَّفة"' : ''}>${p.realizedPct != null ? p.realizedPct.toFixed(2) + '%' : '—'}</td>
      <td class="num text-success">${p.divReceived > 0 ? formatSAR(p.divReceived) : '—'}</td>
      <td class="num ${retCls} bold">${formatSAR(p.totalReturn, true)}</td>
    </tr>`;
  }).join('');

  const totalBuyCost   = closed.reduce((s, p) => s + p.buyCost,      0);
  const totalSellRev   = closed.reduce((s, p) => s + p.sellRevenue,   0);
  const totalRealPnL   = closed.reduce((s, p) => s + p.realizedPnL,   0);
  const totalDiv       = closed.reduce((s, p) => s + p.divReceived,   0);
  const totalRet       = closed.reduce((s, p) => s + p.totalReturn,   0);
  const totalRealPct   = totalBuyCost > 0 ? totalRealPnL / totalBuyCost * 100 : null;
  tfoot.innerHTML = `<tr class="t-total">
    <td colspan="6"><strong class="small">الإجمالي</strong></td>
    <td class="num bold text-muted">${formatSAR(totalBuyCost)}</td>
    <td class="num bold text-accent">${formatSAR(totalSellRev)}</td>
    <td class="num bold ${totalRealPnL>=0?'text-success':'text-danger'}">${formatSAR(totalRealPnL,true)}</td>
    <td class="num ${totalRealPnL>=0?'text-success':'text-danger'}">${totalRealPct != null ? totalRealPct.toFixed(2) + '%' : '—'}</td>
    <td class="num text-success">${formatSAR(totalDiv)}</td>
    <td class="num bold ${totalRet>=0?'text-success':'text-danger'}">${formatSAR(totalRet,true)}</td>
  </tr>`;

  makeTableSortable('closed-tbody');
}

// ── Monthly timeline ──────────────────────────────────────────────────

// M-8: build a cumulative-capital map once (O(M)) instead of re-scanning per month (O(N×M))
// Returns an object keyed by "YYYY-MM" → running total up to end of that month
function buildCumulativeCapitalMap() {
  const map = {};
  // sort cashflows chronologically using ISO string comparison
  const sorted = _cf.filter(e => e.date).slice().sort((a, b) =>
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  );
  let running = 0;
  for (const e of sorted) {
    const d = parseDateLocal(e.date);
    if (!d) continue;
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (e.type === 'deposit')    running += +e.amount;
    if (e.type === 'withdrawal') running -= +e.amount;
    map[ym] = running; // last entry for this month wins
  }
  return map;
}

// رأس المال المُودَع التراكمي حتى نهاية الشهر — مأخوذ من cashflow_entries مباشرةً
// (إيداعات تراكمية − سحوبات تراكمية) → يطابق صفحة التدفقات النقدية دائماً
function calcCumulativeCapital(cutoffYr, cutoffMo) {
  let total = 0;
  _cf.forEach(e => {
    if (!e.date) return;
    const d = parseDateLocal(e.date);
    if (!d) return;
    const yr = d.getFullYear(), mo = d.getMonth() + 1;
    if (yr > cutoffYr || (yr === cutoffYr && mo > cutoffMo)) return;
    if (e.type === 'deposit')    total += +e.amount;
    if (e.type === 'withdrawal') total -= +e.amount;
  });
  return total;
}

function getMonthlyData() {
  if (!_monthlyDataCache) _monthlyDataCache = buildMonthlyData();
  return _monthlyDataCache;
}

function buildMonthlyData() {
  if (!_tx.length && !_divs.length) return [];

  const allDates = [
    ..._tx.map(t => t.date),
    ..._divs.map(d => d.date)
  ].filter(Boolean);
  const firstDate = allDates.sort()[0];
  if (!firstDate) return [];

  const months = [];
  let cur = new Date(firstDate);
  cur.setDate(1);
  const today = new Date();
  today.setDate(1);

  while (cur <= today) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`);
    cur.setMonth(cur.getMonth()+1);
  }

  // M-8: build prefix-sum map once for all months (O(M) instead of O(N×M))
  const capitalMap = buildCumulativeCapitalMap();
  // For months with no cashflow entry, carry forward the last known total
  let lastCapital = 0;

  return months.map(ym => {
    const [yr, mo] = ym.split('-').map(Number);

    const monthTx  = _tx.filter(t => {
      if (!t.date) return false;
      // M-6: use parseDateLocal for consistent local-timezone month matching
      const d = parseDateLocal(t.date);
      return d && d.getFullYear() === yr && d.getMonth() + 1 === mo;
    });

    const monthDiv = _divs.filter(d => {
      if (!d.date) return false;
      const dt = parseDateLocal(d.date);
      return dt && dt.getFullYear() === yr && dt.getMonth() + 1 === mo;
    });

    const buys  = monthTx.filter(t => t.type === 'buy' || t.type === 'grant').reduce((s,t) => s + +t.total, 0);
    const sells = monthTx.filter(t => t.type === 'sell').reduce((s,t) => s + +t.total, 0);
    const divs  = monthDiv.reduce((s,d) => s + +d.amount, 0);
    const netMove = buys - sells;

    // رأس المال المُودَع التراكمي — from prefix-sum map, carry forward if no entry this month
    if (capitalMap[ym] !== undefined) lastCapital = capitalMap[ym];
    const cumulativeCapital = lastCapital;

    // قيمة المحفظة من أقرب snapshot في نفس الشهر أو قبله
    // نأخذ آخر snapshot حتى نهاية هذا الشهر
    // L-4: use actual last day of month — "day 0" of next month = last day of this month
    // AUDIT-FIX (2026-08): بناء النص محلياً — toISOString كان يُرجع اليوم السابق في UTC+3
    const monthEnd = `${yr}-${String(mo).padStart(2, '0')}-${String(new Date(yr, mo, 0).getDate()).padStart(2, '0')}`;
    const relevantSnaps = _snapshots.filter(s => s.date && s.date <= monthEnd);
    const latestSnap = relevantSnaps.length
      ? relevantSnaps[relevantSnaps.length - 1]
      : null;
    const portfolioValue = latestSnap ? +latestSnap.total_value : null;
    const isAutoSnap     = latestSnap ? isAutoSnapshot(latestSnap.notes) : false;
    // AUDIT-FIX (2026-08): لا لقطة في هذا الشهر ⇒ القيمة مُرحَّلة من شهر أسبق.
    // كانت تُعرَض كأنها قيمة الشهر نفسه بلا أي إشارة. نُصدِّر تاريخ اللقطة وعلَم
    // «قديمة» ليُعلَن مصدرها في الجدول (لا تقدير صامت — CLAUDE.md §8).
    const snapDate     = latestSnap ? latestSnap.date : null;
    const snapIsStale  = !!snapDate && snapDate.slice(0, 7) !== ym;

    return { ym, yr, mo, buys, sells, divs, cumulativeCapital, netMove, portfolioValue, isAutoSnap, snapDate, snapIsStale };
  });
}

function renderMonthlyTimeline() {
  const tbody = document.getElementById('timeline-tbody');
  if (!tbody) return;

  const filterYr = document.getElementById('timeline-year-filter')?.value;
  let data = getMonthlyData();

  // بناء فلتر السنوات
  const years = [...new Set(data.map(r => r.yr))].sort((a,b) => b-a);
  const sel = document.getElementById('timeline-year-filter');
  if (sel && sel.options.length <= 1) {
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      sel.appendChild(opt);
    });
    // افتراضي السنة الحالية
    const curYr = new Date().getFullYear();
    if (years.includes(curYr)) sel.value = curYr;
    data = data.filter(r => r.yr === curYr);
  } else if (filterYr) {
    data = data.filter(r => r.yr === +filterYr);
  }

  const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  // هل يوجد أي بيانات قيمة المحفظة؟
  const hasPortfolioValues = data.some(r => r.portfolioValue != null);

  // AUDIT-FIX (2026-08): مواءمة عمود «قيمة المحفظة» في كل رندر — يُضاف عند وجود بيانات
  // ويُزال عند غيابها (تغيّر الفلتر)، وempty-state يستخدم colspan مطابقاً لعدد أعمدة الرأس
  const thead = tbody.closest('table')?.querySelector('thead tr');
  if (thead) {
    const existingValCol = thead.querySelector('.col-portfolio-val');
    if (!existingValCol && hasPortfolioValues) {
      const th = document.createElement('th');
      th.className = 'col-portfolio-val';
      th.title = 'قيمة المحفظة الإجمالية في ذلك الشهر (من net_worth_snapshots)\n✦ = تسجيل تلقائي | ✎ = تسجيل يدوي | ⏳ = مُرحَّلة من شهر أسبق (لا لقطة لهذا الشهر)';
      th.innerHTML = 'قيمة المحفظة <span class="col-hint">▲</span>';
      thead.insertBefore(th, thead.children[1]); // بعد عمود الشهر
    } else if (existingValCol && !hasPortfolioValues) {
      existingValCol.remove();
    }
  }

  if (!data.length) {
    const colspan = thead ? thead.children.length : 6;
    tbody.innerHTML = `<tr><td colspan="${colspan}"><div class="empty-state"><div class="icon">📅</div><p>لا توجد بيانات</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = [...data].reverse().map(r => {
    const netCls = r.netMove >= 0 ? 'text-success' : 'text-danger';

    // عمود قيمة المحفظة
    let valCell = '';
    if (hasPortfolioValues) {
      if (r.portfolioValue != null) {
        const icon = r.isAutoSnap ? '✦' : '✎';
        const src  = r.isAutoSnap ? 'تسجيل تلقائي عند فتح الداشبورد' : 'تسجيل يدوي من صافي الثروة';
        // لقطة مُرحَّلة من شهر أسبق: تُوسَم ⏳ ويُذكر تاريخها الحقيقي
        const tip  = r.snapIsStale
          ? `لا توجد لقطة في هذا الشهر — القيمة مُرحَّلة من لقطة ${formatDate(r.snapDate)} (${src})`
          : `لقطة ${formatDate(r.snapDate)} — ${src}`;
        valCell = `<td class="num ${r.snapIsStale ? 'text-muted' : 'text-accent bold'}" title="${esc(tip)}">${formatSAR(r.portfolioValue)} <span class="small text-muted">${r.snapIsStale ? '⏳' : icon}</span></td>`;
      } else {
        valCell = `<td class="num text-muted small" title="لا يوجد snapshot لهذا الشهر — افتح الداشبورد لتسجيله تلقائياً">—</td>`;
      }
    }

    return `<tr>
      <td><strong>${MONTHS_AR[r.mo-1]} ${r.yr}</strong></td>
      ${valCell}
      <td class="num text-accent bold">${r.cumulativeCapital > 0 ? formatSAR(r.cumulativeCapital) : (r.cumulativeCapital < 0 ? formatSAR(r.cumulativeCapital, true) : '—')}</td>
      <td class="num text-success">${r.divs > 0 ? formatSAR(r.divs) : '—'}</td>
      <td class="num">${r.buys > 0 ? '+' + formatSAR(r.buys) : '—'}</td>
      <td class="num">${r.sells > 0 ? '−' + formatSAR(r.sells) : '—'}</td>
      <td class="num ${netCls} bold">${r.netMove !== 0 ? formatSAR(r.netMove, true) : '—'}</td>
    </tr>`;
  }).join('');

  makeTableSortable('timeline-tbody');
}

// ── Monthly chart ─────────────────────────────────────────────────────
function setMonthlyChartMode(mode) {
  _monthlyChartMode = mode;
  ['combined','lines','stacked','divonly'].forEach(m =>
    document.getElementById('mcm-' + m)?.classList.toggle('active', m === mode)
  );
  renderMonthlyChart();
}

function renderMonthlyChart() {
  const canvas = document.getElementById('monthly-chart');
  if (!canvas) return;
  const data = getMonthlyData();
  if (!data.length) return;
  if (_monthlyChart) { _monthlyChart.destroy(); _monthlyChart = null; }

  const labels         = data.map(r => r.ym);
  const capital        = data.map(r => r.cumulativeCapital);
  const divs           = data.map(r => r.divs);
  const buys           = data.map(r => r.buys);
  const sells          = data.map(r => r.sells);
  const portfolioVals  = data.map(r => r.portfolioValue);
  const hasPortVals    = portfolioVals.some(v => v != null);

  // ── ألوان السلاسل من رموز التصميم فقط ──────────────────────────────
  // ترتيب ثابت لا يتغيّر بين الأوضاع: رأس المال ذهبي · الثروة أزرق ·
  // الأرباح أخضر · المشتريات سماوي · المبيعات أحمر. نفس ترتيب دليل الرسم
  // في performance.html (.lg-cap / .lg-nw / .lg-div / .lg-buy).
  const th     = chartTheme();
  const cCap   = seriesColor(0);   // --series-1 ذهبي
  const cNW    = seriesColor(1);   // --series-2 أزرق
  const cDiv   = seriesColor(2);   // --series-3 أخضر
  const cBuy   = seriesColor(5);   // --series-6 سماوي
  const cSell  = seriesColor(4);   // --series-5 أحمر

  const axis = (color) => ({
    ticks: { color: color || th.muted, font: { family: th.font, size: 10 }, maxTicksLimit: 24 },
    grid:  { color: th.grid },
  });
  const yAxis = (color, extra = {}) => ({
    ticks: { color: color || th.muted, font: { family: th.font, size: 11 }, callback: v => fmtShortK(v) },
    grid:  { color: th.grid },
    ...extra,
  });

  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { color: th.muted, font: { family: th.font, size: 11 }, padding: 12, usePointStyle: true } },
      tooltip: { ...chartTooltipStyle(), callbacks: { label: c => ` ${c.dataset.label}: ${formatSAR(c.raw ?? c.parsed?.y ?? 0)}` } }
    },
    scales: { x: axis(), y: yAxis() }
  };

  // ① مدمج — خط رأس المال + أعمدة أرباح ومشتريات (محوران)
  if (_monthlyChartMode === 'combined') {
    _monthlyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'رأس المال المُودَع (تراكمي)', data: capital, type: 'line', backgroundColor: tint(cCap, '26'), borderColor: cCap, borderWidth: 2, tension: 0.3, fill: true, pointRadius: 2, yAxisID: 'y', order: 1 },
          ...(hasPortVals ? [{ label: 'صافي الثروة المُسجَّلة (أسهم + نقد + عقارات)', data: portfolioVals, type: 'line', backgroundColor: tint(cNW, '1a'), borderColor: cNW, borderWidth: 2, tension: 0.3, fill: false, pointRadius: 3, yAxisID: 'y', order: 0, borderDash: [5, 3], spanGaps: true }] : []),
          { label: 'أرباح موزعة شهرية', data: divs, backgroundColor: tint(cDiv, 'a6'), borderColor: cDiv, borderWidth: 1, borderRadius: 3, yAxisID: 'y2', order: 2 },
          { label: 'مشتريات شهرية',     data: buys, backgroundColor: tint(cBuy, '80'), borderColor: cBuy, borderWidth: 1, borderRadius: 3, yAxisID: 'y2', order: 3 },
        ]
      },
      options: {
        ...baseOpts,
        scales: {
          x:  axis(),
          y:  yAxis(cCap, { position: 'right' }),
          y2: { ...yAxis(cDiv, { position: 'left' }), grid: { display: false } },
        }
      }
    });
    return;
  }

  // ② خطوط — كل البيانات كخطوط تراكمية، محور واحد
  if (_monthlyChartMode === 'lines') {
    const cum = arr => arr.map((_, i) => arr.slice(0, i + 1).reduce((s, v) => s + v, 0));
    _monthlyChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'رأس المال المُودَع (تراكمي)', data: capital,   borderColor: cCap, backgroundColor: tint(cCap, '14'), borderWidth: 2.5, pointRadius: 2, tension: 0.3, fill: true },
          { label: 'أرباح موزعة (تراكمية)',       data: cum(divs), borderColor: cDiv, backgroundColor: tint(cDiv, '10'), borderWidth: 2,   pointRadius: 2, tension: 0.3, fill: true },
          { label: 'مشتريات (تراكمية)',            data: cum(buys), borderColor: cBuy, backgroundColor: 'transparent',    borderWidth: 1.5, pointRadius: 1, tension: 0.3, fill: false, borderDash: [4, 3] },
        ]
      },
      options: baseOpts
    });
    return;
  }

  // ③ مكدس — أعمدة مكدسة: مشتريات + أرباح + مبيعات لكل شهر
  if (_monthlyChartMode === 'stacked') {
    _monthlyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'مشتريات', data: buys,  backgroundColor: tint(cBuy, 'bf'),  borderColor: cBuy,  borderWidth: 1, borderRadius: 2 },
          { label: 'أرباح',   data: divs,  backgroundColor: tint(cDiv, 'bf'),  borderColor: cDiv,  borderWidth: 1, borderRadius: 2 },
          { label: 'مبيعات',  data: sells, backgroundColor: tint(cSell, 'a6'), borderColor: cSell, borderWidth: 1, borderRadius: 2 },
        ]
      },
      options: {
        ...baseOpts,
        scales: {
          x: { ...axis(), stacked: true },
          y: { ...yAxis(), stacked: true }
        }
      }
    });
    return;
  }

  // ④ أرباح فقط — تركيز كامل على الدخل الموزع شهرياً
  if (_monthlyChartMode === 'divonly') {
    const maxDiv    = Math.max(0, ...divs);
    // درجة واحدة من --series-3: الشهر الأقوى معتم، وبقية الأشهر أفتح، والصفر شبه شفاف
    const barColors = divs.map(v =>
      v <= 0            ? tint(th.muted, '1f')
      : maxDiv > 0 && v >= maxDiv * 0.8 ? tint(cDiv, 'e6')
      : tint(cDiv, '8c'));
    const cumDiv    = data.map((_, i) => divs.slice(0, i + 1).reduce((s, v) => s + v, 0));
    _monthlyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'أرباح الشهر',       data: divs,   backgroundColor: barColors, borderColor: cDiv, borderWidth: 1, borderRadius: 4, yAxisID: 'y' },
          { label: 'الأرباح التراكمية', data: cumDiv, type: 'line', borderColor: cCap, backgroundColor: tint(cCap, '1a'), borderWidth: 2, pointRadius: 2, tension: 0.4, fill: false, yAxisID: 'y2', order: 0 },
        ]
      },
      options: {
        ...baseOpts,
        scales: {
          x:  axis(),
          y:  yAxis(cDiv, { position: 'left' }),
          y2: { ...yAxis(cCap, { position: 'right' }), grid: { display: false } },
        }
      }
    });
  }
}

// ── CSV export ────────────────────────────────────────────────────────
function exportPerformanceCSV() {
  const { open, closed } = getPositionData();
  // AUDIT-FIX (2026-08): حارس القيم الفارغة (كانت تطبع undefined%) + استخدام exportCSV
  // المشتركة من utils.js بدل بناء الملف يدوياً
  const pct = x => x != null ? x.toFixed(2) + '%' : '';
  const num = (x, d = 2) => x != null ? x.toFixed(d) : '';

  const rows = [];
  rows.push(['الرمز','الاسم','الأسهم','متوسط التكلفة','السعر الحالي','تكلفة كلية','قيمة سوقية','ر/خ غير محقق','%','أرباح مستلمة','إجمالي العائد']);
  open.forEach(p => rows.push([
    p.ticker, p.name, p.remainingShares, num(p.avgCost, 4),
    num(p.currentPrice, 4), num(p.avgCost * p.remainingShares),
    num(p.marketValue), num(p.unrealizedPnL),
    pct(p.unrealizedPct), num(p.divReceived), num(p.totalReturn)
  ]));
  rows.push([]);
  rows.push(['== مراكز مغلقة ==']);
  rows.push(['الرمز','الاسم','فتح','إغلاق','أيام','تكلفة الشراء','عائد البيع','ر/خ محقق','%','أرباح','إجمالي']);
  closed.forEach(p => rows.push([
    p.ticker, p.name, p.firstBuyDate || '', p.lastSellDate || '', p.holdDays ?? '',
    num(p.buyCost), num(p.sellRevenue), num(p.realizedPnL),
    pct(p.realizedPct), num(p.divReceived), num(p.totalReturn)
  ]));

  exportCSV(`أداء_${todayISO()}.csv`, ['== مراكز مفتوحة =='], rows);
  showToast('✓ تم التصدير', 'success');
}

// ── Helpers ────────────────────────────────────────────────────────────
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
function fmtN(n)       { return n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 }); }
function fmtShortK(v)  { if (v >= 1e6) return (v/1e6).toFixed(1)+'M'; if (v >= 1e3) return (v/1e3).toFixed(0)+'K'; return v; }

// ══════════════════════════════════════════════════════════════
// 💰 تبويب: مؤشرات التوزيعات المتقدمة
// YoC · Dividend ROI · Break-Even Years · Portfolio Efficiency
// ══════════════════════════════════════════════════════════════
function renderDividendMetrics() {
  const tbody = document.getElementById('dv-tbody');
  const kpiEl = document.getElementById('dv-kpi-strip');
  if (!tbody) return;

  const { open } = getPositionData();
  if (!open.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><p>لا توجد مراكز مفتوحة</p></div></td></tr>`;
    return;
  }

  // ── بناء خريطة أرباح كل رمز (مُفصَّلة بالتواريخ لحساب الفوروارد) ──
  const divMap = {}; // ticker → [{ date, amount }]
  _divs.forEach(d => {
    if (!divMap[d.ticker]) divMap[d.ticker] = [];
    divMap[d.ticker].push({ date: d.date, amount: +d.amount });
  });

  // AUDIT-FIX (2026-07): Forward بمنهج صفحة الأرباح واللوحة الموحَّد —
  // وسيط DPS لآخر «دورية» دفعات × الدورية × الأسهم الحالية. الطريقة السابقة
  // (مجموع المستلم في آخر 12 شهراً) كانت تبخس المراكز المُضاف إليها حديثاً.
  const now = new Date();
  const _fwdBasis = {};   // ticker → { payments, freq, dpsPoints } — أساس التقدير للإعلان
  const _ftx = {};
  _tx.forEach(t => {
    if (!t.date) return;
    (_ftx[t.ticker] = _ftx[t.ticker] || []).push({ date: t.date, type: t.type, shares: +t.shares });
  });
  Object.values(_ftx).forEach(a => a.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0)));
  const _sharesAt = (tk, dateStr) => {
    let s = 0;
    for (const r of (_ftx[tk] || [])) {
      if (r.date > dateStr) break;
      if (r.type === 'sell') s -= r.shares; else s += r.shares;
    }
    return Math.max(0, s);
  };
  function forwardAnnualDiv(ticker, remainingShares) {
    const entries = (divMap[ticker] || []).filter(e => e.date && e.amount > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!entries.length) return 0;
    // الدورية من وسيط الفجوات الزمنية بين الدفعات
    let freq = 1;
    if (entries.length >= 2) {
      const gaps = [];
      for (let i = 1; i < entries.length; i++) {
        gaps.push(Math.floor((parseDateLocal(entries[i].date) - parseDateLocal(entries[i - 1].date)) / 86400000));
      }
      gaps.sort((a, b) => a - b);
      const med = gaps[Math.floor(gaps.length / 2)];
      if (med <= 105) freq = 4; else if (med <= 210) freq = 2;
    }
    // سلسلة DPS = المبلغ ÷ الأسهم وقت كل دفعة
    const dpsSeries = [];
    entries.forEach(e => {
      const sh = _sharesAt(ticker, e.date);
      if (sh >= 0.001) dpsSeries.push(e.amount / sh);
    });
    // AUDIT-FIX (2026-08): سجّل الأساس الذي بُني عليه التقدير لكل رمز حتى يُعلَن
    // في الجدول (كم دفعة، وأي دورية افتُرضت). دفعة واحدة مسجّلة ⇒ تُفترض سنوية،
    // وهو أخطر افتراض في محفظة عمرها ~سنة: يبخس سهماً ربع سنوي إلى الرُّبع.
    _fwdBasis[ticker] = { payments: entries.length, freq, dpsPoints: dpsSeries.length };
    let dps;
    if (dpsSeries.length) {
      const recent = dpsSeries.slice(-freq).sort((a, b) => a - b);
      dps = recent[Math.floor(recent.length / 2)];
    } else if (remainingShares > 0) {
      // اشترى بعد كل التوزيعات المسجّلة — تقدير من آخر سنة مسجّلة
      const lastYear = Math.max(...entries.map(e => parseDateLocal(e.date).getFullYear()));
      const lastYearTotal = entries
        .filter(e => parseDateLocal(e.date).getFullYear() === lastYear)
        .reduce((s, e) => s + e.amount, 0);
      dps = lastYearTotal > 0
        ? lastYearTotal / remainingShares / freq
        : entries[entries.length - 1].amount / remainingShares;
    } else return 0;
    return dps > 0.0001 ? dps * freq * remainingShares : 0;
  }

  // ── Portfolio Efficiency Ratio (عمولات vs أرباح) ──
  // ⚠️ البسط يشمل الربح غير المحقّق (مراكز مفتوحة) — يُعلَن في التلميح والملاحظة،
  // فهو «كل ما ولّدته المحفظة حتى الآن ÷ ما دفعته رسوماً»، لا ربحاً محقّقاً فقط.
  const totalCommissions = _tx.reduce((s, t) => s + (+t.commission || 0) + (+t.vat || 0), 0);
  const { closed } = getPositionData();
  const totalRealGains = closed.reduce((s, p) => s + (p.totalReturn || 0), 0)
                       + open.reduce((s, p) => s + (p.totalReturn || 0), 0);
  const effRatio = totalCommissions > 0 ? totalRealGains / totalCommissions : null;

  // ── KPI شريط الملخص ──
  const portfolioFwdDiv = open.reduce((s, p) => s + forwardAnnualDiv(p.ticker, p.remainingShares), 0);
  const portfolioCost   = open.reduce((s, p) => s + p.avgCost * p.remainingShares, 0);
  const portfolioYoC    = portfolioCost > 0 ? portfolioFwdDiv / portfolioCost * 100 : null;

  // AUDIT-FIX (2026-08): Current Yield — المقام كان يجمع marketValue||0 فيُسقِط
  // الأسهم بلا سعر من المقام بينما يبقى توزيعها المتوقّع في البسط ⇒ عائد متضخّم.
  // الآن البسط والمقام على نفس المجموعة (الأسهم المسعّرة فقط)، ويُعلَن المستبعَد.
  const pricedOpen      = open.filter(p => p.marketValue != null && p.marketValue > 0);
  const pricedMktVal    = pricedOpen.reduce((s, p) => s + p.marketValue, 0);
  const pricedFwdDiv    = pricedOpen.reduce((s, p) => s + forwardAnnualDiv(p.ticker, p.remainingShares), 0);
  const unpricedCount   = open.length - pricedOpen.length;
  const portfolioCurYield = pricedMktVal > 0 ? pricedFwdDiv / pricedMktVal * 100 : null;

  // AUDIT-FIX (2026-08): Div ROI — الشريط كان يقسم على تكلفة المتبقي فقط بينما
  // صفوف الجدول تقسم على buyCost (كل ما أُنفق). عند وجود بيع جزئي كان الشريط
  // يضخّم النسبة (مثال مُتحقَّق منه: 8% في الصف مقابل 16% في الشريط). وُحِّد المقام.
  const totalDivReceived = open.reduce((s, p) => s + p.divReceived, 0);
  const totalSpentOpen   = open.reduce((s, p) => s + p.buyCost, 0);
  const portfolioDivROI  = totalSpentOpen > 0 ? totalDivReceived / totalSpentOpen * 100 : null;

  // شارة نضج التوزيعات — دورة توزيع سنوية كاملة أم لا (CLAUDE.md §8: إعلان لا صمت)
  const _divDates  = _divs.filter(d => d.date).map(d => d.date).sort();
  const _divYears  = _divDates.length
    ? (parseDateLocal(_divDates[_divDates.length - 1]) - parseDateLocal(_divDates[0])) / (365.25 * 86400000)
    : 0;
  const _mDiv = assessMetricMaturity('divYield', { divCount: _divs.length, divYears: _divYears });
  const _divBadge = maturityBadge(_mDiv.level, _mDiv.reason);

  if (kpiEl) {
    const pct = v => v == null ? '—' : v.toFixed(2) + '%';
    kpiEl.innerHTML = [
      { lbl: 'YoC المحفظة', eng: 'Yield on Cost', val: pct(portfolioYoC), badge: _divBadge,
        sub: `${formatSAR(portfolioFwdDiv)} ÷ تكلفة ${formatSAR(portfolioCost)}`,
        title: 'التوزيعات السنوية المتوقعة ÷ تكلفة حيازتك الحالية' },
      { lbl: 'العائد على السوق', eng: 'Current Yield', val: pct(portfolioCurYield), badge: _divBadge,
        sub: unpricedCount > 0 ? `⚠️ ${unpricedCount} سهم بلا سعر مُستبعَد` : `على ${formatSAR(pricedMktVal)} قيمة سوقية`,
        title: 'محسوب على الأسهم المسعّرة فقط — البسط والمقام على نفس المجموعة' },
      { lbl: 'استرداد بالتوزيعات', eng: 'Div ROI', val: pct(portfolioDivROI),
        sub: `${formatSAR(totalDivReceived)} من ${formatSAR(totalSpentOpen)} أُنفقت`,
        title: 'مجموع التوزيعات المستلمة ÷ إجمالي ما أُنفق على المراكز المفتوحة (نفس مقام صفوف الجدول)' },
      { lbl: 'التوزيعات المتوقعة', eng: 'Forward 12M', val: formatSAR(portfolioFwdDiv), badge: _divBadge,
        sub: 'للسنة القادمة بمعدّل الدفع الحالي',
        title: 'وسيط DPS لآخر دورة دفعات × الدورية × الأسهم الحالية' },
      { lbl: 'كفاءة رأس المال', eng: 'Return / Fees', val: effRatio != null ? effRatio.toFixed(1) + '×' : '—',
        sub: `مقابل ${formatSAR(totalCommissions)} عمولة وضريبة`,
        title: 'إجمالي العائد (يشمل غير المحقّق) ÷ إجمالي العمولات والضريبة' },
    ].map(k => `<div class="stat-card" title="${esc(k.title)}">
      <div class="label">${k.lbl} <span class="eng-label">${k.eng}</span></div>
      <div class="value num">${k.val}${k.badge || ''}</div>
      <div class="sub">${k.sub}</div>
    </div>`).join('');
  }

  // ── ملاحظات المنهجية (تحت الشريط) — إعلان صريح لحدود الأرقام ──
  const noteEl = document.getElementById('dv-notes');
  if (noteEl) {
    noteEl.innerHTML = [
      _mDiv.level !== 'reliable'
        ? noteHtml('🌱', `<b>لم تكتمل دورة توزيع سنوية كاملة بعد</b> (${_divs.length} توزيعة على مدى ${_divYears.toFixed(1)} سنة). كل أرقام «المتوقّع» و YoC و«سنوات الاسترداد» مبنية على استقراء دفعات جزئية — تُقرأ كاتجاه لا كرقم نهائي.`, 'warn')
        : '',
      unpricedCount > 0
        ? noteHtml('⚪', `<b>${unpricedCount}</b> سهم بلا سعر حالي — مُستبعَد من «العائد على السوق» ومن القيمة السوقية، ويظهر «—» في عموده. لم يُقدَّر سعره بصمت.`, '')
        : '',
      noteHtml('📐', `<b>سنوات الاسترداد</b> = تكلفة حيازتك الحالية ÷ التوزيع السنوي المتوقّع، <b>بلا افتراض نمو</b> و<b>بلا خصم</b> ما استلمته سابقاً (ذلك يظهر في عمود «استرداد بالتوزيعات»). و<b>كفاءة رأس المال</b> بسطها يشمل الربح غير المحقّق، فهو ليس ربحاً في اليد.`, ''),
    ].filter(Boolean).join('');
  }

  // ── إعلان أساس تقدير «التوزيعات المتوقعة» لكل رمز ──
  // دورية مُفترَضة من دفعة أو دفعتين ليست معلومة — تُوسَم 🌱 ويُشرح الأساس.
  const FREQ_AR = { 1: 'سنوية', 2: 'نصف سنوية', 4: 'ربع سنوية' };
  const fwdWeak = tk => {
    const b = _fwdBasis[tk];
    return !!b && b.payments < 3;   // أقل من 3 دفعات ⇒ الدورية استنتاج هشّ
  };
  const fwdBasisTxt = tk => {
    const b = _fwdBasis[tk];
    if (!b) return 'لا توزيعات مسجّلة لهذا الرمز — لا يمكن تقدير توزيع متوقّع.';
    return `مبني على ${b.payments} دفعة مسجّلة، بدورية مُفترَضة ${FREQ_AR[b.freq] || b.freq + '×'}` +
      (b.payments < 3
        ? '. ⚠️ بدفعة أو دفعتين فقط تُستنتَج الدورية من فجوة واحدة — لو كان السهم يوزّع ربع سنوياً وسُجّلت دفعة واحدة، فالتقدير يبخسه إلى الرُّبع. سجّل بقية الدفعات ليستقرّ الرقم.'
        : '.');
  };

  // ── جدول التفاصيل لكل سهم ──
  const rows = open.map(p => {
    const costBasis     = p.avgCost * p.remainingShares;
    const fwdAnnDiv     = forwardAnnualDiv(p.ticker, p.remainingShares);
    const yoc           = costBasis > 0 && fwdAnnDiv > 0 ? fwdAnnDiv / costBasis * 100 : null;
    const curYield      = p.marketValue && p.marketValue > 0 && fwdAnnDiv > 0 ? fwdAnnDiv / p.marketValue * 100 : null;
    // Div ROI = مجموع التوزيعات المستلمة ÷ إجمالي ما أُنفق على هذا الرمز (شراء − مبيعات)
    const totalSpent    = p.buyCost; // تكلفة الشراء الأصلية الكلية
    const divROI        = totalSpent > 0 ? p.divReceived / totalSpent * 100 : null;
    // Break-Even = تكلفة الحيازة الحالية ÷ التوزيع السنوي المتوقع
    const breakEvenYrs  = fwdAnnDiv > 0 && costBasis > 0 ? costBasis / fwdAnnDiv : null;

    const yocCls   = yoc == null ? 'text-muted' : yoc >= 8 ? 'text-success' : yoc >= 4 ? '' : 'text-danger';
    const divROICls = divROI == null ? 'text-muted' : divROI >= 50 ? 'text-success' : divROI >= 20 ? '' : 'text-muted';
    const beCls    = breakEvenYrs == null ? 'text-muted' : breakEvenYrs <= 10 ? 'text-success' : breakEvenYrs <= 18 ? '' : 'text-danger';

    return `<tr>
      <td><strong class="text-accent">${esc(p.ticker)}</strong></td>
      <td>${esc(p.name)}</td>
      <td class="num bold ${yocCls}" title="التوزيع السنوي ${formatSAR(fwdAnnDiv)} ÷ تكلفة ${formatSAR(costBasis)}">${yoc != null ? yoc.toFixed(2) + '%' : '—'}</td>
      <td class="num ${curYield != null ? '' : 'text-muted'}">${curYield != null ? curYield.toFixed(2) + '%' : '—'}</td>
      <td class="num ${divROICls}" title="استردّ ${formatSAR(p.divReceived)} من ${formatSAR(totalSpent)}">${divROI != null ? divROI.toFixed(2) + '%' : '—'}</td>
      <td class="num ${beCls}" title="عند ${formatSAR(fwdAnnDiv)} / سنة، بلا نمو وبلا خصم ما استلمته سابقاً">${breakEvenYrs != null ? breakEvenYrs.toFixed(1) + ' سنة' : '—'}</td>
      <td class="num text-success" title="${esc(fwdBasisTxt(p.ticker))}">${fwdAnnDiv > 0 ? formatSAR(fwdAnnDiv) : '—'}${fwdWeak(p.ticker) ? ' ' + maturityBadge('early', fwdBasisTxt(p.ticker)) : ''}</td>
      <td class="num text-success">${p.divReceived > 0 ? formatSAR(p.divReceived) : '—'}</td>
      <td class="num text-muted">${formatSAR(costBasis)}</td>
    </tr>`;
  }).join('');

  tbody.innerHTML = rows || `<tr><td colspan="9" class="text-muted small text-center">لا توجد بيانات كافية للحساب</td></tr>`;

  makeTableSortable('dv-tbody');
}

// ══════════════════════════════════════════════════════════════
// 🧠 تبويب: تحليل السلوك الاستثماري — Behavioral Audit
// Win Rate · Hold Days (Winners vs Losers) · Profit Factor
// Monthly Trade Frequency · Best/Worst Trades
// ══════════════════════════════════════════════════════════════
function renderBehavioralAudit() {
  const el = document.getElementById('behavioral-body');
  if (!el) return;

  const { closed } = getPositionData();
  if (closed.length < 2) {
    el.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p>تحتاج 2 صفقة مغلقة على الأقل للتحليل السلوكي</p></div>`;
    return;
  }

  const n = closed.length;

  // ── حسابات السلوك ──
  const winners = closed.filter(p => p.totalReturn > 0);
  const losers  = closed.filter(p => p.totalReturn <= 0);

  const winRate     = n > 0 ? winners.length / n * 100 : 0;
  const totalGains  = winners.reduce((s, p) => s + p.totalReturn, 0);
  const totalLosses = Math.abs(losers.reduce((s, p) => s + p.totalReturn, 0));
  // AUDIT-FIX (2026-08): تعادل تام (لا ربح ولا خسارة) كان يُنتج 0 فتظهر رسالة
  // «خسائرك أكبر من أرباحك» وهي خاطئة. الآن null ⇒ «غير قابل للحساب».
  const profitFactor = totalLosses > 0 ? totalGains / totalLosses
                     : totalGains  > 0 ? Infinity
                     : null;

  // AUDIT-FIX (2026-08): مدّة الاحتفاظ — الصفقات بلا holdDays (تاريخ فتح أو إغلاق
  // ناقص) كانت تُحسب 0 يوم فتسحب المتوسط للأسفل بصمت. الآن تُستبعد من المقام
  // ويُعلَن عددها صراحةً (دستور CLAUDE.md §8: ممنوع تقدير بيانات ناقصة بصمت).
  const _avgHold = arr => {
    const known = arr.filter(p => p.holdDays != null);
    return { avg: known.length ? known.reduce((s, p) => s + p.holdDays, 0) / known.length : null, nKnown: known.length, nTotal: arr.length };
  };
  const hW = _avgHold(winners);
  const hL = _avgHold(losers);
  const avgHoldWinners = hW.avg;   // null = لا بيانات مدّة
  const avgHoldLosers  = hL.avg;
  const missingHoldDays = (hW.nTotal - hW.nKnown) + (hL.nTotal - hL.nKnown);

  // متوسط الربح في الصفقة الرابحة vs متوسط الخسارة
  const avgWin  = winners.length > 0 ? totalGains / winners.length : null;
  const avgLoss = losers.length  > 0 ? totalLosses / losers.length  : null;
  const riskReward = (avgWin != null && avgLoss > 0) ? avgWin / avgLoss : null;

  // عدد الصفقات شهرياً
  // AUDIT-FIX (2026-08): أسهم المنحة (grant) دخول فعلي للمحفظة — استبعادها من
  // «أول تاريخ» كان يقصّر عمر النشاط فيضخّم «صفقة/شهر».
  const firstActDate = _tx.filter(t => (t.type === 'buy' || t.type === 'grant') && t.date).map(t => t.date).sort()[0];
  const monthsActive = firstActDate
    ? Math.max(1, (new Date() - parseDateLocal(firstActDate)) / (30.44 * 86400000))
    : 1;
  const buyCount  = _tx.filter(t => t.type === 'buy' || t.type === 'grant').length;
  const sellCount = _tx.filter(t => t.type === 'sell').length;
  const tradesPerMonth = (buyCount + sellCount) / monthsActive;

  // ══════════════════════════════════════════════════════════════
  // حدّ العيّنة — إعلان صريح لا استنتاج صامت
  // ──────────────────────────────────────────────────────────────
  // كل مقاييس هذا التبويب مشتقّة من n = عدد الصفقات المغلقة فقط. لمحفظة
  // عمرها ~سنة يكون n صغيراً جداً، فأي «نمط سلوكي» قد يكون ضجيجاً محضاً.
  // نعلن ذلك عددياً بفاصل ثقة Wilson 95% لمعدّل الربح: نصف عرض الفاصل هو
  // مقدار الجهل الحقيقي. مثال: n=4 و p=75% ⇒ الفاصل ≈ [30%, 95%] — أي أن
  // «معدل ربح ممتاز» و«معدل ربح ضعيف» كلاهما متّسق مع نفس البيانات.
  // العتبات: <8 لا تشخيص · <20 تشخيص أوّلي · ≥20 مقبول (وتبقى إحصاءً لا يقيناً)
  // ══════════════════════════════════════════════════════════════
  const BEHAV_MIN_DIAG = 8;    // أقل عيّنة تسمح بإطلاق جملة تشخيصية
  const BEHAV_OK_N     = 20;   // العيّنة التي يصبح عندها التشخيص مقبولاً
  function wilson95(k, total) {
    if (!total) return null;
    const z = 1.959964, p = k / total;
    const d = 1 + z * z / total;
    const c = (p + z * z / (2 * total)) / d;
    const h = (z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / d;
    return { lo: Math.max(0, (c - h) * 100), hi: Math.min(100, (c + h) * 100) };
  }
  const wr    = wilson95(winners.length, n);
  const wrTxt = wr ? `${wr.lo.toFixed(0)}% – ${wr.hi.toFixed(0)}%` : '—';
  const sampleLevel = n < BEHAV_MIN_DIAG ? 'bad' : n < BEHAV_OK_N ? 'warn' : 'good';
  const sampleIcon  = n < BEHAV_MIN_DIAG ? '⛔' : n < BEHAV_OK_N ? '🌱' : '✅';
  const sampleLabel = n < BEHAV_MIN_DIAG ? 'عيّنة أصغر من أن تُستخرج منها أنماط'
                    : n < BEHAV_OK_N     ? 'عيّنة صغيرة — تشخيص أوّلي'
                    :                      'عيّنة كافية للتشخيص';
  const canDiagnose = n >= BEHAV_MIN_DIAG;
  // عدد السنوات التقويمية المغطّاة — لتقييد أي ادّعاء موسمي
  const yearsCovered = new Set(
    _tx.filter(t => t.date && (t.type === 'buy' || t.type === 'sell' || t.type === 'grant'))
       .map(t => t.date.slice(0, 4))
  ).size;

  // توزيع الصفقات على أشهر السنة
  const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const monthDist = Array(12).fill(0);
  _tx.filter(t => t.date && (t.type === 'buy' || t.type === 'sell' || t.type === 'grant')).forEach(t => {
    const d = parseDateLocal(t.date);
    if (d) monthDist[d.getMonth()]++;
  });
  const maxMonth = Math.max(...monthDist);

  // أفضل وأسوأ 3 صفقات — AUDIT-FIX (2026-08): عند أقل من 6 صفقات مغلقة تتداخل
  // القائمتان (نفس الصفقة في «الأفضل» و«الأسوأ») — لا تُعرضان حينها
  const showTopBottom  = n >= 6;
  const sortedByReturn = [...closed].sort((a, b) => b.totalReturn - a.totalReturn);
  const top3    = sortedByReturn.slice(0, 3);
  const bottom3 = sortedByReturn.slice(-3).reverse();
  const maxAbsRet = Math.max(1, ...closed.map(p => Math.abs(p.totalReturn || 0)));

  // ── التشخيص السلوكي ──
  // كل جملة تشخيصية تُطلق فقط عند n ≥ BEHAV_MIN_DIAG؛ دونها تُعرض الأرقام
  // بلا حُكم. state ∈ good/warn/bad ⇒ data-state على .note (اللون مع أيقونة ونص).
  // AUDIT-FIX (2026-08): حارس القسمة على صفر + التعامل مع null (مدّة غير معلومة)
  let holdBias;
  if (avgHoldWinners > 0 && avgHoldLosers > 0 && avgHoldLosers > avgHoldWinners * 1.3) {
    holdBias = { icon: '⚠️', state: 'bad', text: `تُمسك بخاسريك ${(avgHoldLosers / avgHoldWinners).toFixed(1)}× أطول من رابحيك — نمط Loss Aversion. الخاسرون يستهلكون وقتاً أكثر مما يستحقون.` };
  } else if (avgHoldWinners > 0 && avgHoldLosers > 0 && avgHoldWinners > avgHoldLosers * 1.3) {
    holdBias = { icon: '✅', state: 'good', text: 'تُمسك برابحيك أطول من خاسريك — النمط الصحيح «دع أرباحك تجري».' };
  } else if (avgHoldWinners == null || avgHoldLosers == null) {
    holdBias = { icon: '⚪', state: '', text: 'نسبة مدة الاحتفاظ غير قابلة للحساب — أحد الجانبين (رابح/خاسر) بلا صفقات أو بلا تواريخ مكتملة.' };
  } else {
    holdBias = { icon: '🟡', state: '', text: 'مدة الاحتفاظ بالرابحين والخاسرين متقاربة — لا انحياز واضح في هذه العيّنة.' };
  }

  const winRateDiag = winRate >= 60
    ? { icon: '✅', state: 'good', text: `معدل الربح ${winRate.toFixed(0)}% — أكثر من نصف صفقاتك تنتهي بربح. (فاصل ثقة 95%: ${wrTxt})` }
    : winRate >= 40
    ? { icon: '🟡', state: '',     text: `معدل الربح ${winRate.toFixed(0)}% — مقبول إذا كانت أرباحك أكبر من خسائرك. (فاصل ثقة 95%: ${wrTxt})` }
    : { icon: '⚠️', state: 'warn', text: `معدل الربح ${winRate.toFixed(0)}% — أكثر من نصف صفقاتك تنتهي بخسارة. (فاصل ثقة 95%: ${wrTxt})` };

  const pfDiag = profitFactor == null
    ? { icon: '⚪', state: '', text: 'Profit Factor غير قابل للحساب — لا أرباح ولا خسائر محقّقة في العيّنة.' }
    : profitFactor === Infinity
    ? { icon: '✅', state: 'good', text: 'لا خسائر محقّقة حتى الآن — Profit Factor بلا مقام.' }
    : profitFactor >= 2
    ? { icon: '✅', state: 'good', text: `Profit Factor ${profitFactor.toFixed(2)} — كل ريال خسرته تعوّضه بـ ${profitFactor.toFixed(1)} ريال ربح.` }
    : profitFactor >= 1
    ? { icon: '🟡', state: '',     text: `Profit Factor ${profitFactor.toFixed(2)} — الأرباح تفوق الخسائر لكن الهامش ضيّق.` }
    : { icon: '⚠️', state: 'bad',  text: `Profit Factor ${profitFactor.toFixed(2)} — خسائرك أكبر من أرباحك إجمالاً.` };

  const tradingFreqDiag = tradesPerMonth > 8
    ? { icon: '⚠️', state: 'bad',  text: `${tradesPerMonth.toFixed(1)} صفقة/شهر — مرتفع. كل صفقة إضافية تُكلّف عمولة وتُعرّضك لقرار متسرّع.` }
    : tradesPerMonth > 4
    ? { icon: '🟡', state: 'warn', text: `${tradesPerMonth.toFixed(1)} صفقة/شهر — متوسط. راقب أن لكل صفقة مبرراً واضحاً.` }
    : { icon: '✅', state: 'good', text: `${tradesPerMonth.toFixed(1)} صفقة/شهر — منضبط. نمط المستثمر لا المضارب.` };

  // AUDIT-FIX (2026-08): «—» عند غياب البيانات بدل «0 يوم» الموهم بأن المدّة صفر
  const fmtDays = d => d == null ? '—'
    : d >= 365 ? `${(d / 365).toFixed(1)} سنة`
    : d >= 30  ? `${Math.round(d / 30)} شهر`
    : `${Math.round(d)} يوم`;

  // ── بناء HTML ──
  // البساطة: رقم بطل واحد (حجم العيّنة) يقود التبويب، لأن كل ما تحته مشروط به.
  // ثم التشخيصات، ثم الأرقام، ثم التفاصيل خلف <details>.
  const pctTxt = v => v != null ? v.toFixed(1) + '%' : '—';
  const tradeRow = (p, state) => browHtml({
    name: esc(p.ticker),
    color: stateColorOf(state),
    pct: Math.abs(p.totalReturn || 0) / maxAbsRet * 100,
    valueTxt: formatSAR(p.totalReturn, true),
    diffTxt: pctTxt(p.totalReturnPct),
    diffState: state,
    sub: fmtDays(p.holdDays),
    title: `${esc(p.name)} — مدّة الاحتفاظ ${fmtDays(p.holdDays)}`,
  });

  const diagnosticsHtml = [holdBias, winRateDiag, pfDiag, tradingFreqDiag]
    .map(d => noteHtml(d.icon, d.text, canDiagnose ? d.state : '')).join('');

  el.innerHTML = `
    <div class="stack-4">

      <!-- ① الرقم البطل: حجم العيّنة — كل ما تحته مشروط به -->
      <div class="perf-hero">
        ${heroHtml(`${n} <span class="unit">صفقة مغلقة</span>`,
          `هذه هي كل عيّنتك. معدّل الربح ${winRate.toFixed(0)}% — لكن فاصل الثقة 95% يمتد من <b>${wrTxt}</b>.`)}
        <div>${tagHtml(sampleIcon, sampleLabel, sampleLevel)}</div>
      </div>

      ${n < BEHAV_OK_N ? noteHtml('📏', `
        <b>حدّ العيّنة معلَن صراحةً.</b> بـ${n} صفقة مغلقة، معدّل ربحك الحقيقي يقع في أي مكان بين
        <b class="num">${wrTxt}</b> — أي أن «ممتاز» و«ضعيف» كلاهما متّسق مع نفس بياناتك.
        تحتاج ≈ <b>${BEHAV_OK_N}</b> صفقة مغلقة ليضيق الفاصل بما يكفي لاستخراج نمط.
        ${!canDiagnose ? ` لذلك <b>حُجبت الجُمل التشخيصية</b> (تحتاج ${BEHAV_MIN_DIAG} صفقة على الأقل) — الأرقام معروضة كما هي بلا حُكم.` : ''}
        ${missingHoldDays > 0 ? `<br>⚪ ${missingHoldDays} صفقة بلا تاريخ فتح/إغلاق مكتمل — مُستبعَدة من متوسطات المدّة (لا تُحتسب صفراً).` : ''}
      `, n < BEHAV_MIN_DIAG ? 'bad' : 'warn') : ''}

      <!-- ② التشخيصات -->
      ${canDiagnose
        ? `<div class="stack-2">${diagnosticsHtml}</div>`
        : detailsHtml(`🔍 التشخيصات الأولية — غير موثوقة عند ${n} صفقة`, `<div class="stack-2">${diagnosticsHtml}</div>`)}

      <!-- ③ الأرقام الخام -->
      <div class="stats-grid">
        <div class="stat-card" title="عدد الصفقات الرابحة ÷ إجمالي الصفقات المغلقة">
          <div class="label">معدل الربح <span class="eng-label">Win Rate</span></div>
          <div class="value num">${winRate.toFixed(1)}%</div>
          <div class="sub">${winners.length}/${n} · ثقة 95%: ${wrTxt}</div>
        </div>
        <div class="stat-card" title="مجموع عوائد الصفقات الرابحة ÷ مجموع خسائر الخاسرة (العائد يشمل التوزيعات)">
          <div class="label">Profit Factor</div>
          <div class="value num">${profitFactor == null ? '—' : profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}</div>
          <div class="sub">ربح ÷ خسارة</div>
        </div>
        <div class="stat-card" title="متوسط أيام الاحتفاظ بالصفقات الرابحة — الصفقات بلا تواريخ مكتملة مُستبعَدة">
          <div class="label">مدة الرابحين</div>
          <div class="value num">${fmtDays(avgHoldWinners)}</div>
          <div class="sub">من ${hW.nKnown}/${hW.nTotal} صفقة</div>
        </div>
        <div class="stat-card" title="متوسط أيام الاحتفاظ بالصفقات الخاسرة — الصفقات بلا تواريخ مكتملة مُستبعَدة">
          <div class="label">مدة الخاسرين</div>
          <div class="value num">${fmtDays(avgHoldLosers)}</div>
          <div class="sub">من ${hL.nKnown}/${hL.nTotal} صفقة</div>
        </div>
        <div class="stat-card" title="متوسط الربح في صفقة رابحة ÷ متوسط الخسارة في صفقة خاسرة">
          <div class="label">Risk/Reward</div>
          <div class="value num">${riskReward != null ? riskReward.toFixed(2) + '×' : '—'}</div>
          <div class="sub">${avgWin != null ? formatSAR(avgWin) : '—'} مقابل ${avgLoss != null ? formatSAR(avgLoss) : '—'}</div>
        </div>
        <div class="stat-card" title="إجمالي عمليات الشراء والمنحة والبيع ÷ عدد أشهر النشاط">
          <div class="label">وتيرة التداول</div>
          <div class="value num">${tradesPerMonth.toFixed(1)}</div>
          <div class="sub">صفقة/شهر على ${Math.round(monthsActive)} شهر</div>
        </div>
      </div>

      <!-- ④ التفاصيل خلف طيّات -->
      ${detailsHtml(`📅 توزيع نشاطك على شهور السنة${yearsCovered < 3 ? ` — ${yearsCovered} سنة فقط` : ''}`, `
        <div class="stack-2">
          ${yearsCovered < 3 ? noteHtml('📏', `نشاطك يغطّي <b>${yearsCovered}</b> سنة تقويمية فقط. أي «موسمية» هنا مبنية على ملاحظة واحدة لكل شهر تقريباً — تُقرأ كسجل نشاط، <b>لا كنمط موسمي</b>.`, 'warn') : ''}
          <div>${monthDist.map((cnt, i) => browHtml({
            name: MONTHS_AR[i],
            color: cnt === maxMonth && maxMonth > 0 ? cssVar('--accent') : seriesColor(1),
            pct: maxMonth > 0 ? cnt / maxMonth * 100 : 0,
            valueTxt: String(cnt),
            title: `${MONTHS_AR[i]}: ${cnt} صفقة عبر ${yearsCovered} سنة`,
          })).join('')}</div>
        </div>`)}

      ${showTopBottom
        ? detailsHtml('🏆 أفضل وأسوأ الصفقات', `
            <div class="stack-2">
              <div class="small text-muted">🏆 الأفضل</div>
              <div>${top3.map(p => tradeRow(p, 'good')).join('')}</div>
              <div class="small text-muted">📉 الأسوأ</div>
              <div>${bottom3.map(p => tradeRow(p, 'bad')).join('')}</div>
            </div>`)
        : noteHtml('📌', `قائمة أفضل/أسوأ 3 صفقات تظهر عند <b>6</b> صفقات مغلقة على الأقل (لديك ${n}) — دون ذلك تتداخل القائمتان فتُعرَض نفس الصفقة في الجانبين.`)}

    </div>`;
}

// ══════════════════════════════════════════════════════════════
// 📊 مقارنة بالمؤشر (TASI Benchmark)
// مقارنة أداء محفظتك منسوباً بأداء مؤشر تاسي — كلاهما = 100 عند أول نقطة
// البيانات: TASI مُدخلة يدوياً ← localStorage 'tharwa-benchmark_v1'
//           المحفظة ← net_worth_snapshots (auto-captured من الداشبورد)
// ══════════════════════════════════════════════════════════════

const BM_KEY = 'tharwa-benchmark_v1';
let _bmChart = null;

// AUDIT-FIX (2026-08): مفاتيح تاسي مخصوصة بالمستخدم (userLsKey) كبقية المفاتيح —
// المفتاح القديم غير المخصوص يُقرأ مرة واحدة للترحيل ثم يُحذف.
function _bmMigrateLegacyKey(key) {
  try {
    const scoped = userLsKey(key);
    if (scoped === key) return; // لا مستخدم بعد — لا ترحيل
    if (localStorage.getItem(scoped) == null) {
      const legacy = localStorage.getItem(key);
      if (legacy != null) localStorage.setItem(scoped, legacy);
    }
    localStorage.removeItem(key);
  } catch (_) {}
}

// ══════════════════════════════════════════════════════════════
// مصدر كل نقطة تاسي — src ∈ 'manual' | 'auto' | 'seed'
// ──────────────────────────────────────────────────────────────
// 'manual' : أدخلها المالك بيده (أو استوردها من CSV) — لا تُداس أبداً بالجلب
//            التلقائي. نفس فلسفة السعر اليدوي ✋ في لوحة التحكم: ما كتبه
//            المالك عمداً يصونه النظام حتى يفكّه بنفسه.
// 'auto'   : جاءت من الدالة السحابية — قابلة للتحديث والاستبدال بحرية.
// 'seed'   : بيانات TASI_SEED المضمّنة — ليست إدخالاً بشرياً، فتُعامَل معاملة
//            'auto' وتُستبدَل بالبيانات المجلوبة الأدقّ.
// توافق رجعي: نقطة قديمة بلا حقل src تُعامَل 'manual' (الافتراض الأكثر صوناً)،
// إلا إذا طابقت TASI_SEED تاريخاً وقيمةً بالضبط ⇒ تُرقَّى إلى 'seed' في الترحيل.
// ══════════════════════════════════════════════════════════════
const BM_SRC_META = {
  manual: { icon: '✋', label: 'يدوي',  state: '' },
  auto:   { icon: '🔄', label: 'تلقائي', state: 'good' },
  seed:   { icon: '🌱', label: 'مضمّن', state: '' },
};
function _bmSrcOf(e) {
  const s = e && e.src;
  return (s === 'auto' || s === 'seed') ? s : 'manual';
}
// نقطة صالحة؟ تاريخ ISO + قيمة موجبة منتهية
function _bmValid(e) {
  return !!e && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)) && isFinite(+e.value) && +e.value > 0;
}
function _bmNormalize(arr) {
  return (Array.isArray(arr) ? arr : [])
    .filter(_bmValid)
    .map(e => ({ date: e.date, value: +e.value, src: _bmSrcOf(e) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── تحميل وحفظ بيانات التاسي ─────────────────────────────────
// S-4: localStorage is the read cache; Supabase user_settings is the durable store.
// _saveBenchmark writes both; _loadBenchmark reads from localStorage (fast path).
function _loadBenchmark() {
  try { return _bmNormalize(JSON.parse(localStorage.getItem(userLsKey(BM_KEY)))); } catch { return []; }
}
function _saveBenchmark(entries) {
  const clean = _bmNormalize(entries);
  localStorage.setItem(userLsKey(BM_KEY), JSON.stringify(clean));
  // async Supabase sync — fire-and-forget, localStorage remains the read source
  // (مفتاح user_settings يبقى غير مخصوص — الجدول مقيّد بـ user_id أصلاً)
  saveUserSetting(BM_KEY, clean).catch(() => {});
}

// على أول فتح للتبويب: اجلب من Supabase وحدّث localStorage إن كانت هناك بيانات أحدث
async function _syncBenchmarkFromSupabase() {
  try {
    const remote = _bmNormalize(await loadUserSetting(BM_KEY));
    if (!remote.length) return;
    const local = _loadBenchmark();
    // الدمج بالتاريخ. عند تعارض نفس اليوم: السحابة تفوز (المصدر الدائم) —
    // إلا أن تكون النسخة المحلية يدوية والسحابية غير يدوية، فالمُدخَل بشرياً
    // لا يُداس بنقطة آلية (نفس أسبقية اليدوي في الجلب التلقائي).
    // AUDIT-FIX (2026-08): الدمج كان يُسقِط حقل src فيُحوِّل كل النقاط إلى يدوية
    // عند أول مزامنة، مما يشلّ الجلب التلقائي لاحقاً. الآن يُحفَظ المصدر.
    const map = {};
    local.forEach(e  => { map[e.date] = e; });
    remote.forEach(e => {
      const cur = map[e.date];
      if (cur && _bmSrcOf(cur) === 'manual' && _bmSrcOf(e) !== 'manual') return;
      map[e.date] = e;
    });
    const merged = _bmNormalize(Object.values(map));
    localStorage.setItem(userLsKey(BM_KEY), JSON.stringify(merged));
  } catch (_) {}
}

// ── إضافة نقطة جديدة (يدوياً — تبقى تعمل كما هي ولا تُحذف) ────
function addBenchmarkEntry() {
  const date  = document.getElementById('bm-date')?.value?.trim();
  const value = parseFloat(document.getElementById('bm-value')?.value);

  if (!date)          { showToast('أدخل التاريخ', 'error'); return; }
  if (isNaN(value) || value <= 0) { showToast('أدخل قيمة صحيحة لمؤشر تاسي', 'error'); return; }

  const entries = _loadBenchmark();
  const existing = entries.findIndex(e => e.date === date);
  if (existing >= 0) {
    // تحديث القيمة الموجودة لنفس التاريخ — وترقيتها إلى «يدوي» فتُصان من الجلب
    const was = _bmSrcOf(entries[existing]);
    entries[existing] = { date, value, src: 'manual' };
    showToast(was === 'manual' ? '✋ تم تحديث القيمة اليدوية' : '✋ تم تثبيت القيمة يدوياً — لن يدوسها الجلب التلقائي', 'success');
  } else {
    entries.push({ date, value, src: 'manual' });
    showToast('✋ تمت الإضافة كنقطة يدوية محميّة', 'success');
  }
  _saveBenchmark(entries);

  if (document.getElementById('bm-date'))  document.getElementById('bm-date').value  = '';
  if (document.getElementById('bm-value')) document.getElementById('bm-value').value = '';

  renderBenchmarkTab();
}

// ── فكّ حماية نقطة يدوية: تصبح 'auto' فيجوز للجلب تحديثها ─────
// نفس منطق زر ✋ في لوحة التحكم: المالك يُرجِع النقطة للتحديث الآلي بنقرة.
function unlockBenchmarkEntry(date) {
  const entries = _loadBenchmark();
  const i = entries.findIndex(e => e.date === date);
  if (i < 0) return;
  entries[i] = { ...entries[i], src: 'auto' };
  _saveBenchmark(entries);
  showToast('🔄 أُعيدت النقطة للتحديث التلقائي', 'success');
  renderBenchmarkTab();
}

// ── حذف نقطة ─────────────────────────────────────────────────
function deleteBenchmarkEntry(date) {
  const entries = _loadBenchmark().filter(e => e.date !== date);
  _saveBenchmark(entries);
  renderBenchmarkTab();
}

// ── حذف الكل ─────────────────────────────────────────────────
async function clearAllBenchmark() {
  // S-3: replace confirm() with confirmAsync() — consistent with the rest of the codebase
  if (!await confirmAsync('حذف جميع بيانات تاسي المدخلة؟')) return;
  _saveBenchmark([]);
  renderBenchmarkTab();
  showToast('تم المسح', 'success');
}

// ── Time-Weighted Return (TWR) ────────────────────────────────
// يحسب العائد المُعدَّل بالزمن بمعزل عن الإيداعات والسحوبات
// المعيار الدولي (GIPS) لمقارنة أداء المحافظ ببعضها أو بمؤشر
// الخوارزمية: Modified Dietz لكل فترة بين لقطتين → تجميع مضروب
// يُبقي آخر لقطة فقط لكل يوم — يُزيل تكرارات نفس اليوم التي تُشوّه TWR

// AUDIT-FIX (2026-08): التمييز الموحّد — اللقطات التلقائية notes تبدأ بـ 'auto'
function isAutoSnapshot(notes) { return (notes || '').startsWith('auto'); }

// AUDIT-FIX (2026-08): اللقطات التلقائية أساسها أسهم+نقد+عقار، واليدوية صافي ثروة كامل —
// خلطهما في سلسلة واحدة يسمّم TWR وشارب وسورتينو والتراجع وألفا. نستخدم التلقائية فقط
// إذا كان عددها ≥ نقطتين، وإلا نستخدم الكل مع تحذير ظاهر بأن الدقة محدودة.
let _mixedBasisWarned = false;
function _selectConsistentSnapshots(snapshots) {
  const autos   = snapshots.filter(s => isAutoSnapshot(s.notes));
  const isMixed = autos.length > 0 && autos.length < snapshots.length;
  if (!isMixed) return snapshots;        // أساس واحد أصلاً — لا مشكلة
  if (autos.length >= 2) return autos;   // سلسلة تلقائية متجانسة كافية
  if (!_mixedBasisWarned) {
    _mixedBasisWarned = true;
    showToast('⚠️ سلسلة اللقطات مختلطة الأساس (تلقائية + يدوية) — الدقة محدودة في TWR ومقاييس المخاطر', 'error');
  }
  return snapshots;
}

function _deduplicateSnapsByDay(snapshots) {
  const byDate = {};
  for (const s of snapshots) {
    // نفضّل اللقطات اليدوية على التلقائية عند التعادل
    const existing = byDate[s.date];
    if (!existing) { byDate[s.date] = s; continue; }
    const isManual    = !!s.notes        && !isAutoSnapshot(s.notes);
    const wasManual   = !!existing.notes && !isAutoSnapshot(existing.notes);
    if (isManual && !wasManual) { byDate[s.date] = s; continue; }
    if (!wasManual && !isManual) byDate[s.date] = s; // keep latest
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

// AUDIT-FIX (2026-08): تحذير (مرة واحدة) بعدد فترات TWR المُسقطة لمقام ≤ 0
let _twrDropWarned = false;

// ══════════════════════════════════════════════════════════════════════
// ↕️ فرز الجداول بالنقر على الترويسة — تعميم على كل تبويبات الصفحة
// ----------------------------------------------------------------------
// الصفحة فيها ستة جداول تُبنى بدوال مختلفة، وبعض أعمدتها **محسوبة داخل حلقة
// الرسم** ولا وجود لها في أي مصفوفة (YoC، العائد الحالي، سنوات الاسترداد…).
// لذلك يفرز هذا المحرّك **صفوف الجدول المرسومة** لا مصفوفة المصدر: فيغطّي كل
// عمود معروض بلا إعادة هيكلة بيانات كل تبويب، ويبقى صحيحاً بعد أي إعادة رسم.
//
// قواعد مقصودة:
//  • الأرقام تُستخرج من نص الخلية بعد تجريد «ر.س» و«%» والفواصل والإشارة −
//    (U+2212 التي يستخدمها التنسيق العربي)، فيفرز «1,234.50 ر.س» عددياً لا نصياً.
//  • «—» و«غير متوفر» تُعامَل فارغة و**تهبط دائماً إلى الأسفل** في الاتجاهين،
//    فلا تتصدّر القائمة صفوف بلا بيانات.
//  • النصّ العربي يُقارَن بـ localeCompare (الترتيب الأبجدي الصحيح).
//  • <tfoot> لا يُمَسّ (صفوف الإجماليات)، وصفّ الحالة الفارغة (colspan) يُترك.
//  • عمود يُوسَم data-nosort لا يقبل الفرز — يُستخدم لأعمدة تعتمد على ترتيب
//    الصفوف نفسه (مثل «التغيّر» في جدول تاسي المحسوب مقابل الصف التالي).
// ══════════════════════════════════════════════════════════════════════
function _cellSortValue(td) {
  const raw = (td.textContent || '').trim();
  if (!raw || raw === '—' || raw === '-' || /^غير متوفر/.test(raw)) return null;
  // نص فيه رقم واحد على الأقل → عددي (بعد تطبيع الإشارة والفواصل)
  const norm = raw.replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
                  .replace(/[−–]/g, '-').replace(/[,،]/g, '');
  const m = norm.match(/-?\d+(?:\.\d+)?/);
  if (m && /\d/.test(norm)) {
    // تاريخ ISO يبقى نصاً (يفرز صحيحاً لفظياً) — لا نحوّله لرقم
    if (/^\d{4}-\d{2}-\d{2}/.test(norm)) return { s: norm };
    return { n: +m[0] };
  }
  return { s: raw };
}

function makeTableSortable(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const table = tbody.closest('table');
  const headRow = table && table.querySelector('thead tr');
  if (!headRow) return;

  const state = table._sortState || (table._sortState = { col: -1, dir: 'asc', n: 0 });
  const ths = [...headRow.children];
  // الجدول الزمني يحقن/يحذف عمود «قيمة المحفظة» وقت التشغيل، فتنزاح الفهارس.
  // تغيّر عدد الأعمدة ⇒ الفرز المخزَّن لم يعد يشير للعمود نفسه → يُبطَل.
  if (state.n && state.n !== ths.length) { state.col = -1; state.dir = 'asc'; }
  state.n = ths.length;

  const apply = () => {
    const rows = [...tbody.querySelectorAll(':scope > tr')]
      .filter(tr => !tr.querySelector('[colspan]'));   // تجاهل صفّ «لا بيانات»
    if (rows.length < 2 || state.col < 0) return;
    rows.map(tr => [tr, _cellSortValue(tr.children[state.col])])
      .sort((a, b) => {
        const [, x] = a, [, y] = b;
        if (x == null && y == null) return 0;
        if (x == null) return 1;            // الفارغ يهبط دائماً
        if (y == null) return -1;
        let c;
        if ('n' in x && 'n' in y) c = x.n - y.n;
        else c = String(x.s ?? x.n).localeCompare(String(y.s ?? y.n), 'ar');
        return state.dir === 'asc' ? c : -c;
      })
      .forEach(([tr]) => tbody.appendChild(tr));
  };

  ths.forEach((th, i) => {
    if (th.dataset.nosort !== undefined || !(th.textContent || '').trim()) return;
    if (!th.dataset.sortBound) {
      th.dataset.sortBound = '1';
      th.classList.add('sortable');
      th.addEventListener('click', () => {
        if (state.col === i) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else { state.col = i; state.dir = 'asc'; }
        apply();
        _paintSortArrows(headRow, state);
      });
    }
  });
  _paintSortArrows(headRow, state);
  apply();   // إعادة تطبيق الفرز المختار بعد أي إعادة رسم
}

function _paintSortArrows(headRow, state) {
  [...headRow.children].forEach((th, i) => {
    th.querySelectorAll('.sort-arrow').forEach(el => el.remove());
    if (th.dataset.nosort !== undefined || !(th.textContent || '').trim()) return;
    const sp = document.createElement('span');
    sp.className = 'sort-arrow' + (state.col === i ? ' active' : '');
    sp.textContent = state.col === i ? (state.dir === 'asc' ? '↑' : '↓') : '↕';
    th.appendChild(sp);
  });
}

// ══════════════════════════════════════════════════════════════════════
// 📐 سلسلة قيمة الأسهم وحدها — أساس مقارنة المؤشر بعد إعادة التأطير
// ----------------------------------------------------------------------
// كان خطّ «محفظتك» في المقارنة يُبنى من total_value، وهو ليس محفظة أسهم:
// اللقطة التلقائية = أسهم + نقد مكتوب يدوياً + عقارات، واليدوية = صافي
// الثروة كاملة ناقص الالتزامات. وبما أن تصحيح التدفقات يأتي من
// cashflow_entries (إيداعات الوساطة فقط)، كان كل ارتفاع في القاعدة بلا صفّ
// تدفق مقابل يُحتسب «مهارة استثمارية»: إعادة تقييم عقار، أو إعادة كتابة رصيد
// النقد، أو سداد قرض — كلها كانت ترفع «تفوّقك على السوق». انحياز باتجاه واحد.
//
// الإصلاح: نستخرج قيمة الأسهم وحدها — وهي محفوظة أصلاً في كلا النوعين:
//   • اللقطة التلقائية: داخل notes بصيغة «أسهم: NNNN | نقد: … | عقارات: …»
//   • اللقطة اليدوية:   داخل snapshot_json.auto_stocks
// فتزول مشكلة اختلاف الأساس بين النوعين من جذرها (كلاهما يصير أسهماً فقط).
// ══════════════════════════════════════════════════════════════════════
function _snapStocksValue(s) {
  const j = s && s.snapshot_json;
  if (j && j.auto_stocks != null && isFinite(+j.auto_stocks) && +j.auto_stocks > 0) return +j.auto_stocks;
  // الأرقام في notes لاتينية دائماً (toFixed) — لا حاجة لتطبيع عربي-هندي
  const m = String((s && s.notes) || '').match(/أسهم:\s*([\d.]+)/);
  const v = m ? +m[1] : null;
  return (v != null && isFinite(v) && v > 0) ? v : null;
}

// سلسلة أسهم فقط، مرتّبة تصاعدياً، صف واحد لكل يوم، مذيَّلة بقيمة اليوم الحيّة
// (إضافة نقطة اليوم تُغلق فجوة «آخر لقطة قديمة» التي كانت تبتر المقارنة).
function _stocksOnlySeries() {
  const byDate = {};
  (_snapshots || []).forEach(s => {
    if (!s.date) return;
    const v = _snapStocksValue(s);
    if (v != null) byDate[s.date] = v;   // آخر قيمة لليوم تفوز
  });
  const live = (_holdings || []).reduce((a, h) => a + (+h.shares || 0) * (+h.current_price || 0), 0);
  if (live > 0) byDate[todayISO()] = live;
  return Object.keys(byDate).sort()
    .map(d => ({ date: d, total_value: byDate[d], notes: 'auto' }));  // notes='auto' ⇒ أساس موحّد
}

// ══════════════════════════════════════════════════════════════════════
// 📈 إعادة بناء قيمة المحفظة يوماً بيوم من الأسعار التاريخية
// ----------------------------------------------------------------------
// لقطات صافي الثروة شهرية، فالخطّ المرسوم منها **دالة درجية**: مسطَّح بين
// اللقطات ثم يقفز عمودياً. لا يمكن أن يشبه مواقع المقارنة التي تبني الخطّ من
// السعر اليومي لكل سهم — والفرق منهجي لا حسابي.
// هنا نُعيد بناءه كما يُبنى هناك:  قيمة اليوم = Σ (أسهمك ذلك اليوم × إغلاقه)
// الأسهم تُشتقّ من معاملاتك تراكمياً، والأسعار من `price_history_v1` المجلوبة
// آلياً. فلا حاجة للقطات إطلاقاً، ويصير الخطّ يومياً حقيقياً.
const PRICE_HIST_KEY = 'price_history_v1';
let _priceHist = null;          // { fetchedAt, bySymbol: { TK: { p:[[date,close]] } } }

async function _loadPriceHistory() {
  try {
    const raw = await loadUserSetting(PRICE_HIST_KEY);
    _priceHist = (raw && raw.bySymbol) ? raw : null;
  } catch (_) { _priceHist = null; }
  return _priceHist;
}

// خريطة تاريخ→سعر لكل رمز، مع ترحيل آخر سعر معروف (العطل لا سعر لها)
function _priceMapOf(ticker) {
  const e = _priceHist && _priceHist.bySymbol && _priceHist.bySymbol[ticker];
  if (!e || !Array.isArray(e.p) || !e.p.length) return null;
  return e.p;   // مرتّبة تصاعدياً [[date, close], ...]
}

// عدد الأسهم المملوكة لرمز عند تاريخ (من المعاملات، شامل المنح)
function _sharesAtISO(ticker, iso) {
  let sh = 0;
  for (const t of (_tx || [])) {
    if (t.ticker !== ticker || !t.date || t.date > iso) continue;
    if (t.type === 'buy' || t.type === 'grant') sh += +t.shares || 0;
    else if (t.type === 'sell') sh -= +t.shares || 0;
  }
  return Math.max(0, sh);
}

// السلسلة اليومية: [{date, total_value, notes:'auto'}] بنفس شكل اللقطات
// حتى تعمل مع _computeTWR بلا تغيير.
function _dailyPortfolioSeries() {
  if (!_priceHist || !_priceHist.bySymbol) return null;
  const tickers = [...new Set((_tx || []).map(t => t.ticker).filter(Boolean))];
  const covered = tickers.filter(t => _priceMapOf(t));
  if (!covered.length) return null;

  // أول تاريخ = أول معاملة؛ محور التواريخ = اتحاد تواريخ الأسعار بعده
  const firstTx = (_tx || []).filter(t => t.date).map(t => t.date).sort()[0];
  if (!firstTx) return null;
  const dateSet = new Set();
  covered.forEach(t => _priceMapOf(t).forEach(([d]) => { if (d >= firstTx) dateSet.add(d); }));
  const dates = [...dateSet].sort();
  if (dates.length < 2) return null;

  // مؤشّر متقدّم لكل رمز + آخر سعر معروف (ترحيل)
  const idx = {}, last = {};
  covered.forEach(t => { idx[t] = 0; last[t] = null; });

  // ══════════════════════════════════════════════════════════════
  // AUDIT-FIX (2026-08-21): القيمة كانت **أسعاراً فقط**. حين توزّع شركة أرباحاً
  // ينزل سعرها يوم الاستحقاق وتدخل النقود جيب المالك — فكان الخطّ يسجّل الهبوط
  // ولا يسجّل النقود: **انحياز منهجي ضدّ المالك**، ويُقارَن فوق ذلك بتاسي
  // «العائد الإجمالي» الذي يشمل توزيعات السوق. مقارنة عائد سعري بعائد إجمالي.
  //
  // النموذج الصحيح — المحفظة = أسهم + نقد داخلها:
  //   نقد(t) = إيداعاتك − سحوباتك − مشترياتك + مبيعاتك + توزيعاتك (حتى t)
  //   القيمة(t) = أسهم(t) + نقد(t)
  // وبذلك: التوزيعة **عائد** لا تدفّق (القيمة لا تتغيّر: سعر ينزل ونقد يرتفع)،
  // والشراء والبيع **حركة داخلية** لا تدفّق، والتدفق الخارجي الوحيد هو
  // إيداعاتك وسحوباتك الفعلية. وهذا هو تعريف العائد الإجمالي للمحفظة.
  // ══════════════════════════════════════════════════════════════
  const coveredSet = new Set(covered);
  const evByDate = {};                       // تاريخ → صافي أثر النقد ذلك اليوم
  const addEv = (d, v) => { if (d) evByDate[d] = (evByDate[d] || 0) + v; };
  (_cf || []).forEach(c => {
    if (!c.date) return;
    if (c.type === 'deposit')         addEv(c.date,  +c.amount || 0);
    else if (c.type === 'withdrawal') addEv(c.date, -(+c.amount || 0));
  });
  (_tx || []).forEach(t => {
    if (!t.date || !coveredSet.has(t.ticker)) return;   // غير المُقيَّم مستبعَد كلياً
    if (t.type === 'buy')       addEv(t.date, -(+t.total || 0));
    else if (t.type === 'sell') addEv(t.date,  (+t.total || 0));
  });
  (_divs || []).forEach(d => {
    const dt = d.date || null;
    if (!dt || !coveredSet.has(d.ticker)) return;
    addEv(dt, +d.amount || 0);
  });

  const out = [];
  out.covered = coveredSet;
  let cash = 0, impliedDeposits = 0;
  // أحداث سابقة لأول تاريخ في المحور تُطوى في الرصيد الابتدائي
  Object.keys(evByDate).filter(d => d < dates[0]).sort()
    .forEach(d => { cash += evByDate[d]; });

  for (const d of dates) {
    cash += (evByDate[d] || 0);
    // رصيد سالب = إيداعات لم تُسجَّل في صفحة التدفقات (المشتريات تفوق الممول).
    // نرفعه إلى الصفر ونعدّ الفارق إيداعاً ضمنياً — ونُعلنه بدل تشويه العائد.
    if (cash < -0.005) { impliedDeposits += -cash; addEv(d, -cash); cash = 0; }

    let stocks = 0;
    for (const t of covered) {
      const arr = _priceMapOf(t);
      while (idx[t] < arr.length && arr[idx[t]][0] <= d) { last[t] = arr[idx[t]][1]; idx[t]++; }
      if (last[t] == null) continue;                 // قبل أول سعر معروف
      const sh = _sharesAtISO(t, d);
      if (sh > 0) stocks += sh * last[t];
    }
    const total = stocks + cash;
    if (total > 0) out.push({ date: d, total_value: total, notes: 'auto', stocks, cash });
  }
  out.impliedDeposits = impliedDeposits;
  return out.length >= 2 ? out : null;
}

// التدفقات الخارجية للنموذج الجديد: إيداعاتك وسحوباتك الفعلية فقط.
// المشتريات والمبيعات حركة داخلية (نقد ↔ أسهم) لا تدخل الحساب، والتوزيعات عائد.
function _externalFlows() {
  return (_cf || []).filter(c => c.date && (c.type === 'deposit' || c.type === 'withdrawal'))
    .map(c => ({ date: c.date, type: c.type, amount: +c.amount || 0 }))
    .filter(f => f.amount > 0);
}

// تغطية إعادة البناء — تُعلَن للمالك بدل الصمت عن رمز بلا أسعار
function _dailyCoverage() {
  const tickers = [...new Set((_tx || []).map(t => t.ticker).filter(Boolean))];
  const missing = tickers.filter(t => !_priceMapOf(t));
  return { total: tickers.length, missing };
}

// ══════════════════════════════════════════════════════════════════════
// 🩺 كشف اللقطات المشبوهة في سلسلة الأسهم
// ----------------------------------------------------------------------
// خطّ المحفظة مسطَّح بين اللقطات (ترحيل آخر قيمة)، فلا يهبط من تلقاء نفسه:
// أي انهيار مفاجئ يعني نقطة لقطة تحمل قيمة أسهم منخفضة فعلاً. وأكثر أسبابها
// شيوعاً ليست خسارة سوقية بل **لقطة نصف محمَّلة**: صورة أُخذت قبل اكتمال جلب
// الأسعار أو الحيازات، أو لقطة يدوية حُفظ فيها auto_stocks قديماً.
// المؤشر الحاسم: هبوط حادّ **لا تفسّره معاملاتك** ثم **تعافٍ فوري** في النقطة
// التالية. خسارة سوقية حقيقية لا ترتدّ كاملةً خلال أسبوعين، وبيع حقيقي يظهر
// في المعاملات. فنستبعدها من الحساب ونُعلنها بدل رسم انهيار لم يقع.
const SNAP_ANOMALY_DROP = 0.20;      // هبوط غير مفسَّر يتجاوزه = مشبوه
const SNAP_ANOMALY_RECOVER = 0.15;   // ثم ارتداد يتجاوزه = شبه يقين أنها بيانات

function _flowsBetween(fromISO, toISO) {
  return (_tx || []).reduce((sum, t) => {
    if (!t.date || t.date <= fromISO || t.date > toISO) return sum;
    if (t.type === 'buy')  return sum + (+t.total || 0);
    if (t.type === 'sell') return sum - (+t.total || 0);
    return sum;
  }, 0);
}

// تُرجع { clean, anomalies } — clean بلا النقاط المشبوهة، وanomalies لعرضها
function _screenStocksSeries(series) {
  const anomalies = [];
  if (series.length < 3) return { clean: series, anomalies };
  const keep = series.map(() => true);
  for (let i = 1; i < series.length - 1; i++) {
    const prev = series[i - 1], cur = series[i], next = series[i + 1];
    const inFlow  = _flowsBetween(prev.date, cur.date);
    const outFlow = _flowsBetween(cur.date, next.date);
    const expected = prev.total_value + inFlow;
    if (!(expected > 0)) continue;
    const drop = (cur.total_value - expected) / expected;                 // سالب = هبوط غير مفسَّر
    const recover = (next.total_value - (cur.total_value + outFlow)) / Math.max(1, cur.total_value);
    if (drop <= -SNAP_ANOMALY_DROP && recover >= SNAP_ANOMALY_RECOVER) {
      keep[i] = false;
      anomalies.push({
        date: cur.date, value: cur.total_value, expected,
        dropPct: drop * 100, recoverPct: recover * 100,
        flowIn: inFlow, prev: prev.total_value, next: next.total_value,
      });
    }
  }
  return { clean: series.filter((_, i) => keep[i]), anomalies };
}

// تدفقات محفظة الأسهم = المشتريات والمبيعات، لا إيداعات الوساطة.
// هذا هو المال الذي دخل الأسهم فعلاً وخرج منها — وهو المقام الصحيح لـ Dietz.
// AUDIT-FIX (2026-08-21): كانت تحسب تدفقات **كل** الرموز بينما السلسلة اليومية
// لا تُقيّم إلا الرموز التي لها أسعار. فشراء رمز بلا أسعار = مال داخل بلا قيمة
// مقابلة، وModified Dietz يقرأ الفارق **خسارة**:
//     r = (النهاية − البداية − التدفق) ÷ (البداية + التدفق/2)
// فيهبط الخطّ هبوطاً حادّاً **بلا ارتداد** يوم الضخّ — وهو ما رآه المالك في
// 3–4 سبتمبر 2025، أيام أكبر إيداعاته. نفس المنطق ينطبق على رمز تبدأ سلسلة
// أسعاره بعد تاريخ شرائه: أسهمه غير مُقيَّمة بعد بينما تدفّقه محسوب.
// القاعدة الحاكمة: **مجال التدفقات = مجال القيمة بالضبط**، وإلا انهار المقياس.
function _firstPriceDateOf(ticker) {
  const arr = _priceMapOf(ticker);
  return arr && arr.length ? arr[0][0] : null;
}

function _stockFlows(coveredSet) {
  return (_tx || []).filter(t => {
    if (!t.date || (t.type !== 'buy' && t.type !== 'sell')) return false;
    if (!coveredSet) return true;                       // مسار اللقطات: كما كان
    if (!coveredSet.has(t.ticker)) return false;        // رمز غير مُقيَّم → تدفّقه مستبعَد
    const from = _firstPriceDateOf(t.ticker);
    return !from || t.date >= from;                     // قبل أول سعر معروف لا قيمة له
  })
    .map(t => ({ date: t.date, type: t.type === 'buy' ? 'deposit' : 'withdrawal', amount: +t.total || 0 }))
    .filter(f => f.amount > 0);
}

function _computeTWR(snapshots, cashflows) {
  // خطوة أولى: سلسلة متجانسة الأساس، ثم لقطة واحدة فقط لكل يوم لتجنب تشويه الحسابات
  const sorted = _deduplicateSnapsByDay(_selectConsistentSnapshots(snapshots));
  if (!sorted.length) return { twrMap: {}, sortedSnaps: sorted, suspiciousPeriods: [] };

  const cfs = cashflows.slice().sort((a, b) => a.date.localeCompare(b.date));
  const twrMap = {};
  let factor = 1.0;
  let droppedPeriods = 0;
  twrMap[sorted[0].date] = 100;

  for (let i = 1; i < sorted.length; i++) {
    const startDate = sorted[i - 1].date;
    const endDate   = sorted[i].date;
    const startVal  = +sorted[i - 1].total_value;
    const endVal    = +sorted[i].total_value;

    // مجموع التدفقات النقدية الصافية خلال الفترة (إيداع+، سحب−)
    const netCF = cfs
      .filter(c => c.date > startDate && c.date <= endDate)
      .reduce((s, c) => s + (c.type === 'deposit' ? +c.amount : -+c.amount), 0);

    // Modified Dietz: مقام = قيمة البداية + نصف التدفق (افتراض منتصف الفترة)
    const denom = startVal + netCF / 2;
    if (denom > 0) {
      const r = (endVal - startVal - netCF) / denom;
      factor *= (1 + r);
    } else {
      droppedPeriods++; // AUDIT-FIX (2026-08): كانت تُتخطى بصمت
    }
    twrMap[sorted[i].date] = +(factor * 100).toFixed(3);
  }

  // AUDIT-FIX (2026-08): تحذير ظاهر (مرة واحدة) بعدد الفترات المُسقطة من TWR
  if (droppedPeriods > 0 && !_twrDropWarned) {
    _twrDropWarned = true;
    showToast(`⚠️ تم إسقاط ${droppedPeriods} فترة من حساب TWR (مقام ≤ 0 — قيمة بداية أو تدفقات غير سليمة) — راجع اللقطات والتدفقات النقدية`, 'error');
    console.warn(`[performance] TWR: dropped ${droppedPeriods} period(s) with non-positive Modified-Dietz denominator`);
  }

  // فترات مشبوهة: تغيّر > 10% في فترة واحدة بدون cashflow يُفسّره
  const suspiciousPeriods = [];
  for (let i = 1; i < sorted.length; i++) {
    const startDate = sorted[i - 1].date;
    const endDate   = sorted[i].date;
    const startVal  = +sorted[i - 1].total_value;
    const endVal    = +sorted[i].total_value;
    const netCF     = cfs
      .filter(c => c.date > startDate && c.date <= endDate)
      .reduce((s, c) => s + (c.type === 'deposit' ? +c.amount : -+c.amount), 0);
    const denom = startVal + netCF / 2;
    if (denom > 0) {
      const r = (endVal - startVal - netCF) / denom;
      if (Math.abs(r) > 0.10) {
        suspiciousPeriods.push({ startDate, endDate, r: +(r * 100).toFixed(1), netCF, startVal, endVal });
      }
    }
  }

  return { twrMap, sortedSnaps: sorted, suspiciousPeriods };
}

// ── تقرير الجلب التلقائي: نجاح مفصَّل أو فشل صريح ────────────
// لا فشل صامت: عند تعذّر الجلب نشرح السبب ونذكّر بأن الدالة السحابية قد
// تحتاج نشراً يدوياً (supabase functions deploy update-prices).
function _renderTasiFetchReport(bmEntries) {
  const el = document.getElementById('bm-fetch-report');
  if (!el) return;

  if (_tasiLastError) {
    el.innerHTML = noteHtml('⚠️', `
      <b>تعذّر جلب تاسي تلقائياً.</b><br>
      <span class="small">${esc(_tasiLastError)}</span><br>
      <b>الأرجح:</b> الدالة السحابية <code>update-prices</code> لم تُنشَر بعد بنسخة تدعم
      <code>tasiHistory</code>. النشر خطوة يدوية لمرة واحدة من طرفك
      (<code>supabase functions deploy update-prices</code>).<br>
      ✋ <b>الإدخال اليدوي أدناه يعمل كما هو</b> ولم يتأثر — يمكنك متابعة إدخال القيم أسبوعياً كالمعتاد.
    `, 'bad');
    return;
  }

  if (_tasiLastReport) {
    const r = _tasiLastReport;
    el.innerHTML = noteHtml('✅', `
      <b>اكتمل الجلب التلقائي</b> — مدى ${esc(r.range)}، ${r.fetched} نقطة مُستلَمة
      تغطّي ${formatDate(r.from)} ← ${formatDate(r.to)}.<br>
      ${kvsHtml([
        ['🆕 أُضيفت',            `${r.added} نقطة`],
        ['🔄 حُدِّثت',            `${r.updated} نقطة`],
        ['⏸️ بلا تغيير',         `${r.unchanged} نقطة`],
        ['✋ تُجوهِلت (يدوية)',  `${r.skippedManual} نقطة`],
        ['📊 الإجمالي الآن',     `${r.total} نقطة`],
      ])}
      ${r.skippedManual ? `<div class="small text-muted mt-2">النقاط اليدوية محميّة عمداً. لفكّ أيٍّ منها اضغط 🔄 بجانبها في الجدول أدناه.</div>` : ''}
    `, 'good');
    return;
  }

  // لا جلب بعد — تلميح صغير فقط
  const autoCount = (bmEntries || []).filter(e => _bmSrcOf(e) === 'auto').length;
  el.innerHTML = autoCount ? '' : noteHtml('💡',
    'بدل الإدخال الأسبوعي اليدوي: اضغط <b>🔄 جلب تاسي تلقائياً</b> أعلاه. الجلب <b>يدمج ولا يستبدل</b>، ولن يدوس أي نقطة أدخلتها بيدك (✋).');
}

// ── رسم التبويب كاملاً ────────────────────────────────────────
function renderBenchmarkTab() {
  const bmEntries = _loadBenchmark();  // [{ date, value, src }] مرتبة
  const snapshots = [..._snapshots].sort((a, b) => a.date.localeCompare(b.date));

  // ── تقرير الجلب التلقائي / تحذير النشر ───────────────────
  _renderTasiFetchReport(bmEntries);

  // ── جدول بيانات تاسي ─────────────────────────────────────
  const entriesWrap  = document.getElementById('bm-entries-wrap');
  const entriesTbody = document.getElementById('bm-entries-tbody');
  const entriesCount = document.getElementById('bm-entries-count');
  const _srcTally = bmEntries.reduce((a, e) => { a[_bmSrcOf(e)] = (a[_bmSrcOf(e)] || 0) + 1; return a; }, {});
  if (entriesCount) {
    entriesCount.textContent = bmEntries.length
      ? `(${bmEntries.length} نقطة · ✋ ${_srcTally.manual || 0} يدوية · 🔄 ${_srcTally.auto || 0} تلقائية · 🌱 ${_srcTally.seed || 0} مضمّنة)`
      : '';
  }
  if (entriesTbody) {
    if (bmEntries.length) {
      if (entriesWrap) entriesWrap.style.display = '';
      entriesTbody.innerHTML = [...bmEntries].reverse().map((e, i, arr) => {
        const prev = arr[i + 1];  // السابق (أقدم — الـ arr مقلوب)
        let changeTd = '<td class="text-muted small">—</td>';
        if (prev) {
          const pct = (e.value - prev.value) / prev.value * 100;
          const cls = pct >= 0 ? 'text-success' : 'text-danger';
          changeTd = `<td class="num ${cls}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</td>`;
        }
        const src = _bmSrcOf(e), meta = BM_SRC_META[src];
        const srcTd = `<td>${tagHtml(meta.icon, meta.label, meta.state)}</td>`;
        // زر فكّ الحماية يظهر لليدوية فقط — يُرجعها للتحديث التلقائي (نفس ✋ اللوحة)
        const unlockBtn = src === 'manual'
          ? `<button class="btn btn-secondary btn-sm" title="أعِد هذه النقطة للتحديث التلقائي — سيدوسها الجلب القادم" onclick="unlockBenchmarkEntry('${esc(e.date)}')">🔄</button>`
          : '';
        return `<tr>
          <td>${formatDate(e.date)}</td>
          <td class="num bold">${e.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
          ${changeTd}
          ${srcTd}
          <td class="bm-acts">${unlockBtn}<button class="btn btn-danger btn-sm" onclick="deleteBenchmarkEntry('${esc(e.date)}')">✕</button></td>
        </tr>`;
      }).join('');
      makeTableSortable('bm-entries-tbody');
    } else {
      if (entriesWrap) entriesWrap.style.display = 'none';
    }
  }

  // ── ابنِ بيانات الرسم ─────────────────────────────────────
  // نحتاج: أول تاريخ مشترك بين الـ snapshots والـ bmEntries
  const chartWrap = document.getElementById('bm-chart-wrap');
  const emptyEl   = document.getElementById('bm-empty');
  const summaryEl = document.getElementById('bm-summary');

  // كفاية سلسلة الأسهم تُفحَص بعد بنائها (تشمل نقطة اليوم الحيّة)، فهنا نتحقق
  // من المؤشر وحده — وإلا حُجبت المقارنة عمّن لديه لقطة واحدة فقط.
  if (bmEntries.length < 2) {
    if (chartWrap)  chartWrap.style.display  = 'none';
    if (emptyEl)    emptyEl.style.display    = '';
    if (summaryEl)  summaryEl.style.display  = 'none';
    if (_bmChart) { _bmChart.destroy(); _bmChart = null; }
    return;
  }

  // ── إعادة التأطير (2026-08-18): المقارنة على الأسهم وحدها ──────────
  // portSeries = قيمة أسهمك فقط عبر الزمن (لا نقد ولا عقارات ولا التزامات)،
  // وتدفقاتها = مشترياتك ومبيعاتك لا إيداعات الوساطة.
  // AUDIT-FIX (2026-08-21): إعادة التأطير إلى «أسهم فقط» قلّصت التغطية بصمت —
  // اللقطات التي لا تسجّل مكوّن الأسهم (يدوية قديمة قبل عمود snapshot_json،
  // أو auto_stocks = 0) تسقط كلياً، فتنكمش نافذة المقارنة من سنة إلى أشهر
  // والمالك لا يدري. الرقم أصدق تعريفاً وأضعف تغطيةً — والثاني يجب أن يُعلَن.
  const _snapTotal = (_snapshots || []).length;
  // الأولوية للسلسلة اليومية المُعاد بناؤها من الأسعار — فهي وحدها تُنتج خطاً
  // يومياً حقيقياً قابلاً للمقارنة بمنحنى المؤشر. اللقطات احتياطي فقط.
  const _daily = _dailyPortfolioSeries();
  const _seriesMode = _daily ? 'daily' : 'snapshots';
  const _rawSeries = _daily || _stocksOnlySeries();
  const _snapUsable = _daily ? _daily.length : _rawSeries.filter(p => p.date !== todayISO()).length;
  const _snapSkipped = _daily ? 0 : Math.max(0, _snapTotal - _snapUsable);
  const _cov = _dailyCoverage();
  const { clean: portSeries, anomalies: _snapAnoms } = _screenStocksSeries(_rawSeries);
  if (portSeries.length < 2) {
    if (chartWrap)  chartWrap.style.display  = 'none';
    if (emptyEl)    emptyEl.style.display    = '';
    if (summaryEl)  summaryEl.style.display  = 'none';
    if (_bmChart) { _bmChart.destroy(); _bmChart = null; }
    return;
  }

  // ── مزج النقاط: التواريخ المشتركة أو الأقرب ──────────────
  // نستخدم جميع التواريخ في كلا المصدرين ثم نطابق بالأقرب
  const allDates = [...new Set([
    ...bmEntries.map(e => e.date),
    ...portSeries.map(s => s.date),
  ])].sort();

  // دالة مساعدة: قيمة تاسي عند تاريخ معين (أقرب نقطة سابقة أو مطابقة)
  const getTasiAt = (date) => {
    const prior = bmEntries.filter(e => e.date <= date);
    return prior.length ? prior[prior.length - 1].value : null;
  };

  // دالة مساعدة: قيمة أسهمك عند تاريخ معين (أقرب نقطة سابقة أو مطابقة)
  const getPortAt = (date) => {
    const prior = portSeries.filter(s => s.date <= date);
    return prior.length ? +prior[prior.length - 1].total_value : null;
  };

  // ابنِ نقاط الرسم: فقط الأيام التي تتوفر فيها كلا القيمتين
  const points = allDates.map(d => ({ date: d, tasi: getTasiAt(d), port: getPortAt(d) }))
    .filter(p => p.tasi != null && p.port != null);

  if (points.length < 2) {
    if (chartWrap)  chartWrap.style.display  = 'none';
    if (emptyEl)    emptyEl.style.display    = '';
    if (summaryEl)  summaryEl.style.display  = 'none';
    if (_bmChart) { _bmChart.destroy(); _bmChart = null; }
    return;
  }

  // ── حساب TWR لمحفظة الأسهم ──────────────────────────────
  // التدفقات = مشترياتك ومبيعاتك (المال الداخل للأسهم فعلاً)، لا إيداعات
  // الوساطة — فيتطابق مجال التصحيح مع مجال القيمة المقاسة.
  const { twrMap, sortedSnaps, suspiciousPeriods } = _computeTWR(portSeries,
    _seriesMode === 'daily' ? _externalFlows() : _stockFlows());

  const getTwrAt = (date) => {
    const prior = sortedSnaps.filter(s => s.date <= date);
    if (!prior.length) return null;
    return twrMap[prior[prior.length - 1].date] ?? null;
  };

  // ── تطبيع إلى 100 عند أول نقطة مشتركة ──────────────────
  // AUDIT-FIX (2026-08-18): كان `getTwrAt(base.date) ?? 100` يُسقط التطبيع
  // صامتاً حين تبدأ سلسلة TWR بعد أول نقطة في الرسم — فيبدأ الخطّان من
  // تاريخين مختلفين بينما تُخبر الصفحة المستخدم أنهما يتشاركان الأساس.
  // الآن: نُسقط النقاط السابقة لأول قيمة TWR بدل اختراع أساس.
  while (points.length && getTwrAt(points[0].date) == null) points.shift();
  if (points.length < 2) {
    if (chartWrap)  chartWrap.style.display  = 'none';
    if (emptyEl)    emptyEl.style.display    = '';
    if (summaryEl)  summaryEl.style.display  = 'none';
    if (_bmChart) { _bmChart.destroy(); _bmChart = null; }
    return;
  }
  const base      = points[0];
  const tasiBase  = base.tasi;
  const baseTwr   = getTwrAt(base.date);

  const tasiNorm = points.map(p => +((p.tasi / tasiBase * 100).toFixed(2)));
  // portNorm = TWR مُعدَّل عند نقطة البداية المشتركة (يُزيل أثر الإيداعات)
  const portNorm = points.map(p => {
    const twr = getTwrAt(p.date);
    return twr != null ? +((twr / baseTwr * 100).toFixed(2)) : null;
  });
  const labels   = points.map(p => p.date);

  // ── رسم الشارت ───────────────────────────────────────────
  if (chartWrap)  chartWrap.style.display  = '';
  if (emptyEl)    emptyEl.style.display    = 'none';
  if (_bmChart) { _bmChart.destroy(); _bmChart = null; }

  const canvas = document.getElementById('benchmark-chart');
  if (!canvas) return;

  // ألوان المخطط من رموز التصميم فقط (تتبدّل مع الوضع الفاتح/الداكن تلقائياً)
  const th      = chartTheme();
  const cPort   = seriesColor(2);   // --series-3 أخضر — المحفظة
  const cTasi   = seriesColor(1);   // --series-2 أزرق — المؤشر

  _bmChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label:           'محفظتك (TWR)',
          data:            portNorm,
          borderColor:     cPort,
          backgroundColor: tint(cPort, '1a'),
          borderWidth:     2.5,
          pointRadius:     3,
          pointHoverRadius: 6,
          tension:         0.35,
          fill:            true,
          spanGaps:        true,
        },
        {
          label:           'مؤشر تاسي (سعري)',
          data:            tasiNorm,
          borderColor:     cTasi,
          backgroundColor: 'transparent',
          borderWidth:     2,
          pointRadius:     3,
          pointHoverRadius: 6,
          tension:         0.35,
          fill:            false,
          borderDash:      [5, 3],
        },
        {
          label:           'خط القاعدة (100)',
          data:            Array(labels.length).fill(100),
          borderColor:     tint(th.muted, '55'),
          backgroundColor: 'transparent',
          borderWidth:     1,
          borderDash:      [3, 4],
          pointRadius:     0,
          fill:            false,
          tension:         0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: th.muted, font: { family: th.font, size: 11 }, padding: 14, usePointStyle: true },
        },
        tooltip: {
          rtl: true,
          ...chartTooltipStyle(),
          callbacks: {
            title: items => items[0].label,
            label: ctx => {
              const val = ctx.parsed.y;
              const delta = val - 100;
              if (ctx.dataset.label.includes('قاعدة')) return null;
              return `  ${ctx.dataset.label}: ${val.toFixed(2)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%)`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: th.muted, font: { family: th.font, size: 10 }, maxTicksLimit: 14 },
          grid:  { color: th.grid },
        },
        y: {
          ticks: { color: th.muted, font: { family: th.font, size: 11 }, callback: v => v + '' },
          grid:  { color: th.grid },
        },
      },
    },
  });

  // ── ملخص الأداء ──────────────────────────────────────────
  // AUDIT-FIX (2026-08): حارس — لو تعذّر حساب TWR عند آخر نقطة (سلسلة لقطات
  // مختلطة الأساس مثلاً) كان `null − 100` يُنتج «−100.00%» وهمية. الآن نأخذ آخر
  // قيمة غير فارغة، وإن لم توجد أصلاً نُخفي الملخّص بدل عرض رقم مُختلَق.
  const lastPort  = [...portNorm].reverse().find(v => v != null);
  const lastTasi  = tasiNorm[tasiNorm.length - 1];
  if (lastPort == null || lastTasi == null) {
    if (summaryEl) {
      summaryEl.style.display = '';
      summaryEl.innerHTML = noteHtml('⚪', 'تعذّر حساب عائد المحفظة (TWR) على الفترة المشتركة — لا يمكن استخراج Alpha. راجع لقطات صافي الثروة في صفحة صافي الثروة.', 'warn');
    }
    return;
  }
  const portDelta = lastPort - 100;
  const tasiDelta = lastTasi - 100;
  // AUDIT-FIX (H2): the portfolio line is TWR (total return — includes dividends) but the manually
  // entered TASI series is the PRICE index. Comparing them directly overstates Alpha by TASI's
  // dividend yield (~3.5%/yr historically). Approximate TASI Total-Return (TRI) by compounding an
  // assumed dividend yield over the elapsed period and report Alpha against THAT (apples-to-apples).
  // The price-based figure is retained as a secondary reference.
  const TASI_DIV_YIELD = 0.035; // متوسط عائد توزيعات تاسي التاريخي التقريبي
  const yearsElapsed = Math.max(0,
    (new Date(points[points.length - 1].date) - new Date(points[0].date)) / (365.25 * 86400000));
  const tasiTriDelta = ((1 + tasiDelta / 100) * Math.pow(1 + TASI_DIV_YIELD, yearsElapsed) - 1) * 100;
  const alpha      = portDelta - tasiTriDelta;  // Alpha مقابل العائد الإجمالي (TRI) — الأصحّ
  const alphaPrice = portDelta - tasiDelta;     // مقابل تاسي السعري — مرجع ثانوي
  const betterThan = alpha > 0;

  const fmtPct = (v, sign = true) =>
    `${sign && v > 0 ? '+' : ''}${v.toFixed(2)}%`;

  const alphaState  = alpha >= 0 ? 'good' : 'bad';
  const periodLabel = `${formatDate(points[0].date)} — ${formatDate(points[points.length - 1].date)}`;

  // شارة نضج على Alpha: على فترة قصيرة يكون الفارق ضجيجاً لا مهارة
  const _mAlpha = assessMetricMaturity('return', { ageMonths: yearsElapsed * 12 });
  const _alphaBadge = maturityBadge(_mAlpha.level, _mAlpha.reason);

  if (summaryEl) {
    summaryEl.style.display = '';
    // البساطة: Alpha هو الرقم البطل — هو وحده يجيب «هل تفوّقت على السوق؟».
    // البقية أرقام مساندة في .kvs، والمنهجية في .note، والتفاصيل خلف <details>.
    summaryEl.innerHTML = `
      <div class="card stack">
        <div class="perf-hero">
          ${heroHtml(`${fmtPct(alpha)}${_alphaBadge}`, `الأداء الزائد على تاسي (Alpha) خلال ${periodLabel}`, stateColorOf(alphaState))}
          <div>${tagHtml(alpha >= 0 ? '✅' : '⚠️', alpha >= 0 ? 'محفظتك تتفوّق على تاسي' : 'تاسي يتفوّق على محفظتك', alphaState)}</div>
        </div>

        ${kvsHtml([
          ['عائد محفظتك — إجمالي (TWR)', fmtPct(portDelta)],
          ['تاسي — سعري',              fmtPct(tasiDelta)],
          ['تاسي — عائد إجمالي (TRI)', fmtPct(tasiTriDelta)],
          ['Alpha مقابل السعري',       fmtPct(alphaPrice)],
          ['نقاط المقارنة',            `${points.length}`],
          ['مصادر البيانات',           `${bmEntries.length} نقطة تاسي · ${portSeries.length} نقطة محفظة (${_seriesMode === 'daily' ? 'يومية من الأسعار' : 'من اللقطات'})`],
        ])}

        ${noteHtml('🧭', `<b>هذا الرقم تراكمي وزمني-الوزن — وليس هو رقم محرّك القرار.</b>
          هنا: عائد <b>أسهمك</b> تراكمياً خلال الفترة أعلاه، بـTWR الذي <b>يعزل توقيت ضخّك</b> عمداً
          ليقيس اختياراتك وحدها. وفي <a href="decision-engine.html">محرّك القرار</a>: نفس السؤال
          لكن بـXIRR <b>سنوي</b> يضع نفس ريالاتك في نفس تواريخها داخل المؤشر، فيقيس <b>نتيجتك الفعلية</b>
          بما فيها توقيت الضخّ.
          <br>الرقمان صحيحان ويجيبان سؤالين مختلفين: هذا يقول «هل اختياراتي جيدة؟»، وذاك يقول
          «هل خرجتُ فعلاً أفضل من المؤشر بمالي؟». اختلافهما في الإشارة يعني عادةً أن <b>توقيت ضخّك</b>
          هو الفارق — لا اختياراتك.`, '')}

        ${noteHtml('🔬', `<b>ما الذي يدخل في «عائد أسهمك» هنا؟</b> أسهمك فقط.
          حتى 2026-08-18 كان هذا الخطّ يُبنى من <code>total_value</code> في لقطات صافي الثروة، وهي
          <b>ليست محفظة أسهم</b>: اللقطة التلقائية = أسهم + نقد مكتوب يدوياً + عقارات، واليدوية =
          صافي ثروتك كاملة ناقص الالتزامات. ولأن تصحيح التدفقات كان يأتي من إيداعات الوساطة وحدها،
          كان رفع تقييم عقار أو إعادة كتابة رصيد النقد أو سداد قرض <b>يُحتسب تفوّقاً على السوق</b>.
          الآن تُستخرَج قيمة الأسهم وحدها من كل لقطة (من <code>snapshot_json.auto_stocks</code> أو من
          سطر «أسهم:» داخل الملاحظات)، والتدفقات = مشترياتك ومبيعاتك. الرقم أصدق — وقد يكون أقل.`, '')}

        ${noteHtml('⚠️', `
          <b>عائد توزيعات تاسي رقم تقديري لا فعلي.</b> محفظتك (TWR) تشمل توزيعاتك، فلا تُقارن بمؤشر
          <em>سعري</em> لا يشملها. لذلك نبني «تاسي للعائد الإجمالي (TRI)» =
          السعري × <b>(1 + ${(TASI_DIV_YIELD * 100).toFixed(1)}%)^${yearsElapsed.toFixed(1)}</b> —
          حيث ${(TASI_DIV_YIELD * 100).toFixed(1)}%/سنة <b>افتراض ثابت مكتوب في الكود</b>، وليس عائد
          التوزيعات الفعلي للمؤشر (يتغيّر سنوياً بين ~2% و~5%). كل نقطة مئوية خطأ في هذا الافتراض
          تنتقل مباشرةً إلى Alpha. الرقم مقابل <b>تاسي السعري</b> (${fmtPct(alphaPrice)}) معروض أعلاه
          كمرجع خالٍ من هذا الافتراض.`, 'warn')}

        ${noteHtml('📌', `
          عائد أسهمك محسوب بـ <b>TWR (Time-Weighted Return)</b> بمنهج Modified Dietz — يعزل أداء
          قراراتك عن مشترياتك ومبيعاتك. كلا الخطين مُنسَّبان إلى 100 عند <b>${formatDate(points[0].date)}</b>
          (وهو أول تاريخ تتوفّر فيه القيمتان معاً).`)}

        ${_seriesMode === 'daily' ? noteHtml('📈', `<b>خطّ محفظتك مُعاد بناؤه يوماً بيوم — بالعائد الإجمالي شاملاً توزيعاتك.</b>
          قيمة كل يوم = <b>(أسهمك × سعر إغلاقها) + النقد داخل محفظتك</b>،
          والنقد = إيداعاتك − سحوباتك − مشترياتك + مبيعاتك <b>+ توزيعاتك</b>.
          فالتوزيعة <b>عائد لا تدفّق</b> (سعر السهم ينزل والنقد يرتفع، والقيمة لا تتغيّر)،
          والشراء والبيع حركة داخلية، والتدفق الخارجي الوحيد إيداعاتك وسحوباتك.
          <b>${_rawSeries.length}</b> نقطة يومية — وهذا ما يجعل الرقم قابلاً للمقارنة بتاسي «العائد الإجمالي».
          ${_rawSeries.impliedDeposits > 0 ? `<br>⚠️ <b>${formatSAR(_rawSeries.impliedDeposits)}</b> إيداعات <b>ضمنية</b>: مشترياتك تجاوزت ما تموّله تدفقاتك المسجّلة، فافترضنا إيداعاً بالفارق بدل تشويه العائد. سجّلها في صفحة التدفقات النقدية ليصير الحساب دقيقاً.` : ''}
          ${_cov.missing.length ? `<br>⚠️ <b>${_cov.missing.length}</b> من ${_cov.total} رمزاً بلا أسعار تاريخية (${_cov.missing.map(esc).join('، ')}) — مستبعَدة من الخطّ، فالقيمة أقلّ من الحقيقية بمقدارها.` : ''}`,
          _cov.missing.length ? 'warn' : '') : ''}

        ${_snapSkipped > 0 ? noteHtml('📉', `<b>تغطية قصيرة: ${_snapUsable} من ${_snapTotal} لقطة تحمل قيمة أسهم.</b>
          هذه المقارنة تقيس <b>أسهمك وحدها</b>، وقيمة الأسهم مسجّلة فقط في اللقطات التي تحفظها
          (تلقائياً من لوحة التحكم في الملاحظات، أو يدوياً في <code>snapshot_json.auto_stocks</code>).
          اللقطات الأقدم من إضافة هذا الحقل لا تحمله، فتسقط — وتنكمش النافذة معها.
          <br><b>أثر ذلك على الأرقام أعلاه:</b> ألفا محسوبة على
          <b>${points.length}</b> نقطة مقارنة خلال الفترة المعروضة فقط، لا على تاريخك كاملاً؛
          و<b>كل نقطة معطوبة واحدة تُحدث أثراً كبيراً</b> حين تكون النقاط قليلة.
          ${_snapUsable < 6 ? '<br>⚠️ بأقل من ست نقاط، اقرأ هذا الرقم كإشارة اتجاه لا كقياس.' : ''}
          <br><span class="small">يتحسّن تلقائياً: كل لقطة جديدة من لوحة التحكم أو صفحة صافي الثروة تُسجّل مكوّن الأسهم وتدخل هنا.</span>`,
          _snapUsable < 6 ? 'warn' : '') : ''}

        ${_snapAnoms.length ? noteHtml('🩺', `<b>استُبعدت ${_snapAnoms.length} لقطة مشبوهة من الحساب.</b>
          هبوط حادّ لا تفسّره معاملاتك ثم تعافٍ فوري بعده — النمط المميّز للقطة نصف
          محمَّلة (صورة أُخذت قبل اكتمال جلب الأسعار أو الحيازات)، لا لخسارة سوقية:
          الخسارة الحقيقية لا ترتدّ كاملةً، والبيع الحقيقي يظهر في معاملاتك.
          <div class="table-wrapper" style="margin-top:8px"><table>
            <thead><tr><th>تاريخ اللقطة</th><th>قيمتها</th><th>المتوقَّع من سابقتها</th>
              <th>الفارق</th><th>التالية</th></tr></thead>
            <tbody>${_snapAnoms.map(a => `<tr>
              <td>${formatDate(a.date)}</td>
              <td class="num text-danger">${formatSAR(a.value)}</td>
              <td class="num">${formatSAR(a.expected)}</td>
              <td class="num text-danger">${a.dropPct.toFixed(1)}%</td>
              <td class="num text-success">${formatSAR(a.next)}</td></tr>`).join('')}</tbody>
          </table></div>
          <span class="small">لتصحيحها نهائياً: افتح صفحة صافي الثروة واحذف اللقطة أو صحّح قيمتها، ثم أعد فتح هذا التبويب.</span>`,
          'warn') : ''}

        ${detailsHtml(`🔬 السلسلة الخام لقيمة أسهمك (${_rawSeries.length} نقطة) — تحقّق بنفسك`, `
          <div class="table-wrapper"><table>
            <thead><tr><th>التاريخ</th><th>قيمة الأسهم</th><th>التغيّر</th>
              <th>معاملاتك بينهما</th><th>غير مفسَّر</th><th>الحالة</th></tr></thead>
            <tbody>${_rawSeries.map((pt, i) => {
              const pr = i ? _rawSeries[i - 1] : null;
              const fl = pr ? _flowsBetween(pr.date, pt.date) : 0;
              const exp = pr ? pr.total_value + fl : null;
              const un  = exp && exp > 0 ? (pt.total_value - exp) / exp * 100 : null;
              const bad = _snapAnoms.some(a => a.date === pt.date);
              return `<tr${bad ? ' style="opacity:.75"' : ''}>
                <td>${formatDate(pt.date)}</td>
                <td class="num">${formatSAR(pt.total_value)}</td>
                <td class="num">${pr ? ((pt.total_value - pr.total_value >= 0 ? '+' : '') + formatSAR(pt.total_value - pr.total_value)) : '—'}</td>
                <td class="num">${pr ? ((fl >= 0 ? '+' : '') + formatSAR(fl)) : '—'}</td>
                <td class="num ${un != null && un < -10 ? 'text-danger' : ''}">${un != null ? un.toFixed(1) + '%' : '—'}</td>
                <td>${bad ? '🩺 مستبعَدة' : (un != null && Math.abs(un) > 10 ? '⚠️ راجعها' : '✅')}</td></tr>`;
            }).join('')}</tbody>
          </table></div>
          <span class="small text-muted">«غير مفسَّر» = تغيّر القيمة بعد خصم مشترياتك ومبيعاتك بين التاريخين.
          العمود يجيب سؤالك مباشرةً: هل للهبوط سبب في محفظتك أم لا.</span>`)}

        ${(() => {
          // حارس تقادم المؤشر: سلسلة تاسي متجمّدة بينما قيمة أسهمك تتقدّم إلى
          // اليوم تمنح محفظتك عائداً لا يناله المؤشر — ألفا مُفبركة بالكامل.
          const lastBm = bmEntries[bmEntries.length - 1];
          const gap = Math.floor((Date.now() - new Date(lastBm.date + 'T00:00:00').getTime()) / 86400000);
          if (gap <= 10) return '';
          return noteHtml('⏰', `<b>سلسلة تاسي متأخّرة ${gap} يوماً</b> (آخر نقطة ${formatDate(lastBm.date)}).
            قيمة أسهمك محسوبة حتى اليوم، فأي حركة سوق بعد ذلك التاريخ تُنسَب إليك ولا تُنسَب للمؤشر —
            أي أن Alpha أعلاه <b>مبالغ فيها بمقدار ما تحرّك السوق في هذه الفجوة</b>.
            اضغط «🔄 جلب تاسي تلقائياً» أعلى التبويب لإغلاقها.`, 'warn');
        })()}

        ${suspiciousPeriods.length ? detailsHtml(
          `🔍 ${suspiciousPeriods.length} فترة بتغيّر كبير غير مُفسَّر — قد تُشوّه TWR`, `
          <div class="stack-2">
            ${noteHtml('💡', 'بعد إعادة التأطير صار التصحيح من <b>معاملاتك</b> لا من التدفقات النقدية، فالسبب الأكثر شيوعاً هنا: <b>عملية شراء أو بيع غير مسجَّلة</b>، أو لقطة صافي ثروة قديمة لا يظهر فيها سطر «أسهم:». سجّل الحركة الناقصة ليُصحَّح الحساب تلقائياً.')}
            <div class="table-wrapper"><table class="bm-susp">
              <thead><tr><th>الفترة</th><th>التغيّر</th><th>التدفق المسجَّل</th><th>قيمة البداية</th><th>قيمة النهاية</th></tr></thead>
              <tbody>${suspiciousPeriods.map(p => `
                <tr>
                  <td class="small">${formatDate(p.startDate)} ← ${formatDate(p.endDate)}</td>
                  <td class="num bold ${p.r >= 0 ? 'text-success' : 'text-danger'}">${p.r >= 0 ? '+' : ''}${p.r}%</td>
                  <td class="num text-muted">${p.netCF !== 0 ? formatSAR(p.netCF, true) : '—'}</td>
                  <td class="num">${formatSAR(p.startVal)}</td>
                  <td class="num">${formatSAR(p.endVal)}</td>
                </tr>`).join('')}</tbody>
            </table></div>
          </div>`) : ''}
      </div>`;
  }
}

// ── معلومات الاستخدام ─────────────────────────────────────────
// AUDIT-FIX (2026-08): كان يبني نافذة يدوياً بألوان سداسية مكتوبة. الآن يستخدم
// openInfoModal المشتركة من utils.js — لا لون خارج رموز التصميم.
function showBenchmarkInfo() {
  openInfoModal('📊 مقارنة محفظتك بمؤشر تاسي', `
    <p><b>كيف تعمل؟</b></p>
    <ul>
      <li>كلا الخطّين مُنسَّبان إلى 100 عند أول نقطة مشتركة.</li>
      <li>الفرق = <b>Alpha</b> — أداؤك الزائد أو الناقص عن السوق.</li>
      <li>خط محفظتك هو <b>TWR</b> (يعزل الإيداعات والسحوبات) ويشمل توزيعاتك،
          لذا يُقارَن بتاسي للعائد الإجمالي (TRI) المُقدَّر لا بالسعري وحده.</li>
    </ul>
    <p><b>🔄 الجلب التلقائي</b></p>
    <ul>
      <li>يستدعي الدالة السحابية <code>update-prices</code> ويطلب سلسلة تاسي التاريخية.</li>
      <li><b>يدمج ولا يستبدل</b>: النقاط الجديدة تُضاف، والقديمة التلقائية تُحدَّث.</li>
      <li><b>✋ نقاطك اليدوية لا تُداس أبداً</b> — تُتجاهَل ويُذكر عددها في التقرير.
          لفكّ حماية نقطة اضغط 🔄 بجانبها في الجدول.</li>
      <li>يحتاج نشر الدالة مرة واحدة: <code>supabase functions deploy update-prices</code>.</li>
    </ul>
    <p><b>الإدخال اليدوي وCSV — يعملان كما هما</b></p>
    <ul>
      <li>صيغة الملف: <code>Date,OPEN,CLOSE</code> أو <code>Date,CLOSE</code>.</li>
      <li>التاريخ: <code>MM/DD/YYYY</code> أو <code>YYYY-MM-DD</code>؛ والأرقام تقبل الفواصل (<code>"10,991.09"</code>).</li>
      <li>الاستيراد يدمج بالتاريخ، وكل ما يأتي من ملفك يُوسَم <b>يدوياً</b> فيُصان.</li>
    </ul>
    <p><b>بيانات المحفظة</b></p>
    <ul>
      <li>مصدرها <code>net_worth_snapshots</code> — تُسجَّل تلقائياً عند فتح لوحة التحكم، أو يدوياً من صفحة صافي الثروة.</li>
    </ul>`);
}

// ══════════════════════════════════════════════════════════════
// 📥 استيراد وتصدير CSV لبيانات تاسي
// الصيغة: Date,OPEN,CLOSE  (أو Date,CLOSE)  —  MM/DD/YYYY أو YYYY-MM-DD
// ══════════════════════════════════════════════════════════════

// البيانات التاريخية المضمنة (إغلاقات أسبوعية — Tadawul All Share)
// تُستخدم كـ seed تلقائي عند أول فتح للتبويب بدون بيانات
const TASI_SEED = [
  { date:'2025-06-08', value:10810.04 },{ date:'2025-06-15', value:10429.11 },
  { date:'2025-06-22', value:10572.64 },{ date:'2025-06-29', value:11094.65 },
  { date:'2025-07-06', value:11211.82 },{ date:'2025-07-13', value:10977.62 },
  { date:'2025-07-20', value:10831.35 },{ date:'2025-07-27', value:10779.11 },
  { date:'2025-08-03', value:10725.34 },{ date:'2025-08-10', value:10745.82 },
  { date:'2025-08-17', value:10831.26 },{ date:'2025-08-24', value:10732.31 },
  { date:'2025-08-31', value:10611.95 },{ date:'2025-09-07', value:10421.08 },
  { date:'2025-09-14', value:10366.59 },{ date:'2025-09-21', value:10758.92 },
  { date:'2025-09-28', value:11213.66 },{ date:'2025-10-05', value:11509.99 },
  { date:'2025-10-12', value:11320.27 },{ date:'2025-10-19', value:11492.03 },
  { date:'2025-10-26', value:11590.03 },{ date:'2025-11-02', value:11256.74 },
  { date:'2025-11-09', value:11177.66 },{ date:'2025-11-16', value:10977.78 },
  { date:'2025-11-23', value:10576.48 },{ date:'2025-11-30', value:10499.19 },
  { date:'2025-12-07', value:10574.86 },{ date:'2025-12-14', value:10376.54 },
  { date:'2025-12-21', value:10449.01 },{ date:'2025-12-28', value:10339.14 },
  { date:'2026-01-04', value:10281.49 },{ date:'2026-01-11', value:10502.67 },
  { date:'2026-01-18', value:10844.48 },{ date:'2026-01-25', value:11139.01 },
  { date:'2026-02-01', value:11022.14 },{ date:'2026-02-08', value:11130.45 },
  { date:'2026-02-15', value:10929.79 },{ date:'2026-02-22', value:10703.70 },
  { date:'2026-03-01', value:10193.83 },{ date:'2026-03-08', value:10779.55 },
  { date:'2026-03-15', value:10779.03 },{ date:'2026-03-22', value:10880.50 },
  { date:'2026-03-29', value:11067.76 },{ date:'2026-04-05', value:11086.26 },
  { date:'2026-04-12', value:11269.41 },{ date:'2026-04-19', value:11102.31 },
  { date:'2026-04-26', value:11072.77 },{ date:'2026-05-03', value:10949.27 },
  { date:'2026-05-10', value:10992.76 },{ date:'2026-05-17', value:10933.53 },
  { date:'2026-05-31', value:10991.09 },
];

// ── دمج مع البيانات الموجودة (upsert بالتاريخ) ───────────────
// defaultSrc: مصدر النقاط الواردة — 'manual' للاستيراد من CSV (إدخال بشري
// يُصان)، و'seed' للبيانات المضمّنة (تُستبدَل لاحقاً بالجلب التلقائي).
function _mergeBenchmark(newEntries, defaultSrc = 'manual') {
  const map = {};
  _loadBenchmark().forEach(e => { map[e.date] = e; });
  _bmNormalize(newEntries.map(e => ({ ...e, src: e.src || defaultSrc })))
    .forEach(e => { map[e.date] = e; });   // الجديد يُغلّب القديم
  const merged = _bmNormalize(Object.values(map));
  _saveBenchmark(merged);
  return merged.length;
}

// ══════════════════════════════════════════════════════════════
// 🔄 جلب تاسي تلقائياً من الدالة السحابية update-prices
// ──────────────────────────────────────────────────────────────
// العقد (ثابت):
//   invoke('update-prices', { body: { tasiHistory: true, range: '1y'|'2y'|'5y' } })
//   ⇒ data.tasi = { symbol, points: [{date:'YYYY-MM-DD', value: 12102.55}, …], count }
//   أو عند الفشل: data.tasi = { error: '…', tried: [ …مصادر مُجرَّبة… ] }
// شكل النقطة يطابق التخزين القائم في tharwa-benchmark_v1 بالضبط.
//
// قاعدة التعارض: النقطة اليدوية (src='manual') لا تُداس أبداً. تُحتسب ضمن
// «تجاهَل» في التقرير، ويستطيع المالك فكّها بزر ✋ في الجدول.
// ══════════════════════════════════════════════════════════════
let _tasiFetching   = false;
let _tasiLastReport = null;   // { added, updated, skippedManual, unchanged, from, to, range }
let _tasiLastError  = null;   // نص الخطأ — يبقى معروضاً حتى نجاح لاحق

function _mergeAutoTasi(points) {
  const byDate = {};
  _loadBenchmark().forEach(e => { byDate[e.date] = e; });

  let added = 0, updated = 0, skippedManual = 0, unchanged = 0;
  for (const p of points) {
    const cur = byDate[p.date];
    if (!cur) { byDate[p.date] = { date: p.date, value: p.value, src: 'auto' }; added++; continue; }
    if (_bmSrcOf(cur) === 'manual') { skippedManual++; continue; }   // ✋ يصونه المالك عمداً
    if (Math.abs(cur.value - p.value) > 1e-9) updated++; else unchanged++;
    byDate[p.date] = { date: p.date, value: p.value, src: 'auto' };
  }
  const merged = _bmNormalize(Object.values(byDate));
  _saveBenchmark(merged);
  return { added, updated, skippedManual, unchanged, total: merged.length };
}

async function fetchTasiAuto() {
  if (_tasiFetching) return;
  const range = document.getElementById('bm-range')?.value || '5y';
  const btn   = document.getElementById('bm-fetch-btn');
  _tasiFetching = true;
  if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = '⏳ جارٍ الجلب…'; }

  try {
    const { data, error } = await supabaseClient.functions.invoke('update-prices', {
      body: { tasiHistory: true, range, priceHistory: true },
    });
    if (error) throw new Error(error.message || 'تعذّر الاتصال بالدالة السحابية update-prices');

    const t = data?.tasi;
    if (!t) throw new Error('الدالة السحابية ردّت بلا حقل tasi — الأرجح أن النسخة المنشورة لا تدعم tasiHistory بعد.');
    if (t.error) {
      throw new Error(t.error + (Array.isArray(t.tried) && t.tried.length
        ? ` (المصادر المُجرَّبة: ${t.tried.join('، ')})` : ''));
    }

    const pts = _bmNormalize(t.points).map(p => ({ date: p.date, value: p.value }));
    if (!pts.length) throw new Error('لم تُرجِع الدالة أي نقطة صالحة (تاريخ ISO + قيمة موجبة).');

    // تاريخ الأسعار يُحفَظ إن عاد — فشله لا يُسقط جلب تاسي (كلٌّ مستقلّ)
    const ph = data?.priceHistory;
    if (ph && ph.bySymbol && Object.keys(ph.bySymbol).length) {
      _priceHist = ph;
      const okN = Object.values(ph.bySymbol).filter(v => v && Array.isArray(v.p) && v.p.length).length;
      try { await saveUserSetting(PRICE_HIST_KEY, ph); } catch (_) {}
      showToast(`✓ أسعار تاريخية: ${okN} من ${Object.keys(ph.bySymbol).length} رمزاً`,
                okN ? 'success' : 'error');
    }

    const r = _mergeAutoTasi(pts);
    _tasiLastError  = null;
    _tasiLastReport = { ...r, range, from: pts[0].date, to: pts[pts.length - 1].date, fetched: pts.length };

    const bits = [`أُضيفت ${r.added}`, `حُدِّثت ${r.updated}`];
    if (r.skippedManual) bits.push(`تُجوهِلت ${r.skippedManual} يدوية ✋`);
    showToast(`✓ تاسي: ${bits.join(' · ')} — الإجمالي ${r.total} نقطة`, 'success');
  } catch (e) {
    _tasiLastError  = e?.message || String(e);
    _tasiLastReport = null;
    console.error('[performance] fetchTasiAuto', e);
    showToast('⚠️ تعذّر جلب تاسي تلقائياً — التفاصيل في التبويب', 'error');
  } finally {
    _tasiFetching = false;
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || '🔄 جلب تاسي تلقائياً'; }
    renderBenchmarkTab();
  }
}

// ── تحليل صف CSV (يتعامل مع القيم المحاطة بعلامات تنصيص) ────
function _parseCSVRow(line) {
  const cols = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // RFC 4180: "" = علامة تنصيص حرفية داخل حقل مقتبس
      if (inQ && i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
    else { cur += ch; }
  }
  cols.push(cur);
  return cols.map(c => c.trim());
}

// ── تحويل التاريخ إلى ISO (YYYY-MM-DD) ───────────────────────
function _toISODate(raw) {
  raw = (raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;           // YYYY-MM-DD ✓
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);    // MM/DD/YYYY
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  return null;
}

// ── تحليل ملف CSV كامل ───────────────────────────────────────
function _parseTasiCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('الملف فارغ أو لا يحتوي على بيانات');

  const headers = _parseCSVRow(lines[0]).map(h => h.toLowerCase());
  const dateIdx  = headers.findIndex(h => h.includes('date'));
  // CLOSE له أولوية على OPEN
  let closeIdx = headers.findIndex(h => h === 'close' || h === 'close ');
  if (closeIdx === -1) closeIdx = headers.findIndex(h => h.includes('close'));
  if (closeIdx === -1) closeIdx = headers.findIndex(h => h.includes('value'));

  if (dateIdx === -1)  throw new Error('عمود Date غير موجود في الملف');
  if (closeIdx === -1) throw new Error('عمود CLOSE غير موجود في الملف');

  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const cols  = _parseCSVRow(lines[i]);
    const raw   = cols[dateIdx] || '';
    const rawV  = (cols[closeIdx] || '').replace(/,/g, '');
    const value = parseFloat(rawV);
    const date  = _toISODate(raw);
    if (date && !isNaN(value) && value > 0) entries.push({ date, value });
  }
  return entries;
}

// ── زر: استيراد CSV ──────────────────────────────────────────
function importBenchmarkFromCSV(input) {
  if (!input.files?.length) return;
  const file   = input.files[0];
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = _parseTasiCSV(e.target.result);
      if (!parsed.length) { showToast('لم تُعثر على بيانات صالحة في الملف', 'error'); return; }
      // ملف يرفعه المالك = إدخال بشري ⇒ 'manual' فيُصان من الجلب التلقائي
      const total = _mergeBenchmark(parsed, 'manual');
      showToast(`✓ تم استيراد ${parsed.length} نقطة — الإجمالي: ${total}`, 'success');
      renderBenchmarkTab();
    } catch (err) {
      showToast('خطأ: ' + err.message, 'error');
    }
    input.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}

// ── زر: تصدير CSV ────────────────────────────────────────────
function exportBenchmarkCSV() {
  const entries = _loadBenchmark();
  if (!entries.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }

  const BOM   = '﻿';
  const lines = ['Date,CLOSE'];
  entries.forEach(e => {
    // YYYY-MM-DD → MM/DD/YYYY
    const [yr, mo, dy] = e.date.split('-');
    const d = `${mo}/${dy}/${yr}`;
    const v = `"${e.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}"`;
    lines.push(`${d},${v}`);
  });

  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `tasi_benchmark_${todayISO()}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast(`✓ تم تصدير ${entries.length} نقطة`, 'success');
}

// ── تهيئة التبويب عند أول فتح ────────────────────────────────
const BM_SEEDED_KEY = 'tharwa-benchmark-seeded-v1';  // flag: هل تم الـ seed؟
const BM_SRC_MIGRATED_KEY = 'tharwa-benchmark-src-migrated-v1';

// ترحيل مصدر النقاط (مرة واحدة): النقاط المخزَّنة بلا src تُعامَل يدوية افتراضاً،
// لكن ما طابق TASI_SEED تاريخاً **وقيمةً بالضبط** فهو من الـ seed لا من يد المالك
// ⇒ يُوسَم 'seed' فيجوز للجلب التلقائي تحديثه بقيمة أدقّ. أي نقطة أخرى تبقى
// محميّة كـ 'manual' — الافتراض الأكثر صوناً لعمل المالك.
function _bmMigrateSources() {
  if (localStorage.getItem(userLsKey(BM_SRC_MIGRATED_KEY))) return;
  try {
    const seedMap = {};
    TASI_SEED.forEach(s => { seedMap[s.date] = s.value; });
    const raw = JSON.parse(localStorage.getItem(userLsKey(BM_KEY))) || [];
    if (raw.length) {
      const migrated = raw.map(e => {
        if (e && e.src) return e;                                  // مُوسَّم أصلاً
        const seedVal = seedMap[e?.date];
        const isSeed  = seedVal != null && Math.abs(+e.value - seedVal) < 1e-9;
        return { date: e.date, value: +e.value, src: isSeed ? 'seed' : 'manual' };
      });
      localStorage.setItem(userLsKey(BM_KEY), JSON.stringify(_bmNormalize(migrated)));
    }
    localStorage.setItem(userLsKey(BM_SRC_MIGRATED_KEY), '1');
  } catch (_) {}
}

async function initBenchmarkTab() {
  const dateInp = document.getElementById('bm-date');
  if (dateInp && !dateInp.value) dateInp.value = todayISO();

  // AUDIT-FIX (2026-08): ترحيل المفاتيح القديمة غير المخصوصة بالمستخدم (مرة واحدة)
  _bmMigrateLegacyKey(BM_KEY);
  _bmMigrateLegacyKey(BM_SEEDED_KEY);
  _bmMigrateSources();

  // ══════════════════════════════════════════════════════════════
  // AUDIT-FIX (2026-08-21) — فقدان بيانات أحادي الاتجاه:
  // حارس البذرة (BM_SEEDED_KEY) محليّ، فعلى أي متصفح جديد كان يُعتبر «لم يُبذَر»
  // فتُدمج 51 نقطة البذرة مع محليّ فارغ، ثم يستبدل _saveBenchmark قيمة المفتاح
  // السحابي **كاملةً** عبر upsert — فتُمحى سلسلة تاسي السحابية (1200+ نقطة)
  // بما فيها نقاط المالك اليدوية ✋. وكان ذلك يقع **قبل** انتهاء
  // _syncBenchmarkFromSupabase، وهي تسحب من السحابة إلى المحلي ولا تدفع أبداً
  // — فالبتر لا يُصلَح ذاتياً.
  // الآن: السحابة أولاً وبانتظار، ولا تُبذَر البذرة إلا إذا بقي السجل فارغاً.
  // ══════════════════════════════════════════════════════════════
  try { await _syncBenchmarkFromSupabase(); } catch (_) { /* بلا شبكة: نكمل محلياً */ }

  if (!localStorage.getItem(userLsKey(BM_SEEDED_KEY))) {
    const existing = _loadBenchmark();
    if (!existing.length) {
      _mergeBenchmark(TASI_SEED, 'seed');
      showToast(`✓ تم تحميل ${TASI_SEED.length} إغلاق أسبوعي لتاسي مضمّناً (${TASI_SEED[0].date} → ${TASI_SEED[TASI_SEED.length-1].date})`, 'success');
    }
    // يُرفع العلم في الحالتين: وجود سجل سحابي يعني أن البذرة لم تعد مطلوبة أصلاً
    localStorage.setItem(userLsKey(BM_SEEDED_KEY), '1');
    localStorage.setItem(userLsKey(BM_SRC_MIGRATED_KEY), '1');
  }

  renderBenchmarkTab();
}

init();
