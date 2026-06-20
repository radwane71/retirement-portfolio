// ═══════════════════════════════════════════════════════════════════════════════
// Storage
// ═══════════════════════════════════════════════════════════════════════════════
const SCH_KEY = 'school_tracker_v2';

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'school': {
    title: '🎓 المتابعة المدرسية',
    body: `
      <p>متابعة شاملة لكل طفل: الأهداف الدراسية، الدرجات، والتطور الأكاديمي عبر الفصول — لوحة تربوية بجانب لوحتك المالية.</p>
      <p class="info-note">💡 اختر الطفل من الشريط العلوي ثم سجّل أهدافه ودرجاته. متابعة منتظمة تكشف تراجعاً مبكراً وتتيح التدخّل في الوقت المناسب.</p>`
  },
};

// التخزين: Supabase (user_settings) كمصدر أساسي + localStorage كذاكرة مؤقتة/احتياط
// يحمي سنوات الدرجات من الضياع عند مسح المتصفح أو تغيير الجهاز.
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(userLsKey(SCH_KEY)))
            || JSON.parse(localStorage.getItem(SCH_KEY))
            || { children: [] }; }
  catch { return { children: [] }; }
}
function persist() {
  try { localStorage.setItem(userLsKey(SCH_KEY), JSON.stringify(store)); } catch {}
  saveUserSetting(SCH_KEY, store);   // مزامنة سحابية (لا تُنتظر)
}

let store = { children: [] };
let activeChildId = null;
let activeTab     = 'life-tab';
let goalEditId    = null;
let goalType      = null;
let childEditMode = false;   // true = تعديل الطفل الحالي · false = إضافة طفل جديد
let yearEditId    = null;
let gradeCtx      = null;  // { yearId, termId, subjectId }

// ═══════════════════════════════════════════════════════════════════════════════
// Boot
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;
  // حمّل من السحابة أولاً، وإلا من الذاكرة المحلية
  const remote = await loadUserSetting(SCH_KEY);
  store = remote || loadLocal();
  try { localStorage.setItem(userLsKey(SCH_KEY), JSON.stringify(store)); } catch {}
  buildEmojiPicker();
  renderChildrenBar();
  if (store.children.length) selectChild(store.children[0].id);
  else showNoChildren();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Children Bar
// ═══════════════════════════════════════════════════════════════════════════════
const CHILD_EMOJIS = ['👧','👦','🧒','👶','🎀','⭐','🌸','🌟','🦋','🐣','🌈','🦄'];

function buildEmojiPicker() {
  document.getElementById('emoji-picker').innerHTML = CHILD_EMOJIS.map(e =>
    `<span class="emoji-opt" onclick="pickEmoji('${e}')">${e}</span>`).join('');
}
function pickEmoji(e) {
  document.getElementById('cm-emoji').value = e;
  document.querySelectorAll('.emoji-opt').forEach(el => el.classList.toggle('selected', el.textContent === e));
}

function renderChildrenBar() {
  const bar = document.getElementById('children-bar');
  const tabs = store.children.map(c => `
    <button class="child-tab ${c.id === activeChildId ? 'active' : ''}" onclick="selectChild('${c.id}')">
      <span class="avatar">${c.emoji || '👧'}</span>
      <span>${esc(c.name)}</span>
    </button>`).join('');
  bar.innerHTML = tabs + `<button class="add-child-btn" onclick="openChildModal()">＋ إضافة طفل</button>`;
}

function selectChild(id) {
  activeChildId = id;
  renderChildrenBar();
  const c = getChild();
  if (!c) return;
  document.getElementById('no-children-msg').style.display = 'none';
  document.getElementById('child-view').style.display = '';
  renderProfile();
  renderGoals('life');
  renderGoals('school');
  buildYearSelect();
  renderYearsList();
  renderGrades();
  renderAttendance();
  renderBehavior();
  renderHomework();
  renderExams();
}

function showNoChildren() {
  document.getElementById('no-children-msg').style.display = '';
  document.getElementById('child-view').style.display = 'none';
}

