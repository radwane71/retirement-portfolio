// ═══════════════════════════════════════════════════════════════════════
// درجة تقييم المحفظة — منهجية الملحق (ب)
// ───────────────────────────────────────────────────────────────────────
// كل عتبة هنا مربوطة بمادة، فالاختبار يتحقّق من المادة لا من الرقم: «خمس
// سنوات متصلة = الدرجة الكاملة» لأنها عتبة الفئتين (أ) و(ب) في م.25،
// و«عائد 5.5%» لأنه العائد الذي تبني عليه م.7 محفظة الهدف.
//
// والفخّ الأكبر: أن يأخذ البُعد الناقص بياناته صفراً. الصفر حكمٌ والغياب
// ليس حكماً (م.20)، وسهمٌ بلا سلسلة في تداول لا يُعاقَب عليه المالك (م.21).
// ═══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const A = require(path.join(ROOT, 'js', 'appendix-b.js'));

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.log('  ✗ ' + name)); };
const near = (a, b, e = 1e-6) => a != null && Math.abs(a - b) <= e;

// ── الأوزان هي أوزان الدستور حرفياً ──
const W = A.APX_B_WEIGHTS;
t('ستة أبعاد', W.length === 6);
t('مجموع الأوزان = 100%', near(W.reduce((s, d) => s + d.weight, 0), 1));
const wOf = k => (W.find(d => d.key === k) || {}).weight;
t('استمرارية التوزيع 30%', near(wOf('continuity'), 0.30));
t('العائد التوزيعي 20%',   near(wOf('yield'), 0.20));
t('جودة المكونات 15%',     near(wOf('quality'), 0.15));
t('نمو التوزيع 15%',       near(wOf('growth'), 0.15));
t('التنوع الحقيقي 15%',    near(wOf('diversity'), 0.15));
t('التسعير عند الدخول 5%', near(wOf('entry'), 0.05));
t('الدرجة المسجَّلة 7.2',   A.APX_B_RECORDED === 7.2);

// ── العائد التوزيعي: 5.5% كاملة (م.7)، وصفر عند 2% ──
const yOf = pct => A.apxYield([{ ticker: 'X', value: 100, yieldPct: pct }]).score;
t('عائد 5.5% ⇒ كاملة (م.7)', near(yOf(5.5), 1));
t('عائد فوق 5.5% لا يتجاوز الكاملة', near(yOf(9), 1));
t('عائد 2% ⇒ صفر',          near(yOf(2), 0));
t('عائد 1% لا ينزل تحت الصفر', near(yOf(1), 0));
t('عائد 3.75% ⇒ نصف',       near(yOf(3.75), 0.5, 1e-9));
const yMissing = A.apxYield([{ ticker: 'X', value: 100, yieldPct: null }]);
t('سهم بلا عائد ⇒ غير مُقيَّم لا صفر (م.20)', yMissing.score === null && yMissing.missing === 1);

// ── الترجيح بالقيمة السوقية لا بالعدد ──
const mixed = A.apxYield([
  { ticker: 'A', value: 900, yieldPct: 5.5 },   // كاملة، 90% من المحفظة
  { ticker: 'B', value: 100, yieldPct: 2.0 },   // صفر، 10%
]);
t('الترجيح بالقيمة: 0.9 لا 0.5', near(mixed.score, 0.9, 1e-9));

// ── التنوع الحقيقي (م.28 · م.29) ──
const mk = (n, sec, val) => Array.from({ length: n }, (_, i) =>
  ({ ticker: 'T' + i, sector: sec ? sec(i) : 'س' + (i % 8), value: val ? val(i) : 100 }));

const good = A.apxDiversity(mk(14, i => 'قطاع' + (i % 8), null));
t('14 سهماً متوازنة في 8 قطاعات ⇒ درجة عالية', good.score > 0.9);
t('ويُعلَن العدد الفعّال', /عدد فعّال/.test(good.detail));

const concentrated = A.apxDiversity([
  { ticker: 'A', sector: 'س1', value: 900 },
  ...mk(9, () => 'س2', () => 11),
]);
t('محفظة أحدُ أسهمها 90% ⇒ عدد فعّال منخفض', concentrated.score < 0.5);

// م.28: أكبر قطاع ≤25% كاملة، وصفر عند 30%
const sec25 = A.apxDiversity([
  { ticker: 'A', sector: 'س1', value: 25 }, { ticker: 'B', sector: 'س2', value: 25 },
  { ticker: 'C', sector: 'س3', value: 25 }, { ticker: 'D', sector: 'س4', value: 25 },
]);
const sec50 = A.apxDiversity([
  { ticker: 'A', sector: 'س1', value: 50 }, { ticker: 'B', sector: 'س2', value: 25 },
  { ticker: 'C', sector: 'س3', value: 25 },
]);
t('تركيز قطاعي أعلى ⇒ درجة أدنى', sec25.score > sec50.score);
t('بلا حيازات ⇒ غير مُقيَّم', A.apxDiversity([]).score === null);

// ── جودة المكونات: العرض بالمناطق لا بمتوسط النسب ──
// تغطيةٌ سالبة واحدة تسحب المتوسط إلى رقمٍ لا يصف أي سهم.
const qMixed = A.apxQuality([
  { ticker: 'ZZ1', value: 100 }, { ticker: 'ZZ2', value: 100 },
]);
t('سهمان خارج تداول ⇒ غير مُقيَّم (م.21)', qMixed.score === null && qMixed.missing === 2);
t('ويشرح مناطق م.42-أ', /م.42-أ/.test(qMixed.why));
t('ويُعلن أنه لا يأخذ متوسط نسب', /لا متوسط نسب/.test(qMixed.why));

