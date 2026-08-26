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
// م.53/4 — قائمة الخروج المؤجل، من المفتاح نفسه الذي يكتبه محرّك القرار.
// محرّكان يقرآن سجلاً واحداً: لو نسخ كلٌّ منهما قائمته لاختلفا في اليوم نفسه.
let tgDeferredExits = {};

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
// ⚖️ الأسقف الدستورية: **لا تمنع الحفظ** (قرار المالك 2026-08-22) — تدوين
// النيّة حرّ. وتبقى نافذة حيث تُصدر القرارات: تقصّ الهدف الفعّال في محرّك
// إعادة التوازن وفي «خطة الوصول إلى أهدافك» (min(المحفوظ، السقف)) مع إعلان
// القصّ، ويرصد محرّك القرار كسر السقف في الأوزان **الفعلية** ويأمر بالتخفيف.
// منطقة السماح للتنبيه فقط — لا تدخل معادلة منع ولا معادلة شراء.
// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// السقوف — من الدستور v3.0 (م.25 نظام الفئات الأربع)
// ----------------------------------------------------------------------
// ⚠️ لا أرقام هنا. كل ثابت يُقرأ من js/constitution.js — المصدر الوحيد.
// السقف لم يعد رقماً واحداً ولا لافتة «قيادي» يدوية، بل **فئة تُحسب من
// أرقام السهم**: قيمة سوقية · ملكية سيادية · توزيع متصل · تغطية.
// السهم بلا مدخلات كافية يبقى **غير مصنَّف** ولا يُفرَض عليه سقف —
// م.21: «ممنوع تخفيض وزن بسبب غياب بيان عند المحرك».
// ══════════════════════════════════════════════════════════════════════
const TG_CAP_BUFFER    = CAP_BUFFER;    // م.25
const TG_CAP_SECTOR    = SECTOR_CAP;   // م.28
const TG_SECTOR_BUFFER = 2.5;          // م.28 — 25→27.5 «تنبيه فقط لا تصحيح»
const TG_SIZE_MIN      = SIZE_MIN;     // م.29
const TG_SIZE_MAX      = SIZE_MAX;     // م.29
const TG_SECTORS_MIN   = SECTORS_MIN;  // م.29
// السقف الافتراضي لغير المصنَّف: أعلى فئة، فلا يُعاقَب بنقص بيانات (م.21)
const TG_CAP_UNKNOWN   = CAT.A.cap;

let engineCfg = {};   // ticker → مدخلات محرّك القرار (منها علم «قيادي» blueChip)

// هل السهم قيادي؟ — نفس منطق decision-engine.js/watchlist.js:
// علم blueChip اليدوي من إعدادات المحرّك، وأرامكو 2222 قيادية افتراضياً.
function tgIsBlueChip(ticker) {
  const cfg = engineCfg[ticker] || {};
  if (cfg.blueChip === true)  return true;
  if (cfg.blueChip === false) return false;
  return ticker === '2222';
}
// فئة السهم من مدخلاته المحفوظة في بطاقة محرّك القرار (م.25)
// ----------------------------------------------------------------------
// ⚠️ محرّك القرار يدمج مدخلات تداول الرسمية **قبل** التصنيف؛ وكانت هذه
// الصفحة تصنّف من `engineCfg` الخام وحده رغم أن `js/tadawul-data.js`
// محمَّل هنا و`tdCategoryInputs` متاحة. فسهمٌ لم يملأ المالك بطاقته يدوياً
// يخرج هنا «غير مصنَّف ⇒ سقف 15%» ويخرج في المحرّك على الشاشة المجاورة
// «فئة ج ⇒ سقف 7%» — رقمان لسهم واحد في اليوم نفسه، وهو ما بُني ملف
// الدستور لمنعه. والأثر ثلاثي: السقف (م.25)، ومُعامِل الفئة في نقاط
// الأولوية (م.54: 1.00 بدل 1.30/1.15/0.80 فينقلب الترتيب)، وقياس تجاوز
// المالك في م.31.
// إدخال المالك يعلو دائماً — بيانات تداول تملأ الفراغ فقط (م.15/1).
function tgCategoryInputs(ticker) {
  const cfg = engineCfg[ticker] || {};
  if (typeof tdCategoryInputs !== 'function') return cfg;
  const h  = (typeof holdings !== 'undefined' ? holdings : []).find(x => x.ticker === ticker);
  const td = tdCategoryInputs(ticker, +(h && h.current_price) || 0) || {};
  const merged = { ...cfg };
  ['streakYears', 'coverage', 'marketCapB'].forEach(k => {
    if (td[k] != null && (cfg[k] == null || cfg[k] === '')) merged[k] = td[k];
  });
  return merged;
}
function tgCategoryOf(ticker) { return classifyStock(tgCategoryInputs(ticker)); }
// السقف = سقف الفئة. غير المصنَّف يأخذ سقف أعلى فئة **مؤقتاً** حتى تكتمل
// بياناته — لأن فرض سقف أدنى بسبب نقصٍ عند المحرّك معاقبةٌ للمالك (م.21).
function tgCapOf(ticker) {
  const c = tgCategoryOf(ticker);
  return c.known ? c.cap : TG_CAP_UNKNOWN;
}

// م.31 — هل تجاوزات الأهداف الفردية ما زالت داخل دورتها؟
// المرجع تاريخ «حُدِّدت في» لأهداف الأسهم في هذه الصفحة. تحديثه = تجديد.
function tgOverrideStatus() {
  return overrideStatus(tgReviewDates && tgReviewDates.stocks && tgReviewDates.stocks.setAt);
}

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
  try {
    await loadAll();
    await loadReviewDates();
  } catch (e) {
    // الرسالة عُرضت في loadAll — نمنع فقط الرفض غير المعالَج
    console.error(e);
  }
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


// ══════════════════════════════════════════════════════════════════════
// تواريخ تحديد الأهداف وموعد إعادة دراستها — بطلب المالك 2026-08-22
// ----------------------------------------------------------------------
// هدف الوزن ليس رقماً أبدياً: يُحدَّد في لحظة بقناعة، ويُعاد النظر فيه دورياً.
// بلا تاريخ لا يعرف المالك متى وضع الرقم ولا متى يراجعه، فيصير الهدف موروثاً
// بلا مراجعة. نحفظ لكل مجموعة (أسهم / قطاعات) تاريخين يكتبهما هو بنفسه.
//
// التخزين في user_settings ليتزامن عبر الأجهزة ويدخل النسخة الاحتياطية تلقائياً
// (الجدول يُصدَّر كاملاً بلا قائمة بيضاء).
// الاقتراح الافتراضي 180 يوماً = دورة المراجعة النصف سنوية في الدستور §5،
// وهو **اقتراح** يملأ الخانة لا قيد — للمالك أن يكتب أي تاريخ.
// ══════════════════════════════════════════════════════════════════════
const TG_REVIEW_KEY = 'target_review_dates_v1';
const TG_REVIEW_CYCLE_DAYS = 180;
let tgReviewDates = { stocks: {}, sectors: {} };

