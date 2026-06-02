'use strict';

// ── Broker name → ticker code (as user enters in the app / DivTracker) ──
const BROKER_NAME_MAP = {
  'NAHDI':                    '4164',
  'A.OTHAIM MARKET':          '4001',
  'SIPCHEM':                  '2310',
  'ALINMA BANK':              '1150',
  'SAUDI ELECTRICITY':        '5110',
  'SAUDI ENERGY':             '5110',
  'SABIC AGRI-NUTRIENTS':     '2020',
  'SADAF':                    '2270',
  'LUBEREF':                  '2223',
  'EXTRA':                    '4003',
  'AL MAATHER REIT':          '4334',
  'ALINMA HOSPITALITY REIT':  '4349',
  'ALKHABEER REIT':           '4348',
  'STC':                      '7010',
  'QASSIM CEMENT':            '3040',
  'SAUDI CEMENT':             '3030',
  'SAUDI ARAMCO':             '2222',
  'UNITS TALEEM REIT':        '4333',
  'SEDCO CAPITAL REIT':       '4344',
  'MOUWASAT':                 '4002',
  'CENOMI CENTERS':           '4321',
  'JARIR':                    '4190',
  'DERAYAH REIT':             '4339',
  'AL RAJHI REIT':            '4340',
  'YANBU CEMENT':             '3060',
  'YAMAMAH CEMENT':           '3020',
  'SABIC':                    '2010',
  'JADWA REIT SAUDI':         '4342',
  'MODERN MILLS':             '2284',
  'RIYAD BANK':               '1010',
  'FAKEEH CARE':              'FAKEEH',   // مجهول — سيظهر كتحذير
  'FITNESS TIME':             'FITNESS',  // مجهول — سيظهر كتحذير
};

let _dbTx      = [];
let _dtEntries = [];   // DivTracker entries
let _bkEntries = [];   // Broker statement entries
let _allRef    = [];   // merged reference (DivTracker preferred, broker supplemental)
let _matches   = [];

async function init() {
  const user = await requireAuth();
  if (!user) return;
}

// ── CSV line parser (handles quoted fields with commas) ───────────────
function parseCSVLine(line) {
  const cols = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // RFC 4180: "" داخل حقل مقتبس = علامة تنصيص حرفية
      if (inQuote && i + 1 < line.length && line[i + 1] === '"') {
        cur += '"'; i++; continue;
      }
      inQuote = !inQuote; continue;
    }
    if (c === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cols.push(cur.trim());
  return cols;
}

// ── Parse DivTracker CSV ──────────────────────────────────────────────
function parseDivTracker(csv) {
  const lines = csv.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const hIdx = lines.findIndex(l =>
    l.toLowerCase().includes('ticker') && l.toLowerCase().includes('quantity')
  );
  if (hIdx === -1) return null;

  const entries = [];
  for (let i = hIdx + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 5) continue;
    const ticker = (cols[0] || '').replace(/\.SA$/i, '').toUpperCase().trim();
    const qty    = parseFloat(cols[1]);
    const price  = parseFloat(cols[2]);
    const date   = (cols[4] || '').trim().substring(0, 10);
    if (!ticker || isNaN(qty) || isNaN(price) || !date.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
    entries.push({
      source: 'DivTracker',
      ticker,
      shares: Math.abs(qty),
      price,
      type:   qty < 0 ? 'sell' : 'buy',
      date,
      used: false
    });
  }
  return entries;
}

// ── Parse Broker Statement CSV ────────────────────────────────────────
function parseBrokerStatement(csv) {
  const lines = csv.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const entries = [];
  const unknownNames = new Set();

  for (const line of lines) {
    // Skip metadata/header rows
    if (!line.match(/(Buy|Sell) of \d/i)) continue;

    const cols = parseCSVLine(line);

    // Find description column containing "Buy/Sell of N NAME at PRICE"
    let desc = '', date = '';
    for (let i = 0; i < cols.length; i++) {
      const m = cols[i].match(/^(Buy|Sell) of ([\d.]+) (.+?) at ([\d.]+)$/i);
      if (m) {
        desc = cols[i];
        // Date is next column that looks like YYYY-MM-DD
        for (let j = i + 1; j < cols.length; j++) {
          if (cols[j].match(/^\d{4}-\d{2}-\d{2}/)) { date = cols[j].substring(0, 10); break; }
        }
        break;
      }
    }
    if (!desc || !date) continue;

    const m = desc.match(/^(Buy|Sell) of ([\d.]+) (.+?) at ([\d.]+)$/i);
    if (!m) continue;

    const type   = m[1].toLowerCase();
    const shares = parseFloat(m[2]);
    const name   = m[3].trim().toUpperCase();
    const price  = parseFloat(m[4]);

    const ticker = BROKER_NAME_MAP[name];
    if (!ticker) {
      unknownNames.add(name);
      entries.push({ source: 'Broker', ticker: null, name, shares, price, type, date, used: false, unknown: true });
      continue;
    }
    entries.push({ source: 'Broker', ticker, shares, price, type, date, used: false, unknown: false });
  }

  return { entries, unknownNames: [...unknownNames] };
}

