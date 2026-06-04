let dividends    = [];
let txBuyRows    = [];
let txSellRows   = [];
let holdings     = [];
let selectedYear = 'all';
let chartView    = 'month';   // 'month' | 'year'
let incomeMode   = 'bar';     // 'bar' | 'line' | 'stacked' | 'table'
let incomeChart  = null;

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
  if (name) document.getElementById('d-name').value = name;
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
  renderDivStats();
  renderSummaries();
  renderTable();
  renderIncomeChart();
  renderDividendQuality();
}

// مجموع التوزيعات الفعلية خلال آخر 12 شهراً (TTM) — العُرف المالي المعتمد
// لا توسيع خطّي: نجمع ما استُلم فعلاً في آخر 12 فترة شهرية (متطابق مع منطق رسم آخر 12 شهراً)
function _ttmDividends() {
  const now  = new Date();
  const keys = new Set();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.add(d.getFullYear() + '-' + (d.getMonth() + 1));
  }
  return dividends.reduce((s, d) => keys.has(+d.year + '-' + +d.month) ? s + +d.amount : s, 0);
}

// تكلفة الحيازات الحالية = مجموع (متوسط التكلفة × الأسهم المتبقية) لكل سهم
// نفس المحرّك المستخدم في الجدول السنوي → مقام موحّد للعائد بلا تضارب
function _currentCostBasis() {
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

// الدخل التوزيعي المتوقع سنوياً (Forward Projected Income)
// المنطق: لكل سهم محتفظ به الآن:
//   ١. آخر دفعة مستلمة ÷ الأسهم التي كانت عندي وقتها = دخل لكل سهم (DPS)
//   ②. حدّد الدورية من الفجوة الزمنية بين آخر دفعتين
//   ③. DPS × الدورية × الأسهم الحالية = الدخل المتوقع من هذا السهم سنوياً
// هذا ما تستخدمه ياهو فاينانس وإنفستنج كوم
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

    // ابحث عن أحدث توزيعة كان المستخدم يملك أسهماً عندها
    // (قد تكون آخر توزيعة قبل تاريخ الشراء — نتراجع حتى نجد واحدة صالحة)
    let refDivIdx = -1;
    let sharesAtRefDiv = 0;
    for (let i = tickerDivs.length - 1; i >= 0; i--) {
      const s = _sharesAtDate(ticker, _divSortDate(tickerDivs[i]));
      if (s >= 0.001) { refDivIdx = i; sharesAtRefDiv = s; break; }
    }

    // لا توزيعة مناسبة — قد يكون المستخدم اشترى السهم بعد كل التوزيعات المسجّلة
    // نقدّر DPS من إجمالي الأرباح المستلمة على الأسهم الحالية (تقدير محافظ)
    let dps, lastDivDate, usedFallback = false;
    if (refDivIdx >= 0) {
      const refDiv = tickerDivs[refDivIdx];
      lastDivDate  = _divSortDate(refDiv);
      dps          = +refDiv.amount / sharesAtRefDiv;
    } else {
      // H-9 fallback: use last recorded year's dividends ÷ current shares
      // (NOT all-time total which inflates DPS by multi-year accumulation)
      const lastDiv  = tickerDivs[tickerDivs.length - 1];
      lastDivDate    = _divSortDate(lastDiv);
      const lastYear = Math.max(...tickerDivs.map(d => +d.year || new Date(lastDivDate).getFullYear()));
      const lastYearTotal = tickerDivs
        .filter(d => (+d.year || new Date(_divSortDate(d)).getFullYear()) === lastYear)
        .reduce((s, d) => s + +d.amount, 0);
      // if last year has recorded divs use those; otherwise fall back to single last payment
      dps            = lastYearTotal > 0
        ? lastYearTotal / +holding.shares
        : +lastDiv.amount / +holding.shares;
      sharesAtRefDiv = +holding.shares;
      usedFallback   = true;
    }

    // الدورية: ربع سنوي / نصف سنوي / سنوي
    let freq = 1;
    let freqLabel = 'سنوي';
    if (tickerDivs.length >= 2) {
      const d1 = _divSortDate(tickerDivs[tickerDivs.length - 1]);
      const d2 = _divSortDate(tickerDivs[tickerDivs.length - 2]);
      const gapDays = Math.floor((new Date(d1) - new Date(d2)) / 86400000);
      if (gapDays <= 105)      { freq = 4; freqLabel = 'ربع سنوي'; }
      else if (gapDays <= 210) { freq = 2; freqLabel = 'نصف سنوي'; }
    }

    const currentShares = +holding.shares;
    const projected = dps * freq * currentShares;
    total += projected;

    breakdown.push({
      ticker, name: holding.name || ticker,
      dps, freq, freqLabel, currentShares,
      lastDivDate, lastDivAmt: dps * sharesAtRefDiv,
      sharesAtLastDiv: sharesAtRefDiv, projected, usedFallback,
    });
  });

  return { total, breakdown };
}

