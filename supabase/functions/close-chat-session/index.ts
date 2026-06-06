// POST /functions/v1/close-chat-session
//
// Closes a chat session and fires chat.session.completed.
// Auth: widget can call with { sessionId, widgetKey }; portal/API can call
// with Authorization (JWT or mgp_ API key) and { sessionId }.
//
// Idempotent: closing an already-closed session is a no-op (returns 200).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { closeChatSessionAndDispatch, type ChatEndReason } from '../_shared/chat-session-close.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const { sessionId, widgetKey, reason } = await req.json()

    if (!sessionId || typeof sessionId !== 'string') {
      return json({ error: 'sessionId required' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Load the session for ownership check.
    const { data: session, error: sErr } = await supabase
      .from('chat_sessions')
      .select('id, user_id, widget_id')
      .eq('id', sessionId)
      .single()

    if (sErr || !session) return json({ error: 'session not found' }, 404)

    // Authorise: widgetKey path OR JWT/API-key path.
    let authorised = false

    if (widgetKey) {
      const { data: widget } = await supabase
        .from('chat_widgets')
        .select('id')
        .eq('widget_key', widgetKey)
        .eq('is_active', true)
        .single()
      if (widget && widget.id === session.widget_id) authorised = true
    }

    if (!authorised) {
      const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      })
      const user = await resolveUser(req, anonClient)
      if (user && user.id === session.user_id) authorised = true
    }

    if (!authorised) return json({ error: 'unauthorized' }, 401)

    // Default reason for the visitor-close endpoint is visitor_closed; allow
    // override (e.g. "manual_close" from the portal).
    const closeReason: ChatEndReason = reason === 'manual_close' ? 'manual_close' : 'visitor_closed'

    const result = await closeChatSessionAndDispatch(supabase, sessionId, closeReason)
    return json({ success: true, ...result }, 200)
  } catch (error) {
    console.error('close-chat-session error:', error)
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
