// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'tasks': {
    title: '📋 مهام المحفظة',
    body: `
      <p>خطة الأسعار اليدوية لكل سهم في محفظتك — تقرّرها بعقلٍ بارد وقت التحليل، ويستهلكها <strong>محرّك القرار</strong> آلياً.</p>
      <div class="info-math">🟢 تجميع عند سعر ≤ &nbsp;·&nbsp; ⚖️ تخفيف من–إلى &nbsp;·&nbsp; 🔴 تصفية إذا تجاوز (سعر التضخّم)</div>
      <p class="info-note">💡 السعر الحالي يأتي من لوحة التحكم. إذا تجاوز السعر حدّ «التصفية» → المحرّك يطلّع تصفية فوراً. لا شيء يُحذف — أرشفة فقط.</p>`
  },
};

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
     type          TEXT NOT NULL CHECK (type IN ('liquidation','reduction','monitoring','accumulation','hold')),
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
  hold:         { label:'احتفاظ',         icon:'🔵', badge:'badge-hold'       },
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

  setText('tk-active',    active);
  setText('tk-done',      done);
  setText('tk-cancelled', canc);
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
    const wasEdited = t.updated_at && t.created_at && t.updated_at.slice(0,10) !== t.created_at.slice(0,10);
    const dateStr   = wasEdited
      ? 'آخر تعديل ' + formatDate(t.updated_at.slice(0,10))
      : 'أُضيفت '    + formatDate(t.created_at?.slice(0,10) || '');
    const closedStr = t.closed_at ? ' · أُغلقت ' + formatDate(t.closed_at.slice(0,10)) : '';

    const extraInfo = [];
    if (t.accumulate_at)   extraInfo.push(`🟢 تجميع عند ≤ ${formatSAR(t.accumulate_at)}`);
    if (t.trim_from || t.trim_to) extraInfo.push(`⚖️ تخفيف ${t.trim_from ? 'من ' + formatSAR(t.trim_from) : ''}${t.trim_to ? ' إلى ' + formatSAR(t.trim_to) : ''}`.trim());
    if (t.liquidate_above) extraInfo.push(`🔴 تصفية فوق ${formatSAR(t.liquidate_above)}`);
    // توافق مع المهام القديمة قبل تحديث الخانات
    if (t.accumulate_at == null && t.type === 'accumulation' && t.target_price)  extraInfo.push(`🟢 تجميع عند ≤ ${formatSAR(t.target_price)}`);
    if (t.type === 'reduction' && t.reduction_pct && !t.trim_from && !t.trim_to) extraInfo.push(`📉 نسبة التخفيف: ${t.reduction_pct}%`);

    return `<div class="task-item ${cls}">
      <div class="task-type-icon">${meta.icon}</div>
      <div class="task-body">
        <div class="task-header">
          ${t.ticker ? `<span class="task-ticker">${esc(t.ticker)}</span>` : ''}
          ${t.name   ? `<span class="task-name">${esc(t.name)}</span>` : ''}
          <span class="task-badge ${meta.badge}">${meta.label}</span>
          <span class="task-badge badge-status-${t.status}">${t.status === 'active' ? 'نشطة' : t.status === 'done' ? 'منجزة ✅' : 'ملغاة ❌'}</span>
        </div>
        ${tickerPortfolioInfo(t.ticker)}
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
    // خطة الأسعار (مع توافق رجعي: target_price القديم = تجميع)
    document.getElementById('task-accumulate').value = t.accumulate_at ?? t.target_price ?? '';
    document.getElementById('task-liquidate').value  = t.liquidate_above ?? '';
    document.getElementById('task-trim-from').value  = t.trim_from ?? '';
    document.getElementById('task-trim-to').value    = t.trim_to ?? '';
  } else {
    _selectedType = null;
    document.querySelectorAll('.type-option').forEach(o => o.classList.remove('selected'));
    ['task-ticker','task-name','task-notes','task-accumulate','task-liquidate','task-trim-from','task-trim-to'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  }

  document.getElementById('task-modal').style.display = 'flex';
}

function closeTaskModal() {
  document.getElementById('task-modal').style.display = 'none';
  _editingTaskId = null; _selectedType = null;
}

async function closeTaskModalWithConfirm() {
  if (!await confirmAsync('هل تريد إلغاء التعديل؟ ستُفقد التغييرات غير المحفوظة.')) return;
  closeTaskModal();
}

async function closeTaskModalOverlay(e) {
  if (e.target.id !== 'task-modal') return;
  if (!await confirmAsync('هل تريد إلغاء التعديل؟ ستُفقد التغييرات غير المحفوظة.')) return;
  closeTaskModal();
}

function selectTaskType(type) {
  _selectedType = type;
  document.querySelectorAll('.type-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.type === type);
  });
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
  const accumulate = +document.getElementById('task-accumulate').value || null;
  const liquidate  = +document.getElementById('task-liquidate').value  || null;
  const trimFrom   = +document.getElementById('task-trim-from').value  || null;
  const trimTo     = +document.getElementById('task-trim-to').value    || null;

  if (!ticker && !notes) { showToast('أدخل رمز السهم أو ملاحظات على الأقل', 'error'); return; }
  const prices = { 'تجميع عند': accumulate, 'تصفية فوق': liquidate, 'تخفيف من': trimFrom, 'تخفيف إلى': trimTo };
  for (const [lbl, v] of Object.entries(prices)) {
    if (v !== null && v <= 0) { showToast(`سعر «${lbl}» يجب أن يكون أكبر من صفر`, 'error'); return; }
  }
  if (trimFrom !== null && trimTo !== null && trimTo < trimFrom) {
    showToast('سعر «تخفيف إلى» يجب أن يكون ≥ «تخفيف من»', 'error'); return;
  }
  if (liquidate !== null && trimTo !== null && liquidate < trimTo) {
    showToast('سعر «تصفية فوق» يفترض أن يكون ≥ نهاية نطاق التخفيف', 'error'); return;
  }

  const confirmMsg = _editingTaskId ? 'هل تريد حفظ التعديلات على المهمة؟' : 'هل تريد إضافة هذه المهمة؟';
  if (!await confirmAsync(confirmMsg)) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  const now = new Date().toISOString();

  const payload = {
    user_id:       user.id,
    type:          _selectedType,
    ticker:        ticker || null,
    name:          name   || null,
    notes:         notes  || null,
    // خطة الأسعار الثابتة — تُغذّي محرّك القرار (مستقلة عن نوع المهمة)
    accumulate_at:   accumulate,
    liquidate_above: liquidate,
    trim_from:       trimFrom,
    trim_to:         trimTo,
    status:        _editingTaskId
                  ? (_tasks.find(t => t.id === _editingTaskId)?.status || 'active')
                  : 'active',
    // عند التعديل: احتفظ بالسنة الأصلية — لا تُعيّن السنة الحالية
    year: _editingTaskId
      ? (_tasks.find(t => t.id === _editingTaskId)?.year || new Date().getFullYear())
      : new Date().getFullYear(),
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
  if (!await confirmAsync(`هل تريد ${lbl} هذه المهمة؟`)) return;
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
  if (!await confirmAsync('هل تريد إعادة فتح هذه المهمة؟')) return;
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
  applyFilters();
}

// ── معلومات السهم في المحفظة + هدفه المسجّل ──────────────────────────────
// لكل مهمة بها رمز سهم: تعرض نسبته الحالية من المحفظة، والهدف المسجّل له في
// صفحة الأهداف، والانحراف بينهما — لربط المهمة بوضع السهم الفعلي.
function tickerPortfolioInfo(ticker) {
  if (!ticker) return '';
  const tk = String(ticker).trim().toUpperCase();
  const h  = _holdings.find(x => String(x.ticker).trim().toUpperCase() === tk);
  const target = _stockTargets[ticker] != null ? +_stockTargets[ticker]
               : (_stockTargets[tk] != null ? +_stockTargets[tk] : null);

  let currentPct = null;
  if (h && _totalValue > 0) currentPct = (+h.shares * +h.current_price) / _totalValue * 100;

  // لا شيء نعرضه إن لم يكن السهم في المحفظة ولا له هدف
  if (currentPct === null && target === null) return '';

  const parts = [];

  // النسبة الحالية في المحفظة
  if (currentPct !== null) {
    parts.push(`<span class="tk-port-pill">📊 نسبة السهم بالمحفظة: <strong>${currentPct.toFixed(1)}%</strong></span>`);
  } else {
    parts.push(`<span class="tk-port-pill tk-muted">📊 غير موجود في المحفظة حالياً</span>`);
  }

  // الهدف المسجّل في صفحة الأهداف
  if (target !== null) {
    parts.push(`<span class="tk-port-pill">🎯 الهدف المسجّل: <strong>${target.toFixed(1)}%</strong></span>`);
    // الانحراف بين الحالي والهدف
    if (currentPct !== null) {
      const diff = currentPct - target;
      const within = Math.abs(diff) <= 1.5;
      const color  = within ? 'var(--success)' : (diff > 0 ? 'var(--danger)' : 'var(--accent)');
      const arrow  = within ? '✓' : (diff > 0 ? '▲' : '▼');
      const sign   = diff > 0 ? '+' : '';
      const label  = within ? 'مطابق للهدف' : `${arrow} ${sign}${diff.toFixed(1)}%`;
      parts.push(`<span class="tk-port-pill" style="color:${color};font-weight:700">${label}</span>`);
    }
  } else {
    parts.push(`<span class="tk-port-pill tk-muted">🎯 لا هدف مسجّل له</span>`);
  }

  return `<div class="tk-port-row">${parts.join('')}</div>`;
}

// ── Helpers ────────────────────────────────────────────────────────────
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

document.addEventListener('DOMContentLoaded', init);
