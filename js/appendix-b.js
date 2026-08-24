// ══════════════════════════════════════════════════════════════════════
// 📐 درجة تقييم المحفظة — منهجية الملحق (ب) من الدستور
// ----------------------------------------------------------------------
// الملحق (ب) يعرّف ستة أبعاد بأوزانها، والدرجة المسجّلة في الدستور 7.2/10.
// لكن الشيفرة لم تكن تحسب أياً منها: صفحة «تقييم أمان المحفظة» تقيس شيئاً
// آخر تماماً (ثمانية أبعاد بمدخلات يكتبها المالك بيده)، فالرقم 7.2 كان
// محميّاً بم.38 بلا مصدرٍ يُنتجه.
//
// هذا الملف يحسب الأبعاد الستة من البيانات الحقيقية:
//
//   استمرارية التوزيع   30%   سنوات التوزيع المتصل (م.2 · م.25)
//   العائد التوزيعي     20%   التوزيع الجاري ÷ السعر (م.2 · م.7)
//   جودة المكونات       15%   تغطية التوزيع من التدفق الحر (م.42-أ)
//   نمو التوزيع         15%   CAGR للتوزيع معدَّلاً للتجزئة (م.22)
//   التنوع الحقيقي      15%   العدد الفعّال والقطاعات والتركيز (م.28 · م.29)
//   التسعير عند الدخول   5%   سعر الشراء ÷ العادلة وقتها (م.48)
//
// ── قواعد مُلزِمة سرت على كل بُعد ──
//
// **م.20 — لا تقدير صامت.** البُعد الذي لا تكفي بياناته يُعلَن «غير مُقيَّم»
// ويخرج من البسط والمقام معاً، والدرجة تُقنَّن على ما قِيس فعلاً. ولا يأخذ
// صفراً: الصفر حكمٌ، والغياب ليس حكماً.
//
// **م.21 — لا معاقبة على نقص بيانات المحرّك.** سهمٌ بلا سلسلة في ملفات
// تداول لا يُحسب «بلا توزيع متصل»؛ يُستثنى من ذلك البُعد ويُعلَن.
//
// **الترجيح بالقيمة السوقية لا بالعدد.** مركزٌ بـ2% لا يزن كمركزٍ بـ15%.
//
// **م.38 — الدرجة قياس لا مكافأة.** هذا الملف يحسب ولا يجتهد، ويعرض
// الدرجة المسجّلة في الدستور بجانب المحسوبة، ولا يكتب في الدستور شيئاً.
// أي فارق بين الرقمين يُعرض ولا يُبتلع — وتفسيره قرار المالك (م.73).
//
// **العتبات:** ما نصّ عليه الدستور مربوطٌ بمادته. وما سكت عنه (نمو التوزيع
// خاصةً) يُعلَن **اصطلاحاً** صراحةً في المخرَج، ولا يُمرَّر كأنه نصّ.
// ══════════════════════════════════════════════════════════════════════

const APX_B_WEIGHTS = [
  { key: 'continuity', label: 'استمرارية التوزيع', weight: 0.30, art: 'م.2 · م.25' },
  { key: 'yield',      label: 'العائد التوزيعي',   weight: 0.20, art: 'م.2 · م.7'  },
  { key: 'quality',    label: 'جودة المكونات ومتانتها', weight: 0.15, art: 'م.42-أ' },
  { key: 'growth',     label: 'نمو التوزيع',        weight: 0.15, art: 'م.22 · اصطلاح' },
  { key: 'diversity',  label: 'التنوع الحقيقي',     weight: 0.15, art: 'م.28 · م.29' },
  { key: 'entry',      label: 'التسعير عند الدخول', weight: 0.05, art: 'م.48' },
];

// الدرجة المسجّلة في الدستور — تُعرض للمقارنة ولا تُكتب ولا تُعدَّل (م.38)
const APX_B_RECORDED = 7.2;

