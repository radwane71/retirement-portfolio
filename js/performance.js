/* =====================================================================
   performance.js — الأداء التاريخي
   سجل تدقيق كامل: مراكز مفتوحة / مغلقة / تايم لاين شهري
   ===================================================================== */

'use strict';

let _tx       = [];
let _holdings = [];
let _divs     = [];
let _cf       = [];   // cashflow_entries — للرأسمال التراكمي الفعلي
let _snapshots = []; // net_worth_snapshots — لقيمة المحفظة التاريخية
let _positionCache = null; // H-4: cache to avoid triple recomputation per render
let _monthlyChart     = null;
let _activeTab        = 'open';
let _monthlyChartMode = 'combined'; // 'combined' | 'lines' | 'stacked' | 'divonly'

// ── Init ──────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-performance');

  const [rTx, rH, rDiv, rCf, rSnap] = await Promise.all([
    supabaseClient.from('transactions').select('*').eq('is_archived', false).order('date'),
    supabaseClient.from('holdings').select('*'),
    supabaseClient.from('dividends').select('*').eq('is_archived', false).order('date'),
    supabaseClient.from('cashflow_entries').select('date,type,amount').eq('is_archived', false).order('date'),
    supabaseClient.from('net_worth_snapshots').select('date,total_value,notes').order('date'),
  ]);

  _tx        = rTx.data   || [];
  _holdings  = rH.data    || [];
  _divs      = rDiv.data  || [];
  _cf        = rCf.data   || [];
  _snapshots = rSnap.data || [];
  _positionCache = null; // invalidate cache on fresh load

  renderKPIs();
  renderOpenPositions();
  renderClosedPositions();
  renderMonthlyTimeline();
  renderMonthlyChart();
}

// ── Tab switcher ──────────────────────────────────────────────────────
function showPerfTab(tab) {
  _activeTab = tab;
  ['open','closed','timeline','monthly-chart','benchmark'].forEach(t => {
    const view = document.getElementById(`pview-${t}`);
    const btn  = document.getElementById(`ptab-${t}`);
    if (view) view.style.display = t === tab ? '' : 'none';
    if (btn)  btn.classList.toggle('active', t === tab);
  });
  if (tab === 'benchmark') initBenchmarkTab();
}

// H-4: single entry point — computes once per data load, cached for all callers
function getPositionData() {
  if (!_positionCache) _positionCache = buildPositionData();
  return _positionCache;
}

