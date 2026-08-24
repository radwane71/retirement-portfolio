// ══════════════════════════════════════════════════════════════════════
// مقسّم الراتب — المخطَّط لا يدخل حساباً، وسجلّ التغييرات، وصيغة الاستيراد
// ----------------------------------------------------------------------
// قرار المالك صريح: «المخطَّط له ما يدخل في الحسابات… لا في الداشبورد ولا
// في الحسبة اللي فوق ولا في الثروة». وهذا فحصٌ **يُشغّل** الصفحة ويقرأ ما
// يخرج منها — لا يطابق نصّاً.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;

let ok = 0, bad = 0;
const t = (n, cond, extra) => { cond === true ? ok++ : bad++;
  console.log((cond === true ? 'PASS ' : 'FAIL ') + n + (cond === true ? '' : '  ← ' + (extra || ''))); };
const near = (a, b, eps) => a != null && Math.abs(a - b) < (eps == null ? 1e-6 : eps);

// ── سياق تشغيل ───────────────────────────────────────────────────────
const els = {};
const mkEl = () => ({ _html: '', value: '', style: {}, dataset: {}, checked: false,
  classList: { add() {}, remove() {}, contains: () => false },
  get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
  textContent: '', setAttribute() {}, getAttribute: () => null,
  appendChild(c) { return c; }, addEventListener() {}, focus() {}, remove() {},
  scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [],
  getContext: () => ({ canvas: {}, createLinearGradient: () => ({ addColorStop() {} }) }) });
const byId = (id) => (els[id] = els[id] || mkEl());

// `querySelectorAll('.alloc-input')` و`.plan-alloc` تُغذّى من مصفوفة نزرعها
let _qsaMap = {};
const toasts = [], modals = [];
const ctx = {
  console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
  Math, Object, Array, Number, String, Boolean, Date, JSON, Set, Map, WeakMap,
  Promise, RegExp, Error, Intl, isFinite, isNaN, parseInt, parseFloat,
  encodeURIComponent, decodeURIComponent,
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  requestAnimationFrame: () => 0,
  document: { readyState: 'complete', body: mkEl(), documentElement: mkEl(),
    getElementById: byId, querySelector: () => null,
    querySelectorAll: (sel) => _qsaMap[sel] || [],
    createElement: mkEl, addEventListener() {}, createTextNode: () => ({}) },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { href: 'http://x/', pathname: '/', search: '', hash: '' },
  navigator: { userAgent: 'node' }, matchMedia: () => ({ matches: false, addEventListener() {} }),
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  alert() {}, confirm: () => true, getComputedStyle: () => ({ getPropertyValue: () => '' }),
  Chart: function () { return { destroy() {}, update() {} }; },
  supabase: { createClient: () => ({}) }, supabaseClient: null,
  loadUserSetting: () => Promise.resolve(null), saveUserSetting: () => Promise.resolve(true),
  requireAuth: () => Promise.resolve(null),
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);

let loadErr = null;
try {
  ['js/utils.js', 'js/constitution.js', 'js/salary.js']
    .forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
} catch (e) { loadErr = e.constructor.name + ': ' + e.message; }
ctx.showToast = (m, ty) => toasts.push([m, ty]);
ctx.openInfoModal = (ti, b) => modals.push([ti, b]);

// `store` معرَّفة بـ`let` في نطاق الوحدة فلا تظهر على السياق — نجسر إليها.
// (نفس درس `engineCfg` في tests/tadawul.js: الإسناد من خارج vm يُنشئ متغيّراً
//  موازياً والسكربت يقرأ الأصلي.)
vm.runInContext('this.__store = () => store;', ctx);
const S_ = () => ctx.__store();

t('الصفحة تُحمَّل بلا خطأ', loadErr === null, loadErr);
['isPlanned', 'getFiltered', 'getFilteredAll', 'logChange', 'toggleStatus',
 'openChangeLog', 'openPlanBulk', 'executePlanBulk', 'showImportFormat']
  .forEach(fn => t(`${fn} معرَّفة`, typeof ctx[fn] === 'function'));

