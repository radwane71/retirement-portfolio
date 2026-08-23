// ══════════════════════════════════════════════════════════════════════
// 🧭 محرّك القرار — يطبّق دستور المحفظة (CLAUDE.md) على البيانات الحيّة
// ----------------------------------------------------------------------
// المبدأ: قرار آلي مبني على قواعد ثابتة. المحرّك يطبّق الفلاتر فقط ولا
// يجتهد. لو القاعدة ما تنطبق → «احتفظ». لو البيانات ناقصة → «غير متوفرة»
// صراحةً (ممنوع التقدير الصامت — الدستور §8).
// ══════════════════════════════════════════════════════════════════════

// ── 1. الثوابت اللي ما تتغير (الدستور §1) — ممنوع تعديلها من الواجهة ──
const CAPS = Object.freeze({ single: 7, blueChip: 12, sector: 25 });
// منطقة سماح (الدستور §1): زيادة مسموحة فوق السقف بدون تنبيه — سهم/قيادي 0.75، قطاع 1.25
const CAP_BUFFER = 0.75;
const SECTOR_BUFFER = 1.25;
const PORTFOLIO_SIZE = Object.freeze({ min: 18, max: 25 });

// نص مختصر لخطة الأسعار (للعرض في الجداول)
function zonesText(z) {
  if (!z) return null;
  const p = [];
  if (z.accumulate) p.push(`تجميع ≤${formatNum(z.accumulate)}`);
  if (z.trimFrom)   p.push(`تخفيف ${formatNum(z.trimFrom)}${z.trimTo ? '–' + formatNum(z.trimTo) : ''}`);
  if (z.liquidate)  p.push(`تصفية >${formatNum(z.liquidate)}`);
  return p.length ? p.join(' · ') : null;
}

// triggers ثابتة مُعرّفة من المالك (الدستور §1) — أولوية عليا فوق كل حساب
// ملاحظة الاتجاه: المواساة بيع عند الوصول لـ85 فأعلى. أرامكو تخفيض للوزن 12%
// عند وصول السعر إلى 29 أو أقل (السعر بلغ المستوى المحدّد).
const FIXED_TRIGGERS = Object.freeze([
  { ticker: '2222', name: 'أرامكو',  kind: 'reduce', price: 29, cmp: 'lte', toWeight: 12,
    label: 'تخفيض الوزن إلى 12% عند 29 ريال' },
  { ticker: '4002', name: 'المواساة', kind: 'sell',   price: 85, cmp: 'gte',
    label: 'بيع عند 85 ريال' },
]);

// ملاحظة: المحرّك يقيّم فقط الأسهم الموجودة داخل المحفظة — لا علاقة له بأي
// قائمة أسهم ممنوعة (أُزيلت بقرار المالك؛ وظيفة الصفحة القرار داخل المحفظة فقط).

// مفتاح حفظ مدخلات المحرّك لكل سهم (يُزامن عبر user_settings)
const ENGINE_STORE_KEY = 'decision_engine_v1';
// رموز هدفها صفر بقرار صريح من صفحة الأهداف = تصفية كاملة (لا «بلا هدف»).
// التمييز ضروري لأن stock_targets.target_pct افتراضه 0 لكل رمز لم يُحدَّد.
const ZERO_TARGETS_KEY = 'stock_zero_targets_v1';
let zeroTargets = new Set();

// ══════════════════════════════════════════════════════════════════════
// 🛡️ حراسة السعر — كل رقم في الصفحة يرث current_price
// ----------------------------------------------------------------------
// الوزن وكسر السقف والانحراف وXIRR وهامش القيمة العادلة وترتيب المرشّحين:
// كلها مشتقّة من السعر. فإن كان السعر مغلوطاً أو قديماً، القرار مغلوط بثقة
// كاملة — وهو أسوأ من قرار مفقود.
//
// أخطر حالة عملية: **التجزئة**. لو جزّأت شركة سهمها 1:4، ينزل السعر 75%
// فوراً بينما عدد أسهمك في التراكر يبقى كما هو، فينهار وزن السهم في يوم
// ويقرأها المحرّك «فرصة تجميع» ويقترح شراءً. توصية كاذبة لا رقم مشوّه.
//
// لا يوجد جدول أسعار تاريخية في المشروع، فنحتفظ بمرصد خفيف: آخر سعر مرصود
// لكل رمز وتاريخه في user_settings، ونقارن به عند كل تشغيل.
const PRICE_WATCH_KEY = 'price_watch_v1';
const PRICE_JUMP_PCT = 25;          // قفزة/هبوط يومي يفوقها = مشبوه حتى يُراجَع
const PRICE_DECISION_MAX_DAYS = 21; // أقدم من ذلك: لا يُبنى عليه قرار سعري
let priceWatch = {};                // ticker → { p: آخر سعر مرصود, d: تاريخه }
let priceAlerts = {};               // ticker → { kind, msg }

// نِسَب التجزئة الشائعة — قرب الهبوط منها يرفع الشبهة إلى شبه يقين
const SPLIT_RATIOS = [
  { r: 1 / 2, label: '1:2' }, { r: 1 / 3, label: '1:3' },
  { r: 1 / 4, label: '1:4' }, { r: 1 / 5, label: '1:5' }, { r: 1 / 10, label: '1:10' },
];

function buildPriceAlerts() {
  priceAlerts = {};
  const today = new Date().toISOString().slice(0, 10);
  const next = {};
  holdings.forEach(h => {
    const p = +h.current_price;
    if (!(p > 0)) return;
    const prev = priceWatch[h.ticker];
    next[h.ticker] = { p, d: today };

    // ① قفزة مفاجئة مقارنةً بآخر سعر رصدناه
    if (prev && prev.p > 0 && prev.d !== today) {
      const chg = (p - prev.p) / prev.p * 100;
      if (Math.abs(chg) >= PRICE_JUMP_PCT) {
        const ratio = p / prev.p;
        const split = SPLIT_RATIOS.find(s => Math.abs(ratio - s.r) / s.r < 0.08);
        priceAlerts[h.ticker] = {
          kind: split ? 'split' : 'jump',
          msg: split
            ? `السعر هبط من ${formatNum(prev.p)} إلى ${formatNum(p)} (${formatNum(ratio, 2)}× ≈ تجزئة ${split.label}) منذ ${prev.d}. `
              + `إن كانت تجزئة فعلاً فعدد أسهمك في التراكر لم يُضاعَف بعد، ووزن السهم المعروض خاطئ. `
              + `صحّح عدد الأسهم من صفحة المعاملات قبل أي قرار.`
            : `السعر تحرّك ${chg >= 0 ? '+' : '−'}${formatNum(Math.abs(chg))}% منذ ${prev.d} (${formatNum(prev.p)} → ${formatNum(p)}). `
              + `تحرّك بهذا الحجم يعني عادةً خبراً جوهرياً (§5) أو خطأ بيانات أو تجزئة — تحقّق قبل أي قرار.`,
        };
        // نُبقي المرجع القديم حتى تتأكّد، فلا تُبتلع القفزة صامتةً في الرصد التالي
        next[h.ticker] = prev;
      }
    }

    // ② سعر قديم لا يصلح أساساً لقرار
    if (!priceAlerts[h.ticker] && !h.price_manual && h.price_updated_at) {
      const age = Math.floor((Date.now() - new Date(h.price_updated_at).getTime()) / 86400000);
      if (age > PRICE_DECISION_MAX_DAYS) {
        priceAlerts[h.ticker] = { kind: 'stale',
          msg: `آخر تحديث لسعر هذا السهم قبل ${age} يوماً (الحدّ ${PRICE_DECISION_MAX_DAYS}). `
            + `الوزن والانحراف وهامش القيمة العادلة كلها مبنية عليه، فلا يُبنى عليه قرار بيع أو شراء. `
            + `حدّث الأسعار من لوحة التحكم.` };
      }
    }
  });
  priceWatch = next;
  saveUserSetting(PRICE_WATCH_KEY, priceWatch).catch(() => {});
}

// ── الحالة ──
let holdings   = [];   // من جدول holdings
let stockTargets = {}; // ticker → { target_pct, entry_price, exit_price }
let sectorTargets = {}; // sector → نسبة الهدف — لخطة الوصول على مستوى القطاع
let taskZones  = {};   // ticker → { accumulate, trimFrom, trimTo, liquidate } من صفحة المهام
let taskTypes  = {};   // ticker → نوع المهمة (monitoring/accumulation/…) — قرار المالك
let taskConflicts = {}; // ticker → عدد المهام النشطة (>1 = تعارض يُنبَّه عليه)
let divByTicker = {};  // ticker → [{ amount, date }] من سجل الأرباح الفعلي
let txByTicker  = {};  // ticker → [{ type, shares, date }] مرتّبة — لاستخراج DPS
let valByTicker = {};  // ticker → آخر تقييم من حاسبة القيمة العادلة {fair, ts, date, inputs}
let valHistByTicker = {}; // ticker → كل التقييمات (الأحدث أولاً) — الدستور §4 الفلتر 2: «انظر لكل مكون وكل مؤشر على مر الزمان وتطوره»
let reviewByTicker = {};  // ticker → [{ review_date, notes }] من دفتر المراجعة (الأحدث أولاً)
let incomeGoalMonthly = 0; // هدف الدخل الشهري (§1) — لقياس مساهمة كل سهم
const ENGINE_VAL_KEY = 'valuation_history_v1';
const VAL_STALE_DAYS = 180; // آخر تقييم أقدم من 6 أشهر = قديم
const REVIEW_CYCLE_DAYS = 180; // الدورة الروتينية (الدستور §5) — كل 6 أشهر
let engineCfg    = {}; // ticker → مدخلات المحرّك اليدوية (استدامة/قيادي/نوع/عادلة يدوية)
let _results     = []; // مخرجات التقييم لكل سهم (للتصدير)

// ══════════════════════════════════════════════════════════════════════
// تصنيف نوع الأصل من القطاع (الدستور §3) — يحدّد نموذج الاستدامة
// ══════════════════════════════════════════════════════════════════════
function classifyAsset(sector) {
  const s = (sector || '').trim();
  if (s.includes('عقارية المتداولة') || s.includes('ريت')) return 'reit';
  if (s.includes('البنوك')) return 'bank';
  if (s.includes('المواد الاساسية') || s.includes('المواد الأساسية')) return 'cement_petro';
  return 'general';
}
const ASSET_LABEL = {
  reit:        'REIT — صندوق عقاري',
  bank:        'بنك',
  cement_petro:'إسمنت/بتروكيماويات',
  general:     'بقية القطاعات',
};
const SUSTAIN_METRIC = {
  reit:        'تغطية FFO / AFFO',
  bank:        'التوزيع ÷ صافي الدخل',
  cement_petro:'تغطية FCF',
  general:     'نسبة التوزيع من EPS + تغطية FCF',
};

// النوع الفعلي = override يدوي إن وجد، وإلا المستنتج من القطاع
function assetTypeOf(h) {
  const cfg = engineCfg[h.ticker] || {};
  return cfg.assetType || classifyAsset(h.sector);
}

// هل السهم قيادي؟ (سقف 12% بدل 7%) — علم يدوي، وأرامكو افتراضياً قيادية
function isBlueChip(h) {
  const cfg = engineCfg[h.ticker] || {};
  if (cfg.blueChip === true)  return true;
  if (cfg.blueChip === false) return false;
  return h.ticker === '2222'; // أرامكو قيادية بحكم trigger الوزن 12%
}
function capOf(h) { return isBlueChip(h) ? CAPS.blueChip : CAPS.single; }

// رقم صالح من حقل نصّي (أو null)
function numOf(v) { if (v == null || v === '') return null; const n = +v; return isFinite(n) ? n : null; }

// ══════════════════════════════════════════════════════════════════════
// 🔍 فحص وحدات FCF — بند كان معلّقاً في الدستور («وحدات fcf غير مؤكّدة»)
// ----------------------------------------------------------------------
// تغطية الإسمنت/البتروكيماويات = التوزيع للسهم ÷ FCF **للسهم** (§3). لو أُدخل
// FCF إجمالياً بالملايين بينما التوزيع للسهم الواحد، تخرج النسبة بجزء من
// الألف بالمئة فتظهر «التوزيع مغطّى» خضراء زوراً — والعكس بوحدة أصغر.
// المرجع الطبيعي: FCF للسهم من رتبة EPS (أو من رتبة السعر إن غاب EPS).
// عند الشكّ لا نحسب ولا نُخمّن — نُعلن الوحدات مشكوكاً فيها (§8).
// ══════════════════════════════════════════════════════════════════════
function fcfUnitsSuspect(fcf, eps, price) {
  if (fcf == null || !(fcf > 0)) return null;
  const ref = (eps != null && eps > 0) ? eps : (price > 0 ? price / 10 : null);
  if (ref == null) return null;
  if (fcf > ref * 50)  return `FCF المُدخَل (${formatNum(fcf)}) أكبر من ${eps != null && eps > 0 ? 'EPS' : 'مرجع السعر'} بأكثر من 50 ضعفاً — الأرجح أنه إجمالي (بالملايين) لا للسهم الواحد`;
  if (fcf < ref / 200) return `FCF المُدخَل (${formatNum(fcf)}) أصغر من المتوقَّع بمئتي ضعف — الأرجح أنه بوحدة مختلفة`;
  return null;
}

// يحوّل نص نتيجة الحاسبة ("12.50 — 18.30" أو "15.40 ر.س") إلى { avg, min, max }
// AUDIT-FIX (2026-07): formatCurrency('ar-SA') قد يُخرج أرقاماً عربية-هندية (٠-٩)
// لا يلتقطها \d اللاتيني — نحوّلها أولاً حتى لا يفشل التحليل ويضيع التقييم.
function parseFairValueRange(str) {
  if (!str) return null;
  const normalized = String(str)
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٫/g, '.').replace(/[,،]/g, '');
  const nums = normalized.match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const vals = nums.map(Number).filter(n => n > 0);
  if (!vals.length) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, min, max };
}

// عمر آخر تقييم بالأيام (من entry.id الطابع الزمني)، أو null
function valAgeDays(v) { return (v && v.ts) ? Math.floor((Date.now() - v.ts) / 86400000) : null; }

