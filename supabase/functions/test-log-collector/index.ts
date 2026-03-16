/**
 * test-log-collector — Aggregate logs and evaluate assertions for a test run.
 * Called after a test call ends (via StatusCallback or manually).
 * Runs assertions against call_records, then triggers AI analysis on failure.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RENDER_API_KEY = Deno.env.get('RENDER_API_KEY') || ''
const RENDER_SERVICE_ID = Deno.env.get('RENDER_SERVICE_ID') || 'srv-d3g2gvmr433s738si3j0'

interface AssertionResult {
  name: string
  passed: boolean
  detail: string
}

async function fetchRenderLogs(startAt: string, endAt: string): Promise<any[]> {
  if (!RENDER_API_KEY) return []
  try {
    const params = new URLSearchParams({
      serviceId: RENDER_SERVICE_ID,
      startTime: startAt,
      endTime: endAt,
      limit: '100',
    })
    const res = await fetch(`https://api.render.com/v1/logs?${params}`, {
      headers: { Authorization: `Bearer ${RENDER_API_KEY}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.logs || []).map((l: any) => ({
      level: l.level || 'info',
      message: l.message || '',
      timestamp: l.timestamp || '',
    }))
  } catch {
    return []
  }
}

function evaluateAssertions(tc: any, callRecord: any): AssertionResult[] {
  const results: AssertionResult[] = []
  const transcript: string = (callRecord?.transcript || '').toLowerCase()
  const transcriptWithTools: any[] = callRecord?.transcript_with_tool_calls || []
  const durationSec: number = callRecord?.duration_seconds || 0
  const callStatus: string = callRecord?.status || ''

  // 1. Call connected
  results.push({
    name: 'call_connected',
    passed: !!callRecord && !['failed', 'busy', 'no-answer'].includes(callStatus),
    detail: callRecord
      ? `Call status: ${callStatus}`
      : 'No call record found — call did not connect',
  })

  // 2. Agent joined (has transcript or duration > 0)
  const agentJoined = durationSec > 0 || transcript.length > 10
  results.push({
    name: 'agent_joined',
    passed: agentJoined,
    detail: agentJoined
      ? `Agent active: ${durationSec}s, transcript length: ${transcript.length} chars`
      : 'Agent does not appear to have joined — no transcript and zero duration',
  })

  // 3. Expected phrases
  const expectedPhrases: string[] = tc.expected_phrases || []
  for (const phrase of expectedPhrases) {
    const found = transcript.includes(phrase.toLowerCase())
    results.push({
      name: `phrase_expected: "${phrase}"`,
      passed: found,
      detail: found
        ? `Found "${phrase}" in transcript`
        : `"${phrase}" not found in transcript`,
    })
  }

  // 4. Prohibited phrases
  const prohibitedPhrases: string[] = tc.prohibited_phrases || []
  for (const phrase of prohibitedPhrases) {
    const found = transcript.includes(phrase.toLowerCase())
    results.push({
      name: `phrase_prohibited: "${phrase}"`,
      passed: !found,
      detail: !found
        ? `"${phrase}" correctly absent from transcript`
        : `Prohibited phrase "${phrase}" was found in transcript`,
    })
  }

  // 5. Expected functions (check transcript_with_tool_calls for tool call names)
  const expectedFunctions: string[] = tc.expected_functions || []
  const calledFunctions = new Set<string>()
  for (const entry of transcriptWithTools) {
    if (entry?.role === 'tool_call' || entry?.type === 'tool_call') {
      calledFunctions.add(entry.name || entry.function_name || '')
    }
    // Also check if it's embedded in content
    if (typeof entry?.content === 'string' && entry.content.includes('tool_call')) {
      try {
        const parsed = JSON.parse(entry.content)
        if (parsed?.name) calledFunctions.add(parsed.name)
      } catch { /* noop */ }
    }
  }
  for (const fnName of expectedFunctions) {
    const found = calledFunctions.has(fnName)
    results.push({
      name: `function_called: "${fnName}"`,
      passed: found,
      detail: found
        ? `Function "${fnName}" was called during the conversation`
        : `Expected function "${fnName}" was not called (called: ${[...calledFunctions].join(', ') || 'none'})`,
    })
  }

  // 6. Min duration
  if (tc.min_duration_seconds != null) {
    const passed = durationSec >= tc.min_duration_seconds
    results.push({
      name: 'min_duration',
      passed,
      detail: passed
        ? `Duration ${durationSec}s >= minimum ${tc.min_duration_seconds}s`
        : `Duration ${durationSec}s is below minimum ${tc.min_duration_seconds}s`,
    })
  }

  // 7. Max duration
  if (tc.max_duration_seconds != null) {
    const passed = durationSec <= tc.max_duration_seconds
    results.push({
      name: 'max_duration',
      passed,
      detail: passed
        ? `Duration ${durationSec}s <= maximum ${tc.max_duration_seconds}s`
        : `Duration ${durationSec}s exceeds maximum ${tc.max_duration_seconds}s`,
    })
  }

  // 8. No errors (basic: check transcript for error indicators)
  const errorIndicators = ['i\'m sorry, i\'m having technical difficulties', 'system error', 'i cannot connect']
  const hasError = errorIndicators.some(e => transcript.includes(e))
  results.push({
    name: 'no_errors',
    passed: !hasError,
    detail: hasError
      ? 'Transcript contains error/technical difficulty indicators'
      : 'No error indicators found in transcript',
  })

  return results
}

