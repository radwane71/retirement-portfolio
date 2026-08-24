let cfEntries  = [];
let cfFiltered = [];
let divEntries = [];  // أرباح موزعة مقروءة من جدول dividends (للعرض فقط — لا تُكتب في cashflow_entries)

const TYPE_AR = { deposit: 'إيداع', withdrawal: 'سحب', dividend: 'أرباح موزعة' };

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'cashflow-summary': {
    title: '💸 التدفقات النقدية',
    body: `
      <p>هنا تسجّل المال الذي تُدخله لحساب الاستثمار (إيداع) أو تُخرجه منه (سحب). هذا يفصل «أموالك التي ضختها» عن «أرباح السوق» — أساسٌ لقياس أدائك الحقيقي.</p>
      <div class="info-formula"><strong>صافي التدفق = إجمالي الإيداعات − إجمالي السحوبات</strong></div>
      <p class="info-note">💡 لماذا يهم؟ لو ارتفعت محفظتك 10,000 ر.س لكنك أودعت 10,000، فالنمو من جيبك لا من السوق. هذه السجلات تُغذّي حساب معدل مساهمتك الشهري ومسار الوصول للتقاعد (FIRE) في لوحة التحكم. الأرباح الموزعة تُقرأ تلقائياً من صفحتها ولا تحتاج إدخالاً هنا.</p>`
  },
};

// ══════════════════════════════════════════════════════════════════════
// جسر رموز التصميم + مولّدات المكوّنات
// ──────────────────────────────────────────────────────────────────────
// ربط: نسخة طبق الأصل من مولّدات js/dashboard.js (أعلى الملف) — هذه الصفحة
// لا تُحمّل dashboard.js، فتُنسخ هنا بنفس التوقيعات بالضبط. أي تعديل هناك
// يجب أن يُنسخ هنا (والعكس). المكوّنات معرَّفة في css/style.css تحت
// «نظام مكوّنات اللوحة»: .card-head .hero-num .tag .meter .brow .kvs .note .stack .dot
// قاعدة ثابتة: لا لون سداسي مكتوب يدوياً في هذا الملف — رموز التصميم فقط،
// واللون وحده لا يحمل معنى (كل حالة معها أيقونة ونص).
// ══════════════════════════════════════════════════════════════════════
function cssVar(name) {
  // الثيم الفاتح يُعرَّف على body.light-mode لا على :root — نقرأ من body أولاً
  const host = document.body || document.documentElement;
  return getComputedStyle(host).getPropertyValue(name).trim();
}
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
// ملاحظة داخل بطاقة (.note)
function noteHtml(icon, html, state = '') {
  return `<div class="note"${state ? ` data-state="${state}"` : ''}><span class="ic">${icon}</span><div>${html}</div></div>`;
}
// لوحة مفاتيح/قيم (.kvs) — items: [[label, value], …]
function kvsHtml(items) {
  return `<div class="kvs">${items.filter(Boolean)
    .map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
}

// وسم نوع الحركة — أيقونة + نص، لا لون وحده
const CF_TYPE_META = {
  deposit:    { icon: '⬆️', state: 'good' },
  withdrawal: { icon: '⬇️', state: 'bad'  },
  dividend:   { icon: '💰', state: 'good' },
};
function cfTypeTag(type) {
  const m = CF_TYPE_META[type] || { icon: '❔', state: '' };
  return tagHtml(m.icon, esc(TYPE_AR[type] || type || '—'), m.state);
}

function edCf(rowId, field, type, raw, extraCls = '', selectKey = '') {
  return `class="editable${type==='number'?' num':''}${extraCls?' '+extraCls:''}" ` +
    `data-table="cashflow_entries" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"` +
    (selectKey ? ` data-select="${selectKey}"` : '');
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-cashflows');

  document.getElementById('cf-date').value = todayISO();
  await loadEntries();
  buildYearFilter();
  renderSummary();
  renderTable();
}

