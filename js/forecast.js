/* =====================================================================
   forecast.js — الرؤية المستقبلية
   محرك إسقاط شهري دقيق — 4 سيناريوهات — أداء تاريخي فعلي
   ===================================================================== */
'use strict';

// ── State ─────────────────────────────────────────────────────────────
let _hist            = null;
let _scenarios       = [];
let _projections     = [];
let _forecastChart   = null;
let _activeScenarios = ['conservative','base','optimistic','exceptional'];
let _activeHighlight = 'base';
let _goalType        = 'portfolio_value';   // 'portfolio_value' | 'monthly_income'
let _chartMode       = 'line';              // 'line' | 'log' | 'bar' | 'cards'

// المعالم تُبنى ديناميكياً كل سنة في renderMilestoneTable

const SCENARIO_META = [
  { key:'conservative', name:'متحفظ',    emoji:'🛡️', cls:'sc-conservative', color:'#8b949e',
    desc:'أداء دون التاريخي — يناسب فترات الضغط السوقي والركود' },
  { key:'base',         name:'معتدل',    emoji:'📊', cls:'sc-base',         color:'#3fb950',
    desc:'أداؤك التاريخي مُعدَّل بواقعية حسب ثقة بياناتك (مزج بمعيار السوق)' },
  { key:'optimistic',   name:'متفائل',   emoji:'🚀', cls:'sc-optimistic',   color:'#f0b429',
    desc:'أداء أعلى من التاريخي +4% نمو، +1.5% أرباح إضافية' },
  { key:'exceptional',  name:'استثنائي', emoji:'⚡', cls:'sc-exceptional',  color:'#a371f7',
    desc:'أداء استثنائي +8% نمو، +3% أرباح — ظروف مثالية' },
];

// ── Init ──────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-forecast');
  try {
    _hist = await loadHistoricalData();
    renderHistSummary();
    buildScenarios();
    renderScenarioCards();
    runForecast();
  } catch (e) {
    console.error('forecast init error:', e);
    showToast('خطأ في تحميل بيانات المحفظة', 'error');
  }
}

