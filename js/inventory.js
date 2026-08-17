// ─── Storage ──────────────────────────────────────────────────────────────────
const INV_KEY = 'inventory_v1';

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'inventory': {
    title: '📦 مخزون المنزل',
    body: `
      <p>جرد لمحتويات منزلك ومستودعك بقيمتها التقديرية — مفيد للتأمين، وعند البيع/الانتقال، ولمعرفة قيمة ممتلكاتك ضمن أصولك.</p>
      <p class="info-note">💡 القيمة الإجمالية هنا يمكن إضافتها يدوياً كأصل في صفحة «صافي الثروة» لاكتمال صورة ثروتك. صوّر الفواتير المهمة واحتفظ بها.</p>`
  },
};
// ── تخزين سحابي متزامن عبر الأجهزة (user_settings) + cache محلي ──
function loadItemsLocal() {
  try {
    const raw = localStorage.getItem(userLsKey(INV_KEY)) || localStorage.getItem(INV_KEY);
    return JSON.parse(raw) || [];
  } catch { return []; }
}

async function loadItemsRemote() {
  const remote = await loadUserSetting(INV_KEY);
  if (Array.isArray(remote)) {
    items = remote;
    try { localStorage.setItem(userLsKey(INV_KEY), JSON.stringify(items)); } catch {}
    return;
  }
  // لا يوجد إعداد سحابي (أو فشلت الشبكة) → اعرض الكاش المحلي فقط.
  // AUDIT-FIX: لا نرفع الكاش المحلي للسحابة في مسار التحميل — فشل شبكة عابر
  // كان يدهس نسخة السحابة الأحدث بكاش قديم. الرفع يحدث فقط عند تعديل فعلي (saveItems).
  items = loadItemsLocal();
}

function saveItems(list) {
  try { localStorage.setItem(userLsKey(INV_KEY), JSON.stringify(list)); } catch {}
  saveUserSetting(INV_KEY, list).catch(() => {});   // مزامنة سحابية عبر الأجهزة
}

let items = [];
let editingId = null, deletingId = null;

// كمية العنصر: الصفر قيمة صالحة (نفاد المخزون) — الافتراض 1 فقط عند غياب القيمة
function qtyOf(i) {
  const q = parseInt(i.qty);
  return isNaN(q) ? 1 : q;
}

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

// ─── دلالة الحالة: أيقونة + حالة تصميمية (لا لون وحده) ────────────────────────
const COND_META = {
  'جيد':       { icon: '✅', state: 'good' },
  'مستعمل':    { icon: '🔧', state: ''     },
  'متضرر':     { icon: '⚠️', state: 'warn' },
  'للاستبدال': { icon: '🔁', state: 'warn' },
  'مفقود':     { icon: '❌', state: 'bad'  },
};
const COND_ORDER = ['جيد', 'مستعمل', 'متضرر', 'للاستبدال', 'مفقود'];
function condMeta(c) { return COND_META[c] || { icon: '❔', state: '' }; }
function condTag(c)  { const m = condMeta(c); return tagHtml(m.icon, esc(c || 'بدون حالة'), m.state); }

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;
  await loadItemsRemote();           // ← تحميل من السحابة قبل العرض (يزامن الجوال واللابتوب)
  buildFilters();
  renderDash();
  renderTable();
});