Deno.serve(async (req) => {
  try {
    const { test_run_id } = await req.json()
    if (!test_run_id) {
      return new Response(JSON.stringify({ error: 'test_run_id required' }), { status: 400 })
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Load test run
    const { data: run, error: runErr } = await db
      .from('test_runs')
      .select('*, test_cases(*)')
      .eq('id', test_run_id)
      .single()

    if (runErr || !run) {
      return new Response(JSON.stringify({ error: 'Test run not found' }), { status: 404 })
    }

    if (run.status === 'passed' || run.status === 'failed') {
      return new Response(JSON.stringify({ message: 'Already evaluated', run_id: test_run_id }), { status: 200 })
    }

    // If call is still in-progress, defer — Python agent hasn't saved transcript/duration yet
    if (run.call_record_id) {
      const { data: liveCheck } = await db.from('call_records').select('status, duration_seconds').eq('id', run.call_record_id).single()
      if (liveCheck?.status === 'in-progress') {
        return new Response(JSON.stringify({ message: 'Call still in progress, evaluation deferred', run_id: test_run_id }), { status: 200 })
      }
    }

    const tc = run.test_cases

    // Load call record
    let callRecord: any = null
    if (run.call_record_id) {
      const { data } = await db
        .from('call_records')
        .select('id, status, transcript, transcript_with_tool_calls, duration_seconds, started_at, ended_at, call_sid, livekit_room_id')
        .eq('id', run.call_record_id)
        .single()
      callRecord = data
    }

    if (!callRecord) {
      // Try to find by test_run_id first (outbound calls set this directly)
      const { data: byRunId } = await db
        .from('call_records')
        .select('id, status, transcript, transcript_with_tool_calls, duration_seconds, started_at, ended_at, call_sid, livekit_room_id')
        .eq('test_run_id', test_run_id)
        .maybeSingle()
      if (byRunId) {
        callRecord = byRunId
        await db.from('test_runs').update({ call_record_id: byRunId.id }).eq('id', test_run_id)
      }
    }

    if (!callRecord && tc.agent_id) {
      // For inbound tests: the test number called the agent — match by caller_number = test_phone_number
      // and service_number = one of agent's numbers, within 5 min of test run start
      const { data: configRow } = await db.from('test_framework_config').select('test_phone_number').eq('id', 1).single()
      const testNumber = configRow?.test_phone_number
      if (testNumber && run.started_at) {
        const windowStart = new Date(new Date(run.started_at).getTime() - 30000).toISOString()
        const windowEnd = new Date(new Date(run.started_at).getTime() + 300000).toISOString()
        // Only match call records not already linked to a different test run
        const { data: byCallerMatch } = await db
          .from('call_records')
          .select('id, status, transcript, transcript_with_tool_calls, duration_seconds, started_at, ended_at, call_sid, livekit_room_id')
          .eq('caller_number', testNumber)
          .gte('started_at', windowStart)
          .lte('started_at', windowEnd)
          .or(`test_run_id.is.null,test_run_id.eq.${test_run_id}`)
          .order('started_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (byCallerMatch) {
          callRecord = byCallerMatch
          await db.from('test_runs').update({ call_record_id: byCallerMatch.id }).eq('id', test_run_id)
          await db.from('call_records').update({ test_run_id }).eq('id', byCallerMatch.id)
          console.log(`Matched call record ${byCallerMatch.id} to test run ${test_run_id} by caller number`)
        }
      }
    }

    // Collect Render logs if we have a time window
    let renderLogs: any[] = []
    if (callRecord?.started_at && RENDER_API_KEY) {
      const startAt = callRecord.started_at
      const endAt = callRecord.ended_at || new Date().toISOString()
      renderLogs = await fetchRenderLogs(startAt, endAt)
    }

    // Collect SignalWire call details
    const swLogs: any[] = callRecord
      ? [{
          event: callRecord.status || 'unknown',
          call_sid: callRecord.call_sid,
          duration_seconds: callRecord.duration_seconds,
          started_at: callRecord.started_at,
          ended_at: callRecord.ended_at,
        }]
      : []

    const logs = {
      signalwire: swLogs,
      render: renderLogs,
      call_record_id: callRecord?.id || null,
    }

    // Evaluate assertions
    const assertions = evaluateAssertions(tc, callRecord)
    const allPassed = assertions.every(a => a.passed)
    const newStatus = allPassed ? 'passed' : 'failed'

    // Update test run
    await db.from('test_runs').update({
      status: newStatus,
      completed_at: new Date().toISOString(),
      logs,
      assertions,
    }).eq('id', test_run_id)

    console.log(`Test run ${test_run_id}: ${newStatus} (${assertions.filter(a => a.passed).length}/${assertions.length} passed)`)

    // Auto-trigger AI analysis on failure
    if (!allPassed) {
      const analyzePromise = fetch(`${SUPABASE_URL}/functions/v1/test-ai-analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_run_id }),
      }).catch(err => console.error('Failed to trigger test-ai-analyze:', err))
      // deno-lint-ignore no-explicit-any
      ;(globalThis as any).EdgeRuntime?.waitUntil(analyzePromise)
    }

    return new Response(JSON.stringify({
      success: true,
      status: newStatus,
      passed: assertions.filter(a => a.passed).length,
      total: assertions.length,
      assertions,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('test-log-collector error:', e)
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
