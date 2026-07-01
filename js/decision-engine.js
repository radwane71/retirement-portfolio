// ══════════════════════════════════════════════════════════════════════
// 🧭 محرّك القرار — يطبّق دستور المحفظة (CLAUDE.md) على البيانات الحيّة
// ----------------------------------------------------------------------
// المبدأ: قرار آلي مبني على قواعد ثابتة. المحرّك يطبّق الفلاتر فقط ولا
// يجتهد. لو القاعدة ما تنطبق → «احتفظ». لو البيانات ناقصة → «غير متوفرة»
// صراحةً (ممنوع التقدير الصامت — الدستور §8).
// ══════════════════════════════════════════════════════════════════════

// ── 1. الثوابت اللي ما تتغير (الدستور §1) — ممنوع تعديلها من الواجهة ──
const CAPS = Object.freeze({ single: 7, blueChip: 12, sector: 25 });
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

// ── الحالة ──
let holdings   = [];   // من جدول holdings
let stockTargets = {}; // ticker → { target_pct, entry_price, exit_price }
let taskZones  = {};   // ticker → { accumulate, trimFrom, trimTo, liquidate } من صفحة المهام
let taskTypes  = {};   // ticker → نوع المهمة (monitoring/accumulation/…) — قرار المالك
let divByTicker = {};  // ticker → [{ amount, date }] من سجل الأرباح الفعلي
let txByTicker  = {};  // ticker → [{ type, shares, date }] مرتّبة — لاستخراج DPS
let valByTicker = {};  // ticker → آخر تقييم من حاسبة القيمة العادلة {fair, ts, date, inputs}
const ENGINE_VAL_KEY = 'valuation_history_v1';
const VAL_STALE_DAYS = 180; // آخر تقييم أقدم من 6 أشهر = قديم
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

// يحوّل نص نتيجة الحاسبة ("12.50 — 18.30" أو "15.40 ر.س") إلى { avg, min, max }
function parseFairValueRange(str) {
  if (!str) return null;
  const nums = String(str).replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const vals = nums.map(Number).filter(n => n > 0);
  if (!vals.length) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, min, max };
}

