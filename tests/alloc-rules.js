// يتحقّق من م.54 (نقاط الأولوية) وم.57 (حدّ الشراء وعدد الأسماء) وم.53/55.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const SRC = fs.readFileSync(ROOT + 'js/targets.js', 'utf8');
const C = require(ROOT + 'js/constitution.js');

let ok = 0, bad = 0;
const t = (n, got, want) => { const p = Object.is(got, want); p ? ok++ : bad++;
  console.log((p ? 'PASS ' : 'FAIL ') + n + `  → ${JSON.stringify(got)} (متوقَّع ${JSON.stringify(want)})`); };

function grab(name) {
  const i = SRC.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('لم تُوجد: ' + name);
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
}

// ═══ م.54 — معادلة النقاط ═══
function priorityCtx({ cats = {}, vals = {} } = {}) {
  const ctx = { console, Math, Object, Array, Number, String, isFinite, parseFloat, JSON,
    formatNum: (v, d) => Number(v).toFixed(d ?? 2),
    valuationLatest: vals,
    tgCategoryOf: tk => cats[tk] || { known: false, boost: 1, short: '؟' },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ROOT + 'js/constitution.js', 'utf8'), ctx, { filename: 'constitution.js' });
  vm.runInContext(grab('tgPriorityOf'), ctx);
  return ctx;
}
{
  const cats = {
    A: { known: true, boost: C.CAT.A.boost, short: 'أ' },
    D: { known: true, boost: C.CAT.D.boost, short: 'د' },
    U: { known: false, boost: 1, short: '؟' },
  };
  const vals = {
    A: { fairValueAvg: 100 },   // السعر 80 ⇒ 0.80× ⇒ 🟢🟢 فرصة (1.50)
    D: { fairValueAvg: 100 },
    U: { fairValueAvg: 100 },
  };
  const c = priorityCtx({ cats, vals });
  const P = (tk, gap, price) => c.tgPriorityOf(tk, gap, price);

  // العجز 5 نقاط · فئة أ (1.30) · منطقة فرصة (1.50) = 9.75
  t('م.54 أ في منطقة فرصة', +P('A', 5, 80).priority.toFixed(4), 9.75);
  // نفس العجز · فئة د (0.80) · فرصة (1.50) = 6.00
  t('م.54 د في منطقة فرصة', +P('D', 5, 80).priority.toFixed(4), 6);
  // ⚠️ الجوهر: الفئة تقلب الترتيب عند تساوي العجز والمنطقة
  t('م.54 الفئة تقلب الترتيب', P('A', 5, 80).priority > P('D', 5, 80).priority, true);
  // العجز 5 · أ · منطقة تجميع 1.00× ⇒ 1.20 = 7.80
  t('م.54 منطقة تجميع (1.20)', +P('A', 5, 100).priority.toFixed(4), 7.8);
  // العجز 5 · أ · منطقة عادل 1.10× ⇒ 0.80 = 5.20
  t('م.54 منطقة عادل (0.80)', +P('A', 5, 110).priority.toFixed(4), 5.2);
  // ⚠️ عجز أكبر في منطقة أسوأ يخسر أمام عجز أصغر في منطقة أفضل
  t('م.54 المنطقة تغلب العجز الأكبر',
    P('A', 5, 80).priority > P('A', 8, 110).priority, true);   // 9.75 > 8.32

  // م.21 — غير المصنَّف محايد 1.00 لا 0.80 (لا يُعاقَب بنقص بيانات)
  t('م.21 غير المصنَّف محايد', +P('U', 5, 80).priority.toFixed(4), 7.5);
  t('…وأعلى من فئة د', P('U', 5, 80).priority > P('D', 5, 80).priority, true);

  // بلا تقييم عادل ⇒ معامل محايد ويُعلَن
  const noVal = priorityCtx({ cats, vals: {} });
  t('بلا تقييم ⇒ معامل محايد', +noVal.tgPriorityOf('A', 5, 80).priority.toFixed(4), 6.5);
  t('…ويُعلَن في السبب', /بلا تقييم عادل/.test(noVal.tgPriorityOf('A', 5, 80).why), true);

  // م.55/4 — 🟡 و🔴 محظورتان
  t('م.55/4 منطقة تخفيف محظورة',  P('A', 5, 130).blockedByZone, true);   // 1.30×
  t('م.55/4 منطقة تصفية محظورة',  P('A', 5, 150).blockedByZone, true);   // 1.50×
  t('ومنطقة عادل مسموحة',         P('A', 5, 110).blockedByZone, false);
}

