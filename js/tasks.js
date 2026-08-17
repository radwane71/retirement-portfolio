// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'tasks': {
    title: '📊 التقييمات العادلة',
    body: `
      <p>خطة الأسعار اليدوية لكل سهم في محفظتك — تقرّرها بعقلٍ بارد وقت التحليل، ويستهلكها <strong>محرّك القرار</strong> آلياً.</p>
      <div class="info-math">🟢 تجميع &nbsp;·&nbsp; ⚖️ تخفيف &nbsp;·&nbsp; 🔴 متضخّم مالياً &nbsp;·&nbsp; القرار النهائي</div>
      <p class="info-note">💡 كل كرت يعرض الرمز، الوزن الحالي، الهدف، خطة الأسعار، والقرار النهائي. لا شيء يُحذف — أرشفة فقط.</p>`
  },
};

'use strict';

let _tasks         = [];
let _holdings      = [];
let _stockTargets  = {};
let _totalValue    = 0;
let _editingTaskId = null;
let _selectedType  = null;
let _filterType    = 'all';

const TYPE_META = {
  liquidation:  { label:'تصفية كاملة',   icon:'🔴', state:'bad'  },
  reduction:    { label:'تخفيف',          icon:'⚖️', state:'warn' },
  monitoring:   { label:'مراقبة',         icon:'👁', state:''     },
  accumulation: { label:'تجميع / إضافة', icon:'🟢', state:'good' },
  hold:         { label:'احتفاظ',         icon:'🔵', state:''     },
};

// مفاتيح user_settings المشتركة مع محرّك القرار وحاسبة القيمة العادلة
const VAL_HIST_KEY   = 'valuation_history_v1'; // سجل تقييمات حاسبة القيمة العادلة
const ENGINE_CFG_KEY = 'decision_engine_v1';   // مدخلات المحرّك اليدوية لكل سهم
const VAL_STALE_DAYS = 180;                    // تقييم أقدم من 6 أشهر = قديم (§5)
const PRICE_FRESH_DAYS = 7;                    // نفس عتبة لوحة التحكم لوسم الطزاجة

let _valHist   = {};  // ticker → كل التقييمات (الأحدث أولاً)
let _valLast   = {};  // ticker → آخر تقييم
let _engineCfg = {};  // ticker → مدخلات المحرّك اليدوية

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

// ── Init ──────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-tasks');

  const [rT, rH, rSt, rVal, rEng] = await Promise.all([
    supabaseClient.from('portfolio_tasks').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('holdings').select('*'),
    supabaseClient.from('stock_targets').select('*'),
    // سجل التقييمات + مدخلات المحرّك — للنافذة التفصيلية فقط (فشلهما لا يوقف الصفحة)
    loadUserSetting(VAL_HIST_KEY),
    loadUserSetting(ENGINE_CFG_KEY),
  ]);

  _tasks        = rT.data  || [];
  _holdings     = rH.data  || [];
  _totalValue   = _holdings.reduce((s, h) => s + +h.shares * +h.current_price, 0);
  _stockTargets = {};
  (rSt.data || []).forEach(r => { _stockTargets[r.ticker] = +r.target_pct; });
  indexValuations(rVal);
  _engineCfg = (rEng && typeof rEng === 'object') ? rEng : {};

  renderKPIs();
  applyFilters();
}

// ── فهرسة سجل التقييمات (نفس تحليل decision-engine.js) ────────────────
// المصدر الأول هو results.fairValueAvg الرقمي؛ تحليل نص النطاق احتياطي للسجل القديم.
function indexValuations(rows) {
  _valHist = {}; _valLast = {};
  (Array.isArray(rows) ? rows : []).forEach(entry => {
    const tk = String(entry?.inputs?.ticker || '').trim().toUpperCase();
    if (!tk) return;
    const range = parseFairRange(entry.results?.fairValueRange);
    const avg = (entry.results?.fairValueAvg != null && isFinite(+entry.results.fairValueAvg) && +entry.results.fairValueAvg > 0)
      ? +entry.results.fairValueAvg : null;
    const rec = {
      ts:   typeof entry.id === 'number' ? entry.id : null,
      date: String(entry.date || '').split('،')[0] || '',
      fair: avg != null ? { avg, min: range?.min ?? avg, max: range?.max ?? avg } : range,
      inputs:  entry.inputs  || {},
      results: entry.results || {},
    };
    (_valHist[tk] = _valHist[tk] || []).push(rec);
    if (!_valLast[tk]) _valLast[tk] = rec; // السجل مرتّب بالأحدث أولاً
  });
}

// نطاق القيمة العادلة من نص الحاسبة (يدعم الأرقام العربية-الهندية)
function parseFairRange(str) {
  if (!str) return null;
  const norm = String(str)
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٫/g, '.').replace(/[,،]/g, '');
  const nums = (norm.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(n => n > 0);
  if (!nums.length) return null;
  return { avg: nums.reduce((a, b) => a + b, 0) / nums.length, min: Math.min(...nums), max: Math.max(...nums) };
}

// رقم موجب صالح أو null (لا تقدير صامت — الدستور §8)
function posNum(v) { const n = +v; return (v != null && v !== '' && isFinite(n) && n > 0) ? n : null; }
function anyNum(v) { if (v == null || v === '') return null; const n = +v; return isFinite(n) ? n : null; }

// القيمة العادلة الأخيرة لرمز (أو null)
function fairOf(tk) { const v = _valLast[tk]; return v && v.fair ? v.fair.avg : null; }

