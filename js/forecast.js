/* =====================================================================
   forecast.js — الرؤية المستقبلية
   محرك إسقاط شهري دقيق — ثلاثة سيناريوهات — أداء تاريخي فعلي
   ===================================================================== */
'use strict';

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
// نسبة سنوات الخسارة وأسوأ سنتين — من المصفوفة نفسها لا من نصّ مكتوب
function _tasiLossShareTxt() {
  try {
    const r = _tasiAnnualReturns();
    if (!r || !r.length) return 'جزء من سنوات تاسي كانت خسارة';
    const neg = r.filter(x => x < 0);
    const worst = [...r].sort((a, b) => a - b).slice(0, 2)
      .map(v => (v * 100).toFixed(1) + '%');
    return `${(neg.length / r.length * 100).toFixed(0)}% من سنوات تاسي المرصودة `
         + `(${neg.length} من ${r.length}) كانت خسارة، أسوأها ${worst.join(' و')}`;
  } catch (_) { return 'جزء من سنوات تاسي كانت خسارة'; }
}

// ⚠️ موضع هذا الثابت **قبل** `window.CARD_INFO` مقصود ولا يُنقَل:
// `CARD_INFO` كائنٌ حرفيّ يُبنى وقت التحليل، وقالبه ينادي
// `_tasiLossShareTxt()` فوراً، وهي تقرأ `TASI_PRICE_YE`. وحين كان
// التعريف أسفل الملف كانت القراءة تقع في المنطقة الميتة (TDZ)
// فترمي ReferenceError يبتلعها `try/catch` — فتُعرض **دائماً** الجملة
// الاحتياطية العامة التي يحذّر التعليق نفسه من تثبيتها نصّاً.

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

