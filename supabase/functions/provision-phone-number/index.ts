import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phoneNumber } = await req.json()

    if (!phoneNumber) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get SignalWire credentials
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
    const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')

    if (!signalwireProjectId || !signalwireToken || !signalwireSpaceUrl) {
      return new Response(
        JSON.stringify({ error: 'SignalWire configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get authenticated user
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

    // Check plan limits for phone numbers
    const { data: phoneNumberCheck } = await supabase.rpc('check_phone_number_limit', {
      p_user_id: user.id
    })

    if (phoneNumberCheck && !phoneNumberCheck.can_add_more) {
      return new Response(
        JSON.stringify({
          error: 'Phone number limit reached',
          message: `Your ${phoneNumberCheck.plan} plan allows ${phoneNumberCheck.limit} phone number(s). Please upgrade to Pro for unlimited numbers.`,
          current: phoneNumberCheck.current_count,
          limit: phoneNumberCheck.limit
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Provisioning number:', phoneNumber, 'for user:', user.id)

    const webhookBaseUrl = `${supabaseUrl}/functions/v1`

    // Step 1: Purchase the phone number from SignalWire with webhooks configured
    const purchaseUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/IncomingPhoneNumbers.json`

    const purchaseBody = new URLSearchParams({
      PhoneNumber: phoneNumber,
      VoiceUrl: `${webhookBaseUrl}/webhook-inbound-call`,
      VoiceMethod: 'POST',
      StatusCallback: `${webhookBaseUrl}/webhook-call-status`,
      StatusCallbackMethod: 'POST',
      SmsUrl: `${webhookBaseUrl}/webhook-inbound-sms`,
      SmsMethod: 'POST',
      FriendlyName: `Magpipe - ${user.email}`,
    })

    console.log('Purchasing number from SignalWire...')

    const purchaseResponse = await fetch(purchaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
      },
      body: purchaseBody.toString(),
    })

    if (!purchaseResponse.ok) {
      const errorText = await purchaseResponse.text()
      console.error('SignalWire purchase error:', errorText)

      let errorMessage = 'Failed to purchase phone number from SignalWire'
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.message || errorJson.error || errorMessage
      } catch (e) {
        // Use default error message
      }

      return new Response(
        JSON.stringify({ error: errorMessage, details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const purchaseResult = await purchaseResponse.json()
    console.log('Number purchased successfully:', purchaseResult)

    const phoneSid = purchaseResult.sid

    // Normalize capabilities to lowercase (SignalWire uses uppercase)
    const capabilities = purchaseResult.capabilities || {}
    const normalizedCapabilities = {
      voice: capabilities.voice === true || capabilities.Voice === true,
      sms: capabilities.sms === true || capabilities.SMS === true,
      mms: capabilities.mms === true || capabilities.MMS === true,
    }

    // Step 2: If this is a US number (not Canadian), add it to the SMS campaign
    let campaignRegistered = false
    const { isUSNumber } = await import('../_shared/sms-compliance.ts')
    const isUS = await isUSNumber(phoneNumber, supabase)

    if (isUS) {
      const campaignId = Deno.env.get('SIGNALWIRE_SMS_CAMPAIGN_ID')

      if (campaignId) {
        console.log('Registering US number with SMS campaign:', campaignId)

        const campaignUrl = `https://${signalwireSpaceUrl}/api/relay/rest/registry/beta/campaigns/${campaignId}/orders`

        const campaignBody = JSON.stringify({
          phone_numbers: [phoneNumber],
          status_callback_url: `${webhookBaseUrl}/webhook-campaign-status`
        })

        const campaignResponse = await fetch(campaignUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
          },
          body: campaignBody,
        })

        if (campaignResponse.ok) {
          console.log('✅ Number registered with SMS campaign successfully')
          campaignRegistered = true
        } else {
          const errorText = await campaignResponse.text()
          console.error('⚠️ Failed to register number with SMS campaign:', errorText)
          // Don't fail the entire provisioning - just log the error
        }
      } else {
        console.warn('⚠️ US number purchased but SIGNALWIRE_SMS_CAMPAIGN_ID not configured')
      }
    }

    // System agent for unassigned numbers (fixed UUID)
    const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002'

    // Step 3: Save the service number to service_numbers table
    const { error: insertError } = await supabase
      .from('service_numbers')
      .insert({
        user_id: user.id,
        phone_number: phoneNumber,
        phone_sid: phoneSid,
        friendly_name: `Magpipe - ${user.email}`,
        is_active: true, // Active by default - routes to system agent until user assigns their own
        agent_id: SYSTEM_AGENT_ID, // Default to system agent - user can assign their own
        capabilities: normalizedCapabilities,
      })

    if (insertError) {
      console.error('Error saving service number:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to save service number to database' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 4: If this is a Canadian number, auto-provision a US number for SMS to US contacts
    let usNumberProvisioned = null
    if (!isUS) {
      console.log('Canadian number detected - auto-provisioning US number for SMS to US contacts')

      try {
        // Search for any available US number
        const searchUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/AvailablePhoneNumbers/US/Local.json?SmsEnabled=true&VoiceEnabled=true`

        const searchResponse = await fetch(searchUrl, {
          headers: {
            'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
          },
        })

        if (searchResponse.ok) {
          const searchResult = await searchResponse.json()
          const availableNumbers = searchResult.available_phone_numbers || []

          if (availableNumbers.length > 0) {
            const usNumber = availableNumbers[0].phone_number
            console.log('Found available US number:', usNumber)

            // Purchase the US number
            const usPurchaseBody = new URLSearchParams({
              PhoneNumber: usNumber,
              VoiceUrl: `${webhookBaseUrl}/webhook-inbound-call`,
              VoiceMethod: 'POST',
              StatusCallback: `${webhookBaseUrl}/webhook-call-status`,
              StatusCallbackMethod: 'POST',
              SmsUrl: `${webhookBaseUrl}/webhook-inbound-sms`,
              SmsMethod: 'POST',
              FriendlyName: `Magpipe - ${user.email} (Auto US Relay)`,
            })

            const usPurchaseResponse = await fetch(purchaseUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
              },
              body: usPurchaseBody.toString(),
            })

            if (usPurchaseResponse.ok) {
              const usPurchaseResult = await usPurchaseResponse.json()
              const usPhoneSid = usPurchaseResult.sid

              // Normalize capabilities
              const usCapabilities = usPurchaseResult.capabilities || {}
              const usNormalizedCapabilities = {
                voice: usCapabilities.voice === true || usCapabilities.Voice === true,
                sms: usCapabilities.sms === true || usCapabilities.SMS === true,
                mms: usCapabilities.mms === true || usCapabilities.MMS === true,
              }

              // Register with SMS campaign (it's a US number)
              const campaignId = Deno.env.get('SIGNALWIRE_SMS_CAMPAIGN_ID')
              let usCampaignRegistered = false

              if (campaignId) {
                const campaignUrl = `https://${signalwireSpaceUrl}/api/relay/rest/registry/beta/campaigns/${campaignId}/orders`
                const campaignBody = JSON.stringify({
                  phone_numbers: [usNumber],
                  status_callback_url: `${webhookBaseUrl}/webhook-campaign-status`
                })

                const campaignResponse = await fetch(campaignUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
                  },
                  body: campaignBody,
                })

                if (campaignResponse.ok) {
                  console.log('✅ Auto-provisioned US number registered with SMS campaign')
                  usCampaignRegistered = true
                }
              }

              // Save US number to database
              await supabase
                .from('service_numbers')
                .insert({
                  user_id: user.id,
                  phone_number: usNumber,
                  phone_sid: usPhoneSid,
                  friendly_name: `Magpipe - ${user.email} (Auto US Relay)`,
                  is_active: true, // Auto-activate for seamless SMS to US contacts
                  capabilities: usNormalizedCapabilities,
                })

              usNumberProvisioned = usNumber
              console.log('✅ Auto-provisioned US number:', usNumber)
            }
          }
        }
      } catch (usError) {
        console.error('⚠️ Failed to auto-provision US number:', usError)
        // Don't fail the entire provisioning - Canadian number still works
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        phoneNumber,
        phoneSid,
        campaignRegistered,
        usNumberProvisioned, // Include auto-provisioned US number if any
        message: usNumberProvisioned
          ? `Canadian number provisioned successfully. US number ${usNumberProvisioned} also provisioned for SMS to US contacts.`
          : campaignRegistered
          ? 'Phone number purchased, configured, and registered with SMS campaign successfully'
          : 'Phone number purchased and configured successfully',
        webhooks: {
          voice: `${webhookBaseUrl}/webhook-inbound-call`,
          voiceStatus: `${webhookBaseUrl}/webhook-call-status`,
          sms: `${webhookBaseUrl}/webhook-inbound-sms`,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in provision-phone-number:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})