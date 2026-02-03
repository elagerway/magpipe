import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  requireAdmin,
  logAdminAction,
  handleCors,
  errorResponse,
  successResponse
} from '../_shared/admin-auth.ts'

interface ManageNumberRequest {
  action: 'add' | 'remove' | 'transfer'
  userId: string
  phoneNumber?: string      // For add action - the number to provision
  numberId?: string         // For remove/transfer action - the service_numbers.id
  transferToUserId?: string // For transfer action - new owner
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify admin access
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Unauthorized', 401)
    }
    const token = authHeader.replace('Bearer ', '')

    let adminUser
    try {
      adminUser = await requireAdmin(supabase, token)
    } catch (error) {
      return errorResponse(error.message, 403)
    }

    // Parse request body
    const body: ManageNumberRequest = await req.json()

    if (!body.action || !body.userId) {
      return errorResponse('action and userId are required', 400)
    }

    // Verify target user exists
    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', body.userId)
      .single()

    if (userError || !targetUser) {
      return errorResponse('User not found', 404)
    }

    switch (body.action) {
      case 'add': {
        if (!body.phoneNumber) {
          return errorResponse('phoneNumber is required for add action', 400)
        }

        // Check if number already exists in the system
        const { data: existingNumber } = await supabase
          .from('service_numbers')
          .select('id, user_id')
          .eq('phone_number', body.phoneNumber)
          .single()

        if (existingNumber) {
          return errorResponse('Phone number already exists in the system', 400)
        }

        // Get SignalWire credentials
        const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
        const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
        const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')

        if (!signalwireProjectId || !signalwireToken || !signalwireSpaceUrl) {
          return errorResponse('SignalWire configuration missing', 500)
        }

        const webhookBaseUrl = `${supabaseUrl}/functions/v1`

        // Purchase number from SignalWire
        const purchaseUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/IncomingPhoneNumbers.json`

        const purchaseBody = new URLSearchParams({
          PhoneNumber: body.phoneNumber,
          VoiceUrl: `${webhookBaseUrl}/webhook-inbound-call`,
          VoiceMethod: 'POST',
          StatusCallback: `${webhookBaseUrl}/webhook-call-status`,
          StatusCallbackMethod: 'POST',
          SmsUrl: `${webhookBaseUrl}/webhook-inbound-sms`,
          SmsMethod: 'POST',
          FriendlyName: `Magpipe - ${targetUser.email} (Admin Provisioned)`,
        })

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
          return errorResponse(`Failed to purchase number: ${errorText}`, 500)
        }

        const purchaseResult = await purchaseResponse.json()

        // Save to database
        const { error: insertError } = await supabase
          .from('service_numbers')
          .insert({
            user_id: body.userId,
            phone_number: body.phoneNumber,
            phone_sid: purchaseResult.sid,
            friendly_name: `Magpipe - ${targetUser.email} (Admin Provisioned)`,
            is_active: false,
            capabilities: {
              voice: purchaseResult.capabilities?.voice || purchaseResult.capabilities?.Voice || false,
              sms: purchaseResult.capabilities?.sms || purchaseResult.capabilities?.SMS || false,
              mms: purchaseResult.capabilities?.mms || purchaseResult.capabilities?.MMS || false,
            }
          })

        if (insertError) {
          console.error('Database insert error:', insertError)
          return errorResponse('Failed to save number to database', 500)
        }

        // Log action
        await logAdminAction(supabase, {
          adminUserId: adminUser.id,
          targetUserId: body.userId,
          action: 'add_phone_number',
          details: {
            phoneNumber: body.phoneNumber,
            phoneSid: purchaseResult.sid,
            targetEmail: targetUser.email
          }
        })

        return successResponse({
          success: true,
          message: `Phone number ${body.phoneNumber} added to user ${targetUser.email}`,
          phoneNumber: body.phoneNumber
        })
      }

      case 'remove': {
        if (!body.numberId) {
          return errorResponse('numberId is required for remove action', 400)
        }

        // Get the number details
        const { data: numberData, error: numberError } = await supabase
          .from('service_numbers')
          .select('id, phone_number, phone_sid, user_id')
          .eq('id', body.numberId)
          .single()

        if (numberError || !numberData) {
          return errorResponse('Phone number not found', 404)
        }

        if (numberData.user_id !== body.userId) {
          return errorResponse('Phone number does not belong to this user', 400)
        }

        // Add to deletion queue instead of immediate deletion
        const { error: queueError } = await supabase
          .from('numbers_to_delete')
          .insert({
            phone_number: numberData.phone_number,
            phone_sid: numberData.phone_sid,
            original_user_id: body.userId,
            status: 'pending',
            scheduled_deletion_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
          })

        if (queueError) {
          console.error('Failed to queue deletion:', queueError)
          return errorResponse('Failed to queue number for deletion', 500)
        }

        // Remove from service_numbers
        const { error: deleteError } = await supabase
          .from('service_numbers')
          .delete()
          .eq('id', body.numberId)

        if (deleteError) {
          console.error('Delete error:', deleteError)
          return errorResponse('Failed to remove number from user', 500)
        }

        // Log action
        await logAdminAction(supabase, {
          adminUserId: adminUser.id,
          targetUserId: body.userId,
          action: 'remove_phone_number',
          details: {
            phoneNumber: numberData.phone_number,
            phoneSid: numberData.phone_sid,
            targetEmail: targetUser.email,
            scheduledForDeletion: true
          }
        })

        return successResponse({
          success: true,
          message: `Phone number ${numberData.phone_number} removed from user and scheduled for deletion`,
          phoneNumber: numberData.phone_number
        })
      }

      case 'transfer': {
        if (!body.numberId || !body.transferToUserId) {
          return errorResponse('numberId and transferToUserId are required for transfer action', 400)
        }

        // Verify new owner exists
        const { data: newOwner, error: newOwnerError } = await supabase
          .from('users')
          .select('id, email')
          .eq('id', body.transferToUserId)
          .single()

        if (newOwnerError || !newOwner) {
          return errorResponse('New owner user not found', 404)
        }

        // Get the number
        const { data: numberData, error: numberError } = await supabase
          .from('service_numbers')
          .select('id, phone_number, user_id')
          .eq('id', body.numberId)
          .single()

        if (numberError || !numberData) {
          return errorResponse('Phone number not found', 404)
        }

        if (numberData.user_id !== body.userId) {
          return errorResponse('Phone number does not belong to the source user', 400)
        }

        // Transfer ownership
        const { error: transferError } = await supabase
          .from('service_numbers')
          .update({
            user_id: body.transferToUserId,
            friendly_name: `Magpipe - ${newOwner.email} (Transferred)`,
            updated_at: new Date().toISOString()
          })
          .eq('id', body.numberId)

        if (transferError) {
          console.error('Transfer error:', transferError)
          return errorResponse('Failed to transfer number', 500)
        }

        // Log action
        await logAdminAction(supabase, {
          adminUserId: adminUser.id,
          targetUserId: body.userId,
          action: 'transfer_phone_number',
          details: {
            phoneNumber: numberData.phone_number,
            fromUser: targetUser.email,
            toUser: newOwner.email,
            newOwnerId: body.transferToUserId
          }
        })

        return successResponse({
          success: true,
          message: `Phone number ${numberData.phone_number} transferred from ${targetUser.email} to ${newOwner.email}`,
          phoneNumber: numberData.phone_number
        })
      }

      default:
        return errorResponse('Invalid action', 400)
    }
  } catch (error) {
    console.error('Error in admin-manage-numbers:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
