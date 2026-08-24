// ══════════════════════════════════════════════════════════════════════
// حُرّاس أوديت 2026-08-24 — كل خلل مُصلَح له فحصٌ يمنع عودته
// ----------------------------------------------------------------------
// ثمانية وكلاء فحصوا 37 ألف سطر بتشغيل الكود لا بقراءته. ما ثبت منه
// يُصلَح هنا، وكل إصلاح يُقفَل بفحص **ينفّذ** المسار ويقرأ الرقم — لا
// يطابق نصّاً. الفحص الساكن مرّ 56 مرة على محرّك ميت في هذا المشروع.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;

let ok = 0, bad = 0;
const t = (n, cond, extra) => { cond === true ? ok++ : bad++;
  console.log((cond === true ? 'PASS ' : 'FAIL ') + n + (cond === true ? '' : '  ← ' + (extra || ''))); };
const near = (a, b, eps) => a != null && Math.abs(a - b) < (eps == null ? 1e-6 : eps);

// ══════════════════════════════════════════════════════════════════════
// ① معاملات اليوم الواحد — الاقتناء قبل التصرّف
// ----------------------------------------------------------------------
// شراء 100@10 وبيع 50@12 في اليوم نفسه. لو سبق البيعُ شراءَه:
//   الأسهم المملوكة = 0 ⇒ sellShares = 0 ⇒ متوسط التكلفة = 0
//   ⇒ **كامل عائد البيع يُسجَّل ربحاً**: +599 بدل +98، والحيازة 100 بدل 50.
// و`created_at` وحده لا يكفي — هو ترتيب الإدخال لا الترتيب الاقتصادي.
// ══════════════════════════════════════════════════════════════════════
{
  const src = fs.readFileSync(ROOT + 'js/transactions.js', 'utf8');
  t('ترتيب WAC دالة واحدة مشتركة', /function txSortForWAC\(rows\)/.test(src));
  t('الاستعلام يجلب date و created_at و id',
    /select\('type, shares, price, total, name, date, created_at, id'\)/.test(src));
  t('إعادة الحساب تستعمل الترتيب الموحّد', /txSortForWAC\(txAll \|\| \[\]\)/.test(src));
  t('الإحصاءات تستعمل الترتيب نفسه', /const sorted = txSortForWAC\(transactions\)/.test(src));
  t('لا فرز يدوي متبقٍّ في الإحصاءات',
    !/\[\.\.\.transactions\]\.sort/.test(src), 'عاد الفرز الموازي');

  // تشغيل فعليّ للترتيب المستخرَج من الملف
  const m = src.match(/const TX_ORDER = [\s\S]*?\n\}/);
  t('الدالة قابلة للاستخراج', !!m);
  if (m) {
    const ctx = { Math, String, Array, Object }; vm.createContext(ctx);
    vm.runInContext(m[0] + '; this.f = txSortForWAC;', ctx);
    const buy  = { type: 'buy',  date: '2025-01-01', shares: 100, total: 1001.73, created_at: 'B' };
    const sell = { type: 'sell', date: '2025-01-01', shares: 50,  total: 599.10,  created_at: 'A' };
    const wac = (rows) => { let sh = 0, cost = 0, pnl = 0;
      rows.forEach(x => {
        if (x.type === 'buy') { cost += x.total; sh += x.shares; }
        else if (x.type === 'grant') { sh += x.shares; }
        else { const ss = Math.min(x.shares, sh), ap = sh > 0 ? cost / sh : 0;
               pnl += x.total * (x.shares > 0 ? ss / x.shares : 0) - ap * ss;
               cost = Math.max(0, cost - ap * ss); sh -= ss; } });
      return { sh, pnl }; };
    // البيع مُدخَل قبل الشراء (created_at أصغر) — الترتيب يجب أن يصحّحه
    const r = wac(ctx.f([sell, buy]));
    t('الشراء يسبق البيع في اليوم نفسه', r.sh === 50 && near(r.pnl, 98.235, 0.01),
      JSON.stringify(r));
    // البيع الزائد: العائد يُقَصّ كما تُقَصّ التكلفة
    const over = wac(ctx.f([buy, { type: 'sell', date: '2025-02-01', shares: 150, total: 1797.30 }]));
    t('البيع الزائد يُقَصّ عائده أيضاً', near(over.pnl, 196.47, 0.01),
      'الربح = ' + over.pnl + ' (لو ~795 فالعائد لم يُقَصّ)');
  }
  t('العائد مقصوص بنسبة القصّ في الكود',
    /const sellRatio\s+= \(\+t\.shares > 0\) \? sellShares \/ \+t\.shares : 0;/.test(src)
    && /const netProceeds\s+= \(\+t\.total\) \* sellRatio;/.test(src));
}

// ══════════════════════════════════════════════════════════════════════
// ② تقييم أمان المحفظة — 9.0/10 من نموذج فارغ
// ══════════════════════════════════════════════════════════════════════
{
  const html = fs.readFileSync(ROOT + 'portfolio-rating.html', 'utf8');
  t('لا درجة بلا بُعد معبَّأ',
    /if \(maxAnswered === 0\) return \{ score: null, breakdown \};/.test(html));
  t('لا «10 من لا شيء»', !/earned \/ maxAnswered \* 10 : 10/.test(html),
    'عاد الفرع الذي يمنح 10 عند maxAnswered = 0');
}

