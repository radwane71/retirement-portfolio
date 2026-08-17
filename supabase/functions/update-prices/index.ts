// M-4: restrict CORS to your production domain — set APP_ORIGIN env var in Supabase dashboard
// Falls back to localhost for local dev; '*' is never used as a default
const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:8080'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

// ── مؤشر تاسي: رمزه على ياهو غير مؤكّد، لذا نجرّب المرشّحين بالترتيب ونتوقّف عند أول ──
// رمز يرجع سلسلة صالحة. الرمز الناجح يُعاد في الرد حتى يعرفه العميل.
const TASI_SYMBOLS = ['^TASI.SR', '^TASI', 'TASI.SR', '^TASI.SAU']
const TASI_RANGES = new Set(['1y', '2y', '5y', '10y', 'max'])
const TASI_DEFAULT_RANGE = '5y'

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
    let tasiRange = TASI_DEFAULT_RANGE
    try {
      const body = await req.json()
      if (Array.isArray(body?.tickers)) {
        extraTickers = body.tickers
          .map((t: any) => String(t).trim().toUpperCase())
          .filter((t: string) => /^[A-Z0-9.]{1,12}$/.test(t))
      }
      wantTasi = body?.tasiHistory === true
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
    // الرد: { symbol, points:[{date,value}], count } أو { error, tried }
    const fetchTasiHistory = async (range: string) => {
      const { cookie, crumb } = await getYahooAuth()
      const tried: string[] = []
      let lastErr = ''
      for (const sym of TASI_SYMBOLS) {
        tried.push(sym)
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`
            + `?range=${range}&interval=1d${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ''}`
          const res = await fetch(url, {
            headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) }
          })
          if (!res.ok) {
            lastErr = `${sym}: HTTP ${res.status}`
            console.log('tasi chart', sym, res.status)
            continue
          }
          const result = (await res.json())?.chart?.result?.[0]
          const stamps = result?.timestamp
          const closes = result?.indicators?.quote?.[0]?.close
          if (!Array.isArray(stamps) || !stamps.length || !Array.isArray(closes)) {
            lastErr = `${sym}: لا توجد سلسلة زمنية`
            continue
          }

          // خريطة بالتاريخ: تُسقط التكرار تلقائياً (آخر قيمة لليوم تفوز)
          const byDate = new Map<string, number>()
          for (let i = 0; i < stamps.length; i++) {
            const t = stamps[i]
            const c = closes[i]
            // أيام العطل ترجع close = null → تُتجاهل، وكذلك أي قيمة غير منتهية أو ≤ 0
            if (typeof t !== 'number' || !Number.isFinite(t)) continue
            if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) continue
            // الطابع بالثواني UTC؛ جلسة تاسي (UTC+3) تبدأ ~07:00 UTC فاليوم UTC = اليوم المحلي
            const date = new Date(t * 1000).toISOString().slice(0, 10)
            byDate.set(date, Math.round(c * 100) / 100)
          }
          if (!byDate.size) {
            lastErr = `${sym}: لا توجد نقاط صالحة`
            continue
          }

          const points = [...byDate.entries()]
            .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))   // تصاعدي بالتاريخ
            .map(([date, value]) => ({ date, value }))
          console.log('tasi ok:', sym, points.length, 'points')
          return { symbol: sym, points, count: points.length }
        } catch (e) {
          lastErr = `${sym}: ${String(e)}`
          console.log('tasi chart error:', sym, String(e))
        }
      }
      console.log('tasi failed after', tried.length, 'symbols')
      return { error: lastErr || 'تعذّر جلب تاريخ مؤشر تاسي من ياهو', tried }
    }

    // نُطلقه الآن ليعمل بالتوازي مع جلب الحيازات والأسعار؛ .catch حارس ضد رفض غير معالَج
    const tasiPromise = wantTasi
      ? fetchTasiHistory(tasiRange).catch((e) => ({ error: String(e), tried: [...TASI_SYMBOLS] }))
      : null

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
        ...(tasiPromise ? { tasi: await tasiPromise } : {})
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
      // إضافة اختيارية: المفتاح لا يظهر إطلاقاً ما لم يُطلب tasiHistory
      ...(tasiPromise ? { tasi: await tasiPromise } : {})
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
