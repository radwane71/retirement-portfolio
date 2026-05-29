// أهداف الأسهم والقطاعات
let userStocks    = [];
let holdings      = [];
let stockTargets  = {};   // ticker → target_pct
let sectorTargets = {};   // sector → target_pct
let totalValue    = 0;

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-targets');
  await loadAll();
}

async function loadAll() {
  const [usRes, hRes, stRes, secRes] = await Promise.all([
    supabaseClient.from('user_stocks').select('*').order('ticker'),
    supabaseClient.from('holdings').select('*'),
    supabaseClient.from('stock_targets').select('*'),
    supabaseClient.from('sector_targets').select('*'),
  ]);

  userStocks = usRes.data || [];
  holdings   = hRes.data || [];

  // حساب إجمالي قيمة المحفظة
  totalValue = holdings.reduce((s, h) => s + (+h.shares * +h.current_price), 0);

  // بناء خرائط الأهداف
  stockTargets  = {};
  (stRes.data || []).forEach(r => { stockTargets[r.ticker]  = +r.target_pct; });
  sectorTargets = {};
  (secRes.data || []).forEach(r => { sectorTargets[r.sector] = +r.target_pct; });

  renderStockTargets();
  renderSectorTargets();
}

// ── حساب وزن السهم الحالي ──────────────────────────────────
function getStockWeight(ticker) {
  if (!totalValue) return 0;
  const h = holdings.find(x => x.ticker === ticker);
  if (!h) return 0;
  return (+h.shares * +h.current_price) / totalValue * 100;
}

// ── حساب وزن القطاع الحالي ─────────────────────────────────
// المصدر: holdings.sector (ما أدخله المستخدم في لوحة التحكم)
function getSectorWeight(sector) {
  if (!totalValue) return 0;
  let val = 0;
  holdings.forEach(h => {
    const sec = (h.sector || '').trim() || 'غير مصنف';
    if (sec === sector) val += +h.shares * +h.current_price;
  });
  return val / totalValue * 100;
}

// ── تحديد حالة التنبيه ─────────────────────────────────────
function alertStatus(current, target) {
  if (!target) return { cls: '', icon: '—', label: '—' };
  const diff = current - target;
  if (Math.abs(diff) <= 1)  return { cls: 'text-success', icon: '✅', label: 'ضمن الهدف' };
  if (Math.abs(diff) <= 3)  return { cls: 'text-accent',  icon: '⚠️', label: diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`, rowCls: 'alert-row-yellow' };
  return { cls: 'text-danger', icon: '🔴', label: diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`, rowCls: 'alert-row-red' };
}

