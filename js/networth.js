let snapshots   = [];
let nwAssets    = [];
let nwLiabs     = [];
let autoStocks  = 0;
let autoRe      = 0;
let nwChart     = null;
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
  renderAssetsTable();
  renderLiabTable();
  renderChart();
  renderSnapshotTable();
}

async function loadAll() {
  const [rSnap, rAssets, rLiabs, rHoldings, rRe] = await Promise.all([
    supabaseClient.from('net_worth_snapshots').select('*').order('date', { ascending: true }),
    supabaseClient.from('nw_assets').select('*').order('category'),
    supabaseClient.from('nw_liabilities').select('*').order('category'),
    supabaseClient.from('holdings').select('shares, current_price'),
    supabaseClient.from('real_estate').select('current_value, status')
  ]);

  snapshots = rSnap.data || [];
  nwAssets  = rAssets.data || [];
  nwLiabs   = rLiabs.data || [];

  // Auto: stocks value
  autoStocks = (rHoldings.data || []).reduce((s, h) => s + (+h.shares * +h.current_price), 0);

  // Auto: real estate (non-sold)
  autoRe = (rRe.data || []).filter(p => p.status !== 'sold').reduce((s, p) => s + +p.current_value, 0);
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

  const set = (id, v, cls) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = v;
    if (cls) el.className = cls;
  };

  set('auto-stocks',    formatSAR(autoStocks));
  set('auto-realestate',formatSAR(autoRe));
  set('nw-total-assets',formatSAR(totalAssets));
  set('nw-total-liab',  formatSAR(totalLiabs));

  const netEl = document.getElementById('nw-net');
  if (netEl) {
    netEl.textContent = formatSAR(net, true);
    netEl.className   = 'val num bold ' + (net >= 0 ? 'text-success' : 'text-danger');
    netEl.style.fontSize = '1.65rem';
  }

  const { manualAssets } = calcTotals();
  const assEl = document.getElementById('assets-subtotal');
  if (assEl) assEl.textContent = formatSAR(manualAssets);
  const liabEl = document.getElementById('liab-subtotal');
  if (liabEl) liabEl.textContent = formatSAR(totalLiabs);
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
    <td>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" onclick="openAssetModal('${esc(a.id)}')">تعديل</button>
        <button class="btn btn-danger btn-sm"    onclick="deleteAsset('${esc(a.id)}')">حذف</button>
      </div>
    </td>
  </tr>`).join('');

  enableInlineEditing(tbody, async (id, field, val) => {
    const a = nwAssets.find(x => x.id === id);
    if (a) a[field] = val;
    renderTotals();
    renderAssetsTable();
  });
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
    <td>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" onclick="openLiabModal('${esc(l.id)}')">تعديل</button>
        <button class="btn btn-danger btn-sm"    onclick="deleteLiab('${esc(l.id)}')">حذف</button>
      </div>
    </td>
  </tr>`).join('');

  enableInlineEditing(tbody, async (id, field, val) => {
    const l = nwLiabs.find(x => x.id === id);
    if (l) l[field] = val;
    renderTotals();
    renderLiabTable();
  });
}

function renderChart() {
  const container = document.querySelector('.chart-container');
  if (!container) return;

  if (!snapshots.length) {
    container.innerHTML = `<div class="empty-state" style="height:260px"><div class="icon">📉</div><p>احفظ لقطات لعرض المخطط التاريخي</p></div>`;
    return;
  }

  // Ensure canvas exists
  if (!document.getElementById('nwChart')) {
    container.innerHTML = '<canvas id="nwChart"></canvas>';
  }

  if (nwChart) nwChart.destroy();
  const ctx = document.getElementById('nwChart')?.getContext('2d');
  if (!ctx) return;

  nwChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: snapshots.map(s => formatDate(s.date)),
      datasets: [{
        label: 'صافي الثروة (ر.س)',
        data: snapshots.map(s => +s.total_value),
        borderColor: '#f0b429',
        backgroundColor: 'rgba(240,180,41,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#f0b429',
        pointRadius: 4, pointHoverRadius: 7,
        fill: true, tension: 0.3
      }]
    },
    options: {
      ...chartDefaults(),
      plugins: {
        ...chartDefaults().plugins,
        tooltip: { ...chartDefaults().plugins.tooltip, callbacks: { label: c => ' ' + formatSAR(c.parsed.y) } }
      },
      scales: {
        x: { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 } }, grid: { color: 'rgba(48,54,61,0.6)' } },
        y: { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, callback: v => formatNum(v/1000,0) + 'K' }, grid: { color: 'rgba(48,54,61,0.6)' } }
      }
    }
  });
}

