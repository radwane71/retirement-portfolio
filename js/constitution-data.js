// ══════════════════════════════════════════════════════════════════════
// 📒 طبقة بيانات الدستور v3 — المواد 19 · 41 · 43 · 45 · 72
// ----------------------------------------------------------------------
// خمس مواد لا تُنفَّذ بثوابت، بل تحتاج **ذاكرة عبر الزمن**:
//   م.19 وسم كل رقم بمصدره        → القيمة الموسومة `tv()`
//   م.41 بوابة عمق التاريخ         → `depthGate()` و`cyclicalScore()`
//   م.43 قاعدة التأكيد بالقراءات   → `readingsFor()` و`confirmationOf()`
//   م.45 قائمة الخروج المؤجل       → `deferredVerdict()` و`reviewExitPrice()`
//   م.72 سجل التدقيق               → `auditEntry()`
//
// **المنطق هنا خالص:** لا DOM ولا شبكة ولا `Date.now()` ضمنيّ — كل دالة
// تأخذ ما تحتاجه وتُرجع نتيجة. التخزين في النصف الأخير، منفصلاً عمداً،
// حتى يُختبَر القرار بلا متصفّح ولا قاعدة بيانات.
//
// ⚠️ الثوابت من js/constitution.js. لا رقم دستوري يُكتب هنا.
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// م.19 — القيمة الموسومة
// ----------------------------------------------------------------------
// «كل رقم في أي مخرَج يحمل وسماً إلزامياً»: ✅ من ملف تداول · ⚙️ مشتق
// بحساب منه · ⚠️ خارجي لا يُبنى عليه قرار وزن · ❌ غير متوفر.
//
// الوسم ليس زينة: م.66/2 تمنع بناء قرار وزن على رقم غير مستخرج من ملف
// تداول. فالوسم هو ما يجعل المنع قابلاً للفحص آلياً — `canDriveWeight()`.
// ══════════════════════════════════════════════════════════════════════
function tv(value, tag, source, asOf) {
  return {
    value: (value === undefined || value === null || value === '') ? null : value,
    tag: (value === undefined || value === null || value === '') ? 'missing' : (tag || 'external'),
    source: source || null,
    asOf: asOf || null,
  };
}
const TV_MISSING = { value: null, tag: 'missing', source: null, asOf: null };

// هل يجوز أن يقود هذا الرقم قرار وزن؟ (م.66/2 و م.19)
function canDriveWeight(t) {
  return !!t && (t.tag === 'official' || t.tag === 'derived') && t.value != null;
}

// نصّ العرض: الرقم مسبوقاً بوسمه — وبلا قيمة يُعلَن ❌ لا يُخفى (م.20)
function tvText(t, fmt) {
  if (!t || t.value == null) return `${DATA_TAG.missing} غير متوفر`;
  const v = typeof fmt === 'function' ? fmt(t.value) : String(t.value);
  return `${DATA_TAG[t.tag] || DATA_TAG.external} ${v}`;
}

// م.18 — هل تجاوز الرقم حدّ حداثته؟ يُعلَّم ولا يُبنى عليه قرار وزن
function tvStale(t, kind, now) {
  const lim = FRESH_DAYS[kind];
  if (!t || !t.asOf || lim == null) return { stale: false, ageDays: null };
  const age = Math.floor(((now ? now.getTime() : Date.now()) - new Date(t.asOf).getTime()) / 86400000);
  return { stale: age > lim, ageDays: age, limit: lim };
}

// ══════════════════════════════════════════════════════════════════════
// م.41 — الفلتر 0: بوابة عمق التاريخ
// ----------------------------------------------------------------------
// «ممنوع الحكم بفشل الاستدامة قبل استخراج التوزيعات المدفوعة فعلياً
// لأربع سنوات على الأقل من قوائم التدفقات النقدية.»
//
// القاعدة الأم: «نسبة التوزيع في نصف سنة تقيس **لحظة**. تاريخ التوزيع
// المدفوع خمس سنوات يقيس **سياسة**.»
//
// خطأ موثق في الدستور: حُكم على جرير والقصيم وسدافكو وكهرباء بأنها خطرة
// بناءً على لقطة نصف سنة واحدة. البوابة تمنع تكرار ذلك آلياً.
// ══════════════════════════════════════════════════════════════════════
const DEPTH_MIN_YEARS = 4;

