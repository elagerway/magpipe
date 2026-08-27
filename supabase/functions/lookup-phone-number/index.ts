/**
 * lookup-phone-number — look up a phone number via SignalWire's Number
 * Lookup API and cross-reference it against the caller's own Magpipe data.
 *
 * POST { number }  (alias: { phone_number })   or  GET ?number=...
 * `number` accepts any common format; normalized to E.164 via _shared/phone-e164.ts.
 *
 * Returns: {
 *   e164, national_format, country,
 *   carrier: { name, type } | null,        // type: mobile|landline|voip
 *   line_type, cnam,
 *   magpipe: { in_contacts, contact_name, blocked, blocked_label,
 *              whitelisted, whitelist_label, whitelist_forward_to,
 *              call_count, sms_count, last_interaction },
 *   signalwire_error?: string,
 *   // backward-compat (legacy SMS-capability shape):
 *   phone_number, valid
 * }
 *
 * SignalWire is billed per lookup, so this only runs on an explicit request
 * (the UI gates it behind a button). If SignalWire errors/times out we still
 * return the Magpipe cross-reference with carrier: null + signalwire_error.
 *
 * Auth: deployed with verify_jwt=false (see _shared/jwt-policy.json).
 * resolveUser gates internally and supports Supabase JWT + mgp_ API keys.
 *
 * Deploy: ./scripts/deploy-functions.sh lookup-phone-number
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { normalizeE164 } from '../_shared/phone-e164.ts'
import { parseLookup, signalwireLookup } from '../_shared/phone-lookup.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function err(code: string, message: string, status = 400): Response {
  return json({ error: { code, message } }, status)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })

    const user = await resolveUser(req, anonClient)
    if (!user) return err('unauthorized', 'Unauthorized', 401)

    // Accept number from JSON body (POST, key `number` or legacy `phone_number`) or query string.
    let rawNumber: string | null = null
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      rawNumber = body?.number ?? body?.phone_number ?? null
    } else {
      rawNumber = new URL(req.url).searchParams.get('number')
    }

    const e164 = normalizeE164(rawNumber)
    if (!e164) return err('invalid_number', `Invalid phone number: "${rawNumber ?? ''}"`, 400)

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const uid = user.id

    // SignalWire lookup + Magpipe cross-reference, all in parallel.
    const [
      sw,
      contactRes,
      blockedRes,
      whitelistRes,
      callRecentRes,
      callCountRes,
      smsCountRes,
      smsRecentRes,
    ] = await Promise.all([
      signalwireLookup(e164),
      supabase.from('contacts').select('name, first_name, last_name').eq('user_id', uid).eq('phone_number', e164).maybeSingle(),
      supabase.from('blocked_callers').select('label').eq('user_id', uid).eq('caller_number', e164).maybeSingle(),
      supabase.from('call_whitelist').select('label, forward_to').eq('user_id', uid).eq('caller_number', e164).limit(1).maybeSingle(),
      supabase.from('call_records').select('created_at').eq('user_id', uid).or(`caller_number.eq.${e164},contact_phone.eq.${e164}`).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('call_records').select('*', { count: 'exact', head: true }).eq('user_id', uid).or(`caller_number.eq.${e164},contact_phone.eq.${e164}`),
      supabase.from('sms_messages').select('*', { count: 'exact', head: true }).eq('user_id', uid).or(`sender_number.eq.${e164},recipient_number.eq.${e164}`),
      supabase.from('sms_messages').select('created_at').eq('user_id', uid).or(`sender_number.eq.${e164},recipient_number.eq.${e164}`).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    // Parse SignalWire defensively. The account's lookup returns:
    //   { e164, country_code, location, national_number_formatted,
    //     number_type: "Fixed Line or Mobile", cnam: { caller_id } }
    // A `carrier` object (name/type) is not returned on this account, so it
    // stays null; line type comes from `number_type`.
    const swData = sw.data || {}
    const parsed = parseLookup(e164, swData)

    const dates = [callRecentRes.data?.created_at, smsRecentRes.data?.created_at].filter(Boolean) as string[]
    const lastInteraction = dates.length
      ? dates.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
      : null

    const contact = contactRes.data
    const contactName = contact
      ? ([contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.name || null)
      : null

    return json({
      e164,
      national_format: parsed.national_format,
      country: parsed.country,
      location: parsed.location,
      carrier: parsed.carrier,
      line_type: parsed.line_type,
      cnam: parsed.cnam,
      magpipe: {
        in_contacts: !!contact,
        contact_name: contactName,
        blocked: !!blockedRes.data,
        blocked_label: blockedRes.data?.label ?? null,
        whitelisted: !!whitelistRes.data,
        whitelist_label: whitelistRes.data?.label ?? null,
        whitelist_forward_to: whitelistRes.data?.forward_to ?? null,
        call_count: callCountRes.count ?? 0,
        sms_count: smsCountRes.count ?? 0,
        last_interaction: lastInteraction,
      },
      // Backward-compat with the legacy SMS-capability shape.
      phone_number: e164,
      valid: !!sw.data,
      ...(sw.error ? { signalwire_error: sw.error } : {}),
    })
  } catch (e) {
    console.error('lookup-phone-number error:', e)
    return err('internal_error', String((e as Error).message || e), 500)
  }
})
