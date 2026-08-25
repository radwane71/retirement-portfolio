/* ══════════════════════════════════════════════════════════════════════
   ثروة — عامل الخدمة (Service Worker)
   ----------------------------------------------------------------------
   غرضه **واحد فقط**: استقبال إشعارات Push من الدالة السحابية `price-alerts`
   وعرضها، وفتح الصفحة الصحيحة عند الضغط عليها.

   ⚠️ قرار مقصود: **لا تخزين مؤقت (cache) لأي أصل — إطلاقاً.**
   الموقع كلّه يعتمد على `?v=` في وسوم <script> و<link> لكسر كاش المتصفح
   عند كل نشر. عامل خدمة يعترض `fetch` ويخدم من الكاش يُبطل هذه الآلية
   تماماً: يبقى المستخدم على نسخة قديمة من js/css بعد النشر، ولا يشفع
   تحديث `?v=` لأن الطلب لا يصل الشبكة أصلاً. وأسوأ من ذلك أن التشخيص
   يصير مستحيلاً — «حدّثت الصفحة ولم يتغيّر شيء» بلا سبب ظاهر.
   ولهذا: **لا مستمع `fetch` هنا، ولا caches.open، ولا precache manifest.**
   من يضيف تخزيناً مؤقتاً لاحقاً عليه أن يحلّ مشكلة الإصدارات أولاً.

   يبقى الملفّ في **جذر** الموقع كي يكون نطاقه (scope) كامل الموقع.
   ══════════════════════════════════════════════════════════════════════ */

'use strict';

// كل المسارات تُشتقّ من موقع sw.js نفسه لا من جذر النطاق، كي يعمل الملف
// أيضاً لو نُشر الموقع تحت مسار فرعي (‎/tharwa/‎ مثلاً).
const SW_BASE        = self.location.href;                                   // …/sw.js
const SW_TAG_PREFIX  = 'tharwa-alert';
const DEFAULT_URL    = new URL('dashboard.html',      SW_BASE).href;
const ICON_URL       = new URL('apple-touch-icon.png', SW_BASE).href;
const BADGE_URL      = new URL('favicon-32x32.png',    SW_BASE).href;

// ── دورة الحياة ───────────────────────────────────────────────────────
// skipWaiting + clients.claim: أي نسخة جديدة من هذا الملف تتولّى فوراً
// بلا انتظار إغلاق كل التبويبات. آمن هنا لأن الملف لا يخدم أصولاً.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// ── فكّ الحمولة بأمان ─────────────────────────────────────────────────
// الدالة السحابية ترسل JSON: { title, body, tag, url }
// لكن الحمولة قد تصل نصّاً عادياً، أو فارغة (بعض المتصفحات ترسل push
// بلا بيانات)، أو JSON تالفاً. في كل هذه الحالات نعرض إشعاراً مفهوماً
// بدل أن ينهار المستمع صامتاً فلا يرى المالك شيئاً ولا يعرف لماذا.
function parsePayload(event) {
  const fallback = {
    title: 'ثروة — تنبيه سعري',
    body : 'وصل تنبيه من محفظتك. افتح لوحة التحكم لمعرفة التفاصيل.',
    tag  : SW_TAG_PREFIX,
    url  : DEFAULT_URL,
  };

  if (!event || !event.data) return fallback;

  let raw = '';
  try {
    raw = event.data.text();
  } catch (_) {
    return fallback;
  }
  if (!raw || !String(raw).trim()) return fallback;

  let obj = null;
  try {
    obj = JSON.parse(raw);
  } catch (_) {
    // نصّ عادي لا JSON — نعرضه متناً ونُبقي العنوان الافتراضي.
    return Object.assign({}, fallback, { body: String(raw).slice(0, 300) });
  }

  if (!obj || typeof obj !== 'object') {
    return Object.assign({}, fallback, { body: String(raw).slice(0, 300) });
  }

  const str = (v, d) => (typeof v === 'string' && v.trim() ? v.trim() : d);
  return {
    title: str(obj.title, fallback.title),
    body : str(obj.body,  fallback.body),
    // tag يجمّع إشعارات السهم الواحد: إشعار جديد لنفس الرمز يستبدل السابق
    // بدل أن تتراكم عشرة إشعارات لسهم واحد.
    tag  : str(obj.tag,   fallback.tag),
    url  : str(obj.url,   fallback.url),
  };
}

// ── استقبال Push ─────────────────────────────────────────────────────
self.addEventListener('push', event => {
  const p = parsePayload(event);

  const options = {
    body: p.body,
    icon: ICON_URL,
    badge: BADGE_URL,
    tag: p.tag,
    // النسخة الجديدة تحلّ محلّ القديمة لنفس الوسم، مع تنبيه مسموع/مرئي
    // (renotify بلا tag يرمي خطأ — والوسم مضمون هنا).
    renotify: true,
    dir: 'rtl',
    lang: 'ar',
    requireInteraction: false,
    data: { url: p.url, tag: p.tag, at: Date.now() },
  };

  event.waitUntil(
    self.registration.showNotification(p.title, options).catch(() => {
      // لو فشل العرض لأي سبب (خيارات غير مدعومة في متصفح قديم مثلاً)
      // نُعيد المحاولة بأبسط شكل ممكن بدل ألّا يصل الإشعار إطلاقاً.
      return self.registration.showNotification(p.title, { body: p.body, dir: 'rtl', lang: 'ar' });
    })
  );
});

// ── الضغط على الإشعار ────────────────────────────────────────────────
// الأصل: تركيز تبويب مفتوح على الموقع بدل فتح تبويب جديد في كل مرة.
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data   = event.notification.data || {};
  const target = typeof data.url === 'string' && data.url ? data.url : DEFAULT_URL;

  let targetUrl;
  try {
    targetUrl = new URL(target, SW_BASE);
  } catch (_) {
    targetUrl = new URL(DEFAULT_URL);
  }
  // لا نفتح وجهة خارج نطاق الموقع مهما قالت الحمولة.
  if (targetUrl.origin !== self.location.origin) {
    targetUrl = new URL(DEFAULT_URL);
  }
  const href = targetUrl.href;

  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // 1) تبويب على نفس الصفحة تماماً → ركّز عليه فقط.
    for (const c of list) {
      if (c.url === href && 'focus' in c) return c.focus();
    }
    // 2) أي تبويب على الموقع → وجّهه للصفحة المطلوبة ثم ركّز.
    for (const c of list) {
      let sameOrigin = false;
      try { sameOrigin = new URL(c.url).origin === self.location.origin; } catch (_) {}
      if (sameOrigin && 'focus' in c) {
        if ('navigate' in c) {
          try { const n = await c.navigate(href); return (n || c).focus(); } catch (_) {}
        }
        return c.focus();
      }
    }
    // 3) لا تبويب مفتوح → افتح واحداً.
    if (self.clients.openWindow) return self.clients.openWindow(href);
  })());
});

// إغلاق الإشعار بلا ضغط: لا إجراء — مسجَّل صراحةً كي لا يُظنّ أنه نُسي.
self.addEventListener('notificationclose', () => {});
