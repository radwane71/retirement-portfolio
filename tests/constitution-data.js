// يتحقّق من طبقة بيانات الدستور: المواد 19 · 41 · 43 · 45 · 46 · 72.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const ctx = { console, Math, Object, Array, Number, String, Set, Date, isFinite, isNaN, parseInt, parseFloat, JSON };
ctx.module = { exports: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + 'js/constitution.js', 'utf8'), ctx, { filename: 'constitution.js' });
ctx.module = { exports: {} };
vm.runInContext(fs.readFileSync(ROOT + 'js/constitution-data.js', 'utf8'), ctx, { filename: 'constitution-data.js' });
const D = ctx.module.exports;
// ثوابت الدستور: `const` داخل vm لا يُعرَض على السياق، فنقرؤها عبر require
const C = require(ROOT + 'js/constitution.js');

let ok = 0, bad = 0;
const t = (n, got, want) => {
  const p = Object.is(got, want);
  p ? ok++ : bad++;
  console.log((p ? 'PASS ' : 'FAIL ') + n + `  → ${JSON.stringify(got)} (متوقَّع ${JSON.stringify(want)})`);
};

// ═══ م.19 — الوسم ═══
{
  const off = D.tv(12.5, 'official', '411_2222_2026-07-27');
  const ext = D.tv(12.5, 'external', 'أرقام');
  const der = D.tv(0.92, 'derived', 'DPS÷FCF');
  t('م.19 الرسمي يقود قرار وزن', D.canDriveWeight(off), true);
  t('م.19 المشتق يقود',          D.canDriveWeight(der), true);
  t('م.19 الخارجي لا يقود',      D.canDriveWeight(ext), false);
  t('م.19 المفقود لا يقود',      D.canDriveWeight(D.tv(null)), false);
  t('م.19 الفراغ يصير ❌',        D.tv('').tag, 'missing');
  t('م.19 الصفر رقم لا فراغ',    D.tv(0, 'official').tag, 'official');
  t('م.19 نصّ المفقود معلَن',    D.tvText(D.tv(null)), '❌ غير متوفر');
  t('م.19 نصّ الرسمي موسوم',     D.tvText(off), '✅ 12.5');
}

// ═══ م.18 — الحداثة ═══
{
  const now = new Date('2026-08-23T00:00:00Z');
  const fresh = D.tv(30, 'external', 'تداول', '2026-08-20');
  const old   = D.tv(30, 'external', 'تداول', '2026-07-01');
  t('م.18 سعر عمره 3 أيام طازج', D.tvStale(fresh, 'price', now).stale, false);
  t('م.18 سعر عمره 53 يوماً بائت', D.tvStale(old, 'price', now).stale, true);
  t('م.18 وهدف محلل 53 يوماً ما زال صالحاً', D.tvStale(old, 'analystTarget', now).stale, false);
  t('م.18 بلا تاريخ ⇒ لا حكم', D.tvStale(D.tv(1, 'official'), 'price', now).stale, false);
}

// ═══ م.41 — بوابة عمق التاريخ ═══
{
  const pay = y => y.map(x => ({ date: `${x}-03-15` }));
  t('عمق 4 سنوات ⇒ الحكم جائز', D.depthGate(pay([2023, 2024, 2025, 2026])).pass, true);
  t('عمق 3 سنوات ⇒ ممنوع الحكم', D.depthGate(pay([2024, 2025, 2026])).pass, false);
  t('…والسبب معلَن', /ممنوع الحكم بفشل الاستدامة/.test(D.depthGate(pay([2026])).why), true);
  t('تكرار السنة لا يزيد العمق', D.depthGate(pay([2026, 2026, 2026, 2026])).years, 1);
  t('الإدخال اليدوي يكمّل النقص', D.depthGate(pay([2026]), 6).pass, true);
  t('…ويأخذ الأكبر لا الأخير', D.depthGate(pay([2023, 2024, 2025, 2026]), 2).years, 4);
  t('بلا سجل ⇒ صفر', D.depthGate([]).years, 0);
}

