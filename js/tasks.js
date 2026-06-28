// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'tasks': {
    title: '📊 التقييمات العادلة',
    body: `
      <p>خطة الأسعار اليدوية لكل سهم في محفظتك — تقرّرها بعقلٍ بارد وقت التحليل، ويستهلكها <strong>محرّك القرار</strong> آلياً.</p>
      <div class="info-math">🟢 تجميع &nbsp;·&nbsp; ⚖️ تخفيف &nbsp;·&nbsp; 🔴 متضخّم مالياً &nbsp;·&nbsp; القرار النهائي</div>
      <p class="info-note">💡 كل كرت يعرض الرمز، الوزن الحالي، الهدف، خطة الأسعار، والقرار النهائي. لا شيء يُحذف — أرشفة فقط.</p>`
  },
};

'use strict';

let _tasks         = [];
let _holdings      = [];
let _stockTargets  = {};
let _totalValue    = 0;
let _editingTaskId = null;
let _selectedType  = null;
let _filterType    = 'all';

const TYPE_META = {
  liquidation:  { label:'تصفية كاملة',   icon:'🔴' },
  reduction:    { label:'تخفيف',          icon:'⚖️' },
  monitoring:   { label:'مراقبة',         icon:'👁' },
  accumulation: { label:'تجميع / إضافة', icon:'🟢' },
  hold:         { label:'احتفاظ',         icon:'🔵' },
};

// ── Init ──────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-tasks');

  const [rT, rH, rSt] = await Promise.all([
    supabaseClient.from('portfolio_tasks').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('holdings').select('*'),
    supabaseClient.from('stock_targets').select('*'),
  ]);

  _tasks        = rT.data  || [];
  _holdings     = rH.data  || [];
  _totalValue   = _holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  _stockTargets = {};
  (rSt.data || []).forEach(r => { _stockTargets[r.ticker] = +r.target_pct; });

  renderKPIs();
  applyFilters();
}

// ── KPIs ──────────────────────────────────────────────────────────────
function renderKPIs() {
  const curYr  = new Date().getFullYear();
  const active = _tasks.filter(t => t.status === 'active' && !t.auto_generated).length;
  const done   = _tasks.filter(t => t.status === 'done' && new Date(t.closed_at || t.updated_at).getFullYear() === curYr).length;
  const canc   = _tasks.filter(t => t.status === 'cancelled').length;
  setText('tk-active',    active);
  setText('tk-done',      done);
  setText('tk-cancelled', canc);
}

// ── Filter ────────────────────────────────────────────────────────────
function filterByType(type) {
  _filterType = type;
  document.querySelectorAll('#type-pills .filter-pill').forEach(p => {
    p.classList.toggle('active', p.getAttribute('onclick') === `filterByType('${type}')`);
  });
  applyFilters();
}

function applyFilters() {
  const statusF = document.getElementById('status-filter')?.value || 'active';
  let filtered = _tasks.filter(t => !t.auto_generated);
  if (statusF !== 'all') filtered = filtered.filter(t => t.status === statusF);
  if (_filterType !== 'all') filtered = filtered.filter(t => t.type === _filterType);

  const active   = filtered.filter(t => t.status === 'active');
  const archived = filtered.filter(t => t.status !== 'active');

  const countEl = document.getElementById('tasks-count-label');
  if (countEl) countEl.textContent = `${active.length} تقييم نشط`;

  renderValGrid('val-grid',     active);
  renderValGrid('archive-grid', archived);
}

// ── Render valuation cards ────────────────────────────────────────────
function renderValGrid(gridId, tasks) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  if (!tasks.length) {
    grid.innerHTML = `<div class="empty-state" style="padding:24px;grid-column:1/-1"><div class="icon">📊</div><p class="small text-muted">لا توجد تقييمات هنا</p></div>`;
    return;
  }

  grid.innerHTML = tasks.map(t => buildCard(t)).join('');
}

