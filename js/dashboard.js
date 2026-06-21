let holdings    = [];
let stockTargets = {};   // ticker → target_pct  (من stock_targets)
let stockZones   = {};   // ticker → { entry_price, exit_price }
let sectorChart = null;
let _sectorMode = 'donut'; // 'donut' | 'bars' | 'cards'
let weightChart = null;
let weightDonutCur = null;   // مخطط دائري — الوزن الحالي على مستوى السهم
let weightDonutTgt = null;   // مخطط دائري — الوزن المستهدف على مستوى السهم
let _weightMode = 'bars';  // 'bars' | 'gap' | 'cards' | 'table'
let allocChart  = null;    // مخطط التخصيص الكلي للأصول
let beChart     = null;    // مخطط نقطة التعادل
let editingId   = null;
let investedTab      = 'net';     // 'net' = رأس المال المنشغل | 'wac' = تكلفة الوسيط
let yieldTab         = 'fwd';     // 'fwd' | 'ann' | 'yoc' | 'market'
let breakevenMode    = 'summary'; // 'summary' | 'detail' | 'bars'
let portfolioCash    = 0;      // نقد المحفظة عند الوسيط
let cashUpdatedAt    = null;   // تاريخ آخر تحديث للنقد
let _priceTimestamps = {};     // ticker → ISO timestamp آخر تحديث للسعر

// ── Sorting state for holdings table ─────────────────────────
let hSortField = '';
let hSortDir   = 'asc';

function sortHoldings(field) {
  if (hSortField === field) hSortDir = hSortDir === 'asc' ? 'desc' : 'asc';
  else { hSortField = field; hSortDir = 'asc'; }
  renderTable();
}

function hSortArrow(field) {
  if (hSortField !== field) return '<span class="sort-arrow">↕</span>';
  return `<span class="sort-arrow active">${hSortDir === 'asc' ? '↑' : '↓'}</span>`;
}

const g = id => document.getElementById(id);
const setText = (id, v) => { const el = g(id); if (el) el.textContent = v; };

// Returns all td attributes for an editable cell
function ed(table, rowId, field, type, raw, extraCls = '', selectKey = '') {
  const numCls = type === 'number' ? ' num' : '';
  return `class="editable${numCls}${extraCls ? ' ' + extraCls : ''}" ` +
    `data-table="${table}" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"` +
    (selectKey ? ` data-select="${selectKey}"` : '');
}

// computeXIRR منقولة إلى utils.js — متاحة لجميع الصفحات

// إجمالي الصكوك المشترَك بها (من التخزين المحلي لصفحة الصكوك)
function getSukukActiveTotal() {
  try {
    const raw = localStorage.getItem(userLsKey('sukuk_planner_v1')) || localStorage.getItem('sukuk_planner_v1');
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return (data.opportunities || [])
      .filter(o => o.status === 'مشترك')
      .reduce((s, o) => s + (+o.amount || 0), 0);
  } catch (_) { return 0; }
}

// ── تتبع قِدم الأسعار ─────────────────────────────────────────
// User-scoped key — resolved after requireAuth() sets window._currentUserId
const PRICE_TS_KEY = () => userLsKey('tharwa-price-timestamps');
const STALE_DAYS   = 7;   // عدد الأيام التي بعدها يُعتبر السعر قديماً

function _loadPriceTimestamps() {
  try { _priceTimestamps = JSON.parse(localStorage.getItem(PRICE_TS_KEY()) || '{}'); }
  catch (_) { _priceTimestamps = {}; }
}

function _savePriceTimestamps() {
  try { localStorage.setItem(PRICE_TS_KEY(), JSON.stringify(_priceTimestamps)); }
  catch (_) {}
}

// أيام مضت على آخر تحديث للسعر (null = غير محدَّد بعد)
function getPriceAgeDays(ticker) {
  const ts = _priceTimestamps[ticker];
  if (!ts) return null;
  return (Date.now() - new Date(ts).getTime()) / 86400000;
}

// هل يوجد أي سهم في المحفظة سعره قديم أكثر من STALE_DAYS؟
function hasStalePrice() {
  return holdings.some(h => {
    const age = getPriceAgeDays(h.ticker);
    return age === null || age > STALE_DAYS;
  });
}

// ── Auto Price Update (Supabase Edge Function) ────────────────
let _priceRefreshTimer = null;

async function refreshPrices(silent = false) {
  const btn = document.getElementById('refresh-prices-btn');
  try {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التحديث...'; }

    const { data: json, error } = await supabaseClient.functions.invoke('update-prices');
    if (error) throw error;

    if (json?.updated > 0) {
      // تحديث فوري للأسعار في الـ holdings المحلي
      const nowISO = new Date().toISOString();
      if (json.prices) {
        holdings.forEach(h => {
          if (json.prices[h.ticker] != null) {
            h.current_price = json.prices[h.ticker];
            _priceTimestamps[h.ticker] = nowISO;   // ← سجّل وقت التحديث
          }
        });
        _savePriceTimestamps();
      }
      // رسم فوري بالأسعار الجديدة + تحقق مناطق السعر
      renderStats(); renderRebalancingAlerts(); renderPortfolioHealthCard(); renderDiversificationCard(); renderCharts(); renderTable();
      renderPriceZonesCard(); renderBreakEvenCard();
      // تحقق تنبيهات مناطق الشراء/البيع بعد كل تحديث أسعار
      holdings.forEach(h => checkPriceZones(h.ticker, +h.current_price));
      renderAllocationChart(); renderRetirementCard();
      // H-6: warn about tickers Yahoo didn't return (delisted / corporate action)
      if (json.failed?.length) {
        showToast(`⚠️ لم يُحدَّث سعر: ${json.failed.join(', ')}`, 'warning');
      }
      if (btn) btn.textContent = `✅ تم (${json.updated} سهم)`;
      // R-4: background DB sync with error handling
      loadAllData()
        .then(() => {
          renderStats(); renderTable(); renderPriceZonesCard();
          renderBreakEvenCard(); renderAllocationChart(); renderRetirementCard();
        })
        .catch(e => {
          console.warn('Background sync after price refresh failed:', e);
          showToast('⚠️ تعذّرت مزامنة الأسعار مع قاعدة البيانات — ستظهر عند إعادة التحميل', 'warning');
        });
    } else {
      if (btn) btn.textContent = json?.message ? `⚠️ ${json.message}` : '⚠️ لم يتحدث';
    }
  } catch (e) {
    if (!silent) console.warn('refreshPrices error:', e);
    if (btn) btn.textContent = '❌ خطأ';
  } finally {
    if (btn) setTimeout(() => { btn.disabled = false; btn.textContent = '🔄 تحديث الأسعار'; }, 3000);
  }
}

function startPriceAutoRefresh() {
  refreshPrices(true);
  _priceRefreshTimer = setInterval(() => refreshPrices(true), 5 * 60 * 1000);
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-dashboard');
  _loadPriceTimestamps();   // ← حمّل آخر تواريخ تحديث الأسعار
  await loadAllData();
  renderStats();
  renderRebalancingAlerts();
  renderPortfolioHealthCard(); renderDiversificationCard();
  renderCharts();
  renderTable();
  renderPriceZonesCard();
  renderBreakEvenCard();
  renderAllocationChart();
  renderRetirementCard();
  applyReliabilityBadges();
  startPriceAutoRefresh();

  // أوقف العداد عند إخفاء الصفحة — استأنفه عند العودة
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(_priceRefreshTimer); _priceRefreshTimer = null;
    } else if (!_priceRefreshTimer) {
      startPriceAutoRefresh();
    }
  });

  // مزامنة هدف FIRE من Supabase (للتزامن بين الأجهزة)
  _loadRetirementGoalFromSupabase().catch(() => {});

  // تسجيل قيمة المحفظة تلقائياً (مرة في الشهر) لبناء تاريخ أداء حقيقي
  _autoSnapshotPortfolio().catch(() => {});
}

// ── Auto-snapshot: يحفظ قيمة المحفظة الحالية في net_worth_snapshots ─────
// يعمل مرة واحدة لكل شهر — يوفر بيانات تاريخية تدريجية لصفحة الأداء
let _snapshotInProgress = false;
async function _autoSnapshotPortfolio() {
  // guard ضد الاستدعاء المتزامن (race condition)
  if (_snapshotInProgress) return;
  _snapshotInProgress = true;
  try {
    // AUDIT-FIX: use local date to avoid UTC-shift placing snapshot in wrong month for UTC+3
    const _now = new Date();
    const todayISO_ = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
    const thisMonth = todayISO_.slice(0, 7); // YYYY-MM
    const monthKey  = `auto-${thisMonth}`;   // مفتاح فريد للشهر

    // هل يوجد snapshot تلقائي لهذا الشهر بالفعل؟
    // نفلتر بـ notes يبدأ بـ monthKey لتجنب عد اللقطات اليدوية
    const { data: existing } = await supabaseClient
      .from('net_worth_snapshots')
      .select('id')
      .ilike('notes', `${monthKey}%`)
      .limit(1);

    if (existing?.length) return; // موجود — لا نكرر

    // احسب القيمة الكلية الحالية
    const stocksValue = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
    if (stocksValue <= 0) return; // لا يوجد أسهم — لا نسجل

    const { data: { user } } = await supabaseClient.auth.getUser();
    const s    = window._ds || {};
    const reVal = s.reTotal || 0;

    // صافي الثروة = أسهم + نقد + عقارات
    const totalNW = stocksValue + portfolioCash + reVal;

    // R-2: use upsert on (user_id, date) to prevent duplicate rows from concurrent tabs
    await supabaseClient.from('net_worth_snapshots').upsert(
      {
        user_id:     user.id,
        date:        todayISO_,
        total_value: totalNW,
        notes:       `${monthKey} — أسهم: ${stocksValue.toFixed(0)} | نقد: ${portfolioCash.toFixed(0)} | عقارات: ${reVal.toFixed(0)}`,
      },
      { onConflict: 'user_id,date', ignoreDuplicates: true }
    );
  } finally {
    _snapshotInProgress = false;
  }
}

// ── Data ──────────────────────────────────────────────────────
async function loadAllData() {
  const yr = new Date().getFullYear();

  // Promise.all مع try/catch — فشل أي استعلام يُوقف التحميل
  // نستخدم allSettled لتلقي نتائج جزئية بدل الفشل الكامل الصامت
  const results = await Promise.allSettled([
    supabaseClient.from('holdings').select('*').order('ticker'),
    supabaseClient.from('transactions').select('type, total, shares, price, commission, vat, ticker, date').eq('is_archived', false),
    supabaseClient.from('dividends').select('amount, year, date, ticker').eq('is_archived', false),
    supabaseClient.from('cashflow_entries').select('type, amount, date').eq('is_archived', false),
    supabaseClient.from('net_worth_snapshots').select('total_value, date').order('date', { ascending: false }).limit(1),
    supabaseClient.from('real_estate').select('current_value, status').eq('is_active', true),
    supabaseClient.from('stock_targets').select('ticker, target_pct, entry_price, exit_price'),
    supabaseClient.from('sector_targets').select('sector, target_pct'),
    supabaseClient.from('portfolio_cash').select('amount, updated_at').limit(1).maybeSingle()
  ]);

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) {
    showToast(`⚠️ تعذّر تحميل ${failed.length} مصدر بيانات — قد تكون بعض الأرقام غير مكتملة`, 'warning');
  }

  const [rH, rTx, rDiv, rCf, rNw, rRe, rSt, rSecT, rCash] = results.map(r =>
    r.status === 'fulfilled' ? r.value : { data: null, error: null }
  );

  holdings = rH.data || [];

  // AUDIT-FIX: seed _priceTimestamps from DB's price_updated_at so staleness check
  // survives localStorage clearing without showing all prices as stale
  holdings.forEach(h => {
    if (h.price_updated_at && !_priceTimestamps[h.ticker]) {
      _priceTimestamps[h.ticker] = h.price_updated_at;
    }
  });
  _savePriceTimestamps();

  // نقد المحفظة — Supabase أولاً، localStorage كـ fallback
  // ملاحظة: maybeSingle() يُرجع { data: { amount, updated_at } | null }
  if (rCash?.data?.amount != null) {
    portfolioCash = +rCash.data.amount;
    cashUpdatedAt = rCash.data.updated_at || null;
    _saveCashToLS(portfolioCash, cashUpdatedAt); // حدّث الـ cache
  } else {
    _loadCashFromLS(); // fallback للـ localStorage (أو قيمة صفر إن لم يوجد)
  }

  // بناء خريطة الأهداف — stock_targets هو المصدر الأساسي
  stockTargets = {};
  stockZones   = {};
  (rSt.data || []).forEach(r => {
    stockTargets[r.ticker] = +r.target_pct;
    stockZones[r.ticker]   = { entry_price: r.entry_price ?? null, exit_price: r.exit_price ?? null };
  });
  holdings.forEach(h => {
    if (stockTargets[h.ticker] !== undefined) h.target_weight = stockTargets[h.ticker];
  });

  const txRows   = rTx.data  || [];
  const divRows  = rDiv.data || [];
  const cfRows   = rCf.data  || [];
  const nwRows   = rNw.data  || [];
  const reRows   = rRe.data  || [];

  // ── حسابات المعاملات ──────────────────────────────────────
  const totalBuys  = txRows.filter(t => t.type === 'buy').reduce((s, t) => s + +t.total, 0);
  const totalSells = txRows.filter(t => t.type === 'sell').reduce((s, t) => s + +t.total, 0);
  const totalCommission = txRows.reduce((s, t) => s + (+t.commission || 0), 0);
  const totalVAT        = txRows.reduce((s, t) => s + (+t.vat        || 0), 0);

  // ── حسابات المنح ─────────────────────────────────────────
  const grantMap = {};
  txRows.filter(t => t.type === 'grant').forEach(t => {
    grantMap[t.ticker] = (grantMap[t.ticker] || 0) + +t.shares;
  });
  const totalGrantShares  = Object.values(grantMap).reduce((s, v) => s + v, 0);
  const totalGrantTickers = Object.keys(grantMap).length;

  // ── ر/خ المحقق من البيع (دقيق بعد الرسوم) ────────────────
  // F-6: WAC زمني — نمشي على المعاملات بترتيبها التاريخي ونستخدم متوسط التكلفة
  // وقت كل عملية بيع (لا متوسط نهائي يشمل مشتريات لاحقة). مطابق لمنهج
  // transactions.js (renderTxStats) لضمان توافق الرقم بين الصفحتين.
  //   • تكلفة الشراء (t.total) تشمل العمولة + الضريبة
  //   • أسهم المنح تُضاف بتكلفة صفر فتخفض المتوسط (WAC حقيقي)
  //   • t.total للبيع = القيمة − العمولة − الضريبة (صافي ما دخل جيبك)
  let realizedPnL = 0;
  {
    const sortedTx = txRows.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const costMap  = {}; // ticker → { shares, totalCost (شاملة عمولة + ضريبة) }
    sortedTx.forEach(t => {
      if (!costMap[t.ticker]) costMap[t.ticker] = { shares: 0, totalCost: 0 };
      const m = costMap[t.ticker];
      if (t.type === 'buy') {
        m.totalCost += +t.total;
        m.shares    += +t.shares;
      } else if (t.type === 'grant') {
        m.shares    += +t.shares;            // منحة: تكلفة صفر
      } else if (t.type === 'sell') {
        const avgCostPerShare = m.shares > 0 ? m.totalCost / m.shares : 0;
        const costOfSold      = avgCostPerShare * +t.shares;
        realizedPnL += (+t.total) - costOfSold;
        // خصم التكلفة بعدد الأسهم (لا بالنسبة) — مطابق recomputeHoldingFromTx
        m.totalCost = Math.max(0, m.totalCost - costOfSold);
        m.shares    = Math.max(0, m.shares - +t.shares);
      }
    });
  }

  // ── القيمة السوقية والتكلفة ──────────────────────────────
  const totalValue = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  const costBasis  = holdings.reduce((s, h) => s + +h.shares * +h.avg_price, 0);

  // ── تحليل القطاعات ──────────────────────────────────────
  const sectorValMap = {};
  holdings.forEach(h => {
    const sec = (h.sector || '').trim() || 'غير مصنف';
    sectorValMap[sec] = (sectorValMap[sec] || 0) + +h.shares * +h.current_price;
  });
  const sectorTargetMap = {};
  (rSecT.data || []).forEach(r => { sectorTargetMap[r.sector] = +r.target_pct; });
  window._sectorTargetMap = sectorTargetMap;   // متاح لـ _renderSectorBars/_renderSectorCards
  const sectorList = Object.entries(sectorValMap)
    .map(([sec, val]) => ({
      sec,
      pct:    totalValue > 0 ? val / totalValue * 100 : 0,
      target: sectorTargetMap[sec] || 0
    }))
    .sort((a, b) => b.pct - a.pct);

  const topSector    = sectorList[0]    || null;
  const bottomSector = sectorList[sectorList.length - 1] || null;
  const sectorCount  = sectorList.length;

  // ── العوائد التوزيعية ──────────────────────────────────
  const totalDivAll = divRows.reduce((s, d) => s + +d.amount, 0);
  const yearDiv     = divRows.filter(d => d.year === yr).reduce((s, d) => s + +d.amount, 0);
  // أرباح آخر 12 شهراً (TTM) — للعائد الحقيقي على التكلفة والدخل المتوقع
  const _today = new Date();
  const _yearAgo = new Date(_today.getFullYear() - 1, _today.getMonth(), _today.getDate());
  const ttmDiv = divRows.reduce((s, d) => {
    if (!d.date) return s;
    const dt = new Date(d.date);
    return dt >= _yearAgo && dt <= _today ? s + +d.amount : s;
  }, 0);

  // ── حساب رأس المال أول السنة الحالية (للعائد المُسنوى) ───
  const today_d      = new Date();
  const daysElapsed  = Math.floor((today_d - new Date(yr, 0, 1)) / 86400000) + 1;
  const daysInYear   = ((yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0) ? 366 : 365;
  // الأرباح المُسنواة للسنة الحالية
  // AUDIT-FIX (H1): linear YTD→annual extrapolation (×365/days) is unreliable early in the
  // year for lumpy / semi-annual Saudi payers — a single H1 dividend by June would scale ×2.2.
  // Only extrapolate once ≥180 days (a full semi-annual cycle) have elapsed; before that fall
  // back to the trailing-12-month figure, which is a true annual run-rate with no extrapolation.
  const annualizedYearDiv = (daysElapsed >= 180)
    ? yearDiv * (daysInYear / daysElapsed)
    : ttmDiv;
  // المقام للعائد المُسنوى: costBasis (WAC × الأسهم الحالية) هو الأدق لأنه يعكس رأس المال الفعلي المُنشغل
  // صافي التدفقات النقدية (شراء − بيع) قد يكون منخفضاً إذا ضُخّ معظم المال في نفس السنة
  const denomAnn = costBasis > 0 ? costBasis : 1;

  // الطرق الثلاث
  const divYieldAnn    = denomAnn    > 0 ? annualizedYearDiv / denomAnn    * 100 : 0; // مُسنوى
  const divYieldYOC    = costBasis   > 0 ? ttmDiv            / costBasis   * 100 : 0; // على التكلفة (آخر 12 شهر)
  // AUDIT-FIX (M2): use TTM over market value — consistent with YOC (both trailing-12m);
  // previously used annualized-YTD here while YOC used TTM, making the two tabs incomparable.
  const divYieldMarket = totalValue  > 0 ? ttmDiv / totalValue  * 100 : 0; // سوقي

  // إبقاء القديم متوافقاً
  const divYieldYear = divYieldMarket;
  const divYieldAll  = divYieldYOC;

  // ── Forward Projected Income — الأدق للمحافظ النامية ─────────
  // لكل سهم في الحيازات: (آخر دفعة ÷ أسهم وقتها) × الدورية × الأسهم الحالية
  const fwdProjected = (() => {
    const divDate = d => {
      if (d.date) return d.date;
      const mo = String(d.month || 1).padStart(2, '0');
      return `${d.year || new Date().getFullYear()}-${mo}-01`;
    };

    // I-2: build sorted shares timeline per ticker once (O(N)) — avoid O(N×M) sharesAt calls
    const tickerTimeline = {};
    txRows.forEach(t => {
      if (!t.date) return;
      if (!tickerTimeline[t.ticker]) tickerTimeline[t.ticker] = [];
      tickerTimeline[t.ticker].push({ date: t.date, type: t.type, shares: +t.shares });
    });
    Object.values(tickerTimeline).forEach(arr =>
      arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    );

    const sharesAt = (ticker, dateStr) => {
      const rows = tickerTimeline[ticker] || [];
      let s = 0;
      for (const r of rows) {
        if (r.date > dateStr) break;
        if (r.type === 'buy' || r.type === 'grant') s += r.shares;
        else if (r.type === 'sell') s -= r.shares;
      }
      return Math.max(0, s);
    };

    let total = 0;
    holdings.forEach(h => {
      if (+h.shares <= 0) return;
      const tickerDivs = divRows
        .filter(d => d.ticker === h.ticker)
        .sort((a, b) => divDate(a).localeCompare(divDate(b)));
      if (!tickerDivs.length) return;

      // بناء سلسلة الـ DPS لكل دفعة (المبلغ ÷ الأسهم وقت الدفعة) بالترتيب الزمني
      const dpsSeries = [];
      for (let i = 0; i < tickerDivs.length; i++) {
        const sh = sharesAt(h.ticker, divDate(tickerDivs[i]));
        if (sh >= 0.001) dpsSeries.push(+tickerDivs[i].amount / sh);
      }
      if (!dpsSeries.length) {
        const tot = tickerDivs.reduce((s, d) => s + +d.amount, 0);
        const fb  = tot / +h.shares;
        if (fb < 0.0001) return;
        dpsSeries.push(fb);
      }

      // L-3: use median inter-dividend gap for frequency — robust to skipped dividends
      let freq = 1;
      if (tickerDivs.length >= 2) {
        const gaps = [];
        for (let i = 1; i < tickerDivs.length; i++) {
          gaps.push(Math.floor(
            (new Date(divDate(tickerDivs[i])) - new Date(divDate(tickerDivs[i - 1]))) / 86400000
          ));
        }
        gaps.sort((a, b) => a - b);
        const medGap = gaps[Math.floor(gaps.length / 2)];
        if (medGap <= 105)      freq = 4;
        else if (medGap <= 210) freq = 2;
      }

      // AUDIT-FIX (M1): forward DPS = MEDIAN of the last `freq` per-share payments, not the single
      // latest one. A special / irregular final dividend (e.g. quarterly 1,1,1,5) would otherwise
      // inflate the forward run-rate to 5×4=20 vs the true ~4. The median ignores such outliers.
      const recent = dpsSeries.slice(-freq).sort((a, b) => a - b);
      const dps = recent[Math.floor(recent.length / 2)];
      if (dps < 0.0001) return;

      total += dps * freq * +h.shares;
    });
    return total;
  })();
  const divYieldFwd = costBasis > 0 ? fwdProjected / costBasis * 100 : 0;

  // ── XIRR — العائد الداخلي السنوي الحقيقي ─────────────────
  // التدفقات: شراء = خروج (−)، بيع = دخول (+)، توزيعات = دخول (+)
  // القيمة النهائية = القيمة السوقية للأسهم اليوم (كأنها بيعت)
  const cashflows = [];
  txRows.forEach(t => {
    if (t.type === 'buy')  cashflows.push({ date: new Date(t.date), amount: -(+t.total) });
    if (t.type === 'sell') cashflows.push({ date: new Date(t.date), amount: +(+t.total) });
    // grant: total=0 — لا تدفّق نقدي
  });
  divRows.forEach(d => {
    if (d.date) cashflows.push({ date: new Date(d.date), amount: +d.amount });
  });
  if (totalValue > 0) cashflows.push({ date: new Date(), amount: totalValue });
  const xirr = computeXIRR(cashflows);

  // ── تركيز السهم الواحد — مخاطرة مباشرة على محفظة التقاعد ──────
  // أكبر مركز كنسبة % من قيمة الأسهم، ووزن أكبر 5 مراكز مجتمعة. بيانات holdings صحيحة قطعاً.
  let largestHolding = null;
  holdings.forEach(h => {
    const v = +h.shares * +h.current_price;
    if (v > 0 && (!largestHolding || v > largestHolding.v)) largestHolding = { v, ticker: h.ticker, name: h.name || '' };
  });
  const posVals = holdings.map(h => +h.shares * +h.current_price).filter(v => v > 0).sort((a, b) => b - a);
  const concTotal   = posVals.reduce((s, v) => s + v, 0);
  const largestPosPct = concTotal > 0 ? posVals[0] / concTotal * 100 : 0;
  const top5Pct       = concTotal > 0 ? posVals.slice(0, 5).reduce((s, v) => s + v, 0) / concTotal * 100 : 0;

  // ── معدل المساهمة الصافي الشهري — محرّك الوصول لـ FIRE ────────
  // إيداع − سحب خلال آخر 12 شهراً ÷ 12. تدفّق فعلي مسجّل في cashflow_entries.
  let dep12 = 0, wd12 = 0, hasCf12 = false;
  cfRows.forEach(e => {
    if (!e.date) return;
    const dt = new Date(e.date);
    if (dt >= _yearAgo && dt <= _today) {
      hasCf12 = true;
      if (e.type === 'deposit')          dep12 += +e.amount;
      else if (e.type === 'withdrawal')  wd12  += +e.amount;
    }
  });
  const netContrib12  = dep12 - wd12;
  const monthlyContrib = netContrib12 / 12;

  // ── نمو الدخل التوزيعي السنوي (CAGR) — على السنوات المكتملة فقط ──
  // إجمالي المستلم لكل سنة تقويمية كاملة (نستثني السنة الجارية الجزئية).
  const divByYear = {};
  divRows.forEach(d => { if (d.year) divByYear[d.year] = (divByYear[d.year] || 0) + +d.amount; });
  const fullDivYears = Object.keys(divByYear).map(Number).filter(y => y < yr && divByYear[y] > 0).sort((a, b) => a - b);
  let divCagr = null, divCagrFirstY = null, divCagrLastY = null;
  if (fullDivYears.length >= 2) {
    divCagrFirstY = fullDivYears[0];
    divCagrLastY  = fullDivYears[fullDivYears.length - 1];
    const span = divCagrLastY - divCagrFirstY;
    if (span > 0 && divByYear[divCagrFirstY] > 0) {
      divCagr = (Math.pow(divByYear[divCagrLastY] / divByYear[divCagrFirstY], 1 / span) - 1) * 100;
    }
  }

  window._ds = {
    yr,
    totalInvested:   totalBuys - totalSells,
    totalBuys,
    totalSells,
    totalCommission, totalVAT,
    realizedPnL,
    totalDivAll,     yearDiv,
    divYieldYear,    divYieldAll,
    divYieldAnn, divYieldYOC, divYieldMarket, divYieldFwd,
    fwdProjected, ttmDiv, xirr,
    annualizedYearDiv, daysElapsed, daysInYear, denomAnn,
    grantMap, totalGrantShares, totalGrantTickers,
    latestNW:        nwRows[0] ? +nwRows[0].total_value : null,
    latestNWDate:    nwRows[0] ? nwRows[0].date : null,
    reTotal:         reRows.filter(p => p.status !== 'sold').reduce((s, p) => s + +p.current_value, 0),
    cashDeposited:   cfRows.filter(e => e.type === 'deposit'    && new Date(e.date).getFullYear() === yr).reduce((s,e) => s + +e.amount, 0),
    cashWithdrawn:   cfRows.filter(e => e.type === 'withdrawal' && new Date(e.date).getFullYear() === yr).reduce((s,e) => s + +e.amount, 0),
    stockCount:      holdings.length,
    sectorCount,     topSector, bottomSector,
    largestPosPct, top5Pct, largestHolding,
    monthlyContrib, netContrib12, hasCf12,
    divCagr, divCagrFirstY, divCagrLastY,
  };
}

