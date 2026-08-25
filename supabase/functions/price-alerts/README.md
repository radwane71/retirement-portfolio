# `price-alerts` — تنبيهات دخول منطقة التخفيف أو التصفية

دالة مجدولة تفحص أسعار أسهمك دورياً، وترسل **بريداً + إشعار متصفح (Web Push)**
عند دخول سهم **منطقة التخفيف** أو **منطقة التصفية** — ولا شيء غيرهما.

---

## ما تفعله بالضبط

| المنطقة | الشرط | المصدر |
|---|---|---|
| 🟡 التخفيف | `السعر ≥ trim_from` | `portfolio_tasks` حيث `status = 'active'` |
| 🔴 التصفية | `السعر ≥ liquidate_above` | `portfolio_tasks` حيث `status = 'active'` |

**منطقة التجميع (`accumulate_at`) لا تُرسل إشعاراً إطلاقاً** — قرار المالك.

المناطق تُقرأ **طازجة من قاعدة البيانات في كل تشغيل**. أي سهم جديد تضيف له
حدّاً، أو أي حدّ تعدّله، يدخل المراقبة تلقائياً بلا أي إعداد في الدالة.
إن وُجدت أكثر من مهمة نشطة لنفس الرمز، تُعتمد **الأحدث** (`updated_at` ثم `created_at`).

---

## قاعدة «مرة واحدة حتى يخرج ويعود»

إشعار واحد عند **دخول** المنطقة، ثم صمت تام. لا يتكرّر إلا إذا خرج السعر من
المنطقة ثم دخلها مجدداً. الحالة محفوظة في جدول `alert_state` لا في الذاكرة —
الدالة تُقتل بين التشغيلات فذاكرة العملية لا تصلح لهذا.

```
حدود 2222: تخفيف ≥ 25 · تصفية ≥ 32

سعر 20  →  لا شيء                        trim: مُسلَّح      liquidate: مُسلَّح
سعر 27  →  📧 إشعار «دخل التخفيف»         trim: مُطفأ       liquidate: مُسلَّح
سعر 28  →  صمت (مُطفأ)                    trim: مُطفأ       liquidate: مُسلَّح
سعر 30  →  صمت (مُطفأ)                    trim: مُطفأ       liquidate: مُسلَّح
سعر 33  →  📧 إشعار «دخل التصفية»         trim: مُطفأ       liquidate: مُطفأ
سعر 34  →  صمت (كلاهما مُطفأ)             trim: مُطفأ       liquidate: مُطفأ
سعر 24  →  خرج ⇒ إعادة تسليح، بلا إرسال    trim: مُسلَّح      liquidate: مُسلَّح
سعر 26  →  📧 إشعار «دخل التخفيف» ثانيةً    trim: مُطفأ       liquidate: مُسلَّح
```

لكل منطقة تسليحها المستقلّ، فدخول التخفيف لا يُطفئ تسليح التصفية.

**استثناء مقصود:** إذا فشل الإرسال على **كل** القنوات، تبقى الإشارة مُسلَّحة
ليُعاد المحاولة في التشغيل التالي بدل ضياع التنبيه صامتاً. نزع التسليح يقع فقط
إذا نجحت قناة واحدة على الأقل، أو إذا لم تكن هناك قناة مفعَّلة أصلاً.

---

## الجداول (من `supabase/migrations/2026-08-25_price_alerts.sql`)

| الجدول | الغرض | المفتاح |
|---|---|---|
| `notification_prefs` | بريد المستخدم وتفعيل كل قناة | `user_id` |
| `push_subscriptions` | اشتراكات Web Push (جهاز/متصفح لكل صفّ) | `id` + `unique(user_id, endpoint)` |
| `alert_state` | **جدول إعادة التسليح** — `armed` لكل (سهم، منطقة) | `(user_id, ticker, zone)` |

RLS على الثلاثة تقصر كل صفّ على مالكه (`auth.uid() = user_id`).
الدالة تكتب بمفتاح الخدمة فتتجاوز RLS — السياسات للعميل.

**شغّل ملف المهاجرة أولاً** في Supabase SQL Editor (آمن لإعادة التشغيل).

---

## الأسرار المطلوبة

| السرّ | إلزامي | الوصف |
|---|---|---|
| `SERVICE_ROLE_KEY` | ✅ | مفتاح الخدمة (`SUPABASE_SERVICE_ROLE_KEY` مقبول كبديل) |
| `SUPABASE_URL` | ✅ | يُضبط تلقائياً في بيئة Supabase |
| `SUPABASE_ANON_KEY` | ✅ | يُضبط تلقائياً؛ يُستخدم للتحقق من توكن المستخدم |
| `RESEND_API_KEY` | للبريد | مفتاح Resend |
| `ALERT_FROM_EMAIL` | ✳️ | الافتراضي `onboarding@resend.dev` — **اقرأ قيد Resend أدناه** |
| `VAPID_PUBLIC_KEY` | للـpush | base64url، 65 بايت (نقطة P-256 غير مضغوطة) |
| `VAPID_PRIVATE_KEY` | للـpush | base64url لـ32 بايت، أو JWK كنصّ JSON |
| `VAPID_SUBJECT` | للـpush | `mailto:you@example.com` |
| `APP_ORIGIN` | ✳️ | أصل الموقع لرؤوس CORS (الافتراضي `http://localhost:8080`) |
| `APP_URL` | ✳️ | الرابط الذي يفتحه الإشعار عند النقر (الافتراضي = `APP_ORIGIN`) |

