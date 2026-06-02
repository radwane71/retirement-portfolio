let snapshots   = [];
let nwAssets    = [];
let nwLiabs     = [];
let autoStocks  = 0;
let autoRe      = 0;
let nwChart     = null;
let _nwChartMode = 'line'; // 'line' | 'bar' | 'compare' | 'table'
let compChart        = null;
let _compMode        = 'donut'; // 'donut' | 'bars' | 'cards'
let editAssetId = null;
let editLiabId  = null;

const ASSET_CAT_AR = { bank:'حساب بنكي / نقدي', sukuk:'صكوك / سندات', vehicle:'مركبة', other:'أخرى' };
const LIAB_CAT_AR  = { credit_card:'بطاقة ائتمان', loan:'قرض', mortgage:'رهن عقاري', other:'أخرى' };

function edNw(table, rowId, field, type, raw, extraCls = '') {
  return `class="editable${type==='number'?' num':''}${extraCls?' '+extraCls:''}" ` +
    `data-table="${table}" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"`;
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-networth');
  await loadAll();
  renderTotals();
  renderCompositionChart();
  renderAssetsTable();
  renderLiabTable();
  renderChart();
  renderSnapshotTable();
}

async function loadAll() {
  const [rSnap, rAssets, rLiabs, rHoldings, rRe] = await Promise.all([
    supabaseClient.from('net_worth_snapshots').select('*').order('date', { ascending: true }),
    supabaseClient.from('nw_assets').select('*').eq('is_active', true).order('category'),
    supabaseClient.from('nw_liabilities').select('*').eq('is_active', true).order('category'),
    supabaseClient.from('holdings').select('shares, current_price'),
    supabaseClient.from('real_estate').select('current_value, status').eq('is_active', true)
  ]);

  snapshots = rSnap.data || [];
  nwAssets  = rAssets.data || [];
  nwLiabs   = rLiabs.data || [];
  autoStocks = (rHoldings.data || []).reduce((s, h) => s + (+h.shares * +h.current_price), 0);
  autoRe     = (rRe.data || []).filter(p => p.status !== 'sold').reduce((s, p) => s + +p.current_value, 0);
}

function calcTotals() {
  const manualAssets = nwAssets.reduce((s, a) => s + +a.value, 0);
  const totalAssets  = autoStocks + autoRe + manualAssets;
  const totalLiabs   = nwLiabs.reduce((s, l) => s + +l.value, 0);
  const net          = totalAssets - totalLiabs;
  return { totalAssets, totalLiabs, net, manualAssets };
}

function renderTotals() {
  const { totalAssets, totalLiabs, net } = calcTotals();
  const set = (id, v, cls) => { const el = document.getElementById(id); if (!el) return; el.textContent = v; if (cls) el.className = cls; };
  set('auto-stocks',    formatSAR(autoStocks));
  set('auto-realestate',formatSAR(autoRe));
  set('nw-total-assets',formatSAR(totalAssets));
  set('nw-total-liab',  formatSAR(totalLiabs));
  const netEl = document.getElementById('nw-net');
  if (netEl) { netEl.textContent = formatSAR(net, true); netEl.className = 'val num bold ' + (net >= 0 ? 'text-success' : 'text-danger'); netEl.style.fontSize = '1.65rem'; }
  const assEl = document.getElementById('assets-subtotal');
  if (assEl) assEl.textContent = formatSAR(calcTotals().manualAssets);
  const liabEl = document.getElementById('liab-subtotal');
  if (liabEl) liabEl.textContent = formatSAR(calcTotals().totalLiabs);
}

