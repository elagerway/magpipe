import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  requireAdmin,
  logAdminAction,
  handleCors,
  errorResponse,
  successResponse,
} from '../_shared/admin-auth.ts'
import { addNumberToSipTrunk } from '../_shared/livekit-sip.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    let adminUser
    try {
      adminUser = await requireAdmin(supabase, token)
    } catch (e) {
      return errorResponse(e.message, 403)
    }

    const body = await req.json()
    const { action } = body

    // ── List all SignalWire numbers + DB provisioning status ──────────────────
    if (action === 'list') {
      const swProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
      const swToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
      const swSpace = Deno.env.get('SIGNALWIRE_SPACE_URL')

      if (!swProjectId || !swToken || !swSpace) {
        return errorResponse('SignalWire configuration missing', 500)
      }

      // Fetch all numbers from SignalWire (100 per page)
      const swRes = await fetch(
        `https://${swSpace}/api/laml/2010-04-01/Accounts/${swProjectId}/IncomingPhoneNumbers.json?PageSize=100`,
        {
          headers: {
            Authorization: 'Basic ' + btoa(`${swProjectId}:${swToken}`),
          },
        }
      )
      if (!swRes.ok) {
        const text = await swRes.text()
        return errorResponse(`SignalWire error: ${text}`, 500)
      }
      const swData = await swRes.json()
      const swNumbers = swData.incoming_phone_numbers || []

      // Get all provisioned numbers from DB
      const { data: dbNumbers } = await supabase
        .from('service_numbers')
        .select('phone_number, user_id')

      // Get user emails for provisioned numbers
      const userIds = [...new Set((dbNumbers || []).map((n: any) => n.user_id).filter(Boolean))]
      let userEmailMap: Record<string, string> = {}
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, email')
          .in('id', userIds)
        for (const u of users || []) {
          userEmailMap[u.id] = u.email
        }
      }

      // Build provisioning map keyed by phone number
      const provisionedMap = new Map<string, { userId: string; email: string }>()
      for (const n of dbNumbers || []) {
        provisionedMap.set(n.phone_number, {
          userId: n.user_id,
          email: userEmailMap[n.user_id] || 'unknown',
        })
      }

      // Merge SW numbers with DB status
      const numbers = swNumbers.map((n: any) => {
        const prov = provisionedMap.get(n.phone_number)
        return {
          phoneNumber: n.phone_number,
          sid: n.sid,
          friendlyName: n.friendly_name,
          capabilities: n.capabilities,
          dateCreated: n.date_created,
          provisioned: !!prov,
          provisionedTo: prov?.email || null,
          provisionedUserId: prov?.userId || null,
        }
      })

      return successResponse({ numbers, total: numbers.length })
    }

    // ── Provision an existing SW number to a user account ────────────────────
    if (action === 'provision') {
      const { phoneNumber, phoneSid, userId } = body
      if (!phoneNumber || !phoneSid || !userId) {
        return errorResponse('phoneNumber, phoneSid, and userId are required', 400)
      }

      // Check not already provisioned
      const { data: existing } = await supabase
        .from('service_numbers')
        .select('id')
        .eq('phone_number', phoneNumber)
        .maybeSingle()

      if (existing) {
        return errorResponse('Number is already provisioned to an account', 400)
      }

      // Verify user exists
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email')
        .eq('id', userId)
        .single()

      if (userError || !user) {
        return errorResponse('User not found', 404)
      }

      // Configure webhooks on the SignalWire number
      const swProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
      const swToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
      const swSpace = Deno.env.get('SIGNALWIRE_SPACE_URL')
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const webhookBase = `${supabaseUrl}/functions/v1`

      if (swProjectId && swToken && swSpace) {
        const swUpdateBody = new URLSearchParams({
          VoiceUrl: `${webhookBase}/webhook-inbound-call`,
          VoiceMethod: 'POST',
          StatusCallback: `${webhookBase}/webhook-call-status`,
          StatusCallbackMethod: 'POST',
          SmsUrl: `${webhookBase}/webhook-inbound-sms`,
          SmsMethod: 'POST',
          FriendlyName: `Magpipe - ${user.email}`,
        })
        const swUpdateRes = await fetch(
          `https://${swSpace}/api/laml/2010-04-01/Accounts/${swProjectId}/IncomingPhoneNumbers/${phoneSid}.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: 'Basic ' + btoa(`${swProjectId}:${swToken}`),
            },
            body: swUpdateBody.toString(),
          }
        )
        if (!swUpdateRes.ok) {
          const errText = await swUpdateRes.text()
          console.error('SignalWire webhook update failed:', errText)
          // Don't abort — DB insert + LiveKit still happen
        }
      }

      // Insert into service_numbers
      const { error: insertError } = await supabase.from('service_numbers').insert({
        user_id: userId,
        phone_number: phoneNumber,
        phone_sid: phoneSid,
        friendly_name: `Magpipe - ${user.email}`,
        is_active: true,
        capabilities: { voice: true, sms: true, mms: true },
        monthly_fee: 2.00,
      })

      if (insertError) {
        return errorResponse(`Failed to insert number: ${insertError.message}`, 500)
      }

      // Add to LiveKit SIP inbound trunk
      await addNumberToSipTrunk(phoneNumber)

      await logAdminAction(supabase, {
        adminUserId: adminUser.id,
        targetUserId: userId,
        action: 'provision_phone_number',
        details: { phoneNumber, phoneSid, userEmail: user.email },
      })

      return successResponse({
        success: true,
        message: `${phoneNumber} provisioned to ${user.email}`,
      })
    }

    return errorResponse('Invalid action', 400)
  } catch (e) {
    console.error('admin-signalwire-numbers error:', e)
    return errorResponse(e.message || 'Internal server error', 500)
  }
})
