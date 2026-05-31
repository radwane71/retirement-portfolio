// ─── Storage ──────────────────────────────────────────────────────────────────
const SUKUK_KEY = 'sukuk_planner_v1';

function getStore() {
  try { return JSON.parse(localStorage.getItem(SUKUK_KEY)) || defaultStore(); }
  catch { return defaultStore(); }
}
function saveStore(data) { localStorage.setItem(SUKUK_KEY, JSON.stringify(data)); }

function defaultStore() {
  return {
    opportunities: [],
    oppStatuses:  ['مشترك', 'مغلق', 'متعثر', 'مخطط له'],
    distStatuses: ['لم يسدد', 'تم السداد']
  };
}

function uid() { return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

// ─── State ────────────────────────────────────────────────────────────────────
let store     = getStore();
let editOppId = null;   // null = add mode
let editDistOppId = null;
let editDistId    = null;
let pendingDeleteOppId  = null;
let pendingDeleteDistId = null;
let pendingDeleteDistOppId = null;

// ─── Status colors ────────────────────────────────────────────────────────────
const OPP_STATUS_COLORS = {
  'مشترك':     { bg: '#3fb95018', border: '#3fb950', text: '#3fb950' },
  'مغلق':      { bg: '#8b949e18', border: '#8b949e', text: '#8b949e' },
  'متعثر':     { bg: '#f8514918', border: '#f85149', text: '#f85149' },
  'مخطط له':   { bg: '#3b82f618', border: '#3b82f6', text: '#3b82f6' },
};
const DIST_STATUS_COLORS = {
  'لم يسدد':   { bg: '#f8514918', text: '#f85149' },
  'تم السداد': { bg: '#3fb95018', text: '#3fb950' },
};

function oppStatusStyle(s) {
  const c = OPP_STATUS_COLORS[s] || { bg:'#f0b42918', border:'#f0b429', text:'#f0b429' };
  return `background:${c.bg};border:1px solid ${c.border};color:${c.text}`;
}
function distStatusStyle(s) {
  const c = DIST_STATUS_COLORS[s] || { bg:'#f0b42918', text:'#f0b429' };
  return `background:${c.bg};color:${c.text}`;
}

// ─── Calculations ─────────────────────────────────────────────────────────────
function calcOpp(o) {
  const totalReturnPct = (o.annualReturn || 0) * ((o.duration || 0) / 12);
  const totalReturnSAR = (o.amount || 0) * (1 + totalReturnPct / 100);
  const netProfit      = totalReturnSAR - (o.amount || 0);
  return { totalReturnPct, totalReturnSAR, netProfit };
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-sukuk');
  store = getStore();
  renderDashboard();
  renderOpportunities();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const opps = store.opportunities;

  const subscribedCount = opps.filter(o => o.status === 'مشترك').length;
  const totalInvested   = opps.reduce((s, o) => s + (+o.amount || 0), 0);
  const totalSukuk      = opps.reduce((s, o) => s + (+o.sukukCount || 0), 0);

  let totalReturnSAR = 0, totalNetProfit = 0;
  opps.forEach(o => {
    const c = calcOpp(o);
    totalReturnSAR += c.totalReturnSAR;
    totalNetProfit += c.netProfit;
  });

  const avgReturnPct = totalInvested > 0
    ? (totalNetProfit / totalInvested * 100)
    : 0;

  // paid distributions
  const totalPaid = opps.reduce((s, o) =>
    s + (o.distributions || []).filter(d => d.status === 'تم السداد')
        .reduce((ss, d) => ss + (+d.amount || 0), 0), 0);
  const totalUnpaid = opps.reduce((s, o) =>
    s + (o.distributions || []).filter(d => d.status === 'لم يسدد')
        .reduce((ss, d) => ss + (+d.amount || 0), 0), 0);

  set('dash-count',      subscribedCount);
  set('dash-invested',   formatSAR(totalInvested));
  set('dash-sukuk',      totalSukuk);
  set('dash-avg-pct',    formatNum(avgReturnPct, 2) + '%');
  set('dash-return-sar', formatSAR(totalReturnSAR));
  set('dash-net',        formatSAR(totalNetProfit));
  set('dash-paid',       formatSAR(totalPaid));
  set('dash-unpaid',     formatSAR(totalUnpaid));
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── Opportunities ────────────────────────────────────────────────────────────
function renderOpportunities() {
  const container = document.getElementById('opps-container');
  if (!store.opportunities.length) {
    container.innerHTML = `<div class="empty-state">لا توجد فرص — أضف فرصتك الأولى</div>`;
    return;
  }

  container.innerHTML = store.opportunities.map(o => renderOppCard(o)).join('');
}

function renderOppCard(o) {
  const { totalReturnPct, totalReturnSAR, netProfit } = calcOpp(o);

  const distRows = (o.distributions || [])
    .slice()
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
    .map(d => `
      <tr>
        <td>${MONTHS_AR[(+d.month || 1) - 1]} ${d.year}</td>
        <td class="num">${formatSAR(+d.amount || 0)}</td>
        <td><span class="dist-badge" style="${distStatusStyle(d.status)}">${esc(d.status)}</span></td>
        <td class="dist-actions">
          <button class="btn-icon-sm" onclick="openEditDist('${o.id}','${d.id}')" title="تعديل">✏️</button>
          <button class="btn-icon-sm danger" onclick="confirmDeleteDist('${o.id}','${d.id}')" title="حذف">🗑️</button>
        </td>
      </tr>`).join('');

  const paidTotal   = (o.distributions||[]).filter(d=>d.status==='تم السداد').reduce((s,d)=>s+(+d.amount||0),0);
  const unpaidTotal = (o.distributions||[]).filter(d=>d.status==='لم يسدد').reduce((s,d)=>s+(+d.amount||0),0);

  return `
    <div class="opp-card" id="card-${o.id}">
      <div class="opp-card-header">
        <div class="opp-name-block">
          <span class="opp-name">${esc(o.name || 'بدون اسم')}</span>
          <span class="opp-platform">${esc(o.platform || '')}</span>
        </div>
        <div class="opp-header-actions">
          <span class="opp-status-badge" style="${oppStatusStyle(o.status)}">${esc(o.status)}</span>
          <button class="btn-icon-sm" onclick="openEditOpp('${o.id}')" title="تعديل">✏️</button>
          <button class="btn-icon-sm danger" onclick="confirmDeleteOpp('${o.id}')" title="حذف">🗑️</button>
        </div>
      </div>

      <div class="opp-metrics">
        <div class="metric-row">
          <span class="metric-label">عدد الصكوك</span>
          <span class="metric-val">${+o.sukukCount || 0}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">المدة</span>
          <span class="metric-val">${+o.duration || 0} شهر</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">المبلغ المستثمر</span>
          <span class="metric-val accent">${formatSAR(+o.amount || 0)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">العائد السنوي%</span>
          <span class="metric-val">${formatNum(+o.annualReturn || 0, 2)}%</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">العائد الكلي%</span>
          <span class="metric-val success">${formatNum(totalReturnPct, 2)}%</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">العائد الكلي "ريال"</span>
          <span class="metric-val success">${formatSAR(totalReturnSAR)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">صافي الربح</span>
          <span class="metric-val ${netProfit >= 0 ? 'success' : 'danger'}">${formatSAR(netProfit)}</span>
        </div>
      </div>

      <div class="dist-section">
        <div class="dist-header">
          <span class="dist-title">التوزيعات</span>
          <div class="dist-totals">
            <span class="dist-badge" style="${distStatusStyle('تم السداد')}">محصّل: ${formatSAR(paidTotal)}</span>
            <span class="dist-badge" style="${distStatusStyle('لم يسدد')}">معلّق: ${formatSAR(unpaidTotal)}</span>
          </div>
          <button class="btn-sm" onclick="openAddDist('${o.id}')">+ توزيعة</button>
        </div>
        ${(o.distributions||[]).length ? `
        <table class="dist-table">
          <thead><tr><th>الشهر</th><th>المبلغ</th><th>الحالة</th><th></th></tr></thead>
          <tbody>${distRows}</tbody>
        </table>` : `<div class="dist-empty">لا توجد توزيعات بعد</div>`}
      </div>
    </div>`;
}

// ─── Add / Edit Opportunity Modal ─────────────────────────────────────────────
function openAddOpp() {
  editOppId = null;
  document.getElementById('opp-modal-title').textContent = 'إضافة فرصة جديدة';
  document.getElementById('opp-name').value       = '';
  document.getElementById('opp-platform').value   = '';
  document.getElementById('opp-sukuk').value      = '';
  document.getElementById('opp-duration').value   = '';
  document.getElementById('opp-amount').value     = '';
  document.getElementById('opp-annual').value     = '';
  buildOppStatusSelect(null);
  updateOppCalc();
  document.getElementById('opp-modal').classList.add('open');
  document.getElementById('opp-name').focus();
}

function openEditOpp(id) {
  const o = store.opportunities.find(x => x.id === id);
  if (!o) return;
  editOppId = id;
  document.getElementById('opp-modal-title').textContent = 'تعديل الفرصة';
  document.getElementById('opp-name').value       = o.name || '';
  document.getElementById('opp-platform').value   = o.platform || '';
  document.getElementById('opp-sukuk').value      = o.sukukCount || '';
  document.getElementById('opp-duration').value   = o.duration || '';
  document.getElementById('opp-amount').value     = o.amount || '';
  document.getElementById('opp-annual').value     = o.annualReturn || '';
  buildOppStatusSelect(o.status);
  updateOppCalc();
  document.getElementById('opp-modal').classList.add('open');
}

function buildOppStatusSelect(selected) {
  const sel = document.getElementById('opp-status');
  sel.innerHTML = store.oppStatuses.map(s =>
    `<option value="${esc(s)}" ${s === selected ? 'selected' : ''}>${esc(s)}</option>`
  ).join('');
}

function updateOppCalc() {
  const amount   = parseFloat(document.getElementById('opp-amount').value)   || 0;
  const annual   = parseFloat(document.getElementById('opp-annual').value)   || 0;
  const duration = parseFloat(document.getElementById('opp-duration').value) || 0;
  const totalPct = annual * (duration / 12);
  const totalSAR = amount * (1 + totalPct / 100);
  const net      = totalSAR - amount;
  document.getElementById('calc-total-pct').textContent = formatNum(totalPct, 2) + '%';
  document.getElementById('calc-total-sar').textContent = formatSAR(totalSAR);
  document.getElementById('calc-net').textContent       = formatSAR(net);
}

function closeOppModal() {
  document.getElementById('opp-modal').classList.remove('open');
  editOppId = null;
}

function saveOpp() {
  const name     = document.getElementById('opp-name').value.trim();
  const platform = document.getElementById('opp-platform').value.trim();
  const sukuk    = parseInt(document.getElementById('opp-sukuk').value);
  const duration = parseInt(document.getElementById('opp-duration').value);
  const amount   = parseFloat(document.getElementById('opp-amount').value);
  const annual   = parseFloat(document.getElementById('opp-annual').value);
  const status   = document.getElementById('opp-status').value;

  if (!name || isNaN(sukuk) || isNaN(duration) || isNaN(amount) || isNaN(annual)) {
    showToast('يرجى تعبئة جميع الحقول المطلوبة', 'error');
    return;
  }

  if (editOppId) {
    const o = store.opportunities.find(x => x.id === editOppId);
    const prevStatus = o.status;

    // ── Safety check: closing with unmatched distributions ──
    if (status === 'مغلق' && prevStatus !== 'مغلق') {
      const totalReturnPct = annual * (duration / 12);
      const expectedSAR    = amount * (1 + totalReturnPct / 100);
      const paidSAR        = (o.distributions || [])
        .filter(d => d.status === 'تم السداد')
        .reduce((s, d) => s + (+d.amount || 0), 0);
      const diff = expectedSAR - paidSAR;
      const tol  = 0.01;

      if (Math.abs(diff) > tol) {
        const shortOrOver = diff > 0 ? 'ناقص' : 'زيادة';
        const msg =
          `⚠️ تحذير — عدم تطابق التوزيعات\n\n` +
          `العائد الكلي المتوقع:  ${formatSAR(expectedSAR)}\n` +
          `المحصّل فعلياً:        ${formatSAR(paidSAR)}\n` +
          `الفرق (${shortOrOver}): ${formatSAR(Math.abs(diff))}\n\n` +
          `هل تريد الإغلاق رغم وجود فرق في التوزيعات؟`;
        if (!confirm(msg)) return;
      }
    }

    Object.assign(o, { name, platform, sukukCount: sukuk, duration, amount, annualReturn: annual, status });
    showToast('تم تحديث الفرصة', 'success');
  } else {
    store.opportunities.unshift({ id: uid(), name, platform, sukukCount: sukuk, duration, amount, annualReturn: annual, status, distributions: [] });
    showToast('تم إضافة الفرصة', 'success');
  }

  saveStore(store);
  closeOppModal();
  renderDashboard();
  renderOpportunities();
}

// ─── Delete Opportunity ───────────────────────────────────────────────────────
function confirmDeleteOpp(id) {
  const o = store.opportunities.find(x => x.id === id);
  if (!o) return;
  pendingDeleteOppId = id;
  document.getElementById('del-opp-name').textContent = o.name || 'هذه الفرصة';
  document.getElementById('del-opp-modal').classList.add('open');
}

function closeDelOppModal() {
  document.getElementById('del-opp-modal').classList.remove('open');
  pendingDeleteOppId = null;
}

function executeDeleteOpp() {
  if (!pendingDeleteOppId) return;
  store.opportunities = store.opportunities.filter(o => o.id !== pendingDeleteOppId);
  saveStore(store);
  closeDelOppModal();
  renderDashboard();
  renderOpportunities();
  showToast('تم حذف الفرصة', 'success');
}

// ─── Add / Edit Distribution ──────────────────────────────────────────────────
function openAddDist(oppId) {
  editDistOppId = oppId;
  editDistId    = null;
  document.getElementById('dist-modal-title').textContent = 'إضافة توزيعة';
  document.getElementById('dist-month').value  = new Date().getMonth() + 1;
  document.getElementById('dist-year').value   = new Date().getFullYear();
  document.getElementById('dist-amount').value = '';
  buildDistStatusSelect(null);
  document.getElementById('dist-modal').classList.add('open');
  document.getElementById('dist-amount').focus();
}

function openEditDist(oppId, distId) {
  const o = store.opportunities.find(x => x.id === oppId);
  const d = o && (o.distributions || []).find(x => x.id === distId);
  if (!d) return;
  editDistOppId = oppId;
  editDistId    = distId;
  document.getElementById('dist-modal-title').textContent = 'تعديل التوزيعة';
  document.getElementById('dist-month').value  = d.month;
  document.getElementById('dist-year').value   = d.year;
  document.getElementById('dist-amount').value = d.amount;
  buildDistStatusSelect(d.status);
  document.getElementById('dist-modal').classList.add('open');
}

function buildDistStatusSelect(selected) {
  const sel = document.getElementById('dist-status');
  sel.innerHTML = store.distStatuses.map(s =>
    `<option value="${esc(s)}" ${s === selected ? 'selected' : ''}>${esc(s)}</option>`
  ).join('');
}

function closeDistModal() {
  document.getElementById('dist-modal').classList.remove('open');
  editDistOppId = null;
  editDistId    = null;
}

function saveDist() {
  const month  = parseInt(document.getElementById('dist-month').value);
  const year   = parseInt(document.getElementById('dist-year').value);
  const amount = parseFloat(document.getElementById('dist-amount').value);
  const status = document.getElementById('dist-status').value;

  if (!month || !year || isNaN(amount)) {
    showToast('يرجى تعبئة جميع الحقول', 'error');
    return;
  }

  const o = store.opportunities.find(x => x.id === editDistOppId);
  if (!o) return;
  if (!o.distributions) o.distributions = [];

  if (editDistId) {
    const d = o.distributions.find(x => x.id === editDistId);
    Object.assign(d, { month, year, amount, status });
    showToast('تم تحديث التوزيعة', 'success');
  } else {
    o.distributions.push({ id: uid(), month, year, amount, status });
    showToast('تم إضافة التوزيعة', 'success');
  }

  saveStore(store);
  closeDistModal();
  renderDashboard();
  renderOpportunities();
}

// ─── Delete Distribution ──────────────────────────────────────────────────────
function confirmDeleteDist(oppId, distId) {
  pendingDeleteDistOppId = oppId;
  pendingDeleteDistId    = distId;
  const o = store.opportunities.find(x => x.id === oppId);
  const d = o && (o.distributions || []).find(x => x.id === distId);
  if (!d) return;
  const month = MONTHS_AR[(+d.month || 1) - 1];
  document.getElementById('del-dist-name').textContent = `توزيعة ${month} ${d.year}`;
  document.getElementById('del-dist-modal').classList.add('open');
}

function closeDelDistModal() {
  document.getElementById('del-dist-modal').classList.remove('open');
  pendingDeleteDistOppId = null;
  pendingDeleteDistId    = null;
}

function executeDeleteDist() {
  const o = store.opportunities.find(x => x.id === pendingDeleteDistOppId);
  if (o) o.distributions = (o.distributions || []).filter(d => d.id !== pendingDeleteDistId);
  saveStore(store);
  closeDelDistModal();
  renderDashboard();
  renderOpportunities();
  showToast('تم حذف التوزيعة', 'success');
}

// ─── Status Management Modal ──────────────────────────────────────────────────
function openStatusMgr() {
  renderStatusMgr();
  document.getElementById('status-mgr-modal').classList.add('open');
}

function closeStatusMgr() {
  document.getElementById('status-mgr-modal').classList.remove('open');
}

function renderStatusMgr() {
  renderStatusList('opp-statuses-list', store.oppStatuses, 'opp');
  renderStatusList('dist-statuses-list', store.distStatuses, 'dist');
}

function renderStatusList(containerId, statuses, type) {
  const el = document.getElementById(containerId);
  el.innerHTML = statuses.map((s, i) => `
    <div class="status-item">
      <span>${esc(s)}</span>
      <button class="btn-icon-sm danger" onclick="deleteStatus('${type}', ${i})" title="حذف">×</button>
    </div>`).join('');
}

function deleteStatus(type, idx) {
  if (type === 'opp') {
    if (store.oppStatuses.length <= 1) { showToast('يجب أن تبقى حالة واحدة على الأقل', 'error'); return; }
    store.oppStatuses.splice(idx, 1);
  } else {
    if (store.distStatuses.length <= 1) { showToast('يجب أن تبقى حالة واحدة على الأقل', 'error'); return; }
    store.distStatuses.splice(idx, 1);
  }
  saveStore(store);
  renderStatusMgr();
}

function addStatus(type) {
  const inputId = type === 'opp' ? 'new-opp-status' : 'new-dist-status';
  const name    = document.getElementById(inputId).value.trim();
  if (!name) return;
  const list = type === 'opp' ? store.oppStatuses : store.distStatuses;
  if (list.includes(name)) { showToast('الحالة موجودة مسبقاً', 'error'); return; }
  list.push(name);
  document.getElementById(inputId).value = '';
  saveStore(store);
  renderStatusMgr();
  showToast('تمت إضافة الحالة', 'success');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeOppModal(); closeDistModal();
    closeDelOppModal(); closeDelDistModal(); closeStatusMgr();
  }
});
