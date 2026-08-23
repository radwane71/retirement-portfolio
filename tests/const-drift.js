// حارس الانحراف: أي رقم دستوري مكتوب يدوياً خارج js/constitution.js يسقط هنا.
// السبب: هذا بالضبط ما أنتج «محرّكين يعطيان رقمين مختلفين لنفس السهم».
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const C = require(ROOT + 'js/constitution.js');

let ok = 0, bad = 0;
const t = (n, got, want) => { const p = Object.is(got, want); p ? ok++ : bad++;
  console.log((p ? 'PASS ' : 'FAIL ') + n + `  → ${JSON.stringify(got)} (متوقَّع ${JSON.stringify(want)})`); };

const files = fs.readdirSync(ROOT + 'js').filter(f => f.endsWith('.js') && f !== 'constitution.js')
  .map(f => ['js/' + f, fs.readFileSync(ROOT + 'js/' + f, 'utf8')])
  .concat(fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))
    .map(f => [f, fs.readFileSync(ROOT + f, 'utf8')]));

// أنماط تُمثّل إعادة كتابة ثابت دستوري بدل قراءته من المصدر
const FORBIDDEN = [
  { re: /const\s+\w*CAP_SINGLE\w*\s*=\s*\d/,   why: 'سقف سهم مكتوب يدوياً — اقرأ CAT[..].cap' },
  { re: /const\s+\w*CAP_BLUECHIP\w*\s*=\s*\d/, why: 'سقف «قيادي» — أُلغي في م.25' },
  { re: /Math\.min\(savedTarget,\s*capPct\)/,   why: 'قصّ الهدف عند السقف بلا فحص صلاحية م.31' },
  { re: /Math\.min\(r\.targetWeight,\s*r\.cap\)/, why: 'نفس القصّ في خطة الوصول' },
];
files.forEach(([name, src]) => {
  FORBIDDEN.forEach(f => {
    if (f.re.test(src)) { bad++; console.log(`FAIL انحراف في ${name}: ${f.why}`); }
  });
});
if (!bad) { ok++; console.log('PASS لا ثابت دستوري معاد كتابته خارج المصدر الواحد'); }

// كل صفحة تعرض أرقاماً تُحمّل وحدة الدستور، وبعد utils.js
{
  const miss = [], order = [];
  fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach(f => {
    const h = fs.readFileSync(ROOT + f, 'utf8');
    if (!h.includes('js/utils.js')) return;              // الدخول/الصيانة
    if (!h.includes('js/constitution.js')) { miss.push(f); return; }
    if (h.indexOf('js/constitution.js') < h.indexOf('js/utils.js')) order.push(f);
  });
  if (miss.length)  console.log('   ناقصة:', miss.join(', '));
  if (order.length) console.log('   ترتيب خاطئ:', order.join(', '));
  t('كل صفحة ذات أرقام تحمّل الدستور', miss.length, 0);
  t('وبعد utils.js', order.length, 0);
}

// الأرقام المعروضة في الواجهة تطابق الدستور
{
  const dash = fs.readFileSync(ROOT + 'js/dashboard.js', 'utf8');
  t('لوحة التحكم لا تكتب 15–20', /15–20 سهم/.test(dash), false);
  t('ولا تكتب سقفاً رقمياً', /السقف الدستوري 15%/.test(dash), false);
  const rate = fs.readFileSync(ROOT + 'portfolio-rating.html', 'utf8');
  t('صفحة التقييم على 12–18', /الهدف 12–18/.test(rate), true);
  const doc = fs.readFileSync(ROOT + 'CLAUDE.md', 'utf8');
  t('والدستور يقولها', /\*\*12 – 18\*\*/.test(doc), true);
}

console.log(`
${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
