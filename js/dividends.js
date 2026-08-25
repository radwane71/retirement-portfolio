let dividends    = [];
let txBuyRows    = [];
let txSellRows   = [];
let holdings     = [];
let selectedYear = 'all';
let chartView    = 'month';   // 'month' | 'year'
let incomeMode   = 'bar';     // 'bar' | 'line' | 'stacked' | 'table'
let incomeChart  = null;
let divFilter    = '';        // فلتر جدول السجلات (رمز أو اسم)

// ── محتوى شروحات الكروت (يُقرأ بواسطة showCardInfo المشتركة في utils.js) ──
// شرح مبسّط لغير المختص: ما هذا؟ كيف يُحسب؟ ماذا أفعل به؟
window.CARD_INFO = {
  'div-stats': {
    title: '📊 ملخص العائد التوزيعي',
    body: `
      <p>«الأرباح الموزعة» هي مبالغ نقدية توزّعها الشركة على المساهمين من أرباحها. هذا الشريط يلخّص دخلك منها بعدة مقاييس:</p>
      <div class="info-math">
        • <strong>TTM (آخر 12 شهراً):</strong> مجموع ما استلمته فعلاً خلال آخر سنة — دخل حقيقي بلا تقدير.<br>
        • <strong>YOC الفعلي:</strong> = أرباح آخر 12 شهر ÷ تكلفة شرائك للأسهم. يقيس عائد التوزيعات على رأس مالك الأصلي.<br>
        • <strong>العائد المتوقع (Forward):</strong> = لكل سهم مجموع التوزيع للسهم خلال آخر 12 شهراً × أسهمك الحالية. تقدير لما ستستلمه في السنة القادمة.<br>
        • <strong>العائد السوقي:</strong> = الدخل المتوقع ÷ القيمة السوقية الحالية — ما يدفعه السوق اليوم مقابل توزيعاتك.
      </div>
      <div class="info-formula">لماذا يختلف YOC عن العائد السوقي؟ لأن YOC يقسم على ما <strong>دفعته</strong> أنت، والسوقي يقسم على <strong>قيمة السهم اليوم</strong>. ارتفاع YOC عن السوقي = اشتريت بسعر جيد.</div>
      <p class="info-note">💡 إذا نمت محفظتك مؤخراً سيبدو الـTTM أقل من المتوقع (Forward) — لأن التوزيعات القديمة جُمعت حين كانت محفظتك أصغر. في هذه الحالة الـForward أصدق.</p>`
  },
  'monthly-income': {
    title: '📈 الدخل الشهري من التوزيعات',
    body: `
      <p>يعرض هذا الرسم ما استلمته فعلياً من أرباح موزعة في كل شهر/سنة، حتى ترى نمط دخلك ومدى انتظامه.</p>
      <div class="info-math">
        • <strong>أعمدة/خط:</strong> المبلغ المستلم في كل فترة.<br>
        • <strong>مكدّس:</strong> يقسّم العمود حسب السهم المساهم في دخل ذلك الشهر.<br>
        • <strong>جدول:</strong> نفس الأرقام في صورة جدول قابل للقراءة.
      </div>
      <p class="info-note">💡 الشركات السعودية كثيراً ما توزّع نصف/ربع سنوي — توقّع قمماً في أشهر معيّنة لا دخلاً ثابتاً كل شهر.</p>`
  },
  'yearly-summary': {
    title: '🗓️ الإجمالي السنوي',
    body: `
      <p>مجموع كل ما استلمته من توزيعات في كل سنة تقويمية، مع نسبة العائد على تكلفة محفظتك في تلك السنة.</p>
      <div class="info-formula">العائد السنوي = إجمالي توزيعات السنة ÷ تكلفة الأسهم الموزِّعة في تلك السنة × 100</div>
      <p class="info-note">💡 السنة الجارية تظهر برمز 🔄 لأنها غير مكتملة بعد — لا تقارنها مباشرة بسنة كاملة.</p>`
  },
  'holding-summary': {
    title: '🏢 الإجمالي لكل سهم',
    body: `
      <p>كم وزّع عليك كل سهم على حدة عبر الزمن، لتعرف أي الأسهم هو «بقرتك الحلوب» الحقيقية.</p>
      <div class="info-formula">لكل سهم: مجموع كل التوزيعات المستلمة منه ÷ تكلفتك فيه = العائد التراكمي على التكلفة</div>
      <p class="info-note">💡 السهم ذو العائد المرتفع على التكلفة جدير بالاحتفاظ؛ والسهم الذي لا يوزّع منذ سنوات قد يحتاج مراجعة.</p>`
  },
};

function ed(table, rowId, field, type, raw, extraCls = '', selectKey = '') {
  return `class="editable${type==='number'?' num':''}${extraCls?' '+extraCls:''}" ` +
    `data-table="${table}" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"` +
    (selectKey ? ` data-select="${selectKey}"` : '');
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-dividends');

  const now = new Date();
  document.getElementById('d-date').value  = todayISO();
  document.getElementById('d-month').value = now.getMonth() + 1;
  document.getElementById('d-year').value  = now.getFullYear();

  document.getElementById('d-ticker').addEventListener('input', onDivTickerInput);

  await loadData();
  renderAll();
  await loadArchivedDividends();
}

function onDivTickerInput() {
  const inp    = document.getElementById('d-ticker');
  const ticker = inp.value.trim().toUpperCase();
  inp.value    = ticker;
  const official = (typeof lookupTicker === 'function') ? lookupTicker(ticker) : null;
  const name     = official?.name || (typeof TICKER_DB !== 'undefined' ? TICKER_DB[ticker] : null);
  // FIX: always update name — clear when ticker changes, fill when found
  document.getElementById('d-name').value = name || '';
}

async function loadData() {
  const [rDiv, rTx, rH] = await Promise.all([
    supabaseClient.from('dividends').select('*').eq('is_archived', false).order('date', { ascending: false }),
    supabaseClient.from('transactions').select('date, ticker, name, total, type, shares, price').eq('is_archived', false),
    supabaseClient.from('holdings').select('ticker, name, shares, avg_price, current_price'),
  ]);
  if (rDiv.error) { showToast('خطأ في تحميل الأرباح', 'error'); return; }
  const allTx  = rTx.data || [];
  dividends    = rDiv.data || [];
  holdings     = rH.data  || [];
  txBuyRows    = allTx.filter(t => t.type === 'buy' || t.type === 'grant');
  txSellRows   = allTx.filter(t => t.type === 'sell');
  _invalidateSharesCache(); // M-19: rebuild ticker-tx map on next _sharesAtDate call
}

async function loadDividends() {
  await loadData();
}

function renderAll() {
  // AUDIT-FIX: _projectedAnnualIncome كانت تُحسب 3 مرات لكل رندر (الإحصائيات
  // والملخص السنوي وملخص الأسهم) — تُحسب الآن مرة واحدة وتُمرَّر، وكذلك buildCostMaps.
  const fwd  = _projectedAnnualIncome();
  const maps = buildCostMaps();
  renderDivStats(fwd);
  renderSummaries(maps, fwd);
  renderTable();
  renderIncomeChart();
  renderDividendQuality();
  renderTadawulDividends();
}

// مجموع التوزيعات الفعلية خلال آخر 12 شهراً (TTM) — العُرف المالي المعتمد
// AUDIT-FIX (2026-07): موحَّد مع لوحة التحكم — بحقل التاريخ (آخر 365 يوماً)
// مع احتياطي مبني من شهر/سنة للسجلات بلا تاريخ. كان يُحسب هنا بحقلي شهر/سنة
// وفي اللوحة بالتاريخ، فيختلف الرقمان إذا تعارض الحقلان في سجل مُدخل يدوياً.
function _ttmDividends() {
  const now     = new Date();
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return dividends.reduce((s, d) => {
    const dt = d.date ? parseDateLocal(d.date) : parseDateLocal(_divSortDate(d));
    // AUDIT-FIX (2026-08): كانت النافذة مغلقة الطرفين (>=) أي 366 يوماً، فتحتسب
    // دفعة الموزّع السنوي مرتين في يوم الذكرى السنوية بالضبط (دخل مضاعف ليوم كامل).
    return (dt && dt > yearAgo && dt <= now) ? s + +d.amount : s;
  }, 0);
}

// تكلفة الحيازات الحالية = مجموع (متوسط التكلفة × الأسهم المتبقية) لكل سهم
// AUDIT-FIX 2026-08-21 (#52): كان المقام يُعاد بناؤه من دفتر المعاملات هنا بينما
// لوحة التحكم (dashboard.js:555) تقرؤه من جدول الحيازات — فيختلف مقام «العائد على
// التكلفة» بين الصفحتين متى ما تعارض الجدول مع الدفتر (صفقة بلا تاريخ تُسقَط هنا
// ولا تُسقَط هناك، أو avg_price مُحرَّر يدوياً). الدستور §2 يجعل التراكر — أي جدول
// الحيازات — المصدر الأساسي، فنعتمده هنا أيضاً ونُبقي إعادة البناء من الدفتر
// للجدول السنوي التاريخي وحده (لا بديل له هناك: الجدول لا يحفظ تكلفة كل سنة).
function _currentCostBasis() {
  const fromHoldings = holdings.reduce((s, h) => s + +h.shares * +h.avg_price, 0);
  if (fromHoldings > 0) return fromHoldings;
  // احتياطي فقط: جدول الحيازات فارغ (لم يُحمَّل بعد) — نعيد البناء من الدفتر.
  const currentYear = new Date().getFullYear();
  const tickers = [...new Set([...txBuyRows.map(t => t.ticker), ...txSellRows.map(t => t.ticker)])];
  return tickers.reduce((s, t) => s + _tickerCostBasisAtYear(t, currentYear), 0);
}

// M-19: pre-compute a sorted transaction list once per ticker for _sharesAtDate
// avoids O(N×M) by building a map {ticker → sorted rows} on first call
let _sharesAtDateCache = null;
function _getTickerTxMap() {
  if (_sharesAtDateCache) return _sharesAtDateCache;
  const map = {};
  [...txBuyRows, ...txSellRows].forEach(t => {
    if (!t.ticker || !t.date) return;
    if (!map[t.ticker]) map[t.ticker] = [];
    map[t.ticker].push(t);
  });
  // sort each ticker's rows once
  Object.values(map).forEach(rows =>
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  );
  _sharesAtDateCache = map;
  return map;
}
// invalidate cache when data reloads
function _invalidateSharesCache() { _sharesAtDateCache = null; }

// عدد الأسهم المحتفظ بها لرمز معين في تاريخ معين
// M-12: use parseDateLocal to avoid UTC-midnight off-by-one
function _sharesAtDate(ticker, dateStr) {
  const cutoff = parseDateLocal(dateStr);
  if (!cutoff) return 0;
  let shares = 0;
  const rows = _getTickerTxMap()[ticker] || [];
  for (const t of rows) {
    if (parseDateLocal(t.date) > cutoff) break; // sorted — early exit
    if (t.type === 'buy' || t.type === 'grant') shares += +t.shares;
    else if (t.type === 'sell') shares -= +t.shares;
  }
  return Math.max(0, shares);
}

// تحويل سجل أرباح إلى تاريخ قابل للمقارنة
// إذا كان date فارغاً نبني تاريخاً من year + month (أول الشهر)
function _divSortDate(d) {
  if (d.date) return d.date;
  const yr = d.year || new Date().getFullYear();
  const mo = String(d.month || 1).padStart(2, '0');
  return `${yr}-${mo}-01`;
}

// مفتاح الشهر الذي تنتمي إليه التوزيعة — مشتقّ من نفس المصدر الذي يعتمده TTM.
// AUDIT-FIX 2026-08-21 (#41): كان الرسم الشهري يبوّب بحقلي year/month بينما KPI
// «آخر 12 شهراً» يبوّب بحقل date، فيختلف الرقمان في نفس الصفحة إذا تعارض الحقلان
// في سجل مُدخل يدوياً. الآن كلاهما يشتقّ من date وعند غيابه من year/month.
function _divPeriodKey(d) {
  const iso = d.date ? String(d.date) : _divSortDate(d);
  return iso.slice(0, 7);
}

// الدخل التوزيعي المتوقع سنوياً (Forward Projected Income)
// المنطق: لكل سهم محتفظ به الآن:
//   ١. آخر دفعة مستلمة ÷ الأسهم التي كانت عندي وقتها = دخل لكل سهم (DPS)
//   ②. حدّد الدورية من الفجوة الزمنية بين آخر دفعتين
//   ③. DPS × الدورية × الأسهم الحالية = الدخل المتوقع من هذا السهم سنوياً
// هذا ما تستخدمه ياهو فاينانس وإنفستنج كوم
// ⚠️ حُذفت `_dpsTrendAware` (25 سطراً) في أوديت 2026-08-24: صارت كوداً ميتاً
// بعد انتقال الدخل المتوقّع إلى مجموع DPS آخر 12 شهراً (قرار المالك 2026-08).
// منطق «الوسيط المحصّن مع استثناء النامي» لم يعد مطلوباً: المجموع يلتقط النمو بنفسه.

