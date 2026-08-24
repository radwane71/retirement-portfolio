// ══════════════════════════════════════════════════════════════════════
// اختبار دخان لصفحة «الرؤية المستقبلية» — تُحمَّل وتُشغَّل فعلاً
// ----------------------------------------------------------------------
// نفس منهج tests/de-smoke.js: الفحص الساكن يثبت وجود سطر لا صحّة سلوك.
// هذه الصفحة تحمل أثقل حساب في المنصّة (سيناريوهات · مونتي كارلو ·
// معالم الدستور)، فخطأ تنفيذ واحد فيها يُسقط الصفحة كلها بلا أثر ظاهر.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;

function mkEl(id) {
  const el = { id, _html: '', _text: '', value: '', checked: false, style: {}, dataset: {},
    classList: { add(){}, remove(){}, toggle(){}, contains: () => false }, children: [], _attr: {},
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    setAttribute(k, v) { this._attr[k] = v; }, getAttribute(k) { return this._attr[k] ?? null; },
    appendChild(c) { this.children.push(c); return c; },
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, closest: () => null,
    focus() {}, select() {}, scrollIntoView() {}, remove() {}, insertAdjacentHTML() {},
    getContext: () => ({ canvas: { width: 300, height: 150 }, save(){}, restore(){},
      fillRect(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){},
      fill(){}, arc(){}, fillText(){}, measureText: () => ({ width: 10 }), setLineDash(){} }) };
  return el;
}
const els = new Map();
const getEl = id => { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); };

const TODAY = Date.now();
const iso = d => new Date(TODAY - d * 86400000).toISOString().slice(0, 10);

const TABLES = {
  holdings: [
    { ticker: '2222', name: 'أرامكو', sector: 'الطاقة', shares: 100, avg_price: 30, current_price: 32 },
    { ticker: '1120', name: 'الراجحي', sector: 'البنوك', shares: 200, avg_price: 70, current_price: 78 },
  ],
  // ⚠️ عمود `year` موجود في الجدول الحقيقي ويُقرأ في js/forecast.js:577.
  // إغفاله في العيّنة كان يُنتج NaN يسري إلى معدّل النمو — وهو ما كشف
  // الهشاشة الحقيقية: صفٌّ واحد بلا سنة يُفسد الإسقاط كلّه بصمت.
  dividends: [
    { ticker: '2222', amount: 520, payment_date: iso(40),  year: new Date(TODAY - 40 * 86400000).getFullYear() },
    { ticker: '2222', amount: 500, payment_date: iso(220), year: new Date(TODAY - 220 * 86400000).getFullYear() },
    { ticker: '1120', amount: 900, payment_date: iso(120), year: new Date(TODAY - 120 * 86400000).getFullYear() },
    { ticker: '1120', amount: 850, payment_date: iso(300), year: new Date(TODAY - 300 * 86400000).getFullYear() },
  ],
  transactions: [
    { ticker: '2222', type: 'buy', shares: 100, price: 30, total: 3000, date: iso(700), commission: 5, vat: 1 },
    { ticker: '1120', type: 'buy', shares: 200, price: 70, total: 14000, date: iso(500), commission: 15, vat: 2 },
  ],
  net_worth_snapshots: [
    { date: iso(400), total_value: 15000, notes: 'auto' },
    { date: iso(200), total_value: 19000, notes: 'auto' },
    { date: iso(10),  total_value: 18800, notes: 'auto' },
  ],
  cashflows: [], real_estate: [], other_assets: [], user_stocks: [],
};
const SETTINGS = {
  retirement_goal_v1: { monthly: 6000, swr: 4, target_year: 2045 },
  forecast_plans_v1: [],
};

function qb(table) {
  const res = Promise.resolve({ data: TABLES[table] || [], error: null });
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q,
    gte: () => q, lte: () => q, single: () => res, maybeSingle: () => res,
    insert: () => res, update: () => res, upsert: () => res, delete: () => q,
    then: (f, r) => res.then(f, r), catch: f => res.catch(f) };
  return q;
}

const errors = [];
const ctx = {
  console: { log(){}, info(){}, debug(){}, warn(){}, error: (...a) => errors.push(a.join(' ')) },
  Math, Object, Array, Number, String, Boolean, Date, JSON, Set, Map, Promise, RegExp, Error, Intl,
  isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  setTimeout: f => { try { f(); } catch (e) { errors.push('timeout: ' + e.message); } return 0; },
  clearTimeout(){}, setInterval: () => 0, clearInterval(){}, requestAnimationFrame: f => { f(); return 0; },
  document: { readyState: 'complete', body: mkEl('body'), documentElement: mkEl('html'),
    getElementById: getEl, querySelector: () => null, querySelectorAll: () => [],
    createElement: t => mkEl('new-' + t), addEventListener(){}, removeEventListener(){},
    createTextNode: () => ({}) },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  location: { href: 'http://x/forecast.html', pathname: '/forecast.html', search: '' },
  navigator: { userAgent: 'node' }, matchMedia: () => ({ matches: false, addEventListener(){} }),
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  getComputedStyle: () => ({ getPropertyValue: () => '#000' }),
  Chart: function () { return { destroy(){}, update(){}, data: {}, options: {} }; },
  supabaseClient: { from: qb, auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) } },
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
ctx.Chart.register = () => {};
vm.createContext(ctx);

