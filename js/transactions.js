let transactions = [];
let stagingRows  = [];
let _stagingId   = 0;

// ── Init ──────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-transactions');
  setupSingleForm();
  addStagingRow();          // start with one blank row
  await loadTransactions();
  renderTable();
}

// ── Single-entry form (quick add, still useful for one-off) ───
function setupSingleForm() {
  document.getElementById('t-date').value = todayISO();
  ['t-shares', 't-price'].forEach(id => document.getElementById(id).addEventListener('input', updateSingleCalc));
  document.getElementById('t-type').addEventListener('change', updateSingleCalc);
}

function updateSingleCalc() {
  const shares = +document.getElementById('t-shares').value;
  const price  = +document.getElementById('t-price').value;
  const type   = document.getElementById('t-type').value;
  if (!shares || !price) {
    ['t-commission','t-vat','t-total'].forEach(id => document.getElementById(id).value = '');
    return;
  }
  const c = calcCommission(shares, price);
  document.getElementById('t-commission').value = c.commission.toFixed(4);
  document.getElementById('t-vat').value         = c.vat.toFixed(4);
  document.getElementById('t-total').value       = (type === 'buy' ? c.totalBuy : c.totalSell).toFixed(4);
}

async function addSingleTransaction(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const shares = +document.getElementById('t-shares').value;
  const price  = +document.getElementById('t-price').value;
  const type   = document.getElementById('t-type').value;
  const c      = calcCommission(shares, price);
  const payload = {
    user_id:    user.id,
    date:       document.getElementById('t-date').value,
    ticker:     document.getElementById('t-ticker').value.trim().toUpperCase(),
    name:       document.getElementById('t-name').value.trim(),
    type, shares, price,
    commission: c.commission, vat: c.vat,
    total: type === 'buy' ? c.totalBuy : c.totalSell
  };
  const { error } = await supabaseClient.from('transactions').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  await updateHolding(user.id, payload);
  showToast('تمت إضافة المعاملة', 'success');
  document.getElementById('tx-form').reset();
  document.getElementById('t-date').value = todayISO();
  await loadTransactions();
  renderTable();
}

// ── Bulk staging ──────────────────────────────────────────────
function addStagingRow() {
  const id = ++_stagingId;
  stagingRows.push({ _id: id, date: todayISO(), ticker: '', name: '', type: 'buy', shares: '', price: '', commission: 0, vat: 0, total: 0 });
  renderStaging();
  // Focus ticker of new row after render
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
  // Update calculated display cells without full re-render (preserves focus)
  const tr = document.querySelector(`tr[data-sid="${id}"]`);
  if (tr) {
    tr.querySelector('.s-comm').textContent  = r.commission ? formatNum(r.commission, 2) : '—';
    const totalEl = tr.querySelector('.s-total');
    if (totalEl) {
      totalEl.textContent = r.total ? formatNum(r.total, 2) : '—';
      totalEl.className   = 's-total num bold ' + (r.type === 'buy' ? 'text-danger' : 'text-success');
    }
  }
}

function recalcStaging(r) {
  const sh = parseFloat(r.shares), pr = parseFloat(r.price);
  if (sh > 0 && pr > 0) {
    const c      = calcCommission(sh, pr);
    r.commission = c.commission;
    r.vat        = c.vat;
    r.total      = r.type === 'buy' ? c.totalBuy : c.totalSell;
  } else {
    r.commission = r.vat = r.total = 0;
  }
}

function renderStaging() {
  const n = stagingRows.length;
  const saveBtn = document.getElementById('btn-save-all');
  if (saveBtn) saveBtn.textContent = `حفظ الكل (${n})`;

  const wrap = document.getElementById('staging-body');
  if (!wrap) return;

  if (!n) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = stagingRows.map((r, i) => `
    <tr data-sid="${r._id}">
      <td class="text-muted small">${i + 1}</td>
      <td><input class="inline-input s-date"   type="date"   value="${r.date}"   oninput="updateStaging(${r._id},'date',this.value)"></td>
      <td><input class="inline-input s-ticker" type="text"   value="${esc(r.ticker)}" placeholder="رمز"   oninput="updateStaging(${r._id},'ticker',this.value.toUpperCase())" style="min-width:60px"></td>
      <td><input class="inline-input s-name"   type="text"   value="${esc(r.name)}"   placeholder="الاسم" oninput="updateStaging(${r._id},'name',this.value)"   style="min-width:110px"></td>
      <td>
        <select class="inline-input" onchange="updateStaging(${r._id},'type',this.value)">
          <option value="buy"  ${r.type==='buy' ?'selected':''}>شراء</option>
          <option value="sell" ${r.type==='sell'?'selected':''}>بيع</option>
        </select>
      </td>
      <td><input class="inline-input" type="number" step="any" value="${r.shares||''}" placeholder="0"    oninput="updateStaging(${r._id},'shares',this.value)" style="min-width:70px"></td>
      <td><input class="inline-input" type="number" step="any" value="${r.price||''}"  placeholder="0.00" oninput="updateStaging(${r._id},'price',this.value)"  style="min-width:80px"></td>
      <td class="s-comm num text-muted">${r.commission ? formatNum(r.commission,2) : '—'}</td>
      <td class="s-total num bold ${r.type==='buy'?'text-danger':'text-success'}">${r.total ? formatNum(r.total,2) : '—'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="removeStaging(${r._id})">✕</button></td>
    </tr>`).join('');
}