function getChild(id) {
  return store.children.find(c => c.id === (id || activeChildId));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Profile
// ═══════════════════════════════════════════════════════════════════════════════
function renderProfile() {
  const c = getChild();
  if (!c) return;
  document.getElementById('profile-emoji').textContent = c.emoji || '👧';
  document.getElementById('p-name').textContent = c.name;

  const meta = [];
  if (c.birth) {
    meta.push(`<span class="profile-meta-item">🎂 ${formatDate(c.birth)}</span>`);
    meta.push(`<span class="profile-meta-item">🎈 ${calcAge(c.birth)}</span>`);
  }
  if (c.school) meta.push(`<span class="profile-meta-item">🏫 ${esc(c.school)}</span>`);
  if (c.grade)  meta.push(`<span class="profile-meta-item">📖 ${esc(c.grade)}</span>`);
  document.getElementById('p-meta').innerHTML = meta.join('');

  const extra = (c.extraFields || []).map(f => `
    <span class="extra-chip">
      <span style="color:var(--text-2)">${esc(f.label)}:</span>
      <span class="chip-val">${esc(f.value)}</span>
      <button class="del-chip" onclick="deleteExtraField('${f.id}')" title="حذف">✕</button>
    </span>`).join('');
  document.getElementById('p-extra').innerHTML = extra;
}

function calcAge(birth) {
  const b = new Date(birth + 'T00:00:00'), now = new Date();
  let y = now.getFullYear() - b.getFullYear();
  let m = now.getMonth() - b.getMonth();
  if (m < 0) { y--; m += 12; }
  const parts = [];
  if (y > 0) parts.push(y + ' سنة');
  if (m > 0) parts.push(m + ' شهر');
  return parts.join(' و') || 'أقل من شهر';
}

// ── Child Modal ───────────────────────────────────────────────────────────────
function openChildModal(editing = false) {
  childEditMode = editing;
  const c = editing ? getChild() : null;
  document.getElementById('child-modal-title').textContent = c ? 'تعديل بيانات الطفل' : 'إضافة طفل جديد';
  document.getElementById('cm-name').value   = c?.name   || '';
  document.getElementById('cm-birth').value  = c?.birth  || '';
  document.getElementById('cm-school').value = c?.school || '';
  document.getElementById('cm-grade').value  = c?.grade  || '';
  document.getElementById('cm-notes').value  = c?.notes  || '';
  const emj = c?.emoji || '👧';
  document.getElementById('cm-emoji').value  = emj;
  document.querySelectorAll('.emoji-opt').forEach(el => el.classList.toggle('selected', el.textContent === emj));
  document.getElementById('child-modal').classList.add('open');
}

function saveChild() {
  const name = document.getElementById('cm-name').value.trim();
  if (!name) { showToast('أدخل اسم الطفل', 'error'); return; }
  const obj = {
    name,
    emoji:  document.getElementById('cm-emoji').value.trim() || '👧',
    birth:  document.getElementById('cm-birth').value,
    school: document.getElementById('cm-school').value.trim(),
    grade:  document.getElementById('cm-grade').value.trim(),
    notes:  document.getElementById('cm-notes').value.trim()
  };
  const existing = childEditMode ? getChild() : null;
  if (existing) {
    Object.assign(existing, obj);
    showToast('تم تحديث البيانات ✓', 'success');
  } else {
    const child = { id: uid(), lifeGoals: [], schoolGoals: [], years: [], subjects: [], grades: {}, extraFields: [], attendance: [], behavior: [], homework: [], exams: [], ...obj };
    store.children.push(child);
    activeChildId = child.id;
    showToast('تمت إضافة الطفل ✓', 'success');
  }
  persist();
  closeModal('child-modal');
  renderChildrenBar();
  renderProfile();
}

async function deleteCurrentChild() {
  const c = getChild();
  if (!c) return;
  if (!await confirmAsync(`هل أنت متأكد من حذف ملف "${esc(c.name)}" وكل بياناته؟ لا يمكن التراجع.`)) return;
  store.children = store.children.filter(x => x.id !== activeChildId);
  persist();
  activeChildId = store.children[0]?.id || null;
  if (activeChildId) selectChild(activeChildId);
  else showNoChildren();
  renderChildrenBar();
}

// ── Extra Fields ──────────────────────────────────────────────────────────────
function openExtraFieldModal() { document.getElementById('ef-label').value=''; document.getElementById('ef-value').value=''; document.getElementById('extra-modal').classList.add('open'); }
function saveExtraField() {
  const label = document.getElementById('ef-label').value.trim();
  const value = document.getElementById('ef-value').value.trim();
  if (!label) { showToast('أدخل اسم الحقل','error'); return; }
  const c = getChild();
  if (!c.extraFields) c.extraFields = [];
  c.extraFields.push({ id: uid(), label, value });
  persist();
  closeModal('extra-modal');
  renderProfile();
}
function deleteExtraField(fid) {
  const c = getChild();
  c.extraFields = (c.extraFields||[]).filter(f => f.id !== fid);
  persist();
  renderProfile();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tabs
// ═══════════════════════════════════════════════════════════════════════════════
function switchTab(id) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.page-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.page-tab-btn').forEach(b => {
    if (b.getAttribute('onclick') === `switchTab('${id}')`) b.classList.add('active');
  });
  activeTab = id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Goals
// ═══════════════════════════════════════════════════════════════════════════════
const ST_MAP   = { planned:'مخطط', active:'قيد التنفيذ', done:'مكتمل', delayed:'مؤجل', cancel:'ملغي' };
const ST_CLASS = { planned:'s-planned', active:'s-active', done:'s-done', delayed:'s-delayed', cancel:'s-cancel' };
const PRI_MAP  = { 1:'🔴 هام وعاجل', 2:'🟡 هام وغير عاجل', 3:'🔵 عاجل وغير هام', 4:'⚪ غير عاجل وغير هام' };
const PRI_CLASS= { 1:'p-1', 2:'p-2', 3:'p-3', 4:'p-4' };

function goalList(type) {
  const c = getChild();
  return type === 'life' ? (c?.lifeGoals || []) : (c?.schoolGoals || []);
}

