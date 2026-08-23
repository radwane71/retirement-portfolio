// ══════════════════════════════════════════════════════════════════════
// بيانات تداول الرسمية — الاستخراج والمشتقّات ولوحة الحاسبة
// ----------------------------------------------------------------------
// هذا الفحص **يُشغّل** الكود، ولا يطابق نصوصاً. الدرس مدفوعُ الثمن:
// `noteHtml` الغائبة أسقطت محرّك القرار كاملاً بينما 56 فحصاً ساكناً
// كانت تمرّ. و`page-smoke` يفحص ملفات `js/` وحدها — أمّا سكربت الصفحة
// الداخلي (حيث تعيش لوحة تداول) فلا يمسّه أحد. هنا يُنفَّذ.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const T = require(ROOT + 'js/tadawul-data.js');

let ok = 0, bad = 0;
const t = (n, cond, extra) => { cond === true ? ok++ : bad++;
  console.log((cond === true ? 'PASS ' : 'FAIL ') + n + (cond === true ? '' : '  ← ' + (extra || ''))); };

const TICKERS = Object.keys(T.TADAWUL_DATA);

// ── 1) سلامة الاستخراج ───────────────────────────────────────────────
t('البيانات محمَّلة', TICKERS.length >= 18, 'العدد = ' + TICKERS.length);

{
  // الوحدات: بعد التوحيد لا يجوز أن تكون إيرادات سهمٍ أقل من مليون ريال.
  // كان تركُها يجعل سابك تبدو أصغر من المواساة بألف مرة.
  const tiny = [];
  TICKERS.forEach(tk => Object.entries(T.TADAWUL_DATA[tk].years).forEach(([y, v]) => {
    if (v.revenue != null && v.revenue > 0 && v.revenue < 1e6) tiny.push(`${tk}/${y}=${v.revenue}`);
  }));
  t('الوحدات وُحِّدت إلى الريال', tiny.length === 0, tiny.join(' '));
}

{
  // ربحية السهم **لا تُضرب** في الوحدة — هي بالريال أصلاً.
  const wild = [];
  TICKERS.forEach(tk => Object.entries(T.TADAWUL_DATA[tk].years).forEach(([y, v]) => {
    if (v.eps != null && Math.abs(v.eps) > 500) wild.push(`${tk}/${y}=${v.eps}`);
  }));
  t('ربحية السهم لم تُضرب في الوحدة', wild.length === 0, wild.join(' '));
}

{
  // القصيم: الملف المصدر نفسه وسم ربحية 2021/2022 «غير منطقية… استُبعدت»
  // وأنا أخذتُها، فخرج المتوسط 84,478. الحارس يمنع عودتها.
  const n = T.tdNormalizedEps('3040', 5);
  t('القصيم — الربحية المُطبَّعة معقولة',
    n.value != null && n.value > 0 && n.value < 50, 'القيمة = ' + n.value);
}

{
  // جرير جزّأت 10:1 في 2023 (8.36 ← 0.81). متوسط الخام 4.53 لا يصف أي سنة.
  const n = T.tdNormalizedEps('4190', 5);
  const rawAvg = (() => {
    const ys = Object.values(T.TADAWUL_DATA['4190'].years).map(v => v.eps).filter(x => x != null);
    return ys.reduce((a, b) => a + b, 0) / ys.length;
  })();
  t('جرير — المُطبَّعة على أساس مُعاد البيان لا الخام',
    n.value != null && n.value < 2 && rawAvg > 3,
    `مُعاد البيان=${n.value} · الخام=${rawAvg.toFixed(2)}`);
  t('جرير — المُطبَّعة قرب ربحية ما بعد التجزئة',
    Math.abs(n.value - 0.87) < 0.30, 'القيمة = ' + n.value);
}

{
  // م.20 — العجز يُعلَن ولا يُقدَّر. سابك متاحٌ لها سنتان فقط.
  const n = T.tdNormalizedEps('2010', 5);
  t('سابك — العجز مُعلَن لا مُقدَّر',
    n.value === null && /المتاح 2/.test(n.why || ''), JSON.stringify(n));
}

