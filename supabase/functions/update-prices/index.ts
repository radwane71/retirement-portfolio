// M-4: restrict CORS to your production domain — set APP_ORIGIN env var in Supabase dashboard
// Falls back to localhost for local dev; '*' is never used as a default
const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:8080'

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: cors })

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
  let extraTickers: string[] = []
  try {
    const body = await req.json()
    if (Array.isArray(body?.tickers)) {
      extraTickers = body.tickers
        .map((t: any) => String(t).trim().toUpperCase())
        .filter((t: string) => /^[A-Z0-9.]{1,12}$/.test(t))
    }
  } catch (_) { /* لا جسم / ليس JSON — تجاهل */ }

  // ── جلب أسهم المستخدم ────────────────────────────────────────
  const hRes    = await fetch(
    `${SUPABASE_URL}/rest/v1/holdings?select=ticker&user_id=eq.${userId}`,
    { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
  )
  const holdings = await hRes.json()

  // مجموعة الرموز المملوكة (تُحدَّث في DB) ومجموعة الكل (تُجلب أسعارها)
  const heldTickers: string[] = (holdings || []).map((h: any) => h.ticker)
  const allTickerSet = new Set<string>([...heldTickers, ...extraTickers])
  if (!allTickerSet.size) {
    return new Response(JSON.stringify({ updated: 0, prices: {}, failed: [], message: 'لا توجد أسهم' }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  const symbols = [...allTickerSet].map((t) => `${t}.SR`).join(',')
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

  // ── الحصول على cookie + crumb من Yahoo Finance ───────────────
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
  } catch(e) {
    console.log('crumb fetch error:', String(e))
  }

  // ── جلب الأسعار ──────────────────────────────────────────────
  const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice${crumb ? `&crumb=${crumb}` : ''}`
  const yRes = await fetch(yahooUrl, {
    headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) }
  })
  console.log('yahoo status:', yRes.status)

  if (!yRes.ok) {
    const txt = await yRes.text()
    console.log('yahoo body:', txt.slice(0, 300))
    return new Response(JSON.stringify({ updated: 0, message: `yahoo ${yRes.status}` }), {
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
    Object.entries(prices).filter(([ticker]) => heldSet.has(ticker)).map(([ticker, price]) =>
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
  return new Response(JSON.stringify({ updated, total: quotes.length, prices, failed: failedTickers }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
})
