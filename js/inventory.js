// ─── Storage ──────────────────────────────────────────────────────────────────
const INV_KEY = 'inventory_v1';

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'inventory': {
    title: '📦 مخزون المنزل',
    body: `
      <p>جرد لمحتويات منزلك ومستودعك بقيمتها التقديرية — مفيد للتأمين، وعند البيع/الانتقال، ولمعرفة قيمة ممتلكاتك ضمن أصولك.</p>
      <p class="info-note">💡 القيمة الإجمالية هنا يمكن إضافتها يدوياً كأصل في صفحة «صافي الثروة» لاكتمال صورة ثروتك. صوّر الفواتير المهمة واحتفظ بها.</p>`
  },
};
// ── تخزين سحابي متزامن عبر الأجهزة (user_settings) + cache محلي ──
function loadItemsLocal() {
  try {
    const raw = localStorage.getItem(userLsKey(INV_KEY)) || localStorage.getItem(INV_KEY);
    return JSON.parse(raw) || [];
  } catch { return []; }
}

async function loadItemsRemote() {
  const remote = await loadUserSetting(INV_KEY);
  if (Array.isArray(remote)) {
    items = remote;
    try { localStorage.setItem(userLsKey(INV_KEY), JSON.stringify(items)); } catch {}
    return;
  }
  // أول مرة على السحابة → رحّل مخزون هذا الجهاز (إن وُجد) لتظهر على بقية أجهزتك
  items = loadItemsLocal();
  if (items.length) await saveUserSetting(INV_KEY, items);
}

function saveItems(list) {
  try { localStorage.setItem(userLsKey(INV_KEY), JSON.stringify(list)); } catch {}
  saveUserSetting(INV_KEY, list).catch(() => {});   // مزامنة سحابية عبر الأجهزة
}

let items = [];
let editingId = null, deletingId = null;

const COND_CLASS = {
  'جيد':        'cond-good',
  'مستعمل':     'cond-worn',
  'متضرر':      'cond-damaged',
  'للاستبدال':  'cond-replace',
  'مفقود':      'cond-missing'
};

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;
  await loadItemsRemote();           // ← تحميل من السحابة قبل العرض (يزامن الجوال واللابتوب)
  buildFilters();
  renderDash();
  renderTable();
});

