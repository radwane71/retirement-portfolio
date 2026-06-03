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
  const sign = showSign ? (num >= 0 ? '+' : '-') : (num < 0 ? '-' : '');
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

function todayISO() {
  return new Date().toISOString().split('T')[0];
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
  URL.revokeObjectURL(url);
}

// HTML-attribute-safe escape
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── ID generator ─────────────────────────────────────────────
function uid() { return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

// ── XIRR — معدل العائد الداخلي السنوي المعدَّل بالزمن ────────
// Input: مصفوفة { date: Date, amount: number }
// الشراء = سالب، البيع/التوزيع/القيمة الحالية = موجب
// Output: النسبة المئوية السنوية، أو null إذا تعذّر الحساب
function computeXIRR(flows) {
  if (!flows || flows.length < 2) return null;
  const cf = flows.slice().sort((a, b) => a.date - b.date);
  const t0    = cf[0].date;
  const years = cf.map(c => (c.date - t0) / (365 * 86400000));
  const amts  = cf.map(c => c.amount);
  if (!amts.some(a => a > 0) || !amts.some(a => a < 0)) return null;

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
  if (!isFinite(r) || Math.abs(npv(r)) > 1) {
    let lo = -0.9999, hi = 10;
    if (npv(lo) * npv(hi) > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const fm  = npv(mid);
      if (Math.abs(fm) < 1e-6) { r = mid; break; }
      if (npv(lo) * fm < 0) hi = mid; else lo = mid;
      r = mid;
    }
  }
  if (!isFinite(r) || r <= -0.9999 || r > 100) return null;
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
  item.innerHTML = `
    <div class="toast-body">
      <span>${msg}</span>
      <button class="toast-close" title="إغلاق">✕</button>
    </div>
    <div class="toast-timer"></div>
  `;

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
function calcCommission(shares, price) {
  const tradeValue = parseFloat(shares) * parseFloat(price);
  const commission = Math.min(tradeValue * 0.0015, 100);
  const vat = commission * 0.15;
  return {
    tradeValue,
    commission: +commission.toFixed(4),
    vat:        +vat.toFixed(4),
    totalBuy:   +(tradeValue + commission + vat).toFixed(4),
    totalSell:  +(tradeValue - commission - vat).toFixed(4)
  };
}

// ── Chart defaults ────────────────────────────────────────────
function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#8b949e', font: { family: 'Tajawal', size: 12 }, padding: 14, usePointStyle: true } },
      tooltip: {
        backgroundColor: '#1c2128', titleColor: '#e6edf3', bodyColor: '#8b949e',
        borderColor: '#30363d', borderWidth: 1, padding: 10,
        titleFont: { family: 'Tajawal' }, bodyFont: { family: 'Tajawal' }
      }
    },
    scales: {
      x: { ticks: { color: '#8b949e', font: { family: 'Tajawal' } }, grid: { color: 'rgba(48,54,61,0.6)' } },
      y: { ticks: { color: '#8b949e', font: { family: 'Tajawal' } }, grid: { color: 'rgba(48,54,61,0.6)' } }
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
  const raw = btnEl.dataset.note || '';
  const txt = raw
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const popup = document.createElement('div');
  popup.id = 'note-popup';
  popup._srcBtn = btnEl;
  popup.innerHTML = `
    <div class="note-popup-header">
      <span>📝 ملاحظة</span>
      <button class="note-popup-close" onclick="document.getElementById('note-popup').remove()">✕</button>
    </div>
    <div class="note-popup-body">${txt.replace(/\n/g, '<br>')}</div>`;
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

    const updateVal = type === 'number' ? (parseFloat(newVal) || 0) : newVal;
    td.innerHTML = '<span class="text-muted small">يتم الحفظ…</span>';

    const { error } = await supabaseClient.from(table).update({ [field]: updateVal }).eq('id', id);
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
