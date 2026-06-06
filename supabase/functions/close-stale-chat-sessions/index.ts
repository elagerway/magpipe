// Cron worker: closes chat sessions inactive for >= 30 minutes.
// Triggered by pg_cron via process_close_stale_chat_sessions() (see
// 20260501_webhook_events_expansion.sql).
//
// Runs at most every minute; idempotent (already-closed sessions are skipped
// by closeChatSessionAndDispatch).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { closeChatSessionAndDispatch } from '../_shared/chat-session-close.ts'

const INACTIVITY_THRESHOLD_MIN = 30
const MAX_SESSIONS_PER_RUN = 100  // safety cap

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const cutoff = new Date(Date.now() - INACTIVITY_THRESHOLD_MIN * 60 * 1000).toISOString()

    const { data: stale, error } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('status', 'active')
      .is('ended_at', null)
      .lt('last_message_at', cutoff)
      .limit(MAX_SESSIONS_PER_RUN)

    if (error) {
      console.error('close-stale-chat-sessions: query failed', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    const sessions = stale ?? []
    let closed = 0
    let skipped = 0

    for (const s of sessions) {
      const result = await closeChatSessionAndDispatch(supabase, s.id, 'inactivity')
      if (result.closed) closed++
      else skipped++
    }

    console.log(`close-stale-chat-sessions: scanned=${sessions.length} closed=${closed} skipped=${skipped}`)
    return new Response(
      JSON.stringify({ scanned: sessions.length, closed, skipped }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('close-stale-chat-sessions error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500 }
    )
  }
})