function renderAssetsTable() {
  const tbody = document.getElementById('assets-tbody');
  if (!tbody) return;
  if (!nwAssets.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:16px"><p class="small text-muted">لا توجد أصول مضافة — اضغط "+ إضافة"</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = nwAssets.map(a => `<tr>
    <td class="small text-muted">${esc(ASSET_CAT_AR[a.category] || a.category)}</td>
    <td ${edNw('nw_assets',a.id,'name','text',a.name,'bold')}>${esc(a.name)}</td>
    <td ${edNw('nw_assets',a.id,'value','number',a.value,'num text-success')}>${formatSAR(a.value)}</td>
    <td><div class="flex gap-2">
      <button class="btn btn-secondary btn-sm" onclick="openAssetModal('${esc(a.id)}')">تعديل</button>
      <button class="btn btn-danger btn-sm"    onclick="deleteAsset('${esc(a.id)}')">حذف</button>
    </div></td>
  </tr>`).join('');
  enableInlineEditing(tbody, async (id, field, val) => { const a = nwAssets.find(x => x.id === id); if (a) a[field] = val; renderTotals(); renderCompositionChart(); renderAssetsTable(); });
}

function renderLiabTable() {
  const tbody = document.getElementById('liab-tbody');
  if (!tbody) return;
  if (!nwLiabs.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:16px"><p class="small text-muted">لا توجد التزامات — اضغط "+ إضافة"</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = nwLiabs.map(l => `<tr>
    <td class="small text-muted">${esc(LIAB_CAT_AR[l.category] || l.category)}</td>
    <td ${edNw('nw_liabilities',l.id,'name','text',l.name,'bold')}>${esc(l.name)}</td>
    <td ${edNw('nw_liabilities',l.id,'value','number',l.value,'num text-danger')}>${formatSAR(l.value)}</td>
    <td><div class="flex gap-2">
      <button class="btn btn-secondary btn-sm" onclick="openLiabModal('${esc(l.id)}')">تعديل</button>
      <button class="btn btn-danger btn-sm"    onclick="deleteLiab('${esc(l.id)}')">حذف</button>
    </div></td>
  </tr>`).join('');
  enableInlineEditing(tbody, async (id, field, val) => { const l = nwLiabs.find(x => x.id === id); if (l) l[field] = val; renderTotals(); renderCompositionChart(); renderLiabTable(); });
}

// ── Composition Chart: mode switcher ─────────────────────────
function setCompMode(mode) {
  _compMode = mode;
  ['donut','bars','cards'].forEach(m => document.getElementById('cm-' + m)?.classList.toggle('active', m === mode));
  renderCompositionChart();
}

// ── Composition Chart ─────────────────────────────────────────
function renderCompositionChart() {
  const { totalAssets, totalLiabs, net } = calcTotals();
  const manualAssets = nwAssets.reduce((s, a) => s + +a.value, 0);
  const totalGross   = totalAssets + totalLiabs;

  const segments = [
    { label: 'محفظة الأسهم', value: autoStocks,  color: '#3fb950' },
    { label: 'العقارات',      value: autoRe,       color: '#f0b429' },
    { label: 'أصول أخرى',    value: manualAssets,  color: '#58a6ff' },
    { label: 'الالتزامات',   value: -totalLiabs,   color: '#f85149' },
  ].filter(s => Math.abs(s.value) > 0);

  // subtitle always updated
  const sub = document.getElementById('nw-comp-subtitle');
  if (sub) {
    const liabPct = totalAssets > 0 ? (totalLiabs / totalAssets * 100).toFixed(1) : 0;
    sub.textContent = `صافي الثروة ${formatSAR(net)} · نسبة الالتزامات ${liabPct}%`;
  }

  const chartArea = document.getElementById('nw-comp-chart-area');
  const altArea   = document.getElementById('nw-comp-alt-area');

  if (_compMode === 'bars') {
    if (compChart) { compChart.destroy(); compChart = null; }
    if (chartArea) chartArea.style.display = 'none';
    if (altArea)   { altArea.style.display = ''; altArea.innerHTML = _renderCompBars(segments, totalGross); }
    return;
  }
  if (_compMode === 'cards') {
    if (compChart) { compChart.destroy(); compChart = null; }
    if (chartArea) chartArea.style.display = 'none';
    if (altArea)   { altArea.style.display = ''; altArea.innerHTML = _renderCompCards(segments, totalGross, net); }
    return;
  }

  // donut
  if (altArea)    altArea.style.display = 'none';
  if (chartArea)  chartArea.style.display = '';

  const canvas = document.getElementById('nwCompChart');
  if (!canvas) return;

  if (totalGross === 0) {
    document.getElementById('nw-comp-legend').innerHTML = `<p class="small text-muted">لا توجد بيانات — أضف أصولاً أو التزامات أولاً</p>`;
    return;
  }

  if (compChart) { compChart.destroy(); compChart = null; }
  compChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: segments.map(s => s.label),
      datasets: [{ data: segments.map(s => Math.abs(s.value)), backgroundColor: segments.map(s => s.color + 'cc'), borderColor: segments.map(s => s.color), borderWidth: 2, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => { const seg = segments[ctx.dataIndex]; const pct = (Math.abs(seg.value) / totalGross * 100).toFixed(1); return ` ${seg.label}: ${formatSAR(Math.abs(seg.value))} (${pct}%)`; } } }
      }
    }
  });

  const legend = document.getElementById('nw-comp-legend');
  if (legend) {
    legend.innerHTML = segments.map(s => {
      const pct = (Math.abs(s.value) / totalGross * 100).toFixed(1);
      const isLib = s.value < 0;
      return `<div style="display:flex;align-items:center;gap:10px">
        <span style="width:14px;height:14px;border-radius:3px;background:${s.color};flex-shrink:0"></span>
        <div>
          <div style="font-weight:600;color:${isLib ? '#f85149' : 'var(--text)'}">${s.label}</div>
          <div style="font-size:0.78rem;color:var(--text-2)">${formatSAR(Math.abs(s.value))} — <strong style="color:${s.color}">${pct}%</strong></div>
        </div>
      </div>`;
    }).join('');
  }
}

function _renderCompBars(segments, totalGross) {
  const maxVal = Math.max(...segments.map(s => Math.abs(s.value)));
  const bars = segments.map(s => {
    const pct    = totalGross > 0 ? (Math.abs(s.value) / totalGross * 100) : 0;
    const barW   = maxVal > 0 ? (Math.abs(s.value) / maxVal * 100) : 0;
    const isLib  = s.value < 0;
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div style="width:90px;font-size:0.82rem;color:${isLib ? '#f85149' : 'var(--text)'};text-align:right">${s.label}</div>
      <div style="flex:1;height:20px;background:rgba(255,255,255,0.06);border-radius:4px">
        <div style="height:100%;width:${barW.toFixed(1)}%;background:${s.color};border-radius:4px;min-width:4px"></div>
      </div>
      <div style="width:52px;font-size:0.82rem;font-weight:600;color:${s.color}">${pct.toFixed(1)}%</div>
      <div style="width:100px;font-size:0.78rem;color:var(--text-2);text-align:left">${formatSAR(Math.abs(s.value))}</div>
    </div>`;
  }).join('');
  return `<div style="padding:12px 4px">${bars}</div>`;
}

