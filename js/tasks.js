/* =====================================================================
   tasks.js — مهام المحفظة
   مهام يدوية (4 أنواع) + تنبيهات تلقائية من أهداف المحفظة
   كل شيء محفوظ — Soft-delete فقط، لا حذف حقيقي
   =====================================================================
   جدول Supabase المطلوب (portfolio_tasks):
   --------------------------------------------------------------------
   CREATE TABLE portfolio_tasks (
     id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     user_id       UUID REFERENCES auth.users NOT NULL,
     type          TEXT NOT NULL CHECK (type IN ('liquidation','reduction','monitoring','accumulation')),
     ticker        TEXT,
     name          TEXT,
     status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','cancelled')),
     notes         TEXT,
     target_price  NUMERIC,
     reduction_pct NUMERIC,
     year          INT DEFAULT EXTRACT(YEAR FROM NOW()),
     auto_generated BOOLEAN DEFAULT FALSE,
     created_at    TIMESTAMPTZ DEFAULT NOW(),
     updated_at    TIMESTAMPTZ DEFAULT NOW(),
     closed_at     TIMESTAMPTZ,
     archived_at   TIMESTAMPTZ
   );
   ALTER TABLE portfolio_tasks ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "users_own_tasks" ON portfolio_tasks USING (auth.uid() = user_id);
   ===================================================================== */

'use strict';

let _tasks       = [];
let _holdings    = [];
let _stockTargets  = {};
let _sectorTargets = {};
let _totalValue    = 0;
let _editingTaskId = null;
let _selectedType  = null;
let _filterYear    = 'all';
let _filterType    = 'all';

const TYPE_META = {
  liquidation:  { label:'تصفية كاملة',   icon:'🔴', badge:'badge-liquidation' },
  reduction:    { label:'تخفيف',          icon:'⚖️', badge:'badge-reduction'  },
  monitoring:   { label:'تحت المراقبة',  icon:'👁', badge:'badge-monitoring' },
  accumulation: { label:'تجميع / إضافة', icon:'🟢', badge:'badge-accumulation'},
};

// ── Init ──────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-tasks');

  const [rT, rH, rSt, rSec] = await Promise.all([
    supabaseClient.from('portfolio_tasks').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('holdings').select('*'),
    supabaseClient.from('stock_targets').select('*'),
    supabaseClient.from('sector_targets').select('*'),
  ]);

  _tasks   = rT.data   || [];
  _holdings = rH.data  || [];
  _totalValue = _holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  _stockTargets  = {};
  (rSt.data  || []).forEach(r => { _stockTargets[r.ticker]  = +r.target_pct; });
  _sectorTargets = {};
  (rSec.data || []).forEach(r => { _sectorTargets[r.sector] = +r.target_pct; });

  buildYearPills();
  renderKPIs();
  renderAutoAlerts();
  applyFilters();
}

// ── Year pills ────────────────────────────────────────────────────────
function buildYearPills() {
  const years = ['all', ...new Set(_tasks.map(t => t.year || new Date(t.created_at).getFullYear()))].sort((a,b) => a === 'all' ? -1 : b - a);
  const curYr = new Date().getFullYear();
  const el    = document.getElementById('year-pills');
  if (!el) return;

  el.innerHTML = years.map(y => {
    const label = y === 'all' ? 'كل السنوات' : y;
    const active = (y === curYr.toString() || (y === 'all' && !years.includes(curYr.toString()))) && _filterYear === 'all'
      ? (y === 'all') : String(y) === String(_filterYear);
    return `<button class="year-pill${active?' active':''}" onclick="filterByYear('${y}')">${label}</button>`;
  }).join('');

  // default to current year
  if (_filterYear === 'all' && years.includes(curYr)) filterByYear(curYr);
}

function filterByYear(yr) {
  _filterYear = String(yr);
  document.querySelectorAll('#year-pills .year-pill').forEach(p => {
    p.classList.toggle('active', p.textContent.trim() === (yr === 'all' ? 'كل السنوات' : String(yr)));
  });
  applyFilters();
}

