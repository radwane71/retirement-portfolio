// ─── Storage — Supabase (primary) + localStorage (cache/fallback) ─────────────
const STORE_KEY = 'salary_planner_v1';

function getStore() {
  // قراءة من cache المحلي — يُحدَّث عند init() من Supabase
  try {
    const raw = localStorage.getItem(userLsKey(STORE_KEY)) || localStorage.getItem(STORE_KEY);
    return JSON.parse(raw) || defaultStore();
  } catch { return defaultStore(); }
}

function saveStore(data) {
  store = data;
  // حفظ فوري في localStorage
  try { localStorage.setItem(userLsKey(STORE_KEY), JSON.stringify(data)); } catch {}
  // حفظ غير متزامن في Supabase
  saveUserSetting(STORE_KEY, data).catch(() => {});
}

function defaultStore() {
  return {
    categories: [
      { id: 'cat_expenses',   name: 'مصاريف',        color: '#f85149' },
      { id: 'cat_savings',    name: 'ادخار / طارئ',  color: '#3fb950' },
      { id: 'cat_assets',     name: 'أصول',          color: '#3b82f6' },
      { id: 'cat_retirement', name: 'محفظة التقاعد', color: '#a855f7' },
    ],
    entries: []
  };
}

function uid() { return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

// ─── State ────────────────────────────────────────────────────────────────────
let store     = getStore();
let editingId = null;
let deletingId = null;

// date range filter
let filterFromYear = '', filterFromMonth = '';
let filterToYear   = '', filterToMonth   = '';

// chart instances
let chart1 = null, chart2 = null, chart3 = null, chart4 = null;

// chart modes
let c1Mode = 'stacked', c2Mode = 'donut', c3Mode = 'bars', c4Mode = 'bars';

// chart colours
const CC = ['#f0b429','#3fb950','#3b82f6','#a855f7','#f85149','#06b6d4','#f97316','#ec4899','#84cc16','#8b5cf6'];

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-salary');
  // تحميل من Supabase أولاً للتزامن بين الأجهزة، fallback للـ localStorage
  const remote = await loadUserSetting(STORE_KEY);
  if (remote) {
    store = remote;
    try { localStorage.setItem(userLsKey(STORE_KEY), JSON.stringify(remote)); } catch {}
  } else {
    store = getStore();
  }
  buildYearSelects();
  renderAll();
}

function renderAll() {
  renderDashboard();
  renderCategoryBadges();
  renderCharts();
  renderTable();
}

// ─── Filtered entries (respects date range) ───────────────────────────────────
function getFiltered() {
  return store.entries.filter(e => {
    const ym = e.year * 100 + e.month;
    const from = (filterFromYear && filterFromMonth)
      ? +filterFromYear * 100 + +filterFromMonth : 0;
    const to   = (filterToYear && filterToMonth)
      ? +filterToYear * 100 + +filterToMonth : 999999;
    return ym >= from && ym <= to;
  });
}

// ─── Year selects for date range ──────────────────────────────────────────────
function buildYearSelects() {
  const years = [...new Set(store.entries.map(e => e.year))].sort((a, b) => a - b);
  ['from-year', 'to-year'].forEach(id => {
    const sel = document.getElementById(id);
    const cur = sel.value;
    sel.innerHTML = '<option value="">— سنة</option>' +
      years.map(y => `<option value="${y}" ${y == cur ? 'selected' : ''}>${y}</option>`).join('');
  });
}

function applyDateRange() {
  filterFromYear  = document.getElementById('from-year').value;
  filterFromMonth = document.getElementById('from-month').value;
  filterToYear    = document.getElementById('to-year').value;
  filterToMonth   = document.getElementById('to-month').value;
  renderAll();
}

