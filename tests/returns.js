// ══════════════════════════════════════════════════════════════════════
// 📈 تبويب العائد بالنسبة المئوية — TWR سنوياً وللمدى المخصّص
// ----------------------------------------------------------------------
// **يُشغَّل على أرقام يُعرف جوابها سلفاً.** الحساب المالي لا يُقبل بفحصٍ
// يقول «الدالة موجودة»: محفظة تضاعفت ثم نزلت النصف عائدها صفر، ومحفظة
// دخلها إيداعٌ ضخم يوم واحد قبل الإقفال لا يتغيّر TWR لها إطلاقاً. إن لم
// يُخرج الكود هذين الرقمين فهو خطأ مهما بدا سليماً.
//
// ولماذا هذا الحرص: رقم العائد يُقرأ ويُبنى عليه قرار. رقمٌ خاطئ هنا أسوأ
// من لا رقم.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;

let ok = 0, bad = 0;
const t = (n, cond, extra) => { cond === true ? ok++ : bad++;
  console.log((cond === true ? 'PASS ' : 'FAIL ') + n + (cond === true ? '' : '  ← ' + (extra || ''))); };
const near = (a, b, eps) => a != null && Math.abs(a - b) < (eps == null ? 1e-6 : eps);

// ── سياق تشغيل ───────────────────────────────────────────────────────
const els = {};
const mkEl = () => ({ _html: '', value: '', style: {}, dataset: {}, className: '',
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
  textContent: '', setAttribute() {}, getAttribute: () => null,
  appendChild(c) { return c; }, addEventListener() {}, focus() {}, remove() {},
  scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [],
  getContext: () => ({ canvas: {}, createLinearGradient: () => ({ addColorStop() {} }) }) });
const byId = (id) => (els[id] = els[id] || mkEl());

const toasts = [], modals = [];
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
  XLSX: { utils: {}, write: () => '' },
  supabase: { createClient: () => ({}) }, supabaseClient: null,
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);

let loadErr = null;
try {
  ['js/utils.js', 'js/constitution.js', 'js/constitution-data.js',
   'js/tadawul-data.js', 'js/performance.js']
    .forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
} catch (e) { loadErr = e.constructor.name + ': ' + e.message; }
ctx.showToast = (m, ty) => toasts.push([m, ty]);
ctx.openInfoModal = (ti, b) => modals.push([ti, b]);

t('صفحة الأداء تُحمَّل بلا خطأ', loadErr === null, loadErr);
t('حاسبة العائد معرَّفة', typeof ctx._returnsData === 'function');
t('الرسم معرَّف', typeof ctx.renderReturns === 'function');
t('التبويب يُبدَّل إليه', typeof ctx.showPerfTab === 'function');

// ══════════════════════════════════════════════════════════════════════
// TWR على أرقام يُعرف جوابها — لا حاجة لبيانات المستخدم
// ══════════════════════════════════════════════════════════════════════
const snap = (date, v) => ({ date, total_value: v, notes: 'auto' });
const twrOf = (snaps, flows) => {
  const r = ctx._computeTWR(snaps, flows || [], 'end');
  const ds = Object.keys(r.twrMap).sort();
  return r.twrMap[ds[ds.length - 1]] / r.twrMap[ds[0]] - 1;
};

t('محفظة ثابتة ⇒ عائد صفر',
  near(twrOf([snap('2025-01-01', 1000), snap('2025-06-01', 1000), snap('2025-12-31', 1000)]), 0, 1e-9));

t('تضاعفت ⇒ +100%',
  near(twrOf([snap('2025-01-01', 1000), snap('2025-12-31', 2000)]), 1, 1e-9));

t('تضاعفت ثم نصف ⇒ صفر (تركيب هندسي لا جمع)',
  near(twrOf([snap('2025-01-01', 1000), snap('2025-06-01', 2000), snap('2025-12-31', 1000)]), 0, 1e-9));

{
  // جوهر TWR: إيداع ضخم لا يغيّر العائد إطلاقاً
  const flows = [{ date: '2025-06-02', type: 'deposit', amount: 100000 }];
  const s = [snap('2025-01-01', 1000), snap('2025-06-01', 1100), snap('2025-12-31', 101100)];
  t('إيداع ضخم لا يحرّك TWR', near(twrOf(s, flows), 0.10, 1e-9),
    'العائد = ' + twrOf(s, flows));
}

{
  // ولا السحب
  const flows = [{ date: '2025-06-02', type: 'withdrawal', amount: 500 }];
  const s = [snap('2025-01-01', 1000), snap('2025-06-01', 1200), snap('2025-12-31', 700)];
  t('سحب لا يُقرأ خسارة', near(twrOf(s, flows), 0.20, 1e-9), 'العائد = ' + twrOf(s, flows));
}

t('هبوط 30% يُقرأ سالباً',
  near(twrOf([snap('2025-01-01', 1000), snap('2025-12-31', 700)]), -0.30, 1e-9));

