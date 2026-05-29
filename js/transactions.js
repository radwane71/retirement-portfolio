let transactions = [];
let stagingRows  = [];
let _stagingId   = 0;
let sortField    = 'date';
let sortDir      = 'desc';
let _editId      = null;

// ── Init ──────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-transactions');
  setupSingleForm();
  addStagingRow();
  await loadTransactions();
  renderTable();
}

// ── Single-entry form ──────────────────────────────────────────
function setupSingleForm() {
  document.getElementById('t-date').value = todayISO();
  ['t-shares', 't-price'].forEach(id => document.getElementById(id).addEventListener('input', updateSingleCalc));
  document.getElementById('t-type').addEventListener('change', updateSingleCalc);
  document.getElementById('t-ticker').addEventListener('input', onSingleTickerInput);
}

function onSingleTickerInput() {
  const ticker = document.getElementById('t-ticker').value.trim().toUpperCase();
  document.getElementById('t-ticker').value = ticker;
  const official = (typeof lookupTicker === 'function') ? lookupTicker(ticker) : null;
  const name = official?.name || TICKER_DB[ticker];
  if (name) document.getElementById('t-name').value = name;
  hideTickerWarning();
}

function showTickerWarning() {
  const el = document.getElementById('ticker-warning');
  if (el) el.style.display = 'flex';
}

function hideTickerWarning() {
  const el = document.getElementById('ticker-warning');
  if (el) el.style.display = 'none';
}

function updateSingleCalc() {
  const shares = +document.getElementById('t-shares').value;
  const price  = +document.getElementById('t-price').value;
  const type   = document.getElementById('t-type').value;
  if (!shares || !price) {
    ['t-commission','t-vat','t-total'].forEach(id => document.getElementById(id).value = '');
    return;
  }
  const c = type === 'grant'
    ? { commission: 0, vat: 0, totalBuy: shares * price, totalSell: shares * price }
    : calcCommission(shares, price);
  document.getElementById('t-commission').value = c.commission.toFixed(4);
  document.getElementById('t-vat').value         = c.vat.toFixed(4);
  document.getElementById('t-total').value       = (type === 'sell' ? c.totalSell : c.totalBuy).toFixed(4);
}

