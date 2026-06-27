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

// هوامش الفلتر 3 (حسمها المالك): قصّ عند +20% فوق العادلة، شراء عند −10% تحت
const VALUE_CAP_MARGIN = 0.20; // السعر > العادلة × 1.20 → مُقيّم بأعلى → مرشّح قصّ
const BUY_ZONE_MARGIN  = 0.10; // السعر < العادلة × 0.90 → منطقة شراء → مرشّح إضافة

// triggers ثابتة مُعرّفة من المالك (الدستور §1) — أولوية عليا فوق كل حساب
// ملاحظة الاتجاه: المواساة بيع عند الوصول لـ85 فأعلى. أرامكو تخفيض للوزن 12%
// عند وصول السعر إلى 29 أو أقل (السعر بلغ المستوى المحدّد).
const FIXED_TRIGGERS = Object.freeze([
  { ticker: '2222', name: 'أرامكو',  kind: 'reduce', price: 29, cmp: 'lte', toWeight: 12,
    label: 'تخفيض الوزن إلى 12% عند 29 ريال' },
  { ticker: '4002', name: 'المواساة', kind: 'sell',   price: 85, cmp: 'gte',
    label: 'بيع عند 85 ريال' },
]);

// أسهم ممنوعة نهائياً من أي توصية شراء (الدستور §1)
const BANNED_TICKERS = Object.freeze(['4339', '1111']);

// مفتاح حفظ مدخلات المحرّك لكل سهم (يُزامن عبر user_settings)
const ENGINE_STORE_KEY = 'decision_engine_v1';
const VALUATION_HISTORY_KEY = 'valuation_history_v1'; // مصدر القيمة العادلة المحفوظة

