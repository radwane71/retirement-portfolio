// ══════════════════════════════════════════════════════════════════════
// 🧭 محرّك القرار — يطبّق دستور المحفظة (CLAUDE.md) على البيانات الحيّة
// ----------------------------------------------------------------------
// المبدأ: قرار آلي مبني على قواعد ثابتة. المحرّك يطبّق الفلاتر فقط ولا
// يجتهد. لو القاعدة ما تنطبق → «احتفظ». لو البيانات ناقصة → «غير متوفرة»
// صراحةً (ممنوع التقدير الصامت — الدستور §8).
// ══════════════════════════════════════════════════════════════════════

// ── 1. الثوابت اللي ما تتغير (الدستور §1) — ممنوع تعديلها من الواجهة ──
const CAPS = Object.freeze({ single: 7, blueChip: 12, sector: 25 });
const PORTFOLIO_SIZE = Object.freeze({ min: 18, max: 25 });

// نص مختصر لخطة الأسعار (للعرض في الجداول)
function zonesText(z) {
  if (!z) return null;
  const p = [];
  if (z.accumulate) p.push(`تجميع ≤${formatNum(z.accumulate)}`);
  if (z.trimFrom)   p.push(`تخفيف ${formatNum(z.trimFrom)}${z.trimTo ? '–' + formatNum(z.trimTo) : ''}`);
  if (z.liquidate)  p.push(`تصفية >${formatNum(z.liquidate)}`);
  return p.length ? p.join(' · ') : null;
}

// triggers ثابتة مُعرّفة من المالك (الدستور §1) — أولوية عليا فوق كل حساب
// ملاحظة الاتجاه: المواساة بيع عند الوصول لـ85 فأعلى. أرامكو تخفيض للوزن 12%
// عند وصول السعر إلى 29 أو أقل (السعر بلغ المستوى المحدّد).
const FIXED_TRIGGERS = Object.freeze([
  { ticker: '2222', name: 'أرامكو',  kind: 'reduce', price: 29, cmp: 'lte', toWeight: 12,
    label: 'تخفيض الوزن إلى 12% عند 29 ريال' },
  { ticker: '4002', name: 'المواساة', kind: 'sell',   price: 85, cmp: 'gte',
    label: 'بيع عند 85 ريال' },
]);

// ملاحظة: المحرّك يقيّم فقط الأسهم الموجودة داخل المحفظة — لا علاقة له بأي
// قائمة أسهم ممنوعة (أُزيلت بقرار المالك؛ وظيفة الصفحة القرار داخل المحفظة فقط).

// مفتاح حفظ مدخلات المحرّك لكل سهم (يُزامن عبر user_settings)
const ENGINE_STORE_KEY = 'decision_engine_v1';

// ── الحالة ──
let holdings   = [];   // من جدول holdings
let stockTargets = {}; // ticker → { target_pct, entry_price, exit_price }
let taskZones  = {};   // ticker → { accumulate, trimFrom, trimTo, liquidate } من صفحة المهام
let engineCfg    = {}; // ticker → مدخلات المحرّك اليدوية (استدامة/قيادي/نوع/عادلة يدوية)
let _results     = []; // مخرجات التقييم لكل سهم (للتصدير)

// ══════════════════════════════════════════════════════════════════════
// تصنيف نوع الأصل من القطاع (الدستور §3) — يحدّد نموذج الاستدامة
// ══════════════════════════════════════════════════════════════════════
function classifyAsset(sector) {
  const s = (sector || '').trim();
  if (s.includes('عقارية المتداولة') || s.includes('ريت')) return 'reit';
  if (s.includes('البنوك')) return 'bank';
  if (s.includes('المواد الاساسية') || s.includes('المواد الأساسية')) return 'cement_petro';
  return 'general';
}
const ASSET_LABEL = {
  reit:        'REIT — صندوق عقاري',
  bank:        'بنك',
  cement_petro:'إسمنت/بتروكيماويات',
  general:     'بقية القطاعات',
};
const SUSTAIN_METRIC = {
  reit:        'تغطية FFO / AFFO',
  bank:        'التوزيع ÷ صافي الدخل',
  cement_petro:'تغطية FCF',
  general:     'نسبة التوزيع من EPS + تغطية FCF',
};

