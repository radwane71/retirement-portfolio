// ─── Storage key ──────────────────────────────────────────────────────────────
const SK_KEY = 'school_kanda_v1';

function loadData() {
  const def = {
    profile:      { name: 'كندة', birth: '' },
    lifeGoals:    [],   // [{id, desc, year, status}]
    schoolGoals:  [],   // [{id, desc, year, status}]
    years:        [],   // [{id, label, class, school}]
    subjects:     [],   // [{id, name}]
    grades:       {}    // { yearId: { subjectId: { t1: score, t2: score, t3: score } } }
  };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SK_KEY)) }; } catch { return def; }
}
function saveData() { localStorage.setItem(SK_KEY, JSON.stringify(data)); }

let data = loadData();
let activeTab = 'tab-life';
let gradeEditCtx = null; // { yearId, subjectId, term }

// ─── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderProfile();
  renderGoals('life');
  renderGoals('school');
  buildYearSelect();
  renderGrades();
});

// ─── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(id) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.getAttribute('onclick') === `switchTab('${id}')`) b.classList.add('active');
  });
  activeTab = id;
}

// ─── Profile ──────────────────────────────────────────────────────────────────
function renderProfile() {
  const p = data.profile;
  document.getElementById('p-name-display').textContent = p.name || 'كندة';
  if (p.birth) {
    document.getElementById('p-birth-display').textContent = 'تاريخ الميلاد: ' + formatDate(p.birth);
    const age = calcAge(p.birth);
    document.getElementById('p-age-display').textContent = 'العمر: ' + age;
  } else {
    document.getElementById('p-birth-display').textContent = '';
    document.getElementById('p-age-display').textContent = '';
  }
}

function calcAge(birthISO) {
  const b = new Date(birthISO + 'T00:00:00');
  const now = new Date();
  let y = now.getFullYear() - b.getFullYear();
  let m = now.getMonth()    - b.getMonth();
  let d = now.getDate()     - b.getDate();
  if (d < 0) { m--; d += 30; }
  if (m < 0) { y--; m += 12; }
  const parts = [];
  if (y > 0) parts.push(y + ' سنة');
  if (m > 0) parts.push(m + ' شهر');
  if (d > 0 && y === 0) parts.push(d + ' يوم');
  return parts.join(' و') || 'أقل من يوم';
}

function openProfileModal() {
  document.getElementById('pm-name').value  = data.profile.name  || '';
  document.getElementById('pm-birth').value = data.profile.birth || '';
  document.getElementById('profile-modal').classList.add('open');
}
function saveProfile() {
  data.profile.name  = document.getElementById('pm-name').value.trim() || 'كندة';
  data.profile.birth = document.getElementById('pm-birth').value;
  saveData();
  renderProfile();
  closeModal('profile-modal');
  showToast('تم الحفظ ✓', 'success');
}

// ─── Goals (life & school) ────────────────────────────────────────────────────
const GOAL_STATUSES = ['قيد التنفيذ', 'مكتمل', 'مؤجل', 'ملغي'];
const GOAL_ST_CLASS = { 'قيد التنفيذ':'gs-active', 'مكتمل':'gs-done', 'مؤجل':'gs-delayed', 'ملغي':'gs-cancel' };

function goalList(type) { return type === 'life' ? data.lifeGoals : data.schoolGoals; }