// ── شريط الإحصائيات الكلية ────────────────────────────────────
function renderDivStats() {
  const el = document.getElementById('div-stats');
  if (!el) return;

  const currentYear = new Date().getFullYear();
  const today       = new Date();
  const startOfYear = new Date(currentYear, 0, 1);
  const daysElapsed = Math.floor((today - startOfYear) / 86400000) + 1;
  const daysInYear  = ((currentYear % 4 === 0 && currentYear % 100 !== 0) || currentYear % 400 === 0) ? 366 : 365;

  const totalAll = dividends.reduce((s, d) => s + +d.amount, 0);
  const yearDiv  = dividends.filter(d => +d.year === currentYear).reduce((s, d) => s + +d.amount, 0);
  const ttm      = _ttmDividends();
  const netCapital = _currentCostBasis();

  // Current Yield = الدخل المتوقع ÷ القيمة السوقية الحالية
  const currentMarketVal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);

  // TTM YOC — مفيد لكنه متأثر بنمو المحفظة (المقام الحالي أكبر من متوسط الفترة)
  const ttmYoc    = netCapital > 0 ? ttm / netCapital * 100 : 0;
  const ttmYocCls = ttmYoc >= 5 ? 'text-success' : ttmYoc >= 3 ? 'text-accent' : 'text-muted';

  // Forward Projected — الأصح للمحافظ النامية: آخر دفعة لكل سهم × دوريتها × الأسهم الحالية
  const fwd        = _projectedAnnualIncome();
  const fwdYoc     = netCapital > 0 ? fwd.total / netCapital * 100 : 0;
  const fwdYocCls  = fwdYoc >= 5 ? 'text-success' : fwdYoc >= 3 ? 'text-accent' : 'text-muted';

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
      <div class="tx-stat-val ${ttmYocCls}">${ttmYoc.toFixed(2)}%</div>
      <div class="tx-stat-lbl">YOC الفعلي (TTM)</div>
      ${ttmNote}
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item"
      title="Forward Projected = لكل سهم: (آخر دفعة ÷ أسهم وقتها) × الدورية × الأسهم الحالية&#10;هذا ما تستخدمه ياهو فاينانس وإنفستنج كوم&#10;يعكس ما تتوقع استلامه سنوياً من محفظتك الحالية&#10;مغطى: ${coveredByFwd} رمز من أصل ${uniqueTickers}">
      <div class="tx-stat-val ${fwdYocCls}">${fwdYoc.toFixed(2)}%</div>
      <div class="tx-stat-lbl">العائد المتوقع (Forward)</div>
      <div class="tx-stat-sub" style="color:var(--success,#3fb950)">≈ ${formatSAR(fwd.total)} سنوياً</div>
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val text-success"
        title="الدخل التوزيعي السنوي المتوقع من المحفظة الحالية&#10;= مجموع (آخر DPS × الدورية × الأسهم الحالية) لكل رمز">
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
  const divYearsSet   = new Set(dividends.map(d => d.year));
  const divYears      = divYearsSet.size;
  const uniqueTickers = new Set(dividends.map(d => d.ticker)).size;

  // ── الفجوة بين Forward و TTM ──────────────────────────────────────
  // فجوة كبيرة = المحفظة نمت مؤخراً = الـ TTM مشوّه
  const fwdTtmGap = ttm > 0 && fwdIncome > 0
    ? ((fwdIncome - ttm) / ttm * 100)
    : 0;

  // ── درجة الثقة (0–100) ───────────────────────────────────────────
  const agePct  = months < 3  ? 0.05 : months < 6  ? 0.22 :
                  months < 9  ? 0.35 : months < 12 ? 0.50 :
                  months < 18 ? 0.67 : months < 24 ? 0.80 :
                  months < 36 ? 0.90 : 1.00;
  const divPct  = divYears === 0 ? 0.05 :
                  divYears === 1 ? 0.48 :
                  divYears === 2 ? 0.75 :
                  divYears >= 3  ? 0.95 : 0.05;
  const covPct  = fwdCoveredCount === 0       ? 0.10 :
                  fwdCoveredCount < uniqueTickers * 0.5 ? 0.50 :
                  fwdCoveredCount < uniqueTickers * 0.8 ? 0.75 : 0.95;

  const score = Math.round(agePct * 45 + divPct * 35 + covPct * 20);

  // ── مستوى الثقة ──────────────────────────────────────────────────
  let badgeColor, borderColor, bgColor;
  if      (score < 30) { badgeColor='#f85149'; borderColor='rgba(248,81,73,.3)';  bgColor='rgba(248,81,73,.05)'; }
  else if (score < 45) { badgeColor='#f85149'; borderColor='rgba(248,81,73,.2)';  bgColor='rgba(248,81,73,.04)'; }
  else if (score < 60) { badgeColor='#f0b429'; borderColor='rgba(240,180,41,.3)'; bgColor='rgba(240,180,41,.05)'; }
  else if (score < 75) { badgeColor='#f0b429'; borderColor='rgba(240,180,41,.2)'; bgColor='rgba(240,180,41,.04)'; }
  else if (score < 87) { badgeColor='#3fb950'; borderColor='rgba(63,185,80,.3)';  bgColor='rgba(63,185,80,.05)'; }
  else                 { badgeColor='#3b82f6'; borderColor='rgba(59,130,246,.3)'; bgColor='rgba(59,130,246,.05)'; }

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

  el.innerHTML = `
    <div style="
      border:1px solid ${borderColor};
      background:${bgColor};
      border-radius:10px;
      padding:12px 16px;
    ">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <span style="font-weight:700;font-size:.9rem">${title}</span>
        <span style="
          background:${badgeColor};color:#fff;border-radius:20px;
          padding:1px 9px;font-size:.72rem;font-weight:700;white-space:nowrap
        ">ثقة البيانات ${score}%</span>
        <span style="
          background:var(--bg-2);border:1px solid var(--border);
          border-radius:20px;padding:1px 9px;font-size:.70rem;color:var(--text-muted);white-space:nowrap
        "
        title="عمر رأس المال الفعلي (مرجَّح بالمعاملات) = ${months} شهر&#10;العمر التقويمي = ${calMonths} شهر&#10;الضخ التدريجي يقلّص عمر رأس المال الفعلي">
          ${cwDiff >= 2
            ? `رأس المال الفعلي: ${monthsText} | تقويمي: ${calText}`
            : `عمر المحفظة: ${monthsText}`}
          · ${divYears} سنة أرباح · ${uniqueTickers} موزِّع
        </span>
      </div>
      <p style="font-size:.81rem;color:var(--text-2);margin:0 0 5px;line-height:1.6">${body}</p>
      <p style="font-size:.79rem;color:${badgeColor};margin:0;font-weight:600">💡 ${advice}</p>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// بناء خرائط التكلفة — الحسبة الصحيحة: avg_cost × الأسهم المتبقية
// ══════════════════════════════════════════════════════════════

// تكلفة الحيازات الفعلية لرمز واحد في نهاية سنة معينة
// avg_cost = مجموع (price × shares للمشتريات) ÷ إجمالي الأسهم المشتراة
// costBasis = avg_cost × (أسهم مشتراة − أسهم مباعة)
function _tickerCostBasisAtYear(ticker, upToYear) {
  const allTx = [...txBuyRows, ...txSellRows].filter(t => t.ticker === ticker);
  let buyShares = 0, buyCost = 0, sellShares = 0;
  allTx.forEach(t => {
    if (!t.date) return;
    if ((parseDateLocal(t.date) || new Date(0)).getFullYear() > upToYear) return;
    if (t.type === 'buy') {
      buyCost   += +t.price * +t.shares;   // price per share × shares (بدون عمولة)
      buyShares += +t.shares;
    } else if (t.type === 'grant') {
      buyShares += +t.shares;              // منحة: تضيف أسهم بتكلفة صفر
    } else if (t.type === 'sell') {
      sellShares += +t.shares;
    }
  });
  const remaining = buyShares - sellShares;
  if (remaining < 0.001 || buyShares < 0.001) return 0;
  const avgCost = buyCost / buyShares;
  return avgCost * remaining;
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
    const yr     = String(new Date(tx.date).getFullYear());
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
function renderSummaries() {
  const maps = buildCostMaps();
  renderYearlySummary(maps);
  renderHoldingSummary(maps);
}

// ── اليمين: الإجمالي السنوي ───────────────────────────────────
function renderYearlySummary({ yearPortfolio }) {
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
  const fwd = _projectedAnnualIncome();
  const fwdNetCap = (() => {
    const tickers = [...new Set([...txBuyRows.map(t => t.ticker), ...txSellRows.map(t => t.ticker)])];
    return tickers.reduce((s, t) => s + _tickerCostBasisAtYear(t, currentYear), 0);
  })();
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

      // رأس المال في نهاية السنة (أو حتى اليوم للسنة الجارية)
      const endPort   = yearPortfolio[y]          ?? 0;
      // رأس المال بداية السنة = نهاية السنة السابقة (المقام الصحيح للعائد)
      const prevYear  = String(+y - 1);
      const beginPort = yearPortfolio[prevYear]   ?? 0;
      // السنة الأولى في السجل: لا يوجد "قبلها" → نستخدم نهاية نفس السنة
      const denominator = beginPort > 0 ? beginPort : endPort;

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
        title="الدخل السنوي المتوقع من المحفظة الحالية&#10;= مجموع (آخر DPS × الدورية × الأسهم الحالية) لكل رمز">
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
function renderHoldingSummary({ tickerYearCost, tickerYearPortfolio }) {
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
  const txYears   = [...new Set([...txBuyRows, ...txSellRows].map(tx => String(new Date(tx.date).getFullYear())))];
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
      portVal = tickerYearPortfolio[ticker]?.[selectedYear] ?? null;
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
    const tickerDivs = dividends.filter(d => d.ticker === ticker).sort((a,b) => a.date?.localeCompare(b.date));
    const firstDate   = tickerDivs[0]?.date ? new Date(tickerDivs[0].date) : null;
    const daysSince   = firstDate ? Math.floor((today - firstDate) / 86400000) : 0;
    const paymentCount = tickerDivs.length;
    const level = (daysSince >= 730 && paymentCount >= 3) ? 'full'
                : (daysSince >= 365 && paymentCount >= 2) ? 'partial'
                : 'low';
    tickerConfidence[ticker] = { daysSince, paymentCount, level };
  });

  // Forward projected لكل سهم (للعمود الإضافي)
  const fwdData = _projectedAnnualIncome();
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
        ${showFwdCol ? `<th title="Forward = آخر DPS × الدورية × الأسهم الحالية — مثل ياهو فاينانس&#10;الأدق للمحافظ النامية" style="color:var(--success)">▶ Forward / سنة</th>` : ''}
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
    ⚠️ <strong>YOC الفعلي منخفض؟</strong> — طبيعي إذا نمت محفظتك مؤخراً: الأرباح المقاسة جُمعت حين كانت أصغر، بينما المقام (تكلفة الحيازات) يعكس حجمها الحالي الأكبر.
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
function renderTable() {
  const tbody = document.getElementById('div-tbody');
  if (!tbody) return;

  if (!dividends.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">💰</div><p>لا توجد أرباح مسجلة بعد</p></div></td></tr>`;
    enableInlineEditing(tbody, onDivSaved);
    return;
  }

  tbody.innerHTML = dividends.map(d => `<tr>
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
  if (!confirm('أرشفة هذه الأرباح؟ ستُخفى من الحسابات لكنها تبقى في قاعدة البيانات.')) return;
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
  exportCSV(`أرباح_موزعة_${todayISO()}.csv`,
    ['التاريخ', 'الرمز', 'الاسم', 'المبلغ', 'الشهر', 'السنة'],
    dividends.map(d => [d.date, d.ticker, d.name, d.amount, MONTHS_AR[d.month - 1], d.year])
  );
  showToast(`✓ تم تصدير ${dividends.length} سجل`, 'success');
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
        const [yr, mo] = key.split('-').map(Number);
        return dividends.filter(d => d.ticker === t && d.year === yr && d.month === mo).reduce((s,d) => s + +d.amount, 0);
      });
      const c = STACKED_COLORS[i % STACKED_COLORS.length];
      return { label: t, data, backgroundColor: c + 'cc', borderColor: c, borderWidth: 1, borderRadius: 2 };
    });
    const total = dividends.filter(d => {
      const key = d.year + '-' + String(d.month).padStart(2,'0');
      return periodKeys.includes(key);
    }).reduce((s,d) => s + +d.amount, 0);
    document.getElementById('chart-total-label').textContent = 'إجمالي آخر 12 شهراً: ~' + total.toFixed(2) + ' ر.س';
    buildChart(canvas, labels, datasets, true);
    return;
  }

  const actualMap = {};
  dividends.forEach(d => { const key = d.year + '-' + String(d.month).padStart(2,'0'); actualMap[key] = (actualMap[key] || 0) + +d.amount; });
  const received = periodKeys.map(k => actualMap[k] || 0);
  const total    = received.reduce((s,v) => s+v, 0);
  document.getElementById('chart-total-label').textContent = 'إجمالي آخر 12 شهراً: ~' + total.toFixed(2) + ' ر.س';

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
    const amt = dividends.filter(x => x.year === yr && x.month === mo).reduce((s,x) => s + +x.amount, 0);
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

  // ── بناء 2: DPS (توزيع للسهم الواحد) — للحسابات الجودة ──────────────────
  // المشكلة الأساسية: المبلغ الإجمالي يتأثر بحجم مركزك (شراء/بيع جزئي).
  // مثال: بعت 400 سهم من 1500 في فبراير → توزيع مايو أقل بالمبلغ
  //        رغم أن الشركة دفعت نفس DPS — الكود يحسبها "تراجع" خطأً.
  //
  // الحل: DPS = مبلغ التوزيع ÷ الأسهم المملوكة وقت التوزيع
  //   ✓ يعكس قرار الشركة الفعلي — لا حجم محفظتك
  //   ✓ محصّن ضد البيع الجزئي والشراء الإضافي
  //   ✓ يتيح مقارنة عادلة بين سنوات مختلفة حتى لو تغير المركز
  const byTickerYearDPS = {};  // ticker → { year → إجمالي DPS للسنة }
  const dpsNormalized   = {};  // ticker → هل تتوفر بيانات المعاملات؟

  dividends.forEach(d => {
    const t = d.ticker;
    const y = +d.year;
    if (!t || !y) return;

    const divDate     = _divSortDate(d);          // تاريخ التوزيع
    const sharesAtDiv = _sharesAtDate(t, divDate); // أسهمك وقت التوزيع

    if (sharesAtDiv < 0.001) return; // لا أسهم مسجّلة وقت التوزيع — تجاهل

    const dps = +d.amount / sharesAtDiv; // الريال لكل سهم
    if (!byTickerYearDPS[t]) byTickerYearDPS[t] = {};
    byTickerYearDPS[t][y] = (byTickerYearDPS[t][y] || 0) + dps;
    dpsNormalized[t] = true;
  });

  const currentYear = new Date().getFullYear();
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
    const isDPS   = !!dpsNormalized[ticker];
    const yearMap = isDPS ? byTickerYearDPS[ticker] : byTickerYear[ticker];

    const years    = Object.keys(yearMap).map(Number).sort((a,b) => a - b);
    const amounts  = years.map(y => yearMap[y]); // DPS أو مبلغ خام
    const n        = years.length;

    // المبلغ الفعلي المستلم (للعرض — دائماً من الخام بغض النظر عن المصدر)
    const rawYearMap = byTickerYear[ticker];
    const rawYears   = Object.keys(rawYearMap || {}).map(Number).sort((a,b) => a - b);
    const lastRawAmt = rawYears.length ? (rawYearMap[rawYears[rawYears.length - 1]] || 0) : 0;

    // ── 1. الاستمرارية (0–35 نقطة) ────────────────────────────
    const minYear = years[0], maxYear = years[n - 1];
    const expectedYears = maxYear - minYear + 1;
    const continuityRatio = expectedYears > 0 ? n / expectedYears : 1;
    const continuityScore = Math.round(continuityRatio * 35);

    // ── 2. نمو التوزيعات (0–35 نقطة) — بالـ DPS المُعدَّل ────────
    let growthScore = 17;
    let cagr3 = null, cagr5 = null;

    if (n >= 2) {
      const calcCagr = (from, to) => {
        if (!yearMap[from] || !yearMap[to] || yearMap[from] <= 0) return null;
        const periods = to - from;
        if (periods <= 0) return null;
        return (Math.pow(yearMap[to] / yearMap[from], 1 / periods) - 1) * 100;
      };

      cagr3 = calcCagr(currentYear - 3, currentYear - 1) ??
              calcCagr(years[Math.max(0, n-4)], years[n-1]);
      cagr5 = calcCagr(currentYear - 5, currentYear - 1) ??
              calcCagr(years[0], years[n-1]);

      const cagr = cagr3 ?? cagr5 ?? 0;
      growthScore = Math.round(Math.min(35, Math.max(0, (cagr + 10) / 18 * 35)));
    }

    // ── 3. انخفاض التذبذب (0–30 نقطة) — بالـ DPS المُعدَّل ──────
    let volatilityScore = 15;
    if (n >= 3) {
      const mean     = amounts.reduce((s, v) => s + v, 0) / n;
      const variance = amounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
      const cv       = mean > 0 ? Math.sqrt(variance) / mean : 1;
      volatilityScore = Math.round(Math.max(0, (1 - cv) * 30));
    }

    const totalScore = continuityScore + growthScore + volatilityScore;

    // الاتجاه: مقارنة DPS آخر سنة بالسابقة
    let trend = 'neutral';
    if (n >= 2) {
      const last = amounts[n - 1];
      const prev = amounts[n - 2];
      if (last > prev * 1.02)      trend = 'up';
      else if (last < prev * 0.98) trend = 'down';
    }

    const h = holdings.find(x => x.ticker === ticker);
    return {
      ticker,
      name:            h?.name || dividends.find(d => d.ticker === ticker)?.name || ticker,
      years:           n,
      firstYear:       years[0],
      lastYear:        years[n - 1],
      lastAmount:      lastRawAmt,   // المبلغ الفعلي المستلم (ليس DPS)
      isDPS,                          // هل الدرجة محسوبة من DPS؟
      cagr3, cagr5,
      continuityScore, growthScore, volatilityScore,
      totalScore,
      trend,
      inPortfolio:     !!h,
    };
  }).sort((a, b) => b.totalScore - a.totalScore);

  // ── رسم الجدول ─────────────────────────────────────────────
  const scoreColor = s => s >= 75 ? '#3fb950' : s >= 50 ? '#f0b429' : '#f85149';
  const scoreBadge = (s, lbl) =>
    `<span title="${lbl}" style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:0.72rem;font-weight:700;
      background:${scoreColor(s)}22;color:${scoreColor(s)}">${s}</span>`;
  const trendEl = t =>
    t === 'up'   ? '<span style="color:var(--success)">↑ نامٍ</span>' :
    t === 'down' ? '<span style="color:var(--danger)">↓ تراجع</span>' :
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
            <th>الاستمرارية<br><span class="small text-muted">/35</span></th>
            <th>نمو التوزيع<br><span class="small text-muted">/35 — بـ DPS</span></th>
            <th>ثبات التوزيع<br><span class="small text-muted">/30 — بـ DPS</span></th>
            <th>سنوات<br>التوزيع</th>
            <th>نمو 3 سنوات<br><span class="small text-muted">CAGR DPS</span></th>
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
                ${!s.inPortfolio ? '<span class="small text-muted"> (خارج المحفظة)</span>' : ''}
              </td>
              <td>${esc(s.name)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:1.1rem;font-weight:700;color:${totalColor}">${s.totalScore}</span>
                  <div style="flex:1;height:6px;background:var(--bg-3);border-radius:3px;min-width:60px">
                    <div style="width:${s.totalScore}%;height:100%;background:${totalColor};border-radius:3px"></div>
                  </div>
                </div>
              </td>
              <td style="text-align:center">${scoreBadge(s.continuityScore, 'انتظام سنوات التوزيع')}</td>
              <td style="text-align:center">${scoreBadge(s.growthScore, 'نمو التوزيعات سنة على سنة')}</td>
              <td style="text-align:center">${scoreBadge(s.volatilityScore, 'انخفاض التذبذب بين السنوات')}</td>
              <td class="num">${s.years} <span class="small text-muted">(${s.firstYear}–${s.lastYear})</span></td>
              <td>${cagrFmt(s.cagr3)}</td>
              <td class="num">${formatSAR(s.lastAmount)}</td>
              <td>${trendEl(s.trend)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <p class="small text-muted" style="margin-top:10px;padding:0 4px">
      * الدرجات مبنية على بياناتك المُسجّلة فقط — كلما أضفت سنوات أكثر زادت دقة التقييم.<br>
      <span style="color:#58a6ff">DPS ✓</span> = الدرجة محسوبة من التوزيع للسهم الواحد (يُزيل تأثير شراء/بيع جزئي) |
      آخر توزيع = المبلغ الفعلي المُستلَم (ليس DPS)
    </p>
  `;
}

function showDivQualityInfo() {
  alert([
    '🏆 درجة جودة التوزيعات',
    '',
    'الدرجة من 100 مقسّمة على 3 محاور:',
    '',
    '📅 الاستمرارية (35 نقطة)',
    'هل الشركة وزّعت بانتظام بدون سنوات قطع؟',
    '',
    '📈 نمو التوزيعات (35 نقطة)',
    'معدل نمو DPS السنوي (CAGR) — يقيس نمو الشركة لا حجم مركزك.',
    '',
    '📊 ثبات التوزيعات (30 نقطة)',
    'معامل الاختلاف (CV) — مبني على DPS، لا المبلغ الإجمالي.',
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
  ].join('\n'));
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
  if (!confirm('⚠️ حذف نهائي — لا يمكن التراجع عن هذا الإجراء. هل أنت متأكد؟')) return;
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