// ═══ م.41 — نقاط الدوري مقابل البنيوي ═══
{
  const all = { externalCause: true, revenueStable: true, bridge3: true, streak5: true, marginStable: true, peersSuffer: true };
  t('6 نقاط ⇒ دوري',    D.cyclicalScore(all).key, 'cyclical');
  t('…والإجراء احتفظ',  D.cyclicalScore(all).action, 'hold');
  t('4 نقاط ⇒ دوري',    D.cyclicalScore({ externalCause: true, revenueStable: true, bridge3: true, streak5: true }).key, 'cyclical');
  t('3 نقاط ⇒ مختلط',   D.cyclicalScore({ externalCause: true, revenueStable: true, bridge3: true }).key, 'mixed');
  t('…والإجراء ربع فئة', D.cyclicalScore({ externalCause: true, revenueStable: true }).action, 'demoteQuarter');
  t('1 نقطة ⇒ بنيوي',   D.cyclicalScore({ externalCause: true }).key, 'structural');
  t('0 ⇒ بنيوي',        D.cyclicalScore({}).key, 'structural');
  t('…وينتقل للفلتر 1-ب', D.cyclicalScore({}).action, 'toFilter1b');
  t('القيم غير true لا تُحتسب', D.cyclicalScore({ externalCause: 'نعم', bridge3: 1 }).score, 0);
}

// ═══ م.43 — قاعدة التأكيد ═══
{
  const r = (...ps) => ps.map(p => ({ period: p }));
  // قاطعة: قراءة واحدة تكفي
  const dec = D.confirmationOf('divStopped', r('2026-Q2'));
  t('م.44 القاطعة تُنفَّذ من قراءة', dec.confirmed, true);
  t('…وحاجتها قراءة واحدة', dec.need, 1);
  // قوية: قراءتان
  t('القوية بقراءة ⇒ انتظار', D.confirmationOf('divCutOver25', r('2026-Q2')).confirmed, false);
  t('…وبقراءتين ⇒ تنفيذ',    D.confirmationOf('divCutOver25', r('2026-Q1', '2026-Q2')).confirmed, true);
  t('…والحاجة قراءتان',      D.confirmationOf('divCutOver25', []).need, 2);
  // متوسطة: ثلاث
  t('المتوسطة بقراءتين ⇒ انتظار', D.confirmationOf('navDrop', r('2026-Q1', '2026-Q2')).confirmed, false);
  t('…وبثلاث ⇒ تنفيذ', D.confirmationOf('navDrop', r('2025-Q4', '2026-Q1', '2026-Q2')).confirmed, true);
  // ضعيفة: مراقبة فقط مهما تكرّرت
  t('الضعيفة لا تُنفَّذ أبداً', D.confirmationOf('epsVolatile', r('2025-Q4', '2026-Q1', '2026-Q2')).confirmed, false);
  t('…وإجراؤها مراقبة', D.confirmationOf('epsVolatile', r('2026-Q1')).action, 'watch');
  // ⚠️ الجوهر: قراءتان من **الفترة نفسها** ليستا تأكيداً
  t('تكرار الفترة لا يؤكّد', D.confirmationOf('divCutOver25', r('2026-Q2', '2026-Q2')).confirmed, false);
  t('…والعدّاد يعدّ فترة واحدة', D.confirmationOf('divCutOver25', r('2026-Q2', '2026-Q2')).have, 1);
  // إشارة غير معرَّفة تُعلَن ولا تُخمَّن
  t('إشارة مجهولة تُعلَن', D.confirmationOf('لا-شيء', []).known, false);
  // معرّف الفترة من تاريخ
  t('periodKey مارس ⇒ Q1', D.periodKey('2026-03-31'), '2026-Q1');
  t('periodKey أبريل ⇒ Q2', D.periodKey('2026-04-01'), '2026-Q2');
  t('periodKey ديسمبر ⇒ Q4', D.periodKey('2026-12-31'), '2026-Q4');
}

