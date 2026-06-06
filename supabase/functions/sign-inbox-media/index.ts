/**
 * Mint fresh signed URLs for inbound media (WhatsApp/MMS photos) for the inbox.
 *
 * Media lives in the private `whatsapp-media` bucket; the message records the
 * durable `path` in `metadata.media`. The signed URL stored/forwarded at receive
 * time expires (~7d), so the inbox calls this to re-sign from `path` on demand
 * (e.g. when an <img> 404s). Scoped to the caller's own messages.
 *
 * Input:  { message_ids: string[] }
 * Output: { media: { <message_id>: [{ url, mime_type, caption }] } }
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SIGN_TTL_SECONDS = 60 * 60 // 1h — just long enough to view

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const authed = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
  )
  const user = await resolveUser(req, authed)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const ids: string[] = Array.isArray(body?.message_ids) ? body.message_ids.slice(0, 200) : []
  if (!ids.length) return json({ media: {} })

  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: rows, error } = await service
    .from('sms_messages')
    .select('id, metadata')
    .in('id', ids)
    .eq('user_id', user.id)  // only the caller's own messages
  if (error) return json({ error: error.message }, 500)

  const media: Record<string, { url: string; mime_type: string | null; caption: string | null }[]> = {}
  for (const row of rows ?? []) {
    const items = row.metadata?.media
    if (!Array.isArray(items) || !items.length) continue
    const signed: { url: string; mime_type: string | null; caption: string | null }[] = []
    for (const item of items) {
      if (!item?.path) continue
      const { data } = await service.storage.from('whatsapp-media').createSignedUrl(item.path, SIGN_TTL_SECONDS)
      if (data?.signedUrl) signed.push({ url: data.signedUrl, mime_type: item.mime_type ?? null, caption: item.caption ?? null })
    }
    if (signed.length) media[row.id] = signed
  }

  return json({ media })
})
