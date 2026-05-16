let snapshots = [];
let nwChart   = null;

function ed(table, rowId, field, type, raw, extraCls = '') {
  return `class="editable${type==='number'?' num':''}${extraCls?' '+extraCls:''}" ` +
    `data-table="${table}" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"`;
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-networth');
  document.getElementById('nw-date').value = todayISO();
  await loadSnapshots();
  renderChart();
  renderTable();
}

async function loadSnapshots() {
  const { data, error } = await supabaseClient
    .from('net_worth_snapshots').select('*').order('date', { ascending: true });
  if (error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  snapshots = data || [];
}

function renderChart() {
  const canvas = document.getElementById('nwChart');
  if (!canvas) return;

  if (!snapshots.length) {
    canvas.parentElement.innerHTML = `<div class="empty-state" style="height:260px"><div class="icon">📉</div><p>أضف لقطات لعرض المخطط</p></div>`;
    return;
  }

  if (nwChart) nwChart.destroy();
  const ctx = document.getElementById('nwChart')?.getContext('2d');
  if (!ctx) return;

  nwChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: snapshots.map(s => formatDate(s.date)),
      datasets: [{
        label: 'صافي الثروة (ر.س)',
        data: snapshots.map(s => +s.total_value),
        borderColor: '#f0b429',
        backgroundColor: 'rgba(240,180,41,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#f0b429',
        pointRadius: 4, pointHoverRadius: 7,
        fill: true, tension: 0.3
      }]
    },
    options: {
      ...chartDefaults(),
      plugins: {
        ...chartDefaults().plugins,
        tooltip: { ...chartDefaults().plugins.tooltip, callbacks: { label: c => ' ' + formatSAR(c.parsed.y) } }
      },
      scales: {
        x: { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 } }, grid: { color: 'rgba(48,54,61,0.6)' } },
        y: { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, callback: v => formatNum(v/1000,0) + 'K' }, grid: { color: 'rgba(48,54,61,0.6)' } }
      }
    }
  });
}

function renderTable() {
  const tbody = document.getElementById('nw-tbody');
  if (!tbody) return;

  if (!snapshots.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">🏦</div><p>لا توجد لقطات بعد</p></div></td></tr>`;
    enableInlineEditing(tbody, onNwSaved);
    return;
  }

  const sorted = [...snapshots].reverse(); // newest first
  tbody.innerHTML = sorted.map((s, i) => {
    const prev   = sorted[i + 1];
    const change = prev ? +s.total_value - +prev.total_value : null;
    const chgCls = change === null ? '' : (change >= 0 ? 'text-success' : 'text-danger');

    return `<tr>
      <td ${ed('net_worth_snapshots',s.id,'date','date',s.date)}>${formatDate(s.date)}</td>
      <td ${ed('net_worth_snapshots',s.id,'total_value','number',s.total_value,'bold text-accent num')}>${formatSAR(s.total_value)}</td>
      <td class="num ${chgCls}">${change === null ? '—' : formatSAR(change, true)}</td>
      <td ${ed('net_worth_snapshots',s.id,'notes','text',s.notes||'','text-muted small')}>${esc(s.notes||'—')}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteSnapshot('${esc(s.id)}')">حذف</button></td>
    </tr>`;
  }).join('');

  enableInlineEditing(tbody, onNwSaved);
}

async function onNwSaved(id, field, val) {
  const s = snapshots.find(x => x.id === id);
  if (s) { s[field] = val; if (field === 'date') snapshots.sort((a, b) => a.date.localeCompare(b.date)); }
  renderChart();
  renderTable();
}

async function addSnapshot(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id:     user.id,
    date:        document.getElementById('nw-date').value,
    total_value: +document.getElementById('nw-value').value,
    notes:       document.getElementById('nw-notes').value.trim()
  };
  const { error } = await supabaseClient.from('net_worth_snapshots').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تمت إضافة اللقطة', 'success');
  document.getElementById('nw-form').reset();
  document.getElementById('nw-date').value = todayISO();
  await loadSnapshots();
  renderChart();
  renderTable();
}

async function deleteSnapshot(id) {
  if (!confirm('هل أنت متأكد من الحذف؟')) return;
  const { error } = await supabaseClient.from('net_worth_snapshots').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await loadSnapshots();
  renderChart();
  renderTable();
}

init();
