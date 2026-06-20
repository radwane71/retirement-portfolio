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

// ── State ──────────────────────────────────────────────────────────────────
let entries      = [];   // review_log rows
let attachMap    = {};   // { entry_id: [attachment rows] }
let pendingFiles = [];   // ملفات الإضافة المعلّقة (قبل الحفظ)
let editPendingFiles = []; // ملفات التعديل المعلّقة
let currentUser  = null;

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

  const [rEntries, rAtts] = await Promise.all([
    supabaseClient.from('review_log')
      .select('*')
      .eq('user_id', uid)                          // صريح — لا نعتمد على RLS وحده
      .order('review_date', { ascending: false }),
    supabaseClient.from('review_log_attachments')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true }),
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
  const barColor   = pct > 90 ? '#f85149' : pct > 70 ? '#f0b429' : '#3fb950';

  const chips = bucket.map((f, i) => `
    <span class="attach-chip">
      ${fileIcon(f.ext)} ${esc(f.filename)}
      <span style="color:var(--text-muted);font-size:.7rem">(${formatBytes(f.size_bytes)})</span>
      <button onclick="removePending(${i},'${previewId}')">×</button>
    </span>`).join('');

  const summary = bucket.length
    ? `<div style="margin-top:6px;font-size:.76rem;color:var(--text-muted)">
        ${totalCount}/${MAX_FILES_ENTRY} مرفق ·
        <span style="color:${barColor}">${formatBytes(totalBytes)} / ${formatBytes(MAX_TOTAL_BYTES)}</span>
       </div>`
    : '';

  el.innerHTML = chips + summary;
}

function removePending(idx, previewId) {
  const bucket = previewId === 'attach-preview' ? pendingFiles : editPendingFiles;
  bucket.splice(idx, 1);
  renderFilePreviews(bucket, previewId);
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
  const { error } = await supabaseClient
    .from('review_log_attachments').delete().eq('id', attId);
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
  const barColor = pct > 90 ? '#f85149' : pct > 70 ? '#f0b429' : '#3fb950';

  const chips = atts.map(a => `
    <span class="attach-chip" style="background:rgba(63,185,80,.12);color:#3fb950">
      ${fileIcon(a.ext)} ${esc(a.filename)}
      <span style="color:var(--text-muted);font-size:.7rem">(${formatBytes(a.size_bytes||0)})</span>
      <button onclick="removeExistingAtt('${a.id}')">×</button>
    </span>`).join('');

  const summary = atts.length
    ? `<div style="margin-top:6px;font-size:.76rem;color:var(--text-muted)">
        محفوظ: ${atts.length}/${MAX_FILES_ENTRY} ·
        <span style="color:${barColor}">${formatBytes(total)} / ${formatBytes(MAX_TOTAL_BYTES)}</span>
       </div>`
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
function downloadAtt(attId) {
  // البحث في جميع المرفقات المحمّلة
  let att = null;
  for (const list of Object.values(attachMap)) {
    att = list.find(a => a.id === attId);
    if (att) break;
  }
  if (!att) return;
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
  for (const att of atts) {
    await new Promise(r => setTimeout(r, 150));
    triggerDownload(att);
  }
  showToast(`✅ تم تنزيل ${atts.length} مرفق`, 'success');
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
      triggerDownload(att);
      downloaded++;
    }
  }
  if (!downloaded) showToast('لا توجد مرفقات في المراجعات المحددة', 'error');
  else showToast(`✅ تم تصدير ${downloaded} مرفق`, 'success');
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderTable() {
  const wrap = document.getElementById('rl-table-wrap');
  if (!entries.length) {
    wrap.innerHTML = `<div class="empty-rl"><div class="e-icon">📒</div>
      <p>لا توجد مراجعات بعد — أضف أول تقييم من النموذج أعلاه</p></div>`;
    return;
  }

  const rows = entries.map(e => {
    const atts = attachMap[e.id] || [];
    const attChips = atts.map(a =>
      `<button class="rl-att-chip" onclick="downloadAtt('${a.id}')"
               title="تنزيل ${esc(a.filename)}">
        ${fileIcon(a.ext)} ${esc(a.filename)}
      </button>`).join('');

    // زر "تنزيل الكل" يظهر فقط عند وجود أكثر من مرفق
    const dlAllBtn = atts.length > 1
      ? `<button class="rl-att-chip" onclick="downloadAllForEntry('${e.id}')"
           style="background:rgba(63,185,80,.15);color:#3fb950;font-weight:600"
           title="تنزيل جميع المرفقات دفعة واحدة (${atts.length} ملفات)">
           ⬇ الكل (${atts.length})
         </button>`
      : '';

    const notesTrim = (e.notes || '').replace(/\n/g,' ');
    const notesHtml = notesTrim
      ? `<div class="rl-notes-preview" title="${esc(e.notes||'')}">${esc(notesTrim.slice(0,80))}${notesTrim.length>80?'…':''}</div>`
      : '<span class="text-muted small">—</span>';

    return `<tr>
      <td><input type="checkbox" class="rl-row-check" data-id="${e.id}" onchange="updateSelectedCount()"></td>
      <td><span class="ticker-badge">${esc(e.ticker)}</span></td>
      <td style="white-space:nowrap">${esc(e.name||'—')}</td>
      <td><span class="small text-muted">${esc(e.sector||'—')}</span></td>
      <td style="white-space:nowrap">${fmtDate(e.review_date)}</td>
      <td style="min-width:130px">${attChips || '<span class="small text-muted">لا يوجد</span>'}${dlAllBtn}</td>
      <td>${notesHtml}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm" onclick="openEdit('${e.id}')">✏️ تعديل</button>
        <button class="btn btn-danger btn-sm"   onclick="deleteEntry('${e.id}')">🗑 حذف</button>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table class="rl-table">
    <thead><tr>
      <th style="width:32px"></th>
      <th>الرمز</th><th>الشركة</th><th>القطاع</th>
      <th>تاريخ المراجعة</th><th>المرفقات</th>
      <th>الملاحظات</th><th>إجراءات</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  updateSelectedCount();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
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