async function addSingleTransaction(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const shares = +document.getElementById('t-shares').value;
  const price  = +document.getElementById('t-price').value;
  const type   = document.getElementById('t-type').value;
  const c = type === 'grant'
    ? { commission: 0, vat: 0, totalBuy: shares * price }
    : calcCommission(shares, price);
  const payload = {
    user_id: user.id,
    date:    document.getElementById('t-date').value,
    ticker:  document.getElementById('t-ticker').value.trim().toUpperCase(),
    name:    document.getElementById('t-name').value.trim(),
    type, shares, price,
    commission: c.commission, vat: c.vat,
    total: type === 'sell' ? c.totalSell : c.totalBuy
  };
  const { error } = await supabaseClient.from('transactions').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  await updateHolding(user.id, payload);
  showToast('تمت إضافة المعاملة', 'success');
  document.getElementById('tx-form').reset();
  document.getElementById('t-date').value = todayISO();
  await loadTransactions();
  renderTable();
  document.getElementById('tx-tbody').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Bulk staging ──────────────────────────────────────────────
function addStagingRow() {
  const id = ++_stagingId;
  stagingRows.push({ _id: id, date: todayISO(), ticker: '', name: '', type: 'buy', shares: '', price: '', commission: 0, vat: 0, total: 0 });
  renderStaging();
  setTimeout(() => { const inp = document.querySelector(`tr[data-sid="${id}"] .s-ticker`); if (inp) inp.focus(); }, 50);
}

function removeStaging(id) {
  stagingRows = stagingRows.filter(r => r._id !== id);
  renderStaging();
}

function clearStaging() {
  stagingRows = [];
  _stagingId  = 0;
  addStagingRow();
}

function updateStaging(id, field, value) {
  const r = stagingRows.find(x => x._id === id);
  if (!r) return;
  r[field] = value;
  if (['shares', 'price', 'type'].includes(field)) recalcStaging(r);
  const tr = document.querySelector(`tr[data-sid="${id}"]`);
  if (tr) {
    tr.querySelector('.s-comm').textContent  = r.commission ? formatNum(r.commission, 2) : '—';
    const totalEl = tr.querySelector('.s-total');
    if (totalEl) {
      totalEl.textContent = r.total ? formatNum(r.total, 2) : '—';
      totalEl.className   = 's-total num bold ' + (r.type === 'sell' ? 'text-success' : 'text-accent');
    }
  }
}

function stagingTickerInput(id, input) {
  const ticker = input.value.trim().toUpperCase();
  input.value  = ticker;
  updateStaging(id, 'ticker', ticker);
  const official = (typeof lookupTicker === 'function') ? lookupTicker(ticker) : null;
  const name = official?.name || TICKER_DB[ticker];
  if (name) {
    const tr = document.querySelector(`tr[data-sid="${id}"]`);
    if (tr) {
      const nameInput = tr.querySelector('.s-name');
      if (nameInput && !nameInput.value) { nameInput.value = name; updateStaging(id, 'name', name); }
    }
  }
}

function recalcStaging(r) {
  const sh = parseFloat(r.shares), pr = parseFloat(r.price);
  if (sh > 0 && pr > 0) {
    if (r.type === 'grant') {
      r.commission = 0; r.vat = 0; r.total = sh * pr;
    } else {
      const c = calcCommission(sh, pr);
      r.commission = c.commission; r.vat = c.vat;
      r.total = r.type === 'sell' ? c.totalSell : c.totalBuy;
    }
  } else {
    r.commission = r.vat = r.total = 0;
  }
}

function renderStaging() {
  const n = stagingRows.length;
  const saveBtn = document.getElementById('btn-save-all');
  if (saveBtn) saveBtn.textContent = `إضافة معاملات (${n})`;

  const wrap = document.getElementById('staging-body');
  if (!wrap) return;
  if (!n) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = stagingRows.map((r, i) => `
    <tr data-sid="${r._id}">
      <td class="text-muted small">${i + 1}</td>
      <td><input class="inline-input s-date"   type="date"   value="${r.date}"   oninput="updateStaging(${r._id},'date',this.value)"></td>
      <td><input class="inline-input s-ticker" type="text"   value="${esc(r.ticker)}" placeholder="رمز"   oninput="stagingTickerInput(${r._id},this)" style="min-width:60px"></td>
      <td><input class="inline-input s-name"   type="text"   value="${esc(r.name)}"   placeholder="الاسم" oninput="updateStaging(${r._id},'name',this.value)"   style="min-width:110px"></td>
      <td>
        <select class="inline-input" onchange="updateStaging(${r._id},'type',this.value)">
          <option value="buy"   ${r.type==='buy'  ?'selected':''}>شراء</option>
          <option value="sell"  ${r.type==='sell' ?'selected':''}>بيع</option>
          <option value="grant" ${r.type==='grant'?'selected':''}>أسهم منحة</option>
        </select>
      </td>
      <td><input class="inline-input" type="number" step="any" value="${r.shares||''}" placeholder="0"    oninput="updateStaging(${r._id},'shares',this.value)" style="min-width:70px"></td>
      <td><input class="inline-input" type="number" step="any" value="${r.price||''}"  placeholder="0.00" oninput="updateStaging(${r._id},'price',this.value)"  style="min-width:80px"></td>
      <td class="s-comm num text-muted">${r.commission ? formatNum(r.commission,2) : '—'}</td>
      <td class="s-total num bold ${r.type==='sell'?'text-success':'text-accent'}">${r.total ? formatNum(r.total,2) : '—'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="removeStaging(${r._id})">✕</button></td>
    </tr>`).join('');
}

async function saveAllStaging() {
  const invalid = stagingRows.filter(r => !r.date || !r.ticker.trim() || !r.name.trim() || !+r.shares || (r.type !== 'grant' && !+r.price));
  if (invalid.length) { showToast(`${invalid.length} صف بحقول ناقصة`, 'error'); return; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  const btn = document.getElementById('btn-save-all');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; }

  let saved = 0;
  for (const r of stagingRows) {
    recalcStaging(r);
    const payload = {
      user_id: user.id,
      date: r.date, ticker: r.ticker.toUpperCase(), name: r.name, type: r.type,
      shares: +r.shares, price: +r.price,
      commission: r.commission, vat: r.vat, total: r.total
    };
    const { error } = await supabaseClient.from('transactions').insert([payload]);
    if (!error) { await updateHolding(user.id, payload); saved++; }
  }

  if (btn) btn.disabled = false;
  showToast(`تم إضافة ${saved} من ${stagingRows.length} معاملة`, saved === stagingRows.length ? 'success' : 'error');

  if (saved > 0) {
    stagingRows = [];
    _stagingId  = 0;
    addStagingRow();
    await loadTransactions();
    renderTable();
    document.getElementById('tx-tbody').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ── DB helpers ────────────────────────────────────────────────
async function loadTransactions() {
  const { data, error } = await supabaseClient.from('transactions').select('*').order('date', { ascending: false });
  if (error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  transactions = data || [];
}

async function updateHolding(userId, tx) {
  const { data: existing } = await supabaseClient
    .from('holdings').select('*').eq('user_id', userId).eq('ticker', tx.ticker).maybeSingle();

  if (tx.type === 'buy' || tx.type === 'grant') {
    if (existing) {
      const newShares   = existing.shares + tx.shares;
      const newAvgPrice = tx.type === 'grant'
        ? existing.avg_price  // منحة لا تغير متوسط التكلفة
        : (existing.shares * existing.avg_price + tx.shares * tx.price) / newShares;
      await supabaseClient.from('holdings').update({ shares: newShares, avg_price: +newAvgPrice.toFixed(4) }).eq('id', existing.id);
    } else {
      await supabaseClient.from('holdings').insert([{
        user_id: userId, ticker: tx.ticker, name: tx.name, sector: '',
        shares: tx.shares, avg_price: tx.type === 'grant' ? 0 : tx.price,
        current_price: tx.price, target_weight: 0
      }]);
    }
  } else if (tx.type === 'sell' && existing) {
    const newShares = Math.max(0, existing.shares - tx.shares);
    if (newShares === 0) await supabaseClient.from('holdings').delete().eq('id', existing.id);
    else                 await supabaseClient.from('holdings').update({ shares: newShares }).eq('id', existing.id);
  }
}

async function reverseHolding(userId, tx) {
  const { data: existing } = await supabaseClient
    .from('holdings').select('*').eq('user_id', userId).eq('ticker', tx.ticker).maybeSingle();

  if (tx.type === 'buy' || tx.type === 'grant') {
    if (!existing) return;
    const newShares = Math.max(0, existing.shares - tx.shares);
    if (newShares === 0) await supabaseClient.from('holdings').delete().eq('id', existing.id);
    else                 await supabaseClient.from('holdings').update({ shares: newShares }).eq('id', existing.id);
  } else if (tx.type === 'sell') {
    if (existing) {
      await supabaseClient.from('holdings').update({ shares: existing.shares + tx.shares }).eq('id', existing.id);
    } else {
      await supabaseClient.from('holdings').insert([{
        user_id: userId, ticker: tx.ticker, name: tx.name, sector: '',
        shares: tx.shares, avg_price: tx.price, current_price: tx.price, target_weight: 0
      }]);
    }
  }
}

// ── Sort ──────────────────────────────────────────────────────
function sortTable(field) {
  if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortField = field; sortDir = 'asc'; }
  renderTable();
}

function getSorted() {
  const numFields = new Set(['shares','price','commission','vat','total']);
  return [...transactions].sort((a, b) => {
    let av = a[sortField], bv = b[sortField];
    if (sortField === 'date') { av = new Date(av); bv = new Date(bv); }
    else if (numFields.has(sortField)) { av = +av; bv = +bv; }
    else { av = String(av||'').toLowerCase(); bv = String(bv||'').toLowerCase(); }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
}

function sortArrow(field) {
  if (sortField !== field) return '<span class="sort-arrow">↕</span>';
  return `<span class="sort-arrow active">${sortDir === 'asc' ? '↑' : '↓'}</span>`;
}

// ── Render transaction log ────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('tx-tbody');
  if (!tbody) return;

  if (!transactions.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div class="icon">💹</div><p>لا توجد معاملات بعد</p></div></td></tr>`;
    enableInlineEditing(tbody, onTxSaved);
    return;
  }

  const typeLabel = { buy: 'شراء', sell: 'بيع', grant: 'منحة' };
  const sorted = getSorted();

  tbody.innerHTML = sorted.map(t => {
    const isSell   = t.type === 'sell';
    const totalCls = isSell ? 'text-success' : 'text-accent';
    return `<tr>
      <td ${ed('transactions',t.id,'date','date',t.date)}>${formatDate(t.date)}</td>
      <td ${ed('transactions',t.id,'ticker','text',t.ticker,'text-accent bold')}>${esc(t.ticker)}</td>
      <td ${ed('transactions',t.id,'name','text',t.name)}>${esc(t.name)}</td>
      <td ${ed('transactions',t.id,'type','text',t.type,'','txtype')}><span class="badge badge-${t.type}">${typeLabel[t.type]||t.type}</span></td>
      <td ${ed('transactions',t.id,'shares','number',t.shares,'num')}>${formatNum(t.shares,4)}</td>
      <td ${ed('transactions',t.id,'price','number',t.price,'num')}>${formatSAR(t.price)}</td>
      <td class="num text-muted">${formatSAR(t.commission)}</td>
      <td class="num text-muted">${formatSAR(t.vat)}</td>
      <td class="num bold ${totalCls}">${formatSAR(t.total)}</td>
      <td>
        <div class="flex gap-1">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${esc(t.id)}')">تعديل</button>
          <button class="btn btn-danger btn-sm"    onclick="deleteTx('${esc(t.id)}')">حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Update sort indicators
  ['date','ticker','name','type','shares','price','commission','vat','total'].forEach(f => {
    const th = document.getElementById('th-' + f);
    if (th) th.querySelector('.sort-arrow').outerHTML = sortArrow(f);
  });

  enableInlineEditing(tbody, onTxSaved);
}

function ed(table, rowId, field, type, raw, extraCls = '', selectKey = '') {
  return `class="editable${type==='number'?' num':''}${extraCls?' '+extraCls:''}" ` +
    `data-table="${table}" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"` +
    (selectKey ? ` data-select="${selectKey}"` : '');
}

async function onTxSaved(id, field, newVal) {
  const row = transactions.find(t => t.id === id);
  if (!row) { await loadTransactions(); renderTable(); return; }
  row[field] = newVal;
  if (['shares', 'price', 'type'].includes(field)) {
    const isGrant = row.type === 'grant';
    const c     = isGrant ? { commission: 0, vat: 0 } : calcCommission(row.shares, row.price);
    const total = isGrant ? row.shares * row.price
                          : (row.type === 'sell' ? c.totalSell : c.totalBuy);
    await supabaseClient.from('transactions').update({ commission: c.commission, vat: c.vat, total }).eq('id', id);
    row.commission = c.commission; row.vat = c.vat; row.total = total;
  }
  renderTable();
}

async function deleteTx(id) {
  if (!confirm('هل أنت متأكد من حذف هذه المعاملة؟')) return;
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  await reverseHolding(user.id, tx);
  showToast('تم الحذف وتحديث المحفظة', 'success');
  await loadTransactions();
  renderTable();
}

// ── Edit Modal ────────────────────────────────────────────────
function openEditModal(id) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;
  _editId = id;

  document.getElementById('edit-date').value   = t.date || '';
  document.getElementById('edit-ticker').value = t.ticker || '';
  document.getElementById('edit-name').value   = t.name || '';
  document.getElementById('edit-type').value   = t.type || 'buy';
  document.getElementById('edit-shares').value = t.shares || '';
  document.getElementById('edit-price').value  = t.price || '';
  updateEditCalc();
  document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal(e) {
  if (e && e.target !== document.getElementById('edit-modal')) return;
  document.getElementById('edit-modal').style.display = 'none';
  _editId = null;
}

function onEditTickerInput() {
  const ticker = document.getElementById('edit-ticker').value.trim().toUpperCase();
  document.getElementById('edit-ticker').value = ticker;
  const official = (typeof lookupTicker === 'function') ? lookupTicker(ticker) : null;
  const name = official?.name || TICKER_DB[ticker];
  if (name) document.getElementById('edit-name').value = name;
}

function updateEditCalc() {
  const shares = +document.getElementById('edit-shares').value;
  const price  = +document.getElementById('edit-price').value;
  const type   = document.getElementById('edit-type').value;
  if (!shares || !price) {
    ['edit-commission','edit-vat','edit-total'].forEach(id => document.getElementById(id).value = '');
    return;
  }
  const c = type === 'grant'
    ? { commission: 0, vat: 0, totalBuy: shares * price, totalSell: shares * price }
    : calcCommission(shares, price);
  document.getElementById('edit-commission').value = c.commission.toFixed(4);
  document.getElementById('edit-vat').value         = c.vat.toFixed(4);
  document.getElementById('edit-total').value       = (type === 'sell' ? c.totalSell : c.totalBuy).toFixed(4);
}

async function saveEditModal() {
  if (!_editId) return;
  const shares = +document.getElementById('edit-shares').value;
  const price  = +document.getElementById('edit-price').value;
  const type   = document.getElementById('edit-type').value;
  const ticker = document.getElementById('edit-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('edit-name').value.trim();
  const date   = document.getElementById('edit-date').value;

  if (!date || !ticker || !name || !shares) {
    showToast('جميع الحقول مطلوبة', 'error'); return;
  }

  const c = type === 'grant'
    ? { commission: 0, vat: 0, totalBuy: shares * price, totalSell: shares * price }
    : calcCommission(shares, price);
  const total = type === 'sell' ? c.totalSell : c.totalBuy;

  const { error } = await supabaseClient.from('transactions').update({
    date, ticker, name, type, shares, price,
    commission: c.commission, vat: c.vat, total
  }).eq('id', _editId);

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }

  showToast('تم حفظ التعديلات ✓', 'success');
  document.getElementById('edit-modal').style.display = 'none';
  _editId = null;
  await loadTransactions();
  renderTable();
}

init();