function clearDateRange() {
  filterFromYear = filterFromMonth = filterToYear = filterToMonth = '';
  ['from-year','from-month','to-year','to-month'].forEach(id => {
    document.getElementById(id).value = '';
  });
  renderAll();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const entries = getFiltered();
  const totalSalary = entries.reduce((s, e) => s + (+e.salary || 0), 0);

  const catTotals = {};
  store.categories.forEach(c => { catTotals[c.id] = 0; });
  entries.forEach(e => {
    (e.allocations || []).forEach(a => {
      catTotals[a.catId] = (catTotals[a.catId] || 0) + (+a.amount || 0);
    });
  });

  const totalAllocated = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const totalRemaining = totalSalary - totalAllocated;

  const label = buildRangeLabel();

  document.getElementById('dash-salary').textContent    = formatSAR(totalSalary);
  document.getElementById('dash-allocated').textContent = formatSAR(totalAllocated);
  document.getElementById('dash-remaining').textContent = formatSAR(totalRemaining);
  document.getElementById('dash-label').textContent     = label;
  document.getElementById('dash-months').textContent    = entries.length + ' شهر';

  const bd = document.getElementById('cat-breakdown');
  bd.innerHTML = store.categories.map(c => {
    const amt = catTotals[c.id] || 0;
    const pct = totalSalary > 0 ? (amt / totalSalary * 100).toFixed(1) : 0;
    return `<div class="dash-cat-card">
      <div class="dash-cat-dot" style="background:${c.color}"></div>
      <div class="dash-cat-info">
        <span class="dash-cat-name">${esc(c.name)}</span>
        <span class="dash-cat-amt">${formatSAR(amt)}</span>
      </div>
      <span class="dash-cat-pct">${pct}%</span>
    </div>`;
  }).join('');
}

function buildRangeLabel() {
  const fy = filterFromYear, fm = filterFromMonth;
  const ty = filterToYear,   tm = filterToMonth;
  if (!fy && !ty) return 'الإجمالي الكلي';
  const fromStr = (fm && fy) ? `${MONTHS_AR[+fm-1]} ${fy}` : (fy || '');
  const toStr   = (tm && ty) ? `${MONTHS_AR[+tm-1]} ${ty}` : (ty || '');
  if (fromStr && toStr) return `${fromStr} — ${toStr}`;
  if (fromStr) return `من ${fromStr}`;
  if (toStr)   return `حتى ${toStr}`;
  return 'الإجمالي الكلي';
}

// ─── Category Management ──────────────────────────────────────────────────────
function renderCategoryBadges() {
  const container = document.getElementById('cat-list');
  container.innerHTML = store.categories.map(c => `
    <div class="cat-badge" style="border-color:${c.color}20;background:${c.color}10">
      <span class="cat-dot" style="background:${c.color}"></span>
      <span class="cat-badge-name" ondblclick="startRenameCategory('${c.id}', this)">${esc(c.name)}</span>
      <button class="cat-del-btn" onclick="confirmDeleteCategory('${c.id}')" title="حذف الفئة">×</button>
    </div>`).join('');
}

function addCategory() {
  const inp  = document.getElementById('new-cat-name');
  const name = inp.value.trim();
  if (!name) { showToast('أدخل اسم الفئة', 'error'); return; }
  if (store.categories.some(c => c.name === name)) { showToast('الفئة موجودة مسبقاً', 'error'); return; }
  const color = CC[store.categories.length % CC.length];
  store.categories.push({ id: uid(), name, color });
  saveStore(store);
  inp.value = '';
  renderCategoryBadges();
  renderDashboard();
  renderCharts();
  renderTable();
}

function startRenameCategory(catId, el) {
  const cat = store.categories.find(c => c.id === catId);
  if (!cat) return;
  const inp = document.createElement('input');
  inp.value = cat.name;
  inp.className = 'cat-rename-input';
  el.replaceWith(inp);
  inp.focus(); inp.select();
  function commit() {
    const n = inp.value.trim();
    if (n && n !== cat.name) { cat.name = n; saveStore(store); renderDashboard(); renderCharts(); renderTable(); }
    renderCategoryBadges();
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') inp.blur();
    if (e.key === 'Escape') { inp.value = cat.name; inp.blur(); }
  });
}

async function confirmDeleteCategory(catId) {
  const cat = store.categories.find(c => c.id === catId);
  if (!cat) return;
  if (!await confirmAsync(`⚠️ حذف فئة "${esc(cat.name)}"؟\nسيتم حذفها من جميع السجلات الشهرية.`)) return;
  store.categories = store.categories.filter(c => c.id !== catId);
  store.entries.forEach(e => {
    e.allocations = (e.allocations || []).filter(a => a.catId !== catId);
  });
  saveStore(store);
  renderCategoryBadges();
  renderDashboard();
  renderCharts();
  renderTable();
  showToast('تم حذف الفئة', 'success');
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function renderCharts() {
  renderChart1();
  renderChart2();
  renderChart3();
  renderChart4();
}

// ── helpers ──
function showCanvas(wrapId, altId) {
  document.getElementById(wrapId).style.display = '';
  document.getElementById(altId).style.display  = 'none';
}
function showAlt(wrapId, altId, html) {
  document.getElementById(wrapId).style.display = 'none';
  const a = document.getElementById(altId);
  a.style.display = '';
  a.innerHTML = html;
}
function destroyChart(ref) { if (ref) { ref.destroy(); } return null; }
function chartDefaults() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, usePointStyle: true, padding: 10 } },
      tooltip: { backgroundColor: '#1c2128', titleColor: '#e6edf3', bodyColor: '#8b949e', borderColor: '#30363d', borderWidth: 1,
        titleFont: { family: 'Tajawal' }, bodyFont: { family: 'Tajawal' } }
    },
    scales: {
      x: { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 10 } }, grid: { color: '#30363d' } },
      y: { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 10 },
        callback: v => formatNum(v, 0) }, grid: { color: '#30363d' } }
    }
  };
}

