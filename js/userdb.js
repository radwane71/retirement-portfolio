let userStocks   = [];
let holdings     = [];
let _conflictPending = null;   // {ticker, name, sector} من النموذج عند التعارض

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-userdb');
  populateSectorDropdown();
  await loadAll();
}

function populateSectorDropdown() {
  const sel = document.getElementById('s-sector');
  OFFICIAL_SECTORS.forEach(s => {
    const o = document.createElement('option');
    o.value = s; o.textContent = s;
    sel.appendChild(o);
  });
}

async function loadAll() {
  const [us, hs] = await Promise.all([
    supabaseClient.from('user_stocks').select('*').order('ticker'),
    supabaseClient.from('holdings').select('ticker')
  ]);
  userStocks = us.data || [];
  holdings   = (hs.data || []).map(h => h.ticker);
  renderTable();
}

function onTickerInput() {
  const ticker = document.getElementById('s-ticker').value.trim().toUpperCase();
  document.getElementById('s-ticker').value = ticker;
  document.getElementById('ticker-conflict').style.display = 'none';
  _conflictPending = null;

  const official = lookupTicker(ticker);
  if (official) {
    // ملأ الاسم والقطاع تلقائياً من البيانات الرسمية
    document.getElementById('s-name').value   = official.name;
    document.getElementById('s-sector').value = official.sector;
  }
}

async function addStock(e) {
  e.preventDefault();
  const ticker = document.getElementById('s-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('s-name').value.trim();
  const sector = document.getElementById('s-sector').value;

  if (!ticker || !name || !sector) { showToast('جميع الحقول مطلوبة', 'error'); return; }

  // فحص التعارض مع البيانات الرسمية
  const official = lookupTicker(ticker);
  if (official && official.name !== name && !_conflictPending) {
    _conflictPending = { ticker, name, sector };
    document.getElementById('ticker-conflict-msg').textContent =
      `⚠️ الرمز ${ticker} مسجل رسمياً باسم "${official.name}" (${official.sector}) — أنت أدخلت "${name}". هل تريد المتابعة ببياناتك أم استخدام البيانات الرسمية؟`;
    document.getElementById('ticker-conflict').style.display = 'flex';
    return;
  }

  await doInsert(ticker, name, sector);
}

function confirmConflict() {
  if (!_conflictPending) return;
  const { ticker, name, sector } = _conflictPending;
  _conflictPending = null;
  document.getElementById('ticker-conflict').style.display = 'none';
  doInsert(ticker, name, sector);
}

function useOfficialData() {
  if (!_conflictPending) return;
  const official = lookupTicker(_conflictPending.ticker);
  _conflictPending = null;
  document.getElementById('ticker-conflict').style.display = 'none';
  if (official) {
    document.getElementById('s-name').value   = official.name;
    document.getElementById('s-sector').value = official.sector;
  }
  showToast('تم ملء البيانات الرسمية — اضغط إضافة للتأكيد', 'info');
}

async function doInsert(ticker, name, sector) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const btn = document.getElementById('add-btn');
  btn.disabled = true; btn.textContent = 'جارٍ الإضافة…';

  const { error } = await supabaseClient.from('user_stocks').insert([{
    user_id: user.id, ticker, name, sector
  }]);

  btn.disabled = false; btn.textContent = 'إضافة السهم';

  if (error) {
    if (error.code === '23505') showToast(`الرمز ${ticker} موجود مسبقاً في قاعدتك`, 'error');
    else showToast('خطأ: ' + error.message, 'error');
    return;
  }

  showToast(`تمت إضافة ${name} ✓`, 'success');
  resetForm();
  await loadAll();
}

function resetForm() {
  document.getElementById('add-form').reset();
  document.getElementById('ticker-conflict').style.display = 'none';
  _conflictPending = null;
}

async function deleteStock(id, ticker) {
  if (!confirm(`هل تريد حذف ${ticker} من قاعدة بياناتك؟`)) return;
  const { error } = await supabaseClient.from('user_stocks').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await loadAll();
}

async function editStock(id, field, oldVal) {
  const newVal = prompt(`تعديل ${field === 'name' ? 'الاسم' : 'القطاع'}:`, oldVal);
  if (!newVal || newVal === oldVal) return;
  const { error } = await supabaseClient.from('user_stocks').update({ [field]: newVal }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم التعديل ✓', 'success');
  await loadAll();
}

function renderTable() {
  const tbody = document.getElementById('stocks-tbody');
  const countEl = document.getElementById('stocks-count');
  if (countEl) countEl.textContent = userStocks.length ? `${userStocks.length} سهم` : '';

  if (!userStocks.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">🗂️</div><p>لا توجد أسهم مسجلة بعد — أضف أول سهم من الأعلى</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = userStocks.map(s => {
    const inPortfolio = holdings.includes(s.ticker);
    return `<tr>
      <td><strong class="text-accent">${esc(s.ticker)}</strong></td>
      <td style="cursor:pointer" title="انقر للتعديل" onclick="editStock('${esc(s.id)}','name','${esc(s.name)}')">${esc(s.name)}</td>
      <td style="cursor:pointer" title="انقر للتعديل" onclick="editStockSector('${esc(s.id)}','${esc(s.sector)}')">${esc(s.sector)}</td>
      <td>${inPortfolio ? '<span class="badge badge-active">نعم</span>' : '<span class="badge badge-deleted">—</span>'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteStock('${esc(s.id)}','${esc(s.ticker)}')">حذف</button></td>
    </tr>`;
  }).join('');
}

async function editStockSector(id, currentSector) {
  // نستخدم select بدل prompt لضمان توحيد القطاعات
  const opts = OFFICIAL_SECTORS.map(s => `<option value="${s}" ${s===currentSector?'selected':''}>${s}</option>`).join('');
  const div = document.createElement('div');
  div.id = 'sector-edit-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center';
  div.innerHTML = `
    <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px;min-width:300px">
      <p style="margin-bottom:12px;font-weight:700">تعديل القطاع</p>
      <select id="sector-edit-select" style="width:100%;padding:10px;background:var(--bg-3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:inherit;margin-bottom:16px">${opts}</select>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn btn-secondary" onclick="document.getElementById('sector-edit-overlay').remove()">إلغاء</button>
        <button class="btn btn-primary" onclick="saveSectorEdit('${id}')">حفظ</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function saveSectorEdit(id) {
  const newSector = document.getElementById('sector-edit-select').value;
  document.getElementById('sector-edit-overlay').remove();
  const { error } = await supabaseClient.from('user_stocks').update({ sector: newSector }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم تعديل القطاع ✓', 'success');
  await loadAll();
}

init();