// عمر آخر تقييم بالأيام (من entry.id الطابع الزمني)، أو null
function valAgeDays(v) { return (v && v.ts) ? Math.floor((Date.now() - v.ts) / 86400000) : null; }

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
  const fullYears = Object.keys(byYear).map(Number).filter(y => y < now.getFullYear()).sort((a, b) => b - a);
  if (fullYears.length < 2) return { signal: 'insufficient', note: 'أقل من سنتين كاملتين — غير كافٍ للمقارنة' };

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

  // ① من آخر تقييم: الأساسيات (EPS/FFO) والتغطية (التوزيع÷الأرباح) — أقصاه أصفر
  const val = valByTicker[h.ticker];
  if (val) {
    const inp = val.inputs || {};
    const isReit = inp.companyType === 'reit';
    const eps = numOf(inp.eps), ffo = numOf(inp.ffo), div = numOf(inp.dividends);
    const earn = isReit ? ffo : eps;
    if (!fun && earn != null) {
      fun = earn > 0 ? 'healthy' : 'soft';        // سالب → مراقبة لا تصفية
      autoSrc.fun = `تقييم: ${isReit ? 'FFO' : 'EPS'} ${formatNum(earn)}`;
    }
    if (!cov && div != null && div > 0 && earn != null && earn > 0) {
      const payout = div / earn;
      cov = payout <= 1.0 ? 'covered' : 'weak';    // توزيع فوق الأرباح → مراقبة
      autoSrc.cov = `تقييم: توزيع/${isReit ? 'FFO' : 'EPS'} = ${(payout * 100).toFixed(0)}%`;
    }
  }

  // ② من سجل الأرباح الفعلي: إشارة التوزيع — أقصاه أصفر
  const trend = dividendTrendOf(h.ticker);
  if (!sig && trend) {
    if (trend.signal === 'cut' || trend.signal === 'stopped')         { sig = 'temp';   autoSrc.sig = `أرباح: ${trend.note}`; }
    else if (trend.signal === 'growing' || trend.signal === 'stable') { sig = 'stable'; autoSrc.sig = `أرباح: ${trend.note}`; }
  }
  // وإلا: تقييم حديث بتوزيع قائم وموجب = لا إشارة قطع (مستقر) — استدلال معلَن
  if (!sig && val && numOf(val.inputs.dividends) > 0) {
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
  return { status: 'unknown', reason: 'بيانات الاستدامة غير مكتملة', trend, autoSrc };
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
  const hasExplicitTarget = tgt.target_pct != null && +tgt.target_pct > 0;
  const targetWeight = hasExplicitTarget ? +tgt.target_pct : null;

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
  const overCap = weight > cap;   // كسر السقف الدستوري (§1/§4) — حدّ صلب دائماً

  const taskType = taskTypes[h.ticker] || null; // قرار المالك من صفحة المهام
  const userWatching = taskType === 'monitoring';

  // مرجع التقييم: القيمة العادلة من آخر تقييم + عمره (للسياق والتحذير من القِدم)
  const val = valByTicker[h.ticker] || null;
  const valAge = valAgeDays(val);
  const valStale = valAge != null && valAge > VAL_STALE_DAYS;

  const base = {
    ticker: h.ticker, name: h.name, sector: h.sector, shares: +h.shares,
    weight, cap, price, value, assetType, zones, taskType,
    sustain: sus, targetWeight, hasTarget: hasExplicitTarget,
    entryPrice: tgt.entry_price != null ? +tgt.entry_price : null,
    exitPrice:  tgt.exit_price  != null ? +tgt.exit_price  : null,
    gaps, specialNote: note,
    fairValue: val && val.fair ? val.fair.avg : null, valDate: val ? val.date : null,
    valFair: val && val.fair ? val.fair : null, valInputs: val ? val.inputs : null,
    valAgeDays: valAge, valStale,
    blueChip: isBlueChip(h), dev, devBand, overCap, severity: 'green',
  };

  // ── P0: triggers الثابتة — فوق كل شي (الدستور §5) ──
  const trig = FIXED_TRIGGERS.find(t => t.ticker === h.ticker);
  if (trig) {
    base.trigger = { ...trig, fired: trig.cmp === 'gte' ? price >= trig.price : price <= trig.price };
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
  // قلق مؤقت (ربع واحد) → مراقبة، لا تصفية (حدّث العاقل بما يعقل)
  if (sus.status === 'watch') {
    return { ...base, action: 'monitor', label: 'مراقبة', priority: 1.5, severity: 'monitor',
      reason: `تنبيه استدامة مؤقت (${sus.reason}) — القرار الأمثل مراقبة لا تصفية؛ تأكّد من ربع آخر قبل أي إجراء` };
  }

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
    return { ...base, action: 'trim', severity,
      label, cutToWeight: cutTo,
      priority: severity === 'red' ? 2 : 2.5,
      reason: reasons.join(' | ') };
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
  await loadAll();
  runEngine();
}

async function loadAll() {
  const [rH, rT, rEng, rTasks, rDiv, rVal, rTx] = await Promise.all([
    supabaseClient.from('holdings').select('ticker, name, sector, shares, avg_price, current_price, target_weight').order('ticker'),
    supabaseClient.from('stock_targets').select('ticker, target_pct, entry_price, exit_price'),
    loadUserSetting(ENGINE_STORE_KEY),
    supabaseClient.from('portfolio_tasks')
      .select('ticker, type, accumulate_at, trim_from, trim_to, liquidate_above, status, updated_at, created_at')
      .eq('status', 'active').order('updated_at', { ascending: false }),
    supabaseClient.from('dividends').select('ticker, amount, date').eq('is_archived', false),
    loadUserSetting(ENGINE_VAL_KEY),
    supabaseClient.from('transactions').select('ticker, type, shares, date, total, price').eq('is_archived', false),
  ]);

  holdings = rH.data || [];
  stockTargets = {};
  (rT.data || []).forEach(r => { stockTargets[r.ticker] = r; });
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
    (txByTicker[tk] = txByTicker[tk] || []).push({ type: t.type, shares: +t.shares || 0, total: +t.total || 0, price: +t.price || 0, date: new Date(t.date) });
  });
  Object.values(txByTicker).forEach(rows => rows.sort((a, b) => a.date - b.date));

  // آخر تقييم لكل رمز من حاسبة القيمة العادلة (السجل مرتّب بالأحدث أولاً)
  valByTicker = {};
  (Array.isArray(rVal) ? rVal : []).forEach(entry => {
    const tk = (entry.inputs?.ticker || '').trim().toUpperCase();
    if (!tk || valByTicker[tk]) return; // أول ظهور = الأحدث
    valByTicker[tk] = {
      ts: typeof entry.id === 'number' ? entry.id : null,
      date: (entry.date || '').split('،')[0] || '',
      fair: parseFairValueRange(entry.results?.fairValueRange),
      inputs: entry.inputs || {},
    };
  });

  // خطة الأسعار + نوع المهمة لكل رمز من المهام النشطة — أحدث مهمة هي المرجع
  taskZones = {};
  taskTypes = {};
  (rTasks.data || []).forEach(t => {
    const tk = (t.ticker || '').trim().toUpperCase();
    if (!tk || taskZones[tk]) return; // مرتّبة بالأحدث → أول ظهور هو الأحدث
    const num = v => (v != null && +v > 0 ? +v : null);
    taskZones[tk] = {
      accumulate: num(t.accumulate_at),
      trimFrom:   num(t.trim_from),
      trimTo:     num(t.trim_to),
      liquidate:  num(t.liquidate_above),
    };
    taskTypes[tk] = t.type || null;
  });
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
  // قرار كل سهم فردي يعتمد على وزنه وهدفه الفرديين فقط — سقف القطاع 25%
  // يُفحَص على مستوى المحفظة في قسم منفصل (renderSectorCheck)، لا يُطبَّق على السهم.
  const ctx = { totalValue, thresholds };
  window._deThresholds = thresholds;

  _results = holdings.map(h => evaluateHolding(h, ctx));

  renderSummaryStrip(totalValue);
  renderActionTable();
  renderSectorCheck(totalValue);
  renderCards();

  // حفظ لقطة كاملة لمخرجات المحرّك → user_settings (تُدرَج في تقرير المراجعة وتُنسَخ احتياطياً)
  saveEngineSnapshot(totalValue, thresholds).catch(() => {});
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
  try { await saveUserSetting(ENGINE_SNAPSHOT_KEY, snapshot); } catch (_) {}
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

  // سطر خلاصة بلغة بسيطة فوق الجدول
  const hero = document.getElementById('de-hero-line');
  if (hero) {
    hero.innerHTML = needAction > 0
      ? `عندك <strong style="color:var(--accent)">${needAction}</strong> ${needAction === 1 ? 'سهم يحتاج' : 'أسهم تحتاج'} قراراً منك الآن. الباقي ضمن القواعد — تابع القائمة أدناه بالترتيب.`
      : `✅ لا يوجد إجراء مطلوب الآن — كل أسهمك ضمن قواعد محفظتك.`;
    // نواقص البيانات كملاحظة هادئة لا كخانة رقمية غامضة
    const noteEl = document.getElementById('de-gaps-note');
    if (noteEl) {
      noteEl.innerHTML = (gapsFV || gapsSus)
        ? `ℹ️ لإكمال الدقّة: ${gapsFV ? `<strong>${gapsFV}</strong> سهم بلا خطة أسعار` : ''}${gapsFV && gapsSus ? ' · ' : ''}${gapsSus ? `<strong>${gapsSus}</strong> سهم بلا بيانات استدامة` : ''} — أدخلها عبر زر ⚙️ في بطاقة السهم.`
        : '';
    }
  }
}