// ═══ م.43 — تسجيل القراءات ═══
{
  let log = {};
  log = D.pushReading(log, 'A', 'divCutOver25', { date: '2026-05-10', value: -30 });
  log = D.pushReading(log, 'A', 'divCutOver25', { date: '2026-06-20', value: -32 }); // نفس الربع
  t('نفس الربع لا يُسجَّل مرتين', log.A.divCutOver25.length, 1);
  log = D.pushReading(log, 'A', 'divCutOver25', { date: '2026-08-10', value: -28 }); // Q3
  t('ربع جديد يُسجَّل', log.A.divCutOver25.length, 2);
  t('…فيكتمل التأكيد', D.confirmationOf('divCutOver25', log.A.divCutOver25).confirmed, true);
  t('السجل لا يُطفَر (لا تحوير)', Object.isFrozen(log) === false && log.A.divCutOver25[0].period, '2026-Q2');
}

// ═══ م.45 — بوابة الخسارة المحققة ═══
{
  // متوسط 100، استُلم 500 توزيعاً على 100 سهم ⇒ التعادل الحقيقي 95
  t('التعادل الحقيقي 95', D.deferredVerdict(96, 100, 500, 100).breakEven, 95);
  t('السعر فوق التعادل ⇒ خروج فوري', D.deferredVerdict(96, 100, 500, 100).action, 'exitNow');
  t('السعر تحته ⇒ خروج مؤجل',       D.deferredVerdict(90, 100, 500, 100).action, 'defer');
  // ⚠️ الجوهر: تجاهل التوزيعات يؤجّل خروجاً صار مربحاً
  t('بلا احتساب التوزيع لكان مؤجَّلاً', 96 < 100, true);
  t('…وباحتسابه صار خروجاً فورياً',    D.deferredVerdict(96, 100, 500, 100).action, 'exitNow');
  t('بيانات ناقصة ⇒ تُعلَن',           D.deferredVerdict(90, 0, 500, 100).action, 'unknown');
}

// ═══ م.45 — سعر الخروج المؤجل ═══
{
  t('بلا سند ⇒ مرفوض', D.validateExitPrice(17.5, 15.96, {}).ok, false);
  t('بسند واحد ⇒ مقبول', D.validateExitPrice(17.5, 15.96, { bookValue: 17.68 }).ok, true);
  // «هذا هروب لا قرار» — 22,400 ريال ضاعت على سبع حيازات
  t('السعر عند التعادل ⇒ مرفوض', D.validateExitPrice(15.96, 15.96, { bookValue: 17.68 }).ok, false);
  t('…والسبب مذكور',
    /ممنوع وضع سعر الخروج عند التعادل/.test(D.validateExitPrice(15.96, 15.96, { bookValue: 1 }).errors.join()), true);
  t('سعر غير صالح ⇒ مرفوض', D.validateExitPrice(0, 15.96, { bookValue: 17.68 }).ok, false);
  t('السند يُسمّى', D.validateExitPrice(17.5, 15.96, { analystTarget: 19 }).bases[0], 'هدف محلل حديث (≤ 90 يوماً)');
}

// ═══ م.45 — مراجعة سعر الخروج كل دورة ═══
{
  t('تحسّنت ⇒ +10%',        D.reviewExitPrice(20, 'improved').price, 22);
  t('ثابتة ⇒ بلا تغيير',    D.reviewExitPrice(20, 'stable').price, 20);
  t('🟠 ⇒ −15%',            D.reviewExitPrice(20, 'orange').price, 17);
  t('🔴×2 ⇒ إلى التعادل',   D.reviewExitPrice(20, 'redTwice').toBreakEven, true);
  t('انقطع التوزيع ⇒ إلغاء', D.reviewExitPrice(20, 'divStopped').cancel, true);
}

