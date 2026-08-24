// ═══════════════════════════════════════════════════════════════════════
// ترتيب سجل التقييمات — «أول ظهور للرمز» يجب أن يكون آخر تقييم
// ───────────────────────────────────────────────────────────────────────
// أربع صفحات تبني قراراتها على هذه القاعدة: المهام والأهداف ومحرّك القرار
// والحاسبة. وحين استُورد السجل التاريخي (105 عمليات معرّفاتها أقدم) انقلب
// المعنى: صار تقييم 2017 هو «الأحدث» لكل الأسهم الاثنين والعشرين، فتُتّخذ
// قرارات وزنٍ وسيولةٍ على رقم عمره تسع سنوات — بلا تحذير على الشاشة.
//
// هذا الملف يُنفّذ الحارس على السجل الحقيقي، ولا يكتفي بمطابقة نصوص.
// ═══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { VAL_IMPORT: V } = require(path.join(ROOT, 'js', 'valuation-import.js'));

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.log('  ✗ ' + name)); };

// ── تحميل utils.js في سياق مُصغَّر ──
const mkEl = () => ({ style: {}, dataset: {}, value: '', innerHTML: '', textContent: '',
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  appendChild(c) { return c; }, setAttribute() {}, getAttribute: () => null,
  addEventListener() {}, removeEventListener() {}, remove() {}, closest: () => null,
  querySelector: () => null, querySelectorAll: () => [], insertAdjacentHTML() {} });
const ctx = vm.createContext({
  Date, Number, String, Array, Object, Math, JSON, RegExp, Error, Intl,
  isFinite, isNaN, parseFloat, parseInt, console,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  document: { readyState: 'complete', getElementById: () => mkEl(), querySelector: () => mkEl(),
    querySelectorAll: () => [], createElement: () => mkEl(),
    body: mkEl(), documentElement: mkEl(), addEventListener() {}, head: mkEl() },
  setTimeout: () => 0, clearTimeout() {},
});
ctx.window = ctx; ctx.globalThis = ctx;
try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8'), ctx); }
catch (e) { console.log('  ✗ تعذّر تحميل utils.js: ' + e.message); }

const call = (fn, ...a) => { ctx.__a = a; return vm.runInContext(fn + '(...__a)', ctx); };

// ── 1) الطابع الزمني يُقرأ من نصّ التاريخ ──
const stampOf = d => call('valEntryStamp', { date: d, id: 1700000000000 });
const yearIn  = d => { const s = stampOf(d); return s ? new Date(s).getFullYear() : null; };

t('يقرأ 2017 من التاريخ العربي-الهندي', yearIn('٣١‏/١٢‏/٢٠١٧، ١٢:٠٠:٠٠ ص') === 2017);
t('يقرأ 2021',                          yearIn('٣١‏/١٢‏/٢٠٢١، ١٢:٠٠:٠٠ ص') === 2021);
t('يقرأ 2025',                          yearIn('٣١‏/١٢‏/٢٠٢٥، ١٢:٠٠:٠٠ ص') === 2025);
t('يقرأ شهراً بخانة واحدة',              yearIn('٢٢‏/٨‏/٢٠٢٦، ١:٣٢:٠٠ م') === 2026);
t('يتجاهل لاحقة (معدَّل)',                yearIn('٢٨‏/٦‏/٢٠٢٦، ١٠:١٩:٢٤ م (معدَّل)') === 2026);
t('لا يخلط 2017 بالمعرّف المصطنع',
  Math.abs(stampOf('٣١‏/١٢‏/٢٠١٧، ١٢:٠٠:٠٠ ص') - 1700000000000) > 5 * 365 * 864e5);
t('يرتدّ إلى المعرّف عند تعذّر التحليل',
  call('valEntryStamp', { date: 'نصٌّ لا يُحلَّل', id: 1787401920939 }) === 1787401920939);
t('لا تاريخ ولا معرّف ⇒ null',           call('valEntryStamp', {}) === null);
t('يرفض سنة قبل 2000',                   call('valEntryStamp', { date: '٣١‏/١٢‏/١٩٩٥' }) === null);

// كل تواريخ السجل الحقيقي تُحلَّل — وإلا ارتدّ الترتيب إلى معرّف مصطنع
const unparsed = V.filter(e => {
  const s = call('valEntryStamp', { date: e.date, id: 0 });
  return s == null;
});
t('141 تاريخاً كلها تُحلَّل: ' + unparsed.length, unparsed.length === 0);

