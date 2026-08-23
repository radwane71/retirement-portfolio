// ══════════════════════════════════════════════════════════════════════
// اختبار دخان: يحمّل سكربتات كل صفحة بترتيبها ويبحث عن نداءٍ لدالة مفقودة
// ----------------------------------------------------------------------
// وُلد هذا الفحص من عطل حقيقي: `noteHtml` كانت مكرَّرة في 11 ملفاً
// وغائبة عن `utils.js` و`decision-engine.js`. استعمالها في المحرّك أسقط
// `runEngine` كاملاً بـReferenceError — فماتت الصفحة، لا قسمٌ منها.
// وكل الفحوص الساكنة مرّت لأنها تطابق نصوصاً ولا تُشغّل شيئاً.
//
// **كيف يعمل:** يحمّل سكربتات الصفحة في vm بـDOM وهمي، ثم يفحص كل اسم
// يُستدعى في الملف: إن لم يكن معرَّفاً محلياً ولا موجوداً في السياق بعد
// التحميل، فهو نداءٌ لدالة غير موجودة.
//
// السياق الحقيقي هو ما يجعل الفحص دقيقاً: كل ما عرّفته utils.js ووحدتا
// الدستور صار موجوداً فيه، فلا يُبلَّغ عنه زوراً.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;

let ok = 0, bad = 0;
const t = (n, cond, extra) => { cond ? ok++ : bad++;
  console.log((cond ? 'PASS ' : 'FAIL ') + n + (cond ? '' : '  ← ' + (extra || ''))); };

// ── DOM وهمي ──
function mkEl() {
  const el = { _html: '', _text: '', value: '', checked: false, style: {}, dataset: {},
    classList: { add(){}, remove(){}, toggle(){}, contains: () => false }, children: [], _attr: {},
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    setAttribute(k, v) { this._attr[k] = v; }, getAttribute(k) { return this._attr[k] ?? null; },
    appendChild(c) { this.children.push(c); return c; },
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, closest: () => null,
    focus() {}, scrollIntoView() {}, remove() {}, insertAdjacentHTML() {} };
  return el;
}
function mkCtx() {
  const errs = [];
  const ctx = {
    console: { log(){}, info(){}, debug(){}, warn(){}, error(...a) { errs.push(a.join(' ')); } },
    Math, Object, Array, Number, String, Boolean, Date, JSON, Set, Map, WeakMap,
    Promise, RegExp, Error, Intl, URL, URLSearchParams, TextEncoder, TextDecoder,
    isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, atob, btoa,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, queueMicrotask() {},
    document: { readyState: 'complete', body: mkEl(), documentElement: mkEl(),
      getElementById: () => mkEl(), querySelector: () => null, querySelectorAll: () => [],
      createElement: () => mkEl(), addEventListener() {}, removeEventListener() {},
      createTextNode: () => ({}) },
    localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; },
      setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: 'http://x/', pathname: '/', search: '', hash: '' },
    navigator: { userAgent: 'node', clipboard: { writeText: () => Promise.resolve() } },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
    alert() {}, confirm: () => true, prompt: () => null, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    Chart: function () { return { destroy() {}, update() {} }; },
    XLSX: { utils: {}, write: () => '', read: () => ({}) },
    supabase: { createClient: () => ({}) },
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    Blob: function () {}, FileReader: function () {}, FormData: function () {},
    performance: { now: () => 0 },
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.top = ctx;
  vm.createContext(ctx);
  return { ctx, errs };
}

// تجريد التعليقات والسلاسل — بدونه يُبلَّغ عن rgba() في CSS و not() في
// جملة عربية داخل تعليق. الضجيج يقتل الحارس أسرع من الثغرة.
// ⚠️ محارف الهروب هنا تُكتب عبر رموزها (NL/BSL) عمداً: كتابتها مُهرَّبة
// داخل جراحة نصّية أفسدت هذا الملف ثلاث مرات.
const NL = String.fromCharCode(10), BSL = String.fromCharCode(92);
function stripLiterals(src) {
  let out = '', i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== NL) i++; continue; }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === BSL) { i += 2; continue; }
        if (q === '`' && src[i] === '$' && src[i + 1] === '{') {
          let d = 1; i += 2; const st = i;
          while (i < n && d > 0) { if (src[i] === '{') d++; else if (src[i] === '}') d--; if (d > 0) i++; }
          out += ' ' + stripLiterals(src.slice(st, i)) + ' '; i++; continue;
        }
        i++;
      }
      i++; out += ' _S_ '; continue;
    }
    out += c; i++;
  }
  return out;
}