function _tgIsoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadReviewDates() {
  try {
    const v = await loadUserSetting(TG_REVIEW_KEY);
    if (v && typeof v === 'object') {
      tgReviewDates = { stocks: v.stocks || {}, sectors: v.sectors || {} };
    }
  } catch (_) { /* الشبكة/الصلاحيات — نكمل بالفارغ */ }
  ['stocks', 'sectors'].forEach(k => {
    const set = document.getElementById(`tgrev-${k}-set`);
    const due = document.getElementById(`tgrev-${k}-due`);
    if (set) set.value = tgReviewDates[k]?.setAt || '';
    if (due) due.value = tgReviewDates[k]?.dueAt || '';
    renderReviewState(k);
  });
}

async function saveReviewDates(kind) {
  const setEl = document.getElementById(`tgrev-${kind}-set`);
  const dueEl = document.getElementById(`tgrev-${kind}-due`);
  const setAt = setEl ? setEl.value : '';
  const dueAt = dueEl ? dueEl.value : '';
  // تحقّق واحد فقط: الترتيب الزمني. لا نفرض دورة ولا نمنع تاريخاً — القرار للمالك.
  if (setAt && dueAt && dueAt < setAt) {
    showToast('موعد إعادة الدراسة قبل تاريخ التحديد — صحّح الترتيب', 'error');
    renderReviewState(kind);
    return;
  }
  tgReviewDates[kind] = { setAt: setAt || null, dueAt: dueAt || null };
  try {
    await saveUserSetting(TG_REVIEW_KEY, tgReviewDates);
    showToast('حُفظ ✓', 'success');
  } catch (e) {
    showToast('تعذّر الحفظ: ' + (e?.message || e), 'error');
  }
  renderReviewState(kind);
}

function setReviewToday(kind) {
  const now = new Date();
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + TG_REVIEW_CYCLE_DAYS);
  const setEl = document.getElementById(`tgrev-${kind}-set`);
  const dueEl = document.getElementById(`tgrev-${kind}-due`);
  if (setEl) setEl.value = _tgIsoLocal(now);
  if (dueEl) dueEl.value = _tgIsoLocal(due);
  saveReviewDates(kind);
}

