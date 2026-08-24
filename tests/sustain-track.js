// ═══════════════════════════════════════════════════════════════════════
// مسار بوابة الاستدامة عبر السنوات (م.43) — قراءة واحدة لا تكفي
// ───────────────────────────────────────────────────────────────────────
// المنصّة كانت تحسب حكم الاستدامة لكل تقييم وتحفظه، ولا يقرؤه أحد. ومع
// السلسلة السنوية صار قابلاً للعدّ: الفشل المعزول ضجيج، والمتتالي إشارة.
//
// الاختبار يُنفّذ المنطق على حالات جوابها معروف سلفاً، ثم على السجل الحقيقي.
// ═══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.log('  ✗ ' + name)); };

// المستودع يحفظ CRLF، فمرساة تحمل سطراً جديداً لا تطابق ما لم تُطبَّع
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const src = fs.readFileSync(path.join(ROOT, 'js', 'decision-engine.js'), 'utf8')
  .split(CR + LF).join(LF);

// ── استخراج كتلة بناء المسار وتشغيلها على مدخلات مُصطنعة ──
// نعيد بناء الحلقة نفسها حرفياً من الملف حتى لا يتحوّل الاختبار إلى نسخةٍ
// ثانية من المنطق تنجح بينما الأصل مكسور.
const i = src.indexOf('  valSustainTrack = {};\n  Object.keys(valHistByTicker)');
const j = src.indexOf('// ── م.37 عبر السلسلة كاملةً');
t('كتلة بناء المسار موجودة في المحرّك', i > 0 && j > i);
const block = src.slice(i, j);

const ctx = vm.createContext({ Object, Array, Math, JSON, String, Number, console });
vm.runInContext('let valSustainTrack = {}; let valHistByTicker = {};', ctx);

function trackOf(marks) {
  // marks: [[year, fail], ...] بالترتيب الزمني
  const rows = marks.map(([y, f], k) => ({
    ts: new Date(y, 11, 31).getTime(), date: '31/12/' + y,
    results: { sustainFail: f, sustainReasons: f ? ['سبب ' + y] : [] },
  }));
  ctx.__h = { X: rows.slice().reverse() };     // نُخزّنها مقلوبة عمداً
  vm.runInContext('valHistByTicker = __h; valSustainTrack = {};', ctx);
  vm.runInContext(block, ctx);
  return vm.runInContext('valSustainTrack.X', ctx);
}

// ── حالات جوابها معروف ──
const allPass = trackOf([[2021, false], [2022, false], [2023, false]]);
t('كل القراءات ناجحة: لا فشل', allPass.fails === 0 && allPass.longest === 0);
t('وليست مؤكَّدة ولا متعافية', !allPass.confirmed && !allPass.recovered);

const isolated = trackOf([[2021, false], [2022, true], [2023, false], [2024, false]]);
t('فشل معزول: يُعدّ ولا يُؤكَّد', isolated.fails === 1 && isolated.longest === 1);
t('فشل معزول قديم ليس إشارة جارية', isolated.current === 0 && !isolated.confirmed);
t('وليس تعافياً (م.43 تحتاج تتابعاً)', !isolated.recovered);

const confirmed = trackOf([[2021, false], [2022, false], [2023, true], [2024, true]]);
t('قراءتان متتاليتان آخرهما الأحدث = مؤكَّد (م.43)', confirmed.confirmed === true);
t('المتتالية الجارية = 2', confirmed.current === 2);
t('ويحمل سبب آخر قراءة', confirmed.lastWhy.join() === 'سبب 2024');

const candidate = trackOf([[2021, false], [2022, false], [2023, false], [2024, true]]);
t('فشل في آخر قراءة فقط = مرشّح لا مؤكَّد', candidate.current === 1 && !candidate.confirmed);

const recovered = trackOf([[2021, true], [2022, true], [2023, true], [2024, false], [2025, false]]);
t('تعافٍ بعد ثلاث متتاليات', recovered.recovered === true && recovered.current === 0);
t('وأطول متتالية محفوظة', recovered.longest === 3);

const oneOnly = trackOf([[2025, true]]);
t('قراءة واحدة لا تُنتج مساراً', oneOnly === undefined);

// الترتيب: نُخزّنها مقلوبة، والمسار يجب أن يخرج بالترتيب الزمني
const ordered = trackOf([[2021, true], [2022, false], [2023, false]]);
t('المسار يُرتَّب زمنياً مهما كانت ترتيبة التخزين',
  ordered.marks[0].date.includes('2021') && ordered.marks[2].date.includes('2023'));

// م.21: الصفّ بلا حكم لا يُقرأ نجاحاً
ctx.__h = { X: [
  { ts: 1, date: '31/12/2021', results: { sustainFail: true, sustainReasons: [] } },
  { ts: 2, date: '31/12/2022', results: {} },                       // بلا حكم
  { ts: 3, date: '31/12/2023', results: { sustainFail: true, sustainReasons: [] } },
] };
vm.runInContext('valHistByTicker = __h; valSustainTrack = {};', ctx);
vm.runInContext(block, ctx);
const gap = vm.runInContext('valSustainTrack.X', ctx);
t('الصفّ بلا حكم يُستثنى لا يُعدّ نجاحاً (م.21)', gap.n === 2 && gap.fails === 2);
t('ولا يقطع التتابع كذباً', gap.current === 2 && gap.confirmed === true);

// ── على السجل الحقيقي ──
const { VAL_IMPORT: V } = require(path.join(ROOT, 'js', 'valuation-import.js'));
t('السجل يحمل 141 عملية', V.length === 141);

// سدافكو: الملف نفسه يُظهر توزيعاً يتجاوز الربح في 2024 و2025
const sadafco = V.filter(e => e.inputs.ticker === '2270');
t('2270 له ست عمليات', sadafco.length === 6);
const s24 = sadafco.find(e => String(e.date).includes('٢٠٢٤'));
const s25 = sadafco.find(e => String(e.date).includes('٢٠٢٥'));
t('2270/2024 توزيعه يتجاوز ربحه',
  parseFloat(s24.inputs.dividends) > parseFloat(s24.inputs.eps));
t('2270/2025 كذلك — قراءتان متتاليتان',
  parseFloat(s25.inputs.dividends) > parseFloat(s25.inputs.eps));

// ── العرض موصول ومحصَّن ──
t('الدالة موجودة',            /function sustainTrackHtml\(ticker\)/.test(src));
t('موصولة في البطاقة التفصيلية', /out\.push\(sustainTrackHtml\(ticker\)\)/.test(src));
t('الحكم موسوم «رجعي» (م.19)', /حكم رجعي/.test(src));
t('تذكر م.43 صراحةً',          /م\.43/.test(src));
t('المتغيّر مُصرَّح',           /let valSustainTrack = \{\}/.test(src));
t('النصّ مُهرَّب قبل العرض',    /escapeHtmlSafe/.test(src.slice(src.indexOf('function sustainTrackHtml'))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
