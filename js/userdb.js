let userStocks   = [];
let holdings     = [];
let _conflictPending = null;   // {ticker, name, sector} من النموذج عند التعارض

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'userdb': {
    title: '🗂️ قاعدة بيانات أسهمي',
    body: `
      <p>قاموسك الشخصي للأسهم: الرمز + الاسم + القطاع. تُدخله مرة واحدة هنا فيُستخدم تلقائياً في كل الصفحات (الأهداف، المراقبة، الأرباح…).</p>
      <p class="info-note">💡 القطاع الذي تحدّده هنا هو أساس حسابات التنويع والتركّز القطاعي في لوحة التحكم — احرص على تصنيف صحيح ومتّسق (مثلاً «بنوك» لكل البنوك لا «بنك» مرة و«مصارف» مرة).</p>`
  },
};

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-userdb');
  populateSectorDropdown();
  await loadAll();
}

function populateSectorDropdown() {
  const sel = document.getElementById('s-sector');
  OFFICIAL_SECTORS.forEach(s => {
    const o = document.createElement('option');
    o.value = s; o.textContent = s;
    sel.appendChild(o);
  });
}

async function loadAll() {
  const [us, hs] = await Promise.all([
    supabaseClient.from('user_stocks').select('*').order('ticker'),
    supabaseClient.from('holdings').select('ticker')
  ]);
  userStocks = us.data || [];
  holdings   = (hs.data || []).map(h => h.ticker);
  renderTable();
}

function onTickerInput() {
  const ticker = document.getElementById('s-ticker').value.trim().toUpperCase();
  document.getElementById('s-ticker').value = ticker;
  document.getElementById('ticker-conflict').style.display = 'none';
  _conflictPending = null;

  const official = lookupTicker(ticker);
  if (official) {
    // ملأ الاسم والقطاع تلقائياً من البيانات الرسمية
    document.getElementById('s-name').value   = official.name;
    document.getElementById('s-sector').value = official.sector;
  }
}

async function addStock(e) {
  e.preventDefault();
  const ticker = document.getElementById('s-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('s-name').value.trim();
  const sector = document.getElementById('s-sector').value;

  if (!ticker || !name || !sector) { showToast('جميع الحقول مطلوبة', 'error'); return; }

  // فحص التعارض مع البيانات الرسمية
  const official = lookupTicker(ticker);
  if (official && official.name !== name && !_conflictPending) {
    _conflictPending = { ticker, name, sector };
    document.getElementById('ticker-conflict-msg').textContent =
      `⚠️ الرمز ${ticker} مسجل رسمياً باسم "${official.name}" (${official.sector}) — أنت أدخلت "${name}". هل تريد المتابعة ببياناتك أم استخدام البيانات الرسمية؟`;
    document.getElementById('ticker-conflict').style.display = 'flex';
    return;
  }

  await doInsert(ticker, name, sector);
}

function confirmConflict() {
  if (!_conflictPending) return;
  const { ticker, name, sector } = _conflictPending;
  _conflictPending = null;
  document.getElementById('ticker-conflict').style.display = 'none';
  doInsert(ticker, name, sector);
}

function useOfficialData() {
  if (!_conflictPending) return;
  const official = lookupTicker(_conflictPending.ticker);
  _conflictPending = null;
  document.getElementById('ticker-conflict').style.display = 'none';
  if (official) {
    document.getElementById('s-name').value   = official.name;
    document.getElementById('s-sector').value = official.sector;
  }
  showToast('تم ملء البيانات الرسمية — اضغط إضافة للتأكيد', 'info');
}

async function doInsert(ticker, name, sector) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const btn = document.getElementById('add-btn');
  btn.disabled = true; btn.textContent = 'جارٍ الإضافة…';

  const { error } = await supabaseClient.from('user_stocks').insert([{
    user_id: user.id, ticker, name, sector
  }]);

  btn.disabled = false; btn.textContent = 'إضافة السهم';

  if (error) {
    if (error.code === '23505') showToast(`الرمز ${ticker} موجود مسبقاً في قاعدتك`, 'error');
    else showToast('خطأ: ' + error.message, 'error');
    return;
  }

  showToast(`تمت إضافة ${name} ✓`, 'success');
  resetForm();
  await loadAll();
}

function resetForm() {
  document.getElementById('add-form').reset();
  document.getElementById('ticker-conflict').style.display = 'none';
  _conflictPending = null;
}

async function deleteStock(id, ticker) {
  if (!await confirmAsync(`هل تريد حذف ${esc(ticker)} من قاعدة بياناتك؟`)) return;
  const { error } = await supabaseClient.from('user_stocks').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await loadAll();
}

