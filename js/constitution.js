// ══════════════════════════════════════════════════════════════════════
// 📜 الدستور — مصدر الحقيقة الوحيد لثوابت CLAUDE.md v3.0 (2026-08-23)
// ----------------------------------------------------------------------
// **لماذا ملف واحد:** كانت السقوف مكرَّرة حرفياً في أربعة ملفات
// (targets.js · watchlist.js · settings.js · decision-engine.js). تكرار
// الثابت يعني أن تعديله في ثلاثة مواضع وسهو الرابع يُنتج محرّكين يعطيان
// المالك رقمين مختلفين لنفس السهم في اليوم نفسه — وقد وقع ذلك فعلاً.
// أي رقم دستوري يُقرأ من هنا. ⚠️ ممنوع إعادة كتابته في ملف آخر.
//
// **المرجع:** CLAUDE.md v3.0 — رقم المادة مذكور عند كل ثابت.
// **التعديل:** بقرار مكتوب من المالك فقط (م.73).
// ══════════════════════════════════════════════════════════════════════

const CONST_VERSION = '3.0';

// ── م.25: نظام الفئات الأربع — السقف من الأرقام لا من لافتة يدوية ──
// «السقف الواحد لكل الأسهم خطأ منطقي… ولافتة قيادي الاجتهادية أسوأ».
const CAT = {
  A: { key: 'A', label: 'أ — مرساة',  short: 'أ', cap: 15, boost: 1.30 },
  B: { key: 'B', label: 'ب — أساسية', short: 'ب', cap: 10, boost: 1.15 },
  C: { key: 'C', label: 'ج — داعمة',  short: 'ج', cap: 7,  boost: 1.00 },
  D: { key: 'D', label: 'د — محدودة', short: 'د', cap: 4,  boost: 0.80 },
};
const CAT_ORDER  = ['A', 'B', 'C', 'D'];     // الأعلى سقفاً أولاً
const CAP_BUFFER = 0.75;                     // م.25 — منطقة سماح بلا تنبيه

// ── م.28: سقف القطاع متدرّج، لا عتبة واحدة ──
const SECTOR_BANDS = [
  { max: 25,       state: 'good', action: 'none',    label: 'ضمن السقف' },
  { max: 27.5,     state: 'warn', action: 'notify',  label: 'تنبيه فقط — لا تصحيح' },
  { max: 30,       state: 'warn', action: 'stopAdd', label: 'وقف الإضافة للقطاع' },
  { max: Infinity, state: 'bad',  action: 'correct', label: 'تصحيح إلزامي' },
];
const SECTOR_CAP = 25;

// ── م.29: حجم المحفظة والتنوع ──
const SIZE_MIN = 12, SIZE_MAX = 18, SIZE_GRACE_MAX = 22;   // 22 مؤقتاً أثناء الخروج
const SECTORS_MIN = 8;

// ── م.27: الحد الأدنى للمركز ──
// «مركز 1% من محفظة 230 ألف = 2,300 ريال، دخله ~95 ريال سنوياً».
const POS_MIN_OK = 3, POS_MIN_GRACE = 2;   // <2% خروج فوري · 2–3% مهلة دورتين

// ── م.49: نطاقات انحراف الوزن — النقطة أن الضخّ يصحّح لا البيع ──
const DEV_IGNORE = 1.5;    // ±1.5% لا إجراء إطلاقاً
const DEV_PUMP   = 3.0;    // 1.5–3% تصحيح بالضخّ والتوزيعات فقط

// ── م.48: سقف القيمة — السعر ÷ القيمة العادلة ──
const VALUE_BANDS = [
  { max: 0.85,     key: 'opportunity', label: 'فرصة',  icon: '🟢🟢', state: 'good', boost: 1.50, action: 'accumulate2x' },
  { max: 1.05,     key: 'accumulate',  label: 'تجميع', icon: '🟢',   state: 'good', boost: 1.20, action: 'accumulate' },
  { max: 1.20,     key: 'fair',        label: 'عادل',  icon: '⚪',   state: '',     boost: 0.80, action: 'hold' },
  { max: 1.40,     key: 'trim',        label: 'تخفيف', icon: '🟡',   state: 'warn', boost: 0,    action: 'trim' },
  { max: Infinity, key: 'liquidate',   label: 'تصفية', icon: '🔴',   state: 'bad',  boost: 0,    action: 'exit' },
];

