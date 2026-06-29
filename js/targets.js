// أهداف الأسهم والقطاعات
let userStocks    = [];
let holdings      = [];
let stockTargets  = {};   // ticker → target_pct
let stockZones    = {};   // ticker → { entry_price, exit_price }
let sectorTargets = {};   // sector → target_pct
let taskMap       = {};   // ticker → latest active task
let taskZonesMap  = {};   // ticker → { accumulate_at, trim_from, liquidate_above }
let totalValue    = 0;
// آخر تقييم عادل لكل رمز من سجل حاسبة القيمة العادلة (valuation_history_v1)
// ticker → { fairValueAvg, fairValueRange, marginText, models, date, companyType }
let valuationLatest = {};

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'stock-targets': {
    title: '📌 أهداف الأسهم الفردية',
    body: `
      <p>«الهدف» هو النسبة التي تريد أن يمثّلها كل سهم من محفظتك. تحديدها مسبقاً يحميك من الانسياق العاطفي ويجعل قراراتك منهجية.</p>
      <div class="info-formula">الوزن الحالي = (أسهمك × السعر الحالي) ÷ إجمالي قيمة المحفظة × 100</div>
      <div class="info-math">
        • <strong>منطقة الشراء ≤:</strong> سعر تعتبره مناسباً للتجميع.<br>
        • <strong>منطقة البيع ≥:</strong> سعر تفكّر عنده في جني الأرباح.<br>
        • <strong>الحالة:</strong> ✅ ضمن الهدف · ⚠️ انحراف بسيط · 🔴 انحراف كبير يستدعي إعادة توازن.
      </div>
      <p class="info-note">💡 اجعل مجموع الأهداف ≈ 100%. السهم الذي يتجاوز هدفه كثيراً = تركّز مخاطرة؛ استخدم محرك إعادة التوازن في الأسفل.</p>`
  },
  'sector-targets': {
    title: '🏷️ أهداف القطاعات',
    body: `
      <p>كما توزّع أهدافاً للأسهم، توزّعها للقطاعات (بنوك، طاقة، اتصالات…) حتى لا تتركّز ثروتك في قطاع واحد ينهار معاً عند أزمة.</p>
      <div class="info-formula">وزن القطاع الحالي = مجموع قيمة أسهم القطاع ÷ إجمالي المحفظة × 100</div>
      <p class="info-note">💡 السوق السعودي قطاعاته محدودة؛ توزيع معقول على 4–6 قطاعات يكفي لتنويع جيّد دون تشتّت.</p>`
  },
};

// ── حالة الترتيب لجدول الأسهم ──────────────────────────────────
let _stSortField = '';    // الحقل المُرتَّب حالياً
let _stSortDir   = 'asc';

// ── حالة الترتيب لجدول القطاعات ────────────────────────────────
let _secSortField = '';
let _secSortDir   = 'asc';

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-targets');
  await loadAll();
}

