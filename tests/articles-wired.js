// يتحقّق أن المواد 19 · 41 · 43 · 45 · 72 **موصولة** لا معرَّفة فقط.
// الفرق جوهري: دالة تُعرَّف ولا تُستدعى تمرّ في اختبار الوحدة وتفشل في الواقع.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const DE = fs.readFileSync(ROOT + 'js/decision-engine.js', 'utf8');
const HTML = fs.readFileSync(ROOT + 'decision-engine.html', 'utf8');

let ok = 0, bad = 0;
const t = (n, got, want) => { const p = Object.is(got, want); p ? ok++ : bad++;
  console.log((p ? 'PASS ' : 'FAIL ') + n + `  → ${JSON.stringify(got)} (متوقَّع ${JSON.stringify(want)})`); };
const has = re => re.test(DE);

// ═══ الوحدتان محمَّلتان في كل صفحة ذات أرقام ═══
{
  const miss = [];
  fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach(f => {
    const h = fs.readFileSync(ROOT + f, 'utf8');
    if (!h.includes('js/utils.js')) return;
    if (!h.includes('js/constitution-data.js')) miss.push(f);
  });
  if (miss.length) console.log('   ناقصة:', miss.join(', '));
  t('طبقة البيانات محمَّلة في كل صفحة', miss.length, 0);
}