window.CARD_INFO = {
  'scenarios': {
    title: '🔮 السيناريوهات الثلاثة',
    // ⚠️ الأرقام تُشتقّ من `_tasiAnnualReturns()` لا تُثبّت نصّاً. كان النصّ
    // يقول «30% من سنوات تاسي خسارة» والفعلي من المصفوفة **35%**،
    // و«−57% في 2008» والفعلي **−55.2%** (لأن المصفوفة تستعمل آخر إغلاق
    // أسبوعي لا إغلاق نهاية السنة). رقمٌ مكتوب يجمد، والمصدر يتحرّك.
    body: `
      <p>بدل توقّع رقم واحد للمستقبل (وهمٌ مستحيل)، نعرض ثلاثة مسارات للنمو <strong>أساسها معيار تاسي</strong> (نمو سعري ~4.4% للفترة الحديثة 2010-2024، + توزيعاتك).</p>
      <div class="info-math">
        • <strong>متحفّظ:</strong> الطرف المنخفض للسوق ~2.4% سعري (ارتداد للمتوسط — كامل دورة تاسي).<br>
        • <strong>معتدل:</strong> معيار تاسي مُعدَّلاً بوزن <em>صغير ومسقوف</em> من أدائك الشخصي.<br>
        • <strong>متفائل:</strong> مسقوف بـ<strong>أعلى نافذة سعرية حدثت فعلاً</strong> في تاريخ تاسي على 10–20 سنة — محسوبة من البيانات لا مُرقّمة يدوياً.
      </div>
      <p><strong>لماذا وزن أدائك صغير؟</strong> أداؤك مشتقّ من XIRR على عيّنة قصيرة، وتذبذب تاسي السنوي ~32% يجعل الخطأ المعياري لعائد سنة واحدة ~32 نقطة مئوية — أي أن الرقم شبه كله ضجيج. نستخدم <strong>مُقدِّر انكماش</strong> (Bühlmann): وزنك = العمر ÷ (العمر + 41)، مسقوفاً عند 25%. أداؤك يبقى معروضاً كـ<strong>تشخيص</strong> (هل أنت أعلى أم أدنى من السوق) لا كتنبؤ.</p>
      <p class="info-note">⚠️ الأعداد على الكروت (<strong>X من N نافذة</strong>) هي <strong>تكرارات لما حدث</strong>، لا احتمالات لما سيحدث: النوافذ متداخلة ومبنية على 21 ملاحظة سنوية فقط، فالعيّنة المستقلة ≈ واحدة ودقّة النسبة ±6 نقاط. والثلاثة كلها تفترض نمواً موجباً بينما <strong>${_tasiLossShareTxt()}</strong> — انظر شريحة «أسوأ من المتحفظ» لمعرفة أين ذهبت بقيّة النوافذ.</p>`
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
      <p>تخيّل إنك تقدر تعيش مستقبلك المالي <strong>10,000 مرة</strong>، كل مرة السوق يتصرّف بشكل مختلف. هذي الأداة تسوّي بالضبط كذا: تجرّب خطّتك 10,000 مرة بعوائد سنوية حقيقية من تاريخ تاسي (2004–2024، فيه سنوات ذهبية وسنوات انهيار).</p>
      <div class="info-math">
        • <strong>① نسبة بلوغ الهدف:</strong> من كل 100 مستقبل، كم واحد بلغ هدفك <em>في سنة التقاعد</em>؟<br>
        • <strong>② نسبة بقاء المحفظة:</strong> من كل 100 مستقبل، كم واحد <em>لم تنفد محفظته</em> حتى نهاية التقاعد؟ ← <strong>هذا هو المقياس التقاعدي الحقيقي</strong>.<br>
        • <strong>«لو حظّك سيّئ»:</strong> نتيجة تقع في أسوأ 10 من كل 100. • <strong>«الأكثر توقّعاً»:</strong> المنتصف تماماً.
      </div>
      <p><strong>ثلاثة قرارات منهجية تخصّ الدقة:</strong></p>
      <div class="info-math">
        • <strong>بذرة ثابتة:</strong> المولّد العشوائي مبذور من مدخلاتك نفسها، فنفس المدخلات تعطي <em>نفس النتيجة بالضبط</em> في كل تشغيل. بلا ذلك كان p10 يتأرجح ±4% (≈±170 ألف ريال) بين تشغيلين متطابقين.<br>
        • <strong>كتل 4 سنوات (block bootstrap):</strong> نسحب كتلاً متتابعة من التاريخ لا سنوات مبعثرة، لأن السحب المستقل يهمل ارتداد المتوسط فيوسّع الذيول بلا مبرر (النطاق كان أوسع 2.8 مرة).<br>
        • <strong>ضخ شهري:</strong> إضافتك تُطبَّق شهرياً تماماً كما في الإسقاط الأساسي (كانت تُضاف سنوياً دفعة واحدة فينحاز الوسيط −3% إلى −4.5%).
      </div>
      <p class="info-note">💡 <strong>ليش الأداة مهمة؟</strong> السيناريوهات العادية تفترض أن السوق يعطيك نفس العائد كل سنة — وهذا وهم. وانهيار السوق <strong>قرب تقاعدك</strong> أخطر من انهيار وأنت شاب (خطر تتابع العوائد). <strong>ولا يُختبَر هذا الخطر إلا إذا فعّلت «مرحلة السحب»</strong> — بدونها المحاكاة تتوقف عند التقاعد ولا تسحب ريالاً.</p>
      <p class="info-note">📉 <strong>خطر التوزيع مُنمذَج الآن (م.5):</strong> كانت المحاكاة تفترض توزيعك <em>مؤكَّداً إلى الأبد</em> وتُنمذج خطر السعر وحده — أي أنها تختبر كل شيء عدا الخطر الوحيد الذي يهدّد هدفك، ولهذا كانت «نسبة البقاء» تخرج ~99% شبه حتمية. الآن: التوزيع ينمو بـ<strong>2.76%</strong> (م.7) ويُقصّ في سنة هبوط السوق بجزء من نسبة الهبوط، ثم <strong>يتعافى نصف الفجوة كل سنة</strong> — لأن القصّ حدثٌ لا حالة دائمة.<br>
      <strong>ونسبة القصّ مُدخَل مُعلَن لا رقم مدسوس:</strong> فُحصت بيانات تداول لديك فوجدت ستّ أزواج سنوات صالحة فقط، إحداها برمز واحد، وخمسٌ منها في فترة تعافٍ (+44% في 2024) — عيّنة كهذه تجعل المحاكاة <em>أكثر تفاؤلاً</em> لا أصدق، فلم تُشتقّ منها (م.20).</p>
      <p class="info-note">⚠️ <strong>ماذا يُحرّك الرقمين فعلاً:</strong> «نسبة البقاء» تكاد لا تتأثّر بخطر التوزيع (99.4% ← 99.0%) لأن السحب يُموَّل من <em>العائد الكلي</em> لا من التوزيع وحده. الأثر يظهر في <strong>الدخل</strong>: احتمال بلوغ 6,000 ر.س/شهر ينزل من 97.8% إلى 96.1% (معتدل) و93.5% (متشدّد)، ووسيط الدخل ينزل 7%–12%. وهدف م.4 يُقاس بالدخل لا ببقاء المحفظة.</p>
      <p class="info-note">🫧 <strong>تناقض مقصود ومُعلَن:</strong> سنة 2005 (+104%) مستبعدة من نوافذ بطاقة السيناريوهات لكنها داخل وعاء السحب هنا. الاستبعاد هناك يخصّ <em>نقاط الدخول</em> (البدء من قمة فقاعة يشوّه إحصاء النوافذ)، أما هنا فالسحب عشوائي داخل مسار طويل وحذف الصعود الحاد وحده يبتر ذيل التوزيع الأيمن.</p>`
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
    <input type="number" class="dca-amount" placeholder="المبلغ / شهر — الدستور: ${MONTHLY_INJECTION} (م.7)" value="${amount || ''}" min="0" step="100" oninput="debouncedDcaInput()">
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

// ══════════════════════════════════════════════════════════════════════
// جدول الضخّ الشهري — يبدأ من **تاريخ بدء الضخّ** لا من اليوم
// ----------------------------------------------------------------------
// م.7 تحدّد بداية الضخّ المنتظم بيناير 2027، والثابت `INJECTION_START`
// معرَّف في الدستور — وكان **ميتاً**: لا قارئ له خارج ملف اختبار. والجدول
// يبدأ من الشهر صفر أي **اليوم**، فيُحتسب ضخٌّ في الأشهر الفاصلة لن يقع.
// من 2026-08 إلى 2027-01 = خمسة أشهر × 8,000 = 40,000 ر.س وهمية، تصير
// نحو 285,000 بالتركيب حتى 2055 — على إسقاطٍ يقود قرار التقاعد كلّه.
// الأشهر السابقة للبدء تبقى أصفاراً، والفترات تُزاح ولا تُقصّ.
// ══════════════════════════════════════════════════════════════════════
function _monthsUntilInjectionStart() {
  if (typeof INJECTION_START !== 'string') return 0;
  const start = parseDateLocal(INJECTION_START);
  if (!start) return 0;
  const now = new Date();
  const months = (start.getFullYear() - now.getFullYear()) * 12
               + (start.getMonth() - now.getMonth());
  return Math.max(0, months);
}

function buildDcaSchedule(periods, totalMonths) {
  const schedule = new Array(totalMonths).fill(0);
  let cursor = _monthsUntilInjectionStart();   // أشهر ما قبل البدء تبقى صفراً
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

  // AUDIT-FIX 2026-08-21 (#28): كانت العوامل دوالَّ درجية فتتجمّد شهوراً ثم تقفز —
  // نفس العلّة التي أُصلحت في بطاقة الأرباح (dividends.js). الآن استيفاء خطّي بين
  // نفس نقاط المعايرة السابقة حرفياً: القيمة عند كل نقطة مفصلية لم تتغيّر، لكنها
  // تتحرّك كل شهر بينها. تنبيه: عامل التنويع هنا هو **عدد الأسهم** بينما بطاقة
  // صفحة الأرباح تستعمل **تغطية الدخل المتوقَّع** — فرق مقصود ومُعلَن، لذلك
  // البطاقتان تحملان اسمين مختلفين ولا تدّعيان قياس الشيء نفسه.
  const _lerp = (x, pts) => {
    if (x <= pts[0][0]) return pts[0][1];
    const last = pts[pts.length - 1];
    if (x >= last[0]) return last[1];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
    }
    return last[1];
  };

  // العامل 1: عمر رأس المال الفعلي — لا التقويمي (وزن 45%)
  const agePct = _lerp(months, [[0,0.05],[3,0.20],[6,0.32],[9,0.45],[12,0.62],[18,0.76],[24,0.88],[36,1.00]]);

  // العامل 2: دورات الأرباح الفعلية المسقّفة بعمر المحفظة (وزن 35%)
  const divPct = _lerp(divYears, [[0,0.05],[1,0.45],[2,0.72],[3,0.95]]);

  // العامل 3: عدد الأسهم / التنويع (وزن 20%)
  const holdPct = _lerp(holdingsCount, [[0,0.40],[3,0.65],[6,0.82],[10,0.95]]);

  const score = Math.round(agePct * 45 + divPct * 35 + holdPct * 20);
  return { score, agePct, divPct, holdPct, divYears };
}

// ── معيار تاسي طويل المدى (نمو سعري فقط) ──────────────────────────────
// مشتق من أداء مؤشر تاسي الفعلي 2005-2024 (المصدر: Saudi Exchange / Wikipedia):
//   • CAGR سعري للفترة كاملة ≈ 1.95% (تشمل انهياري 2006 −52% و2008 −57%)
//   • CAGR سعري 2010-2024 (تاسي الحديثة) ≈ 4.4%  ← نعتمده كمعيار السوق
//   • توزيعات تاسي ~3.5% سنوياً
const MARKET_CAP_BENCHMARK = 0.044;

// ══════════════════════════════════════════════════════════════════════
// وزن أداء المالك في المزج — مُقدِّر انكماش (shrinkage / Bühlmann credibility)
// ──────────────────────────────────────────────────────────────────────
// المشكلة التي يعالجها: annCapGrowth مشتقّ من XIRR على عيّنة قصيرة، وهو
// «ضجيج مُسنّى» لا تقدير. تذبذب تاسي السنوي ≈32%، فالخطأ المعياري لمتوسط
// n سنة = 0.32/√n — عند n=1 يساوي 32 نقطة مئوية، أي أن الرقم كله ضجيج تقريباً.
//
// الصيغة المعتمدة (مصداقية Bühlmann):   w = n / (n + k)
//   n = عمر رأس المال الفعلي بالسنوات (المرجَّح بالتدفقات — لا التقويمي)
//   k = (σ_ضجيج / σ_مهارة)² = (0.32 / 0.05)² ≈ 41
//       σ_ضجيج  = تذبذب تاسي السنوي 32%
//       σ_مهارة = التشتّت المعقول للأداء الحقيقي طويل المدى بين المحافظ ≈5%
//       (سخيّ لصالح المالك؛ الأدبيات تعطي 2–4% فتنتج وزناً أصغر)
//
// النتيجة: 2.4% عند سنة · 10.9% عند 5 سنوات · 25% (السقف) عند ~14 سنة.
// لماذا السقف 25%؟ لأن أي محفظة مركّزة في سوق واحد تبقى عيّنتها المستقلة
// صغيرة مهما طال الزمن (دورة تاسي الواحدة ~7 سنوات)، فإعطاء الأداء الشخصي
// أكثر من الربع يعيد إنتاج نفس الخطأ الذي أُصلح هنا.
//
// (البديل المطروح w = min(0.25, n/20) يعطي 5% عند سنة — يجتاز اختبار الاستقرار
//  أيضاً، لكنه يعطي 25% عند 5 سنوات وهو ما لا تسنده الأخطاء المعيارية أعلاه.)
const PERF_BLEND_K       = 41;    // معامل المصداقية (سنوات مكافئة من الضجيج)
const PERF_BLEND_MAX_W   = 0.25;  // سقف وزن الأداء الشخصي

// وزن الأداء الشخصي حسب عمر رأس المال الفعلي بالسنوات
function personalPerfWeight(cwYears) {
  const n = Math.max(0, +cwYears || 0);
  return Math.min(PERF_BLEND_MAX_W, n / (n + PERF_BLEND_K));
}

// وصف كل سيناريو يُبنى ديناميكياً من معدّله المحسوب فعلاً (انظر _scenarioDesc)
// — لا نصوص ثابتة تقول «~7%» بينما المعروض 12%.
const SCENARIO_META = [
  { key:'conservative', name:'متحفظ',    emoji:'🛡️', cls:'sc-conservative', color:'#8b949e' },
  { key:'base',         name:'معتدل',    emoji:'📊', cls:'sc-base',         color:'#3fb950' },
  { key:'optimistic',   name:'متفائل',   emoji:'🚀', cls:'sc-optimistic',   color:'#f0b429' },
];

// وصف السيناريو مبنيّ على معدّله الفعلي المحسوب + موقعه بين نوافذ تاسي
// ═════════════════════════════════════════════════════════════════════
// إجمالي العائد الفعّال — كما يُركّبه المحرّك لا جمعاً بسيطاً
// ----------------------------------------------------------------------
// البطاقة والجدول وتفاصيل السيناريو كانت تعرض `capRate + divRate`،
// والمحرّك يطبّق النمو والتوزيع **ضربياً وشهرياً**:
//     value *= (1 + نمو/12)  ثم  div = value × توزيع/12  ثم إعادة استثمار
//
// مصدرا الفجوة: الحدّ التقاطعي (cap × div) + تركيب التوزيع شهرياً.
// قياس: نمو 4.4% + توزيع 5.5% ⇒ المعروض **9.90%** والفعلي **10.29%**،
// وعلى 35 سنة الفرق **13.2%** في القيمة النهائية (7,085,200 مقابل 6,261,049).
// فالصفحة كانت تعرض معدّلاً ومساراً لا يتّفقان.
//
// ⚠️ **المحرّك لا يُمسّ** — هو الأدقّ. المعروض وحده صار يطابقه.
// ═════════════════════════════════════════════════════════════════════
function effectiveTotalRate(capRate, divRate) {
  const c = +capRate || 0, d = +divRate || 0;
  return (1 + c) * Math.pow(1 + d / 12, 12) - 1;
}

function _scenarioDesc(key, sc, occ, i) {
  if (!sc) return '';
  const cap = pct(sc.capRate), div = pct(sc.divRate), tot = pct(effectiveTotalRate(sc.capRate, sc.divRate));
  const perc = occ?.percentiles?.[i];
  const percTxt = perc != null ? ` — يقع في المئين ${perc} من نوافذ تاسي الطويلة` : '';
  if (key === 'conservative')
    return `الطرف المنخفض للسوق (ارتداد للمتوسط): نمو سعري ${cap} + توزيعات ${div} = ${tot} إجمالاً${percTxt}. ليس سيناريو خسارة.`;
  if (key === 'optimistic') {
    const bound = _scenarios[1] && Math.abs(sc.capRate - _scenarios[1].capRate) < 1e-9;
    return `أفضل ما سجّله تاسي فعلاً على نوافذ 10–20 سنة: نمو سعري ${cap} + توزيعات ${div} = ${tot} إجمالاً${percTxt}. مسقوف بأعلى نافذة حقيقية — لا برقم متخيَّل.`
      + (bound ? ' ⚠️ لاحظ: نموّك الأساسي بلغ أو تجاوز أعلى نافذة في تاريخ تاسي، فلا مجال لسيناريو أعلى مُسنَد بالتاريخ.' : '');
  }
  return `الأساس معيار تاسي ${pct(MARKET_CAP_BENCHMARK)} مُعدَّلاً بوزن صغير من أدائك الشخصي: نمو سعري ${cap} + توزيعات ${div} = ${tot} إجمالاً${percTxt}.`;
}

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

// أعلى/أدنى نافذة فعلية في تاريخ تاسي — تُحسب من tasiLongRunCAGRs() ولا تُرقَّم يدوياً
function tasiWindowExtremes() {
  const c = tasiLongRunCAGRs();
  if (!c.length) return { max: MARKET_CAP_BENCHMARK, min: 0, n: 0 };
  return { max: Math.max(...c), min: Math.min(...c), n: c.length };
}

// الموقع المئيني لمعدّل ما ضمن نوافذ تاسي الطويلة (يتحرك بسلاسة بلا قفزات تصنيف)
function tasiPercentileOf(rate) {
  const c = tasiLongRunCAGRs();
  if (!c.length) return null;
  const below = c.filter(x => x < rate).length;
  const equal = c.filter(x => x === rate).length;
  return Math.round(((below + equal / 2) / c.length) * 100);
}

// ══════════════════════════════════════════════════════════════════════
// تكرار تاريخي — لا «احتمال»
// ──────────────────────────────────────────────────────────────────────
// نعدّ كم نافذة من نوافذ تاسي الطويلة وقع نموّها السعري في «جوار» معدّل كل
// سيناريو (حدود عند منتصف المسافة بين المعدّلات المتجاورة)، ونعيد:
//   counts      = العدد الخام لكل سيناريو (لا نسبة موحية بدقة غير موجودة)
//   below       = عدد النوافذ الأسوأ من المتحفظ (كان يُحسب ولا يُعرض)
//   percentiles = الموقع المئيني لمعدّل كل سيناريو — يتحرك بسلاسة
//   windows     = حجم العيّنة، precision = دقة النسبة الواحدة (100/N نقطة)
// ⚠️ النوافذ متداخلة: 16 نافذة مبنية على 21 ملاحظة سنوية فقط، فعدد الملاحظات
//    المستقلة فعلياً ≈ 1–2. الرقم وصف لما حدث، لا احتمال لما سيحدث.
// ══════════════════════════════════════════════════════════════════════
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
    counts:      cnt.slice(),
    probs:       cnt.map(x => Math.round(x / N * 100)),   // يبقى للتصدير CSV
    belowCount:  below,
    below:       Math.round(below / N * 100),
    percentiles: caps.map(c => tasiPercentileOf(c)),
    windows:     N,
    precision:   +(100 / N).toFixed(1),                    // دقة النسبة الواحدة بالنقاط
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
    syncPlanHorizonFromGlobal();   // خانة أفق الخطة تبدأ متبعةً للأفق العام
    await loadForecastPlans();
    renderForecastPlans();
  } catch (e) {
    console.error('forecast init error:', e);
    showToast('خطأ في تحميل بيانات المحفظة', 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════
// 💵 الدخل التوزيعي المتوقَّع (Forward Projected Income) — نسخة محلّية
// ──────────────────────────────────────────────────────────────────────
// 🔗 ربط إجباري: هذا المنطق منسوخ حرفياً من `_projectedAnnualIncome()` في
//    js/dividends.js (الدوال المساعدة: _divSortDate / _sharesAtDate / كشف
//    الدورية بوسيط الفجوات / DPS = مجموع آخر 12 شهراً / استبعاد المنقطع
//    بعتبة 1.75× الدورة). صفحة الرؤية المستقبلية لا تُحمّل dividends.js،
//    فلا يمكن الاستيراد — لذا **أي تعديل هناك يجب أن يُطبَّق هنا حرفياً**
//    وإلا انحرف «الدخل المتوقَّع» بين الصفحتين.
// ══════════════════════════════════════════════════════════════════════

// تحويل سجل أرباح إلى تاريخ قابل للمقارنة (date وإلا year+month)
function _fwdDivSortDate(d) {
  if (d.date) return d.date;
  const yr = d.year || new Date().getFullYear();
  const mo = String(d.month || 1).padStart(2, '0');
  return `${yr}-${mo}-01`;
}

// خريطة {رمز → معاملات مرتّبة} تُبنى مرة واحدة (تجنّب O(N×M))
function _fwdBuildTxMap(txRows) {
  const map = {};
  txRows.forEach(t => {
    if (!t.ticker || !t.date) return;
    (map[t.ticker] = map[t.ticker] || []).push(t);
  });
  Object.values(map).forEach(rows =>
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
  return map;
}

// عدد الأسهم المملوكة لرمز في تاريخ معيّن (المنحة تزيد الأسهم كالشراء)
function _fwdSharesAtDate(txMap, ticker, dateStr) {
  const cutoff = parseDateLocal(dateStr);
  if (!cutoff) return 0;
  let shares = 0;
  for (const t of (txMap[ticker] || [])) {
    if (parseDateLocal(t.date) > cutoff) break;   // مرتّبة — خروج مبكر
    if (t.type === 'buy' || t.type === 'grant') shares += +t.shares;
    // القصّ عند كل بيع لا في النهاية — «شراء 100 → بيع 150 → شراء 30»
    // تساوي 30 سهماً لا صفراً (نفس منهج walkWAC في utils.js)
    else if (t.type === 'sell') shares = Math.max(0, shares - (+t.shares || 0));
  }
  return Math.max(0, shares);
}

function forecastProjectedAnnualIncome(holdingRows, divRows, txRows) {
  const breakdown = [];
  let total = 0;
  const txMap = _fwdBuildTxMap(txRows || []);
  const heldTickers = new Set((holdingRows || []).map(h => h.ticker));

  heldTickers.forEach(ticker => {
    const holding = (holdingRows || []).find(h => h.ticker === ticker);
    if (!holding || +holding.shares <= 0) return;

    const tickerDivs = (divRows || [])
      .filter(d => d.ticker === ticker)
      .sort((a, b) => _fwdDivSortDate(a).localeCompare(_fwdDivSortDate(b)));
    if (!tickerDivs.length) return;

    // الدورية = وسيط الفجوات الزمنية بين الدفعات (محصّن ضد دفعة مفقودة)
    // AUDIT-FIX 2026-08-22: التعريف الموحَّد في utils.js — بحارس يمنع قلب موزّع
    // سنوي إلى «شهري» بسبب تسجيلين متقاربين (النسخة السادسة من هذا المنطق).
    const freq = inferDividendFrequency(tickerDivs.map(_fwdDivSortDate));
    const freqLabel = freq === 12 ? 'شهري' : freq === 4 ? 'ربع سنوي' : freq === 2 ? 'نصف سنوي' : 'سنوي';

    // سلسلة DPS لكل دفعة كان المالك يملك أسهماً عندها
    let lastValidShares = 0, lastValidDate = null, lastValidAmt = 0;
    const dpsSeries = [];
    for (let i = 0; i < tickerDivs.length; i++) {
      const dt = _fwdDivSortDate(tickerDivs[i]);
      const sh = _fwdSharesAtDate(txMap, ticker, dt);
      if (sh >= 0.001) {
        dpsSeries.push({ dps: +tickerDivs[i].amount / sh, date: dt });
        lastValidShares = sh; lastValidDate = dt; lastValidAmt = +tickerDivs[i].amount;
      }
    }


    // م.22 — إعادة بيان المنحة قبل جمع نافذة الاثني عشر شهراً.
    // بلا هذا: البسط بأساس ما قبل المنحة والمقام بأسهم اليوم ⇒ سابقة
    // الرياض 1:3 تعطي 1,866 ر.س بدل 1,400 (+33%) على دخلٍ لم يتغيّر.
    applyGrantRestatement(dpsSeries, grantRestateFactors(
      (txMap[ticker] || []).filter(x => x.type === 'grant'),
      d => _fwdSharesAtDate(txMap, ticker, d)));

    // DPS السنوي المتوقَّع = مجموع DPS آخر 12 شهراً (قرار المالك 2026-08)
    let dps, lastDivDate, sharesAtRefDiv, usedFallback = false, dpsTrend = 'ttm';
    if (dpsSeries.length) {
      // AUDIT-FIX (2026-08-18): النسخة الثالثة من هذا المنطق، وقد فاتها إغلاق
      // النافذة عند اليوم (أُصلحت في dashboard.js و dividends.js و decision-*.js).
      // التوزيع المُعلَن بتاريخ صرف قادم كان يدخل «آخر 12 شهراً» قبل استلامه فينتفخ
      // عائد التوزيعات، ومنه إلى كل السيناريوهات ومسارات مونتي كارلو.
      const cutoff = Date.now() - 365 * 86400000, nowTs = Date.now();
      const ttmDps = dpsSeries
        .filter(p => { const t = parseDateLocal(p.date).getTime(); return t >= cutoff && t <= nowTs; })
        .reduce((s, p) => s + p.dps, 0);
      if (ttmDps > 0) {
        dps = ttmDps / freq;                       // يُضرب بـ freq لاحقاً → المجموع كما هو
      } else {
        dps = dpsSeries.slice(-freq).reduce((s, p) => s + p.dps, 0) / freq;
        dpsTrend = 'last-cycle';
      }
      lastDivDate = lastValidDate;
      sharesAtRefDiv = lastValidShares;
    } else {
      // اشترى السهم بعد كل التوزيعات المسجّلة → نقدّر من آخر سنة مكتملة
      const lastDiv = tickerDivs[tickerDivs.length - 1];
      lastDivDate   = _fwdDivSortDate(lastDiv);
      const curYear = new Date().getFullYear();
      const yearOf  = d => +d.year || new Date(_fwdDivSortDate(d)).getFullYear();
      const completeYears = tickerDivs.map(yearOf).filter(y => y < curYear);
      if (completeYears.length) {
        const lastFullYear  = Math.max(...completeYears);
        const fullYearTotal = tickerDivs.filter(d => yearOf(d) === lastFullYear)
          .reduce((s, d) => s + +d.amount, 0);
        dps = fullYearTotal > 0
          ? fullYearTotal / +holding.shares / freq
          : +lastDiv.amount / +holding.shares;
      } else {
        const lastYear     = Math.max(...tickerDivs.map(yearOf));
        const partialDivs  = tickerDivs.filter(d => yearOf(d) === lastYear);
        const partialTotal = partialDivs.reduce((s, d) => s + +d.amount, 0);
        dps = partialTotal > 0 && partialDivs.length
          ? partialTotal / +holding.shares / partialDivs.length
          : +lastDiv.amount / +holding.shares;
      }
      sharesAtRefDiv = +holding.shares;
      lastValidAmt   = +lastDiv.amount;
      usedFallback   = true;
    }

    const currentShares = +holding.shares;
    const projected     = dps * freq * currentShares;

    // سهم قطع توزيعه (تجاوز 1.75× دورته) = فشل بوابة الاستدامة (الدستور §4)
    // → يُستبعد من الدخل المتوقَّع ويُعلَن صراحةً (§8: لا إسقاط صامت).
    const daysSinceDiv = lastDivDate
      ? Math.floor((Date.now() - parseDateLocal(lastDivDate).getTime()) / 86400000) : null;
    const staleAfter = dividendStaleDays(freq);
    const isStale    = daysSinceDiv != null && daysSinceDiv > staleAfter;
    if (!isStale) total += projected;

    breakdown.push({
      ticker, dps, freq, freqLabel, currentShares, lastDivDate,
      lastDivAmt: lastValidAmt, sharesAtLastDiv: sharesAtRefDiv,
      projected, usedFallback, dpsTrend, isStale, daysSinceDiv,
    });
  });

  return { total, breakdown, stale: breakdown.filter(b => b.isStale) };
}

// ── Load historical data ───────────────────────────────────────────────
async function loadHistoricalData() {
  // M-15: explicit high limit — Supabase default is 1000 rows which silently truncates
  //        large portfolios and corrupts XIRR / CWA / cap-growth calculations
  // هذه الصفحة تختص بمحفظة التقاعد الاستثمارية فقط (أسهم + ما تنتجه من توزيعات).
  // لا نجلب العقارات ولا صافي الثروة — مسار صافي الثروة عبر الزمن موجود في صفحته المستقلة.
  const [rTx, rDiv, rH, rCf] = await Promise.all([
    supabaseClient.from('transactions').select('type,total,shares,price,date,ticker').eq('is_archived',false).limit(100000),
    // ticker + month مطلوبان لمحرّك الدخل المتوقَّع (forward) — لا تُزَل
    supabaseClient.from('dividends').select('amount,year,month,date,ticker').eq('is_archived',false).order('year').limit(100000),
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
    // AUDIT-FIX 2026-08-21 (#44): كان الافتراض «1 يونيو» يُقحم شهراً مخترعاً على
    // توزيعة معلومة الشهر. التعريف الموحَّد في utils.js/dividendFlowDate.
    const dDate = dividendFlowDate(d, today);
    // `_kind` يميّز تدفّق التوزيع عن تدفّق الشراء/البيع، ليُشتقّ
    // النمو السعري من الثاني وحده (انظر `_priceXirr` أدناه).
    if (dDate) xirrFlows.push({ date: dDate, amount: +d.amount, _kind: 'div' });
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

  const avgAnnualDiv = avgRecentDiv;

  // ══════════════════════════════════════════════════════════════════════
  // عائد التوزيعات — Forward yield (بسط ومقام كلاهما «الآن»)
  // ──────────────────────────────────────────────────────────────────────
  // كان: avgRecentDiv (توزيعات آخر 12 شهراً، جُنيت على رأس مال أصغر) ÷ قيمة
  // اليوم — بسط ماضٍ ومقام حاضر. في محفظة نامية هذا يبخس العائد بشدة (قياس
  // أوديت 2026-08: عرض 2.73% والصحيح 5.07% — بخس 46%)، والرقم يقود «الدخل
  // الشهري في 2045» أي هدف المالك المعلن.
  // الآن: الدخل المتوقَّع من الحيازات الحالية (DPS آخر 12 شهراً × الأسهم
  // الحالية، باستبعاد المنقطع) ÷ القيمة السوقية الحالية = تعريف forward yield.
  // ══════════════════════════════════════════════════════════════════════
  const fwdIncome    = forecastProjectedAnnualIncome(hRows, divRows, txRows);
  const ttmDivYield  = currentValue > 0 ? avgRecentDiv / currentValue : 0.035;  // تاريخي
  const fwdOk        = fwdIncome.total > 0 && currentValue > 0;
  const divYieldSource = fwdOk ? 'forward' : 'historical';
  const annDivYield  = fwdOk ? (fwdIncome.total / currentValue) : ttmDivYield;
  // ⚠️ القصّ يُعلَن: عائدٌ يتجاوز 15% يعني خطأ بيانات أو حيازة صغيرة
  // بتوزيع كبير — وكان يُقصّ بلا أي وسم، ثم يُعرض بشارة خضراء
  // «✓ forward من حيازاتك» كأنه رقم مُتحقَّق منه. وعائد 14.7% على محفظة
  // توزيعات سعودية رقم يستوجب مراجعة لا تمريراً (م.20).
  const DIV_YIELD_SANE = 0.09;    // عتبة المراجعة لا القصّ
  const safeDivYield = Math.min(0.15, Math.max(0, annDivYield));
  const divYieldClamped = annDivYield > 0.15;
  const divYieldSuspect = annDivYield > DIV_YIELD_SANE;
  // العائد المستخدم في تفكيك XIRR يبقى التاريخي عمداً: التوزيعات الداخلة في
  // XIRR هي المستلمة فعلاً، فطرح عائد forward منها يبخس نمو السعر بلا مبرر.
  const safeTtmDivYield = Math.min(0.15, Math.max(0, ttmDivYield));

  // annCapGrowth: XIRR إن توفّر، وإلا CAGR احتياطياً
  // L-5: use costBasis (WAC × current shares) not netCapital — costBasis better
  // represents actual deployed capital when proceeds are reinvested
  const rawCapGrowth = (costBasis > 0 && currentValue > 0)
    ? Math.pow(currentValue / costBasis, 1 / yearsActive) - 1
    : 0.07;
  const xirrRate = xirrResult != null ? xirrResult / 100 : null;
  // H-8: floor lowered from 2% → -5% so truly negative portfolios are not masked.
  // The cap of 40% prevents unrealistic runaway projections.
  // ══════════════════════════════════════════════════════════════════════
  // النمو السعري = XIRR على تدفّقات **الشراء والبيع وحدها**
  // ----------------------------------------------------------------------
  // كان `xirrRate − safeTtmDivYield`: طرحُ عائدٍ **نقطيّ** (توزيعات 12 شهراً
  // ÷ قيمة **اليوم**) من عائدٍ **كلّي مرجَّح بالمال على عمر المحفظة كله**.
  // مقياسان مختلفان لا يُطرح أحدهما من الآخر: في محفظة نامية يكون مقام
  // العائد النقطي أكبر من رأس المال الذي جنى تلك التوزيعات، فيُطرَح أقلّ
  // مما يجب ويبقى جزءٌ من عائد التوزيع داخل «النمو السعري».
  //
  // قياس على محفظة نموها السعري 5.000% بالضبط وتوزيعها ربعي 1%:
  //   آخر ضخّ قبل شهر   ⇒ الطرح 5.850%   ·   الصحيح 4.996%   (+0.85 نقطة)
  //   آخر ضخّ قبل 6 أشهر ⇒ الطرح 5.562%   ·   الصحيح 4.996%   (+0.56)
  //
  // أثره اليوم محدود لأن وزن أدائك في المزج 4.75%، لكنه يبلغ ~21 نقطة أساس
  // عند السقف 25% ⇒ ~7.5% في القيمة النهائية على 35 سنة. والرقم يُصدَّر
  // حرفياً في CSV وفي سياق كل خطة محفوظة.
  //
  // العلاج: XIRR ثانٍ على الشراء والبيع + القيمة الحالية، بلا توزيعات —
  // وهو تعريف money-weighted price return. المدخلات كلها متاحة أصلاً.
  // ══════════════════════════════════════════════════════════════════════
  const priceFlows = xirrFlows.filter(f => f._kind !== 'div');
  const _priceXirr = (() => {
    try { const x = computeXIRR(priceFlows); return (typeof x === 'number' && isFinite(x)) ? x / 100 : null; }
    catch (_) { return null; }
  })();
  const annCapGrowth = Math.min(0.40, Math.max(-0.05,
    _priceXirr != null ? _priceXirr
      : xirrRate != null ? xirrRate - safeTtmDivYield   // احتياطي: أفضل المتاح
      : rawCapGrowth
  ));

  // متوسط الإضافة الشهرية التاريخية — مقسوماً على العمر من أول *إيداع* لا أول شراء
  // (أول شراء قد يسبق أول إيداع مسجَّل فيُخفَّض المتوسط زوراً)
  const depositRows       = cfRows.filter(e => e.type==='deposit');
  const totalDeposited    = depositRows.reduce((s,e) => s + +e.amount, 0);
  const firstDepositStr   = depositRows.filter(e => e.date).map(e => e.date).sort()[0] || null;
  // ⚠️ إيداعٌ واحد ليس **معدّل ضخّ**. أرضية `0.5` كانت تقسم إيداعاً
  // مقطوعاً على ستة أشهر فيظهر نمطاً شهرياً: محفظة عمرها شهران
  // وإيداع 230,000 ⇒ **38,333 ر.س/شهر**، ثم تُبذَر فترة DCA مدتها خمس
  // سنوات = **2,300,000 ر.س ضخّ لم يقرّه المالك** — عشرة أضعاف المحفظة،
  // تدخل الرسم والجدول والهدف ومونتي كارلو.
  //
  // م.20: لا يُستنتج معدّل دوري من ملاحظة واحدة — يُعلَن «غير متوفر».
  // الشرط: ثلاثة إيداعات فأكثر **و** مدى إيداعات لا يقلّ عن سنة.
  const depositYears      = firstDepositStr
    ? Math.max(1, (today - parseDateLocal(firstDepositStr)) / (365.25 * 86400000))
    : yearsActive;
  const _depositEvidence  = depositRows.length >= 3 && depositYears >= 1;
  const avgMonthlyDeposit = (_depositEvidence && depositYears > 0)
    ? totalDeposited / (depositYears * 12) : 0;
  const avgDepositBasis   = _depositEvidence ? 'measured'
    : (depositRows.length ? 'insufficient' : 'none');

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

  // ══════════════════════════════════════════════════════════════════════
  // المزج: تاسي هو الأساس، وأداؤك تشخيص يدخل بوزن انكماش صغير
  // ──────────────────────────────────────────────────────────────────────
  // كان: annCapGrowth × (ثقة البيانات) + تاسي × (1−الثقة) — والثقة تتراوح
  // 49%–80%، أي أن نصف الإسقاط إلى أربعة أخماسه كان مبنياً على XIRR محفظة
  // عمرها ~سنة. وهو رقم مُسنّى شديد الضجيج: حركة سوقية 10% كانت تحرّكه ~25
  // نقطة مئوية، ومحفظة عمرها 3 أشهر ربحت 10% تظهر بـ46% سنوياً.
  // الآن: الأساس = معيار تاسي، والأداء الشخصي يدخل بوزن personalPerfWeight
  // المحسوب من عمر رأس المال الفعلي ومسقوف عند 25% (انظر تعليق الثابت أعلاه).
  const cwYears    = (capitalWeightedMonths || 0) / 12;
  const perfWeight = personalPerfWeight(cwYears);
  // السقف 11%: نمو سعري سنوي 11% مُركَّب 35 سنة هو الحدّ الأعلى المُدافَع عنه.
  // الأرضية 0: محفظة لم تُثبت نمواً تُسقَط مسطّحة لا صاعدة.
  // ══════════════════════════════════════════════════════════════════
  // حارس NaN — أُضيف بعد كشف 2026-08-24
  // ------------------------------------------------------------------
  // صفُّ توزيع واحد بلا `year` يُنتج NaN في avgRecentDiv، فيسري إلى
  // ttmDivYield ثم annCapGrowth ثم **معدّل النمو الذي يقود كل
  // السيناريوهات**. الأثر: «—» في مكان، وإسقاطٌ فارغ أو مشوَّه في آخر —
  // بلا رسالة واحدة تقول ما حدث.
  //
  // NaN أسوأ من الناقص المُعلَن ومن المُقدَّر: يمرّ صامتاً ويفسد ما بعده.
  // فيُستبدَل بمعيار السوق ويُعلَن الاستبدال (م.20: يُعلَن ولا يُقدَّر بصمت).
  // ══════════════════════════════════════════════════════════════════
  const _growthBad = !isFinite(annCapGrowth);
  const blendedCapGrowth = _growthBad
    ? MARKET_CAP_BENCHMARK
    : Math.min(0.11, Math.max(0,
        MARKET_CAP_BENCHMARK * (1 - perfWeight) + annCapGrowth * perfWeight
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
    annCapGrowth: _growthBad ? null : annCapGrowth,   // تشخيص لا تنبؤ
    growthFallback: _growthBad,            // هل استُبدل بالمعيار؟ يُعلَن في الواجهة
    blendedCapGrowth,                      // المستخدم فعلياً في السيناريوهات
    perfWeight,                            // وزن أدائك في المزج (مُقدِّر انكماش)
    marketBenchmark: MARKET_CAP_BENCHMARK,  // الأساس
    safeDivYield, avgAnnualDiv,
    divYieldSource,                        // 'forward' | 'historical'
    divYieldClamped, divYieldSuspect, divYieldRaw: annDivYield,
    fwdAnnualIncome: fwdIncome.total,
    fwdCovered:      fwdIncome.breakdown.filter(b => !b.isStale).length,
    fwdStale:        fwdIncome.stale.length,
    ttmDivYield:     safeTtmDivYield,
    avgMonthlyDeposit, avgDepositBasis, depositCount: depositRows.length, totalDivAll,
    totalBuys, totalSells,
    yearsActive, firstDate,
    capitalWeightedMonths,
    xirr: xirrResult,
    xirrUsed: xirrRate != null,
    currentYear: today.getFullYear(),
    divByYear,
    holdingsCount: hRows.length,
    // الرمز والقيمة السوقية لكل حيازة — يحتاجهما ترجيح نمو التوزيع (م.15/1)
    holdingRows: hRows.map(r => ({
      ticker: String(r.ticker || '').trim(),
      value: (+r.shares || 0) * (+r.current_price || 0),
    })).filter(r => r.ticker && r.value > 0),
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
  // base = معيار تاسي مُعدَّلاً بوزن انكماش صغير من أدائك (blendedCapGrowth)
  const base = _hist.blendedCapGrowth;
  const div  = divOverride !== undefined ? divOverride : _hist.safeDivYield;
  // المعايرة مُرساة على أداء تاسي الفعلي 2005-2024 (20 سنة):
  //   • نمو سعري CAGR: ~1.95% (الفترة كاملة بأزماتها) — ~4.4% (2010-2024 الحديثة)
  //   • توزيعات ~3.5%  • 30% من السنوات كانت خسارة (غير مُغطّاة هنا)
  // المتحفّظ يُرسى على «الطرف المنخفض للسوق» (ارتداد للمتوسط) لا على أداء الفرد
  // المرتفع — فمحفظة حقّقت 11% لن تكرّرها 35 سنة؛ الافتراض الحذر هو عودتها للسوق.
  //   • متحفّظ   ≈ 2.4% سعري + توزيعات مخفّضة (≈5% إجمالي) — كامل-دورة تاسي
  //   • متفائل  = مسقوف بـ`tasiWindowExtremes().max` — محسوب من البيانات لا
  //     مُرقّماً هنا. (كان مكتوباً «≈11% إجمالي» والفعلي 6.25% سعري + التوزيع.)
  // (أُزيل «الاستثنائي»: نمو سعري 9.5%+ على 10-20 سنة لم يحدث في تاريخ تاسي)
  const MARKET_LOW = Math.max(0, MARKET_CAP_BENCHMARK - 0.02);   // ~2.4% — قاع تاسي طويل المدى الواقعي
  // سقف المتفائل = أعلى نافذة سعرية فعلية في تاريخ تاسي (10/15/20 سنة)،
  // محسوبة من tasiLongRunCAGRs() لا مُرقّمة يدوياً. كان السقف 12% وهو ضِعف
  // أعلى نافذة حقيقية — رقم لم يحدث ولا مرة، فيُعشّم على غلط.
  const OPT_CAP = tasiWindowExtremes().max;
  // ⚠️ ثبات الترتيب (invariant): المتفائل ≥ المعتدل ≥ المتحفظ في كلا المعدّلين.
  // بعد تصحيح عائد التوزيعات إلى forward صار العائد الفعلي قد يتجاوز سقف 6%،
  // فكان min(0.06, div+0.01) يُنتج «متفائلاً» توزيعُه أقل من «المعتدل» (تناقض).
  // الحلّ: السقف يُلغي الزيادة فقط ولا يُنزل السيناريو الأعلى تحت الأساس.
  // م.7 — نمو التوزيع المرجّح المسجَّل. مصدره الدستور لا رقمٌ مكتوب هنا.
  const DIV_G = (typeof DIV_GROWTH_WEIGHTED === 'number') ? DIV_GROWTH_WEIGHTED : 0.0276;
  _scenarios = [
    { key:'conservative',
      capRate: Math.max(0, Math.min(base * 0.8, MARKET_LOW)),
      // الأرضية المطلقة 1% كانت ترفع توزيع «المتحفّظ» فوق «المعتدل»
      // عند عائد دون 1.25%: بإدخال 0.5% تخرج cons 1.00% و base 0.50%.
      // السقف يلغي الزيادة ولا يقلب الترتيب — نفس علاج السطر المتفائل.
      divRate: Math.min(div, Math.max(0.01, div * 0.80)),
      divGrowth: DIV_G * 0.5 },
    { key:'base',
      capRate: base,
      divRate: div,
      divGrowth: DIV_G },
    { key:'optimistic',
      capRate: Math.max(base, Math.min(OPT_CAP, base + 0.025)),
      divRate: Math.max(div,  Math.min(0.06,    div  + 0.010)),
      divGrowth: DIV_G * 1.5 },
  ];
}

// ── Core monthly projection engine ─────────────────────────────────────
// يُشغّل محاكاة شهرية دقيقة تشمل: نمو رأس المال، الأرباح، إعادة الاستثمار،
// إضافات دورية، تعديل التضخم
// ══════════════════════════════════════════════════════════════════════
// م.14 و62 و63 و64 — مراحل المحفظة داخل الإسقاط
// ----------------------------------------------------------------------
// الدستور يقسم الأفق ثلاث مراحل بمعاملات مختلفة جوهرياً:
//   تجميع (حتى 2044-12-31): إعادة استثمار **100%** إلزامية + ضخّ  — م.14
//   انتقال (2045–2047):     **50%** تُسحَب و50% يُعاد استثماره     — م.63
//   سحب   (2048 فأكثر):     **0%** — التوزيعات تُسحَب بالكامل      — م.64
// وكان المحرّك يطبّق **قيمة واحدة** لإعادة الاستثمار على الأفق كله وضخّاً
// ثابتاً حتى نهايته. بالأفق الافتراضي 35 سنة يعني ذلك إعادة استثمار كاملة
// وضخّاً 8,000 حتى **2061** — سبع عشرة سنة داخل مرحلة السحب بسياسة معاكسة
// لنصّ الدستور. وثوابت المراحل كانت معرَّفة ولا تُستدعى في أي حساب.
function reinvestShareAt(calYear, userFlag) {
  if (!userFlag) return 0;                                   // المالك أطفأ إعادة الاستثمار
  const accEnd = (typeof ACCUM_END_YEAR === 'number') ? ACCUM_END_YEAR : 2044;
  const trEnd  = (typeof TRANSITION_END_YEAR === 'number') ? TRANSITION_END_YEAR : 2047;
  if (calYear <= accEnd) return 1.0;   // م.14
  if (calYear <= trEnd)  return 0.5;   // م.63
  return 0.0;                          // م.64
}

// جدولان زمنيان بدل عَلَمين ثابتين
function buildPhaseSchedules(totalMonths, userReinvest, dcaSchedule) {
  const accEnd = (typeof ACCUM_END_YEAR === 'number') ? ACCUM_END_YEAR : 2044;
  const now = new Date();
  const reinvest = new Array(totalMonths);
  const dca = (dcaSchedule || new Array(totalMonths).fill(0)).slice();
  for (let m = 0; m < totalMonths; m++) {
    const y = new Date(now.getFullYear(), now.getMonth() + m + 1, 1).getFullYear();
    reinvest[m] = reinvestShareAt(y, userReinvest);
    // م.63: «الضخّ يتوقف أو يستمر بقرار المالك» — الافتراض التوقف عند نهاية التجميع
    if (y > accEnd) dca[m] = 0;
  }
  return { reinvest, dca };
}

function projectScenario(scenario, params) {
  const {
    startValue, dcaSchedule, lumpSum,
    horizonYears, reinvestDividends,
    adjustInflation, inflationRate,
  } = params;

  const monthlyCapRate = Math.pow(1 + scenario.capRate, 1/12) - 1;
  // الدخل الشهري = العائد السنوي ÷ 12 — الدلالة المعتادة لدخل توزيعات سنوي،
  // موحّدة مع مونتي كارلو (÷12) ومع توثيق تذييل جدول المعالم في forecast.html
  // ══════════════════════════════════════════════════════════════════
  // ⚠️ العائد **ينجرف**، ولا يبقى ثابتاً على القيمة السوقية
  // ------------------------------------------------------------------
  // بعائدٍ ثابت يصير نمو الدخل = نمو رأس المال حتماً (4.4%)، بينما م.7
  // تسجّل «نمو التوزيع المرجّح = 2.76%». على 19 سنة إلى 2045:
  //   (1.0440 / 1.0276)^19 = 1.351  ⇒ مبالغة **35%** في الدخل الشهري.
  // وبطاقة نمو التوزيع في هذه الصفحة كانت **تقيس** الفجوة وتقول للمالك
  // «الإسقاط على الأرجح يبالغ في دخلك» — فيرى تحذيراً صحيحاً ورقماً
  // خاطئاً جنباً إلى جنب، والرقم هو ما يقود الجدول والرسم ومونتي كارلو.
  //
  // النمذجة: التوزيع للسهم ينمو بـ`divGrowth` والسعر ينمو بـ`capRate`،
  // فنسبة العائد على القيمة السوقية تتحرك بينهما شهرياً. والمال المُضاف
  // يشتري دخلاً بالعائد **الجاري وقت الشراء** — وهو ما ينتج تلقائياً
  // لأنه ينضمّ إلى `value` ويُضرب في العائد الجاري نفسه.
  // ══════════════════════════════════════════════════════════════════
  const mDivGrowth = Math.pow(1 + (scenario.divGrowth || 0), 1/12) - 1;
  // انجراف العائد شهرياً: (1+نمو التوزيع) ÷ (1+نمو السعر)
  const yieldDrift = (1 + mDivGrowth) / (1 + monthlyCapRate);
  let curAnnualYield = scenario.divRate;
  const monthlyDivRate = scenario.divRate / 12;   // العائد الابتدائي (للقطة السنة صفر)
  const totalMonths    = horizonYears * 12;
  const monthlyInfl    = Math.pow(1 + inflationRate, 1/12) - 1;

  // جدولا المرحلة: نسبة إعادة الاستثمار والضخّ لكل شهر (م.14/63/64)
  const _phase = buildPhaseSchedules(totalMonths, !!reinvestDividends, dcaSchedule);

  // المحفظة الاستثمارية فقط — لا عقارات ولا صافي ثروة (تُتابَع في صفحاتها)
  let value               = startValue + lumpSum;
  let cumulativeDividends = 0;
  let cumulativeWithdrawn = 0;      // ما سُحب فعلاً بعد بدء الانتقال (م.63/64)
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

    // 2. الأرباح الموزعة — بالعائد الجاري بعد الانجراف
    curAnnualYield *= yieldDrift;
    const divEarned = value * (curAnnualYield / 12);
    cumulativeDividends += divEarned;
    const _rs = _phase.reinvest[m - 1] || 0;      // نسبة إعادة الاستثمار لهذا الشهر
    value += divEarned * _rs;
    cumulativeWithdrawn += divEarned * (1 - _rs);

    // 3. الإضافة الشهرية (DCA) — متغيرة حسب الجدول والمرحلة
    const monthlyAdd = _phase.dca[m - 1] || 0;
    value           = Math.max(0, value + monthlyAdd);
    cumulativeAdded += monthlyAdd;

    // 4. مؤشر التضخم
    if (adjustInflation) inflationFactor *= (1 + monthlyInfl);

    // تسجيل لقطة سنوية
    if (m % 12 === 0) {
      const realVal      = adjustInflation ? value / inflationFactor : value;
      const yourCap      = startValue + cumulativeAdded;
      // ما أُعيد استثماره فعلاً = الموزَّع − المسحوب (يتغيّر بالمرحلة، م.63/64)
      const _reinvested  = cumulativeDividends - cumulativeWithdrawn;
      const priceGrowth  = Math.max(0, value - yourCap - _reinvested);
      snapshots.push({
        year:              m / 12,
        value,
        cumDiv:            cumulativeDividends,
        cumWithdrawn:      cumulativeWithdrawn,
        cumAdded:          cumulativeAdded,
        realValue:         realVal,
        monthlyIncome:     value * (curAnnualYield / 12),
        monthlyIncomeReal: adjustInflation
                             ? (value * (curAnnualYield / 12)) / inflationFactor
                             : value * (curAnnualYield / 12),
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
  const divYieldToUse    = (Number.isFinite(divYieldOverride) && divYieldOverride >= 0)
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

// ══════════════════════════════════════════════════════════════════════
// مولّد عشوائي محدَّد البذرة (mulberry32) — بلا مكتبات
// ──────────────────────────────────────────────────────────────────────
// Math.random() لا تُبذَر، فتشغيلان بنفس المدخلات كانا يعطيان أرقاماً مختلفة
// (قياس أوديت 2026-08: خطأ ±4.2% في p10 عند 2000 مسار ≈ ±170 ألف ريال).
// البذرة تُشتقّ من المدخلات نفسها، فنفس المدخلات = نفس النتيجة دائماً.
// ══════════════════════════════════════════════════════════════════════
function _mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// هاش FNV-1a بسيط لسلسلة المدخلات → بذرة عددية ثابتة
function _hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// ══════════════════════════════════════════════════════════════════════
// Block bootstrap — كتل متجاورة بطول ثابت معلوم
// ──────────────────────────────────────────────────────────────────────
// السحب المستقل (iid) يهمل ارتداد المتوسط الموثّق في الأسهم فيوسّع الذيول:
// قياس أوديت 2026-08 أعطى نطاقاً أوسع 2.8 مرة من كتل 5 سنوات. الكتل تحفظ
// تتابع السنوات الحقيقي داخل كل كتلة (انهيار يتبعه تعافٍ)، والالتفاف الدائري
// يمنع تحيّز أطراف السلسلة.
// ══════════════════════════════════════════════════════════════════════
const MC_BLOCK_YEARS = 4;   // ثابت ومُعلَن في شرح البطاقة

function _blockBootstrap(pool, n, rnd, blockLen) {
  const out = [];
  const L = pool.length;
  if (!L) return new Array(n).fill(0);
  while (out.length < n) {
    const start = (rnd() * L) | 0;
    for (let i = 0; i < blockLen && out.length < n; i++) out.push(pool[(start + i) % L]);
  }
  return out;
}

// ── قراءة مدخلات مرحلة السحب ───────────────────────────────────────
function readWithdrawalConfig(retireCalYear) {
  const on = !!document.getElementById('inp-withdraw-enable')?.checked;
  const endYear = parseInt(document.getElementById('inp-withdraw-end-year')?.value) || HORIZON_YEAR;   // م.1 — الأفق 2055
  const mode    = document.getElementById('inp-withdraw-mode')?.value || 'rate';
  // AUDIT-FIX (2026-08-18): الحقل مثبّت على 4 في HTML ولا يُبذَر من هدفك المحفوظ،
  // بينما رقم FIRE ونسبة الإنجاز أعلى الصفحة يُحسبان بـ fireGoal.swr. فمن ضبط
  // السحب على 3.5% كان يرى «نسبة السحب الآمن 3.5%» ثم تُحاكى بقاء محفظته بسحب 4%
  // — أي أعلى 14% مما اختاره، على 10,000 مسار. الآن هدفك هو الافتراضي.
  const _swrEl  = document.getElementById('inp-withdraw-rate');
  const _savedSwr = +(_hist?.fireGoal?.swr) || 0;
  if (_swrEl && !_swrEl.dataset.userTouched && _savedSwr > 0
      && Math.abs((parseFloat(_swrEl.value) || 0) - _savedSwr) > 1e-9) {
    _swrEl.value = _savedSwr;          // بذر من هدفك ما لم تُعدّله بنفسك
  }
  const rate    = (parseFloat(_swrEl?.value) || _savedSwr || 4) / 100;
  const monthly = parseFloat(document.getElementById('inp-withdraw-monthly')?.value) || 0;
  const inflate = document.getElementById('inp-withdraw-inflate')
    ? !!document.getElementById('inp-withdraw-inflate').checked : true;
  const years = Math.max(0, endYear - retireCalYear);
  // في وضع «المبلغ» بلا مبلغ مُدخَل لا يمكن السحب — نُعلنها بدل السحب بصفر بصمت
  const noAmount = mode === 'amount' && !(monthly > 0);
  return {
    on, endYear, years, mode, rate, monthly, inflate, retireCalYear, noAmount,
    enabled: on && years > 0 && !noAmount,
  };
}

// ══════════════════════════════════════════════════════════════════════
// مسار واحد: تراكم شهري (مطابق projectScenario) ثم سحب شهري اختياري
// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// م.5 — نمو التوزيع وخطر قصّه داخل المحاكاة
// ----------------------------------------------------------------------
// كانت `divYield` **ثابتة** على كل مسار وكل سنة: خطر السعر مُنمذَج وخطر
// التوزيع غير موجود إطلاقاً — فالمحاكاة تختبر كل شيء عدا الخطر الوحيد الذي
// يهدّد هدف م.4، ولهذا كانت «نسبة البقاء» تخرج ~99% شبه حتمية.
//
// عيبان معاً:
//   ① لا نمو: م.7 تسجّل نمو توزيع مرجّح 2.76% ولم يكن يدخل هنا (كما لم يكن
//     يدخل projectScenario قبل إصلاحه).
//   ② لا قصّ: التوزيع لا ينخفض أبداً مهما هبط السوق.
//
// **لماذا لم تُشتقّ نسبة القصّ من بيانات تداول:** فحصتُها — 18 رمزاً تُنتج
// ستّ أزواج سنوات صالحة فقط (2020–2025)، إحداها برمز واحد، وخمسٌ منها في
// فترة تعافٍ (+44% في 2024). بوتستراب من عيّنة كهذه يجعل المحاكاة **أكثر
// تفاؤلاً** لا أصدق. فالنسبة مُدخَلٌ صريح مُعلَن قابل للضبط (م.20: يُعلَن
// ولا يُقدَّر بصمت)، لا رقمٌ مدسوس في الكود.
//
// النمذجة: القصّ يقع في سنة الهبوط نفسها — والارتباط حقيقي: الشركات تقصّ
// حين تنكمش أرباحها، وهو ما يحدث في سنة انهيار السوق. فنستعمل عائد السنة
// المسحوب أصلاً بدل افتراض حدثٍ مستقلّ:
//     نمو التوزيع في السنة = 2.76% + (حساسية × أصغر من صفر في عائد السنة)
// ثم ينجرف العائد على القيمة السوقية بين نمو التوزيع ونمو السعر، تماماً
// كما في projectScenario — فالدخل ينمو بسياسة الشركات لا بسعر السهم.
// ══════════════════════════════════════════════════════════════════════
// نسبة ما يتعافى من القصّ كل سنة. القصّ حدثٌ لا حالة دائمة: الشركة تقصّ
// حين تنكمش أرباحها ثم تعيد الرفع حين تتعافى. وبلا تعافٍ يصير كل انهيار
// تاريخي خصماً **أبدياً**، فتتراكم أزمات 2006 و2008 على 29 سنة وتُنتج
// انهياراً في الدخل لم يقع في أي سوق حقيقي — قياسٌ أجريتُه: وسيط الدخل
// كان يهبط 40% وهو أثر النموذج لا أثر الخطر.
const MC_DIV_RECOVERY = 0.50;   // نصف الفجوة يُستردّ كل سنة

// حجم القصّ في سنة عائدها rY: جزءٌ من نسبة الهبوط، وصفرٌ في سنة صاعدة.
function _mcDivHit(yearReturn, sensitivity) {
  return Math.min(0.90, Math.max(0, -Math.min(0, yearReturn) * (sensitivity || 0)));
}

function _simulateMcPath(returns, cfg) {
  const { startValue, lumpSum, horizonYears, schedule, divYield,
          reinvest, inflationRate, wd, divRisk } = cfg;
  let value = startValue + lumpSum;
  const gBase = (typeof DIV_GROWTH_WEIGHTED === 'number') ? DIV_GROWTH_WEIGHTED : 0.0276;
  // عائد **الاتجاه** على القيمة السوقية: ينمو التوزيع بـم.7 وينجرف مقابل السعر
  let trendYield = divYield;
  // فجوة القصّ الجارية (0 = على الاتجاه) — تتراكم بالأزمة وتتعافى بعدها
  let shortfall = 0;

  // ── مرحلة التراكم — شهرية بالضبط كما في projectScenario ──
  for (let y = 0; y < horizonYears; y++) {
    const rY   = Math.max(-0.999, returns[y]);
    const mCap = Math.pow(1 + rY, 1 / 12) - 1;
    const mDrift = Math.pow((1 + gBase) / (1 + rY), 1 / 12);
    // تعافٍ ثم قصّ السنة الجارية
    shortfall = Math.min(0.90, shortfall * (1 - MC_DIV_RECOVERY) + _mcDivHit(rY, divRisk));
    const effYield = trendYield * (1 - shortfall);
    for (let m = 0; m < 12; m++) {
      value *= (1 + mCap);
      trendYield = Math.max(0, trendYield * mDrift);
      const div = value * ((trendYield * (1 - shortfall)) / 12);
      if (reinvest) value += div;
      value += schedule[y * 12 + m] || 0;
      if (value < 0) value = 0;
    }
    void effYield;
  }
  const atRetirement = value;
  const yieldAtRetirement = trendYield * (1 - shortfall);

  // ── مرحلة السحب ──
  let depletedAtYear = null;   // عدد سنوات بعد التقاعد حتى النفاد
  if (wd && wd.enabled) {
    // السحب السنوي الابتدائي (اسمي عند تاريخ التقاعد)
    let annualW = wd.mode === 'amount'
      ? wd.monthly * 12 * (wd.inflate ? Math.pow(1 + inflationRate, horizonYears) : 1)
      : atRetirement * wd.rate;
    for (let k = 0; k < wd.years; k++) {
      const mCap = Math.pow(1 + Math.max(-0.999, returns[horizonYears + k]), 1 / 12) - 1;
      const mW   = annualW / 12;
      const rW   = Math.max(-0.999, returns[horizonYears + k]);
      const mDriftW = Math.pow((1 + gBase) / (1 + rW), 1 / 12);
      shortfall = Math.min(0.90, shortfall * (1 - MC_DIV_RECOVERY) + _mcDivHit(rW, divRisk));
      for (let m = 0; m < 12; m++) {
        value *= (1 + mCap);
        // في مرحلة السحب التوزيعات تموّل السحب: تُضاف دائماً (عائد كلّي) ثم يُسحب
        trendYield = Math.max(0, trendYield * mDriftW);
        value += value * ((trendYield * (1 - shortfall)) / 12);
        value -= mW;
        if (value <= 0) { value = 0; break; }
      }
      if (value <= 0) { depletedAtYear = k + 1; break; }
      if (wd.inflate) annualW *= (1 + inflationRate);
    }
  }

  return { atRetirement, endValue: value, depletedAtYear, yieldAtRetirement };
}

function runMonteCarlo() {
  if (!_hist) { showToast('لا توجد بيانات كافية', 'warning'); return; }
  const N = 10000;   // المحاكاة سنوية والتكلفة تافهة — 2000 كانت تُنتج ضجيج عيّنة
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
  const divYield = (Number.isFinite(divYieldOverride) && divYieldOverride >= 0)
    ? divYieldOverride / 100 : _hist.safeDivYield;

  // م.5 — حساسية التوزيع لهبوط السوق (مُدخَل مُعلَن، لا رقم مدسوس)
  const _drEl = document.getElementById('inp-div-risk');
  const divRisk = _drEl ? (parseFloat(_drEl.value) || 0) : 0.35;

  // جدول DCA الشهري — يُطبَّق شهرياً (كان يُجمَّع سنوياً دفعة واحدة فينحاز
  // الوسيط −3% إلى −4.5% مقابل projectScenario الشهري)
  const schedule = buildDcaSchedule(getDcaPeriods(), horizonYears * 12);

  const retireCalYear = new Date().getFullYear() + horizonYears;
  const wd = readWithdrawalConfig(retireCalYear);

  // توزيع العوائد المُعاد مركزته إلى نمو السيناريو المعتدل
  const pool       = _recenterReturns(_tasiAnnualReturns(), _hist.blendedCapGrowth);
  const totalYears = horizonYears + (wd.enabled ? wd.years : 0);

  // بذرة محدَّدة من المدخلات نفسها → نفس المدخلات = نفس النتيجة بايتاً ببايت
  const seedStr = [
    'mc-v4', N, MC_BLOCK_YEARS, startValue, lumpSum, horizonYears,
    reinvest ? 1 : 0, adjustInfl ? 1 : 0, inflationRate.toFixed(6),
    goalAmount, _goalType, divYield.toFixed(8), divRisk.toFixed(4),
    _hist.blendedCapGrowth.toFixed(8),
    schedule.join(','),
    wd.enabled ? `w:${wd.years}:${wd.mode}:${wd.rate}:${wd.monthly}:${wd.inflate ? 1 : 0}` : 'w:0',
  ].join('|');
  const rnd = _mulberry32(_hashSeed(seedStr));

  const cfg = { startValue, lumpSum, horizonYears, schedule, divYield,
                reinvest, inflationRate, wd, divRisk };

  const finals = [];        // القيمة عند التقاعد (بقوة شراء اليوم إن فُعِّل التضخم)
  const incomes = [];       // الدخل الشهري عند التقاعد (حقيقي)
  const endReals = [];      // القيمة عند نهاية السحب
  const depletions = [];    // سنة النفاد (Infinity = لم ينفد)
  let reached = 0, survived = 0;
  const inflFactorEnd = adjustInfl ? Math.pow(1 + inflationRate, horizonYears) : 1;
  const inflFactorEnd2 = adjustInfl ? Math.pow(1 + inflationRate, totalYears) : 1;

  for (let s = 0; s < N; s++) {
    const returns = _blockBootstrap(pool, totalYears, rnd, MC_BLOCK_YEARS);
    const r = _simulateMcPath(returns, cfg);

    const realValue  = r.atRetirement / inflFactorEnd;      // بقوة شراء اليوم
    // العائد عند التقاعد **ليس** عائد اليوم: انجرف بنمو التوزيع وبما أصابه
    // من قصّ في سنوات الهبوط. استعمال divYield الابتدائي كان يُلغي أثر
    // النمذجة كلها على رقم الدخل المعروض.
    const realIncome = (realValue * (r.yieldAtRetirement != null ? r.yieldAtRetirement : divYield)) / 12;
    finals.push(realValue);
    incomes.push(realIncome);
    if (goalAmount > 0) {
      const metric = _goalType === 'monthly_income' ? realIncome : realValue;
      if (metric >= goalAmount) reached++;
    }
    if (wd.enabled) {
      endReals.push(r.endValue / inflFactorEnd2);
      if (r.depletedAtYear == null) { survived++; depletions.push(Infinity); }
      else depletions.push(r.depletedAtYear);
    }
  }

  finals.sort((a, b) => a - b);
  incomes.sort((a, b) => a - b);
  endReals.sort((a, b) => a - b);
  depletions.sort((a, b) => a - b);

  const successPct = goalAmount > 0 ? (reached / N * 100) : null;
  const survivalPct = wd.enabled ? (survived / N * 100) : null;
  const depP10 = wd.enabled ? _percentile(depletions, 10) : null;

  _renderMonteCarlo({
    N, horizonYears, goalAmount, adjustInfl, successPct,
    blockYears: MC_BLOCK_YEARS,
    retireCalYear,
    p5:  _percentile(finals, 5),  p10: _percentile(finals, 10),
    p25: _percentile(finals, 25), p50: _percentile(finals, 50),
    p75: _percentile(finals, 75), p90: _percentile(finals, 90),
    inc10: _percentile(incomes, 10), inc50: _percentile(incomes, 50), inc90: _percentile(incomes, 90),
    wd, survivalPct, depP10,
    endP10: wd.enabled ? _percentile(endReals, 10) : null,
    endP50: wd.enabled ? _percentile(endReals, 50) : null,
  });
  if (statusEl) {
    statusEl.textContent = `${N.toLocaleString('ar-SA')} مسار · كتل ${MC_BLOCK_YEARS} سنوات`
      + ` · عوائد تاسي 2004–2024 · نمو توزيع ${(DIV_GROWTH_WEIGHTED * 100).toFixed(2)}% (م.7)`
      + ` · خطر القصّ ${divRisk > 0 ? (divRisk * 100).toFixed(0) + '% من نسبة الهبوط' : 'مُطفأ ⚠️'}`
      + ' · بذرة ثابتة';
  }
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
  // الهدف خارج النطاق المعروض: posOf يقصّ عند [0,100] فيلتصق المؤشر بالطرف
  // بلا تنبيه — نُعلنها صراحةً بدل تركها توهم أن الهدف على حافة النطاق.
  const goalShown  = r.goalAmount > 0 && _goalType === 'portfolio_value';
  const goalOut    = goalShown ? (r.goalAmount < lo ? 'below' : r.goalAmount > hi ? 'above' : null) : null;
  const goalMarker = goalShown
    ? `<div style="position:absolute;top:-4px;bottom:-4px;left:${posOf(r.goalAmount).toFixed(1)}%;width:2px;background:var(--st-bad)" title="الهدف"></div>` : '';
  const goalOutNote = goalOut
    ? `<div class="note" data-state="${goalOut === 'above' ? 'bad' : 'good'}" style="margin-top:8px">
         <span class="ic">${goalOut === 'above' ? '⚠️' : 'ℹ️'}</span>
         <div><b>هدفك خارج النطاق المعروض.</b> الشريط يمتد من ${fmtShort(lo)} إلى ${fmtShort(hi)} (المئين 10→90)،
         وهدفك ${fmt(r.goalAmount)} ${goalOut === 'above' ? '<b>أعلى من أفضل 10% من المسارات</b> — علامة الهدف ملتصقة بالطرف الأيسر وليست داخل النطاق' : '<b>أدنى من أسوأ 10% من المسارات</b> — أي أن كل المسارات تقريباً تتجاوزه'}.</div>
       </div>` : '';

  // ── مقدمة تشرح الفكرة ببساطة ──
  const intro = `
    <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px;line-height:1.85" class="small text-muted">
      🎲 <strong>وش سوّينا هنا؟</strong> شغّلنا "مستقبل محفظتك" <b>${r.N.toLocaleString('ar-SA')} مرة</b>، كل مرة بعوائد سوق مختلفة
      سحبناها من تاريخ تاسي الحقيقي (2004–2024) — فيه سنوات ممتازة وسنوات انهيار. ليش؟ لأن السوق
      <b>ما يعطي نفس العائد كل سنة</b>؛ أحياناً يطلع وأحياناً ينزل، والترتيب نفسه يفرق. فالنتيجة مو رقم
      واحد مضمون، بل <b>نطاق احتمالات</b>: من أسوأ حظ إلى أحسن حظ.
      <br>🔒 <b>الأرقام ثابتة:</b> المحاكاة مبذورة من مدخلاتك، فتشغيلها مرتين بنفس المدخلات يعطي النتيجة نفسها بالضبط.
      نسحب <b>كتلاً متتابعة بطول ${r.blockYears} سنوات</b> لا سنوات مبعثرة، حتى يبقى تتابع السوق الحقيقي (انهيار يتبعه تعافٍ) محفوظاً.
    </div>`;

  let successBlock = '';
  if (r.successPct != null) {
    const st  = r.successPct >= 80 ? 'good' : r.successPct >= 50 ? 'warn' : 'bad';
    const col = `var(--st-${st})`;
    const verdict = r.successPct >= 80 ? 'فرصة ممتازة لبلوغ الهدف عند التقاعد 👍'
                  : r.successPct >= 50 ? 'البلوغ ممكن لكنه غير مضمون — راقب وزِد ضخّك إن قدرت'
                  : 'الفرصة ضعيفة — خطّتك تحتاج تعزيز (ضخ أعلى أو أفق أطول)';
    successBlock = `
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px">
        <div style="text-align:center;min-width:120px">
          <div style="font-size:2rem;font-weight:800;color:${col};line-height:1">${r.successPct.toFixed(0)}<span style="font-size:1rem">من 100</span></div>
          <div class="small text-muted">① بلوغ الهدف في ${r.retireCalYear}</div>
        </div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;color:${col};margin-bottom:3px">${verdict}</div>
          <div class="small text-muted">من كل 100 مستقبل جرّبناه، بلغت <b>${r.successPct.toFixed(0)}</b> منها هدفك${r.adjustInfl ? ' (بقوة شراء اليوم)' : ' (اسمياً)'} عند نهاية التراكم.
          ${r.wd?.enabled ? 'هذا <b>مقياس التراكم فقط</b> — المقياس التقاعدي الحقيقي في البطاقة التي تليه.' : ''}</div>
        </div>
      </div>`;
  }

  // ── ② مقياس البقاء: هل تدوم المحفظة طوال التقاعد؟ (الفجوة الأكبر سابقاً) ──
  let survivalBlock = '';
  if (r.wd?.enabled && r.survivalPct != null) {
    const st  = r.survivalPct >= 90 ? 'good' : r.survivalPct >= 75 ? 'warn' : 'bad';
    const col = `var(--st-${st})`;
    // ⚠️ «بقوة شراء اليوم» صحيحة **فقط** عند تفعيل الرفع بالتضخم: حينها
    // يُرفَع المبلغ بـ(1+i)^أفق فيحافظ على قوّته. ومع إطفائه يكون مبلغاً
    // اسمياً ثابتاً عند التقاعد — فكان النصّ يقول الوصفين معاً وهما نقيضان.
    // بأفق 20 سنة الفرق ×1.025²⁰ = **1.64 ضعف** في القوة الشرائية الفعلية.
    const wTxt = r.wd.mode === 'amount'
      ? (r.wd.inflate
          ? `سحب ${fmt(r.wd.monthly)}/شهر بقوة شراء اليوم`
          : `سحب ${fmt(r.wd.monthly)}/شهر مبلغاً اسمياً ثابتاً عند ${r.retireCalYear}`)
      : `سحب ${(r.wd.rate * 100).toFixed(1)}% سنوياً من قيمة المحفظة عند التقاعد`;
    const inflTxt = r.wd.inflate ? ' مرفوعاً بالتضخم كل سنة' : '';
    const depTxt = (r.depP10 === Infinity || r.depP10 == null)
      ? 'حتى في أسوأ 10% من المسارات لم تنفد المحفظة قبل النهاية.'
      : `في أسوأ 10% من المسارات ينفد المال بعد <b>${r.depP10} سنة</b> من التقاعد — أي حوالي عام <b>${r.retireCalYear + r.depP10}</b>.`;
    survivalBlock = `
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px">
        <div style="text-align:center;min-width:120px">
          <div style="font-size:2rem;font-weight:800;color:${col};line-height:1">${r.survivalPct.toFixed(0)}<span style="font-size:1rem">من 100</span></div>
          <div class="small text-muted">② بقاء المحفظة حتى ${r.wd.endYear}</div>
        </div>
        <div style="flex:1;min-width:220px">
          <div style="font-weight:700;color:${col};margin-bottom:3px">🏁 هذا هو المقياس التقاعدي الحقيقي</div>
          <div class="small text-muted" style="line-height:1.8">
            بعد بلوغ ${r.retireCalYear} نبدأ <b>${wTxt}</b>${inflTxt}، لمدة <b>${r.wd.years} سنة</b> حتى ${r.wd.endYear}،
            بنفس عوائد السوق العشوائية. ${depTxt}
          </div>
          <div class="meter" style="margin-top:8px" data-state="${st}">
            <div class="meter-head"><span class="k">نسبة المسارات التي لم تنفد</span><span class="v">${r.survivalPct.toFixed(1)}%</span></div>
            <div class="meter-track"><div class="meter-fill" style="width:${Math.min(100, r.survivalPct).toFixed(1)}%"></div></div>
            <div class="meter-foot">ما تبقّى عند النهاية: الوسيط ${fmtShort(r.endP50)} · أسوأ 10% ${fmtShort(r.endP10)}${r.adjustInfl ? ' (بقوة شراء اليوم)' : ''}</div>
          </div>
        </div>
      </div>`;
  } else {
    const w = r.wd || {};
    const why = !w.on
      ? 'المفتاح مُطفأ.'
      : w.noAmount
        ? 'اخترتَ وضع «المبلغ الشهري المستهدف» لكن الحقل فارغ — أدخل مبلغاً أو بدّل لوضع النسبة.'
        : `سنة نهاية السحب (${w.endYear}) ليست بعد سنة التقاعد (${r.retireCalYear}) — مدّد سنة النهاية أو قصّر الأفق.`;
    survivalBlock = `
      <div class="note" data-state="warn" style="margin-bottom:14px">
        <span class="ic">🏁</span>
        <div><b>مرحلة السحب غير مفعّلة — فالمحاكاة لا تسحب ريالاً.</b> السبب: ${esc(why)}
        الرقم أعلاه يقيس «هل بلغتُ الهدف في ${r.retireCalYear}» لا «هل تدوم المحفظة حتى نهاية التقاعد».
        خطر تتابع العوائد (انهيار قرب التقاعد) لا يُختبَر إلا بالسحب.</div>
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
    ${survivalBlock}
    <div class="small" style="margin-bottom:6px;color:var(--text-2)"><b>حجم محفظتك المتوقّع</b> بعد ${r.horizonYears} سنة${realTag} — حسب حظّك في السوق:</div>
    <div style="position:relative;height:26px;border-radius:13px;background:linear-gradient(90deg,var(--st-bad) 0%,var(--st-warn) 45%,var(--st-good) 100%);margin:8px 0 4px;opacity:.85">
      <div style="position:absolute;top:-4px;bottom:-4px;left:${posOf(r.p50).toFixed(1)}%;width:3px;background:var(--text)" title="الأكثر توقّعاً"></div>
      ${goalMarker}
    </div>
    <div style="display:flex;justify-content:space-between" class="small text-muted">
      <span>👈 أسوأ حظ</span><span>المنتصف</span><span>أحسن حظ 👉</span>
    </div>
    ${goalOutNote}

    <div style="margin-top:8px;margin-bottom:2px" class="small text-muted">
      رتّبنا كل النتائج من الأسوأ للأفضل. اقرأ كل سطر هكذا: «<b>لو</b> صار لك هذا الحظ، بتكون محفظتك بهذا الحجم»:
    </div>
    <div style="margin-top:6px">
      ${row('🥶', 'لو حظّك سيّئ جداً', 'أسوأ 5 نتائج من كل 100', r.p5, false)}
      ${row('😟', 'لو حظّك سيّئ', 'أسوأ 10 نتائج من كل 100', r.p10, false)}
      ${row('🙁', 'لو حظّك أقل من المتوسط', 'أسوأ الربع', r.p25, false)}
      ${row('😐', 'الأكثر توقّعاً', 'المنتصف تماماً', r.p50, true)}
      ${row('🙂', 'لو حظّك أحسن من المتوسط', 'أفضل الربع', r.p75, false)}
      ${row('😄', 'لو حظّك ممتاز', 'أفضل 10 نتائج من كل 100', r.p90, false)}
    </div>

    <div class="note" data-state="warn" style="margin-top:14px">
      <span class="ic">💡</span>
      <div><strong>ليش نركّز على «لو حظّك سيّئ» بدل المنتصف؟</strong><br>
      لأن انهيار السوق <b>قرب تقاعدك</b> أخطر بكثير من انهيار وأنت في البداية — وقتها محفظتك تكون في أكبر
      حجم لها، وما يبقى وقت كافٍ تعوّض الخسارة. خطّط على «😟 لو حظّك سيّئ» (${fmtShort(r.p10)})، لا على
      «المنتصف» (${fmtShort(r.p50)}).
      ${r.wd?.enabled
        ? ' وهذا الخطر <b>مُختبَر فعلاً</b> هنا لأن المحاكاة تسحب من المحفظة بعد التقاعد.'
        : ' <b>لكن تنبيه:</b> ما دامت مرحلة السحب مطفأة فالمحاكاة لا تختبر هذا الخطر — تتوقف عند التقاعد بلا سحب.'}</div>
    </div>

    <div style="margin-top:12px;padding:10px 13px;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;line-height:1.8" class="small">
      💵 <strong>دخلك الشهري المتوقّع من التوزيعات عند التقاعد${realTag}:</strong><br>
      😟 لو حظّك سيّئ ≈ <b>${fmt(r.inc10)}</b> · 😐 الأكثر توقّعاً ≈ <b>${fmt(r.inc50)}</b> · 😄 لو حظّك ممتاز ≈ <b>${fmt(r.inc90)}</b> <span class="text-muted">(ريال/شهر)</span>
    </div>

    <div class="note" style="margin-top:12px">
      <span class="ic">🫧</span>
      <div><b>ملاحظة منهجية مقصودة:</b> سنة 2005 (+104%) <b>مستبعدة</b> من نوافذ السيناريوهات في بطاقة السيناريوهات،
      لكنها <b>داخل</b> وعاء السحب هنا. السبب: الاستبعاد هناك يخصّ <i>نقاط الدخول</i> (البدء من قمة فقاعة يشوّه إحصاء
      النوافذ)، أمّا هنا فالسحب عشوائي لسنة داخل مسار طويل — وحذف سنوات الصعود الحاد وحده يبتر الذيل الأيمن للتوزيع
      ويجعل النطاق متفائلاً بالخطأ من جهة ومتشائماً من أخرى.</div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// خطة الضخ للوصول للهدف (وضع عكسي) + سجل الخطط المحفوظة
// ──────────────────────────────────────────────────────────────────────
const FORECAST_PLANS_KEY = 'forecast_plans_v1';
// إصدار مخطّط الخطة المحفوظة:
//   (بلا رقم) = خطط قديمة تحفظ المدخلات والنتيجة النهائية فقط → تُعاد بالحساب الحيّ
//   2         = لقطة مجمّدة كاملة (مسار + معدّلات + سياق بيانات) → تُعرض كما هي بلا حساب
//   3         = 2 + حقول سياق جديدة (وزن الأداء الشخصي، مصدر عائد التوزيعات،
//               الدخل المتوقَّع). التوافق الرجعي محفوظ: _isFrozenPlan تقبل ≥2،
//               والحقول الجديدة تُعرض «غير متوفر» في خطط v2 — لا تُقدَّر بصمت (§8).
const PLAN_SCHEMA_VERSION = 3;
let _forecastPlans = [];
let _lastComputedPlan = null;
let _planCompare = null;   // { id, live, at } — مقارنة «المحفوظ مقابل اليوم» بلا كتابة
let _viewedPlanId = null;  // الخطة المعروضة حالياً في بطاقة العرض المجمَّد

const _scenLabel = k => k === 'conservative' ? '🛡️ متحفّظ' : k === 'optimistic' ? '🚀 متفائل' : '📊 معتدل';

// خطة مجمّدة = تحمل إصدار مخطّط ≥2 ومسار إسقاط محفوظ
const _isFrozenPlan = p => !!p && +p.schemaVersion >= 2 && Array.isArray(p.path) && p.path.length > 1;

// ── ضغط مسار الإسقاط السنوي للتخزين ────────────────────────────────
// نخزّن اللقطات السنوية فقط (لا الشهرية) بمفاتيح قصيرة وأرقام صحيحة:
//   y=السنة  v=القيمة الاسمية  d=تراكمي التوزيعات  a=تراكمي المُضاف
//   r=القيمة الحقيقية (بعد التضخم)  i=الدخل الشهري
// 45 سنة ⇒ 46 صفاً × 6 أرقام ≈ 3 ك.ب — آمن على سجل user_settings.
function _compressPath(snaps) {
  if (!Array.isArray(snaps)) return [];
  return snaps.map(s => ({
    y: s.year,
    v: Math.round(s.value),
    d: Math.round(s.cumDiv),
    a: Math.round(s.cumAdded),
    r: Math.round(s.realValue),
    i: Math.round(s.monthlyIncome),
  }));
}

// ── سياق البيانات وقت الحفظ — يخبر المالك على أي أساس بُنيت الخطة ──
function _snapshotContext() {
  const h = _hist || {};
  return {
    confidenceScore:  h.confidenceScore ?? null,
    capitalWeightedMonths: h.capitalWeightedMonths != null ? Math.round(h.capitalWeightedMonths) : null,
    yearsActive:      h.yearsActive != null ? +h.yearsActive.toFixed(2) : null,
    portfolioValue:   h.currentValue != null ? Math.round(h.currentValue) : null,
    annCapGrowth:     h.annCapGrowth ?? null,        // تشخيص: الأداء الشخصي الخام
    blendedCapGrowth: h.blendedCapGrowth ?? null,    // المستخدم فعلياً في السيناريوهات
    marketBenchmark:  h.marketBenchmark ?? null,     // v3: الأساس
    perfWeight:       h.perfWeight ?? null,          // v3: وزن أدائك في المزج
    safeDivYield:     h.safeDivYield ?? null,
    divYieldSource:   h.divYieldSource ?? null,      // v3: 'forward' | 'historical'
    fwdAnnualIncome:  h.fwdAnnualIncome ?? null,     // v3
    xirr:             h.xirr ?? null,
    holdingsCount:    h.holdingsCount ?? null,
    divYears:         h.divYears ?? null,
  };
}

// ── أفق خطة الضخ (مستقل عن أفق الصفحة) ──────────────────────────────
// الأفق العام محصور بخيارات قائمة، أما هذا فحرّ (1–45) لأن المالك يجرّب
// مُدداً محدّدة («سنة، 5، 20») لا خيارات مُعدّة.
const PLAN_H_MIN = 1, PLAN_H_MAX = 45;

function planHorizonYears() {
  const el = document.getElementById('plan-horizon');
  const v  = el ? parseInt(el.value, 10) : NaN;
  if (Number.isFinite(v) && v >= PLAN_H_MIN && v <= PLAN_H_MAX) return v;
  return parseInt(document.getElementById('inp-horizon')?.value, 10) || 35;
}

// وسم اللمس: بعده لا يدهس الأفقُ العام قيمةَ المالك
function onPlanHorizonInput() {
  const el = document.getElementById('plan-horizon');
  if (el) el.dataset.touched = el.value.trim() ? '1' : '';
}

// يعكس الأفق العام على خانة الخطة ما لم يلمسها المالك
function syncPlanHorizonFromGlobal() {
  const el = document.getElementById('plan-horizon');
  if (!el || el.dataset.touched === '1') return;
  el.value = parseInt(document.getElementById('inp-horizon')?.value, 10) || 35;
}

// ضبط خانة الخطة صراحةً (تحميل خطة محفوظة) — يُعدّ لمساً فلا يُدهَس لاحقاً
function setPlanHorizon(years) {
  const el = document.getElementById('plan-horizon');
  if (!el || !Number.isFinite(+years)) return;
  el.value = Math.min(PLAN_H_MAX, Math.max(PLAN_H_MIN, Math.round(+years)));
  el.dataset.touched = '1';
}

// قراءة مدخلات الصفحة الحالية للخطة
function _readPlanInputs() {
  return {
    startValue:     parseFloat(document.getElementById('inp-current-value').value) || (_hist?.currentValue) || 0,
    lumpSum:        parseFloat(document.getElementById('inp-lump-sum').value) || 0,
    // أفق الخطة مستقل عن أفق الصفحة: المالك يجرّب «كم أضخّ لأصل خلال 5 سنوات؟»
    // بلا أن يقلب الرسم والجدول. فارغ = يتبع الأفق العام (السلوك السابق).
    horizonYears:   planHorizonYears(),
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
    // ── مادة اللقطة المجمّدة (لا تدخل في أي حساب — تُحفظ فقط) ──
    path:           _compressPath(snaps),
    scenariosUsed:  _scenarios.map(s => ({ key: s.key, capRate: s.capRate, divRate: s.divRate })),
    context:        _snapshotContext(),
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
      ${goalBasisNote(!!inp.adjustInflation, inp.inflationRate, inp.horizonYears)}
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

// بناء كائن الخطة المجمّدة من آخر حساب — لقطة كافية لإعادة العرض بلا حساب حيّ
function _buildFrozenPlan(pl, notes) {
  const now = new Date();
  return {
    id: Date.now(),
    schemaVersion: PLAN_SCHEMA_VERSION,
    date: now.toLocaleDateString('en-GB'),
    createdISO: now.toISOString(),
    baseYear: now.getFullYear(),          // مرجع سنوات المسار (السنة 0 = هذه)
    notes,
    // ① كل المدخلات (startValue والأفق والتضخم ضمنها)
    inp: { ...pl.inp },
    // ② معدّلات السيناريو المستخدمة فعلاً — المختار + كل المعروضة
    scenario:      { ...pl.scenario },
    scenariosUsed: pl.scenariosUsed || [],
    // ③ النتيجة المجمّدة
    requiredPMT:      pl.requiredPMT,
    alreadyReached:   pl.alreadyReached,
    impossible:       pl.impossible,
    targetFinalValue: pl.targetFinalValue,
    finalValue:       pl.finalValue,
    finalIncome:      pl.finalIncome,
    totalContributed: pl.totalContributed,
    // ④ مسار الإسقاط السنوي — يسمح بإعادة رسم نفس المنحنى حرفياً
    path: pl.path || [],
    // ⑤ سياق البيانات وقت الحفظ
    context: pl.context || _snapshotContext(),
  };
}

// حفظ خطة جديدة، أو تحديث خطة قائمة بضغطة صريحة (updateId)
async function saveForecastPlan(updateId) {
  if (!_lastComputedPlan) { showToast('احسب الخطة أولاً', 'warning'); return; }
  const pl = _lastComputedPlan;

  if (updateId) {
    const idx = _forecastPlans.findIndex(x => x.id === updateId);
    if (idx === -1) { showToast('الخطة غير موجودة', 'warning'); return; }
    const old = _forecastPlans[idx];
    const ok = await confirmAsync(
      `تحديث الخطة «${old.notes || 'بلا ملاحظة'}» بأرقام اليوم؟\nستُستبدل اللقطة المجمّدة المحفوظة في ${old.date} ولا يمكن التراجع.`);
    if (!ok) return;
    const fresh = _buildFrozenPlan(pl, old.notes || '');
    fresh.id            = old.id;               // نُبقي المعرّف والملاحظة
    fresh.originalISO   = old.originalISO || old.createdISO;
    fresh.revision      = (+old.revision || 1) + 1;
    _forecastPlans[idx] = fresh;
    _planCompare = null;
    await _persistForecastPlans();
    renderForecastPlans();
    renderSavedPlanView(fresh.id);
    showToast('حُدِّثت الخطة بأرقام اليوم ✓', 'success');
    return;
  }

  const notes = (document.getElementById('plan-notes')?.value || '').trim();
  _forecastPlans.unshift(_buildFrozenPlan(pl, notes));
  await _persistForecastPlans();
  renderForecastPlans();
  showToast('تم حفظ الخطة كلقطة مجمّدة ✓', 'success');
}

async function deleteForecastPlan(id) {
  const p = _forecastPlans.find(x => x.id === id);
  const label = p ? (p.notes || (p.inp.goalType === 'monthly_income' ? `دخل ${fmt(p.inp.goalAmount)}` : `محفظة ${fmt(p.inp.goalAmount)}`)) : '';
  const ok = await confirmAsync(`حذف الخطة «${label}» نهائياً؟\nلا يمكن التراجع.`);
  if (!ok) return;
  _forecastPlans = _forecastPlans.filter(x => x.id !== id);
  if (_planCompare?.id === id) _planCompare = null;
  await _persistForecastPlans();
  renderForecastPlans();
  if (_viewedPlanId === id) closeSavedPlanView();   // لا نُغلق عرض خطة أخرى
  showToast('حُذفت الخطة', 'info');
}

// ══════════════════════════════════════════════════════════════════════
// عرض الخطة المحفوظة — الأرقام المجمّدة كما حُسبت، بلا أي حساب حيّ
// ══════════════════════════════════════════════════════════════════════
function openSavedPlan(id) {
  _planCompare = null;
  renderSavedPlanView(id);
  document.getElementById('saved-plan-view-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeSavedPlanView() {
  _planCompare = null;
  _viewedPlanId = null;
  const card = document.getElementById('saved-plan-view-card');
  if (card) card.style.display = 'none';
}

const _planTitle = p => p.notes
  ? esc(p.notes)
  : (p.inp.goalType === 'monthly_income' ? `دخل ${fmt(p.inp.goalAmount)} ر.س/شهر` : `محفظة ${fmt(p.inp.goalAmount)} ر.س`);

function _planPmtText(p) {
  if (p.alreadyReached) return 'لا حاجة لضخ';
  return p.requiredPMT == null ? '—' : `${fmt(p.requiredPMT)} ر.س/شهر`;
}

function renderSavedPlanView(id) {
  const card = document.getElementById('saved-plan-view-card');
  const box  = document.getElementById('saved-plan-view');
  if (!card || !box) return;
  const p = _forecastPlans.find(x => x.id === id);
  if (!p) { card.style.display = 'none'; _viewedPlanId = null; return; }
  card.style.display = 'block';
  _viewedPlanId = id;

  const frozen = _isFrozenPlan(p);
  const titleEl = document.getElementById('saved-plan-view-title');
  if (titleEl) titleEl.innerHTML = `📄 ${_planTitle(p)}`;

  const stamp = frozen
    ? `<span class="tag" data-state="good">🔒 مجمَّدة — كما حُسبت في ${esc(p.date)}${p.revision > 1 ? ` (مراجعة ${p.revision})` : ''}</span>`
    : `<span class="tag" data-state="warn">⚠️ خطة قديمة — بلا لقطة مجمّدة</span>`;

  const goalTxt = p.inp.goalType === 'monthly_income'
    ? `دخل شهري ${fmt(p.inp.goalAmount)} ر.س` : `قيمة محفظة ${fmt(p.inp.goalAmount)} ر.س`;

  // ── الترويسة: الرقم البطل ──
  const head = `
    <div class="stack-2" style="margin-bottom:14px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${stamp}
        <span class="tag">🎯 ${esc(goalTxt)}</span>
        <span class="tag">⏳ ${p.inp.horizonYears} سنة</span>
        <span class="tag">${esc(_scenLabel(p.inp.scenarioKey))}</span>
      </div>
      <div class="hero-num">${p.alreadyReached ? 'لا حاجة لضخ ✅' : (p.requiredPMT == null ? '—' : fmt(p.requiredPMT))}
        ${p.alreadyReached || p.requiredPMT == null ? '' : '<span class="unit">ر.س / شهر</span>'}</div>
      <div class="hero-cap">الضخ الشهري الثابت الذي يبلغ الهدف في نهاية الأفق — بالأرقام المحفوظة، لا المُعاد حسابها.</div>
    </div>`;

  if (!frozen) {
    box.innerHTML = head + `
      <div class="note" data-state="warn" style="margin-bottom:12px">
        <span class="ic">🕰️</span>
        <div>هذه الخطة حُفظت قبل تفعيل اللقطة المجمَّدة، فلا تحمل مسار الإسقاط ولا معدّلات السيناريو وقت حفظها.
        المعروض أدناه مدخلاتها ونتيجتها النهائية فقط. لتجميدها: اضغط «أعد الحساب ببيانات اليوم» ثم احفظها كخطة محدَّثة.</div>
      </div>
      <div class="kvs" style="margin-bottom:14px">
        ${_kv('القيمة الابتدائية', fmt(p.inp.startValue))}
        ${_kv('مبلغ فوري', fmt(p.inp.lumpSum || 0))}
        ${_kv('الأفق', p.inp.horizonYears + ' سنة')}
        ${_kv('الضخ المطلوب', _planPmtText(p))}
        ${_kv('القيمة المتوقّعة عند الهدف', fmt(p.finalValue))}
        ${_kv('إجمالي ما ستضخّه', fmt(p.totalContributed))}
      </div>
      ${_planActionsBar(p, false)}
      ${_planCompareBlock(p)}`;
    return;
  }

  // ── المدخلات المجمّدة ──
  const infl = p.inp.adjustInflation
    ? `مفعّل (${((p.inp.inflationRate || 0) * 100).toFixed(1)}%)` : 'مطفأ';
  const inputsKvs = `
    <div class="kvs">
      ${_kv('القيمة الابتدائية وقت الحفظ', fmt(p.inp.startValue))}
      ${_kv('مبلغ فوري', fmt(p.inp.lumpSum || 0))}
      ${_kv('الأفق الزمني', p.inp.horizonYears + ' سنة')}
      ${_kv('الهدف', goalTxt)}
      ${_kv('إعادة استثمار التوزيعات', p.inp.reinvest ? 'نعم' : 'لا')}
      ${_kv('تعديل التضخم', infl)}
      ${_kv('الهدف الاسمي عند نهاية الأفق', fmt(p.targetFinalValue))}
      ${_kv('القيمة المتوقّعة عند الهدف', fmt(p.finalValue))}
      ${_kv('الدخل الشهري عند نهاية الأفق', fmt(p.finalIncome))}
      ${_kv('إجمالي ما ستضخّه', fmt(p.totalContributed))}
    </div>`;

  // ── معدّلات السيناريوهات المجمّدة ──
  const rates = (p.scenariosUsed && p.scenariosUsed.length ? p.scenariosUsed : [p.scenario]).map(s => {
    const chosen = s.key === p.inp.scenarioKey;
    return `<tr${chosen ? ' style="font-weight:700"' : ''}>
      <td>${esc(_scenLabel(s.key))}${chosen ? ' ✓' : ''}</td>
      <td class="num">${pct(s.capRate)}</td>
      <td class="num">${pct(s.divRate)}</td>
      <td class="num">${pct(effectiveTotalRate(s.capRate, s.divRate))}</td>
    </tr>`;
  }).join('');

  // ── جدول المعالم من المسار المحفوظ ──
  const milestoneRows = _frozenMilestoneRows(p);

  // ── سياق البيانات ──
  const c = p.context || {};
  const ctxKvs = `
    <div class="kvs">
      ${_kv('درجة ثقة البيانات (عمر · دورات أرباح · عدد أسهم)', c.confidenceScore != null ? c.confidenceScore + '%' : 'غير متوفرة')}
      ${_kv('عمر رأس المال الفعلي', c.capitalWeightedMonths != null ? c.capitalWeightedMonths + ' شهر' : 'غير متوفر')}
      ${_kv('عمر المحفظة التقويمي', c.yearsActive != null ? c.yearsActive + ' سنة' : 'غير متوفر')}
      ${_kv('أداؤك الشخصي (تشخيص)', c.annCapGrowth != null ? pct(c.annCapGrowth) : 'غير متوفر')}
      ${_kv('أساس المزج — معيار تاسي', c.marketBenchmark != null ? pct(c.marketBenchmark) : 'غير متوفر')}
      ${_kv('وزن أدائك في المزج', c.perfWeight != null ? (c.perfWeight * 100).toFixed(1) + '%' : 'غير متوفر')}
      ${_kv('النمو المُستخدَم (بعد المزج)', c.blendedCapGrowth != null ? pct(c.blendedCapGrowth) : 'غير متوفر')}
      ${_kv('عائد التوزيعات المُستخدَم', c.safeDivYield != null ? pct(c.safeDivYield) : 'غير متوفر')}
      ${_kv('مصدر عائد التوزيعات', c.divYieldSource === 'forward' ? 'forward من الحيازات' : c.divYieldSource === 'historical' ? 'تاريخي (تقديري)' : 'غير متوفر')}
      ${_kv('الدخل السنوي المتوقَّع وقت الحفظ', c.fwdAnnualIncome != null ? fmt(c.fwdAnnualIncome) : 'غير متوفر')}
      ${_kv('XIRR وقت الحفظ', c.xirr != null ? c.xirr.toFixed(2) + '%' : 'غير متوفر')}
      ${_kv('عدد الأسهم وقت الحفظ', c.holdingsCount != null ? String(c.holdingsCount) : 'غير متوفر')}
      ${_kv('قيمة المحفظة وقت الحفظ', c.portfolioValue != null ? fmt(c.portfolioValue) : 'غير متوفرة')}
    </div>`;

  box.innerHTML = head + `
    <div class="note" data-state="good" style="margin-bottom:14px">
      <span class="ic">🔒</span>
      <div>كل رقم هنا محفوظ حرفياً كما حُسب في <b>${esc(p.date)}</b> — لا يُعاد حسابه ولا يتأثر بتغيّر بيانات محفظتك بعد ذلك.
      لمقارنته بواقع اليوم استخدم زر «أعد الحساب ببيانات اليوم» أدناه؛ لن يُكتب فوق الخطة إلا بحفظ صريح.</div>
    </div>
    <h4 style="font-size:.86rem;margin:0 0 8px">① المدخلات والهدف</h4>
    ${inputsKvs}
    <h4 style="font-size:.86rem;margin:16px 0 8px">② معدّلات السيناريوهات المستخدمة فعلاً</h4>
    <div class="table-wrap" style="overflow-x:auto">
      <table style="width:100%;font-size:.82rem"><thead><tr>
        <th>السيناريو</th><th>نمو رأس المال</th><th>عائد التوزيعات</th><th>الإجمالي</th>
      </tr></thead><tbody>${rates}</tbody></table>
    </div>
    <h4 style="font-size:.86rem;margin:16px 0 8px">③ مسار الإسقاط المحفوظ</h4>
    <div class="table-wrap" style="overflow-x:auto">
      <table style="width:100%;font-size:.82rem"><thead><tr>
        <th>السنة</th><th>العام</th><th>قيمة المحفظة</th><th>رأس مالك المُضاف</th>
        <th>تراكمي التوزيعات</th><th>القيمة الحقيقية</th><th>الدخل الشهري</th>
      </tr></thead><tbody>${milestoneRows}</tbody></table>
    </div>
    <h4 style="font-size:.86rem;margin:16px 0 8px">④ سياق البيانات وقت الحفظ</h4>
    ${ctxKvs}
    ${_planActionsBar(p, true)}
    ${_planCompareBlock(p)}`;
}

const _kv = (k, v) => `<div class="kv"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`;

// صفوف المعالم من المسار المحفوظ (خطوة 1 سنة حتى 20، ثم 5 سنوات)
function _frozenMilestoneRows(p) {
  const path = p.path || [];
  const step = p.inp.horizonYears <= 20 ? 1 : 5;
  const baseYear = p.baseYear || new Date(p.createdISO || Date.now()).getFullYear();
  const out = [];
  path.forEach(s => {
    if (s.y === 0) return;
    if (s.y % step !== 0 && s.y !== p.inp.horizonYears) return;
    out.push(`<tr>
      <td>${s.y}</td>
      <td>${baseYear + s.y}</td>
      <td class="num">${fmtShort(s.v)}</td>
      <td class="num">${fmtShort((p.inp.startValue || 0) + s.a)}</td>
      <td class="num">${fmtShort(s.d)}</td>
      <td class="num">${fmtShort(s.r)}</td>
      <td class="num">${fmtShort(s.i)}</td>
    </tr>`);
  });
  return out.join('');
}

function _planActionsBar(p, frozen) {
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
      <button class="btn btn-primary btn-sm" onclick="recalcPlanWithToday(${p.id})">🔄 أعد الحساب ببيانات اليوم</button>
      <button class="btn btn-secondary btn-sm" onclick="exportPlanToPDF(${p.id})">📄 تصدير PDF</button>
      <button class="btn btn-secondary btn-sm" onclick="loadForecastPlanIntoInputs(${p.id})">✏️ حمّل مدخلاتها للتعديل</button>
      <button class="btn btn-secondary btn-sm" onclick="closeSavedPlanView()" style="margin-inline-start:auto">إغلاق</button>
    </div>
    ${frozen ? '' : `<p class="small text-muted" style="margin-top:6px">إعادة الحساب لا تمسّ المحفوظ — الكتابة فوقه تحتاج ضغطة حفظ صريحة.</p>`}`;
}

// ══════════════════════════════════════════════════════════════════════
// إعادة الحساب ببيانات اليوم — مقارنة جنباً إلى جنب بلا كتابة فوق الخطة
// ══════════════════════════════════════════════════════════════════════
function recalcPlanWithToday(id) {
  const p = _forecastPlans.find(x => x.id === id);
  if (!p) return;
  if (!_hist || !_scenarios.length) { showToast('لا توجد بيانات كافية بعد', 'warning'); return; }

  // نفس الهدف والأفق والسيناريو — لكن بقيمة محفظة اليوم وعائد توزيعات اليوم
  const i = p.inp;
  document.getElementById('inp-current-value').value = Math.round(_hist.currentValue || 0);
  document.getElementById('inp-lump-sum').value      = i.lumpSum || 0;
  document.getElementById('inp-goal-amount').value   = i.goalAmount || '';
  document.getElementById('inp-reinvest').checked    = !!i.reinvest;
  document.getElementById('inp-inflation').checked   = !!i.adjustInflation;
  if (i.inflationRate) document.getElementById('inp-inflation-rate').value = (i.inflationRate * 100).toFixed(1);
  const dyInp = document.getElementById('inp-div-yield');
  if (dyInp) dyInp.value = '';                       // «بيانات اليوم» = العائد التلقائي الفعلي
  document.getElementById('plan-scenario').value = i.scenarioKey || 'base';
  setGoalType(i.goalType || 'portfolio_value');
  const hSel = document.getElementById('inp-horizon');
  if (hSel) {
    const opts = [...hSel.options].map(o => +o.value);
    hSel.value = opts.reduce((pp, c) => Math.abs(c - i.horizonYears) < Math.abs(pp - i.horizonYears) ? c : pp);
  }
  // الأفق العام محصور بخيارات القائمة فيُقرَّب؛ أفق الخطة حرّ فيأخذ القيمة الأصلية كما حُفظت
  setPlanHorizon(i.horizonYears);

  runForecast();
  computeContributionPlan();
  if (!_lastComputedPlan) return;

  _planCompare = { id, live: _lastComputedPlan, at: new Date().toLocaleDateString('en-GB') };
  renderSavedPlanView(id);
  document.getElementById('plan-compare-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function _cmpRow(label, savedVal, liveVal, fmtFn, higherIsBetter) {
  const has = savedVal != null && liveVal != null && isFinite(savedVal) && isFinite(liveVal);
  let diffTxt = '—', state = '';
  if (has) {
    const abs = liveVal - savedVal;
    const rel = Math.abs(savedVal) > 1e-9 ? (abs / Math.abs(savedVal)) * 100 : null;
    const flat = Math.abs(rel ?? 0) < 0.05;
    const good = higherIsBetter == null ? null : (higherIsBetter ? abs > 0 : abs < 0);
    state = flat ? '' : (good == null ? '' : good ? ' data-state="good"' : ' data-state="bad"');
    const sign = abs > 0 ? '▲ +' : abs < 0 ? '▼ ' : '= ';
    diffTxt = flat ? '= بلا تغيّر'
      : `${sign}${fmtFn(Math.abs(abs))}${rel != null ? ` (${abs > 0 ? '+' : '−'}${Math.abs(rel).toFixed(1)}%)` : ''}`;
  }
  return `<tr>
    <td>${esc(label)}</td>
    <td class="num">${has || savedVal != null ? fmtFn(savedVal) : '—'}</td>
    <td class="num">${has || liveVal != null ? fmtFn(liveVal) : '—'}</td>
    <td class="num"><span class="tag"${state}>${diffTxt}</span></td>
  </tr>`;
}

function _planCompareBlock(p) {
  if (!_planCompare || _planCompare.id !== p.id) return '<div id="plan-compare-anchor"></div>';
  const L = _planCompare.live;
  const pctFn = v => v == null ? '—' : pct(v);
  const numFn = v => v == null ? '—' : fmt(v);

  const rows = [
    _cmpRow('القيمة الابتدائية للمحفظة', p.inp.startValue, L.inp.startValue, numFn, true),
    _cmpRow('نمو رأس المال المفترض/سنة', p.scenario?.capRate, L.scenario.capRate, pctFn, true),
    _cmpRow('عائد التوزيعات المفترض/سنة', p.scenario?.divRate, L.scenario.divRate, pctFn, true),
    _cmpRow('الضخ الشهري المطلوب', p.alreadyReached ? 0 : p.requiredPMT, L.alreadyReached ? 0 : L.requiredPMT, numFn, false),
    _cmpRow('القيمة عند نهاية الأفق', p.finalValue, L.finalValue, numFn, true),
    _cmpRow('الدخل الشهري عند نهاية الأفق', p.finalIncome, L.finalIncome, numFn, true),
    _cmpRow('إجمالي ما ستضخّه', p.totalContributed, L.totalContributed, numFn, false),
    _cmpRow('درجة ثقة البيانات', p.context?.confidenceScore != null ? p.context.confidenceScore / 100 : null,
            L.context?.confidenceScore != null ? L.context.confidenceScore / 100 : null, pctFn, true),
  ].join('');

  return `
    <div id="plan-compare-anchor" style="margin-top:18px;padding-top:14px;border-top:2px solid var(--border)">
      <div class="card-head" style="margin-bottom:10px">
        <span class="ttl">⚖️ المحفوظ مقابل اليوم</span>
        <span class="sub">حُسب بالبيانات الحيّة في ${esc(_planCompare.at)} — لم يُحفَظ شيء</span>
      </div>
      <div class="note" style="margin-bottom:10px">
        <span class="ic">ℹ️</span>
        <div>الهدف والأفق والسيناريو كما في الخطة، لكن القيمة الابتدائية ومعدّلات السيناريو من بيانات محفظتك اليوم.
        الفروق أدناه هي <b>معلومة</b> عن انحراف الواقع عن الخطة — لا تغييراً فيها.</div>
      </div>
      <div class="table-wrap" style="overflow-x:auto">
        <table style="width:100%;font-size:.82rem"><thead><tr>
          <th>البند</th><th>المحفوظ (${esc(p.date)})</th><th>اليوم</th><th>الفرق</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-success btn-sm" onclick="saveForecastPlan(${p.id})">💾 احفظ أرقام اليوم فوق هذه الخطة</button>
        <button class="btn btn-secondary btn-sm" onclick="_planCompare=null;renderSavedPlanView(${p.id})">أخفِ المقارنة</button>
      </div>
      <p class="small text-muted" style="margin-top:6px">أو احفظها كخطة جديدة مستقلة من بطاقة «خطة الضخ» أعلاه (زر «احفظ هذه الخطة») لتُبقي القديمة كما هي.</p>
    </div>`;
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
  // الأفق العام محصور بخيارات القائمة فيُقرَّب؛ أفق الخطة حرّ فيأخذ القيمة الأصلية كما حُفظت
  setPlanHorizon(i.horizonYears);
  runForecast();
  computeContributionPlan();
  document.getElementById('plan-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('حُمِّلت مدخلات الخطة للتعديل — الخطة المحفوظة لم تتغيّر', 'info');
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
    const pmtTxt = _planPmtText(p);
    const frozen = _isFrozenPlan(p);
    const badge = frozen
      ? `<span class="tag" data-state="good">🔒 مجمَّدة</span>`
      : `<span class="tag" data-state="warn" title="حُفظت قبل تفعيل اللقطة المجمّدة — بلا مسار ولا معدّلات محفوظة">⚠️ خطة قديمة</span>`;
    return `
    <div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:var(--bg-2)">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span>${p.notes ? esc(p.notes) : goalTxt}</span>${badge}
          </div>
          ${p.notes ? `<div class="small text-muted">${goalTxt}</div>` : ''}
          <div class="small text-muted" style="margin-top:4px">
            الضخ المطلوب: <b style="color:var(--accent)">${pmtTxt}</b> ·
            ${p.inp.horizonYears} سنة · ${_scenLabel(p.inp.scenarioKey)} · حُفظت ${esc(p.date)}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="openSavedPlan(${p.id})">📂 افتح</button>
          <button class="btn btn-secondary btn-sm" onclick="exportPlanToPDF(${p.id})">📄 تصدير PDF</button>
          <button class="btn btn-secondary btn-sm" onclick="loadForecastPlanIntoInputs(${p.id})">تحميل</button>
          <button class="btn btn-danger btn-sm" onclick="deleteForecastPlan(${p.id})">حذف</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════
// 📄 تصدير الخطة إلى PDF — بلا مكتبات خارجية
// نبني طبقة تقرير مخصّصة للطباعة (خلفية بيضاء/حبر أسود/RTL) ثم window.print()
// فيحفظها المستخدم PDF من حوار الطباعة («حفظ كـ PDF» وجهة الطباعة).
// ══════════════════════════════════════════════════════════════════════

// رسم المسار المحفوظ على canvas مؤقّت خارج الشاشة ثم تصويره PNG.
// لا نصوّر مخطط الصفحة الحيّ لأنه يعرض السيناريوهات الحيّة لا مسار الخطة المجمّد.
function _planChartImage(p) {
  const path = Array.isArray(p.path) ? p.path : [];
  if (typeof Chart === 'undefined') return null;
  if (path.length < 2) {
    // خطة قديمة بلا مسار: نرجع لمخطط الصفحة الظاهر إن وُجد (مع وسم أنه حيّ)
    const live = document.getElementById('forecast-chart');
    try { return (live && _forecastChart) ? live.toDataURL('image/png') : null; } catch (_) { return null; }
  }

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:960px;height:440px;pointer-events:none';
  const cv = document.createElement('canvas');
  cv.width = 960; cv.height = 440;
  host.appendChild(cv);
  document.body.appendChild(host);

  const baseYear = p.baseYear || new Date(p.createdISO || Date.now()).getFullYear();
  const labels   = path.map(s => String(baseYear + s.y));
  const start    = p.inp.startValue || 0;

  // ألوان الطباعة: حبر داكن على أبيض — الثيم الداكن يُطبع رديئاً
  const INK = '#1a1a1a', GRID = '#d0d0d0';
  const datasets = [
    { label: 'قيمة المحفظة (اسمية)', data: path.map(s => s.v),
      borderColor: '#166534', backgroundColor: 'rgba(22,101,52,0.10)', borderWidth: 2.5, fill: true, tension: .3, pointRadius: 0 },
    { label: 'رأس مالك المُضاف', data: path.map(s => start + s.a),
      borderColor: '#1d4ed8', borderDash: [6, 4], borderWidth: 2, fill: false, tension: .1, pointRadius: 0 },
  ];
  if (p.inp.adjustInflation) {
    datasets.push({ label: 'القيمة الحقيقية (بقوة شراء اليوم)', data: path.map(s => s.r),
      borderColor: '#b45309', borderDash: [3, 3], borderWidth: 2, fill: false, tension: .3, pointRadius: 0 });
  }
  if (p.targetFinalValue > 0 && isFinite(p.targetFinalValue)) {
    datasets.push({ label: 'الهدف', data: path.map(() => Math.round(p.targetFinalValue)),
      borderColor: '#b91c1c', borderDash: [8, 5], borderWidth: 2, fill: false, tension: 0, pointRadius: 0 });
  }

  const whiteBg = {
    id: 'prWhiteBg',
    beforeDraw(chart) {
      const { ctx, width, height } = chart;
      ctx.save(); ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); ctx.restore();
    },
  };

  let url = null, ch = null;
  try {
    ch = new Chart(cv, {
      type: 'line',
      data: { labels, datasets },
      plugins: [whiteBg],
      options: {
        responsive: false, animation: false, devicePixelRatio: 2,
        interaction: { mode: 'index' },
        plugins: {
          legend: { rtl: true, textDirection: 'rtl', labels: { color: INK, font: { family: 'Tajawal', size: 13 }, boxWidth: 14 } },
          tooltip: { enabled: false },
        },
        scales: {
          x: { ticks: { color: INK, font: { family: 'Tajawal', size: 11 }, maxTicksLimit: 12 }, grid: { color: GRID } },
          y: { ticks: { color: INK, font: { family: 'Tajawal', size: 11 }, callback: v => fmtShort(v) }, grid: { color: GRID } },
        },
      },
    });
    url = cv.toDataURL('image/png');
  } catch (e) {
    console.warn('plan chart image failed:', e);
  } finally {
    if (ch) ch.destroy();
    host.remove();
  }
  return url;
}

// كل صفوف المسار للتقرير (خطوة 1 سنة حتى 25، ثم كل 5 سنوات + السنة الأخيرة)
function _planReportRows(p) {
  const path = Array.isArray(p.path) ? p.path : [];
  if (!path.length) return '';
  const H = p.inp.horizonYears;
  const step = H <= 25 ? 1 : 5;
  const baseYear = p.baseYear || new Date(p.createdISO || Date.now()).getFullYear();
  const start = p.inp.startValue || 0;
  return path.filter(s => s.y > 0 && (s.y % step === 0 || s.y === H)).map(s => `<tr>
      <td>${s.y}</td><td>${baseYear + s.y}</td>
      <td class="pr-n">${fmtShort(s.v)}</td>
      <td class="pr-n">${fmtShort(start + s.a)}</td>
      <td class="pr-n">${fmtShort(s.d)}</td>
      <td class="pr-n">${fmtShort(s.r)}</td>
      <td class="pr-n">${fmtShort(s.i)}</td>
    </tr>`).join('');
}

const _prKv = (k, v) => `<div class="pr-kv"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`;

function exportPlanToPDF(planId) {
  const p = _forecastPlans.find(x => x.id === planId);
  if (!p) { showToast('الخطة غير موجودة', 'warning'); return; }

  const frozen  = _isFrozenPlan(p);
  const goalTxt = p.inp.goalType === 'monthly_income'
    ? `دخل شهري ${fmt(p.inp.goalAmount)} ر.س` : `قيمة محفظة ${fmt(p.inp.goalAmount)} ر.س`;
  const imgUrl  = _planChartImage(p);
  const c       = p.context || {};
  const baseYear = p.baseYear || new Date(p.createdISO || Date.now()).getFullYear();

  const stamp = frozen
    ? `<span class="pr-tag pr-tag-ok">🔒 لقطة مجمَّدة — الأرقام كما حُسبت في ${esc(p.date)}</span>`
    : `<span class="pr-tag pr-tag-warn">⚠️ خطة قديمة — بلا لقطة مجمّدة (المعروض: مدخلاتها ونتيجتها فقط)</span>`;

  const ratesRows = (p.scenariosUsed && p.scenariosUsed.length ? p.scenariosUsed : (p.scenario ? [p.scenario] : []))
    .map(s => `<tr${s.key === p.inp.scenarioKey ? ' class="pr-strong"' : ''}>
        <td>${esc(_scenLabel(s.key))}${s.key === p.inp.scenarioKey ? ' ✓ (المعتمد)' : ''}</td>
        <td class="pr-n">${pct(s.capRate)}</td><td class="pr-n">${pct(s.divRate)}</td>
        <td class="pr-n">${pct(effectiveTotalRate(s.capRate, s.divRate))}</td>
      </tr>`).join('');

  const pathRows = _planReportRows(p);

  const html = `
    <div class="pr-sheet">
      <div class="pr-noprint pr-bar">
        <button type="button" class="pr-btn pr-btn-main" onclick="window.print()">🖨️ اطبع / احفظ كـ PDF</button>
        <button type="button" class="pr-btn" onclick="closePlanReport()">إغلاق</button>
        <span class="pr-hint">من حوار الطباعة اختر الوجهة «حفظ كـ PDF» (Save as PDF).</span>
      </div>

      <header class="pr-head pr-block">
        <div class="pr-brand">ثروة — الرؤية المستقبلية · خطة الضخ للوصول للهدف</div>
        <h1 class="pr-title">${p.notes ? esc(p.notes) : esc(goalTxt)}</h1>
        <div class="pr-sub">${p.notes ? esc(goalTxt) + ' · ' : ''}حُفظت في ${esc(p.date)}${p.revision > 1 ? ` · مراجعة ${p.revision}` : ''} · طُبعت في ${new Date().toLocaleDateString('en-GB')}</div>
        <div class="pr-stamps">${stamp}</div>
      </header>

      <section class="pr-block">
        <div class="pr-hero">
          <div class="pr-hero-v">${p.alreadyReached ? 'لا حاجة لضخ إضافي' : (p.requiredPMT == null ? '—' : fmt(p.requiredPMT))}</div>
          <div class="pr-hero-l">${p.alreadyReached ? 'أصولك وقت الحفظ تبلغ الهدف وحدها في نهاية الأفق' : 'الضخ الشهري الثابت المطلوب للوصول للهدف'}</div>
        </div>
      </section>

      <section class="pr-block">
        <h2 class="pr-h2">① المدخلات والهدف</h2>
        <div class="pr-kvs">
          ${_prKv('الهدف', goalTxt)}
          ${_prKv('الأفق الزمني', p.inp.horizonYears + ' سنة (' + baseYear + ' → ' + (baseYear + p.inp.horizonYears) + ')')}
          ${_prKv('السيناريو المعتمد', _scenLabel(p.inp.scenarioKey))}
          ${_prKv('القيمة الابتدائية وقت الحفظ', fmt(p.inp.startValue))}
          ${_prKv('مبلغ فوري', fmt(p.inp.lumpSum || 0))}
          ${_prKv('إعادة استثمار التوزيعات', p.inp.reinvest ? 'نعم' : 'لا')}
          ${_prKv('تعديل التضخم', p.inp.adjustInflation ? `مفعّل (${((p.inp.inflationRate || 0) * 100).toFixed(1)}%)` : 'مطفأ')}
          ${_prKv('الهدف الاسمي عند نهاية الأفق', fmt(p.targetFinalValue))}
          ${_prKv('القيمة المتوقّعة عند الهدف', fmt(p.finalValue))}
          ${_prKv('الدخل الشهري عند نهاية الأفق', p.finalIncome != null ? fmt(p.finalIncome) : 'غير متوفر')}
          ${_prKv('إجمالي ما ستضخّه', fmt(p.totalContributed))}
        </div>
      </section>

      ${imgUrl ? `
      <section class="pr-block">
        <h2 class="pr-h2">② مسار الإسقاط المحفوظ</h2>
        <img class="pr-img" src="${imgUrl}" alt="مخطط مسار نمو المحفظة للخطة المحفوظة">
        ${frozen ? '' : '<div class="pr-note">المخطط أعلاه من الإسقاط الحيّ في الصفحة — هذه الخطة القديمة لا تحمل مساراً محفوظاً.</div>'}
      </section>` : ''}

      ${ratesRows ? `
      <section class="pr-block">
        <h2 class="pr-h2">③ معدّلات السيناريوهات المستخدمة فعلاً</h2>
        <table class="pr-table">
          <thead><tr><th>السيناريو</th><th>نمو رأس المال/سنة</th><th>عائد التوزيعات/سنة</th><th>الإجمالي/سنة</th></tr></thead>
          <tbody>${ratesRows}</tbody>
        </table>
      </section>` : ''}

      ${pathRows ? `
      <section class="pr-block">
        <h2 class="pr-h2">④ المعالم السنوية من المسار المحفوظ</h2>
        <table class="pr-table">
          <thead><tr>
            <th>السنة</th><th>العام</th><th>قيمة المحفظة</th><th>رأس مالك المُضاف</th>
            <th>تراكمي التوزيعات</th><th>القيمة الحقيقية</th><th>الدخل الشهري</th>
          </tr></thead>
          <tbody>${pathRows}</tbody>
        </table>
        <div class="pr-note">القيم بالريال السعودي (م = مليون، ألف = ألف). «القيمة الحقيقية» = بقوة شراء ${baseYear} بعد خصم التضخم. «الدخل الشهري» = قيمة المحفظة × عائد التوزيعات ÷ 12.</div>
      </section>` : ''}

      <section class="pr-block">
        <h2 class="pr-h2">⑤ سياق البيانات وقت الحفظ</h2>
        <div class="pr-kvs">
          ${_prKv('درجة ثقة البيانات', c.confidenceScore != null ? c.confidenceScore + '%' : 'غير متوفرة')}
          ${_prKv('عمر رأس المال الفعلي', c.capitalWeightedMonths != null ? c.capitalWeightedMonths + ' شهر' : 'غير متوفر')}
          ${_prKv('عمر المحفظة التقويمي', c.yearsActive != null ? c.yearsActive + ' سنة' : 'غير متوفر')}
          ${_prKv('أداؤك الشخصي (تشخيص)', c.annCapGrowth != null ? pct(c.annCapGrowth) : 'غير متوفر')}
          ${_prKv('أساس المزج — معيار تاسي', c.marketBenchmark != null ? pct(c.marketBenchmark) : 'غير متوفر')}
          ${_prKv('وزن أدائك في المزج', c.perfWeight != null ? (c.perfWeight * 100).toFixed(1) + '%' : 'غير متوفر')}
          ${_prKv('النمو المُستخدَم بعد المزج', c.blendedCapGrowth != null ? pct(c.blendedCapGrowth) : 'غير متوفر')}
          ${_prKv('عائد التوزيعات المُستخدَم', c.safeDivYield != null ? pct(c.safeDivYield) : 'غير متوفر')}
          ${_prKv('مصدر عائد التوزيعات', c.divYieldSource === 'forward' ? 'forward من الحيازات' : c.divYieldSource === 'historical' ? 'تاريخي (تقديري)' : 'غير متوفر')}
          ${_prKv('XIRR وقت الحفظ', c.xirr != null ? c.xirr.toFixed(2) + '%' : 'غير متوفر')}
          ${_prKv('عدد الأسهم وقت الحفظ', c.holdingsCount != null ? String(c.holdingsCount) : 'غير متوفر')}
          ${_prKv('قيمة المحفظة وقت الحفظ', c.portfolioValue != null ? fmt(c.portfolioValue) : 'غير متوفرة')}
        </div>
        ${frozen ? '' : '<div class="pr-note">خطة قديمة: سياق البيانات لم يُحفظ معها، فالحقول أعلاه «غير متوفرة» صراحةً — لم تُقدَّر.</div>'}
      </section>

      <footer class="pr-foot pr-block">
        <b>تنبيه:</b> هذه الوثيقة إسقاط حسابي مبني على افتراضات ومعدّلات محفوظة وقت إنشائها — <b>ليست وعداً ولا توقّعاً مضموناً ولا توصية استثمارية</b>.
        الأداء التاريخي لا يضمن نتائج مستقبلية، والسوق يمرّ بسنوات هابطة لا يحاكيها أي سيناريو هنا. القرار الاستثماري مسؤوليتك الكاملة.
        <div class="pr-foot-src">ثروة — مفكرة حسابية شخصية · وُلّدت من صفحة الرؤية المستقبلية</div>
      </footer>
    </div>`;

  let layer = document.getElementById('print-report');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'print-report';
    document.body.appendChild(layer);
  }
  layer.innerHTML = html;
  layer.classList.add('open');
  document.body.classList.add('pr-printing');
  layer.scrollTop = 0;
  showToast('جاهزة للطباعة — اختر «حفظ كـ PDF» من حوار الطباعة', 'info');
}

function closePlanReport() {
  const layer = document.getElementById('print-report');
  if (layer) { layer.classList.remove('open'); layer.innerHTML = ''; }
  document.body.classList.remove('pr-printing');
}

// ── Render historical summary ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
// م.7 و1 — معالم الدستور الرقمية، وموقعك منها اليوم
// ----------------------------------------------------------------------
// المعالم كانت أرقاماً في وحدة الدستور بلا أن يراها المالك في الصفحة
// التي تُسقط مستقبله. عرضها هنا يجعل الإسقاط مقروءاً **مقابل الهدف**
// لا في فراغ — وم.62 تتحوّل بها المحفظة تلقائياً لمرحلة السحب.
//
// ⚠️ عرض لا حكم: لا يُخصم شيء ولا تُصدر إشارة. الفارق يُعرَض ليُعرَف.
// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// 📗 نمو التوزيع الفعلي لمكوّناتك — من إيداعات تداول (م.15/1)
// ----------------------------------------------------------------------
// **الإسقاط يفترض عائد توزيع ثابتاً** عبر خمس وثلاثين سنة: التوزيعات =
// نسبة مئوية من قيمة المحفظة، فتنمو بنمو رأس المال ولا شيء غيره.
// هذا افتراضٌ مريح لا معطى، وله اتجاهان يكذّبانه:
//
// • شركاتك ترفع توزيعها أسرع من نموّها السعري ⇒ الإسقاط **يبخس** دخلك.
// • أو تخفضه ⇒ الإسقاط **يبالغ**، وهذا الأخطر لأنه هدف تقاعدٍ لا رقم زينة.
//
// البطاقة لا تغيّر الإسقاط ولا تحرّك رقماً — تضع الافتراض بجوار ما فعلته
// شركاتك فعلاً في خمس سنوات، ويبقى القرار قرارك (م.23).
// ══════════════════════════════════════════════════════════════════════
function renderTadawulDivGrowth(h) {
  const el = document.getElementById('td-divgrowth');
  if (!el) return;
  if (typeof TADAWUL_DATA === 'undefined' || typeof tdDpsGrowth !== 'function') {
    el.innerHTML = ''; return;
  }
  const rows = (h && h.holdingRows) || [];
  if (!rows.length) { el.innerHTML = ''; return; }

  const covered = [], uncovered = [];
  rows.forEach(r => {
    const g = TADAWUL_DATA[r.ticker] ? tdDpsGrowth(r.ticker) : null;
    if (g && g.value != null) covered.push({ ...r, g });
    else uncovered.push({ ...r, why: g ? g.why : 'لا إيداعات مستخرَجة لهذا الرمز' });
  });
  if (!covered.length) { el.innerHTML = ''; return; }

  // الترجيح بالقيمة السوقية — سهمٌ وزنه 1% لا يساوي سهماً وزنه 12%
  const wSum = covered.reduce((s, r) => s + r.value, 0);
  const wAvg = covered.reduce((s, r) => s + r.value * r.g.value, 0) / wSum;
  const clean = covered.filter(r => !r.g.volatile && !r.g.caution);
  const cleanW = clean.reduce((s, r) => s + r.value, 0);
  const cleanAvg = cleanW > 0
    ? clean.reduce((s, r) => s + r.value * r.g.value, 0) / cleanW : null;

  const coveredPct = wSum / rows.reduce((s, r) => s + r.value, 0) * 100;
  const pct = v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
  const capRate = (typeof _scenarios !== 'undefined' && _scenarios && _scenarios[1])
    ? _scenarios[1].capRate : null;

  const list = covered.slice().sort((a, b) => b.value - a.value).map(r => {
    const flag = r.g.volatile ? ' 🔴' : (r.g.caution ? ' 🟡' : '');
    const tip  = r.g.volatileWhy || r.g.caution || r.g.why || '';
    return `<span title="${esc(tip)}" style="display:inline-block;margin:2px 0 2px 10px;
      font-size:.78rem;cursor:${tip ? 'help' : 'default'}">
      <b>${esc(TADAWUL_DATA[r.ticker].name)}</b>
      <span style="color:${r.g.value >= 0 ? 'var(--st-good)' : 'var(--st-bad)'}">${pct(r.g.value)}</span>${flag}
      <span class="text-muted">(${(r.value / wSum * 100).toFixed(0)}% من المغطّى)</span></span>`;
  }).join('');

  // المقارنة الحاسمة: نمو التوزيع مقابل النمو السعري الذي يقود الإسقاط
  let verdict = '';
  if (capRate != null && cleanAvg != null) {
    const d = cleanAvg - capRate;
    verdict = Math.abs(d) < 0.01
      ? `<strong>الاثنان متقاربان</strong> (فارق ${pct(Math.abs(d))} فقط) — افتراض العائد الثابت متماسك هنا.`
      : d > 0
        ? `توزيع شركاتك ينمو <strong>أسرع</strong> من النمو السعري المفترض بـ${pct(d)} سنوياً — `
          + `فالإسقاط على الأرجح <strong>يبخس</strong> دخلك المستقبلي.`
        : `توزيع شركاتك ينمو <strong>أبطأ</strong> من النمو السعري المفترض بـ${pct(-d)} سنوياً — `
          + `فالإسقاط على الأرجح <strong>يبالغ</strong> في دخلك المستقبلي. وهذا اتجاه الخطر.`;
  }

  el.innerHTML = noteHtml('📗',
      `<strong>نمو التوزيع الفعلي لمكوّناتك</strong> `
    + `<span class="text-muted" style="font-size:.75rem">— من إيداعات تداول، معدَّلاً للتجزئة (م.22)</span>`
    + kvsHtml([
        ['المرجَّح بالقيمة (كل المغطّى)', pct(wAvg)],
        cleanAvg != null
          ? [`المرجَّح — النظيف فقط (${clean.length} من ${covered.length})`, pct(cleanAvg)]
          : null,
        capRate != null ? ['النمو السعري المفترض في الإسقاط', pct(capRate)] : null,
        ['تغطية الإيداعات', `${coveredPct.toFixed(0)}% من قيمة المحفظة`],
      ])
    + `<div style="margin-top:8px;line-height:1.9">${list}</div>`
    + (verdict ? `<div style="margin-top:8px">${verdict}</div>` : '')
    + `<div style="margin-top:8px;font-size:.78rem" class="text-muted">`
    + `الإسقاط يفترض <strong>عائد توزيع ثابتاً</strong>، أي أن توزيعاتك تنمو بنمو `
    + `رأس المال لا بسياسة الشركات. هذه البطاقة تقيس الافتراض ولا تغيّره — `
    + `الرقم المُستخدَم في الحساب يبقى كما هو (م.23).`
    + (uncovered.length
        ? `<br>غير مغطّى: ${uncovered.length} رمزاً — ${esc(uncovered.map(u => u.ticker).join('، '))} (م.20).`
        : '')
    + `<br>🔴 سلسلة متقلّبة · 🟡 طرف شاذّ — مرِّر المؤشر للتفصيل. `
    + `المرجَّح «النظيف» يستبعدهما.</div>`,
    'info');
}

function renderConstitutionMilestones(h) {
  const el = document.getElementById('constitution-milestones');
  if (!el || typeof GOAL_PORTFOLIO !== 'number') return;
  const cur   = +h.currentValue || 0;
  const phase = portfolioPhase(new Date());
  const fwd   = +h.fwdAnnualIncome || 0;
  const goalY = GOAL_MONTHLY_INCOME * 12;
  const pctOf = (a, b) => b > 0 ? Math.min(100, a / b * 100) : 0;
  // ⚠️ fmt() تُلحق «ر.س» بنفسها — إضافتها هنا تُنتج «ر.س ر.س».
  const row = (label, now, target, art) => `
    <div class="kv"><span>${label} <span class="text-muted" style="font-size:.7rem">${art}</span></span>
      <b class="num">${fmt(now)} <span class="text-muted" style="font-weight:400">من ${fmt(target)}
      (${pctOf(now, target).toFixed(0)}%)</span></b></div>`;

  // ══════════════════════════════════════════════════════════════════
  // رقمٌ واحد لهدفك، لا رقمان في صفحة واحدة
  // ------------------------------------------------------------------
  // بطاقة FIRE أعلى الصفحة تحسب من هدفك المحفوظ في لوحة التحكم
  // (retirement_goal_v1)، وهذه البطاقة تعرض رقم الدستور (م.4 و7).
  // إن اختلفا رأى المالك رقمين متعارضين في شاشة واحدة — وهو بالضبط ما
  // يفسد الثقة بكل الأرقام. فالاختلاف **يُعلَن** ولا يُترك يُخمَّن.
  //
  // ولا يُعرض «هدف FIRE» هنا: بطاقة FIRE تحسبه من نسبة السحب التي
  // اخترتَها، وتكراره برقم ثابت يُنتج رقمين لمفهوم واحد.
  // ══════════════════════════════════════════════════════════════════
  const fg = h.fireGoal || {};
  const mismatch = fg.monthly > 0 && Math.abs(fg.monthly - GOAL_MONTHLY_INCOME) > 1;
  // رقم FIRE المحفوظ مقابل رقم الدستور (م.7 = 1.8 مليون عند سحب 4%)
  const savedFire = fg.monthly > 0 && fg.swr > 0 ? (fg.monthly * 12) / (fg.swr / 100) : null;
  const fireGap   = savedFire != null && Math.abs(savedFire - GOAL_FIRE) > 1000;
  const conflictNote = (mismatch || fireGap)
    ? `<div style="margin-top:6px;color:var(--st-warn);font-size:.76rem">⚠️ <b>رقمان لهدفك:</b>`
      + (mismatch
          ? ` الدخل الشهري المحفوظ في لوحة التحكم <b class="num">${fmt(fg.monthly)}</b>،
              والدستور (م.4) يقول <b class="num">${fmt(GOAL_MONTHLY_INCOME)}</b>.` : '')
      + (fireGap
          ? ` ورقم FIRE المحسوب من إعداداتك <b class="num">${fmt(savedFire)}</b>،
              والدستور (م.7) يقول <b class="num">${fmt(GOAL_FIRE)}</b>.` : '')
      + ` بطاقة «هدف التقاعد» أعلاه تحسب بالأول وهذه البطاقة بالثاني —
          وحّدهما من لوحة التحكم كي لا تقرأ رقمين لشيء واحد.</div>`
    : '';

  el.innerHTML = noteHtml('📜',
    `<strong>معالم الدستور — أين أنت منها اليوم</strong>
     <div class="kvs" style="margin-top:6px">
       ${row('قيمة المحفظة', cur, GOAL_PORTFOLIO, 'م.7')}
       ${row('الدخل السنوي من التوزيعات', fwd, goalY, 'م.4')}
       <div class="kv"><span>الضخّ الشهري المقرَّر <span class="text-muted" style="font-size:.7rem">م.7</span></span>
         <b class="num">${fmt(MONTHLY_INJECTION)}</b></div>
       <div class="kv"><span>المرحلة الحالية <span class="text-muted" style="font-size:.7rem">م.1</span></span>
         <b>${esc(phase.label)} — حتى ${phase.key === 'accumulation' ? ACCUM_END_YEAR
              : phase.key === 'transition' ? TRANSITION_END_YEAR : HORIZON_YEAR}</b></div>
     </div>${conflictNote}
     <div class="text-muted" style="font-size:.74rem;margin-top:4px">عرضٌ لا حكم: لا يُخصم شيء ولا تُصدر إشارة (م.9).</div>`,
    '');
}

function renderHistSummary() {
  const h = _hist;
  const badge = document.getElementById('hist-period-badge');
  if (badge) {
    const from = h.firstDate ? h.firstDate.getFullYear() : '—';
    badge.textContent = `${h.yearsActive.toFixed(1)} سنة بيانات (${from}–${h.currentYear})`;
  }
  // أُزيل تنبيه «أداؤك حتى الآن سالب» — قرار المالك 2026-08-22: الرقم مشتقّ من
  // عيّنة قصيرة خطؤها المعياري عشرات النقاط، فإطلاقه كتحذير أحمر حكم لا يسنده
  // القياس. ⚠️ لا تُعِده.

  // XIRR: المصدر الأصدق للعائد التاريخي الحقيقي
  const _mRet = assessMetricMaturity('return', { ageMonths: (h.yearsActive || 0) * 12 });
  const xirrLabel = h.xirr != null
    ? `${h.xirr >= 0 ? '+' : ''}${h.xirr.toFixed(2)}%${maturityBadge(_mRet.level, _mRet.reason)}`
    : '—';

  // ── نمو رأس المال: الأساس (تاسي) صراحةً + أداؤك كتشخيص بوزنه ──
  const rawCap  = h.annCapGrowth;
  const blended = h.blendedCapGrowth;
  const bench   = h.marketBenchmark ?? MARKET_CAP_BENCHMARK;
  const w       = h.perfWeight ?? 0;
  const gap     = rawCap - bench;
  // أُزيل تفكيك «تاسي × كذا + أداؤك × كذا» من الوسم — قرار المالك 2026-08-22.
  // يبقى معدّل النمو المُستخدَم في السيناريوهات معروضاً كما هو، بلا حكم مقارَن.
  // م.20 — إن تعذّر حساب أدائك واستُبدل بالمعيار، يُقال ذلك صراحةً
  const growthLabel = h.growthFallback
    ? `${pct(blended)} <span style="font-size:0.63rem;color:var(--st-warn)"
        title="تعذّر حساب نموّك الشخصي (بيانات توزيعات ناقصة) — استُبدل بمعيار السوق ولم يُقدَّر بصمت (م.20)">
        ⚠️ معيار السوق (نموّك غير محسوب)</span>`
    : `${pct(blended)} <span style="font-size:0.63rem;color:var(--text-muted)"
        title="معدّل النمو السعري المُستخدَم في السيناريوهات — افتراض تخطيطي لا تنبؤ.">
        (افتراض تخطيطي)
      </span>`;

  // ── عائد التوزيعات: مصدر الرقم صريح ──
  const fwdOk = h.divYieldSource === 'forward';
  const dyLabel = `${pct(h.safeDivYield)} <span style="font-size:0.63rem;color:${fwdOk ? 'var(--st-good)' : 'var(--st-warn)'}"
      title="${fwdOk
        ? `forward = الدخل السنوي المتوقَّع من حيازاتك (${fmt(h.fwdAnnualIncome)}) ÷ القيمة السوقية الحالية.&#10;بسط ومقام كلاهما «الآن» — التعريف القياسي.&#10;مغطّى: ${h.fwdCovered} رمز${h.fwdStale ? ` · مُستبعَد لانقطاع التوزيع: ${h.fwdStale}` : ''}`
        : `تقديري: لا يمكن حساب الدخل المتوقَّع (لا توزيعات مسجّلة كافية) — الرقم = توزيعات آخر 12 شهراً ÷ قيمة اليوم، وهو يبخس العائد في محفظة نامية.`}">
      ${fwdOk ? '✓ forward من حيازاتك' : '⚠️ تاريخي (تقديري)'}</span>`
    + (h.divYieldSuspect
        ? ` <span style="font-size:0.63rem;color:var(--st-warn)"
            title="${h.divYieldClamped
              ? `الرقم الخام ${pct(h.divYieldRaw)} قُصَّ إلى 15% — والقصّ يُعلَن ولا يُبتلع (م.20).`
              : ''}عائد توزيعات فوق ${pct(0.09)} على محفظة سعودية رقمٌ يستوجب مراجعة: قد يكون توزيعاً استثنائياً أو خطأ إدخال أو حيازة صغيرة بتوزيع كبير. وهو يقود «الدخل الشهري في 2045» أي هدفك المعلن.">
            ⚠️ راجِعه${h.divYieldClamped ? ' · مقصوص' : ''}</span>`
        : '');

  // `core` = يدخل الإسقاط فعلاً ⇒ يبقى ظاهراً. البقية سياق تاريخي يُطوى
  // (نفضة 2026-08-23): عشرة أرقام في صفّ واحد تُخفي الأربعة التي تقود الرقم.
  const items = [
    { val: fmt(h.currentValue),           lbl: 'القيمة السوقية الحالية', core: true },
    { val: fmt(h.costBasis),              lbl: 'التكلفة الأساسية' },
    { val: xirrLabel,                     lbl: 'XIRR — العائد الداخلي الحقيقي', raw: true, core: true },
    { val: growthLabel,                   lbl: 'نمو رأس المال (مُستخدَم في السيناريوهات)', raw: true, core: true },
    { val: dyLabel,                       lbl: 'عائد التوزيعات السنوي (المُستخدَم)', raw: true, core: true },
    { val: fwdOk ? fmt(h.fwdAnnualIncome) : '—', lbl: 'الدخل السنوي المتوقَّع (forward)' },
    { val: fmt(h.avgAnnualDiv),           lbl: 'توزيعات آخر 12 شهراً (فعلية)' },
    { val: fmt(h.totalDivAll),            lbl: 'إجمالي الأرباح المتراكمة' },
    { val: h.avgDepositBasis === 'measured' ? fmt(h.avgMonthlyDeposit)
           : `<span class="text-muted" title="يلزم ثلاثة إيداعات فأكثر على مدى سنة فأطول لاستنتاج معدّل شهري — والمسجّل ${h.depositCount || 0} (م.20)">—</span>`,
      lbl: 'متوسط الإضافة الشهرية', raw: h.avgDepositBasis !== 'measured' },
    { val: String(h.holdingsCount),       lbl: 'عدد الأسهم' },
  ];

  renderConstitutionMilestones(h);   // م.7 و1
  renderTadawulDivGrowth(h);         // م.15/1
  const el = document.getElementById('hist-summary');
  const cell = i => `
    <div class="hist-item">
      <div class="h-val">${i.raw ? i.val : esc(i.val)}</div>
      <div class="h-lbl">${esc(i.lbl)}</div>
    </div>`;
  if (el) {
    el.innerHTML = items.filter(i => i.core).map(cell).join('');
    const restEl = document.getElementById('hist-summary-rest');
    if (restEl) restEl.innerHTML = items.filter(i => !i.core).map(cell).join('');
  }

  // ══════════════════════════════════════════════════════════════════
  // أُزيل مربّع «الأساس: معيار تاسي · أداؤك حتى الآن» — قرار المالك 2026-08-22.
  // ------------------------------------------------------------------
  // كان يقارن **نموّك السعري** (XIRR بعد استبعاد توزيعاتك) بمتوسط تاسي طويل
  // المدى، ويطبع الفارق بوسم أحمر. والمقارنة نفسها مُستنبَطة من طرفيها:
  //   • الطرف الأول مشتقّ من عيّنة قصيرة خطؤها المعياري عشرات النقاط.
  //   • الطرف الثاني ثابت تاريخي (~4.4%) لا يخصّ فترتك أنت.
  // فحاصلها ليس حكماً على أدائك، لكنه يُقرأ كذلك — وبالأحمر.
  //
  // قاعدة المالك: **ما لسنا واثقين منه 100% لا يُعرض.** الرقم المستنبَط يُحذف
  // لا يُحاط بتحذير. ⚠️ لا تُعِد هذا المربّع.
  //
  // المزج نفسه باقٍ في الحساب (النمو المُستخدَم في السيناريوهات معروض في
  // جدول الافتراضات بمصدره)، لكن **لا يُعرض أي حكم مقارَن**.
  const diagEl = document.getElementById('growth-basis-note');
  if (diagEl) diagEl.innerHTML = '';

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
  if (dyBadge) {
    dyBadge.textContent = h.divYieldSource === 'forward'
      ? `forward من حيازاتك: ${pct(h.safeDivYield)}`
      : `تاريخي تقديري: ${pct(h.safeDivYield)}`;
    dyBadge.title = h.divYieldSource === 'forward'
      ? `الدخل السنوي المتوقَّع ${fmt(h.fwdAnnualIncome)} ÷ القيمة السوقية ${fmt(h.currentValue)}`
      : 'لا توزيعات مسجّلة كافية لحساب الدخل المتوقَّع — الرقم تقديري من توزيعات آخر 12 شهراً';
  }

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
      <!-- توضيح بعد إصلاح المزج: الثقة لم تعد وزناً في الإسقاط -->
      <p style="font-size:.76rem;color:var(--text-muted);margin:8px 0 0;line-height:1.6">
        ℹ️ <b>هذه الدرجة وصف لبياناتك، لا وزن في الإسقاط.</b> الإسقاط أساسه معيار تاسي، وأداؤك الشخصي
        يدخله بوزن <b>${((h.perfWeight || 0) * 100).toFixed(1)}%</b> محسوب من عمر رأس مالك وحده
        (مُقدِّر انكماش مسقوف عند ${(PERF_BLEND_MAX_W * 100).toFixed(0)}%) — لا من هذه الدرجة.
        كانت الدرجة سابقاً هي وزن المزج، فكان الإسقاط يعتمد على ${score}% من رقم عمره ${fmtM(months)} — وهو ما أُصلح.
      </p>

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

  const occ = scenarioOccurrenceProbs();   // تكرار تاريخي — لا ادعاء احتمالي

  grid.innerHTML = SCENARIO_META.map((m, i) => {
    const sc = _scenarios[i];
    if (!sc) return '';
    const isActive = _activeScenarios.includes(m.key);
    const cnt      = occ.counts[i];
    const perc     = occ.percentiles[i];
    const never    = cnt === 0;
    const tip = `تكرار تاريخي: ${cnt} نافذة من ${occ.windows} نافذة تاسي متداخلة (10/15/20 سنة) وقع نموّها السعري في جوار ${pct(sc.capRate)}. `
              + `المئين ${perc}: أي أن ${perc}% من نوافذ تاسي نمت بأبطأ من هذا المعدّل. `
              + `العيّنة صغيرة ومتداخلة — دقّة النسبة ±${occ.precision} نقطة.`;
    return `
    <div class="scenario-card ${m.cls}${isActive ? ' active' : ''}" id="sc-card-${m.key}" onclick="toggleScenario('${m.key}')">
      <div class="sc-badge">${m.emoji} ${m.name}</div>
      <div class="sc-name">${m.name}</div>

      <div style="display:flex;align-items:center;gap:11px;margin:6px 0 9px" title="${esc(tip)}">
        <!-- عدّاد التكرار الخام: X من N نافذة — لا «احتمال» ولا «من 10» -->
        <div style="width:52px;height:52px;border-radius:50%;border:2.5px solid ${m.color};background:${m.color}1a;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;line-height:1">
          <span style="font-size:1.15rem;font-weight:800;color:${m.color}">${cnt}</span>
          <span style="font-size:.5rem;color:var(--text-muted);margin-top:2px">من ${occ.windows}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
          <span style="font-size:.7rem;font-weight:600;color:var(--text-2)">كم مرة سوّاها تاسي فعلاً 🇸🇦</span>
          <span style="font-size:.63rem;color:var(--text-muted)">${never ? 'لم يتحقق على أي نافذة 10–20 سنة' : `نوافذ نمت بمعدّل مقارب — من ${occ.windows} نافذة`}</span>
          <span style="font-size:.66rem;color:var(--text-muted)">📐 يقع في <b>المئين ${perc}</b> من نوافذ تاسي</span>
        </div>
      </div>

      <div class="sc-desc">${esc(_scenarioDesc(m.key, sc, occ, i))}</div>
      <div class="sc-rates">
        <div class="sc-rate-row"><span class="label">نمو رأس المال/سنة</span><span class="val" style="color:${m.color}">${pct(sc.capRate)}</span></div>
        <div class="sc-rate-row"><span class="label">عائد الأرباح/سنة</span><span class="val" style="color:${m.color}">${pct(sc.divRate)}</span></div>
        <div class="sc-rate-row"><span class="label">إجمالي العائد/سنة</span><span class="val" style="color:${m.color}" title="العائد الفعّال كما يركّبه المحرّك: (1+نمو) × (1+توزيع/12)^12 − 1 — لا جمعاً بسيطاً">${pct(effectiveTotalRate(sc.capRate, sc.divRate))}</span></div>
      </div>
    </div>`;
  }).join('');

  const note = document.getElementById('scenario-prob-note');
  if (note) {
    const N   = _hist?.holdingsCount || 0;
    const ext = tasiWindowExtremes();
    const sum = occ.counts.reduce((s, x) => s + x, 0);
    // ── كشف حجم العيّنة + الشريحة الرابعة «أسوأ من المتحفظ» التي كانت تُحسب ولا تُعرض ──
    note.innerHTML = `
      <div class="note" style="margin-bottom:10px">
        <span class="ic">📏</span>
        <div><b>حجم العيّنة — اقرأ هذا قبل الأرقام.</b> الأعداد أعلاه من <b>${occ.windows} نافذة متداخلة</b> (10 و15 و20 سنة)
        مبنية على <b>21 ملاحظة سنوية فقط</b> (2004–2024). النوافذ تتقاطع فيما بينها، فعدد الملاحظات المستقلة فعلياً
        <b>قريب من واحدة</b>. دقّة النسبة الواحدة ≈ <b>±${occ.precision} نقطة مئوية</b> — لذلك نعرض <b>عدداً خاماً</b>
        لا نسبة «من 10» توهم بدقة أعلى. هذه <b>تكرارات لما حدث</b>، وليست احتمالات لما سيحدث.</div>
      </div>
      <div class="note" data-state="${occ.belowCount > 0 ? 'bad' : 'good'}" style="margin-bottom:10px">
        <span class="ic">📉</span>
        <div><b>أين ذهبت بقيّة النوافذ؟</b> ${occ.belowCount} نافذة من ${occ.windows} نمت <b>أبطأ من سيناريو «المتحفظ»</b> —
        وهي لا يغطّيها أي كرت أعلاه. مجموع الكروت الثلاثة ${sum} + ${occ.belowCount} = ${occ.windows}.
        أعلى نافذة في تاريخ تاسي كانت <b>${pct(ext.max)}</b> سعرياً وأدناها <b>${pct(ext.min)}</b> — ولهذا سقف «المتفائل» مُعاير على ${pct(ext.max)} لا على رقم متخيَّل.</div>
      </div>
      ${N > 0 ? `
      <div class="note" style="line-height:1.75">
        <span class="ic">🎯</span>
        <div><b>محفظتك ${N} ${N === 1 ? 'سهم' : N === 2 ? 'سهمان' : N <= 10 ? 'أسهم' : 'سهماً'}، والمؤشر 159 شركة.</b>
        المؤشر مثل <strong>معدّل الفصل كامل</strong> (159 طالب). أنت معك ${N} بس. ولأن عددك أقل، نتيجتك ممكن تطلع
        <strong>أحسن من المعدّل بكثير</strong>، أو <strong>أسوأ منه</strong>. يعني هذي الأرقام
        <strong>دليل عام للسوق، مو وعد مضمون</strong> لمحفظتك بالذات.</div>
      </div>` : ''}`;
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
          <span style="font-weight:400;color:var(--text-2);font-size:0.72rem;margin-right:6px">${pct(effectiveTotalRate(p.scenario.capRate, p.scenario.divRate))} / سنة</span>
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
// ══════════════════════════════════════════════════════════════════════
// م.4 — الهدف «6,000 ريال **بالأسعار الاسمية** بحلول 2045»
// ----------------------------------------------------------------------
// مفتاح التضخم مفعَّل افتراضياً، فتُفسَّر أهداف المالك على أنها بقوة شراء
// **اليوم** — وهو قياسٌ أنفع تخطيطياً لكنه ليس ما تنصّ عليه م.4. والرقمان
// كانا يظهران على الشاشة نفسها بلا توفيق: بطاقة «معالم الدستور» تعرض
// 1,310,000 اسمياً، وبطاقتا «توقيت الوصول» و«خطة الضخّ» تقيسان حقيقياً.
// بتضخم 2.5% على 19 سنة: 6,000 اسمي ⇒ 1,310,000 · و6,000 حقيقي ⇒ 9,592
// ر.س/شهر ⇒ 2,094,225 — فارق 784,225 ر.س (+60%).
// لا نُطفئ المفتاح (القرار للمالك) بل نُعلن الأساس صراحةً ونعرض التوفيق.
// ══════════════════════════════════════════════════════════════════════
function goalBasisNote(inflOn, inflRate, years) {
  const yld  = (typeof ASSUMED_YIELD === 'number') ? ASSUMED_YIELD : 0.055;
  const gm   = (typeof GOAL_MONTHLY_INCOME === 'number') ? GOAL_MONTHLY_INCOME : 6000;
  if (!inflOn) {
    return '<div class="small" style="margin-top:6px;color:var(--text-muted)">'
         + '⚖️ الهدف مقيس <b>اسمياً</b> — مطابق لنصّ م.4 («بالأسعار الاسمية»).</div>';
  }
  const mul = Math.pow(1 + (inflRate || 0), years || 0);
  return '<div class="small" style="margin-top:6px;padding:8px 10px;border-radius:8px;'
       + 'background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.35)">'
       + '⚠️ <b>الهدف مقيس بقوة شراء اليوم، وم.4 تنصّ على الأسعار الاسمية.</b><br>'
       + `بتضخم ${pct(inflRate)} على ${years} سنة: هدف الدستور الاسمي `
       + `<b>${fmt(gm)}</b> ر.س/شهر ⇒ محفظة <b>${fmt(gm * 12 / yld)}</b>، `
       + `مقابل <b>${fmt(gm * mul)}</b> ر.س/شهر ⇒ <b>${fmt(gm * mul * 12 / yld)}</b> بالقياس الحقيقي. `
       + `الفارق <b>${fmt(gm * (mul - 1) * 12 / yld)}</b> ر.س — أطفئ مفتاح التضخم لقراءة م.4 حرفياً.</div>`;
}

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
    ${goalBasisNote(inflOn, inflRate, horizonYears)}
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
  const reinvestOn    = document.getElementById('inp-reinvest')?.checked !== false;
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
    { val: pct(effectiveTotalRate(sc.capRate, sc.divRate)), lbl: 'إجمالي العائد / سنة (فعّال)' },
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
    // AUDIT-FIX (2026-08): عند إطفاء مفتاح التضخم تكون realValue = value بالضبط،
    // فكان يُعرض رقمان متطابقان تحت عنوانين مختلفين. العنوان صار مشروطاً.
    { val: end  ? fmt(end.realValue)            : '—',
      lbl: readInflationRate() > 0 && document.getElementById('inp-inflation')?.checked
        ? 'القيمة الحقيقية (بعد التضخم)'
        : 'القيمة الحقيقية (التضخم مُطفأ — اسمية)' },
    { val: end  ? fmt(end.cumDiv)              : '—', lbl: 'إجمالي الأرباح الموزعة التراكمية' },
    // ── التفكيك: فلوسك مقابل نمو السوق
    { val: end  ? fmt(endYourCap)              : '—', lbl: '💰 رأس مالك المُضاف (مدخراتك الفعلية)' },
    // ⚠️ الوسم يتبع **الإعداد الفعلي**: مع إطفاء إعادة الاستثمار كانت
    // 1,835,089 ر.س تُعرض «معاد استثمارها» وهي خرجت من المحفظة، ومجموع
    // التفكيك يتجاوز القيمة النهائية بـ1.84 مليون (5,419,206 مقابل 3,584,117).
    { val: end && endDivCum > 0 ? fmt(endDivCum) : '—',
      lbl: reinvestOn ? '📈 أرباح معاد استثمارها (مجانية)'
                      : '💵 توزيعات مستلمة نقداً (خارج المحفظة)' },
    { val: end  ? fmt(endPriceGrow)            : '—', lbl: '🚀 نمو السعر الصافي (عمل السوق لك)' },
    ...(!reinvestOn && end ? [{ val: fmt((+end.value || 0) + endDivCum),
      lbl: 'القيمة + التوزيعات المستلمة (حتى يجمع التفكيك)' }] : []),
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
  rows.push(['أساس المزج — معيار تاسي', pctv(_hist.marketBenchmark)]);
  rows.push(['أداؤك الشخصي (تشخيص لا تنبؤ)', pctv(_hist.annCapGrowth)]);
  rows.push(['وزن أدائك في المزج (مُقدِّر انكماش)', ((_hist.perfWeight || 0) * 100).toFixed(1) + '%']);
  rows.push(['نمو رأس المال المستخدم (بعد المزج)', pctv(_hist.blendedCapGrowth)]);
  rows.push(['عائد التوزيعات المستخدم', pctv(_hist.safeDivYield)]);
  rows.push(['مصدر عائد التوزيعات', _hist.divYieldSource === 'forward' ? 'forward من الحيازات' : 'تاريخي (تقديري)']);
  rows.push(['الدخل السنوي المتوقَّع (forward)', _hist.divYieldSource === 'forward' ? num(_hist.fwdAnnualIncome) : 'غير متوفر']);
  rows.push(['عائد التوزيعات التاريخي (TTM ÷ قيمة اليوم)', pctv(_hist.ttmDivYield)]);
  rows.push(['توزيعات آخر 12 شهراً (فعلية)', num(_hist.avgAnnualDiv)]);
  rows.push(['إجمالي الأرباح المتراكمة', num(_hist.totalDivAll)]);
  rows.push(['متوسط الإضافة الشهرية التاريخية', num(_hist.avgMonthlyDeposit)]);
  rows.push(['عدد الأسهم', _hist.holdingsCount]);
  rows.push(['درجة ثقة البيانات', (_hist.confidenceScore || 0) + '%']);

  sec(`السيناريوهات (معدّلات سنوية + تكرار تاريخي من ${occ.windows} نافذة تاسي متداخلة 10/15/20 سنة)`);
  rows.push(['⚠️ الأعداد أدناه تكرارات لما حدث — ليست احتمالات. العيّنة صغيرة ومتداخلة (دقة ±' + occ.precision + ' نقطة).']);
  rows.push(['السيناريو', 'نمو رأس المال', 'عائد الأرباح', 'إجمالي العائد', 'عدد النوافذ', 'من أصل', 'المئين']);
  SCENARIO_META.forEach((m, i) => {
    const s = _scenarios[i];
    rows.push([m.name, pctv(s.capRate), pctv(s.divRate), pctv(effectiveTotalRate(s.capRate, s.divRate)),
               occ.counts[i], occ.windows, occ.percentiles[i]]);
  });
  rows.push(['نوافذ أسوأ من «المتحفظ» (لا يغطّيها أي سيناريو)', occ.belowCount, occ.windows]);
  const _ext = tasiWindowExtremes();
  rows.push(['أعلى نافذة سعرية في تاريخ تاسي', pctv(_ext.max)]);
  rows.push(['أدنى نافذة سعرية في تاريخ تاسي', pctv(_ext.min)]);

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
// Esc يغلق طبقة تقرير الطباعة (وإلا بقيت الصفحة محجوبة خلفها)
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('pr-printing')) closePlanReport();
});
