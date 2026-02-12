/**
 * Shared API Auth Helper
 * Resolves either a Supabase JWT or a mgp_ API key to a user.
 */

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export interface ResolvedUser {
  id: string
  email?: string
  authMethod: 'jwt' | 'api_key'
}

/**
 * Resolve an Authorization header to a user.
 * Accepts both Supabase JWTs and mgp_ API keys.
 */
export async function resolveUser(
  req: Request,
  supabaseClient: SupabaseClient
): Promise<ResolvedUser | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const token = authHeader.replace('Bearer ', '')
  if (!token) return null

  // API key flow
  if (token.startsWith('mgp_')) {
    const keyHash = await sha256(token)

    // Use service role client to query api_keys (RLS won't work without a user context)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: keyRecord, error } = await serviceClient
      .from('api_keys')
      .select('id, user_id')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single()

    if (error || !keyRecord) return null

    // Update last_used_at (fire and forget)
    serviceClient
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRecord.id)
      .then(() => {})

    // Get user email
    const { data: userData } = await serviceClient
      .from('users')
      .select('email')
      .eq('id', keyRecord.user_id)
      .single()

    return {
      id: keyRecord.user_id,
      email: userData?.email,
      authMethod: 'api_key',
    }
  }

  // Standard Supabase JWT flow
  const { data: { user }, error } = await supabaseClient.auth.getUser(token)
  if (error || !user) return null

  return {
    id: user.id,
    email: user.email,
    authMethod: 'jwt',
  }
}

export { corsHeaders, sha256 }