// ── بيانات مزروعة: منفَّذان ومخطَّطان ────────────────────────────────
const seed = () => vm.runInContext(`
  store = {
    categories: [
      { id:'c1', name:'مصاريف',      type:'expense' },
      { id:'c2', name:'ادخار',        type:'saving'  },
      { id:'c3', name:'أصول',         type:'asset'   },
      { id:'c4', name:'محفظة تقاعد',  type:'asset'   },
    ],
    entries: [
      { id:'e1', year:2026, month:1, salary:20000, notes:'', status:'actual',
        allocations:[{catId:'c1',amount:12000},{catId:'c2',amount:3000},
                     {catId:'c3',amount:2000},{catId:'c4',amount:3000}] },
      { id:'e2', year:2026, month:2, salary:20000, notes:'', status:'actual',
        allocations:[{catId:'c1',amount:12000},{catId:'c2',amount:3000},
                     {catId:'c3',amount:2000},{catId:'c4',amount:3000}] },
      { id:'e3', year:2030, month:1, salary:99999, notes:'مستقبلي', status:'planned',
        allocations:[{catId:'c1',amount:50000},{catId:'c4',amount:49999}] },
      { id:'e4', year:2031, month:1, salary:88888, notes:'', status:'planned', allocations:[] },
      // ⚠️ سجلّ قديم **بلا حقل status** — يجب أن يُقرأ منفّذاً
      { id:'e5', year:2025, month:12, salary:18000, notes:'', allocations:[{catId:'c2',amount:5000}] },
    ],
    audit: [],
  };
`, ctx);
seed();
// المدى: من 2025 إلى 2031 حتى يشمل الكل
byId('from-year').value = '2025'; byId('from-month').value = '1';
byId('to-year').value   = '2031'; byId('to-month').value   = '12';

// ══════════════════════════════════════════════════════════════════════
// ① الفصل — البوابة الواحدة
// ══════════════════════════════════════════════════════════════════════
{
  const all = ctx.getFilteredAll(), act = ctx.getFiltered();
  t('الجدول يرى الخمسة', all.length === 5, String(all.length));
  t('والحسابات ترى المنفَّذ وحده', act.length === 3, String(act.length));
  t('السجلّ القديم بلا حقل status يُقرأ منفَّذاً',
    act.some(e => e.id === 'e5'), 'الغياب = منفَّذ — لا ترحيل لازم');
  t('المخطَّط خارج المجاميع',
    !act.some(e => e.id === 'e3') && !act.some(e => e.id === 'e4'));

  // الرقم نفسه: 20,000 + 20,000 + 18,000 = 58,000 — لا 246,887
  const sum = act.reduce((s, e) => s + e.salary, 0);
  t('إجمالي الدخل يستبعد 188,887 المخطَّطة', sum === 58000, String(sum));
}

