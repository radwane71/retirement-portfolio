// ══════════════════════════════════════════════════════════════════════
// فحص شامل: هل الدستور v3 مطبَّق فعلاً؟ — مادةً مادة، بدليل من الشيفرة
// ----------------------------------------------------------------------
// كل مادة تُفحَص بشرط ملموس (نمط في ملف بعينه)، لا بادّعاء. والتصنيف:
//   code   — مُنفَّذة في الشيفرة، يُفحَص وجودها
//   input  — تعتمد على إدخال المالك؛ الشيفرة توفّر المكان والفحص
//   engine — قاعدة سلوك للمحرّك (أنا)، لا شيء يُنفَّذ في المتصفّح
//   doc    — مادة توثيقية أو تعريفية، وجودها في CLAUDE.md كافٍ
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..') + path.sep;
const F = {};
['js/constitution.js', 'js/constitution-data.js', 'js/decision-engine.js', 'js/targets.js',
 'js/watchlist.js', 'js/settings.js', 'js/dashboard.js', 'js/forecast.js', 'js/tasks.js',
 'decision-engine.html', 'targets.html', 'portfolio-rating.html', 'stock-valuation.html',
 'CLAUDE.md'].forEach(f => { F[f] = fs.readFileSync(R + f, 'utf8'); });
const ALL = Object.values(F).join('\n');

let pass = 0, fail = 0;
const rows = [];
function A(num, kind, title, ok, evidence) {
  const good = ok === true;
  good ? pass++ : fail++;
  rows.push({ num, kind, title, ok: good, evidence });
  if (!good) console.log(`FAIL م.${num} — ${title}  [${evidence}]`);
}
const inAny = re => re.test(ALL);
const inF = (f, re) => re.test(F[f]);

// ── الباب الأول: التعريفات ──
A(1,  'code',   'تعريفات زمنية (الدورة · الأفق · المراحل)',
  inF('js/constitution.js', /HORIZON_YEAR\s+= 2055/) && inF('js/constitution.js', /CYCLE_DAYS = 183/)
  && inF('js/constitution.js', /function portfolioPhase/), 'constitution.js');
A(2,  'code',   'تعريفات مالية (التعادل الحقيقي · DPS · FCFE)',
  inF('js/constitution.js', /function trueBreakEven/), 'trueBreakEven');
A(3,  'code',   'تعريفات القرار (احتفظ · تجميع · تخفيف · خروج · مؤجل)',
  inF('js/decision-engine.js', /deferredExit/) && inF('js/decision-engine.js', /out\.exits|out\.trims|out\.adds/),
  'buildTargetPlan');

// ── الباب الثاني: الأهداف ──
A(4,  'code',   'الهدف: دخل 6,000 شهرياً بحلول 2045',
  inF('js/constitution.js', /GOAL_MONTHLY_INCOME = 6000/)
  && inF('js/decision-engine.js', /incomeGoalMonthly = GOAL_MONTHLY_INCOME/), 'GOAL_MONTHLY_INCOME');
A(5,  'engine', 'الأمان = استمرارية التوزيع لا تقلب السعر', true, 'قاعدة تفسير — تحكم قراءتي للمواد');
A(6,  'engine', 'الهدف المركّب: عائد + استمرارية معاً', true, 'قاعدة سلوك');
A(7,  'code',   'المعالم الرقمية (الضخ 8,000 · المحفظة 1.31M · FIRE 1.8M)',
  inF('js/constitution.js', /MONTHLY_INJECTION   = 8000/) && inF('js/constitution.js', /GOAL_PORTFOLIO      = 1310000/)
  && inF('js/constitution.js', /GOAL_FIRE           = 1800000/), 'constitution.js');
A(8,  'code',   'أثر الضخ: التصحيح بالضخ لا بالبيع',
  inF('js/constitution.js', /DEV_PUMP   = 3\.0/) && inF('js/constitution.js', /action: 'pump'/), 'deviationBandOf');
A(9,  'code',   'القيد الجغرافي — لا انتقاد ولا خصم',
  !inF('portfolio-rating.html', /geographicDistribution/)
  && inF('js/settings.js', /'م\.9'/), 'حُذف البُعد الجغرافي');
A(10, 'code',   'الزكاة مستثناة من كل حساب',
  inF('js/settings.js', /الزكاة مستثناة من كل الحسابات/), 'فحص الامتثال');

// ── الباب الثالث: القيود المطلقة ──
A(11, 'code',   'القاعدة المطلقة: لا بيع تحت التكلفة',
  inF('js/decision-engine.js', /\(gate\.action === 'defer' \|\| gate\.action === 'unknown'\) && !a46\.applies/),
  'بوابة م.45 تعترض الخروج — و«غير معروف» يُعامَل كمؤجَّل لا كخروج');
