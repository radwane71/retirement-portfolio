let properties = [];
let editingId  = null;
let _userId    = null;

const STATUS_LBL = { owned: 'مملوك', rented: 'مؤجر', sold: 'مباع' };

function ed(table, rowId, field, type, raw, extraCls = '', selectKey = '') {
  return `class="editable${type==='number'?' num':''}${extraCls?' '+extraCls:''}" ` +
    `data-table="${table}" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"` +
    (selectKey ? ` data-select="${selectKey}"` : '');
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  _userId = user.id;
  setActiveNav('nav-realestate');
  await loadProperties();
  renderStats();
  renderTable();
}

async function loadProperties() {
  const { data, error } = await supabaseClient
    .from('real_estate')
    .select('*')
    .eq('user_id', _userId)
    .eq('is_active', true)
    .order('purchase_date', { ascending: false });
  if (error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  properties = data || [];
}

function renderStats() {
  const active       = properties.filter(p => p.status !== 'sold');
  const totalPurch   = active.reduce((s, p) => s + +p.purchase_value, 0);
  const totalCurrent = active.reduce((s, p) => s + +p.current_value, 0);
  const totalRental  = properties.filter(p => p.status === 'rented').reduce((s, p) => s + +p.monthly_rental, 0);
  const pnl          = totalCurrent - totalPurch;

  const el = id => document.getElementById(id);
  if (el('re-total-value'))  el('re-total-value').textContent  = formatSAR(totalCurrent);
  if (el('re-total-cost'))   el('re-total-cost').textContent   = formatSAR(totalPurch);
  if (el('re-total-rental')) el('re-total-rental').textContent = formatSAR(totalRental);
  const pnlEl = el('re-pnl');
  if (pnlEl) { pnlEl.textContent = formatSAR(pnl, true); pnlEl.className = 'value num ' + (pnl >= 0 ? 'text-success' : 'text-danger'); }
}

function renderTable() {
  const tbody = document.getElementById('re-tbody');
  if (!tbody) return;

  if (!properties.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">🏠</div><p>لا توجد عقارات مسجلة بعد</p></div></td></tr>`;
    enableInlineEditing(tbody, onReSaved);
    return;
  }

  tbody.innerHTML = properties.map(p => {
    const pnl    = +p.current_value - +p.purchase_value;
    const pnlCls = pnl >= 0 ? 'text-success' : 'text-danger';
    return `<tr>
      <td ${ed('real_estate',p.id,'name','text',p.name,'bold')}>${esc(p.name)}</td>
      <td ${ed('real_estate',p.id,'type','text',p.type,'small text-muted')}>${esc(p.type)}</td>
      <td ${ed('real_estate',p.id,'purchase_value','number',p.purchase_value,'num')}>${formatSAR(p.purchase_value)}</td>
      <td ${ed('real_estate',p.id,'current_value', 'number',p.current_value, 'num')}>${formatSAR(p.current_value)}</td>
      <td class="num ${pnlCls}">${formatSAR(pnl, true)}</td>
      <td ${ed('real_estate',p.id,'status','text',p.status,'','status')}><span class="badge badge-${p.status}">${STATUS_LBL[p.status]||p.status}</span></td>
      <td ${ed('real_estate',p.id,'monthly_rental','number',p.monthly_rental||0,'num')} class="${p.status==='rented'?'text-success':''}">${p.status==='rented'?formatSAR(p.monthly_rental):'—'}</td>
      <td ${ed('real_estate',p.id,'purchase_date','date',p.purchase_date||'')}>${p.purchase_date ? formatDate(p.purchase_date) : '—'}</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="openModal('${esc(p.id)}')">تعديل</button>
          <button class="btn btn-danger btn-sm"    onclick="deleteProp('${esc(p.id)}')">حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  enableInlineEditing(tbody, onReSaved);
}

async function onReSaved(id, field, val) {
  const p = properties.find(x => x.id === id);
  if (p) p[field] = val;
  renderStats();
  renderTable();
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
  const name           = document.getElementById('m-name').value.trim();
  const purchase_value = +document.getElementById('m-purchase-val').value || 0;

  const type = document.getElementById('m-type').value;
  if (!name)               { showToast('أدخل اسم العقار', 'error'); return; }
  if (!type)               { showToast('اختر نوع العقار', 'error'); return; }
  if (purchase_value <= 0) { showToast('قيمة الشراء يجب أن تكون أكبر من صفر', 'error'); return; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id:        user.id,
    name,
    type,
    purchase_value,
    current_value:  +document.getElementById('m-current-val').value  || 0,
    status:         document.getElementById('m-status').value,
    monthly_rental: +document.getElementById('m-rental').value       || 0,
    purchase_date:  document.getElementById('m-purchase-date').value || null
  };
  let error;
  if (editingId) ({ error } = await supabaseClient.from('real_estate').update(payload).eq('id', editingId));
  else           ({ error } = await supabaseClient.from('real_estate').insert([payload]));
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editingId ? 'تم التحديث' : 'تمت الإضافة', 'success');
  closeModal();
  await loadProperties();
  renderStats();
  renderTable();
}

async function deleteProp(id) {
  if (!confirm('سيتم أرشفة هذا العقار (لن يُحذف نهائياً — يمكن استعادته من الأرشيف)')) return;
  const { error } = await supabaseClient.from('real_estate')
    .update({ is_active: false, archived_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تمت الأرشفة ✓', 'success');
  await loadProperties();
  renderStats();
  renderTable();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportRealEstateCSV() {
  if (!properties.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  exportCSV(`عقارات_${todayISO()}.csv`,
    ['الاسم', 'النوع', 'الحالة', 'تكلفة الشراء', 'القيمة الحالية', 'ر/خ', 'الإيجار الشهري', 'تاريخ الشراء'],
    properties.map(p => [
      p.name, p.type, STATUS_LBL[p.status] || p.status,
      p.purchase_value, p.current_value,
      (+p.current_value - +p.purchase_value).toFixed(2),
      p.monthly_rental || 0, p.purchase_date || ''
    ])
  );
  showToast(`✓ تم تصدير ${properties.length} عقار`, 'success');
}

init();