// ══════════════════════════════════════════════════════════════════════
// ② الإحصائيات المحسوبة فعلياً
// ══════════════════════════════════════════════════════════════════════
if (typeof ctx.computeStats === 'function') {
  const S = ctx.computeStats();
  t('computeStats على المنفَّذ وحده', near(S.totalSalary, 58000, 0.01), String(S.totalSalary));
  t('ومعدّل الادخار من المنفَّذ',
    S.investRate != null && S.investRate > 0 && S.investRate < 100,
    String(S.investRate));
} else {
  const src = fs.readFileSync(ROOT + 'js/salary.js', 'utf8');
  t('كل حساب يمرّ بـ getFiltered', /function getFiltered\(\) \{\n  return getFilteredAll\(\)\.filter\(e => !isPlanned\(e\)\);/.test(src));
}

// ══════════════════════════════════════════════════════════════════════
// ③ سجلّ التغييرات — الفرق لا اللقطة
// ══════════════════════════════════════════════════════════════════════
{
  vm.runInContext("store.audit = [];", ctx);
  const e = S_().entries.find(x => x.id === 'e1');
  const before = ctx._auditSnapshot(e);
  e.salary = 22000;
  e.allocations = [{ catId: 'c1', amount: 12000 }, { catId: 'c2', amount: 5000 },
                   { catId: 'c3', amount: 2000 }, { catId: 'c4', amount: 3000 }];
  ctx.logChange('edit', e, before);

  const log = S_().audit;
  t('التعديل سُجِّل', log.length === 1, String(log.length));
  const chg = log[0].changes || [];
  t('ويسجّل الفرق لا اللقطة', chg.length === 2, JSON.stringify(chg));
  t('الراتب مذكور بقيمتيه',
    chg.some(c => c.field === 'الراتب' && /20,000/.test(c.from) && /22,000/.test(c.to)),
    JSON.stringify(chg));
  t('والفئة باسمها لا بمعرّفها',
    chg.some(c => c.field === 'ادخار' && /3,000/.test(c.from) && /5,000/.test(c.to)),
    JSON.stringify(chg));
  t('ومعه ختم زمني', typeof log[0].at === 'string' && !isNaN(new Date(log[0].at)));

  // تعديل لا يغيّر شيئاً لا يُسجَّل — سجلٌّ مليء بلا شيء يُخفي ما فيه شيء
  const b2 = ctx._auditSnapshot(e);
  ctx.logChange('edit', e, b2);
  t('تعديلٌ بلا تغيير لا يُسجَّل', S_().audit.length === 1, String(S_().audit.length));

  // الحذف يحفظ لقطة — لأن المحذوف لا يبقى له مرجع
  ctx.logChange('delete', e, ctx._auditSnapshot(e));
  const del = S_().audit[S_().audit.length - 1];
  t('الحذف يحفظ لقطة', del.action === 'delete' && del.snapshot
    && del.snapshot.salary === 22000, JSON.stringify(del.snapshot));

  // التحويل بضغطة يُسجَّل كتعديل
  vm.runInContext("store.audit = [];", ctx);
  ctx.toggleStatus('e2');
  t('التحويل يُسجَّل', S_().audit.length === 1);
  t('وبتغيير النوع صراحةً',
    (S_().audit[0].changes || []).some(c => c.field === 'نوع الشهر'
      && c.from === 'منفَّذ فعلي' && c.to === 'مخطَّط له'),
    JSON.stringify(S_().audit[0].changes));
  t('والشهر خرج من الحسابات فوراً', !ctx.getFiltered().some(e2 => e2.id === 'e2'));
  ctx.toggleStatus('e2');   // أعِده
  t('وعاد إليها بالتحويل العكسي', ctx.getFiltered().some(e2 => e2.id === 'e2'));

  // عرض السجل
  modals.length = 0;
  ctx.openChangeLog('e2');
  t('سجلّ الشهر يُعرض', modals.length === 1 && /سجلّ/.test(modals[0][0]), JSON.stringify(modals[0] && modals[0][0]));
  t('وفيه نصّ التغيير', /نوع الشهر/.test(modals[0][1]));
  modals.length = 0;
  ctx.openChangeLog(null);
  t('والسجلّ الكامل يُعرض', modals.length === 1 && /كل التغييرات/.test(modals[0][0]));
}

// ══════════════════════════════════════════════════════════════════════
// ④ تخطيط الدفعة
// ══════════════════════════════════════════════════════════════════════
{
  seed();
  const set = (id, v) => { byId(id).value = String(v); };
  set('plan-from-year', 2040); set('plan-from-month', 1);
  set('plan-to-year',   2040); set('plan-to-month',   12);
  set('plan-salary', 30000);
  _qsaMap['.plan-alloc'] = [
    { dataset: { cat: 'c1' }, value: '18000' },
    { dataset: { cat: 'c4' }, value: '12000' },
  ];
  const n0 = S_().entries.length;
  toasts.length = 0;
  let err = null;
  try { ctx.executePlanBulk(); } catch (e) { err = e.constructor.name + ': ' + e.message; }
  t('الدفعة تُنفَّذ بلا خطأ', err === null, err);
  t('أُضيف اثنا عشر شهراً', S_().entries.length === n0 + 12,
    String(S_().entries.length - n0));
  const added = S_().entries.filter(e => e.year === 2040);
  t('كلها مخطَّطة', added.length === 12 && added.every(e => ctx.isPlanned(e)));
  t('وبتوزيعها', added[0].allocations.length === 2
    && added[0].allocations.reduce((s, a) => s + a.amount, 0) === 30000);
  t('وكلها في سجلّ التغييرات', S_().audit.filter(x => x.action === 'add').length === 12,
    String(S_().audit.filter(x => x.action === 'add').length));
  t('والإشعار يقول إنها لا تدخل الحسابات',
    toasts.some(x => /لا تدخل الحسابات/.test(x[0])), JSON.stringify(toasts));

  // لا تدهس شهراً موجوداً
  set('plan-from-year', 2026); set('plan-from-month', 1);
  set('plan-to-year',   2026); set('plan-to-month',   3);
  toasts.length = 0;
  const salBefore = S_().entries.find(e => e.year === 2026 && e.month === 1).salary;
  ctx.executePlanBulk();
  t('الشهر الموجود لا يُدهَس',
    S_().entries.find(e => e.year === 2026 && e.month === 1).salary === salBefore,
    'دُهس راتب يناير 2026');
  t('ويُعلَن عدد المتخطَّى', toasts.some(x => /تُخطّي 2/.test(x[0])), JSON.stringify(toasts));

  // نطاق مقلوب
  set('plan-from-year', 2045); set('plan-to-year', 2040);
  const n1 = S_().entries.length;
  toasts.length = 0;
  ctx.executePlanBulk();
  t('النطاق المقلوب يُرفض', S_().entries.length === n1
    && toasts.some(x => x[1] === 'error'), JSON.stringify(toasts));
}

// ══════════════════════════════════════════════════════════════════════
// ⑤ الاستيراد والتصدير — دورة كاملة
// ══════════════════════════════════════════════════════════════════════
{
  seed();
  const src = fs.readFileSync(ROOT + 'js/salary.js', 'utf8');
  t('التصدير يشمل عمود النوع', /'الملاحظات'|'ملاحظات', 'النوع'/.test(src)
    || /'ملاحظات', 'النوع'\]/.test(src));
  t('والتصدير يشمل المخطَّط', /const entries = getFilteredAll\(\)/.test(src),
    'إسقاطه يجعل دورة تصدير←استيراد تمحو تخطيطك');
  t('الاستيراد يقرأ عمود النوع', /const colStatus    = header\.findIndex/.test(src));
  t('والفراغ يُقرأ منفَّذاً', /planned\/i\.test\(_rawSt\) \? 'planned' : 'actual'/.test(src));

  // استيراد فعلي
  const csv = [
    'السنة,الشهر,الراتب,مصاريف,ادخار,أصول,محفظة تقاعد,المتبقي,ملاحظات,النوع',
    '2027,يناير,25000,15000,4000,3000,3000,0,"راتب جديد",منفذ',
    '2035,مارس,40000,20000,8000,6000,6000,0,"",مخطط',
    '2036,4,45000,22000,9000,7000,7000,0,"",planned',
  ].join('\n');
  toasts.length = 0;
  let err2 = null;
  try { ctx.parseAndImportCSV(csv); } catch (e) { err2 = e.constructor.name + ': ' + e.message; }
  t('الاستيراد يعمل بلا خطأ', err2 === null, err2);
  const im = (y, m) => S_().entries.find(e => +e.year === y && +e.month === m);
  t('الصفّ المنفَّذ دخل منفَّذاً', im(2027, 1) && !ctx.isPlanned(im(2027, 1)));
  t('و«مخطط» العربية تُقرأ', im(2035, 3) && ctx.isPlanned(im(2035, 3)));
  t('و«planned» الإنجليزية كذلك', im(2036, 4) && ctx.isPlanned(im(2036, 4)));
  t('والشهر بالرقم يُقرأ', im(2036, 4) != null, 'الشهر "4" لم يُفهَم');
  t('والإشعار يذكر عدد المخطَّط', toasts.some(x => /منها 2 مخطَّط/.test(x[0])),
    JSON.stringify(toasts));
  t('والمستورَد يدخل سجلّ التغييرات',
    S_().audit.filter(x => x.action === 'add').length === 3,
    String(S_().audit.filter(x => x.action === 'add').length));
  // والمخطَّط المستورَد خارج الحسابات
  byId('to-year').value = '2036';
  t('والمستورَد المخطَّط خارج الحسابات',
    !ctx.getFiltered().some(e => +e.year === 2035 || +e.year === 2036));
}

