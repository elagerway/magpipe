/**
 * test-caller-swml — CXML handler for the test caller leg.
 * Called by SignalWire when the test number places a call to an agent.
 * Behaviour is driven by test_case.caller_mode: silent | scripted | agent.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function xmlResponse(cxml: string) {
  return new Response(cxml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  })
}

function silentCxml(maxSeconds = 45) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="${maxSeconds}"/>
  <Hangup/>
</Response>`
}

function scriptedCxml(phrases: string[], pauseBefore = 5, pauseBetween = 8) {
  const parts: string[] = []
  for (let i = 0; i < phrases.length; i++) {
    parts.push(`  <Pause length="${i === 0 ? pauseBefore : pauseBetween}"/>`)
    // Escape XML special chars in phrase
    const safe = phrases[i]
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    parts.push(`  <Say>${safe}</Say>`)
  }
  parts.push(`  <Pause length="5"/>`)
  parts.push(`  <Hangup/>`)

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${parts.join('\n')}
</Response>`
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const runId = url.searchParams.get('run_id')

    if (!runId) {
      return xmlResponse(silentCxml())
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Load test run → test case
    const { data: run } = await db
      .from('test_runs')
      .select('*, test_cases(*)')
      .eq('id', runId)
      .single()

    if (!run) {
      console.error(`test-caller-swml: run ${runId} not found`)
      return xmlResponse(silentCxml())
    }

    const tc = run.test_cases
    const callerMode: string = tc?.caller_mode || 'silent'

    console.log(`test-caller-swml: run=${runId} mode=${callerMode}`)

    if (callerMode === 'scripted') {
      const script: string[] = tc?.caller_script || []
      if (script.length === 0) {
        console.warn(`test-caller-swml: scripted mode but no caller_script for case ${tc?.id}`)
        return xmlResponse(silentCxml())
      }
      return xmlResponse(scriptedCxml(script))
    }

    if (callerMode === 'agent') {
      // Future: route to caller agent via LiveKit SIP.
      // For now fall through to silent — agent mode requires separate SIP dispatch.
      console.warn(`test-caller-swml: agent mode not yet implemented, using silent`)
      return xmlResponse(silentCxml())
    }

    // Default: silent
    return xmlResponse(silentCxml())
  } catch (e: any) {
    console.error('test-caller-swml error:', e)
    return xmlResponse(silentCxml())
  }
})
