-- ============================================================
-- fix_tickers.sql — تصحيح شامل لجميع الأكواد الخاطئة
-- مصدر الحقيقة: ملف قطاعات الاسهم - sectors.csv
-- شغّله في Supabase SQL Editor دفعة واحدة
-- ============================================================

DO $$
DECLARE
  _uid UUID := '0b171bdb-d747-4751-9d75-afd2c2bf07b2';
BEGIN

-- ============================================================
-- البنوك
-- ============================================================
-- الإنماء: 1180 خاطئ (الأهلي) → 1150 صحيح
UPDATE transactions SET ticker='1150' WHERE user_id=_uid AND ticker='1180';
UPDATE holdings     SET ticker='1150' WHERE user_id=_uid AND ticker='1180';

-- ============================================================
-- تجزئة وتوزيع السلع الاستهلاكية
-- ============================================================
-- النهدي: 4050 خاطئ (ساسكو) → 4164 صحيح
UPDATE transactions SET ticker='4164' WHERE user_id=_uid AND ticker='4050';
UPDATE holdings     SET ticker='4164' WHERE user_id=_uid AND ticker='4050';

-- أسواق ع العثيم: 4012 خاطئ (الأصيل) → 4001 صحيح
UPDATE transactions SET ticker='4001' WHERE user_id=_uid AND ticker='4012';
UPDATE holdings     SET ticker='4001' WHERE user_id=_uid AND ticker='4012';

-- إكسترا: 4287 خاطئ → 4003 صحيح
UPDATE transactions SET ticker='4003' WHERE user_id=_uid AND ticker='4287';
UPDATE holdings     SET ticker='4003' WHERE user_id=_uid AND ticker='4287';

-- ============================================================
-- المواد الأساسية — الكيماويات
-- ============================================================
-- سبكيم العالمية: 2230 خاطئ (الكيميائية) → 2310 صحيح
UPDATE transactions SET ticker='2310' WHERE user_id=_uid AND ticker='2230';
UPDATE holdings     SET ticker='2310' WHERE user_id=_uid AND ticker='2230';

-- ============================================================
-- المواد الأساسية — الأسمنت
-- (الترتيب مهم: نغيّر بالاسم لأن الأكواد تتقاطع)
-- ============================================================
-- خطوة 1: أرقام مؤقتة عشان نتجنب التداخل
UPDATE transactions SET ticker='TMP_3020' WHERE user_id=_uid AND ticker='3020'; -- أسمنت اليمامة (خطأ)
UPDATE transactions SET ticker='TMP_3040' WHERE user_id=_uid AND ticker='3040'; -- أسمنت اليمامة (خطأ)
UPDATE transactions SET ticker='TMP_3080' WHERE user_id=_uid AND ticker='3080'; -- أسمنت ينبع (خطأ)
UPDATE transactions SET ticker='TMP_3090' WHERE user_id=_uid AND ticker='3090'; -- أسمنت القصيم (خطأ)

UPDATE holdings     SET ticker='TMP_3020' WHERE user_id=_uid AND ticker='3020';
UPDATE holdings     SET ticker='TMP_3040' WHERE user_id=_uid AND ticker='3040';
UPDATE holdings     SET ticker='TMP_3080' WHERE user_id=_uid AND ticker='3080';
UPDATE holdings     SET ticker='TMP_3090' WHERE user_id=_uid AND ticker='3090';

-- خطوة 2: التصحيح النهائي بحسب الاسم
-- TMP_3020 = كان يحمل اسم 'أسمنت السعودية' → 3030
UPDATE transactions SET ticker='3030' WHERE user_id=_uid AND ticker='TMP_3020' AND name='أسمنت السعودية';
UPDATE holdings     SET ticker='3030' WHERE user_id=_uid AND ticker='TMP_3020' AND name='أسمنت السعودية';

-- TMP_3040 = كان يحمل اسم 'أسمنت اليمامة' → 3020
UPDATE transactions SET ticker='3020' WHERE user_id=_uid AND ticker='TMP_3040' AND name='أسمنت اليمامة';
UPDATE holdings     SET ticker='3020' WHERE user_id=_uid AND ticker='TMP_3040' AND name='أسمنت اليمامة';