// ── التسعير عند الدخول: نطاقات م.48 حرفياً ──
const eOf = ratio => A.apxEntry([{ ticker: 'X', amount: 100, ratio }]).score;
t('0.80 من العادلة ⇒ فرصة، كاملة (م.48)', near(eOf(0.80), 1));
t('0.85 حدّاً ⇒ كاملة',                    near(eOf(0.85), 1));
t('1.00 ⇒ تجميع 0.85',                     near(eOf(1.00), 0.85));
t('1.15 ⇒ عادل 0.60',                      near(eOf(1.15), 0.60));
t('1.30 ⇒ تخفيف 0.30',                     near(eOf(1.30), 0.30));
t('1.50 ⇒ تصفية صفر',                      near(eOf(1.50), 0));
t('بلا صفقات ⇒ غير مُقيَّم لا صفر', A.apxEntry([]).score === null);
// المرجَّح بالمبلغ = (0.8×9000 + 2×1000) ÷ 10000 = 0.92 ⇒ نطاق «تجميع» 0.85.
// وبالعدد وحده لكان 1.40 ⇒ حدّ «تخفيف» 0.30 — والفرق هو كل الفرق.
const eW = A.apxEntry([{ ticker: 'A', amount: 9000, ratio: 0.8 }, { ticker: 'B', amount: 1000, ratio: 2 }]);
t('الدخول مرجَّح بالمبلغ لا بالعدد', near(eW.score, 0.85));
t('ونسبته المعروضة 92%', /92% من العادلة/.test(eW.detail));

// ── التقنين: البُعد غير المُقيَّم يخرج من البسط والمقام (م.20) ──
// محفظة العائد فيها كامل وحده، وكل ما عداه غير مُقيَّم ⇒ الدرجة 10 لا 2
const rowsY = [{ ticker: 'ZZZZ', sector: 'س', value: 100, yieldPct: 5.5 }];
const onlyYield = A.computeAppendixB(rowsY, []);
const assessed = onlyYield.parts.filter(p => p.assessed).map(p => p.key);
t('العائد والتنوع مُقيَّمان', assessed.includes('yield') && assessed.includes('diversity'));
t('الاستمرارية غير مُقيَّمة لرمزٍ خارج تداول (م.21)', !assessed.includes('continuity'));
t('والدخول غير مُقيَّم بلا صفقات',                    !assessed.includes('entry'));
t('الأبعاد غير المُقيَّمة تُسمّى',  onlyYield.unassessed.length > 0);
t('الأوزان المقنَّنة أقل من 100%',  onlyYield.weighedPct < 100);
t('والدرجة تبقى من عشرة',          onlyYield.score > 0 && onlyYield.score <= 10);

// الفخّ: لو أخذ البُعد الغائب صفراً لهبطت درجة محفظةٍ مثاليةٍ فيما قِيس
// إلى 3.5 من 10. المقياس يجب أن يُقنَّن على ما قِيس، فتبقى 10.
const perfect = A.computeAppendixB(
  Array.from({ length: 16 }, (_, i) =>
    ({ ticker: 'Z' + i, sector: 'قطاع' + (i % 8), value: 100, yieldPct: 5.5 })), []);
t('كل المُقيَّم كامل ⇒ لا يُخصَم للغائب', perfect.score > 9.5);
t('ولولا التقنين لهبطت إلى ~3.5',
  perfect.parts.filter(p => p.assessed).reduce((s, p) => s + p.points, 0) < 4);

// المقارنة بالمسجَّل تُعرض ولا تُبتلع
t('يُرجع الدرجة المسجَّلة للمقارنة', perfect.recorded === 7.2);

// ── apxLin ──
t('apxLin مقصوص أعلى', near(A.apxLin(20, 0, 10), 1));
t('apxLin مقصوص أدنى', near(A.apxLin(-5, 0, 10), 0));
t('apxLin وسط',        near(A.apxLin(5, 0, 10), 0.5));
t('apxLin بلا قيمة ⇒ null', A.apxLin(null, 0, 10) === null);
t('apxLin بحدّين متساويين ⇒ null', A.apxLin(5, 3, 3) === null);

// ── الوصل بالصفحة ──
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const html = fs.readFileSync(path.join(ROOT, 'portfolio-rating.html'), 'utf8').split(CR + LF).join(LF);
t('السكربت محمَّل',        /js\/appendix-b\.js/.test(html));
t('الحاوية موجودة',        /id="apxb-body"/.test(html));
t('تُرسم عند الإقلاع',      /renderAppendixB\(\);/.test(html));
t('نافذة الشرح موصولة',    /showAppendixBInfo\(\)/.test(html));
t('يُميَّز الاستبيان اليدوي عنها', /لا علاقة له بدرجة الملحق ب/.test(html));
t('يعرض المسجَّلة والمحسوبة', /المسجَّلة في الدستور/.test(html) && /المحسوبة من بياناتك/.test(html));
t('ولا يكتب في الدستور',   !/APX_B_RECORDED\s*=/.test(html));

// الاصطلاح مُعلَن لا ممرَّر كنصّ
const mod = fs.readFileSync(path.join(ROOT, 'js', 'appendix-b.js'), 'utf8');
t('نمو التوزيع مُعلَن اصطلاحاً', /اصطلاح مُعلَن لا نصّ/.test(mod));
t('ويُذكر أن الدستور بلا عتبة له', /الدستور لا يضع عتبةً لنمو التوزيع/.test(mod));
const growthWhy = A.apxGrowth([{ ticker: 'ZZZZ', value: 100 }]).why;
t('والاصطلاح يظهر في مخرَج البُعد نفسه', /اصطلاح/.test(growthWhy));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
