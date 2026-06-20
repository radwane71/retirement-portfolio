const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
];

const CHART_COLORS = [
  '#f0b429','#3b82f6','#22c55e','#a855f7',
  '#ef4444','#06b6d4','#f97316','#ec4899',
  '#84cc16','#8b5cf6','#14b8a6','#f43f5e'
];

// جميع الحقول تُدخل يدوياً من قِبل المستخدم — لا توجد قاعدة بيانات مسبقة
const SECTOR_DB = {};

// قاموس أسماء الأسهم السعودية للمساعدة في الإدخال
const TICKER_DB = {
  '1010':'بنك الرياض','1020':'بنك الجزيرة','1030':'البنك السعودي للاستثمار',
  '1040':'البنك العربي','1050':'البنك السعودي الفرنسي','1060':'بنك الاستثمار',
  '1080':'العربي الوطني','1120':'مصرف الراجحي','1140':'البنك السعودي الأول',
  '1150':'بنك الإنماء','1180':'البنك الأهلي السعودي','2010':'سابك',
  '2030':'بترو رابغ','2060':'كيان السعودية','2090':'الشركة السعودية للنقل',
  '2200':'أكوا باور','2222':'أرامكو السعودية','2350':'شركة دار الأركان',
  '4001':'تداول','4007':'المملكة القابضة','4008':'فواز الحكير',
  '4009':'العثيم للتجزئة','4020':'الجزيرة','4031':'سلامة للتأمين',
  '4050':'ثمار للزراعة','4150':'أبانا القابضة','4160':'تكوين',
  '4190':'دله للخدمات','4200':'بن داود التجارية','4210':'إكسترا',
  '4230':'نادك','4260':'ذهب','4280':'المعادن العربية',
  '4344':'لجين','4345':'ريسان','4334':'مجموعة صدر',
  '6010':'صافولا','6020':'أمريكانا المطاعم','6040':'النقل البحري',
  '6050':'الراجحي للتكافل','7010':'الاتصالات السعودية','7020':'موبايلي',
  '7030':'زين السعودية','8010':'التأمين السعودية','8030':'الإعادة السعودية',
  '8060':'الدرع العربي','8100':'ميدغلف','8120':'توكيولات',
  '8130':'بوبا العربية','8150':'ملاذ للتأمين','8160':'الخليج للتأمين',
  '8180':'سايكو','8200':'المتحدة للتأمين','8230':'الأهلي للتكافل',
};

// Inline select option sets
const INLINE_OPTS = {
  txtype:  [{v:'buy',l:'شراء'},{v:'sell',l:'بيع'},{v:'grant',l:'أسهم منحة'}],
  month:   MONTHS_AR.map((m,i) => ({v:String(i+1),l:m})),
  status:  [{v:'owned',l:'مملوك'},{v:'rented',l:'مؤجر'},{v:'sold',l:'مباع'}],
  cftype:  [{v:'deposit',l:'إيداع'},{v:'withdrawal',l:'سحب'}]
};

// ── Formatting ────────────────────────────────────────────────
function formatSAR(amount, showSign = false) {
  const num = parseFloat(amount) || 0;
  const abs = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // L-3: treat -0 as zero so we never render "+0.00 ر.س" or "-0.00 ر.س"
  const sign = showSign ? (num > 0 ? '+' : num < 0 ? '-' : '') : (num < 0 ? '-' : '');
  return `${sign}${abs} ر.س`;
}

