let transactions = [];
let stagingRows  = [];
let _stagingId   = 0;

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'tx-stats': {
    title: '📊 ملخص المعاملات',
    body: `
      <p>سجل المعاملات هو المصدر الأساسي لكل حسابات محفظتك (المتوسط، الربح، XIRR). دقّته من دقّة هذه الأرقام.</p>
      <div class="info-formula"><strong>الربح المحقق</strong> = صافي عائد البيع − تكلفة الأسهم المباعة (بمتوسط التكلفة وقت البيع)</div>
      <div class="info-math">
        تكلفة الشراء (total) = القيمة + العمولة + الضريبة<br>
        صافي البيع (total) = القيمة − العمولة − الضريبة<br>
        العمولة = أقل من (القيمة × 0.15%، 100 ر.س) · الضريبة = العمولة × 15%
      </div>
      <p class="info-note">💡 «محقق» يعني ربحاً ثبّتّه فعلاً بالبيع (عكس غير المحقق على الورق). أسهم المنحة تُسجَّل بتكلفة صفر فتخفض متوسط تكلفتك الحقيقي.</p>`
  },
};
let sortField    = 'date';
let sortDir      = 'desc';
let _editId      = null;
let _filterType  = 'all';   // 'all' | 'buy' | 'sell' | 'grant'

// ── Dirty-ticker recovery (R-1) ───────────────────────────────
// If the page closed mid-recompute after a successful insert, the dirty-tickers
// flag ensures we finish the holding recompute on next load.
const DIRTY_TICKERS_KEY = 'tharwa-dirty-tickers';

function _markDirtyTickers(userId, tickers) {
  try {
    const key  = `${DIRTY_TICKERS_KEY}:${userId}`;
    if (!tickers.length) { localStorage.removeItem(key); return; }
    const prev = JSON.parse(localStorage.getItem(key) || '[]');
    const next = [...new Set([...prev, ...tickers])];
    localStorage.setItem(key, JSON.stringify(next));
  } catch (_) {}
}

// أزل رمزاً واحداً من قائمة dirty — يُستدعى فقط بعد نجاح إعادة حسابه
function _unmarkDirtyTicker(userId, ticker) {
  try {
    const key  = `${DIRTY_TICKERS_KEY}:${userId}`;
    const rest = JSON.parse(localStorage.getItem(key) || '[]').filter(t => t !== ticker);
    if (rest.length) localStorage.setItem(key, JSON.stringify(rest));
    else localStorage.removeItem(key);
  } catch (_) {}
}

async function _flushDirtyTickers(userId) {
  try {
    const dirty = JSON.parse(localStorage.getItem(`${DIRTY_TICKERS_KEY}:${userId}`) || '[]');
    if (!dirty.length) return;
    // لا نحذف المفتاح قبل إتمام العمل: كل رمز يُزال فور نجاح إعادة حسابه فقط،
    // فإغلاق الصفحة في منتصف الحلقة لا يُضيع الرموز المتبقية.
    for (const ticker of dirty) {
      await recomputeHoldingFromTx(userId, ticker);
      _unmarkDirtyTicker(userId, ticker);
    }
  } catch (_) {}
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-transactions');
  await _flushDirtyTickers(user.id);   // R-1: finish any interrupted recomputes
  setupSingleForm();
  addStagingRow();
  await loadTransactions();
  renderTable();
}

// ── Single-entry form ──────────────────────────────────────────
function setupSingleForm() {
  document.getElementById('t-date').value = todayISO();
  ['t-shares', 't-price'].forEach(id => document.getElementById(id).addEventListener('input', updateSingleCalc));
  document.getElementById('t-type').addEventListener('change', updateSingleCalc);
  document.getElementById('t-ticker').addEventListener('input', onSingleTickerInput);
}

function onSingleTickerInput() {
  const ticker = document.getElementById('t-ticker').value.trim().toUpperCase();
  document.getElementById('t-ticker').value = ticker;
  const official = (typeof lookupTicker === 'function') ? lookupTicker(ticker) : null;
  const name = official?.name || TICKER_DB[ticker];
  // FIX: always update name — clear old name when ticker changes, fill when found
  document.getElementById('t-name').value = name || '';
}

function onTypeChange(type) {
  const priceInput = document.getElementById('t-price');
  const priceLabel = document.getElementById('t-price-label');
  if (!priceInput) return;
  if (type === 'grant') {
    priceInput.required    = false;
    priceInput.value       = '0';
    priceInput.readOnly    = true;
    priceInput.style.opacity = '0.5';
    if (priceLabel) priceLabel.textContent = 'السعر (ر.س) — منحة مجانية';
    // صفّر الحقول الأخرى
    ['t-commission','t-vat','t-total'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '0';
    });
  } else {
    priceInput.required    = true;
    priceInput.readOnly    = false;
    priceInput.style.opacity = '';
    if (priceInput.value === '0') priceInput.value = '';
    if (priceLabel) priceLabel.textContent = 'السعر (ر.س) *';
    updateSingleCalc();
  }
}

function updateSingleCalc() {
  const shares = +document.getElementById('t-shares').value;
  const price  = +document.getElementById('t-price').value;
  const type   = document.getElementById('t-type').value;
  const isGrant = type === 'grant';
  if (!shares || (!price && !isGrant)) {
    ['t-commission','t-vat','t-total'].forEach(id => document.getElementById(id).value = '');
    return;
  }
  const c = type === 'grant'
    ? { commission: 0, vat: 0, totalBuy: shares * price, totalSell: shares * price }
    : calcCommission(shares, price);
  document.getElementById('t-commission').value = c.commission.toFixed(4);
  document.getElementById('t-vat').value         = c.vat.toFixed(4);
  document.getElementById('t-total').value       = (type === 'sell' ? c.totalSell : c.totalBuy).toFixed(4);
}

