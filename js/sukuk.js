// ─── Storage — Supabase (primary) + localStorage (cache/fallback) ─────────────
const SUKUK_KEY = 'sukuk_planner_v1';

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'sukuk-summary': {
    title: '📜 الصكوك والتمويل الجماعي',
    body: `
      <p>الصك أداة استثمار إسلامية تُشبه السند: تموّل مشروعاً/جهة مقابل عائد دوري متفق عليه، وتسترد رأس مالك عند الاستحقاق. عائدها شبه ثابت ومخاطرتها أقل من الأسهم عادةً.</p>
      <div class="info-formula"><strong>العائد الكلي % = العائد السنوي % × (المدة بالأشهر ÷ 12)</strong></div>
      <div class="info-math">
        الإجمالي عند الاستحقاق = المبلغ × (1 + العائد الكلي%) — <em>يشمل رأس المال + الربح</em><br>
        صافي الربح = الإجمالي عند الاستحقاق − المبلغ المستثمر
      </div>
      <p class="info-note">⚠️ ملاحظتان مهمتان: (١) العائد هنا <strong>بسيط</strong> غير مركّب (مناسب لصك يوزّع أرباحه دورياً). (٢) «متوسط العائد الكلي %» إجمالي على كامل المدة وليس سنوياً — صكٌّ بعائد 10% كلي على سنتين ≈ 5% سنوياً فقط، فانتبه عند المقارنة.</p>`
  },
};

function getStore() {
  try {
    const scopedKey = userLsKey(SUKUK_KEY);
    let raw = localStorage.getItem(scopedKey);
    if (raw == null && scopedKey !== SUKUK_KEY) {
      // ترحيل لمرة واحدة من المفتاح القديم غير المعنون بالمستخدم
      raw = localStorage.getItem(SUKUK_KEY);
      if (raw != null) {
        try {
          JSON.parse(raw); // تأكد أنه صالح قبل الترحيل
          localStorage.setItem(scopedKey, raw);
          localStorage.removeItem(SUKUK_KEY);
        } catch {}
      }
    }
    return JSON.parse(raw) || defaultStore();
  } catch { return defaultStore(); }
}

function saveStore(data) {
  store = data;
  try { localStorage.setItem(userLsKey(SUKUK_KEY), JSON.stringify(data)); } catch {}
  saveUserSetting(SUKUK_KEY, data).catch(() => {});
}

function defaultStore() {
  return {
    opportunities: [],
    oppStatuses:  ['مشترك', 'مغلق', 'متعثر', 'مخطط له'],
    distStatuses: ['لم يسدد', 'تم السداد']
  };
}

