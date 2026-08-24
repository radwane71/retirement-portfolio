// ═══════════════════════════════════════════════════════════════════════
// اختبار مُستورِد سجل التقييمات — 2026-08-24
// ───────────────────────────────────────────────────────────────────────
// لا يكتفي بفحص النص: يستخرج الدوال من stock-valuation.html ويُنفّذها في vm
// على سجل اصطناعي جوابه معروف سلفاً، ثم يقيس النتيجة.
// ═══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const M = require(path.join(ROOT, 'js', 'valuation-import.js'));
const { TADAWUL_DATA } = require(path.join(ROOT, 'js', 'tadawul-data.js'));

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); }
}

const V = M.VAL_IMPORT;
const HIST = V.filter(e => e.src === 'historical');
const CORR = V.filter(e => e.src === 'corrections');

// ── 1) سلامة ملف الاستيراد ──
t('141 عملية', V.length === 141);
t('105 تاريخية', HIST.length === 105);
t('36 تصحيحاً', CORR.length === 36);
t('22 سهماً', new Set(V.map(e => e.inputs.ticker)).size === 22);
t('لا معرّف مكرّر', new Set(V.map(e => e.id)).size === V.length);
t('كل معرّف رقم موجب', V.every(e => Number.isFinite(e.id) && e.id > 0));
t('كل عملية لها تاريخ', V.every(e => typeof e.date === 'string' && e.date.trim() !== ''));
t('كل عملية لها رمز رباعي', V.every(e => /^\d{4}$/.test(String(e.inputs.ticker))));
t('كل عملية لها نوع معروف', V.every(e => ['bank', 'reit', 'cyclical', 'normal'].includes(e.inputs.companyType)));
t('كل عملية موسومة بمصدرها', V.every(e => e.src === 'historical' || e.src === 'corrections'));
t('الحقول المصونة نصّية', JSON.stringify(M.VAL_IMPORT_KEEP_IF_EMPTY) === '["notes","perplexityEval"]');

// المعرّفات التاريخية تسبق الحقيقية — الترتيب في كل الشاشات بالمعرّف
t('المعرّف التاريخي أقدم من كل معرّف حقيقي',
  Math.max(...HIST.map(e => e.id)) < Math.min(...CORR.map(e => e.id)));
// وداخل السهم الواحد، المعرّف يتصاعد مع السنة — وإلا انقلبت السلاسل الزمنية
const AR = '٠١٢٣٤٥٦٧٨٩';
const yearOf = e => {
  const m = String(e.date).replace(/[٠-٩]/g, d => AR.indexOf(d)).match(/(\d{4})/);
  return m ? +m[1] : null;
};
let seriesOk = true;
[...new Set(HIST.map(e => e.inputs.ticker))].forEach(tk => {
  const g = HIST.filter(e => e.inputs.ticker === tk).sort((a, b) => a.id - b.id);
  for (let i = 1; i < g.length; i++) if (yearOf(g[i]) < yearOf(g[i - 1])) seriesOk = false;
});
t('ترتيب المعرّف = ترتيب السنة داخل كل سهم', seriesOk);

// ── 2) الأوسمة فُصلت عن الأرقام (م.19) ولم تُصفَّر (م.20) ──
const TAG = /[✅⚙⚠❌️ℹ]/u;
const FREE = new Set(['ticker', 'stockName', 'companyType', 'scenario', 'anchorModel',
  'decision', 'notes', 'perplexityEval', 'fcfBasis', 'noNetDebt', 'noTotalDebt', 'useWacc', 'dataTags']);
const dirty = [];
V.forEach(e => Object.keys(e.inputs).forEach(k => {
  if (FREE.has(k)) return;
  if (TAG.test(String(e.inputs[k]))) dirty.push(e.inputs.ticker + '.' + k);
}));
t('لا وسم داخل قيمة رقمية: ' + dirty.join(','), dirty.length === 0);

const r1010 = CORR.find(e => e.id === 1787401920939);
t('1010 npl رقم نظيف', r1010.inputs.npl === '1.05');
t('1010 الوسم محفوظ في dataTags', /npl:/.test(r1010.inputs.dataTags || ''));
t('1010 CET1 مُفرَّغ (م.20)', r1010.inputs.cet1 === undefined);
t('1010 نسبة السيولة مُفرَّغة (م.34)', r1010.inputs.liquidityRatio === undefined);
t('1010 لا يوجد دين صافٍ منطقي true', r1010.inputs.noNetDebt === true);
t('1010 حقول الشركة العادية مُفرَّغة', r1010.inputs.eps === undefined && r1010.inputs.fcf === undefined);