// ── KPIs ──────────────────────────────────────────────────────────────
function renderKPIs() {
  const curYr  = new Date().getFullYear();
  // AUDIT-FIX (2026-08): فلتر auto_generated موحَّد على العدّادات الثلاثة —
  // كان «منجزة/ملغاة» يحسبان المولَّدة آلياً بينما «نشطة» تستثنيها.
  const active = _tasks.filter(t => t.status === 'active' && !t.auto_generated).length;
  const done   = _tasks.filter(t => t.status === 'done' && !t.auto_generated && new Date(t.closed_at || t.updated_at).getFullYear() === curYr).length;
  const canc   = _tasks.filter(t => t.status === 'cancelled' && !t.auto_generated).length;
  setText('tk-active',    active);
  setText('tk-done',      done);
  setText('tk-cancelled', canc);
}

// ── Filter ────────────────────────────────────────────────────────────
function filterByType(type) {
  _filterType = type;
  document.querySelectorAll('#type-pills .filter-pill').forEach(p => {
    p.classList.toggle('active', p.getAttribute('onclick') === `filterByType('${type}')`);
  });
  applyFilters();
}

function applyFilters() {
  const statusF = document.getElementById('status-filter')?.value || 'active';
  const base = _tasks.filter(t => !t.auto_generated);
  const typed = _filterType !== 'all' ? base.filter(t => t.type === _filterType) : base;

  let filtered = typed;
  if (statusF !== 'all') filtered = filtered.filter(t => t.status === statusF);

  const active   = filtered.filter(t => t.status === 'active');
  // AUDIT-FIX (2026-08): فلتر الحالة الافتراضي (active) كان يُفرَّغ الأرشيف دائماً —
  // الأرشيف يُبنى من كل التقييمات متجاهلاً فلتر الحالة (يحترم فلتر النوع فقط).
  const archived = typed.filter(t => t.status !== 'active');

  const countEl = document.getElementById('tasks-count-label');
  if (countEl) countEl.textContent = `${active.length} تقييم نشط`;

  renderValGrid('val-grid',     active);
  renderValGrid('archive-grid', archived);
}

