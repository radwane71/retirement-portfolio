// ══════════════════════════════════════════════════════════════════════
// مشتقّات تداول — **مصدرٌ يُحرَّر يدوياً**
// ----------------------------------------------------------------------
// هذا الملف يُلحَق بذيل `js/tadawul-data.js` عند كل توليد. البيانات
// أعلاه في الناتج مولَّدة ولا تُمَسّ؛ وهذه الدوال تُعدَّل هنا وحدها.
//
// كان كل هذا محشوراً داخل قالب نصّي في `extract_tadawul.py`، فكانت أي
// إضافة إلى الناتج تُمحى صامتةً عند إعادة التوليد.
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// مشتقّات جاهزة للمحرّك — كلها من الأرقام أعلاه، لا تقدير
// ══════════════════════════════════════════════════════════════════════

// السنوات التي فيها توزيع فعليّ (م.41 — عمق التاريخ)
function tdDividendYears(ticker) {
  const r = TADAWUL_DATA[ticker];
  if (!r) return [];
  return Object.keys(r.years)
    .filter(y => (r.years[y].dps > 0) || (r.years[y].divPaid && Math.abs(r.years[y].divPaid) > 0))
    .map(Number).sort((a, b) => a - b);
}

// كل السنوات التي فيها بيانات مالية معلنة (بغضّ النظر عن التوزيع)
function tdDataYears(ticker) {
  const r = TADAWUL_DATA[ticker];
  if (!r) return [];
  return Object.keys(r.years)
    .filter(y => {
      const x = r.years[y];
      return x && (x.revenue != null || x.eps != null || x.niParent != null);
    })
    .map(Number).sort((a, b) => a - b);
}

// سنوات التوزيع المتصل (م.25 و2) + حالة حداثتها
// ----------------------------------------------------------------------
// «الخفض لا يقطع الاتصال؛ الانقطاع الكامل يصفّره» — م.2.
//
// ⚠️ لماذا لا نصفّر السلسلة لمجرد أن آخر سنة بيانات بلا توزيع:
// في هذا المصدر `dps` تساوي `null` حين **لم تُستخرج**، ولا تساوي صفراً
// أبداً (فُحص: صفر حالة صريحة مقابل 22 حالة غائبة). فالغياب لا يُميَّز عن
// عدم التوزيع. وتصفيرُ السلسلة من الغياب يُنتج «انقطاع توزيع» — وهي
// إشارة **قاطعة** تُنفَّذ من قراءة واحدة بلا تأكيد (م.44) وتُنزل السهم
// لأدنى فئة فوراً (م.26). أي أن نقصاً في ملفٍ عند المحرّك يُخرج مركزاً
// كاملاً — وهو نصّ ما تمنعه م.21، ومعها م.20 «لا تقدير صامت».
//
// فالعدد يبقى كما هو، وتُعلَن الحداثة صراحةً في `tdDividendStreakInfo`
// ليقرّر المستدعي: انقطاعٌ حقيقي يُثبَت من ملف تداول لا يُستنتج من فراغ.
function tdDividendStreak(ticker) {
  const ys = tdDividendYears(ticker);
  if (!ys.length) return 0;
  let streak = 1;
  for (let i = ys.length - 1; i > 0; i--) {
    if (ys[i] - ys[i - 1] === 1) streak++;
    else break;
  }
  return streak;
}

// حالة السلسلة: حتى أي سنة تمتدّ، وكم سنة تخلّفت عن آخر بيانات مالية.
//   stale = تخلّفت سنتين فأكثر ⇒ لا يُبنى عليها شرط م.25 بلا تحقّق،
//           ويُوسَم الرقم ⚠️ (م.19) بدل أن يُعدّ توزيعاً متصلاً قائماً.
function tdDividendStreakInfo(ticker) {
  const ys   = tdDividendYears(ticker);
  const all  = tdDataYears(ticker);
  const years = tdDividendStreak(ticker);
  if (!ys.length || !all.length) {
    return { years, throughYear: null, lastDataYear: null, gapYears: null, stale: false, known: false };
  }
  const throughYear  = ys[ys.length - 1];
  const lastDataYear = all[all.length - 1];
  const gapYears     = lastDataYear - throughYear;
  return {
    years, throughYear, lastDataYear, gapYears,
    stale: gapYears >= 2,
    known: true,
    why: gapYears >= 2
      ? `آخر توزيع مسجَّل ${throughYear} وآخر بيانات ${lastDataYear} — الفارق ${gapYears} سنة. `
        + 'الغياب في هذا المصدر لا يُميَّز عن عدم التوزيع، فلا يُحكَم بالانقطاع '
        + 'إلا من ملف تداول صراحةً (م.20 و21 و44).'
      : '',
  };
}

