// ═══════════════════════════════════════════════════════════════════════
// اختبار مُطابِق تصحيحات سجل التقييمات — 2026-08-24
// ───────────────────────────────────────────────────────────────────────
// لا يكتفي بفحص النص: يستخرج الدوال من stock-valuation.html ويُنفّذها في vm
// على سجل اصطناعي جوابه معروف سلفاً، ثم يقيس النتيجة.
// ═══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const M = require(path.join(ROOT, 'js', 'valuation-corrections.js'));

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); }
}

// ── 1) سلامة ملف التصحيحات نفسه ──
const V = M.VAL_CORRECTIONS;
t('36 عملية', V.length === 36);
t('19 سهماً', new Set(V.map(e => e.inputs.ticker)).size === 19);
t('لا معرّف مكرّر', new Set(V.map(e => e.id)).size === V.length);
t('كل معرّف رقم موجب', V.every(e => Number.isFinite(e.id) && e.id > 0));
t('كل عملية لها تاريخ', V.every(e => typeof e.date === 'string' && e.date.trim() !== ''));
t('كل عملية لها رمز', V.every(e => /^\d{4}$/.test(String(e.inputs.ticker))));
t('كل عملية لها نوع شركة', V.every(e => ['bank', 'reit', 'cyclical', 'normal'].includes(e.inputs.companyType)));
t('أعمدة المدخلات 54', M.VAL_CORRECTIONS_FIELDS.length === 54);
t('الحقول المصونة نصّية', JSON.stringify(M.VAL_CORRECTIONS_KEEP_IF_EMPTY) === '["notes","perplexityEval"]');

// ── 2) الأوسمة فُصلت عن الأرقام (م.19) ولم تُصفَّر (م.20) ──
const TAG = /[✅⚙⚠❌️ℹ]/u;
const FREE = new Set(['ticker', 'stockName', 'companyType', 'scenario', 'anchorModel',
  'decision', 'notes', 'perplexityEval', 'fcfBasis', 'noNetDebt', 'noTotalDebt', 'dataTags']);
let dirty = [];
V.forEach(e => Object.keys(e.inputs).forEach(k => {
  if (FREE.has(k)) return;
  if (TAG.test(String(e.inputs[k]))) dirty.push(e.inputs.ticker + '.' + k);
}));
t('لا وسم داخل قيمة رقمية: ' + dirty.join(','), dirty.length === 0);

const r1010 = V.find(e => e.id === 1787401920939);
t('1010 npl صار رقماً نظيفاً', r1010.inputs.npl === '1.05');
t('1010 provCoverage نظيف', r1010.inputs.provCoverage === '150');
t('1010 الوسم محفوظ في dataTags', /npl:/.test(r1010.inputs.dataTags || ''));
t('1010 CET1 مُفرَّغ (م.20)', r1010.inputs.cet1 === undefined);
t('1010 نسبة السيولة مُفرَّغة (م.34)', r1010.inputs.liquidityRatio === undefined);
t('1010 لا يوجد دين صافٍ = true (م.34)', String(r1010.inputs.noNetDebt) === 'true');
t('1010 bankEps = 2.48 من الملف الرسمي', r1010.inputs.bankEps === '2.48');
t('1010 currentPe = 8.26', r1010.inputs.currentPe === '8.26');
t('1010 حقول الشركة العادية مُفرَّغة', r1010.inputs.eps === undefined && r1010.inputs.fcf === undefined);

// وسم مجرّد بلا رقم = غير متوفر، لا صفر
const r2284 = V.filter(e => e.inputs.ticker === '2284').sort((a, b) => a.id - b.id)[0];
t('2284 القديمة: القيمة الدفترية غير متوفرة لا صفر', r2284.inputs.bookValue === undefined);
t('2284 القديمة: الوسم موثّق', /bookValue:/.test(r2284.inputs.dataTags || ''));

