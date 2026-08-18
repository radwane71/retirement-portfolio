// ══════════════════════════════════════════════════════════════════════
// 🧠 decision-intel.js — طبقة الذكاء فوق محرّك القرار
// ----------------------------------------------------------------------
// المحرّك (decision-engine.js) يجيب: «أي سهم يحتاج إجراءً الآن ولماذا».
// هذه الطبقة تجيب أسئلة أخرى لا يجيبها: أين أنت من السوق؟ ما عمر محفظتك؟
// أي توزيعات مرشّحة للاستمرار وأيها مرشّحة للخفض؟ وما القرار لو طُبِّقت
// قواعدك كلها دفعةً واحدة («لو أنا مكانك»)؟ وكم يمكن الوثوق بكل رقم منها؟
//
// ثلاث قواعد حاكمة (الدستور §2/§8):
//  ① كل رقم مشتقّ من بياناتك أنت — لا رقم مستورد ولا تقدير صامت.
//  ② ما لا يمكن قياسه يُعلَن «غير متوفر» مع ذكر ما ينقص بالضبط.
//  ③ كل مؤشر يحمل نسبة موثوقية محسوبة، وتاريخ اليوم الذي سترتفع فيه.
//
// يُحمَّل بعد decision-engine.js ويُستدعى من runEngine() عبر:
//     DecisionIntel.boot({ ... })
// ملفوف في IIFE لأن الصفحة تُحمَّل كسكربتات كلاسيكية بنطاق عام مشترك،
// فأي const باسم مكرّر مع decision-engine.js يُسقط الصفحة كلها.
// ══════════════════════════════════════════════════════════════════════
'use strict';

