/**
 * run-test — Fire a test run for a test case.
 * Creates a test_run record, then initiates the call (inbound simulation or outbound).
 * Credits are charged via the normal billing path when the call completes.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { checkBalance } from '../_shared/balance-check.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    })
    const user = await resolveUser(req, anonClient)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { test_case_id } = await req.json()
    if (!test_case_id) {
      return new Response(JSON.stringify({ error: 'test_case_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Load test case (must belong to user)
    const { data: tc, error: tcErr } = await db.from('test_cases').select('*').eq('id', test_case_id).eq('user_id', user.id).single()
    if (tcErr || !tc) {
      return new Response(JSON.stringify({ error: 'Test case not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check credit balance
    const { allowed, balance } = await checkBalance(db, user.id)
    if (!allowed) {
      return new Response(JSON.stringify({ error: `Insufficient credits ($${balance.toFixed(2)})` }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Load test phone number from config
    const { data: config } = await db.from('test_framework_config').select('test_phone_number').eq('id', 1).single()
    const testNumber = config?.test_phone_number
    if (!testNumber) {
      return new Response(JSON.stringify({ error: 'Test phone number not configured. Set it in Admin → Tests.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Load agent's service number
    let serviceNumber: string | null = null
    if (tc.agent_id) {
      const { data: svcNum } = await db.from('service_numbers').select('phone_number').eq('agent_id', tc.agent_id).eq('is_active', true).limit(1).single()
      serviceNumber = svcNum?.phone_number || null
    }

    if (tc.type === 'inbound_call' && !serviceNumber) {
      return new Response(JSON.stringify({ error: 'Agent has no assigned phone number for inbound test' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create test run record
    const { data: run, error: runErr } = await db.from('test_runs').insert({
      test_case_id: tc.id,
      user_id: user.id,
      triggered_by: user.id,
      status: 'running',
    }).select().single()

    if (runErr || !run) {
      return new Response(JSON.stringify({ error: 'Failed to create test run: ' + runErr?.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Test run ${run.id} created for case ${tc.id} (type: ${tc.type})`)

    // Fire the call — delegate to initiate-bridged-call or inbound simulation
    let callResult: any = null
    let callError: string | null = null

    if (tc.type === 'outbound_call') {
      // Agent places call to test number
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/initiate-bridged-call`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: testNumber,
          caller_id: serviceNumber,
          user_id: user.id,
          purpose: `Test run: ${tc.name}`,
        }),
      })
      const data = await resp.json()
      if (resp.ok && data.call_record_id) {
        callResult = data
        // Link call record to test run
        await db.from('call_records').update({ test_run_id: run.id }).eq('id', data.call_record_id)
        await db.from('test_runs').update({ call_record_id: data.call_record_id }).eq('id', run.id)
      } else {
        callError = data.error || 'Failed to initiate outbound call'
      }
    } else if (tc.type === 'inbound_call') {
      // Simulate caller: test number calls agent's service number
      const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
      const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
      const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')
      if (!signalwireProjectId || !signalwireToken || !signalwireSpaceUrl) {
        callError = 'SignalWire credentials not configured'
      } else {
        const auth = btoa(`${signalwireProjectId}:${signalwireToken}`)
        // SWML URL for test caller behaviour
        const swmlUrl = `${SUPABASE_URL}/functions/v1/test-caller-swml?run_id=${run.id}`
        const statusCallbackUrl = `${SUPABASE_URL}/functions/v1/test-call-status?run_id=${run.id}`
        const formBody = [
          `To=${encodeURIComponent(serviceNumber!)}`,
          `From=${encodeURIComponent(testNumber)}`,
          `Url=${encodeURIComponent(swmlUrl)}`,
          `Method=POST`,
          `StatusCallback=${encodeURIComponent(statusCallbackUrl)}`,
          `StatusCallbackMethod=POST`,
        ].join('&')
        const resp = await fetch(`https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Calls.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formBody,
        })
        const data = await resp.json()
        if (resp.ok && data.sid) {
          callResult = { call_sid: data.sid }
          // Store caller CallSid so log-collector can match without time-window ambiguity
          await db.from('test_runs').update({ caller_call_sid: data.sid }).eq('id', run.id)
          console.log(`Inbound test call placed: ${data.sid}`)
        } else {
          callError = data.message || 'Failed to place inbound test call'
        }
      }
    } else if (tc.type === 'agent_to_agent') {
      // Caller agent calls agent under test — caller agent is assigned to test number
      // For now initiate outbound from agent to test number (same as outbound_call)
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/initiate-bridged-call`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: testNumber,
          caller_id: serviceNumber,
          user_id: user.id,
          purpose: `Agent-to-agent test: ${tc.name}`,
        }),
      })
      const data = await resp.json()
      if (resp.ok && data.call_record_id) {
        callResult = data
        await db.from('call_records').update({ test_run_id: run.id }).eq('id', data.call_record_id)
        await db.from('test_runs').update({ call_record_id: data.call_record_id }).eq('id', run.id)
      } else {
        callError = data.error || 'Failed to initiate agent-to-agent call'
      }
    }

    if (callError) {
      await db.from('test_runs').update({ status: 'error', error_message: callError, completed_at: new Date().toISOString() }).eq('id', run.id)
      return new Response(JSON.stringify({ error: callError }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, run_id: run.id, ...callResult }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('run-test error:', e)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
