// أهداف الأسهم والقطاعات
let userStocks    = [];
let holdings      = [];
let stockTargets  = {};   // ticker → target_pct
// ── هدف صفر مقصود ≠ خانة فارغة ────────────────────────────────────────
// جدول stock_targets فيه target_pct NOT NULL DEFAULT 0، والحفظ يكتب صفاً لكل
// رمز، فأغلب الأصفار معناها «لم يُحدَّد» لا «صفِّه». لذلك لا يصحّ اعتبار الصفر
// أمر تصفية بذاته — كان سيحوّل كل سهم بلا هدف إلى أمر بيع.
// الحل بلا تعديل قاعدة البيانات: نميّز الصفر **المكتوب صراحةً** في الخانة عن
// الخانة الفارغة، ونحفظ قائمة الرموز المقصودة في user_settings.
const ZERO_TARGETS_KEY = 'stock_zero_targets_v1';
let zeroTargets = new Set();   // رموز هدفها صفر بقرار صريح = تصفية كاملة
function isZeroTarget(ticker) { return zeroTargets.has(ticker); }
let stockZones    = {};   // ticker → { entry_price, exit_price }
let sectorTargets = {};   // sector → target_pct
let taskMap       = {};   // ticker → latest active task
let taskZonesMap  = {};   // ticker → { accumulate_at, trim_from, liquidate_above }
let totalValue    = 0;
// آخر تقييم عادل لكل رمز من سجل حاسبة القيمة العادلة (valuation_history_v1)
// ticker → { fairValueAvg, fairValueRange, marginText, models, date, companyType }
let valuationLatest = {};

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'stock-targets': {
    title: '📌 أهداف الأسهم الفردية',
    body: `
      <p>«الهدف» هو النسبة التي تريد أن يمثّلها كل سهم من محفظتك. تحديدها مسبقاً يحميك من الانسياق العاطفي ويجعل قراراتك منهجية.</p>
      <div class="info-formula">الوزن الحالي = (أسهمك × السعر الحالي) ÷ إجمالي قيمة المحفظة × 100</div>
      <div class="info-math">
        • <strong>منطقة الشراء ≤:</strong> سعر تعتبره مناسباً للتجميع.<br>
        • <strong>منطقة البيع ≥:</strong> سعر تفكّر عنده في جني الأرباح.<br>
        • <strong>الحالة:</strong> ✅ ضمن الهدف · ⚠️ انحراف بسيط · 🔴 انحراف كبير يستدعي إعادة توازن.
      </div>
      <p class="info-note">💡 اجعل مجموع الأهداف ≈ 100%. السهم الذي يتجاوز هدفه كثيراً = تركّز مخاطرة؛ استخدم محرك إعادة التوازن في الأسفل.</p>`
  },
  'sector-targets': {
    title: '🏷️ أهداف القطاعات',
    body: `
      <p>كما توزّع أهدافاً للأسهم، توزّعها للقطاعات (بنوك، طاقة، اتصالات…) حتى لا تتركّز ثروتك في قطاع واحد ينهار معاً عند أزمة.</p>
      <div class="info-formula">وزن القطاع الحالي = مجموع قيمة أسهم القطاع ÷ إجمالي المحفظة × 100</div>
      <p class="info-note">💡 السوق السعودي قطاعاته محدودة؛ توزيع معقول على 4–6 قطاعات يكفي لتنويع جيّد دون تشتّت.</p>`
  },
};