// ══════════════════════════════════════════════════════════════════════
// ⑥ شرح صيغة الاستيراد — مكتوب لا مستنبَط
// ══════════════════════════════════════════════════════════════════════
{
  modals.length = 0;
  let err = null;
  try { ctx.showImportFormat(); } catch (e) { err = e.constructor.name + ': ' + e.message; }
  t('نافذة الصيغة تُفتح', err === null, err);
  const b = modals[0] ? modals[0][1] : '';
  t('تذكر الأعمدة الإلزامية الثلاثة',
    /السنة/.test(b) && /الشهر/.test(b) && /الراتب/.test(b) && /الإلزامية/.test(b));
  t('وتشرح مرونة الترويسة', /أينما كان/.test(b));
  t('وتشرح عمود النوع', /مخطط/.test(b) && /planned/.test(b));
  t('وتقول إن الموجود لا يُستبدَل', /لا يستبدل شهراً موجوداً/.test(b));
  t('وفيها مثال بصفّين', (b.match(/<tr>/g) || []).length >= 3);
}

// ══════════════════════════════════════════════════════════════════════
// ⑦ التقرير في الإعدادات يستبعد المخطَّط كذلك
// ══════════════════════════════════════════════════════════════════════
{
  const set = fs.readFileSync(ROOT + 'js/settings.js', 'utf8');
  t('تقرير الإعدادات يستبعد المخطَّط',
    /status\) !== 'planned'/.test(set),
    'التقرير يقرأ نفس المخزن — وإسقاط الفلترة يُدخل المستقبل في «إجمالي الدخل المسجّل»');
}

console.log('\n' + ok + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