// ── الحالة ──
let holdings   = [];   // من جدول holdings
let stockTargets = {}; // ticker → { target_pct, entry_price, exit_price }
let valuationFV  = {}; // ticker → { value, date } (آخر قيمة عادلة محفوظة من الحاسبة)
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
// القيمة العادلة (الفلتر 2/3): override يدوي > آخر قيمة محفوظة من الحاسبة
// ══════════════════════════════════════════════════════════════════════
function fairValueOf(h) {
  const cfg = engineCfg[h.ticker] || {};
  if (cfg.fairValueManual != null && cfg.fairValueManual !== '' && +cfg.fairValueManual > 0) {
    return { value: +cfg.fairValueManual, source: 'يدوي' };
  }
  const fv = valuationFV[h.ticker];
  if (fv && fv.value > 0) {
    const age = fvAgeDays(fv);
    return { value: fv.value, min: fv.min, max: fv.max,
             source: `حاسبة القيمة العادلة (${fv.date})`, ageDays: age };
  }
  return null; // غير متوفرة — يُعلَن صراحةً
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
  const banned = BANNED_TICKERS.includes(h.ticker);
  const tgt    = stockTargets[h.ticker] || {};
  const targetWeight = (tgt.target_pct != null && +tgt.target_pct > 0) ? +tgt.target_pct : cap;

  const fv  = fairValueOf(h);
  const sus = sustainabilityOf(h);
  const priceOk = price > 0 && +h.shares > 0; // حارس: بلا سعر/أسهم لا تُبنى إشارة سعرية
  const fvStale = fv && fv.ageDays != null && fv.ageDays > FV_STALE_DAYS;
  const gaps = [];
  if (!priceOk) gaps.push('السعر الحالي');
  if (!fv) gaps.push('القيمة العادلة');
  if (sus.status === 'unknown') gaps.push('بوابة الاستدامة');
  const note = specialNoteOf(h);

  const base = {
    ticker: h.ticker, name: h.name, sector: h.sector,
    weight, cap, price, value, banned, assetType,
    fairValue: fv ? fv.value : null, fairSource: fv ? fv.source : null,
    fairMin: fv ? fv.min : null, fairMax: fv ? fv.max : null,
    fvAgeDays: fv ? fv.ageDays : null, fvStale,
    sustain: sus, targetWeight, gaps, specialNote: note,
    blueChip: isBlueChip(h),
  };

  // ── P0: triggers الثابتة — فوق كل شي (الدستور §5) ──
  const trig = FIXED_TRIGGERS.find(t => t.ticker === h.ticker);
  if (trig) {
    base.trigger = { ...trig, fired: trig.cmp === 'gte' ? price >= trig.price : price <= trig.price };
    if (base.trigger.fired) {
      if (trig.kind === 'sell') {
        return { ...base, action: 'exit', label: 'خروج', priority: 0,
          reason: `trigger ثابت: ${trig.label} — انطبق (السعر ${formatNum(price)} ${trig.cmp === 'gte' ? '≥' : '≤'} ${trig.price})` };
      }
      // reduce → قصّ لإرجاع الوزن لهدف الـtrigger
      const cutTo = trig.toWeight;
      return { ...base, action: weight > cutTo ? 'trim' : 'hold',
        label: weight > cutTo ? `قصّ إلى ${cutTo}%` : 'احتفظ',
        cutToWeight: cutTo, priority: 0,
        reason: `trigger ثابت: ${trig.label} — انطبق (السعر ${formatNum(price)} ≤ ${trig.price})` };
    }
  }

  // ── P1: بوابة الاستدامة (الفلتر 1) — فشل = خروج بغض النظر عن السعر ──
  if (sus.status === 'fail') {
    return { ...base, action: 'exit', label: 'خروج', priority: 1,
      reason: `فشل بوابة الاستدامة (الفلتر 1): ${sus.reason}` };
  }

  // ── P2: سقف الوزن (الفلتر 4) — تركيز فوق السقف يفرض القصّ ──
  const overWeight = weight > cap + 0.05; // هامش تقريب بسيط
  // ── P2: سقف القيمة (الفلتر 3) — مبالغة في التسعير تفرض القصّ (يلزم سعر صالح) ──
  const overValued = fv && priceOk ? price > fv.value * (1 + VALUE_CAP_MARGIN) : false;

  if (overWeight || overValued) {
    // أي سقف ينكسر أول يفرض القصّ (الدستور §5). سقف الوزن يحكم القصّ للنسبة.
    const reasons = [];
    if (overWeight) reasons.push(`كسر سقف الوزن (الفلتر 4): الوزن ${formatNum(weight)}% > السقف ${cap}%`);
    if (overValued) {
      let r = `تجاوز القيمة العادلة +${Math.round(VALUE_CAP_MARGIN*100)}% (الفلتر 3): السعر ${formatNum(price)} > العادلة ${formatNum(fv.value)}`;
      if (fvStale) r += ` ⚠ القيمة العادلة متقادمة (${fv.ageDays} يوم) — راجع الأرقام`;
      reasons.push(r);
    }
    return { ...base, action: 'trim',
      label: overWeight ? `قصّ لإرجاع الوزن إلى ${cap}%` : 'قصّ (مبالغة في التسعير)',
      cutToWeight: overWeight ? cap : null, priority: 2,
      reason: reasons.join(' | ') };
  }

  // ── P3: فرصة إضافة (الفلتر 3) — تحت القيمة + استدامة سليمة + وزن تحت الهدف ──
  // شروط إضافية لمنع توصيات خاطئة: سعر صالح، قيمة عادلة غير متقادمة،
  // وألّا يكون القطاع متجاوزاً سقف 25% (الفلتر 4 / §6).
  const inBuyZone = fv && priceOk && !banned && sus.status === 'pass'
      && price < fv.value * (1 - BUY_ZONE_MARGIN)
      && weight < targetWeight - 0.05;
  if (inBuyZone) {
    const sectorPct = (ctx.sectorPct && ctx.sectorPct[(h.sector || '').trim() || 'غير مصنّف']) || 0;
    const hasExplicitTarget = tgt.target_pct != null && +tgt.target_pct > 0;
    if (fvStale) {
      // لا نوصي بالشراء بناءً على تقييم متقادم — أعلِن الحاجة لتحديثه
      return { ...base, action: 'hold', label: 'احتفظ', priority: 9,
        reason: `في منطقة الشراء لكن القيمة العادلة متقادمة (${fv.ageDays} يوم) — حدّثها قبل أي إضافة (الدستور: الدورة 6 أشهر)` };
    }
    if (sectorPct > CAPS.sector) {
      // الإضافة تخالف سقف القطاع — لا تُرشَّح للإضافة
      return { ...base, action: 'hold', label: 'احتفظ', priority: 9,
        reason: `في منطقة الشراء لكن القطاع «${h.sector}» عند ${formatNum(sectorPct)}% > سقف ${CAPS.sector}% — الإضافة تضخّم تركيزاً قطاعياً (الفلتر 4)` };
    }
    if (!hasExplicitTarget) {
      // الدستور يفرّق السقف عن الهدف، والشراء «مشروط مو آلي». بلا نسبة هدف
      // صريحة لا تُطلَق توصية إضافة آلية — يُعرَض كمرشّح مع إرشاد لضبط الهدف.
      return { ...base, action: 'hold', label: 'مرشّح إضافة (يحتاج هدف)', priority: 4,
        buyZone: true,
        reason: `في منطقة الشراء (السعر ${formatNum(price)} < العادلة −${Math.round(BUY_ZONE_MARGIN*100)}% = ${formatNum(fv.value*(1-BUY_ZONE_MARGIN))}) + استدامة سليمة، لكن لا توجد نسبة هدف صريحة. حدّد الهدف في صفحة «أهداف الأسهم» لتفعيل توصية الإضافة (§4: الإضافة مشروطة مو آلية، والسقف ≠ الهدف)` };
    }
    return { ...base, action: 'add', label: 'أضف (مشروط)', priority: 3,
      reason: `منطقة شراء (الفلتر 3): السعر ${formatNum(price)} < العادلة −${Math.round(BUY_ZONE_MARGIN*100)}% (${formatNum(fv.value*(1-BUY_ZONE_MARGIN))}) + استدامة سليمة + الوزن ${formatNum(weight)}% < الهدف ${formatNum(targetWeight)}%` };
  }

  // ── احتفظ ──
  let holdReason;
  if (gaps.length) holdReason = `احتفظ — لا قاعدة قصّ/خروج انطبقت. بيانات غير متوفرة: ${gaps.join('، ')}`;
  else             holdReason = 'احتفظ — ضمن سقف الوزن وسقف القيمة، الاستدامة سليمة';
  return { ...base, action: 'hold', label: 'احتفظ', priority: 9, reason: holdReason };
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
  const [rH, rT, rEng, rVal] = await Promise.all([
    supabaseClient.from('holdings').select('ticker, name, sector, shares, avg_price, current_price, target_weight').order('ticker'),
    supabaseClient.from('stock_targets').select('ticker, target_pct, entry_price, exit_price'),
    loadUserSetting(ENGINE_STORE_KEY),
    loadUserSetting(VALUATION_HISTORY_KEY),
  ]);

  holdings = rH.data || [];
  stockTargets = {};
  (rT.data || []).forEach(r => { stockTargets[r.ticker] = r; });
  engineCfg = rEng || {};

  // أحدث قيمة عادلة محفوظة لكل رمز من سجل الحاسبة
  valuationFV = {};
  (rVal || []).forEach(entry => {
    const tk = (entry.inputs?.ticker || '').trim().toUpperCase();
    if (!tk) return;
    const parsed = parseFairValueRange(entry.results?.fairValueRange);
    if (parsed == null) return;
    // السجل مرتّب بالأحدث أولاً (unshift) → أول ظهور هو الأحدث.
    // entry.id = Date.now() وقت الحفظ → نستخدمه لحساب عمر القيمة العادلة بدقّة
    // (نص التاريخ بتقويم هجري يصعب تحليله، أما الـid فطابع زمني موثوق).
    if (!valuationFV[tk]) {
      const ts = typeof entry.id === 'number' ? entry.id : null;
      valuationFV[tk] = { value: parsed.avg, min: parsed.min, max: parsed.max,
                         date: (entry.date || '').split('،')[0] || '', ts };
    }
  });
}