function renderGoals(type) {
  const c    = getChild();
  if (!c) return;
  const list = goalList(type);
  const tbodyId = type + '-goals-body';
  const isLife  = type === 'life';

  if (!list.length) {
    document.getElementById(tbodyId).innerHTML = `<tr><td colspan="${isLife?9:8}"><div class="empty-state">لا توجد أهداف — اضغط "＋ هدف جديد"</div></td></tr>`;
    return;
  }

  document.getElementById(tbodyId).innerHTML = list.map(g => {
    const stC = ST_CLASS[g.status] || 's-active';
    const stOpts = Object.entries(ST_MAP).map(([v,l]) =>
      `<option value="${v}" ${v===g.status?'selected':''}>${l}</option>`).join('');
    const priC = PRI_CLASS[g.priority] || 'p-2';
    const priOpts = Object.entries(PRI_MAP).map(([v,l]) =>
      `<option value="${v}" ${v==g.priority?'selected':''}>${l}</option>`).join('');
    const prog = +g.progress || 0;
    const noteBtn = g.notes?.trim()
      ? `<button class="notes-badge" data-note="${esc(g.notes)}" onclick="showNotePopup(this)" title="ملاحظة">💬</button>` : '—';
    const amtCol  = isLife ? `<td class="num" style="white-space:nowrap">${g.amount ? formatSAR(g.amount) : '—'}</td>` : '';

    return `<tr>
      <td><span class="editable-cell" onclick="inlineEditGoal('${type}','${g.id}','desc',this)">${esc(g.desc)}</span></td>
      <td><span class="editable-cell" onclick="inlineEditGoal('${type}','${g.id}','cat',this)">${esc(g.cat||'—')}</span></td>
      <td>
        <select class="pri-sel ${priC}" onchange="updateGoalField('${type}','${g.id}','priority',this.value,this)">${priOpts}</select>
      </td>
      <td>
        <select class="status-sel ${stC}" onchange="updateGoalField('${type}','${g.id}','status',this.value,this)">${stOpts}</select>
      </td>
      <td style="min-width:100px">
        <div class="prog-row">
          <div class="prog-wrap" style="flex:1"><div class="prog-bar" style="width:${prog}%"></div></div>
          <span class="prog-pct editable-cell" onclick="inlineEditGoal('${type}','${g.id}','progress',this)">${prog}%</span>
        </div>
      </td>
      <td><span class="editable-cell" onclick="inlineEditGoal('${type}','${g.id}','year',this)">${esc(g.year||'—')}</span></td>
      ${amtCol}
      <td style="text-align:center">${noteBtn}</td>
      <td class="actions-cell">
        <button class="btn-icon" onclick="openGoalEdit('${type}','${g.id}')" title="تعديل كامل">✏️</button>
        <button class="btn-icon danger" onclick="deleteGoal('${type}','${g.id}')" title="حذف">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

// Inline cell edit (click on cell text → becomes input)
function inlineEditGoal(type, gid, field, span) {
  if (span.querySelector('input')) return;
  const c = getChild();
  const g = goalList(type).find(x => x.id === gid);
  if (!g) return;
  const cur = g[field] != null ? String(g[field]) : '';
  const inp = document.createElement('input');
  inp.className = 'inline-edit-input';
  inp.type  = field === 'progress' ? 'number' : 'text';
  if (field === 'progress') { inp.min='0'; inp.max='100'; }
  inp.value = cur.replace('%','');
  inp.style.minWidth = '80px';
  span.innerHTML = '';
  span.appendChild(inp);
  inp.focus(); inp.select();
  function commit() {
    let val = inp.value.trim();
    if (field === 'progress') val = Math.min(100, Math.max(0, parseInt(val)||0));
    g[field] = val;
    persist();
    renderGoals(type);
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { renderGoals(type); }
  });
}

function updateGoalField(type, gid, field, value, sel) {
  const g = goalList(type).find(x => x.id === gid);
  if (!g) return;
  g[field] = field === 'priority' ? +value : value;
  persist();
  // Re-apply CSS class on the select itself
  if (field === 'status')   sel.className = `status-sel ${ST_CLASS[value]||'s-active'}`;
  if (field === 'priority') sel.className = `pri-sel ${PRI_CLASS[+value]||'p-2'}`;
}

function addGoal(type) {
  goalType = type; goalEditId = null;
  document.getElementById('goal-modal-title').textContent = 'إضافة هدف';
  document.getElementById('gm-type').value    = type;
  document.getElementById('gm-desc').value    = '';
  document.getElementById('gm-cat').value     = '';
  document.getElementById('gm-priority').value= '2';
  document.getElementById('gm-status').value  = 'active';
  document.getElementById('gm-progress').value= '0';
  document.getElementById('gm-year').value    = '';
  document.getElementById('gm-amount').value  = '';
  document.getElementById('gm-notes').value   = '';
  document.getElementById('goal-modal').classList.add('open');
  document.getElementById('gm-desc').focus();
}

function openGoalEdit(type, gid) {
  const g = goalList(type).find(x => x.id === gid);
  if (!g) return;
  goalType = type; goalEditId = gid;
  document.getElementById('goal-modal-title').textContent = 'تعديل الهدف';
  document.getElementById('gm-type').value    = type;
  document.getElementById('gm-desc').value    = g.desc     || '';
  document.getElementById('gm-cat').value     = g.cat      || '';
  document.getElementById('gm-priority').value= g.priority || 2;
  document.getElementById('gm-status').value  = g.status   || 'active';
  document.getElementById('gm-progress').value= g.progress || 0;
  document.getElementById('gm-year').value    = g.year     || '';
  document.getElementById('gm-amount').value  = g.amount   || '';
  document.getElementById('gm-notes').value   = g.notes    || '';
  document.getElementById('goal-modal').classList.add('open');
}

function saveGoal() {
  const desc = document.getElementById('gm-desc').value.trim();
  if (!desc) { showToast('أدخل وصف الهدف','error'); return; }
  const type = document.getElementById('gm-type').value;
  const c = getChild();
  const list = type === 'life' ? c.lifeGoals : c.schoolGoals;
  const obj = {
    desc,
    cat:      document.getElementById('gm-cat').value.trim(),
    priority: +document.getElementById('gm-priority').value,
    status:   document.getElementById('gm-status').value,
    progress: parseInt(document.getElementById('gm-progress').value)||0,
    year:     document.getElementById('gm-year').value.trim(),
    amount:   parseFloat(document.getElementById('gm-amount').value)||0,
    notes:    document.getElementById('gm-notes').value.trim()
  };
  if (goalEditId) {
    const idx = list.findIndex(x => x.id === goalEditId);
    list[idx] = { ...list[idx], ...obj };
  } else {
    list.push({ id: uid(), ...obj });
  }
  persist();
  closeModal('goal-modal');
  renderGoals(type);
  showToast('تم الحفظ ✓','success');
}

async function deleteGoal(type, gid) {
  if (!await confirmAsync('حذف هذا الهدف؟')) return;
  const c = getChild();
  if (type === 'life') c.lifeGoals   = c.lifeGoals.filter(x => x.id !== gid);
  else                 c.schoolGoals = c.schoolGoals.filter(x => x.id !== gid);
  persist();
  renderGoals(type);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Academic Years
// ═══════════════════════════════════════════════════════════════════════════════
function openYearModal(editId) {
  yearEditId = editId || null;
  const y = editId ? getChild().years.find(x => x.id === editId) : null;
  document.getElementById('year-modal-title').textContent = y ? 'تعديل السنة الدراسية' : 'سنة دراسية جديدة';
  document.getElementById('ym-label').value  = y?.label  || '';
  document.getElementById('ym-class').value  = y?.class  || '';
  document.getElementById('ym-school').value = y?.school || '';
  // Render terms
  const terms = y?.terms || [{ id: uid(), label: 'الفصل الأول' }, { id: uid(), label: 'الفصل الثاني' }];
  renderTermsEditor(terms);
  document.getElementById('year-modal').classList.add('open');
}

let termFields = [];
function renderTermsEditor(terms) {
  termFields = terms.map(t => ({ ...t }));
  redrawTermsEditor();
}
function redrawTermsEditor() {
  document.getElementById('terms-editor').innerHTML = termFields.map((t, i) => `
    <div style="display:flex;gap:6px;align-items:center">
      <input class="inline-edit-input" style="flex:1" value="${esc(t.label)}" oninput="termFields[${i}].label=this.value" placeholder="اسم الفصل">
      <input class="inline-edit-input" type="number" min="0" step="1" style="width:78px" value="${t.weight ?? ''}"
        oninput="termFields[${i}].weight = this.value===''?null:+this.value" placeholder="وزن %" title="وزن الفصل في المعدل (اختياري — اتركه فارغاً لتساوي الفصول)">
      <button type="button" class="btn btn-secondary" style="padding:4px 8px;font-size:0.75rem;border-color:var(--danger);color:var(--danger)"
        onclick="removeTerm(${i})">✕</button>
    </div>`).join('');
}
function addTermField() {
  termFields.push({ id: uid(), label: 'فصل ' + (termFields.length+1) });
  redrawTermsEditor();
}
function removeTerm(i) { termFields.splice(i,1); redrawTermsEditor(); }

function saveYear() {
  const label = document.getElementById('ym-label').value.trim();
  if (!label) { showToast('أدخل العام الدراسي','error'); return; }
  const c = getChild();
  const obj = {
    label,
    class:  document.getElementById('ym-class').value.trim(),
    school: document.getElementById('ym-school').value.trim(),
    terms:  termFields.filter(t => t.label.trim()).map(t => ({ id: t.id || uid(), label: t.label.trim(), weight: (t.weight == null || t.weight === '') ? null : +t.weight }))
  };
  if (!obj.terms.length) obj.terms = [{ id: uid(), label: 'الفصل الأول' }];
  if (yearEditId) {
    const idx = c.years.findIndex(x => x.id === yearEditId);
    c.years[idx] = { ...c.years[idx], ...obj };
  } else {
    c.years.push({ id: uid(), ...obj });
  }
  persist();
  closeModal('year-modal');
  buildYearSelect();
  renderYearsList();
  renderGrades();
  showToast('تم الحفظ ✓','success');
}

async function deleteYear(yid) {
  const c = getChild();
  const y = c.years.find(x => x.id === yid);
  if (!await confirmAsync(`حذف السنة "${esc(y?.label)}"؟ ستُحذف درجاتها أيضاً.`)) return;
  c.years = c.years.filter(x => x.id !== yid);
  delete c.grades[yid];
  persist();
  buildYearSelect();
  renderYearsList();
  renderGrades();
}

function buildYearSelect() {
  const c = getChild();
  const sel = document.getElementById('sel-year');
  if (!c?.years.length) { sel.innerHTML = '<option value="">لا توجد سنوات</option>'; return; }
  const cur = sel.value;
  sel.innerHTML = c.years.map(y =>
    `<option value="${y.id}" ${y.id===cur?'selected':''}>${y.label}${y.class?' — '+y.class:''}</option>`
  ).join('');
  if (!sel.value && c.years.length) sel.value = c.years[c.years.length-1].id;
}

function renderYearsList() {
  const c = getChild();
  if (!c?.years.length) {
    document.getElementById('years-list').innerHTML = `<div class="empty-state" style="padding:16px 0">لا توجد سنوات دراسية — اضغط "＋ سنة جديدة"</div>`;
    return;
  }
  document.getElementById('years-list').innerHTML = c.years.map(y => {
    const termChips = (y.terms||[]).map(t =>
      `<span class="term-chip">${esc(t.label)}</span>`).join('');
    return `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;flex-wrap:wrap">
      <span class="year-chip ${y.id===document.getElementById('sel-year').value?'active-year':''}">
        <strong>${esc(y.label)}</strong>${y.class?' · '+esc(y.class):''}
        <button class="chip-del" onclick="openYearModal('${y.id}')" title="تعديل">✏️</button>
        <button class="chip-del" onclick="deleteYear('${y.id}')" title="حذف">✕</button>
      </span>
      <div class="terms-list">${termChips}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Subjects
// ═══════════════════════════════════════════════════════════════════════════════
function openSubjectModal() {
  document.getElementById('sm-name').value  = '';
  document.getElementById('sm-max').value   = '100';
  document.getElementById('sm-color').value = '#3b82f6';
  document.getElementById('subject-modal').classList.add('open');
  document.getElementById('sm-name').focus();
}

function saveSubject() {
  const name = document.getElementById('sm-name').value.trim();
  if (!name) { showToast('أدخل اسم المادة','error'); return; }
  const c = getChild();
  if (c.subjects.find(s => s.name === name)) { showToast('المادة موجودة مسبقاً','error'); return; }
  c.subjects.push({ id: uid(), name, max: +document.getElementById('sm-max').value||100, color: document.getElementById('sm-color').value });
  persist();
  renderGrades();
  closeModal('subject-modal');
  showToast('تمت إضافة المادة ✓','success');
}

async function deleteSubject(sid) {
  const c = getChild();
  const s = c.subjects.find(x => x.id === sid);
  if (!await confirmAsync(`حذف مادة "${esc(s?.name)}"؟ ستُحذف درجاتها أيضاً.`)) return;
  c.subjects = c.subjects.filter(x => x.id !== sid);
  // Remove from grades
  Object.values(c.grades).forEach(yr => Object.values(yr).forEach(tr => delete tr[sid]));
  persist();
  renderGrades();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Grades Grid
// ═══════════════════════════════════════════════════════════════════════════════
function renderGrades() {
  const c     = getChild();
  const wrap  = document.getElementById('grade-wrap');
  const yearId = document.getElementById('sel-year').value;

  if (!c || !yearId) { wrap.innerHTML = `<div class="empty-state">اختر أو أضف سنة دراسية</div>`; return; }
  const year = c.years.find(y => y.id === yearId);
  if (!year) { wrap.innerHTML = `<div class="empty-state">السنة غير موجودة</div>`; return; }
  if (!c.subjects.length) { wrap.innerHTML = `<div class="empty-state">أضف المواد الدراسية أولاً</div>`; return; }

  const terms = year.terms || [];
  const yg    = c.grades[yearId] || {};
  const tw    = t => (t.weight != null ? +t.weight : 1);   // وزن الفصل (افتراضي متساوٍ)
  const hasWeights = terms.some(t => t.weight != null);
  const gCls = p => p === null ? 'g-empty' : p >= 90 ? 'g-A' : p >= 75 ? 'g-B' : p >= 60 ? 'g-C' : 'g-D';

  // Header
  let html = `<table class="grade-tbl"><thead>
    <tr>
      <th style="text-align:right">المادة</th>`;
  terms.forEach(t => {
    const wlbl = (t.weight != null) ? ` <span style="font-weight:400;opacity:.7;font-size:.85em">(${t.weight}%)</span>` : '';
    html += `<th class="term-head">${esc(t.label)}${wlbl}</th>`;
  });
  html += `<th class="avg-head">المعدل${hasWeights ? ' (موزون)' : ''}</th></tr></thead><tbody>`;

  // Per subject row — معدل المادة موزون بأوزان الفصول
  c.subjects.forEach(sub => {
    const sg = yg[sub.id] || {};
    let wScore = 0, wSum = 0;
    terms.forEach(t => { const sc = sg[t.id]; if (sc != null) { wScore += sc * tw(t); wSum += tw(t); } });
    const avg    = wSum ? wScore / wSum : null;
    const avgPct = avg !== null ? (avg / sub.max * 100) : null;

    html += `<tr class="subj-row">
      <td>
        <span style="color:${sub.color||'var(--accent)'};margin-left:4px">●</span>
        ${esc(sub.name)}
        <button class="subj-del-btn" onclick="deleteSubject('${sub.id}')" title="حذف المادة">✕</button>
      </td>`;

    terms.forEach(t => {
      const sc  = sg[t.id] != null ? sg[t.id] : null;
      const pct = sc !== null ? sc / sub.max * 100 : null;
      const disp = sc !== null ? sc : '—';
      html += `<td class="g-cell ${gCls(pct)}" onclick="openGradeModal('${yearId}','${t.id}','${sub.id}')" title="${esc(sub.name)} — ${esc(t.label)}">${disp}</td>`;
    });

    html += `<td class="${gCls(avgPct)}">${avg !== null ? avg.toFixed(1) : '—'}</td></tr>`;
  });

  // Overall row — معدل الفصل (غير موزون عبر المواد) + المعدل الكلي (موزون بالفصول)
  html += `<tr style="border-top:2px solid var(--border)"><td style="font-weight:700;color:var(--accent)">المعدل الكلي</td>`;
  let ovScore = 0, ovSum = 0;
  terms.forEach(t => {
    const termScores = c.subjects.map(s => {
      const sc = (yg[s.id]||{})[t.id];
      return sc != null ? sc / s.max * 100 : null;
    }).filter(x => x !== null);
    const avg = termScores.length ? (termScores.reduce((a,b)=>a+b,0)/termScores.length) : null;
    if (avg !== null) { ovScore += avg * tw(t); ovSum += tw(t); }
    html += `<td class="${gCls(avg)}" style="font-weight:700">${avg !== null ? avg.toFixed(1)+'%' : '—'}</td>`;
  });
  const overallAvg = ovSum ? ovScore / ovSum : null;
  html += `<td class="${gCls(overallAvg)}" style="font-weight:700">${overallAvg !== null ? overallAvg.toFixed(1)+'%' : '—'}</td></tr>`;
  html += `</tbody></table>`;
  wrap.innerHTML = html;

  renderTrend(c);
}

// ── رسم تطوّر المعدل عبر الفصول والسنوات (Chart.js) ──────────────────────────
let _trendChart = null;
function _yearTermOverall(c, year, termId) {
  const yg = c.grades[year.id] || {};
  const scores = c.subjects.map(s => {
    const sc = (yg[s.id] || {})[termId];
    return sc != null ? sc / s.max * 100 : null;
  }).filter(x => x !== null);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}
function renderTrend(c) {
  const cv = document.getElementById('trend-chart');
  const empty = document.getElementById('trend-empty');
  if (!cv || typeof Chart === 'undefined') return;
  const labels = [], data = [];
  (c.years || []).forEach(y => (y.terms || []).forEach(t => {
    const ov = _yearTermOverall(c, y, t.id);
    if (ov !== null) { labels.push(`${y.label} · ${t.label}`); data.push(+ov.toFixed(1)); }
  }));
  if (_trendChart) { _trendChart.destroy(); _trendChart = null; }
  if (data.length < 2) {   // نقطة واحدة لا تروي اتجاهاً
    cv.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }
  cv.style.display = '';
  if (empty) empty.style.display = 'none';
  const light = document.body.classList.contains('light-mode');
  const grid  = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const txt   = light ? '#52606d' : '#8b949e';
  _trendChart = new Chart(cv.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{
      label: 'المعدل الكلي %', data,
      borderColor: '#0e9e8e', backgroundColor: 'rgba(14,158,142,0.12)',
      borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#0e9e8e', fill: true, tension: 0.3
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${i.raw}%` } } },
      scales: {
        y: { suggestedMin: 0, suggestedMax: 100, ticks: { color: txt, callback: v => v + '%', font: { family: 'Tajawal' } }, grid: { color: grid } },
        x: { ticks: { color: txt, font: { family: 'Tajawal', size: 10 }, maxRotation: 45, minRotation: 0 }, grid: { color: grid } }
      }
    }
  });
}

// ── Grade Modal ───────────────────────────────────────────────────────────────
function openGradeModal(yearId, termId, subjectId) {
  gradeCtx = { yearId, termId, subjectId };
  const c   = getChild();
  const sub = c.subjects.find(s => s.id === subjectId);
  const yr  = c.years.find(y => y.id === yearId);
  const tm  = yr?.terms.find(t => t.id === termId);
  const cur = (c.grades[yearId]?.[subjectId]?.[termId]);
  document.getElementById('grd-title').textContent = `${sub?.name||''} — ${tm?.label||''}`;
  document.getElementById('grd-score').value = cur != null ? cur : '';
  document.getElementById('grd-score').max   = sub?.max || 100;
  document.getElementById('grd-note').value  = (c.grades[yearId]?.[subjectId]?.['note_'+termId]) || '';
  // Quick buttons
  const max = sub?.max || 100;
  const quicks = [max, Math.round(max*0.95), Math.round(max*0.9), Math.round(max*0.8), Math.round(max*0.7)];
  document.getElementById('grd-quick-btns').innerHTML = quicks.map(v =>
    `<button class="grade-quick" onclick="document.getElementById('grd-score').value=${v}">${v}</button>`).join('');
  document.getElementById('grade-modal').classList.add('open');
  document.getElementById('grd-score').focus();
}

function saveGrade(clear) {
  if (!gradeCtx) return;
  const { yearId, termId, subjectId } = gradeCtx;
  const c = getChild();
  if (!c.grades[yearId])             c.grades[yearId]             = {};
  if (!c.grades[yearId][subjectId])  c.grades[yearId][subjectId]  = {};
  if (clear) {
    delete c.grades[yearId][subjectId][termId];
    delete c.grades[yearId][subjectId]['note_'+termId];
  } else {
    const val = parseFloat(document.getElementById('grd-score').value);
    const max = getChild().subjects.find(s => s.id === subjectId)?.max || 100;
    if (isNaN(val) || val < 0 || val > max) { showToast(`أدخل درجة بين 0 و${max}`,'error'); return; }
    c.grades[yearId][subjectId][termId] = val;
    const note = document.getElementById('grd-note').value.trim();
    if (note) c.grades[yearId][subjectId]['note_'+termId] = note;
    else delete c.grades[yearId][subjectId]['note_'+termId];
  }
  persist();
  renderGrades();
  closeModal('grade-modal');
  showToast('تم الحفظ ✓','success');
}

// Enter key shortcut in grade modal
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('grade-modal').classList.contains('open')) {
    if (document.activeElement.id !== 'grd-note') { e.preventDefault(); saveGrade(false); }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// المتابعة اليومية: الحضور · السلوك · الواجبات · الاختبارات
// ═══════════════════════════════════════════════════════════════════════════════
const ATT_MAP = { present:'✅ حاضر', absent:'❌ غائب', late:'⏰ متأخر', excused:'📋 بعذر' };
const BEH_MAP = { positive:'🌟 إيجابي', negative:'⚠️ سلبي' };
const HW_MAP  = { pending:'⏳ معلّق', done:'✅ مُسلّم', late:'🔴 متأخر' };

function subjName(id) { const c = getChild(); return (c?.subjects||[]).find(s => s.id === id)?.name || '—'; }
function subjectOptions(sel) {
  const c = getChild();
  return '<option value="">— عام —</option>' +
    (c?.subjects||[]).map(s => `<option value="${s.id}" ${s.id===sel?'selected':''}>${esc(s.name)}</option>`).join('');
}
function deleteDaily(arrName, id, rerender) {
  const c = getChild(); if (!c) return;
  c[arrName] = (c[arrName]||[]).filter(x => x.id !== id);
  persist(); rerender();
}

// ── الحضور ──────────────────────────────────────────────────────────────────
function renderAttendance() {
  const c = getChild(); if (!c) return;
  const list = (c.attendance||[]).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const cnt = { present:0, absent:0, late:0, excused:0 };
  list.forEach(a => cnt[a.status] = (cnt[a.status]||0) + 1);
  const sum = document.getElementById('att-summary');
  if (sum) sum.innerHTML = Object.entries(ATT_MAP).map(([k,l]) =>
    `<span class="daily-pill">${l}: <strong>${cnt[k]||0}</strong></span>`).join('');
  const body = document.getElementById('att-body'); if (!body) return;
  body.innerHTML = list.length ? list.map(a => `<tr>
    <td>${formatDate(a.date)}</td><td>${ATT_MAP[a.status]||a.status}</td>
    <td>${a.note?esc(a.note):'—'}</td>
    <td class="actions-cell"><button class="btn-icon danger" onclick="deleteDaily('attendance','${a.id}',renderAttendance)" title="حذف">🗑️</button></td>
  </tr>`).join('') : `<tr><td colspan="4"><div class="empty-state">لا سجلات حضور — اضغط "＋ تسجيل"</div></td></tr>`;
}
function openAttModal() {
  document.getElementById('att-date').value = todayISO();
  document.getElementById('att-status').value = 'present';
  document.getElementById('att-note').value = '';
  document.getElementById('att-modal').classList.add('open');
}
function saveAtt() {
  const c = getChild(); if (!c) return;
  const date = document.getElementById('att-date').value;
  if (!date) { showToast('اختر التاريخ','error'); return; }
  if (!c.attendance) c.attendance = [];
  c.attendance.push({ id: uid(), date, status: document.getElementById('att-status').value, note: document.getElementById('att-note').value.trim() });
  persist(); renderAttendance(); closeModal('att-modal'); showToast('تم التسجيل ✓','success');
}

// ── السلوك ──────────────────────────────────────────────────────────────────
function renderBehavior() {
  const c = getChild(); if (!c) return;
  const list = (c.behavior||[]).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const pos = list.filter(b => b.type==='positive').length, neg = list.filter(b => b.type==='negative').length;
  const sum = document.getElementById('beh-summary');
  if (sum) sum.innerHTML = `<span class="daily-pill">🌟 إيجابي: <strong>${pos}</strong></span><span class="daily-pill">⚠️ سلبي: <strong>${neg}</strong></span>`;
  const body = document.getElementById('beh-body'); if (!body) return;
  body.innerHTML = list.length ? list.map(b => `<tr>
    <td>${formatDate(b.date)}</td><td>${BEH_MAP[b.type]||b.type}</td>
    <td>${esc(b.title||'—')}</td><td>${b.note?esc(b.note):'—'}</td>
    <td class="actions-cell"><button class="btn-icon danger" onclick="deleteDaily('behavior','${b.id}',renderBehavior)" title="حذف">🗑️</button></td>
  </tr>`).join('') : `<tr><td colspan="5"><div class="empty-state">لا ملاحظات سلوك — اضغط "＋ ملاحظة"</div></td></tr>`;
}
function openBehModal() {
  document.getElementById('beh-date').value = todayISO();
  document.getElementById('beh-type').value = 'positive';
  document.getElementById('beh-title').value = '';
  document.getElementById('beh-note').value = '';
  document.getElementById('beh-modal').classList.add('open');
}
function saveBeh() {
  const c = getChild(); if (!c) return;
  const title = document.getElementById('beh-title').value.trim();
  if (!title) { showToast('أدخل عنوان الملاحظة','error'); return; }
  if (!c.behavior) c.behavior = [];
  c.behavior.push({ id: uid(), date: document.getElementById('beh-date').value || todayISO(), type: document.getElementById('beh-type').value, title, note: document.getElementById('beh-note').value.trim() });
  persist(); renderBehavior(); closeModal('beh-modal'); showToast('تم الحفظ ✓','success');
}

// ── الواجبات ────────────────────────────────────────────────────────────────
function renderHomework() {
  const c = getChild(); if (!c) return;
  const today = todayISO();
  // متأخر تلقائياً: معلّق وتجاوز موعده
  (c.homework||[]).forEach(h => { if (h.status==='pending' && h.due && h.due < today) h.status='late'; });
  const list = (c.homework||[]).slice().sort((a,b) => (a.due||'').localeCompare(b.due||''));
  const pend = list.filter(h => h.status==='pending').length, late = list.filter(h => h.status==='late').length;
  const sum = document.getElementById('hw-summary');
  if (sum) sum.innerHTML = `<span class="daily-pill">⏳ معلّق: <strong>${pend}</strong></span><span class="daily-pill">🔴 متأخر: <strong>${late}</strong></span>`;
  const body = document.getElementById('hw-body'); if (!body) return;
  body.innerHTML = list.length ? list.map(h => `<tr>
    <td>${esc(h.title)}</td><td>${esc(subjName(h.subjectId))}</td>
    <td>${h.due?formatDate(h.due):'—'}</td>
    <td><select class="status-sel" onchange="updateHwStatus('${h.id}',this.value)">
      ${Object.entries(HW_MAP).map(([v,l])=>`<option value="${v}" ${v===h.status?'selected':''}>${l}</option>`).join('')}
    </select></td>
    <td>${h.note?esc(h.note):'—'}</td>
    <td class="actions-cell"><button class="btn-icon danger" onclick="deleteDaily('homework','${h.id}',renderHomework)" title="حذف">🗑️</button></td>
  </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state">لا واجبات — اضغط "＋ واجب"</div></td></tr>`;
}
function updateHwStatus(id, val) {
  const c = getChild(); const h = (c?.homework||[]).find(x => x.id===id);
  if (!h) return; h.status = val; persist(); renderHomework();
}
function openHwModal() {
  document.getElementById('hw-title').value = '';
  document.getElementById('hw-subject').innerHTML = subjectOptions('');
  document.getElementById('hw-due').value = '';
  document.getElementById('hw-status').value = 'pending';
  document.getElementById('hw-note').value = '';
  document.getElementById('hw-modal').classList.add('open');
}
function saveHw() {
  const c = getChild(); if (!c) return;
  const title = document.getElementById('hw-title').value.trim();
  if (!title) { showToast('أدخل عنوان الواجب','error'); return; }
  if (!c.homework) c.homework = [];
  c.homework.push({ id: uid(), title, subjectId: document.getElementById('hw-subject').value, due: document.getElementById('hw-due').value, status: document.getElementById('hw-status').value, note: document.getElementById('hw-note').value.trim() });
  persist(); renderHomework(); closeModal('hw-modal'); showToast('تم الحفظ ✓','success');
}

// ── الاختبارات ──────────────────────────────────────────────────────────────
function renderExams() {
  const c = getChild(); if (!c) return;
  const today = todayISO();
  const list = (c.exams||[]).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
  const upcoming = list.filter(e => (e.date||'') >= today);
  const sum = document.getElementById('exam-summary');
  if (sum) {
    const next = upcoming[0];
    sum.innerHTML = next
      ? `<span class="daily-pill">📅 القادم: <strong>${esc(next.title)}</strong> — ${formatDate(next.date)} (${daysUntil(next.date)})</span>`
      : `<span class="daily-pill">لا اختبارات قادمة</span>`;
  }
  const body = document.getElementById('exam-body'); if (!body) return;
  body.innerHTML = list.length ? list.map(e => {
    const isPast = (e.date||'') < today;
    return `<tr style="${isPast?'opacity:.55':''}">
      <td>${formatDate(e.date)}${!isPast?` <span class="text-accent" style="font-size:.74rem">(${daysUntil(e.date)})</span>`:''}</td>
      <td>${esc(e.title)}</td><td>${esc(subjName(e.subjectId))}</td>
      <td>${e.note?esc(e.note):'—'}</td>
      <td class="actions-cell"><button class="btn-icon danger" onclick="deleteDaily('exams','${e.id}',renderExams)" title="حذف">🗑️</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="5"><div class="empty-state">لا اختبارات مسجّلة — اضغط "＋ اختبار"</div></td></tr>`;
}
function daysUntil(dateStr) {
  const d = parseDateLocal(dateStr); if (!d) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'غداً';
  if (diff > 1)  return `بعد ${diff} يوم`;
  return `قبل ${-diff} يوم`;
}
function openExamModal() {
  document.getElementById('exam-title').value = '';
  document.getElementById('exam-subject').innerHTML = subjectOptions('');
  document.getElementById('exam-date').value = '';
  document.getElementById('exam-note').value = '';
  document.getElementById('exam-modal').classList.add('open');
}
function saveExam() {
  const c = getChild(); if (!c) return;
  const title = document.getElementById('exam-title').value.trim();
  const date  = document.getElementById('exam-date').value;
  if (!title || !date) { showToast('أدخل عنوان الاختبار وتاريخه','error'); return; }
  if (!c.exams) c.exams = [];
  c.exams.push({ id: uid(), title, subjectId: document.getElementById('exam-subject').value, date, note: document.getElementById('exam-note').value.trim() });
  persist(); renderExams(); closeModal('exam-modal'); showToast('تم الحفظ ✓','success');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared modal helpers
// ═══════════════════════════════════════════════════════════════════════════════
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('click', e => {
  ['child-modal','extra-modal','goal-modal','year-modal','subject-modal','grade-modal',
   'att-modal','beh-modal','hw-modal','exam-modal'].forEach(id => {
    if (e.target.id === id) closeModal(id);
  });
});