function renderSnapshotTable() {
  const tbody = document.getElementById('nw-tbody');
  if (!tbody) return;

  if (!snapshots.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">🏦</div><p>لا توجد لقطات — اضغط "حفظ لقطة الآن" لتسجيل القيمة الحالية</p></div></td></tr>`;
    enableInlineEditing(tbody, onSnapSaved);
    return;
  }

  const sorted = [...snapshots].reverse();
  tbody.innerHTML = sorted.map((s, i) => {
    const prev   = sorted[i + 1];
    const change = prev ? +s.total_value - +prev.total_value : null;
    const chgCls = change === null ? '' : (change >= 0 ? 'text-success' : 'text-danger');
    return `<tr>
      <td ${edNw('net_worth_snapshots',s.id,'date','date',s.date)}>${formatDate(s.date)}</td>
      <td ${edNw('net_worth_snapshots',s.id,'total_value','number',s.total_value,'bold text-accent num')}>${formatSAR(s.total_value)}</td>
      <td class="num ${chgCls}">${change === null ? '—' : formatSAR(change, true)}</td>
      <td ${edNw('net_worth_snapshots',s.id,'notes','text',s.notes||'','text-muted small')}>${esc(s.notes || '—')}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteSnapshot('${esc(s.id)}')">حذف</button></td>
    </tr>`;
  }).join('');

  enableInlineEditing(tbody, onSnapSaved);
}

async function onSnapSaved(id, field, val) {
  const s = snapshots.find(x => x.id === id);
  if (s) { s[field] = val; if (field === 'date') snapshots.sort((a,b) => a.date.localeCompare(b.date)); }
  renderChart();
  renderSnapshotTable();
}

// ── Save snapshot (current calculated net worth) ──────────────
async function saveSnapshot() {
  const { net } = calcTotals();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = { user_id: user.id, date: todayISO(), total_value: net, notes: 'لقطة تلقائية' };
  const { error } = await supabaseClient.from('net_worth_snapshots').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم حفظ اللقطة ✓', 'success');
  const rSnap = await supabaseClient.from('net_worth_snapshots').select('*').order('date', { ascending: true });
  snapshots = rSnap.data || [];
  renderChart();
  renderSnapshotTable();
}

async function deleteSnapshot(id) {
  if (!confirm('هل أنت متأكد من الحذف؟')) return;
  const { error } = await supabaseClient.from('net_worth_snapshots').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  const rSnap = await supabaseClient.from('net_worth_snapshots').select('*').order('date', { ascending: true });
  snapshots = rSnap.data || [];
  renderChart();
  renderSnapshotTable();
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

function closeAssetModal() {
  document.getElementById('asset-modal').style.display = 'none';
  editAssetId = null;
}

async function saveAsset(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id:  user.id,
    category: document.getElementById('a-category').value,
    name:     document.getElementById('a-name').value.trim(),
    value:    +document.getElementById('a-value').value,
    notes:    document.getElementById('a-notes').value.trim()
  };
  let error;
  if (editAssetId) ({ error } = await supabaseClient.from('nw_assets').update(payload).eq('id', editAssetId));
  else             ({ error } = await supabaseClient.from('nw_assets').insert([payload]));
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editAssetId ? 'تم التحديث' : 'تمت الإضافة', 'success');
  closeAssetModal();
  const r = await supabaseClient.from('nw_assets').select('*').order('category');
  nwAssets = r.data || [];
  renderTotals();
  renderAssetsTable();
}

async function deleteAsset(id) {
  if (!confirm('هل أنت متأكد من الحذف؟')) return;
  const { error } = await supabaseClient.from('nw_assets').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  const r = await supabaseClient.from('nw_assets').select('*').order('category');
  nwAssets = r.data || [];
  renderTotals();
  renderAssetsTable();
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

function closeLiabModal() {
  document.getElementById('liab-modal').style.display = 'none';
  editLiabId = null;
}

async function saveLiab(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id:  user.id,
    category: document.getElementById('l-category').value,
    name:     document.getElementById('l-name').value.trim(),
    value:    +document.getElementById('l-value').value,
    notes:    document.getElementById('l-notes').value.trim()
  };
  let error;
  if (editLiabId) ({ error } = await supabaseClient.from('nw_liabilities').update(payload).eq('id', editLiabId));
  else            ({ error } = await supabaseClient.from('nw_liabilities').insert([payload]));
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editLiabId ? 'تم التحديث' : 'تمت الإضافة', 'success');
  closeLiabModal();
  const r = await supabaseClient.from('nw_liabilities').select('*').order('category');
  nwLiabs = r.data || [];
  renderTotals();
  renderLiabTable();
}

async function deleteLiab(id) {
  if (!confirm('هل أنت متأكد من الحذف؟')) return;
  const { error } = await supabaseClient.from('nw_liabilities').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  const r = await supabaseClient.from('nw_liabilities').select('*').order('category');
  nwLiabs = r.data || [];
  renderTotals();
  renderLiabTable();
}

init();