-- TMP_3080 = كان يحمل اسم 'أسمنت ينبع' → 3060
UPDATE transactions SET ticker='3060' WHERE user_id=_uid AND ticker='TMP_3080' AND name='أسمنت ينبع';
UPDATE holdings     SET ticker='3060' WHERE user_id=_uid AND ticker='TMP_3080' AND name='أسمنت ينبع';

-- TMP_3090 = كان يحمل اسم 'أسمنت القصيم' → 3040
UPDATE transactions SET ticker='3040' WHERE user_id=_uid AND ticker='TMP_3090' AND name='أسمنت القصيم';
UPDATE holdings     SET ticker='3040' WHERE user_id=_uid AND ticker='TMP_3090' AND name='أسمنت القصيم';

-- تنظيف أي مؤقت تبقى
UPDATE transactions SET ticker='UNKNOWN' WHERE user_id=_uid AND ticker LIKE 'TMP_%';
UPDATE holdings     SET ticker='UNKNOWN' WHERE user_id=_uid AND ticker LIKE 'TMP_%';

-- ============================================================
-- الرعاية الصحية
-- ============================================================
-- المواساة: 4007 خاطئ (الحمادي) → 4002 صحيح
UPDATE transactions SET ticker='4002' WHERE user_id=_uid AND ticker='4007';
UPDATE holdings     SET ticker='4002' WHERE user_id=_uid AND ticker='4007';

-- فقيه الطبية: 4009 خاطئ (السعودي الألماني) → 4017 صحيح
UPDATE transactions SET ticker='4017' WHERE user_id=_uid AND ticker='4009';
UPDATE holdings     SET ticker='4017' WHERE user_id=_uid AND ticker='4009';

-- ============================================================
-- إنتاج الأغذية / المرافق
-- ============================================================
-- المطاحن الحديثة: 2080 خاطئ (الغاز — مرافق!) → 2284 صحيح
UPDATE transactions SET ticker='2284' WHERE user_id=_uid AND ticker='2080';
UPDATE holdings     SET ticker='2284' WHERE user_id=_uid AND ticker='2080';

-- سدافكو: 2285 خاطئ (المطاحن العربية) → 2270 صحيح
UPDATE transactions SET ticker='2270' WHERE user_id=_uid AND ticker='2285';
UPDATE holdings     SET ticker='2270' WHERE user_id=_uid AND ticker='2285';

-- ============================================================
-- إدارة وتطوير العقارات
-- ============================================================
-- سينومي سنترز: 4220 خاطئ (إعمار) → 4321 صحيح
UPDATE transactions SET ticker='4321' WHERE user_id=_uid AND ticker='4220';
UPDATE holdings     SET ticker='4321' WHERE user_id=_uid AND ticker='4220';

-- ============================================================
-- الصناديق العقارية المتداولة (REITs)
-- (ترتيب مهم — نفس أسلوب الأسمنت)
-- ============================================================
UPDATE transactions SET ticker='TMP_4300' WHERE user_id=_uid AND ticker='4300';
UPDATE transactions SET ticker='TMP_4310' WHERE user_id=_uid AND ticker='4310';
UPDATE transactions SET ticker='TMP_4320' WHERE user_id=_uid AND ticker='4320';
UPDATE transactions SET ticker='TMP_4333' WHERE user_id=_uid AND ticker='4333';
UPDATE transactions SET ticker='TMP_4336' WHERE user_id=_uid AND ticker='4336';
UPDATE transactions SET ticker='TMP_4340' WHERE user_id=_uid AND ticker='4340';
UPDATE transactions SET ticker='TMP_4343' WHERE user_id=_uid AND ticker='4343';
UPDATE transactions SET ticker='TMP_4347' WHERE user_id=_uid AND ticker='4347';

UPDATE holdings     SET ticker='TMP_4300' WHERE user_id=_uid AND ticker='4300';
UPDATE holdings     SET ticker='TMP_4310' WHERE user_id=_uid AND ticker='4310';
UPDATE holdings     SET ticker='TMP_4320' WHERE user_id=_uid AND ticker='4320';
UPDATE holdings     SET ticker='TMP_4333' WHERE user_id=_uid AND ticker='4333';
UPDATE holdings     SET ticker='TMP_4336' WHERE user_id=_uid AND ticker='4336';
UPDATE holdings     SET ticker='TMP_4340' WHERE user_id=_uid AND ticker='4340';
UPDATE holdings     SET ticker='TMP_4343' WHERE user_id=_uid AND ticker='4343';
UPDATE holdings     SET ticker='TMP_4347' WHERE user_id=_uid AND ticker='4347';

