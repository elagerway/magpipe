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

    // This will be called by SignalWire webhook when admin replies
    const formData = await req.formData()
    const from = formData.get('From')
    const body = formData.get('Body')?.toString().trim().toLowerCase()
    const messageSid = formData.get('MessageSid')

    console.log(`Received SMS from ${from}: ${body}`)

    // Find pending approval from this admin phone
    const { data: approvals, error: fetchError } = await supabase
      .from('pending_deletion_approvals')
      .select('*')
      .eq('admin_phone', from)
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)

    if (fetchError || !approvals || approvals.length === 0) {
      console.log('No pending approvals found for this phone')
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'application/xml' }
      })
    }

    const approval = approvals[0]

    // Parse response
    const isApproved = body === 'yes' || body === 'y'
    const isRejected = body === 'no' || body === 'n'

    if (!isApproved && !isRejected) {
      // Unknown response
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Please reply YES to approve or NO to reject</Message></Response>', {
        headers: { 'Content-Type': 'application/xml' }
      })
    }

    // Update approval status
    await supabase
      .from('pending_deletion_approvals')
      .update({
        approval_status: isApproved ? 'approved' : 'rejected',
        response_received_at: new Date().toISOString(),
        response_text: body,
        response_sms_sid: messageSid
      })
      .eq('id', approval.id)

    if (isApproved) {
      console.log(`✅ Deletion approved for: ${approval.phone_numbers}`)

      // Update deletion record to allow processing
      await supabase
        .from('numbers_to_delete')
        .update({ deletion_status: 'approved' })
        .eq('id', approval.deletion_record_id)

      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Deletion approved. Numbers will be released.</Message></Response>', {
        headers: { 'Content-Type': 'application/xml' }
      })

    } else {
      console.log(`❌ Deletion rejected for: ${approval.phone_numbers}`)

      // Get all deletion records for this approval
      const { data: deletionRecords } = await supabase
        .from('numbers_to_delete')
        .select('*')
        .eq('user_id', approval.user_id)
        .in('phone_number', approval.phone_numbers.split(',').map(n => n.trim()))

      if (deletionRecords && deletionRecords.length > 0) {
        // Update SignalWire label for each number (but do NOT delete from SignalWire)
        for (const record of deletionRecords) {
          const updateUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/IncomingPhoneNumbers/${record.phone_sid}.json`

          await fetch(updateUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              FriendlyName: `removed_from_pat_${record.user_id}`
            })
          })

          console.log(`✅ Updated SignalWire label for ${record.phone_number} to removed_from_pat_${record.user_id}`)
        }

        // Remove from deletion queue (number stays in SignalWire with new label)
        await supabase
          .from('numbers_to_delete')
          .delete()
          .eq('id', approval.deletion_record_id)

        console.log(`✅ Removed from deletion queue - numbers kept in SignalWire with "removed_from_maggie" label`)
      }

      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Deletion rejected. Numbers removed from Maggie and labeled in SignalWire.</Message></Response>', {
        headers: { 'Content-Type': 'application/xml' }
      })
    }

  } catch (error) {
    console.error('Error in handle-deletion-approval:', error)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Error processing response</Message></Response>', {
      headers: { 'Content-Type': 'application/xml' }
    })
  }
})