// ── Build position maps ───────────────────────────────────────────────
function buildPositionData() {
  // تجميع مشتريات وبيوعات لكل رمز
  const posMap = {};

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
    const h       = _holdings.find(x => x.ticker === p.ticker);
    p.currentPrice = h ? +h.current_price : null;
    // دائماً احسب من المعاملات (buyCost يشمل العمولة) لضمان الاتساق
    p.avgCost      = p.buyShares > 0 ? p.buyCost / p.buyShares : 0;

    if (remaining <= 0.001) {
      // مغلق بالكامل
      const realizedPnL = p.sellRevenue - p.buyCost;
      p.realizedPnL  = realizedPnL;
      p.realizedPct  = p.buyCost > 0 ? realizedPnL / p.buyCost * 100 : 0;
      p.totalReturn  = realizedPnL + p.divReceived;
      p.totalReturnPct = p.buyCost > 0 ? p.totalReturn / p.buyCost * 100 : 0;
      // مدة الاحتفاظ — M-6: use parseDateLocal to avoid UTC-midnight off-by-one
      if (p.firstBuyDate && p.lastSellDate) {
        const days = Math.floor((parseDateLocal(p.lastSellDate) - parseDateLocal(p.firstBuyDate)) / 86400000);
        p.holdDays = days;
      }
      closed.push(p);
    } else {
      // مفتوح (كلياً أو جزئياً)
      p.remainingShares   = remaining;
      const costOfRemaining = p.avgCost * remaining;
      p.marketValue       = p.currentPrice != null ? p.currentPrice * remaining : null;
      p.unrealizedPnL     = p.marketValue != null ? p.marketValue - costOfRemaining : null;
      p.unrealizedPct     = costOfRemaining > 0 && p.unrealizedPnL != null ? p.unrealizedPnL / costOfRemaining * 100 : null;
      // الربح المحقق من البيع الجزئي
      const costOfSold    = p.buyShares > 0 ? (p.buyCost / p.buyShares) * p.sellShares : 0;
      p.partialRealizedPnL = p.sellRevenue - costOfSold;
      p.totalReturn        = (p.unrealizedPnL || 0) + p.partialRealizedPnL + p.divReceived;
      p.totalReturnPct     = costOfRemaining > 0 ? p.totalReturn / (costOfRemaining + costOfSold) * 100 : 0;
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

  // Max Drawdown من سجل صافي الثروة
  const ddEl = document.getElementById('pk-max-drawdown');
  if (ddEl && _snapshots.length >= 2) {
    // M-7: direct string comparison — locale-independent, deterministic for ISO dates
    const sorted = _snapshots.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let peak = sorted[0].total_value;
    let maxDD = 0;
    let peakDate = sorted[0].date;
    let ddPeakDate = '', ddTroughDate = '';
    for (const s of sorted) {
      const v = +s.total_value;
      if (v > peak) { peak = v; peakDate = s.date; }
      const dd = peak > 0 ? (v - peak) / peak * 100 : 0;
      if (dd < maxDD) { maxDD = dd; ddPeakDate = peakDate; ddTroughDate = s.date; }
    }
    ddEl.textContent  = maxDD.toFixed(2) + '%';
    ddEl.className    = 'value num ' + (maxDD < -15 ? 'text-danger' : maxDD < -8 ? 'text-warning' : 'text-success');
    ddEl.title        = ddPeakDate ? `من ${formatDate(ddPeakDate)} إلى ${formatDate(ddTroughDate)}` : '';
  } else if (ddEl) {
    ddEl.textContent = '— (بيانات غير كافية)';
    ddEl.className   = 'value num text-muted';
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
      <td class="num ${retCls} bold">${formatSAR(p.totalReturn, true)}</td>
    </tr>`;
  }).join('');

  // Totals footer
  const totalCost   = open.reduce((s, p) => s + p.avgCost * p.remainingShares, 0);
  const totalMkt    = open.reduce((s, p) => s + (p.marketValue || 0), 0);
  const totalUPnL   = open.reduce((s, p) => s + (p.unrealizedPnL || 0), 0);
  const totalDiv    = open.reduce((s, p) => s + p.divReceived, 0);
  const totalRet    = open.reduce((s, p) => s + p.totalReturn, 0);
  const totalUPct   = totalCost > 0 ? totalUPnL / totalCost * 100 : 0;
  tfoot.innerHTML = `<tr style="border-top:2px solid var(--border);background:var(--bg-3)">
    <td colspan="5"><strong class="small">الإجمالي</strong></td>
    <td class="num bold">${formatSAR(totalCost)}</td>
    <td class="num bold text-accent">${formatSAR(totalMkt)}</td>
    <td class="num bold ${totalUPnL>=0?'text-success':'text-danger'}">${formatSAR(totalUPnL,true)}</td>
    <td class="num ${totalUPnL>=0?'text-success':'text-danger'}">${totalUPct.toFixed(2)}%</td>
    <td class="num text-success">${formatSAR(totalDiv)}</td>
    <td class="num bold ${totalRet>=0?'text-success':'text-danger'}">${formatSAR(totalRet,true)}</td>
  </tr>`;
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
      <td class="num ${pnlCls}">${p.realizedPct.toFixed(2)}%</td>
      <td class="num text-success">${p.divReceived > 0 ? formatSAR(p.divReceived) : '—'}</td>
      <td class="num ${retCls} bold">${formatSAR(p.totalReturn, true)}</td>
    </tr>`;
  }).join('');

  const totalBuyCost   = closed.reduce((s, p) => s + p.buyCost,      0);
  const totalSellRev   = closed.reduce((s, p) => s + p.sellRevenue,   0);
  const totalRealPnL   = closed.reduce((s, p) => s + p.realizedPnL,   0);
  const totalDiv       = closed.reduce((s, p) => s + p.divReceived,   0);
  const totalRet       = closed.reduce((s, p) => s + p.totalReturn,   0);
  const totalRealPct   = totalBuyCost > 0 ? totalRealPnL / totalBuyCost * 100 : 0;
  tfoot.innerHTML = `<tr style="border-top:2px solid var(--border);background:var(--bg-3)">
    <td colspan="6"><strong class="small">الإجمالي</strong></td>
    <td class="num bold text-muted">${formatSAR(totalBuyCost)}</td>
    <td class="num bold text-accent">${formatSAR(totalSellRev)}</td>
    <td class="num bold ${totalRealPnL>=0?'text-success':'text-danger'}">${formatSAR(totalRealPnL,true)}</td>
    <td class="num ${totalRealPnL>=0?'text-success':'text-danger'}">${totalRealPct.toFixed(2)}%</td>
    <td class="num text-success">${formatSAR(totalDiv)}</td>
    <td class="num bold ${totalRet>=0?'text-success':'text-danger'}">${formatSAR(totalRet,true)}</td>
  </tr>`;
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
    const monthEnd = `${yr}-${String(mo).padStart(2,'0')}-31`;
    const relevantSnaps = _snapshots.filter(s => s.date && s.date <= monthEnd);
    const latestSnap = relevantSnaps.length
      ? relevantSnaps[relevantSnaps.length - 1]
      : null;
    const portfolioValue = latestSnap ? +latestSnap.total_value : null;
    const isAutoSnap     = latestSnap?.notes?.startsWith('auto') || false;

    return { ym, yr, mo, buys, sells, divs, cumulativeCapital, netMove, portfolioValue, isAutoSnap };
  });
}