### توليد مفاتيح VAPID

```bash
npx web-push generate-vapid-keys
```

`publicKey` → `VAPID_PUBLIC_KEY` (ويُستخدم نفسه في العميل عند `pushManager.subscribe`)
`privateKey` → `VAPID_PRIVATE_KEY`

---

## ⚠️ قيد Resend على الخطة المجانية

بلا **نطاق موثَّق (verified domain)** في Resend:

- **المرسِل (`from`) يجب أن يكون `onboarding@resend.dev`** — أي عنوان آخر يُرفض بـ403.
- **المستقبِل (`to`) يجب أن يكون بريد حساب Resend نفسه** — البريد الذي سجّلت
  به في Resend. الإرسال لأي عنوان آخر يُرفض.

هذا يكفي تماماً لمحفظة شخصية (المالك هو المستقبِل الوحيد). لتوسيعها لاحقاً:
وثّق نطاقاً في Resend، ثم اضبط `ALERT_FROM_EMAIL` إلى عنوان على ذلك النطاق —
وعندها يزول قيد المستقبِل تلقائياً بلا تعديل كود.

تأكّد أن `notification_prefs.email` يحمل **بريد حساب Resend** بالضبط.

---

## النشر

```bash
# 1) المهاجرة (مرة واحدة) — الصق محتوى الملف في Supabase SQL Editor
#    supabase/migrations/2026-08-25_price_alerts.sql

# 2) الأسرار
supabase secrets set \
  SERVICE_ROLE_KEY="eyJ..." \
  RESEND_API_KEY="re_..." \
  ALERT_FROM_EMAIL="onboarding@resend.dev" \
  VAPID_PUBLIC_KEY="BJ..." \
  VAPID_PRIVATE_KEY="k1..." \
  VAPID_SUBJECT="mailto:radwane71@gmail.com" \
  APP_ORIGIN="https://your-app-domain" \
  APP_URL="https://your-app-domain/settings.html"

# 3) الدالة
supabase functions deploy price-alerts
```

`verify_jwt` يبقى **مفعَّلاً** — مفتاح الخدمة نفسه توكن JWT صالح، فالجدولة تمرّ.

---

## الجدولة

**التوقيت المقترح: كل 15 دقيقة في ساعات تداول تاسي** — الأحد إلى الخميس،
10:00–15:00 بتوقيت الرياض (UTC+3) ⇒ **07:00–12:00 UTC**.

`pg_cron` يعمل بـUTC، و`0-4` في خانة اليوم = الأحد إلى الخميس.

### الخيار (أ) — لوحة Supabase

Dashboard → **Integrations → Cron** → New job، ونوعه **Supabase Edge Function**،
والجدول `*/15 7-12 * * 0-4`.

### الخيار (ب) — SQL مباشرةً

```sql
-- الامتدادات (مرة واحدة)
CREATE EXTENSION IF NOT EXISTS pg_cron  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net   WITH SCHEMA extensions;

-- مفتاح الخدمة في الخزنة لا في نصّ المهمة الظاهر
SELECT vault.create_secret(
  'eyJ...ضع-مفتاح-الخدمة-هنا...',
  'price_alerts_service_key',
  'مفتاح الخدمة لجدولة price-alerts'
);

-- إلغاء أي جدولة سابقة بنفس الاسم (آمن للتكرار)
SELECT cron.unschedule('price-alerts-tasi')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'price-alerts-tasi');

-- كل 15 دقيقة، 07:00–12:00 UTC (10:00–15:00 الرياض)، الأحد–الخميس
SELECT cron.schedule(
  'price-alerts-tasi',
  '*/15 7-12 * * 0-4',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/price-alerts',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'price_alerts_service_key'
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
```

استبدل `<PROJECT_REF>` بمعرّف مشروعك.

**ملاحظة على الساعة 12 UTC:** `7-12` يشمل 12:00 و12:15 و12:30 و12:45 UTC
(15:00–15:45 الرياض) — أي بعد إغلاق السوق بقليل، وهذا **مقصود** ليلتقط سعر
مزاد الإغلاق. لو أردت التوقّف عند 15:00 الرياض بالضبط:
`*/15 7-11 * * 0-4` مع مهمة ثانية `0 12 * * 0-4`.

### متابعة التشغيلات

```sql
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'price-alerts-tasi')
ORDER BY start_time DESC LIMIT 20;
```

---

## شكل الطلب والرد

### 1) الفحص المجدول (بلا جسم)

```http
POST /functions/v1/price-alerts
Authorization: Bearer <SERVICE_ROLE_KEY>
```

