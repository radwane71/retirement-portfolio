/* =====================================================================
   forecast.js — الرؤية المستقبلية
   محرك إسقاط شهري دقيق — 4 سيناريوهات — أداء تاريخي فعلي
   ===================================================================== */
'use strict';

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'scenarios': {
    title: '🔮 السيناريوهات الأربعة',
    body: `
      <p>بدل توقّع رقم واحد للمستقبل (وهمٌ مستحيل)، نعرض أربعة مسارات للنمو مُعايَرة بأداء تاسي الفعلي 2005-2024 (نمو سعري CAGR ~1.95% للفترة كاملة بأزماتها، ~4.4% للفترة الحديثة 2010-2024، + توزيعات ~3.5%).</p>
      <div class="info-math">
        • <strong>متحفّظ:</strong> الطرف المنخفض للسوق ~2.4% سعري (ارتداد للمتوسط — كامل دورة تاسي).<br>
        • <strong>أساسي:</strong> نموك التاريخي ممزوجاً بمعيار تاسي حسب ثقة البيانات.<br>
        • <strong>متفائل:</strong> عقد جيّد كالذي شهده تاسي فعلاً (الربع الأعلى الواقعي).
      </div>
      <p class="info-note">⚠️ الأربعة كلها تفترض نمواً موجباً — لكن <strong>30% من سنوات تاسي العشرين الماضية كانت خسارة</strong> (حتى −57% عام 2008، و−52% عام 2006). لا «المتحفظ» ولا غيره يحاكي سنة هابطة أو تتابع عوائد سيئ. استخدمها للتخطيط الاتجاهي لا كأرضية حماية.</p>`
  },
  'forecast-inputs': {
    title: '⚙️ معطيات الإسقاط',
    body: `
      <p>تتحكم بمدخلات المحاكاة: القيمة الحالية، دفعة مقطوعة، إضافة شهرية (DCA)، الأفق الزمني، إعادة استثمار التوزيعات، وتعديل التضخم.</p>
      <div class="info-formula">المحاكاة شهرية: نمو + توزيعات (تُعاد استثمارها اختيارياً) + إضافتك الشهرية، مركّبة على طول الأفق</div>
      <p class="info-note">💡 فعّل «تعديل التضخم» لترى <strong>القوة الشرائية الحقيقية</strong> — مليون بعد 20 سنة لا يساوي مليون اليوم. وإعادة استثمار التوزيعات هي أقوى محرّك للتركيب طويل المدى.</p>`
  },
  'forecast-goal': {
    title: '🎯 متى تصل لهدفك؟',
    body: `
      <p>حدّد هدفاً (قيمة محفظة أو دخل شهري) فيُخبرك في أي سنة يصله كل سيناريو — أو يربطه تلقائياً برقم تقاعدك (FIRE) من لوحة التحكم.</p>
      <div class="info-formula">رقم التقاعد (FIRE) = الإنفاق الشهري × 12 ÷ نسبة السحب الآمن (عادة 4%)</div>
      <p class="info-note">💡 قاعدة الـ4%: محفظة تكفي لسحب 4% سنوياً قد تدوم مدى الحياة. هدف دخل 10,000 ر.س/شهر ⇒ تحتاج محفظة ≈ 3 مليون ر.س.</p>`
  },
  'plan': {
    title: '🎯 خطة الضخ للوصول للهدف',
    body: `
      <p>وضع عكسي للإسقاط: تُثبّت الهدف والأفق والقيمة الحالية، فنحلّ رياضياً <strong>قيمة الضخ الشهري الثابت</strong> التي توصلك للهدف تماماً في نهاية الأفق.</p>
      <div class="info-math">
        القيمة النهائية دالة خطية في الضخ الشهري: <code>النهائية = أ + الضخ × ب</code><br>
        • <strong>أ</strong> = القيمة النهائية بضخ صفر (نمو أصولك الحالية وحدها).<br>
        • <strong>ب</strong> = القيمة النهائية لضخ ريال واحد شهرياً (عامل القيمة المستقبلية للدفعات).<br>
        ⇒ <strong>الضخ المطلوب = (الهدف − أ) ÷ ب</strong>
      </div>
      <p class="info-note">💡 عند تفعيل التضخم يُرفع الهدف لقوّته الاسمية المستقبلية حتى تبقى قوّته الشرائية = رقم اليوم. لو أصولك الحالية تكفي وحدها، يظهر «لا حاجة لضخ». الخطة تبقى محفوظة كسجل دائم حتى تحذفها بنفسك (بتأكيد).</p>`
  },
  'montecarlo': {
    title: '🎲 محاكاة مونتي كارلو — بالبساطة',
    body: `
      <p>تخيّل إنك تقدر تعيش مستقبلك المالي <strong>2000 مرة</strong>، كل مرة السوق يتصرّف بشكل مختلف — سنة يطلع وسنة ينزل. هذي الأداة تسوّي بالضبط كذا: تجرّب خطّتك 2000 مرة، كل مرة بعوائد سنوية حقيقية سحبناها عشوائياً من تاريخ سوق تاسي (2004–2024، فيه سنوات ذهبية وسنوات انهيار).</p>
      <div class="info-math">
        • <strong>نسبة النجاح:</strong> من كل 100 مستقبل جرّبناه، كم واحد وصل لهدفك؟<br>
        • <strong>«لو حظّك سيّئ»:</strong> نتيجة تقع في أسوأ 10 من كل 100 محاولة.<br>
        • <strong>«الأكثر توقّعاً»:</strong> النتيجة اللي في المنتصف تماماً.<br>
        • <strong>«لو حظّك ممتاز»:</strong> نتيجة تقع في أفضل 10 من كل 100.
      </div>
      <p class="info-note">💡 <strong>ليش الأداة مهمة؟</strong> السيناريوهات العادية تفترض أن السوق يعطيك نفس العائد كل سنة — وهذا وهم. الواقع متقلّب، وانهيار السوق <strong>قرب تقاعدك</strong> أخطر من انهيار وأنت شاب. عشان كذا خطّط على «لو حظّك سيّئ» لتكون آمن، لا على المنتصف.</p>`
  },
};

// ── State ─────────────────────────────────────────────────────────────
let _hist            = null;
let _scenarios       = [];
let _projections     = [];
let _forecastChart   = null;
let _activeScenarios = ['conservative','base','optimistic'];
let _activeHighlight = 'base';
let _goalType        = 'portfolio_value';   // 'portfolio_value' | 'monthly_income'
let _chartMode       = 'line';              // 'line' | 'log' | 'bar' | 'cards'
let _dcaPeriodCount  = 0;

// ── DCA Period Management ─────────────────────────────────────────────
function addDcaPeriod(amount = 0, years = 5) {
  const container = document.getElementById('dca-periods-container');
  if (!container) return;
  const id = ++_dcaPeriodCount;
  const row = document.createElement('div');
  row.className = 'dca-period-row';
  row.id = `dca-row-${id}`;
  row.innerHTML = `
    <span class="dca-label">فترة ${id}</span>
    <input type="number" class="dca-amount" placeholder="المبلغ / شهر — 8000 مثلاً" value="${amount || ''}" min="0" step="100" oninput="debouncedDcaInput()">
    <span class="dca-label" style="min-width:auto">لمدة</span>
    <input type="number" class="dca-years" placeholder="سنوات" value="${years || ''}" min="0.5" step="0.5" style="max-width:80px" oninput="debouncedDcaInput()">
    <span class="dca-label" style="min-width:auto">سنة</span>
    <button type="button" class="dca-rm-btn" onclick="removeDcaPeriod(${id})">×</button>`;
  container.appendChild(row);
  updateDcaBar();
}

function removeDcaPeriod(id) {
  const row = document.getElementById(`dca-row-${id}`);
  if (row) row.remove();
  updateDcaBar();
  runForecast();
}

function getDcaPeriods() {
  const rows = document.querySelectorAll('.dca-period-row');
  const periods = [];
  rows.forEach(row => {
    const amount = parseFloat(row.querySelector('.dca-amount').value) || 0;
    const years  = parseFloat(row.querySelector('.dca-years').value)  || 0;
    if (years > 0) periods.push({ amount, years });
  });
  return periods;
}

function buildDcaSchedule(periods, totalMonths) {
  const schedule = new Array(totalMonths).fill(0);
  let cursor = 0;
  for (const p of periods) {
    const end = Math.min(cursor + Math.round(p.years * 12), totalMonths);
    for (let m = cursor; m < end; m++) schedule[m] = p.amount;
    cursor = end;
    if (cursor >= totalMonths) break;
  }
  return schedule;
}

function updateDcaBar() {
  const el = document.getElementById('dca-total-bar');
  if (!el) return;
  const periods = getDcaPeriods();
  const totalYears = periods.reduce((s, p) => s + p.years, 0);
  const totalAdded = periods.reduce((s, p) => s + p.amount * p.years * 12, 0);
  if (periods.length === 0) {
    el.innerHTML = 'إجمالي سنوات DCA: <strong>لا توجد فترات</strong>';
  } else {
    const summary = periods.map((p, i) =>
      `فترة ${i+1}: ${Number(p.amount).toLocaleString('ar-SA')} ر.س × ${p.years} سنة`
    ).join(' ← ');
    el.innerHTML = `${summary} — إجمالي: <strong>${totalYears} سنة · ${Number(Math.round(totalAdded)).toLocaleString('ar-SA')} ر.س مُضاف</strong>`;
  }
}

// المعالم تُبنى ديناميكياً كل سنة في renderMilestoneTable

// ── قراءة معدل التضخم من الحقل (آمنة: 0% الصريح يبقى 0 ولا ينقلب 2.5%) ──
function readInflationRate() {
  const v = parseFloat(document.getElementById('inp-inflation-rate')?.value);
  return Number.isFinite(v) ? v / 100 : 0.025;
}

// ── debounce لحقول الإدخال الحية (هدم/بناء الرسم عند كل حرف مكلف) ──
let _forecastDebounceTimer = null;
function debouncedRunForecast() {
  clearTimeout(_forecastDebounceTimer);
  _forecastDebounceTimer = setTimeout(runForecast, 200);
}
let _dcaDebounceTimer = null;
function debouncedDcaInput() {
  clearTimeout(_dcaDebounceTimer);
  _dcaDebounceTimer = setTimeout(() => { updateDcaBar(); runForecast(); }, 200);
}

// ══════════════════════════════════════════════════════════════════════
// درجة ثقة البيانات — الدالة الموحّدة الوحيدة (تُستدعى من loadHistoricalData
// ومن renderDataConfidenceBanner معاً حتى يتطابق رقم البانر مع رقم المزج)
// تُطبّق سقف دورات الأرباح: min(السنوات الخام, ceil(العمر التقويمي/12))
// ══════════════════════════════════════════════════════════════════════
function computeDataConfidence(cwMonths, calMonths, rawDivYears, holdingsCount) {
  const maxCycles = Math.max(1, Math.ceil(calMonths / 12));
  const divYears  = Math.min(rawDivYears, maxCycles);
  const months    = cwMonths;

  // العامل 1: عمر رأس المال الفعلي — لا التقويمي (وزن 45%)
  const agePct = months < 3  ? 0.05 : months < 6  ? 0.20 :
                 months < 9  ? 0.32 : months < 12 ? 0.45 :
                 months < 18 ? 0.62 : months < 24 ? 0.76 :
                 months < 36 ? 0.88 : 1.00;

  // العامل 2: دورات الأرباح الفعلية المسقّفة بعمر المحفظة (وزن 35%)
  const divPct = divYears === 0 ? 0.05 :
                 divYears === 1 ? 0.45 :
                 divYears === 2 ? 0.72 : 0.95;

  // العامل 3: عدد الأسهم / التنويع (وزن 20%)
  const holdPct = holdingsCount < 3  ? 0.40 :
                  holdingsCount < 6  ? 0.65 :
                  holdingsCount < 10 ? 0.82 : 0.95;

  const score = Math.round(agePct * 45 + divPct * 35 + holdPct * 20);
  return { score, agePct, divPct, holdPct, divYears };
}

// ── معيار تاسي طويل المدى (نمو سعري فقط) ──────────────────────────────
// مشتق من أداء مؤشر تاسي الفعلي 2005-2024 (المصدر: Saudi Exchange / Wikipedia):
//   • CAGR سعري للفترة كاملة ≈ 1.95% (تشمل انهياري 2006 −52% و2008 −57%)
//   • CAGR سعري 2010-2024 (تاسي الحديثة) ≈ 4.4%  ← نعتمده كمعيار السوق
//   • توزيعات تاسي ~3.5% سنوياً
const MARKET_CAP_BENCHMARK = 0.044;

// prob     = وزن تخطيطي للنموذج (مجموعه 100%) — ليس محاكاة مونت-كارلو
// tasiProb = النسبة الفعلية لسنوات تاسي التي وقع نموّها السعري ضمن نطاق السيناريو
//            من أصل 20 سنة (2005-2024). المجموع 70% فقط لأن:
//            ⚠️ 30% من سنوات تاسي (6 من 20) كانت خسارة سعرية —
//               2006(−52%)، 2008(−57%)، 2011، 2014، 2015(−17%)، 2022(−7%) —
//               ولا يُغطّيها أي سيناريو هنا (كلها تفترض نمواً موجباً).
const SCENARIO_META = [
  { key:'conservative', name:'متحفظ',    emoji:'🛡️', cls:'sc-conservative', color:'#8b949e', prob:30, tasiProb:15,
    tasiYears:'2017 ، 2020 ، 2024',
    desc:'الطرف المنخفض للسوق (ارتداد للمتوسط): نمو سعري ~2.4% — يماثل سنوات تاسي الباهتة، وليس سيناريو خسارة' },
  { key:'base',         name:'معتدل',    emoji:'📊', cls:'sc-base',         color:'#3fb950', prob:35, tasiProb:15,
    tasiYears:'2012 ، 2016 ، 2019',
    desc:'أداؤك التاريخي ممزوجاً بمعيار تاسي الحديث (~4.4% سعري + توزيعاتك) حسب ثقة بياناتك' },
  { key:'optimistic',   name:'متفائل',   emoji:'🚀', cls:'sc-optimistic',   color:'#f0b429', prob:25, tasiProb:15,
    tasiYears:'2010 ، 2018 ، 2023',
    desc:'عقد جيّد كالذي شهده تاسي فعلاً: نمو سعري ~7% — الربع الأعلى الواقعي طويل المدى' },
];

// ══════════════════════════════════════════════════════════════════════
// 📊 احتمال حدوث كل سيناريو وفق أداء تاسي الفعلي (2005-2024)
// لا نستخدم عوائد السنة الواحدة (تتأرجح −57% ↔ +104%) بل عوائد الفترات الطويلة
// المتداخلة (10/15/20 سنة) لأنها الأنسب لإسقاط تقاعدي طويل المدى.
// المصدر: آخر إغلاق أسبوعي ضمن كل سنة من بيانات تاسي التاريخية (Investing.com)
// — تم التحقق منها مقابل ملف الأسعار الأسبوعية الكامل 2000-2026.
// ══════════════════════════════════════════════════════════════════════
const TASI_PRICE_YE = [
  8206.23, 16749.95, 7933.29, 10721.61, 4802.99, 6121.76, 6620.75, 6418.13,
  6940.31, 8618.12, 8409.54, 6911.76, 7240.66, 7224.29, 7790.86, 8358.85,
  8760.08, 11199.84, 10485.29, 11928.89, 12102.55,
]; // 2004 … 2024 (آخر إغلاق أسبوعي ضمن كل سنة)

