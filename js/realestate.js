let properties = [];
let editingId  = null;

const STATUS_LABELS = { owned: 'مملوك', rented: 'مؤجر', sold: 'مباع' };
const TYPE_OPTIONS  = ['شقة سكنية','فيلا','أرض','مكتب تجاري','محل تجاري','مستودع','أخرى'];

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-realestate');
  document.getElementById('re-purchase-date').value = todayISO();
  await loadProperties();
  renderStats();
  renderTable();
}

async function loadProperties() {
  const { data, error } = await supabaseClient
    .from('real_estate').select('*').order('purchase_date', { ascending: false });
  if (error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  properties = data || [];
}

function renderStats() {
  const owned   = properties.filter(p => p.status !== 'sold');
  const totalPurchase = owned.reduce((s, p) => s + parseFloat(p.purchase_value || 0), 0);
  const totalCurrent  = owned.reduce((s, p) => s + parseFloat(p.current_value  || 0), 0);
  const totalRental   = properties.filter(p => p.status === 'rented')
                                  .reduce((s, p) => s + parseFloat(p.monthly_rental || 0), 0);
  const totalPnL      = totalCurrent - totalPurchase;

  document.getElementById('re-total-value').textContent   = formatSAR(totalCurrent);
  document.getElementById('re-total-cost').textContent    = formatSAR(totalPurchase);
  document.getElementById('re-total-rental').textContent  = formatSAR(totalRental);
  const pnlEl = document.getElementById('re-pnl');
  pnlEl.textContent = formatSAR(totalPnL, true);
  pnlEl.className = 'value num ' + (totalPnL >= 0 ? 'text-success' : 'text-danger');
}

function renderTable() {
  const tbody = document.getElementById('re-tbody');
  if (!properties.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">🏠</div><p>لا توجد عقارات مسجلة بعد</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = properties.map(p => {
    const pnl    = parseFloat(p.current_value) - parseFloat(p.purchase_value);
    const pnlCls = pnl >= 0 ? 'text-success' : 'text-danger';

    return `<tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.type}</td>
      <td class="num">${formatSAR(p.purchase_value)}</td>
      <td class="num">${formatSAR(p.current_value)}</td>
      <td class="num ${pnlCls}">${formatSAR(pnl, true)}</td>
      <td><span class="badge badge-${p.status}">${STATUS_LABELS[p.status] || p.status}</span></td>
      <td class="num ${p.status === 'rented' ? 'text-success' : 'text-muted'}">${p.status === 'rented' ? formatSAR(p.monthly_rental) : '—'}</td>
      <td>${formatDate(p.purchase_date)}</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="openModal('${p.id}')">تعديل</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProperty('${p.id}')">حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openModal(id = null) {
  editingId = id;
  document.getElementById('re-modal-title').textContent = id ? 'تعديل العقار' : 'إضافة عقار جديد';

  if (id) {
    const p = properties.find(x => x.id === id);
    if (!p) return;
    document.getElementById('m-name').value          = p.name;
    document.getElementById('m-type').value          = p.type;
    document.getElementById('m-purchase-val').value  = p.purchase_value;
    document.getElementById('m-current-val').value   = p.current_value;
    document.getElementById('m-status').value        = p.status;
    document.getElementById('m-rental').value        = p.monthly_rental || '';
    document.getElementById('m-purchase-date').value = p.purchase_date || '';
  } else {
    document.getElementById('re-modal-form').reset();
    document.getElementById('m-purchase-date').value = todayISO();
  }

  document.getElementById('re-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('re-modal').style.display = 'none';
  editingId = null;
}

async function saveProperty(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();

  const payload = {
    user_id:        user.id,
    name:           document.getElementById('m-name').value.trim(),
    type:           document.getElementById('m-type').value,
    purchase_value: parseFloat(document.getElementById('m-purchase-val').value)  || 0,
    current_value:  parseFloat(document.getElementById('m-current-val').value)   || 0,
    status:         document.getElementById('m-status').value,
    monthly_rental: parseFloat(document.getElementById('m-rental').value)         || 0,
    purchase_date:  document.getElementById('m-purchase-date').value || null
  };

  let error;
  if (editingId) {
    ({ error } = await supabaseClient.from('real_estate').update(payload).eq('id', editingId));
  } else {
    ({ error } = await supabaseClient.from('real_estate').insert([payload]));
  }

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editingId ? 'تم تحديث العقار بنجاح' : 'تمت إضافة العقار بنجاح', 'success');
  closeModal();
  await loadProperties();
  renderStats();
  renderTable();
}

async function deleteProperty(id) {
  if (!confirm('هل أنت متأكد من حذف هذا العقار؟')) return;
  const { error } = await supabaseClient.from('real_estate').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف بنجاح', 'success');
  await loadProperties();
  renderStats();
  renderTable();
}

init();
