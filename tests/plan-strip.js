// ═══════════════════════════════════════════════════════════════════════
// شريط الخطة المحفوظة في لوحة التحكم
// ───────────────────────────────────────────────────────────────────────
// الفخّ هنا أن يُقاس التقدّم بنسبة اليوم من هدف 2045: التركيب يفعل معظم
// العمل في السنوات الأخيرة، فالرقم يبدو متأخّراً دائماً وهو في موعده.
// القياس الصحيح مقابل ما توقّعته الخطة **لهذه السنة** من مسارها المحفوظ.
// ═══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.log('  ✗ ' + name)); };

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const src = fs.readFileSync(path.join(ROOT, 'js', 'dashboard.js'), 'utf8').split(CR + LF).join(LF);

function grab(sig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('لم أجد: ' + sig);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('قوس غير متوازن: ' + sig);
}

const el = { innerHTML: '', style: {} };
const ctx = vm.createContext({
  Object, Array, Math, JSON, String, Number, Date, Set, Promise,
  isFinite, isNaN, parseFloat, parseInt, console,
  document: { getElementById: id => (id === 'plan-goal-strip' ? el : null) },
  esc: v => String(v == null ? '' : v),
  formatSAR: n => Math.round(+n).toLocaleString('en-US') + ' ر.س',
  loadUserSetting: async () => ctx.__rows,
  holdings: [], portfolioCash: 0,
});
ctx.window = ctx; ctx.globalThis = ctx;
vm.runInContext(grab('async function loadDashPlan(') + LF + grab('function renderPlanGoalStrip('), ctx);
vm.runInContext("const DASH_PLANS_KEY = 'forecast_plans_v1'; var _dashPlan = null;", ctx);

const THIS_YEAR = new Date().getFullYear();

// خطة: هدف 6,000 ر.س شهرياً بعد 19 سنة، ضخ مطلوب 8,000، ومسارٌ سنوي
function plan(over) {
  const base = over.baseYear != null ? over.baseYear : THIS_YEAR - 2;
  const p = {
    id: 1, createdISO: new Date(base, 0, 1).toISOString(), date: '01/01/' + base,
    baseYear: base, notes: 'خطة التقاعد',
    inp: { goalType: 'monthly_income', goalAmount: 6000, horizonYears: 19 },
    requiredPMT: 8000, alreadyReached: false, impossible: false,
    path: [0, 1, 2, 3].map(y => ({ year: y, value: 200000 + y * 100000 })),
  };
  return Object.assign(p, over);
}

function render(p, have) {
  ctx.__p = p;
  vm.runInContext('_dashPlan = __p;', ctx);
  ctx.holdings = have == null ? [] : [{ shares: 1, current_price: have }];
  ctx.portfolioCash = 0;
  el.innerHTML = ''; el.style = {};
  vm.runInContext('renderPlanGoalStrip()', ctx);
  return el.innerHTML;
}

// ── ① الهدف والتاريخ يظهران ──
let h = render(plan({}), 400000);
t('يعرض اسم الخطة',        /خطة التقاعد/.test(h));
t('يعرض الهدف 6,000',      /6,000/.test(h));
t('ويقول «شهرياً» لهدف الدخل', /شهرياً/.test(h));
t('يعرض سنة الهدف',        new RegExp(String(THIS_YEAR - 2 + 19)).test(h));
t('يعرض السنوات المتبقية', /سنة\)/.test(h));
t('يعرض الضخ المطلوب',     /8,000/.test(h));
t('وفيه رابط للرؤية المستقبلية', /forecast\.html/.test(h));

// ── ② التقدّم يُقاس بمسار الخطة لهذه السنة لا بالهدف البعيد ──
// السنة المنقضية = 2 ⇒ الخطة توقّعت 400,000
h = render(plan({}), 400000);
t('مطابقة توقّع هذه السنة ⇒ في موعدها', /في موعدها/.test(h) && /🟢/.test(h));
t('ولا يُقاس بنسبة الهدف البعيد', !/18%|٪ من الهدف/.test(h));