// ذروة فقاعة 2005-2006 تُستبعَد كنقطة دخول: مستوى نهاية 2005 (16,712) مضخّم
// اصطناعياً بمضاربة استثنائية انهارت −52% في 2006، فالنوافذ التي تبدأ منه تُشوّه
// الإحصاء ظلماً. نُبقي 2004 (مستواه عند القيمة العادلة) وكل ما بعد 2006 — بما فيه
// انهيار 2008 وكل الدورات الطبيعية.
const TASI_BUBBLE_PEAK_YEARS = [2005];

let _tasiCAGRcache = null;
// كل عوائد النمو السعري السنوية المركّبة على نوافذ 10 و15 و20 سنة متداخلة
function tasiLongRunCAGRs() {
  if (_tasiCAGRcache) return _tasiCAGRcache;
  const out = [];
  for (const L of [10, 15, 20]) {
    for (let i = 0; i + L < TASI_PRICE_YE.length; i++) {
      const startYear = 2004 + i;
      if (TASI_BUBBLE_PEAK_YEARS.includes(startYear)) continue;   // تخطّي دخول الفقاعة
      out.push(Math.pow(TASI_PRICE_YE[i + L] / TASI_PRICE_YE[i], 1 / L) - 1);
    }
  }
  return (_tasiCAGRcache = out);
}

// لكل سيناريو: نسبة نوافذ تاسي الطويلة التي وقع نموّها السعري في «جوار» معدّله
// (طريقة النطاقات: حدود عند منتصف المسافة بين معدّلات السيناريوهات المتجاورة).
// نُرجع أيضاً نسبة النوافذ «الأسوأ من المتحفظ» التي لا يغطّيها أي كرت.
function scenarioOccurrenceProbs() {
  const caps  = _scenarios.map(s => s.capRate);            // [cons, base, opt, ...]
  const cagrs = tasiLongRunCAGRs();
  const N     = cagrs.length || 1;
  const K     = caps.length;
  const lowerCons = caps[0] - (caps[1] - caps[0]) / 2;     // الحدّ الأدنى للمتحفظ
  // حدود النطاقات = منتصف المسافة بين معدّلات السيناريوهات المتجاورة (عام لأي عدد)
  const bounds = [];
  for (let k = 0; k < K - 1; k++) bounds.push((caps[k] + caps[k + 1]) / 2);
  const cnt = new Array(K).fill(0);
  let below = 0;
  for (const c of cagrs) {
    if (c < lowerCons) { below++; continue; }
    let idx = K - 1;
    for (let k = 0; k < bounds.length; k++) { if (c < bounds[k]) { idx = k; break; } }
    cnt[idx]++;
  }
  return {
    probs:   cnt.map(x => Math.round(x / N * 100)),
    below:   Math.round(below / N * 100),
    windows: N,
  };
}

// ── Init ──────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-forecast');
  try {
    _hist = await loadHistoricalData();
    renderHistSummary();
    buildScenarios();
    renderScenarioCards();
    runForecast();
    await loadForecastPlans();
    renderForecastPlans();
  } catch (e) {
    console.error('forecast init error:', e);
    showToast('خطأ في تحميل بيانات المحفظة', 'error');
  }
}