// ─── Filters ──────────────────────────────────────────────────────────────────
function buildFilters() {
  const cats = [...new Set(items.map(i => i.cat).filter(Boolean))];
  const locs = [...new Set(items.map(i => i.loc).filter(Boolean))];
  fillSelect('flt-cat', cats, document.getElementById('flt-cat').value);
  fillSelect('flt-loc', locs, document.getElementById('flt-loc').value);
}
function fillSelect(id, values, current) {
  const sel = document.getElementById(id);
  const first = sel.options[0].outerHTML;
  sel.innerHTML = first;
  values.forEach(v => {
    const op = document.createElement('option');
    op.value = op.textContent = v;
    if (v === current) op.selected = true;
    sel.appendChild(op);
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDash() {
  const total    = items.length;
  const good     = items.filter(i => i.cond === 'جيد').length;
  const replace  = items.filter(i => i.cond === 'للاستبدال').length;
  const missing  = items.filter(i => i.cond === 'مفقود').length;
  const totalVal = items.reduce((s,i) => s + ((+i.value||0) * (+i.qty||1)), 0);

  document.getElementById('inv-dash').innerHTML = `
    <div class="inv-card"><div class="lbl">إجمالي العناصر</div><div class="val">${total}</div></div>
    <div class="inv-card" style="border-color:var(--success)"><div class="lbl">حالة جيدة</div><div class="val" style="color:#4ade80">${good}</div></div>
    <div class="inv-card" style="border-color:#a855f7"><div class="lbl">للاستبدال</div><div class="val" style="color:#c084fc">${replace}</div></div>
    <div class="inv-card" style="border-color:var(--danger)"><div class="lbl">مفقودة</div><div class="val" style="color:#f87171">${missing}</div></div>
    <div class="inv-card" style="border-color:var(--accent)"><div class="lbl">القيمة الإجمالية</div><div class="val" style="font-size:1rem">${formatSAR(totalVal)}</div></div>`;
}

// ─── Table ────────────────────────────────────────────────────────────────────
function getFiltered() {
  const cat  = document.getElementById('flt-cat').value;
  const loc  = document.getElementById('flt-loc').value;
  const cond = document.getElementById('flt-cond').value;
  const q    = (document.getElementById('flt-q').value || '').trim().toLowerCase();
  return items.filter(i => {
    if (cat  && i.cat  !== cat)  return false;
    if (loc  && i.loc  !== loc)  return false;
    if (cond && i.cond !== cond) return false;
    if (q && !(i.name||'').toLowerCase().includes(q) && !(i.notes||'').toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderTable() {
  const list = getFiltered();
  const tbody = document.getElementById('inv-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="big">📦</div>لا توجد عناصر — أضف أول عنصر!</div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(i => {
    const condC = COND_CLASS[i.cond] || 'cond-good';
    const val   = i.value ? formatSAR((+i.value) * (+i.qty||1)) : '—';
    const note  = i.notes && i.notes.trim()
      ? `<button class="notes-badge" data-note="${esc(i.notes)}" onclick="showNotePopup(this)" title="ملاحظات">💬</button>` : '';
    return `<tr>
      <td style="font-weight:600">${esc(i.name)}</td>
      <td><span class="loc-badge">${esc(i.cat||'—')}</span></td>
      <td><span class="loc-badge">${esc(i.loc||'—')}</span></td>
      <td><span class="cond-badge ${condC}">${esc(i.cond)}</span></td>
      <td style="text-align:center"><span class="qty-num ${(+i.qty||1) === 0 ? 'qty-low':''}">${+i.qty||1}</span></td>
      <td class="num">${val}</td>
      <td style="text-align:center">${note}</td>
      <td class="actions-cell">
        <button class="btn-icon" onclick="openEditModal('${i.id}')" title="تعديل">✏️</button>
        <button class="btn-icon danger" onclick="openDelModal('${i.id}')" title="حذف">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'إضافة عنصر';
  document.getElementById('i-name').value  = '';
  document.getElementById('i-cat').value   = 'أجهزة كهربائية';
  document.getElementById('i-loc').value   = 'صالة';
  document.getElementById('i-cond').value  = 'جيد';
  document.getElementById('i-qty').value   = '1';
  document.getElementById('i-value').value = '';
  document.getElementById('i-notes').value = '';
  document.getElementById('item-modal').classList.add('open');
  document.getElementById('i-name').focus();
}

function openEditModal(id) {
  const i = items.find(x => x.id === id);
  if (!i) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'تعديل العنصر';
  document.getElementById('i-name').value  = i.name  || '';
  document.getElementById('i-cat').value   = i.cat   || 'أجهزة كهربائية';
  document.getElementById('i-loc').value   = i.loc   || 'صالة';
  document.getElementById('i-cond').value  = i.cond  || 'جيد';
  document.getElementById('i-qty').value   = i.qty   || '1';
  document.getElementById('i-value').value = i.value || '';
  document.getElementById('i-notes').value = i.notes || '';
  document.getElementById('item-modal').classList.add('open');
}

function closeModal() { document.getElementById('item-modal').classList.remove('open'); }

function saveItem() {
  const name = document.getElementById('i-name').value.trim();
  if (!name) { showToast('أدخل اسم العنصر', 'error'); return; }
  const obj = {
    name,
    cat:   document.getElementById('i-cat').value,
    loc:   document.getElementById('i-loc').value,
    cond:  document.getElementById('i-cond').value,
    qty:   parseInt(document.getElementById('i-qty').value) || 1,
    value: parseFloat(document.getElementById('i-value').value) || 0,
    notes: document.getElementById('i-notes').value.trim()
  };
  if (editingId) {
    const idx = items.findIndex(x => x.id === editingId);
    items[idx] = { ...items[idx], ...obj };
    showToast('تم التحديث ✓', 'success');
  } else {
    items.push({ id: uid(), ...obj });
    showToast('تمت الإضافة ✓', 'success');
  }
  saveItems(items);
  closeModal();
  buildFilters();
  renderDash();
  renderTable();
}

// ─── Delete ───────────────────────────────────────────────────────────────────
function openDelModal(id)  { deletingId = id; document.getElementById('del-modal').classList.add('open'); }
function closeDelModal()   { document.getElementById('del-modal').classList.remove('open'); deletingId = null; }
function confirmDelete() {
  if (!deletingId) return;
  items = items.filter(i => i.id !== deletingId);
  saveItems(items);
  closeDelModal();
  buildFilters();
  renderDash();
  renderTable();
  showToast('تم الحذف', 'success');
}

document.addEventListener('click', e => {
  if (e.target.id === 'item-modal') closeModal();
  if (e.target.id === 'del-modal')  closeDelModal();
});
