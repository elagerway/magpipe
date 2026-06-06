/**
 * Meta Deauthorize Callback
 * Called when a user removes the app from their Facebook account.
 * Deactivates any associated WhatsApp accounts.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const META_APP_SECRET = Deno.env.get('META_APP_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK')

  try {
    const body = await req.text()
    const params = new URLSearchParams(body)
    const signedRequest = params.get('signed_request')

    if (!signedRequest) return new Response('OK')

    // Validate and decode the signed request
    const [encodedSig, payload] = signedRequest.split('.')
    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))

    // Verify signature
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(META_APP_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expectedSig)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

    if (encodedSig !== expectedB64) {
      console.error('Invalid signed_request signature')
      return new Response('OK')
    }

    const userId = data.user_id
    console.log(`Meta deauth for user_id: ${userId}`)

    // No direct link between FB user_id and our users, but log it
    // Future: store fb_user_id on whatsapp_accounts for lookup

    return new Response('OK')
  } catch (err) {
    console.error('Deauth webhook error:', err)
    return new Response('OK')
  }
})
