/**
 * Fetch Call Recordings - Proactively fetches recordings from SignalWire
 * after a call ends, instead of relying on webhooks.
 *
 * Called by status handlers when calls complete.
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
    const { call_record_id, call_sid, delay_seconds = 0 } = body

    if (!call_record_id) {
      return new Response(
        JSON.stringify({ error: 'call_record_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Wait for delay if specified (allows recordings to finalize)
    if (delay_seconds > 0) {
      console.log(`⏳ Waiting ${delay_seconds}s for recordings to finalize...`)
      await new Promise(resolve => setTimeout(resolve, delay_seconds * 1000))
    }

    // Get call record
    const { data: callRecord, error: fetchError } = await supabase
      .from('call_records')
      .select('id, call_sid, vendor_call_id, recordings, agent_id, direction')
      .eq('id', call_record_id)
      .single()

    if (fetchError || !callRecord) {
      return new Response(
        JSON.stringify({ error: 'Call record not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const primaryCallSid = call_sid || callRecord.vendor_call_id || callRecord.call_sid
    if (!primaryCallSid) {
      return new Response(
        JSON.stringify({ error: 'No call SID available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📥 Fetching recordings for call ${call_record_id} (SID: ${primaryCallSid})`)

    // Collect all call SIDs to check (main call + any transfer calls)
    const callSidsToCheck = new Set<string>([primaryCallSid])

    // Look for transfer call SIDs in call_state_logs
    // Note: details is stored as a JSON string (not object), so we query recent logs and filter
    const { data: allTransferLogs } = await supabase
      .from('call_state_logs')
      .select('details')
      .eq('state', 'warm_transfer_started')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(100)

    // Filter for logs that mention our call_record_id
    const transferLogs = (allTransferLogs || []).filter(log => {
      const detailsStr = typeof log.details === 'string' ? log.details : JSON.stringify(log.details)
      return detailsStr.includes(call_record_id)
    })

    for (const log of (transferLogs || [])) {
      try {
        // Handle potentially double-encoded JSON from JSONB column
        let details = log.details
        // Keep parsing while it's a string (handles double-encoding)
        while (typeof details === 'string') {
          details = JSON.parse(details)
        }
        if (details.transferee_call_sid) {
          callSidsToCheck.add(details.transferee_call_sid)
          console.log(`📞 Found transferee call SID: ${details.transferee_call_sid}`)
        }
        if (details.actualCallerCallSid) {
          callSidsToCheck.add(details.actualCallerCallSid)
        }
      } catch (e) {
        console.log('Error parsing transfer log details:', e)
      }
    }

    console.log(`📞 Checking ${callSidsToCheck.size} call SID(s) for recordings`)

    // Get existing recordings - we need to check both SID and URL quality
    const existingRecordings = (callRecord.recordings || []) as any[]
    const recordingsByUrl: Map<string, any> = new Map()
    for (const r of existingRecordings) {
      recordingsByUrl.set(r.recording_sid, r)
    }

    // Helper to check if a recording needs to be (re)downloaded
    const needsDownload = (sid: string) => {
      const existing = recordingsByUrl.get(sid)
      if (!existing) return true  // New recording
      // Re-download if URL is not a Supabase URL (fallback)
      const isSupabaseUrl = existing.url && existing.url.includes('supabase.co')
      return !isSupabaseUrl
    }

    // Fetch recordings from all related calls
    const allRecordings: any[] = []

    for (const callSid of callSidsToCheck) {
      try {
        // Try call-level recordings
        const callRecUrl = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${callSid}/Recordings.json`
        const callResp = await fetch(callRecUrl, {
          headers: { 'Authorization': signalwireAuth }
        })

        if (callResp.ok) {
          const callData = await callResp.json()
          for (const rec of (callData.recordings || [])) {
            if (rec.status === 'completed' && needsDownload(rec.sid)) {
              allRecordings.push({ ...rec, source_call_sid: callSid })
            }
          }
        }
      } catch (e) {
        console.log(`Error fetching recordings for ${callSid}:`, e)
      }
    }

    // Also check account-level recordings from the last 10 minutes
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString().split('.')[0] + 'Z'
      const accountRecUrl = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Recordings.json?DateCreated>=${encodeURIComponent(tenMinutesAgo)}`

      const accountResp = await fetch(accountRecUrl, {
        headers: { 'Authorization': signalwireAuth }
      })

      if (accountResp.ok) {
        const accountData = await accountResp.json()
        for (const rec of (accountData.recordings || [])) {
          if (rec.status === 'completed' &&
              callSidsToCheck.has(rec.call_sid) &&
              !existingRecordingSids.has(rec.sid)) {
            // Check if we already have this recording
            if (!allRecordings.some(r => r.sid === rec.sid)) {
              allRecordings.push({ ...rec, source_call_sid: rec.call_sid })
            }
          }
        }
      }
    } catch (e) {
      console.log('Error fetching account recordings:', e)
    }

    if (allRecordings.length === 0) {
      console.log('✅ No new recordings found')
      return new Response(
        JSON.stringify({ success: true, recordings_added: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📥 Found ${allRecordings.length} recording(s) to download/update`)

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

    const results = []
    // Start with existing recordings, we'll update entries in place for re-downloads
    let updatedRecordings = [...existingRecordings]

    // Sort recordings by creation time
    allRecordings.sort((a, b) =>
      new Date(a.date_created).getTime() - new Date(b.date_created).getTime()
    )

    for (const swRec of allRecordings) {
      // First check if there's an existing entry with this SID (re-download case)
      const existingIndex = updatedRecordings.findIndex((r: any) => r.recording_sid === swRec.sid)
      let isUpdate = existingIndex >= 0

      // Determine label - use existing label if updating, otherwise determine new label
      let label = 'main'
      if (isUpdate) {
        label = updatedRecordings[existingIndex].label
        console.log(`📝 Re-downloading existing recording: ${swRec.sid} (${label})`)
      } else {
        // Conference recordings
        if (swRec.conference_sid) {
          label = 'transfer_conference'
        }
        // If this is from a transfer call (not the primary call)
        else if (swRec.source_call_sid !== primaryCallSid) {
          label = 'transferee_consult'
        }
        // If from primary call, check if it's a subsequent recording (reconnect)
        else {
          const existingLabels = updatedRecordings.map((r: any) => r.label)
          if (existingLabels.includes('main')) {
            // This is a second+ recording from the main call
            // If there's a transferee recording, this is likely reconnect after decline
            if (existingLabels.includes('transferee_consult') && !existingLabels.includes('transfer_conference')) {
              label = 'reconnect_after_decline'
            } else {
              label = `main_${swRec.sid.substring(0, 8)}`
            }
          }
        }

        // Check for duplicate labels and make unique
        const existingLabels = updatedRecordings.map((r: any) => r.label)
        if (existingLabels.includes(label)) {
          label = `${label}_${swRec.sid.substring(0, 8)}`
        }
      }

      try {
        // Download the recording using manual redirect (auth headers shouldn't go to S3)
        const mp3Url = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Recordings/${swRec.sid}.mp3`
        console.log(`📥 Downloading ${label}: ${swRec.sid}`)

        // Use manual redirect so auth headers don't get forwarded to S3
        const initialResp = await fetch(mp3Url, {
          headers: { 'Authorization': signalwireAuth },
          redirect: 'manual'
        })

        let audioResponse: Response
        if (initialResp.status === 302 || initialResp.status === 301) {
          const redirectUrl = initialResp.headers.get('Location')
          if (!redirectUrl) {
            console.error(`No redirect URL for ${swRec.sid}`)
            continue
          }
          // Follow redirect without auth headers
          audioResponse = await fetch(redirectUrl)
        } else if (initialResp.ok) {
          audioResponse = initialResp
        } else {
          console.error(`Failed to download ${swRec.sid}: ${initialResp.status}`)
          continue
        }

        if (!audioResponse.ok) {
          console.error(`Download failed after redirect for ${swRec.sid}: ${audioResponse.status}`)
          continue
        }

        const audioBlob = await audioResponse.blob()
        console.log(`   Downloaded ${audioBlob.size} bytes`)

        // Upload to Supabase Storage
        const fileLabel = label === 'main' ? '' : `_${label}`
        const fileName = `recordings/${call_record_id}${fileLabel}.mp3`

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
          console.log(`✅ Uploaded: ${fileName}`)
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
        }

        // Update or add the recording entry
        if (isUpdate) {
          updatedRecordings[existingIndex] = recordingEntry
        } else {
          updatedRecordings.push(recordingEntry)
        }

        results.push({
          recording_sid: swRec.sid,
          label,
          status: isUpdate ? 'updated' : 'added'
        })

        // Transcribe asynchronously (skip if too short for meaningful speech)
        const recDuration = parseInt(swRec.duration) || 0
        if (recDuration < 3) {
          console.log(`⏭️ Skipping transcription for ${label}: duration ${recDuration}s (too short for speech)`)
        } else {
          transcribeRecording(
            audioBlob,
            call_record_id,
            label,
            swRec.sid,
            agentName,
            callRecord.direction || 'inbound',
            supabase
          ).catch(err => console.error('Transcription error:', err))
        }

      } catch (recError: any) {
        console.error(`Error processing recording ${swRec.sid}:`, recError)
        results.push({
          recording_sid: swRec.sid,
          label,
          status: 'error',
          error: recError.message
        })
      }
    }

    // Update call record with new recordings (added or updated)
    if (results.some(r => r.status === 'added' || r.status === 'updated')) {
      const updateData: Record<string, any> = { recordings: updatedRecordings }

      // Set recording_url to first recording if not already set
      const { data: currentRecord } = await supabase
        .from('call_records')
        .select('recording_url')
        .eq('id', call_record_id)
        .single()

      if (!currentRecord?.recording_url && updatedRecordings.length > 0) {
        const mainRecording = updatedRecordings.find((r: any) => r.label === 'main') || updatedRecordings[0]
        updateData.recording_url = mainRecording.url
      }

      await supabase
        .from('call_records')
        .update(updateData)
        .eq('id', call_record_id)

      const addedCount = results.filter(r => r.status === 'added').length
      const updatedCount = results.filter(r => r.status === 'updated').length
      console.log(`✅ Updated call record: ${addedCount} added, ${updatedCount} updated`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        recordings_added: results.filter(r => r.status === 'added' || r.status === 'updated').length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error in fetch-call-recordings:', error)
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
  direction: string,
  supabase: any
) {
  const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY')
  if (!deepgramApiKey) {
    console.log('No Deepgram API key, skipping transcription')
    return
  }

  console.log(`🎤 Transcribing ${label} (${recordingSid})...`)

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

    // Format with speaker labels based on direction
    transcript = segments.map(seg => {
      let speakerLabel: string
      if (direction === 'outbound') {
        // Outbound: Speaker 0 = Callee, Speaker 1 = Agent
        speakerLabel = seg.speaker === 0 ? 'Callee' : agentName
      } else {
        // Inbound: Speaker 0 = Caller, Speaker 1 = Agent
        speakerLabel = seg.speaker === 0 ? 'Caller' : agentName
      }
      return `${speakerLabel}: ${seg.text}`
    }).join('\n')
  } else {
    transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
  }

  console.log(`✅ Transcription: ${transcript.substring(0, 80)}...`)

  // Update the recording entry with transcript
  const { data: currentRecord } = await supabase
    .from('call_records')
    .select('recordings, transcript')
    .eq('id', callRecordId)
    .single()

  const recordings = currentRecord?.recordings || []
  const updatedRecordings = recordings.map((rec: any) => {
    if (rec.recording_sid === recordingSid) {
      return { ...rec, transcript }
    }
    return rec
  })

  // Update recordings array, and set call-level transcript if this is main
  const updateData: Record<string, any> = { recordings: updatedRecordings }
  if (label === 'main') {
    updateData.transcript = transcript
  }

  await supabase
    .from('call_records')
    .update(updateData)
    .eq('id', callRecordId)

  console.log(`✅ Saved transcript for ${label}`)
}
