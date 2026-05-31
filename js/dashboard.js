let holdings    = [];
let stockTargets = {};   // ticker → target_pct  (من stock_targets)
let stockZones   = {};   // ticker → { entry_price, exit_price }
let sectorChart = null;
let _sectorMode = 'donut'; // 'donut' | 'bars' | 'cards'
let weightChart = null;
let _weightMode = 'bars';  // 'bars' | 'gap' | 'cards' | 'table'
let allocChart  = null;    // مخطط التخصيص الكلي للأصول
let editingId   = null;
let investedTab      = 'net';  // 'net' = رأس المال المنشغل | 'wac' = تكلفة الوسيط
let yieldTab         = 'ann';  // 'ann' = مُسنوى | 'yoc' = على التكلفة | 'market' = سوقي
let portfolioCash    = 0;      // نقد المحفظة عند الوسيط
let cashUpdatedAt    = null;   // تاريخ آخر تحديث للنقد

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

// Returns all td attributes for an editable cell
function ed(table, rowId, field, type, raw, extraCls = '', selectKey = '') {
  const numCls = type === 'number' ? ' num' : '';
  return `class="editable${numCls}${extraCls ? ' ' + extraCls : ''}" ` +
    `data-table="${table}" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"` +
    (selectKey ? ` data-select="${selectKey}"` : '');
}

// ── XIRR (العائد الداخلي السنوي) ──────────────────────────────
// يحل عن المعدل r الذي يجعل صافي القيمة الحالية = 0 لتدفقات بتواريخ غير منتظمة
// يعيد النسبة المئوية السنوية، أو null إذا تعذّر الحساب
function computeXIRR(flows) {
  if (!flows || flows.length < 2) return null;
  const cf = flows.slice().sort((a, b) => a.date - b.date);
  const t0 = cf[0].date;
  const years = cf.map(c => (c.date - t0) / (365 * 86400000));
  const amts  = cf.map(c => c.amount);
  // لا بد من وجود تدفق موجب وآخر سالب
  if (!amts.some(a => a > 0) || !amts.some(a => a < 0)) return null;

  const npv  = r => amts.reduce((s, a, i) => s + a / Math.pow(1 + r, years[i]), 0);
  const dNpv = r => amts.reduce((s, a, i) => s - years[i] * a / Math.pow(1 + r, years[i] + 1), 0);

  // Newton-Raphson
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(r), d = dNpv(r);
    if (!isFinite(f) || !isFinite(d) || d === 0) break;
    const r2 = r - f / d;
    if (!isFinite(r2)) break;
    if (Math.abs(r2 - r) < 1e-7) { r = r2; break; }
    r = r2;
    if (r <= -0.9999) r = -0.9999;  // تجنّب الانفجار
  }
  // تحقّق من الحل؛ إن فشل نيوتن جرّب البحث الثنائي
  if (!isFinite(r) || Math.abs(npv(r)) > 1) {
    let lo = -0.9999, hi = 10;
    if (npv(lo) * npv(hi) > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const fm = npv(mid);
      if (Math.abs(fm) < 1e-6) { r = mid; break; }
      if (npv(lo) * fm < 0) hi = mid; else lo = mid;
      r = mid;
    }
  }
  if (!isFinite(r) || r <= -0.9999 || r > 100) return null;
  return r * 100;
}

// إجمالي الصكوك المشترَك بها (من التخزين المحلي لصفحة الصكوك)
function getSukukActiveTotal() {
  try {
    const raw = localStorage.getItem('sukuk_planner_v1');
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return (data.opportunities || [])
      .filter(o => o.status === 'مشترك')
      .reduce((s, o) => s + (+o.amount || 0), 0);
  } catch (_) { return 0; }
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-dashboard');
  await loadAllData();
  renderStats();
  renderCharts();
  renderTable();
  renderPriceZonesCard();
  renderBreakEvenCard();
  renderAllocationChart();
  renderRetirementCard();
}