// ── Render valuation cards ────────────────────────────────────────────
function renderValGrid(gridId, tasks) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  if (!tasks.length) {
    grid.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p class="small text-muted">لا توجد تقييمات هنا</p></div>`;
    return;
  }

  grid.innerHTML = tasks.map(t => buildCard(t)).join('');
}

// ══════════════════════════════════════════════════════════════════════
// السعر الحالي مقابل خطة الأسعار — سكة المناطق (.zrail)
// المنطق منسوخ من priceRulerHtml() في js/decision-engine.js:
// نطاق lo/hi يضم كل النقاط + السعر بهامش 15% من المدى، ودالة pos تقصّه
// إلى 0..100، والتسميات تتبادل بين صفّين (data-row) لمنع تداخلها.
// ══════════════════════════════════════════════════════════════════════
function zoneRailHtml(pts, price) {
  if (!pts.length || !(price > 0)) return '';
  const vals = pts.map(p => p.v).concat([price]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo;
  const pad  = span > 0 ? span * 0.15 : Math.max(hi * 0.08, 0.5);
  lo -= pad; hi += pad;
  const pos = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));

  const marks = [...pts].sort((a, b) => a.v - b.v).map((p, i) => `
      <span class="zrail-tick" data-k="${p.k}" style="left:${pos(p.v).toFixed(1)}%"></span>
      <span class="zrail-lbl" data-row="${i % 2}" style="left:${pos(p.v).toFixed(1)}%">${p.lbl}<b>${formatNum(p.v)}</b></span>`).join('');

  return `<div class="zrail"><div class="zrail-track">${marks}
      <span class="zrail-now" style="left:${pos(price).toFixed(1)}%"><b>${formatNum(price)}</b><i>السعر الآن</i></span>
    </div></div>`;
}

// المناطق السعرية المُدخلة في هذا التقييم (نفس fallback المحرّك لمهام التجميع القديمة)
function zonesOf(t) {
  return {
    accumulate: posNum(t.accumulate_at ?? (t.type === 'accumulation' ? t.target_price : null)),
    trimFrom:   posNum(t.trim_from),
    trimTo:     posNum(t.trim_to),
    liquidate:  posNum(t.liquidate_above),
  };
}

// نقاط السكة = مناطق قرارك + القيمة العادلة إن وُجدت
function zonePointsOf(t, fair) {
  const z = zonesOf(t);
  const pts = [];
  if (z.accumulate) pts.push({ v: z.accumulate, lbl: 'تجميع', k: 'buy'  });
  if (fair)         pts.push({ v: fair,         lbl: 'عادلة', k: 'fair' });
  if (z.trimFrom)   pts.push({ v: z.trimFrom,   lbl: 'تخفيف', k: 'trim' });
  if (z.liquidate)  pts.push({ v: z.liquidate,  lbl: 'تصفية', k: 'exit' });
  return pts;
}

// أين يقع السعر من مناطق القرار (نفس ترتيب أولوية المحرّك: تصفية ← تخفيف ← تجميع)
function zonePositionOf(t, price) {
  const z = zonesOf(t);
  if (!z.accumulate && !z.trimFrom && !z.liquidate)
    return { icon: '⚪', text: 'لا خطة أسعار مُدخلة', state: '' };
  if (z.liquidate && price > z.liquidate)
    return { icon: '🔴', text: `فوق حدّ التصفية ${formatNum(z.liquidate)}`, state: 'bad' };
  if (z.trimFrom && price >= z.trimFrom)
    return { icon: '⚖️', text: `داخل نطاق التخفيف ≥ ${formatNum(z.trimFrom)}`, state: 'warn' };
  if (z.accumulate && price <= z.accumulate)
    return { icon: '🟢', text: `داخل منطقة التجميع ≤ ${formatNum(z.accumulate)}`, state: 'good' };
  return { icon: '⚪', text: 'بين النطاقات — لا إشارة سعرية', state: '' };
}

// طزاجة السعر — بنمط لوحة التحكم: اليدوي محميّ عمداً فلا يُوسم قديماً
function priceFreshTag(h) {
  if (!h) return '';
  if (h.price_manual) return tagHtml('✋', 'سعر يدوي', '');
  const ts = h.price_updated_at ? new Date(h.price_updated_at).getTime() : NaN;
  if (!isFinite(ts)) return tagHtml('❔', 'طزاجة غير معروفة', '');
  const d = Math.floor((Date.now() - ts) / 86400000);
  return d <= PRICE_FRESH_DAYS
    ? tagHtml('✅', `محدَّث (${d} يوم)`, 'good')
    : tagHtml('⏰', `عمره ${d} يوماً`, 'warn');
}

// السعر الحالي الصالح للسهم، أو null (لا تقدير صامت — الدستور §8)
function priceOf(h) { const p = h ? +h.current_price : NaN; return (isFinite(p) && p > 0) ? p : null; }

// إعلان صريح لحالات الحدود: بلا رمز / خارج المحفظة / بلا سعر. '' إن كان السعر صالحاً.
function priceEdgeNote(t, h) {
  if (!String(t.ticker || '').trim())
    return noteHtml('📭', 'هذا التقييم بلا رمز سهم — لا سعر حالي ولا سكة مناطق.', '');
  if (!h)
    return noteHtml('📭', `الرمز <b>${esc(t.ticker)}</b> غير موجود في محفظتك — لا سعر حالي، فلا سكة مناطق.`, '');
  if (priceOf(h) == null)
    return noteHtml('❔', `<b>${esc(t.ticker)}</b> في المحفظة لكن بلا سعر مسجّل — حدّثه في لوحة التحكم لتظهر السكة.`, 'warn');
  return '';
}

// الرقم البطل: السعر الآن + طزاجته + موقعه من مناطق الخطة
function priceHeroHtml(t, h, price) {
  const zp = zonePositionOf(t, price);
  return `<div class="vc-now">
    <div class="vc-now-top"><span class="vc-now-l">السعر الآن</span>${priceFreshTag(h)}</div>
    <div class="hero-num">${formatNum(price)}<span class="unit">ر.س</span></div>
    <div class="vc-now-tags">${tagHtml(zp.icon, zp.text, zp.state)}</div>
  </div>`;
}

// السكة أو رسالة إرشادية إن لم تُدخل أي منطقة سعرية
function priceRailBlock(t, tk, price) {
  const pts = zonePointsOf(t, fairOf(tk));
  return pts.length
    ? zoneRailHtml(pts, price)
    : noteHtml('📐', 'لا مناطق سعرية مُدخلة — أضف سعر تجميع أو تخفيف أو تصفية لتظهر السكة.', '');
}

// كتلة السعر الحالي + السكة داخل الكرت
function currentPriceBlock(t, h) {
  const edge = priceEdgeNote(t, h);
  if (edge) return edge;
  const tk = (t.ticker || '').trim().toUpperCase();
  const price = priceOf(h);
  return priceHeroHtml(t, h, price) + priceRailBlock(t, tk, price);
}

function buildCard(t) {
  const meta    = TYPE_META[t.type] || { label: t.type, icon: '📌' };
  const decCls  = `dec-${t.type}`;
  const statCls = t.status !== 'active' ? `status-${t.status}` : '';

  // ── Weight info ──
  const tk = (t.ticker || '').trim().toUpperCase();
  const h  = _holdings.find(x => String(x.ticker).trim().toUpperCase() === tk);
  const target = _stockTargets[tk] ?? _stockTargets[t.ticker] ?? null;
  let currentPct = null;
  if (h && _totalValue > 0) currentPct = (+h.shares * +h.current_price) / _totalValue * 100;

  let weightHtml = '';
  if (currentPct !== null || target !== null) {
    let pills = [];
    if (currentPct !== null) {
      pills.push(`<span class="vc-pill">📊 النسبة الحالية: <strong>${currentPct.toFixed(1)}%</strong></span>`);
    } else {
      pills.push(`<span class="vc-pill vc-pill-off">📊 غير موجود في المحفظة</span>`);
    }
    if (target !== null) {
      pills.push(`<span class="vc-pill">🎯 الهدف: <strong>${target.toFixed(1)}%</strong></span>`);
      if (currentPct !== null) {
        const diff  = currentPct - target;
        const ok    = Math.abs(diff) <= 1.5;
        const cls   = ok ? 'gap-ok' : (diff > 0 ? 'gap-up' : 'gap-down');
        const sign  = diff > 0 ? '+' : '';
        const lbl   = ok ? '✓ مطابق للهدف' : `${diff > 0 ? '▲' : '▼'} ${sign}${diff.toFixed(1)}%`;
        pills.push(`<span class="vc-pill ${cls}">${lbl}</span>`);
      }
    }
    weightHtml = `<div class="vc-weight-row">${pills.join('')}</div>`;
  }

  // ── Price plan ──
  const priceRows = [];
  const accVal  = t.accumulate_at   ?? (t.type === 'accumulation' ? t.target_price : null);
  const trimFrom= t.trim_from;
  const trimTo  = t.trim_to;
  const liqVal  = t.liquidate_above;

  if (accVal)   priceRows.push(`<div class="vc-price-row"><span class="pr-label">🟢 تجميع عند ≤</span><span class="pr-val pr-acc">${formatSAR(accVal)}</span></div>`);
  if (trimFrom) priceRows.push(`<div class="vc-price-row"><span class="pr-label">⚖️ تخفيف عند</span><span class="pr-val pr-trim">${formatSAR(trimFrom)}</span></div>`);
  if (liqVal)   priceRows.push(`<div class="vc-price-row"><span class="pr-label">🔴 متضخّم — تصفية فوق</span><span class="pr-val pr-liq">${formatSAR(liqVal)}</span></div>`);

  const pricesHtml = priceRows.length
    ? `<div class="vc-prices">${priceRows.join('')}</div>`
    : '';

  // ── Date ──
  const wasEdited = t.updated_at && t.created_at && t.updated_at.slice(0,10) !== t.created_at.slice(0,10);
  const dateStr   = wasEdited
    ? 'آخر تعديل ' + formatDate(t.updated_at.slice(0,10))
    : 'تاريخ التحليل ' + formatDate(t.created_at?.slice(0,10) || '');
  const closedStr = t.closed_at ? ' · أُغلق ' + formatDate(t.closed_at.slice(0,10)) : '';

  // ── Status badge — أيقونة ونص معاً (اللون وحده لا يحمل المعنى) ──
  const statusLabel = statusTag(t.status, true);

  // ── Actions ──
  const actionsHtml = t.status === 'active'
    ? `<button class="btn btn-success btn-sm" onclick="closeTask('${esc(t.id)}','done')" title="منجز">✅</button>
       <button class="btn btn-secondary btn-sm" onclick="openValModal('${esc(t.id)}')" title="تعديل">✏️</button>
       <button class="btn btn-danger btn-sm" onclick="closeTask('${esc(t.id)}','cancelled')" title="إلغاء">❌</button>`
    : `<button class="btn btn-secondary btn-sm" onclick="reopenTask('${esc(t.id)}')" title="إعادة فتح">↩</button>`;

  return `<div class="val-card ${decCls} ${statCls}">
    <div class="vc-actions">${actionsHtml}</div>
    <div class="vc-header">
      ${t.ticker ? `<span class="vc-ticker">${esc(t.ticker)}</span>` : ''}
      ${t.name   ? `<span class="vc-name">${esc(t.name)}</span>`   : ''}
      <span class="vc-dec-badge">${meta.icon} ${meta.label}</span>
      ${statusLabel}
    </div>
    ${weightHtml}
    ${currentPriceBlock(t, h)}
    ${pricesHtml}
    ${t.notes ? `<div class="vc-notes">${esc(t.notes)}</div>` : ''}
    <div class="vc-foot">
      <span class="vc-date">${dateStr}${closedStr}</span>
      <button class="btn btn-secondary btn-sm" onclick="openTaskDetail('${esc(t.id)}')">🔍 تفاصيل كاملة</button>
    </div>
  </div>`;
}

// وسم حالة التقييم — مشترك بين الكرت والنافذة التفصيلية
function statusTag(status, hideActive = false) {
  if (status === 'active') return hideActive ? '' : tagHtml('🟢', 'نشط', 'good');
  if (status === 'done')   return tagHtml('✅', 'منجز', 'good');
  if (status === 'cancelled') return tagHtml('❌', 'ملغى', 'bad');
  return tagHtml('⚪', esc(status || 'غير معروفة'), '');
}

// ══════════════════════════════════════════════════════════════════════
// 🔍 نافذة التفاصيل الكاملة — كل ما يخصّ تقييمات هذا السهم (قراءة فقط)
// المنهج مُحاكٍ لـ openDetailCard() في js/decision-engine.js: الخلاصة أولاً
// (الرمز/السعر/الوزن/السكة) ثم الإثبات (تطوّر تقييماتك، النماذج، السجل).
// ══════════════════════════════════════════════════════════════════════
function openTaskDetail(id) {
  const t = _tasks.find(x => x.id === id);
  if (!t) { showToast('تعذّر العثور على هذا التقييم', 'error'); return; }
  const tk   = (t.ticker || '').trim().toUpperCase();
  const h    = _holdings.find(x => String(x.ticker).trim().toUpperCase() === tk);
  const name = t.name || h?.name || '';

  const titleEl = document.getElementById('vd-title');
  if (titleEl) titleEl.textContent = `🔍 ${t.ticker || 'تقييم بلا رمز'}${name ? ' — ' + name : ''}`;

  const out = [];
  out.push(vdHeadHtml(t, h, tk, name));
  out.push('<h4 class="vd-h">أين يقع السعر من خطة أسعارك</h4>');
  out.push(vdRailHtml(t, h, tk));
  out.push(vdTimelineHtml(tk));
  out.push(vdModelsHtml(tk, h));
  out.push(vdPlanHistoryHtml(t, tk));
  out.push(vdEngineCfgHtml(tk));
  out.push(vdNotesHtml(t));
  out.push(vdLinksHtml());

  const body = document.getElementById('vd-body');
  if (body) body.innerHTML = out.join('');
  const modal = document.getElementById('vd-modal');
  if (modal) modal.style.display = 'flex';
}

function closeTaskDetail() {
  const m = document.getElementById('vd-modal');
  if (m) m.style.display = 'none';
}
function closeTaskDetailOverlay(e) {
  if (e.target.id === 'vd-modal') closeTaskDetail();
}

// ── الرأس: الرمز والاسم والسعر والوزن مقابل الهدف ─────────────────────
function vdHeadHtml(t, h, tk, name) {
  const meta  = TYPE_META[t.type] || { label: t.type || 'غير محدّد', icon: '📌', state: '' };
  const price = priceOf(h);
  const fair  = fairOf(tk);
  const last  = _valLast[tk];

  const acts = tagHtml(meta.icon, meta.label, meta.state) + statusTag(t.status);
  const head = cardHead(
    `<strong class="text-accent num">${esc(t.ticker || '—')}</strong>`,
    esc(name || 'بلا اسم مسجّل'), acts);

  const edge = priceEdgeNote(t, h);
  const hero = edge || priceHeroHtml(t, h, price);

  // الوزن مقابل الهدف — المقياس يقيس الحالي والعلامة تشير للهدف
  let weight = '';
  const cur    = (h && _totalValue > 0 && price != null) ? (+h.shares * price) / _totalValue * 100 : null;
  const target = _stockTargets[tk] ?? _stockTargets[t.ticker] ?? null;
  if (cur != null) {
    const scale = Math.max(cur, target || 0, 0.01) * 1.35;
    let state = '', foot;
    if (target != null) {
      const diff = cur - target;
      const abs  = Math.abs(diff);
      state = abs <= 1.5 ? 'good' : abs <= 3 ? 'warn' : 'bad';
      const icon = abs <= 1.5 ? '✓' : diff > 0 ? '▲' : '▼';
      foot = `الهدف ${formatNum(target)}% · الفارق ${icon} ${diff > 0 ? '+' : ''}${formatNum(diff)}%`;
    } else {
      foot = 'لا هدف وزن مسجّل لهذا السهم — سجّله في صفحة «أهداف الأسهم والقطاعات».';
    }
    weight = meterHtml({
      label: 'وزنه في المحفظة', valueTxt: `${formatNum(cur)}%`,
      pct: cur / scale * 100, markPct: target != null ? target / scale * 100 : null,
      state, foot,
    });
  } else if (h) {
    weight = noteHtml('❔', 'تعذّر حساب الوزن — لا سعر حالي لهذا السهم.', 'warn');
  }

  const kv = kvsHtml([
    ['القيمة العادلة الأخيرة', fair != null ? formatNum(fair) + ' ر.س' : '<span class="text-muted">لم تُحسب بعد</span>'],
    ['هامش الأمان', (fair != null && price != null)
      ? `${((fair - price) / fair * 100) >= 0 ? '' : '−'}${formatNum(Math.abs((fair - price) / fair * 100))}%`
      : '<span class="text-muted">—</span>'],
    ['تاريخ آخر تقييم', last?.date ? esc(last.date) : '<span class="text-muted">—</span>'],
    ['عدد الأسهم', h ? formatShares(+h.shares) : '<span class="text-muted">—</span>'],
  ]);

  return `<div class="stack">${head}${hero}${weight}${kv}</div>`;
}

// ── السكة داخل النافذة (مع القيمة العادلة إن وُجدت) ───────────────────
function vdRailHtml(t, h, tk) {
  const edge = priceEdgeNote(t, h);
  if (edge) return edge;
  const price = priceOf(h);
  const fair  = fairOf(tk);
  return priceRailBlock(t, tk, price) +
    (fair == null
      ? noteHtml('🧮', 'لا قيمة عادلة محفوظة لهذا السهم — احسبها في صفحة «القيمة العادلة للأسهم» لتظهر كنقطة على السكة.', '')
      : '');
}

// ── تطوّر تقييماتك عبر الزمن — جوهر هذه الصفحة (الدستور §4 الفلتر 2) ──
// محاكاة valuationTimelineHtml() في js/decision-engine.js.
function vdTimelineHtml(tk) {
  const H = '<h4 class="vd-h">تطوّر تقييماتك للسهم عبر الزمن</h4>';
  const hist = tk ? (_valHist[tk] || []) : [];
  if (!hist.length) {
    return H + noteHtml('🧮',
      'لا يوجد أي تقييم محفوظ لهذا الرمز. احسبه في صفحة <b>«القيمة العادلة للأسهم»</b> — ومنها يقرأ محرّك القرار الفلتر 2.', '');
  }

  const isReit  = (hist[0].inputs || {}).companyType === 'reit';
  const earnKey = isReit ? 'ffo' : 'eps';
  const earnLbl = isReit ? 'FFO' : 'EPS';

  const rows = hist.map(rec => {
    const i = rec.inputs || {};
    return {
      date:   rec.date || '—',
      fair:   rec.fair ? rec.fair.avg : null,
      earn:   anyNum(i[earnKey]),
      div:    anyNum(i.dividends ?? i.bankDps),
      fcf:    anyNum(i.fcf),
      growth: anyNum(i.growth5yr),
    };
  });

  // سهم الاتجاه مقارنةً بالتقييم الأقدم مباشرة (السجل مرتّب: الأحدث أولاً)
  const arrow = (cur, prev) => {
    if (cur == null || prev == null) return '';
    if (cur > prev * 1.005) return ' <span class="trend-up">▲</span>';
    if (cur < prev * 0.995) return ' <span class="trend-dn">▼</span>';
    return ' <span class="trend-eq">=</span>';
  };
  const cell = (v, prev, suf = '') =>
    v == null ? '<span class="text-muted">—</span>' : formatNum(v) + suf + arrow(v, prev);

  const body = rows.map((row, i) => {
    const p = rows[i + 1] || {};
    return `<tr>
      <td>${esc(row.date)}</td>
      <td><b>${row.fair == null ? '—' : formatNum(row.fair)}</b>${arrow(row.fair, p.fair)}</td>
      <td>${cell(row.earn, p.earn)}</td>
      <td>${cell(row.div, p.div)}</td>
      <td>${cell(row.fcf, p.fcf)}</td>
      <td>${cell(row.growth, p.growth, '%')}</td>
    </tr>`;
  }).join('');

  // حكم قاعدة التثبيت عبر كامل السجل لا آخر تقييمين فقط (الدستور §4)
  let verdict = '';
  if (rows.length >= 2) {
    const first = rows[rows.length - 1], last = rows[0];
    if (first.fair != null && last.fair != null && last.fair > first.fair * 1.01) {
      const earnUp = last.earn != null && first.earn != null && last.earn > first.earn;
      const divUp  = last.div  != null && first.div  != null && last.div  > first.div;
      const fcfUp  = last.fcf  != null && first.fcf  != null && last.fcf  > first.fcf;
      if (!earnUp && !divUp && !fcfUp) {
        verdict = noteHtml('⚠️', `<b>قاعدة التثبيت عبر كل السجل:</b> قيمتك العادلة ارتفعت من
          ${formatNum(first.fair)} إلى ${formatNum(last.fair)} عبر ${rows.length} تقييمات، لكن
          ${earnLbl} والتوزيع وFCF لم يرتفع أيٌّ منها بين أول تقييم وآخره. الدستور (§4) يمنع رفع
          القيمة العادلة بلا دليل من الأرقام.`, 'warn');
      } else {
        const ev = [earnUp ? earnLbl : null, divUp ? 'التوزيع' : null, fcfUp ? 'FCF' : null].filter(Boolean);
        verdict = noteHtml('✅', `<b>قاعدة التثبيت عبر كل السجل:</b> ارتفاع القيمة العادلة مسنود
          بارتفاع فعلي في: ${esc(ev.join('، '))}.`, 'good');
      }
    }
  }

  // قِدم آخر تقييم (§5 — الدورة كل 6 أشهر)
  let stale = '';
  const lastRec = hist[0];
  if (lastRec.ts) {
    const age = Math.floor((Date.now() - lastRec.ts) / 86400000);
    stale = age > VAL_STALE_DAYS
      ? noteHtml('📅', `آخر تقييم عمره ${age} يوماً (أقدم من ${VAL_STALE_DAYS}) — مستحقّ التحديث حسب الدورة النصف سنوية (§5).`, 'warn')
      : noteHtml('✅', `آخر تقييم عمره ${age} يوماً — ضمن الدورة النصف سنوية (§5).`, 'good');
  } else {
    stale = noteHtml('❔', 'عمر آخر تقييم غير معروف — لا طابع زمني صالح في السجل (§8: يُعلَن ولا يُقدَّر).', '');
  }

  return `${H}<div class="stack">
    <div class="small text-muted">${rows.length} تقييم محفوظ — الأحدث أولاً. السهم يقارن كل مؤشر بالتقييم الأقدم منه مباشرة.</div>
    <div class="vd-wrap"><table class="vd-tbl">
      <thead><tr><th>التاريخ</th><th>القيمة العادلة</th><th>${earnLbl}</th><th>التوزيع</th><th>FCF</th><th>النمو</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>${verdict}${stale}</div>`;
}

// ── تفصيل نماذج آخر تقييم (results.models) ────────────────────────────
function vdModelsHtml(tk, h) {
  const H = '<h4 class="vd-h">نماذج آخر تقييم — أي نموذج أعطى أي قيمة</h4>';
  const last = tk ? _valLast[tk] : null;
  const models = (last && Array.isArray(last.results?.models)) ? last.results.models : [];
  const usable = models.filter(m => m && posNum(m.raw) != null);
  if (!usable.length) {
    return H + noteHtml('📐',
      'لا تفصيل نماذج في آخر تقييم محفوظ. صفحة <b>«القيمة العادلة للأسهم»</b> تحفظ نتائج كل نموذج عند احتساب التقييم.', '');
  }

  const price = priceOf(h);
  const items = usable.map(m => {
    const v  = +m.raw;
    const vs = price != null ? (v - price) / price * 100 : null;
    return [esc(m.name || 'نموذج'), `${formatNum(v)}${vs != null
      ? ` <span class="text-muted small">(${vs >= 0 ? '+' : '−'}${formatNum(Math.abs(vs))}% عن السعر)</span>` : ''}`];
  });

  const raws   = usable.map(m => +m.raw);
  const spread = Math.max(...raws) - Math.min(...raws);
  const mid    = raws.reduce((a, b) => a + b, 0) / raws.length;
  const warn   = (mid > 0 && spread / mid > 0.5)
    ? noteHtml('⚠️', `تشتّت النماذج واسع (${formatNum(spread / mid * 100)}% من المتوسط) — القيمة العادلة هنا
        تقديرية أكثر منها دقيقة؛ اعتمد نطاقاً لا رقماً واحداً.`, 'warn')
    : '';

  return `${H}<div class="stack">
    <div class="small text-muted">${usable.length} نموذج صالح · تقييم ${esc(last.date || '—')}</div>
    ${kvsHtml(items)}${warn}</div>`;
}

// ── سجل خطط الأسعار لهذا السهم (كل مهامه: نشطة/مغلقة/ملغاة) ───────────
function vdPlanHistoryHtml(t, tk) {
  const H = '<h4 class="vd-h">سجل خطط الأسعار لهذا السهم</h4>';
  const rows = tk
    ? _tasks.filter(x => String(x.ticker || '').trim().toUpperCase() === tk)
    : [t];
  if (!rows.length) return H + noteHtml('📊', 'لا خطط أسعار مسجّلة لهذا الرمز.', '');

  const sorted = [...rows].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')));

  const body = sorted.map(x => {
    const m = TYPE_META[x.type] || { label: x.type || '—', icon: '📌', state: '' };
    const z = zonesOf(x);
    const plan = [
      z.accumulate ? `🟢 ≤${formatNum(z.accumulate)}` : null,
      z.trimFrom   ? `⚖️ ${formatNum(z.trimFrom)}${z.trimTo ? '–' + formatNum(z.trimTo) : ''}` : null,
      z.liquidate  ? `🔴 >${formatNum(z.liquidate)}` : null,
    ].filter(Boolean).join(' · ') || '<span class="text-muted">بلا أسعار</span>';
    const isCur = x.id === t.id;
    return `<tr>
      <td>${esc((x.created_at || '').slice(0, 10) || '—')}${isCur ? ' <span class="text-accent">◄ هذا التقييم</span>' : ''}</td>
      <td>${m.icon} ${esc(m.label)}</td>
      <td class="wrap">${plan}</td>
      <td>${statusTag(x.status)}</td>
      <td>${esc((x.closed_at || '').slice(0, 10) || '—')}</td>
    </tr>`;
  }).join('');

  return `${H}<div class="stack">
    <div class="small text-muted">${sorted.length} خطة مسجّلة لهذا الرمز — الأحدث أولاً. لا شيء يُحذف: الأرشيف يحفظ تطوّر قرارك.</div>
    <div class="vd-wrap"><table class="vd-tbl">
      <thead><tr><th>تاريخ التحليل</th><th>القرار</th><th>خطة الأسعار</th><th>الحالة</th><th>أُغلق في</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div></div>`;
}

// ── مدخلاتك اليدوية لمحرّك القرار (decision_engine_v1) ─────────────────
const VD_CFG_LABELS = {
  assetType:    ['نوع الأصل', {
    reit: 'REIT — صندوق عقاري', bank: 'بنك',
    cement_petro: 'إسمنت/بتروكيماويات', general: 'بقية القطاعات' }],
  blueChip:     ['سهم قيادي', { true: 'نعم (سقف 12%)', false: 'لا (سقف 7%)' }],
  divCoverage:  ['تغطية التوزيع', { covered: '✅ مغطّى', weak: '🟡 ضعف ربع واحد', uncovered: '🔴 غير مغطّى مزمن' }],
  fundamentals: ['الأساسيات', { healthy: '✅ سليمة', soft: '🟡 ضعف ربع واحد', deteriorating: '🔴 تدهور مستمر' }],
  divSignal:    ['إشارة التوزيع', { stable: '✅ مستقر', temp: '🟡 تأجيل/تخفيف مؤقت', cut: '🔴 قطع مؤكّد' }],
};

function vdEngineCfgHtml(tk) {
  const H = '<h4 class="vd-h">مدخلاتك اليدوية لمحرّك القرار</h4>';
  const cfg = (tk && _engineCfg[tk]) || null;
  const keys = cfg ? Object.keys(VD_CFG_LABELS).filter(k => cfg[k] != null && cfg[k] !== '') : [];
  if (!keys.length) {
    return H + noteHtml('🧭',
      'لم تُدخل شيئاً لهذا السهم. افتح <b>«محرّك القرار»</b> → بطاقة السهم لتسجيل نوع الأصل وبوابة الاستدامة (§4 الفلتر 1).', '');
  }
  const items = keys.map(k => {
    const [label, map] = VD_CFG_LABELS[k];
    return [label, esc(map[String(cfg[k])] || String(cfg[k]))];
  });
  return `${H}<div class="stack">${kvsHtml(items)}` +
    (cfg.notes ? noteHtml('📝', esc(cfg.notes), '') : '') + '</div>';
}

// ── ملاحظاتك على هذا التقييم ──────────────────────────────────────────
function vdNotesHtml(t) {
  const H = '<h4 class="vd-h">ملاحظاتك على هذا التقييم</h4>';
  return H + (t.notes
    ? noteHtml('📝', esc(t.notes), '')
    : noteHtml('📝', 'لا ملاحظات على هذا التقييم — أضِفها بزر ✏️ تعديل على الكرت (خانة «ملاحظات التقييم / استراتيجية التنفيذ»).', ''));
}

// ── روابط الإجراء ─────────────────────────────────────────────────────
function vdLinksHtml() {
  return `<div class="vd-links">
    <a class="btn btn-secondary btn-sm" href="stock-valuation.html">💹 تحديث القيمة العادلة</a>
    <a class="btn btn-secondary btn-sm" href="decision-engine.html">🧭 محرّك القرار</a>
    <a class="btn btn-secondary btn-sm" href="targets.html">🎯 أهداف الأسهم والقطاعات</a>
  </div>`;
}

// ── Modal ─────────────────────────────────────────────────────────────
function openValModal(id = null) {
  _editingTaskId = id;
  document.getElementById('val-modal-title').textContent = id ? 'تعديل التقييم' : 'تقييم جديد';
  // امسح علامة الملء الآلي لخانة التخفيف — قيم هذا الفتح ليست من ملء آلي سابق
  const trimEl = document.getElementById('task-trim');
  if (trimEl) delete trimEl.dataset.autofilled;

  if (id) {
    const t = _tasks.find(x => x.id === id);
    if (!t) return;
    selectDecision(t.type);
    document.getElementById('task-ticker').value    = t.ticker || '';
    document.getElementById('task-name').value      = t.name   || '';
    document.getElementById('task-notes').value     = t.notes  || '';
    document.getElementById('task-accumulate').value= t.accumulate_at ?? t.target_price ?? '';
    document.getElementById('task-liquidate').value = t.liquidate_above ?? '';
    document.getElementById('task-trim').value      = t.trim_from ?? '';
  } else {
    _selectedType = null;
    document.querySelectorAll('.dec-option').forEach(o => o.classList.remove('selected'));
    ['task-ticker','task-name','task-notes','task-accumulate','task-liquidate','task-trim'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  }

  document.getElementById('val-modal').style.display = 'flex';
}

function closeValModal() {
  document.getElementById('val-modal').style.display = 'none';
  _editingTaskId = null; _selectedType = null;
}

async function closeValModalWithConfirm() {
  if (!await confirmAsync('هل تريد إلغاء التعديل؟ ستُفقد التغييرات غير المحفوظة.')) return;
  closeValModal();
}

async function closeValModalOverlay(e) {
  if (e.target.id !== 'val-modal') return;
  if (!await confirmAsync('هل تريد إلغاء التعديل؟ ستُفقد التغييرات غير المحفوظة.')) return;
  closeValModal();
}

function selectDecision(type) {
  _selectedType = type;
  document.querySelectorAll('.dec-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.type === type);
  });
}

function onLiquidateInput() {
  const liqEl  = document.getElementById('task-liquidate');
  const trimEl = document.getElementById('task-trim');
  if (!liqEl || !trimEl) return;
  const liq = +liqEl.value;
  // AUDIT-FIX (2026-08): لا تدهس قيمة التخفيف المُدخلة يدوياً — الملء الآلي فقط
  // إذا كانت الخانة فارغة أو كانت قيمتها من ملء آلي سابق (نتتبّعه بـ dataset).
  const isAuto = trimEl.value === '' || trimEl.value === trimEl.dataset.autofilled;
  if (!isAuto) return;
  if (liq > 0) { trimEl.value = (liq - 0.1).toFixed(2); trimEl.dataset.autofilled = trimEl.value; }
  else         { trimEl.value = ''; delete trimEl.dataset.autofilled; }
}

function onTaskTickerInput() {
  const ticker = document.getElementById('task-ticker')?.value?.trim()?.toUpperCase();
  if (!ticker) return;
  const nameEl = document.getElementById('task-name');
  if (!nameEl || nameEl.value) return;
  const h = _holdings.find(x => x.ticker === ticker);
  if (h) nameEl.value = h.name || '';
}

async function saveTask() {
  if (!_selectedType) { showToast('اختر القرار النهائي أولاً', 'error'); return; }

  const ticker    = document.getElementById('task-ticker').value.trim().toUpperCase();
  const name      = document.getElementById('task-name').value.trim();
  const notes     = document.getElementById('task-notes').value.trim();
  const accumulate= +document.getElementById('task-accumulate').value || null;
  const liquidate = +document.getElementById('task-liquidate').value  || null;
  const trimInput = +document.getElementById('task-trim').value       || null;
  const trimFrom  = trimInput ?? (liquidate ? +(liquidate - 0.1).toFixed(2) : null);

  if (!ticker && !notes) { showToast('أدخل رمز السهم أو ملاحظات على الأقل', 'error'); return; }

  const prices = { 'تجميع عند': accumulate, 'تصفية فوق': liquidate, 'تخفيف عند': trimFrom };
  for (const [lbl, v] of Object.entries(prices)) {
    if (v !== null && v <= 0) { showToast(`سعر «${lbl}» يجب أن يكون أكبر من صفر`, 'error'); return; }
  }

  // AUDIT-FIX (2026-08): ترتيب المناطق السعرية منطقي إجبارياً (لِما هو مُدخل):
  // تجميع < تخفيف ≤ تصفية — خطة مقلوبة تُنتج إشارات متناقضة في محرّك القرار.
  if (accumulate !== null && trimFrom !== null && accumulate >= trimFrom) {
    showToast('⛔ سعر التجميع يجب أن يكون أقل من سعر التخفيف (تجميع < تخفيف)', 'error'); return;
  }
  if (trimFrom !== null && liquidate !== null && trimFrom > liquidate) {
    showToast('⛔ سعر التخفيف يجب ألا يتجاوز سعر التصفية (تخفيف ≤ تصفية)', 'error'); return;
  }
  if (accumulate !== null && liquidate !== null && accumulate >= liquidate) {
    showToast('⛔ سعر التجميع يجب أن يكون أقل من سعر التصفية (تجميع < تصفية)', 'error'); return;
  }

  const confirmMsg = _editingTaskId ? 'هل تريد حفظ التعديلات على التقييم؟' : 'هل تريد إضافة هذا التقييم؟';
  if (!await confirmAsync(confirmMsg)) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  // AUDIT-FIX (2026-08): جلسة منتهية كانت تسقط بـ TypeError صامت
  if (!user) { showToast('انتهت الجلسة — أعد تسجيل الدخول', 'error'); return; }
  const now = new Date().toISOString();

  const payload = {
    user_id:         user.id,
    type:            _selectedType,
    ticker:          ticker || null,
    name:            name   || null,
    notes:           notes  || null,
    accumulate_at:   accumulate,
    liquidate_above: liquidate,
    trim_from:       trimFrom,
    // AUDIT-FIX (2026-08): كل تعديل كان يكتب null فوق trim_to الموجود في السجل —
    // نحتفظ بالقيمة المخزّنة عند التعديل (لا واجهة لإدخالها هنا).
    trim_to:         _editingTaskId
                     ? (_tasks.find(t => t.id === _editingTaskId)?.trim_to ?? null)
                     : null,
    status:          _editingTaskId
                     ? (_tasks.find(t => t.id === _editingTaskId)?.status || 'active')
                     : 'active',
    year:            _editingTaskId
                     ? (_tasks.find(t => t.id === _editingTaskId)?.year || new Date().getFullYear())
                     : new Date().getFullYear(),
    auto_generated:  false,
    updated_at:      now,
  };

  let error;
  if (_editingTaskId) {
    // AUDIT-FIX (2026-08): eq('user_id') توحيداً للنمط الدفاعي (لا اعتماد على RLS وحده)
    ({ error } = await supabaseClient.from('portfolio_tasks').update(payload).eq('id', _editingTaskId).eq('user_id', user.id));
  } else {
    payload.created_at = now;
    ({ error } = await supabaseClient.from('portfolio_tasks').insert([payload]));
  }

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(_editingTaskId ? 'تم التحديث ✓' : 'تمت الإضافة ✓', 'success');
  closeValModal();
  await reloadTasks();
}

async function closeTask(id, newStatus) {
  const lbl = newStatus === 'done' ? 'إغلاق كمنجز' : 'إلغاء';
  if (!await confirmAsync(`هل تريد ${lbl} هذا التقييم؟`)) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { showToast('انتهت الجلسة — أعد تسجيل الدخول', 'error'); return; }
  const { error } = await supabaseClient.from('portfolio_tasks').update({
    status:     newStatus,
    closed_at:  new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('user_id', user.id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(newStatus === 'done' ? '✅ تم الإغلاق' : '❌ تم الإلغاء', 'success');
  await reloadTasks();
}

async function reopenTask(id) {
  if (!await confirmAsync('هل تريد إعادة فتح هذا التقييم؟')) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { showToast('انتهت الجلسة — أعد تسجيل الدخول', 'error'); return; }
  const { error } = await supabaseClient.from('portfolio_tasks').update({
    status:     'active',
    closed_at:  null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('user_id', user.id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('↩ تم إعادة الفتح', 'success');
  await reloadTasks();
}

async function reloadTasks() {
  const { data } = await supabaseClient.from('portfolio_tasks')
    .select('*').order('created_at', { ascending: false });
  _tasks = data || [];
  renderKPIs();
  applyFilters();
}

// ── Helpers ────────────────────────────────────────────────────────────
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

document.addEventListener('DOMContentLoaded', init);
