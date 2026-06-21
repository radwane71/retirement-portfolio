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
  renderGoals();
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
function isOverdue(g) {
  if (!g.date || g.status === 'مكتمل' || g.status === 'ملغي') return false;
  const d = new Date(g.date); d.setHours(0,0,0,0);
  const t = new Date();      t.setHours(0,0,0,0);
  return d < t;
}

function renderDash() {
  const total    = goals.length;
  const active   = goals.filter(g => g.status === 'قيد التنفيذ').length;
  const done     = goals.filter(g => g.status === 'مكتمل').length;
  const overdue  = goals.filter(isOverdue).length;
  const avgProg  = total ? Math.round(goals.reduce((s,g)=>s+(+g.progress||0),0)/total) : 0;
  const totalTgt = goals.reduce((s,g)=>s+(+g.amount||0),0);
  const savedTgt = goals.reduce((s,g)=>s+(+g.amount||0)*(Math.min(100,+g.progress||0)/100),0);

  document.getElementById('gl-dash').innerHTML = `
    <div class="gl-card"><div class="lbl">إجمالي الأهداف</div><div class="val">${total}</div></div>
    <div class="gl-card c-active"><div class="lbl">قيد التنفيذ</div><div class="val" style="color:#4ade80">${active}</div></div>
    <div class="gl-card c-done"><div class="lbl">مكتملة</div><div class="val" style="color:#60a5fa">${done}</div></div>
    <div class="gl-card ${overdue?'c-cancel':''}"><div class="lbl">متأخّرة عن موعدها</div><div class="val" style="color:${overdue?'#f87171':'var(--text)'}">${overdue}</div></div>
    <div class="gl-card"><div class="lbl">متوسط الإنجاز</div><div class="val">${avgProg}%</div>
      <div class="progress-wrap" style="margin-top:8px"><div class="progress-bar" style="width:${avgProg}%"></div></div>
    </div>
    <div class="gl-card"><div class="lbl">المبلغ المستهدف</div><div class="val" style="font-size:1.1rem">${formatSAR(totalTgt)}</div>
      ${totalTgt>0?`<div class="lbl" style="margin-top:5px">أُنجز ≈ ${formatSAR(savedTgt)} (${Math.round(savedTgt/totalTgt*100)}%)</div>`:''}
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

const PRI_COLOR = {
  'هام وعاجل':'#f87171', 'هام وغير عاجل':'#fbbf24',
  'عاجل وغير هام':'#60a5fa', 'غير عاجل وغير هام':'#9ca3af'
};
const PRI_ORDER = { 'هام وعاجل':1, 'هام وغير عاجل':2, 'عاجل وغير هام':3, 'غير عاجل وغير هام':4 };
const ST_ORDER  = { 'قيد التنفيذ':1, 'مؤجل':2, 'مكتمل':3, 'ملغي':4 };

// مدة مقروءة من عدد الأيام
function fmtDur(days) {
  if (days < 30)  return `${days} يوم`;
  const m = Math.round(days / 30.44);
  if (m < 12)     return `${m} شهر`;
  return `${(days / 365.25).toFixed(1)} سنة`;
}

// معلومات الموعد: متبقّى / متأخّر / اليوم (تُخفى للمكتمل والملغي)
function deadlineInfo(g) {
  if (!g.date) return null;
  if (g.status === 'مكتمل' || g.status === 'ملغي') return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(g.date); d.setHours(0,0,0,0);
  const days = Math.round((d - today) / 86400000);
  if (days < 0)  return { cls:'overdue', icon:'⚠️', txt:`متأخّر ${fmtDur(-days)}` };
  if (days === 0) return { cls:'soon', icon:'⏰', txt:'موعده اليوم' };
  return { cls: days <= 30 ? 'soon' : 'ok', icon:'📅', txt:`متبقّى ${fmtDur(days)}` };
}

function sortGoals(list, mode) {
  const arr = [...list];
  if (mode === 'deadline') {
    arr.sort((a,b) => (a.date?+new Date(a.date):Infinity) - (b.date?+new Date(b.date):Infinity));
  } else if (mode === 'progress') {
    arr.sort((a,b) => (+b.progress||0) - (+a.progress||0));
  } else if (mode === 'priority') {
    arr.sort((a,b) => (PRI_ORDER[a.priority]||9) - (PRI_ORDER[b.priority]||9));
  } else { // smart: نشِط أولاً ← أولوية ← أقرب موعداً
    arr.sort((a,b) =>
      (ST_ORDER[a.status]||9) - (ST_ORDER[b.status]||9) ||
      (PRI_ORDER[a.priority]||9) - (PRI_ORDER[b.priority]||9) ||
      ((a.date?+new Date(a.date):Infinity) - (b.date?+new Date(b.date):Infinity))
    );
  }
  return arr;
}

function goalCardHtml(g) {
  const prog  = Math.max(0, Math.min(100, +g.progress || 0));
  const priC  = PRI_CLASS[g.priority] || 'pri-4';
  const stC   = ST_CLASS[g.status]   || 'st-active';
  const priClr = PRI_COLOR[g.priority] || '#9ca3af';
  const dl    = deadlineInfo(g);
  const target = +g.amount || 0;
  const saved  = Math.round(target * prog / 100);
  const progClr = prog >= 100 ? '#4ade80' : prog >= 50 ? 'var(--accent)' : '#fb923c';
  const dimmed  = (g.status === 'مكتمل' || g.status === 'ملغي') ? 'opacity:.72;' : '';

  const dlHtml = dl
    ? `<span class="deadline ${dl.cls}">${dl.icon} ${dl.txt}</span>`
    : (g.date ? `<span class="deadline ok">📅 ${formatDate(g.date)}</span>` : '');

  const amountHtml = target
    ? `<div class="gc-amount">
         <span style="color:var(--text-2)">أُنجز ≈ ${formatSAR(saved)}</span>
         <span style="font-weight:700">${formatSAR(target)}</span>
       </div>`
    : '';

  return `<div class="goal-card" style="border-top:3px solid ${priClr};${dimmed}">
    <div class="gc-head">
      <div class="gc-title">${esc(g.desc)}</div>
      <span class="st-badge ${stC}">${esc(g.status)}</span>
    </div>
    <div class="gc-meta">
      <span class="area-badge">${esc(g.area||'—')}</span>
      <span class="pri-badge ${priC}">${esc(g.priority||'—')}</span>
      ${dlHtml}
    </div>
    <div>
      <div class="progress-wrap" style="height:8px"><div class="progress-bar" style="width:${prog}%;background:${progClr}"></div></div>
      <div style="display:flex;justify-content:space-between;margin-top:5px">
        <span style="font-size:.74rem;color:var(--text-2)">نسبة الإنجاز</span>
        <span style="font-size:.8rem;font-weight:700;color:${progClr}">${prog}%</span>
      </div>
    </div>
    ${amountHtml}
    ${g.notes && g.notes.trim() ? `<div class="gc-notes">💬 ${esc(g.notes)}</div>` : ''}
    <div class="gc-foot">
      <div style="display:flex;gap:6px">
        <button class="btn-icon" onclick="openEditModal('${g.id}')" title="تعديل">✏️</button>
        <button class="btn-icon danger" onclick="openDelModal('${g.id}')" title="حذف">🗑️</button>
      </div>
    </div>
  </div>`;
}

function renderGoals() {
  const sort = document.getElementById('flt-sort')?.value || 'smart';
  const list = sortGoals(getFiltered(), sort);
  const grid = document.getElementById('goals-grid');
  if (!grid) return;

  if (!list.length) {
    const hasAny = goals.length > 0;
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="big">🎯</div>
      ${hasAny ? 'لا توجد أهداف مطابقة للفلاتر الحالية.' : 'لا توجد أهداف بعد — أضف هدفك الأول وابدأ التتبّع!'}
    </div>`;
    return;
  }
  grid.innerHTML = list.map(goalCardHtml).join('');
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
  renderGoals();
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
  renderGoals();
  showToast('تم الحذف', 'success');
}

// Close modals on overlay click
document.addEventListener('click', e => {
  if (e.target.id === 'goal-modal') closeModal();
  if (e.target.id === 'del-modal')  closeDelModal();
});