async function reloadHoldings() {
  const [{ data: hData }, { data: stData }] = await Promise.all([
    supabaseClient.from('holdings').select('*').order('ticker'),
    supabaseClient.from('stock_targets').select('ticker, target_pct, entry_price, exit_price')
  ]);
  stockTargets = {};
  stockZones   = {};
  (stData || []).forEach(r => {
    stockTargets[r.ticker] = +r.target_pct;
    stockZones[r.ticker]   = { entry_price: r.entry_price ?? null, exit_price: r.exit_price ?? null };
  });
  holdings = (hData || []).map(h => {
    if (stockTargets[h.ticker] !== undefined) h.target_weight = stockTargets[h.ticker];
    return h;
  });
  renderRebalancingAlerts();
  renderPortfolioHealthCard(); renderDiversificationCard();
}

// ── Tab: طريقة حساب رأس المال ────────────────────────────────
function switchInvestedTab(tab) {
  investedTab = tab;
  document.getElementById('tab-invested-net')?.classList.toggle('mini-tab-active', tab === 'net');
  document.getElementById('tab-invested-wac')?.classList.toggle('mini-tab-active', tab === 'wac');
  const s         = window._ds || {};
  const costBasis = holdings.reduce((a, h) => a + +h.shares * +h.avg_price, 0);
  if (tab === 'net') {
    setText('stat-invested-label', 'صافي رأس المال المنشغل');
    setText('stat-invested',       formatSAR(s.totalInvested || 0));
    setText('stat-invested-sub',   'إجمالي شراء − إجمالي بيع');
  } else {
    setText('stat-invested-label', 'تكلفة المحفظة (WAC)');
    setText('stat-invested',       formatSAR(costBasis));
    setText('stat-invested-sub',   'أسهم × متوسط سعر الشراء');
  }
}

// ── Tab: طريقة حساب العائد التوزيعي ─────────────────────────
function switchYieldTab(tab) {
  yieldTab = tab;
  const s = window._ds || {};
  ['ann','yoc','market','fwd'].forEach(t => {
    document.getElementById('tab-yield-' + t)?.classList.toggle('mini-tab-active', t === tab);
  });

  const yr = s.yr || new Date().getFullYear();

  if (tab === 'ann') {
    setText('yield-tab-label', 'العائد المُسنوى — السنة الجارية');
    setText('stat-div-yield',  (s.divYieldAnn || 0).toFixed(2) + '%');
    const note = s.daysElapsed
      ? `أرباح ${formatSAR(s.yearDiv||0)} × (${s.daysInYear}÷${s.daysElapsed}) ÷ تكلفة المحفظة (WAC)`
      : 'أرباح السنة الجارية مُسنواة';
    setText('stat-div-yield-sub', note);
  } else if (tab === 'yoc') {
    setText('yield-tab-label', 'العائد على التكلفة (YOC)');
    setText('stat-div-yield',  (s.divYieldYOC || 0).toFixed(2) + '%');
    setText('stat-div-yield-sub', `TTM (${formatSAR(s.ttmDiv||0)}) ÷ تكلفة الشراء`);
  } else if (tab === 'fwd') {
    setText('yield-tab-label', '▶ العائد المتوقع (Forward) — على التكلفة');
    setText('stat-div-yield',  (s.divYieldFwd || 0).toFixed(2) + '%');
    setText('stat-div-yield-sub', `${formatSAR(s.fwdProjected||0)}/سنة ≈ ${formatSAR((s.fwdProjected||0)/12)}/شهر ÷ التكلفة (WAC)`);
  } else {
    setText('yield-tab-label', 'العائد السوقي — التوزيع الجاري');
    setText('stat-div-yield',  (s.divYieldMarket || 0).toFixed(2) + '%');
    // AUDIT-FIX: الحساب فعلياً TTM ÷ القيمة السوقية (لا «أرباح السنة مُسنواة») — صُحّح النص ليطابق الكود
    setText('stat-div-yield-sub', `TTM (${formatSAR(s.ttmDiv||0)}) ÷ القيمة السوقية الحالية`);
  }

  // لون حسب القيمة
  const val = tab === 'ann'    ? (s.divYieldAnn||0)
            : tab === 'yoc'    ? (s.divYieldYOC||0)
            : tab === 'fwd'    ? (s.divYieldFwd||0)
            : (s.divYieldMarket||0);
  const el = document.getElementById('stat-div-yield');
  if (el) el.className = 'value num ' + (val >= 5 ? 'text-success' : val >= 3 ? 'text-accent' : 'text-muted');
}

