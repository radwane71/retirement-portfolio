// ══════════════════════════════════════════════════════════════════════
// «المحرّك لا ينقض قرارك» — يُختبَر سلوكاً لا نصّاً
// ----------------------------------------------------------------------
// بلاغ المالك 2026-08-24: «شركات ظاهرة تصفية في محرّك القرار وهي في
// صفحة التقييمات العادلة مقرَّر أنها تجميع أو احتفاظ».
//
// سببان اجتمعا:
//   ① فشل بوابة الاستدامة كان يُنتج «تصفية» ويحترم «مراقبة» وحدها —
//      احترامٌ غير متماثل لقرار المالك.
//   ② م.27 (الحد الأدنى للمركز) كانت تُصفّي كل مركز دون 2% ولو كان
//      **قيد البناء** نحو هدف أعلى — وهي مكتوبة لبقايا مهملة لا لخطة.
//
// المخرَج الصحيح في الحالتين: **تعارض يُعلَن**، لا أمر بيع.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const SRC = fs.readFileSync(ROOT + 'js/decision-engine.js', 'utf8');

let ok = 0, bad = 0;
const t = (n, got, want) => { const p = Object.is(got, want); p ? ok++ : bad++;
  console.log((p ? 'PASS ' : 'FAIL ') + n + `  → ${JSON.stringify(got)} (متوقَّع ${JSON.stringify(want)})`); };

function grab(name) {
  const i = SRC.search(new RegExp('^(?:async )?function ' + name + '\\(', 'm'));
  if (i < 0) throw new Error('لم تُوجد: ' + name);
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
}

// ── تقييم سهم واحد بمدخلات مضبوطة ──
function evalOne({ taskType = null, sustain = 'fail', weight = 10, target = 12 } = {}) {
  const ctx = {
    console, Math, Object, Array, Number, String, Set, Date, isFinite, isNaN, parseFloat, JSON,
    formatNum: (v, d) => Number(v).toFixed(d ?? 2),
    formatSAR: v => String(Math.round(v)),
    engineCfg: {}, taskTypes: taskType ? { T: taskType } : {}, taskZones: {},
    zeroTargets: new Set(), valByTicker: {}, divByTicker: {}, priceAlerts: {},
    taskConflicts: {}, stockTargets: { T: { target_weight: target } },
    VAL_STALE_DAYS: 180, CAP_BUFFER: 0.75,
    stockFinancials: () => ({ xirr: null }),
    dividendTrendOf: () => null,
    valAgeDays: () => null,
    classifyAsset: () => 'general',
    assetTypeOf: () => 'general',
    specialNoteOf: () => null,
    priceZonesOf: () => null,
    triggerFor: () => null,
    sustainabilityOf: () => ({ status: sustain, reason: 'اختبار', signalKeys: ['coverageRed'],
                               confirm: { known: true, confirmed: true, need: 2, have: 2 } }),
    isBlueChip: () => false,
    categoryOf: () => ({ known: true, cat: 'B', short: 'ب', cap: 10, boost: 1.15 }),
    capOf: () => 10,
    numOf: v => (v == null || v === '' ? null : (isFinite(+v) ? +v : null)),
    fcfUnitsSuspect: () => null,
    FIXED_TRIGGERS: [], VAL_STALE_DAYS_HARD: 365, PRICE_DECISION_MAX_DAYS: 7,
    priceWatch: {}, alertThresholds: () => ({ green: 1.5, yellow: 3 }),
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ROOT + 'js/constitution.js', 'utf8'), ctx, { filename: 'constitution.js' });
  vm.runInContext(fs.readFileSync(ROOT + 'js/constitution-data.js', 'utf8'), ctx, { filename: 'constitution-data.js' });
  vm.runInContext(grab('evaluateHolding'), ctx);
  const h = { ticker: 'T', name: 'سهم', sector: 'الطاقة', shares: 100,
              avg_price: 50, current_price: 60, target_weight: target };
  const total = (100 * 60) / (weight / 100);
  return ctx.evaluateHolding(h, { totalValue: total, thresholds: { green: 1.5, yellow: 3 } });
}

// ═══ ① فشل الاستدامة مع قرار «تجميع» ⇒ تعارض لا تصفية ═══
{
  const r = evalOne({ taskType: 'accumulation', sustain: 'fail' });
  t('① «تجميع» + فشل استدامة ⇒ تعارض', r.action, 'conflict');
  t('① ولا تصفية',                      r.action === 'exit', false);
  t('① والسبب يذكر القرارين',
    /قرارك المسجّل|القراران متعاكسان/.test(r.reason), true);
}
// ═══ ② «احتفاظ» كذلك ═══
{
  const r = evalOne({ taskType: 'hold', sustain: 'fail' });
  t('② «احتفاظ» + فشل ⇒ تعارض', r.action, 'conflict');
}
// ═══ ③ «مراقبة» تبقى مراقبة (سلوك سابق لم يُكسَر) ═══
{
  const r = evalOne({ taskType: 'monitoring', sustain: 'fail' });
  t('③ «مراقبة» تبقى مراقبة', r.action, 'monitor');
}
// ═══ ④ بلا قرار مسجَّل ⇒ التصفية تصدر كما يفرض الدستور ═══
{
  const r = evalOne({ taskType: null, sustain: 'fail' });
  t('④ بلا قرار ⇒ تصفية (م.42)', r.action, 'exit');
}
// ═══ ⑤ «تصفية» صريحة منك تبقى تصفية ═══
{
  const r = evalOne({ taskType: 'liquidation', sustain: 'pass' });
  t('⑤ قرارك بالتصفية يُنفَّذ', r.action, 'exit');
}

// ═══ ⑥ م.27 — المركز الصغير قيد البناء لا يُصفَّى ═══
// يُفحَص على مصدر buildTargetPlan: الشرط موجود ويسبق مسار الخروج.
{
  const iGuard = SRC.indexOf('const ownerKeeps  = r.taskType');
  const iExit  = SRC.indexOf("if (pos.key === 'exit' && r.shares > 0 && r.value > 0)");
  t('⑥ حارس القرار موجود', iGuard > 0, true);
  t('⑥ ويسبق مسار الخروج', iGuard > 0 && iExit > iGuard, true);
  t('⑥ ويشمل «تجميع» و«احتفاظ»',
    /taskType === 'accumulation' \|\| r\.taskType === 'hold'/.test(SRC), true);
  // البناء نحو هدف ≥ الحدّ الأدنى يُعلَن ولا يُصفَّى
  t('⑥ والبناء نحو هدف محميّ',
    /building\s+= r\.hasTarget && r\.targetWeight >= POS_MIN_OK && r\.weight < r\.targetWeight/.test(SRC), true);
  t('⑥ والمخرَج تعارض لا خروج',
    /out\.conflicts\.push\(mk\(\{ sar: r\.value/.test(SRC), true);
}

// ═══ ⑦ التعارض لا يُقرأ أمرَ بيع في الواجهة ═══
{
  t('⑦ شارته ليست de-b-exit', /if \(r\.action === 'conflict'\) return 'de-b-monitor'/.test(SRC), true);
  t('⑦ وسطره يقول «لا أمر»', /لا أمر — <b>قراران متعاكسان/.test(SRC), true);
}

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
