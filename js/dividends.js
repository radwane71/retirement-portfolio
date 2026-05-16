let dividends = [];

function ed(table, rowId, field, type, raw, extraCls = '', selectKey = '') {
  return `class="editable${type==='number'?' num':''}${extraCls?' '+extraCls:''}" ` +
    `data-table="${table}" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"` +
    (selectKey ? ` data-select="${selectKey}"` : '');
}

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
  const { data, error } = await supabaseClient.from('dividends').select('*').order('date', { ascending: false });
  if (error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  dividends = data || [];
}

function renderAll() {
  renderSummaries();
  renderTable();
}

function renderSummaries() {
  // Yearly totals
  const yearMap = {};
  dividends.forEach(d => { yearMap[d.year] = (yearMap[d.year] || 0) + +d.amount; });
  const years = Object.keys(yearMap).sort((a, b) => b - a);
  const yEl = document.getElementById('yearly-summary');
  yEl.innerHTML = years.length
    ? `<div class="table-wrapper"><table>
        <thead><tr><th>السنة</th><th>إجمالي الأرباح</th></tr></thead>
        <tbody>${years.map(y => `<tr><td><strong>${y}</strong></td><td class="num text-accent bold">${formatSAR(yearMap[y])}</td></tr>`).join('')}</tbody>
       </table></div>`
    : `<div class="empty-state"><div class="icon">📅</div><p>لا توجد بيانات</p></div>`;

  // Per-holding totals
  const holdMap = {};
  dividends.forEach(d => { if (!holdMap[d.ticker]) holdMap[d.ticker] = { name: d.name, total: 0 }; holdMap[d.ticker].total += +d.amount; });
  const tickers = Object.keys(holdMap).sort((a, b) => holdMap[b].total - holdMap[a].total);
  const hEl = document.getElementById('holding-summary');
  hEl.innerHTML = tickers.length
    ? `<div class="table-wrapper"><table>
        <thead><tr><th>الرمز</th><th>الاسم</th><th>إجمالي الأرباح</th></tr></thead>
        <tbody>${tickers.map(t => `<tr>
          <td><strong class="text-accent">${esc(t)}</strong></td>
          <td>${esc(holdMap[t].name)}</td>
          <td class="num text-success bold">${formatSAR(holdMap[t].total)}</td>
        </tr>`).join('')}</tbody>
       </table></div>`
    : `<div class="empty-state"><div class="icon">📊</div><p>لا توجد بيانات</p></div>`;
}

function renderTable() {
  const tbody = document.getElementById('div-tbody');
  if (!tbody) return;

  if (!dividends.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">💰</div><p>لا توجد أرباح مسجلة بعد</p></div></td></tr>`;
    enableInlineEditing(tbody, onDivSaved);
    return;
  }

  tbody.innerHTML = dividends.map(d => `<tr>
    <td ${ed('dividends',d.id,'date','date',d.date)}>${formatDate(d.date)}</td>
    <td ${ed('dividends',d.id,'ticker','text',d.ticker,'text-accent bold')}>${esc(d.ticker)}</td>
    <td ${ed('dividends',d.id,'name','text',d.name)}>${esc(d.name)}</td>
    <td ${ed('dividends',d.id,'amount','number',d.amount,'num text-success bold')}>${formatSAR(d.amount)}</td>
    <td ${ed('dividends',d.id,'month','text',d.month,'','month')}>${MONTHS_AR[d.month-1]}</td>
    <td ${ed('dividends',d.id,'year','number',d.year,'num')}>${d.year}</td>
    <td><button class="btn btn-danger btn-sm" onclick="deleteDiv('${esc(d.id)}')">حذف</button></td>
  </tr>`).join('');

  enableInlineEditing(tbody, onDivSaved);
}

async function onDivSaved(id, field, val) {
  const d = dividends.find(x => x.id === id);
  if (d) d[field] = val;
  renderAll();
}

async function addDividend(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id: user.id,
    date:    document.getElementById('d-date').value,
    ticker:  document.getElementById('d-ticker').value.trim().toUpperCase(),
    name:    document.getElementById('d-name').value.trim(),
    amount:  +document.getElementById('d-amount').value,
    month:   +document.getElementById('d-month').value,
    year:    +document.getElementById('d-year').value
  };
  const { error } = await supabaseClient.from('dividends').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تمت إضافة الأرباح', 'success');
  document.getElementById('div-form').reset();
  const now = new Date();
  document.getElementById('d-date').value  = todayISO();
  document.getElementById('d-month').value = now.getMonth() + 1;
  document.getElementById('d-year').value  = now.getFullYear();
  await loadDividends();
  renderAll();
}

async function deleteDiv(id) {
  if (!confirm('هل أنت متأكد من الحذف؟')) return;
  const { error } = await supabaseClient.from('dividends').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await loadDividends();
  renderAll();
}

init();
