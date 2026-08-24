// ══════════════════════════════════════════════════════════════════════
// مولِّد ملف الاستيراد لسجل حاسبة القيمة العادلة
// ----------------------------------------------------------------------
// يقرأ ملفات المالك من data/valuation-sources ويكتب js/valuation-import.js.
// الناتج مولَّد — لا يُحرَّر يدوياً؛ يُعاد تشغيل هذا المولِّد بدلاً من ذلك.
//
//   node tools/build-valuation-import.js
//
// المصادر:
//   • tharwa_valuations_CORRECTED_2026-08-24.csv — تصحيح عملياتٍ قائمة
//   • tharwa_HISTORICAL_COMPLETE.csv             — سجل تاريخي يُضاف
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'data', 'valuation-sources');
const OUT = path.join(ROOT, 'js', 'valuation-import.js');
const STAMP = '2026-08-24';

const SOURCES = [
  { file: 'tharwa_valuations_CORRECTED_2026-08-24.csv', src: 'corrections',
    label: 'التصحيحات المعتمدة — الربع الأول والثاني 2026' },
  { file: 'tharwa_HISTORICAL_COMPLETE.csv',             src: 'historical',
    label: 'السجل التاريخي الكامل — السنوات المالية 2017–2025' },
];

// ── محلّل CSV يحترم RFC 4180: حقول مقتبسة متعددة الأسطر، و"" داخلها ──
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r') { /* تجاهل */ }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const IN_P = 'مدخل: ', RES_P = 'نتيجة: ';
// حقول لا تُعامَل معاملة الأرقام: لا يُنزع منها وسم ولا تُطبَّع
const FREE = new Set(['ticker', 'stockName', 'companyType', 'scenario', 'anchorModel',
  'decision', 'notes', 'perplexityEval', 'fcfBasis', 'noNetDebt', 'noTotalDebt', 'useWacc']);
const FLAGS = ['noNetDebt', 'noTotalDebt', 'useWacc'];
const TAG_RE = /[✅⚙⚠❌️ℹ]/gu;
const NUM_RES = new Set(['fairValueAvg', 'fairValueArithmeticAvg', 'fairValueMin',
  'fairValueMax', 'dispersionCV', 'modelsInAvg', 'bookFloor']);
const BOOL_RES = new Set(['fairValueUnreliable', 'sustainFail']);
const JSON_RES = new Set(['models', 'sustainReasons', 'sustainWatch']);