function _renderCompCards(segments, totalGross, net) {
  const cards = segments.map(s => {
    const pct   = totalGross > 0 ? (Math.abs(s.value) / totalGross * 100) : 0;
    const isLib = s.value < 0;
    return `<div class="w-card" style="--card-accent:${s.color}">
      <div class="w-card-header">
        <span style="font-size:0.8rem;font-weight:600;color:${s.color}">${s.label}</span>
        <span class="w-card-pct" style="color:${s.color}">${pct.toFixed(1)}%</span>
      </div>
      <div class="w-card-bar-wrap" style="margin:6px 0">
        <div class="w-card-bar-track"><div class="w-card-bar-fill" style="width:${pct.toFixed(1)}%;background:${s.color}"></div></div>
      </div>
      <div style="font-size:0.82rem;font-weight:600;color:${isLib ? '#f85149' : 'var(--text)'}">${formatSAR(Math.abs(s.value))}</div>
    </div>`;
  });
  // add net worth card
  cards.push(`<div class="w-card" style="--card-accent:${net >= 0 ? '#3fb950' : '#f85149'};border-style:dashed">
    <div class="w-card-header">
      <span style="font-size:0.8rem;font-weight:700;color:var(--text-2)">صافي الثروة</span>
    </div>
    <div style="font-size:1.05rem;font-weight:700;color:${net >= 0 ? '#3fb950' : '#f85149'};margin-top:6px">${formatSAR(net)}</div>
  </div>`);
  return `<div class="w-cards-grid" style="padding:12px 0">${cards.join('')}</div>`;
}