// النوع الفعلي = override يدوي إن وجد، وإلا المستنتج من القطاع
function assetTypeOf(h) {
  const cfg = engineCfg[h.ticker] || {};
  return cfg.assetType || classifyAsset(h.sector);
}

// هل السهم قيادي؟ (سقف 12% بدل 7%) — علم يدوي، وأرامكو افتراضياً قيادية
function isBlueChip(h) {
  const cfg = engineCfg[h.ticker] || {};
  if (cfg.blueChip === true)  return true;
  if (cfg.blueChip === false) return false;
  return h.ticker === '2222'; // أرامكو قيادية بحكم trigger الوزن 12%
}
function capOf(h) { return isBlueChip(h) ? CAPS.blueChip : CAPS.single; }

// ══════════════════════════════════════════════════════════════════════
// بوابة الاستدامة (الفلتر 1) — ثلاثة أسئلة الدستور §4
//   covered  = هل التوزيع مغطّى بالمقياس الصحيح؟  (yes/no/unknown)
//   healthy  = هل الأساسيات سليمة / EPS موجب؟       (yes/no/unknown)
//   cut      = هل في إشارة قطع توزيع أو تدهور؟       (yes/no/unknown)
// النتيجة: fail لو أي إجابة سلبية | pass لو الكل سليم | unknown لو ناقص
// ══════════════════════════════════════════════════════════════════════
function sustainabilityOf(h) {
  const cfg = engineCfg[h.ticker] || {};
  const covered = cfg.divCovered;   // 'yes' | 'no' | undefined
  const healthy = cfg.fundHealthy;  // 'yes' | 'no' | undefined
  const cut     = cfg.divCut;       // 'yes' | 'no' | undefined

  if (covered === 'no' || healthy === 'no' || cut === 'yes') {
    return { status: 'fail', reason: failReason(covered, healthy, cut) };
  }
  if (covered === 'yes' && healthy === 'yes' && cut === 'no') {
    return { status: 'pass', reason: 'التوزيع مغطّى + أساسيات سليمة + لا إشارة قطع' };
  }
  return { status: 'unknown', reason: 'بيانات الاستدامة غير مكتملة' };
}
function failReason(covered, healthy, cut) {
  const f = [];
  if (covered === 'no') f.push('التوزيع غير مغطّى');
  if (healthy === 'no') f.push('أساسيات متدهورة / EPS سالب');
  if (cut === 'yes')    f.push('إشارة قطع/خفض توزيع');
  return f.join('، ');
}

// ══════════════════════════════════════════════════════════════════════
// خطة الأسعار (الفلتر 3) — مصدرها صفحة «مهام المحفظة» لكل سهم:
//   accumulate = تجميع عند سعر ≤   |   trimFrom..trimTo = نطاق التخفيف
//   liquidate  = تصفية إذا تجاوز السعر هذا الحدّ (سعر التضخّم)
// تُرجع null إذا لا توجد أي خانة سعرية → القيمة «غير متوفرة» (تُعلَن صراحةً §8).
// ══════════════════════════════════════════════════════════════════════
function priceZonesOf(h) {
  const z = taskZones[h.ticker];
  if (!z) return null;
  const has = z.accumulate != null || z.trimFrom != null || z.trimTo != null || z.liquidate != null;
  return has ? z : null;
}