// ══════════════════════════════════════════════════════════════════════
// ③ حاسبة المتوسط — العمولة والضريبة داخل التكلفة (م.2 و10)
// ══════════════════════════════════════════════════════════════════════
{
  const html = fs.readFileSync(ROOT + 'avg-calculator.html', 'utf8');
  t('الحاسبة تستدعي calcCommission', /calcCommission\(s, p\)/.test(html));
  t('التكلفة تأخذ totalBuy', /newCost \+= c\.totalBuy;/.test(html));
  t('العمولة المضافة تُعلَن', /avgFeesLine/.test(html) && /مُدرَجة في المتوسط/.test(html));
  t('لا جمع خام متبقٍّ في الحلقة',
    !/newCost   \+= p \* s;\n        newShares/.test(html));
}

// ══════════════════════════════════════════════════════════════════════
// ④ formatSAR — «−0.00 ر.س»
// ══════════════════════════════════════════════════════════════════════
{
  const ctx = { console, Math, Number, parseFloat, String, Object, Array, Date, JSON,
    isFinite, isNaN, parseInt, Intl, document: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} } };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  try { vm.runInContext(fs.readFileSync(ROOT + 'js/utils.js', 'utf8'), ctx); } catch (_) {}
  t('−0.001 لا تُطبع سالبة', !/-/.test(ctx.formatSAR(-0.001)), ctx.formatSAR(-0.001));
  t('−0.0049 بإشارة لا تُطبع سالبة', !/-/.test(ctx.formatSAR(-0.0049, true)),
    ctx.formatSAR(-0.0049, true));
  t('السالب الحقيقي يبقى سالباً', /^-0\.60/.test(ctx.formatSAR(-0.6, true)),
    ctx.formatSAR(-0.6, true));
  t('التقريب سليم', /^12\.35/.test(ctx.formatSAR(12.345)), ctx.formatSAR(12.345));
}

// ══════════════════════════════════════════════════════════════════════
// ⑤ أسقف مُلغاة معروضة — «قيادي 12%» و«15% بلا استثناء»
// ----------------------------------------------------------------------
// دستور v3.0 م.25 ألغى لافتة «قيادي» نصّاً واستبدلها بأربع فئات.
// لا وجود لسقف 12% في `constitution.js`، والكود كان يحسب صحيحاً ويكتب خطأً.
// ══════════════════════════════════════════════════════════════════════
{
  const files = ['js/watchlist.js', 'watchlist.html', 'profit-taking.html'];
  const hits = [];
  files.forEach(f => {
    const src = fs.readFileSync(ROOT + f, 'utf8');
    if (/قيادي — سقف 12%|قيادي 12%|7% للعادي/.test(src)) hits.push(f);
  });
  t('لا ذكر لسقف «قيادي 12%» المُلغى', hits.length === 0, hits.join(' · '));
  const pt = fs.readFileSync(ROOT + 'profit-taking.html', 'utf8');
  t('لا «15% لكل سهم بلا استثناء»', !/15% لكل سهم بلا استثناء/.test(pt));
  const C = require(ROOT + 'js/constitution.js');
  t('السقوف الدستورية كما هي', C.CAT.A.cap === 15 && C.CAT.B.cap === 10
    && C.CAT.C.cap === 7 && C.CAT.D.cap === 4);
}

// ══════════════════════════════════════════════════════════════════════
// ⑥ وحدة التشتّت — م.39 كانت مقلوبة
// ----------------------------------------------------------------------
// الحاسبة تحفظ CV **نسبةً مئوية**، والدستور يقارنها بحدود **كسرية**.
// فأي تقييم بأكثر من نموذج (cv ≥ 0.61) كان يقع في «ثقة منخفضة» ⇒ توسيع
// النطاقات 20% ⇒ سهم عند 1.25× العادلة (🟡 تخفيف بم.48، وممنوع توجيه
// سيولة إليه بم.55/4) يخرج **أمر شراء** بوصفه 🟢 تجميع.
// ══════════════════════════════════════════════════════════════════════
{
  const C = require(ROOT + 'js/constitution.js');
  t('تشتّت 0.08 (كسر) = ثقة عالية بلا توسيع',
    C.valueBandOf(1.25, 0.08).widen === 0 && C.valueBandOf(1.25, 0.08).key === 'trim',
    JSON.stringify(C.valueBandOf(1.25, 0.08)));
  t('تشتّت 0.45 = متوسطة ⇒ ±10%', C.valueBandOf(1.0, 0.45).widen === 0.1);
  t('تشتّت 0.70 = منخفضة ⇒ ±20%', C.valueBandOf(1.0, 0.70).widen === 0.2);

  const de = fs.readFileSync(ROOT + 'js/decision-engine.js', 'utf8');
  t('المحرّك يحوّل CV إلى كسر عند القراءة',
    /\+entry\.results\.dispersionCV \/ 100 : null/.test(de),
    'عادت القراءة الخام — وحدة مقلوبة');
}

