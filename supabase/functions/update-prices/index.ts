Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
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

  // ── جلب أسهم المستخدم ────────────────────────────────────────
  const hRes    = await fetch(
    `${SUPABASE_URL}/rest/v1/holdings?select=ticker&user_id=eq.${userId}`,
    { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
  )
  const holdings = await hRes.json()
  if (!holdings?.length) {
    return new Response(JSON.stringify({ updated: 0, message: 'لا توجد أسهم' }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  const symbols = holdings.map((h: any) => `${h.ticker}.SR`).join(',')
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
    console.log('crumb:', crumb || 'empty')
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

  // ── تحديث الأسعار ────────────────────────────────────────────
  let updated = 0
  const prices: Record<string, number> = {}
  for (const q of quotes) {
    const ticker = q.symbol?.replace('.SR', '')
    const price  = q.regularMarketPrice
    if (!ticker || price == null) continue
    prices[ticker] = price
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/holdings?user_id=eq.${userId}&ticker=eq.${ticker}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify({ current_price: price, price_updated_at: new Date().toISOString() })
      }
    )
    if (r.ok) updated++
  }

  console.log('updated:', updated)
  return new Response(JSON.stringify({ updated, total: quotes.length, prices }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
})