// ══════════════════════════════════════════════════════════════════════
// جسر رموز التصميم — منسوخ حرفياً من أعلى js/dashboard.js
// (هذه الصفحة لا تحمّل dashboard.js). أي تعديل هناك يجب أن ينعكس هنا.
// قاعدة ثابتة: لا لون مكتوب يدوياً — كل لون يُقرأ من متغيّر CSS.
// ══════════════════════════════════════════════════════════════════════
function cssVar(name) {
  // الثيم الفاتح يُعرَّف على body.light-mode لا على :root — نقرأ من body أولاً
  const host = document.body || document.documentElement;
  return getComputedStyle(host).getPropertyValue(name).trim();
}
// لون سلسلة بيانات بالترتيب الثابت (1..6) — لا تُدوَّر عشوائياً
function seriesColor(i) { return cssVar('--series-' + ((Math.abs(i | 0) % 6) + 1)); }
// لون حالة: good / warn / bad — محجوز للحالة فقط، ودائماً مع أيقونة ونص
function stateColorOf(state) {
  return cssVar(state === 'good' ? '--st-good' : state === 'warn' ? '--st-warn'
    : state === 'bad' ? '--st-bad' : '--text-2');
}
// رأس بطاقة موحّد (.card-head)
function cardHead(title, sub, acts) {
  return `<div class="card-head"><span class="ttl">${title}` +
    (sub ? ` <span class="sub">${sub}</span>` : '') +
    `</span>` + (acts ? `<div class="acts">${acts}</div>` : '') + `</div>`;
}
// وسم حالة (.tag) — أيقونة + نص إلزاماً
function tagHtml(icon, text, state) {
  return `<span class="tag"${state ? ` data-state="${state}"` : ''}>${icon} ${text}</span>`;
}
// مقياس (.meter) — علامة الهدف اختيارية
function meterHtml({ label, valueTxt, pct, state = '', foot = '', markPct = null, fillColor = '' }) {
  const w = Math.max(0, Math.min(100, +pct || 0)).toFixed(1);
  return `<div class="meter"${state ? ` data-state="${state}"` : ''}>
      <div class="meter-head"><span class="k">${label}</span><span class="v">${valueTxt}</span></div>
      <div class="meter-wrap">
        <div class="meter-track"><div class="meter-fill" style="width:${w}%${fillColor ? `;background:${fillColor}` : ''}"></div></div>
        ${markPct != null ? `<div class="meter-mark" style="left:${Math.max(0, Math.min(100, markPct)).toFixed(1)}%"></div>` : ''}
      </div>
      ${foot ? `<div class="meter-foot">${foot}</div>` : ''}
    </div>`;
}
// صف وزن في قائمة (.brow)
function browHtml({ name, color, pct, valueTxt, diffTxt = '', diffState = '', barPct = null, title = '', sub = '' }) {
  const w = Math.max(0, Math.min(100, barPct == null ? pct : barPct)).toFixed(1);
  const dColor = diffState ? stateColorOf(diffState) : cssVar('--text-2');
  return `<div class="brow"${title ? ` title="${title}"` : ''}>
      <div class="br-k"><span class="dot" style="background:${color}"></span><span>${name}</span>${sub ? `<span class="small text-muted num">${sub}</span>` : ''}</div>
      <div class="br-track"><div class="br-fill" style="width:${w}%;background:${color}"></div></div>
      <div class="br-v">${valueTxt}${diffTxt ? `<span class="d" style="color:${dColor}">${diffTxt}</span>` : ''}</div>
    </div>`;
}
// ملاحظة داخل بطاقة (.note)
function noteHtml(icon, html, state = '') {
  return `<div class="note"${state ? ` data-state="${state}"` : ''}><span class="ic">${icon}</span><div>${html}</div></div>`;
}
// لوحة مفاتيح/قيم (.kvs) — items: [[label, value], …]
function kvsHtml(items) {
  return `<div class="kvs">${items.filter(Boolean)
    .map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
}

// ══════════════════════════════════════════════════════════════════════
// الأسقف الدستورية (CLAUDE.md §1) — نفس ثوابت decision-engine.js و watchlist.js
// ⚖️ قيود صلبة نافذة لا عرضية: تمنع الحفظ فوق السقف (saveAllTargets/saveSectorTargets)
// وتقصّ الهدف الفعّال في محرّك إعادة التوازن (min(الهدف المحفوظ، السقف)).
// منطقة السماح تُستخدم للتنبيه فقط — لا تدخل معادلة منع ولا معادلة شراء.
// ══════════════════════════════════════════════════════════════════════
const TG_CAP_SINGLE    = 7;     // سقف السهم الواحد
const TG_CAP_BLUECHIP  = 12;    // سقف السهم القيادي
const TG_CAP_BUFFER    = 0.75;  // منطقة سماح السهم/القيادي
const TG_CAP_SECTOR    = 25;    // سقف القطاع
const TG_SECTOR_BUFFER = 1.25;  // منطقة سماح القطاع
const TG_SIZE_MIN      = 18;    // أدنى حجم محفظة مستهدف
const TG_SIZE_MAX      = 25;    // أقصى حجم محفظة مستهدف

let engineCfg = {};   // ticker → مدخلات محرّك القرار (منها علم «قيادي» blueChip)

// هل السهم قيادي؟ — نفس منطق decision-engine.js/watchlist.js:
// علم blueChip اليدوي من إعدادات المحرّك، وأرامكو 2222 قيادية افتراضياً.
function tgIsBlueChip(ticker) {
  const cfg = engineCfg[ticker] || {};
  if (cfg.blueChip === true)  return true;
  if (cfg.blueChip === false) return false;
  return ticker === '2222';
}
function tgCapOf(ticker) { return tgIsBlueChip(ticker) ? TG_CAP_BLUECHIP : TG_CAP_SINGLE; }

// ── معرّف DOM موحّد لحقل هدف السهم (تناظر كتابة/قراءة) ─────────
// تُستخدم في التوليد (render) والقراءة (save/validate) معاً — أي محرف خاص
// في الرمز يتحول لنفس الشكل في الطرفين بدل esc() عند الكتابة والخام عند القراءة
function stInputId(ticker) {
  return 'st-' + String(ticker).replace(/[^\w؀-ۿ-]/g, '_');
}

// ── معرّف DOM لحقل هدف القطاع — خريطة فهرس رقمي فريد (لا تصادم نصي) ──
let _sectorIdMap = {};   // sector → index (تُبنى في renderSectorTargets)
function secInputId(sector) {
  const idx = _sectorIdMap[sector];
  return idx == null ? null : 'sec-i-' + idx;
}

// ── حالة الترتيب لجدول الأسهم ──────────────────────────────────
let _stSortField = '';    // الحقل المُرتَّب حالياً
let _stSortDir   = 'asc';

// ── حالة الترتيب لجدول القطاعات ────────────────────────────────
let _secSortField = '';
let _secSortDir   = 'asc';

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-targets');
  await loadAll();
}

// تحليل نص نطاق القيمة العادلة — نسخة حرفية من decision-engine.js/parseFairValueRange
// (المشروع يكرّر هذا المنطق عمداً: كل صفحة سكربت كلاسيكي مستقل). أي تعديل هناك
// يُطبَّق هنا وفي tasks.js/parseFairRange.
function _tgParseRange(str) {
  if (!str) return null;
  const normalized = String(str)
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٫/g, '.').replace(/[,،]/g, '');
  const nums = normalized.match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const vals = nums.map(Number).filter(n => n > 0);
  if (!vals.length) return null;
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, min: Math.min(...vals), max: Math.max(...vals) };
}

async function loadAll() {
  const [usRes, hRes, stRes, secRes, taskRes, engRes] = await Promise.all([
    supabaseClient.from('user_stocks').select('*').order('ticker'),
    supabaseClient.from('holdings').select('*'),
    supabaseClient.from('stock_targets').select('*'),
    supabaseClient.from('sector_targets').select('*'),
    // الترتيب إجباري: منطق «أول مهمة نصادفها لكل رمز هي الأحدث» يفترض الأحدث أولاً،
    // وبدون order يرجع Supabase ترتيباً غير مضمون
    supabaseClient.from('portfolio_tasks').select('type,ticker,status,accumulate_at,trim_from,liquidate_above').eq('status','active').order('created_at', { ascending: false }),
    // أعلام «قيادي» — نفس مصدر محرّك القرار؛ تُستخدم لعرض السقف الصحيح (7% أو 12%)
    loadUserSetting('decision_engine_v1').catch(() => ({})),
  ]);

  userStocks = usRes.data || [];
  holdings   = hRes.data || [];
  engineCfg  = (engRes && typeof engRes === 'object') ? engRes : {};

  // حساب إجمالي قيمة المحفظة
  totalValue = holdings.reduce((s, h) => s + (+h.shares * +h.current_price), 0);

  // بناء خرائط الأهداف
  stockTargets  = {};
  stockZones    = {};
  (stRes.data || []).forEach(r => {
    stockTargets[r.ticker] = +r.target_pct;
    stockZones[r.ticker]   = { entry_price: r.entry_price ?? null, exit_price: r.exit_price ?? null };
  });
  sectorTargets = {};
  (secRes.data || []).forEach(r => { sectorTargets[r.sector] = +r.target_pct; });

  // قائمة أهداف الصفر المقصودة (فشل التحميل = لا أصفار مقصودة، وهو الجانب الآمن)
  try {
    const z = await loadUserSetting(ZERO_TARGETS_KEY);
    zeroTargets = new Set(Array.isArray(z) ? z : []);
  } catch (_) { zeroTargets = new Set(); }

  // آخر مهمة فعّالة لكل رمز (أول مهمة نصادفها من الأحدث)
  taskMap      = {};
  taskZonesMap = {};
  (taskRes.data || []).forEach(t => {
    if (!t.ticker) return;
    if (!taskMap[t.ticker]) taskMap[t.ticker] = t.type;
    if (!taskZonesMap[t.ticker]) taskZonesMap[t.ticker] = {
      accumulate_at:   t.accumulate_at   ?? null,
      trim_from:       t.trim_from       ?? null,
      liquidate_above: t.liquidate_above ?? null,
    };
  });

  // تحديث stockZones من portfolio_tasks لضمان دقة محرك إعادة التوازن
  Object.entries(taskZonesMap).forEach(([ticker, tz]) => {
    if (!stockZones[ticker]) stockZones[ticker] = {};
    if (tz.accumulate_at)   stockZones[ticker].entry_price = tz.accumulate_at;
    if (tz.liquidate_above) stockZones[ticker].exit_price  = tz.liquidate_above;
  });

  // ── سجل حاسبة القيمة العادلة: آخر تقييم لكل رمز ──
  // المصدر نفسه الذي تحفظ فيه صفحة حاسبة القيمة العادلة سجلّها (user_settings).
  // السجل مرتّب بالأحدث أولاً (unshift)، فأول عملية نصادفها لكل رمز هي الأحدث.
  valuationLatest = {};
  try {
    const hist = await loadUserSetting('valuation_history_v1');
    if (Array.isArray(hist)) {
      hist.forEach(e => {
        const tk = (e?.inputs?.ticker || '').toUpperCase().trim();
        if (!tk || valuationLatest[tk]) return;          // أبقِ الأحدث فقط
        const res = e.results || {};
        valuationLatest[tk] = {
          // AUDIT-FIX 2026-08-21 (#47): كانت هذه الصفحة وحدها بلا احتياطي تحليل نص
          // النطاق — فالتقييم القديم المحفوظ بنص «١٢٠ – ١٤٠» بلا حقل fairValueAvg
          // رقمي يظهر رقماً في محرّك القرار (decision-engine.js:752) وفي المهام
          // (tasks.js:133) و«بلا تقييم» هنا. نفس منطق parseFairValueRange حرفياً.
          fairValueAvg:   (res.fairValueAvg != null && isFinite(+res.fairValueAvg) && +res.fairValueAvg > 0)
                            ? +res.fairValueAvg
                            : (_tgParseRange(res.fairValueRange)?.avg ?? null),
          fairValueRange: res.fairValueRange || null,
          marginText:     res.marginText || '',
          models:         Array.isArray(res.models) ? res.models : [],
          date:           e.date || '',
          // e.id هو Date.now() وقت إنشاء التقييم — الطابع الزمني الوحيد القابل
          // للقياس (حقل date نص هجري غير قابل للتحليل) — يُستخدم لشارة «قديم»
          ts:             (Number.isFinite(+e.id) && +e.id > 0) ? +e.id : null,
          companyType:    e.inputs?.companyType || 'normal',
        };
      });
    }
  } catch (_) { /* الشبكة/الصلاحيات — نكمل بلا تقييم */ }

  renderStockTargets();
  renderSectorTargets();
}

// ── حساب وزن السهم الحالي ──────────────────────────────────
function getStockWeight(ticker) {
  if (!totalValue) return 0;
  const h = holdings.find(x => x.ticker === ticker);
  if (!h) return 0;
  return (+h.shares * +h.current_price) / totalValue * 100;
}

// ── حساب وزن القطاع الحالي ─────────────────────────────────
// المصدر: holdings.sector (ما أدخله المستخدم في لوحة التحكم)
function getSectorWeight(sector) {
  if (!totalValue) return 0;
  let val = 0;
  holdings.forEach(h => {
    const sec = (h.sector || '').trim() || 'غير مصنف';
    if (sec === sector) val += +h.shares * +h.current_price;
  });
  return val / totalValue * 100;
}

// ── تحديد حالة التنبيه ─────────────────────────────────────
function getAlertThresholds() {
  return {
    green:  +(localStorage.getItem(userLsKey('tharwa-alert-green'))  ?? localStorage.getItem('tharwa-alert-green')  ?? 1),
    yellow: +(localStorage.getItem(userLsKey('tharwa-alert-yellow')) ?? localStorage.getItem('tharwa-alert-yellow') ?? 3),
  };
}

// ملاحظة: حقل state أُضيف للعرض فقط (وسم .tag ومقياس .meter) وهو اشتقاق حرفي
// من cls القائم — لا يغيّر أي عتبة ولا أي رقم.
function alertStatus(current, target) {
  if (!target) return { cls: '', state: '', icon: '—', label: '—' };
  const diff = current - target;
  const { green, yellow } = getAlertThresholds();
  if (Math.abs(diff) <= green)  return { cls: 'text-success', state: 'good', icon: '✅', label: 'ضمن الهدف' };
  if (Math.abs(diff) <= yellow) return { cls: 'text-accent',  state: 'warn', icon: '⚠️', label: diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`, rowCls: 'alert-row-yellow' };
  return { cls: 'text-danger', state: 'bad', icon: '🔴', label: diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`, rowCls: 'alert-row-red' };
}

// ── حساب ومراقبة إجمالي أهداف الأسهم ──────────────────────
function updateStockTotal() {
  let sum = 0;
  document.querySelectorAll('#stock-targets-tbody .target-input')
    .forEach(inp => { sum += +(inp.value) || 0; });

  const totalEl = document.getElementById('stock-total-pct');
  const barEl   = document.getElementById('stock-total-bar');
  const msgEl   = document.getElementById('stock-total-msg');
  if (!totalEl) return;

  totalEl.textContent = sum.toFixed(1) + '%';
  const capped = Math.min(sum, 100);
  if (barEl) barEl.style.width = capped + '%';

  if (sum > 100) {
    totalEl.className = 'bold text-danger';
    if (barEl) barEl.style.background = 'var(--danger)';
    if (msgEl) { msgEl.textContent = `⛔ تجاوزت 100% بمقدار ${(sum-100).toFixed(1)}% — يجب التعديل قبل الحفظ`; msgEl.className = 'total-msg total-msg-error'; }
  } else if (sum >= 99.9) {
    totalEl.className = 'bold text-success';
    if (barEl) barEl.style.background = 'var(--success)';
    if (msgEl) { msgEl.textContent = '✅ ممتاز — الأهداف موزعة على 100%'; msgEl.className = 'total-msg total-msg-ok'; }
  } else {
    totalEl.className = 'bold text-accent';
    if (barEl) barEl.style.background = 'var(--accent)';
    if (msgEl) { msgEl.textContent = `⚠️ تبقى ${(100-sum).toFixed(1)}% غير موزعة — يمكن الحفظ لكن التوزيع غير مكتمل`; msgEl.className = 'total-msg total-msg-warn'; }
  }
}

function updateStockTargetSumInFooter() {
  let sum = 0;
  document.querySelectorAll('#stock-targets-tbody .target-input')
    .forEach(inp => { sum += +(inp.value) || 0; });
  const el = document.getElementById('stock-target-sum');
  if (el) {
    el.textContent = sum.toFixed(1) + '%';
    el.className = sum > 100 ? 'text-danger bold' : sum >= 99.9 ? 'text-success bold' : 'text-accent bold';
  }
}

function attachStockListeners() {
  document.querySelectorAll('#stock-targets-tbody .target-input').forEach(inp => {
    inp.addEventListener('input', () => {
      let v = +(inp.value);
      if (v < 0)   { inp.value = 0;   v = 0; }
      if (v > 100) { inp.value = 100; v = 100; }
      // أزل إبراز المخالفة فور التعديل — الحكم يُعاد عند محاولة الحفظ التالية
      inp.classList.remove(CAP_BAD_CLS);
      inp.closest('tr')?.classList.remove(CAP_BAD_CLS);
      updateStockTotal();
      updateStockTargetSumInFooter();
    });
  });
  updateStockTotal();
  updateStockTargetSumInFooter();
}

// ── حساب ومراقبة إجمالي أهداف القطاعات ────────────────────
function updateSectorTotal() {
  let sum = 0;
  document.querySelectorAll('#sector-targets-tbody .target-input')
    .forEach(inp => { sum += +(inp.value) || 0; });

  const totalEl = document.getElementById('sector-total-pct');
  const barEl   = document.getElementById('sector-total-bar');
  const msgEl   = document.getElementById('sector-total-msg');
  if (!totalEl) return;

  totalEl.textContent = sum.toFixed(1) + '%';
  const capped = Math.min(sum, 100);
  if (barEl) barEl.style.width = capped + '%';

  if (sum > 100) {
    totalEl.className = 'bold text-danger';
    if (barEl) barEl.style.background = 'var(--danger)';
    if (msgEl) { msgEl.textContent = `⛔ تجاوزت 100% بمقدار ${(sum-100).toFixed(1)}% — يجب التعديل قبل الحفظ`; msgEl.className = 'total-msg total-msg-error'; }
  } else if (sum >= 99.9) {
    totalEl.className = 'bold text-success';
    if (barEl) barEl.style.background = 'var(--success)';
    if (msgEl) { msgEl.textContent = '✅ ممتاز — الأهداف موزعة على 100%'; msgEl.className = 'total-msg total-msg-ok'; }
  } else {
    totalEl.className = 'bold text-accent';
    if (barEl) barEl.style.background = 'var(--accent)';
    if (msgEl) { msgEl.textContent = `⚠️ تبقى ${(100-sum).toFixed(1)}% غير موزعة — يمكن الحفظ لكن التوزيع غير مكتمل`; msgEl.className = 'total-msg total-msg-warn'; }
  }
}

function updateSectorTargetSumInFooter() {
  let sum = 0;
  document.querySelectorAll('#sector-targets-tbody .target-input')
    .forEach(inp => { sum += +(inp.value) || 0; });
  const el = document.getElementById('sector-target-sum');
  if (el) {
    el.textContent = sum.toFixed(1) + '%';
    el.className = sum > 100 ? 'text-danger bold' : sum >= 99.9 ? 'text-success bold' : 'text-accent bold';
  }
}

function attachSectorListeners() {
  document.querySelectorAll('#sector-targets-tbody .target-input').forEach(inp => {
    inp.addEventListener('input', () => {
      let v = +(inp.value);
      if (v < 0)   { inp.value = 0;   v = 0; }
      if (v > 100) { inp.value = 100; v = 100; }
      inp.classList.remove(CAP_BAD_CLS);
      inp.closest('tr')?.classList.remove(CAP_BAD_CLS);
      updateSectorTotal();
      updateSectorTargetSumInFooter();
    });
  });
  updateSectorTotal();
  updateSectorTargetSumInFooter();
}

// ── badge المهمة ─────────────────────────────────────────────
// اللون صار من رموز الحالة (.tag[data-state]) بدل أكواد سداسية مكتوبة يدوياً.
const TASK_BADGE = {
  liquidation:  { label: 'تصفية',    icon: '🔴', state: 'bad'  },
  reduction:    { label: 'تخفيف',    icon: '⚖️', state: 'warn' },
  monitoring:   { label: 'مراقبة',   icon: '👁️', state: ''     },
  accumulation: { label: 'تجميع',    icon: '🟢', state: 'good' },
  hold:         { label: 'احتفاظ',   icon: '🔵', state: ''     },
};

function taskBadgeHtml(ticker) {
  const type = taskMap[ticker];
  if (!type) return '<span class="small text-muted">—</span>';
  const b = TASK_BADGE[type];
  // نوع غير معروف (خارج TASK_BADGE) يأتي من DB — يُهرَّب قبل الحقن في HTML
  const label = b ? b.label : esc(type);
  const icon  = b ? b.icon  : '•';
  return `<span class="tag"${b && b.state ? ` data-state="${b.state}"` : ''} title="مهمة فعّالة: ${label}">${icon} ${label}</span>`;
}

// ══════════════════════════════════════════════════════════════════════
// مقياس الوزن في صفّ الجدول — الفكرة المركزية للصفحة
// شريط واحد يحمل ثلاث حقائق على سلّم واحد مشترك بين كل الصفوف:
//   • التعبئة  = الوزن الحالي
//   • علامة داكنة = الهدف الذي حدّدته
//   • خط أحمر  = السقف الدستوري (CLAUDE.md §1)
// فيُقرأ الانحراف وكسر السقف بالنظر بدل مقارنة رقمين ذهنياً.
// السلّم موحّد (0..scale%) كي يعني الشريط الأطول وزناً أكبر فعلاً.
// ══════════════════════════════════════════════════════════════════════
function weightMeterHtml({ current, target, cap, scale, state, title }) {
  const p = v => Math.max(0, Math.min(100, (+v || 0) / scale * 100)).toFixed(1);
  return `<div class="meter wmeter"${state ? ` data-state="${state}"` : ''} title="${esc(title || '')}">
      <div class="meter-wrap">
        <div class="meter-track"><div class="meter-fill" style="width:${p(current)}%"></div></div>
        ${target > 0 ? `<div class="meter-mark" data-k="tgt" style="left:${p(target)}%"></div>` : ''}
        ${cap  > 0 && cap  <= scale ? `<div class="meter-mark" data-k="cap" style="left:${p(cap)}%"></div>` : ''}
      </div>
    </div>`;
}

// ── ترتيب جدول الأسهم ──────────────────────────────────────
function sortStockTargets(field) {
  if (_stSortField === field) _stSortDir = _stSortDir === 'asc' ? 'desc' : 'asc';
  else { _stSortField = field; _stSortDir = 'asc'; }
  renderStockTargets();
}

function _stArrow(field) {
  if (_stSortField !== field) return '<span class="sort-arrow">↕</span>';
  return `<span class="sort-arrow active">${_stSortDir === 'asc' ? '↑' : '↓'}</span>`;
}

// ── ترتيب جدول القطاعات ────────────────────────────────────
function sortSectorTargets(field) {
  if (_secSortField === field) _secSortDir = _secSortDir === 'asc' ? 'desc' : 'asc';
  else { _secSortField = field; _secSortDir = 'asc'; }
  renderSectorTargets();
}

function _secArrow(field) {
  if (_secSortField !== field) return '<span class="sort-arrow">↕</span>';
  return `<span class="sort-arrow active">${_secSortDir === 'asc' ? '↑' : '↓'}</span>`;
}

// ── رسم جدول الأسهم ────────────────────────────────────────
// المصدر: holdings (المحفظة الحالية) + كل user_stocks غير الموجودة (مخطط لها)
function renderStockTargets() {
  const tbody = document.getElementById('stock-targets-tbody');

  const userStockMap = {};
  userStocks.forEach(s => { userStockMap[s.ticker] = s; });

  const holdingTickers = new Set(holdings.map(h => h.ticker));

  // الأسهم الموجودة فعلاً في المحفظة
  const activeStocks = holdings.map(h => ({
    ticker:  h.ticker,
    name:    h.name,
    sector:  (h.sector || '').trim() || 'غير مصنف',
    planned: false,
  }));

  // أسهم user_stocks غير الموجودة في holdings → مخططة
  const plannedStocks = userStocks
    .filter(s => !holdingTickers.has(s.ticker))
    .map(s => ({
      ticker:  s.ticker,
      name:    s.name,
      sector:  s.sector || '—',
      planned: true,
    }));

  let allStocks = [...activeStocks, ...plannedStocks];

  // ── تطبيق الترتيب ─────────────────────────────────────────
  if (_stSortField) {
    allStocks = [...allStocks].sort((a, b) => {
      let av, bv;
      const aZone = stockZones[a.ticker] || {};
      const bZone = stockZones[b.ticker] || {};
      switch (_stSortField) {
        case 'ticker':  av = a.ticker;  bv = b.ticker;  break;
        case 'name':    av = a.name;    bv = b.name;    break;
        case 'sector':  av = a.sector;  bv = b.sector;  break;
        // entry/exit: القيمة المدمجة نفسها التي يقرأها محرك إعادة التوازن (stockZones)
        case 'entry':   av = +(aZone.entry_price||0);                       bv = +(bZone.entry_price||0);                       break;
        case 'trim':    av = +(taskZonesMap[a.ticker]?.trim_from||0);       bv = +(taskZonesMap[b.ticker]?.trim_from||0);       break;
        case 'exit':    av = +(aZone.exit_price||0);                        bv = +(bZone.exit_price||0);                        break;
        case 'target':  av = stockTargets[a.ticker]||0; bv = stockTargets[b.ticker]||0; break;
        case 'current': av = getStockWeight(a.ticker); bv = getStockWeight(b.ticker); break;
        case 'status': {
          const al = alertStatus(getStockWeight(a.ticker), stockTargets[a.ticker]||0);
          const bl = alertStatus(getStockWeight(b.ticker), stockTargets[b.ticker]||0);
          av = al.cls; bv = bl.cls; break;
        }
        default: av = a.ticker; bv = b.ticker;
      }
      const cmp = typeof av === 'number'
        ? av - bv
        : String(av||'').localeCompare(String(bv||''));
      return _stSortDir === 'asc' ? cmp : -cmp;
    });
  }

  if (!allStocks.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">
      <div class="icon">📋</div>
      <p>لا توجد أسهم — أضف معاملات أو أضف أسهماً لـ<a href="userdb.html" class="link-accent">قاعدة بياناتك</a></p>
    </div></td></tr>`;
    return;
  }

  // الإجمالي الحالي من الأسهم الفعلية فقط (المخطط = 0)
  const totalCurrentPct = activeStocks.reduce((s, st) => s + getStockWeight(st.ticker), 0);

  // ── سلّم مشترك لكل الصفوف ──────────────────────────────────
  // يبدأ من سقف القيادي + هامش كي تظهر خطوط السقف دائماً، ويتمدّد فقط إذا
  // تجاوزه وزن أو هدف فعلي. سلّم واحد ⇒ الشريط الأطول = وزن أكبر حقيقةً.
  const _stScaleMax = Math.max(
    TG_CAP_BLUECHIP + 3,
    ...allStocks.map(s => Math.max(getStockWeight(s.ticker), stockTargets[s.ticker] || 0) * 1.12)
  );

  tbody.innerHTML = allStocks.map(s => {
    const target   = stockTargets[s.ticker] || 0;
    const tz       = taskZonesMap[s.ticker] || {};
    const zone     = stockZones[s.ticker]   || {};   // المدمج: مهام + قيم DB القديمة
    const current  = getStockWeight(s.ticker);   // 0 للمخطط
    const al       = s.planned ? { cls: 'text-muted', state: '', icon: '📌', label: 'مخطط', rowCls: 'planned-row' }
                                : alertStatus(current, target);
    const cap      = tgCapOf(s.ticker);
    const capLimit = cap + TG_CAP_BUFFER;
    // تنبيه عرضي فقط (لا يمنع الحفظ ولا يغيّر أي حساب) — الفلتر 4 في CLAUDE.md
    const capBreachNow = !s.planned && current > capLimit;
    const capBreachTgt = target > capLimit;

    const fmtZone = v => v ? `<span class="num small">${formatSAR(v)}</span>` : `<span class="text-muted small">—</span>`;
    // نعرض القيمة المدمجة نفسها التي يستخدمها محرك إعادة التوازن، مع وسم مصدرها:
    // «مهمة» = من مهمة نشطة في صفحة التقييمات · «محفوظ» = قيمة سابقة في stock_targets
    const srcTag = fromTask => `<span class="src-tag"
      title="${fromTask ? 'المصدر: مهمة نشطة في صفحة التقييمات' : 'المصدر: قيمة محفوظة سابقاً في أهداف الأسهم — لا مهمة نشطة'}">${fromTask ? 'مهمة' : 'محفوظ'}</span>`;
    const zoneCell = (mergedVal, taskVal) =>
      mergedVal ? `${fmtZone(mergedVal)} ${srcTag(!!taskVal)}` : fmtZone(mergedVal);

    const capNote = tgIsBlueChip(s.ticker) ? 'قيادي — السقف 12%' : 'السقف 7%';
    const meterCell = s.planned
      ? '<div class="small text-muted">لم يُشترَ بعد — لا وزن</div>'
      : weightMeterHtml({
          current, target, cap, scale: _stScaleMax, state: al.state,
          title: `الوزن الحالي ${current.toFixed(2)}% · الهدف ${target || 0}% · ${capNote} (+${TG_CAP_BUFFER} سماح)`,
        });

    return `<tr class="${al.rowCls || ''}">
      <td>${taskBadgeHtml(s.ticker)}</td>
      <td><strong class="text-accent">${esc(s.ticker)}</strong></td>
      <td>${esc(s.name)}</td>
      <td class="small text-muted">${esc(s.sector)}</td>
      <td>${zoneCell(zone.entry_price, tz.accumulate_at)}</td>
      <td class="text-accent">${fmtZone(tz.trim_from)}</td>
      <td>${zoneCell(zone.exit_price, tz.liquidate_above)}</td>
      <td>
        <input class="target-input" type="number" min="0" max="100" step="0.1"
               id="${stInputId(s.ticker)}" value="${isZeroTarget(s.ticker) ? '0' : (target || '')}" placeholder="—">
        <span class="small text-muted"> %</span>
        ${isZeroTarget(s.ticker) ? `<div class="mini-warn" title="هدفك لهذا السهم صفر — محرّك القرار يقرأها أمر تصفية كاملة. امسح الخانة لإلغاء ذلك.">🔴 هدف صفر = تصفية</div>` : ''}
        ${capBreachTgt ? `<div class="mini-warn" title="الهدف المحفوظ يتجاوز السقف الدستوري ${cap}% + سماح ${TG_CAP_BUFFER}%">⛔ هدف فوق السقف</div>` : ''}
      </td>
      <td class="wcell">
        <div class="wcell-num num bold ${al.cls}">${s.planned ? '<span class="small">مخطط</span>' : current.toFixed(2) + '%'}<span class="wcell-tgt small text-muted"> / هدف ${target ? target + '%' : '—'}</span></div>
        ${meterCell}
      </td>
      <td class="stcell">${tagHtml(al.icon, al.label, al.state || '')}${capBreachNow ? tagHtml('⛔', `فوق سقف ${cap}%`, 'bad') : ''}</td>
    </tr>`;
  }).join('');

  // صف الإجمالي — 10 أعمدة بالضبط مطابقةً للترويسة
  const currCls = Math.abs(totalCurrentPct - 100) < 0.5 ? 'text-success' : 'text-accent';
  const tfoot = tbody.closest('table').querySelector('tfoot') || tbody.closest('table').createTFoot();
  tfoot.innerHTML = `<tr class="tfoot-row">
    <td colspan="4"><strong class="small">إجمالي الأوزان الحالية</strong></td>
    <td colspan="3"></td>
    <td class="small text-muted">الهدف الإجمالي: <span id="stock-target-sum">—</span></td>
    <td class="num bold ${currCls}">${totalCurrentPct.toFixed(2)}%</td>
    <td><span class="small text-muted">${Math.abs(totalCurrentPct - 100) < 0.1 ? '✅ يساوي 100%' : Math.abs(totalCurrentPct - 100) < 1 ? '≈ 100%' : totalCurrentPct < 100 ? 'بقي ' + (100 - totalCurrentPct).toFixed(2) + '%' : 'تجاوز بـ ' + (totalCurrentPct - 100).toFixed(2) + '%'}</span></td>
  </tr>`;

  // تحديث سهام الترتيب في الهيدر
  ['ticker','name','sector','entry','trim','exit','target','current','status'].forEach(f => {
    const el = document.getElementById('st-arr-' + f);
    if (el) el.outerHTML = _stArrow(f).replace('class="sort-arrow', `id="st-arr-${f}" class="sort-arrow`);
  });

  attachStockListeners();
  updateStockTargetSumInFooter();
  renderTargetsSummary();
}

