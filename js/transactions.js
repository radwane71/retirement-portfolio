let transactions = [];

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-transactions');
  document.getElementById('t-date').value = todayISO();
  setupCalculations();
  await loadTransactions();
  renderTable();
}

function setupCalculations() {
  ['t-shares','t-price'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateCalc);
  });
  document.getElementById('t-type').addEventListener('change', updateCalc);
}

function updateCalc() {
  const shares = parseFloat(document.getElementById('t-shares').value) || 0;
  const price  = parseFloat(document.getElementById('t-price').value)  || 0;
  const type   = document.getElementById('t-type').value;

  if (!shares || !price) {
    document.getElementById('t-commission').value = '';
    document.getElementById('t-vat').value = '';
    document.getElementById('t-total').value = '';
    return;
  }

  const c = calcCommission(shares, price);
  document.getElementById('t-commission').value = c.commission.toFixed(4);
  document.getElementById('t-vat').value         = c.vat.toFixed(4);
  document.getElementById('t-total').value       = type === 'buy' ? c.totalBuy.toFixed(4) : c.totalSell.toFixed(4);
}

async function loadTransactions() {
  const { data, error } = await supabaseClient
    .from('transactions').select('*').order('date', { ascending: false });
  if (error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  transactions = data || [];
}

function renderTable() {
  const tbody = document.getElementById('tx-tbody');

  if (!transactions.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="icon">💹</div><p>لا توجد معاملات بعد</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = transactions.map(t => {
    const isBuy = t.type === 'buy';
    return `<tr>
      <td>${formatDate(t.date)}</td>
      <td><strong class="text-accent">${t.ticker}</strong></td>
      <td>${t.name}</td>
      <td><span class="badge badge-${t.type}">${isBuy ? 'شراء' : 'بيع'}</span></td>
      <td class="num">${formatNum(t.shares, 4)}</td>
      <td class="num">${formatSAR(t.price)}</td>
      <td class="num text-muted">${formatSAR(t.commission)}</td>
      <td class="num text-muted">${formatSAR(t.vat)}</td>
      <td class="num bold ${isBuy ? 'text-danger' : 'text-success'}">${formatSAR(t.total)}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteTransaction('${t.id}')">حذف</button>
      </td>
    </tr>`;
  }).join('');
}

async function addTransaction(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();

  const shares = parseFloat(document.getElementById('t-shares').value);
  const price  = parseFloat(document.getElementById('t-price').value);
  const type   = document.getElementById('t-type').value;
  const c      = calcCommission(shares, price);

  const payload = {
    user_id:    user.id,
    date:       document.getElementById('t-date').value,
    ticker:     document.getElementById('t-ticker').value.trim().toUpperCase(),
    name:       document.getElementById('t-name').value.trim(),
    type,
    shares,
    price,
    commission: c.commission,
    vat:        c.vat,
    total:      type === 'buy' ? c.totalBuy : c.totalSell
  };

  const { error } = await supabaseClient.from('transactions').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }

  await updateHolding(user.id, payload);

  showToast('تمت إضافة المعاملة بنجاح', 'success');
  document.getElementById('tx-form').reset();
  document.getElementById('t-date').value = todayISO();
  await loadTransactions();
  renderTable();
}

async function updateHolding(userId, tx) {
  const { data: existing } = await supabaseClient
    .from('holdings')
    .select('*')
    .eq('user_id', userId)
    .eq('ticker', tx.ticker)
    .maybeSingle();

  if (tx.type === 'buy') {
    if (existing) {
      const newShares   = existing.shares + tx.shares;
      const newAvgPrice = (existing.shares * existing.avg_price + tx.shares * tx.price) / newShares;
      await supabaseClient.from('holdings').update({
        shares: newShares,
        avg_price: parseFloat(newAvgPrice.toFixed(4))
      }).eq('id', existing.id);
    } else {
      await supabaseClient.from('holdings').insert([{
        user_id:       userId,
        ticker:        tx.ticker,
        name:          tx.name,
        sector:        '',
        shares:        tx.shares,
        avg_price:     tx.price,
        current_price: tx.price,
        target_weight: 0
      }]);
    }
  } else {
    if (existing) {
      const newShares = Math.max(0, existing.shares - tx.shares);
      if (newShares === 0) {
        await supabaseClient.from('holdings').delete().eq('id', existing.id);
      } else {
        await supabaseClient.from('holdings').update({ shares: newShares }).eq('id', existing.id);
      }
    }
  }
}

async function deleteTransaction(id) {
  if (!confirm('هل أنت متأكد من حذف هذه المعاملة؟')) return;
  const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم حذف المعاملة', 'success');
  await loadTransactions();
  renderTable();
}

init();
