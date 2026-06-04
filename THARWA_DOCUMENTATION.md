# ثروة — توثيق شامل كامل
> آخر تحديث: 2026-06-04 | الإصدار الحالي: master

---

## فهرس المحتويات

1. [نظرة عامة على التطبيق](#1-نظرة-عامة)
2. [البنية التقنية](#2-البنية-التقنية)
3. [قاعدة البيانات — الجداول الكاملة](#3-قاعدة-البيانات)
4. [localStorage — المفاتيح الكاملة](#4-localstorage)
5. [تسجيل الدخول والمصادقة](#5-تسجيل-الدخول)
6. [لوحة التحكم — dashboard](#6-لوحة-التحكم)
7. [سجل المعاملات — transactions](#7-سجل-المعاملات)
8. [الأرباح الموزعة — dividends](#8-الأرباح-الموزعة)
9. [التدفقات النقدية — cashflows](#9-التدفقات-النقدية)
10. [قاعدة بيانات أسهمي — userdb](#10-قاعدة-بيانات-أسهمي)
11. [أهداف الأسهم والقطاعات — targets](#11-أهداف-الأسهم-والقطاعات)
12. [أسهم تحت المراقبة — watchlist](#12-أسهم-تحت-المراقبة)
13. [الرؤية المستقبلية — forecast](#13-الرؤية-المستقبلية)
14. [الأداء التاريخي — performance](#14-الأداء-التاريخي)
15. [مهام المحفظة — tasks](#15-مهام-المحفظة)
16. [دفتر المراجعة — review-log](#16-دفتر-المراجعة)
17. [صافي الثروة — networth](#17-صافي-الثروة)
18. [مقسّم الراتب — salary](#18-مقسم-الراتب)
19. [العقارات — realestate](#19-العقارات)
20. [الصكوك — sukuk](#20-الصكوك)
21. [أهداف الحياة — life-goals](#21-أهداف-الحياة)
22. [مخزون المنزل — inventory](#22-مخزون-المنزل)
23. [المتابعة المدرسية — school](#23-المتابعة-المدرسية)
24. [متابعة كندة — school-kanda](#24-متابعة-كندة)
25. [مزامنة المعاملات — reconcile](#25-مزامنة-المعاملات)
26. [أدوات التحليل والحسابات](#26-أدوات-التحليل)
27. [الإعدادات — settings](#27-الإعدادات)
28. [لوحة الإدارة — admin](#28-لوحة-الإدارة)
29. [الخوارزميات الرئيسية](#29-الخوارزميات-الرئيسية)
30. [النسخ الاحتياطي والاستعادة](#30-النسخ-الاحتياطي)
31. [utils.js — الوظائف المشتركة](#31-utils)
32. [الأمان والبنية الدفاعية](#32-الأمان)
33. [Edge Function — تحديث الأسعار](#33-edge-function)

---

## 1. نظرة عامة

**ثروة** هو تطبيق ويب شخصي لتتبع وتحليل المحفظة الاستثمارية وإدارة الثروة الكاملة. مبني بـ HTML/CSS/JavaScript خالص (بدون فريمووركات) مع Supabase كقاعدة بيانات وخدمة مصادقة.

### الهدف
أداة حسابية شخصية — لا تقدم توصيات استثمارية ولا خدمات مالية. كل المدخلات يدوية من المستخدم.

### الصفحات الكاملة (29 صفحة)

| الملف | الوظيفة | التخزين |
|---|---|---|
| `index.html` | تسجيل الدخول / إنشاء حساب | Supabase Auth |
| `dashboard.html` | لوحة التحكم الرئيسية | Supabase |
| `transactions.html` | سجل المعاملات (شراء/بيع/منح) | Supabase |
| `dividends.html` | الأرباح الموزعة | Supabase |
| `cashflows.html` | التدفقات النقدية (إيداع/سحب) | Supabase |
| `userdb.html` | قاعدة بيانات أسهمي الشخصية | Supabase |
| `targets.html` | أهداف الأوزان وإعادة التوازن | Supabase |
| `watchlist.html` | أسهم تحت المراقبة | Supabase |
| `forecast.html` | الرؤية المستقبلية (4 سيناريوهات) | Supabase + localStorage |
| `performance.html` | الأداء التاريخي + مقارنة تاسي | Supabase + localStorage |
| `tasks.html` | مهام المحفظة | Supabase |
| `review-log.html` | دفتر المراجعة (مع مرفقات) | Supabase |
| `networth.html` | صافي الثروة | Supabase |
| `salary.html` | مقسّم الراتب | localStorage |
| `realestate.html` | العقارات | Supabase |
| `sukuk.html` | الصكوك والاستثمارات الثابتة | localStorage |
| `life-goals.html` | أهداف الحياة | localStorage |
| `inventory.html` | مخزون المنزل | localStorage |
| `school.html` | المتابعة المدرسية (متعدد أبناء) | localStorage |
| `school-kanda.html` | متابعة مخصصة لكندة | localStorage |
| `reconcile.html` | مزامنة مع كشف الوسيط | — (عرض فقط) |
| `avg-calculator.html` | حاسبة متوسط سعر الشراء | — (لا تخزين) |
| `stock-valuation.html` | تقدير القيمة العادلة للأسهم | — (لا تخزين) |
| `portfolio-rating.html` | تقييم أمان المحفظة | — (لا تخزين) |
| `emergency-fund.html` | حاسبة صندوق الطوارئ | — (لا تخزين) |
| `invest-tips.html` | نصائح المستثمر | — (محتوى ثابت) |
| `settings.html` | الإعدادات والنسخ الاحتياطي | Supabase + localStorage |
| `admin.html` | لوحة الإدارة (للمدير فقط) | Supabase (admin tables) |
| `maintenance.html` | صفحة الصيانة | — (عرض فقط) |

---

## 2. البنية التقنية

```
Frontend:  HTML5 + CSS3 + JavaScript (ES2020) — بدون فريمووركات
Backend:   Supabase (PostgreSQL + Auth + Edge Functions + RLS)
Charts:    Chart.js v4.4
Excel:     SheetJS (xlsx v0.18.5)
Storage:   Supabase (بيانات محمية) + localStorage (إعدادات وبيانات محلية)
Auth:      Supabase Auth (email/password)
Deploy:    GitHub Pages / أي استضافة ثابتة
Dev:       Node.js server.js (منفذ 8080)
```

### ملفات JS المشتركة (تُحمَّل في كل صفحة)

| الملف | الحجم | المحتوى |
|---|---|---|
| `js/supabase.js` | صغير | تهيئة Supabase client (URL + anon key) |
| `js/auth.js` | صغير | `requireAuth()`, `logout()`, فحص الصيانة |
| `js/utils.js` | 29 KB | دوال مشتركة: تنسيق، XIRR، theme، nav، inline editing، toast |

### ملفات JS الخاصة بكل صفحة

| الملف | الحجم |
|---|---|
| `js/dashboard.js` | 162 KB |
| `js/settings.js` | 85 KB |
| `js/dividends.js` | 75 KB |
| `js/performance.js` | 60 KB |
| `js/forecast.js` | 59 KB |
| `js/targets.js` | 40 KB |
| `js/salary.js` | 38 KB |
| `js/transactions.js` | 33 KB |
| `js/school.js` | 32 KB |
| `js/networth.js` | 31 KB |
| `js/utils.js` | 29 KB |
| `js/tickerdb.js` | 25 KB |
| `js/admin.js` | 27 KB |
| `js/review-log.js` | 23 KB |
| `js/sukuk.js` | 22 KB |
| `js/tasks.js` | 19 KB |
| `js/reconcile.js` | 16 KB |
| `js/life-goals.js` | 11 KB |
| `js/cashflows.js` | 9 KB |
| `js/inventory.js` | 8.6 KB |
| `js/userdb.js` | 8.3 KB |
| `js/realestate.js` | 7.7 KB |
| `js/watchlist.js` | 6.7 KB |
| `js/school-kanda.js` | 13 KB |

### Dev Server — server.js

خادم Node.js للتطوير المحلي:
- المنفذ: 8080
- حماية path traversal: يرفض أي مسار يخرج عن جذر المشروع
- MIME types: html, css, js, json, png, jpg, svg
- رؤوس أمان: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`

---

## 3. قاعدة البيانات

### أ) جداول المستخدمين (16 جدول — محمية بـ RLS)

كل جدول يحتوي على `user_id UUID FK → auth.users` ومحمي بـ:
```sql
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id)
```

#### `holdings` — المحفظة الحالية

| العمود | النوع | الوصف |
|---|---|---|
| `id` | UUID PK | معرّف تلقائي |
| `user_id` | UUID FK | مرتبط بـ auth.users |
| `ticker` | TEXT | رمز السهم (مثال: 1120) |
| `name` | TEXT | اسم السهم |
| `sector` | TEXT | القطاع |
| `shares` | NUMERIC | عدد الأسهم المتبقية |
| `avg_price` | NUMERIC | متوسط سعر الشراء (WAC) — **بدون عمولة** |
| `current_price` | NUMERIC | السعر الحالي |
| `target_weight` | NUMERIC | الوزن المستهدف % |
| `price_updated_at` | TIMESTAMPTZ | وقت آخر تحديث للسعر |

> **مهم:** `avg_price` لا يشمل العمولة — يُستخدم `transactions.total` لحسابات الربح/الخسارة الدقيقة.

#### `transactions` — سجل المعاملات

| العمود | النوع | الوصف |
|---|---|---|
| `date` | DATE | تاريخ المعاملة |
| `ticker` | TEXT | رمز السهم |
| `type` | TEXT | `buy` / `sell` / `grant` |
| `shares` | NUMERIC | عدد الأسهم |
| `price` | NUMERIC | سعر السهم |
| `commission` | NUMERIC | العمولة (حد أقصى 100 ر.س) |
| `vat` | NUMERIC | ضريبة القيمة المضافة 15% على العمولة |
| `total` | NUMERIC | شراء: `price×shares+comm+vat` / بيع: `price×shares−comm−vat` / منحة: `0` |
| `is_archived` | BOOLEAN | أرشفة ناعمة — لا حذف حقيقي |

#### `dividends` — الأرباح الموزعة

| العمود | النوع | الوصف |
|---|---|---|
| `date` | DATE | تاريخ الاستلام |
| `ticker` | TEXT | رمز السهم |
| `amount` | NUMERIC | المبلغ الإجمالي (ليس للسهم الواحد) |
| `month` | INT | شهر التوزيع (1–12) |
| `year` | INT | سنة التوزيع |
| `is_archived` | BOOLEAN | — |

#### `cashflow_entries` — التدفقات النقدية

| العمود | النوع | الوصف |
|---|---|---|
| `date` | DATE | — |
| `type` | TEXT | `deposit` / `withdrawal` |
| `amount` | NUMERIC | المبلغ |
| `notes` | TEXT | ملاحظات |
| `is_archived` | BOOLEAN | — |

#### `net_worth_snapshots` — لقطات صافي الثروة

| العمود | النوع | الوصف |
|---|---|---|
| `date` | DATE | تاريخ اللقطة |
| `total_value` | NUMERIC | إجمالي صافي الثروة |
| `notes` | TEXT | `auto-YYYY-MM` = تلقائي من الداشبورد |
| `snapshot_json` | JSONB | تفاصيل (اختياري) |

#### `nw_assets` — أصول صافي الثروة

| العمود | النوع | الوصف |
|---|---|---|
| `category` | TEXT | `bank` / `sukuk` / `vehicle` / `other` |
| `name` | TEXT | اسم الأصل |
| `value` | NUMERIC | القيمة ر.س |
| `is_active` | BOOLEAN | أرشفة ناعمة |

#### `nw_liabilities` — التزامات صافي الثروة

| العمود | النوع | الوصف |
|---|---|---|
| `category` | TEXT | `credit_card` / `loan` / `mortgage` / `other` |
| `name` | TEXT | اسم الالتزام |
| `value` | NUMERIC | المبلغ ر.س |
| `is_active` | BOOLEAN | أرشفة ناعمة |

#### `real_estate` — العقارات

| العمود | النوع | الوصف |
|---|---|---|
| `name` | TEXT | اسم العقار |
| `type` | TEXT | نوع العقار |
| `purchase_value` | NUMERIC | تكلفة الشراء |
| `current_value` | NUMERIC | القيمة الحالية (يدوي) |
| `status` | TEXT | `owned` / `rented` / `sold` |
| `monthly_rental` | NUMERIC | الإيجار الشهري |
| `purchase_date` | DATE | تاريخ الشراء |
| `is_active` | BOOLEAN | أرشفة ناعمة |

#### `user_stocks` — قاعدة أسهمي الشخصية

| العمود | النوع | الوصف |
|---|---|---|
| `ticker` | TEXT | الرمز |
| `name` | TEXT | الاسم |
| `sector` | TEXT | القطاع |
| `in_portfolio` | BOOLEAN | هل موجود حالياً في المحفظة |

#### `stock_targets` — أهداف الأسهم

| العمود | النوع | الوصف |
|---|---|---|
| `ticker` | TEXT | — |
| `target_pct` | NUMERIC | الوزن المستهدف % |
| `entry_price` | NUMERIC | سعر منطقة الشراء (اختياري) |
| `exit_price` | NUMERIC | سعر منطقة البيع (اختياري) |

#### `sector_targets` — أهداف القطاعات

| العمود | النوع | الوصف |
|---|---|---|
| `sector` | TEXT | اسم القطاع |
| `target_pct` | NUMERIC | الوزن المستهدف % |

#### `watchlist` — قائمة المراقبة

| العمود | النوع | الوصف |
|---|---|---|
| `ticker` | TEXT | — |
| `name` | TEXT | — |
| `sector` | TEXT | — |
| `target_price` | NUMERIC | سعر الدخول المستهدف |
| `planned_pct` | NUMERIC | النسبة المخطط تخصيصها % |
| `notes` | TEXT | — |

#### `portfolio_cash` — نقد المحفظة

| العمود | النوع | الوصف |
|---|---|---|
| `amount` | NUMERIC | المبلغ النقدي عند الوسيط |
| `last_updated` | TIMESTAMPTZ | آخر تحديث |

#### `portfolio_tasks` — مهام المحفظة

| العمود | النوع | الوصف |
|---|---|---|
| `type` | TEXT | `liquidation`/`reduction`/`monitoring`/`accumulation`/`hold` |
| `ticker` | TEXT | رمز السهم (اختياري) |
| `status` | TEXT | `active`/`done`/`cancelled` |
| `notes` | TEXT | — |
| `target_price` | NUMERIC | سعر مستهدف |
| `reduction_pct` | NUMERIC | نسبة التخفيف % |
| `year` | INT | سنة المهمة |
| `auto_generated` | BOOLEAN | أنشأها النظام تلقائياً؟ |
| `closed_at` | TIMESTAMPTZ | وقت الإغلاق |

#### `review_log` — سجل المراجعات

| العمود | النوع | الوصف |
|---|---|---|
| `id` | UUID PK | **محفوظ في الباكب** (FK مرجعية) |
| `ticker` | TEXT | رمز السهم |
| `review_date` | DATE | تاريخ المراجعة |
| `notes` | TEXT | نص المراجعة |

#### `review_log_attachments` — مرفقات المراجعات

| العمود | النوع | الوصف |
|---|---|---|
| `id` | UUID PK | **محفوظ في الباكب** |
| `entry_id` | UUID FK → review_log.id | — |
| `filename` | TEXT | اسم الملف |
| `ext` | TEXT | `txt`/`md`/`xlsx`/`csv` |
| `content` | TEXT | محتوى base64 أو نص |
| `size_bytes` | INT | الحجم (حد أقصى 2MB) |

#### `user_settings` — إعدادات المزامنة عبر الأجهزة

| العمود | النوع | الوصف |
|---|---|---|
| `user_id` | UUID FK | — |
| `key` | TEXT | اسم الإعداد |
| `value` | TEXT (JSON) | القيمة بصيغة JSON |
| `updated_at` | TIMESTAMPTZ | — |

> PK مركّب على `(user_id, key)` — upsert تلقائي.

---

### ب) جداول الإدارة (10 جداول — محمية بـ `is_admin = true`)

#### `user_profiles` — ملفات المستخدمين

| العمود | النوع | الوصف |
|---|---|---|
| `id` | UUID PK = auth.users.id | — |
| `email` | TEXT | — |
| `status` | TEXT | `active`/`suspended`/`banned`/`deleted` |
| `last_seen` | TIMESTAMPTZ | يُحدَّث عند كل تسجيل دخول |
| `created_at` | TIMESTAMPTZ | — |

#### `site_config` — إعدادات الموقع

| العمود | النوع | الوصف |
|---|---|---|
| `key` | TEXT PK | مثال: `maintenance_mode` |
| `value` | TEXT | `true`/`false` أو نص |

#### `consent_logs` — سجلات الموافقة (غير قابلة للتعديل)

| العمود | الوصف |
|---|---|
| `user_id`, `email` | — |
| `consented_at` | وقت الموافقة |
| `ip_address` | — |
| `terms_version` | إصدار الشروط |

#### `data_erasure_requests` — طلبات حذف البيانات

| العمود | الوصف |
|---|---|
| `user_id`, `email` | — |
| `status` | `pending`/`executed`/`rejected` |
| `requested_at`, `executed_at` | — |

#### `deletion_requests` — طلبات حذف الحساب

| العمود | الوصف |
|---|---|
| `user_id`, `email`, `reason` | — |
| `created_at` | — |

#### `support_tickets` — تذاكر الدعم

| العمود | الوصف |
|---|---|
| `user_id`, `subject`, `description` | — |
| `browser` | بيانات المتصفح |
| `status` | `open`/`resolved` |
| `created_at`, `resolved_at` | — |

#### `admin_audit_logs` — سجل إجراءات المدير (غير قابل للتعديل)

| العمود | الوصف |
|---|---|
| `admin_id` | UUID المدير |
| `action_type` | مثال: `SUSPEND_USER`, `BLOCK_IP`, `EXECUTE_ERASURE` |
| `target_user_id` | المستخدم المستهدف |
| `action_details` | وصف الإجراء |
| `ip_address` | — |
| `created_at` | — |

#### `admin_broadcasts` — التنبيهات الجماعية

| العمود | الوصف |
|---|---|
| `admin_id` | — |
| `target` | `all`/`active`/`specific` |
| `subject`, `body` | — |
| `sent_at` | — |

#### `failed_login_attempts` — محاولات الدخول الفاشلة

| العمود | الوصف |
|---|---|
| `email`, `ip_address` | — |
| `attempt_count` | عدد المحاولات |
| `last_attempt` | — |

#### `blocked_ips` — عناوين IP المحظورة

| العمود | الوصف |
|---|---|
| `ip_address`, `email` | — |
| `blocked_at`, `blocked_by` | — |

---

## 4. localStorage

جميع المفاتيح مُقيَّدة بـ `userLsKey(k)` = `u:{userId}:{key}` لعزل بيانات كل مستخدم على نفس الجهاز. المفاتيح مشمولة في النسخة الاحتياطية **100%**:

| المفتاح | النوع | الوصف |
|---|---|---|
| `tharwa-theme` | string | `dark` / `light` |
| `tharwa-zoom` | string | حجم الخط px (افتراضي: 15) |
| `tharwa-alert-green` | string | عتبة التنبيه الأخضر % (افتراضي: 1) |
| `tharwa-alert-yellow` | string | عتبة التنبيه الأصفر % (افتراضي: 3) |
| `portfolio_cash_v1` | JSON | `{amount, updated_at}` — cache نقد المحفظة |
| `retirement_goal_v1` | JSON | `{monthly, swr}` — هدف التقاعد / FIRE |
| `salary_planner_v1` | JSON | `{categories[], entries[]}` — مقسّم الراتب |
| `sukuk_planner_v1` | JSON | `{opportunities[]}` — بيانات الصكوك |
| `life_goals_v1` | JSON | `[{id,title,area,status,progress,...}]` |
| `inventory_v1` | JSON | `[{id,name,cat,loc,cond,...}]` |
| `school_tracker_v2` | JSON | `{children[{id,name,goals,years,grades...}]}` |
| `school_kanda_v1` | JSON | `{profile,lifeGoals,schoolGoals,years,subjects,grades}` |
| `nav_groups_v1` | JSON | حالة فتح/إغلاق مجموعات الناف بار |
| `tharwa-price-timestamps` | JSON | `{ticker: ISO_timestamp}` — وقت آخر تحديث للسعر |
| `tharwa-benchmark_v1` | JSON | `[{date, value}]` — قيم مؤشر تاسي اليدوية |
| `tharwa-benchmark-seeded-v1` | string | `true` = تمت بذرة بيانات تاسي الأولى |
| `tharwa_emergency_backup` | JSON | نسخة طارئة تُحفظ تلقائياً قبل أي restore |

---

## 5. تسجيل الدخول

**الملف:** `index.html` / `js/auth.js`

### وظائف auth.js

```javascript
requireAuth()
// 1. supabaseClient.auth.getSession()
// 2. إذا لا جلسة → redirect لـ index.html
// 3. يضبط window._currentUserId للاستخدام في userLsKey()
// 4. يُحدِّث last_seen في user_profiles
// 5. يُظهر رابط لوحة الإدارة إذا كان user_metadata.is_admin === true
// 6. يتحقق من maintenance_mode في site_config → redirect لـ maintenance.html
// 7. يُعيد user object

logout()
// supabaseClient.auth.signOut() + redirect لـ index.html
```

### عمليات تسجيل الدخول

| العملية | الدالة |
|---|---|
| تسجيل دخول | `supabaseClient.auth.signInWithPassword()` → redirect للداشبورد |
| إنشاء حساب | `supabaseClient.auth.signUp()` → بريد تأكيد |
| نسيت كلمة المرور | `supabaseClient.auth.resetPasswordForEmail()` → بريد استعادة |

### تدفق الأمان

```
كل صفحة:
  requireAuth() ─→ لا جلسة? ─→ index.html
                ─→ وضع صيانة + غير مدير? ─→ maintenance.html
                ─→ ✅ تحميل الصفحة
```

---

## 6. لوحة التحكم

**الملف:** `dashboard.html` / `js/dashboard.js`

### البيانات المُحمَّلة (Promise.all)

```
holdings, transactions, dividends, cashflow_entries,
net_worth_snapshots (آخر لقطة), real_estate,
stock_targets, sector_targets, portfolio_cash
```

### بانر تنبيهات إعادة التوازن

- يحسب انحراف كل سهم عن وزنه المستهدف
- يظهر تلقائياً إذا تجاوز أي سهم العتبة الخضراء
- ألوان: أصفر (> عتبة الأخضر) / أحمر (> عتبة الأصفر)
- يعرض أسوأ 4 انحرافات + رابط مباشر لصفحة إعادة التوازن
- يتحدث عند: فتح الصفحة، تحديث الأسعار، تعديل أي سهم

### بطاقات KPI — الصف الأول

| البطاقة | الحساب |
|---|---|
| إجمالي قيمة المحفظة | `Σ(shares × current_price) + portfolio_cash` |
| نقد المحفظة | من `portfolio_cash` — Supabase أو localStorage كـ fallback |
| قيمة العقارات | `Σ(current_value)` للعقارات غير المباعة |
| صافي الثروة | آخر قيمة من `net_worth_snapshots` |

### بطاقات KPI — الصف الثاني

**تبويب رأس المال:**
- رأس المال المنشغل = إجمالي شراء − إجمالي بيع (من `transactions.total`)
- تكلفة الوسيط (WAC) = `Σ(shares × avg_price)`

**تبويبات العائد التوزيعي (4 تبويبات):**

| التبويب | الحساب |
|---|---|
| Forward (افتراضي) | آخر DPS × الدورية × الأسهم الحالية |
| العائد المُسنوى | أرباح السنة × (365÷الأيام المنقضية) ÷ رأس المال أول يناير |
| YOC | TTM ÷ تكلفة الحيازات × 100 |
| العائد السوقي | أرباح السنة مُسنواة ÷ القيمة السوقية |

### XIRR — موقع الحساب

```
المدخلات: كل شراء (سالب)، بيع (موجب)، توزيع (موجب)، القيمة الحالية (موجب)
الخوارزمية: Newton-Raphson → Binary Search (في utils.js → computeXIRR)
المخرج: معدل العائد الداخلي السنوي الحقيقي %
```

### بطاقة هدف FIRE

**المدخلات:** المصاريف الشهرية + نسبة السحب الآمن SWR%

```
المحفظة المطلوبة = (المصاريف × 12) ÷ (SWR ÷ 100)
نسبة الإنجاز    = صافي الثروة ÷ المحفظة المطلوبة × 100
المتبقي          = المحفظة المطلوبة − صافي الثروة
```

**التخزين:** `retirement_goal_v1` في localStorage

### جدول الحيازات

**الأعمدة:** الرمز | الاسم | القطاع | الأسهم | متوسط التكلفة | السعر الحالي | تكلفة الحيازة | القيمة السوقية | ر/خ % | الوزن | المستهدف | حالة التنبيه | آخر تحديث

**تعديل inline:** كل خلية قابلة للتعديل بنقرة (مع allowlist أمان في utils.js)

**تحديث الأسعار:**
- يدوي: نقرة على خلية السعر
- تلقائي: Supabase Edge Function `update-prices`
- تنبيه أسعار قديمة: أكثر من 7 أيام بدون تحديث (`STALE_DAYS = 7`)
- تنبيه فشل التحديث: toast يُظهر رموز الأسهم التي لم تُحدَّث (H-6)
- تنبيه مناطق الشراء/البيع: نافذة عند وصول السعر للمنطقة

### مزامنة المحفظة من المعاملات

```
recomputeHoldingFromTx(ticker):
  يعيد حساب holdings.shares و holdings.avg_price من الصفر
  يحافظ على: current_price, sector, target_weight
  يُصحح: shares + WAC
```

### التسجيل التلقائي للقيمة (Auto Snapshot)

- مرة واحدة كل شهر عند فتح الداشبورد
- يحفظ في `net_worth_snapshots` بـ `notes = "auto-YYYY-MM"`
- يبني تاريخ أداء حقيقي لصفحة الأداء

### الرسوم البيانية

| الرسم | الأوضاع | الوصف |
|---|---|---|
| توزيع القطاعات | donut / bars / cards | الوزن الحالي لكل قطاع |
| خريطة الأوزان | bars / gap / cards / table | الحالي vs المستهدف |
| الدخل حسب القطاع | stacked bar | توزيع الأرباح المتوقعة |
| تخصيص الأصول | pie | أسهم + عقارات + نقد + صكوك + أصول |
| نقطة التعادل | summary / detail / bars | متى يتعادل كل سهم بالأرباح |

---

## 7. سجل المعاملات

**الملف:** `transactions.html` / `js/transactions.js`

### إضافة معاملة فردية

| الحقل | النوع | ملاحظة |
|---|---|---|
| التاريخ | date | افتراضي: اليوم |
| رمز السهم | text | يملأ الاسم تلقائياً |
| النوع | select | شراء / بيع / أسهم منحة |
| عدد الأسهم | number | — |
| السعر | number | يُقفل = 0 للمنحة |
| العمولة | number (auto) | محسوبة من `calcCommission()` |
| VAT | number (auto) | محسوبة |
| الإجمالي | number (auto) | محسوب |

**حساب العمولة:**
```
COMMISSION_RATE = 0.0015  (قابل للتعديل — راجع عقد الوسيط)
commission = min( shares × price × COMMISSION_RATE , 100 )
vat        = commission × 0.15
total_buy  = shares × price + commission + vat
total_sell = shares × price − commission − vat
total_grant = 0
```

**تأثير على holdings:**
- شراء: يزيد الأسهم + يُعيد حساب WAC
- منحة: يزيد الأسهم بدون تغيير avg_price (تكلفة صفر)
- بيع: يُنقص الأسهم، يحذف السهم عند الصفر

### إضافة جملة (Bulk Staging)

- جدول تفاعلي بأي عدد صفوف
- كل صف يحسب العمولة/الإجمالي تلقائياً
- حفظ دفعة واحدة

### تعديل / أرشفة معاملة

- تعديل → modal → بعد الحفظ: `recomputeHoldingFromTx()` يُعيد الحساب من الصفر
- أرشفة: `is_archived = true` — لا حذف حقيقي أبداً
- بعد الأرشفة: `recomputeHoldingFromTx()` يُصحح holdings

### إحصائيات KPI

إجمالي العمليات | شراء + مبلغها | بيع + مبلغها | صفقات رابحة | صفقات خاسرة

---

## 8. الأرباح الموزعة

**الملف:** `dividends.html` / `js/dividends.js`

### المدخلات

| الحقل | الوصف |
|---|---|
| التاريخ | تاريخ الاستلام |
| الرمز | يملأ الاسم تلقائياً |
| المبلغ | الإجمالي المستلم (ليس للسهم الواحد) |
| الشهر | شهر التوزيع |
| السنة | سنة التوزيع |

### مؤشرات KPI

| المؤشر | الحساب |
|---|---|
| إجمالي الأرباح | `Σ(amount)` كل الأوقات |
| أرباح السنة الجارية | `Σ(amount)` للسنة الحالية |
| TTM | `Σ(amount)` آخر 12 شهراً فعلياً |
| YOC الفعلي | TTM ÷ تكلفة الحيازات × 100 |
| Forward | `Σ(DPS × دورية × أسهم حالية)` لكل سهم |

**حساب Forward بالتفصيل:**
```
لكل سهم محتفظ به:
  1. DPS = مبلغ آخر توزيعة ÷ أسهم وقتها
  2. الدورية من فجوة آخر توزيعتين:
     ≤105 يوم → ربع سنوي (×4)
     ≤210 يوم → نصف سنوي (×2)
     >210 يوم → سنوي (×1)
  3. Projected = DPS × الدورية × الأسهم الحالية
```

### الملخص السنوي

- عائد كل سنة = أرباح السنة ÷ رأس المال أول يناير
- السنة الجارية: عائد جزئي فعلي (بدون توسيع)

### درجة جودة التوزيعات (0–100 لكل سهم)

```
استمرارية (35): السنوات الفعلية ÷ السنوات المتوقعة × 35
نمو (35):       CAGR آخر 3–5 سنوات (≥8% → 35 | <−10% → 0)
ثبات (30):      (1 − CV) × 30  [CV = انحراف معياري ÷ متوسط]
```

### مؤشر ثقة البيانات

درجة 0–100: عمر رأس المال (45%) + سنوات الأرباح (35%) + تغطية Forward (20%)

---

## 9. التدفقات النقدية

**الملف:** `cashflows.html` / `js/cashflows.js`

### المدخلات

| الحقل | الخيارات |
|---|---|
| التاريخ | — |
| النوع | إيداع / سحب |
| المبلغ | — |
| الملاحظات | اختياري |

### الوظيفة الأساسية

تسجيل كل مبلغ يدخل/يخرج من حساب المحفظة — يُستخدم لـ:
- صافي رأس المال المُودَع (Capital Invested)
- حساب `buildCumulativeCapitalMap()` في performance.js
- Capital-Weighted Age في forecast.js

### إحصائيات

| المؤشر | الحساب |
|---|---|
| إجمالي الإيداعات | `Σ(amount)` حيث `type=deposit` |
| إجمالي السحوبات | `Σ(amount)` حيث `type=withdrawal` |
| صافي رأس المال | إيداعات − سحوبات |
| أرباح موزعة (عرض فقط) | قراءة فقط من dividends |

---

## 10. قاعدة بيانات أسهمي

**الملف:** `userdb.html` / `js/userdb.js`

قاعدة بيانات شخصية للأسهم المتابَعة — مستقلة عن المحفظة الفعلية.

### المدخلات

| الحقل | الوصف |
|---|---|
| الرمز | يملأ الاسم والقطاع تلقائياً من TICKER_DB |
| الاسم | — |
| القطاع | dropdown من OFFICIAL_SECTORS |

### الوظائف

- إضافة / تعديل / حذف أسهم
- عند تعارض رمز موجود: نافذة تأكيد
- الأسهم الموجودة في holdings تظهر ببادج "في المحفظة"
- تُستخدم في targets.html كـ "أسهم مخططة"

---

## 11. أهداف الأسهم والقطاعات

**الملف:** `targets.html` / `js/targets.js`

### أ) أهداف الأسهم

**المدخلات لكل سهم:**

| الحقل | الوصف |
|---|---|
| منطقة الشراء | سعر الدخول المستهدف (اختياري) |
| منطقة البيع | سعر الخروج المستهدف (اختياري) |
| الوزن المستهدف % | — |

**المخرجات:**
- الوزن الحالي % = `(shares × current_price) / totalValue × 100`
- حالة التنبيه: أخضر (≤ G%) / أصفر (≤ Y%) / أحمر (> Y%)

**التحقق عند الحفظ:**
- إجمالي الأهداف ≤ 100%
- منطقة الشراء < منطقة البيع

### ب) أهداف القطاعات

نفس المنطق للقطاعات — الوزن محسوب من `holdings.sector`

### ج) محرك إعادة التوازن

**المدخلات:**
- المبلغ المتاح (ر.س)
- طريقة التوزيع: بالتناسب / متساوٍ / الأولوية للأبعد
- فلتر منطقة الشراء (اختياري)

**الحساب:**
```
المرشحون: أسهم ناقصة عن هدفها > 0.05%

بالتناسب:
  المخصص = المبلغ × (فجوة_السهم ÷ Σ الفجوات)
  أسهم للشراء = floor(المخصص ÷ السعر)
```

**المخرج:** جدول — الرمز | أسهم تشتري | التكلفة | الوزن قبل/بعد | الفجوة المتبقية

---

## 12. أسهم تحت المراقبة

**الملف:** `watchlist.html` / `js/watchlist.js`

### المدخلات

| الحقل | الوصف |
|---|---|
| الرمز | يملأ الاسم والقطاع من user_stocks ثم TICKER_DB |
| سعر الاستهداف | سعر الدخول المستهدف |
| النسبة المخطط % | — |
| الملاحظات | — |

محفوظ في Supabase → مشمول في الباكب.

---

## 13. الرؤية المستقبلية

**الملف:** `forecast.html` / `js/forecast.js`

### البيانات التاريخية المحسوبة تلقائياً

```
القيمة الحالية      = Σ(shares × current_price)
التكلفة الأساسية   = Σ(shares × avg_price)
XIRR               = معدل العائد الداخلي الحقيقي
safeDivYield       = متوسط آخر سنتين ÷ القيمة الحالية
annCapGrowth       = XIRR − safeDivYield  (fallback: CAGR)
Capital-Weighted Age = عمر رأس المال المرجّح بالتدفقات
```

### المدخلات اليدوية

| الحقل | الافتراضي | الوصف |
|---|---|---|
| القيمة الحالية | من البيانات | نقطة البداية |
| إضافة شهرية | متوسط الإيداعات | DCA شهري |
| مبلغ فوري | 0 | إضافة فورية |
| أفق زمني | 35 سنة | — |
| إعادة استثمار الأرباح | ✅ | — |
| تعديل التضخم | ❌ | معدل التضخم % |
| عائد الأرباح (تجاوز) | من البيانات | يُلغي الحسابي |
| الهدف | 0 | قيمة محفظة أو دخل شهري |

### 4 سيناريوهات

| السيناريو | نمو رأس المال | عائد الأرباح |
|---|---|---|
| متحفظ 🛡️ | base × 0.60 | div × 0.70 |
| معتدل 📊 | base (XIRR) | safeDivYield |
| متفائل 🚀 | base + 4% | div + 1.5% |
| استثنائي ⚡ | base + 8% | div + 3% |

### محرك الإسقاط الشهري

```
لكل شهر:
  value *= (1 + monthly_cap_rate)        // نمو السعر
  div_earned = value × monthly_div_rate  // أرباح الشهر
  if reinvest: value += div_earned       // إعادة الاستثمار
  value += monthly_add                   // DCA
  if inflation: factor *= (1 + monthly_inf)
```

### مؤشر ثقة البيانات

درجة 0–100: عمر رأس المال (45%) + دورات الأرباح (35%) + التنويع (20%)

### المخرجات

- رسم خطي / لوغاريتمي / شريطي / بطاقات
- جدول المعالم: قيمة + دخل شهري لكل سنة
- لوحة الهدف: متى يصل كل سيناريو للهدف
- تفاصيل السيناريو: 13 مؤشراً

---

## 14. الأداء التاريخي

**الملف:** `performance.html` / `js/performance.js`

### البيانات المُحمَّلة

```
transactions, holdings, dividends, cashflow_entries, net_worth_snapshots
```

### ملاحظة معمارية — كاش buildPositionData

```javascript
// يُحسَب مرة واحدة لكل تحميل — يُستخدم من 4 دوال render
let _positionCache = null;
getPositionData()  // ← الواجهة الموحدة
buildPositionData() // ← الحساب الفعلي (يُستدعى مرة فقط)
// يُبطَّل الكاش عند إعادة تحميل البيانات
```

### تبويب 1 — المراكز المفتوحة

```
cost_of_remaining = avg_price × remaining_shares
market_value      = current_price × remaining_shares
unrealized_pnl    = market_value − cost_of_remaining
unrealized_pct    = unrealized_pnl ÷ cost_of_remaining × 100
partial_realized  = sell_revenue − (buy_avg × sold_shares)
total_return      = unrealized + partial_realized + dividends
```

### تبويب 2 — المراكز المغلقة

```
realized_pnl   = sell_revenue − buy_cost
realized_pct   = realized_pnl ÷ buy_cost × 100
total_return   = realized_pnl + dividends_received
hold_days      = parseDateLocal(last_sell) − parseDateLocal(first_buy)
```

> **ملاحظة أسهم المنحة:** grant لا تُضيف تكلفة لـ `buyCost` → `avgCost = buyCost ÷ total_shares` يتأثر بالأسهم الممنوحة ولكنه صحيح اقتصادياً (تكلفة صفر).

### تبويب 3 — التايم لاين الشهري

لكل شهر منذ أول معاملة:
- رأس المال التراكمي: من `buildCumulativeCapitalMap()` (prefix-sum O(M) لا O(N×M))
- قيمة المحفظة: من أقرب `net_worth_snapshot`
- أرباح الشهر | مشتريات | مبيعات | صافي الحركة

### تبويب 4 — الرسم البياني الشهري (4 أوضاع)

- مدمج: خط رأس المال + قيمة المحفظة + أعمدة الأرباح/المشتريات
- خطوط: رأس المال + أرباح تراكمية + مشتريات تراكمية
- مكدس: مشتريات + أرباح + مبيعات لكل شهر
- أرباح فقط: الشهري + التراكمي

### تبويب 5 — مقارنة بمؤشر تاسي

**المدخلات اليدوية:** تاريخ + قيمة تاسي

**خوارزمية المقارنة:**
```
1. ادمج تواريخ تاسي + مواعيد snapshots
2. لكل تاريخ: أقرب قيمة تاسي سابقة + أقرب snapshot سابق
3. احتفظ فقط بالنقاط ذات القيمتين معاً
4. نسّب كلاهما إلى 100 عند أول نقطة مشتركة
5. Alpha = عائد المحفظة − عائد تاسي
```

### Max Drawdown (من net_worth_snapshots)

```
لكل snapshot (مرتبة زمنياً):
  إذا value > peak → peak = value
  dd = (value − peak) / peak × 100
  maxDD = min(maxDD, dd)

تلوين: أحمر (< −15%) | أصفر (< −8%) | أخضر (≥ −8%)
```

**التخزين:** `tharwa-benchmark_v1` في localStorage

---

## 15. مهام المحفظة

**الملف:** `tasks.html` / `js/tasks.js`

### أنواع المهام

| النوع | الرمز | الوصف |
|---|---|---|
| `liquidation` | 🔴 | تصفية كاملة |
| `reduction` | ⚖️ | تخفيف نسبة |
| `monitoring` | 👁 | تحت المراقبة |
| `accumulation` | 🟢 | تجميع / إضافة |
| `hold` | 🔵 | احتفاظ |

### دورة الحياة

```
active → done (إغلاق مع تسجيل closed_at)
active → cancelled
```

لا حذف حقيقي — soft delete فقط.

### المهام التلقائية

- يولّدها النظام من انحرافات أهداف المحفظة
- `auto_generated = true` → تُعرض منفصلة

---

## 16. دفتر المراجعة

**الملف:** `review-log.html` / `js/review-log.js`

### المدخلات

| الحقل | الوصف |
|---|---|
| الرمز + الاسم + القطاع | — |
| تاريخ المراجعة | — |
| الملاحظات | نص حر |
| المرفقات | txt / md / xlsx / csv |

### القيود

- حد أقصى 2MB لكل إدخال (إجمالي المرفقات)
- حد أقصى 10 مرفقات لكل إدخال
- المحتوى محفوظ في Supabase كـ base64
- `batch=5` في الباكب (حفاظاً على حجم الطلب)

---

## 17. صافي الثروة

**الملف:** `networth.html` / `js/networth.js`

### مكونات الحساب

```
أسهم (تلقائي)      = Σ(shares × current_price)
عقارات (تلقائي)    = Σ(current_value) [غير المباعة]
أصول يدوية         = Σ(value) من nw_assets
─────────────────────────────────────────
إجمالي الأصول      = أسهم + عقارات + أصول
الالتزامات         = Σ(value) من nw_liabilities
─────────────────────────────────────────
صافي الثروة        = إجمالي الأصول − الالتزامات
```

### فئات الأصول اليدوية

حساب بنكي/نقدي | صكوك/سندات | مركبة | أخرى

### فئات الالتزامات

بطاقة ائتمان | قرض | رهن عقاري | أخرى

### اللقطات (Snapshots)

- إضافة يدوية: التاريخ + القيمة + ملاحظات
- تلقائية من dashboard.html مرة شهرياً (`notes = "auto-YYYY-MM"`)

---

## 18. مقسّم الراتب

**الملف:** `salary.html` / `js/salary.js`  
**التخزين:** `salary_planner_v1` في localStorage

### الفئات الافتراضية

| الفئة | اللون |
|---|---|
| مصاريف | أحمر |
| ادخار / طارئ | أخضر |
| أصول | أزرق |
| محفظة التقاعد | بنفسجي |

المستخدم يمكنه إضافة فئات مخصصة بألوانه.

### الإحصائيات

- متوسط الراتب الشهري
- إجمالي كل فئة + نسبتها
- فلتر بنطاق تاريخي

### الرسوم البيانية (4 رسوم)

مكدس + donut + أعمدة لكل فئة + مقارنة أشهر

---

## 19. العقارات

**الملف:** `realestate.html` / `js/realestate.js`

### المدخلات

| الحقل | الوصف |
|---|---|
| الاسم + النوع | فيلا / شقة / أرض / تجاري... |
| تكلفة الشراء | ر.س |
| القيمة الحالية | ر.س (يدوي) |
| الحالة | مملوك / مؤجر / مباع |
| الإيجار الشهري | ر.س |
| تاريخ الشراء | — |

### إحصائيات KPI

```
إجمالي القيمة الحالية  = Σ(current_value) [غير المباعة]
إجمالي تكلفة الشراء   = Σ(purchase_value) [غير المباعة]
إجمالي الإيجار الشهري = Σ(monthly_rental) [المؤجرة]
مكاسب القيمة          = إجمالي الحالية − إجمالي الشراء
```

### التكامل

- العقارات تُحسب تلقائياً في networth.html و dashboard.html
- الحالة `sold` لا تُحسب في صافي الثروة

---

## 20. الصكوك

**الملف:** `sukuk.html` / `js/sukuk.js`  
**التخزين:** `sukuk_planner_v1` في localStorage

### الحالات

| الحالة | اللون |
|---|---|
| مشترك | أخضر |
| مغلق | رمادي |
| متعثر | أحمر |
| مخطط له | أزرق |

### الحسابات

```
العائد الإجمالي % = (العائد السنوي ÷ 100) × (المدة ÷ 12)
الإجمالي المستلم  = المبلغ × (1 + العائد الإجمالي ÷ 100)
صافي الربح        = الإجمالي − المبلغ
```

### التكامل

إجمالي الصكوك النشطة يظهر في بطاقة تخصيص الأصول بالداشبورد

---

## 21. أهداف الحياة

**الملف:** `life-goals.html` / `js/life-goals.js`  
**التخزين:** `life_goals_v1` في localStorage

### المدخلات

| الحقل | الخيارات |
|---|---|
| المجال | شخصي / عائلي / مالي / صحي / تعليمي / ديني / مهني / ترفيهي |
| الحالة | قيد التنفيذ / مكتمل / مؤجل / ملغي |
| التقدم % | 0–100 (شريط بصري) |
| الأولوية | 1 عالية / 2 / 3 منخفضة |
| تاريخ البدء / المستهدف | — |

### إحصائيات

إجمالي / نشطة / مكتملة / مؤجلة / ملغاة / متوسط التقدم %

---

## 22. مخزون المنزل

**الملف:** `inventory.html` / `js/inventory.js`  
**التخزين:** `inventory_v1` في localStorage

### المدخلات

| الحقل | الخيارات |
|---|---|
| الفئة | نص حر (أجهزة / أثاث / ملابس...) |
| الموقع | نص حر (غرفة نوم / مطبخ...) |
| الحالة | جيد / مستعمل / متضرر / للاستبدال / مفقود |
| العدد | — |
| السعر التقريبي | — |

### الإحصائيات

إجمالي العناصر + توزيع الحالات + تحذيرات "للاستبدال" و"مفقود"

---

## 23. المتابعة المدرسية

**الملف:** `school.html` / `js/school.js`  
**التخزين:** `school_tracker_v2` في localStorage — يدعم أبناء متعددين

### 3 تبويبات لكل طفل

**أهداف الحياة:** هدف + سنة الإنجاز + الحالة

**أهداف الدراسة:** نفس البنية للأهداف الدراسية

**الدرجات:**
- سنوات دراسية (الصف + المدرسة)
- مواد لكل سنة
- درجات: فصل 1 + فصل 2 + فصل 3
- متوسط الفصول محسوب تلقائياً

---

## 24. متابعة كندة

**الملف:** `school-kanda.html` / `js/school-kanda.js`  
**التخزين:** `school_kanda_v1` في localStorage

نسخة مخصصة لطالبة واحدة (كندة). نفس بنية school.html لكن مبسطة.

**البنية:**
```json
{
  "profile":     { "name": "كندة", "birth": "YYYY-MM-DD" },
  "lifeGoals":   [{ "id": "...", "desc": "...", "year": 0, "status": "..." }],
  "schoolGoals": [{ "id": "...", "desc": "...", "year": 0, "status": "..." }],
  "years":       [{ "id": "...", "label": "...", "class": "...", "school": "..." }],
  "subjects":    [{ "id": "...", "name": "..." }],
  "grades":      { "yearId": { "subjectId": { "t1": 0, "t2": 0, "t3": 0 } } }
}
```

---

## 25. مزامنة المعاملات

**الملف:** `reconcile.html` / `js/reconcile.js`

### الوظيفة

استيراد كشف حساب الوسيط (Excel) ومقارنته مع معاملات التطبيق.

### المدخلات

- ملف Excel من منصة تداول
- الأعمدة: اسم السهم + الكمية + التاريخ

### المعالجة

```
BROKER_NAME_MAP: أسماء الوسيط → رموز التطبيق
مثال: 'SAUDI ARAMCO' → '2222'
       'STC'          → '7010'
```

### المخرجات

- عرض معاملات الوسيط
- مقارنة مع معاملات التطبيق
- تمييز الفوارق والمعاملات الغائبة

---

## 26. أدوات التحليل

### أ) حاسبة متوسط سعر الشراء

**الملف:** `avg-calculator.html` (لا JS منفصل — منطق inline)

**الوظيفة:** تحسيب متوسط التكلفة المرجّح عند الشراء على دفعات متعددة

**المدخلات:**
- الأسهم الحالية + السعر الحالي (للحساسة الأولى)
- دفعات إضافية: أسهم + سعر لكل دفعة (صفوف قابلة للإضافة)

**الحساب:**
```
new_avg = Σ(shares_i × price_i) / Σ(shares_i)
```

**المخرجات:** متوسط السعر الجديد | إجمالي الأسهم | إجمالي التكلفة

---

### ب) تقدير القيمة العادلة

**الملف:** `stock-valuation.html` (لا JS منفصل — منطق inline)

**الوظيفة:** تقدير القيمة العادلة للسهم بأساليب متعددة

**طرق التقييم المدعومة:**
- P/E Relative: `القيمة = EPS × P/E المستهدف`
- DDM (نموذج خصم الأرباح): `P = D1 ÷ (r − g)`
- Graham Formula: `P = EPS × (8.5 + 2g) × (4.4 ÷ r)`

**لا تخزين** — حاسبة آنية فقط

---

### ج) تقييم أمان المحفظة

**الملف:** `portfolio-rating.html` (لا JS منفصل — منطق inline)

**الوظيفة:** يُعطي المحفظة درجة أمان من 0–100

**معايير التقييم:**
- عدد الأسهم (التنويع)
- أكبر وزن منفرد %
- عدد القطاعات
- نسبة النقد
- وجود أسهم دفاعية

**المخرج:** درجة إجمالية + ملاحظات نصية لكل محور

---

### د) حاسبة صندوق الطوارئ

**الملف:** `emergency-fund.html` (لا JS منفصل — منطق inline)

**الوظيفة:** يحسب حجم صندوق الطوارئ المُوصى به

**المدخلات:**
- المصاريف الشهرية الأساسية (ر.س)
- عدد أشهر التغطية المطلوبة (3 / 6 / 9 / 12)
- المبلغ المدَّخر حالياً (ر.س)

**الحساب:**
```
الهدف    = مصاريف_شهرية × عدد_الأشهر
الفجوة   = الهدف − المدَّخر_حالياً
نسبة الإنجاز = المدَّخر ÷ الهدف × 100
```

---

### هـ) نصائح المستثمر

**الملف:** `invest-tips.html`

محتوى ثابت — مجموعة نصائح استثمارية مكتوبة بالعربية. لا تخزين ولا حسابات.

---

## 27. الإعدادات

**الملف:** `settings.html` / `js/settings.js`

### أ) عتبات ألوان التنبيهات

**المدخلات:** حد الأخضر % (افتراضي: 1) / حد الأصفر % (افتراضي: 3) — يجب أخضر < أصفر

**التأثير:** يُستخدم في targets.html وبانر الداشبورد

### ب) تصدير النسخة الاحتياطية

**المخرج:** ملف JSON يشمل 16 جدول Supabase + 16 مفتاح localStorage

**حجم الـ batch:**

| الجدول | الـ batch |
|---|---|
| `transactions` | 50 |
| `holdings` | 200 |
| `review_log_attachments` | 5 |
| البقية | 500 |

**ملاحظة:** المفاتيح تُقرأ بـ `userLsKey(k)` لعزل بيانات كل مستخدم.

### ج) استعادة من نسخة احتياطية

**الخطوات:**
1. Dry Run: تحقق من صحة الملف (الإصدار، الجداول، الحقول الأساسية)
2. عرض ملخص + تأكيد مزدوج
3. حفظ نسخة طارئة في `tharwa_emergency_backup`
4. حذف البيانات الحالية (FK children أولاً: `review_log_attachments` → بقية الجداول)
5. إدراج البيانات (بنفس ترتيب TABLES)
6. استعادة localStorage
7. redirect للداشبورد

### د) استعادة النسخة الطارئة

إذا فشلت الاستعادة: نسخة طارئة محفوظة مؤقتاً في `tharwa_emergency_backup`

### هـ) تقرير المراجعة الشهرية (Markdown)

ملف `.md` شامل يُصدَّر لقراءة الذكاء الاصطناعي، يشمل:
- الحيازات + الأداء التفصيلي + المعاملات + الأرباح + التدفقات
- صافي الثروة + العقارات + الأهداف + المهام
- الملخص الإحصائي + هدف FIRE

### و) تصفير البيانات

- تأكيد مزدوج
- يمسح كل الجداول + localStorage
- الحساب يبقى

### ز) حذف الحساب

- يطلب إدخال البريد الإلكتروني للتأكيد
- يمسح البيانات ثم `delete_own_account()` (Supabase RPC)
- تسجيل خروج تلقائي

---

## 28. لوحة الإدارة

**الملف:** `admin.html` / `js/admin.js`  
**الوصول:** `user_metadata.is_admin === true` — محمي بفحص مزدوج (JWT + رسم DOM يدوياً)

### الوحدات الست

#### 1. الهوية والتحقق (`identity`)

**البيانات:** `user_profiles`

- جدول كل المستخدمين مع: البريد | تاريخ الإنشاء | آخر ظهور | الحالة
- إجراءات: تعليق / حظر / استعادة
- فلتر بالبريد + الحالة
- مؤشرات: إجمالي المستخدمين | المفعّلون | الموقوفون | نسبة التفعيل

#### 2. الامتثال والخصوصية (`compliance`)

**البيانات:** `consent_logs`, `data_erasure_requests`

- سجل موافقات المستخدمين (GDPR-style)
- طلبات مسح البيانات: عرض + تنفيذ حذف كلي `executeErasure()`
- عند تنفيذ المسح: يحذف من 8 جداول + يُسجّل في `admin_audit_logs`

#### 3. المؤشرات التشغيلية (`analytics`)

**البيانات:** `user_profiles` + جميع الجداول

- DAU / WAU / MAU (من `last_seen`)
- حجم كل جدول (عدد الصفوف)
- متوسط الأسهم لكل مستخدم | متوسط المعاملات | نسبة مستخدمي العقارات

#### 4. الدعم والاتصالات (`support`)

**البيانات:** `support_tickets`, `admin_broadcasts`

- قائمة تذاكر الدعم مع تفاصيل المتصفح
- إغلاق التذكرة + تسجيل في الأودت
- إرسال تنبيه جماعي: الموضوع + النص + الجمهور المستهدف → يُحفظ في `admin_broadcasts`

#### 5. الأمن وسجلات التدقيق (`security`)

**البيانات:** `admin_audit_logs`, `failed_login_attempts`, `blocked_ips`

- آخر 200 إجراء إداري
- محاولات الدخول الفاشلة مع عداد (أحمر عند ≥ 5)
- حظر IP: `blocked_ips` + تسجيل إجراء

#### 6. الصيانة والزيارات الأخيرة (`maintenance`)

**البيانات:** `site_config`, `user_profiles`

- تشغيل/إيقاف وضع الصيانة (`maintenance_mode = 'true'/'false'`)
- رسالة الصيانة المخصصة
- قائمة آخر 20 زيارة (من `last_seen`)

### دالة تسجيل الإجراءات

```javascript
logAdminAction(action_type, target_user_id, action_details)
// يُدرج في admin_audit_logs تلقائياً عند كل إجراء
// أنواع: SUSPEND_USER | BAN_USER | RESTORE_USER |
//        EXECUTE_ERASURE | BLOCK_IP | RESOLVE_TICKET |
//        SEND_BROADCAST
```

---

## 29. الخوارزميات الرئيسية

### XIRR — معدل العائد الداخلي السنوي

**الملف:** `js/utils.js` → `computeXIRR(flows)`

```
المدخلات: [{date: Date, amount: number}]
  شراء → amount سالب
  بيع / توزيعات / قيمة حالية → amount موجب

REL_TOL = Σ|amount_i| × 1e-4   (تسامح نسبي 0.01% من حجم التدفقات)

الخوارزمية:
  1. Newton-Raphson (100 تكرار، دقة 1e-7)
  2. Binary Search كـ fallback (200 تكرار، تسامح REL_TOL)
  3. النطاق: [−99.99%, +10000%]
  4. التحقق النهائي: |NPV(r)| ≤ REL_TOL

المخرج: % سنوي أو null إذا تعذّر الحساب
```

### WAC — المتوسط المرجّح للتكلفة

```
عند الشراء:
  new_avg = (old_shares×old_avg + buy_shares×buy_price) / total_shares

عند البيع:
  الأسهم تنقص — WAC ثابت

عند المنحة:
  الأسهم تزيد — avg_price ثابت (تكلفة = صفر)
```

### Capital-Weighted Age — عمر رأس المال الفعلي

```
لكل إيداع:
  ws += amount × أشهر_منذ_الإيداع
  wb += amount

لكل سحب:
  ws *= (1 − سحب / رصيد)
  wb -= سحب

CWA = ws / wb  (بالشهور)

مثال: 10K قبل 8 أشهر + 170K قبل 4 أشهر:
  CWA = (10K×8 + 170K×4) / 180K = 4.2 شهر فعلي
```

### Forward Dividend Yield

```
لكل سهم محتفظ به:
  1. DPS = مبلغ آخر توزيعة ÷ أسهم وقتها
  2. الدورية من فجوة آخر توزيعتين:
     ≤105 يوم → ربع سنوي (×4)
     ≤210 يوم → نصف سنوي (×2)
     >210 يوم → سنوي (×1)
  3. Projected = DPS × الدورية × الأسهم الحالية

Forward YOC = Σ(Projected) ÷ تكلفة الحيازات × 100
```

### حساب العمولة (تداول)

```javascript
// COMMISSION_RATE محدد كثابت — راجع عقد الوسيط قبل التغيير
// Aljazira/SNB: 0.0015 (1.5‰) | Mubasher/Albilad: 0.0025 (2.5‰)
const COMMISSION_RATE = 0.0015

commission = min(shares × price × COMMISSION_RATE, 100)
vat        = commission × 0.15
total_buy  = (shares × price) + commission + vat
total_sell = (shares × price) − commission − vat
total_grant = 0
```

### buildCumulativeCapitalMap — prefix-sum للرأس المال

```javascript
// O(M) — يُبنى مرة واحدة لكل تحميل performance.js
// بدلاً من إعادة مسح جميع التدفقات لكل شهر O(N×M)
buildCumulativeCapitalMap():
  رتّب cashflow_entries زمنياً
  اجرِ prefix-sum تراكمي
  أعِد { "YYYY-MM": total_at_end_of_month }
```

---

## 30. النسخ الاحتياطي والاستعادة

### تغطية الباكب — 100% من بيانات المستخدم

| المصدر | الجداول / المفاتيح | مشمول؟ |
|---|---|---|
| Supabase | 16 جدول | ✅ |
| localStorage | 16 مفتاح (userLsKey) | ✅ |

### سلامة FK عند الاستعادة

```
ترتيب الحذف (FK children أولاً):
  review_log_attachments → ثم بقية الجداول

ترتيب الإدراج (TABLES):
  holdings → transactions → dividends → ... → review_log → review_log_attachments

حفظ IDs:
  review_log.id محفوظ → يضمن صحة entry_id في attachments
```

### نتائج التحقق

```
insert: review_log قبل attachments     ✅
delete: attachments قبل review_log     ✅
FK:     entry_id = review_log.id       ✅
جداول:  16                             ✅
LS keys: 16                            ✅
```

---

## 31. utils.js

**الملف:** `js/utils.js` — مُحمَّل في كل صفحة

### دوال التنسيق

```javascript
formatSAR(amount, showSign=false)  // ريال سعودي — −0 يُعامَل كـ 0
formatNum(num, decimals=2)         // تنسيق رقمي
formatShares(num)                  // أسهم (بدون trailing zeros)
formatDate(dateStr)                // تاريخ عربي مختصر
todayISO()                         // YYYY-MM-DD
parseDateLocal(s)                  // "YYYY-MM-DD" → Date (local midnight — لا UTC shift)
```

### الحسابات المالية

```javascript
computeXIRR(flows)                 // [{date,amount}] → % أو null
calcCommission(shares, price)      // → {commission, vat, totalBuy, totalSell, tradeValue}
```

### إدارة البيانات

```javascript
supaQuery(queryFn, errorMsg)       // wrapper موحّد — يعيد null عند الخطأ + toast
saveUserSetting(key, value)        // upsert في user_settings (Supabase) — عبر الأجهزة
loadUserSetting(key)               // قراءة من user_settings مع فلتر user_id صريح
userLsKey(key)                     // → "u:{userId}:{key}" (لعزل localStorage بين المستخدمين)
```

### واجهة المستخدم

```javascript
showToast(msg, type)               // toast آمن (textContent لا innerHTML) — type: success|error|info|warning
confirmAsync(message)              // نافذة تأكيد مخصصة (بديل window.confirm للموبايل)
showNotePopup(btnEl)               // popup ملاحظة قابل للإغلاق — بدون innerHTML
setActiveNav(linkId)               // يُعلّم الرابط النشط في nav
toggleNavGroup(id)                 // فتح/إغلاق مجموعة nav (محفوظ في nav_groups_v1)
```

### Inline Editing

```javascript
enableInlineEditing(tbody, onSave)
// كل td تحمل: data-table, data-id, data-field, data-type, data-raw
// نقرة → input/select يظهر
// blur/enter → يحفظ في Supabase + onSave(id, field, newVal)
// رفض NaN للحقول الرقمية + allowlist أمان (INLINE_EDIT_ALLOWLIST)
```

**INLINE_EDIT_ALLOWLIST — الحقول المسموح بتعديلها:**

```javascript
transactions:     date, ticker, name, type, shares, price, notes
holdings:         ticker, name, sector, shares, avg_price, current_price, target_weight, notes
real_estate:      current_value, status, notes, name, rent_amount, purchase_price
dividends:        amount, date, year, month, ticker, name, notes
cashflow_entries: amount, date, type, notes, description
stock_targets:    target_pct, entry_price, exit_price, notes
sector_targets:   target_pct
// ... + 5 جداول أخرى
```

### أدوات أخرى

```javascript
esc(v)                              // HTML escape لمنع XSS
uid()                               // UUID (crypto.randomUUID أو fallback)
exportCSV(filename, headers, rows)  // CSV + BOM (العربية) — revokeObjectURL مؤجل
chartDefaults()                     // إعدادات Chart.js الموحدة (ألوان + خطوط Tajawal)
toggleTheme(isLight)                // dark ↔ light (localStorage)
zoomIn() / zoomOut()                // حجم الخط (11–21 px)
```

### قاموس الأسهم السعودية (TICKER_DB)

~40 رمزاً شائعاً:
`'2222': 'أرامكو السعودية'` | `'1120': 'مصرف الراجحي'` | `'7010': 'الاتصالات السعودية'` ...

### القطاعات الرسمية (OFFICIAL_SECTORS)

قائمة كاملة بقطاعات السوق السعودي المعتمدة.

---

## 32. الأمان والبنية الدفاعية

### طبقات الأمان

```
1. Supabase Auth (JWT)
   └─ كل طلب يحمل access_token
   └─ انتهاء الجلسة تلقائياً

2. Row Level Security (RLS) — كل جدول مستخدم
   └─ USING (auth.uid() = user_id)
   └─ WITH CHECK (auth.uid() = user_id)
   └─ المستخدم لا يستطيع رؤية أي صف لمستخدم آخر

3. Admin Tables
   └─ (auth.jwt() ->> 'is_admin')::boolean = true

4. Client-side requireAuth()
   └─ طبقة دفاع إضافية قبل تحميل أي صفحة

5. Inline Edit Allowlist
   └─ رفض أي table/field غير موجود في INLINE_EDIT_ALLOWLIST
   └─ RLS يحمي على مستوى الصفوف (user_id)
```

### XSS Prevention

```javascript
// showToast: textContent لا innerHTML
item.querySelector('.toast-msg').textContent = msg;

// showNotePopup: createTextNode لا innerHTML
body.appendChild(document.createTextNode(line));

// esc(): يُطبَّق على كل قيمة تُدرج في innerHTML
esc(v) → &amp; &quot; &#39; &lt; &gt;
```

### إدارة نطاق localStorage

```javascript
// كل مفتاح مشفَّر بـ userId لمنع التسريب على الأجهزة المشتركة
userLsKey('salary_planner_v1') → 'u:uuid-xxx:salary_planner_v1'
```

### تدابير أخرى

- `loadUserSetting` يُضيف `eq('user_id', user.id)` صراحةً (دفاع ضد RLS misconfiguration)
- `calcCommission` يستخدم عمليات 10000× لتجنب أخطاء الفاصلة العائمة
- XIRR يتحقق من صحة الـ Date قبل الحساب + تسامح نسبي (لا مطلق)
- Edge Function CORS يقرأ `APP_ORIGIN` من env var
- يُدوَّن كل إجراء إداري في `admin_audit_logs` (immutable)
- كشوف الدخول الفاشلة مرتبة بالعداد في `failed_login_attempts`

---

## 33. Edge Function — تحديث الأسعار

**الملف:** `supabase/functions/update-prices/index.ts`  
**Runtime:** Deno (Supabase Edge Functions)

### التدفق الكامل

```
1. التحقق من المستخدم:
   GET /auth/v1/user (Authorization: Bearer token)
   → 401 إذا لم يكن الرمز صالحاً

2. جلب أسهم المستخدم:
   GET /rest/v1/holdings?user_id=eq.{userId}  (SERVICE_KEY)

3. بناء رموز Yahoo: [{ticker}.SR, ...]

4. جلب cookie + crumb من Yahoo Finance:
   GET https://fc.yahoo.com → cookie
   GET /v1/test/getcrumb    → crumb (مُخفى في السجلات)

5. استعلام Yahoo Finance API:
   GET /v7/finance/quote?symbols=...

6. تصفية الأسعار:
   رفض: null | ≤ 0 | > 1,000,000 SAR

7. تحديث holdings.current_price + price_updated_at:
   PATCH /rest/v1/holdings?ticker=eq.{t}&user_id=eq.{u}  (SERVICE_KEY)

8. الاستجابة:
   { updated: N, total: M, prices: {ticker: price}, failed: [tickers] }
```

### المتغيرات البيئية المطلوبة

| المتغير | الوصف |
|---|---|
| `SUPABASE_URL` | رابط Supabase project |
| `SERVICE_ROLE_KEY` | مفتاح الخدمة (يتجاوز RLS) |
| `SUPABASE_ANON_KEY` | المفتاح العام (للتحقق من المستخدم) |
| `APP_ORIGIN` | نطاق التطبيق لـ CORS (اختياري، افتراضي `*`) |

### استدعاء من الواجهة

```javascript
// dashboard.js
const { data: json } = await supabaseClient.functions.invoke('update-prices')
// json.failed[] → يُظهر toast تحذير للأسهم التي لم تُحدَّث
```

---

*— نهاية التوثيق —*