// ── رسم جدول القطاعات ──────────────────────────────────────
function renderSectorTargets() {
  const tbody = document.getElementById('sector-targets-tbody');

  // القطاعات الظاهرة: من holdings.sector (ما أدخله المستخدم) + أي أهداف محفوظة
  const sectorSet = new Set([
    ...holdings.map(h => (h.sector || '').trim() || 'غير مصنف'),
    ...Object.keys(sectorTargets)
  ]);
  let sectors = [...sectorSet].filter(Boolean);

  // ── ترتيب القطاعات ────────────────────────────────────────
  if (_secSortField) {
    sectors = sectors.sort((a, b) => {
      let av, bv;
      switch (_secSortField) {
        case 'sector':  av = a;                   bv = b;                   break;
        case 'target':  av = sectorTargets[a]||0; bv = sectorTargets[b]||0; break;
        case 'current': av = getSectorWeight(a);  bv = getSectorWeight(b);  break;
        case 'status': {
          const al = alertStatus(getSectorWeight(a), sectorTargets[a]||0);
          const bl = alertStatus(getSectorWeight(b), sectorTargets[b]||0);
          av = al.cls; bv = bl.cls; break;
        }
        default: av = a; bv = b;
      }
      const cmp = typeof av === 'number' ? av - bv : String(av||'').localeCompare(String(bv||''));
      return _secSortDir === 'asc' ? cmp : -cmp;
    });
  } else {
    sectors = sectors.sort(); // الافتراضي: أبجدي
  }

  if (!sectors.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="icon">🏷️</div><p>لا توجد قطاعات بعد</p></div></td></tr>`;
    _sectorIdMap = {};   // لا تُبقِ خريطة قديمة تشير لعناصر DOM لم تعد موجودة
    return;
  }

  // خريطة sector → فهرس رقمي فريد: التطبيع النصي القديم كان قابلاً للتصادم
  // (قطاعان يختلفان بمحرف خاص فقط ينتجان نفس الـ id فيُقرأ هدف أحدهما للآخر)
  _sectorIdMap = {};
  sectors.forEach((sec, i) => { _sectorIdMap[sec] = i; });

  // سلّم مشترك: يبدأ من سقف القطاع + هامش كي يظهر خط الـ25% دائماً
  const _secScaleMax = Math.max(
    TG_CAP_SECTOR + 5,
    ...sectors.map(sec => Math.max(getSectorWeight(sec), sectorTargets[sec] || 0) * 1.12)
  );

  tbody.innerHTML = sectors.map(sec => {
    const target       = sectorTargets[sec] || 0;
    const current      = getSectorWeight(sec);
    const al           = alertStatus(current, target);
    const capLimit     = TG_CAP_SECTOR + TG_SECTOR_BUFFER;
    const capBreachNow = current > capLimit;    // تنبيه عرضي (الفلتر 4) — لا يغيّر حساباً
    const capBreachTgt = target  > capLimit;

    return `<tr class="${al.rowCls || ''}">
      <td><strong>${esc(sec)}</strong></td>
      <td>
        <input class="target-input" type="number" min="0" max="100" step="0.1"
               id="${secInputId(sec)}" value="${target || ''}" placeholder="0">
        <span class="small text-muted"> %</span>
        ${capBreachTgt ? `<div class="mini-warn" title="هدف القطاع يتجاوز السقف الدستوري ${TG_CAP_SECTOR}% + سماح ${TG_SECTOR_BUFFER}%">⛔ هدف فوق السقف</div>` : ''}
      </td>
      <td class="wcell">
        <div class="wcell-num num bold ${al.cls}">${current.toFixed(2)}%<span class="wcell-tgt small text-muted"> / هدف ${target ? target + '%' : '—'}</span></div>
        ${weightMeterHtml({
          current, target, cap: TG_CAP_SECTOR, scale: _secScaleMax, state: al.state,
          title: `وزن القطاع ${current.toFixed(2)}% · الهدف ${target || 0}% · السقف الدستوري ${TG_CAP_SECTOR}% (+${TG_SECTOR_BUFFER} سماح)`,
        })}
      </td>
      <td class="stcell">${tagHtml(al.icon, al.label, al.state || '')}${capBreachNow ? tagHtml('⛔', `فوق سقف ${TG_CAP_SECTOR}%`, 'bad') : ''}</td>
    </tr>`;
  }).join('');

  // صف الإجمالي للقطاعات — 4 أعمدة بالضبط مطابقةً للترويسة
  // AUDIT-FIX: totalSecCurrentPct was undefined — compute it from sector weights
  const totalSecCurrentPct = sectors.reduce((s, sec) => s + getSectorWeight(sec), 0);
  const secCurrCls = Math.abs(totalSecCurrentPct - 100) < 0.5 ? 'text-success' : 'text-accent';
  const stfoot = tbody.closest('table').querySelector('tfoot') || tbody.closest('table').createTFoot();
  stfoot.innerHTML = `<tr class="tfoot-row">
    <td><strong class="small">الإجمالي</strong></td>
    <td class="small text-muted">الهدف: <span id="sector-target-sum">—</span></td>
    <td class="num bold ${secCurrCls}">${totalSecCurrentPct.toFixed(2)}%</td>
    <td><span class="small text-muted">${Math.abs(totalSecCurrentPct - 100) < 0.1 ? '✅ يساوي 100%' : Math.abs(totalSecCurrentPct - 100) < 1 ? '≈ 100%' : totalSecCurrentPct < 100 ? 'بقي ' + (100 - totalSecCurrentPct).toFixed(2) + '%' : 'تجاوز بـ ' + (totalSecCurrentPct - 100).toFixed(2) + '%'}</span></td>
  </tr>`;

  // تحديث سهام الترتيب في الهيدر
  ['sector','target','current','status'].forEach(f => {
    const el = document.getElementById('sec-arr-' + f);
    if (el) el.outerHTML = _secArrow(f).replace('class="sort-arrow', `id="sec-arr-${f}" class="sort-arrow`);
  });

  // ربط المستمعات للقطاعات
  attachSectorListeners();
  updateSectorTargetSumInFooter();
  renderTargetsSummary();
}

