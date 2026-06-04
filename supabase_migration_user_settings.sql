-- =====================================================================
-- Migration: user_settings table
-- Run this in Supabase Studio → SQL Editor
-- يُشغَّل مرة واحدة فقط لإنشاء جدول إعدادات المستخدم
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key        TEXT        NOT NULL,
  value      TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- تفعيل RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- سياسة: كل مستخدم يرى ويعدّل إعداداته فقط
CREATE POLICY "users_own_settings"
  ON public.user_settings
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- الجداول التي ستُخزَّن هنا (key → page):
--   retirement_goal_v1  → داشبورد / هدف FIRE
--   salary_planner_v1   → صفحة الراتب
--   sukuk_planner_v1    → صفحة الصكوك
-- =====================================================================
