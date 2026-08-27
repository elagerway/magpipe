-- Batched "last message per chat session" lookup for the inbox.
-- Replaces the N+1 in ChatSession.getRecentWithPreview (one chat_messages
-- request per session, 30-50 parallel requests per inbox load).
--
-- security invoker: chat_messages RLS ("Users view own messages") applies,
-- so callers only get rows for sessions they own.
--
-- NOTE: applied manually to the live DB on 2026-07-07 (migration history is
-- frozen — do not `supabase db push`). This file is the record.

create or replace function public.get_chat_last_messages(p_session_ids uuid[])
returns table(session_id uuid, content text, role text, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (cm.session_id) cm.session_id, cm.content, cm.role, cm.created_at
  from chat_messages cm
  where cm.session_id = any(p_session_ids)
  order by cm.session_id, cm.created_at desc
$$;