// ── Historical Chart ──────────────────────────────────────────
function setNwChartMode(mode) {
  _nwChartMode = mode;
  ['line','bar','compare','table'].forEach(m => document.getElementById('nwm-' + m)?.classList.toggle('active', m === mode));
  renderChart();
}

function renderChart() {
  const wrap      = document.getElementById('nwChart-wrap');
  const tableArea = document.getElementById('nwChart-table');
  const canvas    = document.getElementById('nwChart');

  if (!snapshots.length) {
    if (wrap) wrap.innerHTML = `<div class="empty-state" style="height:260px"><div class="icon">📉</div><p>احفظ لقطات لعرض المخطط التاريخي</p></div>`;
    return;
  }

  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const labels  = sorted.map(s => formatDate(s.date));

  if (_nwChartMode === 'table') {
    if (nwChart) { nwChart.destroy(); nwChart = null; }
    if (wrap)      wrap.style.display = 'none';
    if (tableArea) { tableArea.style.display = ''; tableArea.innerHTML = _buildNwTable(sorted); }
    return;
  }

  if (wrap)       { wrap.style.display = ''; if (!canvas) return; }
  if (tableArea)  tableArea.style.display = 'none';
  if (nwChart) { nwChart.destroy(); nwChart = null; }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const tooltipCb = { label: c => ' ' + c.dataset.label + ': ' + formatSAR(c.parsed.y) };
  const xScale  = { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 } }, grid: { color: 'rgba(48,54,61,0.6)' } };
  const yScale  = { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, callback: v => formatNum(v/1000,0)+'K' }, grid: { color: 'rgba(48,54,61,0.6)' } };

  if (_nwChartMode === 'bar') {
    nwChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'صافي الثروة', data: sorted.map(s => +s.total_value), backgroundColor: sorted.map(s => +s.total_value >= 0 ? 'rgba(240,180,41,0.75)' : 'rgba(248,81,73,0.75)'), borderColor: sorted.map(s => +s.total_value >= 0 ? '#f0b429' : '#f85149'), borderWidth: 1.5, borderRadius: 4 }]
      },
      options: { ...chartDefaults(), plugins: { ...chartDefaults().plugins, legend: { display: false }, tooltip: { ...chartDefaults().plugins.tooltip, callbacks: tooltipCb } }, scales: { x: xScale, y: yScale } }
    });
    return;
  }

  if (_nwChartMode === 'compare') {
    // use snapshot_json if available, otherwise fallback to total_value only
    const hasJson = sorted.some(s => s.snapshot_json);
    const datasets = hasJson ? [
      { label: 'إجمالي الأصول',   data: sorted.map(s => s.snapshot_json ? +s.snapshot_json.total_assets : null), borderColor: '#3fb950', backgroundColor: 'rgba(63,185,80,0.08)',  borderWidth: 2, pointRadius: 3, fill: false, tension: 0.3, spanGaps: true },
      { label: 'الالتزامات',      data: sorted.map(s => s.snapshot_json ? +s.snapshot_json.total_liabs  : null), borderColor: '#f85149', backgroundColor: 'rgba(248,81,73,0.08)',  borderWidth: 2, pointRadius: 3, fill: false, tension: 0.3, spanGaps: true },
      { label: 'صافي الثروة',     data: sorted.map(s => +s.total_value),                                          borderColor: '#f0b429', backgroundColor: 'rgba(240,180,41,0.08)', borderWidth: 2.5, pointRadius: 4, fill: true, tension: 0.3 },
    ] : [
      { label: 'صافي الثروة', data: sorted.map(s => +s.total_value), borderColor: '#f0b429', backgroundColor: 'rgba(240,180,41,0.08)', borderWidth: 2.5, pointRadius: 4, fill: true, tension: 0.3 }
    ];
    nwChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: { ...chartDefaults(), plugins: { ...chartDefaults().plugins, legend: { display: true, position: 'bottom', labels: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, usePointStyle: true, padding: 12 } }, tooltip: { ...chartDefaults().plugins.tooltip, callbacks: tooltipCb } }, scales: { x: xScale, y: yScale } }
    });
    return;
  }

  // default: line
  nwChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'صافي الثروة', data: sorted.map(s => +s.total_value), borderColor: '#f0b429', backgroundColor: 'rgba(240,180,41,0.08)', borderWidth: 2.5, pointBackgroundColor: '#f0b429', pointRadius: 4, pointHoverRadius: 7, fill: true, tension: 0.3 }]
    },
    options: { ...chartDefaults(), plugins: { ...chartDefaults().plugins, tooltip: { ...chartDefaults().plugins.tooltip, callbacks: tooltipCb } }, scales: { x: xScale, y: yScale } }
  });
}