// ══════════════════════════════════════════════════════════════════════
// السنوات والمدى — عبر _returnsData بسلسلة مزروعة
// ══════════════════════════════════════════════════════════════════════
// سنتان معلومتان: 2024 ‏+20% · 2025 ‏−25% · 2026 حتى اليوم ‏+50%
// التراكمي = 1.20 × 0.75 × 1.50 − 1 = +35%
const SERIES = [
  ['2024-01-02', 1000], ['2024-12-31', 1200],
  ['2025-12-31', 900],
  ['2026-08-20', 1350],
];
const seed = `
  _dailyStocksTRSeries = function () {
    const out = ${JSON.stringify(SERIES.map(([d, v]) => ({ date: d, total_value: v, notes: 'auto' })))};
    out.covered = new Set(['AAA']);
    return out;
  };
  _stockFlows = function () { return []; };
  _dailyCoverage = function () { return { missing: ['BBB'] }; };
  _tx = [{ ticker:'AAA', type:'buy', date:'2024-01-02', total:1000, shares:100 }];
  _divs = [];
  _positionCache = { open: [{ ticker:'AAA', marketValue: 1350 }], closed: [] };
  _cf = [];`;
vm.runInContext(seed, ctx);

const d = ctx._returnsData();
t('البيانات تُحسب', d && d.ok === true, JSON.stringify(d && d.why));

if (d && d.ok) {
  t('التراكمي = +35%', near(d.total, 0.35, 1e-9), 'القيمة = ' + d.total);
  t('ثلاث سنوات مرصودة', d.byYear.length === 3, JSON.stringify(d.byYear.map(y => y.year)));

  const y = Object.fromEntries(d.byYear.map(r => [r.year, r]));
  t('2024 = +20%', near(y[2024].ret, 0.20, 1e-9), 'القيمة = ' + y[2024].ret);
  t('2025 = −25%', near(y[2025].ret, -0.25, 1e-9), 'القيمة = ' + y[2025].ret);
  t('2026 = +50%', near(y[2026].ret, 0.50, 1e-9), 'القيمة = ' + y[2026].ret);

  // بداية السنة = آخر نقطة في السابقة، لا أول نقطة فيها
  t('2025 تبدأ من إقفال 2024', y[2025].from === '2024-12-31', y[2025].from);
  t('2026 تبدأ من إقفال 2025', y[2026].from === '2025-12-31', y[2026].from);

  t('السنة الأولى موسومة جزئية', y[2024].partial === true);
  t('السنة الجارية موسومة جزئية', y[2026].partial === true);
  t('السنة الكاملة ليست جزئية', y[2025].partial === false, JSON.stringify(y[2025]));

  // المدى المخصّص
  const r45 = ctx._retBetween(d.pts, '2024-01-01', '2025-12-31');
  t('مدى 2024–2025 = −10%', near(r45.ret, 1.20 * 0.75 - 1, 1e-9), 'القيمة = ' + r45.ret);
  const r56 = ctx._retBetween(d.pts, '2025-01-01', '2026-12-31');
  t('مدى 2025–2026 = +12.5%', near(r56.ret, 0.75 * 1.50 - 1, 1e-9), 'القيمة = ' + r56.ret);
  const rAll = ctx._retBetween(d.pts, '2024-01-01', '2026-12-31');
  t('مدى الكل = التراكمي', near(rAll.ret, d.total, 1e-9), rAll.ret + ' مقابل ' + d.total);

  // مدى بسنة واحدة يساوي عائد تلك السنة
  const r25 = ctx._retBetween(d.pts, '2025-01-01', '2025-12-31');
  t('مدى سنة واحدة = عائد السنة', near(r25.ret, y[2025].ret, 1e-9), r25.ret + ' مقابل ' + y[2025].ret);

  // 1,000 ر.س في 2024-01-02 ← قيمة 1,350 اليوم ≈ 12% سنوياً.
  // ⚠️ `computeXIRR` ترجع نسبة مئوية لا كسراً — أول تشغيل أخرج 12.02 وكان
  // الكود يضربها في 100 فتُعرَض **+1202%**. هذا الحارس يمنع عودتها.
  t('XIRR بالكسر لا بالنسبة المئوية',
    typeof d.xirr === 'number' && d.xirr > 0.05 && d.xirr < 0.30,
    'القيمة = ' + d.xirr + ' (لو > 1 فالوحدة مقلوبة)');
  t('XIRR يقارب 12% سنوياً', near(d.xirr, 0.12, 0.02), 'القيمة = ' + d.xirr);
}

