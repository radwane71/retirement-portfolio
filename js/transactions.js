let transactions = [];
let stagingRows  = [];
let _stagingId   = 0;
let sortField    = 'date';
let sortDir      = 'desc';
let _editId      = null;
let _filterType  = 'all';   // 'all' | 'buy' | 'sell' | 'grant'

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

// يُستدعى عند الضغط على "متابعة" في تحذير الرمز غير المعروف
function confirmUnknownTicker() {
  hideTickerWarning();
  // أكمل الإرسال برمج غير رسمي — المستخدم أكد
  const form = document.getElementById('tx-form');
  if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

// يُستدعى عند الضغط على "إلغاء" في تحذير الرمز غير المعروف
function cancelUnknownTicker() {
  hideTickerWarning();
  document.getElementById('t-ticker')?.focus();
}

function onTypeChange(type) {
  const priceInput = document.getElementById('t-price');
  const priceLabel = document.getElementById('t-price-label');
  if (!priceInput) return;
  if (type === 'grant') {
    priceInput.required    = false;
    priceInput.value       = '0';
    priceInput.readOnly    = true;
    priceInput.style.opacity = '0.5';
    if (priceLabel) priceLabel.textContent = 'السعر (ر.س) — منحة مجانية';
    // صفّر الحقول الأخرى
    ['t-commission','t-vat','t-total'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '0';
    });
  } else {
    priceInput.required    = true;
    priceInput.readOnly    = false;
    priceInput.style.opacity = '';
    if (priceInput.value === '0') priceInput.value = '';
    if (priceLabel) priceLabel.textContent = 'السعر (ر.س) *';
    updateSingleCalc();
  }
}

function updateSingleCalc() {
  const shares = +document.getElementById('t-shares').value;
  const price  = +document.getElementById('t-price').value;
  const type   = document.getElementById('t-type').value;
  const isGrant = type === 'grant';
  if (!shares || (!price && !isGrant)) {
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
  const shares = +document.getElementById('t-shares').value;
  const price  = +document.getElementById('t-price').value;
  const type   = document.getElementById('t-type').value;
  const ticker = document.getElementById('t-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('t-name').value.trim();

  if (!ticker)                          { showToast('أدخل رمز السهم', 'error'); return; }
  if (!name)                            { showToast('أدخل اسم السهم', 'error'); return; }
  if (shares <= 0)                      { showToast('عدد الأسهم يجب أن يكون أكبر من صفر', 'error'); return; }
  if (type !== 'grant' && price <= 0)   { showToast('سعر السهم يجب أن يكون أكبر من صفر', 'error'); return; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  const c = type === 'grant'
    ? { commission: 0, vat: 0, totalBuy: 0, totalSell: 0 }
    : calcCommission(shares, price);
  const payload = {
    user_id: user.id,
    date:    document.getElementById('t-date').value,
    ticker:  document.getElementById('t-ticker').value.trim().toUpperCase(),
    name:    document.getElementById('t-name').value.trim(),
    type, shares, price,
    commission: c.commission, vat: c.vat,
    total: type === 'grant' ? 0 : (type === 'sell' ? c.totalSell : c.totalBuy)
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
  const sh = parseFloat(r.shares), pr = parseFloat(r.price) || 0;
  const isGrant = r.type === 'grant';
  if (sh > 0 && (pr > 0 || isGrant)) {
    if (isGrant) {
      r.commission = 0; r.vat = 0; r.total = 0;  // منحة: مجانية تماماً
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
  const failedRows = [];
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
    else { failedRows.push(r.ticker + ' (' + r.date + '): ' + error.message); }
  }

  if (btn) btn.disabled = false;
  if (failedRows.length) {
    showToast(`تم إضافة ${saved} من ${stagingRows.length} — فشل: ${failedRows.join(' | ')}`, 'error');
  } else {
    showToast(`تم إضافة ${saved} معاملة بنجاح`, 'success');
  }

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
  const { data, error } = await supabaseClient.from('transactions').select('*').eq('is_archived', false).order('date', { ascending: false });
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
        current_price: tx.type === 'grant' ? 0 : tx.price, target_weight: 0
      }]);
      if (tx.type === 'grant') {
        showToast('تمت إضافة المنحة — يرجى تحديث السعر الحالي للسهم ' + tx.ticker + ' في المحفظة', 'info');
      }
    }
  } else if (tx.type === 'sell' && existing) {
    const newShares = Math.max(0, existing.shares - tx.shares);
    if (newShares === 0) await supabaseClient.from('holdings').delete().eq('id', existing.id);
    else                 await supabaseClient.from('holdings').update({ shares: newShares }).eq('id', existing.id);
  }
}