-- TMP_4300 = الخبير ريت (خطأ، 4300=دار الأركان) → 4348
UPDATE transactions SET ticker='4348' WHERE user_id=_uid AND ticker='TMP_4300' AND name='الخبير ريت';
UPDATE holdings     SET ticker='4348' WHERE user_id=_uid AND ticker='TMP_4300' AND name='الخبير ريت';

-- TMP_4310 = دراية ريت (خطأ، 4310=مدينة المعرفة) → 4339
UPDATE transactions SET ticker='4339' WHERE user_id=_uid AND ticker='TMP_4310' AND name='دراية ريت';
UPDATE holdings     SET ticker='4339' WHERE user_id=_uid AND ticker='TMP_4310' AND name='دراية ريت';

-- TMP_4320 = جدوى ريت السعودية (خطأ، 4320=الأندلس) → 4342
UPDATE transactions SET ticker='4342' WHERE user_id=_uid AND ticker='TMP_4320' AND name='جدوى ريت السعودية';
UPDATE holdings     SET ticker='4342' WHERE user_id=_uid AND ticker='TMP_4320' AND name='جدوى ريت السعودية';

-- TMP_4333 = تعليم ريت (خطأ، 4333=تعليم ريت... صح!) → 4333
UPDATE transactions SET ticker='4333' WHERE user_id=_uid AND ticker='TMP_4333' AND name='تعليم ريت';
UPDATE holdings     SET ticker='4333' WHERE user_id=_uid AND ticker='TMP_4333' AND name='تعليم ريت';

-- TMP_4336 = الإنماء ريت الفندقي (خطأ، 4336=ملكية ريت) → 4349
UPDATE transactions SET ticker='4349' WHERE user_id=_uid AND ticker='TMP_4336' AND name='الإنماء ريت الفندقي';
UPDATE holdings     SET ticker='4349' WHERE user_id=_uid AND ticker='TMP_4336' AND name='الإنماء ريت الفندقي';

-- TMP_4340 = الراجحي ريت (خطأ، 4340=الراجحي ريت... صح!) → 4340
UPDATE transactions SET ticker='4340' WHERE user_id=_uid AND ticker='TMP_4340' AND name='الراجحي ريت';
UPDATE holdings     SET ticker='4340' WHERE user_id=_uid AND ticker='TMP_4340' AND name='الراجحي ريت';

-- TMP_4343 = تعليم ريت (كان مكرراً) → 4333
UPDATE transactions SET ticker='4333' WHERE user_id=_uid AND ticker='TMP_4343' AND name='تعليم ريت';
UPDATE holdings     SET ticker='4333' WHERE user_id=_uid AND ticker='TMP_4343' AND name='تعليم ريت';

-- TMP_4347 = بنيان ريت (كان مخصصاً للراجحي ريت خطأ) → 4340
UPDATE transactions SET ticker='4340' WHERE user_id=_uid AND ticker='TMP_4347' AND name='الراجحي ريت';
UPDATE holdings     SET ticker='4340' WHERE user_id=_uid AND ticker='TMP_4347' AND name='الراجحي ريت';

-- تنظيف أي مؤقت تبقى
UPDATE transactions SET ticker='UNKNOWN' WHERE user_id=_uid AND ticker LIKE 'TMP_%';
UPDATE holdings     SET ticker='UNKNOWN' WHERE user_id=_uid AND ticker LIKE 'TMP_%';

-- ============================================================
-- الخدمات الاستهلاكية
-- ============================================================
-- لجام للرياضة: 1213 خاطئ (نسيج) → 1830 صحيح
UPDATE transactions SET ticker='1830' WHERE user_id=_uid AND ticker='1213';
UPDATE holdings     SET ticker='1830' WHERE user_id=_uid AND ticker='1213';

-- ============================================================
-- تحقق نهائي: اعرض أي كود ما زال غير مطابق في user_stocks
-- ============================================================
RAISE NOTICE 'اكتمل التصحيح — شغّل diagnose_tickers.sql للتحقق';
END $$;
