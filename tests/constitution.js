// يتحقّق من وحدة الدستور v3: المصنِّف والنطاقات والصلاحيات.
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const C = require(ROOT + 'js/constitution.js');

let ok = 0, bad = 0;
const t = (n, got, want) => {
  const p = Object.is(got, want);
  p ? ok++ : bad++;
  console.log((p ? 'PASS ' : 'FAIL ') + n + `  → ${JSON.stringify(got)} (متوقَّع ${JSON.stringify(want)})`);
};

// ═══ م.25 — التصنيف الآلي ═══
{
  // (أ) الثلاثة معاً
  t('أ: كبيرة + سيادية + 5 سنوات',
    C.classifyStock({ marketCapB: 6400, sovereignPct: 90, streakYears: 12 }).cat, 'A');
  t('أ: سقفها 15%', C.classifyStock({ marketCapB: 6400, sovereignPct: 90, streakYears: 12 }).cap, 15);
  // كبيرة لكن بلا ملكية سيادية كافية ⇒ لا تُرقّى إلى (أ)
  t('كبيرة بسيادية 10% لا تصير أ',
    C.classifyStock({ marketCapB: 300, sovereignPct: 10, streakYears: 8 }).cat, 'C');
  // (ب)
  t('ب: 50 مليار + 6 سنوات + تغطية 0.9',
    C.classifyStock({ marketCapB: 50, streakYears: 6, coverage: 0.9 }).cat, 'B');
  t('ب: سقفها 10%', C.CAT.B.cap, 10);
  // تغطية دون 0.85 ⇒ تنزل إلى (ج)
  t('ب بتغطية 0.7 تنزل ج',
    C.classifyStock({ marketCapB: 50, streakYears: 6, coverage: 0.7 }).cat, 'C');
  // (ج)
  t('ج: 5 مليار + 4 سنوات',
    C.classifyStock({ marketCapB: 5, streakYears: 4 }).cat, 'C');
  t('ج: سقفها 7%', C.CAT.C.cap, 7);
  // (د) بثلاثة مسارات مستقلة
  t('د: أقل من 2 مليار', C.classifyStock({ marketCapB: 0.53, streakYears: 9 }).cat, 'D');
  t('د: توزيع متصل 3 سنوات', C.classifyStock({ marketCapB: 500, sovereignPct: 90, streakYears: 3 }).cat, 'D');
  t('د: صندوق مُدار برسوم', C.classifyStock({ isManagedFund: true, marketCapB: 900, streakYears: 20 }).cat, 'D');
  t('د: سقفها 4%', C.CAT.D.cap, 4);
}

// ═══ م.20 و21 — الناقص يُعلَن ولا يُنزِّل الفئة ═══
{
  const r = C.classifyStock({ streakYears: 6 });                 // بلا قيمة سوقية
  t('ناقص ⇒ غير مصنَّف', r.known, false);
  t('ولا يُنزَّل إلى د', r.cat, null);
  t('ولا سقف مفروض', r.cap, null);
  t('ويُسمّى الناقص', r.missing.join(), 'القيمة السوقية');
  const r2 = C.classifyStock({ marketCapB: 300, streakYears: 8 }); // بلا ملكية سيادية
  t('كبيرة بلا سيادية ⇒ يطلبها', r2.missing.join(), 'الملكية السيادية');
  const r3 = C.classifyStock({ marketCapB: 50, streakYears: 6 });  // بلا تغطية
  t('متوسطة بلا تغطية ⇒ يطلبها', r3.missing.join(), 'تغطية التوزيع');
  // لكن الناقص لا يمنع حسم (د) إن كفى شرط واحد
  t('د تُحسم بشرط واحد رغم النقص',
    C.classifyStock({ marketCapB: 1 }).cat, 'D');
}

// ═══ م.26 — نطاق التعليق ═══
{
  t('دورة واحدة ⇒ يبقى', C.applyHysteresis('B', 'C', 1).cat, 'B');
  t('دورتان ⇒ ينتقل',   C.applyHysteresis('B', 'C', 2).cat, 'C');
  t('استثناء فوري يتجاوز التعليق', C.applyHysteresis('A', 'D', 0, true).cat, 'D');
  t('بلا تغيّر ⇒ لا حركة', C.applyHysteresis('B', 'B', 5).moved, false);
}

// ═══ م.28 — سقف القطاع متدرّج ═══
{
  t('20% ⇒ لا إجراء',        C.sectorBandOf(20).action,   'none');
  t('26% ⇒ تنبيه فقط',       C.sectorBandOf(26).action,   'notify');
  t('28% ⇒ وقف الإضافة',     C.sectorBandOf(28).action,   'stopAdd');
  t('33% ⇒ تصحيح إلزامي',    C.sectorBandOf(33).action,   'correct');
  t('25% حدّاً ⇒ لا إجراء',  C.sectorBandOf(25).action,   'none');
}

// ═══ م.48 — سقف القيمة ═══
{
  t('0.80 ⇒ فرصة',   C.valueBandOf(0.80).key, 'opportunity');
  t('1.00 ⇒ تجميع',  C.valueBandOf(1.00).key, 'accumulate');
  t('1.10 ⇒ عادل',   C.valueBandOf(1.10).key, 'fair');
  t('1.30 ⇒ تخفيف',  C.valueBandOf(1.30).key, 'trim');
  t('1.60 ⇒ تصفية',  C.valueBandOf(1.60).key, 'liquidate');
  // م.39 — التشتت العالي يوسّع النطاقات فينتقل السهم لمنطقة أرحم
  t('تشتت 70% يوسّع 20%', C.valueBandOf(1.30, 0.70).key, 'fair');   // 1.20×1.2 = 1.44
  t('ويُعلن أن الثقة منخفضة', C.valueBandOf(1.30, 0.70).confidence, 'low');
  t('تشتت 10% لا يوسّع', C.valueBandOf(1.30, 0.10).key, 'trim');
}

