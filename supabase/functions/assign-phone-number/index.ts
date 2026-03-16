import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

/**
 * POST /functions/v1/assign-phone-number
 *
 * Assign an existing phone number to an agent.
 *
 * Body:
 *   phone_number   string  required  E.164 number to assign (must belong to the user)
 *   agent_id       string  required  Agent to assign to
 *   channel        string  optional  "inbound" | "outbound" | "sms" — defaults to agent type
 *
 * The channel determines which slot is written:
 *   inbound  → agent_id
 *   outbound → outbound_agent_id
 *   sms      → text_agent_id
 *
 * If channel is omitted, it is inferred from the agent's agent_type:
 *   outbound_voice → outbound
 *   text           → sms
 *   everything else → inbound
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const user = await resolveUser(req, supabaseClient)
    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Unauthorized' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let body: any
    try { body = await req.json() } catch {
      return new Response(
        JSON.stringify({ error: { code: 'invalid_body', message: 'Request body must be valid JSON' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const { phone_number, agent_id, channel } = body

    if (!phone_number || !agent_id) {
      return new Response(
        JSON.stringify({ error: { code: 'missing_params', message: 'phone_number and agent_id are required' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const serviceRole = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify the number belongs to this user
    const { data: svcNum } = await serviceRole
      .from('service_numbers')
      .select('id')
      .eq('phone_number', phone_number)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!svcNum) {
      return new Response(
        JSON.stringify({ error: { code: 'not_found', message: 'Phone number not found or does not belong to your account' } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the agent belongs to this user
    const { data: agent } = await serviceRole
      .from('agent_configs')
      .select('id, agent_type')
      .eq('id', agent_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!agent) {
      return new Response(
        JSON.stringify({ error: { code: 'not_found', message: 'Agent not found or does not belong to your account' } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resolve column from explicit channel or agent type
    const resolvedChannel = channel || (
      agent.agent_type === 'outbound_voice' ? 'outbound' :
      agent.agent_type === 'text' ? 'sms' :
      'inbound'
    )

    const columnMap: Record<string, string> = {
      inbound: 'agent_id',
      outbound: 'outbound_agent_id',
      sms: 'text_agent_id',
    }

    const column = columnMap[resolvedChannel]
    if (!column) {
      return new Response(
        JSON.stringify({ error: { code: 'invalid_channel', message: 'channel must be "inbound", "outbound", or "sms"' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { error } = await serviceRole
      .from('service_numbers')
      .update({ [column]: agent.id, is_active: true })
      .eq('id', svcNum.id)

    if (error) {
      console.error('assign-phone-number update error:', error)
      return new Response(
        JSON.stringify({ error: { code: 'db_error', message: 'Failed to assign number' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, phone_number, agent_id, channel: resolvedChannel, is_active: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('assign-phone-number error:', err)
    return new Response(
      JSON.stringify({ error: { code: 'internal', message: String(err.message || err) } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
