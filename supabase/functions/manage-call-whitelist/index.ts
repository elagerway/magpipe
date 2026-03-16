/**
 * manage-call-whitelist — CRUD for per-agent call whitelist entries.
 *
 * GET    ?agent_id=<uuid>           → list entries for the agent
 * POST   { agent_id, caller_number, forward_to, label? }  → create entry
 * DELETE ?id=<uuid>                 → delete entry
 *
 * Deploy: ./scripts/deploy-functions.sh manage-call-whitelist
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveUser } from '../_shared/api-auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    const user = await resolveUser(req, anonClient);
    if (!user) {
      return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Unauthorized' } }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = user.authMethod === 'api_key'
      ? createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      : anonClient;

    const url = new URL(req.url);

    // ── GET: list whitelist entries for an agent ──────────────────────────
    if (req.method === 'GET') {
      const agentId = url.searchParams.get('agent_id');
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!agentId) {
        return new Response(JSON.stringify({ error: { code: 'missing_param', message: 'agent_id is required' } }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!UUID_RE.test(agentId)) {
        return new Response(JSON.stringify({ error: { code: 'invalid_param', message: 'agent_id must be a valid UUID' } }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('call_whitelist')
        .select('id, caller_number, forward_to, label, created_at')
        .eq('agent_id', agentId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return new Response(JSON.stringify({ entries: data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── POST: create a whitelist entry ────────────────────────────────────
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const { agent_id, caller_number, forward_to, label } = body;

      if (!agent_id || !caller_number || !forward_to) {
        return new Response(JSON.stringify({ error: { code: 'missing_param', message: 'agent_id, caller_number, and forward_to are required' } }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const UUID_RE_POST = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE_POST.test(agent_id)) {
        return new Response(JSON.stringify({ error: { code: 'invalid_param', message: 'agent_id must be a valid UUID' } }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const E164_RE = /^\+[1-9]\d{7,14}$/;
      if (!E164_RE.test(caller_number) || !E164_RE.test(forward_to)) {
        return new Response(JSON.stringify({ error: { code: 'invalid_param', message: 'caller_number and forward_to must be in E.164 format (e.g. +16045551234)' } }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify the agent belongs to this user
      const { data: agent } = await supabase
        .from('agent_configs')
        .select('id')
        .eq('id', agent_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!agent) {
        return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Agent not found' } }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('call_whitelist')
        .insert({ user_id: user.id, agent_id, caller_number, forward_to, label: label || null })
        .select('id, caller_number, forward_to, label, created_at')
        .single();

      if (error) {
        if (error.code === '23505') {
          return new Response(JSON.stringify({ error: { code: 'duplicate', message: 'A whitelist entry for this caller number already exists on this agent' } }), {
            status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw error;
      }

      return new Response(JSON.stringify({ entry: data }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── DELETE: remove a whitelist entry ──────────────────────────────────
    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!id) {
        return new Response(JSON.stringify({ error: { code: 'missing_param', message: 'id is required' } }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!UUID_RE.test(id)) {
        return new Response(JSON.stringify({ error: { code: 'invalid_param', message: 'id must be a valid UUID' } }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: deleted, error } = await supabase
        .from('call_whitelist')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id');

      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Entry not found' } }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: { code: 'method_not_allowed', message: 'Method not allowed' } }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('manage-call-whitelist error:', error);
    return new Response(JSON.stringify({ error: { code: 'server_error', message: error.message } }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
