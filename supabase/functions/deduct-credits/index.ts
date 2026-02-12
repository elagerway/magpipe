import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

// Pricing rates (per minute for voice, per message for SMS)
const VOICE_RATES = {
  elevenlabs: 0.07,  // 11labs-* voices
  openai: 0.08,      // openai-* voices
  default: 0.07      // legacy voices default to ElevenLabs rate
}

const LLM_RATES: Record<string, number> = {
  'gpt-4o': 0.05,
  'gpt-4o-mini': 0.006,
  'gpt-4.1': 0.045,
  'gpt-4.1-mini': 0.016,
  'gpt-5': 0.04,
  'gpt-5-mini': 0.012,
  'gpt-5-nano': 0.003,
  'claude-3.5-sonnet': 0.05,
  'claude-3-haiku': 0.006,
  'default': 0.006
}

const TELEPHONY_RATE = 0.015  // Per minute
const SMS_RATE = 0.01         // Per message
const SMS_AI_RATE = 0.005     // Per AI-generated SMS reply

// Per-minute add-on surcharges (when feature is enabled on the agent)
const ADDON_RATES: Record<string, number> = {
  knowledge_base: 0.005,       // Agent has knowledge sources
  memory: 0.005,               // memory_enabled
  semantic_memory: 0.005,      // semantic_memory_enabled
  advanced_denoising: 0.005,   // Future
  pii_removal: 0.01,           // Future
}

// Flat per-call fees
const BRANDED_CALL_FEE = 0.10  // Per outbound call with branded caller ID
const BATCH_CALL_FEE = 0.005   // Per batch/campaign dial

interface DeductRequest {
  userId: string
  type: 'voice' | 'sms'
  // For voice calls
  durationSeconds?: number
  voiceId?: string
  aiModel?: string
  addons?: string[]          // e.g. ['knowledge_base', 'memory', 'semantic_memory']
  brandedCall?: boolean      // Outbound call with branded caller ID (CNAM)
  batchCall?: boolean        // Batch/campaign dial
  // For SMS
  messageCount?: number
  aiGenerated?: boolean      // AI-generated SMS reply surcharge
  // Reference info
  referenceType?: string  // 'call' or 'sms'
  referenceId?: string    // call_record.id or sms_message.id
}

/**
 * Calculate the cost for a voice call
 */
function calculateVoiceCost(
  durationSeconds: number,
  voiceId?: string,
  aiModel?: string,
  addons?: string[],
  brandedCall?: boolean,
  batchCall?: boolean
): {
  totalCost: number
  breakdown: {
    voiceCost: number
    llmCost: number
    telephonyCost: number
    addonCost: number
    flatFees: number
    minutes: number
    addons?: string[]
  }
} {
  const minutes = durationSeconds / 60

  // Determine voice rate based on voice_id
  let voiceRate = VOICE_RATES.default
  if (voiceId?.startsWith('openai-')) {
    voiceRate = VOICE_RATES.openai
  } else if (voiceId?.startsWith('11labs-') || voiceId) {
    voiceRate = VOICE_RATES.elevenlabs
  }

  // Determine LLM rate based on ai_model
  let llmRate = LLM_RATES.default
  if (aiModel && LLM_RATES[aiModel]) {
    llmRate = LLM_RATES[aiModel]
  }

  // Calculate add-on surcharges (per minute)
  let totalAddonRate = 0
  if (addons && addons.length > 0) {
    for (const addon of addons) {
      if (ADDON_RATES[addon]) {
        totalAddonRate += ADDON_RATES[addon]
      }
    }
  }

  // Calculate flat per-call fees
  let flatFees = 0
  if (brandedCall) flatFees += BRANDED_CALL_FEE
  if (batchCall) flatFees += BATCH_CALL_FEE

  const voiceCost = minutes * voiceRate
  const llmCost = minutes * llmRate
  const telephonyCost = minutes * TELEPHONY_RATE
  const addonCost = minutes * totalAddonRate
  const totalCost = voiceCost + llmCost + telephonyCost + addonCost + flatFees

  return {
    totalCost: Math.round(totalCost * 10000) / 10000,
    breakdown: {
      voiceCost: Math.round(voiceCost * 10000) / 10000,
      llmCost: Math.round(llmCost * 10000) / 10000,
      telephonyCost: Math.round(telephonyCost * 10000) / 10000,
      addonCost: Math.round(addonCost * 10000) / 10000,
      flatFees: Math.round(flatFees * 10000) / 10000,
      minutes: Math.round(minutes * 100) / 100,
      ...(addons && addons.length > 0 ? { addons } : {})
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
    const { userId, type, durationSeconds, voiceId, aiModel, addons, brandedCall, batchCall, messageCount, aiGenerated, referenceType, referenceId } = body

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

      const { totalCost, breakdown } = calculateVoiceCost(durationSeconds, voiceId, aiModel, addons, brandedCall, batchCall)
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
      let smsCost = totalCost
      const smsMetadata: Record<string, any> = {
        type: 'sms',
        ...breakdown
      }

      // Add AI surcharge for AI-generated SMS replies
      if (aiGenerated) {
        const aiSurcharge = Math.round(count * SMS_AI_RATE * 10000) / 10000
        smsCost = Math.round((smsCost + aiSurcharge) * 10000) / 10000
        smsMetadata.aiGenerated = true
        smsMetadata.aiSurcharge = aiSurcharge
      }

      cost = smsCost
      description = `SMS - ${count} message${count > 1 ? 's' : ''}${aiGenerated ? ' (AI reply)' : ''}`
      metadata = smsMetadata
    } else {
      return new Response(JSON.stringify({ error: 'Invalid type. Must be "voice" or "sms"' }), {
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
