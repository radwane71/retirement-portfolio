let dividends    = [];
let txBuyRows    = [];   // {date, ticker, total} — buy transactions only
let selectedYear = 'all';

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

  await loadData();
  renderAll();
}

async function loadData() {
  const [rDiv, rTx] = await Promise.all([
    supabaseClient.from('dividends').select('*').order('date', { ascending: false }),
    supabaseClient.from('transactions').select('date, ticker, total, type').eq('type', 'buy')
  ]);
  if (rDiv.error) { showToast('خطأ في تحميل الأرباح', 'error'); return; }
  dividends  = rDiv.data || [];
  txBuyRows  = rTx.data  || [];
}

async function loadDividends() {
  await loadData();
}

function renderAll() {
  renderSummaries();
  renderTable();
}

// ══════════════════════════════════════════════════════════════
// بناء خرائط التكلفة من سجل المعاملات
// ══════════════════════════════════════════════════════════════
function buildCostMaps() {
  // yearBuyCost:       { '2025': 150000, ... }
  // tickerYearCost:    { '2222': { '2025': 50000, 'all': 80000 }, ... }
  const yearBuyCost    = {};
  const tickerYearCost = {};

  txBuyRows.forEach(tx => {
    const yr     = String(new Date(tx.date).getFullYear());
    const ticker = String(tx.ticker);
    const total  = +tx.total || 0;

    yearBuyCost[yr] = (yearBuyCost[yr] || 0) + total;

    if (!tickerYearCost[ticker]) tickerYearCost[ticker] = { all: 0 };
    tickerYearCost[ticker][yr]  = (tickerYearCost[ticker][yr]  || 0) + total;
    tickerYearCost[ticker].all  = (tickerYearCost[ticker].all  || 0) + total;
  });

  // حساب 'all' لكل السنوات
  yearBuyCost.all = Object.entries(yearBuyCost)
    .filter(([k]) => k !== 'all')
    .reduce((s, [, v]) => s + v, 0);

  return { yearBuyCost, tickerYearCost };
}

// ══════════════════════════════════════════════════════════════
// رسم الملخصات
// ══════════════════════════════════════════════════════════════
function renderSummaries() {
  const { yearBuyCost, tickerYearCost } = buildCostMaps();

  renderYearlySummary(yearBuyCost);
  renderHoldingSummary(tickerYearCost);
}