// عمر القيمة العادلة بالأيام (أو null إن لم يتوفر طابع زمني)
const FV_STALE_DAYS = 180; // دورة الدستور 6 أشهر — أقدم من ذلك = متقادمة
function fvAgeDays(fv) {
  if (!fv || !fv.ts) return null;
  return Math.floor((Date.now() - fv.ts) / 86400000);
}

// يحوّل نص نتيجة الحاسبة ("12.50 — 18.30" أو "15.40 ر.س") إلى { avg, min, max }
// avg = نقطة الوسط (للإشارة بهوامش المالك)، min/max = حدّا النطاق (للشفافية)
function parseFairValueRange(str) {
  if (!str) return null;
  const nums = String(str).replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const vals = nums.map(Number).filter(n => n > 0);
  if (!vals.length) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, min, max };
}

// ══════════════════════════════════════════════════════════════════════
// تشغيل المحرّك + الرسم
// ══════════════════════════════════════════════════════════════════════
function runEngine() {
  const totalValue = holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);

  // نِسَب القطاعات — تُستخدم لمنع توصية «أضف» في قطاع متجاوز سقف 25% (الفلتر 4 / §6)
  const sectorPct = {};
  holdings.forEach(h => {
    const sec = (h.sector || '').trim() || 'غير مصنّف';
    sectorPct[sec] = (sectorPct[sec] || 0) + (totalValue > 0 ? (+h.shares * +h.current_price) / totalValue * 100 : 0);
  });
  const ctx = { totalValue, sectorPct };

  _results = holdings.map(h => evaluateHolding(h, ctx));

  renderSummaryStrip(totalValue);
  renderActionTable();
  renderSectorCheck(totalValue);
  renderAllTable();
}