// ── 3) استخراج الدوال من الصفحة وتنفيذها ──
const html = fs.readFileSync(path.join(ROOT, 'stock-valuation.html'), 'utf8');
function grab(sig) {
  const i = html.indexOf(sig);
  if (i < 0) throw new Error('لم أجد: ' + sig);
  // نقرأ حتى يتوازن القوسان المعقوفان
  let d = 0, started = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return html.slice(i, j + 1); }
  }
  throw new Error('قوس غير متوازن: ' + sig);
}
const src = [
  grab('function corrMergeInputs('),
  grab('function corrSame('),
  grab('function corrDiff('),
  grab('function corrMatch('),
].join('\n');

const ctx = vm.createContext({
  VAL_CORRECTIONS: V,
  VAL_CORRECTIONS_FIELDS: M.VAL_CORRECTIONS_FIELDS,
  VAL_CORRECTIONS_KEEP_IF_EMPTY: M.VAL_CORRECTIONS_KEEP_IF_EMPTY,
  _history: [],
  JSON, Object, Set, Map, Array, String, Number, parseFloat, isFinite, console,
});
vm.runInContext(src, ctx);
const call = (fn, ...a) => { ctx.__a = a; return vm.runInContext(fn + '(...__a)', ctx); };

// corrSame — المقارنة رقمية لا نصية
t('"2.50" = "2.5"',            call('corrSame', '2.50', '2.5') === true);
t('"  8.26 " = 8.26',          call('corrSame', '  8.26 ', 8.26) === true);
t('"2.66" ≠ "2.48"',           call('corrSame', '2.66', '2.48') === false);
t('الفراغ ≠ صفر (م.20)',       call('corrSame', '', '0') === false);
t('غائب ≠ صفر',                call('corrSame', undefined, '0') === false);
t('غائب = فراغ',               call('corrSame', undefined, '') === true);
t('"true" ≠ "false"',          call('corrSame', 'true', 'false') === false);
t('"realistic" = "realistic"', call('corrSame', 'realistic', 'realistic') === true);
t('نص ≠ نص آخر',               call('corrSame', 'bank', 'normal') === false);

// corrDiff — التقاط التفريغ والإضافة والتغيير
const d1 = call('corrDiff', { a: '1', b: '2', c: '3' }, { a: '1.0', b: '9' });
t('فرقان فقط: b تغيّر و c فُرِّغ', d1.length === 2);
t('يلتقط التغيير', d1.some(x => x.k === 'b' && x.to === '9'));
t('يلتقط التفريغ', d1.some(x => x.k === 'c' && x.to === undefined));
t('لا يعدّ 1 مقابل 1.0 تغييراً', !d1.some(x => x.k === 'a'));

// corrMergeInputs — صون النثر وتنفيذ التفريغ المقصود
const merged = call('corrMergeInputs',
  { eps: '5', cet1: '18', notes: 'ملاحظتي', perplexityEval: 'تقييمي', myOwnKey: 'س' },
  { eps: '2.48' });
t('الملف يعلو: eps تغيّر',            merged.eps === '2.48');
t('التفريغ المقصود يُنفَّذ: cet1 اختفى', merged.cet1 === undefined);
t('ملاحظاتك مصونة',                   merged.notes === 'ملاحظتي');
t('تقييم Perplexity مصون',            merged.perplexityEval === 'تقييمي');
t('حقل خارج أعمدة الملف يبقى',        merged.myOwnKey === 'س');
const merged2 = call('corrMergeInputs',
  { notes: 'ملاحظتي' }, { notes: 'ملاحظة الملف' });
t('الملف يعلو حين يملأ الملاحظة', merged2.notes === 'ملاحظة الملف');

