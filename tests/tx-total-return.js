// ══════════════════════════════════════════════════════════════════════
// 📊 ملخص المعاملات — الصفقة تُصنَّف بإجمالي عائدها لا بفرق سعرها
// ----------------------------------------------------------------------
// بلاغ المالك 2026-09-15: «بعت 4348 الخبير وأنا كسبان ٧٠٠ بعد التوزيعات،
// والملخص فوق يسجّلها صفقة خاسرة». فرق السعر وحده يقيس نصف الصفقة؛
// التوزيعة نقدٌ قبضته من السهم نفسه ولا يُسترد — وم.2 تعرّف «التعادل
// الحقيقي» بخصمها من متوسط التكلفة.
//
// يُشغَّل على أرقام يُعرف جوابها سلفاً: بيعٌ بخسارة سعرية 200 مع 900
// توزيعات = **ربح 700**. وإن قال الكود «خاسرة» فهو خطأ مهما بدا سليماً.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;

let ok = 0, bad = 0;
const t = (n, cond, extra) => { cond === true ? ok++ : bad++;
  console.log((cond === true ? 'PASS ' : 'FAIL ') + n + (cond === true ? '' : '  ← ' + (extra || ''))); };
const near = (a, b, eps) => a != null && Math.abs(a - b) < (eps == null ? 0.005 : eps);

