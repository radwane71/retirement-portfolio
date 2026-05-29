let cfEntries = [];
let cfFiltered = [];

const TYPE_AR = { deposit: 'إيداع', withdrawal: 'سحب' };

function edCf(rowId, field, type, raw, extraCls = '', selectKey = '') {
  return `class="editable${type==='number'?' num':''}${extraCls?' '+extraCls:''}" ` +
    `data-table="cashflow_entries" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"` +
    (selectKey ? ` data-select="${selectKey}"` : '');
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-cashflows');

  document.getElementById('cf-date').value = todayISO();
  await loadEntries();
  buildYearFilter();
  renderSummary();
  renderTable();
}

async function loadEntries() {
  const { data, error } = await supabaseClient
    .from('cashflow_entries').select('*').order('date', { ascending: false });
  if (error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  cfEntries = data || [];
}

function buildYearFilter() {
  const years = [...new Set(cfEntries.map(e => new Date(e.date).getFullYear()))].sort((a,b) => b-a);
  const sel = document.getElementById('cf-year-filter');
  // keep first "كل السنوات" option
  sel.innerHTML = '<option value="">كل السنوات</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join('');
  // default to current year if available
  const curYear = new Date().getFullYear();
  if (years.includes(curYear)) sel.value = curYear;
  applyFilter();
}

function applyFilter() {
  const yr = document.getElementById('cf-year-filter')?.value;
  cfFiltered = yr ? cfEntries.filter(e => new Date(e.date).getFullYear() === +yr) : [...cfEntries];
}

function filterYear() {
  applyFilter();
  renderTable();
}

function renderSummary() {
  const totalDep  = cfEntries.filter(e => e.type === 'deposit').reduce((s,e) => s + +e.amount, 0);
  const totalWith = cfEntries.filter(e => e.type === 'withdrawal').reduce((s,e) => s + +e.amount, 0);
  const net       = totalDep - totalWith;

  const curYear   = new Date().getFullYear();
  const yearDep   = cfEntries.filter(e => e.type === 'deposit'    && new Date(e.date).getFullYear() === curYear).reduce((s,e) => s + +e.amount, 0);
  const yearWith  = cfEntries.filter(e => e.type === 'withdrawal' && new Date(e.date).getFullYear() === curYear).reduce((s,e) => s + +e.amount, 0);
  const yearNet   = yearDep - yearWith;

  const el = id => document.getElementById(id);
  if (el('cf-total-dep'))  el('cf-total-dep').textContent  = formatSAR(totalDep);
  if (el('cf-total-with')) el('cf-total-with').textContent = formatSAR(totalWith);

  const netEl = el('cf-net');
  if (netEl) { netEl.textContent = formatSAR(net, true); netEl.className = 'value num ' + (net >= 0 ? 'text-success' : 'text-danger'); }

  const yrEl = el('cf-this-year');
  if (yrEl) { yrEl.textContent = formatSAR(yearNet, true); yrEl.className = 'value num ' + (yearNet >= 0 ? 'text-success' : 'text-danger'); }
  if (el('cf-this-year-lbl')) el('cf-this-year-lbl').textContent = `صافي ${curYear}: إيداع ${formatSAR(yearDep)} / سحب ${formatSAR(yearWith)}`;
}

function renderTable() {
  const tbody = document.getElementById('cf-tbody');
  if (!tbody) return;

  if (!cfFiltered.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">📈</div><p>لا توجد حركات لهذه الفترة</p></div></td></tr>`;
    enableInlineEditing(tbody, onCfSaved);
    return;
  }

  tbody.innerHTML = cfFiltered.map(e => `<tr>
    <td ${edCf(e.id,'date','date',e.date)}>${formatDate(e.date)}</td>
    <td ${edCf(e.id,'type','text',e.type,'','cftype')}>
      <span class="badge badge-${e.type}">${TYPE_AR[e.type] || e.type}</span>
    </td>
    <td ${edCf(e.id,'amount','number',e.amount,'num ' + (e.type==='deposit'?'text-success':'text-danger'),'')}>
      ${e.type === 'deposit' ? '+' : '−'}${formatSAR(e.amount)}
    </td>
    <td ${edCf(e.id,'notes','text',e.notes||'','text-muted small')}>${esc(e.notes || '—')}</td>
    <td><button class="btn btn-danger btn-sm" onclick="deleteEntry('${esc(e.id)}')">حذف</button></td>
  </tr>`).join('');

  enableInlineEditing(tbody, onCfSaved);
}

async function onCfSaved(id, field, val) {
  const e = cfEntries.find(x => x.id === id);
  if (e) e[field] = val;
  applyFilter();
  renderSummary();
  renderTable();
}

function resetForm() {
  document.getElementById('cf-form').reset();
  document.getElementById('cf-date').value = todayISO();
}

async function addEntry(ev) {
  ev.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id: user.id,
    date:    document.getElementById('cf-date').value,
    type:    document.getElementById('cf-type').value,
    amount:  +document.getElementById('cf-amount').value,
    notes:   document.getElementById('cf-notes').value.trim()
  };
  const { error } = await supabaseClient.from('cashflow_entries').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم التسجيل', 'success');
  resetForm();
  await loadEntries();
  buildYearFilter();
  renderSummary();
  renderTable();
}

async function deleteEntry(id) {
  if (!confirm('هل أنت متأكد من الحذف؟')) return;
  const { error } = await supabaseClient.from('cashflow_entries').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await loadEntries();
  buildYearFilter();
  renderSummary();
  renderTable();
}

init();