// ══════════════════════════════════════════════════════════════════════
// ⑦ محرّك القرار — الممنوعات والسعر القديم وكسر السقف والقاعدة المطلقة
// ══════════════════════════════════════════════════════════════════════
{
  const de = fs.readFileSync(ROOT + 'js/decision-engine.js', 'utf8');

  // م.12 و55/5 — المرتبتان 1 و2 في سلّم م.50، وكانتا غائبتين كلياً
  t('م.12 مطبَّقة في الخطة', /isBanned\(r\.ticker\)/.test(de),
    'الخطة كانت تُصدر أمر شراء لسهم مُستبعَد دائماً');
  t('م.55/5 مطبَّقة في الخطة', /isNoAccumulate\(r\.ticker\)/.test(de));
  t('الممنوع يُعلَن ولا يُكتَم', /function mkBlocked\(r, price, why\)/.test(de)
    && /blocked: true/.test(de));

  // م.18 — السعر القديم لا يقود قرار وزن
  t('م.18 توقف أوامر الخطة أيضاً',
    /if \(priceAlerts && priceAlerts\[r\.ticker\]\)/.test(de),
    'البطاقة كانت توقف الإشارة والخطة تمضي على السعر نفسه');

  // كسر السقف لا يُكتَم حين الهدف ≥ الوزن
  t('كسر السقف يُعلَن ولو ساواه الهدف',
    /if \(gapPct >= 0 && r\.overCap\)/.test(de),
    'كان يسقط من الخطة كلياً بينما بطاقته حمراء');

  // م.11 — التخفيف يمرّ ببوابة الخسارة المحققة
  t('التخفيف يمرّ ببوابة م.11', /const trimGate = \(typeof deferredVerdict/.test(de)
    && /trimGate\.verdict !== 'exitNow'/.test(de),
    'كسر السقف كان يأمر ببيع بخسارة محقّقة');

  // التوزيعة المُعلَنة غير المصروفة لا تُنقص التعادل الحقيقي (م.2)
  t('التعادل يقرأ التوزيعة بالتعريف الموحّد',
    /dividendFlowDate\(d, new Date\(\)\)/.test(de),
    'المُعلَن غير المستلَم كان يخفض التعادل فيفتح خروجاً بخسارة');
  t('لا شرط `!d.date` خام متبقٍّ في سجل التوزيعات',
    !/if \(!tk \|\| !d\.date\) return;/.test(de));
}

// ══════════════════════════════════════════════════════════════════════
// ⑧ دورية التوزيع — من المعدّل لا من وسيط الفجوات
// ----------------------------------------------------------------------
// الوسيط يلتقط الفجوة القصيرة في النمط المتناوب (مرحليٌّ ثم ختاميٌّ، وهو
// الغالب سعودياً)، فتخرج دورية أعلى من الحقيقة ⇒ كل نافذة أطول من سنة ⇒
// nFull = 0 ⇒ **درجة جودة صفر** لسهم منتظم تماماً.
// ══════════════════════════════════════════════════════════════════════
{
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, addEventListener() {}, innerHTML: '', textContent: '' });
  const c = { console: { log() {}, warn() {}, error() {} },
    Math, Object, Array, Number, String, Boolean, Date, JSON, Set, Map,
    Promise, RegExp, Error, Intl, isFinite, isNaN, parseInt, parseFloat,
    setTimeout: () => 0, clearTimeout() {},
    document: { addEventListener() {}, getElementById: () => el(), querySelectorAll: () => [],
      querySelector: () => null, documentElement: el(), body: el(), createElement: el },
    localStorage: { getItem: () => null, setItem() {} }, location: { href: 'http://x/' },
    navigator: { userAgent: 'n' }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    supabase: { createClient: () => ({}) },
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; } };
  c.window = c; c.globalThis = c; vm.createContext(c);
  vm.runInContext(fs.readFileSync(ROOT + 'js/utils.js', 'utf8'), c);
  const F = c.inferDividendFrequency, S = c.dividendStaleDays;

  const P = {
    'نصف سنوي متناوب (أبريل+أغسطس)': [['2023-04-10', '2023-08-10', '2024-04-10',
      '2024-08-10', '2025-04-10', '2025-08-10'], 2],
    'نصف سنوي متباعد (مارس+سبتمبر)': [['2023-03-10', '2023-09-10', '2024-03-10',
      '2024-09-10', '2025-03-10', '2025-09-10'], 2],
    'ربعي متناوب': [['2024-03-01', '2024-05-01', '2024-09-01', '2024-11-01',
      '2025-03-01', '2025-05-01', '2025-09-01', '2025-11-01'], 4],
    'ربعي منتظم': [['2024-03-01', '2024-06-01', '2024-09-01', '2024-12-01',
      '2025-03-01', '2025-06-01', '2025-09-01', '2025-12-01'], 4],
    'سنوي': [['2023-04-01', '2024-04-01', '2025-04-01'], 1],
  };
  Object.entries(P).forEach(([k, pair]) => {
    const got = F(pair[0]);
    t('دورية ' + k + ' = ' + pair[1], got === pair[1], 'خرجت ' + got);
  });

  // الحلقة المُصلَحة: الدورية لا تُنزَّل بسبب التوقّف، فيُكشَف الانقطاع في وقته
  const q = ['2023-03-01', '2023-06-01', '2023-09-01', '2023-12-01',
             '2024-03-01', '2024-06-01', '2024-09-01', '2024-12-01'];
  t('السهم المتوقّف يحتفظ بدوريته البنيوية', F(q) === 4, 'خرجت ' + F(q));
  t('عتبة الانقطاع 160 يوماً لا 639', Math.round(S(F(q))) === 160, S(F(q)));

  // تاريخ قصير لا يُضخّم الدورية
  const shortHist = ['2025-01-01', '2025-04-01'];
  t('دفعتان في ثلاثة أشهر لا تُثبتان دورية ربعية', F(shortHist) === 1, 'خرجت ' + F(shortHist));

  // ⚠️ التعليقات تُجرَّد: هذا الملف يشرح الحلقة القديمة بنصّها، وبحثٌ خام
  // كان سيلتقط الشرح ويظنّه الكود — نفس العلّة المُصلَحة في dead-exports.
  const noComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ');
  const utils = noComments(fs.readFileSync(ROOT + 'js/utils.js', 'utf8'));
  t('لا حلقة تنزيل بعدد دفعات آخر سنة',
    !/ttmCount < MIN_PAYS/.test(utils),
    'عادت الحلقة: التوقّف يُنزّل الدورية فيُمنَح السهم تسامحاً أطول');

  const div = fs.readFileSync(ROOT + 'js/dividends.js', 'utf8');
  t('جدول الجودة يستعمل التعريف الموحّد',
    /inferDividendFrequency\(series\.map/.test(div),
    'عاد الاستنتاج الموازي — أنماط سليمة تنال صفراً');
}

