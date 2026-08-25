// ══════════════════════════════════════════════════════════════
// price-alerts — تنبيهات دخول منطقة التخفيف أو التصفية
// ──────────────────────────────────────────────────────────────
// القاعدة الوحيدة: يُرسَل إشعار عند **دخول** السهم منطقة التخفيف
// (السعر ≥ trim_from) أو منطقة التصفية (السعر ≥ liquidate_above)،
// ثم صمت تام حتى يخرج السعر من المنطقة ويعود إليها (إعادة تسليح).
// منطقة التجميع (accumulate_at) لا تُرسل شيئاً إطلاقاً — قرار المالك.
//
// الحالة محفوظة في جدول alert_state لا في الذاكرة: الدالة عديمة الحالة
// وتُقتل بين التشغيلات، فذاكرة العملية لا تصلح لمنع التكرار.
// ══════════════════════════════════════════════════════════════

const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:8080'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY =
  Deno.env.get('SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
// قيد الخطة المجانية لـ Resend بلا نطاق موثَّق: المرسِل يجب أن يكون
// onboarding@resend.dev، والمستقبِل يجب أن يكون بريد حساب Resend نفسه.
const ALERT_FROM_EMAIL = Deno.env.get('ALERT_FROM_EMAIL') ?? 'onboarding@resend.dev'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'

// الرابط الذي يفتحه الإشعار عند النقر
const APP_URL = Deno.env.get('APP_URL') ?? ALLOWED_ORIGIN

const ZONE_LABEL: Record<string, string> = {
  trim: 'منطقة التخفيف',
  liquidate: 'منطقة التصفية',
}
const ZONE_EMOJI: Record<string, string> = { trim: '🟡', liquidate: '🔴' }

// ══════════════════════════════════════════════════════════════
// أدوات base64url
// ══════════════════════════════════════════════════════════════
function b64uToBytes(s: string): Uint8Array {
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
  while (t.length % 4 !== 0) t += '='
  const bin = atob(t)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64u(b: ArrayBuffer | Uint8Array): string {
  const u8 = b instanceof Uint8Array ? b : new Uint8Array(b)
  let bin = ''
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let n = 0
  for (const p of parts) n += p.length
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

const utf8 = (s: string) => new TextEncoder().encode(s)

// ══════════════════════════════════════════════════════════════
// Web Push — VAPID (ES256) + تشفير الحمولة (aes128gcm)
// ──────────────────────────────────────────────────────────────
// قرار تقني: نُنفّذ RFC 8291 + RFC 8188 مباشرةً على Web Crypto المتاحة
// في Deno بدل مكتبة خارجية. السبب: صفر اعتماديات تُجلَب عند الإقلاع
// البارد، وصفر مفاجآت في واجهة مكتبة لا يمكن تجريبها هنا. الخوارزمية
// نفسها ثابتة ومحدَّدة في المعيار، ومكوّناتها (ECDH، HKDF، AES-GCM،
// ECDSA) كلها أصلية في Web Crypto.
// ══════════════════════════════════════════════════════════════

// HKDF-SHA256 بخطوتيه: استخراج (HMAC بالملح) ثم توسيع بكتلة واحدة.
// كل الأطوال المطلوبة هنا ≤ 32 بايت فبلوك واحد يكفي (info || 0x01).
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm))
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const okm = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, concatBytes(info, new Uint8Array([1]))))
  return okm.slice(0, len)
}

// يستورد مفتاح VAPID الخاص. يقبل صيغتين:
//  - base64url لـ 32 بايت خام (مخرَج `web-push generate-vapid-keys`)
//  - JWK كنصّ JSON
let vapidKeyPromise: Promise<CryptoKey> | null = null
function getVapidPrivateKey(): Promise<CryptoKey> {
  return (vapidKeyPromise ??= (async () => {
    const trimmed = VAPID_PRIVATE_KEY.trim()
    if (trimmed.startsWith('{')) {
      const jwk = JSON.parse(trimmed)
      return await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
    }
    // Web Crypto لا يستورد مفتاحاً خاصاً بصيغة raw، فنبني JWK:
    // d من المفتاح الخاص، و x/y مقتطعان من المفتاح العام (0x04 || x32 || y32)
    const d = b64uToBytes(trimmed)
    const pub = b64uToBytes(VAPID_PUBLIC_KEY)
    if (d.length !== 32) throw new Error(`VAPID_PRIVATE_KEY طوله ${d.length} بايت، والمتوقع 32`)
    if (pub.length !== 65 || pub[0] !== 0x04) throw new Error(`VAPID_PUBLIC_KEY ليس نقطة P-256 غير مضغوطة (65 بايت تبدأ بـ 0x04)`)
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      d: bytesToB64u(d),
      x: bytesToB64u(pub.slice(1, 33)),
      y: bytesToB64u(pub.slice(33, 65)),
      ext: true,
    }
    return await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  })())
}