// ── Data ──────────────────────────────────────────────────────
async function loadAllData() {
  const yr = new Date().getFullYear();

  const [rH, rTx, rDiv, rCf, rNw, rRe, rSt, rSecT, rCash] = await Promise.all([
    supabaseClient.from('holdings').select('*').order('ticker'),
    supabaseClient.from('transactions').select('type, total, shares, price, commission, vat, ticker, date').eq('is_archived', false),
    supabaseClient.from('dividends').select('amount, year, date').eq('is_archived', false),
    supabaseClient.from('cashflow_entries').select('type, amount, date').eq('is_archived', false),
    supabaseClient.from('net_worth_snapshots').select('total_value, date').order('date', { ascending: false }).limit(1),
    supabaseClient.from('real_estate').select('current_value, status').eq('is_active', true),
    supabaseClient.from('stock_targets').select('ticker, target_pct, entry_price, exit_price'),
    supabaseClient.from('sector_targets').select('sector, target_pct'),
    supabaseClient.from('portfolio_cash').select('amount, updated_at').limit(1).maybeSingle()
  ]);

  holdings = rH.data || [];

  // نقد المحفظة — Supabase أولاً، localStorage كـ fallback
  if (rCash?.amount != null) {
    portfolioCash = +rCash.amount;
    cashUpdatedAt = rCash.updated_at || null;
    _saveCashToLS(portfolioCash, cashUpdatedAt); // حدّث الـ cache
  } else {
    _loadCashFromLS(); // استخدم المحفوظ محلياً
  }

  // بناء خريطة الأهداف — stock_targets هو المصدر الأساسي
  stockTargets = {};
  stockZones   = {};
  (rSt.data || []).forEach(r => {
    stockTargets[r.ticker] = +r.target_pct;
    stockZones[r.ticker]   = { entry_price: r.entry_price ?? null, exit_price: r.exit_price ?? null };
  });
  holdings.forEach(h => {
    if (stockTargets[h.ticker] !== undefined) h.target_weight = stockTargets[h.ticker];
  });

  const txRows   = rTx.data  || [];
  const divRows  = rDiv.data || [];
  const cfRows   = rCf.data  || [];
  const nwRows   = rNw.data  || [];
  const reRows   = rRe.data  || [];

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
  // متوسط تكلفة الشراء المرجّح لكل رمز — يشمل عمولة وضريبة الشراء (t.total)
  // وأسهم المنح تُضاف بتكلفة صفر فتخفض المتوسط (WAC حقيقي)
  const buyMap = {};
  txRows.filter(t => t.type === 'buy').forEach(t => {
    if (!buyMap[t.ticker]) buyMap[t.ticker] = { cost: 0, shares: 0 };
    buyMap[t.ticker].cost   += +t.total;     // يشمل العمولة + الضريبة
    buyMap[t.ticker].shares += +t.shares;
  });
  txRows.filter(t => t.type === 'grant').forEach(t => {
    if (!buyMap[t.ticker]) buyMap[t.ticker] = { cost: 0, shares: 0 };
    buyMap[t.ticker].shares += +t.shares;    // أسهم مجانية: تكلفة صفر
  });
  let realizedPnL = 0;
  txRows.filter(t => t.type === 'sell').forEach(t => {
    const m   = buyMap[t.ticker];
    const avg = m && m.shares > 0 ? m.cost / m.shares : 0;
    // t.total للبيع = القيمة − العمولة − الضريبة (صافي ما دخل جيبك)
    realizedPnL += (+t.total) - (+t.shares * avg);
  });

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

  // ── العوائد التوزيعية ──────────────────────────────────
  const totalDivAll = divRows.reduce((s, d) => s + +d.amount, 0);
  const yearDiv     = divRows.filter(d => d.year === yr).reduce((s, d) => s + +d.amount, 0);
  // أرباح آخر 12 شهراً (TTM) — للعائد الحقيقي على التكلفة والدخل المتوقع
  const _today = new Date();
  const _yearAgo = new Date(_today.getFullYear() - 1, _today.getMonth(), _today.getDate());
  const ttmDiv = divRows.reduce((s, d) => {
    if (!d.date) return s;
    const dt = new Date(d.date);
    return dt >= _yearAgo && dt <= _today ? s + +d.amount : s;
  }, 0);

  // ── حساب رأس المال أول السنة الحالية (للعائد المُسنوى) ───
  const today_d      = new Date();
  const daysElapsed  = Math.floor((today_d - new Date(yr, 0, 1)) / 86400000) + 1;
  const daysInYear   = ((yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0) ? 366 : 365;
  // إجمالي المشتريات والمبيعات قبل السنة الحالية = رأس المال أول يناير
  const prevBuys     = txRows.filter(t => t.type === 'buy'  && new Date(t.date).getFullYear() < yr).reduce((s,t)=>s + +t.total,0);
  const prevSells    = txRows.filter(t => t.type === 'sell' && new Date(t.date).getFullYear() < yr).reduce((s,t)=>s + +t.total,0);
  const beginYearCap = Math.max(0, prevBuys - prevSells);
  // الأرباح المُسنواة للسنة الحالية
  const annualizedYearDiv = daysElapsed > 0 ? yearDiv * (daysInYear / daysElapsed) : yearDiv;
  // المقام للعائد المُسنوى: رأس المال أول يناير (إن وُجد)، وإلا التكلفة الحالية
  const denomAnn = beginYearCap > 0 ? beginYearCap : costBasis;

  // الطرق الثلاث
  const divYieldAnn    = denomAnn    > 0 ? annualizedYearDiv / denomAnn    * 100 : 0; // مُسنوى
  const divYieldYOC    = costBasis   > 0 ? ttmDiv            / costBasis   * 100 : 0; // على التكلفة (آخر 12 شهر)
  const divYieldMarket = totalValue  > 0 ? annualizedYearDiv / totalValue  * 100 : 0; // سوقي

  // إبقاء القديم متوافقاً
  const divYieldYear = divYieldMarket;
  const divYieldAll  = divYieldYOC;

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
    if (d.date) cashflows.push({ date: new Date(d.date), amount: +d.amount });
  });
  if (totalValue > 0) cashflows.push({ date: new Date(), amount: totalValue });
  const xirr = computeXIRR(cashflows);

  window._ds = {
    yr,
    totalInvested:   totalBuys - totalSells,
    totalCommission, totalVAT,
    realizedPnL,
    totalDivAll,     yearDiv,
    divYieldYear,    divYieldAll,
    divYieldAnn, divYieldYOC, divYieldMarket,
    ttmDiv, xirr,
    annualizedYearDiv, daysElapsed, daysInYear, beginYearCap, denomAnn,
    grantMap, totalGrantShares, totalGrantTickers,
    latestNW:        nwRows[0] ? +nwRows[0].total_value : null,
    latestNWDate:    nwRows[0] ? nwRows[0].date : null,
    reTotal:         reRows.filter(p => p.status !== 'sold').reduce((s, p) => s + +p.current_value, 0),
    cashDeposited:   cfRows.filter(e => e.type === 'deposit'    && new Date(e.date).getFullYear() === yr).reduce((s,e) => s + +e.amount, 0),
    cashWithdrawn:   cfRows.filter(e => e.type === 'withdrawal' && new Date(e.date).getFullYear() === yr).reduce((s,e) => s + +e.amount, 0),
    stockCount:      holdings.length,
    sectorCount,     topSector, bottomSector,
  };
}

async function reloadHoldings() {
  const [{ data: hData }, { data: stData }] = await Promise.all([
    supabaseClient.from('holdings').select('*').order('ticker'),
    supabaseClient.from('stock_targets').select('ticker, target_pct, entry_price, exit_price')
  ]);
  stockTargets = {};
  stockZones   = {};
  (stData || []).forEach(r => {
    stockTargets[r.ticker] = +r.target_pct;
    stockZones[r.ticker]   = { entry_price: r.entry_price ?? null, exit_price: r.exit_price ?? null };
  });
  holdings = (hData || []).map(h => {
    if (stockTargets[h.ticker] !== undefined) h.target_weight = stockTargets[h.ticker];
    return h;
  });
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
  ['ann','yoc','market'].forEach(t => {
    document.getElementById('tab-yield-' + t)?.classList.toggle('mini-tab-active', t === tab);
  });

  const yr = s.yr || new Date().getFullYear();

  if (tab === 'ann') {
    setText('yield-tab-label', 'العائد المُسنوى — السنة الجارية');
    setText('stat-div-yield',  (s.divYieldAnn || 0).toFixed(2) + '%');
    const note = s.daysElapsed
      ? `أرباح ${formatSAR(s.yearDiv||0)} × (${s.daysInYear}÷${s.daysElapsed}) ÷ رأس المال أول يناير`
      : 'أرباح السنة الجارية مُسنواة';
    setText('stat-div-yield-sub', note);
  } else if (tab === 'yoc') {
    setText('yield-tab-label', 'العائد على التكلفة (YOC)');
    setText('stat-div-yield',  (s.divYieldYOC || 0).toFixed(2) + '%');
    setText('stat-div-yield-sub', `أرباح آخر 12 شهراً (${formatSAR(s.ttmDiv||0)}) ÷ تكلفة الشراء`);
  } else {
    setText('yield-tab-label', 'العائد السوقي');
    setText('stat-div-yield',  (s.divYieldMarket || 0).toFixed(2) + '%');
    setText('stat-div-yield-sub', `أرباح ${yr} مُسنواة ÷ القيمة السوقية الحالية`);
  }

  // لون حسب القيمة
  const val = tab === 'ann' ? (s.divYieldAnn||0)
            : tab === 'yoc' ? (s.divYieldYOC||0)
            : (s.divYieldMarket||0);
  const el = document.getElementById('stat-div-yield');
  if (el) el.className = 'value num ' + (val >= 5 ? 'text-success' : val >= 3 ? 'text-accent' : 'text-muted');
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

  setText('stat-net-worth', s.latestNW != null ? formatSAR(s.latestNW) : '—');
  setText('stat-nw-date',   s.latestNWDate ? formatDate(s.latestNWDate) : 'لا توجد لقطة');

  setText('stat-total-div',   formatSAR(s.totalDivAll || 0));
  setText('stat-year-div',    formatSAR(s.yearDiv     || 0));
  setText('stat-year-label',  'أرباح ' + (s.yr || new Date().getFullYear()));
  switchYieldTab(yieldTab);
  setText('stat-realestate',  formatSAR(s.reTotal || 0));
  const cashNet = (s.cashDeposited || 0) - (s.cashWithdrawn || 0);
  const cashEl = g('stat-cash-actual');
  if (cashEl) { cashEl.textContent = formatSAR(cashNet, true); cashEl.className = 'value num ' + (cashNet >= 0 ? 'text-success' : 'text-danger'); }
  setText('stat-cash-sub', `إيداع ${formatSAR(s.cashDeposited||0)} / سحب ${formatSAR(s.cashWithdrawn||0)}`);
  const fill = g('stat-cash-fill');
  if (fill) { fill.style.width = s.cashDeposited > 0 ? '100%' : '0%'; fill.style.background = 'var(--accent)'; }

  // ── صف 5: الأداء السنوي والدخل ────────────────────────────
  const xirrEl = g('stat-xirr');
  if (xirrEl) {
    if (s.xirr == null) {
      xirrEl.textContent = '—';
      xirrEl.className = 'value num text-muted';
      setText('stat-xirr-sub', 'يحتاج معاملات شراء وبيع/توزيعات');
    } else {
      xirrEl.textContent = (s.xirr >= 0 ? '+' : '') + s.xirr.toFixed(2) + '%';
      xirrEl.className = 'value num ' + (s.xirr >= 0 ? 'text-success' : 'text-danger');
      setText('stat-xirr-sub', 'سنوياً — يشمل التوقيت والتوزيعات');
    }
  }

  // الدخل التوزيعي المتوقع = أرباح آخر 12 شهراً
  const fwdIncome = s.ttmDiv || 0;
  setText('stat-fwd-income', formatSAR(fwdIncome));
  const fwdYield = totalValue > 0 ? fwdIncome / totalValue * 100 : 0;
  setText('stat-fwd-income-sub', `≈ ${formatSAR(fwdIncome/12)}/شهر · عائد ${fwdYield.toFixed(2)}%`);

  // إجمالي الأصول الاستثمارية
  const sukukTotal  = getSukukActiveTotal();
  const totalAssets = totalValue + portfolioCash + (s.reTotal || 0) + sukukTotal;
  setText('stat-total-assets', formatSAR(totalAssets));

  // تغطية الدخل السلبي للمصاريف
  const goal = getRetirementGoal();
  const coverEl = g('stat-passive-cover');
  if (coverEl) {
    if (goal.monthly > 0) {
      const monthlyIncome = fwdIncome / 12;
      const coverPct = goal.monthly > 0 ? monthlyIncome / goal.monthly * 100 : 0;
      coverEl.textContent = coverPct.toFixed(1) + '%';
      coverEl.className = 'value num ' + (coverPct >= 100 ? 'text-success' : coverPct >= 25 ? 'text-accent' : 'text-muted');
      setText('stat-passive-cover-sub', `دخل ${formatSAR(monthlyIncome)}/شهر مقابل مصاريف ${formatSAR(goal.monthly)}`);
    } else {
      coverEl.textContent = '—';
      coverEl.className = 'value num text-muted';
      setText('stat-passive-cover-sub', 'أدخل مصاريفك في بطاقة هدف التقاعد');
    }
  }

  renderInsights(s, totalValue, costBasis, pnl, pnlPct);
}