async function loadAll() {
  const [usRes, hRes, stRes, secRes, taskRes] = await Promise.all([
    supabaseClient.from('user_stocks').select('*').order('ticker'),
    supabaseClient.from('holdings').select('*'),
    supabaseClient.from('stock_targets').select('*'),
    supabaseClient.from('sector_targets').select('*'),
    supabaseClient.from('portfolio_tasks').select('type,ticker,status,accumulate_at,trim_from,liquidate_above').eq('status','active'),
  ]);

  userStocks = usRes.data || [];
  holdings   = hRes.data || [];

  // حساب إجمالي قيمة المحفظة
  totalValue = holdings.reduce((s, h) => s + (+h.shares * +h.current_price), 0);

  // بناء خرائط الأهداف
  stockTargets  = {};
  stockZones    = {};
  (stRes.data || []).forEach(r => {
    stockTargets[r.ticker] = +r.target_pct;
    stockZones[r.ticker]   = { entry_price: r.entry_price ?? null, exit_price: r.exit_price ?? null };
  });
  sectorTargets = {};
  (secRes.data || []).forEach(r => { sectorTargets[r.sector] = +r.target_pct; });

  // آخر مهمة فعّالة لكل رمز (أول مهمة نصادفها من الأحدث)
  taskMap      = {};
  taskZonesMap = {};
  (taskRes.data || []).forEach(t => {
    if (!t.ticker) return;
    if (!taskMap[t.ticker]) taskMap[t.ticker] = t.type;
    if (!taskZonesMap[t.ticker]) taskZonesMap[t.ticker] = {
      accumulate_at:   t.accumulate_at   ?? null,
      trim_from:       t.trim_from       ?? null,
      liquidate_above: t.liquidate_above ?? null,
    };
  });

  // تحديث stockZones من portfolio_tasks لضمان دقة محرك إعادة التوازن
  Object.entries(taskZonesMap).forEach(([ticker, tz]) => {
    if (!stockZones[ticker]) stockZones[ticker] = {};
    if (tz.accumulate_at)   stockZones[ticker].entry_price = tz.accumulate_at;
    if (tz.liquidate_above) stockZones[ticker].exit_price  = tz.liquidate_above;
  });

  // ── سجل حاسبة القيمة العادلة: آخر تقييم لكل رمز ──
  // المصدر نفسه الذي تحفظ فيه صفحة حاسبة القيمة العادلة سجلّها (user_settings).
  // السجل مرتّب بالأحدث أولاً (unshift)، فأول عملية نصادفها لكل رمز هي الأحدث.
  valuationLatest = {};
  try {
    const hist = await loadUserSetting('valuation_history_v1');
    if (Array.isArray(hist)) {
      hist.forEach(e => {
        const tk = (e?.inputs?.ticker || '').toUpperCase().trim();
        if (!tk || valuationLatest[tk]) return;          // أبقِ الأحدث فقط
        const res = e.results || {};
        valuationLatest[tk] = {
          fairValueAvg:   (res.fairValueAvg != null && isFinite(+res.fairValueAvg)) ? +res.fairValueAvg : null,
          fairValueRange: res.fairValueRange || null,
          marginText:     res.marginText || '',
          models:         Array.isArray(res.models) ? res.models : [],
          date:           e.date || '',
          companyType:    e.inputs?.companyType || 'normal',
        };
      });
    }
  } catch (_) { /* الشبكة/الصلاحيات — نكمل بلا تقييم */ }

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
function getAlertThresholds() {
  return {
    green:  +(localStorage.getItem(userLsKey('tharwa-alert-green'))  ?? localStorage.getItem('tharwa-alert-green')  ?? 1),
    yellow: +(localStorage.getItem(userLsKey('tharwa-alert-yellow')) ?? localStorage.getItem('tharwa-alert-yellow') ?? 3),
  };
}

function alertStatus(current, target) {
  if (!target) return { cls: '', icon: '—', label: '—' };
  const diff = current - target;
  const { green, yellow } = getAlertThresholds();
  if (Math.abs(diff) <= green)  return { cls: 'text-success', icon: '✅', label: 'ضمن الهدف' };
  if (Math.abs(diff) <= yellow) return { cls: 'text-accent',  icon: '⚠️', label: diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`, rowCls: 'alert-row-yellow' };
  return { cls: 'text-danger', icon: '🔴', label: diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`, rowCls: 'alert-row-red' };
}

// ── حساب ومراقبة إجمالي أهداف الأسهم ──────────────────────
function updateStockTotal() {
  let sum = 0;
  document.querySelectorAll('#stock-targets-tbody .target-input')
    .forEach(inp => { sum += +(inp.value) || 0; });

  const totalEl = document.getElementById('stock-total-pct');
  const barEl   = document.getElementById('stock-total-bar');
  const msgEl   = document.getElementById('stock-total-msg');
  if (!totalEl) return;

  totalEl.textContent = sum.toFixed(1) + '%';
  const capped = Math.min(sum, 100);
  if (barEl) barEl.style.width = capped + '%';

  if (sum > 100) {
    totalEl.className = 'bold text-danger';
    if (barEl) barEl.style.background = 'var(--danger)';
    if (msgEl) { msgEl.textContent = `⛔ تجاوزت 100% بمقدار ${(sum-100).toFixed(1)}% — يجب التعديل قبل الحفظ`; msgEl.className = 'total-msg total-msg-error'; }
  } else if (sum >= 99.9) {
    totalEl.className = 'bold text-success';
    if (barEl) barEl.style.background = 'var(--success)';
    if (msgEl) { msgEl.textContent = '✅ ممتاز — الأهداف موزعة على 100%'; msgEl.className = 'total-msg total-msg-ok'; }
  } else {
    totalEl.className = 'bold text-accent';
    if (barEl) barEl.style.background = 'var(--accent)';
    if (msgEl) { msgEl.textContent = `⚠️ تبقى ${(100-sum).toFixed(1)}% غير موزعة — يمكن الحفظ لكن التوزيع غير مكتمل`; msgEl.className = 'total-msg total-msg-warn'; }
  }
}

function updateStockTargetSumInFooter() {
  let sum = 0;
  document.querySelectorAll('#stock-targets-tbody .target-input')
    .forEach(inp => { sum += +(inp.value) || 0; });
  const el = document.getElementById('stock-target-sum');
  if (el) {
    el.textContent = sum.toFixed(1) + '%';
    el.className = sum > 100 ? 'text-danger bold' : sum >= 99.9 ? 'text-success bold' : 'text-accent bold';
  }
}

function attachStockListeners() {
  document.querySelectorAll('#stock-targets-tbody .target-input').forEach(inp => {
    inp.addEventListener('input', () => {
      let v = +(inp.value);
      if (v < 0)   { inp.value = 0;   v = 0; }
      if (v > 100) { inp.value = 100; v = 100; }
      updateStockTotal();
      updateStockTargetSumInFooter();
    });
  });
  updateStockTotal();
  updateStockTargetSumInFooter();
}

// ── حساب ومراقبة إجمالي أهداف القطاعات ────────────────────
function updateSectorTotal() {
  let sum = 0;
  document.querySelectorAll('#sector-targets-tbody .target-input')
    .forEach(inp => { sum += +(inp.value) || 0; });

  const totalEl = document.getElementById('sector-total-pct');
  const barEl   = document.getElementById('sector-total-bar');
  const msgEl   = document.getElementById('sector-total-msg');
  if (!totalEl) return;

  totalEl.textContent = sum.toFixed(1) + '%';
  const capped = Math.min(sum, 100);
  if (barEl) barEl.style.width = capped + '%';

  if (sum > 100) {
    totalEl.className = 'bold text-danger';
    if (barEl) barEl.style.background = 'var(--danger)';
    if (msgEl) { msgEl.textContent = `⛔ تجاوزت 100% بمقدار ${(sum-100).toFixed(1)}% — يجب التعديل قبل الحفظ`; msgEl.className = 'total-msg total-msg-error'; }
  } else if (sum >= 99.9) {
    totalEl.className = 'bold text-success';
    if (barEl) barEl.style.background = 'var(--success)';
    if (msgEl) { msgEl.textContent = '✅ ممتاز — الأهداف موزعة على 100%'; msgEl.className = 'total-msg total-msg-ok'; }
  } else {
    totalEl.className = 'bold text-accent';
    if (barEl) barEl.style.background = 'var(--accent)';
    if (msgEl) { msgEl.textContent = `⚠️ تبقى ${(100-sum).toFixed(1)}% غير موزعة — يمكن الحفظ لكن التوزيع غير مكتمل`; msgEl.className = 'total-msg total-msg-warn'; }
  }
}

function updateSectorTargetSumInFooter() {
  let sum = 0;
  document.querySelectorAll('#sector-targets-tbody .target-input')
    .forEach(inp => { sum += +(inp.value) || 0; });
  const el = document.getElementById('sector-target-sum');
  if (el) {
    el.textContent = sum.toFixed(1) + '%';
    el.className = sum > 100 ? 'text-danger bold' : sum >= 99.9 ? 'text-success bold' : 'text-accent bold';
  }
}

function attachSectorListeners() {
  document.querySelectorAll('#sector-targets-tbody .target-input').forEach(inp => {
    inp.addEventListener('input', () => {
      let v = +(inp.value);
      if (v < 0)   { inp.value = 0;   v = 0; }
      if (v > 100) { inp.value = 100; v = 100; }
      updateSectorTotal();
      updateSectorTargetSumInFooter();
    });
  });
  updateSectorTotal();
  updateSectorTargetSumInFooter();
}

// ── badge المهمة ─────────────────────────────────────────────
const TASK_BADGE = {
  liquidation:  { label: 'تصفية',    icon: '🔴', style: 'background:rgba(248,81,73,0.15);color:#f85149' },
  reduction:    { label: 'تخفيف',    icon: '⚖️', style: 'background:rgba(240,180,41,0.15);color:#f0b429' },
  monitoring:   { label: 'مراقبة',   icon: '👁️', style: 'background:rgba(139,148,158,0.15);color:#8b949e' },
  accumulation: { label: 'تجميع',    icon: '🟢', style: 'background:rgba(63,185,80,0.15);color:#3fb950'  },
  hold:         { label: 'احتفاظ',   icon: '🔵', style: 'background:rgba(59,130,246,0.15);color:#3b82f6'  },
};

function taskBadgeHtml(ticker) {
  const type = taskMap[ticker];
  if (!type) return '<span class="small text-muted">—</span>';
  const b = TASK_BADGE[type] || {};
  return `<span class="task-badge" style="${b.style||''}" title="مهمة فعّالة: ${b.label||type}">${b.icon} ${b.label||type}</span>`;
}

// ── ترتيب جدول الأسهم ──────────────────────────────────────
function sortStockTargets(field) {
  if (_stSortField === field) _stSortDir = _stSortDir === 'asc' ? 'desc' : 'asc';
  else { _stSortField = field; _stSortDir = 'asc'; }
  renderStockTargets();
}

function _stArrow(field) {
  if (_stSortField !== field) return '<span class="sort-arrow">↕</span>';
  return `<span class="sort-arrow active">${_stSortDir === 'asc' ? '↑' : '↓'}</span>`;
}

// ── ترتيب جدول القطاعات ────────────────────────────────────
function sortSectorTargets(field) {
  if (_secSortField === field) _secSortDir = _secSortDir === 'asc' ? 'desc' : 'asc';
  else { _secSortField = field; _secSortDir = 'asc'; }
  renderSectorTargets();
}

function _secArrow(field) {
  if (_secSortField !== field) return '<span class="sort-arrow">↕</span>';
  return `<span class="sort-arrow active">${_secSortDir === 'asc' ? '↑' : '↓'}</span>`;
}

// ── رسم جدول الأسهم ────────────────────────────────────────
// المصدر: holdings (المحفظة الحالية) + كل user_stocks غير الموجودة (مخطط لها)
function renderStockTargets() {
  const tbody = document.getElementById('stock-targets-tbody');

  const userStockMap = {};
  userStocks.forEach(s => { userStockMap[s.ticker] = s; });

  const holdingTickers = new Set(holdings.map(h => h.ticker));

  // الأسهم الموجودة فعلاً في المحفظة
  const activeStocks = holdings.map(h => ({
    ticker:  h.ticker,
    name:    h.name,
    sector:  (h.sector || '').trim() || 'غير مصنف',
    planned: false,
  }));

  // أسهم user_stocks غير الموجودة في holdings → مخططة
  const plannedStocks = userStocks
    .filter(s => !holdingTickers.has(s.ticker))
    .map(s => ({
      ticker:  s.ticker,
      name:    s.name,
      sector:  s.sector || '—',
      planned: true,
    }));

  let allStocks = [...activeStocks, ...plannedStocks];

  // ── تطبيق الترتيب ─────────────────────────────────────────
  if (_stSortField) {
    allStocks = [...allStocks].sort((a, b) => {
      let av, bv;
      const aZone = stockZones[a.ticker] || {};
      const bZone = stockZones[b.ticker] || {};
      switch (_stSortField) {
        case 'ticker':  av = a.ticker;  bv = b.ticker;  break;
        case 'name':    av = a.name;    bv = b.name;    break;
        case 'sector':  av = a.sector;  bv = b.sector;  break;
        case 'entry':   av = +(taskZonesMap[a.ticker]?.accumulate_at||0);   bv = +(taskZonesMap[b.ticker]?.accumulate_at||0);   break;
        case 'trim':    av = +(taskZonesMap[a.ticker]?.trim_from||0);       bv = +(taskZonesMap[b.ticker]?.trim_from||0);       break;
        case 'exit':    av = +(taskZonesMap[a.ticker]?.liquidate_above||0); bv = +(taskZonesMap[b.ticker]?.liquidate_above||0); break;
        case 'target':  av = stockTargets[a.ticker]||0; bv = stockTargets[b.ticker]||0; break;
        case 'current': av = getStockWeight(a.ticker); bv = getStockWeight(b.ticker); break;
        case 'status': {
          const al = alertStatus(getStockWeight(a.ticker), stockTargets[a.ticker]||0);
          const bl = alertStatus(getStockWeight(b.ticker), stockTargets[b.ticker]||0);
          av = al.cls; bv = bl.cls; break;
        }
        default: av = a.ticker; bv = b.ticker;
      }
      const cmp = typeof av === 'number'
        ? av - bv
        : String(av||'').localeCompare(String(bv||''));
      return _stSortDir === 'asc' ? cmp : -cmp;
    });
  }

  if (!allStocks.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">
      <div class="icon">📋</div>
      <p>لا توجد أسهم — أضف معاملات أو أضف أسهماً لـ<a href="userdb.html" style="color:var(--accent)">قاعدة بياناتك</a></p>
    </div></td></tr>`;
    return;
  }

  // الإجمالي الحالي من الأسهم الفعلية فقط (المخطط = 0)
  const totalCurrentPct = activeStocks.reduce((s, st) => s + getStockWeight(st.ticker), 0);

  tbody.innerHTML = allStocks.map(s => {
    const target   = stockTargets[s.ticker] || 0;
    const tz       = taskZonesMap[s.ticker] || {};
    const current  = getStockWeight(s.ticker);   // 0 للمخطط
    const al       = s.planned ? { cls: 'text-muted', icon: '📌', label: 'مخطط', rowCls: 'planned-row' }
                                : alertStatus(current, target);
    const barPct   = s.planned ? 0 : Math.min(current / (target || 1) * 100, 200);
    const barColor = al.cls === 'text-success' ? '#22c55e' : al.cls === 'text-accent' ? '#f0b429' : '#f85149';

    const fmtZone = v => v ? `<span class="num small">${formatSAR(v)}</span>` : `<span class="text-muted small">—</span>`;

    return `<tr class="${al.rowCls || ''}">
      <td>${taskBadgeHtml(s.ticker)}</td>
      <td><strong class="text-accent">${esc(s.ticker)}</strong></td>
      <td>${esc(s.name)}</td>
      <td class="small text-muted">${esc(s.sector)}</td>
      <td>${fmtZone(tz.accumulate_at)}</td>
      <td style="color:var(--accent)">${fmtZone(tz.trim_from)}</td>
      <td>${fmtZone(tz.liquidate_above)}</td>
      <td>
        <input class="target-input" type="number" min="0" max="100" step="0.1"
               id="st-${esc(s.ticker)}" value="${target || ''}" placeholder="0">
        <span class="small text-muted"> %</span>
      </td>
      <td class="num bold ${al.cls}">${s.planned ? '<span class="small">مخطط</span>' : current.toFixed(2) + '%'}</td>
      <td>
        ${s.planned ? '<span class="small text-muted">—</span>' : `<div class="pct-bar-wrap" title="${current.toFixed(2)}% من ${target}%">
          <div class="pct-bar" style="width:${Math.min(barPct,100)}%;background:${barColor}"></div>
        </div>`}
      </td>
      <td class="small ${al.cls}">${al.icon} ${al.label}</td>
    </tr>`;
  }).join('');

  // صف الإجمالي
  const currCls = Math.abs(totalCurrentPct - 100) < 0.5 ? 'text-success' : 'text-accent';
  const tfoot = tbody.closest('table').querySelector('tfoot') || tbody.closest('table').createTFoot();
  tfoot.innerHTML = `<tr style="border-top:2px solid var(--border);background:var(--bg-3)">
    <td></td>
    <td colspan="3"><strong class="small">إجمالي الأوزان الحالية</strong></td>
    <td colspan="3"></td>
    <td class="small text-muted">الهدف الإجمالي: <span id="stock-target-sum">—</span></td>
    <td class="num bold ${currCls}">${totalCurrentPct.toFixed(2)}%</td>
    <td colspan="2"><span class="small text-muted">${Math.abs(totalCurrentPct - 100) < 0.1 ? '✅ يساوي 100%' : Math.abs(totalCurrentPct - 100) < 1 ? '≈ 100%' : totalCurrentPct < 100 ? 'بقي ' + (100 - totalCurrentPct).toFixed(2) + '%' : 'تجاوز بـ ' + (totalCurrentPct - 100).toFixed(2) + '%'}</span></td>
  </tr>`;

  // تحديث سهام الترتيب في الهيدر
  ['ticker','name','sector','entry','trim','exit','target','current','status'].forEach(f => {
    const el = document.getElementById('st-arr-' + f);
    if (el) el.outerHTML = _stArrow(f).replace('class="sort-arrow', `id="st-arr-${f}" class="sort-arrow`);
  });

  attachStockListeners();
  updateStockTargetSumInFooter();
}

