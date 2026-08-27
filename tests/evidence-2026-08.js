// ══════════════════════════════════════════════════════════════════════
// ما دخل المنصة من الأوراق الاثنتي عشرة — وما مُنع من الدخول
// ----------------------------------------------------------------------
// نُفِّذت البنود «القوية» وحدها بعد تدقيق الأوراق واحدةً واحدة. وهذا الفحص
// يحرس الاثنين معاً: أن المُنفَّذ يعمل، وأن ما رُفض لا يعود من الباب الخلفي.
//
// المرفوض الذي يحرسه هذا الملف:
//   • بتر تاريخ العوائد عند 2016 — يُسقط انهيارَي 2006 و2008 فيجعل توزيع
//     المخاطر أكثر تفاؤلاً، وهو عكس غرض المحاكاة. الكسر يُعلَن ولا يُحذف.
//   • حذف النماذج غير المتماثلة — تنقضه AL-Besher (2026) على تاسي بـ23 سنة.
//   • تحويل إفصاح م.30 إلى حكم — المادة نصّها «إفصاح لا تقييد» (م.9).
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const C = require(ROOT + 'js/constitution.js');

let ok = 0, bad = 0;
const t = (n, cond, extra) => {
  cond === true ? ok++ : bad++;
  console.log((cond === true ? 'PASS ' : 'FAIL ') + n + (cond === true ? '' : `  ← ${extra || ''}`));
};

// ── ① بيتا النفط: إفصاح مرجَّح بالقيمة (Aljifri 2020 · Abid 2026) ──
console.log('── بيتا النفط (م.30) ──');
const energyOnly = [{ ticker: '2222', sector: 'الطاقة', value: 100 }];
const healthOnly = [{ ticker: '4002', sector: 'الرعاية الصحية', value: 100 }];
t('محفظة طاقة كاملة ⇒ بيتا 1.00', C.oilBeta(energyOnly).beta === 1.00, C.oilBeta(energyOnly).beta);
t('محفظة رعاية صحية ⇒ بيتا منخفضة', C.oilBeta(healthOnly).beta <= 0.25, C.oilBeta(healthOnly).beta);
t('والطاقة تُصنَّف تركّزاً على عامل واحد', C.oilBeta(energyOnly).band.key === 'conc');
t('والرعاية الصحية تعرّضاً منخفضاً', C.oilBeta(healthOnly).band.key === 'low');

const mixed = [
  { sector: 'الطاقة',            value: 25 },
  { sector: 'المواد الاساسية',    value: 25 },
  { sector: 'البنوك',            value: 25 },
  { sector: 'الرعاية الصحية',     value: 25 },
];
const mb = C.oilBeta(mixed);
const expect = (1.00 + 0.75 + 0.55 + 0.20) / 4;
t('المرجّح بالقيمة صحيح', Math.abs(mb.beta - expect) < 1e-9, `${mb.beta} ≠ ${expect}`);
t('العوامل الفعّالة تُحسب', mb.effectiveFactors > 1 && mb.effectiveFactors <= 3, mb.effectiveFactors);
t('والحصص تُجمَع 100%',
  Math.abs(mb.buckets.reduce((a, b) => a + b.pct, 0) - 100) < 1e-9);

// اسم قديم يُردّ إلى القطاع الرسمي لا يسقط للافتراضي
t('«البتروكيماويات» تُردّ إلى المواد الاساسية',
  C.oilBeta([{ sector: 'البتروكيماويات', value: 10 }]).beta === C.OIL_BETA_SECTOR['المواد الاساسية']);
t('وقطاع مجهول يُعلَن لا يُبتلع',
  C.oilBeta([{ sector: 'قطاع لا وجود له', value: 10 }]).unknown.length === 1);

// ⚠️ إفصاح لا حكم — م.9 و30
t('نصّ الإفصاح يعلن أنه لا يولّد إشارة بيع', /لا يولّد إشارة بيع/.test(mb.why));
t('ويعلن أن المعاملات تقديرية لا مقيسة', /تقديرية/.test(mb.why));