// ─── Filters ──────────────────────────────────────────────────────────────────
function buildFilters() {
  const cats = [...new Set(items.map(i => i.cat).filter(Boolean))];
  const locs = [...new Set(items.map(i => i.loc).filter(Boolean))];
  fillSelect('flt-cat', cats, document.getElementById('flt-cat').value);
  fillSelect('flt-loc', locs, document.getElementById('flt-loc').value);
}
function fillSelect(id, values, current) {
  const sel = document.getElementById(id);
  const first = sel.options[0].outerHTML;
  sel.innerHTML = first;
  values.forEach(v => {
    const op = document.createElement('option');
    op.value = op.textContent = v;
    if (v === current) op.selected = true;
    sel.appendChild(op);
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
// بطاقة واحدة يقودها رقم واحد: القيمة الإجمالية. الحالات الخمس كلها ظاهرة
// (كانت ثلاث فقط فلا تجتمع على المجموع)، والتفصيل خلف <details>.
function renderDash() {
  const total  = items.length;
  const units  = items.reduce((s, i) => s + qtyOf(i), 0);
  const valOf  = i => (+i.value || 0) * qtyOf(i);
  const totalVal = items.reduce((s, i) => s + valOf(i), 0);

  // تفصيل الحالات — العدّ والقيمة لكل حالة، وأي حالة خارج القائمة تُجمع في «أخرى»
  const byCond = {};
  COND_ORDER.forEach(c => (byCond[c] = { n: 0, val: 0, units: 0 }));
  let otherN = 0, otherVal = 0;
  items.forEach(i => {
    const b = byCond[i.cond];
    if (b) { b.n++; b.val += valOf(i); b.units += qtyOf(i); }
    else   { otherN++; otherVal += valOf(i); }
  });

  const good      = byCond['جيد'].n;
  const missingN  = byCond['مفقود'].n;
  const missingV  = byCond['مفقود'].val;
  const attention = byCond['متضرر'].n + byCond['للاستبدال'].n + missingN;
  const goodPct   = total > 0 ? good / total * 100 : 0;
  const outOfStock= items.filter(i => qtyOf(i) === 0).length;

  const el = document.getElementById('inv-dash');
  if (!el) return;

  if (!total) {
    el.innerHTML = cardHead('📦 ملخص المخزون', '', '') +
      `<div class="empty-state"><div class="big">📦</div>لا توجد عناصر — أضف أول عنصر!</div>`;
    return;
  }

  const tags = [
    tagHtml('📦', `${total} صنف`, ''),
    tagHtml('🔢', `${units} قطعة`, ''),
    attention ? tagHtml('⚠️', `${attention} تحتاج انتباهاً`, missingN ? 'bad' : 'warn') : '',
    outOfStock ? tagHtml('🕳️', `${outOfStock} نفد`, 'warn') : '',
  ].filter(Boolean).join(' ');

  const condRows = COND_ORDER.map((c, idx) => {
    const b = byCond[c];
    if (!b.n) return '';
    const m = condMeta(c);
    return browHtml({
      name: `${m.icon} ${esc(c)}`,
      color: stateColorOf(m.state),
      pct: total > 0 ? b.n / total * 100 : 0,
      valueTxt: `${b.n}`,
      diffTxt: formatSAR(b.val),
      title: `${esc(c)}: ${b.n} صنف · ${b.units} قطعة · ${formatSAR(b.val)}`,
    });
  }).join('') + (otherN ? browHtml({
    name: '❔ حالات أخرى',
    color: stateColorOf(''),
    pct: total > 0 ? otherN / total * 100 : 0,
    valueTxt: `${otherN}`,
    diffTxt: formatSAR(otherVal),
  }) : '');

  el.innerHTML =
    cardHead('📦 ملخص المخزون', `${total} صنف · ${units} قطعة`, '') +
    `<div class="stack">
      <div class="inv-hero">
        <div>
          <div class="hero-num">${formatSAR(totalVal)}</div>
          <div class="hero-cap">القيمة التقديرية الإجمالية = Σ (قيمة الوحدة × الكمية)</div>
        </div>
        <div class="inv-tagrow">${tags}</div>
      </div>
      ${meterHtml({
        label: 'أصناف بحالة جيدة',
        valueTxt: `${good} / ${total}`,
        pct: goodPct,
        state: goodPct >= 70 ? 'good' : goodPct >= 40 ? 'warn' : 'bad',
        foot: `${formatNum(goodPct, 1)}% من الأصناف — البقية مستعملة أو تحتاج إجراءً`,
      })}
      ${missingN ? noteHtml('❌',
        `<b>${missingN} صنف مفقود بقيمة ${formatSAR(missingV)}</b> — القيمة الإجمالية أعلاه تشملها.
         اطرحها إن أردت قيمة ما تملكه فعلياً: ${formatSAR(totalVal - missingV)}.`, 'bad') : ''}
      ${outOfStock ? noteHtml('🕳️',
        `<b>${outOfStock} صنف بكمية صفر</b> — مسجَّل ونفد مخزونه، وقيمته تُحتسب صفراً.`, 'warn') : ''}
      <details class="inv-details">
        <summary>🔎 تفصيل الحالات والفئات والمواقع</summary>
        <div class="dt-body stack-2">
          <div class="inv-sub">حسب الحالة — العدد على الشريط والقيمة بجانبه</div>
          ${condRows}
          <div class="inv-sub">حسب الفئة</div>
          ${groupRows('cat', totalVal)}
          <div class="inv-sub">حسب الموقع</div>
          ${groupRows('loc', totalVal)}
        </div>
      </details>
    </div>`;
}

// تجميع القيمة حسب حقل نصّي (فئة/موقع) — عرض مشتق، لا حساب جديد
function groupRows(field, totalVal) {
  const map = new Map();
  items.forEach(i => {
    const k = (i[field] || '').trim() || 'غير محدّد';
    const cur = map.get(k) || { n: 0, val: 0 };
    cur.n++; cur.val += (+i.value || 0) * qtyOf(i);
    map.set(k, cur);
  });
  const rows = [...map.entries()].sort((a, b) => b[1].val - a[1].val);
  if (!rows.length) return '';
  return rows.map(([k, v], idx) => browHtml({
    name: esc(k),
    color: cssVar('--series-' + ((idx % 6) + 1)),
    pct: totalVal > 0 ? v.val / totalVal * 100 : 0,
    valueTxt: formatSAR(v.val),
    diffTxt: `${v.n}`,
    title: `${esc(k)}: ${v.n} صنف · ${formatSAR(v.val)}`,
  })).join('');
}

// ─── Table ────────────────────────────────────────────────────────────────────
function getFiltered() {
  const cat  = document.getElementById('flt-cat').value;
  const loc  = document.getElementById('flt-loc').value;
  const cond = document.getElementById('flt-cond').value;
  const q    = (document.getElementById('flt-q').value || '').trim().toLowerCase();
  return items.filter(i => {
    if (cat  && i.cat  !== cat)  return false;
    if (loc  && i.loc  !== loc)  return false;
    if (cond && i.cond !== cond) return false;
    if (q && !(i.name||'').toLowerCase().includes(q) && !(i.notes||'').toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderTable() {
  const list = getFiltered();
  const tbody = document.getElementById('inv-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="big">📦</div>لا توجد عناصر — أضف أول عنصر!</div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(i => {
    const qty  = qtyOf(i);
    const id   = esc(i.id);
    const val  = i.value ? formatSAR((+i.value) * qty) : '—';
    const note = i.notes && i.notes.trim()
      ? `<button class="notes-badge" data-note="${esc(i.notes)}" onclick="showNotePopup(this)" title="ملاحظات">💬</button>` : '';
    // الكمية صفر حالة لا لون: رقم + وسم «نفد» بأيقونة ونص
    const qtyCell = qty === 0
      ? `<span class="qty-num">0</span> ${tagHtml('🕳️', 'نفد', 'warn')}`
      : `<span class="qty-num">${qty}</span>`;
    return `<tr>
      <td class="inv-name">${esc(i.name)}</td>
      <td><span class="loc-badge">${esc(i.cat||'—')}</span></td>
      <td><span class="loc-badge">${esc(i.loc||'—')}</span></td>
      <td>${condTag(i.cond)}</td>
      <td class="inv-center">${qtyCell}</td>
      <td class="num">${val}</td>
      <td class="inv-center">${note}</td>
      <td class="actions-cell">
        <button class="btn-icon" onclick="openEditModal('${id}')" title="تعديل">✏️</button>
        <button class="btn-icon danger" onclick="openDelModal('${id}')" title="حذف">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'إضافة عنصر';
  document.getElementById('i-name').value  = '';
  document.getElementById('i-cat').value   = 'أجهزة كهربائية';
  document.getElementById('i-loc').value   = 'صالة';
  document.getElementById('i-cond').value  = 'جيد';
  document.getElementById('i-qty').value   = '1';
  document.getElementById('i-value').value = '';
  document.getElementById('i-notes').value = '';
  document.getElementById('item-modal').classList.add('open');
  document.getElementById('i-name').focus();
}

function openEditModal(id) {
  const i = items.find(x => x.id === id);
  if (!i) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'تعديل العنصر';
  document.getElementById('i-name').value  = i.name  || '';
  document.getElementById('i-cat').value   = i.cat   || 'أجهزة كهربائية';
  document.getElementById('i-loc').value   = i.loc   || 'صالة';
  document.getElementById('i-cond').value  = i.cond  || 'جيد';
  document.getElementById('i-qty').value   = String(qtyOf(i));   // الصفر يبقى صفراً
  document.getElementById('i-value').value = i.value || '';
  document.getElementById('i-notes').value = i.notes || '';
  document.getElementById('item-modal').classList.add('open');
}

function closeModal() { document.getElementById('item-modal').classList.remove('open'); }

function saveItem() {
  const name = document.getElementById('i-name').value.trim();
  if (!name) { showToast('أدخل اسم العنصر', 'error'); return; }
  const obj = {
    name,
    cat:   document.getElementById('i-cat').value,
    loc:   document.getElementById('i-loc').value,
    cond:  document.getElementById('i-cond').value,
    // الصفر مسموح (نفاد المخزون) — الافتراض 1 فقط عند حقل فارغ/غير رقمي
    qty:   (() => { const q = parseInt(document.getElementById('i-qty').value); return isNaN(q) ? 1 : Math.max(0, q); })(),
    value: parseFloat(document.getElementById('i-value').value) || 0,
    notes: document.getElementById('i-notes').value.trim()
  };
  if (editingId) {
    const idx = items.findIndex(x => x.id === editingId);
    items[idx] = { ...items[idx], ...obj };
    showToast('تم التحديث ✓', 'success');
  } else {
    items.push({ id: uid(), ...obj });
    showToast('تمت الإضافة ✓', 'success');
  }
  saveItems(items);
  closeModal();
  buildFilters();
  renderDash();
  renderTable();
}

// ─── Delete ───────────────────────────────────────────────────────────────────
function openDelModal(id)  { deletingId = id; document.getElementById('del-modal').classList.add('open'); }
function closeDelModal()   { document.getElementById('del-modal').classList.remove('open'); deletingId = null; }
function confirmDelete() {
  if (!deletingId) return;
  items = items.filter(i => i.id !== deletingId);
  saveItems(items);
  closeDelModal();
  buildFilters();
  renderDash();
  renderTable();
  showToast('تم الحذف', 'success');
}

document.addEventListener('click', e => {
  if (e.target.id === 'item-modal') closeModal();
  if (e.target.id === 'del-modal')  closeDelModal();
});
