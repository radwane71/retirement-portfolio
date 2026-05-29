-- ============================================================
-- diagnose_tickers.sql
-- يكشف الأكواد الخاطئة: يقارن المعاملات بقاعدة بياناتك الشخصية
-- شغّله في Supabase SQL Editor واطّلع على النتائج
-- ============================================================

-- ① أكواد موجودة في المعاملات لكن غير موجودة في قاعدة بياناتك
--   هذه هي المشتبه بها (خاطئة أو غير مسجّلة)
SELECT DISTINCT
  t.ticker                        AS "الكود في المعاملات",
  t.name                          AS "الاسم في المعاملات",
  COUNT(*)                        AS "عدد المعاملات",
  us.ticker                       AS "الكود في قاعدتك",
  us.name                         AS "الاسم في قاعدتك"
FROM transactions t
LEFT JOIN user_stocks us
  ON us.ticker  = t.ticker
  AND us.user_id = t.user_id
WHERE t.user_id = '0b171bdb-d747-4751-9d75-afd2c2bf07b2'
  AND us.ticker IS NULL                -- لم يُطابَق في user_stocks
GROUP BY t.ticker, t.name, us.ticker, us.name
ORDER BY COUNT(*) DESC;

-- ② الأكواد المطابقة (للتأكيد — يجب أن تكون هنا غالبيتها)
SELECT DISTINCT
  t.ticker   AS "الكود",
  t.name     AS "الاسم في المعاملات",
  us.name    AS "الاسم في قاعدتك",
  us.sector  AS "القطاع"
FROM transactions t
JOIN user_stocks us
  ON us.ticker  = t.ticker
  AND us.user_id = t.user_id
WHERE t.user_id = '0b171bdb-d747-4751-9d75-afd2c2bf07b2'
ORDER BY t.ticker;