// ── م.39: معامل الثقة بالتشتت — يوسّع نطاقات م.48 ──
const DISPERSION_BANDS = [
  { max: 0.30,     conf: 'high',   widen: 0.00, label: 'عالية' },
  { max: 0.60,     conf: 'medium', widen: 0.10, label: 'متوسطة' },
  { max: Infinity, conf: 'low',    widen: 0.20, label: 'منخفضة — استخدم النموذج الأنسب وحده' },
];

// ── م.42: بوابة الاستدامة بالمناطق ──
// 42-أ: شركات عادية ودورية — التوزيع ÷ التدفق الحر (أعلى = أفضل)
const SUSTAIN_NORMAL = [
  { min: 1.00,       zone: 'green',  reads: 0, action: 'hold' },
  { min: 0.85,       zone: 'yellow', reads: 0, action: 'watch' },
  { min: 0.60,       zone: 'orange', reads: 2, action: 'demoteCat' },
  { min: -Infinity,  zone: 'red',    reads: 2, action: 'fail' },
];
// 42-ج: الريتات — التوزيع ÷ التدفق التشغيلي (أقل = أفضل، نسبة مئوية)
const SUSTAIN_REIT = [
  { max: 90,        zone: 'green',  reads: 0, action: 'hold' },
  { max: 110,       zone: 'yellow', reads: 0, action: 'watch' },
  { max: 130,       zone: 'orange', reads: 2, action: 'demoteCat' },
  { max: Infinity,  zone: 'red',    reads: 2, action: 'fail' },
];
// 42-ب: مُعدِّل الميزانية — سنوات الجسر ترفع أو تخفض منطقة
const BRIDGE_ADJ = [
  { min: 5, shift: +1 }, { min: 3, shift: 0 }, { min: -Infinity, shift: -1 },
];
// 42-هـ: قص التوزيع — استجابة متدرّجة
const CUT_BANDS = [
  { max: 10,       key: 'adjust',   label: 'تعديل',     action: 'watch' },
  { max: 25,       key: 'reduce',   label: 'تخفيض',     action: 'demoteQuarter' },
  { max: 50,       key: 'material', label: 'قص جوهري',  action: 'demoteCat' },
  { max: 99,       key: 'severe',   label: 'قص حاد',    action: 'failNow' },
  { max: Infinity, key: 'stop',     label: 'انقطاع',    action: 'article46' },
];

// م.42 — تصنيف نسبة التغطية إلى منطقة، مع مُعدِّل الميزانية (42-ب)
// ----------------------------------------------------------------------
// `ratio` للشركات العادية = التوزيع ÷ التدفق الحر (أعلى أفضل).
// وللريتات = التوزيع ÷ التدفق التشغيلي **نسبةً مئوية** (أقل أفضل).
// `bridgeYears` سنوات الجسر: ≥5 ترفع منطقة، <2 تخفضها (42-ب) — والرفع
// مقصود: ميزانيةٌ نظيفة تحتمل توزيعاً غير مغطّى مؤقّتاً، والعكس بالعكس.
const ZONE_ORDER = ['red', 'orange', 'yellow', 'green'];   // الأسوأ أولاً
function sustainZoneOf(ratio, isReit, bridgeYears) {
  if (ratio == null || !isFinite(ratio)) {
    return { zone: null, known: false, reads: 0, action: 'declare',
             why: 'نسبة التغطية غير متوفرة — تُعلَن ولا تُقدَّر (م.20)' };
  }
  const table = isReit ? SUSTAIN_REIT : SUSTAIN_NORMAL;
  const base = isReit
    ? table.find(b => ratio <= b.max)
    : table.find(b => ratio >= b.min);
  let z = base || table[table.length - 1];
  let shifted = null;
  const by = parseFloat(bridgeYears);
  // 42-ب إلزامي في 🟡 و🟠 فقط
  if (isFinite(by) && (z.zone === 'yellow' || z.zone === 'orange')) {
    const adj = BRIDGE_ADJ.find(a => by >= a.min);
    if (adj && adj.shift !== 0) {
      const i = ZONE_ORDER.indexOf(z.zone);
      const j = Math.max(0, Math.min(ZONE_ORDER.length - 1, i + adj.shift));
      if (j !== i) {
        shifted = { from: z.zone, to: ZONE_ORDER[j], years: by };
        z = table.find(b => b.zone === ZONE_ORDER[j]) || z;
      }
    }
  }
  return {
    zone: z.zone, known: true, reads: z.reads, action: z.action, shifted,
    why: `${({ green:'🟢', yellow:'🟡', orange:'🟠', red:'🔴' })[z.zone]} `
       + `${isReit ? 'التوزيع ÷ التدفق التشغيلي' : 'التوزيع ÷ التدفق الحر'} = `
       + `${isReit ? ratio.toFixed(0) + '%' : ratio.toFixed(2)} (م.42${isReit ? '-ج' : '-أ'})`
       + (shifted ? ` — رُفعت/خُفضت منطقة بسنوات الجسر ${shifted.years} (م.42-ب)` : ''),
  };
}