function renderMonthlyTimeline() {
  const tbody = document.getElementById('timeline-tbody');
  if (!tbody) return;

  const filterYr = document.getElementById('timeline-year-filter')?.value;
  let data = buildMonthlyData();

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

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">📅</div><p>لا توجد بيانات</p></div></td></tr>`;
    return;
  }

  const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  // هل يوجد أي بيانات قيمة المحفظة؟
  const hasPortfolioValues = data.some(r => r.portfolioValue != null);

  // إضافة عمود "قيمة المحفظة" في الـ header إذا وجدت بيانات
  const thead = tbody.closest('table')?.querySelector('thead tr');
  if (thead) {
    const existingValCol = thead.querySelector('.col-portfolio-val');
    if (!existingValCol && hasPortfolioValues) {
      const th = document.createElement('th');
      th.className = 'col-portfolio-val';
      th.title = 'قيمة المحفظة الإجمالية في ذلك الشهر (من net_worth_snapshots)\n✦ = تسجيل تلقائي | ✎ = تسجيل يدوي';
      th.innerHTML = 'قيمة المحفظة <span style="font-size:.65rem;opacity:.6">▲</span>';
      thead.insertBefore(th, thead.children[1]); // بعد عمود الشهر
    }
  }

  tbody.innerHTML = [...data].reverse().map(r => {
    const netCls = r.netMove >= 0 ? 'text-success' : 'text-danger';

    // عمود قيمة المحفظة
    let valCell = '';
    if (hasPortfolioValues) {
      if (r.portfolioValue != null) {
        const icon = r.isAutoSnap ? '✦' : '✎';
        const tip  = r.isAutoSnap
          ? 'تسجيل تلقائي عند فتح الداشبورد'
          : 'تسجيل يدوي من صافي الثروة';
        valCell = `<td class="num text-accent bold" title="${tip}">${formatSAR(r.portfolioValue)} <span class="small text-muted">${icon}</span></td>`;
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
  const data = buildMonthlyData();
  if (!data.length) return;
  if (_monthlyChart) { _monthlyChart.destroy(); _monthlyChart = null; }

  const labels         = data.map(r => r.ym);
  const capital        = data.map(r => r.cumulativeCapital);
  const divs           = data.map(r => r.divs);
  const buys           = data.map(r => r.buys);
  const sells          = data.map(r => r.sells);
  const portfolioVals  = data.map(r => r.portfolioValue);
  const hasPortVals    = portfolioVals.some(v => v != null);

  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 12, usePointStyle: true } },
      tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${formatSAR(c.raw ?? c.parsed?.y ?? 0)}` } }
    },
    scales: {
      x: { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 10 }, maxTicksLimit: 24 }, grid: { color: 'rgba(48,54,61,0.5)' } },
      y: { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, callback: v => fmtShortK(v) }, grid: { color: 'rgba(48,54,61,0.3)' } }
    }
  };

  // ① مدمج — الأصلي (خط رأس المال + أعمدة أرباح + مشتريات، محورين)
  if (_monthlyChartMode === 'combined') {
    _monthlyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'رأس المال المُودَع (تراكمي)', data: capital,       type: 'line', backgroundColor: 'rgba(240,180,41,0.15)', borderColor: '#f0b429', borderWidth: 2, tension: 0.3, fill: true,  pointRadius: 2, yAxisID: 'y',  order: 1 },
          ...(hasPortVals ? [{ label: 'صافي الثروة المُسجَّلة (أسهم + نقد + عقارات)', data: portfolioVals, type: 'line', backgroundColor: 'rgba(59,130,246,0.10)',  borderColor: '#3b82f6', borderWidth: 2, tension: 0.3, fill: false, pointRadius: 3, yAxisID: 'y',  order: 0, borderDash: [5,3], spanGaps: true }] : []),
          { label: 'أرباح موزعة شهرية',           data: divs,          backgroundColor: 'rgba(63,185,80,0.65)',  borderColor: '#3fb950', borderWidth: 1, borderRadius: 3, yAxisID: 'y2', order: 2 },
          { label: 'مشتريات شهرية',               data: buys,          backgroundColor: 'rgba(88,166,255,0.5)', borderColor: '#58a6ff', borderWidth: 1, borderRadius: 3, yAxisID: 'y2', order: 3 },
        ]
      },
      options: {
        ...baseOpts,
        scales: {
          x:  { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 10 }, maxTicksLimit: 24 }, grid: { color: 'rgba(48,54,61,0.5)' } },
          y:  { position: 'right', ticks: { color: '#f0b429', callback: v => fmtShortK(v) }, grid: { color: 'rgba(48,54,61,0.3)' } },
          y2: { position: 'left',  ticks: { color: '#3fb950', callback: v => fmtShortK(v) }, grid: { display: false } },
        }
      }
    });
    return;
  }

  // ② خطوط — كل البيانات كخطوط، محور واحد
  if (_monthlyChartMode === 'lines') {
    _monthlyChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'رأس المال المُودَع (تراكمي)', data: capital, borderColor: '#f0b429', backgroundColor: 'rgba(240,180,41,0.08)', borderWidth: 2.5, pointRadius: 2, tension: 0.3, fill: true },
          { label: 'أرباح موزعة (تراكمية)',       data: data.map((_, i) => divs.slice(0, i+1).reduce((s,v) => s+v, 0)), borderColor: '#3fb950', backgroundColor: 'rgba(63,185,80,0.06)', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true },
          { label: 'مشتريات (تراكمية)',            data: data.map((_, i) => buys.slice(0, i+1).reduce((s,v) => s+v, 0)), borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,0.05)', borderWidth: 1.5, pointRadius: 1, tension: 0.3, fill: false, borderDash: [4,3] },
        ]
      },
      options: baseOpts
    });
    return;
  }

  // ③ مكدس — أعمدة مكدسة: أرباح + مشتريات + مبيعات لكل شهر
  if (_monthlyChartMode === 'stacked') {
    _monthlyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'مشتريات',  data: buys,  backgroundColor: 'rgba(88,166,255,0.75)', borderColor: '#58a6ff', borderWidth: 1, borderRadius: 2 },
          { label: 'أرباح',    data: divs,  backgroundColor: 'rgba(63,185,80,0.75)',  borderColor: '#3fb950', borderWidth: 1, borderRadius: 2 },
          { label: 'مبيعات',   data: sells, backgroundColor: 'rgba(248,81,73,0.65)',  borderColor: '#f85149', borderWidth: 1, borderRadius: 2 },
        ]
      },
      options: {
        ...baseOpts,
        scales: {
          x: { stacked: true, ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 10 }, maxTicksLimit: 24 }, grid: { color: 'rgba(48,54,61,0.5)' } },
          y: { stacked: true, ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, callback: v => fmtShortK(v) }, grid: { color: 'rgba(48,54,61,0.3)' } }
        }
      }
    });
    return;
  }

  // ④ أرباح فقط — تركيز كامل على الدخل الموزع شهرياً
  if (_monthlyChartMode === 'divonly') {
    const maxDiv    = Math.max(...divs);
    const barColors = divs.map(v => v >= maxDiv * 0.8 ? 'rgba(63,185,80,0.9)' : v > 0 ? 'rgba(63,185,80,0.55)' : 'rgba(255,255,255,0.07)');
    const cumDiv    = data.map((_, i) => divs.slice(0, i+1).reduce((s,v) => s+v, 0));
    _monthlyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'أرباح الشهر',        data: divs,   backgroundColor: barColors, borderColor: barColors.map(c => c.replace('0.9','1').replace('0.55','0.8')), borderWidth: 1, borderRadius: 4, yAxisID: 'y' },
          { label: 'الأرباح التراكمية',  data: cumDiv, type: 'line', borderColor: '#f0b429', backgroundColor: 'rgba(240,180,41,0.1)', borderWidth: 2, pointRadius: 2, tension: 0.4, fill: false, yAxisID: 'y2', order: 0 },
        ]
      },
      options: {
        ...baseOpts,
        scales: {
          x:  { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 10 }, maxTicksLimit: 24 }, grid: { color: 'rgba(48,54,61,0.5)' } },
          y:  { position: 'left',  ticks: { color: '#3fb950', font: { family: 'Tajawal', size: 11 }, callback: v => fmtShortK(v) }, grid: { color: 'rgba(48,54,61,0.3)' } },
          y2: { position: 'right', ticks: { color: '#f0b429', font: { family: 'Tajawal', size: 11 }, callback: v => fmtShortK(v) }, grid: { display: false } },
        }
      }
    });
  }
}

// ── CSV export ────────────────────────────────────────────────────────
function exportPerformanceCSV() {
  const { open, closed } = getPositionData();
  const BOM = '﻿';
  const lines = [];
  lines.push('== مراكز مفتوحة ==');
  lines.push(['الرمز','الاسم','الأسهم','متوسط التكلفة','السعر الحالي','تكلفة كلية','قيمة سوقية','ر/خ غير محقق','%','أرباح مستلمة','إجمالي العائد'].join(','));
  open.forEach(p => lines.push([
    p.ticker, p.name, p.remainingShares, p.avgCost.toFixed(4),
    p.currentPrice?.toFixed(4) || '', (p.avgCost*p.remainingShares).toFixed(2),
    p.marketValue?.toFixed(2)  || '', p.unrealizedPnL?.toFixed(2)  || '',
    p.unrealizedPct?.toFixed(2)+'%' || '', p.divReceived.toFixed(2), p.totalReturn.toFixed(2)
  ].join(',')));
  lines.push('');
  lines.push('== مراكز مغلقة ==');
  lines.push(['الرمز','الاسم','فتح','إغلاق','أيام','تكلفة الشراء','عائد البيع','ر/خ محقق','%','أرباح','إجمالي'].join(','));
  closed.forEach(p => lines.push([
    p.ticker, p.name, p.firstBuyDate||'', p.lastSellDate||'', p.holdDays||'',
    p.buyCost.toFixed(2), p.sellRevenue.toFixed(2), p.realizedPnL.toFixed(2),
    p.realizedPct.toFixed(2)+'%', p.divReceived.toFixed(2), p.totalReturn.toFixed(2)
  ].join(',')));

  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `أداء_${todayISO()}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('✓ تم التصدير', 'success');
}

// ── Helpers ────────────────────────────────────────────────────────────
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
function fmtN(n)       { return n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 }); }
function fmtShortK(v)  { if (v >= 1e6) return (v/1e6).toFixed(1)+'M'; if (v >= 1e3) return (v/1e3).toFixed(0)+'K'; return v; }