// ══════════════════════════════════════════════════════════════════════
// 🧭 بطاقة الانضباط — الرقم القائد للصفحة
// عرض فقط: تقرأ نفس الأوزان والأهداف المحفوظة وتلخّص حالتها مقابل دستور
// CLAUDE.md §1 (سقف السهم/القيادي/القطاع + حجم المحفظة 18–25).
// لا تحسب شيئاً جديداً ولا تؤثر على الحفظ أو محرك التوازن.
// ══════════════════════════════════════════════════════════════════════
function renderTargetsSummary() {
  const el = document.getElementById('targets-summary');
  if (!el) return;

  const holdingTickers = new Set(holdings.map(h => h.ticker));
  const owned = holdings.map(h => h.ticker);
  const plannedCount = userStocks.filter(s => !holdingTickers.has(s.ticker)).length;

  if (!owned.length) {
    el.innerHTML = `<div class="card">${cardHead('🧭 انضباط الأوزان', 'مقابل دستور المحفظة')}
      ${noteHtml('💡', 'لا توجد أسهم مملوكة بعد — أضف معاملات في <a href="transactions.html" class="link-accent">سجل المعاملات</a> ليُحسب الوزن الحالي وتظهر مقارنته بالهدف والسقف.', '')}</div>`;
    return;
  }

  // ── تصنيف كل سهم مملوك ──────────────────────────────────────
  let inTarget = 0, withTarget = 0;
  const capBreaks = [], tgtCapBreaks = [], farOff = [];
  owned.forEach(t => {
    const target = stockTargets[t] || 0;
    const cur    = getStockWeight(t);
    const limit  = tgCapOf(t) + TG_CAP_BUFFER;
    if (cur > limit)    capBreaks.push({ t, cur, cap: tgCapOf(t) });
    if (target > limit) tgtCapBreaks.push({ t, target, cap: tgCapOf(t) });
    if (target > 0) {
      withTarget++;
      const al = alertStatus(cur, target);
      if (al.state === 'good') inTarget++;
      else if (al.state === 'bad') farOff.push({ t, cur, target });
    }
  });

  // ── القطاعات ────────────────────────────────────────────────
  const secSet = new Set([...holdings.map(h => (h.sector || '').trim() || 'غير مصنف'), ...Object.keys(sectorTargets)]);
  const secBreaks = [];
  [...secSet].forEach(sec => {
    const w = getSectorWeight(sec);
    if (w > TG_CAP_SECTOR + TG_SECTOR_BUFFER) secBreaks.push({ sec, w });
  });

  const disciplinePct = withTarget > 0 ? inTarget / withTarget * 100 : 0;
  const dState = withTarget === 0 ? '' : disciplinePct >= 80 ? 'good' : disciplinePct >= 50 ? 'warn' : 'bad';
  const n = owned.length;
  const sizeState = n >= TG_SIZE_MIN && n <= TG_SIZE_MAX ? 'good' : 'warn';
  const sizeIcon  = n >= TG_SIZE_MIN && n <= TG_SIZE_MAX ? '✅' : n < TG_SIZE_MIN ? '⚠️' : '⚠️';

  const savedTargetSum = owned.concat(userStocks.filter(s => !holdingTickers.has(s.ticker)).map(s => s.ticker))
    .reduce((s, t) => s + (stockTargets[t] || 0), 0);
  const sumState = savedTargetSum > 100.05 ? 'bad' : savedTargetSum >= 99.9 ? 'good' : 'warn';

  const detailList = (title, items) => items.length
    ? `<div class="sum-det"><div class="sum-det-t">${title}</div><ul class="sum-ul">${items.join('')}</ul></div>` : '';

  el.innerHTML = `<div class="card">
    ${cardHead('🧭 انضباط الأوزان', 'مقابل دستور المحفظة — CLAUDE.md §1')}
    <div class="sum-grid">
      <div>
        <div class="hero-num">${disciplinePct.toFixed(0)}<span class="unit">%</span></div>
        <div class="hero-cap">${inTarget} من ${withTarget} سهماً لها هدف محدَّد وهي ضمنه${plannedCount ? ` · ${plannedCount} سهماً مخطّطاً بلا وزن` : ''}</div>
      </div>
      <div class="sum-tags">
        ${tagHtml(sizeIcon, `حجم المحفظة ${n} سهم (المستهدف ${TG_SIZE_MIN}–${TG_SIZE_MAX})`, sizeState)}
        ${tagHtml(capBreaks.length ? '⛔' : '✅', `وزن فوق سقف السهم: ${capBreaks.length}`, capBreaks.length ? 'bad' : 'good')}
        ${tagHtml(secBreaks.length ? '⛔' : '✅', `قطاع فوق ${TG_CAP_SECTOR}%: ${secBreaks.length}`, secBreaks.length ? 'bad' : 'good')}
        ${tagHtml(tgtCapBreaks.length ? '⚠️' : '✅', `هدف فوق السقف: ${tgtCapBreaks.length}`, tgtCapBreaks.length ? 'warn' : 'good')}
        ${tagHtml(sumState === 'good' ? '✅' : sumState === 'bad' ? '⛔' : '⚠️', `مجموع الأهداف المحفوظة ${savedTargetSum.toFixed(1)}%`, sumState)}
      </div>
    </div>
    ${capBreaks.length || secBreaks.length || tgtCapBreaks.length || farOff.length ? `
    <details class="sum-more">
      <summary>تفصيل ما يحتاج إجراء (${capBreaks.length + secBreaks.length + tgtCapBreaks.length + farOff.length})</summary>
      ${detailList('⛔ وزن حالي فوق سقف السهم — الفلتر 4: خفّف لإرجاعه للسقف',
        capBreaks.map(b => `<li><strong>${esc(b.t)}</strong> — ${b.cur.toFixed(2)}% مقابل سقف ${b.cap}% (+${TG_CAP_BUFFER} سماح)</li>`))}
      ${detailList(`⛔ قطاع فوق ${TG_CAP_SECTOR}% — تركيز قطاعي`,
        secBreaks.map(b => `<li><strong>${esc(b.sec)}</strong> — ${b.w.toFixed(2)}%</li>`))}
      ${detailList('⚠️ هدف محفوظ يتجاوز السقف الدستوري — راجع الهدف نفسه',
        tgtCapBreaks.map(b => `<li><strong>${esc(b.t)}</strong> — الهدف ${b.target}% مقابل سقف ${b.cap}%</li>`))}
      ${detailList('🔴 انحراف كبير عن الهدف',
        farOff.map(b => `<li><strong>${esc(b.t)}</strong> — ${b.cur.toFixed(2)}% مقابل هدف ${b.target}%</li>`))}
    </details>` : ''}
    ${noteHtml('ℹ️', `الأوزان محسوبة من قيمة الأسهم المملوكة فقط (${formatSAR(totalValue)}) — النقد غير المستثمر والأصول الأخرى خارج هذا المقام.`, '')}
  </div>`;
}

