// اختبار دخان: يحمّل صفحة محرّك القرار كما يحمّلها المتصفّح ويشغّلها.
// الفحوص الساكنة لا تكشف خطأ تنفيذ — هذا يكشفه.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;

// ── DOM وهمي يكفي لتشغيل الرسم ──
function mkEl(id) {
  const el = {
    id, _html: '', _text: '', value: '', checked: false, style: {}, dataset: {},
    classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
    children: [], _attr: {},
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    setAttribute(k, v) { this._attr[k] = v; },
    getAttribute(k) { return this._attr[k] ?? null; },
    appendChild(c) { this.children.push(c); return c; },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    closest: () => null, focus() {}, scrollIntoView() {}, remove() {},
    insertAdjacentHTML(_, h) { this._html += h; },
  };
  return el;
}
const els = new Map();
const doc = {
  readyState: 'complete',
  body: mkEl('body'),
  documentElement: mkEl('html'),
  getElementById: id => { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: t => mkEl('new-' + t),
  addEventListener() {}, removeEventListener() {},
  createTextNode: t => ({ textContent: t }),
};

// ── بيانات وهمية تغطّي المسارات الحرجة ──
const TODAY = Date.now();
const iso = d => new Date(TODAY - d * 86400000).toISOString();
const HOLDINGS = [
  // سهم عادي، سعر حديث، وزن فوق الهدف بقليل (نطاق الضخّ — م.49)
  { ticker: '2222', name: 'أرامكو', sector: 'الطاقة', shares: 100, avg_price: 30,
    current_price: 32, target_weight: 12, price_updated_at: iso(2) },
  // سعر قديم (م.18) + وزن دون الحدّ الأدنى (م.27)
  { ticker: '4339', name: 'دراية ريت', sector: 'إدارة وتطوير العقارات', shares: 5, avg_price: 10,
    current_price: 8, target_weight: 3, price_updated_at: iso(40) },
  // وزن كبير تحت الهدف (تجميع)
  { ticker: '1120', name: 'الراجحي', sector: 'البنوك', shares: 300, avg_price: 70,
    current_price: 75, target_weight: 20, price_updated_at: iso(1) },
  { ticker: '2010', name: 'سابك', sector: 'البتروكيماويات', shares: 200, avg_price: 80,
    current_price: 60, target_weight: 10, price_updated_at: iso(3) },
];

const SETTINGS = {
  decision_engine_v1: {
    '2222': { marketCapB: 6400, sovereignPct: 90, streakYears: 12, coverage: 0.9 },
    '2010': { marketCapB: 50, streakYears: 6, coverage: 0.5, equityEroding: true,
              divCoverage: 'uncovered', divHistoryYears: 8 },
  },
  target_review_dates_v1: { stocks: { setAt: new Date(TODAY - 10 * 86400000).toISOString().slice(0, 10) } },
  readings_log_v1: {}, deferred_exits_v1: {}, audit_log_v1: [], category_history_v1: {},
};

const TABLES = {
  holdings: HOLDINGS,
  dividends: [
    { ticker: '2222', amount: 500, payment_date: iso(30) },
    { ticker: '2222', amount: 480, payment_date: iso(400) },
    { ticker: '2010', amount: 300, payment_date: iso(60) },
    { ticker: '2010', amount: 900, payment_date: iso(430) },
    { ticker: '2010', amount: 950, payment_date: iso(800) },
    { ticker: '2010', amount: 980, payment_date: iso(1170) },
  ],
  transactions: [
    { ticker: '2222', type: 'buy', shares: 100, price: 30, total: 3000, date: iso(700), commission: 5, vat: 1 },
    { ticker: '2010', type: 'buy', shares: 200, price: 80, total: 16000, date: iso(900), commission: 20, vat: 3 },
  ],
  stock_targets: [
    { ticker: '2222', target_pct: 12 }, { ticker: '1120', target_pct: 20 },
    { ticker: '2010', target_pct: 10 }, { ticker: '4339', target_pct: 3 },
  ],
  sector_targets: [{ sector: 'الطاقة', target_pct: 25 }],
  tasks: [], stock_price_zones: [], user_stocks: [],
};

function qb(table) {
  const res = Promise.resolve({ data: TABLES[table] || [], error: null });
  const q = {
    select: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q,
    single: () => res, maybeSingle: () => res,
    insert: () => res, update: () => res, upsert: () => res, delete: () => q,
    then: (f, r) => res.then(f, r), catch: f => res.catch(f),
  };
  return q;
}

const errors = [];
const ctx = {
  console: {
    log: () => {}, info: () => {}, debug: () => {},
    warn: (...a) => errors.push(['warn', a.join(' ')]),
    error: (...a) => errors.push(['error', a.join(' ')]),
  },
  Math, Object, Array, Number, String, Boolean, Date, JSON, Set, Map, Promise, RegExp, Error,
  isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  setTimeout: (f) => { try { f(); } catch (e) { errors.push(['timeout', e.message]); } return 0; },
  clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: f => { f(); return 0; },
  document: doc,
  localStorage: {
    _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
  },
  location: { href: 'http://x/decision-engine.html', pathname: '/decision-engine.html', search: '' },
  navigator: { userAgent: 'node' },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  Chart: function () { return { destroy() {}, update() {} }; },
  supabaseClient: { from: qb, auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) } },
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
};
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.self = ctx;
vm.createContext(ctx);