// ══════════════════════════════════════════════════════════════════════
// ⑨ لوحة التحكم — بسطٌ ومقامٌ من مجالٍ واحد، ومُستلَمٌ لا مُعلَن
// ══════════════════════════════════════════════════════════════════════
{
  const d = fs.readFileSync(ROOT + 'js/dashboard.js', 'utf8');
  t('TTM مقصور على ما تملكه اليوم', /const _divHeld = divRows\.filter/.test(d),
    'كان يجمع توزيعات مراكز بِعتَها على مقام الحيازات القائمة');
  t('إجمالي الأرباح يستبعد غير المصروف', /const _divPaid = divRows/.test(d)
    && /dividendFlowDate\(d, _nowRef\)/.test(d));
  t('أرباح السنة من التاريخ لا من حقل year',
    /_divPaid\.filter\(x => x\.dt\.getFullYear\(\) === yr\)/.test(d),
    'حقل year المستقل كان يخالف التاريخ فيصفّر العائد المُسنوى');
  t('لا جمع خام للتوزيعات', !/divRows\.reduce\(\(s, d\) => s \+ \+d\.amount, 0\)/.test(d));
  t('الاستقراء مشروط باكتمال الدورة', /_canExtrapolate = daysElapsed >= 180 && daysElapsed >= _cycleDays/.test(d),
    'موزّع سنوي كان يُقرأ +55% أعلى من الحقيقة');
  t('الأساس المُستخدَم مُعلَن في الشرح', /s\.annBasis === 'extrapolated'/.test(d));
  t('الربح المحقق يُقَصّ على المملوك',
    /const sellShares      = Math\.min\(\+t\.shares, m\.shares\)/.test(d)
    && /realizedPnL \+= \(\+t\.total\) \* sellRatio - costOfSold/.test(d));
  t('ترتيب اليوم الواحد: الاقتناء قبل التصرّف', /_txRank = \{ buy: 0, grant: 0, sell: 1 \}/.test(d));
}

