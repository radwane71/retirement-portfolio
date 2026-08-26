let snapshots   = [];
let nwAssets    = [];
let nwLiabs     = [];
let autoStocks  = 0;
let autoRe      = 0;
let nwChart     = null;
let _nwChartMode = 'line'; // 'line' | 'bar' | 'compare' | 'table'
let compChart        = null;
let _compMode        = 'donut'; // 'donut' | 'bars' | 'cards'
let editAssetId = null;
let editLiabId  = null;

const ASSET_CAT_AR = { bank:'حساب بنكي / نقدي', sukuk:'صكوك / سندات', vehicle:'مركبة', other:'أخرى' };
const LIAB_CAT_AR  = { credit_card:'بطاقة ائتمان', loan:'قرض', mortgage:'رهن عقاري', other:'أخرى' };

// ══════════════════════════════════════════════════════════════════════
// جسر رموز التصميم — نسخة محلية من مولّدات js/dashboard.js
// هذه الصفحة لا تُحمّل dashboard.js، فنُسِخت الدوال كما هي حرفياً:
//   cssVar · seriesColor · stateColorOf · tint · chartTheme · chartTooltipStyle
//   cardHead · tagHtml · meterHtml · browHtml · noteHtml · kvsHtml
// المصدر الأصلي: js/dashboard.js (أعلى الملف). أي تعديل هناك يُنقل هنا يدوياً.
// قاعدة ملزمة: لا لون سداسي مكتوب يدوياً في هذا الملف — الرموز فقط.
// ══════════════════════════════════════════════════════════════════════
function cssVar(name) {
  // الثيم الفاتح يُعرَّف على body.light-mode لا على :root — نقرأ من body أولاً
  const host = document.body || document.documentElement;
  return getComputedStyle(host).getPropertyValue(name).trim();
}
// لون سلسلة بيانات بالترتيب الثابت (1..6) — لا تُدوَّر عشوائياً
function seriesColor(i) { return cssVar('--series-' + ((Math.abs(i | 0) % 6) + 1)); }
// لون حالة: good / warn / bad — محجوز للحالة فقط، ودائماً مع أيقونة ونص
function stateColorOf(state) {
  return cssVar(state === 'good' ? '--st-good' : state === 'warn' ? '--st-warn'
    : state === 'bad' ? '--st-bad' : '--text-2');
}
// شفافية على رمز تصميم: #rrggbb + قناة ألفا سِتّ‌عشرية (لا لون جديد يُخترع)
function tint(color, aa) {
  const c = String(color || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c + aa : c;
}
// ثيم Chart.js المشتق من رموز التصميم (يتحدّث مع الوضع الفاتح)
function chartTheme() {
  return {
    text:    cssVar('--text'),
    muted:   cssVar('--text-2'),
    surface: cssVar('--bg-2'),
    border:  cssVar('--border'),
    grid:    tint(cssVar('--border'), 'aa'),
    accent:  cssVar('--accent'),
    font:    'Tajawal',
  };
}
// إعدادات tooltip موحّدة
function chartTooltipStyle() {
  const t = chartTheme();
  return {
    backgroundColor: t.surface, titleColor: t.text, bodyColor: t.muted,
    borderColor: t.border, borderWidth: 1,
    titleFont: { family: t.font }, bodyFont: { family: t.font },
  };
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
// صف وزن في قائمة (.brow)
function browHtml({ name, color, pct, valueTxt, diffTxt = '', diffState = '', barPct = null, title = '', sub = '' }) {
  const w = Math.max(0, Math.min(100, barPct == null ? pct : barPct)).toFixed(1);
  const dColor = diffState ? stateColorOf(diffState) : cssVar('--text-2');
  return `<div class="brow"${title ? ` title="${title}"` : ''}>
      <div class="br-k"><span class="dot" style="background:${color}"></span><span>${name}</span>${sub ? `<span class="small text-muted num">${sub}</span>` : ''}</div>
      <div class="br-track"><div class="br-fill" style="width:${w}%;background:${color}"></div></div>
      <div class="br-v">${valueTxt}${diffTxt ? `<span class="d" style="color:${dColor}">${diffTxt}</span>` : ''}</div>
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

// ── ألوان مصادر الثروة — رموز سلاسل ثابتة لكل مصدر (هوية لا حالة) ──
const NW_SERIES = { stocks: 0, realestate: 1, manual: 5, liabs: 4 };

// ══════════════════════════════════════════════════════════════════════
// اللقطة التلقائية مقابل اللقطة اليدوية — تمييز إلزامي
// التلقائية (لوحة التحكم) تسجّل: أسهم + نقد الوسيط + عقار، بلا أصول يدوية
// وبلا التزامات. اليدوية (هذه الصفحة) = أسهم + عقار + أصول يدوية − التزامات.
// الرقمان يقيسان شيئين مختلفين ⇒ ممنوع طرح أحدهما من الآخر أو رسمهما كسلسلة
// واحدة. الكشف: notes تبدأ بـ 'auto' (كما يكتبها _autoSnapshotPortfolio).
// ══════════════════════════════════════════════════════════════════════
function isAutoSnap(s) { return String((s && s.notes) || '').startsWith('auto'); }
function snapKindLabel(s) { return isAutoSnap(s) ? 'تلقائية' : 'يدوية'; }

// التغيير لكل لقطة = الفرق عن أحدث لقطة سابقة **من نفس النوع**.
// المُدخل مرتّب تصاعدياً؛ المُخرج مصفوفة موازية (null = لا سابقة مقارنة).
function computeSnapChanges(sortedAsc) {
  const lastByKind = { auto: null, manual: null };
  return sortedAsc.map(s => {
    const k    = isAutoSnap(s) ? 'auto' : 'manual';
    const prev = lastByKind[k];
    lastByKind[k] = s;
    return prev ? (+s.total_value || 0) - (+prev.total_value || 0) : null;
  });
}

// ترتيب تصاعدي آمن (تاريخ ناقص لا يُسقط الصفحة)
function sortedSnapsAsc() {
  return [...snapshots].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

// ── شروحات الكروت (showCardInfo المشتركة في utils.js) ──
window.CARD_INFO = {
  'networth-bar': {
    title: '🏦 صافي الثروة',
    body: `
      <p>«صافي الثروة» هو مقياسك الأشمل: كل ما تملكه ناقص كل ما عليك. إذا تابعته بانتظام عرفت هل ثروتك تنمو فعلاً.</p>
      <div class="info-formula"><strong>صافي الثروة = إجمالي الأصول − إجمالي الالتزامات</strong></div>
      <div class="info-math">
        إجمالي الأصول = قيمة الأسهم (تلقائي) + العقارات (تلقائي) + الأصول اليدوية (بنك، صكوك، سيارة…)<br>
        ⚠️ رصيد الوساطة ومحفظة الصكوك <strong>لا يُجلبان تلقائياً هنا</strong> — أضفهما يدوياً.<br>
        − إجمالي الالتزامات = القروض + بطاقات الائتمان + الرهن…
      </div>
      <p class="info-note">💡 الأسهم والعقارات تُجلب تلقائياً من صفحاتها؛ أضف يدوياً ما تبقّى (رصيد بنكي، صكوك، سيارة) ليكتمل الرقم.</p>`
  },
  'composition': {
    title: '📊 مصادر الثروة',
    body: `
      <p>يوضّح هذا الرسم من أين تأتي ثروتك (الأصول) ومقابلها ما عليك من التزامات، حتى ترى توازن وضعك المالي.</p>
      <div class="info-math">النِّسب هنا محسوبة على <strong>الإجمالي القائم = الأصول + الالتزامات</strong> (لا على الأصول وحدها)، حتى تجمع الشرائح الأربع 100%.</div>
      <p class="info-note">💡 الاعتماد المفرط على نوع أصل واحد (مثلاً كل ثروتك في عقار واحد) مخاطرة — التنويع بين فئات الأصول يحميك.</p>`
  },
  'nw-history': {
    title: '📉 مسار صافي الثروة',
    body: `
      <p>يرسم تطوّر صافي ثروتك عبر «اللقطات» التي تحفظها مع الوقت — اتجاه صاعد ثابت هو الهدف.</p>
      <div class="info-formula">وضع «مقارنة» يفصل الأصول عن الالتزامات لترى أيّهما يتحرك.</div>
      <div class="info-math">
        ✎ <strong>اللقطة اليدوية</strong> (من هذه الصفحة) = الأسهم + العقار + أصولك اليدوية − الالتزامات.<br>
        ⚠️ <strong>رصيد الوساطة والصكوك خارج هذا الرقم</strong> — لوحة التحكم تجمعهما
        في إجمالي الأصول وهذه الصفحة لا. أضفهما أصلين يدويين إن أردتهما داخله —
        ولا يُضافان تلقائياً لئلا يُحتسبا مرتين إن كنتَ أضفتهما أصلاً.<br>
        ✦ <strong>اللقطة التلقائية</strong> (تُكتب عند فتح لوحة التحكم) = أسهم + نقد الوسيط + عقار فقط — بلا أصول يدوية وبلا التزامات.
      </div>
      <p class="info-note">💡 لأنهما يقيسان شيئين مختلفين تُرسمان كسلسلتين منفصلتين، والتغيير يُحسب داخل كل نوع على حدة.</p>`
  },
  'snapshots': {
    title: '📸 اللقطات التاريخية',
    body: `
      <p>«اللقطة» تسجيل لقيمة ثروتك في لحظة معيّنة. اللقطة اليدوية لا تتحدّث تلقائياً — أنت من يحفظها بزر «حفظ لقطة الآن».</p>
      <div class="info-formula">عمود «التغيير» = قيمة هذه اللقطة − قيمة أحدث لقطة سابقة <strong>من نفس المصدر</strong></div>
      <p class="info-note">💡 استخدم «تنظيف (لقطة/شهر)» لإبقاء لقطة واحدة لكل شهر ومنع ازدحام الجدول (تُفضَّل اليدوية).</p>`
  },
};

function edNw(table, rowId, field, type, raw, extraCls = '') {
  return `class="editable${type==='number'?' num':''}${extraCls?' '+extraCls:''}" ` +
    `data-table="${table}" data-id="${esc(rowId)}" data-field="${field}" ` +
    `data-type="${type}" data-raw="${esc(raw)}"`;
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  setActiveNav('nav-networth');
  try {
    await loadAll();
  } catch (e) {
    console.error(e);   // الرسالة عُرضت في loadAll — نمنع الرفض غير المعالَج
    return;             // ولا تُرسَم الصفحة على بيانات ناقصة
  }
  renderTotals();
  renderCompositionChart();
  renderAssetsTable();
  renderLiabTable();
  renderChart();
  renderSnapshotTable();
}

async function loadAll() {
  const [rSnap, rAssets, rLiabs, rHoldings, rRe] = await Promise.all([
    supabaseClient.from('net_worth_snapshots').select('*').order('date', { ascending: true }),
    supabaseClient.from('nw_assets').select('*').eq('is_active', true).order('category'),
    supabaseClient.from('nw_liabilities').select('*').eq('is_active', true).order('category'),
    supabaseClient.from('holdings').select('shares, current_price'),
    supabaseClient.from('real_estate').select('current_value, status').eq('is_active', true)
  ]);

  // ══════════════════════════════════════════════════════════════════
  // فحص الأخطاء إلزامي: supabase-js **يفي بالوعد عند الخطأ** ولا يرمي،
  // فـ`Promise.all` ينجح و`.data` يصير null و`|| []` يبتلعه. وفشلُ
  // `holdings` وحده يعرض **صافي ثروة أصغر** بمقدار المحفظة كلها بلا أي
  // إنذار — وقد تُحفَظ اللقطة على هذا الرقم فيدخل السلسلة التاريخية.
  // بيانٌ لم يصل ليس بياناً صفر (م.20 و21).
  // ══════════════════════════════════════════════════════════════════
  const _errs = [
    ['اللقطات', rSnap], ['الأصول', rAssets], ['الالتزامات', rLiabs],
    ['الحيازات', rHoldings], ['العقارات', rRe],
  ].filter(([, r]) => r && r.error).map(([n, r]) => `${n}: ${r.error.message || 'خطأ'}`);
  if (_errs.length) {
    showToast(`⛔ تعذّر تحميل البيانات — ${_errs.join(' · ')}. لم تُرسَم الصفحة، ولا تحفظ لقطة الآن.`, 'error');
    throw new Error('networth loadAll failed: ' + _errs.join(' | '));
  }

  snapshots = rSnap.data || [];
  nwAssets  = rAssets.data || [];
  nwLiabs   = rLiabs.data || [];
  // AUDIT-FIX (2026-08): حارس NaN — سعر/عدد أسهم غير رقمي كان يُنتج NaN يتسرّب
  // إلى إجمالي الأصول وصافي الثروة وكل النِّسب المبنية عليهما.
  autoStocks = (rHoldings.data || []).reduce((s, h) => s + (+h.shares || 0) * (+h.current_price || 0), 0);
  autoRe     = (rRe.data || []).filter(p => p.status !== 'sold').reduce((s, p) => s + (+p.current_value || 0), 0);
}

// ══════════════════════════════════════════════════════════════════════
// ⚠️ ما يشمله هذا الرقم — ومَن خارجه
// ----------------------------------------------------------------------
// المصدران التلقائيان هنا اثنان فقط: الأسهم والعقار. و**رصيد الوساطة
// والصكوك خارجهما** رغم أن التطبيق يتتبّعهما (لوحة التحكم تجمعهما في
// `totalAssets`). فالرقم المسمّى «صافي الثروة الكامل» أقلّ من الحقيقة.
//
// لا يُضافان تلقائياً هنا عمداً: لو أضافهما المالك أصلاً كأصلين يدويين
// لاحتُسبا **مرتين** — وازدواج الحساب أسوأ من النقص لأنه لا يُرى. القرار
// للمالك، والفجوة تُسمّى صراحةً في وصف البطاقة بدل أن تُبتلع (م.20).
// ══════════════════════════════════════════════════════════════════════
function calcTotals() {
  const manualAssets = nwAssets.reduce((s, a) => s + (+a.value || 0), 0);
  const totalAssets  = autoStocks + autoRe + manualAssets;
  const totalLiabs   = nwLiabs.reduce((s, l) => s + (+l.value || 0), 0);
  const net          = totalAssets - totalLiabs;
  return { totalAssets, totalLiabs, net, manualAssets };
}

// ── ① الرقم القائد + بطاقتا الأصول/الالتزامات ────────────────
function renderTotals() {
  const { totalAssets, totalLiabs, net, manualAssets } = calcTotals();
  const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  // ملخّص الأصول اليدوية والالتزامات في تذييل الجدولين
  const assEl = document.getElementById('assets-subtotal');
  if (assEl) assEl.textContent = formatSAR(manualAssets);
  const liabEl = document.getElementById('liab-subtotal');
  if (liabEl) liabEl.textContent = formatSAR(totalLiabs);

  // ── الرقم القائد ──
  // نسبة الالتزامات إلى الأصول: المقام = الأصول. عند غياب الأصول لا تُحسب
  // (المقام صفر) — تُعلن «غير محسوبة» ولا تُعرض صفراً مضلّلاً.
  const hasAssets = totalAssets > 0;
  const liabRatio = hasAssets ? (totalLiabs / totalAssets * 100) : null;
  const ratioState = liabRatio == null ? '' : liabRatio <= 30 ? 'good' : liabRatio <= 50 ? 'warn' : 'bad';
  const netState   = net > 0 ? 'good' : net < 0 ? 'bad' : '';

  const heroTag = net > 0 ? tagHtml('✅', 'ثروة موجبة', 'good')
                : net < 0 ? tagHtml('⚠️', 'التزاماتك تتجاوز أصولك', 'bad')
                : tagHtml('•', 'لا بيانات بعد', '');

  const meter = liabRatio == null
    ? noteHtml('ℹ️', 'نسبة الالتزامات إلى الأصول غير محسوبة — لا توجد أصول مسجّلة (القسمة على صفر).', totalLiabs > 0 ? 'bad' : '')
    : meterHtml({
        label: 'نسبة الالتزامات إلى الأصول',
        valueTxt: formatNum(liabRatio, 1) + '%',
        pct: liabRatio, state: ratioState, markPct: 30,
        foot: `العلامة عند 30% — كل 100 ريال أصول يقابلها ${formatNum(liabRatio, 1)} ريال دَين. (كلما قلّت كان أأمن)`
      });

  setHtml('nw-hero', `<div class="stack">
    <div class="nw-hero-row">
      <div>
        <div class="hero-num num" style="color:${stateColorOf(netState)}">${formatSAR(net, true)}</div>
        <div class="hero-cap">صافي الثروة الآن = ${formatSAR(totalAssets)} أصول − ${formatSAR(totalLiabs)} التزامات</div>
      </div>
      <div>${heroTag}</div>
    </div>
    ${meter}
    ${kvsHtml([
      ['إجمالي الأصول', formatSAR(totalAssets)],
      ['إجمالي الالتزامات', formatSAR(totalLiabs)],
      ['أصول تلقائية (أسهم + عقار)', formatSAR(autoStocks + autoRe)],
      ['أصول يدوية', formatSAR(manualAssets)],
    ])}
    ${totalLiabs === 0 && hasAssets
      ? noteHtml('🟢', 'لا التزامات مسجّلة — صافي الثروة يساوي إجمالي الأصول.', 'good')
      : ''}
  </div>`);

  // ── بطاقة الأصول ──
  const aGroups = [
    { name: 'محفظة الأسهم', value: autoStocks, color: seriesColor(NW_SERIES.stocks), sub: 'تلقائي' },
    { name: 'العقارات',      value: autoRe,     color: seriesColor(NW_SERIES.realestate), sub: 'تلقائي' },
  ];
  const byAssetCat = {};
  nwAssets.forEach(a => {
    const k = a.category || 'other';
    byAssetCat[k] = (byAssetCat[k] || 0) + (+a.value || 0);
  });
  Object.keys(byAssetCat).forEach((k, i) => aGroups.push({
    name: ASSET_CAT_AR[k] || k, value: byAssetCat[k], color: seriesColor(2 + i), sub: 'يدوي'
  }));

  setHtml('nw-assets-hero', `<div class="nw-hero-row">
    <div>
      <div class="hero-num num">${formatSAR(totalAssets)}</div>
      <div class="hero-cap">إجمالي ما تملك</div>
    </div>
    <div>${tagHtml('📦', `${aGroups.filter(g => g.value > 0).length} مصادر`, '')}</div>
  </div>`);

  const aRows = aGroups.filter(g => g.value > 0).map(g => browHtml({
    name: esc(g.name), sub: g.sub, color: g.color,
    pct: hasAssets ? g.value / totalAssets * 100 : 0,
    valueTxt: formatSAR(g.value),
    diffTxt: hasAssets ? formatNum(g.value / totalAssets * 100, 1) + '%' : '—',
  })).join('');
  setHtml('nw-assets-rows', aRows || noteHtml('📭', 'لا توجد أصول بعد — أضف رصيدك البنكي أو صكوكك بزر «+ إضافة أصل».', ''));

  // ── بطاقة الالتزامات ──
  const byLiabCat = {};
  nwLiabs.forEach(l => {
    const k = l.category || 'other';
    byLiabCat[k] = (byLiabCat[k] || 0) + (+l.value || 0);
  });
  const lKeys = Object.keys(byLiabCat);

  setHtml('nw-liab-hero', `<div class="nw-hero-row">
    <div>
      <div class="hero-num num" style="color:${totalLiabs > 0 ? stateColorOf('bad') : ''}">${formatSAR(totalLiabs)}</div>
      <div class="hero-cap">إجمالي ما عليك${hasAssets ? ` — ${formatNum(liabRatio, 1)}% من أصولك` : ''}</div>
    </div>
    <div>${totalLiabs > 0 ? tagHtml('🔴', `${nwLiabs.length} التزام`, ratioState === 'good' ? 'good' : ratioState || '') : tagHtml('🟢', 'بلا ديون', 'good')}</div>
  </div>`);

  const lRows = lKeys.map((k, i) => browHtml({
    name: esc(LIAB_CAT_AR[k] || k), color: seriesColor(NW_SERIES.liabs),
    pct: totalLiabs > 0 ? byLiabCat[k] / totalLiabs * 100 : 0,
    valueTxt: formatSAR(byLiabCat[k]),
    diffTxt: totalLiabs > 0 ? formatNum(byLiabCat[k] / totalLiabs * 100, 1) + '%' : '—',
    sub: 'من الالتزامات',
  })).join('');
  setHtml('nw-liab-rows', lRows || noteHtml('🟢', 'لا التزامات مسجّلة — ممتاز. أضف أي قرض أو بطاقة ائتمان ليبقى الرقم صادقاً.', 'good'));
}

function renderAssetsTable() {
  const tbody = document.getElementById('assets-tbody');
  if (!tbody) return;
  if (!nwAssets.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><p class="small text-muted">لا توجد أصول مضافة — اضغط "+ إضافة أصل"</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = nwAssets.map(a => `<tr>
    <td class="small text-muted">${esc(ASSET_CAT_AR[a.category] || a.category)}</td>
    <td ${edNw('nw_assets',a.id,'name','text',a.name,'bold')}>${esc(a.name)}</td>
    <td ${edNw('nw_assets',a.id,'value','number',a.value,'num')}>${formatSAR(a.value)}</td>
    <td><div class="flex gap-2">
      <button class="btn btn-secondary btn-sm" onclick="openAssetModal('${esc(a.id)}')">تعديل</button>
      <button class="btn btn-danger btn-sm"    onclick="deleteAsset('${esc(a.id)}')">حذف</button>
    </div></td>
  </tr>`).join('');
  enableInlineEditing(tbody, async (id, field, val) => { const a = nwAssets.find(x => x.id === id); if (a) a[field] = val; renderTotals(); renderCompositionChart(); renderAssetsTable(); });
}

function renderLiabTable() {
  const tbody = document.getElementById('liab-tbody');
  if (!tbody) return;
  if (!nwLiabs.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><p class="small text-muted">لا توجد التزامات — اضغط "+ إضافة التزام"</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = nwLiabs.map(l => `<tr>
    <td class="small text-muted">${esc(LIAB_CAT_AR[l.category] || l.category)}</td>
    <td ${edNw('nw_liabilities',l.id,'name','text',l.name,'bold')}>${esc(l.name)}</td>
    <td ${edNw('nw_liabilities',l.id,'value','number',l.value,'num')}>${formatSAR(l.value)}</td>
    <td><div class="flex gap-2">
      <button class="btn btn-secondary btn-sm" onclick="openLiabModal('${esc(l.id)}')">تعديل</button>
      <button class="btn btn-danger btn-sm"    onclick="deleteLiab('${esc(l.id)}')">حذف</button>
    </div></td>
  </tr>`).join('');
  enableInlineEditing(tbody, async (id, field, val) => { const l = nwLiabs.find(x => x.id === id); if (l) l[field] = val; renderTotals(); renderCompositionChart(); renderLiabTable(); });
}

// ── Composition Chart: mode switcher ─────────────────────────
function setCompMode(mode) {
  _compMode = mode;
  ['donut','bars','cards'].forEach(m => document.getElementById('cm-' + m)?.classList.toggle('active', m === mode));
  renderCompositionChart();
}

// ── ③ مصادر الثروة ────────────────────────────────────────────
function renderCompositionChart() {
  const { totalAssets, totalLiabs, net, manualAssets } = calcTotals();
  // المقام: الإجمالي القائم = الأصول + الالتزامات — تجمع الشرائح الأربع 100%
  const totalGross = totalAssets + totalLiabs;

  const segments = [
    { label: 'محفظة الأسهم', icon: '📈', value: autoStocks,   color: seriesColor(NW_SERIES.stocks) },
    { label: 'العقارات',      icon: '🏠', value: autoRe,       color: seriesColor(NW_SERIES.realestate) },
    { label: 'أصول أخرى',     icon: '🏦', value: manualAssets, color: seriesColor(NW_SERIES.manual) },
    { label: 'الالتزامات',    icon: '🔴', value: -totalLiabs,  color: seriesColor(NW_SERIES.liabs) },
  ].filter(s => Math.abs(s.value) > 0);

  // العنوان الفرعي — يُحدَّث في كل الأوضاع
  const sub = document.getElementById('nw-comp-subtitle');
  if (sub) {
    // AUDIT-FIX (2026-08): نسبة الالتزامات لا تُعرض صفراً عند غياب الأصول (قسمة على صفر)
    const liabPct = totalAssets > 0 ? formatNum(totalLiabs / totalAssets * 100, 1) + '%' : 'غير محسوبة';
    sub.textContent = `صافي الثروة ${formatSAR(net)} · الالتزامات إلى الأصول ${liabPct}`;
  }

  const chartArea = document.getElementById('nw-comp-chart-area');
  const altArea   = document.getElementById('nw-comp-alt-area');

  if (_compMode === 'bars' || _compMode === 'cards') {
    if (compChart) { compChart.destroy(); compChart = null; }
    if (chartArea) chartArea.hidden = true;
    if (altArea) {
      altArea.hidden = false;
      altArea.innerHTML = !segments.length
        ? noteHtml('📭', 'لا توجد بيانات — أضف أصولاً أو التزامات أولاً.', '')
        : _compMode === 'bars' ? _renderCompBars(segments, totalGross)
                               : _renderCompCards(segments, totalGross, net);
    }
    return;
  }

  // donut
  if (altArea)   altArea.hidden = true;
  if (chartArea) chartArea.hidden = false;

  const canvas = document.getElementById('nwCompChart');
  const legend = document.getElementById('nw-comp-legend');
  if (!canvas) return;

  if (compChart) { compChart.destroy(); compChart = null; }
  if (totalGross === 0 || !segments.length) {
    if (legend) legend.innerHTML = noteHtml('📭', 'لا توجد بيانات — أضف أصولاً أو التزامات أولاً.', '');
    return;
  }

  const th = chartTheme();
  compChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: segments.map(s => s.label),
      datasets: [{
        data: segments.map(s => Math.abs(s.value)),
        backgroundColor: segments.map(s => tint(s.color, 'cc')),
        borderColor: th.surface, borderWidth: 2, hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: Object.assign(chartTooltipStyle(), {
          callbacks: { label: ctx => {
            const seg = segments[ctx.dataIndex];
            const pct = formatNum(Math.abs(seg.value) / totalGross * 100, 1);
            return ` ${seg.label}: ${formatSAR(Math.abs(seg.value))} (${pct}%)`;
          } }
        })
      }
    }
  });

  if (legend) {
    legend.innerHTML = segments.map(s => browHtml({
      name: `${s.icon} ${s.label}`, color: s.color,
      pct: Math.abs(s.value) / totalGross * 100,
      valueTxt: formatSAR(Math.abs(s.value)),
      diffTxt: formatNum(Math.abs(s.value) / totalGross * 100, 1) + '%',
      title: 'النسبة من الإجمالي القائم (أصول + التزامات)',
    })).join('') + `<div class="meter-foot mt-2">النِّسب من الإجمالي القائم = الأصول + الالتزامات (${formatSAR(totalGross)})</div>`;
  }
}

function _renderCompBars(segments, totalGross) {
  const maxVal = Math.max(...segments.map(s => Math.abs(s.value)));
  return `<div class="stack-2 mt-4">` + segments.map(s => browHtml({
    name: `${s.icon} ${s.label}`, color: s.color,
    pct:    totalGross > 0 ? Math.abs(s.value) / totalGross * 100 : 0,
    barPct: maxVal    > 0 ? Math.abs(s.value) / maxVal * 100      : 0,
    valueTxt: formatSAR(Math.abs(s.value)),
    diffTxt:  totalGross > 0 ? formatNum(Math.abs(s.value) / totalGross * 100, 1) + '%' : '—',
    title: 'طول الشريط نسبةً لأكبر شريحة · النسبة من الإجمالي القائم',
  })).join('') + `<div class="meter-foot">طول الشريط مقارنةً بأكبر شريحة — والنسبة المكتوبة من الإجمالي القائم (${formatSAR(totalGross)})</div></div>`;
}

function _renderCompCards(segments, totalGross, net) {
  const cards = segments.map(s => {
    const pct = totalGross > 0 ? (Math.abs(s.value) / totalGross * 100) : 0;
    return `<div class="w-card" style="--card-accent:${s.color}">
      ${meterHtml({
        label: `${s.icon} ${esc(s.label)}`,
        valueTxt: formatNum(pct, 1) + '%',
        pct, fillColor: s.color,
        foot: formatSAR(Math.abs(s.value)),
      })}
    </div>`;
  });
  cards.push(`<div class="w-card" style="--card-accent:${stateColorOf(net >= 0 ? 'good' : 'bad')}">
    <div class="meter-head"><span class="k">🏦 صافي الثروة</span></div>
    <div class="bold num" style="color:${stateColorOf(net >= 0 ? 'good' : 'bad')}">${formatSAR(net)}</div>
    <div class="meter-foot">${net >= 0 ? 'أصولك تتجاوز التزاماتك' : 'التزاماتك تتجاوز أصولك'}</div>
  </div>`);
  return `<div class="w-cards-grid">${cards.join('')}</div>`;
}

// ── ④ المسار التاريخي ─────────────────────────────────────────
function setNwChartMode(mode) {
  _nwChartMode = mode;
  ['line','bar','compare','table'].forEach(m => document.getElementById('nwm-' + m)?.classList.toggle('active', m === mode));
  renderChart();
}

function renderChart() {
  const wrap      = document.getElementById('nwChart-wrap');
  const tableArea = document.getElementById('nwChart-table');
  const canvas    = document.getElementById('nwChart');
  const noteEl    = document.getElementById('nw-hist-note');
  const subEl     = document.getElementById('nw-hist-sub');

  const sorted   = sortedSnapsAsc();
  const autoN    = sorted.filter(isAutoSnap).length;
  const manualN  = sorted.length - autoN;
  if (subEl) subEl.textContent = sorted.length
    ? `${sorted.length} لقطة · ✎ يدوية ${manualN} · ✦ تلقائية ${autoN}`
    : 'لا لقطات بعد';

  // ملاحظة دائمة: السلسلتان تقيسان شيئين مختلفين
  if (noteEl) {
    noteEl.innerHTML = (autoN && manualN)
      ? noteHtml('⚠️', '<b>سلسلتان مختلفتان:</b> ✎ اليدوية = أسهم + عقار + أصولك اليدوية − الالتزامات · ✦ التلقائية = أسهم + نقد + عقار فقط. لا تُقارَن نقطة من هذه بنقطة من تلك.', 'warn')
      : autoN
        ? noteHtml('ℹ️', 'كل اللقطات المعروضة <b>تلقائية</b> (أسهم + نقد + عقار فقط، بلا التزامات). اضغط «حفظ لقطة الآن» لتسجيل صافي ثروتك الكامل.', '')
        : '';
  }

  // AUDIT-FIX (2026-08): empty-state القديم كان يدمّر الـ canvas بـ innerHTML فلا يظهر
  // الرسم أبداً بعد حفظ أول لقطة. نستخدم عنصر رسالة منفصلاً يُنشأ مرة واحدة
  // ويُخفى/يُظهر — والـ canvas يبقى في الـ DOM دائماً.
  let emptyMsg = document.getElementById('nwChart-empty-msg');
  if (!emptyMsg && wrap) {
    emptyMsg = document.createElement('div');
    emptyMsg.id = 'nwChart-empty-msg';
    emptyMsg.hidden = true;
    emptyMsg.innerHTML = `<div class="empty-state"><div class="icon">📉</div><p>احفظ لقطات لعرض المخطط التاريخي</p></div>`;
    wrap.appendChild(emptyMsg);
  }

  if (!sorted.length) {
    if (nwChart) { nwChart.destroy(); nwChart = null; }
    if (canvas)    canvas.hidden = true;
    if (emptyMsg)  emptyMsg.hidden = false;
    if (wrap)      wrap.hidden = false;
    if (tableArea) tableArea.hidden = true;
    return;
  }
  if (emptyMsg) emptyMsg.hidden = true;
  if (canvas)   canvas.hidden = false;

  const labels = sorted.map(s => formatDate(s.date));

  if (_nwChartMode === 'table') {
    if (nwChart) { nwChart.destroy(); nwChart = null; }
    if (wrap)      wrap.hidden = true;
    if (tableArea) { tableArea.hidden = false; tableArea.innerHTML = _buildNwTable(sorted); }
    return;
  }

  if (wrap)      { wrap.hidden = false; if (!canvas) return; }
  if (tableArea) tableArea.hidden = true;
  if (nwChart) { nwChart.destroy(); nwChart = null; }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const th       = chartTheme();
  const cManual  = cssVar('--accent');
  const cAuto    = seriesColor(1);
  const tooltipCb = {
    label: c => ' ' + c.dataset.label + ': ' + formatSAR(c.parsed.y),
    afterLabel: c => {
      const s = sorted[c.dataIndex];
      return s ? (isAutoSnap(s) ? '✦ تلقائية — أسهم + نقد + عقار' : '✎ يدوية — أسهم + عقار + أصول يدوية − التزامات') : '';
    }
  };
  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom', labels: { color: th.muted, font: { family: th.font, size: 11 }, usePointStyle: true, padding: 12 } },
      tooltip: Object.assign(chartTooltipStyle(), { callbacks: tooltipCb }),
    },
    scales: {
      x: { ticks: { color: th.muted, font: { family: th.font, size: 11 } }, grid: { color: th.grid } },
      y: { ticks: { color: th.muted, font: { family: th.font, size: 11 }, callback: v => formatNum(v/1000,0)+'K' }, grid: { color: th.grid } },
    }
  };

  // AUDIT-FIX (2026-08): فصل اللقطة اليدوية عن التلقائية إلى سلسلتين —
  // رسمهما كخط واحد كان يوحي بقفزات/هبوط وهمية بين مقياسين مختلفين.
  const manualData = sorted.map(s => isAutoSnap(s) ? null : (+s.total_value || 0));
  const autoData   = sorted.map(s => isAutoSnap(s) ? (+s.total_value || 0) : null);

  if (_nwChartMode === 'bar') {
    nwChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [
        { label: '✎ صافي الثروة (يدوي)', data: manualData, backgroundColor: tint(cManual, 'bf'), borderColor: cManual, borderWidth: 1.5, borderRadius: 4 },
        { label: '✦ أسهم+نقد+عقار (تلقائي)', data: autoData, backgroundColor: tint(cAuto, 'bf'), borderColor: cAuto, borderWidth: 1.5, borderRadius: 4 },
      ].filter(d => d.data.some(v => v != null)) },
      options: baseOpts
    });
    return;
  }

  if (_nwChartMode === 'compare') {
    // الأصول/الالتزامات متاحة فقط في اللقطات اليدوية (snapshot_json)
    const datasets = [
      { label: 'إجمالي الأصول', data: sorted.map(s => s.snapshot_json ? (+s.snapshot_json.total_assets || 0) : null),
        borderColor: stateColorOf('good'), backgroundColor: tint(stateColorOf('good'), '14'), borderWidth: 2, pointRadius: 3, fill: false, tension: 0.3, spanGaps: true },
      { label: 'الالتزامات', data: sorted.map(s => s.snapshot_json ? (+s.snapshot_json.total_liabs || 0) : null),
        borderColor: stateColorOf('bad'), backgroundColor: tint(stateColorOf('bad'), '14'), borderWidth: 2, pointRadius: 3, fill: false, tension: 0.3, spanGaps: true },
      { label: '✎ صافي الثروة (يدوي)', data: manualData,
        borderColor: cManual, backgroundColor: tint(cManual, '14'), borderWidth: 2.5, pointRadius: 4, fill: true, tension: 0.3, spanGaps: true },
      { label: '✦ أسهم+نقد+عقار (تلقائي)', data: autoData,
        borderColor: cAuto, backgroundColor: tint(cAuto, '14'), borderWidth: 2, borderDash: [5,4], pointRadius: 3, fill: false, tension: 0.3, spanGaps: true },
    ].filter(d => d.data.some(v => v != null));
    nwChart = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: baseOpts });
    return;
  }

  // default: line
  nwChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { label: '✎ صافي الثروة (يدوي)', data: manualData, borderColor: cManual, backgroundColor: tint(cManual, '14'),
        borderWidth: 2.5, pointBackgroundColor: cManual, pointRadius: 4, pointHoverRadius: 7, fill: true, tension: 0.3, spanGaps: true },
      { label: '✦ أسهم+نقد+عقار (تلقائي)', data: autoData, borderColor: cAuto, backgroundColor: tint(cAuto, '14'),
        borderWidth: 2, borderDash: [5,4], pointBackgroundColor: cAuto, pointRadius: 3, pointHoverRadius: 6, fill: false, tension: 0.3, spanGaps: true },
    ].filter(d => d.data.some(v => v != null)) },
    options: baseOpts
  });
}

function _buildNwTable(sortedAsc) {
  if (!sortedAsc.length) return `<p class="small text-muted">لا توجد لقطات</p>`;
  const changes = computeSnapChanges(sortedAsc);
  const idx     = sortedAsc.map((s, i) => i).reverse();   // الأحدث أولاً
  const rows = idx.map(i => {
    const s      = sortedAsc[i];
    const change = changes[i];
    const auto   = isAutoSnap(s);
    const assets = s.snapshot_json ? formatSAR(s.snapshot_json.total_assets) : '—';
    const liabs  = s.snapshot_json ? formatSAR(s.snapshot_json.total_liabs)  : '—';
    const chgState = change == null ? '' : change > 0 ? 'good' : change < 0 ? 'bad' : '';
    return `<tr>
      <td>${auto ? tagHtml('✦', 'تلقائية', '') : tagHtml('✎', 'يدوية', 'good')}</td>
      <td>${formatDate(s.date)}</td>
      <td class="num">${assets}</td>
      <td class="num">${liabs}</td>
      <td class="num bold">${formatSAR(s.total_value)}</td>
      <td class="num" style="color:${stateColorOf(chgState)}">${change == null ? '—' : formatSAR(change, true)}</td>
    </tr>`;
  }).join('');
  return `<table>
    <thead><tr><th>المصدر</th><th>التاريخ</th><th>الأصول</th><th>الالتزامات</th><th>القيمة المسجَّلة</th><th>التغير عن نفس المصدر</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── ⑤ جدول اللقطات ────────────────────────────────────────────
function renderSnapshotTable() {
  const tbody = document.getElementById('nw-tbody');
  if (!tbody) return;
  if (!snapshots.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">🏦</div><p>لا توجد لقطات — اضغط "حفظ لقطة الآن"</p></div></td></tr>`;
    enableInlineEditing(tbody, onSnapSaved);
    return;
  }
  const asc     = sortedSnapsAsc();
  const changes = computeSnapChanges(asc);
  const order   = asc.map((s, i) => i).reverse();   // الأحدث أولاً

  tbody.innerHTML = order.map(i => {
    const s        = asc[i];
    const change   = changes[i];
    const auto     = isAutoSnap(s);
    const chgState = change == null ? '' : change > 0 ? 'good' : change < 0 ? 'bad' : '';
    const hasDetail = !!s.snapshot_json;
    return `<tr>
      <td title="${auto ? 'لقطة تلقائية من لوحة التحكم: أسهم + نقد + عقار فقط' : 'لقطة يدوية: أسهم + عقار + أصولك اليدوية − الالتزامات (رصيد الوساطة والصكوك خارجه)'}">
        ${auto ? tagHtml('✦', 'تلقائية', '') : tagHtml('✎', 'يدوية', 'good')}
      </td>
      <td ${edNw('net_worth_snapshots',s.id,'date','date',s.date)}>${formatDate(s.date)}</td>
      <td ${edNw('net_worth_snapshots',s.id,'total_value','number',s.total_value,'bold num')}>${formatSAR(s.total_value)}</td>
      <td class="num" style="color:${stateColorOf(chgState)}" title="مقارنة بأحدث لقطة سابقة من نفس المصدر">${change == null ? '—' : formatSAR(change, true)}</td>
      <td ${edNw('net_worth_snapshots',s.id,'notes','text',s.notes||'','text-muted small')}>${esc(s.notes || '—')}</td>
      <td>
        ${hasDetail
          ? `<button class="btn btn-secondary btn-sm" onclick="openSnapshotDetail('${esc(s.id)}')">📋 تفاصيل</button>`
          : `<span class="small text-muted">—</span>`}
      </td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteSnapshot('${esc(s.id)}')">حذف</button></td>
    </tr>`;
  }).join('');
  enableInlineEditing(tbody, onSnapSaved);
}

async function onSnapSaved(id, field, val) {
  const s = snapshots.find(x => x.id === id);
  if (s) { s[field] = val; if (field === 'date') snapshots = sortedSnapsAsc(); }
  renderChart(); renderSnapshotTable();
}

// ── Snapshot Detail Modal ─────────────────────────────────────
function openSnapshotDetail(id) {
  const snap = snapshots.find(s => s.id === id);
  if (!snap || !snap.snapshot_json) return;
  const d = snap.snapshot_json;

  let html = `
    <div class="snap-detail-date">📅 ${formatDate(snap.date)}</div>
    <div class="snap-detail-summary">
      <div class="snap-kv"><span>إجمالي الأصول</span><span class="bold num">${formatSAR(d.total_assets)}</span></div>
      <div class="snap-kv"><span>إجمالي الالتزامات</span><span class="bold num">${formatSAR(d.total_liabs)}</span></div>
      <div class="snap-kv snap-kv-total"><span>صافي الثروة</span><span class="bold num" style="color:${stateColorOf((+d.net || 0) >= 0 ? 'good' : 'bad')}">${formatSAR(d.net)}</span></div>
    </div>

    <div class="snap-section-title">📈 الأسهم (تلقائي)</div>
    <div class="snap-kv"><span>القيمة السوقية للمحفظة</span><span class="num">${formatSAR(d.auto_stocks)}</span></div>

    <div class="snap-section-title">🏠 العقارات (تلقائي)</div>
    <div class="snap-kv"><span>إجمالي قيمة العقارات</span><span class="num">${formatSAR(d.auto_realestate)}</span></div>`;

  if (d.assets && d.assets.length) {
    html += `<div class="snap-section-title">✅ الأصول الأخرى</div>`;
    d.assets.forEach(a => {
      html += `<div class="snap-kv">
        <span>${esc(ASSET_CAT_AR[a.category]||a.category)} — ${esc(a.name)}</span>
        <span class="num">${formatSAR(a.value)}</span>
      </div>`;
    });
  }

  if (d.liabilities && d.liabilities.length) {
    html += `<div class="snap-section-title">🔴 الالتزامات</div>`;
    d.liabilities.forEach(l => {
      html += `<div class="snap-kv">
        <span>${esc(LIAB_CAT_AR[l.category]||l.category)} — ${esc(l.name)}</span>
        <span class="num">−${formatSAR(l.value)}</span>
      </div>`;
    });
  }

  if (snap.notes && !isAutoSnap(snap)) {
    html += `<div class="snap-section-title">📝 ملاحظات</div><div class="small text-muted">${esc(snap.notes)}</div>`;
  }

  document.getElementById('snap-detail-body').innerHTML = html;
  document.getElementById('snap-detail-modal').style.display = 'flex';
}

function closeSnapshotDetail() {
  document.getElementById('snap-detail-modal').style.display = 'none';
}

// ── Save Snapshot (full details) — لقطة واحدة فقط لكل شهر ────
async function saveSnapshot() {
  const today      = todayISO();                    // e.g. "2026-06-16"
  const thisMonth  = today.slice(0, 7);             // e.g. "2026-06"

  // AUDIT-FIX (2026-08): اختيار صف الشهر بترتيب واعٍ —
  // ① صف تاريخه اليوم (يمنع تعارض القيد الفريد user_id+date عند تغيير التاريخ)
  // ② ثم اللقطة اليدوية (لا نترك يدوية قديمة ونستبدل التلقائية)
  // ③ وإلا أول لقطة في الشهر.
  const monthSnaps = snapshots.filter(s => s.date && String(s.date).startsWith(thisMonth));
  const existing   = monthSnaps.find(s => s.date === today)
                  || monthSnaps.find(s => !isAutoSnap(s))
                  || monthSnaps[0];
  if (existing) {
    const ok = await confirmAsync(
      `لديك لقطة ${snapKindLabel(existing)} لهذا الشهر بتاريخ ${formatDate(existing.date)}.\nهل تريد استبدالها بصافي الثروة الحالي؟`
    );
    if (!ok) return;
  }

  const { totalAssets, totalLiabs, net } = calcTotals();
  const { data: { user } } = await supabaseClient.auth.getUser();

  const snapshotJson = {
    auto_stocks:     autoStocks,
    auto_realestate: autoRe,
    assets:          nwAssets.map(a => ({ category: a.category, name: a.name, value: +a.value || 0 })),
    liabilities:     nwLiabs.map(l => ({ category: l.category, name: l.name, value: +l.value || 0 })),
    total_assets:    totalAssets,
    total_liabs:     totalLiabs,
    net
  };

  // AUDIT-FIX (2026-08): تحديث الصف الموجود بدل حذف-ثم-إدراج — النمط القديم كان
  // يُضيع لقطة الشهر نهائياً إذا نجح الحذف وفشل الإدراج بعده.
  let error;
  if (existing) {
    ({ error } = await supabaseClient.from('net_worth_snapshots').update({
      date:          today,
      total_value:   net,
      notes:         'لقطة شهرية',
      snapshot_json: snapshotJson
    }).eq('id', existing.id));
  } else {
    ({ error } = await supabaseClient.from('net_worth_snapshots').insert([{
      user_id:       user.id,
      date:          today,
      total_value:   net,
      notes:         'لقطة شهرية',
      snapshot_json: snapshotJson
    }]));
  }
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('✓ تم حفظ لقطة ' + thisMonth, 'success');
  const rSnap = await supabaseClient.from('net_worth_snapshots').select('*').order('date', { ascending: true });
  snapshots = rSnap.data || [];
  renderChart(); renderSnapshotTable();
}

// ── تنظيف اللقطات: يُبقي لقطة واحدة لكل شهر (الأفضل: يدوية أو الأحدث) ──────
async function deduplicateSnapshots() {
  if (!snapshots.length) { showToast('لا توجد لقطات', 'error'); return; }

  // تجميع حسب الشهر (YYYY-MM)
  const byMonth = {};
  snapshots.forEach(s => {
    const month = s.date ? String(s.date).slice(0, 7) : 'unknown';
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(s);
  });

  // لكل شهر: احتفظ بالأفضل (يدوية > تلقائية، ثم الأحدث إنشاءً)
  // AUDIT-FIX (2026-08): الكشف القديم (notes !== 'لقطة تلقائية') كان ميتاً — اللقطات
  // التلقائية فعلياً تبدأ notes بـ 'auto'. عند وجود يدوية وتلقائية في نفس الشهر تبقى
  // اليدوية، ويُحسم التعادل بـ created_at (الأحدث إنشاءً) لا بمقارنة UUID العشوائية.
  const toDelete = [];
  Object.values(byMonth).forEach(group => {
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => {
      const aManual = isAutoSnap(a) ? 0 : 1;
      const bManual = isAutoSnap(b) ? 0 : 1;
      if (bManual !== aManual) return bManual - aManual;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    sorted.slice(1).forEach(s => toDelete.push(s.id));
  });

  if (!toDelete.length) { showToast('✓ كل شهر لديه لقطة واحدة فقط — المحفظة نظيفة', 'success'); return; }

  if (!await confirmAsync(
    `سيتم حذف ${toDelete.length} لقطة زائدة.\nسيُبقى لقطة واحدة لكل شهر فقط (تُفضَّل اليدوية).\nهل تتابع؟`
  )) return;

  const BATCH = 50;
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const chunk = toDelete.slice(i, i + BATCH);
    const { error } = await supabaseClient.from('net_worth_snapshots').delete().in('id', chunk);
    if (error) { showToast('خطأ أثناء الحذف: ' + error.message, 'error'); return; }
    deleted += chunk.length;
  }

  showToast(`✓ تم الحذف — تبقّى ${snapshots.length - deleted} لقطة (لقطة واحدة لكل شهر)`, 'success');
  const rSnap = await supabaseClient.from('net_worth_snapshots').select('*').order('date', { ascending: true });
  snapshots = rSnap.data || [];
  renderChart(); renderSnapshotTable();
}

async function deleteSnapshot(id) {
  // AUDIT-FIX: replace blocking confirm() with async modal
  if (!await confirmAsync('هل أنت متأكد من حذف هذه اللقطة؟')) return;
  const { error } = await supabaseClient.from('net_worth_snapshots').delete().eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تم الحذف', 'success');
  const rSnap = await supabaseClient.from('net_worth_snapshots').select('*').order('date', { ascending: true });
  snapshots = rSnap.data || [];
  renderChart(); renderSnapshotTable();
}

// ── Asset Modal ───────────────────────────────────────────────
function openAssetModal(id = null) {
  editAssetId = id;
  document.getElementById('asset-modal-title').textContent = id ? 'تعديل الأصل' : 'إضافة أصل';
  if (id) {
    const a = nwAssets.find(x => x.id === id);
    if (!a) return;
    document.getElementById('a-category').value = a.category;
    document.getElementById('a-name').value      = a.name;
    document.getElementById('a-value').value     = a.value;
    document.getElementById('a-notes').value     = a.notes || '';
  } else {
    document.getElementById('asset-form').reset();
  }
  document.getElementById('asset-modal').style.display = 'flex';
}

function closeAssetModal() { document.getElementById('asset-modal').style.display = 'none'; editAssetId = null; }

async function saveAsset(e) {
  e.preventDefault();
  const name  = document.getElementById('a-name').value.trim();
  const value = +document.getElementById('a-value').value;
  if (!name)     { showToast('أدخل اسم الأصل', 'error'); return; }
  if (!(value > 0)) { showToast('قيمة الأصل يجب أن تكون رقماً أكبر من صفر', 'error'); return; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = { user_id: user.id, category: document.getElementById('a-category').value, name, value, notes: document.getElementById('a-notes').value.trim() };
  let error;
  if (editAssetId) ({ error } = await supabaseClient.from('nw_assets').update(payload).eq('id', editAssetId));
  else             ({ error } = await supabaseClient.from('nw_assets').insert([payload]));
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editAssetId ? 'تم التحديث' : 'تمت الإضافة', 'success');
  closeAssetModal();
  const r = await supabaseClient.from('nw_assets').select('*').eq('is_active', true).order('category');
  nwAssets = r.data || [];
  renderTotals(); renderCompositionChart(); renderAssetsTable();
}

async function deleteAsset(id) {
  if (!await confirmAsync('سيتم أرشفة هذا الأصل (لن يُحذف نهائياً — يمكن استعادته من الأرشيف)')) return;
  const { error } = await supabaseClient.from('nw_assets')
    .update({ is_active: false, archived_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تمت الأرشفة ✓', 'success');
  const r = await supabaseClient.from('nw_assets').select('*').eq('is_active', true).order('category');
  nwAssets = r.data || [];
  renderTotals(); renderCompositionChart(); renderAssetsTable();
}

// ── Liability Modal ───────────────────────────────────────────
function openLiabModal(id = null) {
  editLiabId = id;
  document.getElementById('liab-modal-title').textContent = id ? 'تعديل الالتزام' : 'إضافة التزام';
  if (id) {
    const l = nwLiabs.find(x => x.id === id);
    if (!l) return;
    document.getElementById('l-category').value = l.category;
    document.getElementById('l-name').value      = l.name;
    document.getElementById('l-value').value     = l.value;
    document.getElementById('l-notes').value     = l.notes || '';
  } else {
    document.getElementById('liab-form').reset();
  }
  document.getElementById('liab-modal').style.display = 'flex';
}

function closeLiabModal() { document.getElementById('liab-modal').style.display = 'none'; editLiabId = null; }

async function saveLiab(e) {
  e.preventDefault();
  const name  = document.getElementById('l-name').value.trim();
  const value = +document.getElementById('l-value').value;
  if (!name)     { showToast('أدخل اسم الالتزام', 'error'); return; }
  if (!(value > 0)) { showToast('قيمة الالتزام يجب أن تكون رقماً أكبر من صفر', 'error'); return; }

  const { data: { user } } = await supabaseClient.auth.getUser();
  const payload = { user_id: user.id, category: document.getElementById('l-category').value, name, value, notes: document.getElementById('l-notes').value.trim() };
  let error;
  if (editLiabId) ({ error } = await supabaseClient.from('nw_liabilities').update(payload).eq('id', editLiabId));
  else            ({ error } = await supabaseClient.from('nw_liabilities').insert([payload]));
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast(editLiabId ? 'تم التحديث' : 'تمت الإضافة', 'success');
  closeLiabModal();
  const r = await supabaseClient.from('nw_liabilities').select('*').eq('is_active', true).order('category');
  nwLiabs = r.data || [];
  renderTotals(); renderCompositionChart(); renderLiabTable();
}

async function deleteLiab(id) {
  if (!await confirmAsync('سيتم أرشفة هذا الالتزام (لن يُحذف نهائياً — يمكن استعادته من الأرشيف)')) return;
  const { error } = await supabaseClient.from('nw_liabilities')
    .update({ is_active: false, archived_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('خطأ: ' + error.message, 'error'); return; }
  showToast('تمت الأرشفة ✓', 'success');
  const r = await supabaseClient.from('nw_liabilities').select('*').eq('is_active', true).order('category');
  nwLiabs = r.data || [];
  renderTotals(); renderCompositionChart(); renderLiabTable();
}

// ── تصدير CSV ─────────────────────────────────────────────────
function exportNetworthCSV() {
  const total = nwAssets.length + nwLiabs.length + snapshots.length;
  if (!total) { showToast('لا توجد بيانات للتصدير', 'error'); return; }

  // ملف واحد بثلاثة أقسام مفصولة
  const BOM = '﻿';
  const cell = v => {
    const s = String(v ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [];

  lines.push('== الأصول ==');
  lines.push(['الفئة','الاسم','القيمة','ملاحظات'].join(','));
  nwAssets.filter(a => a.is_active !== false).forEach(a =>
    lines.push([a.category, a.name, a.value, a.notes || ''].map(cell).join(','))
  );

  lines.push('');
  lines.push('== الالتزامات ==');
  lines.push(['الفئة','الاسم','القيمة','ملاحظات'].join(','));
  nwLiabs.filter(l => l.is_active !== false).forEach(l =>
    lines.push([l.category, l.name, l.value, l.notes || ''].map(cell).join(','))
  );

  lines.push('');
  lines.push('== لقطات صافي الثروة ==');
  // AUDIT-FIX (2026-08): عمود «المصدر» — بدونه يبدو الملف كسلسلة واحدة بينما
  // التلقائية تقيس (أسهم+نقد+عقار) واليدوية (أسهم+عقار+يدوية−التزامات).
  lines.push(['التاريخ','المصدر','القيمة المسجَّلة','ملاحظات'].join(','));
  sortedSnapsAsc().forEach(s =>
    lines.push([s.date, isAutoSnap(s) ? 'تلقائية (أسهم+نقد+عقار)' : 'يدوية (صافي الثروة)', s.total_value, s.notes || ''].map(cell).join(','))
  );

  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `صافي_الثروة_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
  showToast(`✓ تم تصدير ${total} سجل`, 'success');
}

init();