// ── 2) مدخلات الحاسبة ────────────────────────────────────────────────
{
  const v = T.tdValuationInputs('4002');
  t('مدخلات الحاسبة تخرج حقولاً موسومة',
    !!v && !!v.fields.eps && ['official', 'derived'].includes(v.fields.eps.tag),
    JSON.stringify(v && v.fields.eps));
  t('كل حقل يحمل سنته',
    !!v && Object.values(v.fields).every(f => Number.isInteger(f.year) && f.year > 2015),
    JSON.stringify(v && Object.entries(v.fields).map(([k, f]) => k + ':' + f.year)));
  t('الدين الصافي يُعلَن ناقصاً لا صفراً',
    !!v && v.fields.netDebt === undefined && /أدخِله بنفسك/.test(v.netDebtNote || ''),
    v && v.netDebtNote);
}

{
  // سبكيم هي جوهر م.35: اللحظية سالبة والمُطبَّعة موجبة.
  const v = T.tdValuationInputs('2310');
  t('سبكيم — اللحظية سالبة والمُطبَّعة موجبة (م.35)',
    v.fields.eps.value < 0 && v.fields.normEps.value > 1.5,
    `لحظية=${v.fields.eps.value} · مُطبَّعة=${v.fields.normEps.value}`);
}

{
  const v = T.tdValuationInputs('2010');
  t('سابك — نقص المُطبَّعة يُعلَن في missing',
    (v.missing || []).some(m => m.k === 'normEps' && /المتاح 2/.test(m.why)),
    JSON.stringify(v.missing));
}

t('رمز غير معروف يرجع null', T.tdValuationInputs('9999') === null);

// ── 3) نمو التوزيع وحُرّاسه ──────────────────────────────────────────
{
  const g = T.tdDpsGrowth('1010');   // 0.94→1.65 بسلاسة
  t('بنك الرياض — نمو نظيف بلا تحذير',
    g.value != null && Math.abs(g.value - 0.151) < 0.01 && !g.caution && !g.volatile,
    JSON.stringify(g));
}

{
  // النهدي وزّع 155% من أرباحه في 2021 قبل الإدراج — أثر قاعدة لا اتجاه.
  const g = T.tdDpsGrowth('4164');
  t('النهدي — الطرف الشاذّ مُعلَن',
    g.value < 0 && !!g.caution && /2021/.test(g.caution), JSON.stringify(g.caution));
  t('النهدي — بديلٌ بقصّ الطرف الشاذّ',
    typeof g.altValue === 'number' && g.altValue > 0, 'البديل = ' + g.altValue);
}

{
  // stc: الشذوذ في طرف **النهاية** (4.20 ر.س بنسبة 141%).
  const g = T.tdDpsGrowth('7010');
  t('stc — شذوذ طرف النهاية مُلتقَط',
    !!g.caution && /سنة النهاية/.test(g.caution), g.caution);
}

{
  // سدافكو: الطرفان سليمان والسلسلة قافزة — 5.99 ← 3 ← 17.97 ← 17.01.
  const g = T.tdDpsGrowth('2270');
  t('سدافكو — التقلّب مُلتقَط ولو سلم الطرفان',
    g.volatile === true && Math.abs(g.maxSwing) > 3, JSON.stringify(g.volatileWhy));
}

{
  const g = T.tdDpsGrowth('2010');
  t('سابك — نقص سنوات التوزيع يُعلَن', g.value === null && /المتاح 2/.test(g.why), g.why);
}

{
  // كل نمو معلَن يجب أن يكون رقماً محدوداً — NaN في مكانٍ كهذا يسمّم إسقاطاً كاملاً
  const nan = TICKERS.map(tk => [tk, T.tdDpsGrowth(tk)])
    .filter(([, g]) => g.value != null && !isFinite(g.value)).map(([tk]) => tk);
  t('لا نمو غير محدود', nan.length === 0, nan.join(' '));
}

// ── 4) بوابة العمق (م.41) تقرأ من تداول ──────────────────────────────
{
  const de = fs.readFileSync(ROOT + 'js/decision-engine.js', 'utf8');
  t('م.41 — بوابة العمق تستعمل سنوات تداول',
    /tdDividendYears\(h\.ticker\)/.test(de) && /Math\.max\(\+_manual \|\| 0, _tdYears\)/.test(de));
}