// ── ② الكسر الهيكلي: يُعلَن ولا يُبتر (Abid 2026) ──
console.log('\n── الكسر الهيكلي (أكتوبر 2016) ──');
t('السنة المسجَّلة 2016', C.STRUCTURAL_BREAK_YEAR === 2016);
t('نافذة تبدأ 2004 تعبر الكسر', C.spansStructuralBreak(2004).spans === true);
t('ونافذة تبدأ 2018 لا تعبره', C.spansStructuralBreak(2018).spans === false);
t('وسنة غير صالحة تُعلَن مجهولة', C.spansStructuralBreak('—').known === false);

// الحارس الأهم: وعاء عوائد تاسي **لم يُبتر**
const fc = fs.readFileSync(ROOT + 'js/forecast.js', 'utf8');
const pool = (fc.match(/const TASI_PRICE_YE = \[([\s\S]*?)\]/) || [])[1] || '';
const nYears = (pool.match(/[0-9]+\.[0-9]+/g) || []).length;
t('وعاء العوائد ما زال يمتدّ 21 سنة (2004–2024)', nYears === 21, `العدد = ${nYears}`);
t('ولم يُبتر عند 2016', /2004 … 2024/.test(fc),
  'بتر الوعاء يُسقط انهيارَي 2006 و2008 فيجعل المخاطر أكثر تفاؤلاً');
t('والكسر مُعلَن في بطاقة السيناريوهات', /كسراً هيكلياً|كسر هيكلي/.test(fc));

// ── ③ حدّ العيّنة لمقاييس المخاطرة (AL-Besher 2026 · Habibou 2015) ──
console.log('\n── حدّ العيّنة للمخاطرة ──');
const pf = fs.readFileSync(ROOT + 'js/performance.js', 'utf8');
t('الحدّ الأدنى 12 فترة عائد', /const RISK_MIN_RETURNS\s*=\s*12/.test(pf));
t('والعتبة البحثية 60', /const RISK_TARGET_RETURNS\s*=\s*60/.test(pf));
t('ودون الحدّ لا يُحسب رقم', /rets\.length < RISK_MIN_RETURNS/.test(pf));
t('ولم يبقَ الحدّ القديم (3 فترات)', !/if \(rets\.length < 3\) return null/.test(pf),
  'ثلاث مشاهدات تعطي خطأً معيارياً ±50%');
t('ودقّة التقدير تُعرض', /volRelSE/.test(pf));

// الخطأ المعياري النسبي: 1 ÷ √(2(n−1))
const relSE = n => 1 / Math.sqrt(2 * (n - 1));
t('±50% عند 3 فترات',  Math.round(relSE(3)  * 100) === 50, Math.round(relSE(3) * 100));
t('±21% عند 12 فترة',  Math.round(relSE(12) * 100) === 21, Math.round(relSE(12) * 100));
t('±9%  عند 60 فترة',  Math.round(relSE(60) * 100) === 9,  Math.round(relSE(60) * 100));

// ── ④ لا حذف للنماذج غير المتماثلة (AL-Besher 2026 تنقض P8) ──
console.log('\n── ما مُنع من الدخول ──');
const all = ['js/performance.js', 'js/forecast.js', 'js/constitution.js']
  .map(f => fs.readFileSync(ROOT + f, 'utf8')).join('\n');
t('لا حذف صامت لنماذج التقلّب غير المتماثلة',
  !/احذف\s+(EGARCH|GJR)/.test(all));

// ── ⑤ شفافية الدرجة المركّبة (م.20) ──
console.log('\n── الأوزان الفعلية (م.20) ──');
const B = require(ROOT + 'js/appendix-b.js');
const rowsB = [
  { ticker: 'A', sector: 'البنوك',       value: 50, yieldPct: 5 },
  { ticker: 'B', sector: 'الرعاية الصحية', value: 50, yieldPct: 4 },
];
const res = B.computeAppendixB(rowsB, []);
const assessed = res.parts.filter(p => p.assessed);
const sumEff = assessed.reduce((a, p) => a + p.effWeight, 0);
t('الأوزان الفعلية تُجمَع 100% على ما قِيس',
  assessed.length > 0 && Math.abs(sumEff - 1) < 1e-9, sumEff);
t('والبُعد غير المُقيَّم وزنه الفعلي صفر',
  res.parts.filter(p => !p.assessed).every(p => p.effWeight === 0));
t('وغير المُقيَّم يُعلَن بالاسم', Array.isArray(res.unassessed));
t('والدرجة مقنَّنة على ما قِيس لا على ستّة أبعاد',
  res.score == null || (res.score >= 0 && res.score <= 10), res.score);

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