function filterByType(type) {
  _filterType = type;
  document.querySelectorAll('#type-pills .year-pill').forEach(p => {
    p.classList.toggle('active', p.getAttribute('onclick') === `filterByType('${type}')`);
  });
  applyFilters();
}

// ── KPIs ──────────────────────────────────────────────────────────────
function renderKPIs() {
  const curYr  = new Date().getFullYear();
  const active = _tasks.filter(t => t.status === 'active' && !t.auto_generated).length;
  const done   = _tasks.filter(t => t.status === 'done' && new Date(t.closed_at || t.updated_at).getFullYear() === curYr).length;
  const canc   = _tasks.filter(t => t.status === 'cancelled').length;
  const alerts = buildAutoAlerts().length;

  setText('tk-active',    active);
  setText('tk-done',      done);
  setText('tk-cancelled', canc);
  setText('tk-alerts',    alerts);
}

// ── Auto-alerts from targets ──────────────────────────────────────────
function buildAutoAlerts() {
  const alerts = [];
  const THRESHOLD = 1.5; // % انحراف عن الهدف

  // أسهم
  _holdings.forEach(h => {
    const target  = _stockTargets[h.ticker];
    if (!target) return;
    const current = _totalValue > 0 ? (+h.shares * +h.current_price) / _totalValue * 100 : 0;
    const diff    = current - target;
    if (Math.abs(diff) > THRESHOLD) {
      alerts.push({
        id:     `auto-stock-${h.ticker}`,
        ticker: h.ticker,
        name:   h.name || h.ticker,
        type:   diff > 0 ? 'reduction' : 'accumulation',
        msg:    diff > 0
          ? `زاد عن الهدف بـ ${diff.toFixed(1)}% (حالي: ${current.toFixed(1)}% | هدف: ${target}%)`
          : `نقص عن الهدف بـ ${Math.abs(diff).toFixed(1)}% (حالي: ${current.toFixed(1)}% | هدف: ${target}%)`,
        diff: Math.abs(diff),
      });
    }
  });

  // قطاعات
  const sectorValMap = {};
  _holdings.forEach(h => {
    const sec = (h.sector || '').trim() || 'غير مصنف';
    sectorValMap[sec] = (sectorValMap[sec] || 0) + +h.shares * +h.current_price;
  });
  Object.entries(_sectorTargets).forEach(([sec, target]) => {
    if (!target) return;
    const current = _totalValue > 0 ? (sectorValMap[sec] || 0) / _totalValue * 100 : 0;
    const diff    = current - target;
    if (Math.abs(diff) > THRESHOLD) {
      alerts.push({
        id:     `auto-sector-${sec}`,
        ticker: null,
        name:   `قطاع: ${sec}`,
        type:   diff > 0 ? 'reduction' : 'accumulation',
        msg:    diff > 0
          ? `زاد عن الهدف بـ ${diff.toFixed(1)}% (حالي: ${current.toFixed(1)}% | هدف: ${target}%)`
          : `نقص عن الهدف بـ ${Math.abs(diff).toFixed(1)}% (حالي: ${current.toFixed(1)}% | هدف: ${target}%)`,
        diff: Math.abs(diff),
      });
    }
  });

  alerts.sort((a, b) => b.diff - a.diff);
  return alerts;
}

function renderAutoAlerts() {
  const alerts = buildAutoAlerts();
  const el     = document.getElementById('auto-alerts-body');
  if (!el) return;

  if (!alerts.length) {
    document.getElementById('auto-alerts-section').style.display = 'none';
    return;
  }
  document.getElementById('auto-alerts-section').style.display = '';

  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">` +
    alerts.map(a => {
      const meta = TYPE_META[a.type] || {};
      return `<div class="task-item auto-alert" style="background:var(--bg-3)">
        <div class="task-type-icon">${meta.icon || '⚠️'}</div>
        <div class="task-body">
          <div class="task-header">
            ${a.ticker ? `<span class="task-ticker">${esc(a.ticker)}</span>` : ''}
            <span class="task-name">${esc(a.name)}</span>
            <span class="task-badge badge-auto">تلقائي</span>
            <span class="task-badge ${meta.badge}">${meta.label}</span>
          </div>
          <div class="task-notes" style="color:var(--accent)">${esc(a.msg)}</div>
        </div>
      </div>`;
    }).join('') + `</div>
    <p class="small text-muted" style="margin-top:10px">
      * الانحراف المعتبر: أكثر من ${1.5}% عن الهدف | لتعديل الأهداف: <a href="targets.html" style="color:var(--accent)">صفحة الأهداف</a>
    </p>`;
}