function readSource(spec) {
  let raw = fs.readFileSync(path.join(SRC_DIR, spec.file), 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const rows = parseCSV(raw).filter(r => r.length > 1 && r.some(c => String(c).trim() !== ''));
  const head = rows[0];
  const idxId = head.indexOf('id');
  const idxDate = head.findIndex(h => h.trim() === 'التاريخ');
  if (idxId < 0 || idxDate < 0) throw new Error('عمود id أو التاريخ مفقود في ' + spec.file);

  const entries = rows.slice(1).map(r => {
    const inputs = {}, results = {};
    head.forEach((h, i) => {
      const v = r[i];
      if (v === undefined || v === '') return;      // خليّة فارغة = الحقل يُفرَّغ
      if (h.startsWith(IN_P)) inputs[h.slice(IN_P.length)] = v;
      else if (h.startsWith(RES_P)) results[h.slice(RES_P.length)] = v;
    });

    // ── أوسمة م.19 مدسوسة داخل قيم رقمية ("1.05 ⚠️") ──
    // الحقل type=number يرفض النص فتضيع القيمة صامتةً. نفصل الوسم عن الرقم
    // ونحفظه في dataTags، فلا يضيع المصدر ولا يُكسَر الإدخال.
    const tags = {};
    Object.keys(inputs).forEach(k => {
      if (FREE.has(k)) return;
      const s0 = String(inputs[k]);
      TAG_RE.lastIndex = 0;
      if (!TAG_RE.test(s0)) return;
      TAG_RE.lastIndex = 0;
      tags[k] = (s0.match(TAG_RE) || []).join('');
      const rest = s0.replace(TAG_RE, '').trim();
      // وسم بلا رقم = البيان غير متوفر (م.20) — يُفرَّغ ولا يُصفَّر
      if (rest === '' || !isFinite(parseFloat(rest))) delete inputs[k];
      else inputs[k] = rest;
    });
    const tagKeys = Object.keys(tags);
    if (tagKeys.length) inputs.dataTags = tagKeys.map(k => k + ':' + tags[k]).join(' · ');

    // العَلَم المنطقي يعود من CSV نصاً، و"false" نصٌّ صادق — يُطبَّع هنا
    FLAGS.forEach(k => {
      if (inputs[k] === undefined) return;
      const v = String(inputs[k]).trim().toLowerCase();
      inputs[k] = !(v === '' || v === 'false' || v === '0' || v === 'no');
    });

    Object.keys(results).forEach(k => {
      const v = results[k];
      if (NUM_RES.has(k)) { const n = parseFloat(v); if (isFinite(n)) results[k] = n; }
      else if (BOOL_RES.has(k)) results[k] = (String(v).trim() === 'true');
      else if (JSON_RES.has(k)) { try { results[k] = JSON.parse(v); } catch (_) {} }
    });

    return { id: Number(r[idxId]), date: r[idxDate] || '', src: spec.src, inputs, results };
  }).filter(e => isFinite(e.id) && e.id > 0);

  const cols = head.filter(h => h.startsWith(IN_P)).map(h => h.slice(IN_P.length));
  return { entries, cols };
}

// ── قراءة المصادر ودمجها ──
const all = [], cols = new Set();
const perSource = [];
SOURCES.forEach(spec => {
  const { entries, cols: c } = readSource(spec);
  c.forEach(k => cols.add(k));
  all.push(...entries);
  perSource.push({ spec, n: entries.length, tickers: new Set(entries.map(e => e.inputs.ticker)).size });
});

// ── حرّاس السلامة: خطأ صريح خيرٌ من ملف صامت مكسور ──
const problems = [];
const seen = new Map();
all.forEach(e => {
  if (seen.has(e.id)) problems.push('معرّف مكرّر: ' + e.id + ' (' + seen.get(e.id) + ' و' + e.src + ')');
  else seen.set(e.id, e.src);
});
all.forEach(e => {
  if (!/^\d{4}$/.test(String(e.inputs.ticker || ''))) problems.push('رمز غير صالح: ' + e.id + ' → ' + e.inputs.ticker);
  if (!String(e.date || '').trim()) problems.push('بلا تاريخ: ' + e.id);
  if (!['bank', 'reit', 'cyclical', 'normal'].includes(e.inputs.companyType)) {
    problems.push('نوع شركة غير معروف: ' + e.id + ' → ' + e.inputs.companyType);
  }
});
if (problems.length) { problems.forEach(p => console.error('✗ ' + p)); throw new Error(problems.length + ' مشكلة في المصادر'); }

// ══════════════════════════════════════════════════════════════════════
// ترميم السجل التاريخي من ملفات تداول الرسمية (م.15 · م.24)
// ----------------------------------------------------------------------
// ملفات تداول تعلو على كل مصدر، والمستودع يحملها أصلاً في js/tadawul-data.js
// بسلسلة سنوية كاملة. فكل حقلٍ في صفٍّ تاريخي له مقابلٌ رسمي لنفس
// السهم ونفس السنة يُؤخذ من الرسمي — بحثٌ لا تقدير، ويُوسَم ✅ ويُعَدّ.
//
// ما دعا إليه: الملف التاريخي جمّد ربحية السهم على رقم آخر سنة وكرّرها في
// كل السنوات (12 سهماً من 22)، فصارت جراهام والمكرر ونسبة التوزيع تُحسب
// على ربح لا يخصّ السنة. ولا نُصلحها بالتخمين بل بالرقم المعلن.
// ══════════════════════════════════════════════════════════════════════
let TADAWUL = null;
try { TADAWUL = require(path.join(ROOT, 'js', 'tadawul-data.js')).TADAWUL_DATA; }
catch (_) { console.error('⚠️ تعذّر تحميل js/tadawul-data.js — يمضي الاستيراد بلا ترميم'); }

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function yearOf(dateStr) {
  const s = String(dateStr).replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d));
  const m = s.match(/(\d{4})/);
  return m ? m[1] : null;
}
const round = (v, n) => (v == null ? null : +v.toFixed(n));