async function addSingleTransaction(e) {
  e.preventDefault();
  // حماية من النقر المزدوج: عطّل زر «تسجيل» من البداية حتى النهاية
  const submitBtn = document.getElementById('tx-submit-btn');
  if (submitBtn?.disabled) return;
  if (submitBtn) submitBtn.disabled = true;
  try {
  const shares = +document.getElementById('t-shares').value;
  const price  = +document.getElementById('t-price').value;
  const type   = document.getElementById('t-type').value;
  const ticker = document.getElementById('t-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('t-name').value.trim();

  if (!ticker)                          { showToast('أدخل رمز السهم', 'error'); return; }
  if (!name)                            { showToast('أدخل اسم السهم', 'error'); return; }
  if (shares <= 0)                      { showToast('عدد الأسهم يجب أن يكون أكبر من صفر', 'error'); return; }
  if (type !== 'grant' && price <= 0)   { showToast('سعر السهم يجب أن يكون أكبر من صفر', 'error'); return; }

  // AUDIT-FIX (2026-07): تحذير الرمز غير المعروف كان كوداً ميتاً في النموذج الفردي
  // (النموذج الجماعي فقط يتحقق) — نفس فحص M-18 هنا عبر confirmAsync.
  const knownTicker = TICKER_DB[ticker] || (typeof lookupTicker === 'function' && lookupTicker(ticker));
  if (!knownTicker) {
    const ok = await confirmAsync(`الرمز «${ticker}» غير موجود في قاموس الأسهم السعودية.\nهل تريد المتابعة؟`);
    if (!ok) { document.getElementById('t-ticker')?.focus(); return; }
  }

  const { data: { user } } = await supabaseClient.auth.getUser();

  // warn if selling more shares than currently held (system will cap; user may have made a typo)
  if (type === 'sell') {
    const { data: holding } = await supabaseClient.from('holdings')
      .select('shares').eq('user_id', user.id).eq('ticker', ticker).maybeSingle();
    const heldShares = holding ? +holding.shares : 0;
    if (shares > heldShares + 0.0001) {
      const ok = await confirmAsync(
        `أنت تبيع ${formatShares(shares)} سهم لكن حيازتك من ${ticker} هي ${formatShares(heldShares)} فقط.\nهل تريد المتابعة؟ (ستُحسب العملية بالأسهم المتاحة)`
      );
      if (!ok) return;
    }
  }
  const confirmLabel = type === 'buy' ? 'شراء' : type === 'sell' ? 'بيع' : 'تسجيل منحة';
  if (!await confirmAsync(`هل تريد تأكيد عملية ${confirmLabel} ${formatShares(shares)} سهم من ${ticker}؟`)) return;

  const c = type === 'grant'
    ? { commission: 0, vat: 0, totalBuy: 0, totalSell: 0 }
    : calcCommission(shares, price);
  const payload = {
    user_id: user.id,
    date:    document.getElementById('t-date').value,
    ticker:  document.getElementById('t-ticker').value.trim().toUpperCase(),
    name:    document.getElementById('t-name').value.trim(),
    type, shares, price,
    commission: c.commission, vat: c.vat,
    total: type === 'grant' ? 0 : (type === 'sell' ? c.totalSell : c.totalBuy)
  };
  const { error } = await supabaseClient.from('transactions').insert([payload]);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  // R-1: mark dirty before recompute so a crash/close can't leave holdings stale
  _markDirtyTickers(user.id, [payload.ticker]);
  await recomputeHoldingFromTx(user.id, payload.ticker);
  _unmarkDirtyTicker(user.id, payload.ticker);   // recompute done — clear this ticker only
  showToast('تمت إضافة المعاملة', 'success');
  document.getElementById('tx-form').reset();
  document.getElementById('t-date').value = todayISO();
  await loadTransactions();
  renderTable();
  document.getElementById('tx-tbody').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ── Bulk staging ──────────────────────────────────────────────
function addStagingRow() {
  const id = ++_stagingId;
  stagingRows.push({ _id: id, date: todayISO(), ticker: '', name: '', type: 'buy', shares: '', price: '', commission: 0, vat: 0, total: 0 });
  renderStaging();
  setTimeout(() => { const inp = document.querySelector(`tr[data-sid="${id}"] .s-ticker`); if (inp) inp.focus(); }, 50);
}

function removeStaging(id) {
  stagingRows = stagingRows.filter(r => r._id !== id);
  renderStaging();
}

function clearStaging() {
  stagingRows = [];
  _stagingId  = 0;
  addStagingRow();
}

function updateStaging(id, field, value) {
  const r = stagingRows.find(x => x._id === id);
  if (!r) return;
  r[field] = value;
  if (['shares', 'price', 'type'].includes(field)) recalcStaging(r);
  const tr = document.querySelector(`tr[data-sid="${id}"]`);
  if (tr) {
    tr.querySelector('.s-comm').textContent  = r.commission ? formatNum(r.commission, 2) : '—';
    const totalEl = tr.querySelector('.s-total');
    if (totalEl) {
      totalEl.textContent = r.total ? formatNum(r.total, 2) : '—';
      totalEl.className   = 's-total num bold ' + (r.type === 'sell' ? 'text-success' : 'text-accent');
    }
  }
}

function stagingTickerInput(id, input) {
  const ticker = input.value.trim().toUpperCase();
  input.value  = ticker;
  updateStaging(id, 'ticker', ticker);
  const official = (typeof lookupTicker === 'function') ? lookupTicker(ticker) : null;
  const name = official?.name || TICKER_DB[ticker];
  // FIX: update name whenever ticker changes — fill if found, clear if not
  const tr = document.querySelector(`tr[data-sid="${id}"]`);
  if (tr) {
    const nameInput = tr.querySelector('.s-name');
    if (nameInput) { nameInput.value = name || ''; updateStaging(id, 'name', name || ''); }
  }
}

function recalcStaging(r) {
  const sh = parseFloat(r.shares), pr = parseFloat(r.price) || 0;
  const isGrant = r.type === 'grant';
  if (sh > 0 && (pr > 0 || isGrant)) {
    if (isGrant) {
      r.commission = 0; r.vat = 0; r.total = 0;  // منحة: مجانية تماماً
    } else {
      const c = calcCommission(sh, pr);
      r.commission = c.commission; r.vat = c.vat;
      r.total = r.type === 'sell' ? c.totalSell : c.totalBuy;
    }
  } else {
    r.commission = r.vat = r.total = 0;
  }
}

function renderStaging() {
  const n = stagingRows.length;
  const saveBtn = document.getElementById('btn-save-all');
  if (saveBtn) saveBtn.textContent = `إضافة معاملات (${n})`;

  const wrap = document.getElementById('staging-body');
  if (!wrap) return;
  if (!n) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = stagingRows.map((r, i) => `
    <tr data-sid="${r._id}">
      <td class="text-muted small">${i + 1}</td>
      <td><input class="inline-input s-date"   type="date"   value="${r.date}"   oninput="updateStaging(${r._id},'date',this.value)"></td>
      <td><input class="inline-input s-ticker" type="text"   value="${esc(r.ticker)}" placeholder="رمز"   oninput="stagingTickerInput(${r._id},this)" style="min-width:60px"></td>
      <td><input class="inline-input s-name"   type="text"   value="${esc(r.name)}"   placeholder="الاسم" oninput="updateStaging(${r._id},'name',this.value)"   style="min-width:110px"></td>
      <td>
        <select class="inline-input" onchange="updateStaging(${r._id},'type',this.value)">
          <option value="buy"   ${r.type==='buy'  ?'selected':''}>شراء</option>
          <option value="sell"  ${r.type==='sell' ?'selected':''}>بيع</option>
          <option value="grant" ${r.type==='grant'?'selected':''}>أسهم منحة</option>
        </select>
      </td>
      <td><input class="inline-input" type="number" step="any" value="${r.shares||''}" placeholder="0"    oninput="updateStaging(${r._id},'shares',this.value)" style="min-width:70px"></td>
      <td><input class="inline-input" type="number" step="any" value="${r.price||''}"  placeholder="0.00" oninput="updateStaging(${r._id},'price',this.value)"  style="min-width:80px"></td>
      <td class="s-comm num text-muted">${r.commission ? formatNum(r.commission,2) : '—'}</td>
      <td class="s-total num bold ${r.type==='sell'?'text-success':'text-accent'}">${r.total ? formatNum(r.total,2) : '—'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="removeStaging(${r._id})">✕</button></td>
    </tr>`).join('');
}

async function saveAllStaging() {
  const btn = document.getElementById('btn-save-all');
  if (btn?.disabled) return;   // حماية من النقر المزدوج
  const invalid = stagingRows.filter(r => !r.date || !r.ticker.trim() || !r.name.trim() || !+r.shares || (r.type !== 'grant' && !+r.price));
  if (invalid.length) { showToast(`${invalid.length} صف بحقول ناقصة`, 'error'); return; }

  // M-18: warn when any ticker is not in the known database (same check as single form)
  const unknownTickers = [...new Set(
    stagingRows
      .map(r => r.ticker.trim().toUpperCase())
      .filter(tk => tk && !TICKER_DB[tk] && !(typeof lookupTicker === 'function' && lookupTicker(tk)))
  )];
  if (unknownTickers.length) {
    const ok = await confirmAsync(
      `الرموز التالية غير موجودة في قاموس الأسهم السعودية:\n${unknownTickers.join('  ،  ')}\n\nهل تريد المتابعة؟`
    );
    if (!ok) return;
  }

  if (!await confirmAsync(`هل تريد إضافة ${stagingRows.length} معاملة؟`)) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; }

  // Build all payloads first, then insert in one atomic request
  const payloads = stagingRows.map(r => {
    recalcStaging(r);
    return {
      user_id: user.id,
      date: r.date, ticker: r.ticker.toUpperCase(), name: r.name, type: r.type,
      shares: +r.shares, price: +r.price,
      commission: r.commission, vat: r.vat, total: r.total
    };
  });

  const { error } = await supabaseClient.from('transactions').insert(payloads);

  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = `إضافة معاملات (${stagingRows.length})`; }
    showToast(`خطأ في الحفظ: ${error.message}`, 'error');
    return;
  }

  // نجح الإدراج: فرّغ صفوف التحضير فوراً حتى لا تُدرَج مرتين بنقرة مزدوجة،
  // وأبقِ الزر معطلاً حتى نهاية إعادة الحساب
  stagingRows = [];
  _stagingId  = 0;
  renderStaging();
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ إعادة الحساب…'; }

  // R-1: mark dirty before loop so a crash mid-loop still recovers on next load
  const affectedTickers = [...new Set(payloads.map(p => p.ticker))];
  _markDirtyTickers(user.id, affectedTickers);
  for (const ticker of affectedTickers) {
    await recomputeHoldingFromTx(user.id, ticker);
    _unmarkDirtyTicker(user.id, ticker);   // أزل الرمز فقط بعد نجاح إعادة حسابه
  }

  showToast(`تم إضافة ${payloads.length} معاملة بنجاح`, 'success');
  addStagingRow();
  if (btn) btn.disabled = false;
  await loadTransactions();
  renderTable();
  document.getElementById('tx-tbody').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── DB helpers ────────────────────────────────────────────────
const TX_PAGE_LIMIT = 3000;
let _txTotalCount = 0;   // العدد الكلي في قاعدة البيانات (قد يتجاوز المحمّل)

async function loadTransactions() {
  const { data, error, count } = await supabaseClient
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('is_archived', false)
    .order('date', { ascending: false })
    .limit(TX_PAGE_LIMIT);

  if (error) { showToast('خطأ في تحميل البيانات', 'error'); return; }
  transactions = data || [];
  _txTotalCount = (typeof count === 'number') ? count : transactions.length;
  if (count > TX_PAGE_LIMIT) {
    showToast(`⚠️ يتم عرض ${TX_PAGE_LIMIT} معاملة فقط من أصل ${count} — أرشف المعاملات القديمة لتحسين الأداء`, 'warning');
  }
}

// ══════════════════════════════════════════════════════════════════════
// ترتيب المعاملات لحساب متوسط التكلفة — تعريف واحد يستعمله كل حاسب
// ----------------------------------------------------------------------
// الترتيب بالتاريخ وحده **لا يكفي**: معاملتان في اليوم نفسه ترجعان من
// Postgres بترتيبٍ غير محدَّد. وإذا سبق البيع شراءَه في اليوم نفسه:
//
//   الأسهم المملوكة = 0  ⇒  sellShares = min(50, 0) = 0
//   ⇒ البيع يُلغى من الحيازة كلياً، ومتوسط التكلفة = 0
//   ⇒ **كامل عائد البيع يُسجَّل ربحاً محقَّقاً**
//
// قياس فعلي: شراء 100@10 وبيع 50@12 في اليوم نفسه —
//   الشراء أولاً (الصحيح): 50 سهماً باقية · ربح +98 ر.س
//   البيع أولاً:          100 سهم باقية · ربح **+599 ر.س** — ستة أضعاف
//
// وكسرُ التعادل بـ`created_at` وحده لا يكفي أيضاً: هو **ترتيب الإدخال**
// لا الترتيب الاقتصادي. من يسجّل البيع قبل شرائه — استيراداً أو تصحيحاً
// لاحقاً — يحصل على المقلوب نفسه.
//
// القاعدة: التاريخ ← ثم **الاقتناء قبل التصرّف** (buy/grant قبل sell)،
// وهو العرف المحاسبي: لا يُباع ما لم يُملَك بعد ← ثم created_at ← ثم id.
// ══════════════════════════════════════════════════════════════════════
const TX_ORDER = { buy: 0, grant: 0, sell: 1 };
function txSortForWAC(rows) {
  return [...(rows || [])].sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || '')) ||
    ((TX_ORDER[a.type] ?? 0) - (TX_ORDER[b.type] ?? 0)) ||
    String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
    String(a.id || '').localeCompare(String(b.id || ''))
  );
}