// ── شريط ملخص علوي: عدّ الإجراءات + فجوات البيانات ──
function renderSummaryStrip(totalValue) {
  const el = document.getElementById('de-summary');
  if (!el) return;
  const n = (a) => _results.filter(r => r.action === a).length;
  const gapsFV  = _results.filter(r => r.fairValue == null).length;
  const gapsSus = _results.filter(r => r.sustain.status === 'unknown').length;
  const count = holdings.length;
  const sizeOk = count >= PORTFOLIO_SIZE.min && count <= PORTFOLIO_SIZE.max;

  el.innerHTML = `
    <div class="de-stat de-stat-exit"><div class="de-stat-num">${n('exit')}</div><div class="de-stat-lbl">خروج</div></div>
    <div class="de-stat de-stat-trim"><div class="de-stat-num">${n('trim')}</div><div class="de-stat-lbl">قصّ</div></div>
    <div class="de-stat de-stat-add"><div class="de-stat-num">${n('add')}</div><div class="de-stat-lbl">فرص إضافة</div></div>
    <div class="de-stat de-stat-hold"><div class="de-stat-num">${n('hold')}</div><div class="de-stat-lbl">احتفظ</div></div>
    <div class="de-stat"><div class="de-stat-num">${count} <span style="font-size:.6em;color:${sizeOk?'#10b981':'#f59e0b'}">${sizeOk?'✓':'⚠'}</span></div><div class="de-stat-lbl">عدد الأسهم (الهدف ${PORTFOLIO_SIZE.min}–${PORTFOLIO_SIZE.max})</div></div>
    <div class="de-stat de-stat-gap"><div class="de-stat-num">${gapsFV} / ${gapsSus}</div><div class="de-stat-lbl">ناقص: قيمة عادلة / استدامة</div></div>
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
    <tr>
      <td><span class="de-badge ${badgeFor(r)}">${r.label}</span></td>
      <td><strong>${r.ticker}</strong><br><span class="small text-muted">${escapeHtmlSafe(r.name)}</span></td>
      <td>${formatNum(r.weight)}%<br><span class="small text-muted">السقف ${r.cap}%</span></td>
      <td>${formatNum(r.price)}</td>
      <td>${r.fairValue != null ? formatNum(r.fairValue) : '<span class="text-muted">غير متوفرة</span>'}</td>
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
    const staleTag = r.fvStale ? `<br><span class="small" style="color:#f59e0b" title="أقدم من ${FV_STALE_DAYS} يوم">⏳ متقادمة (${r.fvAgeDays} يوم)</span>` : '';
    const rangeTag = (r.fairMin != null && r.fairMax != null && r.fairMax > r.fairMin)
      ? `<br><span class="small text-muted" title="نطاق النماذج">النطاق: ${formatNum(r.fairMin)} – ${formatNum(r.fairMax)}</span>` : '';
    const fvCell = r.fairValue != null
      ? `${formatNum(r.fairValue)}${rangeTag}<br><span class="small text-muted">${escapeHtmlSafe(r.fairSource||'')}</span>${staleTag}`
      : '<span class="text-muted">غير متوفرة</span>';
    const noteTag = r.specialNote ? ` <span title="${escapeHtmlSafe(r.specialNote)}" style="cursor:help">📌</span>` : '';
    return `
    <tr>
      <td><strong>${r.ticker}</strong> ${r.banned ? '<span title="ممنوع من توصية الشراء" class="de-banned">⛔</span>' : ''} ${r.blueChip ? '<span title="سهم قيادي — سقف 12%">⭐</span>' : ''}${noteTag}<br><span class="small text-muted">${escapeHtmlSafe(r.name)}</span></td>
      <td>${escapeHtmlSafe(ASSET_LABEL[r.assetType])}<br><span class="small text-muted">${escapeHtmlSafe(SUSTAIN_METRIC[r.assetType])}</span></td>
      <td>${formatNum(r.weight)}%<br><span class="small text-muted">السقف ${r.cap}%</span></td>
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
// شارة النتيجة: مرشّح منطقة الشراء (يحتاج هدف) له لون مميّز
function badgeFor(r) { return r.buyZone ? 'de-b-watch' : badgeClass(r.action); }
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
  const fv = valuationFV[ticker];

  document.getElementById('de-card-title').textContent = `بطاقة السهم — ${ticker} ${h.name}`;
  document.getElementById('de-card-sector').textContent = h.sector || '—';
  document.getElementById('de-card-autotype').textContent = ASSET_LABEL[autoType];
  document.getElementById('de-card-metric').textContent = SUSTAIN_METRIC[cfg.assetType || autoType];

  setSelect('de-card-assettype', cfg.assetType || '');
  setSelect('de-card-bluechip', cfg.blueChip === true ? 'yes' : cfg.blueChip === false ? 'no' : '');
  setSelect('de-card-covered', cfg.divCovered || '');
  setSelect('de-card-healthy', cfg.fundHealthy || '');
  setSelect('de-card-cut', cfg.divCut || '');
  document.getElementById('de-card-fairmanual').value = cfg.fairValueManual ?? '';
  document.getElementById('de-card-notes').value = cfg.notes || '';

  const fvHint = document.getElementById('de-card-fvhint');
  if (fv) {
    const age = fvAgeDays(fv);
    const staleMsg = age != null && age > FV_STALE_DAYS ? ` ⏳ متقادمة (${age} يوم) — حدّثها بإعادة تشغيل الحاسبة.` : '';
    fvHint.textContent = `قيمة عادلة محفوظة من الحاسبة: ${formatNum(fv.value)} (${fv.date}). اتركه فارغاً لاستخدامها.${staleMsg}`;
  } else {
    fvHint.textContent = 'لا توجد قيمة عادلة محفوظة لهذا السهم — أدخلها يدوياً أو شغّل حاسبة القيمة العادلة.';
  }

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
  const fm = v('de-card-fairmanual');
  cfg.fairValueManual = fm !== '' ? +fm : undefined;
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
    .filter(r => r.action !== 'hold')
    .sort((a, b) => a.priority - b.priority || b.weight - a.weight);
  if (!rows.length) { showToast('لا توجد إجراءات للتصدير', 'info'); return; }
  const head = ['الرمز','الاسم','الإجراء','الوزن%','السقف%','السعر','القيمة العادلة','السبب'];
  const lines = rows.map(r => [
    r.ticker, r.name, r.label, formatNum(r.weight), r.cap, formatNum(r.price),
    r.fairValue != null ? formatNum(r.fairValue) : 'غير متوفرة', r.reason,
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