// ── شارات موثوقية الكروت ──────────────────────────────────────
// 🟢 عالية = رقم محسوب مباشرة من بياناتك الفعلية (لا افتراضات)
// 🟡 متوسطة = يعتمد على افتراض (سعر محدّث / نسبة سحب / تقدير زمني)
// 🔵 إرشادي = مؤشر توجيهي يتغيّر مع الأسعار والأهداف
const _RELIABILITY = {
  high:   { dot: '🟢', label: 'موثوقية عالية — رقم محسوب مباشرة من بياناتك الفعلية' },
  medium: { dot: '🟡', label: 'موثوقية متوسطة — يعتمد على افتراض (سعر محدّث / نسبة سحب / تقدير زمني)' },
  low:    { dot: '🔵', label: 'إرشادي للتوجيه — مؤشر يتغيّر مع الأسعار والأهداف' },
};
const _CARD_RELIABILITY = {
  // 🟢 حقائق من بياناتك
  'total-value': 'high', 'portfolio-cash': 'high', 'realestate': 'high', 'invested': 'high',
  'capital': 'high', 'pnl': 'high', 'realized': 'high', 'total-return': 'high', 'total-div': 'high', 'year-div': 'high',
  'cashflow': 'high', 'composition': 'high', 'costs': 'high', 'fwd-income': 'high',
  'total-assets': 'high', 'concentration': 'high', 'contribution': 'high',
  // 🟡 تعتمد افتراضات
  'networth': 'medium', 'div-yield': 'medium', 'xirr': 'medium', 'passive-cover': 'medium',
  'div-growth': 'medium', 'retirement': 'medium', 'breakeven': 'medium',
  // 🔵 إرشادي للتوجيه
  'top-sector': 'low', 'bot-sector': 'low', 'allocation': 'low',
};
function applyReliabilityBadges() {
  document.querySelectorAll('.info-btn').forEach(btn => {
    const m = (btn.getAttribute('onclick') || '').match(/showCardInfo\('([^']+)'\)/);
    if (!m) return;
    const tier = _CARD_RELIABILITY[m[1]];
    if (!tier) return;
    const card = btn.closest('.stat-card, .card');
    if (!card) return;
    const labelEl = card.querySelector('.label, .section-title');
    if (!labelEl || labelEl.querySelector('.reliability-badge')) return;
    const r = _RELIABILITY[tier];
    const span = document.createElement('span');
    span.className = 'reliability-badge';
    span.textContent = r.dot;
    span.title = r.label;
    span.style.cssText = 'font-size:.62rem;margin-inline-start:5px;cursor:help;vertical-align:middle';
    labelEl.appendChild(span);
  });
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
  const s          = window._ds || {};
  const totalValue = holdings.reduce((a, h) => a + +h.shares * +h.current_price, 0);
  const costBasis  = holdings.reduce((a, h) => a + +h.shares * +h.avg_price,     0);
  const pnl        = totalValue - costBasis;
  const pnlPct     = costBasis > 0 ? pnl / costBasis * 100 : 0;

  const totalWithCash = totalValue + portfolioCash;
  setText('stat-total-value', formatSAR(totalWithCash));
  const tvSub = g('stat-total-value-sub');
  if (tvSub) tvSub.textContent = portfolioCash > 0
    ? `أسهم ${formatSAR(totalValue)} + نقد ${formatSAR(portfolioCash)}`
    : 'أسهم × السعر الحالي';

  // نقد المحفظة
  setText('stat-portfolio-cash', portfolioCash > 0 ? formatSAR(portfolioCash) : '—');
  const cashSubEl = g('stat-portfolio-cash-sub');
  if (cashSubEl) cashSubEl.textContent = cashUpdatedAt
    ? 'آخر تحديث: ' + formatDate(cashUpdatedAt.split('T')[0])
    : 'انقر للإدخال';

  // رأس المال — يعتمد على التاب المختار
  switchInvestedTab(investedTab);

  const pnlEl    = g('stat-pnl');
  const pnlPctEl = g('stat-pnl-pct');
  if (pnlEl)    { pnlEl.textContent = formatSAR(pnl, true); pnlEl.className = 'value num ' + (pnl >= 0 ? 'text-success' : 'text-danger'); }
  if (pnlPctEl) { pnlPctEl.textContent = (pnl >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%'; pnlPctEl.className = 'sub ' + (pnl >= 0 ? 'text-success' : 'text-danger'); }

  // ── إجمالي العائد منذ البداية ─────────────────────────────────
  // الربح الكلي = (غير محقق) + (محقق من البيع) + (كل التوزيعات)
  //            = القيمة السوقية + إجمالي المبيعات + إجمالي التوزيعات − إجمالي المشتريات
  // النسبة على إجمالي المشتريات (رأس المال المنشغل) — عائد تراكمي بسيط، غير مُسنوى.
  const trEl    = g('stat-total-return');
  const trSubEl = g('stat-total-return-sub');
  if (trEl) {
    const totalBuys = s.totalBuys || 0;
    if (totalBuys > 0) {
      const totalProfit = totalValue + (s.totalSells || 0) + (s.totalDivAll || 0) - totalBuys;
      const totalRetPct = totalProfit / totalBuys * 100;
      trEl.textContent = formatSAR(totalProfit, true) + ` (${totalProfit >= 0 ? '+' : ''}${totalRetPct.toFixed(1)}%)`;
      trEl.className = 'value num ' + (totalProfit >= 0 ? 'text-success' : 'text-danger');
      if (trSubEl) trSubEl.textContent = `القيمة الحالية + المبيعات + التوزيعات − المشتريات`;
    } else {
      trEl.textContent = '—';
      trEl.className = 'value num text-muted';
      if (trSubEl) trSubEl.textContent = 'يحتاج معاملات شراء مسجّلة';
    }
  }

  setText('stat-net-worth', s.latestNW != null ? formatSAR(s.latestNW) : '—');
  setText('stat-nw-date',   s.latestNWDate ? formatDate(s.latestNWDate) : 'لا توجد لقطة');

  setText('stat-total-div',   formatSAR(s.totalDivAll || 0));
  setText('stat-year-div',    formatSAR(s.yearDiv     || 0));
  setText('stat-year-label',  'أرباح ' + (s.yr || new Date().getFullYear()));
  switchYieldTab(yieldTab);
  setText('stat-realestate',  formatSAR(s.reTotal || 0));
  const cashNet = (s.cashDeposited || 0) - (s.cashWithdrawn || 0);
  const cashEl = g('stat-cash-actual');
  if (cashEl) { cashEl.textContent = formatSAR(cashNet, true); cashEl.className = 'value num ' + (cashNet >= 0 ? 'text-success' : 'text-danger'); }
  setText('stat-cash-sub', `إيداع ${formatSAR(s.cashDeposited||0)} / سحب ${formatSAR(s.cashWithdrawn||0)}`);
  const fill = g('stat-cash-fill');
  if (fill) { fill.style.width = s.cashDeposited > 0 ? '100%' : '0%'; fill.style.background = 'var(--accent)'; }

  // ── صف 5: الأداء السنوي والدخل ────────────────────────────
  const xirrEl = g('stat-xirr');
  if (xirrEl) {
    if (s.xirr == null) {
      xirrEl.textContent = '—';
      xirrEl.className = 'value num text-muted';
      setText('stat-xirr-sub', 'يحتاج معاملات شراء وبيع/توزيعات');
    } else {
      xirrEl.textContent = (s.xirr >= 0 ? '+' : '') + s.xirr.toFixed(2) + '%';
      xirrEl.className = 'value num ' + (s.xirr >= 0 ? 'text-success' : 'text-danger');
      // ── تحذير جودة البيانات: أسعار قديمة تُضعف دقة XIRR ───
      if (hasStalePrice()) {
        setText('stat-xirr-sub', '⚠️ بعض الأسعار قديمة — الدقة منخفضة');
        const subEl = g('stat-xirr-sub');
        if (subEl) subEl.style.color = 'var(--danger)';
      } else {
        setText('stat-xirr-sub', 'سنوياً — يشمل التوقيت والتوزيعات');
        const subEl = g('stat-xirr-sub');
        if (subEl) subEl.style.color = '';
      }
    }
  }

  // الدخل التوزيعي المتوقع — Forward Projected (الأدق للمحافظ النامية)
  const fwdIncome  = s.fwdProjected || 0;
  const ttmIncome  = s.ttmDiv || 0;
  setText('stat-fwd-income', formatSAR(fwdIncome || ttmIncome));
  const fwdYield = costBasis > 0 ? (fwdIncome || ttmIncome) / costBasis * 100 : 0;
  const fwdNote  = fwdIncome > 0
    ? `Forward · ≈ ${formatSAR(fwdIncome/12)}/شهر · ${fwdYield.toFixed(2)}%`
    : `TTM · ≈ ${formatSAR(ttmIncome/12)}/شهر · ${fwdYield.toFixed(2)}%`;
  setText('stat-fwd-income-sub', fwdNote);

  // إجمالي الأصول الاستثمارية
  const sukukTotal  = getSukukActiveTotal();
  const totalAssets = totalValue + portfolioCash + (s.reTotal || 0) + sukukTotal;
  setText('stat-total-assets', formatSAR(totalAssets));

  // تغطية الدخل السلبي للمصاريف
  const goal = getRetirementGoal();
  const coverEl = g('stat-passive-cover');
  if (coverEl) {
    if (goal.monthly > 0) {
      const monthlyIncome = fwdIncome / 12;
      const coverPct = goal.monthly > 0 ? monthlyIncome / goal.monthly * 100 : 0;
      coverEl.textContent = coverPct.toFixed(1) + '%';
      coverEl.className = 'value num ' + (coverPct >= 100 ? 'text-success' : coverPct >= 25 ? 'text-accent' : 'text-muted');
      setText('stat-passive-cover-sub', `دخل ${formatSAR(monthlyIncome)}/شهر مقابل مصاريف ${formatSAR(goal.monthly)}`);
    } else {
      coverEl.textContent = '—';
      coverEl.className = 'value num text-muted';
      setText('stat-passive-cover-sub', 'أدخل مصاريفك في بطاقة هدف التقاعد');
    }
  }

  // ── صف 6: التركيز والنمو ──────────────────────────────────
  // تركيز السهم الواحد
  const concEl = g('stat-concentration');
  if (concEl) {
    if (s.largestHolding && s.largestPosPct > 0) {
      concEl.textContent = s.largestPosPct.toFixed(1) + '%';
      // >25% تركيز خطر، >15% مرتفع، غير ذلك صحي — لمحفظة تقاعد
      concEl.className = 'value num ' + (s.largestPosPct >= 25 ? 'text-danger' : s.largestPosPct >= 15 ? 'text-accent' : 'text-success');
      const nm = s.largestHolding.name ? `${s.largestHolding.ticker} — ${s.largestHolding.name}` : s.largestHolding.ticker;
      setText('stat-concentration-name', 'أكبر مركز: ' + nm);
      setText('stat-concentration-sub', `أكبر 5 مراكز: ${s.top5Pct.toFixed(1)}% من قيمة الأسهم`);
    } else {
      concEl.textContent = '—';
      concEl.className = 'value num text-muted';
      setText('stat-concentration-name', 'لا توجد حيازات');
      setText('stat-concentration-sub', '');
    }
  }

  // معدل المساهمة الصافي الشهري
  const contribEl = g('stat-contribution');
  if (contribEl) {
    if (s.hasCf12) {
      contribEl.textContent = formatSAR(s.monthlyContrib);
      contribEl.className = 'value num ' + (s.monthlyContrib > 0 ? 'text-success' : s.monthlyContrib < 0 ? 'text-danger' : 'text-muted');
      setText('stat-contribution-sub', `صافي ${formatSAR(s.netContrib12)} خلال آخر 12 شهراً ÷ 12`);
    } else {
      contribEl.textContent = '—';
      contribEl.className = 'value num text-muted';
      setText('stat-contribution-sub', 'سجّل إيداعاتك وسحوباتك في صفحة التدفقات النقدية');
    }
  }

  // نمو الدخل التوزيعي السنوي (CAGR)
  const dgrEl = g('stat-div-growth');
  if (dgrEl) {
    if (s.divCagr != null) {
      dgrEl.textContent = (s.divCagr >= 0 ? '+' : '') + s.divCagr.toFixed(1) + '%';
      dgrEl.className = 'value num ' + (s.divCagr >= 0 ? 'text-success' : 'text-danger');
      setText('stat-div-growth-sub', `متوسط النمو السنوي لدخلك التوزيعي (${s.divCagrFirstY}→${s.divCagrLastY})`);
    } else {
      dgrEl.textContent = '—';
      dgrEl.className = 'value num text-muted';
      setText('stat-div-growth-sub', 'يحتاج توزيعات في سنتين مكتملتين على الأقل');
    }
  }

  renderInsights(s, totalValue, costBasis, pnl, pnlPct);
}

// ══════════════════════════════════════════════════════════════
// ⚖️ بانر تنبيهات إعادة التوازن
// يعرض الأسهم المنحرفة عن أوزانها المستهدفة بناءً على عتبات التنبيه
// ══════════════════════════════════════════════════════════════
function renderRebalancingAlerts() {
  const el = document.getElementById('rebal-alerts-banner');
  if (!el) return;

  if (!holdings.length || !Object.keys(stockTargets).length) {
    el.style.display = 'none';
    return;
  }

  const totalVal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  if (!totalVal) { el.style.display = 'none'; return; }

  const green  = +(localStorage.getItem(userLsKey('tharwa-alert-green'))  ?? localStorage.getItem('tharwa-alert-green')  ?? 1);
  const yellow = +(localStorage.getItem(userLsKey('tharwa-alert-yellow')) ?? localStorage.getItem('tharwa-alert-yellow') ?? 3);

  // حساب الانحرافات لكل سهم له هدف
  const deviations = [];
  for (const [ticker, target] of Object.entries(stockTargets)) {
    if (!target) continue;
    const h = holdings.find(x => x.ticker === ticker);
    const current = h ? (+h.shares * +h.current_price) / totalVal * 100 : 0;
    const diff = current - target;
    if (Math.abs(diff) > green) {
      deviations.push({ ticker, name: h?.name || ticker, current, target, diff });
    }
  }

  if (!deviations.length) { el.style.display = 'none'; return; }

  const reds    = deviations.filter(d => Math.abs(d.diff) > yellow);
  const yellows = deviations.filter(d => Math.abs(d.diff) > green && Math.abs(d.diff) <= yellow);

  // ترتيب تنازلي بالانحراف المطلق
  deviations.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const top = deviations.slice(0, 4);

  const borderColor = reds.length    ? 'rgba(248,81,73,.35)'  : 'rgba(240,180,41,.35)';
  const bgColor     = reds.length    ? 'rgba(248,81,73,.05)'  : 'rgba(240,180,41,.05)';
  const badgeColor  = reds.length    ? '#f85149'              : '#f0b429';
  const title       = reds.length
    ? `⚖️ ${reds.length} سهم منحرف بشكل حاد عن الهدف (> ${yellow}%)`
    : `⚠️ ${yellows.length} سهم خارج النطاق الأمثل (> ${green}%)`;

  const chips = top.map(d => {
    const isRed     = Math.abs(d.diff) > yellow;
    const color     = isRed ? '#f85149' : '#f0b429';
    const arrow     = d.diff > 0 ? '↑' : '↓';
    const sign      = d.diff > 0 ? '+' : '';
    const isUnder   = d.diff < 0; // ناقص الوزن → اقتراح شراء
    const h         = holdings.find(x => x.ticker === d.ticker);
    const curPrice  = h ? +h.current_price : null;
    const zone      = stockZones[d.ticker];
    const entryPx   = zone?.entry_price ?? null;
    // تحذير: السهم ناقص الوزن لكن سعره فوق هدف الشراء
    const aboveEntry = isUnder && entryPx != null && curPrice != null && curPrice > entryPx;
    const warningTag = aboveEntry
      ? `<span title="السعر الحالي ${curPrice} فوق هدف الشراء ${entryPx} — تحقق من القيمة العادلة قبل الشراء" style="font-size:.7rem;background:rgba(248,81,73,.15);color:#f85149;border-radius:4px;padding:1px 5px;margin-right:2px">⚠️ فوق الهدف</span>`
      : '';
    return `<span style="
      display:inline-flex;align-items:center;gap:4px;
      background:${color}18;border:1px solid ${color}40;
      border-radius:20px;padding:3px 10px;font-size:.78rem;font-weight:600;
      color:${color};white-space:nowrap
    ">${esc(d.ticker)} ${arrow}${sign}${d.diff.toFixed(1)}%
      <span style="font-weight:400;color:var(--text-muted)">${d.current.toFixed(1)}%→${d.target}%</span>
      ${warningTag}
    </span>`;
  }).join('');

  const moreCount = deviations.length - top.length;

  el.style.display = 'block';
  el.style.marginBottom = '16px';
  el.innerHTML = `
    <div style="
      border:1px solid ${borderColor};background:${bgColor};
      border-radius:10px;padding:12px 16px;
      display:flex;align-items:center;flex-wrap:wrap;gap:10px;
    ">
      <span style="font-weight:700;font-size:.88rem;flex-shrink:0">${title}</span>
      <div style="display:flex;flex-wrap:wrap;gap:6px;flex:1">${chips}</div>
      ${moreCount > 0 ? `<span class="small text-muted" style="white-space:nowrap">+${moreCount} أخرى</span>` : ''}
      <a href="targets.html" class="btn btn-secondary btn-sm" style="flex-shrink:0;margin-right:auto">⚖️ إعادة التوازن →</a>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// 🏥 محلل صحة المحفظة
//
// كل مقياس مبني على بيانات موثوقة 100% من المحفظة الفعلية:
//   - التنوع والتركيز  ← holdings
//   - التوزيعات        ← _ds.fwdProjected (Forward Income)
//   - هدف الاستقلال    ← retirement_goal_v1 + _ds.latestNW
//
// المرجعية العلمية:
//   - Benjamin Graham (The Intelligent Investor) — نطاقات عدد الأسهم
//   - Peter Lynch (mبدأ "diworsification")
//   - Modern Portfolio Theory — التركيز القطاعي وتأثيره على التشتت
// ══════════════════════════════════════════════════════════════

function renderPortfolioHealthCard() {
  const el = document.getElementById('portfolio-health-card');
  if (!el) return;

  const totalVal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  if (!holdings.length || !totalVal) { el.style.display = 'none'; return; }
  el.style.display = '';

  const s    = window._ds || {};
  const goal = getRetirementGoal();
  const gThr = +(localStorage.getItem(userLsKey('tharwa-alert-green'))  ?? localStorage.getItem('tharwa-alert-green')  ?? 1);
  const yThr = +(localStorage.getItem(userLsKey('tharwa-alert-yellow')) ?? localStorage.getItem('tharwa-alert-yellow') ?? 3);

  // ── 1. تنوع الأسهم والقطاعات ───────────────────────────────
  const stockCount = holdings.length;

  const sectorMap = {};
  holdings.forEach(h => {
    const sec = (h.sector || '').trim() || 'غير مصنف';
    sectorMap[sec] = (sectorMap[sec] || 0) + +h.shares * +h.current_price;
  });
  const sectorCount = Object.keys(sectorMap).length;
  const sectorEntries = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);
  const largestSectorPct  = sectorEntries[0] ? sectorEntries[0][1] / totalVal * 100 : 0;
  const largestSectorName = sectorEntries[0]?.[0] || '';

  // ── 2. تركيز الحيازات ──────────────────────────────────────
  const sorted = [...holdings]
    .map(h => ({ ticker: h.ticker, name: h.name || h.ticker,
                 w: +h.shares * +h.current_price / totalVal * 100 }))
    .sort((a, b) => b.w - a.w);
  const top1Pct  = sorted[0]?.w   || 0;
  const top1Name = sorted[0]?.ticker || '';
  const top3Pct  = sorted.slice(0, 3).reduce((s, h) => s + h.w, 0);

  // ── 3. التوزيعات vs الهدف ──────────────────────────────────
  const fwdMonthly    = (s.fwdProjected || 0) / 12;
  const monthlyTarget = goal.monthly || 0;

  // ── 4. التوافق مع هدف الاستقلال المالي ──────────────────────
  const fireNumber = goal.monthly > 0 && goal.swr > 0
    ? (goal.monthly * 12) / (goal.swr / 100) : 0;
  const latestNW    = s.latestNW || totalVal;
  const fireProgress = fireNumber > 0 ? Math.min(latestNW / fireNumber * 100, 100) : null;
  const targetYear  = goal.target_year || 0;
  const yearsLeft   = targetYear > 0 ? targetYear - new Date().getFullYear() : null;

  // ── 5. انضباط الأوزان ──────────────────────────────────────
  const hasTargets = Object.values(stockTargets).some(t => t > 0);
  let redDev = 0, yDev = 0;
  if (hasTargets) {
    Object.entries(stockTargets).forEach(([ticker, target]) => {
      if (!target) return;
      const h   = holdings.find(x => x.ticker === ticker);
      const cur = h ? +h.shares * +h.current_price / totalVal * 100 : 0;
      const d   = Math.abs(cur - target);
      if (d > yThr)       redDev++;
      else if (d > gThr)  yDev++;
    });
  }

  // ══════════════════════════════════════════════════════════
  // تقييم كل بُعد  → 'green' | 'yellow' | 'red' | 'gray'
  // ══════════════════════════════════════════════════════════

  // بُعد A: التنوع
  let aScore, aLabel, aDetail;
  if (stockCount < 5) {
    aScore = 'red';    aLabel = 'تركيز عالٍ';
    aDetail = `${stockCount} أسهم · ${sectorCount} قطاع — أقل من 5 أسهم يُعرّض المحفظة لخسائر حادة`;
  } else if (stockCount <= 9 || sectorCount <= 2) {
    aScore = 'yellow'; aLabel = 'تنوع محدود';
    aDetail = `${stockCount} أسهم · ${sectorCount} قطاع${sectorCount <= 2 ? ' — قطاعات غير كافية للحماية' : ''}`;
  } else if (stockCount <= 20 && sectorCount >= 4) {
    aScore = 'green';  aLabel = 'تنوع جيد';
    aDetail = `${stockCount} أسهم · ${sectorCount} قطاعات — النطاق الأمثل لمحفظة التوزيعات`;
  } else if (stockCount > 25) {
    aScore = 'yellow'; aLabel = 'مراقبة التشتت';
    aDetail = `${stockCount} سهماً — تأكد أن كل سهم يضيف قيمة فعلية (Peter Lynch: diworsification)`;
  } else {
    aScore = 'green';  aLabel = 'تنوع جيد';
    aDetail = `${stockCount} أسهم · ${sectorCount} قطاعات`;
  }

  // بُعد B: التركيز
  const _top1NameE = esc(top1Name);
  const _largSecE  = esc(largestSectorName);
  let bScore, bLabel, bDetail;
  if (top1Pct > 30 || top3Pct > 65 || largestSectorPct > 50) {
    bScore = 'red';    bLabel = 'تركيز مرتفع جداً';
    bDetail = `أكبر سهم (${_top1NameE}): ${top1Pct.toFixed(1)}% · أكبر 3: ${top3Pct.toFixed(1)}% · أكبر قطاع: ${largestSectorPct.toFixed(1)}%`;
  } else if (top1Pct > 20 || top3Pct > 50 || largestSectorPct > 38) {
    bScore = 'yellow'; bLabel = 'تركيز مرتفع';
    bDetail = `أكبر سهم (${_top1NameE}): ${top1Pct.toFixed(1)}% · أكبر قطاع (${_largSecE}): ${largestSectorPct.toFixed(1)}%`;
  } else {
    bScore = 'green';  bLabel = 'توزيع متوازن';
    bDetail = `أكبر سهم: ${top1Pct.toFixed(1)}% · أكبر قطاع (${_largSecE}): ${largestSectorPct.toFixed(1)}% · أكبر 3: ${top3Pct.toFixed(1)}%`;
  }

  // بُعد C: التوزيعات vs الهدف
  let cScore, cLabel, cDetail;
  if (!monthlyTarget) {
    cScore = 'gray';   cLabel = 'هدف غير محدد';
    cDetail = `دخل متوقع ${formatSAR(fwdMonthly)}/شهر — حدد هدف FIRE لمقارنة التقدم`;
  } else {
    const ratio = fwdMonthly / monthlyTarget * 100;
    if (ratio >= 100) {
      cScore = 'green';  cLabel = 'يغطي الهدف';
      cDetail = `${formatSAR(fwdMonthly)}/شهر ≥ الهدف ${formatSAR(monthlyTarget)} ✅`;
    } else if (ratio >= 60) {
      cScore = 'yellow'; cLabel = `${ratio.toFixed(0)}% من الهدف`;
      cDetail = `${formatSAR(fwdMonthly)}/شهر من أصل ${formatSAR(monthlyTarget)} — متقدم في مرحلة البناء`;
    } else {
      cScore = 'yellow'; cLabel = `${ratio.toFixed(0)}% من الهدف`;
      cDetail = `${formatSAR(fwdMonthly)}/شهر من أصل ${formatSAR(monthlyTarget)} — طبيعي في مراحل التراكم المبكرة`;
    }
  }

  // بُعد D: التوافق مع الهدف الزمني
  let dScore, dLabel, dDetail;
  if (fireProgress === null) {
    dScore = 'gray';   dLabel = 'هدف غير محدد';
    dDetail = yearsLeft != null ? `${yearsLeft} سنة حتى ${targetYear}` : 'حدد هدف FIRE + سنة التقاعد';
  } else if (fireProgress >= 100) {
    dScore = 'green';  dLabel = 'الهدف محقق';
    dDetail = `100% — صافي ثروتك يكفي للاستقلال المالي${yearsLeft != null ? ` · ${yearsLeft} سنة حتى ${targetYear}` : ''}`;
  } else {
    const pStr = fireProgress.toFixed(0) + '%';
    const rem  = formatSAR(Math.max(0, fireNumber - latestNW));
    if (fireProgress >= 50) {
      dScore = 'yellow'; dLabel = `${pStr} من الهدف`;
    } else {
      dScore = 'yellow'; dLabel = `${pStr} من الهدف`;
    }
    dDetail = `${pStr} — متبقي ${rem}${yearsLeft != null ? ` · ${yearsLeft} سنة حتى ${targetYear}` : ''}`;
  }

  // ══════════════════════════════════════════════════════════
  // التوصيات — كل توصية مبنية على بيانات حقيقية ومحددة
  // ══════════════════════════════════════════════════════════
  const tips = [];

  // T1: عدد الأسهم
  if (stockCount < 5)
    tips.push({ lvl:'red',    txt: `${stockCount} أسهم فقط — الخسارة في سهم واحد تؤثر بشكل كبير. الهدف: 10–15 سهم على الأقل لمحفظة توزيعات منيعة` });
  else if (stockCount < 8)
    tips.push({ lvl:'yellow', txt: `${stockCount} أسهم — تنوع أولي جيد. استمر بالإضافة وصولاً للنطاق الأمثل (10–20 سهم)` });
  else if (stockCount > 25)
    tips.push({ lvl:'yellow', txt: `${stockCount} سهماً — راجع كل سهم: هل تعرفه وتتابعه؟ الأسهم التي لا تعرفها جيداً تزيد المخاطر لا تقللها` });

  // T2: عدد القطاعات
  if (sectorCount === 1)
    tips.push({ lvl:'red',    txt: `قطاع واحد فقط (${_largSecE}) — أزمة في هذا القطاع ستضرب 100% من محفظتك. أضف قطاعات مختلفة` });
  else if (sectorCount === 2)
    tips.push({ lvl:'red',    txt: `قطاعان فقط — غير كافٍ للحماية من الصدمات القطاعية. الهدف: 4–5 قطاعات` });
  else if (sectorCount === 3)
    tips.push({ lvl:'yellow', txt: `3 قطاعات — إضافة قطاع رابع يزيد الحماية بشكل ملحوظ ضد أزمات القطاع الواحد` });

  // T3: تركيز أكبر سهم
  if (top1Pct > 30)
    tips.push({ lvl:'red',    txt: `${_top1NameE} يشكل ${top1Pct.toFixed(1)}% — تراجع حاد في هذا السهم وحده يُضعف المحفظة بشكل كبير. الهدف: لا سهم > 20%` });
  else if (top1Pct > 20)
    tips.push({ lvl:'yellow', txt: `${_top1NameE} يشكل ${top1Pct.toFixed(1)}% — تركيز مرتفع. خفّضه تدريجياً لأقل من 20% عند أي فرصة إعادة توازن` });

  // T4: تركيز قطاعي
  if (largestSectorPct > 50)
    tips.push({ lvl:'red',    txt: `قطاع ${_largSecE} يشكل ${largestSectorPct.toFixed(1)}% — تركيز قطاعي مرتفع جداً. أضف أسهماً من قطاعات دفاعية` });
  else if (largestSectorPct > 38)
    tips.push({ lvl:'yellow', txt: `قطاع ${_largSecE} (${largestSectorPct.toFixed(1)}%) — حاول إبقاؤه دون 35% وزيادة القطاعات الأخرى` });

  // T5: الأوزان
  if (hasTargets && redDev > 0)
    tips.push({ lvl:'yellow', txt: `${redDev} سهم منحرف بشكل حاد عن هدفه — افتح "أهداف الأسهم" للتصحيح قبل أن يتسع الانحراف` });
  else if (!hasTargets && stockCount >= 5)
    tips.push({ lvl:'blue',   txt: `لم تحدد أهداف أوزان بعد — تحديد وزن لكل سهم يجعل قرارات الشراء والبيع أكثر انضباطاً وأقل عاطفية` });

  // T6: التوزيعات
  if (monthlyTarget > 0 && fwdMonthly < monthlyTarget * 0.4) {
    const fwdYoc = (s.divYieldFwd || 0);
    if (fwdYoc > 0.5) {
      const neededPort = (monthlyTarget * 12) / (fwdYoc / 100);
      tips.push({ lvl:'blue',  txt: `لتحقيق ${formatSAR(monthlyTarget)}/شهر بعائد ${fwdYoc.toFixed(1)}% تحتاج محفظة بحجم ${formatSAR(neededPort)} — اجعل هذا هدفك المرحلي` });
    }
  }

  // T7: هدف زمني
  if (targetYear > 0 && yearsLeft != null && yearsLeft <= 5 && fireProgress !== null && fireProgress < 80)
    tips.push({ lvl:'red',    txt: `${yearsLeft} سنوات فقط للوصول ${targetYear} ونسبة الإنجاز ${fireProgress?.toFixed(0)}% — قد تحتاج لزيادة الادخار الشهري أو مراجعة الهدف` });

  const shownTips = tips.slice(0, 4);  // حد أقصى 4 توصيات

  // ══════════════════════════════════════════════════════════
  // دوال مساعدة للرسم
  // ══════════════════════════════════════════════════════════
  const DOT = {
    green:  `<span style="color:#3fb950;font-size:.95rem;line-height:1">●</span>`,
    yellow: `<span style="color:#f0b429;font-size:.95rem;line-height:1">●</span>`,
    red:    `<span style="color:#f85149;font-size:.95rem;line-height:1">●</span>`,
    gray:   `<span style="color:#8b949e;font-size:.95rem;line-height:1">○</span>`,
  };
  const CLR = { green:'#3fb950', yellow:'#f0b429', red:'#f85149', gray:'#8b949e' };
  const TIP_CLR = { red:'#f85149', yellow:'#f0b429', blue:'#58a6ff', green:'#3fb950' };

  const dimRow = (dot, labelTxt, score, detail) => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="width:18px;flex-shrink:0;padding-top:1px">${DOT[dot] || DOT.gray}</div>
      <div style="flex:0 0 110px;font-weight:600;font-size:.83rem;color:${CLR[score] || CLR.gray};padding-top:1px">${labelTxt}</div>
      <div style="flex:1;font-size:.82rem;color:var(--text-2);line-height:1.5">${detail}</div>
    </div>`;

  const tipHtml = shownTips.map(t => `
    <div style="display:flex;gap:8px;margin-bottom:7px;align-items:flex-start">
      <span style="flex-shrink:0;width:7px;height:7px;border-radius:50%;background:${TIP_CLR[t.lvl]||'#8b949e'};margin-top:5px"></span>
      <span style="font-size:.82rem;color:var(--text-2);line-height:1.6">${t.txt}</span>
    </div>`).join('');

  // ══════════════════════════════════════════════════════════
  // رسم الكارت
  // ══════════════════════════════════════════════════════════
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      <span style="font-weight:700;font-size:.95rem">🏥 محلل صحة المحفظة</span>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${targetYear > 0
          ? `<span class="small text-muted" style="white-space:nowrap">🎯 ${targetYear} · ${formatSAR(monthlyTarget||0)}/شهر · SWR ${goal.swr||4}%</span>`
          : `<span class="small text-muted">لم يُحدَّد هدف التقاعد بعد</span>`}
        <button class="btn btn-secondary btn-sm" onclick="editRetirementGoal()" style="font-size:.72rem">✏️ تعديل الهدف</button>
        <button class="btn btn-secondary btn-sm" onclick="showHealthInfo()"     style="font-size:.72rem">ⓘ المنهجية</button>
      </div>
    </div>

    <div style="margin-bottom:14px">
      ${dimRow(aScore, aLabel, aScore, aDetail)}
      ${dimRow(bScore, bLabel, bScore, bDetail)}
      ${dimRow(cScore, cLabel, cScore, cDetail)}
      ${dimRow(dScore, dLabel, dScore, dDetail)}
    </div>

    ${shownTips.length ? `
    <div style="background:var(--bg-3);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px">
      <div style="font-size:.75rem;font-weight:700;color:var(--text-muted);margin-bottom:10px;letter-spacing:.04em;text-transform:uppercase">توصيات</div>
      ${tipHtml}
    </div>` : ''}

    <p style="margin:0;font-size:.71rem;color:var(--text-muted)">
      التقييم مبني على: عدد الأسهم والقطاعات، تركيز الحيازات، التوزيعات المتوقعة، وهدف FIRE —
      مرجعية: Benjamin Graham · Peter Lynch · Modern Portfolio Theory.
      لا يشمل Beta أو Volatility (تحتاج بيانات أسعار تاريخية غير متاحة).
    </p>`;
}

// ── مقياس التنويع (HHI gauge) ─────────────────────────────────
function renderDiversificationCard() {
  const el = document.getElementById('diversification-card');
  if (!el) return;

  const totalVal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  if (!holdings.length || !totalVal) { el.style.display = 'none'; return; }
  el.style.display = '';

  // ── الحساب عبر الدالة المشتركة (utils.js) — مصدر واحد للحقيقة ──
  const div = computeDiversification(holdings.map(h => ({
    value:  +h.shares * +h.current_price,
    sector: h.sector,
    label:  h.ticker,
  })));
  const {
    n, hhi, effectiveN, sectorCount, secHHI,
    top1Pct, top1Name, gaugePos, zoneLabel, zoneColor,
  } = div;

  // تحديد نص النصيحة حسب المنطقة
  let advice;
  if (gaugePos < 22) {
    advice = `عدد فعّال = ${effectiveN} — مركز واحد يكفي لإلحاق ضرر بالغ بالمحفظة. المرجع (Graham): لا تقل عن 10 أسهم لحماية معقولة من المخاطر الفردية.`;
  } else if (gaugePos < 40) {
    // AUDIT-FIX: align threshold with detailed analysis (TARGET_HHI 0.067 → N_eff ≥ 15); was inconsistently "≥ 10"
    advice = `عدد فعّال = ${effectiveN} — تنوع جزئي. 90% من مخاطر الأسهم الفردية تُزال عند N_فعّال ≥ 15 (Evans & Archer 1968). أضف في قطاعات مختلفة.`;
  } else if (gaugePos < 60) {
    advice = `عدد فعّال = ${effectiveN} — نطاق مقبول. معظم المخاطر الفردية محمية. الخطوة التالية: تعزيز تنوع القطاعات (${sectorCount} قطاع حالياً).`;
  } else if (gaugePos < 80) {
    advice = `عدد فعّال = ${effectiveN} — تنوع جيد لمحفظة فردية يحمي من الصدمات الفردية والقطاعية. أنت قريب من نطاق Evans & Archer (≥ 15 سهماً فعّالاً) الذي يُزيل ~90% من المخاطر القابلة للتنويع.`;
  } else {
    advice = `عدد فعّال = ${effectiveN} — تنوع ممتاز لمحفظة فردية (≥ 15 سهماً فعّالاً، Evans & Archer 1968). المخاطر غير المنهجية عند أدنى مستوياتها — ركّز الآن على جودة المتابعة لا زيادة العدد.`;
  }

  // تنبيه منفصل لتعقيد الإدارة (Diworsification) — ليس منطقة خطر على المقياس
  const diworseNote = n > 30 ? `
    <div style="background:rgba(245,158,11,0.08);border-right:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:10px 12px;font-size:0.80rem;color:var(--text);line-height:1.65;margin-top:10px;direction:rtl">
      💡 <strong>ملاحظة الإدارة:</strong> ${n} سهماً — عدد كبير يرفع تعقيد المتابعة (Lynch: diworsification). تأكد أن كل مركز مدروس وتعرفه جيداً.
    </div>` : '';

  el.innerHTML = `
    <div class="section-header" style="margin-bottom:14px">
      <span class="section-title">🧩 مقياس التنويع <span class="eng-label">Diversification</span></span>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn btn-secondary btn-sm" onclick="showDiversificationAnalysis()" style="font-size:0.74rem;padding:3px 10px">📋 تحليل مفصّل</button>
        <button class="info-btn" onclick="showCardInfo('diversification')">ⓘ</button>
      </div>
    </div>

    <!-- المقياس البصري — اتجاه ثابت LTR لوضوح الرسم -->
    <div style="direction:ltr;padding:0 4px 4px">
      <!-- تسميات الأطراف -->
      <div style="display:flex;justify-content:space-between;font-size:0.72rem;margin-bottom:6px">
        <span style="color:#ef4444;font-weight:600">◀ مركّز</span>
        <span style="color:#10b981;font-weight:600">متنوع ▶</span>
      </div>

      <!-- شريط التدرج + مؤشر -->
      <div style="position:relative;margin-bottom:34px">
        <div style="height:22px;border-radius:11px;background:linear-gradient(to right,#ef4444 0%,#f97316 18%,#eab308 32%,#84cc16 45%,#22c55e 62%,#10b981 80%,#10b981 100%)"></div>
        <!-- إطار منطقة "تنوع جيد +" -->
        <div style="position:absolute;top:0;bottom:0;left:60%;right:0;border:2.5px solid rgba(255,255,255,0.75);border-radius:0 9px 9px 0;pointer-events:none"></div>
        <!-- المؤشر -->
        <div style="position:absolute;top:-5px;left:${gaugePos}%;transform:translateX(-50%)">
          <div style="width:3px;height:32px;background:var(--text);border-radius:2px;margin:0 auto;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
          <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid var(--text);margin:0 auto;margin-top:-1px"></div>
        </div>
        <!-- تسمية المنطقة -->
        <div style="position:absolute;top:34px;left:${gaugePos}%;transform:translateX(-50%);font-size:0.78rem;font-weight:700;color:${zoneColor};white-space:nowrap">${zoneLabel}</div>
      </div>

      <!-- تسميات المناطق — عرضها يطابق حدود الـ gradient -->
      <div style="display:grid;grid-template-columns:22% 18% 20% 20% 20%;font-size:0.65rem;text-align:center;margin-bottom:16px">
        <span style="color:#ef4444">مركّز<br>جداً</span>
        <span style="color:#f97316">تركيز<br>ملحوظ</span>
        <span style="color:#84cc16">تنوع<br>معقول</span>
        <span style="color:#22c55e;font-weight:600">تنوع<br>جيد ●</span>
        <span style="color:#10b981;font-weight:600">تنوع<br>ممتاز</span>
      </div>
    </div>

    <!-- مقاييس سريعة -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;direction:rtl">
      <div style="background:var(--bg-2);border-radius:8px;padding:8px 6px;text-align:center">
        <div style="font-size:1.3rem;font-weight:700;color:var(--text)">${effectiveN}</div>
        <div style="font-size:0.68rem;color:var(--text-muted)">عدد فعّال</div>
      </div>
      <div style="background:var(--bg-2);border-radius:8px;padding:8px 6px;text-align:center">
        <div style="font-size:1.3rem;font-weight:700;color:var(--text)">${n}</div>
        <div style="font-size:0.68rem;color:var(--text-muted)">سهم</div>
      </div>
      <div style="background:var(--bg-2);border-radius:8px;padding:8px 6px;text-align:center">
        <div style="font-size:1.3rem;font-weight:700;color:var(--text)">${sectorCount}</div>
        <div style="font-size:0.68rem;color:var(--text-muted)">قطاع</div>
      </div>
      <div style="background:var(--bg-2);border-radius:8px;padding:8px 6px;text-align:center">
        <div style="font-size:1.1rem;font-weight:700;color:var(--text)">${top1Pct.toFixed(1)}%</div>
        <div style="font-size:0.68rem;color:var(--text-muted)">أكبر (${esc(top1Name)})</div>
      </div>
    </div>

    <!-- النصيحة -->
    <div style="background:${zoneColor}18;border-right:3px solid ${zoneColor};border-radius:0 8px 8px 0;padding:10px 12px;font-size:0.82rem;color:var(--text);line-height:1.65;direction:rtl">${advice}</div>

    ${diworseNote}

    <!-- تفاصيل HHI -->
    <div style="margin-top:10px;font-size:0.71rem;color:var(--text-muted);text-align:center;direction:rtl">
      HHI أسهم = ${(hhi * 100).toFixed(1)}% &nbsp;·&nbsp; HHI قطاعات = ${(secHHI * 100).toFixed(1)}% &nbsp;·&nbsp; عدد فعّال = ${effectiveN} سهم
    </div>`;
}

// ── تحليل التنويع المفصّل (popup شخصي) ──────────────────────────
function showDiversificationAnalysis() {
  const totalVal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  if (!holdings.length || !totalVal) return;

  const n = holdings.length;
  const weights = holdings.map(h => +h.shares * +h.current_price / totalVal);
  const hhi     = weights.reduce((s, w) => s + w * w, 0);
  const effN    = Math.max(1, Math.round(1 / hhi));

  const secMap = {};
  holdings.forEach(h => {
    const k = (h.sector || '').trim() || 'غير مصنف';
    secMap[k] = (secMap[k] || 0) + +h.shares * +h.current_price / totalVal;
  });
  const sectorCount = Object.keys(secMap).length;
  const secHHI  = Object.values(secMap).reduce((s, w) => s + w * w, 0);
  const secNHHI = sectorCount > 1 ? (secHHI - 1/sectorCount)/(1 - 1/sectorCount) : 1.0;
  const sectorFactor = 0.60 + 0.40*(1 - secNHHI);

  const sorted    = [...holdings].sort((a,b) => +b.shares*+b.current_price - +a.shares*+a.current_price);
  const top1Pct   = sorted[0] ? +sorted[0].shares*+sorted[0].current_price/totalVal*100 : 0;
  const top1Name  = sorted[0]?.ticker || '';
  const top3Pct   = sorted.slice(0,3).reduce((s,h) => s + +h.shares*+h.current_price/totalVal*100, 0);

  // أكبر قطاع
  const topSector = Object.entries(secMap).sort((a,b)=>b[1]-a[1])[0];
  const topSecPct = topSector ? topSector[1]*100 : 0;
  const topSecName= topSector ? topSector[0] : '';

  // ── معايير "تنوع ممتاز" ──────────────────────────────────────
  // HHI < 5% → N_eff > 20، وعامل القطاعات يجب أن يكون عالياً
  const TARGET_HHI     = 0.067;  // N_eff ≥ 15 — Evans & Archer (1968): 15 سهم تُزيل 90% من المخاطر القابلة للتنويع
  const TARGET_TOP1    = 15;     // % - أكبر مركز
  const TARGET_TOP3    = 45;     // % - أكبر 3
  const TARGET_SECTORS = 4;      // قطاعات كحد أدنى
  const TARGET_TOPSEC  = 35;     // % - أكبر قطاع
  const TARGET_SECFACT = 0.85;   // معامل القطاعات المطلوب

  // ── بناء قائمة التحقق ────────────────────────────────────────
  const checks = [];

  // 1. N_eff / HHI
  const hhiOk = hhi <= TARGET_HHI;
  checks.push({
    ok: hhiOk,
    label: `العدد الفعّال (N_فعّال)`,
    current: `${effN} سهم · HHI = ${(hhi*100).toFixed(1)}%`,
    target:  `N_فعّال ≥ 15 · HHI ≤ 6.7%`,
    action:  hhiOk ? null
      : effN >= 12
        ? `وزّع مبالغ الإضافات بالتساوي أكثر — أكبر مركز يستأثر بحصة كبيرة ترفع الـ HHI`
        : `أضف ${Math.max(0, 15 - effN)} أسهم جديدة بأوزان متوازنة (أو قلّل تركيز أكبر مراكزك)`
  });

  // 2. أكبر مركز
  const top1Ok = top1Pct <= TARGET_TOP1;
  checks.push({
    ok: top1Ok,
    label: `أكبر مركز (${esc(top1Name)})`,
    current: `${top1Pct.toFixed(1)}%`,
    target:  `≤ ${TARGET_TOP1}%`,
    action:  top1Ok ? null
      : `توقف عن إضافة ${esc(top1Name)} وحوّل المبالغ الجديدة لأسهم أخرى حتى ينخفض وزنه لـ ${TARGET_TOP1}%`
  });

  // 3. أكبر 3 مراكز
  const top3Ok = top3Pct <= TARGET_TOP3;
  checks.push({
    ok: top3Ok,
    label: `أكبر 3 مراكز مجتمعة`,
    current: `${top3Pct.toFixed(1)}%`,
    target:  `≤ ${TARGET_TOP3}%`,
    action:  top3Ok ? null
      : `الأسهم الثلاثة الأكبر تستحوذ على ${top3Pct.toFixed(0)}% — وجّه الإضافات القادمة لبقية المراكز`
  });

  // 4. عدد القطاعات
  const secCountOk = sectorCount >= TARGET_SECTORS;
  checks.push({
    ok: secCountOk,
    label: `تنوع القطاعات`,
    current: `${sectorCount} قطاع`,
    target:  `≥ ${TARGET_SECTORS} قطاعات`,
    action:  secCountOk ? null
      : `أضف أسهماً من قطاعات غير ممثلة حالياً — ${TARGET_SECTORS - sectorCount} قطاع ناقص على الأقل`
  });

  // 5. هيمنة قطاع واحد
  const topSecOk = topSecPct <= TARGET_TOPSEC;
  checks.push({
    ok: topSecOk,
    label: `أكبر قطاع (${esc(topSecName)})`,
    current: `${topSecPct.toFixed(1)}% من المحفظة`,
    target:  `≤ ${TARGET_TOPSEC}%`,
    action:  topSecOk ? null
      : `قطاع "${esc(topSecName)}" يهيمن بـ ${topSecPct.toFixed(0)}% — أزمة قطاعية ستضرب حصة كبيرة. تنوّع في قطاعات أخرى`
  });

  // 6. معامل القطاعات
  const secFactOk = sectorFactor >= TARGET_SECFACT;
  checks.push({
    ok: secFactOk,
    label: `توزيع الأوزان بين القطاعات`,
    current: `معامل = ${(sectorFactor*100).toFixed(0)}%`,
    target:  `≥ ${TARGET_SECFACT*100}%`,
    action:  secFactOk ? null
      : `الأوزان القطاعية غير متوازنة — حاول أن تتقارب القطاعات في حجمها لا أن يطغى قطاع على البقية`
  });

  const passCount = checks.filter(c => c.ok).length;
  const allPass   = passCount === checks.length;

  // ── رسم الـ popup ─────────────────────────────────────────────
  const rowsHtml = checks.map(c => `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="flex-shrink:0;margin-top:1px;font-size:1.1rem">${c.ok ? '✅' : '❌'}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:0.85rem;color:var(--text)">${c.label}</div>
        <div style="font-size:0.80rem;margin-top:3px">
          <span style="color:${c.ok ? 'var(--success)' : '#ef4444'}">الآن: ${c.current}</span>
          &nbsp;·&nbsp;
          <span style="color:var(--text-muted)">الهدف: ${c.target}</span>
        </div>
        ${c.action ? `<div style="font-size:0.78rem;color:var(--text-2);margin-top:5px;padding:6px 10px;background:rgba(239,68,68,.08);border-radius:6px;line-height:1.6">👉 ${c.action}</div>` : ''}
      </div>
    </div>`).join('');

  const summaryColor = allPass ? '#10b981' : passCount >= 4 ? '#22c55e' : passCount >= 2 ? '#f97316' : '#ef4444';
  const summaryText  = allPass
    ? '🏆 محفظتك تستوفي جميع معايير "تنوع ممتاز"!'
    : `اجتزت ${passCount} من ${checks.length} معايير — ${checks.length - passCount} ${checks.length - passCount === 1 ? 'معيار ناقص' : 'معايير ناقصة'}`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <div style="padding:16px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--bg);z-index:1">
        <span style="font-weight:700;font-size:.95rem">📋 تحليل التنويع — ماذا تحتاج للوصول لـ "تنوع ممتاز"؟</span>
        <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--text-muted);padding:0 4px">✕</button>
      </div>

      <div style="padding:14px 18px">
        <!-- ملخص -->
        <div style="background:${summaryColor}18;border:1px solid ${summaryColor}40;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.85rem;font-weight:600;color:${summaryColor};text-align:center">
          ${summaryText}
        </div>

        <!-- قائمة التحقق -->
        <div style="direction:rtl">${rowsHtml}</div>

        <!-- ملاحظة -->
        <div style="margin-top:14px;font-size:0.72rem;color:var(--text-muted);line-height:1.7;direction:rtl">
          المعايير مبنية على: DOJ HHI thresholds · Evans & Archer (1968) · Statman (1987) · Campbell et al (2001)<br>
          "تنوع ممتاز" = N_فعّال ≥ 15 · أكبر مركز ≤ 15% · أكبر 3 ≤ 45% · 4+ قطاعات متوازنة
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
  });
}

// ── معلومات منهجية محلل الصحة ───────────────────────────────
function showHealthInfo() {
  // S-3: replace alert() with DOM modal — alert() blocks the main thread and is
  // unavailable in some iframe/CSP environments.
  const lines = [
    ['🏥 محلل صحة المحفظة — المنهجية والمصادر', true],
    ['── عدد الأسهم (Graham) ──', false],
    ['&nbsp;&nbsp;< 5 : خطر تركيز عالٍ', false],
    ['&nbsp;&nbsp;5–9 : تنوع محدود', false],
    ['&nbsp;&nbsp;10–20 : النطاق الأمثل (Graham: 10–30)', false],
    ['&nbsp;&nbsp;21–25 : جيد مع المراقبة', false],
    ['&nbsp;&nbsp;> 25 : مراقبة diworsification (Lynch)', false],
    ['── القطاعات ──', false],
    ['&nbsp;&nbsp;1–2 : غير محمي &nbsp; 3 : أولي &nbsp; 4+ : حماية جيدة', false],
    ['── تركيز أكبر سهم ──', false],
    ['&nbsp;&nbsp;> 30% : مرتفع جداً &nbsp; 20–30% : مرتفع &nbsp; < 20% : مقبول', false],
    ['── تركيز أكبر قطاع ──', false],
    ['&nbsp;&nbsp;> 50% : مرتفع جداً &nbsp; 38–50% : مرتفع &nbsp; < 38% : متوازن', false],
    ['── التوزيعات vs الهدف ──', false],
    ['&nbsp;&nbsp;Forward Income الشهري مقارنة بهدف FIRE', false],
    ['── هدف الاستقلال المالي ──', false],
    ['&nbsp;&nbsp;نسبة الإنجاز = صافي الثروة ÷ (مصاريف سنوية ÷ SWR)', false],
    ['&nbsp;&nbsp;مثال: 15,000/شهر × 12 ÷ 4% = 4,500,000 ر.س', false],
    ['⚠️ ما لا يقيسه هذا المحلل (لعدم توفر البيانات):', false],
    ['&nbsp;&nbsp;Beta، Sharpe Ratio، Volatility — تحتاج أسعار إغلاق تاريخية يومية', false],
  ];
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  const content = lines.map(([l, bold]) =>
    `<p style="margin:0 0 6px;font-size:${bold?'.88':'0.8'}rem;${bold?'font-weight:700;color:var(--text-1)':'color:var(--text-2)'}">${l}</p>`
  ).join('');
  overlay.innerHTML = `
    <div style="background:var(--bg-2,#1c2128);border:1px solid var(--border,#30363d);border-radius:12px;max-width:480px;width:100%;padding:24px 20px;box-shadow:0 8px 32px rgba(0,0,0,.5);max-height:85vh;display:flex;flex-direction:column">
      <div style="overflow-y:auto;flex:1">${content}</div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <button id="hi-close" class="btn btn-secondary" style="min-width:80px">إغلاق</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#hi-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function escKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escKey); }
  });
}