// خطّي بين حدّين، مقصوص في [0,1]
function apxLin(v, lo, hi) {
  if (v == null || !isFinite(v) || hi === lo) return null;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

// ── ① استمرارية التوزيع (م.2 · م.25) ──
// م.25 تجعل «توزيع متصل ≥ 5 سنوات» شرطاً للفئتين (أ) و(ب)، و≥ 4 للفئة (ج)،
// وما دونها يُنزل السهم للفئة (د). فالسلّم هنا حدودُ المادة نفسها لا اجتهاد.
// وم.2: الخفض لا يقطع الاتصال، الانقطاع الكامل يصفّره — وهو ما تطبّقه
// tdDividendStreak، فلا نعيد تعريفه هنا بمعنى ثانٍ.
function apxContinuity(rows) {
  const scored = [], missing = [];
  rows.forEach(r => {
    const st = (typeof tdDividendStreak === 'function') ? tdDividendStreak(r.ticker) : null;
    if (st == null || !(typeof TADAWUL_DATA !== 'undefined' && TADAWUL_DATA[r.ticker])) {
      missing.push(r); return;                       // م.21: لا يُحسب صفراً
    }
    const s = st >= 5 ? 1 : st >= 4 ? 0.80 : st >= 3 ? 0.60 : st >= 2 ? 0.40 : st >= 1 ? 0.20 : 0;
    scored.push({ ...r, raw: st, s });
  });
  return apxAggregate(scored, missing, rows,
    v => `${v.toFixed(1)} سنة متصلة (مرجَّحة)`,
    'سنوات التوزيع المتصل: 5 فأكثر = الدرجة الكاملة، وهي عتبة الفئتين (أ) و(ب) في م.25.');
}

// ── ② العائد التوزيعي (م.2 · م.7) ──
// م.7 تثبّت العائد المطلوب لبلوغ الدخل الهدف: محفظة ~1.31 مليون عند عائد
// 5.5%. فـ5.5% هي نقطة الدرجة الكاملة لأنها العائد الذي بُني عليه الهدف
// نفسه، لا رقماً مختاراً. والصفر عند 2% — دون ذلك لا يخدم هدف الدخل.
function apxYield(rows) {
  const scored = [], missing = [];
  rows.forEach(r => {
    if (!(r.yieldPct > 0)) { missing.push(r); return; }
    scored.push({ ...r, raw: r.yieldPct, s: apxLin(r.yieldPct, 2, 5.5) });
  });
  return apxAggregate(scored, missing, rows,
    v => `${v.toFixed(2)}% (مرجَّح)`,
    'العائد 5.5% = الدرجة الكاملة — وهو العائد الذي تبني عليه م.7 محفظة الهدف (~1.31 مليون لدخل 6,000). والصفر عند 2%.');
}

// ── ③ جودة المكونات ومتانتها (م.42-أ) ──
// مناطق تغطية التوزيع الأربع من المادة حرفياً: 🟢 ≥1.00 · 🟡 0.85–1.00 ·
// 🟠 0.60–0.85 · 🔴 <0.60. الدرجة تتبع المنطقة لا رقماً مخترعاً.
function apxQuality(rows) {
  const scored = [], missing = [];
  rows.forEach(r => {
    const c = (typeof tdLatestCoverage === 'function') ? tdLatestCoverage(r.ticker) : null;
    if (!c || c.value == null || !isFinite(c.value)) { missing.push(r); return; }
    const v = c.value;
    const s = v >= 1.00 ? 1 : v >= 0.85 ? 0.70 : v >= 0.60 ? 0.40 : 0;
    scored.push({ ...r, raw: v, s, note: `${c.year}` });
  });
  // ⚠️ لا يُعرض «متوسط التغطية»: تغطيةٌ سالبة واحدة (تدفق حرّ سالب) تسحب
  // المتوسط إلى رقمٍ لا يصف أي سهم — قِسناه فخرج −0.28× لمحفظة أغلبها 🟢.
  // الدرجة تُحسب لكل سهم على حدة ثم تُرجَّح، فالعرض يتبعها: توزيعُ المناطق.
  const agg = apxAggregate(scored, missing, rows, () => '',
    'مناطق م.42-أ الأربع: ≥1.00 🟢 كاملة · 0.85–1.00 🟡 = 0.7 · 0.60–0.85 🟠 = 0.4 · دونها 🔴 صفر. '
    + 'والدرجة لكل سهم على حدة ثم تُرجَّح بالقيمة — لا متوسط نسبٍ، فسالبةٌ واحدة تُفسده.');
  if (agg.score != null) {
    const totalV = scored.reduce((a, r) => a + r.value, 0);
    const share = f => (scored.filter(f).reduce((a, r) => a + r.value, 0) / totalV * 100);
    const g = share(r => r.raw >= 1.00), y = share(r => r.raw >= 0.85 && r.raw < 1.00);
    const o = share(r => r.raw >= 0.60 && r.raw < 0.85), b = share(r => r.raw < 0.60);
    agg.detail = [g >= 0.5 ? `🟢 ${g.toFixed(0)}%` : null, y >= 0.5 ? `🟡 ${y.toFixed(0)}%` : null,
      o >= 0.5 ? `🟠 ${o.toFixed(0)}%` : null, b >= 0.5 ? `🔴 ${b.toFixed(0)}%` : null]
      .filter(Boolean).join(' · ') + ' من القيمة';
  }
  return agg;
}

// ── ④ نمو التوزيع (م.22 · اصطلاح مُعلَن) ──
// ⚠️ **الدستور لا يضع عتبةً لنمو التوزيع.** م.7 تسجّل النمو المرجّح 2.76%
// وصفاً للحال لا هدفاً. فالسلّم هنا **اصطلاحٌ يُعلَن**: صفرٌ عند نموٍّ صفري
// (الدخل يتآكل بالتضخم) والكاملة عند 5%. ولا يُمرَّر كأنه نصّ دستوري.
// والقياس من tdDpsGrowth: معدَّل للتجزئة (م.22)، وبحارس الطرف الشاذّ.
const APX_GROWTH_FULL = 0.05;
function apxGrowth(rows) {
  const scored = [], missing = [];
  rows.forEach(r => {
    const g = (typeof tdDpsGrowth === 'function') ? tdDpsGrowth(r.ticker) : null;
    // الطرف الشاذّ له بديلٌ مُعلَن في الدالة — نأخذه إن وُجد (م.24: الأسوأ للسهم)
    const v = (g && g.value != null && isFinite(g.value))
      ? (g.altValue != null && isFinite(g.altValue) ? Math.min(g.value, g.altValue) : g.value)
      : null;
    if (v == null) { missing.push(r); return; }
    scored.push({ ...r, raw: v * 100, s: apxLin(v, 0, APX_GROWTH_FULL) });
  });
  return apxAggregate(scored, missing, rows,
    v => `${v.toFixed(2)}% سنوياً (مرجَّح)`,
    '⚠️ اصطلاح مُعلَن لا نصّ: الدستور لا يضع عتبةً لنمو التوزيع. صفر عند نموٍّ صفري، والكاملة عند 5%. القياس معدَّل للتجزئة (م.22) وبحارس الطرف الشاذّ.');
}

// ── ⑤ التنوع الحقيقي (م.28 · م.29) ──
// ثلاثة أثلاث من موادّها: عدد الأسهم (م.29: 12–18)، عدد القطاعات (م.29: ≥8)،
// وأكبر قطاع (م.28: ≤25%). والعدد الفعّال يُحسب من هيرفندال فيميّز محفظةً
// عشرين سهماً متوازنة عن عشرين سهماً أحدها نصفها.
function apxDiversity(rows) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (!(total > 0) || !rows.length) {
    return { score: null, missing: rows.length, counted: 0, detail: 'لا حيازات',
      why: 'لا حيازات بقيمة سوقية' };
  }
  const hhi = rows.reduce((a, r) => a + Math.pow(r.value / total, 2), 0);
  const nEff = hhi > 0 ? 1 / hhi : 0;

  const bySec = {};
  rows.forEach(r => { const s = r.sector || 'غير مصنّف'; bySec[s] = (bySec[s] || 0) + r.value; });
  const sectors = Object.keys(bySec).length;
  const topSecPct = Math.max(...Object.values(bySec)) / total * 100;

  // م.29: 12–18 سهماً هو المدى المقبول ⇒ الكاملة عند 12 فعّالاً فأكثر
  const sCount = apxLin(nEff, 5, 12);
  // م.29: ثمانية قطاعات فأكثر
  const sSector = apxLin(sectors, 3, 8);
  // م.28: ≤25% كاملة، وتنهار عند 30% حيث «تصحيح إلزامي»
  const sTop = topSecPct <= 25 ? 1 : topSecPct >= 30 ? 0 : apxLin(30 - topSecPct, 0, 5);

  const s = (sCount + sSector + sTop) / 3;
  return {
    score: s, missing: 0, counted: rows.length,
    detail: `عدد فعّال ${nEff.toFixed(1)} · ${sectors} قطاعات · أكبر قطاع ${topSecPct.toFixed(1)}%`,
    why: 'ثلاثة أثلاث: العدد الفعّال (م.29: الكاملة عند 12 فأكثر) · عدد القطاعات (م.29: ≥8) · أكبر قطاع (م.28: ≤25% كاملة، وصفر عند 30% حيث التصحيح إلزامي). والعدد الفعّال من هيرفندال فيميّز التوازن من التركيز.',
  };
}