// م.42-هـ — حجم قص التوزيع إلى إجراء متدرّج
function dividendCutBand(cutPct) {
  const c = Math.abs(parseFloat(cutPct));
  if (!isFinite(c)) return null;
  const b = CUT_BANDS.find(x => c <= x.max) || CUT_BANDS[CUT_BANDS.length - 1];
  return { ...b, cutPct: c, why: `قص ${c.toFixed(0)}% — ${b.label} (م.42-هـ)` };
}

// ── م.43: قاعدة التأكيد — لا إشارة من قراءة واحدة إلا القاطعة ──
const CONFIRM_READS = { decisive: 1, strong: 2, medium: 3, weak: 0 };

// ── م.44: الإشارات القاطعة — خمس فقط، بلا مرونة ولا تأكيد ──
const DECISIVE_SIGNALS = [
  'انقطاع التوزيع كلياً',
  'خسارة تشغيلية في النشاط الأساسي',
  'إخلال معلن بتعهد دين',
  'رأي مراجع متحفظ أو ممتنع',
  'الاستبعادات الدائمة (م.12)',
];

// ── م.12: الاستبعادات الدائمة — ممنوع اقتراحها تحت أي ظرف ──
const BANNED_TICKERS = { '4339': 'دراية ريت', '1111': 'تداول القابضة' };
// م.55/5: ممنوع توجيه سيولة — بقرار المالك الصريح
const NO_ACCUMULATE = { '2270': 'سدافكو — لا تجميع مهما كانت الإشارات (م.55)' };

// ══════════════════════════════════════════════════════════════════════
// م.30 — تركيز العامل الواحد: نسبة المحفظة المرتبطة بالإنفاق الحكومي
// ----------------------------------------------------------------------
// «الطاقة مباشرة، البنوك عبر الودائع وتمويل المشاريع، الأسمنت عبر
// الإنشاءات، التجزئة والصحة عبر الدخل المحلي.»
//
// ⚠️ **مادة إفصاح فقط.** لا تولّد إشارة بيع ولا تُخصم من درجة التقييم —
// احتراماً للمادة 9 (المحفظة 100% سعودية بقرار المالك، ولا تُنتقد عليه).
// الرقم يُعرَض ليُعرَف، لا ليُعاقَب عليه.
//
// المعاملات تقديرية بنصّ الدستور («التقدير الحالي ~70%») — فتُعلَن كذلك،
// ولا تُقدَّم على أنها قياس. م.20: ما ليس قياساً لا يُعرَض كقياس.
// ══════════════════════════════════════════════════════════════════════
const GOV_EXPOSURE = {
  'الطاقة': 1.00, 'المرافق العامة': 1.00, 'البتروكيماويات': 0.85,
  'البنوك': 0.70, 'الخدمات المالية': 0.60,
  'الأسمنت': 0.75, 'السلع الرأسمالية': 0.70, 'إدارة وتطوير العقارات': 0.60,
  'الاتصالات': 0.60, 'الرعاية الصحية': 0.55, 'التجزئة الكمالية': 0.45,
  'تجزئة الأغذية': 0.45, 'إنتاج الأغذية': 0.40, 'النقل': 0.55,
  'التأمين': 0.50, 'الإعلام والترفيه': 0.45, 'الاستثمار والتمويل': 0.55,
};
const GOV_DEFAULT = 0.45;   // قطاع غير مُدرَج — يُعلَن أنه افتراضي

