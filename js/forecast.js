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
    desc:'يطابق أداءك التاريخي الفعلي المحسوب من معاملاتك' },
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
  const [rTx, rDiv, rH, rCf] = await Promise.all([
    supabaseClient.from('transactions').select('type,total,shares,price,date,ticker').eq('is_archived',false),
    supabaseClient.from('dividends').select('amount,year').eq('is_archived',false).order('year'),
    supabaseClient.from('holdings').select('shares,current_price,avg_price,ticker'),
    supabaseClient.from('cashflow_entries').select('type,amount,date').eq('is_archived',false),
  ]);

  const txRows  = rTx.data  || [];
  const divRows = rDiv.data || [];
  const hRows   = rH.data   || [];
  const cfRows  = rCf.data  || [];

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

  // معدل نمو رأس المال السنوي (CAGR)
  // القيمة الحالية ÷ صافي ما أنفق، مرفوعاً للسنة
  const rawCapGrowth = (netCapital > 0 && currentValue > 0)
    ? Math.pow(currentValue / netCapital, 1 / yearsActive) - 1
    : 0.07;
  const annCapGrowth = Math.min(0.40, Math.max(0.02, rawCapGrowth));

  // عائد الأرباح السنوي: نستخدم آخر سنتين فعليتين من الأرباح ÷ القيمة السوقية الحالية
  // هذا أدق من المتوسط التاريخي الكلي لأنه يعكس الوضع الفعلي للمحفظة الحالية
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

  // متوسط الإضافة الشهرية التاريخية
  const totalDeposited    = cfRows.filter(e => e.type==='deposit').reduce((s,e) => s + +e.amount, 0);
  const avgMonthlyDeposit = yearsActive > 0 ? totalDeposited / (yearsActive * 12) : 0;

  const divByYear = {};
  divRows.forEach(d => { divByYear[d.year] = (divByYear[d.year] || 0) + +d.amount; });

  return {
    currentValue, costBasis, netCapital,
    annCapGrowth, safeDivYield, avgAnnualDiv,
    avgMonthlyDeposit, totalDivAll,
    totalBuys, totalSells,
    yearsActive, firstDate,
    currentYear: today.getFullYear(),
    divByYear,
    holdingsCount: hRows.length,
  };
}