// ═══ م.45 — المراقبة الربعية ═══
{
  t('🟠 ثلاث قراءات ⇒ خروج خلال سنة',
    D.deferredQuarterlyCheck(['orange', 'orange', 'orange'], false).action, 'exitWithinYear');
  t('🔴 قراءتان ⇒ خروج خلال سنة',
    D.deferredQuarterlyCheck(['green', 'red', 'red'], false).action, 'exitWithinYear');
  t('🟠 قراءتان ⇒ يبقى مؤجَّلاً',
    D.deferredQuarterlyCheck(['orange', 'orange'], false).action, 'hold');
  t('انقطاع التوزيع ⇒ م.46 مباشرة',
    D.deferredQuarterlyCheck(['green'], true).action, 'article46');
}

// ═══ م.46 — الاستثناء الوحيد ═══
{
  t('الشروط الثلاثة ⇒ تسقط القاعدة المطلقة', D.article46Applies(true, true, true).applies, true);
  t('انقطاع بلا تآكل ⇒ لا تسقط',            D.article46Applies(true, true, false).applies, false);
  t('تآكل بلا انقطاع ⇒ لا تسقط',            D.article46Applies(false, true, true).applies, false);
  t('…ويُذكر أن م.11 نافذة',
    /لا بيع تحت التكلفة/.test(D.article46Applies(false, false, false).why), true);
}

// ═══ م.72 — سجل التدقيق ═══
{
  const e = D.auditEntry({
    ticker: '2310', article: 'م.45', signal: 'equityErosion6', decision: 'خروج مؤجل عند 17.50',
    executed: false,
    inputs: [
      { name: 'السعر', tv: D.tv(13.18, 'official', '411_2310_2026-07-27') },
      { name: 'الدفترية', tv: D.tv(17.68, 'derived', 'حقوق الملكية ÷ الأسهم') },
      { name: 'هدف محلل', tv: D.tv(19, 'external', 'أرقام') },
    ],
  });
  t('يسجّل المادة',   e.article, 'م.45');
  t('ويسجّل التنفيذ', e.executed, false);
  t('ويحفظ المصدر',   e.inputs[0].source, '411_2310_2026-07-27');
  // م.66/2 — يُبرز أي مدخل لا يجوز أن يقود قرار وزن
  t('يرصد المدخل الضعيف',      e.weakInputs.join(), 'هدف محلل');
  t('ولا يرصد الرسمي والمشتق', e.weakInputs.length, 1);
  // قصّ السقف
  let log = [];
  for (let i = 0; i < D.AUDIT_MAX + 5; i++) log = D.pushAudit(log, { i });
  t('السجل لا يتجاوز السقف', log.length, D.AUDIT_MAX);
  t('…ويُقصّ الأقدم لا الأحدث', log[log.length - 1].i, D.AUDIT_MAX + 4);
}

// ═══ الاتّساق مع نصّ الدستور ═══
{
  const DOC = fs.readFileSync(ROOT + 'CLAUDE.md', 'utf8');
  t('م.41 تشترط أربع سنوات', /لأربع سنوات على الأقل/.test(DOC), true);
  t('…والثابت يطابقها', D.DEPTH_MIN_YEARS, 4);
  t('م.41 نقاطها ستّ', D.CYCLICAL_MARKS.length, 6);
  t('م.44 الإشارات القاطعة خمس', C.DECISIVE_SIGNALS.length, 5);
  t('…وعددها في الشيفرة يطابق',
    Object.values(D.SIGNAL_CLASS).filter(x => x.cls === 'decisive').length, 5);
  t('م.43 التأكيد 1/2/3',
    `${C.CONFIRM_READS.decisive}/${C.CONFIRM_READS.strong}/${C.CONFIRM_READS.medium}`, '1/2/3');
  t('م.45 تمنع السعر عند التعادل', /ممنوع وضع سعر خروج عند التعادل بالضبط/.test(DOC), true);
}

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