// ── 3) الأعلام منطقية لا نصية ("false" نصٌّ صادق) ──
const strFlags = [];
V.forEach(e => ['noNetDebt', 'noTotalDebt', 'useWacc'].forEach(k => {
  if (e.inputs[k] !== undefined && typeof e.inputs[k] !== 'boolean') strFlags.push(e.inputs.ticker + '.' + k);
}));
t('كل الأعلام منطقية: ' + strFlags.join(','), strFlags.length === 0);

// ── 4) ترميم السجل التاريخي من ملفات تداول (م.15) ──
// ربحية السهم كانت مجمَّدة على رقم آخر سنة في 12 سهماً — يجب أن تتغيّر الآن
const frozen = [];
[...new Set(HIST.map(e => e.inputs.ticker))].forEach(tk => {
  const g = HIST.filter(e => e.inputs.ticker === tk);
  if (g.length < 2) return;
  const key = g[0].inputs.companyType === 'bank' ? 'bankEps' : 'eps';
  const vals = [...new Set(g.map(e => e.inputs[key]).filter(v => v !== undefined))];
  const official = TADAWUL_DATA[tk] && TADAWUL_DATA[tk].years;
  const covered = official && g.filter(e => official[yearOf(e)] && official[yearOf(e)].eps != null).length;
  if (covered >= 2 && vals.length === 1) frozen.push(tk + '.' + key + '=' + vals[0]);
});
t('لا سهم بقيت ربحيته مجمَّدة رغم توفّر سنواتٍ رسمية: ' + frozen.join(','), frozen.length === 0);

// كل قيمة رُمّمت تطابق الرقم الرسمي لنفس السهم ونفس السنة — بحثٌ لا تقدير
const mismatch = [];
HIST.forEach(e => {
  const rec = TADAWUL_DATA[e.inputs.ticker] && TADAWUL_DATA[e.inputs.ticker].years[yearOf(e)];
  if (!rec || rec.eps == null) return;
  const key = e.inputs.companyType === 'bank' ? 'bankEps' : 'eps';
  const got = parseFloat(e.inputs[key]);
  if (!isFinite(got)) { mismatch.push(e.inputs.ticker + '/' + yearOf(e) + ' غائب'); return; }
  if (Math.abs(got - rec.eps) > Math.max(0.02, Math.abs(rec.eps) * 0.02)) {
    mismatch.push(e.inputs.ticker + '/' + yearOf(e) + ': ' + got + ' ≠ ' + rec.eps);
  }
});
t('ربحية كل سنة تطابق تداول: ' + mismatch.slice(0, 4).join(' · '), mismatch.length === 0);

// خطأ الوحدة عولج: لا قيمة «للسهم» بحجم مستحيل
const huge = [];
V.forEach(e => ['eps', 'normEps', 'normFcf', 'dividends', 'fcf', 'bookValue', 'bvps', 'bankEps', 'bankDps', 'netDebt']
  .forEach(k => {
    const v = parseFloat(e.inputs[k]);
    if (isFinite(v) && Math.abs(v) > 1000) huge.push(e.inputs.ticker + '/' + yearOf(e) + '.' + k + '=' + v);
  }));
t('لا قيمة للسهم بحجم مستحيل: ' + huge.join(','), huge.length === 0);
const q3040 = HIST.filter(e => e.inputs.ticker === '3040').sort((a, b) => a.id - b.id);
t('3040 خمس سنوات', q3040.length === 5);
t('3040/2021 استُعيدت قيمتها الدفترية', Math.abs(parseFloat(q3040[0].inputs.bookValue) - 19.28) < 0.05);
t('3040 المُطبَّع أُعيد بناؤه من الرسمي', q3040.every(e => Math.abs(parseFloat(e.inputs.normEps) - 2.31) < 0.02));

// الريتات تحمل دينها — وإلا انتفخ NAV للوحدة
const reitsC = CORR.filter(e => e.inputs.companyType === 'reit');
t('6 عمليات ريت في التصحيحات', reitsC.length === 6);
t('كلها بدين إجمالي مُدخَل', reitsC.every(e => parseFloat(e.inputs.totalDebt) > 0));
t('ولا واحدة معلَّمة «لا يوجد دين»', reitsC.every(e => e.inputs.noTotalDebt !== true));

// الملاحظات تُعلَن ولا تُبتلع
t('ملاحظات معروضة للمالك', Array.isArray(M.VAL_IMPORT_NOTES) && M.VAL_IMPORT_NOTES.length >= 4);
t('ملاحظة الريت بلا دين معلنة', M.VAL_IMPORT_NOTES.some(n => n.includes('4333')));
t('ملاحظة الترميم معلنة', M.VAL_IMPORT_NOTES.some(n => n.includes('رُمّم') || n.includes('ترميم') || n.includes('تداول')));