// كم سنة تقويمية مغطّاة بسجل توزيعات فعليّ؟ يُحسب من دفعات مؤرَّخة.
function dividendDepthYears(payments) {
  const yrs = new Set();
  (payments || []).forEach(p => {
    const d = p && (p.date || p);
    const y = d instanceof Date ? d.getFullYear() : parseInt(String(d).slice(0, 4), 10);
    if (isFinite(y)) yrs.add(y);
  });
  return yrs.size;
}

// البوابة: هل يجوز إصدار حكم بفشل الاستدامة أصلاً؟
function depthGate(payments, manualYears) {
  const fromLog = dividendDepthYears(payments);
  const years = Math.max(fromLog, +manualYears > 0 ? +manualYears : 0);
  return years >= DEPTH_MIN_YEARS
    ? { pass: true, years, why: `عمق التاريخ ${years} سنوات ≥ ${DEPTH_MIN_YEARS} — الحكم جائز (م.41)` }
    : { pass: false, years,
        why: `عمق التاريخ ${years} ${years === 1 ? 'سنة' : 'سنوات'} < ${DEPTH_MIN_YEARS} — `
           + 'ممنوع الحكم بفشل الاستدامة (م.41). استخرج التوزيعات المدفوعة من قوائم التدفقات، '
           + 'أو أدخل عدد السنوات المتاحة يدوياً. حتى ذلك الحين: احتفظ.' };
}

// نظام نقاط الدوري مقابل البنيوي — كل بند نقطة (م.41)
const CYCLICAL_MARKS = [
  { key: 'externalCause',  label: 'سبب خارجي معلن في الملف الرسمي' },
  { key: 'revenueStable',  label: 'الإيراد الأساسي مستقر (±5%)' },
  { key: 'bridge3',        label: 'سنوات الجسر ≥ 3' },
  { key: 'streak5',        label: 'توزيع متصل ≥ 5 سنوات بلا قص جوهري' },
  { key: 'marginStable',   label: 'الهامش مستقر أو يتحسن' },
  { key: 'peersSuffer',    label: 'المنافسون في القطاع يعانون مثله' },
];

function cyclicalScore(marks) {
  const m = marks || {};
  const hit = CYCLICAL_MARKS.filter(x => m[x.key] === true);
  const score = hit.length;
  const verdict = score >= 4
    ? { key: 'cyclical', label: 'دوري',  action: 'hold',
        why: 'احتفظ — لا تخفّض. التراجع دوري لا بنيوي (م.41)' }
    : score >= 2
    ? { key: 'mixed', label: 'مختلط', action: 'demoteQuarter',
        why: 'خفّض ربع فئة + مراقبة مكثفة (م.41)' }
    : { key: 'structural', label: 'بنيوي', action: 'toFilter1b',
        why: 'انتقل للفلتر 1-ب — بوابة الخسارة المحققة (م.41 و45)' };
  return { score, max: CYCLICAL_MARKS.length, hit: hit.map(x => x.label), ...verdict };
}