// ══════════════════════════════════════════════════════════════════════
// ⑩ حاسبة القيمة العادلة — جوردون بـ Ke، والخاسرة بالدفترية وحدها
// ══════════════════════════════════════════════════════════════════════
{
  const src = fs.readFileSync(ROOT + 'stock-valuation.html', 'utf8');

  // نماذج التوزيعات تُخصم بتكلفة حقوق الملكية — لا بـ WACC الذي يمزج الدين
  t('perpRate يأخذ Ke دائماً',
    /const perpRate     = \(keInfo && keInfo\.ke != null\) \? keInfo\.ke/.test(src),
    'كان WACC للشركة العادية — والخطأ يتضخّم مع الرافعة (D/E=1 ⇒ +50%)');
  t('الريت يخصم DDM بـ perpRate',
    /calculate_gordon\(dividendsR, growth_perp_final, perpRate\)/.test(src),
    'كان يمرّر discount_rate مباشرةً بلا شرط');
  t('غياب Ke يُعلَن ولا يسقط على WACC', /const perpBlocked  = perpRate == null/.test(src));

  // م.32 و36 — الشركة الخاسرة
  t('مسار الشركة الخاسرة موجود', /const isLossMaking = eps <= 0;/.test(src));
  t('نموذجها الوحيد دفتري',
    /avgNames = \['القيمة الدفترية × مكرر متحفّظ \(م\.36\)'\]/.test(src),
    'كان DCF يقود القيمة العادلة لشركة ربحيتها سالبة');
  t('المكرر مقيَّد بين 0.6 و0.8',
    /Math\.min\(0\.8, Math\.max\(0\.6, fair_pb \|\| 0\.7\)\)/.test(src));
  t('القصّ يُعلَن للمالك', /قُصّ من \$\{fair_pb\}/.test(src));

  // تشغيل النموذجين على أرقام معلومة الجواب
  const el = () => ({ style: {}, value: '', innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, addEventListener() {}, getContext: () => ({}) });
  const c = { console: { log() {}, warn() {}, error() {} },
    Math, Object, Array, Number, String, Boolean, Date, JSON, Set, Map,
    Promise, RegExp, Error, Intl, isFinite, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    document: { readyState: 'complete', getElementById: el, querySelector: () => null,
      querySelectorAll: () => [], createElement: el, addEventListener() {},
      documentElement: el(), body: el(), createTextNode: () => ({}) },
    localStorage: { getItem: () => null, setItem() {} },
    location: { href: 'http://x/', hash: '' }, navigator: { userAgent: 'n' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    Chart: function () { return { destroy() {}, update() {} }; },
    supabase: { createClient: () => ({}) }, supabaseClient: null, showToast() {},
    requireAuth: () => Promise.resolve(null),
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; } };
  c.window = c; c.globalThis = c; c.self = c; vm.createContext(c);
  ['js/utils.js', 'js/constitution.js', 'js/constitution-data.js', 'js/tadawul-data.js']
    .forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), c, { filename: f }));
  const inline = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).join('\n');
  try { vm.runInContext(inline, c, { filename: 'sv' }); } catch (_) { /* init يحتاج مصادقة */ }

  if (typeof c.calculate_gordon === 'function') {
    // D₀=1 · g=2% · Ke=8% ⇒ 1.02/0.06 = 17.00 بالضبط
    t('جوردون يشتقّ D₁ من D₀', near(c.calculate_gordon(1, 0.02, 0.08), 17, 0.005),
      c.calculate_gordon(1, 0.02, 0.08));
    // ونفس التوزيعة بـWACC مخفَّض بالرافعة تعطي 25.50 — الفارق الذي كان يُعرض
    t('الخصم بـWACC كان يعطي 25.50 (التوثيق)',
      near(c.calculate_gordon(1, 0.02, 0.06), 25.5, 0.005));
  }
  if (typeof c.calculate_book_value === 'function') {
    t('الدفترية 20 × 0.7 = 14 (داخل نطاق م.36)',
      near(c.calculate_book_value(20, 0.7), 14, 1e-9), c.calculate_book_value(20, 0.7));
  }
}