function _buildNwTable(sorted) {
  if (!sorted.length) return '<p class="small text-muted" style="padding:12px">لا توجد لقطات</p>';
  const rows = [...sorted].reverse().map((s, i, arr) => {
    const prev   = arr[i + 1];
    const change = prev ? +s.total_value - +prev.total_value : null;
    const chgCls = change === null ? 'color:#8b949e' : change >= 0 ? 'color:#3fb950' : 'color:#f85149';
    const assets = s.snapshot_json ? formatSAR(s.snapshot_json.total_assets) : '—';
    const liabs  = s.snapshot_json ? formatSAR(s.snapshot_json.total_liabs)  : '—';
    return `<tr>
      <td>${formatDate(s.date)}</td>
      <td class="num text-success">${assets}</td>
      <td class="num text-danger">${liabs}</td>
      <td class="num bold" style="color:#f0b429">${formatSAR(s.total_value)}</td>
      <td class="num" style="${chgCls}">${change === null ? '—' : formatSAR(change, true)}</td>
      <td class="small text-muted">${esc(s.notes || '—')}</td>
    </tr>`;
  }).join('');
  return `<table class="data-table" style="width:100%">
    <thead><tr><th>التاريخ</th><th>الأصول</th><th>الالتزامات</th><th>صافي الثروة</th><th>التغير</th><th>ملاحظات</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Snapshot Table ─────────────────────────────────────────────
function renderSnapshotTable() {
  const tbody = document.getElementById('nw-tbody');
  if (!tbody) return;
  if (!snapshots.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">🏦</div><p>لا توجد لقطات — اضغط "حفظ لقطة الآن"</p></div></td></tr>`;
    enableInlineEditing(tbody, onSnapSaved);
    return;
  }
  const sorted = [...snapshots].reverse();
  tbody.innerHTML = sorted.map((s, i) => {
    const prev   = sorted[i + 1];
    const change = prev ? +s.total_value - +prev.total_value : null;
    const chgCls = change === null ? '' : (change >= 0 ? 'text-success' : 'text-danger');
    const hasDetail = !!s.snapshot_json;
    return `<tr>
      <td ${edNw('net_worth_snapshots',s.id,'date','date',s.date)}>${formatDate(s.date)}</td>
      <td ${edNw('net_worth_snapshots',s.id,'total_value','number',s.total_value,'bold text-accent num')}>${formatSAR(s.total_value)}</td>
      <td class="num ${chgCls}">${change === null ? '—' : formatSAR(change, true)}</td>
      <td ${edNw('net_worth_snapshots',s.id,'notes','text',s.notes||'','text-muted small')}>${esc(s.notes || '—')}</td>
      <td>
        ${hasDetail
          ? `<button class="btn btn-secondary btn-sm" onclick="openSnapshotDetail('${esc(s.id)}')">📋 تفاصيل</button>`
          : `<span class="small text-muted">—</span>`}
      </td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteSnapshot('${esc(s.id)}')">حذف</button></td>
    </tr>`;
  }).join('');
  enableInlineEditing(tbody, onSnapSaved);
}