// ── 5) لوحة الحاسبة — تشغيل فعليّ لا مطابقة نصّ ──────────────────────
{
  const html = fs.readFileSync(ROOT + 'stock-valuation.html', 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).join('\n');
  t('سكربت الصفحة الداخلي وُجد', inline.length > 5000, 'الطول = ' + inline.length);

  const els = {};
  const mkEl = () => ({ _html: '', value: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    textContent: '', setAttribute() {}, getAttribute: () => null,
    appendChild(c) { return c; }, addEventListener() {}, focus() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [] });
  const byId = (id) => (els[id] = els[id] || mkEl());

  const toasts = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    Math, Object, Array, Number, String, Boolean, Date, JSON, Set, Map, WeakMap,
    Promise, RegExp, Error, Intl, isFinite, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0,
    document: { readyState: 'complete', body: mkEl(), documentElement: mkEl(),
      getElementById: byId, querySelector: () => null, querySelectorAll: () => [],
      createElement: mkEl, addEventListener() {}, createTextNode: () => ({}) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: 'http://x/', pathname: '/', search: '', hash: '' },
    navigator: { userAgent: 'node' }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    alert() {}, confirm: () => true, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    Chart: function () { return { destroy() {}, update() {} }; },
    supabase: { createClient: () => ({}) }, supabaseClient: null,
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    showToast: (m, ty) => toasts.push([m, ty]),
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);

  let loadErr = null;
  try {
    ['js/utils.js', 'js/constitution.js', 'js/constitution-data.js', 'js/tadawul-data.js']
      .forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
    ctx.showToast = (m, ty) => toasts.push([m, ty]);   // بعد utils.js، لا قبله
    vm.runInContext(inline, ctx, { filename: 'stock-valuation.html' });
  } catch (e) { loadErr = e.constructor.name + ': ' + e.message; }
  t('الصفحة تُحمَّل بلا خطأ', loadErr === null, loadErr);

  t('اللوحة معرَّفة', typeof ctx.renderTadawulPanel === 'function');
  t('الملء معرَّف', typeof ctx.applyTadawulPrefill === 'function');

  if (typeof ctx.renderTadawulPanel === 'function') {
    let err = null;
    byId('companyType').value = 'normal';
    try { ctx.renderTadawulPanel('4002'); } catch (e) { err = e.constructor.name + ': ' + e.message; }
    t('اللوحة تُرسَم بلا استثناء', err === null, err);

    const p = byId('tdPanel');
    t('اللوحة ظاهرة وفيها محتوى', p.style.display === '' && p._html.length > 200,
      `display=${p.style.display} len=${p._html.length}`);
    t('اللوحة تذكر اسم الشركة', /المواساة/.test(p._html));
    t('اللوحة تعرض الوسم ✅ أو ⚙️', /[✅⚙]/.test(p._html));
    t('اللوحة تعرض السنة مع الرقم', /· 20\d\d/.test(p._html));
    t('اللوحة تُعلن الدين الصافي ناقصاً', /الدين الصافي/.test(p._html));

    // رمزٌ خارج تداول يُخفي اللوحة ولا يترك رقماً قديماً معروضاً
    let err2 = null;
    try { ctx.renderTadawulPanel('9999'); } catch (e) { err2 = e.message; }
    t('رمز خارج تداول يُخفي اللوحة',
      err2 === null && byId('tdPanel').style.display === 'none', err2 || byId('tdPanel').style.display);

    // خانة فارغة كذلك
    try { ctx.renderTadawulPanel(''); } catch (e) { err2 = e.message; }
    t('رمز فارغ لا يرمي', err2 === null, err2);
  }

  if (typeof ctx.applyTadawulPrefill === 'function') {
    // (أ) بلا لوحة مرسومة: لا يرمي ولا يكتب
    let err = null;
    try { ctx.applyTadawulPrefill(); } catch (e) { err = e.constructor.name + ': ' + e.message; }
    t('الملء بلا اختيار لا يرمي', err === null, err);

    // (ب) شركة عادية
    byId('companyType').value = 'normal';
    ctx.renderTadawulPanel('4002');
    toasts.length = 0;
    try { ctx.applyTadawulPrefill(); } catch (e) { err = e.constructor.name + ': ' + e.message; }
    t('الملء العادي لا يرمي', err === null, err);
    t('EPS مُلئ برقم من تداول', +byId('eps').value > 0, byId('eps').value);
    t('EPS المُطبَّع مُلئ', +byId('normEps').value > 0, byId('normEps').value);
    t('القيمة الدفترية مُلئت', +byId('bookValue').value > 0, byId('bookValue').value);
    t('التوزيع مُلئ', +byId('dividends').value > 0, byId('dividends').value);
    t('الملء يُعلَن في إشعار', toasts.length === 1 && /تداول/.test(toasts[0][0]), JSON.stringify(toasts));

    // القيم المملوءة هي عين ما تعطيه الدالة — لا تحويل صامت
    const v = T.tdValuationInputs('4002');
    t('EPS المملوء = EPS المستخرَج',
      Math.abs(+byId('eps').value - v.fields.eps.value) < 0.011,
      `${byId('eps').value} مقابل ${v.fields.eps.value}`);

    // (ج) وضع البنك يملأ خانات البنك لا العادية
    byId('bankEps').value = ''; byId('bvps').value = ''; byId('bankDps').value = '';
    byId('companyType').value = 'bank';
    ctx.renderTadawulPanel('1010');
    toasts.length = 0;
    try { ctx.applyTadawulPrefill(); } catch (e) { err = e.constructor.name + ': ' + e.message; }
    t('ملء البنك لا يرمي', err === null, err);
    t('خانات البنك مُلئت',
      +byId('bankEps').value > 0 && +byId('bvps').value > 0 && +byId('bankDps').value > 0,
      `eps=${byId('bankEps').value} bvps=${byId('bvps').value} dps=${byId('bankDps').value}`);

    // (د) الريت يُنبَّه أن FFO غير موجود (م.33)
    byId('companyType').value = 'reit';
    ctx.renderTadawulPanel('4002');
    t('الريت يُنبَّه لغياب FFO (م.33)', /FFO/.test(byId('tdPanel')._html));
  }
}