function _projectedAnnualIncome() {
  const breakdown = [];
  let total = 0;

  const heldTickers = new Set(holdings.map(h => h.ticker));
  heldTickers.forEach(ticker => {
    const holding = holdings.find(h => h.ticker === ticker);
    if (!holding || +holding.shares <= 0) return;

    // نقبل السجلات سواء كان date موجوداً أم لا (نبني التاريخ من year+month)
    const tickerDivs = dividends
      .filter(d => d.ticker === ticker)
      .sort((a, b) => _divSortDate(a).localeCompare(_divSortDate(b)));

    if (!tickerDivs.length) return;

    // الدورية أولاً (وسيط الفجوات الزمنية) — نحتاجها لاختيار آخر freq دفعات
    // AUDIT-FIX: use median inter-dividend gap (matches dashboard.js) — robust to skipped payments
    // AUDIT-FIX 2026-08-22: التعريف الموحَّد في utils.js — بحارس يمنع قلب موزّع
    // سنوي إلى «شهري» بسبب تسجيلين متقاربين (انظر شرح inferDividendFrequency).
    const freq = inferDividendFrequency(tickerDivs.map(_divSortDate));
    const freqLabel = freq === 12 ? 'شهري' : freq === 4 ? 'ربع سنوي' : freq === 2 ? 'نصف سنوي' : 'سنوي';

    // سلسلة DPS لكل دفعة كان المستخدم يملك أسهماً عندها (بالترتيب الزمني)
    let lastValidShares = 0, lastValidDate = null, lastValidAmt = 0;
    const dpsSeries = [];   // { dps, date } — التاريخ لازم لنافذة الـ12 شهراً
    for (let i = 0; i < tickerDivs.length; i++) {
      const dt = _divSortDate(tickerDivs[i]);
      const sh = _sharesAtDate(ticker, dt);
      if (sh >= 0.001) {
        dpsSeries.push({ dps: +tickerDivs[i].amount / sh, date: dt });
        lastValidShares = sh;
        lastValidDate   = dt;
        lastValidAmt    = +tickerDivs[i].amount;
      }
    }

    // DPS السنوي المتوقع = مجموع DPS آخر 12 شهراً (قرار المالك 2026-08).
    // كان: دفعة واحدة (وسيط أو آخر دفعة) × الدورية — وهو يفترض تساوي الدفعات،
    // فيضخّم النمط السعودي الشائع (مرحلي صغير + ختامي كبير) حتى +129%، ويتذبذب
    // ±20% لنفس السهم حسب شهر فتح الصفحة رغم ثبات سياسة الشركة. مجموع الاثني
    // عشر شهراً يعطي الرقم نفسه في كل الحالات بلا فروع اتجاه.
    // احتياطي للموزّع السنوي الذي دفعته الأخيرة تجاوزت 12 شهراً ولمّا يُعدّ منقطعاً:
    // مجموع آخر دورة كاملة (آخر freq دفعة).
    let dps, lastDivDate, sharesAtRefDiv, usedFallback = false, dpsTrend = 'ttm';
    if (dpsSeries.length) {
      // AUDIT-FIX (2026-08-18): النافذة كانت مفتوحة من الأعلى فيدخلها التوزيع
      // المُعلَن المسجَّل بتاريخ صرف قادم قبل استلامه (نفس الإصلاح في dashboard.js).
      const cutoff = Date.now() - 365 * 86400000, nowTs = Date.now();
      const ttmDps = dpsSeries
        .filter(p => { const t = parseDateLocal(p.date).getTime(); return t >= cutoff && t <= nowTs; })
        .reduce((s, p) => s + p.dps, 0);
      if (ttmDps > 0) {
        dps = ttmDps / freq;              // يُضرب بـ freq لاحقاً → المجموع كما هو
      } else {
        const cycle = dpsSeries.slice(-freq).reduce((s, p) => s + p.dps, 0);
        dps = cycle / freq;
        dpsTrend = 'last-cycle';
      }
      lastDivDate    = lastValidDate;
      sharesAtRefDiv = lastValidShares;
    } else {
      // fallback: اشترى السهم بعد كل التوزيعات المسجّلة — نقدّر من التوزيعات
      // المسجّلة ÷ الأسهم الحالية (H-9: لا الإجمالي الكلي الذي يضخّم DPS)
      // AUDIT-FIX: قسمة «مجموع آخر سنة ÷ freq» تفترض السنة مكتملة — سنة جزئية
      // (السنة الجارية بدفعتين من 4 مثلاً) كانت تُقسم على freq كاملة فينخفض DPS.
      // الحل: آخر سنة مكتملة (< السنة الجارية) إن وُجدت؛ وإلا نُسنّي الدفعات
      // الجزئية بعددها الفعلي: DPS للفترة = المجموع ÷ الأسهم ÷ عدد الدفعات.
      const lastDiv  = tickerDivs[tickerDivs.length - 1];
      lastDivDate    = _divSortDate(lastDiv);
      const curYear  = new Date().getFullYear();
      const yearOf   = d => +d.year || new Date(_divSortDate(d)).getFullYear();
      const completeYears = tickerDivs.map(yearOf).filter(y => y < curYear);
      if (completeYears.length) {
        const lastFullYear  = Math.max(...completeYears);
        const fullYearTotal = tickerDivs
          .filter(d => yearOf(d) === lastFullYear)
          .reduce((s, d) => s + +d.amount, 0);
        // مجموع سنة مكتملة ÷ الدورية = DPS لكل فترة (يُسنّى لاحقاً بالضرب بـ freq)
        dps = fullYearTotal > 0
          ? fullYearTotal / +holding.shares / freq
          : +lastDiv.amount / +holding.shares;
      } else {
        // لا توجد سنة مكتملة — دفعات السنة الجارية الجزئية تُسنّى بعددها الفعلي
        const lastYear     = Math.max(...tickerDivs.map(yearOf));
        const partialDivs  = tickerDivs.filter(d => yearOf(d) === lastYear);
        const partialTotal = partialDivs.reduce((s, d) => s + +d.amount, 0);
        dps = partialTotal > 0 && partialDivs.length
          ? partialTotal / +holding.shares / partialDivs.length
          : +lastDiv.amount / +holding.shares;
      }
      sharesAtRefDiv = +holding.shares;
      lastValidAmt   = +lastDiv.amount;
      usedFallback   = true;
    }

    const currentShares = +holding.shares;
    const projected = dps * freq * currentShares;

    // AUDIT-FIX (2026-08): «الدخل المتوقع» كان يُسقط دخلاً كاملاً لسهم توقّف عن
    // التوزيع منذ سنوات — lastDivDate كان يُخزَّن ولا يُفحص في أي شرط. سهم قطع
    // توزيعه هو حالة «فشل بوابة الاستدامة» في الدستور (§4 الفلتر 1) فلا يجوز
    // بناء دخل تقاعدي متوقَّع عليه. القاعدة: تجاوز 1.75 ضعف دورته المعتادة بلا
    // توزيع = فوّت دورة كاملة مع مهلة → يُستبعد من المجموع ويُعلَن صراحةً (§8:
    // لا إسقاط صامت — يظهر في التحذير مع عدد أشهر الانقطاع).
    const daysSinceDiv = lastDivDate
      ? Math.floor((Date.now() - parseDateLocal(lastDivDate).getTime()) / 86400000)
      : null;
    const staleAfter = dividendStaleDays(freq);
    const isStale    = daysSinceDiv != null && daysSinceDiv > staleAfter;

    if (!isStale) total += projected;

    breakdown.push({
      ticker, name: holding.name || ticker,
      dps, freq, freqLabel, currentShares,
      lastDivDate, lastDivAmt: lastValidAmt,
      sharesAtLastDiv: sharesAtRefDiv, projected, usedFallback, dpsTrend,
      isStale, daysSinceDiv,
    });
  });

  const stale = breakdown.filter(b => b.isStale);
  return { total, breakdown, stale };
}

// ── شريط الإحصائيات الكلية ────────────────────────────────────
function renderDivStats(fwdPrecomputed) {
  const el = document.getElementById('div-stats');
  if (!el) return;

  const currentYear = new Date().getFullYear();
  const today       = new Date();
  const startOfYear = new Date(currentYear, 0, 1);
  const daysElapsed = Math.floor((today - startOfYear) / 86400000) + 1;
  const daysInYear  = ((currentYear % 4 === 0 && currentYear % 100 !== 0) || currentYear % 400 === 0) ? 366 : 365;

  // ⚠️ المُعلَن بتاريخ صرفٍ قادم ليس دخلاً محقّقاً — و`_ttmDividends` وسلسلة
  // الدخل المتوقّع تُسقطانه عمداً، وهذان الرقمان لا. و`+d.year` حقلٌ مستقل
  // قد يخالف التاريخ. قياس: ثلاث توزيعات ×1,000 إحداها مستقبلية ⇒
  // «إجمالي الأرباح 3,000» والمستلَم 2,000، و«أرباح 2026» 2,000 والفعلي 1,000.
  const _nowRef  = new Date();
  const _paidDiv = dividends.map(d => ({ d, dt: dividendFlowDate(d, _nowRef) })).filter(x => x.dt);
  const _pendingDiv = dividends.length - _paidDiv.length;
  const totalAll = _paidDiv.reduce((s, x) => s + +x.d.amount, 0);
  const yearDiv  = _paidDiv.filter(x => x.dt.getFullYear() === currentYear)
                           .reduce((s, x) => s + +x.d.amount, 0);
  const ttm      = _ttmDividends();
  const netCapital = _currentCostBasis();

  // Current Yield = الدخل المتوقع ÷ القيمة السوقية الحالية
  const currentMarketVal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);

  // TTM YOC — مفيد لكنه متأثر بنمو المحفظة (المقام الحالي أكبر من متوسط الفترة)
  const ttmYoc    = netCapital > 0 ? ttm / netCapital * 100 : 0;
  const ttmYocCls = ttmYoc >= 5 ? 'text-success' : ttmYoc >= 3 ? 'text-accent' : 'text-muted';

  // Forward Projected — الأصح للمحافظ النامية: آخر دفعة لكل سهم × دوريتها × الأسهم الحالية
  const fwd        = fwdPrecomputed || _projectedAnnualIncome();
  const fwdYoc     = netCapital > 0 ? fwd.total / netCapital * 100 : 0;
  const fwdYocCls  = fwdYoc >= 5 ? 'text-success' : fwdYoc >= 3 ? 'text-accent' : 'text-muted';

  // ── شارة نضج: العائد التوزيعي مبكّر قبل اكتمال دورة سنة كاملة ──
  // AUDIT-FIX: كان يفحص متغير transactions (معرَّف في transactions.js غير المحمّل هنا)
  // فيرجع دائماً عمراً صفرياً — نشتق أول شراء من txBuyRows المتاحة فعلاً في الصفحة.
  const _firstBuy = txBuyRows.filter(t => t.date).map(t => t.date).sort()[0];
  const _ageM     = (typeof portfolioAgeMonths === 'function') ? portfolioAgeMonths(_firstBuy) : 0;
  const _divCalYr = new Set(dividends.map(d => +d.year || new Date(d.date).getFullYear())).size;
  // AUDIT-FIX: أرضية Math.max(1,…) كانت تجعل «لم تكتمل دورة سنوية» (divYears < 1)
  // مستحيلة — الآن 0 قبل اكتمال 12 شهراً حتى تعمل شارة «مبكّر» في assessMetricMaturity.
  const _mDiv     = assessMetricMaturity('divYield', {
    ageMonths: _ageM,
    divYears:  Math.min(_divCalYr, _ageM >= 12 ? Math.ceil(_ageM / 12) : 0),
    divCount:  dividends.length,
  });
  const _dvBadge  = maturityBadge(_mDiv.level, _mDiv.reason);

  // عدد الأسهم الموزِّعة
  const uniqueTickers = new Set(dividends.map(d => d.ticker)).size;
  const coveredByFwd  = fwd.breakdown.length;

  // ملاحظة TTM
  const ttmNote = ttmYoc < fwdYoc
    ? `<div class="tx-stat-sub" style="color:var(--warning,#f0b429)" title="سبب الفرق: TTM يقسم على المحفظة الحالية الكاملة، لكن الأرباح المقيسة جُمعت حين كانت المحفظة أصغر — الـ Forward أدق.">▲ أقل من المتوقع (نمو المحفظة)</div>`
    : `<div class="tx-stat-sub">TTM ÷ تكلفة الحيازات</div>`;

  el.innerHTML = `
    <div class="tx-stat-item">
      <div class="tx-stat-val text-success">${formatSAR(totalAll)}</div>
      <div class="tx-stat-lbl">إجمالي الأرباح (كل الأوقات)</div>
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val text-accent">${formatSAR(yearDiv)}</div>
      <div class="tx-stat-lbl">أرباح ${currentYear} حتى الآن</div>
      <div class="tx-stat-sub">يوم ${daysElapsed} من ${daysInYear}</div>
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val text-accent" title="مجموع التوزيعات الفعلية المستلمة خلال آخر 12 شهراً">${formatSAR(ttm)}</div>
      <div class="tx-stat-lbl">أرباح آخر 12 شهراً (TTM)</div>
      <div class="tx-stat-sub">فعلي — ≈ ${formatSAR(ttm/12)} / شهر</div>
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item"
      title="TTM YOC = أرباح آخر 12 شهر ÷ تكلفة الحيازات الحالية&#10;قد يبدو منخفضاً إذا نمت المحفظة مؤخراً (المقام أكبر من متوسط الفترة)">
      <div class="tx-stat-val ${ttmYocCls}">${ttmYoc.toFixed(2)}%${_dvBadge}</div>
      <div class="tx-stat-lbl">YOC الفعلي (TTM)</div>
      ${ttmNote}
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item"
      title="Forward Projected = لكل سهم: مجموع التوزيع للسهم خلال آخر 12 شهراً × أسهمك الحالية&#10;هذا ما تستخدمه ياهو فاينانس وإنفستنج كوم&#10;يعكس ما تتوقع استلامه سنوياً من محفظتك الحالية&#10;مغطى: ${coveredByFwd} رمز من أصل ${uniqueTickers}">
      <div class="tx-stat-val ${fwdYocCls}">${fwdYoc.toFixed(2)}%${_dvBadge}</div>
      <div class="tx-stat-lbl">العائد المتوقع (Forward)</div>
      <div class="tx-stat-sub" style="color:var(--success,#3fb950)">≈ ${formatSAR(fwd.total)} سنوياً</div>
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val text-success"
        title="الدخل التوزيعي السنوي المتوقع من المحفظة الحالية&#10;= مجموع (مجموع التوزيع للسهم خلال آخر 12 شهراً × أسهمك الحالية) لكل رمز">
        ${formatSAR(fwd.total)}
      </div>
      <div class="tx-stat-lbl">الدخل المتوقع / سنة</div>
      <div class="tx-stat-sub" style="color:var(--success,#3fb950)">≈ ${formatSAR(fwd.total/12)} / شهر</div>
    </div>
    <div class="tx-stat-divider"></div>
    ${currentMarketVal > 0 ? `
    <div class="tx-stat-item"
      title="Current Yield = الدخل المتوقع ÷ القيمة السوقية الحالية&#10;هذا ما يدفعه السوق الآن مقابل محفظتك&#10;اقارنه بـ YOC لمعرفة تكلفة الفرصة البديلة">
      <div class="tx-stat-val ${fwd.total/currentMarketVal*100 >= 5 ? 'text-success' : fwd.total/currentMarketVal*100 >= 3 ? 'text-accent' : 'text-muted'}">${(fwd.total / currentMarketVal * 100).toFixed(2)}%</div>
      <div class="tx-stat-lbl">العائد السوقي الحالي</div>
      <div class="tx-stat-sub">Forward ÷ القيمة السوقية</div>
    </div>
    <div class="tx-stat-divider"></div>` : ''}
    <div class="tx-stat-item">
      <div class="tx-stat-val">${formatSAR(netCapital)}</div>
      <div class="tx-stat-lbl">تكلفة الحيازات الحالية</div>
      <div class="tx-stat-sub">متوسط التكلفة × الأسهم المتبقية</div>
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val">${uniqueTickers}</div>
      <div class="tx-stat-lbl">أسهم موزِّعة</div>
      <div class="tx-stat-sub">${coveredByFwd} مغطى بـ Forward</div>
    </div>`;

  // إعلان صريح عن الأسهم المستبعَدة من الدخل المتوقع لانقطاع توزيعها (§8)
  const staleEl = document.getElementById('div-stale-note');
  if (staleEl) {
    const st = fwd.stale || [];
    if (!st.length) { staleEl.style.display = 'none'; staleEl.innerHTML = ''; }
    else {
      staleEl.style.display = '';
      const items = st.map(s =>
        `${esc(s.name || s.ticker)} (${Math.round(s.daysSinceDiv / 30.44)} شهراً بلا توزيع، كان متوقّعه ${formatSAR(s.projected)})`
      ).join(' · ');
      staleEl.innerHTML = `<div class="note" data-state="warn"><span class="ic">⚠️</span><div>
        <b>مستبعَد من «الدخل المتوقع»:</b> ${items}<br>
        <span class="text-muted">انقطاع التوزيع إشارة فشل بوابة الاستدامة (الدستور §4 الفلتر 1) —
        لا يُبنى عليه دخل متوقَّع. راجع السهم في محرّك القرار.</span></div></div>`;
    }
  }

  // عرض مؤشر ثقة البيانات التوزيعية
  renderDivConfidenceBanner(netCapital, ttm, fwd.total, fwd.breakdown.length);
}