// ── اليمين: الإجمالي السنوي ───────────────────────────────────
function renderYearlySummary(yearBuyCost) {
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

  yEl.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr>
      <th>السنة</th>
      <th>إجمالي الأرباح</th>
      <th title="الأرباح ÷ تكلفة شراء الأسهم في تلك السنة">نسبة العائد %</th>
    </tr></thead>
    <tbody>${years.map(y => {
      const buyCost = yearBuyCost[y] || 0;
      let yieldStr, yieldCls;
      if (buyCost > 0) {
        const pct = (yearMap[y] / buyCost * 100);
        yieldStr = pct.toFixed(2) + '%';
        yieldCls = 'text-accent';
      } else {
        yieldStr = '—';
        yieldCls = 'text-muted';
      }
      return `<tr>
        <td><strong>${y}</strong></td>
        <td class="num text-success bold">${formatSAR(yearMap[y])}</td>
        <td class="num ${yieldCls}">${yieldStr}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>
  <p class="small text-muted mt-2" style="padding:0 4px">
    * نسبة العائد = إجمالي الأرباح ÷ تكلفة الأسهم المشتراة (buy) في نفس السنة من سجل المعاملات
  </p>`;
}

// ── اليسار: لكل سهم مع فلتر السنة ───────────────────────────
function renderHoldingSummary(tickerYearCost) {
  // جمع الأرباح لكل سهم لكل سنة
  const holdMap = {};
  dividends.forEach(d => {
    if (!holdMap[d.ticker]) holdMap[d.ticker] = { name: d.name, total: 0, byYear: {} };
    holdMap[d.ticker].total += +d.amount;
    const yr = String(d.year);
    holdMap[d.ticker].byYear[yr] = (holdMap[d.ticker].byYear[yr] || 0) + +d.amount;
  });

  // السنوات المتاحة (من الأرباح أو المعاملات، مدمجة)
  const divYears = [...new Set(dividends.map(d => String(d.year)))];
  const txYears  = [...new Set(txBuyRows.map(tx => String(new Date(tx.date).getFullYear())))];
  const allYears = [...new Set([...divYears, ...txYears])].sort((a, b) => b - a);

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
    let divAmt, buyCost;

    if (selectedYear === 'all') {
      divAmt  = h.total;
      buyCost = tickerYearCost[ticker]?.all || 0;
    } else {
      divAmt  = h.byYear[selectedYear] || 0;
      buyCost = tickerYearCost[ticker]?.[selectedYear] || 0;
    }

    // نسبة العائد
    let yieldStr = '—', yieldCls = 'text-muted';
    if (buyCost > 0 && divAmt > 0) {
      const pct = divAmt / buyCost * 100;
      yieldStr = pct.toFixed(2) + '%';
      yieldCls = 'text-accent';
    } else if (divAmt === 0) {
      yieldStr = '—';
      yieldCls = 'text-muted';
    }

    // نسبة من الكل — تحسب نسبة هذا السهم من إجمالي أرباح السنة المختارة
    let yearTotal;
    if (selectedYear === 'all') {
      yearTotal = grandTotal;
    } else {
      yearTotal = dividends.filter(d => String(d.year) === selectedYear)
        .reduce((s, d) => s + +d.amount, 0);
    }
    const pctOfAll = yearTotal > 0 && divAmt > 0
      ? (divAmt / yearTotal * 100).toFixed(1) + '%'
      : '—';

    return { ticker, name: h.name, divAmt, buyCost, yieldStr, yieldCls, pctOfAll };
  }).filter(r => selectedYear === 'all' || r.divAmt > 0);

  // الإجماليات للسنة المختارة
  const yearDivTotal  = selectedYear === 'all'
    ? grandTotal
    : dividends.filter(d => String(d.year) === selectedYear).reduce((s,d) => s + +d.amount, 0);
  const yearBuyTotal  = selectedYear === 'all'
    ? (tickerYearCost['__all__'] || Object.values(tickerYearCost).reduce((s, v) => s + (v.all||0), 0))
    : txBuyRows.filter(tx => String(new Date(tx.date).getFullYear()) === selectedYear)
        .reduce((s, tx) => s + (+tx.total||0), 0);
  const totalYield = yearBuyTotal > 0 && yearDivTotal > 0
    ? (yearDivTotal / yearBuyTotal * 100).toFixed(2) + '%'
    : '—';

  const yearLabel = selectedYear === 'all' ? 'الكل' : selectedYear;

  hEl.innerHTML = tabsHtml + `
    <div class="table-wrapper"><table>
      <thead><tr>
        <th>الرمز</th>
        <th>الاسم</th>
        <th>الأرباح${selectedYear!=='all'?' '+selectedYear:''}</th>
        <th title="تكلفة شراء السهم من سجل المعاملات">التكلفة (buy)</th>
        <th title="الأرباح ÷ تكلفة الشراء">نسبة العائد %</th>
        <th title="نسبة أرباح هذا السهم من إجمالي أرباح الفترة">من الكل</th>
      </tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr>
        <td><strong class="text-accent">${esc(r.ticker)}</strong></td>
        <td>${esc(r.name)}</td>
        <td class="num text-success bold">${formatSAR(r.divAmt)}</td>
        <td class="num text-muted">${r.buyCost > 0 ? formatSAR(r.buyCost) : '—'}</td>
        <td class="num ${r.yieldCls}">${r.yieldStr}</td>
        <td class="num text-muted">${r.pctOfAll}</td>
      </tr>`).join('') : `<tr><td colspan="6" class="text-center text-muted small" style="padding:20px">
        لا توجد أرباح مسجلة لسنة ${yearLabel}
      </td></tr>`}</tbody>
      <tfoot><tr style="border-top:2px solid var(--border)">
        <td colspan="2"><strong>إجمالي ${yearLabel}</strong></td>
        <td class="num bold text-accent">${formatSAR(yearDivTotal)}</td>
        <td class="num text-muted">${yearBuyTotal > 0 ? formatSAR(yearBuyTotal) : '—'}</td>
        <td class="num bold text-accent">${totalYield}</td>
        <td class="num text-muted">100%</td>
      </tr></tfoot>
    </table></div>
    <p class="small text-muted mt-2" style="padding:0 4px">
      * نسبة العائد = أرباح الفترة ÷ تكلفة الشراء (buy) في نفس الفترة من سجل المعاملات
    </p>`;
}

function switchDivYear(yr) {
  selectedYear = yr;
  const { tickerYearCost } = buildCostMaps();
  renderHoldingSummary(tickerYearCost);
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
    <td><button class="btn btn-danger btn-sm" onclick="deleteDiv('${esc(d.id)}')">حذف</button></td>
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
  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id: user.id,
    date:    document.getElementById('d-date').value,
    ticker:  document.getElementById('d-ticker').value.trim().toUpperCase(),
    name:    document.getElementById('d-name').value.trim(),
    amount:  +document.getElementById('d-amount').value,
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

async function deleteDiv(id) {
  if (!confirm('هل أنت متأكد من الحذف؟')) return;
  const { error } = await supabaseClient.from('dividends').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await loadData();
  renderAll();
}

init();
