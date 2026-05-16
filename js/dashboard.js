let holdings   = [];
let sectorChart = null;
let weightChart = null;
let editingId   = null;

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

// ── Init ──────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-dashboard');
  await loadAllData();
  renderStats();
  renderCharts();
  renderTable();
}

// ── Data ──────────────────────────────────────────────────────
async function loadAllData() {
  const yr = new Date().getFullYear();

  const [rH, rTx, rDiv, rCf, rNw, rRe] = await Promise.all([
    supabaseClient.from('holdings').select('*').order('ticker'),
    supabaseClient.from('transactions').select('type, total'),
    supabaseClient.from('dividends').select('amount, year'),
    supabaseClient.from('cash_flows').select('planned_amount, actual_amount').eq('year', yr).maybeSingle(),
    supabaseClient.from('net_worth_snapshots').select('total_value, date').order('date', { ascending: false }).limit(1),
    supabaseClient.from('real_estate').select('current_value, status')
  ]);

  holdings = rH.data || [];

  const txRows  = rTx.data  || [];
  const divRows = rDiv.data || [];
  const cfRow   = rCf.data  || null;
  const nwRows  = rNw.data  || [];
  const reRows  = rRe.data  || [];

  window._ds = {
    yr,
    totalInvested: txRows.filter(t => t.type === 'buy').reduce((s, t) => s + +t.total, 0),
    totalDivAll:   divRows.reduce((s, d) => s + +d.amount, 0),
    yearDiv:       divRows.filter(d => d.year === yr).reduce((s, d) => s + +d.amount, 0),
    latestNW:      nwRows[0] ? +nwRows[0].total_value : null,
    latestNWDate:  nwRows[0] ? nwRows[0].date : null,
    reTotal:       reRows.filter(p => p.status !== 'sold').reduce((s, p) => s + +p.current_value, 0),
    cashActual:    cfRow ? +cfRow.actual_amount  : 0,
    cashPlanned:   cfRow ? +cfRow.planned_amount : 0
  };
}