// ── إعادة حساب كاملة لسهم واحد من صفر بناءً على جميع معاملاته ─
// هذا أدق من reverseHolding الذي يطبّق دلتا قد تتراكم أخطاؤها
// بعد كل حذف أو تعديل معاملة يُستدعى هذا بدلاً من reverseHolding
async function recomputeHoldingFromTx(userId, ticker) {
  const { data: txAll } = await supabaseClient
    .from('transactions')
    .select('type, shares, price, total, name')
    .eq('ticker', ticker)
    .eq('is_archived', false)
    .order('date', { ascending: true });

  const rows = txAll || [];

  // احسب الأسهم الإجمالية والمتوسط المرجح (WAC) من الصفر
  let totalShares = 0;
  let totalCost   = 0;
  let stockName   = '';

  rows.forEach(t => {
    if (!stockName && t.name) stockName = t.name;
    if (t.type === 'buy') {
      totalCost   += +t.shares * +t.price;
      totalShares += +t.shares;
    } else if (t.type === 'grant') {
      totalShares += +t.shares;   // منحة: تكلفة = صفر
    } else if (t.type === 'sell') {
      const sellShares = Math.min(+t.shares, totalShares);
      // WAC لا يتغير عند البيع — فقط الأسهم تنقص
      const pct = totalShares > 0 ? sellShares / totalShares : 0;
      totalCost   -= totalCost * pct;
      totalShares -= sellShares;
    }
  });

  totalShares = Math.max(0, +totalShares.toFixed(6));
  const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;

  const { data: existing } = await supabaseClient
    .from('holdings').select('id, current_price, sector, target_weight')
    .eq('user_id', userId).eq('ticker', ticker).maybeSingle();

  if (totalShares <= 0) {
    // السهم بيع بالكامل — احذفه من المحفظة
    if (existing) await supabaseClient.from('holdings').delete().eq('id', existing.id);
  } else if (existing) {
    // حدّث الأسهم والمتوسط فقط — احتفظ بالسعر الحالي والقطاع والهدف
    await supabaseClient.from('holdings').update({
      shares:    +totalShares.toFixed(6),
      avg_price: +avgPrice.toFixed(4),
    }).eq('id', existing.id);
  } else {
    // سهم جديد — أضفه
    await supabaseClient.from('holdings').insert([{
      user_id:      userId,
      ticker,
      name:         stockName,
      sector:       '',
      shares:       +totalShares.toFixed(6),
      avg_price:    +avgPrice.toFixed(4),
      current_price: +avgPrice.toFixed(4),
      target_weight: 0,
    }]);
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

// ── Filter by type ────────────────────────────────────────────
function setTxFilter(type) {
  _filterType = type;
  // تحديث حالة الأزرار
  ['all','buy','sell','grant'].forEach(t => {
    const btn = document.getElementById('txf-' + t);
    if (btn) btn.classList.toggle('btn-primary',   t === type);
    if (btn) btn.classList.toggle('btn-secondary', t !== type);
  });
  renderTable();
}

// ── Sort ──────────────────────────────────────────────────────
function sortTable(field) {
  if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortField = field; sortDir = 'asc'; }
  renderTable();
}

function getSorted() {
  // تطبيق فلتر النوع أولاً
  const base = _filterType === 'all'
    ? transactions
    : transactions.filter(t => t.type === _filterType);
  const numFields = new Set(['shares','price','commission','vat','total']);
  return [...base].sort((a, b) => {
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

// ── Transaction Summary Stats ─────────────────────────────────
function renderTxStats() {
  const el = document.getElementById('tx-stats');
  if (!el) return;

  const buys   = transactions.filter(t => t.type === 'buy');
  const sells  = transactions.filter(t => t.type === 'sell');
  const grants = transactions.filter(t => t.type === 'grant');

  // حساب الربح/الخسارة الحقيقي بطريقة WAC شاملة العمولة والضريبة
  // نمشي على المعاملات ترتيباً تاريخياً ونتتبع التكلفة الكاملة لكل رمز
  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const costMap = {}; // ticker → { shares, totalCost (شاملة عمولة + ضريبة) }

  let profitSells = 0, profitAmount = 0;
  let lossSells   = 0, lossAmount   = 0;

  sorted.forEach(t => {
    if (!costMap[t.ticker]) costMap[t.ticker] = { shares: 0, totalCost: 0 };
    const m = costMap[t.ticker];

    if (t.type === 'buy') {
      // total الشراء = أسهم × سعر + عمولة + ضريبة
      m.totalCost += +t.total;
      m.shares    += +t.shares;
    } else if (t.type === 'grant') {
      m.shares += +t.shares; // منحة: تكلفة صفر
    } else if (t.type === 'sell') {
      // متوسط التكلفة الكاملة للسهم الواحد (شاملة العمولة والضريبة عند الشراء)
      const avgCostPerShare = m.shares > 0 ? m.totalCost / m.shares : 0;
      const costOfSold      = avgCostPerShare * +t.shares;
      // صافي عائد البيع (total البيع = أسهم × سعر − عمولة − ضريبة)
      const netProceeds     = +t.total;
      const pnl             = netProceeds - costOfSold;

      if (pnl >= 0) { profitSells++;  profitAmount += pnl; }
      else          { lossSells++;    lossAmount   += Math.abs(pnl); }

      // اخصم التكلفة والأسهم المباعة بنسبتها
      const pct    = m.shares > 0 ? +t.shares / m.shares : 0;
      m.totalCost  = Math.max(0, m.totalCost - m.totalCost * pct);
      m.shares     = Math.max(0, m.shares - +t.shares);
    }
  });

  const totalBuyAmt  = buys.reduce((s, t)  => s + +t.total, 0);
  const totalSellAmt = sells.reduce((s, t) => s + +t.total, 0);

  el.innerHTML = `
    <div class="tx-stat-item">
      <div class="tx-stat-val">${transactions.length}</div>
      <div class="tx-stat-lbl">إجمالي العمليات</div>
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val text-accent">${buys.length}</div>
      <div class="tx-stat-lbl">عمليات شراء</div>
      <div class="tx-stat-sub">${formatSAR(totalBuyAmt)}</div>
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val text-success">${sells.length}</div>
      <div class="tx-stat-lbl">عمليات بيع</div>
      <div class="tx-stat-sub">${formatSAR(totalSellAmt)}</div>
    </div>
    ${grants.length ? `
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val" style="color:var(--text-muted)">${grants.length}</div>
      <div class="tx-stat-lbl">منح أسهم</div>
    </div>` : ''}
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val text-success">↑ ${profitSells}</div>
      <div class="tx-stat-lbl">صفقات رابحة</div>
      <div class="tx-stat-sub text-success">+${formatSAR(profitAmount)}</div>
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val text-danger">↓ ${lossSells}</div>
      <div class="tx-stat-lbl">صفقات خاسرة</div>
      <div class="tx-stat-sub text-danger">−${formatSAR(lossAmount)}</div>
    </div>`;
}

// ── Render transaction log ────────────────────────────────────
function renderTable() {
  renderTxStats();
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
      <td ${ed('transactions',t.id,'shares','number',t.shares,'num')}>${formatShares(t.shares)}</td>
      <td ${ed('transactions',t.id,'price','number',t.price,'num')}>${formatSAR(t.price)}</td>
      <td class="num text-muted">${formatSAR(t.commission)}</td>
      <td class="num text-muted">${formatSAR(t.vat)}</td>
      <td class="num bold ${totalCls}">${formatSAR(t.total)}</td>
      <td>
        <div class="flex gap-1">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${esc(t.id)}')">تعديل</button>
          <button class="btn btn-danger btn-sm"    onclick="archiveTx('${esc(t.id)}')">أرشفة</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Update sort indicators
  ['date','ticker','name','type','shares','price','commission','vat','total'].forEach(f => {
    const th = document.getElementById('th-' + f);
    const arrow = th?.querySelector('.sort-arrow');
    if (arrow) arrow.outerHTML = sortArrow(f);
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
    // منحة: السعر يُصبح 0 تلقائياً
    if (isGrant && field === 'type') {
      row.price = 0;
      await supabaseClient.from('transactions').update({ price: 0 }).eq('id', id);
    }
    const c     = isGrant ? { commission: 0, vat: 0 } : calcCommission(row.shares, row.price);
    const total = isGrant ? 0 : (row.type === 'sell' ? c.totalSell : c.totalBuy);
    await supabaseClient.from('transactions').update({ commission: c.commission, vat: c.vat, total }).eq('id', id);
    row.commission = c.commission; row.vat = c.vat; row.total = total;
    showToast('⚠️ تغيير نوع/كمية المعاملة لا يُحدِّث المحفظة تلقائياً — استخدم "مزامنة من المعاملات" في لوحة التحكم', 'info');
  }
  renderTable();
}

async function archiveTx(id) {
  if (!confirm('أرشفة هذه المعاملة؟ ستُخفى من الحسابات والمحفظة لكنها تبقى في قاعدة البيانات كسجل تاريخي.')) return;
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient.from('transactions').update({ is_archived: true }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  // إعادة حساب كاملة من الصفر بعد الحذف — أدق من reverseHolding
  await recomputeHoldingFromTx(user.id, tx.ticker);
  showToast('تمت الأرشفة وتحديث المحفظة', 'success');
  await loadTransactions();
  renderTable();
}

// ── Edit Modal ────────────────────────────────────────────────
function openEditModal(id) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;
  _editId = id;

  document.getElementById('edit-date').value   = t.date   || '';
  document.getElementById('edit-ticker').value = t.ticker || '';
  document.getElementById('edit-name').value   = t.name   || '';
  document.getElementById('edit-type').value   = t.type   || 'buy';
  document.getElementById('edit-shares').value = t.shares || '';
  document.getElementById('edit-price').value  = (t.type === 'grant') ? '0' : (t.price || '');

  // ضبط حقل السعر للمنحة
  onEditTypeChange(t.type || 'buy');
  updateEditCalc();
  document.getElementById('edit-modal').style.display = 'flex';
}

// يتحكم في قفل/فتح حقل السعر في نافذة التعديل
function onEditTypeChange(type) {
  const priceInput = document.getElementById('edit-price');
  if (!priceInput) return;
  if (type === 'grant') {
    priceInput.value    = '0';
    priceInput.readOnly = true;
    priceInput.style.opacity = '0.5';
  } else {
    priceInput.readOnly = false;
    priceInput.style.opacity = '';
    if (priceInput.value === '0') priceInput.value = '';
  }
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
  const isGrant = type === 'grant';
  if (!shares || (!price && !isGrant)) {
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

  if (!date || !ticker || !name)            { showToast('جميع الحقول مطلوبة', 'error'); return; }
  if (shares <= 0)                          { showToast('عدد الأسهم يجب أن يكون أكبر من صفر', 'error'); return; }
  if (type !== 'grant' && price <= 0)       { showToast('سعر السهم يجب أن يكون أكبر من صفر', 'error'); return; }

  const c = type === 'grant'
    ? { commission: 0, vat: 0, totalBuy: shares * price, totalSell: shares * price }
    : calcCommission(shares, price);
  const total = type === 'sell' ? c.totalSell : c.totalBuy;

  const { error } = await supabaseClient.from('transactions').update({
    date, ticker, name, type, shares, price,
    commission: c.commission, vat: c.vat, total
  }).eq('id', _editId);

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }

  // إعادة حساب كاملة من الصفر بعد التعديل — أدق من reverse+apply
  const { data: { user } } = await supabaseClient.auth.getUser();
  const oldTx = transactions.find(t => t.id === _editId);
  // لو الرمز تغيّر نعيد حساب القديم والجديد كليهما
  const tickers = new Set([ticker]);
  if (oldTx?.ticker && oldTx.ticker !== ticker) tickers.add(oldTx.ticker);
  for (const t of tickers) await recomputeHoldingFromTx(user.id, t);

  showToast('تم حفظ التعديلات ✓', 'success');
  document.getElementById('edit-modal').style.display = 'none';
  _editId = null;
  await loadTransactions();
  renderTable();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportTransactionsCSV() {
  if (!transactions.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  const TYPE_AR = { buy: 'شراء', sell: 'بيع', grant: 'منحة', split: 'تجزئة' };
  exportCSV(`معاملات_${todayISO()}.csv`,
    ['التاريخ', 'الرمز', 'الاسم', 'النوع', 'الأسهم', 'السعر', 'العمولة', 'الضريبة', 'الإجمالي'],
    transactions.map(t => [
      t.date, t.ticker, t.name,
      TYPE_AR[t.type] || t.type,
      t.shares, t.price, t.commission, t.vat, t.total
    ])
  );
  showToast(`✓ تم تصدير ${transactions.length} معاملة`, 'success');
}

init();
