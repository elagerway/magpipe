/**
 * Reconcile Recordings - Checks SignalWire for any missing recording callbacks
 * and backfills them to Supabase Storage.
 *
 * This handles cases where SignalWire recording callbacks fail to fire
 * due to transient network issues.
 *
 * Can be called:
 * - Manually for a specific call_record_id
 * - On a schedule to check recent calls
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SIGNALWIRE_SPACE_URL = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com'
const SIGNALWIRE_PROJECT_ID = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
const SIGNALWIRE_API_TOKEN = Deno.env.get('SIGNALWIRE_API_TOKEN')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const signalwireAuth = 'Basic ' + btoa(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`)

    // Parse request
    const body = await req.json().catch(() => ({}))
    const callRecordId = body.call_record_id

    let callRecords = []

    if (callRecordId) {
      // Reconcile specific call
      const { data, error } = await supabase
        .from('call_records')
        .select('id, call_sid, vendor_call_id, recordings, agent_id')
        .eq('id', callRecordId)
        .single()

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: 'Call record not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      callRecords = [data]
    } else {
      // Get recent calls from last 24 hours that might be missing recordings
      const { data, error } = await supabase
        .from('call_records')
        .select('id, call_sid, vendor_call_id, recordings, agent_id')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .not('call_sid', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Error fetching call records:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch call records' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      callRecords = data || []
    }

    console.log(`🔄 Reconciling recordings for ${callRecords.length} call(s)`)

    const results = []

    for (const callRecord of callRecords) {
      const callSid = callRecord.vendor_call_id || callRecord.call_sid
      if (!callSid) continue

      // Get all recordings for this call from SignalWire
      const recordingsUrl = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${callSid}/Recordings.json`

      try {
        const response = await fetch(recordingsUrl, {
          headers: { 'Authorization': signalwireAuth }
        })

        if (!response.ok) {
          console.log(`No recordings found for call ${callSid}`)
          continue
        }

        const data = await response.json()
        const swRecordings = data.recordings || []

        // Also check for recordings via transfer calls
        // Look up any related transfer calls from call_state_logs
        const { data: transferLogs } = await supabase
          .from('call_state_logs')
          .select('details')
          .eq('state', 'warm_transfer_started')
          .like('details', `%${callRecord.id}%`)

        const transferCallSids = new Set<string>()
        for (const log of (transferLogs || [])) {
          try {
            const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details
            if (details.transferee_call_sid) {
              transferCallSids.add(details.transferee_call_sid)
            }
          } catch (e) {
            // Ignore parse errors
          }
        }

        // Fetch recordings from transfer calls
        for (const transferSid of transferCallSids) {
          const transferRecUrl = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${transferSid}/Recordings.json`
          try {
            const transferResp = await fetch(transferRecUrl, {
              headers: { 'Authorization': signalwireAuth }
            })
            if (transferResp.ok) {
              const transferData = await transferResp.json()
              swRecordings.push(...(transferData.recordings || []))
            }
          } catch (e) {
            console.log(`Error fetching transfer recordings for ${transferSid}:`, e)
          }
        }

        // Check which recordings we're missing
        const existingRecordingSids = new Set(
          (callRecord.recordings || []).map((r: any) => r.recording_sid)
        )

        const missingRecordings = swRecordings.filter(
          (r: any) => r.status === 'completed' && !existingRecordingSids.has(r.sid)
        )

        if (missingRecordings.length === 0) {
          console.log(`✅ No missing recordings for call ${callRecord.id}`)
          continue
        }

        console.log(`📥 Found ${missingRecordings.length} missing recording(s) for call ${callRecord.id}`)

        // Get agent name for transcription
        let agentName = 'Maggie'
        if (callRecord.agent_id) {
          const { data: agentConfig } = await supabase
            .from('agent_configs')
            .select('name, agent_name')
            .eq('id', callRecord.agent_id)
            .single()
          if (agentConfig) {
            agentName = agentConfig.agent_name || agentConfig.name || 'Maggie'
          }
        }

        // Download and process each missing recording
        for (const swRec of missingRecordings) {
          // Determine label based on which call the recording belongs to
          let label = 'main'
          if (transferCallSids.has(swRec.call_sid)) {
            label = 'transferee_consult'
          } else if (swRec.conference_sid) {
            label = 'transfer_conference'
          }

          // Check if we already have a recording with this label
          const existingWithLabel = (callRecord.recordings || []).find(
            (r: any) => r.label === label
          )
          if (existingWithLabel) {
            // Use a more specific label
            label = `${label}_${swRec.sid.substring(0, 8)}`
          }

          try {
            // Download the recording
            const mp3Url = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Recordings/${swRec.sid}.mp3`
            console.log(`📥 Downloading: ${mp3Url}`)

            const audioResponse = await fetch(mp3Url, {
              headers: { 'Authorization': signalwireAuth },
              redirect: 'follow'
            })

            if (!audioResponse.ok) {
              console.error(`Failed to download recording ${swRec.sid}: ${audioResponse.status}`)
              continue
            }

            const audioBlob = await audioResponse.blob()
            console.log(`   Downloaded ${audioBlob.size} bytes`)

            // Upload to Supabase Storage
            const fileLabel = label === 'main' ? '' : `_${label}`
            const fileName = `recordings/${callRecord.id}${fileLabel}.mp3`

            const { error: uploadError } = await supabase.storage
              .from('public')
              .upload(fileName, audioBlob, {
                contentType: 'audio/mpeg',
                upsert: true,
              })

            let publicRecordingUrl = mp3Url
            if (!uploadError) {
              const { data: urlData } = supabase.storage.from('public').getPublicUrl(fileName)
              publicRecordingUrl = urlData.publicUrl
              console.log(`✅ Uploaded: ${publicRecordingUrl}`)
            } else {
              console.error('Upload error:', uploadError)
            }

            // Build recording entry
            const recordingEntry = {
              url: publicRecordingUrl,
              label: label,
              duration: parseInt(swRec.duration) || 0,
              timestamp: new Date(swRec.date_created).toISOString(),
              recording_sid: swRec.sid,
              reconciled: true,
            }

            // Update call record
            const updatedRecordings = [...(callRecord.recordings || []), recordingEntry]
            await supabase
              .from('call_records')
              .update({ recordings: updatedRecordings })
              .eq('id', callRecord.id)

            // Update local reference for next iteration
            callRecord.recordings = updatedRecordings

            results.push({
              call_record_id: callRecord.id,
              recording_sid: swRec.sid,
              label,
              status: 'added'
            })

            console.log(`✅ Added recording ${swRec.sid} (${label}) to call ${callRecord.id}`)

            // Transcribe asynchronously (don't await)
            transcribeRecording(audioBlob, callRecord.id, label, swRec.sid, agentName, supabase)
              .catch(err => console.error('Transcription error:', err))

          } catch (recError) {
            console.error(`Error processing recording ${swRec.sid}:`, recError)
            results.push({
              call_record_id: callRecord.id,
              recording_sid: swRec.sid,
              label,
              status: 'error',
              error: recError.message
            })
          }
        }

      } catch (error) {
        console.error(`Error reconciling call ${callRecord.id}:`, error)
        results.push({
          call_record_id: callRecord.id,
          status: 'error',
          error: error.message
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        calls_checked: callRecords.length,
        recordings_added: results.filter(r => r.status === 'added').length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in reconcile-recordings:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Transcribe audio with Deepgram
 */
