import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14.10.0'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

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
const EMAIL_RATE = 0.01       // Per email message

// Per-minute add-on surcharges (when feature is enabled on the agent)
const ADDON_RATES: Record<string, number> = {
  knowledge_base: 0.005,       // Agent has knowledge sources
  memory: 0.005,               // memory_enabled
  semantic_memory: 0.005,      // semantic_memory_enabled
  priority_sequencing: 0.10,   // OpenAI priority processing tier
  advanced_denoising: 0.005,   // Future
  pii_removal: 0.01,           // Future
}

// Flat per-call fees
const BRANDED_CALL_FEE = 0.10  // Per outbound call with branded caller ID
const BATCH_CALL_FEE = 0.005   // Per batch/campaign dial

interface DeductRequest {
  userId: string
  type: 'voice' | 'sms' | 'email'
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

/**
 * Send low balance notification via email (Postmark) and SMS (SignalWire)
 * Fired once when balance drops to/below $1
 */
async function sendLowBalanceNotification(
  supabase: any,
  userId: string,
  balance: number
): Promise<void> {
  // Get user's email and phone
  const { data: user, error } = await supabase
    .from('users')
    .select('email, phone_number, name')
    .eq('id', userId)
    .single()

  if (error || !user?.email) {
    console.error('Cannot send low balance notification - user not found:', error)
    return
  }

  const balanceStr = `$${balance.toFixed(2)}`
  const firstName = user.name?.split(' ')[0] || 'there'

  // Send email via Postmark
  const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')
  if (postmarkApiKey) {
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
        <div style="text-align: center; margin-bottom: 2rem;">
          <h1 style="color: #1a1a1a; font-size: 1.5rem; margin: 0;">You've hit a milestone at Magpipe!</h1>
        </div>

        <p style="color: #4a4a4a; font-size: 1rem; line-height: 1.6;">
          Hey ${firstName}, you've been putting your AI agent to work! Your balance is now <strong>${balanceStr}</strong>.
        </p>

        <p style="color: #4a4a4a; font-size: 1rem; line-height: 1.6;">
          Here's how you can earn up to <strong>$30 in bonus credits</strong>:
        </p>

        <div style="display: flex; flex-direction: column; gap: 1rem; margin: 1.5rem 0;">
          <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.25rem; background: #f9fafb;">
            <div style="font-weight: 600; color: #1a1a1a; margin-bottom: 0.25rem;">1. Add a credit card &mdash; +$10</div>
            <div style="color: #6b7280; font-size: 0.875rem;">Add a payment method and claim your $10 bonus.</div>
          </div>
          <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.25rem; background: #f9fafb;">
            <div style="font-weight: 600; color: #1a1a1a; margin-bottom: 0.25rem;">2. Enable auto-recharge &mdash; +$10</div>
            <div style="color: #6b7280; font-size: 0.875rem;">Never run out of credits. Turn on auto-recharge and claim $10.</div>
          </div>
          <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.25rem; background: #f9fafb;">
            <div style="font-weight: 600; color: #1a1a1a; margin-bottom: 0.25rem;">3. Invite a friend &mdash; +$10 each</div>
            <div style="color: #6b7280; font-size: 0.875rem;">Share your referral link. You both get $10 after they make 5 minutes of calls.</div>
          </div>
        </div>

        <div style="text-align: center; margin: 2rem 0;">
          <a href="https://magpipe.ai/settings?tab=billing" style="display: inline-block; background: #6366f1; color: white; padding: 0.75rem 2rem; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 1rem;">
            Add Credits
          </a>
        </div>

        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center; margin-top: 2rem; border-top: 1px solid #e5e7eb; padding-top: 1rem;">
          You're receiving this because your Magpipe balance is low.
        </p>
      </div>
    `

    const textBody = `Hey ${firstName}, you've been putting your AI agent to work! Your balance is now ${balanceStr}.\n\nEarn up to $30 in bonus credits:\n1. Add a credit card — +$10\n2. Enable auto-recharge — +$10\n3. Invite a friend — +$10 each\n\nAdd credits: https://magpipe.ai/settings?tab=billing`

    try {
      await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': postmarkApiKey
        },
        body: JSON.stringify({
          From: Deno.env.get('NOTIFICATION_EMAIL') || 'notifications@snapsonic.com',
          To: user.email,
          Subject: "You've hit a milestone at Magpipe!",
          HtmlBody: htmlBody,
          TextBody: textBody,
          MessageStream: 'outbound'
        })
      })
      console.log(`Low balance email sent to ${user.email}`)
    } catch (err) {
      console.error('Failed to send low balance email:', err)
    }
  }

  // Send SMS via SignalWire (if user has a phone number)
  if (user.phone_number) {
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
    const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')

    if (signalwireProjectId && signalwireToken && signalwireSpaceUrl) {
      const smsBody = `MAGPIPE: Your balance is ${balanceStr}. Earn up to $30 in bonus credits! Add a card (+$10), enable auto-recharge (+$10), or invite a friend (+$10 each). magpipe.ai/settings`

      try {
        const signalwireAuth = btoa(`${signalwireProjectId}:${signalwireToken}`)
        // Use a service number to send from
        const { data: serviceNum } = await supabase
          .from('service_numbers')
          .select('phone_number')
          .eq('user_id', userId)
          .eq('is_active', true)
          .eq('sms_enabled', true)
          .limit(1)
          .single()

        if (serviceNum?.phone_number) {
          await fetch(
            `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${signalwireAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                From: serviceNum.phone_number,
                To: user.phone_number,
                Body: smsBody
              }).toString()
            }
          )
          console.log(`Low balance SMS sent to ${user.phone_number}`)
        }
      } catch (err) {
        console.error('Failed to send low balance SMS:', err)
      }
    }
  }
}

/**
 * Track referred user's call minutes toward the 5-minute referral threshold
 * Awards $10 to both referrer and referred user when threshold is met
 */
async function trackReferralMinutes(
  supabase: any,
  userId: string,
  durationSeconds: number
): Promise<void> {
  // Check if this user has a pending referral reward
  const { data: reward, error } = await supabase
    .from('referral_rewards')
    .select('id, referrer_id, referred_call_minutes')
    .eq('referred_id', userId)
    .eq('threshold_met', false)
    .single()

  if (error || !reward) return // No pending referral

  const newMinutes = parseFloat(reward.referred_call_minutes) + (durationSeconds / 60)

  if (newMinutes >= 5) {
    // Threshold met! Award bonuses
    console.log(`Referral threshold met for user ${userId} (${newMinutes.toFixed(2)} min). Awarding bonuses.`)

    // Update referral record
    await supabase
      .from('referral_rewards')
      .update({
        referred_call_minutes: newMinutes,
        threshold_met: true,
        completed_at: new Date().toISOString(),
        referrer_bonus_paid: true,
        referred_bonus_paid: true,
      })
      .eq('id', reward.id)

    // Award $10 to referrer
    await supabase.rpc('add_credits', {
      p_user_id: reward.referrer_id,
      p_amount: 10.00,
      p_transaction_type: 'bonus',
      p_description: 'Referral bonus: +$10 for referring a friend',
      p_reference_type: 'referral',
      p_reference_id: reward.id,
    })

    // Award $10 to referred user
    await supabase.rpc('add_credits', {
      p_user_id: userId,
      p_amount: 10.00,
      p_transaction_type: 'bonus',
      p_description: 'Referral bonus: +$10 welcome reward',
      p_reference_type: 'referral',
      p_reference_id: reward.id,
    })

    console.log(`Referral bonuses paid: $10 to referrer ${reward.referrer_id}, $10 to referred ${userId}`)
  } else {
    // Just update the minutes
    await supabase
      .from('referral_rewards')
      .update({ referred_call_minutes: newMinutes })
      .eq('id', reward.id)
  }
}

Deno.serve(async (req) => {
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
    } else if (type === 'email') {
      const count = messageCount || 1
      cost = Math.round(count * EMAIL_RATE * 10000) / 10000
      description = `Email - ${count} message${count > 1 ? 's' : ''}`
      metadata = { type: 'email', count, rate: EMAIL_RATE }
    } else {
      return new Response(JSON.stringify({ error: 'Invalid type. Must be "voice", "sms", or "email"' }), {
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

    // Send low balance notification (fire and forget, one-time)
    if (result?.trigger_low_balance_notification) {
      sendLowBalanceNotification(supabase, userId, result.balance_after)
        .catch(err => console.error('Failed to send low balance notification:', err))
    }

    // Track referral call minutes (fire and forget, voice calls only)
    if (type === 'voice' && durationSeconds) {
      trackReferralMinutes(supabase, userId, durationSeconds)
        .catch(err => console.error('Failed to track referral minutes:', err))
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