// ── إعدادات هدف الاستقلال المالي — Supabase + localStorage cache ──
// TD-3: key defined in utils.js as RET_GOAL_LS_KEY — use that constant here
const RET_GOAL_KEY = RET_GOAL_LS_KEY;

function _retGoalFromObj(o) {
  return { monthly: +o?.monthly || 0, swr: +o?.swr || 4, target_year: +o?.target_year || 0 };
}

function getRetirementGoal() {
  // قراءة من الـ cache المحلي — يُحدَّث عند كل تحميل من Supabase
  try {
    const scoped = localStorage.getItem(userLsKey(RET_GOAL_KEY));
    const legacy = localStorage.getItem(RET_GOAL_KEY);
    return _retGoalFromObj(JSON.parse(scoped || legacy || '{}'));
  } catch (_) { return _retGoalFromObj({}); }
}

async function _loadRetirementGoalFromSupabase() {
  const remote = await loadUserSetting(RET_GOAL_KEY);
  if (!remote) return;
  // حدّث الـ cache المحلي
  try { localStorage.setItem(userLsKey(RET_GOAL_KEY), JSON.stringify(remote)); } catch (_) {}
  // أعِد رسم بطاقة FIRE إذا تغيّرت القيمة
  renderRetirementCard();
}

function saveRetirementGoal(goal) {
  // حفظ فوري في localStorage
  try { localStorage.setItem(userLsKey(RET_GOAL_KEY), JSON.stringify(goal)); } catch (_) {}
  // حفظ غير متزامن في Supabase (يمنع الفقدان على الجوال)
  saveUserSetting(RET_GOAL_KEY, goal).catch(() => {});
}
function editRetirementGoal() {
  const cur = getRetirementGoal();
  // S-3: replace prompt() with DOM modal — prompt() is blocked in some CSP/iframe contexts
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:var(--bg-2,#1c2128);border:1px solid var(--border,#30363d);border-radius:12px;max-width:440px;width:100%;padding:24px 20px;box-shadow:0 8px 32px rgba(0,0,0,.5)">
      <h3 style="margin:0 0 18px;font-size:1rem;color:var(--text-1,#e6edf3)">🎯 هدف التقاعد</h3>
      <label style="display:block;margin-bottom:12px;font-size:.85rem;color:var(--text-2)">
        المصاريف الشهرية المتوقعة بعد التقاعد (ر.س)
        <input id="rg-monthly" type="number" min="0" step="500" class="input" style="display:block;width:100%;margin-top:5px" value="${esc(cur.monthly || '')}">
      </label>
      <label style="display:block;margin-bottom:12px;font-size:.85rem;color:var(--text-2)">
        نسبة السحب الآمنة السنوية % (الافتراضي 4% — قاعدة 25 ضعف)
        <input id="rg-swr" type="number" min="1" max="10" step="0.5" class="input" style="display:block;width:100%;margin-top:5px" value="${esc(cur.swr || 4)}">
      </label>
      <label style="display:block;margin-bottom:20px;font-size:.85rem;color:var(--text-2)">
        سنة التقاعد المستهدفة (مثال: 2043 — اتركها فارغة إن لم تحددها)
        <input id="rg-year" type="number" min="2024" max="2100" step="1" class="input" style="display:block;width:100%;margin-top:5px" value="${esc(cur.target_year || '')}">
      </label>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button id="rg-cancel" class="btn btn-secondary" style="min-width:80px">إلغاء</button>
        <button id="rg-save"   class="btn btn-primary"   style="min-width:80px">حفظ</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#rg-monthly').focus();
  const cleanup = () => overlay.remove();
  overlay.querySelector('#rg-cancel').onclick = cleanup;
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(); });
  overlay.querySelector('#rg-save').onclick = () => {
    const monthly    = +overlay.querySelector('#rg-monthly').value || 0;
    const swr        = +overlay.querySelector('#rg-swr').value    || 4;
    const target_year = +overlay.querySelector('#rg-year').value  || 0;
    cleanup();
    saveRetirementGoal({ monthly, swr, target_year });
    renderStats();
    renderRetirementCard();
    renderPortfolioHealthCard(); renderDiversificationCard();
  };
  overlay.querySelector('#rg-save').addEventListener('keydown', e => { if (e.key === 'Enter') overlay.querySelector('#rg-save').click(); });
  document.addEventListener('keydown', function escKey(e) {
    if (e.key === 'Escape') { cleanup(); document.removeEventListener('keydown', escKey); }
  });
}

// ── Insights (الصف التحليلي الإضافي) ─────────────────────────
function renderInsights(s, totalValue, costBasis, pnl, pnlPct) {
  // ── بطاقة 1: تفاصيل المحفظة ──────────────────────────────
  setText('ins-stock-count',  s.stockCount  || 0);
  setText('ins-sector-count', s.sectorCount || 0);

  // أسهم المنح
  const grantEl    = document.getElementById('ins-grant-shares');
  const grantValEl = document.getElementById('ins-grant-value');
  if (s.totalGrantShares > 0) {
    if (grantEl) grantEl.textContent = formatShares(s.totalGrantShares) + ' سهم';
    // قيمة المنح بالسعر الحالي من المحفظة
    const grantVal = holdings.reduce((sum, h) => {
      return sum + ((s.grantMap?.[h.ticker] || 0) * +h.current_price);
    }, 0);
    if (grantValEl) grantValEl.textContent = grantVal > 0 ? ' ≈ ' + formatSAR(grantVal) : '';
  } else {
    if (grantEl)    grantEl.textContent    = '—';
    if (grantValEl) grantValEl.textContent = '';
  }

  // ── بطاقة 2: أعلى قطاع وزناً ─────────────────────────────
  if (s.topSector) {
    setText('ins-top-sector-name', s.topSector.sec);
    const topEl = g('ins-top-sector-pct');
    if (topEl) {
      topEl.textContent = s.topSector.pct.toFixed(1) + '%';
      topEl.className = 'value num text-accent';
    }
    const topTarget = s.topSector.target;
    const topDiff   = s.topSector.pct - topTarget;
    setText('ins-top-sector-sub', topTarget
      ? `هدفه ${topTarget.toFixed(1)}% | فارق ${topDiff >= 0 ? '+' : ''}${topDiff.toFixed(1)}%`
      : 'لا يوجد هدف محدد');
  }

  // ── بطاقة 3: أقل قطاع وزناً ──────────────────────────────
  if (s.bottomSector && s.sectorCount > 1) {
    setText('ins-bot-sector-name', s.bottomSector.sec);
    const botEl = g('ins-bot-sector-pct');
    if (botEl) {
      botEl.textContent = s.bottomSector.pct.toFixed(1) + '%';
      botEl.className   = 'value num text-danger';
    }
    const botTarget = s.bottomSector.target;
    const botDiff   = s.bottomSector.pct - botTarget;
    setText('ins-bot-sector-sub', botTarget
      ? `هدفه ${botTarget.toFixed(1)}% | فارق ${botDiff >= 0 ? '+' : ''}${botDiff.toFixed(1)}%`
      : 'لا يوجد هدف محدد');
  }

  // ── بطاقة 4: التكاليف التراكمية ──────────────────────────
  setText('ins-commission', formatSAR(s.totalCommission || 0));
  setText('ins-vat',        formatSAR(s.totalVAT        || 0));
  setText('ins-costs-total', formatSAR((s.totalCommission || 0) + (s.totalVAT || 0)));

  // ── بطاقة 5: رأس المال vs القيمة السوقية ──────────────────
  setText('ins-cost-basis',   formatSAR(costBasis));
  setText('ins-market-value', formatSAR(totalValue));
  // شريط التقدم: نسبة القيمة السوقية من التكلفة
  const mktPct = costBasis > 0 ? Math.min(totalValue / costBasis * 100, 200) : 0;
  const mktFill = g('ins-mkt-bar-fill');
  if (mktFill) {
    mktFill.style.width = Math.min(mktPct, 100) + '%';
    mktFill.style.background = pnl >= 0 ? 'var(--success)' : 'var(--danger)';
  }
  const mktPnlEl = g('ins-mkt-pnl');
  if (mktPnlEl) {
    mktPnlEl.textContent = (pnl >= 0 ? '+' : '') + formatSAR(pnl, true) + '  (' + (pnl >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%)';
    mktPnlEl.className   = 'small ' + (pnl >= 0 ? 'text-success' : 'text-danger');
  }

  // ── بطاقة 6: ر/خ محقق من البيع ───────────────────────────
  const rpnl = s.realizedPnL || 0;
  const rpnlEl = g('ins-realized-pnl');
  if (rpnlEl) {
    rpnlEl.textContent = (rpnl >= 0 ? '+' : '') + formatSAR(rpnl, true);
    rpnlEl.className   = 'value num ' + (rpnl >= 0 ? 'text-success' : 'text-danger');
  }
  setText('ins-realized-sub', rpnl >= 0 ? 'عمليات البيع حققت ربحاً ✅' : 'عمليات البيع حققت خسارة ⚠️');

  // ── بطاقة 7: العائد التوزيعي — يُحدَّث عبر switchYieldTab ──
  // (يُستدعى من renderStats بعد هذه الدالة)
}

// ── Charts ────────────────────────────────────────────────────
function renderCharts() {
  renderSectorChart();
  renderWeightChart();
  renderIncomeBySector();
}

// ══════════════════════════════════════════════════════════════
// 💰 الدخل التوزيعي حسب القطاع — Income by Sector
// ══════════════════════════════════════════════════════════════
let _ibsMode = 'bars'; // 'bars' | 'table'

function setIbsMode(mode) {
  _ibsMode = mode;
  document.getElementById('ibs-bars')?.classList.toggle('btn-primary', mode === 'bars');
  document.getElementById('ibs-bars')?.classList.toggle('btn-secondary', mode !== 'bars');
  document.getElementById('ibs-table')?.classList.toggle('btn-primary', mode === 'table');
  document.getElementById('ibs-table')?.classList.toggle('btn-secondary', mode !== 'table');
  renderIncomeBySector();
}