// JWT بتوقيع ES256 — التوقيع الخام r||s (64 بايت) هو تماماً ما يطلبه JWS
async function vapidAuthHeader(endpoint: string): Promise<string> {
  const aud = new URL(endpoint).origin
  const header = bytesToB64u(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64u(utf8(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,  // المعيار يسمح بـ24 ساعة كحدّ أقصى
    sub: VAPID_SUBJECT,
  })))
  const signingInput = `${header}.${claims}`
  const key = await getVapidPrivateKey()
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(signingInput))
  const jwt = `${signingInput}.${bytesToB64u(sig)}`
  return `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`
}

// تشفير الحمولة وفق RFC 8291 (aes128gcm)
async function encryptPayload(payload: string, p256dhB64: string, authB64: string): Promise<Uint8Array> {
  const uaPublicRaw = b64uToBytes(p256dhB64)
  const authSecret = b64uToBytes(authB64)
  if (uaPublicRaw.length !== 65) throw new Error(`p256dh طوله ${uaPublicRaw.length} والمتوقع 65`)

  const uaPublicKey = await crypto.subtle.importKey(
    'raw', uaPublicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  )
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, eph.privateKey, 256)
  )

  // IKM = HKDF(salt=auth_secret, ikm=ecdh_secret, info="WebPush: info"\0 || ua_pub || as_pub)
  const keyInfo = concatBytes(utf8('WebPush: info'), new Uint8Array([0]), uaPublicRaw, asPublicRaw)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, concatBytes(utf8('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16)
  const nonce = await hkdf(salt, ikm, concatBytes(utf8('Content-Encoding: nonce'), new Uint8Array([0])), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  // 0x02 = فاصل «السجل الأخير» في RFC 8188 (سجل واحد فقط هنا)
  const plaintext = concatBytes(utf8(payload), new Uint8Array([2]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plaintext)
  )

  // ترويسة السجل: salt(16) || rs(4، big-endian) || idlen(1) || as_public(65)
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096, false)
  return concatBytes(salt, rs, new Uint8Array([asPublicRaw.length]), asPublicRaw, ciphertext)
}

type PushSub = { id: string; endpoint: string; p256dh: string; auth: string }

// يُرجع 'ok' | 'gone' (اشتراك منتهٍ يُحذف) | نصّ الخطأ
async function sendPush(sub: PushSub, payload: Record<string, unknown>): Promise<'ok' | 'gone' | string> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return 'مفاتيح VAPID غير مضبوطة'
  try {
    const body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth)
    const auth = await vapidAuthHeader(sub.endpoint)
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'high',
      },
      body,
    })
    if (res.ok) return 'ok'
    // 404/410 = المتصفح ألغى الاشتراك — ليس فشلاً، بل صفّ ميت يُحذف
    if (res.status === 404 || res.status === 410) return 'gone'
    const txt = await res.text().catch(() => '')
    return `HTTP ${res.status} ${txt.slice(0, 160)}`
  } catch (e) {
    return String(e)
  }
}

// ══════════════════════════════════════════════════════════════
// البريد عبر Resend
// ══════════════════════════════════════════════════════════════
async function sendEmail(to: string, subject: string, html: string): Promise<'ok' | string> {
  if (!RESEND_API_KEY) return 'RESEND_API_KEY غير مضبوط'
  if (!to) return 'لا يوجد بريد مستقبِل'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: ALERT_FROM_EMAIL, to, subject, html }),
    })
    if (res.ok) return 'ok'
    const txt = await res.text().catch(() => '')
    return `HTTP ${res.status} ${txt.slice(0, 200)}`
  } catch (e) {
    return String(e)
  }
}

