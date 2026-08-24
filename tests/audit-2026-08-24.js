// ══════════════════════════════════════════════════════════════════════
// حُرّاس أوديت 2026-08-24 — كل خلل مُصلَح له فحصٌ يمنع عودته
// ----------------------------------------------------------------------
// ثمانية وكلاء فحصوا 37 ألف سطر بتشغيل الكود لا بقراءته. ما ثبت منه
// يُصلَح هنا، وكل إصلاح يُقفَل بفحص **ينفّذ** المسار ويقرأ الرقم — لا
// يطابق نصّاً. الفحص الساكن مرّ 56 مرة على محرّك ميت في هذا المشروع.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;

let ok = 0, bad = 0;
const t = (n, cond, extra) => { cond === true ? ok++ : bad++;
  console.log((cond === true ? 'PASS ' : 'FAIL ') + n + (cond === true ? '' : '  ← ' + (extra || ''))); };
const near = (a, b, eps) => a != null && Math.abs(a - b) < (eps == null ? 1e-6 : eps);

// ══════════════════════════════════════════════════════════════════════
// ① معاملات اليوم الواحد — الاقتناء قبل التصرّف
// ----------------------------------------------------------------------
// شراء 100@10 وبيع 50@12 في اليوم نفسه. لو سبق البيعُ شراءَه:
//   الأسهم المملوكة = 0 ⇒ sellShares = 0 ⇒ متوسط التكلفة = 0
//   ⇒ **كامل عائد البيع يُسجَّل ربحاً**: +599 بدل +98، والحيازة 100 بدل 50.
// و`created_at` وحده لا يكفي — هو ترتيب الإدخال لا الترتيب الاقتصادي.
// ══════════════════════════════════════════════════════════════════════
{
  const src = fs.readFileSync(ROOT + 'js/transactions.js', 'utf8');
  t('ترتيب WAC دالة واحدة مشتركة', /function txSortForWAC\(rows\)/.test(src));
  t('الاستعلام يجلب date و created_at و id',
    /select\('type, shares, price, total, name, date, created_at, id'\)/.test(src));
  t('إعادة الحساب تستعمل الترتيب الموحّد', /txSortForWAC\(txAll \|\| \[\]\)/.test(src));
  t('الإحصاءات تستعمل الترتيب نفسه', /const sorted = txSortForWAC\(transactions\)/.test(src));
  t('لا فرز يدوي متبقٍّ في الإحصاءات',
    !/\[\.\.\.transactions\]\.sort/.test(src), 'عاد الفرز الموازي');

  // تشغيل فعليّ للترتيب المستخرَج من الملف
  const m = src.match(/const TX_ORDER = [\s\S]*?\n\}/);
  t('الدالة قابلة للاستخراج', !!m);
  if (m) {
    const ctx = { Math, String, Array, Object }; vm.createContext(ctx);
    vm.runInContext(m[0] + '; this.f = txSortForWAC;', ctx);
    const buy  = { type: 'buy',  date: '2025-01-01', shares: 100, total: 1001.73, created_at: 'B' };
    const sell = { type: 'sell', date: '2025-01-01', shares: 50,  total: 599.10,  created_at: 'A' };
    const wac = (rows) => { let sh = 0, cost = 0, pnl = 0;
      rows.forEach(x => {
        if (x.type === 'buy') { cost += x.total; sh += x.shares; }
        else if (x.type === 'grant') { sh += x.shares; }
        else { const ss = Math.min(x.shares, sh), ap = sh > 0 ? cost / sh : 0;
               pnl += x.total * (x.shares > 0 ? ss / x.shares : 0) - ap * ss;
               cost = Math.max(0, cost - ap * ss); sh -= ss; } });
      return { sh, pnl }; };
    // البيع مُدخَل قبل الشراء (created_at أصغر) — الترتيب يجب أن يصحّحه
    const r = wac(ctx.f([sell, buy]));
    t('الشراء يسبق البيع في اليوم نفسه', r.sh === 50 && near(r.pnl, 98.235, 0.01),
      JSON.stringify(r));
    // البيع الزائد: العائد يُقَصّ كما تُقَصّ التكلفة
    const over = wac(ctx.f([buy, { type: 'sell', date: '2025-02-01', shares: 150, total: 1797.30 }]));
    t('البيع الزائد يُقَصّ عائده أيضاً', near(over.pnl, 196.47, 0.01),
      'الربح = ' + over.pnl + ' (لو ~795 فالعائد لم يُقَصّ)');
  }
  t('العائد مقصوص بنسبة القصّ في الكود',
    /const sellRatio\s+= \(\+t\.shares > 0\) \? sellShares \/ \+t\.shares : 0;/.test(src)
    && /const netProceeds\s+= \(\+t\.total\) \* sellRatio;/.test(src));
}