// ── إعادة حساب كاملة لسهم واحد من صفر بناءً على جميع معاملاته ─
// بعد كل إضافة أو تعديل أو أرشفة معاملة يُستدعى هذا لضمان دقة WAC
async function recomputeHoldingFromTx(userId, ticker) {
  // S-2: filter by user_id — defence in depth if RLS is ever misconfigured
  const { data: txAll } = await supabaseClient
    .from('transactions')
    .select('type, shares, price, total, name, date, created_at, id')
    .eq('user_id', userId)
    .eq('ticker', ticker)
    .eq('is_archived', false)
    .order('date', { ascending: true });

  const rows = txSortForWAC(txAll || []);

  // احسب الأسهم الإجمالية والمتوسط المرجح (WAC) من الصفر
  let totalShares = 0;
  let totalCost   = 0;
  let stockName   = '';

  rows.forEach(t => {
    if (!stockName && t.name) stockName = t.name;
    if (t.type === 'buy') {
      // use t.total (shares×price + commission + VAT) — consistent with performance.js P&L
      totalCost   += +t.total;
      totalShares += +t.shares;
    } else if (t.type === 'grant') {
      totalShares += +t.shares;   // منحة: تكلفة = صفر
    } else if (t.type === 'sell') {
      const sellShares = Math.min(+t.shares, totalShares);
      // WAC لا يتغير عند البيع — خصم التكلفة بشكل مباشر لتجنب تراكم أخطاء الفاصلة العائمة
      const avgCostPerShare = totalShares > 0 ? totalCost / totalShares : 0;
      totalCost   = Math.max(0, totalCost - avgCostPerShare * sellShares);
      totalShares -= sellShares;
    }
  });

  totalShares = Math.max(0, +totalShares.toFixed(6));
  const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;

  const { data: existing } = await supabaseClient
    .from('holdings').select('id, current_price, sector, target_weight')
    .eq('user_id', userId).eq('ticker', ticker).maybeSingle();

  if (totalShares <= 0) {
    // السهم بيع بالكامل — احذفه من المحفظة
    if (existing) await supabaseClient.from('holdings').delete().eq('id', existing.id);
  } else if (existing) {
    // حدّث الأسهم والمتوسط فقط — احتفظ بالسعر الحالي والقطاع والهدف
    await supabaseClient.from('holdings').update({
      shares:    +totalShares.toFixed(6),
      avg_price: +avgPrice.toFixed(4),
    }).eq('id', existing.id);
  } else {
    // سهم جديد — أضفه
    // AUDIT-FIX 2026-08-21 (#35): كان القطاع يُكتب فارغاً دائماً من هذا المسار،
    // بينما مزامنة لوحة التحكم تكتبه من tickerdb. سهم بقطاع فارغ يسقط من مقام
    // سقف القطاع 25% (الدستور §4 الفلتر 4) فيظهر التركيز أقلّ مما هو — كسر سقف
    // صامت. نقرأ القطاع الرسمي هنا بنفس المصدر، وإن لم يوجد الرمز نكتب «أخرى»
    // (قطاع معلَن في OFFICIAL_SECTORS) بدل الفراغ حتى يبقى السهم داخل المقام.
    const _known = (typeof lookupTicker === 'function') ? lookupTicker(ticker) : null;
    await supabaseClient.from('holdings').insert([{
      user_id:      userId,
      ticker,
      name:         stockName || (_known && _known.name) || '',
      sector:       (_known && _known.sector) || 'أخرى',
      shares:       +totalShares.toFixed(6),
      avg_price:    +avgPrice.toFixed(4),
      current_price: +avgPrice.toFixed(4),
      target_weight: 0,
    }]);
  }
}

