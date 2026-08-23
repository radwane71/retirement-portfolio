let watchlist    = [];
let userStocks   = [];
let holdings     = [];
let sectorTargets = {};   // sector → target_pct
let engineCfg    = {};    // ticker → مدخلات محرّك القرار (منها علم «قيادي» blueChip)
let editingWlId  = null;

// الأسقف الدستورية (CLAUDE.md §1) — نفس ثوابت محرّك القرار (decision-engine.js)
// ══════════════════════════════════════════════════════════════════════
// تحديث الأسقف — قرار المالك 2026-08-23
// ----------------------------------------------------------------------
// السقف صار **15% لكل سهم بلا استثناء**، وتمييز «القيادي» بسقف أعلى أُلغي:
// الثابتان متساويان عمداً. علم `blueChip` باقٍ لأن triggers المالك تشير
// إليه (أرامكو)، لكنه لم يعد يرفع سقفاً. حجم المحفظة 15–20 سهماً،
// وعدد القطاعات المستهدف 8 فأكثر. ⚠️ المصدر: CLAUDE.md §1.
// ══════════════════════════════════════════════════════════════════════
const WL_CAP_SINGLE   = 15;    // سقف السهم الواحد — لكل الأسهم
const WL_CAP_BLUECHIP = 15;    // مساوٍ عمداً: تمييز القيادي أُلغي
const WL_CAP_BUFFER   = 0.75;  // منطقة سماح السهم
const WL_CAP_SECTOR   = 25;    // سقف القطاع
const WL_SECTOR_BUFFER = 1.25; // منطقة سماح القطاع

// هل السهم قيادي؟ — نفس منطق decision-engine.js: علم blueChip اليدوي من
// إعدادات المحرّك (decision_engine_v1)، وأرامكو 2222 قيادية افتراضياً.
function wlIsBlueChip(ticker) {
  const cfg = engineCfg[ticker] || {};
  if (cfg.blueChip === true)  return true;
  if (cfg.blueChip === false) return false;
  return ticker === '2222';
}
let _baseDiv     = null;  // تنويع المحفظة الحالية (computeDiversification) — مرجع المقارنة
let _livePrices  = {};    // ticker → سعر اليوم اللحظي (من Yahoo عبر Edge Function)
let _livePricesLoading = false;

// حجم المحفظة المستهدف (CLAUDE.md §1) — عرض فقط، لا يدخل أي حكم
const WL_SIZE_MIN = 18;
const WL_SIZE_MAX = 25;

// ══════════════════════════════════════════════════════════════════════
// جسر رموز التصميم — منسوخ حرفياً من أعلى js/dashboard.js
// (هذه الصفحة لا تحمّل dashboard.js). أي تعديل هناك يجب أن ينعكس هنا.
// قاعدة ثابتة: لا لون مكتوب يدوياً — كل لون يُقرأ من متغيّر CSS.
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

// حالة منطقة التنويع مشتقّة من gaugePos — نفس عتبات computeDiversification
// في utils.js، لكن كوسم حالة (good/warn/bad) بدل لون سداسي مباشر.
function wlZoneState(gaugePos) {
  return gaugePos >= 60 ? 'good' : gaugePos >= 40 ? 'warn' : 'bad';
}

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'watchlist': {
    title: '👁️ أسهم تحت المراقبة',
    body: `
      <p>مكان لتسجيل الأسهم التي تدرس شراءها قبل اتخاذ القرار — سعر الدخول المستهدف، النسبة التي تخطط لها، وسبب اهتمامك.</p>
      <div class="info-formula">عمود «الأثر» = كم سيتغيّر مقياس تنويع محفظتك لو أضفت هذا السهم بالنسبة المخططة</div>
      <p>يحاكي النظام إضافة السهم لمحفظتك الحالية ويعيد حساب التنويع (نفس مقياس لوحة التحكم):</p>
      <div class="info-math">
        🟢 يرفع التنويع (قطاع جديد / يقلّل التركّز) — إشارة إيجابية<br>
        🔴 يخفض التنويع (يضخّم قطاعاً مهيمناً / مركز كبير >15%) — انتبه<br>
        ⚪ أثر طفيف
      </div>
      <p class="info-note">💡 «أراقب» لا يعني «سأشتري» — استخدم منطقة الدخول المستهدفة وعمود الأثر لتقرّر بعقل لا بحماس.</p>`
  },
};

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-watchlist');
  await loadAll();
  renderContext();
  renderTable();
  refreshWatchlistPrices();   // جلب سعر اليوم اللحظي لكل رمز (نفس آلية لوحة التحكم)
}