// ══════════════════════════════════════════════════════════════════════
// ② تقييم أمان المحفظة — 9.0/10 من نموذج فارغ
// ══════════════════════════════════════════════════════════════════════
{
  const html = fs.readFileSync(ROOT + 'portfolio-rating.html', 'utf8');
  t('لا درجة بلا بُعد معبَّأ',
    /if \(maxAnswered === 0\) return \{ score: null, breakdown \};/.test(html));
  t('لا «10 من لا شيء»', !/earned \/ maxAnswered \* 10 : 10/.test(html),
    'عاد الفرع الذي يمنح 10 عند maxAnswered = 0');
}

// ══════════════════════════════════════════════════════════════════════
// ③ حاسبة المتوسط — العمولة والضريبة داخل التكلفة (م.2 و10)
// ══════════════════════════════════════════════════════════════════════
{
  const html = fs.readFileSync(ROOT + 'avg-calculator.html', 'utf8');
  t('الحاسبة تستدعي calcCommission', /calcCommission\(s, p\)/.test(html));
  t('التكلفة تأخذ totalBuy', /newCost \+= c\.totalBuy;/.test(html));
  t('العمولة المضافة تُعلَن', /avgFeesLine/.test(html) && /مُدرَجة في المتوسط/.test(html));
  t('لا جمع خام متبقٍّ في الحلقة',
    !/newCost   \+= p \* s;\n        newShares/.test(html));
}

// ══════════════════════════════════════════════════════════════════════
// ④ formatSAR — «−0.00 ر.س»
// ══════════════════════════════════════════════════════════════════════
{
  const ctx = { console, Math, Number, parseFloat, String, Object, Array, Date, JSON,
    isFinite, isNaN, parseInt, Intl, document: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} } };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  try { vm.runInContext(fs.readFileSync(ROOT + 'js/utils.js', 'utf8'), ctx); } catch (_) {}
  t('−0.001 لا تُطبع سالبة', !/-/.test(ctx.formatSAR(-0.001)), ctx.formatSAR(-0.001));
  t('−0.0049 بإشارة لا تُطبع سالبة', !/-/.test(ctx.formatSAR(-0.0049, true)),
    ctx.formatSAR(-0.0049, true));
  t('السالب الحقيقي يبقى سالباً', /^-0\.60/.test(ctx.formatSAR(-0.6, true)),
    ctx.formatSAR(-0.6, true));
  t('التقريب سليم', /^12\.35/.test(ctx.formatSAR(12.345)), ctx.formatSAR(12.345));
}

// ══════════════════════════════════════════════════════════════════════
// ⑤ أسقف مُلغاة معروضة — «قيادي 12%» و«15% بلا استثناء»
// ----------------------------------------------------------------------
// دستور v3.0 م.25 ألغى لافتة «قيادي» نصّاً واستبدلها بأربع فئات.
// لا وجود لسقف 12% في `constitution.js`، والكود كان يحسب صحيحاً ويكتب خطأً.
// ══════════════════════════════════════════════════════════════════════
{
  const files = ['js/watchlist.js', 'watchlist.html', 'profit-taking.html'];
  const hits = [];
  files.forEach(f => {
    const src = fs.readFileSync(ROOT + f, 'utf8');
    if (/قيادي — سقف 12%|قيادي 12%|7% للعادي/.test(src)) hits.push(f);
  });
  t('لا ذكر لسقف «قيادي 12%» المُلغى', hits.length === 0, hits.join(' · '));
  const pt = fs.readFileSync(ROOT + 'profit-taking.html', 'utf8');
  t('لا «15% لكل سهم بلا استثناء»', !/15% لكل سهم بلا استثناء/.test(pt));
  const C = require(ROOT + 'js/constitution.js');
  t('السقوف الدستورية كما هي', C.CAT.A.cap === 15 && C.CAT.B.cap === 10
    && C.CAT.C.cap === 7 && C.CAT.D.cap === 4);
}

