let snapshots = [];
let nwChart   = null;

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
  if (!snapshots.length) {
    canvas.parentElement.innerHTML = `<div class="empty-state" style="height:260px"><div class="icon">📉</div><p>أضف لقطات لعرض المخطط</p></div>`;
    return;
  }

  const labels = snapshots.map(s => formatDate(s.date));
  const data   = snapshots.map(s => parseFloat(s.total_value));

  if (nwChart) nwChart.destroy();
  const ctx = document.getElementById('nwChart').getContext('2d');
  nwChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'صافي الثروة',
        data,
        borderColor: '#f0b429',
        backgroundColor: 'rgba(240,180,41,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#f0b429',
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      ...chartDefaults(),
      plugins: {
        ...chartDefaults().plugins,
        tooltip: {
          ...chartDefaults().plugins.tooltip,
          callbacks: { label: ctx => ' ' + formatSAR(ctx.parsed.y) }
        }
      },
      scales: {
        x: { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 } }, grid: { color: 'rgba(48,54,61,0.6)' } },
        y: {
          ticks: {
            color: '#8b949e',
            font: { family: 'Tajawal', size: 11 },
            callback: v => formatNum(v / 1000, 0) + 'K'
          },
          grid: { color: 'rgba(48,54,61,0.6)' }
        }
      }
    }
  });
}

function renderTable() {
  const tbody = document.getElementById('nw-tbody');

  if (!snapshots.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="icon">🏦</div><p>لا توجد لقطات بعد</p></div></td></tr>`;
    return;
  }

  const sorted = [...snapshots].reverse();
  tbody.innerHTML = sorted.map((s, i) => {
    const prev   = sorted[i + 1];
    const change = prev ? parseFloat(s.total_value) - parseFloat(prev.total_value) : null;
    const chgCls = change === null ? '' : (change >= 0 ? 'text-success' : 'text-danger');

    return `<tr>
      <td>${formatDate(s.date)}</td>
      <td class="num bold text-accent">${formatSAR(s.total_value)}</td>
      <td class="num ${chgCls}">
        ${change === null ? '—' : formatSAR(change, true)}
      </td>
      <td class="text-muted small">${s.notes || '—'}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteSnapshot('${s.id}')">حذف</button>
      </td>
    </tr>`;
  }).join('');
}

async function addSnapshot(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();

  const payload = {
    user_id:     user.id,
    date:        document.getElementById('nw-date').value,
    total_value: parseFloat(document.getElementById('nw-value').value),
    notes:       document.getElementById('nw-notes').value.trim()
  };

  const { error } = await supabaseClient.from('net_worth_snapshots').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }

  showToast('تمت إضافة اللقطة بنجاح', 'success');
  document.getElementById('nw-form').reset();
  document.getElementById('nw-date').value = todayISO();
  await loadSnapshots();
  renderChart();
  renderTable();
}

async function deleteSnapshot(id) {
  if (!confirm('هل أنت متأكد من حذف هذه اللقطة؟')) return;
  const { error } = await supabaseClient.from('net_worth_snapshots').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف بنجاح', 'success');
  await loadSnapshots();
  renderChart();
  renderTable();
}

init();