// ── Load DB transactions ──────────────────────────────────────────────
async function loadDbTx() {
  const { data, error } = await supabaseClient
    .from('transactions')
    .select('id, ticker, name, shares, price, type, date, total')
    .order('date');
  if (error) throw error;
  return data || [];
}

// ── Match: DivTracker preferred, Broker supplemental ─────────────────
function findBestMatch(tx, refList) {
  const candidates = refList.filter(r =>
    !r.used &&
    !r.unknown &&
    r.ticker === tx.ticker &&
    r.type   === tx.type &&
    Math.abs(r.shares - +tx.shares) < Math.max(1, +tx.shares * 0.01) &&
    Math.abs(r.price  - +tx.price)  < Math.max(0.15, +tx.price * 0.02)
  );
  if (!candidates.length) return null;
  // Prefer DivTracker over Broker; within same source prefer closest price
  const dt = candidates.filter(c => c.source === 'DivTracker');
  const pool = dt.length ? dt : candidates;
  pool.sort((a, b) => Math.abs(a.price - +tx.price) - Math.abs(b.price - +tx.price));
  return pool[0];
}

// ── Main reconcile ────────────────────────────────────────────────────
async function runReconcile() {
  const dtCsv = document.getElementById('csv-dt').value.trim();
  const bkCsv = document.getElementById('csv-bk').value.trim();

  if (!dtCsv && !bkCsv) { showToast('الصق ملف DivTracker أو كشف الوسيط أولاً', 'error'); return; }

  const statusEl = document.getElementById('parse-status');
  statusEl.textContent = 'جارٍ التحليل…';

  _dtEntries = [];
  _bkEntries = [];
  let unknownNames = [];

  if (dtCsv) {
    const parsed = parseDivTracker(dtCsv);
    if (!parsed) { showToast('خطأ في قراءة DivTracker CSV', 'error'); return; }
    _dtEntries = parsed;
  }

  if (bkCsv) {
    const parsed = parseBrokerStatement(bkCsv);
    _bkEntries   = parsed.entries;
    unknownNames = parsed.unknownNames;
  }

  _allRef = [..._dtEntries, ..._bkEntries];

  if (!_allRef.length) { showToast('لم يُعثَر على أي إدخالات', 'error'); return; }

  statusEl.textContent =
    `✓ ${_dtEntries.length} من DivTracker + ${_bkEntries.filter(e => !e.unknown).length} من الوسيط` +
    (unknownNames.length ? ` ⚠️ ${unknownNames.length} اسم غير معروف` : '');

  try {
    _dbTx = await loadDbTx();
  } catch (e) { showToast('خطأ في تحميل المعاملات: ' + e.message, 'error'); return; }

  _allRef.forEach(r => r.used = false);

  _matches = _dbTx.map(tx => {
    const ref = findBestMatch(tx, _allRef);
    if (ref) {
      ref.used = true;
      const sameDate = tx.date === ref.date;
      return { tx, ref, status: sameDate ? 'same' : 'fix', checked: !sameDate };
    }
    return { tx, ref: null, status: 'unmatched', checked: false };
  });

  const refUnused = _allRef.filter(r => !r.used && !r.unknown);

  renderStats(refUnused, unknownNames);
  renderResults();
  renderUnmatched(refUnused, unknownNames);
  document.getElementById('results-section').style.display = '';
  document.getElementById('unmatched-section').style.display =
    (refUnused.length || unknownNames.length) ? '' : 'none';
  updateSelectedCount();
}

// ── Render stats ──────────────────────────────────────────────────────
function renderStats(refUnused, unknownNames) {
  const fix      = _matches.filter(m => m.status === 'fix').length;
  const same     = _matches.filter(m => m.status === 'same').length;
  const unmatched= _matches.filter(m => m.status === 'unmatched').length;
  document.getElementById('stats-row').innerHTML = `
    <div class="stat-pill">إجمالي بالداتابيس: <strong>${_dbTx.length}</strong></div>
    <div class="stat-pill" style="color:#f0b429">تحتاج تصحيح: <strong>${fix}</strong></div>
    <div class="stat-pill" style="color:#3fb950">تاريخ صحيح: <strong>${same}</strong></div>
    <div class="stat-pill" style="color:#8b949e">غير مطابقة: <strong>${unmatched}</strong></div>
    ${refUnused.length ? `<div class="stat-pill" style="color:#f85149">في المرجع بدون تطابق: <strong>${refUnused.length}</strong></div>` : ''}
    ${unknownNames.length ? `<div class="stat-pill" style="color:#f85149">أسماء مجهولة بالوسيط: <strong>${unknownNames.length}</strong></div>` : ''}
  `;
}

