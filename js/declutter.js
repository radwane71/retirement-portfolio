// ══════════════════════════════════════════════════════════════════════
// 🧹 طبقة التنقية — إخفاء نصوص الشرح خلف زر واحد
// ----------------------------------------------------------------------
// المالك 2026-08-22: «الموقع صار بوكس وداخله مقالات… أفتح الصفحة وأتشتّت من
// كثرة الكلام… أجلس أحوس عشان أطلّع رقم… أي حاجة ما أبغى أشوفها حطّ لها زر».
//
// المشكلة بنيوية لا تجميلية: الشرح كُتب ليكون **مُتاحاً** (الدستور §8: يُعلَن
// ولا يُكتم)، فكُتب **ظاهراً**. والفرق بين «متاح» و«ظاهر» هو ما ضاع.
// الحل يحفظ الاثنين: النص يبقى في الصفحة ويُقرأ بضغطة، ولا يزاحم الرقم.
//
// **لماذا طبقة واحدة لا تعديل 28 صفحة:** أغلب الشرح يولّده JS داخل innerHTML
// بعد الرسم، فتحريره في HTML لا يمسّه. وأي قسم جديد يُكتب لاحقاً سيُنقَّى
// تلقائياً بلا عمل إضافي.
//
// **ما لا يُخفى أبداً** (قرار صريح — الإخفاء لا يمسّ ما يغيّر قرارك):
//   • أي عنصر بحالة تحذير أو خطأ (data-state = bad / warn)
//   • رسائل «لا بيانات» (empty-state) — بلا شرح لا يعرف المالك ما ينقصه
//   • أي عنصر يحوي حقل إدخال أو زراً
//   • النصوص القصيرة (< 90 حرفاً) — هذه تسميات لا مقالات
//   • أي عنصر داخل نافذة منبثقة (هي أصلاً خلف ⓘ)
//   • أي عنصر عليه class="keep-visible" — مهرب صريح للمطوِّر
// ══════════════════════════════════════════════════════════════════════

