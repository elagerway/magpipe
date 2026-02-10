import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

// Pricing rates
const VOICE_RATE = 0.15   // Single blended per-minute rate (covers TTS, STT, LLM, telephony, LiveKit)
const SMS_RATE = 0.013    // Per message

// Add-on rates
const ADDON_RATES = {
  knowledge_base: 0.005,  // per minute - KB-augmented call surcharge
  batch_call: 0.005,      // per dial attempt
  branded_call: 0.10,     // per outbound call with branded caller ID
  denoising: 0.005,       // per minute - advanced noise removal
  pii_removal: 0.01,      // per minute - PII scrubbing from transcripts
}

// Monthly fee rates
const MONTHLY_RATES = {
  phone_number: 2.00,     // per phone number per month
  concurrency_slot: 5.00, // per additional concurrency slot per month
  extra_knowledge_base: 5.00, // per additional KB beyond included 7
}

// Vendor costs (what we actually pay) - used by admin KPI analytics
// Updated 2026-02-09 from actual vendor rate cards
export const VENDOR_COSTS = {
  tts: {
    elevenlabs: 0.22,    // per minute - Creator plan $22/mo ÷ ~100 min included
    openai: 0.015,       // per minute - tts-1 standard
  },
  stt: {
    deepgram: 0.0043,    // per minute - Nova-2 pay-as-you-go
  },
  telephony: {
    signalwire: 0.007,   // per minute - blended local inbound $0.0066 / outbound $0.008
    sipBridge: 0,         // no separate per-call fee, included in per-minute
  },
  livekit: 0.014,        // per minute - agent session + SIP + WebRTC combined
  llm: {
    'gpt-4o': 0.002,          // ~300 tokens/min at $2.50/$10 per 1M tokens
    'gpt-4o-mini': 0.0001,    // ~300 tokens/min at $0.15/$0.60 per 1M tokens
    'gpt-4.1': 0.0015,        // ~300 tokens/min at $2.00/$8.00 per 1M tokens
    'gpt-4.1-mini': 0.0003,   // ~300 tokens/min at $0.40/$1.60 per 1M tokens
    'gpt-5': 0.0017,          // ~300 tokens/min at $1.25/$10.00 per 1M tokens
    'gpt-5-mini': 0.0003,     // ~300 tokens/min at $0.25/$2.00 per 1M tokens
    'gpt-5-nano': 0.0001,     // ~300 tokens/min at $0.05/$0.40 per 1M tokens
    'claude-3.5-sonnet': 0.003, // ~300 tokens/min at $3.00/$15.00 per 1M tokens
    'claude-3-haiku': 0.0002, // ~300 tokens/min at $0.25/$1.25 per 1M tokens
    'default': 0.0001,
  },
  sms: {
    outbound: 0.008,     // per message - base $0.00415 + avg carrier surcharge ~$0.004
    inbound: 0.005,      // per message - base $0.00415 + avg carrier surcharge ~$0.001
  },
}

interface DeductRequest {
  userId: string
  type: 'voice' | 'sms' | 'addon' | 'monthly_fee'
  // For voice calls
  durationSeconds?: number
  voiceId?: string
  aiModel?: string
  // For SMS
  messageCount?: number
  // For add-ons
  addonType?: string      // 'knowledge_base' | 'batch_call' | 'branded_call' | 'denoising' | 'pii_removal'
  quantity?: number        // minutes for per-min addons, count for per-unit addons
  // For monthly fees
  feeType?: string        // 'phone_number' | 'concurrency_slot' | 'extra_knowledge_base'
  feeQuantity?: number    // number of items
  // Reference info
  referenceType?: string  // 'call', 'sms', 'addon', 'monthly_fee'
  referenceId?: string    // call_record.id, sms_message.id, service_number.id
}

/**
 * Calculate the cost for a voice call - single blended per-minute rate
 */
