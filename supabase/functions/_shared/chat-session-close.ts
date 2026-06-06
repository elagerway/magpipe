// Close a chat session: marks it ended, generates summary + extracted_data,
// fires chat.session.completed webhook. Idempotent — already-closed sessions
// are a no-op.
//
// Mirrors the voice-agent post-call pipeline (agent.py:generate_call_summary
// + extract_data_from_transcript) in TypeScript so chat sessions and calls
// produce comparable downstream data.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { dispatchWebhook } from './webhook-dispatcher.ts'

export type ChatEndReason = 'visitor_closed' | 'inactivity' | 'manual_close'

interface DynamicVariable {
  name: string
  description?: string | null
  var_type?: string | null
  enum_options?: string[] | null
  agent_id?: string | null
}

interface ChatMessageRow {
  role: 'visitor' | 'agent' | 'system'
  content: string
  created_at: string
}

export async function closeChatSessionAndDispatch(
  supabase: SupabaseClient,
  sessionId: string,
  reason: ChatEndReason
): Promise<{ closed: boolean; reason?: string }> {
  // Load the session.
  const { data: session, error: sessionErr } = await supabase
    .from('chat_sessions')
    .select('id, widget_id, user_id, agent_id, visitor_id, status, ended_at, created_at')
    .eq('id', sessionId)
    .single()

  if (sessionErr || !session) {
    console.warn(`🔔 closeChatSession: session ${sessionId} not found`)
    return { closed: false, reason: 'not_found' }
  }

  // Idempotent: if already ended, don't re-fire.
  if (session.ended_at || session.status === 'ended') {
    return { closed: false, reason: 'already_closed' }
  }

  // Load messages in chronological order.
  const { data: messages } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  const messageRows: ChatMessageRow[] = (messages ?? []) as ChatMessageRow[]

  // Generate summary + extracted_data in parallel.
  const dynamicVariables = await loadDynamicVariables(supabase, session.user_id, session.agent_id)
  const transcriptText = messageRows
    .map(m => `${m.role === 'visitor' ? 'Visitor' : 'Agent'}: ${m.content}`)
    .join('\n')

  const [summary, extractedData] = await Promise.all([
    generateChatSummary(transcriptText),
    extractChatData(transcriptText, dynamicVariables),
  ])

  const endedAt = new Date().toISOString()

  // Mark closed + persist summary/extraction. The .is('ended_at', null) guard
  // alone is not enough — a Supabase update with zero matching rows returns
  // no error, so a losing concurrent writer would still report success. Use
  // .select('id') and verify a row was actually updated.
  const { data: updated, error: updateErr } = await supabase
    .from('chat_sessions')
    .update({
      status: 'ended',
      ended_at: endedAt,
      ended_reason: reason,
      summary: summary || null,
      extracted_data: Object.keys(extractedData).length ? extractedData : null,
    })
    .eq('id', sessionId)
    .is('ended_at', null)  // race guard: only one close wins
    .select('id')

  if (updateErr) {
    console.error('🔔 closeChatSession: update failed', updateErr)
    return { closed: false, reason: 'update_failed' }
  }
  if (!updated || updated.length === 0) {
    // Another writer closed it between our SELECT and UPDATE. Don't dispatch
    // — the winner already did (or will).
    return { closed: false, reason: 'already_closed' }
  }

  // Fire webhook (fire-and-forget — never block the close).
  dispatchWebhook(supabase, session.user_id, 'chat.session.completed', {
    chat_session_id: session.id,
    widget_id: session.widget_id,
    agent_id: session.agent_id,
    visitor_id: session.visitor_id,
    started_at: session.created_at,
    ended_at: endedAt,
    message_count: messageRows.length,
    transcript: messageRows.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.created_at,
    })),
    summary: summary || null,
    extracted_data: Object.keys(extractedData).length ? extractedData : null,
    ended_reason: reason,
  }).catch(err => console.error('🔔 chat.session.completed dispatch failed:', err))

  return { closed: true }
}

async function loadDynamicVariables(
  supabase: SupabaseClient,
  userId: string,
  agentId: string | null
): Promise<DynamicVariable[]> {
  try {
    const { data } = await supabase
      .from('dynamic_variables')
      .select('name, description, var_type, enum_options, agent_id')
      .eq('user_id', userId)

    const all = (data ?? []) as DynamicVariable[]
    if (!agentId) return all
    return all.filter(v => v.agent_id === null || v.agent_id === agentId)
  } catch (e) {
    console.warn('Could not load dynamic variables for chat extraction:', e)
    return []
  }
}

async function generateChatSummary(transcriptText: string): Promise<string> {
  if (!transcriptText.trim()) return ''

  const visitorWords = transcriptText
    .split('\n')
    .filter(l => l.startsWith('Visitor:'))
    .map(l => l.slice('Visitor:'.length).trim())
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
    .length

  if (visitorWords === 0) return ''
  if (visitorWords < 10) return transcriptText  // too short for GPT — return raw

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return ''

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Summarize this website chat in exactly 3 short sentences. Focus on: who the visitor was, what they needed, and the outcome/next steps.

Transcript:
${transcriptText}

Provide only the 3-sentence summary, no additional text.`,
        }],
      }),
    })
    if (!res.ok) return ''
    const json = await res.json()
    return (json.choices?.[0]?.message?.content ?? '').trim()
  } catch (e) {
    console.warn('Chat summary generation failed:', e)
    return ''
  }
}

async function extractChatData(
  transcriptText: string,
  dynamicVariables: DynamicVariable[]
): Promise<Record<string, unknown>> {
  if (!transcriptText.trim()) return {}

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return {}

  let prompt: string
  if (dynamicVariables.length > 0) {
    const schema = dynamicVariables.map(v => ({
      name: v.name,
      description: v.description ?? '',
      type: v.var_type ?? 'text',
      ...(v.var_type === 'enum' && v.enum_options ? { allowed_values: v.enum_options } : {}),
    }))

    prompt = `Analyze this website chat transcript and extract the following information.
For each variable, provide a value based on what was discussed.
If a value cannot be determined from the transcript, use null.

Variables to extract:
${JSON.stringify(schema, null, 2)}

Transcript:
${transcriptText}

Respond with ONLY a valid JSON object containing the extracted values.
For boolean variables, use true/false.
For number variables, use numeric values.
For enum variables, use one of the allowed values or null.
For text variables, use a string value.`
  } else {
    prompt = `Analyze this website chat transcript and extract any relevant structured data.
Extract ONLY fields that are clearly mentioned. Omit fields with no information.

Common fields to look for (include only if present):
- visitor_name: The visitor's full name
- email: Email address mentioned
- phone: Phone number mentioned
- company: Company or organization name
- reason: Brief reason for the chat (1 sentence)
- action_items: List of follow-up actions discussed
- sentiment: Overall visitor sentiment (positive, neutral, negative)

Transcript:
${transcriptText}

Respond with ONLY a valid JSON object. Omit fields with no information.`
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return {}
    const json = await res.json()
    const raw = json.choices?.[0]?.message?.content ?? '{}'
    return JSON.parse(raw)
  } catch (e) {
    console.warn('Chat data extraction failed:', e)
    return {}
  }
}