// ── تحقق: أهداف الأسهم داخل القطاع لا تتجاوز هدف القطاع ─
function validateSectorConsistency() {
  // بناء خريطة: sector → { stockSum, sectorTarget }
  const sectorStockSum = {};

  const holdingTickers = new Set(holdings.map(h => h.ticker));
  const userStockMap   = {};
  userStocks.forEach(s => { userStockMap[s.ticker] = s; });
  const allTickers = [
    ...holdings.map(h => ({ ticker: h.ticker, sector: (h.sector||'').trim()||'غير مصنف' })),
    ...userStocks.filter(s => !holdingTickers.has(s.ticker))
      .map(s => ({ ticker: s.ticker, sector: s.sector || '—' })),
  ];

  allTickers.forEach(({ ticker, sector }) => {
    const pct = +(document.getElementById(stInputId(ticker))?.value || 0);
    sectorStockSum[sector] = (sectorStockSum[sector] || 0) + pct;
  });

  const violations = [];
  Object.entries(sectorStockSum).forEach(([sector, stockSum]) => {
    const secTarget = sectorTargets[sector] || 0;
    if (secTarget > 0 && stockSum > secTarget + 0.05) {
      violations.push({ sector, stockSum, secTarget });
    }
  });

  return violations;
}

// ══════════════════════════════════════════════════════════════════════
// 🚧 حارس الأسقف الدستورية عند الحفظ (CLAUDE.md §1 — «قيود صلبة، ممنوع تليينها»)
// هدف فوق سقفه لا يُحفَظ أصلاً: منعه هنا يمنع كل ما يُبنى عليه لاحقاً.
// استثناء وحيد: هدف يساوي السقف بالضبط مسموح (السقف نفسه ليس مخالفة).
// منطقة السماح (0.75/1.25) لا تدخل هنا: هي «لا تنبّه ضمنها» لا إذن بتجاوز الهدف.
// ══════════════════════════════════════════════════════════════════════
const TG_CAP_EPS  = 1e-9;             // تسامح عائم فقط — لا منطقة سماح
const CAP_BAD_CLS = 'cap-violation';  // إبراز بصري للصف والحقل المخالفين

function clearCapHighlights(tbodyId) {
  document.querySelectorAll(`#${tbodyId} .${CAP_BAD_CLS}`)
    .forEach(el => el.classList.remove(CAP_BAD_CLS));
}

function markCapViolations(list) {
  list.forEach(v => {
    if (!v.el) return;
    v.el.classList.add(CAP_BAD_CLS);
    const tr = v.el.closest('tr');
    if (tr) tr.classList.add(CAP_BAD_CLS);
  });
  // انقل المستخدم لأول مخالفة كي يصلحها بلا بحث
  if (list[0]?.el?.scrollIntoView) list[0].el.scrollIntoView({ block: 'center' });
}

// مخالفات أهداف الأسهم: كل صف مرسوم يُقاس بسقفه هو (7% أو 12% للقيادي)
function collectStockCapViolations() {
  const holdingTickers = new Set(holdings.map(h => h.ticker));
  const tickers = [
    ...holdings.map(h => h.ticker),
    ...userStocks.filter(s => !holdingTickers.has(s.ticker)).map(s => s.ticker),
  ];
  const out = [];
  tickers.forEach(t => {
    const el = document.getElementById(stInputId(t));
    if (!el) return;                                  // صف غير مرسوم — لا قيمة يُحكم عليها
    const value = +(el.value || 0);
    const cap   = tgCapOf(t);
    if (value > cap + TG_CAP_EPS) out.push({ key: t, value, cap, el, blueChip: tgIsBlueChip(t) });
  });
  return out;
}

// مخالفات أهداف القطاعات: السقف الدستوري 25% لكل قطاع
function collectSectorCapViolations() {
  const secSet = new Set([
    ...holdings.map(h => (h.sector || '').trim() || 'غير مصنف'),
    ...Object.keys(sectorTargets),
  ]);
  const out = [];
  [...secSet].forEach(sec => {
    const id = secInputId(sec);
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    const value = +(el.value || 0);
    if (value > TG_CAP_SECTOR + TG_CAP_EPS) out.push({ key: sec, value, cap: TG_CAP_SECTOR, el });
  });
  return out;
}

// رسالة المنع: تُسمّي كل صف مخالف وقيمته وسقفه — لا رفض مبهم
function capViolationMsg(list, what) {
  return `⛔ لا يمكن الحفظ — ${list.length} ${what} فوق السقف الدستوري (CLAUDE.md §1):\n`
    + list.map(v => `• ${v.key}: ${v.value.toFixed(1)}% > سقف ${v.cap}%${v.blueChip ? ' (قيادي)' : ''}`).join('\n')
    + `\nالأسقف قيود صلبة — صحّح الصفوف المُبرَزة ثم أعد الحفظ.`;
}

// ── مساعد: احسب إجمالي النسب المئوية فقط (بدون مناطق الشراء/البيع) ──
function sumTargetInputs(tbodyId) {
  let sum = 0;
  document.querySelectorAll(`#${tbodyId} .target-input:not(.zone-input)`)
    .forEach(inp => { sum += +(inp.value) || 0; });
  return sum;
}

// ── حفظ أهداف الأسهم ──────────────────────────────────────
async function saveAllTargets() {
  // ── الأسقف الدستورية أولاً: قيد صلب يمنع الحفظ (§1) ────
  clearCapHighlights('stock-targets-tbody');
  const capViolations = collectStockCapViolations();
  if (capViolations.length) {
    markCapViolations(capViolations);
    showToast(capViolationMsg(capViolations, 'هدف سهم'), 'error');
    return;
  }

  // ── تحقق من الإجمالي ───────────────────────────────────
  const stockSum = sumTargetInputs('stock-targets-tbody');
  if (stockSum > 100.05) {
    showToast(`⛔ لا يمكن الحفظ — إجمالي أهداف الأسهم ${stockSum.toFixed(1)}% يتجاوز 100%`, 'error');
    return;
  }

  // تحقق: هل أهداف الأسهم داخل أي قطاع تتجاوز هدف القطاع؟ (تحذير فقط — لا يوقف الحفظ)
  const violations = validateSectorConsistency();
  if (violations.length) {
    const msgs = violations.map(v =>
      `• ${v.sector}: ${v.stockSum.toFixed(1)}% > هدف القطاع ${v.secTarget.toFixed(1)}%`
    ).join('\n');
    showToast(`⚠️ تنبيه: أهداف أسهم تتجاوز هدف القطاع:\n${msgs}\nتم الحفظ على أي حال.`, 'warning');
  }

  if (stockSum < 99.9 && stockSum > 0) {
    showToast(`⚠️ إجمالي الأهداف ${stockSum.toFixed(1)}% — تبقى ${(100-stockSum).toFixed(1)}% غير موزعة. تم الحفظ.`, 'warning');
  }

  const { data: { user } = {} } = await supabaseClient.auth.getUser();
  if (!user) { showToast('انتهت الجلسة — سجّل الدخول من جديد ثم أعد الحفظ', 'error'); return; }

  const holdingTickers = new Set(holdings.map(h => h.ticker));
  const allTickers = [
    ...holdings.map(h => h.ticker),
    ...userStocks.filter(s => !holdingTickers.has(s.ticker)).map(s => s.ticker),
  ];

  // الصفر المكتوب صراحةً («0») يُسجَّل كقرار تصفية؛ الخانة الفارغة تعني «بلا هدف»
  // وتُزال من القائمة. القراءة من النص الخام لأن +('' ) و +('0') كلاهما 0.
  const nextZero = new Set(zeroTargets);
  allTickers.forEach(ticker => {
    const raw = (document.getElementById(stInputId(ticker))?.value ?? '').trim();
    if (raw !== '' && +raw === 0) nextZero.add(ticker);
    else nextZero.delete(ticker);
  });

  const rows = allTickers.map(ticker => {
    const tz = taskZonesMap[ticker] || {};
    // AUDIT-FIX (2026-07): إن لم توجد مهمة نشطة للرمز نحافظ على المناطق السعرية
    // المخزنة أصلاً في stock_targets بدل الكتابة فوقها بـ null (كانت تُمسح عند كل حفظ)
    const existing = stockZones[ticker] || {};
    return {
      user_id:     user.id,
      ticker,
      target_pct:  +(document.getElementById(stInputId(ticker))?.value || 0),
      entry_price: tz.accumulate_at   ?? existing.entry_price ?? null,
      exit_price:  tz.liquidate_above ?? existing.exit_price  ?? null,
    };
  });

  const { error } = await supabaseClient.from('stock_targets')
    .upsert(rows, { onConflict: 'user_id,ticker' });

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }

  // تُحفظ بعد نجاح الأهداف حتى لا تفترق القائمة عن الأرقام
  zeroTargets = nextZero;
  if (!await saveUserSetting(ZERO_TARGETS_KEY, [...zeroTargets])) {
    showToast('⚠️ حُفظت الأهداف لكن تعذّر حفظ قائمة «هدف صفر = تصفية» — أعد المحاولة', 'error');
  }

  // AUDIT-FIX: parallel updates instead of sequential loop — O(1 RTT) vs O(N RTT)
  await Promise.all([...holdingTickers].map(ticker => {
    const h = holdings.find(x => x.ticker === ticker);
    if (!h) return Promise.resolve();
    const tw = +(document.getElementById(stInputId(ticker))?.value || 0);
    return supabaseClient.from('holdings').update({ target_weight: tw }).eq('id', h.id);
  }));

  if (stockSum >= 99.9) showToast('تم حفظ أهداف الأسهم ✓', 'success');
  await loadAll();
}