// ── 1) حجر صحّي: قيمة «للسهم» بحجم مستحيل ليست بياناً، بل خطأ وحدة ──
// أسمنت القصيم 2021 جاء بتوزيع 372,199 ريالاً للسهم وقيمة دفترية
// 1,735,574 — أي أن الصف كُتب بالآلاف الإجمالية لا للسهم. لا نُحوّله
// بتخمين عدد الأسهم؛ نُفرّغ الحقل ونُعلنه ناقصاً (م.20) ويبقى الصف.
const PER_SHARE = ['eps', 'normEps', 'normFcf', 'dividends', 'fcf',
  'bookValue', 'bvps', 'bankEps', 'bankDps', 'netDebt'];
const IMPOSSIBLE = 1000;   // لا سهم سعودي بقيمة دفترية أو توزيع للسهم بهذا الحجم
let quarantined = 0, recovered = 0;
const quarantineRows = [];
all.filter(e => e.src === 'historical').forEach(e => {
  const hit = [];
  PER_SHARE.forEach(k => {
    const v = parseFloat(e.inputs[k]);
    if (isFinite(v) && Math.abs(v) > IMPOSSIBLE) { hit.push(k); delete e.inputs[k]; }
  });
  if (hit.length) e.__quar = hit;   // الوسم يُبنى بعد الترميم، من الحالة النهائية
});

// ── عدد الأسهم المؤكَّد: من السنة نفسها، وإلا من سنةٍ برأس المال ذاته ──
// بعض السنوات في ملفات تداول مُعطَبة المصدر فأسقط المستخرِج ربحيتها
// (أسمنت القصيم 2021–2022)، فبقيت الإجماليات سليمة بلا مقسوم عليه.
// نستعيد المقسوم من سنةٍ أخرى للسهم نفسه برأس المال ذاته — لا بافتراض
// قيمة اسمية عامة، فهي لا تصمد عبر السوق كلّه.
function confirmedShares(ticker, year) {
  const yrs = (TADAWUL && TADAWUL[ticker] && TADAWUL[ticker].years) || {};
  const rec = yrs[year];
  if (!rec) return null;
  if (rec.sharesM) return { n: rec.sharesM * 1e6, from: year };
  if (rec.capital == null) return null;
  const twin = Object.keys(yrs).find(y => y !== year && yrs[y].sharesM && yrs[y].capital === rec.capital);
  return twin ? { n: yrs[twin].sharesM * 1e6, from: twin } : null;
}

// قيم «للسهم» الرسمية: المعلن مباشرةً، وإلا الإجمالي ÷ الأسهم المؤكَّدة
function officialPerShare(ticker, year) {
  const rec = (TADAWUL && TADAWUL[ticker] && TADAWUL[ticker].years || {})[year];
  if (!rec) return null;
  const sh = confirmedShares(ticker, year);
  const per = (total) => (total != null && sh) ? round(total / sh.n, 2) : null;
  const out = {
    eps:  rec.eps  != null ? rec.eps  : per(rec.niParent != null ? rec.niParent : rec.netIncome),
    dps:  rec.dps  != null ? rec.dps  : per(rec.divPaid),
    bvps: rec.bvps != null ? rec.bvps : per(rec.equityParent != null ? rec.equityParent : rec.equity),
    fcfPs: per(rec.fcf),
    roePct: round(rec.roePct, 1),
    payoutPct: round(rec.payoutPct, 1),
  };
  out.derived = (rec.eps == null && out.eps != null);   // اشتُقّ لا نُقل — يُوسَم ⚙️
  out.sharesFrom = sh ? sh.from : null;
  return out;
}