function govExposure(rows) {
  const total = (rows || []).reduce((a, r) => a + (+r.value || 0), 0);
  if (!(total > 0)) return { pct: null, total: 0, unknown: [], why: 'لا حيازات' };
  const unknown = [];
  let weighted = 0;
  (rows || []).forEach(r => {
    const sec = String(r.sector || '').trim();
    const f = GOV_EXPOSURE[sec];
    if (f == null && sec && !unknown.includes(sec)) unknown.push(sec);
    weighted += (+r.value || 0) * (f == null ? GOV_DEFAULT : f);
  });
  return {
    pct: weighted / total * 100, total, unknown,
    why: 'إفصاح فقط (م.30): لا يولّد إشارة بيع ولا يُخصم من درجة التقييم (م.9). '
       + 'المعاملات تقديرية بنصّ الدستور، لا قياس.',
  };
}

// ── م.7: المعالم الرقمية ──
const GOAL_MONTHLY_INCOME = 6000;      // ريال شهرياً بحلول 2045
const GOAL_PORTFOLIO      = 1310000;   // عند عائد 5.5%
const GOAL_FIRE           = 1800000;
const MONTHLY_INJECTION   = 8000;      // من يناير 2027
const INJECTION_START     = '2027-01-01';
const HORIZON_YEAR        = 2055;
const ACCUM_END_YEAR      = 2044;      // م.1 — مرحلة التجميع حتى 2044-12-31
const TRANSITION_END_YEAR = 2047;
const WITHDRAW_START_YEAR = 2048;

// ── م.18: حداثة البيانات — تجاوز الحد يُعلَّم ⚠️ ولا يُبنى عليه قرار وزن ──
const FRESH_DAYS = { price: 7, analystTarget: 90, beta: 180, marketCap: 30 };

// ── م.19: وسم البيانات — كل رقم في أي مخرَج يحمل وسماً ──
const DATA_TAG = {
  official: '✅',   // منقول حرفياً من ملف تداول
  derived:  '⚙️',   // مشتق بحساب من أرقام ملف تداول
  external: '⚠️',   // مصدر خارجي — لا يُبنى عليه قرار وزن
  missing:  '❌',   // غير متوفر
};

// ── م.57: تكاليف التنفيذ ──
const MIN_BUY_SAR = 2000;      // الحد الأدنى لأي عملية شراء
const MAX_NAMES_PER_BATCH = 2; // الحد الأقصى للأسماء في الدفعة الشهرية

// ── م.1: الدورة ──
const CYCLE_DAYS = 183;        // ستة أشهر — مراجعة شاملة
const QUARTER_DAYS = 92;       // مراجعة ربعية مختصرة (م.60)

// ── م.31: أولوية الهدف الفردي — صالحة **دورة واحدة** ثم تُجدَّد أو تُقصّ ──
// «سقف يُتجاوز دائماً بلا مراجعة ليس سقفاً».
const OVERRIDE_VALID_DAYS = CYCLE_DAYS;

// ── ملحق ب: أبعاد درجة التقييم ──
const RATING_DIMS = [
  { key: 'continuity', label: 'استمرارية التوزيع',     weight: 30 },
  { key: 'yield',      label: 'العائد التوزيعي',        weight: 20 },
  { key: 'quality',    label: 'جودة المكونات ومتانتها', weight: 15 },
  { key: 'growth',     label: 'نمو التوزيع',            weight: 15 },
  { key: 'diversity',  label: 'التنوع الحقيقي',         weight: 15 },
  { key: 'entry',      label: 'التسعير عند الدخول',     weight: 5 },
];