// ══════════════════════════════════════════════════════════════
// 📊 مقارنة بالمؤشر (TASI Benchmark)
// مقارنة أداء محفظتك منسوباً بأداء مؤشر تاسي — كلاهما = 100 عند أول نقطة
// البيانات: TASI مُدخلة يدوياً ← localStorage 'tharwa-benchmark_v1'
//           المحفظة ← net_worth_snapshots (auto-captured من الداشبورد)
// ══════════════════════════════════════════════════════════════

const BM_KEY = 'tharwa-benchmark_v1';
let _bmChart = null;

// ── تحميل وحفظ بيانات التاسي ─────────────────────────────────
function _loadBenchmark() {
  try { return JSON.parse(localStorage.getItem(BM_KEY)) || []; } catch { return []; }
}
function _saveBenchmark(entries) {
  localStorage.setItem(BM_KEY, JSON.stringify(entries));
}

// ── إضافة نقطة جديدة ─────────────────────────────────────────
function addBenchmarkEntry() {
  const date  = document.getElementById('bm-date')?.value?.trim();
  const value = parseFloat(document.getElementById('bm-value')?.value);

  if (!date)          { showToast('أدخل التاريخ', 'error'); return; }
  if (isNaN(value) || value <= 0) { showToast('أدخل قيمة صحيحة لمؤشر تاسي', 'error'); return; }

  const entries = _loadBenchmark();
  const existing = entries.findIndex(e => e.date === date);
  if (existing >= 0) {
    // تحديث القيمة الموجودة لنفس التاريخ
    entries[existing].value = value;
    showToast('تم تحديث قيمة هذا التاريخ', 'success');
  } else {
    entries.push({ date, value });
    showToast('تمت الإضافة ✓', 'success');
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  _saveBenchmark(entries);

  if (document.getElementById('bm-date'))  document.getElementById('bm-date').value  = '';
  if (document.getElementById('bm-value')) document.getElementById('bm-value').value = '';

  renderBenchmarkTab();
}

// ── حذف نقطة ─────────────────────────────────────────────────
function deleteBenchmarkEntry(date) {
  const entries = _loadBenchmark().filter(e => e.date !== date);
  _saveBenchmark(entries);
  renderBenchmarkTab();
}

// ── حذف الكل ─────────────────────────────────────────────────
function clearAllBenchmark() {
  if (!confirm('حذف جميع بيانات تاسي المدخلة؟')) return;
  _saveBenchmark([]);
  renderBenchmarkTab();
  showToast('تم المسح', 'success');
}

// ── Time-Weighted Return (TWR) ────────────────────────────────
// يحسب العائد المُعدَّل بالزمن بمعزل عن الإيداعات والسحوبات
// المعيار الدولي (GIPS) لمقارنة أداء المحافظ ببعضها أو بمؤشر
// الخوارزمية: Modified Dietz لكل فترة بين لقطتين → تجميع مضروب
// يُبقي آخر لقطة فقط لكل يوم — يُزيل تكرارات نفس اليوم التي تُشوّه TWR
function _deduplicateSnapsByDay(snapshots) {
  const byDate = {};
  for (const s of snapshots) {
    // نفضّل اللقطات اليدوية على التلقائية عند التعادل
    const existing = byDate[s.date];
    if (!existing) { byDate[s.date] = s; continue; }
    const isManual    = s.notes      && !s.notes.startsWith('auto');
    const wasManual   = existing.notes && !existing.notes.startsWith('auto');
    if (isManual && !wasManual) { byDate[s.date] = s; continue; }
    if (!wasManual && !isManual) byDate[s.date] = s; // keep latest
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

function _computeTWR(snapshots, cashflows) {
  // خطوة أولى: نُحافظ على لقطة واحدة فقط لكل يوم لتجنب تشويه الحسابات
  const sorted = _deduplicateSnapsByDay(snapshots);
  if (!sorted.length) return { twrMap: {}, sortedSnaps: sorted };

  const cfs = cashflows.slice().sort((a, b) => a.date.localeCompare(b.date));
  const twrMap = {};
  let factor = 1.0;
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
    }
    twrMap[sorted[i].date] = +(factor * 100).toFixed(3);
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

// ── رسم التبويب كاملاً ────────────────────────────────────────
function renderBenchmarkTab() {
  const bmEntries = _loadBenchmark();  // [{ date, value }] مرتبة
  const snapshots = [..._snapshots].sort((a, b) => a.date.localeCompare(b.date));

  // ── جدول بيانات تاسي ─────────────────────────────────────
  const entriesWrap  = document.getElementById('bm-entries-wrap');
  const entriesTbody = document.getElementById('bm-entries-tbody');
  const entriesCount = document.getElementById('bm-entries-count');
  if (entriesCount) entriesCount.textContent = bmEntries.length ? `(${bmEntries.length} نقطة)` : '';
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
        return `<tr>
          <td>${formatDate(e.date)}</td>
          <td class="num bold">${e.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
          ${changeTd}
          <td><button class="btn btn-danger btn-sm" onclick="deleteBenchmarkEntry('${esc(e.date)}')">✕</button></td>
        </tr>`;
      }).join('');
    } else {
      if (entriesWrap) entriesWrap.style.display = 'none';
    }
  }

  // ── ابنِ بيانات الرسم ─────────────────────────────────────
  // نحتاج: أول تاريخ مشترك بين الـ snapshots والـ bmEntries
  const chartWrap = document.getElementById('bm-chart-wrap');
  const emptyEl   = document.getElementById('bm-empty');
  const summaryEl = document.getElementById('bm-summary');

  if (bmEntries.length < 2 || snapshots.length < 2) {
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
    ...snapshots.map(s => s.date),
  ])].sort();

  // دالة مساعدة: قيمة تاسي عند تاريخ معين (أقرب نقطة سابقة أو مطابقة)
  const getTasiAt = (date) => {
    const prior = bmEntries.filter(e => e.date <= date);
    return prior.length ? prior[prior.length - 1].value : null;
  };

  // دالة مساعدة: قيمة المحفظة عند تاريخ معين (أقرب snapshot سابق أو مطابق)
  const getPortAt = (date) => {
    const prior = snapshots.filter(s => s.date <= date);
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

  // ── حساب TWR للمحفظة ────────────────────────────────────
  // نستخدم _cf (cashflow_entries) المُحمَّل في init() لتصحيح الإيداعات
  const { twrMap, sortedSnaps, suspiciousPeriods } = _computeTWR(snapshots, _cf || []);

  const getTwrAt = (date) => {
    const prior = sortedSnaps.filter(s => s.date <= date);
    if (!prior.length) return null;
    return twrMap[prior[prior.length - 1].date] ?? null;
  };

  // ── تطبيع الى 100 عند أول نقطة مشتركة ──────────────────
  const base      = points[0];
  const tasiBase  = base.tasi;
  const baseTwr   = getTwrAt(base.date) ?? 100;

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

  _bmChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label:           'محفظتك (TWR)',
          data:            portNorm,
          borderColor:     '#3fb950',
          backgroundColor: 'rgba(63,185,80,0.10)',
          borderWidth:     2.5,
          pointRadius:     3,
          pointHoverRadius: 6,
          tension:         0.35,
          fill:            true,
        },
        {
          label:           'مؤشر تاسي',
          data:            tasiNorm,
          borderColor:     '#58a6ff',
          backgroundColor: 'rgba(88,166,255,0.06)',
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
          borderColor:     'rgba(139,148,158,0.3)',
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
          labels: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 14, usePointStyle: true },
        },
        tooltip: {
          rtl: true,
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
          ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 10 }, maxTicksLimit: 14 },
          grid:  { color: 'rgba(48,54,61,0.5)' },
        },
        y: {
          ticks: {
            color: '#8b949e',
            font:  { family: 'Tajawal', size: 11 },
            callback: v => v + '',
          },
          grid:  { color: 'rgba(48,54,61,0.3)' },
        },
      },
    },
  });

  // ── ملخص الأداء ──────────────────────────────────────────
  const lastPort  = portNorm[portNorm.length - 1];
  const lastTasi  = tasiNorm[tasiNorm.length - 1];
  const portDelta = lastPort - 100;
  const tasiDelta = lastTasi - 100;
  const alpha     = portDelta - tasiDelta;   // الزيادة على تاسي (Alpha)
  const betterThan = alpha > 0;

  const fmtPct = (v, sign = true) =>
    `${sign && v > 0 ? '+' : ''}${v.toFixed(2)}%`;

  const alphaColor  = alpha >= 0 ? '#3fb950' : '#f85149';
  const portColor   = portDelta >= 0 ? '#3fb950' : '#f85149';
  const tasiColor   = tasiDelta >= 0 ? '#3fb950' : '#f85149';
  const periodLabel = `${formatDate(points[0].date)} — ${formatDate(points[points.length - 1].date)}`;

  if (summaryEl) {
    summaryEl.style.display = '';
    summaryEl.innerHTML = `
      <div style="
        display:flex;flex-wrap:wrap;gap:12px;
        background:var(--bg-3);border:1px solid var(--border);
        border-radius:var(--radius);padding:14px 16px;margin-bottom:12px
      ">
        <div style="flex:1;min-width:140px">
          <div class="small text-muted">عائد محفظتك</div>
          <div class="num bold" style="font-size:1.2rem;color:${portColor}">${fmtPct(portDelta)}</div>
          <div class="small text-muted">${periodLabel}</div>
        </div>
        <div style="flex:1;min-width:140px">
          <div class="small text-muted">عائد تاسي</div>
          <div class="num bold" style="font-size:1.2rem;color:${tasiColor}">${fmtPct(tasiDelta)}</div>
          <div class="small text-muted">نفس الفترة</div>
        </div>
        <div style="flex:1;min-width:140px;border-right:2px solid var(--border);padding-right:12px">
          <div class="small text-muted">الأداء الزائد (Alpha)</div>
          <div class="num bold" style="font-size:1.3rem;color:${alphaColor}">${fmtPct(alpha)}</div>
          <div class="small" style="color:${alphaColor};font-weight:600">
            ${betterThan ? '✅ محفظتك تتفوق على تاسي' : '⚠️ تاسي يتفوق على محفظتك'}
          </div>
        </div>
        <div style="flex:1;min-width:140px">
          <div class="small text-muted">عدد نقاط المقارنة</div>
          <div class="num bold" style="font-size:1.2rem">${points.length}</div>
          <div class="small text-muted">${bmEntries.length} نقطة تاسي · ${snapshots.length} لقطة محفظة</div>
        </div>
      </div>
      <p class="small text-muted">
        📌 عائد محفظتك محسوب بطريقة <strong>TWR (Time-Weighted Return)</strong> — يُزيل أثر الإيداعات والسحوبات لعزل أداء قراراتك الاستثمارية فقط.
        مؤشر تاسي مُدخَّل يدوياً. كلاهما مُنسَّب إلى 100 عند <strong>${formatDate(points[0].date)}</strong>.
      </p>
      <p class="small" style="color:var(--warning,#f0b429);background:rgba(240,180,41,.08);border:1px solid rgba(240,180,41,.25);border-radius:6px;padding:8px 10px;margin-top:6px">
        ⚠️ <strong>ملاحظة منهجية:</strong> المقارنة هنا مع <strong>تاسي السعري</strong> (Price Index) الذي لا يشمل إعادة استثمار التوزيعات.
        مؤشر تاسي للعائد الإجمالي (TRI) يكون أعلى بـ ~3-4% سنوياً. Alpha الحقيقي = عائد محفظتك − TRI.
      </p>
      ${suspiciousPeriods.length ? `
      <div style="margin-top:10px;padding:10px 12px;background:rgba(248,81,73,.06);border:1px solid rgba(248,81,73,.25);border-radius:8px">
        <div class="small" style="color:#f85149;font-weight:700;margin-bottom:8px">
          🔍 ${suspiciousPeriods.length} فترة بها تغيّر كبير غير مُفسَّر — قد تُشوّه الـ TWR
        </div>
        <div class="small text-muted" style="margin-bottom:6px">
          السبب الأكثر شيوعاً: إيداع أو سحب لم يُسجَّل في <strong>صفحة التدفقات النقدية</strong>.
          سجّل هذه الحركات لتصحيح الحساب تلقائياً.
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:.78rem">
          <thead>
            <tr style="color:var(--text-muted)">
              <th style="text-align:right;padding:3px 6px">الفترة</th>
              <th style="text-align:right;padding:3px 6px">التغيّر</th>
              <th style="text-align:right;padding:3px 6px">التدفق المسجَّل</th>
              <th style="text-align:right;padding:3px 6px">قيمة البداية</th>
              <th style="text-align:right;padding:3px 6px">قيمة النهاية</th>
            </tr>
          </thead>
          <tbody>
            ${suspiciousPeriods.map(p => `
            <tr style="border-top:1px solid var(--border)">
              <td style="padding:4px 6px">${formatDate(p.startDate)} ← ${formatDate(p.endDate)}</td>
              <td style="padding:4px 6px;font-weight:700;color:${p.r >= 0 ? '#3fb950' : '#f85149'}">${p.r >= 0 ? '+' : ''}${p.r}%</td>
              <td style="padding:4px 6px;color:var(--text-muted)">${p.netCF !== 0 ? formatSAR(p.netCF, true) : '—'}</td>
              <td style="padding:4px 6px">${formatSAR(p.startVal)}</td>
              <td style="padding:4px 6px">${formatSAR(p.endVal)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}
      `;
  }
}

// ── معلومات الاستخدام ─────────────────────────────────────────
function showBenchmarkInfo() {
  alert([
    '📊 مقارنة محفظتك بمؤشر تاسي',
    '',
    'كيف تعمل؟',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '• كلا الخطين مُنسَّبان إلى 100 عند أول نقطة مشتركة',
    '• الفرق = Alpha (أداؤك الزائد/الناقص عن السوق)',
    '',
    'استيراد CSV:',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '• الصيغة المقبولة: Date,OPEN,CLOSE  أو  Date,CLOSE',
    '• التاريخ: MM/DD/YYYY  أو  YYYY-MM-DD',
    '• الأرقام يمكن أن تحتوي فواصل (مثل "10,991.09")',
    '• الاستيراد يدمج مع الموجود (upsert بالتاريخ)',
    '',
    'تصدير CSV:',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '• ينتج ملف بنفس الصيغة يمكن استيراده مستقبلاً',
    '',
    'المحفظة:',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '• مصدرها net_worth_snapshots (من الداشبورد)',
    '• الداشبورد يسجّل لقطة تلقائياً كل شهر',
  ].join('\n'));
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
function _mergeBenchmark(newEntries) {
  const map = {};
  _loadBenchmark().forEach(e => { map[e.date] = e.value; });
  newEntries.forEach(e => { map[e.date] = e.value; });   // الجديد يُغلّب القديم
  const merged = Object.entries(map)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  _saveBenchmark(merged);
  return merged.length;
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
      const total = _mergeBenchmark(parsed);
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

function initBenchmarkTab() {
  const dateInp = document.getElementById('bm-date');
  if (dateInp && !dateInp.value) dateInp.value = todayISO();

  // auto-seed: استورد بيانات تاسي التاريخية مرة واحدة فقط (إذا لم تُفعَّل من قبل)
  if (!localStorage.getItem(BM_SEEDED_KEY)) {
    const total = _mergeBenchmark(TASI_SEED);
    localStorage.setItem(BM_SEEDED_KEY, '1');
    showToast(`✓ تم تحميل ${TASI_SEED.length} إغلاق أسبوعي لتاسي تلقائياً (${TASI_SEED[0].date} → ${TASI_SEED[TASI_SEED.length-1].date})`, 'success');
  }

  renderBenchmarkTab();
}

init();