// ── Load historical data ───────────────────────────────────────────────
async function loadHistoricalData() {
  // M-15: explicit high limit — Supabase default is 1000 rows which silently truncates
  //        large portfolios and corrupts XIRR / CWA / cap-growth calculations
  // هذه الصفحة تختص بمحفظة التقاعد الاستثمارية فقط (أسهم + ما تنتجه من توزيعات).
  // لا نجلب العقارات ولا صافي الثروة — مسار صافي الثروة عبر الزمن موجود في صفحته المستقلة.
  const [rTx, rDiv, rH, rCf] = await Promise.all([
    supabaseClient.from('transactions').select('type,total,shares,price,date,ticker').eq('is_archived',false).limit(100000),
    supabaseClient.from('dividends').select('amount,year,date').eq('is_archived',false).order('year').limit(100000),
    supabaseClient.from('holdings').select('shares,current_price,avg_price,ticker'),
    supabaseClient.from('cashflow_entries').select('type,amount,date').eq('is_archived',false),
  ]);

  const txRows  = rTx.data  || [];
  const divRows = rDiv.data || [];
  const hRows   = rH.data   || [];
  const cfRows  = rCf.data  || [];

  // القيمة السوقية والتكلفة الحالية
  const currentValue = hRows.reduce((s,h) => s + +h.shares * +h.current_price, 0);
  const costBasis    = hRows.reduce((s,h) => s + +h.shares * +h.avg_price, 0);

  // مدة النشاط
  const buyDates    = txRows.filter(t => t.type==='buy' && t.date).map(t => t.date).sort();
  const firstDate   = buyDates[0] ? parseDateLocal(buyDates[0]) : null; // M-13
  const today       = new Date();
  const yearsActive = firstDate
    ? Math.max(0.5, (today - firstDate) / (365.25 * 86400000))
    : 1;

  // رأس المال الصافي
  const totalBuys  = txRows.filter(t => t.type==='buy').reduce((s,t)  => s + +t.total, 0);
  const totalSells = txRows.filter(t => t.type==='sell').reduce((s,t) => s + +t.total, 0);
  const netCapital = Math.max(1, totalBuys - totalSells);

  // ── معدل النمو السنوي: XIRR الحقيقي (أدق من CAGR) ──────────
  // XIRR يأخذ توقيت كل معاملة في الحسبان — لا يُضلَّل بإيداعات متأخرة
  // M-13: use parseDateLocal to avoid UTC-midnight off-by-one on all date strings
  const xirrFlows = [];
  txRows.forEach(t => {
    if (t.type === 'buy')  xirrFlows.push({ date: parseDateLocal(t.date), amount: -(+t.total) });
    if (t.type === 'sell') xirrFlows.push({ date: parseDateLocal(t.date), amount: +(+t.total) });
  });
  divRows.forEach(d => {
    // توزيعة بلا تاريخ: نفترض 1 يونيو من سنتها، مسقوفاً باليوم — لا تدفق مستقبلياً في XIRR
    const assumed = new Date(+d.year, 5, 1); // June local
    const dDate = d.date ? parseDateLocal(d.date) : (assumed > today ? today : assumed);
    xirrFlows.push({ date: dDate, amount: +d.amount });
  });
  if (currentValue > 0) xirrFlows.push({ date: new Date(), amount: currentValue });

  const xirrResult = computeXIRR(xirrFlows);   // من utils.js

  // عائد الأرباح السنوي: نستخدم آخر 12 شهراً فعلية (TTM) ÷ القيمة السوقية الحالية
  // TTM أدق من «متوسط آخر سنتين تقويميتين» لأن السنة التقويمية الحالية غالباً
  // ناقصة (نصف سنة مثلاً) فتُخفّض المتوسط زوراً وتُقلّل الدخل المتوقع.
  // ملاحظة: يجب حساب safeDivYield قبل annCapGrowth لأنه يُستخدم في تفكيك XIRR
  const totalDivAll  = divRows.reduce((s,d) => s + +d.amount, 0);
  const divYears     = [...new Set(divRows.map(d => d.year))].length || 1;

  const divByYearTemp = {};
  divRows.forEach(d => { divByYearTemp[d.year] = (divByYearTemp[d.year] || 0) + +d.amount; });
  const sortedDivYears = Object.keys(divByYearTemp).map(Number).sort((a,b) => b - a);

  // ── معدّل الأرباح السنوي عبر آخر 12 شهراً متجدّدة (TTM) ──────────
  // نجمع كل توزيع تاريخه ضمن آخر 365 يوماً. للسجلات بلا تاريخ نرجع لتقدير
  // السنة (1 يونيو) كما في XIRR للاتساق.
  const ttmCutoff = new Date(today.getTime() - 365 * 86400000);
  const ttmDivTotal = divRows.reduce((s, d) => {
    const assumed = new Date(+d.year, 5, 1);
    const dDate = d.date ? parseDateLocal(d.date) : (assumed > today ? today : assumed);
    return (dDate && dDate >= ttmCutoff && dDate <= today) ? s + +d.amount : s;
  }, 0);

  // إن لم تتوفر أي أرباح في آخر 12 شهراً (محفظة جديدة/توزيع سنوي لم يَحِن)،
  // نرجع لمتوسط آخر سنتين تقويميتين كاحتياطي، ثم للمتوسط الكلي.
  let avgRecentDiv;
  if (ttmDivTotal > 0) {
    avgRecentDiv = ttmDivTotal;
  } else {
    const recentDivAmounts = sortedDivYears.slice(0, 2).map(y => divByYearTemp[y]);
    avgRecentDiv = recentDivAmounts.length
      ? recentDivAmounts.reduce((s,v) => s + v, 0) / recentDivAmounts.length
      : totalDivAll / Math.max(divYears, yearsActive);
  }

  // القيمة السوقية الحالية هي الأساس الصحيح (مو التكلفة التاريخية)
  const avgAnnualDiv = avgRecentDiv;
  const annDivYield  = currentValue > 0 ? avgRecentDiv / currentValue : 0.035;
  const safeDivYield = Math.min(0.15, Math.max(0, annDivYield));

  // annCapGrowth: XIRR إن توفّر، وإلا CAGR احتياطياً
  // L-5: use costBasis (WAC × current shares) not netCapital — costBasis better
  // represents actual deployed capital when proceeds are reinvested
  const rawCapGrowth = (costBasis > 0 && currentValue > 0)
    ? Math.pow(currentValue / costBasis, 1 / yearsActive) - 1
    : 0.07;
  const xirrRate = xirrResult != null ? xirrResult / 100 : null;
  // H-8: floor lowered from 2% → -5% so truly negative portfolios are not masked.
  // The cap of 40% prevents unrealistic runaway projections.
  const annCapGrowth = Math.min(0.40, Math.max(-0.05,
    xirrRate != null
      ? xirrRate - safeDivYield   // نمو السعر فقط = XIRR − عائد الأرباح
      : rawCapGrowth
  ));

  // متوسط الإضافة الشهرية التاريخية — مقسوماً على العمر من أول *إيداع* لا أول شراء
  // (أول شراء قد يسبق أول إيداع مسجَّل فيُخفَّض المتوسط زوراً)
  const depositRows       = cfRows.filter(e => e.type==='deposit');
  const totalDeposited    = depositRows.reduce((s,e) => s + +e.amount, 0);
  const firstDepositStr   = depositRows.filter(e => e.date).map(e => e.date).sort()[0] || null;
  const depositYears      = firstDepositStr
    ? Math.max(0.5, (today - parseDateLocal(firstDepositStr)) / (365.25 * 86400000))
    : yearsActive;
  const avgMonthlyDeposit = depositYears > 0 ? totalDeposited / (depositYears * 12) : 0;

  // ══════════════════════════════════════════════════════════════════════
  // عمر رأس المال المرجَّح بالتدفقات (Capital-Weighted Age)
  // الفكرة: كل ريال يُحسب بعدد الأشهر التي قضاها فعلاً في المحفظة
  // الصيغة: Σ(مبلغ_الإيداع × الأشهر_منذ_الإيداع) ÷ إجمالي_رأس_المال_الحالي
  // لو بدأت بـ10K ثم حطيت 170K بعد 4 شهور:
  //   (10K×8 + 170K×4) / 180K = (80K + 680K) / 180K = 4.2 شهر فعلي (لا 8)
  // ══════════════════════════════════════════════════════════════════════
  const capitalWeightedMonths = (() => {
    const sorted = [...cfRows].filter(e => e.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    let runningBalance = 0;
    let weightedSum    = 0;

    sorted.forEach(cf => {
      const monthsAgo = (today - parseDateLocal(cf.date)) / (30.44 * 86400000);
      const amt       = +cf.amount || 0;

      if (cf.type === 'deposit') {
        // هذا المبلغ قضى monthsAgo شهراً في المحفظة
        weightedSum    += amt * monthsAgo;
        runningBalance += amt;
      } else if (cf.type === 'withdrawal') {
        // السحب يقلص رأس المال ويُقلص الوزن التراكمي بنفس النسبة
        if (runningBalance > 0) {
          const pct   = Math.min(1, amt / runningBalance);
          weightedSum *= (1 - pct);
        }
        runningBalance = Math.max(0, runningBalance - amt);
      }
    });

    // إذا لا يوجد تدفقات، نستخدم تواريخ المعاملات كبديل
    if (runningBalance < 1 && totalBuys > 0) {
      const buysSorted = txRows.filter(t => t.type === 'buy' && t.date)
        .sort((a, b) => a.date.localeCompare(b.date));
      let wb = 0, ws = 0;
      buysSorted.forEach(t => {
        const m = (today - parseDateLocal(t.date)) / (30.44 * 86400000);
        ws += +t.total * m;
        wb += +t.total;
      });
      txRows.filter(t => t.type === 'sell' && t.date).forEach(t => {
        if (wb > 0) { const p = Math.min(1, +t.total / wb); ws *= (1 - p); }
        wb = Math.max(0, wb - +t.total);
      });
      return wb > 0 ? Math.max(0.5, ws / wb) : yearsActive * 12;
    }

    return runningBalance > 0
      ? Math.max(0.5, weightedSum / runningBalance)
      : yearsActive * 12;
  })();

  const divByYear = {};
  divRows.forEach(d => { divByYear[d.year] = (divByYear[d.year] || 0) + +d.amount; });

  // ══════════════════════════════════════════════════════════════════════
  // درجة الثقة — الدالة الموحّدة computeDataConfidence (نفسها التي يستدعيها
  // البانر) حتى يتطابق رقم البانر مع الرقم الداخل في المزج blendedCapGrowth
  // ══════════════════════════════════════════════════════════════════════
  const _rawDivY = [...new Set(divRows.map(d => d.year))].length;
  const _conf = computeDataConfidence(
    Math.round(capitalWeightedMonths),
    Math.round(yearsActive * 12),
    _rawDivY,
    hRows.length
  );
  const confidenceScore = _conf.score;

  // ── المزج الواقعي للسيناريو المعتدل ────────────────────────────────
  // معيار السوق (تاسي الحديثة 2010-2024): نمو سعري ~4.4% سنوياً — MARKET_CAP_BENCHMARK
  // كلما ارتفعت ثقة البيانات → نعتمد أداءك الشخصي أكثر
  // عند ثقة 0%  → 4.4% (معيار تاسي فقط)
  // عند ثقة 50% → متوسط 50/50
  // عند ثقة 100% → أداؤك الشخصي بالكامل
  const confWeight = confidenceScore / 100;
  // السقف 11%: نمو سعري سنوي 11% مُركَّب 35 سنة هو بالفعل الحدّ الأعلى المُدافَع
  // عنه لأداء شخصي مُثبت بسجل كافٍ. أي رقم أعلى يُنتج إسقاطات فلكية تُعشِّم على غلط.
  // الأرضية 0 (وليست +2%): محفظة لم تُثبت نمواً تُسقَط مسطّحة لا صاعدة — هذا يرفع
  // التناقض السابق مع تحذير «الأداء السلبي» الذي كان يظهر بينما النموذج يفرض +2%.
  const blendedCapGrowth = Math.min(0.11, Math.max(0,
    annCapGrowth * confWeight + MARKET_CAP_BENCHMARK * (1 - confWeight)
  ));

  // ── هدف FIRE — localStorage cache (يُحدَّث من Supabase عند تحميل الداشبورد) ──
  let fireGoal = { monthly: 0, swr: 4, target_year: 0 };
  try {
    const scopedKey = userLsKey('retirement_goal_v1');
    const raw = localStorage.getItem(scopedKey) || localStorage.getItem('retirement_goal_v1') || '{}';
    const fg = JSON.parse(raw);
    fireGoal = { monthly: +fg.monthly || 0, swr: +fg.swr || 4, target_year: +fg.target_year || 0 };
  } catch(_) {}

  return {
    currentValue, costBasis, netCapital,
    annCapGrowth,                          // الأداء الشخصي الخام
    blendedCapGrowth,                      // المستخدم فعلياً في السيناريوهات
    safeDivYield, avgAnnualDiv,
    avgMonthlyDeposit, totalDivAll,
    totalBuys, totalSells,
    yearsActive, firstDate,
    capitalWeightedMonths,
    xirr: xirrResult,
    xirrUsed: xirrRate != null,
    currentYear: today.getFullYear(),
    divByYear,
    holdingsCount: hRows.length,
    confidenceScore,
    divYears: _conf.divYears,
    fireGoal,
  };
}

// ── تطبيق هدف FIRE على حقل الهدف ─────────────────────────────────────
function applyFireGoal() {
  const fg = _hist?.fireGoal;
  if (!fg?.monthly || !fg?.target_year) return;
  // رقم FIRE بقوة شراء اليوم — عند تفعيل مفتاح التضخم يخصم computeGoalYear
  // الإسقاطات بالتضخم، فالهدف يبقى بريال اليوم ويُقاس الوصول بقوة الشراء الحقيقية.
  const fireNumber = (fg.monthly * 12) / (fg.swr / 100);
  const goalInp = document.getElementById('inp-goal-amount');
  if (goalInp) { goalInp.value = Math.round(fireNumber); }
  setGoalType('portfolio_value');
  // اضبط الأفق على سنة التقاعد
  const horizonSel = document.getElementById('inp-horizon');
  const yearsLeft  = fg.target_year - new Date().getFullYear();
  if (horizonSel && yearsLeft > 0) {
    // اختر أقرب خيار متاح
    const opts = [...horizonSel.options].map(o => +o.value);
    const best = opts.reduce((p, c) => Math.abs(c - yearsLeft) < Math.abs(p - yearsLeft) ? c : p);
    horizonSel.value = best;
  }
  runForecast();
  showToast(`✓ تطبيق هدف FIRE: محفظة ${fmt(fireNumber)} (بقوة شراء اليوم) بحلول ${fg.target_year}`, 'success');
}

// ── Build 4 scenarios ──────────────────────────────────────────────────
function buildScenarios(divOverride) {
  // نستخدم blendedCapGrowth بدلاً من annCapGrowth الخام
  // هذا يُدخل واقعية: بيانات أقل ثقة → نمزج نحو معيار تاسي (~4.4%)
  const base = _hist.blendedCapGrowth;
  const div  = divOverride !== undefined ? divOverride : _hist.safeDivYield;
  // المعايرة مُرساة على أداء تاسي الفعلي 2005-2024 (20 سنة):
  //   • نمو سعري CAGR: ~1.95% (الفترة كاملة بأزماتها) — ~4.4% (2010-2024 الحديثة)
  //   • توزيعات ~3.5%  • 30% من السنوات كانت خسارة (غير مُغطّاة هنا)
  // المتحفّظ يُرسى على «الطرف المنخفض للسوق» (ارتداد للمتوسط) لا على أداء الفرد
  // المرتفع — فمحفظة حقّقت 11% لن تكرّرها 35 سنة؛ الافتراض الحذر هو عودتها للسوق.
  //   • متحفّظ   ≈ 2.4% سعري + توزيعات مخفّضة (≈5% إجمالي) — كامل-دورة تاسي
  //   • متفائل  = عقد جيّد واقعي (≈11% إجمالي)
  // (أُزيل «الاستثنائي»: نمو سعري 9.5%+ على 10-20 سنة لم يحدث في تاريخ تاسي)
  const MARKET_LOW = Math.max(0, MARKET_CAP_BENCHMARK - 0.02);   // ~2.4% — قاع تاسي طويل المدى الواقعي
  _scenarios = [
    { key:'conservative', capRate: Math.max(0,     Math.min(base * 0.8, MARKET_LOW)), divRate: Math.max(0.01, div * 0.80) },
    { key:'base',         capRate: base,                                              divRate: div                         },
    { key:'optimistic',   capRate: Math.min(0.12,  base + 0.025),                     divRate: Math.min(0.06, div + 0.010) },
  ];
}

// ── Core monthly projection engine ─────────────────────────────────────
// يُشغّل محاكاة شهرية دقيقة تشمل: نمو رأس المال، الأرباح، إعادة الاستثمار،
// إضافات دورية، تعديل التضخم
function projectScenario(scenario, params) {
  const {
    startValue, dcaSchedule, lumpSum,
    horizonYears, reinvestDividends,
    adjustInflation, inflationRate,
  } = params;

  const monthlyCapRate = Math.pow(1 + scenario.capRate, 1/12) - 1;
  // الدخل الشهري = العائد السنوي ÷ 12 — الدلالة المعتادة لدخل توزيعات سنوي،
  // موحّدة مع مونتي كارلو (÷12) ومع توثيق تذييل جدول المعالم في forecast.html
  const monthlyDivRate = scenario.divRate / 12;
  const totalMonths    = horizonYears * 12;
  const monthlyInfl    = Math.pow(1 + inflationRate, 1/12) - 1;

  // المحفظة الاستثمارية فقط — لا عقارات ولا صافي ثروة (تُتابَع في صفحاتها)
  let value               = startValue + lumpSum;
  let cumulativeDividends = 0;
  let cumulativeAdded     = lumpSum;
  let inflationFactor     = 1;

  const snapshots = [{
    year: 0, value, cumDiv: 0, cumAdded: 0,
    realValue: value,
    monthlyIncome:     value * monthlyDivRate,
    monthlyIncomeReal: value * monthlyDivRate,
    yourCapital:       startValue + lumpSum,
    priceGrowth:       0,
  }];

  for (let m = 1; m <= totalMonths; m++) {
    // 1. نمو رأس المال (سعر السهم)
    value *= (1 + monthlyCapRate);

    // 2. الأرباح الموزعة
    const divEarned = value * monthlyDivRate;
    cumulativeDividends += divEarned;
    if (reinvestDividends) value += divEarned;

    // 3. الإضافة الشهرية (DCA) — متغيرة حسب الجدول
    const monthlyAdd = dcaSchedule ? (dcaSchedule[m - 1] || 0) : 0;
    value           = Math.max(0, value + monthlyAdd);
    cumulativeAdded += monthlyAdd;

    // 4. مؤشر التضخم
    if (adjustInflation) inflationFactor *= (1 + monthlyInfl);

    // تسجيل لقطة سنوية
    if (m % 12 === 0) {
      const realVal      = adjustInflation ? value / inflationFactor : value;
      const yourCap      = startValue + cumulativeAdded;
      const priceGrowth  = Math.max(0, value - yourCap - (reinvestDividends ? cumulativeDividends : 0));
      snapshots.push({
        year:              m / 12,
        value,
        cumDiv:            cumulativeDividends,
        cumAdded:          cumulativeAdded,
        realValue:         realVal,
        monthlyIncome:     value * monthlyDivRate,
        monthlyIncomeReal: adjustInflation ? (value * monthlyDivRate) / inflationFactor : value * monthlyDivRate,
        yourCapital:       yourCap,
        priceGrowth,
      });
    }
  }

  return snapshots;
}

// ── Goal year computation ──────────────────────────────────────────────
// دلالة موحّدة مع مفتاح التضخم: عند تفعيله يمرّر المستدعي inflRate > 0 فيُقاس
// الهدف بقوة شراء اليوم (خصم القيمة الاسمية بالتضخم قبل المقارنة)، وعند إطفائه
// يمرّر 0 فيُقاس الهدف اسمياً — نفس المعنى في البطاقات الثلاث (الهدف/الخطة/مونتي كارلو).
// يبدأ الفحص من اللقطة 0: لو الهدف متحقق اليوم يرجع 0 («متحقق الآن»).
function computeGoalYear(snapshots, goalType, goalAmount, inflRate = 0) {
  if (!goalAmount || goalAmount <= 0) return null;
  for (let i = 0; i < snapshots.length; i++) {
    const nominal = goalType === 'monthly_income'
      ? snapshots[i].monthlyIncome
      : snapshots[i].value;
    const realMetric = inflRate > 0
      ? nominal / Math.pow(1 + inflRate, snapshots[i].year)
      : nominal;
    if (realMetric >= goalAmount) return i;
  }
  return null;
}

// ── Run forecast ───────────────────────────────────────────────────────
function runForecast() {
  if (!_hist || !_scenarios.length) return;

  const startValue    = parseFloat(document.getElementById('inp-current-value').value) || _hist.currentValue || 0;
  const lumpSum       = parseFloat(document.getElementById('inp-lump-sum').value)       || 0;
  const horizonYears  = parseInt(document.getElementById('inp-horizon').value)           || 35;
  const reinvest      = document.getElementById('inp-reinvest').checked;
  const inflation     = document.getElementById('inp-inflation').checked;
  const inflationRate = readInflationRate();
  const goalAmount    = parseFloat(document.getElementById('inp-goal-amount').value)    || 0;

  // بناء جدول DCA الشهري من الفترات المُدخَلة
  const dcaPeriods  = getDcaPeriods();
  const dcaSchedule = buildDcaSchedule(dcaPeriods, horizonYears * 12);

  // عائد الأرباح: يدوي إذا أدخله المستخدم، وإلا من البيانات الفعلية
  const divYieldOverride = parseFloat(document.getElementById('inp-div-yield').value);
  const divYieldToUse    = (!isNaN(divYieldOverride) && divYieldOverride > 0)
    ? divYieldOverride / 100
    : _hist.safeDivYield;

  // إعادة بناء السيناريوهات بعائد الأرباح الصحيح
  buildScenarios(divYieldToUse);

  const params = {
    startValue, dcaSchedule, dcaPeriods, lumpSum, horizonYears,
    reinvestDividends: reinvest,
    adjustInflation: inflation,
    inflationRate,
  };

  _projections = _scenarios.map(sc => ({
    key: sc.key, scenario: sc,
    data: projectScenario(sc, params),
  }));

  if (_chartMode === 'cards') {
    document.getElementById('chart-area').style.display  = 'none';
    document.getElementById('cards-area').style.display  = 'block';
    document.getElementById('chart-legend').style.display = 'none';
    renderCardsView(horizonYears);
  } else {
    document.getElementById('chart-area').style.display  = 'block';
    document.getElementById('cards-area').style.display  = 'none';
    document.getElementById('chart-legend').style.display = 'flex';
    renderChart(horizonYears, goalAmount);
  }
  renderMilestoneTable(horizonYears);
  renderGoalPanel(horizonYears, goalAmount);
  renderScenarioDetail(horizonYears);
  updateChartSubtitle(params);
  // بطاقات السيناريو تعرض معدّلات _scenarios التي أعيد بناؤها للتو — حدّثها معها
  renderScenarioCards();
}

// ══════════════════════════════════════════════════════════════════════
// محاكاة مونتي كارلو — Bootstrap من عوائد تاسي السنوية الفعلية
// ──────────────────────────────────────────────────────────────────────
// نبني توزيع العوائد السنوية للمؤشر (تغيّر إغلاقات نهاية السنة)، ثم نسحب منه
// عشوائياً بإحلال سنةً بعد سنة. هذا يُبقي التقلّب الحقيقي وذيوله السمينة وتتابعه
// العشوائي (بخلاف متوسط ثابت). نُعيد مركزة المتوسط الهندسي للتوزيع إلى نمو
// السيناريو المعتدل (blendedCapGrowth) حتى يبقى وسيط المحاكاة متسقاً مع الإسقاط
// الأساسي، بينما تكشف الأطراف (p10) خطر تسلسل العوائد.
function _tasiAnnualReturns() {
  const out = [];
  for (let i = 1; i < TASI_PRICE_YE.length; i++) {
    out.push(TASI_PRICE_YE[i] / TASI_PRICE_YE[i - 1] - 1);
  }
  return out;   // ~20 عائداً سنوياً 2004→2005 … 2023→2024
}

// إعادة مركزة التوزيع بحيث يساوي متوسطه الهندسي targetGeo (ضرب تناسبي يحفظ التقلّب)
function _recenterReturns(returns, targetGeo) {
  const geo = Math.pow(
    returns.reduce((p, r) => p * (1 + r), 1),
    1 / returns.length
  ) - 1;                                        // المتوسط الهندسي التاريخي
  const k = (1 + targetGeo) / (1 + geo);        // معامل الإزاحة الضربي
  return returns.map(r => (1 + r) * k - 1);
}

function _percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.round((p / 100) * (sortedArr.length - 1))));
  return sortedArr[idx];
}