// ── 2) الفرز: الأحدث أولاً ──
const AR = '٠١٢٣٤٥٦٧٨٩';
const yearOf = e => {
  const m = String(e.date).replace(/[٠-٩]/g, d => AR.indexOf(d)).match(/(\d{4})/);
  return m ? +m[1] : 0;
};

// نبدأ من أسوأ ترتيب ممكن — تصاعدي بالمعرّف، وهو ما كان الاستيراد يحفظه
const worst = V.slice().sort((a, b) => a.id - b.id);
t('الترتيب المبدئي مقلوب فعلاً (وإلا فالاختبار لا يقيس شيئاً)',
  yearOf(worst[0]) < yearOf(worst[worst.length - 1]));

const sorted = call('valHistNewestFirst', worst);
t('الفرز لا يفقد ولا يكرّر صفاً', sorted.length === V.length
  && new Set(sorted.map(e => e.id)).size === V.length);

const firstSeen = {}, newestYear = {};
sorted.forEach(e => {
  const tk = e.inputs.ticker;
  if (!firstSeen[tk]) firstSeen[tk] = e;
  newestYear[tk] = Math.max(newestYear[tk] || 0, yearOf(e));
});
const wrong = Object.keys(firstSeen).filter(tk => yearOf(firstSeen[tk]) !== newestYear[tk]);
t('أول ظهور لكل رمز = أحدث سنة: ' + wrong.join(','), wrong.length === 0);
t('غطّى الاثنين والعشرين رمزاً', Object.keys(firstSeen).length === 22);

// الصف بلا تاريخ يُدفَع إلى الذيل ولا يصير «آخر تقييم» لسهمه
const withOrphan = [{ id: null, date: '', inputs: { ticker: '1010' }, results: {} }].concat(worst);
const s2 = call('valHistNewestFirst', withOrphan);
t('الصف بلا تاريخ لا يتصدّر', s2[0].date !== '');
const first1010 = s2.find(e => e.inputs.ticker === '1010');
t('ولا يصير آخر تقييم لسهمه', yearOf(first1010) === newestYear['1010']);

// الترتيب مستقرّ: إعادة الفرز لا تغيّر شيئاً
const s3 = call('valHistNewestFirst', sorted);
t('الفرز مستقرّ', s3.every((e, i) => e.id === sorted[i].id));

// ── 3) المستهلكون يفرزون فعلاً، ولا يثقون بترتيبة التخزين ──
const readers = [
  ['js/tasks.js',           'valHistNewestFirst(rows)'],
  ['js/decision-engine.js', 'valHistNewestFirst(rVal)'],
  ['js/targets.js',         'valHistNewestFirst(hist)'],
];
readers.forEach(([f, needle]) => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  t(f + ' يفرز عند القراءة', src.includes(needle));
});

// والعمر يُشتقّ من التاريخ لا من المعرّف المصطنع
const tasksSrc   = fs.readFileSync(path.join(ROOT, 'js', 'tasks.js'), 'utf8');
const targetsSrc = fs.readFileSync(path.join(ROOT, 'js', 'targets.js'), 'utf8');
const engineSrc  = fs.readFileSync(path.join(ROOT, 'js', 'decision-engine.js'), 'utf8');
t('tasks: ts من التاريخ',   /ts:\s*valEntryStamp\(entry\)/.test(tasksSrc));
t('targets: ts من التاريخ', /ts:\s*valEntryStamp\(e\)/.test(targetsSrc));
t('engine: التاريخ يعلو على المعرّف',
  /ts: parseValEntryDate\(entry\.date\) \|\|/.test(engineSrc));

// وبوابة القِدَم صارت في المسارين لا في مسار واحد
t('targets: بوابة القِدَم في tgPriorityOf أيضاً',
  /const band = \(fv > 0 && price > 0 && !_vStale\)/.test(targetsSrc));

// ── 4) م.37 عبر السلسلة كاملةً لا آخر نقطتين ──
t('المحرّك يمسح كل الانتقالات', /stabilizationSeries/.test(engineSrc));
t('ويتخطّى السلاسل القصيرة', /if \(rows\.length < 3\) return;/.test(engineSrc));
t('ويُعرض للمالك', /م\.37 عبر السلسلة/.test(engineSrc));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