// sorted entries for charts
function sortedEntries() {
  return getFiltered().slice().sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
}

// ── Chart 1: Salary vs Allocations over time ──────────────────────────────────
function setChart1Mode(m) {
  c1Mode = m;
  ['stacked','line','table'].forEach(x =>
    document.getElementById('c1-' + x)?.classList.toggle('active', x === m));
  renderChart1();
}

function renderChart1() {
  chart1 = destroyChart(chart1);
  const entries = sortedEntries();

  if (c1Mode === 'table') {
    const rows = entries.map(e => {
      const salary    = +e.salary || 0;
      const allocated = (e.allocations||[]).reduce((s,a)=>s+(+a.amount||0),0);
      const rem       = salary - allocated;
      return `<tr>
        <td>${e.year}</td><td>${MONTHS_AR[e.month-1]}</td>
        <td class="num">${formatSAR(salary)}</td>
        <td class="num">${formatSAR(allocated)}</td>
        <td class="num ${rem<0?'neg':rem>0?'pos':''}">${formatSAR(rem)}</td>
      </tr>`;
    }).join('');
    showAlt('c1-canvas-wrap','c1-alt',
      `<div style="overflow-x:auto"><table class="tbl-alt">
        <thead><tr><th>السنة</th><th>الشهر</th><th>الراتب</th><th>الموزّع</th><th>المتبقي</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-2);padding:20px">لا توجد بيانات</td></tr>'}</tbody>
      </table></div>`);
    return;
  }

  if (!entries.length) { showAlt('c1-canvas-wrap','c1-alt','<div style="text-align:center;color:var(--text-2);padding:40px">لا توجد بيانات</div>'); return; }

  showCanvas('c1-canvas-wrap','c1-alt');
  const labels = entries.map(e => `${MONTHS_AR[e.month-1].slice(0,3)} ${String(e.year).slice(2)}`);

  // one dataset per category + remaining
  const catDatasets = store.categories.map((c, i) => ({
    label: c.name,
    data: entries.map(e => {
      const a = (e.allocations||[]).find(x => x.catId === c.id);
      return a ? +a.amount || 0 : 0;
    }),
    backgroundColor: c.color + (c1Mode === 'stacked' ? 'cc' : '99'),
    borderColor: c.color,
    borderWidth: c1Mode === 'line' ? 2 : 0,
    fill: c1Mode === 'line' ? false : true,
    tension: 0.3,
    pointRadius: c1Mode === 'line' ? 3 : 0,
  }));

  const salaryDs = {
    label: 'الراتب',
    data: entries.map(e => +e.salary || 0),
    backgroundColor: '#f0b42933',
    borderColor: '#f0b429',
    borderWidth: 2,
    borderDash: [4, 3],
    type: 'line',
    fill: false,
    tension: 0.3,
    pointRadius: 3,
    order: 0,
  };

  const ctx = document.getElementById('chart1')?.getContext('2d');
  if (!ctx) return;

  const opts = chartDefaults();
  if (c1Mode === 'stacked') {
    opts.scales.x.stacked = true;
    opts.scales.y.stacked = true;
  }
  opts.plugins.tooltip.callbacks = {
    label: c => ` ${c.dataset.label}: ${formatSAR(c.parsed.y ?? c.parsed)}`
  };

  chart1 = new Chart(ctx, {
    type: c1Mode === 'line' ? 'line' : 'bar',
    data: { labels, datasets: [...catDatasets, salaryDs] },
    options: opts
  });
}

// ── Chart 2: Category distribution ───────────────────────────────────────────
function setChart2Mode(m) {
  c2Mode = m;
  ['donut','bars','cards'].forEach(x =>
    document.getElementById('c2-' + x)?.classList.toggle('active', x === m));
  renderChart2();
}