// ── Filter by type ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
// إجراءات الشركات — تجزئة الأسهم (Stock Split) والتجزئة العكسية
// ──────────────────────────────────────────────────────────────────────
// المبدأ: التجزئة تُغيّر عدد الأسهم والسعر عكسياً مع بقاء القيمة (shares×price) ثابتة.
// نضرب shares لكل معاملة بالمعامل (factor) ونقسم price عليه، فيبقى total كما هو
// (total = shares×price + عمولة + ضريبة) → WAC (=totalCost/totalShares) يتحوّل
// إلى avg÷factor، وXIRR (المبني على totals والتواريخ) لا يتأثر إطلاقاً.
// forward split 10:1 → factor = 10 | reverse split 1:10 → factor = 0.1
// نعدّل أيضاً current_price في holdings (السوق يعدّل السعر المعلن) قبل إعادة الحساب.
// التوزيعات لا تُعدَّل: مبالغها إجمالية (لا للسهم)، وحساب الأسهم-وقت-التوزيع يشتقّ
// من المعاملات المعدَّلة تلقائياً.
function _corpFactor() {
  const raw = +document.getElementById('corp-ratio').value;
  const type = document.getElementById('corp-type').value;
  if (!raw || raw <= 0) return null;
  // forward: كل سهم قديم يصبح raw سهماً → factor = raw
  // reverse: كل raw سهم قديم يصبح سهماً واحداً → factor = 1/raw
  return type === 'reverse' ? 1 / raw : raw;
}

