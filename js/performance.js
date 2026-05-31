/* =====================================================================
   performance.js — الأداء التاريخي
   سجل تدقيق كامل: مراكز مفتوحة / مغلقة / تايم لاين شهري
   ===================================================================== */

'use strict';

let _tx       = [];
let _holdings = [];
let _divs     = [];
let _cf       = [];   // cashflow_entries — للرأسمال التراكمي الفعلي
let _monthlyChart     = null;
let _activeTab        = 'open';
let _monthlyChartMode = 'combined'; // 'combined' | 'lines' | 'stacked' | 'divonly'

// ── Init ──────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-performance');

  const [rTx, rH, rDiv, rCf] = await Promise.all([
    supabaseClient.from('transactions').select('*').eq('is_archived', false).order('date'),
    supabaseClient.from('holdings').select('*'),
    supabaseClient.from('dividends').select('*').eq('is_archived', false).order('date'),
    supabaseClient.from('cashflow_entries').select('date,type,amount').eq('is_archived', false).order('date'),
  ]);

  _tx       = rTx.data   || [];
  _holdings = rH.data    || [];
  _divs     = rDiv.data  || [];
  _cf       = rCf.data   || [];

  renderKPIs();
  renderOpenPositions();
  renderClosedPositions();
  renderMonthlyTimeline();
  renderMonthlyChart();
}

// ── Tab switcher ──────────────────────────────────────────────────────
function showPerfTab(tab) {
  _activeTab = tab;
  ['open','closed','timeline','monthly-chart'].forEach(t => {
    const view = document.getElementById(`pview-${t}`);
    const btn  = document.getElementById(`ptab-${t}`);
    if (view) view.style.display = t === tab ? '' : 'none';
    if (btn)  btn.classList.toggle('active', t === tab);
  });
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
    p.avgCost      = h ? +h.avg_price : (p.buyShares > 0 ? p.buyCost / p.buyShares : 0);

    if (remaining <= 0.001) {
      // مغلق بالكامل
      const realizedPnL = p.sellRevenue - p.buyCost;
      p.realizedPnL  = realizedPnL;
      p.realizedPct  = p.buyCost > 0 ? realizedPnL / p.buyCost * 100 : 0;
      p.totalReturn  = realizedPnL + p.divReceived;
      p.totalReturnPct = p.buyCost > 0 ? p.totalReturn / p.buyCost * 100 : 0;
      // مدة الاحتفاظ
      if (p.firstBuyDate && p.lastSellDate) {
        const days = Math.floor((new Date(p.lastSellDate) - new Date(p.firstBuyDate)) / 86400000);
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
  const { open, closed } = buildPositionData();
  const totalUnreal  = open.reduce((s, p) => s + (p.unrealizedPnL || 0), 0);
  const totalReal    = closed.reduce((s, p) => s + (p.realizedPnL  || 0), 0) +
                       open.reduce((s, p) => s + (p.partialRealizedPnL || 0), 0);

  setText('pk-open',       open.length + ' سهم');
  setText('pk-closed',     closed.length + ' صفقة');
  const rpEl = document.getElementById('pk-realized');
  if (rpEl) { rpEl.textContent = formatSAR(totalReal, true); rpEl.className = 'value num ' + (totalReal >= 0 ? 'text-success' : 'text-danger'); }
  const urEl = document.getElementById('pk-unrealized');
  if (urEl) { urEl.textContent = formatSAR(totalUnreal, true); urEl.className = 'value num ' + (totalUnreal >= 0 ? 'text-success' : 'text-danger'); }
}

// ── Open positions table ──────────────────────────────────────────────
function renderOpenPositions() {
  const { open } = buildPositionData();
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
  const { closed } = buildPositionData();
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

// رأس المال المُودَع التراكمي حتى نهاية الشهر — مأخوذ من cashflow_entries مباشرةً
// (إيداعات تراكمية − سحوبات تراكمية) → يطابق صفحة التدفقات النقدية دائماً
function calcCumulativeCapital(cutoffYr, cutoffMo) {
  let total = 0;
  _cf.forEach(e => {
    if (!e.date) return;
    const d = new Date(e.date);
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

  return months.map(ym => {
    const [yr, mo] = ym.split('-').map(Number);

    const monthTx  = _tx.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return d.getFullYear() === yr && d.getMonth() + 1 === mo;
    });

    const monthDiv = _divs.filter(d => {
      if (!d.date) return false;
      const dt = new Date(d.date);
      return dt.getFullYear() === yr && dt.getMonth() + 1 === mo;
    });

    const buys  = monthTx.filter(t => t.type === 'buy' || t.type === 'grant').reduce((s,t) => s + +t.total, 0);
    const sells = monthTx.filter(t => t.type === 'sell').reduce((s,t) => s + +t.total, 0);
    const divs  = monthDiv.reduce((s,d) => s + +d.amount, 0);
    const netMove = buys - sells;

    // رأس المال المُودَع التراكمي = إيداعات − سحوبات من cashflow_entries حتى نهاية الشهر
    const cumulativeCapital = calcCumulativeCapital(yr, mo);

    return { ym, yr, mo, buys, sells, divs, cumulativeCapital, netMove };
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

  tbody.innerHTML = [...data].reverse().map(r => {
    const netCls = r.netMove >= 0 ? 'text-success' : 'text-danger';
    return `<tr>
      <td><strong>${MONTHS_AR[r.mo-1]} ${r.yr}</strong></td>
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

  const labels   = data.map(r => r.ym);
  const capital  = data.map(r => r.cumulativeCapital);
  const divs     = data.map(r => r.divs);
  const buys     = data.map(r => r.buys);
  const sells    = data.map(r => r.sells);

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
          { label: 'رأس المال المُودَع (تراكمي)', data: capital, type: 'line', backgroundColor: 'rgba(240,180,41,0.15)', borderColor: '#f0b429', borderWidth: 2, tension: 0.3, fill: true, pointRadius: 2, yAxisID: 'y', order: 1 },
          { label: 'أرباح موزعة شهرية',           data: divs,    backgroundColor: 'rgba(63,185,80,0.65)',  borderColor: '#3fb950', borderWidth: 1, borderRadius: 3, yAxisID: 'y2', order: 2 },
          { label: 'مشتريات شهرية',               data: buys,    backgroundColor: 'rgba(88,166,255,0.5)', borderColor: '#58a6ff', borderWidth: 1, borderRadius: 3, yAxisID: 'y2', order: 3 },
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
  const { open, closed } = buildPositionData();
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

init();
