let cashflows = [];
let editingId  = null;

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-cashflows');
  document.getElementById('cf-year').value = new Date().getFullYear();
  await loadCashflows();
  renderTable();
}

async function loadCashflows() {
  const { data, error } = await supabaseClient
    .from('cash_flows').select('*').order('year', { ascending: false });
  if (error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  cashflows = data || [];
}

function renderTable() {
  const totalPlanned = cashflows.reduce((s, c) => s + parseFloat(c.planned_amount || 0), 0);
  const totalActual  = cashflows.reduce((s, c) => s + parseFloat(c.actual_amount  || 0), 0);

  document.getElementById('total-planned').textContent = formatSAR(totalPlanned);
  document.getElementById('total-actual').textContent  = formatSAR(totalActual);

  const pct = totalPlanned > 0 ? Math.min((totalActual / totalPlanned) * 100, 100) : 0;
  document.getElementById('overall-progress-fill').style.width = pct + '%';
  document.getElementById('overall-pct').textContent = pct.toFixed(1) + '%';

  const tbody = document.getElementById('cf-tbody');
  if (!cashflows.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">📈</div><p>لا توجد بيانات، ابدأ بإضافة سنة</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = cashflows.map(c => {
    const planned = parseFloat(c.planned_amount || 0);
    const actual  = parseFloat(c.actual_amount  || 0);
    const diff    = actual - planned;
    const pct     = planned > 0 ? Math.min((actual / planned) * 100, 100) : 0;
    const diffCls = diff >= 0 ? 'text-success' : 'text-danger';

    return `<tr>
      <td><strong>${c.year}</strong></td>
      <td class="num">${formatSAR(planned)}</td>
      <td class="num">${formatSAR(actual)}</td>
      <td class="num ${diffCls}">${formatSAR(diff, true)}</td>
      <td>
        <div class="progress-bar" style="min-width:100px">
          <div class="progress-fill" style="width:${pct}%;background:${pct>=100?'var(--success)':'var(--accent)'}"></div>
        </div>
        <span class="small text-muted">${pct.toFixed(1)}%</span>
      </td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="openModal('${c.id}')">تعديل</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCashflow('${c.id}')">حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openModal(id = null) {
  editingId = id;
  document.getElementById('modal-title').textContent = id ? 'تعديل السنة' : 'إضافة سنة جديدة';
  if (id) {
    const c = cashflows.find(x => x.id === id);
    if (!c) return;
    document.getElementById('m-year').value    = c.year;
    document.getElementById('m-planned').value = c.planned_amount;
    document.getElementById('m-actual').value  = c.actual_amount;
  } else {
    document.getElementById('cf-modal-form').reset();
    document.getElementById('m-year').value = new Date().getFullYear();
  }
  document.getElementById('cf-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('cf-modal').style.display = 'none';
  editingId = null;
}

async function saveCashflow(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();

  const payload = {
    user_id:        user.id,
    year:           parseInt(document.getElementById('m-year').value),
    planned_amount: parseFloat(document.getElementById('m-planned').value) || 0,
    actual_amount:  parseFloat(document.getElementById('m-actual').value)  || 0
  };

  let error;
  if (editingId) {
    ({ error } = await supabaseClient.from('cash_flows').update(payload).eq('id', editingId));
  } else {
    ({ error } = await supabaseClient.from('cash_flows').insert([payload]));
  }

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editingId ? 'تم التحديث بنجاح' : 'تمت الإضافة بنجاح', 'success');
  closeModal();
  await loadCashflows();
  renderTable();
}

async function deleteCashflow(id) {
  if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
  const { error } = await supabaseClient.from('cash_flows').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف بنجاح', 'success');
  await loadCashflows();
  renderTable();
}

init();