```jsonc
{
  "ok": true,
  "mode": "scan",
  "usersChecked": 1,
  "tickersWatched": 14,
  "alertsSent": 2,          // إشعارات أُطلقت (وأُطفئ تسليحها)
  "rearmed": 1,             // إشارات خرجت من منطقتها فأُعيد تسليحها
  "emailsSent": 1,
  "push": { "sent": 2, "failed": 0, "removed": 1 },   // removed = اشتراكات منتهية حُذفت
  "priceSource": "yahoo",   // أو "stored (تعذّر ياهو)"
  "pricesFetched": 14,
  "errors": [],
  "errorCount": 0
}
```

يُقبل أيضاً `{"userId": "<uuid>"}` مع مفتاح الخدمة لفحص مستخدم بعينه.

### 2) الفحص اليدوي من العميل

نفس الطلب لكن بـ`Authorization: Bearer <توكن المستخدم>` — النطاق يُقصَر تلقائياً
على صاحب التوكن.

### 3) نداء الاختبار (من صفحة الإعدادات)

```http
POST /functions/v1/price-alerts
Authorization: Bearer <توكن المستخدم>
Content-Type: application/json

{ "test": true, "channel": "both" }     // "email" | "push" | "both"
```

يرسل رسالة تجريبية واضحة، و**لا يمسّ `alert_state` إطلاقاً**.

```jsonc
{
  "ok": true,
  "mode": "test",
  "channel": "both",
  "attempted": true,
  "email": "ok",                        // "ok" أو نصّ الخطأ
  "push": { "sent": 1, "failed": 0, "removed": 0, "subscriptions": 1 },
  "errors": []
}
```

إن لم تكن أي قناة مفعَّلة يرجع `ok: false` مع `note` تشرح السبب.

---

## حمولة Web Push

عامل الخدمة (service worker) يستقبل JSON بهذا الشكل:

```json
{ "title": "🔴 2222 — منطقة التصفية",
  "body":  "السعر 32.50 تجاوز الحدّ 29.00",
  "tag":   "tharwa-2222-liquidate",
  "url":   "https://your-app-domain/settings.html" }
```

`tag` يجمع إشعارات نفس السهم ونفس المنطقة فلا تتكدّس على الجهاز.
إشعار مجمَّع عند تعدّد الأسهم يحمل `tag: "tharwa-zones"`.

الاشتراك المنتهي (استجابة **404** أو **410**) يُحذف من `push_subscriptions`
ولا يُحسَب فشلاً.

---

## قرارات تقنية

**Web Push بلا مكتبة.** نُفِّذ RFC 8291 (تشفير `aes128gcm`) وVAPID (JWT بـES256)
مباشرةً على **Web Crypto API** المتاحة في Deno. السبب: صفر اعتماديات تُجلَب عند
الإقلاع البارد، وصفر مفاجآت في واجهة مكتبة لا يمكن تجريبها في هذه البيئة.
مكوّنات الخوارزمية (ECDH P-256، HKDF-SHA256، AES-GCM، ECDSA) كلها أصلية في
Web Crypto، والمعيار ثابت. تُحقِّق من الصحة بفكّ التشفير من طرف المتصفح:
النصّ المفكوك طابق الأصل، والتوقيع تحقّق بالمفتاح العام.

**الأسعار تُجلَب هنا لا عبر `update-prices`.** سببان:
1. `update-prices` يتحقّق من **توكن مستخدم** عبر `/auth/v1/user`، والجدولة لا
   تملك إلا مفتاح الخدمة — كنا سنضطر لتوليد توكن لكل مستخدم.
2. `update-prices` **يكتب** في `holdings`؛ ووظيفة التنبيه يجب أن تبقى قراءة
   محضة فلا تُفسد `price_manual` ولا `price_updated_at`.

المنطق مطابق (cookie + crumb + `/v7/finance/quote`)، وطلب ياهو **واحد** لاتحاد
كل الرموز عبر كل المستخدمين.

**فشل الجلب لا يُقابَل بصمت.** يُستخدم `holdings.current_price` المخزَّن،
ويُعلَن ذلك في الرسالة: وسم «(مخزَّن)» بجانب السعر في الجدول، وفقرة تحذير ⚠️
في أعلى البريد، و«(سعر مخزَّن)» في نصّ الـpush.

---

## الصلابة

- رؤوس **CORS في كل مسارات الخروج** بما فيها 401 و400 و500.
- **فشل قناة لا يمنع الأخرى** — البريد والـpush يُطلقان معاً عبر `Promise.allSettled`.
- **فشل مستخدم لا يوقف البقية** — كل مستخدم داخل `try/catch` مستقلّ.
- `try/catch` شامل يرجع 500 مع CORS.
- سجلّ الأخطاء في الرد مقصوص عند 50 مع `errorCount` للعدد الكامل.
- `userId` المُمرَّر بمفتاح الخدمة يُطابَق على شكل UUID قبل أن يدخل رابط PostgREST.

---

## ما لا تفعله هذه الدالة

- لا تُرسل شيئاً عن **منطقة التجميع**.
- لا تكتب في `holdings` ولا في `portfolio_tasks` — قراءة فقط.
- لا تُصدر توصية ولا قراراً. الرسالة تنصّ صراحةً أن القرار للمالك.