function buildCard(t) {
  const meta    = TYPE_META[t.type] || { label: t.type, icon: '📌' };
  const decCls  = `dec-${t.type}`;
  const statCls = t.status !== 'active' ? `status-${t.status}` : '';

  // ── Weight info ──
  const tk = (t.ticker || '').trim().toUpperCase();
  const h  = _holdings.find(x => String(x.ticker).trim().toUpperCase() === tk);
  const target = _stockTargets[tk] ?? _stockTargets[t.ticker] ?? null;
  let currentPct = null;
  if (h && _totalValue > 0) currentPct = (+h.shares * +h.current_price) / _totalValue * 100;

  let weightHtml = '';
  if (currentPct !== null || target !== null) {
    let pills = [];
    if (currentPct !== null) {
      pills.push(`<span class="vc-pill">📊 النسبة الحالية: <strong>${currentPct.toFixed(1)}%</strong></span>`);
    } else {
      pills.push(`<span class="vc-pill" style="opacity:.6;font-style:italic">📊 غير موجود في المحفظة</span>`);
    }
    if (target !== null) {
      pills.push(`<span class="vc-pill">🎯 الهدف: <strong>${target.toFixed(1)}%</strong></span>`);
      if (currentPct !== null) {
        const diff  = currentPct - target;
        const ok    = Math.abs(diff) <= 1.5;
        const cls   = ok ? 'gap-ok' : (diff > 0 ? 'gap-up' : 'gap-down');
        const sign  = diff > 0 ? '+' : '';
        const lbl   = ok ? '✓ مطابق للهدف' : `${diff > 0 ? '▲' : '▼'} ${sign}${diff.toFixed(1)}%`;
        pills.push(`<span class="vc-pill ${cls}">${lbl}</span>`);
      }
    }
    weightHtml = `<div class="vc-weight-row">${pills.join('')}</div>`;
  }

  // ── Price plan ──
  const priceRows = [];
  const accVal  = t.accumulate_at   ?? (t.type === 'accumulation' ? t.target_price : null);
  const trimFrom= t.trim_from;
  const trimTo  = t.trim_to;
  const liqVal  = t.liquidate_above;

  if (accVal)   priceRows.push(`<div class="vc-price-row"><span class="pr-label">🟢 تجميع عند ≤</span><span class="pr-val pr-acc">${formatSAR(accVal)}</span></div>`);
  if (trimFrom) priceRows.push(`<div class="vc-price-row"><span class="pr-label">⚖️ تخفيف من</span><span class="pr-val pr-trim">${formatSAR(trimFrom)}</span></div>`);
  if (trimTo)   priceRows.push(`<div class="vc-price-row"><span class="pr-label">⚖️ تخفيف إلى</span><span class="pr-val pr-trim">${formatSAR(trimTo)}</span></div>`);
  if (liqVal)   priceRows.push(`<div class="vc-price-row"><span class="pr-label">🔴 متضخّم — تصفية فوق</span><span class="pr-val pr-liq">${formatSAR(liqVal)}</span></div>`);

  const pricesHtml = priceRows.length
    ? `<div class="vc-prices">${priceRows.join('')}</div>`
    : '';

  // ── Date ──
  const wasEdited = t.updated_at && t.created_at && t.updated_at.slice(0,10) !== t.created_at.slice(0,10);
  const dateStr   = wasEdited
    ? 'آخر تعديل ' + formatDate(t.updated_at.slice(0,10))
    : 'تاريخ التحليل ' + formatDate(t.created_at?.slice(0,10) || '');
  const closedStr = t.closed_at ? ' · أُغلق ' + formatDate(t.closed_at.slice(0,10)) : '';

  // ── Status badge ──
  const statusLabel = t.status === 'active' ? '' :
    (t.status === 'done' ? '<span style="font-size:.7rem;color:#3fb950">✅ منجز</span>' : '<span style="font-size:.7rem;color:#f85149">❌ ملغى</span>');

  // ── Actions ──
  const actionsHtml = t.status === 'active'
    ? `<button class="btn btn-success btn-sm" onclick="closeTask('${esc(t.id)}','done')" title="منجز">✅</button>
       <button class="btn btn-secondary btn-sm" onclick="openValModal('${esc(t.id)}')" title="تعديل">✏️</button>
       <button class="btn btn-danger btn-sm" onclick="closeTask('${esc(t.id)}','cancelled')" title="إلغاء">❌</button>`
    : `<button class="btn btn-secondary btn-sm" onclick="reopenTask('${esc(t.id)}')" title="إعادة فتح">↩</button>`;

  return `<div class="val-card ${decCls} ${statCls}">
    <div class="vc-actions">${actionsHtml}</div>
    <div class="vc-header">
      ${t.ticker ? `<span class="vc-ticker">${esc(t.ticker)}</span>` : ''}
      ${t.name   ? `<span class="vc-name">${esc(t.name)}</span>`   : ''}
      <span class="vc-dec-badge">${meta.icon} ${meta.label}</span>
      ${statusLabel}
    </div>
    ${weightHtml}
    ${pricesHtml}
    ${t.notes ? `<div class="vc-notes">${esc(t.notes)}</div>` : ''}
    <div class="vc-date">${dateStr}${closedStr}</div>
  </div>`;
}

// ── Modal ─────────────────────────────────────────────────────────────
function openValModal(id = null) {
  _editingTaskId = id;
  document.getElementById('val-modal-title').textContent = id ? 'تعديل التقييم' : 'تقييم جديد';

  if (id) {
    const t = _tasks.find(x => x.id === id);
    if (!t) return;
    selectDecision(t.type);
    document.getElementById('task-ticker').value    = t.ticker || '';
    document.getElementById('task-name').value      = t.name   || '';
    document.getElementById('task-notes').value     = t.notes  || '';
    document.getElementById('task-accumulate').value= t.accumulate_at ?? t.target_price ?? '';
    document.getElementById('task-liquidate').value = t.liquidate_above ?? '';
    document.getElementById('task-trim-from').value = t.trim_from ?? '';
    document.getElementById('task-trim-to').value   = t.trim_to ?? '';
  } else {
    _selectedType = null;
    document.querySelectorAll('.dec-option').forEach(o => o.classList.remove('selected'));
    ['task-ticker','task-name','task-notes','task-accumulate','task-liquidate','task-trim-from','task-trim-to'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  }

  document.getElementById('val-modal').style.display = 'flex';
}

function closeValModal() {
  document.getElementById('val-modal').style.display = 'none';
  _editingTaskId = null; _selectedType = null;
}

async function closeValModalWithConfirm() {
  if (!await confirmAsync('هل تريد إلغاء التعديل؟ ستُفقد التغييرات غير المحفوظة.')) return;
  closeValModal();
}

async function closeValModalOverlay(e) {
  if (e.target.id !== 'val-modal') return;
  if (!await confirmAsync('هل تريد إلغاء التعديل؟ ستُفقد التغييرات غير المحفوظة.')) return;
  closeValModal();
}

function selectDecision(type) {
  _selectedType = type;
  document.querySelectorAll('.dec-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.type === type);
  });
}

