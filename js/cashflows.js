let cashflows = [];
let editingId  = null;

function ed(table, rowId, field, type, raw, extraCls = '') {
  return `class="editable${type==='number'?' num':''}${extraCls?' '+extraCls:''}" ` +
    `data-table="${table}" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"`;
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-cashflows');
  document.getElementById('cf-year').value = new Date().getFullYear();
  await loadCashflows();
  renderTable();
}

async function loadCashflows() {
  const { data, error } = await supabaseClient.from('cash_flows').select('*').order('year', { ascending: false });
  if (error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  cashflows = data || [];
}

function renderTable() {
  const totalPlanned = cashflows.reduce((s, c) => s + +c.planned_amount, 0);
  const totalActual  = cashflows.reduce((s, c) => s + +c.actual_amount,  0);

  const el = id => document.getElementById(id);
  if (el('total-planned')) el('total-planned').textContent = formatSAR(totalPlanned);
  if (el('total-actual'))  el('total-actual').textContent  = formatSAR(totalActual);

  const pct = totalPlanned > 0 ? Math.min(totalActual / totalPlanned * 100, 100) : 0;
  if (el('overall-pct'))           el('overall-pct').textContent = pct.toFixed(1) + '%';
  if (el('overall-progress-fill')) el('overall-progress-fill').style.width = pct + '%';

  const tbody = el('cf-tbody');
  if (!tbody) return;

  if (!cashflows.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">📈</div><p>لا توجد بيانات — ابدأ بإضافة سنة</p></div></td></tr>`;
    enableInlineEditing(tbody, onCfSaved);
    return;
  }

  tbody.innerHTML = cashflows.map(c => {
    const planned = +c.planned_amount, actual = +c.actual_amount;
    const diff    = actual - planned;
    const pct     = planned > 0 ? Math.min(actual / planned * 100, 100) : 0;
    const dCls    = diff >= 0 ? 'text-success' : 'text-danger';

    return `<tr>
      <td ${ed('cash_flows',c.id,'year','number',c.year,'bold')}>${c.year}</td>
      <td ${ed('cash_flows',c.id,'planned_amount','number',c.planned_amount,'num')}>${formatSAR(planned)}</td>
      <td ${ed('cash_flows',c.id,'actual_amount', 'number',c.actual_amount, 'num text-success')}>${formatSAR(actual)}</td>
      <td class="num ${dCls}">${formatSAR(diff, true)}</td>
      <td>
        <div class="progress-bar" style="min-width:100px">
          <div class="progress-fill" style="width:${pct.toFixed(0)}%;background:${pct>=100?'var(--success)':'var(--accent)'}"></div>
        </div>
        <span class="small text-muted">${pct.toFixed(1)}%</span>
      </td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteCf('${esc(c.id)}')">حذف</button></td>
    </tr>`;
  }).join('');

  enableInlineEditing(tbody, onCfSaved);
}

async function onCfSaved(id, field, val) {
  const c = cashflows.find(x => x.id === id);
  if (c) c[field] = val;
  renderTable();
}

async function addCashflow(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id:        user.id,
    year:           +document.getElementById('cf-year').value,
    planned_amount: +document.getElementById('cf-planned').value || 0,
    actual_amount:  +document.getElementById('cf-actual').value  || 0
  };
  const { error } = await supabaseClient.from('cash_flows').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message + (error.code === '23505' ? ' — السنة موجودة مسبقاً' : ''), 'error'); return; }
  showToast('تمت الإضافة', 'success');
  document.getElementById('cf-form').reset();
  document.getElementById('cf-year').value = new Date().getFullYear();
  await loadCashflows();
  renderTable();
}

async function deleteCf(id) {
  if (!confirm('هل أنت متأكد من الحذف؟')) return;
  const { error } = await supabaseClient.from('cash_flows').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await loadCashflows();
  renderTable();
}

init();
