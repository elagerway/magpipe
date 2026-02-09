import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!
    const adminPhone = Deno.env.get('ADMIN_PHONE_NUMBER')! // Admin's personal phone (receives SMS)
    const adminSmsNumber = Deno.env.get('ADMIN_SMS_NUMBER')! // SignalWire number for admin communications

    const { deletionRecordId, phoneNumbers, userId } = await req.json()

    if (!deletionRecordId || !phoneNumbers || !userId) {
      throw new Error('deletionRecordId, phoneNumbers, and userId are required')
    }

    console.log(`Requesting approval for deletion: ${phoneNumbers}`)

    // Create approval request
    const { data: approval, error: approvalError } = await supabase
      .from('pending_deletion_approvals')
      .insert({
        deletion_record_id: deletionRecordId,
        phone_numbers: phoneNumbers,
        user_id: userId,
        admin_phone: adminPhone,
        approval_status: 'pending'
      })
      .select()
      .single()

    if (approvalError) {
      throw new Error(`Failed to create approval request: ${approvalError.message}`)
    }

    // Send SMS to admin
    const smsMessage = `Phone Number Deletion Request

Numbers: ${phoneNumbers}
User: ${userId}

Reply YES to approve deletion
Reply NO to reject and remove from Maggie

Approval ID: ${approval.id.substring(0, 8)}`

    const smsUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Messages.json`

    const smsResponse = await fetch(smsUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: adminSmsNumber, // Use dedicated admin communication number
        To: adminPhone,
        Body: smsMessage
      })
    })

    if (!smsResponse.ok) {
      const errorText = await smsResponse.text()
      throw new Error(`Failed to send SMS: ${errorText}`)
    }

    const smsData = await smsResponse.json()

    // Update approval with SMS SID
    await supabase
      .from('pending_deletion_approvals')
      .update({
        approval_sms_sid: smsData.sid,
        approval_sms_sent_at: new Date().toISOString()
      })
      .eq('id', approval.id)

    console.log(`✅ Approval SMS sent to ${adminPhone}`)

    return new Response(
      JSON.stringify({
        success: true,
        approvalId: approval.id,
        message: 'Approval request sent via SMS'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in request-deletion-approval:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