function renderIncomeBySector() {
  const el = document.getElementById('income-by-sector-body');
  if (!el) return;

  const s = window._ds || {};

  // نحتاج TTM dividends مقسّمة على القطاع
  // نبني: ticker → sector من holdings
  const tickerSector = {};
  holdings.forEach(h => {
    tickerSector[h.ticker] = (h.sector || '').trim() || 'غير مصنف';
  });

  // نجمع TTM dividends (آخر 12 شهراً) لكل قطاع
  // _ttmDivByTicker: نحسبها هنا
  const now     = new Date();
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  // نحتاج divRows — موجودة في window._divRows لو أضفنا، لكن
  // الأبسط هو استخدام fwdProjected breakdown إن توفّر، وإلا نستخدم القطاع من holdings
  // نبني توزيع بناءً على نسبة الدخل المتوقع (Forward Income) لكل سهم
  const { breakdown } = (() => {
    // نعيد حساب Forward Income per ticker من _ds المحلي
    // لكن _ds لا يحتوي breakdown — نبني من holdings وبيانات dividends
    // نستخدم: dخل كل سهم = (القيمة السوقية / إجمالي القيمة) × fwdProjected
    // هذا تقدير مقبول إذا لم يكن breakdown متاحاً
    const totalVal = holdings.reduce((sum, h) => sum + +h.shares * +h.current_price, 0);
    const fwd = s.fwdProjected || s.ttmDiv || 0;
    const bd  = holdings.map(h => ({
      ticker:    h.ticker,
      projected: totalVal > 0 ? (+h.shares * +h.current_price / totalVal) * fwd : 0,
    }));
    return { breakdown: bd };
  })();

  // اجمع الدخل بالقطاع
  const sectorIncome = {};
  breakdown.forEach(b => {
    const sec = tickerSector[b.ticker] || 'غير مصنف';
    sectorIncome[sec] = (sectorIncome[sec] || 0) + (b.projected || 0);
  });

  const totalIncome = Object.values(sectorIncome).reduce((a, v) => a + v, 0);
  const entries = Object.entries(sectorIncome)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!entries.length || totalIncome <= 0) {
    el.innerHTML = `<div class="empty-state" style="padding:20px">
      <div class="icon">💰</div>
      <p>سجّل أرباحاً موزّعة أولاً لعرض توزيع الدخل حسب القطاع</p></div>`;
    return;
  }

  if (_ibsMode === 'table') {
    el.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr>
        <th>القطاع</th>
        <th>الدخل السنوي المتوقع</th>
        <th>نسبة الدخل</th>
        <th>نسبة الوزن</th>
        <th>الفرق</th>
      </tr></thead>
      <tbody>
        ${entries.map(([sec, inc]) => {
          const incomePct = totalIncome > 0 ? inc / totalIncome * 100 : 0;
          const totalVal  = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
          const secVal    = holdings.filter(h => (h.sector||'').trim()||'غير مصنف' === sec)
                              .reduce((s, h) => s + +h.shares * +h.current_price, 0);
          const weightPct = totalVal > 0 ? secVal / totalVal * 100 : 0;
          const diff      = incomePct - weightPct;
          const diffCls   = Math.abs(diff) < 2 ? 'text-muted' : diff > 0 ? 'text-success' : 'text-accent';
          return `<tr>
            <td><strong>${esc(sec)}</strong></td>
            <td class="num">${formatSAR(inc)}</td>
            <td class="num bold" style="color:var(--accent)">${incomePct.toFixed(1)}%</td>
            <td class="num">${weightPct.toFixed(1)}%</td>
            <td class="num small ${diffCls}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid var(--border)">
          <td><strong>الإجمالي</strong></td>
          <td class="num bold text-success">${formatSAR(totalIncome)}</td>
          <td class="num bold">100%</td>
          <td></td><td></td>
        </tr>
      </tfoot>
    </table></div>
    <p class="small text-muted" style="margin-top:8px">
      الفرق = % الدخل − % الوزن — موجب يعني القطاع ينتج دخلاً أكبر من وزنه (كثافة توزيع أعلى)
    </p>`;
    return;
  }

  // أشرطة
  const maxInc = entries[0][1];
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;padding:4px 0">
      ${entries.map(([sec, inc]) => {
        const pct      = totalIncome > 0 ? inc / totalIncome * 100 : 0;
        const barWidth = maxInc  > 0 ? inc / maxInc * 100 : 0;
        const color    = CHART_COLORS[entries.findIndex(e => e[0] === sec) % CHART_COLORS.length];
        return `<div style="display:flex;align-items:center;gap:10px">
          <div style="width:90px;font-size:0.78rem;color:var(--text);text-align:right;flex-shrink:0;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(sec)}">${esc(sec)}</div>
          <div style="flex:1;height:20px;background:var(--bg-3);border-radius:4px;overflow:hidden">
            <div style="width:${barWidth}%;height:100%;background:${color};border-radius:4px;
              transition:width .3s ease"></div>
          </div>
          <div style="width:56px;font-size:0.78rem;font-weight:700;color:var(--text);text-align:left">
            ${pct.toFixed(1)}%</div>
          <div style="width:90px;font-size:0.73rem;color:var(--text-muted);text-align:left">
            ${formatSAR(inc)}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);
      display:flex;justify-content:space-between;font-size:0.8rem">
      <span class="text-muted">الدخل السنوي المتوقع الكلي:</span>
      <span class="num bold text-success">${formatSAR(totalIncome)}</span>
    </div>
    <p class="small text-muted" style="margin-top:6px">
      مبني على Forward Projected Income — اضغط "جدول" لرؤية الفرق بين نسبة الدخل ونسبة الوزن لكل قطاع.
    </p>
  `;
}

// ── Sector chart: mode switcher ───────────────────────────────
function setSectorMode(mode) {
  _sectorMode = mode;
  ['donut','bars','cards'].forEach(m => {
    document.getElementById('sm-' + m)?.classList.toggle('active', m === mode);
  });
  renderSectorChart();
}

function renderSectorChart() {
  const sectorMap = {};
  holdings.forEach(h => { const k = (h.sector || '').trim() || 'أخرى'; sectorMap[k] = (sectorMap[k] || 0) + +h.shares * +h.current_price; });
  const total   = Object.values(sectorMap).reduce((a, v) => a + v, 0);
  const entries = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);

  const chartCont = document.getElementById('sectorChart-container');
  const altArea   = document.getElementById('sector-alt-area');

  if (_sectorMode === 'bars') {
    if (sectorChart) { sectorChart.destroy(); sectorChart = null; }
    if (chartCont) chartCont.style.display = 'none';
    if (altArea) { altArea.style.display = ''; altArea.innerHTML = _renderSectorBars(entries, total); }
    return;
  }
  if (_sectorMode === 'cards') {
    if (sectorChart) { sectorChart.destroy(); sectorChart = null; }
    if (chartCont) chartCont.style.display = 'none';
    if (altArea) { altArea.style.display = ''; altArea.innerHTML = _renderSectorCards(entries, total); }
    return;
  }

  // donut
  if (altArea) altArea.style.display = 'none';
  if (chartCont) chartCont.style.display = '';
  if (sectorChart) sectorChart.destroy();
  const sCtx = g('sectorChart')?.getContext('2d');
  if (!sCtx) return;
  const sLabels = entries.map(([k]) => k), sData = entries.map(([, v]) => v);
  const _light = document.body.classList.contains('light-mode');
  sectorChart = new Chart(sCtx, {
    type: 'doughnut',
    data: { labels: sLabels, datasets: [{ data: sData, backgroundColor: CHART_COLORS, borderColor: _light ? '#dde1e8' : '#1c2128', borderWidth: 2, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: _light ? '#52606d' : '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 10, usePointStyle: true } },
        tooltip: { backgroundColor: _light ? '#eaecf1' : '#1c2128', titleColor: _light ? '#1a1d24' : '#e6edf3', bodyColor: _light ? '#52606d' : '#8b949e', borderColor: _light ? '#bcc2cc' : '#30363d', borderWidth: 1, titleFont: { family: 'Tajawal' }, bodyFont: { family: 'Tajawal' },
          callbacks: { label: c => { const pct = total > 0 ? (c.parsed / total * 100).toFixed(1) : 0; return ' ' + formatSAR(c.parsed) + '  (' + pct + '%)'; } } }
      }
    }
  });
}

function _renderSectorBars(entries, total) {
  // جمع أهداف القطاعات — من sectorTargets المُحمَّل في loadAllData
  const hasSectorTargets = Object.keys(window._sectorTargetMap || {}).length > 0;

  const bars = entries.map(([sec, val], i) => {
    const pct    = total > 0 ? (val / total * 100) : 0;
    const target = (window._sectorTargetMap || {})[sec] || 0;
    const color  = CHART_COLORS[i % CHART_COLORS.length];

    // تحديد لون حالة الانحراف
    let statusColor = color;
    let statusTip   = '';
    if (target > 0) {
      const diff = pct - target;
      if (Math.abs(diff) <= 1)       { statusColor = '#3fb950'; statusTip = `✅ ضمن الهدف (${target}%)`; }
      else if (diff > 1 && diff <= 3){ statusColor = '#f0b429'; statusTip = `⚠️ فوق الهدف (${target}%) بـ +${diff.toFixed(1)}%`; }
      else if (diff > 3)             { statusColor = '#f85149'; statusTip = `🔴 فوق الهدف (${target}%) بـ +${diff.toFixed(1)}%`; }
      else if (diff < -3)            { statusColor = '#f0b429'; statusTip = `🟡 تحت الهدف (${target}%) بـ ${diff.toFixed(1)}%`; }
      else                           { statusColor = '#3fb950'; statusTip = `قريب من الهدف (${target}%)`; }
    }

    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px" title="${statusTip}">
      <div style="width:90px;font-size:0.82rem;color:var(--text);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(sec)}">${esc(sec)}</div>
      <div style="flex:1;position:relative">
        <!-- شريط الهدف (خط عمودي) -->
        ${target > 0 ? `<div style="position:absolute;top:-2px;bottom:-2px;left:${Math.min(target,100)}%;width:2px;background:rgba(255,255,255,0.35);border-radius:1px;z-index:2" title="الهدف: ${target}%"></div>` : ''}
        <!-- شريط الواقع -->
        <div style="height:18px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:visible">
          <div style="height:100%;width:${Math.min(pct,100).toFixed(1)}%;background:${statusColor};border-radius:4px;min-width:2px;transition:width .3s"></div>
        </div>
      </div>
      <div style="width:44px;font-size:0.82rem;font-weight:600;color:${statusColor};text-align:left">${pct.toFixed(1)}%</div>
      ${target > 0
        ? `<div style="width:38px;font-size:0.75rem;color:var(--text-muted);text-align:left" title="الهدف">${target}%🎯</div>`
        : `<div style="width:38px"></div>`}
      <div style="width:84px;font-size:0.78rem;color:var(--text-2);text-align:left">${formatSAR(val)}</div>
    </div>`;
  }).join('');

  const legend = hasSectorTargets
    ? `<div style="display:flex;gap:16px;font-size:.72rem;color:var(--text-muted);padding:0 4px 8px;flex-wrap:wrap">
        <span>🎯 = الوزن المستهدف (الخط الأبيض)</span>
        <span style="color:#3fb950">● ضمن الهدف</span>
        <span style="color:#f0b429">● انحراف بسيط</span>
        <span style="color:#f85149">● انحراف حاد</span>
       </div>` : '';

  return `<div style="padding:8px 4px">${legend}${bars}</div>`;
}

function _renderSectorCards(entries, total) {
  const cards = entries.map(([sec, val], i) => {
    const pct    = total > 0 ? (val / total * 100) : 0;
    const target = (window._sectorTargetMap || {})[sec] || 0;
    const diff   = target > 0 ? pct - target : null;
    const color  = CHART_COLORS[i % CHART_COLORS.length];

    // لون الحالة
    let stateColor = color, stateLabel = '';
    if (diff !== null) {
      if (Math.abs(diff) <= 1)  { stateColor = '#3fb950'; stateLabel = '✅'; }
      else if (diff > 1)        { stateColor = diff > 3 ? '#f85149' : '#f0b429'; stateLabel = `↑+${diff.toFixed(1)}%`; }
      else                      { stateColor = '#f0b429'; stateLabel = `↓${diff.toFixed(1)}%`; }
    }

    return `<div class="w-card" style="--card-accent:${stateColor}">
      <div class="w-card-header">
        <span class="w-card-ticker" style="color:${stateColor};font-size:0.8rem">${esc(sec)}</span>
        <span class="w-card-pct" style="color:${stateColor}">${pct.toFixed(1)}%</span>
      </div>
      <div class="w-card-bar-wrap" style="margin:6px 0;position:relative">
        <div class="w-card-bar-track">
          <div class="w-card-bar-fill" style="width:${Math.min(pct,100).toFixed(1)}%;background:${stateColor}"></div>
        </div>
        ${target > 0 ? `<div style="position:absolute;top:0;bottom:0;left:${Math.min(target,100)}%;width:2px;background:rgba(255,255,255,0.4);border-radius:1px" title="الهدف ${target}%"></div>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div style="font-size:0.78rem;color:var(--text-2)">${formatSAR(val)}</div>
        ${target > 0
          ? `<div style="font-size:0.72rem;color:${stateColor};font-weight:600">${stateLabel} <span style="color:var(--text-muted);font-weight:400">🎯${target}%</span></div>`
          : ''}
      </div>
    </div>`;
  }).join('');
  return `<div class="w-cards-grid" style="padding:8px 0">${cards}</div>`;
}

// ── Weight chart: mode switcher ───────────────────────────────
function setWeightMode(mode) {
  _weightMode = mode;
  ['bars','donut','gap','cards','table'].forEach(m => {
    document.getElementById('wm-' + m)?.classList.toggle('active', m === mode);
  });
  // show legend only for bar modes
  const leg = document.getElementById('weight-legend');
  if (leg) leg.style.display = (mode === 'bars') ? '' : 'none';
  renderWeightChart();
}

function renderWeightChart() {
  const wTotal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  const wSorted = [...holdings].sort((a, b) => {
    const av = wTotal > 0 ? +a.shares * +a.current_price / wTotal : 0;
    const bv = wTotal > 0 ? +b.shares * +b.current_price / wTotal : 0;
    return bv - av;
  });
  const wCurrent = wSorted.map(h => wTotal > 0 ? +(+h.shares * +h.current_price / wTotal * 100).toFixed(2) : 0);
  const wTarget  = wSorted.map(h => +(+h.target_weight || 0));
  const wColors  = wSorted.map((h, i) => {
    const cur = wCurrent[i], tgt = wTarget[i];
    if (!tgt)           return 'rgba(240,180,41,0.85)';
    if (cur > tgt + 1)  return 'rgba(239,68,68,0.85)';
    if (cur < tgt - 1)  return 'rgba(99,179,237,0.85)';
    return 'rgba(63,185,80,0.85)';
  });

  const chartCont = document.getElementById('weightChart-container');
  const altArea   = document.getElementById('weight-alt-area');

  // destroy donut charts whenever we leave donut mode
  if (_weightMode !== 'donut') {
    if (weightDonutCur) { weightDonutCur.destroy(); weightDonutCur = null; }
    if (weightDonutTgt) { weightDonutTgt.destroy(); weightDonutTgt = null; }
  }

  if (_weightMode === 'donut') {
    if (weightChart) { weightChart.destroy(); weightChart = null; }
    if (chartCont) chartCont.style.display = 'none';
    if (altArea)   { altArea.style.display = ''; }
    _renderWeightDonuts(wSorted, wCurrent, wTarget);
    return;
  }

  if (_weightMode === 'cards') {
    if (weightChart) { weightChart.destroy(); weightChart = null; }
    if (chartCont) chartCont.style.display = 'none';
    if (altArea)   { altArea.style.display = ''; altArea.innerHTML = _renderWeightCards(wSorted, wCurrent, wTarget, wColors); }
    return;
  }
  if (_weightMode === 'table') {
    if (weightChart) { weightChart.destroy(); weightChart = null; }
    if (chartCont) chartCont.style.display = 'none';
    if (altArea)   { altArea.style.display = ''; altArea.innerHTML = _renderWeightTable(wSorted, wCurrent, wTarget, wColors); }
    return;
  }

  // chart modes (bars / gap)
  if (altArea) altArea.style.display = 'none';
  if (chartCont) chartCont.style.display = '';

  if (weightChart) weightChart.destroy();
  const wCtx = g('weightChart')?.getContext('2d');
  if (!wCtx) return;

  const wCanvas = g('weightChart');
  const rowH    = Math.max(32, Math.min(48, Math.floor(400 / Math.max(wSorted.length, 1))));
  if (wCanvas) wCanvas.parentElement.style.height = Math.max(380, wSorted.length * rowH + 60) + 'px';

  if (_weightMode === 'gap') {
    _renderGapChart(wSorted, wCurrent, wTarget, wColors, wCtx);
  } else {
    _renderBarsChart(wSorted, wCurrent, wTarget, wColors, wCtx);
  }
}

// مخططان دائريان على مستوى السهم: الوزن الحالي مقابل الوزن المستهدف
function _renderWeightDonuts(wSorted, wCurrent, wTarget) {
  const altArea = document.getElementById('weight-alt-area');
  if (!altArea) return;

  // لون ثابت لكل سهم عبر المخططَين (حسب ترتيب الوزن الحالي)
  const colorOf = {};
  wSorted.forEach((h, i) => { colorOf[h.ticker] = CHART_COLORS[i % CHART_COLORS.length]; });

  // بيانات الحالي — كل الأسهم التي لها وزن
  const curRows = wSorted
    .map((h, i) => ({ ticker: h.ticker, name: h.name || h.ticker, val: wCurrent[i] }))
    .filter(r => r.val > 0);

  // بيانات المستهدف — الأسهم التي لها هدف محدد فقط
  const tgtRows = wSorted
    .map((h, i) => ({ ticker: h.ticker, name: h.name || h.ticker, val: wTarget[i] }))
    .filter(r => r.val > 0)
    .sort((a, b) => b.val - a.val);

  altArea.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;padding:4px 0">
      <div>
        <div style="text-align:center;font-size:0.85rem;color:var(--text);font-weight:600;margin-bottom:6px">
          الوزن الحالي
        </div>
        <div class="chart-container" style="height:340px"><canvas id="weightDonutCur"></canvas></div>
      </div>
      <div>
        <div style="text-align:center;font-size:0.85rem;color:var(--text);font-weight:600;margin-bottom:6px">
          الوزن المستهدف
        </div>
        <div class="chart-container" style="height:340px">
          ${tgtRows.length
            ? '<canvas id="weightDonutTgt"></canvas>'
            : '<div class="empty-state" style="padding:40px 12px"><div class="icon">⚖️</div><p>لم تُحدَّد أوزان مستهدفة بعد — أضفها من صفحة الأهداف</p></div>'}
        </div>
      </div>
    </div>`;

  const mk = (canvasId, rows) => {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return null;
    const tot = rows.reduce((s, r) => s + r.val, 0);
    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: rows.map(r => r.ticker),
        datasets: [{
          data: rows.map(r => r.val),
          backgroundColor: rows.map(r => colorOf[r.ticker] || '#8b949e'),
          borderColor: '#1c2128', borderWidth: 2, hoverOffset: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '55%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#8b949e', font: { family: 'Tajawal', size: 10 }, padding: 8, usePointStyle: true, boxWidth: 8 } },
          tooltip: {
            backgroundColor: '#1c2128', titleColor: '#e6edf3', bodyColor: '#c9d1d9',
            borderColor: '#30363d', borderWidth: 1,
            titleFont: { family: 'Tajawal', size: 13, weight: 'bold' }, bodyFont: { family: 'Tajawal', size: 12 },
            callbacks: {
              title: items => { const r = rows[items[0].dataIndex]; return r.ticker + (r.name && r.name !== r.ticker ? ' — ' + r.name : ''); },
              label: c => { const pct = tot > 0 ? (c.parsed / tot * 100).toFixed(1) : 0; return ' ' + c.parsed.toFixed(2) + '%  (' + pct + '% من المعروض)'; }
            }
          }
        }
      }
    });
  };

  weightDonutCur = mk('weightDonutCur', curRows);
  weightDonutTgt = tgtRows.length ? mk('weightDonutTgt', tgtRows) : null;
}

function _renderBarsChart(wSorted, wCurrent, wTarget, wColors, wCtx) {
  const wLabels = wSorted.map(h => h.ticker);
  weightChart = new Chart(wCtx, {
    type: 'bar',
    data: {
      labels: wLabels,
      datasets: [
        { label: 'الوزن الحالي %', data: wCurrent, backgroundColor: wColors, borderColor: wColors.map(c => c.replace('0.85','1')), borderWidth: 1, borderRadius: 3, barPercentage: 0.75, categoryPercentage: 0.65 },
        { label: 'الهدف %',        data: wTarget,  backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.45)', borderWidth: 1.5, borderRadius: 3, barPercentage: 0.75, categoryPercentage: 0.65 }
      ]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 14, usePointStyle: true,
            generateLabels: () => [
              { text: 'ضمن الهدف',      fillStyle: 'rgba(63,185,80,0.85)',   strokeStyle: 'rgba(63,185,80,1)',      lineWidth: 1, pointStyle: 'rect', fontColor: '#c9d1d9' },
              { text: 'زيادة عن الهدف', fillStyle: 'rgba(239,68,68,0.85)',   strokeStyle: 'rgba(239,68,68,1)',      lineWidth: 1, pointStyle: 'rect', fontColor: '#c9d1d9' },
              { text: 'نقص عن الهدف',   fillStyle: 'rgba(99,179,237,0.85)',  strokeStyle: 'rgba(99,179,237,1)',     lineWidth: 1, pointStyle: 'rect', fontColor: '#c9d1d9' },
              { text: 'بدون هدف',       fillStyle: 'rgba(240,180,41,0.85)',  strokeStyle: 'rgba(240,180,41,1)',     lineWidth: 1, pointStyle: 'rect', fontColor: '#c9d1d9' },
              { text: 'الهدف المحدد',   fillStyle: 'rgba(255,255,255,0.12)', strokeStyle: 'rgba(255,255,255,0.45)', lineWidth: 1.5, pointStyle: 'rect', fontColor: '#c9d1d9' }
            ]
          }
        },
        tooltip: {
          backgroundColor: '#1c2128', titleColor: '#e6edf3', bodyColor: '#c9d1d9',
          borderColor: '#30363d', borderWidth: 1, padding: 12,
          titleFont: { family: 'Tajawal', size: 13, weight: 'bold' },
          bodyFont:  { family: 'Tajawal', size: 12 },
          callbacks: {
            title: items => { const h = wSorted[items[0].dataIndex]; return h.ticker + (h.name ? ' — ' + h.name : ''); },
            label: item => {
              const i = item.dataIndex, cur = wCurrent[i], tgt = wTarget[i];
              if (item.datasetIndex === 0) {
                const lines = [' الحالي: ' + cur + '%'];
                if (tgt) lines.push(' الهدف: ' + tgt + '%', ' الفارق: ' + (cur - tgt >= 0 ? '+' : '') + (cur - tgt).toFixed(2) + '%');
                else     lines.push(' الهدف: غير محدد');
                return lines;
              }
              return [' الهدف: ' + (tgt || '—') + '%'];
            },
            labelColor: item => { const c = wColors[item.dataIndex]; return { borderColor: c.replace('0.85','1'), backgroundColor: c }; }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, callback: v => v + '%' }, grid: { color: 'rgba(48,54,61,0.5)' } },
        y: { ticks: { color: '#c9d1d9', font: { family: 'Tajawal', size: 10 }, autoSkip: false, callback: (_, i) => wSorted[i]?.ticker || '' }, grid: { color: 'rgba(48,54,61,0.3)' } }
      }
    }
  });
}

function _renderGapChart(wSorted, wCurrent, wTarget, wColors, wCtx) {
  // Only include holdings with a target set
  const withTarget = wSorted.map((h, i) => ({ h, cur: wCurrent[i], tgt: wTarget[i] }))
    .filter(x => x.tgt > 0)
    .sort((a, b) => Math.abs(b.cur - b.tgt) - Math.abs(a.cur - a.tgt));
  const noTarget = wSorted.map((h, i) => ({ h, cur: wCurrent[i], tgt: wTarget[i] })).filter(x => !x.tgt);

  const allRows = [...withTarget, ...noTarget];
  const labels  = allRows.map(x => x.h.ticker);
  const gaps    = allRows.map(x => x.tgt > 0 ? +(x.cur - x.tgt).toFixed(2) : null);
  const colors  = allRows.map(x => {
    if (!x.tgt) return 'rgba(240,180,41,0.7)';
    const d = x.cur - x.tgt;
    if (d > 1)  return 'rgba(239,68,68,0.85)';
    if (d < -1) return 'rgba(99,179,237,0.85)';
    return 'rgba(63,185,80,0.85)';
  });

  weightChart = new Chart(wCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'الفارق عن الهدف %',
        data: gaps,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.85','1').replace('0.7','1')),
        borderWidth: 1, borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.7
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c2128', titleColor: '#e6edf3', bodyColor: '#c9d1d9',
          borderColor: '#30363d', borderWidth: 1, padding: 12,
          titleFont: { family: 'Tajawal', size: 13, weight: 'bold' },
          bodyFont:  { family: 'Tajawal', size: 12 },
          callbacks: {
            title: items => { const r = allRows[items[0].dataIndex]; return r.h.ticker + (r.h.name ? ' — ' + r.h.name : ''); },
            label: item => {
              const r = allRows[item.dataIndex];
              if (!r.tgt) return [' الحالي: ' + r.cur + '%', ' الهدف: غير محدد'];
              const d = r.cur - r.tgt;
              return [
                ' الحالي: ' + r.cur + '%',
                ' الهدف:  ' + r.tgt + '%',
                ' الفارق: ' + (d >= 0 ? '+' : '') + d.toFixed(2) + '%  ' + (d > 1 ? '⬆ زيادة' : d < -1 ? '⬇ نقص' : '✓ ضمن الهدف')
              ];
            }
          }
        },
        annotation: {}
      },
      scales: {
        x: {
          ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, callback: v => (v >= 0 ? '+' : '') + v + '%' },
          grid:  { color: ctx => ctx.tick.value === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(48,54,61,0.4)' }
        },
        y: { ticks: { color: '#c9d1d9', font: { family: 'Tajawal', size: 10 }, autoSkip: false }, grid: { color: 'rgba(48,54,61,0.3)' } }
      }
    }
  });
}

function _renderWeightCards(wSorted, wCurrent, wTarget, wColors) {
  const colorMap = { 'rgba(63,185,80,0.85)': '#3fb950', 'rgba(239,68,68,0.85)': '#ef4444', 'rgba(99,179,237,0.85)': '#63b3ed', 'rgba(240,180,41,0.85)': '#f0b429' };
  const cards = wSorted.map((h, i) => {
    const cur = wCurrent[i], tgt = wTarget[i], clr = colorMap[wColors[i]] || '#8b949e';
    const diff = tgt ? (cur - tgt) : null;
    const diffTxt = diff !== null ? (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%' : '—';
    const diffCls = diff === null ? 'text-muted' : diff > 1 ? 'text-danger' : diff < -1 ? '' : 'text-success';
    const diffClsStyle = diff === null ? 'color:#8b949e' : diff > 1 ? 'color:#ef4444' : diff < -1 ? 'color:#63b3ed' : 'color:#3fb950';
    return `<div class="w-card" style="--card-accent:${clr}">
      <div class="w-card-header">
        <span class="w-card-ticker" style="color:${clr}">${esc(h.ticker)}</span>
        <span class="w-card-pct">${cur}%</span>
      </div>
      <div class="w-card-name">${esc(h.name || '')}</div>
      <div class="w-card-bar-wrap"><div class="w-card-bar-track"><div class="w-card-bar-fill" style="width:${Math.min(cur*3,100)}%;background:${clr}"></div>${tgt ? `<div class="w-card-bar-target" style="left:${Math.min(tgt*3,100)}%"></div>` : ''}</div></div>
      <div class="w-card-footer">
        <span style="font-size:0.72rem;color:#8b949e">هدف: ${tgt ? tgt + '%' : '—'}</span>
        <span style="font-size:0.75rem;font-weight:600;${diffClsStyle}">${diffTxt}</span>
      </div>
    </div>`;
  }).join('');
  return `<div class="w-cards-grid">${cards}</div>`;
}

function _renderWeightTable(wSorted, wCurrent, wTarget, wColors) {
  const colorMap = { 'rgba(63,185,80,0.85)': '#3fb950', 'rgba(239,68,68,0.85)': '#ef4444', 'rgba(99,179,237,0.85)': '#63b3ed', 'rgba(240,180,41,0.85)': '#f0b429' };
  const rows = wSorted.map((h, i) => {
    const cur = wCurrent[i], tgt = wTarget[i], clr = colorMap[wColors[i]] || '#8b949e';
    const diff = tgt ? (cur - tgt) : null;
    const diffTxt  = diff !== null ? (diff >= 0 ? '+' : '') + diff.toFixed(2) + '%' : '—';
    const diffStyle = diff === null ? 'color:#8b949e' : diff > 1 ? 'color:#ef4444' : diff < -1 ? 'color:#63b3ed' : 'color:#3fb950';
    const statusTxt = !tgt ? 'بدون هدف' : diff > 1 ? 'زيادة' : diff < -1 ? 'نقص' : 'ضمن الهدف';
    const barW = Math.min(cur * 4, 100);
    const tgtW = tgt ? Math.min(tgt * 4, 100) : 0;
    return `<tr>
      <td><strong style="color:${clr}">${esc(h.ticker)}</strong></td>
      <td style="color:#c9d1d9;font-size:0.85rem">${esc(h.name || '—')}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;position:relative;min-width:60px">
            <div style="height:100%;width:${barW}%;background:${clr};border-radius:3px"></div>
            ${tgt ? `<div style="position:absolute;top:-2px;left:${tgtW}%;width:2px;height:10px;background:rgba(255,255,255,0.5);border-radius:1px"></div>` : ''}
          </div>
          <span style="font-size:0.82rem;color:#e6edf3;min-width:38px;text-align:right">${cur}%</span>
        </div>
      </td>
      <td style="color:#8b949e;font-size:0.82rem;text-align:center">${tgt ? tgt + '%' : '—'}</td>
      <td style="${diffStyle};font-size:0.82rem;font-weight:600;text-align:center">${diffTxt}</td>
      <td style="${diffStyle};font-size:0.78rem;text-align:center">${statusTxt}</td>
    </tr>`;
  }).join('');
  return `<div style="overflow-x:auto;padding:4px 0">
    <table class="data-table" style="width:100%">
      <thead><tr><th>الرمز</th><th>الاسم</th><th>الوزن الحالي</th><th>الهدف</th><th>الفارق</th><th>الحالة</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Holdings Table (with inline editing) ──────────────────────
function renderTable() {
  const total = holdings.reduce((s, h) => s + h.shares * h.current_price, 0);
  const tbody = g('holdings-tbody');
  if (!tbody) return;

  // تحديث هيدرات الجدول بأسهم الترتيب
  const thead = document.querySelector('#holdings-table thead tr');
  if (thead) {
    const cols = [
      { key: 'ticker',        label: 'الرمز' },
      { key: 'name',          label: 'الاسم' },
      { key: 'sector',        label: 'القطاع' },
      { key: 'shares',        label: 'الأسهم' },
      { key: 'avg_price',     label: 'متوسط السعر' },
      { key: 'current_price', label: 'السعر الحالي' },
      { key: '_cost',         label: 'التكلفة' },
      { key: '_value',        label: 'القيمة' },
      { key: '_pnl',          label: 'ر/خ' },
      { key: '_weight',       label: 'الوزن' },
      { key: 'target_weight', label: 'مستهدف' },
      { key: '',              label: '' }
    ];
    thead.innerHTML = cols.map(c => c.key
      ? `<th class="sortable" onclick="sortHoldings('${c.key}')" style="cursor:pointer;user-select:none">${c.label} ${hSortArrow(c.key)}</th>`
      : `<th></th>`
    ).join('');
  }

  if (!holdings.length) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><div class="icon">📋</div><p>لا توجد أسهم — ابدأ بإضافة أول سهم</p></div></td></tr>`;
    enableInlineEditing(tbody, onHoldingSaved);
    return;
  }

  // ترتيب الصفوف
  const numKeys = new Set(['shares','avg_price','current_price','target_weight','_cost','_value','_pnl','_weight']);
  const sorted = [...holdings].sort((a, b) => {
    if (!hSortField) return 0;
    let av, bv;
    if (hSortField === '_cost')   { av = a.shares * a.avg_price;     bv = b.shares * b.avg_price; }
    else if (hSortField === '_value')  { av = a.shares * a.current_price; bv = b.shares * b.current_price; }
    else if (hSortField === '_pnl')    { av = (a.shares * a.current_price) - (a.shares * a.avg_price); bv = (b.shares * b.current_price) - (b.shares * b.avg_price); }
    else if (hSortField === '_weight') { av = total > 0 ? a.shares * a.current_price / total : 0; bv = total > 0 ? b.shares * b.current_price / total : 0; }
    else { av = a[hSortField]; bv = b[hSortField]; }
    if (numKeys.has(hSortField)) { av = +av || 0; bv = +bv || 0; }
    if (av < bv) return hSortDir === 'asc' ? -1 : 1;
    if (av > bv) return hSortDir === 'asc' ? 1  : -1;
    return 0;
  });

  tbody.innerHTML = sorted.map(h => {
    const cost  = h.shares * h.avg_price;
    const value = h.shares * h.current_price;
    const pnl   = value - cost;
    const pnlP  = cost > 0 ? pnl / cost * 100 : 0;
    const wt    = total > 0 ? value / total * 100 : 0;
    const cls   = pnl >= 0 ? 'text-success' : 'text-danger';

    // ── مؤشر قِدم السعر ───────────────────────────────────────
    const ageDays = getPriceAgeDays(h.ticker);
    let staleBadge = '';
    if (ageDays === null) {
      staleBadge = `<span title="السعر لم يُحدَّث بعد — انقر 🔄 لتحديث الأسعار"
        style="color:var(--text-muted);font-size:0.7rem;margin-right:4px;cursor:help">⏰?</span>`;
    } else if (ageDays > STALE_DAYS) {
      staleBadge = `<span title="السعر قديم — آخر تحديث منذ ${Math.floor(ageDays)} يوم"
        style="color:var(--danger);font-size:0.7rem;margin-right:4px;cursor:help">⏰${Math.floor(ageDays)}ي</span>`;
    }

    return `<tr>
      <td ${ed('holdings',h.id,'ticker','text',h.ticker)}><strong class="text-accent">${esc(h.ticker)}</strong></td>
      <td ${ed('holdings',h.id,'name','text',h.name)}>${esc(h.name)}</td>
      <td ${ed('holdings',h.id,'sector','text',h.sector||'','text-muted small')}>${esc(h.sector || '—')}</td>
      <td ${ed('holdings',h.id,'shares','number',h.shares)}>${formatShares(h.shares)}</td>
      <td ${ed('holdings',h.id,'avg_price','number',h.avg_price)}>${formatSAR(h.avg_price)}</td>
      <td ${ed('holdings',h.id,'current_price','number',h.current_price)}>${staleBadge}${formatSAR(h.current_price)}</td>
      <td class="num">${formatSAR(cost)}</td>
      <td class="num bold">${formatSAR(value)}</td>
      <td class="num ${cls}">${formatSAR(pnl,true)}<br><span class="small">${(pnl>=0?'+':'')}${pnlP.toFixed(2)}%</span></td>
      <td class="num">${wt.toFixed(2)}%</td>
      <td ${ed('holdings',h.id,'target_weight','number',h.target_weight||0,'text-muted')}>${(+h.target_weight||0).toFixed(2)}%</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="openModal('${esc(h.id)}')">تعديل</button>
          <button class="btn btn-danger btn-sm"    onclick="deleteHolding('${esc(h.id)}')">حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  enableInlineEditing(tbody, onHoldingSaved);
}

async function onHoldingSaved(id, field, val) {
  const h = holdings.find(x => x.id === id);
  if (h) h[field] = val;
  // لو عدّل السعر يدوياً — ضع علامة حتى لا يُلمس في الـ refresh التلقائي
  if (field === 'current_price' && h) {
    h.price_manual = true;
    await supabaseClient.from('holdings').update({ price_manual: true }).eq('id', id);
    checkPriceZones(h.ticker, +val);
  }
  renderStats();
  renderCharts();
  renderTable();
  renderPriceZonesCard();
  renderBreakEvenCard();
  renderAllocationChart();
  renderRetirementCard();
}

// ── Price Zone Alerts ─────────────────────────────────────────
function checkPriceZones(ticker, price) {
  const zone = stockZones[ticker];
  if (!zone) return;
  const h = holdings.find(x => x.ticker === ticker);
  const name = h?.name || '';
  const alerts = [];
  if (zone.entry_price != null && price <= zone.entry_price)
    alerts.push({ ticker, name, type: 'entry', label: 'منطقة شراء', color: '#22c55e', price, zone: zone.entry_price });
  if (zone.exit_price != null && price >= zone.exit_price)
    alerts.push({ ticker, name, type: 'exit', label: 'منطقة بيع', color: '#f85149', price, zone: zone.exit_price });
  alerts.forEach(a => showPriceZoneAlert(a));
}

function showPriceZoneAlert({ ticker, label, color, price, zone, name }) {
  // منع تكرار نفس الإشعار
  const dedupKey = 'pz-shown-' + ticker + '-' + label;
  if (sessionStorage.getItem(dedupKey)) return;
  sessionStorage.setItem(dedupKey, '1');

  const icon = label === 'منطقة شراء' ? '🟢' : '🔴';
  const action = label === 'منطقة شراء' ? 'وصل الحد' : 'تجاوز الحد';
  const msg = `${icon} <strong>${ticker}</strong>${name ? ` (${name})` : ''} — ${label}! السعر الحالي <strong>${price}</strong> ${action} ${zone}`;
  const type = label === 'منطقة شراء' ? 'success' : 'error';
  showToast(msg, type);
}

function renderPriceZonesCard() {
  const el = document.getElementById('price-zones-card-body');
  if (!el) return;
  const totalValue = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  const rows = [];
  holdings.forEach(h => {
    const zone = stockZones[h.ticker];
    if (!zone || (zone.entry_price == null && zone.exit_price == null)) return;
    const price = +h.current_price;
    let entryStatus = '', exitStatus = '';
    if (zone.entry_price != null) {
      if (price <= zone.entry_price) {
        const currentW = totalValue > 0 ? (+h.shares * price) / totalValue * 100 : 0;
        const targetW  = stockTargets[h.ticker] || 0;
        const isFull   = targetW > 0 && currentW >= targetW * 0.95;
        const fullBadge = isFull
          ? ` <span style="background:rgba(240,180,41,0.18);color:#f0b429;border-radius:4px;padding:1px 6px;font-size:0.72rem;font-weight:700">⚠️ الهدف مكتمل</span>`
          : '';
        entryStatus = `<span style="color:#22c55e;font-weight:bold">🟢 في منطقة شراء — السعر ${price} وصل الحد ${zone.entry_price}</span>${fullBadge}`;
      } else
        entryStatus = `<span class="text-muted">لم يصل — السعر ${price} / الحد ${zone.entry_price}</span>`;
    }
    if (zone.exit_price != null) {
      if (price >= zone.exit_price)
        exitStatus = `<span style="color:#f85149;font-weight:bold">🔴 في منطقة بيع — السعر ${price} تجاوز الحد ${zone.exit_price}</span>`;
      else
        exitStatus = `<span class="text-muted">لم يصل — السعر ${price} / الحد ${zone.exit_price}</span>`;
    }
    rows.push({ ticker: h.ticker, name: h.name, entryStatus, exitStatus, zone, price });
  });

  if (!rows.length) {
    el.innerHTML = `<div class="text-muted small" style="text-align:center;padding:12px">
      لا توجد مناطق سعرية مُعرَّفة — أضفها من <a href="targets.html" style="color:var(--accent)">صفحة الأهداف</a>
    </div>`;
    return;
  }

  el.innerHTML = `<table style="width:100%;font-size:0.82rem;border-collapse:collapse">
    <thead><tr style="color:var(--text-muted);border-bottom:1px solid var(--border)">
      <th style="text-align:right;padding:4px 6px">السهم</th>
      <th style="text-align:right;padding:4px 6px">منطقة الشراء ≤</th>
      <th style="text-align:right;padding:4px 6px">منطقة البيع ≥</th>
    </tr></thead>
    <tbody>${rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:4px 6px"><strong class="text-accent">${esc(r.ticker)}</strong>${r.name ? `<br><span class="text-muted" style="font-size:0.75rem">${esc(r.name)}</span>` : ''}</td>
      <td style="padding:4px 6px">${r.zone.entry_price != null ? r.entryStatus || '—' : '<span class="text-muted">—</span>'}</td>
      <td style="padding:4px 6px">${r.zone.exit_price  != null ? r.exitStatus  || '—' : '<span class="text-muted">—</span>'}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ── Break-Even Card ───────────────────────────────────────────
function setBreakevenMode(mode) {
  breakevenMode = mode;
  if (beChart && mode !== 'chart') { beChart.destroy(); beChart = null; }
  ['summary','detail','bars','chart'].forEach(m => {
    const btn = document.getElementById('be-mode-' + m);
    if (btn) {
      btn.className = 'btn btn-sm ' + (m === mode ? 'btn-primary' : 'btn-secondary');
      btn.style.cssText = 'border-radius:0;border:none;padding:4px 10px;font-size:0.76rem';
    }
  });
  renderBreakEvenCard();
}

function renderBreakEvenCard() {
  const el = document.getElementById('breakeven-body');
  if (!el) return;

  const s = window._ds || {};

  // ── المدخلات الأساسية ─────────────────────────────────────
  const netCapital   = s.totalInvested   || 0;   // buys - sells
  const totalDivAll  = s.totalDivAll     || 0;
  const realizedPnL  = s.realizedPnL     || 0;
  const grantMap     = s.grantMap        || {};

  // قيمة المحفظة والتكلفة الحالية
  const currentValue = holdings.reduce((acc, h) => acc + +h.shares * +h.current_price, 0);
  const costBasis    = holdings.reduce((acc, h) => acc + +h.shares * +h.avg_price, 0);

  // قيمة المنح بالسعر الحالي
  const grantValueNow = Object.entries(grantMap).reduce((acc, [ticker, grantShares]) => {
    const h = holdings.find(x => x.ticker === ticker);
    return acc + (h ? +h.current_price * grantShares : 0);
  }, 0);

  // ── المعادلة الكاملة ──────────────────────────────────────
  // currentValue يشمل أسهم المنح (موجودة في holdings) — لا نضيف grantValueNow مرة ثانية
  // نقد المحفظة يُحسب كـ«عائد» فقط بقدر ما يمكن أن يكون حصيلة بيع (totalSells)؛
  // أي نقد مودَع زيادة عن ذلك (إيداع جديد لم يُستثمر) ليس عائداً ولا يُحتسب
  const totalSells   = s.totalSells || 0;
  const cashReturned = Math.min(portfolioCash, totalSells);
  const totalReturns = currentValue + cashReturned + totalDivAll;

  // صافي الربح/الخسارة الحقيقي = إجمالي العوائد − ما أنفق
  const trueNetPnL   = totalReturns - netCapital;

  // ر/خ غير محقق (ارتفاع/انخفاض السعر)
  const unrealizedPnL = currentValue - costBasis;

  // نسبة العائد الكلي على رأس المال
  const totalReturnPct = netCapital > 0 ? (trueNetPnL / netCapital * 100) : 0;

  // نقطة التعادل: التقدم = إجمالي العوائد / رأس المال المنشغل
  const breProgress = netCapital > 0 ? Math.min(totalReturns / netCapital * 100, 200) : 0;
  const isBreakEven = trueNetPnL >= 0;
  const gapToBreakEven = netCapital - totalReturns; // سالب = تجاوزت نقطة التعادل

  // ── بناء الكرت ──────────────────────────────────────────
  const pnlColor  = trueNetPnL >= 0 ? 'var(--success)' : 'var(--danger)';
  const pnlIcon   = trueNetPnL >= 0 ? '✅' : '❌';
  const barColor  = isBreakEven ? '#22c55e' : (breProgress > 75 ? '#f0b429' : '#f85149');
  const barWidth  = Math.min(breProgress, 100);

  const row = (label, val, cls = '', sub = '') => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--border)">
      <span class="small" style="color:var(--text-muted)">${label}</span>
      <div style="text-align:left">
        <span class="num bold ${cls}" style="font-size:0.95rem">${val}</span>
        ${sub ? `<span class="small text-muted" style="margin-right:6px">${sub}</span>` : ''}
      </div>
    </div>`;

  // ── شريط التقدم المشترك ──────────────────────────────────
  // breProgress = نسبة استرداد رأس المال. 100% = نقطة التعادل بالضبط.
  // ما زاد عن 100% هو ربحك الصافي على رأس المال (profit% = breProgress − 100).
  const recoveredPct = breProgress;                        // كم استرجعت من رأس مالك
  const aboveBE      = recoveredPct - 100;                 // + فوق التعادل / − تحته
  const recoveredCaption = isBreakEven
    ? `استرجعت ${recoveredPct.toFixed(1)}% من رأس مالك — أي <b>+${aboveBE.toFixed(1)}% ربح</b> فوق نقطة التعادل`
    : `استرجعت ${recoveredPct.toFixed(1)}% من رأس مالك — أي <b>${aboveBE.toFixed(1)}% تحت نقطة التعادل</b>`;
  const progressBar = `
    <div style="margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span class="small text-muted">استرداد رأس المال</span>
        <span class="small bold" style="color:${barColor}">${recoveredPct.toFixed(1)}%</span>
      </div>
      <div style="background:var(--bg-3);border-radius:99px;height:10px;overflow:hidden">
        <div style="height:100%;border-radius:99px;background:${barColor};width:${barWidth}%;transition:width 0.4s ease"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:4px">
        <span class="small text-muted">0%</span>
        <span class="small" style="color:var(--accent);font-weight:600">↑ نقطة التعادل = 100%</span>
        ${isBreakEven
          ? '<span class="small text-success font-bold">✅ تجاوزتها</span>'
          : `<span class="small text-muted">متبقي ${formatSAR(gapToBreakEven)}</span>`}
      </div>
      <div class="small text-muted" style="margin-top:6px;text-align:center;line-height:1.5">${recoveredCaption}</div>
    </div>`;

  // ── الصافي الكبير المشترك ─────────────────────────────────
  const bigNumber = `
    <div style="text-align:center;padding:14px;background:var(--bg-3);border-radius:var(--radius);margin-bottom:16px;border:1px solid ${pnlColor}33">
      <div class="small text-muted" style="margin-bottom:4px">صافي الربح / الخسارة الحقيقي</div>
      <div style="font-size:1.7rem;font-weight:700;color:${pnlColor}">${pnlIcon} ${formatSAR(Math.abs(trueNetPnL))}</div>
      <div class="small" style="color:${pnlColor};margin-top:2px">${trueNetPnL >= 0 ? 'ربح' : 'خسارة'} ${Math.abs(totalReturnPct).toFixed(2)}% على رأس المال</div>
    </div>`;

  // ════════════════════════════════════════
  // وضع 1: ملخص — الأرقام الرئيسية فقط
  // ════════════════════════════════════════
  if (breakevenMode === 'summary') {
    const statItem = (label, val, cls = '') => `
      <div style="text-align:center;padding:10px 8px;background:var(--bg-3);border-radius:var(--radius)">
        <div class="num bold ${cls}" style="font-size:1rem">${val}</div>
        <div class="small text-muted" style="margin-top:2px;font-size:0.72rem">${label}</div>
      </div>`;
    // نُظهر «النقد من حصيلة البيع» كمكوّن مستقل حين يكون > 0، وإلا لا تتطابق
    // الصناديق مع صافي الربح (الصافي يشمله لكنه كان مخفياً عن الملخّص).
    const summaryStats = [
      statItem('القيمة السوقية', formatSAR(currentValue), 'text-accent'),
      statItem('الأرباح الموزعة', formatSAR(totalDivAll), 'text-success'),
      cashReturned > 0 ? statItem('نقد من حصيلة البيع', formatSAR(cashReturned), 'text-success') : '',
      statItem('رأس المال المنشغل', formatSAR(netCapital)),
    ].filter(Boolean);
    const cols = summaryStats.length === 4 ? 2 : 3;
    el.innerHTML = progressBar + bigNumber + `
      <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px">
        ${summaryStats.join('')}
      </div>`;
    return;
  }

  // ════════════════════════════════════════
  // وضع 2: تفصيل — كل الحسابات
  // ════════════════════════════════════════
  if (breakevenMode === 'detail') {
    el.innerHTML = progressBar + bigNumber + `
      <div style="margin-bottom:8px">
        <div class="small bold" style="color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">التكلفة</div>
        ${row('رأس المال المنشغل الصافي (مشتريات − مبيعات)', formatSAR(netCapital), 'text-danger')}
      </div>
      <div style="margin-bottom:8px;margin-top:12px">
        <div class="small bold" style="color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">العوائد</div>
        ${row('قيمة المحفظة الحالية', formatSAR(currentValue), '', grantValueNow > 0 ? `(يشمل منحة ${s.totalGrantShares || 0} سهم)` : '')}
        ${cashReturned > 0 ? row('نقد من حصيلة البيع عند الوسيط', formatSAR(cashReturned)) : ''}
        ${row('إجمالي الأرباح الموزعة (كل الأوقات)', formatSAR(totalDivAll), 'text-success')}
        ${row('إجمالي العوائد', formatSAR(totalReturns), trueNetPnL >= 0 ? 'text-success' : '')}
      </div>
      <div style="margin-top:12px">
        <div class="small bold" style="color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">تحليل الأداء</div>
        ${row('ر/خ غير محقق (تغير السعر فقط)', formatSAR(unrealizedPnL), unrealizedPnL >= 0 ? 'text-success' : 'text-danger')}
        ${row('ر/خ محقق من المبيعات', formatSAR(realizedPnL), realizedPnL >= 0 ? 'text-success' : 'text-danger')}
        ${row('مساهمة الأرباح الموزعة', formatSAR(totalDivAll), 'text-success')}
      </div>`;
    return;
  }

  // ════════════════════════════════════════
  // وضع 3: مساهمة — أشرطة أفقية
  // ════════════════════════════════════════
  if (breakevenMode === 'bars') {
    // كل مكوّن كنسبة من رأس المال المنشغل
    const pct = v => netCapital > 0 ? Math.max(0, v / netCapital * 100) : 0;
    const components = [
      { label: 'ر/خ ورقي (القيمة السوقية)', value: unrealizedPnL, color: unrealizedPnL >= 0 ? '#3b82f6' : '#f85149', base: pct(currentValue) },
      { label: 'ر/خ محقق من المبيعات',      value: realizedPnL,  color: realizedPnL  >= 0 ? '#22c55e' : '#f85149', base: pct(realizedPnL) },
      { label: 'أرباح موزعة مستلمة',        value: totalDivAll,  color: '#3fb950',                                   base: pct(totalDivAll) },
      cashReturned > 0
        ? { label: 'نقد من حصيلة البيع',    value: cashReturned, color: '#f0b429',                                  base: pct(cashReturned) }
        : null,
    ].filter(Boolean);

    const totalComponents = components.reduce((s, c) => s + Math.max(0, c.value), 0);
    const componentBars = components.map(c => {
      const widthPct = totalComponents > 0 ? Math.max(0, c.value) / totalComponents * 100 : 0;
      const absPct   = netCapital > 0 ? (Math.abs(c.value) / netCapital * 100).toFixed(1) : '0.0';
      const valColor = c.value >= 0 ? c.color : '#f85149';
      return `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span class="small" style="color:var(--text-2)">${c.label}</span>
            <span class="small bold" style="color:${valColor}">${c.value >= 0 ? '+' : ''}${formatSAR(c.value)} (${absPct}%)</span>
          </div>
          <div style="background:var(--bg-3);border-radius:6px;height:22px;overflow:hidden;position:relative">
            <div style="height:100%;width:${widthPct.toFixed(1)}%;background:${c.color}33;border-radius:6px;
                        border-right:3px solid ${c.color};transition:width .4s ease;position:relative;min-width:${c.value > 0 ? '3px' : '0'}"></div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = progressBar + `
      <div style="margin-bottom:16px">
        <div class="small bold" style="color:var(--text-muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em">
          مساهمة كل مكوّن في إجمالي العوائد (${formatSAR(totalReturns)})
        </div>
        ${componentBars}
        <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px;display:flex;justify-content:space-between">
          <span class="small text-muted">رأس المال المنشغل</span>
          <span class="num bold">${formatSAR(netCapital)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:4px 0">
          <span class="small text-muted">إجمالي العوائد</span>
          <span class="num bold ${trueNetPnL >= 0 ? 'text-success' : 'text-danger'}">${formatSAR(totalReturns)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:4px 0">
          <span class="small bold">صافي الربح / الخسارة</span>
          <span class="num bold" style="color:${pnlColor}">${pnlIcon} ${formatSAR(Math.abs(trueNetPnL))} (${Math.abs(totalReturnPct).toFixed(2)}%)</span>
        </div>
      </div>`;
    return;
  }

  // ════════════════════════════════════════
  // وضع 4: مخطط — Chart.js مقارنة بصرية
  // ════════════════════════════════════════
  if (breakevenMode === 'chart') {
    if (beChart) { beChart.destroy(); beChart = null; }

    el.innerHTML = `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span class="small text-muted">استرداد رأس المال (التعادل = 100%)</span>
          <span class="small bold" style="color:${barColor}">${breProgress.toFixed(1)}% ${isBreakEven ? '✅' : ''}</span>
        </div>
        <div style="background:var(--bg-3);border-radius:99px;height:8px;overflow:hidden">
          <div style="height:100%;border-radius:99px;background:${barColor};width:${barWidth}%;transition:width .4s"></div>
        </div>
      </div>

      <!-- صافي الربح مضغوط -->
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:10px 14px;background:var(--bg-3);border-radius:var(--radius);
                  margin-bottom:14px;border:1px solid ${pnlColor}33">
        <span class="small text-muted">صافي الربح / الخسارة</span>
        <span class="num bold" style="color:${pnlColor}">${pnlIcon} ${formatSAR(Math.abs(trueNetPnL))} · ${Math.abs(totalReturnPct).toFixed(2)}%</span>
      </div>

      <!-- Canvas للمخطط -->
      <div style="position:relative;height:180px;margin-bottom:10px">
        <canvas id="be-chart-canvas"></canvas>
      </div>

      <!-- مفتاح الألوان -->
      <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:6px">
        <span class="small" style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:3px;background:rgba(248,81,73,.7);display:inline-block"></span>رأس المال</span>
        <span class="small" style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:3px;background:rgba(59,130,246,.7);display:inline-block"></span>قيمة المحفظة</span>
        <span class="small" style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:3px;background:rgba(63,185,80,.7);display:inline-block"></span>أرباح موزعة</span>
        ${cashReturned > 0 ? `<span class="small" style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:3px;background:rgba(240,180,41,.7);display:inline-block"></span>نقد من البيع</span>` : ''}
      </div>`;

    // نبني المخطط بعد أن يُدرَج الـ canvas في DOM
    requestAnimationFrame(() => {
      const canvas = document.getElementById('be-chart-canvas');
      if (!canvas) return;

      // بيانات المخطط: شريطان أفقيان متراكمان
      // 1. رأس المال (شريط واحد أحمر)
      // 2. العوائد مكدّسة: قيمة المحفظة + أرباح + نقد
      beChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: ['رأس المال المنشغل', 'إجمالي العوائد'],
          datasets: [
            {
              label: 'رأس المال',
              data: [netCapital, 0],
              backgroundColor: 'rgba(248,81,73,.7)',
              borderColor: '#f85149',
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: 'قيمة المحفظة',
              data: [0, currentValue],
              backgroundColor: 'rgba(59,130,246,.7)',
              borderColor: '#3b82f6',
              borderWidth: 1,
              borderRadius: 0,
            },
            {
              label: 'أرباح موزعة',
              data: [0, totalDivAll],
              backgroundColor: 'rgba(63,185,80,.7)',
              borderColor: '#3fb950',
              borderWidth: 1,
              borderRadius: 0,
            },
            ...(cashReturned > 0 ? [{
              label: 'نقد من البيع',
              data: [0, cashReturned],
              backgroundColor: 'rgba(240,180,41,.7)',
              borderColor: '#f0b429',
              borderWidth: 1,
              borderRadius: 4,
            }] : []),
          ],
        },
        options: {
          indexAxis: 'y',   // horizontal bars
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              rtl: true,
              callbacks: {
                label: ctx => `  ${ctx.dataset.label}: ${formatSAR(ctx.raw)}`,
                afterBody: items => {
                  if (items[0].dataIndex === 1) {
                    return [`  ─────────────────`, `  الإجمالي: ${formatSAR(totalReturns)}`];
                  }
                  return [];
                },
              },
            },
          },
          scales: {
            x: {
              stacked: true,
              ticks: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'K' : v },
              grid: { color: 'rgba(48,54,61,.5)' },
            },
            y: {
              stacked: true,
              ticks: { color: '#c9d1d9', font: { family: 'Tajawal', size: 12 } },
              grid: { display: false },
            },
          },
        },
      });

      // خط نقطة التعادل (رأس المال) كـ annotation مرسوم يدوياً بعد الرسم
      const originalDraw = beChart.draw.bind(beChart);
      beChart.draw = function() {
        originalDraw();
        const ctx2   = canvas.getContext('2d');
        const xScale = beChart.scales.x;
        const yScale = beChart.scales.y;
        const xPx    = xScale.getPixelForValue(netCapital);
        const top    = yScale.top;
        const bot    = yScale.bottom;
        ctx2.save();
        ctx2.setLineDash([6, 4]);
        ctx2.strokeStyle = '#f0b429';
        ctx2.lineWidth   = 1.5;
        ctx2.beginPath();
        ctx2.moveTo(xPx, top - 4);
        ctx2.lineTo(xPx, bot + 4);
        ctx2.stroke();
        ctx2.fillStyle = '#f0b429';
        ctx2.font      = '11px Tajawal';
        ctx2.fillText('نقطة التعادل', xPx + 4, top + 12);
        ctx2.restore();
      };
      beChart.draw();
    });
    return;
  }
}

// ── Asset Allocation Chart ────────────────────────────────────
function _allocParts() {
  const s = window._ds || {};
  const stocks = holdings.reduce((a, h) => a + +h.shares * +h.current_price, 0);
  const parts = [
    { label: 'أسهم',   value: stocks,             color: '#3b82f6' },
    { label: 'نقد',     value: portfolioCash || 0, color: '#22c55e' },
    { label: 'عقارات', value: s.reTotal || 0,     color: '#f0b429' },
    { label: 'صكوك',   value: getSukukActiveTotal(), color: '#a855f7' }
  ].filter(p => p.value > 0);
  const total = parts.reduce((a, p) => a + p.value, 0);
  return { parts, total };
}

function renderAllocationChart() {
  const cont = document.getElementById('allocChart-container');
  const leg  = document.getElementById('alloc-legend');
  const { parts, total } = _allocParts();

  if (!total) {
    if (allocChart) { allocChart.destroy(); allocChart = null; }
    if (cont) cont.style.display = 'none';
    if (leg)  leg.innerHTML = '<div class="text-muted small" style="text-align:center;padding:12px">لا توجد أصول مسجّلة بعد</div>';
    return;
  }
  if (cont) cont.style.display = '';

  const ctx = g('allocChart')?.getContext('2d');
  if (!ctx) return;
  if (allocChart) allocChart.destroy();
  allocChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: parts.map(p => p.label), datasets: [{ data: parts.map(p => p.value), backgroundColor: parts.map(p => p.color), borderColor: '#1c2128', borderWidth: 2, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8b949e', font: { family: 'Tajawal', size: 11 }, padding: 10, usePointStyle: true } },
        tooltip: { backgroundColor: '#1c2128', titleColor: '#e6edf3', bodyColor: '#8b949e', borderColor: '#30363d', borderWidth: 1, titleFont: { family: 'Tajawal' }, bodyFont: { family: 'Tajawal' },
          callbacks: { label: c => { const pct = total > 0 ? (c.parsed / total * 100).toFixed(1) : 0; return ' ' + formatSAR(c.parsed) + '  (' + pct + '%)'; } } }
      }
    }
  });

  if (leg) {
    leg.innerHTML = parts.map(p => {
      const pct = (p.value / total * 100).toFixed(1);
      return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;padding:3px 0">
        <span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:2px;background:${p.color};display:inline-block"></span>${p.label}</span>
        <span class="num"><strong>${pct}%</strong> <span class="text-muted">${formatSAR(p.value)}</span></span>
      </div>`;
    }).join('') + `<div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);margin-top:6px;padding-top:6px;font-size:0.85rem">
        <span class="text-muted">الإجمالي</span><span class="num bold text-accent">${formatSAR(total)}</span></div>`;
  }
}

// ── Retirement / FIRE Card ────────────────────────────────────
function renderRetirementCard() {
  const el = document.getElementById('retirement-body');
  if (!el) return;
  const s = window._ds || {};
  const goal = getRetirementGoal();

  const stocks  = holdings.reduce((a, h) => a + +h.shares * +h.current_price, 0);
  const reTotal = s.reTotal || 0;
  const sukuk   = getSukukActiveTotal();
  // AUDIT-FIX (M3): the 4% / Trinity SWR applies to LIQUID, drawdownable assets. Counting illiquid
  // real estate (esp. a primary residence — produces no 4% withdrawable cash without a sale)
  // overstates FIRE progress. Base progress + safe-withdrawal on investable assets and show total
  // net worth separately for context.
  const investAssets = stocks + (portfolioCash || 0) + reTotal + sukuk;  // total incl. RE
  const fireBase     = stocks + (portfolioCash || 0) + sukuk;            // liquid / drawdownable
  const netWorth     = s.latestNW != null ? s.latestNW : investAssets;   // total NW (context only)

  if (!goal.monthly) {
    el.innerHTML = `<div style="text-align:center;padding:18px 8px">
      <p class="text-muted small" style="margin-bottom:14px">أدخل مصاريفك الشهرية المتوقعة بعد التقاعد لحساب رقم الاستقلال المالي (قاعدة الـ4%).</p>
      <button class="btn btn-primary btn-sm" onclick="editRetirementGoal()">＋ إدخال المصاريف الشهرية</button>
    </div>`;
    return;
  }

  const annualExpenses = goal.monthly * 12;
  const fireNumber = goal.swr > 0 ? annualExpenses / (goal.swr / 100) : annualExpenses * 25;
  const progress = fireNumber > 0 ? Math.min(fireBase / fireNumber * 100, 100) : 0;
  const remaining = Math.max(0, fireNumber - fireBase);
  const safeAnnualWithdrawal = fireBase * (goal.swr / 100);
  const safeMonthly = safeAnnualWithdrawal / 12;
  const barColor = progress >= 100 ? '#22c55e' : progress >= 50 ? '#f0b429' : '#3b82f6';

  const row = (label, val, cls = '') => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--border)">
      <span class="small" style="color:var(--text-muted)">${label}</span>
      <span class="num bold ${cls}" style="font-size:0.9rem">${val}</span>
    </div>`;

  el.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span class="small text-muted">التقدم نحو الاستقلال المالي</span>
        <span class="small bold" style="color:${barColor}">${progress.toFixed(1)}%</span>
      </div>
      <div style="background:var(--bg-3);border-radius:99px;height:10px;overflow:hidden">
        <div style="height:100%;border-radius:99px;background:${barColor};width:${progress}%;transition:width 0.4s ease"></div>
      </div>
    </div>
    <div style="text-align:center;padding:12px;background:var(--bg-3);border-radius:var(--radius);margin-bottom:14px">
      <div class="small text-muted" style="margin-bottom:2px">رقم الاستقلال المالي المستهدف</div>
      <div style="font-size:1.5rem;font-weight:700;color:var(--accent)">${formatSAR(fireNumber)}</div>
      <div class="small text-muted" style="margin-top:2px">مصاريف ${formatSAR(annualExpenses)}/سنة ÷ ${goal.swr}%</div>
    </div>
    ${row('الأصول السائلة (للسحب)', formatSAR(fireBase), 'text-accent')}
    ${reTotal > 0 ? row('صافي الثروة الكلي (مع العقار)', formatSAR(netWorth) + ' — غير مُحتسب', 'text-muted') : ''}
    ${row('المتبقي للوصول للهدف', formatSAR(remaining), remaining > 0 ? 'text-danger' : 'text-success')}
    ${row('السحب الآمن الحالي', formatSAR(safeMonthly) + '/شهر', '')}
    ${row('تغطية مصاريفك الآن', (goal.monthly > 0 ? (safeMonthly / goal.monthly * 100).toFixed(1) : 0) + '%', safeMonthly >= goal.monthly ? 'text-success' : 'text-muted')}
    ${goal.swr !== 4 ? (() => {
      const fire4 = annualExpenses / 0.04;
      const prog4 = Math.min(fireBase / fire4 * 100, 100);
      const rem4  = Math.max(0, fire4 - fireBase);
      return `<div style="margin-top:10px;padding:10px 12px;background:rgba(240,180,41,.06);border:1px solid rgba(240,180,41,.2);border-radius:8px">
        <div class="small" style="color:var(--warning,#f0b429);font-weight:600;margin-bottom:6px">📐 مقارنة بقاعدة 4% (Trinity Study)</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0">
          <span class="small text-muted">رقم FIRE عند 4%</span>
          <span class="num bold small">${formatSAR(fire4)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0">
          <span class="small text-muted">نسبة الإنجاز</span>
          <span class="num small" style="color:${prog4>=100?'var(--success)':prog4>=50?'var(--warning)':'var(--accent)'}">${prog4.toFixed(1)}%</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0">
          <span class="small text-muted">المتبقي</span>
          <span class="num small ${rem4>0?'text-danger':'text-success'}">${formatSAR(rem4)}</span>
        </div>
      </div>`;
    })() : ''}
    <div style="text-align:center;margin-top:12px">
      <button class="btn btn-secondary btn-sm" onclick="editRetirementGoal()">تعديل المصاريف / نسبة السحب</button>
    </div>`;
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(id = null) {
  editingId = id;
  g('modal-title').textContent = id ? 'تعديل السهم' : 'إضافة سهم جديد';
  if (id) {
    const h = holdings.find(x => x.id === id);
    if (!h) return;
    g('h-ticker').value    = h.ticker;
    g('h-name').value      = h.name;
    g('h-sector').value    = h.sector || '';
    g('h-shares').value    = h.shares;
    g('h-avg-price').value = h.avg_price;
    g('h-cur-price').value = h.current_price;
    g('h-target-wt').value = h.target_weight || '';
  } else {
    g('holding-form').reset();
  }
  g('holding-modal').style.display = 'flex';
}

function closeModal() {
  g('holding-modal').style.display = 'none';
  editingId = null;
}

async function saveHolding(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id: user.id,
    ticker:        g('h-ticker').value.trim().toUpperCase(),
    name:          g('h-name').value.trim(),
    sector:        g('h-sector').value.trim(),
    shares:        +g('h-shares').value    || 0,
    avg_price:     +g('h-avg-price').value || 0,
    current_price: +g('h-cur-price').value || 0,
    target_weight: +g('h-target-wt').value || 0
  };
  let error;
  if (editingId) ({ error } = await supabaseClient.from('holdings').update(payload).eq('id', editingId));
  else           ({ error } = await supabaseClient.from('holdings').insert([payload]));
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editingId ? 'تم التحديث' : 'تمت الإضافة', 'success');
  closeModal();
  await reloadHoldings();
  renderStats(); renderRebalancingAlerts(); renderPortfolioHealthCard(); renderDiversificationCard(); renderCharts(); renderTable();
}

// ── Sync holdings from transactions ──────────────────────────
let _syncPending = null;  // يحمل بيانات المزامنة ريثما يؤكد المستخدم

async function syncHoldingsFromTx() {
  const btn = document.getElementById('btn-sync-tx');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الفحص…'; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  const { data: txAll, error: txErr } = await supabaseClient
    .from('transactions')
    .select('ticker, name, type, shares, price, total')
    .eq('is_archived', false)
    .order('date', { ascending: true });

  if (txErr || !txAll) {
    showToast('خطأ في جلب المعاملات', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'مزامنة من المعاملات'; }
    return;
  }

  // احسب الأسهم ومتوسط السعر لكل رمز
  const map = {};
  txAll.forEach(tx => {
    if (!map[tx.ticker]) map[tx.ticker] = { name: tx.name, buyShares: 0, buyCost: 0, sellShares: 0 };
    const m = map[tx.ticker];
    if (tx.type === 'buy') {
      m.buyShares += +tx.shares;
      m.buyCost   += +tx.shares * +tx.price;
    } else if (tx.type === 'grant') {
      m.buyShares += +tx.shares;
    } else if (tx.type === 'sell') {
      m.sellShares += +tx.shares;
    }
  });
  for (const [, m] of Object.entries(map)) {
    m.shares   = m.buyShares - m.sellShares;
    m.avgPrice = m.buyShares > 0 ? m.buyCost / m.buyShares : 0;
  }

  // اجلب الـ holdings الحالية + user_stocks
  const [{ data: existingH }, { data: userStocksDB }] = await Promise.all([
    supabaseClient.from('holdings').select('*'),
    supabaseClient.from('user_stocks').select('ticker, sector')
  ]);
  const existMap = {};
  (existingH || []).forEach(h => { existMap[h.ticker] = h; });
  const sectorMap = {};
  (userStocksDB || []).forEach(s => { sectorMap[s.ticker] = s.sector || ''; });

  // ── قارن: ما الذي سيتغير؟ ─────────────────────────────────
  const diffs = [];
  for (const [ticker, calc] of Object.entries(map)) {
    const existing = existMap[ticker];
    const newShares   = +calc.shares.toFixed(4);
    const newAvg      = +(calc.avgPrice || 0).toFixed(4);

    if (calc.shares <= 0) {
      if (existing) diffs.push({ ticker, type: 'delete',
        oldShares: +existing.shares, newShares: 0,
        oldAvg: +existing.avg_price, newAvg: 0 });
      continue;
    }
    if (!existing) {
      diffs.push({ ticker, type: 'add',
        oldShares: 0, newShares,
        oldAvg: 0, newAvg });
    } else {
      const sharesChanged = Math.abs(+existing.shares - newShares) > 0.0001;
      const avgChanged    = Math.abs(+existing.avg_price - newAvg) > 0.001;
      if (sharesChanged || avgChanged) {
        diffs.push({ ticker, type: 'update',
          oldShares: +existing.shares, newShares,
          oldAvg: +existing.avg_price, newAvg });
      }
    }
  }

  if (btn) { btn.disabled = false; btn.textContent = 'مزامنة من المعاملات'; }

  if (!diffs.length) {
    showToast('✓ المحفظة متزامنة — لا يوجد فرق', 'success');
    return;
  }

  // احفظ البيانات وانتظر تأكيد المستخدم
  _syncPending = { map, existMap, sectorMap, userId: user.id };
  _showSyncModal(diffs);
}

function _showSyncModal(diffs) {
  const tbody = document.getElementById('sync-diff-tbody');
  if (!tbody) return;

  // حفظ الـ diffs في _syncPending لاستخدامها عند التأكيد
  _syncPending.diffs = diffs;

  const sharesChg = d => Math.abs(d.oldShares - d.newShares) > 0.0001;
  const avgChg    = d => Math.abs(d.oldAvg    - d.newAvg)    > 0.001;

  tbody.innerHTML = diffs.map((d, i) => {
    const avgDiffers  = avgChg(d) && d.type === 'update';
    const sharesDiff  = sharesChg(d);

    // خيار المتوسط — يظهر فقط عند تغيير المتوسط في سهم موجود
    const avgChoice = avgDiffers ? `
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
        <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;color:var(--text-muted)">
          <input type="radio" name="avg-choice-${i}" value="tx" checked
                 style="accent-color:var(--accent)">
          <span>اعتمد المعاملات <span class="num text-accent">${formatSAR(d.newAvg)}</span></span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;color:var(--text-muted)">
          <input type="radio" name="avg-choice-${i}" value="keep"
                 style="accent-color:var(--success)">
          <span>احتفظ بالمتوسط اليدوي <span class="num text-success">${formatSAR(d.oldAvg)}</span></span>
        </label>
      </div>` : '';

    return `<tr data-diff-index="${i}">
      <td><strong class="text-accent">${esc(d.ticker)}</strong></td>
      <td class="num">${d.oldShares > 0 ? d.oldShares : '—'}</td>
      <td class="num ${sharesDiff ? 'text-accent bold' : ''}">${d.newShares > 0 ? d.newShares : '—'}</td>
      <td class="num">${d.oldAvg > 0 ? formatSAR(d.oldAvg) : '—'}</td>
      <td class="num ${avgDiffers ? 'text-accent bold' : ''}">${d.newAvg > 0 ? formatSAR(d.newAvg) : '—'}</td>
      <td>
        ${d.type === 'delete' ? '<span class="text-danger">🗑️ حذف</span>'
        : d.type === 'add'    ? '<span class="text-success">➕ إضافة</span>'
        : avgDiffers          ? avgChoice
        : '<span class="text-accent small">أسهم فقط</span>'}
      </td>
    </tr>`;
  }).join('');

  document.getElementById('sync-confirm-modal').style.display = 'flex';
}

function closeSyncModal(e) {
  if (e && e.target !== document.getElementById('sync-confirm-modal')) return;
  document.getElementById('sync-confirm-modal').style.display = 'none';
  _syncPending = null;
}

async function confirmSync() {
  if (!_syncPending) return;
  const { map, existMap, sectorMap, userId, diffs } = _syncPending;

  // اقرأ خيار المتوسط لكل صف من الـ radio buttons قبل إخفاء الـ modal
  // مفتاح: ticker → 'tx' | 'keep'
  const avgChoices = {};
  (diffs || []).forEach((d, i) => {
    if (d.type === 'update') {
      const checked = document.querySelector(`input[name="avg-choice-${i}"]:checked`);
      avgChoices[d.ticker] = checked ? checked.value : 'tx';
    }
  });

  _syncPending = null;
  document.getElementById('sync-confirm-modal').style.display = 'none';

  const btn = document.getElementById('sync-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ التطبيق…'; }

  let upserted = 0;
  for (const [ticker, calc] of Object.entries(map)) {
    if (calc.shares <= 0) {
      if (existMap[ticker]) await supabaseClient.from('holdings').delete().eq('id', existMap[ticker].id);
      continue;
    }
    const txAvg  = +(calc.avgPrice || 0).toFixed(4);
    const existing = existMap[ticker];

    if (existing) {
      // هل المستخدم اختار الاحتفاظ بالمتوسط اليدوي؟
      const keepManualAvg = avgChoices[ticker] === 'keep';
      const avgPrice = keepManualAvg ? +existing.avg_price : txAvg;

      const updatePayload = { shares: +calc.shares.toFixed(4), avg_price: avgPrice };
      if (!existing.sector && sectorMap[ticker]) updatePayload.sector = sectorMap[ticker];
      await supabaseClient.from('holdings').update(updatePayload).eq('id', existing.id);
    } else {
      await supabaseClient.from('holdings').insert([{
        user_id: userId, ticker, name: calc.name,
        sector: sectorMap[ticker] || '',
        shares: +calc.shares.toFixed(4), avg_price: txAvg,
        current_price: 0, target_weight: 0
      }]);
    }
    upserted++;
  }

  if (btn) { btn.disabled = false; btn.textContent = 'تأكيد المزامنة'; }

  // ملخص يوضح كم سهماً احتُفظ بمتوسطه اليدوي
  const keptCount = Object.values(avgChoices).filter(v => v === 'keep').length;
  const keptNote  = keptCount > 0 ? ` (محتفظ بـ ${keptCount} متوسط يدوي)` : '';
  showToast(`✓ تمت المزامنة — ${upserted} سهم${keptNote}`, 'success');
  await reloadHoldings();
  renderStats(); renderRebalancingAlerts(); renderPortfolioHealthCard(); renderDiversificationCard(); renderCharts(); renderTable();
}

// ── Info Modal ────────────────────────────────────────────────
function closeInfoModal(e) {
  if (e && e.target !== document.getElementById('info-modal')) return;
  document.getElementById('info-modal').style.display = 'none';
}

function showCardInfo(key) {
  const s          = window._ds || {};
  const totalValue = holdings.reduce((a, h) => a + +h.shares * +h.current_price, 0);
  const costBasis  = holdings.reduce((a, h) => a + +h.shares * +h.avg_price, 0);
  const pnl        = totalValue - costBasis;
  const pnlPct     = costBasis > 0 ? pnl / costBasis * 100 : 0;
  const cashNet    = (s.cashDeposited || 0) - (s.cashWithdrawn || 0);

  const cards = {
    'total-value': {
      title: '📦 إجمالي قيمة المحفظة',
      body: `
        <p>هذا الرقم يجمع قيمة الأسهم والنقد الموجود عند الوسيط:</p>
        <div class="info-formula">
          <strong>قيمة الأسهم + نقد المحفظة</strong>
        </div>
        <div class="info-math">
          قيمة الأسهم = مجموع (أسهم × سعر حالي) لـ ${holdings.length} سهم<br>
          = ${formatSAR(totalValue)}<br>
          + نقد المحفظة = ${formatSAR(portfolioCash)}<br>
          = <strong class="text-accent">${formatSAR(totalValue + portfolioCash)}</strong>
        </div>
        <p class="info-note">⚠️ كلا الرقمين يُحدَّثان يدوياً — تأكد من مزامنتهما مع الوسيط بانتظام.</p>`
    },
    'portfolio-cash': {
      title: '💵 نقد المحفظة',
      body: `
        <p>القوة الشرائية النقدية الجاهزة داخل حساب الوسيط — تُدخلها يدوياً من كشف حسابك.</p>
        <div class="info-formula">
          <strong>انقر على الرقم لتحديثه</strong>
        </div>
        <div class="info-math">
          النقد الحالي المسجّل = <strong class="text-accent">${formatSAR(portfolioCash)}</strong><br>
          ${cashUpdatedAt ? 'آخر تحديث: ' + formatDate(cashUpdatedAt.split('T')[0]) : 'لم يُسجَّل بعد'}
        </div>
        <p class="info-note">💡 يُضاف هذا المبلغ لقيمة الأسهم ليعطيك "الرصيد الفعلي" كما يظهر عند الوسيط.</p>`
    },
    'invested': {
      title: '💼 رأس المال — طريقتان للحساب',
      body: `
        <p><strong>التاب الأول — رأس المال المنشغل (طريقة الموقع):</strong></p>
        <div class="info-formula">إجمالي الشراء − إجمالي البيع</div>
        <div class="info-math">
          = <strong class="text-accent">${formatSAR(s.totalInvested || 0)}</strong>
        </div>
        <p class="small text-muted" style="margin:4px 0 12px">يعكس التدفق النقدي الصافي الفعلي من جيبك — يشمل الخسائر المحققة من صفقات البيع السابقة.</p>

        <p><strong>التاب الثاني — تكلفة المحفظة WAC (طريقة الوسيط):</strong></p>
        <div class="info-formula">مجموع (أسهم × متوسط سعر الشراء) للأسهم الحالية فقط</div>
        <div class="info-math">
          = <strong class="text-accent">${formatSAR(costBasis)}</strong>
        </div>
        <p class="small text-muted" style="margin:4px 0 12px">يعكس تكلفة الأسهم التي تملكها الآن فقط — بدون حساب الخسائر من مراكز أُغلقت سابقاً.</p>

        <p class="info-note">💡 الفرق بين الرقمين = الخسائر/الأرباح المحققة من جميع صفقات البيع السابقة.</p>`
    },
    'pnl': {
      title: '📊 الربح / الخسارة غير المحقق',
      body: `
        <p>"غير محقق" يعني أنك لم تبع بعد — هو ربح أو خسارة على الورق فقط.</p>
        <div class="info-formula">
          <strong>القيمة السوقية الحالية − تكلفة الشراء الأصلية</strong>
        </div>
        <div class="info-math">
          القيمة السوقية = ${formatSAR(totalValue)}<br>
          − تكلفة الأسهم (أسهم × متوسط سعر الشراء) = ${formatSAR(costBasis)}<br>
          = <strong class="${pnl >= 0 ? 'text-success' : 'text-danger'}">${formatSAR(pnl, true)}</strong>
          &nbsp;(${(pnl>=0?'+':'')}${pnlPct.toFixed(2)}%)
        </div>
        <p class="info-note">💡 يتحول لـ "محقق" فقط عند البيع الفعلي.</p>`
    },
    'networth': {
      title: '🏦 صافي الثروة',
      body: `
        <p>هذا الرقم مأخوذ من آخر "لقطة" سجّلتها يدوياً في صفحة <strong>صافي الثروة</strong>.</p>
        <div class="info-math">
          آخر لقطة مسجّلة: <strong>${s.latestNWDate ? formatDate(s.latestNWDate) : 'لا توجد'}</strong><br>
          القيمة: <strong class="text-accent">${s.latestNW != null ? formatSAR(s.latestNW) : '—'}</strong>
        </div>
        <div class="info-formula">صافي الثروة = إجمالي الأصول − إجمالي الالتزامات</div>
        <p class="info-note">⚠️ هذا الرقم لا يتحدث تلقائياً — اذهب لصفحة صافي الثروة وسجّل لقطة جديدة متى أردت.</p>`
    },
    'total-div': {
      title: '💰 إجمالي الأرباح الموزعة',
      body: `
        <p>مجموع كل الأرباح النقدية التي استلمتها منذ بدأت التسجيل، من جميع السنوات.</p>
        <div class="info-formula">
          <strong>مجموع جميع السجلات في جدول الأرباح</strong>
        </div>
        <div class="info-math">
          إجمالي جميع السنوات = <strong class="text-success">${formatSAR(s.totalDivAll || 0)}</strong>
        </div>
        <p class="info-note">💡 يمكنك رؤية تفاصيل كل سنة في صفحة <a href="dividends.html" style="color:var(--accent)">الأرباح الموزعة</a>.</p>`
    },
    'year-div': {
      title: `🗓️ أرباح عام ${s.yr || new Date().getFullYear()}`,
      body: `
        <p>مجموع الأرباح التي استلمتها في عام ${s.yr || new Date().getFullYear()} فقط.</p>
        <div class="info-formula">
          <strong>مجموع الأرباح التي سنتها = ${s.yr || new Date().getFullYear()}</strong>
        </div>
        <div class="info-math">
          أرباح ${s.yr || new Date().getFullYear()} = <strong class="text-accent">${formatSAR(s.yearDiv || 0)}</strong>
        </div>
        <p class="info-note">💡 السنة في سجل الأرباح تُحدَّد يدوياً عند الإدخال — تأكد أن السنة صحيحة في السجلات.</p>`
    },
    'realestate': {
      title: '🏠 قيمة العقارات',
      body: `
        <p>مجموع القيمة الحالية لعقاراتك التي لم تُبَع بعد.</p>
        <div class="info-formula">
          <strong>مجموع (القيمة الحالية) للعقارات ذات حالة "مملوك" أو "مؤجر"</strong>
        </div>
        <div class="info-math">
          إجمالي قيمة العقارات = <strong class="text-accent">${formatSAR(s.reTotal || 0)}</strong>
        </div>
        <p class="info-note">⚠️ العقارات المباعة مستبعدة من هذا الرقم. يمكن تعديل القيم في صفحة <a href="realestate.html" style="color:var(--accent)">العقارات</a>.</p>`
    },
    'cashflow': {
      title: '💸 صافي التدفق النقدي هذا العام',
      body: `
        <p>الفرق بين ما أودعته وما سحبته من المحفظة خلال عام ${s.yr || new Date().getFullYear()}.</p>
        <div class="info-formula">
          <strong>إجمالي الإيداعات − إجمالي السحوبات</strong><br>
          (للسجلات التي تاريخها في ${s.yr || new Date().getFullYear()})
        </div>
        <div class="info-math">
          الإيداعات = ${formatSAR(s.cashDeposited || 0)}<br>
          − السحوبات = ${formatSAR(s.cashWithdrawn || 0)}<br>
          = <strong class="${cashNet >= 0 ? 'text-success' : 'text-danger'}">${formatSAR(cashNet, true)}</strong>
        </div>
        <p class="info-note">💡 السجلات موجودة في صفحة <a href="cashflows.html" style="color:var(--accent)">التدفقات النقدية</a>.</p>`
    },
    'composition': {
      title: '📋 تفاصيل المحفظة',
      body: `
        <p>إحصائيات بسيطة عن تنوع محفظتك الحالية.</p>
        <div class="info-math">
          عدد الأسهم في المحفظة = <strong class="text-accent">${holdings.length} سهم</strong><br>
          عدد القطاعات المختلفة = <strong class="text-accent">${s.sectorCount || 0} قطاع</strong>
        </div>
        <p class="info-note">💡 كلما زاد عدد القطاعات، زاد التنويع وقلّ تركّز المخاطر في قطاع واحد.</p>`
    },
    'top-sector': {
      title: '🏆 أعلى قطاع وزناً',
      body: (() => {
        const t = s.topSector;
        if (!t) return '<p>لا توجد بيانات بعد.</p>';
        const secVal = totalValue * t.pct / 100;
        return `
          <p>القطاع الذي يأخذ أكبر نسبة من إجمالي قيمة محفظتك.</p>
          <div class="info-formula">
            وزن القطاع = <strong>قيمة أسهم القطاع ÷ إجمالي المحفظة × 100</strong>
          </div>
          <div class="info-math">
            القطاع: <strong>${t.sec}</strong><br>
            قيمة أسهمه ≈ ${formatSAR(secVal)}<br>
            ÷ إجمالي المحفظة ${formatSAR(totalValue)}<br>
            = <strong class="text-accent">${t.pct.toFixed(1)}%</strong>
            ${t.target ? `<br>الهدف المحدد: ${t.target.toFixed(1)}% | الفارق: ${(t.pct - t.target >= 0 ? '+' : '')}${(t.pct - t.target).toFixed(1)}%` : ''}
          </div>`;
      })()
    },
    'bot-sector': {
      title: '📉 أقل قطاع وزناً',
      body: (() => {
        const b = s.bottomSector;
        if (!b || s.sectorCount <= 1) return '<p>يحتاج قطاعين أو أكثر للمقارنة.</p>';
        const secVal = totalValue * b.pct / 100;
        return `
          <p>القطاع الذي يحتل أصغر نسبة من إجمالي قيمة محفظتك.</p>
          <div class="info-formula">
            وزن القطاع = <strong>قيمة أسهم القطاع ÷ إجمالي المحفظة × 100</strong>
          </div>
          <div class="info-math">
            القطاع: <strong>${b.sec}</strong><br>
            قيمة أسهمه ≈ ${formatSAR(secVal)}<br>
            ÷ إجمالي المحفظة ${formatSAR(totalValue)}<br>
            = <strong class="text-danger">${b.pct.toFixed(1)}%</strong>
            ${b.target ? `<br>الهدف المحدد: ${b.target.toFixed(1)}% | الفارق: ${(b.pct - b.target >= 0 ? '+' : '')}${(b.pct - b.target).toFixed(1)}%` : ''}
          </div>`;
      })()
    },
    'costs': {
      title: '💸 التكاليف التراكمية',
      body: `
        <p>إجمالي ما دفعته من رسوم للوسيط وضريبة القيمة المضافة على جميع معاملاتك.</p>
        <div class="info-formula">
          <strong>مجموع العمولات + مجموع ضريبة VAT</strong><br>
          من جميع سجلات المعاملات (شراء وبيع)
        </div>
        <div class="info-math">
          إجمالي العمولات = ${formatSAR(s.totalCommission || 0)}<br>
          + إجمالي ضريبة VAT = ${formatSAR(s.totalVAT || 0)}<br>
          = <strong>${formatSAR((s.totalCommission||0) + (s.totalVAT||0))}</strong>
        </div>
        <p class="info-note">💡 هذه التكاليف تُخصم فعلياً من عائدك الإجمالي — كلما قلّت المعاملات، قلّت التكاليف.</p>`
    },
    'capital': {
      title: '📊 رأس المال مقابل القيمة السوقية',
      body: `
        <p>مقارنة بين ما دفعته فعلياً (التكلفة) وما تساوي أسهمك الآن (القيمة السوقية).</p>
        <div class="info-formula">
          <strong>التكلفة</strong> = مجموع (عدد أسهم × متوسط سعر الشراء) لكل سهم<br>
          <strong>القيمة السوقية</strong> = مجموع (عدد أسهم × السعر الحالي) لكل سهم
        </div>
        <div class="info-math">
          التكلفة الأصلية = <strong>${formatSAR(costBasis)}</strong><br>
          القيمة السوقية الآن = <strong class="text-accent">${formatSAR(totalValue)}</strong><br>
          الفرق = <strong class="${pnl >= 0 ? 'text-success' : 'text-danger'}">${(pnl>=0?'+':'')}${formatSAR(pnl, true)} (${(pnl>=0?'+':'')}${pnlPct.toFixed(2)}%)</strong>
        </div>`
    },
    'breakeven': {
      title: '⚖️ تحليل نقطة التعادل — كيف تُحسب؟',
      body: `
        <p>تُجيب هذه الحسبة على سؤال واحد: <strong>"هل أنا رابح أم خاسر بشكل حقيقي شامل كل شيء؟"</strong></p>
        <div class="info-formula">
          <strong>رأس المال المنشغل = إجمالي المشتريات − إجمالي المبيعات</strong><br>
          <em>(ما خرج من جيبك صافياً)</em>
        </div>
        <div class="info-formula">
          <strong>إجمالي العوائد = قيمة المحفظة الحالية + نقد من حصيلة البيع + كل الأرباح الموزعة</strong><br>
          <em>(كل ما يقابلك الآن مقابل ما دفعته — قيمة المنح مشمولة ضمن قيمة المحفظة. النقد يُحتسب فقط بقدر حصيلة البيع، أما الإيداع الجديد غير المستثمر فلا يُعدّ عائداً)</em>
        </div>
        <div class="info-formula">
          <strong>صافي الربح/الخسارة الحقيقي = إجمالي العوائد − رأس المال المنشغل</strong>
        </div>
        <p class="info-note">💡 نقطة التعادل نقطة وليست نسبة: هي عندما تسترجع 100% من رأس مالك (إجمالي العوائد = رأس المال). شريط «استرداد رأس المال» يقيس كم استرجعت — فإن وصل 106% فأنت تجاوزت التعادل بـ +6% ربحاً صافياً، وإن كان 90% فأنت تحته بـ 10%.</p>
        <p class="info-note">📌 قيمة المنح تُحسب بسعر السوق الحالي — لأنها أسهم مجانية تحتسب كعائد.</p>`
    },
    'realized': {
      title: '✅ الربح / الخسارة المحقق من البيع',
      body: `
        <p>هذا الرقم يُحسب من صفقات البيع الفعلية — ما تحقق فعلاً في جيبك.</p>
        <div class="info-formula">
          لكل صفقة بيع:<br>
          <strong>ر/خ = صافي حصيلة البيع − (عدد الأسهم المباعة × متوسط التكلفة وقت البيع)</strong>
        </div>
        <div class="info-math">
          نمشي على معاملاتك بترتيبها التاريخي، ونستخدم متوسط التكلفة المرجّح<br>
          (شامل العمولة والضريبة) <strong>كما كان لحظة كل بيع</strong> — لا متوسطاً نهائياً<br>
          إجمالي ر/خ المحقق = <strong class="${(s.realizedPnL||0) >= 0 ? 'text-success' : 'text-danger'}">${(s.realizedPnL||0) >= 0 ? '+' : ''}${formatSAR(s.realizedPnL||0, true)}</strong>
        </div>
        <p class="info-note">✅ هذه الطريقة الزمنية الدقيقة، ومطابقة لرقم «الربح المحقق» في صفحة سجل المعاملات.</p>`
    },
    'total-return': {
      title: '🧮 إجمالي العائد منذ البداية',
      body: (() => {
        const totalBuys = s.totalBuys || 0;
        const totalProfit = totalBuys > 0
          ? (holdings.reduce((a,h)=>a+ +h.shares*+h.current_price,0) + (s.totalSells||0) + (s.totalDivAll||0) - totalBuys)
          : 0;
        const pct = totalBuys > 0 ? totalProfit / totalBuys * 100 : 0;
        return `
        <p>كل ما ربحته من المحفظة منذ أول صفقة — يجمع الأبعاد الثلاثة في رقم واحد بديهي.</p>
        <div class="info-formula">
          <strong>إجمالي الربح = (ربح ورقي) + (ربح محقق من البيع) + (كل التوزيعات)</strong><br>
          = القيمة السوقية + إجمالي المبيعات + إجمالي التوزيعات − إجمالي المشتريات
        </div>
        <div class="info-math">
          النسبة = إجمالي الربح ÷ إجمالي المشتريات = <strong class="${totalProfit>=0?'text-success':'text-danger'}">${totalProfit>=0?'+':''}${pct.toFixed(1)}%</strong><br>
          (الأسهم المجانية/المنح تظهر كربح صافٍ لأن تكلفتها صفر)
        </div>
        <p class="info-note">📌 هذا عائد <strong>تراكمي بسيط</strong> منذ البداية وليس سنوياً — للعائد السنوي الحقيقي الذي يراعي التوقيت استخدم بطاقة <strong>XIRR</strong>. النسبة على إجمالي المشتريات، فإن أعدت تدوير رأس المال (بيع ثم شراء) يكون الرقم متحفظاً.</p>`;
      })()
    },
    'div-yield': {
      title: '📈 العائد التوزيعي — ثلاث طرق',
      body: `
        <p>ثلاث طرق لحساب العائد، كل منها تعبّر عن زاوية مختلفة:</p>

        <p style="margin:12px 0 4px"><strong>① مُسنوى (السنة الجارية)</strong> — الأدق للسنة غير المكتملة</p>
        ${(s.daysElapsed||0) >= 180 ? `
        <div class="info-formula">أرباح ${s.yr||new Date().getFullYear()} × (${s.daysInYear||365}÷${s.daysElapsed||1}) ÷ التكلفة</div>
        <div class="info-math">
          ${formatSAR(s.yearDiv||0)} × ${((s.daysInYear||365)/(s.daysElapsed||1)).toFixed(2)} = أرباح مُسنواة ${formatSAR(s.annualizedYearDiv||0)}<br>
          ÷ التكلفة ${formatSAR(s.denomAnn||0)}<br>
          = <strong class="text-success">${(s.divYieldAnn||0).toFixed(2)}%</strong>
        </div>` : `
        <div class="info-formula">أرباح آخر 12 شهراً ÷ التكلفة</div>
        <div class="info-math">
          مبكراً في السنة (${s.daysElapsed||0} يوماً) نتجنّب التضخيم بالاستقراء الخطي ونستخدم آخر 12 شهراً:<br>
          ${formatSAR(s.ttmDiv||0)} ÷ ${formatSAR(s.denomAnn||0)}<br>
          = <strong class="text-success">${(s.divYieldAnn||0).toFixed(2)}%</strong>
        </div>`}

        <p style="margin:12px 0 4px"><strong>② على التكلفة YOC</strong> — العائد السنوي على ما دفعته فعلاً</p>
        <div class="info-formula">أرباح آخر 12 شهراً ÷ تكلفة الشراء الأصلية</div>
        <div class="info-math">
          ${formatSAR(s.ttmDiv||0)} ÷ ${formatSAR(costBasis)}<br>
          = <strong class="text-success">${(s.divYieldYOC||0).toFixed(2)}%</strong>
        </div>
        <p class="small text-muted" style="margin:-4px 0 8px">يستخدم أرباح آخر 12 شهراً (وليس التراكمي) ليكون عائداً سنوياً حقيقياً.</p>

        <p style="margin:12px 0 4px"><strong>③ سوقي</strong> — العائد على القيمة السوقية الحالية</p>
        <div class="info-formula">أرباح آخر 12 شهراً ÷ القيمة السوقية الحالية</div>
        <div class="info-math">
          ${formatSAR(s.ttmDiv||0)} ÷ ${formatSAR(totalValue)}<br>
          = <strong class="text-success">${(s.divYieldMarket||0).toFixed(2)}%</strong>
        </div>
        <p class="info-note">💡 اليوم ${s.daysElapsed||'؟'} من ${s.daysInYear||365} — السنة الجارية تُسنوى تلقائياً</p>`
    },
    'xirr': {
      title: '📈 العائد السنوي الحقيقي (XIRR)',
      body: `
        <p>أدق مقياس لأداء محفظتك — يحسب معدل النمو السنوي المركّب مع <strong>مراعاة توقيت كل عملية</strong> (متى أودعت ومتى سحبت).</p>
        <div class="info-formula">
          المعدل r الذي يجعل:<br>
          <strong>Σ (تدفق ÷ (1+r)^سنوات) = 0</strong>
        </div>
        <div class="info-math">
          المشتريات = تدفق خارج (−)<br>
          المبيعات + التوزيعات = تدفق داخل (+)<br>
          القيمة السوقية الحالية = تدفق ختامي (+)<br>
          ⟵ النتيجة = <strong class="${(s.xirr||0) >= 0 ? 'text-success' : 'text-danger'}">${s.xirr != null ? (s.xirr>=0?'+':'')+s.xirr.toFixed(2)+'%' : '—'}</strong> سنوياً
        </div>
        <p class="info-note">💡 يختلف عن "الربح %" لأنه يأخذ الزمن بالحسبان — ربح 20% خلال سنة أفضل من 20% خلال 5 سنوات.</p>`
    },
    'fwd-income': {
      title: '💵 الدخل التوزيعي المتوقع',
      body: `
        <p>تقدير لدخلك السنوي من التوزيعات بناءً على ما استلمته فعلاً في آخر 12 شهراً (TTM).</p>
        <div class="info-formula"><strong>مجموع التوزيعات خلال آخر 365 يوماً</strong></div>
        <div class="info-math">
          الدخل السنوي المتوقع = <strong class="text-success">${formatSAR(s.ttmDiv||0)}</strong><br>
          ≈ ${formatSAR((s.ttmDiv||0)/12)} شهرياً
        </div>
        <p class="info-note">💡 مؤشر تقديري — يفترض استمرار التوزيعات بنفس الوتيرة.</p>`
    },
    'passive-cover': {
      title: '🛡️ تغطية الدخل السلبي للمصاريف',
      body: (() => {
        const goal = getRetirementGoal();
        const mInc = (s.ttmDiv||0)/12;
        return `
        <p>كم نسبة مصاريفك الشهرية التي يغطيها دخل التوزيعات وحده — مؤشر اقترابك من الاستقلال المالي.</p>
        <div class="info-formula"><strong>(دخل التوزيعات الشهري ÷ المصاريف الشهرية) × 100</strong></div>
        <div class="info-math">
          ${goal.monthly > 0
            ? `${formatSAR(mInc)} ÷ ${formatSAR(goal.monthly)} = <strong class="text-accent">${(mInc/goal.monthly*100).toFixed(1)}%</strong>`
            : 'أدخل مصاريفك الشهرية أولاً من بطاقة هدف التقاعد.'}
        </div>
        <p class="info-note">🎯 عند 100% تصبح توزيعاتك تغطي معيشتك بالكامل.</p>`;
      })()
    },
    'total-assets': {
      title: '🏦 إجمالي الأصول الاستثمارية',
      body: (() => {
        const stocks = holdings.reduce((a,h)=>a+ +h.shares*+h.current_price,0);
        const suk = getSukukActiveTotal();
        const tot = stocks + (portfolioCash||0) + (s.reTotal||0) + suk;
        return `
        <p>مجموع كل أصولك الاستثمارية عبر الفئات (لا يطرح الالتزامات — للصافي راجع كرت صافي الثروة).</p>
        <div class="info-math">
          أسهم = ${formatSAR(stocks)}<br>
          + نقد المحفظة = ${formatSAR(portfolioCash||0)}<br>
          + عقارات = ${formatSAR(s.reTotal||0)}<br>
          + صكوك مشترَك بها = ${formatSAR(suk)}<br>
          = <strong class="text-accent">${formatSAR(tot)}</strong>
        </div>
        <p class="info-note">💡 الصكوك تُقرأ من صفحة الصكوك (الفرص بحالة "مشترك").</p>`;
      })()
    },
    'concentration': {
      title: '🎯 تركيز أكبر سهم',
      body: (() => {
        const lh = s.largestHolding;
        return `
        <p>أكبر مركز فردي كنسبة من قيمة أسهمك. التركيز العالي في سهم واحد أخطر مخاطرة على محفظة التقاعد — أي هبوط حاد في سهم واحد يضرب ثروتك بالكامل.</p>
        <div class="info-formula"><strong>(قيمة أكبر سهم ÷ إجمالي قيمة الأسهم) × 100</strong></div>
        <div class="info-math">
          ${lh ? `أكبر مركز: <strong>${esc(lh.ticker)}</strong> = <strong class="text-accent">${(s.largestPosPct||0).toFixed(1)}%</strong><br>أكبر 5 مراكز مجتمعة = <strong>${(s.top5Pct||0).toFixed(1)}%</strong>` : 'لا توجد حيازات.'}
        </div>
        <p class="info-note">⚠️ قاعدة شائعة لطول الأجل: تجنّب تجاوز سهم واحد لـ 20–25% من المحفظة. أخضر &lt;15% · أصفر 15–25% · أحمر &gt;25%.</p>`;
      })()
    },
    'contribution': {
      title: '💰 معدل المساهمة الشهري',
      body: (() => {
        return `
        <p>صافي ما أضفته من جيبك (إيداع − سحب) شهرياً خلال آخر 12 شهراً. هذا هو المحرّك الحقيقي لوصولك لهدف الاستقلال المالي — أقوى من تقلّبات السوق على المدى الطويل.</p>
        <div class="info-formula"><strong>(إجمالي الإيداع − إجمالي السحب) خلال 12 شهراً ÷ 12</strong></div>
        <div class="info-math">
          ${s.hasCf12 ? `صافي 12 شهراً = <strong>${formatSAR(s.netContrib12||0)}</strong><br>÷ 12 = <strong class="text-accent">${formatSAR(s.monthlyContrib||0)}/شهر</strong>` : 'لا توجد تدفقات نقدية مسجّلة — أدخلها من صفحة التدفقات النقدية.'}
        </div>
        <p class="info-note">💡 يُحسب من التدفقات النقدية الفعلية المسجّلة — رقم موثوق لا تقدير.</p>`;
      })()
    },
    'div-growth': {
      title: '📊 نمو الدخل التوزيعي السنوي',
      body: (() => {
        return `
        <p>متوسط معدل النمو السنوي المركّب (CAGR) لإجمالي التوزيعات التي استلمتها فعلياً، محسوباً على السنوات التقويمية المكتملة فقط (نستثني السنة الجارية الجزئية).</p>
        <div class="info-formula"><strong>(دخل آخر سنة ÷ دخل أول سنة) ^ (1 ÷ عدد السنوات) − 1</strong></div>
        <div class="info-math">
          ${s.divCagr != null ? `من ${s.divCagrFirstY} إلى ${s.divCagrLastY} = <strong class="text-accent">${(s.divCagr>=0?'+':'')}${s.divCagr.toFixed(1)}%/سنة</strong>` : 'يحتاج توزيعات في سنتين تقويميتين مكتملتين على الأقل.'}
        </div>
        <p class="info-note">⚠️ يعكس نمو دخلك الكلي (يجمع بين تراكم الأسهم ونمو توزيع الشركة) — مؤشر لمسار دخلك التقاعدي الفعلي، لا لجودة توزيع شركة بعينها.</p>`;
      })()
    },
    'allocation': {
      title: '🍰 التخصيص الكلي للأصول',
      body: `
        <p>توزيع ثروتك الاستثمارية على الفئات الأربع. التنويع بين الفئات يقلل المخاطر أكثر من التنويع داخل فئة واحدة.</p>
        <div class="info-formula"><strong>نسبة كل فئة = قيمتها ÷ إجمالي الأصول × 100</strong></div>
        <p class="info-note">💡 لا توجد نسبة "مثالية" واحدة — تعتمد على عمرك وأهدافك وتحمّلك للمخاطر. القاعدة الشائعة: كلما اقتربت من التقاعد، زدت الأصول الأقل تذبذباً.</p>`
    },
    'diversification': {
      title: '🧩 مقياس التنويع — المنهجية',
      body: (() => {
        const n = holdings.length;
        const totalVal = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
        const hhi = totalVal > 0
          ? holdings.reduce((s, h) => { const w = +h.shares * +h.current_price / totalVal; return s + w * w; }, 0)
          : 0;
        const effN = hhi > 0 ? Math.round(1 / hhi) : 0;
        return `
          <p>المقياس مبني على <strong>مؤشر هيرفيندال-هيرشمان (HHI)</strong> — المعيار الأكاديمي والتنظيمي المعتمد (وزارة العدل الأمريكية DOJ، نظرية الحوافظ الحديثة MPT).</p>
          <div class="info-formula"><strong>HHI = Σ (وزن كل سهم)²</strong></div>
          <div class="info-math">
            HHI أسهمك حالياً = <strong>${(hhi * 100).toFixed(2)}%</strong><br>
            العدد الفعّال = 1 ÷ HHI = <strong>${effN} سهم</strong><br>
            <span class="text-muted small">العدد الفعّال يعكس توزيع الأوزان، لا مجرد العدد — 15 سهماً أكبرها 80% يُعطي عدداً فعّالاً ≈ 1.6</span>
          </div>
          <p><strong>مناطق المقياس — مُعايَرة للمستثمر الفردي (مرجع: Evans & Archer 1968 + DOJ):</strong></p>
          <ul style="font-size:0.82rem;line-height:2;padding-right:16px">
            <li><span style="color:#ef4444">●</span> <strong>مركّز جداً</strong>: HHI > 25% (N_eff < 4) — خطر مرتفع جداً</li>
            <li><span style="color:#f97316">●</span> <strong>تركيز ملحوظ</strong>: HHI 14–25% (N_eff 4–7) — حماية جزئية</li>
            <li><span style="color:#84cc16">●</span> <strong>تنوع معقول</strong>: HHI 10–14% (N_eff 7–10) — مقبول</li>
            <li><span style="color:#22c55e">●</span> <strong>تنوع جيد</strong>: HHI 6.7–10% (N_eff 10–15) — جيد للمحفظة الفردية</li>
            <li><span style="color:#10b981">●</span> <strong>تنوع ممتاز</strong>: HHI < 6.7% (N_eff ≥ 15) — يُزيل ~90% من المخاطر القابلة للتنويع</li>
          </ul>
          <p><strong>دور القطاعات:</strong> تنوع القطاعات يُخفّض الدرجة بنسبة تصل لـ 30% إذا تركّزت الأسهم في قطاع واحد (الدرجة الكاملة عند ~6 قطاعات فعّالة — نطاق واقعي للفرد) — لأن الارتباط داخل القطاع الواحد يُلغي فائدة التعدد.</p>
          <p class="info-note">💡 <strong>تنبيه الإدارة (Diworsification):</strong> يظهر بشكل منفصل عند n > 30 — ليس جزءاً من المقياس لأن المزيد من الأسهم رياضياً لا يزيد المخاطرة، بل يزيد تعقيد المتابعة فقط.</p>`;
      })()
    },
    'retirement': {
      title: '🎯 هدف الاستقلال المالي (FIRE)',
      body: `
        <p>يحسب المبلغ الذي تحتاجه لتعيش من عوائد استثماراتك دون العمل، بناءً على <strong>قاعدة السحب الآمن</strong>.</p>
        <div class="info-formula">
          <strong>رقم الاستقلال المالي = المصاريف السنوية ÷ نسبة السحب الآمنة</strong><br>
          <em>(عند 4% = المصاريف السنوية × 25)</em>
        </div>
        <div class="info-formula">
          <strong>التقدم = صافي الثروة الحالي ÷ رقم الهدف × 100</strong>
        </div>
        <p class="info-note">💡 قاعدة الـ4% (ترينيتي): يمكنك سحب 4% سنوياً من محفظة متنوعة مع احتمال عالٍ ألا تنفد خلال 30 سنة.</p>
        <p class="info-note">⚠️ تقدير تخطيطي مبسّط — التضخم والضرائب وتقلب السوق تؤثر على الواقع.</p>`
    }
  };

  const card = cards[key];
  if (!card) return;
  document.getElementById('info-modal-title').innerHTML = card.title;
  document.getElementById('info-modal-body').innerHTML  = card.body;
  document.getElementById('info-modal').style.display   = 'flex';
}

// ── نقد المحفظة ───────────────────────────────────────────────
const CASH_LS_KEY = () => userLsKey('portfolio_cash_v1');

function _loadCashFromLS() {
  try {
    const raw = localStorage.getItem(CASH_LS_KEY());
    if (!raw) return;
    const obj = JSON.parse(raw);
    portfolioCash = +obj.amount || 0;
    cashUpdatedAt = obj.updated_at || null;
  } catch (_) {}
}

function _saveCashToLS(amount, updatedAt) {
  try { localStorage.setItem(CASH_LS_KEY(), JSON.stringify({ amount, updated_at: updatedAt })); } catch (_) {}
}

function startEditCash() {
  const input = g('cash-edit-input');
  const valEl = g('stat-portfolio-cash');
  if (!input || !valEl) return;
  input.value = portfolioCash || '';
  valEl.style.display  = 'none';
  input.style.display  = 'block';
  input.focus();
  input.select();
}

function cancelEditCash() {
  const input = g('cash-edit-input');
  const valEl = g('stat-portfolio-cash');
  if (input) input.style.display = 'none';
  if (valEl) valEl.style.display = '';
}

async function saveCash() {
  const input = g('cash-edit-input');
  if (!input) return;
  const newVal = +input.value || 0;
  cancelEditCash();
  if (newVal === portfolioCash) return;

  const now = new Date().toISOString();

  // احفظ في localStorage فوراً كضمان
  _saveCashToLS(newVal, now);
  portfolioCash = newVal;
  cashUpdatedAt = now;
  renderStats();
  showToast('تم حفظ النقد ✓', 'success');

  // حاول الحفظ في Supabase بشكل صامت
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    await supabaseClient.from('portfolio_cash').upsert(
      { user_id: user.id, amount: newVal, updated_at: now },
      { onConflict: 'user_id' }
    );
  } catch (_) { /* الـ localStorage يكفي */ }
}

async function deleteHolding(id) {
  if (!await confirmAsync('هل أنت متأكد من حذف هذا السهم؟')) return;
  const { error } = await supabaseClient.from('holdings').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await reloadHoldings();
  renderStats(); renderRebalancingAlerts(); renderPortfolioHealthCard(); renderDiversificationCard(); renderCharts(); renderTable();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportHoldingsCSV() {
  if (!holdings.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  const total = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  exportCSV(`محفظة_أسهم_${todayISO()}.csv`,
    ['الرمز', 'الاسم', 'القطاع', 'الأسهم', 'متوسط السعر', 'السعر الحالي', 'التكلفة', 'القيمة السوقية', 'ر/خ', 'ر/خ %', 'الوزن %', 'مستهدف %'],
    holdings.map(h => {
      const cost  = +h.shares * +h.avg_price;
      const value = +h.shares * +h.current_price;
      const pnl   = value - cost;
      const pnlP  = cost > 0 ? (pnl / cost * 100).toFixed(2) : '—';
      const wt    = total > 0 ? (value / total * 100).toFixed(2) : '—';
      return [h.ticker, h.name, h.sector || '', h.shares, h.avg_price, h.current_price,
              cost.toFixed(2), value.toFixed(2), pnl.toFixed(2), pnlP, wt, h.target_weight || 0];
    })
  );
  showToast(`✓ تم تصدير ${holdings.length} سهم`, 'success');
}

init();