// ── 5) استخراج الدوال من الصفحة وتنفيذها ──
const html = fs.readFileSync(path.join(ROOT, 'stock-valuation.html'), 'utf8');
function grab(sig) {
  const i = html.indexOf(sig);
  if (i < 0) throw new Error('لم أجد: ' + sig);
  let d = 0, started = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return html.slice(i, j + 1); }
  }
  throw new Error('قوس غير متوازن: ' + sig);
}
const ctx = vm.createContext({
  VAL_IMPORT: V,
  VAL_IMPORT_FIELDS: M.VAL_IMPORT_FIELDS,
  VAL_IMPORT_KEEP_IF_EMPTY: M.VAL_IMPORT_KEEP_IF_EMPTY,
  _history: [],
  JSON, Object, Set, Map, Array, String, Number, parseFloat, isFinite, console,
});
vm.runInContext([
  grab('function corrMergeInputs('), grab('function corrSame('),
  grab('function corrDiff('), grab('function corrMatch('), grab('function gateNum('),
].join('\n'), ctx);
const call = (fn, ...a) => { ctx.__a = a; return vm.runInContext(fn + '(...__a)', ctx); };

// corrSame — المقارنة رقمية لا نصية
t('"2.50" = "2.5"',            call('corrSame', '2.50', '2.5') === true);
t('"  8.26 " = 8.26',          call('corrSame', '  8.26 ', 8.26) === true);
t('"2.66" ≠ "2.48"',           call('corrSame', '2.66', '2.48') === false);
t('الفراغ ≠ صفر (م.20)',       call('corrSame', '', '0') === false);
t('غائب ≠ صفر',                call('corrSame', undefined, '0') === false);
t('غائب = فراغ',               call('corrSame', undefined, '') === true);
t('"true" ≠ "false"',          call('corrSame', 'true', 'false') === false);
t('نص ≠ نص آخر',               call('corrSame', 'bank', 'normal') === false);

// gateNum — م.21: الغائب لا يُحاكَم
t('gateNum("") = null',        call('gateNum', '') === null);
t('gateNum(undefined) = null', call('gateNum', undefined) === null);
t('gateNum("  ") = null',      call('gateNum', '  ') === null);
t('gateNum("0") = 0',          call('gateNum', '0') === 0);
t('gateNum("3.2") = 3.2',      call('gateNum', '3.2') === 3.2);
t('gateNum("نص") = null',      call('gateNum', 'نص') === null);

// corrDiff
const d1 = call('corrDiff', { a: '1', b: '2', c: '3' }, { a: '1.0', b: '9' });
t('فرقان فقط', d1.length === 2);
t('يلتقط التغيير', d1.some(x => x.k === 'b' && x.to === '9'));
t('يلتقط التفريغ', d1.some(x => x.k === 'c' && x.to === undefined));

// corrMergeInputs
const merged = call('corrMergeInputs',
  { eps: '5', cet1: '18', notes: 'ملاحظتي', perplexityEval: 'تقييمي', myOwnKey: 'س' },
  { eps: '2.48' });
t('الملف يعلو: eps تغيّر',             merged.eps === '2.48');
t('التفريغ المقصود يُنفَّذ',            merged.cet1 === undefined);
t('ملاحظاتك مصونة',                    merged.notes === 'ملاحظتي');
t('تقييم Perplexity مصون',             merged.perplexityEval === 'تقييمي');
t('حقل خارج أعمدة الملف يبقى',         merged.myOwnKey === 'س');
t('الملف يعلو حين يملأ الملاحظة',
  call('corrMergeInputs', { notes: 'لي' }, { notes: 'له' }).notes === 'له');

// ── 6) corrMatch: ثلاثة دلاء ──
// سجل فارغ ⇒ كل شيء يُضاف
ctx._history = [];
let mr = call('corrMatch');
t('سجل فارغ: 141 تُضاف', mr.toAdd.length === 141);
t('سجل فارغ: لا شيء يُطابَق', mr.matched.length === 0);
t('سجل فارغ: لا متروك', mr.untouched.length === 0);

// سجل يطابق الملف كاملاً ⇒ لا إضافة ولا تعديل (إعادة الضغط لا تُضاعف)
ctx._history = V.map(c => ({ id: c.id, date: c.date, inputs: JSON.parse(JSON.stringify(c.inputs)), results: {} }));
mr = call('corrMatch');
t('التطبيق ثانيةً: لا شيء يُضاف',  mr.toAdd.length === 0);
t('التطبيق ثانيةً: 141 مطابقة',    mr.matched.length === 141);
t('التطبيق ثانيةً: بلا فروق',      mr.matched.every(m => m.diff.length === 0));
t('التطبيق ثانيةً: لا متروك',      mr.untouched.length === 0);

