import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('=== LIVEKIT EGRESS WEBHOOK START ===')

    const payload = await req.json()
    console.log('Webhook payload:', JSON.stringify(payload, null, 2))

    const { event, egressInfo } = payload

    // Only process when egress completes successfully
    if (event !== 'egress_ended') {
      console.log(`Ignoring event: ${event}`)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const egressId = egressInfo?.egressId
    const status = egressInfo?.status

    console.log(`Egress ended: ${egressId}, status: ${status}`)

    // Only process successful egresses (status 3 = EGRESS_COMPLETE)
    if (status !== 3) {
      console.log(`Egress ${egressId} did not complete successfully (status: ${status})`)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Extract recording URL
    const fileResults = egressInfo?.fileResults || []
    let recordingUrl = null

    if (fileResults.length > 0) {
      recordingUrl = fileResults[0].downloadUrl || fileResults[0].download_url
    } else if (egressInfo?.file?.downloadUrl) {
      recordingUrl = egressInfo.file.downloadUrl
    } else if (egressInfo?.file?.download_url) {
      recordingUrl = egressInfo.file.download_url
    }

    if (!recordingUrl) {
      console.warn(`No recording URL found for egress ${egressId}`)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`Recording URL: ${recordingUrl}`)

    // Update call_record with recording URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: updateResult, error: updateError } = await supabase
      .from('call_records')
      .update({ recording_url: recordingUrl })
      .eq('egress_id', egressId)
      .select()

    if (updateError) {
      console.error('Error updating call_record:', updateError)
      return new Response(JSON.stringify({ error: updateError.message }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    if (!updateResult || updateResult.length === 0) {
      console.warn(`No call_record found with egress_id: ${egressId}`)
      return new Response(JSON.stringify({ ok: true, message: 'No matching call record' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`✅ Updated call_record ${updateResult[0].id} with recording URL`)

    return new Response(JSON.stringify({ ok: true, updated: updateResult.length }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Error in webhook-livekit-egress:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
