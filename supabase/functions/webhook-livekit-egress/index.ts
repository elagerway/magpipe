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
    console.log('Request method:', req.method)
    console.log('Request headers:', Object.fromEntries(req.headers.entries()))

    let payload
    try {
      payload = await req.json()
      console.log('✅ Parsed JSON payload successfully')
      console.log('Webhook payload:', JSON.stringify(payload, null, 2))
    } catch (jsonError) {
      console.error('❌ Failed to parse JSON:', jsonError)
      throw jsonError
    }

    // Support both camelCase and snake_case field names
    const event = payload.event
    const egressInfo = payload.egressInfo || payload.egress_info

    console.log(`Event type: ${event}, has egressInfo: ${!!egressInfo}`)

    // Only process when egress completes successfully
    if (event !== 'egress_ended') {
      console.log(`Ignoring event: ${event}`)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (!egressInfo) {
      console.error('❌ No egressInfo in payload!')
      return new Response(JSON.stringify({ error: 'No egressInfo in payload' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const egressId = egressInfo.egressId || egressInfo.egress_id
    const status = egressInfo.status

    console.log(`Egress ended: ${egressId}, status: ${status}, statusType: ${typeof status}`)
    console.log('Full egressInfo:', JSON.stringify(egressInfo, null, 2))

    // Only process successful egresses (status 3 = EGRESS_COMPLETE)
    if (status !== 3) {
      console.log(`Egress ${egressId} did not complete successfully (status: ${status}, expected: 3)`)
      return new Response(JSON.stringify({ ok: true, message: `Ignoring status ${status}` }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Extract recording URL (support both camelCase and snake_case)
    const fileResults = egressInfo.fileResults || egressInfo.file_results || []
    console.log(`Found ${fileResults.length} file results`)

    let recordingUrl = null

    if (fileResults.length > 0) {
      const firstFile = fileResults[0]
      recordingUrl = firstFile.downloadUrl || firstFile.download_url || firstFile.location
      console.log('First file result keys:', Object.keys(firstFile))
    } else if (egressInfo.file) {
      recordingUrl = egressInfo.file.downloadUrl || egressInfo.file.download_url || egressInfo.file.location
      console.log('Using egressInfo.file, keys:', Object.keys(egressInfo.file))
    }

    if (!recordingUrl) {
      console.warn(`❌ No recording URL found for egress ${egressId}`)
      console.warn('fileResults:', JSON.stringify(fileResults, null, 2))
      console.warn('egressInfo.file:', JSON.stringify(egressInfo.file, null, 2))
      return new Response(JSON.stringify({ ok: true, message: 'No recording URL found' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`✅ Recording URL: ${recordingUrl}`)

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