// أسماء مُعرَّفة محلياً في الملف (لا تُعدّ مفقودة)
function localNames(src) {
  const s = new Set();
  const add = re => { let m; const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(src))) { for (let i = 1; i < m.length; i++) if (m[i]) s.add(m[i]); } };
  add(/(?:^|\s)(?:async\s+)?function\s*\*?\s*([\w$]+)/gm);
  add(/(?:^|[\s;{(,])(?:const|let|var)\s+([\w$]+)/gm);
  add(/([\w$]+)\s*(?::|=)\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)/g);
  add(/\(\s*([\w$]+)\s*(?:,|\))\s*=>/g);          // معاملات الأسهم
  add(/function[^(]*\(([^)]*)\)/g);                // معاملات الدوال
  add(/\(function\s+([\w$]+)/g);                   // IIFE مسمّاة
  add(/(?:^|[\s(,=])([\w$]+)\s*=>/gm);             // معامل سهم بلا أقواس
  add(/^\s*([\w$]+)\s*\([^)]*\)\s*\{/gm);        // اختصار توابع الكائن
  const out = new Set();
  s.forEach(v => String(v).split(/[,\s]+/).forEach(x => { const c = x.replace(/[^\w$].*$/, ''); if (c) out.add(c); }));
  return out;
}

// سكربتات الصفحة بترتيبها، محليةً فقط
function pageScripts(html) {
  return [...html.matchAll(/<script\s+src="([^"]+)"/g)]
    .map(m => m[1].split('?')[0])
    .filter(p => !/^https?:/.test(p))
    .filter(p => fs.existsSync(ROOT + p));
}

// كلمات لغة وآثار تجريد وCSS — ليست نداءات دوال
const IGNORE = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function',
  'await', 'new', 'do', 'else', 'delete', 'void', 'in', 'of', 'yield', 'async',
  'var',    // CSS: var(--x) داخل قوالب نصّية
  'rgba',   // CSS
  '_S_',    // بديل السلسلة بعد التجريد
  // التعابير النمطية لا تُجرَّد (تمييزها عن القسمة يحتاج مُحلِّلاً كاملاً)،
  // فما بداخلها يظهر كنداء. مُتحقَّق منهما يدوياً:
  'at',     // js/reconcile.js — داخل /(Buy|Sell) of … at …/
  'diworsification',  // js/dashboard.js — داخل تعليق يحوي عربية تكسر التجريد
]);

const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const problems = [];
let scanned = 0;

pages.forEach(page => {
  const html = fs.readFileSync(ROOT + page, 'utf8');
  const scripts = pageScripts(html);
  if (!scripts.length) return;
  scanned++;
  const { ctx, errs } = mkCtx();
  const loadFail = [];
  scripts.forEach(f => {
    try { vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }); }
    catch (e) { loadFail.push(`${f}: ${e.constructor.name}: ${e.message}`); }
  });
  if (loadFail.length) { problems.push({ page, kind: 'تحميل', detail: loadFail.join(' | ') }); return; }

  // نداءات لأسماء غير موجودة في السياق بعد التحميل
  scripts.filter(f => f.startsWith('js/')).forEach(f => {
    const raw = fs.readFileSync(ROOT + f, 'utf8');
    const src = stripLiterals(raw);
    const locals = localNames(raw);
    const called = new Set([...src.matchAll(/(?<![.\w$'"`])([a-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
    const missing = [...called].filter(n =>
      !locals.has(n) && typeof ctx[n] === 'undefined'
      && !IGNORE.has(n));
    missing.forEach(n => problems.push({ page, kind: 'نداء مفقود', detail: `${f} → ${n}()` }));
  });
});

t('فُحصت صفحات فعلاً', scanned > 20, 'العدد = ' + scanned);

// دالة نعرف أنها كانت مفقودة ثم أُصلحت — سلامة الأداة
{
  const { ctx } = mkCtx();
  ['js/utils.js'].forEach(f => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx, { filename: f }));
  t('utils.js يوفّر noteHtml للجميع', typeof ctx.noteHtml === 'function',
    'كان غيابها يُسقط runEngine كاملاً');
  t('ويوفّر kvsHtml', typeof ctx.kvsHtml === 'function');
}

const uniq = [...new Map(problems.map(p => [p.kind + p.detail, p])).values()];
if (uniq.length) {
  console.log('\n=== مشاكل ===');
  uniq.slice(0, 40).forEach(p => console.log(`  ✗ [${p.page}] ${p.kind}: ${p.detail}`));
  if (uniq.length > 40) console.log(`  … و${uniq.length - 40} أخرى`);
}
t('لا خطأ تحميل ولا نداء مفقود', uniq.length === 0, uniq.length + ' مشكلة');

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