// ══════════════════════════════════════════════════════════════════════
// ⑪ الصكوك والراتب والعقار وصافي الثروة والتدفقات
// ══════════════════════════════════════════════════════════════════════
{
  const sk = fs.readFileSync(ROOT + 'js/sukuk.js', 'utf8');
  t('العائد السنوي مرجَّح بريال-سنة', /const capitalYears = active\.reduce/.test(sk)
    && /totalNetProfit \/ capitalYears \* 100/.test(sk),
    'كان مرجَّحاً بالمبلغ وحده فيتجاهل المدة: 12.80% بدل 10.40%');
  t('«العائد الكلي» صار «الإجمالي عند الاستحقاق»',
    /الإجمالي المتوقع عند الاستحقاق/.test(sk) && !/العائد الكلي المتوقع/.test(sk));
  t('الدفعة الختامية مُفسَّرة في التحذير', /يردّ أصله دفعةً ختامية/.test(sk));

  const sal = fs.readFileSync(ROOT + 'js/salary.js', 'utf8');
  t('معدّل ادخار فوق 100% لا يُوسَم صحّياً', /const over  = r != null && r > 100;/.test(sal)
    && /يتجاوز 100% — مموَّل من خارج دخل الفترة/.test(sal));

  const re = fs.readFileSync(ROOT + 'js/realestate.js', 'utf8');
  t('العائد الإيجاري موسوم «إجمالي»', /العائد الإيجاري <strong>الإجمالي<\/strong>/.test(re));
  t('يُحذّر من مقارنته بعائد سهم أو صك', /لا تقارنه مباشرةً بعائد توزيعات سهم/.test(re));
  t('ادّعاء «تظهر في صافي الثروة» أُزيل',
    !/تُستبعد من الإجماليات وتظهر في صافي الثروة/.test(re));
  t('حارس القيم غير الرقمية في العقار', /const _v = x => \{ const n = \+x;/.test(re));

  const nw = fs.readFileSync(ROOT + 'js/networth.js', 'utf8');
  t('صافي الثروة يُسمّي ما يشمله', /أسهم \+ عقار \+ أصولك اليدوية − الالتزامات/.test(nw));
  t('والفجوة مُسمّاة صراحةً', /رصيد الوساطة والصكوك خارج هذا الرقم/.test(nw));

  const cf = fs.readFileSync(ROOT + 'js/cashflows.js', 'utf8');
  t('حارس القيم غير الرقمية في التدفقات', /const _num = v => \{ const n = \+v;/.test(cf)
    && /const _badAmt =/.test(cf));
}

// ══════════════════════════════════════════════════════════════════════
// ⑫ الأداء التاريخي — XIRR والتوزيعات المستلمة والدخل المتوقَّع
// ══════════════════════════════════════════════════════════════════════
{
  const p = fs.readFileSync(ROOT + 'js/performance.js', 'utf8');

  t('XIRR يستبعد السهم بلا سعر من طرفَي المعادلة',
    /const _inXirr   = \(tk\) =>/.test(p) && /if \(!t\.date \|\| !_inXirr\(t\.ticker\)\) return;/.test(p),
    'كان يدخل ثمنُه ولا تدخل قيمتُه: محفظة عائدها صفر تُقرأ −49.96%');
  t('والمستبعَد يُعلَن بالاسم', /خارج XIRR:/.test(p) && /xirrExcluded/.test(p));
  t('الادّعاء «XIRR لا يحتاج أسعاراً» أُزيل', !/لا يحتاج أسعاراً/.test(p));

  t('divReceived تُسقط المُعلَن غير المصروف',
    /const dt = \(typeof dividendFlowDate === 'function'\)\n      \? dividendFlowDate\(d\) : \(d\.date \? new Date\(d\.date\) : null\);/.test(p),
    'كان «استرددتَ كامل رأس مالك» يظهر من دفعة لم تُصرَف');

  t('الدخل المتوقَّع بمجموع DPS آخر 12 شهراً',
    /_fwdBasis\[ticker\]\.basis = 'ttm';/.test(p) && /return ttmDps \* remainingShares;/.test(p),
    'المنهج القديم (وسيط × دورية) نقضه المالك في 2026-08 ويبخس النمط السعودي 60%');
  t('لا وسيط دفعة × دورية متبقٍّ',
    !/const recent = dpsSeries\.slice\(-freq\)\.sort/.test(p));

  t('التايم لاين يشمل التوزيعة بسنة/شهر',
    /dividendFlowDate\(d\) : \(d\.date \? parseDateLocal\(d\.date\) : null\)/.test(p));
  t('محور الأشهر يشمل أول تدفّق', /\.\.\.\(_cf \|\| \[\]\)\.map\(c => c\.date\)/.test(p),
    'إيداعٌ سبق أول شراء كان يضيع فيبدأ خطّ رأس المال من الصفر');
  t('رأس المال التراكمي يبدأ ممّا سبق النطاق',
    /if \(prior\.length\) lastCapital = capitalMap\[prior\[prior\.length - 1\]\];/.test(p));

  t('السهم بلا سعر: العائد «—» لا 0.00%',
    /p\.totalReturn        = \(p\.marketValue == null\) \? null/.test(p));
  t('ويُستبعَد من نسبة الإجمالي', /const _priced   = open\.filter\(p => p\.marketValue != null\)/.test(p)
    && /سهم بلا سعر مُستبعَد/.test(p));

  t('شارة النضج تعدّ فترات العائد لا الأيام',
    /assessMetricMaturity\('risk', \{ snapshots: m\.nReturns \}\)/.test(p),
    'كانت تعدّ أيام التداول بعتبات مكتوبة للقطات شهرية');
  t('بطاقة XIRR تتحفّظ تحت السنة', /مُسنّى من \$\{d\.years\.toFixed\(1\)\} سنة/.test(p));
  t('إفصاحا الدخول المتأخّر وسحب النقد معروضان',
    /دخول متأخّر للقياس/.test(p) && /سحب النقد:/.test(p),
    'كانا يُحسبان ولا يُعرضان — وتعليق المنهجية يَعِد بالثاني نصّاً');

  const ph = fs.readFileSync(ROOT + 'performance.html', 'utf8');
  t('حاشية التذبذب لم تعد تدّعي «لقطات شهرية»',
    !/تقريبي \(لقطات شهرية\)/.test(ph));
}

// ══════════════════════════════════════════════════════════════════════
// ⑬ الأهداف والدستور — العتبات وم.53 وم.26 وم.28 وم.55/4
// ══════════════════════════════════════════════════════════════════════
{
  const C = require(ROOT + 'js/constitution.js');

  // م.49 — عتبة واحدة عبر المشروع، والافتراضي دستوري لا رقمٌ مكتوب
  const withOne = [];
  ['js/targets.js', 'js/dashboard.js', 'js/settings.js', 'js/decision-engine.js'].forEach(f => {
    const src = fs.readFileSync(ROOT + f, 'utf8');
    if (/tharwa-alert-green'\)\s*\?\?\s*1\)/.test(src)) withOne.push(f);
  });
  t('لا افتراضي 1% متبقٍّ (م.49 تقول 1.5%)', withOne.length === 0, withOne.join(' · '));
  const set = fs.readFileSync(ROOT + 'js/settings.js', 'utf8');
  t('إعادة الضبط تكتب القيم الدستورية',
    /setItem\(userLsKey\('tharwa-alert-green'\),  DEV_IGNORE\)/.test(set),
    'كانت تكتب 1 فتدهس 1.5 الدستورية بضغطة زرّ');
  t('DEV_IGNORE ما زالت 1.5', C.DEV_IGNORE === 1.5 && C.DEV_PUMP === 3.0);

  // م.53/1 — الاستدامة تُفحَص قبل صرف الميزانية
  const tg = fs.readFileSync(ROOT + 'js/targets.js', 'utf8');
  t('م.53/1 مطبَّقة في إعادة التوازن', /const _sustainFailed = \(tk\) =>/.test(tg)
    && /\.filter\(c => !_sustainFailed\(c\.ticker\)\)/.test(tg),
    'الشرط الأول من أربعة كان غائباً كلياً — الصفحتان تعطيان جوابين متعاكسين');
  t('والمستبعَد بها يُعلَن', /sustainBlocked\.length/.test(tg) && /فشل بوابة الاستدامة/.test(tg));

  // م.57 على التكلفة الفعلية بعد التقريب
  t('م.57 تُقاس على التكلفة لا على النصيب',
    /if \(r\.cost > 0 && r\.cost < MIN_BUY_SAR\)/.test(tg),
    'نصيب 2,400 بسعر 900 يعطي سهمين = 1,800 فعلياً — تحت الحدّ');

  // م.26 — المنطقة الميتة ±15%
  t('هامش م.26 معرَّف ومُصدَّر', C.HYST_MARGIN === 0.15 && typeof C.hysteresisEligible === 'function');
  t('الترقية تحتاج +15% فوق العتبة',
    C.hysteresisEligible(115, 100, true) === true && C.hysteresisEligible(100.4, 100, true) === false,
    'سهم عند 100.4 مليار كان يبدأ عدّ دورتيه داخل المنطقة الميتة');
  t('التنزيل يحتاج −15% تحتها',
    C.hysteresisEligible(84, 100, false) === true && C.hysteresisEligible(99, 100, false) === false);
  t('داخل المنطقة الميتة لا تُعدّ الدورة',
    C.applyHysteresis('A', 'B', 5, false, false).deadZone === true
    && C.applyHysteresis('A', 'B', 5, false, false).cat === 'A',
    'دورتان مكتملتان لا تحرّكان الفئة إن لم يُبلَغ الهامش');
  t('وخارجها يعمل العدّ كما كان',
    C.applyHysteresis('A', 'B', 2, false, true).cat === 'B');
  const de2 = fs.readFileSync(ROOT + 'js/decision-engine.js', 'utf8');
  t('المحرّك يمرّر marginMet', /applyHysteresis\(hist\.settled, raw\.cat, hist\.streak \|\| 0, false, _marginMet\)/.test(de2));

  // م.28 — أربعة نطاقات لا عتبة واحدة
  t('فحص القطاع متدرّج بـ sectorBandOf',
    /const banded   = rows\.map\(r => \(\{ \.\.\.r, band: sectorBandOf\(r\.pct\) \}\)\)/.test(de2),
    'كانت عتبة مسطّحة لا تفرّق بين وقف الإضافة والتصحيح الواجب');
  t('التصحيح الإلزامي يُسمّى واجباً', /التصحيح <b>واجب<\/b> لا اختياري/.test(de2));
  t('نطاق التنبيه معروض ولا يُكتَم', /notices\.map\(n =>/.test(de2));

  // م.55/4 لا تُعطَّل بمربّع
  t('منع المنطقتين 🟡/🔴 غير مشروط بـ valAware',
    /if \(fair\.usable && !fair\.ok\) \{/.test(de2) && !/if \(valAware && fair\.usable/.test(de2),
    'بإزالة العلامة كانت تصدر أوامر تجميع في منطقة يمنعها الدستور');

  // طبقة الذكاء لا تناقض م.48
  const di = fs.readFileSync(ROOT + 'js/decision-intel.js', 'utf8');
  t('طبقة الذكاء تستعمل نطاقات م.48',
    /valueBandOf\(r\.price \/ r\.fairValue, r\.dispersionCV\)/.test(di)
    && !/gates\.push\('السعر فوق قيمته العادلة'\)/.test(di),
    'كانت تستبعد أي هامش سالب — والخطة تحتها تُصدر أمر شراء للسهم نفسه');
}

// ══════════════════════════════════════════════════════════════════════
// ⑭ التوزيعات — م.22 والمقامات والتغطية والنصوص
// ----------------------------------------------------------------------
// السابقة الموثّقة في م.22 نصّاً: «منحة بنك الرياض 1:3 — التوزيع 1.40 ←
// 1.05. بلا تعديل يبدو *قصاً 25%* وهو خطأ». هنا تُشغَّل حرفياً.
// ══════════════════════════════════════════════════════════════════════
{
  const els = {};
  const mkEl = () => ({ _html: '', value: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    textContent: '', setAttribute() {}, getAttribute: () => null,
    appendChild(c) { return c; }, addEventListener() {}, focus() {}, remove() {},
    scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [],
    getContext: () => ({ canvas: {}, createLinearGradient: () => ({ addColorStop() {} }) }) });
  const byId = (id) => (els[id] = els[id] || mkEl());
  const c = { console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    Math, Object, Array, Number, String, Boolean, Date, JSON, Set, Map, WeakMap,
    Promise, RegExp, Error, Intl, isFinite, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0,
    document: { readyState: 'complete', body: mkEl(), documentElement: mkEl(),
      getElementById: byId, querySelector: () => null, querySelectorAll: () => [],
      createElement: mkEl, addEventListener() {}, createTextNode: () => ({}) },
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    location: { href: 'http://x/', hash: '' }, navigator: { userAgent: 'n' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    alert() {}, confirm: () => true, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    Chart: function () { return { destroy() {}, update() {} }; },
    supabase: { createClient: () => ({}) }, supabaseClient: null, showToast() {},
    XLSX: { utils: {}, write: () => '' },
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; } };
  c.window = c; c.globalThis = c; c.self = c; vm.createContext(c);
  ['js/utils.js', 'js/constitution.js', 'js/constitution-data.js',
   'js/tadawul-data.js', 'js/dividends.js']
    .forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), c, { filename: f }));

  // 1,000 سهم · 1,400 ر.س في 2024 و2025 · منحة 333 سهماً · ثم 1,400 ر.س
  // المبلغ المستلَم لم يتغيّر إطلاقاً ⇒ النمو الصحيح صفر لا قصّ 25%.
  vm.runInContext(`
    holdings = [{ ticker:'RIY', name:'بنك الرياض', shares:1333, current_price:30, avg_price:20, sector:'بنوك' }];
    dividends = [
      { ticker:'RIY', name:'بنك الرياض', date:'2024-04-10', amount:1400, year:2024, month:4 },
      { ticker:'RIY', name:'بنك الرياض', date:'2025-04-10', amount:1400, year:2025, month:4 },
      { ticker:'RIY', name:'بنك الرياض', date:'2026-04-10', amount:1400, year:2026, month:4 },
    ];
    txBuyRows = [
      { ticker:'RIY', type:'buy',   date:'2023-01-05', shares:1000, price:20, total:20000 },
      { ticker:'RIY', type:'grant', date:'2026-04-01', shares:333,  price:0,  total:0 },
    ];
    txSellRows = []; archivedDividends = [];
    if (typeof _invalidateSharesCache === 'function') _invalidateSharesCache();
  `, c);

  let err = null;
  try { c.renderDividendQuality(); } catch (e) { err = e.constructor.name + ': ' + e.message; }
  t('جدول الجودة يُرسَم بلا خطأ', err === null, err);

  const h = byId('div-quality-body')._html;
  t('م.22 — المنحة لا تُقرأ قصّاً', /\+0\.0%/.test(h) && !/-25\.0%/.test(h),
    (h.match(/[+-]\d+\.\d%/g) || []).join(' '));
  t('وإعادة البيان مُعلَنة في الصفّ', /م\.22 ↺/.test(h),
    'الوسم غائب — المالك لا يعرف أن رقمه أُعيد بيانه');
  t('الدرجة لم تعد مخفوضة بقصٍّ وهمي',
    +(h.match(/font-weight:700;color:[^"]+">(\d+)</) || [0, 0])[1] >= 80,
    (h.match(/font-weight:700;color:[^"]+">(\d+)</) || [])[1]);

  const div = fs.readFileSync(ROOT + 'js/dividends.js', 'utf8');
  t('المنح تُقرأ من txBuyRows لا من متغيّر غير موجود',
    /const grants = \(txBuyRows \|\| \[\]\)/.test(div));
  t('العائد السنوي على متوسط رأس المال',
    /\(beginPort \+ endPort\) \/ 2/.test(div),
    'مقام «أول يناير» يبالغ 48% في محفظة يدخلها ضخّ شهري');
  t('وجدول لكل سهم على المقام نفسه', /\(_beg \+ _end\) \/ 2 : _end/.test(div),
    'كان يقسم على 31 ديسمبر بينما الجدول السنوي على أول يناير');
  t('Forward YOC بمقام واحد', /const fwdNetCap = _currentCostBasis\(\);/.test(div));
  t('إجمالي الأرباح يستبعد غير المصروف', /const _paidDiv = dividends\.map/.test(div));
  t('الجدول الشهري يبوّب بالتاريخ كالرسم', /_divPeriodKey\(x\) === _key/.test(div));
  t('النمو بين نافذتين غير متجاورتين مُسنوى',
    /Math\.pow\(fullWins\[0\]\.sum \/ fullWins\[1\]\.sum, 1 \/ _yoyPer\)/.test(div),
    'نمو سنتين كان يُعرض نمو سنة: +52.9% بدل +23.7%');
  t('تغطية FCF بمناطق م.42-أ الأربع', /const _covZone = \(v\) =>/.test(div));
  t('والسالبة تُعرض صفراً لا مضاعفاً سالباً', /التغطية صفر لا رقماً سالباً/.test(div));
  t('الكود الميت محذوف', !/function _dpsTrendAware/.test(div));
  t('نصوص Forward تطابق ما يُحسب',
    (div.match(/مجموع التوزيع للسهم خلال آخر 12 شهراً/g) || []).length >= 4
    && !/× عدد مرات التوزيع سنوياً/.test(div),
    'سبعة نصوص كانت تصف «آخر دفعة × الدورية» والكود يحسب مجموع TTM');
}

console.log('\n' + ok + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