// ── Render results table ──────────────────────────────────────────────
function renderResults() {
  const hideSame = document.getElementById('hide-same')?.checked;
  const tbody    = document.getElementById('result-tbody');
  const TYPE_AR  = { buy: 'شراء', sell: 'بيع', grant: 'منحة' };
  let rows = _matches;
  if (hideSame) rows = rows.filter(m => m.status !== 'same');

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="icon">✅</div><p>كل التواريخ صحيحة أو مخفية</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(m => {
    const realIdx = _matches.indexOf(m);
    const tx = m.tx;
    const ref = m.ref;
    let badgeHtml = '', newDate = '', source = '';

    if (m.status === 'fix') {
      badgeHtml = `<span class="badge badge-warn">⚠ يحتاج تصحيح</span>`;
      newDate   = ref.date;
      source    = ref.source;
    } else if (m.status === 'same') {
      badgeHtml = `<span class="badge badge-ok">✓ صحيح</span>`;
      newDate   = tx.date;
      source    = ref.source;
    } else {
      badgeHtml = `<span class="badge badge-skip">— غير مطابق</span>`;
      newDate   = '—'; source = '—';
    }

    const canCheck = m.status === 'fix';
    return `<tr class="match-row">
      <td class="select-col">${canCheck ? `<input type="checkbox" onchange="toggleCheck(${realIdx},this.checked)" ${m.checked?'checked':''}>` : ''}</td>
      <td><strong class="text-accent">${esc(tx.ticker)}</strong></td>
      <td class="num">${fmtN(+tx.shares)}</td>
      <td class="num text-muted">${(+tx.price).toFixed(2)}</td>
      <td>${TYPE_AR[tx.type] || tx.type}</td>
      <td class="num ${m.status==='fix'?'text-danger':''}">${tx.date || '—'}</td>
      <td class="date-arrow">${m.status==='fix'?'→':''}</td>
      <td class="num ${m.status==='fix'?'text-success':''}">${newDate}</td>
      <td class="small text-muted">${source}</td>
      <td>${badgeHtml}</td>
    </tr>`;
  }).join('');

  updateSelectedCount();
}

// ── Render unmatched section ──────────────────────────────────────────
function renderUnmatched(refUnused, unknownNames) {
  const tbody   = document.getElementById('unmatched-tbody');
  const TYPE_AR = { buy: 'شراء', sell: 'بيع' };
  let html = '';

  if (refUnused.length) {
    html += refUnused.map(r => `
      <tr>
        <td><strong>${esc(r.ticker)}</strong></td>
        <td class="num">${fmtN(r.shares)}</td>
        <td class="num text-muted">${r.price.toFixed(2)}</td>
        <td>${TYPE_AR[r.type] || r.type}</td>
        <td class="num text-muted">${r.date}</td>
        <td class="small text-muted">موجود في ${r.source} — لم يُطابَق في الداتابيس</td>
      </tr>`).join('');
  }

  if (unknownNames.length) {
    html += unknownNames.map(n => `
      <tr style="border-right:3px solid #f85149">
        <td colspan="5" class="text-danger small"><strong>اسم مجهول: "${esc(n)}"</strong> — أضفه إلى الخريطة يدوياً</td>
        <td></td>
      </tr>`).join('');
  }

  tbody.innerHTML = html || `<tr><td colspan="6" class="small text-muted text-center">لا شيء</td></tr>`;
}

// ── Check helpers ─────────────────────────────────────────────────────
function toggleCheck(idx, val) { if (_matches[idx]) _matches[idx].checked = val; updateSelectedCount(); }
function selectAll(val) { _matches.forEach(m => { if (m.status === 'fix') m.checked = val; }); renderResults(); document.getElementById('check-all').checked = val; }
function updateSelectedCount() {
  const n = _matches.filter(m => m.checked).length;
  document.getElementById('selected-count').textContent = `${n} معاملة محددة`;
  document.getElementById('apply-btn').disabled = n === 0;
}

// ── Apply changes ─────────────────────────────────────────────────────
async function applyChanges() {
  const toFix = _matches.filter(m => m.checked && m.status === 'fix');
  if (!toFix.length) return;

  const btn    = document.getElementById('apply-btn');
  const status = document.getElementById('apply-status');
  const fill   = document.getElementById('progress-fill');
  btn.disabled = true;
  document.getElementById('progress-bar').style.display = '';

  let done = 0, errors = 0;
  for (const m of toFix) {
    status.textContent = `جارٍ… ${done + 1}/${toFix.length}`;
    fill.style.width   = ((done / toFix.length) * 100) + '%';

    const { error } = await supabaseClient.from('transactions')
      .update({ date: m.ref.date }).eq('id', m.tx.id);

    if (error) { errors++; console.error(error); }
    else { m.tx.date = m.ref.date; m.status = 'same'; m.checked = false; }
    done++;
  }

  fill.style.width = '100%';
  btn.disabled     = false;

  if (!errors) {
    showToast(`✅ تم تحديث ${done} معاملة`, 'success');
    status.textContent = `✅ اكتمل — ${done} تحديث`;
  } else {
    showToast(`${done-errors} نجح، ${errors} فشل`, 'warn');
    status.textContent = `⚠️ ${done-errors} نجح، ${errors} فشل`;
  }

  renderStats(_allRef.filter(r => !r.used && !r.unknown), []);
  renderResults();
  updateSelectedCount();
}

function fmtN(n) {
  const v = parseFloat(n) || 0;
  return v === Math.floor(v)
    ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}