// ── Apply filters & render tasks ──────────────────────────────────────
function applyFilters() {
  const statusF = document.getElementById('status-filter')?.value || 'active';

  let filtered = _tasks.filter(t => !t.auto_generated);

  if (_filterYear !== 'all') {
    filtered = filtered.filter(t => {
      const yr = t.year || new Date(t.created_at).getFullYear();
      return String(yr) === String(_filterYear);
    });
  }

  if (statusF !== 'all') filtered = filtered.filter(t => t.status === statusF);

  if (_filterType !== 'all') filtered = filtered.filter(t => t.type === _filterType);

  const active   = filtered.filter(t => t.status === 'active');
  const archived = filtered.filter(t => t.status !== 'active');

  const countEl = document.getElementById('tasks-count-label');
  if (countEl) countEl.textContent = `${active.length} مهمة نشطة`;

  renderTaskBoard('tasks-board',  active);
  renderTaskBoard('archive-board', archived);
}

function renderTaskBoard(boardId, tasks) {
  const board = document.getElementById(boardId);
  if (!board) return;

  if (!tasks.length) {
    board.innerHTML = `<div class="empty-state" style="padding:24px"><div class="icon">📋</div><p class="small text-muted">لا توجد مهام هنا</p></div>`;
    return;
  }

  board.innerHTML = tasks.map(t => {
    const meta    = TYPE_META[t.type] || { label:t.type, icon:'📌', badge:'' };
    const isDone  = t.status === 'done';
    const isCancl = t.status === 'cancelled';
    const cls     = isDone ? 'done' : isCancl ? 'cancelled' : '';
    const dateStr = formatDate(t.created_at?.slice(0,10) || '');
    const closedStr = t.closed_at ? ' · أُغلقت ' + formatDate(t.closed_at.slice(0,10)) : '';

    const extraInfo = [];
    if (t.target_price)  extraInfo.push(`🎯 سعر التجميع: أقل من ${formatSAR(t.target_price)}`);
    if (t.reduction_pct) extraInfo.push(`📉 نسبة التخفيف: ${t.reduction_pct}%`);

    return `<div class="task-item ${cls}">
      <div class="task-type-icon">${meta.icon}</div>
      <div class="task-body">
        <div class="task-header">
          ${t.ticker ? `<span class="task-ticker">${esc(t.ticker)}</span>` : ''}
          ${t.name   ? `<span class="task-name">${esc(t.name)}</span>` : ''}
          <span class="task-badge ${meta.badge}">${meta.label}</span>
          <span class="task-badge badge-status-${t.status}">${t.status === 'active' ? 'نشطة' : t.status === 'done' ? 'منجزة ✅' : 'ملغاة ❌'}</span>
        </div>
        ${extraInfo.length ? `<div class="task-notes" style="color:var(--accent);font-size:0.8rem">${extraInfo.join(' · ')}</div>` : ''}
        ${t.notes ? `<div class="task-notes">${esc(t.notes)}</div>` : ''}
        <div class="task-meta">أُضيفت ${dateStr}${closedStr}</div>
      </div>
      <div class="task-actions">
        ${t.status === 'active' ? `
          <button class="btn btn-success btn-sm" onclick="closeTask('${esc(t.id)}','done')">✅ منجز</button>
          <button class="btn btn-secondary btn-sm" onclick="openTaskModal('${esc(t.id)}')">تعديل</button>
          <button class="btn btn-danger btn-sm"   onclick="closeTask('${esc(t.id)}','cancelled')">❌ إلغاء</button>
        ` : `
          <button class="btn btn-secondary btn-sm" onclick="reopenTask('${esc(t.id)}')">↩ إعادة فتح</button>
        `}
      </div>
    </div>`;
  }).join('');
}

