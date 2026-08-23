// ══════════════════════════════════════════════════════════════════════
// حارس المهجور: أي ثابت أو دالة في وحدتَي الدستور لا يستهلكها أحد
// ----------------------------------------------------------------------
// وُلد هذا الفحص من خطأ متكرّر: مواد كانت **معرَّفة ومهجورة** ومرّت في
// الفحص الشامل لأنه يفحص وجود الدالة لا استدعاءها. الرقم في وحدة الدستور
// بلا مستهلِك ليس تطبيقاً للمادة — هو نيّةُ تطبيق.
//
// **لماذا قائمة صريحة لا تتبّع آلي:** جُرّب التتبّع التعدّي (ما تستهلكه
// دالة حيّة فهو حيّ) وسقط مرّتين — كتلة `module.exports` تذكر كل اسم،
// وتعليقٌ يذكر اسماً بعد دالة حيّة يُحسب استهلاكاً. النتيجة كانت 82 من 83
// «حيّاً» وحارسٌ بلا معنى. فالاستهلاك الداخلي يُكتب هنا باسم مستهلِكه:
// يُقرأ ويُراجَع بدل أن يُستنتج بحدس.
//
// ⚠️ `String.raw` مقصود: حدّ الكلمة داخل سلسلة مُهرَّبة ينهار إلى محرف
// backspace (0x08) فيبحث الفحص عن نصّ لا وجود له — وقع ذلك مرّتين أثناء
// كتابة هذا الملف. الفحص الثالث أدناه يحرس ضدّه.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const C = require(ROOT + 'js/constitution.js');
const D = require(ROOT + 'js/constitution-data.js');

let ok = 0, bad = 0;
const t = (n, got, want) => { const p = Object.is(got, want); p ? ok++ : bad++;
  console.log((p ? 'PASS ' : 'FAIL ') + n + `  → ${JSON.stringify(got)} (متوقَّع ${JSON.stringify(want)})`); };

// بلا مستهلِك **خارجي** — ومعه سببه. القائمة تُراجَع ولا تنمو بلا تبرير.
const ALLOWED = {
  // ① جداول تعيش عبر دالتها الغلاف، والغلاف مُستعمَل خارجياً
  SECTOR_BANDS:     'sectorBandOf (م.28)',
  VALUE_BANDS:      'valueBandOf (م.48)',
  DISPERSION_BANDS: 'valueBandOf — توسيع النطاق بالتشتت (م.39)',
  SUSTAIN_NORMAL:   'sustainZoneOf (م.42-أ)',
  SUSTAIN_REIT:     'sustainZoneOf (م.42-ج)',
  BRIDGE_ADJ:       'sustainZoneOf — مُعدِّل الميزانية (م.42-ب)',
  ZONE_ORDER:       'sustainZoneOf — ترتيب المناطق للإزاحة',
  CUT_BANDS:        'dividendCutBand (م.42-هـ)',
  CONFIRM_READS:    'confirmationOf (م.43)',
  SIGNAL_CLASS:     'confirmationOf — صنف كل إشارة (م.43)',
  DATA_TAG:         'tvText (م.19)',
  EXIT_BASES:       'validateExitPrice (م.45)',
  DEPTH_MIN_YEARS:  'depthGate (م.41)',
  AUDIT_MAX:        'pushAudit (م.72)',
  GOV_EXPOSURE:     'govExposure (م.30)',
  CD_KEYS:          'cdLoad و cdSave',
  OVERRIDE_VALID_DAYS: 'overrideStatus (م.31)',
  WITHDRAW_START_YEAR: 'portfolioPhase (م.1)',
  // ② مصدَّر للاختبار أو كمرجع، لا لاستهلاك برمجي
  CONST_VERSION:    'ختم إصدار للتشخيص',
  CAT_ORDER:        'الاختبارات وحدها (ترتيب الفئات)',
  DECISIVE_SIGNALS: 'قائمة مرجعية تُطابَق بنصّ الدستور في الاختبار (م.44)',
  TV_MISSING:       'قيمة جاهزة للاستعمال',
  RATING_DIMS:      'مرجع منهجية الدرجة (ملحق ب)',
  INJECTION_START:  'تاريخ مرجعي للإسقاط (م.7)',
  dividendDepthYears: 'depthGate (م.41)',
  periodKey:        'pushReading و confirmationOf (م.43)',
  canDriveWeight:   'auditEntry — عمود المدخلات الضعيفة (م.66/2)',
  capOfCategory:    'واجهة مساعدة — السقف يُقرأ من نتيجة classifyStock',
  tvText:           'واجهة عرض الوسم (م.19)',
};

const files = [];
fs.readdirSync(ROOT + 'js')
  .filter(f => f.endsWith('.js') && !f.startsWith('constitution'))
  .forEach(f => files.push(['js/' + f, fs.readFileSync(ROOT + 'js/' + f, 'utf8')]));
fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))
  .forEach(f => files.push([f, fs.readFileSync(ROOT + f, 'utf8')]));

const WB = String.raw`\b`;                       // لا يُهرَّب يدوياً — انظر الترويسة
const reOf = n => new RegExp(WB + n + WB);

const names = [...Object.keys(C), ...Object.keys(D)];
const direct = {};
names.forEach(n => { direct[n] = files.filter(([, s]) => reOf(n).test(s)).map(([f]) => f); });
const dead = names.filter(n => !direct[n].length);

// ── سلامة الأداة نفسها (وإلا حرست لا شيء) ──
t('تكشف اسماً نعرف أنه مُستهلَك', direct.classifyStock.length > 0, true);
t('وتكشف اسماً نعرف أنه ليس كذلك', dead.includes('CONST_VERSION'), true);
t('ولا محرف backspace في تعبيرها', WB.charCodeAt(0), 92);

const unexpected = dead.filter(n => !ALLOWED[n]);
if (unexpected.length) {
  console.log('\n=== مهجور بلا سبب مُعلَن — مادة غير مُنفَّذة ===');
  unexpected.forEach(n => console.log('  ✗', n));
}
const stale = Object.keys(ALLOWED).filter(n => !dead.includes(n));
if (stale.length) {
  console.log('\n=== استثناء بائت (صار مُستهلَكاً — احذفه من ALLOWED) ===');
  stale.forEach(n => console.log('  •', n, '←', ALLOWED[n]));
}

t('لا اسم مهجور بلا سبب مُعلَن', unexpected.length, 0);
t('ولا استثناء بائت', stale.length, 0);
console.log(`\nمُستهلَك خارجياً ${names.length - dead.length} من ${names.length} · مُستثنى بسبب ${dead.length}`);
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