function openCorpActionModal() {
  document.getElementById('corp-ticker').value = '';
  document.getElementById('corp-ratio').value = '';
  document.getElementById('corp-ticker-name').textContent = '';
  document.getElementById('corp-preview').innerHTML = '';
  document.getElementById('corp-type').value = 'forward';
  onCorpTypeChange();
  document.getElementById('corp-modal').style.display = 'flex';
}

function closeCorpActionModal(e) {
  if (e && e.target !== document.getElementById('corp-modal')) return;
  document.getElementById('corp-modal').style.display = 'none';
}

function onCorpTypeChange() {
  const type = document.getElementById('corp-type').value;
  document.getElementById('corp-ratio-lbl').textContent = type === 'reverse'
    ? 'عدد الأسهم القديمة التي تُدمج في سهم واحد'
    : 'عدد الأسهم الناتجة عن كل سهم قديم';
  document.getElementById('corp-ratio').placeholder = type === 'reverse'
    ? 'مثال: 10  (لتجزئة عكسية 1:10)'
    : 'مثال: 10  (لتجزئة 10:1)';
  updateCorpPreview();
}

function onCorpTickerInput() {
  const ticker = document.getElementById('corp-ticker').value.trim().toUpperCase();
  document.getElementById('corp-ticker').value = ticker;
  const official = (typeof lookupTicker === 'function') ? lookupTicker(ticker) : null;
  const name = official?.name || TICKER_DB[ticker];
  document.getElementById('corp-ticker-name').textContent = name || '';
  updateCorpPreview();
}

function updateCorpPreview() {
  const box = document.getElementById('corp-preview');
  if (!box) return;
  const ticker = document.getElementById('corp-ticker').value.trim().toUpperCase();
  const factor = _corpFactor();
  if (!ticker || !factor) { box.innerHTML = ''; return; }

  const affected = transactions.filter(t => t.ticker === ticker && !t.is_archived);
  if (!affected.length) {
    box.innerHTML = `<span style="color:var(--danger)">لا توجد معاملات مسجّلة للرمز «${esc(ticker)}».</span>`;
    return;
  }
  // عيّنة: أول معاملة قبل/بعد
  const t0 = affected[0];
  const sh0 = +t0.shares, pr0 = +t0.price;
  box.innerHTML = `
    <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <div><b>${affected.length}</b> معاملة للرمز «${esc(ticker)}» ستُعدَّل بالمعامل ×${(+factor.toFixed(6))}.</div>
      <div style="margin-top:6px;color:var(--text-muted)">مثال (أول معاملة):
        ${formatShares(sh0)} سهم @ ${formatNum(pr0)} ر.س →
        <b style="color:var(--text)">${formatShares(sh0 * factor)} سهم @ ${formatNum(pr0 / factor)} ر.س</b>
        <span style="color:var(--text-muted)"> (القيمة الإجمالية ثابتة)</span>
      </div>
    </div>`;
}

async function applyCorpAction() {
  const ticker = document.getElementById('corp-ticker').value.trim().toUpperCase();
  const factor = _corpFactor();
  if (!ticker) { showToast('أدخل رمز السهم', 'error'); return; }
  if (!factor) { showToast('أدخل معامل تجزئة صحيح (> 0)', 'error'); return; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { showToast('انتهت الجلسة', 'error'); return; }

  // اقرأ كل معاملات السهم من قاعدة البيانات مباشرة (لا نعتمد على الصفحة المُحمَّلة
  // المحدودة بـ TX_PAGE_LIMIT — قد تكون بعض معاملات السهم خارج الصفحة الحالية)
  const { data: affected, error: loadErr } = await supabaseClient
    .from('transactions').select('id, type, shares, price')
    .eq('user_id', user.id).eq('ticker', ticker).eq('is_archived', false);
  if (loadErr) { showToast('خطأ في قراءة المعاملات', 'error'); return; }
  if (!affected || !affected.length) { showToast(`لا توجد معاملات للرمز «${ticker}»`, 'error'); return; }

  const ok = await confirmAsync(
    `سيتم تعديل ${affected.length} معاملة للرمز «${ticker}» بمعامل ×${(+factor.toFixed(6))}.\n` +
    `عدد الأسهم والسعر سيتغيّران، والقيمة الإجمالية ومتوسط التكلفة وXIRR تبقى سليمة.\n\nمتابعة؟`
  );
  if (!ok) return;

  const btn = document.getElementById('corp-apply-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ التطبيق…'; }

  // التجزئة غير ذرّية (صف-صفاً): علّم الرمز dirty قبل البدء حتى يُستكمل
  // إصلاح الحيازة عند أي انقطاع (R-1)
  _markDirtyTickers(user.id, [ticker]);

  // تعديل كل معاملة: shares×factor و price÷factor (total ثابت — لا يُعاد حسابه)
  let failed = 0, updated = 0, fractional = false;
  for (const t of affected) {
    const newShares = +(+t.shares * factor).toFixed(6);
    if (Math.abs(newShares - Math.round(newShares)) > 1e-9) fractional = true;
    const newPrice  = t.type === 'grant' ? 0 : +(+t.price / factor).toFixed(4);
    const { error } = await supabaseClient.from('transactions')
      .update({ shares: newShares, price: newPrice })
      .eq('id', t.id).eq('user_id', user.id);
    if (error) failed++; else updated++;
  }

  // عدّل السعر الحالي في المحفظة (السوق يعدّل السعر المعلن بنفس المعامل)
  const { data: hold } = await supabaseClient.from('holdings')
    .select('id, current_price').eq('user_id', user.id).eq('ticker', ticker).maybeSingle();
  if (hold && +hold.current_price > 0) {
    await supabaseClient.from('holdings')
      .update({ current_price: +(+hold.current_price / factor).toFixed(4) })
      .eq('id', hold.id);
  }

  // أعِد حساب الحيازة من المعاملات المعدَّلة (يضبط shares وWAC)
  await recomputeHoldingFromTx(user.id, ticker);
  if (!failed) _unmarkDirtyTicker(user.id, ticker);

  if (btn) { btn.disabled = false; btn.textContent = 'تطبيق على كل المعاملات'; }
  document.getElementById('corp-modal').style.display = 'none';
  if (failed) {
    // فشل جزئي: أرقام دقيقة + تحذير صريح — إعادة تشغيل التجزئة تضرب الصفوف الناجحة مرتين
    showToast(
      `⚠️ عُدِّل ${updated} من ${affected.length} صفاً وفشل ${failed}. ` +
      `لا تُعِد تشغيل التجزئة — ستُضرب الصفوف الناجحة مرتين (ازدواج الضرب). ` +
      `صحّح الصفوف الفاشلة يدوياً من السجل.`,
      'error'
    );
  } else {
    showToast(
      `تمت التجزئة على ${affected.length} معاملة ✓` +
      (fractional ? ' — ⚠️ نتجت كسور أسهم، عدّل يدوياً حسب التعويض النقدي' : ''),
      fractional ? 'warning' : 'success'
    );
  }
  await loadTransactions();
  renderTable();
  renderTxStats();
}

function setTxFilter(type) {
  _filterType = type;
  // تحديث حالة الأزرار
  ['all','buy','sell','grant'].forEach(t => {
    const btn = document.getElementById('txf-' + t);
    if (btn) btn.classList.toggle('btn-primary',   t === type);
    if (btn) btn.classList.toggle('btn-secondary', t !== type);
  });
  renderTable();
}

// ── Sort ──────────────────────────────────────────────────────
function sortTable(field) {
  if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortField = field; sortDir = 'asc'; }
  renderTable();
}

