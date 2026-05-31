let watchlist    = [];
let userStocks   = [];
let editingWlId  = null;

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-watchlist');
  await loadAll();
  renderTable();
}

async function loadAll() {
  const [rWl, rUs] = await Promise.all([
    supabaseClient.from('watchlist').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('user_stocks').select('ticker, name, sector')
  ]);
  watchlist  = rWl.data || [];
  userStocks = rUs.data || [];
}

// ── ملء الاسم والقطاع تلقائياً عند إدخال الرمز ──────────────
function onTickerInput() {
  const ticker = document.getElementById('wl-ticker').value.trim().toUpperCase();
  document.getElementById('wl-ticker').value = ticker;
  const stock = userStocks.find(s => s.ticker === ticker);
  if (stock) {
    document.getElementById('wl-name').value   = stock.name;
    document.getElementById('wl-sector').value = stock.sector;
  } else {
    // جرب TICKER_DB كاحتياطي
    const fallback = typeof lookupTicker === 'function' ? lookupTicker(ticker) : null;
    if (fallback) {
      document.getElementById('wl-name').value   = fallback.name;
      document.getElementById('wl-sector').value = fallback.sector || '';
    }
  }
}

// ── رسم الجدول ───────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('wl-tbody');
  if (!tbody) return;

  if (!watchlist.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
      <div class="icon">👁️</div>
      <p>لا توجد أسهم تحت المراقبة — أضف أول سهم</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = watchlist.map(w => {
    const tpStr = w.target_price > 0 ? formatSAR(w.target_price) : '—';
    const ppStr = w.planned_pct  > 0 ? w.planned_pct.toFixed(1) + '%' : '—';
    return `<tr>
      <td><strong class="text-accent">${esc(w.ticker)}</strong></td>
      <td>${esc(w.name)}</td>
      <td class="small text-muted">${esc(w.sector || '—')}</td>
      <td class="num">${tpStr}</td>
      <td class="num text-accent">${ppStr}</td>
      <td class="small text-muted">${esc(w.notes || '—')}</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="openModal('${esc(w.id)}')">تعديل</button>
          <button class="btn btn-danger btn-sm"    onclick="deleteItem('${esc(w.id)}')">حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(id = null) {
  editingWlId = id;
  document.getElementById('wl-modal-title').textContent = id ? 'تعديل السهم' : 'إضافة سهم للمراقبة';
  if (id) {
    const w = watchlist.find(x => x.id === id);
    if (!w) return;
    document.getElementById('wl-ticker').value       = w.ticker;
    document.getElementById('wl-name').value         = w.name;
    document.getElementById('wl-sector').value       = w.sector || '';
    document.getElementById('wl-target-price').value = w.target_price || '';
    document.getElementById('wl-planned-pct').value  = w.planned_pct  || '';
    document.getElementById('wl-notes').value        = w.notes || '';
  } else {
    document.getElementById('wl-form').reset();
  }
  document.getElementById('wl-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('wl-modal').style.display = 'none';
  editingWlId = null;
}

// ── حفظ ───────────────────────────────────────────────────────
async function saveItem(e) {
  e.preventDefault();
  const { data: { user } } = await supabaseClient.auth.getUser();

  const ticker = document.getElementById('wl-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('wl-name').value.trim();

  if (!ticker || !name) { showToast('الرمز والاسم مطلوبان', 'error'); return; }

  // منع التكرار (إلا في وضع التعديل)
  if (!editingWlId) {
    const dup = watchlist.find(w => w.ticker === ticker);
    if (dup) { showToast(`⛔ الرمز ${ticker} موجود بالفعل في قائمة المراقبة`, 'error'); return; }
  }

  const payload = {
    user_id:      user.id,
    ticker,
    name,
    sector:       document.getElementById('wl-sector').value.trim(),
    target_price: +document.getElementById('wl-target-price').value || 0,
    planned_pct:  +document.getElementById('wl-planned-pct').value  || 0,
    notes:        document.getElementById('wl-notes').value.trim()
  };

  let error;
  if (editingWlId) ({ error } = await supabaseClient.from('watchlist').update(payload).eq('id', editingWlId));
  else             ({ error } = await supabaseClient.from('watchlist').insert([payload]));

  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editingWlId ? 'تم التحديث ✓' : 'تمت الإضافة ✓', 'success');
  closeModal();
  await loadAll();
  renderTable();
}

async function deleteItem(id) {
  if (!confirm('هل أنت متأكد من الحذف؟')) return;
  const { error } = await supabaseClient.from('watchlist').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await loadAll();
  renderTable();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportWatchlistCSV() {
  if (!watchlist.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  exportCSV(`قائمة_مراقبة_${todayISO()}.csv`,
    ['الرمز', 'الاسم', 'القطاع', 'سعر الدخول المستهدف', 'النسبة المخططة %', 'ملاحظات'],
    watchlist.map(w => [w.ticker, w.name, w.sector || '', w.target_price || 0, w.planned_pct || 0, w.notes || ''])
  );
  showToast(`✓ تم تصدير ${watchlist.length} سهم`, 'success');
}

init();
