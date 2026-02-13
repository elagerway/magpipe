import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const MAX_ACTIONS_PER_RUN = 50
const MAX_RETRIES = 3

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // SignalWire credentials for sending SMS
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

    console.log('Processing scheduled actions...')

    // Get pending actions that are due
    const now = new Date().toISOString()
    const { data: pendingActions, error: fetchError } = await supabase
      .from('scheduled_actions')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .lt('retry_count', MAX_RETRIES)
      .order('scheduled_at', { ascending: true })
      .limit(MAX_ACTIONS_PER_RUN)

    if (fetchError) {
      console.error('Error fetching scheduled actions:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch actions', details: fetchError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!pendingActions || pendingActions.length === 0) {
      console.log('No scheduled actions to process')
      return new Response(
        JSON.stringify({ message: 'No scheduled actions to process', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${pendingActions.length} scheduled actions to process`)

    const results = []

    for (const action of pendingActions) {
      console.log(`Processing action ${action.id}: ${action.action_type}`)

      // Mark as processing
      await supabase
        .from('scheduled_actions')
        .update({ status: 'processing' })
        .eq('id', action.id)

      try {
        if (action.action_type === 'send_sms') {
          await processSendSms(action, supabase, {
            signalwireProjectId,
            signalwireApiToken,
            signalwireSpaceUrl,
            supabaseUrl,
          })

          // Mark as completed
          await supabase
            .from('scheduled_actions')
            .update({
              status: 'completed',
              executed_at: new Date().toISOString(),
            })
            .eq('id', action.id)

          results.push({ id: action.id, success: true })
          console.log(`Action ${action.id} completed successfully`)

        } else {
          // Unknown action type
          throw new Error(`Unknown action type: ${action.action_type}`)
        }

      } catch (error) {
        console.error(`Error processing action ${action.id}:`, error)

        const newRetryCount = (action.retry_count || 0) + 1
        const shouldRetry = newRetryCount < MAX_RETRIES

        await supabase
          .from('scheduled_actions')
          .update({
            status: shouldRetry ? 'pending' : 'failed',
            error_message: error.message,
            retry_count: newRetryCount,
            // If retrying, push back 5 minutes
            ...(shouldRetry && {
              scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
            }),
          })
          .eq('id', action.id)

        results.push({
          id: action.id,
          success: false,
          error: error.message,
          willRetry: shouldRetry,
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failedCount = results.filter(r => !r.success).length

    return new Response(
      JSON.stringify({
        message: 'Scheduled actions processing complete',
        processed: pendingActions.length,
        succeeded: successCount,
        failed: failedCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in process-scheduled-actions:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Process a scheduled SMS action
 */
async function processSendSms(
  action: any,
  supabase: any,
  config: {
    signalwireProjectId: string
    signalwireApiToken: string
    signalwireSpaceUrl: string
    supabaseUrl: string
  }
) {
  const { parameters } = action
  const { recipient_phone, recipient_name, message, sender_number } = parameters

  if (!recipient_phone || !message) {
    throw new Error('Missing required parameters: recipient_phone and message')
  }

  // Get sender number - use provided or get user's default
  let fromNumber = sender_number
  if (!fromNumber) {
    const { data: serviceNumber } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', action.user_id)
      .limit(1)
      .single()

    if (!serviceNumber) {
      throw new Error('No service number available to send from')
    }
    fromNumber = serviceNumber.phone_number
  }

  // Check opt-out status
  const { data: optOut } = await supabase
    .from('sms_opt_outs')
    .select('id')
    .eq('phone_number', recipient_phone)
    .single()

  if (optOut) {
    throw new Error('Recipient has opted out of SMS messages')
  }

  // Send SMS via SignalWire
  const statusCallbackUrl = `${config.supabaseUrl}/functions/v1/webhook-sms-status`

  // Check if sending from US number for compliance
  const isUSNumber = fromNumber.startsWith('+1')
  const messageBody = isUSNumber ? `${message}\n\nSTOP to opt out` : message

  const smsData = new URLSearchParams({
    From: fromNumber,
    To: recipient_phone,
    Body: messageBody,
    StatusCallback: statusCallbackUrl,
  })

  const auth = btoa(`${config.signalwireProjectId}:${config.signalwireApiToken}`)
  const smsResponse = await fetch(
    `https://${config.signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${config.signalwireProjectId}/Messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: smsData.toString(),
    }
  )

  if (!smsResponse.ok) {
    const errorText = await smsResponse.text()
    throw new Error(`SignalWire SMS send failed: ${errorText}`)
  }

  const smsResult = await smsResponse.json()
  const messageSid = smsResult.sid

  // Log the outbound SMS
  await supabase
    .from('sms_messages')
    .insert({
      user_id: action.user_id,
      sender_number: fromNumber,
      recipient_number: recipient_phone,
      direction: 'outbound',
      content: message,
      status: 'pending',
      message_sid: messageSid,
      sent_at: new Date().toISOString(),
      is_ai_generated: false,
    })

  // Deduct credits for the scheduled SMS
  await deductSmsCredits(config.supabaseUrl, action.user_id, 1)

  console.log(`Scheduled SMS sent to ${recipient_phone} (SID: ${messageSid})`)
}

/**
 * Deduct credits for SMS messages
 */
async function deductSmsCredits(supabaseUrl: string, userId: string, messageCount: number) {
  try {
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const response = await fetch(`${supabaseUrl}/functions/v1/deduct-credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        userId,
        type: 'sms',
        messageCount,
        referenceType: 'sms'
      })
    })

    const result = await response.json()
    if (result.success) {
      console.log(`Deducted $${result.cost} for ${messageCount} scheduled SMS, balance: $${result.balanceAfter}`)
    } else {
      console.error('Failed to deduct SMS credits:', result.error)
    }
  } catch (error) {
    console.error('Error deducting SMS credits:', error)
  }
}