async function onSnapSaved(id, field, val) {
  const s = snapshots.find(x => x.id === id);
  if (s) { s[field] = val; if (field === 'date') snapshots.sort((a,b) => a.date.localeCompare(b.date)); }
  renderChart(); renderSnapshotTable();
}

// ── Snapshot Detail Modal ─────────────────────────────────────
function openSnapshotDetail(id) {
  const snap = snapshots.find(s => s.id === id);
  if (!snap || !snap.snapshot_json) return;
  const d = snap.snapshot_json;

  let html = `
    <div class="snap-detail-date">📅 ${formatDate(snap.date)}</div>
    <div class="snap-detail-summary">
      <div class="snap-kv"><span>إجمالي الأصول</span><span class="text-success bold num">${formatSAR(d.total_assets)}</span></div>
      <div class="snap-kv"><span>إجمالي الالتزامات</span><span class="text-danger bold num">${formatSAR(d.total_liabs)}</span></div>
      <div class="snap-kv snap-kv-total"><span>صافي الثروة</span><span class="text-accent bold num" style="font-size:1.2rem">${formatSAR(d.net)}</span></div>
    </div>

    <div class="snap-section-title">📈 الأسهم (تلقائي)</div>
    <div class="snap-kv"><span>القيمة السوقية للمحفظة</span><span class="num">${formatSAR(d.auto_stocks)}</span></div>

    <div class="snap-section-title">🏠 العقارات (تلقائي)</div>
    <div class="snap-kv"><span>إجمالي قيمة العقارات</span><span class="num">${formatSAR(d.auto_realestate)}</span></div>`;

  if (d.assets && d.assets.length) {
    html += `<div class="snap-section-title">✅ الأصول الأخرى</div>`;
    d.assets.forEach(a => {
      html += `<div class="snap-kv">
        <span>${esc(ASSET_CAT_AR[a.category]||a.category)} — ${esc(a.name)}</span>
        <span class="num text-success">${formatSAR(a.value)}</span>
      </div>`;
    });
  }

  if (d.liabilities && d.liabilities.length) {
    html += `<div class="snap-section-title">🔴 الالتزامات</div>`;
    d.liabilities.forEach(l => {
      html += `<div class="snap-kv">
        <span>${esc(LIAB_CAT_AR[l.category]||l.category)} — ${esc(l.name)}</span>
        <span class="num text-danger">−${formatSAR(l.value)}</span>
      </div>`;
    });
  }

  if (snap.notes && snap.notes !== 'لقطة تلقائية') {
    html += `<div class="snap-section-title">📝 ملاحظات</div><div class="small text-muted">${esc(snap.notes)}</div>`;
  }

  document.getElementById('snap-detail-body').innerHTML = html;
  document.getElementById('snap-detail-modal').style.display = 'flex';
}

function closeSnapshotDetail() {
  document.getElementById('snap-detail-modal').style.display = 'none';
}