// ═══ م.57 — حدّ الشراء وعدد الأسماء ═══
{
  const ctx = { console, Math, Object, Array, Number, isFinite, JSON,
    formatSAR: v => Math.round(v).toLocaleString('en-US'),
    MIN_BUY_SAR: C.MIN_BUY_SAR, MAX_NAMES_PER_BATCH: C.MAX_NAMES_PER_BATCH };
  vm.createContext(ctx);
  vm.runInContext('const _batchCut = [];\n' + grab('applyExecutionLimits') + '\n' + grab('dropBelowMin')
                + '\nglobalThis.__cut = _batchCut;', ctx);

  const cands = [
    { ticker: 'A', name: 'أ', priority: 10, effScore: 1 },
    { ticker: 'B', name: 'ب', priority: 8,  effScore: 1 },
    { ticker: 'C', name: 'ج', priority: 6,  effScore: 1 },
    { ticker: 'D', name: 'د', priority: 4,  effScore: 1 },
  ];
  const keep = ctx.applyExecutionLimits(cands);
  t('م.57 يبقى اسمان فقط', keep.length, C.MAX_NAMES_PER_BATCH);
  t('…وهما الأعلى نقاطاً', keep.map(x => x.ticker).join(''), 'AB');
  t('…والباقي يُعلَن لا يُحذف', ctx.__cut.length, 2);
  t('…بسبب مذكور', /خارج أعلى 2 نقاطاً/.test(ctx.__cut[0].why), true);

  // الحدّ الأدنى
  ctx.__cut.length = 0;
  const allocs = [
    { ticker: 'A', name: 'أ', allocated: 5000 },
    { ticker: 'B', name: 'ب', allocated: 1200 },   // دون 2,000
    { ticker: 'C', name: 'ج', allocated: 2000 },   // عند الحدّ بالضبط ⇒ يمرّ
  ];
  const out = ctx.dropBelowMin(allocs);
  t('م.57 يسقط ما دون 2,000', out.map(x => x.ticker).join(''), 'AC');
  t('…والحدّ نفسه يمرّ', out.some(x => x.ticker === 'C'), true);
  t('…ويُعلَن السبب بالمبلغ', /دون الحدّ الأدنى/.test(ctx.__cut[0].why), true);
  // صفر لا يُعدّ سقوطاً بالحدّ (لم يُخصَّص له شيء أصلاً)
  ctx.__cut.length = 0;
  t('التخصيص صفر لا يُعلَن كسقوط',
    ctx.dropBelowMin([{ ticker: 'Z', allocated: 0 }]).length, 1);
}

// ═══ الوصل الفعلي في المحرّك ═══
{
  const has = re => re.test(SRC);
  t('التقييد يسبق حساب الأسهم',
    SRC.indexOf('applyExecutionLimits(candidates)') < SRC.indexOf('function buildRows'), true);
  t('وطرق التوزيع الثلاث تمرّ بالحدّ الأدنى',
    (SRC.match(/dropBelowMin\(/g) || []).length >= 4, true);
  t('والترتيب بنقاط م.54', has(/\(b\.priority - a\.priority\) \|\| \(b\.effScore - a\.effScore\)/), true);
  t('وم.53\\/4 تستبعد قائمة الخروج المؤجل', has(/!tgDeferredExits\[c\.ticker\]/), true);
  t('والقائمة تُقرأ من مفتاح محرّك القرار', has(/loadUserSetting\('deferred_exits_v1'\)/), true);
  t('واللافتة في المخرَج الرئيسي لا الخروج المبكر',
    SRC.indexOf('const _batchCut = []') < SRC.indexOf('${_batchCut.length ?'), true);
  t('ولافتة م.31 كذلك',
    SRC.indexOf('const expiredNote') < SRC.indexOf('${expiredNote}'), true);
}

// ═══ محرّك القرار يطبّق القاعدتين نفسيهما (لا يفترق عن محرّك التوازن) ═══
{
  const DE = fs.readFileSync(ROOT + 'js/decision-engine.js', 'utf8');
  const hasDE = re => re.test(DE);
  t('م.54 planPointsOf معرَّفة', hasDE(/function planPointsOf\(r, gapPct\)/), true);
  t('…وتُمرَّر مع كل أمر تجميع', hasDE(/points: planPointsOf\(r, gapPct\)/), true);
  t('…والترتيب بها لا برتبة الخطورة',
    hasDE(/out\.adds\.sort\(\(a, b\) => \(b\.points \|\| 0\) - \(a\.points \|\| 0\)\)/), true);
  t('م.57 حدّ الشراء 2,000 لا 500', hasDE(/gapPct > 0 && sar >= MIN_BUY_SAR/), true);
  t('…والبيع يبقى على حدّه الأدنى', hasDE(/gapPct < 0 && sar >= PLAN_MIN_SAR/), true);
  t('م.57 الدفعة اسمان', hasDE(/out\.adds\.length > MAX_NAMES_PER_BATCH/), true);
  t('…والمؤجَّل يخرج من «تحتاج»', hasDE(/out\.needed -= \(o\.sar \|\| 0\)/), true);
  t('…ويُعرَض ببنده', hasDE(/مؤجَّل للدفعة القادمة — م\.57/), true);
  // ⚠️ اسمان مختلفان لمعنيين مختلفين — لا يُدمجان
  t('نقاط م.54 ليست حقل priority', hasDE(/لا تخلطها بحقل/), true);
}

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