// ── سياق تشغيل ───────────────────────────────────────────────────────
const els = {};
const mkEl = () => ({ _html: '', value: '', style: {}, dataset: {}, className: '',
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
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
  alert() {}, confirm: () => true,
  supabase: { createClient: () => ({}) }, supabaseClient: null,
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);

let loadErr = null;
try {
  ['js/utils.js', 'js/transactions.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
} catch (e) { loadErr = e.constructor.name + ': ' + e.message; }
ctx.showToast = () => {};

t('صفحة المعاملات تُحمَّل بلا خطأ', loadErr === null, loadErr);
t('الملخص معرَّف', typeof ctx.renderTxStats === 'function');

// ── مشغّل: يزرع المعاملات والتوزيعات ثم يقرأ الملخص ──────────────────
function run(txs, divs, divsLoaded) {
  els['tx-stats'] = mkEl(); els['tx-stats-note'] = mkEl();
  vm.runInContext(
    'transactions = ' + JSON.stringify(txs) + ';\n' +
    'dividendsAll = ' + JSON.stringify(divs || []) + ';\n' +
    '_divsLoaded  = ' + (divsLoaded === false ? 'false' : 'true') + ';\n' +
    '_txTotalCount = transactions.length;\n' +
    'renderTxStats();', ctx, { filename: 'seed' });
  const html = els['tx-stats'].innerHTML;
  const num = re => { const m = html.match(re); return m ? parseFloat(m[1].replace(/,/g, '')) : null; };
  return {
    html,
    note:      els['tx-stats-note'].textContent,
    winCount:  num(/↑ (\d+)/),
    lossCount: num(/↓ (\d+)/),
    winAmt:    num(/tx-stat-sub text-success">\+([\d,.]+) ر\.س/),
    lossAmt:   num(/tx-stat-sub text-danger">−([\d,.]+) ر\.س/),
    divAmt:    num(/tx-stat-val text-success">([\d,.]+) ر\.س/),
  };
}

const buy  = (d, tk, sh, total) => ({ date: d, ticker: tk, type: 'buy',  shares: sh, total });
const sell = (d, tk, sh, total) => ({ date: d, ticker: tk, type: 'sell', shares: sh, total });
const dvd  = (d, tk, amount)    => ({ date: d, ticker: tk, amount });

// ══════════════════════════════════════════════════════════════════════
// 1) حالة المالك: 4348 الخبير — خسارة سعرية 200 وتوزيعات 900 ⇒ ربح 700
// ══════════════════════════════════════════════════════════════════════
{
  const r = run(
    [buy('2024-01-10', '4348', 100, 1200), sell('2025-06-10', '4348', 100, 1000)],
    [dvd('2024-07-01', '4348', 450), dvd('2025-01-05', '4348', 450)]);

  t('الصفقة رابحة بإجمالي العائد لا خاسرة بفرق السعر', r.winCount === 1 && r.lossCount === 0,
    'رابحة=' + r.winCount + ' خاسرة=' + r.lossCount);
  t('الربح 700 = −200 سعراً + 900 توزيعات', near(r.winAmt, 700), 'الربح = ' + r.winAmt);
  t('التوزيعات المُحتسبة معروضة صراحةً (900)', near(r.divAmt, 900), 'التوزيعات = ' + r.divAmt);
  t('سطر الإفصاح يذكر أنها خاسرة بفرق السعر وحده',
    /بفرق السعر وحده: ↑ 0 رابحة · ↓ 1 خاسرة/.test(r.note), r.note);
}

// ══════════════════════════════════════════════════════════════════════
// 2) توزيعة تُصرف **بعد** البيع — مركزٌ أُغلق، فهي من حقّ أسهمه المُباعة
// ══════════════════════════════════════════════════════════════════════
{
  const r = run(
    [buy('2024-01-10', '4348', 100, 1200), sell('2025-06-10', '4348', 100, 1000)],
    [dvd('2025-07-20', '4348', 900)]);
  t('توزيعة بعد البيع لا تسقط من حساب الصفقة', r.winCount === 1 && near(r.winAmt, 700),
    'رابحة=' + r.winCount + ' ربح=' + r.winAmt);
}

// ══════════════════════════════════════════════════════════════════════
// 3) بيع جزئي: التوزيعة تُقسَم بنسبة المُباع لا تُمنح كاملة
// ══════════════════════════════════════════════════════════════════════
{
  const r = run(
    [buy('2024-01-10', 'AAA', 100, 1000), sell('2025-06-10', 'AAA', 50, 400)],
    [dvd('2024-07-01', 'AAA', 100)]);
  // تكلفة المُباع 500 · العائد 400 ⇒ −100 · حصة التوزيعات 50 ⇒ صافي −50
  t('البيع الجزئي يأخذ نصف التوزيعة فقط', near(r.divAmt, 50), 'المنسوب = ' + r.divAmt);
  t('صافي الجزئي −50 (خاسرة رغم التوزيعة)', r.lossCount === 1 && near(r.lossAmt, 50),
    'خاسرة=' + r.lossCount + ' مبلغ=' + r.lossAmt);
}

// ══════════════════════════════════════════════════════════════════════
// 4) توزيعات سهمٍ لم يُبَع لا تدخل الملخص — الملخص عن الصفقات المنفَّذة
// ══════════════════════════════════════════════════════════════════════
{
  const r = run([buy('2024-01-10', 'BBB', 100, 1000)], [dvd('2024-07-01', 'BBB', 300)]);
  t('توزيعات مركز مفتوح لا تُحسب ربحاً محقَّقاً', r.divAmt === null,
    'ظهرت بطاقة توزيعات بقيمة ' + r.divAmt);
  t('سطر الإفصاح يقولها صراحةً', /لا توزيعات مستلمة عن أسهم بِعتَها/.test(r.note), r.note);
}

// ══════════════════════════════════════════════════════════════════════
// 5) توزيعة **مستقبلية** لا تُقدَّر (م.20) — dividendFlowDate تُسقطها
// ══════════════════════════════════════════════════════════════════════
{
  const future = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const r = run(
    [buy('2024-01-10', 'CCC', 100, 1200), sell('2025-06-10', 'CCC', 100, 1000)],
    [dvd(future, 'CCC', 900)]);
  t('توزيعة لم تُقبض بعد لا تقلب الصفقة رابحة', r.lossCount === 1 && near(r.lossAmt, 200),
    'خاسرة=' + r.lossCount + ' مبلغ=' + r.lossAmt);
}

// ══════════════════════════════════════════════════════════════════════
// 6) فشل تحميل التوزيعات يُعلَن ولا يُقدَّر صفراً (م.21)
// ══════════════════════════════════════════════════════════════════════
{
  const r = run(
    [buy('2024-01-10', '4348', 100, 1200), sell('2025-06-10', '4348', 100, 1000)],
    [], false);
  t('الغياب مُعلَن لا مُقدَّر', /تعذّر تحميل سجل التوزيعات/.test(r.note), r.note);
}

// ══════════════════════════════════════════════════════════════════════
// 7) البيع الزائد يبقى مقصوصاً — التوزيعات لا تفتح باباً لربحٍ وهمي
// ══════════════════════════════════════════════════════════════════════
{
  const r = run(
    [buy('2024-01-10', 'DDD', 100, 1000), sell('2025-06-10', 'DDD', 150, 1500)],
    []);
  // يُملَك 100 فقط ⇒ العائد يُقَصّ إلى 1000 والتكلفة 1000 ⇒ صفر
  t('بيع 150 من 100 مملوكة ⇒ ربح صفر لا 500', r.winCount === 1 && near(r.winAmt, 0),
    'رابحة=' + r.winCount + ' ربح=' + r.winAmt);
}

console.log('\n' + ok + ' ناجح · ' + bad + ' فاشل');
process.exit(bad ? 1 : 0);