// سجلّ المالك الواقعي: عمليتان قائمتان + عملية خارج الملف
const c0 = CORR[0], c1 = CORR[1];
ctx._history = [
  { id: c0.id,  date: c0.date, inputs: JSON.parse(JSON.stringify(c0.inputs)), results: {} },
  { id: 999001, date: c1.date, inputs: { ticker: c1.inputs.ticker, eps: '1' }, results: {} },
  { id: 999002, date: 'تاريخ لا يقابله شيء', inputs: { ticker: '9999' }, results: {} },
];
mr = call('corrMatch');
t('طابق عمليتين',                mr.matched.length === 2);
t('الأولى بالمعرّف بلا فروق',     mr.matched[0].how === 'المعرّف' && mr.matched[0].diff.length === 0);
t('الثانية بالرمز + التاريخ',     mr.matched.some(m => m.how === 'الرمز + التاريخ' && m.diff.length > 0));
t('139 تُضاف',                    mr.toAdd.length === 139);
t('عملية واحدة خارج الملف تبقى',  mr.untouched.length === 1 && mr.untouched[0].id === 999002);
t('لا يُعاد ختم التاريخ',         mr.matched.every(m => m.corr.date === m.entry.date));

// ── 6-ب) الترتيب: الأحدث أولاً — أربع صفحات تأخذ «أول ظهور» آخرَ تقييم ──
vm.runInContext(grab('function histStamp('), ctx);
const st = d => { ctx.__a = [{ date: d, id: 1 }]; return vm.runInContext('histStamp(...__a)', ctx); };
t('يقرأ 2017 من النص العربي-الهندي', new Date(st('٣١‏/١٢‏/٢٠١٧، ١٢:٠٠:٠٠ ص')).getFullYear() === 2017);
t('يقرأ 2026 من النص',              new Date(st('٢٢‏/٨‏/٢٠٢٦، ١:٣٢:٠٠ م')).getFullYear() === 2026);
t('يتجاهل لاحقة (معدَّل)',           new Date(st('٢٨‏/٦‏/٢٠٢٦، ١٠:١٩:٢٤ م (معدَّل)')).getFullYear() === 2026);
ctx.__a = [{ date: 'نص لا يُحلَّل', id: 1787401920939 }];
t('يرتدّ إلى المعرّف عند تعذّر التحليل', vm.runInContext('histStamp(...__a)', ctx) === 1787401920939);

// كل تواريخ الملف تُحلَّل — وإلا ارتدّ الترتيب إلى معرّف مصطنع
const unparsed = V.filter(e => { ctx.__a = [{ date: e.date, id: 0 }]; return !vm.runInContext('histStamp(...__a)', ctx); });
t('141 تاريخاً كلها تُحلَّل: ' + unparsed.length, unparsed.length === 0);

// المحاكاة: بعد الفرز، أول ظهور لكل رمز هو أحدث سنة
const stamped = V.map(e => { ctx.__a = [{ date: e.date, id: e.id }];
  return { tk: e.inputs.ticker, y: yearOf(e), ts: vm.runInContext('histStamp(...__a)', ctx), id: e.id }; });
stamped.sort((a, b) => (b.ts - a.ts) || (b.id - a.id));
const firstSeen = {}, newestYear = {};
stamped.forEach(r => { if (!firstSeen[r.tk]) firstSeen[r.tk] = r; newestYear[r.tk] = Math.max(newestYear[r.tk] || 0, r.y); });
const wrongOrder = Object.keys(firstSeen).filter(k => firstSeen[k].y !== newestYear[k]);
t('أول ظهور لكل رمز = أحدث سنة: ' + wrongOrder.join(','), wrongOrder.length === 0);
t('الفرز تنازلي في corrApply', html.includes('histStamp(b) - histStamp(a)'));

// ── 7) الصفحة موصولة فعلاً ──
t('وسم السكربت مضاف',            html.includes('js/valuation-import.js'));
t('الزر موصول',                   html.includes('onclick="previewValCorrections()"'));
t('نسخة احتياطية قبل الكتابة',    html.includes('saveUserSetting(CORR_BACKUP_KEY'));
t('يُعاد الحساب بمعادلة المنصة',  /recomputeResults\(entry\.inputs\)/.test(html));
t('الإضافة تدفع في السجل',        /_history\.push\(entry\)/.test(html));
t('فرق الملف عن إعادة الحساب يُعلَن', html.includes('drift.push('));
t('لا يمسّ e.date', !/m\.entry\.date\s*=/.test(html));
t('لا يمسّ e.id',   !/m\.entry\.id\s*=/.test(html));
t('البوابة تُنادى بـgateNum لا num', !/sustainabilityGate\([^)]*num\(inp\./.test(html));
t('لم يبقَ ذكر للاسم القديم', !html.includes('VAL_CORRECTIONS'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