async function reloadHoldings() {
  const { data } = await supabaseClient.from('holdings').select('*').order('ticker');
  holdings = data || [];
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
  const s          = window._ds || {};
  const totalValue = holdings.reduce((a, h) => a + h.shares * h.current_price, 0);
  const costBasis  = holdings.reduce((a, h) => a + h.shares * h.avg_price,     0);
  const pnl        = totalValue - costBasis;
  const pnlPct     = costBasis > 0 ? pnl / costBasis * 100 : 0;

  setText('stat-total-value', formatSAR(totalValue));
  setText('stat-invested',    formatSAR(s.totalInvested || 0));

  const pnlEl    = g('stat-pnl');
  const pnlPctEl = g('stat-pnl-pct');
  if (pnlEl)    { pnlEl.textContent = formatSAR(pnl, true); pnlEl.className = 'value num ' + (pnl >= 0 ? 'text-success' : 'text-danger'); }
  if (pnlPctEl) { pnlPctEl.textContent = (pnl >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%'; pnlPctEl.className = 'sub ' + (pnl >= 0 ? 'text-success' : 'text-danger'); }

  setText('stat-net-worth', s.latestNW != null ? formatSAR(s.latestNW) : '—');
  setText('stat-nw-date',   s.latestNWDate ? formatDate(s.latestNWDate) : 'لا توجد لقطة');

  setText('stat-total-div',   formatSAR(s.totalDivAll || 0));
  setText('stat-year-div',    formatSAR(s.yearDiv     || 0));
  setText('stat-year-label',  'أرباح ' + (s.yr || new Date().getFullYear()));
  setText('stat-realestate',  formatSAR(s.reTotal || 0));
  setText('stat-cash-actual', formatSAR(s.cashActual || 0));

  const cfPct = s.cashPlanned > 0 ? Math.min(s.cashActual / s.cashPlanned * 100, 100) : 0;
  setText('stat-cash-sub', `خطة ${s.yr || ''}: ${formatSAR(s.cashPlanned || 0)}`);
  const fill = g('stat-cash-fill');
  if (fill) { fill.style.width = cfPct.toFixed(0) + '%'; fill.style.background = cfPct >= 100 ? 'var(--success)' : 'var(--accent)'; }
}

// ── Charts ────────────────────────────────────────────────────
function renderCharts() {
  // Sector allocation
  const sectorMap = {};
  holdings.forEach(h => { const k = SECTOR_DB[h.ticker]?.sector || 'أخرى'; sectorMap[k] = (sectorMap[k] || 0) + h.shares * h.current_price; });
  const sLabels = Object.keys(sectorMap), sData = sLabels.map(k => sectorMap[k]);

  if (sectorChart) sectorChart.destroy();
  const sCtx = g('sectorChart')?.getContext('2d');
  if (sCtx) {
    sectorChart = new Chart(sCtx, {
      type: 'doughnut',
      data: { labels: sLabels, datasets: [{ data: sData, backgroundColor: CHART_COLORS, borderColor: '#1c2128', borderWidth: 2, hoverOffset: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 10, usePointStyle: true } },
          tooltip: { backgroundColor: '#1c2128', titleColor: '#e6edf3', bodyColor: '#8b949e', borderColor: '#30363d', borderWidth: 1, titleFont: { family: 'Tajawal' }, bodyFont: { family: 'Tajawal' }, callbacks: { label: c => ' ' + formatSAR(c.parsed) } }
        }
      }
    });
  }

  // Portfolio weight
  const total = holdings.reduce((s, h) => s + h.shares * h.current_price, 0);
  if (weightChart) weightChart.destroy();
  const wCtx = g('weightChart')?.getContext('2d');
  if (wCtx) {
    weightChart = new Chart(wCtx, {
      type: 'bar',
      data: {
        labels: holdings.map(h => h.ticker),
        datasets: [
          { label: 'الوزن الحالي %',   data: holdings.map(h => total > 0 ? +(h.shares * h.current_price / total * 100).toFixed(2) : 0), backgroundColor: 'rgba(240,180,41,0.75)', borderRadius: 4 },
          { label: 'الوزن المستهدف %', data: holdings.map(h => +h.target_weight || 0), backgroundColor: 'rgba(63,185,80,0.5)', borderRadius: 4 }
        ]
      },
      options: { ...chartDefaults(), plugins: { ...chartDefaults().plugins, legend: { labels: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 10, usePointStyle: true } } } }
    });
  }
}

// ── Holdings Table (with inline editing) ──────────────────────
function renderTable() {
  const total = holdings.reduce((s, h) => s + h.shares * h.current_price, 0);
  const tbody = g('holdings-tbody');
  if (!tbody) return;

  if (!holdings.length) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><div class="icon">📋</div><p>لا توجد أسهم — ابدأ بإضافة أول سهم</p></div></td></tr>`;
    enableInlineEditing(tbody, onHoldingSaved);
    return;
  }

  tbody.innerHTML = holdings.map(h => {
    const cost  = h.shares * h.avg_price;
    const value = h.shares * h.current_price;
    const pnl   = value - cost;
    const pnlP  = cost > 0 ? pnl / cost * 100 : 0;
    const wt    = total > 0 ? value / total * 100 : 0;
    const cls   = pnl >= 0 ? 'text-success' : 'text-danger';

    return `<tr>
      <td ${ed('holdings',h.id,'ticker','text',h.ticker)}><strong class="text-accent">${esc(h.ticker)}</strong></td>
      <td ${ed('holdings',h.id,'name','text',h.name)}>${esc(h.name)}</td>
      <td ${ed('holdings',h.id,'sector','text',h.sector||'','text-muted small')}>${esc(SECTOR_DB[h.ticker]?.sector || h.sector || '—')}</td>
      <td ${ed('holdings',h.id,'shares','number',h.shares)}>${formatNum(h.shares,4)}</td>
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
  renderStats();
  renderCharts();
  renderTable();
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

async function deleteHolding(id) {
  if (!confirm('هل أنت متأكد من حذف هذا السهم؟')) return;
  const { error } = await supabaseClient.from('holdings').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await reloadHoldings();
  renderStats(); renderCharts(); renderTable();
}

init();
