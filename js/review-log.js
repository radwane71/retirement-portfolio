'use strict';

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'review-log': {
    title: '📒 دفتر المراجعة',
    body: `
      <p>سجلّ دوري تكتب فيه مراجعتك لكل سهم (كل ربع/نصف سنة): هل ما زالت أسباب شرائك قائمة؟ هل تغيّرت الشركة؟</p>
      <p class="info-note">💡 أكبر خطأ هو «اشترِ وانسَ». التدوين الدوري يكشف الأسهم التي تدهورت أساسياتها مبكراً، ويمنعك من تبرير قرار قديم بالعاطفة. أرفق صورة القوائم المالية إن أردت توثيقاً.</p>`
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
// حالة امتلاء المرفقات — نسبة → حالة تصميمية (اللون يتبع الحالة لا العكس)
function fillState(pct) { return pct > 90 ? 'bad' : pct > 70 ? 'warn' : 'good'; }

// ── State ──────────────────────────────────────────────────────────────────
let entries      = [];   // review_log rows
let attachMap    = {};   // { entry_id: [attachment rows — بيانات وصفية فقط، بلا content] }
let holdingsList = [];   // holdings (ticker, name) — لشارة «مستحق للمراجعة»
let pendingFiles = [];   // ملفات الإضافة المعلّقة (قبل الحفظ)
let editPendingFiles = []; // ملفات التعديل المعلّقة
let currentUser  = null;

const REVIEW_DUE_DAYS = 180; // دورة المراجعة النصف سنوية (الدستور §5)

const MAX_TOTAL_BYTES   = 2 * 1024 * 1024; // 2MB إجمالي لكل إدخال
const MAX_FILES_ENTRY   = 10;              // أقصى عدد مرفقات لكل إدخال
const ALLOWED_EXTS      = ['txt', 'md', 'xlsx', 'csv'];

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  currentUser = await requireAuth();
  if (!currentUser) return;
  setActiveNav('nav-review-log');
  document.getElementById('rl-date').value = todayISO();
  await loadData();
  renderTable();
}

