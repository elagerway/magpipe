/**
 * test-cases — CRUD for test suites and test cases
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

    let action: string | null = null
    let body: any = {}
    if (req.method === 'GET') {
      action = url.searchParams.get('action')
    } else {
      body = await req.json().catch(() => ({}))
      action = body.action ?? null
    }

    const ok = (data: unknown) =>
      new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const err = (msg: string, status = 400) =>
      new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // --- Suites ---

    if (action === 'list_suites') {
      const { data, error } = await db.from('test_suites').select('*, test_cases(count)').eq('user_id', user.id).order('created_at', { ascending: false })
      if (error) return err(error.message, 500)
      return ok({ suites: data })
    }

    if (action === 'create_suite') {
      const { name, description } = body
      if (!name) return err('name required')
      const { data, error } = await db.from('test_suites').insert({ user_id: user.id, name, description }).select().single()
      if (error) return err(error.message, 500)
      return ok({ suite: data })
    }

    if (action === 'update_suite') {
      const { suite_id, name, description } = body
      if (!suite_id) return err('suite_id required')
      const { data, error } = await db.from('test_suites').update({ name, description }).eq('id', suite_id).eq('user_id', user.id).select().single()
      if (error) return err(error.message, 500)
      return ok({ suite: data })
    }

    if (action === 'delete_suite') {
      const { suite_id } = body
      if (!suite_id) return err('suite_id required')
      const { error } = await db.from('test_suites').delete().eq('id', suite_id).eq('user_id', user.id)
      if (error) return err(error.message, 500)
      return ok({ success: true })
    }

    // --- Cases ---

    if (action === 'list_cases') {
      const suite_id = url.searchParams.get('suite_id') || body.suite_id
      if (!suite_id) return err('suite_id required')
      const { data, error } = await db.from('test_cases').select('*').eq('suite_id', suite_id).eq('user_id', user.id).order('created_at', { ascending: true })
      if (error) return err(error.message, 500)
      return ok({ cases: data })
    }

    if (action === 'create_case') {
      const { suite_id, name, description, type, agent_id, caller_mode, caller_agent_id, caller_script,
              expected_phrases, prohibited_phrases, expected_functions, min_duration_seconds, max_duration_seconds, schedule } = body
      if (!suite_id || !name) return err('suite_id and name required')
      // Verify suite belongs to user
      const { data: suite } = await db.from('test_suites').select('id').eq('id', suite_id).eq('user_id', user.id).single()
      if (!suite) return err('Suite not found', 404)
      const { data, error } = await db.from('test_cases').insert({
        suite_id, user_id: user.id, name, description, type: type || 'inbound_call',
        agent_id, caller_mode: caller_mode || 'silent', caller_agent_id, caller_script,
        expected_phrases, prohibited_phrases, expected_functions,
        min_duration_seconds, max_duration_seconds, schedule,
      }).select().single()
      if (error) return err(error.message, 500)
      return ok({ case: data })
    }

    if (action === 'update_case') {
      const { case_id, ...updates } = body
      if (!case_id) return err('case_id required')
      const allowed = ['name','description','type','agent_id','caller_mode','caller_agent_id','caller_script',
                       'expected_phrases','prohibited_phrases','expected_functions','min_duration_seconds',
                       'max_duration_seconds','schedule','is_active']
      const filtered = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))
      filtered.updated_at = new Date().toISOString()
      const { data, error } = await db.from('test_cases').update(filtered).eq('id', case_id).eq('user_id', user.id).select().single()
      if (error) return err(error.message, 500)
      return ok({ case: data })
    }

    if (action === 'delete_case') {
      const { case_id } = body
      if (!case_id) return err('case_id required')
      const { error } = await db.from('test_cases').delete().eq('id', case_id).eq('user_id', user.id)
      if (error) return err(error.message, 500)
      return ok({ success: true })
    }

    return err('Unknown action', 400)
  } catch (e: any) {
    console.error('test-cases error:', e)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