// ═══ م.41 — البوابة تسبق الحكم بالفشل، لا تُستدعى بعده ═══
{
  t('م.41 depthGate مستدعاة', has(/depthGate\(divByTicker/), true);
  t('م.41 cyclicalScore مستدعاة', has(/cyclicalScore\(marks\)/), true);
  // الترتيب: البوابة قبل return status:'fail'
  const iGate = DE.indexOf('const depth = depthGate(');
  const iFail = DE.indexOf("return { ...base, status: 'fail'");
  t('البوابة تسبق حكم الفشل', iGate > 0 && iFail > iGate, true);
  t('وتُرجع watch لا fail عند النقص', has(/status: 'watch', gatedBy: 'م\.41'/), true);
  // الإشارة القاطعة تتجاوز البوابة (م.44)
  t('القاطعة تتجاوز بوابة العمق', has(/if \(!stopped && !depth\.pass\)/), true);
  t('وحقل السنوات في الواجهة', /id="de-card-histyears"/.test(HTML), true);
  t('وعلامات الدوري تُبنى من المصدر', has(/CYCLICAL_MARKS\.map\(m =>/), true);
}

// ═══ م.43 — القراءات تُسجَّل وتُقرأ ═══
{
  t('م.43 confirmationOf مستدعاة', has(/confirmationOf\(sigKeys\[0\]/), true);
  t('وتحجب التنفيذ قبل الاكتمال', has(/status: 'watch', gatedBy: 'م\.43'/), true);
  t('recordReadings مستدعاة بعد التقييم', has(/recordReadings\(_results\)/), true);
  t('وتستعمل pushReading', has(/log = pushReading\(log, r\.ticker, k,/), true);
  t('والسجل يُحمَّل في loadAll', has(/readingsLog\s+= \(await cdLoad\('readings'/), true);
  t('وجدول القراءات يُعرَض', /id="de-readings"/.test(HTML), true);
  t('وrenderLedgers مستدعاة', has(/renderLedgers\(\);/), true);
}

// ═══ م.45 — بوابة الخسارة المحققة تعترض الخروج ═══
{
  t('م.45 deferredVerdict مستدعاة', has(/const gate = deferredVerdict\(price, r\.avgCost/), true);
  t('وavgCost مُمرَّر في الصف', has(/avgCost: \+h\.avg_price/), true);
  t('والمؤجَّل لا يُحتسب تمويلاً', has(/return;\s*\/\/ لا يدخل fundedBy/), true);
  t('وم.46 تكسر القاعدة عند اجتماع الشروط', has(/const a46\s+= article46Applies\(/), true);
  t('وبند القائمة معروض', has(/قائمة الخروج المؤجل — م\.45/), true);
  t('والتعادل الحقيقي معروض في السطر', has(/التعادل الحقيقي <b>\$\{formatNum\(o\.breakEven\)\}/), true);
}

// ═══ م.72 — كل قرار يُسجَّل ═══
{
  t('م.72 recordAudit مستدعاة', has(/recordAudit\(p\);/), true);
  t('وتغطي المسارات الأربعة',
    ['plan.exits', 'plan.deferredExit', 'plan.trims', 'plan.adds']
      .every(k => DE.includes(`(${k} || []).forEach`)), true);
  t('ولا تكرّر القرار نفسه في اليوم', has(/if \(seen\.has\(key\)\) return;/), true);
  t('وجدول السجل معروض', /id="de-audit"/.test(HTML), true);
}

// ═══ م.45 — سعر الخروج قابل للتحرير ومفحوص قبل الحفظ ═══
{
  t('حقل سعر الخروج موجود', /id="de-card-exitprice"/.test(HTML), true);
  t('والسندات الثلاثة موجودة',
    ['de-card-exit-analyst', 'de-card-exit-book', 'de-card-exit-mult']
      .every(id => HTML.includes(`id="${id}"`)), true);
  t('والحفظ يرفض المخالف', has(/if \(!chk\.ok\) \{ showToast/), true);
  t('ولا يُحفَظ قبل الفحص',
    DE.indexOf('const chk = validateExitPrice(') < DE.indexOf('deferredExits[_cardTicker] = {'), true);
  t('والفحص حيّ قبل الضغط', has(/renderCardExitCheck\(_cardTicker\)/), true);
  t('والتعادل يُحسب من توزيعاتك', has(/function _cardBreakEven\(ticker\)/), true);
  t('والقائمة تُحفظ في مفتاحها', has(/await cdSave\('deferred', deferredExits\)/), true);
}

// ═══ م.19 — الوسم يصل إلى السجل ═══
{
  t('م.19 tv() تُستعمل في قيود التدقيق', has(/tv: tv\(r\.price, 'external'/), true);
  t('والمدخل الضعيف يُبرَز', has(/weakInputs\.length \? '⚠️ '/), true);
  t('والوسوم الأربعة معرَّفة', Object.keys(require(ROOT + 'js/constitution.js').DATA_TAG).length, 4);
}

// ═══ لا استدعاء لدالة غير معرَّفة (فخّ تكرّر في هذا المشروع) ═══
{
  const CONST = fs.readFileSync(ROOT + 'js/constitution.js', 'utf8');
  const DATA  = fs.readFileSync(ROOT + 'js/constitution-data.js', 'utf8');
  const defined = new Set();
  [DE, CONST, DATA, fs.readFileSync(ROOT + 'js/utils.js', 'utf8')].forEach(src => {
    (src.match(/^(?:async\s+)?function\s+([\w$]+)/gm) || [])
      .forEach(m => defined.add(m.replace(/^(?:async\s+)?function\s+/, '')));
    (src.match(/^(?:const|let)\s+([\w$]+)\s*=\s*(?:\([^)]*\)|[\w$]+)\s*=>/gm) || [])
      .forEach(m => defined.add(m.replace(/^(?:const|let)\s+/, '').split(/\s*=/)[0]));
  });
  const called = [
    'depthGate', 'cyclicalScore', 'confirmationOf', 'pushReading', 'pushAudit',
    'deferredVerdict', 'article46Applies', 'auditEntry', 'tv', 'cdLoad', 'cdSave',
    'classifyStock', 'valueBandOf', 'overrideStatus', 'trueBreakEven',
    'isBanned', 'isNoAccumulate',
  ];
  const missing = called.filter(f => !defined.has(f));
  if (missing.length) console.log('   غير معرَّفة:', missing.join(', '));
  t('كل دالة مستدعاة معرَّفة فعلاً', missing.length, 0);
}

// ═══ م.45 — الخروج المؤجَّل يعرض الربح/الخسارة كالمنفَّذ ═══
// بلاغ المالك 2026-08-27: بوابة م.11 نقلت خمسةً من سبعة قرارات خروج إلى
// `deferredExit`، وشرط عرض «تخرج وأنت كاسب/خاسر» كان يستثنيه — فرأى اثنين
// من سبعة. والرقم المحجوب هو **عين** ما تقيسه م.45: المسافة عن التعادل.
{
  const cond = (DE.match(/if \(o\.pnl && \([^)]*\)\)/) || [])[0] || '';
  t('لوحة الربح/الخسارة تشمل الخروج المؤجَّل', /deferredExit/.test(cond), true);
  t('وصيغته شرطية لا خبرية', /لو خرجت اليوم/.test(DE), true);
  t('وقرارات المالك المؤجَّلة تُعدّ تحت ①', /ownDeferred/.test(DE), true);
  t('ومصدرها موسوم عند الدفع', /ownExit:\s*true/.test(DE), true);
  t('وقائمة مؤجَّلة غير فارغة ليست «لا أمر مطلوب»',
    /const nothing = [^;]*!p\.deferredExit\.length/.test(DE), true);
}

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