function renderReviewState(kind) {
  const stEl = document.getElementById(`tgrev-${kind}-state`);
  const noteEl = document.getElementById(`tgrev-${kind}-note`);
  if (!stEl && !noteEl) return;
  const rec = tgReviewDates[kind] || {};
  const setAt = rec.setAt, dueAt = rec.dueAt;

  if (!setAt && !dueAt) {
    if (stEl) { stEl.textContent = '⚪ بلا تاريخ'; stEl.style.color = 'var(--text-2)'; }
    if (noteEl) noteEl.innerHTML = 'لم تسجّل متى حدّدت هذه الأهداف ولا متى تراجعها — سجّلهما لتعرف عمر قرارك.';
    return;
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = iso => {
    const d = parseDateLocal(iso); if (!d) return null;
    return Math.round((d - today) / 86400000);
  };
  const ageDays = setAt ? -days(setAt) : null;      // موجب = مضى
  const leftDays = dueAt ? days(dueAt) : null;      // سالب = تأخّر

  let icon, color, txt;
  if (leftDays == null)      { icon = '🟡'; color = 'var(--st-warn)';  txt = 'بلا موعد مراجعة'; }
  else if (leftDays < 0)     { icon = '🔴'; color = 'var(--st-bad)';   txt = `تأخّرت ${Math.abs(leftDays)} يوماً`; }
  else if (leftDays <= 30)   { icon = '🟡'; color = 'var(--st-warn)';  txt = `المراجعة بعد ${leftDays} يوماً`; }
  else                       { icon = '🟢'; color = 'var(--st-good)';  txt = `المراجعة بعد ${leftDays} يوماً`; }
  if (stEl) { stEl.textContent = `${icon} ${txt}`; stEl.style.color = color; }

  const parts = [];
  if (setAt)  parts.push(`حُدِّدت في <b>${esc(setAt)}</b>${ageDays != null && ageDays >= 0 ? ` (عمر القرار ${ageDays} يوماً)` : ''}`);
  if (dueAt)  parts.push(`موعد إعادة الدراسة <b>${esc(dueAt)}</b>`);
  if (setAt && dueAt) {
    const span = Math.round((parseDateLocal(dueAt) - parseDateLocal(setAt)) / 86400000);
    parts.push(`المدة بينهما ${span} يوماً${span > TG_REVIEW_CYCLE_DAYS ? ` — أطول من الدورة النصف سنوية في دستورك (${TG_REVIEW_CYCLE_DAYS} يوماً)` : ''}`);
  }
  if (leftDays != null && leftDays < 0) {
    parts.push('<b>الأهداف أدناه تجاوزت موعد مراجعتها</b> — الأرقام المعروضة قرار قديم لم يُعَد النظر فيه.');
  }
  if (noteEl) noteEl.innerHTML = parts.join(' · ');
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

  // ══════════════════════════════════════════════════════════════════
  // فحص الأخطاء إلزامي: supabase-js **يفي بالوعد عند الخطأ** ولا يرمي،
  // فـ`Promise.all` ينجح و`.data` يصير null و`|| []` يبتلعه — فتُرسَم
  // محفظة **بأوزان صفرية كاملة** بلا أي إنذار، ويُبنى عليها قرار توجيه
  // السيولة (م.54) وفحص السقوف (م.25). بيانٌ لم يصل ≠ بيانٌ صفر (م.20/21).
  // ══════════════════════════════════════════════════════════════════
  const _errs = [
    ['أسهمك',        usRes],  ['الحيازات',   hRes],
    ['أهداف الأسهم', stRes],  ['أهداف القطاعات', secRes],
    ['المهام',       taskRes],
  ].filter(([, r]) => r && r.error).map(([n, r]) => `${n}: ${r.error.message || 'خطأ'}`);
  if (_errs.length) {
    showToast(`⛔ تعذّر تحميل البيانات — ${_errs.join(' · ')}. لم تُرسَم الصفحة على بيانات ناقصة.`, 'error');
    throw new Error('targets loadAll failed: ' + _errs.join(' | '));
  }

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
  try { tgDeferredExits = (await loadUserSetting('deferred_exits_v1')) || {}; }
  catch (_) { tgDeferredExits = {}; }
  try {
    const hist = await loadUserSetting('valuation_history_v1');
    if (Array.isArray(hist)) {
      // لا نصدّق ترتيبة التخزين — نفرز بالأحدث أولاً (utils.js)
      valHistNewestFirst(hist).forEach(e => {
        const tk = (e?.inputs?.ticker || '').toUpperCase().trim();
        if (!tk || valuationLatest[tk]) return;          // بعد الفرز: أول ظهور = الأحدث
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
          ts:             valEntryStamp(e),   // من نصّ التاريخ؛ معرّفات السجل التاريخي مصطنعة (1.7e12) فتُظهر تسع سنوات بعمر واحد
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
    green:  +(localStorage.getItem(userLsKey('tharwa-alert-green'))  ?? localStorage.getItem('tharwa-alert-green')  ?? DEV_IGNORE),
    yellow: +(localStorage.getItem(userLsKey('tharwa-alert-yellow')) ?? localStorage.getItem('tharwa-alert-yellow') ?? DEV_PUMP),
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
    CAT.A.cap + 3,      // أعلى سقف فئة + هامش (م.25)
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

    // م.25: الوسم يذكر الفئة والسقف معاً — الرقم بلا فئته لا يُفسَّر
    const _c = tgCategoryOf(s.ticker);
    const capNote = _c.known
      ? `الفئة ${_c.short} — السقف ${_c.cap}%`
      : `❌ غير مصنَّف — ${_c.missing.join('، ')} (م.20)`;
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
// CLAUDE.md §1 (سقف السهم 15% / القطاع 25% + حجم المحفظة 15–20 + 8 قطاعات فأكثر).
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

// مخالفات أهداف الأسهم: كل صف مرسوم يُقاس بالسقف 15% (واحد للجميع للقيادي)
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

// حُذفت capViolationMsg — لم يعد هناك منع حفظ (قرار المالك 2026-08-22).
// تُركت الإشارة كي لا يُعاد بناؤها: التجاوز يُعلَّم بـmarkCapViolations ويُنبَّه
// عليه **بعد** الحفظ، والسقف يُطبَّق حيث تُصدر القرارات لا حيث تُدوَّن النيّة.

// ── مساعد: احسب إجمالي النسب المئوية فقط (بدون مناطق الشراء/البيع) ──
function sumTargetInputs(tbodyId) {
  let sum = 0;
  document.querySelectorAll(`#${tbodyId} .target-input:not(.zone-input)`)
    .forEach(inp => { sum += +(inp.value) || 0; });
  return sum;
}

// ── حفظ أهداف الأسهم ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
// الحفظ غير مشروط — قرار المالك 2026-08-22
// ----------------------------------------------------------------------
// المالك: «خليها تتيح لي أحفظ الأهداف بغض النظر عن الهدف الدستوري… مو أسوي
// وأعدّل وبالأخير ما يرضى». كان الحفظ يُرفض في أربع حالات: تجاوز سقف السهم،
// تجاوز سقف القطاع، ومجموع الأسهم > 100%، ومجموع القطاعات > 100%.
//
// الأهداف **بيانات المالك ونيّته**، لا مخرَجاً محسوباً. منعُه من تدوينها يعني
// أن نيّته لا تُسجَّل أصلاً، فيبقى الحقل فارغاً — وهو أسوأ من رقم مخالف
// **مُعلَن**: الفارغ لا يقول شيئاً، والمخالف يقول «هنا نيّة تخالف سقفك».
//
// الدستور لم يُنقَض: السقوف تبقى نافذة **حيث تُصدر القرارات** —
//   • محرّك التوازن يوزّع على **هدفك المحفوظ** (نقض 2026-08-23) ويُعلن تجاوز السقف.
//   • «خطة الوصول إلى أهدافك» في محرّك القرار تفعل الشيء نفسه.
//   • محرّك القرار يرصد كسر السقف الفعلي في الأوزان ويأمر بالتخفيف.
// أي: يُسجَّل ما تريد، ويبقى ما يُنفَّذ محكوماً بالسقف ومُعلَناً — لا منع صامت
// ولا تنفيذ صامت. ⚠️ لا تُعِد شرط المنع.
// ══════════════════════════════════════════════════════════════════════
async function saveAllTargets() {
  // تجاوز السقف: يُعلَّم ويُنبَّه عليه، ولا يمنع الحفظ.
  clearCapHighlights('stock-targets-tbody');
  const capViolations = collectStockCapViolations();
  if (capViolations.length) markCapViolations(capViolations);

  const stockSum = sumTargetInputs('stock-targets-tbody');

  // تحقق: هل أهداف الأسهم داخل أي قطاع تتجاوز هدف القطاع؟ (تحذير فقط — لا يوقف الحفظ)
  const violations = validateSectorConsistency();
  if (violations.length) {
    const msgs = violations.map(v =>
      `• ${v.sector}: ${v.stockSum.toFixed(1)}% > هدف القطاع ${v.secTarget.toFixed(1)}%`
    ).join('\n');
    showToast(`⚠️ تنبيه: أهداف أسهم تتجاوز هدف القطاع:\n${msgs}\nتم الحفظ على أي حال.`, 'warning');
  }

  // ⚠️ التعليق كان يَعِد بـ«تنبيهات بعد الحفظ لا قبله» — وهي تُطلَق هنا،
  // أي **قبل** أي كتابة إلى القاعدة. فإن فشل الحفظ لاحقاً يكون المالك قد
  // قرأ «⚠️ حُفظ…» ثم «خطأ» — رسالتان متناقضتان لعملية واحدة. نجمّعها
  // ونُطلقها بعد نجاح الكتابة فعلاً.
  const _postSaveWarnings = [];
  if (capViolations.length) {
    _postSaveWarnings.push(`⚠️ حُفظ. ${capViolations.length} هدفاً فوق السقف الدستوري — يُنفَّذ عند min(هدفك، السقف) في محرّك التوازن وخطة الوصول، والفارق مُعلَن هناك.`);
  }
  if (stockSum > 100.05) {
    _postSaveWarnings.push(`⚠️ حُفظ. إجمالي أهداف الأسهم ${stockSum.toFixed(1)}% يتجاوز 100% — النِّسب المعروضة تُقاس على مقام أكبر من محفظتك.`);
  } else if (stockSum < 99.9 && stockSum > 0) {
    _postSaveWarnings.push(`⚠️ حُفظ. الإجمالي ${stockSum.toFixed(1)}% — تبقى ${(100-stockSum).toFixed(1)}% غير موزعة.`);
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

  // الكتابة نجحت — الآن فقط تُعرَض تنبيهات ما بعد الحفظ
  _postSaveWarnings.forEach(m => showToast(m, 'warning'));

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
  // تجاوز سقف القطاع: يُعلَّم ويُنبَّه عليه، ولا يمنع الحفظ (انظر الشرح فوق saveAllTargets).
  clearCapHighlights('sector-targets-tbody');
  const secCapViolations = collectSectorCapViolations();
  if (secCapViolations.length) markCapViolations(secCapViolations);

  const secSum = sumTargetInputs('sector-targets-tbody');
  if (secCapViolations.length) {
    showToast(`⚠️ حُفظ. ${secCapViolations.length} قطاعاً فوق سقف ${TG_CAP_SECTOR}% — محرّك القرار يرصد التركيز الفعلي ويأمر بالتخفيف عند تجاوزه.`, 'warning');
  }
  if (secSum > 100.05) {
    showToast(`⚠️ حُفظ. إجمالي أهداف القطاعات ${secSum.toFixed(1)}% يتجاوز 100%.`, 'warning');
  } else if (secSum < 99.9 && secSum > 0) {
    showToast(`⚠️ حُفظ. الإجمالي ${secSum.toFixed(1)}% — تبقى ${(100-secSum).toFixed(1)}% غير موزعة.`, 'warning');
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
// معامل أولوية السهم المخطّط. الفجوة وحدها ترفعه أصلاً (وزنه 0% فالفجوة =
// الهدف كاملاً)، وهذا المعامل يحسم التساوي لصالح نيّتك المعلنة بالدخول حين
// تتساوى فجوته مع سهم مملوك. قيمته 1.15 لا أكثر: تحيّز صريح محدود، لا قفز
// فوق سهم فجوته أكبر فعلياً.
const PLANNED_PRIORITY_BOOST = 1.15;

// ══════════════════════════════════════════════════════════════════════
// م.54 — نقاط الأولوية: العجز × مُعامِل الفئة × مُعامِل منطقة السعر
// ----------------------------------------------------------------------
// «السيولة تذهب للأعلى نقاطاً، بحد أقصى سهمين في الدفعة الشهرية الواحدة».
//
// كان الترتيب `gap × effScore` — والعامل الثاني درجةٌ مشتقّة من **أسعار
// المالك في المهام** (تجميع/تخفيف)، لا من منطقة القيمة العادلة التي
// تسمّيها المادة. الدرجة القديمة لم تُهدَر: بقيت مرشِّحاً اختيارياً
// («ضمن منطقة الشراء») وفاصلاً عند التساوي — لكن **الترتيب** صار دستورياً.
//
// غير المصنَّف يأخذ مُعامِلاً محايداً 1.00 لا 0.80: تنزيله لأدنى مُعامِل
// عقوبةٌ على نقص بيانات عند المحرّك، وم.21 تمنعها.
// والسهم بلا تقييم عادل يأخذ 1.00 كذلك — ويُعلَن أن منطقته غير محسوبة.
// ══════════════════════════════════════════════════════════════════════
function tgPriorityOf(ticker, gap, price) {
  const cat  = tgCategoryOf(ticker);
  const _v   = valuationLatest[ticker];
  const fv   = _v?.fairValueAvg;
  // نفس بوابة القِدَم المطبَّقة في valuationScore على بعد ستين سطراً. كانت
  // غائبة هنا وحدها، فكان حظر م.55/4 يُفعَّل أو يُرفع بناءً على تقييم تصفه
  // الصفحة نفسها «⚠️ قديم» في جدولها — تناقض داخلي في ملف واحد.
  const _vAge   = (_v && _v.ts) ? Math.floor((Date.now() - _v.ts) / 86400000) : null;
  const _vStale = _vAge != null && _vAge > TG_VAL_STALE_DAYS;
  const band = (fv > 0 && price > 0 && !_vStale) ? valueBandOf(price / fv, null) : null;
  const catBoost  = cat.known ? cat.boost : 1.00;
  const zoneBoost = band ? band.boost : 1.00;
  return {
    priority: gap * catBoost * zoneBoost,
    cat, band, catBoost, zoneBoost,
    // م.55/4 — ممنوع توجيه سيولة لسهم في المنطقة 🟡 أو 🔴
    blockedByZone: !!(band && (band.key === 'trim' || band.key === 'liquidate')),
    why: `العجز ${formatNum(gap)} نقطة × الفئة ${cat.known ? cat.short : '؟'} (${catBoost})`
       + ` × ${band ? `${band.icon} ${band.label} (${zoneBoost})` : 'بلا تقييم عادل (1.00)'}`,
  };
}

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
  // إدراج الأسهم المخطّطة (غير المملوكة) — افتراضياً مُفعَّل بطلب المالك.
  const _incPlannedEl = document.getElementById('reb-include-planned');
  const includePlanned = _incPlannedEl ? _incPlannedEl.checked : true;
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
  // ⚖️ الهدف الفعّال = هدفك المحفوظ كما حدّدتَه (نقض المالك 2026-08-23).
  // السقف الدستوري 15% يبقى مرجعاً يُعلَن تجاوزه، لا حدّاً يقصّ الهدف.
  // AUDIT-FIX (2026-08-21): كان يوصي بشراء سهم مهمّته الفعّالة «تصفية» —
  // بينما نفس الصفحة تعرض شارة «🔴 تصفية» فوقه، ومحرّك القرار يُصدر عليه
  // خروجاً كاملاً بأولوية P0.1. توصيتان متعاكستان في شاشة واحدة، والقابلة
  // للتنفيذ منهما (بمبلغ ريالي) هي الخاطئة. هدف الصفر كان مستبعَداً أصلاً
  // بشرط > 0، أما مهمة التصفية مع هدف موجب فكانت تمرّ بلا فلترة.
  const _liq = Object.keys(taskMap).filter(t => taskMap[t] === 'liquidation');

  // ══════════════════════════════════════════════════════════════════
  // الأسهم المخطّطة — بطلب المالك 2026-08-22 (نقض قرار سابق باستبعادها)
  // ------------------------------------------------------------------
  // سهم في قاعدة بياناتك بهدف محدَّد ولم تشترِه بعد وزنه 0%، ففجوته = هدفه
  // **كاملاً** — وهي أكبر فجوة ممكنة. استبعاده كان يجعل المحرّك يوزّع على
  // ما تملكه فقط ويتجاهل نيّتك المعلنة للدخول.
  //
  // العقبة الحقيقية التي بُني عليها الاستبعاد: **لا سعر سوقي** لغير المملوك
  // (جدول holdings وحده يحمل current_price). العلاج ليس تخمين سعر، بل:
  //   • المرجع السعري = سعر دخولك المستهدف (entry_price) ثم سعر التجميع من
  //     المهام (accumulate_at) ثم القيمة العادلة — بهذا الترتيب، **معلَّماً**.
  //   • لا حكم سعري: درجة التقييم محايدة (1) ويُصرَّح بأنها ليست تقييماً —
  //     لأن قياس «هل السعر في منطقة الشراء؟» بسعر دخولك نفسه دوران منطقي
  //     يمنح كل سهم مخطّط درجة كاملة زوراً (§8: لا تقدير صامت).
  //   • بلا أي مرجع ⇒ يبقى في التوزيع بالمبلغ، ويُعلَن أن تحويله إلى عدد
  //     أسهم غير ممكن — لا يُحذف بصمت.
  // ══════════════════════════════════════════════════════════════════
  const _heldSet = new Set(holdings.map(h => h.ticker));
  // م.12: الاستبعادات الدائمة ممنوعة في **أي** مخرَج ولو استوفت كل الفلاتر.
  // م.55/5: سدافكو 2270 — لا تجميع مهما كانت الإشارات، بقرار المالك الصريح.
  const _blocked = tk => isBanned(tk) || isNoAccumulate(tk);
  const plannedAll = (includePlanned ? userStocks : [])
    .filter(sk => !_heldSet.has(sk.ticker) && stockTargets[sk.ticker] > 0
                  && taskMap[sk.ticker] !== 'liquidation' && !zeroTargets.has(sk.ticker)
                  && !_blocked(sk.ticker))
    .map(sk => {
      const z   = stockZones[sk.ticker] || {};
      const tz  = taskZonesMap[sk.ticker] || {};
      const fv  = valuationLatest[sk.ticker]?.fairValueAvg;
      let refPrice = 0, refSrc = '';
      if (+z.entry_price > 0)        { refPrice = +z.entry_price; refSrc = 'سعر دخولك المستهدف'; }
      else if (+tz.accumulate_at > 0){ refPrice = +tz.accumulate_at; refSrc = 'سعر التجميع من المهام'; }
      else if (+fv > 0)              { refPrice = +fv; refSrc = 'القيمة العادلة'; }
      const savedTarget = stockTargets[sk.ticker] || 0;
      const capPct      = tgCapOf(sk.ticker);
      const _ovrP       = tgOverrideStatus();              // م.31 — انظر التعليق عند المملوك
      const _wantsP     = savedTarget > capPct + 1e-9;
      const targetPct   = (_wantsP && !_ovrP.valid) ? capPct : savedTarget;
      return {
        ticker: sk.ticker, name: sk.name || sk.ticker, sector: sk.sector || '—',
        shares: 0, current_price: refPrice,
        planned: true, refSrc, hasRef: refPrice > 0,
        currentPct: 0, savedTarget, capPct, targetPct,
        overCap: _wantsP && _ovrP.valid,
        overExpired: _wantsP && !_ovrP.valid,
        blueChip: tgIsBlueChip(sk.ticker),
        gap: targetPct,                       // الوزن 0 ⇒ الفجوة = الهدف كاملاً
        inZone: true,                         // لا سعر سوقي ⇒ لا فلتر منطقة شراء
        val: { score: 1, label: '⚪ بلا سعر سوقي', reason: 'سهم مخطّط — لا حكم سعري (§8)' },
        effScore: 1,
        // المخطّط: وزنه 0 فالعجز = هدفه كاملاً. مرجعه السعري لا يصلح
        // للحكم السعري (دوران منطقي)، فمُعامِل المنطقة محايد ويُعلَن.
        priority: tgPriorityOf(sk.ticker, targetPct, 0).priority * PLANNED_PRIORITY_BOOST,
        prWhy: tgPriorityOf(sk.ticker, targetPct, 0).why + ' × نيّة الدخول (1.15)',
        cat: tgCategoryOf(sk.ticker), band: null, blockedByZone: false,
      };
    });

  const candidatesAll = holdings
    .filter(h => stockTargets[h.ticker] > 0 && +h.current_price > 0
                 && taskMap[h.ticker] !== 'liquidation'
                 && !_blocked(h.ticker))          // م.12 و55
    .map(h => {
      const currentPct  = totalValue > 0 ? (+h.shares * +h.current_price) / totalValue * 100 : 0;
      // ══════════════════════════════════════════════════════════════
      // م.31 — أولوية الهدف الفردي على السقف، **بصلاحية دورة واحدة**
      // ------------------------------------------------------------
      // الدستور v3.0 حسم ما كان مفتوحاً في نقض 2026-08-23: الهدف الفردي
      // يتقدّم على سقف الفئة فعلاً، لكن «التجاوز صالح لدورة واحدة (6
      // أشهر). في الدورة التالية يُعرَض للتجديد الصريح؛ إن لم يجدَّد
      // يُقصّ للسقف. السبب: **سقف يُتجاوز دائماً بلا مراجعة ليس سقفاً**.»
      //
      // فالتجاوز الساري يُنفَّذ كما حدّده المالك ويُعلَن، والمنقضي يُقصّ
      // ويُعلَن سبب قصّه. عمر التجاوز يُقاس بتاريخ تحديد أهداف الأسهم
      // في هذه الصفحة نفسها — والتجديد تحديثُ ذلك التاريخ.
      // ══════════════════════════════════════════════════════════════
      const savedTarget = stockTargets[h.ticker] || 0;     // ما حفظه المالك
      const capPct      = tgCapOf(h.ticker);               // سقف فئته (م.25)
      const _ovr        = tgOverrideStatus();
      const _wants      = savedTarget > capPct + 1e-9;
      const targetPct   = (_wants && !_ovr.valid) ? capPct : savedTarget;
      const overCap     = _wants && _ovr.valid;            // تجاوز ساري → إعلان
      const overExpired = _wants && !_ovr.valid;           // تجاوز منقضٍ → قُصّ
      const gap         = targetPct - currentPct;          // موجب = ناقص الهدف الفعّال
      const zone        = stockZones[h.ticker] || {};
      const inZone      = !zone.entry_price || +h.current_price <= +zone.entry_price;
      const val         = valuationScore(h.ticker, +h.current_price);
      // الدرجة القديمة (من أسعارك في المهام) صارت مرشِّحاً وفاصلَ تساوٍ لا ترتيباً
      const effScore    = valAware ? val.score : 1;
      const pr          = tgPriorityOf(h.ticker, gap, +h.current_price);
      return { ...h, currentPct, savedTarget, capPct, targetPct, overCap, overExpired,
               blueChip: tgIsBlueChip(h.ticker), gap, inZone, val, effScore,
               priority: pr.priority, prWhy: pr.why, cat: pr.cat, band: pr.band,
               blockedByZone: pr.blockedByZone };
    });

  // ══════════════════════════════════════════════════════════════════
  // م.53 أهلية التلقي · م.55 ممنوعات التوجيه — الاستبعاد يُعلَن لا يُكتم
  // ------------------------------------------------------------------
  // م.55/4: ممنوع توجيه سيولة لسهم في المنطقة 🟡 أو 🔴 من م.48.
  // م.53/4: وممنوع لسهم في **قائمة الخروج المؤجل** — سهمٌ تنتظر خروجه
  //         لا تضخّ فيه، وإلا رفعتَ ما قرّرتَ تصغيره.
  // ══════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════
  // م.53/1 — «اجتاز الفلتر 1 في المنطقة 🟢 أو 🟡»
  // ------------------------------------------------------------------
  // الشرط **الأول** من أربعة، وكان غائباً كلياً: `grep sustain` على هذا
  // الملف يعطي صفراً. فصفحة الأهداف تضخّ في سهم يقول محرّك القرار على
  // الشاشة المجاورة إنه فشل بوابة الاستدامة — وم.55/1 و م.68/17 تمنعانه
  // نصّاً، والمحرّك يؤجّله فعلاً. الصفحتان تعطيان جوابين متعاكسين.
  //
  // المصدر هو `engineCfg` نفسه الذي يقرؤه المحرّك (`decision_engine_v1`)،
  // فلا حساب موازٍ: `divCoverage === 'weak'` هو ما يسجّله المالك في بطاقة
  // السهم حين تفشل التغطية. والفراغ **لا يمنع** (م.21: لا يُعاقَب المالك
  // على بيان ناقص عند المحرّك).
  // ══════════════════════════════════════════════════════════════════
  const _sustainFailed = (tk) => {
    const cfg = engineCfg[tk] || {};
    const cov = cfg.divCoverage || ({ yes: 'covered', no: 'weak' })[cfg.divCovered];
    const fun = cfg.fundamentals || ({ yes: 'healthy', no: 'soft' })[cfg.fundHealthy];
    // ⚠️ كان: `cov === 'weak' || fun === 'loss'` — والفرعان مقلوبان:
    //   • `'loss'` **لا وجود لها** في نطاق `fundamentals`
    //     (healthy | soft | deteriorating) ⇒ الشرط كودٌ ميت.
    //   • `'uncovered'` (🔴 غير مغطّى مزمن) لم تكن محجوبة إطلاقاً.
    //   • `'weak'` (🟡 ضعف ربع واحد) كانت محجوبة، وم.53/1 تُجيز 🟢 **و**🟡
    //     نصّاً: «اجتاز الفلتر 1 في المنطقة 🟢 أو 🟡».
    // فالفلتر كان يمرّر الفاشل ويحجب المؤهَّل — ومع سقف السهمين في م.57
    // يغيّر ذلك **هوية** السهمين المشترَيين لا ترتيبهما فقط.
    return cov === 'uncovered' || fun === 'deteriorating';
  };

  const _pool = [...candidatesAll, ...plannedAll].filter(c => c.gap > 0.05);
  const zoneBlocked = _pool.filter(c => c.blockedByZone);
  const deferBlocked = _pool.filter(c => !c.blockedByZone && tgDeferredExits[c.ticker]);
  const sustainBlocked = _pool.filter(c => !c.blockedByZone && !tgDeferredExits[c.ticker]
                                        && _sustainFailed(c.ticker));
  const candidates = _pool
    .filter(c => !c.blockedByZone)                         // م.55/4
    .filter(c => !tgDeferredExits[c.ticker])               // م.53/4
    .filter(c => !_sustainFailed(c.ticker))                // م.53/1 و55/1
    .filter(c => !entryFilter || c.inZone)                 // مرشِّح اختياري (أسعارك في المهام)
    // م.54 — الترتيب بالنقاط. عند التساوي تفصل درجة أسعارك (effScore).
    .sort((a, b) => (b.priority - a.priority) || (b.effScore - a.effScore));

  // م.31 — تجاوزان مختلفان حكماً: ساري يُنفَّذ ويُعلَن، ومنقضٍ قُصَّ ويُعلَن سببه.
  const overCapList  = candidatesAll.filter(c => c.overCap);
  const expiredList  = candidatesAll.filter(c => c.overExpired);
  const _ovrNow      = tgOverrideStatus();

  // ── إفصاح نطاق المحرّك (عرض فقط) ────────────────────────────
  // قرار مؤكَّد من المالك: التوزيع على المملوك فقط. نُعلنه صراحةً مع عدّ
  // المستبعَدين حتى لا يظنّ المستخدم أن سهماً «اختفى» بلا سبب.
  const _hTickers   = new Set(holdings.map(h => h.ticker));
  const _exPlanned  = userStocks.filter(s => !_hTickers.has(s.ticker)).length;
  const _exNoPrice  = holdings.filter(h => !(+h.current_price > 0)).length;
  const _exNoTarget = holdings.filter(h => +h.current_price > 0 && !(stockTargets[h.ticker] > 0)).length;
  const _plannedNoRef = plannedAll.filter(c => !c.hasRef);
  const scopeNote = noteHtml('ℹ️',
    (includePlanned
      ? `<strong>نطاق المحرّك: المملوك + المخطّط.</strong> السهم المخطّط الذي حدّدت له هدفاً وزنه 0% ففجوته = هدفه كاملاً، وهي أكبر فجوة ممكنة — لذلك يتصدّر الترتيب.`
        + (plannedAll.length
            ? ` أُدرج الآن <b>${plannedAll.length}</b> سهماً مخطّطاً`
              + (_plannedNoRef.length
                  ? ` — منها <b>${_plannedNoRef.length}</b> بلا مرجع سعري (${_plannedNoRef.map(c => esc(c.ticker)).join('، ')}): يظهر مبلغه ولا يُحوَّل إلى عدد أسهم.`
                  : ' — كلها لها مرجع سعري.')
            : ' لا سهم مخطّط له هدف محدَّد حالياً.')
        + ` <b>لا حكم سعري على المخطّط:</b> لا يوجد سعر سوقي لغير المملوك، وقياسه بسعر دخولك نفسه دوران يمنحه درجة كاملة زوراً — فدرجته محايدة ويُعلَن ذلك (§8).`
      : `<strong>نطاق المحرّك: الأسهم المملوكة فقط.</strong> يوزّع على ما له وزن حالي قابل للقياس وهدف محدَّد وسعر حالي > 0.`
        + ` المستبعَد الآن: ${_exPlanned} سهماً مخطّطاً (في قاعدة بياناتك ولم يُشترَ بعد)`)
    + ` · ${_exNoTarget} سهماً بلا هدف محدَّد · ${_exNoPrice} سهماً بلا سعر حالي`
    + (overCapList.length ? ` · <b>${overCapList.length} سهماً هدفه فوق سقف فئته</b> (تجاوز ساري — م.31)` : '')
    + (zoneBlocked.length ? ` · <b>${zoneBlocked.length} سهماً في منطقة 🟡/🔴</b> (${zoneBlocked.map(c => esc(c.ticker)).join('، ')}) — ممنوع توجيه سيولة إليه (م.55/4)` : '')
    + (deferBlocked.length ? ` · <b>${deferBlocked.length} سهماً في قائمة الخروج المؤجل</b> (${deferBlocked.map(c => esc(c.ticker)).join('، ')}) — لا يُضخّ في سهم تنتظر خروجه (م.53/4)` : '')
    + (sustainBlocked.length ? ` · <b>${sustainBlocked.length} سهماً فشل بوابة الاستدامة</b> (${sustainBlocked.map(c => esc(c.ticker)).join('، ')}) — ممنوع توجيه سيولة إليه (م.53/1 و55/1)` : '')
    + (() => {
        // م.12 و55 — يُعلَن الاستبعاد ولا يختفي السهم بصمت (م.20 في الروح)
        const b = [...holdings, ...userStocks].map(x => x.ticker)
          .filter((tk, i, a) => a.indexOf(tk) === i && _blocked(tk));
        return b.length
          ? ` · <b>${b.length} سهماً مستبعَداً من التوجيه</b> (${b.map(tk => `${esc(tk)} — ${esc(BANNED_TICKERS[tk] || NO_ACCUMULATE[tk])}`).join('، ')})`
          : '';
      })()
    + (_liq.length ? ` · <b>${_liq.length} سهماً مهمّته «تصفية»</b> (${_liq.map(esc).join('، ')}) — قرارك بالخروج منه يتقدّم على أي توصية شراء` : '')
    + `.`, '');

  // ── لافتة تجاوز السقف: إعلان لا قصّ (§8: لا شيء بصمت) ──
  const _li = c => `<li><strong>${esc(c.ticker)}</strong> ${esc(c.name)} — هدفك ${c.savedTarget}% · سقف الفئة `
    + `${c.capPct}% · فوقه بـ<b>${(c.savedTarget - c.capPct).toFixed(2)} نقطة</b></li>`;
  const capNoteItems = overCapList.map(_li);
  const capNote = capNoteItems.length ? noteHtml('⚠️',
    `<strong>أهداف فوق سقف الفئة — تُنفَّذ كما حدّدتها:</strong> المحرّك يوزّع نحو <b>هدفك المحفوظ</b>،
     لا نحو min(هدفك، سقف الفئة). سقوف م.25: أ ${CAT.A.cap}% · ب ${CAT.B.cap}% · ج ${CAT.C.cap}% · د ${CAT.D.cap}%.
     ${esc(_ovrNow.why)}
     <ul class="sum-ul">${capNoteItems.join('')}</ul>`, 'warn') : '';

  // م.31 — «سقف يُتجاوز دائماً بلا مراجعة ليس سقفاً»: المنقضي يُقصّ صراحةً
  const expiredNote = expiredList.length ? noteHtml('⛔',
    `<strong>تجاوزات انقضت دورتها — قُصَّت للسقف (م.31):</strong> ${esc(_ovrNow.why)}
     المحرّك يوزّع على <b>سقف الفئة</b> لهذه الأسهم حتى تُجدِّد التجاوز صراحةً
     بتحديث تاريخ «حُدِّدت في» لأهداف الأسهم أعلى هذه الصفحة.
     <ul class="sum-ul">${expiredList.map(_li).join('')}</ul>`, 'bad') : '';

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

  // ══════════════════════════════════════════════════════════════════
  // م.57 — تكاليف التنفيذ: حدّ أدنى 2,000 ر.س وسهمان في الدفعة الواحدة
  // ------------------------------------------------------------------
  // «تجزئة الضخ 8,000 على خمسة أسماء تولّد خمس عمولات وتُضعف الأثر.»
  //
  // القيد يُطبَّق **قبل** حساب عدد الأسهم لا بعده: قصّه بعد البناء يترك
  // ميزانية معلّقة بلا وجهة. فنقصر المرشّحين على الأعلى نقاطاً (م.54)
  // ثم نعيد التوزيع عليهم وحدهم، فتذهب الميزانية كاملة لا أن تتبخّر.
  //
  // ولا يُكتم المؤجَّل: من سقط بالحدّ يُعلَن باسمه وبسببه، فيعرف المالك
  // أنه مؤجَّل للدفعة القادمة لا محذوف من الخطة.
  // ══════════════════════════════════════════════════════════════════
  const _batchCut = [];        // ما أُجِّل للدفعة القادمة، ومعه سببه
  function applyExecutionLimits(cands) {
    const ranked = [...cands].sort((a, b) => (b.priority - a.priority) || (b.effScore - a.effScore));
    const keep = ranked.slice(0, MAX_NAMES_PER_BATCH);
    ranked.slice(MAX_NAMES_PER_BATCH).forEach(c => _batchCut.push({
      ticker: c.ticker, name: c.name,
      why: `خارج أعلى ${MAX_NAMES_PER_BATCH} نقاطاً في هذه الدفعة (م.57)`,
    }));
    return keep;
  }
  // بعد التوزيع: من نصيبه دون الحدّ الأدنى لا يُشترى — العمولة تأكله
  function dropBelowMin(allocs) {
    const out = [];
    allocs.forEach(c => {
      if (c.allocated > 0 && c.allocated < MIN_BUY_SAR) {
        if (!_batchCut.some(x => x.ticker === c.ticker)) _batchCut.push({
          ticker: c.ticker, name: c.name,
          why: `نصيبه ${formatSAR(c.allocated)} ر.س دون الحدّ الأدنى ${formatSAR(MIN_BUY_SAR)} (م.57)`,
        });
      } else out.push(c);
    });
    return out;
  }

  // ── التوزيع على «مقام» معطى: maxAlloc ثم الطريقة ────────────
  // maxAlloc = (الهدف الفعّال% / 100) × المقام − قيمة السهم الحالية
  function allocateOn(basisTotal) {
    _batchCut.length = 0;                    // تُعاد الحسبة في كل تمريرة
    const cands = applyExecutionLimits(candidates).map(c => ({
      ...c,
      maxAlloc: Math.max(0, (c.targetPct / 100) * basisTotal - (+c.shares * +c.current_price)),
    }));
    if (method === 'gap') {
      // بالتناسب مع نقاط م.54 + تمرير الفائض، ثم إسقاط ما دون الحدّ الأدنى
      return dropBelowMin(cascadeAllocate(cands, budget, c => c.priority));
    }
    if (method === 'equal') {
      // توزيع متساوٍ بين المؤهّلين — عند مراعاة التقييم نستبعد القريب من المتضخم (درجة ≤ 0.15)
      const eligible = valAware ? cands.filter(c => c.effScore > 0.15) : cands;
      const pool = eligible.length ? eligible : cands;
      return dropBelowMin(cascadeAllocate(pool, budget, () => 1));
    }
    // الأولى بالأولوية (فجوة × تقييم) — تمرير الفائض للتالي بالترتيب
    const out = [];
    let remaining = budget;
    for (const c of cands) {
      if (remaining <= 0) break;
      const amt = Math.min(remaining, c.maxAlloc);
      if (amt > 0) { out.push({ ...c, allocated: amt }); remaining -= amt; }
    }
    return dropBelowMin(out);
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

    // ══════════════════════════════════════════════════════════════
    // م.57 على **التكلفة الفعلية** لا على النصيب
    // --------------------------------------------------------------
    // «الحد الأدنى لأي **عملية شراء** 2,000 ريال» — والعملية هي ما تدفعه
    // لا ما خُصِّص لك. و`dropBelowMin` تفحص `allocated` **قبل** التقريب
    // للأسفل، فيتسرّب ما ينزل تحت الحدّ بعده:
    //     نصيب 2,400 · سعر 900  ⇒ سهمان  ⇒ التكلفة 1,800
    //     نصيب 2,900 · سعر 1,500 ⇒ سهم    ⇒ التكلفة 1,500
    // و`js/decision-engine.js` تقيسها على التكلفة الفعلية أصلاً.
    // ══════════════════════════════════════════════════════════════
    const kept = [];
    list.forEach(r => {
      if (r.cost > 0 && r.cost < MIN_BUY_SAR) {
        spent -= r.cost;
        if (!_batchCut.some(x => x.ticker === r.ticker)) _batchCut.push({
          ticker: r.ticker, name: r.name,
          why: `${r.sharesToBuy} سهماً بسعر ${formatSAR(+r.current_price || 0)} = `
             + `${formatSAR(r.cost)} فعلياً — دون الحدّ الأدنى ${formatSAR(MIN_BUY_SAR)} `
             + `بعد التقريب للأسفل (م.57)`,
        });
      } else kept.push(r);
    });
    return { list: kept, spent };
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
        <div class="small text-muted">أدنى سعر بين المرشحين: ${(() => {
          // تجاهل من لا سعر مرجعي له (سهم مخطّط بلا entry/تجميع/عادلة) وإلا ظهر «0»
          const px = candidates.map(c => +c.current_price).filter(v => v > 0);
          return px.length ? formatSAR(Math.min(...px)) : 'غير متاح';
        })()}</div>`, 'warn')}
      ${capNote}
      ${scopeNote}
    </div>`;
    return;
  }

  const leftoverState = leftover > 0.005 ? 'warn' : 'good';
  const spentPct      = budget > 0 ? totalSpent / budget * 100 : 0;

  // ══════════════════════════════════════════════════════════════════
  // معيار «الخلل» تغيّر مع نقض 2026-08-23: تجاوز السقف الدستوري صار
  // **متوقَّعاً** لمن هدفه فوقه — فقياس الخلل عليه يُطلق إنذاراً كاذباً في
  // كل تشغيل. الخلل الحقيقي أن يتجاوز الشراء **هدفك أنت**: ذاك يعني أن
  // التوزيع لم يستقرّ عند السعة التي حسبها المحرّك لنفسه.
  const overShoot   = rows.filter(r => r.newPct > r.targetPct + TG_CAP_BUFFER);
  // وتجاوز السقف بلا تجاوز هدفك: إعلانٌ صريح، لا إنذار.
  const overCapRows = rows.filter(r => r.newPct > tgCapOf(r.ticker) + TG_CAP_BUFFER
                                       && !(r.newPct > r.targetPct + TG_CAP_BUFFER));

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
          ['أهداف فوق سقف الفئة', capNoteItems.length ? `${capNoteItems.length} سهم (ساري)` : 'لا شيء'],
          ['مؤجَّل للدفعة القادمة (م.57)', _batchCut.length ? `${_batchCut.length} سهم` : 'لا شيء'],
          ['تجاوزات قُصَّت (م.31)', expiredList.length ? `${expiredList.length} سهم` : 'لا شيء'],
          ['مقام «الوزن بعد»', `${formatSAR(actualTotal)} (القيمة + المُنفَق فعلاً)`],
        ])}
      </div>
    </div>

    ${capNote}
    ${expiredNote}
    ${_batchCut.length ? noteHtml('📦',
      `<strong>مؤجَّل للدفعة القادمة (م.57):</strong> الحدّ الأدنى لأي شراء
       <b>${formatSAR(MIN_BUY_SAR)}</b> ر.س، والحدّ الأقصى <b>${MAX_NAMES_PER_BATCH}</b> اسمين في الدفعة الواحدة —
       «تجزئة الضخّ على خمسة أسماء تولّد خمس عمولات وتُضعف الأثر». هذه الأسهم
       <b>لم تُحذف من خطتك</b>، بل انتظرت دورها بحسب نقاط م.54:
       <ul class="sum-ul">${_batchCut.map(x =>
         `<li><strong>${esc(x.ticker)}</strong> ${esc(x.name || '')} — ${esc(x.why)}</li>`).join('')}</ul>`, 'warn') : ''}

    ${overShoot.length ? noteHtml('⛔', `<strong>خلل يستوجب المراجعة:</strong>
      ${overShoot.map(r => `<strong>${esc(r.ticker)}</strong> سيصل وزنه ${r.newPct.toFixed(2)}% متجاوزاً <b>هدفك ${r.targetPct}%</b> + سماح ${TG_CAP_BUFFER}%`).join(' · ')}.
      المحرّك لا يشتري فوق هدفك، فظهور هذه اللافتة يعني عدم استقرار الحساب — لا تنفّذ قبل المراجعة.`, 'bad') : ''}

    ${overCapRows.length ? noteHtml('⚠️', `<strong>وزن فوق السقف الدستوري — بقرارك:</strong>
      ${overCapRows.map(r => `<strong>${esc(r.ticker)}</strong> ${r.newPct.toFixed(2)}% مقابل سقف ${tgCapOf(r.ticker)}%`).join(' · ')}.
      هذا ما يقتضيه هدفك المحفوظ، والشراء داخل هدفك لا فوقه.`, 'warn') : ''}

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
            <th title="مقابل هدفك المحفوظ كما حدّدتَه">الفجوة المتبقية</th>
            ${valAware ? '<th class="valcol">موقع السعر من التقييم</th>' : ''}
            <th>منطقة الشراء</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const gapAfterCls  = Math.abs(r.gapAfter) <= 1 ? 'text-success' : Math.abs(r.gapAfter) <= 3 ? 'text-accent' : 'text-muted';
            const cap    = tgCapOf(r.ticker);
            const rScale = Math.max(cap + TG_CAP_BUFFER + 2, r.targetPct * 1.15, r.newPct * 1.15);
            const zoneEl = r.planned
              ? '<span class="text-muted small" title="لا سعر سوقي لغير المملوك — لا حكم سعري (§8)">⚪ غير مُقيَّم</span>'
              : r.inZone
              ? tagHtml('✅', 'ضمن النطاق', 'good')
              : (stockZones[r.ticker]?.entry_price
                  ? tagHtml('▲', `فوق ${formatSAR(stockZones[r.ticker].entry_price)}`, 'warn')
                  : '<span class="text-muted small">—</span>');
            return `<tr>
              <td><strong class="text-accent">${esc(r.ticker)}</strong>${r.planned
                ? `<span title="سهم مخطّط — لم تشترِه بعد. وزنه 0% ففجوته = هدفه كاملاً"
                     style="font-size:.62rem;background:rgba(59,130,246,.15);color:#58a6ff;border-radius:3px;padding:1px 5px;font-weight:600;cursor:help"> مخطّط</span>`
                : ''}</td>
              <td>${esc(r.name)}</td>
              <td class="num">${formatSAR(r.current_price)}${r.planned
                ? `<div class="small text-muted" style="font-size:.62rem">${esc(r.refSrc || 'بلا مرجع')} — لا سعر سوقي</div>`
                : ''}</td>
              <td class="num bold text-accent">${r.sharesToBuy.toLocaleString()}</td>
              <td class="num bold">${formatSAR(r.cost)}</td>
              <td class="wcell">
                <div class="wcell-num num"><span class="text-muted">${r.currentPct.toFixed(2)}%</span>
                  <span class="text-muted"> ← </span><strong>${r.newPct.toFixed(2)}%</strong>
                  <span class="small text-success">↑${(r.newPct - r.currentPct).toFixed(2)}%</span></div>
                ${weightMeterHtml({
                  current: r.newPct, target: r.targetPct, cap, scale: rScale,
                  // الحالة تُقاس على هدفك لا على السقف (نقض 2026-08-23):
                  // قياسها على السقف يصبغ كل صفٍّ هدفُه فوقه بالأحمر أبداً.
                  state: r.newPct > r.targetPct + TG_CAP_BUFFER ? 'bad' : 'good',
                  title: `بعد الشراء ${r.newPct.toFixed(2)}% · هدفك ${r.targetPct}% · السقف الدستوري ${cap}%`,
                })}
                ${r.overCap
                  ? `<div class="small num" style="color:var(--st-warn)">⚠️ هدفك ${r.savedTarget}% فوق سقف الفئة ${r.capPct}% — يُنفَّذ كما حدّدتَه (م.31، ساري)</div>`
                  : r.overExpired
                  ? `<div class="small num" style="color:var(--st-bad)">⛔ هدفك ${r.savedTarget}% فوق سقف الفئة ${r.capPct}% وانقضت دورة التجاوز — قُصَّ للسقف (م.31)</div>`
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
    '⚖️ المحرّك يوزّع نحو هدفك المحفوظ كما حدّدتَه — لا نحو min(هدفك، السقف).',
    'السقف الدستوري 15% للسهم و25% للقطاع (§1) يبقى مرجعاً يُعلَن تجاوزه في',
    'لافتة وفي كل صفّ، ولا يقصّ الهدف. نقض صريح من المالك 2026-08-23.',
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