// ══════════════════════════════════════════════════════════════════════
// المصنِّف — م.25 و26
// ----------------------------------------------------------------------
// **م.21 حاكمة هنا:** «ممنوع تخفيض وزن أو إصدار إشارة بيع بسبب غياب ملف
// أو بيان عند المحرك». فالمدخل الناقص **لا** ينزل بالسهم إلى الفئة (د) —
// وهي أدنى سقفاً — بل يُرجِع `known:false` مع بيان ما ينقص بالضبط، ويُبقي
// المحرّك على الفئة المحفوظة سابقاً إن وُجدت.
//
// المدخلات: { marketCapB (مليار ر.س) · sovereignPct · streakYears ·
//             coverage · isManagedFund }
// ══════════════════════════════════════════════════════════════════════
function classifyStock(f) {
  f = f || {};
  const mc     = _cNum(f.marketCapB);
  const sov    = _cNum(f.sovereignPct);
  const streak = _cNum(f.streakYears);
  const cov    = _cNum(f.coverage);

  const cat = (k, why) => ({ cat: k, ...CAT[k], why, known: true, missing: [] });
  const unknown = (miss) => ({
    cat: null, key: null, label: 'غير مصنَّف', short: '؟', cap: null, boost: 1,
    known: false, missing: miss,
    why: `بيانات ناقصة: ${miss.join('، ')} — تُعلَن ولا تُقدَّر (م.20)، ولا تُنزَّل الفئة بسببها (م.21)`,
  });

  // (د) لها مسار مستقل: صندوق مُدار برسوم يكفي وحده (م.25 — شرط «أو»)
  if (f.isManagedFund === true) return cat('D', 'صندوق مُدار برسوم (م.25)');

  // (د) تُحسم بشرط واحد متاح — ولا تحتاج بقية المدخلات
  if (mc != null && mc < 2)         return cat('D', `قيمة سوقية ${mc} مليار < 2 (م.25)`);
  if (streak != null && streak < 4) return cat('D', `توزيع متصل ${streak} سنوات < 4 (م.25)`);

  const missing = [];
  if (mc == null)     missing.push('القيمة السوقية');
  if (streak == null) missing.push('سنوات التوزيع المتصل');
  if (missing.length) return unknown(missing);

  // (أ) مرساة — الثلاثة معاً إلزامية
  if (mc > 100) {
    if (sov == null) return unknown(['الملكية السيادية']);
    if (sov >= 30 && streak >= 5)
      return cat('A', `قيمة سوقية ${mc} مليار · ملكية سيادية ${sov}% · توزيع متصل ${streak} سنوات (م.25)`);
    // استوفى الحجم ولم يستوفِ بقية شروط (أ) ⇒ ينزل لِما تثبته الأرقام
  }
  // (ب) أساسية
  if (mc >= 10 && mc <= 100 && streak >= 5) {
    if (cov == null) return unknown(['تغطية التوزيع']);
    if (cov >= 0.85)
      return cat('B', `قيمة سوقية ${mc} مليار · توزيع متصل ${streak} · تغطية ${cov} (م.25)`);
  }
  // (ج) داعمة
  if (mc >= 2 && mc <= 10 && streak >= 4)
    return cat('C', `قيمة سوقية ${mc} مليار · توزيع متصل ${streak} سنوات (م.25)`);

  // استوفى حجماً أعلى ولم يستوفِ شروطه النوعية ⇒ أدنى ما تثبته الأرقام
  if (mc >= 10)
    return cat('C', 'الحجم أعلى لكن شروط الفئة النوعية غير مستوفاة — يُصنَّف بأدنى ما تثبته الأرقام (م.25)');
  return cat('D', 'لم تُستوفَ شروط أي فئة أعلى (م.25)');
}
function _cNum(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }

// ══════════════════════════════════════════════════════════════════════
// م.26 — المنطقة الميتة ±15% حول العتبة، **قبل** عدّ الدورتين
// ----------------------------------------------------------------------
// المادة تشترط شرطين معاً: «الترقية: تجاوز العتبة بـ+15% لمدة دورتين»
// و«التنزيل: النزول تحتها بـ−15% لمدة دورتين». وكان الكود يعدّ الدورتين
// فقط ولا يفحص ±15% إطلاقاً — لا وجود لـ0.15 في الملف — بينما نصّ السبب
// المطبوع يقول «تجاوز العتبة بـ±15%». فسهمٌ عند 100.4 مليار يبدأ عدّ
// دورتيه وهو داخل المنطقة الميتة التي كان يجب أن تمنع العدّ أصلاً، وهذا
// هو عين التذبذب عند الحدود الذي بُنيت المادة لمنعه.
//
// `catRankOf` يرتّب الفئات تنازلياً بالحجم (أ=0 … د=3)، فالترقية تعني
// انخفاض الرتبة. و`hysteresisEligible` تُجيب: هل تجاوز الرقمُ العتبةَ
// بالهامش المطلوب في اتجاه الحركة؟
// ══════════════════════════════════════════════════════════════════════
const HYST_MARGIN = 0.15;
const CAT_RANK = { A: 0, B: 1, C: 2, D: 3 };
function catRankOf(k) { return CAT_RANK[k] != null ? CAT_RANK[k] : 99; }

