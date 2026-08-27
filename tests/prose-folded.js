// ══════════════════════════════════════════════════════════════════════
// لا كتلة شرح طويلة مكشوفة — بطلب المالك 2026-08-27
// ----------------------------------------------------------------------
// «مضيّعتني كأنه كتاب ومقال أجلس أقرأه كل يوم… حطها minimized، أنا إذا
// بغيت أنا أكبّر». القاعدة: البطاقة تعرض بياناتها، والشرح خلف نقرة.
//
// العتبة **موضوعية**: عدد الحروف العربية داخل كتلة نصّية واحدة. وهي
// عالية عمداً (٤٠٠ حرف ≈ فقرة كاملة) حتى لا يعاقب الفحصُ سطرَ شرحٍ
// مشروعاً — الهدف الكتلة التي تُقرأ مقالاً لا الجملة التي تُقرأ عنواناً.
//
// ⚠️ ما لا يخضع للعتبة:
//   • ما هو **داخل** <details> أصلاً (مطويّ)
//   • ملاحظة بحالة `data-state` أو `noteHtml(..., 'warn'|'bad'|…)` —
//     التحذير والإفصاح لا يُخفيان خلف نقرة (م.20)
//   • نوافذ ⓘ المنبثقة — هي أصلاً خلف نقرة
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;

const MAX_AR = 400;
const FILES = [
  'js/dashboard.js', 'js/dividends.js', 'js/performance.js', 'js/forecast.js',
  'js/decision-engine.js',
  'dashboard.html', 'dividends.html', 'performance.html', 'forecast.html',
  'decision-engine.html',
];

let ok = 0, bad = 0;
const t = (n, cond, extra) => { cond ? ok++ : bad++;
  console.log((cond ? 'PASS ' : 'FAIL ') + n + (cond ? '' : `  ← ${extra || ''}`)); };

const arLen = s => (s.match(/[\u0600-\u06FF]/g) || []).length;

// مُطابِق أقواس متوازن — regex وحده يقطع نداءات noteHtml المتداخلة
function callEnd(s, open) {
  let d = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === '(') d++;
    else if (s[k] === ')') { d--; if (!d) return k; }
  }
  return -1;
}

const offenders = [];

FILES.forEach(f => {
  const p = ROOT + f;
  if (!fs.existsSync(p)) return;
  const s = fs.readFileSync(p, 'utf8');

  // مدى كائن CARD_INFO — محتواه يُعرض داخل نافذة ℹ️ لا على البطاقة،
  // فهو خلف نقرة أصلاً ولا يخضع للعتبة.
  let ciFrom = s.indexOf('window.CARD_INFO'), ciTo = -1;
  if (ciFrom >= 0) {
    let d = 0, started = false;
    for (let k = ciFrom; k < s.length; k++) {
      if (s[k] === '{') { d++; started = true; }
      else if (s[k] === '}') { d--; if (started && !d) { ciTo = k; break; } }
    }
  }
  const inCardInfo = idx => ciFrom >= 0 && ciTo > ciFrom && idx > ciFrom && idx < ciTo;

  const insideFold = idx => {
    if (inCardInfo(idx)) return true;
    const before = s.slice(0, idx);
    return before.lastIndexOf('<details') > before.lastIndexOf('</details>');
  };

  // ① نداءات noteHtml الإعلامية (بلا حالة)
  for (const m of s.matchAll(/noteHtml\(/g)) {
    const open = m.index + m[0].length - 1;
    const end = callEnd(s, open);
    if (end < 0) continue;
    const body = s.slice(open + 1, end);
    if (/,\s*'(warn|bad|good|best|info)'\s*$/.test(body.trim())) continue;   // بحالة ⇒ يبقى
    const txt = body.replace(/<[^>]+>/g, '').replace(/\$\{[^}]*\}/g, '');
    const n = arLen(txt);
    if (n > MAX_AR && !insideFold(m.index)) {
      offenders.push(`${f}:${s.slice(0, m.index).split('\n').length} — noteHtml ${n} حرفاً`);
    }
  }

  // ② فقرات ومربّعات الشرح في الترميز
  const tagRe = /<(p|div)\b[^>]*class="[^"]*(?:small|sect-sub|de-d-note|hint|info-note)[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
  for (const m of s.matchAll(tagRe)) {
    const txt = m[2].replace(/<[^>]+>/g, '').replace(/\$\{[^}]*\}/g, '');
    const n = arLen(txt);
    if (n > MAX_AR && !insideFold(m.index)) {
      offenders.push(`${f}:${s.slice(0, m.index).split('\n').length} — <${m[1]}> ${n} حرفاً`);
    }
  }
});

if (offenders.length) offenders.forEach(o => console.log('   ' + o));
t(`لا كتلة شرح مكشوفة تتجاوز ${MAX_AR} حرفاً`, offenders.length === 0,
  `${offenders.length} كتلة — لُفَّها بـfoldHtml()`);

// المكوّن نفسه موجود ومعرَّف مرة واحدة
const U = fs.readFileSync(ROOT + 'js/utils.js', 'utf8');
t('foldHtml معرَّفة في نظام التصميم', /^function foldHtml\(/m.test(U));
t('ولا نسخة ثانية تُظلّلها',
  FILES.filter(f => f.endsWith('.js') && f !== 'js/utils.js')
       .every(f => !/^function foldHtml\(/m.test(fs.readFileSync(ROOT + f, 'utf8'))));
const CSS = fs.readFileSync(ROOT + 'css/style.css', 'utf8');
t('وأنماطها في نظام التصميم لا سطرية', /^\.fold\s*\{/m.test(CSS) && /\.fold-body\s*\{/.test(CSS));
t('والسهم يدور عند الفتح', /\.fold\[open\]\s*>\s*summary::after/.test(CSS));
t('والتركيز بلوحة المفاتيح مرئي', /\.fold\s*>\s*summary:focus-visible/.test(CSS));

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