// ── رسم جدول القطاعات ──────────────────────────────────────
function renderSectorTargets() {
  const tbody = document.getElementById('sector-targets-tbody');

  // القطاعات الظاهرة: من holdings.sector (ما أدخله المستخدم) + أي أهداف محفوظة
  const sectorSet = new Set([
    ...holdings.map(h => (h.sector || '').trim() || 'غير مصنف'),
    ...Object.keys(sectorTargets)
  ]);
  let sectors = [...sectorSet].filter(Boolean);

  // ── ترتيب القطاعات ────────────────────────────────────────
  if (_secSortField) {
    sectors = sectors.sort((a, b) => {
      let av, bv;
      switch (_secSortField) {
        case 'sector':  av = a;                   bv = b;                   break;
        case 'target':  av = sectorTargets[a]||0; bv = sectorTargets[b]||0; break;
        case 'current': av = getSectorWeight(a);  bv = getSectorWeight(b);  break;
        case 'status': {
          const al = alertStatus(getSectorWeight(a), sectorTargets[a]||0);
          const bl = alertStatus(getSectorWeight(b), sectorTargets[b]||0);
          av = al.cls; bv = bl.cls; break;
        }
        default: av = a; bv = b;
      }
      const cmp = typeof av === 'number' ? av - bv : String(av||'').localeCompare(String(bv||''));
      return _secSortDir === 'asc' ? cmp : -cmp;
    });
  } else {
    sectors = sectors.sort(); // الافتراضي: أبجدي
  }

  if (!sectors.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">🏷️</div><p>لا توجد قطاعات بعد</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = sectors.map(sec => {
    const target       = sectorTargets[sec] || 0;
    const current      = getSectorWeight(sec);
    const al           = alertStatus(current, target);
    const barPct       = Math.min(current / (target || 1) * 100, 200);
    const barColor     = al.cls === 'text-success' ? '#22c55e' : al.cls === 'text-accent' ? '#f0b429' : '#f85149';

    return `<tr class="${al.rowCls || ''}">
      <td><strong>${esc(sec)}</strong></td>
      <td>
        <input class="target-input" type="number" min="0" max="100" step="0.1"
               id="sec-${esc(sec.replace(/[^a-zA-Z0-9؀-ۿ]/g,'_'))}" value="${target || ''}" placeholder="0">
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

  // صف الإجمالي للقطاعات
  // AUDIT-FIX: totalSecCurrentPct was undefined — compute it from sector weights
  const totalSecCurrentPct = sectors.reduce((s, sec) => s + getSectorWeight(sec), 0);
  const secCurrCls = Math.abs(totalSecCurrentPct - 100) < 0.5 ? 'text-success' : 'text-accent';
  const stfoot = tbody.closest('table').querySelector('tfoot') || tbody.closest('table').createTFoot();
  stfoot.innerHTML = `<tr style="border-top:2px solid var(--border);background:var(--bg-3)">
    <td><strong class="small">الإجمالي</strong></td>
    <td class="small text-muted">الهدف: <span id="sector-target-sum">—</span></td>
    <td class="num bold ${secCurrCls}">${totalSecCurrentPct.toFixed(2)}%</td>
    <td class="small text-muted" title="أهداف الأسهم / هدف القطاع">أسهم / قطاع</td>
    <td colspan="2"><span class="small text-muted">${Math.abs(totalSecCurrentPct - 100) < 0.1 ? '✅ يساوي 100%' : Math.abs(totalSecCurrentPct - 100) < 1 ? '≈ 100%' : totalSecCurrentPct < 100 ? 'بقي ' + (100 - totalSecCurrentPct).toFixed(2) + '%' : 'تجاوز بـ ' + (totalSecCurrentPct - 100).toFixed(2) + '%'}</span></td>
  </tr>`;

  // تحديث سهام الترتيب في الهيدر
  ['sector','target','current','status'].forEach(f => {
    const el = document.getElementById('sec-arr-' + f);
    if (el) el.outerHTML = _secArrow(f).replace('class="sort-arrow', `id="sec-arr-${f}" class="sort-arrow`);
  });

  // ربط المستمعات للقطاعات
  attachSectorListeners();
  updateSectorTargetSumInFooter();
}