// AUDIT-FIX: replaced prompt() with DOM-based overlay — prompt() blocked in strict CSP
async function editStock(id, field, oldVal) {
  const label = field === 'name' ? 'الاسم' : 'القطاع';
  const newVal = await new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `
      <div style="background:var(--bg-2,#1c2128);border:1px solid var(--border,#30363d);border-radius:12px;max-width:360px;width:100%;padding:24px 20px">
        <p style="margin:0 0 10px;color:var(--text-1,#e6edf3);font-weight:600">تعديل ${esc(label)}</p>
        <input id="_edit-val" value="${esc(oldVal || '')}" style="width:100%;padding:9px 11px;background:var(--bg-1,#0d1117);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:.9rem;margin-bottom:16px;box-sizing:border-box">
        <div style="display:flex;justify-content:flex-end;gap:10px">
          <button id="_ev-cancel" class="btn btn-secondary" style="min-width:70px">إلغاء</button>
          <button id="_ev-save"   class="btn btn-primary"   style="min-width:70px">حفظ</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const inp = overlay.querySelector('#_edit-val');
    inp.focus(); inp.select();
    const cleanup = val => { overlay.remove(); resolve(val); };
    overlay.querySelector('#_ev-cancel').onclick = () => cleanup(null);
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(null); });
    overlay.querySelector('#_ev-save').onclick = () => cleanup(inp.value.trim() || null);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') cleanup(inp.value.trim() || null); if (e.key === 'Escape') cleanup(null); });
  });
  if (!newVal || newVal === oldVal) return;
  const { error } = await supabaseClient.from('user_stocks').update({ [field]: newVal }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم التعديل ✓', 'success');
  await loadAll();
}

function renderTable() {
  const tbody = document.getElementById('stocks-tbody');
  const countEl = document.getElementById('stocks-count');
  if (countEl) countEl.textContent = userStocks.length ? `${userStocks.length} سهم` : '';

  if (!userStocks.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">🗂️</div><p>لا توجد أسهم مسجلة بعد — أضف أول سهم من الأعلى</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = userStocks.map(s => {
    const inPortfolio = holdings.includes(s.ticker);
    const badgeHtml   = inPortfolio
      ? `<span class="badge badge-active">✓ في المحفظة</span>`
      : `<span class="badge" style="background:rgba(100,100,100,0.15);color:var(--text-muted)">خارج المحفظة</span>`;
    return `<tr>
      <td><strong class="text-accent">${esc(s.ticker)}</strong></td>
      <td style="cursor:pointer" title="انقر للتعديل" onclick="editStock('${esc(s.id)}','name','${esc(s.name)}')">${esc(s.name)}</td>
      <td style="cursor:pointer" title="انقر للتعديل" onclick="editStockSector('${esc(s.id)}','${esc(s.sector)}')">${esc(s.sector)}</td>
      <td>${badgeHtml}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteStock('${esc(s.id)}','${esc(s.ticker)}')">حذف</button></td>
    </tr>`;
  }).join('');
}

async function editStockSector(id, currentSector) {
  // نستخدم select بدل prompt لضمان توحيد القطاعات
  const opts = OFFICIAL_SECTORS.map(s => `<option value="${s}" ${s===currentSector?'selected':''}>${s}</option>`).join('');
  const div = document.createElement('div');
  div.id = 'sector-edit-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center';
  div.innerHTML = `
    <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px;min-width:300px">
      <p style="margin-bottom:12px;font-weight:700">تعديل القطاع</p>
      <select id="sector-edit-select" style="width:100%;padding:10px;background:var(--bg-3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:inherit;margin-bottom:16px">${opts}</select>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn btn-secondary" onclick="document.getElementById('sector-edit-overlay').remove()">إلغاء</button>
        <button class="btn btn-primary" onclick="saveSectorEdit('${id}')">حفظ</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function saveSectorEdit(id) {
  const newSector = document.getElementById('sector-edit-select').value;
  document.getElementById('sector-edit-overlay').remove();
  const { error } = await supabaseClient.from('user_stocks').update({ sector: newSector }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم تعديل القطاع ✓', 'success');
  await loadAll();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportUserStocksCSV() {
  if (!userStocks.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  exportCSV(`قاعدة_أسهمي_${todayISO()}.csv`,
    ['الرمز', 'الاسم', 'القطاع'],
    userStocks.map(s => [s.ticker, s.name, s.sector || ''])
  );
  showToast(`✓ تم تصدير ${userStocks.length} سهم`, 'success');
}

init();
