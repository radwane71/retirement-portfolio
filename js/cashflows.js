let cfEntries  = [];
let cfFiltered = [];
let divEntries = [];  // أرباح موزعة مقروءة من جدول dividends (للعرض فقط — لا تُكتب في cashflow_entries)

const TYPE_AR = { deposit: 'إيداع', withdrawal: 'سحب', dividend: 'أرباح موزعة' };

function edCf(rowId, field, type, raw, extraCls = '', selectKey = '') {
  return `class="editable${type==='number'?' num':''}${extraCls?' '+extraCls:''}" ` +
    `data-table="cashflow_entries" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"` +
    (selectKey ? ` data-select="${selectKey}"` : '');
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-cashflows');

  document.getElementById('cf-date').value = todayISO();
  await loadEntries();
  buildYearFilter();
  renderSummary();
  renderTable();
}

async function loadEntries() {
  const [rCf, rDiv] = await Promise.all([
    supabaseClient.from('cashflow_entries').select('*').eq('is_archived', false).order('date', { ascending: false }),
    supabaseClient.from('dividends').select('id, date, ticker, name, amount, year').eq('is_archived', false).order('date', { ascending: false })
  ]);
  if (rCf.error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  cfEntries  = rCf.data  || [];
  // حوّل سجلات الأرباح إلى تنسيق موحّد (للعرض فقط)
  divEntries = (rDiv.data || []).map(d => ({
    _isDividend: true,
    id:          d.id,
    date:        d.date,
    type:        'dividend',
    amount:      +d.amount,
    notes:       `${d.ticker || ''} ${d.name ? '— ' + d.name : ''} (${d.year})`.trim(),
  }));
}

function buildYearFilter() {
  // يشمل سنوات التدفقات النقدية + سنوات الأرباح الموزعة
  const years = [...new Set([
    ...cfEntries.map(e => new Date(e.date).getFullYear()),
    ...divEntries.map(e => new Date(e.date).getFullYear()).filter(Boolean),
  ])].sort((a,b) => b-a);
  const sel = document.getElementById('cf-year-filter');
  // keep first "كل السنوات" option
  sel.innerHTML = '<option value="">كل السنوات</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join('');
  // default to current year if available
  const curYear = new Date().getFullYear();
  if (years.includes(curYear)) sel.value = curYear;
  applyFilter();
}

let divFiltered = [];

function applyFilter() {
  const yr = document.getElementById('cf-year-filter')?.value;
  cfFiltered  = yr ? cfEntries.filter(e => new Date(e.date).getFullYear() === +yr)  : [...cfEntries];
  divFiltered = yr ? divEntries.filter(e => new Date(e.date).getFullYear() === +yr) : [...divEntries];
}

function filterYear() {
  applyFilter();
  renderTable();
}

function renderSummary() {
  const totalDep  = cfEntries.filter(e => e.type === 'deposit').reduce((s,e) => s + +e.amount, 0);
  const totalWith = cfEntries.filter(e => e.type === 'withdrawal').reduce((s,e) => s + +e.amount, 0);
  const totalDiv  = divEntries.reduce((s,e) => s + +e.amount, 0);
  const net       = totalDep - totalWith;

  const curYear   = new Date().getFullYear();
  const yearDep   = cfEntries.filter(e => e.type === 'deposit'    && new Date(e.date).getFullYear() === curYear).reduce((s,e) => s + +e.amount, 0);
  const yearWith  = cfEntries.filter(e => e.type === 'withdrawal' && new Date(e.date).getFullYear() === curYear).reduce((s,e) => s + +e.amount, 0);
  const yearDiv   = divEntries.filter(e => new Date(e.date).getFullYear() === curYear).reduce((s,e) => s + +e.amount, 0);
  const yearNet   = yearDep - yearWith;

  const el = id => document.getElementById(id);
  if (el('cf-total-dep'))  el('cf-total-dep').textContent  = formatSAR(totalDep);
  if (el('cf-total-with')) el('cf-total-with').textContent = formatSAR(totalWith);
  if (el('cf-total-div'))  el('cf-total-div').textContent  = formatSAR(totalDiv);
  if (el('cf-year-div'))   { el('cf-year-div').textContent = formatSAR(yearDiv); }

  const netEl = el('cf-net');
  if (netEl) { netEl.textContent = formatSAR(net, true); netEl.className = 'value num ' + (net >= 0 ? 'text-success' : 'text-danger'); }

  const yrEl = el('cf-this-year');
  if (yrEl) { yrEl.textContent = formatSAR(yearNet, true); yrEl.className = 'value num ' + (yearNet >= 0 ? 'text-success' : 'text-danger'); }
  if (el('cf-this-year-lbl')) el('cf-this-year-lbl').textContent = `صافي ${curYear}: إيداع ${formatSAR(yearDep)} / سحب ${formatSAR(yearWith)}`;
}

function renderTable() {
  const tbody = document.getElementById('cf-tbody');
  if (!tbody) return;

  const hasManual = cfFiltered.length > 0;
  const hasDiv    = divFiltered.length > 0;

  if (!hasManual && !hasDiv) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">📈</div><p>لا توجد حركات لهذه الفترة</p></div></td></tr>`;
    enableInlineEditing(tbody, onCfSaved);
    return;
  }

  // صفوف الحركات اليدوية (قابلة للتعديل)
  const manualRows = cfFiltered.map(e => `<tr>
    <td ${edCf(e.id,'date','date',e.date)}>${formatDate(e.date)}</td>
    <td ${edCf(e.id,'type','text',e.type,'','cftype')}>
      <span class="badge badge-${e.type}">${TYPE_AR[e.type] || e.type}</span>
    </td>
    <td ${edCf(e.id,'amount','number',e.amount,'num ' + (e.type==='deposit'?'text-success':'text-danger'),'')}>
      ${e.type === 'deposit' ? '+' : '−'}${formatSAR(e.amount)}
    </td>
    <td ${edCf(e.id,'notes','text',e.notes||'','text-muted small')}>${esc(e.notes || '—')}</td>
    <td><button class="btn btn-danger btn-sm" onclick="archiveEntry('${esc(e.id)}')">أرشفة</button></td>
  </tr>`).join('');

  // فاصل + صفوف الأرباح الموزعة (للعرض فقط — مرتبطة بجدول الأرباح)
  const divHeader = hasDiv ? `<tr style="background:var(--bg-3)">
    <td colspan="5" class="small bold" style="padding:8px 12px;color:var(--success)">
      💰 الأرباح الموزعة — مرتبطة تلقائياً من صفحة الأرباح (للعرض فقط)
    </td>
  </tr>` : '';

  const divRows = divFiltered.map(e => `<tr style="opacity:0.85">
    <td class="text-muted small">${formatDate(e.date)}</td>
    <td><span class="badge" style="background:rgba(63,185,80,0.15);color:#3fb950">💰 أرباح موزعة</span></td>
    <td class="num text-success">+${formatSAR(e.amount)}</td>
    <td class="text-muted small">${esc(e.notes || '—')}</td>
    <td><a href="dividends.html" class="btn btn-secondary btn-sm">→ جدول الأرباح</a></td>
  </tr>`).join('');

  tbody.innerHTML = manualRows + divHeader + divRows;
  enableInlineEditing(tbody, onCfSaved);
}

