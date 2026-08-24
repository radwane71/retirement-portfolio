// ═══════════════════════════════════════════════════════════════════════
// التسعير عند الدخول — سعر الشراء مقابل القيمة العادلة المتاحة وقتها
// ───────────────────────────────────────────────────────────────────────
// أخطر ما في هذه الميزة أنها تبدو صحيحة وهي مغلوطة بعشرة أضعاف: دفتر
// المعاملات يُعاد كتابته بعد التجزئة، والتقييم القديم يبقى بأساس ما قبلها.
// فيقول الجدول «اشتريتَ بـ2% من العادلة» وهو هراء.
//
// الاختبار يُشغّل الدوال في vm على بيانات جوابها معروف سلفاً، ويتضمّن
// فخّ التجزئة صراحةً — فلو سقط الحارس ظهر الرقم الكاذب.
// ═══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.log('  ✗ ' + name)); };

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const src = fs.readFileSync(path.join(ROOT, 'js', 'performance.js'), 'utf8').split(CR + LF).join(LF);

// ── استخراج الدوال الحقيقية من الملف ──
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

const el = { innerHTML: '' };
const ctx = vm.createContext({
  Object, Array, Math, JSON, String, Number, Date, Set, Map, Promise,
  isFinite, isNaN, parseFloat, parseInt, console,
  document: { getElementById: id => (id === 'entry-body' ? el : null) },
  // مرافق الصفحة — مُصغَّرة لكنها كافية
  esc: v => String(v == null ? '' : v),
  formatNum: (n, d = 2) => (+n).toFixed(d),
  formatSAR: n => (+n).toFixed(0) + ' ر.س',
  noteHtml: (ic, h) => '<note>' + h + '</note>',
  parseDateLocal: s => { const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; },
  valEntryStamp: e => {
    const m = String(e.date).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null;
  },
  loadUserSetting: async () => ctx.__hist,
  getPositionData: () => ctx.__pos,
});
ctx.window = ctx; ctx.globalThis = ctx;

vm.runInContext([
  grab('async function loadEntryValuations('),
  grab('function entryRefFor('),
  grab('async function renderEntryPricing('),
].join('\n'), ctx);
vm.runInContext("const ENTRY_VAL_KEY = 'valuation_history_v1'; const ENTRY_SPLIT_RATIO = 4;"
  + ' var _entryVal = null; var _entrySplitYear = {};', ctx);

const val = (tk, year, fv, bvps, extra) => ({
  id: year, date: year + '-12-31', inputs: { ticker: tk, bookValue: bvps },
  results: Object.assign({ fairValueAvg: fv }, extra || {}),
});
const buy = (tk, date, price, shares) => ({ ticker: tk, date, price, shares, type: 'buy', total: price * shares });

async function run(hist, positions) {
  ctx.__hist = hist;
  ctx.__pos = { open: positions, closed: [] };
  vm.runInContext('_entryVal = null; _entrySplitYear = {};', ctx);
  el.innerHTML = '';
  await vm.runInContext('renderEntryPricing()', ctx);
  return el.innerHTML;
}

