/**
 * Redeem Coupon
 * User submits a coupon code; validates and grants credits via redeem_coupon() RPC.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { handleCors } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const user = await resolveUser(req, supabaseClient)
    if (!user) {
      return errorResponse('Unauthorized', 401)
    }

    const { code } = await req.json()
    if (!code || typeof code !== 'string' || !code.trim()) {
      return errorResponse('Missing coupon code', 400)
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await serviceClient.rpc('redeem_coupon', {
      p_user_id: user.id,
      p_code: code.trim(),
    })

    if (error) {
      console.error('redeem_coupon RPC error:', error)
      return errorResponse('Failed to redeem coupon', 500)
    }

    if (!data?.success) {
      // Pass the machine-readable code through (e.g. payment_method_required) so the
      // client can react (nudge to add a card) rather than just showing the message
      return jsonResponse({ error: data?.error || 'Could not redeem coupon', code: data?.code }, 400)
    }

    console.log(`Coupon redeemed: user=${user.id} code=${code.trim().toUpperCase()} amount=${data.amount}`)

    return jsonResponse({ success: true, amount: data.amount, balance_after: data.balance_after })
  } catch (error: any) {
    console.error('Error in redeem-coupon:', error)
    return errorResponse(error.message, 500)
  }
})