// ── ⑥ التسعير عند الدخول (م.48) ──
// نطاقات م.48 حرفياً على نسبة سعر الشراء إلى القيمة العادلة المتاحة وقتها.
// المصدر هو منطق تبويب «التسعير عند الدخول» نفسه — بنفس حرّاسه: مرجع السنة
// السابقة (لا استشراف)، واستبعاد ما يعبر تجزئةً (م.22).
function apxEntry(entryRows) {
  if (!Array.isArray(entryRows) || !entryRows.length) {
    return { score: null, missing: 1, counted: 0, detail: 'لا صفقة قابلة للقياس',
      why: 'يحتاج صفقات شراء لأسهمٍ لها تقييمٌ للسنة المالية السابقة، ولم تعبر تجزئة (م.22).' };
  }
  const amt = entryRows.reduce((a, r) => a + r.amount, 0);
  const ratio = entryRows.reduce((a, r) => a + r.ratio * r.amount, 0) / amt;
  const s = ratio <= 0.85 ? 1 : ratio <= 1.05 ? 0.85 : ratio <= 1.20 ? 0.60 : ratio <= 1.40 ? 0.30 : 0;
  return {
    score: s, missing: 0, counted: entryRows.length,
    detail: `${(ratio * 100).toFixed(0)}% من العادلة (مرجَّح بالمبلغ)`,
    why: 'نطاقات م.48: ≤0.85 فرصة (كاملة) · ≤1.05 تجميع · ≤1.20 عادل · ≤1.40 تخفيف · فوقها تصفية (صفر). المرجع تقييم السنة المالية السابقة للشراء — لا استشراف.',
  };
}