// corrMatch — المطابقة بالمعرّف، ثم بالرمز+التاريخ، والدلاء الثلاثة
const c0 = V[0], c1 = V[1];
ctx._history = [
  { id: c0.id,   date: c0.date, inputs: JSON.parse(JSON.stringify(c0.inputs)), results: {} }, // مطابق أصلاً
  { id: 999001,  date: c1.date, inputs: { ticker: c1.inputs.ticker, eps: '1' }, results: {} }, // معرّف مختلف
  { id: 999002,  date: 'تاريخ لا يقابله شيء', inputs: { ticker: '9999' }, results: {} },        // خارج الملف
];
const mr = call('corrMatch');
t('طابق العمليتين', mr.matched.length === 2);
t('الأولى بالمعرّف',            mr.matched[0].how === 'المعرّف');
t('الأولى بلا فروق',            mr.matched[0].diff.length === 0);
t('الثانية بالرمز + التاريخ',   mr.matched.some(m => m.how === 'الرمز + التاريخ'));
t('الثانية لها فروق',           mr.matched.find(m => m.how === 'الرمز + التاريخ').diff.length > 0);
t('34 عملية بلا نظير',          mr.missing.length === 34);
t('عملية واحدة خارج الملف',     mr.untouched.length === 1 && mr.untouched[0].id === 999002);
t('لا يُعاد ختم التاريخ',       mr.matched.every(m => m.corr.date === m.entry.date));

// السجل الكامل يطابق الملف كاملاً — لا فاقد ولا زائد
ctx._history = V.map(c => ({ id: c.id, date: c.date, inputs: { ticker: c.inputs.ticker }, results: {} }));
const full = call('corrMatch');
t('المطابقة الكاملة 36',   full.matched.length === 36);
t('لا مفقود',              full.missing.length === 0);
t('لا متروك',              full.untouched.length === 0);
t('كلها بالمعرّف',         full.matched.every(m => m.how === 'المعرّف'));
t('كلها تحتاج تعديلاً',    full.matched.every(m => m.diff.length > 0));

// ── 3-ب) حارس العَلَم المنطقي: "false" نصٌّ صادق ──
const flagSrc = grab('function flagOn(');
vm.runInContext(flagSrc, ctx);
t('flagOn("false") = false',  call('flagOn', "false") === false);
t('flagOn("FALSE") = false',  call('flagOn', "FALSE") === false);
t('flagOn("0") = false',      call('flagOn', "0") === false);
t('flagOn("") = false',       call('flagOn', "") === false);
t('flagOn(false) = false',     call('flagOn', false) === false);
t('flagOn(undefined) = false', call('flagOn', undefined) === false);
t('flagOn("true") = true',    call('flagOn', "true") === true);
t('flagOn(true) = true',       call('flagOn', true) === true);

// المنطقيات في ملف التصحيحات مُطبَّعة أصلاً — لا نص
const flagKeys = ['noNetDebt', 'noTotalDebt', 'useWacc'];
let strFlags = [];
V.forEach(e => flagKeys.forEach(k => {
  if (e.inputs[k] !== undefined && typeof e.inputs[k] !== 'boolean') strFlags.push(e.inputs.ticker + '.' + k);
}));
t('كل الأعلام منطقية لا نصية: ' + strFlags.join(','), strFlags.length === 0);

// الريتات تحمل دينها الإجمالي — وإلا انتفخ NAV للوحدة
const reits = V.filter(e => e.inputs.companyType === 'reit');
t('6 عمليات ريت', reits.length === 6);
t('كل ريت له دين إجمالي مُدخَل', reits.every(e => parseFloat(e.inputs.totalDebt) > 0));
t('ولا واحد منها معلَّم «لا يوجد دين»', reits.every(e => e.inputs.noTotalDebt !== true));

// ── 4) الصفحة موصولة فعلاً ──
t('وسم السكربت مضاف',   html.includes('js/valuation-corrections.js'));
t('الزر موصول',          html.includes('onclick="previewValCorrections()"'));
t('نسخة احتياطية قبل الكتابة', html.includes('CORR_BACKUP_KEY') && html.includes('saveUserSetting(CORR_BACKUP_KEY'));
t('يُعاد الحساب بمعادلة المنصة', /const res = recomputeResults\(m\.entry\.inputs\)/.test(html));
t('فرق الملف عن إعادة الحساب يُعلَن (م.24)', html.includes('drift.push('));
t('لا يمسّ e.date',      !/m\.entry\.date\s*=/.test(html));
t('لا يمسّ e.id',        !/m\.entry\.id\s*=/.test(html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