// ══════════════════════════════════════════════════════════════════════
// م.43 — قاعدة التأكيد: لا إشارة تُنفَّذ من قراءة واحدة إلا القاطعة
// ----------------------------------------------------------------------
// سابقة الدستور: الاتصالات تراجعت أرباحها 4.6% لسبب **محاسبي بحت** (الزكاة
// كانت استرداداً قبل عام). القراءة الواحدة كانت ستُخرج أقوى مكوّن.
//
// «القراءة» = نتيجة **فترة واحدة معلنة رسمياً** (م.1). فقراءتان من الربع
// نفسه ليستا تأكيداً، والعدّاد يُميّز الفترات لا التسجيلات.
// ══════════════════════════════════════════════════════════════════════
const SIGNAL_CLASS = {
  // قاطعة (م.44) — تُنفَّذ فوراً بلا تأكيد
  divStopped:      { cls: 'decisive', label: 'انقطاع التوزيع كلياً' },
  operatingLoss:   { cls: 'decisive', label: 'خسارة تشغيلية في النشاط الأساسي' },
  covenantBreach:  { cls: 'decisive', label: 'إخلال معلن بتعهد دين' },
  auditorQualified:{ cls: 'decisive', label: 'رأي مراجع متحفظ أو ممتنع' },
  permanentBan:    { cls: 'decisive', label: 'استبعاد دائم (م.12)' },
  // قوية — قراءتان
  divCutOver25:    { cls: 'strong', label: 'قص توزيع > 25%' },
  epsNegative:     { cls: 'strong', label: 'ربحية سالبة' },
  equityErosion6:  { cls: 'strong', label: 'تآكل حقوق ملكية > 6%' },
  coverageRed:     { cls: 'strong', label: 'تغطية التوزيع في المنطقة 🔴' },
  reitRed:         { cls: 'strong', label: 'توزيع الريت > 130% من التدفق' },
  navDrop4:        { cls: 'strong', label: 'نزول NAV > 4%' },
  // متوسطة — ثلاث قراءات
  marginDecline:   { cls: 'medium', label: 'تراجع الهامش' },
  provisionsUp:    { cls: 'medium', label: 'ارتفاع المخصصات' },
  navDrop:         { cls: 'medium', label: 'نزول NAV بين 1.5% و4%' },
  coverageOrange:  { cls: 'medium', label: 'تغطية التوزيع في المنطقة 🟠' },
  equityErosion3:  { cls: 'medium', label: 'تآكل حقوق ملكية بين 3% و6%' },
  // ضعيفة — مراقبة فقط
  epsVolatile:     { cls: 'weak', label: 'تقلب ربحية' },
  divChangeSmall:  { cls: 'weak', label: 'تغيّر توزيع < 10%' },
};

// معرّف الفترة من تاريخ — «القراءة» فترةٌ لا تسجيل (م.1)
function periodKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (!isFinite(x.getTime())) return null;
  return `${x.getFullYear()}-Q${Math.floor(x.getMonth() / 3) + 1}`;
}

// ترتيب الفترة رقمياً: 'YYYY-Qn' ⇒ عدد الأرباع منذ الميلاد
function periodIndex(p) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(p || ''));
  return m ? (+m[1]) * 4 + (+m[2] - 1) : null;
}

