/**
 * Shared response utilities
 * Standardized JSON responses for edge functions
 */

import { corsHeaders } from './cors.ts'

/**
 * Create a JSON success response
 */
export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

/**
 * Create a JSON error response
 */
export function errorResponse(message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}