// ── 2) الترميم من الرسمي، بوعي نوع الشركة ──
// م.34: في وضع البنك لا تُملأ حقول الشركة العادية (eps/fcf)، والبديل bankEps.
let repaired = 0, rowsTouched = 0, noOfficial = 0;
const repairLog = [];
all.filter(e => e.src === 'historical').forEach(e => {
  const t = e.inputs.ticker, y = yearOf(e.date);
  const o = officialPerShare(t, y);
  if (!o) { noOfficial++; return; }
  const cand = (e.inputs.companyType === 'bank')
    ? { bankEps: o.eps, bankDps: o.dps, bvps: o.bvps, bookValue: o.bvps,
        dividends: o.dps, bankRoe: o.roePct, earningsQuality: o.roePct,
        bankPayout: o.payoutPct }
    : { eps: o.eps, dividends: o.dps, bookValue: o.bvps,
        fcf: o.fcfPs, earningsQuality: o.roePct };
  let touched = 0;
  Object.keys(cand).forEach(k => {
    const v = cand[k];
    if (v == null) return;
    const old = e.inputs[k];
    const o = (old === undefined || String(old).trim() === '') ? null : parseFloat(old);
    // فرق ≤ 2% أو ≤ 0.02 تقريبُ اشتقاقٍ لا خلاف — لا يُلمس
    if (o != null && Math.abs(o - v) <= Math.max(0.02, Math.abs(v) * 0.02)) return;
    repairLog.push(t + '/' + y + ' ' + k + ': ' + (old === undefined ? '(غائب)' : old) + ' → ' + v);
    e.inputs[k] = String(v);
    repaired++; touched++;
  });
  if (touched) {
    rowsTouched++;
    const how = o.derived ? 'رُمّم من تداول ⚙️ (' + touched + ' حقلاً · مشتق بأسهم ' + o.sharesFrom + ')'
                          : 'رُمّم من تداول ✅ (' + touched + ' حقلاً)';
    e.inputs.dataTags = [e.inputs.dataTags, how].filter(Boolean).join(' · ');
  }
});

// ── 3) الربح والتدفق المُطبَّعان يُعاد بناؤهما من السلسلة الرسمية (م.35) ──
// قيمة واحدة لكل سهم كما في منهجية الملف، لكن على أرقامٍ معلنة لا مشتقة.
let normFixed = 0;
const normLog = [];
const cyclicals = [...new Set(all.filter(e => e.src === 'historical'
  && e.inputs.companyType === 'cyclical').map(e => e.inputs.ticker))];
cyclicals.forEach(t => {
  const yrs = (TADAWUL && TADAWUL[t] && TADAWUL[t].years) || {};
  const keys = Object.keys(yrs).filter(y => yrs[y].eps != null).sort();
  if (!keys.length) return;
  const mean = a => (a.length ? round(a.reduce((x, y) => x + y, 0) / a.length, 2) : null);
  const nEps = mean(keys.map(y => yrs[y].eps));
  const fcfPs = keys.filter(y => yrs[y].fcf != null && yrs[y].sharesM)
    .map(y => yrs[y].fcf / (yrs[y].sharesM * 1e6));
  const nFcf = mean(fcfPs);
  all.filter(e => e.src === 'historical' && e.inputs.ticker === t).forEach(e => {
    [['normEps', nEps], ['normFcf', nFcf]].forEach(([k, v]) => {
      if (v == null) return;
      const o = e.inputs[k] === undefined ? null : parseFloat(e.inputs[k]);
      if (o != null && Math.abs(o - v) <= Math.max(0.02, Math.abs(v) * 0.02)) return;
      if (!normLog.some(x => x.startsWith(t + ' ' + k))) {
        normLog.push(t + ' ' + k + ': ' + (o == null ? '(غائب)' : o) + ' → ' + v
          + ' (متوسط ' + keys.length + ' سنة ' + keys[0] + '–' + keys[keys.length - 1] + ')');
      }
      e.inputs[k] = String(v); normFixed++;
    });
  });
});

// ── وسم الحجر الصحّي بعد الترميم: ما بقي فارغاً وحده يُعلَن ناقصاً ──
// وسمُ حقلٍ أُعيد ملؤه من المصدر الرسمي كذبٌ على القارئ، فيُسقَط.
all.filter(e => e.__quar).forEach(e => {
  const still = e.__quar.filter(k => e.inputs[k] === undefined || String(e.inputs[k]).trim() === '');
  if (still.length) {
    quarantineRows.push(e.inputs.ticker + '/' + yearOf(e.date) + ' → ' + still.join(', '));
    e.inputs.dataTags = [e.inputs.dataTags, still.map(k => k + ':❌وحدة').join(' · ')]
      .filter(Boolean).join(' · ');
  }
  quarantined += still.length;
  recovered += e.__quar.length - still.length;
  delete e.__quar;
});