// ── 6) بطاقة التوزيعات الرسمية — تشغيل فعليّ ─────────────────────────
{
  const els = {};
  const mkEl = () => ({ _html: '', value: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    textContent: '', setAttribute() {}, getAttribute: () => null,
    appendChild(c) { return c; }, addEventListener() {}, focus() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [] });
  const byId = (id) => (els[id] = els[id] || mkEl());

  const modals = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    Math, Object, Array, Number, String, Boolean, Date, JSON, Set, Map, WeakMap,
    Promise, RegExp, Error, Intl, isFinite, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0,
    document: { readyState: 'complete', body: mkEl(), documentElement: mkEl(),
      getElementById: byId, querySelector: () => null, querySelectorAll: () => [],
      createElement: mkEl, addEventListener() {}, createTextNode: () => ({}) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: 'http://x/', pathname: '/', search: '', hash: '' },
    navigator: { userAgent: 'node' }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    alert() {}, confirm: () => true, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    Chart: function () { return { destroy() {}, update() {} }; },
    supabase: { createClient: () => ({}) }, supabaseClient: null,
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    XLSX: { utils: {}, write: () => '' },
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);

  let loadErr = null;
  try {
    ['js/utils.js', 'js/constitution.js', 'js/constitution-data.js',
     'js/tadawul-data.js', 'js/dividends.js']
      .forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
  } catch (e) { loadErr = e.constructor.name + ': ' + e.message; }
  t('صفحة التوزيعات تُحمَّل بلا خطأ', loadErr === null, loadErr);
  ctx.openInfoModal = (ti, b) => modals.push([ti, b]);

  t('بطاقة التوزيعات الرسمية معرَّفة', typeof ctx.renderTadawulDividends === 'function');

  if (typeof ctx.renderTadawulDividends === 'function') {
    // (أ) بلا حيازات: تُرسَم كاملةً بأسهم تداول، لا تنهار
    let err = null;
    try { ctx.renderTadawulDividends(); } catch (e) { err = e.constructor.name + ': ' + e.message; }
    t('الرسم بلا حيازات لا يرمي', err === null, err);

    // (ب) مع حيازات: المملوك أولاً والباقي باهتاً
    ctx.holdings = [{ ticker: '4190' }, { ticker: '4002' }, { ticker: 'ZZZZ' }];
    try { ctx.renderTadawulDividends(); } catch (e) { err = e.constructor.name + ': ' + e.message; }
    t('الرسم مع حيازات لا يرمي', err === null, err);

    const h = byId('td-div-body')._html;
    t('البطاقة ظاهرة', byId('td-div-card').style.display === '', byId('td-div-card').style.display);
    t('الجدول فيه محتوى', h.length > 1000, 'الطول = ' + h.length);
    t('الأعمدة سنوات فعلية', /<th class="num">20\d\d<\/th>/.test(h));
    t('يذكر أسهماً مملوكة', /4190/.test(h) && /جرير/.test(h));
    t('غير المملوك موسوم', /خارج المحفظة/.test(h));
    t('رمزٌ ليس في تداول لا يُخترع له صفّ', !/ZZZZ/.test(h));
    t('التقلّب موسوم 🔴', /🔴/.test(h), 'سدافكو يجب أن تظهر');
    t('الطرف الشاذّ موسوم 🟡', /🟡/.test(h));
    t('التوزيع فوق الأرباح موسوم ⚠️', /⚠️/.test(h));
    t('تغطية FCF معروضة', /×<\/td>/.test(h));
    t('لا NaN ولا undefined في المخرَج', !/NaN|undefined/.test(h),
      (h.match(/NaN|undefined/g) || []).join(' '));

    // النسبة المعروضة هي عين ما تعطيه الدالة
    const g = T.tdDpsGrowth('4190');
    t('نمو جرير المعروض = المحسوب',
      h.includes(`+${(g.value * 100).toFixed(1)}%`), (g.value * 100).toFixed(1));
  }

  if (typeof ctx.showTdDivInfo === 'function') {
    let err = null;
    try { ctx.showTdDivInfo(); } catch (e) { err = e.constructor.name + ': ' + e.message; }
    t('نافذة الشرح تُفتح بلا خطأ', err === null, err);
    t('الشرح يذكر عدد الإيداعات',
      modals.length === 1 && new RegExp(String(T.TADAWUL_SOURCE_FILES)).test(modals[0][1]),
      JSON.stringify(modals.map(m => m[0])));
  }

  // التحذير القديم «بيانات أرباح غير متوفرة في التطبيق» صار كاذباً
  {
    const src = fs.readFileSync(ROOT + 'js/dividends.js', 'utf8');
    t('التحذير القديم عن غياب بيانات الأرباح صُحِّح',
      !/غير متوفرة في التطبيق/.test(src));
  }
}