// ── تحقق: أهداف الأسهم داخل القطاع لا تتجاوز هدف القطاع ─
function validateSectorConsistency() {
  // بناء خريطة: sector → { stockSum, sectorTarget }
  const sectorStockSum = {};

  const holdingTickers = new Set(holdings.map(h => h.ticker));
  const userStockMap   = {};
  userStocks.forEach(s => { userStockMap[s.ticker] = s; });
  const allTickers = [
    ...holdings.map(h => ({ ticker: h.ticker, sector: (h.sector||'').trim()||'غير مصنف' })),
    ...userStocks.filter(s => !holdingTickers.has(s.ticker))
      .map(s => ({ ticker: s.ticker, sector: s.sector || '—' })),
  ];

  allTickers.forEach(({ ticker, sector }) => {
    const pct = +(document.getElementById('st-' + ticker)?.value || 0);
    sectorStockSum[sector] = (sectorStockSum[sector] || 0) + pct;
  });

  const violations = [];
  Object.entries(sectorStockSum).forEach(([sector, stockSum]) => {
    const secTarget = sectorTargets[sector] || 0;
    if (secTarget > 0 && stockSum > secTarget + 0.05) {
      violations.push({ sector, stockSum, secTarget });
    }
  });

  return violations;
}

// ── مساعد: احسب إجمالي النسب المئوية فقط (بدون مناطق الشراء/البيع) ──
function sumTargetInputs(tbodyId) {
  let sum = 0;
  document.querySelectorAll(`#${tbodyId} .target-input:not(.zone-input)`)
    .forEach(inp => { sum += +(inp.value) || 0; });
  return sum;
}

