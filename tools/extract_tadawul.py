# -*- coding: utf-8 -*-
"""
يستخرج ملفات DATA_*.md (المولَّدة من إيداعات تداول الرسمية) إلى
js/tadawul-data.js — مصدر موسوم ✅ يقرؤه المحرّك.

⚠️ الوحدات تختلف بين الملفات (بالريال / بالآلاف / بالملايين). تُوحَّد كلها
إلى **الريال** هنا، ويُسجَّل الأصل. تركها كما هي كان سيجعل سابك (بالآلاف)
تبدو أصغر من المواساة (بالريال) بألف مرة.
"""
import io, os, re, json, sys, datetime

SRC = sys.argv[1]
OUT = sys.argv[2]

UNIT_MUL = {'بالريال': 1, 'بالآلاف': 1_000, 'بالملايين': 1_000_000}

# صفوف السلسلة السنوية → مفاتيح موحَّدة
ROWS = {
    'الإيرادات': 'revenue',
    'صافي الربح': 'netIncome',
    'الربح العائد للمساهمين': 'niParent',
    'ربحية السهم الأساسية': 'eps',
    'التدفق النقدي التشغيلي': 'ocf',
    'شراء ممتلكات ومعدات (CapEx)': 'capex',
    'الاستهلاك والإطفاء': 'da',
    'التوزيعات المدفوعة للمساهمين': 'divPaid',
    'رأس المال': 'capital',
    'حقوق مساهمي الشركة الأم': 'equityParent',
    'حقوق مساهمي البنك': 'equityParent',
    'إجمالي حقوق الملكية': 'equity',
    'إجمالي الموجودات': 'assets',
    'قروض قصيرة الأجل': 'debtShort',
    'قروض طويلة الأجل': 'debtLong',
    'صافي الربح (سنوي)': 'netIncome',
    'التوزيعات المدفوعة': 'divPaid',
    'ربحية السهم': 'eps',
}
# مؤشرات مشتقة — نِسَب لا تُضرب في الوحدة
DERIVED = {
    'عدد الأسهم الضمني (مليون)': ('sharesM', 1),
    'عدد الأسهم (مليون)': ('sharesM', 1),
    'التوزيع للسهم (ر.س)': ('dps', 1),
    'نسبة التوزيع من صافي الدخل': ('payoutPct', 1),
    'العائد على حقوق الملكية': ('roePct', 1),
    'القيمة الدفترية للسهم (ر.س)': ('bvps', 1),
    'التدفق النقدي الحر': ('fcf', 'unit'),
    'تغطية التوزيع من التدفق الحر': ('fcfCover', 1),
    'التوزيع للسهم معدّلاً للتجزئة (ر.س)': ('dpsAdj', 1),
}

def num(s):
    s = (s or '').strip().replace(',', '').replace('%', '').replace('x', '')
    if not s or s in ('—', '-', '–'):
        return None
    try:
        v = float(s)
        return v
    except ValueError:
        return None

