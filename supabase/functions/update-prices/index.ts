// M-4: restrict CORS to your production domain — set APP_ORIGIN env var in Supabase dashboard
// Falls back to localhost for local dev; '*' is never used as a default
const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:8080'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

// ── مؤشر تاسي: رمزه على ياهو غير مؤكّد، فنجرّب كل المرشّحين ونختار **الأحدث**
// بياناتٍ لا أول من ينجح (فحص 2026-08-21: ^TASI.SR وحده يعمل، والثلاثة الباقية
// محذوفة عند ياهو). الرمز المختار يُعاد في الرد حتى يعرفه العميل.
const TASI_SYMBOLS = ['^TASI.SR', '^TASI', 'TASI.SR', '^TASI.SAU']
const TASI_RANGES = new Set(['1y', '2y', '5y', '10y', 'max'])
const TASI_DEFAULT_RANGE = '5y'

// ── الأساسيات لكل سهم: تاريخ التوزيعات + القوائم المالية ──────────────
// الغرض المعلَن: كسر قيد «سنتان كاملتان من سجل ملكيتك» في تصنيف التوزيعات —
// تاريخ توزيعات الشركة نفسها مستقلّ عن تاريخ شرائك، فيقيس سياستها لا مركزك.
const FUND_MODULES = [
  'defaultKeyStatistics', 'financialData', 'summaryDetail',
  'incomeStatementHistory', 'cashflowStatementHistory',
].join(',')
const FUND_CONCURRENCY = 4      // ياهو يخنق الطلبات المتوازية الكثيرة
const FUND_MAX_TICKERS = 60     // حارس ضد طلب ضخم يتجاوز مهلة الدالة

// ينفّذ المهام على دفعات محدودة التوازي (بلا مكتبات)
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]) }
  })
  await Promise.all(workers)
  return out
}

