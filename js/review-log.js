'use strict';

// ── Storage ────────────────────────────────────────────────────────────────
const RL_KEY = 'review_log_v1';

function loadStore() {
  try { return JSON.parse(localStorage.getItem(RL_KEY)) || []; } catch { return []; }
}
function saveStore(data) {
  try {
    localStorage.setItem(RL_KEY, JSON.stringify(data));
  } catch (e) {
    showToast('⚠️ التخزين المحلي ممتلئ — احذف بعض السجلات أو المرفقات الكبيرة', 'error');
  }
}

let entries = loadStore();           // مصفوفة كل المراجعات
let pendingFiles = [];               // ملفات الإضافة المعلّقة
let editPendingFiles = [];           // ملفات التعديل المعلّقة
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB per file

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-review-log');
  document.getElementById('rl-date').value = todayISO();
  renderTable();
}

// ── Auto-fill ticker name & sector ────────────────────────────────────────
function onTickerInput() {
  const ticker = document.getElementById('rl-ticker').value.trim().toUpperCase();
  document.getElementById('rl-ticker').value = ticker;
  autoFillFromTicker(ticker, 'rl-name', 'rl-sector');
}

function autoFillFromTicker(ticker, nameId, sectorId) {
  if (!ticker) return;
  // محاولة الاستفادة من lookupTicker أو TICKER_DB من utils.js
  const official = (typeof lookupTicker === 'function') ? lookupTicker(ticker) : null;
  const name     = official?.name   || (typeof TICKER_DB !== 'undefined' ? TICKER_DB[ticker] : null);
  const sector   = official?.sector || null;
  if (name   && document.getElementById(nameId))   document.getElementById(nameId).value   = name;
  if (sector && document.getElementById(sectorId)) document.getElementById(sectorId).value = sector;
}

// ── File handling ─────────────────────────────────────────────────────────
const ALLOWED_EXTS = ['txt', 'md', 'xlsx', 'csv'];

function getExt(filename) {
  return filename.split('.').pop().toLowerCase();
}

function onFilesSelected(fileList) {
  processFiles(fileList, pendingFiles, 'attach-preview');
}

function onEditFilesSelected(fileList) {
  processFiles(fileList, editPendingFiles, 'edit-attach-preview');
}

