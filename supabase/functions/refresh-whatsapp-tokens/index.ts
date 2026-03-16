/**
 * Refresh WhatsApp access tokens before they expire.
 * Exchanges each active account's long-lived token for a new one.
 * Designed to run monthly via cron.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const META_APP_ID = Deno.env.get('META_APP_ID')!
const META_APP_SECRET = Deno.env.get('META_APP_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // Allow cron invocation (no JWT) or service role key
  const authHeader = req.headers.get('Authorization') || ''
  const isCron = req.headers.get('x-cron-invoke') === 'true'
  const isServiceRole = authHeader.includes(SUPABASE_SERVICE_ROLE_KEY)

  if (!isCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: accounts, error } = await supabase
    .from('whatsapp_accounts')
    .select('id, phone_number_id, access_token, phone_number')
    .eq('is_active', true)

  if (error || !accounts?.length) {
    console.log('No active WhatsApp accounts to refresh')
    return new Response(JSON.stringify({ refreshed: 0 }))
  }

  const results = []

  for (const account of accounts) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${account.access_token}`
      )
      const data = await res.json()

      if (data.error || !data.access_token) {
        console.error(`Failed to refresh token for ${account.phone_number}:`, data.error?.message)
        results.push({ phone: account.phone_number, success: false, error: data.error?.message })
        continue
      }

      await supabase
        .from('whatsapp_accounts')
        .update({ access_token: data.access_token })
        .eq('id', account.id)

      console.log(`Refreshed token for ${account.phone_number}, expires in ${data.expires_in}s`)
      results.push({ phone: account.phone_number, success: true, expires_in: data.expires_in })
    } catch (err) {
      console.error(`Error refreshing ${account.phone_number}:`, err)
      results.push({ phone: account.phone_number, success: false })
    }
  }

  return new Response(JSON.stringify({ refreshed: results.filter(r => r.success).length, results }))
})
