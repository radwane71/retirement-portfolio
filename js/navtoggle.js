// ══════════════════════════════════════════════════════════════════════
// ↔️ طيّ شريط التنقّل — طلب المالك 2026-08-23
// ----------------------------------------------------------------------
// «ضيف زر في طرف البار، إذا ضغطت عليه يخفي البار بالكامل — نفس حركة كلاود».
//
// **طبقة واحدة لا تعديل 29 صفحة:** الشريط مكرَّر حرفياً في كل ملف HTML،
// وحقن الزر من JS يجعله يظهر في كل صفحة حالية ومستقبلية بلا عمل إضافي —
// نفس نهج js/declutter.js.
//
// **سطح المكتب وحده.** الجوّال (≤768px) له درج جانبي وزر همبرغر أصلاً
// (toggleMobileNav في utils.js)؛ إضافة طيّ ثانٍ فوقه تُنتج حالتين متضاربتين
// على العنصر نفسه. فالزر يختفي تحت 768px، وحالة الطيّ تُلغى عند التصغير.
//
// الحالة تُحفظ لكل مستخدم: من يطوي الشريط يجده مطويّاً في كل صفحة يفتحها.
// واختصار Ctrl/⌘+B — العُرف السائد في المحرّرات ولوحات التحكم.
// ══════════════════════════════════════════════════════════════════════

(function () {
  const KEY = 'tharwa_nav_collapsed_v1';
  const MOBILE = '(max-width: 768px)';

  const lsKey = () => {
    try { return (typeof userLsKey === 'function') ? userLsKey(KEY) : KEY; }
    catch (_) { return KEY; }
  };
  const isMobile = () => window.matchMedia(MOBILE).matches;
  const isOn = () => {
    try { return localStorage.getItem(lsKey()) === '1'; } catch (_) { return false; }
  };

  function apply(on, persist) {
    // على الجوّال لا طيّ إطلاقاً — الدرج يتكفّل بالإخفاء
    const eff = on && !isMobile();
    document.body.classList.toggle('nav-collapsed', eff);
    const btn = document.getElementById('nav-toggle');
    if (btn) {
      btn.textContent = eff ? '❯' : '❮';
      btn.setAttribute('aria-expanded', eff ? 'false' : 'true');
      btn.title = eff ? 'إظهار شريط التنقّل (Ctrl+B)' : 'إخفاء شريط التنقّل (Ctrl+B)';
      btn.setAttribute('aria-label', btn.title);
      btn.style.display = isMobile() ? 'none' : '';
    }
    if (persist) { try { localStorage.setItem(lsKey(), on ? '1' : '0'); } catch (_) {} }
  }

  function toggle() { apply(!document.body.classList.contains('nav-collapsed'), true); }

  function boot() {
    if (!document.querySelector('.sidebar')) return;      // صفحة بلا شريط
    if (!document.getElementById('nav-toggle')) {
      const btn = document.createElement('button');
      btn.id = 'nav-toggle';
      btn.type = 'button';
      btn.onclick = toggle;
      document.body.appendChild(btn);
    }
    apply(isOn(), false);

    // Ctrl/⌘+B — لا يعترض الكتابة داخل حقل
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || (e.key !== 'b' && e.key !== 'B')) return;
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (el && el.isContentEditable) return;
      e.preventDefault();
      toggle();
    });

    // تغيّر المقاس: نُعيد التطبيق فلا تبقى حالة سطح المكتب عالقة على الجوّال
    try { window.matchMedia(MOBILE).addEventListener('change', () => apply(isOn(), false)); }
    catch (_) { window.addEventListener('resize', () => apply(isOn(), false)); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.NavToggle = { toggle, isOn };
})();