// ── حفظ أهداف القطاعات ────────────────────────────────────
async function saveSectorTargets() {
  // ── سقف القطاع 25% أولاً: قيد صلب يمنع الحفظ (§1) ──────
  clearCapHighlights('sector-targets-tbody');
  const secCapViolations = collectSectorCapViolations();
  if (secCapViolations.length) {
    markCapViolations(secCapViolations);
    showToast(capViolationMsg(secCapViolations, 'هدف قطاع'), 'error');
    return;
  }

  // ── تحقق من الإجمالي ───────────────────────────────────
  const secSum = sumTargetInputs('sector-targets-tbody');
  if (secSum > 100.05) {
    showToast(`⛔ لا يمكن الحفظ — إجمالي أهداف القطاعات ${secSum.toFixed(1)}% يتجاوز 100%`, 'error');
    return;
  }
  if (secSum < 99.9 && secSum > 0) {
    showToast(`⚠️ إجمالي الأهداف ${secSum.toFixed(1)}% — تبقى ${(100-secSum).toFixed(1)}% غير موزعة. تم الحفظ.`, 'warning');
  }

  const { data: { user } = {} } = await supabaseClient.auth.getUser();
  if (!user) { showToast('انتهت الجلسة — سجّل الدخول من جديد ثم أعد الحفظ', 'error'); return; }
  const sectorSet = new Set([
    ...holdings.map(h => (h.sector || '').trim() || 'غير مصنف'),
    ...Object.keys(sectorTargets)
  ]);

  const rows = [...sectorSet].map(sec => {
    // القراءة بنفس خريطة الفهرس المستخدمة في الرسم — لا تطبيع نصي قابل للتصادم.
    // إن لم يكن القطاع مرسوماً (لا عنصر DOM) نحافظ على هدفه المحفوظ بدل تصفيره.
    const el = secInputId(sec) ? document.getElementById(secInputId(sec)) : null;
    return {
      user_id:    user.id,
      sector:     sec,
      target_pct: el ? +(el.value || 0) : (sectorTargets[sec] || 0),
    };
  });

  const { error } = await supabaseClient.from('sector_targets')
    .upsert(rows, { onConflict: 'user_id,sector' });

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  if (secSum >= 99.9) showToast('تم حفظ أهداف القطاعات ✓', 'success');
  await loadAll();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportTargetsCSV() {
  const stockRows  = Object.entries(stockTargets);
  const sectorRows = Object.entries(sectorTargets);
  if (!stockRows.length && !sectorRows.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }

  // exportCSV المشتركة من utils.js — تتكفّل بالتهريب (فواصل/اقتباسات في الأسماء) والـ BOM
  const rows = [];
  rows.push(['الرمز', 'الاسم', 'الوزن المستهدف %', 'الوزن الحالي %']);
  stockRows.forEach(([ticker, pct]) => {
    const h = holdings.find(x => x.ticker === ticker);
    const cur = totalValue > 0 && h ? (+h.shares * +h.current_price / totalValue * 100).toFixed(2) : '—';
    rows.push([ticker, h?.name || '', pct, cur]);
  });
  rows.push([]);
  rows.push(['== أهداف القطاعات ==']);
  rows.push(['القطاع', 'الوزن المستهدف %']);
  sectorRows.forEach(([sector, pct]) => rows.push([sector, pct]));

  exportCSV(`أهداف_${todayISO()}.csv`, ['== أهداف الأسهم =='], rows);
  showToast(`✓ تم التصدير`, 'success');
}

// ══════════════════════════════════════════════════════════════
// ⚖️ محرك إعادة التوازن — Rebalancing Engine
// ══════════════════════════════════════════════════════════════

// ── درجة جاذبية السعر للشراء (0..1) لسهم عند سعره الحالي ──────
// تدمج مصدرين:
//   1) إشارات المالك الصريحة من صفحة التقييمات (portfolio_tasks):
//      تجميع accumulate_at · تخفيف trim_from · بيع liquidate_above — لها الأولوية.
//   2) آخر تقييم عادل من سجل حاسبة القيمة العادلة (valuation_history_v1).
// الناتج: درجة عالية = السعر في منطقة شراء جيدة · ≈0 = قريب من المتضخم/فوق العادلة.
// لا تُقدِّر بيانات ناقصة بصمت: لو لا zones ولا تقييم → درجة محايدة 1 وتُعلَّم «بلا تقييم».
function valuationScore(ticker, price) {
  const fmt = v => formatSAR(v);
  price = +price || 0;
  const tz = taskZonesMap[ticker] || {};
  const A = +tz.accumulate_at   || 0;   // تجميع
  const T = +tz.trim_from       || 0;   // تخفيف
  const L = +tz.liquidate_above || 0;   // بيع كامل

  // ── درجة من إشارات المالك (zones) ──
  let zoneScore = null, zoneLabel = '', zoneReason = '';
  if (L > 0 && price >= L) {
    zoneScore = 0; zoneLabel = '🔴 فوق سعر البيع';
    zoneReason = `السعر ${fmt(price)} ≥ بيع ${fmt(L)}`;
  } else if (A > 0 && T > 0 && T > A) {
    if (price <= A)      { zoneScore = 1; zoneLabel = '🟢 منطقة التجميع'; zoneReason = `السعر ≤ تجميع ${fmt(A)}`; }
    else if (price >= T) { zoneScore = 0; zoneLabel = '🔴 منطقة التخفيف (متضخم)'; zoneReason = `السعر ≥ تخفيف ${fmt(T)}`; }
    else                 { zoneScore = (T - price) / (T - A); zoneLabel = '🟡 بين التجميع والتخفيف'; zoneReason = `بين تجميع ${fmt(A)} وتخفيف ${fmt(T)}`; }
  } else if (A > 0) {                    // سعر تجميع فقط — يتلاشى حتى +15% فوقه
    const top = A * 1.15;
    if (price <= A)        { zoneScore = 1; zoneLabel = '🟢 منطقة التجميع'; zoneReason = `السعر ≤ تجميع ${fmt(A)}`; }
    else if (price >= top) { zoneScore = 0; zoneLabel = '🔴 بعيد فوق التجميع'; zoneReason = `السعر ≥ ${fmt(top)} (+15% فوق التجميع)`; }
    else                   { zoneScore = (top - price) / (A * 0.15); zoneLabel = '🟡 قرب التجميع'; zoneReason = `أعلى من تجميع ${fmt(A)} بقليل`; }
  } else if (T > 0) {                    // سعر تخفيف فقط — جذّاب تحته بهامش 15%
    const bot = T * 0.85;
    if (price >= T)        { zoneScore = 0; zoneLabel = '🔴 منطقة التخفيف (متضخم)'; zoneReason = `السعر ≥ تخفيف ${fmt(T)}`; }
    else if (price <= bot) { zoneScore = 1; zoneLabel = '🟢 أقل من التخفيف بهامش'; zoneReason = `السعر ≤ ${fmt(bot)}`; }
    else                   { zoneScore = (T - price) / (T * 0.15); zoneLabel = '🟡 قرب التخفيف'; zoneReason = `أسفل تخفيف ${fmt(T)} بقليل`; }
  }

  // ── درجة من سجل حاسبة القيمة العادلة ──
  const v = valuationLatest[ticker];
  let fvScore = null, fvReason = '';
  // AUDIT-FIX (2026-08-21): كانت الدرجة تُبنى على القيمة العادلة بلا أي فحص
  // لعمرها، بينما محرّك القرار يمنع أي إجراء سعري على تقييم أقدم من 180 يوماً
  // (VAL_STALE_DAYS). فكانت هذه الصفحة **تصرف ميزانية شراء** بناءً على رقم
  // تصفه هي نفسها «⚠️ قديم» في الجدول أعلاه. نفس العتبة الآن، وتُعلَن.
  const _vAgeDays = (v && v.ts) ? Math.floor((Date.now() - v.ts) / 86400000) : null;
  const _vStale   = _vAgeDays != null && _vAgeDays > TG_VAL_STALE_DAYS;
  if (v && v.fairValueAvg > 0 && price > 0 && _vStale) {
    fvReason = `تقييمه عمره ${_vAgeDays} يوماً (> ${TG_VAL_STALE_DAYS}) — مُستبعَد من الدرجة كما يستبعده محرّك القرار`;
  } else if (v && v.fairValueAvg > 0 && price > 0) {
    const disc = (v.fairValueAvg - price) / v.fairValueAvg;     // موجب = تحت العادلة
    fvScore = Math.max(0, Math.min(1, (disc + 0.10) / 0.40));   // ‑10% → 0 · +30% → 1
    fvReason = disc >= 0
      ? `هامش أمان ${(disc * 100).toFixed(0)}% تحت العادلة ${fmt(v.fairValueAvg)}`
      : `مبالغ ${Math.abs(disc * 100).toFixed(0)}% فوق العادلة ${fmt(v.fairValueAvg)}`;
  }

  // ── الدمج: إشارات المالك أولاً، والعادلة تعزيز ثانوي ──
  let score, label, reason, source;
  if (zoneScore != null && fvScore != null) {
    score = 0.7 * zoneScore + 0.3 * fvScore;
    label = zoneLabel; reason = `${zoneReason} · ${fvReason}`; source = 'zones+fv';
  } else if (zoneScore != null) {
    score = zoneScore; label = zoneLabel; reason = zoneReason; source = 'zones';
  } else if (fvScore != null) {
    score = fvScore;
    label = fvScore >= 0.66 ? '🟢 تحت العادلة' : fvScore >= 0.33 ? '🟡 قرب العادلة' : '🔴 فوق العادلة';
    reason = fvReason; source = 'fv';
  } else {
    // AUDIT-FIX (2026-07): درجة محايدة 0.5 (لا القصوى 1.0) — غياب التقييم لا يجوز
    // أن يكون ميزة تُقدّم السهم على أسهم مُقيَّمة فعلاً في أولوية الشراء.
    score = 0.5; label = '⚪ بلا تقييم'; reason = 'لا توجد أسعار تقييم لهذا السهم — درجة محايدة'; source = 'none';
  }
  return {
    score: Math.max(0, Math.min(1, score)), label, reason, source,
    fairValueAvg: v?.fairValueAvg ?? null, range: v?.fairValueRange ?? null,
    marginText: v?.marginText || '', valDate: v?.date || '',
    valTs: v?.ts ?? null,
  };
}

// ── مقياس بصري لموقع السعر (على غرار مقياس التنويع في لوحة التحكم) ──
// شريط من اليمين لليسار: متضخم 🔴 — تخفيف 🟡 — تجميع 🟢، مع علامة موضع السعر.
// score: 0 = متضخم (يمين) · 1 = تجميع (يسار). تُحسب من valuationScore().
function valScaleHtml(val) {
  if (!val || val.source === 'none') {
    return `${tagHtml('⚪', 'بلا تقييم', '')}
            <div class="small text-muted">لا توجد أسعار تقييم لهذا السهم</div>`;
  }
  const pos   = Math.max(0, Math.min(100, val.score * 100));   // % من اليمين (متضخم)
  const state = val.score >= 0.66 ? 'good' : val.score >= 0.33 ? 'warn' : 'bad';
  // val.label يبدأ بأيقونة أصلاً — نفصلها عن النص كي يبقى الوسم «أيقونة + نص»
  const icon  = val.label.slice(0, 2).trim();
  const text  = val.label.slice(2).trim() || val.label;
  return `
    <div class="vhead">${tagHtml(icon, text, state)}<span class="small text-muted num">${pos.toFixed(0)}%</span></div>
    <div class="vrail"><span class="vrail-now" style="right:${pos.toFixed(1)}%"></span></div>
    <div class="vrail-lbls"><span>متضخم</span><span>تخفيف</span><span>تجميع</span></div>
    <div class="small text-muted vreason">${esc(val.reason)}</div>
    ${val.range ? `<div class="small text-muted">عادلة: ${esc(val.range)}${val.valDate ? ` · ${esc(val.valDate)}` : ''}${_staleValBadge(val.valTs)}</div>` : ''}`;
}

// AUDIT-FIX (2026-08-21): كانت الشارة تُطلق «قديم» عند 90 يوماً مستشهدةً بـ§2،
// بينما §2 يخصّ **المصادر الخارجية** (تُقبل خلال 90 يوماً)، وتقييمك أنت تحكمه
// دورة المراجعة في §5 = 6 أشهر — وهو ما يستخدمه محرّك القرار (VAL_STALE_DAYS=180)
// وصفحة المهام والحاسبة. فكان السهم يُوسَم «قديم» هنا و«حديث» هناك بنفس التاريخ.
// التسوية: 180 يوماً هي حدّ «قديم» الفعلي (مطابقاً للمحرّك)، و90 تبقى تنبيهاً
// أصفر مبكّراً — نُبقي الإشارة الأشدّ ولا نُلغيها، لكن لا نسمّي الاثنين شيئاً واحداً.
const TG_VAL_SOON_DAYS  = 90;
const TG_VAL_STALE_DAYS = 180;   // = VAL_STALE_DAYS في decision-engine.js و tasks.js
function _staleValBadge(ts) {
  if (!ts) return '';
  const days = Math.round((Date.now() - ts) / 86400000);
  if (days > TG_VAL_STALE_DAYS) {
    return ` <span class="tag tag-xs" data-state="bad"
      title="عمر هذا التقييم ${days} يوماً — تجاوز دورة المراجعة 6 أشهر (§5). محرّك القرار يمنع أي إجراء سعري بناءً عليه. أعد تقييمه في الحاسبة">⚠️ قديم</span>`;
  }
  if (days > TG_VAL_SOON_DAYS) {
    return ` <span class="tag tag-xs" data-state="warn"
      title="عمر هذا التقييم ${days} يوماً — يقترب من دورة المراجعة (6 أشهر، §5). ما زال معتمَداً في محرّك القرار">⏳ يقترب من التجديد</span>`;
  }
  return '';
}

function runRebalancing() {
  const budget       = +document.getElementById('reb-budget')?.value || 0;
  const method       = document.getElementById('reb-method')?.value || 'gap';
  const entryFilter  = document.getElementById('reb-entry-filter')?.checked || false;
  // مراعاة موقع السعر من التقييم (افتراضياً مُفعّل) — يجعل المحرك ذكياً لا يعتمد الفجوة وحدها
  const valAwareEl   = document.getElementById('reb-valuation-aware');
  const valAware     = valAwareEl ? valAwareEl.checked : true;
  const resultEl     = document.getElementById('reb-result');
  if (!resultEl) return;

  if (budget <= 0) {
    resultEl.innerHTML = `<div class="empty-state">
      <div class="icon">⚖️</div><p>أدخل المبلغ المتاح لبدء الحساب</p></div>`;
    return;
  }
  if (!holdings.length || !totalValue) {
    resultEl.innerHTML = `<div class="empty-state">
      <div class="icon">📋</div><p>لا توجد أسهم في المحفظة</p></div>`;
    return;
  }

  // ── بناء قائمة المرشحين ─────────────────────────────────────
  // فقط الأسهم الفعلية (ليس المخطط) ذات الهدف المحدد والسعر الموجود
  //
  // ⚖️ السقف الدستوري قيد صلب لا هدف استرشادي (CLAUDE.md §1 + الفلتر 4):
  // الهدف الفعّال = min(الهدف المحفوظ، السقف) — 7% للسهم و12% للقيادي.
  // السقف الأساس بلا منطقة السماح: السماح يعني «لا تنبّه ضمنه» لا «اشترِ داخله عمداً».
  // AUDIT-FIX (2026-08-21): كان يوصي بشراء سهم مهمّته الفعّالة «تصفية» —
  // بينما نفس الصفحة تعرض شارة «🔴 تصفية» فوقه، ومحرّك القرار يُصدر عليه
  // خروجاً كاملاً بأولوية P0.1. توصيتان متعاكستان في شاشة واحدة، والقابلة
  // للتنفيذ منهما (بمبلغ ريالي) هي الخاطئة. هدف الصفر كان مستبعَداً أصلاً
  // بشرط > 0، أما مهمة التصفية مع هدف موجب فكانت تمرّ بلا فلترة.
  const _liq = Object.keys(taskMap).filter(t => taskMap[t] === 'liquidation');
  const candidatesAll = holdings
    .filter(h => stockTargets[h.ticker] > 0 && +h.current_price > 0
                 && taskMap[h.ticker] !== 'liquidation')
    .map(h => {
      const currentPct  = totalValue > 0 ? (+h.shares * +h.current_price) / totalValue * 100 : 0;
      const savedTarget = stockTargets[h.ticker] || 0;     // ما حفظه المالك
      const capPct      = tgCapOf(h.ticker);               // 12 للقيادي · 7 لغيره
      const targetPct   = Math.min(savedTarget, capPct);   // الهدف الفعّال — يقود كل حساب بعده
      const capBound    = targetPct < savedTarget - 1e-9;  // قُصَّ بالسقف → إفصاح إلزامي (§8)
      const gap         = targetPct - currentPct;          // موجب = ناقص الهدف الفعّال
      const zone        = stockZones[h.ticker] || {};
      const inZone      = !zone.entry_price || +h.current_price <= +zone.entry_price;
      const val         = valuationScore(h.ticker, +h.current_price);
      // الدرجة الفعّالة: 1 عند إيقاف مراعاة التقييم (سلوك قديم بالضبط)
      const effScore    = valAware ? val.score : 1;
      // الأولوية = الفجوة × جاذبية السعر → سهم قريب من المتضخم يهبط للأسفل ولو فجوته كبيرة
      const priority    = gap * effScore;
      return { ...h, currentPct, savedTarget, capPct, targetPct, capBound,
               blueChip: tgIsBlueChip(h.ticker), gap, inZone, val, effScore, priority };
    });

  const candidates = candidatesAll
    .filter(c => c.gap > 0.05)                             // فقط الناقص فعلاً (فوق 0.05%)
    .filter(c => !entryFilter || c.inZone)                 // فلتر منطقة الشراء اختياري
    .sort((a, b) => b.priority - a.priority);              // ترتيب تنازلي بالأولوية (فجوة × تقييم)

  // مستبعَد لأن وزنه بلغ سقفه الدستوري وإن كان هدفه المحفوظ أعلى — لا قصّ صامت (§8)
  const capBlocked = candidatesAll.filter(c => c.capBound && c.gap <= 0.05);
  // مرشّح دخل التوزيع لكن بهدف مقصوص عند السقف
  const capTrimmed = candidates.filter(c => c.capBound);

  // ── إفصاح نطاق المحرّك (عرض فقط) ────────────────────────────
  // قرار مؤكَّد من المالك: التوزيع على المملوك فقط. نُعلنه صراحةً مع عدّ
  // المستبعَدين حتى لا يظنّ المستخدم أن سهماً «اختفى» بلا سبب.
  const _hTickers   = new Set(holdings.map(h => h.ticker));
  const _exPlanned  = userStocks.filter(s => !_hTickers.has(s.ticker)).length;
  const _exNoPrice  = holdings.filter(h => !(+h.current_price > 0)).length;
  const _exNoTarget = holdings.filter(h => +h.current_price > 0 && !(stockTargets[h.ticker] > 0)).length;
  const scopeNote = noteHtml('ℹ️',
    `<strong>نطاق المحرّك: الأسهم المملوكة فقط.</strong> يوزّع على ما له وزن حالي قابل للقياس وهدف محدَّد وسعر حالي > 0.`
    + ` المستبعَد الآن: ${_exPlanned} سهماً مخطّطاً (في قاعدة بياناتك ولم يُشترَ بعد)`
    + ` · ${_exNoTarget} سهماً بلا هدف محدَّد · ${_exNoPrice} سهماً بلا سعر حالي`
    + (capBlocked.length ? ` · ${capBlocked.length} سهماً بلغ سقفه الدستوري` : '')
    + (_liq.length ? ` · <b>${_liq.length} سهماً مهمّته «تصفية»</b> (${_liq.map(esc).join('، ')}) — قرارك بالخروج منه يتقدّم على أي توصية شراء` : '')
    + `. السهم بلا وزن حالي وبلا سعر لا فجوة له تُقاس، فلا يدخل التوزيع.`, '');

  // ── لافتة القصّ الدستوري: تُعرض في كل مخرَج (§8: لا تقليص صامت) ──
  const capNoteItems = [
    ...capTrimmed.map(c => `<li><strong>${esc(c.ticker)}</strong> ${esc(c.name)} — الهدف المحفوظ ${c.savedTarget}% · الفعّال ${c.capPct}% (السقف الدستوري${c.blueChip ? ' — قيادي' : ''})</li>`),
    ...capBlocked.map(c => `<li><strong>${esc(c.ticker)}</strong> ${esc(c.name)} — الهدف المحفوظ ${c.savedTarget}% · الفعّال ${c.capPct}% (السقف الدستوري${c.blueChip ? ' — قيادي' : ''}) · وزنه ${c.currentPct.toFixed(2)}% بلغ السقف فلا شراء</li>`),
  ];
  const capNote = capNoteItems.length ? noteHtml('⛔',
    `<strong>قصّ دستوري للهدف (الفلتر 4):</strong> المحرّك يوزّع نحو الهدف الفعّال = min(هدفك المحفوظ، السقف)
     — لا يشتري داخل منطقة السماح عمداً.
     <ul class="sum-ul">${capNoteItems.join('')}</ul>`, 'bad') : '';

  if (!candidates.length) {
    const msg = entryFilter
      ? 'لا توجد أسهم ناقصة عن هدفها الفعّال <strong>ضمن منطقة الشراء</strong> حالياً — حاول رفع الفلتر'
      : 'المحفظة متوازنة — لا توجد أسهم ناقصة عن أوزانها المستهدفة الفعّالة';
    resultEl.innerHTML = `<div class="stack">${noteHtml('✅', msg, 'good')}${capNote}${scopeNote}</div>`;
    return;
  }

  // ── إن كانت مراعاة التقييم مُفعّلة وكل الأسهم الناقصة قريبة من سعرها المتضخم ──
  // لا نشتري سهماً غالياً لمجرد وجود فجوة. هذا هو السلوك الذكي الذي طلبه المالك.
  if (valAware && candidates.every(c => c.effScore <= 0.05)) {
    const list = [...candidates]
      .sort((a, b) => b.gap - a.gap)
      .map(c => `<li><strong>${esc(c.ticker)}</strong> ${esc(c.name)} — فجوة ${c.gap.toFixed(1)}% · ${esc(c.val.label)} <span class="text-muted small">(${esc(c.val.reason)})</span></li>`)
      .join('');
    resultEl.innerHTML = `<div class="stack">
      ${noteHtml('⚠️', `<strong>لا شراء مُوصى به الآن.</strong>
        كل الأسهم الناقصة عن هدفها سعرها الحالي قريب من منطقة التخفيف/المتضخم أو فوق قيمته العادلة.
        الفجوة وحدها لا تبرّر الشراء عند سعر مرتفع.
        <ul class="sum-ul">${list}</ul>
        <div class="small text-muted mt-2">💡 أوقف «مراعاة موقع السعر من التقييم» لتجاهل التقييم والتوزيع بالفجوة فقط، أو انتظر نزول الأسعار لمناطق التجميع.</div>`, 'warn')}
      ${capNote}
      ${scopeNote}
    </div>`;
    return;
  }

  // ══════════════════════════════════════════════════════════════
  // تمرير الفائض (cascade) — نفس منهج طريقة «الأولى بالأولوية» مُعمَّماً
  // على «الفجوة» و«متساوٍ»: في كل جولة نوزّع المتبقي على من بقيت لهم سعة
  // (maxAlloc − allocated) بنفس منطق الطريقة، ونكرّر حتى تنفد الميزانية أو
  // تنفد السعة — بدل قصّ المرشح عند maxAlloc وترك الفائض نقداً.
  // حارسا الحلقة اللانهائية: سقف جولات ثابت + شرط تقدّم أدنى في كل جولة.
  // ══════════════════════════════════════════════════════════════
  const CASCADE_MAX_ROUNDS = 60;
  const CASCADE_MIN_STEP   = 0.005;   // نصف هللة — دون ذلك لا تقدّم يُذكر
  function cascadeAllocate(list, amount, weightOf) {
    const alloc = new Array(list.length).fill(0);
    let remaining = amount;
    for (let round = 0; round < CASCADE_MAX_ROUNDS && remaining > CASCADE_MIN_STEP; round++) {
      const active = [];
      for (let i = 0; i < list.length; i++) {
        if (list[i].maxAlloc - alloc[i] > 1e-9) active.push(i);
      }
      if (!active.length) break;                       // نفدت السعة
      let wSum = 0;
      active.forEach(i => { wSum += Math.max(0, weightOf(list[i])); });
      const equalFallback = !(wSum > 0);               // أوزان كلها صفر → بالتساوي كي لا تتجمّد
      const roundBudget = remaining;                   // ثابت داخل الجولة كي تبقى النسب متسقة
      let spentRound = 0;
      active.forEach(i => {
        const w    = equalFallback ? 1 / active.length : Math.max(0, weightOf(list[i])) / wSum;
        const give = Math.min(roundBudget * w, list[i].maxAlloc - alloc[i]);
        if (give > 0) { alloc[i] += give; spentRound += give; }
      });
      remaining -= spentRound;
      if (spentRound <= CASCADE_MIN_STEP) break;       // شرط التقدّم الأدنى
    }
    return list.map((c, i) => ({ ...c, allocated: alloc[i] }));
  }

  // ── التوزيع على «مقام» معطى: maxAlloc ثم الطريقة ────────────
  // maxAlloc = (الهدف الفعّال% / 100) × المقام − قيمة السهم الحالية
  function allocateOn(basisTotal) {
    const cands = candidates.map(c => ({
      ...c,
      maxAlloc: Math.max(0, (c.targetPct / 100) * basisTotal - (+c.shares * +c.current_price)),
    }));
    if (method === 'gap') {
      // بالتناسب مع الأولوية (الفجوة × جاذبية السعر) + تمرير الفائض
      return cascadeAllocate(cands, budget, c => c.priority);
    }
    if (method === 'equal') {
      // توزيع متساوٍ بين المؤهّلين — عند مراعاة التقييم نستبعد القريب من المتضخم (درجة ≤ 0.15)
      const eligible = valAware ? cands.filter(c => c.effScore > 0.15) : cands;
      const pool = eligible.length ? eligible : cands;
      return cascadeAllocate(pool, budget, () => 1);
    }
    // الأولى بالأولوية (فجوة × تقييم) — تمرير الفائض للتالي بالترتيب
    const out = [];
    let remaining = budget;
    for (const c of cands) {
      if (remaining <= 0) break;
      const amt = Math.min(remaining, c.maxAlloc);
      if (amt > 0) { out.push({ ...c, allocated: amt }); remaining -= amt; }
    }
    return out;
  }

  // ── احسب عدد الأسهم القابل للشراء (تقريب للأسفل دائماً) ────
  function buildRows(allocs) {
    let spent = 0;
    const list = allocs.map(c => {
      // AUDIT-FIX: guard against current_price = 0 (unpriced holding) to prevent
      // Math.floor(Infinity) propagating into cost/totalSpent corrupting the rebalancer
      const price       = +c.current_price || 0;
      const sharesToBuy = price > 0 ? Math.floor(c.allocated / price) : 0;
      const cost        = sharesToBuy * price;
      spent += cost;
      const newShares   = +c.shares + sharesToBuy;
      return { ...c, sharesToBuy, cost, newShares, newValue: newShares * price };
    }).filter(r => r.sharesToBuy > 0);
    return { list, spent };
  }

  // ── حلّ ذاتي الاتساق للمقام (تصحيح ضروري فوق البند 4) ───────
  // المقام المتحفّظ (قيمة المحفظة + كامل الميزانية) صحيح فقط لو أُنفقت الميزانية
  // كلها. حين تنفد السعة ويبقى نقد، القسمة الفعلية على (القيمة + المُنفَق) أصغر،
  // فيخرج الوزن أعلى من الهدف الفعّال وقد يكسر السقف رغم maxAlloc. لذلك نعيد الحل
  // بمقام = القيمة + الإنفاق الفعلي: هو دائماً ≤ المقام المتحفّظ (لا يوسّع التوزيع
  // أبداً) ويتناقص رتيباً فيتقارب لنقطة ثابتة يتحقّق عندها الوزن ≤ السقف بالضبط.
  const BASIS_MAX_PASSES = 8;
  let basisTotal  = totalValue + budget;     // البداية = المقام المتحفّظ كما هو مقرّر
  let allocations = [];
  let rows        = [];
  let totalSpent  = 0;
  for (let pass = 0; pass < BASIS_MAX_PASSES; pass++) {
    allocations = allocateOn(basisTotal);
    const built = buildRows(allocations);
    rows = built.list; totalSpent = built.spent;
    const nextBasis = totalValue + totalSpent;
    if (nextBasis >= basisTotal - 0.5) break;   // استقرّ (فرق أقل من نصف ريال)
    basisTotal = nextBasis;
  }

  // ── تمريرة ثانية: النِّسب بعد اكتمال الإنفاق الفعلي (البند 4) ──
  // المقام هنا هو الإنفاق الفعلي لا الميزانية كاملة: التقريب للأسفل يجعل المُنفَق
  // أقل دائماً، والقسمة على الميزانية الكاملة كانت تُظهر المحفظة أبعد عن أسقفها
  // مما هي فعلاً. (maxAlloc أعلاه يبقى على مقامه الخاص — انظر التعليق فوقه.)
  const actualTotal = totalValue + totalSpent;
  rows = rows.map(r => {
    const newPct = actualTotal > 0 ? r.newValue / actualTotal * 100 : 0;
    return { ...r, newPct, gapAfter: r.targetPct - newPct };   // مقابل الهدف الفعّال
  });

  const leftover = budget - totalSpent;

  // ── رسم الجدول ──────────────────────────────────────────────
  if (!rows.length) {
    resultEl.innerHTML = `<div class="stack">
      ${noteHtml('⚠️', `المبلغ غير كافٍ لشراء ولو سهم واحد من الأسهم المرشحة.
        <div class="small text-muted">أدنى سعر بين المرشحين: ${formatSAR(Math.min(...candidates.map(c => +c.current_price)))}</div>`, 'warn')}
      ${capNote}
      ${scopeNote}
    </div>`;
    return;
  }

  const leftoverState = leftover > 0.005 ? 'warn' : 'good';
  const spentPct      = budget > 0 ? totalSpent / budget * 100 : 0;

  // تنبيه دستوري عرضي: هل تدفع أي توصية وزن سهم فوق سقفه؟ (لا يغيّر التوزيع)
  const capHits = rows.filter(r => r.newPct > tgCapOf(r.ticker) + TG_CAP_BUFFER);

  resultEl.innerHTML = `<div class="stack-4">
    <!-- الرقم القائد: ما ستنفقه فعلاً -->
    <div class="reb-hero">
      <div>
        <div class="hero-num">${formatSAR(totalSpent)}</div>
        <div class="hero-cap">إجمالي التكلفة على ${rows.length} سهماً — من أصل ${formatSAR(budget)} متاح</div>
        ${meterHtml({
          label: 'المستخدَم من الميزانية', valueTxt: `${spentPct.toFixed(1)}%`,
          pct: spentPct, state: leftoverState,
          foot: `المتبقي نقداً ${formatSAR(leftover)} — بعد تمرير الفائض على من بقيت لهم سعة، ما لم يُنفق`
              + ` إمّا لا يكفي لسهم كامل (تقريب للأسفل) أو نفدت سعة كل المرشحين عند أهدافهم الفعّالة`,
        })}
      </div>
      <div class="reb-hero-kv">
        ${kvsHtml([
          ['المبلغ المتاح', formatSAR(budget)],
          ['إجمالي التكلفة', formatSAR(totalSpent)],
          ['المتبقي نقداً', formatSAR(leftover)],
          ['عدد الأسهم المختلفة', `${rows.length} سهم`],
          ['أهداف قُصَّت عند السقف', capNoteItems.length ? `${capNoteItems.length} سهم` : 'لا شيء'],
          ['مقام «الوزن بعد»', `${formatSAR(actualTotal)} (القيمة + المُنفَق فعلاً)`],
        ])}
      </div>
    </div>

    ${capNote}

    ${capHits.length ? noteHtml('⛔', `<strong>خلل يستوجب المراجعة (الفلتر 4):</strong>
      ${capHits.map(r => `<strong>${esc(r.ticker)}</strong> سيصل وزنه ${r.newPct.toFixed(2)}% متجاوزاً سقفه ${tgCapOf(r.ticker)}% + سماح ${TG_CAP_BUFFER}%`).join(' · ')}.
      المحرّك يقصّ الهدف عند السقف الدستوري، فظهور هذه اللافتة يعني عدم استقرار الحساب — لا تنفّذ قبل المراجعة.`, 'bad') : ''}

    <!-- جدول التوصيات -->
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>الرمز</th>
            <th>الاسم</th>
            <th>السعر الحالي</th>
            <th>أسهم تشتري</th>
            <th>التكلفة</th>
            <th>الوزن: قبل ← بعد (مقابل الهدف الفعّال والسقف)</th>
            <th title="مقابل الهدف الفعّال = min(الهدف المحفوظ، السقف الدستوري)">الفجوة المتبقية</th>
            ${valAware ? '<th class="valcol">موقع السعر من التقييم</th>' : ''}
            <th>منطقة الشراء</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const gapAfterCls  = Math.abs(r.gapAfter) <= 1 ? 'text-success' : Math.abs(r.gapAfter) <= 3 ? 'text-accent' : 'text-muted';
            const cap    = tgCapOf(r.ticker);
            const rScale = Math.max(cap + TG_CAP_BUFFER + 2, r.targetPct * 1.15, r.newPct * 1.15);
            const zoneEl = r.inZone
              ? tagHtml('✅', 'ضمن النطاق', 'good')
              : (stockZones[r.ticker]?.entry_price
                  ? tagHtml('▲', `فوق ${formatSAR(stockZones[r.ticker].entry_price)}`, 'warn')
                  : '<span class="text-muted small">—</span>');
            return `<tr>
              <td><strong class="text-accent">${esc(r.ticker)}</strong></td>
              <td>${esc(r.name)}</td>
              <td class="num">${formatSAR(r.current_price)}</td>
              <td class="num bold text-accent">${r.sharesToBuy.toLocaleString()}</td>
              <td class="num bold">${formatSAR(r.cost)}</td>
              <td class="wcell">
                <div class="wcell-num num"><span class="text-muted">${r.currentPct.toFixed(2)}%</span>
                  <span class="text-muted"> ← </span><strong>${r.newPct.toFixed(2)}%</strong>
                  <span class="small text-success">↑${(r.newPct - r.currentPct).toFixed(2)}%</span></div>
                ${weightMeterHtml({
                  current: r.newPct, target: r.targetPct, cap, scale: rScale,
                  state: r.newPct > cap + TG_CAP_BUFFER ? 'bad' : 'good',
                  title: `بعد الشراء ${r.newPct.toFixed(2)}% · الهدف الفعّال ${r.targetPct}% · السقف ${cap}%`,
                })}
                ${r.capBound
                  ? `<div class="small text-muted num">⛔ الهدف المحفوظ ${r.savedTarget}% · الفعّال ${r.capPct}% (السقف الدستوري${r.blueChip ? ' — قيادي' : ''})</div>`
                  : ''}
              </td>
              <td class="num small ${gapAfterCls}">${r.gapAfter > 0 ? '+' : ''}${r.gapAfter.toFixed(2)}%</td>
              ${valAware ? `<td class="valcol">${valScaleHtml(r.val)}</td>` : ''}
              <td>${zoneEl}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    ${rows.some(r => !r.inZone && entryFilter === false && stockZones[r.ticker]?.entry_price)
      ? noteHtml('💡', 'بعض الأسهم فوق منطقة الشراء المحددة — فعّل «فقط ضمن منطقة الشراء» لتصفيتها.', '') : ''}

    ${scopeNote}
  </div>`;
}

function showRebInfo() {
  // AUDIT-FIX: replace blocking alert() with DOM modal
  const lines = [
    '⚖️ محرك إعادة التوازن',
    '',
    'يحسب الأسهم الأنسب للشراء بمبلغ محدد لتقريب محفظتك من الأوزان المستهدفة.',
    '',
    'طرق التوزيع:',
    '• بالتناسب مع الفجوة: الأسهم الأبعد عن هدفها تأخذ نصيباً أكبر',
    '• توزيع متساوٍ: كل سهم ناقص يأخذ نفس المبلغ',
    '• الأولى بالأولوية: كل المبلغ للسهم الأعلى أولوية',
    '',
    '🔁 تمرير الفائض في الطرق الثلاث: إذا بلغ سهم حدّه الأقصى، يُمرَّر المتبقي',
    'لمن بقيت لهم سعة بنفس منطق الطريقة ويتكرّر حتى تنفد الميزانية أو السعة —',
    'فلا يُترك جزء من مبلغك عاطلاً بلا سبب.',
    '',
    '⚖️ مراعاة موقع السعر من التقييم (مُفعّلة افتراضياً):',
    'لا يكتفي المحرك بالفجوة، بل يقرأ لكل سهم أسعار التجميع/التخفيف/البيع',
    'من صفحة التقييمات، وآخر قيمة عادلة من سجل حاسبة القيمة العادلة.',
    'الأولوية = الفجوة × جاذبية السعر، فالسهم القريب من سعره المتضخم',
    'يهبط للأسفل ولو فجوته كبيرة. وإن كانت كل الأسهم الناقصة مرتفعة',
    'السعر، يخبرك صراحةً «لا شراء مُوصى به الآن» بدل شراء سهم غالٍ.',
    'أوقف الخيار لتوزيع بالفجوة فقط (السلوك القديم).',
    '',
    'عدد الأسهم يُقرَّب للأسفل دائماً (floor) — لا كسور في السهم.',
    'المتبقي = ما لم يُنفق بعد التقريب.',
    '',
    '🔒 النطاق: الأسهم المملوكة فقط. السهم المخطّط (في قاعدة بياناتك ولم',
    'يُشترَ بعد) لا وزن حالي له ولا سعر، فلا فجوة تُقاس له — مستبعَد عمداً.',
    'كذلك أي سهم بلا هدف محدَّد أو بلا سعر حالي.',
    '',
    '⚖️ الأسقف الدستورية قيد صلب: المحرّك يوزّع نحو «الهدف الفعّال» =',
    'min(هدفك المحفوظ، السقف) — 7% للسهم و12% للقيادي، بلا منطقة سماح',
    '(السماح يعني «لا تنبيه ضمنه» لا إذناً بالشراء داخله). إن كان هدفك أعلى',
    'من السقف يُقصّ صراحةً وتُعلن اللافتة الحمراء أي سهم قُصَّ ولماذا.',
    '',
    '📐 «الوزن بعد» يُقاس على الإنفاق الفعلي (قيمة المحفظة + ما أُنفق فعلاً)',
    'لا على الميزانية كاملة — القسمة على الميزانية كاملة كانت تُظهر المحفظة',
    'أبعد عن أسقفها مما هي، وهو انحياز في اتجاه واحد دائماً.',
  ];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="reb-info-body">${lines.join('\n')}</div>
      <div class="reb-info-foot">
        <button id="_reb-info-close" class="btn btn-secondary">إغلاق</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#_reb-info-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
}

init();