// ── إعدادات هدف الاستقلال المالي (محلي) ──────────────────────
const RET_GOAL_KEY = 'retirement_goal_v1';
function getRetirementGoal() {
  try {
    const o = JSON.parse(localStorage.getItem(RET_GOAL_KEY)) || {};
    return { monthly: +o.monthly || 0, swr: +o.swr || 4 };
  } catch (_) { return { monthly: 0, swr: 4 }; }
}
function saveRetirementGoal(g) {
  try { localStorage.setItem(RET_GOAL_KEY, JSON.stringify(g)); } catch (_) {}
}
function editRetirementGoal() {
  const cur = getRetirementGoal();
  const m = prompt('كم مصاريفك الشهرية المتوقعة بعد التقاعد؟ (ر.س)', cur.monthly || '');
  if (m === null) return;
  const swr = prompt('نسبة السحب الآمنة السنوية % (الافتراضي 4% — قاعدة 25 ضعف)', cur.swr || 4);
  if (swr === null) return;
  saveRetirementGoal({ monthly: +m || 0, swr: +swr || 4 });
  renderStats();
  renderRetirementCard();
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
  }

  // ── بطاقة 4: التكاليف التراكمية ──────────────────────────
  setText('ins-commission', formatSAR(s.totalCommission || 0));
  setText('ins-vat',        formatSAR(s.totalVAT        || 0));
  setText('ins-costs-total', formatSAR((s.totalCommission || 0) + (s.totalVAT || 0)));

  // ── بطاقة 5: رأس المال vs القيمة السوقية ──────────────────
  setText('ins-cost-basis',   formatSAR(costBasis));
  setText('ins-market-value', formatSAR(totalValue));
  // شريط التقدم: نسبة القيمة السوقية من التكلفة
  const mktPct = costBasis > 0 ? Math.min(totalValue / costBasis * 100, 200) : 0;
  const mktFill = g('ins-mkt-bar-fill');
  if (mktFill) {
    mktFill.style.width = Math.min(mktPct, 100) + '%';
    mktFill.style.background = pnl >= 0 ? 'var(--success)' : 'var(--danger)';
  }
  const mktPnlEl = g('ins-mkt-pnl');
  if (mktPnlEl) {
    mktPnlEl.textContent = (pnl >= 0 ? '+' : '') + formatSAR(pnl, true) + '  (' + (pnl >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%)';
    mktPnlEl.className   = 'small ' + (pnl >= 0 ? 'text-success' : 'text-danger');
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
  sectorChart = new Chart(sCtx, {
    type: 'doughnut',
    data: { labels: sLabels, datasets: [{ data: sData, backgroundColor: CHART_COLORS, borderColor: '#1c2128', borderWidth: 2, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 10, usePointStyle: true } },
        tooltip: { backgroundColor: '#1c2128', titleColor: '#e6edf3', bodyColor: '#8b949e', borderColor: '#30363d', borderWidth: 1, titleFont: { family: 'Tajawal' }, bodyFont: { family: 'Tajawal' },
          callbacks: { label: c => { const pct = total > 0 ? (c.parsed / total * 100).toFixed(1) : 0; return ' ' + formatSAR(c.parsed) + '  (' + pct + '%)'; } } }
      }
    }
  });
}