// كم قراءة **متتالية** سُجّلت لهذه الإشارة، وهل اكتمل التأكيد؟
// ----------------------------------------------------------------------
// ⚠️ م.43 تشترط «قراءتان **متتاليتان**» للإشارة القوية و«ثلاث قراءات»
// للمتوسطة. وكان العدّ يجمع الفترات المتمايزة بلا شرط تجاور: سهمٌ فشلت
// تغطيته في 2024-Q1 ثم تعافى ثمانية أرباع ثم فشل في 2026-Q2 كان يُقرأ
// «قراءتان ⇒ اكتمل التأكيد ⇒ خروج كامل». وهذا بالضبط حكمُ اللقطة الواحدة
// الذي وُجدت م.43 لمنعه، موزَّعاً على سنتين — وهو خطأ سابقة جرير والقصيم
// وسدافكو وكهرباء الموثّقة في م.41.
// العلاج: نعدّ **السلسلة المتتالية الأخيرة** فقط، فالتعافي يصفّر العدّاد.
function confirmationOf(signalKey, readings) {
  const meta = SIGNAL_CLASS[signalKey];
  if (!meta) return { known: false, why: `إشارة غير معرَّفة: ${signalKey}` };
  const need = CONFIRM_READS[meta.cls];
  const periods = [...new Set((readings || []).map(r => r.period || periodKey(r.date)).filter(Boolean))]
    .sort();

  // السلسلة المتتالية المنتهية بآخر فترة مسجَّلة
  let have = periods.length ? 1 : 0;
  for (let i = periods.length - 1; i > 0; i--) {
    const a = periodIndex(periods[i]), b = periodIndex(periods[i - 1]);
    if (a != null && b != null && a - b === 1) have++;
    else break;
  }
  const streakFrom = periods.length ? periods[periods.length - have] : null;

  if (meta.cls === 'weak') {
    return { known: true, cls: meta.cls, label: meta.label, need: 0, have, confirmed: false,
             action: 'watch', why: 'إشارة ضعيفة — مراقبة فقط، لا تنفيذ (م.43)' };
  }
  if (meta.cls === 'decisive') {
    return { known: true, cls: meta.cls, label: meta.label, need: 1, have, confirmed: have >= 1,
             action: have >= 1 ? 'execute' : 'none',
             why: have >= 1
               ? 'إشارة قاطعة — تُنفَّذ من قراءة واحدة بلا تأكيد (م.44)'
               : 'لم تُسجَّل قراءة بعد' };
  }
  const confirmed = have >= need;
  const brokeStreak = periods.length > have;
  return {
    known: true, cls: meta.cls, label: meta.label, need, have, confirmed, periods, streakFrom,
    action: confirmed ? 'execute' : 'await',
    why: confirmed
      ? `اكتمل التأكيد: ${have} قراءات متتالية من ${need} المطلوبة منذ ${streakFrom} (م.43)`
      : `القراءات المتتالية ${have} من ${need} المطلوبة — لا تنفيذ قبل اكتمالها (م.43)`
        + (brokeStreak
            ? ` — سُجّلت ${periods.length} فترات إجمالاً لكن التعافي بينها قطع التتابع، والعدّ يبدأ من جديد`
            : ''),
  };
}

// ══════════════════════════════════════════════════════════════════════
// م.45 — الفلتر 1-ب: بوابة الخسارة المحققة
// ----------------------------------------------------------------------
// «عند فشل الفلتر 1، الخروج لا يُنفَّذ فوراً بل يمر بهذه البوابة إلزامياً.»
// م.11 هي القاعدة المطلقة: لا بيع تحت متوسط التكلفة أبداً — واستثناؤها
// الوحيد م.46 (انقطاع توزيع + تآكل حقوق ملكية).
//
// والمقياس **التعادل الحقيقي** لا متوسط التكلفة: ما استُرِدّ توزيعاً جزءٌ
// من رأس المال عاد فعلاً، وتجاهله يؤجّل خروجاً صار مربحاً.
// ══════════════════════════════════════════════════════════════════════
function deferredVerdict(price, avgCost, divReceived, shares) {
  const be = trueBreakEven(avgCost, divReceived, shares);
  if (be == null) {
    return { action: 'unknown', breakEven: null,
             why: 'لا يمكن حساب التعادل الحقيقي (تكلفة أو عدد أسهم غير صالح) — يُعلَن ولا يُقدَّر (م.20)' };
  }
  return price >= be
    ? { action: 'exitNow', breakEven: be, gap: price - be,
        why: `السعر ${price} ≥ التعادل الحقيقي ${be.toFixed(2)} — خروج فوري بسعر السوق (م.45)` }
    : { action: 'defer', breakEven: be, gap: price - be,
        why: `السعر ${price} < التعادل الحقيقي ${be.toFixed(2)} — قائمة الخروج المؤجل، `
           + 'لا بيع بخسارة محققة (م.11 و45)' };
}