function renderChart2() {
  chart2 = destroyChart(chart2);
  const entries = getFiltered();
  const totalSalary = entries.reduce((s, e) => s + (+e.salary || 0), 0);

  const catData = store.categories.map((c, i) => {
    const amt = entries.reduce((s, e) => {
      const a = (e.allocations||[]).find(x => x.catId === c.id);
      return s + (a ? +a.amount||0 : 0);
    }, 0);
    return { name: c.name, color: c.color, amt };
  }).filter(d => d.amt > 0);

  const totalAmt = catData.reduce((s, d) => s + d.amt, 0);

  if (c2Mode === 'bars') {
    showAlt('c2-canvas-wrap','c2-alt',
      '<div style="padding:8px 4px">' +
      catData.sort((a,b)=>b.amt-a.amt).map(d => {
        const pct = totalAmt > 0 ? (d.amt / totalAmt * 100) : 0;
        return `<div class="bars-alt-row">
          <div class="bars-alt-label" title="${esc(d.name)}">${esc(d.name)}</div>
          <div class="bars-alt-track"><div class="bars-alt-fill" style="width:${pct.toFixed(1)}%;background:${d.color}"></div></div>
          <div class="bars-alt-pct">${pct.toFixed(1)}%</div>
          <div class="bars-alt-val">${formatSAR(d.amt)}</div>
        </div>`;
      }).join('') + '</div>');
    return;
  }

  if (c2Mode === 'cards') {
    showAlt('c2-canvas-wrap','c2-alt',
      `<div class="cards-alt-grid">` +
      catData.sort((a,b)=>b.amt-a.amt).map(d => {
        const pct = totalAmt > 0 ? (d.amt / totalAmt * 100).toFixed(1) : 0;
        return `<div class="cards-alt-item" style="border-top-color:${d.color}">
          <div class="cards-alt-name">${esc(d.name)}</div>
          <div class="cards-alt-val" style="color:${d.color}">${formatSAR(d.amt)}</div>
          <div class="cards-alt-pct">${pct}% من الإجمالي</div>
        </div>`;
      }).join('') + '</div>');
    return;
  }

  // donut
  if (!catData.length) { showAlt('c2-canvas-wrap','c2-alt','<div style="text-align:center;color:var(--text-2);padding:40px">لا توجد بيانات</div>'); return; }
  showCanvas('c2-canvas-wrap','c2-alt');
  const ctx = document.getElementById('chart2')?.getContext('2d');
  if (!ctx) return;
  chart2 = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: catData.map(d => d.name),
      datasets: [{ data: catData.map(d => d.amt), backgroundColor: catData.map(d => d.color), borderColor: '#1c2128', borderWidth: 2, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 10, usePointStyle: true } },
        tooltip: { backgroundColor: '#1c2128', titleColor: '#e6edf3', bodyColor: '#8b949e', borderColor: '#30363d', borderWidth: 1,
          titleFont: { family: 'Tajawal' }, bodyFont: { family: 'Tajawal' },
          callbacks: { label: c => { const pct = totalAmt>0?(c.parsed/totalAmt*100).toFixed(1):0; return ` ${formatSAR(c.parsed)}  (${pct}%)`; } } }
      }
    }
  });
}

// ── Chart 3: Monthly remaining ────────────────────────────────────────────────
function setChart3Mode(m) {
  c3Mode = m;
  ['bars','line','table'].forEach(x =>
    document.getElementById('c3-' + x)?.classList.toggle('active', x === m));
  renderChart3();
}