async function saveAllStaging() {
  const invalid = stagingRows.filter(r => !r.date || !r.ticker.trim() || !r.name.trim() || !+r.shares || !+r.price);
  if (invalid.length) { showToast(`${invalid.length} صف بحقول ناقصة — تأكد من التاريخ، الرمز، الاسم، الأسهم، السعر`, 'error'); return; }

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
  showToast(`تم حفظ ${saved} من ${stagingRows.length} معاملة`, saved === stagingRows.length ? 'success' : 'error');

  if (saved > 0) {
    stagingRows = [];
    _stagingId  = 0;
    addStagingRow();
  }
  await loadTransactions();
  renderTable();
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

  if (tx.type === 'buy') {
    if (existing) {
      const newShares   = existing.shares + tx.shares;
      const newAvgPrice = (existing.shares * existing.avg_price + tx.shares * tx.price) / newShares;
      await supabaseClient.from('holdings').update({ shares: newShares, avg_price: +newAvgPrice.toFixed(4) }).eq('id', existing.id);
    } else {
      await supabaseClient.from('holdings').insert([{ user_id: userId, ticker: tx.ticker, name: tx.name, sector: '', shares: tx.shares, avg_price: tx.price, current_price: tx.price, target_weight: 0 }]);
    }
  } else if (existing) {
    const newShares = Math.max(0, existing.shares - tx.shares);
    if (newShares === 0) await supabaseClient.from('holdings').delete().eq('id', existing.id);
    else                 await supabaseClient.from('holdings').update({ shares: newShares }).eq('id', existing.id);
  }
}

// ── Render transaction log with inline editing ────────────────
function renderTable() {
  const tbody = document.getElementById('tx-tbody');
  if (!tbody) return;

  if (!transactions.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="icon">💹</div><p>لا توجد معاملات بعد</p></div></td></tr>`;
    enableInlineEditing(tbody, onTxSaved);
    return;
  }

  tbody.innerHTML = transactions.map(t => {
    const isBuy = t.type === 'buy';
    return `<tr>
      <td ${ed('transactions',t.id,'date','date',t.date)}>${formatDate(t.date)}</td>
      <td ${ed('transactions',t.id,'ticker','text',t.ticker,'text-accent bold')}>${esc(t.ticker)}</td>
      <td ${ed('transactions',t.id,'name','text',t.name)}>${esc(t.name)}</td>
      <td ${ed('transactions',t.id,'type','text',t.type,'','txtype')}><span class="badge badge-${t.type}">${isBuy?'شراء':'بيع'}</span></td>
      <td ${ed('transactions',t.id,'shares','number',t.shares,'num')}>${formatNum(t.shares,4)}</td>
      <td ${ed('transactions',t.id,'price','number',t.price,'num')}>${formatSAR(t.price)}</td>
      <td class="num text-muted">${formatSAR(t.commission)}</td>
      <td class="num text-muted">${formatSAR(t.vat)}</td>
      <td class="num bold ${isBuy?'text-danger':'text-success'}">${formatSAR(t.total)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteTx('${esc(t.id)}')">حذف</button></td>
    </tr>`;
  }).join('');

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

  // Recalculate commission/vat/total when key fields change
  if (['shares', 'price', 'type'].includes(field)) {
    const c     = calcCommission(row.shares, row.price);
    const total = row.type === 'buy' ? c.totalBuy : c.totalSell;
    await supabaseClient.from('transactions').update({ commission: c.commission, vat: c.vat, total }).eq('id', id);
    row.commission = c.commission; row.vat = c.vat; row.total = total;
  }
  renderTable();
}

async function deleteTx(id) {
  if (!confirm('هل أنت متأكد من حذف هذه المعاملة؟')) return;
  const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await loadTransactions();
  renderTable();
}

init();