window.DecisionIntel = (function () {

  // ── ثوابت منقولة بوعي من صفحات أخرى (المصدر مذكور — لا تُغيَّر هنا وحدها) ──
  const TASI_BM_KEY   = 'tharwa-benchmark_v1'; // js/performance.js:1550 — سجل تاسي
  const TASI_DIV_YIELD = 0.035;                // js/performance.js:2064 — افتراض معلَن
  const MARKET_CAP_BENCHMARK = 0.044;          // js/forecast.js:198 — نمو تاسي السعري 2010-2024
  const PERF_BLEND_K     = 41;                 // js/forecast.js:221 — مصداقية Bühlmann
  const PERF_BLEND_MAX_W = 0.25;               // js/forecast.js:222 — سقف وزن أدائك
  const INTEL_HISTORY_KEY = 'decision_intel_history_v1';
  const INTEL_HISTORY_MAX = 400;

  const DAY = 86400000;
  const MONTH_MS = 30.44 * DAY;
  const YEAR_MS  = 365.25 * DAY;

  // ── الحالة ──
  let D = null;        // السياق القادم من المحرّك
  let TASI = [];       // [{date:'YYYY-MM-DD', value}] تصاعدياً
  let CF = [];         // cashflow_entries: [{date, type, amount}]
  let HISTORY = [];    // سجل القياسات اليومية
  let INTEL = null;    // آخر نتيجة محسوبة (للتصدير/الفحص)

  // ══════════════════════════════════════════════════════════════════
  // أدوات صغيرة
  // ══════════════════════════════════════════════════════════════════
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const numOf = v => (v == null || v === '' ? null : (isFinite(+v) ? +v : null));
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const sgn = n => (n >= 0 ? '+' : '−') + formatNum(Math.abs(n));
  const pctTxt = (r, d = 1) => (r == null ? '—' : (r >= 0 ? '+' : '−') + formatNum(Math.abs(r * 100), d) + '%');
  const isoOf = d => {
    const x = (d instanceof Date) ? d : new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const daysBetween = (a, b) => Math.floor((b - a) / DAY);
  const addDays = (ms, n) => new Date(ms + n * DAY);
  const fmtMonths = m => (m < 12 ? `${Math.round(m)} شهر` : `${(m / 12).toFixed(1)} سنة`);

  function safeXIRR(flows) {
    const hasNeg = flows.some(f => f.amount < 0), hasPos = flows.some(f => f.amount > 0);
    if (!hasNeg || !hasPos || flows.length < 2) return null;
    try { const r = computeXIRR(flows); return (r == null || !isFinite(r)) ? null : r; } catch (_) { return null; }
  }

  // كل المعاملات مسطّحة ومرتّبة زمنياً
  function allTx() {
    const out = [];
    Object.entries(D.txByTicker || {}).forEach(([tk, rows]) =>
      rows.forEach(t => out.push({ ...t, ticker: tk })));
    return out.sort((a, b) => a.date - b.date);
  }

  // ══════════════════════════════════════════════════════════════════
  // تحميل البيانات الإضافية (لا يُعطِّل المحرّك عند الفشل — يُعلَن فقط)
  // ══════════════════════════════════════════════════════════════════
  async function loadExtras() {
    const errs = [];

    // ① سجل تاسي: السحابة أولاً ثم النسخة المحلية (نفس مصدر صفحة الأداء)
    try {
      let raw = await loadUserSetting(TASI_BM_KEY);
      if (!Array.isArray(raw) || !raw.length) {
        try { raw = JSON.parse(localStorage.getItem(userLsKey(TASI_BM_KEY)) || 'null'); } catch (_) { raw = null; }
      }
      TASI = (Array.isArray(raw) ? raw : [])
        .filter(e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && isFinite(+e.value) && +e.value > 0)
        .map(e => ({ date: e.date, value: +e.value }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    } catch (_) { TASI = []; errs.push('تاسي'); }

    // ② التدفقات النقدية — لحساب عمر رأس المال المرجَّح والسحوبات
    try {
      const r = await supabaseClient.from('cashflow_entries')
        .select('date, type, amount').eq('is_archived', false).order('date');
      if (r.error) throw r.error;
      CF = (r.data || []).filter(e => e.date && (e.type === 'deposit' || e.type === 'withdrawal'))
        .map(e => ({ date: e.date, type: e.type, amount: +e.amount || 0 }));
    } catch (_) { CF = []; errs.push('التدفقات النقدية'); }

    // ③ سجل القياسات السابق
    try {
      const h = await loadUserSetting(INTEL_HISTORY_KEY);
      HISTORY = Array.isArray(h) ? h.filter(e => e && e.date) : [];
    } catch (_) { HISTORY = []; }

    return errs;
  }

  // ══════════════════════════════════════════════════════════════════
  // ① عمر المحفظة — تقويمي ومرجَّح بالتدفقات
  // العمر المرجَّح منقول حرفياً من js/forecast.js (capitalWeightedMonths):
  // كل ريال يُحسب بعدد الأشهر التي قضاها فعلاً في المحفظة، فمحفظة ضُخَّ
  // معظم مالها متأخراً لا تُحسب بعمر أول ريال دخلها.
  // ══════════════════════════════════════════════════════════════════
  function computeAge(tx) {
    const now = Date.now();
    const firstTx = tx.length ? tx[0].date : null;
    const firstCf = CF.length ? parseDateLocal(CF[0].date) : null;
    const first = (firstTx && firstCf) ? new Date(Math.min(firstTx, firstCf)) : (firstTx || firstCf);
    const calMonths = first ? Math.max(0, (now - first.getTime()) / MONTH_MS) : 0;

    let cwMonths = 0;
    if (CF.length) {
      let bal = 0, wsum = 0;
      CF.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach(cf => {
        const m = (now - parseDateLocal(cf.date).getTime()) / MONTH_MS;
        if (cf.type === 'deposit') { wsum += cf.amount * m; bal += cf.amount; }
        else if (bal > 0) { wsum *= (1 - Math.min(1, cf.amount / bal)); bal = Math.max(0, bal - cf.amount); }
      });
      cwMonths = bal > 0 ? Math.max(0.5, wsum / bal) : 0;
    }
    if (cwMonths <= 0) { // احتياطي: من المشتريات مباشرةً (نفس احتياطي forecast.js)
      let wb = 0, ws = 0;
      tx.filter(t => t.type === 'buy').forEach(t => {
        ws += t.total * ((now - t.date.getTime()) / MONTH_MS); wb += t.total;
      });
      tx.filter(t => t.type === 'sell').forEach(t => {
        if (wb > 0) ws *= (1 - Math.min(1, t.total / wb)); wb = Math.max(0, wb - t.total);
      });
      cwMonths = wb > 0 ? Math.max(0.5, ws / wb) : calMonths;
    }
    return { first, calMonths, cwMonths: Math.min(cwMonths, calMonths || cwMonths) };
  }

  // ══════════════════════════════════════════════════════════════════
  // ② أداء محفظتك الفعلي — XIRR على تدفقاتك الحقيقية
  // ══════════════════════════════════════════════════════════════════
  function computePerformance(tx) {
    const flows = [];
    let buys = 0, sells = 0, grantShares = 0;
    tx.forEach(t => {
      if (t.type === 'buy')  { flows.push({ date: t.date, amount: -t.total }); buys += t.total; }
      else if (t.type === 'sell') { flows.push({ date: t.date, amount: t.total }); sells += t.total; }
      else if (t.type === 'grant') grantShares += t.shares;
    });

    const cutoff = Date.now() - 365 * DAY;
    let divTotal = 0, divTTM = 0, divCount = 0;
    const divYearsSet = new Set();
    Object.values(D.divByTicker || {}).forEach(arr => arr.forEach(d => {
      flows.push({ date: d.date, amount: d.amount });
      divTotal += d.amount; divCount++;
      divYearsSet.add(d.date.getFullYear());
      if (d.date.getTime() >= cutoff) divTTM += d.amount;
    }));

    const mkt = D.totalValue;
    if (mkt > 0) flows.push({ date: new Date(), amount: mkt });

    const xirr = safeXIRR(flows);                     // % سنوي
    const netInvested = buys - sells;                 // صافي المصروف على الأسهم
    const totalGain = mkt + sells + divTotal - buys;  // ربح كلي (ورقي + محقق + توزيعات)
    const totalPct = buys > 0 ? totalGain / buys : null;

    // السحوبات والإيداعات من سجل التدفقات
    const deposits   = CF.filter(e => e.type === 'deposit').reduce((s, e) => s + e.amount, 0);
    const withdrawals = CF.filter(e => e.type === 'withdrawal').reduce((s, e) => s + e.amount, 0);

    return {
      xirr, buys, sells, netInvested, mkt, divTotal, divTTM, divCount, grantShares,
      divYears: [...divYearsSet].sort(), totalGain, totalPct, deposits, withdrawals,
      flows,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // ③ تاسي بنفس تدفقاتك — المقارنة الوحيدة العادلة
  // «لو حطّيت نفس المبالغ في نفس التواريخ في مؤشر تاسي، وين كنت اليوم؟»
  // مؤشر تاسي سعري لا يشمل التوزيعات، فنعرض نسختين:
  //   • سعري (المؤشر كما هو)
  //   • عائد إجمالي TRI = السعري مركَّباً بعائد توزيعات السوق 3.5% —
  //     وهو افتراض ثابت معلَن (نفس افتراض صفحة الأداء)، لا رقم مقيس.
  // ══════════════════════════════════════════════════════════════════
  function tasiAt(date) {
    if (!TASI.length) return null;
    const iso = isoOf(date);
    let lo = 0, hi = TASI.length - 1, ans = null;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (TASI[m].date <= iso) { ans = TASI[m]; lo = m + 1; } else hi = m - 1; }
    return ans;
  }

  function computeBenchmark(tx, perf) {
    if (TASI.length < 2) {
      return { status: 'na', reason: 'لا يوجد سجل لمؤشر تاسي محفوظ. افتح صفحة «الأداء التاريخي» → تبويب المؤشر واضغط «🔄 جلب تاسي تلقائياً» مرة واحدة، ثم عُد هنا.' };
    }
    const last = TASI[TASI.length - 1];
    const lastAgeDays = daysBetween(parseDateLocal(last.date).getTime(), Date.now());
    const now = Date.now();

    let units = 0, triValue = 0, covered = 0, missing = 0, missingFrom = null;
    const flows = [];
    tx.forEach(t => {
      if (t.type !== 'buy' && t.type !== 'sell') return;
      const amt = +t.total || 0;
      if (amt <= 0) return;
      const p = tasiAt(t.date);
      if (!p) { missing += amt; if (!missingFrom || t.date < missingFrom) missingFrom = t.date; return; }
      covered += amt;
      const s = t.type === 'buy' ? 1 : -1;
      const yrs = Math.max(0, (now - t.date.getTime()) / YEAR_MS);
      units    += s * amt / p.value;
      triValue += s * amt * (last.value / p.value) * Math.pow(1 + TASI_DIV_YIELD, yrs);
      flows.push({ date: t.date, amount: -s * amt });
    });

    const totalAmt = covered + missing;
    const coverPct = totalAmt > 0 ? covered / totalAmt : 0;
    if (coverPct < 0.9) {
      return { status: 'partial', coverPct, missingFrom,
        reason: `سجل تاسي المحفوظ يبدأ بعد ${missingFrom ? isoOf(missingFrom) : 'أول معاملاتك'}، فلا يغطّي إلا ${formatNum(coverPct * 100, 0)}% من مبالغ تداولك. المقارنة تُحجب لأن تغطية جزئية تعطي رقماً مضلّلاً — اجلب مدى أطول (5y) من صفحة الأداء.` };
    }

    const priceValue = units * last.value;
    if (!(priceValue > 0) || !(triValue > 0)) {
      return { status: 'na', reason: 'صافي وحداتك في المؤشر غير موجب (مبيعاتك تفوق مشترياتك بالقيمة) — المقارنة لا تُحسب.' };
    }

    const xirrPrice = safeXIRR([...flows, { date: new Date(), amount: priceValue }]);
    const xirrTri   = safeXIRR([...flows, { date: new Date(), amount: triValue }]);
    const alpha = (perf.xirr != null && xirrTri != null) ? perf.xirr - xirrTri : null;

    // أداء المؤشر نفسه خلال فترتك (نقطة إلى نقطة) — للسياق لا للمقارنة
    const firstCovered = tx.find(t => (t.type === 'buy' || t.type === 'sell') && tasiAt(t.date));
    const startPt = firstCovered ? tasiAt(firstCovered.date) : TASI[0];
    const idxChange = startPt ? (last.value - startPt.value) / startPt.value : null;

    return {
      status: 'ok', lastValue: last.value, lastDate: last.date, lastAgeDays, points: TASI.length,
      startValue: startPt ? startPt.value : null, startDate: startPt ? startPt.date : null,
      idxChange, priceValue, triValue, xirrPrice, xirrTri, alpha, coverPct,
      yourValue: perf.mkt,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // ④ الموثوقية — رقمان منفصلان عمداً، لا رقم واحد غامض
  //   (أ) «ثقة بيانات المحفظة» — نفس دالة صفحة الرؤية المستقبلية حرفياً،
  //       فلا تتناقض الصفحتان في الرقم المعروض.
  //   (ب) «اكتمال بيانات القرار» — خاص بهذه الصفحة: كم من محفظتك (بالوزن)
  //       عليه تقييم حديث وخطة أسعار وبوابة استدامة وسعر طازج.
  // ولكل منهما «متى يرتفع»: العتبات دوال درجية، فموعد القفزة قابل للحساب.
  // ══════════════════════════════════════════════════════════════════
  // منقولة من js/forecast.js:168 — أي تعديل هناك يجب تطبيقه هنا (وبالعكس)
  function computeDataConfidenceLocal(cwMonths, calMonths, rawDivYears, holdingsCount) {
    const maxCycles = Math.max(1, Math.ceil(calMonths / 12));
    const divYears  = Math.min(rawDivYears, maxCycles);
    const months    = cwMonths;
    const agePct = months < 3  ? 0.05 : months < 6  ? 0.20 :
                   months < 9  ? 0.32 : months < 12 ? 0.45 :
                   months < 18 ? 0.62 : months < 24 ? 0.76 :
                   months < 36 ? 0.88 : 1.00;
    const divPct = divYears === 0 ? 0.05 : divYears === 1 ? 0.45 :
                   divYears === 2 ? 0.72 : 0.95;
    const holdPct = holdingsCount < 3  ? 0.40 : holdingsCount < 6  ? 0.65 :
                    holdingsCount < 10 ? 0.82 : 0.95;
    return { score: Math.round(agePct * 45 + divPct * 35 + holdPct * 20), agePct, divPct, holdPct, divYears };
  }

  const AGE_TIERS = [3, 6, 9, 12, 18, 24, 36]; // عتبات agePct الدرجية

  function computeReliability(age, perf, results, freshSet) {
    const rawDivYears = perf.divYears.length;
    const conf = computeDataConfidenceLocal(age.cwMonths, age.calMonths, rawDivYears, results.length);

    // ── متى يرتفع الرقم؟ عتبة العمر القادمة (قابلة للحساب بدقة) ──
    const nextTier = AGE_TIERS.find(t => age.cwMonths < t);
    let ageUpgrade = null;
    if (nextTier) {
      const monthsNeeded = nextTier - age.cwMonths;
      const at = new Date(Date.now() + monthsNeeded * MONTH_MS);
      const after = computeDataConfidenceLocal(nextTier + 0.01, age.calMonths + monthsNeeded, rawDivYears, results.length);
      ageUpgrade = { monthsNeeded, date: isoOf(at), from: conf.score, to: after.score, tier: nextTier };
    }
    // ── دورة توزيع سنوية إضافية: تُحتسب مع بداية السنة الميلادية القادمة ──
    let divUpgrade = null;
    if (conf.divYears < 3) {
      const y = new Date().getFullYear();
      const nextJan = new Date(y + 1, 0, 1);
      const monthsNeeded = (nextJan.getTime() - Date.now()) / MONTH_MS;
      const after = computeDataConfidenceLocal(age.cwMonths + monthsNeeded, age.calMonths + monthsNeeded,
        rawDivYears + 1, results.length);
      divUpgrade = { monthsNeeded, date: isoOf(nextJan), from: conf.score, to: after.score, cycles: conf.divYears + 1 };
    }

    // ── (ب) اكتمال بيانات القرار — محسوب بالوزن لا بالعدد ──
    const tot = results.reduce((s, r) => s + r.weight, 0) || 1;
    const wOf = f => results.filter(f).reduce((s, r) => s + r.weight, 0) / tot;
    const axes = [
      { key: 'val',   label: 'تقييم عادل حديث (< 6 أشهر)', pct: wOf(r => r.fairValue != null && !r.valStale),
        fix: 'احسب القيمة العادلة في صفحة «القيمة العادلة للأسهم»' },
      { key: 'zones', label: 'خطة أسعار مسجّلة',           pct: wOf(r => r.zones != null),
        fix: 'أضِف حدود التجميع/التخفيف/التصفية في صفحة «مهام المحفظة»' },
      { key: 'sus',   label: 'بوابة استدامة معروفة',       pct: wOf(r => r.sustain.status !== 'unknown'),
        fix: 'أدخل التغطية والأساسيات من زر ⚙️ في بطاقة السهم' },
      { key: 'tgt',   label: 'هدف وزن مسجّل',              pct: wOf(r => r.hasTarget),
        fix: 'سجّل نسبة الهدف في صفحة «أهداف الأسهم»' },
      { key: 'price', label: 'سعر محدَّث خلال 7 أيام',      pct: wOf(r => freshSet.has(r.ticker)),
        fix: 'حدّث الأسعار من لوحة التحكم' },
    ];
    const readiness = Math.round(axes.reduce((s, a) => s + a.pct, 0) / axes.length * 100);
    const weakest = axes.slice().sort((a, b) => a.pct - b.pct)[0];

    return { conf, ageUpgrade, divUpgrade, axes, readiness, weakest, rawDivYears };
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑤ العائد المتوقّع — يُعاد حسابه كل مرة، ولا يُثبَّت
  // نفس منهجية الرؤية المستقبلية: تاسي هو الأساس، وأداؤك يدخل بوزن
  // انكماش Bühlmann صغير ينمو مع عمر رأس مالك — فالرقم يتغيّر فعلاً
  // كل شهر لأن الوزن نفسه يتغيّر، لا لأننا «حدّثنا التوقّع».
  // ══════════════════════════════════════════════════════════════════
  function computeOutlook(age, perf, fwdIncome) {
    const cwYears = age.cwMonths / 12;
    const w = Math.min(PERF_BLEND_MAX_W, cwYears / (cwYears + PERF_BLEND_K));
    const ttmYield = perf.mkt > 0 ? perf.divTTM / perf.mkt : 0;
    const fwdYield = perf.mkt > 0 ? fwdIncome.total / perf.mkt : ttmYield;

    // نمو سعري شخصي = XIRR − العائد التوزيعي المُحقَّق (نفس تفكيك forecast.js)
    const yourCap = perf.xirr != null
      ? clamp(perf.xirr / 100 - ttmYield, -0.05, 0.40) : null;
    const blended = yourCap == null
      ? MARKET_CAP_BENCHMARK
      : clamp(MARKET_CAP_BENCHMARK * (1 - w) + yourCap * w, 0, 0.11);

    const totalExpected = blended + clamp(fwdYield, 0, 0.15);
    return { perfWeight: w, yourCap, blended, fwdYield, ttmYield, totalExpected, benchmark: MARKET_CAP_BENCHMARK };
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑥ الدخل المتوقّع لكل سهم + تنبؤ استمرارية التوزيع
  // DPS لكل دفعة = المبلغ ÷ الأسهم وقتها (يعزل سياسة الشركة عن حجم مركزك)
  // الدخل الأمامي = مجموع DPS آخر 12 شهراً × أسهمك الحالية — وهو نفس
  // التعريف المعتمد في لوحة التحكم وصفحة الأرباح (قرار المالك 2026-08).
  // ══════════════════════════════════════════════════════════════════
  function dpsSeriesOf(ticker) {
    const recs = (D.divByTicker[ticker] || []).slice().sort((a, b) => a.date - b.date);
    const out = [];
    recs.forEach(r => {
      const sh = D.sharesAt(ticker, r.date);
      if (sh > 0.001 && r.amount > 0) out.push({ dps: r.amount / sh, date: r.date, amount: r.amount });
    });
    return out;
  }

  function freqOf(series) {
    if (series.length < 2) return 1;
    const gaps = [];
    for (let i = 1; i < series.length; i++) gaps.push(daysBetween(series[i - 1].date, series[i].date));
    gaps.sort((a, b) => a - b);
    const med = gaps[Math.floor(gaps.length / 2)];
    return med <= 45 ? 12 : med <= 105 ? 4 : med <= 210 ? 2 : 1;
  }

  function forwardOf(r) {
    const s = dpsSeriesOf(r.ticker);
    if (!s.length) return { dps: 0, freq: 1, basis: 'none', income: 0, payments: 0 };
    const freq = freqOf(s);
    const cutoff = Date.now() - 365 * DAY;
    const ttm = s.filter(p => p.date.getTime() >= cutoff).reduce((a, p) => a + p.dps, 0);
    const basis = ttm > 0 ? 'ttm' : 'last-cycle';
    const dps = ttm > 0 ? ttm : s.slice(-freq).reduce((a, p) => a + p.dps, 0);
    const lastDate = s[s.length - 1].date;
    const daysSince = daysBetween(lastDate, Date.now());
    const staleAfter = (365 / Math.max(1, freq)) * 1.75;   // نفس عتبة الانقطاع في صفحة الأرباح
    return {
      dps, freq, basis, payments: s.length, series: s, lastDate, daysSince,
      staleAfter: Math.round(staleAfter), stale: daysSince > staleAfter,
      income: dps * r.shares,
      yieldOnPrice: r.price > 0 ? dps / r.price : null,
    };
  }

  // تصنيف مستقبل التوزيع لسهم واحد — قواعد صريحة، وكل حكم معه دليله
  function divOutlookOf(r, fwd) {
    const ev = [];                   // الأدلة المعروضة للمستخدم
    const trend = r.sustain.trend;
    const sus = r.sustain.status;

    // سنوات كاملة موزَّعة (السنة الجارية جزئية فتُستبعد)
    const yearsSet = new Set((fwd.series || []).map(p => p.date.getFullYear()));
    const thisYear = new Date().getFullYear();
    const fullYears = [...yearsSet].filter(y => y < thisYear).length;
    // إشارة اتجاه صريحة من المحرّك تعني أنه قاس سنتين كاملتين فعلاً (بعد استبعاد
    // سنة أول شراء الجزئية) — فهي دليل نضج أقوى من عدّنا المحلي، ولا يصحّ أن
    // نردّ عليها بـ«بدري على الحكم».
    const measured = !!(trend && ['growing', 'stable', 'cut', 'stopped'].includes(trend.signal));

    // نسبة التوزيع من مصدر التغطية الصحيح (إن توفّر التقييم)
    let payout = null, payoutBase = null;
    const inp = r.valInputs || {};
    const isReit = inp.companyType === 'reit';
    const div = numOf(inp.dividends ?? inp.bankDps);
    const earn = isReit ? numOf(inp.ffo) : numOf(inp.eps);
    const fcf = numOf(inp.fcf);
    if (div != null && div > 0) {
      if (r.assetType === 'cement_petro' && fcf != null && fcf > 0) { payout = div / fcf; payoutBase = 'FCF'; }
      else if (earn != null && earn > 0) { payout = div / earn; payoutBase = isReit ? 'FFO' : 'EPS'; }
    }

    let bucket, headline;
    if (sus === 'fail') {
      bucket = 'risk'; headline = 'خطر خفض أو قطع';
      ev.push(`بوابة الاستدامة سقطت: ${r.sustain.reason}`);
    } else if (fwd.stale && fwd.payments > 0) {
      bucket = 'risk'; headline = 'خطر خفض أو قطع';
      ev.push(`آخر توزيع قبل ${fwd.daysSince} يوماً — تجاوز المتوقَّع لدوريته (${fwd.staleAfter} يوماً)`);
    } else if (trend && (trend.signal === 'cut' || trend.signal === 'stopped')) {
      bucket = 'risk'; headline = 'خطر خفض أو قطع';
      ev.push(`سجل أرباحك: ${trend.note}`);
    } else if (payout != null && payout > 1.2) {
      bucket = 'risk'; headline = 'خطر خفض أو قطع';
      ev.push(`التوزيع يفوق ${payoutBase} بنسبة ${formatNum(payout * 100, 0)}% — غير ممكن استمراره بلا اقتراض أو بيع أصول`);
    } else if (!fwd.payments) {
      bucket = 'unknown'; headline = 'لا يمكن التنبؤ بعد';
      // فرّق بين «لا توزيعات أصلاً» و«توزيعات مسجّلة قبل أن تمتلكه» — الثانية
      // لا تصلح لاشتقاق DPS لأنك لم تكن تملك أسهماً حينها.
      ev.push((D.divByTicker[r.ticker] || []).length
        ? 'كل التوزيعات المسجّلة لهذا الرمز تسبق أول شراء لك — لا يمكن اشتقاق DPS من مركزك'
        : 'لا توجد أي توزيعة مسجّلة لهذا السهم في سجلك');
    } else if (sus === 'watch' || (payout != null && payout > 1.0)) {
      bucket = 'watch'; headline = 'انتبه — مرشّح للمراجعة';
      if (sus === 'watch') ev.push(`قلق مؤقت بالاستدامة: ${r.sustain.reason}`);
      if (payout != null && payout > 1.0) ev.push(`التوزيع فوق ${payoutBase} بقليل (${formatNum(payout * 100, 0)}%)`);
    } else if ((fullYears < 2 && !measured) || sus === 'unknown') {
      bucket = 'unknown'; headline = 'بدري على الحكم';
      if (fullYears < 2) ev.push(`${fullYears} سنة كاملة من التوزيعات فقط — المقارنة السنوية تحتاج سنتين`);
      if (sus === 'unknown') ev.push('بوابة الاستدامة غير مكتملة — لا تقدير صامت (§8)');
    } else if (trend && trend.signal === 'growing') {
      bucket = 'growing'; headline = 'مرشّح للنمو';
      ev.push(`سجل أرباحك: ${trend.note}`);
    } else {
      bucket = 'stable'; headline = 'مرشّح للاستمرار';
      ev.push(trend ? `سجل أرباحك: ${trend.note}` : 'دفعات منتظمة بلا انقطاع');
    }

    if (payout != null && payout <= 1.0 && bucket !== 'risk') {
      ev.push(`التوزيع مغطّى: ${formatNum(payout * 100, 0)}% من ${payoutBase}`);
    }
    if (fwd.payments) ev.push(`${fwd.payments} دفعة مسجّلة · ${fullYears} سنة كاملة · دورية ${({12:'شهرية',4:'ربعية',2:'نصف سنوية',1:'سنوية'})[fwd.freq]}`);

    // ── ثقة التنبؤ: محسوبة من كثافة الدليل لا من الانطباع ──
    let c = 0;
    const why = [];
    c += Math.min(30, fwd.payments * 6);
    if (fwd.payments < 5) why.push(`كل دفعة جديدة ترفع الثقة (${fwd.payments}/5)`);
    c += fullYears >= 3 ? 30 : fullYears === 2 ? 22 : fullYears === 1 ? 10 : 0;
    if (fullYears < 3) why.push(`سنة توزيع كاملة إضافية ترفعها (${fullYears}/3)`);
    if (payout != null) c += 20; else why.push('أدخل الأرباح/التوزيع في حاسبة القيمة العادلة (+20)');
    c += r.fairValue != null ? (r.valStale ? 5 : 10) : 0;
    if (r.fairValue == null) why.push('تقييم عادل محفوظ (+10)');
    else if (r.valStale) why.push('تحديث التقييم (أقدم من 6 أشهر) (+5)');
    const cfg = (D.engineCfg || {})[r.ticker] || {};
    if (cfg.divCoverage || cfg.fundamentals || cfg.divSignal) c += 10;
    else why.push('تأكيدك اليدوي للاستدامة من ⚙️ (+10)');
    const confidence = Math.min(100, Math.round(c));

    return { bucket, headline, evidence: ev, confidence, raise: why, payout, payoutBase, fullYears };
  }

  const BUCKET_META = {
    growing: { icon: '📈', label: 'مرشّح للنمو',       state: 'good', order: 0 },
    stable:  { icon: '🟢', label: 'مرشّح للاستمرار',   state: 'good', order: 1 },
    unknown: { icon: '⚪', label: 'بدري على الحكم',    state: '',     order: 2 },
    watch:   { icon: '🟡', label: 'انتبه',            state: 'warn', order: 3 },
    risk:    { icon: '🔴', label: 'خطر خفض أو قطع',    state: 'bad',  order: 4 },
  };

  function computeIncome(results) {
    const rows = results.map(r => {
      const fwd = forwardOf(r);
      const outlook = divOutlookOf(r, fwd);
      return { r, fwd, outlook };
    });
    const total = rows.reduce((s, x) => s + (x.fwd.stale ? 0 : x.fwd.income), 0);
    const atRisk = rows.filter(x => x.outlook.bucket === 'risk' || x.outlook.bucket === 'watch')
      .reduce((s, x) => s + x.fwd.income, 0);
    const staleIncome = rows.filter(x => x.fwd.stale).reduce((s, x) => s + x.fwd.income, 0);
    return { rows, total, atRisk, staleIncome, atRiskPct: total > 0 ? atRisk / total : 0 };
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑦ «لو أنا مكانك» — تركيب كل ما سبق في قرار واحد
  // ليس رأياً: كل سطر مشتقّ من قاعدة في دستورك ومكتوب بجانبه أي قاعدة.
  // هدفك المعلن (§1): دخل مركّب يُعاد استثماره — فترتيب المرشّحين يقيس
  // جودة الدخل ونموّه أولاً، ثم هامش القيمة، ثم مساحة الوزن.
  // ══════════════════════════════════════════════════════════════════
  function scoreCandidate(x, thr) {
    const { r, fwd, outlook } = x;
    // بوابات صلبة من الدستور — من يسقط فيها لا يدخل الترتيب أصلاً
    const gates = [];
    if (r.sustain.status !== 'pass') gates.push('لم تنجح بوابة الاستدامة (الفلتر 1)');
    if (outlook.bucket === 'risk')   gates.push('توزيعه مرشّح للخفض أو القطع');
    const room = r.hasTarget ? (r.targetWeight - r.weight) : (r.cap - r.weight);
    if (!(room > thr.green)) gates.push(`لا مساحة وزن (${r.hasTarget ? 'الهدف' : 'السقف'} ${formatNum(r.hasTarget ? r.targetWeight : r.cap)}% مقابل وزن ${formatNum(r.weight)}%)`);
    const fvMargin = (r.fairValue != null && r.fairValue > 0 && r.price > 0)
      ? (r.fairValue - r.price) / r.fairValue : null;
    if (fvMargin != null && fvMargin < 0) gates.push('السعر فوق قيمته العادلة');

    // مكوّنات الدرجة — كلها معروضة للمستخدم، لا صندوق أسود
    const comp = {
      income: Math.round(clamp((fwd.yieldOnPrice || 0) / 0.06, 0, 1) * 100),
      growth: outlook.bucket === 'growing' ? 100 : outlook.bucket === 'stable' ? 60
            : outlook.bucket === 'unknown' ? 30 : 0,
      value:  fvMargin == null ? 30 : Math.round(clamp(fvMargin / 0.30, 0, 1) * 100),
      room:   Math.round(clamp(room / Math.max(1, (r.hasTarget ? r.targetWeight : r.cap)), 0, 1) * 100),
      data:   outlook.confidence,
    };
    const score = Math.round(
      comp.income * 0.30 + comp.growth * 0.20 + comp.value * 0.25 + comp.room * 0.15 + comp.data * 0.10);
    return { ...x, gates, score, comp, room, fvMargin };
  }

  function buildAdvice(results, income, thr, reliability, benchmark) {
    const scored = income.rows.map(x => scoreCandidate(x, thr));
    const eligible = scored.filter(s => !s.gates.length).sort((a, b) => b.score - a.score);
    const blocked  = scored.filter(s => s.gates.length);

    // ① أول ما أعالجه — أعلى أولوية من مخرجات المحرّك نفسه
    const urgent = results.filter(r => r.action !== 'hold' || r.buyZone)
      .sort((a, b) => a.priority - b.priority || b.weight - a.weight);

    // ② ما لا أفعله — محرَّمات الدستور §8 المنطبقة على حالتك الآن
    const dont = [];
    results.forEach(r => {
      const x = income.rows.find(y => y.r.ticker === r.ticker);
      const grow = x && (x.outlook.bucket === 'growing' || x.outlook.bucket === 'stable');
      const up = r.fairValue != null && r.price > r.fairValue;
      if (grow && up && r.sustain.status === 'pass' && !r.overCap) {
        dont.push({ ticker: r.ticker, name: r.name,
          txt: `لا أبيع «${r.name}» لمجرّد أن سعره (${formatNum(r.price)}) فوق قيمته العادلة (${formatNum(r.fairValue)}) — توزيعه سليم ووزنه ضمن السقف.`,
          rule: '§8: ممنوع بيع رابح قوي توزيعه ينمو لمجرد ارتفاع السعر' });
      }
      const down = r.fairValue != null && r.price < r.fairValue * 0.9;
      if (down && (r.sustain.status === 'fail' || (x && x.outlook.bucket === 'risk'))) {
        dont.push({ ticker: r.ticker, name: r.name,
          txt: `لا أشتري «${r.name}» رغم نزول سعره — سقط في بوابة الاستدامة، والنزول هنا إشارة خروج لا إشارة شراء.`,
          rule: '§4 الفلتر 1 + §8: ممنوع شراء سهم فشل بوابة الاستدامة لمجرد نزول سعره' });
      }
    });

    // ③ الثغرة الواحدة الأكثر أثراً
    const gap = reliability.weakest;

    return { eligible, blocked, urgent, dont, gap, scored };
  }

  // ══════════════════════════════════════════════════════════════════
  // ⑧ سجل القياس — يُعاد الحساب كل فتح، ويُسجَّل قياس واحد كل يوم
  // ══════════════════════════════════════════════════════════════════
  async function recordHistory(snap) {
    const today = isoOf(new Date());
    const prev = HISTORY.filter(e => e.date !== today);
    const entry = {
      date: today,
      value: snap.perf.mkt,
      xirr: snap.perf.xirr,
      benchXirr: snap.bench.status === 'ok' ? snap.bench.xirrTri : null,
      alpha: snap.bench.status === 'ok' ? snap.bench.alpha : null,
      fwdIncome: snap.income.total,
      ttmIncome: snap.perf.divTTM,
      atRisk: snap.income.atRisk,
      confidence: snap.reliability.conf.score,
      readiness: snap.reliability.readiness,
      expected: snap.outlook.totalExpected,
      actions: {
        exit: snap.results.filter(r => r.action === 'exit').length,
        trim: snap.results.filter(r => r.action === 'trim').length,
        add:  snap.results.filter(r => r.action === 'add').length,
      },
    };
    HISTORY = [...prev, entry].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-INTEL_HISTORY_MAX);
    try { await saveUserSetting(INTEL_HISTORY_KEY, HISTORY); } catch (_) { /* العرض لا يتوقف */ }
    return entry;
  }

  // ══════════════════════════════════════════════════════════════════
  // نقطة الدخول
  // ══════════════════════════════════════════════════════════════════
  async function boot(ctx) {
    D = ctx;
    const errs = await loadExtras();
    try { compute(errs); } catch (e) {
      console.error('[decision-intel]', e);
      const el = document.getElementById('de-intel-kpis');
      if (el) el.innerHTML = `<div class="note" data-state="bad"><span class="ic">⛔</span><div>تعذّر حساب طبقة الذكاء: ${E(e.message || e)} — بقيّة المحرّك تعمل كالمعتاد.</div></div>`;
    }
  }

  function compute(errs) {
    const tx = allTx();
    const results = D.results;
    const thr = D.thresholds || { green: 1, yellow: 3 };

    // طزاجة السعر لكل رمز — تُقاس هنا ولا تُكتب داخل نتائج المحرّك (لقطته محفوظة)
    const fresh = new Set();
    (D.holdings || []).forEach(h => {
      if (h.price_manual) { fresh.add(h.ticker); return; }   // يدوي محميّ = مقصود لا قديم
      if (h.price_updated_at &&
          daysBetween(new Date(h.price_updated_at).getTime(), Date.now()) <= 7) fresh.add(h.ticker);
    });

    const age = computeAge(tx);
    const perf = computePerformance(tx);
    const income = computeIncome(results);
    const bench = computeBenchmark(tx, perf);
    const reliability = computeReliability(age, perf, results, fresh);
    const outlook = computeOutlook(age, perf, income);
    const advice = buildAdvice(results, income, thr, reliability, bench);

    INTEL = { age, perf, income, bench, reliability, outlook, advice, results, errs };
    renderAll(INTEL);
    recordHistory(INTEL).then(entry => renderHistory(INTEL, entry));
  }

  // ══════════════════════════════════════════════════════════════════
  // العرض — مكوّنات اللوحة المشتركة (tag / note / kvs / stat-card)
  // ولا لون مكتوب يدوياً: الحالة عبر data-state، والألوان من الرموز.
  // ══════════════════════════════════════════════════════════════════
  const tag = (icon, text, state) => `<span class="tag"${state ? ` data-state="${state}"` : ''}>${icon} ${E(text)}</span>`;
  const note = (icon, html, state) => `<div class="note"${state ? ` data-state="${state}"` : ''}><span class="ic">${icon}</span><div>${html}</div></div>`;
  const kvs = items => `<div class="kvs">${items.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;

  function statCard(label, value, sub, opts) {
    const o = opts || {};
    return `<div class="stat-card">
      ${o.info ? `<button class="info-btn" type="button" onclick="showCardInfo('${o.info}')">ⓘ</button>` : ''}
      <div class="label">${label}${o.badge || ''}</div>
      <div class="value num${o.cls ? ' ' + o.cls : ''}">${value}</div>
      <div class="sub">${sub}</div>
      ${o.tag ? `<div class="mt-2">${o.tag}</div>` : ''}
    </div>`;
  }

  function renderAll(I) {
    renderKpis(I);
    renderAdvice(I);
    renderDivForecast(I);
    renderReliability(I);
  }

  // ── ① لوحة القياس: أين أنت الآن ─────────────────────────────────
  function renderKpis(I) {
    const el = document.getElementById('de-intel-kpis');
    if (!el) return;
    const { age, perf, bench, income, outlook } = I;
    const retM = assessMetricMaturity('return', { ageMonths: age.calMonths });
    const incM = assessMetricMaturity('divYield',
      { divCount: perf.divCount, divYears: Math.min(perf.divYears.length, Math.max(1, Math.ceil(age.calMonths / 12))) });

    const cards = [];

    cards.push(statCard('⏳ عمر محفظتك',
      fmtMonths(age.calMonths),
      `عمر رأس المال المرجَّح بالتدفقات: <b>${fmtMonths(age.cwMonths)}</b> — وهو المستخدم في كل حكم على الأداء`,
      { info: 'intelAge' }));

    cards.push(statCard('📈 عائدك الفعلي (سنوي)',
      perf.xirr != null ? `${sgn(perf.xirr)}%` : '—',
      perf.xirr != null
        ? `XIRR على تدفقاتك الحقيقية · ربح كلي ${sgn(perf.totalGain)} ر.س`
        : 'تدفقاتك غير كافية لحساب XIRR',
      { cls: perf.xirr == null ? '' : perf.xirr >= 0 ? 'text-success' : 'text-danger',
        badge: maturityBadge(retM.level, retM.reason), info: 'intelPerf' }));

    if (bench.status === 'ok') {
      cards.push(statCard('🏁 تاسي بنفس فلوسك',
        bench.xirrTri != null ? `${sgn(bench.xirrTri)}%` : '—',
        `لو حطّيت نفس المبالغ بنفس التواريخ في المؤشر (عائد إجمالي بافتراض توزيعات سوق ${(TASI_DIV_YIELD * 100).toFixed(1)}%)`,
        { info: 'intelBench' }));
      cards.push(statCard('⚖️ الفرق (ألفا)',
        bench.alpha != null ? `${sgn(bench.alpha)}%` : '—',
        bench.alpha == null ? 'غير قابل للحساب'
          : bench.alpha >= 0 ? 'أنت متقدّم على المؤشر بنفس التدفقات' : 'المؤشر متقدّم عليك بنفس التدفقات',
        { cls: bench.alpha == null ? '' : bench.alpha >= 0 ? 'text-success' : 'text-danger',
          badge: maturityBadge(retM.level, retM.reason), info: 'intelBench' }));
    } else {
      cards.push(statCard('🏁 مقارنة تاسي', 'غير متوفرة',
        `${E(bench.reason)}<div class="mt-2"><button class="btn btn-secondary btn-sm" type="button"
           onclick="DecisionIntel.fetchTasi(this)">🔄 اجلب تاسي الآن</button></div>`,
        { info: 'intelBench' }));
    }

    cards.push(statCard('💵 دخل التوزيعات القادم',
      `${formatNum(income.total)} ر.س`,
      `أي <b>${formatNum(income.total / 12)}</b> ر.س شهرياً · من هدف ${formatNum(D.incomeGoalMonthly)} ر.س = <b>${formatNum(income.total / 12 / Math.max(1, D.incomeGoalMonthly) * 100)}%</b>`,
      { cls: 'text-accent', badge: maturityBadge(incM.level, incM.reason), info: 'intelIncome' }));

    cards.push(statCard('🧾 توزيعات وصلتك فعلاً',
      `${formatNum(perf.divTotal)} ر.س`,
      `${perf.divCount} دفعة · آخر 12 شهراً ${formatNum(perf.divTTM)} ر.س`,
      { cls: 'text-success' }));

    cards.push(statCard('💧 ضخّك وسحوباتك',
      `${formatNum(perf.deposits - perf.withdrawals)} ر.س`,
      CF.length
        ? `ضخّ ${formatNum(perf.deposits)} · سحب ${formatNum(perf.withdrawals)} ر.س`
        : 'لا سجل تدفقات — سجّلها في صفحة التدفقات النقدية ليصير عمر رأس المال دقيقاً'));

    cards.push(statCard('🔮 العائد المتوقّع سنوياً',
      pctTxt(outlook.totalExpected, 1),
      `نمو سعري ${pctTxt(outlook.blended, 1)} + توزيعات ${pctTxt(outlook.fwdYield, 1)} · وزن أدائك في المزج ${formatNum(outlook.perfWeight * 100, 1)}%`,
      { info: 'intelOutlook' }));

    el.innerHTML = cards.join('');

    const line = document.getElementById('de-intel-kpis-note');
    if (line) {
      const bits = [];
      bits.push(`أُعيد الحساب الآن (${isoOf(new Date())}) من بياناتك الحيّة — لا رقم مجمَّد في هذه الصفحة.`);
      if (bench.status === 'ok' && bench.lastAgeDays > 21)
        bits.push(`⚠️ آخر نقطة تاسي محفوظة عمرها ${bench.lastAgeDays} يوماً (${bench.lastDate}) — حدّثها من صفحة الأداء ليصير الفرق دقيقاً.`);
      if (I.errs && I.errs.length) bits.push(`⚠️ تعذّر تحميل: ${E(I.errs.join('، '))}.`);
      line.innerHTML = bits.join(' ');
    }
  }

  // ── ② «لو أنا مكانك» ────────────────────────────────────────────
  function renderAdvice(I) {
    const el = document.getElementById('de-intel-advice');
    if (!el) return;
    const { advice, income, outlook, age } = I;
    const out = [];

    out.push(note('🧭', `هذا ليس رأياً ولا نصيحة استثمارية — هو <b>قواعدك أنت</b> (دستور المحفظة) مطبَّقة على أرقامك دفعةً واحدة. كل سطر بجانبه القاعدة التي أنتجته، وأي رقم ناقص مُعلَن لا مُقدَّر.`, ''));

    // ① أول ما أعالجه
    const u = advice.urgent[0];
    out.push('<h4 class="de-d-h">① أول ما أعالجه اليوم</h4>');
    if (!u) {
      out.push(note('✅', 'لا شيء عاجل. كل أسهمك ضمن السقوف والاستدامة، فالقرار الأمثل اليوم هو ألّا تفعل شيئاً — وهذا قرار.', 'good'));
    } else {
      out.push(note(u.severity === 'red' ? '🔴' : '🟡',
        `<b>${E(u.name)} (${E(u.ticker)})</b> — ${E(u.label)}.<br>${E(u.reason)}` +
        `<br><span class="text-muted small">وبعده: ${advice.urgent.slice(1, 4).map(r => E(r.ticker) + ' (' + E(r.label) + ')').join(' · ') || 'لا شيء'}</span>`,
        u.severity === 'red' ? 'bad' : 'warn'));
    }

    // ② أين يذهب الريال القادم (§6)
    out.push('<h4 class="de-d-h">② أين أضع الريال القادم (§6 — توجيه إعادة الاستثمار)</h4>');
    if (!advice.eligible.length) {
      out.push(note('⚪', `لا يوجد اليوم سهم يجتاز شروط §6 مجتمعةً (استدامة سليمة + توزيع غير مهدَّد + وزنه تحت هدفه + سعره تحت قيمته العادلة).<br>` +
        `<span class="text-muted small">أقرب المستبعَدين: ${advice.blocked.slice(0, 3).map(b => `${E(b.r.ticker)} (${E(b.gates[0])})`).join(' · ')}</span><br>` +
        `في هذه الحالة الدستور لا يفرض شراءً — الاحتفاظ بالنقد حتى تتحقق الشروط قرار مطابق للقواعد.`, 'warn'));
    } else {
      const rows = advice.eligible.slice(0, 5).map((c, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><b>${E(c.r.ticker)}</b><br><span class="small text-muted">${E(c.r.name || '')}</span></td>
          <td class="num"><b>${c.score}</b></td>
          <td class="num">${c.fwd.yieldOnPrice != null ? formatNum(c.fwd.yieldOnPrice * 100, 1) + '%' : '—'}</td>
          <td class="num">${c.fvMargin != null ? formatNum(c.fvMargin * 100, 0) + '%' : '<span class="text-muted">—</span>'}</td>
          <td class="num">${formatNum(c.room, 1)}%</td>
          <td>${BUCKET_META[c.outlook.bucket].icon} ${E(BUCKET_META[c.outlook.bucket].label)}</td>
        </tr>`).join('');
      out.push(`<div class="table-wrapper"><table>
        <thead><tr>
          <th>#</th><th>السهم</th>
          <th>الدرجة<br><span class="small text-muted">من 100</span></th>
          <th>عائد التوزيع<br><span class="small text-muted">على السعر</span></th>
          <th>هامش العادلة</th>
          <th>مساحة الوزن<br><span class="small text-muted">حتى هدفه</span></th>
          <th>مستقبل التوزيع</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`);
      const top = advice.eligible[0];
      out.push(note('🎯',
        `لو أنا مكانك: أوجّه التوزيعة القادمة إلى <b>${E(top.r.name)} (${E(top.r.ticker)})</b> — ` +
        `عائد توزيعه ${top.fwd.yieldOnPrice != null ? formatNum(top.fwd.yieldOnPrice * 100, 1) + '%' : 'غير محسوب'}، ` +
        `${top.fvMargin != null ? `وسعره تحت قيمته العادلة بـ${formatNum(top.fvMargin * 100, 0)}%، ` : ''}` +
        `ووزنه ${formatNum(top.r.weight)}% أي أقلّ من ${top.r.hasTarget ? 'هدفه' : 'سقفه'} بـ${formatNum(top.room, 1)} نقطة.` +
        `<br><span class="small text-muted">وزن الدرجة: دخل 30% · نمو التوزيع 20% · هامش القيمة 25% · مساحة الوزن 15% · جودة البيانات 10%. الشراء مشروط لا آلي (§4).</span>`,
        'good'));
    }

    // ③ ما لا أفعله
    out.push('<h4 class="de-d-h">③ ما لا أفعله — ولو أغراني السعر</h4>');
    if (!advice.dont.length) {
      out.push(`<div class="small text-muted">لا ينطبق أي من محرَّمات §8 على وضعك الحالي.</div>`);
    } else {
      out.push(advice.dont.slice(0, 4).map(d =>
        note('🚫', `${E(d.txt)}<br><span class="small text-muted">${E(d.rule)}</span>`, 'warn')).join(''));
    }

    // ④ الدخل المعرّض للخطر
    out.push('<h4 class="de-d-h">④ كم من دخلي مهدَّد؟</h4>');
    if (income.atRisk > 0) {
      out.push(note('⚠️',
        `<b>${formatNum(income.atRisk)} ر.س</b> من دخلك السنوي المتوقَّع (${formatNum(income.atRiskPct * 100, 0)}%) يأتي من أسهم صنّفها المحرّك «انتبه» أو «خطر خفض» — التفصيل في جدول توزيعاتك بالأسفل.`,
        income.atRiskPct >= 0.25 ? 'bad' : 'warn'));
    } else {
      out.push(note('✅', 'لا يوجد دخل مصنَّف تحت الخطر بحسب سجل أرباحك وبوابة الاستدامة الحالية.', 'good'));
    }

    // ⑤ الثغرة الأكثر أثراً
    if (advice.gap && advice.gap.pct < 0.95) {
      out.push('<h4 class="de-d-h">⑤ خطوة واحدة ترفع دقّة كل ما سبق</h4>');
      out.push(note('📌',
        `أضعف محور في بياناتك: <b>${E(advice.gap.label)}</b> — يغطّي ${formatNum(advice.gap.pct * 100, 0)}% فقط من وزن محفظتك.<br>${E(advice.gap.fix)}.`,
        'warn'));
    }

    el.innerHTML = out.join('');
  }

  // ── ③ تنبؤ التوزيعات لكل سهم ────────────────────────────────────
  function renderDivForecast(I) {
    const el = document.getElementById('de-intel-divs');
    if (!el) return;
    const rows = I.income.rows.slice().sort((a, b) =>
      BUCKET_META[b.outlook.bucket].order - BUCKET_META[a.outlook.bucket].order ||
      b.fwd.income - a.fwd.income);

    const counts = {};
    rows.forEach(x => { counts[x.outlook.bucket] = (counts[x.outlook.bucket] || 0) + 1; });
    const strip = Object.entries(BUCKET_META)
      .filter(([k]) => counts[k])
      .map(([k, m]) => tag(m.icon, `${counts[k]} ${m.label}`, m.state)).join(' ');

    const body = rows.map(x => {
      const m = BUCKET_META[x.outlook.bucket];
      const share = I.income.total > 0 ? x.fwd.income / I.income.total * 100 : 0;
      return `<tr>
        <td><b>${E(x.r.ticker)}</b><br><span class="small text-muted">${E(x.r.name || '')}</span></td>
        <td>${m.icon} ${E(x.outlook.headline)}</td>
        <td class="num">${x.fwd.income > 0 ? formatNum(x.fwd.income) + ' ر.س' : '<span class="text-muted">—</span>'}
            ${x.fwd.income > 0 ? `<br><span class="small text-muted">${formatNum(share, 0)}% من دخلك</span>` : ''}</td>
        <td class="num">${x.fwd.yieldOnPrice != null && x.fwd.dps > 0 ? formatNum(x.fwd.yieldOnPrice * 100, 1) + '%' : '<span class="text-muted">—</span>'}</td>
        <td class="num">${x.outlook.confidence}%</td>
        <td class="small">${x.outlook.evidence.map(E).join('<br>')}
            ${x.outlook.raise.length ? `<br><span class="text-muted">لرفع الثقة: ${x.outlook.raise.map(E).join(' · ')}</span>` : ''}</td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="mb-2">${strip}</div>
      <p class="small text-muted" style="margin:0 0 10px">
        الدخل القادم لكل سهم = مجموع التوزيع للسهم الواحد خلال آخر 12 شهراً × أسهمك الحالية — نفس تعريف لوحة التحكم وصفحة الأرباح.
        التصنيف يجمع: بوابة الاستدامة، واتجاه DPS في سجلك، ونسبة التوزيع من مصدر التغطية الصحيح حسب نوع الأصل (§3)، وانتظام الدفعات.
        <b>لا تُقدَّر بيانات ناقصة صامتةً</b> — السهم بلا دليل كافٍ يُصنَّف «بدري على الحكم».
      </p>
      <div class="table-wrapper"><table>
        <thead><tr>
          <th>السهم</th><th>مستقبل التوزيع</th>
          <th>الدخل القادم<br><span class="small text-muted">12 شهراً</span></th>
          <th>عائده<br><span class="small text-muted">على السعر</span></th>
          <th>ثقة التنبؤ</th><th>الدليل</th>
        </tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // ── ④ الموثوقية ────────────────────────────────────────────────
  function renderReliability(I) {
    const el = document.getElementById('de-intel-reliability');
    if (!el) return;
    const { conf, ageUpgrade, divUpgrade, axes, readiness } = I.reliability;
    const tierOf = s => s < 30 ? ['bad', 'ضعيفة جداً'] : s < 45 ? ['bad', 'ضعيفة']
      : s < 60 ? ['warn', 'في طور النمو'] : s < 75 ? ['warn', 'معقولة']
      : s < 87 ? ['good', 'جيدة'] : ['good', 'موثوقة'];
    const [cState, cLabel] = tierOf(conf.score);
    const [rState, rLabel] = tierOf(readiness);

    const meter = (label, pct, sub) => `
      <div class="meter">
        <div class="meter-head"><span class="k">${label}</span><span class="v num">${formatNum(pct, 0)}%</span></div>
        <div class="meter-wrap"><div class="meter-track"><div class="meter-fill" style="width:${clamp(pct, 0, 100)}%"></div></div></div>
        ${sub ? `<div class="meter-foot">${sub}</div>` : ''}
      </div>`;

    const up = [];
    if (ageUpgrade) up.push(`ترتفع من <b>${ageUpgrade.from}%</b> إلى <b>${ageUpgrade.to}%</b> يوم <b>${ageUpgrade.date}</b> (بعد ${Math.ceil(ageUpgrade.monthsNeeded * 30.44)} يوماً) لمّا يبلغ عمر رأس مالك ${ageUpgrade.tier} شهراً.`);
    if (divUpgrade) up.push(`وترتفع إلى <b>${divUpgrade.to}%</b> يوم <b>${divUpgrade.date}</b> عند اكتمال دورة التوزيع السنوية رقم ${divUpgrade.cycles}.`);
    if (!up.length) up.push('بلغت بياناتك سقف النضج الزمني — لا ترقية زمنية متبقية.');

    el.innerHTML = `
      <div class="stats-grid stats-grid-fill mb-4">
        ${statCard('🧪 ثقة بيانات محفظتك', `${conf.score}%`,
          `عمر رأس المال ${formatNum(conf.agePct * 100, 0)}% · دورات الأرباح ${formatNum(conf.divPct * 100, 0)}% · عدد الأسهم ${formatNum(conf.holdPct * 100, 0)}%`,
          { tag: tag(cState === 'good' ? '✅' : cState === 'warn' ? '⚠️' : '🔴', cLabel, cState), info: 'intelReliability' })}
        ${statCard('🗂️ اكتمال بيانات القرار', `${readiness}%`,
          'كم من محفظتك (بالوزن) عليه تقييم حديث وخطة أسعار واستدامة وهدف وسعر طازج',
          { tag: tag(rState === 'good' ? '✅' : rState === 'warn' ? '⚠️' : '🔴', rLabel, rState), info: 'intelReliability' })}
      </div>
      ${note('📅', `<b>متى ترتفع الموثوقية؟</b><br>${up.join('<br>')}<br>
        <span class="small text-muted">هذه تواريخ محسوبة لا وعود: عتبات الثقة دوال درجية في عمر رأس المال وعدد دورات الأرباح، فموعد كل قفزة معروف مسبقاً. الرقم يُعاد حسابه كل فتح للصفحة.</span>`, '')}
      <h4 class="de-d-h">أين النقص بالضبط (بالوزن لا بالعدد)</h4>
      ${axes.map(a => meter(E(a.label), a.pct * 100,
        a.pct >= 0.95 ? '✅ مكتمل' : `ينقص ${formatNum((1 - a.pct) * 100, 0)}% من وزن محفظتك — ${E(a.fix)}`)).join('')}
      <p class="small text-muted" style="margin-top:10px">
        الرقم الأول (ثقة بيانات المحفظة) محسوب بنفس دالة صفحة «الرؤية المستقبلية» حرفياً حتى لا تتناقض الصفحتان.
        الرقم الثاني خاصّ بهذه الصفحة لأن قرار البيع والشراء يحتاج بيانات لا يحتاجها الإسقاط.
      </p>
      <div id="de-intel-history"></div>`;
  }

  // ── ⑤ سجل القياس عبر الزمن ─────────────────────────────────────
  function renderHistory(I, entry) {
    const el = document.getElementById('de-intel-history');
    if (!el) return;
    const hist = HISTORY.filter(e => e.date !== entry.date);
    if (!hist.length) {
      el.innerHTML = `<h4 class="de-d-h">سجل القياس</h4>` +
        note('🌱', 'هذا أول قياس محفوظ. من الآن يُسجَّل قياس واحد كل يوم تفتح فيه الصفحة، فتظهر هنا حركة عائدك وفرقك عن تاسي ودخلك وموثوقيتك عبر الزمن.', '');
      return;
    }
    const prev = hist[hist.length - 1];
    const ago = daysBetween(parseDateLocal(prev.date).getTime(), Date.now());
    const delta = (now, before, isPct) => {
      if (now == null || before == null) return '<span class="text-muted">—</span>';
      const d = now - before;
      const cls = Math.abs(d) < 1e-9 ? 'text-muted' : d > 0 ? 'text-success' : 'text-danger';
      return `<span class="${cls}">${sgn(d)}${isPct ? ' نقطة' : ''}</span>`;
    };

    // خط بياني صغير بلا مكتبات — SVG خالص يقرأ لون السلسلة من الرموز
    const spark = (vals, title) => {
      const pts = vals.filter(v => v != null && isFinite(v));
      if (pts.length < 2) return `<div class="small text-muted">${E(title)}: نقطة واحدة فقط</div>`;
      const min = Math.min(...pts), max = Math.max(...pts), span = (max - min) || 1;
      const w = 220, h = 34;
      const d = pts.map((v, i) =>
        `${i ? 'L' : 'M'}${(i / (pts.length - 1) * w).toFixed(1)},${(h - (v - min) / span * (h - 4) - 2).toFixed(1)}`).join(' ');
      return `<div class="small text-muted" style="margin-top:6px">${E(title)}
        <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="vertical-align:middle;margin-inline-start:6px"
             role="img" aria-label="${E(title)}">
          <path d="${d}" fill="none" stroke="var(--series-2)" stroke-width="2" stroke-linejoin="round"/>
        </svg>
        <span class="num">${formatNum(pts[0], 1)} → ${formatNum(pts[pts.length - 1], 1)}</span></div>`;
    };

    const last30 = HISTORY.slice(-30);
    el.innerHTML = `
      <h4 class="de-d-h">سجل القياس — ${HISTORY.length} قياس محفوظ</h4>
      <p class="small text-muted" style="margin:0 0 8px">
        القياس السابق: <b>${E(prev.date)}</b> (قبل ${ago} يوماً). كل ما تحت مقيس بين ذلك اليوم واليوم.
      </p>
      ${kvs([
        ['قيمة المحفظة', delta(entry.value, prev.value)],
        ['عائدك السنوي', delta(entry.xirr, prev.xirr, true)],
        ['فرقك عن تاسي', delta(entry.alpha, prev.alpha, true)],
        ['دخلك القادم', delta(entry.fwdIncome, prev.fwdIncome)],
        ['الدخل المهدَّد', delta(entry.atRisk, prev.atRisk)],
        ['ثقة البيانات', delta(entry.confidence, prev.confidence, true)],
      ])}
      ${spark(last30.map(e => e.confidence), 'ثقة البيانات (آخر 30 قياساً)')}
      ${spark(last30.map(e => e.alpha), 'الفرق عن تاسي')}
      ${spark(last30.map(e => e.fwdIncome), 'الدخل السنوي القادم')}`;
  }

  // ══════════════════════════════════════════════════════════════════
  // جلب تاسي من هنا مباشرةً — حتى لا تُرسَل لصفحة أخرى لإكمال المقارنة
  // الدمج محافظ عمداً: يضيف التواريخ الناقصة فقط ولا يمسّ أي نقطة موجودة،
  // فلا يمكنه أن يدهس نقطةً ثبّتها المالك يدوياً في صفحة الأداء.
  // ══════════════════════════════════════════════════════════════════
  async function fetchTasi(btn) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ الجلب…'; }
    try {
      const { data, error } = await supabaseClient.functions.invoke('update-prices', {
        body: { tasiHistory: true, range: '5y' },
      });
      if (error) throw new Error(error.message || 'تعذّر الاتصال بالدالة السحابية update-prices');
      const t = data && data.tasi;
      if (!t) throw new Error('الدالة السحابية ردّت بلا حقل tasi — الأرجح أن النسخة المنشورة لا تدعم tasiHistory بعد.');
      if (t.error) throw new Error(t.error);
      const pts = (t.points || []).filter(p => p && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && +p.value > 0);
      if (!pts.length) throw new Error('لم تُرجِع الدالة أي نقطة صالحة.');

      const existing = await loadUserSetting(TASI_BM_KEY);
      const byDate = {};
      (Array.isArray(existing) ? existing : []).forEach(e => { if (e && e.date) byDate[e.date] = e; });
      let added = 0;
      pts.forEach(p => { if (!byDate[p.date]) { byDate[p.date] = { date: p.date, value: +p.value, src: 'auto' }; added++; } });
      const merged = Object.values(byDate).sort((a, b) => (a.date < b.date ? -1 : 1));
      await saveUserSetting(TASI_BM_KEY, merged);
      try { localStorage.setItem(userLsKey(TASI_BM_KEY), JSON.stringify(merged)); } catch (_) {}

      showToast(`✓ تاسي: أُضيفت ${added} نقطة — الإجمالي ${merged.length}`, 'success');
      TASI = merged.map(e => ({ date: e.date, value: +e.value }));
      compute(INTEL ? INTEL.errs : []);      // إعادة حساب فورية بالبيانات الجديدة
    } catch (e) {
      showToast('⚠️ تعذّر جلب تاسي: ' + (e.message || e), 'error');
      if (btn) { btn.disabled = false; btn.textContent = '🔄 اجلب تاسي الآن'; }
    }
  }

  // الواجهة العامة — في نهاية النطاق حتى تكون كل الثوابت والدوال أعلاه مُهيَّأة
  return { boot, fetchTasi, _debug: () => INTEL };
})();