// ══════════════════════════════════════════════════════════════════════
// 💹 سعر اليوم اللحظي — نفس Edge Function المستخدمة في لوحة التحكم
// (update-prices) لكن نمرّر رموز قائمة المراقبة في جسم الطلب. هذه الأسعار
// تُعرَض فقط ولا تُحفظ في holdings. أي سهم يُضاف مستقبلاً يُجلب سعره تلقائياً.
// ══════════════════════════════════════════════════════════════════════
async function refreshWatchlistPrices() {
  const tickers = [...new Set(watchlist.map(w => w.ticker).filter(Boolean))];
  if (!tickers.length) return;

  _livePricesLoading = true;
  renderTable();   // أظهر «جارٍ…» في عمود سعر اليوم

  try {
    const { data: json, error } = await supabaseClient.functions.invoke('update-prices', {
      body: { tickers },
    });
    if (error) throw error;
    if (json?.prices) {
      Object.entries(json.prices).forEach(([t, p]) => { _livePrices[t] = +p; });
    }
  } catch (e) {
    console.warn('refreshWatchlistPrices error:', e);
  } finally {
    _livePricesLoading = false;
    renderTable();
  }
}

// ── خلية «سعر اليوم» داخل الجدول ─────────────────────────────
function livePriceCell(w) {
  const p = _livePrices[w.ticker];
  if (p == null) {
    return _livePricesLoading
      ? '<span class="small text-muted">⏳</span>'
      : '<span class="small text-muted">—</span>';
  }
  // مقارنةً بسعر الدخول المستهدف: عند/تحت الهدف = فرصة. أيقونة + نص لا لون وحده.
  if (!(w.target_price > 0)) {
    return `<span class="num bold">${formatSAR(p)}</span>`;
  }
  if (p <= w.target_price) {
    const disc = (w.target_price - p) / w.target_price * 100;
    return `<span class="num bold text-success" title="السعر عند هدف الدخول أو أقل">${formatSAR(p)}</span>
            <div class="lp-sub">✅ عند الهدف${disc >= 0.05 ? ` −${disc.toFixed(1)}%` : ''}</div>`;
  }
  const gap = (p - w.target_price) / w.target_price * 100;
  return `<span class="num bold text-accent" title="أعلى من هدف الدخول بـ ${gap.toFixed(1)}%">${formatSAR(p)}</span>
          <div class="lp-sub">▲ فوق الهدف +${gap.toFixed(1)}%</div>`;
}

async function loadAll() {
  const [rWl, rUs, rH, rSec, rEng] = await Promise.all([
    supabaseClient.from('watchlist').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('user_stocks').select('ticker, name, sector'),
    supabaseClient.from('holdings').select('ticker, name, sector, shares, current_price'),
    supabaseClient.from('sector_targets').select('sector, target_pct'),
    loadUserSetting('decision_engine_v1'),   // أعلام «قيادي» — نفس مصدر محرّك القرار
  ]);
  watchlist  = rWl.data || [];
  userStocks = rUs.data || [];
  holdings   = rH.data  || [];
  engineCfg  = rEng || {};
  sectorTargets = {};
  (rSec.data || []).forEach(r => { sectorTargets[r.sector] = +r.target_pct; });

  // مرجع المقارنة — يُعاد حسابه من المحفظة الحية في كل تحميل (يحدّث نفسه تلقائياً)
  _baseDiv = computeDiversification(holdings.map(h => ({
    value:  +h.shares * +h.current_price,
    sector: h.sector,
    label:  h.ticker,
  })));
}