// ملاحظات الدستور الخاصة (§3) — تُعرَض كلافتة تحذيرية، لا تُغيّر منطق المحرّك آلياً
const SPECIAL_NOTES = {
  '5110': 'مرساة دفاعية (الدستور §3): توزيع 5110 محمي بمرسوم ملكي 2020 وملكية صندوق الاستثمارات. التدفق النقدي السالب = مصاريف رأسمالية مخططة، ليس تعثراً. لا تُفشِل بوابة الاستدامة لمجرد التدفق السالب.',
};
function specialNoteOf(h) {
  if (SPECIAL_NOTES[h.ticker]) return SPECIAL_NOTES[h.ticker];
  if (assetTypeOf(h) === 'cement_petro') {
    return 'سياق دوري (الدستور §3): في شركة إسمنت قديمة راسخة، نسبة توزيع مرتفعة قد تعكس قاع دورة أرباح مع توزيع مدعوم بميزانية نظيفة — لا تعثر. السياق قبل التصنيف.';
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// تقييم سهم واحد عبر الفلاتر بالترتيب الإجباري (الدستور §4 + §5)
// يرجّع: { action, label, reason, priority, gaps[], ... }
//   priority: 0=trigger ثابت | 1=فشل استدامة | 2=كسر سقف | 3=فرصة إضافة | 9=احتفظ
// ══════════════════════════════════════════════════════════════════════
function evaluateHolding(h, ctx) {
  const value  = +h.shares * +h.current_price;
  const weight = ctx.totalValue > 0 ? (value / ctx.totalValue) * 100 : 0;
  const price  = +h.current_price;
  const cap    = capOf(h);
  const assetType = assetTypeOf(h);
  const tgt    = stockTargets[h.ticker] || {};
  // الهدف الفردي للسهم: نسبته المسجّلة في صفحة الأهداف، وإلا السقف الافتراضي
  // (7% عادي / 12% قيادي). هذا هدف السهم الفردي — لا علاقة له بسقف القطاع.
  const hasExplicitTarget = tgt.target_pct != null && +tgt.target_pct > 0;
  const targetWeight = hasExplicitTarget ? +tgt.target_pct : cap;

  const zones = priceZonesOf(h);      // خطة الأسعار من المهام (أو null)
  const sus = sustainabilityOf(h);
  const priceOk = price > 0 && +h.shares > 0; // حارس: بلا سعر/أسهم لا تُبنى إشارة سعرية
  const gaps = [];
  if (!priceOk) gaps.push('السعر الحالي');
  if (!zones)   gaps.push('خطة الأسعار (المهام)');
  if (sus.status === 'unknown') gaps.push('بوابة الاستدامة');
  const note = specialNoteOf(h);

  // انحراف الوزن عن الهدف الفردي، مصنّفاً حسب عتبات الألوان من الإعدادات.
  // (أخضر = ضمن الهدف فلا تنبيه · أصفر = تنبيه · أحمر = إجراء)
  const thr = ctx.thresholds;
  const dev = weight - targetWeight;                 // + فوق الهدف / − تحته
  const absDev = Math.abs(dev);
  const devBand = absDev <= thr.green ? 'green' : absDev <= thr.yellow ? 'yellow' : 'red';
  const devTxt = `${dev >= 0 ? '+' : '−'}${formatNum(absDev)} نقطة`;

  const base = {
    ticker: h.ticker, name: h.name, sector: h.sector,
    weight, cap, price, value, assetType, zones,
    sustain: sus, targetWeight, gaps, specialNote: note,
    blueChip: isBlueChip(h), dev, devBand, severity: 'green',
  };

  // ── P0: triggers الثابتة — فوق كل شي (الدستور §5) ──
  const trig = FIXED_TRIGGERS.find(t => t.ticker === h.ticker);
  if (trig) {
    base.trigger = { ...trig, fired: trig.cmp === 'gte' ? price >= trig.price : price <= trig.price };
    if (base.trigger.fired) {
      if (trig.kind === 'sell') {
        return { ...base, action: 'exit', label: 'تصفية', priority: 0, severity: 'red',
          reason: `trigger ثابت: ${trig.label} — انطبق (السعر ${formatNum(price)} ${trig.cmp === 'gte' ? '≥' : '≤'} ${trig.price})` };
      }
      // reduce → تخفيف لإرجاع الوزن لهدف الـtrigger
      const cutTo = trig.toWeight;
      return { ...base, action: weight > cutTo ? 'trim' : 'hold',
        label: weight > cutTo ? `تخفيف إلى ${cutTo}%` : 'احتفاظ',
        cutToWeight: cutTo, priority: 0, severity: weight > cutTo ? 'red' : 'green',
        reason: `trigger ثابت: ${trig.label} — انطبق (السعر ${formatNum(price)} ≤ ${trig.price})` };
    }
  }

  // ── P1: بوابة الاستدامة (الفلتر 1) — فشل = تصفية بغض النظر عن السعر ──
  if (sus.status === 'fail') {
    return { ...base, action: 'exit', label: 'تصفية', priority: 1, severity: 'red',
      reason: `فشل بوابة الاستدامة (الفلتر 1): ${sus.reason}` };
  }

  // ── P1: سعر التصفية (تضخّم) من المهام — تجاوز الحدّ يفرض التصفية فوراً ──
  if (zones && zones.liquidate && priceOk && price > zones.liquidate) {
    return { ...base, action: 'exit', label: 'تصفية', priority: 1, severity: 'red',
      reason: `سعر التضخّم (المهام): السعر ${formatNum(price)} تجاوز حدّ التصفية ${formatNum(zones.liquidate)} → بيع كامل` };
  }

  // ── P2: نطاق التخفيف من المهام (الفلتر 3) — السعر دخل نطاق بيع الزائد ──
  const inTrimBand = zones && zones.trimFrom && priceOk && price >= zones.trimFrom;
  // ── P2: تجاوز هدف الوزن — فقط خارج العتبة الخضراء (لا تنبيه على فروق تافهة) ──
  const overWeight = dev > thr.green; // أصفر أو أحمر فوق الهدف

  if (overWeight || inTrimBand) {
    const reasons = [];
    if (inTrimBand) {
      const to = zones.trimTo ? `–${formatNum(zones.trimTo)}` : '';
      reasons.push(`نطاق التخفيف (المهام): السعر ${formatNum(price)} ≥ ${formatNum(zones.trimFrom)}${to} → بيع الزائد`);
    }
    if (overWeight) reasons.push(`الوزن ${formatNum(weight)}% مقابل الهدف ${formatNum(targetWeight)}% (انحراف ${devTxt}، عتبة ${devBand === 'red' ? 'حمراء' : 'صفراء'})`);
    // اللون: نطاق السعر = أحمر (سعر صريح)، أو لون عتبة الوزن
    const severity = inTrimBand ? 'red' : devBand;
    const label = inTrimBand
      ? 'تخفيف (نطاق السعر)'
      : severity === 'red'
        ? `تخفيف لإرجاع الوزن إلى ${formatNum(targetWeight)}%`
        : `تنبيه: اقترب من تجاوز الهدف (${formatNum(weight)}%)`;
    return { ...base, action: 'trim', severity,
      label, cutToWeight: overWeight ? targetWeight : null,
      priority: severity === 'red' ? 2 : 2.5,
      reason: reasons.join(' | ') };
  }

  // ── P3: تجميع من المهام (الفلتر 3) — السعر ≤ حدّ التجميع + استدامة سليمة + وزن تحت الهدف بعتبة ──
  const inBuyZone = zones && zones.accumulate && priceOk && sus.status === 'pass'
      && price <= zones.accumulate
      && dev < -thr.green; // تحت الهدف خارج العتبة الخضراء
  if (inBuyZone) {
    if (!hasExplicitTarget) {
      // الهدف الفردي للسهم غير محدَّد، والشراء «مشروط مو آلي». بلا نسبة هدف
      // صريحة لا تُطلَق توصية تجميع آلية — يُعرَض كمرشّح مع إرشاد لضبط الهدف.
      return { ...base, action: 'hold', label: 'مرشّح تجميع (يحتاج هدف)', priority: 4,
        buyZone: true, severity: 'yellow',
        reason: `في منطقة التجميع (السعر ${formatNum(price)} ≤ حدّ التجميع ${formatNum(zones.accumulate)}) + استدامة سليمة، لكن لا يوجد هدف فردي مسجَّل. حدّد هدف السهم في صفحة «أهداف الأسهم» لتفعيل توصية التجميع (§4: الشراء مشروط مو آلي)` };
    }
    return { ...base, action: 'add', label: 'تجميع (مشروط)', priority: 3, severity: 'add',
      reason: `منطقة تجميع (المهام): السعر ${formatNum(price)} ≤ حدّ التجميع ${formatNum(zones.accumulate)} + استدامة سليمة + الوزن ${formatNum(weight)}% < الهدف ${formatNum(targetWeight)}% (انحراف ${devTxt})` };
  }

  // ── احتفاظ ── (ضمن العتبة الخضراء أو لا قاعدة انطبقت)
  let holdReason;
  if (gaps.length)            holdReason = `احتفاظ — لا قاعدة انطبقت. بيانات غير متوفرة: ${gaps.join('، ')}`;
  else if (devBand !== 'green') holdReason = `احتفاظ — الانحراف ${devTxt} ضمن المتابعة، لا قاعدة سعر/استدامة انطبقت`;
  else                        holdReason = `احتفاظ — الوزن ضمن العتبة الخضراء (انحراف ${devTxt})، الاستدامة سليمة`;
  return { ...base, action: 'hold', label: 'احتفاظ', priority: 9, severity: 'green', reason: holdReason };
}

// ══════════════════════════════════════════════════════════════════════
// التهيئة والتحميل
// ══════════════════════════════════════════════════════════════════════
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-decision-engine');
  await loadAll();
  runEngine();
}

async function loadAll() {
  const [rH, rT, rEng, rTasks] = await Promise.all([
    supabaseClient.from('holdings').select('ticker, name, sector, shares, avg_price, current_price, target_weight').order('ticker'),
    supabaseClient.from('stock_targets').select('ticker, target_pct, entry_price, exit_price'),
    loadUserSetting(ENGINE_STORE_KEY),
    supabaseClient.from('portfolio_tasks')
      .select('ticker, accumulate_at, trim_from, trim_to, liquidate_above, status, updated_at, created_at')
      .eq('status', 'active').order('updated_at', { ascending: false }),
  ]);

  holdings = rH.data || [];
  stockTargets = {};
  (rT.data || []).forEach(r => { stockTargets[r.ticker] = r; });
  engineCfg = rEng || {};

  // خطة الأسعار لكل رمز من المهام النشطة — أحدث مهمة فيها سعر هي المرجع
  taskZones = {};
  (rTasks.data || []).forEach(t => {
    const tk = (t.ticker || '').trim().toUpperCase();
    if (!tk || taskZones[tk]) return; // مرتّبة بالأحدث → أول ظهور هو الأحدث
    const num = v => (v != null && +v > 0 ? +v : null);
    taskZones[tk] = {
      accumulate: num(t.accumulate_at),
      trimFrom:   num(t.trim_from),
      trimTo:     num(t.trim_to),
      liquidate:  num(t.liquidate_above),
    };
  });
}

// عتبات ألوان التنبيهات من الإعدادات (نفس مفاتيح لوحة التحكم) — قابلة للتغيير
// أخضر = انحراف ضمن الهدف · أصفر = تنبيه · أحمر = إجراء. تُقرأ كل تشغيل فتتأقلم.
function alertThresholds() {
  const g = +(localStorage.getItem(userLsKey('tharwa-alert-green'))  ?? localStorage.getItem('tharwa-alert-green')  ?? 1);
  const y = +(localStorage.getItem(userLsKey('tharwa-alert-yellow')) ?? localStorage.getItem('tharwa-alert-yellow') ?? 3);
  return { green: isFinite(g) && g > 0 ? g : 1, yellow: isFinite(y) && y > 0 ? y : 3 };
}

// ══════════════════════════════════════════════════════════════════════
// تشغيل المحرّك + الرسم
// ══════════════════════════════════════════════════════════════════════
function runEngine() {
  const totalValue = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  const thresholds = alertThresholds();
  // قرار كل سهم فردي يعتمد على وزنه وهدفه الفرديين فقط — سقف القطاع 25%
  // يُفحَص على مستوى المحفظة في قسم منفصل (renderSectorCheck)، لا يُطبَّق على السهم.
  const ctx = { totalValue, thresholds };
  window._deThresholds = thresholds;

  _results = holdings.map(h => evaluateHolding(h, ctx));

  renderSummaryStrip(totalValue);
  renderActionTable();
  renderSectorCheck(totalValue);
  renderAllTable();
}

// ── شريط ملخص علوي: عدّ الإجراءات + فجوات البيانات ──
function renderSummaryStrip(totalValue) {
  // عرض العتبات الفعّالة (من الإعدادات) فوق الجدول
  const thEl = document.getElementById('de-thresholds');
  const t = window._deThresholds || { green: 1, yellow: 3 };
  if (thEl) thEl.innerHTML = `عتباتك الحالية لانحراف الوزن عن الهدف: ` +
    `<strong style="color:#10b981">ضمن ±${formatNum(t.green)}% أخضر</strong> · ` +
    `<strong style="color:#f59e0b">حتى ±${formatNum(t.yellow)}% أصفر</strong> · ` +
    `<strong style="color:#ef4444">أكثر أحمر</strong> — تُغيَّر من <a href="settings.html">الإعدادات</a>.`;

  const el = document.getElementById('de-summary');
  if (!el) return;
  const n = (a) => _results.filter(r => r.action === a).length;
  const gapsFV  = _results.filter(r => r.zones == null).length;
  const gapsSus = _results.filter(r => r.sustain.status === 'unknown').length;
  const count = holdings.length;
  const sizeOk = count >= PORTFOLIO_SIZE.min && count <= PORTFOLIO_SIZE.max;

  el.innerHTML = `
    <div class="de-stat de-stat-exit"><div class="de-stat-num">${n('exit')}</div><div class="de-stat-lbl">تصفية</div></div>
    <div class="de-stat de-stat-trim"><div class="de-stat-num">${n('trim')}</div><div class="de-stat-lbl">تخفيف</div></div>
    <div class="de-stat de-stat-add"><div class="de-stat-num">${n('add')}</div><div class="de-stat-lbl">تجميع</div></div>
    <div class="de-stat de-stat-hold"><div class="de-stat-num">${n('hold')}</div><div class="de-stat-lbl">احتفاظ</div></div>
    <div class="de-stat"><div class="de-stat-num">${count} <span style="font-size:.6em;color:${sizeOk?'#10b981':'#f59e0b'}">${sizeOk?'✓':'⚠'}</span></div><div class="de-stat-lbl">عدد الأسهم (الهدف ${PORTFOLIO_SIZE.min}–${PORTFOLIO_SIZE.max})</div></div>
    <div class="de-stat de-stat-gap"><div class="de-stat-num">${gapsFV} / ${gapsSus}</div><div class="de-stat-lbl">ناقص: خطة أسعار / استدامة</div></div>
  `;
}

// ── جدول الإجراءات مرتّب بالأولوية (الدستور §7) ──
function renderActionTable() {
  const tbody = document.getElementById('de-action-tbody');
  if (!tbody) return;
  const actionable = _results
    .filter(r => r.action !== 'hold' || r.buyZone)
    .sort((a, b) => a.priority - b.priority || b.weight - a.weight);

  if (!actionable.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">✅</div><p>لا يوجد سهم يحتاج إجراء الآن — كل المكوّنات ضمن القواعد.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = actionable.map(r => `
    <tr class="de-row-${r.severity || 'green'}">
      <td><span class="de-badge ${badgeFor(r)}">${r.label}</span></td>
      <td><strong>${r.ticker}</strong><br><span class="small text-muted">${escapeHtmlSafe(r.name)}</span></td>
      <td>${formatNum(r.weight)}%<br><span class="small text-muted">الهدف ${formatNum(r.targetWeight)}% (${r.dev>=0?'+':'−'}${formatNum(Math.abs(r.dev))})</span></td>
      <td>${formatNum(r.price)}</td>
      <td class="small">${zonesText(r.zones) ? escapeHtmlSafe(zonesText(r.zones)) : '<span class="text-muted">غير متوفرة</span>'}</td>
      <td class="de-reason">${escapeHtmlSafe(r.reason)}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="openStockCard('${r.ticker}')">بطاقة</button></td>
    </tr>`).join('');
}

// ── فحص سقف القطاع 25% (الفلتر 4) ──
function renderSectorCheck(totalValue) {
  const el = document.getElementById('de-sector-check');
  if (!el) return;
  const bySector = {};
  holdings.forEach(h => {
    const sec = (h.sector || '').trim() || 'غير مصنّف';
    bySector[sec] = (bySector[sec] || 0) + +h.shares * +h.current_price;
  });
  const rows = Object.entries(bySector)
    .map(([sec, val]) => ({ sec, pct: totalValue > 0 ? val / totalValue * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const breaches = rows.filter(r => r.pct > CAPS.sector);

  if (!breaches.length) {
    el.innerHTML = `<p class="text-muted" style="margin:0">✅ كل القطاعات تحت سقف ${CAPS.sector}%. أعلى قطاع: <strong>${escapeHtmlSafe(rows[0]?.sec || '—')}</strong> (${formatNum(rows[0]?.pct || 0)}%).</p>`;
    return;
  }
  el.innerHTML = breaches.map(b =>
    `<div class="de-alert-line">⚠️ تركيز قطاعي: <strong>${escapeHtmlSafe(b.sec)}</strong> = ${formatNum(b.pct)}% &gt; السقف ${CAPS.sector}% (الفلتر 4)</div>`
  ).join('');
}

// ── الجدول الكامل لكل الأسهم (تفصيل خط الأنابيب) ──
function renderAllTable() {
  const tbody = document.getElementById('de-all-tbody');
  if (!tbody) return;
  if (!holdings.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">📭</div><p>لا توجد أسهم في المحفظة بعد.</p></div></td></tr>`;
    return;
  }
  const sorted = _results.slice().sort((a, b) => a.priority - b.priority || b.weight - a.weight);
  tbody.innerHTML = sorted.map(r => {
    const susBadge = { pass: '🟢 سليمة', fail: '🔴 فاشلة', unknown: '⚪ غير متوفرة' }[r.sustain.status];
    const zt = zonesText(r.zones);
    const fvCell = zt
      ? `<span class="small">${escapeHtmlSafe(zt)}</span>`
      : '<span class="text-muted">غير متوفرة</span>';
    const noteTag = r.specialNote ? ` <span title="${escapeHtmlSafe(r.specialNote)}" style="cursor:help">📌</span>` : '';
    const devColor = { red: '#ef4444', yellow: '#f59e0b' }[r.devBand] || 'var(--text-muted)';
    return `
    <tr class="de-row-${r.severity || 'green'}">
      <td><strong>${r.ticker}</strong> ${r.blueChip ? '<span title="سهم قيادي — سقف 12%">⭐</span>' : ''}${noteTag}<br><span class="small text-muted">${escapeHtmlSafe(r.name)}</span></td>
      <td>${escapeHtmlSafe(ASSET_LABEL[r.assetType])}<br><span class="small text-muted">${escapeHtmlSafe(SUSTAIN_METRIC[r.assetType])}</span></td>
      <td>${formatNum(r.weight)}%<br><span class="small" style="color:${devColor}">الهدف ${formatNum(r.targetWeight)}% (${r.dev>=0?'+':'−'}${formatNum(Math.abs(r.dev))})</span></td>
      <td>${formatNum(r.price)}</td>
      <td>${fvCell}</td>
      <td>${susBadge}</td>
      <td><span class="de-badge ${badgeFor(r)}">${r.label}</span></td>
      <td class="de-reason small">${escapeHtmlSafe(r.reason)}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="openStockCard('${r.ticker}')">⚙️</button></td>
    </tr>`;
  }).join('');
}

function badgeClass(action) {
  return { exit: 'de-b-exit', trim: 'de-b-trim', add: 'de-b-add', hold: 'de-b-hold' }[action] || 'de-b-hold';
}
// لون الشارة حسب درجة الخطورة (عتبات الألوان): أحمر/أصفر/تجميع/أخضر
function badgeFor(r) {
  if (r.buyZone) return 'de-b-watch';
  return { red: 'de-b-exit', yellow: 'de-b-trim', add: 'de-b-add', green: 'de-b-hold' }[r.severity] || 'de-b-hold';
}
function escapeHtmlSafe(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ══════════════════════════════════════════════════════════════════════
// بطاقة السهم — إدخال مدخلات المحرّك يدوياً (الاستدامة/قيادي/نوع/عادلة)
// ══════════════════════════════════════════════════════════════════════
let _cardTicker = null;
function openStockCard(ticker) {
  const h = holdings.find(x => x.ticker === ticker);
  if (!h) return;
  _cardTicker = ticker;
  const cfg = engineCfg[ticker] || {};
  const autoType = classifyAsset(h.sector);

  document.getElementById('de-card-title').textContent = `بطاقة السهم — ${ticker} ${h.name}`;
  document.getElementById('de-card-sector').textContent = h.sector || '—';
  document.getElementById('de-card-autotype').textContent = ASSET_LABEL[autoType];
  document.getElementById('de-card-metric').textContent = SUSTAIN_METRIC[cfg.assetType || autoType];

  setSelect('de-card-assettype', cfg.assetType || '');
  setSelect('de-card-bluechip', cfg.blueChip === true ? 'yes' : cfg.blueChip === false ? 'no' : '');
  setSelect('de-card-covered', cfg.divCovered || '');
  setSelect('de-card-healthy', cfg.fundHealthy || '');
  setSelect('de-card-cut', cfg.divCut || '');
  document.getElementById('de-card-notes').value = cfg.notes || '';

  // خطة الأسعار مصدرها صفحة المهام — تُعرَض للقراءة فقط هنا
  const zt = zonesText(taskZones[ticker]);
  const fvHint = document.getElementById('de-card-fvhint');
  fvHint.innerHTML = zt
    ? `خطة الأسعار (من المهام): <strong>${escapeHtmlSafe(zt)}</strong>`
    : 'لا توجد خطة أسعار لهذا السهم — أضِفها في صفحة <a href="tasks.html" style="color:var(--accent)">مهام المحفظة</a>.';

  // ملاحظة الدستور الخاصة (5110 / سياق الإسمنت الدوري)
  const noteEl = document.getElementById('de-card-note');
  const note = specialNoteOf(h);
  if (note) { noteEl.textContent = '📌 ' + note; noteEl.style.display = ''; }
  else      { noteEl.textContent = ''; noteEl.style.display = 'none'; }

  document.getElementById('de-card-modal').style.display = 'flex';
}
function setSelect(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function closeStockCard() { document.getElementById('de-card-modal').style.display = 'none'; _cardTicker = null; }

async function saveStockCard(e) {
  if (e) e.preventDefault();
  if (!_cardTicker) return;
  const v = id => document.getElementById(id).value;
  const cfg = { ...(engineCfg[_cardTicker] || {}) };

  cfg.assetType   = v('de-card-assettype') || undefined;
  const bc = v('de-card-bluechip');
  cfg.blueChip    = bc === 'yes' ? true : bc === 'no' ? false : undefined;
  cfg.divCovered  = v('de-card-covered') || undefined;
  cfg.fundHealthy = v('de-card-healthy') || undefined;
  cfg.divCut      = v('de-card-cut') || undefined;
  cfg.notes       = v('de-card-notes').trim() || undefined;

  // نظّف المفاتيح الفارغة
  Object.keys(cfg).forEach(k => { if (cfg[k] === undefined) delete cfg[k]; });
  if (Object.keys(cfg).length) engineCfg[_cardTicker] = cfg;
  else delete engineCfg[_cardTicker];

  const ok = await saveUserSetting(ENGINE_STORE_KEY, engineCfg);
  showToast(ok ? '✅ حُفظت مدخلات السهم' : '⚠️ تعذّر الحفظ (تحقق من الاتصال)', ok ? 'success' : 'error');
  closeStockCard();
  runEngine();
}

// ══════════════════════════════════════════════════════════════════════
// تصدير جدول الإجراءات CSV
// ══════════════════════════════════════════════════════════════════════
function exportActionsCSV() {
  const rows = _results
    .filter(r => r.action !== 'hold' || r.buyZone)
    .sort((a, b) => a.priority - b.priority || b.weight - a.weight);
  if (!rows.length) { showToast('لا توجد إجراءات للتصدير', 'info'); return; }
  const head = ['الرمز','الاسم','الإجراء','الوزن%','الهدف%','السعر','خطة الأسعار','السبب'];
  const lines = rows.map(r => [
    r.ticker, r.name, r.label, formatNum(r.weight), formatNum(r.targetWeight), formatNum(r.price),
    zonesText(r.zones) || 'غير متوفرة', r.reason,
  ].map(csvCell).join(','));
  const csv = '﻿' + [head.map(csvCell).join(','), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `decision-engine-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

document.addEventListener('DOMContentLoaded', init);