// سطر الوزن الفرعي: الهدف المسجّل + الانحراف، أو «بلا هدف · السقف» (إصلاح الهدف الملفّق)
function weightSubLine(r) {
  if (r.hasTarget) {
    return `الهدف ${formatNum(r.targetWeight)}% (${r.dev >= 0 ? '+' : '−'}${formatNum(Math.abs(r.dev))})`;
  }
  const capHit = r.overCap ? ' ⚠️ كُسر' : '';
  return `بلا هدف مسجّل · السقف ${formatNum(r.cap)}%${capHit}`;
}

// ── جدول الإجراءات مرتّب بالأولوية (الدستور §7) ──
function renderActionTable() {
  const tbody = document.getElementById('de-action-tbody');
  if (!tbody) return;
  const actionable = _results
    .filter(r => r.action !== 'hold' || r.buyZone)
    .sort((a, b) => a.priority - b.priority || b.weight - a.weight);

  if (!actionable.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">✅</div><p>لا يوجد سهم يحتاج إجراء الآن — كل المكوّنات ضمن القواعد.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = actionable.map(r => `
    <tr class="de-row-${r.severity || 'green'}">
      <td><span class="de-badge ${badgeFor(r)}">${r.label}</span></td>
      <td><strong>${r.ticker}</strong><br><span class="small text-muted">${escapeHtmlSafe(r.name)}</span></td>
      <td>${formatNum(r.weight)}%<br><span class="small text-muted">${escapeHtmlSafe(weightSubLine(r))}</span></td>
      <td>${formatNum(r.price)}</td>
      <td class="small">${zonesText(r.zones) ? escapeHtmlSafe(zonesText(r.zones)) : '<span class="text-muted">غير متوفرة</span>'}</td>
      <td class="de-reason">${escapeHtmlSafe(r.reason)}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="openDetailCard('${r.ticker}')">تفاصيل</button></td>
    </tr>`).join('');
}

// ── فحص سقف القطاع 25% (الفلتر 4) ──
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
  const breaches = rows.filter(r => r.pct > CAPS.sector);

  if (!breaches.length) {
    el.innerHTML = `<p class="text-muted" style="margin:0">✅ كل القطاعات تحت سقف ${CAPS.sector}%. أعلى قطاع: <strong>${escapeHtmlSafe(rows[0]?.sec || '—')}</strong> (${formatNum(rows[0]?.pct || 0)}%).</p>`;
    return;
  }
  el.innerHTML = breaches.map(b =>
    `<div class="de-alert-line">⚠️ تركيز قطاعي: <strong>${escapeHtmlSafe(b.sec)}</strong> = ${formatNum(b.pct)}% &gt; السقف ${CAPS.sector}% (الفلتر 4)</div>`
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
function toggleAllCards() {
  const wrap = document.getElementById('de-cards-wrap');
  const btn  = document.getElementById('de-cards-toggle');
  if (!wrap) return;
  const open = wrap.style.display === 'none';
  wrap.style.display = open ? '' : 'none';
  if (btn) btn.textContent = open ? '▴ إخفاء' : '▾ عرض كل الأسهم';
}

// ── العرض الرئيسي: بطاقة لكل شركة (تشمل البيانات الأساسية + زر تفاصيل) ──
function renderCards() {
  const wrap = document.getElementById('de-cards');
  if (!wrap) return;
  if (!holdings.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>لا توجد أسهم في المحفظة بعد.</p></div>`;
    return;
  }
  const sorted = _results.slice().sort((a, b) => a.priority - b.priority || b.weight - a.weight);
  wrap.innerHTML = sorted.map(r => {
    const noteTag = r.specialNote ? ` <span title="${escapeHtmlSafe(r.specialNote)}" style="cursor:help">📌</span>` : '';
    const star    = r.blueChip ? ' <span title="سهم قيادي — سقف 12%">⭐</span>' : '';
    const fvLine  = r.fairValue != null
      ? `<b>${formatNum(r.fairValue)}${r.valStale ? ' <span style="color:#f59e0b" title="أقدم من 6 أشهر">📅</span>' : ''}</b>`
      : '<b class="text-muted">—</b>';
    const zt = zonesText(r.zones);
    return `
    <div class="de-card de-card-${r.severity || 'green'}">
      <div class="de-card-top">
        <div class="de-card-id">
          <strong>${r.ticker}</strong>${star}${noteTag}
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
        <div class="de-kv"><span>نوع الأصل</span><b class="small">${escapeHtmlSafe(ASSET_LABEL[r.assetType])}</b></div>
      </div>
      ${trendChip(r.sustain.trend) ? `<div class="de-card-trend">${trendChip(r.sustain.trend)}</div>` : ''}
      ${zt ? `<div class="de-card-zones small">🎯 خطة الأسعار: ${escapeHtmlSafe(zt)}</div>` : '<div class="de-card-zones small text-muted">🎯 لا خطة أسعار</div>'}
      <div class="de-card-reason small">${escapeHtmlSafe(r.reason)}</div>
      <div class="de-card-foot">
        <button class="btn btn-primary btn-sm" onclick="openDetailCard('${r.ticker}')">🔍 تفاصيل كاملة</button>
        <button class="btn btn-secondary btn-sm" onclick="openStockCard('${r.ticker}')">⚙️ إدخال يدوي</button>
      </div>
    </div>`;
  }).join('');
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
  const divTotal  = divs.reduce((s, d) => s + (d.amount || 0), 0);
  const yoc       = costBasis > 0 ? divTotal / costBasis * 100 : 0;
  const cutoff    = Date.now() - 365 * 86400000;
  const ttmDiv    = divs.reduce((s, d) => s + (d.date.getTime() >= cutoff ? (d.amount || 0) : 0), 0);
  const fwdYoc    = costBasis > 0 ? ttmDiv / costBasis * 100 : 0;
  const byYear    = {};
  divs.forEach(d => { const y = d.date.getFullYear(); byYear[y] = (byYear[y] || 0) + d.amount; });
  return { shares, avgCost, costBasis, mktVal, unreal, unrealPct, realized, divTotal, yoc, ttmDiv, fwdYoc, byYear, divCount: divs.length, buyShares, sellShares, grantShares };
}

