const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
];

const CHART_COLORS = [
  '#f0b429','#3b82f6','#22c55e','#a855f7',
  '#ef4444','#06b6d4','#f97316','#ec4899',
  '#84cc16','#8b5cf6','#14b8a6','#f43f5e'
];

// Inline select option sets
const INLINE_OPTS = {
  txtype:  [{v:'buy',l:'شراء'},{v:'sell',l:'بيع'}],
  month:   MONTHS_AR.map((m,i) => ({v:String(i+1),l:m})),
  status:  [{v:'owned',l:'مملوك'},{v:'rented',l:'مؤجر'},{v:'sold',l:'مباع'}]
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

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// HTML-attribute-safe escape
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── UI helpers ────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._tm);
  t._tm = setTimeout(() => { t.className = 'toast'; }, 3000);
}

function setActiveNav(linkId) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const el = document.getElementById(linkId);
  if (el) el.classList.add('active');
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

// ── Inline Editing ────────────────────────────────────────────
/**
 * Attach a single delegated click-listener to a tbody.
 * Every <td class="editable"> must carry:
 *   data-table, data-id, data-field, data-type ("text"|"number"|"date"),
 *   data-raw  (raw value used as input .value),
 *   data-select (optional key in INLINE_OPTS for select elements)
 *
 * postSaveFn(id, field, newVal) is called after a successful DB update.
 * It is responsible for re-rendering the relevant UI (and may re-call
 * enableInlineEditing which is safely idempotent).
 */
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