function formatNum(num, decimals = 2) {
  return (parseFloat(num) || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// عدد الأسهم: يُظهر أعداداً صحيحة بدون أصفار، وكسور بحد أقصى 4 أرقام بدون trailing zeros
function formatShares(num) {
  const v = parseFloat(num) || 0;
  if (v === Math.floor(v)) return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  // كسور: أزل الأصفار اللاحقة حتى 4 خانات
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

// AUDIT-FIX: use local calendar date instead of UTC to avoid off-by-one for UTC+3 after 9pm
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// M-6: parse a YYYY-MM-DD string as local midnight — avoids UTC-shift date-off-by-one
function parseDateLocal(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// ── تصدير CSV ─────────────────────────────────────────────────
// headers: مصفوفة أسماء الأعمدة بالعربي
// rows:    مصفوفة مصفوفات (كل صف = مصفوفة قيم مرتبة بنفس ترتيب headers)
function exportCSV(filename, headers, rows) {
  const BOM = '﻿';   // يجعل Excel يقرأ العربية صحيحاً
  const escape = v => {
    const s = v == null ? '' : String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map(r => r.map(escape).join(','))
  ];
  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // L-4: defer revoke so browser finishes consuming the blob URL before it's released
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// HTML-attribute-safe escape
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── ID generator ─────────────────────────────────────────────
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'id_' + crypto.randomUUID().replace(/-/g, '');
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

// ── User-scoped localStorage key ──────────────────────────────
// Call only after requireAuth() has run (sets window._currentUserId).
// Falls back to global key so reads before auth still work for non-sensitive prefs.
function userLsKey(key) {
  return window._currentUserId ? `u:${window._currentUserId}:${key}` : key;
}

// ── Confirmation dialog (mobile-safe, replaces window.confirm) ─
function confirmAsync(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `
      <div style="background:var(--bg-2,#1c2128);border:1px solid var(--border,#30363d);border-radius:12px;max-width:420px;width:100%;padding:24px 20px;box-shadow:0 8px 32px rgba(0,0,0,.5)">
        <p style="margin:0 0 20px;color:var(--text-1,#e6edf3);font-size:.92rem;line-height:1.6">${esc(message)}</p>
        <div style="display:flex;justify-content:flex-end;gap:10px">
          <button id="cdlg-cancel"  class="btn btn-secondary" style="min-width:80px">إلغاء</button>
          <button id="cdlg-confirm" class="btn btn-danger"    style="min-width:80px">تأكيد</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#cdlg-confirm').onclick = () => cleanup(true);
    overlay.querySelector('#cdlg-cancel').onclick  = () => cleanup(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
    document.addEventListener('keydown', function esc_key(e) {
      if (e.key === 'Escape') { cleanup(false); document.removeEventListener('keydown', esc_key); }
    });
  });
}

// ── مزامنة إعدادات المستخدم عبر الأجهزة (user_settings table) ──
// يُخزَّن كل إعداد كـ JSON في Supabase ويُستخدم localStorage كـ cache

async function saveUserSetting(key, value) {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user?.id) return false;
    const { error } = await supabaseClient.from('user_settings').upsert(
      { user_id: user.id, key, value: JSON.stringify(value), updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    );
    return !error;
  } catch { return false; }
}

async function loadUserSetting(key) {
  try {
    // H-2: always filter by user_id so RLS misconfiguration can never return another user's setting
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user?.id) return null;
    const { data } = await supabaseClient.from('user_settings')
      .select('value').eq('user_id', user.id).eq('key', key).maybeSingle();
    if (!data?.value) return null;
    return JSON.parse(data.value);
  } catch { return null; }
}

// ── Error boundary موحّد لاستعلامات Supabase ─────────────────
async function supaQuery(queryFn, errorMsg = 'خطأ في تحميل البيانات') {
  try {
    const { data, error } = await queryFn();
    if (error) throw error;
    return data;
  } catch (e) {
    showToast(errorMsg, 'error');
    console.error('[supaQuery]', errorMsg, e);
    return null;
  }
}

// ── Shared localStorage key constants (TD-3) ──────────────────
// Centralised here so every page uses the same string — no risk of drift.
const RET_GOAL_LS_KEY    = 'retirement_goal_v1';
const SUKUK_PLANNER_KEY  = 'sukuk_planner_v1';

// ── XIRR — معدل العائد الداخلي السنوي المعدَّل بالزمن ────────
// Input: مصفوفة { date: Date, amount: number }
// الشراء = سالب، البيع/التوزيع/القيمة الحالية = موجب
// Output: النسبة المئوية السنوية، أو null إذا تعذّر الحساب
function computeXIRR(flows) {
  if (!flows || flows.length < 2) return null;
  // Guard: all entries must have a valid Date
  if (flows.some(c => !(c.date instanceof Date) || isNaN(c.date.getTime()))) return null;
  const cf = flows.slice().sort((a, b) => a.date - b.date);
  const t0    = cf[0].date;
  const years = cf.map(c => (c.date - t0) / (365 * 86400000));
  const amts  = cf.map(c => c.amount);
  if (!amts.some(a => a > 0) || !amts.some(a => a < 0)) return null;
  // AUDIT-FIX: guard against all-zero amounts which would make flowScale=0 and cause
  // REL_TOL=0, meaning any NPV passes the convergence check and returns a spurious rate.
  const totalAbsFlow = amts.reduce((s, a) => s + Math.abs(a), 0);
  if (totalAbsFlow < 1e-9) return null;

  // H-3: relative tolerance — 0.01% of total absolute flow magnitude
  const flowScale = amts.reduce((s, a) => s + Math.abs(a), 0) || 1;
  const REL_TOL   = flowScale * 1e-4;

  const npv  = r => amts.reduce((s, a, i) => s + a / Math.pow(1 + r, years[i]), 0);
  const dNpv = r => amts.reduce((s, a, i) => s - years[i] * a / Math.pow(1 + r, years[i] + 1), 0);

  // Newton-Raphson
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(r), d = dNpv(r);
    if (!isFinite(f) || !isFinite(d) || d === 0) break;
    const r2 = r - f / d;
    if (!isFinite(r2)) break;
    if (Math.abs(r2 - r) < 1e-7) { r = r2; break; }
    r = r2;
    if (r <= -0.9999) r = -0.9999;
  }
  // fallback: بحث ثنائي
  if (!isFinite(r) || Math.abs(npv(r)) > REL_TOL) {
    let lo = -0.9999, hi = 10;
    if (npv(lo) * npv(hi) > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const fm  = npv(mid);
      if (Math.abs(fm) < REL_TOL) { r = mid; break; }
      if (npv(lo) * fm < 0) hi = mid; else lo = mid;
      r = mid;
    }
  }
  if (!isFinite(r) || r <= -0.9999 || r > 100) return null;
  // تحقق أخير: النتيجة يجب أن تقرّب NPV من الصفر بالنسبة لحجم التدفقات
  if (Math.abs(npv(r)) > REL_TOL) return null;
  return r * 100;
}

// ── UI helpers ────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  // أنشئ الحاوية إن لم تكن موجودة
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);
  }

  // أنشئ عنصر الإشعار
  const item = document.createElement('div');
  item.className = `toast-item ${type}`;
  // H-1: build toast DOM safely — never inject msg as innerHTML to prevent XSS
  item.innerHTML = `
    <div class="toast-body">
      <span class="toast-msg"></span>
      <button class="toast-close" title="إغلاق">✕</button>
    </div>
    <div class="toast-timer"></div>
  `;
  item.querySelector('.toast-msg').textContent = msg;

  // ── دالة مساعدة: ابدأ العداد التلقائي ──
  function startTimer(delay) {
    clearTimeout(item._timer);
    item._timer = setTimeout(() => dismissToast(item), delay);
  }

  // ── ديسكتوب: pause عند hover، resume عند leave فقط لو غير مفتوح يدوياً ──
  item.addEventListener('mouseenter', () => { clearTimeout(item._timer); });
  item.addEventListener('mouseleave', () => {
    if (!item.classList.contains('expanded')) startTimer(5000);
  });

  // ── موبايل / نقر: toggle expanded ──
  item.addEventListener('click', (e) => {
    if (!e.target.classList.contains('toast-close')) {
      const isExpanded = item.classList.toggle('expanded');
      if (isExpanded) {
        // مفتوح يدوياً → أوقف العداد
        clearTimeout(item._timer);
      } else {
        // أُغلق يدوياً → ابدأ عداد قصير
        startTimer(5000);
      }
    }
  });

  // زر الإغلاق
  item.querySelector('.toast-close').addEventListener('click', (e) => {
    e.stopPropagation();
    dismissToast(item);
  });

  stack.appendChild(item);

  // ظهور
  requestAnimationFrame(() => {
    requestAnimationFrame(() => item.classList.add('visible'));
  });

  // اختفاء تلقائي بعد 20 ثانية (إذا لم يُفتح)
  startTimer(20000);
}

function dismissToast(item) {
  clearTimeout(item._timer);
  item.classList.add('hiding');
  setTimeout(() => item.remove(), 350);
}

function setActiveNav(linkId) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const el = document.getElementById(linkId);
  if (el) el.classList.add('active');
  initNavGroups();
}

// ── Collapsible nav groups ────────────────────────────────────
function toggleNavGroup(id) {
  const body = document.getElementById(id);
  const btn  = body && body.previousElementSibling;
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  if (btn) btn.classList.toggle('open', isOpen);
  try {
    const state = JSON.parse(localStorage.getItem('nav_groups_v1') || '{}');
    state[id] = isOpen;
    localStorage.setItem('nav_groups_v1', JSON.stringify(state));
  } catch(e) {}
}

function initNavGroups() {
  const GROUPS = ['grp-portfolio', 'grp-finance', 'grp-other', 'grp-life', 'grp-learn'];
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('nav_groups_v1') || '{}'); } catch(e) {}

  GROUPS.forEach(id => {
    const body = document.getElementById(id);
    const btn  = body && body.previousElementSibling;
    if (!body) return;
    const hasActive = body.querySelector('.nav-link.active');
    // Auto-open group containing active page; otherwise use saved state (default open)
    const shouldOpen = hasActive || (saved[id] !== false);
    body.classList.toggle('open', !!shouldOpen);
    if (btn) btn.classList.toggle('open', !!shouldOpen);
  });
}

// ── Finance ───────────────────────────────────────────────────
// C-1: commission rate as a named constant — verify against your broker agreement.
// Common Tadawul rates: Aljazira/SNB = 0.15% (0.0015), Mubasher/Albilad = 0.25% (0.0025).
const COMMISSION_RATE = 0.0015; // 1.5‰ — update if your broker charges differently
// AUDIT-FIX (M4): per-trade commission cap as a named constant. Standard Tadawul brokerage is
// ~0.155% with a MINIMUM but no maximum — a fixed 100 SAR cap UNDERSTATES friction on trades
// above ~SAR 66,700 (at 0.15%), slightly inflating net P&L. Verify against your broker agreement:
// set to Infinity for an uncapped 0.15% schedule, or to your broker's actual cap.
const COMMISSION_CAP = 100; // SAR — max commission per trade (0 ⇒ none; Infinity ⇒ uncapped)

function calcCommission(shares, price) {
  // نضرب بـ 10000 ونقسم لاحقاً لتجنب أخطاء الفاصلة العائمة في العمليات الحسابية
  const cap10k     = (COMMISSION_CAP > 0 && isFinite(COMMISSION_CAP)) ? COMMISSION_CAP * 10000 : Infinity;
  const tv10k      = Math.round(parseFloat(shares) * parseFloat(price) * 10000);
  const comm10k    = Math.min(Math.round(tv10k * COMMISSION_RATE), cap10k); // cap = COMMISSION_CAP × 10000
  const vat10k     = Math.round(comm10k * 0.15);
  const tradeValue = tv10k   / 10000;
  const commission = comm10k / 10000;
  const vat        = vat10k  / 10000;
  return {
    tradeValue,
    commission: +commission.toFixed(4),
    vat:        +vat.toFixed(4),
    totalBuy:   +((tv10k + comm10k + vat10k) / 10000).toFixed(4),
    totalSell:  +((tv10k - comm10k - vat10k) / 10000).toFixed(4)
  };
}

// ── Shared "explain this card" modal (ⓘ) ──────────────────────
// يُستخدم في كل الصفحات (عدا لوحة التحكم التي لها نسخة خاصة بأرقام حيّة).
// الصفحة تُعرّف window.CARD_INFO = { key: { title, body } } وتضع أزرار:
//   <button class="info-btn" type="button" onclick="showCardInfo('key')">ⓘ</button>
// body يمكن أن يكون نصاً أو دالة تُعيد نصاً (لحساب أرقام عند الفتح).
window.openInfoModal = function(title, bodyHtml) {
  let ov = document.getElementById('tharwa-info-modal');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'tharwa-info-modal';
    ov.className = 'modal-overlay';
    ov.style.display = 'none';
    ov.innerHTML =
      '<div class="modal" style="max-width:480px">' +
        '<div class="modal-header">' +
          '<span class="modal-title" id="tharwa-info-title">—</span>' +
          '<button class="modal-close" type="button" aria-label="إغلاق">✕</button>' +
        '</div>' +
        '<div id="tharwa-info-body" style="padding:4px 0 8px;line-height:1.8;font-size:0.92rem"></div>' +
      '</div>';
    document.body.appendChild(ov);
    const close = () => { ov.style.display = 'none'; };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('.modal-close').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }
  ov.querySelector('#tharwa-info-title').textContent = title;
  ov.querySelector('#tharwa-info-body').innerHTML = bodyHtml;
  ov.style.display = 'flex';
};

// نسخة مشتركة — تقرأ من window.CARD_INFO. لوحة التحكم تُعرّف نسختها الخاصة
// (function declaration في dashboard.js تُحمَّل لاحقاً وتتجاوز هذه على صفحتها فقط).
window.showCardInfo = function(key) {
  const c = (window.CARD_INFO || {})[key];
  if (!c) return;
  const body = typeof c.body === 'function' ? c.body() : c.body;
  openInfoModal(c.title, body);
};

// ── Chart defaults ────────────────────────────────────────────
function chartDefaults() {
  const light = document.body.classList.contains('light-mode');
  const textColor     = light ? '#52606d' : '#8b949e';
  const tooltipBg     = light ? '#eaecf1' : '#1c2128';
  const tooltipTitle  = light ? '#1a1d24' : '#e6edf3';
  const tooltipBorder = light ? '#bcc2cc' : '#30363d';
  const gridColor     = light ? 'rgba(0,0,0,0.09)' : 'rgba(48,54,61,0.6)';
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: textColor, font: { family: 'Tajawal', size: 12 }, padding: 14, usePointStyle: true } },
      tooltip: {
        backgroundColor: tooltipBg, titleColor: tooltipTitle, bodyColor: textColor,
        borderColor: tooltipBorder, borderWidth: 1, padding: 10,
        titleFont: { family: 'Tajawal' }, bodyFont: { family: 'Tajawal' }
      }
    },
    scales: {
      x: { ticks: { color: textColor, font: { family: 'Tajawal' } }, grid: { color: gridColor } },
      y: { ticks: { color: textColor, font: { family: 'Tajawal' } }, grid: { color: gridColor } }
    }
  };
}

// ── Theme & Font Zoom ─────────────────────────────────────────
(function initThemeAndZoom() {
  // Theme
  const savedTheme = localStorage.getItem('tharwa-theme') || 'dark';
  if (savedTheme === 'light') document.body.classList.add('light-mode');

  // Font zoom (base 15px, steps of 1px, range 11-21)
  const ZOOM_MIN = 11, ZOOM_MAX = 21, ZOOM_DEF = 15;
  let zoomPx = parseInt(localStorage.getItem('tharwa-zoom') || ZOOM_DEF);
  if (zoomPx < ZOOM_MIN) zoomPx = ZOOM_MIN;
  if (zoomPx > ZOOM_MAX) zoomPx = ZOOM_MAX;
  document.documentElement.style.fontSize = zoomPx + 'px';

  function applyZoom(px) {
    zoomPx = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, px));
    document.documentElement.style.fontSize = zoomPx + 'px';
    localStorage.setItem('tharwa-zoom', zoomPx);
    const lbl = document.querySelector('.zoom-label');
    if (lbl) lbl.textContent = Math.round(zoomPx / ZOOM_DEF * 100) + '%';
  }

  window.zoomIn  = () => applyZoom(zoomPx + 1);
  window.zoomOut = () => applyZoom(zoomPx - 1);
  window.getZoomPct = () => Math.round(zoomPx / ZOOM_DEF * 100);

  // Inject widget after DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    // Only inject on pages with sidebar (not login/maintenance)
    if (!document.querySelector('.sidebar')) return;
    const w = document.createElement('div');
    w.className = 'font-zoom-widget';
    w.innerHTML = `
      <button onclick="zoomOut()" title="تصغير الخط">A−</button>
      <span class="zoom-label">${window.getZoomPct()}%</span>
      <button onclick="zoomIn()" title="تكبير الخط">A+</button>`;
    document.body.appendChild(w);
  });
})();

// ── Notes Popup (shared — used by salary, life-goals, inventory, school) ─────
window.showNotePopup = function(btnEl) {
  const existing = document.getElementById('note-popup');
  if (existing) {
    if (existing._srcBtn === btnEl) { existing.remove(); return; }
    existing.remove();
  }
  // Decode stored HTML entities back to plain text, then render safely via DOM
  const raw = btnEl.dataset.note || '';
  const txt = raw
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  const popup = document.createElement('div');
  popup.id = 'note-popup';
  popup._srcBtn = btnEl;

  const header = document.createElement('div');
  header.className = 'note-popup-header';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = '📝 ملاحظة';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'note-popup-close';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => popup.remove();
  header.appendChild(headerTitle);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'note-popup-body';
  // Render plain text with line breaks — no innerHTML, no XSS
  txt.split('\n').forEach((line, i) => {
    if (i > 0) body.appendChild(document.createElement('br'));
    body.appendChild(document.createTextNode(line));
  });

  popup.appendChild(header);
  popup.appendChild(body);
  document.body.appendChild(popup);
  const rect = btnEl.getBoundingClientRect();
  const sY = window.scrollY || 0, sX = window.scrollX || 0;
  let top  = rect.bottom + sY + 6;
  let left = rect.left  + sX - 180;
  if (left < 8) left = 8;
  if (left + 300 > window.innerWidth - 8) left = window.innerWidth - 308;
  popup.style.top = top + 'px'; popup.style.left = left + 'px';
  setTimeout(() => {
    document.addEventListener('click', function outside(e) {
      if (!popup.contains(e.target) && e.target !== btnEl) {
        popup.remove(); document.removeEventListener('click', outside);
      }
    });
  }, 0);
};

window.toggleTheme = function(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    localStorage.setItem('tharwa-theme', 'light');
  } else {
    document.body.classList.remove('light-mode');
    localStorage.setItem('tharwa-theme', 'dark');
  }
};

// ══════════════════════════════════════════════════════════════
// Mobile Navigation Drawer
// يُحقن المكوّنان (topbar + overlay) في DOM عند التحميل
// لا يحتاج تعديل HTML في أي صفحة
// ══════════════════════════════════════════════════════════════
(function setupMobileNav() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initMobileNav);
  } else {
    _initMobileNav();
  }
})();

function _initMobileNav() {
  // inject only once
  if (document.getElementById('mobile-topbar')) return;

  // ── اسم الصفحة الحالية من العنصر النشط ────────────────────
  const activeLink = document.querySelector('.nav-link.active');
  const pageName   = activeLink
    ? (activeLink.querySelector('span:not(.icon)')?.textContent?.trim() || '')
    : document.title.split('-')[0].trim();

  // ── Top bar ────────────────────────────────────────────────
  const topbar = document.createElement('div');
  topbar.id = 'mobile-topbar';
  topbar.innerHTML = `
    <div class="mobile-topbar-brand">
      <img src="apple-touch-icon.png" alt="ثروة">
      <span>ثروة</span>
      ${pageName ? `<span class="mobile-topbar-page">/ ${pageName}</span>` : ''}
    </div>
    <button class="hamburger-btn" id="hamburger-btn" aria-label="القائمة" onclick="toggleMobileNav()">
      <span></span><span></span><span></span>
    </button>`;
  document.body.prepend(topbar);

  // ── Overlay ─────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'mobile-overlay';
  overlay.addEventListener('click', closeMobileNav);
  document.body.appendChild(overlay);

  // ── Close drawer on any nav-link click ──────────────────────
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => closeMobileNav());
  });

  // ── Close drawer on Escape key ──────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMobileNav();
  });

  // ── Update page name after setActiveNav() runs ───────────────
  // setActiveNav تُستدعى في init() كل صفحة — ننتظر قليلاً
  setTimeout(() => {
    const active = document.querySelector('.nav-link.active');
    const pageEl = document.querySelector('.mobile-topbar-page');
    if (active && pageEl) {
      const nm = active.querySelector('span:not(.icon)')?.textContent?.trim();
      if (nm) pageEl.textContent = '/ ' + nm;
    }
  }, 400);

  // ── Swipe-to-close (touch gesture) ──────────────────────────
  let touchStartX = 0;
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    sidebar.addEventListener('touchend', e => {
      const dx = touchStartX - e.changedTouches[0].clientX;
      if (dx > 60) closeMobileNav(); // swipe left → close
    }, { passive: true });
  }
}

window.toggleMobileNav = function() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('mobile-overlay');
  const btn     = document.getElementById('hamburger-btn');
  if (!sidebar) return;
  const isOpen = sidebar.classList.toggle('mobile-open');
  overlay?.classList.toggle('active', isOpen);
  btn?.classList.toggle('open', isOpen);
  // منع scroll الصفحة الخلفية عند فتح الدراور
  document.body.style.overflow = isOpen ? 'hidden' : '';
};

window.closeMobileNav = function() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('mobile-overlay');
  const btn     = document.getElementById('hamburger-btn');
  sidebar?.classList.remove('mobile-open');
  overlay?.classList.remove('active');
  btn?.classList.remove('open');
  document.body.style.overflow = '';
};

// ── Inline Editing ────────────────────────────────────────────
// Allowlist: only these table→field combinations may be written via inline edit.
// Prevents a user manipulating data-* attributes to update arbitrary rows/fields.
const INLINE_EDIT_ALLOWLIST = {
  transactions:     new Set(['date','ticker','name','type','shares','price','notes']),
  holdings:         new Set(['ticker','name','sector','shares','avg_price','current_price','target_weight','notes','price_manual']),
  real_estate:      new Set(['current_value','status','notes','name','rent_amount','purchase_price','address']),
  dividends:        new Set(['amount','date','year','month','ticker','name','notes']),
  cashflow_entries: new Set(['amount','date','type','notes','description']),
  stock_targets:    new Set(['target_pct','entry_price','exit_price','notes']),
  sector_targets:   new Set(['target_pct']),
  life_goals:       new Set(['title','target_amount','saved_amount','target_date','notes','status','priority']),
  salary_entries:   new Set(['amount','date','notes','type','description']),
  inventory_items:  new Set(['name','value','notes','category','status','purchase_date','purchase_price']),
  tasks:            new Set(['title','status','priority','notes','due_date','description']),
  review_logs:      new Set(['notes','rating','date']),
  watchlist:        new Set(['ticker','name','target_price','notes','sector']),
};

function enableInlineEditing(tbody, postSaveFn) {
  if (tbody._ieEnabled) return;
  tbody._ieEnabled = true;

  tbody.addEventListener('click', async (e) => {
    if (tbody._ieBusy) return;
    const td = e.target.closest('td.editable');
    if (!td || td.querySelector('.inline-input')) return;

    tbody._ieBusy = true;
    const { table, id, field, type } = td.dataset;
    await _doInlineEdit(td, tbody, { table, id, field, type, raw: td.dataset.raw, selectKey: td.dataset.select }, postSaveFn);
  });
}

async function _doInlineEdit(td, tbody, { table, id, field, type, raw, selectKey }, postSaveFn) {
  // Security: reject unknown table or field to prevent DOM-attribute manipulation attacks
  if (!INLINE_EDIT_ALLOWLIST[table] || !INLINE_EDIT_ALLOWLIST[table].has(field)) {
    showToast('حقل غير مصرح به', 'error');
    tbody._ieBusy = false;
    return;
  }
  const origHTML = td.innerHTML;
  const opts = selectKey ? INLINE_OPTS[selectKey] : null;
  let el;

  if (opts) {
    el = document.createElement('select');
    el.className = 'inline-input';
    opts.forEach(o => {
      const op = document.createElement('option');
      op.value = o.v; op.textContent = o.l;
      if (String(o.v) === String(raw)) op.selected = true;
      el.appendChild(op);
    });
  } else {
    el = document.createElement('input');
    el.className = 'inline-input';
    el.type  = type === 'number' ? 'number' : (type === 'date' ? 'date' : 'text');
    el.value = raw == null ? '' : raw;
    if (type === 'number') el.step = 'any';
  }

  td.innerHTML = '';
  td.appendChild(el);
  el.focus();
  if (el.type === 'text') el.select?.();

  let done = false;

  async function commit() {
    if (done) return;
    done = true;
    const newVal = el.value;

    if (String(newVal) === String(raw ?? '')) {
      td.innerHTML = origHTML;
      tbody._ieBusy = false;
      return;
    }

    // H-7: reject empty/NaN for numeric fields instead of silently writing 0
    let updateVal;
    if (type === 'number') {
      const n = parseFloat(newVal);
      if (isNaN(n)) {
        showToast('قيمة غير صالحة — أدخل رقماً', 'error');
        td.innerHTML = origHTML;
        tbody._ieBusy = false;
        return;
      }
      updateVal = n;
    } else {
      updateVal = newVal;
    }
    td.innerHTML = '<span class="text-muted small">يتم الحفظ…</span>';

    const { error } = await supabaseClient.from(table).update({ [field]: updateVal })
      .eq('id', id).eq('user_id', window._currentUserId);
    tbody._ieBusy = false;

    if (error) {
      showToast('خطأ في الحفظ: ' + error.message, 'error');
      td.innerHTML = origHTML;
      return;
    }

    showToast('تم الحفظ ✓', 'success');
    if (postSaveFn) await postSaveFn(id, field, updateVal);
  }

  el.addEventListener('blur', commit);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { done = true; tbody._ieBusy = false; td.innerHTML = origHTML; }
  });
}

// ══════════════════════════════════════════════════════════════════════
// 🧩 مقياس التنويع — دالة نقية مشتركة (المصدر الوحيد للحقيقة)
// تُستخدم في لوحة التحكم (renderDiversificationCard) وفي صفحة أسهم المراقبة
// (تحليل أثر الإضافة) — أي تعديل هنا ينعكس تلقائياً على الصفحتين.
// المنهجية: HHI خام → موضع المؤشر، مُعايَر للمستثمر الفردي
//   (Evans & Archer 1968: 15 سهماً فعّالاً تُزيل ~90% من المخاطر القابلة للتنويع)
// ----------------------------------------------------------------------
// المُدخل: positions = [{ value:Number, sector:String }]
// المُخرج: null إذا لا توجد مراكز/قيمة، وإلا كائن يضم كل مقاييس التنويع.
// ══════════════════════════════════════════════════════════════════════
function computeDiversification(positions) {
  const items = (positions || []).filter(p => +p.value > 0);
  const totalVal = items.reduce((s, p) => s + +p.value, 0);
  if (!items.length || totalVal <= 0) return null;

  const n = items.length;
  const weights = items.map(p => +p.value / totalVal);
  const hhi = weights.reduce((s, w) => s + w * w, 0);          // 1/n .. 1.0
  const effectiveN = Math.max(1, Math.round(1 / hhi));         // N_فعّال

  // إحصاءات القطاعات
  const secMap = {};
  items.forEach(p => {
    const k = (p.sector || '').trim() || 'غير مصنف';
    secMap[k] = (secMap[k] || 0) + +p.value / totalVal;        // وزن نسبي 0..1
  });
  const sectorCount = Object.keys(secMap).length;
  const secHHI = Object.values(secMap).reduce((s, w) => s + w * w, 0);

  // أكبر مركز
  const sorted = [...items].sort((a, b) => +b.value - +a.value);
  const top1Pct  = sorted[0] ? (+sorted[0].value / totalVal * 100) : 0;
  const top1Name = sorted[0]?.label || '';

  // ── موضع المؤشر: مشتقّ من HHI الخام مباشرةً ─────────────────
  // نقاط التحويل: [HHI_خام → gaugePos %]  (0 = مركّز تماماً، 100 = تنوع واسع)
  const bps = [
    [1.000,  0], [0.500,  8], [0.250, 22], [0.150, 40],
    [0.100, 62], [0.067, 80], [0.050, 88], [0.033, 93],
    [0.020, 97], [0.000, 100]
  ];
  let stockGauge = 100;
  for (let i = 0; i < bps.length - 1; i++) {
    const [h1, g1] = bps[i], [h2, g2] = bps[i + 1];
    if (hhi >= h2) {
      const t = (hhi - h2) / (h1 - h2);
      stockGauge = g2 + t * (g1 - g2);
      break;
    }
  }

  // معامل القطاعات: 0.70 (قطاع واحد) → 1.00 (≥ 6 قطاعات فعّالة)
  const effSectors   = secHHI > 0 ? 1 / secHHI : sectorCount;
  const sectorFactor = Math.min(1.0, 0.70 + 0.30 * Math.min(1, effSectors / 6));
  const gaugePos = Math.min(97, Math.max(3, Math.round(stockGauge * sectorFactor)));

  // تحديد المنطقة — نفس عتبات لوحة التحكم
  let zoneLabel, zoneColor;
  if      (gaugePos < 22) { zoneLabel = 'مركّز جداً';  zoneColor = '#ef4444'; }
  else if (gaugePos < 40) { zoneLabel = 'تركيز ملحوظ'; zoneColor = '#f97316'; }
  else if (gaugePos < 60) { zoneLabel = 'تنوع معقول';  zoneColor = '#84cc16'; }
  else if (gaugePos < 80) { zoneLabel = 'تنوع جيد';    zoneColor = '#22c55e'; }
  else                    { zoneLabel = 'تنوع ممتاز';  zoneColor = '#10b981'; }

  return {
    totalVal, n, hhi, effectiveN,
    secMap, sectorCount, secHHI, effSectors,
    top1Pct, top1Name,
    stockGauge, sectorFactor, gaugePos, zoneLabel, zoneColor,
  };
}
