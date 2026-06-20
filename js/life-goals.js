// ─── Storage ──────────────────────────────────────────────────────────────────
const GOALS_KEY = 'life_goals_v1';

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'life-goals': {
    title: '🎯 أهداف الحياة',
    body: `
      <p>مكان لتتبّع أهدافك الشخصية والعائلية (سفر، تعليم، سيارة…) بحسب الأولوية والحالة ونسبة الإنجاز.</p>
      <div class="info-formula">متوسط الإنجاز = معدّل نسب تقدّم كل الأهداف</div>
      <p class="info-note">💡 ربط كل هدف بمبلغ وتاريخ مستهدف يجعله قابلاً للقياس بدل أمنية غامضة — «أوفّر 50 ألف للسيارة خلال سنتين» أوضح من «أريد سيارة». حدّث نسبة التقدّم كلما اقتربت.</p>`
  },
};

function loadGoals() {
  try { return JSON.parse(localStorage.getItem(GOALS_KEY)) || []; } catch { return []; }
}
function saveGoals(list) { localStorage.setItem(GOALS_KEY, JSON.stringify(list)); }

let goals = loadGoals();
let editingId = null;
let deletingId = null;

// ─── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;
  // Sync range display on load
  const rng = document.getElementById('g-progress');
  rng.addEventListener('input', () => {
    document.getElementById('g-prog-bar').style.width = rng.value + '%';
  });
  buildAreaFilter();
  renderDash();
  renderTable();
});