// ══════════════════════════════════════════════════════════════
// أسعار ياهو — نفس نمط update-prices (cookie + crumb + /v7/finance/quote)
// ──────────────────────────────────────────────────────────────
// قرار تقني: نُكرّر المنطق هنا بدل استدعاء update-prices داخلياً، لسببين:
//  (1) update-prices يتحقّق من **توكن مستخدم** عبر /auth/v1/user، والجدولة
//      لا تملك إلا مفتاح الخدمة — كنا سنضطر لتوليد توكن لكل مستخدم.
//  (2) update-prices يكتب في holdings؛ وظيفة التنبيه يجب أن تبقى قراءة
//      محضة فلا تُفسد price_manual ولا price_updated_at.
// ══════════════════════════════════════════════════════════════
async function fetchYahooPrices(tickers: string[]): Promise<{ prices: Record<string, number>; error: string | null }> {
  if (!tickers.length) return { prices: {}, error: null }
  try {
    let cookie = ''
    let crumb = ''
    try {
      const cookieRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'follow' })
      cookie = cookieRes.headers.get('set-cookie')?.split(';')[0] ?? ''
      const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': UA, Cookie: cookie },
      })
      crumb = await crumbRes.text()
    } catch (e) {
      console.log('crumb error:', String(e))
    }

    const symbols = tickers.map((t) => `${t}.SR`).join(',')
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`
      + `&fields=regularMarketPrice${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ''}`
    const res = await fetch(url, { headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) } })
    if (!res.ok) return { prices: {}, error: `yahoo HTTP ${res.status}` }

    const quotes = (await res.json())?.quoteResponse?.result ?? []
    const prices: Record<string, number> = {}
    for (const q of quotes) {
      const t = q?.symbol?.replace('.SR', '')
      const p = q?.regularMarketPrice
      // نفس حارس update-prices: نرفض المفقود والصفر والسالب والمبالغ فيه
      if (!t || typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p > 1_000_000) continue
      prices[t] = p
    }
    return { prices, error: null }
  } catch (e) {
    return { prices: {}, error: String(e) }
  }
}

// ══════════════════════════════════════════════════════════════
// Supabase REST بمفتاح الخدمة
// ══════════════════════════════════════════════════════════════
function sbHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function sbSelect<T = any>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`REST ${path.split('?')[0]} → ${res.status} ${txt.slice(0, 200)}`)
  }
  return await res.json()
}

// ══════════════════════════════════════════════════════════════
// بناء الرسائل
// ══════════════════════════════════════════════════════════════
type Hit = {
  ticker: string
  name: string
  zone: 'trim' | 'liquidate'
  price: number
  threshold: number
  stale: boolean       // السعر مخزَّن لا مجلوب — يُعلَن ولا يُكتَم
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function buildEmailHtml(hits: Hit[]): string {
  const anyStale = hits.some((h) => h.stale)
  const rows = hits.map((h) => {
    const gapPct = h.threshold > 0 ? ((h.price - h.threshold) / h.threshold) * 100 : 0
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;">${esc(h.ticker)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${esc(h.name || '—')}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
          ${ZONE_EMOJI[h.zone]} ${ZONE_LABEL[h.zone]}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
          ${fmt(h.price)}${h.stale ? ' <span style="color:#b45309;font-size:12px;">(مخزَّن)</span>' : ''}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${fmt(h.threshold)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap;color:#047857;">
          +${gapPct.toFixed(1)}%
        </td>
      </tr>`
  }).join('')

  const staleNote = anyStale
    ? `<p style="margin:0 0 16px;padding:10px 14px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;color:#92400e;font-size:13px;">
         ⚠️ تعذّر تحديث بعض الأسعار من المصدر، فاستُخدم آخر سعر مخزَّن في محفظتك (المعلَّم بـ«مخزَّن»). راجعه قبل أي إجراء.
       </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;" dir="rtl">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <div style="padding:20px 24px;background:#0f172a;color:#ffffff;">
      <div style="font-size:18px;font-weight:800;">تنبيه أسعار — محفظة ثروة</div>
      <div style="font-size:13px;opacity:.8;margin-top:4px;">
        ${hits.length} ${hits.length === 1 ? 'سهم دخل' : 'سهماً دخلت'} منطقة تستوجب نظرك
      </div>
    </div>
    <div style="padding:20px 24px;">
      ${staleNote}
      <table style="width:100%;border-collapse:collapse;font-size:14px;" dir="rtl">
        <thead>
          <tr style="background:#f1f5f9;text-align:right;">
            <th style="padding:10px 12px;font-weight:700;">الرمز</th>
            <th style="padding:10px 12px;font-weight:700;">الاسم</th>
            <th style="padding:10px 12px;font-weight:700;">المنطقة</th>
            <th style="padding:10px 12px;font-weight:700;">السعر الحالي</th>
            <th style="padding:10px 12px;font-weight:700;">الحدّ</th>
            <th style="padding:10px 12px;font-weight:700;">الفارق</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <p style="margin:18px 0 0;font-size:13px;line-height:1.9;color:#475569;">
        هذا إشعار آلي بدخول السعر منطقة عرّفتها أنت في مهام المحفظة. <strong>لا يحمل توصية ولا قراراً</strong> —
        القرار لك وحدك بعد مراجعة المواد المنطبقة. ولن يتكرّر هذا التنبيه لنفس السهم ونفس المنطقة
        حتى يخرج السعر من المنطقة ثم يعود إليها.
      </p>
      <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">
        لإيقاف هذه التنبيهات أو تعديل حدودها: صفحة الإعدادات في التطبيق.
      </p>
    </div>
  </div>
</body>
</html>`
}

