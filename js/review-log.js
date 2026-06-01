'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let entries      = [];   // review_log rows
let attachMap    = {};   // { entry_id: [attachment rows] }
let pendingFiles = [];   // ملفات الإضافة المعلّقة (قبل الحفظ)
let editPendingFiles = []; // ملفات التعديل المعلّقة
let currentUser  = null;

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_EXTS   = ['txt', 'md', 'xlsx', 'csv'];

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
  if (name   && !document.getElementById('rl-name').value)   document.getElementById('rl-name').value   = name;
  if (sector && !document.getElementById('rl-sector').value) document.getElementById('rl-sector').value = sector;
}

// ── File handling ──────────────────────────────────────────────────────────
function getExt(filename) { return filename.split('.').pop().toLowerCase(); }

function onFilesSelected(fileList)     { processFiles(fileList, pendingFiles, 'attach-preview'); }
function onEditFilesSelected(fileList) { processFiles(fileList, editPendingFiles, 'edit-attach-preview'); }

function processFiles(fileList, bucket, previewId) {
  Array.from(fileList).forEach(file => {
    const ext = getExt(file.name);
    if (!ALLOWED_EXTS.includes(ext)) {
      showToast(`${file.name}: نوع غير مدعوم — يُقبل txt, md, xlsx, csv فقط`, 'error'); return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showToast(`${file.name}: الحجم أكبر من 2MB`, 'error'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      bucket.push({
        filename: file.name, ext,
        content: e.target.result,
        size_bytes: file.size,
      });
      renderFilePreviews(bucket, previewId);
    };
    if (ext === 'xlsx') reader.readAsDataURL(file);
    else                reader.readAsText(file, 'utf-8');
  });
}

function renderFilePreviews(bucket, previewId) {
  const el = document.getElementById(previewId);
  if (!el) return;
  el.innerHTML = bucket.map((f, i) => `
    <span class="attach-chip">
      ${fileIcon(f.ext)} ${esc(f.filename)}
      <span style="color:var(--text-muted);font-size:.7rem">(${formatBytes(f.size_bytes)})</span>
      <button onclick="removePending(${i},'${previewId}')">×</button>
    </span>`).join('');
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
  if (!confirm('هل تريد حذف هذه المراجعة وجميع مرفقاتها نهائياً؟')) return;
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
  const atts = attachMap[entryId] || [];
  const html = atts.map(a => `
    <span class="attach-chip" style="background:rgba(63,185,80,.12);color:#3fb950">
      ${fileIcon(a.ext)} ${esc(a.filename)}
      <span style="color:var(--text-muted);font-size:.7rem">(${formatBytes(a.size_bytes||0)})</span>
      <button onclick="removeExistingAtt('${a.id}')">×</button>
    </span>`).join('');
  el.innerHTML = html;
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
      <td style="min-width:120px">${attChips||'<span class="small text-muted">لا يوجد</span>'}</td>
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