async function onCfSaved(id, field, val) {
  const e = cfEntries.find(x => x.id === id);
  if (e) e[field] = val;
  applyFilter();
  renderSummary();
  renderTable();
}

function resetForm() {
  document.getElementById('cf-form').reset();
  document.getElementById('cf-date').value = todayISO();
}

async function addEntry(ev) {
  ev.preventDefault();
  const amount = +document.getElementById('cf-amount').value;
  if (amount <= 0) { showToast('المبلغ يجب أن يكون أكبر من صفر', 'error'); return; }

  const cfType = document.getElementById('cf-type').value;
  const cfTypeLabel = cfType === 'deposit' ? 'إيداع' : 'سحب';
  if (!await confirmAsync(`هل تريد تسجيل ${cfTypeLabel} بمبلغ ${formatSAR(amount)}؟`)) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id: user.id,
    date:    document.getElementById('cf-date').value,
    type:    cfType,
    amount,
    notes:   document.getElementById('cf-notes').value.trim()
  };
  const { error } = await supabaseClient.from('cashflow_entries').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم التسجيل', 'success');
  resetForm();
  await loadEntries();
  buildYearFilter();
  renderSummary();
  renderTable();
}

async function archiveEntry(id) {
  // AUDIT-FIX: replace blocking confirm() with async modal (mobile-safe, CSP-safe)
  if (!await confirmAsync('أرشفة هذا القيد؟ سيُخفى من الحسابات لكنه يبقى في قاعدة البيانات.')) return;
  const { error } = await supabaseClient.from('cashflow_entries').update({ is_archived: true }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تمت الأرشفة', 'success');
  await loadEntries();
  buildYearFilter();
  renderSummary();
  renderTable();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportCashflowsCSV() {
  const manualData = cfFiltered.length ? cfFiltered : cfEntries;
  const divData    = divFiltered.length ? divFiltered : divEntries;
  const combined   = [...manualData, ...divData].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!combined.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  exportCSV(`تدفقات_نقدية_${todayISO()}.csv`,
    ['التاريخ', 'النوع', 'المبلغ', 'ملاحظات'],
    combined.map(e => [e.date, TYPE_AR[e.type] || e.type, e.amount, e.notes || ''])
  );
  showToast(`✓ تم تصدير ${combined.length} حركة (${manualData.length} يدوي + ${divData.length} أرباح)`, 'success');
}

init();
