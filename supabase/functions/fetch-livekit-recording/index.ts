/**
 * Fetch LiveKit Recording
 *
 * Polls LiveKit Egress API until recording is complete, then adds to call_record.
 * Called by the agent after a call ends.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY')!
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET')!
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL')!

Deno.serve(async (req) => {
  try {
    const { egress_id, call_record_id, transcript } = await req.json()

    if (!egress_id || !call_record_id) {
      return new Response(JSON.stringify({ error: 'Missing egress_id or call_record_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`🎙️ Starting proactive recording fetch for egress ${egress_id}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Poll for up to 2 minutes (12 attempts * 10 seconds)
    const maxAttempts = 12
    const delaySeconds = 10

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Wait before checking
      await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000))

      // Query LiveKit Egress API
      const egressInfo = await getEgressInfo(egress_id)

      if (!egressInfo) {
        console.log(`🎙️ Egress ${egress_id} not found, attempt ${attempt}/${maxAttempts}`)
        continue
      }

      const status = egressInfo.status

      // Status: EGRESS_STARTING=0, EGRESS_ACTIVE=1, EGRESS_ENDING=2, EGRESS_COMPLETE=3, EGRESS_FAILED=4
      if (status === 'EGRESS_COMPLETE' || status === 3) {
        console.log(`✅ Egress ${egress_id} complete!`)

        // Get recording URL from file results
        let recordingUrl = null
        let durationSeconds = 0

        const fileResults = egressInfo.file_results || egressInfo.fileResults || []
        if (fileResults.length > 0) {
          recordingUrl = fileResults[0].location
          durationSeconds = Math.round((fileResults[0].duration || 0) / 1_000_000_000)
        } else if (egressInfo.file) {
          recordingUrl = egressInfo.file.location
          durationSeconds = Math.round((egressInfo.file.duration || 0) / 1_000_000_000)
        }

        if (!recordingUrl) {
          console.warn(`⚠️ Egress complete but no file URL found`)
          return new Response(JSON.stringify({ error: 'No file URL in egress' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        console.log(`🎙️ Recording URL: ${recordingUrl}, duration: ${durationSeconds}s`)

        // Add to recordings array
        const { data: callRecord } = await supabase
          .from('call_records')
          .select('recordings')
          .eq('id', call_record_id)
          .single()

        const existingRecordings = callRecord?.recordings || []

        // Check if already added
        if (existingRecordings.some((r: any) => r.recording_sid === egress_id)) {
          console.log(`🎙️ Recording ${egress_id} already in recordings array`)
          return new Response(JSON.stringify({ success: true, already_added: true }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Create new recording entry
        const newRecording: Record<string, any> = {
          recording_sid: egress_id,
          label: 'conversation',
          url: recordingUrl,
          duration_seconds: durationSeconds,
          source: 'livekit',
          created_at: new Date().toISOString(),
        }

        if (transcript) {
          newRecording.transcript = transcript
        }

        // Prepend to recordings (conversation is first/earliest)
        const updatedRecordings = [newRecording, ...existingRecordings]

        // Update database
        await supabase
          .from('call_records')
          .update({
            recordings: updatedRecordings,
            recording_url: recordingUrl,
          })
          .eq('id', call_record_id)

        console.log(`✅ Added LiveKit recording to call_record ${call_record_id}`)

        return new Response(JSON.stringify({ success: true, recording_url: recordingUrl }), {
          headers: { 'Content-Type': 'application/json' },
        })

      } else if (status === 'EGRESS_FAILED' || status === 4) {
        console.error(`❌ Egress ${egress_id} failed: ${egressInfo.error || 'Unknown error'}`)
        return new Response(JSON.stringify({ error: 'Egress failed', details: egressInfo.error }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })

      } else {
        const statusNames: Record<number, string> = {
          0: 'STARTING',
          1: 'ACTIVE',
          2: 'ENDING',
          3: 'COMPLETE',
          4: 'FAILED'
        }
        const statusName = typeof status === 'number' ? statusNames[status] : status
        console.log(`🎙️ Egress ${egress_id} status: ${statusName}, attempt ${attempt}/${maxAttempts}`)
      }
    }

    console.warn(`⚠️ Gave up waiting for egress ${egress_id} after ${maxAttempts} attempts`)
    return new Response(JSON.stringify({ error: 'Timeout waiting for egress' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in fetch-livekit-recording:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

/**
 * Query LiveKit Egress API for egress status
 */
async function getEgressInfo(egressId: string): Promise<any> {
  try {
    // LiveKit API uses JWT auth
    const token = await createLiveKitToken()

    // Extract host from WebSocket URL
    const host = LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://')

    const response = await fetch(`${host}/twirp/livekit.Egress/ListEgress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ egress_id: egressId }),
    })

    if (!response.ok) {
      console.error(`LiveKit API error: ${response.status} ${await response.text()}`)
      return null
    }

    const data = await response.json()
    return data.items?.[0] || null

  } catch (error) {
    console.error('Error querying LiveKit API:', error)
    return null
  }
}

/**
 * Create a LiveKit access token for API calls
 */
async function createLiveKitToken(): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: LIVEKIT_API_KEY,
    sub: LIVEKIT_API_KEY,
    iat: now,
    exp: now + 300, // 5 minutes
    video: {
      roomAdmin: true,
    },
  }

  const encoder = new TextEncoder()
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const data = encoder.encode(`${headerB64}.${payloadB64}`)
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(LIVEKIT_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, data)
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${headerB64}.${payloadB64}.${signatureB64}`
}
