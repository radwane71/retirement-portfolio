// ══════════════════════════════════════════════════════════════════════
// الإشعارات: تظهر مقروءة، وتختفي بعد 15 ثانية
// ----------------------------------------------------------------------
// بلاغ المالك 2026-08-24: «تجيني إشعارات على اليسار كنقط… زي نقط مخفية،
// أبغاها تظهر وبعد 15 ثانية تختفي».
//
// كان التصميم بُقعةً 14px لا تتوسّع إلا بالمرور بالفأرة — فمن لا يمرّ
// عليها (وكل مستخدم جوّال) يرى نقطاً مبهمة ولا يقرأ رسالة واحدة.
// إشعارٌ لا يُقرأ إلا بالبحث عنه ليس إشعاراً.
//
// ⚠️ الرقمان مرتبطان: مدّة `setTimeout` في js/utils.js ومدّة
// `animation: toast-shrink` في css/style.css. افتراقهما يجعل الشريط
// يفرغ والإشعار باقياً، أو الإشعار يختفي والشريط في منتصفه.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const JS  = fs.readFileSync(ROOT + 'js/utils.js', 'utf8');
const CSS = fs.readFileSync(ROOT + 'css/style.css', 'utf8');

let ok = 0, bad = 0;
const t = (n, got, want) => { const p = Object.is(got, want); p ? ok++ : bad++;
  console.log((p ? 'PASS ' : 'FAIL ') + n + `  → ${JSON.stringify(got)} (متوقَّع ${JSON.stringify(want)})`); };

// ── المدّتان متطابقتان ──
const msJs  = (JS.match(/const TOAST_MS = (\d+);/) || [])[1];
const msCss = (CSS.match(/animation: toast-shrink (\d+)s linear/) || [])[1];
t('مدّة الإشعار في الشيفرة', msJs, '15000');
t('ومدّة الشريط في CSS',     msCss, '15');
t('والرقمان متطابقان',       Number(msJs) / 1000, Number(msCss));

// ── لم يعد بُقعة: العرض الافتراضي حقيقي ──
const block = CSS.slice(CSS.indexOf('.toast-item {'), CSS.indexOf('.toast-item.visible'));
t('العرض الافتراضي ليس 14px', /width:\s*14px/.test(block), false);
t('بل عرض مقروء',             /width:\s*min\(340px/.test(block), true);
t('ولا ارتفاع 14px',          /height:\s*14px/.test(block), false);
t('ولا استدارة كاملة',        /border-radius:\s*50%/.test(block), false);

// ── جسم الرسالة ظاهر بلا مرور فأرة ──
const bodyCss = CSS.slice(CSS.indexOf('.toast-item .toast-body {'),
                          CSS.indexOf('.toast-item .toast-msg {'));
t('جسم الرسالة غير شفّاف افتراضياً', /opacity:\s*0;/.test(bodyCss), false);
const msgCss = CSS.slice(CSS.indexOf('.toast-item .toast-msg {'),
                         CSS.indexOf('.toast-item.success .toast-body'));
t('والنصّ يُلَفّ ولا يُقصّ', /white-space:\s*normal/.test(msgCss), true);

// ── المرور بالفأرة يوقف العدّاد (وإلا اختفى وسط القراءة) ──
t('المرور يوقف الشريط', /\.toast-item:hover \.toast-timer \{ animation-play-state: paused/.test(CSS), true);
t('والنقر يُثبّته',      /\.toast-item\.expanded \.toast-timer \{ animation-play-state: paused/.test(CSS), true);

// ── الظهور لا يعتمد على rAF وحدها ──
// مُتحقَّق منه في المتصفّح: في مستند مخفيّ لا تُنفَّذ rAF ولا تبدأ حركات
// CSS، فكان الإشعار يبقى شفافاً ثم يُحذف بعد 15 ثانية بلا أن يراه أحد.
t('يوجد حارس setTimeout للظهور', /setTimeout\(show, \d+\);/.test(JS), true);
t('ولا يعتمد على rAF وحدها',
  /requestAnimationFrame\(\(\) => item\.classList\.add\('visible'\)\)/.test(JS), false);
// ⚠️ الحركة تُجمّد العنصر على حالة البداية في مستند مخفيّ مهما كان fill-mode
t('الظهور بانتقال لا بحركة', /\.toast-item \{[^}]*transition:[^}]*opacity/.test(CSS), true);
t('ولا animation على الشفافية', /\.toast-item \{[^}]*animation:\s*toast-in/.test(CSS), false);

// ══ سلوك التوقيت الفعلي ══
// utils.js يشغّل IIFEs تلمس DOM كاملاً عند التحميل، فبناء DOM مبسَّط
// يتعثّر فيها. نستخرج `showToast` وحدها ونشغّلها في سياق مضبوط.
{
  const i = JS.indexOf('function showToast(');
  let d = 0, k = JS.indexOf('{', i);
  for (; k < JS.length; k++) { if (JS[k] === '{') d++; else if (JS[k] === '}') { d--; if (!d) break; } }
  const NL = String.fromCharCode(10);
  const src = 'const TOAST_MS = ' + msJs + ';' + NL
            + JS.slice(i, k + 1) + NL
            + 'function dismissToast(){}';

  const timers = [];
  const mk = () => ({
    _html: '', className: '', style: {}, children: [], _ev: {},
    classList: { _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c) { if (this._s.has(c)) { this._s.delete(c); return false; } this._s.add(c); return true; } },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    appendChild(c) { this.children.push(c); return c; },
    querySelector: () => ({ textContent: '', addEventListener() {} }),
    addEventListener(ev, fn) { (this._ev[ev] = this._ev[ev] || []).push(fn); },
    remove() {},
  });
  const ctx = {
    console, Object, Set,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    requestAnimationFrame: fn => { fn(); return 0; },
    document: { getElementById: () => null, createElement: () => mk(), body: mk() },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'showToast' });
  ctx.showToast('رسالة اختبار', 'info');
  const auto = timers.filter(x => !x.cleared).pop();
  t('العدّاد التلقائي 15 ثانية', auto && auto.ms, 15000);
  // العدّادات المشروعة اثنان فقط: حارس الظهور (60ms) والاختفاء (15s).
  // أي ثالث يعني مدّةً مخفيّة تتحكّم بالإشعار من حيث لا يُرى.
  const kinds = [...new Set(timers.filter(x => !x.cleared).map(x => x.ms))].sort((a, b) => a - b);
  t('حارس الظهور موجود',        kinds[0], 60);
  t('ولا مدّة ثالثة خفيّة',      kinds.length, 2);
  t('والثانية هي مدّة الاختفاء', kinds[1], 15000);
}

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