// ── حفظ أهداف الأسهم ──────────────────────────────────────
async function saveAllTargets() {
  // ── تحقق من الإجمالي أولاً ─────────────────────────────
  const stockSum = sumTargetInputs('stock-targets-tbody');
  if (stockSum > 100.05) {
    showToast(`⛔ لا يمكن الحفظ — إجمالي أهداف الأسهم ${stockSum.toFixed(1)}% يتجاوز 100%`, 'error');
    return;
  }

  // تحقق: هل أهداف الأسهم داخل أي قطاع تتجاوز هدف القطاع؟ (تحذير فقط — لا يوقف الحفظ)
  const violations = validateSectorConsistency();
  if (violations.length) {
    const msgs = violations.map(v =>
      `• ${v.sector}: ${v.stockSum.toFixed(1)}% > هدف القطاع ${v.secTarget.toFixed(1)}%`
    ).join('\n');
    showToast(`⚠️ تنبيه: أهداف أسهم تتجاوز هدف القطاع:\n${msgs}\nتم الحفظ على أي حال.`, 'warning');
  }

  if (stockSum < 99.9 && stockSum > 0) {
    showToast(`⚠️ إجمالي الأهداف ${stockSum.toFixed(1)}% — تبقى ${(100-stockSum).toFixed(1)}% غير موزعة. تم الحفظ.`, 'warning');
  }

  const { data: { user } } = await supabaseClient.auth.getUser();

  const holdingTickers = new Set(holdings.map(h => h.ticker));
  const allTickers = [
    ...holdings.map(h => h.ticker),
    ...userStocks.filter(s => !holdingTickers.has(s.ticker)).map(s => s.ticker),
  ];

  const rows = allTickers.map(ticker => {
    const tz = taskZonesMap[ticker] || {};
    return {
      user_id:     user.id,
      ticker,
      target_pct:  +(document.getElementById('st-' + ticker)?.value || 0),
      entry_price: tz.accumulate_at   ?? null,
      exit_price:  tz.liquidate_above ?? null,
    };
  });

  const { error } = await supabaseClient.from('stock_targets')
    .upsert(rows, { onConflict: 'user_id,ticker' });

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }

  // AUDIT-FIX: parallel updates instead of sequential loop — O(1 RTT) vs O(N RTT)
  await Promise.all([...holdingTickers].map(ticker => {
    const h = holdings.find(x => x.ticker === ticker);
    if (!h) return Promise.resolve();
    const tw = +(document.getElementById('st-' + ticker)?.value || 0);
    return supabaseClient.from('holdings').update({ target_weight: tw }).eq('id', h.id);
  }));

  if (stockSum >= 99.9) showToast('تم حفظ أهداف الأسهم ✓', 'success');
  await loadAll();
}

