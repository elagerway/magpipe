/**
 * Batch Call CXML — returns conference XML for batch call legs
 * Two modes:
 *   ?leg=agent&conf=<name>  → Agent leg (startConferenceOnEnter, no beep)
 *   ?leg=pstn&conf=<name>   → PSTN leg (endConferenceOnExit, record)
 * Deploy: npx supabase functions deploy batch-call-cxml --no-verify-jwt
 */

// XML-escape ampersands in URLs for safe embedding in CXML attributes
function xmlEsc(s: string): string { return s.replace(/&/g, '&amp;') }

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const leg = url.searchParams.get('leg') || 'agent'
    const conf = url.searchParams.get('conf') || 'batch-default'
    const callRecordId = url.searchParams.get('call_record_id') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''

    console.log(`batch-call-cxml: leg=${leg}, conf=${conf}, call_record_id=${callRecordId}`)

    if (leg === 'agent') {
      const statusCb = xmlEsc(`${supabaseUrl}/functions/v1/batch-conf-status?conf=${encodeURIComponent(conf)}`)
      const cxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false" waitUrl="" statusCallbackEvent="join leave" statusCallback="${statusCb}">${conf}</Conference>
  </Dial>
</Response>`
      return new Response(cxml, { status: 200, headers: { 'Content-Type': 'application/xml' } })
    }

    // PSTN leg: join the conference, end it when they hang up
    // record on <Dial> (not <Conference>) — matches working outbound-call-swml pattern
    const recordingCb = xmlEsc(`${supabaseUrl}/functions/v1/sip-recording-callback?call_record_id=${encodeURIComponent(callRecordId)}&label=main`)
    const cxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="record-from-answer" recordingStatusCallback="${recordingCb}">
    <Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${conf}</Conference>
  </Dial>
</Response>`
    return new Response(cxml, { status: 200, headers: { 'Content-Type': 'application/xml' } })
  } catch (error) {
    console.error('batch-call-cxml error:', error)
    const cxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred.</Say>
  <Hangup/>
</Response>`
    return new Response(cxml, { status: 200, headers: { 'Content-Type': 'application/xml' } })
  }
})