// ── مؤشر ثقة البيانات التوزيعية ─────────────────────────────────────────
function renderDivConfidenceBanner(costBasis, ttm, fwdIncome, fwdCoveredCount) {
  const el = document.getElementById('div-confidence-banner');
  if (!el) return;

  // ── عمر التقويمي وعمر رأس المال الفعلي ───────────────────────────
  const today     = new Date();
  const allDates  = [...txBuyRows, ...txSellRows].map(t => t.date).filter(Boolean).sort();
  // M-14: use parseDateLocal to avoid UTC-midnight off-by-one
  const firstDate = allDates[0] ? parseDateLocal(allDates[0]) : null;
  const calMonths = firstDate
    ? Math.floor((today - firstDate) / (30.44 * 86400000))
    : 0;

  // عمر رأس المال المرجَّح بالمعاملات (Capital-Weighted Age)
  // نستخدم مبالغ الشراء كبديل لعدم توفر cashflow_entries هنا
  const cwMonths = (() => {
    const sorted = [...txBuyRows].filter(t => t.date && t.total)
      .sort((a, b) => a.date.localeCompare(b.date));
    let wb = 0, ws = 0;
    sorted.forEach(t => {
      const m = (today - parseDateLocal(t.date)) / (30.44 * 86400000);
      ws += +t.total * m;
      wb += +t.total;
    });
    // السحوبات تُقلّص الوزن بنفس النسبة
    [...txSellRows].filter(t => t.date && t.total)
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(t => {
        if (wb > 0) { const p = Math.min(1, +t.total / wb); ws *= (1 - p); }
        wb = Math.max(0, wb - +t.total);
      });
    return wb > 0 ? Math.max(0.5, ws / wb) : calMonths;
  })();

  const months  = Math.round(cwMonths);   // الفعلي — يُستخدم في الثقة
  const cwDiff  = calMonths - months;

  // ── بيانات الأرباح ────────────────────────────────────────────────
  // عدد السنوات التقويمية التي ظهر فيها توزيع. ملاحظة: محفظة تمتد على سنتين
  // تقويميتين (مثلاً بدأت خريف 2025 وتوزيعات في 2025 ثم 2026) تعطي 2 رغم أن
  // عمرها أقل من سنة. نقيّدها بعمر المحفظة التقويمي حتى لا نعدّ «سنة أرباح
  // كاملة» لم تكتمل — يمنع تضخيم الثقة والتناقض في العرض (عمر 8 شهر ↔ «2 سنة»).
  const divYearsSet   = new Set(dividends.map(d => d.year));
  const maxCycles     = Math.max(1, Math.ceil(calMonths / 12));
  const divYears      = Math.min(divYearsSet.size, maxCycles);
  const uniqueTickers = new Set(dividends.map(d => d.ticker)).size;

  // ── الفجوة بين Forward و TTM ──────────────────────────────────────
  // فجوة كبيرة = المحفظة نمت مؤخراً = الـ TTM مشوّه
  const fwdTtmGap = ttm > 0 && fwdIncome > 0
    ? ((fwdIncome - ttm) / ttm * 100)
    : 0;

  // ── درجة الثقة (0–100) ───────────────────────────────────────────
  // AUDIT-FIX (2026-08): كانت الدرجة دوالَّ درجية (شرطية) فتتجمّد شهوراً ثم
  // تقفز: 9-11 شهراً كلها 58%، و12-17 كلها 75%. بدت للمالك «معلّقة/معطّلة».
  // الآن استيفاء خطّي بين نفس نقاط المعايرة السابقة — الأرقام عند النقاط
  // المفصلية لم تتغيّر (9 شهر = 58% كما كانت)، لكنها تتحرّك كل شهر بينها.
  const lerp = (x, pts) => {
    if (x <= pts[0][0]) return pts[0][1];
    const last = pts[pts.length - 1];
    if (x >= last[0]) return last[1];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
    }
    return last[1];
  };

  const agePct = lerp(cwMonths, [[0,.05],[3,.22],[6,.35],[9,.50],[12,.67],[18,.80],[24,.90],[36,1]]);
  // دورات الأرباح كقيمة متصلة: عدد السنوات المسجَّلة مسقوفاً بعمر المحفظة
  // الفعلي بالكسور — سنة جزئية تُحتسب جزئياً لا كاملة ولا مهملة.
  const divCycles = Math.min(divYearsSet.size, calMonths / 12);
  const divPct = lerp(divCycles, [[0,.05],[1,.48],[2,.75],[3,.95]]);
  const covRatio = uniqueTickers > 0 ? fwdCoveredCount / uniqueTickers : 0;
  const covPct = lerp(covRatio, [[0,.10],[.5,.50],[.8,.75],[1,.95]]);

  const agePts = agePct * 45, divPts = divPct * 35, covPts = covPct * 20;
  const score  = Math.round(agePts + divPts + covPts);

  // ── مستوى الثقة ── (رموز التصميم بدل ألوان مكتوبة يدوياً)
  const state = score < 45 ? 'bad' : score < 75 ? 'warn' : 'good';
  const stVar = `var(--st-${state})`;

  // ── رسالة المستشار المالي ──────────────────────────────────────────
  const fmtM       = m => m < 12 ? `${Math.round(m)} شهر` : `${(m/12).toFixed(1)} سنة`;
  const monthsText = fmtM(months);
  const calText    = fmtM(calMonths);
  const fwdGapText = fwdTtmGap > 15
    ? ` الفجوة بين الـ Forward (${formatSAR(fwdIncome)}) والـ TTM (${formatSAR(ttm)}) تؤكد أن المحفظة نمت مؤخراً — الـ TTM مشوّه لصالح الأقل.`
    : '';

  let title, body, advice;
  if (score < 30) {
    title  = '⚠️ بيانات غير كافية — لا تتخذ قرارات على هذه الأرقام بعد';
    body   = `محفظتك عمرها ${monthsText} فقط وسجّلت أرباحاً لـ ${divYears} سنة. هذا الوقت القصير يجعل أي نسبة عائد تراها الآن مضلِّلة — قد تبدو ضعيفة لأن المحفظة لم تكتمل بعد، وليس لأن الأسهم رديئة.${fwdGapText}`;
    advice = `رسالة للمستثمر: أرقامك الآن مثل صورة طولية بعد أسبوع — تنقصها الزمن. انتظر حتى تكتمل ${12 - months} شهراً إضافية قبل الحكم.`;
  } else if (score < 45) {
    title  = '🔴 محفظة حديثة — العوائد المعروضة تعكس فترة بناء لا أداء مستقر';
    body   = `${monthsText} من البيانات مع ${divYears} سنة توزيعات. الـ YOC المنخفض ليس دليلاً على ضعف الأسهم — بل لأن المحفظة وصلت حجمها الكامل مؤخراً وأرباح الفترة الماضية كانت على محفظة أصغر.${fwdGapText}`;
    advice = `العائد المتوقع Forward (${formatSAR(fwdIncome/12)}/شهر) أصدق من TTM لوضعك الحالي.`;
  } else if (score < 60) {
    title  = '🟡 بيانات نامية — استخدمها للاتجاه العام لا للأرقام الدقيقة';
    body   = `${monthsText} من التاريخ و${divYears} سنة أرباح. المحفظة بدأت تُظهر نمطاً لكنها لم تمر بعد بدورة سوقية كاملة. الأرقام مفيدة للمقارنة النسبية بين الأسهم.${fwdGapText}`;
    advice = 'قارن YOC كل سهم بالمعدلات التاريخية المعلنة لتلك الشركة — لا بالمتوسط السوقي.';
  } else if (score < 75) {
    title  = '📊 بيانات معقولة — صالحة للمراجعة الدورية';
    body   = `${monthsText} من البيانات الفعلية. الأرقام تعكس أداء حقيقياً يمكن مقارنته بالسوق، مع الأخذ بعين الاعتبار أن المحفظة لا تزال في مرحلة نضوج.`;
    advice = 'العائد الآن مؤشر جيد على جودة الأسهم — ابدأ بمراجعة الأسهم الأقل من 2% YOC.';
  } else if (score < 87) {
    title  = '✅ بيانات جيدة — مناسبة لاتخاذ قرارات';
    body   = `${monthsText} من التاريخ الفعلي. المحفظة شهدت دورات سوقية كافية وأعطت بيانات موثوقة. يمكنك الاستناد إلى العوائد المعروضة بثقة معقولة.`;
    advice = 'راجع أداء كل سهم مقارنة بالسنوات الفائتة — الأنماط الثابتة أكثر قيمة من أعلى نسبة.';
  } else {
    title  = '🔵 بيانات موثوقة — سجل قوي للتحليل';
    body   = `${monthsText} من البيانات مع ${divYears} دورات أرباح كاملة. المحفظة لديها تاريخ كافٍ لاتخاذ قرارات استثمارية مبنية على أرقام موثوقة.`;
    advice = 'بياناتك من بين أفضل ما يمكن العمل به في الاستثمار الشخصي.';
  }

  // ── تفكيك الدرجة: من أين جاء الرقم وما الذي يرفعه ──────────────────
  // المالك رأى «58%» ثابتة شهوراً بلا تفسير. الشفافية تحلّ ذلك: كل محور
  // يعرض نقاطه من سقفه، وما تبقّى فيه هو بالضبط ما يرفع الدرجة.
  const axis = (name, pts, max, detail) => {
    const pct = max > 0 ? pts / max * 100 : 0;
    const st  = pct >= 75 ? 'good' : pct >= 45 ? 'warn' : 'bad';
    return `<div class="meter" data-state="${st}">
        <div class="meter-head">
          <span class="k">${name} <span class="text-muted">${detail}</span></span>
          <span class="v">${pts.toFixed(0)} / ${max}</span>
        </div>
        <div class="meter-wrap"><div class="meter-track">
          <div class="meter-fill" style="width:${pct.toFixed(1)}%"></div>
        </div></div>
      </div>`;
  };

  // الرافعة الأكبر = المحور صاحب أكبر نقاط مفقودة
  const gaps = [
    { n: 'عمر رأس المال',   miss: 45 - agePts, how: cwMonths < 36 ? `يرتفع تلقائياً كل شهر حتى ٣ سنوات (الآن ${fmtM(cwMonths)})` : 'مكتمل' },
    { n: 'سنوات الأرباح',   miss: 35 - divPts, how: divCycles < 3 ? `يرتفع مع كل دورة أرباح سنوية جديدة (الآن ${divCycles.toFixed(1)} دورة)` : 'مكتمل' },
    { n: 'تغطية المتوقَّع', miss: 20 - covPts, how: covRatio < 1 ? `${uniqueTickers - fwdCoveredCount} سهم بلا دخل متوقَّع محسوب — سجّل توزيعاتها` : 'مكتمل' },
  ].sort((a, b) => b.miss - a.miss);
  const lever = gaps[0];

  el.innerHTML = `
    <div class="note" data-state="${state}" style="flex-direction:column;gap:10px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%">
        <span style="font-weight:700;font-size:.9rem">${title}</span>
        <span class="tag" data-state="${state}" title="مقياس خاصّ ببيانات التوزيعات: عمر رأس المال (45) · دورات الأرباح (35) · تغطية الدخل المتوقَّع (20).&#10;لا يساوي «ثقة البيانات» في الرؤية المستقبلية ومحرّك القرار — العامل الثالث هناك عدد الأسهم لا تغطية الدخل، فالرقمان يقيسان شيئين مختلفين عمداً.">ثقة بيانات التوزيعات ${score}%</span>
        <span class="tag"
          title="عمر رأس المال الفعلي (مرجَّح بالمعاملات) = ${months} شهر&#10;العمر التقويمي = ${calMonths} شهر&#10;الضخ التدريجي يقلّص عمر رأس المال الفعلي">
          ${cwDiff >= 2
            ? `رأس المال الفعلي: ${monthsText} | تقويمي: ${calText}`
            : `عمر المحفظة: ${monthsText}`}
          · <span title="نفس القيمة المستعملة في احتساب محور «سنوات الأرباح» بالأسفل — دورة جزئية تُحتسب جزئياً. كان الوسم يعرض العدد مقرَّباً لأعلى (${divYears}) بينما التفصيل يعرض ${divCycles.toFixed(1)}، فيظهر رقمان لمقياس واحد في البطاقة نفسها.">${divCycles.toFixed(1)} دورة أرباح</span> · ${uniqueTickers} موزِّع
        </span>
      </div>
      <p style="font-size:.81rem;color:var(--text-2);margin:0;line-height:1.6">${body}</p>

      <details style="width:100%">
        <summary style="cursor:pointer;font-size:.78rem;color:var(--text-2);font-weight:600">
          مِمَّ تتكوّن هذه الدرجة؟ (اضغط للتفصيل)
        </summary>
        <div class="stack-2" style="margin-top:10px">
          ${axis('عمر رأس المال', agePts, 45, `— ${fmtM(cwMonths)}`)}
          ${axis('سنوات الأرباح', divPts, 35, `— ${divCycles.toFixed(1)} دورة`)}
          ${axis('تغطية الدخل المتوقَّع', covPts, 20, `— ${fwdCoveredCount} من ${uniqueTickers} سهم`)}
          <div style="font-size:.75rem;color:var(--text-2);line-height:1.6;margin-top:2px">
            <b>أكبر رافعة:</b> ${esc(lever.n)} — ينقصه ${lever.miss.toFixed(0)} نقطة. ${esc(lever.how)}
          </div>
        </div>
      </details>

      <p style="font-size:.79rem;color:${stVar};margin:0;font-weight:600">💡 ${advice}</p>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// بناء خرائط التكلفة — الحسبة الصحيحة: avg_cost × الأسهم المتبقية
// ══════════════════════════════════════════════════════════════

// تكلفة الحيازات الفعلية لرمز واحد في نهاية سنة معينة — م.2
// ----------------------------------------------------------------------
// كانت هذه الدالة تحسب **متوسط مدى الحياة**: كل المشتريات ÷ كل الأسهم
// المشتراة، ثم × الأسهم المتبقية. وهو ليس المتوسط المرجّح الزمني الذي
// تُعرّفه م.2 وتطبّقه بقية الصفحات: الفرق يظهر فور وجود بيع جزئي متبوع
// بشراء بسعر مختلف. قياس فعلي على «شراء 100@10 → منحة 1:3 → بيع 50@12
// → شراء 30@11»: الصحيح 955.71 ر.س والقديم 923.60 ر.س — فارق 3.4% على
// ثلاث معاملات فقط، ويكبر مع كل بيع.
// والناتج هو **مقام العائد على التكلفة (YOC)** و«استرداد رأس المال»،
// فكان YOC مبالَغاً فيه لأن المقام أصغر من الحقيقي.
// الآن يمرّ عبر `walkWAC` في utils.js — المشي الزمني نفسه الذي تستعمله
// صفحة المعاملات ولوحة التحكم وصفحة الأداء.
function _tickerCostBasisAtYear(ticker, upToYear) {
  const rows = [...txBuyRows, ...txSellRows].filter(t =>
    t.ticker === ticker && t.date &&
    (parseDateLocal(t.date) || new Date(0)).getFullYear() <= upToYear
  );
  const { shares, cost } = walkWAC(rows);
  return shares < 0.001 ? 0 : cost;
}

function buildCostMaps() {
  const allTickers = [...new Set([
    ...txBuyRows.map(t => t.ticker),
    ...txSellRows.map(t => t.ticker),
  ])];

  const txAllYears = [...new Set([
    ...txBuyRows.map(t => (parseDateLocal(t.date) || new Date()).getFullYear()),
    ...txSellRows.map(t => (parseDateLocal(t.date) || new Date()).getFullYear()),
  ])].sort((a, b) => a - b);

  if (!txAllYears.length) {
    return { yearBuyCost: {}, tickerYearCost: {}, yearPortfolio: {}, tickerYearPortfolio: {} };
  }

  const firstYear  = txAllYears[0];
  const currentYear = new Date().getFullYear();

  // ── yearPortfolio: إجمالي تكلفة الحيازات في نهاية كل سنة ───
  const yearPortfolio      = {};
  const tickerYearPortfolio = {};

  for (let yr = firstYear; yr <= currentYear; yr++) {
    const y = String(yr);
    let total = 0;
    allTickers.forEach(ticker => {
      const basis = _tickerCostBasisAtYear(ticker, yr);
      if (!tickerYearPortfolio[ticker]) tickerYearPortfolio[ticker] = { all: 0 };
      tickerYearPortfolio[ticker][y] = basis;
      total += basis;
    });
    yearPortfolio[y] = total;
  }

  // all = القيمة الحالية (آخر سنة)
  yearPortfolio.all = yearPortfolio[String(currentYear)] || 0;
  allTickers.forEach(ticker => {
    if (tickerYearPortfolio[ticker])
      tickerYearPortfolio[ticker].all = tickerYearPortfolio[ticker][String(currentYear)] || 0;
  });

  // ── yearBuyCost و tickerYearCost (مطلوبة لعرض رأس المال في الجدول فقط) ─
  const yearBuyCost    = {};
  const tickerYearCost = {};
  txBuyRows.forEach(tx => {
    const yr     = String((parseDateLocal(tx.date) || new Date(tx.date)).getFullYear());
    const ticker = String(tx.ticker);
    const cost   = tx.type === 'grant' ? 0 : +tx.total || 0;
    yearBuyCost[yr] = (yearBuyCost[yr] || 0) + cost;
    if (!tickerYearCost[ticker]) tickerYearCost[ticker] = { all: 0 };
    tickerYearCost[ticker][yr]  = (tickerYearCost[ticker][yr]  || 0) + cost;
    tickerYearCost[ticker].all  = (tickerYearCost[ticker].all  || 0) + cost;
  });
  yearBuyCost.all = Object.entries(yearBuyCost)
    .filter(([k]) => k !== 'all').reduce((s, [, v]) => s + v, 0);

  return { yearBuyCost, tickerYearCost, yearPortfolio, tickerYearPortfolio };
}

// ══════════════════════════════════════════════════════════════
// رسم الملخصات
// ══════════════════════════════════════════════════════════════
function renderSummaries(maps, fwd) {
  maps = maps || buildCostMaps();
  renderYearlySummary(maps, fwd);
  renderHoldingSummary(maps, fwd);
}

// ── اليمين: الإجمالي السنوي ───────────────────────────────────
function renderYearlySummary({ yearPortfolio }, fwdPrecomputed) {
  const yearMap = {};
  dividends.forEach(d => {
    yearMap[d.year] = (yearMap[d.year] || 0) + +d.amount;
  });
  const years = Object.keys(yearMap).sort((a, b) => b - a);

  const yEl = document.getElementById('yearly-summary');
  if (!years.length) {
    yEl.innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>لا توجد بيانات</p></div>`;
    return;
  }

  // ── حساب أيام السنة الحالية المنقضية ─────────────────────────
  const today       = new Date();
  const currentYear = today.getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);          // 1 يناير
  const daysElapsed = Math.floor((today - startOfYear) / 86400000) + 1;  // +1 ليشمل اليوم
  const daysInYear  = ((currentYear % 4 === 0 && currentYear % 100 !== 0) || currentYear % 400 === 0) ? 366 : 365;

  // Forward projected للسنة الجارية
  const fwd = fwdPrecomputed || _projectedAnnualIncome();
  // ⚠️ **نفس مقام** شريط الإحصائيات (`_currentCostBasis`). التعليق فوق تلك
  // الدالة يُعلن توحيد المقام على جدول الحيازات (م.15/2)، وهذا الموضع كان
  // يُعيد البناء من دفتر المعاملات — فـ`avg_price` محرّراً يدوياً يعطي مقامين
  // مختلفين لنفس المقياس في الصفحة الواحدة (8.33% مقابل 10.00%).
  const fwdNetCap = _currentCostBasis();
  const fwdYocPct = fwdNetCap > 0 ? fwd.total / fwdNetCap * 100 : 0;

  yEl.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr>
      <th>السنة</th>
      <th title="رأس المال المنشغل = مشتريات تراكمية − مبيعات تراكمية&#10;السنة الجارية: حتى اليوم | السنوات المنتهية: 31 ديسمبر">رأس المال المنشغل</th>
      <th>الأرباح المستلمة</th>
      <th title="سنوات منتهية: أرباح فعلية ÷ رأس المال أول السنة&#10;السنة الجارية: عائد فعلي جزئي حتى الآن">العائد الفعلي %</th>
    </tr></thead>
    <tbody>${years.map(y => {
      const isCurrentYear = +y === currentYear;

      // ══════════════════════════════════════════════════════════════
      // المقام = **متوسط** رأس المال داخل السنة، لا أوّلها ولا آخرها
      // --------------------------------------------------------------
      // عائد فترة على رأس مال متحرّك يُقاس على متوسط رأس المال المستثمر
      // (مبدأ Modified Dietz). ومقامُ «أول المدة» صالح فقط حين لا تدفّق
      // داخل السنة — وم.7 تفرض ضخّاً 8,000 ر.س شهرياً = 42% من المحفظة،
      // فالشرط لا يتحقق أبداً.
      //
      // والأسوأ أن الصفحة كانت تحمل مقامين متعاكسين لنفس البسط: الجدول
      // السنوي على **أول يناير** وجدول «لكل سهم» على **31 ديسمبر**.
      // قياس فعلي — 100,000 أول السنة وضخّ 8,000 شهرياً ⇒ 196,000 آخرها،
      // وتوزيعات 8,140 (= 5.5% على المتوسط 148,000):
      //     الجدول السنوي   8.14%  (+48%)
      //     جدول لكل سهم    4.15%  (−25%)
      //     الصحيح          5.50%
      // رقمان متجاوران، أحدهما ضِعف الآخر تقريباً.
      // ══════════════════════════════════════════════════════════════
      const endPort   = yearPortfolio[y]          ?? 0;
      const prevYear  = String(+y - 1);
      const beginPort = yearPortfolio[prevYear]   ?? 0;
      // متوسط بسيط بين طرفَي السنة — تقريبٌ صادق لـMidpoint Dietz، وأقرب
      // بكثير من أيّ طرف وحده. السنة الأولى بلا «قبلها» ⇒ نهاية السنة.
      const denominator = (beginPort > 0 && endPort > 0) ? (beginPort + endPort) / 2
                        : (beginPort > 0 ? beginPort : endPort);

      let yieldStr, yieldCls, tooltip;

      if (denominator > 0 && yearMap[y] > 0) {
        if (isCurrentYear) {
          // سنة جارية: نعرض العائد الفعلي حتى الآن (بلا توسيع خطّي مضلِّل)
          // التقدير السنوي المعتمد (TTM) معروض في شريط الإحصائيات بالأعلى
          const pct = yearMap[y] / denominator * 100;
          yieldStr = pct.toFixed(2) + '% 🔄';
          yieldCls = pct >= 5 ? 'text-success' : pct >= 3 ? 'text-accent' : 'text-muted';
          tooltip  = 'السنة الجارية ' + currentYear + ' — يوم ' + daysElapsed + ' من ' + daysInYear + '\n' +
                     'أرباح مستلمة حتى الآن: ' + formatSAR(yearMap[y]) + '\n' +
                     'رأس المال أول يناير ' + currentYear + ': ' + formatSAR(denominator) + '\n' +
                     '─────────────────────────────\n' +
                     'العائد الفعلي حتى الآن (جزئي): ' + pct.toFixed(2) + '%\n' +
                     'للتقدير السنوي الكامل راجع مؤشر TTM في الأعلى';
        } else {
          // سنة منتهية: أرباح فعلية ÷ رأس المال أول يناير من تلك السنة
          const pct = yearMap[y] / denominator * 100;
          yieldStr = pct.toFixed(2) + '%';
          yieldCls = pct >= 5 ? 'text-success' : pct >= 3 ? 'text-accent' : 'text-muted';
          tooltip  = 'أرباح ' + y + ' (فعلية): ' + formatSAR(yearMap[y]) + '\n' +
                     'رأس المال أول يناير ' + y + ': ' + formatSAR(denominator) + '\n' +
                     (beginPort > 0 ? '' : '(أول سنة في السجل — استُخدم نهاية السنة)\n') +
                     '─────────────────────────────\n' +
                     'العائد: ' + pct.toFixed(2) + '%';
        }
      } else {
        yieldStr = '—';
        yieldCls = 'text-muted';
        tooltip  = denominator === 0 ? 'لا يوجد رأس مال مسجّل لهذه السنة' : 'لا توجد أرباح';
      }

      // عرض رأس المال: للسنة الجارية يوضّح أنه "حتى اليوم"
      const portDisplay = endPort > 0
        ? formatSAR(endPort) + (isCurrentYear
            ? `<br><span class="small text-muted">حتى اليوم</span>`
            : `<br><span class="small text-muted">31 ديس ${y}</span>`)
        : '—';

      return `<tr>
        <td>
          <strong>${y}</strong>
          ${isCurrentYear
            ? ` <span style="font-size:0.65rem;background:#f0b429;color:#000;padding:1px 6px;border-radius:4px;font-weight:700">🔄 جارية</span>`
            : ` <span style="font-size:0.65rem;background:rgba(248,81,73,0.15);color:#f85149;padding:1px 6px;border-radius:4px;font-weight:700">منتهية</span>`}
        </td>
        <td class="num text-muted"
            title="مستخدم في حساب العائد: رأس المال أول يناير ${y} = ${beginPort > 0 ? formatSAR(beginPort) : 'غير متوفر (أول سنة)'}">
          ${portDisplay}
        </td>
        <td class="num text-success bold">
          ${formatSAR(yearMap[y])}
          ${isCurrentYear
            ? `<br><span class="small text-muted">يوم ${daysElapsed} / ${daysInYear}</span>`
            : ''}
        </td>
        <td class="num ${yieldCls}" title="${tooltip}" style="cursor:help">
          ${yieldStr}
        </td>
      </tr>`;
    }).join('')}
    ${fwd.total > 0 ? `<tr style="border-top:2px solid var(--border);background:rgba(63,185,80,0.05)">
      <td><strong style="color:var(--success)">▶ متوقع</strong>
        <span style="font-size:0.65rem;background:rgba(63,185,80,0.2);color:#3fb950;padding:1px 6px;border-radius:4px;font-weight:700">Forward</span>
      </td>
      <td class="num text-muted" title="تكلفة الحيازات الحالية">${fwdNetCap > 0 ? formatSAR(fwdNetCap) : '—'}</td>
      <td class="num text-success bold"
        title="الدخل السنوي المتوقع من المحفظة الحالية&#10;= مجموع (مجموع التوزيع للسهم خلال آخر 12 شهراً × أسهمك الحالية) لكل رمز">
        ${formatSAR(fwd.total)}
        <br><span class="small text-muted">≈ ${formatSAR(fwd.total/12)} / شهر</span>
      </td>
      <td class="num ${fwdYocPct >= 5 ? 'text-success' : fwdYocPct >= 3 ? 'text-accent' : 'text-muted'} bold"
        title="Forward YOC = الدخل المتوقع ÷ تكلفة الحيازات&#10;يعكس العائد الحقيقي للمحفظة الحالية بصرف النظر عن نموها">
        ${fwdYocPct.toFixed(2)}%
        <br><span class="small" style="color:var(--text-muted);font-weight:400">يُقارَن بياهو</span>
      </td>
    </tr>` : ''}
  </tbody></table></div>
  <p class="small text-muted mt-2" style="padding:0 4px">
    🔄 <strong>السنة الجارية</strong>: عائد جزئي فعلي حتى اليوم (${daysElapsed}/${daysInYear} يوم) — ليس مقياس الأداء الأنسب للسنة غير المكتملة |
    ▶ <strong>Forward</strong>: الأدق — آخر دفعة لكل سهم × دوريتها × الأسهم الحالية (مثل ياهو فاينانس) |
    السنوات المنتهية: أرباح فعلية ÷ رأس المال أول يناير
  </p>`;
}

// ── اليسار: لكل سهم مع فلتر السنة ───────────────────────────
function renderHoldingSummary({ tickerYearCost, tickerYearPortfolio }, fwdPrecomputed) {
  // جمع الأرباح لكل سهم لكل سنة
  const holdMap = {};
  dividends.forEach(d => {
    if (!holdMap[d.ticker]) holdMap[d.ticker] = { name: d.name, total: 0, byYear: {} };
    holdMap[d.ticker].total += +d.amount;
    const yr = String(d.year);
    holdMap[d.ticker].byYear[yr] = (holdMap[d.ticker].byYear[yr] || 0) + +d.amount;
  });

  // السنوات المتاحة (من الأرباح أو المعاملات، مدمجة)
  const divYears  = [...new Set(dividends.map(d => String(d.year)))];
  const txYears   = [...new Set([...txBuyRows, ...txSellRows].map(tx => String((parseDateLocal(tx.date) || new Date(tx.date)).getFullYear())))];
  const allYears  = [...new Set([...divYears, ...txYears])].sort((a, b) => b - a);

  const tickers    = Object.keys(holdMap).sort((a, b) => holdMap[b].total - holdMap[a].total);
  const grandTotal = dividends.reduce((s, d) => s + +d.amount, 0);

  const hEl = document.getElementById('holding-summary');
  if (!tickers.length) {
    hEl.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p>لا توجد بيانات</p></div>`;
    return;
  }

  // بناء tabs/أزرار السنوات
  const tabsHtml = `
    <div class="div-year-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
      <button class="btn btn-sm ${selectedYear==='all'?'btn-primary':'btn-secondary'}"
        onclick="switchDivYear('all')">الكل</button>
      ${allYears.map(y => `
        <button class="btn btn-sm ${selectedYear===y?'btn-primary':'btn-secondary'}"
          onclick="switchDivYear('${y}')">${y}</button>
      `).join('')}
    </div>`;

  // البيانات حسب السنة المختارة
  const rows = tickers.map(ticker => {
    const h = holdMap[ticker];
    let divAmt, portVal;

    if (selectedYear === 'all') {
      divAmt  = h.total;
      portVal = tickerYearPortfolio[ticker]?.all ?? null;
    } else {
      divAmt  = h.byYear[selectedYear] || 0;
      // ⚠️ **نفس مقام الجدول السنوي**: متوسط طرفَي السنة لا نهايتها.
      // كان هذا الجدول يقسم على 31 ديسمبر والجدول السنوي على أول يناير —
      // مقامان متعاكسان لنفس البسط في الصفحة الواحدة، والفرق يبلغ الضِّعف
      // في محفظة يدخلها ضخّ شهري (م.7).
      const _end  = tickerYearPortfolio[ticker]?.[selectedYear] ?? null;
      const _beg  = tickerYearPortfolio[ticker]?.[String(+selectedYear - 1)] ?? null;
      portVal = (_beg > 0 && _end > 0) ? (_beg + _end) / 2 : _end;
    }

    return { ticker, name: h.name, divAmt, portVal };
  }).filter(r => selectedYear === 'all' || r.divAmt > 0);

  // إجماليات الصف السفلي
  const yearDivTotal = selectedYear === 'all'
    ? grandTotal
    : dividends.filter(d => String(d.year) === selectedYear).reduce((s,d) => s + +d.amount, 0);

  const yearLabel = selectedYear === 'all' ? 'الكل' : selectedYear;

  // بناء خريطة ثقة البيانات لكل سهم
  const today = new Date();
  const tickerConfidence = {};
  tickers.forEach(ticker => {
    // AUDIT-FIX: a.date?.localeCompare(b.date) يرجع undefined عند غياب date —
    // نستخدم _divSortDate (يبني التاريخ من year/month عند الغياب) كمقارن صالح.
    const tickerDivs = dividends.filter(d => d.ticker === ticker)
      .sort((a, b) => _divSortDate(a).localeCompare(_divSortDate(b)));
    const firstDate   = tickerDivs[0] ? parseDateLocal(_divSortDate(tickerDivs[0])) : null;
    const daysSince   = firstDate ? Math.floor((today - firstDate) / 86400000) : 0;
    const paymentCount = tickerDivs.length;
    const level = (daysSince >= 730 && paymentCount >= 3) ? 'full'
                : (daysSince >= 365 && paymentCount >= 2) ? 'partial'
                : 'low';
    tickerConfidence[ticker] = { daysSince, paymentCount, level };
  });

  // Forward projected لكل سهم (للعمود الإضافي)
  const fwdData = fwdPrecomputed || _projectedAnnualIncome();
  const fwdMap  = {};
  fwdData.breakdown.forEach(b => { fwdMap[b.ticker] = b; });

  const showFwdCol = selectedYear === 'all' || selectedYear === String(today.getFullYear());

  hEl.innerHTML = tabsHtml + `
    <div class="table-wrapper"><table>
      <thead><tr>
        <th>الرمز</th>
        <th>الاسم</th>
        <th title="صافي رأس المال المستثمر في هذا السهم حتى 31 ديسمبر = مشتريات تراكمية − مبيعات تراكمية">قيمة الاستثمار${selectedYear!=='all'?' '+selectedYear:''}</th>
        <th>الأرباح${selectedYear!=='all'?' '+selectedYear:''}</th>
        <th title="العائد على التكلفة = أرباح ÷ قيمة الاستثمار">YOC % فعلي</th>
        ${showFwdCol ? `<th title="Forward = مجموع التوزيع للسهم خلال آخر 12 شهراً × أسهمك الحالية — مثل ياهو فاينانس&#10;الأدق للمحافظ النامية" style="color:var(--success)">▶ Forward / سنة</th>` : ''}
        <th>ثقة البيانات</th>
      </tr></thead>
      <tbody>${rows.length ? rows.map(r => {
        const conf   = tickerConfidence[r.ticker] || {};
        const yoc    = r.portVal > 0 && r.divAmt > 0 ? (r.divAmt / r.portVal * 100) : null;
        let yocStr = '—', yocCls = 'text-muted';
        if (yoc != null) {
          yocStr = yoc.toFixed(2) + '%';
          yocCls = yoc >= 5 ? 'text-success' : yoc >= 3 ? 'text-accent' : 'text-muted';
        }

        // Forward cell
        let fwdCell = '';
        if (showFwdCol) {
          const fb = fwdMap[r.ticker];
          if (fb) {
            const fwdYoc = r.portVal > 0 ? fb.projected / r.portVal * 100 : 0;
            const fwdCls = fwdYoc >= 5 ? 'text-success' : fwdYoc >= 3 ? 'text-accent' : 'text-muted';
            const fallbackNote = fb.usedFallback ? '&#10;⚠️ تقدير: بُني قبل شراء السهم' : '';
            fwdCell = `<td class="num ${fwdCls}"
              title="DPS: ${fb.dps.toFixed(4)} ر.س&#10;دورية: ${fb.freqLabel} (×${fb.freq})&#10;الأسهم الحالية: ${fb.currentShares.toFixed(0)}&#10;الدخل المتوقع: ${formatSAR(fb.projected)}${fallbackNote}" style="cursor:help">
              ${formatSAR(fb.projected)}
              <br><span class="small" style="font-weight:400">${fwdYoc.toFixed(2)}% — ${fb.freqLabel}${fb.usedFallback ? ' ⚠️' : ''}</span>
            </td>`;
          } else {
            fwdCell = `<td class="num text-muted" title="لا توجد أسهم حالية أو لا توجد دفعات مسجّلة">—</td>`;
          }
        }

        // شارة الثقة
        let confBadge;
        if (conf.level === 'full') {
          confBadge = `<span title="${conf.daysSince} يوم — ${conf.paymentCount} توزيعات — دورتان كاملتان أو أكثر" style="cursor:help;background:rgba(63,185,80,0.12);color:#3fb950;border-radius:4px;padding:2px 6px;font-size:0.72rem;font-weight:600">✅ موثوق</span>`;
        } else if (conf.level === 'partial') {
          const msg = `${conf.daysSince} يوم — ${conf.paymentCount} توزيعات — دورة واحدة قد تكون ناقصة (ربع رابع متأخر). يحتاج 730 يوماً و3 توزيعات للثقة الكاملة`;
          confBadge = `<span title="${msg}" style="cursor:help;display:inline-flex;align-items:center;gap:3px;background:rgba(240,180,41,0.12);color:#f0b429;border-radius:4px;padding:2px 6px;font-size:0.72rem;font-weight:600">🟡 بيانات أولية</span>`;
        } else {
          const msg = conf.paymentCount < 2
            ? `توزيعة واحدة فقط — غير كافٍ للحكم على النمط`
            : `${conf.daysSince} يوم فقط — يحتاج سنة كاملة على الأقل`;
          confBadge = `<span title="${msg}" style="cursor:help;display:inline-flex;align-items:center;gap:3px;background:rgba(248,81,73,0.12);color:#f85149;border-radius:4px;padding:2px 6px;font-size:0.72rem;font-weight:600">⚠️ بيانات غير كافية</span>`;
        }
        return `<tr>
          <td><strong class="text-accent">${esc(r.ticker)}</strong></td>
          <td>${esc(r.name)}</td>
          <td class="num text-muted">${r.portVal != null && r.portVal > 0 ? formatSAR(r.portVal) : '—'}</td>
          <td class="num text-success bold">${formatSAR(r.divAmt)}</td>
          <td class="num ${yocCls}">${yocStr}</td>
          ${fwdCell}
          <td>${confBadge}</td>
        </tr>`;
      }).join('') : `<tr><td colspan="${showFwdCol ? 7 : 6}" class="text-center text-muted small" style="padding:20px">
        لا توجد أرباح مسجلة لسنة ${yearLabel}
      </td></tr>`}</tbody>
      <tfoot><tr style="border-top:2px solid var(--border)">
        <td colspan="3"><strong>إجمالي ${yearLabel}</strong></td>
        <td class="num bold text-accent">${formatSAR(yearDivTotal)}</td>
        ${showFwdCol ? `<td class="num bold text-success"
          title="مجموع الدخل السنوي المتوقع من جميع الأسهم الحالية">
          ${fwdData.total > 0 ? formatSAR(fwdData.total) + '<br><span class="small" style="font-weight:400">متوقع/سنة</span>' : '—'}
        </td>` : ''}
        <td colspan="${showFwdCol ? 1 : 2}"></td>
      </tr></tfoot>
    </table></div>
  <div class="small text-muted mt-2" style="padding:6px 4px;border-top:1px solid var(--border);margin-top:8px">
    💡 <strong>YOC الفعلي منخفض؟</strong> — طبيعي إذا نمت محفظتك مؤخراً: الأرباح المقاسة جُمعت حين كانت أصغر، بينما المقام (تكلفة الحيازات) يعكس حجمها الحالي الأكبر.
    <strong>▶ Forward</strong> هو الأدق — يحسب ما تتوقع استلامه بناءً على محفظتك الحالية وآخر دفعة لكل سهم (نفس طريقة ياهو فاينانس).
  </div>`;
}