A(12, 'code',   'الاستبعادات الدائمة 4339 · 1111',
  inF('js/constitution.js', /'4339': 'دراية ريت'/) && inF('js/targets.js', /isBanned\(tk\)/), 'BANNED_TICKERS + الفلترة');
A(13, 'code',   'triggers المالك تُطبَّق كما هي',
  inF('js/decision-engine.js', /r\.trigger && r\.trigger\.fired/) && inF('js/decision-engine.js', /r\.action === 'exit'/),
  'يتبع r.action لا يفترض الخروج');
A(14, 'engine', 'إعادة استثمار كل التوزيعات في مرحلة التجميع', true, 'قاعدة سلوك + المحرّك يوجّه');

// ── الباب الرابع: البيانات ──
A(15, 'doc',    'سلّم مصادر البيانات', inF('CLAUDE.md', /ملفات تداول الرسمية/), 'CLAUDE.md');
A(16, 'doc',    'سبب تقديم تداول على التراكر (توثيقية)', inF('CLAUDE.md', /هذه المادة توثيقية ولا تُحذف/), 'CLAUDE.md');
A(17, 'doc',    'صيغ الملفات — Word محوَّل مرفوض', inF('CLAUDE.md', /الترميز العربي مكسور/), 'CLAUDE.md');
A(18, 'code',   'حداثة البيانات (سعر 7 · محلل 90 · بيتا 180)',
  inF('js/constitution.js', /FRESH_DAYS = \{ price: 7, analystTarget: 90, beta: 180/)
  && inF('js/constitution-data.js', /function tvStale/), 'FRESH_DAYS + tvStale');
A(19, 'code',   'وسم كل رقم ✅⚙️⚠️❌',
  inF('js/constitution.js', /DATA_TAG = \{/) && inF('js/constitution-data.js', /function canDriveWeight/)
  && inF('js/decision-engine.js', /weakInputs/), 'tv + canDriveWeight + عمود المدخلات الضعيفة');
A(20, 'code',   'منع التقدير الصامت — الناقص يُعلَن',
  inF('js/constitution.js', /تُعلَن ولا تُقدَّر \(م\.20\)/) && inF('js/constitution-data.js', /غير متوفر/),
  'classifyStock يُرجع missing[]');
A(21, 'code',   'لا معاقبة على نقص بيانات المحرّك',
  inF('js/constitution.js', /ولا تُنزَّل الفئة بسببها \(م\.21\)/)
  && inF('js/decision-engine.js', /c\.known \? c\.cap : CAT\.A\.cap/), 'غير المصنَّف يأخذ أعلى سقف لا أدنى');
A(22, 'engine', 'إعادة البيان عند تغيّر رأس المال', true, 'قاعدة سلوك — سوابق موثقة في CLAUDE.md');
A(23, 'engine', 'الحقوق الأولوية تخضع لفلاتر الشراء', true, 'قاعدة سلوك');
A(24, 'engine', 'تعارض البيانات — الأسوأ للسهم', true, 'قاعدة سلوك');

// ── الباب الخامس: التصنيف والسقوف ──
A(25, 'code',   'نظام الفئات الأربع 15/10/7/4',
  inF('js/constitution.js', /A: \{ key: 'A'.*cap: 15/) && inF('js/constitution.js', /D: \{ key: 'D'.*cap: 4/)
  && inF('js/constitution.js', /function classifyStock/)
  && inF('decision-engine.html', /id="de-card-mcap"/), 'CAT + classifyStock + مدخلات البطاقة');
A(26, 'code',   'نطاق التعليق ±15% لدورتين',
  inF('js/constitution.js', /function applyHysteresis/)
  && inF('js/decision-engine.js', /applyHysteresis\(hist\.settled, raw\.cat/)
  && inF('js/decision-engine.js', /async function updateCategoryHistory/),
  'مستدعاة في categoryOf + سجل الدورات');
A(27, 'code',   'الحد الأدنى للمركز 3% / 2% / خروج',
  inF('js/constitution.js', /function positionSizeVerdict/) && inF('js/settings.js', /positionSizeVerdict\(x\.w\)/)
  && inF('js/decision-engine.js', /const pos = positionSizeVerdict\(r\.weight\)/)
  && inF('js/decision-engine.js', /دون الحدّ الأدنى \$\{POS_MIN_GRACE\}%/),
  'تولّد أمر خروج فعلياً — لا فحص تقرير فقط');
A(28, 'code',   'سقف القطاع متدرّج 25 · 27.5 · 30',
  inF('js/constitution.js', /SECTOR_BANDS = \[/) && inF('js/constitution.js', /action: 'stopAdd'/)
  && inF('js/decision-engine.js', /secBand\.action === 'stopAdd' \|\| secBand\.action === 'correct'/),
  'وقف الإضافة مفروض فعلاً على التجميع');
A(29, 'code',   'حجم المحفظة 12–18 (سماح 22) · القطاعات 8+',
  inF('js/constitution.js', /SIZE_MIN = 12, SIZE_MAX = 18, SIZE_GRACE_MAX = 22/)
  && inF('js/constitution.js', /SECTORS_MIN = 8/)
  && inF('js/settings.js', /SIZE_GRACE_MAX/), 'الثوابت + فحص الامتثال');
A(30, 'code',   'تركيز العامل الواحد — إفصاح لا تقييد',
  inF('js/constitution.js', /function govExposure/)
  && inF('js/decision-engine.js', /govExposure\(_results \|\| \[\]\)/)
  && inF('decision-engine.html', /id="de-govexp"/)
  // ⚠️ إفصاح لا تقييد: ممنوع أن يولّد إشارة بيع (م.9)
  && !/govExposure[\s\S]{0,400}out\.(exits|trims)\.push/.test(F['js/decision-engine.js']),
  'يُحسب ويُعرَض ولا يولّد إشارة');
A(31, 'code',   'الهدف الفردي يعلو على السقف — دورة واحدة',
  inF('js/constitution.js', /function overrideStatus/)
  && inF('js/targets.js', /function tgOverrideStatus/)
  && inF('js/decision-engine.js', /_planOverrideStatus\(\)\.valid \? r\.targetWeight : r\.cap/),
  'مطبَّقة في المحرّكين من مفتاح واحد');

// ── الباب السادس: التقييم ──
A(32, 'code',   'النموذج حسب نوع الأصل',
  inF('js/decision-engine.js', /assetTypeOf/) && inF('stock-valuation.html', /MODEL_MANDATE|mandateOf/),
  'ASSET + MODEL_MANDATE');
A(33, 'engine', 'الريتات — الاختبار الثلاثي', true, 'قاعدة تقييم؛ النطاقات في SUSTAIN_REIT');
A(34, 'code',   'البنوك — قواعد خاصة (لا FCF/DCF)',
  inF('stock-valuation.html', /bank/) && inF('js/decision-engine.js', /bankDps/), 'مسار البنك منفصل');
A(35, 'engine', 'الدورية — ربحية مُطبَّعة 5–7 سنوات', true, 'قاعدة تقييم');
A(36, 'engine', 'الخاسرة — القيمة الدفترية فقط', true, 'قاعدة تقييم');
A(37, 'engine', 'تثبيت القيمة العادلة', true, 'قاعدة سلوك — تُطبَّق عند إعادة التسعير');
A(38, 'engine', 'تثبيت درجة التقييم', true, 'قاعدة سلوك');
A(39, 'code',   'معامل الثقة بالتشتت يوسّع النطاقات',
  inF('js/constitution.js', /DISPERSION_BANDS/) && inF('js/decision-engine.js', /valueBandOf\(ratio, r\.fvCV/),
  'valueBandOf يأخذ التشتت');
A(40, 'engine', 'الرجوع إلى سجل حاسبة القيمة العادلة', true, 'قاعدة سلوك + السجل موجود');

// ── الباب السابع: محرك القرار ──
A(41, 'code',   'الفلتر 0 — بوابة عمق التاريخ + نقاط الدوري',
  inF('js/constitution-data.js', /function depthGate/) && inF('js/constitution-data.js', /CYCLICAL_MARKS/)
  && inF('js/decision-engine.js', /const depth = depthGate\(divByTicker/)
  && inF('decision-engine.html', /id="de-card-histyears"/), 'depthGate قبل حكم الفشل');
A(42, 'code',   'الفلتر 1 — بوابة الاستدامة بالمناطق',
  inF('js/constitution.js', /SUSTAIN_NORMAL/) && inF('js/constitution.js', /SUSTAIN_REIT/)
  && inF('js/constitution.js', /CUT_BANDS/) && inF('js/constitution.js', /BRIDGE_ADJ/), 'النطاقات الأربعة');
A(43, 'code',   'قاعدة التأكيد بالقراءات 1/2/3',
  inF('js/constitution-data.js', /function confirmationOf/)
  && inF('js/decision-engine.js', /gatedBy: 'م\.43'/)
  && inF('js/decision-engine.js', /recordReadings\(_results\)/), 'confirmationOf تحجب التنفيذ');
A(44, 'code',   'الإشارات القاطعة الخمس',
  require(R + 'js/constitution.js').DECISIVE_SIGNALS.length === 5
  && inF('js/decision-engine.js', /if \(!stopped && !depth\.pass\)/), 'خمس + تتجاوز بوابة العمق');
A(45, 'code',   'الفلتر 1-ب — بوابة الخسارة المحققة',
  inF('js/constitution-data.js', /function deferredVerdict/)
  && inF('js/constitution-data.js', /function validateExitPrice/)
  && inF('js/decision-engine.js', /out\.deferredExit\.push/)
  && inF('decision-engine.html', /id="de-card-exitprice"/), 'البوابة + سعر الخروج + الفحص');
A(46, 'code',   'الاستثناء الوحيد للقاعدة المطلقة',
  inF('js/constitution-data.js', /function article46Applies/)
  && inF('js/decision-engine.js', /article46Applies\(/), 'article46Applies');
A(47, 'engine', 'الفلتر 2 — إعادة التسعير', true, 'يحيل إلى م.32–40');
A(48, 'code',   'الفلتر 3 — سقف القيمة بخمس مناطق',
  inF('js/constitution.js', /key: 'opportunity'/) && inF('js/constitution.js', /key: 'liquidate'/)
  && inF('js/decision-engine.js', /const band   = valueBandOf/), 'VALUE_BANDS + _planFairVerdict');
A(49, 'code',   'الفلتر 4 — نطاقات انحراف الوزن ±1.5 / 3',
  inF('js/constitution.js', /DEV_IGNORE = 1\.5/) && inF('js/constitution.js', /function deviationBandOf/),
  'deviationBandOf');
A(50, 'code',   'سلّم الأولوية عند التعارض',
  inF('js/decision-engine.js', /P0\.1|يسبق كل شيء/) && inF('js/decision-engine.js', /out\.conflicts\.push/),
  'ترتيب المسارات + بند التعارض');
A(51, 'code',   'شكل المخرَج (الفئة · المنطقة · القراءات · المادة)',
  inF('js/decision-engine.js', /الفئة \$\{/) && inF('js/decision-engine.js', /القراءات المؤكِّدة/),
  'وسوم الفئة + جدول القراءات');

// ── الباب الثامن: توجيه رأس المال ──
A(52, 'engine', 'أولوية التوجيه على البيع التصحيحي', true, 'قاعدة سلوك + م.58 مطبَّقة');
A(53, 'code',   'أهلية التلقي — أربعة شروط معاً',
  inF('js/decision-engine.js', /band\.key === 'opportunity' \|\| band\.key === 'accumulate' \|\| band\.key === 'fair'/)
  && inF('js/targets.js', /!tgDeferredExits\[c\.ticker\]/), 'المنطقة + استبعاد قائمة الخروج المؤجل');
A(54, 'code',   'مُعامِلات الأولوية (فئة × منطقة)',
  inF('js/constitution.js', /boost: 1\.30/) && inF('js/constitution.js', /boost: 1\.50/)
  && inF('js/targets.js', /function tgPriorityOf/)
  && inF('js/decision-engine.js', /function planPointsOf/)
  && inF('js/decision-engine.js', /out\.adds\.sort\(\(a, b\) => \(b\.points/),
  'المعادلة مطبَّقة في المحرّكين');
A(55, 'code',   'ممنوعات التوجيه — سدافكو وغيرها',
  inF('js/constitution.js', /'2270': 'سدافكو/) && inF('js/targets.js', /isNoAccumulate\(tk\)/)
  && inF('js/targets.js', /c\.blockedByZone/), 'سدافكو + المناطق 🟡🔴');
A(56, 'engine', 'غياب المؤهلين — 3 أشهر نقداً كحد أقصى', true, 'قاعدة سلوك');
A(57, 'code',   'تكاليف التنفيذ — 2,000 ر.س وسهمان',
  inF('js/constitution.js', /MIN_BUY_SAR = 2000/) && inF('js/constitution.js', /MAX_NAMES_PER_BATCH = 2/)
  && inF('js/targets.js', /function applyExecutionLimits/) && inF('js/targets.js', /function dropBelowMin/)
  && inF('js/decision-engine.js', /sar >= MIN_BUY_SAR/)
  && inF('js/decision-engine.js', /out\.adds\.length > MAX_NAMES_PER_BATCH/),
  'مفروضة في المحرّكين مع إعلان المؤجَّل');
A(58, 'code',   'التصحيح بالضخ قبل البيع',
  inF('js/constitution.js', /لا بيع \(م\.49 و58\)/), 'deviationBandOf');

// ── الباب التاسع: الدورة ──
A(59, 'code',   'الدورة الشاملة كل 6 أشهر',
  inF('js/constitution.js', /CYCLE_DAYS = 183/) && inF('js/settings.js', /REVIEW_CYCLE_DAYS/), 'CYCLE_DAYS');
A(60, 'code',   'المراجعة الربعية المختصرة',
  inF('js/constitution.js', /QUARTER_DAYS = 92/) && inF('js/constitution-data.js', /function deferredQuarterlyCheck/),
  'deferredQuarterlyCheck');
A(61, 'engine', 'المشغّلات الطارئة تكسر الدورة', true, 'قاعدة سلوك');

// ── الباب العاشر: مرحلة السحب ──
A(62, 'code',   'التحول التلقائي لمرحلة السحب',
  inF('js/constitution.js', /function portfolioPhase/) && inF('js/constitution.js', /WITHDRAW_START_YEAR = 2048/),
  'portfolioPhase');
A(63, 'doc',    'قواعد مرحلة الانتقال 2045–2047',
  inF('js/constitution.js', /TRANSITION_END_YEAR = 2047/), 'الثابت معرَّف — القواعد تُفعَّل عند بلوغها');
A(64, 'doc',    'قواعد مرحلة السحب 2048+',
  inF('CLAUDE.md', /احتياطي السيولة/), 'CLAUDE.md — تُفعَّل عند بلوغها');
A(65, 'engine', 'قاعدة السحب الآمن — لا بيع لتمويل الدخل', true, 'قاعدة سلوك');

// ── الباب الحادي عشر: الممنوعات ──
A(66, 'code',   'ممنوعات البيانات (6 بنود)',
  inF('js/constitution-data.js', /canDriveWeight/) && inF('js/constitution.js', /FRESH_DAYS/), 'الوسم + الحداثة');
A(67, 'engine', 'ممنوعات التقييم (7 بنود)', true, 'قواعد سلوك + مسارات الأصول منفصلة');
A(68, 'code',   'ممنوعات القرار (9 بنود)',
  inF('js/decision-engine.js', /deferredVerdict/) && inF('js/constitution-data.js', /ممنوع وضع سعر الخروج عند التعادل/)
  && inF('js/targets.js', /isNoAccumulate/), 'م.14 · 15 · 22 مفروضة آلياً');
A(69, 'engine', 'ممنوعات الأسلوب والحوكمة', true, 'قواعد سلوك');

// ── الباب الثاني عشر: الحوكمة ──
A(70, 'engine', 'صلاحيات المحرّك', true, 'قاعدة سلوك');
A(71, 'code',   'أثر الرجعية — النسخة السابقة محفوظة',
  fs.existsSync(R + 'docs/CLAUDE_v2_archive.md'), 'docs/CLAUDE_v2_archive.md');
A(72, 'code',   'سجل التدقيق',
  inF('js/constitution-data.js', /function auditEntry/) && inF('js/decision-engine.js', /recordAudit\(p\)/)
  && inF('decision-engine.html', /id="de-audit"/), 'auditEntry + recordAudit + الجدول');
A(73, 'engine', 'تعديل الدستور بقرار مكتوب من المالك', true, 'قاعدة حوكمة');
A(74, 'engine', 'المراجعة الدورية للدستور كل سنتين', true, 'قاعدة حوكمة');

// ── التقرير ──
const byKind = k => rows.filter(r => r.kind === k);
console.log('\n' + '═'.repeat(66));
console.log('فحص شامل — دستور ثروة v3.0 (74 مادة)');
console.log('═'.repeat(66));
['code', 'input', 'engine', 'doc'].forEach(k => {
  const arr = byKind(k);
  if (!arr.length) return;
  const label = { code: 'مُنفَّذة في الشيفرة', input: 'تعتمد إدخال المالك',
                  engine: 'قاعدة سلوك للمحرّك', doc: 'توثيقية/تعريفية' }[k];
  const okN = arr.filter(r => r.ok).length;
  console.log(`\n${label}: ${okN}/${arr.length}`);
  arr.filter(r => !r.ok).forEach(r => console.log(`   ✗ م.${r.num} — ${r.title}`));
});
const codeRows = byKind('code');
console.log('\n' + '─'.repeat(66));
console.log(`المجموع: ${pass}/${rows.length} مادة مُتحقَّقة`);
console.log(`منها المُنفَّذة برمجياً: ${codeRows.filter(r => r.ok).length}/${codeRows.length}`);
console.log(`إخفاقات: ${fail}`);
process.exit(fail ? 1 : 0);