async function loadData() {
  const uid = currentUser?.id;
  if (!uid) return;

  setStatus('جارٍ التحميل…');

  const [rEntries, rAtts, rHold] = await Promise.all([
    supabaseClient.from('review_log')
      .select('*')
      .eq('user_id', uid)                          // صريح — لا نعتمد على RLS وحده
      .order('review_date', { ascending: false }),
    // AUDIT-FIX (2026-08): الأعمدة الوصفية فقط — content (base64) كان يُحمَّل
    // كاملاً عند كل فتح؛ الآن يُجلب عند طلب التنزيل فقط (استعلام منفرد).
    supabaseClient.from('review_log_attachments')
      .select('id, entry_id, filename, ext, size_bytes, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: true }),
    // AUDIT-FIX (2026-08): shares مضافة — تُستبعد المراكز المصفّاة من عدّاد الاستحقاق
    supabaseClient.from('holdings').select('ticker, name, shares'),  // لشارة «مستحق للمراجعة»
  ]);

  // جدول غير موجود — Migration لم تُشغَّل بعد
  if (rEntries.error?.code === '42P01') {
    setStatus('⚠️ الجداول غير موجودة في قاعدة البيانات — يرجى تشغيل migration SQL من إعدادات المشروع', 'error');
    showToast('الجداول غير موجودة — شغّل migration SQL أولاً', 'error');
    return;
  }

  if (rEntries.error) {
    setStatus('خطأ في التحميل: ' + rEntries.error.message, 'error');
    showToast('خطأ: ' + rEntries.error.message, 'error');
    return;
  }

  entries = rEntries.data || [];
  holdingsList = rHold.error ? [] : (rHold.data || []);

  // بناء خريطة المرفقات { entry_id → [atts] }
  attachMap = {};
  (rAtts.data || []).forEach(a => {
    if (!attachMap[a.entry_id]) attachMap[a.entry_id] = [];
    attachMap[a.entry_id].push(a);
  });

  setStatus('');
}

function setStatus(msg, type = 'info') {
  let el = document.getElementById('rl-status');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  el.className = 'backup-status status-' + type;
}

// ── Auto-fill ticker ───────────────────────────────────────────────────────
function onTickerInput() {
  const el = document.getElementById('rl-ticker');
  el.value = el.value.toUpperCase();
  const ticker = el.value.trim();
  if (!ticker) return;
  const official = (typeof lookupTicker === 'function') ? lookupTicker(ticker) : null;
  const name   = official?.name   || (typeof TICKER_DB !== 'undefined' ? TICKER_DB[ticker] : null);
  const sector = official?.sector || null;
  // FIX: always update when ticker changes — don't keep stale name from previous ticker
  if (name)   document.getElementById('rl-name').value   = name;
  if (sector) document.getElementById('rl-sector').value = sector;
}

// ── File handling ──────────────────────────────────────────────────────────
function getExt(filename) { return filename.split('.').pop().toLowerCase(); }

function onFilesSelected(fileList) {
  processFiles(fileList, pendingFiles, 'attach-preview');
}
function onEditFilesSelected(fileList) {
  const entryId = document.getElementById('edit-id').value;
  processFiles(
    fileList, editPendingFiles, 'edit-attach-preview',
    savedAttachmentsCountFor(entryId),
    savedAttachmentsSizeFor(entryId)
  );
}

// حساب الحجم الإجمالي للمرفقات المحفوظة مسبقاً لإدخال معين (وضع التعديل)
function savedAttachmentsSizeFor(entryId) {
  return (attachMap[entryId] || []).reduce((s, a) => s + (a.size_bytes || 0), 0);
}
function savedAttachmentsCountFor(entryId) {
  return (attachMap[entryId] || []).length;
}

function processFiles(fileList, bucket, previewId, existingCount = 0, existingBytes = 0) {
  const files = Array.from(fileList);
  let currentCount = existingCount + bucket.length;
  let currentBytes = existingBytes + bucket.reduce((s, f) => s + (f.size_bytes || 0), 0);

  files.forEach(file => {
    const ext = getExt(file.name);
    if (!ALLOWED_EXTS.includes(ext)) {
      showToast(`${file.name}: نوع غير مدعوم — يُقبل txt, md, xlsx, csv فقط`, 'error'); return;
    }
    if (currentCount >= MAX_FILES_ENTRY) {
      showToast(`الحد الأقصى ${MAX_FILES_ENTRY} مرفقات لكل إدخال`, 'error'); return;
    }
    if (currentBytes + file.size > MAX_TOTAL_BYTES) {
      const remaining = MAX_TOTAL_BYTES - currentBytes;
      showToast(`${file.name}: تجاوز الحد — المتبقي ${formatBytes(remaining)}`, 'error'); return;
    }
    currentCount++;
    currentBytes += file.size;
    const reader = new FileReader();
    reader.onload = e => {
      bucket.push({ filename: file.name, ext, content: e.target.result, size_bytes: file.size });
      renderFilePreviews(bucket, previewId, existingCount, existingBytes);
    };
    if (ext === 'xlsx') reader.readAsDataURL(file);
    else                reader.readAsText(file, 'utf-8');
  });
}

function renderFilePreviews(bucket, previewId, existingCount = 0, existingBytes = 0) {
  const el = document.getElementById(previewId);
  if (!el) return;
  const totalCount = existingCount + bucket.length;
  const totalBytes = existingBytes + bucket.reduce((s, f) => s + (f.size_bytes || 0), 0);
  const pct        = Math.round(totalBytes / MAX_TOTAL_BYTES * 100);

  const chips = bucket.map((f, i) => `
    <span class="attach-chip">
      ${fileIcon(f.ext)} ${esc(f.filename)}
      <span class="chip-size">(${formatBytes(f.size_bytes)})</span>
      <button onclick="removePending(${i},'${esc(previewId)}')" title="إزالة">×</button>
    </span>`).join('');

  const summary = bucket.length
    ? `<div class="attach-meter">${meterHtml({
        label: `${totalCount} / ${MAX_FILES_ENTRY} مرفق`,
        valueTxt: `${formatBytes(totalBytes)} / ${formatBytes(MAX_TOTAL_BYTES)}`,
        pct,
        state: fillState(pct),
        foot: pct > 90 ? '⚠️ اقتربت من حد الحجم' : '',
      })}</div>`
    : '';

  el.innerHTML = chips + summary;
}

function removePending(idx, previewId) {
  const bucket = previewId === 'attach-preview' ? pendingFiles : editPendingFiles;
  bucket.splice(idx, 1);
  // AUDIT-FIX (2026-08): في وضع التعديل مرّر عدّاد/حجم المرفقات المحفوظة —
  // كما في onEditFilesSelected — وإلا يظهر شريط الحجم أقل من الحقيقة بعد الحذف.
  if (previewId === 'edit-attach-preview') {
    const entryId = document.getElementById('edit-id').value;
    renderFilePreviews(bucket, previewId, savedAttachmentsCountFor(entryId), savedAttachmentsSizeFor(entryId));
  } else {
    renderFilePreviews(bucket, previewId);
  }
}

// ── Drag & Drop ────────────────────────────────────────────────────────────
function onDragOver(e)  { e.preventDefault(); document.getElementById('attach-zone').classList.add('dragover'); }
function onDragLeave()  { document.getElementById('attach-zone').classList.remove('dragover'); }
function onDrop(e) {
  e.preventDefault();
  document.getElementById('attach-zone').classList.remove('dragover');
  onFilesSelected(e.dataTransfer.files);
}

// ── Save new entry ─────────────────────────────────────────────────────────
async function saveEntry() {
  const ticker = document.getElementById('rl-ticker').value.trim().toUpperCase();
  const date   = document.getElementById('rl-date').value;
  if (!ticker) { showToast('أدخل رمز السهم', 'error'); return; }
  if (!date)   { showToast('حدد تاريخ المراجعة', 'error'); return; }
  if (pendingFiles.length > MAX_FILES_ENTRY) {
    showToast(`الحد الأقصى ${MAX_FILES_ENTRY} مرفقات`, 'error'); return;
  }
  const totalSize = pendingFiles.reduce((s, f) => s + (f.size_bytes || 0), 0);
  if (totalSize > MAX_TOTAL_BYTES) {
    showToast(`الحجم الكلي ${formatBytes(totalSize)} يتجاوز الحد (${formatBytes(MAX_TOTAL_BYTES)})`, 'error'); return;
  }

  const btn = document.querySelector('[onclick="saveEntry()"]');
  btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';

  try {
    // 1. أدخل المراجعة
    const { data: inserted, error: eEntry } = await supabaseClient
      .from('review_log')
      .insert({
        user_id:     currentUser.id,
        ticker,
        name:        document.getElementById('rl-name').value.trim()   || null,
        sector:      document.getElementById('rl-sector').value.trim() || null,
        review_date: date,
        notes:       document.getElementById('rl-notes').value.trim()  || null,
        updated_at:  new Date().toISOString(),
      })
      .select()
      .single();

    if (eEntry) throw eEntry;

    // 2. أدخل المرفقات إن وجدت
    if (pendingFiles.length) {
      const attRows = pendingFiles.map(f => ({
        entry_id:   inserted.id,
        user_id:    currentUser.id,
        filename:   f.filename,
        ext:        f.ext,
        content:    f.content,
        size_bytes: f.size_bytes,
      }));
      const { error: eAtt } = await supabaseClient
        .from('review_log_attachments').insert(attRows);
      if (eAtt) throw eAtt;
    }

    showToast('✅ تمت إضافة المراجعة', 'success');
    resetForm();
    await loadData();
    renderTable();

  } catch (err) {
    showToast('خطأ: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '💾 حفظ المراجعة';
  }
}

function resetForm() {
  ['rl-ticker','rl-name','rl-sector','rl-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('rl-date').value  = todayISO();
  document.getElementById('rl-files').value = '';
  pendingFiles = [];
  renderFilePreviews(pendingFiles, 'attach-preview');
}

// ── Delete entry ───────────────────────────────────────────────────────────
async function deleteEntry(id) {
  if (!await confirmAsync('هل تريد حذف هذه المراجعة وجميع مرفقاتها نهائياً؟')) return;

  // احذف المرفقات أولاً (FK children) قبل الإدخال الأصل
  const { error: attErr } = await supabaseClient
    .from('review_log_attachments')
    .delete()
    .eq('entry_id', id)
    .eq('user_id', currentUser.id);
  if (attErr && attErr.code !== '42P01') {
    showToast('خطأ في حذف المرفقات: ' + attErr.message, 'error'); return;
  }

  const { error } = await supabaseClient.from('review_log').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) { showToast('خطأ في الحذف: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  await loadData();
  renderTable();
}

// ── Delete single attachment ───────────────────────────────────────────────
async function removeExistingAtt(attId) {
  // AUDIT-FIX (2026-08): eq('user_id') توحيداً للنمط الدفاعي (لا اعتماد على RLS وحده)
  const { error } = await supabaseClient
    .from('review_log_attachments').delete().eq('id', attId).eq('user_id', currentUser.id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  await loadData();
  // تحديث المعاينة داخل المودال
  const entryId = document.getElementById('edit-id').value;
  renderEditExistingAtts(entryId);
}

// ── Edit modal ─────────────────────────────────────────────────────────────
function openEdit(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  editPendingFiles = [];
  document.getElementById('edit-id').value     = id;
  document.getElementById('edit-ticker').value = e.ticker      || '';
  document.getElementById('edit-name').value   = e.name        || '';
  document.getElementById('edit-sector').value = e.sector      || '';
  document.getElementById('edit-date').value   = e.review_date || '';
  document.getElementById('edit-notes').value  = e.notes       || '';
  renderEditExistingAtts(id);
  renderFilePreviews(editPendingFiles, 'edit-attach-preview');
  document.getElementById('edit-modal').classList.add('open');
}

function renderEditExistingAtts(entryId) {
  const el   = document.getElementById('edit-attach-preview');
  if (!el) return;
  const atts  = attachMap[entryId] || [];
  const total = atts.reduce((s, a) => s + (a.size_bytes || 0), 0);
  const pct   = Math.round(total / MAX_TOTAL_BYTES * 100);

  const chips = atts.map(a => `
    <span class="attach-chip saved">
      ${fileIcon(a.ext)} ${esc(a.filename)}
      <span class="chip-size">(${formatBytes(a.size_bytes||0)})</span>
      <button onclick="removeExistingAtt('${esc(a.id)}')" title="حذف المرفق">×</button>
    </span>`).join('');

  const summary = atts.length
    ? `<div class="attach-meter">${meterHtml({
        label: `محفوظ: ${atts.length} / ${MAX_FILES_ENTRY} مرفق`,
        valueTxt: `${formatBytes(total)} / ${formatBytes(MAX_TOTAL_BYTES)}`,
        pct,
        state: fillState(pct),
      })}</div>`
    : '';

  el.innerHTML = chips + summary;
}

async function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const ticker = document.getElementById('edit-ticker').value.trim().toUpperCase();
  const date   = document.getElementById('edit-date').value;
  if (!ticker) { showToast('أدخل رمز السهم', 'error'); return; }
  if (!date)   { showToast('حدد تاريخ المراجعة', 'error'); return; }

  const btn = document.querySelector('[onclick="saveEdit()"]');
  btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';

  try {
    // 1. تحديث المراجعة — نُضيف eq('user_id') للأمان
    const { error: eUp } = await supabaseClient
      .from('review_log')
      .update({
        ticker,
        name:        document.getElementById('edit-name').value.trim()   || null,
        sector:      document.getElementById('edit-sector').value.trim() || null,
        review_date: date,
        notes:       document.getElementById('edit-notes').value.trim()  || null,
        updated_at:  new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', currentUser.id);
    if (eUp) throw eUp;

    // 2. إضافة المرفقات الجديدة
    if (editPendingFiles.length) {
      const attRows = editPendingFiles.map(f => ({
        entry_id:   id,
        user_id:    currentUser.id,
        filename:   f.filename,
        ext:        f.ext,
        content:    f.content,
        size_bytes: f.size_bytes,
      }));
      const { error: eAtt } = await supabaseClient
        .from('review_log_attachments').insert(attRows);
      if (eAtt) throw eAtt;
    }

    showToast('✅ تم حفظ التعديلات', 'success');
    closeModal();
    await loadData();
    renderTable();

  } catch (err) {
    showToast('خطأ: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '💾 حفظ التعديلات';
  }
}

function closeModal() {
  document.getElementById('edit-modal').classList.remove('open');
  editPendingFiles = [];
}
function closeModalOutside(e) {
  if (e.target.id === 'edit-modal') closeModal();
}

// ── Download ───────────────────────────────────────────────────────────────
// AUDIT-FIX (2026-08): content لم يعد يُحمَّل مع الصفحة — يُجلب هنا عند طلب
// التنزيل فقط (استعلام منفرد) ويُخزَّن مؤقتاً على السجل لتفادي إعادة الجلب.
async function ensureAttContent(att) {
  if (att.content != null) return true;
  const { data, error } = await supabaseClient
    .from('review_log_attachments')
    .select('content')
    .eq('id', att.id)
    .eq('user_id', currentUser.id)
    .single();
  if (error || !data) { showToast('تعذّر جلب المرفق: ' + (error?.message || 'غير موجود'), 'error'); return false; }
  att.content = data.content;
  return true;
}

async function downloadAtt(attId) {
  // البحث في جميع المرفقات المحمّلة
  let att = null;
  for (const list of Object.values(attachMap)) {
    att = list.find(a => a.id === attId);
    if (att) break;
  }
  if (!att) return;
  if (!await ensureAttContent(att)) return;
  triggerDownload(att);
}

function triggerDownload(att) {
  const a = document.createElement('a');
  a.download = att.filename;
  if (att.ext === 'xlsx') {
    a.href = att.content; // base64 dataURL
  } else {
    const blob = new Blob([att.content], { type: 'text/plain;charset=utf-8' });
    a.href = URL.createObjectURL(blob);
  }
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  if (a.href.startsWith('blob:')) URL.revokeObjectURL(a.href);
}

// ── Download all for one entry ────────────────────────────────────────────
async function downloadAllForEntry(entryId) {
  const atts = attachMap[entryId] || [];
  if (!atts.length) return;
  let ok = 0;
  for (const att of atts) {
    await new Promise(r => setTimeout(r, 150));
    if (!await ensureAttContent(att)) continue;
    triggerDownload(att);
    ok++;
  }
  showToast(`✅ تم تنزيل ${ok} مرفق`, 'success');
}

// ── Bulk export ────────────────────────────────────────────────────────────
function getSelectedIds() {
  return [...document.querySelectorAll('.rl-row-check:checked')].map(c => c.dataset.id);
}

function toggleSelectAll(checked) {
  document.querySelectorAll('.rl-row-check').forEach(c => c.checked = checked);
  updateSelectedCount();
}

function updateSelectedCount() {
  const ids = getSelectedIds();
  const countEl = document.getElementById('selected-count');
  const btnEl   = document.getElementById('btn-export-sel');
  if (!ids.length) {
    countEl.textContent = 'لا يوجد تحديد'; btnEl.disabled = true; return;
  }
  const totalAtts = ids.reduce((s, id) => s + (attachMap[id]?.length || 0), 0);
  countEl.textContent = `${ids.length} مراجعة محددة — ${totalAtts} مرفق`;
  btnEl.disabled = totalAtts === 0;
  const allChecks = document.querySelectorAll('.rl-row-check');
  document.getElementById('select-all').checked =
    allChecks.length > 0 && [...allChecks].every(c => c.checked);
}

async function exportSelected() {
  const ids = getSelectedIds();
  let downloaded = 0;
  for (const id of ids) {
    for (const att of (attachMap[id] || [])) {
      await new Promise(r => setTimeout(r, 150));
      if (!await ensureAttContent(att)) continue;
      triggerDownload(att);
      downloaded++;
    }
  }
  if (!downloaded) showToast('لا توجد مرفقات في المراجعات المحددة', 'error');
  else showToast(`✅ تم تصدير ${downloaded} مرفق`, 'success');
}

// ── شارة «مستحق للمراجعة» (الدستور §5: دورة روتينية كل 6 أشهر) ─────────────
// يقارن آخر review_date لكل رمز مملوك بعتبة 180 يوماً — سهم لم يُراجع قط يُعد مستحقاً.
function renderDueBadge() {
  const el = document.getElementById('rl-due-banner');
  if (!el) return;

  // AUDIT-FIX (2026-08): إزالة تكرار الرمز واستبعاد المراكز المصفّاة —
  // صف حيازة مكرر أو بكمية صفر كان يضخّم عدّاد «مستحق للمراجعة».
  const owned = new Map();
  holdingsList.forEach(h => {
    const tk = (h.ticker || '').trim().toUpperCase();
    if (!tk) return;
    if (h.shares != null && !(+h.shares > 0)) return;   // مركز مصفّى — ليس مملوكاً
    if (!owned.has(tk)) owned.set(tk, h);
  });

  if (!owned.size) { el.style.display = 'none'; el.innerHTML = ''; return; }

  const lastByTicker = {};
  entries.forEach(e => {
    const tk = (e.ticker || '').trim().toUpperCase();
    if (!tk || !e.review_date) return;
    if (!lastByTicker[tk] || e.review_date > lastByTicker[tk]) lastByTicker[tk] = e.review_date;
  });

  const now = Date.now();
  const all = [...owned.values()];
  const due = [], never = [];
  all.forEach(h => {
    const tk = (h.ticker || '').trim().toUpperCase();
    const last = lastByTicker[tk];
    if (!last) { never.push(h); due.push(h); return; }   // لم يُراجع قط → مستحق
    const t = new Date(last).getTime();
    if (!isFinite(t) || (now - t) > REVIEW_DUE_DAYS * 86400000) due.push(h);
  });

  const total   = all.length;
  const current = total - due.length;
  const pct     = total > 0 ? current / total * 100 : 0;

  el.style.display = 'block';

  const meter = meterHtml({
    label: 'أسهم مملوكة ضمن الدورة',
    valueTxt: `${current} / ${total}`,
    pct,
    state: due.length === 0 ? 'good' : pct >= 60 ? 'warn' : 'bad',
    foot: `الدورة الروتينية ${REVIEW_DUE_DAYS} يوماً (الدستور §5) — سهم بلا مراجعة مسجّلة يُعدّ مستحقاً`,
  });

  if (!due.length) {
    el.innerHTML =
      `<div class="card rl-due-card">
        ${cardHead('🗓️ دورة المراجعة النصف سنوية', `${total} سهم مملوك`, tagHtml('✅', 'الدورة مكتملة', 'good'))}
        <div class="stack">
          ${meter}
          ${noteHtml('✅', `كل أسهمك المملوكة رُوجعت خلال آخر ${REVIEW_DUE_DAYS} يوماً.`, 'good')}
        </div>
      </div>`;
    return;
  }

  const chips = due.map(h => {
    const tk = esc(h.ticker);
    const neverSeen = !lastByTicker[(h.ticker || '').trim().toUpperCase()];
    return `<button type="button" class="rl-due-chip" data-ticker="${tk}"
      onclick="fillTickerFromChip(this)"
      title="${esc(h.name || '')} — ${neverSeen ? 'لا مراجعة مسجّلة' : 'آخر مراجعة أقدم من ' + REVIEW_DUE_DAYS + ' يوماً'}. انقر لتعبئة النموذج">
      ${neverSeen ? '🆕' : '⏰'} ${tk}</button>`;
  }).join('');

  el.innerHTML =
    `<div class="card rl-due-card">
      ${cardHead('🗓️ دورة المراجعة النصف سنوية', `${total} سهم مملوك`,
        tagHtml('⏰', `${due.length} مستحق`, 'warn'))}
      <div class="stack">
        <div>
          <div class="hero-num">${due.length}<span class="unit">من ${total}</span></div>
          <div class="hero-cap">أسهم مملوكة مستحقة للمراجعة الآن</div>
        </div>
        ${meter}
        ${never.length ? noteHtml('🆕',
          `<b>${never.length} سهم بلا أي مراجعة مسجّلة</b> — ابدأ بها، فهي أعلى الفجوات خطراً في الدستور §5.`, 'warn') : ''}
        <div class="rl-due-chips">${chips}</div>
      </div>
    </div>`;
}

// نقل الرمز من الشارة إلى النموذج — البيانات عبر data-* لا داخل نص onclick
function fillTickerFromChip(btn) {
  const t = btn?.dataset?.ticker || '';
  const input = document.getElementById('rl-ticker');
  if (!input) return;
  input.value = t;
  onTickerInput();
  input.focus();
}

// ── Filters ────────────────────────────────────────────────────────────────
// تصفية عرضية بحتة على المصفوفة المحمّلة — لا استعلام جديد ولا تعديل بيانات
function getFilteredEntries() {
  const q = (document.getElementById('rl-q')?.value || '').trim().toLowerCase();
  const tk = (document.getElementById('rl-flt-ticker')?.value || '').trim().toUpperCase();
  return entries.filter(e => {
    if (tk && (e.ticker || '').trim().toUpperCase() !== tk) return false;
    if (!q) return true;
    return [e.ticker, e.name, e.sector, e.notes]
      .some(v => String(v || '').toLowerCase().includes(q));
  });
}

function buildTickerFilter() {
  const sel = document.getElementById('rl-flt-ticker');
  if (!sel) return;
  const cur  = sel.value;
  const list = [...new Set(entries.map(e => (e.ticker || '').trim().toUpperCase()).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">كل الرموز</option>' +
    list.map(t => `<option value="${esc(t)}"${t === cur ? ' selected' : ''}>${esc(t)}</option>`).join('');
}

function applyRlFilter() { renderTable(); }

function clearRlFilter() {
  const q = document.getElementById('rl-q');   if (q) q.value = '';
  const s = document.getElementById('rl-flt-ticker'); if (s) s.value = '';
  renderTable();
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderTable() {
  renderDueBadge();   // الشارة تُحدَّث مع كل إعادة رسم (إضافة/تعديل/حذف مراجعة)
  buildTickerFilter();
  const wrap = document.getElementById('rl-table-wrap');
  if (!entries.length) {
    wrap.innerHTML = `<div class="empty-rl"><div class="e-icon">📒</div>
      <p>لا توجد مراجعات بعد — أضف أول تقييم من النموذج أعلاه</p></div>`;
    updateSelectedCount();
    return;
  }

  const list = getFilteredEntries();
  const filterInfo = document.getElementById('rl-filter-info');
  if (filterInfo) {
    filterInfo.innerHTML = list.length === entries.length
      ? `<span class="small text-muted">${entries.length} مراجعة</span>`
      : tagHtml('🔍', `${list.length} من ${entries.length} مراجعة`, '');
  }

  if (!list.length) {
    wrap.innerHTML = `<div class="empty-rl"><div class="e-icon">🔍</div>
      <p>لا مراجعة تطابق التصفية — <button class="btn btn-secondary btn-sm" onclick="clearRlFilter()">مسح التصفية</button></p></div>`;
    updateSelectedCount();
    return;
  }

  // آخر مراجعة لكل رمز — لتمييز الصف الأحدث ووسم قِدم المراجعة
  const lastByTicker = {};
  entries.forEach(e => {
    const tk = (e.ticker || '').trim().toUpperCase();
    if (!tk || !e.review_date) return;
    if (!lastByTicker[tk] || e.review_date > lastByTicker[tk]) lastByTicker[tk] = e.review_date;
  });
  const now = Date.now();

  const rows = list.map(e => {
    const id   = esc(e.id);
    const atts = attachMap[e.id] || [];
    const attChips = atts.map(a =>
      `<button class="rl-att-chip" onclick="downloadAtt('${esc(a.id)}')"
               title="تنزيل ${esc(a.filename)}">
        ${fileIcon(a.ext)} ${esc(a.filename)}
      </button>`).join('');

    // زر "تنزيل الكل" يظهر فقط عند وجود أكثر من مرفق
    const dlAllBtn = atts.length > 1
      ? `<button class="rl-att-chip all" onclick="downloadAllForEntry('${id}')"
           title="تنزيل جميع المرفقات دفعة واحدة (${atts.length} ملفات)">
           ⬇ الكل (${atts.length})
         </button>`
      : '';

    const notesTrim = (e.notes || '').replace(/\n/g,' ');
    const notesHtml = notesTrim
      ? `<div class="rl-notes-preview" title="${esc(e.notes||'')}">${esc(notesTrim.slice(0,80))}${notesTrim.length>80?'…':''}</div>`
      : '<span class="text-muted small">—</span>';

    // وسم عُمر المراجعة مقابل دورة الدستور §5 — أيقونة + نص، لا لون وحده
    const t   = new Date(e.review_date).getTime();
    const age = isFinite(t) ? Math.floor((now - t) / 86400000) : null;
    const isLatest = lastByTicker[(e.ticker || '').trim().toUpperCase()] === e.review_date;
    const ageTag = age == null ? ''
      : !isLatest ? tagHtml('🗂️', 'مراجعة سابقة', '')
      : age > REVIEW_DUE_DAYS ? tagHtml('⏰', `مضى ${age} يوماً`, 'warn')
      : tagHtml('✅', `مضى ${age} يوماً`, 'good');

    return `<tr>
      <td><input type="checkbox" class="rl-row-check" data-id="${id}" onchange="updateSelectedCount()"></td>
      <td><span class="ticker-badge">${esc(e.ticker)}</span></td>
      <td class="rl-nowrap">${esc(e.name||'—')}</td>
      <td><span class="small text-muted">${esc(e.sector||'—')}</span></td>
      <td class="rl-nowrap">${fmtDate(e.review_date)}<div class="rl-agetag">${ageTag}</div></td>
      <td class="rl-attcell">${attChips || '<span class="small text-muted">لا يوجد</span>'}${dlAllBtn}</td>
      <td>${notesHtml}</td>
      <td class="rl-nowrap">
        <button class="btn btn-secondary btn-sm" onclick="openEdit('${id}')">✏️ تعديل</button>
        <button class="btn btn-danger btn-sm"   onclick="deleteEntry('${id}')">🗑 حذف</button>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table class="rl-table">
    <thead><tr>
      <th class="rl-checkcol"></th>
      <th>الرمز</th><th>الشركة</th><th>القطاع</th>
      <th>تاريخ المراجعة</th><th>المرفقات</th>
      <th>الملاحظات</th><th>إجراءات</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  updateSelectedCount();
}

// ── Helpers ────────────────────────────────────────────────────────────────
// AUDIT-FIX (2026-08): أُزيلت نسخة esc() المحلية — كانت لا تهرّب الاقتباس
// المفرد (') وهي تُحقن داخل نصوص onclick، فتُستخدم الآن esc() المشتركة من
// utils.js (محمَّلة قبل هذا الملف) وهي تهرّب & " ' < >.
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('ar-SA',{year:'numeric',month:'short',day:'numeric'}); }
  catch { return d; }
}
function fileIcon(ext) {
  return {txt:'📄',md:'📝',xlsx:'📊',csv:'📋'}[ext]||'📎';
}
function formatBytes(b) {
  b = +b || 0;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(2) + ' MB';
}

// ── Kick off ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