function load(f) {
  try { vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }); }
  catch (e) { errors.push(['load:' + f, e.constructor.name + ': ' + e.message]); }
}

// نفس ترتيب decision-engine.html
['js/utils.js', 'js/constitution.js', 'js/constitution-data.js'].forEach(load);

// بدائل بعد utils.js (تدهس تعريفاته)
ctx.requireAuth = async () => ({ id: 'u1' });
ctx.showToast = () => {};
ctx.loadUserSetting = async k => (k in SETTINGS ? SETTINGS[k] : null);
ctx.saveUserSetting = async () => true;
ctx.confirmAsync = async () => true;
ctx.setActiveNav = () => {};
ctx.initNav = () => {};

load('js/decision-engine.js');
// البدائل مرة أخرى — الملف قد يعيد تعريفها
ctx.showToast = () => {};
ctx.loadUserSetting = async k => (k in SETTINGS ? SETTINGS[k] : null);
ctx.saveUserSetting = async () => true;

let ok = 0, bad = 0;
const t = (n, cond, extra) => {
  cond ? ok++ : bad++;
  console.log((cond ? 'PASS ' : 'FAIL ') + n + (cond ? '' : '  ← ' + (extra || '')));
};

(async () => {
  const body = id => (els.get(id) || {})._html || '';
  t('الملفات حُمّلت بلا خطأ', !errors.some(e => e[0].startsWith('load:')),
    errors.filter(e => e[0].startsWith('load:')).map(e => e[0] + ' ' + e[1]).join(' | '));

  // ── تشغيل دورة كاملة كما تفعل الصفحة ──
  try {
    if (typeof ctx.loadAll === 'function') await ctx.loadAll();
    t('loadAll تمّت', true);
  } catch (e) {
    t('loadAll تمّت', false, e.constructor.name + ': ' + e.message + '\n' + (e.stack || '').split('\n')[1]);
  }
  try {
    if (typeof ctx.runEngine === 'function') ctx.runEngine();
    t('runEngine تمّت', true);
  } catch (e) {
    t('runEngine تمّت', false, e.constructor.name + ': ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n'));
  }

  // ⚠️ `let _results` لا يُعرَض على سياق vm، فنقيس أثره لا قيمته:
  // شريط الملخّص لا يُرسَم إلا بعد تقييم كل الحيازات.
  t('التقييم أنتج مخرَجاً', body('de-summary').length > 20 || body('de-plan-body').length > 200,
    'de-summary=' + body('de-summary').length + ' plan=' + body('de-plan-body').length);
  t('خطة الأهداف مرسومة', body('de-plan-body').length > 50, 'الطول = ' + body('de-plan-body').length);
  t('البطاقات مرسومة', body('de-cards').length > 20 || body('de-alerts').length > 20,
    'de-cards=' + body('de-cards').length + ' de-alerts=' + body('de-alerts').length);

  // ── أخطاء أثناء التشغيل ──
  const runtime = errors.filter(e => e[0] === 'error' || e[0] === 'timeout');
  t('لا خطأ تنفيذ', runtime.length === 0, runtime.map(e => e[0] + ': ' + e[1]).slice(0, 5).join(' | '));

  if (errors.length) {
    console.log('\n=== كل ما رُصد ===');
    errors.slice(0, 15).forEach(e => console.log('  •', e[0], '→', String(e[1]).slice(0, 220)));
  }

  console.log(`\n${ok} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