// ── Load historical data ───────────────────────────────────────────────
async function loadHistoricalData() {
  const [rTx, rDiv, rH, rCf, rNw, rRe] = await Promise.all([
    supabaseClient.from('transactions').select('type,total,shares,price,date,ticker').eq('is_archived',false),
    supabaseClient.from('dividends').select('amount,year').eq('is_archived',false).order('year'),
    supabaseClient.from('holdings').select('shares,current_price,avg_price,ticker'),
    supabaseClient.from('cashflow_entries').select('type,amount,date').eq('is_archived',false),
    supabaseClient.from('net_worth_snapshots').select('total_value').order('date',{ascending:false}).limit(1).maybeSingle(),
    supabaseClient.from('real_estate').select('current_value,status').eq('is_active',true),
  ]);

  const txRows  = rTx.data  || [];
  const divRows = rDiv.data || [];
  const hRows   = rH.data   || [];
  const cfRows  = rCf.data  || [];
  // صافي الثروة الفعلي: من آخر snapshot إن وُجد، وإلا أسهم + عقارات
  const reTotal  = (rRe.data || []).filter(p => p.status !== 'sold').reduce((s,p) => s + +p.current_value, 0);
  const snapshotNW = rNw.data?.total_value ? +rNw.data.total_value : null;

  // القيمة السوقية والتكلفة الحالية
  const currentValue = hRows.reduce((s,h) => s + +h.shares * +h.current_price, 0);
  const costBasis    = hRows.reduce((s,h) => s + +h.shares * +h.avg_price, 0);

  // مدة النشاط
  const buyDates    = txRows.filter(t => t.type==='buy' && t.date).map(t => t.date).sort();
  const firstDate   = buyDates[0] ? new Date(buyDates[0]) : null;
  const today       = new Date();
  const yearsActive = firstDate
    ? Math.max(0.5, (today - firstDate) / (365.25 * 86400000))
    : 1;

  // رأس المال الصافي
  const totalBuys  = txRows.filter(t => t.type==='buy').reduce((s,t)  => s + +t.total, 0);
  const totalSells = txRows.filter(t => t.type==='sell').reduce((s,t) => s + +t.total, 0);
  const netCapital = Math.max(1, totalBuys - totalSells);

  // ── معدل النمو السنوي: XIRR الحقيقي (أدق من CAGR) ──────────
  // XIRR يأخذ توقيت كل معاملة في الحسبان — لا يُضلَّل بإيداعات متأخرة
  const xirrFlows = [];
  txRows.forEach(t => {
    if (t.type === 'buy')  xirrFlows.push({ date: new Date(t.date), amount: -(+t.total) });
    if (t.type === 'sell') xirrFlows.push({ date: new Date(t.date), amount: +(+t.total) });
  });
  divRows.forEach(d => {
    // نستخدم السنة فقط إن لم يكن هناك تاريخ
    const dDate = d.date ? new Date(d.date) : new Date(d.year + '-06-01');
    xirrFlows.push({ date: dDate, amount: +d.amount });
  });
  if (currentValue > 0) xirrFlows.push({ date: new Date(), amount: currentValue });

  const xirrResult = computeXIRR(xirrFlows);   // من utils.js

  // عائد الأرباح السنوي: نستخدم آخر سنتين فعليتين من الأرباح ÷ القيمة السوقية الحالية
  // هذا أدق من المتوسط التاريخي الكلي لأنه يعكس الوضع الفعلي للمحفظة الحالية
  // ملاحظة: يجب حساب safeDivYield قبل annCapGrowth لأنه يُستخدم في تفكيك XIRR
  const totalDivAll  = divRows.reduce((s,d) => s + +d.amount, 0);
  const divYears     = [...new Set(divRows.map(d => d.year))].length || 1;

  const divByYearTemp = {};
  divRows.forEach(d => { divByYearTemp[d.year] = (divByYearTemp[d.year] || 0) + +d.amount; });
  const sortedDivYears = Object.keys(divByYearTemp).map(Number).sort((a,b) => b - a);

  // متوسط آخر سنتين لهما أرباح فعلية (أو سنة واحدة إن لم يتوفر أكثر)
  const recentDivAmounts = sortedDivYears.slice(0, 2).map(y => divByYearTemp[y]);
  const avgRecentDiv = recentDivAmounts.length
    ? recentDivAmounts.reduce((s,v) => s + v, 0) / recentDivAmounts.length
    : totalDivAll / Math.max(divYears, yearsActive);

  // القيمة السوقية الحالية هي الأساس الصحيح (مو التكلفة التاريخية)
  const avgAnnualDiv = avgRecentDiv;
  const annDivYield  = currentValue > 0 ? avgRecentDiv / currentValue : 0.035;
  const safeDivYield = Math.min(0.15, Math.max(0, annDivYield));

  // annCapGrowth: XIRR إن توفّر، وإلا CAGR احتياطياً
  const rawCapGrowth = (netCapital > 0 && currentValue > 0)
    ? Math.pow(currentValue / netCapital, 1 / yearsActive) - 1
    : 0.07;
  const xirrRate = xirrResult != null ? xirrResult / 100 : null;
  // خصم عائد الأرباح من XIRR للحصول على نمو رأس المال فقط
  const annCapGrowth = Math.min(0.40, Math.max(0.02,
    xirrRate != null
      ? Math.max(0.01, xirrRate - safeDivYield)   // نمو السعر فقط
      : rawCapGrowth
  ));

  // متوسط الإضافة الشهرية التاريخية
  const totalDeposited    = cfRows.filter(e => e.type==='deposit').reduce((s,e) => s + +e.amount, 0);
  const avgMonthlyDeposit = yearsActive > 0 ? totalDeposited / (yearsActive * 12) : 0;

  // ══════════════════════════════════════════════════════════════════════
  // عمر رأس المال المرجَّح بالتدفقات (Capital-Weighted Age)
  // الفكرة: كل ريال يُحسب بعدد الأشهر التي قضاها فعلاً في المحفظة
  // الصيغة: Σ(مبلغ_الإيداع × الأشهر_منذ_الإيداع) ÷ إجمالي_رأس_المال_الحالي
  // لو بدأت بـ10K ثم حطيت 170K بعد 4 شهور:
  //   (10K×8 + 170K×4) / 180K = (80K + 680K) / 180K = 4.2 شهر فعلي (لا 8)
  // ══════════════════════════════════════════════════════════════════════
  const capitalWeightedMonths = (() => {
    const sorted = [...cfRows].filter(e => e.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    let runningBalance = 0;
    let weightedSum    = 0;

    sorted.forEach(cf => {
      const monthsAgo = (today - new Date(cf.date)) / (30.44 * 86400000);
      const amt       = +cf.amount || 0;

      if (cf.type === 'deposit') {
        // هذا المبلغ قضى monthsAgo شهراً في المحفظة
        weightedSum    += amt * monthsAgo;
        runningBalance += amt;
      } else if (cf.type === 'withdrawal') {
        // السحب يقلص رأس المال ويُقلص الوزن التراكمي بنفس النسبة
        if (runningBalance > 0) {
          const pct   = Math.min(1, amt / runningBalance);
          weightedSum *= (1 - pct);
        }
        runningBalance = Math.max(0, runningBalance - amt);
      }
    });

    // إذا لا يوجد تدفقات، نستخدم تواريخ المعاملات كبديل
    if (runningBalance < 1 && totalBuys > 0) {
      const buysSorted = txRows.filter(t => t.type === 'buy' && t.date)
        .sort((a, b) => a.date.localeCompare(b.date));
      let wb = 0, ws = 0;
      buysSorted.forEach(t => {
        const m = (today - new Date(t.date)) / (30.44 * 86400000);
        ws += +t.total * m;
        wb += +t.total;
      });
      txRows.filter(t => t.type === 'sell' && t.date).forEach(t => {
        if (wb > 0) { const p = Math.min(1, +t.total / wb); ws *= (1 - p); }
        wb = Math.max(0, wb - +t.total);
      });
      return wb > 0 ? Math.max(0.5, ws / wb) : yearsActive * 12;
    }

    return runningBalance > 0
      ? Math.max(0.5, weightedSum / runningBalance)
      : yearsActive * 12;
  })();

  const divByYear = {};
  divRows.forEach(d => { divByYear[d.year] = (divByYear[d.year] || 0) + +d.amount; });

  // ══════════════════════════════════════════════════════════════════════
  // درجة الثقة (نفس خوارزمية renderDataConfidenceBanner — نُعيد حسابها هنا
  // لاستخدامها في المزج الواقعي للسيناريو المعتدل)
  // ══════════════════════════════════════════════════════════════════════
  const _cwM  = Math.round(capitalWeightedMonths);
  const _divY = [...new Set(divRows.map(d => d.year))].length;
  const _agePct  = _cwM < 3 ? 0.05 : _cwM < 6 ? 0.20 : _cwM < 9 ? 0.32 : _cwM < 12 ? 0.45 :
                   _cwM < 18 ? 0.62 : _cwM < 24 ? 0.76 : _cwM < 36 ? 0.88 : 1.00;
  const _divPct  = _divY === 0 ? 0.05 : _divY === 1 ? 0.45 : _divY === 2 ? 0.72 : 0.95;
  const _holdPct = hRows.length < 3 ? 0.40 : hRows.length < 6 ? 0.65 : hRows.length < 10 ? 0.82 : 0.95;
  const confidenceScore = Math.round(_agePct * 45 + _divPct * 35 + _holdPct * 20);

  // ── المزج الواقعي للسيناريو المعتدل ────────────────────────────────
  // معيار السوق السعودي (تاسي) طويل المدى: نمو السعر ~5% سنوياً (محافظ)
  // كلما ارتفعت ثقة البيانات → نعتمد أداءك الشخصي أكثر
  // عند ثقة 0%  → 5% (معيار السوق فقط)
  // عند ثقة 50% → متوسط 50/50
  // عند ثقة 100% → أداؤك الشخصي بالكامل
  const MARKET_CAP_BENCHMARK = 0.05;
  const confWeight = confidenceScore / 100;
  const blendedCapGrowth = Math.min(0.35, Math.max(0.02,
    annCapGrowth * confWeight + MARKET_CAP_BENCHMARK * (1 - confWeight)
  ));

  // ── هدف FIRE من الإعدادات المحلية (مُقيَّد بالمستخدم) ────────────────
  let fireGoal = { monthly: 0, swr: 4, target_year: 0 };
  try {
    const scopedKey = userLsKey('retirement_goal_v1');
    const raw = localStorage.getItem(scopedKey) || localStorage.getItem('retirement_goal_v1') || '{}';
    const fg = JSON.parse(raw);
    fireGoal = { monthly: +fg.monthly || 0, swr: +fg.swr || 4, target_year: +fg.target_year || 0 };
  } catch(_) {}

  // صافي الثروة الشامل للحساب الدقيق لتقدم FIRE
  const totalNW = snapshotNW ?? (currentValue + reTotal);

  return {
    currentValue, costBasis, netCapital, totalNW,
    annCapGrowth,                          // الأداء الشخصي الخام
    blendedCapGrowth,                      // المستخدم فعلياً في السيناريوهات
    safeDivYield, avgAnnualDiv,
    avgMonthlyDeposit, totalDivAll,
    totalBuys, totalSells,
    yearsActive, firstDate,
    capitalWeightedMonths,
    xirr: xirrResult,
    xirrUsed: xirrRate != null,
    currentYear: today.getFullYear(),
    divByYear,
    holdingsCount: hRows.length,
    confidenceScore,
    divYears: _divY,
    fireGoal,
  };
}

// ── تطبيق هدف FIRE على حقل الهدف ─────────────────────────────────────
function applyFireGoal() {
  const fg = _hist?.fireGoal;
  if (!fg?.monthly || !fg?.target_year) return;
  const fireNumber = (fg.monthly * 12) / (fg.swr / 100);
  const goalInp = document.getElementById('inp-goal-amount');
  if (goalInp) { goalInp.value = Math.round(fireNumber); }
  setGoalType('portfolio_value');
  // اضبط الأفق على سنة التقاعد
  const horizonSel = document.getElementById('inp-horizon');
  const yearsLeft  = fg.target_year - new Date().getFullYear();
  if (horizonSel && yearsLeft > 0) {
    // اختر أقرب خيار متاح
    const opts = [...horizonSel.options].map(o => +o.value);
    const best = opts.reduce((p, c) => Math.abs(c - yearsLeft) < Math.abs(p - yearsLeft) ? c : p);
    horizonSel.value = best;
  }
  runForecast();
  showToast(`✓ تطبيق هدف FIRE: محفظة ${fmt(fireNumber)} بحلول ${fg.target_year}`, 'success');
}

// ── Build 4 scenarios ──────────────────────────────────────────────────
function buildScenarios(divOverride) {
  // نستخدم blendedCapGrowth بدلاً من annCapGrowth الخام
  // هذا يُدخل واقعية: بيانات أقل ثقة → نمزج نحو معيار السوق (5%)
  const base = _hist.blendedCapGrowth;
  const div  = divOverride !== undefined ? divOverride : _hist.safeDivYield;
  _scenarios = [
    { key:'conservative', capRate: Math.max(0.02, base * 0.60), divRate: Math.max(0.01, div * 0.70) },
    { key:'base',         capRate: base,                         divRate: div },
    { key:'optimistic',   capRate: Math.min(0.35, base + 0.04), divRate: Math.min(0.12, div + 0.015) },
    { key:'exceptional',  capRate: Math.min(0.40, base + 0.08), divRate: Math.min(0.15, div + 0.030) },
  ];
}

// ── Core monthly projection engine ─────────────────────────────────────
// يُشغّل محاكاة شهرية دقيقة تشمل: نمو رأس المال، الأرباح، إعادة الاستثمار،
// إضافات دورية، تعديل التضخم
function projectScenario(scenario, params) {
  const {
    startValue, monthlyAdd, lumpSum,
    horizonYears, reinvestDividends,
    adjustInflation, inflationRate,
  } = params;

  const monthlyCapRate = Math.pow(1 + scenario.capRate, 1/12) - 1;
  const monthlyDivRate = scenario.divRate / 12;
  const totalMonths    = horizonYears * 12;
  const monthlyInfl    = Math.pow(1 + inflationRate, 1/12) - 1;

  let value               = startValue + lumpSum;
  let cumulativeDividends = 0;
  let cumulativeAdded     = lumpSum;
  let inflationFactor     = 1;

  const snapshots = [{
    year: 0, value, cumDiv: 0, cumAdded: 0,
    realValue: value,
    monthlyIncome:     value * monthlyDivRate,
    monthlyIncomeReal: value * monthlyDivRate,   // = nominal when no inflation yet
    yourCapital:       startValue + lumpSum,      // مجموع ما أضفته من مالك
    priceGrowth:       0,                         // نمو السعر الصافي
  }];

  for (let m = 1; m <= totalMonths; m++) {
    // 1. نمو رأس المال (سعر السهم)
    value *= (1 + monthlyCapRate);

    // 2. الأرباح الموزعة
    const divEarned = value * monthlyDivRate;
    cumulativeDividends += divEarned;
    if (reinvestDividends) value += divEarned;

    // 3. الإضافة الشهرية (DCA)
    value           = Math.max(0, value + monthlyAdd);
    cumulativeAdded += monthlyAdd;

    // 4. مؤشر التضخم
    if (adjustInflation) inflationFactor *= (1 + monthlyInfl);

    // تسجيل لقطة سنوية
    if (m % 12 === 0) {
      const realVal      = adjustInflation ? value / inflationFactor : value;
      // رأس مالك الفعلي المُضاف (أصل + شهري + مبلغ فوري)
      const yourCap      = startValue + cumulativeAdded;
      // نمو السعر الصافي = كل شيء فوق ما دفعته ومن الأرباح المعاد استثمارها
      const priceGrowth  = Math.max(0, value - yourCap - (reinvestDividends ? cumulativeDividends : 0));
      snapshots.push({
        year:              m / 12,
        value,
        cumDiv:            cumulativeDividends,
        cumAdded:          cumulativeAdded,
        realValue:         realVal,
        monthlyIncome:     value * monthlyDivRate,
        monthlyIncomeReal: realVal * monthlyDivRate,
        yourCapital:       yourCap,
        priceGrowth,
      });
    }
  }

  return snapshots;
}

// ── Goal year computation ──────────────────────────────────────────────
function computeGoalYear(snapshots, divRate, goalType, goalAmount) {
  if (!goalAmount || goalAmount <= 0) return null;
  for (let i = 1; i < snapshots.length; i++) {
    const metric = goalType === 'monthly_income'
      ? snapshots[i].monthlyIncome
      : snapshots[i].value;
    if (metric >= goalAmount) return i;
  }
  return null;
}

// ── Run forecast ───────────────────────────────────────────────────────
function runForecast() {
  if (!_hist || !_scenarios.length) return;

  const startValue    = parseFloat(document.getElementById('inp-current-value').value) || _hist.currentValue || 0;
  const monthlyAdd    = parseFloat(document.getElementById('inp-monthly-add').value)   || 0;
  const lumpSum       = parseFloat(document.getElementById('inp-lump-sum').value)       || 0;
  const horizonYears  = parseInt(document.getElementById('inp-horizon').value)           || 35;
  const reinvest      = document.getElementById('inp-reinvest').checked;
  const inflation     = document.getElementById('inp-inflation').checked;
  const inflationRate = parseFloat(document.getElementById('inp-inflation-rate').value) / 100 || 0.025;
  const goalAmount    = parseFloat(document.getElementById('inp-goal-amount').value)    || 0;

  // عائد الأرباح: يدوي إذا أدخله المستخدم، وإلا من البيانات الفعلية
  const divYieldOverride = parseFloat(document.getElementById('inp-div-yield').value);
  const divYieldToUse    = (!isNaN(divYieldOverride) && divYieldOverride > 0)
    ? divYieldOverride / 100
    : _hist.safeDivYield;

  // إعادة بناء السيناريوهات بعائد الأرباح الصحيح
  buildScenarios(divYieldToUse);

  const params = {
    startValue, monthlyAdd, lumpSum, horizonYears,
    reinvestDividends: reinvest,
    adjustInflation: inflation,
    inflationRate,
  };

  _projections = _scenarios.map(sc => ({
    key: sc.key, scenario: sc,
    data: projectScenario(sc, params),
  }));

  if (_chartMode === 'cards') {
    document.getElementById('chart-area').style.display  = 'none';
    document.getElementById('cards-area').style.display  = 'block';
    document.getElementById('chart-legend').style.display = 'none';
    renderCardsView(horizonYears);
  } else {
    document.getElementById('chart-area').style.display  = 'block';
    document.getElementById('cards-area').style.display  = 'none';
    document.getElementById('chart-legend').style.display = 'flex';
    renderChart(horizonYears, goalAmount);
  }
  renderMilestoneTable(horizonYears);
  renderGoalPanel(horizonYears, goalAmount);
  renderScenarioDetail(horizonYears);
  updateChartSubtitle(params);
}

// ── Render historical summary ──────────────────────────────────────────
function renderHistSummary() {
  const h = _hist;
  const badge = document.getElementById('hist-period-badge');
  if (badge) {
    const from = h.firstDate ? h.firstDate.getFullYear() : '—';
    badge.textContent = `${h.yearsActive.toFixed(1)} سنة بيانات (${from}–${h.currentYear})`;
  }

  // XIRR: المصدر الأصدق للعائد التاريخي الحقيقي
  const xirrLabel = h.xirr != null
    ? `${h.xirr >= 0 ? '+' : ''}${h.xirr.toFixed(2)}%`
    : '—';

  // نمو رأس المال: عرض الخام vs المُعدَّل للواقعية
  const rawCap     = h.annCapGrowth;
  const blended    = h.blendedCapGrowth;
  const conf       = h.confidenceScore || 0;
  const isBlended  = Math.abs(rawCap - blended) > 0.001;
  const growthLabel = isBlended
    ? `${pct(blended)} <span style="font-size:0.63rem;color:var(--text-muted)"
        title="أداؤك الشخصي ${pct(rawCap)} مُمزوج بمعيار السوق (5%)&#10;بوزن ثقة البيانات ${conf}%&#10;كلما زادت بيانات محفظتك → نعتمد أداءك أكثر">
        (خامك ${pct(rawCap)} · ثقة ${conf}%)
      </span>`
    : `${pct(blended)} <span style="font-size:0.63rem;color:var(--success)" title="ثقة بيانات عالية — أداؤك الشخصي مُستخدَم بالكامل">✓ثقة ${conf}%</span>`;

  const items = [
    { val: fmt(h.currentValue),           lbl: 'القيمة السوقية الحالية' },
    { val: fmt(h.costBasis),              lbl: 'التكلفة الأساسية' },
    { val: xirrLabel,                     lbl: 'XIRR — العائد الداخلي الحقيقي' },
    { val: growthLabel,                   lbl: 'نمو رأس المال (مُستخدَم في السيناريوهات)', raw: true },
    { val: pct(h.safeDivYield),           lbl: 'عائد الأرباح السنوي' },
    { val: fmt(h.avgAnnualDiv),           lbl: 'متوسط الأرباح السنوية' },
    { val: fmt(h.totalDivAll),            lbl: 'إجمالي الأرباح المتراكمة' },
    { val: fmt(h.avgMonthlyDeposit),      lbl: 'متوسط الإضافة الشهرية' },
    { val: String(h.holdingsCount),       lbl: 'عدد الأسهم' },
  ];

  const el = document.getElementById('hist-summary');
  if (el) el.innerHTML = items.map(i => `
    <div class="hist-item">
      <div class="h-val">${i.raw ? i.val : esc(i.val)}</div>
      <div class="h-lbl">${esc(i.lbl)}</div>
    </div>`).join('');

  // ملء القيم الافتراضية في حقول المدخلات
  const cvInp = document.getElementById('inp-current-value');
  if (cvInp && !+cvInp.value) cvInp.value = Math.round(h.currentValue);

  const maInp = document.getElementById('inp-monthly-add');
  if (maInp && !+maInp.value && h.avgMonthlyDeposit > 0)
    maInp.value = Math.round(h.avgMonthlyDeposit);

  const dyBadge = document.getElementById('div-yield-auto');
  if (dyBadge) dyBadge.textContent = `من بياناتك: ${pct(h.safeDivYield)}`;

  // عرض مؤشر ثقة البيانات
  renderDataConfidenceBanner(h);

  // ربط هدف FIRE
  renderFireBanner(h);
}

// ── ربط هدف التقاعد (FIRE) بالصفحة ──────────────────────────────
function renderFireBanner(h) {
  const el = document.getElementById('fire-link-banner');
  if (!el) return;

  const fg = h.fireGoal || {};
  if (!fg.monthly || !fg.target_year) {
    el.innerHTML = `<div style="font-size:.78rem;color:var(--text-muted);padding:6px 0">
      💡 لم يُحدَّد هدف التقاعد — اذهب للوحة التحكم وأدخل مصاريفك الشهرية بعد التقاعد + سنة التقاعد لربطها هنا.
    </div>`;
    return;
  }

  const fireNumber   = (fg.monthly * 12) / (fg.swr / 100);
  const yearsLeft    = fg.target_year - new Date().getFullYear();
  // استخدم صافي الثروة الكامل (أسهم + عقارات + snapshot) لا الأسهم وحدها
  const currentNW    = h.totalNW || h.currentValue;
  const progress     = fireNumber > 0 ? Math.min(100, currentNW / fireNumber * 100) : 0;
  const remaining    = Math.max(0, fireNumber - currentNW);
  const barColor     = progress >= 100 ? '#3fb950' : progress >= 50 ? '#f0b429' : '#3b82f6';

  el.innerHTML = `
    <div style="
      border:1px solid rgba(59,130,246,.3);background:rgba(59,130,246,.05);
      border-radius:10px;padding:12px 16px;margin-bottom:4px;
    ">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-weight:700;font-size:.88rem">🎯 هدف التقاعد ${fg.target_year} — ربط تلقائي من إعداداتك</span>
        <span style="font-size:.75rem;color:var(--text-muted)">${yearsLeft} سنة متبقية</span>
        <button class="btn btn-secondary btn-sm" style="font-size:.72rem;margin-right:auto"
          onclick="applyFireGoal()">تطبيق على الإسقاط ↻</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:.8rem;margin-bottom:10px">
        <div><span style="color:var(--text-muted)">الدخل الشهري المستهدف</span><br><strong>${fmt(fg.monthly)}</strong></div>
        <div><span style="color:var(--text-muted)">نسبة السحب الآمن</span><br><strong>${fg.swr}%</strong></div>
        <div><span style="color:var(--text-muted)">المحفظة المطلوبة</span><br><strong>${fmt(fireNumber)}</strong></div>
        <div><span style="color:var(--text-muted)">المتبقي</span><br><strong style="color:${barColor}">${fmt(remaining)}</strong></div>
      </div>
      <div style="margin-bottom:4px">
        <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--text-muted);margin-bottom:4px">
          <span>نسبة الإنجاز نحو FIRE</span><span style="color:${barColor};font-weight:700">${progress.toFixed(1)}%</span>
        </div>
        <div style="background:var(--border);border-radius:99px;height:7px;overflow:hidden">
          <div style="height:100%;border-radius:99px;background:${barColor};width:${Math.min(progress,100)}%;transition:width .4s"></div>
        </div>
      </div>
    </div>`;
}

// ── مؤشر ثقة البيانات ─────────────────────────────────────────────────
function renderDataConfidenceBanner(h) {
  const el = document.getElementById('data-confidence-banner');
  if (!el) return;

  const calMonths = Math.round((h.yearsActive || 0) * 12);     // عمر تقويمي
  const cwMonths  = Math.round(h.capitalWeightedMonths || 0);  // عمر فعلي مرجَّح
  const divYears  = Object.keys(h.divByYear || {}).length;

  // نستخدم العمر الفعلي (المرجَّح بالتدفقات) في حساب الثقة — أدق بكثير من التقويمي
  const months = cwMonths;

  // ── حساب درجة الثقة (0–100) ─────────────────────────────────────────
  // العامل 1: عمر رأس المال الفعلي — لا التقويمي (وزن 45%)
  const agePct = months < 3  ? 0.05 : months < 6  ? 0.20 :
                 months < 9  ? 0.32 : months < 12 ? 0.45 :
                 months < 18 ? 0.62 : months < 24 ? 0.76 :
                 months < 36 ? 0.88 : 1.00;

  // العامل 2: دورات الأرباح الفعلية (وزن 35%)
  // السبب: نمو رأس المال و divYield مبنيان على هذه الدورات
  const divPct = divYears === 0 ? 0.05 :
                 divYears === 1 ? 0.45 :
                 divYears === 2 ? 0.72 :
                 divYears >= 3  ? 0.95 : 0.05;

  // العامل 3: عدد الأسهم / التنويع (وزن 20%)
  const holdPct = h.holdingsCount < 3  ? 0.40 :
                  h.holdingsCount < 6  ? 0.65 :
                  h.holdingsCount < 10 ? 0.82 : 0.95;

  const score = Math.round(agePct * 45 + divPct * 35 + holdPct * 20);

  // ── مستوى الثقة ──────────────────────────────────────────────────────
  let tier, badgeColor, borderColor, bgColor;
  if      (score < 30) { tier = 'very_low';   badgeColor = '#f85149'; borderColor = 'rgba(248,81,73,.35)';  bgColor = 'rgba(248,81,73,.06)'; }
  else if (score < 45) { tier = 'low';        badgeColor = '#f85149'; borderColor = 'rgba(248,81,73,.25)';  bgColor = 'rgba(248,81,73,.04)'; }
  else if (score < 60) { tier = 'developing'; badgeColor = '#f0b429'; borderColor = 'rgba(240,180,41,.30)'; bgColor = 'rgba(240,180,41,.05)'; }
  else if (score < 75) { tier = 'fair';       badgeColor = '#f0b429'; borderColor = 'rgba(240,180,41,.25)'; bgColor = 'rgba(240,180,41,.04)'; }
  else if (score < 87) { tier = 'good';       badgeColor = '#3fb950'; borderColor = 'rgba(63,185,80,.30)';  bgColor = 'rgba(63,185,80,.05)';  }
  else                 { tier = 'strong';     badgeColor = '#3b82f6'; borderColor = 'rgba(59,130,246,.30)'; bgColor = 'rgba(59,130,246,.05)'; }

  // ── رسالة المستشار المالي ─────────────────────────────────────────────
  const fmtM       = m => m < 12 ? `${m} شهر` : `${(m/12).toFixed(1)} سنة`;
  const monthsText = fmtM(months);   // الفعلي
  const calText    = fmtM(calMonths); // التقويمي
  // هل التدفقات أثّرت بشكل واضح؟
  const cwDiff     = calMonths - cwMonths;
  const cwNote     = cwDiff >= 2
    ? ` (العمر التقويمي ${calText} — الفرق بسبب ضخ رأس المال تدريجياً)`
    : '';

  const msgs = {
    very_low: {
      title: '⚠️ المحفظة في طور البناء — البيانات غير كافية للإسقاط',
      body:  `محفظتك عمرها ${monthsText} فقط وهذا زمن قصير جداً. أي إسقاط الآن يشبه التنبؤ بحصاد موسم كامل بعد أسبوع من الزراعة. استخدم الأرقام للاستئناس فقط.`,
      advice: `انتظر حتى تكتمل ${12 - months} شهراً أخرى على الأقل قبل الاعتماد على هذه الأرقام.`,
    },
    low: {
      title: '🟡 بيانات أولية — الإسقاطات تقديرية',
      body:  `${monthsText} من البيانات مع ${divYears} دورة أرباح. النمو المحسوب قد يكون مضخّماً أو مقلّصاً لأن المحفظة لم تمر بعد بدورة سوقية كاملة.`,
      advice: 'السيناريو المتحفظ هو الأكثر صدقاً في مرحلتك الحالية.',
    },
    developing: {
      title: '🟡 بيانات نامية — استخدم بحذر',
      body:  `${monthsText} من التاريخ و${divYears} سنة أرباح. الأرقام تعكس واقعك لكنها لم تشهد بعد اختبار تصحيح سوقي حقيقي. معدل النمو الحالي قد لا يكون مستداماً.`,
      advice: 'قارن مع بيانات القطاع للتحقق من منطقية الأرقام.',
    },
    fair: {
      title: '📊 بيانات معقولة — مفيدة للتخطيط',
      body:  `${monthsText} و${divYears} سنوات أرباح. البيانات تكفي للتخطيط الأولي لكن لا تزال بحاجة إلى سنة إضافية لتعكس التقلبات الاعتيادية في السوق.`,
      advice: 'الأرقام مفيدة للاتجاه العام — لا تبالغ في الدقة.',
    },
    good: {
      title: '✅ بيانات جيدة — يمكن الاعتماد عليها',
      body:  `${monthsText} من التاريخ الفعلي و${divYears} دورات أرباح. المحفظة شهدت تقلبات السوق وأثبتت نمطاً. الإسقاطات ذات مصداقية عالية.`,
      advice: 'راجع الأرقام بعد كل تغيير جوهري في تركيب المحفظة.',
    },
    strong: {
      title: '🔵 بيانات موثوقة — إسقاطات ذات ثقة عالية',
      body:  `${monthsText} من التاريخ الفعلي مع ${divYears} دورات أرباح كاملة. المحفظة لديها سجل كافٍ لاتخاذ قرارات مبنية على الأرقام.`,
      advice: 'حافظ على تسجيل البيانات بانتظام للحفاظ على هذا المستوى من الموثوقية.',
    },
  };

  const m = msgs[tier];

  el.innerHTML = `
    <div style="
      border:1px solid ${borderColor};
      background:${bgColor};
      border-radius:10px;
      padding:14px 16px;
      margin-bottom:4px;
    ">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <span style="font-weight:700;font-size:.95rem">${m.title}</span>
        <span style="
          background:${badgeColor};color:#fff;border-radius:20px;
          padding:2px 10px;font-size:.75rem;font-weight:700;white-space:nowrap
        ">ثقة البيانات ${score}%</span>
        <span style="
          background:var(--bg-2);border:1px solid var(--border);border-radius:20px;
          padding:2px 10px;font-size:.72rem;color:var(--text-muted);white-space:nowrap
        "
        title="عمر رأس المال الفعلي (مرجَّح بالتدفقات) = ${cwMonths} شهر&#10;العمر التقويمي = ${calMonths} شهر&#10;الفرق = ${cwDiff} شهر بسبب الضخ التدريجي">
          رأس المال الفعلي: ${monthsText}${cwDiff>=2?' | تقويمي: '+calText:''}
          · ${divYears} دورة · ${h.holdingsCount} سهم
        </span>
      </div>
      <p style="font-size:.83rem;color:var(--text-2);margin:0 0 6px;line-height:1.6">${m.body}</p>
      <p style="font-size:.80rem;color:${badgeColor};margin:0;font-weight:600">💡 ${m.advice}</p>

      <!-- شريط البيانات -->
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        ${_confFactor('عمر المحفظة', monthsText, Math.round(agePct * 100), score)}
        ${_confFactor('دورات الأرباح', divYears + ' سنة', Math.round(divPct * 100), score)}
        ${_confFactor('التنويع', h.holdingsCount + ' سهم', Math.round(holdPct * 100), score)}
      </div>
    </div>`;
}

function _confFactor(label, value, pct, totalScore) {
  const color = pct < 40 ? '#f85149' : pct < 65 ? '#f0b429' : '#3fb950';
  return `<div style="
    flex:1;min-width:100px;
    background:var(--bg-2);border:1px solid var(--border);
    border-radius:7px;padding:7px 10px;
  ">
    <div style="font-size:.70rem;color:var(--text-muted);margin-bottom:3px">${label}</div>
    <div style="font-size:.82rem;font-weight:600;color:var(--text-1)">${value}</div>
    <div style="height:4px;background:var(--border);border-radius:2px;margin-top:5px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width .4s"></div>
    </div>
  </div>`;
}

// ── Render scenario cards ──────────────────────────────────────────────
function renderScenarioCards() {
  const grid = document.getElementById('scenario-grid');
  if (!grid) return;
  grid.innerHTML = SCENARIO_META.map((m, i) => {
    const sc = _scenarios[i];
    const isActive = _activeScenarios.includes(m.key);
    return `
    <div class="scenario-card ${m.cls}${isActive ? ' active' : ''}" id="sc-card-${m.key}" onclick="toggleScenario('${m.key}')">
      <div class="sc-badge">${m.emoji} ${m.name}</div>
      <div class="sc-name">${m.name}</div>
      <div class="sc-desc">${m.desc}</div>
      <div class="sc-rates">
        <div class="sc-rate-row"><span class="label">نمو رأس المال/سنة</span><span class="val" style="color:${m.color}">${pct(sc.capRate)}</span></div>
        <div class="sc-rate-row"><span class="label">عائد الأرباح/سنة</span><span class="val" style="color:${m.color}">${pct(sc.divRate)}</span></div>
        <div class="sc-rate-row"><span class="label">إجمالي العائد/سنة</span><span class="val" style="color:${m.color}">${pct(sc.capRate + sc.divRate)}</span></div>
      </div>
    </div>`;
  }).join('');
}

// ── Toggle scenario ────────────────────────────────────────────────────
function toggleScenario(key) {
  const idx = _activeScenarios.indexOf(key);
  if (idx === -1) {
    _activeScenarios.push(key);
  } else if (_activeScenarios.length > 1) {
    _activeScenarios.splice(idx, 1);
  }
  SCENARIO_META.forEach(m => {
    const card = document.getElementById(`sc-card-${m.key}`);
    if (card) card.classList.toggle('active', _activeScenarios.includes(m.key));
  });
  _activeHighlight = key;
  const horizonYears = parseInt(document.getElementById('inp-horizon').value) || 35;
  const goalAmount   = parseFloat(document.getElementById('inp-goal-amount').value) || 0;
  renderChart(horizonYears, goalAmount);
  renderScenarioDetail(horizonYears);
}

// ── Chart mode toggle ──────────────────────────────────────────────────
function setChartMode(mode) {
  _chartMode = mode;
  document.querySelectorAll('.chart-mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('cmbtn-' + mode);
  if (btn) btn.classList.add('active');

  const horizonYears = parseInt(document.getElementById('inp-horizon').value) || 35;
  const goalAmount   = parseFloat(document.getElementById('inp-goal-amount').value) || 0;

  if (mode === 'cards') {
    document.getElementById('chart-area').style.display  = 'none';
    document.getElementById('cards-area').style.display  = 'block';
    document.getElementById('chart-legend').style.display = 'none';
    renderCardsView(horizonYears);
  } else {
    document.getElementById('chart-area').style.display  = 'block';
    document.getElementById('cards-area').style.display  = 'none';
    document.getElementById('chart-legend').style.display = 'flex';
    renderChart(horizonYears, goalAmount);
  }
}

// ── Cards view ─────────────────────────────────────────────────────────
function renderCardsView(horizonYears) {
  const el = document.getElementById('cards-area');
  if (!el) return;
  const milestones = [1, 3, 5, 10, 15, 20, 25, 30, 35].filter(y => y <= horizonYears);

  el.innerHTML = `<div class="sc-cards-grid">${
    _projections.filter(p => _activeScenarios.includes(p.key)).map(p => {
      const meta = SCENARIO_META.find(m => m.key === p.key);
      const rows = milestones.map(y => {
        const snap = p.data[y];
        return snap ? `<div class="cv-row">
          <span class="cv-year">${y} سنة (${new Date().getFullYear() + y})</span>
          <span class="cv-val" style="color:${meta.color}">${fmtShort(snap.value)}</span>
        </div>` : '';
      }).join('');
      return `<div class="sc-value-card" style="border-color:${meta.color}40">
        <div class="cv-header" style="color:${meta.color}">${meta.emoji} ${meta.name}
          <span style="font-weight:400;color:var(--text-2);font-size:0.72rem;margin-right:6px">${pct(p.scenario.capRate + p.scenario.divRate)} / سنة</span>
        </div>
        ${rows}
      </div>`;
    }).join('')
  }</div>`;
}

// ── Render chart ───────────────────────────────────────────────────────
function renderChart(horizonYears, goalAmount = 0) {
  const canvas = document.getElementById('forecast-chart');
  if (!canvas) return;
  if (_forecastChart) { _forecastChart.destroy(); _forecastChart = null; }

  const isBar = _chartMode === 'bar';
  const isLog = _chartMode === 'log';

  // وضع الأشرطة: نقاط المعالم فقط
  const barMilestones = [0, 1, 3, 5, 10, 15, 20, 25, 30, 35].filter(y => y <= horizonYears);

  const startYear = new Date().getFullYear();
  const labels = isBar
    ? barMilestones.map(y => y === 0 ? String(startYear) : String(startYear + y))
    : Array.from({ length: horizonYears + 1 }, (_, i) => String(startYear + i));

  const tooltipShared = {
    rtl: true,
    textDirection: 'rtl',
    backgroundColor: '#1c2128',
    titleColor: '#e6edf3',
    bodyColor: '#c9d1d9',
    borderColor: '#30363d',
    borderWidth: 1,
    padding: 14,
    titleFont: { family: 'Tajawal', size: 14, weight: 'bold' },
    bodyFont:  { family: 'Tajawal', size: 14 },
    callbacks: {
      title: items => {
        const yr = items[0].label;
        const offset = +yr - startYear;
        return offset === 0
          ? `${yr} (الآن)`
          : `${yr} (بعد ${offset} سنة)`;
      },
      label: ctx => `  ${ctx.dataset.label}: ${fmt(ctx.raw)}`,
    },
  };

  const datasets = _projections
    .filter(p => _activeScenarios.includes(p.key))
    .map(p => {
      const meta = SCENARIO_META.find(m => m.key === p.key);
      const isHL = p.key === _activeHighlight;
      const values = isBar
        ? barMilestones.map(y => +p.data[Math.min(y, p.data.length - 1)].value.toFixed(0))
        : p.data.slice(0, horizonYears + 1).map(d => +d.value.toFixed(0));

      if (isBar) {
        return {
          label:           meta.name,
          data:            values,
          backgroundColor: meta.color + (isHL ? 'cc' : '55'),
          borderColor:     meta.color,
          borderWidth:     isHL ? 2 : 1,
          borderRadius:    4,
        };
      }
      return {
        label:            meta.name,
        data:             values,
        borderColor:      meta.color,
        backgroundColor:  isHL ? meta.color + '18' : 'transparent',
        borderWidth:      isHL ? 3 : 1.5,
        pointRadius:      0,
        pointHoverRadius: 5,
        tension:          0.35,
        fill:             isHL,
      };
    });

  // خط الهدف (للخط فقط)
  if (!isBar && goalAmount > 0 && _goalType === 'portfolio_value') {
    datasets.push({
      label:           `🎯 الهدف: ${fmtShort(goalAmount)}`,
      data:            Array(horizonYears + 1).fill(goalAmount),
      borderColor:     '#ff6b6b',
      backgroundColor: 'transparent',
      borderWidth:     2,
      borderDash:      [8, 5],
      pointRadius:     0,
      fill:            false,
      tension:         0,
    });
  }

  // ── plugin مخصص لرسم خط سنة التقاعد المستهدفة ────────────────
  const fireYear       = _hist?.fireGoal?.target_year;
  const fireYearOffset = fireYear > 0 ? fireYear - startYear : null;
  const retirementLinePlugin = (!isBar && fireYearOffset !== null && fireYearOffset > 0 && fireYearOffset <= horizonYears)
    ? [{
        id: 'retirementLine',
        afterDraw(chart) {
          const { ctx, chartArea } = chart;
          if (!chartArea) return;
          // تقدير موضع x بالنسبة المئوية (الأكثر ثباتاً مع Chart.js 4)
          const xRatio  = fireYearOffset / horizonYears;
          const xPixel  = chartArea.left + xRatio * (chartArea.right - chartArea.left);
          ctx.save();
          ctx.strokeStyle = 'rgba(240,180,41,0.75)';
          ctx.lineWidth   = 2;
          ctx.setLineDash([8, 4]);
          ctx.beginPath();
          ctx.moveTo(xPixel, chartArea.top);
          ctx.lineTo(xPixel, chartArea.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          // تسمية
          ctx.font      = 'bold 11px Tajawal, sans-serif';
          ctx.fillStyle = '#f0b429';
          ctx.textAlign = 'left';
          const lbl = `${fireYear} 🎯`;
          ctx.fillStyle = 'rgba(240,180,41,0.15)';
          const tw = ctx.measureText(lbl).width + 10;
          ctx.fillRect(xPixel + 3, chartArea.top, tw, 18);
          ctx.fillStyle = '#f0b429';
          ctx.fillText(lbl, xPixel + 7, chartArea.top + 13);
          ctx.restore();
        }
      }]
    : [];

  _forecastChart = new Chart(canvas, {
    type: isBar ? 'bar' : 'line',
    data: { labels, datasets },
    plugins: retirementLinePlugin,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: tooltipShared,
      },
      scales: {
        x: {
          grid:  { color: 'rgba(48,54,61,0.5)' },
          ticks: { color: '#8b949e', maxTicksLimit: isBar ? 20 : 10, font: { family: 'Tajawal', size: 11 } },
        },
        y: {
          type:  isLog ? 'logarithmic' : 'linear',
          grid:  { color: 'rgba(48,54,61,0.5)' },
          ticks: {
            color: '#8b949e',
            font:  { family: 'Tajawal', size: 11 },
            callback: v => fmtShort(v),
          },
        },
      },
    },
  });

  renderChartLegend();
}

function renderChartLegend() {
  const el = document.getElementById('chart-legend');
  if (!el) return;
  el.innerHTML = _projections
    .filter(p => _activeScenarios.includes(p.key))
    .map(p => {
      const meta = SCENARIO_META.find(m => m.key === p.key);
      return `<div class="chart-legend-item">
        <div class="chart-legend-dot" style="background:${meta.color}"></div>
        <span style="color:${meta.color};font-weight:700">${meta.emoji} ${meta.name}</span>
      </div>`;
    }).join('');
}

function updateChartSubtitle(params) {
  const el = document.getElementById('chart-subtitle');
  if (!el) return;
  const parts = [];
  if (params.monthlyAdd > 0)     parts.push(`إضافة ${fmt(params.monthlyAdd)} / شهر`);
  if (params.lumpSum > 0)        parts.push(`+ فوري ${fmt(params.lumpSum)}`);
  if (!params.reinvestDividends) parts.push('بدون إعادة استثمار الأرباح');
  if (params.adjustInflation)    parts.push(`معدّل للتضخم ${pct(params.inflationRate)}`);
  el.textContent = parts.length ? parts.join(' · ') : 'بدون إضافات';
}

// ── Milestone table ────────────────────────────────────────────────────
function renderMilestoneTable(horizonYears) {
  const tbody = document.getElementById('milestone-tbody');
  if (!tbody) return;

  const today      = new Date();
  const fireYear   = _hist?.fireGoal?.target_year || 0;
  const fireOffset = fireYear > 0 ? fireYear - today.getFullYear() : null;
  const showReal   = document.getElementById('inp-inflation')?.checked;
  const years      = Array.from({ length: horizonYears }, (_, i) => i + 1);

  tbody.innerHTML = years.map(y => {
    const calYear    = today.getFullYear() + y;
    const isHL       = (y % 5 === 0);
    // سنة التقاعد المستهدفة: تمييز خاص
    const isFireYear = (fireOffset !== null && y === fireOffset);
    const rowClass   = isFireYear
      ? ' class="milestone-hl" style="background:rgba(240,180,41,0.12);border-right:3px solid #f0b429"'
      : (isHL ? ' class="milestone-hl"' : '');

    const valueCells = SCENARIO_META.map((m, i) => {
      const snap   = _projections[i]?.data[y];
      const v      = snap?.value;
      const active = _activeScenarios.includes(m.key);
      const style  = active
        ? `color:${m.color};font-weight:${isHL || isFireYear ? '700' : '400'}`
        : 'color:var(--text-2);opacity:0.3';
      return `<td class="num" style="${style}">${v != null ? fmtShort(v) : '—'}</td>`;
    }).join('');

    const incomeCells = SCENARIO_META.map((m, i) => {
      const snap   = _projections[i]?.data[y];
      const active = _activeScenarios.includes(m.key);
      const style  = active
        ? `color:${m.color};font-weight:${isHL || isFireYear ? '700' : '400'}`
        : 'color:var(--text-2);opacity:0.3';
      // عرض الدخل الاسمي + الحقيقي (إذا مفعّل التضخم)
      let incomeHtml = '—';
      if (snap) {
        const nominal = snap.monthlyIncome;
        const real    = snap.monthlyIncomeReal;
        const differ  = showReal && Math.abs(nominal - real) > 10;
        incomeHtml = fmtShort(nominal);
        if (differ) incomeHtml += `<br><span style="font-size:.68rem;color:var(--text-muted)" title="القيمة الحقيقية بقوة شراء اليوم">${fmtShort(real)} ح</span>`;
      }
      return `<td class="num" style="${style}">${incomeHtml}</td>`;
    }).join('');

    const yearLabel = isFireYear
      ? `<strong>${y}</strong><span style="font-size:.65rem;background:#f0b429;color:#000;padding:1px 5px;border-radius:3px;margin-right:4px">🎯${fireYear}</span>`
      : `<strong>${y}</strong>`;

    return `<tr${rowClass}>
      <td>${yearLabel}</td>
      <td class="text-muted small">${calYear}</td>
      ${valueCells}
      ${incomeCells}
    </tr>`;
  }).join('') || '<tr><td colspan="10">—</td></tr>';
}

// ── Goal panel ─────────────────────────────────────────────────────────
function renderGoalPanel(horizonYears, goalAmount) {
  const card = document.getElementById('goal-result-card');
  const body = document.getElementById('goal-result-body');
  if (!card || !body) return;

  if (!goalAmount || goalAmount <= 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  const today    = new Date();
  const goalLabel = _goalType === 'monthly_income'
    ? `دخل شهري ${fmt(goalAmount)}`
    : `قيمة محفظة ${fmt(goalAmount)}`;

  const rows = SCENARIO_META.map(m => {
    const proj = _projections.find(p => p.key === m.key);
    const sc   = _scenarios.find(s  => s.key === m.key);
    if (!proj || !sc) return '';

    const goalYr  = computeGoalYear(proj.data, sc.divRate, _goalType, goalAmount);
    const reached = goalYr !== null && goalYr <= horizonYears;
    const snap    = reached ? proj.data[goalYr] : proj.data[proj.data.length - 1];

    const whenStr  = reached
      ? `${goalYr} سنة — عام ${today.getFullYear() + goalYr}`
      : `لا تصل ضمن ${horizonYears} سنة`;

    return `<div class="goal-row ${reached ? 'goal-reached' : 'goal-missed'}">
      <div class="goal-row-head">
        <span class="goal-row-scenario" style="color:${m.color}">${m.emoji} ${m.name}</span>
        <span class="goal-row-status">${reached ? '✅' : '❌'}</span>
        <span class="goal-row-when ${reached ? 'text-success' : 'text-muted'}">${whenStr}</span>
      </div>
      ${snap ? `<div class="goal-row-detail small text-muted">
        القيمة عند الوصول: <strong>${fmt(snap.value)}</strong>
        &nbsp;·&nbsp; دخل شهري: <strong>${fmt(snap.monthlyIncome)}</strong>
        &nbsp;·&nbsp; القيمة الحقيقية (بعد تضخم): <strong>${fmt(snap.realValue)}</strong>
      </div>` : ''}
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="goal-header-label">
      الهدف المحدد: <strong class="text-accent">${goalLabel}</strong>
    </div>
    <div class="goal-rows">${rows}</div>`;
}

// ── Scenario detail ────────────────────────────────────────────────────
function renderScenarioDetail(horizonYears) {
  const title = document.getElementById('scenario-detail-title');
  const body  = document.getElementById('scenario-detail-body');
  if (!body) return;

  const key  = _activeHighlight || 'base';
  const meta = SCENARIO_META.find(m => m.key === key);
  const proj = _projections.find(p => p.key === key);
  const sc   = _scenarios.find(s => s.key === key);
  if (!meta || !proj || !sc) return;

  if (title) title.innerHTML = `تفاصيل: <span style="color:${meta.color}">${meta.emoji} ${meta.name}</span>`;

  const end   = proj.data[horizonYears] || proj.data[proj.data.length - 1];
  const y5    = proj.data[Math.min(5,  horizonYears)];
  const y10   = proj.data[Math.min(10, horizonYears)];
  const y20   = proj.data[Math.min(20, horizonYears)];
  const start = proj.data[0]?.value || 1;

  // ── تفكيك القيمة النهائية ────────────────────────────────────────
  const endYourCap    = end?.yourCapital  || 0;
  const endDivCum     = end?.cumDiv       || 0;
  const endPriceGrow  = end?.priceGrowth  || 0;
  const endVal        = end?.value        || 0;
  const multiplier    = endYourCap > 0 ? endVal / endYourCap : 0;

  // سنة FIRE إذا كانت ضمن الأفق
  const fireYear   = _hist?.fireGoal?.target_year || 0;
  const fireOffset = fireYear > 0 ? fireYear - new Date().getFullYear() : null;
  const fireSnap   = (fireOffset !== null && fireOffset > 0 && fireOffset <= horizonYears)
    ? proj.data[Math.min(fireOffset, proj.data.length - 1)]
    : null;

  const items = [
    { val: pct(sc.capRate),                      lbl: 'نمو رأس المال / سنة' },
    { val: pct(sc.divRate),                      lbl: 'عائد الأرباح / سنة' },
    { val: pct(sc.capRate + sc.divRate),         lbl: 'إجمالي العائد / سنة' },
    { val: y5  ? fmt(y5.value)                  : '—', lbl: 'القيمة بعد 5 سنوات' },
    { val: y5  ? fmt(y5.monthlyIncome)          : '—', lbl: 'دخل شهري (5 سنوات)' },
    { val: y10 ? fmt(y10.value)                 : '—', lbl: 'القيمة بعد 10 سنوات' },
    { val: y10 ? fmt(y10.monthlyIncome)         : '—', lbl: 'دخل شهري (10 سنوات)' },
    { val: y20 ? fmt(y20.value)                 : '—', lbl: 'القيمة بعد 20 سنة' },
    { val: y20 ? fmt(y20.monthlyIncome)         : '—', lbl: 'دخل شهري (20 سنة)' },
    ...(fireSnap ? [
      { val: fmt(fireSnap.value),               lbl: `القيمة عند تقاعدك (${fireYear}) 🎯` },
      { val: fmt(fireSnap.monthlyIncome),        lbl: `الدخل الشهري عند ${fireYear} 🎯` },
      { val: fmt(fireSnap.monthlyIncomeReal),    lbl: `الدخل الحقيقي عند ${fireYear} (بقوة شراء اليوم)` },
    ] : []),
    { val: end  ? fmt(end.value)                : '—', lbl: `القيمة النهائية (${horizonYears} سنة)` },
    { val: end  ? fmt(end.monthlyIncome)        : '—', lbl: 'الدخل الشهري النهائي' },
    { val: end  ? fmt(end.monthlyIncomeReal)    : '—', lbl: 'الدخل الحقيقي النهائي (بقوة شراء اليوم)' },
    { val: end  ? fmt(end.realValue)            : '—', lbl: 'القيمة الحقيقية (بعد التضخم)' },
    { val: end  ? fmt(end.cumDiv)              : '—', lbl: 'إجمالي الأرباح الموزعة التراكمية' },
    // ── التفكيك: فلوسك مقابل نمو السوق
    { val: end  ? fmt(endYourCap)              : '—', lbl: '💰 رأس مالك المُضاف (مدخراتك الفعلية)' },
    { val: end && endDivCum > 0 ? fmt(endDivCum) : '—', lbl: '📈 أرباح معاد استثمارها (مجانية)' },
    { val: end  ? fmt(endPriceGrow)            : '—', lbl: '🚀 نمو السعر الصافي (عمل السوق لك)' },
    { val: end && multiplier > 0 ? `×${multiplier.toFixed(1)}` : '—', lbl: 'مضاعف رأس مالك (كل ريال أصبح ×N)' },
  ];

  body.innerHTML = items.map(i => `
    <div class="hist-item">
      <div class="h-val" style="color:${meta.color}">${i.val}</div>
      <div class="h-lbl">${i.lbl}</div>
    </div>`).join('');
}

// ── Goal type toggle ───────────────────────────────────────────────────
function setGoalType(type) {
  _goalType = type;
  document.getElementById('btn-goal-portfolio')?.classList.toggle('active', type === 'portfolio_value');
  document.getElementById('btn-goal-income')?.classList.toggle('active',    type === 'monthly_income');
  const label = document.getElementById('goal-amount-label');
  if (label) label.textContent = type === 'monthly_income'
    ? 'الدخل الشهري المستهدف (ر.س)'
    : 'قيمة المحفظة المستهدفة (ر.س)';
  const inp = document.getElementById('inp-goal-amount');
  if (inp) inp.placeholder = type === 'monthly_income' ? 'مثال: 20,000' : 'مثال: 1,000,000';
}

// ── Formatting ─────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('ar-SA', { maximumFractionDigits: 0 }) + ' ر.س';
}

function fmtShort(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' مليار';
  if (n >= 1e6) return (n / 1e6).toFixed(2)  + ' م';
  if (n >= 1e3) return (n / 1e3).toFixed(1)  + ' ألف';
  return n.toFixed(0);
}

function pct(r) {
  if (r == null || isNaN(r)) return '—';
  return (r * 100).toFixed(2) + '%';
}

// ── Boot ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