// ── ملاحظات تُعرَض للمالك وقت التطبيق، لا تُبتلع في تعليق ──
// كل ملاحظة هنا حالةٌ قد تميل بالقيمة العادلة وأنت من يقرّر فيها.
const notes = [];
const noDebtReits = all.filter(e => e.inputs.companyType === 'reit'
  && e.inputs.noTotalDebt === true && String(e.inputs.nav || '').trim() !== '');
if (noDebtReits.length) {
  const by = {};
  noDebtReits.forEach(e => { (by[e.inputs.ticker] = by[e.inputs.ticker] || []).push(e.date.slice(-16, -11)); });
  notes.push('صناديق ريت معلَّمة «لا يوجد دين إجمالي» مع وجود NAV: '
    + Object.keys(by).map(t => t + ' (' + by[t].length + ' سنة)').join(' · ')
    + ' — الصفر المؤكَّد يرفع NAV للوحدة بالكامل. راجعه إن كان الدين مجهولاً لا معدوماً (م.20).');
}
const noPrice = all.filter(e => !String(e.inputs.currentPrice || '').trim());
if (noPrice.length) {
  notes.push(noPrice.length + ' عملية بلا سعر سوقي — القيمة العادلة تُحتسب كاملةً، '
    + 'وهامش الأمان لا يُحتسب لأنه يقارن بالسعر (م.20).');
}
if (repaired) {
  notes.push(repaired + ' حقلاً في ' + rowsTouched + ' عملية تاريخية رُمّم من ملفات تداول الرسمية '
    + '(م.15) — أبرزه ربحية السهم، إذ جمّدها الملف على رقم آخر سنة وكرّرها في كل السنوات.');
}
if (quarantined) {
  notes.push(quarantined + ' حقلاً أُفرِغ لخطأ وحدة (قيمة «للسهم» بالآلاف): '
    + quarantineRows.join(' · ') + ' — الصف يبقى، والحقل يُعلَن ناقصاً لا يُخمَّن (م.20).');
}
if (noOfficial) {
  notes.push(noOfficial + ' عملية بلا مقابل رسمي في المستودع (2284 · 4333 · 4342 · 4348 — مصدرها '
    + 'أرشيف PDF) — تُستورَد كما جاءت بلا ترميم.');
}
// صفٌّ لا يحمل مُدخَل قيمةٍ واحداً لن يُنتج رقماً — يُقال سلفاً لا بعد الحفظ
const DRIVERS = {
  reit:     ['nav', 'ffo', 'noi', 'dividends'],
  bank:     ['bankEps', 'bvps', 'bankDps'],
  cyclical: ['eps', 'normEps', 'fcf', 'normFcf', 'dividends', 'bookValue'],
  normal:   ['eps', 'normEps', 'fcf', 'normFcf', 'dividends', 'bookValue'],
};
const barren = all.filter(e => !(DRIVERS[e.inputs.companyType] || [])
  .some(k => String(e.inputs[k] || '').trim() !== '' && parseFloat(e.inputs[k]) > 0));
if (barren.length) {
  notes.push(barren.length + ' عملية بلا أي مُدخَل قيمة صالح فلن تُنتج قيمة عادلة: '
    + barren.map(e => e.inputs.ticker + '/' + yearOf(e.date)).join(' · ')
    + ' — تُحفَظ بمدخلاتها ونتيجتها فارغة، ولا يُخترَع لها رقم (م.20).');
}

// المقارنة عبر السنوات تحتاج إعادة بيان بعد التجزئة (م.22)
const splitSuspect = [];
[...new Set(all.filter(e => e.src === 'historical').map(e => e.inputs.ticker))].forEach(t => {
  const g = all.filter(e => e.src === 'historical' && e.inputs.ticker === t)
    .map(e => ({ y: yearOf(e.date), b: parseFloat(e.inputs.bookValue) }))
    .filter(x => isFinite(x.b)).sort((a, b) => a.y - b.y);
  for (let i = 1; i < g.length; i++) {
    if (g[i - 1].b > 0 && g[i].b > 0 && g[i - 1].b / g[i].b >= 4) {
      splitSuspect.push(t + ' (' + g[i - 1].y + '→' + g[i].y + ')'); break;
    }
  }
});
if (splitSuspect.length) {
  notes.push('قفزة في القيمة الدفترية تدلّ على تجزئة أو منحة: ' + splitSuspect.join(' · ')
    + ' — كل عملية متّسقة داخلياً، لكن مقارنة السنوات ببعضها تحتاج إعادة بيان (م.22).');
}