// ── Build 4 scenarios ──────────────────────────────────────────────────
function buildScenarios(divOverride) {
  const base = _hist.annCapGrowth;
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
    monthlyIncome: value * monthlyDivRate,
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
      snapshots.push({
        year:         m / 12,
        value,
        cumDiv:       cumulativeDividends,
        cumAdded:     cumulativeAdded,
        realValue:    adjustInflation ? value / inflationFactor : value,
        monthlyIncome: value * monthlyDivRate,
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

  const items = [
    { val: fmt(h.currentValue),           lbl: 'القيمة السوقية الحالية' },
    { val: fmt(h.costBasis),              lbl: 'التكلفة الأساسية' },
    { val: pct(h.annCapGrowth),           lbl: 'نمو رأس المال السنوي' },
    { val: pct(h.safeDivYield),           lbl: 'عائد الأرباح السنوي' },
    { val: fmt(h.avgAnnualDiv),           lbl: 'متوسط الأرباح السنوية' },
    { val: fmt(h.totalDivAll),            lbl: 'إجمالي الأرباح المتراكمة' },
    { val: fmt(h.avgMonthlyDeposit),      lbl: 'متوسط الإضافة الشهرية' },
    { val: String(h.holdingsCount),       lbl: 'عدد الأسهم' },
  ];

  const el = document.getElementById('hist-summary');
  if (el) el.innerHTML = items.map(i => `
    <div class="hist-item">
      <div class="h-val">${i.val}</div>
      <div class="h-lbl">${i.lbl}</div>
    </div>`).join('');

  // ملء القيم الافتراضية في حقول المدخلات
  const cvInp = document.getElementById('inp-current-value');
  if (cvInp && !+cvInp.value) cvInp.value = Math.round(h.currentValue);

  const maInp = document.getElementById('inp-monthly-add');
  if (maInp && !+maInp.value && h.avgMonthlyDeposit > 0)
    maInp.value = Math.round(h.avgMonthlyDeposit);

  const dyBadge = document.getElementById('div-yield-auto');
  if (dyBadge) dyBadge.textContent = `من بياناتك: ${pct(h.safeDivYield)}`;
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

  const labels = isBar
    ? barMilestones.map(y => y === 0 ? 'الآن' : `${y}س`)
    : Array.from({ length: horizonYears + 1 }, (_, i) => i === 0 ? 'الآن' : `${i}س`);

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
      title: items => `السنة ${items[0].label}`,
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

  _forecastChart = new Chart(canvas, {
    type: isBar ? 'bar' : 'line',
    data: { labels, datasets },
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

  const today = new Date();
  // كل سنة من 1 حتى نهاية الأفق
  const years = Array.from({ length: horizonYears }, (_, i) => i + 1);

  tbody.innerHTML = years.map(y => {
    const isHL = (y % 5 === 0); // تمييز كل 5 سنوات

    const valueCells = SCENARIO_META.map((m, i) => {
      const v      = _projections[i]?.data[y]?.value;
      const active = _activeScenarios.includes(m.key);
      const style  = active
        ? `color:${m.color};font-weight:${isHL ? '700' : '400'}`
        : 'color:var(--text-2);opacity:0.3';
      return `<td class="num" style="${style}">${v != null ? fmtShort(v) : '—'}</td>`;
    }).join('');

    const incomeCells = SCENARIO_META.map((m, i) => {
      const snap   = _projections[i]?.data[y];
      const active = _activeScenarios.includes(m.key);
      const style  = active
        ? `color:${m.color};font-weight:${isHL ? '700' : '400'}`
        : 'color:var(--text-2);opacity:0.3';
      return `<td class="num" style="${style}">${snap ? fmtShort(snap.monthlyIncome) : '—'}</td>`;
    }).join('');

    return `<tr${isHL ? ' class="milestone-hl"' : ''}>
      <td><strong>${y}</strong></td>
      <td class="text-muted small">${today.getFullYear() + y}</td>
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

  const items = [
    { val: pct(sc.capRate),                      lbl: 'نمو رأس المال / سنة' },
    { val: pct(sc.divRate),                      lbl: 'عائد الأرباح / سنة' },
    { val: pct(sc.capRate + sc.divRate),         lbl: 'إجمالي العائد / سنة' },
    { val: y5  ? fmt(y5.value)           : '—', lbl: 'القيمة بعد 5 سنوات' },
    { val: y5  ? fmt(y5.monthlyIncome)   : '—', lbl: 'دخل شهري (5 سنوات)' },
    { val: y10 ? fmt(y10.value)          : '—', lbl: 'القيمة بعد 10 سنوات' },
    { val: y10 ? fmt(y10.monthlyIncome)  : '—', lbl: 'دخل شهري (10 سنوات)' },
    { val: y20 ? fmt(y20.value)          : '—', lbl: 'القيمة بعد 20 سنة' },
    { val: y20 ? fmt(y20.monthlyIncome)  : '—', lbl: 'دخل شهري (20 سنة)' },
    { val: end  ? fmt(end.value)         : '—', lbl: `القيمة النهائية (${horizonYears} سنة)` },
    { val: end  ? fmt(end.monthlyIncome) : '—', lbl: 'الدخل الشهري النهائي' },
    { val: end  ? `×${(end.value / Math.max(1, start)).toFixed(1)}` : '—', lbl: 'مضاعف النمو' },
    { val: end  ? fmt(end.cumDiv)        : '—', lbl: 'إجمالي الأرباح الموزعة' },
    { val: end  ? fmt(end.realValue)     : '—', lbl: 'القيمة الحقيقية (بعد التضخم)' },
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
