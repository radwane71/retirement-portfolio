import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // تحقق من المستخدم
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401 })

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return new Response('Unauthorized', { status: 401 })

    // جلب رموز الأسهم من holdings للمستخدم
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: holdings, error: hErr } = await serviceClient
      .from('holdings')
      .select('ticker')
      .eq('user_id', user.id)

    if (hErr || !holdings?.length) {
      return new Response(JSON.stringify({ updated: 0, message: 'لا توجد أسهم' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // تحويل الرموز لصيغة Yahoo Finance: 1010 → 1010.SR
    const symbols = holdings.map(h => `${h.ticker}.SR`).join(',')

    // جلب الأسعار من Yahoo Finance
    const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,shortName`
    const yahooRes = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })

    if (!yahooRes.ok) throw new Error(`Yahoo Finance error: ${yahooRes.status}`)

    const yahooData = await yahooRes.json()
    const quotes = yahooData?.quoteResponse?.result || []

    if (!quotes.length) {
      return new Response(JSON.stringify({ updated: 0, message: 'لم تُرجع Yahoo Finance أسعاراً' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // تحديث الأسعار في Supabase
    let updated = 0
    for (const q of quotes) {
      const ticker = q.symbol?.replace('.SR', '')
      const price = q.regularMarketPrice
      if (!ticker || price == null) continue

      await serviceClient
        .from('holdings')
        .update({ current_price: price, price_updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('ticker', ticker)

      updated++
    }

    return new Response(JSON.stringify({ updated, total: quotes.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
