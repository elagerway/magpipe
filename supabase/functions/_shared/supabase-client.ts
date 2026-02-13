/**
 * Shared Supabase client utilities
 * Centralized client creation for edge functions
 */

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

let _serviceClient: SupabaseClient | null = null

/**
 * Get a Supabase client with the service role key (admin access).
 * Singleton per Deno isolate — safe to call multiple times.
 */
export function getServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    _serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
  }
  return _serviceClient
}

/**
 * Get a Supabase client scoped to the requesting user via their JWT.
 * Creates a new client each time (user context varies per request).
 */
export function getAnonClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  )
}