// سعر الخروج المؤجل: يُدعَم بواحد من ثلاثة، وممنوع أن يساوي التعادل
const EXIT_BASES = {
  analystTarget: 'هدف محلل حديث (≤ 90 يوماً)',
  bookValue:     'القيمة الدفترية للسهم',
  justMultiple:  'المكرر المبرر لنوع الأصل',
};
function validateExitPrice(price, breakEven, bases) {
  const present = Object.keys(bases || {}).filter(k => EXIT_BASES[k] && bases[k] != null && bases[k] !== '');
  const errs = [];
  if (!(price > 0)) errs.push('سعر الخروج غير صالح');
  if (!present.length) errs.push('لا سند: يلزم واحد من ثلاثة — هدف محلل حديث أو القيمة الدفترية أو المكرر المبرر (م.45)');
  if (breakEven != null && price > 0 && Math.abs(price - breakEven) < 0.005) {
    // «هذا هروب لا قرار، ويضيّع فرقاً حقيقياً — في أغسطس 2026 بلغ 22,400 ريال على سبع حيازات»
    errs.push('ممنوع وضع سعر الخروج عند التعادل بالضبط — يُوضَع عند القيمة لا عند التعادل (م.45)');
  }
  return { ok: !errs.length, errors: errs, bases: present.map(k => EXIT_BASES[k]) };
}

// مراجعة سعر الخروج كل دورة (م.45)
function reviewExitPrice(price, state) {
  switch (state) {
    case 'improved':  return { price: +(price * 1.10).toFixed(2), why: 'الأساسيات تحسّنت — ارفع السعر 10% (م.45)' };
    case 'stable':    return { price, why: 'ثابتة — أبقِ السعر (م.45)' };
    case 'orange':    return { price: +(price * 0.85).toFixed(2), why: 'تدهورت إلى 🟠 — نزّل 15% (م.45)' };
    case 'redTwice':  return { price: null, toBreakEven: true, why: '🔴 لقراءتين — نزّل إلى التعادل الحقيقي (م.45)' };
    case 'divStopped':return { price: null, cancel: true, why: 'انقطع التوزيع — إلغاء السعر، وتُطبَّق م.46' };
    default:          return { price, why: 'حالة غير معروفة — أبقِ السعر وأعلن (م.20)' };
  }
}

// المراقبة الربعية الإلزامية لقائمة الخروج المؤجل (م.45)
function deferredQuarterlyCheck(equityZones, divStopped) {
  if (divStopped) {
    return { action: 'article46', urgent: true,
             why: 'انقطاع التوزيع — تسقط القاعدة المطلقة ويُنفَّذ خروج بأفضل سعر خلال سنة (م.46)' };
  }
  const z = equityZones || [];
  const lastOrange = z.slice(-3).filter(x => x === 'orange').length;
  const lastRed    = z.slice(-2).filter(x => x === 'red').length;
  if (lastRed >= 2 || lastOrange >= 3) {
    return { action: 'exitWithinYear', urgent: true,
             why: `حقوق الملكية ${lastRed >= 2 ? '🔴 لقراءتين' : '🟠 لثلاث قراءات'} — خروج بأفضل سعر خلال سنة (م.45)` };
  }
  return { action: 'hold', urgent: false, why: 'لم تكتمل شروط تسريع الخروج — يبقى مؤجَّلاً (م.45)' };
}

// م.46 — الاستثناء الوحيد للقاعدة المطلقة
function article46Applies(divStopped, filter1Failed, equityEroding) {
  const yes = !!(divStopped && filter1Failed && equityEroding);
  return {
    applies: yes,
    why: yes
      ? 'انقطع التوزيع وفشل الفلتر 1 وحقوق الملكية تتآكل — تسقط القاعدة المطلقة (م.46). '
        + 'التوزيع أجر الانتظار؛ حين ينقطع تصبح تحتفظ بأصل خاسر بلا دخل وقيمته تنزل — هذه خسارة صامتة لا صبر.'
      : 'لم تجتمع الشروط الثلاثة — القاعدة المطلقة نافذة: لا بيع تحت التكلفة (م.11).',
  };
}