function _renderSectorBars(entries, total) {
  const bars = entries.map(([sec, val], i) => {
    const pct   = total > 0 ? (val / total * 100) : 0;
    const color = CHART_COLORS[i % CHART_COLORS.length];
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div style="width:90px;font-size:0.82rem;color:var(--text);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(sec)}">${esc(sec)}</div>
      <div style="flex:1;height:18px;background:rgba(255,255,255,0.06);border-radius:4px;position:relative">
        <div style="height:100%;width:${pct.toFixed(1)}%;background:${color};border-radius:4px;min-width:2px"></div>
      </div>
      <div style="width:44px;font-size:0.82rem;font-weight:600;color:var(--text);text-align:left">${pct.toFixed(1)}%</div>
      <div style="width:90px;font-size:0.78rem;color:var(--text-2);text-align:left">${formatSAR(val)}</div>
    </div>`;
  }).join('');
  return `<div style="padding:8px 4px">${bars}</div>`;
}

function _renderSectorCards(entries, total) {
  const cards = entries.map(([sec, val], i) => {
    const pct   = total > 0 ? (val / total * 100) : 0;
    const color = CHART_COLORS[i % CHART_COLORS.length];
    return `<div class="w-card" style="--card-accent:${color}">
      <div class="w-card-header">
        <span class="w-card-ticker" style="color:${color};font-size:0.8rem">${esc(sec)}</span>
        <span class="w-card-pct">${pct.toFixed(1)}%</span>
      </div>
      <div class="w-card-bar-wrap" style="margin:6px 0">
        <div class="w-card-bar-track"><div class="w-card-bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
      </div>
      <div style="font-size:0.78rem;color:var(--text-2)">${formatSAR(val)}</div>
    </div>`;
  }).join('');
  return `<div class="w-cards-grid" style="padding:8px 0">${cards}</div>`;
}

// ── Weight chart: mode switcher ───────────────────────────────
function setWeightMode(mode) {
  _weightMode = mode;
  ['bars','gap','cards','table'].forEach(m => {
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
    if (!tgt)           return 'rgba(240,180,41,0.85)';
    if (cur > tgt + 1)  return 'rgba(239,68,68,0.85)';
    if (cur < tgt - 1)  return 'rgba(99,179,237,0.85)';
    return 'rgba(63,185,80,0.85)';
  });

  const chartCont = document.getElementById('weightChart-container');
  const altArea   = document.getElementById('weight-alt-area');

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

function _renderBarsChart(wSorted, wCurrent, wTarget, wColors, wCtx) {
  const wLabels = wSorted.map(h => h.ticker);
  weightChart = new Chart(wCtx, {
    type: 'bar',
    data: {
      labels: wLabels,
      datasets: [
        { label: 'الوزن الحالي %', data: wCurrent, backgroundColor: wColors, borderColor: wColors.map(c => c.replace('0.85','1')), borderWidth: 1, borderRadius: 3, barPercentage: 0.75, categoryPercentage: 0.65 },
        { label: 'الهدف %',        data: wTarget,  backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.45)', borderWidth: 1.5, borderRadius: 3, barPercentage: 0.75, categoryPercentage: 0.65 }
      ]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 14, usePointStyle: true,
            generateLabels: () => [
              { text: 'ضمن الهدف',      fillStyle: 'rgba(63,185,80,0.85)',   strokeStyle: 'rgba(63,185,80,1)',      lineWidth: 1, pointStyle: 'rect', fontColor: '#c9d1d9' },
              { text: 'زيادة عن الهدف', fillStyle: 'rgba(239,68,68,0.85)',   strokeStyle: 'rgba(239,68,68,1)',      lineWidth: 1, pointStyle: 'rect', fontColor: '#c9d1d9' },
              { text: 'نقص عن الهدف',   fillStyle: 'rgba(99,179,237,0.85)',  strokeStyle: 'rgba(99,179,237,1)',     lineWidth: 1, pointStyle: 'rect', fontColor: '#c9d1d9' },
              { text: 'بدون هدف',       fillStyle: 'rgba(240,180,41,0.85)',  strokeStyle: 'rgba(240,180,41,1)',     lineWidth: 1, pointStyle: 'rect', fontColor: '#c9d1d9' },
              { text: 'الهدف المحدد',   fillStyle: 'rgba(255,255,255,0.12)', strokeStyle: 'rgba(255,255,255,0.45)', lineWidth: 1.5, pointStyle: 'rect', fontColor: '#c9d1d9' }
            ]
          }
        },
        tooltip: {
          backgroundColor: '#1c2128', titleColor: '#e6edf3', bodyColor: '#c9d1d9',
          borderColor: '#30363d', borderWidth: 1, padding: 12,
          titleFont: { family: 'Tajawal', size: 13, weight: 'bold' },
          bodyFont:  { family: 'Tajawal', size: 12 },
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
            labelColor: item => { const c = wColors[item.dataIndex]; return { borderColor: c.replace('0.85','1'), backgroundColor: c }; }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, callback: v => v + '%' }, grid: { color: 'rgba(48,54,61,0.5)' } },
        y: { ticks: { color: '#c9d1d9', font: { family: 'Tajawal', size: 10 }, autoSkip: false, callback: (_, i) => wSorted[i]?.ticker || '' }, grid: { color: 'rgba(48,54,61,0.3)' } }
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
  const colors  = allRows.map(x => {
    if (!x.tgt) return 'rgba(240,180,41,0.7)';
    const d = x.cur - x.tgt;
    if (d > 1)  return 'rgba(239,68,68,0.85)';
    if (d < -1) return 'rgba(99,179,237,0.85)';
    return 'rgba(63,185,80,0.85)';
  });

  weightChart = new Chart(wCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'الفارق عن الهدف %',
        data: gaps,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.85','1').replace('0.7','1')),
        borderWidth: 1, borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.7
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c2128', titleColor: '#e6edf3', bodyColor: '#c9d1d9',
          borderColor: '#30363d', borderWidth: 1, padding: 12,
          titleFont: { family: 'Tajawal', size: 13, weight: 'bold' },
          bodyFont:  { family: 'Tajawal', size: 12 },
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
        },
        annotation: {}
      },
      scales: {
        x: {
          ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, callback: v => (v >= 0 ? '+' : '') + v + '%' },
          grid:  { color: ctx => ctx.tick.value === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(48,54,61,0.4)' }
        },
        y: { ticks: { color: '#c9d1d9', font: { family: 'Tajawal', size: 10 }, autoSkip: false }, grid: { color: 'rgba(48,54,61,0.3)' } }
      }
    }
  });
}

function _renderWeightCards(wSorted, wCurrent, wTarget, wColors) {
  const colorMap = { 'rgba(63,185,80,0.85)': '#3fb950', 'rgba(239,68,68,0.85)': '#ef4444', 'rgba(99,179,237,0.85)': '#63b3ed', 'rgba(240,180,41,0.85)': '#f0b429' };
  const cards = wSorted.map((h, i) => {
    const cur = wCurrent[i], tgt = wTarget[i], clr = colorMap[wColors[i]] || '#8b949e';
    const diff = tgt ? (cur - tgt) : null;
    const diffTxt = diff !== null ? (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%' : '—';
    const diffCls = diff === null ? 'text-muted' : diff > 1 ? 'text-danger' : diff < -1 ? '' : 'text-success';
    const diffClsStyle = diff === null ? 'color:#8b949e' : diff > 1 ? 'color:#ef4444' : diff < -1 ? 'color:#63b3ed' : 'color:#3fb950';
    return `<div class="w-card" style="--card-accent:${clr}">
      <div class="w-card-header">
        <span class="w-card-ticker" style="color:${clr}">${esc(h.ticker)}</span>
        <span class="w-card-pct">${cur}%</span>
      </div>
      <div class="w-card-name">${esc(h.name || '')}</div>
      <div class="w-card-bar-wrap"><div class="w-card-bar-track"><div class="w-card-bar-fill" style="width:${Math.min(cur*3,100)}%;background:${clr}"></div>${tgt ? `<div class="w-card-bar-target" style="left:${Math.min(tgt*3,100)}%"></div>` : ''}</div></div>
      <div class="w-card-footer">
        <span style="font-size:0.72rem;color:#8b949e">هدف: ${tgt ? tgt + '%' : '—'}</span>
        <span style="font-size:0.75rem;font-weight:600;${diffClsStyle}">${diffTxt}</span>
      </div>
    </div>`;
  }).join('');
  return `<div class="w-cards-grid">${cards}</div>`;
}

function _renderWeightTable(wSorted, wCurrent, wTarget, wColors) {
  const colorMap = { 'rgba(63,185,80,0.85)': '#3fb950', 'rgba(239,68,68,0.85)': '#ef4444', 'rgba(99,179,237,0.85)': '#63b3ed', 'rgba(240,180,41,0.85)': '#f0b429' };
  const rows = wSorted.map((h, i) => {
    const cur = wCurrent[i], tgt = wTarget[i], clr = colorMap[wColors[i]] || '#8b949e';
    const diff = tgt ? (cur - tgt) : null;
    const diffTxt  = diff !== null ? (diff >= 0 ? '+' : '') + diff.toFixed(2) + '%' : '—';
    const diffStyle = diff === null ? 'color:#8b949e' : diff > 1 ? 'color:#ef4444' : diff < -1 ? 'color:#63b3ed' : 'color:#3fb950';
    const statusTxt = !tgt ? 'بدون هدف' : diff > 1 ? 'زيادة' : diff < -1 ? 'نقص' : 'ضمن الهدف';
    const barW = Math.min(cur * 4, 100);
    const tgtW = tgt ? Math.min(tgt * 4, 100) : 0;
    return `<tr>
      <td><strong style="color:${clr}">${esc(h.ticker)}</strong></td>
      <td style="color:#c9d1d9;font-size:0.85rem">${esc(h.name || '—')}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;position:relative;min-width:60px">
            <div style="height:100%;width:${barW}%;background:${clr};border-radius:3px"></div>
            ${tgt ? `<div style="position:absolute;top:-2px;left:${tgtW}%;width:2px;height:10px;background:rgba(255,255,255,0.5);border-radius:1px"></div>` : ''}
          </div>
          <span style="font-size:0.82rem;color:#e6edf3;min-width:38px;text-align:right">${cur}%</span>
        </div>
      </td>
      <td style="color:#8b949e;font-size:0.82rem;text-align:center">${tgt ? tgt + '%' : '—'}</td>
      <td style="${diffStyle};font-size:0.82rem;font-weight:600;text-align:center">${diffTxt}</td>
      <td style="${diffStyle};font-size:0.78rem;text-align:center">${statusTxt}</td>
    </tr>`;
  }).join('');
  return `<div style="overflow-x:auto;padding:4px 0">
    <table class="data-table" style="width:100%">
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

    return `<tr>
      <td ${ed('holdings',h.id,'ticker','text',h.ticker)}><strong class="text-accent">${esc(h.ticker)}</strong></td>
      <td ${ed('holdings',h.id,'name','text',h.name)}>${esc(h.name)}</td>
      <td ${ed('holdings',h.id,'sector','text',h.sector||'','text-muted small')}>${esc(h.sector || '—')}</td>
      <td ${ed('holdings',h.id,'shares','number',h.shares)}>${formatShares(h.shares)}</td>
      <td ${ed('holdings',h.id,'avg_price','number',h.avg_price)}>${formatSAR(h.avg_price)}</td>
      <td ${ed('holdings',h.id,'current_price','number',h.current_price)}>${formatSAR(h.current_price)}</td>
      <td class="num">${formatSAR(cost)}</td>
      <td class="num bold">${formatSAR(value)}</td>
      <td class="num ${cls}">${formatSAR(pnl,true)}<br><span class="small">${(pnl>=0?'+':'')}${pnlP.toFixed(2)}%</span></td>
      <td class="num">${wt.toFixed(2)}%</td>
      <td ${ed('holdings',h.id,'target_weight','number',h.target_weight||0,'text-muted')}>${(+h.target_weight||0).toFixed(2)}%</td>
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
  if (field === 'current_price' && h) checkPriceZones(h.ticker, +val);
  renderStats();
  renderCharts();
  renderTable();
  renderPriceZonesCard();
  renderBreakEvenCard();
  renderAllocationChart();
  renderRetirementCard();
}

// ── Price Zone Alerts ─────────────────────────────────────────
function checkPriceZones(ticker, price) {
  const zone = stockZones[ticker];
  if (!zone) return;
  const h = holdings.find(x => x.ticker === ticker);
  const name = h?.name || '';
  const alerts = [];
  if (zone.entry_price != null && price <= zone.entry_price)
    alerts.push({ ticker, name, type: 'entry', label: 'منطقة شراء', color: '#22c55e', price, zone: zone.entry_price });
  if (zone.exit_price != null && price >= zone.exit_price)
    alerts.push({ ticker, name, type: 'exit', label: 'منطقة بيع', color: '#f85149', price, zone: zone.exit_price });
  alerts.forEach(a => showPriceZoneAlert(a));
}

function showPriceZoneAlert({ ticker, label, color, price, zone, name }) {
  const id = 'pz-alert-' + ticker + '-' + label;
  if (document.getElementById(id)) return;
  const banner = document.createElement('div');
  banner.id = id;
  banner.style.cssText = `position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:9999;
    background:${color};color:#fff;padding:12px 20px;border-radius:8px;font-size:0.95rem;
    display:flex;align-items:center;gap:12px;box-shadow:0 4px 16px rgba(0,0,0,0.3);min-width:300px`;
  banner.innerHTML = `<span style="font-size:1.2rem">${label === 'منطقة شراء' ? '🟢' : '🔴'}</span>
    <span><strong>${ticker}</strong>${name ? ` (${name})` : ''} — ${label === 'منطقة شراء' ? 'السهم الآن في منطقة شراء' : 'السهم الآن في منطقة بيع'}! السعر الحالي <strong>${price}</strong> ${label === 'منطقة شراء' ? 'وصل الحد' : 'تجاوز الحد'} ${zone}</span>
    <button onclick="this.parentElement.remove()" style="margin-right:auto;background:rgba(255,255,255,0.3);border:none;color:#fff;
      border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:0.9rem">✕</button>`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 10000);
}

function renderPriceZonesCard() {
  const el = document.getElementById('price-zones-card-body');
  if (!el) return;
  const totalValue = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  const rows = [];
  holdings.forEach(h => {
    const zone = stockZones[h.ticker];
    if (!zone || (zone.entry_price == null && zone.exit_price == null)) return;
    const price = +h.current_price;
    let entryStatus = '', exitStatus = '';
    if (zone.entry_price != null) {
      if (price <= zone.entry_price)
        entryStatus = `<span style="color:#22c55e;font-weight:bold">🟢 في منطقة شراء — السعر ${price} وصل الحد ${zone.entry_price}</span>`;
      else
        entryStatus = `<span class="text-muted">لم يصل — السعر ${price} / الحد ${zone.entry_price}</span>`;
    }
    if (zone.exit_price != null) {
      if (price >= zone.exit_price)
        exitStatus = `<span style="color:#f85149;font-weight:bold">🔴 في منطقة بيع — السعر ${price} تجاوز الحد ${zone.exit_price}</span>`;
      else
        exitStatus = `<span class="text-muted">لم يصل — السعر ${price} / الحد ${zone.exit_price}</span>`;
    }
    rows.push({ ticker: h.ticker, name: h.name, entryStatus, exitStatus, zone, price });
  });

  if (!rows.length) {
    el.innerHTML = `<div class="text-muted small" style="text-align:center;padding:12px">
      لا توجد مناطق سعرية مُعرَّفة — أضفها من <a href="targets.html" style="color:var(--accent)">صفحة الأهداف</a>
    </div>`;
    return;
  }

  el.innerHTML = `<table style="width:100%;font-size:0.82rem;border-collapse:collapse">
    <thead><tr style="color:var(--text-muted);border-bottom:1px solid var(--border)">
      <th style="text-align:right;padding:4px 6px">السهم</th>
      <th style="text-align:right;padding:4px 6px">منطقة الشراء ≤</th>
      <th style="text-align:right;padding:4px 6px">منطقة البيع ≥</th>
    </tr></thead>
    <tbody>${rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:4px 6px"><strong class="text-accent">${esc(r.ticker)}</strong>${r.name ? `<br><span class="text-muted" style="font-size:0.75rem">${esc(r.name)}</span>` : ''}</td>
      <td style="padding:4px 6px">${r.zone.entry_price != null ? r.entryStatus || '—' : '<span class="text-muted">—</span>'}</td>
      <td style="padding:4px 6px">${r.zone.exit_price  != null ? r.exitStatus  || '—' : '<span class="text-muted">—</span>'}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ── Break-Even Card ───────────────────────────────────────────
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
  // نضيف نقد المحفظة: حصيلة البيع التي خفّضت رأس المال قد تكون لا تزال نقداً عند الوسيط
  const totalReturns = currentValue + portfolioCash + totalDivAll;

  // صافي الربح/الخسارة الحقيقي = إجمالي العوائد − ما أنفق
  const trueNetPnL   = totalReturns - netCapital;

  // ر/خ غير محقق (ارتفاع/انخفاض السعر)
  const unrealizedPnL = currentValue - costBasis;

  // نسبة العائد الكلي على رأس المال
  const totalReturnPct = netCapital > 0 ? (trueNetPnL / netCapital * 100) : 0;

  // نقطة التعادل: التقدم = إجمالي العوائد / رأس المال المنشغل
  const breProgress = netCapital > 0 ? Math.min(totalReturns / netCapital * 100, 200) : 0;
  const isBreakEven = trueNetPnL >= 0;
  const gapToBreakEven = netCapital - totalReturns; // سالب = تجاوزت نقطة التعادل

  // ── بناء الكرت ──────────────────────────────────────────
  const pnlColor  = trueNetPnL >= 0 ? 'var(--success)' : 'var(--danger)';
  const pnlIcon   = trueNetPnL >= 0 ? '✅' : '❌';
  const barColor  = isBreakEven ? '#22c55e' : (breProgress > 75 ? '#f0b429' : '#f85149');
  const barWidth  = Math.min(breProgress, 100);

  const row = (label, val, cls = '', sub = '') => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--border)">
      <span class="small" style="color:var(--text-muted)">${label}</span>
      <div style="text-align:left">
        <span class="num bold ${cls}" style="font-size:0.95rem">${val}</span>
        ${sub ? `<span class="small text-muted" style="margin-right:6px">${sub}</span>` : ''}
      </div>
    </div>`;

  el.innerHTML = `
    <!-- شريط التعادل -->
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span class="small text-muted">التقدم نحو نقطة التعادل</span>
        <span class="small bold" style="color:${barColor}">${breProgress.toFixed(1)}%</span>
      </div>
      <div style="background:var(--bg-3);border-radius:99px;height:10px;overflow:hidden">
        <div style="height:100%;border-radius:99px;background:${barColor};width:${barWidth}%;transition:width 0.4s ease"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:4px">
        <span class="small text-muted">0%</span>
        <span class="small" style="color:var(--accent);font-weight:600">نقطة التعادل 100%</span>
        ${isBreakEven ? '<span class="small text-success">✅ تجاوزت!</span>' : `<span class="small text-muted">متبقي ${formatSAR(gapToBreakEven)}</span>`}
      </div>
    </div>

    <!-- الصافي الكبير -->
    <div style="text-align:center;padding:14px;background:var(--bg-3);border-radius:var(--radius);margin-bottom:16px;border:1px solid ${pnlColor}33">
      <div class="small text-muted" style="margin-bottom:4px">صافي الربح / الخسارة الحقيقي</div>
      <div style="font-size:1.7rem;font-weight:700;color:${pnlColor}">${pnlIcon} ${formatSAR(Math.abs(trueNetPnL))}</div>
      <div class="small" style="color:${pnlColor};margin-top:2px">${trueNetPnL >= 0 ? 'ربح' : 'خسارة'} ${Math.abs(totalReturnPct).toFixed(2)}% على رأس المال</div>
    </div>

    <!-- تفاصيل الحسبة -->
    <div style="margin-bottom:8px">
      <div class="small bold" style="color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">التكلفة</div>
      ${row('رأس المال المنشغل الصافي (مشتريات − مبيعات)', formatSAR(netCapital), 'text-danger')}
    </div>
    <div style="margin-bottom:8px;margin-top:12px">
      <div class="small bold" style="color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">العوائد</div>
      ${row('قيمة المحفظة الحالية', formatSAR(currentValue), '', grantValueNow > 0 ? `(يشمل منحة ${s.totalGrantShares || 0} سهم)` : '')}
      ${portfolioCash > 0 ? row('نقد المحفظة عند الوسيط', formatSAR(portfolioCash)) : ''}
      ${row('إجمالي الأرباح الموزعة (كل الأوقات)', formatSAR(totalDivAll), 'text-success')}
      ${row('إجمالي العوائد', formatSAR(totalReturns), trueNetPnL >= 0 ? 'text-success' : '')}
    </div>
    <div style="margin-top:12px">
      <div class="small bold" style="color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">تحليل الأداء</div>
      ${row('ر/خ غير محقق (تغير السعر فقط)', formatSAR(unrealizedPnL), unrealizedPnL >= 0 ? 'text-success' : 'text-danger')}
      ${row('ر/خ محقق من المبيعات', formatSAR(realizedPnL), realizedPnL >= 0 ? 'text-success' : 'text-danger')}
      ${row('مساهمة الأرباح الموزعة', formatSAR(totalDivAll), 'text-success')}
    </div>`;
}

// ── Asset Allocation Chart ────────────────────────────────────
function _allocParts() {
  const s = window._ds || {};
  const stocks = holdings.reduce((a, h) => a + +h.shares * +h.current_price, 0);
  const parts = [
    { label: 'أسهم',   value: stocks,             color: '#3b82f6' },
    { label: 'نقد',     value: portfolioCash || 0, color: '#22c55e' },
    { label: 'عقارات', value: s.reTotal || 0,     color: '#f0b429' },
    { label: 'صكوك',   value: getSukukActiveTotal(), color: '#a855f7' }
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
    if (leg)  leg.innerHTML = '<div class="text-muted small" style="text-align:center;padding:12px">لا توجد أصول مسجّلة بعد</div>';
    return;
  }
  if (cont) cont.style.display = '';

  const ctx = g('allocChart')?.getContext('2d');
  if (!ctx) return;
  if (allocChart) allocChart.destroy();
  allocChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: parts.map(p => p.label), datasets: [{ data: parts.map(p => p.value), backgroundColor: parts.map(p => p.color), borderColor: '#1c2128', borderWidth: 2, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 10, usePointStyle: true } },
        tooltip: { backgroundColor: '#1c2128', titleColor: '#e6edf3', bodyColor: '#8b949e', borderColor: '#30363d', borderWidth: 1, titleFont: { family: 'Tajawal' }, bodyFont: { family: 'Tajawal' },
          callbacks: { label: c => { const pct = total > 0 ? (c.parsed / total * 100).toFixed(1) : 0; return ' ' + formatSAR(c.parsed) + '  (' + pct + '%)'; } } }
      }
    }
  });

  if (leg) {
    leg.innerHTML = parts.map(p => {
      const pct = (p.value / total * 100).toFixed(1);
      return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;padding:3px 0">
        <span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:2px;background:${p.color};display:inline-block"></span>${p.label}</span>
        <span class="num"><strong>${pct}%</strong> <span class="text-muted">${formatSAR(p.value)}</span></span>
      </div>`;
    }).join('') + `<div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);margin-top:6px;padding-top:6px;font-size:0.85rem">
        <span class="text-muted">الإجمالي</span><span class="num bold text-accent">${formatSAR(total)}</span></div>`;
  }
}

// ── Retirement / FIRE Card ────────────────────────────────────
function renderRetirementCard() {
  const el = document.getElementById('retirement-body');
  if (!el) return;
  const s = window._ds || {};
  const goal = getRetirementGoal();

  const stocks = holdings.reduce((a, h) => a + +h.shares * +h.current_price, 0);
  const investAssets = stocks + (portfolioCash || 0) + (s.reTotal || 0) + getSukukActiveTotal();
  const netWorth = s.latestNW != null ? s.latestNW : investAssets;

  if (!goal.monthly) {
    el.innerHTML = `<div style="text-align:center;padding:18px 8px">
      <p class="text-muted small" style="margin-bottom:14px">أدخل مصاريفك الشهرية المتوقعة بعد التقاعد لحساب رقم الاستقلال المالي (قاعدة الـ4%).</p>
      <button class="btn btn-primary btn-sm" onclick="editRetirementGoal()">＋ إدخال المصاريف الشهرية</button>
    </div>`;
    return;
  }

  const annualExpenses = goal.monthly * 12;
  const fireNumber = goal.swr > 0 ? annualExpenses / (goal.swr / 100) : annualExpenses * 25;
  const progress = fireNumber > 0 ? Math.min(netWorth / fireNumber * 100, 100) : 0;
  const remaining = Math.max(0, fireNumber - netWorth);
  const safeAnnualWithdrawal = netWorth * (goal.swr / 100);
  const safeMonthly = safeAnnualWithdrawal / 12;
  const barColor = progress >= 100 ? '#22c55e' : progress >= 50 ? '#f0b429' : '#3b82f6';

  const row = (label, val, cls = '') => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--border)">
      <span class="small" style="color:var(--text-muted)">${label}</span>
      <span class="num bold ${cls}" style="font-size:0.9rem">${val}</span>
    </div>`;

  el.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span class="small text-muted">التقدم نحو الاستقلال المالي</span>
        <span class="small bold" style="color:${barColor}">${progress.toFixed(1)}%</span>
      </div>
      <div style="background:var(--bg-3);border-radius:99px;height:10px;overflow:hidden">
        <div style="height:100%;border-radius:99px;background:${barColor};width:${progress}%;transition:width 0.4s ease"></div>
      </div>
    </div>
    <div style="text-align:center;padding:12px;background:var(--bg-3);border-radius:var(--radius);margin-bottom:14px">
      <div class="small text-muted" style="margin-bottom:2px">رقم الاستقلال المالي المستهدف</div>
      <div style="font-size:1.5rem;font-weight:700;color:var(--accent)">${formatSAR(fireNumber)}</div>
      <div class="small text-muted" style="margin-top:2px">مصاريف ${formatSAR(annualExpenses)}/سنة ÷ ${goal.swr}%</div>
    </div>
    ${row('صافي الثروة الحالي' + (s.latestNW != null ? ' (آخر لقطة)' : ' (تقديري)'), formatSAR(netWorth), 'text-accent')}
    ${row('المتبقي للوصول للهدف', formatSAR(remaining), remaining > 0 ? 'text-danger' : 'text-success')}
    ${row('السحب الآمن الحالي', formatSAR(safeMonthly) + '/شهر', '')}
    ${row('تغطية مصاريفك الآن', (goal.monthly > 0 ? (safeMonthly / goal.monthly * 100).toFixed(1) : 0) + '%', safeMonthly >= goal.monthly ? 'text-success' : 'text-muted')}
    <div style="text-align:center;margin-top:12px">
      <button class="btn btn-secondary btn-sm" onclick="editRetirementGoal()">تعديل المصاريف / نسبة السحب</button>
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
    target_weight: +g('h-target-wt').value || 0
  };
  let error;
  if (editingId) ({ error } = await supabaseClient.from('holdings').update(payload).eq('id', editingId));
  else           ({ error } = await supabaseClient.from('holdings').insert([payload]));
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editingId ? 'تم التحديث' : 'تمت الإضافة', 'success');
  closeModal();
  await reloadHoldings();
  renderStats(); renderCharts(); renderTable();
}

