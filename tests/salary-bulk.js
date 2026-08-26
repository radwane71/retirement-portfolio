// ══════════════════════════════════════════════════════════════════════
// مقسّم الراتب — التحديد الجماعي: حذفٌ وتعديلٌ لمجموعة أشهر
// ----------------------------------------------------------------------
// طلب المالك: «أحدّد ٥ أو ١٠ أو ١٥ شهراً، وأضغط حذف على أيٍّ منها فيُحذف
// المحدَّد كله؛ وإن عدّلت، يُعدَّل الجروب كله».
//
// الخطر الحقيقي في أي تعديل جماعي أنه يمسّ ما لم يُطلَب: عشرة أشهر تفقد
// تخصيصاتها لأن المالك أراد تغيير الراتب وحده. فالفحص يحرس القاعدة
// الأهمّ: **الحقل غير المفعَّل لا يُمسّ**، وغيرُ المحدَّد لا يتغيّر أصلاً.
// يُشغِّل الدوال الحقيقية من `js/salary.js` على شكل المخزن الحقيقي.
// ══════════════════════════════════════════════════════════════════════
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const fs = require('fs');
const src = fs.readFileSync(ROOT + 'js/salary.js', 'utf8');
const grab = sig => {
  const i = src.indexOf(sig);
  if (i === -1) throw new Error('missing: ' + sig);
  const b = src.indexOf(') {', i) + 2;
  let d = 0;
  for (let k = b; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
};

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const logged = [];
global.logChange = (kind, e) => logged.push(kind + ':' + e.year + '-' + e.month);
global._auditSnapshot = e => ({ ...e });
global.saveStore = () => {};
global.buildYearSelects = () => {};
global.renderAll = () => {};
global.renderTable = () => {};
global.showToast = (m) => console.log('   toast:', m);
global.isPlanned = e => e.status === 'planned';
global.formatSAR = n => Math.round(n).toLocaleString('en-US');
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = { value: '', checked: false, innerHTML: '', textContent: '',
    classList: { add(){}, remove(){} }, disabled: false }),
  querySelectorAll: () => [],
};
global.store = { entries: [], categories: [] };
global.getFilteredAll = () => store.entries;

eval(grab('let selectedIds') ? '' : '');
eval('var selectedIds = new Set();');
eval(grab('function _selEntries('));
eval(grab('function toggleRowSel('));
eval(grab('function toggleAllSel('));
eval(grab('function clearSel('));
eval(grab('function _selLabels('));
eval(grab('function confirmBulkDelete('));
eval(grab('function closeBulkDelete('));
eval(grab('function executeBulkDelete('));
eval(grab('function closeBulkEdit('));
eval(grab('function saveBulkEdit('));

const el = id => document.getElementById(id);
const mk = (y, m, sal, allocs, st) => ({ id: `e${y}${m}`, year: y, month: m, salary: sal,
  notes: '', status: st || 'actual', allocations: allocs || [] });

function reset() {
  store.entries = [];
  for (let m = 1; m <= 12; m++) store.entries.push(mk(2026, m, 18000, [{ catId: 'rent', amount: 3000 }]));
  selectedIds = new Set();
  logged.length = 0;
}

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  → ${JSON.stringify(got)} (متوقَّع ${JSON.stringify(want)})`));
};

console.log('── الحذف الجماعي ──');
reset();
[1, 3, 5, 7, 9].forEach(m => selectedIds.add(`e2026${m}`));
t('حُدِّد 5 أشهر', _selEntries().length, 5);
executeBulkDelete();
t('بقي 7 أشهر', store.entries.length, 7);
t('كل محذوف سُجِّل منفرداً', logged.length, 5);
t('التحديد فُرِّغ بعد الحذف', selectedIds.size, 0);
t('المتبقّي هو غير المحدَّد', store.entries.map(e => e.month), [2,4,6,8,10,11,12]);

console.log('\n── تحديد الكل ثم إلغاؤه ──');
reset();
toggleAllSel(true);
t('حُدِّد الكل', selectedIds.size, 12);
toggleAllSel(false);
t('أُلغي الكل', selectedIds.size, 0);

console.log('\n── التعديل الجماعي: الحقول غير المفعَّلة لا تُمسّ ──');
reset();
[1,2,3].forEach(m => selectedIds.add(`e2026${m}`));
el('bulk-do-salary').checked = true;  el('bulk-salary').value = '20000';
el('bulk-do-status').checked = false;
el('bulk-do-notes').checked  = false; el('bulk-notes').value = 'لا ينبغي أن تُكتب';
el('bulk-status').value = 'actual';
saveBulkEdit();
const three = store.entries.filter(e => e.month <= 3);
t('الراتب تغيّر في الثلاثة', three.map(e => e.salary), [20000, 20000, 20000]);
t('الملاحظات لم تُمسّ', three.map(e => e.notes), ['', '', '']);
t('التخصيصات لم تُمسّ', three.map(e => e.allocations.length), [1, 1, 1]);
t('غير المحدَّد لم يتغيّر', store.entries.find(e => e.month === 4).salary, 18000);
t('سُجِّل تعديل لكل شهر', logged.filter(x => x.startsWith('edit')).length, 3);

console.log('\n── تفعيل الحالة والملاحظات ──');
reset();
[5,6].forEach(m => selectedIds.add(`e2026${m}`));
el('bulk-do-salary').checked = false;
el('bulk-do-status').checked = true;  el('bulk-status').value = 'planned';
el('bulk-do-notes').checked  = true;  el('bulk-notes').value = 'إجازة';
saveBulkEdit();
const two = store.entries.filter(e => e.month === 5 || e.month === 6);
t('الحالة صارت مخطَّطة', two.map(e => e.status), ['planned', 'planned']);
t('الملاحظة كُتبت', two.map(e => e.notes), ['إجازة', 'إجازة']);
t('الراتب لم يُمسّ', two.map(e => e.salary), [18000, 18000]);

console.log('\n── بلا تفعيل أي حقل: يُرفض ──');
reset();
selectedIds.add('e20261');
el('bulk-do-salary').checked = false;
el('bulk-do-status').checked = false;
el('bulk-do-notes').checked  = false;
el('bulk-notes').value = '';
logged.length = 0;
saveBulkEdit();
t('لم يُسجَّل أي تعديل', logged.length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