// تجميع مرجَّح بالقيمة السوقية، مع إعلان المستبعَد (م.20 · م.21)
function apxAggregate(scored, missing, all, fmt, why) {
  const w = scored.reduce((a, r) => a + r.value, 0);
  if (!(w > 0)) {
    return { score: null, missing: missing.length, counted: 0,
      detail: 'غير مُقيَّم', why,
      missingTickers: missing.map(r => r.ticker) };
  }
  const score = scored.reduce((a, r) => a + r.s * r.value, 0) / w;
  const raw   = scored.reduce((a, r) => a + r.raw * r.value, 0) / w;
  const covered = w / all.reduce((a, r) => a + r.value, 0);
  return {
    score, missing: missing.length, counted: scored.length,
    coveredPct: covered * 100,
    detail: fmt(raw), why,
    missingTickers: missing.map(r => r.ticker),
  };
}

// ══════════════════════════════════════════════════════════════════════
// الحساب الكامل — يُعيد الأبعاد الستة والدرجة المقنَّنة
// ══════════════════════════════════════════════════════════════════════
// rows: [{ ticker, sector, value, yieldPct }]  ·  entryRows: من تبويب الدخول
function computeAppendixB(rows, entryRows) {
  const dims = {
    continuity: apxContinuity(rows),
    yield:      apxYield(rows),
    quality:    apxQuality(rows),
    growth:     apxGrowth(rows),
    diversity:  apxDiversity(rows),
    entry:      apxEntry(entryRows),
  };

  // م.20: البُعد غير المُقيَّم يخرج من البسط والمقام معاً — لا يأخذ صفراً،
  // والدرجة تُقنَّن على أوزان ما قِيس فعلاً حتى تبقى من عشرة.
  let earned = 0, weighed = 0;
  const parts = APX_B_WEIGHTS.map(d => {
    const r = dims[d.key] || {};
    const ok = r.score != null && isFinite(r.score);
    if (ok) { earned += r.score * d.weight; weighed += d.weight; }
    return { ...d, ...r, assessed: ok, points: ok ? r.score * d.weight * 10 : null,
      maxPoints: d.weight * 10 };
  });

  const score = weighed > 0 ? (earned / weighed) * 10 : null;
  return {
    parts, score,
    weighedPct: weighed * 100,
    unassessed: parts.filter(p => !p.assessed).map(p => p.label),
    recorded: APX_B_RECORDED,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeAppendixB, APX_B_WEIGHTS, APX_B_RECORDED,
    apxContinuity, apxYield, apxQuality, apxGrowth, apxDiversity, apxEntry, apxLin };
}