(function () {
  const KEY = 'tharwa_prose_v1';          // '1' = الشروح ظاهرة
  const MIN_LEN = 90;                     // أقصر من هذا تسمية لا مقال

  // AUDIT 2026-08-23 — ثلاثة تدقيقات مستقلّة وصلت للنتيجة نفسها: أطول الشرح
  // الباقي ظاهراً يعيش في أوعية خارج هذه القائمة. `noteHtml()` و`meterHtml({foot})`
  // يولّدان أغلب النصّ المولَّد في المشروع، والقائمة لم تكن تشملهما — فبقيت
  // فقرات كاملة ظاهرة رغم وجود الطبقة، بينما تختفي أخواتها الأقصر.
  //
  // `.note:not([data-state])` مقصود: الملاحظة **بحالة** تحذير أو خطر تبقى
  // ظاهرة دائماً (وهي محميّة أصلاً في protectedEl) — والمستثنى هنا هو
  // الملاحظة الإعلامية المحضة.
  const SELECTORS = [
    'p.small.text-muted',
    'div.small.text-muted',        // كان `p` فقط — وأغلب المولَّد `div`
    '.sect-sub',
    '.info-note',
    '.de-d-note',
    '.hist-note',
    'p.text-muted',
    '.note:not([data-state])',     // noteHtml الإعلامية — أكبر وعاء شرح في المشروع
    '.legend',                     // مفاتيح الألوان: تشرح ما هو مكتوب في الجدول أصلاً
    '.meter-foot',                 // حاشية المقياس — شرح منهجية غالباً
    '.small.text-muted.mt-1',
    '.small.text-muted.mt-2',
    // أوعية الشرح في صفحات الأدوات والحاسبات — رصدها تدقيق 2026-08-23:
    'p.small',                     // فقرات forecast الشرحية (بلا text-muted)
    '.hint', '.field-hint',        // شرح تحت الحقل — ومعه زر ℹ️ يحمل النصّ نفسه
    '.pt-q-hint', '.method-note',  // تلميح فلسفي تحت السؤال · شرح المعادلات
    '.rule-card p', '.behavior-tip p', '.info-box p',   // مقالات invest-tips
  ].join(',');

  // ملاحظة مقصودة: إقرارات «أداة تعليمية لا توصية» (.legal-note / .disclaimer-note
  // / .tips-warning) **ليست** في القائمة رغم تكرارها أربع مرات. إخفاء إقرار خلف
  // زر قرارٌ لا يخصّ التنقية — يُحذف المكرَّر منه صراحةً، ولا يُطوى ضمنياً.

  function lsKey() {
    try { return (typeof userLsKey === 'function') ? userLsKey(KEY) : KEY; }
    catch (_) { return KEY; }
  }
  function isOn() {
    try { return localStorage.getItem(lsKey()) === '1'; } catch (_) { return false; }
  }
  function setOn(v) {
    try { localStorage.setItem(lsKey(), v ? '1' : '0'); } catch (_) {}
    apply();
  }

  // ⚠️ العلاقة بمكوّن الطيّ (`foldHtml` في utils.js — أُضيف 2026-08-27):
  // الطبقتان مستقلّتان ولا تتصادمان. التنقية مفتاح **عام** يُخفي الشروح
  // دفعةً واحدة، والطيّ يخصّ **كل كتلة** ويبقى متاحاً دائماً. و`.fold-body`
  // ليست في `SELECTORS` عمداً: هي مطويّة أصلاً، فإخفاؤها مرّتين يعني أن
  // النقر على العنوان لا يُظهر شيئاً. وعنوان الطيّ سطرٌ واحد لا مقال،
  // فيبقى ظاهراً في الحالتين — وهو الحدّ الأدنى الذي طلبه المالك:
  // «البطاقة تعرض بياناتها، وأنا إذا بغيت أكبّر».
  function protectedEl(el) {
    if (el.classList.contains('keep-visible')) return true;
    if (el.closest('.fold-body')) return true;   // داخل طيٍّ ⇒ لا تنقية فوق طيّ
    if (el.closest('.modal, .info-modal, .modal-overlay, dialog')) return true;
    if (el.closest('.empty-state')) return true;
    if (el.querySelector('input, select, textarea, button, a')) return true;
    // حالة تحذير/خطأ على العنصر أو على أقرب حاوية note
    const st = el.getAttribute('data-state') || el.closest('[data-state]')?.getAttribute('data-state');
    if (st === 'bad' || st === 'warn') return true;
    // نصّ **يبدأ** بإشارة تحذير = سطر تحذير حقيقي فيبقى ظاهراً مهما طال.
    // AUDIT 2026-08-23: كان الفحص على وجود الرمز في أي موضع، فأي فقرة شرحية
    // تذكر «⚠️» في وسطها تُعدّ تحذيراً وتُحصَّن من التنقية — وهو ما أبقى
    // حواشيَ طويلة ظاهرة أبداً رغم أنها ليست تحذيراً. البداية هي الفارق:
    // التحذير يفتتح بالرمز، والشرح يستشهد به.
    if (/^\s*[⚠️🔴⛔🚨❌]/.test(el.textContent || '')) return true;
    return false;
  }

  function mark(root) {
    let n = 0;
    (root || document).querySelectorAll(SELECTORS).forEach(el => {
      if (el.dataset.prose) return;                       // مُعلَّم سابقاً
      if (protectedEl(el)) { el.dataset.prose = 'keep'; return; }
      if ((el.textContent || '').trim().length < MIN_LEN) { el.dataset.prose = 'keep'; return; }
      el.dataset.prose = '1';
      n++;
    });
    return n;
  }

  function apply() {
    document.body.classList.toggle('prose-off', !isOn());
    const btn = document.getElementById('prose-toggle');
    if (btn) {
      const on = isOn();
      const count = document.querySelectorAll('[data-prose="1"]').length;
      btn.textContent = on ? '🧹 أخفِ الشروح' : `📖 اعرض الشروح${count ? ` (${count})` : ''}`;
      btn.title = on
        ? 'إخفاء نصوص الشرح والإبقاء على الأرقام'
        : 'النصوص لم تُحذف — اضغط لعرضها. التحذيرات ورسائل «لا بيانات» تظل ظاهرة دائماً.';
    }
  }

  function injectButton() {
    if (document.getElementById('prose-toggle')) return;
    const host = document.querySelector('.page-header') || document.querySelector('main');
    if (!host) return;
    const btn = document.createElement('button');
    btn.id = 'prose-toggle';
    btn.type = 'button';
    btn.className = 'btn btn-secondary btn-sm';
    btn.style.cssText = 'margin-inline-start:auto;white-space:nowrap';
    btn.onclick = () => setOn(!isOn());
    host.appendChild(btn);
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { mark(); apply(); }, 120);
  }

  function boot() {
    injectButton();
    mark();
    apply();
    // أغلب الشرح يُحقن بعد الرسم — نراقب ونُعلّم الجديد
    try {
      new MutationObserver(muts => {
        if (muts.some(m => m.addedNodes && m.addedNodes.length)) schedule();
      }).observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.Declutter = { toggle: () => setOn(!isOn()), isOn, mark, apply };
})();