def parse(path):
    txt = io.open(path, encoding='utf-8').read()
    tk = re.search(r'^#\s*(\d{4})\s*—\s*(.+?)\s*\(', txt, re.M)
    if not tk:
        tk2 = re.search(r'^#\s*(\d{4})\s*—\s*(.+)$', txt, re.M)
        if not tk2: return None
        code, name = tk2.group(1), tk2.group(2).strip()
    else:
        code, name = tk.group(1), tk.group(2).strip()

    sec = re.search(r'\*\*القطاع:\*\*\s*(.+)', txt)
    rng = re.search(r'\*\*(?:المدى|الفترات):\*\*\s*(.+)', txt)
    nsrc = re.search(r'\*\*(?:الملفات المصدر|عدد الملفات المصدر):\*\*\s*(\d+)', txt)
    um = re.search(r'\*\*وحدة (?:العرض|الأرقام):\*\*\s*(بالريال|بالآلاف|بالملايين)', txt)
    unit_label = um.group(1) if um else 'بالريال'
    mul = UNIT_MUL[unit_label]

    years, quarters = {}, []

    def table_rows(header_re):
        m = re.search(header_re, txt)
        if not m: return []
        blk = txt[m.start():]
        blk = blk.split('\n\n')[0]
        return [l for l in blk.split('\n') if l.strip().startswith('|')]

    # ── السلسلة السنوية والمؤشرات المشتقة ──
    for sec_re, table in ((r'\|\s*البند\s*\|', 'annual'), (r'\|\s*المؤشر\s*\|', 'derived')):
        lines = table_rows(sec_re)
        if not lines: continue
        hdr = [c.strip() for c in lines[0].strip('|').split('|')]
        cols = hdr[1:]
        for line in lines[2:]:
            cells = [c.strip() for c in line.strip('|').split('|')]
            if len(cells) < 2: continue
            label = cells[0]
            key, scale = (ROWS.get(label), 'unit') if table == 'annual' else DERIVED.get(label, (None, 1))
            if not key: continue
            for i, y in enumerate(cols):
                if not y.isdigit(): continue
                v = num(cells[i + 1]) if i + 1 < len(cells) else None
                if v is None: continue
                if scale == 'unit' and key not in ('eps',):
                    v = v * mul
                years.setdefault(int(y), {})[key] = v

    # ── السلسلة الربعية ──
    qm = re.search(r'\|\s*نهاية الفترة\s*\|', txt)
    if qm:
        blk = txt[qm.start():].split('\n\n')[0]
        for line in [l for l in blk.split('\n') if l.strip().startswith('|')][2:]:
            c = [x.strip() for x in line.strip('|').split('|')]
            if len(c) < 4 or not re.match(r'^\d{4}-\d{2}-\d{2}$', c[0]): continue
            q = {'period': c[0]}
            eq = num(c[-3]) if len(c) >= 5 else num(c[1])
            q['equity'] = (num(c[1]) or 0) * mul if num(c[1]) is not None else None
            q['assets'] = (num(c[2]) or 0) * mul if len(c) > 2 and num(c[2]) is not None else None
            if len(c) > 3: q['profit'] = (num(c[3]) or 0) * mul if num(c[3]) is not None else None
            if len(c) > 4: q['eps'] = num(c[4])
            quarters.append(q)

    # ── التنبيهات (م.22: إعادة البيان عند تغيّر رأس المال) ──
    alerts = []
    am = re.search(r'##\s*3\.\s*تنبيهات آلية\n(.+?)(?=\n##|\Z)', txt, re.S)
    if am:
        for b in re.findall(r'^-\s*(.+)$', am.group(1), re.M):
            alerts.append(re.sub(r'\*\*', '', b).strip())

    # ── حارس الربحية التالفة ────────────────────────────────────────
    # بعض الإيداعات تضع **صافي الدخل** في خانة ربحية السهم. القصيم 2021
    # أعطت 291,872.24 ريالاً للسهم، وملف المصدر نفسه يقول عنها «غير منطقية
    # (رقم بحجم صافي الربح). استُبعدت» — وأخذتُها أنا. وسهمٌ سعودي مدرج لا
    # تبلغ ربحيته مئات الألوف.
    #
    # م.20 يمنع التقدير الصامت: لا نصلحها ولا نخترع بديلاً — نُسقطها
    # ونُعلن الإسقاط في التنبيهات. والمُطبَّعة تُحسب من صافي الدخل ÷ أسهم
    # اليوم فلا تتأثر أصلاً.
    for y in sorted(years):
        e = years[y].get('eps')
        if e is not None and abs(e) > 500:
            years[y].pop('eps', None)
            alerts.append(f'ربحية السهم لسنة {y} أُسقطت: {e:,.2f} ريال للسهم '
                          f'رقمٌ بحجم صافي الدخل لا بحجم ربحية سهم — '
                          f'الإيداع وضع الصافي في خانة الربحية (م.20).')
    for q in quarters:
        if q.get('eps') is not None and abs(q['eps']) > 500:
            q['eps'] = None

    return {
        'ticker': code, 'name': name,
        'sector': (sec.group(1).strip() if sec else None),
        'unit': unit_label, 'unitMul': mul,
        'range': (rng.group(1).strip() if rng else None),
        'sourceFiles': int(nsrc.group(1)) if nsrc else None,
        'years': years, 'quarters': quarters, 'alerts': alerts,
    }

out = {}
for f in sorted(os.listdir(SRC)):
    if not f.startswith('DATA_') or not f.endswith('.md'): continue
    r = parse(os.path.join(SRC, f))
    if r: out[r['ticker']] = r

body = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
today = datetime.date.today().isoformat()
tot_files = sum(v['sourceFiles'] or 0 for v in out.values())

hdr = f'''// ══════════════════════════════════════════════════════════════════════
// 📗 بيانات تداول الرسمية — مستخرَجة من إيداعات {tot_files} ملفاً
// ----------------------------------------------------------------------
// المصدر: ملفات `DATA_*.md` التي أعدّها المالك من إيداعات تداول الرسمية
// (`.xls` مهيكلة، لا نصّاً ممسوحاً). استُخرجت آلياً بتاريخ {today}.
//
// **وسمها ✅ (م.19):** منقولة حرفياً من ملف تداول، فيجوز أن تقود قرار وزن
// (م.66/2). المشتقّ منها بحساب يُوسَم ⚙️ عند الاستعمال.
//
// ⚠️ **الوحدات وُحِّدت إلى الريال**. الملفات الأصلية تعلن وحدات مختلفة
// (بالريال · بالآلاف · بالملايين)، وتركها كما هي كان سيجعل سابك تبدو
// أصغر من المواساة بألف مرة. الوحدة الأصلية محفوظة في `unit` لكل سهم.
// ربحية السهم **لا تُضرب** في الوحدة — هي بالريال أصلاً.
//
// ⚠️ لا يُعدَّل هذا الملف يدوياً. يُعاد توليده من المصدر عند تحديثه.
// ══════════════════════════════════════════════════════════════════════

const TADAWUL_DATA = {body};
const TADAWUL_EXTRACTED_AT = '{today}';
const TADAWUL_SOURCE_FILES = {tot_files};
'''

# المشتقّات مصدرها ملفٌ مستقل — لا قالبٌ هنا. تعديلها في tools/tadawul-lib.js.
LIB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tadawul-lib.js')
tail = '\n' + io.open(LIB, encoding='utf-8').read()

io.open(OUT, 'w', encoding='utf-8', newline='').write(hdr + tail)
print('كُتب:', OUT)
print('أسهم:', len(out), '· ملفات مصدر:', tot_files)
for k, v in sorted(out.items()):
    ys = sorted(v['years'].keys())
    print(f"  {k} {v['name'][:22]:24} سنوات={len(ys)} {ys[0] if ys else '-'}–{ys[-1] if ys else '-'} "
          f"أرباع={len(v['quarters'])} تنبيهات={len(v['alerts'])} وحدة={v['unit']}")