// ── ملء الاسم والقطاع تلقائياً عند إدخال الرمز ──────────────
function onTickerInput() {
  const ticker = document.getElementById('wl-ticker').value.trim().toUpperCase();
  document.getElementById('wl-ticker').value = ticker;
  const stock = userStocks.find(s => s.ticker === ticker);
  if (stock) {
    document.getElementById('wl-name').value   = stock.name;
    document.getElementById('wl-sector').value = stock.sector;
  } else {
    // جرب TICKER_DB كاحتياطي
    const fallback = typeof lookupTicker === 'function' ? lookupTicker(ticker) : null;
    if (fallback) {
      document.getElementById('wl-name').value   = fallback.name;
      document.getElementById('wl-sector').value = fallback.sector || '';
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// 🧠 محرك تحليل أثر التنويع — يحاكي إضافة السهم للمحفظة الحالية
// يستخدم نفس دالة المقياس في لوحة التحكم (computeDiversification) لضمان
// التطابق التام، ويقرأ أهداف القطاعات الحية فيتحدث تلقائياً مع أي تغيير.
// ══════════════════════════════════════════════════════════════════════
function analyzeWatchImpact(w) {
  if (!_baseDiv) return null;            // لا توجد محفظة بعد — لا مرجع للمقارنة
  const V   = _baseDiv.totalVal;
  const sec = (w.sector || '').trim() || 'غير مصنف';
  const held = holdings.find(h => h.ticker === w.ticker);

  // الوزن المخطط (نسبة من المحفظة). إن لم يُحدَّد → افترض وزناً متساوياً
  const rawPct  = +w.planned_pct || 0;
  const assumed = rawPct <= 0;
  const p = assumed ? 1 / (_baseDiv.n + 1) : Math.min(rawPct / 100, 0.9);
  if (p <= 0) return null;

  // ── بناء مراكز المحاكاة ──────────────────────────────────────
  let simPositions, addVal;
  // AUDIT (2026-08): عَلَم إفصاح فقط — يُرفع حين تُهمَل النسبة المخططة لأنها
  // أقل من الوزن الحالي فيُستبدَل بها شريحة متساوية. لا يغيّر أي رقم؛ يمنع
  // فقط أن يكون الاستبدال صامتاً (CLAUDE.md §8: لا تقدير بيانات بصمت).
  let substituted = false;
  if (held) {
    // سهم مملوك بالفعل → تجميع: نرفع وزنه إلى الهدف المخطط
    const curVal   = +held.shares * +held.current_price;
    const other    = V - curVal;
    const finalVal = p * other / (1 - p);          // قيمة تجعل وزنه النهائي = p
    addVal = Math.max(0, finalVal - curVal);
    if (addVal <= 0) { addVal = V / _baseDiv.n; substituted = true; }   // الوزن المخطط أقل من الحالي → شريحة متساوية
    simPositions = holdings.map(h => ({
      value:  +h.shares * +h.current_price + (h.ticker === w.ticker ? addVal : 0),
      sector: h.sector, label: h.ticker,
    }));
  } else {
    // سهم جديد → نضيف مركزاً وزنه p
    addVal = p * V / (1 - p);
    simPositions = [
      ...holdings.map(h => ({ value: +h.shares * +h.current_price, sector: h.sector, label: h.ticker })),
      { value: addVal, sector: sec, label: w.ticker },
    ];
  }

  const after      = computeDiversification(simPositions);
  const deltaGauge = after.gaugePos - _baseDiv.gaugePos;

  // أوزان ما بعد الإضافة
  const newTotal        = V + addVal;
  const posWeightAfter  = (held ? (+held.shares * +held.current_price + addVal) : addVal) / newTotal * 100;
  const secWeightBefore = (_baseDiv.secMap[sec] || 0) * 100;
  const secWeightAfter  = (after.secMap[sec] || 0) * 100;
  const isNewSector     = !_baseDiv.secMap[sec];
  const secTarget       = +sectorTargets[sec] || 0;
  const overTarget      = secTarget > 0 && secWeightAfter > secTarget + 0.05;
  const bigPosition     = posWeightAfter > 15;     // TARGET_TOP1 = 15% (نفس معيار لوحة التحكم)

  // AUDIT-FIX (2026-08): الأسقف الدستورية (CLAUDE.md §1) على الوزن المتوقع بعد الشراء —
  // كانت غائبة عن التحليل: سقف السهم 7% (قيادي 12%) + سماح 0.75، وسقف القطاع 25% + سماح 1.25
  const blueChip     = wlIsBlueChip(w.ticker);
  const singleCap    = blueChip ? WL_CAP_BLUECHIP : WL_CAP_SINGLE;
  const overCap      = posWeightAfter > singleCap + WL_CAP_BUFFER;
  const overSectorCap = secWeightAfter > WL_CAP_SECTOR + WL_SECTOR_BUFFER;

  // ── بناء الأسباب (لغة محلل) ──────────────────────────────────
  const reasons = [];
  if (deltaGauge >= 2)      reasons.push({ t: 'pos', txt: `يرفع مقياس التنويع بمقدار +${deltaGauge} نقطة (${_baseDiv.gaugePos} → ${after.gaugePos})` });
  else if (deltaGauge <= -2) reasons.push({ t: 'neg', txt: `يخفض مقياس التنويع بمقدار ${deltaGauge} نقطة (${_baseDiv.gaugePos} → ${after.gaugePos})` });
  else                       reasons.push({ t: 'neu', txt: `أثر طفيف على المقياس (${deltaGauge >= 0 ? '+' : ''}${deltaGauge} نقطة)` });

  if (isNewSector)          reasons.push({ t: 'pos', txt: `يفتح قطاعاً جديداً (${sec}) — يحسّن التنويع القطاعي ويقلّل الارتباط` });
  else if (overTarget)      reasons.push({ t: 'neg', txt: `يرفع وزن قطاع «${sec}» إلى ${secWeightAfter.toFixed(1)}% متجاوزاً هدفك ${secTarget.toFixed(1)}%` });
  else if (secTarget > 0)   reasons.push({ t: 'neu', txt: `وزن قطاع «${sec}» سيصبح ${secWeightAfter.toFixed(1)}% (هدفك ${secTarget.toFixed(1)}% — ضمن النطاق)` });
  else                      reasons.push({ t: 'neu', txt: `يُضاف إلى قطاع «${sec}» الموجود (${secWeightBefore.toFixed(1)}% → ${secWeightAfter.toFixed(1)}%)` });

  if (overCap)              reasons.push({ t: 'neg', txt: `يكسر سقف السهم الدستوري: وزنه بعد الشراء ${posWeightAfter.toFixed(1)}% يتجاوز ${singleCap}%${blueChip ? ' (قيادي — سقف 12%)' : ''} + منطقة السماح ${WL_CAP_BUFFER}% (CLAUDE.md §1)` });
  if (overSectorCap)        reasons.push({ t: 'neg', txt: `يكسر سقف القطاع الدستوري: قطاع «${sec}» سيصبح ${secWeightAfter.toFixed(1)}% متجاوزاً ${WL_CAP_SECTOR}% + منطقة السماح ${WL_SECTOR_BUFFER}% (CLAUDE.md §1)` });
  if (bigPosition)          reasons.push({ t: 'neg', txt: `مركز كبير: وزنه المخطط ${posWeightAfter.toFixed(1)}% يتجاوز 15% — قد يصبح من أكبر مراكزك ويرفع التركيز` });
  if (held)                 reasons.push({ t: 'neu', txt: `هذا السهم موجود في محفظتك — التحليل يفترض رفع وزنه إلى ${posWeightAfter.toFixed(1)}%` });
  if (substituted)          reasons.push({ t: 'neu', txt: `النسبة المخططة (${rawPct.toFixed(1)}%) أقل من وزنه الحالي، فلا تعني إضافة — استبدلها التحليل بشريحة متساوية وصار الوزن المحسوب ${posWeightAfter.toFixed(1)}%` });

  // ── الحكم النهائي ────────────────────────────────────────────
  // اللون صار حالة (good/warn/bad) تُقرأ من رموز التصميم بدل قيمة سداسية.
  let verdict, label, state, icon;
  if (overTarget || bigPosition || overCap || overSectorCap || deltaGauge <= -2) {
    if (isNewSector && deltaGauge >= 0 && !bigPosition && !overCap && !overSectorCap) {
      verdict = 'caution'; label = 'إضافة بتحفّظ'; state = 'warn'; icon = '⚠️';
    } else {
      verdict = 'negative'; label = 'يزيد التركيز'; state = 'bad'; icon = '🔻';
    }
  } else if (isNewSector || deltaGauge >= 2) {
    verdict = 'positive'; label = 'يحسّن التنويع'; state = 'good'; icon = '✅';
  } else {
    verdict = 'neutral'; label = 'أثر محايد'; state = ''; icon = '➖';
  }

  return {
    verdict, label, state, icon, deltaGauge,
    assumed, substituted, rawPct, plannedPct: p * 100, posWeightAfter,
    sec, isNewSector, secTarget, secWeightBefore, secWeightAfter, overTarget, bigPosition, held: !!held,
    blueChip, singleCap, overCap, overSectorCap,
    before: _baseDiv, after, reasons,
  };
}

// ── شارة الأثر المختصرة (داخل الجدول) ────────────────────────
// وسم .tag قابل للنقر — نفس مفردات الحالة في بقية اللوحة.
function impactBadge(w) {
  const a = analyzeWatchImpact(w);
  if (!a) return '<span class="small text-muted">—</span>';
  const deltaStr = `${a.deltaGauge >= 0 ? '+' : ''}${a.deltaGauge}`;
  const caps = (a.overCap || a.overSectorCap)
    ? `<div class="mini-warn" title="الوزن المتوقع بعد الشراء يكسر سقفاً دستورياً (CLAUDE.md §1)">⛔ يكسر سقفاً دستورياً</div>` : '';
  return `<button type="button" class="tag tag-btn"${a.state ? ` data-state="${a.state}"` : ''}
            onclick="openImpactModal('${esc(w.id)}')" title="اضغط لعرض التحليل المفصّل">
            ${a.icon} ${a.label} <span class="tag-d">· Δ${deltaStr}</span>
          </button>${caps}`;
}

// ── بطاقة سياق المحفظة الحالية (أعلى الجدول) ─────────────────
function renderContext() {
  const el = document.getElementById('wl-context');
  if (!el) return;
  if (!_baseDiv) {
    el.innerHTML = `<div class="card mb-4">
      ${cardHead('🧩 تنويع محفظتك الحالية', 'مرجع المقارنة')}
      ${noteHtml('💡', 'لا توجد أسهم في محفظتك بعد — أضف معاملات في <a href="transactions.html" class="link-accent">سجل المعاملات</a> لتفعيل تحليل أثر كل سهم مراقَب على تنويع محفظتك.', '')}
    </div>`;
    return;
  }
  const d      = _baseDiv;
  const zState = wlZoneState(d.gaugePos);
  const nState = d.n >= WL_SIZE_MIN && d.n <= WL_SIZE_MAX ? 'good' : 'warn';
  el.innerHTML = `<div class="card mb-4">
    ${cardHead('🧩 تنويع محفظتك الحالية', 'مرجع المقارنة لكل سهم في القائمة',
      '<a href="dashboard.html" class="small link-accent">المقياس الكامل ←</a>')}
    <div class="wl-ctx">
      <div class="wl-ctx-hero">
        <div class="hero-num">${d.gaugePos}<span class="unit">/100</span></div>
        <div class="hero-cap">مؤشر التنويع</div>
        <div class="mt-2">${tagHtml(zState === 'good' ? '✅' : zState === 'warn' ? '⚠️' : '🔴', d.zoneLabel, zState)}</div>
      </div>
      <div class="wl-ctx-kv">
        ${kvsHtml([
          ['عدد فعّال (N فعّال)', d.effectiveN],
          ['عدد الأسهم', `${d.n}`],
          ['القطاعات', d.sectorCount],
          ['أكبر مركز', `${d.top1Pct.toFixed(1)}% — ${esc(d.top1Name)}`],
        ])}
        <div class="mt-2">${tagHtml(nState === 'good' ? '✅' : '⚠️', `حجم المحفظة ${d.n} سهم (المستهدف ${WL_SIZE_MIN}–${WL_SIZE_MAX})`, nState)}</div>
      </div>
    </div>
    ${noteHtml('ℹ️', 'كل سهم في القائمة يُحلَّل بمحاكاة إضافته بوزنه المخطط، ثم يُقارن بمقياس التنويع نفسه الموجود في لوحة التحكم — ومعه فحص الأسقف الدستورية (سهم 7% · قيادي 12% · قطاع 25%).', '')}
  </div>`;
}

// ── رسم الجدول ───────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('wl-tbody');
  if (!tbody) return;

  if (!watchlist.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">
      <div class="icon">👁️</div>
      <p>لا توجد أسهم تحت المراقبة — أضف أول سهم</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = watchlist.map(w => {
    const tpStr = +w.target_price > 0 ? formatSAR(w.target_price) : '<span class="text-muted">—</span>';
    // النسبة المخططة بلا قيمة تعني «وزن متساوٍ مفترَض» في تحليل الأثر — نُعلنها
    const ppStr = +w.planned_pct  > 0
      ? `${(+w.planned_pct).toFixed(1)}%`
      : '<span class="text-muted">—</span><div class="lp-sub">وزن متساوٍ مفترَض</div>';
    return `<tr>
      <td><strong class="text-accent">${esc(w.ticker)}</strong></td>
      <td>${esc(w.name)}</td>
      <td class="small text-muted">${esc(w.sector || '—')}</td>
      <td class="num">${tpStr}</td>
      <td class="num">${livePriceCell(w)}</td>
      <td class="num text-accent">${ppStr}</td>
      <td class="impact-cell">${impactBadge(w)}</td>
      <td class="small text-muted notes-cell" title="${esc(w.notes || '')}">${esc(w.notes || '—')}</td>
      <td class="small text-muted num">${w.created_at ? new Date(w.created_at).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—'}</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="openModal('${esc(w.id)}')">تعديل</button>
          <button class="btn btn-danger btn-sm"    onclick="deleteItem('${esc(w.id)}')">حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── نافذة التحليل المفصّل ─────────────────────────────────────
function openImpactModal(id) {
  const w = watchlist.find(x => x.id === id);
  if (!w) return;
  const a = analyzeWatchImpact(w);
  if (!a) { showToast('لا توجد محفظة حالية لتحليل الأثر', 'error'); return; }

  const reasonRow = r => {
    const st = r.t === 'pos' ? 'good' : r.t === 'neg' ? 'bad' : '';
    const ic = r.t === 'pos' ? '▲' : r.t === 'neg' ? '▼' : '•';
    return `<li class="rsn"><span class="rsn-i"${st ? ` data-state="${st}"` : ''}>${ic}</span>
      <span>${esc(r.txt)}</span></li>`;
  };

  const secTargetStr = a.secTarget > 0 ? `هدفك ${a.secTarget.toFixed(1)}%` : 'لا هدف محدّد';
  const assumedNote  = a.assumed
    ? noteHtml('ℹ️', `لم تحدّد «النسبة المخططة» لهذا السهم — افترض التحليل وزناً متساوياً (${a.plannedPct.toFixed(1)}%). حدّد النسبة في التعديل لتحليل أدق.`, 'warn')
    : '';
  // إفصاح: النسبة المخططة أقل من الوزن الحالي فلا تعني إضافة — استُبدلت بشريحة متساوية
  const substNote = a.substituted
    ? noteHtml('⚠️', `النسبة المخططة (${a.rawPct.toFixed(1)}%) <strong>أقل من وزن السهم الحالي</strong> فلا تمثّل إضافة. استبدلها التحليل بشريحة متساوية، والوزن المعروض أدناه (${a.posWeightAfter.toFixed(1)}%) ناتج عن هذا الافتراض لا عن نسبتك.`, 'warn')
    : '';

  // ── الأسقف الدستورية: مقياس الوزن المتوقع مقابل سقف السهم ──
  const capScale = Math.max(a.singleCap + WL_CAP_BUFFER + 2, a.posWeightAfter * 1.15);
  const secScale = Math.max(WL_CAP_SECTOR + WL_SECTOR_BUFFER + 3, a.secWeightAfter * 1.15);
  const capMeter = meterHtml({
    label: `وزن ${esc(w.ticker)} بعد الشراء`, valueTxt: `${a.posWeightAfter.toFixed(1)}%`,
    pct: a.posWeightAfter / capScale * 100, state: a.overCap ? 'bad' : 'good',
    markPct: a.singleCap / capScale * 100,
    foot: `العلامة = السقف الدستوري ${a.singleCap}%${a.blueChip ? ' (قيادي)' : ''} + سماح ${WL_CAP_BUFFER}%`,
  });
  const secMeter = meterHtml({
    label: `وزن قطاع «${esc(a.sec)}» بعد الشراء`, valueTxt: `${a.secWeightAfter.toFixed(1)}%`,
    pct: a.secWeightAfter / secScale * 100, state: a.overSectorCap ? 'bad' : a.overTarget ? 'warn' : 'good',
    markPct: WL_CAP_SECTOR / secScale * 100,
    foot: `العلامة = سقف القطاع ${WL_CAP_SECTOR}% + سماح ${WL_SECTOR_BUFFER}% · ${secTargetStr} · قبل: ${a.secWeightBefore.toFixed(1)}%`,
  });

  const sizeAfter = a.after.n;
  const sizeState = sizeAfter >= WL_SIZE_MIN && sizeAfter <= WL_SIZE_MAX ? 'good' : 'warn';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card wl-modal">
      <div class="wl-modal-head">
        <span class="modal-title">🧠 أثر إضافة ${esc(w.ticker)} — ${esc(w.name)}</span>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="wl-modal-body stack-4">

        <!-- الحكم: الرقم القائد = تغيّر المؤشر -->
        <div class="wl-verdict">
          <div class="hero-num">${a.deltaGauge >= 0 ? '+' : ''}${a.deltaGauge}<span class="unit">نقطة</span></div>
          <div class="hero-cap">تغيّر مؤشر التنويع: ${a.before.gaugePos} → ${a.after.gaugePos} · ${esc(a.before.zoneLabel)} → ${esc(a.after.zoneLabel)}</div>
          <div class="mt-2">${tagHtml(a.icon, a.label, a.state)}</div>
        </div>

        ${assumedNote}
        ${substNote}

        <!-- الأسقف الدستورية أولاً: هي القيد الصلب -->
        <div>
          <div class="wl-sec-t">⚖️ الأسقف الدستورية — CLAUDE.md §1</div>
          <div class="stack-2">${capMeter}${secMeter}</div>
          <div class="mt-2 wl-tags">
            ${tagHtml(a.overCap ? '⛔' : '✅', a.overCap ? `فوق سقف السهم ${a.singleCap}%` : `ضمن سقف السهم ${a.singleCap}%`, a.overCap ? 'bad' : 'good')}
            ${tagHtml(a.overSectorCap ? '⛔' : '✅', a.overSectorCap ? `فوق سقف القطاع ${WL_CAP_SECTOR}%` : `ضمن سقف القطاع ${WL_CAP_SECTOR}%`, a.overSectorCap ? 'bad' : 'good')}
            ${tagHtml(sizeState === 'good' ? '✅' : '⚠️', `حجم المحفظة بعد الإضافة ${sizeAfter} سهم (${WL_SIZE_MIN}–${WL_SIZE_MAX})`, sizeState)}
            ${a.isNewSector ? tagHtml('🆕', 'قطاع جديد', 'good') : ''}
          </div>
        </div>

        <!-- التفاصيل خلف طيّة -->
        <details class="wl-det">
          <summary>مقاييس التنويع قبل/بعد وتفصيل الحكم</summary>
          <div class="stack mt-2">
            ${kvsHtml([
              ['مؤشر التنويع', `${a.before.gaugePos} → ${a.after.gaugePos}`],
              ['عدد فعّال (N فعّال)', `${a.before.effectiveN} → ${a.after.effectiveN}`],
              ['عدد الأسهم', `${a.before.n} → ${a.after.n}`],
              ['عدد القطاعات', `${a.before.sectorCount} → ${a.after.sectorCount}`],
              [`وزن قطاع «${esc(a.sec)}»`, `${a.secWeightBefore.toFixed(1)}% → ${a.secWeightAfter.toFixed(1)}%`],
              ['هدف القطاع', secTargetStr],
            ])}
            <div>
              <div class="wl-sec-t">لماذا هذا الحكم؟</div>
              <ul class="rsn-ul">${a.reasons.map(reasonRow).join('')}</ul>
            </div>
          </div>
        </details>

        ${noteHtml('📐', 'المقياس مبني على HHI (Evans &amp; Archer 1968) ومعامل تنويع القطاعات — نفس منهجية لوحة التحكم. هذا تحليل حسابي للتنويع والأسقف فقط، وليس توصية بالشراء.', '')}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); } });
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(id = null) {
  editingWlId = id;
  document.getElementById('wl-modal-title').textContent = id ? 'تعديل السهم' : 'إضافة سهم للمراقبة';
  if (id) {
    const w = watchlist.find(x => x.id === id);
    if (!w) return;
    document.getElementById('wl-ticker').value       = w.ticker;
    document.getElementById('wl-name').value         = w.name;
    document.getElementById('wl-sector').value       = w.sector || '';
    document.getElementById('wl-target-price').value = w.target_price || '';
    document.getElementById('wl-planned-pct').value  = w.planned_pct  || '';
    document.getElementById('wl-notes').value        = w.notes || '';
  } else {
    document.getElementById('wl-form').reset();
  }
  document.getElementById('wl-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('wl-modal').style.display = 'none';
  editingWlId = null;
}

// ── حفظ ───────────────────────────────────────────────────────
async function saveItem(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();
  // AUDIT-FIX (2026-08): جلسة منتهية كانت تسقط بـ TypeError صامت
  if (!user) { showToast('انتهت الجلسة — أعد تسجيل الدخول', 'error'); return; }

  const ticker = document.getElementById('wl-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('wl-name').value.trim();

  if (!ticker || !name) { showToast('الرمز والاسم مطلوبان', 'error'); return; }

  // AUDIT-FIX (2026-08): منع التكرار حتى في وضع التعديل — باستثناء السجل الجاري تعديله
  const dup = watchlist.find(w => w.ticker === ticker && w.id !== editingWlId);
  if (dup) { showToast(`⛔ الرمز ${ticker} موجود بالفعل في قائمة المراقبة`, 'error'); return; }

  if (!await confirmAsync(editingWlId ? `هل تريد حفظ التعديلات على ${ticker}؟` : `هل تريد إضافة ${ticker} لقائمة المراقبة؟`)) return;

  const payload = {
    user_id:      user.id,
    ticker,
    name,
    sector:       document.getElementById('wl-sector').value.trim(),
    target_price: +document.getElementById('wl-target-price').value || 0,
    planned_pct:  +document.getElementById('wl-planned-pct').value  || 0,
    notes:        document.getElementById('wl-notes').value.trim()
  };

  let error;
  // AUDIT-FIX (2026-08): eq('user_id') توحيداً للنمط الدفاعي (لا اعتماد على RLS وحده)
  if (editingWlId) ({ error } = await supabaseClient.from('watchlist').update(payload).eq('id', editingWlId).eq('user_id', user.id));
  else             ({ error } = await supabaseClient.from('watchlist').insert([payload]));

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editingWlId ? 'تم التحديث ✓' : 'تمت الإضافة ✓', 'success');
  closeModal();
  await loadAll();
  renderContext();
  renderTable();
  refreshWatchlistPrices();   // اجلب سعر اليوم للسهم الجديد/المعدّل تلقائياً
}

async function deleteItem(id) {
  if (!await confirmAsync('هل أنت متأكد من الحذف؟')) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { showToast('انتهت الجلسة — أعد تسجيل الدخول', 'error'); return; }
  const { error } = await supabaseClient.from('watchlist').delete().eq('id', id).eq('user_id', user.id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await loadAll();
  renderContext();
  renderTable();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportWatchlistCSV() {
  if (!watchlist.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  exportCSV(`قائمة_مراقبة_${todayISO()}.csv`,
    ['الرمز', 'الاسم', 'القطاع', 'سعر الدخول المستهدف', 'سعر اليوم', 'النسبة المخططة %', 'أثر التنويع', 'ملاحظات', 'تاريخ الإضافة'],
    watchlist.map(w => {
      const a = analyzeWatchImpact(w);
      const impact = a ? `${a.label} (Δ${a.deltaGauge >= 0 ? '+' : ''}${a.deltaGauge})` : '—';
      return [w.ticker, w.name, w.sector || '', w.target_price || 0, _livePrices[w.ticker] ?? '', w.planned_pct || 0, impact, w.notes || '', w.created_at ? new Date(w.created_at).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''];
    })
  );
  showToast(`✓ تم تصدير ${watchlist.length} سهم`, 'success');
}

init();