// ── حفظ أهداف القطاعات ────────────────────────────────────
async function saveSectorTargets() {
  // ── تحقق من الإجمالي أولاً ─────────────────────────────
  const secSum = sumTargetInputs('sector-targets-tbody');
  if (secSum > 100.05) {
    showToast(`⛔ لا يمكن الحفظ — إجمالي أهداف القطاعات ${secSum.toFixed(1)}% يتجاوز 100%`, 'error');
    return;
  }
  if (secSum < 99.9 && secSum > 0) {
    showToast(`⚠️ إجمالي الأهداف ${secSum.toFixed(1)}% — تبقى ${(100-secSum).toFixed(1)}% غير موزعة. تم الحفظ.`, 'warning');
  }

  const { data: { user } } = await supabaseClient.auth.getUser();
  const sectorSet = new Set([
    ...holdings.map(h => (h.sector || '').trim() || 'غير مصنف'),
    ...Object.keys(sectorTargets)
  ]);

  const rows = [...sectorSet].map(sec => ({
    user_id:    user.id,
    sector:     sec,
    target_pct: +(document.getElementById('sec-' + sec.replace(/[^a-zA-Z0-9؀-ۿ]/g,'_'))?.value || 0)
  }));

  const { error } = await supabaseClient.from('sector_targets')
    .upsert(rows, { onConflict: 'user_id,sector' });

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  if (secSum >= 99.9) showToast('تم حفظ أهداف القطاعات ✓', 'success');
  await loadAll();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportTargetsCSV() {
  const stockRows  = Object.entries(stockTargets);
  const sectorRows = Object.entries(sectorTargets);
  if (!stockRows.length && !sectorRows.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }

  const BOM = '﻿';
  const lines = [];
  lines.push('== أهداف الأسهم ==');
  lines.push(['الرمز', 'الاسم', 'الوزن المستهدف %', 'الوزن الحالي %'].join(','));
  stockRows.forEach(([ticker, pct]) => {
    const h = holdings.find(x => x.ticker === ticker);
    const cur = totalValue > 0 && h ? (+h.shares * +h.current_price / totalValue * 100).toFixed(2) : '—';
    lines.push([ticker, h?.name || '', pct, cur].join(','));
  });
  lines.push('');
  lines.push('== أهداف القطاعات ==');
  lines.push(['القطاع', 'الوزن المستهدف %'].join(','));
  sectorRows.forEach(([sector, pct]) => lines.push([sector, pct].join(',')));

  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `أهداف_${todayISO()}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast(`✓ تم التصدير`, 'success');
}

// ══════════════════════════════════════════════════════════════
// ⚖️ محرك إعادة التوازن — Rebalancing Engine
// ══════════════════════════════════════════════════════════════

// ── درجة جاذبية السعر للشراء (0..1) لسهم عند سعره الحالي ──────
// تدمج مصدرين:
//   1) إشارات المالك الصريحة من صفحة التقييمات (portfolio_tasks):
//      تجميع accumulate_at · تخفيف trim_from · بيع liquidate_above — لها الأولوية.
//   2) آخر تقييم عادل من سجل حاسبة القيمة العادلة (valuation_history_v1).
// الناتج: درجة عالية = السعر في منطقة شراء جيدة · ≈0 = قريب من المتضخم/فوق العادلة.
// لا تُقدِّر بيانات ناقصة بصمت: لو لا zones ولا تقييم → درجة محايدة 1 وتُعلَّم «بلا تقييم».
function valuationScore(ticker, price) {
  const fmt = v => formatSAR(v);
  price = +price || 0;
  const tz = taskZonesMap[ticker] || {};
  const A = +tz.accumulate_at   || 0;   // تجميع
  const T = +tz.trim_from       || 0;   // تخفيف
  const L = +tz.liquidate_above || 0;   // بيع كامل

  // ── درجة من إشارات المالك (zones) ──
  let zoneScore = null, zoneLabel = '', zoneReason = '';
  if (L > 0 && price >= L) {
    zoneScore = 0; zoneLabel = '🔴 فوق سعر البيع';
    zoneReason = `السعر ${fmt(price)} ≥ بيع ${fmt(L)}`;
  } else if (A > 0 && T > 0 && T > A) {
    if (price <= A)      { zoneScore = 1; zoneLabel = '🟢 منطقة التجميع'; zoneReason = `السعر ≤ تجميع ${fmt(A)}`; }
    else if (price >= T) { zoneScore = 0; zoneLabel = '🔴 منطقة التخفيف (متضخم)'; zoneReason = `السعر ≥ تخفيف ${fmt(T)}`; }
    else                 { zoneScore = (T - price) / (T - A); zoneLabel = '🟡 بين التجميع والتخفيف'; zoneReason = `بين تجميع ${fmt(A)} وتخفيف ${fmt(T)}`; }
  } else if (A > 0) {                    // سعر تجميع فقط — يتلاشى حتى +15% فوقه
    const top = A * 1.15;
    if (price <= A)        { zoneScore = 1; zoneLabel = '🟢 منطقة التجميع'; zoneReason = `السعر ≤ تجميع ${fmt(A)}`; }
    else if (price >= top) { zoneScore = 0; zoneLabel = '🔴 بعيد فوق التجميع'; zoneReason = `السعر ≥ ${fmt(top)} (+15% فوق التجميع)`; }
    else                   { zoneScore = (top - price) / (A * 0.15); zoneLabel = '🟡 قرب التجميع'; zoneReason = `أعلى من تجميع ${fmt(A)} بقليل`; }
  } else if (T > 0) {                    // سعر تخفيف فقط — جذّاب تحته بهامش 15%
    const bot = T * 0.85;
    if (price >= T)        { zoneScore = 0; zoneLabel = '🔴 منطقة التخفيف (متضخم)'; zoneReason = `السعر ≥ تخفيف ${fmt(T)}`; }
    else if (price <= bot) { zoneScore = 1; zoneLabel = '🟢 أقل من التخفيف بهامش'; zoneReason = `السعر ≤ ${fmt(bot)}`; }
    else                   { zoneScore = (T - price) / (T * 0.15); zoneLabel = '🟡 قرب التخفيف'; zoneReason = `أسفل تخفيف ${fmt(T)} بقليل`; }
  }

  // ── درجة من سجل حاسبة القيمة العادلة ──
  const v = valuationLatest[ticker];
  let fvScore = null, fvReason = '';
  if (v && v.fairValueAvg > 0 && price > 0) {
    const disc = (v.fairValueAvg - price) / v.fairValueAvg;     // موجب = تحت العادلة
    fvScore = Math.max(0, Math.min(1, (disc + 0.10) / 0.40));   // ‑10% → 0 · +30% → 1
    fvReason = disc >= 0
      ? `هامش أمان ${(disc * 100).toFixed(0)}% تحت العادلة ${fmt(v.fairValueAvg)}`
      : `مبالغ ${Math.abs(disc * 100).toFixed(0)}% فوق العادلة ${fmt(v.fairValueAvg)}`;
  }

  // ── الدمج: إشارات المالك أولاً، والعادلة تعزيز ثانوي ──
  let score, label, reason, source;
  if (zoneScore != null && fvScore != null) {
    score = 0.7 * zoneScore + 0.3 * fvScore;
    label = zoneLabel; reason = `${zoneReason} · ${fvReason}`; source = 'zones+fv';
  } else if (zoneScore != null) {
    score = zoneScore; label = zoneLabel; reason = zoneReason; source = 'zones';
  } else if (fvScore != null) {
    score = fvScore;
    label = fvScore >= 0.66 ? '🟢 تحت العادلة' : fvScore >= 0.33 ? '🟡 قرب العادلة' : '🔴 فوق العادلة';
    reason = fvReason; source = 'fv';
  } else {
    score = 1; label = '⚪ بلا تقييم'; reason = 'لا توجد أسعار تقييم لهذا السهم'; source = 'none';
  }
  return {
    score: Math.max(0, Math.min(1, score)), label, reason, source,
    fairValueAvg: v?.fairValueAvg ?? null, range: v?.fairValueRange ?? null,
    marginText: v?.marginText || '', valDate: v?.date || '',
  };
}

function runRebalancing() {
  const budget       = +document.getElementById('reb-budget')?.value || 0;
  const method       = document.getElementById('reb-method')?.value || 'gap';
  const entryFilter  = document.getElementById('reb-entry-filter')?.checked || false;
  // مراعاة موقع السعر من التقييم (افتراضياً مُفعّل) — يجعل المحرك ذكياً لا يعتمد الفجوة وحدها
  const valAwareEl   = document.getElementById('reb-valuation-aware');
  const valAware     = valAwareEl ? valAwareEl.checked : true;
  const resultEl     = document.getElementById('reb-result');
  if (!resultEl) return;

  if (budget <= 0) {
    resultEl.innerHTML = `<div class="empty-state" style="padding:32px">
      <div class="icon">⚖️</div><p>أدخل المبلغ المتاح لبدء الحساب</p></div>`;
    return;
  }
  if (!holdings.length || !totalValue) {
    resultEl.innerHTML = `<div class="empty-state" style="padding:24px">
      <div class="icon">📋</div><p>لا توجد أسهم في المحفظة</p></div>`;
    return;
  }

  // ── بناء قائمة المرشحين ─────────────────────────────────────
  // فقط الأسهم الفعلية (ليس المخطط) ذات الهدف المحدد والسعر الموجود
  const candidates = holdings
    .filter(h => stockTargets[h.ticker] > 0 && +h.current_price > 0)
    .map(h => {
      const currentPct = totalValue > 0 ? (+h.shares * +h.current_price) / totalValue * 100 : 0;
      const targetPct  = stockTargets[h.ticker] || 0;
      const gap        = targetPct - currentPct;           // موجب = ناقص الهدف
      const zone       = stockZones[h.ticker] || {};
      const inZone     = !zone.entry_price || +h.current_price <= +zone.entry_price;
      const val        = valuationScore(h.ticker, +h.current_price);
      // الدرجة الفعّالة: 1 عند إيقاف مراعاة التقييم (سلوك قديم بالضبط)
      const effScore   = valAware ? val.score : 1;
      // الأولوية = الفجوة × جاذبية السعر → سهم قريب من المتضخم يهبط للأسفل ولو فجوته كبيرة
      const priority   = gap * effScore;
      return { ...h, currentPct, targetPct, gap, inZone, val, effScore, priority };
    })
    .filter(c => c.gap > 0.05)                             // فقط الناقص فعلاً (فوق 0.05%)
    .filter(c => !entryFilter || c.inZone)                 // فلتر منطقة الشراء اختياري
    .sort((a, b) => b.priority - a.priority);              // ترتيب تنازلي بالأولوية (فجوة × تقييم)

  if (!candidates.length) {
    const msg = entryFilter
      ? 'لا توجد أسهم ناقصة عن هدفها <strong>ضمن منطقة الشراء</strong> حالياً — حاول رفع الفلتر'
      : 'المحفظة متوازنة — لا توجد أسهم ناقصة عن أوزانها المستهدفة';
    resultEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--success)">✅ ${msg}</div>`;
    return;
  }

  // ── الحد الأقصى لكل سهم: ما يُوصله لهدفه بالضبط لا يتجاوزه ─
  // maxAlloc = (هدف% / 100) × (قيمة المحفظة + الميزانية) − قيمة السهم الحالية
  // هذا يضمن أن الوزن بعد الشراء ≤ الهدف بغض النظر عن حجم الميزانية
  const newPortfolioTotal = totalValue + budget;

  const candidates_ = candidates.map(c => {
    const currentValue = +c.shares * +c.current_price;
    const maxAlloc     = Math.max(0, (c.targetPct / 100) * newPortfolioTotal - currentValue);
    return { ...c, maxAlloc };
  });

  // ── إن كانت مراعاة التقييم مُفعّلة وكل الأسهم الناقصة قريبة من سعرها المتضخم ──
  // لا نشتري سهماً غالياً لمجرد وجود فجوة. هذا هو السلوك الذكي الذي طلبه المالك.
  if (valAware && candidates_.every(c => c.effScore <= 0.05)) {
    const list = candidates_
      .sort((a, b) => b.gap - a.gap)
      .map(c => `<li><strong>${esc(c.ticker)}</strong> ${esc(c.name)} — فجوة ${c.gap.toFixed(1)}% · ${c.val.label} <span class="text-muted small">(${esc(c.val.reason)})</span></li>`)
      .join('');
    resultEl.innerHTML = `<div style="padding:18px 20px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-3)">
      <div style="color:var(--accent);font-weight:600;margin-bottom:8px">⚠️ لا شراء مُوصى به الآن</div>
      <p class="small text-muted" style="margin-bottom:10px">كل الأسهم الناقصة عن هدفها سعرها الحالي قريب من منطقة التخفيف/المتضخم أو فوق قيمته العادلة. الفجوة وحدها لا تبرّر الشراء عند سعر مرتفع.</p>
      <ul class="small" style="margin:0;padding-inline-start:18px;line-height:1.9">${list}</ul>
      <p class="small text-muted" style="margin-top:10px">💡 أوقف «مراعاة موقع السعر من التقييم» لتجاهل التقييم والتوزيع بالفجوة فقط، أو انتظر نزول الأسعار لمناطق التجميع.</p>
    </div>`;
    return;
  }

  // ── حساب التوزيع حسب الطريقة — مع تطبيق الحد الأقصى ────────
  let allocations = [];

  if (method === 'gap') {
    // بالتناسب مع الأولوية (الفجوة × جاذبية السعر) ثم تقليص لـ maxAlloc
    const totalW = candidates_.reduce((s, c) => s + c.priority, 0) || 1;
    allocations = candidates_.map(c => ({
      ...c,
      allocated: Math.min(budget * (c.priority / totalW), c.maxAlloc)
    }));
  } else if (method === 'equal') {
    // توزيع متساوٍ بين المؤهّلين — عند مراعاة التقييم نستبعد القريب من المتضخم (درجة ≤ 0.15)
    const eligible = valAware ? candidates_.filter(c => c.effScore > 0.15) : candidates_;
    const pool = eligible.length ? eligible : candidates_;
    const each = budget / pool.length;
    allocations = pool.map(c => ({ ...c, allocated: Math.min(each, c.maxAlloc) }));
  } else {
    // أولوية للأعلى أولوية (فجوة × تقييم) فقط — مقيّدة بـ maxAlloc أيضاً
    const top = candidates_[0];
    allocations = [{ ...top, allocated: Math.min(budget, top.maxAlloc) }];
  }

  // ── احسب عدد الأسهم القابل للشراء (تقريب للأسفل دائماً) ────
  let totalSpent = 0;

  const rows = allocations.map(c => {
    // AUDIT-FIX: guard against current_price = 0 (unpriced holding) to prevent
    // Math.floor(Infinity) propagating into cost/totalSpent corrupting the rebalancer
    const price        = +c.current_price || 0;
    const sharesToBuy  = price > 0 ? Math.floor(c.allocated / price) : 0;
    const cost         = sharesToBuy * price;
    totalSpent        += cost;
    const newShares    = +c.shares + sharesToBuy;
    const newValue     = newShares * +c.current_price;
    const newPct       = newPortfolioTotal > 0 ? newValue / newPortfolioTotal * 100 : 0;
    const gapAfter     = c.targetPct - newPct;   // موجب = ما زال ناقصاً | سالب = تجاوز (لا يحدث)
    return { ...c, sharesToBuy, cost, newPct, gapAfter };
  }).filter(r => r.sharesToBuy > 0);

  const leftover = budget - totalSpent;

  // ── رسم الجدول ──────────────────────────────────────────────
  if (!rows.length) {
    resultEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted)">
      ⚠️ المبلغ غير كافٍ لشراء ولو سهم واحد من الأسهم المرشحة
      <br><span class="small">أدنى سعر: ${formatSAR(Math.min(...candidates_.map(c => +c.current_price)))}</span>
    </div>`;
    return;
  }

  const totalCostFmt   = formatSAR(totalSpent);
  const leftoverFmt    = formatSAR(leftover);
  const leftoverCls    = leftover > 0 ? 'text-accent' : 'text-success';

  resultEl.innerHTML = `
    <!-- ملخص الإجراء -->
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;padding:14px 16px;background:var(--bg-3);border-radius:var(--radius);border:1px solid var(--border)">
      <div style="display:flex;flex-direction:column;gap:3px">
        <span class="small text-muted">المبلغ المتاح</span>
        <span class="num bold">${formatSAR(budget)}</span>
      </div>
      <div style="color:var(--border);align-self:center">→</div>
      <div style="display:flex;flex-direction:column;gap:3px">
        <span class="small text-muted">إجمالي التكلفة</span>
        <span class="num bold text-accent">${totalCostFmt}</span>
      </div>
      <div style="color:var(--border);align-self:center">=</div>
      <div style="display:flex;flex-direction:column;gap:3px">
        <span class="small text-muted">المتبقي نقداً</span>
        <span class="num bold ${leftoverCls}">${leftoverFmt}</span>
      </div>
      <div style="margin-right:auto;display:flex;flex-direction:column;gap:3px;text-align:left">
        <span class="small text-muted">عدد الأسهم المختلفة</span>
        <span class="num bold">${rows.length} سهم</span>
      </div>
    </div>

    <!-- جدول التوصيات -->
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>الرمز</th>
            <th>الاسم</th>
            <th>السعر الحالي</th>
            <th>أسهم تشتري</th>
            <th>التكلفة</th>
            <th>الوزن قبل</th>
            <th>الوزن بعد</th>
            <th>الفجوة المتبقية</th>
            ${valAware ? '<th>موقع السعر من التقييم</th>' : ''}
            <th>منطقة الشراء</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const gapAfterCls = Math.abs(r.gapAfter) <= 1 ? 'text-success' : Math.abs(r.gapAfter) <= 3 ? 'text-accent' : 'text-muted';
            const zoneEl = r.inZone
              ? '<span style="color:var(--success)">✅ ضمن النطاق</span>'
              : (stockZones[r.ticker]?.entry_price
                  ? `<span style="color:var(--text-muted);font-size:0.78rem">فوق ${formatSAR(stockZones[r.ticker].entry_price)}</span>`
                  : '<span class="text-muted small">—</span>');
            return `<tr>
              <td><strong class="text-accent">${esc(r.ticker)}</strong></td>
              <td>${esc(r.name)}</td>
              <td class="num">${formatSAR(r.current_price)}</td>
              <td class="num bold text-accent">${r.sharesToBuy.toLocaleString()}</td>
              <td class="num bold">${formatSAR(r.cost)}</td>
              <td class="num text-muted">${r.currentPct.toFixed(2)}%</td>
              <td class="num bold">${r.newPct.toFixed(2)}%
                <span class="small" style="color:var(--success)">↑${(r.newPct - r.currentPct).toFixed(2)}%</span>
              </td>
              <td class="num small ${gapAfterCls}">${r.gapAfter > 0 ? '+' : ''}${r.gapAfter.toFixed(2)}%</td>
              ${valAware ? `<td style="min-width:160px">
                <div style="font-size:0.82rem">${r.val.label} <span class="text-muted">· ${(r.val.score*100).toFixed(0)}%</span></div>
                <div class="small text-muted" style="line-height:1.5">${esc(r.val.reason)}</div>
                ${r.val.range ? `<div class="small text-muted">عادلة: ${esc(r.val.range)}${r.val.valDate ? ` · ${esc(r.val.valDate)}` : ''}</div>` : ''}
              </td>` : ''}
              <td>${zoneEl}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    ${rows.some(r => !r.inZone && entryFilter === false && stockZones[r.ticker]?.entry_price) ? `
    <p class="small text-muted" style="margin-top:10px">
      💡 بعض الأسهم فوق منطقة الشراء المحددة — فعّل "فقط ضمن منطقة الشراء" لتصفيتها
    </p>` : ''}
  `;
}

