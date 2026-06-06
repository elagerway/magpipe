/**
 * test-runs — List and retrieve test runs.
 * Supports filtering by suite_id, test_case_id, or fetching a single run by id.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
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
    const url = new URL(req.url)

    const ok = (data: unknown) =>
      new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const err = (msg: string, status = 400) =>
      new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // GET single run by id
    const runId = url.searchParams.get('id')
    if (runId) {
      const { data: run, error } = await db
        .from('test_runs')
        .select(`
          *,
          test_cases(id, name, type, caller_mode, agent_id, suite_id, test_suites(name))
        `)
        .eq('id', runId)
        .eq('user_id', user.id)
        .single()
      if (error || !run) return err('Test run not found', 404)
      return ok({ run })
    }

    // GET runs by test_case_id
    const testCaseId = url.searchParams.get('test_case_id')
    if (testCaseId) {
      // Verify case belongs to user
      const { data: tc } = await db.from('test_cases').select('id').eq('id', testCaseId).eq('user_id', user.id).single()
      if (!tc) return err('Test case not found', 404)

      const { data: runs, error } = await db
        .from('test_runs')
        .select('id, status, started_at, completed_at, assertions, error_message, ai_analysis, call_record_id, triggered_by')
        .eq('test_case_id', testCaseId)
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(50)
      if (error) return err(error.message, 500)
      return ok({ runs })
    }

    // GET runs by suite_id (joins through test_cases)
    const suiteId = url.searchParams.get('suite_id')
    if (suiteId) {
      // Verify suite belongs to user
      const { data: suite } = await db.from('test_suites').select('id').eq('id', suiteId).eq('user_id', user.id).single()
      if (!suite) return err('Suite not found', 404)

      // Fetch latest run per test case in the suite
      const { data: cases } = await db.from('test_cases').select('id').eq('suite_id', suiteId).eq('user_id', user.id)
      if (!cases || cases.length === 0) return ok({ runs: [] })

      const caseIds = cases.map((c: any) => c.id)
      const { data: runs, error } = await db
        .from('test_runs')
        .select('id, test_case_id, status, started_at, completed_at, assertions, error_message, ai_analysis, call_record_id, triggered_by, test_cases(name, type)')
        .in('test_case_id', caseIds)
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(200)
      if (error) return err(error.message, 500)
      return ok({ runs })
    }

    // Default: list recent runs for the user
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
    const status = url.searchParams.get('status')

    let query = db
      .from('test_runs')
      .select('id, test_case_id, status, started_at, completed_at, error_message, ai_analysis, call_record_id, triggered_by, test_cases(name, type, suite_id, test_suites(name))')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: runs, error } = await query
    if (error) return err(error.message, 500)
    return ok({ runs })
  } catch (e: any) {
    console.error('test-runs error:', e)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
