/**
 * test-ai-analyze — AI-powered diagnosis of test run failures.
 * Called automatically after test-log-collector on failures, or on-demand from the UI.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const body = await req.json()
    const { test_run_id } = body

    if (!test_run_id) {
      return new Response(JSON.stringify({ error: 'test_run_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Auth: accept service role key (auto-trigger) or user JWT/API key (on-demand)
    const authHeader = req.headers.get('Authorization') || ''
    const isServiceRole = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    if (!isServiceRole) {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      })
      const user = await resolveUser(req, anonClient)
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // Verify ownership
      const { data: run } = await db.from('test_runs').select('user_id').eq('id', test_run_id).single()
      if (!run || run.user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Load full test run context
    const { data: run, error: runErr } = await db
      .from('test_runs')
      .select('*, test_cases(*, test_suites(name))')
      .eq('id', test_run_id)
      .single()

    if (runErr || !run) {
      return new Response(JSON.stringify({ error: 'Test run not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Load call record for transcript
    let callRecord: any = null
    if (run.call_record_id) {
      const { data } = await db
        .from('call_records')
        .select('transcript, duration_seconds, status, call_sid, agent_id, disconnection_reason, call_summary')
        .eq('id', run.call_record_id)
        .single()
      callRecord = data
    }

    const tc = run.test_cases
    const assertions: any[] = run.assertions || []
    const failedAssertions = assertions.filter((a: any) => !a.passed)

    const prompt = `You are a QA engineer analyzing a failed automated call test for a voice AI agent platform.

TEST CASE:
- Name: ${tc.name}
- Description: ${tc.description || 'N/A'}
- Type: ${tc.type} (${tc.caller_mode} caller mode)
- Agent ID: ${tc.agent_id || 'N/A'}
- Suite: ${tc.test_suites?.name || 'N/A'}

TEST RUN STATUS: ${run.status}
Started: ${run.started_at || 'N/A'}
Completed: ${run.completed_at || 'N/A'}
Error message: ${run.error_message || 'none'}

FAILED ASSERTIONS:
${failedAssertions.map((a: any) => `- ${a.name}: ${a.detail}`).join('\n') || 'none'}

ALL ASSERTIONS:
${assertions.map((a: any) => `- [${a.passed ? 'PASS' : 'FAIL'}] ${a.name}: ${a.detail}`).join('\n')}

CALL RECORD:
- Status: ${callRecord?.status || 'not found'}
- Duration: ${callRecord?.duration_seconds ?? 'N/A'}s
- Disconnection reason: ${callRecord?.disconnection_reason || 'N/A'}
- Summary: ${callRecord?.call_summary || 'N/A'}
- Transcript (first 2000 chars):
${(callRecord?.transcript || '(no transcript)').substring(0, 2000)}

RENDER LOGS (if available):
${(run.logs?.render || []).slice(0, 20).map((l: any) => `[${l.level}] ${l.timestamp}: ${l.message}`).join('\n') || '(no render logs available)'}

Based on all of the above, provide:
1. A concise root cause explanation (2-3 sentences)
2. Your confidence level: high | medium | low
3. Up to 3 specific actionable fixes

Respond in this exact JSON format:
{
  "root_cause": "string",
  "confidence": "high|medium|low",
  "proposed_fixes": [
    {
      "title": "string",
      "description": "string",
      "file": "string or null",
      "action": "inspect|fix|monitor|configure"
    }
  ]
}`

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    let analysis: any = null
    let aiAnalysisText = ''
    let proposedFixes: any[] = []

    if (openaiRes.ok) {
      const result = await openaiRes.json()
      const content = result.choices?.[0]?.message?.content || '{}'
      try {
        analysis = JSON.parse(content)
        aiAnalysisText = analysis.root_cause || ''
        proposedFixes = analysis.proposed_fixes || []
      } catch {
        aiAnalysisText = content
      }
    } else {
      console.error('OpenAI error:', await openaiRes.text())
      aiAnalysisText = 'AI analysis unavailable — OpenAI request failed.'
    }

    // Save analysis to test run
    await db.from('test_runs').update({
      ai_analysis: aiAnalysisText,
      ai_proposed_fixes: proposedFixes,
    }).eq('id', test_run_id)

    return new Response(JSON.stringify({
      success: true,
      ai_analysis: aiAnalysisText,
      confidence: analysis?.confidence || 'low',
      ai_proposed_fixes: proposedFixes,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('test-ai-analyze error:', e)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