// ── التقرير ──
const P = s => process.stdout.write(s + '\n');
perSource.forEach(s => P(s.spec.label + ': ' + s.n + ' عملية · ' + s.tickers + ' سهماً'));
P('');
P('المجموع: ' + all.length + ' عملية · ' + new Set(all.map(e => e.inputs.ticker)).size + ' سهماً · '
  + cols.size + ' حقل مدخلات');
const byTicker = {};
all.forEach(e => { (byTicker[e.inputs.ticker] = byTicker[e.inputs.ticker] || []).push(e); });
P('');
P('الرمز   الاسم                 تاريخي  تصحيح  الإجمالي');
Object.keys(byTicker).sort().forEach(t => {
  const g = byTicker[t];
  const h = g.filter(e => e.src === 'historical').length;
  const c = g.filter(e => e.src === 'corrections').length;
  P('  ' + t.padEnd(6) + String(g[0].inputs.stockName || '').padEnd(22)
    + String(h).padStart(5) + String(c).padStart(7) + String(g.length).padStart(9));
});
P('');
P('الترميم من تداول: ' + repaired + ' حقلاً في ' + rowsTouched + ' عملية · بلا مقابل رسمي: ' + noOfficial
  + ' · حجر صحّي: ' + quarantined + ' حقلاً (استُعيد ' + recovered + ') · مُطبَّع أُعيد بناؤه: ' + normFixed);
if (repairLog.length) {
  P('');
  P('عيّنة من الترميم (' + Math.min(12, repairLog.length) + ' من ' + repairLog.length + '):');
  repairLog.slice(0, 12).forEach(l => P('  ' + l));
}
if (normLog.length) { P(''); P('المُطبَّع:'); normLog.forEach(l => P('  ' + l)); }
if (notes.length) { P(''); P('ملاحظات تُعرَض وقت التطبيق:'); notes.forEach(n => P('  • ' + n)); }

// ── الكتابة ──
const banner = [
  '// ══════════════════════════════════════════════════════════════════════',
  '// 📥 ملف استيراد سجل التقييمات — ' + STAMP,
  '// ----------------------------------------------------------------------',
  '// ⚠️ مُولَّد — لا يُحرَّر يدوياً. أعد تشغيل:',
  '//     node tools/build-valuation-import.js',
  '// المصادر في data/valuation-sources/',
  '//',
  '// **لا يُطبَّق تلقائياً.** يقرؤه زرّ «تطبيق التصحيحات» في صفحة الحاسبة،',
  '// فيعرض ما سيُعدَّل وما سيُضاف، ثم يكتب بجلسة المالك نفسها — فالمفتاح في',
  '// المستودع عامٌّ لا يقرأ سجلّه ولا يكتب فيه (RLS على user_id).',
  '//',
  '// المطابقة بـ`id`: الموجود يُعدَّل، والغائب يُضاف. والتاريخ يُنقل كما هو.',
  '// ══════════════════════════════════════════════════════════════════════',
  '',
].join('\n');

fs.writeFileSync(OUT, banner
  + 'const VAL_IMPORT_AT = ' + JSON.stringify(STAMP) + ';\n'
  + 'const VAL_IMPORT_FIELDS = ' + JSON.stringify([...cols]) + ';\n'
  + 'const VAL_IMPORT_KEEP_IF_EMPTY = ' + JSON.stringify(['notes', 'perplexityEval']) + ';\n'
  + 'const VAL_IMPORT_NOTES = ' + JSON.stringify(notes) + ';\n'
  + 'const VAL_IMPORT = ' + JSON.stringify(all) + ';\n\n'
  + "if (typeof module !== 'undefined' && module.exports) {\n"
  + '  module.exports = { VAL_IMPORT, VAL_IMPORT_AT, VAL_IMPORT_FIELDS,\n'
  + '    VAL_IMPORT_KEEP_IF_EMPTY, VAL_IMPORT_NOTES };\n}\n', 'utf8');
P('');
P('كُتب: js/valuation-import.js  (' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB)');