// هل بلغ المقياس هامشَ م.26 في اتجاه الحركة؟
//   value: القيمة المقيسة · threshold: العتبة المنصوص عليها
//   upgrading: true للترقية (تجاوز +15%) · false للتنزيل (نزول −15%)
function hysteresisEligible(value, threshold, upgrading) {
  const v = _cNum(value), t = _cNum(threshold);
  if (v == null || t == null || t === 0) return true;   // بلا مقياس: لا نمنع (م.21)
  return upgrading ? v >= t * (1 + HYST_MARGIN) : v <= t * (1 - HYST_MARGIN);
}

function applyHysteresis(prev, next, streakCycles, forceNow, marginMet) {
  if (forceNow) return { cat: next, moved: true, why: 'استثناء فوري (م.26): انقطاع توزيع أو خسارة تشغيلية أو إخلال بتعهد' };
  if (!prev || !next || prev === next) return { cat: next || prev, moved: false, why: '' };
  // المنطقة الميتة: لم يتجاوز الهامش ⇒ لا تُعدّ الدورة أصلاً
  if (marginMet === false) {
    return { cat: prev, moved: false, deadZone: true,
      why: 'داخل المنطقة الميتة ±15% حول العتبة — لا يُعدّ التغيّر ولا تبدأ الدورتان (م.26)' };
  }
  if ((streakCycles || 0) >= 2) return { cat: next, moved: true, why: 'تجاوز العتبة بـ±15% لدورتين متتاليتين (م.26)' };
  return { cat: prev, moved: false, why: 'بين العتبتين — يبقى في فئته الحالية حتى تكتمل دورتان (م.26)' };
}

// السقف الفعّال لسهم: من فئته. غير المصنَّف بلا سقف مفروض (م.21)
function capOfCategory(catKey) { return CAT[catKey] ? CAT[catKey].cap : null; }

// م.28 — أي نطاق قطاعي ينطبق
function sectorBandOf(pct) {
  return SECTOR_BANDS.find(b => pct <= b.max) || SECTOR_BANDS[SECTOR_BANDS.length - 1];
}

// م.48 (+ م.39) — منطقة السعر مقابل القيمة العادلة، موسَّعة بمعامل الثقة
function valueBandOf(ratio, dispersion) {
  const d = DISPERSION_BANDS.find(x => (dispersion == null ? 0 : dispersion) <= x.max);
  const w = 1 + (d ? d.widen : 0);
  const band = VALUE_BANDS.find(b => b.max === Infinity || ratio <= b.max * w)
            || VALUE_BANDS[VALUE_BANDS.length - 1];
  return { ...band, confidence: d ? d.conf : 'high', widen: d ? d.widen : 0 };
}

// م.49 — نطاق انحراف الوزن عن الهدف
function deviationBandOf(dev) {
  const a = Math.abs(dev);
  if (a <= DEV_IGNORE) return { key: 'ignore', action: 'none',   label: 'ضمن ±1.5% — لا إجراء (م.49)' };
  if (a <= DEV_PUMP)   return { key: 'pump',   action: 'pump',   label: 'تصحيح بالضخّ والتوزيعات فقط، لا بيع (م.49 و58)' };
  return { key: 'active', action: 'active', label: 'تصحيح نشط (م.49)' };
}

// م.27 — الحد الأدنى للمركز
function positionSizeVerdict(weightPct) {
  if (weightPct >= POS_MIN_OK)    return { key: 'ok',    state: 'good', label: 'مقبول (م.27)' };
  if (weightPct >= POS_MIN_GRACE) return { key: 'grace', state: 'warn', label: 'مهلة دورتين للرفع بالضخّ، ثم خروج كامل (م.27)' };
  return { key: 'exit', state: 'bad', label: 'خروج كامل في الدورة الحالية (م.27)' };
}

