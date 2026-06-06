/**
 * Edge Function: signup-with-captcha
 * Verifies Turnstile token and creates user atomically.
 * This prevents bots from bypassing CAPTCHA by calling Supabase Auth directly.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyTurnstile } from '../_shared/turnstile.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const { email, password, name, turnstileToken } = await req.json()

    if (!email || !password || !name) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: corsHeaders,
      })
    }

    // Verify Turnstile CAPTCHA first
    const turnstileValid = await verifyTurnstile(turnstileToken)
    if (!turnstileValid) {
      return new Response(JSON.stringify({ error: 'CAPTCHA verification failed. Please try again.' }), {
        status: 403, headers: corsHeaders,
      })
    }

    // Create user via Supabase Admin Auth (service role)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    })

    if (error) {
      // Map common auth errors to user-friendly messages
      const msg = error.message?.includes('already been registered')
        ? 'An account with this email already exists.'
        : error.message || 'Failed to create account.'
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: corsHeaders,
      })
    }

    console.log('User created with CAPTCHA verification:', data.user?.id)

    return new Response(JSON.stringify({
      success: true,
      user: { id: data.user?.id, email: data.user?.email },
    }), {
      status: 200, headers: corsHeaders,
    })
  } catch (error) {
    console.error('signup-with-captcha error:', error)
    return new Response(JSON.stringify({ error: 'Signup failed. Please try again.' }), {
      status: 500, headers: corsHeaders,
    })
  }
})
