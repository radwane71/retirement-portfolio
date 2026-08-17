-- ══════════════════════════════════════════════════════════════
-- ثروة — اكتمال النسخ الاحتياطي 2026-08-17 — شغّل في Supabase SQL Editor
-- آمن لإعادة التشغيل (idempotent)
--
-- المشكلة: صفحة الإعدادات تصدّر وتستعيد 17 جدولاً، لكن ثلاثة جداول
-- تخصّ المالك كانت خارج النسخة تماماً. أُضيفت الآن في js/settings.js،
-- غير أن سياسات RLS الحالية تمنع صاحب البيانات نفسه من قراءتها:
--
--   user_profiles          → SELECT للأدمن فقط  ⇒ المالك لا يقرأ ملفه
--   support_tickets        → SELECT للمالك ✓ لكن لا DELETE إطلاقاً
--                            ⇒ الاستعادة تُدرج فوق القديم = تكرار صامت
--   data_erasure_requests  → SELECT للأدمن فقط  ⇒ المالك لا يقرأ طلباته
--
-- هذا الملف يمنح المالك حق قراءة بياناته هو (وحذف تذاكره هو) دون
-- المساس بأي صلاحية أدمن قائمة. بلا هذه السياسات ستعمل النسخة لكن
-- ستُعلن الجداول الثلاثة «تعذّرت القراءة (RLS)» في تقرير التصدير —
-- إعلان صريح لا فشل صامت.
--
-- ملاحظة مقصودة: consent_logs يبقى بلا SELECT/DELETE للمالك — سجل
-- موافقة قانوني ثابت (immutable) بحكم تصميمه، لا يُنسخ ولا يُستعاد.
-- ══════════════════════════════════════════════════════════════

-- ── 1. user_profiles: يقرأ المالك ملفه ويُحدّثه (upsert عند الاستعادة) ──
-- المفتاح id هو auth.uid() نفسه. سياسة profiles_insert القائمة تسمح
-- بالإدراج بالفعل؛ ينقص القراءة والتحديث للمالك.
DROP POLICY IF EXISTS "profiles_select_own" ON public.user_profiles;
CREATE POLICY "profiles_select_own" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.user_profiles;
CREATE POLICY "profiles_update_own" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ملاحظة: لا نمنح DELETE للمالك على user_profiles عمداً —
-- الصف يُحذف بالتتالي (ON DELETE CASCADE) مع auth.users عند حذف الحساب،
-- والاستعادة تدمجه (upsert) بدل حذفه.

-- ── 2. support_tickets: يحذف المالك تذاكره ──
-- بلا هذه السياسة كانت الاستعادة تفشل في مسح القديم فتتضاعف التذاكر.
DROP POLICY IF EXISTS "ticket_delete_own" ON public.support_tickets;
CREATE POLICY "ticket_delete_own" ON public.support_tickets
  FOR DELETE USING (auth.uid() = user_id);

-- ── 3. data_erasure_requests: يقرأ المالك طلباته ──
-- (لا حذف — سجل إجرائي؛ ولا يدخل النسخة الاحتياطية حالياً،
--  لكن القراءة حق أصيل للمالك ولازمة لأي تصدير مستقبلي.)
DROP POLICY IF EXISTS "erasure_select_own" ON public.data_erasure_requests;
CREATE POLICY "erasure_select_own" ON public.data_erasure_requests
  FOR SELECT USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- تحقّق سريع بعد التشغيل — يجب أن تظهر السياسات الأربع
-- ══════════════════════════════════════════════════════════════
-- SELECT tablename, policyname, cmd
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND policyname IN ('profiles_select_own','profiles_update_own',
--                       'ticket_delete_own','erasure_select_own')
--  ORDER BY tablename, policyname;