// ═══ م.49 — انحراف الوزن ═══
{
  t('انحراف 1% ⇒ لا إجراء',      C.deviationBandOf(1).action,    'none');
  t('انحراف −1% ⇒ لا إجراء',     C.deviationBandOf(-1).action,   'none');
  t('انحراف 2% ⇒ بالضخّ فقط',    C.deviationBandOf(2).action,    'pump');
  t('انحراف 5% ⇒ تصحيح نشط',     C.deviationBandOf(5).action,    'active');
}

// ═══ م.27 — الحد الأدنى للمركز ═══
{
  t('4% ⇒ مقبول',        C.positionSizeVerdict(4).key,   'ok');
  t('2.5% ⇒ مهلة دورتين', C.positionSizeVerdict(2.5).key, 'grace');
  t('1% ⇒ خروج',          C.positionSizeVerdict(1).key,   'exit');
}

// ═══ م.12 و55 — المنع ═══
{
  t('4339 ممنوع',  C.isBanned('4339'), true);
  t('1111 ممنوع',  C.isBanned('1111'), true);
  t('2222 مسموح',  C.isBanned('2222'), false);
  t('سدافكو لا تجميع', C.isNoAccumulate('2270'), true);
  t('…لكنها ليست ممنوعة كلياً', C.isBanned('2270'), false);
}

// ═══ م.31 — صلاحية تجاوز الهدف الفردي دورة واحدة ═══
{
  const now = new Date('2026-08-23T00:00:00Z');
  t('تجاوز عمره 30 يوماً ⇒ ساري',
    C.overrideStatus('2026-07-24T00:00:00Z', now).valid, true);
  t('تجاوز عمره 200 يوم ⇒ منقضٍ',
    C.overrideStatus('2026-02-04T00:00:00Z', now).expired, true);
  t('بلا تاريخ ⇒ لا يُعدّ سارياً',
    C.overrideStatus(null, now).valid, false);
  t('…ويُعلَن أن التاريخ مفقود',
    C.overrideStatus(null, now).unknownDate, true);
}

// ═══ م.2 — التعادل الحقيقي ═══
{
  // متوسط 100، استلمت 500 توزيعاً على 100 سهم ⇒ 95
  t('التعادل = المتوسط − التوزيع/سهم', C.trueBreakEven(100, 500, 100), 95);
  t('بلا أسهم ⇒ null', C.trueBreakEven(100, 500, 0), null);
}

// ═══ م.1 — المرحلة ═══
{
  t('2026 ⇒ تجميع',  C.portfolioPhase(new Date('2026-06-01')).key, 'accumulation');
  t('2044 ⇒ تجميع',  C.portfolioPhase(new Date('2044-12-01')).key, 'accumulation');
  t('2046 ⇒ انتقال', C.portfolioPhase(new Date('2046-01-01')).key, 'transition');
  t('2050 ⇒ سحب',    C.portfolioPhase(new Date('2050-01-01')).key, 'withdrawal');
}

// ═══ الثوابت الرقمية تطابق الدستور نصّاً ═══
{
  const fs = require('fs');
  const DOC = fs.readFileSync('C:/Users/User/retirement-portfolio/CLAUDE.md', 'utf8');
  t('م.7 الدخل 6,000 في النصّ', /6,000 ريال/.test(DOC), true);
  t('…والثابت يطابقه', C.GOAL_MONTHLY_INCOME, 6000);
  t('م.7 الضخ 8,000 في النصّ', /8,000 ريال/.test(DOC), true);
  t('…والثابت يطابقه', C.MONTHLY_INJECTION, 8000);
  t('م.29 الحجم 12–18 في النصّ', /\*\*12 – 18\*\*/.test(DOC), true);
  t('…والثابتان يطابقانه', `${C.SIZE_MIN}-${C.SIZE_MAX}`, '12-18');
  t('م.29 القطاعات 8 فأكثر', /\*\*8 فأكثر\*\*/.test(DOC), true);
  t('…والثابت يطابقه', C.SECTORS_MIN, 8);
  t('م.57 الحد الأدنى 2,000', /\*\*2,000 ريال\*\*/.test(DOC), true);
  t('…والثابت يطابقه', C.MIN_BUY_SAR, 2000);
  t('م.1 الأفق 2055', /\| \*\*الأفق\*\* \| 2055 \|/.test(DOC), true);
  t('…والثابت يطابقه', C.HORIZON_YEAR, 2055);
  t('السقوف 15/10/7/4 في م.25',
    /\*\*15%\*\*[\s\S]{0,400}\*\*10%\*\*[\s\S]{0,400}\*\*7%\*\*[\s\S]{0,400}\*\*4%\*\*/.test(DOC), true);
  t('…والثوابت تطابقها',
    C.CAT_ORDER.map(k => C.CAT[k].cap).join('/'), '15/10/7/4');
  t('الدستور 74 مادة', (DOC.match(/^## المادة /gm) || []).length, 74);
}

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
