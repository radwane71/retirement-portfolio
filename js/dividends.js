let dividends = [];

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-dividends');

  const now = new Date();
  document.getElementById('d-date').value  = todayISO();
  document.getElementById('d-month').value = now.getMonth() + 1;
  document.getElementById('d-year').value  = now.getFullYear();

  await loadDividends();
  renderAll();
}

async function loadDividends() {
  const { data, error } = await supabaseClient
    .from('dividends').select('*').order('date', { ascending: false });
  if (error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  dividends = data || [];
}

function renderAll() {
  renderYearlySummary();
  renderHoldingSummary();
  renderTable();
}

function renderYearlySummary() {
  const yearMap = {};
  dividends.forEach(d => {
    yearMap[d.year] = (yearMap[d.year] || 0) + parseFloat(d.amount || 0);
  });

  const years = Object.keys(yearMap).sort((a, b) => b - a);
  const el = document.getElementById('yearly-summary');

  if (!years.length) {
    el.innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>لا توجد بيانات</p></div>`;
    return;
  }

  el.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr><th>السنة</th><th>إجمالي الأرباح</th></tr></thead>
    <tbody>${years.map(y => `<tr>
      <td><strong>${y}</strong></td>
      <td class="num text-accent bold">${formatSAR(yearMap[y])}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderHoldingSummary() {
  const map = {};
  dividends.forEach(d => {
    const key = d.ticker;
    if (!map[key]) map[key] = { name: d.name, total: 0 };
    map[key].total += parseFloat(d.amount || 0);
  });

  const tickers = Object.keys(map).sort((a, b) => map[b].total - map[a].total);
  const el = document.getElementById('holding-summary');

  if (!tickers.length) {
    el.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p>لا توجد بيانات</p></div>`;
    return;
  }

  el.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr><th>الرمز</th><th>الاسم</th><th>إجمالي الأرباح</th></tr></thead>
    <tbody>${tickers.map(t => `<tr>
      <td><strong class="text-accent">${t}</strong></td>
      <td>${map[t].name}</td>
      <td class="num text-success bold">${formatSAR(map[t].total)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderTable() {
  const tbody = document.getElementById('div-tbody');
  if (!dividends.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">💰</div><p>لا توجد أرباح مسجلة بعد</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = dividends.map(d => `<tr>
    <td>${formatDate(d.date)}</td>
    <td><strong class="text-accent">${d.ticker}</strong></td>
    <td>${d.name}</td>
    <td class="num text-success bold">${formatSAR(d.amount)}</td>
    <td>${MONTHS_AR[d.month - 1]}</td>
    <td>${d.year}</td>
    <td>
      <button class="btn btn-danger btn-sm" onclick="deleteDividend('${d.id}')">حذف</button>
    </td>
  </tr>`).join('');
}

async function addDividend(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();

  const payload = {
    user_id: user.id,
    date:    document.getElementById('d-date').value,
    ticker:  document.getElementById('d-ticker').value.trim().toUpperCase(),
    name:    document.getElementById('d-name').value.trim(),
    amount:  parseFloat(document.getElementById('d-amount').value),
    month:   parseInt(document.getElementById('d-month').value),
    year:    parseInt(document.getElementById('d-year').value)
  };

  const { error } = await supabaseClient.from('dividends').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }

  showToast('تمت إضافة الأرباح بنجاح', 'success');
  document.getElementById('div-form').reset();
  const now = new Date();
  document.getElementById('d-date').value  = todayISO();
  document.getElementById('d-month').value = now.getMonth() + 1;
  document.getElementById('d-year').value  = now.getFullYear();

  await loadDividends();
  renderAll();
}

async function deleteDividend(id) {
  if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
  const { error } = await supabaseClient.from('dividends').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف بنجاح', 'success');
  await loadDividends();
  renderAll();
}

init();