// آخر تغطية توزيع من التدفق الحر (م.42-أ — أعلى أفضل)
function tdLatestCoverage(ticker) {
  const r = TADAWUL_DATA[ticker];
  if (!r) return null;
  const ys = Object.keys(r.years).map(Number).sort((a, b) => b - a);
  for (const y of ys) if (r.years[y].fcfCover != null) return { year: y, value: r.years[y].fcfCover };
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// م.35 — ربحية مُطبَّعة 5–7 سنوات، على أساس **مُعاد البيان** (م.22)
// ----------------------------------------------------------------------
// «سابك بربحيتها اللحظية 0.50 تعطي قيمة عادلة 4 ريال؛ وبالمطبّعة 2.90
// تعطي 34.5. الفرق ثمانية أضعاف.»
//
// ⚠️ **لا يُؤخذ متوسط `eps` الخام**: جرير جزّأت 10:1 في 2023 (8.36 قبلها
// و0.81 بعدها)، فمتوسطها الخام 4.53 — رقمٌ لا يصف أي سنة. وم.22 تمنع
// المقارنة التاريخية بلا إعادة بيان.
//
// الأساس هنا: **الربح العائد للمساهمين ÷ عدد الأسهم الحالي** — نسبة
// محصَّنة ضد التجزئة والمنحة لأن البسط والمقام كلاهما من اليوم.
// ══════════════════════════════════════════════════════════════════════
function tdNormalizedEps(ticker, minYears) {
  const r = TADAWUL_DATA[ticker];
  if (!r) return null;
  const need = minYears || 5;
  const shNow = tdLatest(ticker, 'sharesM');
  if (!shNow || !(shNow.value > 0)) {
    return { value: null, years: 0, basis: null,
             why: 'عدد الأسهم غير متاح — لا يمكن إعادة البيان (م.22 و20)' };
  }
  const rows = Object.keys(r.years).map(Number).sort((a, b) => b - a)
    .map(y => ({ y, ni: r.years[y].niParent ?? r.years[y].netIncome }))
    .filter(x => x.ni != null).slice(0, 7);
  if (rows.length < need) {
    return { value: null, years: rows.length, basis: null,
             why: `يلزم ${need} سنوات على الأقل، والمتاح ${rows.length} (م.35)` };
  }
  const eps = rows.map(x => x.ni / (shNow.value * 1e6));
  const avg = eps.reduce((a, b) => a + b, 0) / eps.length;
  return {
    value: avg, years: eps.length, basis: 'restated',
    from: rows[rows.length - 1].y, to: rows[0].y, sharesM: shNow.value,
    why: `متوسط ${eps.length} سنوات على أساس مُعاد البيان `
       + `(الربح ÷ ${shNow.value.toFixed(0)} مليون سهم اليوم) — م.35 و22`,
  };
}

// آخر قيمة متاحة لحقل ما، ومعها سنتها — لئلا يُعرض رقم بلا تاريخه
function tdLatest(ticker, field) {
  const r = TADAWUL_DATA[ticker];
  if (!r) return null;
  const ys = Object.keys(r.years).map(Number).sort((a, b) => b - a);
  for (const y of ys) if (r.years[y][field] != null) return { year: y, value: r.years[y][field] };
  return null;
}

// سلسلة DPS المعدّلة للتجزئة — الأساس الصحيح لنمو التوزيع (م.22)
function tdDpsSeries(ticker) {
  const r = TADAWUL_DATA[ticker];
  if (!r) return [];
  return Object.keys(r.years).map(Number).sort((a, b) => a - b)
    .map(y => ({ year: y, dps: r.years[y].dpsAdj ?? r.years[y].dps ?? null }))
    .filter(x => x.dps != null);
}

// مدخلات تصنيف الفئة الجاهزة من تداول (م.25) — القيمة السوقية تحتاج سعراً
function tdCategoryInputs(ticker, price) {
  const r = TADAWUL_DATA[ticker];
  if (!r) return null;
  const sh = tdLatest(ticker, 'sharesM');
  const cov = tdLatestCoverage(ticker);
  return {
    streakYears: tdDividendStreak(ticker) || undefined,
    coverage: cov ? cov.value : undefined,
    marketCapB: (sh && price > 0) ? +(sh.value * price / 1000).toFixed(2) : undefined,
    _src: { streak: 'تداول ✅', coverage: cov ? `تداول ✅ ${cov.year}` : null,
            marketCap: (sh && price > 0) ? `⚙️ ${sh.value}م سهم × ${price}` : null },
  };
}

// ══════════════════════════════════════════════════════════════════════
// مدخلات حاسبة القيمة العادلة — من تداول مباشرة
// ----------------------------------------------------------------------
// كل قيمة تحمل وسمها (م.19): ✅ منقولة حرفياً من الإيداع · ⚙️ محسوبة منه.
// وما لا يوجد في الإيداع يُعلَن ناقصاً ولا يُقدَّر (م.20).
//
// ⚠️ **الدين الصافي غير متاح هنا.** الإيداعات تعطي القروض ولا تعطي النقد
// وما يعادله، والقرض وحده ليس ديناً صافياً. يُترك للمالك.
// ══════════════════════════════════════════════════════════════════════
function tdValuationInputs(ticker) {
  const r = TADAWUL_DATA[ticker];
  if (!r) return null;
  const sh  = tdLatest(ticker, 'sharesM');
  const shN = (sh && sh.value > 0) ? sh.value * 1e6 : null;
  const out = { ticker, name: r.name, sector: r.sector,
                sharesM: sh ? sh.value : null, fields: {}, missing: [] };
  const put = (k, value, year, tag, note) => {
    if (value == null || !isFinite(value)) return;
    out.fields[k] = { value: +(+value).toFixed(4), year, tag, note };
  };

  const eps = tdLatest(ticker, 'eps');
  if (eps) put('eps', eps.value, eps.year, 'official', 'ربحية السهم المُعلَنة لسنة ' + eps.year);

  const bv = tdLatest(ticker, 'bvps');
  if (bv) put('bvps', bv.value, bv.year, 'derived', 'حقوق المساهمين ÷ عدد الأسهم، ' + bv.year);

  const dps = tdLatest(ticker, 'dpsAdj') || tdLatest(ticker, 'dps');
  if (dps) put('dps', dps.value, dps.year, 'derived',
    'التوزيع للسهم ' + dps.year + ' معدّلاً للتجزئة (م.22)');

  const fcf = tdLatest(ticker, 'fcf');
  if (fcf && shN) put('fcf', fcf.value / shN, fcf.year, 'derived',
    'التدفق الحر ' + fcf.year + ' ÷ ' + sh.value.toFixed(0) + ' مليون سهم');

  // م.35 — المُطبّعات على أساس مُعاد البيان: البسط تاريخي والمقام أسهم اليوم
  const nEps = tdNormalizedEps(ticker, 5);
  if (nEps && nEps.value != null) put('normEps', nEps.value, nEps.to, 'derived', nEps.why);
  else out.missing.push({ k: 'normEps', why: nEps ? nEps.why : 'غير متاح' });

  if (shN) {
    const rows = Object.keys(r.years).map(Number).sort((a, b) => b - a)
      .map(y => ({ y, fcf: r.years[y].fcf })).filter(x => x.fcf != null).slice(0, 7);
    if (rows.length >= 5) {
      put('normFcf', rows.reduce((a, b) => a + b.fcf, 0) / rows.length / shN, rows[0].y, 'derived',
        'متوسط ' + rows.length + ' سنوات تدفق حر ÷ أسهم اليوم (م.35 و22)');
    } else {
      out.missing.push({ k: 'normFcf',
        why: 'يلزم 5 سنوات تدفق حر، والمتاح ' + rows.length + ' (م.20)' });
    }
  }
  out.netDebtNote = 'الدين الصافي لا يُستخرج من هذه الإيداعات (النقد غير ملتقَط) — أدخِله بنفسك (م.20)';
  return out;
}

// نمو التوزيع المركّب من السلسلة المعدّلة للتجزئة (م.22)
// يُستعمل في DDM وفي الرؤية المستقبلية — بدل رقم مفترض.
function tdDpsGrowth(ticker) {
  const s = tdDpsSeries(ticker).filter(x => x.dps > 0);
  if (s.length < 3) return { value: null, years: s.length,
    why: 'يلزم 3 سنوات توزيع على الأقل، والمتاح ' + s.length + ' (م.20)' };
  const a = s[0], b = s[s.length - 1], n = b.year - a.year;
  if (n <= 0) return { value: null, years: s.length, why: 'مدى زمني غير صالح' };
  const cagr = Math.pow(b.dps / a.dps, 1 / n) - 1;
  if (!isFinite(cagr)) return { value: null, years: s.length, why: 'حساب غير صالح' };

  // ⚠️ CAGR يمسك طرفي المدى فقط، فسنةٌ أولى شاذّة تقلب الاتجاه كلّه:
  // النهدي وزّع 9.69 ر.س في 2021 بنسبة 155% من أرباحه — توزيعٌ استثنائي
  // قبل الإدراج. قياسٌ منه يعطي −12.8% سنوياً، وهو **أثر قاعدة لا اتجاه**.
  // لا نُصلح الرقم سرّاً (م.20 و23): نحسب بديلاً من السنة التالية ونُعلن كليهما.
  const YRS = TADAWUL_DATA[ticker].years;
  const odd = (row, dps, neighbour) =>
       (YRS[row] && YRS[row].payoutPct != null && YRS[row].payoutPct > 120)
    || (neighbour != null && dps > neighbour * 2);
  const oddStart = odd(a.year, a.dps, s.length > 2 ? s[1].dps : null);
  const oddEnd   = odd(b.year, b.dps, s.length > 2 ? s[s.length - 2].dps : null);

  const out = { value: cagr, years: s.length, from: a.year, to: b.year,
    fromDps: a.dps, toDps: b.dps,
    why: 'مركّب ' + n + ' سنة: ' + a.dps.toFixed(2) + ' ← ' + b.dps.toFixed(2)
       + ' ر.س (معدّلاً للتجزئة)' };

  // القياس الاحتياطي يقصّ الطرف الشاذّ — أيّهما كان — ويُعلن أنه فعل ذلك.
  if ((oddStart || oddEnd) && s.length >= 4) {
    const a2 = oddStart ? s[1] : a;
    const b2 = oddEnd   ? s[s.length - 2] : b;
    const m  = b2.year - a2.year;
    const alt = m > 0 ? Math.pow(b2.dps / a2.dps, 1 / m) - 1 : null;
    const label = (y) => y.year + ' (' + y.dps.toFixed(2) + ' ر.س'
      + (YRS[y.year] && YRS[y.year].payoutPct != null
         ? ' بنسبة توزيع ' + YRS[y.year].payoutPct.toFixed(0) + '%' : '') + ')';
    out.caution = 'طرف شاذّ: ' + (oddStart ? 'سنة الأساس ' + label(a) : '')
      + (oddStart && oddEnd ? ' وسنة النهاية ' + label(b) : '')
      + (!oddStart && oddEnd ? 'سنة النهاية ' + label(b) : '')
      + ' — الرقم أعلاه أثر دفعة استثنائية لا اتجاهاً.';
    if (alt != null && isFinite(alt)) {
      out.altValue = alt; out.altFrom = a2.year; out.altTo = b2.year;
      out.caution += ' بقصّه: ' + (alt * 100).toFixed(1) + '% سنوياً من '
        + a2.year + ' إلى ' + b2.year + '.';
    }
  }

  // ── تذبذب السلسلة نفسها، لا طرفيها ──────────────────────────────────
  // سدافكو: 5.99 ← 3.00 ← 17.97 ← 17.01. الطرفان سليمان ونسبة التوزيع تحت
  // الحدّ، فلا «طرف شاذّ» — ومع ذلك «41.6% نمواً سنوياً» وصفٌ لا يصف شيئاً.
  // معدّل النمو يفترض مساراً؛ وهذه قفزات. الرقم يبقى معروضاً، ويُمنع أن
  // يقود إسقاطاً مستقبلياً بلا قرار صريح منك (م.23).
  let mx = 0, mxAt = null;
  for (let i = 1; i < s.length; i++) {
    const ch = (s[i].dps - s[i - 1].dps) / s[i - 1].dps;
    if (Math.abs(ch) > Math.abs(mx)) { mx = ch; mxAt = s[i].year; }
  }
  if (Math.abs(mx) >= 0.50) {
    out.volatile = true;
    out.maxSwing = mx; out.maxSwingYear = mxAt;
    out.volatileWhy = 'السلسلة متقلّبة: أكبر قفزة ' + (mx > 0 ? '+' : '')
      + (mx * 100).toFixed(0) + '% في ' + mxAt + ' ('
      + s.map(x => x.dps.toFixed(2)).join(' ← ') + ') — معدّل النمو يفترض '
      + 'مساراً وهذه قفزات، فلا يصلح وحده لإسقاط دخل مستقبلي.';
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TADAWUL_DATA, TADAWUL_EXTRACTED_AT, TADAWUL_SOURCE_FILES,
    tdDividendYears, tdDividendStreak, tdLatestCoverage, tdNormalizedEps,
    tdLatest, tdDpsSeries, tdCategoryInputs, tdValuationInputs, tdDpsGrowth };
}