function uid() { return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

// ─── State ────────────────────────────────────────────────────────────────────
let store     = getStore();
let editOppId = null;   // null = add mode
let editDistOppId = null;
let editDistId    = null;
let pendingDeleteOppId  = null;
let pendingDeleteDistId = null;
let pendingDeleteDistOppId = null;

// ══════════════════════════════════════════════════════════════════════
// جسر رموز التصميم + مولّدات المكوّنات
// ──────────────────────────────────────────────────────────────────────
// ربط: نسخة طبق الأصل من مولّدات js/dashboard.js (أعلى الملف) — صفحة الصكوك
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

// ─── دلالة الحالة: أيقونة + حالة تصميمية (لا لون وحده) ────────────────────────
const OPP_STATE = {
  'مشترك':   { icon: '✅', state: 'good' },
  'مغلق':    { icon: '🏁', state: ''     },
  'متعثر':   { icon: '⚠️', state: 'bad'  },
  'مخطط له': { icon: '📋', state: ''     },
};
const DIST_STATE = {
  'تم السداد': { icon: '✅', state: 'good' },
  'لم يسدد':   { icon: '⏳', state: 'warn' },
};
function oppMeta(s)  { return OPP_STATE[s]  || { icon: '❔', state: '' }; }
function distMeta(s) { return DIST_STATE[s] || { icon: '❔', state: '' }; }
function oppTag(s)   { const m = oppMeta(s);  return tagHtml(m.icon, esc(s || 'بدون حالة'), m.state); }
function distTag(s)  { const m = distMeta(s); return tagHtml(m.icon, esc(s || 'بدون حالة'), m.state); }

// شهر عربي آمن — بيانات مستوردة قد تحمل شهراً خارج 1..12
function monthName(m) {
  const i = (parseInt(m, 10) || 0) - 1;
  return MONTHS_AR[i] || '—';
}

// ─── Calculations ─────────────────────────────────────────────────────────────
function calcOpp(o) {
  const totalReturnPct = (o.annualReturn || 0) * ((o.duration || 0) / 12);
  const totalReturnSAR = (o.amount || 0) * (1 + totalReturnPct / 100);
  const netProfit      = totalReturnSAR - (o.amount || 0);
  return { totalReturnPct, totalReturnSAR, netProfit };
}

// مجاميع توزيعات فرصة واحدة — المحصّل والمعلّق وأي حالة مخصّصة (غير مصنّفة)
function distTotals(o) {
  let paid = 0, unpaid = 0, other = 0, n = 0;
  (o.distributions || []).forEach(d => {
    const v = +d.amount || 0;
    n++;
    if (d.status === 'تم السداد')   paid   += v;
    else if (d.status === 'لم يسدد') unpaid += v;
    else                             other  += v;
  });
  return { paid, unpaid, other, count: n, recorded: paid + unpaid + other };
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-sukuk');
  const remote = await loadUserSetting(SUKUK_KEY);
  if (remote) {
    store = remote;
    try { localStorage.setItem(userLsKey(SUKUK_KEY), JSON.stringify(remote)); } catch {}
  } else {
    store = getStore();
  }
  renderDashboard();
  renderOpportunities();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
// بطاقة واحدة يقودها رقم واحد: رأس المال المشترك. البقية مقاييس مساندة
// ثم تفاصيل مطويّة — «لا تحذف معلومة، أعِد ترتيبها».
function renderDashboard() {
  const opps = store.opportunities;

  // AUDIT-FIX: المجاميع على «مشترك» فقط — «مخطط له» ليس مالاً مستثمراً
  // و«متعثر» لا يُحتسب عائده المتوقع. «مغلق» انتهى واسترُدّ فلا يدخل
  // في المستثمر الحالي (توزيعاته المحصّلة تبقى في «محصّل» أدناه).
  const active = opps.filter(o => o.status === 'مشترك');

  const subscribedCount = active.length;
  const totalInvested   = active.reduce((s, o) => s + (+o.amount || 0), 0);
  const totalSukuk      = active.reduce((s, o) => s + (+o.sukukCount || 0), 0);

  let totalReturnSAR = 0, totalNetProfit = 0;
  active.forEach(o => {
    const c = calcOpp(o);
    totalReturnSAR += c.totalReturnSAR;
    totalNetProfit += c.netProfit;
  });

  const avgReturnPct = totalInvested > 0
    ? (totalNetProfit / totalInvested * 100)
    : 0;

  // مقياس مُضاف (لا يغيّر أي رقم قائم): متوسط العائد السنوي مرجّحاً بالمبلغ.
  // «متوسط العائد الكلي» أعلاه يخلط مُدداً مختلفة فلا يُقارَن بين الفرص؛
  // هذا الرقم قابل للمقارنة لأنه على أساس سنوي موحّد.
  const weightedAnnualPct = totalInvested > 0
    ? active.reduce((s, o) => s + (+o.amount || 0) * (+o.annualReturn || 0), 0) / totalInvested
    : 0;
  const weightedMonths = totalInvested > 0
    ? active.reduce((s, o) => s + (+o.amount || 0) * (+o.duration || 0), 0) / totalInvested
    : 0;

  // paid distributions — نقد فعلي/مستحق: تبقى على كل الفرص بغض النظر عن الحالة
  let totalPaid = 0, totalUnpaid = 0, totalOther = 0;
  opps.forEach(o => {
    const t = distTotals(o);
    totalPaid += t.paid; totalUnpaid += t.unpaid; totalOther += t.other;
  });
  // تفصيل المعلّق حسب حالة الفرصة — معلّق على «متعثر» ذمّة مشكوك فيها
  const unpaidDistressed = opps.filter(o => o.status === 'متعثر')
    .reduce((s, o) => s + distTotals(o).unpaid, 0);

  const planned   = opps.filter(o => o.status === 'مخطط له');
  const distressed= opps.filter(o => o.status === 'متعثر');
  const closed    = opps.filter(o => o.status === 'مغلق');
  const sum = list => list.reduce((s, o) => s + (+o.amount || 0), 0);
  const plannedTotal = sum(planned), distressedTotal = sum(distressed), closedTotal = sum(closed);

  // فرص بحالة خارج القائمة المعرّفة (أضافها المالك من إدارة الحالات)
  const known  = new Set(['مشترك', 'مغلق', 'متعثر', 'مخطط له']);
  const custom = opps.filter(o => !known.has(o.status));

  const collectPct = (totalPaid + totalUnpaid) > 0
    ? totalPaid / (totalPaid + totalUnpaid) * 100 : 0;

  const el = document.getElementById('sk-summary');
  if (!el) return;

  if (!opps.length) {
    el.innerHTML = cardHead('📜 ملخص الصكوك والتمويل الجماعي', '', infoBtn()) +
      `<div class="empty-state">لا توجد فرص بعد — أضف فرصتك الأولى لتظهر المجاميع</div>`;
    return;
  }

  const statusTags = [
    subscribedCount ? tagHtml('✅', `مشترك: ${subscribedCount}`, 'good') : '',
    distressed.length ? tagHtml('⚠️', `متعثر: ${distressed.length}`, 'bad') : '',
    planned.length ? tagHtml('📋', `مخطط له: ${planned.length}`, '') : '',
    closed.length ? tagHtml('🏁', `مغلق: ${closed.length}`, '') : '',
    custom.length ? tagHtml('❔', `حالات أخرى: ${custom.length}`, '') : '',
  ].filter(Boolean).join(' ');

  const notes = [
    distressed.length ? noteHtml('⚠️',
      `<b>متعثر:</b> ${distressed.length} فرصة برأس مال ${formatSAR(distressedTotal)} — مستثناة من المجاميع والعائد المتوقع، ورأس مالها في خطر.`, 'bad') : '',
    planned.length ? noteHtml('📋',
      `<b>مخطط له:</b> ${planned.length} فرصة بمبلغ مرصود ${formatSAR(plannedTotal)} — لم يُستثمر بعد ولا يدخل في أي مجموع أعلاه.`, '') : '',
    totalOther > 0 ? noteHtml('❔',
      `<b>توزيعات غير مصنّفة:</b> ${formatSAR(totalOther)} بحالة خارج «تم السداد / لم يسدد» — لا تدخل في المحصّل ولا في المعلّق.`, 'warn') : '',
    noteHtml('ℹ️',
      `<b>المدة الجزئية غير متوفرة:</b> لا يوجد حقل «تاريخ بدء» في بيانات الفرصة، فكل أرقام العائد أعلاه <em>كاملة عند الاستحقاق</em> لا مستحقة حتى اليوم. المحصّل فعلياً هو ${formatSAR(totalPaid)} من التوزيعات المسجّلة.`, ''),
  ].filter(Boolean).join('');

  el.innerHTML =
    cardHead('📜 ملخص الصكوك والتمويل الجماعي',
      `${subscribedCount} فرصة مشتركة · ${totalSukuk} صك`, infoBtn()) +
    `<div class="stack">
      <div class="sk-hero">
        <div>
          <div class="hero-num">${formatSAR(totalInvested)}</div>
          <div class="hero-cap">رأس المال المشترك حالياً — الحالة «مشترك» فقط</div>
        </div>
        <div class="sk-tagrow">${statusTags}</div>
      </div>
      ${meterHtml({
        label: 'تحصيل التوزيعات المسجّلة',
        valueTxt: formatNum(collectPct, 1) + '%',
        pct: collectPct,
        foot: `محصّل ${formatSAR(totalPaid)} · معلّق ${formatSAR(totalUnpaid)}` +
              (unpaidDistressed > 0 ? ` — منها ${formatSAR(unpaidDistressed)} على فرص متعثرة` : ''),
      })}
      ${kvsHtml([
        ['صافي الربح المتوقع', formatSAR(totalNetProfit)],
        ['الإجمالي عند الاستحقاق', formatSAR(totalReturnSAR)],
        ['متوسط العائد السنوي (مرجّح)', formatNum(weightedAnnualPct, 2) + '%'],
        ['متوسط العائد على كامل المدة', formatNum(avgReturnPct, 2) + '%'],
        ['متوسط المدة (مرجّح)', formatNum(weightedMonths, 1) + ' شهر'],
        ['محصّل من التوزيعات', formatSAR(totalPaid)],
        ['معلّق من التوزيعات', formatSAR(totalUnpaid)],
        totalOther > 0 ? ['توزيعات غير مصنّفة', formatSAR(totalOther)] : null,
      ])}
      ${notes}
      <details class="sk-details">
        <summary>🔎 تفصيل الحالات ومعنى كل رقم</summary>
        <div class="dt-body stack-2">
          ${kvsHtml([
            ['مشترك — رأس المال', formatSAR(totalInvested)],
            ['متعثر — رأس المال', formatSAR(distressedTotal)],
            ['مخطط له — مرصود', formatSAR(plannedTotal)],
            ['مغلق — رأس مال مسترد', formatSAR(closedTotal)],
          ])}
          <p class="small text-muted">
            العائد هنا <b>بسيط غير مركّب</b>: العائد الكلي% = العائد السنوي% × (المدة ÷ 12)،
            والإجمالي عند الاستحقاق = المبلغ × (1 + العائد الكلي%) فهو <b>رأس المال + الربح</b> لا الربح وحده.
            «متوسط العائد على كامل المدة» يجمع مُدداً مختلفة فلا يصلح للمقارنة بين الفرص —
            استخدم «متوسط العائد السنوي (مرجّح)» لذلك.
            المحصّل والمعلّق يشملان كل الفرص مهما كانت حالتها لأنهما نقد فعلي/مستحق.
          </p>
        </div>
      </details>
    </div>`;
}

function infoBtn() {
  return `<button class="info-btn info-inline" type="button" onclick="showCardInfo('sukuk-summary')"
    title="ما هي الصكوك وكيف تُحسب؟">ⓘ</button>`;
}

// ─── Opportunities ────────────────────────────────────────────────────────────
function renderOpportunities() {
  const container = document.getElementById('opps-container');
  if (!store.opportunities.length) {
    container.innerHTML = `<div class="empty-state">لا توجد فرص — أضف فرصتك الأولى</div>`;
    return;
  }

  container.innerHTML = store.opportunities.map(o => renderOppCard(o)).join('');
}

function renderOppCard(o) {
  const { totalReturnPct, totalReturnSAR, netProfit } = calcOpp(o);
  const t  = distTotals(o);
  const id = esc(o.id);

  const distRows = (o.distributions || [])
    .slice()
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
    .map(d => `
      <tr>
        <td>${monthName(d.month)} ${esc(d.year)}</td>
        <td class="num">${formatSAR(+d.amount || 0)}</td>
        <td>${distTag(d.status)}</td>
        <td class="dist-actions">
          <button class="btn-icon-sm" onclick="openEditDist('${id}','${esc(d.id)}')" title="تعديل">✏️</button>
          <button class="btn-icon-sm danger" onclick="confirmDeleteDist('${id}','${esc(d.id)}')" title="حذف">🗑️</button>
        </td>
      </tr>`).join('');

  // نسبة ما تحصّل من التوزيعات المسجّلة على هذه الفرصة (لا علاقة لها بالعائد المتوقع)
  const denom      = t.paid + t.unpaid;
  const collectPct = denom > 0 ? t.paid / denom * 100 : 0;

  const isDistressed = o.status === 'متعثر';
  const isPlanned    = o.status === 'مخطط له';
  const amountCap    = isPlanned ? 'مبلغ مرصود — لم يُستثمر بعد'
                     : isDistressed ? 'رأس مال في خطر — فرصة متعثرة'
                     : 'رأس المال المستثمر';

  const acts =
    oppTag(o.status) +
    `<button class="btn-icon-sm" onclick="openAddDist('${id}')" title="إضافة توزيعة">＋</button>` +
    `<button class="btn-icon-sm" onclick="openEditOpp('${id}')" title="تعديل">✏️</button>` +
    `<button class="btn-icon-sm danger" onclick="confirmDeleteOpp('${id}')" title="حذف">🗑️</button>`;

  const body = t.count
    ? meterHtml({
        label: 'تحصيل التوزيعات المسجّلة',
        valueTxt: formatNum(collectPct, 1) + '%',
        pct: collectPct,
        foot: `محصّل ${formatSAR(t.paid)} · معلّق ${formatSAR(t.unpaid)}` +
              (t.other > 0 ? ` · غير مصنّف ${formatSAR(t.other)}` : ''),
      })
    : noteHtml('📭', 'لا توجد توزيعات مسجّلة بعد على هذه الفرصة.', '');

  return `
    <div class="opp-card card" id="card-${id}">
      ${cardHead(esc(o.name || 'بدون اسم'), esc(o.platform || ''), acts)}
      <div class="stack">
        <div>
          <div class="hero-num">${formatSAR(+o.amount || 0)}</div>
          <div class="hero-cap">${amountCap} · ${+o.sukukCount || 0} صك · ${+o.duration || 0} شهر</div>
        </div>
        ${body}
        ${kvsHtml([
          ['صافي الربح المتوقع', formatSAR(netProfit)],
          ['العائد السنوي', formatNum(+o.annualReturn || 0, 2) + '%'],
          ['العائد على كامل المدة', formatNum(totalReturnPct, 2) + '%'],
          ['الإجمالي عند الاستحقاق', formatSAR(totalReturnSAR)],
        ])}
        ${isDistressed ? noteHtml('⚠️',
          'فرصة متعثرة — لا تدخل في مجاميع اللوحة، وتوزيعاتها المعلّقة ذمّة مشكوك في تحصيلها.', 'bad') : ''}
        ${isPlanned ? noteHtml('📋',
          'فرصة مخطط لها — المبلغ مرصود ولم يُستثمر، فهي خارج كل مجاميع اللوحة.', '') : ''}
        <details class="sk-details"${t.count ? '' : ' open'}>
          <summary>💵 التوزيعات (${t.count}) — محصّل ${formatSAR(t.paid)} · معلّق ${formatSAR(t.unpaid)}</summary>
          <div class="dt-body">
            ${t.count ? `
            <table class="dist-table">
              <thead><tr><th>الشهر</th><th>المبلغ</th><th>الحالة</th><th></th></tr></thead>
              <tbody>${distRows}</tbody>
            </table>` : `<div class="dist-empty">لا توجد توزيعات بعد</div>`}
            <button class="btn-sm mt-2" onclick="openAddDist('${id}')">+ إضافة توزيعة</button>
          </div>
        </details>
      </div>
    </div>`;
}

// ─── Add / Edit Opportunity Modal ─────────────────────────────────────────────
function openAddOpp() {
  editOppId = null;
  document.getElementById('opp-modal-title').textContent = 'إضافة فرصة جديدة';
  document.getElementById('opp-name').value       = '';
  document.getElementById('opp-platform').value   = '';
  document.getElementById('opp-sukuk').value      = '';
  document.getElementById('opp-duration').value   = '';
  document.getElementById('opp-amount').value     = '';
  document.getElementById('opp-annual').value     = '';
  buildOppStatusSelect(null);
  updateOppCalc();
  document.getElementById('opp-modal').classList.add('open');
  document.getElementById('opp-name').focus();
}

function openEditOpp(id) {
  const o = store.opportunities.find(x => x.id === id);
  if (!o) return;
  editOppId = id;
  document.getElementById('opp-modal-title').textContent = 'تعديل الفرصة';
  document.getElementById('opp-name').value       = o.name || '';
  document.getElementById('opp-platform').value   = o.platform || '';
  document.getElementById('opp-sukuk').value      = o.sukukCount || '';
  document.getElementById('opp-duration').value   = o.duration || '';
  document.getElementById('opp-amount').value     = o.amount || '';
  document.getElementById('opp-annual').value     = o.annualReturn || '';
  buildOppStatusSelect(o.status);
  updateOppCalc();
  document.getElementById('opp-modal').classList.add('open');
}

function buildOppStatusSelect(selected) {
  const sel = document.getElementById('opp-status');
  sel.innerHTML = store.oppStatuses.map(s =>
    `<option value="${esc(s)}" ${s === selected ? 'selected' : ''}>${esc(s)}</option>`
  ).join('');
}

function updateOppCalc() {
  const amount   = parseFloat(document.getElementById('opp-amount').value)   || 0;
  const annual   = parseFloat(document.getElementById('opp-annual').value)   || 0;
  const duration = parseFloat(document.getElementById('opp-duration').value) || 0;
  const totalPct = annual * (duration / 12);
  const totalSAR = amount * (1 + totalPct / 100);
  const net      = totalSAR - amount;
  document.getElementById('calc-total-pct').textContent = formatNum(totalPct, 2) + '%';
  document.getElementById('calc-total-sar').textContent = formatSAR(totalSAR);
  document.getElementById('calc-net').textContent       = formatSAR(net);
}

function closeOppModal() {
  document.getElementById('opp-modal').classList.remove('open');
  editOppId = null;
}

async function saveOpp() {
  const name     = document.getElementById('opp-name').value.trim();
  const platform = document.getElementById('opp-platform').value.trim();
  const sukuk    = parseInt(document.getElementById('opp-sukuk').value);
  const duration = parseInt(document.getElementById('opp-duration').value);
  const amount   = parseFloat(document.getElementById('opp-amount').value);
  const annual   = parseFloat(document.getElementById('opp-annual').value);
  const status   = document.getElementById('opp-status').value;

  if (!name || isNaN(sukuk) || isNaN(duration) || isNaN(amount) || isNaN(annual)) {
    showToast('يرجى تعبئة جميع الحقول المطلوبة', 'error');
    return;
  }
  // AUDIT-FIX: منع القيم السالبة/الصفرية غير المنطقية
  if (amount <= 0 || duration <= 0 || annual < 0) {
    showToast('المبلغ والمدة يجب أن يكونا أكبر من صفر، والعائد لا يكون سالباً', 'error');
    return;
  }

  if (editOppId) {
    const o = store.opportunities.find(x => x.id === editOppId);
    const prevStatus = o.status;

    // ── Safety check: closing with unmatched distributions ──
    if (status === 'مغلق' && prevStatus !== 'مغلق') {
      const totalReturnPct = annual * (duration / 12);
      const expectedSAR    = amount * (1 + totalReturnPct / 100);
      const paidSAR        = (o.distributions || [])
        .filter(d => d.status === 'تم السداد')
        .reduce((s, d) => s + (+d.amount || 0), 0);
      const diff = expectedSAR - paidSAR;
      const tol  = 0.01;

      if (Math.abs(diff) > tol) {
        const shortOrOver = diff > 0 ? 'ناقص' : 'زيادة';
        const msg =
          `⚠️ تحذير — عدم تطابق التوزيعات\n\n` +
          `العائد الكلي المتوقع:  ${formatSAR(expectedSAR)}\n` +
          `المحصّل فعلياً:        ${formatSAR(paidSAR)}\n` +
          `الفرق (${shortOrOver}): ${formatSAR(Math.abs(diff))}\n\n` +
          `هل تريد الإغلاق رغم وجود فرق في التوزيعات؟`;
        if (!await confirmAsync(msg)) return;
      }
    }

    Object.assign(o, { name, platform, sukukCount: sukuk, duration, amount, annualReturn: annual, status });
    showToast('تم تحديث الفرصة', 'success');
  } else {
    store.opportunities.unshift({ id: uid(), name, platform, sukukCount: sukuk, duration, amount, annualReturn: annual, status, distributions: [] });
    showToast('تم إضافة الفرصة', 'success');
  }

  saveStore(store);
  closeOppModal();
  renderDashboard();
  renderOpportunities();
}

// ─── Delete Opportunity ───────────────────────────────────────────────────────
function confirmDeleteOpp(id) {
  const o = store.opportunities.find(x => x.id === id);
  if (!o) return;
  pendingDeleteOppId = id;
  document.getElementById('del-opp-name').textContent = o.name || 'هذه الفرصة';
  document.getElementById('del-opp-modal').classList.add('open');
}

function closeDelOppModal() {
  document.getElementById('del-opp-modal').classList.remove('open');
  pendingDeleteOppId = null;
}

function executeDeleteOpp() {
  if (!pendingDeleteOppId) return;
  store.opportunities = store.opportunities.filter(o => o.id !== pendingDeleteOppId);
  saveStore(store);
  closeDelOppModal();
  renderDashboard();
  renderOpportunities();
  showToast('تم حذف الفرصة', 'success');
}

// ─── Add / Edit Distribution ──────────────────────────────────────────────────
function openAddDist(oppId) {
  editDistOppId = oppId;
  editDistId    = null;
  document.getElementById('dist-modal-title').textContent = 'إضافة توزيعة';
  document.getElementById('dist-month').value  = new Date().getMonth() + 1;
  document.getElementById('dist-year').value   = new Date().getFullYear();
  document.getElementById('dist-amount').value = '';
  buildDistStatusSelect(null);
  document.getElementById('dist-modal').classList.add('open');
  document.getElementById('dist-amount').focus();
}

function openEditDist(oppId, distId) {
  const o = store.opportunities.find(x => x.id === oppId);
  const d = o && (o.distributions || []).find(x => x.id === distId);
  if (!d) return;
  editDistOppId = oppId;
  editDistId    = distId;
  document.getElementById('dist-modal-title').textContent = 'تعديل التوزيعة';
  document.getElementById('dist-month').value  = d.month;
  document.getElementById('dist-year').value   = d.year;
  document.getElementById('dist-amount').value = d.amount;
  buildDistStatusSelect(d.status);
  document.getElementById('dist-modal').classList.add('open');
}

function buildDistStatusSelect(selected) {
  const sel = document.getElementById('dist-status');
  sel.innerHTML = store.distStatuses.map(s =>
    `<option value="${esc(s)}" ${s === selected ? 'selected' : ''}>${esc(s)}</option>`
  ).join('');
}

function closeDistModal() {
  document.getElementById('dist-modal').classList.remove('open');
  editDistOppId = null;
  editDistId    = null;
}

function saveDist() {
  const month  = parseInt(document.getElementById('dist-month').value);
  const year   = parseInt(document.getElementById('dist-year').value);
  const amount = parseFloat(document.getElementById('dist-amount').value);
  const status = document.getElementById('dist-status').value;

  if (!month || !year || isNaN(amount)) {
    showToast('يرجى تعبئة جميع الحقول', 'error');
    return;
  }

  const o = store.opportunities.find(x => x.id === editDistOppId);
  if (!o) return;
  if (!o.distributions) o.distributions = [];

  if (editDistId) {
    const d = o.distributions.find(x => x.id === editDistId);
    if (!d) { showToast('التوزيعة لم تعد موجودة', 'error'); return; }
    Object.assign(d, { month, year, amount, status });
    showToast('تم تحديث التوزيعة', 'success');
  } else {
    o.distributions.push({ id: uid(), month, year, amount, status });
    showToast('تم إضافة التوزيعة', 'success');
  }

  saveStore(store);
  closeDistModal();
  renderDashboard();
  renderOpportunities();
}

// ─── Delete Distribution ──────────────────────────────────────────────────────
function confirmDeleteDist(oppId, distId) {
  pendingDeleteDistOppId = oppId;
  pendingDeleteDistId    = distId;
  const o = store.opportunities.find(x => x.id === oppId);
  const d = o && (o.distributions || []).find(x => x.id === distId);
  if (!d) return;
  const month = monthName(d.month);
  document.getElementById('del-dist-name').textContent = `توزيعة ${month} ${d.year}`;
  document.getElementById('del-dist-modal').classList.add('open');
}

function closeDelDistModal() {
  document.getElementById('del-dist-modal').classList.remove('open');
  pendingDeleteDistOppId = null;
  pendingDeleteDistId    = null;
}

function executeDeleteDist() {
  const o = store.opportunities.find(x => x.id === pendingDeleteDistOppId);
  if (o) o.distributions = (o.distributions || []).filter(d => d.id !== pendingDeleteDistId);
  saveStore(store);
  closeDelDistModal();
  renderDashboard();
  renderOpportunities();
  showToast('تم حذف التوزيعة', 'success');
}

// ─── Status Management Modal ──────────────────────────────────────────────────
function openStatusMgr() {
  renderStatusMgr();
  document.getElementById('status-mgr-modal').classList.add('open');
}

function closeStatusMgr() {
  document.getElementById('status-mgr-modal').classList.remove('open');
}

function renderStatusMgr() {
  renderStatusList('opp-statuses-list', store.oppStatuses, 'opp');
  renderStatusList('dist-statuses-list', store.distStatuses, 'dist');
}

function renderStatusList(containerId, statuses, type) {
  const el = document.getElementById(containerId);
  el.innerHTML = statuses.map((s, i) => `
    <div class="status-item">
      <span>${esc(s)}</span>
      <button class="btn-icon-sm danger" onclick="deleteStatus('${type}', ${i})" title="حذف">×</button>
    </div>`).join('');
}

function deleteStatus(type, idx) {
  if (type === 'opp') {
    if (store.oppStatuses.length <= 1) { showToast('يجب أن تبقى حالة واحدة على الأقل', 'error'); return; }
    store.oppStatuses.splice(idx, 1);
  } else {
    if (store.distStatuses.length <= 1) { showToast('يجب أن تبقى حالة واحدة على الأقل', 'error'); return; }
    store.distStatuses.splice(idx, 1);
  }
  saveStore(store);
  renderStatusMgr();
}

function addStatus(type) {
  const inputId = type === 'opp' ? 'new-opp-status' : 'new-dist-status';
  const name    = document.getElementById(inputId).value.trim();
  if (!name) return;
  const list = type === 'opp' ? store.oppStatuses : store.distStatuses;
  if (list.includes(name)) { showToast('الحالة موجودة مسبقاً', 'error'); return; }
  list.push(name);
  document.getElementById(inputId).value = '';
  saveStore(store);
  renderStatusMgr();
  showToast('تمت إضافة الحالة', 'success');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// esc() المشتركة من utils.js (محمَّلة قبل هذا الملف) — أُزيلت النسخة المحلية الناقصة

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeOppModal(); closeDistModal();
    closeDelOppModal(); closeDelDistModal(); closeStatusMgr();
  }
});