function switchDivYear(yr) {
  selectedYear = yr;
  renderHoldingSummary(buildCostMaps());
}

// ══════════════════════════════════════════════════════════════
// جدول السجلات
// ══════════════════════════════════════════════════════════════
function filterDivTable() {
  divFilter = document.getElementById('div-filter-input')?.value.trim().toUpperCase() || '';
  renderTable();
  const countEl = document.getElementById('div-filter-count');
  if (countEl) {
    const filtered = _filteredDividends();
    countEl.textContent = divFilter
      ? `${filtered.length} من ${dividends.length} سجل`
      : '';
  }
}

function _filteredDividends() {
  if (!divFilter) return dividends;
  return dividends.filter(d =>
    (d.ticker || '').toUpperCase().includes(divFilter) ||
    (d.name   || '').toUpperCase().includes(divFilter)
  );
}

function renderTable() {
  const tbody = document.getElementById('div-tbody');
  if (!tbody) return;

  const rows = _filteredDividends();

  if (!dividends.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">💰</div><p>لا توجد أرباح مسجلة بعد</p></div></td></tr>`;
    enableInlineEditing(tbody, onDivSaved);
    return;
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">🔍</div><p>لا توجد نتائج للبحث عن "<strong>${esc(divFilter)}</strong>"</p></div></td></tr>`;
    enableInlineEditing(tbody, onDivSaved);
    return;
  }

  tbody.innerHTML = rows.map(d => `<tr>
    <td ${ed('dividends',d.id,'date','date',d.date)}>${formatDate(d.date)}</td>
    <td ${ed('dividends',d.id,'ticker','text',d.ticker,'text-accent bold')}>${esc(d.ticker)}</td>
    <td ${ed('dividends',d.id,'name','text',d.name)}>${esc(d.name)}</td>
    <td ${ed('dividends',d.id,'amount','number',d.amount,'num text-success bold')}>${formatSAR(d.amount)}</td>
    <td ${ed('dividends',d.id,'month','text',d.month,'','month')}>${MONTHS_AR[d.month-1]}</td>
    <td ${ed('dividends',d.id,'year','number',d.year,'num')}>${d.year}</td>
    <td><button class="btn btn-danger btn-sm" onclick="archiveDiv('${esc(d.id)}')">أرشفة</button></td>
  </tr>`).join('');

  enableInlineEditing(tbody, onDivSaved);
}