function showRebInfo() {
  // AUDIT-FIX: replace blocking alert() with DOM modal
  const lines = [
    '⚖️ محرك إعادة التوازن',
    '',
    'يحسب الأسهم الأنسب للشراء بمبلغ محدد لتقريب محفظتك من الأوزان المستهدفة.',
    '',
    'طرق التوزيع:',
    '• بالتناسب مع الفجوة: الأسهم الأبعد عن هدفها تأخذ نصيباً أكبر',
    '• توزيع متساوٍ: كل سهم ناقص يأخذ نفس المبلغ',
    '• الأولى بالأولوية: كل المبلغ للسهم الأعلى أولوية',
    '',
    '⚖️ مراعاة موقع السعر من التقييم (مُفعّلة افتراضياً):',
    'لا يكتفي المحرك بالفجوة، بل يقرأ لكل سهم أسعار التجميع/التخفيف/البيع',
    'من صفحة التقييمات، وآخر قيمة عادلة من سجل حاسبة القيمة العادلة.',
    'الأولوية = الفجوة × جاذبية السعر، فالسهم القريب من سعره المتضخم',
    'يهبط للأسفل ولو فجوته كبيرة. وإن كانت كل الأسهم الناقصة مرتفعة',
    'السعر، يخبرك صراحةً «لا شراء مُوصى به الآن» بدل شراء سهم غالٍ.',
    'أوقف الخيار لتوزيع بالفجوة فقط (السلوك القديم).',
    '',
    'عدد الأسهم يُقرَّب للأسفل دائماً (floor) — لا كسور في السهم.',
    'المتبقي = ما لم يُنفق بعد التقريب.',
  ];
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:var(--bg-2,#1c2128);border:1px solid var(--border,#30363d);border-radius:12px;max-width:440px;width:100%;padding:24px 20px;box-shadow:0 8px 32px rgba(0,0,0,.5)">
      <div style="white-space:pre-wrap;font-size:.85rem;color:var(--text-2);line-height:1.7;margin-bottom:16px">${lines.join('\n')}</div>
      <div style="display:flex;justify-content:flex-end">
        <button id="_reb-info-close" class="btn btn-secondary" style="min-width:80px">إغلاق</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#_reb-info-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
}

init();