function buildEmailSubject(hits: Hit[]): string {
  if (hits.length === 1) {
    const h = hits[0]
    return `${ZONE_EMOJI[h.zone]} ${h.ticker} دخل ${ZONE_LABEL[h.zone]} — ${fmt(h.price)}`
  }
  const liq = hits.filter((h) => h.zone === 'liquidate').length
  return `${liq ? '🔴' : '🟡'} ${hits.length} أسهم دخلت مناطق التخفيف/التصفية`
}

// ══════════════════════════════════════════════════════════════
// إرسال لمستخدم واحد — فشل قناة لا يمنع الأخرى
// ══════════════════════════════════════════════════════════════
type DeliverResult = {
  attempted: boolean
  anySuccess: boolean
  emailResult: string | null
  pushSent: number
  pushFailed: number
  pushRemoved: number
  errors: string[]
}

async function deliver(
  prefs: any,
  subs: PushSub[],
  subject: string,
  html: string,
  pushPayload: Record<string, unknown> | null,
): Promise<DeliverResult> {
  const out: DeliverResult = {
    attempted: false, anySuccess: false, emailResult: null,
    pushSent: 0, pushFailed: 0, pushRemoved: 0, errors: [],
  }

  const wantEmail = prefs.email_enabled === true && !!prefs.email
  const wantPush = prefs.push_enabled === true && subs.length > 0 && !!pushPayload

  if (!wantEmail && !wantPush) return out
  out.attempted = true

  // القناتان تُطلقان معاً؛ Promise.allSettled يضمن ألا يُسقط فشلُ إحداهما الأخرى
  const tasks: Promise<void>[] = []

  if (wantEmail) {
    tasks.push((async () => {
      const r = await sendEmail(prefs.email, subject, html)
      out.emailResult = r
      if (r === 'ok') out.anySuccess = true
      else out.errors.push(`email(${prefs.user_id}): ${r}`)
    })())
  }

  if (wantPush) {
    for (const sub of subs) {
      tasks.push((async () => {
        const r = await sendPush(sub, pushPayload!)
        if (r === 'ok') { out.pushSent++; out.anySuccess = true; return }
        if (r === 'gone') {
          out.pushRemoved++
          // اشتراك منتهٍ يُحذف ولا يُحسَب فشلاً
          try {
            await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${sub.id}`, {
              method: 'DELETE', headers: sbHeaders({ Prefer: 'return=minimal' }),
            })
          } catch (e) { out.errors.push(`deleteSub: ${String(e)}`) }
          return
        }
        out.pushFailed++
        out.errors.push(`push: ${r}`)
      })())
    }
  }

  await Promise.allSettled(tasks)
  return out
}

// ══════════════════════════════════════════════════════════════
// نقطة الدخول
// ══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: cors })

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ ok: false, message: 'SUPABASE_URL أو SERVICE_ROLE_KEY غير مضبوط' }, 500)
    }

    // ── جسم الطلب (الجدولة تستدعي بلا جسم) ───────────────────
    let body: any = {}
    try { body = await req.json() } catch (_) { /* بلا جسم — طبيعي في الجدولة */ }

    // ── التحقق من الاستدعاء ──────────────────────────────────
    // الجدولة: Authorization = مفتاح الخدمة ⇒ صلاحية كل المستخدمين.
    // العميل: توكن المستخدم ⇒ يُتحقَّق منه ويُقصَر النطاق على صاحبه.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const isService = !!token && token === SERVICE_KEY

    let scopedUserId: string | null = null
    if (!isService) {
      if (!token) return json({ ok: false, message: 'Unauthorized' }, 401)
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
      })
      if (!userRes.ok) return json({ ok: false, message: 'Unauthorized' }, 401)
      const u = await userRes.json()
      if (!u?.id) return json({ ok: false, message: 'Unauthorized' }, 401)
      scopedUserId = u.id
    } else if (typeof body?.userId === 'string' && body.userId) {
      // مفتاح الخدمة وحده يجوز له تحديد مستخدم بعينه.
      // يُطابَق على شكل UUID قبل أن يدخل رابط PostgREST (لا نبني استعلاماً من نصّ حرّ)
      if (!/^[0-9a-fA-F-]{36}$/.test(body.userId)) {
        return json({ ok: false, message: 'userId ليس UUID صالحاً' }, 400)
      }
      scopedUserId = body.userId
    }

    // ══════════════════════════════════════════════════════════
    // وضع الاختبار — رسالة تجريبية، ولا يمسّ alert_state إطلاقاً
    // ══════════════════════════════════════════════════════════
    if (body?.test === true) {
      const targetId = scopedUserId
      if (!targetId) return json({ ok: false, message: 'وضع الاختبار يحتاج مستخدماً محدَّداً' }, 400)

      const channel: string = ['email', 'push', 'both'].includes(body?.channel) ? body.channel : 'both'
      const prefsRows = await sbSelect(
        `notification_prefs?select=user_id,email,email_enabled,push_enabled&user_id=eq.${targetId}`
      )
      const prefs = prefsRows[0]
      if (!prefs) return json({ ok: false, message: 'لا توجد تفضيلات إشعارات لهذا المستخدم — احفظها أولاً' }, 400)

      const subs: PushSub[] = channel === 'email' ? [] : await sbSelect(
        `push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${targetId}`
      )

      const now = new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })
      const sampleHits: Hit[] = [{
        ticker: '0000', name: 'رسالة تجريبية', zone: 'trim',
        price: 100, threshold: 95, stale: false,
      }]
      const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:'Segoe UI',Tahoma,Arial,sans-serif;" dir="rtl">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;">
    <div style="font-size:18px;font-weight:800;color:#0f172a;">✅ رسالة تجريبية — تنبيهات ثروة</div>
    <p style="font-size:14px;line-height:2;color:#334155;margin:14px 0 0;">
      وصلتك هذه الرسالة، إذن قناة البريد تعمل. التنبيهات الحقيقية تُرسَل فقط عند دخول سهم
      <strong>منطقة التخفيف</strong> أو <strong>منطقة التصفية</strong> التي عرّفتها في مهام المحفظة —
      ولا شيء غيرهما. منطقة التجميع لا تُرسل إشعاراً.
    </p>
    <p style="font-size:13px;color:#64748b;margin:14px 0 0;">وقت الاختبار: ${esc(now)}</p>
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0;">
    <div style="font-size:13px;color:#64748b;">هكذا سيبدو جدول التنبيه:</div>
    ${buildEmailHtml(sampleHits).split('<tbody>')[1]?.split('</tbody>')[0]
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;" dir="rtl"><tbody>${
          buildEmailHtml(sampleHits).split('<tbody>')[1].split('</tbody>')[0]
        }</tbody></table>`
      : ''}
  </div>
</body></html>`

      const result = await deliver(
        {
          ...prefs,
          // وضع الاختبار يتجاوز مفاتيح التفضيل عمداً: ضغط زرّ «اختبر البريد»
          // هو النيّة نفسها، فلا معنى لأن يصمت لأن التنبيهات الدورية موقوفة.
          // (وجود العنوان ووجود اشتراك يبقيان شرطين — يُفحصان في deliver.)
          email_enabled: channel !== 'push',
          push_enabled: channel !== 'email',
        },
        subs,
        '✅ رسالة تجريبية — تنبيهات محفظة ثروة',
        html,
        channel === 'email' ? null : {
          title: '✅ رسالة تجريبية — ثروة',
          body: 'قناة إشعارات المتصفح تعمل. التنبيهات الحقيقية عند دخول منطقة التخفيف أو التصفية فقط.',
          tag: 'tharwa-test',
          url: APP_URL,
        },
      )

      return json({
        ok: result.attempted ? result.anySuccess : false,
        mode: 'test',
        channel,
        attempted: result.attempted,
        email: result.emailResult,
        push: { sent: result.pushSent, failed: result.pushFailed, removed: result.pushRemoved, subscriptions: subs.length },
        errors: result.errors,
        note: result.attempted ? undefined : 'لا قناة مفعَّلة: تحقّق من تفعيل البريد ووجود عنوانه، أو من وجود اشتراك متصفح',
      })
    }

    // ══════════════════════════════════════════════════════════
    // الفحص الدوري
    // ══════════════════════════════════════════════════════════
    const errors: string[] = []
    let usersChecked = 0
    let alertsSent = 0
    let rearmed = 0
    let emailsSent = 0
    let pushSent = 0
    let pushFailed = 0
    let pushRemoved = 0

    // المستخدمون المفعَّلون على قناة واحدة على الأقل
    const prefsQuery = `notification_prefs?select=user_id,email,email_enabled,push_enabled`
      + `&or=(email_enabled.eq.true,push_enabled.eq.true)`
      + (scopedUserId ? `&user_id=eq.${scopedUserId}` : '')
    const allPrefs = await sbSelect<any>(prefsQuery)

    if (!allPrefs.length) {
      return json({ ok: true, mode: 'scan', usersChecked: 0, alertsSent: 0, rearmed: 0, message: 'لا مستخدمين مفعَّلين' })
    }

    // ── المرحلة 1: جمع بيانات كل مستخدم (مناطق طازجة من DB في كل تشغيل،
    //    فأي سهم جديد أو حدّ معدَّل يدخل تلقائياً بلا أي إعداد)
    type UserCtx = {
      prefs: any
      holdings: Map<string, { name: string; stored: number | null }>
      zones: Map<string, { name: string; trim: number | null; liquidate: number | null }>
      state: Map<string, { armed: boolean }>
      subs: PushSub[]
    }
    const ctxs: UserCtx[] = []
    const tickerUnion = new Set<string>()

    for (const prefs of allPrefs) {
      const uid = prefs.user_id
      try {
        const [holdingRows, taskRows, stateRows, subRows] = await Promise.all([
          sbSelect<any>(`holdings?select=ticker,name,current_price&user_id=eq.${uid}`),
          sbSelect<any>(
            `portfolio_tasks?select=ticker,name,trim_from,liquidate_above,updated_at,created_at`
            + `&user_id=eq.${uid}&status=eq.active&ticker=not.is.null`
          ),
          sbSelect<any>(`alert_state?select=ticker,zone,armed&user_id=eq.${uid}`),
          prefs.push_enabled
            ? sbSelect<PushSub>(`push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${uid}`)
            : Promise.resolve([] as PushSub[]),
        ])

        const holdings = new Map<string, { name: string; stored: number | null }>()
        for (const h of holdingRows) {
          if (!h?.ticker) continue
          const p = Number(h.current_price)
          holdings.set(String(h.ticker), {
            name: h.name ?? '',
            stored: Number.isFinite(p) && p > 0 ? p : null,
          })
        }

        // مهمة واحدة لكل رمز: نأخذ **الأحدث** (updated_at ثم created_at).
        // لو كرّر المالك مهامّ نشطة لنفس السهم، الأحدث هو قراره الساري.
        const byTicker = new Map<string, any>()
        for (const t of taskRows) {
          const tk = String(t.ticker || '').trim()
          if (!tk) continue
          const prev = byTicker.get(tk)
          const stamp = t.updated_at || t.created_at || ''
          const prevStamp = prev ? (prev.updated_at || prev.created_at || '') : ''
          if (!prev || stamp > prevStamp) byTicker.set(tk, t)
        }

        const posNum = (v: any): number | null => {
          const n = Number(v)
          return Number.isFinite(n) && n > 0 ? n : null
        }
        const zones = new Map<string, { name: string; trim: number | null; liquidate: number | null }>()
        for (const [tk, t] of byTicker) {
          const trim = posNum(t.trim_from)
          const liquidate = posNum(t.liquidate_above)
          if (trim == null && liquidate == null) continue   // لا حدّ معرَّف ⇒ لا مراقبة
          zones.set(tk, { name: t.name || holdings.get(tk)?.name || '', trim, liquidate })
          tickerUnion.add(tk)
        }

        const state = new Map<string, { armed: boolean }>()
        for (const s of stateRows) state.set(`${s.ticker}|${s.zone}`, { armed: s.armed !== false })

        ctxs.push({ prefs, holdings, zones, state, subs: subRows })
        usersChecked++
      } catch (e) {
        // فشل مستخدم لا يوقف البقية
        errors.push(`user ${uid}: ${String(e)}`)
      }
    }

    if (!tickerUnion.size) {
      return json({
        ok: true, mode: 'scan', usersChecked, alertsSent: 0, rearmed: 0,
        message: 'لا أسهم بحدود تخفيف أو تصفية معرَّفة', errors,
      })
    }

    // ── المرحلة 2: سعر واحد لكل رمز عبر كل المستخدمين (طلب ياهو واحد)
    const { prices, error: priceError } = await fetchYahooPrices([...tickerUnion])
    if (priceError) errors.push(`prices: ${priceError}`)

    const nowISO = new Date().toISOString()

    // ── المرحلة 3: التقييم والإرسال
    for (const ctx of ctxs) {
      try {
        const hits: Hit[] = []
        const toDisarm: Hit[] = []
        const toRearm: { ticker: string; zone: 'trim' | 'liquidate' }[] = []

        for (const [ticker, z] of ctx.zones) {
          const live = prices[ticker]
          const stored = ctx.holdings.get(ticker)?.stored ?? null
          // فشل الجلب ⇒ نستخدم السعر المخزَّن ونعلن ذلك في الرسالة (لا صمت)
          const price = (typeof live === 'number' && live > 0) ? live : stored
          const stale = !(typeof live === 'number' && live > 0)
          if (price == null) {
            errors.push(`${ticker}: لا سعر حيّ ولا مخزَّن`)
            continue
          }

          for (const zone of ['trim', 'liquidate'] as const) {
            const threshold = zone === 'trim' ? z.trim : z.liquidate
            if (threshold == null) continue

            const inZone = price >= threshold
            const armed = ctx.state.get(`${ticker}|${zone}`)?.armed ?? true   // غياب الصفّ = مُسلَّح

            if (inZone && armed) {
              const hit: Hit = { ticker, name: z.name, zone, price, threshold, stale }
              hits.push(hit)
              toDisarm.push(hit)
            } else if (!inZone && !armed) {
              toRearm.push({ ticker, zone })   // خرج من المنطقة ⇒ يُسلَّح بلا إرسال
            }
          }
        }

        // إعادة التسليح تُنفَّذ دائماً ولو لم يكن هناك إرسال
        if (toRearm.length) {
          const rows = toRearm.map((r) => ({
            user_id: ctx.prefs.user_id, ticker: r.ticker, zone: r.zone,
            armed: true, updated_at: nowISO,
          }))
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/alert_state?on_conflict=user_id,ticker,zone`,
            {
              method: 'POST',
              headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
              body: JSON.stringify(rows),
            }
          )
          if (res.ok) rearmed += rows.length
          else errors.push(`rearm ${ctx.prefs.user_id}: HTTP ${res.status}`)
        }

        if (!hits.length) continue

        // رسالة بريد واحدة تجمع كل ما دخل في هذا التشغيل (لا رسالة لكل سهم)
        hits.sort((a, b) => (a.zone === b.zone ? a.ticker.localeCompare(b.ticker) : a.zone === 'liquidate' ? -1 : 1))
        const subject = buildEmailSubject(hits)
        const html = buildEmailHtml(hits)

        // الـpush: إشعار لكل سهم، والـtag يجمع إشعارات نفس السهم فلا تتكدّس.
        // نرسل حمولة واحدة مجمَّعة إن تعدّدت الأسهم كي لا نُغرِق الجهاز.
        const pushPayload = hits.length === 1
          ? {
              title: `${ZONE_EMOJI[hits[0].zone]} ${hits[0].ticker} — ${ZONE_LABEL[hits[0].zone]}`,
              body: `السعر ${fmt(hits[0].price)} تجاوز الحدّ ${fmt(hits[0].threshold)}${hits[0].stale ? ' (سعر مخزَّن)' : ''}`,
              tag: `tharwa-${hits[0].ticker}-${hits[0].zone}`,
              url: APP_URL,
            }
          : {
              title: `${hits.some((h) => h.zone === 'liquidate') ? '🔴' : '🟡'} ${hits.length} أسهم دخلت مناطق تستوجب نظرك`,
              body: hits.map((h) => `${h.ticker} ${ZONE_LABEL[h.zone]} ${fmt(h.price)}`).join(' · '),
              tag: 'tharwa-zones',
              url: APP_URL,
            }

        const result = await deliver(ctx.prefs, ctx.subs, subject, html, pushPayload)
        if (result.emailResult === 'ok') emailsSent++
        pushSent += result.pushSent
        pushFailed += result.pushFailed
        pushRemoved += result.pushRemoved
        errors.push(...result.errors)

        // نزع التسليح فقط إذا وصلت الرسالة فعلاً بقناة واحدة على الأقل،
        // أو إذا لم تكن هناك قناة أصلاً. الفشل الحقيقي يُبقيها مُسلَّحة
        // ليُعاد المحاولة في التشغيل التالي بدل ضياع التنبيه صامتاً.
        if (!result.attempted || result.anySuccess) {
          const rows = toDisarm.map((h) => ({
            user_id: ctx.prefs.user_id, ticker: h.ticker, zone: h.zone,
            armed: false, last_fired_at: nowISO, last_price: h.price, updated_at: nowISO,
          }))
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/alert_state?on_conflict=user_id,ticker,zone`,
            {
              method: 'POST',
              headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
              body: JSON.stringify(rows),
            }
          )
          if (res.ok) alertsSent += rows.length
          else errors.push(`disarm ${ctx.prefs.user_id}: HTTP ${res.status}`)
        } else {
          errors.push(`${ctx.prefs.user_id}: فشل الإرسال — أُبقيت ${toDisarm.length} إشارة مُسلَّحة لإعادة المحاولة`)
        }
      } catch (e) {
        errors.push(`deliver ${ctx.prefs?.user_id}: ${String(e)}`)
      }
    }

    console.log(`scan: users=${usersChecked} alerts=${alertsSent} rearmed=${rearmed} errors=${errors.length}`)
    return json({
      ok: true,
      mode: 'scan',
      usersChecked,
      tickersWatched: tickerUnion.size,
      alertsSent,
      rearmed,
      emailsSent,
      push: { sent: pushSent, failed: pushFailed, removed: pushRemoved },
      priceSource: priceError ? 'stored (تعذّر ياهو)' : 'yahoo',
      pricesFetched: Object.keys(prices).length,
      // نقصّ السجلّ حتى لا ينتفخ الرد في تشغيل فاشل على مستوى كل الأسهم
      errors: errors.slice(0, 50),
      errorCount: errors.length,
    })
  } catch (e) {
    console.log('unhandled error:', String(e))
    return new Response(
      JSON.stringify({ ok: false, message: 'internal error: ' + String(e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