function renderChart3() {
  chart3 = destroyChart(chart3);
  const entries = sortedEntries();

  if (c3Mode === 'table') {
    const rows = entries.map(e => {
      const rem = (+e.salary||0) - (e.allocations||[]).reduce((s,a)=>s+(+a.amount||0),0);
      return `<tr><td>${e.year}</td><td>${MONTHS_AR[e.month-1]}</td>
        <td class="num ${rem<0?'neg':rem>0?'pos':''}">${formatSAR(rem)}</td></tr>`;
    }).join('');
    showAlt('c3-canvas-wrap','c3-alt',
      `<div style="overflow-x:auto"><table class="tbl-alt">
        <thead><tr><th>السنة</th><th>الشهر</th><th>المتبقي</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" style="text-align:center;color:var(--text-2);padding:20px">لا توجد بيانات</td></tr>'}</tbody>
      </table></div>`);
    return;
  }

  if (!entries.length) { showAlt('c3-canvas-wrap','c3-alt','<div style="text-align:center;color:var(--text-2);padding:40px">لا توجد بيانات</div>'); return; }

  showCanvas('c3-canvas-wrap','c3-alt');
  const labels  = entries.map(e => `${MONTHS_AR[e.month-1].slice(0,3)} ${String(e.year).slice(2)}`);
  const remData = entries.map(e => (+e.salary||0) - (e.allocations||[]).reduce((s,a)=>s+(+a.amount||0),0));
  const colors  = remData.map(v => v >= 0 ? '#3fb950cc' : '#f85149cc');
  const ctx     = document.getElementById('chart3')?.getContext('2d');
  if (!ctx) return;

  const opts = chartDefaults();
  opts.plugins.tooltip.callbacks = { label: c => ` المتبقي: ${formatSAR(c.parsed.y ?? c.parsed)}` };

  chart3 = new Chart(ctx, {
    type: c3Mode === 'line' ? 'line' : 'bar',
    data: {
      labels,
      datasets: [{
        label: 'المتبقي',
        data: remData,
        backgroundColor: c3Mode === 'line' ? '#3fb95033' : colors,
        borderColor: c3Mode === 'line' ? '#3fb950' : colors.map(c => c.slice(0,7)),
        borderWidth: c3Mode === 'line' ? 2 : 0,
        fill: c3Mode === 'line',
        tension: 0.3,
        pointRadius: c3Mode === 'line' ? 3 : 0,
        pointBackgroundColor: '#3fb950',
      }]
    },
    options: opts
  });
}

// ── Chart 4: Annual comparison ────────────────────────────────────────────────
function setChart4Mode(m) {
  c4Mode = m;
  ['bars','cards','table'].forEach(x =>
    document.getElementById('c4-' + x)?.classList.toggle('active', x === m));
  renderChart4();
}

function renderChart4() {
  chart4 = destroyChart(chart4);
  const entries = getFiltered();

  // group by year
  const yearMap = {};
  entries.forEach(e => {
    if (!yearMap[e.year]) yearMap[e.year] = { salary: 0, allocated: 0 };
    yearMap[e.year].salary    += +e.salary || 0;
    yearMap[e.year].allocated += (e.allocations||[]).reduce((s,a)=>s+(+a.amount||0),0);
  });
  const years    = Object.keys(yearMap).sort();
  const salaries = years.map(y => yearMap[y].salary);
  const allocs   = years.map(y => yearMap[y].allocated);
  const rems     = years.map((y,i) => salaries[i] - allocs[i]);

  if (c4Mode === 'table') {
    const rows = years.map((y,i) => `<tr>
      <td>${y}</td>
      <td class="num">${formatSAR(salaries[i])}</td>
      <td class="num">${formatSAR(allocs[i])}</td>
      <td class="num ${rems[i]<0?'neg':rems[i]>0?'pos':''}">${formatSAR(rems[i])}</td>
    </tr>`).join('');
    showAlt('c4-canvas-wrap','c4-alt',
      `<div style="overflow-x:auto"><table class="tbl-alt">
        <thead><tr><th>السنة</th><th>الراتب</th><th>الموزّع</th><th>المتبقي</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--text-2);padding:20px">لا توجد بيانات</td></tr>'}</tbody>
      </table></div>`);
    return;
  }

  if (c4Mode === 'cards') {
    const totalSalary = salaries.reduce((s,v)=>s+v,0);
    showAlt('c4-canvas-wrap','c4-alt',
      `<div class="cards-alt-grid">` +
      years.map((y,i) => {
        const pct = totalSalary>0?(salaries[i]/totalSalary*100).toFixed(1):0;
        const rem = rems[i];
        return `<div class="cards-alt-item" style="border-top-color:${CC[i%CC.length]}">
          <div class="cards-alt-name">${y}</div>
          <div class="cards-alt-val" style="color:${CC[i%CC.length]}">${formatSAR(salaries[i])}</div>
          <div class="cards-alt-pct ${rem<0?'neg':rem>0?'pos':''}">متبقي: ${formatSAR(rem)}</div>
        </div>`;
      }).join('') + '</div>');
    return;
  }

  // bars
  if (!years.length) { showAlt('c4-canvas-wrap','c4-alt','<div style="text-align:center;color:var(--text-2);padding:40px">لا توجد بيانات</div>'); return; }
  showCanvas('c4-canvas-wrap','c4-alt');
  const ctx  = document.getElementById('chart4')?.getContext('2d');
  if (!ctx) return;
  const opts = chartDefaults();
  opts.plugins.tooltip.callbacks = { label: c => ` ${c.dataset.label}: ${formatSAR(c.parsed.y)}` };

  chart4 = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [
        { label: 'الراتب',   data: salaries, backgroundColor: '#f0b42999', borderColor: '#f0b429', borderWidth: 1 },
        { label: 'الموزّع',  data: allocs,   backgroundColor: '#3b82f699', borderColor: '#3b82f6', borderWidth: 1 },
        { label: 'المتبقي',  data: rems,     backgroundColor: rems.map(v=>v>=0?'#3fb95099':'#f8514999'),
          borderColor: rems.map(v=>v>=0?'#3fb950':'#f85149'), borderWidth: 1 }
      ]
    },
    options: opts
  });
}