const numOr = (v: unknown): number | null => {
  // ياهو يرجّع إمّا رقماً أو {raw, fmt} — نقبل الاثنين ونرفض ما عداهما
  const n = (v && typeof v === 'object' && 'raw' in (v as any)) ? (v as any).raw : v
  return (typeof n === 'number' && Number.isFinite(n)) ? n : null
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: cors })

  // AUDIT-FIX: أي استثناء غير معالَج كان يرجع 500 بلا رؤوس CORS → المتصفح يخفي الخطأ
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_KEY  = Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const authHeader   = req.headers.get('Authorization') ?? ''

    // ── التحقق من المستخدم ───────────────────────────────────────
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: ANON_KEY }
    })
    if (!userRes.ok) return new Response('Unauthorized', { status: 401, headers: cors })
    const { id: userId } = await userRes.json()

    // ── رموز إضافية اختيارية (قائمة المراقبة مثلاً) — لا تُحدَّث في holdings ──
    // تُرسَل في جسم الطلب: { tickers: ["1234", "5678"] }
    // وإضافة اختيارية: { tasiHistory: true, range: "5y" } لجلب تاريخ مؤشر تاسي
    let extraTickers: string[] = []
    let wantTasi = false
    let wantFund = false
    let wantPrices = false
    let tasiRange = TASI_DEFAULT_RANGE
    try {
      const body = await req.json()
      if (Array.isArray(body?.tickers)) {
        extraTickers = body.tickers
          .map((t: any) => String(t).trim().toUpperCase())
          .filter((t: string) => /^[A-Z0-9.]{1,12}$/.test(t))
      }
      wantTasi = body?.tasiHistory === true
      wantFund = body?.fundamentals === true
      wantPrices = body?.priceHistory === true
      // الأمان: المدى لا يُمرَّر للرابط إلا بعد مطابقته لقائمة بيضاء (نفس نمط تصفية الرموز)
      if (typeof body?.range === 'string' && TASI_RANGES.has(body.range)) tasiRange = body.range
    } catch (_) { /* لا جسم / ليس JSON — تجاهل */ }

    // ── الحصول على cookie + crumb من Yahoo Finance (مرة واحدة لكل طلب) ──
    // يُستخدَم لمسار الأسعار ولمسار تاريخ المؤشر معاً — لذلك مذكّر (memoized)
    let authPromise: Promise<{ cookie: string; crumb: string }> | null = null
    const getYahooAuth = (): Promise<{ cookie: string; crumb: string }> => {
      return (authPromise ??= (async () => {
        let cookie = ''
        let crumb  = ''
        try {
          const cookieRes = await fetch('https://fc.yahoo.com', {
            headers: { 'User-Agent': UA },
            redirect: 'follow'
          })
          cookie = cookieRes.headers.get('set-cookie')?.split(';')[0] ?? ''
          console.log('cookie:', cookie ? 'ok' : 'empty')

          const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
            headers: { 'User-Agent': UA, Cookie: cookie }
          })
          crumb = await crumbRes.text()
          // M-5: don't log the actual crumb value — it's a session token
          console.log('crumb:', crumb ? '[set]' : 'empty')
        } catch (e) {
          console.log('crumb fetch error:', String(e))
        }
        return { cookie, crumb }
      })())
    }

    // ── جلب تاريخ مؤشر تاسي من نقطة نهاية الرسم البياني ──────────
    // الرد: { symbol, points:[{date,value}], count, lastDate, notes } أو { error, tried, notes }
    // AUDIT-FIX (2026-08-21): كان يأخذ **أول** رمز يرجع سلسلة، وبفاصل يومي فقط.
    // تبيّن بالفحص المباشر أن ياهو يجمّد السلسلة **اليومية** لـ^TASI.SR عند
    // 2026-07-16 بينما **الأسبوعية** لنفس الرمز محدَّثة حتى الأمس، وأن meta
    // يحمل regularMarketPrice بتاريخ اليوم. فالنتيجة كانت مؤشراً متجمّداً خمسة
    // أسابيع بلا أي خطأ ظاهر — وألفا مضخّمة لأن المحفظة تتقدّم والمؤشر واقف.
    // الآن: يُجرَّب كل فاصل، وتُدمج نقاطه، ويُضاف سعر meta إن كان أحدث، ثم
    // يُختار الرمز **الأحدث** لا الأول الذي ينجح.
    const TASI_INTERVALS = ['1d', '1wk']

    const fetchTasiOne = async (sym: string, range: string, interval: string) => {
      const { cookie, crumb } = await getYahooAuth()
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`
        + `?range=${range}&interval=${interval}${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ''}`
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) }
      })
      if (!res.ok) return { err: `${sym}/${interval}: HTTP ${res.status}` }
      const result = (await res.json())?.chart?.result?.[0]
      const stamps = result?.timestamp
      const closes = result?.indicators?.quote?.[0]?.close
      const out = new Map<string, number>()
      if (Array.isArray(stamps) && Array.isArray(closes)) {
        for (let i = 0; i < stamps.length; i++) {
          const t = stamps[i], c = closes[i]
          if (typeof t !== 'number' || !Number.isFinite(t)) continue
          if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) continue
          out.set(new Date(t * 1000).toISOString().slice(0, 10), Math.round(c * 100) / 100)
        }
      }
      // سعر الإغلاق الأخير من meta — غالباً أحدث من آخر نقطة في السلسلة
      const meta = result?.meta
      const mp = meta?.regularMarketPrice, mt = meta?.regularMarketTime
      if (typeof mp === 'number' && Number.isFinite(mp) && mp > 0
          && typeof mt === 'number' && Number.isFinite(mt)) {
        out.set(new Date(mt * 1000).toISOString().slice(0, 10), Math.round(mp * 100) / 100)
      }
      return { map: out, currency: meta?.currency ?? null }
    }

    const fetchTasiHistory = async (range: string) => {
      const tried: string[] = []
      const notes: string[] = []
      let best: { symbol: string; points: {date:string;value:number}[]; last: string } | null = null
      let lastErr = ''

      for (const sym of TASI_SYMBOLS) {
        tried.push(sym)
        const merged = new Map<string, number>()
        for (const interval of TASI_INTERVALS) {
          try {
            const r = await fetchTasiOne(sym, range, interval)
            if ((r as any).err) { lastErr = (r as any).err; continue }
            const m = (r as any).map as Map<string, number>
            if (!m || !m.size) continue
            // الفاصل اليومي أدقّ فيُكتب أولاً؛ الأسبوعي يملأ ما بعده فقط
            for (const [d, v] of m) if (interval === '1d' || !merged.has(d)) merged.set(d, v)
            const lastOf = [...m.keys()].sort().pop()
            notes.push(`${sym}/${interval}: ${m.size} نقطة حتى ${lastOf}`)
          } catch (e) {
            lastErr = `${sym}/${interval}: ${String(e)}`
          }
        }
        if (!merged.size) continue
        const points = [...merged.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
          .map(([date, value]) => ({ date, value }))
        const last = points[points.length - 1].date
        if (!best || last > best.last) best = { symbol: sym, points, last }
      }

      if (!best) {
        console.log('tasi failed after', tried.length, 'symbols')
        return { error: lastErr || 'تعذّر جلب تاريخ مؤشر تاسي من ياهو', tried, notes }
      }
      console.log('tasi ok:', best.symbol, best.points.length, 'points, last', best.last)
      return { symbol: best.symbol, points: best.points, count: best.points.length,
               lastDate: best.last, notes }
    }

    // نُطلقه الآن ليعمل بالتوازي مع جلب الحيازات والأسعار؛ .catch حارس ضد رفض غير معالَج
    const tasiPromise = wantTasi
      ? fetchTasiHistory(tasiRange).catch((e) => ({ error: String(e), tried: [...TASI_SYMBOLS] }))
      : null

    // ── تاريخ توزيعات الشركة + التجزئة من نقطة نهاية الرسم ──────────
    // نطلب التجزئة معها لأن مقارنة DPS عبر تجزئة بلا تعديل تُنتج «قطعاً» وهمياً —
    // نرجعها للعميل ليعلنها بدل أن نصمت عنها.
    const fetchDivHistory = async (ticker: string) => {
      const { cookie, crumb } = await getYahooAuth()
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker + '.SR')}`
        + `?range=10y&interval=1mo&events=div%2Csplit${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ''}`
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) } })
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const result = (await res.json())?.chart?.result?.[0]
      const evts = result?.events ?? {}
      const dividends = Object.values(evts.dividends ?? {})
        .map((d: any) => ({
          date: typeof d?.date === 'number' ? new Date(d.date * 1000).toISOString().slice(0, 10) : null,
          amount: numOr(d?.amount),
        }))
        .filter((d) => d.date && d.amount != null && (d.amount as number) > 0)
        .sort((a, b) => (a.date! < b.date! ? -1 : 1))
      const splits = Object.values(evts.splits ?? {})
        .map((s: any) => ({
          date: typeof s?.date === 'number' ? new Date(s.date * 1000).toISOString().slice(0, 10) : null,
          ratio: typeof s?.splitRatio === 'string' ? s.splitRatio : null,
        }))
        .filter((s) => s.date)
        .sort((a, b) => (a.date! < b.date! ? -1 : 1))
      return { dividends, splits, currency: result?.meta?.currency ?? null }
    }

    // ── القوائم المالية — تُحوَّل كلها إلى «لكل سهم» لأن الدستور يقيس
    // نسبة التوزيع من مصدر تغطية لكل سهم (DPS ÷ EPS أو ÷ FCF للسهم).
    const fetchFinancials = async (ticker: string) => {
      const { cookie, crumb } = await getYahooAuth()
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker + '.SR')}`
        + `?modules=${FUND_MODULES}${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ''}`
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) } })
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const r = (await res.json())?.quoteSummary?.result?.[0]
      if (!r) return { error: 'لا بيانات' }

      const ks = r.defaultKeyStatistics ?? {}
      const fd = r.financialData ?? {}
      const sd = r.summaryDetail ?? {}
      const shares = numOr(ks.sharesOutstanding)

      // FCF إجمالي من ياهو → للسهم الواحد. بلا عدد أسهم لا نحوّل ونتركه null
      // (ممنوع التقدير الصامت — الدستور §8).
      const fcfTotal = numOr(fd.freeCashflow)
      const cf = r.cashflowStatementHistory?.cashflowStatements?.[0] ?? {}
      const opCash = numOr(cf.totalCashFromOperatingActivities)
      const capex  = numOr(cf.capitalExpenditures)          // سالب في ياهو
      const fcfDerived = (opCash != null && capex != null) ? opCash + capex : null
      const fcfUse = fcfTotal ?? fcfDerived
      const inc = r.incomeStatementHistory?.incomeStatementHistory ?? []

      return {
        eps:        numOr(ks.trailingEps),
        bvps:       numOr(ks.bookValue),
        dps:        numOr(sd.dividendRate),
        divYield:   numOr(sd.dividendYield),
        payoutRatio: numOr(sd.payoutRatio),
        roe:        numOr(fd.returnOnEquity),
        netIncome:  numOr(fd.netIncomeToCommon),
        fcfTotal:   fcfUse,
        fcfPerShare: (fcfUse != null && shares != null && shares > 0) ? fcfUse / shares : null,
        sharesOutstanding: shares,
        currentPrice: numOr(fd.currentPrice),
        currency:   sd.currency ?? fd.financialCurrency ?? null,
        netIncomeByYear: inc.map((y: any) => ({
          date: typeof y?.endDate?.raw === 'number' ? new Date(y.endDate.raw * 1000).toISOString().slice(0, 10) : null,
          netIncome: numOr(y?.netIncome),
        })).filter((y: any) => y.date),
        // ما لا نجلبه عمداً: بيتا. ياهو يقيسها مقابل مؤشر أمريكي، والدستور §2
        // يعتبرها غير صالحة للسوق السعودي — إدخالها هنا تلويث لا إثراء.
      }
    }

    // ══════════════════════════════════════════════════════════════
    // 📈 تاريخ الأسعار اليومي لكل سهم — لإعادة بناء قيمة المحفظة يومياً
    // ──────────────────────────────────────────────────────────────
    // لقطات صافي الثروة شهرية، فخطّ المحفظة المرسوم منها **دالة درجية**:
    // مسطَّح بين اللقطات ثم يقفز. لا يمكن أن يطابق مواقع المقارنة التي تبني
    // الخطّ من السعر اليومي لكل سهم. الحلّ: نجلب الإغلاق اليومي لكل رمز،
    // فيُعيد العميل بناء القيمة يوماً بيوم من معاملاته (أسهم اليوم × سعره).
    // الصيغة مضغوطة [تاريخ, إغلاق] لأن 19 رمزاً × سنتين تُخزَّن في صفّ واحد.
    const fetchPriceHistory = async (tickers: string[], range: string) => {
      const list = tickers.slice(0, FUND_MAX_TICKERS)
      const rows = await pool(list, FUND_CONCURRENCY, async (t) => {
        try {
          const { cookie, crumb } = await getYahooAuth()
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t + '.SR')}`
            + `?range=${range}&interval=1d${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ''}`
          const res = await fetch(url, { headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) } })
          if (!res.ok) return [t, { error: `HTTP ${res.status}` }] as const
          const r = (await res.json())?.chart?.result?.[0]
          const ts = r?.timestamp, cl = r?.indicators?.quote?.[0]?.close
          const out: [string, number][] = []
          const seen = new Set<string>()
          if (Array.isArray(ts) && Array.isArray(cl)) {
            for (let i = 0; i < ts.length; i++) {
              const t0 = ts[i], c = cl[i]
              if (typeof t0 !== 'number' || !Number.isFinite(t0)) continue
              if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) continue
              const d = new Date(t0 * 1000).toISOString().slice(0, 10)
              if (seen.has(d)) continue
              seen.add(d)
              out.push([d, Math.round(c * 100) / 100])
            }
          }
          // آخر سعر من meta إن كان أحدث (نفس علّة تاسي: السلسلة قد تتجمّد)
          const m = r?.meta
          if (typeof m?.regularMarketPrice === 'number' && typeof m?.regularMarketTime === 'number') {
            const d = new Date(m.regularMarketTime * 1000).toISOString().slice(0, 10)
            if (!seen.has(d)) out.push([d, Math.round(m.regularMarketPrice * 100) / 100])
          }
          out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
          return [t, out.length ? { p: out, last: out[out.length - 1][0] } : { error: 'لا سلسلة' }] as const
        } catch (e) {
          return [t, { error: String(e) }] as const
        }
      })
      return {
        fetchedAt: new Date().toISOString(), range,
        bySymbol: Object.fromEntries(rows),
      }
    }

    const fetchFundamentals = async (tickers: string[]) => {
      const list = tickers.slice(0, FUND_MAX_TICKERS)
      const rows = await pool(list, FUND_CONCURRENCY, async (t) => {
        try {
          const [div, fin] = await Promise.all([
            fetchDivHistory(t).catch((e) => ({ error: String(e) })),
            fetchFinancials(t).catch((e) => ({ error: String(e) })),
          ])
          return [t, { ...(fin as any), ...(div as any), errors: {
            ...((fin as any)?.error ? { financials: (fin as any).error } : {}),
            ...((div as any)?.error ? { dividends: (div as any).error } : {}),
          } }] as const
        } catch (e) {
          return [t, { errors: { fatal: String(e) } }] as const
        }
      })
      return {
        fetchedAt: new Date().toISOString(),
        source: 'yahoo:quoteSummary+chart',
        truncated: tickers.length > FUND_MAX_TICKERS ? tickers.length - FUND_MAX_TICKERS : 0,
        bySymbol: Object.fromEntries(rows),
      }
    }

    // ── جلب أسهم المستخدم ────────────────────────────────────────
    const hRes    = await fetch(
      `${SUPABASE_URL}/rest/v1/holdings?select=ticker,price_manual&user_id=eq.${userId}`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    )
    // AUDIT-FIX: فشل جلب holdings كان يمر لـ .json() فيرمي TypeError → 500 بلا CORS
    if (!hRes.ok) {
      const txt = await hRes.text()
      console.log('holdings fetch failed:', hRes.status, txt.slice(0, 300))
      return new Response(JSON.stringify({ updated: 0, message: `holdings ${hRes.status}` }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }
    const holdings = await hRes.json()

    // مجموعة الرموز المملوكة (تُحدَّث في DB) ومجموعة الكل (تُجلب أسعارها)
    const heldTickers: string[] = (holdings || []).map((h: any) => h.ticker)
    // AUDIT-FIX (2026-07): الأسعار المعدَّلة يدوياً (price_manual) لا تُداس بالتحديث التلقائي
    const manualTickers = new Set<string>(
      (holdings || []).filter((h: any) => h.price_manual === true).map((h: any) => h.ticker)
    )
    const allTickerSet = new Set<string>([...heldTickers, ...extraTickers])
    if (!allTickerSet.size) {
      // طلب تاريخ المؤشر وحده لا يُعتبر فشلاً: نرجع tasi بنجاح مع updated: 0
      if (tasiPromise) {
        return new Response(JSON.stringify({ updated: 0, prices: {}, failed: [], tasi: await tasiPromise }), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ updated: 0, prices: {}, failed: [], message: 'لا توجد أسهم' }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // الأساسيات تُطلق الآن لتعمل بالتوازي مع الأسعار (لا تعتمد عليها)
    const fundPromise = wantFund
      ? fetchFundamentals([...allTickerSet]).catch((e) => ({ error: String(e) }))
      : null
    const pricesPromise = wantPrices
      ? fetchPriceHistory([...allTickerSet], tasiRange).catch((e) => ({ error: String(e) }))
      : null

    const symbols = [...allTickerSet].map((t) => `${t}.SR`).join(',')
    const { cookie, crumb } = await getYahooAuth()

    // ── جلب الأسعار ──────────────────────────────────────────────
    // AUDIT-FIX: crumb قد يحمل محارف خاصة تكسر الـ URL — يُرمَّز دائماً
    const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ''}`
    const yRes = await fetch(yahooUrl, {
      headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) }
    })
    console.log('yahoo status:', yRes.status)

    if (!yRes.ok) {
      const txt = await yRes.text()
      console.log('yahoo body:', txt.slice(0, 300))
      return new Response(JSON.stringify({
        updated: 0, message: `yahoo ${yRes.status}`,
        ...(tasiPromise ? { tasi: await tasiPromise } : {}),
        ...(fundPromise ? { fundamentals: await fundPromise } : {}),
        ...(pricesPromise ? { priceHistory: await pricesPromise } : {})
      }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const quotes = (await yRes.json())?.quoteResponse?.result ?? []
    console.log('quotes:', quotes.length)

    // ── تحديث الأسعار — parallel PATCHes instead of sequential ──
    const prices: Record<string, number> = {}
    const nowISO = new Date().toISOString()

    for (const q of quotes) {
      const ticker = q.symbol?.replace('.SR', '')
      const price  = q.regularMarketPrice
      // M-11: reject missing, zero, negative, or implausibly large prices (data errors / pending splits)
      if (!ticker || price == null || price <= 0 || price > 1_000_000) continue
      prices[ticker] = price
    }

    // Fire all PATCHes in parallel — reduces latency from O(N×RTT) to O(1×RTT)
    // نحدّث فقط الأسهم المملوكة في holdings — الرموز الإضافية (المراقبة) تُعاد أسعارها دون حفظ
    const heldSet = new Set(heldTickers)
    const patchResults = await Promise.all(
      Object.entries(prices)
        .filter(([ticker]) => heldSet.has(ticker) && !manualTickers.has(ticker))
        .map(([ticker, price]) =>
        fetch(
          `${SUPABASE_URL}/rest/v1/holdings?user_id=eq.${userId}&ticker=eq.${ticker}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY,
              'Content-Type': 'application/json', Prefer: 'return=minimal'
            },
            body: JSON.stringify({ current_price: price, price_updated_at: nowISO })
          }
        )
      )
    )
    const updated = patchResults.filter(r => r.ok).length

    // H-6: report which tickers were not returned by Yahoo so the client can show stale warnings
    const failedTickers = [...allTickerSet].filter((t) => !(t in prices))

    console.log('updated:', updated, 'failed:', failedTickers.length)
    return new Response(JSON.stringify({
      updated, total: quotes.length, prices, failed: failedTickers,
      // إضافات اختيارية: المفتاح لا يظهر إطلاقاً ما لم يُطلب صراحةً
      ...(tasiPromise ? { tasi: await tasiPromise } : {}),
      ...(fundPromise ? { fundamentals: await fundPromise } : {}),
      ...(pricesPromise ? { priceHistory: await pricesPromise } : {})
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    // AUDIT-FIX: خطأ غير متوقع → 500 مع رؤوس CORS حتى يقرأه المتصفح
    console.log('unhandled error:', String(e))
    return new Response(JSON.stringify({ updated: 0, message: 'internal error: ' + String(e) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