function calculateVoiceCost(durationSeconds: number, voiceId?: string, aiModel?: string): {
  totalCost: number
  breakdown: {
    rate: number
    minutes: number
    voiceId?: string
    aiModel?: string
  }
} {
  const minutes = durationSeconds / 60
  const totalCost = minutes * VOICE_RATE

  return {
    totalCost: Math.round(totalCost * 10000) / 10000,
    breakdown: {
      rate: VOICE_RATE,
      minutes: Math.round(minutes * 100) / 100,
      voiceId,
      aiModel,
    }
  }
}

/**
 * Calculate the cost for SMS messages
 */
function calculateSmsCost(messageCount: number): {
  totalCost: number
  breakdown: {
    messageCount: number
    ratePerMessage: number
  }
} {
  const totalCost = messageCount * SMS_RATE

  return {
    totalCost: Math.round(totalCost * 10000) / 10000,
    breakdown: {
      messageCount,
      ratePerMessage: SMS_RATE
    }
  }
}

/**
 * Trigger auto-recharge if enabled and balance is low
 */
async function triggerAutoRecharge(
  supabase: any,
  stripe: Stripe,
  userId: string,
  currentBalance: number
): Promise<{ success: boolean; error?: string; amountCharged?: number }> {
  // Get user's auto-recharge settings and payment info
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('stripe_customer_id, auto_recharge_enabled, auto_recharge_amount, auto_recharge_threshold, has_payment_method')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    return { success: false, error: 'User not found' }
  }

  // Check if auto-recharge should be triggered
  if (!user.auto_recharge_enabled || !user.has_payment_method || !user.stripe_customer_id) {
    return { success: false, error: 'Auto-recharge not enabled or no payment method' }
  }

  if (currentBalance > user.auto_recharge_threshold) {
    return { success: false, error: 'Balance above threshold' }
  }

  try {
    // Get the default payment method
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripe_customer_id,
      type: 'card',
      limit: 1
    })

    if (paymentMethods.data.length === 0) {
      // Update user to indicate no payment method
      await supabase
        .from('users')
        .update({ has_payment_method: false, auto_recharge_enabled: false })
        .eq('id', userId)

      return { success: false, error: 'No payment method found' }
    }

    const paymentMethodId = paymentMethods.data[0].id
    const rechargeAmount = user.auto_recharge_amount || 50

    // Create a payment intent and confirm it immediately
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(rechargeAmount * 100), // Convert to cents
      currency: 'usd',
      customer: user.stripe_customer_id,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: `Auto-recharge: Add $${rechargeAmount} credits`,
      metadata: {
        supabase_user_id: userId,
        transaction_type: 'auto_recharge',
        credit_amount: rechargeAmount.toString()
      }
    })

    if (paymentIntent.status === 'succeeded') {
      // Add credits using the database function
      const { data: result, error: addError } = await supabase.rpc('add_credits', {
        p_user_id: userId,
        p_amount: rechargeAmount,
        p_transaction_type: 'auto_recharge',
        p_description: `Auto-recharge: Added $${rechargeAmount} credits`,
        p_reference_type: 'stripe_payment',
        p_reference_id: paymentIntent.id,
        p_metadata: {
          triggered_at_balance: currentBalance,
          threshold: user.auto_recharge_threshold
        }
      })

      if (addError) {
        console.error('Failed to add credits after auto-recharge:', addError)
        return { success: false, error: 'Payment succeeded but failed to add credits' }
      }

      console.log(`Auto-recharge successful for user ${userId}: $${rechargeAmount}, new balance: $${result?.balance_after}`)
      return { success: true, amountCharged: rechargeAmount }
    } else {
      return { success: false, error: `Payment status: ${paymentIntent.status}` }
    }
  } catch (error: any) {
    console.error('Auto-recharge failed:', error)

    // If payment fails, disable auto-recharge to prevent repeated failures
    if (error.code === 'card_declined' || error.code === 'insufficient_funds') {
      await supabase
        .from('users')
        .update({ auto_recharge_enabled: false })
        .eq('id', userId)

      console.log(`Disabled auto-recharge for user ${userId} due to payment failure`)
    }

    return { success: false, error: error.message }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Initialize Stripe (for auto-recharge)
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    let stripe: Stripe | null = null
    if (stripeKey) {
      stripe = new Stripe(stripeKey, {
        apiVersion: '2023-10-16',
        httpClient: Stripe.createFetchHttpClient()
      })
    }

    // Parse request body
    const body: DeductRequest = await req.json()
    const { userId, type, durationSeconds, voiceId, aiModel, messageCount, addonType, quantity, feeType, feeQuantity, referenceType, referenceId } = body

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let cost: number
    let description: string
    let metadata: Record<string, any>

    if (type === 'voice') {
      if (!durationSeconds || durationSeconds <= 0) {
        return new Response(JSON.stringify({ error: 'durationSeconds is required for voice type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { totalCost, breakdown } = calculateVoiceCost(durationSeconds, voiceId, aiModel)
      cost = totalCost
      description = `Voice call - ${breakdown.minutes.toFixed(2)} minutes`
      metadata = {
        type: 'voice',
        durationSeconds,
        voiceId,
        aiModel,
        ...breakdown
      }
    } else if (type === 'sms') {
      const count = messageCount || 1
      const { totalCost, breakdown } = calculateSmsCost(count)
      cost = totalCost
      description = `SMS - ${count} message${count > 1 ? 's' : ''}`
      metadata = {
        type: 'sms',
        ...breakdown
      }
    } else if (type === 'addon') {
      if (!addonType || !(addonType in ADDON_RATES)) {
        return new Response(JSON.stringify({ error: `Invalid addonType. Must be one of: ${Object.keys(ADDON_RATES).join(', ')}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const qty = quantity || 1
      const rate = ADDON_RATES[addonType as keyof typeof ADDON_RATES]
      cost = Math.round(qty * rate * 10000) / 10000
      const unit = ['knowledge_base', 'denoising', 'pii_removal'].includes(addonType) ? 'minutes' : 'units'
      description = `Add-on: ${addonType.replace(/_/g, ' ')} - ${qty} ${unit}`
      metadata = {
        type: 'addon',
        addonType,
        quantity: qty,
        rate,
      }

    } else if (type === 'monthly_fee') {
      if (!feeType || !(feeType in MONTHLY_RATES)) {
        return new Response(JSON.stringify({ error: `Invalid feeType. Must be one of: ${Object.keys(MONTHLY_RATES).join(', ')}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const qty = feeQuantity || 1
      const rate = MONTHLY_RATES[feeType as keyof typeof MONTHLY_RATES]
      cost = Math.round(qty * rate * 100) / 100
      description = `Monthly fee: ${feeType.replace(/_/g, ' ')} x${qty}`
      metadata = {
        type: 'monthly_fee',
        feeType,
        quantity: qty,
        rate,
      }

    } else {
      return new Response(JSON.stringify({ error: 'Invalid type. Must be "voice", "sms", "addon", or "monthly_fee"' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Deduct credits using the database function
    const { data: result, error: deductError } = await supabase.rpc('deduct_credits', {
      p_user_id: userId,
      p_amount: cost,
      p_description: description,
      p_reference_type: referenceType || type,
      p_reference_id: referenceId,
      p_metadata: metadata
    })

    if (deductError) {
      console.error('Failed to deduct credits:', deductError)
      return new Response(JSON.stringify({ error: 'Failed to deduct credits', details: deductError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if auto-recharge is needed
    let autoRechargeResult = null
    if (result?.needs_recharge && stripe) {
      autoRechargeResult = await triggerAutoRecharge(supabase, stripe, userId, result.balance_after)
    }

    return new Response(JSON.stringify({
      success: result?.success ?? true,
      cost,
      description,
      balanceBefore: result?.balance_before,
      balanceAfter: result?.balance_after,
      transactionId: result?.transaction_id,
      autoRecharge: autoRechargeResult
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('Error in deduct-credits:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