function getSorted() {
  // تطبيق فلتر النوع أولاً
  const base = _filterType === 'all'
    ? transactions
    : transactions.filter(t => t.type === _filterType);
  const numFields = new Set(['shares','price','commission','vat','total']);
  return [...base].sort((a, b) => {
    let av = a[sortField], bv = b[sortField];
    if (sortField === 'date') { av = new Date(av); bv = new Date(bv); }
    else if (numFields.has(sortField)) { av = Number(av) || 0; bv = Number(bv) || 0; }   // تطبيع القيم الفارغة/NaN
    else { av = String(av||'').toLowerCase(); bv = String(bv||'').toLowerCase(); }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
}

function sortArrow(field) {
  if (sortField !== field) return '<span class="sort-arrow">↕</span>';
  return `<span class="sort-arrow active">${sortDir === 'asc' ? '↑' : '↓'}</span>`;
}

// ── Transaction Summary Stats ─────────────────────────────────
function renderTxStats() {
  const el = document.getElementById('tx-stats');
  if (!el) return;

  const buys   = transactions.filter(t => t.type === 'buy');
  const sells  = transactions.filter(t => t.type === 'sell');
  const grants = transactions.filter(t => t.type === 'grant');

  // حساب الربح/الخسارة الحقيقي بطريقة WAC شاملة العمولة والضريبة
  // نمشي على المعاملات ترتيباً تاريخياً ونتتبع التكلفة الكاملة لكل رمز
  // نفس ترتيب `recomputeHoldingFromTx` حرفياً — وإلا تباعدت الصفحتان في
  // متوسط التكلفة والربح المحقَّق لنفس السهم في اليوم نفسه.
  const sorted = txSortForWAC(transactions);
  const costMap = {}; // ticker → { shares, totalCost (شاملة عمولة + ضريبة) }

  // الإحصاءات المحققة تتطلب كامل السجل — نافذة مبتورة تعطي أرقاماً مضللة
  const statsComplete = _txTotalCount <= TX_PAGE_LIMIT;

  let profitSells = 0, profitAmount = 0;
  let lossSells   = 0, lossAmount   = 0;

  sorted.forEach(t => {
    if (!costMap[t.ticker]) costMap[t.ticker] = { shares: 0, totalCost: 0 };
    const m = costMap[t.ticker];

    if (t.type === 'buy') {
      // total الشراء = أسهم × سعر + عمولة + ضريبة
      m.totalCost += +t.total;
      m.shares    += +t.shares;
    } else if (t.type === 'grant') {
      m.shares += +t.shares; // منحة: تكلفة صفر
    } else if (t.type === 'sell') {
      // نفس قصّ recomputeHoldingFromTx: لا تُحتسب تكلفة أسهم غير مملوكة عند بيع زائد
      const sellShares      = Math.min(+t.shares, m.shares);
      // متوسط التكلفة الكاملة للسهم الواحد (شاملة العمولة والضريبة عند الشراء)
      const avgCostPerShare = m.shares > 0 ? m.totalCost / m.shares : 0;
      const costOfSold      = avgCostPerShare * sellShares;
      // ⚠️ العائد يُقَصّ بنفس نسبة قصّ العدد. كان يُؤخذ كاملاً (`+t.total`)
      // بينما التكلفة مقصوصة، فبيعُ 150 سهماً من 100 مملوكة كان يُسجّل ربح
      // خمسين سهماً **لا تملكها** ربحاً محقَّقاً: +795 بدل +196 ر.س.
      // ورسالة التأكيد تَعِد صراحةً «ستُحسب العملية بالأسهم المتاحة».
      const sellRatio       = (+t.shares > 0) ? sellShares / +t.shares : 0;
      const netProceeds     = (+t.total) * sellRatio;
      const pnl             = netProceeds - costOfSold;

      if (pnl >= 0) { profitSells++;  profitAmount += pnl; }
      else          { lossSells++;    lossAmount   += Math.abs(pnl); }

      // L-2: deduct cost by share count (matches recomputeHoldingFromTx) not percentage
      m.totalCost  = Math.max(0, m.totalCost - avgCostPerShare * sellShares);
      m.shares     = Math.max(0, m.shares - sellShares);
    }
  });

  const totalBuyAmt  = buys.reduce((s, t)  => s + +t.total, 0);
  const totalSellAmt = sells.reduce((s, t) => s + +t.total, 0);

  el.innerHTML = `
    <div class="tx-stat-item">
      <div class="tx-stat-val">${transactions.length}</div>
      <div class="tx-stat-lbl">إجمالي العمليات</div>
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val text-accent">${buys.length}</div>
      <div class="tx-stat-lbl">عمليات شراء</div>
      <div class="tx-stat-sub">${formatSAR(totalBuyAmt)}</div>
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val text-success">${sells.length}</div>
      <div class="tx-stat-lbl">عمليات بيع</div>
      <div class="tx-stat-sub">${formatSAR(totalSellAmt)}</div>
    </div>
    ${grants.length ? `
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val" style="color:var(--text-muted)">${grants.length}</div>
      <div class="tx-stat-lbl">منح أسهم</div>
    </div>` : ''}
    <div class="tx-stat-divider"></div>
    ${statsComplete ? `
    <div class="tx-stat-item">
      <div class="tx-stat-val text-success">↑ ${profitSells}</div>
      <div class="tx-stat-lbl">صفقات رابحة</div>
      <div class="tx-stat-sub text-success">+${formatSAR(profitAmount)}</div>
    </div>
    <div class="tx-stat-divider"></div>
    <div class="tx-stat-item">
      <div class="tx-stat-val text-danger">↓ ${lossSells}</div>
      <div class="tx-stat-lbl">صفقات خاسرة</div>
      <div class="tx-stat-sub text-danger">−${formatSAR(lossAmount)}</div>
    </div>` : `
    <div class="tx-stat-item">
      <div class="tx-stat-val" style="color:var(--text-muted)">⚠️</div>
      <div class="tx-stat-lbl">الربح/الخسارة المحققة</div>
      <div class="tx-stat-sub">الإحصاءات تتطلب كامل السجل (${_txTotalCount} معاملة تتجاوز المحمّل ${TX_PAGE_LIMIT})</div>
    </div>`}`;
}

// ── Render transaction log ────────────────────────────────────
function renderTable() {
  renderTxStats();
  const tbody = document.getElementById('tx-tbody');
  if (!tbody) return;

  if (!transactions.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="icon">💹</div><p>لا توجد معاملات بعد</p></div></td></tr>`;
    enableInlineEditing(tbody, onTxSaved);
    return;
  }

  const typeLabel = { buy: 'شراء', sell: 'بيع', grant: 'منحة' };
  const sorted = getSorted();

  tbody.innerHTML = sorted.map(t => {
    const isSell   = t.type === 'sell';
    const totalCls = isSell ? 'text-success' : 'text-accent';
    return `<tr>
      <td ${ed('transactions',t.id,'date','date',t.date)}>${formatDate(t.date)}</td>
      <td ${ed('transactions',t.id,'ticker','text',t.ticker,'text-accent bold')}>${esc(t.ticker)}</td>
      <td ${ed('transactions',t.id,'name','text',t.name)}>${esc(t.name)}</td>
      <td ${ed('transactions',t.id,'type','text',t.type,'','txtype')}><span class="badge badge-${t.type}">${typeLabel[t.type]||t.type}</span></td>
      <td ${ed('transactions',t.id,'shares','number',t.shares,'num')}>${formatShares(t.shares)}</td>
      <td ${ed('transactions',t.id,'price','number',t.price,'num')}>${formatSAR(t.price)}</td>
      <td class="num text-muted">${formatSAR(t.commission)}</td>
      <td class="num text-muted">${formatSAR(t.vat)}</td>
      <td class="num bold ${totalCls}">${formatSAR(t.total)}</td>
      <td>
        <div class="flex gap-1">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${esc(t.id)}')">تعديل</button>
          <button class="btn btn-danger btn-sm"    onclick="archiveTx('${esc(t.id)}')">أرشفة</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Update sort indicators
  ['date','ticker','name','type','shares','price','commission','vat','total'].forEach(f => {
    const th = document.getElementById('th-' + f);
    const arrow = th?.querySelector('.sort-arrow');
    if (arrow) arrow.outerHTML = sortArrow(f);
  });

  enableInlineEditing(tbody, onTxSaved);
}

function ed(table, rowId, field, type, raw, extraCls = '', selectKey = '') {
  return `class="editable${type==='number'?' num':''}${extraCls?' '+extraCls:''}" ` +
    `data-table="${table}" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"` +
    (selectKey ? ` data-select="${selectKey}"` : '');
}

async function onTxSaved(id, field, newVal) {
  const row = transactions.find(t => t.id === id);
  if (!row) { await loadTransactions(); renderTable(); return; }
  // I-1: capture old ticker BEFORE mutation so we can recompute it if ticker changed
  const oldTicker = row.ticker;
  // AUDIT-FIX: تحويل منحة→شراء/بيع بسعر 0 من القائمة المضمّنة يخلق معاملة بتكلفة صفر
  // تُفسد WAC — أعد النوع كما كان وافرض التعديل من النافذة الكاملة (السعر والنوع معاً)
  if (field === 'type' && newVal !== 'grant' && !(+row.price > 0)) {
    await supabaseClient.from('transactions').update({ type: row.type }).eq('id', id);
    showToast('أدخل سعر الشراء أولاً — عدّل السعر والنوع معاً من نافذة التعديل الكاملة', 'error');
    renderTable();
    openEditModal(id);
    return;
  }
  row[field] = newVal;
  if (['shares', 'price', 'type', 'ticker'].includes(field)) {
    const isGrant = row.type === 'grant';
    if (isGrant && field === 'type') {
      row.price = 0;
      await supabaseClient.from('transactions').update({ price: 0 }).eq('id', id);
    }
    const c     = isGrant ? { commission: 0, vat: 0 } : calcCommission(row.shares, row.price);
    const total = isGrant ? 0 : (row.type === 'sell' ? c.totalSell : c.totalBuy);
    await supabaseClient.from('transactions').update({ commission: c.commission, vat: c.vat, total }).eq('id', id);
    row.commission = c.commission; row.vat = c.vat; row.total = total;
    const { data: { user } } = await supabaseClient.auth.getUser();
    // recompute both old and new ticker when ticker field changes
    const tickers = new Set([row.ticker]);
    if (field === 'ticker' && oldTicker && oldTicker !== row.ticker) tickers.add(oldTicker);
    for (const t of tickers) await recomputeHoldingFromTx(user.id, t);
    showToast('تم التحديث وإعادة حساب المحفظة ✓', 'success');
  } else if (field === 'date') {
    // AUDIT-FIX (2026-07): تغيير التاريخ يغيّر الترتيب الزمني — وWAC يعتمد على
    // ترتيب البيع بين الشراءات، فلا بد من إعادة حساب الحيازة (كان يُهمَل سابقاً).
    const { data: { user } } = await supabaseClient.auth.getUser();
    await recomputeHoldingFromTx(user.id, row.ticker);
    showToast('تم التحديث وإعادة حساب المحفظة ✓', 'success');
  }
  renderTable();
}

async function archiveTx(id) {
  if (!await confirmAsync('أرشفة هذه المعاملة؟ ستُخفى من الحسابات والمحفظة لكنها تبقى في قاعدة البيانات كسجل تاريخي.')) return;
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient.from('transactions').update({ is_archived: true }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  // إعادة حساب كاملة من الصفر بعد الحذف — أدق من reverseHolding
  await recomputeHoldingFromTx(user.id, tx.ticker);
  showToast('تمت الأرشفة وتحديث المحفظة', 'success');
  await loadTransactions();
  renderTable();
}

// ── Edit Modal ────────────────────────────────────────────────
function openEditModal(id) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;
  _editId = id;

  document.getElementById('edit-date').value   = t.date   || '';
  document.getElementById('edit-ticker').value = t.ticker || '';
  document.getElementById('edit-name').value   = t.name   || '';
  document.getElementById('edit-type').value   = t.type   || 'buy';
  document.getElementById('edit-shares').value = t.shares || '';
  document.getElementById('edit-price').value  = (t.type === 'grant') ? '0' : (t.price || '');

  // ضبط حقل السعر للمنحة
  onEditTypeChange(t.type || 'buy');
  updateEditCalc();
  document.getElementById('edit-modal').style.display = 'flex';
}

// يتحكم في قفل/فتح حقل السعر في نافذة التعديل
function onEditTypeChange(type) {
  const priceInput = document.getElementById('edit-price');
  if (!priceInput) return;
  if (type === 'grant') {
    priceInput.value    = '0';
    priceInput.readOnly = true;
    priceInput.style.opacity = '0.5';
  } else {
    priceInput.readOnly = false;
    priceInput.style.opacity = '';
    if (priceInput.value === '0') priceInput.value = '';
  }
}

function closeEditModal(e) {
  if (e && e.target !== document.getElementById('edit-modal')) return;
  document.getElementById('edit-modal').style.display = 'none';
  _editId = null;
}

function onEditTickerInput() {
  const ticker = document.getElementById('edit-ticker').value.trim().toUpperCase();
  document.getElementById('edit-ticker').value = ticker;
  const official = (typeof lookupTicker === 'function') ? lookupTicker(ticker) : null;
  const name = official?.name || TICKER_DB[ticker];
  // FIX: always update name — clear when ticker changes, fill when found
  document.getElementById('edit-name').value = name || '';
}

function updateEditCalc() {
  const shares = +document.getElementById('edit-shares').value;
  const price  = +document.getElementById('edit-price').value;
  const type   = document.getElementById('edit-type').value;
  const isGrant = type === 'grant';
  if (!shares || (!price && !isGrant)) {
    ['edit-commission','edit-vat','edit-total'].forEach(id => document.getElementById(id).value = '');
    return;
  }
  const c = type === 'grant'
    ? { commission: 0, vat: 0, totalBuy: shares * price, totalSell: shares * price }
    : calcCommission(shares, price);
  document.getElementById('edit-commission').value = c.commission.toFixed(4);
  document.getElementById('edit-vat').value         = c.vat.toFixed(4);
  document.getElementById('edit-total').value       = (type === 'sell' ? c.totalSell : c.totalBuy).toFixed(4);
}

async function saveEditModal() {
  if (!_editId) return;
  const shares = +document.getElementById('edit-shares').value;
  const price  = +document.getElementById('edit-price').value;
  const type   = document.getElementById('edit-type').value;
  const ticker = document.getElementById('edit-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('edit-name').value.trim();
  const date   = document.getElementById('edit-date').value;

  if (!date || !ticker || !name)            { showToast('جميع الحقول مطلوبة', 'error'); return; }
  if (shares <= 0)                          { showToast('عدد الأسهم يجب أن يكون أكبر من صفر', 'error'); return; }
  if (type !== 'grant' && price <= 0)       { showToast('سعر السهم يجب أن يكون أكبر من صفر', 'error'); return; }

  const c     = type === 'grant' ? { commission: 0, vat: 0, totalBuy: 0, totalSell: 0 } : calcCommission(shares, price);
  const total = type === 'grant' ? 0 : (type === 'sell' ? c.totalSell : c.totalBuy);

  const { error } = await supabaseClient.from('transactions').update({
    date, ticker, name, type, shares, price,
    commission: c.commission, vat: c.vat, total
  }).eq('id', _editId);

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }

  // إعادة حساب كاملة من الصفر بعد التعديل — أدق من reverse+apply
  const { data: { user } } = await supabaseClient.auth.getUser();
  const oldTx = transactions.find(t => t.id === _editId);
  // لو الرمز تغيّر نعيد حساب القديم والجديد كليهما
  const tickers = new Set([ticker]);
  if (oldTx?.ticker && oldTx.ticker !== ticker) tickers.add(oldTx.ticker);
  for (const t of tickers) await recomputeHoldingFromTx(user.id, t);

  showToast('تم حفظ التعديلات ✓', 'success');
  document.getElementById('edit-modal').style.display = 'none';
  _editId = null;
  await loadTransactions();
  renderTable();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportTransactionsCSV() {
  if (!transactions.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  const TYPE_AR = { buy: 'شراء', sell: 'بيع', grant: 'منحة', split: 'تجزئة' };
  exportCSV(`معاملات_${todayISO()}.csv`,
    ['التاريخ', 'الرمز', 'الاسم', 'النوع', 'الأسهم', 'السعر', 'العمولة', 'الضريبة', 'الإجمالي'],
    transactions.map(t => [
      t.date, t.ticker, t.name,
      TYPE_AR[t.type] || t.type,
      t.shares, t.price, t.commission, t.vat, t.total
    ])
  );
  showToast(`✓ تم تصدير ${transactions.length} معاملة`, 'success');
}

init();