function runMonteCarlo() {
  if (!_hist) { showToast('لا توجد بيانات كافية', 'warning'); return; }
  const N = 2000;
  const statusEl = document.getElementById('mc-status');
  if (statusEl) statusEl.textContent = 'جارٍ الحساب…';

  // مدخلات متطابقة مع الإسقاط الأساسي
  const startValue   = parseFloat(document.getElementById('inp-current-value').value) || _hist.currentValue || 0;
  const lumpSum      = parseFloat(document.getElementById('inp-lump-sum').value) || 0;
  const horizonYears = parseInt(document.getElementById('inp-horizon').value) || 35;
  const reinvest     = document.getElementById('inp-reinvest').checked;
  const adjustInfl   = document.getElementById('inp-inflation').checked;
  const inflationRate = readInflationRate();
  const goalAmount   = parseFloat(document.getElementById('inp-goal-amount').value) || 0;

  const divYieldOverride = parseFloat(document.getElementById('inp-div-yield').value);
  const divYield = (!isNaN(divYieldOverride) && divYieldOverride > 0)
    ? divYieldOverride / 100 : _hist.safeDivYield;

  // إضافة سنوية من جدول DCA الشهري
  const monthly = buildDcaSchedule(getDcaPeriods(), horizonYears * 12);
  const yearlyAdd = [];
  for (let y = 0; y < horizonYears; y++) {
    let sum = 0;
    for (let m = 0; m < 12; m++) sum += monthly[y * 12 + m] || 0;
    yearlyAdd.push(sum);
  }

  // توزيع العوائد المُعاد مركزته إلى نمو السيناريو المعتدل
  const pool = _recenterReturns(_tasiAnnualReturns(), _hist.blendedCapGrowth);

  const finals = [];        // القيمة النهائية (بقوة شراء اليوم إن فُعِّل التضخم)
  const incomes = [];       // الدخل الشهري النهائي (حقيقي)
  let reached = 0;
  const inflFactorEnd = adjustInfl ? Math.pow(1 + inflationRate, horizonYears) : 1;

  for (let s = 0; s < N; s++) {
    let value = startValue + lumpSum;
    for (let y = 0; y < horizonYears; y++) {
      const r = pool[(Math.random() * pool.length) | 0];   // سحب عشوائي بإحلال
      value *= (1 + r);                                     // نمو سعري (قد يكون سالباً)
      const div = value * divYield;
      if (reinvest) value += div;
      value += yearlyAdd[y];
      if (value < 0) value = 0;
    }
    const realValue = value / inflFactorEnd;                // بقوة شراء اليوم
    const realIncome = (realValue * divYield) / 12;
    finals.push(realValue);
    incomes.push(realIncome);
    if (goalAmount > 0) {
      const metric = _goalType === 'monthly_income' ? realIncome : realValue;
      if (metric >= goalAmount) reached++;
    }
  }

  finals.sort((a, b) => a - b);
  incomes.sort((a, b) => a - b);
  const successPct = goalAmount > 0 ? (reached / N * 100) : null;

  _renderMonteCarlo({
    N, horizonYears, goalAmount, adjustInfl, successPct,
    p5:  _percentile(finals, 5),  p10: _percentile(finals, 10),
    p25: _percentile(finals, 25), p50: _percentile(finals, 50),
    p75: _percentile(finals, 75), p90: _percentile(finals, 90),
    inc10: _percentile(incomes, 10), inc50: _percentile(incomes, 50), inc90: _percentile(incomes, 90),
  });
  if (statusEl) statusEl.textContent = `${N} مسار · عوائد تاسي 2004–2024`;
}