// ── رسم جدول الأسهم ────────────────────────────────────────
// المصدر: holdings (المحفظة الحالية) + أي أهداف محفوظة لأسهم خرجت
function renderStockTargets() {
  const tbody = document.getElementById('stock-targets-tbody');

  // الأسهم من holdings + أي أسهم لها أهداف محفوظة ولو غير موجودة الآن
  const holdingTickers = new Set(holdings.map(h => h.ticker));
  const savedTargetTickers = Object.keys(stockTargets).filter(t => !holdingTickers.has(t));
  const allStocks = [
    ...holdings.map(h => ({ ticker: h.ticker, name: h.name, sector: (h.sector || '').trim() || 'غير مصنف' })),
    ...savedTargetTickers.map(t => ({ ticker: t, name: t, sector: '—' }))
  ];

  if (!allStocks.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
      <div class="icon">📋</div>
      <p>لا توجد أسهم في المحفظة — أضف معاملات أولاً</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = allStocks.map(s => {
    const target  = stockTargets[s.ticker] || 0;
    const current = getStockWeight(s.ticker);
    const al      = alertStatus(current, target);
    const barPct  = Math.min(current / (target || 1) * 100, 200);
    const barColor = al.cls === 'text-success' ? '#22c55e' : al.cls === 'text-accent' ? '#f0b429' : '#f85149';
    return `<tr class="${al.rowCls || ''}">
      <td><strong class="text-accent">${esc(s.ticker)}</strong></td>
      <td>${esc(s.name)}</td>
      <td class="small text-muted">${esc(s.sector)}</td>
      <td>
        <input class="target-input" type="number" min="0" max="100" step="0.1"
               id="st-${esc(s.ticker)}" value="${target || ''}" placeholder="0">
        <span class="small text-muted"> %</span>
      </td>
      <td class="num bold ${al.cls}">${current.toFixed(2)}%</td>
      <td>
        <div class="pct-bar-wrap" title="${current.toFixed(2)}% من ${target}%">
          <div class="pct-bar" style="width:${Math.min(barPct,100)}%;background:${barColor}"></div>
        </div>
      </td>
      <td class="small ${al.cls}">${al.icon} ${al.label}</td>
    </tr>`;
  }).join('');
}

// ── رسم جدول القطاعات ──────────────────────────────────────
function renderSectorTargets() {
  const tbody = document.getElementById('sector-targets-tbody');

  // القطاعات الظاهرة: من holdings.sector (ما أدخله المستخدم) + أي أهداف محفوظة
  const sectorSet = new Set([
    ...holdings.map(h => (h.sector || '').trim() || 'غير مصنف'),
    ...Object.keys(sectorTargets)
  ]);
  const sectors = [...sectorSet].filter(Boolean).sort();

  if (!sectors.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">🏷️</div><p>لا توجد قطاعات بعد</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = sectors.map(sec => {
    const target  = sectorTargets[sec] || 0;
    const current = getSectorWeight(sec);
    const al      = alertStatus(current, target);
    const barPct  = Math.min(current / (target || 1) * 100, 200);
    const barColor = al.cls === 'text-success' ? '#22c55e' : al.cls === 'text-accent' ? '#f0b429' : '#f85149';
    return `<tr class="${al.rowCls || ''}">
      <td><strong>${esc(sec)}</strong></td>
      <td>
        <input class="target-input" type="number" min="0" max="100" step="0.1"
               id="sec-${esc(sec.replace(/\s/g,'_'))}" value="${target || ''}" placeholder="0">
        <span class="small text-muted"> %</span>
      </td>
      <td class="num bold ${al.cls}">${current.toFixed(2)}%</td>
      <td>
        <div class="pct-bar-wrap">
          <div class="pct-bar" style="width:${Math.min(barPct,100)}%;background:${barColor}"></div>
        </div>
      </td>
      <td class="small ${al.cls}">${al.icon} ${al.label}</td>
    </tr>`;
  }).join('');
}

// ── حفظ أهداف الأسهم ──────────────────────────────────────
async function saveAllTargets() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  // اجمع كل الأسهم (holdings + محفوظة سابقاً)
  const holdingTickers = new Set(holdings.map(h => h.ticker));
  const allTickers = [
    ...holdings.map(h => h.ticker),
    ...Object.keys(stockTargets).filter(t => !holdingTickers.has(t))
  ];

  const rows = allTickers.map(ticker => ({
    user_id:    user.id,
    ticker,
    target_pct: +(document.getElementById('st-' + ticker)?.value || 0)
  }));

  const { error } = await supabaseClient.from('stock_targets')
    .upsert(rows, { onConflict: 'user_id,ticker' });

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }

  // مزامنة: حدّث target_weight في holdings أيضاً (مصدر واحد للحقيقة)
  for (const ticker of holdingTickers) {
    const h = holdings.find(x => x.ticker === ticker);
    if (!h) continue;
    const tw = +(document.getElementById('st-' + ticker)?.value || 0);
    await supabaseClient.from('holdings').update({ target_weight: tw }).eq('id', h.id);
  }

  showToast('تم حفظ أهداف الأسهم ✓', 'success');
  await loadAll();
}

// ── حفظ أهداف القطاعات ────────────────────────────────────
async function saveSectorTargets() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const sectorSet = new Set([
    ...holdings.map(h => (h.sector || '').trim() || 'غير مصنف'),
    ...Object.keys(sectorTargets)
  ]);

  const rows = [...sectorSet].map(sec => ({
    user_id:    user.id,
    sector:     sec,
    target_pct: +(document.getElementById('sec-' + sec.replace(/\s/g,'_'))?.value || 0)
  }));

  const { error } = await supabaseClient.from('sector_targets')
    .upsert(rows, { onConflict: 'user_id,sector' });

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم حفظ أهداف القطاعات ✓', 'success');
  await loadAll();
}

init();