function load(f) {
  try { vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }); }
  catch (e) { errors.push('load ' + f + ': ' + e.constructor.name + ': ' + e.message); }
}
['js/utils.js', 'js/constitution.js', 'js/constitution-data.js'].forEach(load);
ctx.requireAuth = async () => ({ id: 'u1' });
ctx.showToast = () => {};
ctx.loadUserSetting = async k => (k in SETTINGS ? SETTINGS[k] : null);
ctx.saveUserSetting = async () => true;
ctx.confirmAsync = async () => true;
ctx.setActiveNav = () => {}; ctx.initNav = () => {};
load('js/forecast.js');
ctx.showToast = () => {};
ctx.loadUserSetting = async k => (k in SETTINGS ? SETTINGS[k] : null);
ctx.saveUserSetting = async () => true;

let ok = 0, bad = 0;
const t = (n, cond, extra) => { cond ? ok++ : bad++;
  console.log((cond ? 'PASS ' : 'FAIL ') + n + (cond ? '' : '  ← ' + (extra || ''))); };
const body = id => (els.get(id) || {})._html || '';

(async () => {
  t('الملفات حُمّلت بلا خطأ', !errors.some(e => e.startsWith('load ')),
    errors.filter(e => e.startsWith('load ')).join(' | '));

  // مدخلات الصفحة كما يملؤها المستخدم
  Object.entries({
    'inp-current-value': '230000', 'inp-monthly': '8000', 'inp-years': '20',
    'inp-cap-growth': '5', 'inp-div-yield': '5.5', 'inp-div-growth': '3',
    'inp-goal-amount': '1310000', 'inp-withdraw-end-year': '2055',
  }).forEach(([k, v]) => { getEl(k).value = v; });

  const call = async (fn, label) => {
    if (typeof ctx[fn] !== 'function') { t(label + ' موجودة', false, fn + ' غير معرَّفة'); return; }
    try { await ctx[fn](); t(label, true); }
    catch (e) {
      t(label, false, e.constructor.name + ': ' + e.message + ' @ ' +
        (e.stack || '').split('\n')[1].trim());
    }
  };

  // نفس ما يفعله المتصفّح: init() تستدعي السلسلة كاملة
  await call('init', 'init() الكاملة');
  // ثم كل خطوة على حدة لعزل موضع أي انهيار
  await call('loadHistoricalData', 'تحميل التاريخ');
  await call('renderHistSummary', 'رسم ملخّص الأداء');
  await call('buildScenarios', 'بناء السيناريوهات');
  await call('renderScenarioCards', 'رسم كروت السيناريوهات');
  await call('runForecast', 'تشغيل الإسقاط');

  // المخرَجات مرسومة فعلاً
  t('معالم الدستور مرسومة (م.7)', body('constitution-milestones').length > 50,
    'الطول = ' + body('constitution-milestones').length);
  t('ملخّص الأداء التاريخي مرسوم', body('hist-summary').length > 20,
    'الطول = ' + body('hist-summary').length);

  // عرض المخرَجات للفحص اليدوي: DUMP=1 node tests/forecast-smoke.js
  if (process.env.DUMP) {
    const plain = h => String(h).replace(/<[^>]+>/g, ' ').replace(/[ 	]+/g, ' ').trim();
    ['constitution-milestones', 'fire-link-banner', 'hist-summary',
     'hist-summary-rest', 'scenario-prob-note'].forEach(id => {
      console.log('');
      console.log('--- ' + id + ' ---');
      console.log(plain(body(id)).slice(0, 600) || '(فارغ)');
    });
  }

  if (process.env.DUMP) {
    // ⚠️ `let _hist` لا يُعرَض على سياق vm — نُعيد استدعاء المُنتِج نفسه
    const H = (await ctx.loadHistoricalData()) || {};
    console.log('  [مفاتيح المُرجَع] = ' + Object.keys(H).length);
    console.log('');
    console.log('--- قيم _hist الحرجة ---');
    ['currentValue','costBasis','annCapGrowth','blendedCapGrowth','perfWeight',
     'marketBenchmark','safeDivYield','ttmDivYield','avgAnnualDiv','fwdAnnualIncome',
     'yearsActive','avgMonthlyDeposit'].forEach(k =>
      console.log('  ' + k + ' = ' + String(H[k]) + '  [' + typeof H[k] + ']'));
  }

  // ══ الأرقام نفسها، لا وجود الصفحة ══
  {
    const H = (await ctx.loadHistoricalData()) || {};
    const finite = v => typeof v === 'number' && isFinite(v);
    t('معدّل النمو رقم صالح', finite(H.blendedCapGrowth), String(H.blendedCapGrowth));
    t('ولا NaN في العائد',    finite(H.safeDivYield),     String(H.safeDivYield));
    t('ولا NaN في التوزيعات', finite(H.avgAnnualDiv),     String(H.avgAnnualDiv));
    t('ولم يُستبدَل بالمعيار مع بيانات سليمة', H.growthFallback !== true);

    // ⚠️ توزيعات بلا عمود `year` كانت تُنتج NaN يسري إلى الإسقاط كلّه بصمت.
    // ⚠️ `t` هنا يفحص **الصدق** لا المطابقة — فكل توقُّع يُكتب شرطاً صريحاً.
    const orig = TABLES.dividends;
    TABLES.dividends = orig.map(d => { const c = { ...d }; delete c.year; return c; });
    const H2 = (await ctx.loadHistoricalData()) || {};
    TABLES.dividends = orig;
    t('بلا عمود السنة لا يُنتج NaN', finite(H2.blendedCapGrowth), String(H2.blendedCapGrowth));

    // ⚠️ **تغيَّر التوقُّع في أوديت 2026-08-24، ولمصلحة أقوى.**
    // كان النمو السعري يُشتقّ `XIRR الكلّي − عائد التوزيعات`، فسجلٌّ بلا
    // عمود سنة يفسد الطرف الثاني ويُنتج NaN ⇒ سقوطٌ على معيار السوق.
    // صار يُشتقّ من XIRR على **الشراء والبيع وحدهما** (تعريف
    // money-weighted price return)، فلا يمسّ التوزيعات إطلاقاً — وغياب
    // عمود السنة لم يعد يقدر على إفساده أصلاً.
    //
    // الحارس الأقوى: **الرقم لا يتغيّر** بحذف العمود، لا أنه «يسقط على
    // بديل معلَن». والسقوط نفسه ما زال قائماً لمسارٍ لا XIRR فيه.
    const H1 = H;
    t('حذف عمود السنة لا يحرّك النمو السعري إطلاقاً',
      finite(H1.blendedCapGrowth) && Math.abs(H2.blendedCapGrowth - H1.blendedCapGrowth) < 1e-9,
      `${H1.blendedCapGrowth} مقابل ${H2.blendedCapGrowth}`);
    t('ولا يُعلَن استبدالٌ لم يقع', H2.growthFallback !== true, String(H2.growthFallback));
    t('والأداء الشخصي يبقى محسوباً', finite(H2.annCapGrowth), String(H2.annCapGrowth));

    // وحارس NaN نفسه ما زال في الكود لمسار الاحتياطي
    const fsrc = fs.readFileSync(ROOT + 'js/forecast.js', 'utf8');
    t('حارس NaN ما زال قائماً', /_growthBad/.test(fsrc) && /growthFallback/.test(fsrc));
  }

  // ══ رقم واحد لهدفك، لا رقمان ══
  {
    const html = body('constitution-milestones');
    t('بطاقة المعالم بلا «ر.س ر.س»', !/ر\.س\s+ر\.س/.test(html.replace(/<[^>]+>/g, ' ')));
    t('ولا تكرّر هدف FIRE (بطاقته أعلاه تحسبه)', !/هدف FIRE/.test(html));
  }

  // ══ لا NaN ولا Infinity في أي مخرَج معروض ══
  {
    const bad = [];
    ['constitution-milestones','hist-summary','hist-summary-rest','scenario-prob-note',
     'fire-link-banner','forecast-result','mc-result','milestones-table'].forEach(id => {
      const txt = body(id).replace(/<[^>]+>/g, ' ');
      if (/NaN|Infinity|undefined/.test(txt)) bad.push(id + ': ' + (txt.match(/\S*(NaN|Infinity|undefined)\S*/) || [])[0]);
    });
    t('لا NaN/Infinity/undefined في المعروض', bad.length === 0, bad.join(' | '));
  }

  const runtime = errors.filter(e => !e.startsWith('load '));
  t('لا خطأ تنفيذ', runtime.length === 0, runtime.slice(0, 4).join(' | '));

  if (errors.length) {
    console.log('\n=== ما رُصد ===');
    errors.slice(0, 12).forEach(e => console.log('  •', String(e).slice(0, 240)));
  }
  console.log(`\n${ok} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