function onTaskTickerInput() {
  const ticker = document.getElementById('task-ticker')?.value?.trim()?.toUpperCase();
  if (!ticker) return;
  const nameEl = document.getElementById('task-name');
  if (!nameEl || nameEl.value) return;
  const h = _holdings.find(x => x.ticker === ticker);
  if (h) nameEl.value = h.name || '';
}

async function saveTask() {
  if (!_selectedType) { showToast('اختر القرار النهائي أولاً', 'error'); return; }

  const ticker    = document.getElementById('task-ticker').value.trim().toUpperCase();
  const name      = document.getElementById('task-name').value.trim();
  const notes     = document.getElementById('task-notes').value.trim();
  const accumulate= +document.getElementById('task-accumulate').value || null;
  const liquidate = +document.getElementById('task-liquidate').value  || null;
  const trimFrom  = +document.getElementById('task-trim-from').value  || null;
  const trimTo    = +document.getElementById('task-trim-to').value    || null;

  if (!ticker && !notes) { showToast('أدخل رمز السهم أو ملاحظات على الأقل', 'error'); return; }

  const prices = { 'تجميع عند': accumulate, 'تصفية فوق': liquidate, 'تخفيف من': trimFrom, 'تخفيف إلى': trimTo };
  for (const [lbl, v] of Object.entries(prices)) {
    if (v !== null && v <= 0) { showToast(`سعر «${lbl}» يجب أن يكون أكبر من صفر`, 'error'); return; }
  }
  if (trimFrom !== null && trimTo !== null && trimTo < trimFrom) {
    showToast('سعر «تخفيف إلى» يجب أن يكون ≥ «تخفيف من»', 'error'); return;
  }

  const confirmMsg = _editingTaskId ? 'هل تريد حفظ التعديلات على التقييم؟' : 'هل تريد إضافة هذا التقييم؟';
  if (!await confirmAsync(confirmMsg)) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  const now = new Date().toISOString();

  const payload = {
    user_id:         user.id,
    type:            _selectedType,
    ticker:          ticker || null,
    name:            name   || null,
    notes:           notes  || null,
    accumulate_at:   accumulate,
    liquidate_above: liquidate,
    trim_from:       trimFrom,
    trim_to:         trimTo,
    status:          _editingTaskId
                     ? (_tasks.find(t => t.id === _editingTaskId)?.status || 'active')
                     : 'active',
    year:            _editingTaskId
                     ? (_tasks.find(t => t.id === _editingTaskId)?.year || new Date().getFullYear())
                     : new Date().getFullYear(),
    auto_generated:  false,
    updated_at:      now,
  };

  let error;
  if (_editingTaskId) {
    ({ error } = await supabaseClient.from('portfolio_tasks').update(payload).eq('id', _editingTaskId));
  } else {
    payload.created_at = now;
    ({ error } = await supabaseClient.from('portfolio_tasks').insert([payload]));
  }

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(_editingTaskId ? 'تم التحديث ✓' : 'تمت الإضافة ✓', 'success');
  closeValModal();
  await reloadTasks();
}

async function closeTask(id, newStatus) {
  const lbl = newStatus === 'done' ? 'إغلاق كمنجز' : 'إلغاء';
  if (!await confirmAsync(`هل تريد ${lbl} هذا التقييم؟`)) return;
  const { error } = await supabaseClient.from('portfolio_tasks').update({
    status:     newStatus,
    closed_at:  new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(newStatus === 'done' ? '✅ تم الإغلاق' : '❌ تم الإلغاء', 'success');
  await reloadTasks();
}

async function reopenTask(id) {
  if (!await confirmAsync('هل تريد إعادة فتح هذا التقييم؟')) return;
  const { error } = await supabaseClient.from('portfolio_tasks').update({
    status:     'active',
    closed_at:  null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('↩ تم إعادة الفتح', 'success');
  await reloadTasks();
}

async function reloadTasks() {
  const { data } = await supabaseClient.from('portfolio_tasks')
    .select('*').order('created_at', { ascending: false });
  _tasks = data || [];
  renderKPIs();
  applyFilters();
}

// ── Helpers ────────────────────────────────────────────────────────────
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

document.addEventListener('DOMContentLoaded', init);
