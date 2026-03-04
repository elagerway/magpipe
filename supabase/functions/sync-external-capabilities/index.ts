/**
 * Sync External Number Capabilities
 *
 * Fetches phone number capabilities from external providers (Twilio, etc.)
 * and updates the external_sip_numbers table.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's external trunks with API credentials
    const { data: trunks, error: trunkError } = await supabase
      .from('external_sip_trunks')
      .select('id, provider, api_account_sid, api_auth_token_encrypted')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (trunkError) throw trunkError

    let updated = 0
    let errors = 0
    const skipped: string[] = []

    for (const trunk of trunks || []) {
      if (!trunk.api_account_sid || !trunk.api_auth_token_encrypted) {
        skipped.push(trunk.id)
        continue
      }

      // Get numbers for this trunk
      const { data: numbers } = await supabase
        .from('external_sip_numbers')
        .select('id, phone_number, capabilities')
        .eq('trunk_id', trunk.id)

      if (!numbers || numbers.length === 0) continue

      const provider = (trunk.provider || '').toLowerCase()

      if (provider === 'twilio') {
        const result = await syncTwilioCapabilities(
          supabase,
          trunk.api_account_sid,
          trunk.api_auth_token_encrypted,
          numbers
        )
        updated += result.updated
        errors += result.errors
      } else {
        skipped.push(trunk.id)
      }
    }

    return new Response(
      JSON.stringify({ success: true, updated, errors, skipped: skipped.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in sync-external-capabilities:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function syncTwilioCapabilities(
  supabase: any,
  accountSid: string,
  authToken: string,
  numbers: { id: string; phone_number: string; capabilities: any }[]
) {
  let updated = 0
  let errors = 0

  // Fetch all incoming numbers from Twilio
  // authToken can be "AUTH_TOKEN" or "API_KEY_SID:API_KEY_SECRET"
  const authCredential = authToken.includes(':') ? authToken : `${accountSid}:${authToken}`
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=1000`,
    {
      headers: {
        'Authorization': 'Basic ' + btoa(authCredential),
      },
    }
  )

  if (!response.ok) {
    console.error('Twilio API error:', response.status, await response.text())
    return { updated: 0, errors: numbers.length }
  }

  const data = await response.json()
  const twilioNumbers = data.incoming_phone_numbers || []

  for (const number of numbers) {
    const twilioNum = twilioNumbers.find(
      (t: any) => t.phone_number === number.phone_number
    )

    if (!twilioNum) continue

    const twilioCaps = twilioNum.capabilities || {}
    const existing = number.capabilities || {}

    // Merge: only upgrade, never downgrade (same as SignalWire sync)
    const merged = {
      voice: existing.voice === true || twilioCaps.voice === true,
      sms: existing.sms === true || twilioCaps.sms === true,
      mms: existing.mms === true || twilioCaps.mms === true,
    }

    // Only update if changed
    if (merged.voice !== existing.voice ||
        merged.sms !== existing.sms ||
        merged.mms !== existing.mms) {
      const { error } = await supabase
        .from('external_sip_numbers')
        .update({ capabilities: merged })
        .eq('id', number.id)

      if (error) {
        console.error('Error updating:', number.phone_number, error)
        errors++
      } else {
        console.log('Updated capabilities for:', number.phone_number, merged)
        updated++
      }
    }
  }

  return { updated, errors }
}