function _renderMonteCarlo(r) {
  const box = document.getElementById('mc-results');
  if (!box) return;
  box.style.display = 'block';
  const realTag = r.adjustInfl ? ' <span class="small text-muted">(بقوة شراء اليوم)</span>' : '';

  // شريط المئينات: p10 → p90 (نفس مدى الصفوف المعروضة «أسوأ حظ»→«أحسن حظ»)
  // مع علامة الوسيط والهدف على نفس المقياس
  const lo = r.p10, hi = r.p90, span = Math.max(1, hi - lo);
  const posOf = v => Math.min(100, Math.max(0, (v - lo) / span * 100));
  const goalMarker = (r.goalAmount > 0 && _goalType === 'portfolio_value')
    ? `<div style="position:absolute;top:-4px;bottom:-4px;left:${posOf(r.goalAmount).toFixed(1)}%;width:2px;background:#ef4444" title="الهدف"></div>` : '';

  // ── مقدمة تشرح الفكرة ببساطة ──
  const intro = `
    <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px;line-height:1.85" class="small">
      🎲 <strong>وش سوّينا هنا؟</strong> شغّلنا "مستقبل محفظتك" <b>${r.N} مرة</b>، كل مرة بعوائد سوق مختلفة
      سحبناها من تاريخ تاسي الحقيقي (2004–2024) — فيه سنوات ممتازة وسنوات انهيار. ليش؟ لأن السوق
      <b>ما يعطي نفس العائد كل سنة</b>؛ أحياناً يطلع وأحياناً ينزل، والترتيب نفسه يفرق. فالنتيجة مو رقم
      واحد مضمون، بل <b>نطاق احتمالات</b>: من أسوأ حظ إلى أحسن حظ.
    </div>`;

  let successBlock = '';
  if (r.successPct != null) {
    const col = r.successPct >= 80 ? '#10b981' : r.successPct >= 50 ? '#f0b429' : '#ef4444';
    const verdict = r.successPct >= 80 ? 'فرصة ممتازة للوصول لهدفك 👍'
                  : r.successPct >= 50 ? 'الوصول ممكن لكنه غير مضمون — راقب وزِد ضخّك إن قدرت'
                  : 'الفرصة ضعيفة — خطّتك تحتاج تعزيز (ضخ أشهر أو أفق أطول)';
    successBlock = `
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px">
        <div style="text-align:center;min-width:120px">
          <div style="font-size:2rem;font-weight:800;color:${col};line-height:1">${r.successPct.toFixed(0)}<span style="font-size:1rem">من 100</span></div>
          <div class="small text-muted">محاولة نجحت</div>
        </div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;color:${col};margin-bottom:3px">${verdict}</div>
          <div class="small text-muted">يعني: من كل 100 مستقبل محتمل جرّبناه، بلغت <b>${r.successPct.toFixed(0)}</b> منها هدفك${r.adjustInfl ? ' (بقوة شراء اليوم)' : ' (اسمياً)'}، والباقي ما وصل لأن السوق تعثّر في توقيت سيّئ.</div>
        </div>
      </div>`;
  }

  const row = (emoji, label, hint, val, strong) => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span class="small" style="color:${strong ? 'var(--text)' : 'var(--text-2)'};font-weight:${strong ? 700 : 400}">
        ${emoji} ${label}${hint ? ` <span class="text-muted" style="font-weight:400">— ${hint}</span>` : ''}
      </span>
      <span class="num" style="font-weight:${strong ? 800 : 600};color:${strong ? 'var(--text)' : 'var(--text-2)'};white-space:nowrap">${fmt(val)}</span>
    </div>`;

  box.innerHTML = `
    ${intro}
    ${successBlock}
    <div style="margin-bottom:6px" class="small" style="color:var(--text-2)"><b>حجم محفظتك المتوقّع</b> بعد ${r.horizonYears} سنة${realTag} — حسب حظّك في السوق:</div>
    <div style="position:relative;height:26px;border-radius:13px;background:linear-gradient(90deg,#ef4444 0%,#f0b429 45%,#10b981 100%);margin:8px 0 4px;opacity:.85">
      <div style="position:absolute;top:-4px;bottom:-4px;left:${posOf(r.p50).toFixed(1)}%;width:3px;background:var(--text)" title="الأكثر توقّعاً"></div>
      ${goalMarker}
    </div>
    <div style="display:flex;justify-content:space-between" class="small text-muted">
      <span>👈 أسوأ حظ</span><span>المنتصف</span><span>أحسن حظ 👉</span>
    </div>

    <div style="margin-top:8px;margin-bottom:2px" class="small text-muted">
      رتّبنا كل النتائج من الأسوأ للأفضل. اقرأ كل سطر هكذا: «<b>لو</b> صار لك هذا الحظ، بتكون محفظتك بهذا الحجم»:
    </div>
    <div style="margin-top:6px">
      ${row('😟', 'لو حظّك سيّئ', 'أسوأ 10 نتائج من كل 100', r.p10, false)}
      ${row('🙁', 'لو حظّك أقل من المتوسط', 'أسوأ الربع', r.p25, false)}
      ${row('😐', 'الأكثر توقّعاً', 'المنتصف تماماً', r.p50, true)}
      ${row('🙂', 'لو حظّك أحسن من المتوسط', 'أفضل الربع', r.p75, false)}
      ${row('😄', 'لو حظّك ممتاز', 'أفضل 10 نتائج من كل 100', r.p90, false)}
    </div>

    <div style="background:rgba(240,180,41,0.08);border-right:3px solid #f0b429;border-radius:0 8px 8px 0;padding:11px 13px;margin-top:14px;line-height:1.8" class="small">
      💡 <strong>ليش نركّز على "لو حظّك سيّئ" بدل المنتصف؟</strong><br>
      لأن انهيار السوق <b>قرب تقاعدك</b> أخطر بكثير من انهيار وأنت في البداية — وقتها محفظتك تكون في أكبر
      حجم لها، وما يبقى وقت كافٍ تعوّض الخسارة. عشان تكون آمن، خطّط على أساس السطر «😟 لو حظّك سيّئ»
      (${fmtShort(r.p10)})، لا على «المنتصف» (${fmtShort(r.p50)}) — المتوسطات تخدعك وتخفي أسوأ الاحتمالات.
    </div>

    <div style="margin-top:12px;padding:10px 13px;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;line-height:1.8" class="small">
      💵 <strong>دخلك الشهري المتوقّع من التوزيعات عند التقاعد${realTag}:</strong><br>
      😟 لو حظّك سيّئ ≈ <b>${fmt(r.inc10)}</b> · 😐 الأكثر توقّعاً ≈ <b>${fmt(r.inc50)}</b> · 😄 لو حظّك ممتاز ≈ <b>${fmt(r.inc90)}</b> <span class="text-muted">(ريال/شهر)</span>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// خطة الضخ للوصول للهدف (وضع عكسي) + سجل الخطط المحفوظة
// ──────────────────────────────────────────────────────────────────────
const FORECAST_PLANS_KEY = 'forecast_plans_v1';
let _forecastPlans = [];
let _lastComputedPlan = null;

const _scenLabel = k => k === 'conservative' ? '🛡️ متحفّظ' : k === 'optimistic' ? '🚀 متفائل' : '📊 معتدل';

// قراءة مدخلات الصفحة الحالية للخطة
function _readPlanInputs() {
  return {
    startValue:     parseFloat(document.getElementById('inp-current-value').value) || (_hist?.currentValue) || 0,
    lumpSum:        parseFloat(document.getElementById('inp-lump-sum').value) || 0,
    horizonYears:   parseInt(document.getElementById('inp-horizon').value) || 35,
    reinvest:       document.getElementById('inp-reinvest').checked,
    adjustInflation:document.getElementById('inp-inflation').checked,
    inflationRate:  readInflationRate(),
    goalAmount:     parseFloat(document.getElementById('inp-goal-amount').value) || 0,
    scenarioKey:    document.getElementById('plan-scenario').value || 'base',
    goalType:       _goalType,
  };
}

// تشغيل الإسقاط بضخ شهري ثابت — يعيد مصفوفة اللقطات (value اسمي)
function _projectConstant(pmt, inp, scenario, withInflation) {
  return projectScenario(scenario, {
    startValue: inp.startValue,
    dcaSchedule: new Array(inp.horizonYears * 12).fill(pmt),
    lumpSum: inp.lumpSum,
    horizonYears: inp.horizonYears,
    reinvestDividends: inp.reinvest,
    adjustInflation: !!withInflation,
    inflationRate: inp.inflationRate,
  });
}

function computeContributionPlan() {
  if (!_hist || !_scenarios.length) { showToast('لا توجد بيانات كافية بعد', 'warning'); return; }
  const inp = _readPlanInputs();
  if (inp.goalAmount <= 0) { showToast('حدّد الهدف أولاً من بطاقة «تحديد الهدف» أعلاه', 'warning'); return; }

  // ابنِ السيناريوهات بعائد الأرباح الصحيح (يدوي أو من البيانات)
  const divOverride = parseFloat(document.getElementById('inp-div-yield').value);
  buildScenarios((!isNaN(divOverride) && divOverride > 0) ? divOverride / 100 : _hist.safeDivYield);
  const scenario = _scenarios.find(s => s.key === inp.scenarioKey) || _scenarios[1];

  const years = inp.horizonYears;
  // موحّد على ÷12 (نفس دلالة projectScenario ومونتي كارلو)
  const monthlyDivRate = scenario.divRate / 12;

  // الهدف الاسمي المستقبلي (نرفع هدف اليوم لقوّته الاسمية عند تفعيل التضخم)
  const inflMul = inp.adjustInflation ? Math.pow(1 + inp.inflationRate, years) : 1;
  let targetFinalValue;
  if (inp.goalType === 'monthly_income') {
    targetFinalValue = monthlyDivRate > 0 ? (inp.goalAmount * inflMul) / monthlyDivRate : Infinity;
  } else {
    targetFinalValue = inp.goalAmount * inflMul;
  }

  // حل خطي: القيمة النهائية = A + الضخ × B  (اسمياً)
  const A = _projectConstant(0, inp, scenario, false).slice(-1)[0].value;
  const B = _projectConstant(1, inp, scenario, false).slice(-1)[0].value - A;
  let requiredPMT = 0, alreadyReached = false, impossible = false;
  if (targetFinalValue <= A + 1e-6) { alreadyReached = true; }
  else if (B > 1e-9) { requiredPMT = (targetFinalValue - A) / B; }
  else { impossible = true; }

  const snaps = _projectConstant(alreadyReached ? 0 : requiredPMT, inp, scenario, inp.adjustInflation);
  const finalSnap = snaps[snaps.length - 1];

  _lastComputedPlan = {
    inp,
    scenario: { key: scenario.key, capRate: scenario.capRate, divRate: scenario.divRate },
    requiredPMT: impossible ? null : Math.max(0, requiredPMT),
    alreadyReached, impossible, targetFinalValue,
    finalValue: finalSnap.value,
    finalIncome: finalSnap.monthlyIncome,
    totalContributed: (alreadyReached ? 0 : Math.max(0, requiredPMT)) * years * 12 + inp.lumpSum,
  };
  _renderPlanResults(snaps, targetFinalValue);
}

function _renderPlanResults(snaps, targetFinalValue) {
  const box = document.getElementById('plan-results');
  if (!box) return;
  box.style.display = 'block';
  const pl = _lastComputedPlan, inp = pl.inp;
  const goalTxt = inp.goalType === 'monthly_income'
    ? `دخل شهري ${fmt(inp.goalAmount)} ر.س` : `قيمة محفظة ${fmt(inp.goalAmount)} ر.س`;

  let headline;
  if (pl.impossible) {
    headline = `<div style="font-size:1.05rem;font-weight:800;color:#ef4444">تعذّر الحساب — راجع الأفق الزمني</div>`;
  } else if (pl.alreadyReached) {
    headline = `<div style="font-size:1.4rem;font-weight:800;color:#10b981;line-height:1.2">لا حاجة لضخ إضافي ✅</div>
      <div class="small text-muted">أصولك الحالية (${fmt(inp.startValue + inp.lumpSum)} ر.س) تبلغ الهدف وحدها في ${inp.horizonYears} سنة بسيناريو ${_scenLabel(inp.scenarioKey)}.</div>`;
  } else {
    headline = `<div class="small text-muted">الضخ الشهري المطلوب للوصول لـ${goalTxt}:</div>
      <div style="font-size:2.1rem;font-weight:800;color:var(--accent);line-height:1.1">${fmt(pl.requiredPMT)} <span style="font-size:1rem;color:var(--text-2)">ر.س / شهر</span></div>`;
  }

  // جدول التقدّم السنوي
  const step = inp.horizonYears <= 20 ? 1 : 5;
  const rows = [];
  snaps.forEach(s => {
    if (s.year === 0) return;
    if (s.year % step === 0 || s.year === inp.horizonYears) {
      const prog = targetFinalValue > 0 ? Math.min(999, s.value / targetFinalValue * 100) : 0;
      rows.push(`<tr>
        <td>${s.year}</td>
        <td class="num">${fmtShort(s.yourCapital)}</td>
        <td class="num">${fmtShort(s.value)}</td>
        <td class="num">${fmtShort(s.monthlyIncome)}</td>
        <td class="num" style="color:${prog>=100?'#10b981':prog>=60?'#f0b429':'var(--text-2)'}">${prog.toFixed(0)}%</td>
      </tr>`);
    }
  });

  const inflNote = inp.adjustInflation
    ? `<div class="small text-muted" style="margin-top:6px">↳ الهدف مرفوع لقوّته الاسمية المستقبلية (${fmt(targetFinalValue)} ر.س) ليعادل ${fmt(inp.goalAmount)} ر.س بقوّة شراء اليوم بعد ${inp.horizonYears} سنة.</div>` : '';

  box.innerHTML = `
    <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:12px">
      ${headline}
      ${inflNote}
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px" class="small">
      <span>الأفق: <b>${inp.horizonYears} سنة</b></span>
      <span>السيناريو: <b>${_scenLabel(inp.scenarioKey)}</b> (نمو ${(pl.scenario.capRate*100).toFixed(1)}% + توزيع ${(pl.scenario.divRate*100).toFixed(1)}%)</span>
      <span>البداية: <b>${fmt(inp.startValue + inp.lumpSum)} ر.س</b></span>
      ${!pl.alreadyReached && !pl.impossible ? `<span>إجمالي ما ستضخّه: <b>${fmt(pl.totalContributed)} ر.س</b></span>` : ''}
      <span>القيمة المتوقّعة عند الهدف: <b>${fmt(pl.finalValue)} ر.س</b></span>
    </div>
    <div class="table-wrap" style="overflow-x:auto">
      <table style="width:100%;font-size:.82rem"><thead><tr>
        <th>السنة</th><th>رأس مالك المضاف</th><th>قيمة المحفظة</th><th>الدخل الشهري</th><th>نحو الهدف</th>
      </tr></thead><tbody>${rows.join('')}</tbody></table>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px">
      <input type="text" id="plan-notes" placeholder="ملاحظة اختيارية (مثال: خطة تقاعد 2045)" maxlength="120"
             style="flex:1;min-width:200px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-2);color:var(--text);font-size:.85rem">
      <button class="btn btn-success btn-sm" onclick="saveForecastPlan()">💾 احفظ هذه الخطة</button>
    </div>`;
}

// ── التخزين: user_settings (مصدر الحقيقة) + localStorage cache ──
async function loadForecastPlans() {
  try {
    const remote = (typeof loadUserSetting === 'function') ? await loadUserSetting(FORECAST_PLANS_KEY) : null;
    if (Array.isArray(remote)) { _forecastPlans = remote; return; }
  } catch (_) { /* نرجع للكاش */ }
  try {
    const raw = localStorage.getItem(userLsKey(FORECAST_PLANS_KEY)) || localStorage.getItem(FORECAST_PLANS_KEY);
    _forecastPlans = raw ? JSON.parse(raw) : [];
  } catch (_) { _forecastPlans = []; }
}

async function _persistForecastPlans() {
  try { if (typeof saveUserSetting === 'function') await saveUserSetting(FORECAST_PLANS_KEY, _forecastPlans); } catch (_) {}
  try { localStorage.setItem(userLsKey(FORECAST_PLANS_KEY), JSON.stringify(_forecastPlans)); } catch (_) {}
}

async function saveForecastPlan() {
  if (!_lastComputedPlan) { showToast('احسب الخطة أولاً', 'warning'); return; }
  const notes = (document.getElementById('plan-notes')?.value || '').trim();
  const pl = _lastComputedPlan;
  _forecastPlans.unshift({
    id: Date.now(),
    date: new Date().toLocaleDateString('en-GB'),
    createdISO: new Date().toISOString(),
    notes,
    inp: pl.inp,
    scenario: pl.scenario,
    requiredPMT: pl.requiredPMT,
    alreadyReached: pl.alreadyReached,
    finalValue: pl.finalValue,
    totalContributed: pl.totalContributed,
  });
  await _persistForecastPlans();
  renderForecastPlans();
  showToast('تم حفظ الخطة ✓', 'success');
}

async function deleteForecastPlan(id) {
  const p = _forecastPlans.find(x => x.id === id);
  const label = p ? (p.notes || (p.inp.goalType === 'monthly_income' ? `دخل ${fmt(p.inp.goalAmount)}` : `محفظة ${fmt(p.inp.goalAmount)}`)) : '';
  const ok = await confirmAsync(`حذف الخطة «${label}» نهائياً؟\nلا يمكن التراجع.`);
  if (!ok) return;
  _forecastPlans = _forecastPlans.filter(x => x.id !== id);
  await _persistForecastPlans();
  renderForecastPlans();
  showToast('حُذفت الخطة', 'info');
}

function loadForecastPlanIntoInputs(id) {
  const p = _forecastPlans.find(x => x.id === id);
  if (!p) return;
  const i = p.inp;
  document.getElementById('inp-current-value').value = i.startValue || '';
  document.getElementById('inp-lump-sum').value = i.lumpSum || 0;
  document.getElementById('inp-goal-amount').value = i.goalAmount || '';
  document.getElementById('inp-reinvest').checked = !!i.reinvest;
  document.getElementById('inp-inflation').checked = !!i.adjustInflation;
  if (i.inflationRate) document.getElementById('inp-inflation-rate').value = (i.inflationRate * 100).toFixed(1);
  document.getElementById('plan-scenario').value = i.scenarioKey || 'base';
  setGoalType(i.goalType || 'portfolio_value');
  // أقرب أفق متاح
  const hSel = document.getElementById('inp-horizon');
  if (hSel) {
    const opts = [...hSel.options].map(o => +o.value);
    hSel.value = opts.reduce((pp, c) => Math.abs(c - i.horizonYears) < Math.abs(pp - i.horizonYears) ? c : pp);
  }
  runForecast();
  computeContributionPlan();
  document.getElementById('plan-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('تم تحميل الخطة', 'success');
}

function renderForecastPlans() {
  const el = document.getElementById('saved-plans-list');
  if (!el) return;
  const q = (document.getElementById('plan-search')?.value || '').trim().toLowerCase();
  let plans = _forecastPlans;
  if (q) {
    plans = plans.filter(p =>
      (p.notes || '').toLowerCase().includes(q) ||
      String(p.inp.goalAmount).includes(q) ||
      (p.inp.goalType === 'monthly_income' ? 'دخل' : 'محفظة').includes(q));
  }
  if (!plans.length) {
    el.innerHTML = `<p class="small text-muted" style="margin:8px 0">${_forecastPlans.length ? 'لا نتائج مطابقة للبحث.' : 'لا خطط محفوظة بعد — احسب خطة أعلاه ثم احفظها.'}</p>`;
    return;
  }
  el.innerHTML = plans.map(p => {
    const goalTxt = p.inp.goalType === 'monthly_income' ? `دخل ${fmt(p.inp.goalAmount)} ر.س/شهر` : `محفظة ${fmt(p.inp.goalAmount)} ر.س`;
    const pmtTxt = p.alreadyReached ? 'لا حاجة لضخ' : (p.requiredPMT == null ? '—' : `${fmt(p.requiredPMT)} ر.س/شهر`);
    return `
    <div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:var(--bg-2)">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700">${p.notes ? esc(p.notes) : goalTxt}</div>
          ${p.notes ? `<div class="small text-muted">${goalTxt}</div>` : ''}
          <div class="small text-muted" style="margin-top:4px">
            الضخ المطلوب: <b style="color:var(--accent)">${pmtTxt}</b> ·
            ${p.inp.horizonYears} سنة · ${_scenLabel(p.inp.scenarioKey)} · حُفظت ${p.date}
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="loadForecastPlanIntoInputs(${p.id})">تحميل</button>
          <button class="btn btn-danger btn-sm" onclick="deleteForecastPlan(${p.id})">حذف</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Render historical summary ──────────────────────────────────────────
function renderHistSummary() {
  const h = _hist;
  const badge = document.getElementById('hist-period-badge');
  if (badge) {
    const from = h.firstDate ? h.firstDate.getFullYear() : '—';
    badge.textContent = `${h.yearsActive.toFixed(1)} سنة بيانات (${from}–${h.currentYear})`;
  }
  // H-8: warn when historical performance is genuinely negative
  if (h.annCapGrowth < 0) {
    showToast('⚠️ أداؤك التاريخي سلبي — محفظتك لم تُثبت نمواً بعد؛ تُسقَط مسطّحة (لا صاعدة) وقد تكون الإسقاطات مفرطة التفاؤل', 'warning');
  }

  // XIRR: المصدر الأصدق للعائد التاريخي الحقيقي
  const _mRet = assessMetricMaturity('return', { ageMonths: (h.yearsActive || 0) * 12 });
  const xirrLabel = h.xirr != null
    ? `${h.xirr >= 0 ? '+' : ''}${h.xirr.toFixed(2)}%${maturityBadge(_mRet.level, _mRet.reason)}`
    : '—';

  // نمو رأس المال: عرض الخام vs المُعدَّل للواقعية
  const rawCap     = h.annCapGrowth;
  const blended    = h.blendedCapGrowth;
  const conf       = h.confidenceScore || 0;
  const isBlended  = Math.abs(rawCap - blended) > 0.001;
  const growthLabel = isBlended
    ? `${pct(blended)} <span style="font-size:0.63rem;color:var(--text-muted)"
        title="أداؤك الشخصي ${pct(rawCap)} مُمزوج بمعيار تاسي (~4.4%)&#10;بوزن ثقة البيانات ${conf}%&#10;كلما زادت بيانات محفظتك → نعتمد أداءك أكثر">
        (خامك ${pct(rawCap)} · ثقة ${conf}%)
      </span>`
    : `${pct(blended)} <span style="font-size:0.63rem;color:var(--success)" title="ثقة بيانات عالية — أداؤك الشخصي مُستخدَم بالكامل">✓ثقة ${conf}%</span>`;

  const items = [
    { val: fmt(h.currentValue),           lbl: 'القيمة السوقية الحالية' },
    { val: fmt(h.costBasis),              lbl: 'التكلفة الأساسية' },
    { val: xirrLabel,                     lbl: 'XIRR — العائد الداخلي الحقيقي', raw: true },
    { val: growthLabel,                   lbl: 'نمو رأس المال (مُستخدَم في السيناريوهات)', raw: true },
    { val: pct(h.safeDivYield),           lbl: 'عائد الأرباح السنوي' },
    { val: fmt(h.avgAnnualDiv),           lbl: 'متوسط الأرباح السنوية' },
    { val: fmt(h.totalDivAll),            lbl: 'إجمالي الأرباح المتراكمة' },
    { val: fmt(h.avgMonthlyDeposit),      lbl: 'متوسط الإضافة الشهرية' },
    { val: String(h.holdingsCount),       lbl: 'عدد الأسهم' },
  ];

  const el = document.getElementById('hist-summary');
  if (el) el.innerHTML = items.map(i => `
    <div class="hist-item">
      <div class="h-val">${i.raw ? i.val : esc(i.val)}</div>
      <div class="h-lbl">${esc(i.lbl)}</div>
    </div>`).join('');

  // ملء القيم الافتراضية في حقول المدخلات
  const cvInp = document.getElementById('inp-current-value');
  if (cvInp && !+cvInp.value) cvInp.value = Math.round(h.currentValue);

  // تهيئة أول فترة DCA بمتوسط الإضافة التاريخية إذا لم يكن هناك فترات.
  // مستخدم بلا سجل إيداعات يبدأ من 0 (لا نزرع ضخاً افتراضياً لم يُقرّه —
  // 8000×5 سنوات = 480 ألف ر.س تُضخّم الإسقاط زوراً) والـ placeholder يقترح مثالاً.
  if (document.querySelectorAll('.dca-period-row').length === 0) {
    addDcaPeriod(h.avgMonthlyDeposit > 0 ? Math.round(h.avgMonthlyDeposit) : 0, 5);
  }

  const dyBadge = document.getElementById('div-yield-auto');
  if (dyBadge) dyBadge.textContent = `من بياناتك: ${pct(h.safeDivYield)}`;

  // عرض مؤشر ثقة البيانات
  renderDataConfidenceBanner(h);

  // ربط هدف FIRE
  renderFireBanner(h);
}

// ── ربط هدف التقاعد (FIRE) بالصفحة ──────────────────────────────
function renderFireBanner(h) {
  const el = document.getElementById('fire-link-banner');
  if (!el) return;

  const fg = h.fireGoal || {};
  if (!fg.monthly || !fg.target_year) {
    el.innerHTML = `<div style="font-size:.78rem;color:var(--text-muted);padding:6px 0">
      💡 لم يُحدَّد هدف التقاعد — اذهب للوحة التحكم وأدخل مصاريفك الشهرية بعد التقاعد + سنة التقاعد لربطها هنا.
    </div>`;
    return;
  }

  const fireNumber   = (fg.monthly * 12) / (fg.swr / 100);
  const yearsLeft    = fg.target_year - new Date().getFullYear();
  // الهدف المعدَّل بالتضخم: المصاريف الشهرية ستكون أعلى بعد yearsLeft سنة
  // الصيغة الصحيحة: الهدف يرتفع مع كل سنة تأخير — بمعدل حقل التضخم في الصفحة
  const INFLATION_RATE = readInflationRate();
  const inflMonthly  = yearsLeft > 0 ? fg.monthly * Math.pow(1 + INFLATION_RATE, yearsLeft) : fg.monthly;
  const fireInflated = (inflMonthly * 12) / (fg.swr / 100);
  const showInfl     = yearsLeft > 0 && Math.abs(fireInflated - fireNumber) > 1000;
  // المحفظة الاستثمارية فقط — هذه الصفحة تحت محفظة التقاعد ولا تُدخِل العقارات/صافي الثروة
  const currentNW    = h.currentValue;
  const progress     = fireNumber > 0 ? Math.min(100, currentNW / fireNumber * 100) : 0;
  // نسبة الإنجاز الحقيقية: مقارنة بالهدف المعدَّل بالتضخم
  const progressReal = fireInflated > 0 ? Math.min(100, currentNW / fireInflated * 100) : 0;
  const remaining    = Math.max(0, fireNumber - currentNW);
  const remainingReal = Math.max(0, fireInflated - currentNW);
  const barColor     = progress >= 100 ? '#3fb950' : progress >= 50 ? '#f0b429' : '#3b82f6';

  el.innerHTML = `
    <div style="
      border:1px solid rgba(59,130,246,.3);background:rgba(59,130,246,.05);
      border-radius:10px;padding:12px 16px;margin-bottom:4px;
    ">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-weight:700;font-size:.88rem">🎯 هدف التقاعد ${fg.target_year} — ربط تلقائي من إعداداتك</span>
        <span style="font-size:.75rem;color:var(--text-muted)">${yearsLeft} سنة متبقية</span>
        <button class="btn btn-secondary btn-sm" style="font-size:.72rem;margin-right:auto"
          onclick="applyFireGoal()">تطبيق على الإسقاط ↻</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:.8rem;margin-bottom:10px">
        <div><span style="color:var(--text-muted)">الدخل الشهري المستهدف</span><br><strong>${fmt(fg.monthly)}</strong></div>
        <div><span style="color:var(--text-muted)">نسبة السحب الآمن</span><br><strong>${fg.swr}%</strong></div>
        <div>
          <span style="color:var(--text-muted)">المحفظة المطلوبة (اليوم)</span><br>
          <strong>${fmt(fireNumber)}</strong>
          ${showInfl ? `<br><span style="font-size:.72rem;color:#f0b429" title="بعد تعديل التضخم ${(INFLATION_RATE*100).toFixed(1)}% × ${yearsLeft} سنة&#10;دخل ${fmt(inflMonthly)}/شهر عند التقاعد">📈 معدَّل ${fmt(fireInflated)}</span>` : ''}
        </div>
        <div>
          <span style="color:var(--text-muted)">المتبقي</span><br>
          <strong style="color:${barColor}">${fmt(remaining)}</strong>
          ${showInfl ? `<br><span style="font-size:.72rem;color:#f0b429">${fmt(remainingReal)} معدَّل</span>` : ''}
        </div>
      </div>
      <div style="margin-bottom:4px">
        <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--text-muted);margin-bottom:4px">
          <span>نسبة الإنجاز نحو FIRE ${showInfl ? `<span style="font-size:.66rem;color:#f0b429" title="الرقم الأول: بدون تضخم | الثاني: بعد تعديل التضخم">(${progressReal.toFixed(1)}% معدَّل)</span>` : ''}</span>
          <span style="color:${barColor};font-weight:700">${progress.toFixed(1)}%</span>
        </div>
        <div style="background:var(--border);border-radius:99px;height:7px;overflow:hidden">
          <div style="height:100%;border-radius:99px;background:${barColor};width:${Math.min(progress,100)}%;transition:width .4s"></div>
        </div>
      </div>
    </div>`;
}

// ── مؤشر ثقة البيانات ─────────────────────────────────────────────────
function renderDataConfidenceBanner(h) {
  const el = document.getElementById('data-confidence-banner');
  if (!el) return;

  const calMonths = Math.round((h.yearsActive || 0) * 12);     // عمر تقويمي
  const cwMonths  = Math.round(h.capitalWeightedMonths || 0);  // عمر فعلي مرجَّح

  // عدد السنوات التقويمية التي ظهر فيها توزيع. ملاحظة: محفظة تمتد على سنتين
  // تقويميتين (مثلاً بدأت خريف 2025 وتوزيعات في 2025 ثم 2026) تعطي 2 رغم أن
  // عمرها أقل من سنة. لذا نقيّد العدّاد بعمر المحفظة التقويمي حتى لا نعدّ
  // «دورة سنوية كاملة» لم تكتمل فعلياً — يمنع تضخيم الثقة والتناقض في العرض.
  const rawDivYears = Object.keys(h.divByYear || {}).length;

  // نستخدم العمر الفعلي (المرجَّح بالتدفقات) في حساب الثقة — أدق بكثير من التقويمي
  const months = cwMonths;

  // ── حساب درجة الثقة (0–100) عبر الدالة الموحّدة نفسها المستخدمة في المزج ──
  const { score, agePct, divPct, holdPct, divYears } =
    computeDataConfidence(cwMonths, calMonths, rawDivYears, h.holdingsCount);

  // ── مستوى الثقة ──────────────────────────────────────────────────────
  let tier, badgeColor, borderColor, bgColor;
  if      (score < 30) { tier = 'very_low';   badgeColor = '#f85149'; borderColor = 'rgba(248,81,73,.35)';  bgColor = 'rgba(248,81,73,.06)'; }
  else if (score < 45) { tier = 'low';        badgeColor = '#f85149'; borderColor = 'rgba(248,81,73,.25)';  bgColor = 'rgba(248,81,73,.04)'; }
  else if (score < 60) { tier = 'developing'; badgeColor = '#f0b429'; borderColor = 'rgba(240,180,41,.30)'; bgColor = 'rgba(240,180,41,.05)'; }
  else if (score < 75) { tier = 'fair';       badgeColor = '#f0b429'; borderColor = 'rgba(240,180,41,.25)'; bgColor = 'rgba(240,180,41,.04)'; }
  else if (score < 87) { tier = 'good';       badgeColor = '#3fb950'; borderColor = 'rgba(63,185,80,.30)';  bgColor = 'rgba(63,185,80,.05)';  }
  else                 { tier = 'strong';     badgeColor = '#3b82f6'; borderColor = 'rgba(59,130,246,.30)'; bgColor = 'rgba(59,130,246,.05)'; }

  // ── رسالة المستشار المالي ─────────────────────────────────────────────
  const fmtM       = m => m < 12 ? `${m} شهر` : `${(m/12).toFixed(1)} سنة`;
  const monthsText = fmtM(months);   // الفعلي
  const calText    = fmtM(calMonths); // التقويمي
  // هل التدفقات أثّرت بشكل واضح؟
  const cwDiff     = calMonths - cwMonths;
  const cwNote     = cwDiff >= 2
    ? ` (العمر التقويمي ${calText} — الفرق بسبب ضخ رأس المال تدريجياً)`
    : '';

  const msgs = {
    very_low: {
      title: '⚠️ المحفظة في طور البناء — البيانات غير كافية للإسقاط',
      body:  `محفظتك عمرها ${monthsText} فقط وهذا زمن قصير جداً. أي إسقاط الآن يشبه التنبؤ بحصاد موسم كامل بعد أسبوع من الزراعة. استخدم الأرقام للاستئناس فقط.`,
      advice: `انتظر حتى تكتمل ${12 - months} شهراً أخرى على الأقل قبل الاعتماد على هذه الأرقام.`,
    },
    low: {
      title: '🟡 بيانات أولية — الإسقاطات تقديرية',
      body:  `${monthsText} من البيانات مع ${divYears} دورة أرباح. النمو المحسوب قد يكون مضخّماً أو مقلّصاً لأن المحفظة لم تمر بعد بدورة سوقية كاملة.`,
      advice: 'السيناريو المتحفظ هو الأكثر صدقاً في مرحلتك الحالية.',
    },
    developing: {
      title: '🟡 بيانات نامية — استخدم بحذر',
      body:  `${monthsText} من التاريخ و${divYears} سنة أرباح. الأرقام تعكس واقعك لكنها لم تشهد بعد اختبار تصحيح سوقي حقيقي. معدل النمو الحالي قد لا يكون مستداماً.`,
      advice: 'قارن مع بيانات القطاع للتحقق من منطقية الأرقام.',
    },
    fair: {
      title: '📊 بيانات معقولة — مفيدة للتخطيط',
      body:  `${monthsText} و${divYears} سنوات أرباح. البيانات تكفي للتخطيط الأولي لكن لا تزال بحاجة إلى سنة إضافية لتعكس التقلبات الاعتيادية في السوق.`,
      advice: 'الأرقام مفيدة للاتجاه العام — لا تبالغ في الدقة.',
    },
    good: {
      title: '✅ بيانات جيدة — يمكن الاعتماد عليها',
      body:  `${monthsText} من التاريخ الفعلي و${divYears} دورات أرباح. المحفظة شهدت تقلبات السوق وأثبتت نمطاً. الإسقاطات ذات مصداقية عالية.`,
      advice: 'راجع الأرقام بعد كل تغيير جوهري في تركيب المحفظة.',
    },
    strong: {
      title: '🔵 بيانات موثوقة — إسقاطات ذات ثقة عالية',
      body:  `${monthsText} من التاريخ الفعلي مع ${divYears} دورات أرباح كاملة. المحفظة لديها سجل كافٍ لاتخاذ قرارات مبنية على الأرقام.`,
      advice: 'حافظ على تسجيل البيانات بانتظام للحفاظ على هذا المستوى من الموثوقية.',
    },
  };

  const m = msgs[tier];

  el.innerHTML = `
    <div style="
      border:1px solid ${borderColor};
      background:${bgColor};
      border-radius:10px;
      padding:14px 16px;
      margin-bottom:4px;
    ">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <span style="font-weight:700;font-size:.95rem">${m.title}</span>
        <span style="
          background:${badgeColor};color:#fff;border-radius:20px;
          padding:2px 10px;font-size:.75rem;font-weight:700;white-space:nowrap
        ">ثقة البيانات ${score}%</span>
        <span style="
          background:var(--bg-2);border:1px solid var(--border);border-radius:20px;
          padding:2px 10px;font-size:.72rem;color:var(--text-muted);white-space:nowrap
        "
        title="عمر رأس المال الفعلي (مرجَّح بالتدفقات) = ${cwMonths} شهر&#10;العمر التقويمي = ${calMonths} شهر&#10;الفرق = ${cwDiff} شهر بسبب الضخ التدريجي">
          رأس المال الفعلي: ${monthsText}${cwDiff>=2?' | تقويمي: '+calText:''}
          · ${divYears} دورة · ${h.holdingsCount} سهم
        </span>
      </div>
      <p style="font-size:.83rem;color:var(--text-2);margin:0 0 6px;line-height:1.6">${m.body}</p>
      <p style="font-size:.80rem;color:${badgeColor};margin:0;font-weight:600">💡 ${m.advice}</p>

      <!-- شريط البيانات -->
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        ${_confFactor('عمر المحفظة', monthsText, Math.round(agePct * 100), score)}
        ${_confFactor('دورات الأرباح', divYears + ' سنة', Math.round(divPct * 100), score)}
        ${_confFactor('التنويع', h.holdingsCount + ' سهم', Math.round(holdPct * 100), score)}
      </div>
    </div>`;
}

function _confFactor(label, value, pct, totalScore) {
  const color = pct < 40 ? '#f85149' : pct < 65 ? '#f0b429' : '#3fb950';
  return `<div style="
    flex:1;min-width:100px;
    background:var(--bg-2);border:1px solid var(--border);
    border-radius:7px;padding:7px 10px;
  ">
    <div style="font-size:.70rem;color:var(--text-muted);margin-bottom:3px">${label}</div>
    <div style="font-size:.82rem;font-weight:600;color:var(--text-1)">${value}</div>
    <div style="height:4px;background:var(--border);border-radius:2px;margin-top:5px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width .4s"></div>
    </div>
  </div>`;
}

// ── Render scenario cards ──────────────────────────────────────────────
function renderScenarioCards() {
  const grid = document.getElementById('scenario-grid');
  if (!grid) return;

  const occ = scenarioOccurrenceProbs();   // احتمالات حقيقية من تاسي حسب معدّلات محفظتك

  grid.innerHTML = SCENARIO_META.map((m, i) => {
    const sc = _scenarios[i];
    const isActive = _activeScenarios.includes(m.key);
    const prob     = occ.probs[i];
    // ≤2% = نادر تاريخياً (لم يحدث فعلياً على المدى الطويل في عيّنة تاسي)
    const rare     = prob <= 2;
    const score10  = Math.round(prob / 10);   // تقييم احتمالية من 10
    const probTip  = `احتمال فعلي ≈${prob}% — نسبة فترات تاسي الطويلة (${occ.windows} نافذة متداخلة 10-20 سنة) التي وقع نموّها السعري في جوار هذا السيناريو`;
    return `
    <div class="scenario-card ${m.cls}${isActive ? ' active' : ''}" id="sc-card-${m.key}" onclick="toggleScenario('${m.key}')">
      <div class="sc-badge">${m.emoji} ${m.name}</div>
      <div class="sc-name">${m.name}</div>

      <div style="display:flex;align-items:center;gap:11px;margin:6px 0 9px" title="${probTip}">
        <!-- دائرة تقييم الاحتمالية من 10 -->
        <div style="width:48px;height:48px;border-radius:50%;border:2.5px solid ${m.color};background:${m.color}1a;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;line-height:1">
          <span style="font-size:1.2rem;font-weight:800;color:${m.color}">${score10}</span>
          <span style="font-size:.5rem;color:var(--text-muted);margin-top:1px">من 10</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
          <span style="font-size:.7rem;font-weight:600;color:var(--text-2)">احتمال حدوثه (تاسي 🇸🇦)</span>
          <span style="font-size:.63rem;color:var(--text-muted)">${rare ? 'لم يتحقق على أي فترة 10-20 سنة' : 'تقييم احتمالية على مدى 10-20 سنة'}</span>
          <span style="font-size:.66rem;color:var(--text-muted)" title="فترات تاريخية وقع فيها تاسي ضمن نطاق هذا السيناريو">📅 ${m.tasiYears}</span>
        </div>
      </div>

      <div class="sc-desc">${m.desc}</div>
      <div class="sc-rates">
        <div class="sc-rate-row"><span class="label">نمو رأس المال/سنة</span><span class="val" style="color:${m.color}">${pct(sc.capRate)}</span></div>
        <div class="sc-rate-row"><span class="label">عائد الأرباح/سنة</span><span class="val" style="color:${m.color}">${pct(sc.divRate)}</span></div>
        <div class="sc-rate-row"><span class="label">إجمالي العائد/سنة</span><span class="val" style="color:${m.color}">${pct(sc.capRate + sc.divRate)}</span></div>
      </div>
    </div>`;
  }).join('');

  // ملاحظة تركيز المحفظة فقط (أُزيلت بطاقة «أسوأ من المتحفظ» بطلب المستخدم)
  const note = document.getElementById('scenario-prob-note');
  if (note) {
    const N = _hist?.holdingsCount || 0;
    note.innerHTML = N > 0 ? `
      <div style="border:1px solid rgba(88,166,255,.30);background:rgba(88,166,255,.06);border-radius:10px;padding:11px 14px;line-height:1.75">
        <div style="font-weight:700;color:#58a6ff">🎯 محفظتك ${N} ${N === 1 ? 'سهم' : N === 2 ? 'سهمان' : N <= 10 ? 'أسهم' : 'سهماً'}، والمؤشر 159 شركة</div>
        <div class="small text-muted" style="margin-top:5px">
          المؤشر مثل <strong>معدّل الفصل كامل</strong> (159 طالب). أنت معك ${N} بس. ولأن عددك أقل، نتيجتك ممكن تطلع <strong>أحسن من المعدّل بكثير</strong>، أو <strong>أسوأ منه</strong> (لأن تعثّر شركة وحدة يأثّر فيك أكثر). يعني هذي الأرقام <strong>دليل عام للسوق، مو وعد مضمون</strong> لمحفظتك بالذات. وكل ما زاد عدد شركاتك، صارت نتيجتك أقرب للسوق.
        </div>
      </div>` : '';
  }
}

// ── Toggle scenario ────────────────────────────────────────────────────
function toggleScenario(key) {
  const idx = _activeScenarios.indexOf(key);
  if (idx === -1) {
    _activeScenarios.push(key);
  } else if (_activeScenarios.length > 1) {
    _activeScenarios.splice(idx, 1);
  }
  SCENARIO_META.forEach(m => {
    const card = document.getElementById(`sc-card-${m.key}`);
    if (card) card.classList.toggle('active', _activeScenarios.includes(m.key));
  });
  _activeHighlight = key;
  const horizonYears = parseInt(document.getElementById('inp-horizon').value) || 35;
  const goalAmount   = parseFloat(document.getElementById('inp-goal-amount').value) || 0;
  renderChart(horizonYears, goalAmount);
  renderScenarioDetail(horizonYears);
}

// ── Chart mode toggle ──────────────────────────────────────────────────
function setChartMode(mode) {
  _chartMode = mode;
  document.querySelectorAll('.chart-mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('cmbtn-' + mode);
  if (btn) btn.classList.add('active');

  const horizonYears = parseInt(document.getElementById('inp-horizon').value) || 35;
  const goalAmount   = parseFloat(document.getElementById('inp-goal-amount').value) || 0;

  if (mode === 'cards') {
    document.getElementById('chart-area').style.display  = 'none';
    document.getElementById('cards-area').style.display  = 'block';
    document.getElementById('chart-legend').style.display = 'none';
    renderCardsView(horizonYears);
  } else {
    document.getElementById('chart-area').style.display  = 'block';
    document.getElementById('cards-area').style.display  = 'none';
    document.getElementById('chart-legend').style.display = 'flex';
    renderChart(horizonYears, goalAmount);
  }
}

// ── Cards view ─────────────────────────────────────────────────────────
function renderCardsView(horizonYears) {
  const el = document.getElementById('cards-area');
  if (!el) return;
  const milestones = [1, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45].filter(y => y <= horizonYears);

  el.innerHTML = `<div class="sc-cards-grid">${
    _projections.filter(p => _activeScenarios.includes(p.key)).map(p => {
      const meta = SCENARIO_META.find(m => m.key === p.key);
      const rows = milestones.map(y => {
        const snap = p.data[y];
        return snap ? `<div class="cv-row">
          <span class="cv-year">${y} سنة (${new Date().getFullYear() + y})</span>
          <span class="cv-val" style="color:${meta.color}">${fmtShort(snap.value)}</span>
        </div>` : '';
      }).join('');
      return `<div class="sc-value-card" style="border-color:${meta.color}40">
        <div class="cv-header" style="color:${meta.color}">${meta.emoji} ${meta.name}
          <span style="font-weight:400;color:var(--text-2);font-size:0.72rem;margin-right:6px">${pct(p.scenario.capRate + p.scenario.divRate)} / سنة</span>
        </div>
        ${rows}
      </div>`;
    }).join('')
  }</div>`;
}

// ── Render chart ───────────────────────────────────────────────────────
function renderChart(horizonYears, goalAmount = 0) {
  const canvas = document.getElementById('forecast-chart');
  if (!canvas) return;
  if (_forecastChart) { _forecastChart.destroy(); _forecastChart = null; }

  const isBar = _chartMode === 'bar';
  const isLog = _chartMode === 'log';

  // وضع الأشرطة: نقاط المعالم فقط
  const barMilestones = [0, 1, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45].filter(y => y <= horizonYears);

  const startYear = new Date().getFullYear();
  const labels = isBar
    ? barMilestones.map(y => y === 0 ? String(startYear) : String(startYear + y))
    : Array.from({ length: horizonYears + 1 }, (_, i) => String(startYear + i));

  const tooltipShared = {
    rtl: true,
    textDirection: 'rtl',
    backgroundColor: '#1c2128',
    titleColor: '#e6edf3',
    bodyColor: '#c9d1d9',
    borderColor: '#30363d',
    borderWidth: 1,
    padding: 14,
    titleFont: { family: 'Tajawal', size: 14, weight: 'bold' },
    bodyFont:  { family: 'Tajawal', size: 14 },
    callbacks: {
      title: items => {
        const yr = items[0].label;
        const offset = +yr - startYear;
        return offset === 0
          ? `${yr} (الآن)`
          : `${yr} (بعد ${offset} سنة)`;
      },
      label: ctx => `  ${ctx.dataset.label}: ${fmt(ctx.raw)}`,
    },
  };

  const datasets = _projections
    .filter(p => _activeScenarios.includes(p.key))
    .map(p => {
      const meta = SCENARIO_META.find(m => m.key === p.key);
      const isHL = p.key === _activeHighlight;
      const values = isBar
        ? barMilestones.map(y => +p.data[Math.min(y, p.data.length - 1)].value.toFixed(0))
        : p.data.slice(0, horizonYears + 1).map(d => +d.value.toFixed(0));

      if (isBar) {
        return {
          label:           meta.name,
          data:            values,
          backgroundColor: meta.color + (isHL ? 'cc' : '55'),
          borderColor:     meta.color,
          borderWidth:     isHL ? 2 : 1,
          borderRadius:    4,
        };
      }
      return {
        label:            meta.name,
        data:             values,
        borderColor:      meta.color,
        backgroundColor:  isHL ? meta.color + '18' : 'transparent',
        borderWidth:      isHL ? 3 : 1.5,
        pointRadius:      0,
        pointHoverRadius: 5,
        tension:          0.35,
        fill:             isHL,
      };
    });

  // خط رأس المال المُضاف (مدخراتك الفعلية بدون عائد) + تظليل «منطقة الربح»
  // كل ما فوق هذا الخط = ربح فوق مالك (نمو سوق + توزيعات + منح). نظلّله أخضر
  // للسيناريو المميَّز (وأحمر لو نزل تحته = خسارة فعلية) ليرى المستخدم الفجوة بعينه.
  if (!isBar && _projections.length > 0) {
    const baseProj = _projections[0];  // yourCapital نفسه لكل السيناريوهات
    const capitalValues = baseProj.data.slice(0, horizonYears + 1).map(d => +d.yourCapital.toFixed(0));
    if (capitalValues[0] > 0) {        // أظهره دائماً ما دام لديك رأس مال (حتى لو ثابتاً)
      datasets.push({
        label:           '💰 رأس مالك المُضاف (أرضية)',
        data:            capitalValues,
        borderColor:     '#58a6ff',
        backgroundColor: 'transparent',
        borderWidth:     2,
        borderDash:      [6, 4],
        pointRadius:     0,
        pointHoverRadius: 4,
        tension:         0.1,
        fill:            false,
        order:           99,
      });
      // ظلّل الفجوة بين «مالك» و«السيناريو المميَّز» باللون الأخضر = ربحك فوق مالك.
      // ملاحظة: عند استهداف خط آخر (لا قيمة ثابتة) يتجاهل Chart.js above/below،
      // فنحدّد اللون عبر backgroundColor مباشرةً ليظهر التظليل فعلاً.
      const capIdx = datasets.length - 1;
      const hlName = SCENARIO_META.find(m => m.key === _activeHighlight)?.name;
      const hlDataset = datasets.find(d => d.label === hlName);
      if (hlDataset) {
        hlDataset.fill = { target: capIdx };
        hlDataset.backgroundColor = 'rgba(63,185,80,0.20)';
      }
    }
  }

  // خط الهدف (للخط فقط) — دلالة موحّدة مع مفتاح التضخم:
  // مفعّل  → الهدف بقوة شراء اليوم: يرتفع اسمياً بالتضخم ليتقاطع مع المنحنى الاسمي
  //          عند سنة الوصول الحقيقية نفسها التي يحسبها computeGoalYear.
  // مطفأ  → الهدف اسمي: خط أفقي ثابت بلا وسم «بقوة شراء اليوم».
  if (!isBar && goalAmount > 0 && _goalType === 'portfolio_value') {
    const inflOn   = document.getElementById('inp-inflation')?.checked;
    const goalInfl = inflOn ? readInflationRate() : 0;
    datasets.push({
      label:           `🎯 الهدف: ${fmtShort(goalAmount)}${inflOn ? ' (بقوة شراء اليوم)' : ''}`,
      data:            Array.from({ length: horizonYears + 1 }, (_, y) => Math.round(goalAmount * Math.pow(1 + goalInfl, y))),
      borderColor:     '#ff6b6b',
      backgroundColor: 'transparent',
      borderWidth:     2,
      borderDash:      [8, 5],
      pointRadius:     0,
      fill:            false,
      tension:         0,
    });
  }

  // ── plugin مخصص لرسم خط سنة التقاعد المستهدفة ────────────────
  const fireYear       = _hist?.fireGoal?.target_year;
  const fireYearOffset = fireYear > 0 ? fireYear - startYear : null;
  const retirementLinePlugin = (!isBar && fireYearOffset !== null && fireYearOffset > 0 && fireYearOffset <= horizonYears)
    ? [{
        id: 'retirementLine',
        afterDraw(chart) {
          const { ctx, chartArea } = chart;
          if (!chartArea) return;
          // تقدير موضع x بالنسبة المئوية (الأكثر ثباتاً مع Chart.js 4)
          const xRatio  = fireYearOffset / horizonYears;
          const xPixel  = chartArea.left + xRatio * (chartArea.right - chartArea.left);
          ctx.save();
          ctx.strokeStyle = 'rgba(240,180,41,0.75)';
          ctx.lineWidth   = 2;
          ctx.setLineDash([8, 4]);
          ctx.beginPath();
          ctx.moveTo(xPixel, chartArea.top);
          ctx.lineTo(xPixel, chartArea.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          // تسمية
          ctx.font      = 'bold 11px Tajawal, sans-serif';
          ctx.fillStyle = '#f0b429';
          ctx.textAlign = 'left';
          const lbl = `${fireYear} 🎯`;
          ctx.fillStyle = 'rgba(240,180,41,0.15)';
          const tw = ctx.measureText(lbl).width + 10;
          ctx.fillRect(xPixel + 3, chartArea.top, tw, 18);
          ctx.fillStyle = '#f0b429';
          ctx.fillText(lbl, xPixel + 7, chartArea.top + 13);
          ctx.restore();
        }
      }]
    : [];

  _forecastChart = new Chart(canvas, {
    type: isBar ? 'bar' : 'line',
    data: { labels, datasets },
    plugins: retirementLinePlugin,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: tooltipShared,
      },
      scales: {
        x: {
          grid:  { color: 'rgba(48,54,61,0.5)' },
          ticks: { color: '#8b949e', maxTicksLimit: isBar ? 20 : 10, font: { family: 'Tajawal', size: 11 } },
        },
        y: {
          type:  isLog ? 'logarithmic' : 'linear',
          grid:  { color: 'rgba(48,54,61,0.5)' },
          ticks: {
            color: '#8b949e',
            font:  { family: 'Tajawal', size: 11 },
            callback: v => fmtShort(v),
          },
        },
      },
    },
  });

  renderChartLegend();
}

function renderChartLegend() {
  const el = document.getElementById('chart-legend');
  if (!el) return;
  let html = _projections
    .filter(p => _activeScenarios.includes(p.key))
    .map(p => {
      const meta = SCENARIO_META.find(m => m.key === p.key);
      return `<div class="chart-legend-item">
        <div class="chart-legend-dot" style="background:${meta.color}"></div>
        <span style="color:${meta.color};font-weight:700">${meta.emoji} ${meta.name}</span>
      </div>`;
    }).join('');
  // مفتاح الخط الأزرق ومنطقة الربح الخضراء
  if (_chartMode !== 'bar') {
    html += `
      <div class="chart-legend-item">
        <div class="chart-legend-dot" style="background:#58a6ff"></div>
        <span style="color:#58a6ff;font-weight:700">💰 رأس مالك المُضاف</span>
      </div>
      <div class="chart-legend-item" title="كل ما فوق خط رأس مالك = ربح فوق مالك (نمو السوق + التوزيعات + المنح)">
        <div class="chart-legend-dot" style="background:rgba(63,185,80,0.45)"></div>
        <span style="color:#3fb950;font-weight:700">المنطقة الخضراء = ربحك فوق مالك</span>
      </div>`;
  }
  el.innerHTML = html;
}

function updateChartSubtitle(params) {
  const el = document.getElementById('chart-subtitle');
  if (!el) return;
  const parts = [];
  if (params.dcaPeriods && params.dcaPeriods.some(p => p.amount > 0)) {
    const dcaSummary = params.dcaPeriods
      .filter(p => p.amount > 0 && p.years > 0)
      .map(p => `${Number(p.amount).toLocaleString('ar-SA')}×${p.years}سنة`)
      .join('←');
    parts.push(`DCA: ${dcaSummary}`);
  }
  if (params.lumpSum > 0)        parts.push(`+ فوري ${fmt(params.lumpSum)}`);
  if (!params.reinvestDividends) parts.push('بدون إعادة استثمار الأرباح');
  if (params.adjustInflation)    parts.push(`معدّل للتضخم ${pct(params.inflationRate)}`);
  el.textContent = parts.length ? parts.join(' · ') : 'بدون إضافات';
}

// ── Milestone table ────────────────────────────────────────────────────
function renderMilestoneTable(horizonYears) {
  const tbody = document.getElementById('milestone-tbody');
  if (!tbody) return;

  const today      = new Date();
  const fireYear   = _hist?.fireGoal?.target_year || 0;
  const fireOffset = fireYear > 0 ? fireYear - today.getFullYear() : null;
  const showReal   = document.getElementById('inp-inflation')?.checked;
  const years      = Array.from({ length: horizonYears }, (_, i) => i + 1);

  tbody.innerHTML = years.map(y => {
    const calYear    = today.getFullYear() + y;
    const isHL       = (y % 5 === 0);
    // سنة التقاعد المستهدفة: تمييز خاص
    const isFireYear = (fireOffset !== null && y === fireOffset);
    const rowClass   = isFireYear
      ? ' class="milestone-hl" style="background:rgba(240,180,41,0.12);border-right:3px solid #f0b429"'
      : (isHL ? ' class="milestone-hl"' : '');

    const valueCells = SCENARIO_META.map((m, i) => {
      const snap   = _projections[i]?.data[y];
      const v      = snap?.value;
      const active = _activeScenarios.includes(m.key);
      const style  = active
        ? `color:${m.color};font-weight:${isHL || isFireYear ? '700' : '400'}`
        : 'color:var(--text-2);opacity:0.3';
      return `<td class="num" style="${style}">${v != null ? fmtShort(v) : '—'}</td>`;
    }).join('');

    const incomeCells = SCENARIO_META.map((m, i) => {
      const snap   = _projections[i]?.data[y];
      const active = _activeScenarios.includes(m.key);
      const style  = active
        ? `color:${m.color};font-weight:${isHL || isFireYear ? '700' : '400'}`
        : 'color:var(--text-2);opacity:0.3';
      // عرض الدخل الاسمي + الحقيقي (إذا مفعّل التضخم)
      let incomeHtml = '—';
      if (snap) {
        const nominal = snap.monthlyIncome;
        const real    = snap.monthlyIncomeReal;
        const differ  = showReal && Math.abs(nominal - real) > 10;
        incomeHtml = fmtShort(nominal);
        if (differ) incomeHtml += `<br><span style="font-size:.68rem;color:var(--text-muted)" title="القيمة الحقيقية بقوة شراء اليوم">${fmtShort(real)} ح</span>`;
      }
      return `<td class="num" style="${style}">${incomeHtml}</td>`;
    }).join('');

    const yearLabel = isFireYear
      ? `<strong>${y}</strong><span style="font-size:.65rem;background:#f0b429;color:#000;padding:1px 5px;border-radius:3px;margin-right:4px">🎯${fireYear}</span>`
      : `<strong>${y}</strong>`;

    return `<tr${rowClass}>
      <td>${yearLabel}</td>
      <td class="text-muted small">${calYear}</td>
      ${valueCells}
      ${incomeCells}
    </tr>`;
  }).join('') || '<tr><td colspan="8">—</td></tr>';
}

// ── Goal panel ─────────────────────────────────────────────────────────
function renderGoalPanel(horizonYears, goalAmount) {
  const card = document.getElementById('goal-result-card');
  const body = document.getElementById('goal-result-body');
  if (!card || !body) return;

  if (!goalAmount || goalAmount <= 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  const today    = new Date();
  // دلالة موحّدة مع مفتاح التضخم: مفعّل → الهدف بقوة شراء اليوم (خصم بالتضخم)،
  // مطفأ → الهدف اسمي (بلا خصم) — نفس معنى الخطة ومونتي كارلو.
  const inflOn   = document.getElementById('inp-inflation')?.checked;
  const inflRate = inflOn ? readInflationRate() : 0;
  const goalLabel = _goalType === 'monthly_income'
    ? `دخل شهري ${fmt(goalAmount)}`
    : `قيمة محفظة ${fmt(goalAmount)}`;

  const rows = SCENARIO_META.map(m => {
    const proj = _projections.find(p => p.key === m.key);
    const sc   = _scenarios.find(s  => s.key === m.key);
    if (!proj || !sc) return '';

    const goalYr  = computeGoalYear(proj.data, _goalType, goalAmount, inflRate);
    const reached = goalYr !== null && goalYr <= horizonYears;
    const snap    = reached ? proj.data[goalYr] : proj.data[proj.data.length - 1];

    const whenStr  = reached
      ? (goalYr === 0 ? '✨ متحقق الآن — الهدف مبلوغ اليوم'
                      : `${goalYr} سنة — عام ${today.getFullYear() + goalYr}`)
      : `لا تصل ضمن ${horizonYears} سنة`;

    return `<div class="goal-row ${reached ? 'goal-reached' : 'goal-missed'}">
      <div class="goal-row-head">
        <span class="goal-row-scenario" style="color:${m.color}">${m.emoji} ${m.name}</span>
        <span class="goal-row-status">${reached ? '✅' : '❌'}</span>
        <span class="goal-row-when ${reached ? 'text-success' : 'text-muted'}">${whenStr}</span>
      </div>
      ${snap ? `<div class="goal-row-detail small text-muted">
        القيمة عند الوصول: <strong>${fmt(snap.value)}</strong>
        &nbsp;·&nbsp; دخل شهري: <strong>${fmt(snap.monthlyIncome)}</strong>
        &nbsp;·&nbsp; القيمة الحقيقية (بعد تضخم): <strong>${fmt(snap.realValue)}</strong>
      </div>` : ''}
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="goal-header-label">
      الهدف المحدد: <strong class="text-accent">${goalLabel}</strong>
      <span class="small text-muted" style="font-weight:400">${inflOn
        ? `— مقيس بقوة شراء اليوم (مخصوم بتضخم ${pct(inflRate)})`
        : '— مقيس اسمياً (مفتاح التضخم مطفأ)'}</span>
    </div>
    <div class="goal-rows">${rows}</div>`;
}

// ── Scenario detail ────────────────────────────────────────────────────
function renderScenarioDetail(horizonYears) {
  const title = document.getElementById('scenario-detail-title');
  const body  = document.getElementById('scenario-detail-body');
  if (!body) return;

  const key  = _activeHighlight || 'base';
  const meta = SCENARIO_META.find(m => m.key === key);
  const proj = _projections.find(p => p.key === key);
  const sc   = _scenarios.find(s => s.key === key);
  if (!meta || !proj || !sc) return;

  if (title) title.innerHTML = `تفاصيل: <span style="color:${meta.color}">${meta.emoji} ${meta.name}</span>`;

  const end   = proj.data[horizonYears] || proj.data[proj.data.length - 1];
  const y5    = proj.data[Math.min(5,  horizonYears)];
  const y10   = proj.data[Math.min(10, horizonYears)];
  const y20   = proj.data[Math.min(20, horizonYears)];
  const start = proj.data[0]?.value || 1;

  // ── تفكيك القيمة النهائية ────────────────────────────────────────
  const endYourCap    = end?.yourCapital  || 0;
  const endDivCum     = end?.cumDiv       || 0;
  const endPriceGrow  = end?.priceGrowth  || 0;
  const endVal        = end?.value        || 0;
  const multiplier    = endYourCap > 0 ? endVal / endYourCap : 0;

  // سنة FIRE إذا كانت ضمن الأفق
  const fireYear   = _hist?.fireGoal?.target_year || 0;
  const fireOffset = fireYear > 0 ? fireYear - new Date().getFullYear() : null;
  const fireSnap   = (fireOffset !== null && fireOffset > 0 && fireOffset <= horizonYears)
    ? proj.data[Math.min(fireOffset, proj.data.length - 1)]
    : null;

  const items = [
    { val: pct(sc.capRate),                      lbl: 'نمو رأس المال / سنة' },
    { val: pct(sc.divRate),                      lbl: 'عائد الأرباح / سنة' },
    { val: pct(sc.capRate + sc.divRate),         lbl: 'إجمالي العائد / سنة' },
    { val: y5  ? fmt(y5.value)                  : '—', lbl: 'القيمة بعد 5 سنوات' },
    { val: y5  ? fmt(y5.monthlyIncome)          : '—', lbl: 'دخل شهري (5 سنوات)' },
    { val: y10 ? fmt(y10.value)                 : '—', lbl: 'القيمة بعد 10 سنوات' },
    { val: y10 ? fmt(y10.monthlyIncome)         : '—', lbl: 'دخل شهري (10 سنوات)' },
    { val: y20 ? fmt(y20.value)                 : '—', lbl: 'القيمة بعد 20 سنة' },
    { val: y20 ? fmt(y20.monthlyIncome)         : '—', lbl: 'دخل شهري (20 سنة)' },
    ...(fireSnap ? [
      { val: fmt(fireSnap.value),               lbl: `القيمة عند تقاعدك (${fireYear}) 🎯` },
      { val: fmt(fireSnap.monthlyIncome),        lbl: `الدخل الشهري عند ${fireYear} 🎯` },
      { val: fmt(fireSnap.monthlyIncomeReal),    lbl: `الدخل الحقيقي عند ${fireYear} (بقوة شراء اليوم)` },
    ] : []),
    { val: end  ? fmt(end.value)                : '—', lbl: `القيمة النهائية (${horizonYears} سنة)` },
    { val: end  ? fmt(end.monthlyIncome)        : '—', lbl: 'الدخل الشهري النهائي' },
    { val: end  ? fmt(end.monthlyIncomeReal)    : '—', lbl: 'الدخل الحقيقي النهائي (بقوة شراء اليوم)' },
    { val: end  ? fmt(end.realValue)            : '—', lbl: 'القيمة الحقيقية (بعد التضخم)' },
    { val: end  ? fmt(end.cumDiv)              : '—', lbl: 'إجمالي الأرباح الموزعة التراكمية' },
    // ── التفكيك: فلوسك مقابل نمو السوق
    { val: end  ? fmt(endYourCap)              : '—', lbl: '💰 رأس مالك المُضاف (مدخراتك الفعلية)' },
    { val: end && endDivCum > 0 ? fmt(endDivCum) : '—', lbl: '📈 أرباح معاد استثمارها (مجانية)' },
    { val: end  ? fmt(endPriceGrow)            : '—', lbl: '🚀 نمو السعر الصافي (عمل السوق لك)' },
    { val: end && multiplier > 0 ? `×${multiplier.toFixed(1)}` : '—', lbl: 'مضاعف رأس مالك (كل ريال أصبح ×N)' },
  ];

  body.innerHTML = items.map(i => `
    <div class="hist-item">
      <div class="h-val" style="color:${meta.color}">${i.val}</div>
      <div class="h-lbl">${i.lbl}</div>
    </div>`).join('');
}

// ── Goal type toggle ───────────────────────────────────────────────────
function setGoalType(type) {
  _goalType = type;
  document.getElementById('btn-goal-portfolio')?.classList.toggle('active', type === 'portfolio_value');
  document.getElementById('btn-goal-income')?.classList.toggle('active',    type === 'monthly_income');
  const label = document.getElementById('goal-amount-label');
  if (label) label.textContent = type === 'monthly_income'
    ? 'الدخل الشهري المستهدف (ر.س)'
    : 'قيمة المحفظة المستهدفة (ر.س)';
  const inp = document.getElementById('inp-goal-amount');
  if (inp) inp.placeholder = type === 'monthly_income' ? 'مثال: 20,000' : 'مثال: 1,000,000';
}

// ── تصدير CSV — ملف الحسبة الكامل ───────────────────────────────────────
function exportForecastCSV() {
  if (!_hist || !_projections.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  runForecast();   // ضمان تطابق الملف مع أحدث مدخلات

  const num   = n => (n == null || isNaN(n)) ? '' : Math.round(n);
  const pctv  = r => (r == null || isNaN(r)) ? '' : (r * 100).toFixed(2) + '%';
  const yesno = b => b ? 'نعم' : 'لا';

  const startValue   = parseFloat(document.getElementById('inp-current-value').value) || _hist.currentValue || 0;
  const lumpSum      = parseFloat(document.getElementById('inp-lump-sum').value) || 0;
  const horizonYears = parseInt(document.getElementById('inp-horizon').value)     || 35;
  const reinvest     = document.getElementById('inp-reinvest').checked;
  const inflation    = document.getElementById('inp-inflation').checked;
  const inflRate     = readInflationRate();
  const goalAmount   = parseFloat(document.getElementById('inp-goal-amount').value) || 0;
  const dcaPeriods   = getDcaPeriods();
  const occ          = scenarioOccurrenceProbs();

  const rows = [];
  const sec  = t => { rows.push([]); rows.push(['═══ ' + t + ' ═══']); };

  sec('معلومات عامة');
  rows.push(['تاريخ التصدير', todayISO()]);
  rows.push(['الأفق الزمني (سنوات)', horizonYears]);

  sec('المدخلات');
  rows.push(['القيمة الحالية للمحفظة', num(startValue)]);
  rows.push(['دفعة مقطوعة (فورية)', num(lumpSum)]);
  rows.push(['إعادة استثمار التوزيعات', yesno(reinvest)]);
  rows.push(['تعديل التضخم في العرض', yesno(inflation)]);
  rows.push(['معدل التضخم المستخدم', pctv(inflRate)]);
  rows.push(['عائد التوزيع المستخدم', pctv(_scenarios[1]?.divRate)]);
  if (goalAmount > 0) rows.push(['الهدف (' + (_goalType === 'monthly_income' ? 'دخل شهري' : 'قيمة محفظة') + ' — بقوة شراء اليوم)', num(goalAmount)]);
  rows.push(['فترات الإضافة الشهرية (DCA):']);
  if (dcaPeriods.length) dcaPeriods.forEach((p, i) => rows.push(['  فترة ' + (i + 1), 'المبلغ/شهر: ' + num(p.amount), 'لمدة (سنوات): ' + p.years]));
  else rows.push(['  (لا توجد)']);

  sec('البيانات التاريخية المستخرجة من محفظتك');
  rows.push(['القيمة السوقية الحالية', num(_hist.currentValue)]);
  rows.push(['التكلفة الأساسية', num(_hist.costBasis)]);
  rows.push(['XIRR (العائد الداخلي الحقيقي)', _hist.xirr != null ? _hist.xirr.toFixed(2) + '%' : '—']);
  rows.push(['نمو رأس المال المستخدم (مُمزوج بتاسي)', pctv(_hist.blendedCapGrowth)]);
  rows.push(['نمو رأس المال الخام (أداؤك)', pctv(_hist.annCapGrowth)]);
  rows.push(['عائد الأرباح السنوي', pctv(_hist.safeDivYield)]);
  rows.push(['متوسط الأرباح السنوية', num(_hist.avgAnnualDiv)]);
  rows.push(['إجمالي الأرباح المتراكمة', num(_hist.totalDivAll)]);
  rows.push(['متوسط الإضافة الشهرية التاريخية', num(_hist.avgMonthlyDeposit)]);
  rows.push(['عدد الأسهم', _hist.holdingsCount]);
  rows.push(['درجة ثقة البيانات', (_hist.confidenceScore || 0) + '%']);

  sec('السيناريوهات (معدّلات سنوية واحتمال الحدوث وفق تاسي)');
  rows.push(['السيناريو', 'نمو رأس المال', 'عائد الأرباح', 'إجمالي العائد', 'احتمال الحدوث', 'تقييم من 10']);
  SCENARIO_META.forEach((m, i) => {
    const s = _scenarios[i], p = occ.probs[i];
    rows.push([m.name, pctv(s.capRate), pctv(s.divRate), pctv(s.capRate + s.divRate), p + '%', Math.round(p / 10)]);
  });
  rows.push(['احتمال نتيجة أسوأ من «المتحفظ»', occ.below + '%']);

  sec('الإسقاط السنوي (القيم اسمية ما لم يُذكر «حقيقية»)');
  const head = ['السنة', 'العام'];
  SCENARIO_META.forEach(m => { head.push(m.name + ' — القيمة'); head.push(m.name + ' — الدخل الشهري'); head.push(m.name + ' — القيمة الحقيقية'); });
  head.push('رأس مالك المُضاف');
  rows.push(head);
  for (let y = 1; y <= horizonYears; y++) {
    const r = [y, _hist.currentYear + y];
    SCENARIO_META.forEach((m, i) => {
      const snap = _projections[i]?.data[y];
      r.push(snap ? num(snap.value) : '');
      r.push(snap ? num(snap.monthlyIncome) : '');
      r.push(snap ? num(snap.realValue) : '');
    });
    const cap = _projections[0]?.data[y];
    r.push(cap ? num(cap.yourCapital) : '');
    rows.push(r);
  }

  exportCSV(`رؤية_مستقبلية_${todayISO()}.csv`, ['الرؤية المستقبلية — ملف الحسبة الكامل'], rows);
  showToast('✓ تم تصدير ملف الحسبة الكامل', 'success');
}

// ── Formatting ─────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('ar-SA', { maximumFractionDigits: 0 }) + ' ر.س';
}

function fmtShort(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' مليار';
  if (n >= 1e6) return (n / 1e6).toFixed(2)  + ' م';
  if (n >= 1e3) return (n / 1e3).toFixed(1)  + ' ألف';
  return n.toFixed(0);
}

function pct(r) {
  if (r == null || isNaN(r)) return '—';
  return (r * 100).toFixed(2) + '%';
}

// ── Boot ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