(async () => {
  // ── ① لا استشراف: المرجع هو السنة السابقة ──
  let html = await run(
    [val('1010', 2023, 20, 15), val('1010', 2024, 40, 16)],
    [{ ticker: '1010', name: 'الرياض', allBuys: [buy('1010', '2024-03-01', 20, 100)] }]);
  t('يستعمل تقييم السنة السابقة (2023) لا سنة الشراء', /\(2023\)/.test(html));
  t('ولا يستعمل تقييم 2024', !/\(2024\)/.test(html));
  t('النسبة 100% لا 50%', /100%/.test(html) && !/>50%/.test(html));

  // ── ② فخّ التجزئة: يجب أن يُستبعَد لا أن يُعرض ──
  // العثيم: القيمة الدفترية 15.64 (2022) ← 1.50 (2023) = تجزئة عشرية.
  // سعر الشراء في الدفتر مُعاد كتابته بعد التجزئة (5.5)، والتقييم القديم
  // بأساس ما قبلها (82). بلا حارس تظهر النسبة 6.7% — «رخيصٌ جداً» كاذب.
  html = await run(
    [val('4001', 2021, 82, 15.18), val('4001', 2022, 90, 15.64),
     val('4001', 2023, 9, 1.50),  val('4001', 2024, 10, 1.48)],
    [{ ticker: '4001', name: 'العثيم', allBuys: [buy('4001', '2022-05-01', 5.5, 100)] }]);
  t('الشراء قبل التجزئة يُستبعَد (م.22)', /عبر تجزئة/.test(html));
  t('ولا تظهر نسبة كاذبة', !/6%|7%/.test(html));
  t('ويُسمّى السهم في المستبعَد', /4001/.test(html));

  // الشراء بعد التجزئة يُقاس عادياً
  html = await run(
    [val('4001', 2021, 82, 15.18), val('4001', 2022, 90, 15.64),
     val('4001', 2023, 9, 1.50),  val('4001', 2024, 10, 1.48)],
    [{ ticker: '4001', name: 'العثيم', allBuys: [buy('4001', '2025-02-01', 8, 100)] }]);
  t('الشراء بعد التجزئة يُقاس', /\(2024\)/.test(html) && /80%/.test(html));

  // ── ③ الترجيح بالمبلغ لا بعدد الصفقات ──
  html = await run(
    [val('X', 2023, 100, 10)],
    [{ ticker: 'X', name: 'س', allBuys: [
      buy('X', '2024-01-01', 50, 1000),   // 50,000 ريالاً عند 50%
      buy('X', '2024-02-01', 150, 10),    // 1,500 ريالاً عند 150%
    ] }]);
  // المتوسط البسيط 100%، والمرجَّح بالمبلغ ≈ 53%
  t('الوسطي مرجَّح بالمبلغ لا بعدد الصفقات', /5[23]%/.test(html) && !/: 100%/.test(html));

  // ── ④ الرخص في سنةٍ فاشلة الاستدامة يُوسَم ولا يُمدَح ──
  html = await run(
    [val('Y', 2023, 100, 10, { sustainFail: true, sustainReasons: ['التوزيع يتجاوز الربح'] })],
    [{ ticker: 'Y', name: 'ص', allBuys: [buy('Y', '2024-01-01', 60, 100)] }]);
  t('يوسم صفقةً في سنةٍ رسبت استدامتها', /استدامة/.test(html));
  t('ويقول صراحةً إنها ليست مدحاً', /خطر لا فرصة/.test(html));

  // ── ⑤ سهم بلا سلسلة: يُستبعَد ويُعلَن، ولا يُخترَع له رقم ──
  html = await run(
    [val('A', 2023, 100, 10)],
    [{ ticker: 'B', name: 'ب', allBuys: [buy('B', '2024-01-01', 50, 10)] }]);
  t('سهم بلا سلسلة يُعلَن ولا يُقدَّر', /بلا سلسلة تقييم/.test(html));
  t('ويُسمّى', /B/.test(html));

  // ── ⑥ المنحة بلا سعر لا تُحسب دخولاً ──
  html = await run(
    [val('C', 2023, 100, 10)],
    [{ ticker: 'C', name: 'ج', allBuys: [
      { ticker: 'C', date: '2024-01-01', price: 0, shares: 50, type: 'grant', total: 0 },
      buy('C', '2024-01-01', 80, 10),
    ] }]);
  t('المنحة تُستبعَد', /1 منحة أو بلا سعر/.test(html));
  t('والشراء الحقيقي يُقاس', /80%/.test(html));

  // ── ⑦ تصريح التغطية: كم قِيس من كم ──
  html = await run(
    [val('D', 2023, 100, 10)],
    [{ ticker: 'D', name: 'د', allBuys: [buy('D', '2024-01-01', 90, 10), buy('D', '2019-01-01', 50, 10)] }]);
  t('يُصرّح بالمقيس من الإجمالي', /المقيس: 1 من 2/.test(html));

  // ── ⑧ لا شيء قابل للقياس: رسالة صريحة لا جدول فارغ ──
  html = await run([], [{ ticker: 'E', name: 'هـ', allBuys: [buy('E', '2024-01-01', 10, 10)] }]);
  t('لا مقيس ⇒ رسالة صريحة', /لا صفقة شراء قابلة للقياس/.test(html));
  t('ولا جدول', !/<table/.test(html));

  // ── ⑨ التقييم بلا قيمة عادلة لا يصلح مرجعاً ──
  html = await run(
    [{ id: 1, date: '2023-12-31', inputs: { ticker: 'F', bookValue: 10 }, results: {} }],
    [{ ticker: 'F', name: 'و', allBuys: [buy('F', '2024-01-01', 10, 10)] }]);
  t('تقييم بلا قيمة عادلة لا يُستعمل', /لا صفقة شراء قابلة للقياس/.test(html));

  // ── ⑩ الوصل بالصفحة ──
  const h = fs.readFileSync(path.join(ROOT, 'performance.html'), 'utf8');
  t('الزر موجود',            /id="ptab-entry"/.test(h));
  t('الحاوية موجودة',        /id="pview-entry"/.test(h) && /id="entry-body"/.test(h));
  t('نافذة الشرح موصولة',    /showEntryPricingInfo\(\)/.test(h));
  t('التبويب مُسجَّل',        /'div-metrics','entry','behavioral'/.test(src));
  t('ويُحمَّل كسولاً',        /tab === 'entry'\)\s*renderEntryPricing\(\)/.test(src));
  t('الشرح يذكر م.22',       /م\.22/.test(src.slice(src.indexOf('function showEntryPricingInfo'))));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