function renderGoals(type) {
  const list = goalList(type);
  const tbody = document.getElementById(type + '-goals-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">لا توجد أهداف بعد</div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(g => {
    const stC = GOAL_ST_CLASS[g.status] || 'gs-active';
    const stOpts = GOAL_STATUSES.map(s =>
      `<option value="${s}" ${s===g.status?'selected':''}>${s}</option>`).join('');
    return `<tr>
      <td style="font-weight:600">${esc(g.desc)}</td>
      <td style="text-align:center;color:var(--text-2)">${g.year||'—'}</td>
      <td>
        <select class="gs-badge ${stC}" onchange="updateGoalStatus('${type}','${g.id}',this)"
          style="border:none;background:transparent;font-family:inherit;font-size:0.7rem;font-weight:700;cursor:pointer;padding:3px 4px;">
          ${stOpts}
        </select>
      </td>
      <td class="actions-cell">
        <button class="btn-icon danger" onclick="deleteGoal('${type}','${g.id}')" title="حذف">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

// AUDIT-FIX: replaced prompt() with DOM-based overlay — prompt() blocked in strict CSP
// and broken on iOS Safari in some configurations.
function addGoalRow(type) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:var(--bg-2,#1c2128);border:1px solid var(--border,#30363d);border-radius:12px;max-width:380px;width:100%;padding:24px 20px">
      <p style="margin:0 0 10px;color:var(--text-1,#e6edf3);font-weight:600">إضافة هدف</p>
      <input id="_goal-desc" placeholder="وصف الهدف *" style="width:100%;padding:9px 11px;background:var(--bg-1,#0d1117);border:1px solid var(--border);border-radius:8px;color:var(--text,#e6edf3);font-family:inherit;font-size:.9rem;margin-bottom:10px;box-sizing:border-box">
      <input id="_goal-year" placeholder="السنة المستهدفة (اختياري)" style="width:100%;padding:9px 11px;background:var(--bg-1,#0d1117);border:1px solid var(--border);border-radius:8px;color:var(--text,#e6edf3);font-family:inherit;font-size:.9rem;margin-bottom:16px;box-sizing:border-box">
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button id="_goal-cancel" class="btn btn-secondary" style="min-width:70px">إلغاء</button>
        <button id="_goal-save"   class="btn btn-primary"   style="min-width:70px">إضافة</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const descInput = overlay.querySelector('#_goal-desc');
  descInput.focus();

  const cleanup = () => overlay.remove();
  overlay.querySelector('#_goal-cancel').onclick = cleanup;
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(); });
  overlay.querySelector('#_goal-save').onclick = () => {
    const desc = descInput.value.trim();
    if (!desc) { descInput.style.borderColor = 'var(--danger,#f85149)'; return; }
    const year = (overlay.querySelector('#_goal-year').value || '').trim();
    const list = goalList(type);
    list.push({ id: uid(), desc, year, status: 'قيد التنفيذ' });
    saveData();
    renderGoals(type);
    cleanup();
  };
  descInput.addEventListener('keydown', e => { if (e.key === 'Enter') overlay.querySelector('#_goal-save').click(); });
}

function updateGoalStatus(type, id, sel) {
  const list = goalList(type);
  const g = list.find(x => x.id === id);
  if (g) { g.status = sel.value; saveData(); }
  // re-apply badge class
  const stC = GOAL_ST_CLASS[sel.value] || 'gs-active';
  sel.className = `gs-badge ${stC}`;
}

async function deleteGoal(type, id) {
  if (!await confirmAsync('حذف هذا الهدف؟')) return;
  if (type === 'life') data.lifeGoals   = data.lifeGoals.filter(g => g.id !== id);
  else                 data.schoolGoals = data.schoolGoals.filter(g => g.id !== id);
  saveData();
  renderGoals(type);
}

// ─── Years ────────────────────────────────────────────────────────────────────
function buildYearSelect() {
  const sel = document.getElementById('sel-year');
  const cur = sel.value;
  sel.innerHTML = data.years.length
    ? data.years.map(y => `<option value="${y.id}" ${y.id===cur?'selected':''}>${y.label} — ${y.class||''}</option>`).join('')
    : '<option value="">لا توجد سنوات دراسية</option>';
}

function openYearModal() { document.getElementById('year-modal').classList.add('open'); }
function saveYear() {
  const label  = document.getElementById('ym-year').value.trim();
  const cls    = document.getElementById('ym-class').value.trim();
  const school = document.getElementById('ym-school').value.trim();
  if (!label) { showToast('أدخل العام الدراسي', 'error'); return; }
  data.years.push({ id: uid(), label, class: cls, school });
  saveData();
  buildYearSelect();
  // Auto-select new year
  const sel = document.getElementById('sel-year');
  sel.value = data.years[data.years.length - 1].id;
  renderGrades();
  closeModal('year-modal');
  document.getElementById('ym-year').value = '';
  document.getElementById('ym-class').value = '';
  document.getElementById('ym-school').value = '';
  showToast('تمت إضافة السنة ✓', 'success');
}

// ─── Subjects ─────────────────────────────────────────────────────────────────
function openSubjectModal() { document.getElementById('subject-modal').classList.add('open'); }
function saveSubject() {
  const name = document.getElementById('sm-name').value.trim();
  if (!name) { showToast('أدخل اسم المادة', 'error'); return; }
  if (data.subjects.find(s => s.name === name)) { showToast('المادة موجودة مسبقاً', 'error'); return; }
  data.subjects.push({ id: uid(), name });
  saveData();
  renderGrades();
  closeModal('subject-modal');
  document.getElementById('sm-name').value = '';
  showToast('تمت إضافة المادة ✓', 'success');
}

// ─── Grades ───────────────────────────────────────────────────────────────────
const TERMS = ['الفصل الأول', 'الفصل الثاني', 'الفصل الثالث'];

function renderGrades() {
  const yearId = document.getElementById('sel-year').value;
  const wrap   = document.getElementById('grade-wrap');

  if (!yearId || !data.years.length) {
    wrap.innerHTML = `<div class="empty-state">أضف سنة دراسية أولاً</div>`;
    return;
  }
  if (!data.subjects.length) {
    wrap.innerHTML = `<div class="empty-state">أضف المواد الدراسية أولاً</div>`;
    return;
  }

  const yearGrades = (data.grades[yearId] || {});

  // Header
  let html = `<table class="grade-table"><thead><tr>
    <th rowspan="2" style="min-width:130px;text-align:right">المادة</th>`;
  TERMS.forEach(t => {
    html += `<th colspan="1" class="term-header">${t}</th>`;
  });
  html += `<th>المعدل</th></tr></thead><tbody>`;

  data.subjects.forEach(sub => {
    const sg = yearGrades[sub.id] || {};
    const scores = TERMS.map((_,i) => sg['t'+(i+1)] != null ? sg['t'+(i+1)] : null);
    const filled = scores.filter(s => s !== null);
    const avg    = filled.length ? (filled.reduce((a,b)=>a+b,0)/filled.length).toFixed(1) : null;
    const avgC   = avg !== null ? gradeClass(+avg) : '';

    html += `<tr><td>${esc(sub.name)}</td>`;
    scores.forEach((sc, i) => {
      const term = 't' + (i+1);
      const cls  = sc !== null ? gradeClass(sc) : 'g-empty';
      const disp = sc !== null ? sc : '—';
      html += `<td class="g-cell ${cls}" onclick="openGradeModal('${yearId}','${sub.id}','${term}','${sc ?? ''}')">${disp}</td>`;
    });
    html += `<td class="${avgC}" style="font-weight:700">${avg ?? '—'}</td></tr>`;
  });

  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

function gradeClass(sc) {
  if (sc >= 90) return 'g-high';
  if (sc >= 70) return 'g-mid';
  return 'g-low';
}

function openGradeModal(yearId, subjectId, term, current) {
  gradeEditCtx = { yearId, subjectId, term };
  const sub  = data.subjects.find(s => s.id === subjectId);
  const termLabel = { t1:'الفصل الأول', t2:'الفصل الثاني', t3:'الفصل الثالث' }[term];
  document.getElementById('gm-title').textContent = `${sub?.name || ''} — ${termLabel}`;
  document.getElementById('gm-score').value = current !== '' ? current : '';
  document.getElementById('grade-modal').classList.add('open');
  document.getElementById('gm-score').focus();
}

function saveGrade(clear) {
  if (!gradeEditCtx) return;
  const { yearId, subjectId, term } = gradeEditCtx;
  if (!data.grades[yearId])           data.grades[yearId]           = {};
  if (!data.grades[yearId][subjectId]) data.grades[yearId][subjectId] = {};

  if (clear === null) {
    delete data.grades[yearId][subjectId][term];
  } else {
    const val = parseFloat(document.getElementById('gm-score').value);
    if (isNaN(val) || val < 0 || val > 100) { showToast('أدخل درجة بين 0 و100', 'error'); return; }
    data.grades[yearId][subjectId][term] = val;
  }
  saveData();
  renderGrades();
  closeModal('grade-modal');
  showToast('تم الحفظ ✓', 'success');
}

// ─── Shared modal close ───────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('click', e => {
  ['profile-modal','year-modal','subject-modal','grade-modal'].forEach(id => {
    if (e.target.id === id) closeModal(id);
  });
});

// Enter key in grade input
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('grade-modal').classList.contains('open')) {
    saveGrade();
  }
});