// ─── Table ────────────────────────────────────────────────────────────────────
function renderTable() {
  const entries = getFiltered()
    .slice().sort((a,b) => a.year!==b.year ? b.year-a.year : b.month-a.month);

  const catCols = store.categories.map(c => `<th style="color:${c.color}">${esc(c.name)}</th>`).join('');
  document.getElementById('salary-thead').innerHTML = `<tr>
    <th>السنة</th><th>الشهر</th><th>الراتب</th>${catCols}<th>المتبقي</th><th>ملاحظات</th><th>إجراءات</th>
  </tr>`;

  if (!entries.length) {
    document.getElementById('salary-tbody').innerHTML =
      `<tr><td colspan="${4+store.categories.length+1}" class="empty-state">لا توجد سجلات</td></tr>`;
    return;
  }

  document.getElementById('salary-tbody').innerHTML = entries.map(e => {
    const salary    = +e.salary || 0;
    const allocated = (e.allocations||[]).reduce((s,a)=>s+(+a.amount||0),0);
    const remaining = salary - allocated;
    const catCells  = store.categories.map(c => {
      const a = (e.allocations||[]).find(x => x.catId === c.id);
      const v = a ? +a.amount : 0;
      return `<td class="num ${v<0?'neg':''}">${v!==0?formatSAR(v):'<span class="text-dim">—</span>'}</td>`;
    }).join('');
    return `<tr>
      <td>${e.year}</td>
      <td>${MONTHS_AR[(+e.month||1)-1]}</td>
      <td class="num">${formatSAR(salary)}</td>
      ${catCells}
      <td class="num ${remaining<0?'neg':remaining>0?'pos':''}">${formatSAR(remaining)}</td>
      <td class="notes-cell" style="text-align:center">${e.notes && e.notes.trim() ? `<button class="notes-badge" data-note="${esc(e.notes)}" onclick="showNotePopup(this)" title="عرض الملاحظة">💬</button>` : ''}</td>
      <td class="actions-cell">
        <button class="btn-icon" onclick="openEditModal('${e.id}')" title="تعديل">✏️</button>
        <button class="btn-icon danger" onclick="confirmDelete('${e.id}')" title="حذف">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  const today = new Date();
  document.getElementById('modal-title').textContent = 'إضافة سجل جديد';
  document.getElementById('entry-year').value   = today.getFullYear();
  document.getElementById('entry-month').value  = today.getMonth() + 1;
  document.getElementById('entry-salary').value = '';
  document.getElementById('entry-notes').value  = '';
  buildAllocationsForm([]);
  document.getElementById('entry-modal').classList.add('open');
  document.getElementById('entry-salary').focus();
}

function openEditModal(id) {
  const entry = store.entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'تعديل سجل';
  document.getElementById('entry-year').value   = entry.year;
  document.getElementById('entry-month').value  = entry.month;
  document.getElementById('entry-salary').value = entry.salary;
  document.getElementById('entry-notes').value  = entry.notes || '';
  buildAllocationsForm(entry.allocations || []);
  document.getElementById('entry-modal').classList.add('open');
}

function buildAllocationsForm(existing) {
  const container = document.getElementById('allocations-form');
  container.innerHTML = store.categories.map(c => {
    const a   = existing.find(x => x.catId === c.id);
    const val = a ? a.amount : '';
    return `<div class="alloc-row">
      <label class="alloc-label">
        <span class="cat-dot" style="background:${c.color}"></span>${esc(c.name)}
      </label>
      <input type="number" class="alloc-input" data-cat="${c.id}"
        value="${val}" placeholder="0" min="0" step="0.01">
    </div>`;
  }).join('');

  const salaryInp = document.getElementById('entry-salary');
  function updateRemaining() {
    const salary    = parseFloat(salaryInp.value) || 0;
    const allocated = [...container.querySelectorAll('.alloc-input')]
      .reduce((s, inp) => s + (parseFloat(inp.value) || 0), 0);
    const rem = salary - allocated;
    const el  = document.getElementById('modal-remaining');
    el.textContent = 'المتبقي: ' + formatSAR(rem);
    el.className   = 'modal-remaining ' + (rem < 0 ? 'neg' : rem > 0 ? 'pos' : '');
  }
  salaryInp.addEventListener('input', updateRemaining);
  container.addEventListener('input', updateRemaining);
  updateRemaining();
}

function closeModal() {
  document.getElementById('entry-modal').classList.remove('open');
  editingId = null;
}

function saveEntry() {
  const year   = parseInt(document.getElementById('entry-year').value);
  const month  = parseInt(document.getElementById('entry-month').value);
  const salary = parseFloat(document.getElementById('entry-salary').value);
  const notes  = document.getElementById('entry-notes').value.trim();

  if (!year || !month || isNaN(salary)) {
    showToast('يرجى إدخال السنة والشهر والراتب', 'error'); return;
  }
  const duplicate = store.entries.find(e => e.year===year && e.month===month && e.id!==editingId);
  if (duplicate) { showToast(`يوجد سجل لـ ${MONTHS_AR[month-1]} ${year} مسبقاً`, 'error'); return; }

  const allocations = [...document.querySelectorAll('.alloc-input')]
    .map(inp => ({ catId: inp.dataset.cat, amount: parseFloat(inp.value) || 0 }))
    .filter(a => a.amount !== 0);

  if (editingId) {
    Object.assign(store.entries.find(e => e.id === editingId), { year, month, salary, notes, allocations });
    showToast('تم تحديث السجل', 'success');
  } else {
    store.entries.push({ id: uid(), year, month, salary, notes, allocations });
    showToast('تم إضافة السجل', 'success');
  }
  saveStore(store);
  closeModal();
  buildYearSelects();
  renderAll();
}

// ─── Delete Single ────────────────────────────────────────────────────────────
function confirmDelete(id) {
  const entry = store.entries.find(e => e.id === id);
  if (!entry) return;
  const monthName = MONTHS_AR[(+entry.month||1)-1];
  document.getElementById('delete-msg').textContent =
    `هل أنت متأكد من حذف سجل ${monthName} ${entry.year}؟\nلا يمكن التراجع عن هذا الإجراء.`;
  deletingId = id;
  document.getElementById('delete-modal').classList.add('open');
}
function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('open');
  deletingId = null;
}
function executeDelete() {
  if (!deletingId) return;
  store.entries = store.entries.filter(e => e.id !== deletingId);
  saveStore(store);
  closeDeleteModal();
  buildYearSelects();
  renderAll();
  showToast('تم حذف السجل', 'success');
}

// ─── Reset All ────────────────────────────────────────────────────────────────
function openResetModal()  { document.getElementById('reset-modal').classList.add('open'); }
function closeResetModal() { document.getElementById('reset-modal').classList.remove('open'); }
function executeReset() {
  store.entries = [];
  saveStore(store);
  closeResetModal();
  buildYearSelects();
  renderAll();
  showToast('تم حذف جميع السجلات', 'success');
}

// ─── CSV Import ───────────────────────────────────────────────────────────────
function triggerImport() { document.getElementById('csv-file-input').click(); }

function onCSVFileSelected(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => parseAndImportCSV(e.target.result);
  reader.readAsText(file, 'UTF-8');
  evt.target.value = '';
}

// ── Parse a numeric string — strips thousands commas, keeps minus & decimal ───
function parseNum(str) {
  if (!str) return 0;
  // remove Arabic-locale thousands separator (comma) but keep decimal point
  const cleaned = String(str).replace(/\r/g, '').replace(/[^0-9.\-]/g, '');
  return parseFloat(cleaned) || 0;
}

// ── Resolve month: accepts number (1-12) OR Arabic name ──────────────────────
function resolveMonth(str) {
  if (!str) return 0;
  const s = str.trim().replace(/\r/g, '');
  const n = parseInt(s);
  if (!isNaN(n) && n >= 1 && n <= 12) return n;
  const idx = MONTHS_AR.indexOf(s);
  return idx >= 0 ? idx + 1 : 0;
}

// ── Full CSV text → array of rows (handles multi-line quoted fields) ──────────
function parseCSVRows(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  // Normalize line endings
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') {
        if (t[i + 1] === '"') { cur += '"'; i++; }   // escaped quote
        else inQ = false;                              // closing quote
      } else {
        cur += ch;  // newlines inside quotes are kept as part of the field
      }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
      else { cur += ch; }
    }
  }
  // Last field / row
  if (cur || row.length) { row.push(cur); rows.push(row); }
  // Drop empty trailing row
  if (rows.length && rows[rows.length - 1].every(c => c.trim() === '')) rows.pop();
  return rows;
}

function parseAndImportCSV(text) {
  // Use multi-line-aware row parser instead of naive split('\n')
  const lines = parseCSVRows(text);

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].some(c => c.includes('السنة')) && lines[i].some(c => c.includes('الشهر'))) {
      headerIdx = i; break;
    }
  }
  if (headerIdx < 0) { showToast('لم يتم التعرف على تنسيق الملف', 'error'); return; }

  const header    = lines[headerIdx];
  const colYear   = header.findIndex(c => c.includes('السنة'));
  const colMonth  = header.findIndex((c, i) => c.includes('الشهر') && i > colYear);
  const colSalary = header.findIndex(c => c.includes('الراتب'));
  const colRemaining = header.findIndex(c => c.includes('المتبقي'));
  const colNotes     = header.findIndex(c => c.includes('ملاحظات'));

  if (colYear < 0 || colMonth < 0 || colSalary < 0) {
    showToast('تعذّر العثور على أعمدة السنة / الشهر / الراتب', 'error'); return;
  }

  const allColEnd = colRemaining > 0 ? colRemaining : header.length - 2;
  const allocCols = [];
  for (let c = colSalary + 1; c < allColEnd; c++) {
    let name = '';
    for (let row = headerIdx; row >= Math.max(0, headerIdx - 3); row--) {
      const val = (lines[row][c] || '').trim().replace(/\r/g, '');
      if (val) { name = val; break; }
    }
    if (name) allocCols.push({ col: c, name });
  }

  allocCols.forEach(ac => {
    if (!store.categories.find(c => c.name === ac.name)) {
      store.categories.push({ id: uid(), name: ac.name, color: CC[store.categories.length % CC.length] });
    }
  });

  let imported = 0, skipped = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row   = lines[i];
    const year  = parseInt((row[colYear] || '').replace(/[^0-9]/g, ''));
    const month = resolveMonth(row[colMonth]);
    if (!year || !month) continue;
    const salary = parseNum(row[colSalary]);
    const notes  = colNotes >= 0 ? (row[colNotes] || '').trim().replace(/\r/g, '') : '';
    if (store.entries.find(e => e.year === year && e.month === month)) { skipped++; continue; }
    const allocations = allocCols.map(ac => {
      const cat = store.categories.find(c => c.name === ac.name);
      const amt = parseNum(row[ac.col]);
      return { catId: cat.id, amount: amt };
    }).filter(a => a.amount !== 0);
    store.entries.push({ id: uid(), year, month, salary, notes, allocations });
    imported++;
  }

  saveStore(store);
  buildYearSelects();
  renderAll();
  showToast(`تم استيراد ${imported} سجل${skipped ? ` (تم تخطي ${skipped} مكرر)` : ''}`, 'success');
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV() {
  const entries = getFiltered()
    .slice().sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  if (!entries.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }

  const catNames = store.categories.map(c => c.name);
  const headers  = ['السنة', 'الشهر', 'الراتب', ...catNames, 'المتبقي', 'ملاحظات'];

  const rows = entries.map(e => {
    const salary   = +e.salary || 0;
    const catAmts  = store.categories.map(c => {
      const a = (e.allocations || []).find(x => x.catId === c.id);
      return a ? (+a.amount || 0) : 0;
    });
    const allocated = catAmts.reduce((s, v) => s + v, 0);
    const remaining = salary - allocated;
    const monthName = MONTHS_AR[(+e.month || 1) - 1];
    // Numbers written as plain decimals (no thousands commas) so re-import works cleanly
    return [e.year, monthName, salary, ...catAmts, remaining, e.notes || ''];
  });

  // Escape helper: text fields get quoted, numbers stay bare to avoid comma confusion
  function csvCell(v) {
    if (typeof v === 'number') return String(v);          // plain number, no quotes
    return `"${String(v).replace(/"/g, '""')}"`;          // text quoted, inner " escaped
  }

  const csvContent = [headers, ...rows]
    .map(r => r.map(csvCell).join(','))
    .join('\n');

  // BOM for Excel Arabic UTF-8 support
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `salary_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`تم تصدير ${entries.length} سجل`, 'success');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeDeleteModal(); closeResetModal(); }
});
