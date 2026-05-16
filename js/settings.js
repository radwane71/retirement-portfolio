const TABLES      = ['holdings', 'transactions', 'dividends', 'cash_flows', 'net_worth_snapshots', 'real_estate'];
const BATCH_SIZES = { transactions: 50 };  // smaller batch to avoid timeout on large sets
const DEFAULT_BATCH = 500;

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-settings');
}

// ── Export ────────────────────────────────────────────────────
async function exportBackup() {
  const btn = document.getElementById('btn-export');
  btn.disabled = true;
  btn.textContent = 'جارٍ التصدير…';
  setStatus('export-status', 'info', 'يتم جلب البيانات…');

  try {
    const backup = { version: 1, exported_at: new Date().toISOString() };

    for (const table of TABLES) {
      const { data, error } = await supabaseClient.from(table).select('*');
      if (error) throw new Error(`خطأ في جدول ${table}: ${error.message}`);
      backup[table] = data || [];
    }

    const json     = JSON.stringify(backup, null, 2);
    const blob     = new Blob([json], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = `portfolio_backup_${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const totalRows = TABLES.reduce((s, t) => s + (backup[t]?.length || 0), 0);
    setStatus('export-status', 'success', `✓ تم التصدير — ${totalRows} سجل في ${TABLES.length} جداول`);
    showToast('تم تصدير النسخة الاحتياطية بنجاح', 'success');
  } catch (err) {
    setStatus('export-status', 'error', '✗ ' + err.message);
    showToast('فشل التصدير: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'تصدير النسخة الاحتياطية';
  }
}

// ── Restore ───────────────────────────────────────────────────
function triggerRestore() {
  document.getElementById('restore-file').value = '';
  document.getElementById('restore-file').click();
}

async function restoreBackup(input) {
  if (!input.files?.length) return;
  const file = input.files[0];

  // Parse file
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    showToast('الملف غير صالح — يجب أن يكون JSON', 'error');
    setStatus('restore-status', 'error', '✗ الملف غير صالح');
    return;
  }

  // Validate structure
  if (!backup.version || !TABLES.some(t => t in backup)) {
    showToast('هذا الملف لا يبدو نسخة احتياطية صالحة', 'error');
    setStatus('restore-status', 'error', '✗ تنسيق غير صالح');
    return;
  }

  // Count records
  const totalRows = TABLES.reduce((s, t) => s + (backup[t]?.length || 0), 0);
  const exportedAt = backup.exported_at ? new Date(backup.exported_at).toLocaleString('ar-SA') : 'غير محدد';

  // Confirmation dialog
  const confirmed = confirm(
    `استعادة النسخة الاحتياطية\n\n` +
    `• الإصدار: ${backup.version}\n` +
    `• تاريخ التصدير: ${exportedAt}\n` +
    `• عدد السجلات: ${totalRows}\n\n` +
    `تحذير: سيتم حذف جميع بياناتك الحالية واستبدالها ببيانات هذه النسخة الاحتياطية.\n\n` +
    `هل أنت متأكد من الاستعادة؟`
  );
  if (!confirmed) { setStatus('restore-status', 'info', 'تم الإلغاء'); return; }

  const btn = document.getElementById('btn-restore');
  btn.disabled = true;
  btn.textContent = 'جارٍ الاستعادة…';
  setStatus('restore-status', 'info', 'يتم حذف البيانات الحالية…');

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();

    // 1. Delete all existing user data (order matters for FK safety)
    for (const table of TABLES) {
      const { error } = await supabaseClient.from(table).delete().eq('user_id', user.id);
      if (error) throw new Error(`خطأ في حذف ${table}: ${error.message}`);
    }

    setStatus('restore-status', 'info', 'يتم إدراج البيانات المستعادة…');

    // 2. Re-insert from backup
    let inserted = 0;
    for (const table of TABLES) {
      const rows = backup[table];
      if (!rows?.length) continue;

      const clean = rows.map(row => mapRow(table, row, user.id)).filter(Boolean);

      const batchSize = BATCH_SIZES[table] || DEFAULT_BATCH;
      for (let i = 0; i < clean.length; i += batchSize) {
        setStatus('restore-status', 'info', `يتم إدراج ${table}… (${Math.min(i + batchSize, clean.length)}/${clean.length})`);
        const batch = clean.slice(i, i + batchSize);
        const { error } = await supabaseClient.from(table).insert(batch);
        if (error) throw new Error(`خطأ في إدراج ${table}: ${error.message}`);
        inserted += batch.length;
      }
    }

    setStatus('restore-status', 'success', `✓ تمت الاستعادة بنجاح — تم استعادة ${inserted} سجل`);
    showToast('تمت الاستعادة بنجاح — يُرجى تحديث الصفحة', 'success');

    // Offer to reload
    setTimeout(() => {
      if (confirm('تمت الاستعادة. هل تريد الانتقال إلى لوحة التحكم؟')) {
        window.location.href = 'dashboard.html';
      }
    }, 800);

  } catch (err) {
    setStatus('restore-status', 'error', '✗ ' + err.message);
    showToast('فشلت الاستعادة: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'استعادة من نسخة احتياطية';
  }
}

// ── Field mapping per table ───────────────────────────────────
function mapRow(table, row, userId) {
  let r;
  switch (table) {
    case 'holdings':
      r = {
        ticker:        row.ticker,
        name:          row.name,
        sector:        row.sector,
        shares:        row.shares,
        avg_price:     row.avg_price,
        target_weight: row.target_weight,
      };
      break;

    case 'transactions':
      r = {
        date:       row.date,
        ticker:     row.ticker,
        name:       row.name,
        type:       row.type,
        shares:     row.shares,
        price:      row.price,
        commission: row.commission,
        vat:        row.vat,
        total:      row.total,
      };
      break;

    case 'dividends':
      r = {
        date:   row.date,
        ticker: row.ticker,
        name:   row.name,
        amount: row.amount,
        month:  row.month,
        year:   row.year,
      };
      break;

    case 'cash_flows':
      // Backup may use {date, amount} or the native {year, planned_amount, actual_amount}
      if (row.year != null) {
        r = {
          year:           row.year,
          planned_amount: row.planned_amount ?? 0,
          actual_amount:  row.actual_amount  ?? 0,
        };
      } else {
        r = {
          year:           new Date(row.date).getFullYear(),
          planned_amount: 0,
          actual_amount:  row.amount ?? 0,
        };
      }
      break;

    case 'net_worth_snapshots':
      r = {
        date:        row.date,
        total_value: row.total_value,
        notes:       row.notes ?? null,
      };
      break;

    case 'real_estate': {
      const isSold = row.status === 'مباع' || row.status === 'sold';
      r = {
        name:           row.name,
        type:           row.type,
        purchase_value: row.purchase_value,
        current_value:  isSold && row.sale_value != null ? row.sale_value : (row.current_value ?? row.purchase_value),
        status:         row.status,
        monthly_rental: row.monthly_rental != null
                          ? row.monthly_rental
                          : (row.annual_rental != null ? row.annual_rental / 12 : null),
        purchase_date:  row.purchase_date ?? null,
      };
      break;
    }

    default:
      return null;
  }

  r.user_id = userId;
  return r;
}

// ── Helpers ───────────────────────────────────────────────────
function setStatus(elId, type, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = `backup-status status-${type}`;
  el.style.display = 'block';
}

init();