// ── Task modal ────────────────────────────────────────────────────────
function openTaskModal(id = null) {
  _editingTaskId = id;
  const titleEl = document.getElementById('task-modal-title');
  if (titleEl) titleEl.textContent = id ? 'تعديل المهمة' : 'مهمة جديدة';

  if (id) {
    const t = _tasks.find(x => x.id === id);
    if (!t) return;
    selectTaskType(t.type);
    document.getElementById('task-ticker').value = t.ticker || '';
    document.getElementById('task-name').value   = t.name   || '';
    document.getElementById('task-notes').value  = t.notes  || '';
    if (t.target_price)  document.getElementById('task-price').value = t.target_price;
    if (t.reduction_pct) document.getElementById('task-pct').value   = t.reduction_pct;
  } else {
    _selectedType = null;
    document.querySelectorAll('.type-option').forEach(o => o.classList.remove('selected'));
    ['task-ticker','task-name','task-notes','task-price','task-pct'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('task-price-group').style.display = 'none';
    document.getElementById('task-pct-group').style.display   = 'none';
  }

  document.getElementById('task-modal').style.display = 'flex';
}

function closeTaskModal() {
  document.getElementById('task-modal').style.display = 'none';
  _editingTaskId = null; _selectedType = null;
}

function closeTaskModalOverlay(e) {
  if (e.target.id === 'task-modal') closeTaskModal();
}

function selectTaskType(type) {
  _selectedType = type;
  document.querySelectorAll('.type-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.type === type);
  });
  document.getElementById('task-price-group').style.display = type === 'accumulation' ? '' : 'none';
  document.getElementById('task-pct-group').style.display   = type === 'reduction'    ? '' : 'none';
}

function onTaskTickerInput() {
  const ticker = document.getElementById('task-ticker')?.value?.trim()?.toUpperCase();
  if (!ticker) return;
  const nameEl = document.getElementById('task-name');
  if (!nameEl || nameEl.value) return;
  // Try to fill from holdings
  const h = _holdings.find(x => x.ticker === ticker);
  if (h) nameEl.value = h.name || '';
}

async function saveTask() {
  if (!_selectedType) { showToast('اختر نوع المهمة أولاً', 'error'); return; }

  const ticker = document.getElementById('task-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('task-name').value.trim();
  const notes  = document.getElementById('task-notes').value.trim();
  const price  = +document.getElementById('task-price').value || null;
  const pct    = +document.getElementById('task-pct').value   || null;

  if (!ticker && !notes) { showToast('أدخل رمز السهم أو ملاحظات على الأقل', 'error'); return; }
  if (price !== null && price <= 0)    { showToast('السعر المستهدف يجب أن يكون أكبر من صفر', 'error'); return; }
  if (pct   !== null && (pct <= 0 || pct > 100)) { showToast('نسبة التخفيف يجب أن تكون بين 1% و100%', 'error'); return; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  const now = new Date().toISOString();

  const payload = {
    user_id:       user.id,
    type:          _selectedType,
    ticker:        ticker || null,
    name:          name   || null,
    notes:         notes  || null,
    target_price:  price,
    reduction_pct: pct,
    status:        _editingTaskId
                  ? (_tasks.find(t => t.id === _editingTaskId)?.status || 'active')
                  : 'active',
    year:          new Date().getFullYear(),
    auto_generated: false,
    updated_at:    now,
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
  closeTaskModal();
  await reloadTasks();
}

async function closeTask(id, newStatus) {
  const lbl = newStatus === 'done' ? 'إغلاق كمنجزة' : 'إلغاء';
  if (!confirm(`هل تريد ${lbl} هذه المهمة؟`)) return;
  const { error } = await supabaseClient.from('portfolio_tasks').update({
    status:     newStatus,
    closed_at:  new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(newStatus === 'done' ? '✅ تم الإغلاق كمنجزة' : '❌ تم الإلغاء', 'success');
  await reloadTasks();
}

async function reopenTask(id) {
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
  buildYearPills();
  renderKPIs();
  renderAutoAlerts();
  applyFilters();
}

// ── Helpers ────────────────────────────────────────────────────────────
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

document.addEventListener('DOMContentLoaded', init);