// ══════════════════════════════════════════════════════════════════════
// ⑥ وحدة التشتّت — م.39 كانت مقلوبة
// ----------------------------------------------------------------------
// الحاسبة تحفظ CV **نسبةً مئوية**، والدستور يقارنها بحدود **كسرية**.
// فأي تقييم بأكثر من نموذج (cv ≥ 0.61) كان يقع في «ثقة منخفضة» ⇒ توسيع
// النطاقات 20% ⇒ سهم عند 1.25× العادلة (🟡 تخفيف بم.48، وممنوع توجيه
// سيولة إليه بم.55/4) يخرج **أمر شراء** بوصفه 🟢 تجميع.
// ══════════════════════════════════════════════════════════════════════
{
  const C = require(ROOT + 'js/constitution.js');
  t('تشتّت 0.08 (كسر) = ثقة عالية بلا توسيع',
    C.valueBandOf(1.25, 0.08).widen === 0 && C.valueBandOf(1.25, 0.08).key === 'trim',
    JSON.stringify(C.valueBandOf(1.25, 0.08)));
  t('تشتّت 0.45 = متوسطة ⇒ ±10%', C.valueBandOf(1.0, 0.45).widen === 0.1);
  t('تشتّت 0.70 = منخفضة ⇒ ±20%', C.valueBandOf(1.0, 0.70).widen === 0.2);

  const de = fs.readFileSync(ROOT + 'js/decision-engine.js', 'utf8');
  t('المحرّك يحوّل CV إلى كسر عند القراءة',
    /\+entry\.results\.dispersionCV \/ 100 : null/.test(de),
    'عادت القراءة الخام — وحدة مقلوبة');
}

// ══════════════════════════════════════════════════════════════════════
// ⑦ محرّك القرار — الممنوعات والسعر القديم وكسر السقف والقاعدة المطلقة
// ══════════════════════════════════════════════════════════════════════
{
  const de = fs.readFileSync(ROOT + 'js/decision-engine.js', 'utf8');

  // م.12 و55/5 — المرتبتان 1 و2 في سلّم م.50، وكانتا غائبتين كلياً
  t('م.12 مطبَّقة في الخطة', /isBanned\(r\.ticker\)/.test(de),
    'الخطة كانت تُصدر أمر شراء لسهم مُستبعَد دائماً');
  t('م.55/5 مطبَّقة في الخطة', /isNoAccumulate\(r\.ticker\)/.test(de));
  t('الممنوع يُعلَن ولا يُكتَم', /function mkBlocked\(r, price, why\)/.test(de)
    && /blocked: true/.test(de));

  // م.18 — السعر القديم لا يقود قرار وزن
  t('م.18 توقف أوامر الخطة أيضاً',
    /if \(priceAlerts && priceAlerts\[r\.ticker\]\)/.test(de),
    'البطاقة كانت توقف الإشارة والخطة تمضي على السعر نفسه');

  // كسر السقف لا يُكتَم حين الهدف ≥ الوزن
  t('كسر السقف يُعلَن ولو ساواه الهدف',
    /if \(gapPct >= 0 && r\.overCap\)/.test(de),
    'كان يسقط من الخطة كلياً بينما بطاقته حمراء');

  // م.11 — التخفيف يمرّ ببوابة الخسارة المحققة
  t('التخفيف يمرّ ببوابة م.11', /const trimGate = \(typeof deferredVerdict/.test(de)
    && /trimGate\.verdict !== 'exitNow'/.test(de),
    'كسر السقف كان يأمر ببيع بخسارة محقّقة');

  // التوزيعة المُعلَنة غير المصروفة لا تُنقص التعادل الحقيقي (م.2)
  t('التعادل يقرأ التوزيعة بالتعريف الموحّد',
    /dividendFlowDate\(d, new Date\(\)\)/.test(de),
    'المُعلَن غير المستلَم كان يخفض التعادل فيفتح خروجاً بخسارة');
  t('لا شرط `!d.date` خام متبقٍّ في سجل التوزيعات',
    !/if \(!tk \|\| !d\.date\) return;/.test(de));
}

console.log('\n' + ok + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
