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
  // الهدف الفردي للسهم: نسبته المسجّلة في صفحة الأهداف، وإلا السقف الافتراضي
  // (7% عادي / 12% قيادي). هذا هدف السهم الفردي — لا علاقة له بسقف القطاع.
  const hasExplicitTarget = tgt.target_pct != null && +tgt.target_pct > 0;
  const targetWeight = hasExplicitTarget ? +tgt.target_pct : cap;

  const zones = priceZonesOf(h);      // خطة الأسعار من المهام (أو null)
  const sus = sustainabilityOf(h);
  const priceOk = price > 0 && +h.shares > 0; // حارس: بلا سعر/أسهم لا تُبنى إشارة سعرية
  const gaps = [];
  if (!priceOk) gaps.push('السعر الحالي');
  if (!zones)   gaps.push('خطة الأسعار (المهام)');
  if (sus.status === 'unknown') gaps.push('بوابة الاستدامة');
  const note = specialNoteOf(h);

  // انحراف الوزن عن الهدف الفردي، مصنّفاً حسب عتبات الألوان من الإعدادات.
  // (أخضر = ضمن الهدف فلا تنبيه · أصفر = تنبيه · أحمر = إجراء)
  const thr = ctx.thresholds;
  const dev = weight - targetWeight;                 // + فوق الهدف / − تحته
  const absDev = Math.abs(dev);
  const devBand = absDev <= thr.green ? 'green' : absDev <= thr.yellow ? 'yellow' : 'red';
  const devTxt = `${dev >= 0 ? '+' : '−'}${formatNum(absDev)} نقطة`;

  const taskType = taskTypes[h.ticker] || null; // قرار المالك من صفحة المهام
  const userWatching = taskType === 'monitoring';

  // مرجع التقييم: القيمة العادلة من آخر تقييم + عمره (للسياق والتحذير من القِدم)
  const val = valByTicker[h.ticker] || null;
  const valAge = valAgeDays(val);
  const valStale = valAge != null && valAge > VAL_STALE_DAYS;

  const base = {
    ticker: h.ticker, name: h.name, sector: h.sector,
    weight, cap, price, value, assetType, zones, taskType,
    sustain: sus, targetWeight, gaps, specialNote: note,
    fairValue: val && val.fair ? val.fair.avg : null, valDate: val ? val.date : null,
    valAgeDays: valAge, valStale,
    blueChip: isBlueChip(h), dev, devBand, severity: 'green',
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
  // ── P2: تجاوز هدف الوزن — فقط خارج العتبة الخضراء (لا تنبيه على فروق تافهة) ──
  const overWeight = dev > thr.green; // أصفر أو أحمر فوق الهدف

  if (overWeight || inTrimBand) {
    const reasons = [];
    if (inTrimBand) {
      const to = zones.trimTo ? `–${formatNum(zones.trimTo)}` : '';
      reasons.push(`نطاق التخفيف (المهام): السعر ${formatNum(price)} ≥ ${formatNum(zones.trimFrom)}${to} → بيع الزائد`);
    }
    if (overWeight) reasons.push(`الوزن ${formatNum(weight)}% مقابل الهدف ${formatNum(targetWeight)}% (انحراف ${devTxt}، عتبة ${devBand === 'red' ? 'حمراء' : 'صفراء'})`);
    // اللون: نطاق السعر = أحمر (سعر صريح)، أو لون عتبة الوزن
    const severity = inTrimBand ? 'red' : devBand;
    const label = inTrimBand
      ? 'تخفيف (نطاق السعر)'
      : severity === 'red'
        ? `تخفيف لإرجاع الوزن إلى ${formatNum(targetWeight)}%`
        : `تنبيه: اقترب من تجاوز الهدف (${formatNum(weight)}%)`;
    return { ...base, action: 'trim', severity,
      label, cutToWeight: overWeight ? targetWeight : null,
      priority: severity === 'red' ? 2 : 2.5,
      reason: reasons.join(' | ') };
  }

  // ── P3: تجميع من المهام (الفلتر 3) — السعر ≤ حدّ التجميع + استدامة سليمة + وزن تحت الهدف بعتبة ──
  const inBuyZone = zones && zones.accumulate && priceOk && sus.status === 'pass'
      && price <= zones.accumulate
      && dev < -thr.green; // تحت الهدف خارج العتبة الخضراء
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
  if (gaps.length)            holdReason = `احتفاظ — لا قاعدة انطبقت. بيانات غير متوفرة: ${gaps.join('، ')}`;
  else if (devBand !== 'green') holdReason = `احتفاظ — الانحراف ${devTxt} ضمن المتابعة، لا قاعدة سعر/استدامة انطبقت`;
  else                        holdReason = `احتفاظ — الوزن ضمن العتبة الخضراء (انحراف ${devTxt})، الاستدامة سليمة`;
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
    supabaseClient.from('transactions').select('ticker, type, shares, date').eq('is_archived', false),
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
    (txByTicker[tk] = txByTicker[tk] || []).push({ type: t.type, shares: +t.shares || 0, date: new Date(t.date) });
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
  renderAllTable();
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

  el.innerHTML = `
    <div class="de-stat de-stat-exit"><div class="de-stat-num">${n('exit')}</div><div class="de-stat-lbl">تصفية</div></div>
    <div class="de-stat de-stat-trim"><div class="de-stat-num">${n('trim')}</div><div class="de-stat-lbl">تخفيف</div></div>
    <div class="de-stat de-stat-monitor"><div class="de-stat-num">${n('monitor')}</div><div class="de-stat-lbl">مراقبة</div></div>
    <div class="de-stat de-stat-add"><div class="de-stat-num">${n('add')}</div><div class="de-stat-lbl">تجميع</div></div>
    <div class="de-stat de-stat-hold"><div class="de-stat-num">${n('hold')}</div><div class="de-stat-lbl">احتفاظ</div></div>
    <div class="de-stat"><div class="de-stat-num">${count} <span style="font-size:.6em;color:${sizeOk?'#10b981':'#f59e0b'}">${sizeOk?'✓':'⚠'}</span></div><div class="de-stat-lbl">عدد الأسهم (الهدف ${PORTFOLIO_SIZE.min}–${PORTFOLIO_SIZE.max})</div></div>
    <div class="de-stat de-stat-gap"><div class="de-stat-num">${gapsFV} / ${gapsSus}</div><div class="de-stat-lbl">ناقص: خطة أسعار / استدامة</div></div>
  `;
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
      <td>${formatNum(r.weight)}%<br><span class="small text-muted">الهدف ${formatNum(r.targetWeight)}% (${r.dev>=0?'+':'−'}${formatNum(Math.abs(r.dev))})</span></td>
      <td>${formatNum(r.price)}</td>
      <td class="small">${zonesText(r.zones) ? escapeHtmlSafe(zonesText(r.zones)) : '<span class="text-muted">غير متوفرة</span>'}</td>
      <td class="de-reason">${escapeHtmlSafe(r.reason)}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="openStockCard('${r.ticker}')">بطاقة</button></td>
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

// ── الجدول الكامل لكل الأسهم (تفصيل خط الأنابيب) ──
function renderAllTable() {
  const tbody = document.getElementById('de-all-tbody');
  if (!tbody) return;
  if (!holdings.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">📭</div><p>لا توجد أسهم في المحفظة بعد.</p></div></td></tr>`;
    return;
  }
  const sorted = _results.slice().sort((a, b) => a.priority - b.priority || b.weight - a.weight);
  tbody.innerHTML = sorted.map(r => {
    const susBadge = { pass: '🟢 سليمة', watch: '🟡 قلق مؤقت', fail: '🔴 تدهور مؤكّد', unknown: '⚪ غير متوفرة' }[r.sustain.status];
    const tr = r.sustain.trend;
    const trendLine = (tr && tr.signal !== 'insufficient')
      ? `<br><span class="small" title="${escapeHtmlSafe(tr.note)}" style="color:${tr.signal==='cut'||tr.signal==='stopped'?'#ef4444':tr.signal==='growing'?'#10b981':'var(--text-muted)'}">${({growing:'📈 توزيع ينمو',stable:'➡️ توزيع مستقر',cut:'📉 توزيع منخفض',stopped:'🛑 توزيع متوقّف'})[tr.signal]}</span>`
      : '';
    const zt = zonesText(r.zones);
    const fvCell = zt
      ? `<span class="small">${escapeHtmlSafe(zt)}</span>`
      : '<span class="text-muted">غير متوفرة</span>';
    const noteTag = r.specialNote ? ` <span title="${escapeHtmlSafe(r.specialNote)}" style="cursor:help">📌</span>` : '';
    const devColor = { red: '#ef4444', yellow: '#f59e0b' }[r.devBand] || 'var(--text-muted)';
    return `
    <tr class="de-row-${r.severity || 'green'}">
      <td><strong>${r.ticker}</strong> ${r.blueChip ? '<span title="سهم قيادي — سقف 12%">⭐</span>' : ''}${noteTag}<br><span class="small text-muted">${escapeHtmlSafe(r.name)}</span></td>
      <td>${escapeHtmlSafe(ASSET_LABEL[r.assetType])}<br><span class="small text-muted">${escapeHtmlSafe(SUSTAIN_METRIC[r.assetType])}</span></td>
      <td>${formatNum(r.weight)}%<br><span class="small" style="color:${devColor}">الهدف ${formatNum(r.targetWeight)}% (${r.dev>=0?'+':'−'}${formatNum(Math.abs(r.dev))})</span></td>
      <td>${formatNum(r.price)}${r.fairValue != null ? `<br><span class="small text-muted" title="القيمة العادلة من آخر تقييم${r.valDate ? ' بتاريخ '+escapeHtmlSafe(r.valDate) : ''}">عادلة ${formatNum(r.fairValue)}${r.valStale ? ' <span style="color:#f59e0b" title="آخر تقييم أقدم من 6 أشهر">📅 قديم</span>' : ''}</span>` : ''}</td>
      <td>${fvCell}</td>
      <td>${susBadge}${trendLine}</td>
      <td><span class="de-badge ${badgeFor(r)}">${r.label}</span></td>
      <td class="de-reason small">${escapeHtmlSafe(r.reason)}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="openStockCard('${r.ticker}')">⚙️</button></td>
    </tr>`;
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