async function transcribeRecording(
  audioBlob: Blob,
  callRecordId: string,
  label: string,
  recordingSid: string,
  agentName: string,
  supabase: any
) {
  const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY')
  if (!deepgramApiKey) {
    console.log('No Deepgram API key, skipping transcription')
    return
  }

  console.log(`🎤 Transcribing recording ${recordingSid}...`)

  const arrayBuffer = await audioBlob.arrayBuffer()

  const response = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true',
    {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'audio/mp3',
      },
      body: arrayBuffer,
    }
  )

  if (!response.ok) {
    throw new Error(`Deepgram API error: ${response.status}`)
  }

  const result = await response.json()
  const words = result.results?.channels?.[0]?.alternatives?.[0]?.words || []

  let transcript = ''
  if (words.length > 0) {
    let currentSpeaker = -1
    let currentText = ''
    const segments: { speaker: number; text: string }[] = []

    for (const word of words) {
      const speaker = word.speaker ?? 0
      if (speaker !== currentSpeaker) {
        if (currentText.trim()) {
          segments.push({ speaker: currentSpeaker, text: currentText.trim() })
        }
        currentSpeaker = speaker
        currentText = word.punctuated_word || word.word
      } else {
        currentText += ' ' + (word.punctuated_word || word.word)
      }
    }
    if (currentText.trim()) {
      segments.push({ speaker: currentSpeaker, text: currentText.trim() })
    }

    // Format with speaker labels
    transcript = segments.map(seg => {
      const speakerLabel = seg.speaker === 0 ? 'Caller' : agentName
      return `${speakerLabel}: ${seg.text}`
    }).join('\n')
  } else {
    transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
  }

  console.log(`✅ Transcription: ${transcript.substring(0, 100)}...`)

  // Update the recording entry with transcript
  const { data: currentRecord } = await supabase
    .from('call_records')
    .select('recordings')
    .eq('id', callRecordId)
    .single()

  const recordings = currentRecord?.recordings || []
  const updatedRecordings = recordings.map((rec: any) => {
    if (rec.recording_sid === recordingSid) {
      return { ...rec, transcript }
    }
    return rec
  })

  await supabase
    .from('call_records')
    .update({ recordings: updatedRecordings })
    .eq('id', callRecordId)

  console.log(`✅ Saved transcript for ${recordingSid}`)
}
