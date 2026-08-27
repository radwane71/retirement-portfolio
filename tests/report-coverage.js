// ══════════════════════════════════════════════════════════════════════
// التقرير الشامل يغطّي كل مصدر بيانات — لا مصدرَ يُنسَخ ولا يُقرأ
// ----------------------------------------------------------------------
// نمطٌ تكرّر ثلاث مرات: بيانٌ يُكتب ويدخل النسخة الاحتياطية ويُستعاد
// سليماً، **ولا قسم له في التقرير**. الأثر ليس فقدَ بيانات — بل مستندُ
// دورةٍ ناقص يُقرَّر عليه. وقع في: أعمدة م.72 · إفصاح م.30 · قائمة
// الخروج المؤجل · السجلات الدستورية الأربعة · سجلّ تغييرات الراتب.
//
// الحارس يقارن **ما يُنسَخ** بـ**ما يُقرأ في مولّد التقرير**، فأي مصدر
// جديد يدخل النسخة بلا قسم يُسقط الفحص فوراً.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const S = fs.readFileSync(ROOT + 'js/settings.js', 'utf8');

let ok = 0, bad = 0;
const t = (n, cond, extra) => { cond ? ok++ : bad++;
  console.log((cond ? 'PASS ' : 'FAIL ') + n + (cond ? '' : `  ← ${extra || ''}`)); };

// مولّد التقرير يبدأ عند القسم الأول
const REP = S.slice(S.indexOf("h2('1. "));

// ── ① كل جدول في النسخة له قسم في التقرير ──
const tables = (S.match(/const TABLES = \[([\s\S]*?)\];/) || [])[1] || '';
const tblNames = [...tables.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
const tblMissing = tblNames.filter(x => !REP.includes(x));
if (tblMissing.length) console.log('   بلا قسم:', tblMissing.join(', '));
t(`كل جداول النسخة (${tblNames.length}) مقروءة في التقرير`, tblMissing.length === 0);

// ── ② السجلات الدستورية — كلها تاريخية ويُبنى عليها القرار ──
const CD = fs.readFileSync(ROOT + 'js/constitution-data.js', 'utf8');
const cdKeys = [...((CD.match(/const CD_KEYS = \{([\s\S]*?)\};/) || [])[1] || '')
  .matchAll(/'([a-z_0-9]+_v\d+)'/g)].map(m => m[1]);
const cdMissing = cdKeys.filter(k => !REP.includes(k));
if (cdMissing.length) console.log('   بلا قسم:', cdMissing.join(', '));
t(`السجلات الدستورية (${cdKeys.length}) كلها في التقرير`, cdMissing.length === 0,
  'سجلٌّ يُنسَخ ولا يُقرأ يجعل م.71 و72 غير قابلتين للتنفيذ');

// ── ③ سجلّ تغييرات الراتب: تاريخ تعديلاتك على دخلك ──
t('سجلّ تغييرات الراتب مقروء', /salaryData\.audit/.test(REP));
t('وحقوله كما يكتبها salary.js لا كما نظنّها',
  /c\.field/.test(REP) && /c\.from/.test(REP) && /c\.to/.test(REP),
  '_auditDiff يكتب field/from/to — لا label/before/after');

// ── ④ إفصاح م.30 يصل من اللقطة ──
const DE = fs.readFileSync(ROOT + 'js/decision-engine.js', 'utf8');
t('م.30 تدخل لقطة المحرّك', /factorConcentration/.test(DE),
  'بلا حفظها في اللقطة لا يستطيع التقرير عرضها ولو أراد');
t('والتقرير يقرؤها', /factorConcentration/.test(REP));

// ── ⑤ لا رمز غير معرَّف في الأقسام (فخّ تكرّر) ──
const declared = new Set();
[...S.matchAll(/^\s*(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)]
  .forEach(m => declared.add(m[1]));
const suspects = ['MONTHS_AR_RPT', 'SAL_AUDIT_MAX_RPT', 'MONTHS_AR', 'SAL_AUDIT_MAX'];
const leaked = suspects.filter(x => REP.includes(x) && !declared.has(x));
if (leaked.length) console.log('   غير معرَّفة:', leaked.join(', '));
t('لا رمز مستورد من ملف آخر داخل التقرير', leaked.length === 0,
  'settings.js لا يحمّل salary.js — الرمز يُعرَّف هنا أو يُكتب نصّاً');

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