function processFiles(fileList, bucket, previewId) {
  Array.from(fileList).forEach(file => {
    const ext = getExt(file.name);
    if (!ALLOWED_EXTS.includes(ext)) {
      showToast(`${file.name}: نوع غير مدعوم — يُقبل txt, md, xlsx, csv فقط`, 'error');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showToast(`${file.name}: الحجم أكبر من 2MB`, 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      bucket.push({ id: uid(), filename: file.name, ext, data: e.target.result, size: file.size });
      renderFilePreviews(bucket, previewId);
    };
    // تخزين xlsx/csv كـ base64، والنصية كنص عادي
    if (['xlsx'].includes(ext)) reader.readAsDataURL(file);
    else                        reader.readAsText(file, 'utf-8');
  });
}

function renderFilePreviews(bucket, previewId) {
  const el = document.getElementById(previewId);
  if (!el) return;
  el.innerHTML = bucket.map((f, i) => `
    <span class="attach-chip">
      ${fileIcon(f.ext)} ${esc(f.filename)}
      <span style="color:var(--text-muted);font-size:.7rem">(${formatBytes(f.size)})</span>
      <button onclick="removeFile(${i},'${previewId}')">×</button>
    </span>`).join('');
}

function removeFile(idx, previewId) {
  const bucket = previewId === 'attach-preview' ? pendingFiles : editPendingFiles;
  bucket.splice(idx, 1);
  renderFilePreviews(bucket, previewId);
}

function fileIcon(ext) {
  return { txt:'📄', md:'📝', xlsx:'📊', csv:'📋' }[ext] || '📎';
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  return (b/1024/1024).toFixed(2) + ' MB';
}

// ── Drag & Drop ────────────────────────────────────────────────────────────
function onDragOver(e)  { e.preventDefault(); document.getElementById('attach-zone').classList.add('dragover'); }
function onDragLeave(e) { document.getElementById('attach-zone').classList.remove('dragover'); }
function onDrop(e) {
  e.preventDefault();
  document.getElementById('attach-zone').classList.remove('dragover');
  onFilesSelected(e.dataTransfer.files);
}

// ── CRUD ───────────────────────────────────────────────────────────────────
function uid() { return 'rl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

function saveEntry() {
  const ticker = document.getElementById('rl-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('rl-name').value.trim();
  const sector = document.getElementById('rl-sector').value.trim();
  const date   = document.getElementById('rl-date').value;
  const notes  = document.getElementById('rl-notes').value.trim();

  if (!ticker) { showToast('أدخل رمز السهم', 'error'); return; }
  if (!date)   { showToast('حدد تاريخ المراجعة', 'error'); return; }

  const entry = {
    id:          uid(),
    ticker, name, sector, date, notes,
    attachments: [...pendingFiles],
    created_at:  new Date().toISOString(),
  };

  entries.unshift(entry); // أحدث أولاً
  saveStore(entries);
  resetForm();
  renderTable();
  showToast('✅ تمت إضافة المراجعة', 'success');
}

function resetForm() {
  document.getElementById('rl-ticker').value = '';
  document.getElementById('rl-name').value   = '';
  document.getElementById('rl-sector').value = '';
  document.getElementById('rl-date').value   = todayISO();
  document.getElementById('rl-notes').value  = '';
  document.getElementById('rl-files').value  = '';
  pendingFiles = [];
  renderFilePreviews(pendingFiles, 'attach-preview');
}

function deleteEntry(id) {
  if (!confirm('هل تريد حذف هذه المراجعة نهائياً؟')) return;
  entries = entries.filter(e => e.id !== id);
  saveStore(entries);
  renderTable();
  showToast('تم الحذف', 'success');
}

// ── Edit ───────────────────────────────────────────────────────────────────
function openEdit(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  editPendingFiles = [];
  document.getElementById('edit-id').value     = id;
  document.getElementById('edit-ticker').value = e.ticker || '';
  document.getElementById('edit-name').value   = e.name   || '';
  document.getElementById('edit-sector').value = e.sector || '';
  document.getElementById('edit-date').value   = e.date   || '';
  document.getElementById('edit-notes').value  = e.notes  || '';
  renderEditAttachments(e.attachments || []);
  renderFilePreviews(editPendingFiles, 'edit-attach-preview');
  document.getElementById('edit-modal').classList.add('open');
}

function renderEditAttachments(atts) {
  const el = document.getElementById('edit-attach-preview');
  if (!el) return;
  // عرض المرفقات الموجودة مع زر حذف كل واحدة
  const existingHtml = atts.map(f => `
    <span class="attach-chip" style="background:rgba(63,185,80,.12);color:#3fb950">
      ${fileIcon(f.ext)} ${esc(f.filename)}
      <span style="color:var(--text-muted);font-size:.7rem">(${formatBytes(f.size || 0)})</span>
      <button onclick="removeExistingAtt('${f.id}','${document.getElementById('edit-id').value || ''}')">×</button>
    </span>`).join('');
  el.innerHTML = existingHtml;
}

function removeExistingAtt(attId, entryId) {
  const entry = entries.find(e => e.id === entryId);
  if (!entry) return;
  entry.attachments = (entry.attachments || []).filter(a => a.id !== attId);
  saveStore(entries);
  renderEditAttachments(entry.attachments);
}

function saveEdit() {
  const id     = document.getElementById('edit-id').value;
  const entry  = entries.find(e => e.id === id);
  if (!entry) return;

  entry.ticker = document.getElementById('edit-ticker').value.trim().toUpperCase();
  entry.name   = document.getElementById('edit-name').value.trim();
  entry.sector = document.getElementById('edit-sector').value.trim();
  entry.date   = document.getElementById('edit-date').value;
  entry.notes  = document.getElementById('edit-notes').value.trim();
  entry.attachments = [...(entry.attachments || []), ...editPendingFiles];

  saveStore(entries);
  closeModal();
  renderTable();
  showToast('✅ تم حفظ التعديلات', 'success');
}

function closeModal() {
  document.getElementById('edit-modal').classList.remove('open');
  editPendingFiles = [];
}
function closeModalOutside(e) {
  if (e.target.id === 'edit-modal') closeModal();
}

// ── Download attachment ────────────────────────────────────────────────────
function downloadAtt(entryId, attId) {
  const entry = entries.find(e => e.id === entryId);
  if (!entry) return;
  const att = (entry.attachments || []).find(a => a.id === attId);
  if (!att) return;
  triggerDownload(att);
}

function triggerDownload(att) {
  const a = document.createElement('a');
  a.download = att.filename;
  if (att.ext === 'xlsx') {
    // already base64 dataURL
    a.href = att.data;
  } else {
    const blob = new Blob([att.data], { type: 'text/plain;charset=utf-8' });
    a.href = URL.createObjectURL(blob);
  }
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
  if (ids.length === 0) {
    countEl.textContent = 'لا يوجد تحديد';
    btnEl.disabled = true;
  } else {
    const totalAtts = ids.reduce((s, id) => {
      const e = entries.find(x => x.id === id);
      return s + (e?.attachments?.length || 0);
    }, 0);
    countEl.textContent = `${ids.length} مراجعة محددة — ${totalAtts} مرفق`;
    btnEl.disabled = totalAtts === 0;
  }
  // مزامنة Select All
  const allChecks = document.querySelectorAll('.rl-row-check');
  const allChecked = allChecks.length > 0 && [...allChecks].every(c => c.checked);
  document.getElementById('select-all').checked = allChecked;
}

async function exportSelected() {
  const ids = getSelectedIds();
  if (!ids.length) return;

  let downloaded = 0;
  for (const id of ids) {
    const entry = entries.find(e => e.id === id);
    if (!entry) continue;
    for (const att of (entry.attachments || [])) {
      // تأخير بسيط بين التنزيلات لتجنب حجب المتصفح
      await new Promise(r => setTimeout(r, 150));
      triggerDownload(att);
      downloaded++;
    }
  }
  if (downloaded === 0) {
    showToast('لا توجد مرفقات في المراجعات المحددة', 'error');
  } else {
    showToast(`✅ تم تصدير ${downloaded} مرفق`, 'success');
  }
}

// ── Render Table ──────────────────────────────────────────────────────────
function renderTable() {
  const wrap = document.getElementById('rl-table-wrap');
  if (!entries.length) {
    wrap.innerHTML = `<div class="empty-rl"><div class="e-icon">📒</div><p>لا توجد مراجعات بعد — أضف أول تقييم من النموذج أعلاه</p></div>`;
    return;
  }

  const rows = entries.map(e => {
    const atts = e.attachments || [];
    const attChips = atts.map(a =>
      `<button class="rl-att-chip" onclick="downloadAtt('${e.id}','${a.id}')" title="تنزيل ${esc(a.filename)}">
        ${fileIcon(a.ext)} ${esc(a.filename)}
      </button>`
    ).join('');

    const notesTrim = (e.notes || '').replace(/\n/g,' ').slice(0, 80);
    const notesHtml = notesTrim
      ? `<div class="rl-notes-preview" title="${esc(e.notes || '')}">${esc(notesTrim)}${(e.notes||'').length > 80 ? '…' : ''}</div>`
      : '<span class="text-muted small">—</span>';

    return `<tr>
      <td><input type="checkbox" class="rl-row-check" data-id="${e.id}" onchange="updateSelectedCount()"></td>
      <td><span class="ticker-badge">${esc(e.ticker)}</span></td>
      <td style="white-space:nowrap">${esc(e.name || '—')}</td>
      <td><span class="small text-muted">${esc(e.sector || '—')}</span></td>
      <td style="white-space:nowrap">${formatDate(e.date)}</td>
      <td>${attChips || '<span class="small text-muted">لا يوجد</span>'}</td>
      <td>${notesHtml}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm" onclick="openEdit('${e.id}')">✏️ تعديل</button>
        <button class="btn btn-danger btn-sm"   onclick="deleteEntry('${e.id}')">🗑 حذف</button>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table class="rl-table">
    <thead>
      <tr>
        <th style="width:32px"></th>
        <th>الرمز</th>
        <th>الشركة</th>
        <th>القطاع</th>
        <th>تاريخ المراجعة</th>
        <th>المرفقات</th>
        <th>الملاحظات</th>
        <th>إجراءات</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

  updateSelectedCount();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('ar-SA', { year:'numeric', month:'short', day:'numeric' });
  } catch { return d; }
}

// ── Kick off ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
