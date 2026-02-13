/**
 * Shared CORS utilities
 * Centralized CORS headers used across all edge functions
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

/**
 * Handle CORS preflight request
 */
export function handleCors(): Response {
  return new Response('ok', { headers: corsHeaders })
}