async function loadEntries() {
  const [rCf, rDiv] = await Promise.all([
    supabaseClient.from('cashflow_entries').select('*').eq('is_archived', false).order('date', { ascending: false }),
    supabaseClient.from('dividends').select('id, date, ticker, name, amount, year').eq('is_archived', false).order('date', { ascending: false })
  ]);
  if (rCf.error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  cfEntries  = rCf.data  || [];
  // حوّل سجلات الأرباح إلى تنسيق موحّد (للعرض فقط)
  divEntries = (rDiv.data || []).map(d => ({
    _isDividend: true,
    id:          d.id,
    date:        d.date,
    type:        'dividend',
    amount:      +d.amount,
    notes:       `${d.ticker || ''} ${d.name ? '— ' + d.name : ''} (${d.year})`.trim(),
  }));
}

// AUDIT-FIX: سنة القيد بـ parseDateLocal (من utils.js) بدل new Date —
// تحليل UTC كان قد يُزحزح قيد 1 يناير/31 ديسمبر لسنة مجاورة حسب المنطقة الزمنية
function _cfYear(dateStr) {
  const d = parseDateLocal(dateStr);
  return d ? d.getFullYear() : null;
}

function buildYearFilter() {
  // يشمل سنوات التدفقات النقدية + سنوات الأرباح الموزعة
  const years = [...new Set([
    ...cfEntries.map(e => _cfYear(e.date)),
    ...divEntries.map(e => _cfYear(e.date)),
  ].filter(Boolean))].sort((a,b) => b-a);
  const sel = document.getElementById('cf-year-filter');
  // keep first "كل السنوات" option
  sel.innerHTML = '<option value="">كل السنوات</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join('');
  // default to current year if available
  const curYear = new Date().getFullYear();
  if (years.includes(curYear)) sel.value = curYear;
  applyFilter();
}

let divFiltered = [];

function applyFilter() {
  const yr = document.getElementById('cf-year-filter')?.value;
  cfFiltered  = yr ? cfEntries.filter(e => _cfYear(e.date) === +yr)  : [...cfEntries];
  divFiltered = yr ? divEntries.filter(e => _cfYear(e.date) === +yr) : [...divEntries];
}

function filterYear() {
  applyFilter();
  renderTable();
}

// ملخص واحد يقوده رقم واحد: صافي التدفق. المجاميع على كل السنوات ولا
// تتأثر بفلتر الجدول — مصرَّح به نصاً في رأس البطاقة.
function renderSummary() {
  // ⚠️ `+e.amount` بلا حارس: قيمة غير رقمية (من استيراد أو استعادة
  // نسخة) تُنتج NaN يسمّم المجموع كلّه — ثم `formatSAR` تحوّله إلى
  // **0.00 ر.س**، فلا يظهر الخلل ويُعرَض صفراً. والبطاقة تناقض نفسها:
  // البطل يعرض 0.00 والتصنيف حسب السنة يعرض 1,000. م.20: ما لا يُقرأ
  // يُعلَن ولا يُبتلع.
  const _num = v => { const n = +v; return isFinite(n) ? n : null; };
  const _badAmt = [...cfEntries, ...divEntries].filter(e => _num(e.amount) === null).length;
  const _sum = (arr) => arr.reduce((s, e) => s + (_num(e.amount) || 0), 0);
  const totalDep  = _sum(cfEntries.filter(e => e.type === 'deposit'));
  const totalWith = _sum(cfEntries.filter(e => e.type === 'withdrawal'));
  const totalDiv  = _sum(divEntries);
  const net       = totalDep - totalWith;

  const curYear   = new Date().getFullYear();
  const yearDep   = _sum(cfEntries.filter(e => e.type === 'deposit'    && _cfYear(e.date) === curYear));
  const yearWith  = _sum(cfEntries.filter(e => e.type === 'withdrawal' && _cfYear(e.date) === curYear));
  const yearDiv   = _sum(divEntries.filter(e => _cfYear(e.date) === curYear));
  const yearNet   = yearDep - yearWith;

  const el = document.getElementById('cf-summary');
  if (!el) return;

  if (!cfEntries.length && !divEntries.length) {
    el.innerHTML = cardHead('💸 ملخص التدفقات النقدية', '', cfInfoBtn()) +
      `<div class="empty-state"><div class="icon">📈</div><p>لا توجد حركات مسجّلة بعد</p></div>`;
    return;
  }

  // نسبة ما سُحب من مجموع ما أُودع — كلما ارتفعت قلّ رأس المال الصافي المضخوخ
  const withPct = totalDep > 0 ? totalWith / totalDep * 100 : 0;
  const netState = net > 0 ? 'good' : net < 0 ? 'bad' : '';
  const netIcon  = net > 0 ? '⬆️' : net < 0 ? '⬇️' : '➖';
  const netWord  = net > 0 ? 'ضخّ صافٍ' : net < 0 ? 'سحب صافٍ' : 'متعادل';

  el.innerHTML =
    cardHead('💸 ملخص التدفقات النقدية',
      'كل السنوات — لا يتأثر بفلتر السنة في جدول الحركات', cfInfoBtn()) +
    `<div class="stack">
      <div class="cf-hero">
        <div>
          <div class="hero-num">${formatSAR(net, true)}</div>
          <div class="hero-cap">صافي التدفق = إجمالي الإيداعات − إجمالي السحوبات</div>
        </div>
        <div class="cf-tagrow">
          ${tagHtml(netIcon, netWord, netState)}
          ${tagHtml('🗓️', `صافي ${curYear}: ${formatSAR(yearNet, true)}`, yearNet >= 0 ? 'good' : 'bad')}
        </div>
      </div>
      ${meterHtml({
        label: 'ما سُحب من مجموع ما أُودع',
        valueTxt: formatNum(withPct, 1) + '%',
        pct: withPct,
        state: withPct >= 50 ? 'warn' : '',
        foot: `إيداعات ${formatSAR(totalDep)} · سحوبات ${formatSAR(totalWith)}`,
      })}
      ${kvsHtml([
        ['إجمالي الإيداعات', formatSAR(totalDep)],
        ['إجمالي السحوبات', formatSAR(totalWith)],
        [`إيداعات ${curYear}`, formatSAR(yearDep)],
        [`سحوبات ${curYear}`, formatSAR(yearWith)],
        ['الأرباح الموزعة (كل السنوات)', formatSAR(totalDiv)],
        [`أرباح ${curYear}`, formatSAR(yearDiv)],
      ])}
      ${noteHtml('💰',
        `<b>الأرباح الموزعة خارج صافي التدفق عمداً.</b> صافي التدفق يقيس ما ضخّته من جيبك،
         والأرباح مالٌ ولّدته المحفظة نفسها — إدخالها هنا يحتسبها مرتين. تُقرأ تلقائياً من
         <a href="dividends.html">صفحة الأرباح</a> وتُصنَّف بتاريخ الاستلام (أساس نقدي) لا بالسنة المالية.`, '')}
      ${renderYearBreakdown()}
    </div>`;
}

function cfInfoBtn() {
  return `<button class="info-btn info-inline" type="button" onclick="showCardInfo('cashflow-summary')"
    title="ما هي التدفقات النقدية ولماذا تهم؟">ⓘ</button>`;
}

// تصنيف حسب السنة — عرض مشتق من نفس البيانات، لا حساب جديد
function renderYearBreakdown() {
  const byYear = {};
  const touch = y => (byYear[y] = byYear[y] || { dep: 0, wit: 0, div: 0 });
  cfEntries.forEach(e => {
    const y = _cfYear(e.date); if (y == null) return;
    const b = touch(y);
    if (e.type === 'deposit') b.dep += +e.amount || 0;
    else if (e.type === 'withdrawal') b.wit += +e.amount || 0;
  });
  divEntries.forEach(e => {
    const y = _cfYear(e.date); if (y == null) return;
    touch(y).div += +e.amount || 0;
  });

  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  if (!years.length) return '';

  const rows = years.map(y => {
    const b = byYear[y];
    const n = b.dep - b.wit;
    return `<tr>
      <td>${y}</td>
      <td class="num">${formatSAR(b.dep)}</td>
      <td class="num">${formatSAR(b.wit)}</td>
      <td class="num">${formatSAR(n, true)}</td>
      <td class="num">${formatSAR(b.div)}</td>
    </tr>`;
  }).join('');

  return `<details class="cf-details">
      <summary>📅 التصنيف حسب السنة (${years.length} ${years.length === 1 ? 'سنة' : 'سنوات'})</summary>
      <div class="dt-body">
        <div class="table-wrapper">
          <table class="cf-year-table">
            <thead><tr><th>السنة</th><th>إيداعات</th><th>سحوبات</th><th>الصافي</th><th>أرباح موزعة</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="small text-muted mt-2">السنة تُستخرج من التاريخ بالتقويم المحلي — قيد 1 يناير أو 31 ديسمبر لا ينزلق لسنة مجاورة.</p>
      </div>
    </details>`;
}

function renderTable() {
  const tbody = document.getElementById('cf-tbody');
  if (!tbody) return;

  const hasManual = cfFiltered.length > 0;
  const hasDiv    = divFiltered.length > 0;

  if (!hasManual && !hasDiv) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">📈</div><p>لا توجد حركات لهذه الفترة</p></div></td></tr>`;
    enableInlineEditing(tbody, onCfSaved);
    return;
  }

  // صفوف الحركات اليدوية (قابلة للتعديل)
  const manualRows = cfFiltered.map(e => `<tr>
    <td ${edCf(e.id,'date','date',e.date)}>${formatDate(e.date)}</td>
    <td ${edCf(e.id,'type','text',e.type,'','cftype')}>${cfTypeTag(e.type)}</td>
    <td ${edCf(e.id,'amount','number',e.amount,'num ' + (e.type==='deposit'?'text-success':'text-danger'),'')}>
      ${e.type === 'deposit' ? '+' : '−'}${formatSAR(e.amount)}
    </td>
    <td ${edCf(e.id,'notes','text',e.notes||'','text-muted small')}>${esc(e.notes || '—')}</td>
    <td><button class="btn btn-danger btn-sm" onclick="archiveEntry('${esc(e.id)}')">أرشفة</button></td>
  </tr>`).join('');

  // فاصل + صفوف الأرباح الموزعة (للعرض فقط — مرتبطة بجدول الأرباح)
  const divHeader = hasDiv ? `<tr class="cf-divider">
    <td colspan="5" class="small bold">
      💰 الأرباح الموزعة — مرتبطة تلقائياً من صفحة الأرباح (للعرض فقط، وخارج صافي التدفق)
    </td>
  </tr>` : '';

  const divRows = divFiltered.map(e => `<tr class="cf-div-row">
    <td class="text-muted small">${formatDate(e.date)}</td>
    <td>${cfTypeTag('dividend')}</td>
    <td class="num text-success">+${formatSAR(e.amount)}</td>
    <td class="text-muted small">${esc(e.notes || '—')}</td>
    <td><a href="dividends.html" class="btn btn-secondary btn-sm">→ جدول الأرباح</a></td>
  </tr>`).join('');

  tbody.innerHTML = manualRows + divHeader + divRows;
  enableInlineEditing(tbody, onCfSaved);
}