// م.12 و55 — أعلام المنع
function isBanned(tk)       { return Object.prototype.hasOwnProperty.call(BANNED_TICKERS, String(tk)); }
function isNoAccumulate(tk) { return Object.prototype.hasOwnProperty.call(NO_ACCUMULATE, String(tk)); }

// م.1 — مرحلة المحفظة حسب التاريخ (م.62 قد تُقدّمها بشرط الدخل)
function portfolioPhase(d) {
  const y = (d || new Date()).getFullYear();
  if (y <= ACCUM_END_YEAR)      return { key: 'accumulation', label: 'مرحلة التجميع' };
  if (y <= TRANSITION_END_YEAR) return { key: 'transition',   label: 'مرحلة الانتقال' };
  return { key: 'withdrawal', label: 'مرحلة السحب' };
}

// م.2 — التعادل الحقيقي: متوسط التكلفة ناقص ما استُرِدّ توزيعاً
function trueBreakEven(avgCost, totalDivReceived, shares) {
  if (!(shares > 0) || !(avgCost > 0)) return null;
  return avgCost - ((+totalDivReceived || 0) / shares);
}

// م.31 — هل ما زال تجاوز الهدف الفردي سارياً؟ صلاحيته دورة واحدة.
function overrideStatus(setOnISO, now) {
  if (!setOnISO) return { valid: false, expired: false, unknownDate: true,
    why: 'لا تاريخ تحديد مسجَّل — لا يمكن قياس صلاحية الدورة (م.31)' };
  const t = new Date(setOnISO).getTime();
  if (!isFinite(t)) return { valid: false, expired: false, unknownDate: true, why: 'تاريخ غير صالح' };
  const days = Math.floor(((now ? now.getTime() : Date.now()) - t) / 86400000);
  const left = OVERRIDE_VALID_DAYS - days;
  return left >= 0
    ? { valid: true,  expired: false, unknownDate: false, daysLeft: left,
        why: `التجاوز ساري — يُجدَّد صراحةً بعد ${left} يوماً (م.31)` }
    : { valid: false, expired: true,  unknownDate: false, daysLeft: 0, overdueDays: -left,
        why: `انقضت دورة التجاوز منذ ${-left} يوماً — يُجدَّد صراحةً أو يُقصّ للسقف (م.31)` };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONST_VERSION, CAT, CAT_ORDER, CAP_BUFFER, SECTOR_BANDS, SECTOR_CAP,
    SIZE_MIN, SIZE_MAX, SIZE_GRACE_MAX, SECTORS_MIN, POS_MIN_OK, POS_MIN_GRACE,
    DEV_IGNORE, DEV_PUMP, VALUE_BANDS, DISPERSION_BANDS,
    SUSTAIN_NORMAL, SUSTAIN_REIT, BRIDGE_ADJ, CUT_BANDS,
    CONFIRM_READS, DECISIVE_SIGNALS, BANNED_TICKERS, NO_ACCUMULATE,
    GOAL_MONTHLY_INCOME, GOAL_PORTFOLIO, GOAL_FIRE, MONTHLY_INJECTION, INJECTION_START,
    HORIZON_YEAR, ACCUM_END_YEAR, TRANSITION_END_YEAR, WITHDRAW_START_YEAR,
    FRESH_DAYS, DATA_TAG, MIN_BUY_SAR, MAX_NAMES_PER_BATCH, CYCLE_DAYS, QUARTER_DAYS,
    OVERRIDE_VALID_DAYS, RATING_DIMS,
    GOV_EXPOSURE, GOV_DEFAULT, govExposure,
    ZONE_ORDER, sustainZoneOf, dividendCutBand,
    classifyStock, applyHysteresis, hysteresisEligible, catRankOf, HYST_MARGIN,
    capOfCategory, sectorBandOf, valueBandOf,
    deviationBandOf, positionSizeVerdict, isBanned, isNoAccumulate,
    portfolioPhase, trueBreakEven, overrideStatus,
  };
}