async function onDivSaved(id, field, val) {
  const d = dividends.find(x => x.id === id);
  if (d) d[field] = val;
  renderAll();
}

async function addDividend(e) {
  e.preventDefault();
  const ticker = document.getElementById('d-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('d-name').value.trim();
  const amount = +document.getElementById('d-amount').value;

  if (!ticker)      { showToast('أدخل رمز السهم', 'error'); return; }
  if (!name)        { showToast('أدخل اسم السهم', 'error'); return; }
  if (amount <= 0)  { showToast('مبلغ الأرباح يجب أن يكون أكبر من صفر', 'error'); return; }

  // تحذير إذا كان المبلغ أكبر من 10x متوسط توزيعات نفس السهم
  const sameTickerDivs = dividends.filter(d => d.ticker === ticker && +d.amount > 0);
  if (sameTickerDivs.length >= 2) {
    const avg = sameTickerDivs.reduce((s, d) => s + +d.amount, 0) / sameTickerDivs.length;
    if (amount > avg * 10) {
      const confirmed = await confirmAsync(
        `تحذير: المبلغ المُدخَل (${formatSAR(amount)}) يتجاوز 10 أضعاف متوسط توزيعات ${name} (${formatSAR(avg)}).\n\nهل أنت متأكد؟`
      );
      if (!confirmed) return;
    }
  }

  if (!await confirmAsync(`هل تريد تسجيل أرباح ${name || ticker} بمبلغ ${formatSAR(amount)}؟`)) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id: user.id,
    date:    document.getElementById('d-date').value,
    ticker, name, amount,
    month:   +document.getElementById('d-month').value,
    year:    +document.getElementById('d-year').value
  };
  const { error } = await supabaseClient.from('dividends').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تمت إضافة الأرباح', 'success');
  document.getElementById('div-form').reset();
  const now = new Date();
  document.getElementById('d-date').value  = todayISO();
  document.getElementById('d-month').value = now.getMonth() + 1;
  document.getElementById('d-year').value  = now.getFullYear();
  await loadData();
  renderAll();
}

