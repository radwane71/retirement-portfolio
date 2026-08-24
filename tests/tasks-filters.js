// ══════════════════════════════════════════════════════════════════════
// صفحة التقييمات العادلة (tasks.html) — البحث بالرمز وفلتر «بلا تقييم»
// ----------------------------------------------------------------------
// الفلاتر القائمة (القرار · الحالة) تسأل كلّها عن بطاقةٍ **موجودة** في
// اللوحة. وسهمٌ لم يُقيَّم قط لا بطاقة له، فلا يظهر في أي منها مهما ضُبطت
// — والسؤال «أي أسهمي بلا تقييم؟» لم يكن له جواب في الصفحة.
//
// وهذا فحصٌ **يُشغّل** الصفحة ويقرأ ما يخرج منها.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;

let ok = 0, bad = 0;
const t = (n, cond, extra) => { cond === true ? ok++ : bad++;
  console.log((cond === true ? 'PASS ' : 'FAIL ') + n + (cond === true ? '' : '  ← ' + (extra || ''))); };

const els = {};
const mkEl = () => ({ _html: '', value: '', style: {}, dataset: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
  textContent: '', setAttribute() {}, getAttribute: () => null,
  appendChild(c) { return c; }, addEventListener() {}, focus() {}, remove() {},
  scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [],
  getContext: () => ({ canvas: {}, createLinearGradient: () => ({ addColorStop() {} }) }) });
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
  supabase: { createClient: () => ({}) }, supabaseClient: null, showToast() {},
  requireAuth: () => Promise.resolve(null),
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);

let loadErr = null;
try {
  ['js/utils.js', 'js/constitution.js', 'js/tasks.js']
    .forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
} catch (e) { loadErr = e.constructor.name + ': ' + e.message; }
t('الصفحة تُحمَّل بلا خطأ', loadErr === null, loadErr);
['applyFilters', 'renderUntracked', 'clearTkFilters', 'showUntracked', 'newCardFor']
  .forEach(fn => t(`${fn} معرَّفة`, typeof ctx[fn] === 'function'));

// ── بيانات مزروعة ────────────────────────────────────────────────────
vm.runInContext(`
  _tasks = [
    { id:'t1', ticker:'7202', name:'سلوشنز',     type:'accumulation', status:'active', auto_generated:false },
    { id:'t2', ticker:'1010', name:'بنك الرياض', type:'hold',         status:'active', auto_generated:false },
    { id:'t3', ticker:'4348', name:'الخبير ريت', type:'liquidation',  status:'done',   auto_generated:false },
  ];
  _holdings = [
    { ticker:'7202', name:'سلوشنز',    shares:100, current_price:300 },
    { ticker:'1010', name:'بنك الرياض', shares:500, current_price:30 },
    { ticker:'2222', name:'أرامكو',     shares:1000, current_price:28 },
    { ticker:'4002', name:'المواساة',   shares:50,  current_price:78 },
  ];
  _totalValue = _holdings.reduce((s,h) => s + h.shares * h.current_price, 0);
  _valLast = {
    '7202': { date:'2026-08-01', fair:{ avg:280 } },
    '2222': { date:'2026-07-01', fair:{ avg:30  } },
  };
  _stockTargets = {}; _filterType = 'all';
`, ctx);

const setStatus = (v) => { byId('status-filter').value = v; };
const setQuery  = (v) => { byId('tk-search').value = v; };
const grid = () => byId('val-grid')._html;
const note = () => byId('tk-search-note')._html;

// ══════════════════════════════════════════════════════════════════════
// ① البحث بالرمز
// ══════════════════════════════════════════════════════════════════════
{
  setStatus('active'); setQuery(''); ctx.applyFilters();
  t('اللوحة تعرض التقييمين النشطين',
    /7202/.test(grid()) && /1010/.test(grid()), byId('tasks-count-label').textContent);

  setQuery('7202'); ctx.applyFilters();
  t('البحث بالرمز يُبقي المطابق وحده',
    /7202/.test(grid()) && !/1010/.test(grid()), byId('tasks-count-label').textContent);

  setQuery('الرياض'); ctx.applyFilters();
  t('والبحث بالاسم العربي يعمل', /1010/.test(grid()) && !/7202/.test(grid()));

  setQuery('zzzz'); ctx.applyFilters();
  t('ورمزٌ لا وجود له يعطي لوحة فارغة', /لا توجد تقييمات هنا/.test(grid()));
  t('ويقترح فلتر «بلا تقييم»', /اعرض الأسهم بلا تقييم/.test(note()),
    'رمز لا تقييم له = بالضبط ما يحتاج هذا الفلتر');
}