// ─── Area filter ──────────────────────────────────────────────────────────────
function buildAreaFilter() {
  const areas = [...new Set(goals.map(g => g.area).filter(Boolean))];
  const sel = document.getElementById('flt-area');
  const cur = sel.value;
  sel.innerHTML = '<option value="">كل المجالات</option>';
  const fixed = ['شخصي','عائلي','مالي','صحي','تعليمي','ديني','مهني','ترفيهي'];
  [...new Set([...fixed, ...areas])].forEach(a => {
    const op = document.createElement('option');
    op.value = op.textContent = a;
    if (a === cur) op.selected = true;
    sel.appendChild(op);
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDash() {
  const total    = goals.length;
  const active   = goals.filter(g => g.status === 'قيد التنفيذ').length;
  const done     = goals.filter(g => g.status === 'مكتمل').length;
  const delayed  = goals.filter(g => g.status === 'مؤجل').length;
  const canceled = goals.filter(g => g.status === 'ملغي').length;
  const avgProg  = total ? Math.round(goals.reduce((s,g)=>s+(+g.progress||0),0)/total) : 0;

  document.getElementById('gl-dash').innerHTML = `
    <div class="gl-card"><div class="lbl">إجمالي الأهداف</div><div class="val">${total}</div></div>
    <div class="gl-card c-active"><div class="lbl">قيد التنفيذ</div><div class="val" style="color:#4ade80">${active}</div></div>
    <div class="gl-card c-done">  <div class="lbl">مكتملة</div>     <div class="val" style="color:#60a5fa">${done}</div></div>
    <div class="gl-card c-delay"> <div class="lbl">مؤجلة</div>      <div class="val" style="color:#fb923c">${delayed}</div></div>
    <div class="gl-card c-cancel"><div class="lbl">ملغية</div>       <div class="val" style="color:#f87171">${canceled}</div></div>
    <div class="gl-card"><div class="lbl">متوسط الإنجاز</div><div class="val">${avgProg}%</div>
      <div class="progress-wrap" style="margin-top:8px"><div class="progress-bar" style="width:${avgProg}%"></div></div>
    </div>`;
}

// ─── Table ────────────────────────────────────────────────────────────────────
const PRI_CLASS = {
  'هام وعاجل':          'pri-1',
  'هام وغير عاجل':      'pri-2',
  'عاجل وغير هام':      'pri-3',
  'غير عاجل وغير هام':  'pri-4'
};
const ST_CLASS = {
  'قيد التنفيذ': 'st-active',
  'مكتمل':       'st-done',
  'مؤجل':        'st-delay',
  'ملغي':        'st-cancel'
};

function getFiltered() {
  const area   = document.getElementById('flt-area').value;
  const status = document.getElementById('flt-status').value;
  const pri    = document.getElementById('flt-pri').value;
  const q      = (document.getElementById('flt-search').value || '').trim().toLowerCase();
  return goals.filter(g => {
    if (area   && g.area     !== area)   return false;
    if (status && g.status   !== status) return false;
    if (pri    && g.priority !== pri)    return false;
    if (q && !(g.desc||'').toLowerCase().includes(q) && !(g.notes||'').toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderTable() {
  const list = getFiltered();
  document.getElementById('gl-thead').innerHTML = `
    <th>وصف الهدف</th><th>المجال</th><th>الأولوية</th><th>الحالة</th>
    <th>الإنجاز</th><th>المبلغ</th><th>التاريخ</th><th>ملاحظات</th><th>إجراءات</th>`;

  if (!list.length) {
    document.getElementById('gl-tbody').innerHTML = `
      <tr><td colspan="9">
        <div class="empty-state"><div class="big">🎯</div>لا توجد أهداف — أضف هدفك الأول!</div>
      </td></tr>`;
    return;
  }

  document.getElementById('gl-tbody').innerHTML = list.map(g => {
    const prog = +g.progress || 0;
    const priC = PRI_CLASS[g.priority] || 'pri-4';
    const stC  = ST_CLASS[g.status]   || 'st-active';
    const amt  = g.amount ? formatSAR(g.amount) : '—';
    const dt   = g.date   ? formatDate(g.date)  : '—';
    const noteBtn = g.notes && g.notes.trim()
      ? `<button class="notes-badge" data-note="${esc(g.notes)}" onclick="showNotePopup(this)" title="عرض الملاحظة">💬</button>`
      : '';
    return `<tr>
      <td style="font-weight:600;max-width:240px">${esc(g.desc)}</td>
      <td><span class="area-badge">${esc(g.area||'—')}</span></td>
      <td><span class="pri-badge ${priC}">${esc(g.priority||'—')}</span></td>
      <td><span class="st-badge ${stC}">${esc(g.status)}</span></td>
      <td style="min-width:110px">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-wrap" style="flex:1;min-width:60px"><div class="progress-bar" style="width:${prog}%"></div></div>
          <span style="font-size:0.78rem;color:var(--text-2)">${prog}%</span>
        </div>
      </td>
      <td class="num">${amt}</td>
      <td style="white-space:nowrap;color:var(--text-2)">${dt}</td>
      <td style="text-align:center">${noteBtn}</td>
      <td class="actions-cell">
        <button class="btn-icon" onclick="openEditModal('${g.id}')" title="تعديل">✏️</button>
        <button class="btn-icon danger" onclick="openDelModal('${g.id}')" title="حذف">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'إضافة هدف';
  document.getElementById('g-desc').value     = '';
  document.getElementById('g-area').value     = 'شخصي';
  document.getElementById('g-status').value   = 'قيد التنفيذ';
  document.getElementById('g-priority').value = 'هام وغير عاجل';
  document.getElementById('g-amount').value   = '';
  document.getElementById('g-date').value     = '';
  document.getElementById('g-notes').value    = '';
  setProgress(0);
  document.getElementById('goal-modal').classList.add('open');
  document.getElementById('g-desc').focus();
}

function openEditModal(id) {
  const g = goals.find(x => x.id === id);
  if (!g) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'تعديل الهدف';
  document.getElementById('g-desc').value     = g.desc     || '';
  document.getElementById('g-area').value     = g.area     || 'شخصي';
  document.getElementById('g-status').value   = g.status   || 'قيد التنفيذ';
  document.getElementById('g-priority').value = g.priority || 'هام وغير عاجل';
  document.getElementById('g-amount').value   = g.amount   || '';
  document.getElementById('g-date').value     = g.date     || '';
  document.getElementById('g-notes').value    = g.notes    || '';
  setProgress(+g.progress || 0);
  document.getElementById('goal-modal').classList.add('open');
}

function setProgress(v) {
  document.getElementById('g-progress').value   = v;
  document.getElementById('g-prog-val').textContent = v + '%';
  document.getElementById('g-prog-bar').style.width = v + '%';
}

function closeModal() { document.getElementById('goal-modal').classList.remove('open'); }

function saveGoal() {
  const desc = document.getElementById('g-desc').value.trim();
  if (!desc) { showToast('أدخل وصف الهدف', 'error'); return; }
  const obj = {
    desc,
    area:     document.getElementById('g-area').value,
    status:   document.getElementById('g-status').value,
    priority: document.getElementById('g-priority').value,
    amount:   parseFloat(document.getElementById('g-amount').value) || 0,
    date:     document.getElementById('g-date').value,
    progress: parseInt(document.getElementById('g-progress').value) || 0,
    notes:    document.getElementById('g-notes').value.trim()
  };
  if (editingId) {
    const idx = goals.findIndex(x => x.id === editingId);
    goals[idx] = { ...goals[idx], ...obj };
    showToast('تم تحديث الهدف ✓', 'success');
  } else {
    goals.push({ id: uid(), ...obj });
    showToast('تم إضافة الهدف ✓', 'success');
  }
  saveGoals(goals);
  closeModal();
  buildAreaFilter();
  renderDash();
  renderTable();
}

// ─── Delete ───────────────────────────────────────────────────────────────────
function openDelModal(id) { deletingId = id; document.getElementById('del-modal').classList.add('open'); }
function closeDelModal()  { document.getElementById('del-modal').classList.remove('open'); deletingId = null; }
function confirmDelete() {
  if (!deletingId) return;
  goals = goals.filter(g => g.id !== deletingId);
  saveGoals(goals);
  closeDelModal();
  buildAreaFilter();
  renderDash();
  renderTable();
  showToast('تم الحذف', 'success');
}

// Close modals on overlay click
document.addEventListener('click', e => {
  if (e.target.id === 'goal-modal') closeModal();
  if (e.target.id === 'del-modal')  closeDelModal();
});