// ── 7) بطاقة نمو التوزيع في الرؤية المستقبلية — تشغيل فعليّ ─────────
{
  const els = {};
  const mkEl = () => ({ _html: '', value: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    textContent: '', setAttribute() {}, getAttribute: () => null,
    appendChild(c) { return c; }, addEventListener() {}, focus() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [] });
  const byId = (id) => (els[id] = els[id] || mkEl());

  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    Math, Object, Array, Number, String, Boolean, Date, JSON, Set, Map, WeakMap,
    Promise, RegExp, Error, Intl, isFinite, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0,
    document: { readyState: 'complete', body: mkEl(), documentElement: mkEl(),
      getElementById: byId, querySelector: () => null, querySelectorAll: () => [],
      createElement: mkEl, addEventListener() {}, createTextNode: () => ({}) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: 'http://x/', pathname: '/', search: '', hash: '' },
    navigator: { userAgent: 'node' }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    alert() {}, confirm: () => true, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    Chart: function () { return { destroy() {}, update() {} }; },
    supabase: { createClient: () => ({}) }, supabaseClient: null,
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);

  let loadErr = null;
  try {
    ['js/utils.js', 'js/constitution.js', 'js/constitution-data.js',
     'js/tadawul-data.js', 'js/forecast.js']
      .forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
  } catch (e) { loadErr = e.constructor.name + ': ' + e.message; }
  t('صفحة الرؤية تُحمَّل بلا خطأ', loadErr === null, loadErr);
  t('بطاقة نمو التوزيع معرَّفة', typeof ctx.renderTadawulDivGrowth === 'function');

  if (typeof ctx.renderTadawulDivGrowth === 'function') {
    const run = (h) => { let e = null;
      try { ctx.renderTadawulDivGrowth(h); } catch (x) { e = x.constructor.name + ': ' + x.message; }
      return e; };

    t('بلا بيانات لا يرمي', run(null) === null && byId('td-divgrowth')._html === '');
    t('بحيازات فارغة لا يرمي', run({ holdingRows: [] }) === null);
    t('برموز خارج تداول: لا بطاقة',
      run({ holdingRows: [{ ticker: 'ZZZZ', value: 1000 }] }) === null
      && byId('td-divgrowth')._html === '');

    // مزيج: نظيف (1010) · متقلّب (2270) · خارج تداول (ZZZZ)
    const err = run({ holdingRows: [
      { ticker: '1010', value: 60000 },
      { ticker: '2270', value: 30000 },
      { ticker: 'ZZZZ', value: 10000 },
    ]});
    t('الرسم بمزيج لا يرمي', err === null, err);

    const html = byId('td-divgrowth')._html;
    t('البطاقة فيها محتوى', html.length > 400, 'الطول = ' + html.length);
    t('لا NaN ولا undefined', !/NaN|undefined/.test(html),
      (html.match(/NaN|undefined/g) || []).join(' '));
    t('يذكر تغطية الإيداعات', /تغطية الإيداعات/.test(html));
    t('التغطية 90% لا 100%', /90% من قيمة المحفظة/.test(html),
      (html.match(/\d+% من قيمة المحفظة/) || [])[0]);
    t('غير المغطّى مُعلَن بالاسم', /ZZZZ/.test(html));
    t('المتقلّب موسوم 🔴', /🔴/.test(html));
    t('يُعلن أن الإسقاط يفترض عائداً ثابتاً', /عائد توزيع ثابت/.test(html));
    t('يُعلن أنه لا يغيّر الحساب', /لا يغيّره|يبقى كما هو/.test(html));

    // الترجيح صحيح: 1010 بوزن 2/3 و2270 بوزن 1/3 من المغطّى
    const g1 = T.tdDpsGrowth('1010').value, g2 = T.tdDpsGrowth('2270').value;
    const want = (60000 * g1 + 30000 * g2) / 90000;
    t('المرجَّح بالقيمة صحيح حسابياً',
      html.includes(`+${(want * 100).toFixed(1)}%`), (want * 100).toFixed(1) + '%');

    // «النظيف» يستبعد المتقلّب ⇒ يساوي نمو 1010 وحده
    t('المرجَّح النظيف يستبعد المتقلّب',
      html.includes(`+${(g1 * 100).toFixed(1)}%`) && /النظيف فقط \(1 من 2\)/.test(html),
      (g1 * 100).toFixed(1) + '%');

    // كل الحيازات نظيفة ⇒ لا صفّ «النظيف فقط» منفصلاً بعدد ناقص
    run({ holdingRows: [{ ticker: '1010', value: 100 }] });
    t('محفظة نظيفة كلها: العدّ 1 من 1',
      /النظيف فقط \(1 من 1\)/.test(byId('td-divgrowth')._html));
  }

  // الحيازات تُمرَّر فعلاً من جالب البيانات — وإلا البطاقة صامتة أبداً
  {
    const src = fs.readFileSync(ROOT + 'js/forecast.js', 'utf8');
    t('holdingRows مُمرَّرة من الجالب', /holdingRows: hRows\.map/.test(src));
    t('البطاقة مُستدعاة في الرسم', /renderTadawulDivGrowth\(h\)/.test(src));
  }
}

console.log('\n' + ok + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