async function onCfSaved(id, field, val) {
  const e = cfEntries.find(x => x.id === id);
  if (e) e[field] = val;
  applyFilter();
  renderSummary();
  renderTable();
}

function resetForm() {
  document.getElementById('cf-form').reset();
  document.getElementById('cf-date').value = todayISO();
}

async function addEntry(ev) {
  ev.preventDefault();
  const amount = +document.getElementById('cf-amount').value;
  if (amount <= 0) { showToast('المبلغ يجب أن يكون أكبر من صفر', 'error'); return; }

  const cfType = document.getElementById('cf-type').value;
  const cfTypeLabel = cfType === 'deposit' ? 'إيداع' : 'سحب';
  if (!await confirmAsync(`هل تريد تسجيل ${cfTypeLabel} بمبلغ ${formatSAR(amount)}؟`)) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = {
    user_id: user.id,
    date:    document.getElementById('cf-date').value,
    type:    cfType,
    amount,
    notes:   document.getElementById('cf-notes').value.trim()
  };
  const { error } = await supabaseClient.from('cashflow_entries').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم التسجيل', 'success');
  resetForm();
  await loadEntries();
  buildYearFilter();
  renderSummary();
  renderTable();
}

async function archiveEntry(id) {
  // AUDIT-FIX: replace blocking confirm() with async modal (mobile-safe, CSP-safe)
  if (!await confirmAsync('أرشفة هذا القيد؟ سيُخفى من الحسابات لكنه يبقى في قاعدة البيانات.')) return;
  const { error } = await supabaseClient.from('cashflow_entries').update({ is_archived: true }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تمت الأرشفة', 'success');
  await loadEntries();
  buildYearFilter();
  renderSummary();
  renderTable();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportCashflowsCSV() {
  // AUDIT-FIX: التصدير يحترم الفلتر دائماً — كان فراغ أحد الشقين يُصدّر الكل
  const manualData = cfFiltered;
  const divData    = divFiltered;
  const combined   = [...manualData, ...divData].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!combined.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  // AUDIT-FIX: عمود «الأثر على الصافي» مُضاف — «المبلغ» يبقى كما هو (قيمة مطلقة)
  // حتى لا تنكسر جداول المستخدم القديمة، لكن جمع العمود القديم كان يعطي
  // إيداعات+سحوبات بدل الصافي. الأرباح الموزعة أثرها صفر لأنها خارج الصافي.
  exportCSV(`تدفقات_نقدية_${todayISO()}.csv`,
    ['التاريخ', 'النوع', 'المبلغ', 'الأثر على الصافي', 'ملاحظات'],
    combined.map(e => [
      e.date,
      TYPE_AR[e.type] || e.type,
      e.amount,
      e.type === 'deposit' ? +e.amount : e.type === 'withdrawal' ? -(+e.amount) : 0,
      e.notes || ''
    ])
  );
  showToast(`✓ تم تصدير ${combined.length} حركة (${manualData.length} يدوي + ${divData.length} أرباح)`, 'success');
}

init();