// AUDIT-FIX (2026-08): سجل تقييم بلا id رقمي كان لا يُوسم قديماً أبداً —
// احتياط: تحليل entry.date (أرقام لاتينية أو عربية-هندية، Y-M-D أو D-M-Y).
// إن تعذّر الاثنان → ts=null وتُعرض «عمر التقييم غير معروف» (لا تقدير صامت §8).
function parseValEntryDate(str) {
  if (!str) return null;
  const norm = String(str).split('،')[0]
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\d/\-.]/g, '');
  const m = norm.match(/(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})/);
  if (!m) return null;
  let y, mo, d;
  if (m[1].length === 4)      { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if (m[3].length === 4) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else return null;
  if (y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = new Date(y, mo - 1, d).getTime();
  return isFinite(t) ? t : null;
}

// عدد الأسهم المملوكة لرمز في تاريخ معيّن (من المعاملات المرتّبة) — لاستخراج DPS
function sharesAtDateOf(ticker, date) {
  const rows = txByTicker[ticker] || [];
  let sh = 0;
  for (const t of rows) {
    if (t.date > date) break; // مرتّبة تصاعدياً
    if (t.type === 'buy' || t.type === 'grant') sh += t.shares;
    else if (t.type === 'sell') sh -= t.shares;
  }
  return Math.max(0, sh);
}

// ══════════════════════════════════════════════════════════════════════
// كشف اتجاه التوزيع آلياً — بالـDPS (المبلغ ÷ الأسهم وقتها) ومقارنة سنوية:
//   • يحوّل كل توزيع إلى DPS لعزل سياسة الشركة عن تغيّر حجم مركزك
//   • يقارن آخر سنة ميلادية كاملة بسابقتها (يتجنّب ازدواج نوافذ 12 شهر)
//   • يكتشف التوقّف من «أشهر منذ آخر توزيع» مقاسةً من اليوم
//   growing | stable | cut (خفض ≥25%) | stopped (>18 شهراً) | insufficient
// ══════════════════════════════════════════════════════════════════════
function dividendTrendOf(ticker) {
  const recs = divByTicker[ticker];
  if (!recs || !recs.length) return null;
  const now = new Date();

  // DPS لكل توزيع = المبلغ ÷ الأسهم المملوكة وقت التوزيع (تجاهل ما لا أسهم له)
  const dps = [];
  recs.forEach(r => {
    const sh = sharesAtDateOf(ticker, r.date);
    if (sh > 0 && r.amount > 0) dps.push({ dps: r.amount / sh, date: r.date });
  });
  if (!dps.length) return { signal: 'insufficient', note: 'تعذّر اشتقاق DPS (لا معاملات مطابقة)' };

  // التوقّف: آخر توزيع أقدم من 18 شهراً من اليوم
  const lastDate = dps.reduce((m, r) => (r.date > m ? r.date : m), dps[0].date);
  const monthsSince = (now - lastDate) / (30.44 * 86400000);
  if (monthsSince > 18) return { signal: 'stopped', note: `آخر توزيع قبل ~${Math.round(monthsSince)} شهراً — توقّف/تعليق محتمل` };

  // DPS سنوي (جمع دفعات السنة) ثم مقارنة آخر سنتين كاملتين (نستبعد السنة الجارية)
  const byYear = {};
  dps.forEach(r => { const y = r.date.getFullYear(); byYear[y] = (byYear[y] || 0) + r.dps; });
  // AUDIT-FIX (2026-08): سنة أول شراء للرمز سنة جزئية (المركز فُتح في منتصفها،
  // فتوزيعات ما قبل الشراء لا تُحتسب) — دخولها كسنة كاملة يعطي إشارة نمو/قطع
  // زائفة. تُستبعد من المقارنة السنوية.
  const firstBuy = (txByTicker[ticker] || []).find(t => t.type === 'buy' || t.type === 'grant');
  const firstBuyYear = firstBuy ? firstBuy.date.getFullYear() : null;
  const fullYears = Object.keys(byYear).map(Number)
    .filter(y => y < now.getFullYear() && (firstBuyYear == null || y > firstBuyYear))
    .sort((a, b) => b - a);
  if (fullYears.length < 2) return { signal: 'insufficient', note: 'أقل من سنتين كاملتين (بعد استبعاد سنة أول شراء الجزئية) — غير كافٍ للمقارنة' };

  const y1 = byYear[fullYears[0]], y0 = byYear[fullYears[1]];
  if (y0 <= 0) return { signal: 'insufficient', note: 'سنة المقارنة بلا توزيع' };
  const changePct = (y1 - y0) / y0 * 100;
  const yrs = `${fullYears[1]}→${fullYears[0]}`;
  let signal, note;
  if (changePct <= -25)    { signal = 'cut';     note = `DPS انخفض ${Math.abs(changePct).toFixed(0)}% (${yrs})`; }
  else if (changePct >= 5) { signal = 'growing'; note = `DPS نما ${changePct.toFixed(0)}% (${yrs})`; }
  else                     { signal = 'stable';  note = `DPS مستقر (±5%، ${yrs})`; }
  return { signal, changePct, note, years: yrs };
}

// ══════════════════════════════════════════════════════════════════════
// بوابة الاستدامة (الفلتر 1) — ثلاثة محاور، كل واحد على 3 مستويات:
//   التغطية:    covered | weak | uncovered    الأساسيات: healthy | soft | deteriorating
//   إشارة القطع: stable | temp | cut
// تُملأ المحاور آلياً من بياناتك عند غياب الإدخال اليدوي (لا تقدير صامت §8):
//   • الأساسيات والتغطية ← آخر تقييم في حاسبة القيمة العادلة (EPS/FFO/التوزيع)
//   • إشارة التوزيع ← اتجاه سجل الأرباح الفعلي
// مهم: الكشف الآلي أقصاه «أصفر/مراقبة» — التصفية (الأحمر) تتطلب تأكيدك اليدوي.
// النتيجة: fail=تدهور مؤكّد→تصفية · watch=قلق→مراقبة · pass=سليم · unknown=ناقص
// ══════════════════════════════════════════════════════════════════════
function sustainabilityOf(h) {
  const cfg = engineCfg[h.ticker] || {};
  let cov = cfg.divCoverage  || ({ yes: 'covered', no: 'weak' })[cfg.divCovered];
  let fun = cfg.fundamentals || ({ yes: 'healthy', no: 'soft' })[cfg.fundHealthy];
  let sig = cfg.divSignal    || ({ no: 'stable',   yes: 'temp' })[cfg.divCut];
  const autoSrc = {}; // محور → مصدر الاشتقاق الآلي (للوسم)

  // ① من آخر تقييم: الأساسيات (EPS/FFO) والتغطية حسب نوع الأصل — أقصاه أصفر
  const val = valByTicker[h.ticker];
  let covNote = null; // إعلان صريح عند تعذّر القياس الصحيح (الدستور §8)
  if (val) {
    const inp = val.inputs || {};
    const isReit = inp.companyType === 'reit';
    // AUDIT-FIX (2026-08): تقييم البنوك يخزّن التوزيع في bankDps لا dividends —
    // تجاهله كان يُبقي البنوك ⚪ دائماً (نفس fallback قاعدة التثبيت في loadAll).
    const eps = numOf(inp.eps), ffo = numOf(inp.ffo), div = numOf(inp.dividends ?? inp.bankDps);
    const earn = isReit ? ffo : eps;
    if (!fun && earn != null) {
      fun = earn > 0 ? 'healthy' : 'soft';        // سالب → مراقبة لا تصفية
      autoSrc.fun = `تقييم: ${isReit ? 'FFO' : 'EPS'} ${formatNum(earn)}`;
    }
    if (!cov && div != null && div > 0) {
      // AUDIT-FIX (2026-07): المقياس الصحيح حسب نوع الأصل (الدستور §3):
      // إسمنت/بتروكيماويات ← تغطية FCF (لا EPS)؛ REIT ← FFO؛ البقية ← EPS.
      const isCement = assetTypeOf(h) === 'cement_petro';
      const fcf = numOf(inp.fcf);
      if (isCement) {
        // AUDIT-FIX (2026-08): عند غياب/سلبية FCF كان القياس يسقط لـ EPS خلافاً
        // للدستور §3 — الآن تُعلن «تغطية FCF غير متوفرة» صراحةً (§8) بلا قياس بديل.
        const unitDoubt = fcfUnitsSuspect(fcf, eps, numOf(inp.currentPrice));
        if (unitDoubt) {
          // وحدات مشكوك فيها → لا تُحسب تغطية من رقم لا نثق بوحدته (§8)
          covNote = `⚠️ ${unitDoubt}. صحّح الرقم في حاسبة القيمة العادلة ليصير "للسهم الواحد"، أو أدخل التغطية يدوياً.`;
        } else if (fcf != null && fcf > 0) {
          const payout = div / fcf;
          cov = payout <= 1.0 ? 'covered' : 'weak';
          autoSrc.cov = `تقييم: توزيع/FCF = ${(payout * 100).toFixed(0)}%`;
        } else {
          covNote = 'تغطية FCF غير متوفرة (الدستور §3: الإسمنت/البتروكيماويات تُقاس بتغطية FCF لا EPS — أدخل FCF في التقييم أو التغطية يدوياً)';
        }
      } else {
        const coverBase = earn != null && earn > 0 ? earn : null;
        if (coverBase != null) {
          const payout = div / coverBase;
          cov = payout <= 1.0 ? 'covered' : 'weak';  // توزيع فوق مصدر التغطية → مراقبة
          autoSrc.cov = `تقييم: توزيع/${isReit ? 'FFO' : 'EPS'} = ${(payout * 100).toFixed(0)}%`;
        }
      }
    }
  }

  // ② من سجل الأرباح الفعلي: إشارة التوزيع — أقصاه أصفر
  const trend = dividendTrendOf(h.ticker);
  if (!sig && trend) {
    if (trend.signal === 'cut' || trend.signal === 'stopped')         { sig = 'temp';   autoSrc.sig = `أرباح: ${trend.note}`; }
    else if (trend.signal === 'growing' || trend.signal === 'stable') { sig = 'stable'; autoSrc.sig = `أرباح: ${trend.note}`; }
  }
  // وإلا: تقييم حديث بتوزيع قائم وموجب = لا إشارة قطع (مستقر) — استدلال معلَن
  if (!sig && val && numOf(val.inputs.dividends ?? val.inputs.bankDps) > 0) {
    sig = 'stable'; autoSrc.sig = 'تقييم: توزيع قائم، لا إشارة قطع بالسجل';
  }
  const tag = k => autoSrc[k] ? ` (آلي — ${autoSrc[k]})` : '';

  // مستوى أحمر (مزمن/مؤكّد) لا يأتي إلا من إدخالك اليدوي
  const structural = [];
  if (cov === 'uncovered')     structural.push('التوزيع غير مغطّى بشكل مزمن');
  if (fun === 'deteriorating') structural.push('تدهور أساسيات مستمر / EPS سالب متكرر');
  if (sig === 'cut')           structural.push('قطع توزيع مؤكّد');
  if (structural.length) return { status: 'fail', reason: structural.join('، '), trend, autoSrc };

  const soft = [];
  if (cov === 'weak') soft.push('ضعف تغطية التوزيع' + tag('cov'));
  if (fun === 'soft') soft.push('ضعف بالأساسيات' + tag('fun'));
  if (sig === 'temp') soft.push('انخفاض/تأجيل توزيع' + tag('sig'));
  if (soft.length) return { status: 'watch', reason: soft.join('، '), trend, autoSrc };

  if (cov === 'covered' && fun === 'healthy' && sig === 'stable') {
    return { status: 'pass', reason: 'التوزيع مغطّى + أساسيات سليمة + لا إشارة قطع', trend, autoSrc };
  }
  return { status: 'unknown', reason: 'بيانات الاستدامة غير مكتملة' + (covNote ? ` — ${covNote}` : ''), trend, autoSrc };
}

// ══════════════════════════════════════════════════════════════════════
// خطة الأسعار (الفلتر 3) — مصدرها صفحة «مهام المحفظة» لكل سهم:
//   accumulate = تجميع عند سعر ≤   |   trimFrom..trimTo = نطاق التخفيف
//   liquidate  = تصفية إذا تجاوز السعر هذا الحدّ (سعر التضخّم)
// تُرجع null إذا لا توجد أي خانة سعرية → القيمة «غير متوفرة» (تُعلَن صراحةً §8).
// ══════════════════════════════════════════════════════════════════════
function priceZonesOf(h) {
  const z = taskZones[h.ticker];
  if (!z) return null;
  const has = z.accumulate != null || z.trimFrom != null || z.trimTo != null || z.liquidate != null;
  return has ? z : null;
}

// ملاحظات الدستور الخاصة (§3) — تُعرَض كلافتة تحذيرية، لا تُغيّر منطق المحرّك آلياً
const SPECIAL_NOTES = {
  '5110': 'مرساة دفاعية (الدستور §3): توزيع 5110 محمي بمرسوم ملكي 2020 وملكية صندوق الاستثمارات. التدفق النقدي السالب = مصاريف رأسمالية مخططة، ليس تعثراً. لا تُفشِل بوابة الاستدامة لمجرد التدفق السالب.',
};
function specialNoteOf(h) {
  if (SPECIAL_NOTES[h.ticker]) return SPECIAL_NOTES[h.ticker];
  if (assetTypeOf(h) === 'cement_petro') {
    return 'سياق دوري (الدستور §3): في شركة إسمنت قديمة راسخة، نسبة توزيع مرتفعة قد تعكس قاع دورة أرباح مع توزيع مدعوم بميزانية نظيفة — لا تعثر. السياق قبل التصنيف.';
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// تقييم سهم واحد عبر الفلاتر بالترتيب الإجباري (الدستور §4 + §5)
// يرجّع: { action, label, reason, priority, gaps[], ... }
//   priority: 0=trigger ثابت | 1=فشل استدامة | 2=كسر سقف | 3=فرصة إضافة | 9=احتفظ
// ══════════════════════════════════════════════════════════════════════
function evaluateHolding(h, ctx) {
  const value  = +h.shares * +h.current_price;
  const weight = ctx.totalValue > 0 ? (value / ctx.totalValue) * 100 : 0;
  const price  = +h.current_price;
  const cap    = capOf(h);
  const assetType = assetTypeOf(h);
  const tgt    = stockTargets[h.ticker] || {};
  // فصل صارم بين مفهومين (إصلاح: لا نُلفّق هدفاً من السقف):
  //   • الهدف المسجّل: نسبة السهم من صفحة «أهداف الأسهم» — قد لا تكون موجودة.
  //   • السقف الدستوري: 7% عادي / 12% قيادي (الدستور §1) — حدّ صلب دائماً.
  // إذا لم يُسجَّل هدف (أو 0%) → لا نعرض هدفاً مفبركاً؛ نعرض «بلا هدف» ونراقب
  // السقف فقط. الانحراف يُحسب عن الهدف المسجّل حصراً.
  // هدف صفر مقصود = هدف صريح (وقيمته 0)، لا «بلا هدف». التمييز من قائمة
  // zeroTargets لأن العمود افتراضه 0 لكل رمز لم يُلمس.
  const zeroTarget = zeroTargets.has(h.ticker);
  const hasExplicitTarget = tgt.target_pct != null && (+tgt.target_pct > 0 || zeroTarget);
  const targetWeight = hasExplicitTarget ? (zeroTarget ? 0 : +tgt.target_pct) : null;

  const zones = priceZonesOf(h);      // خطة الأسعار من المهام (أو null)
  const sus = sustainabilityOf(h);
  const priceOk = price > 0 && +h.shares > 0; // حارس: بلا سعر/أسهم لا تُبنى إشارة سعرية
  const gaps = [];
  if (!priceOk) gaps.push('السعر الحالي');
  if (!zones)   gaps.push('خطة الأسعار (المهام)');
  if (sus.status === 'unknown') gaps.push('بوابة الاستدامة');
  if (!hasExplicitTarget) gaps.push('هدف الوزن (صفحة الأهداف)');
  const note = specialNoteOf(h);

  // انحراف الوزن عن الهدف المسجّل حصراً، مصنّفاً بعتبات الألوان من الإعدادات.
  // بلا هدف مسجّل: لا يوجد «انحراف هدف» (dev=null)؛ نراقب كسر السقف فقط.
  const thr = ctx.thresholds;
  const dev = hasExplicitTarget ? weight - targetWeight : null; // + فوق / − تحت
  const absDev = dev != null ? Math.abs(dev) : null;
  const devBand = dev == null ? 'none'
    : absDev <= thr.green ? 'green' : absDev <= thr.yellow ? 'yellow' : 'red';
  const devTxt = dev != null ? `${dev >= 0 ? '+' : '−'}${formatNum(absDev)} نقطة` : 'بلا هدف مسجّل';
  const overCap = weight > cap + CAP_BUFFER;   // كسر السقف الدستوري بعد منطقة السماح (§1/§4) — حدّ صلب دائماً

  const taskType = taskTypes[h.ticker] || null; // قرار المالك من صفحة المهام
  const userWatching = taskType === 'monitoring';

  // مرجع التقييم: القيمة العادلة من آخر تقييم + عمره (للسياق والتحذير من القِدم)
  const val = valByTicker[h.ticker] || null;
  const valAge = valAgeDays(val);
  const valStale = valAge != null && valAge > VAL_STALE_DAYS;

  const base = {
    ticker: h.ticker, name: h.name, sector: h.sector, shares: +h.shares,
    weight, cap, price, value, assetType, zones, taskType,
    taskConflict: (taskConflicts[h.ticker] || 0) > 1 ? taskConflicts[h.ticker] : null,
    sustain: sus, targetWeight, hasTarget: hasExplicitTarget,
    entryPrice: tgt.entry_price != null ? +tgt.entry_price : null,
    exitPrice:  tgt.exit_price  != null ? +tgt.exit_price  : null,
    gaps, specialNote: note,
    fairValue: val && val.fair ? val.fair.avg : null, valDate: val ? val.date : null,
    valFair: val && val.fair ? val.fair : null, valInputs: val ? val.inputs : null,
    valAgeDays: valAge, valStale, stabilizationFlag: val ? val.stabilizationFlag : null,
    fvUnreliable: !!(val && val.unreliable), fvCV: val ? val.cv : null,
    xirr: stockFinancials(h.ticker).xirr,
    blueChip: isBlueChip(h), dev, devBand, overCap, severity: 'green',
  };

  // ── P0.1: قرار تصفية صريح منك — هدف صفر أو مهمة «تصفية» ────────────
  // AUDIT-FIX (2026-08-18): المحرّك كان يحترم مهمة «مراقبة» (يخفّض التصفية إلى
  // مراقبة) لكنه يتجاهل مهمة «تصفية» تماماً — احترام غير متماثل لقرارك. ومعه
  // كان «هدف صفر» يُقرأ «بلا هدف» فيراقب السقف فقط بدل تنفيذ نيّتك بالخروج.
  // الآن قرارك الصريح يسبق كل شيء — حتى حارس السعر وtriggers الثابتة — لأنه
  // لا يعتمد على السعر إطلاقاً، فلا معنى لتعليقه بسبب سعر مشبوه.
  const wantsExit = zeroTarget || taskTypes[h.ticker] === 'liquidation';
  if (wantsExit && +h.shares > 0) {
    const src = zeroTarget && taskTypes[h.ticker] === 'liquidation'
      ? 'هدفك لهذا السهم 0% في صفحة الأهداف، ومهمته «تصفية» في صفحة المهام'
      : zeroTarget ? 'هدفك لهذا السهم 0% في صفحة الأهداف'
      : 'مهمته «تصفية» في صفحة المهام';
    return { ...base, action: 'exit', label: 'تصفية', priority: 1, severity: 'red',
      reason: `قرار تصفية صريح منك: ${src} → المطلوب بيع كامل المركز (${formatNum(base.shares)} سهماً، ${formatNum(base.value)} ر.س). `
        + `المحرّك لا يناقش هذا القرار ولا يوازنه بالقيمة العادلة — هو قرارك لا استنتاجه. `
        + `لإلغائه: امسح خانة الهدف (لا تكتب صفراً) أو أغلق مهمة التصفية.` };
  }

  // ── P0.5: حارس السعر — يسبق كل إشارة سعرية بما فيها triggers ─────────
  // قرار مبني على سعر مشبوه أو قديم أسوأ من قرار مفقود: يبدو واثقاً وهو خاطئ.
  // يُستثنى منه قرارك الصريح بالخروج (هدف صفر / مهمة تصفية) لأنه لا يعتمد على
  // السعر أصلاً — وقد عولج قبله بخطوة.
  const pAlert = priceAlerts[h.ticker];
  if (pAlert) {
    const head = pAlert.kind === 'split' ? '🔀 تجزئة محتملة'
      : pAlert.kind === 'jump' ? '⚡ تحرّك سعري غير اعتيادي' : '⏰ سعر قديم';
    return { ...base, action: 'monitor', label: 'موقوف — تحقّق من السعر',
      priority: 1.2, severity: 'yellow', priceAlert: pAlert,
      reason: `${head}: ${pAlert.msg} `
        + `أوقف المحرّك كل إشارة سعرية لهذا السهم (سقف الوزن، القيمة العادلة، مناطق التجميع والتخفيف، `
        + `وحتى المشغّلات الثابتة) لأنها كلها مشتقّة من السعر. تُستأنف تلقائياً بمجرد أن يصبح السعر سليماً.` };
  }

  // ── P0: triggers الثابتة — فوق كل شي (الدستور §5) ──
  const trig = FIXED_TRIGGERS.find(t => t.ticker === h.ticker);
  if (trig) {
    // AUDIT-FIX (2026-08): حارس priceOk — سعر 0/مفقود كان يُطلق trigger «lte»
    // (أرامكو ≤29) كإشارة كاذبة بأولوية 0. بلا سعر صالح لا تُبنى إشارة سعرية.
    base.trigger = { ...trig, fired: priceOk && (trig.cmp === 'gte' ? price >= trig.price : price <= trig.price) };
    if (base.trigger.fired) {
      if (trig.kind === 'sell') {
        return { ...base, action: 'exit', label: 'تصفية', priority: 0, severity: 'red',
          reason: `trigger ثابت: ${trig.label} — انطبق (السعر ${formatNum(price)} ${trig.cmp === 'gte' ? '≥' : '≤'} ${trig.price})` };
      }
      // reduce → تخفيف لإرجاع الوزن لهدف الـtrigger
      const cutTo = trig.toWeight;
      return { ...base, action: weight > cutTo ? 'trim' : 'hold',
        label: weight > cutTo ? `تخفيف إلى ${cutTo}%` : 'احتفاظ',
        cutToWeight: cutTo, priority: 0, severity: weight > cutTo ? 'red' : 'green',
        reason: `trigger ثابت: ${trig.label} — انطبق (السعر ${formatNum(price)} ≤ ${trig.price})` };
    }
  }

  // ── P1: سعر التصفية (تضخّم) من المهام — قرار بيع صريح، يسبق إشارات الاستدامة ──
  if (zones && zones.liquidate && priceOk && price > zones.liquidate) {
    return { ...base, action: 'exit', label: 'تصفية', priority: 1, severity: 'red',
      reason: `سعر التضخّم (المهام): السعر ${formatNum(price)} تجاوز حدّ التصفية ${formatNum(zones.liquidate)} → بيع كامل` };
  }

  // ── P1: بوابة الاستدامة (الفلتر 1) — متدرّجة، لا تصفية على فشل ربع واحد ──
  // تدهور مؤكّد/مزمن = تصفية. لكن لو واضعه «مراقبة» بقرارك → نحترم قرارك ونراقب.
  if (sus.status === 'fail') {
    if (userWatching) {
      return { ...base, action: 'monitor', label: 'مراقبة', priority: 1.5, severity: 'monitor',
        reason: `تدهور مؤكّد بالاستدامة (${sus.reason}) — لكنك واضعه تحت «المراقبة» بقرارك في المهام، فالقرار: راقب ولا تصفِّ بعد` };
    }
    return { ...base, action: 'exit', label: 'تصفية', priority: 1, severity: 'red',
      reason: `تدهور مؤكّد/مزمن ببوابة الاستدامة (الفلتر 1): ${sus.reason}` };
  }
  // قلق مؤقت (ربع واحد) → مراقبة، لا تصفية. AUDIT-FIX (2026-08): بلا رجوع مبكر —
  // «المراقبة» لا توقف سلسلة الفلاتر: فحوص كسر سقف الوزن / نطاق التخفيف / سقف
  // القيمة تُستكمل (الفلتر 4: لو الوزن > السقف خفّف بغضّ النظر عن القيمة)، وإن
  // انطبق أحدها تصدر توصيته مع دمج ملاحظة المراقبة في السبب؛ وإلا «مراقبة» كما كانت.
  const watchNote = sus.status === 'watch' ? `تنبيه استدامة مؤقت (${sus.reason})` : null;

  // ── P2: نطاق التخفيف من المهام (الفلتر 3) — السعر دخل نطاق بيع الزائد ──
  const inTrimBand = zones && zones.trimFrom && priceOk && price >= zones.trimFrom;
  // ── P2: كسر السقف الدستوري (دائماً) أو تجاوز الهدف المسجّل خارج العتبة الخضراء ──
  const overTarget = hasExplicitTarget && dev > thr.green; // فوق الهدف المسجّل

  if (overCap || overTarget || inTrimBand) {
    const reasons = [];
    let cutTo = null, severity = 'green', label = '';
    if (inTrimBand) {
      const to = zones.trimTo ? `–${formatNum(zones.trimTo)}` : '';
      reasons.push(`نطاق التخفيف (المهام): السعر ${formatNum(price)} ≥ ${formatNum(zones.trimFrom)}${to} → بيع الزائد`);
    }
    if (overCap) {
      // كسر السقف = خطر تركيز (الفلتر 4) — يفرض الإرجاع للسقف بغضّ النظر عن الهدف/القيمة
      reasons.push(`الوزن ${formatNum(weight)}% كسر السقف الدستوري ${formatNum(cap)}% (الفلتر 4 — خطر تركيز)`);
      cutTo = cap; severity = 'red';
      label = `تخفيف لإرجاع الوزن إلى السقف ${formatNum(cap)}%`;
    } else if (overTarget) {
      reasons.push(`الوزن ${formatNum(weight)}% فوق الهدف المسجّل ${formatNum(targetWeight)}% (انحراف ${devTxt}، عتبة ${devBand === 'red' ? 'حمراء' : 'صفراء'})`);
      cutTo = targetWeight; severity = devBand;
      label = severity === 'red'
        ? `تخفيف لإرجاع الوزن إلى الهدف ${formatNum(targetWeight)}%`
        : `تنبيه: فوق الهدف (${formatNum(weight)}%)`;
    }
    if (inTrimBand) {                         // نطاق السعر صريح = أحمر دائماً
      severity = 'red';
      if (!overCap) { label = 'تخفيف (نطاق السعر)'; if (cutTo == null) cutTo = targetWeight; }
    }
    if (watchNote) reasons.push(`ملاحظة استدامة: ${watchNote} — تأكّد من ربع آخر`);
    return { ...base, action: 'trim', severity,
      label, cutToWeight: cutTo,
      priority: severity === 'red' ? 2 : 2.5,
      reason: reasons.join(' | ') };
  }

  // ── P2.5: سقف القيمة (الفلتر 3) — السعر فوق العادلة بهامش معتبر ──
  // AUDIT-FIX (2026-07): كان الفلتر 3 يُعرض في البطاقة التفصيلية فقط دون أن
  // يرشّح أي إجراء. الآن: تجاوز ≥15% فوق آخر قيمة عادلة (غير قديمة) يرفع
  // «مرشّح تخفيف (فوق العادلة)» — ترشيح للمراجعة لا بيع آلي، احتراماً لقاعدة
  // §8 «ممنوع بيع رابح قوي توزيعه ينمو لمجرد ارتفاع السعر».
  const fvMargin = (base.fairValue != null && base.fairValue > 0 && priceOk)
    ? (base.fairValue - price) / base.fairValue * 100 : null;
  if (base.fvUnreliable && fvMargin != null && fvMargin <= -15 && !valStale) {
    return { ...base, action: 'monitor', label: 'راجع التقييم', priority: 2.8, severity: 'yellow',
      reason: `السعر ${formatNum(price)} يبدو فوق القيمة العادلة ${formatNum(base.fairValue)}، `
        + `لكن **الحاسبة نفسها رفضت اعتماد رقم واحد** لهذا السهم: تشتّت النماذج `
        + `${base.fvCV != null ? formatNum(base.fvCV, 0) + '% ' : ''}تجاوز العتبة بلا مرساة، `
        + `والرقم المحفوظ متوسط حسابي «للعلم فقط». فلا يُرشَّح للتخفيف بناءً عليه. `
        + `أعِد تقييمه في حاسبة القيمة العادلة بمرساة، أو اعتمد نطاقاً لا رقماً.` };
  }
  if (fvMargin != null && fvMargin <= -15 && !valStale && !base.fvUnreliable) {
    return { ...base, action: 'monitor', label: 'مرشّح تخفيف (فوق العادلة)', priority: 2.7, severity: 'yellow',
      reason: `سقف القيمة (الفلتر 3): السعر ${formatNum(price)} أعلى من القيمة العادلة ${formatNum(base.fairValue)} بهامش ${formatNum(Math.abs(fvMargin))}% (> 15%) — مرشّح للتخفيف بعد مراجعتك. لا بيع آلي: تحقق أولاً أن التقييم محدَّث وأن الأرقام لم ترتفع فعلاً (قاعدة التثبيت §4)`
        + (watchNote ? ` | ملاحظة استدامة: ${watchNote}` : '') };
  }

  // قلق استدامة مؤقت ولا قاعدة وزن/سعر انطبقت → «مراقبة» (السلوك السابق نفسه،
  // لكنه الآن يصدر بعد استكمال فحوص الوزن/سقف القيمة/نطاق التخفيف لا قبلها)
  if (watchNote) {
    return { ...base, action: 'monitor', label: 'مراقبة', priority: 1.5, severity: 'monitor',
      reason: `${watchNote} — القرار الأمثل مراقبة لا تصفية؛ تأكّد من ربع آخر قبل أي إجراء` };
  }

  // ── P3: تجميع من المهام (الفلتر 3) — السعر ≤ حدّ التجميع + استدامة سليمة + وزن تحت الهدف بعتبة ──
  const inBuyZone = zones && zones.accumulate && priceOk && sus.status === 'pass'
      && price <= zones.accumulate
      && (hasExplicitTarget ? dev < -thr.green : weight < cap); // تحت الهدف، أو (بلا هدف) دون السقف
  if (inBuyZone) {
    if (!hasExplicitTarget) {
      // الهدف الفردي للسهم غير محدَّد، والشراء «مشروط مو آلي». بلا نسبة هدف
      // صريحة لا تُطلَق توصية تجميع آلية — يُعرَض كمرشّح مع إرشاد لضبط الهدف.
      return { ...base, action: 'hold', label: 'مرشّح تجميع (يحتاج هدف)', priority: 4,
        buyZone: true, severity: 'yellow',
        reason: `في منطقة التجميع (السعر ${formatNum(price)} ≤ حدّ التجميع ${formatNum(zones.accumulate)}) + استدامة سليمة، لكن لا يوجد هدف فردي مسجَّل. حدّد هدف السهم في صفحة «أهداف الأسهم» لتفعيل توصية التجميع (§4: الشراء مشروط مو آلي)` };
    }
    return { ...base, action: 'add', label: 'تجميع (مشروط)', priority: 3, severity: 'add',
      reason: `منطقة تجميع (المهام): السعر ${formatNum(price)} ≤ حدّ التجميع ${formatNum(zones.accumulate)} + استدامة سليمة + الوزن ${formatNum(weight)}% < الهدف ${formatNum(targetWeight)}% (انحراف ${devTxt})` };
  }

  // ── مراقبة بقرارك ── لو واضعه «مراقبة» في المهام ولا قاعدة أقوى انطبقت
  if (userWatching) {
    return { ...base, action: 'monitor', label: 'مراقبة', priority: 5, severity: 'monitor',
      reason: `تحت المراقبة بقرارك (مهمة «مراقبة») — لا قاعدة سعر/وزن/استدامة تفرض إجراءً الآن` };
  }

  // ── احتفاظ ── (ضمن العتبة الخضراء أو لا قاعدة انطبقت)
  let holdReason;
  if (!hasExplicitTarget) {
    holdReason = `احتفاظ — لا هدف وزن مسجّل لهذا السهم؛ الوزن ${formatNum(weight)}% ضمن السقف ${formatNum(cap)}%. سجّل هدفاً في صفحة «أهداف الأسهم» لتفعيل مراقبة الانحراف`;
    const otherGaps = gaps.filter(g => g !== 'هدف الوزن (صفحة الأهداف)');
    if (otherGaps.length) holdReason += `. بيانات أخرى ناقصة: ${otherGaps.join('، ')}`;
  } else if (gaps.length) {
    holdReason = `احتفاظ — لا قاعدة انطبقت. بيانات غير متوفرة: ${gaps.join('، ')}`;
  } else if (devBand !== 'green') {
    holdReason = `احتفاظ — الانحراف ${devTxt} ضمن المتابعة، لا قاعدة سعر/استدامة انطبقت`;
  } else {
    holdReason = `احتفاظ — الوزن ضمن العتبة الخضراء (انحراف ${devTxt})، الاستدامة سليمة`;
  }
  return { ...base, action: 'hold', label: 'احتفاظ', priority: 9, severity: 'green', reason: holdReason };
}

// ══════════════════════════════════════════════════════════════════════
// التهيئة والتحميل
// ══════════════════════════════════════════════════════════════════════
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-decision-engine');
  const load = await loadAll();
  if (!load.ok) {
    // AUDIT-FIX (2026-08): فشل التحميل كان يمر صامتاً → محرّك على لقطة فارغة
    // يدهس decision_engine_snapshot_v1 السليمة مع «✅ لا يوجد إجراء» كاذبة.
    // الآن: نعلن الخطأ، لا نشغّل المحرّك، ولا نحفظ اللقطة.
    const hero = document.getElementById('de-hero-line');
    if (hero) hero.innerHTML = `⛔ تعذّر تحميل بيانات المحفظة — لم يُشغَّل المحرّك ولم تُلمَس اللقطة المحفوظة. أعد تحميل الصفحة أو تحقق من الاتصال.<br><span class="small text-muted">${escapeHtmlSafe(load.errorMsg)}</span>`;
    showToast('⛔ تعذّر تحميل البيانات — المحرّك لم يعمل', 'error');
    return;
  }
  runEngine();
}

async function loadAll() {
  const [rH, rT, rEng, rTasks, rDiv, rVal, rTx, rRev, rZero, rPW, rSecT] = await Promise.all([
    supabaseClient.from('holdings').select('ticker, name, sector, shares, avg_price, current_price, target_weight, price_updated_at, price_manual').order('ticker'),
    supabaseClient.from('stock_targets').select('ticker, target_pct, entry_price, exit_price'),
    loadUserSetting(ENGINE_STORE_KEY),
    supabaseClient.from('portfolio_tasks')
      .select('ticker, type, accumulate_at, target_price, trim_from, trim_to, liquidate_above, status, updated_at, created_at')
      .eq('status', 'active').order('updated_at', { ascending: false }),
    supabaseClient.from('dividends').select('ticker, amount, date').eq('is_archived', false),
    loadUserSetting(ENGINE_VAL_KEY),
    supabaseClient.from('transactions').select('ticker, type, shares, date, total, price, commission, vat').eq('is_archived', false),
    // دفتر المراجعة — لعرض آخر مراجعة لكل سهم داخل التقرير وحساب استحقاق الدورة (§5)
    supabaseClient.from('review_log').select('ticker, review_date, notes').order('review_date', { ascending: false }),
    loadUserSetting(ZERO_TARGETS_KEY),
    loadUserSetting(PRICE_WATCH_KEY),
    // أهداف القطاعات — تُستعمل في «خطة الوصول إلى أهدافك» (المستوى القطاعي)
    supabaseClient.from('sector_targets').select('sector, target_pct'),
  ]);
  // فشل التحميل = مجموعة فارغة، وهو الجانب الآمن (لا أوامر تصفية مخترَعة)
  zeroTargets = new Set(Array.isArray(rZero) ? rZero : []);
  priceWatch = (rPW && typeof rPW === 'object' && !Array.isArray(rPW)) ? rPW : {};

  // AUDIT-FIX (2026-08): افحص خطأ كل استعلام قبل أي معالجة — أي فشل يوقف كل شيء
  // (loadUserSetting يرجع null عند الفشل ولا يفرَّق عن «غير موجود» — يُعامل كفارغ)
  const failed = [
    ['holdings', rH.error], ['stock_targets', rT.error], ['portfolio_tasks', rTasks.error],
    ['dividends', rDiv.error], ['transactions', rTx.error],
  ].filter(([, e]) => e);
  if (failed.length) {
    return { ok: false, errorMsg: failed.map(([t, e]) => `${t}: ${e.message || e}`).join(' · ') };
  }

  holdings = rH.data || [];
  stockTargets = {};
  (rT.data || []).forEach(r => { stockTargets[r.ticker] = r; });
  sectorTargets = {};
  ((rSecT && rSecT.data) || []).forEach(r => {
    const k = String(r.sector || '').trim();
    if (k) sectorTargets[k] = +r.target_pct || 0;
  });
  engineCfg = rEng || {};

  // سجل الأرباح الفعلي لكل رمز — مصدر كشف اتجاه التوزيع آلياً
  divByTicker = {};
  (rDiv.data || []).forEach(d => {
    const tk = (d.ticker || '').trim().toUpperCase();
    if (!tk || !d.date) return;
    (divByTicker[tk] = divByTicker[tk] || []).push({ amount: +d.amount || 0, date: new Date(d.date) });
  });

  // المعاملات لكل رمز (مرتّبة تصاعدياً) — لاستخراج عدد الأسهم وقت كل توزيع → DPS
  txByTicker = {};
  (rTx.data || []).forEach(t => {
    const tk = (t.ticker || '').trim().toUpperCase();
    if (!tk || !t.date) return;
    (txByTicker[tk] = txByTicker[tk] || []).push({ type: t.type, shares: +t.shares || 0, total: +t.total || 0, price: +t.price || 0,
      fees: (+t.commission || 0) + (+t.vat || 0), date: new Date(t.date) });
  });
  Object.values(txByTicker).forEach(rows => rows.sort((a, b) => a.date - b.date));

  // آخر تقييم لكل رمز من حاسبة القيمة العادلة (السجل مرتّب بالأحدث أولاً) + التقييم السابق مباشرة
  // لتطبيق «قاعدة التثبيت» (الدستور §4 الفلتر 2): القيمة العادلة ترتفع فقط لو الأرباح/FCF/التوزيع ارتفعوا فعلاً.
  // دفتر المراجعة لكل رمز (الأحدث أولاً) — خطأ التحميل لا يوقف المحرّك، القسم يُخفى فقط
  reviewByTicker = {};
  if (!rRev.error) {
    (rRev.data || []).forEach(e => {
      const tk = (e.ticker || '').trim().toUpperCase();
      if (!tk || !e.review_date) return;
      (reviewByTicker[tk] = reviewByTicker[tk] || []).push({ date: e.review_date, notes: e.notes || '' });
    });
  }

  // هدف الدخل الشهري (§1) — من إعدادات المالك، وإلا هدف الدستور 5,000 ر.س
  incomeGoalMonthly = 5000;
  try {
    const raw = localStorage.getItem(userLsKey(RET_GOAL_LS_KEY)) || localStorage.getItem(RET_GOAL_LS_KEY);
    const g = raw ? JSON.parse(raw) : null;
    if (g && +g.monthly > 0) incomeGoalMonthly = +g.monthly;
  } catch (_) { /* القيمة الافتراضية من الدستور تبقى */ }

  valByTicker = {};
  valHistByTicker = {};
  const prevValByTicker = {};
  (Array.isArray(rVal) ? rVal : []).forEach(entry => {
    const tk = (entry.inputs?.ticker || '').trim().toUpperCase();
    if (!tk) return;
    // AUDIT-FIX (2026-07): المصدر الأول هو fairValueAvg الرقمي المخزَّن في السجل
    // (نفس ما تقرأه صفحة الأهداف) — تحليل النص المعروض احتياطي فقط للسجل القديم.
    const parsedRange = parseFairValueRange(entry.results?.fairValueRange);
    const avgNum = (entry.results?.fairValueAvg != null && isFinite(+entry.results.fairValueAvg) && +entry.results.fairValueAvg > 0)
      ? +entry.results.fairValueAvg : null;
    const rec = {
      ts: typeof entry.id === 'number' ? entry.id : parseValEntryDate(entry.date),
      date: (entry.date || '').split('،')[0] || '',
      fair: avgNum != null
        ? { avg: avgNum, min: parsedRange?.min ?? avgNum, max: parsedRange?.max ?? avgNum }
        : parsedRange,
      inputs: entry.inputs || {},
      results: entry.results || {},
      // AUDIT-FIX (2026-08-18): الحاسبة ترفع fairValueUnreliable حين يتجاوز تشتّت
      // النماذج 30% بلا مرساة، وتقول للمالك حرفياً «لا تبنِ قراراً على رقم واحد» —
      // ثم تحفظ المتوسط الحسابي في fairValueAvg على أي حال. كان المحرّك يقرأ الرقم
      // ويتجاهل التحذير، فيرشّح سهماً للتخفيف بناءً على رقم رفضت الحاسبة إعطاءه.
      unreliable: entry.results?.fairValueUnreliable === true,
      cv: (entry.results?.dispersionCV != null && isFinite(+entry.results.dispersionCV))
        ? +entry.results.dispersionCV : null,
    };
    (valHistByTicker[tk] = valHistByTicker[tk] || []).push(rec); // السجل الكامل لتتبّع التطور (§4)
    if (!valByTicker[tk]) valByTicker[tk] = rec;          // أول ظهور = الأحدث
    else if (!prevValByTicker[tk]) prevValByTicker[tk] = rec; // ثاني ظهور = التقييم السابق مباشرة
  });
  // فحص قاعدة التثبيت: القيمة العادلة ارتفعت، هل ارتفعت الأرباح/FCF/التوزيع فعلاً معها؟
  Object.keys(valByTicker).forEach(tk => {
    const cur = valByTicker[tk], prev = prevValByTicker[tk];
    if (!cur.fair || !prev || !prev.fair) return;
    const fairRose = cur.fair.avg > prev.fair.avg * 1.01; // هامش ضجيج 1%
    if (!fairRose) return;
    const isReit = cur.inputs.companyType === 'reit';
    const earnKey = isReit ? 'ffo' : 'eps';
    const curEarn = numOf(cur.inputs[earnKey]), prevEarn = numOf(prev.inputs[earnKey]);
    const curDiv  = numOf(cur.inputs.dividends || cur.inputs.bankDps);
    const prevDiv = numOf(prev.inputs.dividends || prev.inputs.bankDps);
    const curFcf  = numOf(cur.inputs.fcf), prevFcf = numOf(prev.inputs.fcf);
    const earnUp = curEarn != null && prevEarn != null && curEarn > prevEarn;
    const divUp  = curDiv  != null && prevDiv  != null && curDiv  > prevDiv;
    const fcfUp  = curFcf  != null && prevFcf  != null && curFcf  > prevFcf;
    if (!earnUp && !divUp && !fcfUp) {
      cur.stabilizationFlag = `⚠️ القيمة العادلة ارتفعت من ${formatNum(prev.fair.avg)} إلى ${formatNum(cur.fair.avg)} (${prev.date || '—'} → ${cur.date || '—'}) بدون دليل ارتفاع فعلي في ${isReit ? 'FFO' : 'EPS'}/FCF/التوزيع بالأرقام المُدخلة — راجع قاعدة التثبيت (الدستور §4 الفلتر 2)`;
    }
  });

  // خطة الأسعار + نوع المهمة لكل رمز من المهام النشطة — أحدث مهمة هي المرجع
  taskZones = {};
  taskTypes = {};
  taskConflicts = {};
  (rTasks.data || []).forEach(t => {
    const tk = (t.ticker || '').trim().toUpperCase();
    if (!tk) return;
    // AUDIT-FIX (2026-08): أكثر من مهمة نشطة لنفس الرمز كانت تُحسم صامتاً
    // بالأحدث — الآن تُعَدّ ويُنبَّه عليها في نتائج السهم.
    taskConflicts[tk] = (taskConflicts[tk] || 0) + 1;
    if (taskZones[tk]) return; // مرتّبة بالأحدث → أول ظهور هو الأحدث
    const num = v => (v != null && +v > 0 ? +v : null);
    taskZones[tk] = {
      // AUDIT-FIX (2026-08): مهام التجميع القديمة تخزّن السعر في target_price —
      // نفس fallback صفحة المهام (accumulate_at ?? target_price) حتى لا تضيع إشارة شراء.
      accumulate: num(t.accumulate_at ?? (t.type === 'accumulation' ? t.target_price : null)),
      trimFrom:   num(t.trim_from),
      trimTo:     num(t.trim_to),
      liquidate:  num(t.liquidate_above),
    };
    taskTypes[tk] = t.type || null;
  });
  return { ok: true };
}

// عتبات ألوان التنبيهات من الإعدادات (نفس مفاتيح لوحة التحكم) — قابلة للتغيير
// أخضر = انحراف ضمن الهدف · أصفر = تنبيه · أحمر = إجراء. تُقرأ كل تشغيل فتتأقلم.
function alertThresholds() {
  const g = +(localStorage.getItem(userLsKey('tharwa-alert-green'))  ?? localStorage.getItem('tharwa-alert-green')  ?? 1);
  const y = +(localStorage.getItem(userLsKey('tharwa-alert-yellow')) ?? localStorage.getItem('tharwa-alert-yellow') ?? 3);
  return { green: isFinite(g) && g > 0 ? g : 1, yellow: isFinite(y) && y > 0 ? y : 3 };
}

// ══════════════════════════════════════════════════════════════════════
// تشغيل المحرّك + الرسم
// ══════════════════════════════════════════════════════════════════════
function runEngine() {
  const totalValue = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  const thresholds = alertThresholds();
  buildPriceAlerts();   // قبل التقييم — نتائجه تحكم كل إشارة سعرية
  // قرار كل سهم فردي يعتمد على وزنه وهدفه الفرديين فقط — سقف القطاع 25%
  // يُفحَص على مستوى المحفظة في قسم منفصل (renderSectorCheck)، لا يُطبَّق على السهم.
  const ctx = { totalValue, thresholds };
  window._deThresholds = thresholds;

  _results = holdings.map(h => evaluateHolding(h, ctx));

  renderSummaryStrip(totalValue);
  renderActionGroups();
  renderSectorCheck(totalValue);
  renderTargetPlan();
  restoreFolds();
  renderCards();

  // حفظ لقطة كاملة لمخرجات المحرّك → user_settings (تُدرَج في تقرير المراجعة وتُنسَخ احتياطياً)
  // AUDIT-FIX (2026-08): الفشل لم يعد يُكتم — saveEngineSnapshot تعالج خطأها وتُظهر toast
  saveEngineSnapshot(totalValue, thresholds);

  // طبقة الذكاء (js/decision-intel.js): القياس مقابل تاسي، تنبؤ التوزيعات،
  // «لو أنا مكانك»، والموثوقية. تعمل على مخرجات المحرّك نفسها ولا تغيّرها.
  // فشلها لا يوقف المحرّك — الصفحة تبقى كاملة بدونها.
  if (window.DecisionIntel) {
    window.DecisionIntel.boot({
      holdings, results: _results, totalValue, thresholds,
      txByTicker, divByTicker, valByTicker, engineCfg,
      incomeGoalMonthly, sharesAt: sharesAtDateOf,
    });
  }
}

// مفتاح لقطة المخرجات (مزامَن عبر user_settings ومشمول في النسخة الاحتياطية)
const ENGINE_SNAPSHOT_KEY = 'decision_engine_snapshot_v1';

async function saveEngineSnapshot(totalValue, thresholds) {
  const snapshot = {
    generated_at:  new Date().toISOString(),
    totalValue,
    thresholds,
    caps:          { ...CAPS },
    portfolioSize: { ...PORTFOLIO_SIZE, current: holdings.length },
    fixedTriggers: FIXED_TRIGGERS.map(t => ({ ...t })),
    assetLabels:   { ...ASSET_LABEL },
    sustainMetric: { ...SUSTAIN_METRIC },
    results:       _results,   // كائنات بسيطة قابلة للتسلسل (بلا دوال)
  };
  // AUDIT-FIX (2026-08): كان الفشل يُكتم مرتين (هنا وفي runEngine) — الآن يظهر toast
  let ok = false;
  try { ok = await saveUserSetting(ENGINE_SNAPSHOT_KEY, snapshot); } catch (_) { ok = false; }
  if (!ok) showToast('⚠️ تعذّر حفظ لقطة محرّك القرار — النتائج معروضة لكن اللقطة لم تُحدَّث', 'error');
}

// ── شريط ملخص علوي: عدّ الإجراءات + فجوات البيانات ──
function renderSummaryStrip(totalValue) {
  // عرض العتبات الفعّالة (من الإعدادات) فوق الجدول
  const thEl = document.getElementById('de-thresholds');
  const t = window._deThresholds || { green: 1, yellow: 3 };
  if (thEl) thEl.innerHTML = `عتباتك الحالية لانحراف الوزن عن الهدف: ` +
    `<strong style="color:#10b981">ضمن ±${formatNum(t.green)}% أخضر</strong> · ` +
    `<strong style="color:#f59e0b">حتى ±${formatNum(t.yellow)}% أصفر</strong> · ` +
    `<strong style="color:#ef4444">أكثر أحمر</strong> — تُغيَّر من <a href="settings.html">الإعدادات</a>.`;

  const el = document.getElementById('de-summary');
  if (!el) return;
  const n = (a) => _results.filter(r => r.action === a).length;
  const gapsFV  = _results.filter(r => r.zones == null).length;
  const gapsSus = _results.filter(r => r.sustain.status === 'unknown').length;
  const count = holdings.length;
  const sizeOk = count >= PORTFOLIO_SIZE.min && count <= PORTFOLIO_SIZE.max;
  const needAction = n('exit') + n('trim') + n('add') + _results.filter(r => r.action === 'hold' && r.buyZone).length;

  // شريط مبسّط: أرقام الإجراءات فقط + عدد الأسهم. النواقص تُعرض كسطر ملاحظة أسفل الجدول لا كخانة غامضة.
  el.innerHTML = `
    <div class="de-stat de-stat-exit"><div class="de-stat-num">${n('exit')}</div><div class="de-stat-lbl">تصفية</div></div>
    <div class="de-stat de-stat-trim"><div class="de-stat-num">${n('trim')}</div><div class="de-stat-lbl">تخفيف</div></div>
    <div class="de-stat de-stat-monitor"><div class="de-stat-num">${n('monitor')}</div><div class="de-stat-lbl">مراقبة</div></div>
    <div class="de-stat de-stat-add"><div class="de-stat-num">${n('add')}</div><div class="de-stat-lbl">تجميع</div></div>
    <div class="de-stat de-stat-hold"><div class="de-stat-num">${n('hold')}</div><div class="de-stat-lbl">احتفاظ</div></div>
    <div class="de-stat"><div class="de-stat-num">${count} <span style="font-size:.6em;color:${sizeOk?'#10b981':'#f59e0b'}">${sizeOk?'✓':'⚠'}</span></div><div class="de-stat-lbl">عدد الأسهم (الهدف ${PORTFOLIO_SIZE.min}–${PORTFOLIO_SIZE.max})</div></div>
  `;

  // سطر خلاصة بلغة بسيطة فوق الصفحة — أول شيء يشوفه المستخدم
  const hero = document.getElementById('de-hero-line');
  if (hero) {
    hero.innerHTML = needAction > 0
      ? `عندك <strong style="color:var(--accent)">${needAction}</strong> ${needAction === 1 ? 'سهم يحتاج' : 'أسهم تحتاج'} قراراً منك الآن. الباقي ضمن القواعد — شوف المجموعات بالأسفل.`
      : `✅ لا يوجد إجراء مطلوب الآن — كل أسهمك ضمن قواعد محفظتك.`;
    // نواقص البيانات كملاحظة هادئة لا كخانة رقمية غامضة
    const noteEl = document.getElementById('de-gaps-note');
    if (noteEl) {
      noteEl.innerHTML = (gapsFV || gapsSus)
        ? `ℹ️ لإكمال الدقّة: ${gapsFV ? `<strong>${gapsFV}</strong> سهم بلا خطة أسعار` : ''}${gapsFV && gapsSus ? ' · ' : ''}${gapsSus ? `<strong>${gapsSus}</strong> سهم بلا بيانات استدامة` : ''} — أدخلها عبر زر ⚙️ في بطاقة السهم.`
        : '';
    }
  }

  // سطر دخل بسيط: أين أنت من هدف 5000 ر.س شهرياً بحلول 2045 (الدستور §1)
  const incomeEl = document.getElementById('de-income-line');
  if (incomeEl) {
    // نافذة مغلقة عند اليوم: التوزيع المُعلَن بتاريخ صرف قادم لم يُستلَم بعد
    const cutoff = Date.now() - 365 * 86400000, nowTs = Date.now();
    let ttm = 0;
    Object.values(divByTicker).forEach(arr => arr.forEach(d => {
      const t = d.date.getTime(); if (t >= cutoff && t <= nowTs) ttm += (d.amount || 0);
    }));
    const monthly = ttm / 12;
    // AUDIT-FIX (2026-08-18): كان 5000 مثبّتاً بينما بقيّة الصفحة نفسها تقرأ هدفك
    // المحفوظ (incomeGoalMonthly) — فيرى صاحب هدف 7000 رقمين متناقضين في شاشة واحدة.
    const goal = incomeGoalMonthly > 0 ? incomeGoalMonthly : 5000;
    const pct = goal > 0 ? Math.min(100, monthly / goal * 100) : 0;
    incomeEl.innerHTML = `💵 دخل توزيعاتك الشهري الحالي (آخر 12 شهراً): <strong>${formatNum(monthly)} ر.س</strong> من هدف <strong>${formatNum(goal)} ر.س</strong> بحلول 2045 (<strong>${formatNum(pct)}%</strong>)`;
  }
}

// ── مجموعات بلغة بسيطة بدل الجدول: 🔴 يحتاج تصرّف · 🟡 راقبه · 🟢 فرص تجميع (الدستور §7) ──
// ══════════════════════════════════════════════════════════════════════
// مُعطَّلة — قرار المالك 2026-08-22: «القرارات المطلوبة اليوم هي نفس خطة
// الوصول إلى أهدافك، ليش التكرار؟ نخلّي واحدة منهم».
// المجموعات الثلاث (يحتاج تصرّف · راقبه · فرص تجميع) كانت تعرض نفس الأسهم
// التي تعرضها الخطة بصياغة أخرى. أُزيلت حاوياتها من الصفحة، وأُدمج ما تنفرد
// به — أوامر الخروج التي يُصدرها المحرّك نفسه (مشغّل ثابت انطبق، أو فشل بوابة
// الاستدامة) — داخل القسم ① من buildTargetPlan فلا يضيع شيء.
// ⚠️ لا تُعِد الحاويات ولا تُفعّل هذه الدالة.
// ══════════════════════════════════════════════════════════════════════
function renderActionGroups() {
  return;
  // eslint-disable-next-line no-unreachable
  const groups = {
    urgent: { severities: ['red'],              el: 'de-group-urgent', wrap: 'de-group-urgent-wrap' },
    watch:  { severities: ['yellow', 'monitor'], el: 'de-group-watch',  wrap: 'de-group-watch-wrap'  },
    add:    { severities: ['add'],               el: 'de-group-add',   wrap: 'de-group-add-wrap'    },
  };
  const actionable = _results.filter(r => r.action !== 'hold' || r.buyZone);
  Object.values(groups).forEach(g => {
    const rows = actionable.filter(r => g.severities.includes(r.severity))
      .sort((a, b) => a.priority - b.priority || b.weight - a.weight);
    const wrapEl = document.getElementById(g.wrap);
    const listEl = document.getElementById(g.el);
    if (!wrapEl || !listEl) return;
    if (!rows.length) { wrapEl.style.display = 'none'; return; }
    wrapEl.style.display = '';
    listEl.innerHTML = rows.map(cardHtml).join('');
  });
}

// ── فحص سقف القطاع 25% (الفلتر 4) ──

// ══════════════════════════════════════════════════════════════════════
// 🧭 خطة الوصول إلى أهدافك — بطلب المالك 2026-08-22
// ----------------------------------------------------------------------
// الفجوة التي تسدّها: الصفحة كانت تقول «هذا السهم فوق سقفه» و«هذا فرصة»،
// لكنها لا تقول **ماذا أفعل بالضبط لأصل إلى الأوزان التي رسمتُها**. ومحرّك
// التوازن في صفحة الأهداف يوزّع **مبلغاً جديداً** فقط — لا يعطي الطرف الآخر
// (ممّ أخفّف ولا كم).
//
// المخرَج: أوامر ملموسة بالريال وبعدد الأسهم، مرتّبة، مبنية على ثلاثة مدخلات
// كلها **قراراتك أنت** لا اجتهاد المحرّك:
//   ① أهدافك للأوزان (صفحة الأهداف) — الوجهة.
//   ② قراراتك المسجّلة في المهام (تجميع/احتفاظ/تخفيف/مراقبة/تصفية) — تحكم
//      اتجاه الحركة المسموح بها لكل سهم.
//   ③ تقييماتك العادلة (حاسبة القيمة العادلة) — تحكم ما إذا كان **السعر**
//      يسمح بالتنفيذ الآن.
//
// قواعد التعارض — مستمدّة من الدستور لا مخترَعة:
//   • «تصفية» أو هدف صفر ⇒ خروج كامل مهما قال الهدف (P0.1، يسبق كل شيء).
//   • كسر السقف الدستوري ⇒ تخفيف واجب **ولو كان السعر تحت العادلة**
//     (§4 الفلتر 5: أي سقف ينكسر أولاً يفرض التخفيف — خطر تركيز لا قرار سعري).
//   • فجوة موجبة (تحت الهدف) + السعر **فوق** العادلة ⇒ **لا تجميع الآن**؛
//     تُعرض كـ«مؤجَّلة» مع السبب (§4 الفلتر 3: الشراء عند النزول مشروط لا آلي).
//   • قرارك «تخفيف» مع فجوة موجبة، أو «تجميع» مع فجوة سالبة ⇒ **تعارض
//      يُعلَن ولا يُحسم تلقائياً** — القرار قرارك، والمحرّك لا ينقض مهمتك.
//   • «مراقبة» ⇒ لا مال جديد يدخل حتى ينتهي سبب المراقبة.
//   • تقييم غير موثوق أو أقدم من VAL_STALE_DAYS ⇒ لا يُبنى عليه منع ولا سماح،
//     ويُعلَن (§8: لا تقدير صامت).
// ══════════════════════════════════════════════════════════════════════

// الحدّ الأدنى لأمر يستحق التنفيذ — ما دونه تكلفة الصفقة تأكله
const PLAN_MIN_SAR = 500;

// ══════════════════════════════════════════════════════════════════════
// أثر التنفيذ على جيبك — طلب المالك 2026-08-23:
// «قل لي: أنت خارج وأنت خسران كذا، أو خارج وأنت كسبان كذا — بعد ما تطرح
//  التوزيعات والقيمة والمتوسط حقي والسعر اليوم».
//
// التفريق المقصود بين رقمين لا يصحّ خلطهما:
//   • **رأسمالي**: (السعر اليوم − متوسط تكلفتك) × الأسهم التي ستبيعها.
//     هذا وحده ما «تُحقّقه» بالبيع.
//   • **المحصّلة مع التوزيعات**: تُضاف توزيعات هذا السهم — وهي مقبوضة فعلاً
//     ولا يغيّرها البيع. تُعرض للخروج الكامل فقط، حيث يُقفل المركز فتصحّ
//     محاسبته كلّه.
//   في **التخفيف** لا تُنسب التوزيعات للجزء المباع: نسبتها بالتناسب اختراع
//   (التوزيعة قُبضت على أسهم غير التي تبيعها اليوم). تُذكر كسياق للمركز كاملاً.
// ══════════════════════════════════════════════════════════════════════
// معدّل تكلفة الصفقة عندك — من سجلّك أنت لا من افتراض.
// يُحسب مرّة: مجموع (عمولة + ضريبة) ÷ مجموع مبالغ الصفقات.
// بلا سجل ⇒ null، ولا تُقدَّر كلفة بيع (§8: لا تقدير صامت).
let _feeRateCache;
function planFeeRate() {
  if (_feeRateCache !== undefined) return _feeRateCache;
  let fees = 0, gross = 0;
  Object.values(txByTicker || {}).forEach(rows => rows.forEach(t => {
    if (t.type !== 'buy' && t.type !== 'sell') return;
    fees  += +t.fees  || 0;
    gross += Math.abs(+t.total || 0);
  }));
  _feeRateCache = gross > 0 && fees > 0 ? fees / gross : null;
  return _feeRateCache;
}

// ══════════════════════════════════════════════════════════════════════
// سعر التعادل الحقيقي — طلب المالك 2026-08-23: «طلّع لي البريك إيفن بطريقة
// صحيحة وتأكد إنك أخذت كل شيء في الحسبان».
//
// التعادل ليس متوسط تكلفتك. متوسط التكلفة هو ما دفعتَه، والتعادل هو **السعر
// الذي يعيد لك رأس مالك صافياً** — ويتحرّك بثلاثة عوامل:
//   ① متوسط تكلفتك — ويشمل عمولة الشراء أصلاً لأن المتوسط مبنيّ على
//      إجمالي الصفقة (total) لا على السعر المجرّد.
//   ② التوزيعات المقبوضة — نقد استلمتَه من السهم، يخفض تكلفتك الفعلية.
//   ③ عمولة البيع — تُدفع عند الخروج، فترفع السعر المطلوب للتعادل.
//
//   سعر التعادل = (متوسط التكلفة − التوزيعات لكل سهم) ÷ (1 − معدّل العمولة)
//
// التوزيعات لكل سهم = إجمالي توزيعات هذا السهم ÷ أسهمك **الحالية**، ويُصرَّح
// بذلك: من باع جزءاً سابقاً قبض توزيعاته على عدد أكبر، فالقسمة على الحالي
// تجعل التعادل **أكثر تحفّظاً لصالحه** لا العكس — وهذا الاتجاه الآمن.
// ══════════════════════════════════════════════════════════════════════
function planBreakEven(r) {
  const h = holdings.find(x => x.ticker === r.ticker);
  const avg = h ? +h.avg_price : 0;
  const sh  = h ? +h.shares : 0;
  if (!(avg > 0) || !(sh > 0)) return null;
  const divs = (divByTicker[r.ticker] || []).reduce((a, d) => a + (+d.amount || 0), 0);
  const divPerShare = divs / sh;
  const fee = planFeeRate();
  const gross = avg - divPerShare;                      // التكلفة بعد التوزيعات
  const be = fee != null ? gross / (1 - fee) : gross;    // ثم تغطية عمولة البيع
  const px = +r.price || 0;
  return {
    avg, divs, divPerShare, feeRate: fee, be,
    price: px,
    above: px > 0 ? px - be : null,                      // موجب = فوق التعادل
    abovePct: px > 0 && be > 0 ? (px - be) / be * 100 : null,
  };
}

function _planPnL(r, sharesSold, full) {
  const h = holdings.find(x => x.ticker === r.ticker);
  const avg = h ? +h.avg_price : 0;
  const px  = +r.price || 0;
  if (!(avg > 0) || !(px > 0) || !(sharesSold > 0)) return null;
  const gross = (px - avg) * sharesSold;
  const fee   = planFeeRate();
  const sellCost = fee != null ? px * sharesSold * fee : 0;   // عمولة الخروج
  const capital = gross - sellCost;                            // الربح **الصافي**
  const divs = (divByTicker[r.ticker] || []).reduce((a, d) => a + (+d.amount || 0), 0);
  return {
    avg, px, sharesSold, gross, sellCost, feeRate: fee, capital, divs,
    net: full ? capital + divs : null,          // المحصّلة تُحسب للخروج الكامل فقط
    pctOnCost: avg > 0 ? capital / (avg * sharesSold) * 100 : null,
  };
}

function _planEffectiveTarget(r) {
  // الهدف الفعّال = الأدنى بين هدفك المسجّل والسقف الدستوري. لا نرفع هدفك،
  // ولا نسمح لهدف فوق السقف أن يقود أمر شراء يكسر §1.
  if (!r.hasTarget) return null;
  return Math.min(r.targetWeight, r.cap);
}

function _planFairVerdict(r) {
  // هل السعر يسمح بالتجميع الآن؟ يرجع {ok, why, usable}
  if (r.fairValue == null)  return { ok: null, usable: false, why: 'بلا تقييم عادل مسجّل' };
  if (r.fvUnreliable)       return { ok: null, usable: false, why: 'التقييم مُعلَّم غير موثوق (تشتّت النماذج)' };
  if (r.valStale)           return { ok: null, usable: false, why: `التقييم أقدم من ${VAL_STALE_DAYS} يوماً` };
  const margin = (r.fairValue - r.price) / r.fairValue * 100;   // موجب = تحت العادلة
  return {
    ok: margin > 0, usable: true, margin,
    why: margin > 0
      ? `السعر ${formatNum(r.price)} تحت العادلة ${formatNum(r.fairValue)} بـ${formatNum(margin)}%`
      : `السعر ${formatNum(r.price)} فوق العادلة ${formatNum(r.fairValue)} بـ${formatNum(-margin)}%`,
  };
}

function buildTargetPlan(valAware) {
  const rows = _results || [];
  const total = rows.reduce((s, r) => s + (+r.value || 0), 0);
  const out = { exits: [], trims: [], adds: [], deferred: [], conflicts: [],
                noTarget: [], total, fundedBy: 0, needed: 0,
                deferredSar: 0, conflictSar: 0 };
  if (!(total > 0)) return out;

  rows.forEach(r => {
    const price = +r.price || 0;
    const mk = (extra) => {
      const row = {
        ticker: r.ticker, name: r.name, price, weight: r.weight, value: r.value,
        target: _planEffectiveTarget(r), taskType: r.taskType, sector: r.sector, ...extra,
      };
      // أثر التنفيذ على جيبك — يُرفَق بكل أمر بيع (خروج أو تخفيف)، لا بأوامر الشراء
      if (row.shares > 0 && (row.sar > 0)) {
        const full = row.shares >= r.shares - 1e-6;      // يبيع المركز كلّه؟
        row.pnl = _planPnL(r, row.shares, full);
        row.be  = planBreakEven(r);
      }
      return row;
    };

    // ① قرارك الصريح بالخروج — يسبق كل حساب (P0.1)
    if (zeroTargets.has(r.ticker) || r.taskType === 'liquidation') {
      out.exits.push(mk({
        sar: r.value, shares: r.shares,
        why: zeroTargets.has(r.ticker) && r.taskType === 'liquidation' ? 'هدف صفر + مهمة تصفية'
           : zeroTargets.has(r.ticker) ? 'هدف صفر مقصود' : 'مهمة تصفية مفتوحة',
      }));
      out.fundedBy += r.value;
      return;
    }

    // ①ب أوامر خروج يُصدرها المحرّك نفسه — دُمجت هنا بعد إزالة مجموعات
    // الإجراءات المكرّرة (2026-08-22). مصدرها الدستور لا الأهداف:
    //   • مشغّل ثابت انطبق (§1 و§4 الفلتر 5) — يتجاوز أي حساب آخر.
    //   • فشل بوابة الاستدامة (§4 الفلتر 1) — الخروج واجب بغضّ النظر عن السعر.
    // لولا هذا الدمج لاختفى أمر خروج حقيقي مع اختفاء المجموعات.
    if (r.trigger && r.trigger.fired) {
      // BUGFIX 2026-08-23 — بلاغ المالك: «مكتوب على أرامكو تصفية كاملة وهي ما هي
      // تصفية، انطبق مشغّل ثابت… مستحيل أصفّي أرامكو».
      // الخطأ كان في دمجي أنا (كوميت 75a8354): دفعتُ **كل** مشغّل منطبق كخروج
      // كامل بمبلغ المركز كلّه، بينما المحرّك نفسه يفرّق بينهما منذ البداية:
      //   kind='sell'   ⇒ action='exit'  → تصفية كاملة
      //   kind='reduce' ⇒ action='trim'  → تخفيف إلى toWeight فقط (أو احتفاظ)
      // العلاج: نتبع `r.action` الذي حسبه المحرّك ولا نفترض الخروج.
      if (r.action === 'exit') {
        out.exits.push(mk({ sar: r.value, shares: r.shares,
          why: `⚡ انطبق مشغّل ثابت عرّفته أنت (بيع كامل) — يتجاوز أي حساب آخر. ${r.reason || ''}` }));
        out.fundedBy += r.value;
        return;
      }
      if (r.action === 'trim') {
        // التخفيف إلى وزن المشغّل نفسه لا إلى هدفك — المشغّل يتقدّم (§4 الفلتر 5)
        // بلا وزن مُحدَّد في المشغّل نهبط للهدف الفعّال، وإلا فالسقف الدستوري.
        const toW  = (r.cutToWeight != null) ? +r.cutToWeight
                   : (_planEffectiveTarget(r) != null ? _planEffectiveTarget(r) : r.cap);
        const gapW = r.weight - toW;
        const sarT = Math.max(0, gapW / 100 * total);
        if (sarT >= PLAN_MIN_SAR) {
          out.trims.push(mk({ sar: sarT, shares: price > 0 ? sarT / price : 0,
            gapPct: -gapW, target: toW, forced: true,
            why: `⚡ انطبق مشغّل ثابت عرّفته أنت — تخفيف إلى ${formatNum(toW)}% لا خروج كامل. ${r.reason || ''}` }));
          out.fundedBy += sarT;
        }
        return;
      }
      return;   // action='hold' — المشغّل انطبق والوزن دون هدفه، لا إجراء
    }
    if (r.sustain && r.sustain.status === 'fail' && r.action === 'exit') {
      out.exits.push(mk({ sar: r.value, shares: r.shares,
        why: `🔴 فشل بوابة الاستدامة — الخروج واجب بغضّ النظر عن السعر (§4 الفلتر 1). ${r.sustain.reason || ''}` }));
      out.fundedBy += r.value;
      return;
    }

    // بلا هدف مسجّل: لا وجهة نقيس إليها — يُعلَن ولا يُخترع هدف
    const tgt = _planEffectiveTarget(r);
    if (tgt == null) { out.noTarget.push(mk({})); return; }
    if (!(price > 0)) { out.noTarget.push(mk({ noPrice: true })); return; }

    const gapPct = tgt - r.weight;                 // + = تحت الهدف · − = فوقه
    // BUGFIX 2026-08-23: كان المبلغ يُقسَم على السعر بلا تقريب، فيَخرج أمر
    // بـ«133.4 سهم» — وهو غير قابل للتنفيذ. نُقرّب لأسفل ثم **نعيد اشتقاق
    // المبلغ من عدد الأسهم**، فيتطابق ما تقرؤه مع ما ستنفّذه بالضبط.
    const rawSar = Math.abs(gapPct) / 100 * total;
    const shares = price > 0 ? Math.floor(rawSar / price) : 0;
    const sar    = price > 0 ? shares * price : rawSar;
    const fair   = _planFairVerdict(r);
    const capped = tgt < r.targetWeight - 1e-9;    // هدفك قُصَّ عند السقف الدستوري

    // ② فوق الهدف ⇒ تخفيف
    if (gapPct < 0 && sar >= PLAN_MIN_SAR) {
      if (r.taskType === 'accumulation') {
        out.conflictSar += sar;
        out.conflicts.push(mk({ sar, shares, gapPct,
          why: 'وزنه فوق هدفك بينما مهمتك المسجّلة «تجميع» — القراران متعاكسان',
          fix: 'إمّا ترفع هدفه في صفحة الأهداف، أو تغلق مهمة التجميع. المحرّك لا ينقض قرارك.' }));
        return;
      }
      out.trims.push(mk({ sar, shares, gapPct, capped,
        forced: r.overCap,
        why: r.overCap
          ? `كسر السقف الدستوري ${r.cap}% — تخفيف واجب بغضّ النظر عن السعر (§4 الفلتر 5)`
          : `فوق هدفك بـ${formatNum(-gapPct)} نقطة`,
        fairNote: fair.usable && !fair.ok ? 'والسعر فوق العادلة — التخفيف هنا مدعوم سعرياً أيضاً'
                : fair.usable && fair.ok ? 'ملاحظة: السعر تحت العادلة، والتخفيف هنا **لخطر التركيز** لا لغلاء السعر'
                : '' }));
      out.fundedBy += sar;
      return;
    }

    // ③ تحت الهدف ⇒ تجميع، بشرط أن يسمح السعر وقرارك
    if (gapPct > 0 && sar >= PLAN_MIN_SAR) {
      // BUGFIX 2026-08-23: كان `out.needed += sar` هنا — **قبل** فحوص التأجيل
      // والتعارض، فيدخل المبلغ المؤجَّل (سعر فوق العادلة · مراقبة · فشل
      // استدامة) والمتعارض في «تحتاج X ر.س» وأنت لن تنفّذها. النتيجة: احتياج
      // مُضخَّم و«الخطة لا تموّل نفسها» زوراً. الآن يُحتسب المُنفَّذ فقط،
      // ويُعرض المؤجَّل في بند مستقلّ.
      if (r.sustain && r.sustain.status === 'fail') {
        out.deferredSar += sar;
        out.deferred.push(mk({ sar, shares, gapPct,
          why: 'فشل بوابة الاستدامة — ممنوع الشراء لمجرد نزول السعر (§8)' }));
        return;
      }
      if (r.taskType === 'liquidation') return;            // عولج أعلاه
      if (r.taskType === 'reduction') {
        out.conflictSar += sar;
        out.conflicts.push(mk({ sar, shares, gapPct,
          why: 'وزنه تحت هدفك بينما مهمتك المسجّلة «تخفيف» — القراران متعاكسان',
          fix: 'إمّا تخفض هدفه في صفحة الأهداف، أو تغلق مهمة التخفيف.' }));
        return;
      }
      if (r.taskType === 'monitoring') {
        out.deferredSar += sar;
        out.deferred.push(mk({ sar, shares, gapPct,
          why: 'قرارك «مراقبة» — لا مال جديد يدخل حتى ينتهي سبب المراقبة' }));
        return;
      }
      if (valAware && fair.usable && !fair.ok) {
        out.deferredSar += sar;
        out.deferred.push(mk({ sar, shares, gapPct,
          why: `${fair.why} — الفجوة قائمة لكن الشراء عند النزول مشروط لا آلي (§4 الفلتر 3)` }));
        return;
      }
      out.needed += sar;                                  // المُنفَّذ وحده
      out.adds.push(mk({ sar, shares, gapPct, capped,
        fairOk: fair.ok, fairUsable: fair.usable,
        why: fair.usable ? fair.why : `${fair.why} — التنفيذ على مسؤوليتك، لا مرجع سعري`,
        priority: gapPct * (fair.usable && fair.ok ? 1 + Math.min(0.5, fair.margin / 100) : 1) }));
      return;
    }
  });

  out.trims.sort((a, b) => (b.forced === a.forced ? b.sar - a.sar : (b.forced ? 1 : -1)));
  out.adds.sort((a, b) => b.priority - a.priority);
  out.exits.sort((a, b) => b.sar - a.sar);
  return out;
}

function renderTargetPlan() {
  const el = document.getElementById('de-plan-body');
  if (!el) return;
  const valAware = document.getElementById('de-plan-valaware')?.checked !== false;
  const p = buildTargetPlan(valAware);

  if (!(p.total > 0)) {
    el.innerHTML = '<p class="text-muted" style="margin:0">لا حيازات لبناء خطة عليها.</p>';
    return;
  }

  const SAR = v => formatSAR(v);
  const line = (o, kind) => {
    const badge = { exit: '🔻 تصفية كاملة', trim: '✂️ خفّف', add: '➕ جمّع',
                    defer: '⏸️ مؤجَّل', conflict: '⚠️ تعارض' }[kind];
    const amt = o.sar != null
      ? `<b class="num">${SAR(o.sar)}</b> ر.س${o.price > 0 ? ` ≈ <b class="num">${formatNum(o.shares, 0)}</b> سهم` : ''}`
      : '';
    const to = (kind === 'trim' || kind === 'add') && o.target != null
      ? ` — من <b>${formatNum(o.weight)}%</b> إلى <b>${formatNum(o.target)}%</b>` : '';

    // ── أثر التنفيذ: تُعرض داخل نفس البطاقة بطلب المالك (لا في صفحة أخرى) ──
    let pnlHtml = '';
    if (o.pnl && (kind === 'exit' || kind === 'trim')) {
      const p = o.pnl;
      const sgn = v => (v >= 0 ? '+' : '−') + formatSAR(Math.abs(v));
      const cls = v => v >= 0 ? 'text-success' : 'text-danger';
      const verb = p.capital >= 0 ? 'كاسب' : 'خاسر';
      const head = kind === 'exit'
        ? `تخرج وأنت <b class="${cls(p.capital)}">${verb}</b> رأسمالياً`
        : `تبيع هذا الجزء وأنت <b class="${cls(p.capital)}">${verb}</b> رأسمالياً`;
      pnlHtml = `<div class="de-pnl" style="margin-top:6px;padding:6px 8px;border-radius:6px;
                   background:var(--bg-2);font-size:.78rem;line-height:1.7">
        ${head}: <b class="num ${cls(p.capital)}">${sgn(p.capital)}</b> ر.س
        <span class="text-muted">(${formatNum(p.pctOnCost)}% على تكلفتك)</span><br>
        <span class="text-muted">متوسط تكلفتك ${formatNum(p.avg)} · السعر اليوم ${formatNum(p.px)}
        · ${formatNum(p.sharesSold, 0)} سهم</span>
        ${o.be ? `<br><span class="text-muted">سعر التعادل بعد التوزيعات${o.be.feeRate != null ? ' وعمولة البيع' : ''}:
            <b class="num">${formatNum(o.be.be)}</b> ر.س —
            ${o.be.above >= 0
              ? `أنت <b class="text-success">فوقه بـ${formatNum(o.be.abovePct)}%</b>`
              : `أنت <b class="text-danger">تحته بـ${formatNum(-o.be.abovePct)}%</b>`}</span>` : ''}
        ${p.net != null
          ? `<br>وبعد إضافة توزيعات هذا السهم <b class="num">${formatSAR(p.divs)}</b> ر.س:
             <b class="num ${cls(p.net)}">${sgn(p.net)}</b> ر.س <b>محصّلتك النهائية من المركز</b>.`
          : (p.divs > 0
              ? `<br><span class="text-muted">قبضت من هذا السهم ${formatSAR(p.divs)} ر.س توزيعات (على المركز كاملاً — لا تُنسب للجزء المباع).</span>`
              : '')}
      </div>`;
    }
    return `<div class="de-alert-line" style="align-items:flex-start">
      <div>
        <b>${badge}: ${escapeHtmlSafe(o.ticker)}</b> ${escapeHtmlSafe(o.name || '')}${to}<br>
        <span class="small">${amt}</span>
        ${pnlHtml}
        <div class="small text-muted" style="margin-top:3px;line-height:1.6">${o.why || ''}${
          o.fairNote ? `<br>${o.fairNote}` : ''}${
          o.fix ? `<br><b>الحسم بيدك:</b> ${o.fix}` : ''}${
          o.capped ? '<br>ℹ️ هدفك المسجّل أعلى من السقف الدستوري — الخطة تستعمل السقف.' : ''}</div>
      </div></div>`;
  };

  const block = (title, arr, kind, empty) => arr.length
    ? `<h4 class="de-d-h">${title} (${arr.length})</h4>${arr.map(o => line(o, kind)).join('')}`
    : (empty ? `<h4 class="de-d-h">${title}</h4><p class="small text-muted" style="margin:0 0 10px">${empty}</p>` : '');

  // ── الميزانية: كم يموّل تخفيفك من احتياجك؟ ──
  const gapFund = p.needed - p.fundedBy;
  const fundPct = p.needed > 0 ? Math.min(100, p.fundedBy / p.needed * 100) : 100;
  const _fee = planFeeRate();
  const budget = `
    <div class="note" data-state="${gapFund > 0 ? 'warn' : 'good'}" style="flex-direction:column;gap:6px">
      <div><b>الميزانية الذاتية للخطة</b></div>
      <div class="small">تحتاج <b class="num">${SAR(p.needed)}</b> ر.س لسدّ فجوات التجميع <b>القابلة للتنفيذ الآن</b>،
      ويوفّر التخفيف والتصفية <b class="num">${SAR(p.fundedBy)}</b> ر.س
      — أي <b>${formatNum(fundPct, 0)}%</b> ${gapFund > 0
        ? `منها. الفارق <b class="num">${SAR(gapFund)}</b> ر.س يحتاج ضخّاً جديداً.`
        : 'منها — الخطة تموّل نفسها بالكامل، والفائض يذهب لأولوية التجميع الأعلى.'}
      ${p.deferredSar > 0 ? `<br>وخارج هذا الحساب <b class="num">${SAR(p.deferredSar)}</b> ر.س فجوات <b>مؤجَّلة</b> — لا تُحتسب لأنك لن تنفّذها الآن.` : ''}
      ${p.conflictSar > 0 ? `<br>و<b class="num">${SAR(p.conflictSar)}</b> ر.س معلّقة على <b>تعارض</b> بين هدفك ومهمتك — تُحسم بيدك أولاً.` : ''}
      </div>
      <div class="small text-muted">
        الأوزان والفجوات محسوبة على قيمة محفظتك <b>الآن</b> (${SAR(p.total)} ر.س).
        تنفيذ خروج كامل لا يُعاد استثماره يُصغّر هذا المقام فترتفع أوزان الباقي تلقائياً —
        راجع الخطة بعد كل تنفيذ كبير بدل الاعتماد على أرقام ما قبله.
        ${_fee != null
          ? `وكلفة الصفقة المستعملة في الأرقام أعلاه <b>${formatNum(_fee * 100, 3)}%</b> — محسوبة من متوسط عمولاتك وضرائبك في سجلّك أنت.`
          : 'ولا سجل عمولات كافٍ، فكلفة البيع <b>غير محتسَبة</b> — الأرباح المعروضة قبلها.'}
      </div>
    </div>`;

  const nothing = !p.exits.length && !p.trims.length && !p.adds.length;
  el.innerHTML = `
    <p class="small text-muted" style="margin:0 0 12px;line-height:1.7">
      خطة تُحوّل <b>أهدافك</b> + <b>قراراتك المسجّلة في المهام</b> + <b>تقييماتك العادلة</b> إلى أوامر ملموسة.
      الأوامر دون <b>${SAR(PLAN_MIN_SAR)}</b> ر.س مُسقَطة (تكلفة الصفقة تأكلها).
      المحرّك <b>لا ينقض قرارك</b>: عند تعارض هدفك مع مهمتك يعرض التعارض ويترك الحسم لك.
    </p>
    ${budget}
    ${nothing ? '<p class="small" style="margin:12px 0 0">✅ <b>لا أمر مطلوب الآن.</b> كل سهم له هدف مسجّل يقع ضمن هدفه، ولا مهمة تصفية مفتوحة.</p>' : ''}
    ${block('① قرارك بالخروج — يسبق كل شيء', p.exits, 'exit')}
    ${block('② تخفيف — ممّ تموّل', p.trims, 'trim')}
    ${block('③ تجميع — أين تضع المال', p.adds, 'add')}
    ${block('④ مؤجَّل — الفجوة قائمة والتنفيذ ممنوع الآن', p.deferred, 'defer')}
    ${block('⑤ تعارض بين هدفك وقرارك — الحسم بيدك', p.conflicts, 'conflict')}
    ${p.noTarget.length ? `<h4 class="de-d-h">خارج الخطة (${p.noTarget.length})</h4>
      <p class="small text-muted" style="margin:0">${p.noTarget.map(o =>
        escapeHtmlSafe(o.ticker) + (o.noPrice ? ' (بلا سعر)' : ' (بلا هدف مسجّل)')).join('، ')}
      — لا وجهة تُقاس إليها، فلا يُخترع لها هدف (§8). حدّد أهدافها في صفحة «أهداف الأسهم والقطاعات».</p>` : ''}
    ${renderSectorPlan()}`;
}

// ── المستوى القطاعي: انحراف كل قطاع عن هدفك ──────────────────────────
function renderSectorPlan() {
  const rows = _results || [];
  const total = rows.reduce((s, r) => s + (+r.value || 0), 0);
  if (!(total > 0) || !Object.keys(sectorTargets).length) return '';
  const bySec = {};
  rows.forEach(r => {
    const k = String(r.sector || '').trim() || 'غير مصنّف';
    bySec[k] = (bySec[k] || 0) + (+r.value || 0);
  });
  const keys = [...new Set([...Object.keys(bySec), ...Object.keys(sectorTargets)])];
  const list = keys.map(k => {
    const cur = (bySec[k] || 0) / total * 100;
    const tgt = sectorTargets[k];
    return { k, cur, tgt, gap: tgt != null ? tgt - cur : null,
             sar: tgt != null ? Math.abs(tgt - cur) / 100 * total : 0 };
  }).filter(x => x.tgt != null && Math.abs(x.gap) >= 1)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  if (!list.length) return '<h4 class="de-d-h">المستوى القطاعي</h4><p class="small text-muted" style="margin:0">✅ كل قطاع له هدف مسجّل يقع ضمن نقطة مئوية واحدة منه.</p>';
  return `<h4 class="de-d-h">المستوى القطاعي (${list.length})</h4>
    <p class="small text-muted" style="margin:0 0 8px">انحراف القطاع لا يُنفَّذ بذاته — يُصحَّح عبر أوامر الأسهم أعلاه. يُعرض ليطابق قرارك على المستويين.</p>
    ${list.map(x => `<div class="de-alert-line">${x.gap < 0 ? '✂️' : '➕'}
      <b>${escapeHtmlSafe(x.k)}</b>: ${formatNum(x.cur)}% مقابل هدفك ${formatNum(x.tgt)}%
      — ${x.gap < 0 ? 'يحتاج تخفيفاً' : 'يحتاج تعزيزاً'} بـ<b class="num">${formatSAR(x.sar)}</b> ر.س</div>`).join('')}`;
}

function renderSectorCheck(totalValue) {
  const el = document.getElementById('de-sector-check');
  if (!el) return;
  const bySector = {};
  holdings.forEach(h => {
    const sec = (h.sector || '').trim() || 'غير مصنّف';
    bySector[sec] = (bySector[sec] || 0) + +h.shares * +h.current_price;
  });
  const rows = Object.entries(bySector)
    .map(([sec, val]) => ({ sec, pct: totalValue > 0 ? val / totalValue * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const breaches = rows.filter(r => r.pct > CAPS.sector + SECTOR_BUFFER);

  // AUDIT-FIX 2026-08-21 (#35): سهم بقطاع فارغ يقع في دلو «غير مصنّف» فيُنقص وزن
  // قطاعه الحقيقي — قد يكون قطاع مكسور السقف ويظهر ممتثلاً. يُعلَن ولا يُقدَّر
  // (§8): لا نخمّن قطاعه هنا، بل نطلب تصنيفه.
  const _unclassified = holdings.filter(h => !String(h.sector || '').trim());
  const _uncNote = _unclassified.length
    ? `<div class="de-alert-line">⚠️ ${_unclassified.length} سهماً بلا قطاع (${_unclassified.map(h => escapeHtmlSafe(h.ticker)).join('، ')}) — وزنها لا يُحتسب على قطاعها الحقيقي، فحكم سقف 25% هنا ناقص حتى تُصنَّف من صفحة الحيازات.</div>`
    : '';

  if (!breaches.length) {
    el.innerHTML = _uncNote + `<p class="text-muted" style="margin:0">${_unclassified.length ? '🟡' : '✅'} كل القطاعات <em>المصنَّفة</em> تحت سقف ${CAPS.sector}% (+منطقة سماح ${SECTOR_BUFFER}%). أعلى قطاع: <strong>${escapeHtmlSafe(rows[0]?.sec || '—')}</strong> (${formatNum(rows[0]?.pct || 0)}%).</p>`;
    return;
  }
  el.innerHTML = _uncNote + breaches.map(b =>
    `<div class="de-alert-line">⚠️ تركيز قطاعي: <strong>${escapeHtmlSafe(b.sec)}</strong> = ${formatNum(b.pct)}% &gt; السقف ${CAPS.sector}% + منطقة السماح ${SECTOR_BUFFER}% (الفلتر 4)</div>`
  ).join('');
}

// نصوص مساعدة مشتركة لإشارة الاستدامة واتجاه التوزيع
const SUS_BADGE = { pass: '🟢 سليمة', watch: '🟡 قلق مؤقت', fail: '🔴 تدهور مؤكّد', unknown: '⚪ غير متوفرة' };
function trendChip(tr) {
  if (!tr || tr.signal === 'insufficient') return '';
  const color = (tr.signal === 'cut' || tr.signal === 'stopped') ? '#ef4444' : tr.signal === 'growing' ? '#10b981' : 'var(--text-muted)';
  const txt = ({ growing:'📈 توزيع ينمو', stable:'➡️ توزيع مستقر', cut:'📉 توزيع منخفض', stopped:'🛑 توزيع متوقّف' })[tr.signal] || '';
  return `<span class="small" title="${escapeHtmlSafe(tr.note)}" style="color:${color}">${txt}</span>`;
}

// طيّ/فتح قسم بطاقات كل الأسهم (مطوي افتراضياً لتبسيط الصفحة)
// ══════════════════════════════════════════════════════════════════════
// طيّ/فتح الأقسام — قرار المالك 2026-08-22: «الصفحة طويلة وتشتّت، أبغى نفس
// حركة بطاقة كل شركة مع الأقسام كلها، ولمّا أفتح الصفحة تكون مطبوقة».
// الحالة تُحفظ محلياً لكل قسم: ما تفتحه يبقى مفتوحاً عند عودتك، وما لم تلمسه
// يبقى مطويّاً. لا شيء يُحذف من الحساب — الطيّ عرضٌ فقط.
// ══════════════════════════════════════════════════════════════════════
const DE_FOLD_KEY = 'de_folds_v1';

function _deFoldState() {
  try { return JSON.parse(localStorage.getItem(userLsKey(DE_FOLD_KEY)) || '{}') || {}; }
  catch (_) { return {}; }
}

function toggleFold(id, force) {
  const wrap = document.getElementById(id);
  const btn  = document.getElementById('btn-' + id);
  if (!wrap) return;
  const open = force != null ? force : wrap.style.display === 'none';
  wrap.style.display = open ? '' : 'none';
  if (btn) btn.textContent = open ? '▴ اطوِ' : '▾ افتح';
  if (force == null) {
    const st = _deFoldState();
    st[id] = open;
    try { localStorage.setItem(userLsKey(DE_FOLD_KEY), JSON.stringify(st)); } catch (_) {}
  }
}

// يُستدعى بعد الرسم: يُعيد ما فتحه المالك سابقاً فقط.
function restoreFolds() {
  const st = _deFoldState();
  ['fold-divs', 'fold-rel', 'fold-advice', 'fold-sector'].forEach(id => {
    if (st[id]) toggleFold(id, true);
  });
}

function toggleAllCards() {
  const wrap = document.getElementById('de-cards-wrap');
  const btn  = document.getElementById('de-cards-toggle');
  if (!wrap) return;
  const open = wrap.style.display === 'none';
  wrap.style.display = open ? '' : 'none';
  if (btn) btn.textContent = open ? '▴ إخفاء' : '▾ عرض كل الأسهم';
}

// ── بطاقة سهم واحدة (مشتركة بين المجموعات الرئيسية وقائمة «كل الأسهم») ──
function cardHtml(r) {
  const noteTag = r.specialNote ? ` <span title="${escapeHtmlSafe(r.specialNote)}" style="cursor:help">📌</span>` : '';
  const star    = r.blueChip ? ' <span title="سهم قيادي — سقف 12%">⭐</span>' : '';
  // AUDIT-FIX (2026-08): تقييم بلا طابع زمني قابل للتحليل → «عمر التقييم غير معروف» (§8)
  const ageUnknown = r.fairValue != null && r.valAgeDays == null
    ? ' <span style="color:#f59e0b;cursor:help" title="عمر التقييم غير معروف — لا طابع زمني صالح في السجل">❔</span>' : '';
  const fvLine  = r.fairValue != null
    ? `<b>${formatNum(r.fairValue)}${r.valStale ? ' <span style="color:#f59e0b" title="أقدم من 6 أشهر">📅</span>' : ''}${ageUnknown}${r.stabilizationFlag ? ` <span style="color:#ef4444;cursor:help" title="${escapeHtmlSafe(r.stabilizationFlag)}">🚩</span>` : ''}</b>`
    : '<b class="text-muted">—</b>';
  const zt = zonesText(r.zones);
  // AUDIT-FIX (2026-08): تنبيه تعارض المهام النشطة لنفس الرمز (كان يُحسم صامتاً بالأحدث)
  const conflictLine = r.taskConflict
    ? `<div class="de-card-zones small" style="color:#f59e0b">⚠️ ${r.taskConflict} مهام نشطة لهذا الرمز في صفحة المهام — المحرّك يعتمد الأحدث فقط؛ وحّدها لتفادي التعارض</div>` : '';
  return `
    <div class="de-card de-card-${r.severity || 'green'}">
      <div class="de-card-top">
        <div class="de-card-id">
          <strong>${escapeHtmlSafe(r.ticker)}</strong>${star}${noteTag}
          <div class="small text-muted">${escapeHtmlSafe(r.name || '')}</div>
        </div>
        <span class="de-badge ${badgeFor(r)}">${escapeHtmlSafe(r.label)}</span>
      </div>
      <div class="de-card-kvs">
        <div class="de-kv"><span>الوزن</span><b>${formatNum(r.weight)}%</b></div>
        <div class="de-kv"><span>${r.hasTarget ? 'الهدف' : 'السقف'}</span><b>${r.hasTarget
          ? `${formatNum(r.targetWeight)}% (${r.dev >= 0 ? '+' : '−'}${formatNum(Math.abs(r.dev))})`
          : `${formatNum(r.cap)}%${r.overCap ? ' ⚠️' : ''}`}</b></div>
        <div class="de-kv"><span>السعر</span><b>${formatNum(r.price)}</b></div>
        <div class="de-kv"><span>القيمة العادلة</span>${fvLine}</div>
        <div class="de-kv"><span>الاستدامة</span><b>${SUS_BADGE[r.sustain.status]}</b></div>
        <div class="de-kv"><span>عائدك الفعلي XIRR</span><b>${r.xirr != null ? `<span style="color:${r.xirr >= 0 ? '#10b981' : '#ef4444'}">${r.xirr >= 0 ? '+' : '−'}${formatNum(Math.abs(r.xirr))}%</span>` : '<span class="text-muted">—</span>'}</b></div>
      </div>
      ${trendChip(r.sustain.trend) ? `<div class="de-card-trend">${trendChip(r.sustain.trend)}</div>` : ''}
      ${zt ? `<div class="de-card-zones small">🎯 خطة الأسعار: ${escapeHtmlSafe(zt)}</div>` : '<div class="de-card-zones small text-muted">🎯 لا خطة أسعار</div>'}
      ${conflictLine}
      <div class="de-card-reason small">${escapeHtmlSafe(r.reason)}</div>
      <div class="de-card-foot">
        <button class="btn btn-primary btn-sm" onclick="openDetailCard('${escapeHtmlSafe(r.ticker)}')">🔍 تفاصيل كاملة</button>
        <button class="btn btn-secondary btn-sm" onclick="openStockCard('${escapeHtmlSafe(r.ticker)}')">⚙️ إدخال يدوي</button>
      </div>
    </div>`;
}

// ── قائمة كل الأسهم (تفصيلي — مطوي افتراضياً) ──
function renderCards() {
  const wrap = document.getElementById('de-cards');
  if (!wrap) return;
  if (!holdings.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>لا توجد أسهم في المحفظة بعد.</p></div>`;
    return;
  }
  const sorted = _results.slice().sort((a, b) => a.priority - b.priority || b.weight - a.weight);
  wrap.innerHTML = sorted.map(cardHtml).join('');
}

function badgeClass(action) {
  return { exit: 'de-b-exit', trim: 'de-b-trim', add: 'de-b-add', hold: 'de-b-hold' }[action] || 'de-b-hold';
}
// لون الشارة حسب درجة الخطورة (عتبات الألوان): أحمر/أصفر/مراقبة/تجميع/أخضر
function badgeFor(r) {
  if (r.buyZone) return 'de-b-watch';
  return { red: 'de-b-exit', yellow: 'de-b-trim', monitor: 'de-b-monitor', add: 'de-b-add', green: 'de-b-hold' }[r.severity] || 'de-b-hold';
}
function escapeHtmlSafe(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ══════════════════════════════════════════════════════════════════════
// مالية السهم — تُشتق من holdings + المعاملات + الأرباح (للبطاقة التفصيلية)
// ══════════════════════════════════════════════════════════════════════
function stockFinancials(ticker) {
  const h  = holdings.find(x => x.ticker === ticker);
  const tx = txByTicker[ticker] || [];
  let buyShares = 0, buyCost = 0, sellShares = 0, sellRev = 0, grantShares = 0;
  tx.forEach(t => {
    if (t.type === 'buy')        { buyShares += t.shares; buyCost += t.total; }
    else if (t.type === 'grant') { grantShares += t.shares; }
    else if (t.type === 'sell')  { sellShares += t.shares; sellRev += t.total; }
  });
  const avgCost   = buyShares > 0 ? buyCost / buyShares : 0;
  const shares    = h ? +h.shares : 0;
  const costBasis = h ? shares * +h.avg_price : 0;
  const mktVal    = h ? shares * +h.current_price : 0;
  const unreal    = mktVal - costBasis;
  const unrealPct = costBasis > 0 ? unreal / costBasis * 100 : 0;
  const realized  = avgCost > 0 ? sellRev - avgCost * sellShares : sellRev;
  const divs      = divByTicker[ticker] || [];
  // المستلَم فعلاً ≠ المُعلَن القادم: نافذة TTM مغلقة عند اليوم، والمُعلَن يُفصَل
  const nowTs     = Date.now();
  const received  = divs.filter(d => d.date.getTime() <= nowTs);
  const declared  = divs.filter(d => d.date.getTime() >  nowTs);
  const divTotal  = received.reduce((s, d) => s + (d.amount || 0), 0);
  const declaredTotal = declared.reduce((s, d) => s + (d.amount || 0), 0);
  const yoc       = costBasis > 0 ? divTotal / costBasis * 100 : 0;
  const cutoff    = nowTs - 365 * 86400000;
  const ttmDiv    = received.reduce((s, d) => s + (d.date.getTime() >= cutoff ? (d.amount || 0) : 0), 0);
  const fwdYoc    = costBasis > 0 ? ttmDiv / costBasis * 100 : 0;
  const byYear    = {};
  received.forEach(d => { const y = d.date.getFullYear(); byYear[y] = (byYear[y] || 0) + d.amount; });
  // XIRR على المستلَم فقط — تدفق موجب بتاريخ مستقبلي يشوّه معدّل العائد
  const xirr = positionXIRR(tx, received, mktVal);
  return { shares, avgCost, costBasis, mktVal, unreal, unrealPct, realized, divTotal, yoc, ttmDiv, fwdYoc,
           byYear, divCount: received.length, declaredTotal, declaredCount: declared.length,
           nextDeclared: declared.length ? declared.reduce((m, d) => (d.date < m.date ? d : m), declared[0]) : null,
           buyShares, sellShares, grantShares, xirr };
}

// العائد الفعلي السنوي المعدَّل بالزمن (XIRR) — نفس منطق صفحة «الأداء التاريخي» (js/performance.js)
// يقارن التدفقات الفعلية (شراء/بيع/توزيعات) بالقيمة السوقية الحالية — أداء حقيقي، لا افتراضي
function positionXIRR(tx, divs, mktVal) {
  const flows = [];
  tx.forEach(t => {
    if (t.type === 'buy')       flows.push({ date: t.date, amount: -t.total });
    else if (t.type === 'sell') flows.push({ date: t.date, amount:  t.total });
  });
  divs.forEach(d => flows.push({ date: d.date, amount: d.amount }));
  if (mktVal > 0) flows.push({ date: new Date(), amount: mktVal });
  const hasNeg = flows.some(f => f.amount < 0), hasPos = flows.some(f => f.amount > 0);
  if (!hasNeg || !hasPos || flows.length < 2) return null;
  try { return computeXIRR(flows); } catch (_) { return null; }
}

function sectorPctOf(sector, totalValue) {
  const sec = (sector || '').trim();
  const val = holdings.filter(h => (h.sector || '').trim() === sec)
    .reduce((s, h) => s + +h.shares * +h.current_price, 0);
  return totalValue > 0 ? val / totalValue * 100 : 0;
}

// ══════════════════════════════════════════════════════════════════════
// 📋 وحدات التقرير التنفيذي للسهم الواحد
// المبدأ: أول شاشة تجيب على أربعة أسئلة — ماذا أفعل؟ كم بالضبط؟ لماذا؟
// وما أثره على المحفظة؟ وما تحتها إثبات وتفصيل. كل رقم من بيانات المالك،
// وأي نقص يُعلَن صراحةً ولا يُقدَّر بصمت (الدستور §8).
// ══════════════════════════════════════════════════════════════════════
const _sgn = n => (n >= 0 ? '+' : '−') + formatNum(Math.abs(n));

// ── ① كمية الإجراء بالضبط: كم سهماً وكم ريالاً ──────────────────────
// بيع S سهماً يُنقص قيمة المركز والمحفظة معاً، فالوزن الجديد = (V−S·p)/(T−S·p).
// نحلّها لـ S: S = (V − c·T) / (p·(1−c)) حيث c = الوزن المستهدف.
// وإن أُعيد استثمار الحصيلة داخل المحفظة يبقى المجموع ثابتاً: S = (V − c·T)/p.
function actionPlanOf(r, totalValue) {
  const p = r.price, V = r.value, T = totalValue;
  if (!(p > 0) || !(T > 0)) return null;

  if (r.action === 'exit') {
    return { verb: 'بيع كامل', shares: r.shares, amount: V, cash: V, toWeight: 0 };
  }
  if (r.action === 'trim') {
    const cutTo = r.cutToWeight;
    if (cutTo == null || cutTo < 0 || cutTo >= 100) return null;
    const c = cutTo / 100;
    const exitCash = (V - c * T) / (p * (1 - c)); // الحصيلة تخرج نقداً
    const reinvest = (V - c * T) / p;             // الحصيلة تُعاد داخل المحفظة
    if (!(exitCash > 0)) return null;
    // تقريب لأعلى: التخفيف يجب أن يهبط بالوزن إلى الهدف أو دونه — التقريب لأسفل
    // كان يُبقي الوزن فوق السقف (كسر مستمرّ للفلتر 4 رغم تنفيذ التوصية).
    const sh = Math.min(r.shares, Math.ceil(exitCash));
    if (sh < 1) return null;
    return { verb: 'بيع', shares: sh, amount: sh * p, cash: sh * p, toWeight: cutTo,
             altShares: Math.max(0, Math.min(r.shares, Math.ceil(reinvest))) };
  }
  if (r.action === 'add' && r.targetWeight != null) {
    const c = r.targetWeight / 100;
    if (!(c > 0) || c >= 1) return null;
    const need = (c * T - V) / (p * (1 - c));     // ضخّ مال جديد للمحفظة
    if (!(need > 0)) return null;
    const sh = Math.floor(need);                  // لأسفل: لا نتجاوز الهدف بالشراء
    if (sh < 1) return null;
    return { verb: 'شراء', shares: sh, amount: sh * p, cash: -sh * p, toWeight: r.targetWeight };
  }
  return null;
}

// ── ② بطاقات المؤشرات الستة ─────────────────────────────────────────
function _tile(label, value, sub, tone) {
  return `<div class="de-tile de-tone-${tone || 'n'}">
    <div class="de-tile-l">${label}</div>
    <div class="de-tile-v">${value}</div>
    ${sub ? `<div class="de-tile-s">${sub}</div>` : ''}</div>`;
}

function kpiTilesHtml(r, fin) {
  const t = [];
  t.push(_tile('السعر الحالي', formatNum(r.price), 'ر.س للسهم', 'n'));

  if (r.fairValue != null) {
    const m = (r.fairValue - r.price) / r.fairValue * 100;
    t.push(_tile('القيمة العادلة', formatNum(r.fairValue),
      m >= 0 ? `هامش أمان ${formatNum(m)}%` : `أعلى من العادلة ${formatNum(Math.abs(m))}%`,
      m >= 10 ? 'g' : m <= -10 ? 'r' : 'y'));
  } else {
    t.push(_tile('القيمة العادلة', '—', 'لا تقييم محفوظ', 'n'));
  }

  const wTone = r.overCap ? 'r' : r.devBand === 'red' ? 'r' : r.devBand === 'yellow' ? 'y' : 'g';
  t.push(_tile('وزنه في المحفظة', formatNum(r.weight) + '%',
    `السقف ${formatNum(r.cap)}%${r.blueChip ? ' (قيادي)' : ''}` +
    (r.hasTarget ? ` · هدفك ${formatNum(r.targetWeight)}%` : ' · بلا هدف مسجّل'), wTone));

  t.push(_tile('عائدك الفعلي (سنوي)',
    fin.xirr != null ? _sgn(fin.xirr) + '%' : '—',
    fin.xirr != null ? 'XIRR — معدَّل بالزمن' : 'تدفقات غير كافية',
    fin.xirr == null ? 'n' : fin.xirr >= 0 ? 'g' : 'r'));

  t.push(_tile('دخل آخر 12 شهراً', formatNum(fin.ttmDiv) + ' ر.س',
    fin.costBasis > 0 ? `${formatNum(fin.fwdYoc)}% على تكلفتك` : 'بلا تكلفة مسجّلة',
    fin.ttmDiv > 0 ? 'g' : 'n'));

  const net = fin.unreal + fin.realized + fin.divTotal;
  t.push(_tile('صافي ربحك الكلي', _sgn(net) + ' ر.س',
    'ورقي + محقق + توزيعات', net >= 0 ? 'g' : 'r'));

  return `<div class="de-tiles">${t.join('')}</div>`;
}

// ── ③ مسطرة السعر: أين يقع السعر بين مناطق قرارك والقيمة العادلة ────
function priceRulerHtml(r) {
  const z = r.zones || {};
  const pts = [];
  if (z.accumulate)    pts.push({ v: +z.accumulate, lbl: 'تجميع',  cls: 'buy'  });
  if (r.fairValue)     pts.push({ v: +r.fairValue,  lbl: 'عادلة',  cls: 'fair' });
  if (z.trimFrom)      pts.push({ v: +z.trimFrom,   lbl: 'تخفيف',  cls: 'trim' });
  if (z.liquidate)     pts.push({ v: +z.liquidate,  lbl: 'تصفية',  cls: 'exit' });
  if (!pts.length || !(r.price > 0)) return '';

  const vals = pts.map(x => x.v).concat([r.price]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo;
  const pad = span > 0 ? span * 0.15 : Math.max(hi * 0.08, 0.5);
  lo -= pad; hi += pad;
  const pos = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));

  pts.sort((a, b) => a.v - b.v);
  const ticks = pts.map((p, i) => `
    <span class="de-rk de-rk-${p.cls}" style="left:${pos(p.v).toFixed(1)}%"></span>
    <span class="de-rl de-rl-${i % 2 ? 'lo' : 'hi'}" style="left:${pos(p.v).toFixed(1)}%">
      ${p.lbl}<br><b>${formatNum(p.v)}</b></span>`).join('');

  return `<div class="de-ruler">
    <div class="de-ruler-track">
      ${ticks}
      <span class="de-rp" style="left:${pos(r.price).toFixed(1)}%">
        <b>${formatNum(r.price)}</b><i>السعر الآن</i></span>
    </div>
  </div>`;
}

// ── ④ شرائح الصحة الخمس: حالة السهم في نظرة واحدة ───────────────────
function _chip(label, state, txt) {
  const ic = { g: '✅', y: '⚠️', r: '🔴', n: '⚪' }[state] || '⚪';
  return `<div class="de-chip de-tone-${state}"><div class="de-chip-l">${label}</div>
    <div class="de-chip-v">${ic} ${txt}</div></div>`;
}

function healthChipsHtml(r, fin) {
  const c = [];
  const susMap = { pass: ['g', 'سليمة'], watch: ['y', 'تحت المراقبة'], fail: ['r', 'متدهورة'], unknown: ['n', 'غير متوفرة'] };
  const [ss, st] = susMap[r.sustain.status] || ['n', 'غير متوفرة'];
  c.push(_chip('الاستدامة', ss, st));

  if (r.fairValue != null) {
    const m = (r.fairValue - r.price) / r.fairValue * 100;
    c.push(_chip('التقييم', m >= 10 ? 'g' : m <= -10 ? 'r' : 'y',
      m >= 10 ? 'تحت العادلة' : m <= -10 ? 'مبالغ فيه' : 'قرب العادلة'));
  } else c.push(_chip('التقييم', 'n', 'لم يُحسب'));

  c.push(_chip('الوزن', r.overCap ? 'r' : r.devBand === 'red' ? 'r' : r.devBand === 'yellow' ? 'y' : 'g',
    r.overCap ? 'كسر السقف' : r.devBand === 'red' ? 'بعيد عن هدفك'
      : r.devBand === 'yellow' ? 'انحراف بسيط' : 'ضمن النطاق'));

  c.push(_chip('الدخل', fin.ttmDiv > 0 ? 'g' : 'n',
    fin.ttmDiv > 0 ? `${formatNum(fin.fwdYoc)}% على التكلفة` : 'لا توزيعات (12 شهراً)'));

  c.push(_chip('أداؤك', fin.xirr == null ? 'n' : fin.xirr >= 0 ? 'g' : 'r',
    fin.xirr == null ? 'غير كافٍ' : `${_sgn(fin.xirr)}% سنوياً`));

  return `<div class="de-chips">${c.join('')}</div>`;
}

// ── ⑤ أثر التنفيذ على المحفظة ───────────────────────────────────────
function impactHtml(r, fin, plan, totalValue) {
  if (!plan || !(plan.shares > 0)) return '';
  const selling = plan.verb !== 'شراء';
  const dSh = selling ? -plan.shares : plan.shares;

  const newShares = r.shares + dSh;
  const newVal    = newShares * r.price;
  const newTotal  = totalValue + dSh * r.price; // نقد يخرج/يدخل المحفظة
  const newWeight = newTotal > 0 ? newVal / newTotal * 100 : 0;

  // أثر الدخل: نصيب السهم من التوزيع خلال آخر 12 شهراً مضروباً بفارق الأسهم
  const dpsTTM = r.shares > 0 ? fin.ttmDiv / r.shares : 0;
  const dIncome = dpsTTM * dSh;

  const secVal   = holdings.filter(h => (h.sector || '').trim() === (r.sector || '').trim())
                           .reduce((s, h) => s + +h.shares * +h.current_price, 0);
  const newSecPct = newTotal > 0 ? (secVal + dSh * r.price) / newTotal * 100 : 0;

  const rows = [
    ['عدد الأسهم', `${formatNum(r.shares)} → <b>${formatNum(newShares)}</b>`],
    ['وزنه في المحفظة', `${formatNum(r.weight)}% → <b>${formatNum(newWeight)}%</b>`],
    ['وزن قطاعه', `${formatNum(sectorPctOf(r.sector, totalValue))}% → <b>${formatNum(newSecPct)}%</b>` +
      (newSecPct > CAPS.sector + SECTOR_BUFFER ? ' <span style="color:#ef4444">(فوق سقف القطاع)</span>' : '')],
    [selling ? 'نقد يتحرّر' : 'نقد مطلوب', `<b>${formatNum(Math.abs(plan.amount))} ر.س</b>`],
    ['الدخل السنوي من السهم', dpsTTM > 0
      ? `${formatNum(fin.ttmDiv)} → <b>${formatNum(fin.ttmDiv + dIncome)} ر.س</b> (${_sgn(dIncome)})`
      : '<span class="text-muted">لا توزيعات مسجّلة لقياس الأثر</span>'],
  ];

  return `<h4 class="de-d-h">لو نفّذت هذا الإجراء — ماذا يتغيّر؟</h4>
    <div class="de-d-kvs">${rows.map(([k, v]) =>
      `<div class="de-kv"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    ${plan.altShares != null && plan.altShares !== plan.shares ? `<div class="small text-muted" style="margin-top:6px">
      الرقم أعلاه يفترض خروج الحصيلة نقداً. لو أعدت استثمارها داخل المحفظة فوراً فالمطلوب
      <b>${formatNum(plan.altShares)}</b> سهماً (لأن مجموع المحفظة يبقى ثابتاً).</div>` : ''}`;
}

// ── ⑥ تطور التقييمات عبر الزمن (الدستور §4 الفلتر 2) ────────────────
// «انظر لكل مكون وكل مؤشر على مر الزمان وتطوره» — كل تقييماتك للسهم في جدول
// واحد مع اتجاه كل مؤشر، لتُحكم قاعدة التثبيت بعينك لا بالثقة.
function valuationTimelineHtml(ticker) {
  const hist = valHistByTicker[ticker] || [];
  if (!hist.length) {
    return `<h4 class="de-d-h">تطوّر تقييماتك لهذا السهم</h4>
      <div class="small text-muted">لا يوجد أي تقييم محفوظ. احسبه في صفحة «القيمة العادلة للأسهم» ليدخل الفلتر 2.</div>`;
  }
  const E = escapeHtmlSafe;
  const isReit = (hist[0].inputs || {}).companyType === 'reit';
  const earnKey = isReit ? 'ffo' : 'eps';
  const earnLbl = isReit ? 'FFO' : 'EPS';

  const rowOf = (rec) => {
    const i = rec.inputs || {};
    return {
      date: rec.date || '—',
      fair: rec.fair ? rec.fair.avg : null,
      earn: numOf(i[earnKey]),
      div:  numOf(i.dividends ?? i.bankDps),
      fcf:  numOf(i.fcf),
      growth: numOf(i.growth5yr),
      type: i.companyType || 'عادية',
    };
  };
  const rows = hist.map(rowOf);

  // سهم الاتجاه مقارنةً بالتقييم الأقدم مباشرة (السجل مرتّب: الأحدث أولاً)
  const arrow = (cur, prev) => {
    if (cur == null || prev == null) return '';
    if (cur > prev * 1.005) return ' <span style="color:#10b981">▲</span>';
    if (cur < prev * 0.995) return ' <span style="color:#ef4444">▼</span>';
    return ' <span class="text-muted">=</span>';
  };
  const cell = (v, prev, suf = '') =>
    v == null ? '<span class="text-muted">—</span>' : formatNum(v) + suf + arrow(v, prev);

  const body = rows.map((row, i) => {
    const p = rows[i + 1] || {};
    return `<tr>
      <td style="white-space:nowrap">${E(row.date)}</td>
      <td><b>${row.fair == null ? '—' : formatNum(row.fair)}</b>${arrow(row.fair, p.fair)}</td>
      <td>${cell(row.earn, p.earn)}</td>
      <td>${cell(row.div, p.div)}</td>
      <td>${cell(row.fcf, p.fcf)}</td>
      <td>${cell(row.growth, p.growth, '%')}</td>
    </tr>`;
  }).join('');

  // حكم قاعدة التثبيت عبر كامل السجل لا آخر تقييمين فقط
  let verdict = '';
  if (rows.length >= 2) {
    const first = rows[rows.length - 1], last = rows[0];
    if (first.fair != null && last.fair != null) {
      const fairUp = last.fair > first.fair * 1.01;
      const earnUp = last.earn != null && first.earn != null && last.earn > first.earn;
      const divUp  = last.div  != null && first.div  != null && last.div  > first.div;
      const fcfUp  = last.fcf  != null && first.fcf  != null && last.fcf  > first.fcf;
      if (fairUp && !earnUp && !divUp && !fcfUp) {
        verdict = `<div class="de-d-row de-d-warn"><div class="de-d-ic">⚠️</div><div class="de-d-txt">
          <div class="de-d-title">قاعدة التثبيت عبر كل السجل</div>
          <div class="de-d-body small">قيمتك العادلة ارتفعت من ${formatNum(first.fair)} إلى ${formatNum(last.fair)}
          عبر ${rows.length} تقييمات، لكن ${earnLbl} والتوزيع وFCF لم يرتفع أيٌّ منها بين أول تقييم وآخره.
          الدستور (§4) يمنع رفع القيمة العادلة بلا دليل من الأرقام.</div></div></div>`;
      } else if (fairUp) {
        const ev = [earnUp ? earnLbl : null, divUp ? 'التوزيع' : null, fcfUp ? 'FCF' : null].filter(Boolean);
        verdict = `<div class="de-d-row de-d-ok"><div class="de-d-ic">✅</div><div class="de-d-txt">
          <div class="de-d-title">قاعدة التثبيت عبر كل السجل</div>
          <div class="de-d-body small">ارتفاع القيمة العادلة مسنود بارتفاع فعلي في: ${E(ev.join('، '))}.</div></div></div>`;
      }
    }
  }

  return `<h4 class="de-d-h">تطوّر تقييماتك لهذا السهم (${rows.length} تقييم)</h4>
    <div class="de-tl-wrap"><table class="de-tl">
      <thead><tr><th>التاريخ</th><th>القيمة العادلة</th><th>${earnLbl}</th>
        <th>التوزيع</th><th>FCF</th><th>النمو</th></tr></thead>
      <tbody>${body}</tbody></table></div>${verdict}`;
}

// ── ⑦ دفتر المراجعة + استحقاق الدورة النصف سنوية (§5) ───────────────
function reviewSectionHtml(ticker) {
  const E = escapeHtmlSafe;
  const revs = reviewByTicker[ticker] || [];
  const last = revs[0];
  const days = last ? Math.floor((Date.now() - new Date(last.date + 'T00:00:00').getTime()) / 86400000) : null;
  const due  = days == null || days > REVIEW_CYCLE_DAYS;

  const head = `<div class="de-d-row de-d-${due ? 'warn' : 'ok'}">
    <div class="de-d-ic">${due ? '⏰' : '✅'}</div><div class="de-d-txt">
    <div class="de-d-title">دورة المراجعة (الدستور §5 — كل 6 أشهر)</div>
    <div class="de-d-body small">${last
      ? `آخر مراجعة: ${E(last.date)} (قبل ${days} يوماً) — ${due ? 'مستحقة الآن' : `القادمة بعد ${REVIEW_CYCLE_DAYS - days} يوماً`}`
      : 'لم تُسجَّل أي مراجعة لهذا السهم — مستحقة الآن'}</div></div></div>`;

  const list = revs.slice(0, 3).map(v => `<div class="de-rev">
    <div class="de-rev-d">${E(v.date)}</div>
    <div class="de-rev-n">${v.notes ? E(v.notes) : '<span class="text-muted">بلا ملاحظات</span>'}</div></div>`).join('');

  return `<h4 class="de-d-h">سجل مراجعاتك لهذا السهم</h4>${head}${list}` +
    (revs.length > 3 ? `<div class="small text-muted">و${revs.length - 3} مراجعة أقدم في دفتر المراجعة.</div>` : '');
}

// ── ⑧ مدخلاتك اليدوية للمحرّك — جدول مقروء بدل JSON خام ─────────────
function manualCfgHtml(ticker) {
  const cfg = engineCfg[ticker];
  if (!cfg || !Object.keys(cfg).length) {
    return `<h4 class="de-d-h">مدخلاتك اليدوية للمحرّك</h4>
      <div class="small text-muted">لم تُدخل شيئاً — المحرّك يشتقّ ما يقدر عليه من تقييمك وسجل أرباحك،
      وما لا يقدر يُعلنه «غير متوفر» (§8).</div>`;
  }
  const E = escapeHtmlSafe;
  const LBL = {
    divCoverage:  ['تغطية التوزيع', { covered: '✅ مغطّى', weak: '🟡 ضعف ربع واحد', uncovered: '🔴 غير مغطّى مزمن' }],
    fundamentals: ['الأساسيات',     { healthy: '✅ سليمة', soft: '🟡 ضعف ربع واحد', deteriorating: '🔴 تدهور مستمر' }],
    divSignal:    ['إشارة التوزيع', { stable: '✅ مستقر', temp: '🟡 تأجيل/تخفيف مؤقت', cut: '🔴 قطع مؤكّد' }],
    assetType:    ['نوع الأصل',     ASSET_LABEL],
    blueChip:     ['سهم قيادي',     { true: 'نعم (سقف 12%)', false: 'لا (سقف 7%)' }],
  };
  const rows = Object.keys(LBL).filter(k => cfg[k] != null && cfg[k] !== '').map(k => {
    const [label, map] = LBL[k];
    return `<div class="de-kv"><span>${label}</span><b>${E(map[String(cfg[k])] || String(cfg[k]))}</b></div>`;
  });
  return `<h4 class="de-d-h">مدخلاتك اليدوية للمحرّك</h4>
    <div class="de-d-kvs">${rows.join('')}</div>
    ${cfg.notes ? `<div class="small" style="margin-top:6px"><b>📝 ملاحظتك:</b> ${E(cfg.notes)}</div>` : ''}`;
}

// ══════════════════════════════════════════════════════════════════════
// البطاقة التفصيلية (قراءة فقط) — كل شيء: الفلاتر بالترتيب (كسر/سليم)،
// المالية، الأرباح، آخر تقييم، خطة الأسعار، الهدف/السقف، سقف القطاع.
// ══════════════════════════════════════════════════════════════════════
function _dRow(status, title, body) {
  // status: ok | warn | bad | neutral | off
  const ic = { ok:'✅', warn:'⚠️', bad:'🔴', neutral:'⚪', off:'➖' }[status] || '•';
  return `<div class="de-d-row de-d-${status}">
    <div class="de-d-ic">${ic}</div>
    <div class="de-d-txt"><div class="de-d-title">${title}</div>${body ? `<div class="de-d-body small">${body}</div>` : ''}</div>
  </div>`;
}

function openDetailCard(ticker) {
  const r = _results.find(x => x.ticker === ticker);
  const h = holdings.find(x => x.ticker === ticker);
  if (!r || !h) return;
  const totalValue = holdings.reduce((s, x) => s + +x.shares * +x.current_price, 0);
  const fin = stockFinancials(ticker);
  const E = escapeHtmlSafe;
  const sign = n => (n >= 0 ? '+' : '−') + formatNum(Math.abs(n));

  document.getElementById('de-detail-title').textContent = `🔍 ${ticker} — ${h.name || ''}`;
  const out = [];

  // ══════════════════════════════════════════════════════════════════
  // القسم الأول — الخلاصة التنفيذية: ماذا أفعل؟ كم؟ لماذا؟ وما أثره؟
  // ══════════════════════════════════════════════════════════════════
  const plan = actionPlanOf(r, totalValue);

  // ① الحكم + الكمية بالضبط
  let actionLine;
  if (plan) {
    actionLine = `<div class="de-hero-qty">${E(plan.verb)} <b>${formatNum(plan.shares)}</b> سهماً` +
      ` <span class="de-hero-amt">≈ ${formatNum(Math.abs(plan.amount))} ر.س</span></div>` +
      (plan.toWeight != null && r.action !== 'exit'
        ? `<div class="de-hero-to">لإرجاع الوزن من ${formatNum(r.weight)}% إلى ${formatNum(plan.toWeight)}%</div>` : '');
  } else if (r.action === 'hold') {
    actionLine = `<div class="de-hero-qty">لا إجراء مطلوب الآن — <b>احتفظ</b></div>`;
  } else if (r.action === 'monitor') {
    actionLine = `<div class="de-hero-qty">لا بيع ولا شراء — <b>راقب فقط</b></div>`;
  } else {
    actionLine = `<div class="de-hero-qty">${E(r.label)}</div>`;
  }

  out.push(`<div class="de-hero de-row-${r.severity || 'green'}">
    <span class="de-badge ${badgeFor(r)}" style="font-size:.95rem">${E(r.label)}</span>
    ${actionLine}
  </div>`);

  // ② المؤشرات الستة
  out.push(kpiTilesHtml(r, fin));

  // ③ مسطرة السعر بين مناطق قرارك والقيمة العادلة
  const ruler = priceRulerHtml(r);
  if (ruler) {
    out.push('<h4 class="de-d-h">أين يقع السعر الآن</h4>');
    out.push(ruler);
  }

  // ④ صحة السهم في نظرة
  out.push('<h4 class="de-d-h">صحة السهم في نظرة</h4>');
  out.push(healthChipsHtml(r, fin));

  // ⑤ لماذا هذا القرار — أسباب مفصولة كنقاط
  const reasons = String(r.reason || '').split('|').map(s => s.trim()).filter(Boolean);
  out.push('<h4 class="de-d-h">لماذا هذا القرار؟</h4>');
  out.push('<ul class="de-why">' + reasons.map(s => `<li>${E(s)}</li>`).join('') + '</ul>');

  // ⑥ أثر التنفيذ على المحفظة
  out.push(impactHtml(r, fin, plan, totalValue));

  // ⑦ ما ينقص لقرار أدقّ (§8: النقص يُعلَن ولا يُقدَّر)
  if (r.gaps && r.gaps.length) {
    out.push(`<div class="de-d-row de-d-warn"><div class="de-d-ic">📌</div><div class="de-d-txt">
      <div class="de-d-title">لإتمام الصورة — بيانات ناقصة</div>
      <div class="de-d-body small">${E(r.gaps.join(' · '))}<br>
      <span class="text-muted">المحرّك لا يقدّرها بصمت؛ أدخلها ليصبح القرار أدقّ.</span></div></div></div>`);
  }

  out.push('<div class="de-split">التفاصيل والإثبات</div>');

  // ── الفلاتر بالترتيب الإجباري (الدستور §4/§5) ──
  out.push('<h4 class="de-d-h">الفلاتر بالترتيب — ما الذي كُسر وما الذي سليم</h4>');

  // P0 — triggers ثابتة
  if (r.trigger) {
    out.push(_dRow(r.trigger.fired ? 'bad' : 'ok',
      `المشغّل الثابت (الدستور §5): ${E(r.trigger.label)}`,
      r.trigger.fired
        ? `انطبق الآن — السعر ${formatNum(r.price)} ${r.trigger.cmp === 'gte' ? '≥' : '≤'} ${r.trigger.price}`
        : `لم ينطبق بعد — السعر ${formatNum(r.price)} (الشرط ${r.trigger.cmp === 'gte' ? '≥' : '≤'} ${r.trigger.price})`));
  } else {
    out.push(_dRow('off', 'لا يوجد مشغّل ثابت لهذا الرمز', ''));
  }

  // الفلتر 1 — الاستدامة
  const sus = r.sustain;
  const susStatus = { pass:'ok', watch:'warn', fail:'bad', unknown:'neutral' }[sus.status];
  let susBody = E(sus.reason);
  if (sus.autoSrc && Object.keys(sus.autoSrc).length) {
    susBody += '<br><span class="text-muted">مصادر آلية: ' +
      Object.values(sus.autoSrc).map(E).join(' · ') + '</span>';
  }
  if (sus.trend && sus.trend.note) susBody += `<br>اتجاه التوزيع: ${E(sus.trend.note)}`;
  out.push(_dRow(susStatus, `الفلتر 1 — بوابة الاستدامة (${SUS_BADGE[sus.status]})`, susBody));
  out.push(_dRow('neutral', `مقياس الاستدامة لنوع الأصل (${E(ASSET_LABEL[r.assetType])})`, E(SUSTAIN_METRIC[r.assetType])));

  // مقارنة الأداء التاريخي الفعلي (XIRR) بالتوقّع المستقبلي (هامش القيمة العادلة)
  if (fin.xirr != null && r.fairValue != null) {
    const margin = (r.fairValue - r.price) / r.fairValue * 100;
    let note;
    if (fin.xirr < 0 && margin > 10) note = `⚠️ أداؤك الفعلي فيه سلبي (${sign(fin.xirr)}%) رغم إن الحاسبة تقول فيه هامش أمان (${formatNum(margin)}%) — راجع سعر دخولك ومدة احتفاظك قبل ما تجمّع أكثر.`;
    else if (fin.xirr >= 0 && margin < -10) note = `ℹ️ أداؤك التاريخي إيجابي (${sign(fin.xirr)}%) لكن السعر الحالي أعلى من القيمة العادلة بهامش معتبر — الأداء الماضي لا يبرر الشراء عند هذا السعر.`;
    else note = `أداؤك الفعلي (${sign(fin.xirr)}% سنوياً) والتوقّع المستقبلي (هامش ${formatNum(margin)}%) متوافقان تقريباً.`;
    out.push(_dRow('neutral', '📊 التاريخي مقابل المستقبلي', E(note)));
  }

  // الفلتر 2 — القيمة العادلة
  if (r.fairValue != null) {
    const margin = (r.fairValue - r.price) / r.fairValue * 100;
    const mStatus = margin >= 10 ? 'ok' : margin <= -10 ? 'bad' : 'warn';
    const rangeTxt = r.valFair && r.valFair.max > r.valFair.min
      ? ` (نطاق ${formatNum(r.valFair.min)}–${formatNum(r.valFair.max)})` : '';
    out.push(_dRow(r.stabilizationFlag ? 'warn' : mStatus, 'الفلتر 2 — القيمة العادلة مقابل السعر',
      `العادلة ${formatNum(r.fairValue)}${rangeTxt} · السعر ${formatNum(r.price)} → ` +
      `${margin >= 0 ? `هامش أمان ${formatNum(margin)}%` : `مبالغ فيه ${formatNum(Math.abs(margin))}%`}` +
      (r.valDate ? `<br><span class="text-muted">آخر تقييم: ${E(r.valDate)}${r.valStale ? ` · 📅 قديم (${r.valAgeDays} يوم)` : ''}</span>` : '') +
      (r.valAgeDays == null ? '<br><span style="color:#f59e0b">❔ عمر التقييم غير معروف — لا طابع زمني صالح في السجل</span>' : '') +
      (r.stabilizationFlag ? `<br>${E(r.stabilizationFlag)}` : '')));
  } else {
    out.push(_dRow('neutral', 'الفلتر 2 — القيمة العادلة', 'لا يوجد تقييم محفوظ — احسبه في صفحة القيمة العادلة ليُقارن بالسعر.'));
  }

  // الفلتر 3 — خطة الأسعار (المهام)
  const zt = zonesText(r.zones);
  if (zt) {
    let pos = '';
    if (r.zones.liquidate && r.price > r.zones.liquidate) pos = `🔴 السعر فوق حدّ التصفية (${formatNum(r.zones.liquidate)})`;
    else if (r.zones.trimFrom && r.price >= r.zones.trimFrom) pos = `⚠️ السعر داخل نطاق التخفيف`;
    else if (r.zones.accumulate && r.price <= r.zones.accumulate) pos = `✅ السعر داخل منطقة التجميع`;
    else pos = 'السعر بين النطاقات (لا إشارة سعرية)';
    const conflictTxt = r.taskConflict
      ? `<br><span style="color:#f59e0b">⚠️ يوجد ${r.taskConflict} مهام نشطة لهذا الرمز — المحرّك يعتمد الأحدث فقط؛ وحّدها في صفحة المهام</span>` : '';
    out.push(_dRow(pos.startsWith('🔴') ? 'bad' : pos.startsWith('⚠️') ? 'warn' : pos.startsWith('✅') ? 'ok' : 'neutral',
      'الفلتر 3 — خطة الأسعار (من المهام)', `${E(zt)}<br>${E(pos)}${conflictTxt}`));
  } else {
    out.push(_dRow('neutral', 'الفلتر 3 — خطة الأسعار', 'غير متوفرة — أضِفها في صفحة مهام المحفظة.'));
  }

  // الفلتر 4 — الوزن: الهدف المسجّل + السقف الدستوري
  if (r.hasTarget) {
    out.push(_dRow(r.devBand === 'red' ? 'bad' : r.devBand === 'yellow' ? 'warn' : 'ok',
      'الفلتر 4 — الوزن مقابل الهدف المسجّل',
      `الوزن ${formatNum(r.weight)}% · الهدف ${formatNum(r.targetWeight)}% · الانحراف ${E(r.devTxt || sign(r.dev))} (عتبة ${r.devBand === 'red' ? 'حمراء' : r.devBand === 'yellow' ? 'صفراء' : 'خضراء'})`));
  } else {
    out.push(_dRow('neutral', 'الفلتر 4 — الوزن مقابل الهدف',
      `لا هدف وزن مسجّل لهذا السهم. سجّله في صفحة «أهداف الأسهم». نُراقب السقف فقط.`));
  }
  out.push(_dRow(r.overCap ? 'bad' : 'ok', 'السقف الدستوري للوزن (§1)',
    `الوزن ${formatNum(r.weight)}% مقابل السقف ${formatNum(r.cap)}%${r.blueChip ? ' (قيادي)' : ''} + منطقة سماح ${CAP_BUFFER}% (حتى ${formatNum(r.cap + CAP_BUFFER)}%) → ${r.overCap ? 'كُسر — يفرض التخفيف (الفلتر 4)' : 'ضمن السقف'}`));

  // سقف القطاع (§4 على مستوى المحفظة)
  const secPct = sectorPctOf(h.sector, totalValue);
  const secOver = secPct > CAPS.sector + SECTOR_BUFFER;
  out.push(_dRow(secOver ? 'bad' : 'ok', `سقف القطاع (${CAPS.sector}% + سماح ${SECTOR_BUFFER}%)`,
    `قطاع «${E((h.sector || '').trim() || 'غير مصنّف')}» = ${formatNum(secPct)}% من المحفظة → ${secOver ? 'تجاوز السقف' : 'ضمن السقف'}`));

  // ملاحظة دستورية خاصة
  if (r.specialNote) out.push(_dRow('warn', 'ملاحظة دستورية (§3)', E(r.specialNote)));

  // ── المالية التفصيلية + تاريخ مركزك ──
  out.push('<h4 class="de-d-h">مركزك في هذا السهم</h4>');
  const kv = (k, v) => `<div class="de-kv"><span>${k}</span><b>${v}</b></div>`;

  const txAll   = txByTicker[ticker] || [];
  const firstTx = txAll.find(t => t.type === 'buy' || t.type === 'grant');
  const holdDays = firstTx ? Math.floor((Date.now() - firstTx.date.getTime()) / 86400000) : null;
  const nBuy  = txAll.filter(t => t.type === 'buy').length;
  const nSell = txAll.filter(t => t.type === 'sell').length;
  const nGrant = txAll.filter(t => t.type === 'grant').length;

  out.push('<div class="de-d-kvs">' + [
    kv('عدد الأسهم', formatNum(fin.shares)),
    kv('متوسط التكلفة', formatNum(+h.avg_price)),
    kv('تكلفة الحيازة', formatNum(fin.costBasis)),
    kv('القيمة السوقية', formatNum(fin.mktVal)),
    kv('ر/خ غير محقق', `<span style="color:${fin.unreal >= 0 ? '#10b981' : '#ef4444'}">${sign(fin.unreal)} (${formatNum(fin.unrealPct)}%)</span>`),
    kv('ر/خ محقق (مبيعات)', sign(fin.realized)),
    kv('إجمالي الأرباح الموزعة', formatNum(fin.divTotal)),
    kv('العائد على التكلفة YOC', formatNum(fin.yoc) + '%'),
    kv('العائد الفعلي السنوي XIRR', fin.xirr != null
      ? `<span style="color:${fin.xirr >= 0 ? '#10b981' : '#ef4444'}">${sign(fin.xirr)}%</span>`
      : '<span class="text-muted">غير كافٍ للحساب</span>'),
    kv('أول شراء', firstTx
      ? `${E(firstTx.date.toISOString().slice(0, 10))} (${holdDays} يوماً)`
      : '<span class="text-muted">—</span>'),
    kv('حركاتك على السهم', `${nBuy} شراء · ${nSell} بيع${nGrant ? ` · ${nGrant} منحة` : ''}`),
    kv('طزاجة السعر', (() => {
      if (h.price_manual) return '✋ يدوي (محميّ من التحديث الآلي)';
      if (!h.price_updated_at) return '<span class="text-muted">غير معروفة</span>';
      const d = Math.floor((Date.now() - new Date(h.price_updated_at).getTime()) / 86400000);
      return d <= 7 ? `✅ محدَّث (${d} يوم)` : `<span style="color:#f59e0b">⏰ عمره ${d} يوماً</span>`;
    })()),
  ].join('') + '</div>');

  // عدسة الدخل — مساهمة المركز في دخل المحفظة وفي هدف الدخل الشهري (§1)
  let portfolioTTM = 0;
  Object.values(divByTicker).forEach(arr => arr.forEach(d => {
    const t = d.date.getTime();
    if (t >= Date.now() - 365 * 86400000 && t <= Date.now()) portfolioTTM += (d.amount || 0);
  }));
  const incomeShare = portfolioTTM > 0 ? fin.ttmDiv / portfolioTTM * 100 : 0;
  const monthlyFromStock = fin.ttmDiv / 12;
  const goalShare = incomeGoalMonthly > 0 ? monthlyFromStock / incomeGoalMonthly * 100 : 0;

  out.push('<h4 class="de-d-h">عدسة الدخل — مساهمته في هدفك</h4>');
  out.push('<div class="de-d-kvs">' + [
    kv('دخل التوزيعات (آخر 12 شهراً)', formatNum(fin.ttmDiv) + ' ر.س'),
    kv('أي شهرياً', formatNum(monthlyFromStock) + ' ر.س'),
    kv('حصته من دخل المحفظة', formatNum(incomeShare) + '%'),
    kv(`من هدف ${formatNum(incomeGoalMonthly)} ر.س شهرياً`, `<b>${formatNum(goalShare)}%</b>`),
    kv('YOC (آخر 12 شهراً)', formatNum(fin.fwdYoc) + '%'),
    kv('YOC التراكمي', formatNum(fin.yoc) + '%'),
  ].join('') + '</div>');
  out.push(`<div class="small text-muted" style="margin-top:4px">دخل المحفظة الكلي (آخر 12 شهراً): ${formatNum(portfolioTTM)} ر.س — أي ${formatNum(portfolioTTM / 12)} ر.س شهرياً مقابل هدف ${formatNum(incomeGoalMonthly)} ر.س (§1).</div>`);

  // الأرباح السنوية
  const years = Object.keys(fin.byYear).map(Number).sort((a, b) => b - a);
  if (years.length) {
    out.push(`<div class="small text-muted" style="margin-top:8px">الأرباح الموزعة سنوياً (${fin.divCount} دفعة):</div>`);
    out.push('<div class="de-d-kvs">' + years.map(y => kv(String(y), formatNum(fin.byYear[y]))).join('') + '</div>');
  }

  // ── تطوّر تقييماتك عبر الزمن (الدستور §4 الفلتر 2) ──
  out.push(valuationTimelineHtml(ticker));

  // تفصيل نماذج آخر تقييم — أي نموذج أعطى أي قيمة (من حاسبة القيمة العادلة)
  const lastVal = valByTicker[ticker];
  const models  = (lastVal && lastVal.results && Array.isArray(lastVal.results.models)) ? lastVal.results.models : [];
  const usable  = models.filter(m => m && m.raw != null && isFinite(+m.raw) && +m.raw > 0);
  if (usable.length) {
    out.push(`<div class="small text-muted" style="margin-top:10px">نماذج آخر تقييم (${E(lastVal.date || '—')}) — ${usable.length} نموذج صالح:</div>`);
    out.push('<div class="de-d-kvs">' + usable.map(m => {
      const v = +m.raw;
      const vs = r.price > 0 ? (v - r.price) / r.price * 100 : null;
      return kv(E(m.name), `${formatNum(v)}${vs != null
        ? ` <span class="text-muted small">(${vs >= 0 ? '+' : '−'}${formatNum(Math.abs(vs))}% عن السعر)</span>` : ''}`);
    }).join('') + '</div>');
    const raws = usable.map(m => +m.raw);
    const spread = Math.max(...raws) - Math.min(...raws);
    const mid = raws.reduce((a, b) => a + b, 0) / raws.length;
    if (mid > 0 && spread / mid > 0.5) {
      out.push(`<div class="small" style="color:#f59e0b;margin-top:4px">⚠️ تشتّت النماذج واسع (${formatNum(spread / mid * 100)}% من المتوسط) — القيمة العادلة هنا تقديرية أكثر منها دقيقة؛ اعتمد نطاقاً لا رقماً واحداً.</div>`);
    }
  }

  // مدخلات آخر تقييم + ملاحظاتك
  if (r.valInputs) {
    const inp = r.valInputs;
    const keyInputs = [];
    const pushIf = (lbl, v, suf = '') => { if (v != null && v !== '') keyInputs.push([lbl, v + suf]); };
    if (inp.companyType === 'reit') {
      pushIf('FFO/وحدة', inp.ffo); pushIf('مضاعف P/FFO', inp.pffoMultiple, 'x'); pushIf('Cap Rate', inp.capRate, '%');
    } else if (inp.companyType === 'bank') {
      pushIf('BVPS', inp.bvps); pushIf('ROE', inp.bankRoe, '%'); pushIf('P/B عادل', inp.bankFairPb, 'x'); pushIf('DPS', inp.bankDps);
    } else {
      pushIf('EPS', inp.eps); pushIf('FCF', inp.fcf); pushIf('توزيع/سهم', inp.dividends);
    }
    pushIf('نمو 5سنوات', inp.growth5yr, '%'); pushIf('Beta', inp.betaMain);
    pushIf('السعر وقت التقييم', inp.currentPrice);
    if (keyInputs.length) {
      out.push('<h4 class="de-d-h">أهم مدخلات آخر تقييم</h4>');
      out.push('<div class="de-d-kvs">' + keyInputs.map(([k, v]) => kv(k, E(String(v)))).join('') + '</div>');
    }
    if (inp.notes)          out.push(`<div class="small" style="margin-top:6px"><b>📝 ملاحظات التقييم:</b> ${E(inp.notes)}</div>`);
    if (inp.perplexityEval) out.push(`<div class="small" style="margin-top:6px"><b>🔍 تقييم Perplexity:</b> ${E(inp.perplexityEval)}</div>`);
  }

  // ── سجل مراجعاتك (§5) ──
  out.push(reviewSectionHtml(ticker));

  // ── مدخلاتك اليدوية للمحرّك (جدول مقروء) ──
  out.push(manualCfgHtml(ticker));

  out.push(`<div class="de-card-foot" style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn btn-secondary btn-sm" onclick="closeDetailCard(); openStockCard('${escapeHtmlSafe(ticker)}')">⚙️ تعديل المدخلات اليدوية</button>
    <a class="btn btn-secondary btn-sm" href="stock-valuation.html">💹 تحديث القيمة العادلة</a>
    <a class="btn btn-secondary btn-sm" href="tasks.html">📊 خطة الأسعار</a>
    <a class="btn btn-secondary btn-sm" href="review-log.html">📒 تسجيل مراجعة</a>
  </div>`);

  document.getElementById('de-detail-body').innerHTML = out.join('');
  document.getElementById('de-detail-modal').style.display = 'flex';
}
function closeDetailCard() { document.getElementById('de-detail-modal').style.display = 'none'; }

// ══════════════════════════════════════════════════════════════════════
// بطاقة السهم — إدخال مدخلات المحرّك يدوياً (الاستدامة/قيادي/نوع/عادلة)
// ══════════════════════════════════════════════════════════════════════
let _cardTicker = null;
function openStockCard(ticker) {
  const h = holdings.find(x => x.ticker === ticker);
  if (!h) return;
  _cardTicker = ticker;
  const cfg = engineCfg[ticker] || {};
  const autoType = classifyAsset(h.sector);

  document.getElementById('de-card-title').textContent = `بطاقة السهم — ${ticker} ${h.name}`;
  document.getElementById('de-card-sector').textContent = h.sector || '—';
  document.getElementById('de-card-autotype').textContent = ASSET_LABEL[autoType];
  document.getElementById('de-card-metric').textContent = SUSTAIN_METRIC[cfg.assetType || autoType];

  setSelect('de-card-assettype', cfg.assetType || '');
  setSelect('de-card-bluechip', cfg.blueChip === true ? 'yes' : cfg.blueChip === false ? 'no' : '');
  setSelect('de-card-covered', cfg.divCoverage  || ({ yes: 'covered', no: 'weak' })[cfg.divCovered]  || '');
  setSelect('de-card-healthy', cfg.fundamentals || ({ yes: 'healthy', no: 'soft' })[cfg.fundHealthy] || '');
  setSelect('de-card-cut',     cfg.divSignal    || ({ no: 'stable', yes: 'temp' })[cfg.divCut]       || '');
  document.getElementById('de-card-notes').value = cfg.notes || '';

  // كشف اتجاه التوزيع آلياً من سجل الأرباح — يظهر كاقتراح (يبقى إدخالك الأولوية)
  const dtEl = document.getElementById('de-card-divtrend');
  const tr = dividendTrendOf(ticker);
  if (dtEl) {
    if (tr && tr.signal !== 'insufficient') {
      const c = (tr.signal === 'cut' || tr.signal === 'stopped') ? '#ef4444' : tr.signal === 'growing' ? '#10b981' : 'var(--text-muted)';
      dtEl.innerHTML = `🔎 من سجل أرباحك: <span style="color:${c}">${escapeHtmlSafe(tr.note)}</span>` +
        (cfg.divSignal ? '' : ' — يُطبَّق آلياً ما لم تختر يدوياً');
    } else {
      dtEl.textContent = tr ? '🔎 سجل أرباحك أقصر من سنتين — لا كشف آلي' : '🔎 لا سجل أرباح لهذا الرمز';
    }
  }

  // خطة الأسعار مصدرها صفحة المهام — تُعرَض للقراءة فقط هنا
  const zt = zonesText(taskZones[ticker]);
  const fvHint = document.getElementById('de-card-fvhint');
  fvHint.innerHTML = zt
    ? `خطة الأسعار (من المهام): <strong>${escapeHtmlSafe(zt)}</strong>`
    : 'لا توجد خطة أسعار لهذا السهم — أضِفها في صفحة <a href="tasks.html" style="color:var(--accent)">مهام المحفظة</a>.';

  // مرجع التقييم: القيمة العادلة + تاريخها + تحذير القِدم
  const valEl = document.getElementById('de-card-valhint');
  const val = valByTicker[ticker];
  if (valEl) {
    if (val && val.fair) {
      const age = valAgeDays(val);
      const stale = age != null && age > VAL_STALE_DAYS;
      valEl.innerHTML = `🧮 آخر تقييم: <strong>عادلة ${formatNum(val.fair.avg)}</strong>` +
        (val.fair.max > val.fair.min ? ` (نطاق ${formatNum(val.fair.min)}–${formatNum(val.fair.max)})` : '') +
        (val.date ? ` · ${escapeHtmlSafe(val.date)}` : '') +
        (stale ? ` · <span style="color:#f59e0b">📅 قديم (${age} يوم) — حدّثه في الحاسبة</span>` : '') +
        (age == null ? ' · <span style="color:#f59e0b">❔ عمر التقييم غير معروف</span>' : '');
    } else {
      valEl.innerHTML = 'لا يوجد تقييم محفوظ — احسبه في <a href="stock-valuation.html" style="color:var(--accent)">القيمة العادلة للأسهم</a> ليغذّي الاستدامة.';
    }
  }

  // ملاحظة الدستور الخاصة (5110 / سياق الإسمنت الدوري)
  const noteEl = document.getElementById('de-card-note');
  const note = specialNoteOf(h);
  if (note) { noteEl.textContent = '📌 ' + note; noteEl.style.display = ''; }
  else      { noteEl.textContent = ''; noteEl.style.display = 'none'; }

  document.getElementById('de-card-modal').style.display = 'flex';
}
function setSelect(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function closeStockCard() { document.getElementById('de-card-modal').style.display = 'none'; _cardTicker = null; }

async function saveStockCard(e) {
  if (e) e.preventDefault();
  if (!_cardTicker) return;
  const v = id => document.getElementById(id).value;
  const cfg = { ...(engineCfg[_cardTicker] || {}) };

  cfg.assetType   = v('de-card-assettype') || undefined;
  const bc = v('de-card-bluechip');
  cfg.blueChip    = bc === 'yes' ? true : bc === 'no' ? false : undefined;
  cfg.divCoverage  = v('de-card-covered') || undefined;
  cfg.fundamentals = v('de-card-healthy') || undefined;
  cfg.divSignal    = v('de-card-cut') || undefined;
  cfg.notes        = v('de-card-notes').trim() || undefined;
  // أزِل المفاتيح القديمة (yes/no) بعد الترحيل للنموذج ثلاثي المستويات
  delete cfg.divCovered; delete cfg.fundHealthy; delete cfg.divCut;

  // نظّف المفاتيح الفارغة
  Object.keys(cfg).forEach(k => { if (cfg[k] === undefined) delete cfg[k]; });
  if (Object.keys(cfg).length) engineCfg[_cardTicker] = cfg;
  else delete engineCfg[_cardTicker];

  const ok = await saveUserSetting(ENGINE_STORE_KEY, engineCfg);
  showToast(ok ? '✅ حُفظت مدخلات السهم' : '⚠️ تعذّر الحفظ (تحقق من الاتصال)', ok ? 'success' : 'error');
  closeStockCard();
  runEngine();
}

// ══════════════════════════════════════════════════════════════════════
// تصدير جدول الإجراءات CSV
// ══════════════════════════════════════════════════════════════════════
function exportActionsCSV() {
  const rows = _results
    .filter(r => r.action !== 'hold' || r.buyZone)
    .sort((a, b) => a.priority - b.priority || b.weight - a.weight);
  if (!rows.length) { showToast('لا توجد إجراءات للتصدير', 'info'); return; }
  // AUDIT-FIX (2026-08): هدف غير مسجّل كان يُطبع «0.00» — الآن «غير متوفرة» (§8)،
  // وأُضيف عمودا «السقف» و«القيمة العادلة» بمطابقة صيغة مخرجات الدستور §7.
  const head = ['الرمز','الاسم','الإجراء','الوزن%','الهدف%','السقف%','السعر','القيمة العادلة','خطة الأسعار','السبب'];
  const lines = rows.map(r => [
    r.ticker, r.name, r.label, formatNum(r.weight),
    r.hasTarget ? formatNum(r.targetWeight) : 'غير متوفرة',
    formatNum(r.cap), formatNum(r.price),
    r.fairValue != null ? formatNum(r.fairValue) : 'غير متوفرة',
    zonesText(r.zones) || 'غير متوفرة', r.reason,
  ].map(csvCell).join(','));
  const csv = '﻿' + [head.map(csvCell).join(','), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `decision-engine-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

document.addEventListener('DOMContentLoaded', init);