function sectorPctOf(sector, totalValue) {
  const sec = (sector || '').trim();
  const val = holdings.filter(h => (h.sector || '').trim() === sec)
    .reduce((s, h) => s + +h.shares * +h.current_price, 0);
  return totalValue > 0 ? val / totalValue * 100 : 0;
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

  // رأس: الإجراء النهائي
  out.push(`<div class="de-d-verdict de-row-${r.severity || 'green'}">
    <span class="de-badge ${badgeFor(r)}" style="font-size:.95rem">${E(r.label)}</span>
    <div class="small" style="margin-top:6px;line-height:1.6">${E(r.reason)}</div>
  </div>`);

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

  // الفلتر 2 — القيمة العادلة
  if (r.fairValue != null) {
    const margin = (r.fairValue - r.price) / r.fairValue * 100;
    const mStatus = margin >= 10 ? 'ok' : margin <= -10 ? 'bad' : 'warn';
    const rangeTxt = r.valFair && r.valFair.max > r.valFair.min
      ? ` (نطاق ${formatNum(r.valFair.min)}–${formatNum(r.valFair.max)})` : '';
    out.push(_dRow(mStatus, 'الفلتر 2 — القيمة العادلة مقابل السعر',
      `العادلة ${formatNum(r.fairValue)}${rangeTxt} · السعر ${formatNum(r.price)} → ` +
      `${margin >= 0 ? `هامش أمان ${formatNum(margin)}%` : `مبالغ فيه ${formatNum(Math.abs(margin))}%`}` +
      (r.valDate ? `<br><span class="text-muted">آخر تقييم: ${E(r.valDate)}${r.valStale ? ` · 📅 قديم (${r.valAgeDays} يوم)` : ''}</span>` : '')));
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
    out.push(_dRow(pos.startsWith('🔴') ? 'bad' : pos.startsWith('⚠️') ? 'warn' : pos.startsWith('✅') ? 'ok' : 'neutral',
      'الفلتر 3 — خطة الأسعار (من المهام)', `${E(zt)}<br>${E(pos)}`));
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
    `الوزن ${formatNum(r.weight)}% مقابل السقف ${formatNum(r.cap)}%${r.blueChip ? ' (قيادي)' : ''} → ${r.overCap ? 'كُسر — يفرض التخفيف (الفلتر 4)' : 'ضمن السقف'}`));

  // سقف القطاع (§4 على مستوى المحفظة)
  const secPct = sectorPctOf(h.sector, totalValue);
  out.push(_dRow(secPct > CAPS.sector ? 'bad' : 'ok', `سقف القطاع (${CAPS.sector}%)`,
    `قطاع «${E((h.sector || '').trim() || 'غير مصنّف')}» = ${formatNum(secPct)}% من المحفظة → ${secPct > CAPS.sector ? 'تجاوز السقف' : 'ضمن السقف'}`));

  // ملاحظة دستورية خاصة
  if (r.specialNote) out.push(_dRow('warn', 'ملاحظة دستورية (§3)', E(r.specialNote)));

  // ── المالية التفصيلية ──
  out.push('<h4 class="de-d-h">المالية التفصيلية لهذا السهم</h4>');
  const kv = (k, v) => `<div class="de-kv"><span>${k}</span><b>${v}</b></div>`;
  out.push('<div class="de-d-kvs">' + [
    kv('عدد الأسهم', formatNum(fin.shares)),
    kv('متوسط التكلفة', formatNum(+h.avg_price)),
    kv('تكلفة الحيازة', formatNum(fin.costBasis)),
    kv('القيمة السوقية', formatNum(fin.mktVal)),
    kv('ر/خ غير محقق', `<span style="color:${fin.unreal >= 0 ? '#10b981' : '#ef4444'}">${sign(fin.unreal)} (${formatNum(fin.unrealPct)}%)</span>`),
    kv('ر/خ محقق (مبيعات)', sign(fin.realized)),
    kv('إجمالي الأرباح الموزعة', formatNum(fin.divTotal)),
    kv('العائد على التكلفة YOC', formatNum(fin.yoc) + '%'),
  ].join('') + '</div>');

  // عدسة الدخل (مهمة المحفظة: دخل توزيعات) — مساهمة المركز في دخل المحفظة
  let portfolioTTM = 0;
  Object.values(divByTicker).forEach(arr => arr.forEach(d => { if (d.date.getTime() >= Date.now() - 365 * 86400000) portfolioTTM += (d.amount || 0); }));
  const incomeShare = portfolioTTM > 0 ? fin.ttmDiv / portfolioTTM * 100 : 0;
  out.push('<h4 class="de-d-h">عدسة الدخل — مساهمة المركز في دخل المحفظة</h4>');
  out.push('<div class="de-d-kvs">' + [
    kv('دخل التوزيعات (آخر 12 شهراً)', formatNum(fin.ttmDiv) + ' ر.س'),
    kv('حصته من دخل المحفظة', formatNum(incomeShare) + '%'),
    kv('YOC (آخر 12 شهراً)', formatNum(fin.fwdYoc) + '%'),
    kv('YOC التراكمي', formatNum(fin.yoc) + '%'),
  ].join('') + '</div>');
  out.push(`<div class="small text-muted" style="margin-top:4px">دخل المحفظة الكلي (آخر 12 شهراً): ${formatNum(portfolioTTM)} ر.س · المهمة: دخل شهري مستهدف (الدستور).</div>`);

  // الأرباح السنوية
  const years = Object.keys(fin.byYear).map(Number).sort((a, b) => b - a);
  if (years.length) {
    out.push(`<div class="small text-muted" style="margin-top:8px">الأرباح الموزعة سنوياً (${fin.divCount} دفعة):</div>`);
    out.push('<div class="de-d-kvs">' + years.map(y => kv(String(y), formatNum(fin.byYear[y]))).join('') + '</div>');
  }

  // آخر تقييم — أهم المدخلات
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
    if (keyInputs.length) {
      out.push('<h4 class="de-d-h">أهم مدخلات آخر تقييم</h4>');
      out.push('<div class="de-d-kvs">' + keyInputs.map(([k, v]) => kv(k, E(String(v)))).join('') + '</div>');
    }
    if (inp.notes)         out.push(`<div class="small" style="margin-top:6px"><b>📝 ملاحظات التقييم:</b> ${E(inp.notes)}</div>`);
    if (inp.perplexityEval) out.push(`<div class="small" style="margin-top:6px"><b>🔍 تقييم Perplexity:</b> ${E(inp.perplexityEval)}</div>`);
  }

  // المدخلات اليدوية المحفوظة للمحرّك
  const cfg = engineCfg[ticker];
  if (cfg && Object.keys(cfg).length) {
    out.push('<h4 class="de-d-h">مدخلاتك اليدوية المحفوظة للمحرّك</h4>');
    out.push(`<div class="small">${E(JSON.stringify(cfg))}</div>`);
  }

  out.push(`<div class="de-card-foot" style="margin-top:14px">
    <button class="btn btn-secondary btn-sm" onclick="closeDetailCard(); openStockCard('${ticker}')">⚙️ تعديل المدخلات اليدوية</button>
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
        (stale ? ` · <span style="color:#f59e0b">📅 قديم (${age} يوم) — حدّثه في الحاسبة</span>` : '');
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
  const head = ['الرمز','الاسم','الإجراء','الوزن%','الهدف%','السعر','خطة الأسعار','السبب'];
  const lines = rows.map(r => [
    r.ticker, r.name, r.label, formatNum(r.weight), formatNum(r.targetWeight), formatNum(r.price),
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