// ── Save Snapshot (full details) ──────────────────────────────
async function saveSnapshot() {
  const { totalAssets, totalLiabs, net, manualAssets } = calcTotals();
  const { data: { user } } = await supabaseClient.auth.getUser();

  const snapshotJson = {
    auto_stocks:    autoStocks,
    auto_realestate: autoRe,
    assets:         nwAssets.map(a => ({ category: a.category, name: a.name, value: +a.value })),
    liabilities:    nwLiabs.map(l => ({ category: l.category, name: l.name, value: +l.value })),
    total_assets:   totalAssets,
    total_liabs:    totalLiabs,
    net
  };

  const payload = {
    user_id:       user.id,
    date:          todayISO(),
    total_value:   net,
    notes:         'لقطة تلقائية',
    snapshot_json: snapshotJson
  };

  const { error } = await supabaseClient.from('net_worth_snapshots').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم حفظ اللقطة الكاملة ✓', 'success');
  const rSnap = await supabaseClient.from('net_worth_snapshots').select('*').order('date', { ascending: true });
  snapshots = rSnap.data || [];
  renderChart(); renderSnapshotTable();
}

async function deleteSnapshot(id) {
  if (!confirm('هل أنت متأكد من الحذف؟')) return;
  const { error } = await supabaseClient.from('net_worth_snapshots').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  const rSnap = await supabaseClient.from('net_worth_snapshots').select('*').order('date', { ascending: true });
  snapshots = rSnap.data || [];
  renderChart(); renderSnapshotTable();
}

// ── Asset Modal ───────────────────────────────────────────────
function openAssetModal(id = null) {
  editAssetId = id;
  document.getElementById('asset-modal-title').textContent = id ? 'تعديل الأصل' : 'إضافة أصل';
  if (id) {
    const a = nwAssets.find(x => x.id === id);
    if (!a) return;
    document.getElementById('a-category').value = a.category;
    document.getElementById('a-name').value      = a.name;
    document.getElementById('a-value').value     = a.value;
    document.getElementById('a-notes').value     = a.notes || '';
  } else {
    document.getElementById('asset-form').reset();
  }
  document.getElementById('asset-modal').style.display = 'flex';
}

function closeAssetModal() { document.getElementById('asset-modal').style.display = 'none'; editAssetId = null; }

async function saveAsset(e) {
  e.preventDefault();
  const name  = document.getElementById('a-name').value.trim();
  const value = +document.getElementById('a-value').value;
  if (!name)     { showToast('أدخل اسم الأصل', 'error'); return; }
  if (value <= 0){ showToast('قيمة الأصل يجب أن تكون أكبر من صفر', 'error'); return; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = { user_id: user.id, category: document.getElementById('a-category').value, name, value, notes: document.getElementById('a-notes').value.trim() };
  let error;
  if (editAssetId) ({ error } = await supabaseClient.from('nw_assets').update(payload).eq('id', editAssetId));
  else             ({ error } = await supabaseClient.from('nw_assets').insert([payload]));
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editAssetId ? 'تم التحديث' : 'تمت الإضافة', 'success');
  closeAssetModal();
  const r = await supabaseClient.from('nw_assets').select('*').eq('is_active', true).order('category');
  nwAssets = r.data || [];
  renderTotals(); renderCompositionChart(); renderAssetsTable();
}