// ══════════════════════════════════════════════════════════════════════
// ② الاختفاء تحت فلترٍ يُعلَن ولا يُبتلع
// ══════════════════════════════════════════════════════════════════════
{
  setQuery('7202');
  vm.runInContext("_filterType = 'liquidation';", ctx);   // سلوشنز «تجميع»
  ctx.applyFilters();
  t('البحث يختفي تحت فلتر القرار', !/7202/.test(grid()));
  t('والاختفاء يُعلَن بعدده', /يطابق البحث/.test(note()) && /1 تقييماً/.test(note()),
    'كان يعود فارغاً فيُقرأ «لا تقييم لهذا السهم»');
  t('ومعه زرّ مسح الفلاتر', /clearTkFilters/.test(note()));

  ctx.clearTkFilters();
  t('والمسح يُظهره', /7202/.test(grid()), 'بعد المسح لم يظهر');
  // ⚠️ فحصٌ كتبتُه أولاً `=== undefined || true` — يمرّ دائماً ولا يفحص شيئاً.
  // الفحص الذي لا يمكن أن يفشل ليس فحصاً. و`_filterType` معرّفة بـ`let`
  // فلا تظهر على السياق — تُقرأ داخله.
  t('ويُصفّر فلتر النوع',
    vm.runInContext('_filterType', ctx) === 'all',
    String(vm.runInContext('_filterType', ctx)));
  t('ويُصفّر فلتر الحالة', byId('status-filter').value === 'all',
    byId('status-filter').value);
}

// ══════════════════════════════════════════════════════════════════════
// ③ «أسهم بلا تقييم إطلاقاً»
// ══════════════════════════════════════════════════════════════════════
{
  setQuery(''); setStatus('__untracked'); ctx.applyFilters();
  const g = grid();
  // 2222 أرامكو: لها قيمة عادلة ولا بطاقة قرار
  // 4002 المواساة: لا بطاقة ولا قيمة عادلة
  // 7202 و1010: لهما بطاقة — و1010 بلا قيمة عادلة فيظهر
  t('يعرض المالك بلا بطاقة قرار', /2222/.test(g) && /4002/.test(g));
  t('ويعرض من له بطاقة وينقصه العادلة', /1010/.test(g),
    'بنك الرياض له بطاقة ولا قيمة عادلة محفوظة');
  t('ويستبعد المكتمل', !/>7202</.test(g), 'سلوشنز لها بطاقة وقيمة عادلة');
  t('ويفرّق بين النقصين', /بطاقة القرار/.test(g) && /القيمة العادلة/.test(g));
  t('ويُرتَّب بالوزن', g.indexOf('2222') < g.indexOf('4002'),
    'أرامكو 28,000 والمواساة 3,900 — الأكبر أولاً');
  t('ويشرح لماذا لا تظهر في الفلاتر', /ليست في اللوحة أصلاً/.test(g));
  t('ويربط بمحرّك القرار', /الفلتر 3/.test(g));
  t('ومع كل صفّ زرّ عمل',
    /newCardFor\(/.test(g) && /stock-valuation\.html/.test(g));
  t('ولا يقرأ اللوحة أصلاً — يعمل ولو كانت فارغة', (() => {
    vm.runInContext("const _bak = _tasks; _tasks = [];", ctx);
    ctx.applyFilters();
    const r = /2222/.test(grid());
    vm.runInContext("_tasks = _bak;", ctx);
    return r;
  })());
}

// ══════════════════════════════════════════════════════════════════════
// ④ البحث داخل «بلا تقييم»
// ══════════════════════════════════════════════════════════════════════
{
  setStatus('__untracked'); setQuery('2222'); ctx.applyFilters();
  t('البحث يعمل داخل فلتر التغطية', /2222/.test(grid()) && !/4002/.test(grid()));
  setQuery('أرامكو'); ctx.applyFilters();
  t('وبالاسم كذلك', /2222/.test(grid()));
  setQuery('zzzz'); ctx.applyFilters();
  t('وبلا نتيجة يقول ذلك', /لا سهم يطابق البحث/.test(grid()));
}

// ══════════════════════════════════════════════════════════════════════
// ⑤ الحارس: `openValModal` تأخذ معرّفاً لا رمزاً
// ══════════════════════════════════════════════════════════════════════
{
  const src = fs.readFileSync(ROOT + 'js/tasks.js', 'utf8');
  t('لا تمرير رمزٍ إلى openValModal', !/openValModal\('\$\{esc\(r\.tk\)\}'\)/.test(src),
    'تمرير الرمز يجعلها تبحث عن تقييم بذلك المعرّف فتخرج صامتة');
  t('بل دالة تفتح جديدة وتملأ الرمز', /function newCardFor\(tk, name\)/.test(src));

  const html = fs.readFileSync(ROOT + 'tasks.html', 'utf8');
  t('خانة البحث في الصفحة', /id="tk-search"/.test(html));
  t('وخيار «بلا تقييم» في الحالة', /value="__untracked"/.test(html));
}

console.log('\n' + ok + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