async function archiveDiv(id) {
  // AUDIT-FIX: replace blocking confirm() with async modal (mobile-safe, CSP-safe)
  if (!await confirmAsync('أرشفة هذه الأرباح؟ ستُخفى من الحسابات لكنها تبقى في قاعدة البيانات.')) return;
  const { error } = await supabaseClient.from('dividends').update({ is_archived: true }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تمت الأرشفة', 'success');
  await loadData();
  renderAll();
  await loadArchivedDividends();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportDividendsCSV() {
  if (!dividends.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  const rows = _filteredDividends();
  if (!rows.length) { showToast('لا توجد سجلات مطابقة للتصدير', 'error'); return; }
  const suffix = divFilter ? `_${divFilter}` : '';
  exportCSV(`أرباح_موزعة${suffix}_${todayISO()}.csv`,
    ['التاريخ', 'الرمز', 'الاسم', 'المبلغ', 'الشهر', 'السنة'],
    rows.map(d => [d.date, d.ticker, d.name, d.amount, MONTHS_AR[d.month - 1], d.year])
  );
  showToast(`✓ تم تصدير ${rows.length} سجل${divFilter ? ` (${divFilter})` : ''}`, 'success');
}

// ══════════════════════════════════════════════════════════════
// البار شارت — الدخل الشهري / السنوي
// ══════════════════════════════════════════════════════════════
function setChartView(v) {
  chartView = v;
  document.getElementById('chart-view-month').className = 'btn btn-sm ' + (v==='month' ? 'btn-primary' : 'btn-secondary');
  document.getElementById('chart-view-year').className  = 'btn btn-sm ' + (v==='year'  ? 'btn-primary' : 'btn-secondary');
  renderIncomeChart();
}

function setIncomeMode(mode) {
  incomeMode = mode;
  ['bar','line','stacked','table'].forEach(m => {
    document.getElementById('im-' + m)?.classList.toggle('active', m === mode);
  });
  renderIncomeChart();
}

function renderIncomeChart() {
  const canvas   = document.getElementById('income-bar-chart');
  const wrap     = document.getElementById('income-chart-wrap');
  const tableArea = document.getElementById('income-table-area');
  const legend   = document.getElementById('income-chart-legend');

  if (!canvas) return;

  if (incomeMode === 'table') {
    if (incomeChart) { incomeChart.destroy(); incomeChart = null; }
    if (wrap)      wrap.style.display = 'none';
    if (legend)    legend.style.display = 'none';
    if (tableArea) { tableArea.style.display = ''; tableArea.innerHTML = _buildIncomeTable(); }
    return;
  }

  if (wrap)       wrap.style.display = '';
  if (legend)     legend.style.display = incomeMode === 'stacked' ? 'none' : '';
  if (tableArea)  tableArea.style.display = 'none';

  if (chartView === 'year') {
    renderYearChart(canvas);
  } else {
    renderMonthChart(canvas);
  }
}

// palette for stacked mode
const STACKED_COLORS = ['#14b8a6','#3fb950','#58a6ff','#f0b429','#f85149','#bc8cff','#ff7b72','#39d353','#79c0ff','#ffa657','#d2a8ff','#56d364'];

function renderYearChart(canvas) {
  const yearMap = {};
  dividends.forEach(d => { yearMap[String(d.year)] = (yearMap[String(d.year)] || 0) + +d.amount; });
  const years  = Object.keys(yearMap).sort((a,b) => +a - +b);
  const values = years.map(y => yearMap[y]);
  const total  = values.reduce((s,v) => s+v, 0);

  document.getElementById('chart-total-label').textContent = 'إجمالي كل السنوات: ~' + total.toFixed(2) + ' ر.س';

  if (incomeMode === 'stacked') {
    const tickers = [...new Set(dividends.map(d => d.ticker))].sort();
    const datasets = tickers.map((t, i) => {
      const data = years.map(y => dividends.filter(d => d.ticker === t && String(d.year) === y).reduce((s,d) => s + +d.amount, 0));
      const c = STACKED_COLORS[i % STACKED_COLORS.length];
      return { label: t, data, backgroundColor: c + 'cc', borderColor: c, borderWidth: 1, borderRadius: 2 };
    });
    buildChart(canvas, years, datasets, true);
  } else {
    buildChart(canvas, years, [{ data: values, backgroundColor: values.map(() => '#14b8a6cc'), borderColor: '#14b8a6', borderWidth: 1, borderRadius: 4, label: 'مستلم' }]);
  }
}

function renderMonthChart(canvas) {
  const now = new Date();
  const labels = [];
  const periodKeys = [];
  for (let i = 11; i >= 0; i--) {
    const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periodKeys.push(d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'));
    labels.push(MONTHS_AR[d.getMonth()].slice(0,3) + ' \'' + String(d.getFullYear()).slice(2));
  }

  if (incomeMode === 'stacked') {
    const tickers = [...new Set(dividends.map(d => d.ticker))].sort();
    const datasets = tickers.map((t, i) => {
      const data = periodKeys.map(key => {
        return dividends.filter(d => d.ticker === t && _divPeriodKey(d) === key).reduce((s,d) => s + +d.amount, 0);
      });
      const c = STACKED_COLORS[i % STACKED_COLORS.length];
      return { label: t, data, backgroundColor: c + 'cc', borderColor: c, borderWidth: 1, borderRadius: 2 };
    });
    const total = dividends.filter(d => periodKeys.includes(_divPeriodKey(d))).reduce((s,d) => s + +d.amount, 0);
    document.getElementById('chart-total-label').textContent = 'إجمالي آخر 12 شهراً تقويمياً: ~' + total.toFixed(2) + ' ر.س';
    buildChart(canvas, labels, datasets, true);
    return;
  }

  const actualMap = {};
  dividends.forEach(d => { const key = _divPeriodKey(d); actualMap[key] = (actualMap[key] || 0) + +d.amount; });
  const received = periodKeys.map(k => actualMap[k] || 0);
  const total    = received.reduce((s,v) => s+v, 0);
  document.getElementById('chart-total-label').textContent = 'إجمالي آخر 12 شهراً تقويمياً: ~' + total.toFixed(2) + ' ر.س';

  buildChart(canvas, labels, [{ label: 'مستلم', data: received, backgroundColor: '#14b8a6cc', borderColor: '#14b8a6', borderWidth: 1, borderRadius: 4 }]);
}

function _buildIncomeTable() {
  if (!dividends.length) return '<p class="small text-muted" style="padding:12px">لا توجد بيانات</p>';

  if (chartView === 'year') {
    const yearMap = {};
    dividends.forEach(d => { yearMap[String(d.year)] = (yearMap[String(d.year)] || 0) + +d.amount; });
    const years = Object.keys(yearMap).sort((a,b) => +b - +a);
    const total = Object.values(yearMap).reduce((s,v) => s+v, 0);
    const rows = years.map(y => `<tr><td>${y}</td><td class="num">${formatSAR(yearMap[y])}</td><td class="num text-muted">${(yearMap[y]/total*100).toFixed(1)}%</td></tr>`).join('');
    return `<table class="data-table"><thead><tr><th>السنة</th><th>الإجمالي</th><th>النسبة</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td><strong>المجموع</strong></td><td class="num"><strong>${formatSAR(total)}</strong></td><td></td></tr></tfoot></table>`;
  }

  // monthly view
  const now = new Date();
  const rows = [];
  let total = 0;
  for (let i = 11; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr  = d.getFullYear(), mo = d.getMonth() + 1;
    // ⚠️ التبويب بـ`_divPeriodKey` كما يفعل الرسم في البطاقة نفسها.
    // إصلاح 2026-08-21 وحّد الرسم على حقل `date` ونسي الجدول، فسجلّ
    // تاريخه 2026-01-05 وحقلاه year=2025/month=12 يظهر في **شهرين مختلفين**
    // بحسب أي زرّ تضغط داخل البطاقة الواحدة.
    const _key = `${yr}-${String(mo).padStart(2, '0')}`;
    const amt = dividends.filter(x => _divPeriodKey(x) === _key).reduce((s,x) => s + +x.amount, 0);
    total += amt;
    const label = MONTHS_AR[mo-1] + ' ' + yr;
    rows.push(`<tr${amt === 0 ? ' style="opacity:0.4"' : ''}><td>${label}</td><td class="num">${amt > 0 ? formatSAR(amt) : '—'}</td></tr>`);
  }
  return `<table class="data-table"><thead><tr><th>الشهر</th><th>المستلم</th></tr></thead><tbody>${rows.reverse().join('')}</tbody><tfoot><tr><td><strong>الإجمالي</strong></td><td class="num"><strong>${formatSAR(total)}</strong></td></tr></tfoot></table>`;
}

function buildChart(canvas, labels, datasets, stacked = false) {
  if (incomeChart) { incomeChart.destroy(); incomeChart = null; }

  const isDark = !document.body.classList.contains('light-mode');
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tickColor = isDark ? '#8b949e' : '#666';

  const isLine    = incomeMode === 'line';
  const chartType = isLine ? 'line' : 'bar';

  const processedDatasets = datasets.map(ds => isLine
    ? { ...ds, type: 'line', fill: true, tension: 0.35, pointRadius: 3, pointHoverRadius: 5,
        backgroundColor: (ds.borderColor || '#14b8a6') + '30',
        borderColor: ds.borderColor || '#14b8a6', borderWidth: 2 }
    : ds);

  incomeChart = new Chart(canvas, {
    type: chartType,
    data: { labels, datasets: processedDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: stacked, position: 'bottom', labels: { color: tickColor, font: { family: 'Tajawal', size: 10 }, padding: 8, usePointStyle: true, boxWidth: 10 } },
        tooltip: {
          rtl: true,
          callbacks: {
            label: ctx => ' ' + ctx.dataset.label + ': ' + formatSAR(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: {
          stacked: stacked,
          ticks: { color: tickColor, font: { family: 'Tajawal', size: 11 } },
          grid:  { color: gridColor }
        },
        y: {
          stacked: stacked,
          ticks: { color: tickColor, font: { family: 'Tajawal', size: 11 }, callback: v => v >= 1000 ? (v/1000).toFixed(1)+'k' : v },
          grid: { color: gridColor }
        }
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════
// 🏆 Dividend Quality Dashboard
// ══════════════════════════════════════════════════════════════

function renderDividendQuality() {
  const el = document.getElementById('div-quality-body');
  if (!el) return;

  // ── بناء 1: المبالغ الإجمالية (للعرض فقط — "آخر توزيع مستلم") ──
  const byTickerYear = {};
  dividends.forEach(d => {
    const t = d.ticker;
    const y = +d.year;
    if (!t || !y) return;
    if (!byTickerYear[t]) byTickerYear[t] = {};
    byTickerYear[t][y] = (byTickerYear[t][y] || 0) + +d.amount;
  });

  // ── بناء 2: سلسلة DPS مؤرّخة — أساس نوافذ الاثني عشر شهراً ──────────────
  // المشكلة الأساسية: المبلغ الإجمالي يتأثر بحجم مركزك (شراء/بيع جزئي).
  // مثال: بعت 400 سهم من 1500 في فبراير → توزيع مايو أقل بالمبلغ
  //        رغم أن الشركة دفعت نفس DPS — الكود يحسبها "تراجع" خطأً.
  //
  // الحل: DPS = مبلغ التوزيع ÷ الأسهم المملوكة وقت التوزيع
  //   ✓ يعكس قرار الشركة الفعلي — لا حجم محفظتك
  //   ✓ محصّن ضد البيع الجزئي والشراء الإضافي
  //
  // AUDIT-FIX (2026-08) — إعادة بناء جذرية: كانت الدرجات مجمّعة على **السنة
  // التقويمية**، فكانت كل الأسهم تُعطى 51/100 بالضبط ولا تتحرك حتى يناير 2027:
  //   • النمو مقفل خلف سنتين تقويميتين مكتملتين → null
  //   • الثبات مقفل خلف ثلاث سنوات مكتملة → null
  //   • الاستمرارية = 35 × انتظام × نضج، مبنية على **أرقام السنوات فقط** ولا
  //     تلمس مبلغ التوزيع إطلاقاً → سهم ضاعف توزيعه وسهم قطعه 80% متساويان.
  // البديل: نوافذ 12 شهراً متحرّكة مرساتها **آخر توزيعة** (لا رأس السنة)،
  // والاستمرارية تقيس الدفع الفعلي والمبلغ (Dividend Streak تُصفَّر عند القطع).
  const dpsSeriesByTicker = {};  // ticker → [{ t, dps }] — DPS مُطبَّع، تصاعدياً
  const rawSeriesByTicker = {};  // ticker → [{ t, dps }] — مبالغ خام (احتياطي)
  const dpsNormalized     = {};  // ticker → هل تتوفر بيانات المعاملات؟

  dividends.forEach(d => {
    const t = d.ticker;
    if (!t) return;
    const divDate = _divSortDate(d);              // تاريخ التوزيع
    const dt      = parseDateLocal(divDate) || new Date(divDate);
    if (!dt || isNaN(dt)) return;
    const ms = dt.getTime();

    (rawSeriesByTicker[t] = rawSeriesByTicker[t] || []).push({ t: ms, dps: +d.amount });

    const sharesAtDiv = _sharesAtDate(t, divDate); // أسهمك وقت التوزيع
    if (sharesAtDiv < 0.001) return;               // لا أسهم مسجّلة وقتها
    (dpsSeriesByTicker[t] = dpsSeriesByTicker[t] || []).push({ t: ms, dps: +d.amount / sharesAtDiv });
    dpsNormalized[t] = true;
  });
  Object.values(dpsSeriesByTicker).forEach(a => a.sort((x, y) => x.t - y.t));
  Object.values(rawSeriesByTicker).forEach(a => a.sort((x, y) => x.t - y.t));

  // ══════════════════════════════════════════════════════════════════
  // م.22 — إعادة بيان DPS عند المنحة قبل أي مقارنة
  // ------------------------------------------------------------------
  // `DPS = المبلغ ÷ الأسهم وقت التوزيعة` محصَّن ضد الشراء والبيع الجزئي
  // (وهو المقصود)، وغير محصَّن ضد **المنحة**: عدد الأسهم يقفز بلا تغيّر في
  // المبلغ، فينهار DPS بنسبة المنحة ويُقرأ **قصّاً** في `worstDrop`
  // و`growthScore` و`trend`.
  //
  // وم.22 توثّق السابقة بنصّها: «منحة بنك الرياض 1:3 — التوزيع 1.40 ←
  // 1.05. بلا تعديل يبدو *قصاً 25%* وهو خطأ».
  //
  // قياس فعلي على السابقة نفسها: 1,000 سهم، توزيعة 1,400 ر.س في 2024
  // و2025، ثم منحة 333 سهماً، ثم 1,400 ر.س — المبلغ المستلَم لم يتغيّر:
  //     الدرجة 54 · النمو 0/35 · «نمو مركّب −13.4%»
  // والصحيح: نمو صفر، لا قصّ، الاستمرارية كاملة.
  //
  // العلاج: كل DPS سابقٍ لمنحةٍ يُضرب في (الأسهم قبلها ÷ بعدها) — أي
  // يُعاد بيانه إلى أساس اليوم، تماماً كما يفعل `tdNormalizedEps` مع
  // الربحية. والمنحة تُعرف من معاملات `grant` في دفتر المعاملات.
  // ══════════════════════════════════════════════════════════════════
  const _grantRestated = {};
  Object.keys(dpsSeriesByTicker).forEach(t => {
    // ⚠️ المنح تعيش داخل `txBuyRows` (السطر 98 يضمّ buy و grant معاً) —
    // ولا وجود لمتغيّر `transactions` في هذا الملف.
    const grants = (txBuyRows || [])
      .filter(x => x.ticker === t && x.type === 'grant' && x.date && +x.shares > 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!grants.length) return;
    const factors = grants.map(g => {
      const after  = _sharesAtDate(t, g.date);            // شامل المنحة
      const before = after - (+g.shares || 0);
      return (before > 0.001 && after > before)
        ? { ts: (parseDateLocal(g.date) || new Date(g.date)).getTime(), f: before / after, date: g.date }
        : null;
    }).filter(Boolean);
    if (!factors.length) return;
    let touched = 0;
    dpsSeriesByTicker[t].forEach(p => {
      // معامل تراكمي لكل منحة وقعت **بعد** هذه التوزيعة
      const cum = factors.filter(g => g.ts > p.t).reduce((a, g) => a * g.f, 1);
      if (cum !== 1) { p.dps *= cum; p.restated = true; touched++; }
    });
    if (touched) _grantRestated[t] = { count: touched, grants: factors.map(g => g.date) };
  });

  const tickers = Object.keys(byTickerYear).filter(t => {
    const yrs = Object.keys(byTickerYear[t]).length;
    return yrs >= 1;
  });

  if (!tickers.length) {
    el.innerHTML = `<div class="empty-state"><div class="icon">📊</div>
      <p>سجّل توزيعات أكثر لتفعيل تحليل الجودة</p></div>`;
    return;
  }

  const scores = tickers.map(ticker => {
    // ── اختيار المصدر للحسابات ──────────────────────────────────────
    // الأولوية: DPS المُعدَّل (يُزيل تأثير تغير المركز)
    // الاحتياطي: المبالغ الخام (إذا لم تُسجَّل معاملات للرمز)
    const isDPS  = !!dpsNormalized[ticker];
    const series = (isDPS ? dpsSeriesByTicker[ticker] : rawSeriesByTicker[ticker]) || [];

    // المبلغ الفعلي المستلم (للعرض — دائماً من الخام بغض النظر عن المصدر)
    const rawYearMap = byTickerYear[ticker];
    const rawYears   = Object.keys(rawYearMap || {}).map(Number).sort((a, b) => a - b);
    const lastRawAmt = rawYears.length ? (rawYearMap[rawYears[rawYears.length - 1]] || 0) : 0;

    const h    = holdings.find(x => x.ticker === ticker);
    const name = h?.name || dividends.find(d => d.ticker === ticker)?.name || ticker;
    const base = {
      ticker, name, isDPS, inPortfolio: !!h,
      restated: _grantRestated[ticker] || null,   // م.22 — أُعيد بيان DPS لمنحة
      lastAmount: lastRawAmt,
      // ⚠️ مدى **النوافذ المحسوبة** لا مدى السجل الخام: `series` تُسقط
      // التوزيعات التي لا معاملة قبلها، فسهمٌ توزيعاته 2023–2026 وأول شراء
      // له 2025 كان يعرض «2/2 (2023–2026)» بينما النافذتان تغطيان 2025–2026.
      firstYear: series.length ? new Date(series[0].t).getFullYear() : rawYears[0],
      lastYear:  series.length ? new Date(series[series.length - 1].t).getFullYear()
                               : rawYears[rawYears.length - 1],
    };

    if (!series.length) {
      return { ...base, nWindows: 0, nFull: 0, freq: 1, expectedPerWindow: 1,
        yoy: null, cagrWin: null, cv: null, broken: false, worstDrop: 0,
        continuityScore: 0, growthScore: null, volatilityScore: null,
        totalScore: 0, provisional: true, trend: 'new' };
    }

    const DAY = 86400000;

    // ══════════════════════════════════════════════════════════════════
    // ⚠️ الدورية من `inferDividendFrequency` — لا استنتاج موازٍ هنا
    // ------------------------------------------------------------------
    // كان هذا المكان يحسب `round(365 ÷ وسيط الفجوات)` **بلا الحارس** الذي
    // وُضع عمداً في `utils.js` (شرط الحدّ الأدنى للدفعات + التنزيل المتدرّج).
    // وحين تتناوب الفجوات — مرحليٌّ ثم ختاميٌّ، وهو النمط السعودي الغالب —
    // يلتقط الوسيطُ الفجوةَ **القصيرة** فتخرج دورية أعلى من الحقيقة، فتصير
    // كل نافذة أطول من سنة، فيُشعل شرطُ `gap` نفسه في كل نافذة:
    //
    //   nFull = 0 ⇒ النمو والثبات `null` والانتظام صفر ⇒ **الدرجة صفر**
    //
    // قياس فعلي على أنماط منتظمة تماماً بمبلغ ثابت: موزّع نصف سنوي في
    // أبريل/أغسطس ⇒ الدرجة **0 من 100**. وربعيٌّ في مارس/مايو/سبتمبر/نوفمبر
    // ⇒ **0**. ثلاثة من تسعة أنماط سليمة تنال أسوأ درجة ممكنة.
    //
    // وأسوأ: `dividendStaleDays(freq)` تشتقّ عتبة «الانقطاع» من الدورية
    // نفسها، فكان السهم يُعلَن منقطعاً في هذا الجدول وسليماً في الدخل
    // المتوقَّع أسفل الصفحة — رقمان لسؤال واحد.
    // ══════════════════════════════════════════════════════════════════
    let medGap = 365;
    if (series.length >= 2) {
      const gaps = [];
      for (let i = 1; i < series.length; i++) gaps.push(Math.floor((series[i].t - series[i - 1].t) / DAY));
      gaps.sort((a, b) => a - b);
      medGap = Math.max(1, gaps[Math.floor(gaps.length / 2)]);
    }
    const _isoOfTs = (ts) => { const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
           + `-${String(d.getDate()).padStart(2, '0')}`; };
    const freq = (typeof inferDividendFrequency === 'function' && series.length >= 2)
      ? inferDividendFrequency(series.map(p => _isoOfTs(p.t)))
      : Math.max(1, Math.min(12, Math.round(365 / medGap)));
    const expectedPerWindow = Math.max(1, freq);

    // ── نوافذ 12 شهراً متحرّكة من آخر توزيعة للخلف ───────────────────
    // W0 = آخر دورة سنوية كاملة حتى آخر توزيعة، W1 = التي قبلها… المرساة هي
    // آخر توزيعة لا رأس السنة، فلا تنتظر الدرجة يناير القادم لتتحرك.
    //
    // ⚠️ قرار منهجي: النافذة تُبنى بعدّ **الدفعات** (كل freq دفعة = نافذة) لا
    // بحدّ صلب عند 365 يوماً، ثم يُتحقَّق من امتدادها الزمني. السبب رياضي:
    // موزّع ربعي بفجوة 90–91 يوماً تسع نافذة الـ365 يوماً خمساً من دفعاته
    // (4×91 = 364 < 365) فتلتقط النافذة التالية ثلاثاً فقط → نمو وهمي ‎±25%‎
    // على سهم لم يغيّر توزيعه. عدّ الدفعات يلغي هذا الانزياح تماماً، والتحقق
    // من الامتداد الزمني يبقي كشف الدفعة المفقودة قائماً.
    const anchor = series[series.length - 1].t;
    const windows = [];
    for (let end = series.length; end > 0; end -= expectedPerWindow) {
      const start = Math.max(0, end - expectedPerWindow);
      const pts   = series.slice(start, end);
      // بداية الفترة التي تغطيها النافذة = الدفعة السابقة لها (أو دورة واحدة قبلها)
      const prevT = start > 0 ? series[start - 1].t : pts[0].t - medGap * DAY;
      const spanDays = Math.round((pts[pts.length - 1].t - prevT) / DAY);
      windows.push({
        idx: windows.length,
        sum:   pts.reduce((s, p) => s + p.dps, 0),
        count: pts.length,
        spanDays,
        // امتداد يتجاوز السنة بمقدار دورة كاملة تقريباً = دفعة فُوِّتت داخل النافذة
        gap: spanDays > 365 + medGap * 0.75,
      });
    }
    const nWindows = windows.length;

    // نافذة «مكتملة» = دفعاتها = المتوقَّع ولا فجوة فيها. نافذة الدخول الجزئية
    // (سهم ربعي اشتُري في سبتمبر → دفعة واحدة بدل أربع) تُستبعد من النمو
    // والثبات، وإلا قُرئت نمواً ‎+300%‎ وتذبذباً عالياً رغم أن الشركة لم تغيّر
    // توزيعها إطلاقاً. تبقى محسوبة في الاستمرارية (نضج السجل).
    const fullWins = windows.filter(w => w.count >= expectedPerWindow && !w.gap && w.sum > 0); // [0] = الأحدث
    const nFull    = fullWins.length;

    // ── 1. نمو التوزيعات (0–35) — متاح من نافذتين مكتملتين (~24 شهراً) ──
    let growthScore = null, yoy = null, cagrWin = null, yoyGap = null;
    if (nFull >= 2) {
      // ⚠️ `fullWins` مُرشّحة: قد تفصل بين العنصرين نافذةٌ أو أكثر استُبعدت
      // (دفعة مفقودة، نافذة دخول). والرقم يُعرض تحت «نمو **سنوي**»،
      // فنمو سنتين يُقرأ نمو سنة: موزّع ربعي نامٍ فُوّتت دفعة منه
      // أعطى **+52.9%** والصحيح **+23.7%** — ضعف الحقيقة تقريباً،
      // والرقم يدخل `growthScore` وترتيب الجدول. ومسار CAGR أسفله
      // يحسب `periods` من فارق `idx` صحيحاً — وهذا المسار لا.
      const _yoyPer = Math.max(1, fullWins[1].idx - fullWins[0].idx);
      yoy = (Math.pow(fullWins[0].sum / fullWins[1].sum, 1 / _yoyPer) - 1) * 100;
      if (_yoyPer > 1) yoyGap = _yoyPer;
      const periods = fullWins[nFull - 1].idx - fullWins[0].idx;   // المسافة بالنوافذ
      if (periods > 0 && fullWins[nFull - 1].sum > 0) {
        cagrWin = (Math.pow(fullWins[0].sum / fullWins[nFull - 1].sum, 1 / periods) - 1) * 100;
      }
      const g = (nFull >= 3 && cagrWin != null) ? cagrWin : yoy;
      growthScore = Math.round(Math.min(35, Math.max(0, (g + 10) / 18 * 35)));
    }

    // ── 2. الثبات (0–30) — معامل الاختلاف، متاح من ثلاث نوافذ مكتملة ──
    let volatilityScore = null, cv = null;
    if (nFull >= 3) {
      const vals = fullWins.map(w => w.sum);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const varc = vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length;
      cv = mean > 0 ? Math.sqrt(varc) / mean : 1;
      volatilityScore = Math.round(Math.max(0, (1 - cv) * 30));
    }

    // ── 3. الاستمرارية (0–35) — الدفع الفعلي والمبلغ، لا أرقام السنوات ──
    // (أ) انتظام: كم نافذة استوفت دفعاتها المتوقَّعة بلا فجوة؟ النافذة الأقدم
    //     هي نافذة الدخول بالضرورة (تحوي أول توزيعة مسجّلة) فلا تُعاقَب على نقصها.
    const assessed   = nWindows >= 2 ? windows.slice(0, nWindows - 1) : windows;
    const regularity = assessed.length
      ? assessed.filter(w => w.count >= expectedPerWindow && !w.gap).length / assessed.length : 0;
    // (ب) نضج: ثلاث نوافذ = درجة كاملة
    const maturity = Math.min(1, nWindows / 3);
    // (ج) عامل القطع — هنا يدخل **المبلغ**: أشد هبوط في DPS بين نافذتين
    //     مكتملتين متتاليتين. قطع 80% يهوي بالعامل إلى ~0.30، قطع 50% إلى ~0.59.
    let worstDrop = 0;
    for (let i = 0; i + 1 < nFull; i++) {
      const ow = fullWins[i + 1].sum;
      if (ow > 0) worstDrop = Math.max(worstDrop, 1 - fullWins[i].sum / ow);
    }
    const cutFactor = worstDrop <= 0.10 ? 1 : Math.max(0.15, Math.pow(1 - worstDrop, 0.75));
    // (د) انقطاع فعلي: تجاوز 1.75 ضعف الدورة بلا توزيع = Streak مُصفَّر
    //     (نفس عتبة استبعاد الدخل المتوقع — الدستور §4 الفلتر 1)
    const daysSinceLast = Math.floor((Date.now() - anchor) / DAY);
    const broken = daysSinceLast > dividendStaleDays(freq);
    const continuityScore = Math.round(35 * regularity * maturity * cutFactor * (broken ? 0.15 : 1));

    // ── الدرجة الكلية: تُطبَّع على المحاور المتاحة فقط (من 100) ──
    // إذا لم يتوفر النمو/الثبات بعد، لا نحشو أصفاراً ولا ثوابت — بل نقسم
    // مجموع المتاح على سقفه المتاح ونرفعه لـ 100، ونؤشّر أنها درجة مبدئية.
    let sumAvail = continuityScore, maxAvail = 35;
    if (growthScore     != null) { sumAvail += growthScore;     maxAvail += 35; }
    if (volatilityScore != null) { sumAvail += volatilityScore; maxAvail += 30; }
    const totalScore  = Math.round(sumAvail / maxAvail * 100);
    const provisional = (growthScore == null || volatilityScore == null);

    // الاتجاه: من آخر نافذتين مكتملتين (وإلا «جديد» — لا نحكم بعد)
    let trend = 'new';
    if (nFull >= 2) {
      const last = fullWins[0].sum, prev = fullWins[1].sum;
      if      (last > prev * 1.02) trend = 'up';
      else if (last < prev * 0.98) trend = 'down';
      else                         trend = 'neutral';
    }

    return {
      ...base,
      nWindows, nFull, freq, expectedPerWindow,
      yoy, cagrWin, yoyGap, cv, worstDrop, broken, daysSinceLast,
      continuityScore, growthScore, volatilityScore,
      totalScore, provisional, trend,
    };
  }).sort((a, b) => b.totalScore - a.totalScore);

  // ── رسم الجدول ─────────────────────────────────────────────
  const scoreColor = s => s >= 75 ? '#3fb950' : s >= 50 ? '#f0b429' : '#f85149';
  // s === null ⇒ المحور غير مقيس بعد (بيانات غير كافية) — نعرض «—» بدل رقم مختلق
  const scoreBadge = (s, lbl, naLbl) =>
    s == null
      ? `<span title="${naLbl || lbl}" style="color:var(--text-muted);cursor:help">—</span>`
      : `<span title="${lbl}" style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:0.72rem;font-weight:700;
        background:${scoreColor(s)}22;color:${scoreColor(s)}">${s}</span>`;
  const trendEl = t =>
    t === 'up'   ? '<span style="color:var(--success)">↑ نامٍ</span>' :
    t === 'down' ? '<span style="color:var(--danger)">↓ تراجع</span>' :
    t === 'new'  ? '<span style="color:var(--text-muted)" title="يحتاج نافذتي 12 شهراً مكتملتين للحكم على الاتجاه">🆕 جديد</span>' :
                   '<span style="color:var(--text-muted)">← ثابت</span>';
  const cagrFmt = v =>
    v == null ? '<span class="text-muted">—</span>' :
    `<span style="color:${v >= 0 ? 'var(--success)' : 'var(--danger)'}">
      ${v >= 0 ? '+' : ''}${v.toFixed(1)}%</span>`;

  // هل يوجد أي رمز استفاد من تصحيح DPS؟
  const anyDPS = scores.some(s => s.isDPS);

  el.innerHTML = `
    ${anyDPS ? `
    <div style="
      background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.25);
      border-radius:8px;padding:9px 14px;margin-bottom:12px;font-size:.78rem;
      color:var(--text-2);line-height:1.6;
    ">
      <strong style="color:#58a6ff">📐 تصحيح DPS مُفعَّل</strong> —
      الدرجات محسوبة من <strong>التوزيع للسهم الواحد (DPS)</strong> لا المبلغ الإجمالي.
      هذا يُزيل تأثير شراء أو بيع جزئي على التقييم —
      إذا بعت 400 سهم من 1500 ثم وزّعت الشركة نفس DPS، الكود يعرفها صحيحاً.
      <span style="color:#58a6ff;font-size:.72rem">🔵 DPS</span> في عمود الرمز تعني أن الدرجة مُعدَّلة.
    </div>` : ''}
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>الرمز</th>
            <th>الاسم</th>
            <th>الدرجة / 100</th>
            <th>الاستمرارية<br><span class="small text-muted">/35 — دفع فعلي + مبلغ</span></th>
            <th>نمو التوزيع<br><span class="small text-muted">/35 — بـ DPS</span></th>
            <th>ثبات التوزيع<br><span class="small text-muted">/30 — بـ DPS</span></th>
            <th>نوافذ 12 شهراً<br><span class="small text-muted">مكتملة / الكل</span></th>
            <th>نمو سنوي<br><span class="small text-muted">DPS — نافذة مقابل نافذة</span></th>
            <th>آخر توزيع<br><span class="small text-muted">المبلغ الفعلي</span></th>
            <th>الاتجاه</th>
          </tr>
        </thead>
        <tbody>
          ${scores.map((s, i) => {
            const rowCls = !s.inPortfolio ? 'style="opacity:0.6"' : '';
            const totalColor = scoreColor(s.totalScore);
            return `<tr ${rowCls}>
              <td class="small text-muted">${i + 1}</td>
              <td><strong class="text-accent">${esc(s.ticker)}</strong>
                ${s.isDPS
                  ? `<span title="الدرجة محسوبة من DPS — مُعدَّلة لتغيرات حجم المركز (شراء/بيع جزئي)"
                       style="font-size:.65rem;background:rgba(59,130,246,0.15);color:#58a6ff;
                              border-radius:3px;padding:1px 5px;font-weight:600;cursor:help"> DPS ✓</span>`
                  : `<span title="لا توجد معاملات مسجّلة — الدرجة من المبالغ الخام"
                       style="font-size:.65rem;color:var(--text-muted)"> ⓘ</span>`}
                ${s.restated ? `<span title="أُعيد بيان ${s.restated.count} توزيعة سابقة لمنحة (${esc(s.restated.grants.join('، '))}) — م.22: بلا إعادة البيان تُقرأ المنحة قصّاً للتوزيع"
                       style="font-size:.65rem;background:rgba(168,85,247,.15);color:#c084fc;
                              border-radius:3px;padding:1px 5px;font-weight:600;cursor:help"> م.22 ↺</span>` : ''}
                ${!s.inPortfolio ? '<span class="small text-muted"> (خارج المحفظة)</span>' : ''}
              </td>
              <td>${esc(s.name)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:1.1rem;font-weight:700;color:${totalColor}">${s.totalScore}</span>
                  ${s.provisional ? `<span title="درجة مبدئية — مقيسة على المحاور المتاحة فقط (السجل أقصر من اللازم لقياس النمو/الثبات)" style="font-size:.62rem;color:var(--text-muted);cursor:help">مبدئي</span>` : ''}
                  <div style="flex:1;height:6px;background:var(--bg-3);border-radius:3px;min-width:60px">
                    <div style="width:${s.totalScore}%;height:100%;background:${totalColor};border-radius:3px"></div>
                  </div>
                </div>
              </td>
              <td style="text-align:center">${scoreBadge(s.continuityScore, `انتظام الدفع الفعلي × نضج السجل × عامل القطع${s.worstDrop > 0.10 ? ` — أشد هبوط ${(s.worstDrop*100).toFixed(0)}%` : ''}${s.broken ? ' — ⛔ انقطاع: التوزيع متوقف' : ''}`)}</td>
              <td style="text-align:center">${scoreBadge(s.growthScore, 'نمو DPS بين نوافذ الاثني عشر شهراً', 'يحتاج نافذة أخرى — النمو متاح من نافذتين مكتملتين (~24 شهراً من التوزيعات)')}</td>
              <td style="text-align:center">${scoreBadge(s.volatilityScore, 'انخفاض تذبذب DPS بين النوافذ (CV)', 'يحتاج نافذة أخرى — الثبات متاح من ثلاث نوافذ مكتملة')}</td>
              <td class="num" title="النافذة = 12 شهراً من آخر توزيعة للخلف. «مكتملة» = دفعاتها ≥ ${s.expectedPerWindow} (المتوقَّع من دوريتها)">${s.nFull}/${s.nWindows}
                <span class="small text-muted">(${s.firstYear}–${s.lastYear})</span></td>
              <td title="${s.nFull >= 3 ? 'CAGR عبر النوافذ المكتملة'
                : s.nFull >= 2
                  ? (s.yoyGap ? `مُسنوى عبر ${s.yoyGap} نوافذ — النافذتان المكتملتان غير متجاورتين (دفعة مفقودة أو نافذة دخول بينهما)`
                              : 'نافذة مقابل النافذة السابقة')
                  : ''}">${cagrFmt(s.nFull >= 3 ? s.cagrWin : s.yoy)}${s.yoyGap ? ' <span class="small text-muted">↔' + s.yoyGap + '</span>' : ''}</td>
              <td class="num">${formatSAR(s.lastAmount)}</td>
              <td>${trendEl(s.trend)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <p class="small text-muted" style="margin-top:10px;padding:0 4px">
      * الدرجات مبنية على <strong>نوافذ 12 شهراً متحرّكة</strong> مرساتها آخر توزيعة (لا السنة التقويمية) — فتتحرك الدرجة فور اكتمال نافذة، بلا انتظار رأس السنة.<br>
      <strong>«—»</strong> = المحور لم يُقَس بعد (<em>يحتاج نافذة أخرى</em>: النمو من نافذتين مكتملتين، الثبات من ثلاث) — لا نعرض رقماً مختلقاً.
      <strong>«مبدئي»</strong> = الدرجة مطبَّعة على المحاور المتاحة فقط حتى ينضج السجل.<br>
      نافذة عدد دفعاتها أقل من المتوقَّع (نافذة الدخول مثلاً) تُستبعد من النمو والثبات حتى لا تُقرأ نمواً وهمياً.<br>
      <span style="color:#58a6ff">DPS ✓</span> = الدرجة محسوبة من التوزيع للسهم الواحد (يُزيل تأثير شراء/بيع جزئي) |
      آخر توزيع = المبلغ الفعلي المُستلَم (ليس DPS)
    </p>
  `;
}

function showDivQualityInfo() {
  // AUDIT-FIX (2026-07): مودال موحّد بدل alert() الحاجب (متسق مع بقية التطبيق)
  const lines = [
    '🏆 درجة جودة التوزيعات',
    '',
    '🪟 الأساس: نوافذ 12 شهراً متحرّكة',
    'تُقسَّم توزيعات السهم إلى نوافذ 365 يوماً متتالية،',
    'مرساتها آخر توزيعة وتمتد للخلف — لا السنة التقويمية.',
    'W0 = آخر 12 شهراً · W1 = الاثنا عشر التي قبلها · وهكذا.',
    'السبب: التجميع على السنة التقويمية كان يجمّد كل الدرجات',
    'حتى يناير القادم مهما تغيّرت توزيعات الشركات فعلياً.',
    'نافذة عدد دفعاتها أقل من المتوقَّع من دوريتها (نافذة الدخول',
    'مثلاً: سهم ربعي اشتُري في سبتمبر) تُستبعد من النمو والثبات،',
    'وإلا قُرئت نمواً +300% وتذبذباً عالياً بلا سبب حقيقي.',
    '',
    'الدرجة من 100 مقسّمة على 3 محاور:',
    '',
    '📅 الاستمرارية (35 نقطة)',
    '= 35 × انتظام × نضج × عامل القطع.',
    'انتظام = نسبة النوافذ التي استوفت دفعاتها المتوقَّعة فعلاً.',
    'نضج = ثلاث نوافذ تعطي الدرجة الكاملة.',
    'عامل القطع = يخصم بحسب أشد هبوط في DPS بين نافذتين',
    'متتاليتين — هنا يدخل المبلغ لا رقم السنة فقط.',
    'وإذا توقّف التوزيع (تجاوز 1.75 ضعف الدورة) تُصفَّر تقريباً',
    '(منهج Dividend Streak: القطع يُصفّر السلسلة).',
    '',
    '📈 نمو التوزيعات (35 نقطة)',
    'نمو DPS بين W0 و W1 — متاح من نافذتين مكتملتين (~24 شهراً).',
    'عند ثلاث نوافذ فأكثر يُستخدم CAGR عبرها.',
    '',
    '📊 ثبات التوزيعات (30 نقطة)',
    'معامل الاختلاف (CV) على النوافذ المكتملة — متاح من ثلاث نوافذ.',
    '',
    'إذا لم يتوفر محور بعد يظهر «—» («يحتاج نافذة أخرى») ولا يُحشى',
    'برقم، وتُطبَّع الدرجة على المحاور المتاحة وتُؤشَّر «مبدئي».',
    '',
    '📐 تصحيح DPS (مهم):',
    'الحسابات تعتمد على التوزيع للسهم الواحد (DPS) لا المبلغ الإجمالي.',
    'هذا يُزيل تأثير شراء/بيع جزئي على التقييم.',
    'مثال: بعت 400 سهم من 1500 → التوزيع التالي أقل بالريال',
    'لكن DPS (للسهم) يبقى نفسه إذا الشركة لم تغير سياستها.',
    'بدون هذا التصحيح، البيع الجزئي يُحسَب "تراجع في التوزيع" خطأً.',
    '',
    'ملاحظة: يتطلب وجود سجل معاملات للرمز لحساب DPS.',
    'إذا لم تُسجَّل معاملات، تُستخدم المبالغ الخام.',
    '',
    '⚠️ مهم — ما لا تقيسه هذه الدرجة:',
    'هذه درجة «سجلّ تاريخي» (Track Record) لا «أمان مستقبلي».',
    'الأمان الحقيقي للتوزيع يحتاج نسبة التوزيع (Payout Ratio) وتغطية',
    'التدفق النقدي الحر (FCF) — وهما لا يدخلان في هذه الدرجة.',
    'شركة بسجلّ ممتاز قد توزّع 100% من أرباحها = توزيع غير آمن رغم الدرجة العالية.',
    '',
    'لكنهما **متوفران** الآن في بطاقة «تاريخ التوزيع الرسمي» أسفل الصفحة،',
    'من إيداعات تداول: كل سنة وُزِّع فيها فوق الأرباح موسومة ⚠️.',
    'الدرجة هنا تبقى عن دخلك أنت؛ والأمان يُقرأ هناك.',
  ];
  openInfoModal('🏆 درجة جودة التوزيعات — المنهجية',
    lines.slice(1).map(l => l === '' ? '<div style="height:6px"></div>' : `<p style="margin:0 0 4px">${esc(l)}</p>`).join(''));
}

// ══════════════════════════════════════════════════════════════
// 🗃️ التوزيعات المؤرشفة — عرض + حذف نهائي
// ══════════════════════════════════════════════════════════════

let archivedDividends = [];

async function loadArchivedDividends() {
  try {
    const { data, error } = await supabaseClient
      .from('dividends')
      .select('*')
      .eq('is_archived', true)
      .order('date', { ascending: false });
    if (error) { console.warn('archived dividends error:', error.message); }
    else { archivedDividends = data || []; }
  } catch (e) {
    console.warn('loadArchivedDividends exception:', e);
  }
  renderArchivedTable();
}

function renderArchivedTable() {
  const tbody = document.getElementById('archived-div-tbody');
  const card  = document.getElementById('archived-div-card');
  if (!tbody) return;

  // أخفِ البطاقة كاملاً إذا لا يوجد أرشيف
  if (!archivedDividends.length) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

  tbody.innerHTML = archivedDividends.map(d => `<tr style="opacity:0.75;">
    <td class="small text-muted">${formatDate(d.date)}</td>
    <td><strong class="text-muted">${esc(d.ticker)}</strong></td>
    <td class="small text-muted">${esc(d.name)}</td>
    <td class="num text-muted">${formatSAR(d.amount)}</td>
    <td class="small text-muted">${MONTHS_AR[(d.month||1)-1]}</td>
    <td class="num text-muted">${d.year}</td>
    <td>
      <button class="btn btn-danger btn-sm" onclick="permanentDeleteDiv('${esc(d.id)}')">🗑 حذف نهائي</button>
    </td>
  </tr>`).join('');
}

async function permanentDeleteDiv(id) {
  if (!await confirmAsync('⚠️ حذف نهائي — لا يمكن التراجع عن هذا الإجراء. هل أنت متأكد؟')) return;
  const { error } = await supabaseClient.from('dividends').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف النهائي ✓', 'success');
  archivedDividends = archivedDividends.filter(d => d.id !== id);
  renderArchivedTable();
}

function toggleArchivedSection() {
  const wrap = document.getElementById('archived-div-wrap');
  if (!wrap) return;
  wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
}

init();

// ══════════════════════════════════════════════════════════════════════
// 📗 تاريخ التوزيع الرسمي من إيداعات تداول (م.15/1)
// ----------------------------------------------------------------------
// جدول الجودة أعلاه يقيس **دخلك أنت**: نوافذه تبدأ من أول توزيعة استلمتها،
// فسهمٌ اشتريتَه قبل عام تبقى درجته «مبدئية» مهما كان تاريخ الشركة نظيفاً.
// هذا الجدول يقيس **الشركة**: خمس أو ست سنوات من إيداعاتها، معدّلةً
// للتجزئة (م.22). ولا يدخل في درجتك — الدرجة عن محفظتك لا عن السوق.
// ══════════════════════════════════════════════════════════════════════
function renderTadawulDividends() {
  const card = document.getElementById('td-div-card');
  const el   = document.getElementById('td-div-body');
  if (!card || !el) return;
  if (typeof TADAWUL_DATA === 'undefined' || typeof tdDpsSeries !== 'function') {
    card.style.display = 'none'; return;
  }

  // المحفظة أولاً، ثم بقية ما في تداول
  const held = [...new Set((holdings || []).map(h => String(h.ticker || '').trim()))].filter(Boolean);
  const all  = Object.keys(TADAWUL_DATA);
  const list = [...all.filter(t => held.includes(t)), ...all.filter(t => !held.includes(t))];
  if (!list.length) { card.style.display = 'none'; return; }
  card.style.display = '';

  const years = [...new Set(list.flatMap(tk => tdDpsSeries(tk).map(x => x.year)))].sort();
  const body = list.map(tk => {
    const r = TADAWUL_DATA[tk], g = tdDpsGrowth(tk);
    const byYear = Object.fromEntries(tdDpsSeries(tk).map(x => [x.year, x.dps]));
    const mine = held.includes(tk);

    const cells = years.map(y => {
      const v = byYear[y];
      if (v == null) return '<td class="num text-muted" title="لا توزيع مسجَّل في الإيداعات لهذه السنة">—</td>';
      const yr = r.years[y] || {};
      const hot = yr.payoutPct != null && yr.payoutPct > 100;
      return `<td class="num"${hot ? ` title="نسبة التوزيع ${yr.payoutPct.toFixed(0)}% — وُزِّع فوق أرباح السنة"` : ''}`
           + `${hot ? ' style="color:var(--warning)"' : ''}>${v.toFixed(2)}${hot ? ' ⚠️' : ''}</td>`;
    }).join('');

    let growth;
    if (g.value == null) {
      growth = `<td class="text-muted" title="${esc(g.why || '')}">—</td>`;
    } else {
      const pct = `${g.value >= 0 ? '+' : ''}${(g.value * 100).toFixed(1)}%`;
      if (g.volatile) growth = `<td title="${esc(g.volatileWhy)}" style="color:var(--warning);cursor:help">${pct} 🔴</td>`;
      else if (g.caution) growth = `<td title="${esc(g.caution)}" style="color:var(--warning);cursor:help">${pct} 🟡</td>`;
      else growth = `<td style="color:${g.value >= 0 ? 'var(--success)' : 'var(--danger)'}">${pct}</td>`;
    }

    // ══════════════════════════════════════════════════════════════
    // التلوين بمناطق م.42-أ الأربع، لا بقاعدتين
    // --------------------------------------------------------------
    // كان `cov >= 1 ? أخضر : أصفر` — فتغطية **0.06×** تُلوَّن باللون الذي
    // تُلوَّن به 0.95×، وم.42-أ تفرّق: 🟢 ≥1.00 · 🟡 0.85–1.00 ·
    // 🟠 0.60–0.85 · 🔴 <0.60.
    //
    // والتغطية السالبة كانت تُطبع «−13.26×» وكأنها مضاعف. تدفّق حرّ سالب
    // يعني أن التوزيع لم يخرج من تدفّق السنة إطلاقاً — تغطيةٌ **صفرية**،
    // لا سالبة بمقدار.
    // ══════════════════════════════════════════════════════════════
    const cov = (typeof tdLatestCoverage === 'function') ? tdLatestCoverage(tk) : null;
    const _covZone = (v) => v < 0 ? { c: 'var(--danger)',  i: '🔴', l: 'تدفّق حرّ سالب' }
                          : v >= 1.00 ? { c: 'var(--success)', i: '🟢', l: 'مغطّاة' }
                          : v >= 0.85 ? { c: 'var(--warning)', i: '🟡', l: 'حدّية' }
                          : v >= 0.60 ? { c: 'var(--warning)', i: '🟠', l: 'ناقصة' }
                          :             { c: 'var(--danger)',  i: '🔴', l: 'غير مغطّاة' };
    let covTd;
    if (!cov) {
      covTd = '<td class="text-muted" title="التدفق الحر غير مستخرَج لهذا السهم (م.20)">—</td>';
    } else {
      const z = _covZone(cov.value);
      const neg = cov.value < 0;
      covTd = `<td class="num" style="color:${z.c};cursor:help" title="`
        + `${esc(z.l)} — منطقة م.42-أ · سنة ${cov.year}`
        + (neg ? ` · التدفق الحر سالب (${formatNum(cov.value, 2)}) فالتغطية صفر لا رقماً سالباً` : '')
        + `">${z.i} ${neg ? '0×' : cov.value.toFixed(2) + '×'}</td>`;
    }

    return `<tr${mine ? '' : ' style="opacity:.55"'}>`
      + `<td><strong class="text-accent">${esc(tk)}</strong>`
      + `${mine ? '' : '<span class="small text-muted"> (خارج المحفظة)</span>'}</td>`
      + `<td>${esc(r.name)}</td>${cells}${growth}${covTd}`
      + `<td class="num small text-muted">${r.sourceFiles || '—'}</td></tr>`;
  }).join('');

  el.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>الرمز</th><th>الاسم</th>
          ${years.map(y => `<th class="num">${y}</th>`).join('')}
          <th>النمو المركّب<br><span class="small text-muted">معدَّل للتجزئة</span></th>
          <th class="num">تغطية FCF<br><span class="small text-muted">آخر سنة</span></th>
          <th class="num">إيداعات</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${noteHtml('🔎',
      '<strong>🔴 متقلّب</strong> — السلسلة تقفز، فمعدّل النمو يفترض مساراً لا وجود له. '
    + '<strong>🟡 طرف شاذّ</strong> — سنة البداية أو النهاية دفعةٌ استثنائية تقلب الاتجاه. '
    + '<strong>⚠️</strong> بجوار رقم — وُزِّع فوق أرباح تلك السنة. '
    + 'مرِّر المؤشر على أيٍّ منها لتفصيله.', 'info')}`;
}

function showTdDivInfo() {
  const n = (typeof TADAWUL_SOURCE_FILES !== 'undefined') ? TADAWUL_SOURCE_FILES : '—';
  const p = (h) => `<p style="margin:0 0 8px">${h}</p>`;
  openInfoModal('📗 تاريخ التوزيع الرسمي — المصدر والمنهجية',
      p(`مستخرَج من <strong>${n} إيداعاً</strong> رسمياً لدى تداول — وهو أعلى `
      + `المصادر في الدستور (م.15/1).`)
    + p(`<strong>لماذا يختلف عن جدول الجودة فوقه؟</strong> ذاك يقيس التوزيعات التي `
      + `<em>وصلتك</em>، فيبدأ من يوم شرائك. وهذا يقيس ما <strong>أعلنته الشركة</strong> — `
      + `خمس أو ست سنوات، ولو سبقت ملكيتك بأعوام. سهمٌ درجته «مبدئية» فوق قد يكون `
      + `تاريخه هنا نظيفاً تماماً.`)
    + p(`الأرقام <strong>معدَّلة للتجزئة</strong> (م.22): جرير جزّأت 10:1 في 2023، `
      + `فبلا تعديل تقرأ 7.70 ر.س ثم 0.82 وتظنّه قطعاً بنسبة 89% — وهو تجزئة لا قطع.`)
    + p(`<strong>النمو المركّب لا يُعرض عارياً.</strong> هو يمسك طرفَي المدى ويفترض `
      + `مساراً بينهما، وذلك يكذب حين تقفز السلسلة أو يكون أحد طرفيها دفعةً استثنائية. `
      + `في الحالتين يُوسَم ويُذكر السبب — ولا يُصلَح سرّاً (م.20 و23).`)
    + p(`<strong>تغطية FCF</strong> — التدفق النقدي الحر ÷ التوزيع المدفوع (م.42-أ). `
      + `تحت 1× يعني أن توزيع تلك السنة لم يخرج من تدفق السنة نفسها.`));
}