async function deleteAsset(id) {
  if (!confirm('سيتم أرشفة هذا الأصل (لن يُحذف نهائياً — يمكن استعادته من الأرشيف)')) return;
  const { error } = await supabaseClient.from('nw_assets')
    .update({ is_active: false, archived_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تمت الأرشفة ✓', 'success');
  const r = await supabaseClient.from('nw_assets').select('*').eq('is_active', true).order('category');
  nwAssets = r.data || [];
  renderTotals(); renderAssetsTable();
}

// ── Liability Modal ───────────────────────────────────────────
function openLiabModal(id = null) {
  editLiabId = id;
  document.getElementById('liab-modal-title').textContent = id ? 'تعديل الالتزام' : 'إضافة التزام';
  if (id) {
    const l = nwLiabs.find(x => x.id === id);
    if (!l) return;
    document.getElementById('l-category').value = l.category;
    document.getElementById('l-name').value      = l.name;
    document.getElementById('l-value').value     = l.value;
    document.getElementById('l-notes').value     = l.notes || '';
  } else {
    document.getElementById('liab-form').reset();
  }
  document.getElementById('liab-modal').style.display = 'flex';
}

function closeLiabModal() { document.getElementById('liab-modal').style.display = 'none'; editLiabId = null; }

async function saveLiab(e) {
  e.preventDefault();
  const name  = document.getElementById('l-name').value.trim();
  const value = +document.getElementById('l-value').value;
  if (!name)     { showToast('أدخل اسم الالتزام', 'error'); return; }
  if (value <= 0){ showToast('قيمة الالتزام يجب أن تكون أكبر من صفر', 'error'); return; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = { user_id: user.id, category: document.getElementById('l-category').value, name, value, notes: document.getElementById('l-notes').value.trim() };
  let error;
  if (editLiabId) ({ error } = await supabaseClient.from('nw_liabilities').update(payload).eq('id', editLiabId));
  else            ({ error } = await supabaseClient.from('nw_liabilities').insert([payload]));
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editLiabId ? 'تم التحديث' : 'تمت الإضافة', 'success');
  closeLiabModal();
  const r = await supabaseClient.from('nw_liabilities').select('*').eq('is_active', true).order('category');
  nwLiabs = r.data || [];
  renderTotals(); renderCompositionChart(); renderLiabTable();
}

async function deleteLiab(id) {
  if (!confirm('سيتم أرشفة هذا الالتزام (لن يُحذف نهائياً — يمكن استعادته من الأرشيف)')) return;
  const { error } = await supabaseClient.from('nw_liabilities')
    .update({ is_active: false, archived_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تمت الأرشفة ✓', 'success');
  const r = await supabaseClient.from('nw_liabilities').select('*').eq('is_active', true).order('category');
  nwLiabs = r.data || [];
  renderTotals(); renderCompositionChart(); renderLiabTable();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportNetworthCSV() {
  const total = nwAssets.length + nwLiabs.length + snapshots.length;
  if (!total) { showToast('لا توجد بيانات للتصدير', 'error'); return; }

  // ملف واحد بثلاثة أقسام مفصولة
  const BOM = '﻿';
  const lines = [];

  lines.push('== الأصول ==');
  lines.push(['الفئة','الاسم','القيمة','ملاحظات'].join(','));
  nwAssets.filter(a => a.is_active !== false).forEach(a =>
    lines.push([a.category, a.name, a.value, a.notes || ''].map(v => {
      const s = String(v ?? '');
      return s.includes(',') ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(','))
  );

  lines.push('');
  lines.push('== الالتزامات ==');
  lines.push(['الفئة','الاسم','القيمة','ملاحظات'].join(','));
  nwLiabs.filter(l => l.is_active !== false).forEach(l =>
    lines.push([l.category, l.name, l.value, l.notes || ''].map(v => {
      const s = String(v ?? '');
      return s.includes(',') ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(','))
  );

  lines.push('');
  lines.push('== لقطات صافي الثروة ==');
  lines.push(['التاريخ','صافي الثروة','ملاحظات'].join(','));
  snapshots.forEach(s =>
    lines.push([s.date, s.total_value, s.notes || ''].map(v => {
      const str = String(v ?? '');
      return str.includes(',') ? '"' + str.replace(/"/g, '""') + '"' : str;
    }).join(','))
  );

  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `صافي_الثروة_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`✓ تم تصدير ${total} سجل`, 'success');
}

init();