// ══════════════════════════════════════════════════════════════════════
// م.72 — سجل التدقيق
// ----------------------------------------------------------------------
// «كل إشارة تُسجَّل بـ: التاريخ | الرمز | المادة المنطبقة | البيانات
// المستخدمة ومصادرها | القرار | ما إذا نُفِّذ.»
//
// السجل ليس أرشيفاً تجميلياً: م.38 تمنع تحريك درجة التقييم بلا تغيّر
// موثَّق في الأرقام، وم.71 تُلزم بمراجعة الخروج المؤجل بالنسخة السارية
// وقت المراجعة. كلاهما غير قابل للفحص بلا سجل.
// ══════════════════════════════════════════════════════════════════════
function auditEntry(o) {
  const inputs = (o.inputs || []).map(x => ({
    name: x.name,
    value: x.tv ? x.tv.value : x.value,
    tag: x.tv ? x.tv.tag : (x.tag || 'external'),
    source: x.tv ? x.tv.source : (x.source || null),
  }));
  return {
    ts: o.ts || null,                 // يُملأ عند الحفظ — لا Date.now() هنا
    ticker: o.ticker || null,
    article: o.article || null,       // «م.45» مثلاً
    signal: o.signal || null,
    decision: o.decision || null,
    executed: o.executed === true,
    inputs,
    // م.66/2 — هل استند القرار إلى رقم لا يجوز أن يقود وزناً؟
    weakInputs: inputs.filter(i => i.tag !== 'official' && i.tag !== 'derived').map(i => i.name),
    note: o.note || null,
  };
}

// ══════════════════════════════════════════════════════════════════════
// التخزين — منفصل عن المنطق عمداً
// ----------------------------------------------------------------------
// نفس نمط بقية المشروع: user_settings في Supabase مصدرٌ دائم، وlocalStorage
// ذاكرة قراءة سريعة. الدوال أعلاه لا تعرف شيئاً عن هذا.
// ══════════════════════════════════════════════════════════════════════
const CD_KEYS = {
  readings: 'readings_log_v1',      // م.43
  deferred: 'deferred_exits_v1',    // م.45
  audit:    'audit_log_v1',         // م.72
  depth:    'dividend_depth_v1',    // م.41 — سنوات مُدخَلة يدوياً لكل سهم
  categoryHistory: 'category_history_v1',   // م.26 — نطاق التعليق بين الفئات
};
const AUDIT_MAX = 1000;             // سقف السجل — الأقدم يُقصّ

async function cdLoad(key, def) {
  try {
    const remote = await loadUserSetting(CD_KEYS[key] || key);
    if (remote != null) return remote;
  } catch (_) {}
  try {
    const raw = localStorage.getItem(userLsKey(CD_KEYS[key] || key));
    if (raw != null) return JSON.parse(raw);
  } catch (_) {}
  return def;
}
async function cdSave(key, val) {
  const k = CD_KEYS[key] || key;
  try { localStorage.setItem(userLsKey(k), JSON.stringify(val)); } catch (_) {}
  try { await saveUserSetting(k, val); } catch (_) {}
  return val;
}

// م.43 — تسجيل قراءة. الفترة نفسها لا تُسجَّل مرتين (القراءة فترةٌ لا حدث)
function pushReading(log, ticker, signalKey, entry) {
  const out = { ...(log || {}) };
  const byTk = { ...(out[ticker] || {}) };
  const arr = [...(byTk[signalKey] || [])];
  const period = entry.period || periodKey(entry.date);
  if (!period) return out;
  if (!arr.some(r => (r.period || periodKey(r.date)) === period)) {
    arr.push({ ...entry, period });
  }
  byTk[signalKey] = arr;
  out[ticker] = byTk;
  return out;
}

// م.72 — إضافة قيد، مع قصّ الأقدم عند السقف
function pushAudit(log, entry) {
  const arr = [...(log || []), entry];
  return arr.length > AUDIT_MAX ? arr.slice(arr.length - AUDIT_MAX) : arr;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    tv, TV_MISSING, canDriveWeight, tvText, tvStale,
    DEPTH_MIN_YEARS, dividendDepthYears, depthGate, CYCLICAL_MARKS, cyclicalScore,
    SIGNAL_CLASS, periodKey, confirmationOf,
    deferredVerdict, EXIT_BASES, validateExitPrice, reviewExitPrice,
    deferredQuarterlyCheck, article46Applies,
    auditEntry, CD_KEYS, AUDIT_MAX, pushReading, pushAudit,
  };
}