// ── Sync holdings from transactions ──────────────────────────
let _syncPending = null;  // يحمل بيانات المزامنة ريثما يؤكد المستخدم

async function syncHoldingsFromTx() {
  const btn = document.getElementById('btn-sync-tx');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الفحص…'; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  const { data: txAll, error: txErr } = await supabaseClient
    .from('transactions')
    .select('ticker, name, type, shares, price, total')
    .eq('is_archived', false)
    .order('date', { ascending: true });

  if (txErr || !txAll) {
    showToast('خطأ في جلب المعاملات', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'مزامنة من المعاملات'; }
    return;
  }

  // احسب الأسهم ومتوسط السعر لكل رمز
  const map = {};
  txAll.forEach(tx => {
    if (!map[tx.ticker]) map[tx.ticker] = { name: tx.name, buyShares: 0, buyCost: 0, sellShares: 0 };
    const m = map[tx.ticker];
    if (tx.type === 'buy') {
      m.buyShares += +tx.shares;
      m.buyCost   += +tx.shares * +tx.price;
    } else if (tx.type === 'grant') {
      m.buyShares += +tx.shares;
    } else if (tx.type === 'sell') {
      m.sellShares += +tx.shares;
    }
  });
  for (const [, m] of Object.entries(map)) {
    m.shares   = m.buyShares - m.sellShares;
    m.avgPrice = m.buyShares > 0 ? m.buyCost / m.buyShares : 0;
  }

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
      await supabaseClient.from('holdings').insert([{
        user_id: userId, ticker, name: calc.name,
        sector: sectorMap[ticker] || '',
        shares: +calc.shares.toFixed(4), avg_price: txAvg,
        current_price: 0, target_weight: 0
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
  renderStats(); renderCharts(); renderTable();
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
        <p>هذا الرقم مأخوذ من آخر "لقطة" سجّلتها يدوياً في صفحة <strong>صافي الثروة</strong>.</p>
        <div class="info-math">
          آخر لقطة مسجّلة: <strong>${s.latestNWDate ? formatDate(s.latestNWDate) : 'لا توجد'}</strong><br>
          القيمة: <strong class="text-accent">${s.latestNW != null ? formatSAR(s.latestNW) : '—'}</strong>
        </div>
        <div class="info-formula">صافي الثروة = إجمالي الأصول − إجمالي الالتزامات</div>
        <p class="info-note">⚠️ هذا الرقم لا يتحدث تلقائياً — اذهب لصفحة صافي الثروة وسجّل لقطة جديدة متى أردت.</p>`
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
            القطاع: <strong>${t.sec}</strong><br>
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
            القطاع: <strong>${b.sec}</strong><br>
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
          <strong>إجمالي العوائد = قيمة المحفظة الحالية + نقد المحفظة + كل الأرباح الموزعة</strong><br>
          <em>(كل ما يقابلك الآن مقابل ما دفعته — قيمة المنح مشمولة ضمن قيمة المحفظة)</em>
        </div>
        <div class="info-formula">
          <strong>صافي الربح/الخسارة الحقيقي = إجمالي العوائد − رأس المال المنشغل</strong>
        </div>
        <p class="info-note">💡 نقطة التعادل = عندما إجمالي العوائد = رأس المال المنشغل (الشريط يصل 100%)</p>
        <p class="info-note">📌 قيمة المنح تُحسب بسعر السوق الحالي — لأنها أسهم مجانية تحتسب كعائد.</p>`
    },
    'realized': {
      title: '✅ الربح / الخسارة المحقق من البيع',
      body: `
        <p>هذا الرقم يُحسب من صفقات البيع الفعلية — ما تحقق فعلاً في جيبك.</p>
        <div class="info-formula">
          لكل صفقة بيع:<br>
          <strong>ر/خ = عدد الأسهم المباعة × (سعر البيع − متوسط سعر الشراء)</strong>
        </div>
        <div class="info-math">
          متوسط سعر الشراء يُحسب من جميع عمليات الشراء لكل رمز<br>
          ثم يُطرح من سعر البيع الفعلي<br>
          إجمالي ر/خ المحقق = <strong class="${(s.realizedPnL||0) >= 0 ? 'text-success' : 'text-danger'}">${(s.realizedPnL||0) >= 0 ? '+' : ''}${formatSAR(s.realizedPnL||0, true)}</strong>
        </div>
        <p class="info-note">⚠️ هذا تقدير بناءً على متوسط تكلفة الشراء الكلي لكل رمز.</p>`
    },
    'div-yield': {
      title: '📈 العائد التوزيعي — ثلاث طرق',
      body: `
        <p>ثلاث طرق لحساب العائد، كل منها تعبّر عن زاوية مختلفة:</p>

        <p style="margin:12px 0 4px"><strong>① مُسنوى (السنة الجارية)</strong> — الأدق للسنة غير المكتملة</p>
        <div class="info-formula">أرباح ${s.yr||new Date().getFullYear()} × (${s.daysInYear||365}÷${s.daysElapsed||1}) ÷ رأس المال أول يناير</div>
        <div class="info-math">
          ${formatSAR(s.yearDiv||0)} × ${((s.daysInYear||365)/(s.daysElapsed||1)).toFixed(2)} = أرباح مُسنواة ${formatSAR(s.annualizedYearDiv||0)}<br>
          ÷ رأس مال أول يناير ${formatSAR(s.denomAnn||0)}<br>
          = <strong class="text-success">${(s.divYieldAnn||0).toFixed(2)}%</strong>
        </div>

        <p style="margin:12px 0 4px"><strong>② على التكلفة YOC</strong> — العائد السنوي على ما دفعته فعلاً</p>
        <div class="info-formula">أرباح آخر 12 شهراً ÷ تكلفة الشراء الأصلية</div>
        <div class="info-math">
          ${formatSAR(s.ttmDiv||0)} ÷ ${formatSAR(costBasis)}<br>
          = <strong class="text-success">${(s.divYieldYOC||0).toFixed(2)}%</strong>
        </div>
        <p class="small text-muted" style="margin:-4px 0 8px">يستخدم أرباح آخر 12 شهراً (وليس التراكمي) ليكون عائداً سنوياً حقيقياً.</p>

        <p style="margin:12px 0 4px"><strong>③ سوقي</strong> — العائد على القيمة السوقية الحالية</p>
        <div class="info-formula">أرباح ${s.yr||new Date().getFullYear()} مُسنواة ÷ القيمة السوقية الحالية</div>
        <div class="info-math">
          ${formatSAR(s.annualizedYearDiv||0)} ÷ ${formatSAR(totalValue)}<br>
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
      body: `
        <p>تقدير لدخلك السنوي من التوزيعات بناءً على ما استلمته فعلاً في آخر 12 شهراً (TTM).</p>
        <div class="info-formula"><strong>مجموع التوزيعات خلال آخر 365 يوماً</strong></div>
        <div class="info-math">
          الدخل السنوي المتوقع = <strong class="text-success">${formatSAR(s.ttmDiv||0)}</strong><br>
          ≈ ${formatSAR((s.ttmDiv||0)/12)} شهرياً
        </div>
        <p class="info-note">💡 مؤشر تقديري — يفترض استمرار التوزيعات بنفس الوتيرة.</p>`
    },
    'passive-cover': {
      title: '🛡️ تغطية الدخل السلبي للمصاريف',
      body: (() => {
        const goal = getRetirementGoal();
        const mInc = (s.ttmDiv||0)/12;
        return `
        <p>كم نسبة مصاريفك الشهرية التي يغطيها دخل التوزيعات وحده — مؤشر اقترابك من الاستقلال المالي.</p>
        <div class="info-formula"><strong>(دخل التوزيعات الشهري ÷ المصاريف الشهرية) × 100</strong></div>
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
    'allocation': {
      title: '🍰 التخصيص الكلي للأصول',
      body: `
        <p>توزيع ثروتك الاستثمارية على الفئات الأربع. التنويع بين الفئات يقلل المخاطر أكثر من التنويع داخل فئة واحدة.</p>
        <div class="info-formula"><strong>نسبة كل فئة = قيمتها ÷ إجمالي الأصول × 100</strong></div>
        <p class="info-note">💡 لا توجد نسبة "مثالية" واحدة — تعتمد على عمرك وأهدافك وتحمّلك للمخاطر. القاعدة الشائعة: كلما اقتربت من التقاعد، زدت الأصول الأقل تذبذباً.</p>`
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
const CASH_LS_KEY = 'portfolio_cash_v1';

function _loadCashFromLS() {
  try {
    const raw = localStorage.getItem(CASH_LS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    portfolioCash = +obj.amount || 0;
    cashUpdatedAt = obj.updated_at || null;
  } catch (_) {}
}

function _saveCashToLS(amount, updatedAt) {
  try { localStorage.setItem(CASH_LS_KEY, JSON.stringify({ amount, updated_at: updatedAt })); } catch (_) {}
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
  if (input) input.style.display = 'none';
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

  // حاول الحفظ في Supabase بشكل صامت
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    await supabaseClient.from('portfolio_cash').upsert(
      { user_id: user.id, amount: newVal, updated_at: now },
      { onConflict: 'user_id' }
    );
  } catch (_) { /* الـ localStorage يكفي */ }
}

async function deleteHolding(id) {
  if (!confirm('هل أنت متأكد من حذف هذا السهم؟')) return;
  const { error } = await supabaseClient.from('holdings').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await reloadHoldings();
  renderStats(); renderCharts(); renderTable();
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
