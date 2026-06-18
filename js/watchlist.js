let watchlist    = [];
let userStocks   = [];
let holdings     = [];
let sectorTargets = {};   // sector → target_pct
let editingWlId  = null;
let _baseDiv     = null;  // تنويع المحفظة الحالية (computeDiversification) — مرجع المقارنة

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-watchlist');
  await loadAll();
  renderContext();
  renderTable();
}

async function loadAll() {
  const [rWl, rUs, rH, rSec] = await Promise.all([
    supabaseClient.from('watchlist').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('user_stocks').select('ticker, name, sector'),
    supabaseClient.from('holdings').select('ticker, name, sector, shares, current_price'),
    supabaseClient.from('sector_targets').select('sector, target_pct'),
  ]);
  watchlist  = rWl.data || [];
  userStocks = rUs.data || [];
  holdings   = rH.data  || [];
  sectorTargets = {};
  (rSec.data || []).forEach(r => { sectorTargets[r.sector] = +r.target_pct; });

  // مرجع المقارنة — يُعاد حسابه من المحفظة الحية في كل تحميل (يحدّث نفسه تلقائياً)
  _baseDiv = computeDiversification(holdings.map(h => ({
    value:  +h.shares * +h.current_price,
    sector: h.sector,
    label:  h.ticker,
  })));
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

// ══════════════════════════════════════════════════════════════════════
// 🧠 محرك تحليل أثر التنويع — يحاكي إضافة السهم للمحفظة الحالية
// يستخدم نفس دالة المقياس في لوحة التحكم (computeDiversification) لضمان
// التطابق التام، ويقرأ أهداف القطاعات الحية فيتحدث تلقائياً مع أي تغيير.
// ══════════════════════════════════════════════════════════════════════
function analyzeWatchImpact(w) {
  if (!_baseDiv) return null;            // لا توجد محفظة بعد — لا مرجع للمقارنة
  const V   = _baseDiv.totalVal;
  const sec = (w.sector || '').trim() || 'غير مصنف';
  const held = holdings.find(h => h.ticker === w.ticker);

  // الوزن المخطط (نسبة من المحفظة). إن لم يُحدَّد → افترض وزناً متساوياً
  const rawPct  = +w.planned_pct || 0;
  const assumed = rawPct <= 0;
  const p = assumed ? 1 / (_baseDiv.n + 1) : Math.min(rawPct / 100, 0.9);
  if (p <= 0) return null;

  // ── بناء مراكز المحاكاة ──────────────────────────────────────
  let simPositions, addVal;
  if (held) {
    // سهم مملوك بالفعل → تجميع: نرفع وزنه إلى الهدف المخطط
    const curVal   = +held.shares * +held.current_price;
    const other    = V - curVal;
    const finalVal = p * other / (1 - p);          // قيمة تجعل وزنه النهائي = p
    addVal = Math.max(0, finalVal - curVal);
    if (addVal <= 0) addVal = V / _baseDiv.n;       // الوزن المخطط أقل من الحالي → افترض شريحة متساوية
    simPositions = holdings.map(h => ({
      value:  +h.shares * +h.current_price + (h.ticker === w.ticker ? addVal : 0),
      sector: h.sector, label: h.ticker,
    }));
  } else {
    // سهم جديد → نضيف مركزاً وزنه p
    addVal = p * V / (1 - p);
    simPositions = [
      ...holdings.map(h => ({ value: +h.shares * +h.current_price, sector: h.sector, label: h.ticker })),
      { value: addVal, sector: sec, label: w.ticker },
    ];
  }

  const after      = computeDiversification(simPositions);
  const deltaGauge = after.gaugePos - _baseDiv.gaugePos;

  // أوزان ما بعد الإضافة
  const newTotal        = V + addVal;
  const posWeightAfter  = (held ? (+held.shares * +held.current_price + addVal) : addVal) / newTotal * 100;
  const secWeightBefore = (_baseDiv.secMap[sec] || 0) * 100;
  const secWeightAfter  = (after.secMap[sec] || 0) * 100;
  const isNewSector     = !_baseDiv.secMap[sec];
  const secTarget       = +sectorTargets[sec] || 0;
  const overTarget      = secTarget > 0 && secWeightAfter > secTarget + 0.05;
  const bigPosition     = posWeightAfter > 15;     // TARGET_TOP1 = 15% (نفس معيار لوحة التحكم)

  // ── بناء الأسباب (لغة محلل) ──────────────────────────────────
  const reasons = [];
  if (deltaGauge >= 2)      reasons.push({ t: 'pos', txt: `يرفع مقياس التنويع بمقدار +${deltaGauge} نقطة (${_baseDiv.gaugePos} → ${after.gaugePos})` });
  else if (deltaGauge <= -2) reasons.push({ t: 'neg', txt: `يخفض مقياس التنويع بمقدار ${deltaGauge} نقطة (${_baseDiv.gaugePos} → ${after.gaugePos})` });
  else                       reasons.push({ t: 'neu', txt: `أثر طفيف على المقياس (${deltaGauge >= 0 ? '+' : ''}${deltaGauge} نقطة)` });

  if (isNewSector)          reasons.push({ t: 'pos', txt: `يفتح قطاعاً جديداً (${sec}) — يحسّن التنويع القطاعي ويقلّل الارتباط` });
  else if (overTarget)      reasons.push({ t: 'neg', txt: `يرفع وزن قطاع «${sec}» إلى ${secWeightAfter.toFixed(1)}% متجاوزاً هدفك ${secTarget.toFixed(1)}%` });
  else if (secTarget > 0)   reasons.push({ t: 'neu', txt: `وزن قطاع «${sec}» سيصبح ${secWeightAfter.toFixed(1)}% (هدفك ${secTarget.toFixed(1)}% — ضمن النطاق)` });
  else                      reasons.push({ t: 'neu', txt: `يُضاف إلى قطاع «${sec}» الموجود (${secWeightBefore.toFixed(1)}% → ${secWeightAfter.toFixed(1)}%)` });

  if (bigPosition)          reasons.push({ t: 'neg', txt: `مركز كبير: وزنه المخطط ${posWeightAfter.toFixed(1)}% يتجاوز 15% — قد يصبح من أكبر مراكزك ويرفع التركيز` });
  if (held)                 reasons.push({ t: 'neu', txt: `هذا السهم موجود في محفظتك — التحليل يفترض رفع وزنه إلى ${posWeightAfter.toFixed(1)}%` });

  // ── الحكم النهائي ────────────────────────────────────────────
  let verdict, label, color, icon;
  if (overTarget || bigPosition || deltaGauge <= -2) {
    if (isNewSector && deltaGauge >= 0 && !bigPosition) {
      verdict = 'caution'; label = 'إضافة بتحفّظ'; color = '#f97316'; icon = '⚠️';
    } else {
      verdict = 'negative'; label = 'يزيد التركيز'; color = '#ef4444'; icon = '🔻';
    }
  } else if (isNewSector || deltaGauge >= 2) {
    verdict = 'positive'; label = 'يحسّن التنويع'; color = '#10b981'; icon = '✅';
  } else {
    verdict = 'neutral'; label = 'أثر محايد'; color = '#84cc16'; icon = '➖';
  }

  return {
    verdict, label, color, icon, deltaGauge,
    assumed, plannedPct: p * 100, posWeightAfter,
    sec, isNewSector, secTarget, secWeightBefore, secWeightAfter, overTarget, bigPosition, held: !!held,
    before: _baseDiv, after, reasons,
  };
}

// ── شارة الأثر المختصرة (داخل الجدول) ────────────────────────
function impactBadge(w) {
  const a = analyzeWatchImpact(w);
  if (!a) return '<span class="small text-muted">—</span>';
  const deltaStr = `${a.deltaGauge >= 0 ? '+' : ''}${a.deltaGauge}`;
  return `<button onclick="openImpactModal('${esc(w.id)}')" title="اضغط لعرض التحليل المفصّل"
            style="cursor:pointer;border:1px solid ${a.color}55;background:${a.color}1a;color:${a.color};
                   border-radius:8px;padding:4px 9px;font-size:0.74rem;font-weight:700;font-family:inherit;white-space:nowrap">
            ${a.icon} ${a.label} <span style="opacity:.8;font-weight:500">· Δ${deltaStr}</span>
          </button>`;
}

// ── بطاقة سياق المحفظة الحالية (أعلى الجدول) ─────────────────
function renderContext() {
  const el = document.getElementById('wl-context');
  if (!el) return;
  if (!_baseDiv) {
    el.innerHTML = `<div class="card" style="border-right:3px solid var(--text-muted)">
      <p class="small text-muted" style="margin:0;line-height:1.7">
        💡 لا توجد أسهم في محفظتك بعد — أضف معاملات في
        <a href="transactions.html" style="color:var(--accent)">سجل المعاملات</a>
        لتفعيل تحليل أثر كل سهم مراقَب على تنويع محفظتك.
      </p></div>`;
    return;
  }
  const d = _baseDiv;
  el.innerHTML = `<div class="card" style="border-right:3px solid ${d.zoneColor}">
    <div class="section-header" style="margin-bottom:10px">
      <span class="section-title">🧩 تنويع محفظتك الحالية — مرجع المقارنة</span>
      <a href="dashboard.html" class="small" style="color:var(--accent)">المقياس الكامل ←</a>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;direction:rtl">
      <div style="font-weight:800;color:${d.zoneColor};font-size:1.05rem">${d.zoneLabel}</div>
      <div class="small text-muted">المؤشر: <strong style="color:var(--text)">${d.gaugePos}/100</strong></div>
      <div class="small text-muted">عدد فعّال: <strong style="color:var(--text)">${d.effectiveN}</strong></div>
      <div class="small text-muted">الأسهم: <strong style="color:var(--text)">${d.n}</strong></div>
      <div class="small text-muted">القطاعات: <strong style="color:var(--text)">${d.sectorCount}</strong></div>
      <div class="small text-muted">أكبر مركز: <strong style="color:var(--text)">${d.top1Pct.toFixed(1)}% (${esc(d.top1Name)})</strong></div>
    </div>
    <p class="small text-muted" style="margin:10px 0 0;line-height:1.7">
      كل سهم في القائمة يُحلَّل بمحاكاة إضافته بوزنه المخطط — والنتيجة تقارن بمقياس التنويع نفسه الموجود في لوحة التحكم.
    </p>
  </div>`;
}

// ── رسم الجدول ───────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('wl-tbody');
  if (!tbody) return;

  if (!watchlist.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
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
      <td>${impactBadge(w)}</td>
      <td class="small text-muted">${esc(w.notes || '—')}</td>
      <td class="small text-muted">${w.created_at ? new Date(w.created_at).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—'}</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="openModal('${esc(w.id)}')">تعديل</button>
          <button class="btn btn-danger btn-sm"    onclick="deleteItem('${esc(w.id)}')">حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── نافذة التحليل المفصّل ─────────────────────────────────────
function openImpactModal(id) {
  const w = watchlist.find(x => x.id === id);
  if (!w) return;
  const a = analyzeWatchImpact(w);
  if (!a) { showToast('لا توجد محفظة حالية لتحليل الأثر', 'error'); return; }

  const reasonRow = r => {
    const c = r.t === 'pos' ? '#10b981' : r.t === 'neg' ? '#ef4444' : '#8b94a8';
    const ic = r.t === 'pos' ? '▲' : r.t === 'neg' ? '▼' : '•';
    return `<li style="display:flex;gap:8px;align-items:flex-start;margin-bottom:7px;line-height:1.6">
      <span style="color:${c};font-weight:700;flex-shrink:0">${ic}</span>
      <span>${esc(r.txt)}</span></li>`;
  };

  const metric = (lbl, before, after, sameGood) => `
    <div style="background:var(--bg-2);border-radius:8px;padding:9px 8px;text-align:center">
      <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:3px">${lbl}</div>
      <div style="font-size:0.92rem;font-weight:700">
        <span style="color:var(--text-muted)">${before}</span>
        <span style="color:var(--text-muted)"> → </span>
        <span style="color:var(--text)">${after}</span>
      </div>
    </div>`;

  const secTargetStr = a.secTarget > 0 ? `هدفك ${a.secTarget.toFixed(1)}%` : 'لا هدف محدّد';
  const assumedNote  = a.assumed
    ? `<div style="background:rgba(240,180,41,0.1);border-right:3px solid #f0b429;border-radius:0 8px 8px 0;padding:8px 11px;font-size:0.76rem;color:var(--text);line-height:1.6;margin-bottom:12px;direction:rtl">
         ℹ️ لم تحدّد «النسبة المخططة» لهذا السهم — افترض التحليل وزناً متساوياً (${a.plannedPct.toFixed(1)}%). حدّد النسبة في التعديل لتحليل أدق.
       </div>`
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;max-width:540px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <div style="padding:15px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--bg);z-index:1">
        <span style="font-weight:700;font-size:.95rem">🧠 تحليل أثر إضافة ${esc(w.ticker)} — ${esc(w.name)}</span>
        <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--text-muted);padding:0 4px">✕</button>
      </div>
      <div style="padding:18px">

        <!-- الحكم -->
        <div style="background:${a.color}1a;border:1px solid ${a.color}55;border-radius:10px;padding:13px 15px;margin-bottom:16px;text-align:center">
          <div style="font-size:1.15rem;font-weight:800;color:${a.color}">${a.icon} ${a.label}</div>
          <div class="small text-muted" style="margin-top:4px">المؤشر: ${a.before.gaugePos} → ${a.after.gaugePos} (${a.deltaGauge >= 0 ? '+' : ''}${a.deltaGauge}) · المنطقة: ${a.before.zoneLabel} → ${a.after.zoneLabel}</div>
        </div>

        ${assumedNote}

        <!-- مقاييس قبل/بعد -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;direction:rtl">
          ${metric('المؤشر', a.before.gaugePos, a.after.gaugePos)}
          ${metric('عدد فعّال', a.before.effectiveN, a.after.effectiveN)}
          ${metric('الأسهم', a.before.n, a.after.n)}
          ${metric('القطاعات', a.before.sectorCount, a.after.sectorCount)}
        </div>

        <!-- القطاع -->
        <div style="background:var(--bg-2);border-radius:9px;padding:11px 13px;margin-bottom:16px;direction:rtl">
          <div class="small" style="font-weight:700;margin-bottom:5px">📊 قطاع «${esc(a.sec)}»${a.isNewSector ? ' <span style="color:#10b981">— قطاع جديد!</span>' : ''}</div>
          <div class="small text-muted" style="line-height:1.7">
            الوزن: ${a.secWeightBefore.toFixed(1)}% → <strong style="color:${a.overTarget ? '#ef4444' : 'var(--text)'}">${a.secWeightAfter.toFixed(1)}%</strong> · ${secTargetStr}
          </div>
        </div>

        <!-- الأسباب -->
        <div style="direction:rtl">
          <div class="small" style="font-weight:700;margin-bottom:9px">لماذا هذا الحكم؟</div>
          <ul style="list-style:none;padding:0;margin:0;font-size:0.84rem;color:var(--text)">
            ${a.reasons.map(reasonRow).join('')}
          </ul>
        </div>

        <p class="small text-muted" style="margin-top:16px;line-height:1.7;direction:rtl;border-top:1px solid var(--border);padding-top:12px">
          المقياس مبني على HHI (Evans & Archer 1968) ومعامل تنويع القطاعات — نفس منهجية لوحة التحكم. هذا تحليل حسابي للتنويع فقط، وليس توصية بالشراء.
        </p>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); } });
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

  if (!await confirmAsync(editingWlId ? `هل تريد حفظ التعديلات على ${ticker}؟` : `هل تريد إضافة ${ticker} لقائمة المراقبة؟`)) return;

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
  renderContext();
  renderTable();
}

async function deleteItem(id) {
  if (!await confirmAsync('هل أنت متأكد من الحذف؟')) return;
  const { error } = await supabaseClient.from('watchlist').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await loadAll();
  renderContext();
  renderTable();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportWatchlistCSV() {
  if (!watchlist.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  exportCSV(`قائمة_مراقبة_${todayISO()}.csv`,
    ['الرمز', 'الاسم', 'القطاع', 'سعر الدخول المستهدف', 'النسبة المخططة %', 'أثر التنويع', 'ملاحظات', 'تاريخ الإضافة'],
    watchlist.map(w => {
      const a = analyzeWatchImpact(w);
      const impact = a ? `${a.label} (Δ${a.deltaGauge >= 0 ? '+' : ''}${a.deltaGauge})` : '—';
      return [w.ticker, w.name, w.sector || '', w.target_price || 0, w.planned_pct || 0, impact, w.notes || '', w.created_at ? new Date(w.created_at).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''];
    })
  );
  showToast(`✓ تم تصدير ${watchlist.length} سهم`, 'success');
}

init();
