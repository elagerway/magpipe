import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { resolveUser, sha256 } from '../_shared/api-auth.ts'

function generateApiKey(): string {
  const array = new Uint8Array(20) // 20 bytes = 40 hex chars
  crypto.getRandomValues(array)
  const hex = Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
  return `mgp_${hex}`
}

function generateWebhookSecret(): string {
  const array = new Uint8Array(32) // 32 bytes = 64 hex chars
  crypto.getRandomValues(array)
  const hex = Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
  return `whsec_${hex}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Authenticate user via Supabase JWT or mgp_ API key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const user = await resolveUser(req, supabaseClient)

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json().catch(() => ({}))
    const { action } = body

    // Use service role for DB operations (RLS policies use auth.uid() which requires JWT context)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    switch (action) {
      case 'generate': {
        const { name, webhook_url } = body
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return new Response(
            JSON.stringify({ error: 'Key name is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Validate webhook_url if provided
        if (webhook_url) {
          try {
            const parsed = new URL(webhook_url)
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              throw new Error('Invalid protocol')
            }
          } catch {
            return new Response(
              JSON.stringify({ error: 'Invalid webhook URL. Must be a valid HTTP/HTTPS URL.' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }

        // Limit number of active keys per user
        const { count } = await serviceClient
          .from('api_keys')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_active', true)

        if ((count ?? 0) >= 10) {
          return new Response(
            JSON.stringify({ error: 'Maximum of 10 active API keys allowed' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const fullKey = generateApiKey()
        const keyHash = await sha256(fullKey)
        const keyPrefix = fullKey.substring(0, 8) // "mgp_" + first 4 hex chars

        const insertData: Record<string, unknown> = {
          user_id: user.id,
          name: name.trim(),
          key_prefix: keyPrefix,
          key_hash: keyHash,
        }
        if (webhook_url) {
          insertData.webhook_url = webhook_url.trim()
          insertData.webhook_secret = generateWebhookSecret()
        }

        const { data: keyRecord, error: insertError } = await serviceClient
          .from('api_keys')
          .insert(insertData)
          .select('id, name, key_prefix, created_at, webhook_url, webhook_secret')
          .single()

        if (insertError) {
          console.error('Error creating API key:', insertError)
          return new Response(
            JSON.stringify({ error: 'Failed to create API key' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Return the full key only this once
        return new Response(
          JSON.stringify({
            key: fullKey,
            id: keyRecord.id,
            name: keyRecord.name,
            key_prefix: keyRecord.key_prefix,
            created_at: keyRecord.created_at,
            webhook_secret: keyRecord.webhook_secret || null,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'list': {
        const { data: keys, error: listError } = await serviceClient
          .from('api_keys')
          .select('id, name, key_prefix, created_at, last_used_at, is_active, webhook_url, webhook_secret')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (listError) {
          console.error('Error listing API keys:', listError)
          return new Response(
            JSON.stringify({ error: 'Failed to list API keys' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ keys: keys || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'revoke': {
        const { key_id } = body
        if (!key_id) {
          return new Response(
            JSON.stringify({ error: 'key_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { data: updated, error: revokeError } = await serviceClient
          .from('api_keys')
          .update({ is_active: false })
          .eq('id', key_id)
          .eq('user_id', user.id) // Ensure user owns this key
          .select('id')
          .single()

        if (revokeError || !updated) {
          return new Response(
            JSON.stringify({ error: 'API key not found or already revoked' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'update': {
        const { key_id: updateKeyId, webhook_url: updateWebhookUrl } = body
        if (!updateKeyId) {
          return new Response(
            JSON.stringify({ error: 'key_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Validate webhook_url if provided (allow null/empty to clear)
        if (updateWebhookUrl) {
          try {
            const parsed = new URL(updateWebhookUrl)
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              throw new Error('Invalid protocol')
            }
          } catch {
            return new Response(
              JSON.stringify({ error: 'Invalid webhook URL. Must be a valid HTTP/HTTPS URL.' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }

        // If setting a URL, check if key already has a secret; generate one if not
        const updateData: Record<string, unknown> = {
          webhook_url: updateWebhookUrl || null,
        }

        if (updateWebhookUrl) {
          // Check if key already has a secret
          const { data: existing } = await serviceClient
            .from('api_keys')
            .select('webhook_secret')
            .eq('id', updateKeyId)
            .eq('user_id', user.id)
            .single()

          if (!existing?.webhook_secret) {
            updateData.webhook_secret = generateWebhookSecret()
          }
        } else {
          // Clearing webhook URL also clears the secret
          updateData.webhook_secret = null
        }

        const { data: updatedKey, error: updateError } = await serviceClient
          .from('api_keys')
          .update(updateData)
          .eq('id', updateKeyId)
          .eq('user_id', user.id)
          .select('id, webhook_url, webhook_secret')
          .single()

        if (updateError || !updatedKey) {
          return new Response(
            JSON.stringify({ error: 'API key not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ success: true, webhook_url: updatedKey.webhook_url, webhook_secret: updatedKey.webhook_secret }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Use: generate, list, revoke, update' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Error in manage-api-keys:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
