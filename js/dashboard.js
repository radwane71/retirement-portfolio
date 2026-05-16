let holdings = [];
let sectorChart = null;
let weightChart = null;
let editingId = null;

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-dashboard');
  await Promise.all([loadHoldings(), loadMonthlyDividends()]);
  renderStats();
  renderCharts();
  renderTable();
}

async function loadHoldings() {
  const { data, error } = await supabaseClient
    .from('holdings').select('*').order('ticker');
  if (error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  holdings = data || [];
}

async function loadMonthlyDividends() {
  const now = new Date();
  const { data } = await supabaseClient
    .from('dividends')
    .select('amount')
    .eq('month', now.getMonth() + 1)
    .eq('year', now.getFullYear());
  const total = (data || []).reduce((s, d) => s + parseFloat(d.amount || 0), 0);
  document.getElementById('stat-monthly-div').textContent = formatSAR(total);
  document.getElementById('stat-div-label').textContent = MONTHS_AR[now.getMonth()] + ' ' + now.getFullYear();
}

function renderStats() {
  const totalValue = holdings.reduce((s, h) => s + h.shares * h.current_price, 0);
  const totalCost  = holdings.reduce((s, h) => s + h.shares * h.avg_price, 0);
  const pnl  = totalValue - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

  document.getElementById('stat-total-value').textContent = formatSAR(totalValue);
  document.getElementById('stat-total-cost').textContent  = formatSAR(totalCost);

  const pnlEl  = document.getElementById('stat-pnl');
  const pctEl  = document.getElementById('stat-pnl-pct');
  pnlEl.textContent = formatSAR(pnl, true);
  pnlEl.className = 'value num ' + (pnl >= 0 ? 'text-success' : 'text-danger');
  pctEl.textContent = (pnl >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%';
  pctEl.className = 'sub ' + (pnl >= 0 ? 'text-success' : 'text-danger');
}

function renderCharts() {
  renderSectorChart();
  renderWeightChart();
}

function renderSectorChart() {
  const map = {};
  holdings.forEach(h => {
    const k = h.sector || 'أخرى';
    map[k] = (map[k] || 0) + h.shares * h.current_price;
  });
  const labels = Object.keys(map);
  const data   = labels.map(k => map[k]);

  if (sectorChart) sectorChart.destroy();
  const ctx = document.getElementById('sectorChart').getContext('2d');
  sectorChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: CHART_COLORS,
        borderColor: '#1c2128',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 10, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + formatSAR(ctx.parsed)
          },
          backgroundColor: '#1c2128', titleColor: '#e6edf3',
          bodyColor: '#8b949e', borderColor: '#30363d', borderWidth: 1,
          titleFont: { family: 'Tajawal' }, bodyFont: { family: 'Tajawal' }
        }
      }
    }
  });
}

function renderWeightChart() {
  const totalValue = holdings.reduce((s, h) => s + h.shares * h.current_price, 0);
  const labels = holdings.map(h => h.ticker);
  const actual  = holdings.map(h => totalValue > 0 ? +(h.shares * h.current_price / totalValue * 100).toFixed(2) : 0);
  const target  = holdings.map(h => parseFloat(h.target_weight) || 0);

  if (weightChart) weightChart.destroy();
  const ctx = document.getElementById('weightChart').getContext('2d');
  weightChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'الوزن الحالي %',   data: actual, backgroundColor: 'rgba(240,180,41,0.75)', borderRadius: 4 },
        { label: 'الوزن المستهدف %', data: target, backgroundColor: 'rgba(63,185,80,0.5)',   borderRadius: 4 }
      ]
    },
    options: {
      ...chartDefaults(),
      plugins: {
        ...chartDefaults().plugins,
        legend: { labels: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 10, usePointStyle: true } }
      }
    }
  });
}

function renderTable() {
  const totalValue = holdings.reduce((s, h) => s + h.shares * h.current_price, 0);
  const tbody = document.getElementById('holdings-tbody');

  if (!holdings.length) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><div class="icon">📋</div><p>لا توجد أسهم بعد، ابدأ بإضافة أول سهم</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = holdings.map(h => {
    const cost   = h.shares * h.avg_price;
    const value  = h.shares * h.current_price;
    const pnl    = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost * 100) : 0;
    const weight = totalValue > 0 ? (value / totalValue * 100) : 0;
    const cls    = pnl >= 0 ? 'text-success' : 'text-danger';

    return `<tr>
      <td><strong class="text-accent">${h.ticker}</strong></td>
      <td>${h.name}</td>
      <td><span class="small text-muted">${h.sector || '—'}</span></td>
      <td class="num">${formatNum(h.shares, 4)}</td>
      <td class="num">${formatSAR(h.avg_price)}</td>
      <td class="num">${formatSAR(h.current_price)}</td>
      <td class="num">${formatSAR(cost)}</td>
      <td class="num bold">${formatSAR(value)}</td>
      <td class="num ${cls}">${formatSAR(pnl, true)}<br><span class="small">${(pnl>=0?'+':'')}${pnlPct.toFixed(2)}%</span></td>
      <td class="num">${weight.toFixed(2)}%</td>
      <td class="num text-muted">${(parseFloat(h.target_weight)||0).toFixed(2)}%</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="openModal('${h.id}')">تعديل</button>
          <button class="btn btn-danger btn-sm" onclick="deleteHolding('${h.id}')">حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openModal(id = null) {
  editingId = id;
  document.getElementById('modal-title').textContent = id ? 'تعديل السهم' : 'إضافة سهم جديد';
  if (id) {
    const h = holdings.find(x => x.id === id);
    if (!h) return;
    document.getElementById('h-ticker').value        = h.ticker;
    document.getElementById('h-name').value          = h.name;
    document.getElementById('h-sector').value        = h.sector || '';
    document.getElementById('h-shares').value        = h.shares;
    document.getElementById('h-avg-price').value     = h.avg_price;
    document.getElementById('h-cur-price').value     = h.current_price;
    document.getElementById('h-target-wt').value     = h.target_weight || '';
  } else {
    document.getElementById('holding-form').reset();
  }
  document.getElementById('holding-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('holding-modal').style.display = 'none';
  editingId = null;
}

async function saveHolding(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();

  const payload = {
    user_id:       user.id,
    ticker:        document.getElementById('h-ticker').value.trim().toUpperCase(),
    name:          document.getElementById('h-name').value.trim(),
    sector:        document.getElementById('h-sector').value.trim(),
    shares:        parseFloat(document.getElementById('h-shares').value) || 0,
    avg_price:     parseFloat(document.getElementById('h-avg-price').value) || 0,
    current_price: parseFloat(document.getElementById('h-cur-price').value) || 0,
    target_weight: parseFloat(document.getElementById('h-target-wt').value) || 0
  };

  let error;
  if (editingId) {
    ({ error } = await supabaseClient.from('holdings').update(payload).eq('id', editingId));
  } else {
    ({ error } = await supabaseClient.from('holdings').insert([payload]));
  }

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editingId ? 'تم تحديث السهم بنجاح' : 'تمت إضافة السهم بنجاح', 'success');
  closeModal();
  await loadHoldings();
  renderStats();
  renderCharts();
  renderTable();
}

async function deleteHolding(id) {
  if (!confirm('هل أنت متأكد من حذف هذا السهم؟')) return;
  const { error } = await supabaseClient.from('holdings').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم حذف السهم', 'success');
  await loadHoldings();
  renderStats();
  renderCharts();
  renderTable();
}

init();