h = render(plan({}), 380000);         // 95% من المتوقَّع
t('نقصٌ 5% ⇒ تنبيه أصفر', /🟡/.test(h) && /متأخّرة/.test(h));

h = render(plan({}), 300000);         // 75%
t('نقصٌ كبير ⇒ أحمر', /🔴/.test(h) && /متأخّرة\s*25%/.test(h));

h = render(plan({}), 900000);         // فوق المتوقَّع
t('التقدّم فوق الخطة ⇒ في موعدها لا «متقدّمة» كاذبة', /في موعدها/.test(h));

// ── ③ السنة خارج المسار: لا تُخترَع مقارنة ──
h = render(plan({ baseYear: THIS_YEAR - 9 }), 400000);   // المسار يغطّي 0..3 فقط
t('سنة خارج المسار ⇒ لا مقارنة', /لا مقارنة لهذه السنة/.test(h));
t('ولا رمز حالة كاذب', !/🟢|🟡|🔴/.test(h));

// ── ④ بلا حيازات: لا يُقارَن الصفر بالخطة ──
h = render(plan({}), null);
t('بلا حيازات لا تظهر مقارنة', !/🟢|🟡|🔴/.test(h));
t('والهدف يبقى ظاهراً', /6,000/.test(h));

// ── ⑤ هدف مبلغ لا دخل ──
h = render(plan({ inp: { goalType: 'amount', goalAmount: 1310000, horizonYears: 19 } }), 400000);
t('هدف المبلغ بلا كلمة «شهرياً»', /1,310,000/.test(h) && !/1,310,000<\/strong> شهرياً/.test(h));

// ── ⑥ حالات الضخ الخاصة ──
t('«لا حاجة لضخ» حين بُلغ الهدف',
  /لا حاجة لضخ/.test(render(plan({ alreadyReached: true }), 400000)));
t('«—» حين تعذّرت الخطة',
  /<strong>—<\/strong>/.test(render(plan({ impossible: true, requiredPMT: null }), 400000)));

// ── ⑦ بلا خطة: الشريط يختفي ولا يترك فراغاً ──
ctx.__p = null;
vm.runInContext('_dashPlan = null;', ctx);
el.innerHTML = 'قديم'; el.style = {};
vm.runInContext('renderPlanGoalStrip()', ctx);
t('بلا خطة يُخفى الشريط', el.style.display === 'none');

// ── ⑧ اختيار الخطة: الأحدث بالتاريخ لا بالموضع ──
(async () => {
  ctx.__rows = [
    { id: 1, createdISO: '2024-01-01T00:00:00.000Z', notes: 'قديمة' },
    { id: 2, createdISO: '2026-05-01T00:00:00.000Z', notes: 'الأحدث' },
    { id: 3, createdISO: '2025-01-01T00:00:00.000Z', notes: 'وسط' },
  ];
  const got = await vm.runInContext('loadDashPlan()', ctx);
  t('يختار الأحدث بالتاريخ لا بالموضع', got && got.notes === 'الأحدث');

  ctx.__rows = [];
  t('سجلّ فارغ ⇒ null', (await vm.runInContext('loadDashPlan()', ctx)) === null);
  ctx.__rows = null;
  t('لا سجلّ ⇒ null', (await vm.runInContext('loadDashPlan()', ctx)) === null);

  // ── ⑨ الوصل بالصفحة ──
  const dh = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  t('الحاوية في النظرة العامة', /id="plan-goal-strip"/.test(dh));
  t('ومخفيّة ابتداءً',          /id="plan-goal-strip"[^>]*display:none/.test(dh));
  t('تُرسم مع بقية البطاقات',    /renderAllCards\(\) \{[\s\S]{0,80}renderPlanGoalStrip\(\);/.test(src));
  t('وتُحمَّل عند الإقلاع',       /initPlanGoalStrip\(\);/.test(src));
  t('ولا توقف اللوحة على قراءتها', !/await initPlanGoalStrip\(\)/.test(src));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