// ══════════════════════════════════════════════════════════════════════
// الرسم — لا استثناء، ولا رقم مختلق حين تغيب البيانات
// ══════════════════════════════════════════════════════════════════════
{
  let err = null;
  try { ctx.renderReturns(); } catch (e) { err = e.constructor.name + ': ' + e.message; }
  t('الرسم لا يرمي', err === null, err);

  const h = byId('ret-body')._html;
  t('فيه محتوى', h.length > 800, 'الطول = ' + h.length);
  t('بلا NaN ولا undefined', !/NaN|undefined/.test(h), (h.match(/NaN|undefined/g) || []).join(' '));
  t('يعرض التراكمي +35.00%', /\+35\.00%/.test(h), (h.match(/[+-]\d+\.\d\d%/g) || []).join(' '));
  t('يعرض 2025 سالبة', /-25\.00%/.test(h));
  t('يعرض الثلاث سنوات', /2024/.test(h) && /2025/.test(h) && /2026/.test(h));
  t('يوسم الجزئية', /جزئية/.test(h));
  t('يُعلن الرمز خارج القياس', /BBB/.test(h) && /خارج القياس/.test(h));
  t('يشرح الفرق بين TWR وXIRR', /TWR/.test(h) && /XIRR/.test(h) && /توقيت/.test(h));
  t('يُعلن أن الأساس أسهمك وحدها', /لا نقد راكد/.test(h));

  // المدى المخصّص يتحدّث عند تغيير الاختيار
  byId('ret-from').value = '2025'; byId('ret-to').value = '2025';
  let e2 = null;
  try { ctx.onRetRange(); } catch (e) { e2 = e.constructor.name + ': ' + e.message; }
  t('تغيير المدى لا يرمي', e2 === null, e2);
  t('المدى المختار ينعكس في المخرَج',
    /من 2025 إلى 2025/.test(byId('ret-body')._html), 'لم يظهر عنوان المدى');

  // مدى مقلوب: يُنبَّه ولا يُخرج رقماً سالباً بلا معنى
  byId('ret-from').value = '2026'; byId('ret-to').value = '2024';
  ctx.onRetRange();
  t('المدى المقلوب يُنبَّه', /اقلبهما/.test(byId('ret-body')._html));
}

// غياب الأسعار: يُعلَن ولا يُستبدل بـ«القيمة ÷ التكلفة»
{
  vm.runInContext('_dailyStocksTRSeries = function () { return null; };', ctx);
  byId('ret-body')._html = '';
  let err = null;
  try { ctx.renderReturns(); } catch (e) { err = e.constructor.name + ': ' + e.message; }
  t('غياب السلسلة لا يرمي', err === null, err);
  const h = byId('ret-body')._html;
  t('غياب السلسلة يُعلَن صراحةً', /لا يمكن قياس العائد بعد/.test(h), h.slice(0, 120));
  t('ولا يُعرض بديلٌ مضلِّل', /ليست عائداً/.test(h) && !/\d+\.\d\d%/.test(h),
    (h.match(/\d+\.\d\d%/g) || []).join(' '));
}

// النافذة التعليمية
if (typeof ctx.showReturnsInfo === 'function') {
  let err = null;
  try { ctx.showReturnsInfo(); } catch (e) { err = e.constructor.name + ': ' + e.message; }
  t('نافذة الشرح تُفتح', err === null, err);
  t('الشرح يفسّر لماذا لا نقسم على التكلفة',
    modals.length === 1 && /يخلط الربح بالإيداع/.test(modals[0][1]));
}

// التبويب موصول فعلاً
{
  const html = fs.readFileSync(ROOT + 'performance.html', 'utf8');
  const src  = fs.readFileSync(ROOT + 'js/performance.js', 'utf8');
  t('زر التبويب موجود', /id="ptab-returns"/.test(html));
  t('حاوية التبويب موجودة', /id="pview-returns"/.test(html));
  t('التبويب في قائمة التبديل', /'monthly-chart','returns'/.test(src));
  t('الرسم يُستدعى عند فتحه', /tab === 'returns'\)\s*renderReturns\(\)/.test(src));
  // الرابط من لوحة التحكم يفتح التبويب فعلاً — رابطٌ يفتح غير المقصود يُقرأ عطلاً
  t('الصفحة تقرأ hash لفتح التبويب', /pview-' \+ _hash/.test(src));
  const dashJs   = fs.readFileSync(ROOT + 'js/dashboard.js', 'utf8');
  const dashHtml = fs.readFileSync(ROOT + 'dashboard.html', 'utf8');
  t('لوحة التحكم تشير إلى التبويب',
    /performance\.html#returns/.test(dashHtml) && /performance\.html#returns/.test(dashJs));
  t('بطاقة اللوحة لم تعد تُسمّى «عائداً»',
    !/إجمالي العائد منذ البداية/.test(dashHtml) && !/إجمالي العائد منذ البداية/.test(dashJs),
    'الاسم القديم باقٍ — رقمان لسؤال واحد');
  t('XIRR يستعمل التعريف الموحّد لتاريخ التوزيعة',
    /dividendFlowDate\(d, _now\)/.test(src));
}

console.log('\n' + ok + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
